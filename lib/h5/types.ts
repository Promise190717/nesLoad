import type { Vector3 } from 'three';

/**
 * H5 射击游戏 —— **共享类型**。
 *
 * 这一层（`lib/h5/`）是纯 TypeScript：不 import React，除了 `three` 之外不碰别的
 * 运行时依赖。引擎只认这些类型，React 只认 `HudSnapshot` / `MatchResult` 两个快照，
 * 两边靠引擎按 10Hz 推一次的普通对象通信 —— 谁也不认识谁的内部结构。
 *
 * ## 模块分工
 *
 *   types.ts    这里。协议与数据形状
 *   math.ts     夹取 / 插值 / 角度归一 / 射线 vs AABB
 *   weapons.ts  武器数值表 + 第一人称枪模（改手感只动这一个文件）
 *   audio.ts    WebAudio 实时合成音效（无音频资源）
 *   level.ts    程序化关卡（船体 / 集装箱 / 狙击台）+ 碰撞盒 + 导航网格
 *   physics.ts  碰撞、移动、射线（**无游戏状态**，纯函数）
 *   combat.ts   伤害结算与开火（玩家和 Bot 共用一条路径）
 *   bot.ts      机器人状态机 + A* 寻路
 *   engine.ts   主循环，把上面几块焊在一起，对外只暴露一个 `ShipGame`
 *
 * ## 坐标系
 *
 * 用 three.js 的原生系：**x 右、y 上、z 朝屏幕外**，1 单位 = 1 米。
 * `yaw` 弧度，0 = 朝 -z，**逆时针为正**（往左转）；`pitch` 弧度，正 = 抬头。
 * 引擎内部全程用这一套，不需要任何轴交换 —— 这是相对上一版（逻辑层用
 * x/y/z=东/南/上，渲染时再换一次）最大的简化。
 */

/* ============================================================
   阵营 / 难度 / 画质
   ============================================================ */

export type Team = 0 | 1;

export type Difficulty = 'easy' | 'normal' | 'hard';
export type Quality = 'low' | 'mid' | 'high';

/**
 * 对局规模：**每队人数（含本机玩家）**。
 *
 * 值同时就是界面上的 `1v1 / 3v3 / 6v6` —— 不另做映射，协议里也只走这一个数。
 */
export const TEAM_SIZE_OPTIONS = [1, 3, 6] as const;
export type TeamSize = (typeof TEAM_SIZE_OPTIONS)[number];

export type PrimaryId = 'ak47' | 'm4a1' | 'awm' | 'shotgun';
export type WeaponId = PrimaryId | 'usp' | 'knife' | 'grenade';
export type SlotId = 'primary' | 'secondary' | 'melee' | 'throwable';

/**
 * 判「这把枪是不是主武器」。联机副本用它对齐 `Player.primary`：
 * 快照里只带当前**手里**的武器（切到刀 / 雷 / 手枪时不是主武器），
 * 只有主武器才允许写回 `primary`，否则买菜单的高亮会被一把小刀顶掉。
 */
export function isPrimaryId(value: WeaponId): value is PrimaryId {
  return value === 'ak47' || value === 'm4a1' || value === 'awm' || value === 'shotgun';
}

/** 背包顺序：1 主武器 / 2 手枪 / 3 刀 / 4 手雷。 */
export const SLOT_ORDER: readonly SlotId[] = ['primary', 'secondary', 'melee', 'throwable'];

/** 表面材质，只决定弹痕、火花颜色和能不能穿透。 */
export type Surface = 'metal' | 'wood';

/* ============================================================
   死亡体验
   ============================================================ */

/**
 * 命中反馈的等级。
 *
 * 三档而不是「中/不中」两档：普通命中是白色标记，爆头要红、要更响，
 * 击杀还要再多一层播报。全用同一种反馈的话，玩家打完一梭子分不出
 * 「我打中了头」还是「我打中了腿」。
 */
export type HitTier = 'hit' | 'head' | 'kill';

/**
 * 命中标记的位置：**真实命中点**的屏幕坐标（NDC，-1..1，原点在屏幕中心）。
 *
 * 引擎已经把它夹在准星附近（±0.2），所以 React 侧不需要再夹一次。没有这个字段
 * 表示「拿不到命中点」（近战、或者点在相机背后），此时按屏幕正中画。
 */
