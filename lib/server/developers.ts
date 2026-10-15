/*
 * 开发商库（developers 表）的读写。
 *
 * 和 games.ts 的分工：那边管游戏条目，这边管「做游戏的公司」。两者靠
 * `games.developer_id` 关联 —— 用户要「点开发商就出他名下的所有游戏」，
 * 那这条链必须是真的外键（名字是自由文本时，改一个字所有游戏就断链）。
 *
 * ⚠️ **本文件不许 import `./games.ts`**（单向依赖：games → developers）。
 * 需要「某个开发商下面有几款游戏」时直接写一条 COUNT 查询，别绕回来调
 * `listGamesPage` —— 那会形成循环依赖，而且为了一个数字把整页数据拉一遍也不划算。
 *
 * ## 双语（2026-10-13 加）
 *
 * `name` / `summary` / `description` 各有一份 `_en`（后缀 = 英文，无后缀 = 中文原文）。
 * ⚠️ 和 games 一样，`Developer` **两种语言都带**，选哪份由 `localizeDeveloper` 做 ——
 *    取值下放到渲染时，别在数据层按语言裁剪（理由见 games.ts 文件头那段）。
 *    列表读取也走缓存，缓存键同样不含语言。
 */

import { cached } from './cache';
import { query } from './d1';
import type { Locale } from '@/lib/i18n';

/** DB 行（snake_case）。 */
export interface DeveloperRow {
  id: string;
  name: string;
  /** 名字英文（可空）。空 = 英文站回退 `name`。2026-10-13 加。 */
  name_en: string | null;
  image_url: string | null;
  summary: string | null;
  /** 简介英文（可空）。2026-10-13 加。 */
  summary_en: string | null;
  description: string | null;
  /** 介绍英文（可空）。2026-10-13 加。 */
  description_en: string | null;
  founded_year: number | null;
  website: string | null;
  created_at: number;
}

/** 对外结构（camelCase，供 API / 前端）。 */
export interface Developer {
  id: string;
  name: string;
  /** 空 = 英文站回退 `name` */
  nameEn: string | null;
  imageUrl: string | null;
  /** 简介：一句话，列表卡片上用 */
  summary: string | null;
  summaryEn: string | null;
  /** 介绍：整段，开发商详情页正文用 */
  description: string | null;
  descriptionEn: string | null;
  foundedYear: number | null;
  website: string | null;
  createdAt: number;
  /**
   * 名下游戏数。**列表和单条查询都会顺带算出来**（一条相关子查询），
   * 省得前台为「共 N 款」再打一次接口。
   */
  gameCount: number;
}

/** `localizeDeveloper` 的产物：三条文案字段各选定一份语言。 */
export interface LocalizedDeveloperText {
  name: string;
  summary: string | null;
  description: string | null;
}

/**
 * 按语言取一条开发商的文案。**英文站空值回退中文**（和 games 的 `localizeGame` 同一规则）。
 * 纯函数，不碰数据库。
 */
export function localizeDeveloper(developer: Developer, locale: Locale): LocalizedDeveloperText {
  if (locale !== 'zh') {
    return {
      name: developer.nameEn || developer.name,
      summary: developer.summaryEn || developer.summary,
      description: developer.descriptionEn || developer.description,
    };
  }
  return {
    name: developer.name,
    summary: developer.summary,
    description: developer.description,
  };
}

/** 每页条数的上限。和 games 那边同一个量级，顺手把「一次全捞」的口子堵死。 */
export const MAX_PAGE_SIZE = 100;

/** 下拉框一次最多给多少条。开发商是「几十个」这个量级，一次给全比做二级搜索省事。 */
const OPTIONS_LIMIT = 1000;

/** 「名下有几款游戏」那条相关子查询 —— 列表和单条都要它，别两处各写一份。 */
const GAME_COUNT = '(SELECT COUNT(*) FROM games g WHERE g.developer_id = developers.id) AS game_count';

