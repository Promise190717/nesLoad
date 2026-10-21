/**
 * `/play` 的「游戏运行中」信号 —— 给左上角那颗返回用的。
 *
 * 为什么不用 React context / props：运行状态在 `PlayScene`（客户端）里，
 * 返回按钮却在 `GamesShell`（服务端组件）的渲染树里 —— 服务端组件没法接
 * handler，也没法订阅 context 之外的桥。一个模块级的「最后写入者赢」的布尔
 * + 订阅集就是这一页需要的全部：同一时刻只有一个 `/play` 实例在跑
 * （SPA 导航时旧实例先卸载、新实例后挂载，卸载时会把信号清回 false）。
 *
 * 「运行中」= ROM 已载入开玩（`phase === 'ready'`），或联机加入者已连上
 * 房主正在收画面（本机没有模拟器，`phase` 永远到不了 ready）。
 *
 * ⚠️ 只服务 `/play` 这一颗返回钮，别往别处接。
 */

let active = false;

const listeners = new Set<() => void>();

/** PlayScene 在开局 / 收局（及联机接上 / 断开）时写；卸载时写 false。 */
export function setPlayActive(next: boolean): void {
  if (active === next) return;
  active = next;
  for (const listener of listeners) listener();
}

/** 返回钮点击时同步读一次。 */
export function isPlayActive(): boolean {
  return active;
}

/** `useSyncExternalStore` 的订阅半件套（getSnapshot 是 isPlayActive）。 */
export function subscribePlayActive(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
