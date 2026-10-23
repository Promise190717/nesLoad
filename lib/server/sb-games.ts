/*
 * 游戏目录的**读路径** —— Supabase（Postgres）版，替代 `./games.ts` 里那一套 D1 SQL。
 *
 * 对外形状与 `./games.ts` **完全一致**（`Game` / `GameTexts` / `localizeGame` /
 * `listGamesPageCached` …），所以页面那边只是把 import 的路径换一行，渲染代码不用动。
 *
 * ---------------------------------------------------------------------------
 * 与旧实现的差别（表结构换了，逻辑跟着简化）
 *
 * · **主键是上游 slug**（`games.slug`），不再有 UUID，也不再需要 `group_key` 聚合 ——
 *   一款游戏就是一行，「同款四个语言版本」变成 `game_roms` 里的四行。
 *   所以 `Game.romLanguages` 现在**永远有值**（旧实现只有源站模式才有）。
 * · **文案在 `game_texts`**（`game_slug + locale`），开发商名 / 系列名不再冗余进文案表，
 *   而是 JOIN `developer_texts` / `series_texts` 取 —— 改一次名字，四个语言一起变。
 * · **时间**：库里是 `timestamptz`，对外仍然吐**毫秒时间戳**（`Game.createdAt`），
 *   因为客户端组件拿它做过排序 / 展示，形状不改。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 参数占位符仍写 `?`（不是 `$1`）—— `./pg.ts` 的 `query()` 会转。
 *    别在这里直接写 `$n`，那样会被当成「已经有编号」而漏掉转换。
 */

import type { ConsoleType } from '@/lib/emulator';
import type { Locale } from '@/lib/i18n';
import {
  CONTENT_LOCALES,
  localizeTexts,
  normalizeControls,
  textLocalesFor,
  type ContentLocale,
  type GameTexts,
  type LocalizedGameText,
} from '@/lib/game-text';
import { CONSOLE_TYPES } from '@/lib/consoles';
import { GAME_LANGUAGE_VALUES } from '@/lib/rom-lang';
import { cached } from './cache';
import { mediaUrl } from './media';
import { query } from './pg';

export {
  CONTENT_LOCALES,
  localizeTexts,
  type ContentLocale,
  type GameText,
  type GameTexts,
  type LocalizedGameText,
} from '@/lib/game-text';

/** 每页条数上限（前台在线库与后台列表共用）。 */
export const MAX_PAGE_SIZE = 100;

/*
 * 前台读缓存的 TTL（秒）= 7 天。
 *
 * 2026-10-22 用户决定迁到 Vercel、**页面级 ISR 全部去掉**（见各页面里的
 * `force-dynamic`），数据缓存成了唯一一层：页面每次请求都渲染，取数走这里，
 * 7 天自然过期。此前是 30 天（2026-10-20 定的）。
 *
 * 代价是后台改完数据最坏要等 7 天才自然过期 —— 所以后台写路径**必须**继续
 * `revalidateTag('games', { expire: 0 })`（`games-admin.ts` 那三处）。
 * 三份分开是因为键与失效方式不同，但时长有意保持一致。
 *
 * ⚠️ **所有前台读缓存（含列表 / 计数 / 语种条数）都必须挂 `tags: ['games']`**
 *    （2026-10-20 加）。没有页面级缓存兜底之后，tag 是「后台一改就立刻可见」的
 *    唯一手段，漏一个就是「新游戏上线一周后前台才出现」。
 */
export const GAMES_PAGE_REVALIDATE_SECONDS = 604800;
export const GAME_DETAIL_REVALIDATE_SECONDS = 604800;
export const HOME_REVALIDATE_SECONDS = 604800;
/** sitemap 的 stub 读取仍按天走，理由见 `listGameStubsCached`。 */
const SITEMAP_STUBS_REVALIDATE_SECONDS = 86400;

