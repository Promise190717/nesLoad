import type { Actor, PrimaryId, Team, WeaponId } from '../types';

/**
 * H5 射击游戏局域网联机的**线上协议**。
 *
 * 这一层只有「形状」和「常量」，没有任何 Trystero / React / three 依赖 ——
 * `session.ts` 负责把它发出去，`engine.ts` 负责填和读。改协议只动这一个文件。
 *
 * ## 为什么和模拟器联机完全隔开
 *
 * 模拟器那套联机（`lib/netplay.ts`）是 **1 对 1、房主推视频流**，房间码 4 位、
 * appId 是 `nesload`。它和这里的需求（10 人、状态同步、局中加入）根本不是一件事，
 * 硬塞进同一个房间会把两边的协议搅在一起。所以：
 *
 *   · 独立 appId（`nesload-h5-ship`）—— 改它等于换一张网，和模拟器联机永不相见；
 *   · 独立房间码长度（5 位）与 URL 参数名（`shiproom`）；
 *   · 独立 localStorage 键（`nesload:h5-ship:net`）。
 *
 * 验收里那条「不修改现有模拟器联机的应用标识和存储配置」就是靠这三条守住的。
 *
 * ## 谁说了算
 *
 * **房主权威**。房主跑唯一一份真实模拟（移动、命中、伤害、比分、重生），加入者
 * 只做两件事：把自己的输入发上去、把收到的快照画出来。这样「真人替换人机」「人数
 * 恒为 10」「比分不重置」都只有一个裁判，不存在两端各算一套再对不上的问题。
 *
 * 代价是「事实」要等一个来回才回到加入者手里 —— 这条由**本地预测**兜住：
 * 移动和开火表现加入者先在本地演（`engine.updateGuest`），房主的快照只用来
 * 对账和结算（命中、血量、比分）。瞄准（视角）从一开始就是本地即时的。
 */

/* ============================================================
   身份 / 房间
   ============================================================ */

/**
 * 协议版本。两端不一致时房主直接拒绝，避免「字段对不上还硬跑」。
 *
 * v2：`Snapshot.m` 带来结束方式，同时 `t` 变成双语义（剩余 / 已用）。旧加入者
 * 不认识 `m`，会把「已用时」当成剩余时间，t 很小就直接在本机结算 —— 必须拦版本。
 */
export const NET_VERSION = 2;

/**
 * 联机用的「一张网」。**和 `lib/netplay.ts` 的 `nesload` 刻意不同**。
 * 改它等于换一张网，会和旧版本的人失联。
 */
export const NET_APP_ID = 'nesload-h5-ship';

/** 房间列表用的固定房间号（所有人进同一个「大厅」互相报房）。 */
export const LOBBY_ROOM_ID = 'h5-ship-lobby-v1';

/**
 * 房间码字符集：Crockford Base32 去掉 I / L / O / U（和模拟器联机同一套取舍）。
 * 5 位而不是 4 位：这里房间是「多人 + 局中加入」，码短了更容易撞到别人的房间。
 */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 5;

/** 输入时常见的看错：0/O、1/I/L、V/U。归一回去而不是直接报错。 */
const CONFUSABLE: Record<string, string> = { O: '0', I: '1', L: '1', U: 'V' };

/** 分享链接里的参数名：`?shiproom=XXXXX`。写链接和读链接共用这一个常量。 */
export const ROOM_QUERY_PARAM = 'shiproom';

/** 本地存储键（玩家名 / 上次用的房间码）。和模拟器联机的键不共用。 */
export const NET_STORAGE_KEY = 'nesload:h5-ship:net:v1';

/**
 * 场上角色数**不是常量**：由房规的 `teamSize`（1v1 / 3v3 / 6v6）决定，
 * 实际人数 = `2 × teamSize`，最多 12 个。这里不再导出 `ACTOR_TOTAL` ——
 * 以前写死 10，加 6v6 之后任何「硬编码 10」的地方都会算错席位。
 */

/* ============================================================
   频率 / 超时
   ============================================================ */

