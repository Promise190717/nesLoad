/*
 * 开发商库（developers 表 + developer_texts 侧表）的读写。
 *
 * ⚠️ **本文件不许 import `./games.ts`**（单向依赖：games → developers，和 consoles 同一条规矩）。
 * 「某个开发商有几款游戏」用一条相关子查询现算，别去 games.ts 里 import 一个计数函数 ——
 * 那会破坏依赖方向（games 已经依赖了 developers）。
 *
 * ## 多语言侧表（2026-10-16 加）
 *
 * 文案（name / summary / description）不再平铺在 developers 表里，而是搬到
 * `developer_texts` 侧表 —— 加语言 = 插数据，不动表结构。
 * `developers` 表里那 6 个旧列（name / name_en / summary / summary_en /
 * description / description_en）保留、但只写不读，作为回滚退路。
 */

import { cached } from './cache';
import { usesUpstreamCatalog } from './catalog-source';
import { query } from './d1';
import { CONTENT_LOCALES } from '@/lib/game-text';
import {
  EMPTY_ENTITY_TEXT,
  isBlankEntityText,
  localizeEntityTexts,
  rawEntityName,
  type EntityTexts,
  type LocalizedEntityText,
} from '@/lib/entity-text';

/** DB 行（snake_case，只含 developers 表本身的列）。 */
export interface DeveloperRow {
  id: string;
  image_url: string | null;
  founded_year: number | null;
  website: string | null;
  source_slug: string | null;
  created_at: number;
}

/** 对外结构（camelCase，供 API / 前端）。 */
export interface Developer {
  id: string;
  /** 多语言文案（从 developer_texts 侧表读取） */
  texts: EntityTexts;
  imageUrl: string | null;
  foundedYear: number | null;
  website: string | null;
  /** 上游 slug（回填日韩用，后台表单不暴露） */
  sourceSlug: string | null;
  createdAt: number;
  /** 名下游戏数（相关子查询）。只有 `listDevelopers` 会真算。 */
  gameCount: number;
}

/** 按语言取一个开发商的文案。纯函数，不碰数据库。 */
export function localizeDeveloper(developer: Developer, locale: string): LocalizedEntityText {
  return localizeEntityTexts(developer.texts, locale);
}

/** 兼容旧名 —— 前台页面仍在 import 它。 */
export type LocalizedDeveloperText = LocalizedEntityText;