/** 对外结构（camelCase）。形状与 `./games.ts` 的 `Game` 一致，页面不用改。 */
export interface Game {
  /** 上游 slug —— 详情页地址 `/games/<slug>`，ROM 代理也按它取。 */
  id: string;
  /** 库里有的语言全都在，取值由 `localizeGame` 决定。 */
  texts: GameTexts;
  imageUrl: string;
  romName: string;
  consoleType: ConsoleType;
  /** 默认 ROM 的语言（`zh` → `en` → `ja` → `ko` 里第一个存在的）。 */
  language: string | null;
  year: number | null;
  /** 开发商页的地址片段（`/developers/<slug>`）。 */
  developerId: string | null;
  /** 毫秒时间戳（库里是 timestamptz，读取时转好）。 */
  createdAt: number;
  /** 这一款有哪几个语言的 ROM（含文件名，播放时要用）。 */
  romLanguages: GameRomLanguage[];
}

/**
 * 一个语言版本的 ROM 组（2026-10-22 加 `discs`）。
 *
 * `name` 保留成**第一碟**的文件名 —— 前台多处（语言选择条、`/play` 的 `romLang`）
 * 一直读它，改形状会连带改一堆组件。多碟信息放在 `discs` 里，由 `/play` 拼 `.m3u` 用。
 */
export interface GameRomLanguage {
  code: string;
  name: string;
  /** 该语言的全部碟，按碟号升序。单碟游戏长度恒为 1。 */
  discs: { disc: number; name: string; entryName: string | null }[];
}

/** 数据库原始行（ROM 代理要用 `source_url` / `rom_name`）。 */
export interface GameRow {
  id: string;
  image_url: string;
  rom_name: string;
  source_url: string | null;
  console_type: ConsoleType;
  language: string | null;
  created_at: number;
}

/** 分页筛选条件。 */
export interface GamePageQuery {
  keyword?: string;
  consoleType?: ConsoleType | null;
  developerId?: string | null;
  /** 只要**有该语言 ROM** 的游戏（`zh` / `en` / `ja` / `ko`）。 */
  language?: string | null;
}

export function localizeGame(game: Game, locale: Locale): LocalizedGameText {
  return localizeTexts(game.texts, locale);
}

/* ── WHERE 构造 ────────────────────────────────────────────────────────── */

function buildWhere(filter: GamePageQuery): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  const needle = filter.keyword?.trim();
  if (needle) {
    /*
     * 关键词走 EXISTS 而不是 JOIN：一款游戏有四条文案行，JOIN 会把它复制四遍。
     * `game_texts.title` 上有 trgm 的 GIN 索引，`ilike '%x%'` 能吃上。
     */
    conditions.push(
      `EXISTS (SELECT 1 FROM game_texts t WHERE t.game_slug = g.slug
                AND (t.title ILIKE ? OR t.description ILIKE ?))`
    );
    params.push(`%${needle}%`, `%${needle}%`);
  }
  if (filter.consoleType) {
    conditions.push('g.console_type = ?');
    params.push(filter.consoleType);
  }
  if (filter.developerId) {
    conditions.push('g.developer_slug = ?');
    params.push(filter.developerId);
  }
  if (filter.language) {
    conditions.push(
      'EXISTS (SELECT 1 FROM game_roms r WHERE r.game_slug = g.slug AND r.language = ?)'
    );
    params.push(filter.language);
  }

  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

/* ── 行 → Game ─────────────────────────────────────────────────────────── */

interface GameBaseRow {
  slug: string;
  image_url: string;
  console_type: ConsoleType;
  year: number | null;
  developer_slug: string | null;
  created_at: number;
}

interface RomRow {
  game_slug: string;
  language: string;
  /** 第几张碟（2026-10-22 加）。单碟恒为 1；多碟 CD 游戏一张一行。 */
  disc: number;
  rom_name: string;
  /** 压缩包内「写进 m3u 的那一条」（仅多碟的 zip 有值，见脚本 fill-rom-entries.mjs）。 */
  entry_name: string | null;
  source_url: string;
}

/**
 * 批量取一批游戏的 ROM（默认那一份 + 全部语言）。
 *
 * 一次 `IN` 查完再在内存里分组 —— 列表一页最多 100 条，逐条查就是 100 次往返。
 */
