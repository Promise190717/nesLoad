/*
 * 后台游戏 CRUD —— Supabase（Postgres）版。
 *
 * 这是 `./games.ts`（D1 那套）被删掉之后**唯一**的写路径。读路径在 `./sb-games.ts`，
 * 两边共用同一套表结构，但**刻意分成两个文件**：
 *   · `sb-games.ts` 全是 `cached()` 包着的读函数，页面那边 import 它；
 *   · 这个文件**一行缓存都没有** —— 后台传完要立刻看到，而且写完之后统一
 *     `revalidateTag('games')` 去刷前台的缓存（缓存留在页侧，不下沉到写路径）。
 *
 * ---------------------------------------------------------------------------
 * 与 D1 那套的差别（表结构换了，逻辑大幅简化）
 *
 * · **`slug` 就是主键**，没有 UUID、也没有 `group_key`。
 *   D1 那边「一行 = 一盘 ROM」，同款四个语言版本是四行，靠 `group_key` 再聚回去，
 *   于是插入前要先 `resolveGroupKey` 反查「这一盘该挂到哪一款上」。
 *   这里「一行 = 一款游戏」，多语言 ROM 在 `game_roms` 里，**同款的判据变成了
 *   「同 slug」** —— 反查从「算出并维护一个聚合键」退化成「按中文标题 + 机种找一行」。
 *
 * · **判重（`findGameDuplicate`）的口径不变**（同名 + 同机种 + 同语言），但实现从
 *   `CROSS JOIN + COLLATE NOCASE` 那一套索引调优，变成一句
 *   `lower(t.title) = lower(?)` + 一个 `EXISTS` 查 `game_roms`。
 *   语言那一维现在挂在 ROM 上（不再是 `games.language` 列）。
 *
 * · **`series` / `developer` 不再是文案快照**。D1 那边 `game_texts` 里存了一份厂名 /
 *   系列名的副本，改一次名要级联改四行；这里 `games.developer_slug` / `series_slug`
 *   是外键，名字从 `developer_texts` / `series_texts` JOIN 出来。
 *   代价：后台表单里那个**自由文本的系列**要先落到 `series` 表（见 `resolveSeries`）。
 *
 * · **`language` 是 ROM 的属性**，`game_roms.language` 是主键的一半 ⇒ **不能为 NULL**。
 *   后台表单允许「未指定」，这里统一收敛成哨兵值 `'und'`（见 `ROM_LANGUAGE_UNSET`）：
 *   前台的语言筛选条只认 `GAME_LANGUAGE_VALUES` 那四个（`romLanguageOptions` 会把它滤掉），
 *   但 `pickDefaultRom` 的兜底仍会取到它，所以「未指定语言」的游戏照样能玩。
 */

import { randomUUID } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import type { ConsoleType } from '@/lib/emulator';
import { CONTENT_LOCALES, isBlankGameText, type GameTexts } from '@/lib/game-text';
import { getDeveloper } from './developers';
import { query } from './pg';
import { getGame, loadGamesBySlugs, MAX_PAGE_SIZE, type Game } from './sb-games';

export { MAX_PAGE_SIZE };

/**
 * 「没标语言」的哨兵值。
 *
 * 为什么不干脆让 `game_roms.language` 可空：它是复合主键的一半，SQL 主键列不能为 NULL。
 * 为什么不用空串：空串在 `?lang=` 的查询里和「没传」分不开。
 * `'und'` 是 ISO 639-2 的 undetermined，语义正好。
 */
export const ROM_LANGUAGE_UNSET = 'und';

/** 把后台表单的 `language`（可能是 `''` / null）收敛成库里能存的值。 */
export function normalizeRomLanguage(value: string | null | undefined): string {
  const text = (value ?? '').trim();
  return text || ROM_LANGUAGE_UNSET;
}

/* ── 后台列表 ──────────────────────────────────────────────────────────── */

