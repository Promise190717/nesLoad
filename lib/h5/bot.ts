import { Vector3 } from 'three';
import { type CombatHooks, currentSpread, fireWeapon, nowSeconds } from './combat';
import { type NavGrid, nearestWalkablePoint } from './level';
import { clamp, damp, normalizeAngle, rand, randInt } from './math';
import {
  type Collider,
  createMotionState,
  isOutOfWorld,
  losClear,
  moveEntity,
  resetMotionState,
} from './physics';
import type { Actor, Difficulty, Team, WeaponId } from './types';
import { WEAPONS } from './weapons';

/**
 * Bot —— 状态机 + A* 寻路 + 弹药管理。
 *
 * **不碰渲染**：这里没有 Mesh、没有材质、没有动画相位。`actor-view.ts` 负责
 * 把 `Bot` 的 `pos / yaw / vel / alive` 翻译成看得见的模型。分开的好处是
 * 「Bot 卡住不动」这类问题只需要看这个文件，不用在一千行渲染代码里翻。
 *
 * ## 状态机
 *
 *   patrol  ──看到敌人──▶  engage  ──丢失目标 1.2s──▶  patrol
 *
 * 只有两个状态是刻意的：三状态以上的 FSM 在「掩体」这一层会立刻失控（要不要
 * 撤退、撤到哪、撤完干嘛），而这张图的核心体验是「中近距离对枪」，多加一个
 * 状态不如把交战时的侧移和点射节奏调好。
 *
 * ## 为什么巡逻不直接走向敌人
 *
 * 因为 Bot 没有全局视野。它每隔 2.5~5 秒随机挑一个「偏向敌方半场」的格子，
 * 用 A* 走过去；路上撞见人再切交战。这样玩家会看到 Bot 从各个角度出现，
 * 而不是「一队人排着队从中路直冲」。
 */

/* ============================================================
   难度
   ============================================================ */

export interface SkillProfile {
  /** 发现目标到开第一枪的反应时间（秒） */
  react: number;
  /** 瞄准误差（弧度）。发现目标初期按比例叠加到散布上。 */
  aimErr: number;
  /** 散布倍率 */
  spreadMul: number;
  /** 视距（米）。超过这个距离「看不见」，也就不用做视线检测了。 */
  range: number;
  /** 点射发数 [最少, 最多] */
  burst: readonly [number, number];
  /** 点射间隔（秒） */
  pause: readonly [number, number];
  /** 转身速度（弧度/秒）。低难度看起来「反应慢半拍」。 */
  turn: number;
}

export const SKILL: Record<Difficulty, SkillProfile> = {
  easy: { react: 0.6, aimErr: 0.105, spreadMul: 2.4, range: 40, burst: [2, 4], pause: [0.55, 1.1], turn: 3.2 },
  normal: { react: 0.34, aimErr: 0.055, spreadMul: 1.45, range: 58, burst: [3, 6], pause: [0.32, 0.7], turn: 5.5 },
  hard: { react: 0.17, aimErr: 0.026, spreadMul: 0.85, range: 75, burst: [4, 8], pause: [0.16, 0.38], turn: 9.0 },
};

/**
 * Bot 的伤害倍率 —— **0.4 = 降低 60%**。
 *
 * 为什么不写进 `SkillProfile`：难度管的是「打得准不准、反应快不快」，这个管的是
 * 「打中了有多疼」。混进难度表会让「简单模式」变成「打不死人」，那是另一回事。
 * 也不去改 `WEAPONS` 表里的 `damage` —— 那张表玩家和 Bot 共用，改一个会连带
 * 削弱玩家手里的同一把枪。倍率通过 `fireWeapon` 的 `damageMul` 参数走。
 *
 * 只作用于枪械弹道：Bot 不扔手雷、不挥刀，那两条路径不经过这里。
 */
const BOT_DAMAGE_MUL = 0.4;

export const BOT_NAMES = [
  '幽灵',
  '猎鹰',
  '铁锤',
  '毒蛇',
  '夜莺',
  '秃鹫',
  '黑鲨',
  '冷刃',
  '游隼',
  '狼牙',
  '苍狼',
  '赤狐',
] as const;

/* ============================================================
   世界视图（Bot 眼里的世界）
   ============================================================ */

export interface BotWorld {
  actors: readonly Actor[];
  colliders: readonly Collider[];
  nav: NavGrid;
  hooks: CombatHooks;
}