async function loadRoms(slugs: string[]): Promise<Map<string, RomRow[]>> {
  const map = new Map<string, RomRow[]>();
  if (slugs.length === 0) return map;

  const rows = await query<RomRow>(
    `SELECT game_slug, language, disc, rom_name, entry_name, source_url
       FROM game_roms WHERE game_slug IN (${slugs.map(() => '?').join(', ')})
      ORDER BY language, disc`,
    slugs
  );
  for (const row of rows) {
    const bucket = map.get(row.game_slug) ?? [];
    bucket.push(row);
    map.set(row.game_slug, bucket);
  }
  return map;
}

/**
 * 默认 ROM：按站内语言顺序取第一个存在的（与 `GAME_LANGUAGES` 的顺序一致）。
 *
 * ⚠️ 只认 `disc = 1`：多碟游戏如果按语言 `find` 到哪条算哪条，可能把第 2、3 碟
 *    当成默认盘直接启动（2026-10-22 加碟片维度时踩到的形状问题）。
 */
function pickDefaultRom(roms: RomRow[] | undefined): RomRow | null {
  if (!roms?.length) return null;
  for (const language of GAME_LANGUAGE_VALUES) {
    const hit = roms.find((rom) => rom.language === language && rom.disc === 1);
    if (hit) return hit;
  }
  return roms.find((rom) => rom.disc === 1) ?? roms[0];
}

/** 按语言顺序整理 `romLanguages`（前端据此画语言选择条，`/play` 据此拼 m3u）。 */
function sortRoms(roms: RomRow[] | undefined): GameRomLanguage[] {
  if (!roms?.length) return [];
  const ordered: GameRomLanguage[] = [];

  const push = (language: string) => {
    const discs = roms
      .filter((rom) => rom.language === language)
      .sort((a, b) => a.disc - b.disc);
    if (discs.length === 0) return;
    ordered.push({
      code: language,
      name: discs[0].rom_name,
      discs: discs.map((rom) => ({
        disc: rom.disc,
        name: rom.rom_name,
        entryName: rom.entry_name,
      })),
    });
  };

  for (const language of GAME_LANGUAGE_VALUES) push(language);
  for (const rom of roms) {
    if (!ordered.some((item) => item.code === rom.language)) push(rom.language);
  }
  return ordered;
}

/**
 * 文案取多少 —— 两个维度，都是「少取就少解析」。
 *
 * ⚠️ **2026-10-23 加（为压 Cloudflare 免费版 10ms CPU）**：原来这里一律把 18 种语言
 *    整批捞回来，一页 15 款实测 **245KB** JSON（`page_texts` 270 行）。免费版每请求
 *    只有 10ms CPU，光是 JSON.parse + 270 个对象构造就吃掉一大块，而卡片上只用得到
 *    一个标题。现在前台一律传裁剪参数，**只有后台编辑表单才要全量**（它要四种语言一起改）。
 */
export interface TextLoadOptions {
  /** 只取这些语言的文案行。不给 = 全部 18 种。 */
  locales?: readonly string[];
  /** 要不要 `description` / `controls`。列表卡片只用 title / developer / series。 */
  content?: boolean;
}

/**
 * 渲染一款游戏真正用得到的语言 = 当前语言 + 逐字段回退链（规则见 `localizeTexts`）。
 *
 * 回退链最多再补两种（`zh-TW` → zh/en；其余 → en/zh），所以 18 种能收到 3 种以内。
 * ⚠️ 别图省事只传当前语言 —— 英文站缺字段时就不回退中文了，卡片标题会变空白。
 * 定义在 `lib/game-text.ts`（机种 / 开发商那条读路径也要用），这里转出去给页面少导一层。
 */
export { textLocalesFor } from '@/lib/game-text';

/**
 * 一次把一批游戏的文案捞回来（`slug → GameTexts`）。
 *
 * 开发商名 / 系列名从各自的文案表 JOIN 进来，而不是存在 `game_texts` 里 ——
 * 那样改一次开发商名要改四行游戏文案，这里改一行就够。
 */