/**
 * 房主推快照的频率（Hz）。
 *
 * 快照间隔直接算进加入者看到的一切（别人的位置、自己的结算回执）：60Hz 时
 * 平均等半个间隔 ≈ 8ms，30Hz 是 17ms。JSON 一帧约 2~3KB，60Hz ≈ 1.2Mbps，
 * 局域网带宽绰绰有余。加入者自己的移动/开火另有本地预测（`engine.updateGuest`），
 * 不依赖快照间隔。
 */
export const SNAPSHOT_HZ = 60;

/**
 * 加入者上行输入的频率（Hz）。
 *
 * 和快照同频：上行慢半拍等于让房主的模拟整体晚这么多。开火/开镜的**边沿**
 * 不等这个节拍 —— `updateGuest` 里按到就立刻冲一包（见 firePressed 那段）。
 */
export const INPUT_HZ = 60;

/** 房主广播「还能不能加入 / 各队还剩几个人机」的频率（Hz）。 */
export const ROSTER_HZ = 2;

/**
 * 多久收不到某个加入者的输入就判定他掉线（毫秒）。
 *
 * 为什么不做「一断就补人机」：WebRTC 的 `onPeerLeave` 要等 ICE 超时（几秒），
 * 而中途的抖动（切窗口、掉几帧、无线信号抖一下）会短于这个值。取 6 秒 =
 * 「明显不是抖动」的下限，期间那个角色照旧由房主替他站着（`engine` 会把移动
 * 轴归零，人不会一直往前跑）。
 */
export const PEER_TIMEOUT_MS = 6000;

/** 房间列表里一条公告多久没刷新就当作过期（毫秒）。 */
export const LOBBY_STALE_MS = 8000;

/** 房主往房间列表报到的间隔（毫秒）。 */
export const LOBBY_ANNOUNCE_MS = 2000;

/** 加入者等房主回执的上限（毫秒）。超时 = 码错了或房主不在。 */
export const JOIN_WAIT_MS = 20000;

/* ============================================================
   失败原因（稳定码）
   ============================================================ */

/**
 * 失败原因存**稳定码**，界面按码选文案，库抛的英文原文只进 console。
 * 这套做法抄自模拟器联机（`lib/netplay.ts` 的 `NetplayError`），理由一样：
 * 一句「连不上」会把「码打错了」「不是 https」「对端拒绝」混成一团。
 */
export type NetErrorCode =
  /** 页面不是安全上下文（既非 https 也非 localhost） */
  | 'insecure-context'
  /** 房间码格式不对 */
  | 'bad-code'
  /** 等了很久没等到房主：码可能错，房主也可能不在 */
  | 'no-room'
  /** SDP 换完了但建不起直连（NAT / 防火墙） */
  | 'no-direct-connection'
  /** 握手超时，通常是对端刚离开 */
  | 'handshake'
  /** 房主说「这个阵营没有人机可以替换了」 */
  | 'team-full'
  /** 房主说「对局已经结束」 */
  | 'match-ended'
  /** 房主说「你已经在场上了」（重复点击的兜底） */
  | 'already-joined'
  /** 房主说「房间满了」（所有席位都是真人） */
  | 'room-full'
  /** 房主离开了房间 */
  | 'host-left'
  /** 其他，原文见 console */
  | 'join-failed';

/** 房主拒绝加入的原因（回执里带的）。 */
export type JoinRejectReason = 'team-full' | 'match-ended' | 'already-joined' | 'room-full' | 'version';

/* ============================================================
   角色快照（线格式）
   ============================================================ */