/* ============================================================
   Bot
   ============================================================ */

/** 站立身高 / 眼高。Bot 不会蹲 —— 蹲下会让它的命中盒和动画都对不上。 */
const STAND_HEIGHT = 1.8;
const EYE_HEIGHT = 1.62;
const RADIUS = 0.42;
const GRAVITY = 20;
/** 自动上台阶高度。楼梯单级 0.32 米，0.45 留了余量。 */
const STEP_UP = 0.45;
/** 听枪声的距离（米）。只对 30 米内的枪声有反应，免得全图人机同时涌向一个点。 */
const HEAR_RANGE = 30;
/** 目击 / 枪声情报的保鲜期（秒）。过期后回随机巡逻。 */
const HEAR_MEMORY = 8;

export type BotState = 'patrol' | 'engage';

export class Bot implements Actor {
  readonly id: string;
  readonly name: string;
  readonly team: Team;
  readonly isPlayer = false;
  /** 人机。模型走 `actor-view.ts` 的 `'bot'` 造型（和真人的战术装备明显不同） */
  readonly isHuman = false;

  pos = new Vector3();
  vel = new Vector3();
  radius = RADIUS;
  height = STAND_HEIGHT;
  yaw: number;
  pitch = 0;
  health = 100;
  armor = 0;
  alive = true;
  kills = 0;
  deaths = 0;
  weapon: WeaponId;
  protectUntil = 0;
  deathTime = 0;
  lastHitBy: Actor | null = null;

  /** 眼睛相对脚底的高度。射线起点、视线检测都用它。 */
  readonly eye = EYE_HEIGHT;

  skill: SkillProfile;

  /* 弹药 */
  mag: number;
  reserve: number;
  private reloadTimer = 0;
  private fireCooldown = 0;
  private burstLeft = 0;
  private burstPause = 0;
  /**
   * 连发累积散布（弧度）。和玩家 `Player.spreadAccum` 同一条规则：
   * 每次成功击发 +`perShot`、每帧按 4.5 指数衰减 —— Bot 打长点射也会越打越散，
   * 不再是「每一发都从零散布起步的激光枪」。
   */
  private spreadAccum = 0;

  /* 感知 */
  state: BotState = 'patrol';
  target: Actor | null = null;
  private seenFor = 0;
  private lostFor = 0;
  /** 最后一次目击（或听到）敌人的位置。追击与搜索的唯一情报来源。 */
  private lastKnown: { x: number; z: number } | null = null;
  /** lastKnown 的失效时刻（绝对秒）。过期即当作情报作废。 */
  private lastKnownUntil = 0;

  /* 移动 */
  private path: { x: number; z: number }[] = [];
  private pathIndex = 0;
  private repathTimer = 0;
  private stuckTimer = 0;
  private readonly lastPos = new Vector3();
  private strafeDir = 1;
  private strafeTimer = 0;
  /** 节点进度看门狗：上次采样时到当前路径点的距离 / 距采样计时 */
  private nodeDistSample = Infinity;
  private nodeSampleTimer = 0;
  /** 脱困侧移：>0 时沿意图方向的垂直向硬走，把 Bot 从缝里剥出来 */
  private unstuckTimer = 0;
  private unstuckDir = 1;
  /** 最近一次非零移动意图（脱困侧移的基准方向；脱困期间不更新，防止每帧转 90°） */
  private intentX = 0;
  private intentZ = 0;
  private onGround = false;
  /** 位置解算的跨帧状态（安全点 / 卡死计时）。和玩家同一条代码路径 */
  private readonly motion = createMotionState();

  constructor(id: string, team: Team, name: string, difficulty: Difficulty, weapon: WeaponId = 'ak47') {
    this.id = id;
    this.team = team;
    this.name = name;
    this.skill = SKILL[difficulty];
    this.weapon = weapon;
    // 面向敌方半场：保卫者（z 负）朝 +z 看，潜伏者朝 -z 看
    this.yaw = team === 0 ? Math.PI : 0;

    const spec = WEAPONS[weapon];
    this.mag = spec.magazine;
    this.reserve = spec.reserve;
  }

  get eyePos(): { x: number; y: number; z: number } {
    return { x: this.pos.x, y: this.pos.y + this.eye, z: this.pos.z };
  }