export async function loadGameTexts(
  slugs: string[],
  options: TextLoadOptions = {}
): Promise<Map<string, GameTexts>> {
  const map = new Map<string, GameTexts>();
  if (slugs.length === 0) return map;

  const locales = options.locales?.length ? [...options.locales] : null;
  /*
   * `content: false` 时仍然选这两列，只是直接给 NULL —— 保持返回行的形状一致，
   * 下游 `normalizeControls(row.controls)` 拿到 null 就返回 null（它认这个）。
   */
  const withContent = options.content !== false;

  const rows = await query<{
    game_slug: string;
    locale: string;
    title: string | null;
    description: string | null;
    /**
     * `jsonb` 列 —— **别写成 `GameControls | null`**：那是对驱动的假设，不是事实。
     * 列真被建成了 `text`（或驱动没解析）时这里回来的是字符串，写成对象类型只会
     * 让下游一路相信「`keys` 一定是数组」，直到详情页 `keys.length` 才炸。
     * 一律交给 `normalizeControls` 收口（2026-10-20 线上踩过）。
     */
    controls: unknown;
    developer: string | null;
    series: string | null;
  }>(
    `SELECT t.game_slug, t.locale, t.title,
            ${withContent ? 't.description' : 'NULL::text AS description'},
            ${withContent ? 't.controls' : 'NULL::jsonb AS controls'},
            d.name AS developer, s.name AS series
       FROM game_texts t
       JOIN games g ON g.slug = t.game_slug
       LEFT JOIN developer_texts d ON d.developer_slug = g.developer_slug AND d.locale = t.locale
       LEFT JOIN series_texts s ON s.series_slug = g.series_slug AND s.locale = t.locale
      WHERE t.game_slug IN (${slugs.map(() => '?').join(', ')})
        ${locales ? `AND t.locale IN (${locales.map(() => '?').join(', ')})` : ''}`,
    locales ? [...slugs, ...locales] : slugs
  );

  for (const row of rows) {
    const bucket: GameTexts = map.get(row.game_slug) ?? {};
    bucket[row.locale as ContentLocale] = {
      title: row.title,
      series: row.series,
      developer: row.developer,
      description: row.description,
      controls: normalizeControls(row.controls),
    };
    map.set(row.game_slug, bucket);
  }
  return map;
}

/** `attach` 的取数范围；在文案那两个维度之外再加「要不要 ROM 行」。 */
interface AttachOptions extends TextLoadOptions {
  /**
   * 要不要查 `game_roms`。**列表页不需要**：卡片上只有封面 / 标题 / 年份 / 机种 / 开发商，
   * 没有语言角标（2026-10-19 去掉的），也没有下载信息 —— 那次查询和 `sortRoms` 白跑。
   * 跳过后 `romName` 是空串、`romLanguages` 是空数组，详情页与 `/play` 用的是自己的取数。
   */
  roms?: boolean;
}

/** 把一批基础行组装成 `Game[]`（文案 + ROM 各一次批量查询）。 */
async function attach(base: GameBaseRow[], options: AttachOptions = {}): Promise<Game[]> {
  if (base.length === 0) return [];
  const slugs = base.map((row) => row.slug);
  const withRoms = options.roms !== false;
  const [texts, roms] = await Promise.all([
    loadGameTexts(slugs, options),
    withRoms ? loadRoms(slugs) : Promise.resolve(new Map<string, RomRow[]>()),
  ]);

  return base.map((row) => {
    const ownRoms = roms.get(row.slug);
    const preferred = pickDefaultRom(ownRoms);
    return {
      id: row.slug,
      texts: texts.get(row.slug) ?? {},
      /*
       * 库里存的是**路径**（`/images/…`），域名在这里现拼 —— 见 lib/server/media.ts。
       * `?? ''` 只是类型兜底：`games.image_url` 是 NOT NULL，走不到这一支。
       */
      imageUrl: mediaUrl(row.image_url) ?? '',
      romName: preferred?.rom_name ?? '',
      consoleType: row.console_type,
      language: preferred?.language ?? null,
      year: row.year,
      developerId: row.developer_slug,
      createdAt: row.created_at,
      romLanguages: sortRoms(ownRoms),
    };
  });
}

