'use client';

/**
 * 击杀特效：屏幕中央偏下的击杀勋章 + 屏幕边缘脉冲。
 *
 * ## 为什么图标自己画 SVG
 *
 * 不用 CF 原版贴图（版权），也不用现成图标库（这个项目没有图标依赖，为两个形状
 * 引一套包不划算）。骷髅 + 双翼是通用符号，自己画既没有版权问题，也能让爆头版
 * 只多几笔裂痕 —— 两档共用同一套几何，切换时不会「换个完全不同的东西」。
 *
 * ## 位置
 *
 * 锚在准星正下方约 110px 处、**不挡准星也不挡击杀播报**（那个在右上角）。
 * 用 `top-1/2` + `marginTop` 而不是 `bottom-[…]`：屏幕高度变化时它跟着准星走，
 * 而不是跟着底边跑。
 *
 * ## 时长
 *
 * 需求里「停留 0.8s」和验收里「单次总时长 ≤ 1s」是冲突的，这里取 1000ms 总长：
 * 弹出 120ms → 停留 600ms → 上飘渐隐 280ms。取验收那条硬指标，因为「不糊屏」
 * 是能感知到的，而 0.8s 还是 0.6s 的停留差 200ms 基本感觉不出来。
 */

/** 图标整体时长（毫秒）。见文件头注释：验收要求 ≤ 1s。 */
const KILL_ICON_MS = 1000;

/** 图标顶边距屏幕中线的距离。图标高 72px，所以视觉中心大约在准星下方 144px。 */
const ICON_OFFSET = 108;

/** 连杀角标最多显示到几连（再多就写 ×5+，否则字宽会把图标压扁）。 */
const STREAK_CAP = 5;

export default function ShipKillIcon({
  at,
  head,
  streak,
}: {
  /** 时间戳，0 = 不显示。变化即重放动画 */
  at: number;
  /** 爆头击杀：金色 + 头顶裂痕 + 一圈放射光 */
  head: boolean;
  /** 这一杀之后的连杀数，≥2 时画 ×N 角标 */
  streak: number;
}) {
  if (at === 0) return null;

  const color = head ? '#ffd24a' : '#e8eef6';
  const glow = head ? 'rgba(255,196,64,.9)' : 'rgba(226,236,248,.6)';
  // 爆头多一条「弹得更狠」的 keyframes（峰值 1.3 vs 1.15），见 globals.css
  const iconAnim = head ? 'ship-kill-icon-head' : 'ship-kill-icon';

  return (
    <div
      key={at}
      className="pointer-events-none absolute inset-x-0 top-1/2 z-20 flex justify-center"
      style={{ marginTop: ICON_OFFSET }}
    >
      <div
        className="flex flex-col items-center"
        style={{ animation: `${iconAnim} ${KILL_ICON_MS}ms ease-out both` }}
      >
        <div className="relative flex items-center justify-center">
          {head ? (
            // 放射光：只在爆头出现，0.28s 内炸开并消失，不参与「停留」
            <span
              className="absolute rounded-full"
              style={{
                width: 150,
                height: 150,
                background:
                  'radial-gradient(circle, rgba(255,214,90,.55) 0%, rgba(255,186,40,.24) 42%, rgba(255,180,30,0) 68%)',
                animation: 'ship-kill-burst 280ms ease-out both',
              }}
            />
          ) : null}

          <svg
            width={104}
            height={70}
            viewBox="0 0 96 64"
            aria-hidden
            style={{ filter: `drop-shadow(0 0 ${head ? 10 : 6}px ${glow})` }}
          >
            {/* 双翼：只画左半边，右半边用镜像 —— 保证绝对对称，也少写一半路径 */}
            <g fill={color} opacity={0.92}>
              <Wing />
              <g transform="translate(96,0) scale(-1,1)">
                <Wing />
              </g>
            </g>

            {/* 骷髅。evenodd 让眼窝 / 鼻腔 / 齿缝真正镂空（背景是 3D 画面，
                不能用「填个背景色」来假装挖洞） */}
            <path
              fill={color}
              fillRule="evenodd"
              d={[
                'M48 12C57.5 12 64 18.6 64 27.5C64 32.6 62 36.4 58.8 38.8L58.8 44.2C58.8 46.4 57 48.2 54.8 48.2L41.2 48.2C39 48.2 37.2 46.4 37.2 44.2L37.2 38.8C34 36.4 32 32.6 32 27.5C32 18.6 38.5 12 48 12Z',
                'M39 26.5A4 4 0 1 1 47 26.5A4 4 0 1 1 39 26.5Z',
                'M49 26.5A4 4 0 1 1 57 26.5A4 4 0 1 1 49 26.5Z',
                'M48 32.5L50.8 37.5L45.2 37.5Z',
                'M44 41.5L44 48.2L46.4 48.2L46.4 41.5Z',
                'M49.6 41.5L49.6 48.2L52 48.2L52 41.5Z',
              ].join(' ')}
            />

            {/* 爆头：头顶的弹孔 + 裂痕。普通击杀不画这两笔，两档一眼可辨 */}
            {head ? (
              <g stroke={color} strokeWidth={1.6} strokeLinecap="round" fill="none" opacity={0.95}>
                <circle cx={48} cy={19.5} r={2.4} fill="#10141a" stroke="none" />
                <path d="M48 12L45.5 6.5L48.5 3" />
                <path d="M52 13L56 9" />
              </g>
            ) : null}
          </svg>
        </div>

        {streak >= 2 ? (
          <span
            className="mt-0.5 text-[15px] leading-none font-black tracking-wide"
            style={{ color: head ? '#ffd24a' : '#ffffff', textShadow: '0 1px 6px rgba(0,0,0,.85)' }}
          >
            ×{streak > STREAK_CAP ? `${STREAK_CAP}+` : streak}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 半边翅膀：三根从根部向左扇形展开的羽刃。
 *
 * 三根而不是更多：这个图标在屏幕上只有 100px 宽，再多羽刃会糊成一团黑色块。
 * 根部刻意压在骷髅侧脸下方（x≈36），让翅膀「长在」骷髅上而不是浮在旁边。
 */
function Wing() {
  return (
    <>
      <path d="M36 24Q22 12 6 8Q18 18 25 24Q31 28 36 30Z" />
      <path d="M36 30Q18 25 2 26Q15 31 25 33Q31 34 36 34Z" />
      <path d="M36 34Q20 38 7 46Q19 42 27 38Q32 36 36 37Z" />
    </>
  );
}

/**
 * 击杀瞬间的屏幕边缘脉冲。
 *
 * 需求明确写了「禁止大色块、长时间遮挡视野」，所以这里：
 *   · 只用 `inset` 外发光，中间是空的 —— 不挡视线
 *   · 峰值不透明度 0.22（需求上限 25%）
 *   · 200ms 就没了，且只闪一次
 *
 * 爆头偏金色，普通击杀偏冷白。**和击杀图标同色**，玩家余光里能对上。
 */
export function ShipKillPulse({ at, head }: { at: number; head: boolean }) {
  if (at === 0) return null;

  const tint = head ? 'rgba(255,200,70,0.22)' : 'rgba(226,236,248,0.18)';

  return (
    <div
      key={at}
      className="pointer-events-none absolute inset-0 z-10"
      style={{
        boxShadow: `inset 0 0 120px 40px ${tint}`,
        animation: 'ship-kill-pulse 200ms ease-out both',
      }}
    />
  );
}
