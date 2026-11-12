import type { Vector3 } from 'three';
import { type Aabb, type Point3, clamp, rayBox } from './math';
import type { Actor, Surface } from './types';

/**
 * 碰撞与射线 —— **纯函数，不含任何游戏状态**。
 *
 * 这一层只认「一堆盒子」和「一个会动的圆柱」，不认识玩家、Bot、比分。
 * 好处是引擎和 Bot 走的是同一条代码路径：能走人的地方就能走 Bot，
 * 能打到人的射线就能打到 Bot，不会出现「Bot 卡在玩家能过的门框上」。
 *
 * ## 为什么不用物理引擎
 *
 * 这张图全是轴对齐的方块（船体、集装箱、箱子、楼梯），没有一个斜面。
 * AABB 逐轴分离 + 自动上台阶，两百行就能做到「贴墙滑行、上楼梯、跳上箱子」
 * 这三件事，而 cannon-es 要引入刚体、约束、休眠管理，还得为「FPS 玩家不是
 * 刚体」写一堆补丁。这里**明确不做**：斜坡、可推物体、布娃娃。
 */

export interface Collider extends Aabb {
  /** 木箱可穿透（伤害 ×0.4） */
  pen: boolean;
  surf: Surface;
}

/** 会动的东西（玩家、Bot、手雷）。`pos` 是**脚底**位置。 */
export interface Mover {
  pos: Vector3;
  vel: Vector3;
  radius: number;
  height: number;
  onGround: boolean;
  /**
   * 位置解算的**跨帧状态**（安全点 + 卡死计时）。
   *
   * 必须由实体自己持有并跨帧复用 —— `Player` / `Bot` 各一份。每帧新建一个
   * 等于每次都是「第一次移动」，回退和计时全部失效。
   */
  motion: MotionState;
}

/**
 * 水平方向的容差。比它更小的重叠当作「贴着」处理 ——
 * 否则贴墙站立时每帧都会被推开 1e-7 米，画面持续抖动。
 */
const EPS_XZ = 0.004;

/**
 * 垂直方向的容差。**必须小于一帧的重力位移**（dt=16ms 时约 5mm），
 * 否则站在地面上会被判成「没接触」，直接穿下去。
 */
const EPS_Y = 0.001;

/* ============================================================
   位置解算的限幅参数（防「一帧弹射」）
   ============================================================ */

/**
 * 单帧水平推出上限（米）。
 *
 * 原来的写法是「一旦重叠就把坐标怼到盒面外」，推出量**等于穿透深度**。玩家
 * 只要卡进集装箱一次（被 Bot 挤、上台阶判定失败、切后台回来），一帧就飞出去
 * 一两米 —— 这就是「跑着跑着突然瞬移」的主因。限幅之后超出部分不再补，
 * 剩下的交给贴墙滑动和下一帧。
 */
const MAX_PUSH = 0.3;

/**
 * 单帧垂直吸附上限（米）。
 *
 * 深穿透（横向挤进集装箱）时如果还按 `p.y = box.max.y` 结算，人会被直接
 * 「顶到箱子顶上」—— 从甲板瞬移到 2.6 米高。超出这个量就退回本帧起点，
 * 不认这次垂直命中。
 */
const MAX_V_SNAP = 0.5;

/** 连续重叠多久判定为卡死（秒）。到点才启动回退，避免正常贴墙时误触发。 */
const STUCK_LIMIT = 0.18;

/** 回退到安全点的平滑时间（秒）。**绝不硬切** —— 硬切本身就是一次瞬移。 */
const SAFE_RECOVER = 0.1;

/** 掉到甲板以下这么多米就当「掉出世界」（甲板 y=0，海面 y=-3.2）。 */
export const FALL_OUT_Y = -8;

/**
 * 位置解算的跨帧状态。
 *
 * `safe*` 是**最后一个站得稳、且不与任何碰撞盒重叠**的位置。卡死回退、
 * 掉图找回都往这里去 —— 它比出生点近得多，回退不会让人「跑图重来」。
 */
export interface MotionState {
  safeX: number;
  safeY: number;
  safeZ: number;
  /** 连续重叠累计时间（秒） */
  overlapTime: number;
  /** 正在平滑回退 */
  recovering: boolean;
  /** 记过安全点没有（第一帧还没落过地） */
  primed: boolean;
}

export function createMotionState(): MotionState {
  return { safeX: 0, safeY: 0, safeZ: 0, overlapTime: 0, recovering: false, primed: false };
}

/**
 * 主动传送（重生 / 掉图找回）之后**必须**调用。
 * 不重置的话，安全点还停在旧位置，下一次卡死回退会把人从出生点拉回去。
 */