/**
 * 一个角色在快照里的一行 —— **定长数组，不是对象**。
 *
 * 满编 12 个角色 × 20Hz，用对象的话每个字段名每帧都要重复 12 遍（`"health":100` 之类），
 * 一帧就多出几百字节。定长数组没有字段名，代价是索引即协议：**改顺序等于改协议**，
 * 两端必须同版本（`NET_VERSION` 守这一条）。
 *
 * 索引表（`ACTOR_*` 常量就是它们，读的时候别硬写数字）：
 *
 *   0  id        string  角色唯一 id（房主分配，全程不变）
 *   1  name      string  显示名（真人 = 玩家名，人机 = BOT_NAMES 里那个）
 *   2  team      0|1
 *   3  flags     number  见 `F_*` 位
 *   4  hp        number
 *   5  kills     number
 *   6  deaths    number
 *   7  weapon    number  `WEAPON_ORDER` 的下标
 *   8  x         9 y      10 z
 *   11 yaw       12 pitch
 *   13 height    number  身高（本版恒定 1.8，字段保留不删：位号一动整包错位）
 *   14 deathTime number  死亡后经过的秒数（重生倒计时靠它）
 *   15 vx        16 vz   水平速度（给走路摆臂用，别让副本自己求导）
 *   17 mag       number  当前弹匣余量（只有本机 HUD 用得到）
 *   18 grenades  number
 */