  setWeapon(weapon: WeaponId): void {    this.weapon = weapon;
    const spec = WEAPONS[weapon];
    this.mag = spec.magazine;
    this.reserve = spec.reserve;
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this.burstLeft = 0;
    this.spreadAccum = 0;
  }

  respawn(position: Vector3, protectSeconds: number): void {
    this.pos.copy(position);
    this.vel.set(0, 0, 0);
    // 重生是「主动传送」：安全点必须跟着重置，否则卡死回退会把 Bot 拉回旧位置
    resetMotionState(this.motion, position);
    this.health = 100;
    this.armor = 0;
    this.alive = true;
    this.deathTime = 0;
    this.protectUntil = nowSeconds() + protectSeconds;
    this.lastHitBy = null;

    this.state = 'patrol';
    this.target = null;
    this.seenFor = 0;
    this.lostFor = 0;
    this.lastKnown = null;
    this.lastKnownUntil = 0;
    this.path = [];
    this.pathIndex = 0;
    this.repathTimer = 0;
    this.stuckTimer = 0;
    this.lastPos.copy(position);
    this.nodeSampleTimer = 0;
    this.nodeDistSample = Infinity;
    this.unstuckTimer = 0;
    this.intentX = 0;
    this.intentZ = 0;
    this.onGround = false;

    const spec = WEAPONS[this.weapon];
    this.mag = spec.magazine;
    this.reserve = spec.reserve;
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this.burstLeft = 0;
    this.spreadAccum = 0;
  }

  /* ------------------------------------------------------------
     每帧
     ------------------------------------------------------------ */

  /** 换难度。不用重建 Bot —— 只换一张参数表。 */
  setDifficulty(difficulty: Difficulty): void {
    this.skill = SKILL[difficulty];
  }

  /**
   * 听到枪声。引擎在 `onShot` 里对每个 Bot 调用（含本机玩家开的枪）——
   * 枪声是 Bot 主动找人最主要的情报来源：玩家不开枪摸过来，Bot 只能靠
   * 巡逻撞见他。只对敌方射手、且限距内感兴趣。
   */
  hearShot(shooter: Actor): void {
    if (!this.alive || shooter.team === this.team) return;
    const distance = Math.hypot(shooter.pos.x - this.pos.x, shooter.pos.z - this.pos.z);
    if (distance > HEAR_RANGE) return;
    // 只记射手脚下的大致位置，不做测向 —— 听到「那边有人」就够了
    this.lastKnown = { x: shooter.pos.x, z: shooter.pos.z };
    this.lastKnownUntil = nowSeconds() + HEAR_MEMORY;
    // 没在交战就立刻动身过去看看，不等下一个巡逻周期
    if (this.state === 'patrol') this.repathTimer = 0;
  }

  update(dt: number, world: BotWorld): void {
    if (!this.alive) {
      this.deathTime += dt;
      return;
    }

    this.pickTarget(dt, world);
    this.steer(dt, world);
    this.physics(dt, world.colliders, world.nav);
    // 连发散布的衰减放在 update 而不是 tryFire：tryFire 在换弹 / 没目标 /
    // 点射间歇时会提前 return，那些时段也必须照常恢复（衰减速率与玩家一致）
    this.spreadAccum = damp(this.spreadAccum, 0, 4.5, dt);
    this.tryFire(dt, world);
  }

  /* ---------- 感知 ---------- */

