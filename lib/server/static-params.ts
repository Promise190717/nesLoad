import { usesUpstreamCatalog } from './catalog-source';
import { listGameStubsCached } from './games';
import { listDeveloperStubsCached } from './developers';

/*
 * 构建期预渲染的「热集」。
 *
 * Four locales plus download pages multiply the asset count. Prebuild a bounded
 * hot set; the rest use ISR. Set STATIC_GAME_LIMIT explicitly for larger builds.
 *
 * ⚠️ **源站模式（`CATALOG_SOURCE=upstream`，默认）下不预渲染游戏页**（2026-10-19）：
 *    每个 slug 的详情页要现抓四份上游页面，24 款 × 四语言 × 两个页面（详情 + 下载）
 *    就是近两百页、上千次外网请求 —— 构建会又慢又容易被上游限流。
 *    返回空数组后这些地址改成**首次访问时按需 ISR 生成**，和预渲染的渲染结果一致。
 */
export async function gameStaticParams() {
  const limit = Number(process.env.STATIC_GAME_LIMIT ?? 24);
  if (!Number.isInteger(limit) || limit < 0) throw new Error('STATIC_GAME_LIMIT must be a nonnegative integer');
  if (usesUpstreamCatalog()) return [];
  const games = await listGameStubsCached();
  return games.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map(({ id }) => ({ id }));
}
export async function developerStaticParams() {
  return (await listDeveloperStubsCached()).map(({ id }) => ({ id }));
}
