/*
 * 开发商库（developers 表 + developer_texts 侧表）的读写 —— Supabase（Postgres）版。
 *
 * 对外 API 与旧实现完全一致（`Developer` / `listDevelopersCached` / `getDeveloper` …），
 * 页面只是换了一行 import。
 *
 * ## 与 D1 那份的三处差别（2026-10-20 迁移）
 *
 * ① **主键是上游 slug**（`developers.slug`，如 `nintendo`），不是 UUID ——
 *    和 games 同一套口径，爬取天然幂等，`/developers/<slug>` 地址稳定。
 *    `Developer.id` 仍然是它（对外名字不变）。
 *
 * ② **改名不再需要级联**。旧实现要在改名时把 `game_texts.developer` 和
 *    `games.developer / developer_en` 全部刷一遍 —— 因为厂名是**冗余快照**。
 *    新表里厂名只有 `developer_texts.name` 一份，游戏侧靠 JOIN 取，
 *    改一次四语言、所有卡片一起变。**这是这次迁移白拿的好处，别再把它写回去。**
 *
 * ③ **搜索走侧表**（`developer_texts.name / summary`，四个语言都搜）。
 *    旧实现搜的是 `developers` 宽表里的 `name / name_en / summary / summary_en` 四列。
 */

import { cached } from './cache';
import { mediaUrl } from './media';
import { query } from './pg';
import {
  CONTENT_LOCALES,
  isBlankEntityText,
  localizeEntityTexts,
  type EntityTexts,
  type LocalizedEntityText,
} from '@/lib/entity-text';

/** DB 行（snake_case）。`id` 是 `slug` 的别名，保持对外形状不变。 */
export interface DeveloperRow {
  id: string;
  image_url: string | null;
  founded_year: number | null;
  website: string | null;
  /** 兼容旧字段：新表里 slug 就是上游 slug，所以它恒等于 `id`。 */
  source_slug: string | null;
  created_at: number;
}