/** 把 website 统一收敛成「有 https:// 前缀、无尾部斜杠」的干净形态。 */
export function normalizeWebsite(raw: FormDataEntryValue | null): string | null {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return null;
  let url = text;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/$/, '')}${u.search}`;
  } catch {
    return url;
  }
}

/** 「名下有几款游戏」那条相关子查询 —— 列表和单条都要它，别两处各写一份。 */
const GAME_COUNT = '(SELECT COUNT(*) FROM games g WHERE g.developer_id = developers.id) AS game_count';

function toDeveloper(row: DeveloperRow & { game_count?: number }, texts: EntityTexts = {}): Developer {
  return {
    id: row.id,
    texts,
    imageUrl: row.image_url,
    foundedYear: row.founded_year,
    website: row.website,
    sourceSlug: row.source_slug,
    createdAt: row.created_at,
    gameCount: Number(row.game_count ?? 0),
  };
}

/** 批量加载开发商文案。 */
async function loadDeveloperTexts(ids: string[]): Promise<Map<string, EntityTexts>> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = await query<{
    developer_id: string;
    locale: string;
    name: string | null;
    summary: string | null;
    description: string | null;
  }>(
    `SELECT developer_id, locale, name, summary, description
       FROM developer_texts WHERE developer_id IN (${placeholders})`,
    ids
  );

  const map = new Map<string, EntityTexts>();
  for (const r of rows) {
    if (!map.has(r.developer_id)) map.set(r.developer_id, {});
    map.get(r.developer_id)![r.locale as import('@/lib/game-text').ContentLocale] = {
      name: r.name,
      summary: r.summary,
      description: r.description,
    };
  }
  return map;
}

/**
 * 写开发商文案侧表（upsert）。
 *
 * ⚠️ **只碰调用方真带过来的那几个语言**，别的一行不动（同 games.ts 的 `writeTexts`）：
 *    传进来的那份里没这个 key（`undefined`）=「这次不管这个语言」，**不等于清空**。
 *    后台两个表单每次都带齐四个语言；将来的回填脚本可能只带日韩，不能顺手把英文抹了。
 *
 * ⚠️ **带过来但是全空的那一份整行删掉**（中文除外）—— 后台把英文那几栏清空之后，
 *    留一行全 NULL 的行会让 `texts.en` 变成一个空壳，前台「英文名空着」和
 *    「英文名填过又被清空」就分不出来了。（这一条原来漏了：全空直接 `continue`，
 *    于是后台清不掉英文名，页面上一直显示老名字。）
 */
async function writeDeveloperTexts(developerId: string, texts: EntityTexts): Promise<void> {
  const now = Date.now();
  for (const locale of CONTENT_LOCALES) {
    const t = texts[locale];
    if (!t) continue;

    if (isBlankEntityText(t)) {
      /* 中文那份永远不删：它是原文，也是 developers.name 的来源 */
      if (locale === 'zh') continue;
      await query('DELETE FROM developer_texts WHERE developer_id = ? AND locale = ?', [
        developerId,
        locale,
      ]);
      continue;
    }

    await query(
      `INSERT INTO developer_texts (developer_id, locale, name, summary, description, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(developer_id, locale) DO UPDATE SET
         name = excluded.name,
         summary = excluded.summary,
         description = excluded.description,
         updated_at = excluded.updated_at`,
      [developerId, locale, t.name, t.summary, t.description, now]
    );
  }
}

/* ================================================================ */
/* 列表（前台用）                                                    */
/* ================================================================ */

export const MAX_PAGE_SIZE = 100;

/** 列表筛选条件。`keyword` 模糊匹配 name / summary（不区分大小写，`LIKE` 的默认行为）。 */
export interface DeveloperPageQuery {
  keyword?: string;
}

/**
 * 搜索条件。⚠️ 2026-10-13 起**中英两份都搜**（同 games 的 SEARCH_CONDITION 那条理由）。
 * 2026-10-16 侧表化之后，旧列（name / summary / name_en / summary_en）仍然同步写入，
 * 所以搜旧列仍然有效；日韩数据在侧表里，但搜索暂未扩展（当前需求只到展示层）。
 */
const SEARCH_CONDITION = "(name LIKE ?1 ESCAPE '\\' OR summary LIKE ?1 ESCAPE '\\' OR name_en LIKE ?1 ESCAPE '\\' OR summary_en LIKE ?1 ESCAPE '\\')";

/** 只数总数，不取数据。 */
export async function countDevelopers({ keyword = '' }: DeveloperPageQuery = {}): Promise<number> {
  const needle = keyword.trim();
  const where = needle ? `WHERE ${SEARCH_CONDITION}` : '';
  const params = needle ? [`%${needle}%`] : [];
  const rows = await query<{ total: number }>(
    `SELECT COUNT(*) AS total FROM developers ${where}`,
    params
  );
  return Number(rows[0]?.total ?? 0);
}

/** 分页读取开发商列表，顺带给出每个名下的游戏数。 */
export async function listDevelopers(
  offset: number,
  limit: number,
  filter: DeveloperPageQuery = {},
  total?: number
): Promise<{ developers: Developer[]; total: number; offset: number; limit: number }> {
  const needle = filter.keyword?.trim() ?? '';
  const where = needle ? `WHERE ${SEARCH_CONDITION}` : '';
  const params = needle ? [`%${needle}%`] : [];

  const resolvedTotal = total ?? (await countDevelopers(filter));
  const lastOffset = Math.max(0, Math.ceil(resolvedTotal / limit) - 1) * limit;
  let safeOffset = Math.min(offset, lastOffset);

  const select = (at: number) =>
    query<DeveloperRow & { game_count: number }>(
      `SELECT id, image_url, founded_year, website, source_slug, created_at, ${GAME_COUNT}
       FROM developers ${where}
       ORDER BY created_at DESC, id DESC LIMIT ?${params.length + 1} OFFSET ?${params.length + 2}`,
      [...params, limit, at]
    );

  let rows = await select(safeOffset);
  if (rows.length === 0 && safeOffset > 0) {
    safeOffset = Math.max(0, safeOffset - limit);
    rows = await select(safeOffset);
  }

  const textsMap = await loadDeveloperTexts(rows.map((r) => r.id));
  return {
    developers: rows.map((r) => toDeveloper(r, textsMap.get(r.id) ?? {})),
    total: resolvedTotal,
    offset: safeOffset,
    limit,
  };
}

/**
 * 开发商列表页（`/developers`）那份缓存的时长（秒）= 24 小时。
 *
 * ⚠️ 2026-10-16 从 12 小时提到 24 小时（用户要求「所有列表页统一 24 小时」）。
 *    代价：后台改完开发商的名字 / 简介，这一页最多晚 24 小时才更新
 *    （开发商详情页上开发商自己的资料**不缓存**，那边改完是立刻的）。
 *
 * ⚠️ 数值与 `games.ts` 的 `GAMES_PAGE_REVALIDATE_SECONDS` 相同，但**手抄、不 import**
 *    （两个文件不许互相依赖）—— 改一边要记得改另一边。
 * ⚠️ 开发模式走 `lib/server/cache.ts` 的 `cached`，那边把 TTL 压到 5 分钟（见该文件）。
 */
export const DEVELOPERS_PAGE_REVALIDATE_SECONDS = 86400;

const countDevelopersCachedRaw = cached(
  async (keyword: string) => countDevelopers({ keyword }),
  ['developers:count'],
  { revalidate: DEVELOPERS_PAGE_REVALIDATE_SECONDS }
);

/*
 * ⚠️ 2026-10-19：开发商库**没有上游替代**（上游站点没有 /developers 页面）。
 *    源站模式（`CATALOG_SOURCE=upstream`）下一律回空 —— 列表页 / 首页区块显示
 *    「还没有内容」，而不是给一批指向不存在游戏的链接。
 *    这里只包了前台读的那几个（后台要真数据，见各接口自己的错误处理）。
 */
export async function countDevelopersCached(keyword: string): Promise<number> {
  if (usesUpstreamCatalog()) return 0;
  return countDevelopersCachedRaw(keyword);
}

const listDevelopersCachedRaw = cached(
  async (offset: number, limit: number, keyword: string) =>
    listDevelopers(offset, limit, { keyword }, await countDevelopersCached(keyword)),
  // ⚠️ 键尾版本号改动原因见 consoles.ts 的 listConsolesCached —— 2026-10-16 补日韩文案升到 v4。
  ['developers:list', 'v4'],
  { revalidate: DEVELOPERS_PAGE_REVALIDATE_SECONDS }
);

/** 开发商列表（源站模式回空列表，见上面那段说明）。 */
export async function listDevelopersCached(
  offset: number,
  limit: number,
  keyword: string
): Promise<{ developers: Developer[]; total: number; offset: number; limit: number }> {
  if (usesUpstreamCatalog()) return { developers: [], total: 0, offset, limit };
  return listDevelopersCachedRaw(offset, limit, keyword);
}

/**
 * 首页「按开发商浏览」区块那份缓存的时长（秒）= 24 小时。
 *
 * 和 `DEVELOPERS_PAGE_REVALIDATE_SECONDS` 数值相同，但**刻意各留一个常量**：
 * 服务的是两类页面（列表页 vs 落地页），将来谁想快一点不必牵动另一个。
 * ⚠️ 同样是手抄、不 import（理由见上）。
 */
export const TOP_DEVELOPERS_REVALIDATE_SECONDS = 86400;

/**
 * 「游戏最多的前 N 家开发商」—— 首页那个开发商区块用。
 * 按 game_count 倒序，不是按 created_at。
 */
export async function listTopDevelopers(limit: number): Promise<Developer[]> {
  const rows = await query<DeveloperRow & { game_count: number }>(
    `SELECT id, image_url, founded_year, website, source_slug, created_at, ${GAME_COUNT}
     FROM developers
     ORDER BY game_count DESC, created_at DESC
     LIMIT ?`,
    [limit]
  );
  const textsMap = await loadDeveloperTexts(rows.map((r) => r.id));
  return rows.map((r) => toDeveloper(r, textsMap.get(r.id) ?? {}));
}

const listTopDevelopersCachedRaw = cached(
  async (limit: number) => listTopDevelopers(limit),
  // ⚠️ 同上，2026-10-16 补日韩文案升到 v4。
  ['developers:top', 'v4'],
  { revalidate: TOP_DEVELOPERS_REVALIDATE_SECONDS }
);

/**
 * 首页「按开发商浏览」那一块（源站模式回空数组）。
 *
 * 页面本来就写了 `developers.length > 0` 才画这一块，所以回空 = **整块不出现**，
 * 不会留一排空白卡片。上游没有可替代的开发商数据（见 countDevelopersCached 那段）。
 */
export async function listTopDevelopersCached(limit: number): Promise<Developer[]> {
  if (usesUpstreamCatalog()) return [];
  return listTopDevelopersCachedRaw(limit);
}

/* ================================================================ */
/* 单条读取                                                          */
/* ================================================================ */

/**
 * 按 ID 取一个开发商（前台详情页用）。
 * 不缓存 —— 后台改完资料刷新就该看到新内容。
 */
export async function getDeveloper(id: string): Promise<Developer | null> {
  const rows = await query<DeveloperRow>(
    `SELECT id, image_url, founded_year, website, source_slug, created_at FROM developers WHERE id = ?`,
    [id]
  );
  if (!rows[0]) return null;
  const texts = (await loadDeveloperTexts([id])).get(id) ?? {};
  return toDeveloper(rows[0], texts);
}

/**
 * 前台开发商详情页用的单条资料 —— 源站模式下一律 null（页面走 404，同 `listDevelopersCached`）。
 *
 * ⚠️ **为什么不直接改 `getDeveloper`**：它在**写入路径**上也被用
 *    （`games.ts` 的 `resolveDeveloper`，插入 / 修改游戏时按外键反查厂名写进文案）。
 *    那个判断要是跟着数据源一起切，源站模式下后台存游戏会把开发商整个丢掉。
 */
export async function getDeveloperPageData(id: string): Promise<Developer | null> {
  if (usesUpstreamCatalog()) return null;
  return getDeveloper(id);
}

/** 后台编辑弹窗用：和 `getDeveloper` 同一条查询，但返回 snake_case 的原始行（含 image_url）。 */
export async function getDeveloperRow(id: string): Promise<DeveloperRow | null> {
  const rows = await query<DeveloperRow>(
    `SELECT id, image_url, founded_year, website, source_slug, created_at FROM developers WHERE id = ?`,
    [id]
  );
  return rows[0] ?? null;
}

/* ================================================================ */
/* 后台分页列表（游标翻页）                                          */
/* ================================================================ */

export interface AdminDeveloperPage {
  developers: Developer[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * 后台开发商列表（游标翻页）。
 * 游标 = 最后一条的 created_at + id，拼成 `${createdAt},${id}`。
 */
export async function listAdminDevelopersPage(
  cursor: string | null,
  limit: number,
  { keyword = '' }: { keyword?: string } = {}
): Promise<AdminDeveloperPage> {
  const hasKeyword = keyword.trim().length > 0;
  const pageLimit = Math.min(limit || 10, MAX_PAGE_SIZE);

  let cursorCreatedAt: number | null = null;
  let cursorId: string | null = null;
  if (cursor) {
    const [ts, id] = cursor.split(',');
    cursorCreatedAt = ts ? Number(ts) : null;
    cursorId = id ?? null;
  }

  const rows = await query<DeveloperRow & { game_count: number }>(
    `SELECT id, image_url, founded_year, website, source_slug, created_at, ${GAME_COUNT}
     FROM developers
     WHERE (${cursorCreatedAt === null ? '1=1' : '(created_at < ? OR (created_at = ? AND id > ?))'})
       ${hasKeyword ? "AND (name LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR name_en LIKE ? ESCAPE '\\' OR summary_en LIKE ? ESCAPE '\\')" : ''}
     ORDER BY created_at DESC, id ASC
     LIMIT ?`,
    cursorCreatedAt === null
      ? hasKeyword
        ? [`%${escapeLike(keyword)}%`, `%${escapeLike(keyword)}%`, `%${escapeLike(keyword)}%`, `%${escapeLike(keyword)}%`, pageLimit + 1]
        : [pageLimit + 1]
      : hasKeyword
        ? [cursorCreatedAt, cursorCreatedAt, cursorId, `%${escapeLike(keyword)}%`, `%${escapeLike(keyword)}%`, `%${escapeLike(keyword)}%`, `%${escapeLike(keyword)}%`, pageLimit + 1]
        : [cursorCreatedAt, cursorCreatedAt, cursorId, pageLimit + 1]
  );

  const hasMore = rows.length > pageLimit;
  const slice = hasMore ? rows.slice(0, pageLimit) : rows;
  const textsMap = await loadDeveloperTexts(slice.map((r) => r.id));
  const developers = slice.map((r) => toDeveloper(r, textsMap.get(r.id) ?? {}));

  const last = developers[developers.length - 1];
  const nextCursor = hasMore && last ? `${last.createdAt},${last.id}` : null;

  return { developers, nextCursor, hasMore };
}

/* ================================================================ */
/* 写入 / 更新 / 删除                                                */
/* ================================================================ */

export interface DeveloperInput {
  texts: EntityTexts;
  /** 已经解析好的最终图片地址（没换图就是原来那张），不是上传上来的 File */
  imageUrl: string | null;
  foundedYear: number | null;
  website: string | null;
}

/**
 * 新建开发商。`id` 由调用方生成（和 games / users 同一套 UUID）。
 */
export async function insertDeveloper(
  id: string,
  input: DeveloperInput
): Promise<Developer> {
  const zh = input.texts.zh ?? EMPTY_ENTITY_TEXT;
  const en = input.texts.en ?? EMPTY_ENTITY_TEXT;
  const now = Date.now();

  await query(
    `INSERT INTO developers
       (id, name, name_en, image_url, summary, summary_en,
        description, description_en, founded_year, website, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      zh.name ?? '',
      en.name,
      input.imageUrl,
      zh.summary,
      en.summary,
      zh.description,
      en.description,
      input.foundedYear,
      input.website,
      now,
    ]
  );

  await writeDeveloperTexts(id, input.texts);

  return {
    id,
    texts: input.texts,
    imageUrl: input.imageUrl,
    foundedYear: input.foundedYear,
    website: input.website,
    sourceSlug: null,
    createdAt: now,
    gameCount: 0,
  };
}