/**
 * 后台列表的一行 = `Game` 再加一个**同款的盘数**。
 *
 * ⚠️ 名字沿用 D1 时代的 `groupSize`（`components/AdminGames.tsx` 读的就是它），
 *    但**含义变了**：那边是「共用同一份文案的 ROM 条数」，这边是
 *    「这一款有几个语言版本的 ROM」。在「一行 = 一款」的模型里，
 *    「改文案会波及谁」这个问题不存在了 —— 改的就是这一款自己。
 *    留着这个字段是为了让前端那行提示能说清「这款有 N 个语言版本」。
 */
export interface AdminGame extends Game {
  /** 这一款的 ROM 条数（语言版本数），至少 1。 */
  groupSize: number;
}

/** `listAdminGamesPage` 的返回。没有 total —— 后台分页控件不需要它。 */
export interface AdminGamePage {
  games: AdminGame[];
  /** 往后翻的游标；null = 后面没有了。 */
  nextCursor: string | null;
  hasMore: boolean;
}

/** 游标 = `createdAt:slug`。slug 里不会有冒号，按**第一个**冒号切就够。 */
function encodeGameCursor(game: Pick<Game, 'createdAt' | 'id'>): string {
  return `${game.createdAt}:${game.id}`;
}

function decodeGameCursor(raw: string | null | undefined): { createdAt: number; slug: string } | null {
  if (!raw) return null;
  const at = raw.indexOf(':');
  if (at <= 0) return null;
  const createdAt = Number(raw.slice(0, at));
  const slug = raw.slice(at + 1);
  if (!Number.isFinite(createdAt) || !slug) return null;
  return { createdAt, slug };
}

/**
 * 后台列表的**游标翻页** —— 没有 COUNT、没有 OFFSET（2026-10-14 用户拍板，沿用）。
 *
 * 排序键 `(created_at DESC, slug DESC)`：`created_at` 撞值是常态（同一批爬进来的是同一秒），
 * 第二键保证跨查询顺序稳定，不会出现「同一条在第 1 页和第 2 页各出现一次」。
 *
 * ⚠️ 时间比较写 `to_timestamp(?::float8 / 1000)`：游标里存的是**毫秒时间戳**（对外形状没变），
 *    而库里是 `timestamptz`。`?::float8` 那个显式转换不能省 —— 参数没类型上下文时
 *    Postgres 会按 text 处理，`to_timestamp(text)` 不存在。
 *
 * ⚠️ 这里**只取 slug + 盘数**，文案和 ROM 由 `loadGamesBySlugs` 批量补（一次 IN + 两次查询）。
 *    一页最多 100 行，拼成一条大 JOIN 反而更难读。
 */