export interface HitSpot {
  x: number;
  y: number;
}

/**
 * 玩家自己打死人时推给 React 的一次性反馈（击杀图标 / 屏幕脉冲 / 连杀角标）。
 *
 * 为什么单独一个回调而不是复用 `onHitMarker('kill')`：命中标记只是准星外面四根
 * 斜杠，它只需要知道「颜色分三档」；而击杀图标要的是**这次击杀是不是爆头**、
 * **是第几杀** —— 这两件事在 `HitTier` 里已经被压扁成 `'kill'` 了。
 * 硬塞进去就要么把 `HitTier` 拆成两个维度，要么让 React 侧再猜一次。
 */
export interface KillFeedback {
  /** 致死一击是不是爆头。决定图标金色/银色、有没有放射光 */
  head: boolean;
  /** 这一杀之后的连杀数（1 = 单杀）。React 侧 ≥2 时画 ×N 角标 */
  streak: number;
  /** 致死一击用的武器，将来做刀杀 / 雷杀角标要用 */
  weapon: WeaponId;
}

/**
 * 玩家死亡时相机的阶段。
 *
 *   dying     倒地动画（镜头从 1.6m 跌到贴地、roll 60°~90°）
 *   gaze      死亡凝视（贴地静止 + 去饱和 + 击杀信息卡）
 *   spectate  观战（镜头升起，切到击杀者第三人称）
 *   respawn   复活那一帧（**没有镜头过渡**：当帧硬切回第一人称，见 `death-cam.ts`）
 *
 * React 拿它决定去饱和强度、死亡 UI 出现的时机 —— 引擎不描述「长什么样」，
 * 只说「现在处于哪一段」。
 */
export type DeathPhase = 'alive' | 'dying' | 'gaze' | 'spectate' | 'respawn';

/** 玩家被打死时推给 React 的一次性信息（击杀信息卡的全部内容）。 */
export interface DeathInfo {
  /** 击杀者名字。**`null` 表示「世界」**（摔死 / 自己炸自己）。 */
  killer: string | null;
  killerIsPlayer: boolean;
  killerTeam: Team;
  weapon: WeaponId;
  /** 致死一击是不是爆头 */
  head: boolean;
  /** 击杀距离（米，取整）。没有凶手时为 0 */
  distance: number;
  /** 致死一击的实际伤害（护甲吸收之后） */
  damage: number;
}

/* ============================================================
   对局参数
   ============================================================ */

/**
 * 结束方式：打满时长 / 先到人头目标。
 *
 * 🔴 **两者互斥，不是「或」**。上一版模式页把「对局时长」和「人头目标」两行同时
 * 摆在屏幕上，玩家看到的是两条并行条件，自然会以为两个都要满足；引擎里也确实是
 * `timeLeft <= 0 || score >= killTarget` 的先到先算 —— 于是「人头目标 60」还没打满，
 * 5 分钟一到就结算了。现在只允许选一个，另一个数值行整行不渲染，引擎也只认一个。
 */
export type EndMode = 'time' | 'kills';

/** 模式页「结束方式」那两档，顺序即界面顺序。 */
export const END_MODE_OPTIONS = ['time', 'kills'] as const;

export interface MatchRules {
  /** 结束条件：时长到点 / 人头打满。决定下面两个数哪个生效 */
  endMode: EndMode;
  /** 先到这个击杀数结束（仅 `endMode === 'kills'` 时参与判定） */
  killTarget: number;
  /** 或打满这么多秒（仅 `endMode === 'time'` 时参与判定） */
  durationSec: number;
  /** 每队人数（含本机玩家）：1v1 / 3v3 / 6v6 */
  teamSize: TeamSize;
  difficulty: Difficulty;
}

export interface GameSettings {
  sensitivity: number;
  /** 开镜（AWM 右键）时叠加在 `sensitivity` 上的倍率。狙击镜视野窄，0.5 是「开镜更稳」的惯常手感 */
  adsSensitivity: number;
  fov: number;
  volume: number;
  quality: Quality;
}