  /**
   * 能不能看见对方。
   *
   * 视线从「自己的眼睛」到「对方身高的 62%」（大约胸口）—— 打到头不叫看见，
   * 因为 Bot 需要的是「有个躯干可以瞄」。
   */
  private canSee(other: Actor, colliders: readonly Collider[]): boolean {
    if (!other.alive) return false;
    const from = this.eyePos;
    const to = {
      x: other.pos.x,
      y: other.pos.y + other.height * 0.62,
      z: other.pos.z,
    };
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) > this.skill.range) return false;
    return losClear(from, to, colliders);
  }

  private pickTarget(dt: number, world: BotWorld): void {
    let best: Actor | null = null;
    let bestDistance = Infinity;
    const rangeSquared = this.skill.range * this.skill.range;

    for (const other of world.actors) {
      if (other === this || other.team === this.team || !other.alive) continue;
      const dx = other.pos.x - this.pos.x;
      const dz = other.pos.z - this.pos.z;
      const squared = dx * dx + dz * dz;
      if (squared > rangeSquared || squared >= bestDistance) continue;
      if (!this.canSee(other, world.colliders)) continue;
      bestDistance = squared;
      best = other;
    }

    if (best) {
      // 换目标时把「已经盯了多久」清零，否则换人的瞬间就享受到了满精度
      if (this.target !== best) this.seenFor = 0;
      this.target = best;
      this.lostFor = 0;
      this.seenFor += dt;
      // 情报刷新：看见一秒记一秒，丢了才知道往哪追
      this.lastKnown = { x: best.pos.x, z: best.pos.z };
      this.lastKnownUntil = nowSeconds() + HEAR_MEMORY;
      this.state = 'engage';
    } else {
      this.lostFor += dt;
      // 1.2 秒的宽容期：敌人从掩体后一闪而过时不要立刻放弃追击
      if (this.lostFor > 1.2) {
        this.target = null;
        this.state = 'patrol';
        this.repathTimer = 0;
      }
    }
  }

  /* ---------- 转向与移动 ---------- */

  /**
   * 沿当前路径走一步。返回 null = 当前没有节点可走（走完了 / 刚被跳过）。
   *
   * 节点进度看门狗：0.35 秒采样一次「到当前节点的距离」，没接近 0.15 米就是被
   * 什么别住了 —— 典型是 nav 说能走、物理撞墙（网格一格的误差），或者被队友的
   * 分离力挤进箱角。只重寻路不够：A* 从同一个位置会算出同一条路，Bot 会在同一
   * 面墙上磨到天荒地老，所以跳过节点的同时起一段垂直侧移。
   */
  private followPath(dt: number, speed: number): { x: number; z: number; speed: number } | null {
    const node = this.path[this.pathIndex];
    if (!node) return null;
    const dx = node.x - this.pos.x;
    const dz = node.z - this.pos.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.75) {
      this.pathIndex += 1;
      this.nodeSampleTimer = 0;
      this.nodeDistSample = Infinity;
      return null;
    }

    this.nodeSampleTimer += dt;
    if (this.nodeSampleTimer >= 0.35) {
      const progress = this.nodeDistSample - length;
      if (progress < 0.15) {
        // 别住了：跳过这个节点 + 起侧移；这是最后一个节点就整段重寻路
        this.pathIndex += 1;
        if (this.pathIndex >= this.path.length) {
          this.path = [];
          this.repathTimer = 0;
        }
        this.unstuckTimer = 0.6;
        this.unstuckDir = Math.random() < 0.5 ? -1 : 1;
        this.nodeSampleTimer = 0;
        this.nodeDistSample = Infinity;
        return null;
      }
      this.nodeDistSample = length;
      this.nodeSampleTimer = 0;
    }

    return { x: dx / length, z: dz / length, speed };
  }

  private steer(dt: number, world: BotWorld): void {
    const skill = this.skill;

    // 朝向：有目标看目标，没目标看下一个路径点
    let desiredYaw = this.yaw;
    if (this.target) {
      const dx = this.target.pos.x - this.pos.x;
      const dz = this.target.pos.z - this.pos.z;
      const dy = this.target.pos.y + this.target.height * 0.66 - (this.pos.y + this.eye);
      desiredYaw = Math.atan2(-dx, -dz);
      this.pitch = damp(this.pitch, Math.atan2(dy, Math.hypot(dx, dz) || 1), 10, dt);
    } else if (this.pathIndex < this.path.length) {
      const node = this.path[this.pathIndex]!;
      desiredYaw = Math.atan2(-(node.x - this.pos.x), -(node.z - this.pos.z));
      this.pitch = damp(this.pitch, 0, 6, dt);
    }
    this.yaw += clamp(normalizeAngle(desiredYaw - this.yaw), -skill.turn * dt, skill.turn * dt);

    // 位移意图
    let moveX = 0;
    let moveZ = 0;
    let speed = 0;

    if (this.state === 'engage' && this.target) {
      if (this.lostFor > 0) {
        // 目标躲进掩体 / 脱离视线（1.2s 宽容期内）：不站桩游走，直接 A* 追向
        // 目标当前位置。以前这里是 strafe —— 玩家躲一下人机就原地蹭着不动，
        // 「躲在障碍后面不动」就是这段写出来的。
        this.repathTimer -= dt;
        if (this.repathTimer <= 0) {
          this.repathTimer = rand(0.8, 1.4);
          this.path = findPath(world.nav, this.pos.x, this.pos.z, this.target.pos.x, this.target.pos.z);
          this.pathIndex = 0;
          this.nodeSampleTimer = 0;
          this.nodeDistSample = Infinity;
        }
        const step = this.followPath(dt, 4.0);
        if (step) {
          moveX = step.x;
          moveZ = step.z;
          // 比巡逻（3.6）快一点，追人要有「压上来」的观感
          speed = step.speed;
        }
      } else {
        // 可见交战：保持交战距离（8~18 米），同时横向游走 —— 站桩对枪的 Bot 太好打了
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) {
          this.strafeTimer = rand(0.7, 1.7);
          this.strafeDir = Math.random() < 0.5 ? -1 : 1;
        }
        const distance = Math.hypot(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z);
        const forward = distance > 18 ? 1 : distance < 8 ? -1 : 0;
        const forwardX = -Math.sin(this.yaw);
        const forwardZ = -Math.cos(this.yaw);
        const rightX = Math.cos(this.yaw);
        const rightZ = -Math.sin(this.yaw);
        moveX = forwardX * forward * 0.9 + rightX * this.strafeDir * 0.75;
        moveZ = forwardZ * forward * 0.9 + rightZ * this.strafeDir * 0.75;
        speed = 3.4;
      }
    } else {
      this.repathTimer -= dt;
      if (this.repathTimer <= 0 || this.pathIndex >= this.path.length) {
        this.repathTimer = rand(2.5, 5);
        this.chooseDestination(world.nav);
        this.nodeSampleTimer = 0;
        this.nodeDistSample = Infinity;
      }
      const step = this.followPath(dt, 3.6);
      if (step) {
        moveX = step.x;
        moveZ = step.z;
        speed = step.speed;
      }
    }

    const magnitude = Math.hypot(moveX, moveZ);
    if (magnitude > 0.001) {
      moveX /= magnitude;
      moveZ /= magnitude;
      // 脱困期间不更新基准方向，否则侧移方向每帧自乘一次会转圈
      if (this.unstuckTimer <= 0) {
        this.intentX = moveX;
        this.intentZ = moveZ;
      }
    }

    // 与队友分离：不加这一条，三个 Bot 会叠在同一个路径点上抖成一片
    for (const other of world.actors) {
      if (other === this || !other.alive) continue;
      const dx = this.pos.x - other.pos.x;
      const dz = this.pos.z - other.pos.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 1.1 && distance > 0.001) {
        moveX += (dx / distance) * 0.8;
        moveZ += (dz / distance) * 0.8;
      }
    }

    // 脱困侧移盖过一切移动意图：沿「想走的方向」垂直硬走 0.6 秒。
    // 分离力、寻路意图都先让位 —— 先把身体从 nav/物理不一致的缝里挪出来
    if (this.unstuckTimer > 0) {
      this.unstuckTimer -= dt;
      if (this.intentX !== 0 || this.intentZ !== 0) {
        moveX = -this.intentZ * this.unstuckDir;
        moveZ = this.intentX * this.unstuckDir;
        speed = 3.0;
      }
    }

    this.vel.x = damp(this.vel.x, moveX * speed, 9.1, dt);
    this.vel.z = damp(this.vel.z, moveZ * speed, 9.1, dt);
  }

  private physics(dt: number, colliders: readonly Collider[], nav: NavGrid): void {
    this.vel.y -= GRAVITY * dt;
    if (this.vel.y < -40) this.vel.y = -40;

    const mover = {
      pos: this.pos,
      vel: this.vel,
      radius: this.radius,
      height: this.height,
      onGround: this.onGround,
      motion: this.motion,
    };
    moveEntity(mover, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt, STEP_UP, colliders, dt);
    this.onGround = mover.onGround;

    // 掉出船体 / 坐标非法：回最近可行走点（不回出生点）
    if (isOutOfWorld(this.pos)) {
      const point = nearestWalkablePoint(
        nav,
        Number.isFinite(this.pos.x) ? this.pos.x : 0,
        Number.isFinite(this.pos.z) ? this.pos.z : 0,
      );
      if (point) this.pos.set(point.x, 0.05, point.z);
      else this.pos.set(0, 0.05, 0);
      this.vel.set(0, 0, 0);
      this.onGround = false;
      this.path = [];
      this.repathTimer = 0;
      resetMotionState(this.motion, this.pos);
    }

    // 卡住检测收紧：1.0 秒内位移 < 0.45 米就重新规划 + 起一段脱困侧移。
    // （旧版 1.4s/0.6m 太宽松，Bot 贴墙磨蹭半天才反应。）
    this.stuckTimer += dt;
    if (this.stuckTimer > 1.0) {
      const moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z);
      if (moved < 0.45) {
        if (this.state === 'engage' && this.target && this.lostFor === 0) {
          // 可见交战卡住 = strafe 撞上掩体，换个方向游走
          this.strafeDir = -this.strafeDir;
          this.strafeTimer = rand(0.7, 1.7);
        } else {
          this.path = [];
          this.repathTimer = 0;
          this.unstuckTimer = 0.6;
          this.unstuckDir = Math.random() < 0.5 ? -1 : 1;
        }
      }
      this.lastPos.copy(this.pos);
      this.stuckTimer = 0;
    }
  }

  private chooseDestination(nav: NavGrid): void {
    // 有新鲜情报（目击 / 枪声）先去搜：到了附近没人才回随机巡逻。
    if (this.lastKnown) {
      if (nowSeconds() >= this.lastKnownUntil) {
        this.lastKnown = null;
      } else if (Math.hypot(this.pos.x - this.lastKnown.x, this.pos.z - this.lastKnown.z) < 3) {
        // 人已经站在情报点上了还没看见人 —— 情报作废
        this.lastKnown = null;
      } else {
        this.path = findPath(nav, this.pos.x, this.pos.z, this.lastKnown.x, this.lastKnown.z);
        this.pathIndex = 0;
        if (this.path.length > 0) return;
        this.lastKnown = null;
      }
    }

    // 偏向敌方半场：保卫者想去 +z，潜伏者想去 -z
    const preferZ = this.team === 0 ? 1 : -1;
    const cellCount = nav.nx * nav.nz;

    let best: { score: number; x: number; z: number } | null = null;
    for (let i = 0; i < 14; i += 1) {
      const index = Math.floor(Math.random() * cellCount);
      if (!nav.isWalkable(index)) continue;
      const center = nav.center(index);
      let score = center.z * preferZ * 0.5 + Math.random() * 30;
      if (this.target) {
        score -= Math.hypot(center.x - this.target.pos.x, center.z - this.target.pos.z) * 0.4;
      }
      if (!best || score > best.score) best = { score, x: center.x, z: center.z };
    }
    if (!best) return;

    this.path = findPath(nav, this.pos.x, this.pos.z, best.x, best.z);
    this.pathIndex = 0;
  }

  /* ---------- 开火 ---------- */

  private tryFire(dt: number, world: BotWorld): void {
    const spec = WEAPONS[this.weapon];

    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const needed = spec.magazine - this.mag;
        const taken = Math.min(needed, this.reserve);
        this.mag += taken;
        this.reserve -= taken;
      }
      return;
    }

    this.fireCooldown -= dt;

    if (!this.target || !this.target.alive || this.state !== 'engage') return;
    if (this.seenFor < this.skill.react) return;

    if (this.mag <= 0) {
      if (this.reserve > 0) this.reloadTimer = spec.reload;
      // Bot 不做弹药经济：备弹打空就直接补满，免得它拿着空枪站着不动
      else this.reserve = spec.reserve;
      return;
    }

    if (this.burstPause > 0) {
      this.burstPause -= dt;
      return;
    }
    if (this.burstLeft <= 0) {
      this.burstLeft = randInt(this.skill.burst[0], this.skill.burst[1]);
    }

    if (this.fireCooldown > 0) return;
    this.fireCooldown = spec.interval;

    const origin = this.eyePos;
    // 瞄准点：78% 打胸口，22% 打头。不是精确命中 —— 精度交给散布去表达
    const aimHeight = this.target.height * (Math.random() < 0.22 ? 0.94 : 0.62);
    const target = {
      x: this.target.pos.x,
      y: this.target.pos.y + aimHeight,
      z: this.target.pos.z,
    };
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const dz = target.z - origin.z;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const dir = new Vector3(dx / length, dy / length, dz / length);

    // 刚发现目标时手不稳，持续跟踪后逐渐稳定 —— 这是「反应时间」之外的第二层难度
    const settle = Math.min(1, this.seenFor / 1.2);
    const spread = currentSpread(spec, {
      speed: Math.hypot(this.vel.x, this.vel.z),
      onGround: this.onGround,
      crouching: false,
      scoped: false,
      accum: this.spreadAccum,
    });
    const finalSpread = spread * this.skill.spreadMul + this.skill.aimErr * (1 - settle) * 0.55;

    const results = fireWeapon(this, this.weapon, origin, dir, world.actors, world.colliders, world.hooks, {
      spread: finalSpread,
      maxDist: 150,
      // Bot 打人只有玩家 40% 的伤害
      damageMul: BOT_DAMAGE_MUL,
    });
    // 曳光终点 = 最远命中距离，方向取**这一发真实弹丸方向**（含散布）。
    // 观察者（引擎 onShot）拿这两个值把曳光画到真实弹着点；传 `dir`（瞄准方向）
    // 的话所有 Bot 的曳光都走同一条中心线，看过去就像「AI 全是激光枪」。
    // 方向取「最远那颗弹丸」自己的方向，而不是第一颗 —— 霰弹枪 8 颗里最远的那颗
    // 未必是第一颗，混用会让曳光终点偏出真实弹道。
    let farthest = 0;
    const shotDir = { x: dir.x, y: dir.y, z: dir.z };
    for (const result of results) {
      if (result.type === 'none') continue;
      if (result.t > farthest) {
        farthest = result.t;
        shotDir.x = result.dir.x;
        shotDir.y = result.dir.y;
        shotDir.z = result.dir.z;
      }
    }
    world.hooks.onShot?.(this, this.weapon, origin, shotDir, farthest);

    this.mag -= 1;
    // 连发扩散以「实际成功击发」为累计依据 —— 走到这里说明弹匣扣减了，
    // 换弹 / 冷却 / 无弹药的中途 return 都到不了这一行。上限与玩家同款
    // （0.85 × max，给 base + move 的叠加留出到 max 的余量，最终仍被
    // `currentSpread` 夹在 `spread.max`）
    this.spreadAccum = Math.min(this.spreadAccum + spec.spread.perShot, spec.spread.max * 0.85);
    this.burstLeft -= 1;
    if (this.burstLeft <= 0) this.burstPause = rand(this.skill.pause[0], this.skill.pause[1]);
  }
}

