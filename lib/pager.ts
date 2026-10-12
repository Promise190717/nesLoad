/*
 * 内容页共用的「`?page=N`」解析与拼装。
 *
 * 为什么抽出来：`/games` 那一页当初自己写了一套（那边还要同时管搜索词，逻辑更厚），
 * 而 2026-10-12 加的开发商列表 / 开发商详情两页**也要同一套规矩**。
 * 各写一份的话，`?page=01` 在一页被收敛、在另一页能溜过去 —— 同一批数据两个 URL，
 * 正是这几页一直在避免的重复内容。
 *
 * 规矩（和 `/games` 那边一字不差）：
 *   · 第 1 页**不写** `page`（就是裸路径）；2 页起写 `?page=N`；
 *   · `page` 只认「纯数字、非 0、无前导零」—— 其它写法（`?page=1`、`?page=01`、
 *     `?page=abc`、`?page=-2`、重复参数 `?page=1&page=2`）一律判为**非规范**，
 *     由调用方 `redirect(pageHref(...))` 收敛过去。
 */

/** 只认「一个字符串」。数组（重复参数）一律当没给 —— 和 /games 那边同一个判据。 */
function single(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

/**
 * 解析 `?page=`。返回的 `canonical` 表示这个地址本身是不是规范形式，
 * 不是的话调用方要 307 到 `pageHref(base, page)`。
 */
export function parsePageParam(raw: string | string[] | undefined): {
  page: number;
  canonical: boolean;
} {
  const given = raw !== undefined;
  const text = single(raw).trim();
  const parsed = /^\d+$/.test(text) ? Number.parseInt(text, 10) : NaN;
  const page = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;

  /*
   * 用「参数在不在」而不是「参数是不是空串」当判据：`single()` 对**重复参数**
   * （`?page=1&page=2`）也返回空串，用「在不在」才把它们一起收敛掉。
   */
  const canonical = page > 1 ? text === String(page) : !given;

  return { page, canonical };
}

/** 第几页的规范地址。第 1 页不写参数（于是 `/developers` 和 `/developers?page=1` 只有一个）。 */
export function pageHref(basePath: string, page: number): string {
  return page > 1 ? `${basePath}?page=${page}` : basePath;
}

/** 把页数收敛进有效范围（`total` 为 0 时也有 1 页，页码不会显示成 0）。 */
export function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
