/*
 * `unstable_cache` 的薄封装：**开发模式直接透传，只有线上吃缓存**。
 *
 * 本项目的数据缓存 TTL 是小时级，而 `unstable_cache` 的条目落在 `.next/cache`、
 * 进程重启照样命中 —— 本地改完数据和查询逻辑，页面还是旧的，得手动清 `.next`。
 * 开发模式透传之后，「改完刷新」就正常了。
 *
 * ⚠️ 线上行为不变：参数原样交给 `unstable_cache`。
 * ⚠️ 要「同一次请求内只查一次」，用 React 的 `cache()` 自己包，和这里不是一回事。
 */

import { unstable_cache } from 'next/cache';

export function cached<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  keyParts: string[],
  options: { revalidate: number; tags?: string[] }
): (...args: Args) => Promise<Result> {
  if (process.env.NODE_ENV !== 'production') return fn;
  return unstable_cache(fn, keyParts, options);
}