export function resetMotionState(motion: MotionState, pos: { x: number; y: number; z: number }): void {
  motion.safeX = pos.x;
  motion.safeY = pos.y;
  motion.safeZ = pos.z;
  motion.overlapTime = 0;
  motion.recovering = false;
  motion.primed = true;
}

/** 坐标非法或掉出船体 —— 该把人捞回来了。 */
export function isOutOfWorld(pos: { x: number; y: number; z: number }): boolean {
  return (
    !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z) || pos.y < FALL_OUT_Y
  );
}

/** 和任意盒子重叠时返回那个盒子。 */
export function collideAt(
  x: number,
  y: number,
  z: number,
  radius: number,
  height: number,
  colliders: readonly Collider[],
): Collider | null {
  for (let i = 0; i < colliders.length; i += 1) {
    const box = colliders[i]!;
    if (x + radius <= box.min.x + EPS_XZ) continue;
    if (x - radius >= box.max.x - EPS_XZ) continue;
    if (z + radius <= box.min.z + EPS_XZ) continue;
    if (z - radius >= box.max.z - EPS_XZ) continue;
    if (y + height <= box.min.y + EPS_Y) continue;
    if (y >= box.max.y - EPS_Y) continue;
    return box;
  }
  return null;
}

/**
 * 移动一个实体：逐轴分离 + 自动上台阶。
 *
 * 顺序是「先水平、后垂直」，因为台阶判定要用到**上一帧**的 `onGround`
 * （跳起来之后不该还能踩着空气往上爬）。水平被挡时退回去重试一次「抬高
 * `stepUp` 米再走」，能过就把脚落到台阶面上 —— 这就是楼梯能走、墙走不过去
 * 的全部秘密。
 *
 * ## 三条硬规矩（对应「移动偶发瞬移」的修复）
 *
 * 1. **每帧只有这一个函数写 `pos`**：输入 → 积分 → 碰撞解算 → 一次写回；
 * 2. **任何推出量都限幅**（`MAX_PUSH` / `MAX_V_SNAP`），不做「一帧弹出表面」；
 * 3. 实在卡住了就记安全点，**0.1 秒平滑插值**回去，绝不硬切。
 */