export async function listAdminGamesPage(
  cursor: string | null,
  limit: number,
  { keyword = '' }: { keyword?: string } = {}
): Promise<AdminGamePage> {
  const decoded = decodeGameCursor(cursor);
  const needle = keyword.trim();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (needle) {
    /* 关键词走 EXISTS：一款有四条文案行，JOIN 会把它复制四遍（同 sb-games 的 buildWhere） */
    conditions.push(
      `EXISTS (SELECT 1 FROM game_texts t WHERE t.game_slug = g.slug
                AND (t.title ILIKE ? OR t.description ILIKE ?))`
    );
    params.push(`%${needle}%`, `%${needle}%`);
  }
  if (decoded) {
    conditions.push(
      `(g.created_at < to_timestamp(?::float8 / 1000)
        OR (g.created_at = to_timestamp(?::float8 / 1000) AND g.slug < ?))`
    );
    params.push(decoded.createdAt, decoded.createdAt, decoded.slug);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  /* 多取一条判断 hasMore，不发 COUNT（同 comments.ts 的路数） */
  const rows = await query<{ slug: string; rom_count: number }>(
    `SELECT g.slug,
            (SELECT COUNT(*)::int FROM game_roms r WHERE r.game_slug = g.slug) AS rom_count
       FROM games g ${where}
      ORDER BY g.created_at DESC, g.slug DESC
      LIMIT ?`,
    [...params, limit + 1]
  );

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  /*
   * 顺序以 SQL 的 ORDER BY 为准：`loadGamesBySlugs` 会按入参重排，
   * 而 `IN (…)` 在 Postgres 里是不保证顺序的 —— 别直接拿查询结果的顺序用。
   */
  const games = await loadGamesBySlugs(page.map((row) => row.slug));
  const counts = new Map(page.map((row) => [row.slug, Number(row.rom_count ?? 1)]));

  const items: AdminGame[] = games.map((game) => ({
    ...game,
    groupSize: counts.get(game.id) ?? 1,
  }));
  const last = items[items.length - 1];

  return { games: items, hasMore, nextCursor: hasMore && last ? encodeGameCursor(last) : null };
}

/* ── 判重 ──────────────────────────────────────────────────────────────── */

/**
 * 判重：**同名（中文原文，忽略 ASCII 大小写）+ 同机种 + 同语言**。
 *
 * 三条判据的理由（2026-10-13 / 10-15 用户拍板，沿用）：
 *  - 只比中文那份标题：英文 / 日韩标题不参与 —— 「同名」按站内主名字算。
 *  - 机种必须相同：一堆游戏在 NES / SFC / GB / 街机上各有一版，那是**几款不同的游戏**，
 *    只按名字拦会把它们全挡在门外。
 *  - 语言必须相同：同一款的日版 / 美版 / 中文版是几个合法版本，只按名字拦同样会全挡。
 *
 * ⚠️ 语言那一维现在查的是 `game_roms`（`EXISTS`），不再是 `games.language` 列 ——
 *    新模型里「这款有没有中文版」就是「`game_roms` 里有没有 `language = 'zh'` 那一行」。
 *
 * `consoleType` 传 `null` 时这一维不参与比较（还不知道机种的场合）。
 * `excludeId` 是给**修改**用的：那条记录当然和自己同名，不排掉自己改个年份都会被拦。
 *
 * 返回里的 `language` 是命中的那一款**默认 ROM 的语言**（给后台提示用）。
 */
export async function findGameDuplicate(
  title: string,
  language: string | null,
  consoleType: ConsoleType | null = null,
  excludeId: string | null = null
): Promise<{ id: string; title: string; language: string | null } | null> {
  const conditions = ['lower(t.title) = lower(?)'];
  const params: unknown[] = [title.trim()];

  if (consoleType) {
    conditions.push('g.console_type = ?');
    params.push(consoleType);
  }
  if (language) {
    conditions.push(
      'EXISTS (SELECT 1 FROM game_roms r WHERE r.game_slug = g.slug AND r.language = ?)'
    );
    params.push(language);
  }
  if (excludeId) {
    conditions.push('g.slug <> ?');
    params.push(excludeId);
  }

  const rows = await query<{ id: string; title: string; language: string | null }>(
    `SELECT g.slug AS id, t.title AS title,
            (SELECT r.language FROM game_roms r WHERE r.game_slug = g.slug
              ORDER BY CASE r.language
                         WHEN 'zh' THEN 1 WHEN 'en' THEN 2 WHEN 'ja' THEN 3 WHEN 'ko' THEN 4
                         ELSE 9 END
              LIMIT 1) AS language
       FROM games g
       JOIN game_texts t ON t.game_slug = g.slug AND t.locale = 'zh'
      WHERE ${conditions.join(' AND ')}
      LIMIT 1`,
    params
  );
  return rows[0] ?? null;
}

/* ── slug ──────────────────────────────────────────────────────────────── */

/**
 * 由标题生成 slug。
 *
 * 只留 ASCII 字母数字，其余折叠成 `-`。中文标题会整段被吃掉 ⇒ 落到兜底
 * `game-<6 位随机>`：拼音库不值得为「后台手动加的那几条」引进一个依赖，
 * 而 `/games/game-a1b2c3` 这种地址至少是稳定、可读、不冲突的。
 */
function slugify(title: string): string {
  const ascii = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    /* 截断可能停在一半，留下一个尾巴上的 `-` —— 刮掉，别让 slug 长成 `abc-` */
    .replace(/-+$/, '');
  return ascii || `game-${randomUUID().slice(0, 6)}`;
}

/** 取一个没被占用的 slug：先试原名，撞了就 `-2` / `-3` …，试到 20 还撞就加随机尾巴。 */
async function uniqueSlug(base: string): Promise<string> {
  for (let suffix = 1; suffix <= 20; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const rows = await query<{ slug: string }>('SELECT slug FROM games WHERE slug = ?', [candidate]);
    if (rows.length === 0) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 6)}`;
}

/**
 * 这一盘该挂到哪一款上 —— 返回 `{ slug, reusedTitle }`。
 *
 * 判据与 `findGameDuplicate` **同一套维度、去掉 language 那一维**：
 * **中文标题（忽略大小写）+ 机种**。去掉 language 正是「同一款」的定义 ——
 * 中英日韩四个版本这两样必然相同，只有语言不同。
 *
 * 三档优先级：
 *   ① 库里已有同款 → 复用它的 slug（这一次只是给那一款补一个语言版本）；
 *   ② 调用方给了 slug（上游导入那条路）且没被占用 → 用它；
 *   ③ 按标题生成一个（中文标题走 `game-xxxxxx` 兜底）。
 */
async function resolveGameSlug(
  preferred: string | null,
  title: string,
  consoleType: ConsoleType
): Promise<{ slug: string; reusedTitle: string | null }> {
  const rows = await query<{ slug: string; title: string }>(
    `SELECT g.slug, t.title
       FROM games g
       JOIN game_texts t ON t.game_slug = g.slug AND t.locale = 'zh'
      WHERE g.console_type = ? AND lower(t.title) = lower(?)
      LIMIT 1`,
    [consoleType, title.trim()]
  );
  if (rows[0]) return { slug: rows[0].slug, reusedTitle: rows[0].title };

  const wanted = (preferred ?? '').trim();
  if (wanted && /^[a-z0-9][a-z0-9-]*$/i.test(wanted)) {
    const taken = await query<{ slug: string }>('SELECT slug FROM games WHERE slug = ?', [wanted]);
    if (taken.length === 0) return { slug: wanted, reusedTitle: null };
  }

  return { slug: await uniqueSlug(slugify(title)), reusedTitle: null };
}

/* ── 系列 ──────────────────────────────────────────────────────────────── */

/**
 * 把后台表单里那个**自由文本的系列名**落成 `series` 表的一行，返回 slug。
 *
 * 为什么不是「找不到就算了」：`game_texts` 里没有 `series` 列（那是 D1 时代的快照），
 * 系列名现在从 `series_texts` JOIN 出来。直接丢掉等于**后台填的系列保存后消失**。
 *
 * 为什么不在这里做「模糊匹配已有系列」：系列名是人工填的，模糊匹配会把
 * 「超级马里奥」和「超级马里奥兄弟」并成一条 —— 静默的错误比多一行数据难查得多。
 * 只做**精确匹配**（`lower(name)` 相等），匹配不上就新建一条。
 *
 * 返回值：给了名字就一定有 slug；四个语言都没填 → null（表示「清空系列」）。
 */
async function resolveSeries(texts: GameTexts): Promise<string | null> {
  /* 中文优先，其次任一非空 —— 和 `rawEntityName` 的口径一致 */
  const names = CONTENT_LOCALES.map((locale) => texts[locale]?.series?.trim() ?? '').filter(Boolean);
  if (names.length === 0) return null;

  const primary = texts.zh?.series?.trim() || names[0];

  const hit = await query<{ slug: string }>(
    `SELECT s.slug FROM series s
       JOIN series_texts t ON t.series_slug = s.slug
      WHERE lower(t.name) = lower(?)
      LIMIT 1`,
    [primary]
  );
  if (hit[0]) return hit[0].slug;

  const slug = await uniqueSeriesSlug(slugify(primary));
  await query('INSERT INTO series (slug) VALUES (?) ON CONFLICT (slug) DO NOTHING', [slug]);
  for (const locale of CONTENT_LOCALES) {
    const name = texts[locale]?.series?.trim();
    if (!name) continue;
    await query(
      `INSERT INTO series_texts (series_slug, locale, name)
       VALUES (?, ?, ?)
       ON CONFLICT (series_slug, locale) DO UPDATE SET name = excluded.name, updated_at = now()`,
      [slug, locale, name]
    );
  }
  return slug;
}

async function uniqueSeriesSlug(base: string): Promise<string> {
  for (let suffix = 1; suffix <= 20; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const rows = await query<{ slug: string }>('SELECT slug FROM series WHERE slug = ?', [candidate]);
    if (rows.length === 0) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 6)}`;
}

