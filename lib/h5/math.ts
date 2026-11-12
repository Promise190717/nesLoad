import type { Vector3 } from 'three';

/**
 * 数学 / 射线工具。没有依赖，也不碰 DOM。
 *
 * 为什么单独一个文件：物理层、命中判定、Bot 瞄准都要用「夹取」「角度归一」
 * 「射线 vs AABB」，各写一份必然会在某次改动里分叉（一个减 2π、一个用 `%`
 * 却不处理负数），表现为「准星和子弹方向差一点点」这种极难查的 bug。
 */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

/** 俯仰上限（弧度）。约 85°，再大就会在天顶翻转。 */
export const PITCH_LIMIT = 1.45;

/* ============================================================
   标量
   ============================================================ */

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 帧率无关的指数逼近。
 *
 * 用 `1 - exp(-k·dt)` 而不是固定比例的 `lerp(a, b, 0.2)`：后者在 30fps 和 144fps
 * 下的收敛速度差三倍，表现是「高刷屏上手感发飘」。
 */
export function damp(current: number, target: number, smoothing: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-smoothing * dt));
}

/**
 * 缓出三次曲线。`t` 会被夹到 0..1。
 *
 * 倒地、镜头拉起这类动作都用它：一开始速度最大、最后几乎停住，看起来才「有重量」。
 * 线性插值会让 1.6 米的下落像电梯。
 */
export function easeOutCubic(t: number): number {
  const inv = 1 - clamp(t, 0, 1);
  return 1 - inv * inv * inv;
}

/** 缓入缓出三次曲线。两个位姿之间过渡用它，两头都不会「顿一下」。 */
export function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** 缓入三次曲线。加速起步 —— 武器「被甩出画面」用这个。 */
export function easeInCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * x;
}

/**
 * 带回弹的缓出曲线（back easing）。
 *
 * `overshoot` 是回弹幅度，0 = 普通 `easeOutCubic`；标准值 1.70158 大约过冲 10%。
 * 切枪的「落位回弹」用它：函数在中段会返回 **大于 1** 的值，调用方按
 * `目标 + (起点 - 目标) * (1 - k)` 计算位置，`k > 1` 那一段就是「多走一点再弹回来」。
 *
 * 这个文件里唯一一个会超出 [0,1] 的缓动 —— 需要过冲的地方才用，别的都用三次曲线。
 */
export function easeOutBack(t: number, overshoot = 1.70158): number {
  const x = clamp(t, 0, 1);
  const c = overshoot + 1;
  const inv = x - 1;
  return 1 + c * inv * inv * inv + overshoot * inv * inv;
}

/** 把角度收进 (-π, π]。所有「取最小转向」的地方都先过这一道。 */
export function normalizeAngle(radians: number): number {
  let value = radians % TAU;
  if (value > Math.PI) value -= TAU;
  if (value <= -Math.PI) value += TAU;
  return value;
}

/** 朝 `target` 转，一次最多转 `maxStep`。Bot 转视角用它，避免瞬间甩枪。 */
export function turnToward(current: number, target: number, maxStep: number): number {
  const delta = normalizeAngle(target - current);
  if (Math.abs(delta) <= maxStep) return current + delta;
  return current + Math.sign(delta) * maxStep;
}

export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/* ============================================================
   方向
   ============================================================ */

/**
 * 由 yaw / pitch 生成单位前向量。
 *
 * 约定：`yaw = 0` 朝 **-z**，`yaw` 增大 = 往左转（绕 +y 逆时针）；
 * `pitch` 正 = 抬头。和 three.js 相机 `rotation.y / rotation.x`（YXZ 序）一致，
 * 所以渲染层直接把这两个值塞给相机就行，不用再算一遍。
 */
export function dirFromAngles(yaw: number, pitch: number, out?: Vector3): Vector3 {
  const cp = Math.cos(pitch);
  const x = -Math.sin(yaw) * cp;
  const y = Math.sin(pitch);
  const z = -Math.cos(yaw) * cp;
  if (out) {
    out.set(x, y, z);
    return out;
  }
  // 这里的 `as Vector3` 是刻意的：调用方要么只用 x/y/z，要么自己传 out。
  return { x, y, z } as Vector3;
}