function toDeveloper(row: DeveloperRow & { game_count?: number }): Developer {
  return {
    id: row.id,
    name: row.name,
    nameEn: row.name_en,
    imageUrl: row.image_url,
    summary: row.summary,
    summaryEn: row.summary_en,
    description: row.description,
    descriptionEn: row.description_en,
    foundedYear: row.founded_year,
    website: row.website,
    createdAt: row.created_at,
    gameCount: Number(row.game_count ?? 0),
  };
}

/** 列表筛选条件。`keyword` 模糊匹配 name / summary（不区分大小写，`LIKE` 的默认行为）。 */
export interface DeveloperPageQuery {
  keyword?: string;
}

/**
 * 搜索条件。⚠️ 2026-10-13 起**中英两份都搜**（同 games 的 SEARCH_CONDITION 那条理由：
 * 搜索在服务端按页做，语言不该进缓存键；两边都搜对用户是纯收益）。
 *
 * 和 games 那边不同，这里**没有把绑定值写死成 ?1**（统一用 `?1` / `?1`），
 * 所以调用方仍需保证关键词是第 1 个绑定参数 —— 见 listDevelopers。
 */
const SEARCH_CONDITION = '(name LIKE ?1 OR summary LIKE ?1 OR name_en LIKE ?1 OR summary_en LIKE ?1)';

/**
 * 只数总数，不取数据。
 *
 * 和 `listDevelopers` 拆开的理由同 games.ts 的 `countGames`（2026-10-14）：前台那份
 * 总数要走 `countDevelopersCached` —— 那个缓存的键里**没有 offset**，翻多少页都只数
 * 一次；而 `listDevelopersCached` 的键含 offset，每翻一页都是新条目、都要各自数一遍全表。
 */
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

/** 游标 = `created_at:id`。id 是 UUID、不含冒号，按第一个冒号切就够（games.ts / comments.ts 同款）。 */
function encodeDeveloperCursor(developer: Pick<Developer, 'createdAt' | 'id'>): string {
  return `${developer.createdAt}:${developer.id}`;
}

function decodeDeveloperCursor(raw: string | null | undefined): { createdAt: number; id: string } | null {
  if (!raw) return null;
  const at = raw.indexOf(':');
  if (at <= 0) return null;
  const createdAt = Number(raw.slice(0, at));
  const id = raw.slice(at + 1);
  if (!Number.isFinite(createdAt) || !id) return null;
  return { createdAt, id };
}

