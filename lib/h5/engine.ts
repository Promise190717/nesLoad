import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { gameAudio } from './audio';
import { createActorView, type ActorView } from './actor-view';
import { Bot, BOT_NAMES, type BotWorld } from './bot';
import { type CombatHooks, grenadeBlast } from './combat';
import { DEATH_TIMELINE, DeathCamera, deathPhaseAt } from './death-cam';
import { DroppedWeapons } from './dropped';
import { Effects } from './effects';
import { InputController, type InputAction, type InputFrame } from './input';
import { buildLevel, type Level } from './level';
import { clamp, damp, pick, rand, randInt } from './math';
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
  ACTOR_TOTAL,
  F_ALIVE,
  F_CROUCH,
  F_GROUND,
  F_HUMAN,
  F_LOADOUT,
  F_RELOADING,
  F_SCOPED,
  INPUT_HZ,
  IN_AIM,
  IN_AIM_PRESSED,
  IN_CROUCH,
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
  indexToWeapon,
  num,
  str,
  weaponToIndex,
  type ActorWire,
  type InputWire,
  type NetEvent,
  type RosterWire,
  type Snapshot,
  type TeamSlot,
} from './net/protocol';
import { ReplicaActor } from './net/replica';
import type { SessionRole, ShipNetSession } from './net/session';
import { rayWorld, surfaceUnder } from './physics';
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

/** 队友（不含玩家）数量 */
const TEAMMATE_COUNT = 4;
/** 敌方数量 */
const ENEMY_COUNT = 5;

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
 * 加入者自己的位置外推提前量（秒）。
 *
 * 快照里的位置是**半个快照间隔 + 一个来回之前**的：直接阻尼到它，自己走路
 * 永远拖着 150~250ms 的尾（「像在泥里」）。快照同时带了房主模拟出的速度 ——
 * 把阻尼目标沿速度往前推这段提前量，正好抵消管线延迟，残余滞后只剩阻尼
 * 本身的 ~40ms，手感接近本地模拟。停下来的时候速度位先归零，多出去的一小段
 * 由阻尼滑回来，肉眼无感。
 */
const SELF_POS_LEAD = 0.08;

/* ============================================================
   手雷投掷物
   ============================================================ */

interface Grenade {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fuse: number;
  owner: Actor;
  mesh: THREE.Mesh;
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
  /** 持续量：前后左右 / 蹲 / 走 / 开火 / 开镜 */
  forward: number;
  right: number;
  crouch: boolean;
  walk: boolean;
  fire: boolean;
  aim: boolean;
  /** 一次性动作（跳 / 换弹 / 切枪 / 扔雷），下一帧消费掉 */
  readonly actions: Set<InputAction>;
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
  private readonly rules: MatchRules;

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
  private netInputTimer = 0;
  private netSnapshotTimer = 0;
  private netRosterTimer = 0;
  private netSeq = 0;
  private netInputSeq = 0;
  /** 加入者：攒到下一次上行的一次性动作（30Hz 之间按下的键不能丢） */
  private readonly netActions = new Set<InputAction>();
  private netFirePressed = false;
  private netAimPressed = false;
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

