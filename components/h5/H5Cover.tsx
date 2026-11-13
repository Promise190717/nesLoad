/**
 * H5 游戏卡片的封面（`/h5` 列表 + 联机选阵营面板的背景）。
 *
 * 和站里其他封面一样是**代码画出来的**（`<svg>` 内联，不是图片）：加一张 png
 * 就是多一份要版本管理的二进制。
 *
 * 2026-11-13 重画。旧版是一张「白天货场平面示意图」—— 三种灰蓝色块、没有明确
 * 光源，缩到 16:9 卡面上像一张没上色的草图。现在按 FPS 海报的思路重排：
 *
 *   · **低机位 + 一点透视**：甲板透视线收向地平线，两侧集装箱当画框；
 *   · **逆光**：橙金落日压在中央缺口，箱体只留暗部、右缘一条暖色描边，
 *     先有「光从哪来」，画面才有主次；
 *   · **中央一个举枪的人形**：货场回答「在哪打」，人形回答「在打谁」；
 *   · 准星仍在画面中心、用卡片主色 —— 它是这张封面唯一的「游戏 UI」。
 *
 * 人物只画剪影，不画五官 / 装备细节：卡面最窄只有三百多像素，细节只会糊成噪点。
 * 是服务端组件（没有 'use client'）：纯静态 SVG，跟着页面一起被 CDN 缓存。
 */