/* ============================================================
   A*
   ============================================================ */

/**
 * 寻路缓冲区。
 *
 * 模块级复用是**有意的**：这张图 18×34 个格子，每次 `findPath` 都新开四个
 * typed array 的话，8 个 Bot 每 3 秒一次 = 每秒几十次分配，GC 抖动会直接表现
 * 成「偶发掉帧」。缺点是同一时刻不能并行跑两个 `findPath` —— 目前没有这个需求。
 */
let gScore = new Float32Array(0);
let cameFrom = new Int32Array(0);
let closed = new Uint8Array(0);
let openMark = new Uint8Array(0);
let bufferSize = 0;

function ensureBuffers(nav: NavGrid): void {
  const size = nav.nx * nav.nz;
  if (bufferSize === size) return;
  bufferSize = size;
  gScore = new Float32Array(size);
  cameFrom = new Int32Array(size);
  closed = new Uint8Array(size);
  openMark = new Uint8Array(size);
}

/** 二叉最小堆。`Array.sort` 每次插入排一遍是 O(n log n)，这里只要 O(log n)。 */
class MinHeap {
  private readonly nodes: number[] = [];
  private readonly priorities: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: number, priority: number): void {
    this.nodes.push(node);
    this.priorities.push(priority);
    let i = this.nodes.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.priorities[parent]! <= this.priorities[i]!) break;
      this.swap(parent, i);
      i = parent;
    }
  }

  pop(): number {
    const top = this.nodes[0]!;
    const lastNode = this.nodes.pop()!;
    const lastPriority = this.priorities.pop()!;
    if (this.nodes.length > 0) {
      this.nodes[0] = lastNode;
      this.priorities[0] = lastPriority;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.nodes.length && this.priorities[left]! < this.priorities[smallest]!) smallest = left;
        if (right < this.nodes.length && this.priorities[right]! < this.priorities[smallest]!) smallest = right;
        if (smallest === i) break;
        this.swap(smallest, i);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const node = this.nodes[a]!;
    this.nodes[a] = this.nodes[b]!;
    this.nodes[b] = node;
    const priority = this.priorities[a]!;
    this.priorities[a] = this.priorities[b]!;
    this.priorities[b] = priority;
  }
}