const BASE_COLUMNS = `g.slug, g.image_url, g.console_type, g.year, g.developer_slug,
  (EXTRACT(EPOCH FROM g.created_at) * 1000)::float8 AS created_at`;

/**
 * 按**给定顺序**把一批 slug 组装成 `Game[]`。
 *
 * 后台列表用：那边是游标翻页（`created_at DESC, slug DESC`），而 `attach()` 会按
 * `IN (…)` 查回来的顺序走 —— Postgres 不保证 `IN` 的顺序，所以这里先用 slug 建索引
 * 再按入参重排，翻页的顺序才和 SQL 里 `ORDER BY` 说的一致。
 *
 * 查不到的 slug 直接跳过（列表刚读出来就被别人删掉的那种瞬间）。
 */
export async function loadGamesBySlugs(slugs: string[]): Promise<Game[]> {
  if (slugs.length === 0) return [];
  const rows = await query<GameBaseRow>(
    `SELECT ${BASE_COLUMNS} FROM games g WHERE g.slug IN (${slugs.map(() => '?').join(', ')})`,
    slugs
  );
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const ordered = slugs
    .map((slug) => bySlug.get(slug))
    .filter((row): row is GameBaseRow => Boolean(row));
  return attach(ordered);
}

/* ── 计数 ──────────────────────────────────────────────────────────────── */

export async function countGames(filter: GamePageQuery = {}): Promise<number> {
  const { where, params } = buildWhere(filter);
  const rows = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM games g ${where}`,
    params
  );
  return Number(rows[0]?.total ?? 0);
}

export const countGamesCached = cached(
  async (keyword: string, consoleType: ConsoleType | null, developerId: string | null, language: string | null) =>
    countGames({ keyword, consoleType, developerId, language }),
  ['sb:games:count', 'v1'],
  { revalidate: GAMES_PAGE_REVALIDATE_SECONDS, tags: ['games'] }
);

/* ── 列表 ──────────────────────────────────────────────────────────────── */

/**
 * 分页读取（offset 式）。
 *
 * 排序键 `(created_at DESC, slug DESC)`：时间戳可能撞（同一批爬进来的是同一秒），
 * 第二键保证跨查询顺序稳定，不会出现「同一条在第 1 页和第 2 页各出现一次」。
 * 越界时夹回最后一页，并把夹过的 `offset` 一并返回（调用方以返回值为准）。
 */
export async function listGamesPage(
  offset: number,
  limit: number,
  filter: GamePageQuery = {},
  total?: number,
  attachOptions: AttachOptions = {}
): Promise<{ games: Game[]; total: number; offset: number; limit: number }> {
  const { where, params } = buildWhere(filter);
  const resolvedTotal = total ?? (await countGames(filter));

  const lastOffset = Math.max(0, Math.ceil(resolvedTotal / limit) - 1) * limit;
  const safeOffset = Math.min(Math.max(0, offset), lastOffset);

  const rows = await query<GameBaseRow>(
    `SELECT ${BASE_COLUMNS} FROM games g ${where}
      ORDER BY g.created_at DESC, g.slug DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, safeOffset]
  );

  return {
    games: await attach(rows, attachOptions),
    total: resolvedTotal,
    offset: safeOffset,
    limit,
  };
}

/** 列表页的取数范围：卡片要标题 / 开发商，不要描述 / 键位表 / ROM 清单。 */
function cardAttachOptions(locale: string): AttachOptions {
  return { locales: textLocalesFor(locale), content: false, roms: false };
}