/**
 * 更新开发商资料。
 *
 * ⚠️ **改名要级联，而且是两处**：改了开发商名字，所有挂着它的游戏卡片上的厂名必须同步变
 *    （否则开发商页写着「卡普空」、游戏卡片上还是老名字）。
 *
 *    ① `game_texts.developer` —— **前台真正读的那一份**（`localizeTexts` 从侧表取，
 *       卡片 / 详情页资料表 / 个人中心都走它）。漏了这一步 = 改名后一张卡片都不变。
 *    ② `games.developer` / `games.developer_en` —— 只写不读的旧快照列（回滚退路）。
 *       2026-10-16 侧表化时**只改了 ②**，于是「改了名但页面上没变」—— 记在这儿别再犯。
 *
 * ⚠️ 每个语言写**它自己那份名字**（`rawEntityName`，不回退中文），和
 *    `games.ts` 的 `withDeveloper` 是同一条规则。两处不一致的话，改一次名两份数据就漂开。
 *    清空某个语言的名字（侧表那行刚被删掉）时这里会把它写成 `null`，读取时回退中文 —— 正确。
 *
 * ⚠️ 改名时**不改 URL**：开发商详情页地址是 `/developers/<id>`，id 不变、
 *    名字变了链接仍然可达。只有 slug（如果将来做了）才需要重定向。
 */
