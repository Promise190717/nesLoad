import { Vector3 } from 'three';
import { gameAudio } from './audio';
import {
  type CombatHooks,
  currentSpread,
  fireWeapon,
  grenadeBlast,
  meleeSwing,
  nowSeconds,
} from './combat';
import type { Effects } from './effects';
import type { InputFrame } from './input';
import type { NavGrid } from './level';
import { nearestWalkablePoint } from './level';
import { PITCH_LIMIT, clamp, damp, dirFromAngles, easeInOutCubic, easeOutCubic, rand } from './math';
import type { Point3 } from './math';
import {
  type Collider,
  collideAt,
  createMotionState,
  isOutOfWorld,
  moveEntity,
  rayWorld,
  resetMotionState,
  surfaceUnder,
} from './physics';
import type { Actor, PrimaryId, Team, WeaponId } from './types';
import { HEAVY_REACH_BONUS, SWITCH_PROFILES, WEAPONS, weaponFeel } from './weapons';

/**
 * 玩家 —— 移动、视角、武器状态机、开火。
 *
 * 它同时是 `Actor`（能被子弹打到、能上计分板）和一台「第一人称控制器」。
 * 两者合一是有意的：玩家的命中盒和相机必须来自同一份 `pos / height`，
 * 一旦拆成两个对象，蹲下时就会出现「人蹲了但命中盒还站着」这种 bug。
 *
 * ## 相机与准星为什么不能分家
 *
 * 子弹方向用 `aimYaw / aimPitch`（= 视角 + 后坐），相机用 `viewYaw / viewPitch`
 * （再加屏幕震动）。震动只影响画面、不影响弹道 —— 否则手雷在附近爆炸时子弹
 * 会跟着乱飞，玩家会觉得「这枪不受控」。
 */

/* ============================================================
   常量
   ============================================================ */

const GRAVITY = 20;
const JUMP_SPEED = 6.6;
const SPEED_RUN = 5.5;
const SPEED_WALK = 2.8;
const SPEED_CROUCH = 2.0;
const STEP_UP = 0.45;

const STAND_HEIGHT = 1.8;
const CROUCH_HEIGHT = 1.25;
const RADIUS = 0.4;

/** 开镜时的 FOV，引擎拿它做插值目标 */
export const SCOPED_FOV = 22;

/**
 * 一次挥砍最多打几个目标。
 *
 * **刻意是 1**：判定窗口内每帧都扫，所以「刀扫过去」这件事靠的是**时机**而不是
 * 「一刀多杀」—— 起手时敌人在 2.2 米外、挥到一半走进来照样砍得到；反过来，
 * 起手时贴着、挥到一半跳开了就砍空。一刀砍一片会把刀变成近战版的霰弹枪，
 * 那不是 CF 的手感。
 */
const MELEE_MAX_TARGETS = 1;

/** 重生后的无敌时间（秒） */
export const SPAWN_PROTECT = 3;

/**
 * 死亡到重生要等多久**不在这里** —— 那是死亡体验的一部分（倒地 / 凝视 / 观战），
 * 唯一出处是 `death-cam.ts` 的 `DEATH_TIMELINE.respawnAt`。玩家只负责累加
 * `deathTime`，什么时候重生由引擎按时间轴决定。
 */

/** 初始手雷数 */
const START_GRENADES = 2;

/**
 * 开火**预输入**窗口（秒）。
 *
 * 只在「射击被闸住」的时候起作用（拉栓 1.4s、射击冷却 100ms）：这 120ms 内按下的
 * 那一枪会被记住，闸门一开立刻打出去，玩家不用「等栓走完再点一次」。
 *
 * ⚠️ 它**不改变任何闸门时长** —— `boltCycle`、`interval`、弹匣、散布一个数都没动，
 * 变的只是「这段时间里按的那一下算不算数」。所以 AWM 依然是「一枪一拉栓」，
 * 只是不会因为手快半拍就白点一下。
 */
const FIRE_BUFFER = 0.12;

/**
 * 复活后允许打开换枪界面 / 更换主武器的窗口（秒）。
 * 每次复活重新计时；打过一发子弹立即作废，两条限制取先到者。
 */
export const LOADOUT_WINDOW = 5;

/* ============================================================
   依赖
   ============================================================ */

export interface PlayerDeps {
  actors: readonly Actor[];
  colliders: readonly Collider[];
  /** 掉出船体时找最近可行走点用 */
  nav: NavGrid;
  hooks: CombatHooks;
  effects: Effects;
  /**
   * 换枪。`animated` 为 true 时渲染层要演「收起 + 掏出」两段动画；
   * false 表示立刻换（快速扔雷那种一闪而过的切枪，不该占掉半秒）。
   */
  onWeaponChange: (weapon: WeaponId, animated: boolean) => void;
  /** 扔出一颗手雷（投掷物由引擎管理） */
  onThrowGrenade: (fuse: number) => void;
  /**
   * 枪口的世界坐标（可选，引擎注入）。
   *
   * 引擎把**枪模上 muzzle 节点的屏幕位置**反投影回主相机得到这一点 ——
   * 枪模画在独立相机里（FOV 不同、不随俯仰转），按「视线前移 + 固定偏移」
   * 手算世界坐标会和画面里的枪口错位（火光落在枪口下方就是这个坑）。
   * 没注入时 `handleFire` 走几何近似兜底。
   */
  muzzlePoint?: (dist?: number) => Point3 | null;
}

/**
 * 近战挥砍状态 —— 给第一人称枪模摆姿势用（`viewmodel.ts` 只读）。
 *
 * 只有 `swing` 是「必须」的：它把前摇 / 挥砍 / 后摇压成一个**有符号标量**
 * （-1 起手 → +1 挥到尽头 → 0 收刀），渲染层不需要知道判定窗口在哪一段。
 * 于是「调判定手感」和「调刀摆多大」是两件互不影响的事。
 */
export interface MeleePose {
  /** 正在刺击 */
  active: boolean;
  /** 这一击是重击 */
  heavy: boolean;
  /** -1 蓄力 → +1 刺到尽头 → 0 收刀 */
  swing: number;
  /** 弹刀回弹量 0..1（刺在硬物上之后的余震），指数衰减 */
  rebound: number;
}

/* ============================================================
   玩家
   ============================================================ */

type GunId = Exclude<WeaponId, 'knife' | 'grenade'>;

/**
 * 玩家的弹药状态。
 *
 * **只有弹匣，没有备弹** —— 这一版的备弹是无限的（打空自动换弹）。
 * 备弹量是个很容易做错的设计：数值小了玩家舍不得开枪，大了又等于没有，
 * 而这张图的对局只有十分钟，干脆不给这个约束。
 */
interface Ammo {
  mag: number;
}