export async function listGamesPageCached(
  offset: number,
  limit: number,
  keyword: string,
  consoleType: ConsoleType | null,
  language: string | null,
  locale: string
): Promise<{ games: Game[]; total: number; offset: number; limit: number }> {
  return listGamesPageCachedRaw(offset, limit, keyword, consoleType, language, locale);
}

const listGamesPageCachedRaw = cached(
  async (
    offset: number,
    limit: number,
    keyword: string,
    consoleType: ConsoleType | null,
    language: string | null,
    locale: string
  ) => {
    const needle = keyword.trim();
    const filter = { keyword: needle, consoleType, language };
    /* total 一起算：列表和计数必须描述同一批数据，否则页码会和实际条目错位 */
    const total = await countGames(filter);
    return listGamesPage(offset, limit, filter, total, cardAttachOptions(locale));
  },
  /*
   * ⚠️ 2026-10-23 v2 → v3：文案改成**按语言裁剪**（18 种 → 最多 3 种 + 不要描述 / 键位表），
   *    所以 `locale` 进了缓存键，返回结构也变小了。条目**不随部署失效**，不升版本的话
   *    线上会继续读到旧形状（带着 18 种语言的全量文案），这次优化等于没上线。
   */
  ['sb:games:page', 'v3'],
  { revalidate: GAMES_PAGE_REVALIDATE_SECONDS, tags: ['games'] }
);

export const listLatestGamesCached = cached(
  async (limit: number, locale: string) =>
    listGamesPage(0, limit, {}, undefined, cardAttachOptions(locale)),
  ['sb:games:latest', 'v3'],
  { revalidate: HOME_REVALIDATE_SECONDS, tags: ['games'] }
);

/** 机种专题页：`/consoles/<type>`。 */
export const listGamesByConsoleCached = cached(
  async (consoleType: ConsoleType, offset: number, limit: number, language: string | null, locale: string) =>
    listGamesPage(offset, limit, { consoleType, language }, undefined, cardAttachOptions(locale)),
  ['sb:games:by-console', 'v3'],
  { revalidate: GAMES_PAGE_REVALIDATE_SECONDS, tags: ['games'] }
);

/** 开发商专题页：`/developers/<slug>`。 */
export const listGamesByDeveloperCached = cached(
  async (developerId: string, offset: number, limit: number, locale: string) =>
    listGamesPage(offset, limit, { developerId }, undefined, cardAttachOptions(locale)),
  ['sb:games:by-developer', 'v3'],
  { revalidate: GAMES_PAGE_REVALIDATE_SECONDS, tags: ['games'] }
);

/* ── 汇总 ──────────────────────────────────────────────────────────────── */

export const countGamesByConsoleCached = cached(
  async (): Promise<Record<ConsoleType, number>> => {
    const rows = await query<{ console_type: ConsoleType; total: number }>(
      'SELECT console_type, COUNT(*)::int AS total FROM games GROUP BY console_type'
    );
    const counts = Object.fromEntries(CONSOLE_TYPES.map((type) => [type, 0])) as Record<
      ConsoleType,
      number
    >;
    for (const row of rows) counts[row.console_type] = Number(row.total);
    return counts;
  },
  ['sb:games:by-console-counts', 'v1'],
  { revalidate: HOME_REVALIDATE_SECONDS, tags: ['games'] }
);

/** 旧名字，页面里两种写法都有，保留别名。 */
export const countGamesByConsole = countGamesByConsoleCached;

/**
 * 一个机种下各语种各有几款（机种页那条语种筛选条上的数字）。
 *
 * 注意口径：这里数的是 **ROM 的语言**（`game_roms.language`），不是界面语言。
 * 返回**四个键齐全**，没数据的补 0 —— 调用方拿到的形状是固定的。
 */