export function moveEntity(
  ent: Mover,
  dx: number,
  dy: number,
  dz: number,
  stepUp: number,
  colliders: readonly Collider[],
  dt: number,
): void {
  // dt 兜底：调用方理论上已经夹过了，但这里是唯一写 pos 的地方，自己再夹一道
  const step = dt > 0 && dt < 0.25 ? dt : 1 / 60;
  const r = ent.radius;
  const h = ent.height;
  const p = ent.pos;
  const motion = ent.motion;
  const hit = (x: number, y: number, z: number) => collideAt(x, y, z, r, h, colliders);

  /* ---- 0. 安全点初始化 ---- */
  if (!motion.primed) resetMotionState(motion, p);

  /* ---- 0b. 卡死回退：0.1 秒内插值回安全点（不是一帧跳回去） ---- */
  if (motion.recovering) {
    const t = 1 - Math.exp(-step * (3 / SAFE_RECOVER));
    p.x += (motion.safeX - p.x) * t;
    p.y += (motion.safeY - p.y) * t;
    p.z += (motion.safeZ - p.z) * t;
    ent.vel.set(0, 0, 0);
    ent.onGround = true;
    if (
      Math.abs(p.x - motion.safeX) < 0.04 &&
      Math.abs(p.y - motion.safeY) < 0.04 &&
      Math.abs(p.z - motion.safeZ) < 0.04
    ) {
      p.set(motion.safeX, motion.safeY, motion.safeZ);
      motion.recovering = false;
      motion.overlapTime = 0;
    }
    return;
  }

  const startX = p.x;
  const startZ = p.z;

  /**
   * 单轴移动 + 限幅推出。
   *
   * 关键在最后那行 `clamp(want, base - MAX_PUSH, base + MAX_PUSH)`：理论推出
   * 位置离本帧起点太远时不认它，宁可留在原地（这一帧没走成），也不弹射。
   */
  const pushAxis = (axis: 'x' | 'z', d: number): boolean => {
    if (d === 0) return false;

    const base = axis === 'x' ? p.x : p.z;
    if (axis === 'x') p.x = base + d;
    else p.z = base + d;

    let blk = false;
    for (let k = 0; k < 4; k += 1) {
      const box = hit(p.x, p.y, p.z);
      if (!box) break;
      const want =
        axis === 'x'
          ? d > 0
            ? box.min.x - r - EPS_XZ
            : box.max.x + r + EPS_XZ
          : d > 0
            ? box.min.z - r - EPS_XZ
            : box.max.z + r + EPS_XZ;
      const next = clamp(want, base - MAX_PUSH, base + MAX_PUSH);
      if (axis === 'x') p.x = next;
      else p.z = next;
      blk = true;
    }
    return blk;
  };

  const blockedX = pushAxis('x', dx);
  const blockedZ = pushAxis('z', dz);
  const blocked = blockedX || blockedZ;

  // ---- 自动上台阶 ----
  if (blocked && ent.onGround && stepUp > 0) {
    const feetY = p.y;
    p.x = startX;
    p.z = startZ;
    p.y = feetY + stepUp;

    if (!hit(p.x, p.y, p.z)) {
      pushAxis('x', dx);
      pushAxis('z', dz);
      if (!hit(p.x, p.y, p.z)) {
        // 落到台阶面上：每次降 2cm，撞到东西就停
        let guard = 0;
        while (guard < 40 && p.y > feetY && !hit(p.x, p.y - 0.02, p.z)) {
          p.y -= 0.02;
          guard += 1;
        }
        if (p.y < feetY) p.y = feetY;
        ent.onGround = true;
      } else {
        p.x = startX;
        p.z = startZ;
        p.y = feetY;
      }
    } else {
      p.x = startX;
      p.z = startZ;
      p.y = feetY;
    }
  }

  // ---- 垂直：吸附量限幅 ----
  ent.onGround = false;
  if (dy !== 0) {
    const fromY = p.y;
    // 吸附上限跟着本帧的垂直位移走：高速下落（dy 可达 -0.75）必须允许一次
    // 沉到地面，否则「落地」会被自己的限幅挡掉，人悬在半空
    const snapLimit = Math.max(MAX_V_SNAP, Math.abs(dy) + 0.05);
    p.y += dy;

    for (let k = 0; k < 4; k += 1) {
      const box = hit(p.x, p.y, p.z);
      if (!box) break;
      if (dy < 0) {
        if (box.max.y - p.y <= snapLimit) {
          p.y = box.max.y;
          ent.onGround = true;
        } else {
          // 深穿透 = 是横向挤进去的，不认这次命中（否则会「顶到箱子顶上」）
          p.y = fromY;
        }
      } else {
        if (p.y - (box.min.y - h) <= snapLimit) p.y = box.min.y - h;
        else p.y = fromY;
      }
      ent.vel.y = 0;
    }
  }

  // 静止贴地时补一次探测（重力位移比 EPS_Y 还小的极端帧）。
  // 6cm 的向下探测等价于一根短射线，吸附量天然有界
  if (!ent.onGround && ent.vel.y <= 0 && hit(p.x, p.y - 0.06, p.z)) {
    ent.onGround = true;
  }

  /* ---- 4. 重叠记账：连续重叠到阈值就平滑回退 ---- */
  if (hit(p.x, p.y, p.z)) {
    motion.overlapTime += step;
    if (motion.overlapTime >= STUCK_LIMIT) motion.recovering = true;
  } else {
    motion.overlapTime = 0;
    // 只把「站得稳且不重叠」的位置记成安全点，半空中/贴墙重叠的位置不能记
    if (ent.onGround) {
      motion.safeX = p.x;
      motion.safeY = p.y;
      motion.safeZ = p.z;
    }
  }
}

export interface WorldHit {
  t: number;
  collider: Collider;
  nx: number;
  ny: number;
  nz: number;
}

/** 射线与关卡求交。返回最近的一个。 */
export function rayWorld(
  origin: Point3,
  dir: Point3,
  maxT: number,
  colliders: readonly Collider[],
  minT = 0,
): WorldHit | null {
  let best: WorldHit | null = null;
  let bestT = maxT;

  for (let i = 0; i < colliders.length; i += 1) {
    const collider = colliders[i]!;
    const result = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, collider, bestT);
    if (result && result.t > minT && result.t < bestT) {
      bestT = result.t;
      best = { t: result.t, collider, nx: result.nx, ny: result.ny, nz: result.nz };
    }
  }
  return best;
}

/** 视线检查。只看静态几何 —— 人挡人不算挡视线。 */
export function losClear(from: Point3, to: Point3, colliders: readonly Collider[]): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (distance < 0.05) return true;
  const dir = { x: dx / distance, y: dy / distance, z: dz / distance };
  return rayWorld(from, dir, distance - 0.15, colliders) === null;
}

/* ============================================================
   实体命中盒
   ============================================================ */

/** 头部占身高的比例。0.13 × 1.8m ≈ 23cm，比真脑袋略大，手感优先。 */
const HEAD_RATIO = 0.13;

export function actorBoxes(actor: Pick<Actor, 'pos' | 'height' | 'radius'>): { head: Aabb; body: Aabb } {
  const { pos, height } = actor;
  const headHeight = height * HEAD_RATIO;
  const half = actor.radius * 0.82;
  const headHalf = 0.155;
  return {
    head: {
      min: { x: pos.x - headHalf, y: pos.y + height - headHeight, z: pos.z - headHalf },
      max: { x: pos.x + headHalf, y: pos.y + height, z: pos.z + headHalf },
    },
    body: {
      min: { x: pos.x - half, y: pos.y, z: pos.z - half },
      max: { x: pos.x + half, y: pos.y + height - headHeight, z: pos.z + half },
    },
  };
}