/**
 * 构造参数。默认值 = 单机模式下的那个玩家（`id = 'player'`、保卫者、本机）。
 *
 * 联机时这个类被复用成**三个角色**：
 *   ① 房主自己的玩家（`local = true`，默认）；
 *   ② 房主替加入者跑的那个角色（`local = false`）—— 输入来自网络，其余完全相同，
 *      所以「真人和人机遵循同一套伤害/衰减/复活规则」是白送的：同一条代码路径；
 *   ③ 加入者本机的玩家（`local = true`）—— 但**不调用 `update()`**，只做镜像，
 *      见 `advanceVisual()`。
 */
export interface PlayerOptions {
  id?: string;
  name?: string;
  team?: Team;
  /** 是不是**本机**玩家（决定 `isPlayer`：界面据此显示「你 / You」） */
  local?: boolean;
  primary?: PrimaryId;
}

export class Player implements Actor {
  readonly id: string;
  /**
   * 显示名。真人玩家用自己的名字（联机时房主分配），单机时是英文兜底
   * `Player` —— 界面上一律不显示它（走 `actorLabel()`，`isPlayer` 时显示「你」）。
   *
   * 不是 readonly：联机面板里改名字之后要能立刻生效（不用重建引擎）。
   */
  name: string;
  /**
   * 阵营。**不是 readonly**：加入者的阵营是房主分配的，`mirrorSelf()` 每帧按快照
   * 对齐 —— 本地构造函数里那个默认值只是「还没联机时」的占位。
   */
  team: Team;
  readonly isPlayer: boolean;
  /** 这个类只服务真人。人机是 `Bot`，`isHuman = false` */
  readonly isHuman = true;

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
  weapon: WeaponId = 'ak47';
  protectUntil = 0;
  deathTime = 0;
  lastHitBy: Actor | null = null;

  /** 主武器槽当前拿的是哪把 */
  primary: PrimaryId;

  /**
   * 联机副本专用：换枪资格由房主算，走快照下发。
   *
   * `null` = 本机权威（单人 / 房主），按三条件现场算；非 null = 加入者，
   * 直接采用房主给的那一位。不这么做的话，加入者会因为「本地没扣过弹匣」
   * 而永远显示「可以换枪」，点下去却被房主拒绝。
   */
  netCanLoadout: boolean | null = null;

  crouching = false;
  scoped = false;
  reloading = false;
  onGround = false;
  grenades = START_GRENADES;

  /** 累计击发次数。引擎拿它判断「这一帧有没有开枪」，用来抖枪模。 */
  shotsFired = 0;

  /** 本次生命已存活的秒数（死亡期间不累计；`respawn` 归零）。 */
  aliveTime = 0;

  /**
   * 本次生命是否已经**打出过一发真的枪弹**（弹匣数真的少了一发）。
   *
   * ⚠️ 只在 `handleFire` 扣弹匣的那一行置位 —— 空仓自动换弹、射击冷却、拉栓、
   * 近战挥空、扣着手雷不放都不算「消耗子弹」，不能误杀换枪资格。
   * 这是换枪资格三条件之一，规则全量在 `canChangeLoadout`。
   */
  ammoSpent = false;

  /**
   * 换枪 / 改背包资格（三条件必须同时满足，规则唯一出口）：
   *
   *   ① 存活；
   *   ② 距本次复活 ≤ `LOADOUT_WINDOW` 秒；
   *   ③ 本次生命尚未消耗过任何子弹（开过一枪就立刻失去，哪怕还在 5 秒内）。
   *
   * 引擎在 `openBuyMenu` / `selectPrimary` / 每帧菜单自检三处都调它 ——
   * 限制落在最终执行逻辑上，UI 只是跟随显示。
   */
  get canChangeLoadout(): boolean {
    // 加入者：这一位由房主算好、走快照下发（见 `netCanLoadout`）
    if (this.netCanLoadout !== null) return this.alive && this.netCanLoadout;
    return this.alive && !this.ammoSpent && this.aliveTime <= LOADOUT_WINDOW;
  }

  /**
   * 近战刺击状态（只读）。
   *
   * 一个**长期复用**的对象，每帧原地改字段 —— 不要每次 new，那是每帧一次分配。
   * 引擎每帧把它交给 `viewmodel.ts` 摆刀的姿势，除此之外没人读它。
   */
  readonly meleeView: MeleePose = {
    active: false,
    heavy: false,
    swing: 0,
    rebound: 0,
  };

  /* ---- 切枪 ---- */
  /**
   * 收起 + 掏出还剩多久（秒）。**> 0 时不能开火、不能换弹** ——
   * 「切枪本身不可被打断」就是这一条。
   */
  private switchTimer = 0;
  /** 「掏出」那一声还没播（在收起演完、开始掏出的那一帧播） */
  private switchSoundPending = false;
  /** 上一把武器。Q 键切回它 */
  private previousWeapon: WeaponId = 'usp';

  /* ---- 近战 ---- */
  private meleeActive = false;
  private meleeTimer = 0;
  private meleeDuration = 0;
  private meleeHeavy = false;
  private meleeWindow: readonly [number, number] = [0.2, 0.5];
  /** 这一刀已经打过的目标（同一次挥砍绝不重复结算） */
  private readonly meleeHits = new Set<Actor>();
  /** 这一刀已经磕过墙了（一次挥砍只磕一下，否则窗口里 9 帧会放成烟花） */
  private meleeBumped = false;

  /* ---- 后坐与散布 ---- */
  private recoilPitch = 0;
  private recoilYaw = 0;
  private spreadAccum = 0;
  private fireCooldown = 0;
  /**
   * 开火预输入剩余时长（秒）。见 `FIRE_BUFFER`。
   *
   * 只记「刚按下」那一下，不记长按 —— 半自动枪按住不放不能连发。
   */
  private fireBuffer = 0;

  /* ---- 镜头冲击（纯表现） ---- */
  /**
   * 开火瞬间的「顶一下」，**只加在相机上**。
   *
   * `aimYaw / aimPitch` 不含这两个值，所以镜头冲击再怎么调都不会改弹道 ——
   * 这正是需求里「镜头反馈不能影响瞄准」的落点。衰减极快（俯仰 ~40ms、
   * 侧倾 ~60ms），是「一下」而不是「一直被推着走」。
   */
  private punchPitch = 0;
  private punchRoll = 0;

  /* ---- 拉栓（栓动枪专用，见 `WeaponSpec.boltCycle`） ---- */
  /** 拉栓还剩多久（秒）。> 0 时不能开火 —— 和 `fireCooldown` 并列的第二个射击闸 */
  private boltTimer = 0;
  /** 这一轮拉栓的总时长，算进度用 */
  private boltTotal = 0;
  /** 音效阶段：0 未开始 → 1 已拉开 → 2 已推回 */
  private boltSoundStage = 0;

  /* ---- 换弹 ---- */
  private reloadTimer = 0;
  private reloadDuration = 0;
  private reloadSoundPlayed = false;

  /* ---- 手雷 ---- */
  private cooking = false;
  private cookTimer = 0;