/** 最近的可走格。目标点在箱子里 / 墙里时用它兜底。 */
function nearestWalkable(nav: NavGrid, x: number, z: number): number {
  const direct = nav.toIndex(x, z);
  if (nav.isWalkable(direct)) return direct;

  let best = -1;
  let bestDistance = Infinity;
  for (let index = 0; index < nav.nx * nav.nz; index += 1) {
    if (!nav.isWalkable(index)) continue;
    const center = nav.center(index);
    const dx = center.x - x;
    const dz = center.z - z;
    const squared = dx * dx + dz * dz;
    if (squared < bestDistance) {
      bestDistance = squared;
      best = index;
    }
  }
  return best;
}

/**
 * A* 求路。返回**平滑后**的路径点（世界坐标）。
 *
 * 八向搜索，但对角必须两条直角边都可走 —— 否则 Bot 会从两个集装箱的对角缝里
 * 「切」过去，看起来像穿墙。找到路径后再做一次「能直线看到就跳过中间点」的
 * 平滑，把一串锯齿状的格子中心变成三五个自然的拐点。
 */
export function findPath(
  nav: NavGrid,
  startX: number,
  startZ: number,
  goalX: number,
  goalZ: number,
): { x: number; z: number }[] {
  ensureBuffers(nav);

  const start = nearestWalkable(nav, startX, startZ);
  const goal = nearestWalkable(nav, goalX, goalZ);
  if (start < 0 || goal < 0) return [];
  if (start === goal) {
    const center = nav.center(goal);
    return [{ x: center.x, z: center.z }];
  }

  closed.fill(0);
  openMark.fill(0);

  const goalX2 = goal % nav.nx;
  const goalZ2 = Math.floor(goal / nav.nx);

  // 八角距离：八向移动下 admissible 且比曼哈顿紧
  const heuristic = (index: number): number => {
    const ix = index % nav.nx;
    const iz = Math.floor(index / nav.nx);
    const dx = Math.abs(ix - goalX2);
    const dz = Math.abs(iz - goalZ2);
    return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
  };

  const open = new MinHeap();
  gScore[start] = 0;
  cameFrom[start] = -1;
  openMark[start] = 1;
  open.push(start, heuristic(start));

  // 这个布尔量是必须的：只靠「goal 有没有被 openMark」判断会误判成功 ——
  // goal 可能从来没进过队列，回溯 cameFrom 会得到一条垃圾路径
  let found = false;
  let iterations = 0;

  while (open.size > 0 && iterations < 4000) {
    iterations += 1;
    const current = open.pop();
    if (current === goal) {
      found = true;
      break;
    }
    if (closed[current]) continue;
    closed[current] = 1;

    const cx = current % nav.nx;
    const cz = Math.floor(current / nav.nx);

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        if (dx === 0 && dz === 0) continue;

        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nx >= nav.nx || nz < 0 || nz >= nav.nz) continue;

        const next = nz * nav.nx + nx;
        if (!nav.isWalkable(next) || closed[next]) continue;

        // 对角不切角
        if (dx !== 0 && dz !== 0) {
          if (!nav.isWalkable(cz * nav.nx + nx)) continue;
          if (!nav.isWalkable(nz * nav.nx + cx)) continue;
        }

        const step = dx !== 0 && dz !== 0 ? Math.SQRT2 : 1;
        const tentative = gScore[current]! + step;
        if (openMark[next] && tentative >= gScore[next]!) continue;

        gScore[next] = tentative;
        cameFrom[next] = current;
        openMark[next] = 1;
        open.push(next, tentative + heuristic(next));
      }
    }
  }

  if (!found) return [];

  // 回溯
  const raw: number[] = [];
  let node = goal;
  let guard = 0;
  while (node !== -1 && guard < 600) {
    guard += 1;
    raw.push(node);
    if (node === start) break;
    node = cameFrom[node]!;
  }
  raw.reverse();

  // 平滑：从当前点尽量往后跳
  const out: { x: number; z: number }[] = [];
  let i = 0;
  while (i < raw.length) {
    const from = nav.center(raw[i]!);
    let jump = i;
    for (let j = raw.length - 1; j > i + 1; j -= 1) {
      const candidate = nav.center(raw[j]!);
      if (nav.segClear(from.x, from.z, candidate.x, candidate.z)) {
        jump = j;
        break;
      }
    }
    const target = nav.center(raw[jump]!);
    out.push({ x: target.x, z: target.z });
    if (jump >= raw.length - 1) break;
    i = jump + 1;
  }

  return out;
}