export const DEFAULT_RULES: MatchRules = {
  // 默认按时长：这是 CF 团队竞技的常规规则，也是「不选也能直接开打」的那一档
  endMode: 'time',
  killTarget: 40,
  durationSec: 10 * 60,
  // 默认 6v6：以前写死 5v5（10 人），6v6 是"满场"的那一档
  teamSize: 6,
  difficulty: 'normal',
};

/**
 * 模式页上可选的**对局时长**（秒）。
 *
 * 引擎原来写死 10 分钟，玩家没有「打一小局就走」的选项；这三个档位对应
 * 「快打一局 / 标准 / 长局」，不再提供任意输入 —— 手输框在手机上是最难用的一种控件。
 */
export const DURATION_OPTIONS = [5 * 60, 10 * 60, 15 * 60] as const;

/**
 * 模式页上可选的**人头目标**。
 *
 * 满编 12 人时 40 头大约 10 分钟，20 头是「五分钟一局」，60 头是给只想打长局的。
 */
export const KILL_OPTIONS = [20, 40, 60] as const;

export const DEFAULT_SETTINGS: GameSettings = {
  sensitivity: 1,
  adsSensitivity: 0.5,
  fov: 90,
  volume: 0.6,
  quality: 'mid',
};

/**
 * 灵敏度区间。**下限是 0.2，不是 0** —— 0 等于「鼠标怎么推都不转」，
 * 玩家会以为游戏卡死了，而且他没法从画面上判断问题出在哪。
 */
export const SENSITIVITY_RANGE = { min: 0.2, max: 2.5 } as const;

/** 开镜灵敏度倍率区间。复用灵敏度区间 —— 同样不允许 0（等于视角锁死）。 */
export const ADS_SENSITIVITY_RANGE = { min: 0.2, max: 2.5 } as const;

/** 视野区间。低于 70 会晕，高于 105 边缘畸变得太厉害。 */
export const FOV_RANGE = { min: 70, max: 105 } as const;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/**
 * 把一份**可能来自 localStorage 的脏数据**修成合法设置。
 *
 * 为什么必须有这一道：设置是持久化的，而持久化的数据会跨版本活下来。上一版
 * 同一个键里存过 0 灵敏度和另一套画质取值，直接 `{...默认值, ...存下来的}` 合并
 * 的结果就是「进游戏鼠标不动」—— 而且看起来像引擎坏了，不像设置错了。
 * 所以这里逐项夹取，认不出来的值一律回默认。
 */
export function sanitizeSettings(input: Partial<GameSettings> | null | undefined): GameSettings {
  if (!input) return { ...DEFAULT_SETTINGS };
  return {
    sensitivity: clampNumber(input.sensitivity, SENSITIVITY_RANGE.min, SENSITIVITY_RANGE.max, DEFAULT_SETTINGS.sensitivity),
    // 旧版本存档里没有这个键 → undefined → 回默认 0.5
    adsSensitivity: clampNumber(input.adsSensitivity, ADS_SENSITIVITY_RANGE.min, ADS_SENSITIVITY_RANGE.max, DEFAULT_SETTINGS.adsSensitivity),
    fov: clampNumber(input.fov, FOV_RANGE.min, FOV_RANGE.max, DEFAULT_SETTINGS.fov),
    volume: clampNumber(input.volume, 0, 1, DEFAULT_SETTINGS.volume),
    quality:
      input.quality === 'low' || input.quality === 'mid' || input.quality === 'high'
        ? input.quality
        : DEFAULT_SETTINGS.quality,
  };
}

/* ============================================================
   实体
   ============================================================ */

/**
 * 场上任何一个「能被子弹打到的东西」。
 *
 * 玩家和 Bot 都实现它 —— 命中判定、伤害结算、爆炸范围都只认这个接口，
 * 所以 Bot 不需要知道自己打的是人还是机器。
 */
