'use client';

import type { HitSpot, HitTier, WeaponId } from '@/lib/h5/types';
import { WEAPONS } from '@/lib/h5/weapons';

/**
 * 准星 / 命中标记 / 狙击镜 / 受击反馈。
 *
 * 这几样东西放一个文件是因为它们**永远在同一个位置、同一层级**，而且互相排斥：
 * 开镜时准星让位给镜筒、命中标记永远盖在最上面。拆成几个文件只会让「谁压着谁」
 * 这件事散落在好几处 className 里。
 *
 * 全部是纯 DOM，不是 canvas —— 准星要跟着 CSS 缩放走，用 canvas 反而要自己
 * 处理 devicePixelRatio，而且没法用 `backdrop-filter`。
 */

/** 命中标记显示多久（毫秒）。和引擎里 `hitMark` 音效的尾巴对齐。 */
const HIT_MARKER_MS = 170;

/** 击杀标记留得更久、斜杠更粗：这一下是「打死了」，值得多看一眼。 */
const KILL_MARKER_MS = 250;

/**
 * hitmarker 四根斜杠的方位与倾角。
 *
 * `dx/dy` 是象限（-1 = 左/上），`rot` 是 CSS 旋转角（顺时针为正）：
 *   左上 ╲ / 右上 ╱ / 左下 ╱ / 右下 ╲  —— 正是 CF 那种「四条斜杠朝外炸开」的样子。
 * 角度必须让它**沿对角线方向躺下**（而不是垂直于对角线），否则读起来像准星的延长线。
 */
const SLASHES = [
  { dx: -1, dy: -1, rot: 45 },
  { dx: 1, dy: -1, rot: -45 },
  { dx: -1, dy: 1, rot: -45 },
  { dx: 1, dy: 1, rot: 45 },
] as const;

/** hitmarker 容器边长。斜杠按这个盒子算绝对位置（盒心 = 准星中心）。 */
const MARKER_BOX = 52;

/**
 * 斜杠中心在**单轴**上的偏移量。
 *
 * ⚠️ 这不是斜杠到中心的距离：斜杠在 45° 方位上，真实半径是 `13 × 1.414 ≈ 18.4`，
 * 减去半根斜杠（5px）后内端落在 13.4px 处 —— 比准星本体（24×24，臂尖在 ±12px）
 * 略外一点，视觉上就是「贴在准星外面的四根短杠」。
 *
 * 上一版把斜杠画在准星**内部**，看着像套了两个准星，所以这一版整个推到外侧。
 */
const MARKER_OFFSET = 13;

export function ShipCrosshair({
  scoped,
  weapon,
  dead,
  pulse,
}: {
  scoped: boolean;
  /** 当前武器。**能不能开镜**以 `WEAPONS[id].scoped` 为准，别在这里另写「是不是狙击枪」 */
  weapon: WeaponId;
  dead: boolean;
  /**
   * 击杀瞬间的准星「放大回弹」（需求 §3 准星扩散）。`strong` = 爆头击杀
   * （220ms，峰值 1.15），普通击杀走小一档（170ms，峰值 1.07）——
   * 「每次击杀都有确认」和「爆头仍然更值钱」同时成立。
   * `at` 变化即重放动画；`at` 为 0 = 不播。
   */
  pulse?: { at: number; strong: boolean };
}) {
  if (dead) return null;

  const pulsing = pulse !== undefined && pulse.at > 0;

  // 狙击枪腰射**不画准星**（2026-11-12 用户要求）：枪本身没有机械瞄具给你对，
  // 不开镜就是一片空白，逼玩家「停下来、开镜、开一枪」—— 和 weapons.ts 里
  // AWM 的设计意图是同一句话。判定走 `spec.scoped` 单点开关，不是写死枪名。
  const hipHidden = !scoped && WEAPONS[weapon].scoped;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      {scoped ? (
        <ScopeOverlay />
      ) : hipHidden ? null : (
        // 四段短线 + 中心点。CF 的准星就是这种「开缝」形状，
        // 缝宽固定、不随散布变化 —— 那是 CS 的做法，两套手感别混
        <div
          key={pulsing ? pulse.at : 0}
          className="relative h-6 w-6"
          style={
            pulsing
              ? {
                  animation: `${pulse.strong ? 'ship-crosshair-pulse' : 'ship-crosshair-pulse-soft'} ${
                    pulse.strong ? 220 : 170
                  }ms ease-out`,
                }
              : undefined
          }
        >
          <span className="absolute top-1/2 left-0 h-px w-[7px] -translate-y-1/2 bg-white/85 shadow-[0_0_2px_rgba(0,0,0,.9)]" />
          <span className="absolute top-1/2 right-0 h-px w-[7px] -translate-y-1/2 bg-white/85 shadow-[0_0_2px_rgba(0,0,0,.9)]" />
          <span className="absolute top-0 left-1/2 h-[7px] w-px -translate-x-1/2 bg-white/85 shadow-[0_0_2px_rgba(0,0,0,.9)]" />
          <span className="absolute bottom-0 left-1/2 h-[7px] w-px -translate-x-1/2 bg-white/85 shadow-[0_0_2px_rgba(0,0,0,.9)]" />
          <span className="absolute top-1/2 left-1/2 h-[2px] w-[2px] -translate-x-1/2 -translate-y-1/2 bg-[#f0a020]" />
        </div>
      )}
    </div>
  );
}