export interface ActorHit {
  t: number;
  actor: Actor;
  head: boolean;
}

/**
 * 射线与所有实体求交。
 *
 * **同队直接跳过**（子弹穿队友而过）—— 这张图 Bot 密度不低，开友伤只会
 * 变成「自己的 AI 把自己人打死」。玩家也一样，误射队友不掉血。
 */
export function rayActors(
  origin: Point3,
  dir: Point3,
  maxT: number,
  actors: readonly Actor[],
  ignore: Actor | null,
  minT = 0,
): ActorHit | null {
  let best: ActorHit | null = null;
  let bestT = maxT;
  const ignoreTeam = ignore ? ignore.team : -1;

  for (let i = 0; i < actors.length; i += 1) {
    const actor = actors[i]!;
    if (actor === ignore || !actor.alive) continue;
    if (actor.team === ignoreTeam) continue;

    const boxes = actorBoxes(actor);
    const body = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, boxes.body, bestT);
    if (body && body.t > minT && body.t < bestT) {
      bestT = body.t;
      best = { t: body.t, actor, head: false };
    }
    const head = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, boxes.head, bestT);
    if (head && head.t > minT && head.t < bestT) {
      bestT = head.t;
      best = { t: head.t, actor, head: true };
    }
  }
  return best;
}

/* ============================================================
   完整弹道
   ============================================================ */

/**
 * 一条弹丸的结算结果。
 *
 * ⚠️ **每个结果都带 `dir`，而且是这一颗弹丸实际打出去的方向（已含散布）的拷贝。**
 *
 * 这是「连发扩散看着不生效」那条 bug 的根：曳光 / 观察者如果拿射手的**基础朝向**
 * （相机中心射线）去算终点，那么不管散布算了多少，画面上每一发的弹道都是同一条
 * 中心线 —— 玩家看到的就是「子弹全打在一个点」，而弹孔其实是散的。
 *
 * 必须是**拷贝**：`fireWeapon` 里那个方向缓冲是一发一发的复用对象（省分配），
 * 存引用的话等调用方回头读，里面已经是最后一颗弹丸的方向了。
 */
export type ShotHit =
  | { type: 'none'; t: number; dmgMul: number; dir: Point3 }
  | { type: 'world'; t: number; dmgMul: number; point: Point3; normal: Point3; collider: Collider; dir: Point3 }
  | { type: 'actor'; t: number; dmgMul: number; point: Point3; normal: Point3; actor: Actor; head: boolean; dir: Point3 };

/**
 * 一条弹道打到哪儿了 —— 含木箱穿透。
 *
 * 穿一层木箱伤害 ×0.4，最多穿 `penCount` 层。穿透用「推进射线起点再射一次」
 * 实现，而不是在结果里回传一串命中点：调用方只关心「第一处该结算的东西」。
 */
export function traceShot(
  origin: Point3,
  dir: Point3,
  maxT: number,
  actors: readonly Actor[],
  colliders: readonly Collider[],
  ignore: Actor | null,
  penCount: number,
): ShotHit {
  let start = 0;
  let dmgMul = 1;
  let pens = 0;

  /** 每个结果都要留一份方向拷贝（见 `ShotHit.dir` 的说明）。 */
  const rayDir = (): Point3 => ({ x: dir.x, y: dir.y, z: dir.z });

  for (let iter = 0; iter < 5; iter += 1) {
    const world = rayWorld(origin, dir, maxT, colliders, start);
    const actor = rayActors(origin, dir, maxT, actors, ignore, start);

    if (actor && (!world || actor.t <= world.t)) {
      return {
        type: 'actor',
        t: actor.t,
        dmgMul,
        actor: actor.actor,
        head: actor.head,
        point: { x: origin.x + dir.x * actor.t, y: origin.y + dir.y * actor.t, z: origin.z + dir.z * actor.t },
        normal: { x: 0, y: 0, z: 0 },
        dir: rayDir(),
      };
    }

    if (!world) return { type: 'none', t: maxT, dmgMul, dir: rayDir() };

    if (world.collider.pen && pens < penCount) {
      pens += 1;
      dmgMul *= 0.4;
      start = world.t + 0.08;
      continue;
    }

    return {
      type: 'world',
      t: world.t,
      dmgMul,
      collider: world.collider,
      point: { x: origin.x + dir.x * world.t, y: origin.y + dir.y * world.t, z: origin.z + dir.z * world.t },
      normal: { x: world.nx, y: world.ny, z: world.nz },
      dir: rayDir(),
    };
  }

  return { type: 'none', t: maxT, dmgMul, dir: rayDir() };
}