export interface Actor {
  id: string;
  name: string;
  team: Team;
  isPlayer: boolean;
  /**
   * **真人**还是人机。
   *
   * 和 `isPlayer` 是两件事，别合并：`isPlayer` 是「这是本机玩家」（界面把它显示成
   * 「你 / You」），`isHuman` 是「这个角色背后有个活人」（决定用哪套模型、计分板上
   * 标不标「机」）。联机时场上可能有 3 个真人，但只有 1 个是 `isPlayer`。
   */
  isHuman: boolean;
  pos: Vector3;
  vel: Vector3;
  /** 碰撞圆柱半径（判定盒是方柱，不是圆 —— 够用且便宜） */
  radius: number;
  /** 当前身高（蹲下会变），命中盒跟着它走 */
  height: number;
  yaw: number;
  pitch: number;
  health: number;
  armor: number;
  alive: boolean;
  kills: number;
  deaths: number;
  /** 当前手持武器，结算和击杀播报要显示 */
  weapon: WeaponId;
  /** 出生保护截止时间（`performance.now()/1000`） */
  protectUntil: number;
  /** 死亡后累计的秒数，引擎拿它判重生 */
  deathTime: number;
  lastHitBy: Actor | null;
}

/* ============================================================
   HUD 快照（引擎 → React，10Hz）
   ============================================================ */

export interface FeedEntry {
  id: number;
  /**
   * 击杀者名字。**`null` 表示「世界」**（摔死 / 自己炸自己），
   * 显示成哪个词由 React 侧按语言决定 —— 引擎不持有任何界面文案。
   */
  killer: string | null;
  victim: string;
  weapon: WeaponId;
  head: boolean;
  killerTeam: Team;
  victimTeam: Team;
  /** 玩家自己参与的那一条，名字要显示成「你 / You」而不是 `Actor.name`。 */
  killerIsPlayer: boolean;
  victimIsPlayer: boolean;
  /** `performance.now()`，React 侧用来排序和淡出 */
  at: number;
}

export interface ScoreRow {
  id: string;
  name: string;
  team: Team;
  kills: number;
  deaths: number;
  alive: boolean;
  hp: number;
  isPlayer: boolean;
  /** 真人（计分板上要能一眼看出「这条是人机」） */
  isHuman: boolean;
}

/**
 * 联机状态（HUD 用）。
 *
 * `null` = 单人对人机，界面上不出现任何联机元素 —— 单机玩法必须和加这个功能
 * 之前**完全一样**（验收七.8）。
 */
export interface NetHud {
  role: 'host' | 'guest';
  /** 房间码。房主和加入者都能看到，方便念给别人 */
  code: string;
  /** [保卫者, 潜伏者] 的真人数量 */
  humans: [number, number];
  /** [保卫者, 潜伏者] 的人机数量 */
  bots: [number, number];
  /** 场上真人总数（含自己） */
  peers: number;
  /** 已连上但还没选阵营的人数 */
  pending: number;
  /** 对局是否还接受新玩家（结束后为 false） */
  open: boolean;
}

export interface HudSnapshot {
  hp: number;
  armor: number;
  weapon: WeaponId;
  /** 弹匣余量；近战/投掷物为 0 */
  ammo: number;
  /** 备弹。**-1 表示无限** —— 这一版所有枪的备弹都无限，HUD 见到 -1 画 ∞ */
  reserve: number;
  grenades: number;
  reloading: boolean;
  scoped: boolean;
  crouching: boolean;

  dead: boolean;
  /** 剩余重生秒数 */
  respawnIn: number;
  /** 死亡阶段。活着时是 `'alive'` */
  deathPhase: DeathPhase;
  /** 死亡后经过的秒数（活着时为 0）。React 拿它做渐入的暗角 */
  deathTime: number;

  /**
   * 最近一次受伤的来源方向：**屏幕角度**（弧度，0 = 正前，正值 = 右侧）。
   *
   * 放在快照里而不是走一次性回调，是因为这个弧标要跟着玩家转视角 ——
   * 一次性的角度一旦玩家转过去就指错了。10Hz 更新对这个 1.2 秒的指示器完全够用。
   */
  damageFrom: number | null;