export async function updateDeveloper(id: string, input: DeveloperInput): Promise<void> {
  const zh = input.texts.zh ?? EMPTY_ENTITY_TEXT;
  const en = input.texts.en ?? EMPTY_ENTITY_TEXT;

  await query(
    `UPDATE developers SET
       name = ?,
       name_en = ?,
       image_url = ?,
       summary = ?,
       summary_en = ?,
       description = ?,
       description_en = ?,
       founded_year = ?,
       website = ?
     WHERE id = ?`,
    [
      zh.name ?? '',
      en.name,
      input.imageUrl,
      zh.summary,
      en.summary,
      zh.description,
      en.description,
      input.foundedYear,
      input.website,
      id,
    ]
  );

  await writeDeveloperTexts(id, input.texts);

  /*
   * ① 侧表里每一份文案的厂名（前台读的就是它）
   *
   * ⚠️ 文案挂的是 **`group_key`**（2026-10-16 起，同款的几个语言版本共用一份），
   *    所以这里要先把「名下游戏的 group_key 有哪些」查出来 —— 直接按 game_id 找不到东西了。
   *    `COALESCE(g.group_key, g.id)` 与 games.ts 里的兜底写法一致（迁移前的老行）。
   */
  for (const locale of CONTENT_LOCALES) {
    await query(
      `UPDATE game_texts SET developer = ?
        WHERE locale = ?
          AND group_key IN (
            SELECT COALESCE(g.group_key, g.id) FROM games g WHERE g.developer_id = ?
          )`,
      [rawEntityName(input.texts, locale), locale, id]
    );
  }

  /* ② 旧快照列（只写不读，留着是为了能回滚到「读宽表」那版代码） */
  await query('UPDATE games SET developer = ? WHERE developer_id = ?', [zh.name ?? '', id]);
  if (en.name) {
    await query('UPDATE games SET developer_en = ? WHERE developer_id = ? AND developer_en IS NOT NULL', [en.name, id]);
  }
}