/* ── 文案 ──────────────────────────────────────────────────────────────── */

/**
 * 把一份 `GameTexts` 写进 `game_texts`（upsert）。
 *
 * ⚠️ **只 upsert 传进来的那几个语言，别的行一概不动** —— 将来加语言时，
 *    后台表单只带四种，不能顺手把第五种删掉。
 *
 * ⚠️ **全空的那一份会整行删掉**，而不是写一行全 NULL：后台把英文那几栏清空之后，
 *    留一行「什么都没写」的英文行没有意义，还会让 `Game.texts.en` 变成一个空壳。
 *    中文那份**永远不删**（它是原文，也是判重 / 归组的依据）。
 *
 * ⚠️ `controls` 不在后台表单里 ⇒ 写 `COALESCE`：表单没带就保留库里那份，
 *    别把源站爬下来的操作说明顺手清掉。
 */
async function writeTexts(slug: string, texts: GameTexts): Promise<void> {
  for (const locale of CONTENT_LOCALES) {
    const text = texts[locale];
    if (!text) continue;

    if (isBlankGameText(text)) {
      if (locale === 'zh') continue;
      await query('DELETE FROM game_texts WHERE game_slug = ? AND locale = ?', [slug, locale]);
      continue;
    }

    await query(
      `INSERT INTO game_texts (game_slug, locale, title, description, controls)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (game_slug, locale) DO UPDATE SET
         title       = excluded.title,
         description = excluded.description,
         controls    = COALESCE(excluded.controls, game_texts.controls),
         updated_at  = now()`,
      [slug, locale, text.title, text.description, text.controls ?? null]
    );
  }
}