export default function H5Cover({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 320 180" className="block h-full w-full" role="img" aria-hidden>
      <defs>
        {/* 天空：顶部近黑，往地平线一路推到暖色，逆光的「底」全在这里 */}
        <linearGradient id="h5c-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0a111a" />
          <stop offset="42%" stopColor="#1b2c3d" />
          <stop offset="72%" stopColor="#44576a" />
          <stop offset="90%" stopColor="#8d7a63" />
          <stop offset="100%" stopColor="#c08a4e" />
        </linearGradient>
        <linearGradient id="h5c-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7d715f" />
          <stop offset="35%" stopColor="#33454f" />
          <stop offset="100%" stopColor="#1a262f" />
        </linearGradient>
        <linearGradient id="h5c-deck" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3c4953" />
          <stop offset="45%" stopColor="#2c363e" />
          <stop offset="100%" stopColor="#151c22" />
        </linearGradient>
        <radialGradient id="h5c-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffe3b0" stopOpacity="0.95" />
          <stop offset="18%" stopColor="#ffc46b" stopOpacity="0.55" />
          <stop offset="52%" stopColor="#f0a020" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#f0a020" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="h5c-ray" gradientUnits="userSpaceOnUse" x1="172" y1="78" x2="70" y2="0">
          <stop offset="0%" stopColor="#ffd59a" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#ffd59a" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="h5c-pool" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f0a020" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#f0a020" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="h5c-vig" cx="50%" cy="46%" r="74%">
          <stop offset="48%" stopColor="#04070a" stopOpacity="0" />
          <stop offset="100%" stopColor="#04070a" stopOpacity="0.86" />
        </radialGradient>
        <linearGradient id="h5c-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#04070a" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#04070a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="h5c-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#04070a" stopOpacity="0" />
          <stop offset="100%" stopColor="#04070a" stopOpacity="0.82" />
        </linearGradient>
      </defs>

      {/* ── 天空 / 落日 ─────────────────────────────────────────────── */}
      <rect width="320" height="108" fill="url(#h5c-sky)" />
      <circle cx="172" cy="78" r="76" fill="url(#h5c-sun)" />
      <circle cx="172" cy="78" r="9.5" fill="#ffe7bd" opacity="0.92" />
      <rect x="128" y="77" width="90" height="1.2" fill="#ffd59a" opacity="0.22" />

      <g fill="#223548" opacity="0.9">
        <ellipse cx="58" cy="27" rx="52" ry="7" />
        <ellipse cx="250" cy="20" rx="58" ry="6" />
        <ellipse cx="150" cy="45" rx="76" ry="5" />
      </g>
      <g fill="#7c8794" opacity="0.22">
        <ellipse cx="52" cy="23" rx="40" ry="3" />
        <ellipse cx="248" cy="16" rx="46" ry="2.5" />
        <ellipse cx="150" cy="41" rx="60" ry="2" />
      </g>

      {/* 云缝里漏下来的两道光（压得很低，别打成手电筒） */}
      <path d="M172 78 L78 0 L108 0 Z" fill="url(#h5c-ray)" opacity="0.6" />
      <path d="M172 78 L192 0 L216 0 Z" fill="url(#h5c-ray)" opacity="0.32" />

      {/* ── 海面 / 吊机 ───────────────────────────────────────────── */}
      <rect y="104" width="320" height="8" fill="url(#h5c-sea)" />
      <g fill="#c08a4e" opacity="0.35">
        <rect x="154" y="105" width="12" height="1" />
        <rect x="170" y="107" width="20" height="1" />
        <rect x="146" y="108" width="8" height="1" />
      </g>

      {/* 吊机：只出现在天际线上，给「货轮」这件事一个剪影证据 */}
      <g fill="#070d13">
        <rect x="300" y="0" width="7" height="44" />
        <path d="M222 22 L307 4 L307 10 L228 30 Z" />
        <path d="M240 28 L240 40 L236 40 L236 28 Z" />
        <path d="M234 40 h8 v3 h-8 z" />
      </g>
      <g stroke="#c08a4e" strokeWidth="0.6" opacity="0.32">
        <path d="M224 23 L306 5" />
        <path d="M300 0 V44" />
      </g>

      {/* ── 甲板：一点透视，线全收向 (160,108) ─────────────────────── */}
      <rect y="110" width="320" height="70" fill="url(#h5c-deck)" />
      <g stroke="#141c23" strokeWidth="0.8" opacity="0.55">
        <path d="M160 108 L-30 180" />
        <path d="M160 108 L20 180" />
        <path d="M160 108 L70 180" />
        <path d="M160 108 L115 180" />
        <path d="M160 108 L160 180" />
        <path d="M160 108 L205 180" />
        <path d="M160 108 L250 180" />
        <path d="M160 108 L300 180" />
        <path d="M160 108 L350 180" />
      </g>
      <g stroke="#0e151b" strokeWidth="0.8" opacity="0.5">
        <path d="M0 119 H320" />
        <path d="M0 130 H320" />
        <path d="M0 143 H320" />
        <path d="M0 159 H320" />
        <path d="M0 178 H320" />
      </g>
      <ellipse cx="172" cy="128" rx="86" ry="26" fill="url(#h5c-pool)" />
      <path d="M0 142 H320 V145 H0 Z" fill="#c9962f" opacity="0.5" />
      <path d="M0 146 H320 V147 H0 Z" fill="#0a0f13" opacity="0.5" />
      <path d="M132 110 H212 L236 180 H108 Z" fill="#f0a020" opacity="0.05" />

      {/* ── 集装箱：先远后近 ───────────────────────────────────────── */}
      {/* 远处两摞矮箱，把中央留给人形 */}
      <g>
        <rect x="116" y="94" width="26" height="16" fill="#333d44" />
        <rect x="116" y="94" width="26" height="2" fill="#4a555d" opacity="0.7" />
        <rect x="184" y="92" width="28" height="18" fill="#3d3a35" />
        <rect x="184" y="92" width="28" height="2" fill="#585149" opacity="0.7" />
      </g>

      {/* 中景左（蓝灰） */}
      <g>
        <rect x="54" y="76" width="60" height="44" fill="#394651" />
        <rect x="54" y="76" width="60" height="3" fill="#4c5c68" />
        <g fill="#2e3a44">
          <rect x="61" y="79" width="3" height="41" />
          <rect x="73" y="79" width="3" height="41" />
          <rect x="85" y="79" width="3" height="41" />
          <rect x="97" y="79" width="3" height="41" />
        </g>
        <rect x="112" y="76" width="2" height="44" fill="#e2a257" opacity="0.5" />
      </g>

      {/* 中景右（苔绿） */}
      <g>
        <rect x="198" y="74" width="46" height="46" fill="#3b4a3d" />
        <rect x="198" y="74" width="46" height="3" fill="#4e5f4c" />
        <g fill="#31402f">
          <rect x="206" y="77" width="3" height="43" />
          <rect x="218" y="77" width="3" height="43" />
          <rect x="230" y="77" width="3" height="43" />
        </g>
        <rect x="198" y="74" width="2" height="46" fill="#e2a257" opacity="0.5" />
      </g>

      {/* 近景左：占住左侧画框，只露右缘的暖光 */}
      <g>
        <rect x="-14" y="46" width="104" height="74" fill="#2e3b31" />
        <rect x="-14" y="46" width="104" height="4" fill="#3f5340" />
        <g fill="#25312a" opacity="0.9">
          <rect x="-10" y="50" width="4" height="68" />
          <rect x="2" y="50" width="4" height="68" />
          <rect x="14" y="50" width="4" height="68" />
          <rect x="26" y="50" width="4" height="68" />
          <rect x="38" y="50" width="4" height="68" />
          <rect x="50" y="50" width="4" height="68" />
          <rect x="62" y="50" width="4" height="68" />
          <rect x="74" y="50" width="4" height="68" />
        </g>
        <path d="M44 46 V120" stroke="#1c2620" strokeWidth="1" opacity="0.6" />
        <g fill="#7a4a2c" opacity="0.18">
          <rect x="8" y="60" width="2" height="26" />
          <rect x="56" y="70" width="1.5" height="34" />
        </g>
        <g fill="#9aa4a8" opacity="0.18">
          <rect x="20" y="98" width="18" height="2" />
          <rect x="20" y="103" width="10" height="1.5" />
        </g>
        {/* 门框 / 锁杆 / 角件：只加这几笔，正面才不是一块纯色墙 */}
        <g stroke="#1d2721" strokeWidth="1.4" opacity="0.75">
          <path d="M40 46 V120 M48 46 V120" />
          <path d="M-14 50 H90 M-14 115 H90" />
        </g>
        <g fill="#1d2721" opacity="0.8">
          <rect x="36" y="72" width="4" height="10" />
          <rect x="48" y="72" width="4" height="10" />
          <rect x="-14" y="46" width="6" height="6" />
          <rect x="80" y="46" width="6" height="6" />
          <rect x="-14" y="113" width="6" height="6" />
          <rect x="80" y="113" width="6" height="6" />
        </g>
        <rect x="-14" y="46" width="104" height="2" fill="#c08a4e" opacity="0.45" />
        <rect x="82" y="46" width="2" height="74" fill="#e2a257" opacity="0.55" />
      </g>

      {/* 近景右：另一侧画框，背光面更暗、左缘迎光 */}
      <g>
        <rect x="238" y="40" width="94" height="80" fill="#4a453c" />
        <rect x="238" y="40" width="94" height="4" fill="#625b4d" />
        <g fill="#3c382f" opacity="0.9">
          <rect x="248" y="44" width="4" height="74" />
          <rect x="262" y="44" width="4" height="74" />
          <rect x="276" y="44" width="4" height="74" />
          <rect x="290" y="44" width="4" height="74" />
          <rect x="304" y="44" width="4" height="74" />
        </g>
        <path d="M282 40 V120" stroke="#2e2b24" strokeWidth="1" opacity="0.7" />
        <g fill="#8d8f8a" opacity="0.16">
          <rect x="256" y="96" width="18" height="2" />
          <rect x="256" y="101" width="10" height="1.5" />
        </g>
        <rect x="238" y="40" width="2" height="80" fill="#e2a257" opacity="0.6" />
        <rect x="238" y="40" width="94" height="2" fill="#c08a4e" opacity="0.4" />
      </g>

      {/* ── 目标人形：逆光剪影 + 右缘暖描边 ─────────────────────────── */}
      <ellipse cx="158" cy="128" rx="13" ry="2.4" fill="#04080b" opacity="0.6" />
      <g fill="#070c11">
        {/* 头盔 + 帽檐 */}
        <path d="M152.4 93.6 Q158 88.8 163.6 93.6 L163.9 96.6 Q158 94.9 152.1 96.6 Z" />
        <rect x="151.8" y="96" width="12.4" height="1.6" />
        {/* 脖子 / 躯干 / 防弹背心 */}
        <rect x="156.4" y="97.4" width="3.2" height="3" />
        <path d="M151.6 100.6 Q158 98.6 164.4 100.6 L165.4 115.2 Q158 117.2 150.6 115.2 Z" />
        {/* 背包 */}
        <path d="M163.6 102.2 q4.2 1.4 3.8 7.2 l-3.4 1.2 Z" />
        {/* 手臂：左手托护木、右手握枪柄 */}
        <path d="M151.8 102.2 L145.8 108.4 L147.4 110.2 L152.8 105.6 Z" />
        <path d="M164 102.4 L158.8 108.8 L160.4 110.6 L165.6 106 Z" />
        {/* 步枪：枪管朝左，枪托贴着右肩 */}
        <path d="M135.6 109.2 L161 108.6 L161.2 111.4 L151 111.8 L151 113.4 L146.6 113.4 L146.6 111.8 L140.4 112 L140.4 113.8 L136 113.8 Z" />
        <path d="M143.4 111.6 l4.8 0 l0.8 4.2 l-4.6 0 z" />
        {/* 双腿 + 靴子 */}
        <path d="M151.4 115 L155.4 115 L154.8 125.6 L150.2 125.6 Z" />
        <path d="M157.6 115 L161.8 115 L163 125.6 L158.4 125.6 Z" />
        <path d="M149.2 125.4 h5.8 v2.2 h-6.4 z" />
        <path d="M158 125.4 h5.4 v2.2 h-5.8 z" />
      </g>
      <g fill="none" stroke="#f0a020" strokeWidth="0.9" opacity="0.6" strokeLinecap="round">
        <path d="M163.4 92.4 Q165.4 95.4 164.2 97.2" />
        <path d="M165 101.4 Q167 106.4 166 115.6" />
        <path d="M166.8 104.8 Q168.2 108 167.8 110.4" />
        <path d="M162.6 116 L163.8 125.4" />
        <path d="M160.8 111.2 H161.8" />
      </g>

      {/* ── 准星：唯一的游戏 UI，压在目标胸口 ──────────────────────── */}
      <g stroke="#05090d" strokeWidth="3.2" opacity="0.55">
        <circle cx="158" cy="108" r="8.5" fill="none" />
        <path d="M158 91 V99 M158 117 V125 M141 108 H149 M167 108 H175" />
      </g>
      <g stroke={accent} strokeWidth="1.2" strokeLinecap="butt">
        <circle cx="158" cy="108" r="8.5" fill="none" opacity="0.85" />
        <path d="M158 92 V99 M158 117 V124 M142 108 H149 M167 108 H174" />
      </g>
      <circle cx="158" cy="108" r="1.2" fill={accent} />

      {/* ── 前景 / 颗粒 / 压暗 ─────────────────────────────────────── */}
      {/* 左下角压一块近景箱角，制造「我在掩体后」的纵深 */}
      <path d="M0 180 V150 L34 144 L78 180 Z" fill="#05090d" />
      <path d="M0 150 L34 144" stroke="#2d3740" strokeWidth="1" opacity="0.7" />

      <g fill="#ffd9a0">
        <circle cx="112" cy="62" r="0.9" opacity="0.5" />
        <circle cx="126" cy="86" r="0.7" opacity="0.35" />
        <circle cx="204" cy="58" r="0.8" opacity="0.4" />
        <circle cx="188" cy="72" r="0.6" opacity="0.3" />
        <circle cx="94" cy="94" r="0.7" opacity="0.3" />
        <circle cx="238" cy="90" r="0.8" opacity="0.28" />
        <circle cx="146" cy="68" r="0.6" opacity="0.35" />
      </g>

      <rect width="320" height="180" fill="url(#h5c-vig)" />
      <rect width="320" height="34" fill="url(#h5c-top)" />
      <rect y="126" width="320" height="54" fill="url(#h5c-fade)" />
    </svg>
  );
}