/**
 * 狙击镜：四个黑角 + 中间一个圆孔。
 *
 * 用 `box-shadow: 0 0 0 9999px #000` 挖洞，而不是画四个矩形 —— 一个元素搞定，
 * 而且圆孔在任何宽高比下都是正圆。
 */
function ScopeOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div
        className="h-[min(78vh,78vw)] w-[min(78vh,78vw)] rounded-full border border-black/80"
        style={{ boxShadow: '0 0 0 9999px #000, inset 0 0 60px 20px rgba(0,0,0,.9)' }}
      >
        {/* 十字分划 */}
        <div className="relative h-full w-full">
          <span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-black/70" />
          <span className="absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-black/70" />
          <span className="absolute top-1/2 left-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 bg-[#f0a020]" />
        </div>
      </div>
    </div>
  );
}

/**
 * 命中标记（hitmarker）。
 *
 * ## 形态：四根斜杠在准星**外侧**炸开
 *
 * 上一版是在准星内部画四条斜线，看起来像「准星套准星」，像 UI bug。这一版把
 * 斜杠整体推到准星外围：中心距 20px、单根长 10px，内端落在 15px 处，和准星臂尖
 * （±12px）留 3px 空隙 —— 两条几何完全分离，读起来才是「打中了」的标记。
 *
 * ## 三档语义（颜色 + 粗细 + 时长一起变）
 *
 *   命中普通部位   白色，2px，170ms
 *   命中爆头       金色，2px，170ms
 *   致死一击       红色，3px，250ms
 *
 * 只靠颜色是不够的：余光里红色和金色在深色背景上亮度接近，所以击杀档同时加粗
 * 加长。三档共用一套 keyframes（`ship-hit`），靠内联 `animationDuration` 区分。
 *
 * ## 连续命中不叠加
 *
 * `key={at}` 让每次命中都重建这四个元素，动画从头播 —— 于是永远是「一组标记在
 * 重放」，而不是两组叠在一起糊成一团。这也是为什么这里不需要清理定时器：
 * 标记的消失完全由 CSS `forwards` 决定，DOM 留着但透明度是 0。
 *
 * ## 位置：跟着**真实命中点**走
 *
 * `spot` 是引擎投影出来的命中点（NDC）。没有它（近战、点在相机背后）就画在
 * 屏幕正中。有它的时候整组标记会平移过去 —— 平移量用 `vw/vh` 而不是 px：
 * 不用读 `window`，服务端渲染也不会和客户端对不上。
 *
 * 引擎已经把偏移夹在准星周围 1/5 屏内（`SPOT_LIMIT`），所以这里拿到的值一定
 * 在视线中心附近：既看得出「打偏了一点」，又不会像 UI 跑飞了。
 */