/* ── 新增 ──────────────────────────────────────────────────────────────── */

/**
 * 「这一盘落在哪一款上」—— `insertGame` 随返回值一起给出去，**只给后台看**。
 *
 * `reusedTitle` 非 null 时，后台会提示「已归入已有的一款《XXX》」：中文名打错一个字
 * （繁简差异、错别字）就会**另开一款**，当时完全无感，以后才发现。
 */
export interface GameGroupInfo {
  /** 这一款的 slug。 */
  key: string;
  /** 命中的**已有**那一款的中文名；`null` = 这次新开了一款。 */
  reusedTitle: string | null;
}

export interface NewGame {
  /**
   * 上游 slug（可选）。上游导入那条路知道它，给了就用它当主键 ——
   * 站内详情页地址 `/games/<slug>` 就与源站一致，sitemap 也直接对得上。
   * 没给（后台手动添加）就按标题生成。
   */
  slug?: string | null;
  /**
   * 各语言的文案。**中文那份必填**（`texts.zh.title` 是这一款的身份，
   * 也是判重 / 归组的依据）；其余语言有就带、没有就不带。
   */
  texts: GameTexts;
  imageUrl: string;
  /**
   * ROM 来源地址（站内形态 `site:/…` / `files:/…`，本站自持的写 `r2:/…`）。
   * `null` = 这一盘没有可用来源 —— 调用方应当已经拒掉，这里只做兜底。
   */
  sourceUrl: string | null;
  romName: string;
  consoleType: ConsoleType;
  /** 这一份 ROM 的语言（`zh`/`en`/`ja`/`ko`；未指定由本模块收敛成 `'und'`）。 */
  language: string | null;
  year: number | null;
  /** 开发商 slug（`/api/admin/developers` 那个下拉框的值，现在就是 slug）。 */
  developerId: string | null;
}

