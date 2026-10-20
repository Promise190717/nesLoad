/**
 * 语言下拉里的国旗小旗（2026-10-20 加）。
 *
 * **内联 SVG、零依赖**：不引第三方图标包、不走 CDN —— 这站是带 Service Worker 的
 * 离线可玩站，外链图片在离线时全是破图；npm 包（flag-icons 之类）也是几 MB 的
 * CSS + 图集，为 18 面小旗不值。所以一面旗就是几个 `<rect>` / `<circle>` / `<polygon>`。
 *
 * ⚠️ **全部是「简化版旗」**：条纹数、徽记、星座点都按小尺寸显示效果取舍
 *    （比如美国式/巴西式的复杂徽记直接省掉、马来西亚按 7 条简化条纹画）。
 *    在 18×12 的显示尺寸下识别度优先，**不追求制式精确**。
 *
 * ⚠️ **旗帜只代表语言/地区惯例，不代表国家主张**：
 *    · `zh` 与 `zh-TW` **共用同一面国旗**（台湾是中国的一部分）—— 两项靠
 *      「简体中文 / 繁體中文」的文字区分，下拉里两面旗长得一样是刻意的；
 *    · `en` 用美国旗（2026-10-20 用户指定，原为英国旗）；
 *    · `pt` 用葡萄牙旗（没用巴西旗）；
 *    · `fil` 用菲律宾旗。
 *
 * ⚠️ 星星用 `starPoints()` 现算（中国 / 越南 / 菲律宾 / 马来西亚都要画五角星，
 *    手写坐标容易错）；函数是纯计算，SSR 与客户端输出一致，不会 hydration 抖。
 *
 * 用法：`<FlagIcon locale={option.value} />`。不接收动画 / 事件，纯展示；
 * `aria-hidden`——语言名本身就在旁边的文字里，读屏不需要再读一遍旗。
 */

import type { ReactNode } from 'react';
import type { Locale } from '@/lib/i18n';

/** 五角星顶点串：外接圆半径 `r`，内半径取 0.382r，尖朝上。 */
function starPoints(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.382;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return points.join(' ');
}

/** 韩国旗的四组卦符（简化成三道实杠）绕出来的位置：沿对角线、杠与半径垂直。 */
function trigram(cx: number, cy: number, rotation: number): ReactNode {
  return (
    <g key={`${cx}-${cy}`} transform={`translate(${cx} ${cy}) rotate(${rotation})`} fill="#000">
      <rect x="-2.3" y="-1.7" width="4.6" height="0.7" />
      <rect x="-2.3" y="-0.35" width="4.6" height="0.7" />
      <rect x="-2.3" y="1" width="4.6" height="0.7" />
    </g>
  );
}