  scoreA: number;
  scoreB: number;
  /** 剩余秒数。仅 `endMode === 'time'` 有意义（人头局里它冻在 `durationSec`） */
  timeLeft: number;
  /** 本局已用秒数。仅 `endMode === 'kills'` 有意义（人头局顶部显示正计时） */
  elapsed: number;
  /** 结束方式。决定 HUD 顶部中央显示倒计时还是正计时 */
  endMode: EndMode;
  /**
   * 这一局的目标人头。
   *
   * 放进快照而不是让 React 读自己的 `rules`：联机加入者的规则跟房主走（见
   * `Snapshot.k`），计分板必须显示房主定的那个数，否则「显示 40、20 分就结束」。
   */
  killTarget: number;

  /** 换枪资格：存活 + 复活 ≤5s + 本次生命未耗弹（B 换枪可用） */
  canChangeLoadout: boolean;
  /** 换枪菜单开着 */
  buyOpen: boolean;
  /** 当前选的主武器 */
  primary: PrimaryId;

  feed: FeedEntry[];
  rows: ScoreRow[];
  fps: number;
  /** 联机信息。单人模式恒为 `null` */
  net: NetHud | null;
}

export interface MatchResult {
  win: boolean;
  draw: boolean;
  scoreA: number;
  scoreB: number;
  rows: ScoreRow[];
  mvp: ScoreRow | null;
}

/**
 * 引擎构造参数。
 *
 * 回调全部是「推」而不是「拉」：React 不轮询引擎，引擎也不读 React 的 state。
 * `onMenuChange` 表示 Esc 放掉指针锁定后游戏菜单的开合 —— **游戏不冻结**，
 * 单机/联机一致（联机本来就不能暂停，单机也取消暂停）。
 */
export interface EngineOptions {
  rules: MatchRules;
  settings: GameSettings;
  /** 10Hz 的常规快照 */
  onHud: (hud: HudSnapshot) => void;
  onFinish: (result: MatchResult) => void;
  onMenuChange: (open: boolean) => void;
  onLockChange: (locked: boolean) => void;
  /**
   * 命中反馈。**不走 `onHud`**：命中标记只显示 120ms，10Hz 的快照根本表达不了
   * 「刚刚那一下打中了」这件事，硬塞进去只会变成「标记随机闪烁」。
   *
   * `spot` 是**真实命中点**在屏幕上的位置（NDC），标记就画在那儿，而不是永远
   * 钉在屏幕正中 —— 霰弹边缘弹丸打中侧面的敌人时，玩家能看出「打在他左肩上」。
   *
   * 一次击杀**只推一次**（档位是 `'kill'`）：引擎把同一帧的多颗弹丸、多个目标
   * 合并成一个事件，所以这里不会出现「白标闪一下被红标盖掉」或者霰弹一次推 8 个。
   */
  onHitMarker?: (tier: HitTier, spot?: HitSpot) => void;
  /**
   * 自己打死人。和 `onHitMarker` 分开推，因为两者语义不同：
   * 命中标记回答「我打中了吗」，击杀反馈回答「我打死的是谁、怎么打死的」。
   *
   * 顺序上是 `onHitMarker` 先、`onKillFeedback` 后 —— 和「中了 → 死了」两拍一致。
   */
  onKillFeedback?: (info: KillFeedback) => void;
  /** 自己被打。`strength` 0..1，React 用它控制红色暗角的浓度。 */
  onDamage?: (strength: number) => void;
  /**
   * 玩家被打死。**一次性**，带着击杀信息卡要显示的全部内容。
   *
   * 不走 `onHud`：这张卡是「这一次死亡」的事实，塞进 10Hz 快照就要在引擎里
   * 维护「当前该显示哪一条」的状态，而 React 侧本来就要自己管它什么时候淡出。
   */
  onDeath?: (info: DeathInfo) => void;
  /** 玩家连杀达到 2 次以上时推一次，`count` 是当前连杀数。 */
  onStreak?: (count: number) => void;
  /**
   * 计分板要不要显示（Tab 按住）。
   *
   * 不走 `onHud`：Tab 是**按住才看**的操作，10Hz 的快照会让计分板晚 100ms 才弹出来，
   * 松手时又晚 100ms 才收回去，用起来像卡了。
   */
  onScoreboard?: (visible: boolean) => void;
}