export type ActorWire = [
  string,
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export const ACTOR_ID = 0;
export const ACTOR_NAME = 1;
export const ACTOR_TEAM = 2;
export const ACTOR_FLAGS = 3;
export const ACTOR_HP = 4;
export const ACTOR_KILLS = 5;
export const ACTOR_DEATHS = 6;
export const ACTOR_WEAPON = 7;
export const ACTOR_X = 8;
export const ACTOR_Y = 9;
export const ACTOR_Z = 10;
export const ACTOR_YAW = 11;
export const ACTOR_PITCH = 12;
export const ACTOR_HEIGHT = 13;
export const ACTOR_DEATH_TIME = 14;
export const ACTOR_VX = 15;
export const ACTOR_VZ = 16;
export const ACTOR_MAG = 17;
export const ACTOR_GRENADES = 18;

/* ---- flags 位 ---- */
/** 活着 */
export const F_ALIVE = 1 << 0;
/** **真人**（房主和所有加入者都是 1，人机是 0）。模型区分只认这一位。 */
export const F_HUMAN = 1 << 1;
/** 正在开镜（AWM） */
export const F_SCOPED = 1 << 2;
/** 正在换弹 */
export const F_RELOADING = 1 << 3;
/**
 * ⚠️ `1 << 4` 曾经是「蹲着」。蹲下功能已整体移除（2026-11-13），这一位**空着不复用**：
 * Service Worker 会把旧前端缓存下来，老客户端仍按旧位图收发，位号一挪就会把
 * 「蹲」读成别的状态。同理见 `IN_*` 的 `1 << 0`。
 */
/** 当前有换枪资格（复活 5 秒内且未开过枪） */
export const F_LOADOUT = 1 << 5;
/** 站在地上（副本推进走路相位要用） */
export const F_GROUND = 1 << 6;

/* ============================================================
   手雷快照（线格式）
   ============================================================ */

/**
 * 快照里的一颗**在飞的手雷** —— 同样是定长数组。
 *
 * 为什么要单独发：投掷物的弹道、反弹、爆炸判定全在房主那边算，加入者本地
 * **没有任何投掷物模拟**。以前只发一条 `boom` 事件，加入者屏幕上就是「空中
 * 什么都没有，1.4 秒后地上凭空炸一下」—— 自己扔的雷也看不见。
 *
 *   0 id     number  房主分配的序号，加入者靠它认出「还是同一颗」
 *   1 x      2 y     3 z
 *
 * 不带速度、不带引信：加入者只负责把球摆对位置，弹道和倒计时都是房主的事，
 * 多发的字段只会诱使下游去「自己算一份」，算出来的和房主对不上反而难看。
 *
 * 位置截到厘米：60Hz 下每帧位移不到 30cm，加入者那边阻尼跟过去就够顺。
 * 这是个**可选字段**（`Snapshot.g`），老版本加入者不读它，不需要升 `NET_VERSION`。
 */
export type GrenadeWire = [number, number, number, number];

export const GRENADE_ID = 0;
export const GRENADE_X = 1;
export const GRENADE_Y = 2;
export const GRENADE_Z = 3;

/* ============================================================
   武器下标
   ============================================================ */

/** `weapon` 字段的下标表。**顺序是协议**，只允许往后追加。 */
export const WEAPON_ORDER: readonly WeaponId[] = ['ak47', 'm4a1', 'awm', 'shotgun', 'usp', 'knife', 'grenade'];

export function weaponToIndex(weapon: WeaponId): number {
  const index = WEAPON_ORDER.indexOf(weapon);
  return index < 0 ? 0 : index;
}

export function indexToWeapon(index: unknown): WeaponId {
  if (typeof index !== 'number') return 'ak47';
  return WEAPON_ORDER[index] ?? 'ak47';
}

/* ============================================================
   输入（加入者 → 房主）
   ============================================================ */

/**
 * 一帧输入。
 *
 * 视角给的是**绝对值**（`y` / `p`）而不是增量：加入者的视角在本地即时生效
 * （瞄准不能有延迟），房主收到后直接把自己的副本摆成同一个朝向。增量的话
 * 丢一包就永久歪掉，还得额外做对账。
 *
 * `k` 是按键位图 —— 和模拟器联机一样，用「完整状态」而不是「事件」：丢包会被
 * 下一包纠正，不会出现「松手了但房主以为还按着」。
 */
export type InputWire = {
  /** 序号，仅用于诊断（房主不按序号丢弃，网络层本身是有序可靠的） */
  s: number;
  /** 视角绝对朝向（弧度） */
  y: number;
  /** 视角绝对俯仰（弧度） */
  p: number;
  /** 前后 -1..1 */
  f: number;
  /** 左右 -1..1 */
  r: number;
  /** 按键位图，见 `IN_*` */
  k: number;
};

/** ⚠️ `1 << 0` 曾是「蹲下」，已移除 —— 空位保留，别把后面的位往前挪（旧缓存的客户端仍按旧位图收发）。 */
export const IN_WALK = 1 << 1;
export const IN_FIRE = 1 << 2;
export const IN_AIM = 1 << 3;
/** 这一帧刚按下开火（半自动 / 近战 / 捏雷的边沿） */
export const IN_FIRE_PRESSED = 1 << 4;
/** 这一帧刚按下右键 */
export const IN_AIM_PRESSED = 1 << 5;
export const IN_JUMP = 1 << 6;
export const IN_RELOAD = 1 << 7;
export const IN_SLOT_PRIMARY = 1 << 8;
export const IN_SLOT_SECONDARY = 1 << 9;
export const IN_SLOT_MELEE = 1 << 10;
export const IN_SLOT_THROWABLE = 1 << 11;
export const IN_CYCLE_NEXT = 1 << 12;
export const IN_CYCLE_PREV = 1 << 13;
export const IN_QUICK_SWITCH = 1 << 14;
export const IN_QUICK_GRENADE = 1 << 15;

/** 换枪（换枪菜单选完主武器）。单独一条消息，不走位图。 */
export type LoadoutWire = {
  p: PrimaryId;
};

/* ============================================================
   事件（房主 → 所有人，随快照捎带）
   ============================================================ */

/**
 * 一次性表现事件。
 *
 * 为什么跟着快照走而不是单独一条 action：一帧里可能有十几条（8 个人机对枪），
 * 每条一次 `send` 会把 DataChannel 打满；塞进快照的 `e` 数组里，天然按帧合并。
 *
 * 这些事件**只影响表现**（枪口焰、曳光、弹孔、血雾、播报），不参与结算 ——
 * 结算在房主那边已经算完了，快照里的血量/比分才是事实。
 */
export type NetEvent =
  /** 有人开了一枪。`t` 是最远命中距离，画曳光用 */
  | { k: 'shot'; id: string; w: number; ox: number; oy: number; oz: number; dx: number; dy: number; dz: number; t: number }
  /** 有人被打中。`a` 为 null 表示没有凶手（摔死 / 自己炸自己） */
  | {
      k: 'hit';
      a: string | null;
      v: string;
      head: boolean;
      dmg: number;
      x: number;
      y: number;
      z: number;
      dx: number;
      dy: number;
      dz: number;
    }
  /** 有人被打死。播报和比分靠它（比分另有一份在快照里） */
  | { k: 'kill'; a: string | null; v: string; w: number; head: boolean }
  /** 子弹打在几何体上（弹孔 + 火花 + 音效） */
  | { k: 'imp'; x: number; y: number; z: number; nx: number; ny: number; nz: number; sf: number; g: boolean }
  /** 本机被打死（只有死者自己会用到这张卡） */
  | { k: 'death'; v: string; a: string | null; w: number; head: boolean; d: number; dmg: number }
  /** 手雷爆炸 */
  | { k: 'boom'; x: number; y: number; z: number }
  /** 对局结束 */
  | { k: 'end' };

/** `sf` 字段：表面材质下标。0 = 金属，1 = 木头（对应 `Surface`）。 */
export const SURFACE_METAL = 0;
export const SURFACE_WOOD = 1;

/* ============================================================
   快照 / 名单
   ============================================================ */

/**
 * 一帧完整对局快照。
 *
 * `a` 里**一定**是场上全部角色（10 个），不是「变了的那几个」：局中加入的人
 * 拿到的第一份快照就是当前完整状态（验收六.2），不需要额外的「全量同步」路径。
 */
export type Snapshot = {
  v: number;
  /** 快照序号，加入者用来丢弃乱序 / 重复 */
  q: number;
  /**
   * 时钟。语义跟结束方式走（见下面的 `m`）：
   *   `m = 0` → **剩余秒数**（倒计时）
   *   `m = 1` → **已用秒数**（正计时）
   *
   * 为什么不发两个数：人头局里剩余时间对玩家完全没意义（它冻在设定时长上），
   * 而加入者 HUD 要显示的正是用时 —— 一个字段切两种语义，省一次协议改动。
   */
  t: number;
  /**
   * 房主设定的目标人头。加入者的 `checkMatchEnd` 和计分板都读它 ——
   * 不同步的话「房主设 60、加入者默认 40」会让加入者提前判自己输。
   * 可选字段：老版本的帧里没有，缺省时沿用本地规则。
   */
  k?: number;
  /**
   * 结束方式：0 = 时长到点，1 = 人头打满。缺省（老帧）按 0 处理。
   *
   * 🔴 必须同步：加入者本地也跑主循环，若它以为「按时长」而房主设的是「按人头」，
   * 它会在自己那台机器上先结算一次 —— 结算页一弹，后面房主的帧就没人看了。
   */
  m?: number;
  /** [保卫者, 潜伏者] */
  s: [number, number];
  a: ActorWire[];
  /**
   * 场上**在飞的手雷**。没人扔就不带这个字段（undefined），不为此付字节。
   *
   * 加入者只拿它画球，不拿它算伤害 —— 爆炸伤害在房主那边已经结算完，
   * `boom` 事件负责表现，这里补的是「球从哪儿飞到哪儿」。
   */
  g?: GrenadeWire[];
  /** 这一帧攒下的事件，可能没有 */
  e?: NetEvent[];
  /** 对局已经结束（之后不再接受加入） */
  f?: boolean;
};

/** 一个阵营的席位。`bots` 同时就是「还能进来几个真人」。 */
export type TeamSlot = {
  /** 真人数量（含房主） */
  h: number;
  /** 人机数量（= 可替换名额） */
  b: number;
};

/**
 * 名单 / 准入状态。房主每 `ROSTER_HZ` 广播一次，未加入的旁观者也能收到 ——
 * 阵营选择界面上的「真人 x / 人机 y / 还能不能进」全部来自它。
 */
export type RosterWire = {
  v: number;
  /** 对局还开着（没结束） */
  o: boolean;
  /** 两个阵营：[保卫者, 潜伏者] */
  t: [TeamSlot, TeamSlot];
  /** 房主名字，加入前显示「正在加入 XXX 的房间」 */
  n: string;
};

export type HelloWire = {
  v: number;
  /** 加入者的名字（显示在计分板 / 播报里） */
  n: string;
};

export type JoinWire = {
  v: number;
  team: Team;
  n: string;
};

export type AckWire =
  | {
      ok: 1;
      v: number;
      /** 房主分配给这个加入者的角色 id —— 加入者据此认出「哪个是我」 */
      id: string;
      team: Team;
      /** 完整对局快照（局中加入的关键：一上来就是当前进度） */
      snap: Snapshot;
    }
  | { ok: 0; v: number; reason: JoinRejectReason };

/** 房间列表里的一条公告（大厅房间里互发）。 */
export type BeaconWire = {
  v: number;
  code: string;
  /** 房主名字 */
  n: string;
  /** 真人 / 人机总数 */
  h: number;
  b: number;
  /** 对局还开着 */
  o: boolean;
};

/* ============================================================
   编解码
   ============================================================ */

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * 把一个 `Actor` 压成一行。
 *
 * 小数位是**刻意截的**：位置到厘米（2 位）、角度到千分之一弧度（3 位）。
 * 局域网里满编 12 个角色 × 20Hz，省下来的字节不多，但能让快照稳定在 1KB 出头，
 * 而「多带 4 位小数」在画面上一个像素都看不出来。
 */
export function encodeActor(actor: Actor, flags: number, mag: number, grenades = 0): ActorWire {
  return [
    actor.id,
    actor.name,
    actor.team,
    flags,
    round(Math.max(0, actor.health), 1),
    actor.kills,
    actor.deaths,
    weaponToIndex(actor.weapon),
    round(actor.pos.x, 2),
    round(actor.pos.y, 2),
    round(actor.pos.z, 2),
    round(actor.yaw, 3),
    round(actor.pitch, 3),
    round(actor.height, 2),
    round(actor.deathTime, 2),
    round(actor.vel.x, 2),
    round(actor.vel.z, 2),
    mag,
    grenades,
  ];
}

/**
 * 把一颗在飞的手雷压成一行（见 `GrenadeWire`）。
 *
 * 只发 id 和位置，不发速度也不发引信：加入者不模拟弹道，两侧各自积分只会
 * 越跑越偏，60Hz 的位置流本身就是最准的那条轨迹。
 */
export function encodeGrenade(id: number, pos: { x: number; y: number; z: number }): GrenadeWire {
  return [id, round(pos.x, 2), round(pos.y, 2), round(pos.z, 2)];
}

/** 读一个数值字段，脏数据一律回 `fallback`（版本不一致时不能让整局崩掉）。 */
export function num(wire: readonly unknown[], index: number, fallback = 0): number {
  const value = wire[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function str(wire: readonly unknown[], index: number, fallback = ''): string {
  const value = wire[index];
  return typeof value === 'string' ? value : fallback;
}

/* ============================================================
   房间码
   ============================================================ */

export function generateRoomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return out;
}

/** 把用户输入的码洗干净。长度不对或含非法字符就返回 null。 */
export function normalizeRoomCode(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .split('')
    .map((ch) => CONFUSABLE[ch] ?? ch)
    .join('');

  if (cleaned.length !== CODE_LENGTH) return null;
  for (const ch of cleaned) {
    if (!CODE_ALPHABET.includes(ch)) return null;
  }
  return cleaned;
}

/** 从地址栏里取房间码（分享链接 `/h5/transport-ship?shiproom=XXXXX`）。 */
export function readRoomCodeFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = new URL(window.location.href).searchParams.get(ROOM_QUERY_PARAM);
  return raw ? normalizeRoomCode(raw) : null;
}

/** 拼一条可以直接发出去的邀请链接（基于当前页面地址，带上语言前缀）。 */
export function roomShareUrl(code: string): string {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  url.searchParams.set(ROOM_QUERY_PARAM, code);
  return url.toString();
}