/**
 * 新增一盘 ROM（可能是新开一款，也可能是给已有的一款补一个语言版本）。
 *
 * 顺序：解析 slug → 写 `games` → 写 `game_texts` → 写 `game_roms` → 刷缓存。
 * 前三步不是事务：`game_roms` 写失败时最坏的后果是「一款没有 ROM 的游戏」，
 * 后台列表里看得见、删得掉，比为此引一个跨语句事务简单。
 */
export async function insertGame(input: NewGame): Promise<Game & { group: GameGroupInfo }> {
  const zh = input.texts.zh;
  if (!zh?.title) throw new Error('insertGame：缺少中文标题（texts.zh.title 必填）');

  const developer = input.developerId ? await getDeveloper(input.developerId) : null;
  const seriesSlug = await resolveSeries(input.texts);
  const language = normalizeRomLanguage(input.language);

  const group = await resolveGameSlug(input.slug ?? null, zh.title, input.consoleType);

  /*
   * `ON CONFLICT` 是「补一个语言版本」那条路：这一款已经在了，只更新元数据。
   * ⚠️ 年份 / 开发商 / 系列用 `COALESCE` 保留旧值 —— 补日文版时表单里那几栏
   *    很可能是空的，不能因此把中文版填好的资料清掉。
   */
  await query(
    `INSERT INTO games (slug, console_type, image_url, year, developer_slug, series_slug)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (slug) DO UPDATE SET
       console_type   = excluded.console_type,
       image_url      = excluded.image_url,
       year           = COALESCE(excluded.year, games.year),
       developer_slug = COALESCE(excluded.developer_slug, games.developer_slug),
       series_slug    = COALESCE(excluded.series_slug, games.series_slug),
       updated_at     = now()`,
    [group.slug, input.consoleType, input.imageUrl, input.year, developer?.id ?? null, seriesSlug]
  );

  await writeTexts(group.slug, input.texts);

  if (input.sourceUrl) {
    await query(
      `INSERT INTO game_roms (game_slug, language, rom_name, source_url)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (game_slug, language) DO UPDATE SET
         rom_name   = excluded.rom_name,
         source_url = excluded.source_url`,
      [group.slug, language, input.romName, input.sourceUrl]
    );
  }

  /* 新增的游戏让按 slug 的缓存层立刻可命中（否则 30 天内详情页 / ROM 代理会 404） */
  revalidateTag('games', { expire: 0 });

  const game = await getGame(group.slug);
  if (!game) throw new Error('insertGame：写入成功但读不回来（并发删除？）');
  return { ...game, group: { key: group.slug, reusedTitle: group.reusedTitle } };
}

/* ── 修改 ──────────────────────────────────────────────────────────────── */

/**
 * 单条游戏的元数据修改。封面与 ROM 不在可改范围内（要换只能删了重加）。
 *
 * ⚠️ `texts` 由调用方带齐**四个语言**（后台表单就是这几栏）：漏掉哪一份，哪一份的行
 *    就不会被碰（既不更新、也不清空）—— 那是「部分更新」的语义，不是 bug。
 */
export interface GamePatch {
  texts: GameTexts;
  consoleType: ConsoleType;
  language: string | null;
  year: number | null;
  developerId: string | null;
}

