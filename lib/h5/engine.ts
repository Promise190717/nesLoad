import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { gameAudio } from './audio';
import { createActorView, type ActorView } from './actor-view';
import { Bot, BOT_NAMES, type BotWorld } from './bot';
import { type CombatHooks, grenadeBlast } from './combat';
import { DEATH_TIMELINE, DeathCamera, deathPhaseAt } from './death-cam';
import { DroppedWeapons } from './dropped';
import { Effects, TRACER_COLOR_BOT, TRACER_COLOR_HUMAN } from './effects';
import { InputController, type InputAction, type InputFrame } from './input';
import { buildLevel, type Level } from './level';
import { clamp, damp, dirFromAngles, pick, rand, randInt } from './math';
import type { Point3 } from './math';
import {
  ACTOR_DEATHS,
  ACTOR_DEATH_TIME,
  ACTOR_FLAGS,
  ACTOR_GRENADES,
  ACTOR_HEIGHT,
  ACTOR_HP,
  ACTOR_ID,
  ACTOR_KILLS,
  ACTOR_MAG,
  ACTOR_NAME,
  ACTOR_PITCH,
  ACTOR_TEAM,
  ACTOR_VX,
  ACTOR_VZ,
  ACTOR_WEAPON,
  ACTOR_X,
  ACTOR_Y,
  ACTOR_YAW,
  ACTOR_Z,
  F_ALIVE,
  F_GROUND,
  F_HUMAN,
  F_LOADOUT,
  F_RELOADING,
  F_SCOPED,
  GRENADE_ID,
  GRENADE_X,
  GRENADE_Y,
  GRENADE_Z,
  INPUT_HZ,
  IN_AIM,
  IN_AIM_PRESSED,
  IN_CYCLE_NEXT,
  IN_CYCLE_PREV,
  IN_FIRE,
  IN_FIRE_PRESSED,
  IN_JUMP,
  IN_QUICK_GRENADE,
  IN_QUICK_SWITCH,
  IN_RELOAD,
  IN_SLOT_MELEE,
  IN_SLOT_PRIMARY,
  IN_SLOT_SECONDARY,
  IN_SLOT_THROWABLE,
  IN_WALK,
  NET_VERSION,
  PEER_TIMEOUT_MS,
  ROSTER_HZ,
  SNAPSHOT_HZ,
  SURFACE_WOOD,
  encodeActor,
  encodeGrenade,
  indexToWeapon,
  num,
  str,
  weaponToIndex,
  type ActorWire,
  type GrenadeWire,
  type InputWire,
  type NetEvent,
  type RosterWire,
  type Snapshot,
  type TeamSlot,
} from './net/protocol';
import { ReplicaActor } from './net/replica';
import type { SessionRole, ShipNetSession } from './net/session';
import { rayWorld } from './physics';
import { Player, SCOPED_FOV, type PlayerDeps } from './player';
import type {
  Actor,
  DeathInfo,
  Difficulty,
  EngineOptions,
  FeedEntry,
  HitTier,
  HudSnapshot,
  MatchResult,
  MatchRules,
  NetHud,
  PrimaryId,
  ScoreRow,
  Team,
  WeaponId,
} from './types';
import { isPrimaryId } from './types';
import { ViewModelLayer } from './viewmodel';
import { WEAPONS, weaponFeel } from './weapons';

/**
 * 主循环 —— 把 level / physics / combat / bot / player / effects / input 焊在一起。
 *
 * ## 对外只有一个门
 *
 * React 侧只知道三件事：构造时给一个 canvas 和一组回调，`start()` 开始，`dispose()`
 * 结束。引擎不认识 React，React 也不认识引擎内部 —— 通信靠引擎按 10Hz 推一次
 * `HudSnapshot`（一个普通对象），以及 `onFinish` 推一次 `MatchResult`。
 *
 * 为什么不是 React 每帧 `requestAnimationFrame` + `setState`：60fps 的 setState
 * 会让 React 成为瓶颈，而且玩家位置这类每帧变化的数据根本不该进 React 状态。
 * 反过来，HUD 上的血量/弹药变化不需要 60Hz，10Hz 完全够看。
 *
 * ## 渲染顺序
 *
 *   renderer.clear()
 *   render(scene, camera)        ← 世界
 *   renderer.clearDepth()
 *   render(viewScene, viewCamera) ← 手里的枪，永远在最前面
 */

/* ============================================================
   常量
   ============================================================ */

/** HUD 推送频率（秒） */
const HUD_INTERVAL = 0.1;

/** 击杀播报保留时长（秒） */
const FEED_LIFETIME = 6;

/** 受击方向弧标显示多久（毫秒） */
const DAMAGE_ARROW_MS = 1200;

/**
 * Bot 的尸体在场上留多久（秒）。
 *
 * 需求写的是「保留 5 秒再淡出消失」。这里让**尸体和 Bot 的重生绑在一起**：
 * 到了这个时间尸体淡出、Bot 在出生点复活。不做「尸体留 5 秒、Bot 3 秒就复活」
 * 是因为那样需要一份独立的尸体对象（第二套模型 + 材质 + 姿态快照），
 * 而玩家实际感知到的只有「地上那具尸体待了多久」。
 */
const BOT_CORPSE_LIFE = 5;

/** 尸体淡出用掉最后这么多秒 */
const CORPSE_FADE = 0.9;

/** 低血量（<30）心跳的间隔区间（秒）。血越少跳得越快。 */
const HEARTBEAT_SLOW = 0.62;
const HEARTBEAT_FAST = 0.34;
const LOW_HP = 30;

/**
 * 刀砍进人身上的顿帧（秒）。
 *
 * 70ms 落在需求给的 60~80ms 区间里。和致死一击的 `DEATH_TIMELINE.hitStop`
 * 是两件事：那个是「我死了」的慢放，这个是「我砍中了」的触感 —— 分开写，
 * 将来调其中一个不会连带改掉另一个。
 */
const MELEE_HITSTOP = 0.07;

/**
 * 击杀确认的镜头反馈强度（需求 §3「轻微镜头反馈」）。
 *
 * 量级对比：落地 0.14、最轻受击 ~0.15、死亡 0.7 —— 它必须比这些都小，
 * 是「手上确认了一下」而不是「镜头被踹」。只进 view 层（`addShake` 只影响
 * 画面震动，`aimYaw/aimPitch` 弹道不受任何影响），比 AWM 开火的 shake(0.08)
 * 略大一点，但击杀比开枪稀有得多，不会造成眩晕。
 */
const KILL_CONFIRM_SHAKE = 0.12;

/**
 * 弹头擦身声的作用半径（米）。
 *
 * 2.6 米：甲板宽度 22 米，这个半径只覆盖「正打我这一侧」的弹道，
 * 隔着两个集装箱的乱射不该在耳边「啪啪」响。距离近到 0.3 米时满音量。
 */
const WHIZ_RADIUS = 2.6;

/**
 * 命中标记相对屏幕中心的最大偏移（NDC，1 = 半个屏幕）。
 *
 * 命中点几乎总在准星附近（子弹就是从准星打出去的），偶尔会偏出去 —— 霰弹的
 * 边缘弹丸、穿透后打到的第二个目标。真让标记画到画面边上，看起来像 UI 出错；
 * 夹在准星周围 1/5 屏内，既看得出「偏了一点」，又不会离开视线中心。
 */
const SPOT_LIMIT = 0.2;

const GRAVITY = 20;

/**
 * 单帧步长上限（秒）。
 *
 * 原来是 50ms。切标签页 / 掉帧回来时 `now - lastTime` 可能是好几秒，不夹住
 * 玩家会在一帧里穿过三堵墙 —— 夹到 50ms 仍然够让 5.5 m/s 的跑速一帧位移
 * 27cm，叠上碰撞解算就是「突然闪一下」。按 33ms（≈30 FPS 的下限）夹死：
 * 掉到 30 帧以下宁可让游戏慢一点，也不要瞬移。
 */
const MAX_DT = 1 / 30;

/**
 * 房主在后台时「补帧」的触发门槛（毫秒）。见 `stepWhileHidden`。
 *
 * 背景：浏览器对**隐藏的标签页**会彻底停掉 rAF（窗口被别的窗口盖住时也可能
 * 降到 1fps），而房主的整局权威模拟都挂在 rAF 上。房主一切走，加入者那边就
 * 只剩「本地移动预测」还活着 —— 切枪、换弹、命中、比分全都要等房主落账，
 * 表现就是「换了枪没反应、打中了不掉血」。
 *
 * 80ms ≈ 12fps：正常 60fps 下 rAF 间隔 16ms，这道门根本不会开；只有真的停了
 * 才会被输入帧顶开。
 */
const HIDDEN_STEP_GAP_MS = 80;

/** 瞬移自检：单帧位移超过「速度上限 × dt × 1.5」就报警。地址栏加 `?debug=1` 打开。 */
const DEBUG_ENABLED =
  typeof window !== 'undefined' && /[?&]debug=1(?:&|$)/.test(window.location.search);

/* ============================================================
   联机
   ============================================================ */

/**
 * 房主：这么久没收到某个加入者的输入，就把他的移动轴归零。
 *
 * 只归零轴、不踢人：网络抖一下（切窗口、掉几帧）不该让场上的人机替进来 ——
 * 那正是需求里说的「不要频繁执行移除—补人机—再移除」。真正的掉线判定是
 * `PEER_TIMEOUT_MS`（6 秒），比这个宽松二十倍。
 */
const INPUT_STALE = 0.3;

/** 一帧快照里最多带多少条表现事件（一雷三杀 + 霰弹同帧会把队列撑爆） */
const MAX_NET_EVENTS = 96;

/** 一帧里最多广播多少个弹着点（8 个人机对枪时一帧几十个，全发就是带宽黑洞） */
const MAX_NET_IMPACTS = 24;

/**
 * 每帧最多给几个积压的副本建视图（见 `pendingReplicaViews`）。
 *
 * 中途加入时第一份快照一次带来 9 个陌生角色：一帧内全建出来的话，
 * 几十个几何体分配 + 首次上屏的材质状态整备挤在同一帧，加入瞬间就是
 * 一个几百毫秒的卡顿尖峰（连带输入上行断流，房主端 0.3s 就把人钉住）。
 * 分帧建、先建离自己最近的 —— 80ms 内全部上屏，人眼几乎无感。
 */
const NET_VIEW_BUDGET = 2;

/**
 * 加入者移动预测的对账参数（见 `reconcileSelf`）。
 *
 * 演进史（都别走回头路）：
 * ① 最初版固定死区 0.25 + 只在快照帧拽 —— 0.25 和「跑速×管线延迟」同量级，
 *    跑起来漂移骑在死区边界反复触发，60Hz 锯齿直上相机 =「连续一卡一卡」。
 * ② 外推版（快照位置沿速度前推 + 差分估 vy）—— 台阶是**离散跳变**：房主跨
 *    一级台阶那帧快照 y 瞬间 +0.3m，差分把 0.3/0.016 ≈ 18m/s 的「假 vy」夹成
 *    ±7，外推目标凭空抬高 0.6m 踩破硬就位阈值 → 每跨一级上下瞬移一轮，且
 *    就位分支挪基准会让下一帧差分反号，**自激成持续狂抖**（用户实测：上楼梯
 *    狂抖、靠住船体停稳就恢复）。差分估 vy 对一切 y 离散（台阶、攀爬箱）都
 *    不可信 —— **别再把差分 vy 用进外推或就位判定**。
 * ③ 现行版：不做外推，死区随快照速度放宽（盖过「管线×速度」的固有漂移），
 *    目标永远 = 裸快照位置（绝不会指进墙里/台阶里），垂直只有硬就位一条路。
 *
 *   SELF_DRIFT_DEAD        基础死区（静止时）；漂移小于它完全信本地预测
 *   SELF_DEADZONE_PER_SPEED 死区随快照速度的增长系数：0.08 × 5.5 ≈ 0.44，
 *                          加基础项共 ~0.6m，盖住正常管线漂移（0.05~0.15s × 跑速）
 *   SELF_CORRECT_RATE      超出死区 → 逐帧指数纠偏（4/s 收敛，无锯齿无瞬移）
 *   SELF_SNAP_DIST         水平硬就位阈值。要盖过「急转向时漂移瞬时摆到
 *                          2×管线×跑速 ≈ 1.7m」，2.0 只兜真瞬移
 *   SELF_SNAP_Y            垂直硬就位阈值（裸快照 y vs 本地 y）。要盖过「合法
 *                          跳跃/坠落 × 管线」：6.6m/s 起跳 × 0.15s ≈ 1.0，取 1.6
 *   SELF_VY_EST_MAX        房主不发 vy，快照 y 差分估的 vy 超过它视为离散
 *                          （台阶瞬跳 / 就位污染），估 0 不估值 —— 只给硬就位
 *                          时的 vel.y 用，不参与任何外推
 */
const SELF_DRIFT_DEAD = 0.15;
const SELF_DEADZONE_PER_SPEED = 0.08;
const SELF_CORRECT_RATE = 4;
const SELF_SNAP_DIST = 2.0;
const SELF_SNAP_Y = 1.6;
const SELF_VY_EST_MAX = 12;

/* ============================================================
   手雷投掷物
   ============================================================ */

interface Grenade {
  /** 房主分配的序号，快照的 `g` 行靠它标识「同一颗」（加入者侧认人用） */
  id: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fuse: number;
  owner: Actor;
  mesh: THREE.Mesh;
}

/**
 * 加入者侧：对端手雷的**画面副本**。
 *
 * 只有位置和球 —— 没有速度、没有引信、不参与任何判定。它唯一的职责是让
 * 「手雷在空中飞」这件事在加入者屏幕上真的看得见（以前只有落地那一声爆炸）。
 */
interface GrenadeView {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

/**
 * 房主侧：一个加入者在房主机器上的**全部状态**。
 *
 * `player` 是一个真正的 `Player`（`local = false`），所以移动、开火、命中、
 * 伤害、重生全部走和本机玩家**完全同一条代码路径** —— 需求里「真人与人机
 * 遵循同一套伤害、距离衰减、弹道和复活规则」不是靠对齐两份实现，而是根本
 * 只有一份。
 */
interface NetLink {
  peerId: string;
  player: Player;
  view: ActorView;
  deps: PlayerDeps;
  /** 持续量：前后左右 / 走 / 开火 / 开镜 */
  forward: number;
  right: number;
  walk: boolean;
  fire: boolean;
  aim: boolean;
  /**
   * 一次性动作（跳 / 换弹 / 切枪 / 扔雷），下一帧消费掉。
   * 消费方式是**整体换出**（`updateRemotePlayers` 里换新 Set）而不是 clear：
   * frame 要拿着这批动作走到 `handleActions`，同一个引用先清就全没了。
   */
  actions: Set<InputAction>;
  firePressed: boolean;
  aimPressed: boolean;
  /** 视角绝对角（加入者本地即时瞄准，房主照抄） */
  yaw: number;
  pitch: number;
  /** `performance.now()`，用来判「输入断流」和「掉线」 */
  lastInputAt: number;
}

/** 单发/半自动武器之外，人机手里那把枪要映射成「主武器槽」的合法取值。 */
function primaryOf(weapon: WeaponId): PrimaryId {
  if (weapon === 'ak47' || weapon === 'm4a1' || weapon === 'awm' || weapon === 'shotgun') return weapon;
  return 'ak47';
}

/* ============================================================
   引擎
   ============================================================ */

export class ShipGame {
  private readonly canvas: HTMLCanvasElement;
  private readonly options: EngineOptions;
  /** 对局规则。可在两次开局之间替换（`setRules`），所以不是 readonly */
  private rules: MatchRules;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly viewModel: ViewModelLayer;
  /**
   * 本帧视角增量（`InputFrame.lookYaw / lookPitch` 的原样转发）。
   * 给枪模的视角摇晃用：房主 / 加入者两条 update 路各写一次，
   * `updateViewModel` 只读。菜单 / 死亡冻结时两条路都会归零。
   */
  private readonly lookDelta = { yaw: 0, pitch: 0 };
  /** 环境贴图（PMREM），主场景与枪模场景共用；随 renderer 一起销毁 */
  private readonly envTexture: THREE.Texture;
  private readonly effects: Effects;
  private readonly level: Level;
  private readonly input: InputController;
  private readonly deathCam = new DeathCamera();
  private readonly dropped: DroppedWeapons;

  private readonly player: Player;
  private readonly bots: Bot[] = [];
  private readonly actors: Actor[] = [];
  private readonly botViews = new Map<Bot, ActorView>();
  private readonly grenades: Grenade[] = [];
  /** 手雷序号发号器（房主）。只增不减，加入者靠它区分「同一颗」和「新一颗」 */
  private grenadeSeq = 0;
  /**
   * 加入者：对端手雷的画面副本，key = 房主那边的序号。
   *
   * 加入者**不跑投掷物模拟**（谁扔的、飞到哪儿、炸到谁全在房主那边算），
   * 所以这些球每帧只从快照的 `g` 行抄位置。没有这一层，加入者屏幕上扔雷
   * 是「空中什么都没有，1.4 秒后地上凭空炸一下」。
   */
  private readonly grenadeViews = new Map<number, GrenadeView>();

  /* ---- 联机 ---- */
  /** 联机会话。`null` = 单人，走原来那条路径（一行都不变） */
  private net: ShipNetSession | null = null;
  private netRole: SessionRole | null = null;
  /** 加入者：房主分配给自己那个角色的 id。快照里靠它认出「哪个是我」 */
  private selfActorId = 'player';
  /** 房主：peerId → 那个人的角色 */
  private readonly links = new Map<string, NetLink>();
  /** 加入者：id → 角色副本（不含自己） */
  private readonly replicas = new Map<string, ReplicaActor>();
  /** 加入者：id → 第三人称模型 */
  private readonly replicaViews = new Map<string, ActorView>();
  /** 还没建视图的副本（分帧补建，见 `drainReplicaViews`） */
  private readonly pendingReplicaViews = new Map<string, ReplicaActor>();
  private netInputTimer = 0;
  private netSnapshotTimer = 0;
  private netRosterTimer = 0;
  private netSeq = 0;
  private netInputSeq = 0;
  /* ---- 加入者对账基准（见 `reconcileSelf`） ---- */
  /** 最近一次快照里「我自己」的原始位置 / 速度 / 到达时刻 */
  private selfMirrorBase = new THREE.Vector3();
  private selfMirrorVel = new THREE.Vector3();
  private selfMirrorAt = 0;
  private hasSelfMirror = false;
  /** 加入者：攒到下一次上行的一次性动作（30Hz 之间按下的键不能丢） */
  private readonly netActions = new Set<InputAction>();
  private netFirePressed = false;
  private netAimPressed = false;
  /**
   * 加入者：本地开火反馈的节奏闸（秒）。
   *
   * 枪声/枪口焰/后坐本地即时演（`updateNetFireFeedback`），但连发的节奏
   * 还是按武器表压着 —— 不然按住 AK 会在一帧里播 30 响。数值和房主
   * `handleFire` 的 `fireCooldown` 同源（都来自 `spec.interval`），两端
   * 节奏天然一致，不需要和回显对时。
   */
  private netFireFeelCd = 0;
  /** 房主：这一帧攒下、下次快照带出去的表现事件 */
  private netEvents: NetEvent[] = [];
  /** 本帧已经广播了几个弹着点（见 `MAX_NET_IMPACTS`） */
  private netImpacts = 0;
  /** 加入者：最近一帧快照（`start()` 之前就可能已经收到） */
  private latestSnapshot: Snapshot | null = null;
  private appliedSnapshotSeq = -1;
  /** 补人机时轮换名字，避免两个同名的人机同时在场 */
  private botSerial = 0;

  /** 玩家与 Bot 共用的依赖包。**必须在构造函数里赋值** —— 它要引用 `this.level`。 */
  private readonly playerDeps: PlayerDeps;
  private readonly botWorld: BotWorld;