/** `listAdminDevelopersPage` 的返回。没有 total —— 理由同 games.ts 的 AdminGamePage。 */
export interface AdminDeveloperPage {
  developers: Developer[];
  /** 往后翻的游标；null = 后面没有了。 */
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * 后台列表的**游标翻页** —— 理由与形状同 games.ts 的 `listAdminGamesPage`
 * （2026-10-14 用户拍板：后台改游标、总数去掉）。搜索条件与 `listDevelopers`
 * 同一份 `SEARCH_CONDITION`，关键词仍是第 1 个绑定参数。
 */
export async function listAdminDevelopersPage(
  cursor: string | null,
  limit: number,
  { keyword = '' }: DeveloperPageQuery = {}
): Promise<AdminDeveloperPage> {
  const decoded = decodeDeveloperCursor(cursor);
  const needle = keyword.trim();

  const conditions: string[] = [];
  /** 绑定值，按占位符编号顺序排（关键词必须第 1 个，理由见 SEARCH_CONDITION 注释）。 */
  const params: unknown[] = [];

  if (needle) {
    conditions.push(SEARCH_CONDITION);
    params.push(`%${needle}%`);
  }
  if (decoded) {
    conditions.push(
      `(created_at < ?${params.length + 1} OR (created_at = ?${params.length + 1} AND id < ?${params.length + 2}))`
    );
    params.push(decoded.createdAt, decoded.id);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await query<DeveloperRow & { game_count: number }>(
    `SELECT developers.*, ${GAME_COUNT} FROM developers ${where}
      ORDER BY created_at DESC, id DESC LIMIT ?${params.length + 1}`,
    [...params, limit + 1]
  );

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(toDeveloper);
  const last = items[items.length - 1];

  return {
    developers: items,
    hasMore,
    nextCursor: hasMore && last ? encodeDeveloperCursor(last) : null,
  };
}

/**
 * 分页读取开发商列表，顺带给出每个名下的游戏数。
 *
 * 排序键和 games 那边同一个理由用两个：`created_at` 是毫秒时间戳，批量导入时
 * 很容易撞上同值，而 SQLite 对并列行不保证顺序稳定 ⇒ 会出现「某条在第 1 页和第 2 页
 * 各出现一次，另一条谁也见不着」。拿 `id` 兜底。
 *
 * 越界同样**夹回最后一页**并把夹过的 offset 返回，调用方以返回值为准（和 listGamesPage 一套）。
 *
 * ⚠️ **公开列表页请用 `listDevelopersCached`**（带 12 小时缓存，见下）。本函数保持无缓存；
 *    后台列表 2026-10-14 起改走 `listAdminDevelopersPage`（游标式），现在已没有
 *    「必须实时」的调用方 —— 这个函数只剩前台缓存层在用，留着是无缓存的兜底。
 */
export async function listDevelopers(
  offset: number,
  limit: number,
  filter: DeveloperPageQuery = {},
  total?: number
): Promise<{ developers: Developer[]; total: number; offset: number; limit: number }> {
  const needle = filter.keyword?.trim() ?? '';
  const where = needle ? `WHERE ${SEARCH_CONDITION}` : '';
  const params = needle ? [`%${needle}%`] : [];

  // 传了就用（前台走 countDevelopersCached 那份，省一次全表 COUNT）。
  const resolvedTotal = total ?? (await countDevelopers(filter));

  const lastOffset = Math.max(0, Math.ceil(resolvedTotal / limit) - 1) * limit;
  let safeOffset = Math.min(offset, lastOffset);

  const select = (at: number) =>
    query<DeveloperRow & { game_count: number }>(
      `SELECT developers.*, ${GAME_COUNT} FROM developers ${where}
        ORDER BY created_at DESC, id DESC LIMIT ?${params.length + 1} OFFSET ?${params.length + 2}`,
      [...params, limit, at]
    );

  let rows = await select(safeOffset);

  // 夹到的「最后一页」竟然是空的（末页刚被删空）—— 一次退到真正的上一页。
  if (rows.length === 0 && safeOffset > 0) {
    safeOffset = Math.max(0, safeOffset - limit);
    rows = await select(safeOffset);
  }

  return { developers: rows.map(toDeveloper), total: resolvedTotal, offset: safeOffset, limit };
}

/**
 * 开发商列表页（`/developers`）那份缓存的时长（秒）= 12 小时。
 *
 * 和 `TOP_DEVELOPERS_REVALIDATE_SECONDS` 数值相同，但**刻意各留一个常量** ——
 * 服务的是两个页面，将来谁想快一点 / 慢一点不必牵动另一个。
 *
 * ⚠️ 2026-10-14 前台列表统一 12 小时之后，这个数也和 `games.ts` 的
 *    `GAMES_PAGE_REVALIDATE_SECONDS` 撞上了 —— 数值巧合，语义仍各管一摊。
 */
export const DEVELOPERS_PAGE_REVALIDATE_SECONDS = 43200;

/**
 * 「总数」的独立缓存 —— 理由同 games.ts 的 `countGamesCached`：
 * `listDevelopersCached` 的键含 offset，每翻一页都要各自数一遍全表；
 * 挪到这一层（键里没有 offset）之后，12 小时内无论翻到第几页只数一次。
 */
export const countDevelopersCached = cached(
  async (keyword: string) => countDevelopers({ keyword }),
  ['developers:count'],
  { revalidate: DEVELOPERS_PAGE_REVALIDATE_SECONDS }
);

/**
 * 带缓存的列表读取 —— **只给 `/developers` 列表页用**，别处的调用方继续用 `listDevelopers`。
 *
 * 后台那几条路径（`/api/admin/developers` 的列表走 `listAdminDevelopersPage`、增删改之后的
 * 复核走未缓存的函数）**必须实时**：刚改完的名字、刚建好的开发商，后台一刷新就该看到 ——
 * 那是 bug 不是缓存。所以缓存是
 * **页面这一侧的策略**，不下沉进 `listDevelopers`（和 `listGamesPageCached` 同一条规矩）。
 *
 * 参数刻意都是**扁平的基本类型**（offset / limit / keyword），而不是收一个 `DeveloperPageQuery`
 * 对象：`unstable_cache` 把入参当作缓存键的一部分，扁平参数拼出来的键稳定可读，
 * 传对象则依赖属性的序列化顺序，将来加个字段可能悄悄改变键、把缓存打散。
 *
 * 缓存键里**没有语言这一维** —— 这是有意的，也正是 `Developer` 把中英两份都带出来的原因
 * （见文件头那段）：中英文访客共用同一份缓存，用哪份由页面调 `localizeDeveloper` 决定。
 */
export const listDevelopersCached = cached(
  async (offset: number, limit: number, keyword: string) =>
    listDevelopers(
      offset,
      limit,
      { keyword },
      // 总数走独立缓存（键里没有 offset）—— 翻多少页都只数一次，见 countDevelopersCached。
      await countDevelopersCached(keyword)
    ),
  // v2：2026-10-13 给 developers 表批量补了厂标（image_url），旧键里缓存的还是
  // 全 null 的快照 —— 不换键的话列表页要等 12 小时才露图。下次批量改库再照此升 v3。
  ['developers:list', 'v2'],
  { revalidate: DEVELOPERS_PAGE_REVALIDATE_SECONDS }
);

/**
 * 首页那个「按开发商浏览」区块的 TTL（秒）= 12 小时。
 *
 * ⚠️ 和 `lib/server/games.ts` 的 `HOME_REVALIDATE_SECONDS` 必须一致 —— 本文件不许
 *    import `./games.ts`，这里是手抄的；数值漂了不会报错，只会让首页两个区块分家。
 */
export const TOP_DEVELOPERS_REVALIDATE_SECONDS = 43200;

/**
 * 「游戏最多的前 N 家开发商」—— 首页那个开发商区块用。
 *
 * 为什么不是复用 `listDevelopers`：那个按 `created_at DESC` 排（列表页要「最新登记的
 * 在最前」），而首页想说的是「库里的主力厂商是谁」—— 那是**按游戏数**排，
 * 排序键不同就是两个不同的查询，硬塞成一个只会让两边的注释都说不清。
 *
 * `WHERE EXISTS (…)` 把「一款游戏都没有」的开发商滤掉：它们在这个区块里只会是
 * 一张写着 `0` 的卡片，占着位置却不指向任何内容。
 * （**不能用 `WHERE game_count > 0`** —— SQLite 的 WHERE 里看不见 SELECT 的别名，
 * 得把那条子查询原样再写一遍。）
 *
 * 并列时用名字兜底排序：游戏数相同的厂商在两次查询之间顺序必须稳定，
 * 否则「同一个开发商今天在第二张卡、明天在第三张」，看着像内容在乱跳。
 */
export async function listTopDevelopers(limit: number): Promise<Developer[]> {
  const rows = await query<DeveloperRow & { game_count: number }>(
    `SELECT developers.*, ${GAME_COUNT} FROM developers
      WHERE EXISTS (SELECT 1 FROM games g WHERE g.developer_id = developers.id)
      ORDER BY game_count DESC, developers.name COLLATE NOCASE ASC LIMIT ?`,
    [limit]
  );
  return rows.map(toDeveloper);
}

/**
 * `listTopDevelopers` 的缓存版 —— **只给首页用**。
 *
 * ⚠️ 开发商列表页（`/developers`）**不用它** —— 那一页按 `created_at` 排（要「最新登记的
 *    在最前」），和这里「按游戏数排」是两个查询；它自己有 `listDevelopersCached`
 *    （同样是 12 小时，键前缀 `developers:list`，和这里的 `developers:top` 各存各的）。
 *    首页是另一回事 —— 它是一个由 D1 拼出来的落地页，每个访客都重查一遍没必要。
 *    缓存留在「页面这一侧」，和 games 那边同一条规矩。
 */
export const listTopDevelopersCached = cached(
  async (limit: number) => listTopDevelopers(limit),
  // v2：同 listDevelopersCached —— 2026-10-13 批量补厂标后旧键里的快照没有 image_url。
  ['developers:top', 'v2'],
  { revalidate: TOP_DEVELOPERS_REVALIDATE_SECONDS }
);

/**
 * 全部的 id + name，按名字排序 —— 给后台「添加游戏」那个开发商下拉框用。
 *
 * 为什么单独一个查询而不是复用 `listDevelopers`：那个带分页、带游戏数子查询，
 * 而下拉框要的是**完整的一份**（缺一个名字，后台就没法给游戏选它）。
 * 只取两列，几百条也就几 KB。
 */
export async function listDeveloperOptions(): Promise<{ id: string; name: string }[]> {
  const rows = await query<{ id: string; name: string }>(
    `SELECT id, name FROM developers ORDER BY name COLLATE NOCASE ASC LIMIT ${OPTIONS_LIMIT}`
  );
  return rows;
}

/** 按 id 取原始行（带 image_url 等，服务端自己用）。 */
export async function getDeveloperRow(id: string): Promise<DeveloperRow | null> {
  const rows = await query<DeveloperRow>('SELECT * FROM developers WHERE id = ?', [id]);
  return rows[0] ?? null;
}

/**
 * 官网地址的收敛：只放行 http / https，没写协议就补上 `https://`。
 *
 * ⚠️ 为什么要卡协议：这个值最终会进 `<a href>`，而 React **不做 URL 消毒** ——
 * `javascript:...` 会被原样塞进 href，后台账号被钓走时这一步就是一个 XSS 跳板。
 * 认不出来的一律存 null，宁可少一个链接。
 */
export function normalizeWebsite(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;

  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** 按 id 取**对外结构**（带游戏数）。公开的开发商页与接口都走它。 */
export async function getDeveloper(id: string): Promise<Developer | null> {
  const rows = await query<DeveloperRow & { game_count: number }>(
    `SELECT developers.*, ${GAME_COUNT} FROM developers WHERE id = ?`,
    [id]
  );
  return rows[0] ? toDeveloper(rows[0]) : null;
}

/** 某个开发商名下有几款游戏。后台删除前的占用检查用。 */
export async function countGamesForDeveloper(id: string): Promise<number> {
  const rows = await query<{ n: number }>(
    'SELECT COUNT(*) AS n FROM games WHERE developer_id = ?',
    [id]
  );
  return Number(rows[0]?.n ?? 0);
}

export interface NewDeveloper {
  /** 由调用方生成：上传厂标前要先拿它拼 R2 对象 key，所以 id 不能在插入时才产生。 */
  id: string;
  name: string;
  nameEn: string | null;
  imageUrl: string | null;
  summary: string | null;
  summaryEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  foundedYear: number | null;
  website: string | null;
}

export async function insertDeveloper(input: NewDeveloper): Promise<Developer> {
  const createdAt = Date.now();
  await query(
    `INSERT INTO developers
       (id, name, name_en, image_url, summary, summary_en, description, description_en,
        founded_year, website, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.name,
      input.nameEn,
      input.imageUrl,
      input.summary,
      input.summaryEn,
      input.description,
      input.descriptionEn,
      input.foundedYear,
      input.website,
      createdAt,
    ]
  );

  // 新建的开发商名下必然还没有游戏，gameCount 直接给 0，不必再查一次
  return {
    id: input.id,
    name: input.name,
    nameEn: input.nameEn,
    imageUrl: input.imageUrl,
    summary: input.summary,
    summaryEn: input.summaryEn,
    description: input.description,
    descriptionEn: input.descriptionEn,
    foundedYear: input.foundedYear,
    website: input.website,
    createdAt,
    gameCount: 0,
  };
}

export interface DeveloperPatch {
  name: string;
  nameEn: string | null;
  /** 已经解析好的最终地址（没换图就是原来那张），不是上传上来的 File */
  imageUrl: string | null;
  summary: string | null;
  summaryEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  foundedYear: number | null;
  website: string | null;
}

/**
 * 改一条开发商。**改名会级联到游戏上**。
 *
 * 为什么必须级联：`games.developer`（那列自由文本快照）还在被搜索、列表卡片、
 * 详情页资料表和 JSON-LD 的 author 读着（见 db/schema.sql 里那段说明）。
 * 不跟着改的话，开发商页上写着新名字、游戏卡片上还是旧名字 —— 用户点进去
 * 会觉得「这游戏怎么不在他名下」。
 *
 * ⚠️ 2026-10-13 起**两份名字都级联**（`developer` 与 `developer_en`）—— 只改中文的话，
 *    英文站上那批游戏的卡片会停在旧英文名。
 *
 * 只按 `developer_id = ?` 去改，**不动**那些只填了文字、没接上 id 的行：
 * 那种行是不是指同一个公司，我们无从判断，宁可少改也不能误伤。
 */
export async function updateDeveloper(id: string, patch: DeveloperPatch): Promise<void> {
  const before = await getDeveloperRow(id);

  await query(
    `UPDATE developers
        SET name = ?, name_en = ?, image_url = ?, summary = ?, summary_en = ?,
            description = ?, description_en = ?, founded_year = ?, website = ?
      WHERE id = ?`,
    [
      patch.name,
      patch.nameEn,
      patch.imageUrl,
      patch.summary,
      patch.summaryEn,
      patch.description,
      patch.descriptionEn,
      patch.foundedYear,
      patch.website,
      id,
    ]
  );

  if (before && (before.name !== patch.name || before.name_en !== patch.nameEn)) {
    await query('UPDATE games SET developer = ?, developer_en = ? WHERE developer_id = ?', [
      patch.name,
      patch.nameEn,
      id,
    ]);
  }
}

/**
 * 删一条开发商。
 *
 * ⚠️ **名下有游戏时不许删**（由调用方先查 `countGamesForDeveloper` 拦下）。
 * 这里不做兜底 —— 那是接口层的职责，写在这里会让「谁拦的」变得含糊。
 * 调用方删完记录后自己负责清理 R2 上那张厂标（见 api/admin/developers/[id] 的 DELETE）。
 */
export async function deleteDeveloper(id: string): Promise<void> {
  await query('DELETE FROM developers WHERE id = ?', [id]);
}

/**
 * 全部开发商的「骨架」（只有 id 与创建时间），给 sitemap 用。
 * 理由和 `listGameStubs` 一样：sitemap 要一条不漏，而 `listDevelopers` 被
 * `MAX_PAGE_SIZE` 卡在 100 条，还带了一圈用不上的列。
 */
export async function listDeveloperStubs(): Promise<{ id: string; createdAt: number }[]> {
  const rows = await query<{ id: string; created_at: number }>(
    'SELECT id, created_at FROM developers ORDER BY created_at DESC, id DESC LIMIT 20000'
  );
  return rows.map((row) => ({ id: row.id, createdAt: row.created_at }));
}

/**
 * sitemap 用的 stub 读取 —— 缓存 24 小时（2026-10-15 从 1 小时改过来，理由同
 * games.ts 的 listGameStubsCached：sitemap 每次被抓都现读全表，爬虫反复来）。
 */
export const listDeveloperStubsCached = cached(
  async () => listDeveloperStubs(),
  ['developers:stubs'],
  { revalidate: 86400 }
);
