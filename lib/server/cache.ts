/*
 * `unstable_cache` 的薄封装：**开发模式用 5 分钟 TTL，线上用调用方给的 TTL**。
 *
 * 2026-10-14 之前开发模式是**直接透传**（`return fn`，完全不吃缓存）—— 那样本地根本
 * 看不到缓存行为，「缓存键里多了个维度」「两个函数该不该共用一份」这类问题只有上线才发现。
 * 现在开发模式也吃缓存，只是 TTL 压到 5 分钟（用户 2026-10-14 要求）。
 *
 * ⚠️ 5 分钟仍然可能让你看到旧数据：`unstable_cache` 的条目落在 `.next/cache`、
 *    进程重启照样命中，所以「改完数据和查询逻辑、刷新还是旧的」这件事最多持续 5 分钟
 *    （以前要手动清 `.next` 才恢复）。等不了就直接删 `.next/cache` 下那几条。
 * ⚠️ 要「同一次请求内只查一次」，用 React 的 `cache()` 自己包，和这里不是一回事。
 */

import { unstable_cache } from 'next/cache';

/** 开发模式的缓存时长（秒）= 5 分钟。生产用调用方传进来的 `options.revalidate`。 */
const DEV_REVALIDATE_SECONDS = 300;

export function cached<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  keyParts: string[],
  options: { revalidate: number; tags?: string[] }
): (...args: Args) => Promise<Result> {
  // `process.env.NODE_ENV` 被 Next 在构建期内联，所以这个分支是编译期确定的常量。
  const isDev = process.env.NODE_ENV !== 'production';
  return unstable_cache(fn, keyParts, {
    ...options,
    revalidate: isDev ? DEV_REVALIDATE_SECONDS : options.revalidate,
  });
}