export const countConsoleGamesByLanguageCached = cached(
  async (consoleType: ConsoleType, keyword: string = ''): Promise<Record<string, number>> => {
    const needle = keyword.trim();
    const rows = needle
      ? await query<{ language: string; total: number }>(
          `SELECT r.language, COUNT(DISTINCT g.slug)::int AS total
             FROM games g JOIN game_roms r ON r.game_slug = g.slug
            WHERE g.console_type = ?
              AND EXISTS (SELECT 1 FROM game_texts t WHERE t.game_slug = g.slug
                           AND (t.title ILIKE ? OR t.description ILIKE ?))
            GROUP BY r.language`,
          [consoleType, `%${needle}%`, `%${needle}%`]
        )
      : await query<{ language: string; total: number }>(
          `SELECT r.language, COUNT(DISTINCT g.slug)::int AS total
             FROM games g JOIN game_roms r ON r.game_slug = g.slug
            WHERE g.console_type = ?
            GROUP BY r.language`,
          [consoleType]
        );

    const counts: Record<string, number> = {};
    for (const value of GAME_LANGUAGE_VALUES) counts[value] = 0;
    for (const row of rows) {
      /*
       * 只认站内那四个语种（`GAME_LANGUAGE_VALUES`，唯一出处）。
       * 上游还有 `es` / `zh-tw` 这些我们界面没开的版本 —— 混进来会让返回值的
       * 形状随机（筛选条只画四个），所以直接丢掉，不进 counts。
       */
      if (!(row.language in counts)) continue;
      counts[row.language] = Number(row.total);
    }
    return counts;
  },
  ['sb:games:lang-counts', 'v1'],
  { revalidate: GAMES_PAGE_REVALIDATE_SECONDS, tags: ['games'] }
);

/* ── 单条 ──────────────────────────────────────────────────────────────── */

/**
 * 单款游戏。
 *
 * ⚠️ `locale` 给了就**只取那一份语言 + 回退链**的文案（详情页用）；
 *    不给则是全部 18 种（后台编辑表单、写路径的完整性检查要用）。
 *    取全量时一款 ≈ 18KB，只为渲染一页时那份是 0.8KB —— 免费版 10ms CPU 下差一倍。
 */
export async function getGame(id: string, locale?: string): Promise<Game | null> {
  const rows = await query<GameBaseRow>(
    `SELECT ${BASE_COLUMNS} FROM games g WHERE g.slug = ?`,
    [id]
  );
  if (!rows[0]) return null;
  const games = await attach(rows, locale ? { locales: textLocalesFor(locale) } : {});
  return games[0] ?? null;
}

export const getGameCached = cached(
  async (id: string, locale: string) => getGame(id, locale),
  /*
   * ⚠️ 2026-10-22 v2 → v3：`Game.romLanguages` 的每一项多了 `discs`（碟片清单）。
   * 缓存条目**不随部署失效**，不升版本的话线上一直读到没有 `discs` 的旧结构，
   * `/play` 于是永远走「单碟」分支 —— 多碟游戏的换碟等于没上线。改结构必升键尾。
   *
   * ⚠️ 2026-10-23 v3 → v4：文案改成按 `locale` 裁剪（18 种 → 最多 3 种），
   *    `locale` 也进了键。不升版本会继续读到 18 种语言的全量条目。
   */
  ['sb:games:by-id', 'v4'],
  { revalidate: GAME_DETAIL_REVALIDATE_SECONDS, tags: ['games'] }
);

/** 写路径专用（评论 / 收藏 / 存档 / 举报）：要「此刻还在不在」，所以不吃缓存。 */
export async function getGameForWrite(id: string): Promise<Game | null> {
  return getGame(id);
}

/**
 * 指定碟号的 ROM：仍按站内语言优先级挑，但只在这个碟号里找。
 *
 * 多碟游戏换碟时，代理要的是「同一个语言下的第 N 碟」，不是「第 N 个候选」。
 */
function pickRomAt(roms: RomRow[] | undefined, disc: number): RomRow | null {
  if (!roms?.length) return null;
  for (const language of GAME_LANGUAGE_VALUES) {
    const hit = roms.find((rom) => rom.language === language && rom.disc === disc);
    if (hit) return hit;
  }
  return roms.find((rom) => rom.disc === disc) ?? null;
}