export async function updateGame(id: string, patch: GamePatch): Promise<void> {
  const zh = patch.texts.zh;
  if (!zh?.title) throw new Error('updateGame：缺少中文标题（texts.zh.title 必填）');

  const existing = await query<{ slug: string }>('SELECT slug FROM games WHERE slug = ?', [id]);
  if (existing.length === 0) throw new Error('updateGame：找不到这条记录');

  const developer = patch.developerId ? await getDeveloper(patch.developerId) : null;
  const seriesSlug = await resolveSeries(patch.texts);

  /*
   * ⚠️ 开发商 / 系列**这里写 null 就是真的清空**（不像 insertGame 用 COALESCE）：
   *    后台编辑表单每次四个语言都带齐，用户把开发商下拉框选回「未指定」时，
   *    他要的就是清掉。这一条和 `insertGame` 的语义刻意不同。
   */
  await query(
    `UPDATE games
        SET console_type   = ?,
            year           = ?,
            developer_slug = ?,
            series_slug    = ?,
            updated_at     = now()
      WHERE slug = ?`,
    [patch.consoleType, patch.year, developer?.id ?? null, seriesSlug, id]
  );

  await writeTexts(id, patch.texts);

  /*
   * 语言是 **ROM 的属性**，改它等于给 `game_roms` 换主键的一半。
   * 只动**默认那一份**（`GAME_LANGUAGE_VALUES` 顺序里第一个存在的）——
   * 后台表单只有一个「语言」栏，改的就是它。多语言版本要逐个改的话，
   * 那是「删了重加」更干净的事（同封面 / ROM 不在可改范围内）。
   *
   * 新语言已经被另一份 ROM 占着时（比如把 en 改成 ja、而 ja 那行已经在），
   * 删掉旧的那行而不是覆盖 —— 已有的那份内容更可能是对的。
   */
  const roms = await query<{ language: string }>(
    `SELECT language FROM game_roms WHERE game_slug = ?
      ORDER BY CASE language
                 WHEN 'zh' THEN 1 WHEN 'en' THEN 2 WHEN 'ja' THEN 3 WHEN 'ko' THEN 4
                 ELSE 9 END
      LIMIT 1`,
    [id]
  );
  const current = roms[0]?.language;
  const wanted = patch.language?.trim() ? normalizeRomLanguage(patch.language) : current;

  if (current && wanted && wanted !== current) {
    const taken = await query<{ language: string }>(
      'SELECT language FROM game_roms WHERE game_slug = ? AND language = ?',
      [id, wanted]
    );
    if (taken.length > 0) {
      await query('DELETE FROM game_roms WHERE game_slug = ? AND language = ?', [id, current]);
    } else {
      await query('UPDATE game_roms SET language = ? WHERE game_slug = ? AND language = ?', [
        wanted,
        id,
        current,
      ]);
    }
  }

  /* 元数据变了，按 slug 的缓存必须立刻失效（详情页 / ROM 代理读的是这份） */
  revalidateTag('games', { expire: 0 });
}

/* ── 删除 ──────────────────────────────────────────────────────────────── */

/**
 * 删一款游戏。
 *
 * 文案（`game_texts`）和 ROM（`game_roms`）都挂了 `ON DELETE CASCADE`，
 * 一条 `DELETE FROM games` 就全清了 —— D1 那边要「先读 group_key、删完再判断
 * 同款还剩不剩」三步，这里一步。
 *
 * ⚠️ R2 上的封面 / ROM 对象**不在这里删**：那是收尾工作，失败了也不该让删除失败。
 *    调用方（`DELETE /api/admin/games/<id>`）先 `getGameRow` 拿到地址再 best-effort 清。
 */
export async function deleteGame(id: string): Promise<void> {
  await query('DELETE FROM games WHERE slug = ?', [id]);
  revalidateTag('games', { expire: 0 });
}
