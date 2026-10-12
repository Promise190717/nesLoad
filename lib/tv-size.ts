/*
 * 电视机尺寸档位。
 *
 * 三档：小 / 中 / 大。**默认「小」= 原来的尺寸**（2026-10-12 用户要求：
 * 右侧那排开关里加一颗钮；桌子跟着变长、地板高度跟着减少、机身保持居中，
 * 窗户和日历贴的还是机身左上 / 右上角，所以相对位置不变）。
 *
 * **真正的尺寸不在这里。** 屏幕宽高、机身宽、底座宽、桌面宽、吊灯线长度是一组
 * CSS 变量，按 `<html data-tv>` 取值，写在 `app/globals.css` 的
 * `:root[data-tv='medium' | 'large']` 那两条里。
 * ⚠️ **加档位 / 改尺寸要同步 globals.css** —— 这边只有类型和显示顺序。
 *
 * 为什么不把尺寸放进 React state 直接下发：
 *   1. 屏幕的宽高**不能**写成内联 style —— 内联会顶掉 globals.css 里那条
 *      **未分层**的 `.screen:fullscreen { width:100vw; height:100vh }`，
 *      全屏会直接失效（完整因果见 RetroTv 屏幕那段注释）。
 *   2. 和主题 / 吊灯 / 简洁模式 / 季节同一套路：状态挂在 `<html data-tv>` 上、
 *      首屏由 layout.tsx 的内联脚本（BOOT_INIT）写入，所以**不会先按小档画一帧再跳大**。
 *      React 那份 state 只为了按钮文案、图标和选项的 aria；**选择器里那条高亮也不是
 *      React 画的** —— 它是 CSS 按 `data-tv` 选的，和主题钮露太阳还是月亮一个套路
 *      （主题 / 语言那两颗钮 2026-10-12 收成了单颗，但「属性驱动外观」这条没变）。
 *
 * 落盘：localStorage `nesload:tv`（记住，和主题 / 吊灯 / 简洁模式一样）。
 */

export type TvSize = 'small' | 'medium' | 'large';

/**
 * 选择器里的显示顺序：**大 → 中 → 小**。
 *
 * 刻意按用户原话（「左侧出现大中小选择」）排，不是从小到大 ——
 * 想反过来改这一个数组就够了，别的地方都跟着它走。
 */
export const TV_SIZES: readonly TvSize[] = ['large', 'medium', 'small'];

/** 默认档。首次访问、以及属性读不出来时都用它 */
export const DEFAULT_TV_SIZE: TvSize = 'small';

export function isTvSize(value: unknown): value is TvSize {
  return value === 'small' || value === 'medium' || value === 'large';
}