export function ShipHitMarker({ at, tier, spot }: { at: number; tier: HitTier; spot?: HitSpot }) {
  if (at === 0) return null;

  const kill = tier === 'kill';
  const head = tier === 'head';

  const color = kill ? '#ff2d2d' : head ? '#ffc83d' : '#ffffff';
  const glow = kill ? 'rgba(255,45,45,.85)' : head ? 'rgba(255,200,61,.85)' : 'rgba(255,255,255,.7)';
  const length = kill ? 12 : 10;
  const thickness = kill ? 3 : 2;
  const duration = kill ? KILL_MARKER_MS : HIT_MARKER_MS;

  // NDC(-1..1) → 视口百分比：x 向右为正、y 向上为正（CSS 的 y 向下）
  const dx = spot ? spot.x * 50 : 0;
  const dy = spot ? -spot.y * 50 : 0;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      style={{ transform: `translate(${dx.toFixed(2)}vw, ${dy.toFixed(2)}vh)` }}
    >
      <div
        key={at}
        className="flex h-full w-full items-center justify-center"
        style={{ animation: `ship-hit ${duration}ms ease-out forwards` }}
      >
        <div className="relative" style={{ width: MARKER_BOX, height: MARKER_BOX }}>
          {SLASHES.map((slash) => (
            <span
              key={`${slash.dx}:${slash.dy}`}
              className="absolute block rounded-[1px]"
              style={{
                width: length,
                height: thickness,
                // 旋转绕自身中心，所以先按「中心点 = 盒子中心 + 单轴偏移」摆位
                left: MARKER_BOX / 2 + slash.dx * MARKER_OFFSET - length / 2,
                top: MARKER_BOX / 2 + slash.dy * MARKER_OFFSET - thickness / 2,
                transform: `rotate(${slash.rot}deg)`,
                background: color,
                boxShadow: `0 0 4px ${glow}, 0 0 1px rgba(0,0,0,.9)`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** 被打时的红色暗角。`strength` 0..1，越疼越红。 */
export function ShipDamageVignette({ strength }: { strength: number }) {
  if (strength <= 0.01) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10"
      style={{
        background: `radial-gradient(circle at center, transparent 42%, rgba(150,10,10,${(strength * 0.55).toFixed(3)}) 100%)`,
        transition: 'opacity 120ms linear',
      }}
    />
  );
}

/**
 * 受击方向弧形指示器 —— 主流 FPS 的标配：挨打时屏幕边缘会亮起一段弧，
 * 指向子弹来的方向。
 *
 * ## 为什么是「一个圆环只画上边框」
 *
 * `border-radius: 50%` 加上「四条边只给上边着色」，上边框正好是一段 90° 的
 * 弧。整圈转 `angle` 就能指向任意方向 —— 比手算 SVG path 简单得多，
 * 而且圆环在任何宽高比下都是正圆。
 *
 * `angle` 是弧度：0 = 正前方（弧在屏幕顶部），正值 = 顺时针（右侧）。
 * 引擎每 100ms 按玩家当前朝向重算一次，所以玩家转视角时弧会跟着转。
 */
export function ShipDamageArc({ angle }: { angle: number | null }) {
  if (angle === null) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div
        style={{
          width: 'min(80vw, 80vh)',
          height: 'min(80vw, 80vh)',
          transform: `rotate(${angle.toFixed(3)}rad)`,
          transition: 'transform 120ms linear',
        }}
      >
        <div
          className="h-full w-full rounded-full"
          style={{
            border: '4px solid transparent',
            borderTopColor: 'rgba(255,74,74,0.88)',
            filter: 'drop-shadow(0 0 6px rgba(255,60,60,0.65))',
          }}
        />
      </div>
    </div>
  );
}

/**
 * 低血量脉动。`hp` 低于 30 才出现，越接近 0 越明显。
 *
 * 刻意做得很淡（最大 26% 不透明度）：它是**氛围**，不是信息 —— 血量数字和
 * 血条已经给了精确值，这一层只是让玩家余光里觉得「不对劲」。
 * 和死亡时的全屏遮罩不是一回事，那个已经删掉了。
 */
export function ShipLowHpPulse({ hp }: { hp: number }) {
  if (hp > 30 || hp <= 0) return null;

  const t = Math.min(1, (30 - hp) / 30);
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10"
      style={{
        boxShadow: `inset 0 0 90px 34px rgba(120,0,0,${(0.10 + t * 0.16).toFixed(3)})`,
        animation: 'ship-heartbeat 1.15s ease-in-out infinite',
      }}
    />
  );
}