/** ROM 代理要的原始行：默认那一份 ROM 的地址与文件名。 */
export async function getGameRow(id: string, disc = 1): Promise<GameRow | null> {
  const rows = await query<{
    slug: string;
    image_url: string;
    console_type: ConsoleType;
    created_at: number;
  }>(
    `SELECT g.slug, g.image_url, g.console_type,
            (EXTRACT(EPOCH FROM g.created_at) * 1000)::float8 AS created_at
       FROM games g WHERE g.slug = ?`,
    [id]
  );
  if (!rows[0]) return null;

  const roms = await loadRoms([id]);
  const preferred = pickRomAt(roms.get(id), disc);
  if (!preferred) return null;

  return {
    id: rows[0].slug,
    image_url: rows[0].image_url,
    rom_name: preferred.rom_name,
    source_url: preferred.source_url,
    console_type: rows[0].console_type,
    language: preferred.language,
    created_at: rows[0].created_at,
  };
}

export const getGameRowCached = cached(
  async (id: string) => getGameRow(id),
  ['sb:games:row', 'v1'],
  { revalidate: GAME_DETAIL_REVALIDATE_SECONDS, tags: ['games'] }
);

/**
 * 一款游戏的全部 ROM 行（2026-10-22 起**含碟号**，一行 = 一个语言的一张碟）——
 * ROM 代理按 `?lang=` / `?disc=` 挑一份用。
 *
 * 顺序 = 站内语言优先级（`zh → en → ja → ko`）再按碟号升序，所以
 * `candidates[0]` 仍然是「默认语言的第一碟」，和加碟片维度之前的行为一致。
 *
 * ⚠️ **不缓存**（2026-10-20 用户要求「只要页面缓存，接口一律不吃缓存」）；
 * 原来这里包了一层 `unstable_cache`（24 小时，键 `sb:games:roms`）。
 * 页面侧要缓存就自己包，写路径与接口都读这一份。ROM 地址在库里变了就该立刻生效。
 */
export async function getGameRoms(id: string) {
  const rows = await loadRoms([id]);
  const all = rows.get(id) ?? [];
  const ordered: { language: string; disc: number; romName: string; sourceUrl: string | null }[] = [];

  /* 语言顺序用 sortRoms 那份（站内优先级），别自己按字母排。 */
  for (const group of sortRoms(all)) {
    const discs = all
      .filter((row) => row.language === group.code)
      .sort((a, b) => a.disc - b.disc);
    for (const row of discs) {
      ordered.push({
        language: row.language,
        disc: row.disc,
        romName: row.rom_name,
        sourceUrl: row.source_url,
      });
    }
  }
  return ordered;
}

/* ── sitemap ───────────────────────────────────────────────────────────── */

/**
 * 全部游戏的 `(slug, createdAt)`。
 *
 * `createdAt` 是**毫秒时间戳**；sitemap 那边用它当 `lastModified`。
 * 一次全量（约 2000 行）比逐页翻便宜，而且 sitemap 本来就一天才生成一次。
 */
export const listGameStubsCached = cached(
  async (): Promise<{ id: string; createdAt: number }[]> => {
    const rows = await query<{ slug: string; created_at: number }>(
      `SELECT slug, (EXTRACT(EPOCH FROM created_at) * 1000)::float8 AS created_at
         FROM games ORDER BY created_at DESC`
    );
    return rows.map((row) => ({ id: row.slug, createdAt: row.created_at }));
  },
  ['sb:games:stubs', 'v1'],
  /*
   * ⚠️ 这份**不用** `GAMES_PAGE_REVALIDATE_SECONDS`（30 天），单独留在 24 小时：
   *    它只喂 sitemap，而 sitemap 自己就是 `revalidate = 86400`。跟着页面一起拉到 30 天，
   *    等于新游戏一个月才进 sitemap —— 那是 SEO 上的实质损失，不是「页面缓存」的一部分。
   */
  { revalidate: SITEMAP_STUBS_REVALIDATE_SECONDS }
);

export async function listGameStubs(): Promise<{ id: string; createdAt: number }[]> {
  return listGameStubsCached();
}