/**
 * 给方向加一个圆锥形随机偏移。
 *
 * `spread` 是**半角**（弧度）。半径用 `sqrt(random)` 采样，否则粒子会挤在圆心，
 * 表现为「散布看起来比设定值小」。
 */
export function spreadDir(dir: Vector3, spread: number, out?: Vector3): Vector3 {
  const target = out ?? ({ x: 0, y: 0, z: 0 } as Vector3);
  if (spread <= 0) {
    target.x = dir.x;
    target.y = dir.y;
    target.z = dir.z;
    return target;
  }

  // 构造一组与 dir 垂直的基：up 取 (0,1,0)，几乎竖直时换成 (1,0,0)
  const ux = Math.abs(dir.y) > 0.95 ? 1 : 0;
  const uy = Math.abs(dir.y) > 0.95 ? 0 : 1;

  let rx = dir.y * 0 - dir.z * uy;
  let ry = dir.z * ux - dir.x * 0;
  let rz = dir.x * uy - dir.y * ux;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl;
  ry /= rl;
  rz /= rl;

  // up2 = right × dir
  const ux2 = ry * dir.z - rz * dir.y;
  const uy2 = rz * dir.x - rx * dir.z;
  const uz2 = rx * dir.y - ry * dir.x;

  const angle = Math.random() * TAU;
  const radius = Math.sqrt(Math.random()) * spread;
  const ca = Math.cos(angle) * radius;
  const sa = Math.sin(angle) * radius;

  target.x = dir.x + rx * ca + ux2 * sa;
  target.y = dir.y + ry * ca + uy2 * sa;
  target.z = dir.z + rz * ca + uz2 * sa;

  const len = Math.hypot(target.x, target.y, target.z) || 1;
  target.x /= len;
  target.y /= len;
  target.z /= len;
  return target;
}

/* ============================================================
   射线 vs AABB
   ============================================================ */

/** 只读的三维点/向量。`THREE.Vector3` 在结构上满足它，所以两边可以混着传。 */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** 轴对齐包围盒。碰撞盒和命中盒都是它 —— 够用、便宜、和 three 的 Box3 结构兼容。 */
export interface Aabb {
  min: Point3;
  max: Point3;
}

export interface RayHit {
  /** 进入距离（起点在盒内时为 0） */
  t: number;
  nx: number;
  ny: number;
  nz: number;
}

/**
 * 射线与 AABB 求交（slab 法）。
 *
 * `dir` 必须是单位向量。返回**进入点**的距离和命中面的法线；
 * 起点在盒内时返回 `t = 0`（法线为零向量）。
 */
export function rayBox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  box: Aabb,
  maxT = Infinity,
): RayHit | null {
  let tmin = 0;
  let tmax = maxT;
  let axis = 0;
  let sign = 1;
  let t1: number;
  let t2: number;

  // X
  if (Math.abs(dx) < 1e-9) {
    if (ox < box.min.x || ox > box.max.x) return null;
  } else {
    const inv = 1 / dx;
    t1 = (box.min.x - ox) * inv;
    t2 = (box.max.x - ox) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) {
      tmin = t1;
      axis = 1;
      sign = dx > 0 ? -1 : 1;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  // Y
  if (Math.abs(dy) < 1e-9) {
    if (oy < box.min.y || oy > box.max.y) return null;
  } else {
    const inv = 1 / dy;
    t1 = (box.min.y - oy) * inv;
    t2 = (box.max.y - oy) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) {
      tmin = t1;
      axis = 2;
      sign = dy > 0 ? -1 : 1;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  // Z
  if (Math.abs(dz) < 1e-9) {
    if (oz < box.min.z || oz > box.max.z) return null;
  } else {
    const inv = 1 / dz;
    t1 = (box.min.z - oz) * inv;
    t2 = (box.max.z - oz) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) {
      tmin = t1;
      axis = 3;
      sign = dz > 0 ? -1 : 1;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  return {
    t: tmin,
    nx: axis === 1 ? sign : 0,
    ny: axis === 2 ? sign : 0,
    nz: axis === 3 ? sign : 0,
  };
}
