'use client';

/**
 * 把「这台机种的核心 wasm」提前拉进 HTTP 缓存。
 *
 * ## 为什么
 *
 * 一次载入是**串行**的两段网络：`/api/games/<id>/rom`（几 MB 到几百 MB）下完，
 * `Nostalgist.launch` 才去 `fetch('/cores/<核心>_libretro.wasm')`（2.4–5.3 MB）。
 * 两段之间没有任何重叠 —— 下 PS1 那张 300 MB 盘的 1–3 分钟里，网络明明闲着。
 *
 * 从 2026-10-19 起核心都在本站（`lib/emulator.ts` 的 `LOCAL_CORE_DIR`），同源、
 * 带一天缓存，所以「先说一声让浏览器去下」是纯收益：核心那 2–5 MB 在 ROM 下载期间
 * 就躺在缓存里了，启动阶段只剩编译。
 *
 * ## 几条刻意的取舍
 *
 * · **不用 `<link rel="preload">`**：那是给「本轮渲染就要用」的资源准备的，而这里
 *   可能几分钟后才用；而且 `as="fetch"` 的 preload 要在元素上对齐 `crossorigin`，
 *   和 Nostalgist 内部那次 fetch 的头不一定一致，反而可能白拉两份。
 * · **必须把 body 读掉**：只 `await fetch()` 拿到响应头就走，浏览器不保证把整份写进
 *   HTTP 缓存；读成 `arrayBuffer()` 再丢掉引用是最稳的（3–6 MB 的瞬时占用，可接受）。
 *   `fbneo` 那份 9.7 MB 的 `.gz` 因此**不预热**（见 `localCoreWasmUrl`）。
 * · **失败一律咽掉**：预热只是提速，核心真要用时 Nostalgist 自己还会再拉一次 ——
 *   这里抛错只会把一个「本来能跑」的载入变成失败。
 */

/** 同一个 URL 只飞一份。下载中点重载 / 快速切两次游戏时不该堆出第二条请求。 */
const inFlight = new Map<string, Promise<void>>();

/**
 * 预热 `url`（`null` 直接跳过）。`signal` 传调用方那条 —— 用户取消下载时
 * 这条预热也该一起停，不然它会继续占着带宽下完一份已经不需要的核心。
 */
export function preloadCoreWasm(url: string | null, signal?: AbortSignal): Promise<void> {
  if (!url) return Promise.resolve();
  const running = inFlight.get(url);
  if (running) return running;

  /*
   * 刻意**不写** `cache: 'force-cache'`：那会连过期副本一起认，而核心文件是
   * **同名覆盖**的（`next.config.js` 给的是浏览器/CDN 各一天）。预热要是拿了一份
   * 过期核心放进缓存，等于把「换核心后用户还在跑旧版」这个坑重新挖一遍。
   * 默认模式会正常走 `max-age`，过期就回一次源（304 也很便宜）。
   */
  const task = fetch(url, { signal })
    .then((response) => (response.ok ? response.arrayBuffer() : undefined))
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => inFlight.delete(url));

  inFlight.set(url, task);
  return task;
}

/**
 * 等到预热落定，但**最多等 `ms`**。
 *
 * 为什么要等：ROM 下完之后如果预热还在飞，`Nostalgist.launch` 会对着同一个 URL
 * 再发一次请求 —— 浏览器不保证合并这两条，最坏是白下两份核心。等它落定既避免重复，
 * 又因为预热是从「点开始」那一刻就跑的，正常情况这里早就完成了，不会真的等。
 *
 * 为什么要封顶：预热撞上一个卡住的连接时，不能让它把整个载入拖死 —— 超时就照常启动，
 * 大不了核心自己再拉一次（那是老行为）。
 */
export function settlePreload(task: Promise<void>, ms = 20000): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    void task.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}