  /* ---- 相机 ---- */
  private bobPhase = 0;
  private stepDistance = 0;
  private shake = 0;
  /**
   * 上台阶的**视觉补偿**。
   *
   * 物理上抬升是瞬时的（`p.y += 0.45`），视角如果跟着瞬移，踩钢梯会一抽一抽。
   * 这里把这一帧的高度差记成负偏移，再用 `damp` 花 ~0.1 秒抹平 ——
   * 物理没变，只是画面滑上去。只补偿「向上的小台阶」，跳跃不补（否则发飘）。
   */
  private stepLift = 0;

  /** 位置解算的跨帧状态（安全点 / 卡死计时），必须跨帧复用 */
  private readonly motion = createMotionState();

  private readonly ammo: Record<GunId, Ammo> = {
    ak47: { mag: WEAPONS.ak47.magazine },
    m4a1: { mag: WEAPONS.m4a1.magazine },
    awm: { mag: WEAPONS.awm.magazine },
    shotgun: { mag: WEAPONS.shotgun.magazine },
    usp: { mag: WEAPONS.usp.magazine },
  };

  constructor(options: PlayerOptions = {}) {
    this.id = options.id ?? 'player';
    this.name = options.name ?? 'Player';
    this.team = options.team ?? 0;
    this.isPlayer = options.local ?? true;
    this.primary = options.primary ?? 'ak47';
    this.weapon = this.primary;
    // 面向敌方半场：保卫者（出生在 z 负）朝 +z 看，潜伏者朝 -z 看。
    // 和 `Bot` 的初值同一条规则，引擎重生时还会按最近的敌人再纠一次
    this.yaw = this.team === 0 ? Math.PI : 0;
    this.ammo[this.primary].mag = WEAPONS[this.primary].magazine;
  }

  /**
   * 这个角色是不是「网络对端」（房主替别人跑的那份）。
   *
   * 它决定三件事：不出第一人称枪模、不播本机音效、不用引擎注入的枪口坐标。
   * 判定只看 `isPlayer` —— 加入者的角色在房主机器上就是 `isPlayer = false`。
   */
  private get remote(): boolean {
    return !this.isPlayer;
  }

  /* ============================================================
     对外状态
     ============================================================ */

  /** 眼睛相对脚底的高度。相机位置和射线起点都用它。 */
  get eyeHeight(): number {
    return this.height - 0.14;
  }

  get eyePos(): { x: number; y: number; z: number } {
    return { x: this.pos.x, y: this.pos.y + this.eyeHeight, z: this.pos.z };
  }

  /** 弹道用的方向（含后坐，不含震动） */
  get aimYaw(): number {
    return this.yaw + this.recoilYaw;
  }

  get aimPitch(): number {
    return clamp(this.pitch + this.recoilPitch, -PITCH_LIMIT, PITCH_LIMIT);
  }

  /** 相机用的角度（再叠屏幕震动） */
  get viewYaw(): number {
    const jitter = this.shake > 0.001 ? (Math.random() - 0.5) * this.shake * 0.045 : 0;
    return this.yaw + this.recoilYaw + jitter;
  }

  get viewPitch(): number {
    const jitter = this.shake > 0.001 ? (Math.random() - 0.5) * this.shake * 0.045 : 0;
    // 刺击不改镜头俯仰 —— 攻击是刀的动作，不是相机的（需求：不许用转相机来
    // 表现攻击）。命中/弹刀的顿挫走 `addShake`
    return clamp(this.pitch + this.recoilPitch + this.punchPitch + jitter, -PITCH_LIMIT, PITCH_LIMIT);
  }

  /**
   * 相机侧倾（弧度）。
   *
   * 只有**开火冲击**会写它：绕视线滚转**不改变前向量**，所以它是最便宜、
   * 也是唯一「零瞄准代价」的力度表达 —— 大狙开一枪画面被掀一下，但准星
   * 和弹道的关系一点没变。
   */
  get viewRoll(): number {
    return this.punchRoll;
  }

  /** 走路带来的相机上下浮动。只影响画面，不影响弹道。 */
  get bobOffset(): { x: number; y: number } {
    const speed = Math.hypot(this.vel.x, this.vel.z);
    // 台阶补偿和走路浮动是两个来源，但都只改画面，合在一个返回值里
    let x = 0;
    let y = this.stepLift;
    if (this.onGround && speed > 0.5) {
      const amplitude = Math.min(speed / SPEED_RUN, 1) * 0.018;
      x = Math.sin(this.bobPhase) * amplitude;
      y += Math.abs(Math.cos(this.bobPhase)) * amplitude * 0.8;
    }
    return { x, y };
  }

  /** 走路相位，给第一人称枪模用（保证枪和脚同步晃） */
  get walkPhase(): number {
    return this.bobPhase;
  }

  /** 换弹进度 0..1，给枪模的下压动画用 */
  get reloadProgress(): number {
    if (!this.reloading || this.reloadDuration <= 0) return 0;
    return Math.min(1, this.reloadTimer / this.reloadDuration);
  }

  /** 拉栓进度 0..1，给枪模的拉栓动画用。没在拉栓时恒 0 */
  get boltView(): number {
    if (this.boltTimer <= 0 || this.boltTotal <= 0) return 0;
    return Math.min(1, 1 - this.boltTimer / this.boltTotal);
  }

  get currentAmmo(): Ammo {
    if (this.weapon === 'knife') return { mag: 0 };
    if (this.weapon === 'grenade') return { mag: this.grenades };
    return this.ammo[this.weapon];
  }

  /**
   * 联机副本专用：把弹匣数镜像成房主给的值。
   *
   * 加入者不在本地扣弹，HUD 上的「30 / ∞」全部来自快照；不写这一条的话，
   * 加入者会永远看到开局那满弹匣。
   */
  setNetAmmo(weapon: WeaponId, mag: number): void {
    if (weapon === 'knife' || weapon === 'grenade') return;
    this.ammo[weapon].mag = Math.max(0, Math.round(mag));
  }

