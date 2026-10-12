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
 */

import { query } from './d1';

/** DB 行（snake_case）。 */
export interface DeveloperRow {
  id: string;
  name: string;
  image_url: string | null;
  summary: string | null;
  description: string | null;
  founded_year: number | null;
  website: string | null;
  created_at: number;
}

/** 对外结构（camelCase，供 API / 前端）。 */
export interface Developer {
  id: string;
  name: string;
  imageUrl: string | null;
  /** 简介：一句话，列表卡片上用 */
  summary: string | null;
  /** 介绍：整段，开发商详情页正文用 */
  description: string | null;
  foundedYear: number | null;
  website: string | null;
  createdAt: number;
  /**
   * 名下游戏数。**列表和单条查询都会顺带算出来**（一条相关子查询），
   * 省得前台为「共 N 款」再打一次接口。
   */
  gameCount: number;
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
    imageUrl: row.image_url,
    summary: row.summary,
    description: row.description,
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
 * 分页读取开发商列表，顺带给出每个名下的游戏数。
 *
 * 排序键和 games 那边同一个理由用两个：`created_at` 是毫秒时间戳，批量导入时
 * 很容易撞上同值，而 SQLite 对并列行不保证顺序稳定 ⇒ 会出现「某条在第 1 页和第 2 页
 * 各出现一次，另一条谁也见不着」。拿 `id` 兜底。
 *
 * 越界同样**夹回最后一页**并把夹过的 offset 返回，调用方以返回值为准（和 listGamesPage 一套）。
 */
export async function listDevelopers(
  offset: number,
  limit: number,
  { keyword = '' }: DeveloperPageQuery = {}
): Promise<{ developers: Developer[]; total: number; offset: number; limit: number }> {
  const needle = keyword.trim();
  const where = needle ? 'WHERE name LIKE ?1 OR summary LIKE ?1' : '';
  const params = needle ? [`%${needle}%`] : [];

  const total = Number(
    (
      await query<{ total: number }>(
        `SELECT COUNT(*) AS total FROM developers ${where}`,
        params
      )
    )[0]?.total ?? 0
  );

  const lastOffset = Math.max(0, Math.ceil(total / limit) - 1) * limit;
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

  return { developers: rows.map(toDeveloper), total, offset: safeOffset, limit };
}

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
  imageUrl: string | null;
  summary: string | null;
  description: string | null;
  foundedYear: number | null;
  website: string | null;
}

export async function insertDeveloper(input: NewDeveloper): Promise<Developer> {
  const createdAt = Date.now();
  await query(
    `INSERT INTO developers
       (id, name, image_url, summary, description, founded_year, website, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.name,
      input.imageUrl,
      input.summary,
      input.description,
      input.foundedYear,
      input.website,
      createdAt,
    ]
  );

  // 新建的开发商名下必然还没有游戏，gameCount 直接给 0，不必再查一次
  return {
    id: input.id,
    name: input.name,
    imageUrl: input.imageUrl,
    summary: input.summary,
    description: input.description,
    foundedYear: input.foundedYear,
    website: input.website,
    createdAt,
    gameCount: 0,
  };
}

export interface DeveloperPatch {
  name: string;
  /** 已经解析好的最终地址（没换图就是原来那张），不是上传上来的 File */
  imageUrl: string | null;
  summary: string | null;
  description: string | null;
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
 * 只按 `developer_id = ?` 去改，**不动**那些只填了文字、没接上 id 的行：
 * 那种行是不是指同一个公司，我们无从判断，宁可少改也不能误伤。
 */
export async function updateDeveloper(id: string, patch: DeveloperPatch): Promise<void> {
  const before = await getDeveloperRow(id);

  await query(
    `UPDATE developers
        SET name = ?, image_url = ?, summary = ?, description = ?, founded_year = ?, website = ?
      WHERE id = ?`,
    [
      patch.name,
      patch.imageUrl,
      patch.summary,
      patch.description,
      patch.foundedYear,
      patch.website,
      id,
    ]
  );

  if (before && before.name !== patch.name) {
    await query('UPDATE games SET developer = ? WHERE developer_id = ?', [patch.name, id]);
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