/** 对外结构（camelCase，供 API / 前端）。 */
export interface Developer {
  id: string;
  texts: EntityTexts;
  imageUrl: string | null;
  foundedYear: number | null;
  website: string | null;
  sourceSlug: string | null;
  createdAt: number;
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

export const MAX_PAGE_SIZE = 100;

/** 列表筛选条件。 */
export interface DeveloperPageQuery {
  keyword?: string;
}

/* ── 公共片段 ──────────────────────────────────────────────────────────── */

/** 名下游戏数。别名统一用 `d`（下面所有查询都写 `FROM developers d`）。 */
const GAME_COUNT = '(SELECT COUNT(*)::int FROM games g WHERE g.developer_slug = d.slug) AS game_count';

/** 时间列统一转成毫秒数（对外 `createdAt` 一直是这个形状）。 */
const CREATED_MS = '(EXTRACT(EPOCH FROM d.created_at) * 1000)::float8 AS created_at';

/** 列表 / 单条 / 后台共用的列清单。 */
const COLUMNS = `d.slug AS id, d.image_url, d.founded_year, d.website,
  d.slug AS source_slug, ${CREATED_MS}`;

/**
 * 关键词条件（四个语言的 name / summary 都搜）。
 *
 * ⚠️ 占位符写两个 `?` 而不是 SQLite 那种 `?1` 复用 —— `./pg.ts` 的转换是**位置式**的
 *    （`?` → `$1`、`$2`…），`?1` 会被当成 `$1` 后面又跟个 `1`，直接语法错。
 */
function searchWhere(keyword: string): { sql: string; params: unknown[] } {
  const needle = keyword.trim();
  if (!needle) return { sql: '', params: [] };
  return {
    sql: `EXISTS (SELECT 1 FROM developer_texts dt
                   WHERE dt.developer_slug = d.slug
                     AND (dt.name ILIKE ? OR dt.summary ILIKE ?))`,
    params: [`%${needle}%`, `%${needle}%`],
  };
}

function toDeveloper(row: DeveloperRow & { game_count?: number }, texts: EntityTexts = {}): Developer {
  return {
    id: row.id,
    texts,
    // 库里存路径，域名现拼（见 lib/server/media.ts）
    imageUrl: mediaUrl(row.image_url),
    foundedYear: row.founded_year,
    website: row.website,
    sourceSlug: row.source_slug,
    createdAt: row.created_at,
    gameCount: Number(row.game_count ?? 0),
  };
}

/**
 * 批量加载开发商文案（一次 IN，避免 N+1）。
 *
 * ⚠️ **`description`（多段长介绍）默认不查**（2026-10-20）。理由：前台这一侧已经不用它了
 *    （详情页正文改成显示 `summary`），而它是**最重的一列** —— 269 家 × 18 语言，
 *    Supabase 免费版有每月出站流量上限，白拉一遍就是白烧配额。
 *    只有后台（`listAdminDevelopersPage`，编辑表单要回填四个语言的长介绍）传 `true`。
 *
 * ⚠️ 不查的列一律补 `null`，**不是省略 key** —— `EntityText` 三个字段都是必填，
 *    省掉 key 会让 `localizeEntityTexts` 的逐字段回退在某处突然读到 `undefined`。
 */
async function loadDeveloperTexts(
  slugs: string[],
  withDescription = false
): Promise<Map<string, EntityTexts>> {
  if (slugs.length === 0) return new Map();
  const rows = await query<{
    developer_slug: string;
    locale: string;
    name: string | null;
    summary: string | null;
    description?: string | null;
  }>(
    `SELECT developer_slug, locale, name, summary${withDescription ? ', description' : ''}
       FROM developer_texts WHERE developer_slug IN (${slugs.map(() => '?').join(',')})`,
    slugs
  );

  const map = new Map<string, EntityTexts>();
  for (const r of rows) {
    if (!map.has(r.developer_slug)) map.set(r.developer_slug, {});
    map.get(r.developer_slug)![r.locale as import('@/lib/game-text').ContentLocale] = {
      name: r.name,
      summary: r.summary,
      description: withDescription ? (r.description ?? null) : null,
    };
  }
  return map;
}

/**
 * 写文案侧表（upsert）。
 *
 * ⚠️ **只碰调用方真带过来的那几个语言**：传进来的那份里没这个 key =「这次不管」，
 *    不等于清空。带过来但全空的（中文除外）整行删掉 —— 否则「从没填过」和
 *    「填过又清空」在读取时分不出来。
 */
async function writeDeveloperTexts(slug: string, texts: EntityTexts): Promise<void> {
  for (const locale of CONTENT_LOCALES) {
    const t = texts[locale];
    if (!t) continue;

    if (isBlankEntityText(t)) {
      if (locale === 'zh') continue;
      await query('DELETE FROM developer_texts WHERE developer_slug = ? AND locale = ?', [
        slug,
        locale,
      ]);
      continue;
    }

    await query(
      `INSERT INTO developer_texts (developer_slug, locale, name, summary, description, updated_at)
       VALUES (?, ?, ?, ?, ?, now())
       ON CONFLICT (developer_slug, locale) DO UPDATE SET
         name = excluded.name,
         summary = excluded.summary,
         description = excluded.description,
         updated_at = now()`,
      [slug, locale, t.name, t.summary, t.description]
    );
  }
}

/* ── 前台列表 ──────────────────────────────────────────────────────────── */

export async function countDevelopers({ keyword = '' }: DeveloperPageQuery = {}): Promise<number> {
  const search = searchWhere(keyword);
  const rows = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM developers d ${search.sql ? `WHERE ${search.sql}` : ''}`,
    search.params
  );
  return Number(rows[0]?.total ?? 0);
}

/**
 * 前台列表：**按名下游戏数倒序**（2026-10-20 用户要求，原来是按入库时间倒序）。
 *
 * 理由：这一页是「点开发商看他名下的游戏」的入口，访客想先看到的是任天堂、Capcom
 * 这种真有一堆游戏的厂，而不是最后爬进来的某家一款都没有的小工作室。
 *
 * ⚠️ 排序**必须是全序**：`game_count` 有大量并列（几十家都是 0），只按它排时
 *    Postgres 不保证同分行的相对顺序稳定，翻页会漏卡 / 重复。所以后面补
 *    `created_at DESC, slug DESC` 两列兜底 —— 和 `listTopDevelopers` 同一套口径。
 */
export async function listDevelopers(
  offset: number,
  limit: number,
  filter: DeveloperPageQuery = {},
  total?: number
): Promise<{ developers: Developer[]; total: number; offset: number; limit: number }> {
  const search = searchWhere(filter.keyword ?? '');
  const resolvedTotal = total ?? (await countDevelopers(filter));

  const lastOffset = Math.max(0, Math.ceil(resolvedTotal / limit) - 1) * limit;
  let safeOffset = Math.min(Math.max(0, offset), lastOffset);

  const select = (at: number) =>
    query<DeveloperRow & { game_count: number }>(
      `SELECT ${COLUMNS}, ${GAME_COUNT}
         FROM developers d ${search.sql ? `WHERE ${search.sql}` : ''}
        ORDER BY game_count DESC, d.created_at DESC, d.slug DESC LIMIT ? OFFSET ?`,
      [...search.params, limit, at]
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

/** 列表页与首页「游戏最多的前 N 家」的 TTL（秒）= 7 天（2026-10-22 迁 Vercel、去 ISR 后从 30 天压回来）。 */
export const DEVELOPERS_PAGE_REVALIDATE_SECONDS = 604800;
export const TOP_DEVELOPERS_REVALIDATE_SECONDS = 604800;

const countDevelopersCachedRaw = cached(
  async (keyword: string) => countDevelopers({ keyword }),
  ['sb:developers:count', 'v1'],
  { revalidate: DEVELOPERS_PAGE_REVALIDATE_SECONDS }
);

export async function countDevelopersCached(keyword: string): Promise<number> {
  return countDevelopersCachedRaw(keyword);
}

/**
 * 列表缓存键 v5：2026-10-20 起 `loadDeveloperTexts` 不再查 `description`，
 * 条目里那层 `texts` 的形状变了（v4 是补厂标那次）。
 */
const listDevelopersCachedRaw = cached(
  async (offset: number, limit: number, keyword: string) =>
    listDevelopers(offset, limit, { keyword }, await countDevelopers({ keyword })),
  ['sb:developers:list', 'v5'],
  { revalidate: DEVELOPERS_PAGE_REVALIDATE_SECONDS }
);

export async function listDevelopersCached(
  offset: number,
  limit: number,
  keyword: string
): Promise<{ developers: Developer[]; total: number; offset: number; limit: number }> {
  return listDevelopersCachedRaw(offset, limit, keyword);
}

/** 「游戏最多的前 N 家」—— 首页区块用，按 game_count 倒序。 */
export async function listTopDevelopers(limit: number): Promise<Developer[]> {
  const rows = await query<DeveloperRow & { game_count: number }>(
    `SELECT ${COLUMNS}, ${GAME_COUNT}
       FROM developers d
      ORDER BY game_count DESC, d.created_at DESC
      LIMIT ?`,
    [limit]
  );
  const textsMap = await loadDeveloperTexts(rows.map((r) => r.id));
  return rows.map((r) => toDeveloper(r, textsMap.get(r.id) ?? {}));
}

/** 同上，首页「游戏最多的前 N 家」也得跟着失效（v4 = 不再查 `description` 那次）。 */
const listTopDevelopersCachedRaw = cached(
  async (limit: number) => listTopDevelopers(limit),
  ['sb:developers:top', 'v4'],
  { revalidate: TOP_DEVELOPERS_REVALIDATE_SECONDS }
);

export async function listTopDevelopersCached(limit: number): Promise<Developer[]> {
  return listTopDevelopersCachedRaw(limit);
}

/* ── 单条 ──────────────────────────────────────────────────────────────── */

export async function getDeveloper(id: string): Promise<Developer | null> {
  const rows = await query<DeveloperRow>(
    `SELECT ${COLUMNS} FROM developers d WHERE d.slug = ?`,
    [id]
  );
  if (!rows[0]) return null;
  const texts = (await loadDeveloperTexts([id])).get(id) ?? {};
  return toDeveloper(rows[0], texts);
}

/** 前台详情页用 —— 与 `getDeveloper` 同一份（源站模式已删）。 */
export async function getDeveloperPageData(id: string): Promise<Developer | null> {
  return getDeveloper(id);
}

export async function getDeveloperRow(id: string): Promise<DeveloperRow | null> {
  const rows = await query<DeveloperRow>(
    `SELECT ${COLUMNS} FROM developers d WHERE d.slug = ?`,
    [id]
  );
  return rows[0] ?? null;
}

/* ── 后台列表（游标翻页） ──────────────────────────────────────────────── */

export interface AdminDeveloperPage {
  developers: Developer[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * 后台列表：游标 = `${createdAt},${id}`。
 *
 * ⚠️ 游标比较用**毫秒数**（`EXTRACT(EPOCH…)`），不直接比 `created_at` ——
 *    游标里存的是 number，拿它跟 `timestamptz` 比会被 Postgres 拒掉。
 *    269 行的表，走不走索引无所谓；真长到几十万行再改成 `to_timestamp(?/1000)`。
 */
export async function listAdminDevelopersPage(
  cursor: string | null,
  limit: number,
  { keyword = '' }: { keyword?: string } = {}
): Promise<AdminDeveloperPage> {
  const pageLimit = Math.min(limit || 10, MAX_PAGE_SIZE);
  const search = searchWhere(keyword);

  let cursorCreatedAt: number | null = null;
  let cursorId: string | null = null;
  if (cursor) {
    const [ts, id] = cursor.split(',');
    cursorCreatedAt = ts ? Number(ts) : null;
    cursorId = id ?? null;
  }

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (search.sql) {
    conditions.push(search.sql);
    params.push(...search.params);
  }
  if (cursorCreatedAt !== null) {
    conditions.push(
      `((EXTRACT(EPOCH FROM d.created_at) * 1000) < ? OR ((EXTRACT(EPOCH FROM d.created_at) * 1000) = ? AND d.slug > ?))`
    );
    params.push(cursorCreatedAt, cursorCreatedAt, cursorId);
  }

  const rows = await query<DeveloperRow & { game_count: number }>(
    `SELECT ${COLUMNS}, ${GAME_COUNT}
       FROM developers d
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY d.created_at DESC, d.slug ASC
      LIMIT ?`,
    [...params, pageLimit + 1]
  );

  const hasMore = rows.length > pageLimit;
  const slice = hasMore ? rows.slice(0, pageLimit) : rows;
  const textsMap = await loadDeveloperTexts(slice.map((r) => r.id), true);
  const developers = slice.map((r) => toDeveloper(r, textsMap.get(r.id) ?? {}));

  const last = developers[developers.length - 1];
  const nextCursor = hasMore && last ? `${last.createdAt},${last.id}` : null;

  return { developers, nextCursor, hasMore };
}

/* ── 写入 ──────────────────────────────────────────────────────────────── */

export interface DeveloperInput {
  texts: EntityTexts;
  /** 已经解析好的最终图片地址（没换图就是原来那张），不是上传上来的 File */
  imageUrl: string | null;
  foundedYear: number | null;
  website: string | null;
}

/** 新建开发商。`id` 由调用方给（后台用 randomUUID，和 games / users 同一套）。 */
export async function insertDeveloper(id: string, input: DeveloperInput): Promise<Developer> {
  await query(
    `INSERT INTO developers (slug, image_url, founded_year, website)
     VALUES (?, ?, ?, ?)`,
    [id, input.imageUrl, input.foundedYear, input.website]
  );

  await writeDeveloperTexts(id, input.texts);

  return {
    id,
    texts: input.texts,
    imageUrl: input.imageUrl,
    foundedYear: input.foundedYear,
    website: input.website,
    sourceSlug: id,
    createdAt: Date.now(),
    gameCount: 0,
  };
}

/**
 * 更新开发商资料。
 *
 * ⚠️ **不再需要级联**（见文件头 ②）：厂名只有 `developer_texts.name` 一份，
 *    游戏的开发商名是 JOIN 出来的。旧实现那三段 UPDATE（game_texts / games.developer /
 *    games.developer_en）**已经删掉**，别照着老代码补回来 —— 新表里没有那两列。
 */
export async function updateDeveloper(id: string, input: DeveloperInput): Promise<void> {
  await query(
    `UPDATE developers SET image_url = ?, founded_year = ?, website = ? WHERE slug = ?`,
    [input.imageUrl, input.foundedYear, input.website, id]
  );

  await writeDeveloperTexts(id, input.texts);
}

/** 删开发商（后台用）。文案行由外键 `on delete cascade` 一起清。 */
export async function deleteDeveloper(id: string): Promise<void> {
  await query('DELETE FROM developers WHERE slug = ?', [id]);
}

/* ── 选项 / 计数 ───────────────────────────────────────────────────────── */

/** 添加游戏时的「开发商下拉框」—— 只要 id + 名字（中文那份，空了回退 slug）。 */
export async function listDeveloperOptions(): Promise<{ id: string; name: string }[]> {
  const rows = await query<{ id: string; name: string }>(
    `SELECT d.slug AS id, COALESCE(t.name, d.slug) AS name
       FROM developers d
       LEFT JOIN developer_texts t ON t.developer_slug = d.slug AND t.locale = 'zh'
      ORDER BY name ASC`
  );
  return rows;
}

/** 某开发商名下有几款游戏 —— 删除前校验用。 */
export async function countGamesForDeveloper(developerId: string): Promise<number> {
  const rows = await query<{ c: number }>(
    'SELECT COUNT(*)::int AS c FROM games WHERE developer_slug = ?',
    [developerId]
  );
  return Number(rows[0]?.c ?? 0);
}

/* ── sitemap stub ──────────────────────────────────────────────────────── */

export async function listDeveloperStubs(): Promise<{ id: string; createdAt: number }[]> {
  const rows = await query<{ id: string; created_at: number }>(
    `SELECT slug AS id, (EXTRACT(EPOCH FROM created_at) * 1000)::float8 AS created_at
       FROM developers ORDER BY created_at DESC`
  );
  return rows.map((row) => ({ id: row.id, createdAt: row.created_at }));
}

export async function listDeveloperStubsCached(): Promise<{ id: string; createdAt: number }[]> {
  return listDeveloperStubsRaw();
}

const listDeveloperStubsRaw = cached(
  async () => listDeveloperStubs(),
  ['sb:developers:stubs', 'v1'],
  { revalidate: 86400 }
);
