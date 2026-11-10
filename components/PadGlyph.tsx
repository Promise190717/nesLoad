import type { ReactNode } from 'react';

/**
 * 手柄钮上的**图形字形**：PlayStation 四颗面键（△ ○ × □）+ 十字键的四个三角。
 *
 * ## 为什么 PS1 那四颗要画成图形
 *
 * 2026-10-16 用户报「圈叉三角正方形 大小都不是统一的」。这四个符号在 Unicode 里
 * **分属两个区**，落到两种字体上：
 *   · `×` U+00D7 是 Latin-1 的乘号 —— 多数西文字体（含 Press Start 2P）都有，
 *     但按 **x-height** 画，只有小写字母那么高；
 *   · `○` U+25CB / `□` U+25A1 / `△` U+25B3 属**几何图形区** —— Press Start 2P
 *     和多数西文字体都没有，浏览器只能按文档语言挑兜底字体，落到的 CJK 字体里
 *     这三个是**全角**的、撑满 em 框。
 * 于是同一个 font-size 下一颗小、三颗大 —— **改字号治不了根**（同一个坑见
 * globals.css 的 `.star-glyph`；那边靠把「一定画得大」的 CJK 字体排到栈首凑齐了，
 * 这四个跨区、凑不齐，只能画成图形）。
 *
 * ## 方向键的四个三角是同一个病（2026-11-10 用户报「箭头大小怎么不一样」）
 *
 * `▲` U+25B2 / `▼` U+25BC / `◀` U+25C0 / `▶` U+25B6 虽然同属几何图形区，
 * 但**很多字体只画了其中两个**（上下比左右常见得多），缺的那个回退到另一套字体
 * ⇒ 四颗三角的大小、粗细、基线全不一样，`font-pixel` 一个都没有。
 * 画法：**同一个三角形 + 原地旋转**（90 / 180 / 270），四个方向不可能再不一致。
 *
 * ## 画法
 *
 * PS 四颗共用 **24×24 坐标系**、同一个描边，各自的路径**连同描边 / 斜接尖一起**
 * 落在同一片可见范围里（约 1.8–22.0，四颗彼此差不到 1 个单位 —— 12px 下半个像素，
 * 肉眼看不出来）—— 所以跨字体 / 跨平台都一样大。
 * `stroke="currentColor"`，颜色跟着上下文走
 * （面板里是 `text-ink-400`，机身面键上是 `text-ink-100`）。
 *
 * 尺寸**跟着 font-size**（`1em` 见方）：放进面板那句 12px 的文字里就是 12px，
 * 放到机身面键上就是 `--pad-font` —— 不用为它另开一套尺寸变量。
 *
 * ⚠️ PS 那四颗**不是**像素风（icons.tsx 那套）—— 那是**故意**的：机身面键上别的机种是
 *   `font-pixel` 的字母，但 PS 手柄上的符号本来就是平滑图形，画成像素点阵反而像马赛克
 *   （用户 2026-10-13 对星形那版图形化的原话就是「马赛克」，那版撤了）。这里走**细描边矢量**。
 *   方向三角跟着走同一套坐标，但**实心**——十字键上一直是实心箭头，
 *   描边版会细一圈、按下去看着发空。
 *
 * 描边粗细（`strokeWidth`）是 PS 四颗共用的，想调只改下面这一个数（三角不吃它）。
 */
/*
 * 方向三角：等边（宽 21 / 高 ≈18.2），在 24 框里居中、几乎占满 —— 原来那颗字符在
 * 16px 字号下差不多就是这个量级，画小了十字键看着会缩水。
 * 四个方向共用一个形状、只转角度 —— 这是「四个必须一样大」的唯一保证，
 * 别改成四个手写的 polygon。
 */
const TRIANGLE = '12,2.9 22.5,21.1 1.5,21.1';

const PAD_GLYPHS: Record<string, ReactNode> = {
  '○': <circle cx="12" cy="12" r="8" />,
  '□': <rect x="4" y="4" width="16" height="16" />,
  /*
   * 三角形按**视觉**补偿：同样外接方框下三角形看着比圆 / 方小，所以画大一圈。
   * 顶点角 56°，斜接尖会多顶出 ~2.7 单位 —— 连这个一起算进去，四颗的可见外框才齐平。
   */
  '△': <polygon points="12,4.5 20,20 4,20" />,
  // 方头线帽（`strokeLinecap="square"`）会在端点外再顶出半个描边宽，所以线比外框略收
  '×': (
    <>
      <line x1="3.5" y1="3.5" x2="20.5" y2="20.5" />
      <line x1="20.5" y1="3.5" x2="3.5" y2="20.5" />
    </>
  ),
  '▲': <polygon points={TRIANGLE} fill="currentColor" stroke="none" />,
  '▶': (
    <polygon points={TRIANGLE} fill="currentColor" stroke="none" transform="rotate(90 12 12)" />
  ),
  '▼': (
    <polygon points={TRIANGLE} fill="currentColor" stroke="none" transform="rotate(180 12 12)" />
  ),
  '◀': (
    <polygon points={TRIANGLE} fill="currentColor" stroke="none" transform="rotate(270 12 12)" />
  ),
};

/**
 * 从一段纯文本里切出这四颗符号用的正则（带捕获组 ⇒ `split` 会把符号本身留在数组里）。
 *
 * 给 `renderPadGlyphs` 用。**只认这四颗** —— 别的字符一律原样当文字。
 */
const PAD_SYMBOL_SPLIT = /([○□△×])/;

/**
 * 一颗钮的显示名 → 图形（是那四颗之一）或原样的文字（其余一切：`L1` / `SELECT` / `A` …）。
 *
 * 认不出来就 `<>{name}</>` 原样吐回去 —— 所以调用方**不用先判断**，无脑套上就行。
 *
 * 画图形时**配一句 `sr-only` 的原字符**：图形本身对读屏是不可见的，不补这一句就等于
 * 把「这颗钮叫什么」从无障碍树上抹掉了（和 GameComments 里「图形 aria-hidden + 后面
 * 一句 sr-only 念出来」同一个做法）。⚠️ 机身面键那颗钮自己有 `aria-label`，
 * 会盖过内部内容，所以那边这句是冗余但无害的 —— 留着是为了让**所有**消费点行为一致。
 */
export default function PadGlyph({ name }: { name: string }) {
  const shape = PAD_GLYPHS[name];
  if (!shape) return <>{name}</>;

  return (
    <>
      <svg
        viewBox="0 0 24 24"
        className="inline-block h-[1em] w-[1em] shrink-0 align-middle"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="square"
        aria-hidden="true"
        focusable="false"
      >
        {shape}
      </svg>
      <span className="sr-only">{name}</span>
    </>
  );
}

/**
 * 把一整行纯文本里的四颗符号换成图形，其余原样。
 *
 * 给「按键说明」页脚那一行用 —— 它是 `playerLegend()`（lib/keybindings.ts）现算出来的
 * **纯字符串**，形如 `1P  W/A/S/D 移动 · K=× · L=○ · J=□ · I=△ · U=L1 …`，
 * 拆成 `['1P  W/A/S/D 移动 · K=', '×', ' · L=', '○', …]` 再逐个过 `PadGlyph`
 * 就把四颗符号变成图形了（文字片段照样原样渲染）。
 */
export function renderPadGlyphs(text: string): ReactNode {
  return text
    .split(PAD_SYMBOL_SPLIT)
    .map((part, index) => <PadGlyph key={index} name={part} />);
}