  private readonly grenadeGeometry = new THREE.SphereGeometry(0.085, 10, 8);
  private readonly grenadeMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a5340,
    roughness: 0.8,
    metalness: 0.2,
  });

  private settings: EngineOptions['settings'];

  /* ---- 对局状态 ---- */
  private readonly score: [number, number] = [0, 0];
  private timeLeft: number;
  /** 本局已用秒数。人头局（`endMode === 'kills'`）里 HUD 顶部显示它 */
  private elapsed = 0;
  private running = false;
  /** 游戏菜单（Esc 放锁）开着。**不冻结游戏** —— 世界照常跑，只把本机玩家输入归零 */
  private menuOpen = false;
  private finished = false;
  private buyOpen = false;
  /** 上一帧的计分板可见状态，用来做边沿检测 */
  private scoreboardVisible = false;

  /** 瞬移自检的上一帧位置（`?debug=1` 时才有意义） */
  private readonly dbg = { x: 0, y: 0, z: 0, ready: false, warns: 0 };

  private readonly feed: FeedEntry[] = [];
  private feedCounter = 0;

  /* ---- 死亡体验相关 ---- */
  /** hit-stop 剩余时长（秒）。大于 0 时整局按 `hitStopScale` 慢放 */
  private hitStop = 0;
  /** 玩家当前连杀数。死一次清零 */
  private killStreak = 0;
  /** 最近一次受伤的来源（世界坐标）+ 弧标过期时间 */
  private damageFromX = 0;
  private damageFromZ = 0;
  private damageFromUntil = 0;
  /** 最近一次挨打的实际伤害。死亡信息卡要显示它 */
  private lastPlayerDamage = 0;
  /**
   * 上一次「命中别人」的镜头冲击时间（`performance.now()`）。
   *
   * 用来限流：连发命中时每发都给 `addShake` 会把波形一直重置在峰值，
   * 观感从「一下一下」变成「持续抖」。60ms ≈ 16 次/秒，比任何枪的射速都密，
   * 实际效果是「打中第一发有一下，之后的连发粘成一片低频震动」。
   */
  private lastHitShakeAt = 0;
  private heartbeatTimer = 0;

  /**
   * 本帧攒下的命中 / 击杀反馈 —— **一帧只往外推一次**。
   *
   * 为什么必须攒：一次击发可能产生多条 `onActorHit`（霰弹 8 颗弹丸、AWM 穿透
   * 打两个目标），手雷一次能炸死三个人。上一版是每个回调各自推一次 UI + 播一次
   * 音，结果是：
   *
   *   · 霰弹贴脸 → 8 次 `setState` + 8 声「叮」叠成一片噪音
   *   · 一雷三杀 → 三声击杀音同时响、三个击杀图标互相覆盖（只剩最后一个）
   *   · 致死那一枪 → 「命中」和「击杀」两个标记在同一帧推，React 批处理之后
   *     只剩后者，注释里说的「中了 → 死了两拍」其实从来没有发生过
   *
   * 攒成一份之后：**一个事件 = 一次反馈**，档位取本帧最高的那个（kill > head >
   * hit），连杀数照常累加，图标显示 ×3 而不是闪三次。这也是验收里
   * 「不出现未击杀却弹击杀提示」最直接的保证 —— 反馈只由真实结算结果产生。
   */
  /** 击杀瞬间 FOV 微弹的剩余量（度）。`updateCamera` 里按帧指数衰减。 */
  private fovPop = 0;

  private readonly feedback: {
    tier: HitTier | null;
    point: Point3 | null;
    kills: number;
    head: boolean;
    weapon: WeaponId;
    melee: boolean;
  } = { tier: null, point: null, kills: 0, head: false, weapon: 'ak47', melee: false };

  /* ---- 帧 ---- */
  private rafId = 0;
  private lastTime = 0;
  /**
   * 当前是不是「rAF 已经停了、靠加入者的输入帧在补帧」（见 `stepWhileHidden`）。
   * 一道门而已：真正跑起来（`render = true`）的那一帧会把它关掉。
   */
  private hiddenTicking = false;
  private hudTimer = 0;
  private frameCounter = 0;
  private fpsTimer = 0;
  private fps = 60;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, options: EngineOptions) {
    this.canvas = canvas;
    this.options = options;
    this.rules = options.rules;
    this.settings = options.settings;
    this.timeLeft = options.rules.durationSec;

    /* ---------- 渲染器 ---------- */
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: options.settings.quality !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.settings.quality === 'high' ? 2 : 1.5));
    // 用 Neutral 而不是 ACES：ACES 会把中间调整体压低一档（这是它的「电影感」，
    // 但对一个需要看清掩体边缘的射击游戏是负作用，实测画面发灰发暗）。
    // Neutral 保住中间调，只压高光。
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    // 关掉自动清屏：世界和枪模要分两次画，中间只清深度
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = options.settings.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    /* ---------- 场景与相机 ---------- */
    // 雾推远一点：地图缩短之后 60 米外已经是对面船头，雾太近会把敌我一起糊掉
    this.scene.fog = new THREE.Fog(0xc4d8e4, 90, 320);
    this.camera = new THREE.PerspectiveCamera(options.settings.fov, 1, 0.05, 900);
    // YXZ 序：先偏航再俯仰，才不会出现「抬头时画面侧倾」
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    /* ---------- 世界 ---------- */
    this.level = buildLevel(this.scene);
    this.effects = new Effects(this.scene, { quality: options.settings.quality });
    this.dropped = new DroppedWeapons(this.scene);
    this.level.sun.castShadow = this.settings.quality !== 'low';

    /* ---------- 第一人称枪模 ---------- */
    this.viewModel = new ViewModelLayer(1);

    /* ---------- 环境反射（PBR 质感的前提） ---------- */
    // 高金属度材质没有环境贴图只会反射到黑色。用 three 自带的 RoomEnvironment
    // 烘一张 PMREM：一次性的 GPU 成本，换所有金属件的反射层次。
    // 🔴 两个场景都要给：掉在地上的枪（dropped.ts）和手里的枪共享同一份材质，
    // 只给枪模场景会让地上那把变成死黑。主场景只给低强度（补反射，不是提亮），
    // 枪模场景给足（枪的金属质感主要靠它）。
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envTexture = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = 0.3;
    this.viewModel.scene.environment = this.envTexture;
    this.viewModel.scene.environmentIntensity = 0.85;

    /* ---------- 角色 ---------- */
    this.player = new Player();
    this.actors.push(this.player);
    this.spawnBots();

    /* ---------- 依赖包（要等 level / effects / player 都建好） ---------- */
    this.playerDeps = {
      actors: this.actors,
      colliders: this.level.colliders,
      nav: this.level.nav,
      hooks: this.hooks,
      effects: this.effects,
      muzzlePoint: (dist) => this.muzzleWorldPoint(dist),
      onWeaponChange: (weapon, animated) => {
        // 数字键 / 滚轮 / Q / 换枪菜单都从这里出去，所以「收起 + 掏出」只有一套管线。
        // `animated = false` 只出现在快速扔雷那种一闪而过的切枪上
        if (animated) this.viewModel.beginSwitch(weapon);
        else this.viewModel.setWeapon(weapon);
      },
      onThrowGrenade: (fuse) => {
        this.throwGrenade(this.player, fuse);
      },
    };

    this.botWorld = {
      actors: this.actors,
      colliders: this.level.colliders,
      nav: this.level.nav,
      hooks: this.hooks,
    };

    /* ---------- 输入 ---------- */
    this.input = new InputController(canvas, (locked, lostFocus) => {
      this.options.onLockChange(locked);
      // Esc 放锁 = 弹出菜单，但**不冻结游戏**：联机暂停会卡住对面（根本不该有），
      // 单机也统一取消 —— 世界照常跑，只有本机输入被归零。浏览器规范强制退出
      // 锁定，拦不住，只能当成「开菜单」的信号。
      //
      // 🔴 但「失焦被收回的锁」不算信号（`lostFocus`）：切标签页、点别的窗口都会
      // 让浏览器顺手退出指针锁定，那不是玩家要开菜单。以前不看这个标志，切个 tab
      // 回来菜单就开着。菜单的唯一入口就是玩家按 Esc。
      //
      // 换枪菜单会主动放锁（要能用鼠标点菜单），那种情况由 `buyOpen` 挡掉。
      if (!locked && !lostFocus && this.running && !this.finished && !this.buyOpen) {
        this.menuOpen = true;
        this.options.onMenuChange(true);
      } else if (locked && this.menuOpen) {
        this.menuOpen = false;
        this.options.onMenuChange(false);
      }
    });
    this.input.sensitivity = options.settings.sensitivity;

    /* ---------- 尺寸 ---------- */
    this.resize();
    window.addEventListener('resize', this.onWindowResize);

    // 先摆好相机画一帧：开始界面是浮在**真实场景**上的，不是一块黑底。
    // 这一步也让 WebGL 的 shader 在点击「开始」之前就编译完，避免开局卡半秒。
    // 🔴 但 render() 只编译**当帧画到**的东西，覆盖不到藏在池子里还没上过屏的
    // 特效材质（曳光/弹孔/枪口焰/爆炸/弹壳/粒子）。谁第一个撞上谁付编译账：
    // 单人是开第一枪那一下，联机**加入者**是进场撞交火的那几帧——主线程一卡，
    // WebAudio 就 underrun 出咔哒杂声。compile() 全量预编，构造期（还在载入
    // 进度条里）一次性付清，两个场景都要。
    this.renderer.compile(this.scene, this.camera);
    this.renderer.compile(this.viewModel.scene, this.viewModel.camera);
    this.respawnPlayer();
    for (const bot of this.bots) this.respawnBot(bot);
    this.updateCamera(1 / 60);
    this.renderFrame();

    // 先把 HUD 推一次，让 React 侧不用等 100ms 才显示正确数值
    this.options.onHud(this.buildHud());
  }

  /* ============================================================
     初始化细节
     ============================================================ */

  /**
   * 按 `rules.teamSize` 铺满两队人机。
   *
   * `teamSize` 是**每队人数含本机玩家**，所以 team 0 少铺一个：出生线的第 0 个
   * 位置永久留给玩家，人机从第 1 个位子开始排。team 1 没有本机玩家，6 个位子
   * 全铺。出生位现在正好 6 个（`SPAWN_X`），6v6 也不会有人被挤到重复的格子上。
   */
  private spawnBots(): void {
    const size = this.rules.teamSize;
    for (const team of [0, 1] as Team[]) {
      const reserved = team === 0 ? 1 : 0;
      const spawns = this.level.spawns[team];
      for (let i = 0; i < size - reserved; i += 1) {
        // 阵营默认枪：匪（team 0，土黄）默认 AK，警（team 1，蓝）默认 M4。
        // 敌方（警）火力更杂：有喷子，逼玩家换着打法；友方统一 AK。
        // **不给 Bot 配 AWM** —— 一枪一个的狙击枪放在 AI 手里，玩家只要露头就被
        // 隔着半个货场点掉，体验是「这局没法打」而不是「这局有难度」。
        const weapon: WeaponId =
          team === 0
            ? pick<WeaponId>(['ak47', 'ak47', 'ak47', 'm4a1'])
            : pick<WeaponId>(['m4a1', 'm4a1', 'm4a1', 'shotgun']);

        const spawn = spawns[(i + reserved) % spawns.length]!.clone();
        spawn.x += rand(-0.6, 0.6);
        this.addBot(team, spawn, weapon);
      }
    }
  }

  /**
   * 往场上加一个人机（开局铺满、以及真人退出后补位都用它）。
   *
   * `spawn` 是**已经算好偏移的落点** —— 开局要避免多人重叠（随机偏移），
   * 补位则要精确站在那个人倒下的地方（不偏移），所以偏移交给调用方。
   */
  private addBot(team: Team, spawn: THREE.Vector3, weapon?: WeaponId): Bot {
    const name = this.freeBotName();
    const gun: WeaponId =
      weapon ?? (team === 0 ? pick<WeaponId>(['ak47', 'ak47', 'ak47', 'm4a1']) : pick<WeaponId>(['m4a1', 'm4a1', 'm4a1', 'shotgun']));

    const bot = new Bot(`bot-${team}-${this.botSerial}`, team, name, this.rules.difficulty, gun);
    this.botSerial += 1;
    bot.pos.copy(spawn);
    bot.respawn(new THREE.Vector3(spawn.x, spawn.y, spawn.z), 3);
    // 和真人复活同一条朝向规则：面朝敌方复活点
    bot.yaw = this.spawnFacingYaw(team, spawn);

    const view = createActorView(team, 'bot', gun);
    view.group.position.copy(bot.pos);
    view.group.visible = true;
    this.scene.add(view.group);

    this.botViews.set(bot, view);
    this.bots.push(bot);
    this.actors.push(bot);
    return bot;
  }

  /** 场上没被占用的人机名。名字要唯一 —— 击杀播报里重名会分不清谁杀了谁。 */
  private freeBotName(): string {
    const used = new Set(this.bots.map((bot) => bot.name));
    for (const name of BOT_NAMES) {
      if (!used.has(name)) return name;
    }
    return `人机${this.botSerial + 1}`;
  }

  /**
   * 把一个人机从场上**完整移除**（模型、材质、碰撞体、名字一起走）。
   *
   * 需求五.5 点名要这一条：真人替换人机之后，被替换的人机不能残留任何模型
   * 或碰撞体。所以这里不做「留个尸体」—— 尸体是死亡的表现，替换不是死亡。
   */
  private removeBot(bot: Bot): void {
    const view = this.botViews.get(bot);
    if (view) {
      this.scene.remove(view.group);
      view.dispose();
      this.botViews.delete(bot);
    }
    const botIndex = this.bots.indexOf(bot);
    if (botIndex >= 0) this.bots.splice(botIndex, 1);
    const actorIndex = this.actors.indexOf(bot);
    if (actorIndex >= 0) this.actors.splice(actorIndex, 1);
  }

  /* ============================================================
     对局流程
     ============================================================ */

  start(): void {
    gameAudio.unlock();
    gameAudio.setVolume(this.settings.volume);
    gameAudio.startAmbience();

    // 加入者不重置任何对局状态：比分、剩余时间、别人的位置全部由房主的快照说了算
    // （需求六.4「不能因玩家加入而清空比分或重新开始游戏」）
    const guest = this.netRole === 'guest';
    if (!guest) {
      this.score[0] = 0;
      this.score[1] = 0;
      this.timeLeft = this.rules.durationSec;
      this.elapsed = 0;
    }
    this.finished = false;
    this.buyOpen = false;
    this.feed.length = 0;
    // 上一局的投掷物不带进新一局：房主侧在飞的那几颗会「跨局爆炸」，
    // 加入者侧的画面副本则没人再清理它
    this.clearGrenades();

    // 上一局可能是在「观战」状态下被结束的，不清掉的话新一局开局镜头还躺在甲板上
    this.deathCam.reset();
    this.hitStop = 0;
    this.killStreak = 0;
    this.lastPlayerDamage = 0;
    this.lastHitShakeAt = 0;
    this.damageFromUntil = 0;
    this.heartbeatTimer = 0;
    // 上一局最后一帧攒下的反馈（比如刚好在结算那一帧打死人）不能漏到新一局
    this.feedback.tier = null;
    this.feedback.point = null;
    this.feedback.kills = 0;
    this.feedback.head = false;
    this.feedback.melee = false;
    this.lastDamage.clear();

    if (guest) {
      // 加入者：手头如果已经有一份快照（回执里带来的那份），立刻按它摆位
      this.appliedSnapshotSeq = -1;
      const snapshot = this.latestSnapshot;
      this.latestSnapshot = null;
      if (snapshot) this.applySnapshot(snapshot);
      this.player.netCanLoadout = false;
    } else {
      this.respawnPlayer();
      for (const bot of this.bots) this.respawnBot(bot);
    }

    this.viewModel.setWeapon(this.player.weapon);

    this.running = true;
    this.menuOpen = false;
    this.input.enabled = true;
    this.input.requestLock();

    // 上一次的循环可能还挂着一个 rAF（比如「退出对局」之后立刻重开），
    // 不清掉会出现两个循环同时跑，dt 翻倍、Bot 走得像快进
    cancelAnimationFrame(this.rafId);
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  /** 回到开始界面：停循环、放锁、静音，但不销毁引擎（场景留着当背景）。 */
  stop(): void {
    this.running = false;
    this.menuOpen = false;
    this.finished = false;
    this.buyOpen = false;
    // 场景要留着当背景：半空中悬着一颗冻住的手雷太出戏
    this.clearGrenades();
    this.input.enabled = false;
    this.input.exitLock();
    cancelAnimationFrame(this.rafId);
    gameAudio.setVolume(0);
    this.deathCam.reset();
  }

  /**
   * 预热音频（联机面板打开时调用，早于 `start()`）。
   *
   * `start()` 也会调 `unlock()`，但对**加入者**来说那一下正好是加入瞬间——
   * AudioContext 创建 + 全部枪声/脚步的首烘焙会撞上快照回放，卡顿叠卡顿。
   * 在选阵营界面那段空闲里提前建好 AudioContext、把烘焙排进后台宏任务，
   * 加入时剩下的就只有快照回放本身。重复调用无副作用（`unlock` 幂等）。
   */
  prewarmAudio(): void {
    gameAudio.unlock();
  }

  /**
   * 关掉游戏菜单并重新申请指针锁定（菜单里「返回战斗」按钮调用）。
   * 没有对应的 `pause()` —— 游戏不存在暂停状态，菜单开着世界照常跑。
   */
  resume(): void {
    if (!this.running || this.finished) return;
    this.menuOpen = false;
    this.options.onMenuChange(false);
    this.input.requestLock();
  }

  /** 换主武器（换枪菜单调用）。只在复活窗口内有效。 */
  selectPrimary(id: PrimaryId): void {
    if (!this.running || this.finished) return;
    // 🔴 资格判定落在**最终执行逻辑**上：就算 UI 被绕过（连点 / 事件残留），
    // 这里不通过就真的不换。资格 = 存活 + 复活 ≤5s + 本次生命未耗弹
    if (!this.player.canChangeLoadout) return;
    if (!this.player.alive) return;

    if (this.netRole === 'guest') {
      // 加入者：交给房主执行。本地直接换会出现「本机手里是新枪、房主那边还是旧枪」，
      // 下一帧开火打出去的弹道对不上 —— 换枪状态是玩法状态，必须房主说了算
      this.net?.sendLoadout(id);
      this.closeBuyMenu();
      return;
    }

    this.player.setPrimary(id, this.playerDeps);
    this.closeBuyMenu();
    this.options.onHud(this.buildHud());
  }

  openBuyMenu(): void {
    if (!this.running || this.finished || this.buyOpen) return;
    if (!this.player.alive) return;
    if (!this.player.canChangeLoadout) return;
    this.buyOpen = true;
    this.input.exitLock();
    this.options.onHud(this.buildHud());
  }

  closeBuyMenu(): void {
    if (!this.buyOpen) return;
    this.buyOpen = false;
    if (this.running && !this.finished) this.input.requestLock();
    this.options.onHud(this.buildHud());
  }

  /** 触屏 HUD 直接拿它下发虚拟按键。 */
  get controller(): InputController {
    return this.input;
  }

  get isRunning(): boolean {
    return this.running && !this.finished;
  }

  /* ============================================================
     重生
     ============================================================ */

  /**
   * 每个角色上一次站过的出生位。候选点就是 `level.spawns` 里那 6 个对象，
   * 所以直接比引用，不用存下标（下标会随 `SPAWN_X` 调整而错位）。
   */
  private readonly lastSpawn = new WeakMap<Actor, THREE.Vector3>();

  /**
   * 复活选点：**只在本方出生线**（= 己方最后面那 3 米横带）里挑，绝不跨到
   * 中路或敌人家门口。真人和人机共用这一套（2026-11-13 用户：人机也得在自己家
   * 复活，否则玩家会看到敌人从背后凭空冒出来）。
   *
   * 选点是**带权随机**，不是「越安全越优先」：
   *   · 每个候选点先数「被几个存活敌人看见」—— 从敌人眼睛向候选点胸口打射线，
   *     被场景几何挡住才算看不见；
   *   · 权重 = 1 / (1 + 0.5 × 看见人数)：全遮挡 1，被 1 人看见 0.67，被 4 人
   *     看见 0.33。掩护只影响概率，不会把半条出生线直接判死（更早的版本用
   *     1/(1+seen)，5 个敌人全看见时权重掉到 1/6，等于「必须躲进掩体」）；
   *   · **刚站过的那一格再乘 0.3**：连着两次从同一个角落冒出来正是用户
   *     2026-11-13 第二次反馈的点（「不要总在复活点的角落复活」）。这里改成
   *     软惩罚而不是硬排除 —— 出生线只有 6 格，硬排除会让下一次落点变成
   *     「排除掉一个之后的 5 选 1」，反而更好猜。
   *
   * 曾经是严格分层（先比被看见人数，再比离最近敌人的距离）：6 个出生位里最外侧
   * 的两个角落同时满足「狙击台帮它挡视线」和「离中场最远」，评分永远独占第一档 ——
   * 玩家几乎每次都从同一个角落站起来。现在掩护只决定被抽中的**概率**。
   *
   * 出生线本身在 `level.ts` 里也收窄了（±9 → ±7.6），从源头去掉「甲板四个角」。
   *
   * 这里**不加**随机偏移（Bot 在 `respawnBot`、玩家在 `respawnPlayer` 里自己叠）。
   *
   * `self` 是「谁要复活」：真人是 `this.player`，Bot 传自己。只用来从敌人名单
   * 里排除自己、以及记住他上一格；默认值让玩家那条路径不用改。
   */
  private pickHomeSpawn(team: Team, self: Actor | null = this.player): THREE.Vector3 {
    const candidates = this.level.spawns[team];
    // 排除**自己**而不是固定排除玩家：Bot 复用时敌我判断不能漏掉玩家
    const enemies = this.actors.filter((a) => a !== self && a.alive && a.team !== team);
    const last = self ? this.lastSpawn.get(self) : undefined;

    // 每个候选点的「被看见人数」→ 权重。场上没有活敌（开局 / 清场）时全是 0，
    // 自然退化成出生线上 6 个点等概率随机
    const weights: number[] = [];
    let total = 0;
    for (const candidate of candidates) {
      let seen = 0;
      for (const enemy of enemies) {
        // 敌人眼睛 → 候选点胸口；打穿了才算暴露
        const blocked = this.lineBlocked(
          { x: enemy.pos.x, y: enemy.pos.y + 1.45, z: enemy.pos.z },
          { x: candidate.x, y: candidate.y + 0.9, z: candidate.z },
        );
        if (!blocked) seen += 1;
      }
      let weight = 1 / (1 + seen * 0.5);
      if (candidate === last) weight *= 0.3;
      weights.push(weight);
      total += weight;
    }

    const remember = (spawn: THREE.Vector3): THREE.Vector3 => {
      if (self) this.lastSpawn.set(self, spawn);
      return spawn;
    };

    let roll = rand(0, total);
    for (let i = 0; i < candidates.length; i += 1) {
      roll -= weights[i]!;
      if (roll <= 0) return remember(candidates[i]!);
    }
    // 浮点误差兜底
    return remember(candidates[candidates.length - 1] ?? candidates[0]!);
  }

  /** 两点间视线是否被场景几何挡住。`from` 是眼睛高度，`to` 是胸口高度。 */
  private lineBlocked(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): boolean {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.5) return false;
    const hit = rayWorld(from, { x: dx / dist, y: dy / dist, z: dz / dist }, dist, this.level.colliders);
    // 留 0.3m 余量：贴着掩体边缘擦过的射线不算「被挡」，免得评分虚高
    return hit !== null && hit.t < dist - 0.3;
  }

  /**
   * 复活朝向：**始终面对敌方出生线**（地图的攻防轴）。
   *
   * 曾经是「朝向最近的存活敌人」—— 敌人绕到侧翼时，玩家一复活就被迫看着侧面，
   * 甚至背对敌方出生线，起身第一件事是转回来找方向。现在固定朝敌方复活点中心：
   * 从自己的家看对面的家，和地图设计的攻防方向一致，也方便玩家一眼判断该往哪推。
   *
   * 位置、朝向、相机在 `respawn` 一次设齐：死亡相机从甲板拉起来的那 0.45s
   * 里玩家位置已经就位，不存在「先出现在旧位置再瞬移」。
   */
  private spawnFacingYaw(team: Team, from: THREE.Vector3): number {
    const enemySpawns = this.level.spawns[team === 0 ? 1 : 0];
    if (enemySpawns.length === 0) return team === 0 ? Math.PI : 0;

    // 敌方出生线是一排点：取中点当「敌方复活点」，复活朝向不随己方出生位乱歪
    let tx = 0;
    let tz = 0;
    for (const spawn of enemySpawns) {
      tx += spawn.x;
      tz += spawn.z;
    }
    tx /= enemySpawns.length;
    tz /= enemySpawns.length;

    // 玩家前向 = (-sin yaw, -cos yaw)，反解 yaw 使前向指向目标
    return Math.atan2(-(tx - from.x), -(tz - from.z));
  }

  /**
   * 复活：死亡重生 / 开局 / 重开一局，**一律回己方出生线**。
   *
   * 曾经死亡复活走全图撒点（为了不让玩家从家跑到战场），但那样会出现「在敌方
   * 半场、甚至敌人家门口复活」的情况，玩家刚站起来就被人从背后打死，规则上
   * 说不通。全图选点整条链路已经删掉（2026-11-13），真人和人机统一走
   * `pickHomeSpawn`。
   */
  private respawnPlayer(): void {
    const spawn = this.pickHomeSpawn(this.player.team);
    // 横向 ±0.8 的落脚偏移：出生位只有 6 格，不加偏移的话每次复活都精确站在
    // 同一个坐标上，「又是这个点」的感觉比随机落点强得多。最外侧 ±7 离舷墙
    // 内壁（±10.6）还有 3.6 米，0.8 推不进任何几何体。只偏 x 不偏 z —— z 上
    // 一偏就可能站到出生线外，换枪窗口虽然按时间算，出生线仍然要保持整齐。
    const pos = new THREE.Vector3(spawn.x + rand(-0.8, 0.8), spawn.y, spawn.z);
    this.player.respawn(pos);
    this.player.yaw = this.spawnFacingYaw(this.player.team, pos);
    this.player.pitch = 0;
    // 重生是瞬移，自检的基准点要跟着重置，否则每次复活都报一条假警
    this.dbg.ready = false;
    this.viewModel.setWeapon(this.player.weapon);
  }

  /**
   * 人机复活：**和真人走同一套出生线选点**（本方最后面 + 掩体遮挡）。
   *
   * 曾经人机走全图撒点，理由是「8 个 Bot 全从家跑，中场会长时间空掉」。但玩家
   * 看到的是敌人在自己背后、甚至敌人家门口凭空冒出来 —— 规则上说不通，用户
   * 2026-11-13 明确要求人机也回己方复活点。交火节奏不能靠复活点作弊解决，
   * 该由 Bot 的寻路和推进速度负责。
   *
   * 选点后叠一点 ±0.5 的横移：出生线只有 6 个位，同分的几个 Bot 会精确重叠；
   * 最外侧 ±9 的位子离集装箱（x ≥ 10.4）还有 1.4 米，0.5 推不进箱子里。
   */
  private respawnBot(bot: Bot): void {
    const spawn = this.pickHomeSpawn(bot.team, bot);
    const pos = new THREE.Vector3(spawn.x + rand(-0.5, 0.5), spawn.y, spawn.z + rand(-0.5, 0.5));
    bot.respawn(pos, 3);
    // 和真人同一条规则：复活瞬间朝敌方复活点，而不是保留上一次的朝向
    bot.yaw = this.spawnFacingYaw(bot.team, pos);
  }

  /* ============================================================
     依赖注入
     ============================================================ */

  private readonly hooks: CombatHooks = {
    onActorHit: (target, attacker, head, damage, point, dir) => {
      // 血雾从**真实弹着点**喷出来，方向跟着弹道走 —— 这是「打在这儿了」的第一层
      this.effects.bloodBurst(point, dir, head);
      this.lastDamage.set(target.id, damage);

      // 第二层：被打中的**模型本身**要顿一下。血雾会飘走、hitmarker 会消失，
      // 只有身体的动作能证明这一发真的进去了（自己挨打走下面的 `hurt` 分支）
      if (target !== this.player) this.actorViewOf(target.id)?.playHit(head);

      // 联机：命中事实要发给所有人（血雾 + 命中标记 + 受击方向全靠它）。
      // 一条子弹一颗弹丸一条，霰弹贴脸会一次来 8 条 —— 队列有上限，见 `pushEvent`
      this.pushEvent({
        k: 'hit',
        a: attacker ? attacker.id : null,
        v: target.id,
        head,
        dmg: Math.round(damage),
        x: point.x,
        y: point.y,
        z: point.z,
        dx: dir.x,
        dy: dir.y,
        dz: dir.z,
      });

      // `target !== this.player` —— 自己的手雷炸到自己时 attacker 也是自己，
      // 那种情况不该弹「命中」标记（打在脚下不是命中别人）
      if (attacker === this.player && target !== this.player) {
        // 近战自己已经播过 `knifeHit`（更闷更重的一记），这里不能再叠枪械的「叮」，
        // 否则一刀砍中会同时响两个命中音，听起来像打了两下
        const melee = this.player.weapon === 'knife';
        if (melee) {
          // 刀砍进肉里要「顿」一下 —— 这 70ms 是打击感的核心，比震屏管用
          this.hitStop = Math.max(this.hitStop, MELEE_HITSTOP);
          this.feedback.melee = true;
        } else {
          // 子弹钻进身体的「噗」。`own` 绕过节流：这一声必须落地
          gameAudio.impact(point.x, point.y, point.z, 'flesh', { own: true });
        }
        // ⚠️ 命中标记和「叮」都**不在这里推**，见 `feedback` 的注释
        this.recordHit(head, point);

        // 命中那一刻手上「顶」一下：爆头比普通命中重近一倍。
        // 60ms 内只触发一次 —— AK 是 100ms 一发，如果每发都重置波形，
        // 连发命中会变成持续抖动（晕），而不是一下一下的触感
        const now = performance.now();
        if (now - this.lastHitShakeAt > 60) {
          this.lastHitShakeAt = now;
          this.player.addShake(head ? 0.2 : 0.11);
          // 命中顿感：镜头向下轻沉一下（COD 的 hit punch）。走 punch 通道，
          // 不碰 `aimPitch` —— 弹道零影响，衰减自动回弹；爆头沉得更狠
          this.player.addPunch(head ? -0.45 : -0.28, 0);
        }
      }
      if (target === this.player) {
        gameAudio.impact(point.x, point.y, point.z, 'flesh', { own: true });
        // 挨打要抖一下：这是玩家唯一「不看血条也知道自己中枪了」的反馈
        this.player.addShake(Math.min(0.5, damage / 90));
        this.applyHitDirection(dir);
        this.options.onDamage?.(Math.min(1, damage / 45));

        // 记下伤害来源，HUD 那个弧形指示器要靠它。没有凶手（爆炸 / 摔落）
        // 时用弹道反方向推一个大概位置，否则挨了手雷完全不知道该往哪看
        if (attacker && attacker !== this.player) {
          this.damageFromX = attacker.pos.x;
          this.damageFromZ = attacker.pos.z;
        } else {
          this.damageFromX = this.player.pos.x - dir.x * 20;
          this.damageFromZ = this.player.pos.z - dir.z * 20;
        }
        this.damageFromUntil = performance.now() + DAMAGE_ARROW_MS;
        this.lastPlayerDamage = damage;
      }
    },

    onWorldHit: (point, normal, surface, dir) => {
      // `?debug=1` 时把每个弹着点打进控制台。这是**唯一能逐发核对散布**的入口：
      // 对着墙按住左键打一梭子，看这串坐标是否越打越散、停火后再点射是否重新收紧
      // （验收标准 1/2/3 就靠它，不用改代码也不用加临时面板）。
      if (DEBUG_ENABLED) {
        console.log(
          `[弹着] ${point.x.toFixed(3)}, ${point.y.toFixed(3)}, ${point.z.toFixed(3)}  surf=${surface}`,
        );
      }
      // 法线朝上 = 打在甲板 / 地面 / 箱顶上。地面和墙面要给不同的反馈：
      // 火花朝四周扬尘 vs 往崩方向崩火花，声音也从脆的「叮」换成闷的「噗」
      const ground = normal.y > 0.7;
      this.effects.spawnDecal(point, normal, surface);
      this.effects.impactSparks(point, normal, surface, ground);
      // 弹着点「亮一下」40ms：连续交火时弹孔和火花都偏暗，玩家要靠这一点光
      // 才看得清自己打在箱子 / 甲板 / 钢板上（三者颜色不同）
      this.effects.spawnImpactFlash(point, normal, surface);
      gameAudio.impact(point.x, point.y, point.z, surface, { ground });
      if (Math.random() < 0.18) gameAudio.ricochet(point.x, point.y, point.z);

      // 联机：弹孔 / 火花 / 弹着闪光在加入者那边是**本地重建**的（只发一个坐标），
      // 一帧最多发 `MAX_NET_IMPACTS` 个 —— 8 个人机对枪时一帧能出几十个
      if (this.net && this.netImpacts < MAX_NET_IMPACTS) {
        this.netImpacts += 1;
        this.pushEvent({
          k: 'imp',
          x: Math.round(point.x * 100) / 100,
          y: Math.round(point.y * 100) / 100,
          z: Math.round(point.z * 100) / 100,
          nx: Math.round(normal.x * 100) / 100,
          ny: Math.round(normal.y * 100) / 100,
          nz: Math.round(normal.z * 100) / 100,
          sf: surface === 'wood' ? SURFACE_WOOD : 0,
          g: ground,
        });
      }
      void dir;
    },

    onKill: (attacker, victim, weapon, head) => {
      this.pushFeed(attacker, victim, weapon, head);

      const scorer = attacker && attacker !== victim ? attacker : null;
      if (scorer) this.score[scorer.team] += 1;

      // 联机：播报和比分。比分另有一份在快照里，这条只负责右上角那一行字
      this.pushEvent({
        k: 'kill',
        a: attacker && attacker !== victim ? attacker.id : null,
        v: victim.id,
        w: weaponToIndex(weapon),
        head,
      });
      // 死者是某个加入者：把死亡信息卡要的内容单独发一条（只有他自己用得到）
      if (victim instanceof Player && !victim.isPlayer) {
        const killer = attacker && attacker !== victim ? attacker : null;
        this.pushEvent({
          k: 'death',
          v: victim.id,
          a: killer ? killer.id : null,
          w: weaponToIndex(weapon),
          head,
          d: killer
            ? Math.round(Math.hypot(killer.pos.x - victim.pos.x, killer.pos.z - victim.pos.z))
            : 0,
          dmg: Math.round(this.lastDamage.get(victim.id) ?? 0),
        });
      }

      // 尸体往哪边倒、武器往哪边飞：用「从击杀者指向死者」这个水平方向。
      // 枪和刺刀都成立 —— 子弹沿这条线打进身体，刺击沿这条线把人顶退，
      // 「挨了哪一刀就往哪边倒」不需要任何武器特判
      const pushX = attacker && attacker !== victim ? victim.pos.x - attacker.pos.x : 0;
      const pushZ = attacker && attacker !== victim ? victim.pos.z - attacker.pos.z : 0;

      this.spawnCorpseAndWeapon(victim, pushX, pushZ);

      if (attacker === this.player && victim !== this.player) {
        this.killStreak += 1;
        // 只记账，不发声也不弹图标 —— 由 `flushFeedback` 一帧发一次。
        // 连杀数已经加过了，所以一帧三杀时图标直接显示 ×3
        const fb = this.feedback;
        fb.kills += 1;
        fb.head = fb.head || head;
        fb.weapon = weapon;
        fb.tier = 'kill';
      }
      if (victim === this.player) {
        this.beginPlayerDeath(attacker, weapon, head);
      }

      this.checkMatchEnd();
    },

    onShot: (shooter, weapon, origin, dir, endT) => {
      // 联机：**所有人的枪声都要广播**，包括本机玩家自己 —— 加入者要看到房主那一枪的
      // 火光和曳光。放在「自己就返回」之前，否则房主开枪加入者那边永远是静悄悄的
      this.pushEvent({
        k: 'shot',
        id: shooter.id,
        w: weaponToIndex(weapon),
        ox: Math.round(origin.x * 100) / 100,
        oy: Math.round(origin.y * 100) / 100,
        oz: Math.round(origin.z * 100) / 100,
        dx: Math.round(dir.x * 1000) / 1000,
        dy: Math.round(dir.y * 1000) / 1000,
        dz: Math.round(dir.z * 1000) / 1000,
        t: Math.round(endT * 10) / 10,
      });

      // 听觉：所有 Bot 都「听到」这一枪（含本机玩家开的枪，必须在下面的
      // self 早退之前）。只对敌方射手、且限距内感兴趣 —— 这是 Bot 主动
      // 找人最主要的情报来源，没有它 Bot 只能靠巡逻撞见人。
      for (const bot of this.bots) bot.hearShot(shooter);

      // 自己的枪在 handleFire 里已经响过、画过曳光了，这里只处理别人
      if (shooter === this.player) return;
      // 弹头擦身声：别人的枪才有意义（自己的枪不可能擦过自己）
      this.playWhiz(origin, dir, endT > 0 ? endT : 60);
      // 射手的第三人称模型播开火动画（Fire 剪辑；找不到视图/无动画就静默跳过）
      this.actorViewOf(shooter.id)?.playFire();
      const spec = WEAPONS[weapon];
      const feel = weaponFeel(weapon);

      // ⚠️ 这里的 `dir` 是**这一发实际打出去的方向（含散布）**，不是射手的基础
      // 朝向 —— `fireWeapon` 把每颗弹丸的真实方向放在结果里回传。拿基础朝向画
      // 曳光会让所有观察到的弹道都收束到一条中心线上（「子弹全打在一个点」）。

      // 枪口位置和玩家 handleFire 的几何近似兜底同一套公式：
      // 视线前推 0.6 米 + 右向量 (cos yaw, 0, -sin yaw) × 0.16 再压低 0.12。
      // 火光和曳光共用一个起点，看起来才是「从枪口喷出去的一条线」
      const muzzle = {
        x: origin.x + dir.x * 0.6 + Math.cos(shooter.yaw) * 0.16,
        y: origin.y + dir.y * 0.6 - 0.12,
        z: origin.z + dir.z * 0.6 - Math.sin(shooter.yaw) * 0.16,
      };

      if (spec.sound) {
        gameAudio.shot(spec.sound, {
          x: origin.x,
          y: origin.y,
          z: origin.z,
        });
      }
      // 别人的枪口焰也按他那把枪的口径走 —— 听见远处一声闷响 + 看见一团大火光，
      // 就能判断出「那边是 AWM 还是 M4」。
      // ⚠️ 深度测试必须开、点光必须关：这是别人位置的火光，没有阴影的点光会穿过
      // 掩体把这一侧照出一团光，加上透墙的 Sprite 就是「隔着箱子看火光找人」
      this.effects.spawnMuzzleFlash(muzzle, dir, {
        scale: feel.flashScale,
        life: feel.flashLife,
        depthTest: true,
        light: false,
      });

      // 曳光终点用本次击发的真实命中距离（调用方从 fireWeapon 结果里取最远的
      // t 传进来），没打中任何东西就画到默认射程 —— 与玩家自己那条曳光同款
      // 的 60 / 90 规则，观察者看到的弹道和射手实际打出去的一致
      const shotEnd = endT > 0 ? Math.min(endT, 90) : 60;
      // 曳光分色：人机暖金、联机真人紫色（人机 id 固定 `bot-` 前缀，
      // 房主侧 Bot 对象全在 `this.bots` 里，用前缀判和加入者侧同一套规则）
      this.effects.spawnTracer(
        muzzle,
        {
          x: origin.x + dir.x * shotEnd,
          y: origin.y + dir.y * shotEnd,
          z: origin.z + dir.z * shotEnd,
        },
        shooter.id.startsWith('bot-') ? TRACER_COLOR_BOT : TRACER_COLOR_HUMAN,
      );
    },
  };

  /* ============================================================
     命中 / 击杀反馈的合并与投递
     ============================================================ */

  /** 联机：往「下一次快照」里塞一条表现事件。队列有上限，满了丢最老的。 */
  private pushEvent(event: NetEvent): void {
    if (!this.net || this.netRole !== 'host') return;
    this.netEvents.push(event);
    if (this.netEvents.length > MAX_NET_EVENTS) this.netEvents.shift();
  }

  /** 联机：记一下每个角色最近一次挨了多少伤害（死亡信息卡要用）。 */
  private readonly lastDamage = new Map<string, number>();

  /** 记一次「我打中了」。同一帧多次调用只保留最高档 + 第一个命中点。 */
  private recordHit(head: boolean, point: Point3): void {
    const fb = this.feedback;
    // 已经是 kill 就不降级：一枪穿透打死两个人时，第二个回调不该把档位改回 hit
    if (fb.tier !== 'kill') fb.tier = head ? 'head' : 'hit';
    if (!fb.point) fb.point = point;
  }

  private readonly spotTmp = new THREE.Vector3();

  /**
   * 世界坐标 → 屏幕 NDC（-1..1），夹在准星附近（见 `SPOT_LIMIT`）。
   *
   * 相机矩阵在 `updateCamera` 里只改了 position / rotation，矩阵本身要等渲染器
   * 更新；这里手动刷一次，否则拿到的是上一帧的投影 —— 快速转身时标记会甩出去。
   */
  private projectSpot(point: Point3): { x: number; y: number } | undefined {
    this.camera.updateMatrixWorld();
    this.spotTmp.set(point.x, point.y, point.z).project(this.camera);
    if (!Number.isFinite(this.spotTmp.x) || !Number.isFinite(this.spotTmp.y)) return undefined;
    return {
      x: clamp(this.spotTmp.x, -SPOT_LIMIT, SPOT_LIMIT),
      y: clamp(this.spotTmp.y, -SPOT_LIMIT, SPOT_LIMIT),
    };
  }

  /**
   * 把本帧攒下的反馈**一次性**推出去。每帧 `update` 末尾调一次。
   *
   * 顺序刻意是「命中标记 → 击杀」：击杀那一枪的标记本身就是 kill 档（红、粗、
   * 250ms），紧跟着的击杀音是第二拍。所以玩家感受到的是「红标 + 咚」，而不是
   * 白标闪一下再被红标盖掉。
   */
  private flushFeedback(): void {
    const fb = this.feedback;
    const tier = fb.tier;

    if (tier) {
      this.options.onHitMarker?.(tier, fb.point ? this.projectSpot(fb.point) : undefined);
      // 致死那一枪**只发击杀音**：再叠一声「叮」会糊成一声，反而听不出是击杀。
      // 近战同理 —— `knifeHit` 已经在 `player.ts` 里播过了
      if (tier !== 'kill' && !fb.melee) gameAudio.hitMark(tier === 'head');
    }

    if (fb.kills > 0 && this.player.alive) {
      // 玩家这一帧也死了（对枪互换）就只留播报和死亡卡，不再弹勋章 ——
      // 勋章正好压在死亡信息卡上，而且此时 `killStreak` 已经被清零了
      gameAudio.killConfirm(fb.head, this.killStreak);
      // 击杀的「手上一沉」：比命中重一档。取 max 语义（`addShake` 内部），
      // 所以这一发如果是爆头命中（0.2），不会被这条 0.12 顶掉
      this.player.addShake(KILL_CONFIRM_SHAKE);
      // 击杀 FOV pop：视野瞬间「睁大」再弹回来 —— COD 那种「确实收割了一个人」
      // 的确认感。只动主相机 FOV，不碰弹道；爆头走大档
      this.fovPop = fb.head ? 1.6 : 1.1;
      this.options.onKillFeedback?.({ head: fb.head, streak: this.killStreak, weapon: fb.weapon });
      // 双杀以上才播报：单杀已经有击杀音 + 勋章了，再弹一行字是噪音
      if (this.killStreak >= 2) this.options.onStreak?.(this.killStreak);
    }

    fb.tier = null;
    fb.point = null;
    fb.kills = 0;
    fb.head = false;
    fb.melee = false;
  }

  /* ============================================================
     死亡表现
     ============================================================ */

  /**
   * 枪模枪口对应的世界坐标。
   *
   * 枪模画在**独立的枪模相机**里（FOV 50，主相机默认 90 且开镜会变；枪模还不随
   * 俯仰旋转），所以「eye + 视线前移 + 固定偏移」这类手算在世界坐标里永远对不上
   * 屏幕上枪口画出来的位置 —— 开火抖动、走路摆动还会让它继续漂。正确做法是把
   * 枪模 muzzle 节点的 NDC 用**主相机**反投影回 `dist` 米处：特效起点和枪口在
   * 屏幕上严格重合，任何 FOV / 俯仰 / 动画状态下都不错位。
   *
   * 枪模缺失时回 null，调用方（player.handleFire）走几何近似兜底。
   */
  private readonly muzzleVec = new THREE.Vector3();

  private muzzleWorldPoint(dist = 0.6): Point3 | null {
    const ndc = this.viewModel.muzzleScreen();
    if (!ndc) return null;
    this.muzzleVec.set(ndc.x, ndc.y, 0.5).unproject(this.camera);
    // 反投影给出的是视锥面上的点；归一化后沿射线推进 dist 米才是特效该在的位置
    this.muzzleVec.sub(this.camera.position).normalize();
    return {
      x: this.camera.position.x + this.muzzleVec.x * dist,
      y: this.camera.position.y + this.muzzleVec.y * dist,
      z: this.camera.position.z + this.muzzleVec.z * dist,
    };
  }


  /**
   * 有人死了：定住倒地方向，武器脱手。
   *
   * 只处理 Bot —— 玩家没有第三人称模型，他的死亡表现在 `beginPlayerDeath` 里。
   * 用 `botViews.get()` 取不到就说明死者是玩家，这个判据比再传一个 `isPlayer`
   * 参数更省事，也不会有两边不同步的问题。
   */
  private spawnCorpseAndWeapon(victim: Actor, pushX: number, pushZ: number): void {
    const view = this.botViews.get(victim as Bot);
    if (!view) return;

    view.setDeathImpulse(pushX, pushZ);

    const length = Math.hypot(pushX, pushZ);
    const nx = length > 0.01 ? pushX / length : 0;
    const nz = length > 0.01 ? pushZ / length : -1;

    this.dropped.spawn(
      victim.weapon,
      { x: victim.pos.x + nx * 0.35, y: victim.pos.y + 1.05, z: victim.pos.z + nz * 0.35 },
      nx,
      nz,
      this.groundUnder(victim.pos),
    );
    gameAudio.gearDrop(victim.pos.x, victim.pos.y + 1, victim.pos.z);
  }

  /**
   * 脚底下的地面高度。
   *
   * 不能直接用 `actor.pos.y`：在箱子上被打死、或者死在跳跃过程中时，那个值
   * 是半空中的高度，武器会悬在那里。一条向下的射线比「记住每个落脚点」便宜得多。
   */
  private groundUnder(pos: { x: number; y: number; z: number }): number {
    const from = { x: pos.x, y: pos.y + 0.1, z: pos.z };
    const hit = rayWorld(from, { x: 0, y: -1, z: 0 }, 60, this.level.colliders);
    return hit ? Math.max(0, from.y - hit.t) : pos.y;
  }

  /**
   * 玩家被打死的那一瞬间。这里要做五件事，顺序都是有讲究的：
   *
   *   ① hit-stop —— 先让时间慢下来，后面几件事才「看得清」
   *   ② 武器脱手 —— 顺着视线甩到**前方**甲板上：倒地镜头是往前看的，
   *      枪必须落在视野里，否则「能看到自己武器掉地」这条验收根本无从谈起
   *   ③ 倒地相机接管 —— 从这里开始，画面里演的是「我倒了」，不是一块遮罩
   *   ④ 击杀信息卡 —— 谁、用什么、打哪儿、多远
   *   ⑤ 清掉受击方向弧标 —— 人都死了，再指着来源方向没有意义
   */
  private beginPlayerDeath(attacker: Actor | null, weapon: WeaponId, head: boolean): void {
    const player = this.player;

    this.killStreak = 0;
    this.heartbeatTimer = 0;
    this.buyOpen = false;
    this.damageFromUntil = 0;

    gameAudio.death(player.pos.x, player.pos.y, player.pos.z);
    gameAudio.fatalHit();
    player.addShake(0.7);

    // ① 接下来 80ms 整局按 0.6 倍速跑
    this.hitStop = DEATH_TIMELINE.hitStop;

    // ② 武器脱手
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    this.dropped.spawn(
      player.weapon,
      { x: player.pos.x + fx * 0.45, y: player.pos.y + 1.05, z: player.pos.z + fz * 0.45 },
      fx,
      fz,
      this.groundUnder(player.pos),
    );
    gameAudio.gearDrop(player.pos.x, player.pos.y + 1, player.pos.z);

    // ③ 倒地相机
    this.deathCam.begin(
      { x: player.pos.x, y: player.pos.y, z: player.pos.z },
      player.yaw,
      player.pitch,
      player.pos.y + player.eyeHeight,
      attacker,
    );

    // ④ 击杀信息卡
    const distance =
      attacker && attacker !== player
        ? Math.round(Math.hypot(attacker.pos.x - player.pos.x, attacker.pos.z - player.pos.z))
        : 0;
    // 自己炸死自己时 `attacker === player`：击杀卡要按「世界」写（killer = null），
    // 否则死亡界面会显示「被 你 用手雷击杀」—— 需求里「不能误报击杀者」就指这种情况
    const credited = attacker && attacker !== player ? attacker : null;
    const info: DeathInfo = {
      killer: credited ? credited.name : null,
      killerIsPlayer: credited ? credited.isPlayer : false,
      killerTeam: credited ? credited.team : player.team === 0 ? 1 : 0,
      weapon,
      head,
      distance,
      damage: Math.round(this.lastPlayerDamage),
    };
    this.options.onDeath?.(info);
  }

  /* ============================================================
     手雷
     ============================================================ */

  /**
   * 扔出一颗手雷。
   *
   * `owner` 是**投掷者**：本机玩家和网络对端都走这里（房主替加入者跑手雷）。
   * 之前是写死 `this.player` 的 —— 那样加入者扔的雷会从房主脚底下飞出去。
   */
  private throwGrenade(owner: Player, fuse: number): void {
    const origin = owner.eyePos;
    const yaw = owner.aimYaw;
    const pitch = owner.aimPitch;
    const speed = WEAPONS.grenade.throwSpeed ?? 17;

    const dirX = -Math.sin(yaw) * Math.cos(pitch);
    const dirY = Math.sin(pitch);
    const dirZ = -Math.cos(yaw) * Math.cos(pitch);

    const mesh = new THREE.Mesh(this.grenadeGeometry, this.grenadeMaterial);
    mesh.castShadow = true;

    const grenade: Grenade = {
      id: (this.grenadeSeq += 1),
      pos: new THREE.Vector3(origin.x + dirX * 0.5, origin.y + dirY * 0.5 - 0.05, origin.z + dirZ * 0.5),
      // 竖直方向额外加 2.6 m/s，让手雷有抛物线而不是直线飞出去
      vel: new THREE.Vector3(dirX * speed, dirY * speed + 2.6, dirZ * speed),
      fuse: Math.max(0.02, fuse),
      owner,
      mesh,
    };
    mesh.position.copy(grenade.pos);
    this.scene.add(mesh);
    this.grenades.push(grenade);
  }

  private updateGrenades(dt: number): void {
    for (let i = this.grenades.length - 1; i >= 0; i -= 1) {
      const grenade = this.grenades[i];
      grenade.fuse -= dt;
      grenade.vel.y -= GRAVITY * dt;

      const dx = grenade.vel.x * dt;
      const dy = grenade.vel.y * dt;
      const dz = grenade.vel.z * dt;
      const length = Math.hypot(dx, dy, dz);

      if (length > 0.0001) {
        const dir = { x: dx / length, y: dy / length, z: dz / length };
        // 多探 9cm（约等于手雷半径），撞上就沿法线反弹并损失能量
        const hit = rayWorld(grenade.pos, dir, length + 0.09, this.level.colliders);
        if (hit) {
          const travel = Math.max(0, hit.t - 0.09);
          grenade.pos.x += dir.x * travel;
          grenade.pos.y += dir.y * travel;
          grenade.pos.z += dir.z * travel;

          const dot = grenade.vel.x * hit.nx + grenade.vel.y * hit.ny + grenade.vel.z * hit.nz;
          grenade.vel.x = (grenade.vel.x - 2 * dot * hit.nx) * 0.42;
          grenade.vel.y = (grenade.vel.y - 2 * dot * hit.ny) * 0.42;
          grenade.vel.z = (grenade.vel.z - 2 * dot * hit.nz) * 0.42;
        } else {
          grenade.pos.x += dx;
          grenade.pos.y += dy;
          grenade.pos.z += dz;
        }
      }

      // 地面兜底：射线只打盒子，万一掉到甲板接缝里要能弹回来
      if (grenade.pos.y < 0.09) {
        grenade.pos.y = 0.09;
        grenade.vel.y *= -0.35;
        grenade.vel.x *= 0.7;
        grenade.vel.z *= 0.7;
      }

      grenade.mesh.position.copy(grenade.pos);
      grenade.mesh.rotation.x += dt * 6;
      grenade.mesh.rotation.z += dt * 4;

      if (grenade.fuse <= 0) {
        this.detonate(grenade);
        this.scene.remove(grenade.mesh);
        this.grenades.splice(i, 1);
      }
    }
  }

  private detonate(grenade: Grenade): void {
    const { pos } = grenade;
    gameAudio.explosion(pos.x, pos.y, pos.z);
    this.effects.spawnExplosion(pos);
    // 联机：加入者那边没有投掷物模拟，爆炸表现（火球 + 音效）靠这一条重建
    this.pushEvent({
      k: 'boom',
      x: Math.round(pos.x * 100) / 100,
      y: Math.round(pos.y * 100) / 100,
      z: Math.round(pos.z * 100) / 100,
    });

    grenadeBlast({ x: pos.x, y: pos.y, z: pos.z }, grenade.owner, this.actors, this.level.colliders, this.hooks);

    const distance = this.player.pos.distanceTo(pos);
    if (distance < 22) this.player.addShake((1 - distance / 22) * 0.9);
    // 离爆心 16m 内才有「被炸懵」：高频耳鸣 + 全屏白闪（震屏上面那条管）。
    // 14m 内拉满 —— COD 手雷近炸那种「耳朵里只剩一根针在响」
    if (distance < 16) {
      gameAudio.tinnitus(1 - distance / 16);
      this.options.onFlash?.(Math.min(1, (1 - distance / 14) * 1.15));
    }
  }

  /**
   * 加入者：把快照里的手雷行铺成画面上的球。
   *
   * 只在**出现 / 消失**时建/删 mesh，位置交给 `updateGrenadeViews` 每帧去追 ——
   * 快照 60Hz，逐帧都重建就没有平滑可言了。
   *
   * 消失即删：房主那边 `detonate` 之后这颗就不在 `grenades` 里了，而爆炸的
   * 火球和音效由同一帧的 `boom` 事件补上，两者同帧落地，看不到「球凭空没了」。
   */
  private syncGrenadeViews(wires: readonly GrenadeWire[] | undefined): void {
    const seen = new Set<number>();
    if (wires) {
      for (const wire of wires) {
        const id = num(wire, GRENADE_ID, -1);
        // 同 id 只认第一行：脏数据 / 重复行不该画出两颗
        if (id < 0 || seen.has(id)) continue;
        seen.add(id);
        const x = num(wire, GRENADE_X, 0);
        const y = num(wire, GRENADE_Y, 0);
        const z = num(wire, GRENADE_Z, 0);

        const existing = this.grenadeViews.get(id);
        if (existing) {
          existing.target.set(x, y, z);
          continue;
        }
        const mesh = new THREE.Mesh(this.grenadeGeometry, this.grenadeMaterial);
        mesh.castShadow = true;
        mesh.position.set(x, y, z);
        this.scene.add(mesh);
        this.grenadeViews.set(id, {
          mesh,
          pos: new THREE.Vector3(x, y, z),
          target: new THREE.Vector3(x, y, z),
        });
      }
    }

    for (const [id, view] of [...this.grenadeViews]) {
      if (seen.has(id)) continue;
      this.scene.remove(view.mesh);
      this.grenadeViews.delete(id);
    }
  }

  /**
   * 加入者：手雷画面副本的逐帧跟随。
   *
   * 一帧的位移在 60Hz 快照下不到 30cm，`damp` 用 30（≈33ms 收敛到 63%）：
   * 既吃掉网络抖动，又不至于让雷明显拖在真实位置后面。翻滚是纯装饰 ——
   * 两端各转各的，不追求一致。
   */
  private updateGrenadeViews(dt: number): void {
    for (const view of this.grenadeViews.values()) {
      view.pos.x = damp(view.pos.x, view.target.x, 30, dt);
      view.pos.y = damp(view.pos.y, view.target.y, 30, dt);
      view.pos.z = damp(view.pos.z, view.target.z, 30, dt);
      view.mesh.position.copy(view.pos);
      view.mesh.rotation.x += dt * 6;
      view.mesh.rotation.z += dt * 4;
    }
  }

  /**
   * 清掉所有手雷：房主那几颗**在飞的**（连同 mesh）、加入者那几颗画面副本。
   *
   * 开局、回模式页、退出联机、销毁引擎都要走这里 —— 不清的话上一局的雷会在
   * 新一局里继续飞、继续炸（房主侧），或者作为一团永远停在空中的球留在背景里
   * （加入者侧）。
   */
  private clearGrenades(): void {
    for (const grenade of this.grenades) this.scene.remove(grenade.mesh);
    this.grenades.length = 0;
    for (const view of this.grenadeViews.values()) this.scene.remove(view.mesh);
    this.grenadeViews.clear();
  }

  /* ============================================================
     播报 / 计分
     ============================================================ */

  private pushFeed(attacker: Actor | null, victim: Actor, weapon: WeaponId, head: boolean): void {
    this.feedCounter += 1;
    // 自炸自己：`attacker === victim`，这次死亡没有「别人」该背锅，
    // 必须按「世界」处理（killer = null），否则右上角会刷出「你 [手雷] 你」
    const credited = attacker && attacker !== victim ? attacker : null;
    this.feed.push({
      id: this.feedCounter,
      // 不写「世界」这种字面量：引擎里不该出现任何界面文案，
      // 显示成哪个词由 React 侧按语言决定
      killer: credited ? credited.name : null,
      victim: victim.name,
      weapon,
      head,
      killerTeam: credited ? credited.team : victim.team === 0 ? 1 : 0,
      victimTeam: victim.team,
      killerIsPlayer: credited ? credited.isPlayer : false,
      victimIsPlayer: victim.isPlayer,
      at: performance.now(),
    });
    if (this.feed.length > 6) this.feed.shift();
  }

  private buildRows(): ScoreRow[] {
    return this.actors
      .map((actor) => ({
        id: actor.id,
        name: actor.name,
        team: actor.team,
        kills: actor.kills,
        deaths: actor.deaths,
        alive: actor.alive,
        hp: Math.max(0, Math.round(actor.health)),
        isPlayer: actor.isPlayer,
        // 计分板上要能看出「这条是人机」—— 联机之后同名同姓的真人 / 人机并存
        isHuman: actor.isHuman,
      }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  }

  private checkMatchEnd(): void {
    if (this.finished) return;
    // 人头局才看比分。时长局里「打到 40 头」不结束 —— 那只是比分难看
    if (this.rules.endMode !== 'kills') return;
    const reached = this.score[0] >= this.rules.killTarget || this.score[1] >= this.rules.killTarget;
    if (reached) this.finish();
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    this.input.enabled = false;
    this.input.exitLock();
    cancelAnimationFrame(this.rafId);
    gameAudio.setVolume(0);

    // 联机：**最后一份快照必须发出去**（带 `f` 位）。循环在这里停了，之后不会
    // 再有快照，漏掉这一发加入者就永远等不到结算（需求三.7「结束后停止接受加入」）
    if (this.netRole === 'host') this.net?.broadcastSnapshot(this.buildSnapshot());

    const rows = this.buildRows();
    const mvp = rows.find((row) => row.kills > 0) ?? null;
    const result: MatchResult = {
      win: this.score[0] > this.score[1],
      draw: this.score[0] === this.score[1],
      scoreA: this.score[0],
      scoreB: this.score[1],
      rows,
      mvp,
    };
    this.options.onFinish(result);
  }

  /* ============================================================
     联机：挂接与收尾
     ============================================================ */

  /**
   * 挂上一个联机会话。
   *
   * 房主：世界**原样保留** —— 开局就是「房主 + 4 人机 vs 5 人机」这 10 个人，
   * 正好是需求要的初始阵容，一个人机都不用额外生成。
   *
   * 加入者：把本地的人机全清掉（它们是假的，真正的角色从快照来），
   * 只留自己的 `player` 当相机载体。
   *
   * @param selfActorId 房主分配给自己那个角色的 id（加入者才有意义）
   * @param initialSnapshot 回执里带来的那份快照。加入者必须靠它摆位 —— 房主的下
   *   一帧快照要等 50ms，不先用这份的话开局那一下会站在房主世界的原点
   */
  attachNet(session: ShipNetSession, selfActorId = 'player', initialSnapshot?: Snapshot): void {
    this.net = session;
    this.netRole = session.role;
    this.selfActorId = selfActorId;
    if (initialSnapshot) this.latestSnapshot = initialSnapshot;

    const callbacks = session.callbacks;
    callbacks.onJoinRequest = (peerId, team, name) => this.admitGuest(peerId, team, name);
    callbacks.onInput = (peerId, input) => this.receiveInput(peerId, input);
    callbacks.onLoadout = (peerId, primary) => this.receiveLoadout(peerId, primary);
    callbacks.onSnapshot = (snapshot) => {
      this.latestSnapshot = snapshot;
    };
    callbacks.onPeerLeave = (peerId) => this.dropGuest(peerId);
    callbacks.onPeerJoin = (peerId) => {
      if (this.netRole === 'host') this.broadcastRoster(peerId);
    };

    if (session.role === 'guest') this.enterGuestMode();
    else this.broadcastRoster();
  }

  /** 退出联机（回开始界面 / 换房间）。房主的世界不动，加入者恢复成单人那 10 个人。 */
  detachNet(): void {
    const wasGuest = this.netRole === 'guest';
    for (const peerId of [...this.links.keys()]) this.dropGuest(peerId);
    this.links.clear();
    this.net = null;
    this.netRole = null;
    this.latestSnapshot = null;
    this.appliedSnapshotSeq = -1;
    this.netEvents = [];
    this.netFireFeelCd = 0;
    this.pendingReplicaViews.clear();
    if (wasGuest) {
      // 房主世界里的那几颗雷跟这张联机会话一起结束，别留在还原出来的单人局里
      this.clearGrenades();
      this.restoreSinglePlayer();
    }
  }

  /** 改本机玩家的显示名（联机面板里改名之后立刻生效，不用重建引擎）。 */
  setPlayerName(name: string): void {
    const clean = name.trim().slice(0, 16);
    if (!clean) return;
    this.player.name = clean;
    if (this.netRole === 'host') this.broadcastRoster();
  }

  /** 加入者退出联机后，把世界还原成本地规则下的单人对局（人机数按 `teamSize`）。 */
  private restoreSinglePlayer(): void {
    for (const id of [...this.replicas.keys()]) this.removeReplica(id);
    this.actors.length = 0;
    this.actors.push(this.player);
    this.player.netCanLoadout = null;
    this.player.alive = true;
    this.player.deathTime = 0;
    this.deathCam.reset();
    this.respawnPlayer();
    if (this.bots.length === 0) this.spawnBots();
    for (const bot of this.bots) this.respawnBot(bot);
    this.updateCamera(1 / 60);
  }

  /**
   * 人数自检：场上角色数必须等于 `2 × rules.teamSize`。
   *
   * 人数不再是一个写死的 10，档位全按 `teamSize` 走（1v1 ~ 6v6）。这条断言不改变任何行为，
   * 只在那条约束被破坏时立刻在控制台喊一声 —— 人数错了在画面上不一定看得出来
   * （多一个或少一个都是人堆里的一团影子）。
   */
  private assertRoster(tag: string): void {
    const expected = this.rules.teamSize * 2;
    if (this.actors.length === expected) return;
    console.warn(`[h5-net] 场上角色数 ${this.actors.length} ≠ ${expected}（${tag}）`);
  }

  /* ============================================================
     联机：房主侧（准入 / 输入 / 广播）
     ============================================================ */

  /**
   * 准入一个人 —— **整段是一次完整操作**（需求三.8）。
   *
   * 顺序是刻意的：先摘人机（模型、碰撞体、名字一起走），再放真人，最后才生成
   * 快照并回执。任何一步失败都直接 `reject`，场上不会出现「真人已加入但人机
   * 没移除」的中间态；重复点击同一个人会被 `already-joined` 挡掉，不会生成第二个角色。
   */
  private admitGuest(peerId: string, team: Team, name: string): void {
    const session = this.net;
    if (!session) return;
    if (this.finished) {
      session.reject(peerId, 'match-ended');
      return;
    }
    if (this.links.has(peerId)) {
      session.reject(peerId, 'already-joined');
      return;
    }
    const bot = this.bots.find((candidate) => candidate.team === team);
    if (!bot) {
      // 这个阵营已经没有可替换的人机 = 满了（需求三.5）
      session.reject(peerId, 'team-full');
      return;
    }

    const id = `guest-${peerId.slice(0, 6)}`;
    // 新加入的真人还没进 `actors`，没有「自己」要排除
    const spawn = this.pickHomeSpawn(team, null);
    const primary = primaryOf(bot.weapon);

    // ① 摘人机
    this.removeBot(bot);

    // ② 放真人：站在本方**安全复活点**（掩体后、远离交火），朝敌方复活点
    const player = new Player({ id, name, team, local: false, primary });
    player.respawn(spawn);
    player.yaw = this.spawnFacingYaw(team, spawn);
    player.pitch = 0;

    const view = createActorView(team, 'human', primary);
    view.group.position.copy(player.pos);
    view.group.visible = true;
    this.scene.add(view.group);

    const deps: PlayerDeps = {
      actors: this.actors,
      colliders: this.level.colliders,
      nav: this.level.nav,
      hooks: this.hooks,
      effects: this.effects,
      // 网络对端没有第一人称枪模，走 `handleFire` 里的几何近似兜底
      muzzlePoint: () => null,
      // 别人的枪模不在本机，切枪不需要任何表现
      onWeaponChange: () => undefined,
      onThrowGrenade: (fuse) => this.throwGrenade(player, fuse),
    };

    this.links.set(peerId, {
      peerId,
      player,
      view,
      deps,
      forward: 0,
      right: 0,
      walk: false,
      fire: false,
      aim: false,
      actions: new Set<InputAction>(),
      firePressed: false,
      aimPressed: false,
      yaw: player.yaw,
      pitch: 0,
      lastInputAt: performance.now(),
    });
    this.actors.push(player);

    // ③ 快照要在替换**之后**生成：加入者拿到的第一帧就是场上现状（需求六.2）
    session.admit(peerId, id, team, this.buildSnapshot());
    this.broadcastRoster();
    this.assertRoster('admit');
  }

  /**
   * 移除一个加入者，并在**原阵营补回 1 名人机**（需求四.1）。
   *
   * 补位的人机站在他离开的位置，而不是出生点：这样场上人数的变化不会顺带
   * 改变阵型，也不会出现「刚补的人机从对面半场跑过来」。
   */
  private dropGuest(peerId: string): void {
    const link = this.links.get(peerId);
    if (!link) return;
    this.links.delete(peerId);
    this.scene.remove(link.view.group);
    link.view.dispose();
    const index = this.actors.indexOf(link.player);
    if (index >= 0) this.actors.splice(index, 1);
    this.lastDamage.delete(link.player.id);

    const spawn = new THREE.Vector3(
      link.player.pos.x,
      this.groundUnder(link.player.pos),
      link.player.pos.z,
    );
    this.addBot(link.player.team, spawn, link.player.primary);
    this.broadcastRoster();
    this.assertRoster('drop');
  }

  /** 收到一帧输入。只改状态，真正的推进在 `updateRemotePlayers` 里。 */
  private receiveInput(peerId: string, input: InputWire): void {
    const link = this.links.get(peerId);
    if (!link) return;
    link.lastInputAt = performance.now();
    if (Number.isFinite(input.y)) link.yaw = input.y;
    if (Number.isFinite(input.p)) link.pitch = input.p;
    link.forward = clamp(Number(input.f) || 0, -1, 1);
    link.right = clamp(Number(input.r) || 0, -1, 1);

    const keys = typeof input.k === 'number' ? input.k : 0;
    link.walk = (keys & IN_WALK) !== 0;
    link.fire = (keys & IN_FIRE) !== 0;
    link.aim = (keys & IN_AIM) !== 0;
    if (keys & IN_FIRE_PRESSED) link.firePressed = true;
    if (keys & IN_AIM_PRESSED) link.aimPressed = true;

    if (keys & IN_JUMP) link.actions.add('jump');
    if (keys & IN_RELOAD) link.actions.add('reload');
    if (keys & IN_SLOT_PRIMARY) link.actions.add('slotPrimary');
    if (keys & IN_SLOT_SECONDARY) link.actions.add('slotSecondary');
    if (keys & IN_SLOT_MELEE) link.actions.add('slotMelee');
    if (keys & IN_SLOT_THROWABLE) link.actions.add('slotThrowable');
    if (keys & IN_CYCLE_NEXT) link.actions.add('cycleNext');
    if (keys & IN_CYCLE_PREV) link.actions.add('cyclePrev');
    if (keys & IN_QUICK_SWITCH) link.actions.add('quickSwitch');
    if (keys & IN_QUICK_GRENADE) link.actions.add('quickGrenade');

    // 🔴 房主切到后台时 rAF 会被浏览器停掉，但输入帧还在进来 —— 用它把世界推下去，
    // 否则加入者的切枪 / 换弹 / 命中全都没有下家（见 `stepWhileHidden`）
    this.stepWhileHidden();
  }

  /** 加入者换了主武器。资格由房主再判一次（UI 只是跟随显示）。 */
  private receiveLoadout(peerId: string, primary: PrimaryId): void {
    const link = this.links.get(peerId);
    if (!link) return;
    if (!link.player.canChangeLoadout) return;
    link.player.setPrimary(primary, link.deps);
  }

  /**
   * 推进所有网络对端的角色。
   *
   * 它们跑的是**同一个 `Player.update`** —— 所以移动、射击、换弹、近战、扔雷
   * 的手感和规则和本机玩家完全一致（需求六.3）。
   */
  private updateRemotePlayers(dt: number): void {
    if (this.links.size === 0) return;
    const now = performance.now();
    for (const link of this.links.values()) {
      // 输入断流：把移动轴和开火归零，但**不踢人** —— 人还站在那儿
      const stale = now - link.lastInputAt > INPUT_STALE * 1000;
      // 把攒下的离散动作**整体换出来**给这一帧用，link 换个新 Set 继续攒。
      // 🔴 之前是「同一个引用先 clear() 再 update()」—— jump / 换弹 / 切枪 /
      // 扔雷走到 `handleActions` 手里永远是空集，加入者的跳跃就是这么没的
      const actions = link.actions;
      link.actions = new Set();
      const frame: InputFrame = {
        forward: stale ? 0 : link.forward,
        right: stale ? 0 : link.right,
        walk: link.walk,
        fire: stale ? false : link.fire,
        firePressed: stale ? false : link.firePressed,
        aim: link.aim,
        aimPressed: stale ? false : link.aimPressed,
        scoreboard: false,
        actions,
        // 视角是绝对角，由下面两行直接写进 player，不需要增量
        lookYaw: 0,
        lookPitch: 0,
      };
      link.firePressed = false;
      link.aimPressed = false;

      link.player.yaw = link.yaw;
      link.player.pitch = link.pitch;
      link.player.update(dt, frame, link.deps);
      link.view.sync(link.player, dt);
      if (!link.player.alive) link.view.setOpacity(1);
    }
  }

  private respawnRemote(link: NetLink): void {
    // 和本地玩家同一条规则：回本方出生线，不跨半场
    const spawn = this.pickHomeSpawn(link.player.team, link.player);
    link.player.respawn(spawn);
    link.player.yaw = this.spawnFacingYaw(link.player.team, spawn);
    link.player.pitch = 0;
    link.yaw = link.player.yaw;
    link.pitch = 0;
    link.view.setOpacity(1);
  }

  /**
   * 房主的出网：快照 + 名单 + 掉线判定。
   *
   * 快照 20Hz、名单 2Hz。掉线判定用「多久没收到输入」而不是 `onPeerLeave`：
   * 后者要等 ICE 超时，而这里 6 秒就能把位置补回人机（需求四.1/四.2）。
   */
  private publishNet(dt: number): void {
    const session = this.net;
    if (!session || this.netRole !== 'host') return;

    this.netSnapshotTimer += dt;
    if (this.netSnapshotTimer >= 1 / SNAPSHOT_HZ) {
      // -= 而不是 = 0：60Hz 下按 60fps 帧节拍量化，扣周期而不是清零，
      // 快照间隔才不会随帧长抖动漂移
      this.netSnapshotTimer -= 1 / SNAPSHOT_HZ;
      session.broadcastSnapshot(this.buildSnapshot());
      // 弹着点的配额按「一个快照窗口」算，不是按帧
      this.netImpacts = 0;
    }

    this.netRosterTimer += dt;
    if (this.netRosterTimer >= 1 / ROSTER_HZ) {
      this.netRosterTimer -= 1 / ROSTER_HZ;
      this.broadcastRoster();
    }

    const now = performance.now();
    for (const [peerId, link] of [...this.links]) {
      if (now - link.lastInputAt > PEER_TIMEOUT_MS) this.dropGuest(peerId);
    }
  }

  private buildSnapshot(): Snapshot {
    const actors = this.actors.map((actor) =>
      encodeActor(actor, this.flagsFor(actor), this.magFor(actor), this.grenadesFor(actor)),
    );
    const kills = this.rules.endMode === 'kills';
    const snapshot: Snapshot = {
      v: NET_VERSION,
      q: (this.netSeq += 1),
      // 人头局里 `t` 换语义：发**已用时**（正计时）。剩余时间在那种局里没有意义，
      // 而加入者的 HUD 顶部要显示的正是用时，不这么发就得再开一个字段
      t: kills ? Math.max(0, this.elapsed) : Math.max(0, this.timeLeft),
      // 目标人头随帧下发：加入者的结算判定和计分板都按房主这份走
      k: this.rules.killTarget,
      m: kills ? 1 : 0,
      s: [this.score[0], this.score[1]],
      a: actors,
    };
    // 在飞的手雷：加入者只拿它画球（伤害和爆炸都是房主算完的）。没人扔就
    // 不带这个字段 —— 平时大部分帧是空的，别为它付字节
    if (this.grenades.length > 0) {
      snapshot.g = this.grenades.map((grenade) => encodeGrenade(grenade.id, grenade.pos));
    }
    if (this.netEvents.length > 0) {
      snapshot.e = this.netEvents;
      this.netEvents = [];
    }
    if (this.finished) snapshot.f = true;
    return snapshot;
  }

  private flagsFor(actor: Actor): number {
    let flags = 0;
    if (actor.alive) flags |= F_ALIVE;
    if (actor.isHuman) flags |= F_HUMAN;
    if (actor instanceof Player) {
      if (actor.scoped) flags |= F_SCOPED;
      if (actor.reloading) flags |= F_RELOADING;
      if (actor.canChangeLoadout) flags |= F_LOADOUT;
      if (actor.onGround) flags |= F_GROUND;
    } else {
      // 人机不开镜、不换弹。`onGround` 是私有的 —— 副本只用它算走路相位，
      // 给 1 就够了（人机不会飞）
      flags |= F_GROUND;
    }
    return flags;
  }

  private magFor(actor: Actor): number {
    if (actor instanceof Player) return actor.currentAmmo.mag;
    return actor instanceof Bot ? actor.mag : 0;
  }

  private grenadesFor(actor: Actor): number {
    return actor instanceof Player ? actor.grenades : 0;
  }

  private buildRoster(): RosterWire {
    const teams: [TeamSlot, TeamSlot] = [
      { h: 0, b: 0 },
      { h: 0, b: 0 },
    ];
    for (const actor of this.actors) {
      if (actor.isHuman) teams[actor.team].h += 1;
      else teams[actor.team].b += 1;
    }
    return { v: NET_VERSION, o: !this.finished, t: teams, n: this.player.name };
  }

  private broadcastRoster(target?: string): void {
    this.net?.broadcastRoster(this.buildRoster(), target);
  }

  private buildNetHud(): NetHud | null {
    const session = this.net;
    const role = this.netRole;
    if (!session || !role) return null;

    const humans: [number, number] = [0, 0];
    const bots: [number, number] = [0, 0];
    for (const actor of this.actors) {
      if (actor.isHuman) humans[actor.team] += 1;
      else bots[actor.team] += 1;
    }

    return {
      role,
      code: session.code,
      humans,
      bots,
      peers: humans[0] + humans[1],
      // 房主：连上了但还没选阵营的人。加入者看不到这个数，给 0
      pending: role === 'host' ? Math.max(0, session.peers.size - session.admitted.size) : 0,
      open: !this.finished,
    };
  }

  /* ============================================================
     联机：加入者侧（副本）
     ============================================================ */

  private enterGuestMode(): void {
    // 本地这批人机是假的：真正场上有谁、在哪儿，全听房主的（席位多少也可能不同）
    for (const bot of [...this.bots]) this.removeBot(bot);
    this.actors.length = 0;
    this.actors.push(this.player);
    // 加入者的换枪资格由房主下发
    this.player.netCanLoadout = false;
    this.deathCam.reset();
  }

  /**
   * 加入者的主循环。
   *
   * 和房主那条最大的区别：**没有本地结算**。血量、比分、死亡全部来自快照。
   * 但「感觉」层面的两样东西必须本地零延迟，否则整局像泡在水里：
   *
   *   · 移动 —— 本地跑同一条移动物理（`updateNetMovement`），快照只用来对账
   *   · 开火表现 —— 枪声 / 枪口焰 / 后坐 / 曳光按下就播（`updateNetFireFeedback`）
   *
   * 事实（命中谁、掉多少血、比分）依旧等房主的快照回执 —— 那部分几十毫秒
   * 的延迟是权威模型的固有代价，局域网里换来的「所有人看到的场面一致」值这个价。
   */
  private updateGuest(dt: number): void {
    const frame = this.input.flush();

    if (frame.scoreboard !== this.scoreboardVisible) {
      this.scoreboardVisible = frame.scoreboard;
      this.options.onScoreboard?.(frame.scoreboard);
    }

    // 快照先吃：它可能刚告诉我们「你死了」，那这一帧就不该再动。
    // 对账本身在下面的 `reconcileSelf`，按真实时钟算，不依赖帧步长
    const snapshot = this.latestSnapshot;
    if (snapshot) {
      this.latestSnapshot = null;
      this.applySnapshot(snapshot);
    }

    if (frame.actions.has('buy')) {
      if (this.buyOpen) this.closeBuyMenu();
      else this.openBuyMenu();
    }
    if (this.buyOpen && !this.player.canChangeLoadout) this.closeBuyMenu();

    const frozen = this.buyOpen || this.menuOpen || this.deathCam.busy;
    if (this.player.alive && !frozen) {
      const lookFrame = this.scaleLookForAds(frame);
      this.player.look(lookFrame);
      this.lookDelta.yaw = lookFrame.lookYaw;
      this.lookDelta.pitch = lookFrame.lookPitch;
    } else {
      this.lookDelta.yaw = 0;
      this.lookDelta.pitch = 0;
    }

    // 移动预测：本地先跑（冻结期轴归零，和上行口径一致 —— 不然房主那边人已
    // 站定、这边还在滑）。对账在 `reconcileSelf`：速度放宽死区 + 裸快照目标，
    // 不是阻尼追快照。
    if (this.player.alive) {
      const moveFrame = frozen ? { ...frame, forward: 0, right: 0 } : frame;
      if (!frozen && moveFrame.actions.has('jump')) this.player.predictJump();
      this.player.updateNetMovement(dt, moveFrame, this.playerDeps);
    }
    this.reconcileSelf(dt);

    // 开火表现本地预测（枪声 / 枪口焰 / 后坐 / 曳光 / 破空声 / 挥砍动作）
    this.updateNetFireFeedback(dt, frame, frozen);

    // 挥砍的时间轴也在这里推进（只推画面，判定被 `meleeVisual` 关掉）
    this.player.advanceVisual(dt, this.playerDeps);

    // 上行：一次性动作攒起来，到点一次性发（60Hz）。
    // 开火 / 开镜的**边沿**不等节拍：那是玩家手感的临界事件，多等 8~16ms
    // 都能察觉 —— 按下的这一帧立刻把攒的上行冲出去
    for (const action of frame.actions) this.netActions.add(action);
    if (frame.firePressed) this.netFirePressed = true;
    if (frame.aimPressed) this.netAimPressed = true;
    if (frame.firePressed || frame.aimPressed) {
      this.netInputTimer = Math.max(this.netInputTimer, 1 / INPUT_HZ);
    }
    this.netInputTimer += dt;
    if (this.netInputTimer >= 1 / INPUT_HZ) {
      // -= 而不是 = 0：扣掉一个周期而不是清零，帧长抖动时上行节奏不漂移
      this.netInputTimer -= 1 / INPUT_HZ;
      // 冻结期间上行移动归零：不然加入者点着菜单，房主那边他还在满场跑
      this.sendInputNow(frozen ? { ...frame, forward: 0, right: 0, fire: false } : frame);
    }

    for (const replica of this.replicas.values()) replica.step(dt);
    // 积压视图补建（每帧最多 NET_VIEW_BUDGET 个）—— 必须在下面的 sync 循环前，
    // 新建的当帧就跟着转
    this.drainReplicaViews();
    for (const [id, view] of this.replicaViews) {
      const replica = this.replicas.get(id);
      if (!replica) continue;
      // 尸体淡出和房主那条 `updateBotViews` 同一套时间轴：房主 5 秒后补人机 /
      // 重生，快照里 `alive` 翻回来时 `sync` 自己会把透明度清掉 —— 这里只管
      // 「快复活了」的最后 0.9 秒，否则加入者看到的尸体是永远不会消失的硬块
      if (!replica.alive) {
        const left = BOT_CORPSE_LIFE - replica.deathTime;
        view.setOpacity(Math.max(0, left < CORPSE_FADE ? left / CORPSE_FADE : 1));
      }
      view.sync(replica, dt);
    }

    this.updateDropped(dt);
    // 对端手雷的画面副本（房主那几颗在 `update` 里由 `updateGrenades` 推进）
    this.updateGrenadeViews(dt);
    this.effects.update(dt);
    this.updateCamera(dt);
    this.updateViewModel(dt);
    this.updateHeartbeat(dt);
    this.flushFeedback();
  }

  private sendInputNow(frame: InputFrame): void {
    const session = this.net;
    if (!session || this.netRole !== 'guest') return;

    let keys = 0;
    if (frame.walk) keys |= IN_WALK;
    if (frame.fire) keys |= IN_FIRE;
    if (frame.aim) keys |= IN_AIM;
    if (this.netFirePressed) keys |= IN_FIRE_PRESSED;
    if (this.netAimPressed) keys |= IN_AIM_PRESSED;
    for (const action of this.netActions) {
      if (action === 'jump') keys |= IN_JUMP;
      else if (action === 'reload') keys |= IN_RELOAD;
      else if (action === 'slotPrimary') keys |= IN_SLOT_PRIMARY;
      else if (action === 'slotSecondary') keys |= IN_SLOT_SECONDARY;
      else if (action === 'slotMelee') keys |= IN_SLOT_MELEE;
      else if (action === 'slotThrowable') keys |= IN_SLOT_THROWABLE;
      else if (action === 'cycleNext') keys |= IN_CYCLE_NEXT;
      else if (action === 'cyclePrev') keys |= IN_CYCLE_PREV;
      else if (action === 'quickSwitch') keys |= IN_QUICK_SWITCH;
      else if (action === 'quickGrenade') keys |= IN_QUICK_GRENADE;
    }
    this.netActions.clear();
    this.netFirePressed = false;
    this.netAimPressed = false;

    this.netInputSeq += 1;
    session.sendInput({
      s: this.netInputSeq,
      y: Math.round(this.player.yaw * 1000) / 1000,
      p: Math.round(this.player.pitch * 1000) / 1000,
      f: Math.round(frame.forward * 100) / 100,
      r: Math.round(frame.right * 100) / 100,
      k: keys,
    });
  }

  /**
   * 加入者：开火表现的**本地预测**。
   *
   * 以前自己的枪声 / 枪口焰 / 后坐要等房主的 `shot` 回显事件 —— 那是完整的
   * 上行 + 房主模拟 + 快照回程（30Hz 时代 ≈ 100ms+），「按下到枪响」的延迟
   * 全在这。现在本地按武器节奏直接演，回显那边（`replayShot` 的自己分支）
   * 相应关掉，不会双响。
   *
   * 预测错了也只是一次「空枪响」（比如本地以为弹匣有货、房主刚好扣完）：
   * 弹匣数 60Hz 从快照镜像过来，错窗口只有十几毫秒，下一次就同步了。
   * 命中确认（hit 标记 / 血雾）**不**预测 —— 那是事实，必须等房主。
   */
  private updateNetFireFeedback(dt: number, frame: InputFrame, frozen: boolean): void {
    this.netFireFeelCd -= dt;
    if (frozen || !this.player.alive) return;

    const weapon = this.player.weapon;
    const spec = WEAPONS[weapon];
    // 手雷另有一条本地表现路（`playThrowView` 补演投掷），这里不掺和
    if (spec.kind === 'throwable') return;

    if (spec.kind === 'melee') {
      // 近战：轻击 = firePressed，重击 = 按住右键时的 aimPressed（和房主
      // `handleMelee` 同一套判定）。刀没有枪口焰，要补的是**整套挥砍动作 +
      // 破空声** —— 以前只补一声 whoosh，加入者按下攻击时刀一动不动
      const heavy = frame.aim;
      const wants = frame.firePressed || (heavy && frame.aimPressed);
      if (!wants || this.netFireFeelCd > 0) return;
      this.netFireFeelCd = heavy ? (spec.heavyInterval ?? 1) : spec.interval;
      // 纯画面：判定被 `meleeVisual` 关掉，命中/血量仍等房主的快照
      this.player.playMeleeView(heavy);
      return;
    }

    const wantsFire = spec.auto ? frame.fire : frame.firePressed;
    if (!wantsFire || this.netFireFeelCd > 0) return;
    // 空仓 / 换弹就不演了：演了就是凭空一声枪响，还和房主的自动装填对不上
    if (this.player.reloading || this.player.currentAmmo.mag <= 0) return;

    this.netFireFeelCd = spec.interval;
    this.playLocalShotFeedback(weapon);
  }

  /** 自己这一枪的本地表现。几何与单人 `handleFire` 的第一人称分支同源。 */
  private playLocalShotFeedback(weapon: WeaponId): void {
    const spec = WEAPONS[weapon];
    const feel = weaponFeel(weapon);
    const origin = this.player.eyePos;
    // 方向用本地视角（房主收到的就是这份绝对角，误差只有上行延迟那一小截；
    // 散布房主自己加，本地曳光沿视线画即可 —— 命中端的血雾/弹孔才是事实）
    const dir = dirFromAngles(this.player.aimYaw, this.player.aimPitch);
    const muzzle =
      this.muzzleWorldPoint(0.6) ?? {
        x: origin.x + dir.x * 0.6 + Math.cos(this.player.yaw) * 0.16,
        y: origin.y + dir.y * 0.6 - 0.12,
        z: origin.z + dir.z * 0.6 - Math.sin(this.player.yaw) * 0.16,
      };

    // 自己这一枪：枪口就在镜头前，关深度测试防止贴墙时火焰被墙切一半；
    // 点光也只给自己 —— 本机位置在相机这边，不存在「光从掩体后面漏过来」
    this.effects.spawnMuzzleFlash(muzzle, dir, {
      scale: feel.flashScale,
      life: feel.flashLife,
      depthTest: false,
      light: true,
    });
    // 本机玩家的曳光是紫色（人机保持暖金），单人同款
    this.effects.spawnTracer(
      muzzle,
      {
        x: muzzle.x + dir.x * 60,
        y: muzzle.y + dir.y * 60,
        z: muzzle.z + dir.z * 60,
      },
      TRACER_COLOR_HUMAN,
    );
    // 抛壳口：枪身右侧、比枪口近一点（单人同款）
    this.effects.ejectShells(
      {
        x: origin.x + Math.cos(this.player.yaw) * 0.24 + dir.x * 0.3,
        y: origin.y - 0.12,
        z: origin.z - Math.sin(this.player.yaw) * 0.24 + dir.z * 0.3,
      },
      this.player.yaw,
    );
    if (spec.sound) gameAudio.shot(spec.sound, { own: true });
    // 加入者不跑 `Player.handleFire`：连发计数、**视角后坐、连发累积散布**都要在这里补。
    // 后坐是「按下就顶上去」的那部分，必须本地预测 —— 等房主回执再顶，压枪会晚半拍；
    // 房主那边替这个玩家跑的 `Player` 也走同一条 `applyShotRecoil`，两边数值同源。
    this.player.registerBurstShot();
    this.player.applyShotRecoil();
    this.player.addPunch(feel.punchPitch, feel.punchRoll);
    const burstShake = this.player.recoilBurst * 0.055;
    if (feel.shake > 0 || burstShake > 0) this.player.addShake(Math.max(feel.shake, burstShake));
    this.viewModel.triggerKick(feel.kick, this.player.recoilBurst);
  }

  /** 加入者：把一帧快照铺到场上。 */
  private applySnapshot(snapshot: Snapshot): void {
    if (snapshot.q <= this.appliedSnapshotSeq) return;
    this.appliedSnapshotSeq = snapshot.q;

    this.score[0] = snapshot.s[0];
    this.score[1] = snapshot.s[1];
    // 结束方式先落地：它决定 `snapshot.t` 是「剩余」还是「已用」，下面两个字段
    // 各写各的。缺省（老帧没有 `m`）按按时长处理
    const hostKills = snapshot.m === 1;
    if (hostKills !== (this.rules.endMode === 'kills')) {
      this.rules = { ...this.rules, endMode: hostKills ? 'kills' : 'time' };
    }
    if (hostKills) {
      this.elapsed = snapshot.t;
    } else {
      this.timeLeft = snapshot.t;
    }
    // 房主定的目标人头。缺省（老帧）时保留本地值。
    // 换副本而不是原地改：`this.rules` 可能就是 React state 那个对象，
    // 悄悄改它的字段不会触发渲染，模式页的选项会停在旧值
    if (typeof snapshot.k === 'number' && snapshot.k > 0 && snapshot.k !== this.rules.killTarget) {
      this.rules = { ...this.rules, killTarget: snapshot.k };
    }

    const seen = new Set<string>();
    for (const wire of snapshot.a) {
      const id = str(wire, ACTOR_ID);
      seen.add(id);
      if (id === this.selfActorId) {
        this.mirrorSelf(wire);
        continue;
      }
      const existing = this.replicas.get(id);
      if (existing) {
        // 副本「换弹」位的边沿是别人换弹的唯一信号（布尔位，没有进度）：翻真
        // 补开头一声、翻假（装完）补收尾一声，都按他的最新坐标空间化。
        // 只放真人的：人机换弹不出声（用户要求，同 Bot 侧）。死亡角色会原样
        // 带着换弹位到重生，用「前后都活着」兜掉尸体上的误报
        const wasReloading = existing.reloading;
        const wasAlive = existing.alive;
        existing.apply(wire);
        if (existing.alive && wasAlive && existing.isHuman) {
          const at = { x: existing.pos.x, y: existing.pos.y + 1.4, z: existing.pos.z };
          if (existing.reloading && !wasReloading) {
            gameAudio.reload('out', at);
          } else if (wasReloading && !existing.reloading) {
            gameAudio.reload('in', at);
          }
        }
      } else {
        const replica = new ReplicaActor(wire);
        this.replicas.set(id, replica);
        // 视图不在这里建：中途加入一次涌入 9 个，全建就是一帧大尖峰。
        // 排进队列，`drainReplicaViews` 每帧补几个
        this.pendingReplicaViews.set(id, replica);
        this.actors.push(replica);
      }
    }

    // 角色消失（房主那边换了人 / 补了人机）：把副本连同模型一起清掉
    for (const id of [...this.replicas.keys()]) {
      if (!seen.has(id)) this.removeReplica(id);
    }

    // 在飞的手雷：加入者没有投掷物模拟，全靠这一行把球摆到房主算出来的位置上。
    // 放在事件之前：这一帧刚好爆炸的那颗先撤球，再演火球，不会出现「球穿着火球」
    this.syncGrenadeViews(snapshot.g);

    if (snapshot.e) {
      for (const event of snapshot.e) this.applyNetEvent(event);
    }
    if (snapshot.f) this.finishGuest();
  }

  private createReplicaView(replica: ReplicaActor): void {
    const view = createActorView(replica.team, replica.isHuman ? 'human' : 'bot', replica.weapon);
    view.group.position.copy(replica.pos);
    this.scene.add(view.group);
    this.replicaViews.set(replica.id, view);
  }

  /**
   * 把积压的副本视图分帧建出来。
   *
   * 顺序是**离本机最近的先建**：中途加入的第一眼看到的是眼前的人，远处那几个
   * 晚 80ms 出现根本注意不到。副本本身照常吃快照、照常推进 —— 只是「画」
   * 这一步晚几帧，命中/脚步/HUD 都不受影响（副本没视图就不上屏而已）。
   */
  private drainReplicaViews(): void {
    if (this.pendingReplicaViews.size === 0) return;
    const pending = [...this.pendingReplicaViews.entries()];
    pending.sort(
      (a, b) => a[1].pos.distanceToSquared(this.player.pos) - b[1].pos.distanceToSquared(this.player.pos),
    );
    for (const [id, replica] of pending.slice(0, NET_VIEW_BUDGET)) {
      this.pendingReplicaViews.delete(id);
      this.createReplicaView(replica);
    }
  }

  private removeReplica(id: string): void {
    // 可能还没排到建视图就消失了（房主补人机）：队列里也得摘掉，否则留着引用
    this.pendingReplicaViews.delete(id);
    const view = this.replicaViews.get(id);
    if (view) {
      this.scene.remove(view.group);
      view.dispose();
      this.replicaViews.delete(id);
    }
    const replica = this.replicas.get(id);
    if (replica) {
      this.replicas.delete(id);
      const index = this.actors.indexOf(replica);
      if (index >= 0) this.actors.splice(index, 1);
    }
  }

  /**
   * 把「我自己」那一行镜像到本地 `player` 上。
   *
   * ⚠️ 视角（`yaw` / `pitch`）**不从快照读** —— 那是本机即时操作的，房主只是
   * 抄一份去算弹道。读回来会让鼠标每 50ms 被拽一下。
   *
   * 位置同理走了本地预测：这里只做**落账**（把快照位置/速度存进基准，
   * 供 `reconcileSelf` 每帧对账），不再把本地位置往快照位置上拖。
   * `onGround` 也不从快照读 —— 它比位置还
   * 滞后一个管线，照抄会让刚起跳的人被「还在地上」的旧值骗出二段跳
   * （`predictJump` 就是这么误触发的）。
   */
  private mirrorSelf(wire: ActorWire): void {
    const player = this.player;
    const flags = num(wire, ACTOR_FLAGS, 0);
    const alive = (flags & F_ALIVE) !== 0;
    const wasAlive = player.alive;

    // 阵营和名字都是房主分配的：加入者的本地 `player` 构造时不知道自己是哪一边，
    // 不对齐的话计分板上「你」会挂在错误的那一列
    player.team = num(wire, ACTOR_TEAM, player.team) === 1 ? 1 : 0;
    player.name = str(wire, ACTOR_NAME, player.name);
    player.health = num(wire, ACTOR_HP, player.health);
    player.kills = num(wire, ACTOR_KILLS, player.kills);
    player.deaths = num(wire, ACTOR_DEATHS, player.deaths);
    player.height = clamp(num(wire, ACTOR_HEIGHT, 1.8), 0.9, 2);
    player.scoped = (flags & F_SCOPED) !== 0;
    const wasReloading = player.reloading;
    player.reloading = (flags & F_RELOADING) !== 0;
    // 加入者自己的换弹开头音：本地不跑 `startReload`（玩法在房主那边），快照里
    // 「换弹」位刚翻真时没人放那声「拔弹匣」，在这里补。死亡角色会原样带着
    // 换弹位，`alive` 兜一道
    if (player.reloading && !wasReloading && alive) gameAudio.reload('out');
    player.netCanLoadout = (flags & F_LOADOUT) !== 0;
    const wireGrenades = num(wire, ACTOR_GRENADES, player.grenades);
    // 加入者不跑本地玩法：快照里雷少了一颗 = 房主刚把他手里那颗扔出去了。
    // 在这里补演一次投掷动作，否则加入者扔雷时手里什么都不动（纯画面，不改弹数）
    if (player.weapon === 'grenade' && wireGrenades < player.grenades) player.playThrowView();
    player.grenades = wireGrenades;

    // 武器是**换着来的**（买枪 / 数字键 / 刀 / 雷），不是每帧同值：
    // 加入者不跑 `Player.update`，`onWeaponChange` 钩子永远不会走，
    // 不在这里换第一人称枪模的话，切刀切雷之后手里还端着步枪的模型。
    const wireWeapon = indexToWeapon(num(wire, ACTOR_WEAPON, 0));
    if (wireWeapon !== player.weapon) {
      player.weapon = wireWeapon;
      if (isPrimaryId(wireWeapon)) player.primary = wireWeapon;
      this.viewModel.setWeapon(wireWeapon);
      // 房主换武器 = 他那边已经 `cancelMelee()` —— 本地补演的挥砍跟着作废，
      // 否则刀刺到一半被切走，收势会挂在新武器的第一帧上
      player.cancelMeleeView();
    }
    player.setNetAmmo(wireWeapon, num(wire, ACTOR_MAG, 0));

    const x = num(wire, ACTOR_X, player.pos.x);
    const y = num(wire, ACTOR_Y, player.pos.y);
    const z = num(wire, ACTOR_Z, player.pos.z);

    /*
     * 快照落账：位置和速度存进基准，真正的对账在 `reconcileSelf` 里
     * **每帧连续**做（这里只记事实、不动位置 —— 在快照帧拽位置会和每帧的
     * 本地预测叠成 60Hz 锯齿）。
     *
     * 房主不发 vy：用相邻两帧快照的 y 差分估一个，**只**给硬就位时的 vel.y 用。
     * 差分对 y 离散完全不可信 —— 房主跨一级台阶那帧 y 瞬跳 0.3m，按 16ms 一算
     * 就是 18m/s 的假 vy（外推版就是被它送进自激振荡的），所以超过
     * `SELF_VY_EST_MAX` 一律估 0，不做夹幅：夹幅会把假值留着继续害人。
     */
    const now = performance.now();
    const snapDt = this.hasSelfMirror
      ? clamp((now - this.selfMirrorAt) / 1000, 1 / 120, 0.2)
      : 0;
    const rawVy = snapDt > 0 ? (y - this.selfMirrorBase.y) / snapDt : 0;
    const estVy = Math.abs(rawVy) <= SELF_VY_EST_MAX ? rawVy : 0;
    this.selfMirrorBase.set(x, y, z);
    this.selfMirrorVel.set(num(wire, ACTOR_VX, 0), estVy, num(wire, ACTOR_VZ, 0));
    this.selfMirrorAt = now;
    this.hasSelfMirror = true;

    if (!alive) {
      player.pos.set(x, y, z);
    }

    player.alive = alive;
    player.deathTime = num(wire, ACTOR_DEATH_TIME, 0);

    if (alive && !wasAlive) {
      // 房主已经让我复活了：位置**直接就位**（和副本那条 `apply(snap)` 同理，
      // 否则镜头会先从死亡点往复活点滑 100ms），镜头也当帧交还 —— **不做过渡**。
      // 速度清零：死亡瞬间的旧动量不该带进新生命
      player.deathTime = 0;
      player.pos.set(x, y, z);
      player.vel.set(0, 0, 0);
      player.onGround = true;
      // 房主快照不带视角，加入者的 yaw 是本地事实：复活这一帧按同一条规则
      // （面朝敌方复活点）自己纠一次，否则会保留死亡瞬间的朝向
      player.yaw = this.spawnFacingYaw(player.team, player.pos);
      player.pitch = 0;
      // 基准跟着复位：上面落账那步拿死亡期的旧 y 差分估出了一个野 vy，
      // 不清掉的话 reconcileSelf 头几帧会按它把人从复活点拽走
      this.selfMirrorBase.set(x, y, z);
      this.selfMirrorVel.set(0, 0, 0);
      this.selfMirrorAt = performance.now();
      this.deathCam.end();
    } else if (!alive && wasAlive) {
      this.beginGuestDeath();
    }
  }

  /**
   * 加入者的移动对账：**每帧连续纠偏**，目标 = 裸快照位置，死区随速度放宽。
   *
   * 设计要点（两代旧方案的教训都写死了，别改回去）：
   * · 纠偏必须逐帧做 —— 只在快照帧拽会和每帧推进的预测叠成 60Hz 锯齿，相机
   *   直接吃 `player.pos`，锯齿一比一上屏就是「一卡一卡」。
   * · 目标**不做速度外推** —— 外推目标会越过房主的真实位置冲进墙/台阶里；
   *   更致命的是垂直外推叠加「台阶差分假 vy」会自激振荡（见文件头演进史②）。
   *   外推缺的那段管线漂移改由**死区随速度放宽**来盖：死区 = 基础项 +
   *   0.08 × 快照速度，正常跑动（漂移 ≈ 管线 × 跑速 ≤ 0.8m）永远在死区内，
   *   纠偏只在真发散时才醒。
   * · 垂直**只有硬就位一条路**，没有轻拉：站地/楼梯本地地面物理就是事实，
   *   轻拉只会被差分噪声和台阶跳变拽出毛刺；就位阈值 1.6m 盖过「合法跳跃/
   *   坠落 × 管线」的最大瞬时差，不会误伤。
   */
  private reconcileSelf(dt: number): void {
    if (!this.hasSelfMirror || !this.player.alive) return;
    const p = this.player;

    const dx = this.selfMirrorBase.x - p.pos.x;
    const dyRaw = this.selfMirrorBase.y - p.pos.y;
    const dz = this.selfMirrorBase.z - p.pos.z;
    const drift = Math.hypot(dx, dz);

    // 硬错位（掉出世界被捞回 / 被外力挪 / 长时间断流）：房主权威直接就位。
    // 不挪 selfMirrorBase/At —— 基准永远来自相邻两帧**真实**快照，就位污染
    // 基准会让下一帧差分估出反号假 vy，正是上一版自激振荡的燃料
    if (Math.abs(dyRaw) > SELF_SNAP_Y || drift > SELF_SNAP_DIST) {
      p.pos.copy(this.selfMirrorBase);
      p.vel.copy(this.selfMirrorVel);
      return;
    }

    // 死区随快照速度放宽：跑得越快，「快照天然落后管线」造成的漂移越大
    const speed = Math.hypot(this.selfMirrorVel.x, this.selfMirrorVel.z);
    const dead = SELF_DRIFT_DEAD + speed * SELF_DEADZONE_PER_SPEED;
    if (drift > dead) {
      // 指数逼近（1 - e^(-k·dt)），和 math.damp 同一套，帧率无关
      const k = 1 - Math.exp(-SELF_CORRECT_RATE * dt);
      p.pos.x += dx * k;
      p.pos.z += dz * k;
    }
  }

  /**
   * 加入者被打死。和单人的 `beginPlayerDeath` 做同样四件事，但**不推击杀卡**：
   * 卡上的内容（谁、多远、什么枪）由房主随快照发来的 `death` 事件补。
   */
  private beginGuestDeath(): void {
    const player = this.player;
    this.killStreak = 0;
    this.heartbeatTimer = 0;
    this.buyOpen = false;
    this.damageFromUntil = 0;

    gameAudio.death(player.pos.x, player.pos.y, player.pos.z);
    gameAudio.fatalHit();
    player.addShake(0.7);
    this.hitStop = DEATH_TIMELINE.hitStop;

    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    this.dropped.spawn(
      player.weapon,
      { x: player.pos.x + fx * 0.45, y: player.pos.y + 1.05, z: player.pos.z + fz * 0.45 },
      fx,
      fz,
      this.groundUnder(player.pos),
    );

    // 击杀者传 null：加入者本地没有「击杀者的角色」这个概念（观战镜头退回原地）
    this.deathCam.begin(
      { x: player.pos.x, y: player.pos.y, z: player.pos.z },
      player.yaw,
      player.pitch,
      player.pos.y + player.eyeHeight,
      null,
    );
  }

  /* ============================================================
     联机：加入者侧的事件回放
     ============================================================ */

  private applyNetEvent(event: NetEvent): void {
    switch (event.k) {
      case 'shot':
        this.replayShot(event);
        break;

      case 'hit': {
        const point = { x: event.x, y: event.y, z: event.z };
        const dir = { x: event.dx, y: event.dy, z: event.dz };
        this.effects.bloodBurst(point, dir, event.head);
        this.lastDamage.set(event.v, event.dmg);
        // 加入者看到别人被打也要有受击动作（自己那一份走下面的 hurt 分支）
        if (event.v !== this.selfActorId) this.actorViewOf(event.v)?.playHit(event.head);

        if (event.v === this.selfActorId) {
          gameAudio.impact(point.x, point.y, point.z, 'flesh', { own: true });
          this.player.addShake(Math.min(0.5, event.dmg / 90));
          this.applyHitDirection(dir);
          this.options.onDamage?.(Math.min(1, event.dmg / 45));
          const attacker = event.a ? this.replicas.get(event.a) : null;
          if (attacker) {
            this.damageFromX = attacker.pos.x;
            this.damageFromZ = attacker.pos.z;
          } else {
            this.damageFromX = this.player.pos.x - dir.x * 20;
            this.damageFromZ = this.player.pos.z - dir.z * 20;
          }
          this.damageFromUntil = performance.now() + DAMAGE_ARROW_MS;
          this.lastPlayerDamage = event.dmg;
        } else if (event.a === this.selfActorId) {
          gameAudio.impact(point.x, point.y, point.z, 'flesh', { own: true });
          this.recordHit(event.head, point);
          // 和房主侧同一条限流规则（60ms），否则连发命中的震动会粘成一片
          const now = performance.now();
          if (now - this.lastHitShakeAt > 60) {
            this.lastHitShakeAt = now;
            this.player.addShake(event.head ? 0.2 : 0.11);
          }
        }
        break;
      }

      case 'kill': {
        this.pushFeedNet(event.a, event.v, indexToWeapon(event.w), event.head);
        if (event.a === this.selfActorId && event.v !== this.selfActorId) {
          this.killStreak += 1;
          const feedback = this.feedback;
          feedback.kills += 1;
          feedback.head = feedback.head || event.head;
          feedback.weapon = indexToWeapon(event.w);
          feedback.tier = 'kill';
        }
        break;
      }

      case 'imp': {
        const point = { x: event.x, y: event.y, z: event.z };
        const normal = { x: event.nx, y: event.ny, z: event.nz };
        const surface = event.sf === SURFACE_WOOD ? 'wood' : 'metal';
        this.effects.spawnDecal(point, normal, surface);
        this.effects.impactSparks(point, normal, surface, event.g);
        this.effects.spawnImpactFlash(point, normal, surface);
        gameAudio.impact(point.x, point.y, point.z, surface, { ground: event.g });
        break;
      }

      case 'death': {
        if (event.v !== this.selfActorId) break;
        const killer = event.a ? this.actorIdentity(event.a) : null;
        const info: DeathInfo = {
          killer: killer ? killer.name : null,
          killerIsPlayer: false,
          killerTeam: killer ? killer.team : this.player.team === 0 ? 1 : 0,
          weapon: indexToWeapon(event.w),
          head: event.head,
          distance: event.d,
          damage: event.dmg,
        };
        this.options.onDeath?.(info);
        break;
      }

      case 'boom': {
        const point = { x: event.x, y: event.y, z: event.z };
        this.effects.spawnExplosion(point);
        gameAudio.explosion(point.x, point.y, point.z);
        const distance = this.player.pos.distanceTo(
          new THREE.Vector3(event.x, event.y, event.z),
        );
        if (distance < 22) this.player.addShake((1 - distance / 22) * 0.9);
        // 和房主 `detonate` 同一套「被炸懵」反馈 —— 加入者不能少一半
        if (distance < 16) {
          gameAudio.tinnitus(1 - distance / 16);
          this.options.onFlash?.(Math.min(1, (1 - distance / 14) * 1.15));
        }
        break;
      }

      case 'end':
        this.finishGuest();
        break;

      default:
        break;
    }
  }

  /** 加入者：把别人（或自己）那一枪画出来。 */
  private replayShot(event: Extract<NetEvent, { k: 'shot' }>): void {
    const weapon = indexToWeapon(event.w);
    const spec = WEAPONS[weapon];
    const feel = weaponFeel(weapon);
    const origin = { x: event.ox, y: event.oy, z: event.oz };
    const dir = { x: event.dx, y: event.dy, z: event.dz };

    // 枪口位置：视线前推 0.6 米再压低 0.12。和房主 `onShot` 里那条几何近似
    // 同一个式子（少一个右向偏移 —— 那个要射手的 yaw，快照里没带，差 16cm 看不出来）
    const muzzle = {
      x: origin.x + dir.x * 0.6,
      y: origin.y + dir.y * 0.6 - 0.12,
      z: origin.z + dir.z * 0.6,
    };

    if (event.id === this.selfActorId) {
      // 自己这一枪**不再回放**：按下那一刻本地已经按武器节奏即时演过了
      // （`updateNetFireFeedback`）。这里再播一遍就是一声双响 + 一发双曳光，
      // 还比本地那版多等整整一条回路。房主这帧的真正价值在 `hit` / `imp`
      // 事件里 —— 命中确认和弹着点照样走权威回执。
      return;
    }

    if (spec.sound) gameAudio.shot(spec.sound, { x: origin.x, y: origin.y, z: origin.z });
    // 开枪那个人的第三人称模型播开火动画（自己走上面那条第一人称分支）
    this.actorViewOf(event.id)?.playFire();
    // 别人的枪口焰：和房主 `onShot` 同一条规矩 —— 被箱子挡住，且不给场景点光
    this.effects.spawnMuzzleFlash(muzzle, dir, {
      scale: feel.flashScale,
      life: feel.flashLife,
      depthTest: true,
      light: false,
    });
    const endT = event.t > 0 ? Math.min(event.t, 90) : 60;
    // 曳光分色和房主 `onShot` 同一条规则：人机暖金、真人紫色（人机 id 固定
    // `bot-` 前缀，跨端确定，不依赖本机是否已建出副本）
    this.effects.spawnTracer(
      muzzle,
      {
        x: origin.x + dir.x * endT,
        y: origin.y + dir.y * endT,
        z: origin.z + dir.z * endT,
      },
      event.id.startsWith('bot-') ? TRACER_COLOR_BOT : TRACER_COLOR_HUMAN,
    );
    // 加入者侧的弹头擦身声（房主侧在 `onShot` 钩子里，两端听感要一致）
    this.playWhiz(origin, dir, endT);
  }

  /** 按角色 id 找它的第三人称视图（挂 Fire 动画用；找不到就静默跳过）。 */
  private actorViewOf(id: string): ActorView | null {
    for (const [bot, view] of this.botViews) {
      if (bot.id === id) return view;
    }
    for (const link of this.links.values()) {
      if (link.player.id === id) return link.view;
    }
    return this.replicaViews.get(id) ?? null;
  }

  /**
   * 被打中的**方向**也进镜头：子弹从左前方来，画面就往右倒一下。
   *
   * 用 `punchRoll`（绕视线滚转）而不是转 yaw —— 它不改变前向量，所以
   * 「被谁打」这件事有身体感，但准星和弹道的关系一点没变。
   * 幅度 1.2° 封顶，和受击震屏是两个通道（一个晃、一个倒）。
   */
  private applyHitDirection(dir: Point3): void {
    // 玩家右向量 = (cos yaw, 0, -sin yaw)；弹道在这个轴上的投影就是「从哪边来」
    const side = dir.x * Math.cos(this.player.yaw) - dir.z * Math.sin(this.player.yaw);
    this.player.addPunch(0, -side * 1.2);
  }

  /**
   * 弹头擦身而过的一声「啪」。
   *
   * 判定在**世界坐标**里做：把玩家的眼睛投影到弹道线段上，最近距离在
   * `WHIZ_RADIUS` 以内才播。这是玩家判断「刚才那枪是打我」的最本能信号 ——
   * 比屏幕上的红弧更早，也不需要抬头看。
   *
   * 只对「别人的枪」调用：自己开的枪不可能擦过自己。
   * `length` 是最远命中距离（打偏时调用方换成 60 米）。
   */
  private playWhiz(origin: Point3, dir: Point3, length: number): void {
    if (!this.player.alive) return;
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const ux = dir.x / len;
    const uy = dir.y / len;
    const uz = dir.z / len;

    const eye = this.player.eyePos;
    const dx = eye.x - origin.x;
    const dy = eye.y - origin.y;
    const dz = eye.z - origin.z;
    // 最近点在弹道上的参数（dir 已归一化）
    const t = dx * ux + dy * uy + dz * uz;
    // t < 0.6：枪口就贴着我，这一下该走受击/枪声，不是擦身
    if (t <= 0.6 || t > length) return;

    const dist = Math.hypot(dx - ux * t, dy - uy * t, dz - uz * t);
    if (dist > WHIZ_RADIUS) return;

    gameAudio.whiz(origin.x + ux * t, origin.y + uy * t, origin.z + uz * t, 1 - dist / WHIZ_RADIUS);
  }
  private actorIdentity(id: string): { name: string; team: Team } {
    if (id === this.selfActorId) return { name: this.player.name, team: this.player.team };
    const replica = this.replicas.get(id);
    return replica ? { name: replica.name, team: replica.team } : { name: '?', team: 0 };
  }

  /** 加入者的击杀播报：名字从副本里查，`isPlayer` 只认自己。 */
  private pushFeedNet(attackerId: string | null, victimId: string, weapon: WeaponId, head: boolean): void {
    const victim = this.actorIdentity(victimId);
    const attacker = attackerId ? this.actorIdentity(attackerId) : null;
    this.feedCounter += 1;
    this.feed.push({
      id: this.feedCounter,
      killer: attacker ? attacker.name : null,
      victim: victim.name,
      weapon,
      head,
      killerTeam: attacker ? attacker.team : victim.team === 0 ? 1 : 0,
      victimTeam: victim.team,
      killerIsPlayer: attackerId === this.selfActorId,
      victimIsPlayer: victimId === this.selfActorId,
      at: performance.now(),
    });
    if (this.feed.length > 6) this.feed.shift();
  }

  /** 加入者的结算：比分和名单都来自快照，不本地判胜负。 */
  private finishGuest(): void {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    this.input.enabled = false;
    this.input.exitLock();
    cancelAnimationFrame(this.rafId);
    gameAudio.setVolume(0);

    const rows = this.buildRows();
    const mvp = rows.find((row) => row.kills > 0) ?? null;
    const result: MatchResult = {
      win: this.score[0] > this.score[1],
      draw: this.score[0] === this.score[1],
      scoreA: this.score[0],
      scoreB: this.score[1],
      rows,
      mvp,
    };
    this.options.onFinish(result);
  }

  /* ============================================================
     主循环
     ============================================================ */

  private loop = (now: number): void => {
    if (this.disposed) return;

    this.rafId = requestAnimationFrame(this.loop);
    this.step(now, true);
  };

  /**
   * 推进一帧。
   *
   * `render = false` 是**后台补帧**（见 `stepWhileHidden`）：只算不画，HUD 也不
   * 往 React 推 —— 标签页都看不见，没必要按 60Hz 重渲染。物理、开火、计分、
   * 出网（快照 / 名单）这些「别人看得见的状态」一律照跑。
   */
  private step(now: number, render: boolean): void {
    // 真正跑起来的一帧就是「rAF 活着」的证明：把补帧状态关掉，不然前台会
    // 出现 rAF 和输入帧各推一帧的双算
    if (render) this.hiddenTicking = false;

    // dt 上限见 MAX_DT：切标签页回来时 `now - lastTime` 可能是好几秒，
    // 不夹住的话玩家会在一帧里穿过三堵墙
    const rawDt = (now - this.lastTime) / 1000;
    let dt = Math.min(rawDt, MAX_DT);
    this.lastTime = now;

    // 循环停过整整一秒以上（房主在后台、又没有输入帧来顶）—— 那段时间里
    // `publishNet` 的掉线判定根本没跑，对端也没机会证明自己还活着。把每个人的
    // 计时基准整体往后推同样长，等于「掉线只按循环真的在跑的时间算」；不补这一下，
    // 房主切回来第一帧就会把一屋子人全判成掉线、再一个个补成人机。
    if (rawDt > 1 && this.links.size > 0) {
      const stalledMs = rawDt * 1000;
      for (const link of this.links.values()) link.lastInputAt += stalledMs;
    }

    // hit-stop：致命一击之后整局慢放 80ms。
    // 不做成「暂停循环」是因为这一瞬间画面还得继续演（震动、血雾、镜头开始下沉），
    // 停住反而不像被打死了，像掉帧
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      dt *= DEATH_TIMELINE.hitStopScale;
    }

    if (this.finished) {
      if (render) this.renderFrame();
      return;
    }

    // 房主（和单人）跑完整模拟；加入者只镜像快照 —— 两条路径互不干扰
    if (this.netRole === 'guest') this.updateGuest(dt);
    else this.update(dt, rawDt);

    if (!render) return;
    this.renderFrame();
    this.pushHud(dt);
  }

  /**
   * 房主在后台时的补帧。
   *
   * 场景就是最平常的一个动作：房主双击了另一个标签页，或者把浏览器切到后台，
   * 加入者那边还在打。浏览器对隐藏页面会**完全停掉 rAF**，房主的权威模拟随之
   * 冻住 —— 加入者本机能跑（移动走了本地预测），但切枪 / 换弹 / 开火命中全都要
   * 房主落账再回快照，于是全部失灵（这是「换枪没反应、打不死人」的根因）。
   *
   * 这里把**加入者的输入帧**当成心跳：DataChannel 的消息不受标签页计时器节流
   * 影响，只要对面还在动，房主就还在算。入场券是 `HIDDEN_STEP_GAP_MS` ——
   * rAF 没停时 `lastTime` 一直是新的，这道门不会开；一旦真停了就每来一帧输入
   * 补一帧模拟，且 `dt` 用的是真实间隔，补出来的时长和现实时间是对齐的。
   *
   * 顺带把 `PEER_TIMEOUT_MS` 的掉线判定也保住了：那个判定跑在这里面，房主回来
   * 时不会因为「几十秒没跑循环」把一屋子人全判掉、再补成人机。
   */
  private stepWhileHidden(): void {
    if (this.disposed || !this.running || this.finished) return;
    if (this.netRole !== 'host') return;
    const now = performance.now();
    // rAF 还活着就把这一帧让给它：两条路都推进 `lastTime` 的话，同一段时间会被
    // 切成两半算 —— 总时长虽然对得上，但白烧一倍 CPU
    if (!this.hiddenTicking && now - this.lastTime < HIDDEN_STEP_GAP_MS) return;
    this.hiddenTicking = true;
    this.step(now, false);
  }

  private update(dt: number, rawDt = dt): void {
    const frame = this.input.flush();

    // 计分板是「按住才看」，用边沿检测推给 React —— 不能等 10Hz 的 HUD 快照
    if (frame.scoreboard !== this.scoreboardVisible) {
      this.scoreboardVisible = frame.scoreboard;
      this.options.onScoreboard?.(frame.scoreboard);
    }

    // 换枪菜单、游戏菜单（Esc，不冻结世界但冻结本机输入）开着、或者相机正被
    // 死亡相机接管时冻结玩家。
    // 后者包含「已经死了」和「重生后那 0.45 秒镜头还在往上拉」两段 ——
    // 不冻的话玩家会在镜头还贴在甲板上的时候就开始跑
    const frozen = this.buyOpen || this.menuOpen || this.deathCam.busy;
    const playerFrame: InputFrame = frozen
      ? { ...frame, forward: 0, right: 0, fire: false, firePressed: false, aim: false, lookYaw: 0, lookPitch: 0 }
      : this.scaleLookForAds(frame);
    this.lookDelta.yaw = playerFrame.lookYaw;
    this.lookDelta.pitch = playerFrame.lookPitch;

    if (frame.actions.has('buy')) {
      if (this.buyOpen) this.closeBuyMenu();
      else this.openBuyMenu();
    }

    // 换枪菜单开着但资格已经没了（复活 5 秒到点 / 已耗弹 / 死亡）：立刻关掉，
    // 不给「提前打开界面挂机」留任何绕过空间 —— 每帧自检，不是只锁提交按钮
    if (this.buyOpen && !this.player.canChangeLoadout) this.closeBuyMenu();

    // 这一帧真的打出了子弹才抖枪模 —— 用累计击发数判断，
    // 而不是「弹匣数变少了」（换弹也会让弹匣数变化）。
    // 抖多重由武器表 `feel.kick` 决定：AWM 2.0 砸得最深，USP 0.6 只是轻轻一跳
    const shotsBefore = this.player.shotsFired;
    this.player.update(dt, playerFrame, this.playerDeps);
    if (this.player.shotsFired > shotsBefore) {
      this.viewModel.triggerKick(weaponFeel(this.player.weapon).kick, this.player.recoilBurst);
    }

    // 网络对端：房主替他们跑同一套 `Player.update`（位置、开火、换弹、扔雷）
    this.updateRemotePlayers(dt);

    if (DEBUG_ENABLED) this.checkTeleport(dt, rawDt);

    for (const bot of this.bots) bot.update(dt, this.botWorld);

    this.updateGrenades(dt);
    this.updateRespawns();
    this.updateBotViews(dt);
    this.updateDropped(dt);
    this.effects.update(dt);
    this.updateCamera(dt);
    this.updateViewModel(dt);
    this.updateHeartbeat(dt);

    // 放在相机更新**之后**：命中标记要按本帧最终的相机姿态投影到屏幕，
    // 早一步算就会用上一帧的视角，快速甩枪时标记会偏
    this.flushFeedback();

    // 结束条件**只有一个**（模式页单选）：按时长就只走时钟，按人头就只累计用时。
    // 以前这里是「时间到点就 finish」的硬编码 —— 配上可选人头目标之后，
    // 「选 60 头、但 5 分钟先到」会提前结算，玩家的感受是「我还没打满就结束了」
    if (this.rules.endMode === 'time') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.finish();
      }
    } else {
      this.elapsed += dt;
    }

    // 播报过期
    const cutoff = performance.now() - FEED_LIFETIME * 1000;
    while (this.feed.length > 0 && this.feed[0].at < cutoff) this.feed.shift();

    // 出网放在最后：这一帧所有人的位置、血量、比分都已经定了
    this.publishNet(dt);
  }

  /**
   * 开镜（仅 AWM 的 `scoped`）时按设置的 `adsSensitivity` 倍率缩放视角增量。
   *
   * 放在引擎层而不是 `InputController`：输入层不知道玩家此刻是否开镜，而引擎
   * 这里的 `player.scoped` 来自上一帧 —— 开镜瞬间有一帧的滞后，肉眼不可见。
   * 触屏拖拽走同一条 `lookYaw/lookPitch` 通路，所以触屏也一并生效。
   */
  private scaleLookForAds(frame: InputFrame): InputFrame {
    const mul = this.player.scoped ? this.settings.adsSensitivity : 1;
    if (mul === 1) return frame;
    return { ...frame, lookYaw: frame.lookYaw * mul, lookPitch: frame.lookPitch * mul };
  }

  /**
   * 瞬移自检（地址栏加 `?debug=1` 打开）。
   *
   * 只报「单帧位移超过本帧合法上限」的帧，日志里带 dt / 前后坐标 / 是否着地 ——
   * 用来区分到底是 **dt 尖峰** 还是 **碰撞弹出**，不要猜着改。
   */
  private checkTeleport(dt: number, rawDt: number): void {
    const p = this.player.pos;

    if (!this.dbg.ready) {
      this.dbg.x = p.x;
      this.dbg.y = p.y;
      this.dbg.z = p.z;
      this.dbg.ready = true;
      return;
    }

    const moved = Math.hypot(p.x - this.dbg.x, p.z - this.dbg.z);
    // 阈值 = 跑速上限（player.ts 的 SPEED_RUN = 5.5）× dt × 1.5，外加一点浮点余量
    const limit = 5.5 * 1.6 * dt * 1.5 + 0.05;
    if (!(moved <= limit)) {
      this.dbg.warns += 1;
      console.warn(
        `[瞬移] 水平 ${moved.toFixed(3)}m > ${limit.toFixed(3)}m  ` +
          `dt=${(dt * 1000).toFixed(1)}ms(raw ${(rawDt * 1000).toFixed(1)}ms)  ` +
          `(${this.dbg.x.toFixed(2)},${this.dbg.y.toFixed(2)},${this.dbg.z.toFixed(2)}) → ` +
          `(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)})`,
      );
    }

    // 垂直阈值放宽到 1.2 米：上台阶一帧 0.45 米是正常的，超过这个才是弹出
    const climbed = p.y - this.dbg.y;
    if (!(Math.abs(climbed) <= 1.2)) {
      this.dbg.warns += 1;
      console.warn(
        `[瞬移] 垂直 ${climbed.toFixed(3)}m  dt=${(dt * 1000).toFixed(1)}ms  ` +
          `onGround=${this.player.onGround}  vel.y=${this.player.vel.y.toFixed(2)}`,
      );
    }

    this.dbg.x = p.x;
    this.dbg.y = p.y;
    this.dbg.z = p.z;
  }

  private updateRespawns(): void {
    const player = this.player;
    if (!player.alive && player.deathTime >= DEATH_TIMELINE.respawnAt) {
      this.respawnPlayer();
      // 复活**当帧直接切**第一人称，不做镜头过渡。过渡的起点是击杀者身后的观战位，
      // 那 0.45 秒里画面会把交火区和敌人的位置一路拖过来 —— 每次复活白送一次透视
      this.deathCam.end();
    }
    for (const bot of this.bots) {
      if (!bot.alive && bot.deathTime >= BOT_CORPSE_LIFE) this.respawnBot(bot);
    }
    // 网络对端：房主替他们重生，用的是和玩家完全一样的时间轴
    for (const link of this.links.values()) {
      if (!link.player.alive && link.player.deathTime >= DEATH_TIMELINE.respawnAt) {
        this.respawnRemote(link);
      }
    }
  }

  private updateBotViews(dt: number): void {
    for (const bot of this.bots) {
      const view = this.botViews.get(bot);
      if (!view) continue;

      // 尸体保留 5 秒再淡出：最后 0.9 秒把透明度压到 0，
      // 不是到点直接 `visible = false`（那样像被谁按了删除键）
      if (!bot.alive) {
        const left = BOT_CORPSE_LIFE - bot.deathTime;
        view.setOpacity(left < CORPSE_FADE ? left / CORPSE_FADE : 1);
      }
      view.sync(bot, dt);
    }
  }

  private updateDropped(dt: number): void {
    this.dropped.update(dt);
  }

  /**
   * 低血量心跳。血量越低间隔越短 —— 这是玩家判断「我快死了」的听觉线索，
   * 比血条更早引起注意。
   */
  private updateHeartbeat(dt: number): void {
    const player = this.player;
    if (!player.alive || player.health >= LOW_HP) {
      this.heartbeatTimer = 0;
      return;
    }
    this.heartbeatTimer -= dt;
    if (this.heartbeatTimer > 0) return;

    const t = clamp(player.health / LOW_HP, 0, 1);
    this.heartbeatTimer = HEARTBEAT_FAST + (HEARTBEAT_SLOW - HEARTBEAT_FAST) * t;
    gameAudio.heartbeat(1 - t);
  }

  private updateCamera(dt: number): void {
    const player = this.player;
    const bob = player.bobOffset;
    const alive = {
      x: player.pos.x + bob.x,
      y: player.pos.y + player.eyeHeight + bob.y,
      z: player.pos.z,
      yaw: player.viewYaw,
      pitch: player.viewPitch,
    };

    // 死亡 / 观战由 `DeathCamera` 接管（复活是硬切，不经过它）。
    // 它返回 false 才走第一人称这条路径 —— 只有一个地方写相机，不会打架
    if (!this.deathCam.update(dt, this.camera)) {
      this.camera.position.set(alive.x, alive.y, alive.z);
      // roll = 开火冲击的侧倾（`player.viewRoll`）。Euler 'XYZ' 下 z 旋转是绕
      // **视线轴**的，前向量只由 yaw / pitch 决定 —— 所以这一下歪画面不会歪弹道，
      // 是「零瞄准代价」的力度表达。死亡相机会自己算四元数，不走这条路径
      this.camera.rotation.set(alive.pitch, alive.yaw, player.viewRoll);
    }

    // 开镜时 FOV 收到 `SCOPED_FOV`：这是「狙击枪」这个武器定位的全部视觉表达。
    // 死亡时必须收回 —— 否则开着镜被打死，整段观战视角都是 22°。
    // 击杀 FOV pop 叠在目标值上（开镜击杀也弹），约 0.2s 衰减归零
    this.fovPop = damp(this.fovPop, 0, 12, dt);
    const targetFov = (player.alive && player.scoped ? SCOPED_FOV : this.settings.fov) + this.fovPop;
    if (Math.abs(this.camera.fov - targetFov) > 0.4) {
      const next = this.camera.fov + (targetFov - this.camera.fov) * Math.min(1, dt * 14);
      this.camera.fov = next;
      this.camera.updateProjectionMatrix();
    }

    // 空间音效跟着相机走。观战时相机会跑到击杀者身上，声像必须跟着一起走，
    // 否则「听到的」和「看到的」会指向两个方向
    gameAudio.setListener(this.camera.position.x, this.camera.position.y, this.camera.position.z, this.camera.rotation.y);
  }

  private updateViewModel(dt: number): void {
    const player = this.player;
    // 袖子跟队色（带缓存，换队才写材质）：联机选阵营 / 重开 / 回单人统一走这里
    this.viewModel.setTeam(player.team);
    // 死亡进度直接复用倒地时间轴：镜头往下掉的同时枪也在往下掉，两者是一件事
    const dying = player.alive
      ? 0
      : clamp(
          (player.deathTime - DEATH_TIMELINE.fallStart) / (DEATH_TIMELINE.fallEnd - DEATH_TIMELINE.fallStart),
          0,
          1,
        );

    this.viewModel.update(dt, {
      speed: Math.hypot(player.vel.x, player.vel.z),
      bobPhase: player.walkPhase,
      onGround: player.onGround,
      reloading: player.reloading,
      reloadProgress: player.reloadProgress,
      scoped: player.scoped,
      lookYaw: this.lookDelta.yaw,
      lookPitch: this.lookDelta.pitch,
      bolt: player.boltView,
      dying,
      melee: player.meleeView,
      // 手雷的三条进度：捏雷抬手 / 投掷整段 / 这次投掷是不是 G 快速扔
      grenadeCook: player.grenadeCook,
      grenadeThrow: player.grenadeThrow,
      grenadeThrowQuick: player.grenadeThrowQuick,
    });
  }

  private renderFrame(): void {
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.viewModel.scene, this.viewModel.camera);
  }

  /* ============================================================
     HUD
     ============================================================ */

  private pushHud(dt: number): void {
    this.hudTimer += dt;
    this.frameCounter += 1;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.frameCounter / this.fpsTimer);
      this.frameCounter = 0;
      this.fpsTimer = 0;
    }

    if (this.hudTimer < HUD_INTERVAL) return;
    this.hudTimer = 0;
    this.options.onHud(this.buildHud());
  }

  private buildHud(): HudSnapshot {
    const player = this.player;
    const ammo = player.currentAmmo;
    const isGun = WEAPONS[player.weapon].kind === 'gun';

    return {
      hp: Math.max(0, Math.round(player.health)),
      armor: Math.max(0, Math.round(player.armor)),
      weapon: player.weapon,
      ammo: isGun ? ammo.mag : player.weapon === 'grenade' ? player.grenades : 0,
      // 备弹无限：-1 是「∞」的哨兵值，HUD 见到它就画无穷号
      reserve: -1,
      grenades: player.grenades,
      reloading: player.reloading,
      scoped: player.scoped,
      dead: !player.alive,
      respawnIn: player.alive ? 0 : Math.max(0, DEATH_TIMELINE.respawnAt - player.deathTime),
      deathPhase: player.alive ? 'alive' : deathPhaseAt(player.deathTime),
      deathTime: player.alive ? 0 : player.deathTime,
      damageFrom: this.damageAngle(),
      scoreA: this.score[0],
      scoreB: this.score[1],
      timeLeft: Math.max(0, Math.round(this.timeLeft)),
      elapsed: Math.max(0, Math.round(this.elapsed)),
      endMode: this.rules.endMode,
      killTarget: this.rules.killTarget,
      canChangeLoadout: this.player.canChangeLoadout,
      buyOpen: this.buyOpen,
      primary: player.primary,
      feed: this.feed.slice(),
      rows: this.buildRows(),
      fps: this.fps,
      net: this.buildNetHud(),
    };
  }

  /**
   * 受击方向的**屏幕角度**（弧度，0 = 正前，正值 = 右侧）。
   *
   * 每帧按玩家**当前**朝向重算，而不是在挨打那一刻算好冻住 —— 弧标要显示
   * 1.2 秒，这段时间玩家很可能已经甩过视角了，冻住的角度会指向错误的方向。
   */
  private damageAngle(): number | null {
    if (performance.now() >= this.damageFromUntil) return null;

    const player = this.player;
    const dx = this.damageFromX - player.pos.x;
    const dz = this.damageFromZ - player.pos.z;
    if (Math.hypot(dx, dz) < 0.01) return null;

    // 前向 (-sin, -cos)、右向 (cos, -sin)：把世界方向投到这两个基上，
    // 再用 atan2(右, 前) 得到相对视线的角度
    const forward = dx * -Math.sin(player.yaw) + dz * -Math.cos(player.yaw);
    const right = dx * Math.cos(player.yaw) + dz * -Math.sin(player.yaw);
    return Math.atan2(right, forward);
  }

  /* ============================================================
     尺寸 / 设置
     ============================================================ */

  private readonly onWindowResize = (): void => {
    this.resize();
  };

  /** 组件在容器尺寸变化时也可以主动调。 */
  resize(): void {
    const width = this.canvas.clientWidth || this.canvas.width;
    const height = this.canvas.clientHeight || this.canvas.height;
    if (width === 0 || height === 0) return;

    this.renderer.setSize(width, height, false);
    const aspect = width / height;

    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.viewModel.setAspect(aspect);
  }

  applySettings(settings: EngineOptions['settings']): void {
    this.settings = settings;
    this.input.sensitivity = settings.sensitivity;
    // 暂停 / 结算期间引擎把音量压到 0 了，这里不能因为「玩家在设置里拖了音量条」
    // 就把声音放回来 —— 面板是浮在暂停菜单上面的
    gameAudio.setVolume(this.running && !this.finished ? settings.volume : 0);
    if (!this.player.scoped) {
      this.camera.fov = settings.fov;
      this.camera.updateProjectionMatrix();
    }

    // 阴影开关会改变所有材质的 shader define，**必须在切换后强制重编译**：
    // 只改 `renderer.shadowMap.enabled` 的话旧材质仍然按「有阴影」采样，
    // 表现是关掉阴影后画面出现一片死黑或错乱的采样点。
    const shadows = settings.quality !== 'low';
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.level.sun.castShadow = shadows;
      this.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.needsUpdate = true;
      });
    }

    // 粒子池容量是构造时按画质定死的，改画质不重建它 —— 换一个池等于把正在飞的
    // 火花全部丢掉，而「低/中/高」在这里只影响几百颗粒子的上限，不值得。
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.quality === 'high' ? 2 : 1.5));
    this.resize();
  }

  /** 换人机强度。不用重建引擎 —— 只换每只 Bot 的参数表。 */
  setDifficulty(difficulty: Difficulty): void {
    for (const bot of this.bots) bot.setDifficulty(difficulty);
  }

  /**
   * 换对局规则（结束方式 / 规模 / 目标人头 / 时长）。
   *
   * 模式页选完点开局时调用。局中不生效：`killTarget` 若在局中被改小，下一次
   * 击杀就会突然判负结束；两个时钟也只在没开局时跟着换。引擎不重建 ——
   * 这几处（`start` 重置时钟、`checkMatchEnd` 判分、HUD 显示目标）都是即时取值。
   *
   * 唯一需要动世界的是 `teamSize`：1v1 ~ 6v6 换档必须重铺人机（见
   * `rebuildTeams`）。联机中不碰 —— 房主的世界由房主自己维护。
   */
  setRules(rules: MatchRules): void {
    const sizeChanged = rules.teamSize !== this.rules.teamSize;
    this.rules = { ...rules };
    if (!this.running) {
      this.timeLeft = rules.durationSec;
      this.elapsed = 0;
    }
    if (sizeChanged && !this.running && !this.netRole) this.rebuildTeams();
  }

  /** 按当前 `rules.teamSize` 重铺人机阵容（只应在非对局、非联机时调用）。 */
  private rebuildTeams(): void {
    for (const bot of [...this.bots]) this.removeBot(bot);
    this.spawnBots();
    for (const bot of this.bots) this.respawnBot(bot);
  }

  /* ============================================================
     清理
     ============================================================ */

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onWindowResize);

    this.input.dispose();
    gameAudio.setVolume(0);

    for (const view of this.botViews.values()) {
      this.scene.remove(view.group);
      view.dispose();
    }
    this.botViews.clear();

    for (const view of this.replicaViews.values()) {
      this.scene.remove(view.group);
      view.dispose();
    }
    this.replicaViews.clear();
    this.replicas.clear();
    this.pendingReplicaViews.clear();
    this.links.clear();

    // 房主的投掷物和加入者的画面副本在这里一起收掉，之后才能释放共享的几何体
    this.clearGrenades();
    this.grenadeGeometry.dispose();
    this.grenadeMaterial.dispose();

    this.viewModel.dispose();
    this.effects.dispose();
    this.dropped.dispose();
    this.level.dispose();
    this.envTexture.dispose();

    this.renderer.dispose();
  }
}