const FLAG_BODY: Record<Locale, ReactNode> = {
  // 中国（简体 / 繁体共用，见文件头注释）
  zh: (
    <>
      <rect width="24" height="16" fill="#DE2910" />
      <polygon points={starPoints(4, 4, 2.6)} fill="#FFDE00" />
      <polygon points={starPoints(8.8, 1.6, 0.9)} fill="#FFDE00" />
      <polygon points={starPoints(10.8, 3.6, 0.9)} fill="#FFDE00" />
      <polygon points={starPoints(10.8, 6.4, 0.9)} fill="#FFDE00" />
      <polygon points={starPoints(8.8, 8.4, 0.9)} fill="#FFDE00" />
    </>
  ),
  'zh-TW': (
    <>
      <rect width="24" height="16" fill="#DE2910" />
      <polygon points={starPoints(4, 4, 2.6)} fill="#FFDE00" />
      <polygon points={starPoints(8.8, 1.6, 0.9)} fill="#FFDE00" />
      <polygon points={starPoints(10.8, 3.6, 0.9)} fill="#FFDE00" />
      <polygon points={starPoints(10.8, 6.4, 0.9)} fill="#FFDE00" />
      <polygon points={starPoints(8.8, 8.4, 0.9)} fill="#FFDE00" />
    </>
  ),
  // 美国（English；13 道简化成 7 道，星区简化成 3×3 白点）
  en: (
    <>
      <rect width="24" height="16" fill="#B22234" />
      <rect y="2.29" width="24" height="2.29" fill="#fff" />
      <rect y="6.86" width="24" height="2.29" fill="#fff" />
      <rect y="11.43" width="24" height="2.29" fill="#fff" />
      <rect width="10.3" height="9.14" fill="#3C3B6E" />
      {[2, 5.1, 8.2].map((y) =>
        [1.7, 4.1, 6.5, 8.9].map((x) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="0.55" fill="#fff" />
        ))
      )}
    </>
  ),
  // 日本
  ja: (
    <>
      <rect width="24" height="16" fill="#fff" />
      <circle cx="12" cy="8" r="4" fill="#BC002D" />
    </>
  ),
  // 韩国（太极：红上蓝下，红的小半圆在左、蓝的在右；卦符简化成实杠）
  ko: (
    <>
      <rect width="24" height="16" fill="#fff" />
      <path d="M7.8 8 A4.2 4.2 0 0 1 16.2 8 Z" fill="#CD2E3A" />
      <path d="M16.2 8 A4.2 4.2 0 0 1 7.8 8 Z" fill="#0047A0" />
      <circle cx="9.9" cy="8" r="2.1" fill="#CD2E3A" />
      <circle cx="14.1" cy="8" r="2.1" fill="#0047A0" />
      {trigram(6.5, 4.3, -56)}
      {trigram(17.5, 4.3, 56)}
      {trigram(6.5, 11.7, 56)}
      {trigram(17.5, 11.7, -56)}
    </>
  ),
  // 西班牙（无徽记的民用旗）
  es: (
    <>
      <rect width="24" height="16" fill="#AA151B" />
      <rect y="4" width="24" height="8" fill="#F1BF00" />
    </>
  ),
  // 印度（轮查克拉简化成双圈）
  hi: (
    <>
      <rect width="24" height="16" fill="#FF9933" />
      <rect y="5.33" width="24" height="5.34" fill="#fff" />
      <rect y="10.67" width="24" height="5.33" fill="#138808" />
      <circle cx="12" cy="8" r="2" fill="none" stroke="#000080" strokeWidth="0.6" />
      <circle cx="12" cy="8" r="0.55" fill="#000080" />
    </>
  ),
  // 葡萄牙（徽记简化成黄圈白盾）
  pt: (
    <>
      <rect width="24" height="16" fill="#FF0000" />
      <rect width="9.6" height="16" fill="#006600" />
      <circle cx="9.6" cy="8" r="3.1" fill="#FFD700" />
      <circle cx="9.6" cy="8" r="1.7" fill="#fff" />
      <rect x="8.9" y="6.7" width="1.4" height="2.6" fill="#FF0000" />
    </>
  ),
  // 法国
  fr: (
    <>
      <rect width="24" height="16" fill="#EF4135" />
      <rect width="16" height="16" fill="#fff" />
      <rect width="8" height="16" fill="#0055A4" />
    </>
  ),
  // 德国
  de: (
    <>
      <rect width="24" height="16" fill="#FFCE00" />
      <rect width="24" height="10.67" fill="#DD0000" />
      <rect width="24" height="5.33" fill="#000" />
    </>
  ),
  // 意大利
  it: (
    <>
      <rect width="24" height="16" fill="#CE2B37" />
      <rect width="16" height="16" fill="#fff" />
      <rect width="8" height="16" fill="#009246" />
    </>
  ),
  // 俄罗斯
  ru: (
    <>
      <rect width="24" height="16" fill="#D52B1E" />
      <rect width="24" height="10.67" fill="#0039A6" />
      <rect width="24" height="5.33" fill="#fff" />
    </>
  ),
  // 菲律宾（三角 + 太阳，三颗小星省略）
  fil: (
    <>
      <rect width="24" height="16" fill="#0038A8" />
      <rect y="8" width="24" height="8" fill="#CE1126" />
      <polygon points="0,0 10,8 0,16" fill="#fff" />
      <circle cx="3.2" cy="8" r="1.3" fill="#FCD116" />
    </>
  ),
  // 荷兰
  nl: (
    <>
      <rect width="24" height="16" fill="#21468B" />
      <rect width="24" height="10.67" fill="#fff" />
      <rect width="24" height="5.33" fill="#AE1C28" />
    </>
  ),
  // 越南
  vi: (
    <>
      <rect width="24" height="16" fill="#DA251D" />
      <polygon points={starPoints(12, 8, 4.2)} fill="#FFFF00" />
    </>
  ),
  // 泰国
  th: (
    <>
      <rect width="24" height="16" fill="#A51931" />
      <rect y="2.67" width="24" height="10.66" fill="#F4F5F8" />
      <rect y="5.33" width="24" height="5.34" fill="#2D2A4A" />
    </>
  ),
  // 马来西亚（14 道简化成 7 道，新月 + 星画在蓝角里）
  ms: (
    <>
      <rect width="24" height="16" fill="#fff" />
      <rect y="0" width="24" height="2.29" fill="#CC0001" />
      <rect y="4.57" width="24" height="2.29" fill="#CC0001" />
      <rect y="9.14" width="24" height="2.29" fill="#CC0001" />
      <rect y="13.71" width="24" height="2.29" fill="#CC0001" />
      <rect width="12" height="9.14" fill="#010066" />
      <circle cx="4.2" cy="4.57" r="2.6" fill="#FFCC00" />
      <circle cx="5.3" cy="4.57" r="2.2" fill="#010066" />
      <polygon points={starPoints(9.2, 4.57, 1.8)} fill="#FFCC00" />
    </>
  ),
  // 印度尼西亚
  id: (
    <>
      <rect width="24" height="16" fill="#fff" />
      <rect width="24" height="8" fill="#CE1126" />
    </>
  ),
};

interface FlagIconProps {
  locale: Locale;
  /** 显示宽度（px），高按 3:2 自动取整；下拉里默认 18。 */
  width?: number;
}

export function FlagIcon({ locale, width = 18 }: FlagIconProps) {
  const height = Math.round((width * 2) / 3);
  return (
    <svg
      className="locale-flag"
      width={width}
      height={height}
      viewBox="0 0 24 16"
      aria-hidden="true"
    >
      {FLAG_BODY[locale]}
    </svg>
  );
}
