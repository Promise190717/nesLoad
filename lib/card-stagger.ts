/*
 * 卡片入场动效的**错峰参数**（动画本体在 app/globals.css 的 `.card-in`）。
 *
 * 2026-10-12 用户要的「每一项出现时加动画」，两处都用了同一套节奏：
 *   ① 房间里的游戏库弹窗 —— `components/GameLibraryPanel.tsx`
 *   ② 公开的游戏列表页 —— `app/games/page.tsx`
 * 所以这两个数**必须只有一份**：节奏是观感的一部分，两边各写一份迟早会跑偏。
 *
 * 为什么错峰不在 CSS 里：一条规则没法给「第 n 个孩子」算出稳定的等差延迟
 * （`nth-child` 要为一整页各写一条）。所以组件按 index 算出毫秒数、写进内联
 * `animation-delay`，CSS 那边只管「一张卡片长什么样」。
 */

/** 相邻两张卡片相差多久出场。 */
export const CARD_STAGGER_MS = 24;

/**
 * 错峰**封顶到第几张**。
 *
 * 15 张 ⇒ 最后一张 336ms 落位、整波不到 0.6s，等得起。封顶是为了防止
 * 「万一以后某处一页调得很大」：最后一排等上一秒多时，那已经不是「出现时的动效」，
 * 而是「列表还没加载完」。
 */
export const CARD_STAGGER_CAP = 14;

/**
 * 第 `index` 张卡片的 `animation-delay`（毫秒）。
 *
 * 用法：`<li className="card-in" style={{ animationDelay: `${cardDelayMs(index)}ms` }}>`
 */
export function cardDelayMs(index: number): number {
  return Math.min(index, CARD_STAGGER_CAP) * CARD_STAGGER_MS;
}