  /** 屏幕震动（爆炸、被打） */
  addShake(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  /**
   * 开火时的镜头冲击（度）。俯仰 + 侧倾。
   *
   * 夹在 ±1.2° / ±2° 以内：这是「有力但不晕」的上限，也保证它永远不会把视角
   * 顶出玩家能接受的范围。参数由武器表 `WeaponSpec.feel` 给。
   */
  addPunch(pitchDeg: number, rollDeg: number): void {
    const pitch = pitchDeg * (Math.PI / 180);
    const roll = rollDeg * (Math.PI / 180);
    this.punchPitch = clamp(this.punchPitch + pitch, -0.021, 0.021);
    this.punchRoll = clamp(this.punchRoll + roll, -0.035, 0.035);
  }

  /* ============================================================
     生命周期
     ============================================================ */

  respawn(position: Vector3): void {
    this.pos.copy(position);
    this.vel.set(0, 0, 0);
    // 重生是「主动传送」：安全点必须跟着重置，否则卡死回退会把人拉回旧位置
    resetMotionState(this.motion, position);
    this.stepLift = 0;
    this.health = 100;
    this.armor = 0;
    this.alive = true;
    this.deathTime = 0;
    this.protectUntil = nowSeconds() + SPAWN_PROTECT;
    this.lastHitBy = null;

    // 换枪资格两态一并重置：每次生命重新享受 5 秒窗口、重新记耗弹
    this.aliveTime = 0;
    this.ammoSpent = false;

    this.crouching = false;
    this.scoped = false;
    this.reloading = false;
    this.reloadTimer = 0;
    this.cooking = false;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.spreadAccum = 0;
    this.fireCooldown = 0;
    this.fireBuffer = 0;
    this.punchPitch = 0;
    this.punchRoll = 0;
    this.boltTimer = 0;
    this.boltTotal = 0;
    this.boltSoundStage = 0;
    this.shake = 0;
    this.height = STAND_HEIGHT;

    // 重生是「重新拿枪」：切枪锁定和挥砍动作一起清掉，
    // 上一把也回到副武器（Q 从主武器切过去就是手枪，符合 CF 的默认预期）
    this.switchTimer = 0;
    this.switchSoundPending = false;
    this.previousWeapon = 'usp';
    this.cancelMelee();

    // 重生补满弹匣和手雷 —— 否则死几次之后就只能拿刀冲了
    for (const id of Object.keys(this.ammo) as GunId[]) {
      this.ammo[id].mag = WEAPONS[id].magazine;
    }
    this.grenades = START_GRENADES;

    this.weapon = this.primary;
  }

  /* ============================================================
     武器
     ============================================================ */

  /** 换主武器（换枪菜单调用）。会把那把枪的弹匣补满。 */
  setPrimary(id: PrimaryId, deps: PlayerDeps): void {
    this.primary = id;
    this.ammo[id].mag = WEAPONS[id].magazine;
    this.switchTo(id, deps);
  }

  /**
   * 换武器。**数字键 / 滚轮 / Q / 换枪菜单全部走这一条路**，所以动画管线只有一套。
   *
   * @param instant 立刻换，不演动画。只给「快速扔雷」这种一闪而过的切换用 ——
   *                为了扔一颗雷演半秒切枪动画，体验是灾难。
   */
  switchTo(weapon: WeaponId, deps: PlayerDeps, instant = false): void {
    if (!this.alive || this.weapon === weapon) return;

    this.previousWeapon = this.weapon;
    this.weapon = weapon;

    // 换弹**直接作废**：弹匣里还是原来那么多子弹，切枪不会白送一发。
    // 这是需求明确要的 —— 切枪打断换弹，但换弹进度不保留
    this.reloading = false;
    this.reloadTimer = 0;
    this.reloadSoundPlayed = false;
    this.cooking = false;
    this.scoped = false;
    this.spreadAccum = 0;
    this.fireCooldown = 0;
    // 预输入跟着作废：换枪之后那一枪不该再补出来（否则会「切完枪自己响一发」）
    this.fireBuffer = 0;
    // 拉栓作废：切走的枪拉到一半，回来也不用补 —— 和换弹同一条规矩（切枪打断，不保留进度）
    this.boltTimer = 0;
    this.boltSoundStage = 0;

    // 手里那把刀已经收回去了，挥到一半的动作跟着作废
    this.cancelMelee();

    const profile = SWITCH_PROFILES[weapon];
    // 切枪本身不可被打断：这段时间里开火和换弹都被挡住
    this.switchTimer = instant ? 0 : profile.holster + profile.draw;
    this.switchSoundPending = !instant;

    deps.onWeaponChange(weapon, !instant);
    if (!instant && !this.remote) gameAudio.weaponSwitch('out', profile.sound);
  }

  /**
   * Q —— 切回**上一把**。
   *
   * 实现上就是「把 `previousWeapon` 当目标再切一次」：`switchTo` 会把当前这把
   * 记成新的「上一把」，所以来回按 Q 就在两把之间反复横跳，正是 CF 的行为。
   * 没有单独一套逻辑，也就不会出现「Q 和数字键走的不是同一套动画」。
   */
  private quickSwitch(deps: PlayerDeps): void {
    this.switchTo(this.previousWeapon, deps);
  }

  cycleSlot(direction: number, deps: PlayerDeps): void {
    const slots: WeaponId[] = [this.primary, 'usp', 'knife', 'grenade'];
    const current = slots.indexOf(this.weapon);
    const next = (current + direction + slots.length) % slots.length;
    this.switchTo(slots[next] as WeaponId, deps);
  }

  private startReload(): void {
    const spec = WEAPONS[this.weapon];
    if (spec.kind !== 'gun' || this.reloading) return;
    // 切枪期间按 R 不生效 —— 「切枪本身不可被打断」
    if (this.switchTimer > 0) return;

    // `spec.kind === 'gun'` 已经保证是枪，但 TS 不会因为「查了武器的 kind」
    // 就收窄 `this.weapon`，这里必须显式断言
    const ammo = this.ammo[this.weapon as GunId];
    // 备弹无限，所以只看「弹匣满没满」
    if (ammo.mag >= spec.magazine) return;

    this.reloading = true;
    this.reloadTimer = 0;
    this.reloadDuration = spec.reload;
    this.reloadSoundPlayed = false;
    if (!this.remote) gameAudio.reload('out');
  }

  /* ============================================================
     每帧
     ============================================================ */

  /**
   * 联机副本专用：只推进「纯表现」的相位，**不做任何玩法结算**。
   *
   * 加入者的位置、朝向、存活、血量全部由房主的快照决定（见 `engine.updateGuest`），
   * 所以这里不跑 `update()`。但画面还需要几样东西继续动：走路浮动、台阶补偿、
   * 受击抖动、开火冲击、换弹进度 —— 它们全是相机/枪模的输入，不影响任何人。
   *
   * 换弹进度是**近似**的：房主只发「在换弹」这一位，时长按武器表本地推。
   * 真按快照逐帧同步反而更差（20Hz 的进度条会一格一格跳）。
   */
  advanceVisual(dt: number): void {
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && speed > 0.6) this.bobPhase += dt * speed * 1.35;
    else this.bobPhase += dt * 0.6;
    this.stepLift = damp(this.stepLift, 0, 22, dt);
    this.shake = damp(this.shake, 0, 7, dt);
    this.punchPitch = damp(this.punchPitch, 0, 26, dt);
    this.punchRoll = damp(this.punchRoll, 0, 16, dt);
    this.recoilPitch = damp(this.recoilPitch, 0, 7.5, dt);
    this.recoilYaw = damp(this.recoilYaw, 0, 7.5, dt);

    if (this.reloading) {
      const spec = WEAPONS[this.weapon];
      if (this.reloadDuration <= 0) this.reloadDuration = spec.reload;
      this.reloadTimer = Math.min(this.reloadDuration, this.reloadTimer + dt);
    } else {
      this.reloadTimer = 0;
      this.reloadDuration = 0;
    }
  }

  /** 联机副本专用：只吃视角增量（本地即时瞄准），不碰其它任何状态。 */
  look(frame: InputFrame): void {
    this.applyLook(frame);
  }