  /**
   * 别人的脚步累计：角色 id → 上一帧位置 + 已走距离。
   *
   * 之前只有玩家自己有脚步声，人机和对端真人走路是哑的 —— 绕后摸到脸上
   * 完全没有预警，「听声辨位」少了一半。见 `updateActorFootsteps`。
   */
  private readonly stepTracker = new Map<string, { x: number; y: number; z: number; dist: number }>();

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
    this.input = new InputController(canvas, (locked) => {
      this.options.onLockChange(locked);
      // Esc 放锁 = 弹出菜单，但**不冻结游戏**：联机暂停会卡住对面（根本不该有），
      // 单机也统一取消 —— 世界照常跑，只有本机输入被归零。浏览器规范强制退出
      // 锁定，拦不住，只能当成「开菜单」的信号。换枪菜单会主动放锁（要能用鼠标
      // 点菜单），那种情况不算菜单。
      if (!locked && this.running && !this.finished && !this.buyOpen) {
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

  private spawnBots(): void {
    for (const team of [0, 1] as Team[]) {
      const count = team === 0 ? TEAMMATE_COUNT : ENEMY_COUNT;
      for (let i = 0; i < count; i += 1) {
        // 敌方火力更杂：有喷子，逼玩家换着打法；友方统一步枪。
        // **不给 Bot 配 AWM** —— 一枪一个的狙击枪放在 AI 手里，玩家只要露头就被
        // 隔着半个货场点掉，体验是「这局没法打」而不是「这局有难度」。
        const weapon: WeaponId =
          team === 0
            ? pick<WeaponId>(['ak47', 'm4a1', 'm4a1'])
            : pick<WeaponId>(['ak47', 'ak47', 'm4a1', 'shotgun']);

        const spawn = this.level.spawns[team][(i + 1) % this.level.spawns[team].length]!.clone();
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
      weapon ?? (team === 0 ? pick<WeaponId>(['ak47', 'm4a1', 'm4a1']) : pick<WeaponId>(['ak47', 'ak47', 'm4a1', 'shotgun']));

    const bot = new Bot(`bot-${team}-${this.botSerial}`, team, name, this.rules.difficulty, gun);
    this.botSerial += 1;
    bot.pos.copy(spawn);
    bot.respawn(new THREE.Vector3(spawn.x, spawn.y, spawn.z), 3);

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
    }
    this.finished = false;
    this.buyOpen = false;
    this.feed.length = 0;

    // 上一局可能是在「观战」状态下被结束的，不清掉的话新一局开局镜头还躺在甲板上
    this.deathCam.reset();
    this.hitStop = 0;
    this.killStreak = 0;
    this.lastPlayerDamage = 0;
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
    this.input.enabled = false;
    this.input.exitLock();
    cancelAnimationFrame(this.rafId);
    gameAudio.setVolume(0);
    this.deathCam.reset();
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
   * 玩家复活选点：从本方出生点里挑一个**掩体后方**的。
   *
   * 「掩体后方」不是形容词，是真做了遮挡检测 —— 从每个存活敌人的眼睛向候选点
   * 打射线，全被场景几何挡住的候选才算「看不见」。评分还叠加两项：
   *
   *   + 离最近敌人越远越好（避开交火区）
   *   - 任何一个敌人能直接看到就扣分（没有全遮掩体时退而求其次，挑暴露面最小的）
   *
   * 并列最优的候选里随机挑一个，避免每次复活都精确落在同一格。玩家**不再加
   * ±0.8m 随机偏移**（那是 Bot 的做法）—— 偏移可能把人推进掩体模型里。
   */
  private pickPlayerSpawn(team: Team): THREE.Vector3 {
    const candidates = this.level.spawns[team];
    const enemies = this.actors.filter((a) => a !== this.player && a.alive && a.team !== team);

    let bestScore = -Infinity;
    let bestList: THREE.Vector3[] = [];
    for (const candidate of candidates) {
      let score = 0;
      let nearest = Infinity;
      for (const enemy of enemies) {
        const dx = candidate.x - enemy.pos.x;
        const dz = candidate.z - enemy.pos.z;
        nearest = Math.min(nearest, Math.hypot(dx, dz));
        // 敌人眼睛 → 候选点胸口；被挡 = +2（真掩体），暴露 = -1（掩护面越小越差）
        score += this.lineBlocked(
          { x: enemy.pos.x, y: enemy.pos.y + 1.45, z: enemy.pos.z },
          { x: candidate.x, y: candidate.y + 0.9, z: candidate.z },
        ) ? 2 : -1;
      }
      // 避开交火区：离最近敌人至少给一点正分，30 米封顶
      score += Math.min(nearest, 30) * 0.1;
      if (score > bestScore + 0.5) {
        bestScore = score;
        bestList = [candidate];
      } else if (score > bestScore - 0.5) {
        bestList.push(candidate);
      }
    }
    return bestList[randInt(0, bestList.length - 1)] ?? candidates[0]!;
  }

  /** 全图可走格（复活候选）。nav 是关卡级常量，抽一次缓存就够。 */
  private mapSpawnCells: { x: number; z: number }[] | null = null;

  /**
   * 全图选复活点：不再局限于双方出生线 —— 候选是 nav 里所有「走得到」的格子
   * （泛洪过，集装箱死胡同进不来），评分口径和 `pickPlayerSpawn` 一致
   * （掩体遮挡 + 离敌人距离），额外加一条硬淘汰：离任何存活敌人不足 8 米的
   * 格子直接不评，杜绝「贴脸复活」。
   *
   * 全表约 600 格，逐格对每个敌人打射线太贵；随机抽 48 格评分足够随机，
   * 一次复活的射线开销也压在几毫秒内。没有活敌（清场瞬间）时全格同分，
   * 退化为均匀随机 —— 正是想要的行为。
   */
  private pickMapSpawn(team: Team): THREE.Vector3 {
    if (!this.mapSpawnCells) {
      const nav = this.level.nav;
      const cells: { x: number; z: number }[] = [];
      for (let i = 0; i < nav.walk.length; i += 1) {
        if (nav.isWalkable(i)) cells.push(nav.center(i));
      }
      this.mapSpawnCells = cells;
    }
    const cells = this.mapSpawnCells;
    const enemies = this.actors.filter((a) => a.alive && a.team !== team);

    // 随机抽 48 格（不重复），先过「离敌人 ≥ 8 米」的硬淘汰
    const candidates: { x: number; z: number }[] = [];
    const picked = new Set<number>();
    const samples = Math.min(48, cells.length);
    for (let n = 0; n < samples * 4 && candidates.length < samples; n += 1) {
      const index = Math.floor(Math.random() * cells.length);
      if (picked.has(index)) continue;
      picked.add(index);
      const cell = cells[index]!;
      let tooClose = false;
      for (const enemy of enemies) {
        if (Math.hypot(cell.x - enemy.pos.x, cell.z - enemy.pos.z) < 8) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) candidates.push(cell);
    }
    if (candidates.length === 0) {
      // 敌人把地图铺满了（几乎不可能）：退回出生线兜底
      return this.pickPlayerSpawn(team);
    }

    let bestScore = -Infinity;
    let bestList: { x: number; z: number }[] = [];
    for (const candidate of candidates) {
      let score = 0;
      let nearest = Infinity;
      for (const enemy of enemies) {
        const dx = candidate.x - enemy.pos.x;
        const dz = candidate.z - enemy.pos.z;
        nearest = Math.min(nearest, Math.hypot(dx, dz));
        score += this.lineBlocked(
          { x: enemy.pos.x, y: enemy.pos.y + 1.45, z: enemy.pos.z },
          { x: candidate.x, y: 0.9, z: candidate.z },
        ) ? 2 : -1;
      }
      score += Math.min(nearest, 30) * 0.1;
      if (score > bestScore + 0.5) {
        bestScore = score;
        bestList = [candidate];
      } else if (score > bestScore - 0.5) {
        bestList.push(candidate);
      }
    }
    const pick = bestList[randInt(0, bestList.length - 1)];
    if (!pick) return this.pickPlayerSpawn(team);
    // nav 格子都是甲板层（block 阈值过滤过高/过低的障碍），地面就是 y=0
    return new THREE.Vector3(pick.x, 0, pick.z);
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
   * 复活朝向：面对最近的存活敌人（掩体就在这条视线上，探头即接敌）；
   * 场上没有敌人（开局清场等）就朝对方出生线 —— 和地图设计的攻防方向一致。
   *
   * 位置、朝向、相机在 `respawn` 一次设齐：死亡相机从甲板拉起来的那 0.45s
   * 里玩家位置已经就位，不存在「先出现在旧位置再瞬移」。
   */
  private spawnFacingYaw(team: Team, from: THREE.Vector3): number {
    let nearest: { x: number; z: number } | null = null;
    let bestDist = Infinity;
    for (const actor of this.actors) {
      if (actor === this.player || !actor.alive || actor.team === team) continue;
      const dx = actor.pos.x - from.x;
      const dz = actor.pos.z - from.z;
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        nearest = { x: actor.pos.x, z: actor.pos.z };
      }
    }
    if (!nearest) return team === 0 ? Math.PI : 0;
    // 玩家前向 = (-sin yaw, -cos yaw)，反解 yaw 使前向指向目标
    return Math.atan2(-(nearest.x - from.x), -(nearest.z - from.z));
  }

  /** `useMapSpawn`：死亡复活 = 全图选点；开局 / 重开一局 = 回各自出生线。 */
  private respawnPlayer(useMapSpawn = false): void {
    const spawn = useMapSpawn ? this.pickMapSpawn(this.player.team) : this.pickPlayerSpawn(this.player.team);
    this.player.respawn(spawn);
    this.player.yaw = this.spawnFacingYaw(this.player.team, spawn);
    this.player.pitch = 0;
    // 重生是瞬移，自检的基准点要跟着重置，否则每次复活都报一条假警
    this.dbg.ready = false;
    this.viewModel.setWeapon(this.player.weapon);
  }

  private respawnBot(bot: Bot, useMapSpawn = false): void {
    if (useMapSpawn) {
      // 全图复活不叠点也不加偏移：格心离障碍有 0.45m 余量，±0.8 的偏移反而
      // 可能把 Bot 推进箱子里；重叠由分离力自己解开
      bot.respawn(this.pickMapSpawn(bot.team), 3);
      return;
    }
    const spawns = this.level.spawns[bot.team];
    const spawn = spawns[randInt(0, spawns.length - 1)];
    // 复活点带一点随机偏移，否则多个 Bot 会精确重叠在同一格上
    bot.respawn(new THREE.Vector3(spawn.x + rand(-0.8, 0.8), spawn.y, spawn.z + rand(-0.8, 0.8)), 3);
  }

  /* ============================================================
     依赖注入
     ============================================================ */

  private readonly hooks: CombatHooks = {
    onActorHit: (target, attacker, head, damage, point, dir) => {
      // 血雾从**真实弹着点**喷出来，方向跟着弹道走 —— 这是「打在这儿了」的第一层
      this.effects.bloodBurst(point, dir, head);
      this.lastDamage.set(target.id, damage);

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
      }
      if (target === this.player) {
        gameAudio.impact(point.x, point.y, point.z, 'flesh', { own: true });
        // 挨打要抖一下：这是玩家唯一「不看血条也知道自己中枪了」的反馈
        this.player.addShake(Math.min(0.5, damage / 90));
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
      // 就能判断出「那边是 AWM 还是 M4」
      this.effects.spawnMuzzleFlash(muzzle, dir, { scale: feel.flashScale, life: feel.flashLife });

      // 曳光终点用本次击发的真实命中距离（调用方从 fireWeapon 结果里取最远的
      // t 传进来），没打中任何东西就画到默认射程 —— 与玩家自己那条曳光同款
      // 的 60 / 90 规则，观察者看到的弹道和射手实际打出去的一致
      const shotEnd = endT > 0 ? Math.min(endT, 90) : 60;
      this.effects.spawnTracer(muzzle, {
        x: origin.x + dir.x * shotEnd,
        y: origin.y + dir.y * shotEnd,
        z: origin.z + dir.z * shotEnd,
      });
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
   * 加入者：把本地的 9 个人机全清掉（它们是假的，真正的角色从快照来），
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
    if (wasGuest) this.restoreSinglePlayer();
  }

  /** 改本机玩家的显示名（联机面板里改名之后立刻生效，不用重建引擎）。 */
  setPlayerName(name: string): void {
    const clean = name.trim().slice(0, 16);
    if (!clean) return;
    this.player.name = clean;
    if (this.netRole === 'host') this.broadcastRoster();
  }

  /** 加入者退出联机后，把世界还原成「1 真人 + 9 人机」的单人局。 */
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
   * 人数自检：场上**必须**恒为 10 个角色。
   *
   * 需求把「真人 + 人机 = 10」写成了硬约束（三.4 / 四.3 / 七.3）。这条断言不
   * 改变任何行为，只在那条约束被破坏时立刻在控制台喊一声 —— 因为人数错了
   * 在画面上不一定看得出来（多一个或少一个都是 10 个人里的一团影子）。
   */
  private assertRoster(tag: string): void {
    if (this.actors.length === ACTOR_TOTAL) return;
    console.warn(`[h5-net] 场上角色数 ${this.actors.length} ≠ ${ACTOR_TOTAL}（${tag}）`);
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
    const spawn = this.pickPlayerSpawn(team);
    const primary = primaryOf(bot.weapon);

    // ① 摘人机
    this.removeBot(bot);

    // ② 放真人：站在本方**安全复活点**（掩体后、远离交火），朝最近的敌人
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
      crouch: false,
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

    // ③ 快照要在替换**之后**生成：加入者拿到的第一帧就是 10 人现状（需求六.2）
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
    link.crouch = (keys & IN_CROUCH) !== 0;
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
      const frame: InputFrame = {
        forward: stale ? 0 : link.forward,
        right: stale ? 0 : link.right,
        crouch: link.crouch,
        walk: link.walk,
        fire: stale ? false : link.fire,
        firePressed: stale ? false : link.firePressed,
        aim: link.aim,
        aimPressed: stale ? false : link.aimPressed,
        scoreboard: false,
        actions: link.actions,
        // 视角是绝对角，由下面两行直接写进 player，不需要增量
        lookYaw: 0,
        lookPitch: 0,
      };
      link.firePressed = false;
      link.aimPressed = false;
      link.actions.clear();

      link.player.yaw = link.yaw;
      link.player.pitch = link.pitch;
      link.player.update(dt, frame, link.deps);
      link.view.sync(link.player, dt);
      if (!link.player.alive) link.view.setOpacity(1);
    }
  }

  private respawnRemote(link: NetLink): void {
    const spawn = this.pickMapSpawn(link.player.team);
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
      this.netSnapshotTimer = 0;
      session.broadcastSnapshot(this.buildSnapshot());
      // 弹着点的配额按「一个快照窗口」算，不是按帧
      this.netImpacts = 0;
    }

    this.netRosterTimer += dt;
    if (this.netRosterTimer >= 1 / ROSTER_HZ) {
      this.netRosterTimer = 0;
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
    const snapshot: Snapshot = {
      v: NET_VERSION,
      q: (this.netSeq += 1),
      t: Math.max(0, this.timeLeft),
      s: [this.score[0], this.score[1]],
      a: actors,
    };
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
      if (actor.crouching) flags |= F_CROUCH;
      if (actor.canChangeLoadout) flags |= F_LOADOUT;
      if (actor.onGround) flags |= F_GROUND;
    } else {
      // 人机不蹲、不开镜、不换弹。`onGround` 是私有的 —— 副本只用它算走路相位，
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
    // 本地这 9 个人机是假的：真正场上有谁、在哪儿，全听房主的
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
   * 和房主那条最大的区别：**没有本地结算**。位置、血量、比分、死亡全部来自
   * 快照；本地只做三件事 —— 转视角（必须即时，否则瞄准像在水里）、把输入发上去、
   * 把快照画出来。
   *
   * 代价说清楚：走路的位移要等一个来回（局域网里 RTT + 50ms 快照间隔 ≈ 60ms），
   * 所以起步会比单人稍微「软」一点。换来的好处是「所有人看到的场面完全一致」——
   * 这正是验收里反复强调的那几条（人数、替换、比分不重置）。
   */
  private updateGuest(dt: number): void {
    const frame = this.input.flush();

    if (frame.scoreboard !== this.scoreboardVisible) {
      this.scoreboardVisible = frame.scoreboard;
      this.options.onScoreboard?.(frame.scoreboard);
    }

    // 快照先吃：它可能刚告诉我们「你死了」，那这一帧就不该再转视角
    const snapshot = this.latestSnapshot;
    if (snapshot) {
      this.latestSnapshot = null;
      // 带上真实帧步长：mirrorSelf 的阻尼按它算，固定 1/60 在低帧率下会
      // 让「自己」比「别人」更快地飘向目标位
      this.applySnapshot(snapshot, dt);
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

    this.player.advanceVisual(dt);

    // 上行：一次性动作攒起来，到点一次性发（30Hz）
    for (const action of frame.actions) this.netActions.add(action);
    if (frame.firePressed) this.netFirePressed = true;
    if (frame.aimPressed) this.netAimPressed = true;
    this.netInputTimer += dt;
    if (this.netInputTimer >= 1 / INPUT_HZ) {
      this.netInputTimer = 0;
      // 冻结期间上行移动归零：不然加入者点着菜单，房主那边他还在满场跑
      this.sendInputNow(frozen ? { ...frame, forward: 0, right: 0, fire: false } : frame);
    }

    for (const replica of this.replicas.values()) replica.step(dt);
    // 副本（含自己 —— 加入者没有本地移动模拟，自己的脚步也在这里补）的脚步
    this.updateActorFootsteps();
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
    if (frame.crouch) keys |= IN_CROUCH;
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

  /** 加入者：把一帧快照铺到场上。 */
  private applySnapshot(snapshot: Snapshot, dt = 1 / 60): void {
    if (snapshot.q <= this.appliedSnapshotSeq) return;
    this.appliedSnapshotSeq = snapshot.q;

    this.score[0] = snapshot.s[0];
    this.score[1] = snapshot.s[1];
    this.timeLeft = snapshot.t;

    const seen = new Set<string>();
    for (const wire of snapshot.a) {
      const id = str(wire, ACTOR_ID);
      seen.add(id);
      if (id === this.selfActorId) {
        this.mirrorSelf(wire, dt);
        continue;
      }
      const existing = this.replicas.get(id);
      if (existing) {
        existing.apply(wire);
      } else {
        const replica = new ReplicaActor(wire);
        this.replicas.set(id, replica);
        this.createReplicaView(replica);
        this.actors.push(replica);
      }
    }

    // 角色消失（房主那边换了人 / 补了人机）：把副本连同模型一起清掉
    for (const id of [...this.replicas.keys()]) {
      if (!seen.has(id)) this.removeReplica(id);
    }

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

  private removeReplica(id: string): void {
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
   */
  private mirrorSelf(wire: ActorWire, dt: number): void {
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
    player.reloading = (flags & F_RELOADING) !== 0;
    player.crouching = (flags & F_CROUCH) !== 0;
    player.onGround = (flags & F_GROUND) !== 0;
    player.netCanLoadout = (flags & F_LOADOUT) !== 0;
    player.grenades = num(wire, ACTOR_GRENADES, player.grenades);
    player.vel.set(num(wire, ACTOR_VX, 0), 0, num(wire, ACTOR_VZ, 0));

    // 武器是**换着来的**（买枪 / 数字键 / 刀 / 雷），不是每帧同值：
    // 加入者不跑 `Player.update`，`onWeaponChange` 钩子永远不会走，
    // 不在这里换第一人称枪模的话，切刀切雷之后手里还端着步枪的模型。
    const wireWeapon = indexToWeapon(num(wire, ACTOR_WEAPON, 0));
    if (wireWeapon !== player.weapon) {
      player.weapon = wireWeapon;
      if (isPrimaryId(wireWeapon)) player.primary = wireWeapon;
      this.viewModel.setWeapon(wireWeapon);
    }
    player.setNetAmmo(wireWeapon, num(wire, ACTOR_MAG, 0));

    const x = num(wire, ACTOR_X, player.pos.x);
    const y = num(wire, ACTOR_Y, player.pos.y);
    const z = num(wire, ACTOR_Z, player.pos.z);
    if (alive) {
      // 平滑 + 速度外推：阻尼目标沿房主模拟出的速度往前推 `SELF_POS_LEAD`
      // 秒，抵消「上行 → 房主模拟 → 快照回来」整条管线延迟。直接阻尼到原始
      // 位置的话，自己走路永远拖着 150ms+ 的尾巴 —— 「巨卡」的主要来源。
      // 房主输入断流时速度位会归零，外推自动收敛回来，不需要额外处理。
      const lead = SELF_POS_LEAD;
      player.pos.x = damp(player.pos.x, x + player.vel.x * lead, 26, dt);
      player.pos.y = damp(player.pos.y, y, 26, dt);
      player.pos.z = damp(player.pos.z, z + player.vel.z * lead, 26, dt);
    } else {
      player.pos.set(x, y, z);
    }

    player.alive = alive;
    player.deathTime = num(wire, ACTOR_DEATH_TIME, 0);

    if (alive && !wasAlive) {
      // 房主已经让我复活了：位置**直接就位**（和副本那条 `apply(snap)` 同理，
      // 否则镜头会先从死亡点往复活点滑 100ms），镜头再用 0.45 秒从观战位
      // 拉回第一人称（和单人一致）
      player.deathTime = 0;
      player.pos.set(x, y, z);
      this.deathCam.startRespawn(this.camera);
    } else if (!alive && wasAlive) {
      this.beginGuestDeath();
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

        if (event.v === this.selfActorId) {
          gameAudio.impact(point.x, point.y, point.z, 'flesh', { own: true });
          this.player.addShake(Math.min(0.5, event.dmg / 90));
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
      // 自己这一枪：枪口用**枪模 muzzle 反投影**，和单人模式完全一致
      const point = this.muzzleWorldPoint(0.6) ?? muzzle;
      this.effects.spawnMuzzleFlash(point, dir, { scale: feel.flashScale, life: feel.flashLife });
      const endT = event.t > 0 ? Math.min(event.t, 90) : 60;
      this.effects.spawnTracer(point, {
        x: origin.x + dir.x * endT,
        y: origin.y + dir.y * endT,
        z: origin.z + dir.z * endT,
      });
      if (spec.sound) gameAudio.shot(spec.sound, { own: true });
      this.player.addPunch(feel.punchPitch, feel.punchRoll);
      if (feel.shake > 0) this.player.addShake(feel.shake);
      this.viewModel.triggerKick(feel.kick);
      return;
    }

    if (spec.sound) gameAudio.shot(spec.sound, { x: origin.x, y: origin.y, z: origin.z });
    // 开枪那个人的第三人称模型播开火动画（自己走上面那条第一人称分支）
    this.actorViewOf(event.id)?.playFire();
    this.effects.spawnMuzzleFlash(muzzle, dir, { scale: feel.flashScale, life: feel.flashLife });
    const endT = event.t > 0 ? Math.min(event.t, 90) : 60;
    this.effects.spawnTracer(muzzle, {
      x: origin.x + dir.x * endT,
      y: origin.y + dir.y * endT,
      z: origin.z + dir.z * endT,
    });
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

    // dt 上限见 MAX_DT：切标签页回来时 `now - lastTime` 可能是好几秒，
    // 不夹住的话玩家会在一帧里穿过三堵墙
    const rawDt = (now - this.lastTime) / 1000;
    let dt = Math.min(rawDt, MAX_DT);
    this.lastTime = now;

    // hit-stop：致命一击之后整局慢放 80ms。
    // 不做成「暂停循环」是因为这一瞬间画面还得继续演（震动、血雾、镜头开始下沉），
    // 停住反而不像被打死了，像掉帧
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      dt *= DEATH_TIMELINE.hitStopScale;
    }

    if (this.finished) {
      this.renderFrame();
      return;
    }

    // 房主（和单人）跑完整模拟；加入者只镜像快照 —— 两条路径互不干扰
    if (this.netRole === 'guest') this.updateGuest(dt);
    else this.update(dt, rawDt);

    this.renderFrame();
    this.pushHud(dt);
  };

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
      this.viewModel.triggerKick(weaponFeel(this.player.weapon).kick);
    }

    // 网络对端：房主替他们跑同一套 `Player.update`（位置、开火、换弹、扔雷）
    this.updateRemotePlayers(dt);

    if (DEBUG_ENABLED) this.checkTeleport(dt, rawDt);

    for (const bot of this.bots) bot.update(dt, this.botWorld);

    // 所有非本地角色（人机 + 对端真人）的脚步。放在位移都算完之后，
    // 这一帧走出来的路才算得准
    this.updateActorFootsteps();

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

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.finish();
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
      this.respawnPlayer(true);
      // 重生**不黑屏**：镜头从观战位姿用 0.45 秒插值回第一人称，
      // 中间没有任何一帧是纯色块
      this.deathCam.startRespawn(this.camera);
    }
    for (const bot of this.bots) {
      if (!bot.alive && bot.deathTime >= BOT_CORPSE_LIFE) this.respawnBot(bot, true);
    }
    // 网络对端：房主替他们重生，用的是和玩家完全一样的时间轴
    for (const link of this.links.values()) {
      if (!link.player.alive && link.player.deathTime >= DEATH_TIMELINE.respawnAt) {
        this.respawnRemote(link);
      }
    }
  }

  /**
   * 别人的脚步声 —— 「听声辨位」的另一半。
   *
   * 按**逐帧位移**给每个角色累计步距（和 player.ts 自己那条同一套口径），
   * 走够一步就在他的位置空间化地响一声。规则：
   *
   *   - 单人/房主模式下本机玩家跳过（player.ts 已经播了，再播就是一步两响）；
   *     加入者反过来 —— 他没有本地移动模拟，自己的脚步只能在这里补，
   *     走 `own: true` 不过节流、不空间化。
   *   - 死亡清掉累计（尸体不走路，复活后从落点重新起算）。
   *   - 竖直速度大 = 跳在半空，不计步距（空中没有落点）；一帧上下超过
   *     0.25m 同理（上台阶的插值帧不当作「落地一步」）。
   *   - 材质按脚下碰撞盒判：木箱上是空腔声，甲板上是钢板声。
   *
   * 多人齐步的并发靠 `gameAudio.step` 里那道 45ms 闸 —— 同帧几个人落步时
   * 吞掉几声，听起来更像「一群人」而不是节拍器。
   */
  private updateActorFootsteps(): void {
    for (const actor of this.actors) {
      const isSelf = actor === this.player;
      const selfGuest = isSelf && this.netRole === 'guest';
      // 单人 / 房主：自己的脚步归 player.ts，这里不碰
      if (isSelf && !selfGuest) continue;

      const state = this.stepTracker.get(actor.id);
      if (!actor.alive) {
        if (state) this.stepTracker.delete(actor.id);
        continue;
      }
      if (!state) {
        this.stepTracker.set(actor.id, { x: actor.pos.x, y: actor.pos.y, z: actor.pos.z, dist: 0 });
        continue;
      }

      const airborne = Math.abs(actor.vel.y) > 0.8 || Math.abs(actor.pos.y - state.y) > 0.25;
      if (!airborne) state.dist += Math.hypot(actor.pos.x - state.x, actor.pos.z - state.z);
      state.x = actor.pos.x;
      state.y = actor.pos.y;
      state.z = actor.pos.z;

      if (state.dist > 2.1) {
        state.dist = 0;
        const surface = surfaceUnder(actor.pos.x, actor.pos.y, actor.pos.z, this.level.colliders);
        if (selfGuest) {
          gameAudio.step(surface, { own: true, gain: this.player.crouching ? 0.45 : 1 });
        } else {
          gameAudio.step(surface, {
            x: actor.pos.x,
            y: actor.pos.y + 0.1,
            z: actor.pos.z,
            gain: 0.9,
          });
        }
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

    // 死亡 / 观战 / 重生过渡全部由 `DeathCamera` 接管。
    // 它返回 false 才走第一人称这条路径 —— 只有一个地方写相机，不会打架
    if (!this.deathCam.update(dt, this.camera, alive)) {
      this.camera.position.set(alive.x, alive.y, alive.z);
      // roll = 开火冲击的侧倾（`player.viewRoll`）。Euler 'XYZ' 下 z 旋转是绕
      // **视线轴**的，前向量只由 yaw / pitch 决定 —— 所以这一下歪画面不会歪弹道，
      // 是「零瞄准代价」的力度表达。死亡相机会自己算四元数，不走这条路径
      this.camera.rotation.set(alive.pitch, alive.yaw, player.viewRoll);
    }

    // 开镜时 FOV 收到 `SCOPED_FOV`：这是「狙击枪」这个武器定位的全部视觉表达。
    // 死亡时必须收回 —— 否则开着镜被打死，整段观战视角都是 22°
    const targetFov = player.alive && player.scoped ? SCOPED_FOV : this.settings.fov;
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
      crouching: player.crouching,
      dead: !player.alive,
      respawnIn: player.alive ? 0 : Math.max(0, DEATH_TIMELINE.respawnAt - player.deathTime),
      deathPhase: player.alive ? 'alive' : deathPhaseAt(player.deathTime),
      deathTime: player.alive ? 0 : player.deathTime,
      damageFrom: this.damageAngle(),
      scoreA: this.score[0],
      scoreB: this.score[1],
      timeLeft: Math.max(0, Math.round(this.timeLeft)),
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
    this.links.clear();
    this.stepTracker.clear();

    for (const grenade of this.grenades) this.scene.remove(grenade.mesh);
    this.grenades.length = 0;
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