/** 删开发商（后台用）。调用方已经确认「名下没游戏」。 */
export async function deleteDeveloper(id: string): Promise<void> {
  await query('DELETE FROM developers WHERE id = ?', [id]);
  await query('DELETE FROM developer_texts WHERE developer_id = ?', [id]);
}

/* ================================================================ */
/* 选项 / 计数（给 games 表单和删除校验用）                          */
/* ================================================================ */

/** 添加游戏时的「开发商下拉框」—— 只要 id + 名字，不要整段介绍。 */
export async function listDeveloperOptions(): Promise<{ id: string; name: string }[]> {
  const rows = await query<{ id: string; name: string }>(
    'SELECT id, name FROM developers ORDER BY name ASC'
  );
  return rows;
}

/** 某开发商名下有几款游戏 —— 删除前校验用。 */
export async function countGamesForDeveloper(developerId: string): Promise<number> {
  const rows = await query<{ c: number }>(
    'SELECT COUNT(*) AS c FROM games WHERE developer_id = ?',
    [developerId]
  );
  return rows[0]?.c ?? 0;
}

/* ================================================================ */
/* sitemap stub                                                      */
/* ================================================================ */

export async function listDeveloperStubs(): Promise<{ id: string; createdAt: number }[]> {
  const rows = await query<{ id: string; created_at: number }>(
    'SELECT id, created_at FROM developers ORDER BY created_at DESC'
  );
  return rows.map((row) => ({ id: row.id, createdAt: row.created_at }));
}

/**
 * sitemap 用的开发商 stub。
 *
 * ⚠️ 源站模式下给空数组：那几条详情页会 404（`getDeveloper` 同样回 null，
 *    见上面那段「开发商库没有上游替代」），列进 sitemap 等于交一批死链。
 */
export async function listDeveloperStubsCached(): Promise<{ id: string; createdAt: number }[]> {
  if (usesUpstreamCatalog()) return [];
  return listDeveloperStubsRaw();
}

const listDeveloperStubsRaw = cached(
  async () => listDeveloperStubs(),
  ['developers:stubs'],
  { revalidate: 86400 }
);

/* ================================================================ */
/* 工具                                                              */
/* ================================================================ */

function escapeLike(raw: string): string {
  return raw.replace(/[\\%_]/g, '\\$&');
}