  update(dt: number, frame: InputFrame, deps: PlayerDeps): void {
    if (!this.alive) {
      // 死了就只剩「倒计时」这一件事。相机不归这里管 —— 倒地、观战、重生
      // 全部由 `death-cam.ts` 接管，否则「人躺下了但视角还站着」这种矛盾
      // 会同时存在于两个文件里，改哪边都不对。
      this.deathTime += dt;
      this.shake = damp(this.shake, 0, 7, dt);
      return;
    }

    this.applyLook(frame);
    // 复活窗口计时：只在存活时累计，死亡期间冻结（respawn 时归零）
    this.aliveTime += dt;
    this.applyCrouch(dt, frame, deps.colliders);
    this.applyMovement(dt, frame, deps);
    this.applyRecoil(dt);
    this.advanceSwitch(dt);
    this.handleReload(dt);
    this.handleActions(frame, deps);
    this.updateScope(frame);
    // 挥砍状态机独立推进：即使这一刻手里已经不是刀（刚被切枪作废），
    // 也要让它把 `rebound` / 镜头偏移衰减回零
    this.updateMelee(dt, deps);
    this.handleFire(dt, frame, deps);
  }

  /**
   * 推进切枪锁定的倒计时，并在「收起演完、开始掏出」那一帧补上第二声。
   *
   * 为什么音效要分两次播：收起和掏出之间隔着一次模型替换，听感上必须是两件事。
   * 第二声放在掏出开始，是因为它收尾有一记「咔」—— 0.12 秒后正好赶上
   * `easeOutCubic` 把武器送到八成的位置，听起来就是「落位」。
   */
  private advanceSwitch(dt: number): void {
    if (this.switchTimer <= 0) return;
    this.switchTimer = Math.max(0, this.switchTimer - dt);

    if (!this.switchSoundPending) return;
    const profile = SWITCH_PROFILES[this.weapon];
    // 剩余时间掉到「只够掏出这一段」时，说明收起演完了
    if (this.switchTimer <= profile.draw) {
      this.switchSoundPending = false;
      if (!this.remote) gameAudio.weaponSwitch('in', profile.sound);
    }
  }

  /** 视角。灵敏度已经在 `InputController` 里换算成弧度了。 */
  private applyLook(frame: InputFrame): void {
    if (frame.lookYaw === 0 && frame.lookPitch === 0) return;
    this.yaw += frame.lookYaw;
    this.pitch = clamp(this.pitch + frame.lookPitch, -PITCH_LIMIT, PITCH_LIMIT);
  }

  private applyCrouch(dt: number, frame: InputFrame, colliders: readonly Collider[]): void {
    if (!frame.crouch && this.crouching) {
      // 站起来之前先看头顶有没有东西 —— 否则会卡在集装箱缝里
      const blocked = collideAt(this.pos.x, this.pos.y, this.pos.z, this.radius, STAND_HEIGHT, colliders);
      if (!blocked) this.crouching = false;
    } else if (frame.crouch) {
      this.crouching = true;
    }

    const targetHeight = this.crouching ? CROUCH_HEIGHT : STAND_HEIGHT;
    this.height = damp(this.height, targetHeight, 16, dt);
  }

