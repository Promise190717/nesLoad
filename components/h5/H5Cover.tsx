/**
 * H5 游戏卡片的封面。
 *
 * 同样是**代码画出来的**（`<svg>` 内联，不是图片）：站里没有美术资源目录，
 * 加一张 png 就是多一份要版本管理的二进制。
 *
 * 画的是运输船甲板的一角：阴天海面、四组集装箱、码头钢板地面、一道黄线，
 * 中间一枚准星（颜色取卡片主色 `accent`，现在是 CF 的橙金）。
 * **不放人物** —— 320×180 的缩略图里，人形剪影要么太小
 * 看不出是什么，要么画大之后比例一定崩；货场本身已经把「军事射击」说清楚了。
 *
 * 是服务端组件（没有 'use client'）：纯静态 SVG，不带任何交互，可以跟着页面一起
 * 被 CDN 缓存整片发出去。
 */
export default function H5Cover({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 320 180" className="block h-full w-full" role="img" aria-hidden>
      <defs>
        <linearGradient id="h5-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4f6577" />
          <stop offset="62%" stopColor="#8fa4b3" />
          <stop offset="100%" stopColor="#c2d0d9" />
        </linearGradient>
        <linearGradient id="h5-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#546a79" />
          <stop offset="100%" stopColor="#3c4d5a" />
        </linearGradient>
        <linearGradient id="h5-deck" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6a767c" />
          <stop offset="100%" stopColor="#4a555b" />
        </linearGradient>
        <linearGradient id="h5-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      {/* 天空与海 */}
      <rect width="320" height="180" fill="url(#h5-sky)" />
      <g fill="#b9c8d2" opacity="0.35">
        <ellipse cx="62" cy="26" rx="34" ry="9" />
        <ellipse cx="250" cy="20" rx="30" ry="8" />
        <ellipse cx="160" cy="34" rx="46" ry="10" />
      </g>
      <rect y="98" width="320" height="16" fill="url(#h5-sea)" />
      <g stroke="#8ba3b4" strokeWidth="1" opacity="0.4">
        <path d="M0 103 H58 M74 103 H132 M150 103 H214 M232 103 H320" />
        <path d="M18 109 H96 M116 109 H186 M206 109 H288" />
      </g>

      {/* 甲板：透视分隔线从中间往两侧发散 */}
      <rect y="113" width="320" height="67" fill="url(#h5-deck)" />
      <g stroke="#3d474d" strokeWidth="1" opacity="0.55">
        <path d="M160 113 L-40 180" />
        <path d="M160 113 L70 180" />
        <path d="M160 113 L190 180" />
        <path d="M160 113 L300 180" />
        <path d="M0 132 H320" />
        <path d="M0 152 H320" />
        <path d="M0 172 H320" />
      </g>

      {/* 集装箱：四组，前大后小制造纵深 */}
      {/* 左一（近） */}
      <g>
        <rect x="6" y="58" width="84" height="55" fill="#4d5f47" />
        <rect x="6" y="58" width="84" height="6" fill="#5d7155" />
        <rect x="6" y="107" width="84" height="6" fill="#39452f" />
        <g fill="#3a4936" opacity="0.75">
          <rect x="18" y="64" width="5" height="43" />
          <rect x="36" y="64" width="5" height="43" />
          <rect x="54" y="64" width="5" height="43" />
          <rect x="72" y="64" width="5" height="43" />
        </g>
        <rect x="6" y="58" width="5" height="55" fill="#2f3a28" />
      </g>

      {/* 中左（远） */}
      <g>
        <rect x="96" y="76" width="52" height="37" fill="#3b5265" />
        <rect x="96" y="76" width="52" height="4" fill="#4a6579" />
        <g fill="#2c4152" opacity="0.8">
          <rect x="106" y="80" width="4" height="29" />
          <rect x="120" y="80" width="4" height="29" />
          <rect x="134" y="80" width="4" height="29" />
        </g>
      </g>

      {/* 中右（远） */}
      <g>
        <rect x="154" y="70" width="58" height="43" fill="#8f4438" />
        <rect x="154" y="70" width="58" height="5" fill="#a05246" />
        <g fill="#70332a" opacity="0.8">
          <rect x="164" y="75" width="4" height="34" />
          <rect x="180" y="75" width="4" height="34" />
          <rect x="196" y="75" width="4" height="34" />
        </g>
      </g>

      {/* 右一（近） */}
      <g>
        <rect x="232" y="52" width="86" height="61" fill="#4d5f47" />
        <rect x="232" y="52" width="86" height="6" fill="#5d7155" />
        <rect x="232" y="107" width="86" height="6" fill="#39452f" />
        <g fill="#3a4936" opacity="0.75">
          <rect x="244" y="58" width="5" height="49" />
          <rect x="262" y="58" width="5" height="49" />
          <rect x="280" y="58" width="5" height="49" />
          <rect x="298" y="58" width="5" height="49" />
        </g>
        <rect x="313" y="52" width="5" height="61" fill="#2f3a28" />
      </g>

      {/* 甲板黄线：码头/货轮的标识色，也把视线压回中间 */}
      <rect y="140" width="320" height="4" fill="#d9a02a" opacity="0.7" />
      <rect y="144" width="320" height="2" fill="#2a2f33" opacity="0.6" />

      {/* 准星：先一圈黑描边再压绿色，浅灰甲板上才看得见 */}
      <g stroke="#0b0f12" strokeWidth="3.6" strokeLinecap="butt" opacity="0.6">
        <path d="M160 74 V86" />
        <path d="M160 100 V112" />
        <path d="M147 93 H159" />
        <path d="M173 93 H185" />
      </g>
      <g stroke={accent} strokeWidth="2" strokeLinecap="butt">
        <path d="M160 76 V86" />
        <path d="M160 100 V110" />
        <path d="M149 93 H159" />
        <path d="M173 93 H183" />
      </g>
      <rect x="159" y="92" width="2" height="2" fill={accent} />

      {/* 底部压暗：卡片标题压在上面时不至于糊字 */}
      <rect y="120" width="320" height="60" fill="url(#h5-fade)" />
    </svg>
  );
}