  private applyMovement(dt: number, frame: InputFrame, deps: PlayerDeps): void {
    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    let wishX = forwardX * frame.forward + rightX * frame.right;
    let wishZ = forwardZ * frame.forward + rightZ * frame.right;
    const wishLength = Math.hypot(wishX, wishZ);
    if (wishLength > 0.001) {
      wishX /= wishLength;
      wishZ /= wishLength;
    }

    let speed = SPEED_RUN;
    if (this.crouching) speed = SPEED_CROUCH;
    else if (frame.walk) speed = SPEED_WALK;
    if (this.scoped) speed *= 0.45;
    if (this.reloading) speed *= 0.92;

    // 空中加速只有地面的四分之一：跳跃后不能靠甩鼠标改变方向
    const accel = this.onGround ? 13 : 3.2;
    this.vel.x = damp(this.vel.x, wishX * speed, accel, dt);
    this.vel.z = damp(this.vel.z, wishZ * speed, accel, dt);

    this.vel.y -= GRAVITY * dt;
    if (this.vel.y < -45) this.vel.y = -45;

    const wasGrounded = this.onGround;
    const fallSpeed = this.vel.y;
    const prevY = this.pos.y;
    const mover = {
      pos: this.pos,
      vel: this.vel,
      radius: this.radius,
      height: this.height,
      onGround: this.onGround,
      motion: this.motion,
    };
    moveEntity(mover, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt, STEP_UP, deps.colliders, dt);
    this.onGround = mover.onGround;

    // 掉出船体 / 坐标非法：回最近可行走点。**不回出生点** —— 死亡已经够打断
    // 节奏了，再让人从船头跑一趟就是「跑马拉松」
    this.recoverFromVoid(deps.nav);

    // 上台阶的视觉补偿（物理瞬时、画面 0.1 秒抹平）
    const climbed = this.pos.y - prevY;
    if (this.onGround && climbed > 0.02 && climbed <= STEP_UP + 0.06) {
      this.stepLift = Math.max(-STEP_UP, this.stepLift - climbed);
    }
    this.stepLift = damp(this.stepLift, 0, 22, dt);

    if (!wasGrounded && this.onGround && fallSpeed < -6) {
      if (!this.remote) gameAudio.land();
      this.addShake(0.14);
    }

    // 脚步与相机浮动
    const horizontalSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && horizontalSpeed > 0.6) {
      this.stepDistance += horizontalSpeed * dt;
      const stride = this.crouching ? 1.5 : frame.walk ? 1.9 : 2.1;
      if (this.stepDistance > stride) {
        this.stepDistance = 0;
        if (!this.remote) {
          // 响度跟着步态走：跑步全响、蹲下压到一半、静步只剩一点鞋底蹭地声。
          // 材质按脚下碰撞盒判 —— 站上木箱是空腔「咚」，甲板是钢板声
          const loud = this.crouching ? 0.45 : frame.walk ? 0.3 : 1;
          gameAudio.step(surfaceUnder(this.pos.x, this.pos.y, this.pos.z, deps.colliders), {
            own: true,
            gain: loud,
          });
        }
      }
      this.bobPhase += dt * horizontalSpeed * 1.35;
    } else {
      this.bobPhase += dt * 0.6;
    }
  }

  /**
   * 掉出船体 / 坐标被写成 NaN 时把人捞回最近的可行走格点。
   *
   * 之前完全没有这道兜底：一旦被挤出舷侧，人就会一直往下掉，画面变成
   * 一片海，只能等死或者刷新。捞回来也不回出生点，落在最近能站的地方。
   */
  private recoverFromVoid(nav: NavGrid): void {
    if (!isOutOfWorld(this.pos)) return;
    const point = nearestWalkablePoint(
      nav,
      Number.isFinite(this.pos.x) ? this.pos.x : 0,
      Number.isFinite(this.pos.z) ? this.pos.z : 0,
    );
    if (point) this.pos.set(point.x, 0.05, point.z);
    else this.pos.set(0, 0.05, 0);
    this.vel.set(0, 0, 0);
    this.stepLift = 0;
    this.onGround = false;
    resetMotionState(this.motion, this.pos);
  }

  private applyRecoil(dt: number): void {
    this.recoilPitch = damp(this.recoilPitch, 0, 7.5, dt);
    this.recoilYaw = damp(this.recoilYaw, 0, 7.5, dt);
    // 连发累积散布的回退速度：4.5 意味着连发可以一直保持惩罚，
    // 停火约 0.5 秒才散掉一半 —— 点射流和压制流的分界线就靠这个数撑着
    this.spreadAccum = damp(this.spreadAccum, 0, 4.5, dt);
    this.shake = damp(this.shake, 0, 7, dt);
    // 镜头冲击比后坐衰减快得多（16 / 26 vs 7.5）：后坐是「持续顶」，
    // 冲击是「一下」。两者混在一起的话，连发会变成画面一直被推着走
    this.punchPitch = damp(this.punchPitch, 0, 26, dt);
    this.punchRoll = damp(this.punchRoll, 0, 16, dt);
  }

  private handleReload(dt: number): void {
    if (!this.reloading) return;

    const spec = WEAPONS[this.weapon];
    this.reloadTimer += dt;

    // 中段（拉枪栓那一下）再响一声，比整段只有开头响一次更像换弹
    if (!this.reloadSoundPlayed && this.reloadTimer > this.reloadDuration * 0.55) {
      this.reloadSoundPlayed = true;
      if (!this.remote) gameAudio.reload('in');
    }

    if (this.reloadTimer < this.reloadDuration) return;

    const ammo = this.ammo[this.weapon as GunId];

    if (spec.perShell) {
      // 霰弹逐发装填：每发装完再看要不要继续（备弹无限，装满为止）
      ammo.mag += 1;
      if (ammo.mag < spec.magazine) {
        this.reloadTimer = 0;
        this.reloadSoundPlayed = false;
        if (!this.remote) gameAudio.reload('in');
      } else {
        this.reloading = false;
      }
    } else {
      ammo.mag = spec.magazine;
      this.reloading = false;
    }
  }

  private handleActions(frame: InputFrame, deps: PlayerDeps): void {
    const actions = frame.actions;

    if (actions.has('jump') && this.onGround) {
      this.vel.y = JUMP_SPEED;
      this.onGround = false;
    }
    if (actions.has('reload')) this.startReload();
    if (actions.has('slotPrimary')) this.switchTo(this.primary, deps);
    if (actions.has('slotSecondary')) this.switchTo('usp', deps);
    if (actions.has('slotMelee')) this.switchTo('knife', deps);
    if (actions.has('slotThrowable')) this.switchTo('grenade', deps);
    if (actions.has('cycleNext')) this.cycleSlot(1, deps);
    if (actions.has('cyclePrev')) this.cycleSlot(-1, deps);
    if (actions.has('quickSwitch')) this.quickSwitch(deps);
    if (actions.has('quickGrenade')) this.quickGrenade(deps);
  }

  /** 快速扔雷：切到雷 → 立刻抛一颗 → 切回原武器。 */
  private quickGrenade(deps: PlayerDeps): void {
    if (this.grenades <= 0) return;
    const previous: WeaponId = this.weapon === 'grenade' ? this.primary : this.weapon;
    // 借一下手雷槽，不该污染 Q 的「上一把」记忆
    const memory = this.previousWeapon;
    this.switchTo('grenade', deps, true);
    this.throwGrenade(1.4, deps);
    this.switchTo(this.grenades > 0 ? previous : this.primary, deps, true);
    this.previousWeapon = memory;
  }

  private throwGrenade(fuse: number, deps: PlayerDeps): void {
    if (this.grenades <= 0) return;
    this.grenades -= 1;
    deps.onThrowGrenade(Math.max(0.02, fuse));
    if (this.grenades <= 0) this.switchTo(this.primary, deps, true);
  }

  /* ---------- 开镜 ---------- */

  private updateScope(frame: InputFrame): void {
    const spec = WEAPONS[this.weapon];
    // 切枪期间不开镜：否则「切到 AWM 时正按着右键」会让枪模在掏出动画里被隐藏
    // 拉栓周期内也不回镜 —— 打一枪退一次镜，栓拉完了右键还按着才重新开镜
    const wanted =
      spec.scoped &&
      frame.aim &&
      !this.reloading &&
      !this.cooking &&
      this.switchTimer <= 0 &&
      this.fireCooldown <= 0 &&
      this.boltTimer <= 0;
    if (wanted !== this.scoped) this.scoped = wanted;
  }

  /**
   * 推进拉栓倒计时，并在时间轴的两个关键点播机械音。
   *
   * 时间轴必须和 `viewmodel.ts` 的拉栓动画一致：0.12 提栓开始、0.74 推回到位。
   * 放在 `handleFire` 最前面 —— 早于所有 return，保证切枪 / 换弹期间照样走表，
   * 不会出现「拉到一半卡住不走了」。
   */
  private advanceBolt(dt: number): void {
    if (this.boltTimer <= 0 || this.boltTotal <= 0) return;
    const before = 1 - this.boltTimer / this.boltTotal;
    this.boltTimer = Math.max(0, this.boltTimer - dt);
    const after = 1 - this.boltTimer / this.boltTotal;

    if (this.boltSoundStage < 1 && before < 0.12 && after >= 0.12) {
      this.boltSoundStage = 1;
      if (!this.remote) gameAudio.boltAction('open');
    }
    if (this.boltSoundStage < 2 && before < 0.74 && after >= 0.74) {
      this.boltSoundStage = 2;
      if (!this.remote) gameAudio.boltAction('close');
    }
  }

  /* ---------- 开火 ---------- */

  private handleFire(dt: number, frame: InputFrame, deps: PlayerDeps): void {
    this.fireCooldown -= dt;
    this.advanceBolt(dt);

    // 切枪期间什么都打不出去 —— 枪还没落位。这是「切枪不可被打断」的另一半：
    // 收起 / 掏出那 0.4~0.65 秒里，开火、扔雷、出刀全被挡在外面
    if (this.switchTimer > 0) return;

    const spec = WEAPONS[this.weapon];

    if (spec.kind === 'melee') {
      this.handleMelee(frame);
      return;
    }
    if (spec.kind === 'throwable') {
      this.handleGrenadeCook(dt, frame, deps);
      return;
    }

    if (this.reloading) {
      // 霰弹逐发装填允许被开火打断（弹匣里还有子弹时）
      const canInterrupt = spec.perShell && frame.fire && this.ammo[this.weapon as GunId].mag > 0;
      if (canInterrupt) this.reloading = false;
      else return;
    }

    const wantsFire = spec.auto ? frame.fire : frame.firePressed;

    // 预输入（见 `FIRE_BUFFER`）：只记「刚按下」那一下，长按不重复触发。
    // 自动武器不参与 —— 它们靠 `frame.fire` 持续触发，记了反而会多打一发
    if (frame.firePressed) this.fireBuffer = FIRE_BUFFER;
    else this.fireBuffer = Math.max(0, this.fireBuffer - dt);

    if (!wantsFire && !(this.fireBuffer > 0 && !spec.auto)) return;
    // 闸门（射击冷却 / 拉栓）走完之前打不出去，但**这一下会被记着** ——
    // 120ms 内闸门打开就自动击发。闸门时长本身一个数都没动
    if (this.fireCooldown > 0 || this.boltTimer > 0) return;

    const ammo = this.ammo[this.weapon as GunId];
    if (ammo.mag <= 0) {
      // 空仓自动补一次装填，比让玩家自己去按 R 顺手。备弹无限，永远补得上，
      // 所以这里不会出现「空枪打不出声」那种情况
      this.startReload();
      this.fireCooldown = 0.2;
      this.fireBuffer = 0;
      return;
    }

    this.fireCooldown = spec.interval;
    this.fireBuffer = 0;
    ammo.mag -= 1;
    this.shotsFired += 1;
    // 真正扣掉一发弹匣 = 本次生命耗弹，换枪资格立即作废（canChangeLoadout 读它）
    this.ammoSpent = true;

    // 栓动枪击发后的三件事：退镜（挂着镜拉栓既挡视野也没意义）、
    // 进入拉栓周期（走完之前 `boltTimer` 闸住开火）、重置音效阶段。
    // 回镜由 updateScope 管 —— 拉栓走完且右键仍按着才重新开镜
    if (spec.scoped) this.scoped = false;
    if (spec.boltCycle) {
      this.boltTimer = spec.boltCycle;
      this.boltTotal = spec.boltCycle;
      this.boltSoundStage = 0;
    }

    const origin = this.eyePos;
    const aim = dirFromAngles(this.aimYaw, this.aimPitch);
    const spread = this.computeSpread(spec.id);

    const results = fireWeapon(this, this.weapon, origin, aim, deps.actors, deps.colliders, deps.hooks, {
      spread,
      maxDist: 160,
    });

    // 这一发**真实打出去的方向**（已含散布）。曳光、枪口焰朝向、给观察者的弹道
    // 全部用它 —— 🔴 不能用上面的 `aim`：那是未加散布的相机中心射线，拿它画曳光
    // 等于把刚算出来的散布又盖回中心线，画面上每一发都是同一条线，看起来就是
    // 「子弹全打在一个点」，而弹孔其实是散的（这条坑踩过）。
    const shotDir = results[0]?.dir ?? aim;

    // 后坐
    const kick = spec.recoil.up * (this.crouching ? 0.78 : 1) * (this.scoped ? 0.55 : 1);
    this.recoilPitch += kick * (Math.PI / 180);
    this.recoilYaw += rand(-1, 1) * spec.recoil.side * (Math.PI / 180);
    this.spreadAccum = Math.min(this.spreadAccum + spec.spread.perShot, spec.spread.max * 0.85);

    /* ---- 表现层：镜头冲击 + 枪口焰尺寸 + 枪声，全部在**这一帧同一处**触发 ----
     * 上面是「玩法」后坐（会顶准星、会影响下一发），这里只加「看起来有多狠」。
     * 两者分开是刻意的：AWM 的冲击可以给到 1°，但它的后坐角度是表里的 3.4° ——
     * 调手感时不会互相牵连。 */
    const feel = weaponFeel(this.weapon);
    const punchScale = this.crouching ? 0.85 : 1;
    this.addPunch(feel.punchPitch * punchScale, feel.punchRoll * punchScale);
    // 随机震屏只给最重的两把、而且很小（0.06~0.08）—— 这是「有后坐」而不是「镜头在抖」
    if (feel.shake > 0) this.addShake(feel.shake);

    // 枪口位置：引擎把枪模 muzzle 节点的屏幕位置反投影回主相机（0.6 米处），
    // 保证火光 / 曳光起点贴在画面里枪口喷出的地方。几何近似只是引擎没注入时的兜底
    const muzzle =
      deps.muzzlePoint?.(0.6) ?? {
        x: origin.x + aim.x * 0.6 + Math.cos(this.yaw) * 0.16,
        y: origin.y + aim.y * 0.6 - 0.12,
        z: origin.z + aim.z * 0.6 - Math.sin(this.yaw) * 0.16,
      };

    deps.effects.spawnMuzzleFlash(muzzle, shotDir, { scale: feel.flashScale, life: feel.flashLife });

    // 抛壳口：枪身右侧、比枪口近一点。弹壳从**枪口**飞出来一眼就假，
    // 所以这里单独算一个位置（右向量 = (cos yaw, 0, -sin yaw)）
    const port = {
      x: origin.x + Math.cos(this.yaw) * 0.24 + aim.x * 0.3,
      y: origin.y - 0.12,
      z: origin.z - Math.sin(this.yaw) * 0.24 + aim.z * 0.3,
    };
    deps.effects.ejectShells(port, this.yaw);
    // `own: true` —— 自己这一声不跟别人的枪声共享节流（见 `audio.ts`）。
    // 网络对端不在这里发声：房主的 `onShot` 钩子会用**带坐标**的方式播一遍，
    // 两边都放就是一声双响
    if (spec.sound && !this.remote) gameAudio.shot(spec.sound, { own: true });

    // 曳光：终点 = **这一发真实弹道的落点**（就是弹孔的位置），不是「中心射线 ×
    // 命中距离」。后者会让距离对、方向错 —— 曳光全收束到准星中心，弹孔却在旁边。
    // 一颗弹丸都没打中任何东西时，才沿这颗弹丸的真实方向画到 60 米（依然不是中心线）。
    let endT = 0;
    let tracerEnd: Point3 | null = null;
    for (const result of results) {
      if (result.type === 'none') continue;
      if (result.t > endT) {
        endT = result.t;
        tracerEnd = result.point;
      }
    }
    if (!tracerEnd) {
      endT = 60;
      tracerEnd = {
        x: origin.x + shotDir.x * endT,
        y: origin.y + shotDir.y * endT,
        z: origin.z + shotDir.z * endT,
      };
    }
    deps.effects.spawnTracer(muzzle, tracerEnd);

    deps.hooks.onShot?.(this, this.weapon, origin, shotDir, endT);

    if (ammo.mag === 0) this.startReload();
  }

  /* ============================================================
     近战
     ============================================================ */

  /**
   * 出刀输入。真正的时间推进在 `updateMelee` 里，这里只管「能不能起一刀」。
   *
   * 左键轻击、右键重击。右键走的是 `aimPressed` 边沿 —— 和开镜共用同一个键，
   * 因为刀没有镜可开，这个键在近战里天然空着。
   */
  private handleMelee(frame: InputFrame): void {
    // 动作没播完不接受新输入：0.5 秒一刀，连点的效果是「这一刀收完立刻起下一刀」
    if (this.meleeActive) return;

    const heavy = frame.aim;
    const wantsAttack = frame.firePressed || (heavy && frame.aimPressed);
    if (!wantsAttack) return;

    this.startMelee(heavy);
  }

  private startMelee(heavy: boolean): void {
    const spec = WEAPONS.knife;

    this.meleeActive = true;
    this.meleeTimer = 0;
    this.meleeHeavy = heavy;
    this.meleeDuration = heavy ? (spec.heavyInterval ?? 1) : spec.interval;
    // 蓄力（前摇）→ 刺击判定 → 收刀。判定窗口和刺击动画共用同一个进度 t，
    // 所以「刀什么时候在往前走」和「什么时候能判定命中」天然同步
    this.meleeWindow = heavy
      ? (spec.heavyWindow ?? spec.meleeWindow ?? [0.25, 0.45])
      : (spec.meleeWindow ?? [0.2, 0.5]);

    this.meleeHits.clear();
    this.meleeBumped = false;

    const view = this.meleeView;
    view.active = true;
    view.heavy = heavy;
    view.swing = 0;
    view.rebound = 0;

    // 破空声无条件播一次：打中了会被 `knifeHit` 盖过去，
    // 而「刺空也要有 whoosh」是需求里明确的一条
    if (!this.remote) gameAudio.knife(heavy);
  }

  /**
   * 刺击状态机。每帧都跑（不管手里是不是刀），因为 `rebound`
   * 需要在切枪之后自己衰减回零。
   *
   * 把「蓄力 / 判定 / 收刀」压成一个 `swing`（-1 → +1 → 0）交给渲染层，
   * 这样判定窗口多长和刀刺多深是两件互不影响的事。
   */
  private updateMelee(dt: number, deps: PlayerDeps): void {
    const view = this.meleeView;
    view.rebound = damp(view.rebound, 0, 9, dt);

    if (this.meleeActive) {
      this.meleeTimer += dt;
      const total = this.meleeDuration;
      const t = total > 0 ? this.meleeTimer / total : 1;
      const [w0, w1] = this.meleeWindow;

      if (t < w0) {
        // 蓄力：0 → -1，缓出（起手快，拉到最后一段变慢）
        view.swing = -easeOutCubic(w0 > 0 ? t / w0 : 1);
      } else if (t <= w1) {
        // 刺出：-1 → +1。这一段才是「刀真的在往前走」，用缓出让刀一上来就有速度
        view.swing = -1 + 2 * easeOutCubic(w1 > w0 ? (t - w0) / (w1 - w0) : 1);
      } else {
        // 收刀：+1 → 0，缓入缓出 —— 收刀不能急停
        view.swing = 1 - easeInOutCubic(w1 < 1 ? (t - w1) / (1 - w1) : 1);
      }

      // 判定窗口内**每帧**扫一次 —— 窗口和刺击段重合，命中的时机就是刀尖
      // 走到身上的时机，不会「还没刺出就掉血」或「刀收回去了才判定」
      if (t >= w0 && t <= w1 && this.meleeHits.size < MELEE_MAX_TARGETS) {
        this.meleeStrike(deps);
      }

      if (this.meleeTimer >= total) {
        this.meleeActive = false;
        this.meleeTimer = 0;
        view.active = false;
        view.swing = 0;
        this.meleeHits.clear();
      }
    }
  }

  /**
   * 一次扫掠检测。
   *
   * 先找人，找不到再看刀会不会磕在墙 / 箱子上 —— 两件事互斥，砍到人就不会
   * 同时冒火花，否则「砍人身上出金属火花」会很怪。
   */
  private meleeStrike(deps: PlayerDeps): void {
    const spec = WEAPONS.knife;
    const heavy = this.meleeHeavy;
    const origin = this.eyePos;
    const aim = dirFromAngles(this.aimYaw, this.aimPitch);
    // 重击扇形窄，但够得更远（需求：+0.3m）
    const reach = (spec.reach ?? 2.2) + (heavy ? HEAVY_REACH_BONUS : 0);
    const arc = heavy ? (spec.heavyArc ?? 46) : (spec.meleeArc ?? 70);

    const victim = meleeSwing(this, origin, aim, deps.actors, deps.hooks, {
      heavy,
      arc,
      reach,
      already: this.meleeHits,
    });

    if (victim) {
      this.meleeHits.add(victim);
      this.meleeView.rebound = 0;
      // 砍完还留着护甲 ⇒ 这一刀砍在了硬东西上，声音要偏金属
      if (!this.remote) gameAudio.knifeHit(!victim.alive, victim.armor > 0);
      this.addShake(heavy ? 0.16 : 0.09);
      return;
    }

    // 没砍到人 —— 看刀会不会磕在硬物上。一次挥砍只磕一下：
    // 窗口里有 9 帧，每帧都放火花 + 刀痕会变成放烟花
    if (this.meleeBumped) return;
    const wall = rayWorld(origin, aim, reach, deps.colliders);
    if (!wall) return;

    this.meleeBumped = true;
    deps.hooks.onWorldHit?.(
      { x: origin.x + aim.x * wall.t, y: origin.y + aim.y * wall.t, z: origin.z + aim.z * wall.t },
      { x: wall.nx, y: wall.ny, z: wall.nz },
      wall.collider.surf,
      aim,
    );
    // 弹刀：刀被硬物顶回来，刀和镜头一起顿一下
    this.meleeView.rebound = 1;
    this.addShake(0.1);
  }

  /** 把刺击动作彻底作废（切枪 / 重生 / 死亡）。 */
  private cancelMelee(): void {
    this.meleeActive = false;
    this.meleeTimer = 0;
    this.meleeHits.clear();
    this.meleeBumped = false;

    const view = this.meleeView;
    view.active = false;
    view.swing = 0;
    view.rebound = 0;
  }

  private handleGrenadeCook(dt: number, frame: InputFrame, deps: PlayerDeps): void {
    const spec = WEAPONS.grenade;
    const fuse = spec.fuse ?? 3;

    if (frame.firePressed && this.grenades > 0) {
      this.cooking = true;
      this.cookTimer = 0;
    }

    if (!this.cooking) return;

    this.cookTimer += dt;

    if (!frame.fire) {
      // 松手投出：引信减去已经捏住的时间 —— 捏久了就快炸
      this.cooking = false;
      this.throwGrenade(fuse - this.cookTimer, deps);
    } else if (this.cookTimer >= fuse) {
      // 捏太久直接炸在手里
      this.cooking = false;
      const origin = this.eyePos;
      grenadeBlast(origin, this, deps.actors, deps.colliders, deps.hooks);
      deps.effects.spawnExplosion(origin);
      gameAudio.explosion(origin.x, origin.y, origin.z);
    }
  }

  private computeSpread(weapon: WeaponId): number {
    return currentSpread(WEAPONS[weapon], {
      speed: Math.hypot(this.vel.x, this.vel.z),
      onGround: this.onGround,
      crouching: this.crouching,
      scoped: this.scoped,
      accum: this.spreadAccum,
    });
  }
}
