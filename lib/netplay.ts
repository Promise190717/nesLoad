'use client';

import type { MessageAction, Room, TurnServerConfig } from '@trystero-p2p/mqtt';
import { isConsoleType } from './consoles';
import type { ConsoleType } from './emulator';

/**
 * 局域网联机的「房间层」。
 *
 * 这里没有服务器 —— 但严格说，是「没有**我们自己的**服务器」：
 * WebRTC 建连必须先交换一次 SDP + ICE candidate，这一步需要一个双方都能看到的
 * 会合点。浏览器拿不到 UDP 广播权限，没法在局域网里自己发现彼此，所以这个会合点
 * 借的是 Trystero 的公共 MQTT broker（默认 broker.emqx.io，EMQX 是杭州公司，
 * 国内可达性最好）。broker 只在中途转发几条建连消息，**游戏数据一律走
 * WebRTC DataChannel 点对点直连**，不经过它。
 *
 * 也因此：房间列表（谁在开房）做不到 —— 那需要一台所有人都在线的注册服务器。
 * 房间码是「带外」传递的：创建者看到 4 位码，念给对方，对方输进来。
 *
 * ## 玩法是「房主出画面」
 *
 * 房主本机跑模拟器，把 canvas 的画面（+ 旁路出来的声音）用 WebRTC 推给加入者；
 * 加入者不跑模拟器，只显示一条 `<video>`，按键全部转发给房主。
 * 于是画面天然逐帧一致（本来就是同一帧），加入者也**不需要拥有那盘卡带**。
 *
 * 这是 2026-10-08 定下的方向（此前是「两边各跑各的、只互通按键」，画面会各跑各的）。
 * 所以下面这些是不对称的，别改成对称：
 *   - 只有**加入者**转发按键（房主的按键由 RetroArch 自己读，加入者从画面里看到）
 *   - 只有**房主**注入按键（加入者本机没有模拟器可注入）
 *   - 只有**房主**推流
 */

/**
 * 房间码字符集：Crockford Base32 去掉 I / L / O / U。
 * 去掉 I L O 是因为和 1 0 太像，去掉 U 是为了避免和 V 混淆时拼出脏话。
 */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 4;

/** 输入时常见的看错：把 0 打成 O、1 打成 I/L、V 打成 U。归一回去而不是直接报错。 */
const CONFUSABLE: Record<string, string> = { O: '0', I: '1', L: '1', U: 'V' };

/**
 * 分享链接里那个 query 参数名：`?room=XXXX`。
 *
 * 房间码本来是**带外传递**的（见文件头那段：没有房间列表，得有人念给你听），
 * 这个参数是那条通道的延伸 —— 让整条链接可以直接发出去。
 * **写的一方（NetplayPanel 拼链接）和读的一方（ConsoleScene 解析链接）共用这一个常量**，
 * 别在两边各写一遍 `'room'`，改的时候必然漏一个。
 */
export const ROOM_QUERY_PARAM = 'room';

/**
 * 同一张「网」的标识。两端 appId 一致才能互相发现 —— 改它等于换一张网，
 * 会和旧版本的人失联。
 */
const APP_ID = 'nesload';

/**
 * 可选的 TURN 服务器。构建期是否配了 TURN —— 界面拿它决定「公网」这一档能不能选，
 * 没配就只能标成「正在开发中」。
 *
 * Trystero 默认只带 STUN（`stun1-3.l.google.com` + `stun.cloudflare.com`），**没有 TURN**。
 * 两端只要不能直连 —— 对称 NAT、企业网络封 UDP、路由器开了客户端隔离 —— 就必然失败。
 * 这种情况唯一的解法是给一条中继链路，也就是 TURN。它需要一台自己的服务器
 * （自建 coturn，或用付费服务），所以做成环境变量。
 *
 *   NEXT_PUBLIC_TURN_URL=turn:turn.example.com:3478
 *   NEXT_PUBLIC_TURN_USERNAME=user       （可选）
 *   NEXT_PUBLIC_TURN_CREDENTIAL=pass     （可选）
 *
 * 多个地址用逗号分隔。注意这几个变量**必须原样写成字面量** —— Next 只在构建期对
 * `process.env.NEXT_PUBLIC_*` 做静态替换，写成 `process.env[name]` 取不到值；
 * 也因此这是个**构建期常量**，改了环境变量必须重新构建，热更新不会变。
 */
export const TURN_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_TURN_URL);

/** 按当前档位组出要追加进 `iceServers` 的 TURN 条目。`lan` 档返回空数组（= 只 STUN）。 */
function turnConfig(enabled: boolean): TurnServerConfig[] {
  // `lan` 档：不碰 TURN，和加这个开关之前的行为完全一致
  if (!enabled) return [];

  const raw = process.env.NEXT_PUBLIC_TURN_URL;
  if (!raw) return [];

  const urls = raw
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  if (urls.length === 0) return [];

  return [
    {
      urls,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    },
  ];
}

export type NetplayRole = 'host' | 'guest';

/**
 * 联机走的链路。
 *
 * `lan` —— 只带 STUN，不带 TURN。两端能直连就通，直连不了就失败。
 * `wan` —— 额外带上 TURN 中继兜底。**仍然先试直连**：`iceServers` 里 STUN 在前、
 *          TURN 在后，浏览器按候选优先级（host → srflx → relay）自己挑，直连能通
 *          就不会用中继。所以「选了公网也优先走局域网直连」是白送的，不用写逻辑。
 *
 * 没配 `NEXT_PUBLIC_TURN_URL` 时 `wan` 和 `lan` **实际等价**（`turnConfig()` 返回空数组），
 * 所以界面在 `TURN_CONFIGURED === false` 时直接把「公网」标成开发中。
 */
export type NetplayMode = 'lan' | 'wan';

export { captureFpsFor, DEFAULT_STREAM_QUALITY } from './netplay-media';
export type { StreamQuality } from './netplay-media';
import {
  DEFAULT_STREAM_QUALITY, configureStreamContent, preferLowLatencyAudio,
  preferLowLatencyCodecs, tuneAudioSender, tuneMediaReceiver, tuneVideoSender,
  type StreamQuality,
} from './netplay-media';
import { startNetplayTelemetry } from './netplay-telemetry';
import type { ButtonName } from './keybindings';

/**
 * idle     —— 不在房间里
 * waiting  —— 房间已开/已加入，但对方还没连上
 * connected—— 双方 DataChannel 已通
 */
export type NetplayStatus = 'idle' | 'waiting' | 'connected';

/**
 * 失败原因。存的是**稳定码**而不是库抛的英文原文 —— 界面按码选文案，
 * 原文只进 console。
 *
 * 为什么需要分这么细：Trystero 的 `onJoinError` **只在点对点环节**触发
 * （SDP 交换完连不上、握手超时、房间密码解不开），**MQTT 中继连不上不走它**。
 * 之前所有原因都被界面上那一句「连不上中继」盖住了，指向完全错误的方向。
 */
export type NetplayError =
  /** 房间码格式不对 */
  | 'bad-code'
  /** 页面不是安全上下文（既非 https 也非 localhost），`crypto.subtle` 拿不到 */
  | 'insecure-context'
  /** SDP 换完了但两端建不起直连 —— NAT / 防火墙。Trystero 默认只有 STUN，没有 TURN */
  | 'no-direct-connection'
  /** 房间密码对不上（我们没设密码，正常不该出现） */
  | 'room-password'
  /** 握手超时或失败，通常是对端刚离开 */
  | 'handshake'
  /** 加入者专用：房主退出了房间（房间已被本机主动销毁，不是「暂时掉线」） */
  | 'host-left'
  /** 加入者专用：房间已经有一对在玩了（1 对 1，第三个来的人被房主请出去） */
  | 'room-full'
  /**
   * 加入者专用：等了一会儿没等到房主。
   *
   * ⚠️ 这一条**不是**「房间不存在」这个事实 —— MQTT 那边根本没有「房间」这种对象，
   * 房间只是我们拼出来的 topic 名，加入 = 订阅这个 topic。订阅一个没人订阅过的
   * topic 不会报错，只会永远静默。所以这里只能**等超时**再下结论，
   * 文案必须把「码可能不对」和「房主可能不在」并列写出来，不能只咬定一种。
   */
  | 'no-room'
  /** 其他，原文见 console */
  | 'join-failed';

/**
 * 把 Trystero 抛的英文原文归成稳定码。原文一律 `console.warn` 出去，方便排查。
 * 判据取自 `@trystero-p2p/core` 里那几处 `onJoinError` 的实际文案。
 */
function classifyJoinError(raw: string): NetplayError {
  if (raw.includes('could not connect to peer')) return 'no-direct-connection';
  if (raw.includes('password')) return 'room-password';
  if (raw.includes('handshake') || raw.includes('timed out')) return 'handshake';
  return 'join-failed';
}

/** 房主插着的那盘卡带。加入者拿它显示机身上的卡带和面板上的「房主正在玩」。 */
export interface RemoteGame {
  name: string;
  console: ConsoleType;
}

/**
 * 把会话消息里的 `c` 字段还原成机种。
 *
 * 必须**逐个认**，不能像原先那样只分 snes / 其余一律 nes：机种现在有十二个，
 * 而移动端掌机的面键是**按机种长**的（NES 两颗、SFC 四颗、MD 三颗、街机六颗 ——
 * 见 `HandheldConsole` 的 `FACE_ROWS`）。街机被误判成 nes 的话，加入者手上只有两颗
 * 面键，拳皇那种六键游戏直接没法玩；GBA 被误判成 nes 则少掉 L / R 两颗肩键。
 *
 * 判据走 `lib/consoles.ts` 的登记表而不是手写一串比较 —— 2026-10-14 加机种时
 * 这里曾是「漏了不报错」的地方之一：新机种会被静默降成 nes，表现是
 * 「加入者按了键房主那边没反应」，极难查。
 *
 * 认不出（老版本客户端不发 `c`、或者发了脏值）一律落到 `nes`：它是**按钮最少**的那套，
 * 少给一颗最多是不方便，多给一颗会让人以为按了没反应。
 */
function readConsole(raw: unknown): ConsoleType {
  return typeof raw === 'string' && isConsoleType(raw) ? raw : 'nes';
}

export interface NetplayState {
  status: NetplayStatus;
  role: NetplayRole | null;
  code: string | null;
  /** 对方的 peer id，没连上时为 null */
  peerId: string | null;
  /** 到对方的往返延迟（毫秒），未测出时为 null */
  rtt: number | null;
  /** 建连失败的原因码，正常时为 null */
  error: NetplayError | null;
  /** 房主是否正在出画面。加入者据此决定屏幕显示雪花还是视频 */
  remotePlaying: boolean;
  /** 房主插着的那盘卡带，房主没插卡时为 null */
  remoteGame: RemoteGame | null;
  /**
   * 房主本机暂停着。加入者据此在屏幕上盖一层 PAUSED。
   *
   * 房主自己那条**永远是 false** —— 他不显示「对方暂停了」这种东西（只有房主会
   * 广播会话状态，见 sendSession）。`remotePlaying` 为 false 时它必然也是 false：
   * 没画面就无所谓暂停。
   */
  remotePaused: boolean;
}

export interface NetplayCallbacks {
  onState: (state: NetplayState) => void;
  /**
   * 对方按下了 / 松开了某个手柄钮。**只有房主会真的用到**（注入成 2P）。
   * `role` 是**本地**角色，由控制器回传，避免「回调里要读控制器、控制器又要回调」的循环引用。
   */
  onRemoteButton: (button: string, down: boolean, role: NetplayRole) => void;
  /**
   * 房主推过来的画面流。只有加入者会拿到。
   * 传 null 表示流没了（房主弹卡 / 离开房间），加入者该把视频摘掉。
   */
  onRemoteStream: (stream: MediaStream | null) => void;
}

/**
 * 线上传的按键事件：按钮名 + 按下还是松开。
 *
 * 这里必须用 `type` 而不是 `interface`：Trystero 的 `makeAction<T>` 把 T 约束到
 * `DataPayload`（含 `{ [key: string]: JsonValue }`），而 **TS 只给对象字面量类型的
 * 类型别名补隐式索引签名，interface 不给** —— 写成 interface 会报
 * 「Index signature for type 'string' is missing」。
 */
type ButtonMessage = {
  b: string;
  d: 0 | 1;
};

/**
 * 位图输入：14 个钮各占一位，一次发完整状态。
 *
 * 为什么不再一条 keydown / keyup 发一个包：Trystero 建的 DataChannel 是**有序可靠**的
 * （`peer.mjs` 里 `pc.createDataChannel('data')` 用的默认参数），丢一个包，后面所有输入
 * 都得等它重传 —— 局域网里无所谓，公网上一卡就是几十毫秒的「按键失灵」。位图不怕丢：
 * 下一帧发的是完整状态，丢哪一包都会被下一包纠正，丢掉的 keyup 也不会再把角色卡在
 * 按住状态。
 *
 * 位宽选 16 是因为 `ButtonName` 正好 14 个（见 `lib/keybindings.ts` 的 `ALL_BUTTONS`），
 * 留两位余量。**顺序是协议**：改这张表等于改协议，房主和加入者必须同版本。
 */
const BUTTON_BITS: Record<ButtonName, number> = {
  up: 1 << 0,
  down: 1 << 1,
  left: 1 << 2,
  right: 1 << 3,
  b: 1 << 4,
  a: 1 << 5,
  y: 1 << 6,
  x: 1 << 7,
  l: 1 << 8,
  r: 1 << 9,
  l2: 1 << 10,
  r2: 1 << 11,
  select: 1 << 12,
  start: 1 << 13,
};

const BUTTON_ENTRIES = Object.entries(BUTTON_BITS) as [ButtonName, number][];
const MASK_ALL = (1 << BUTTON_ENTRIES.length) - 1;

/**
 * 位图包。和 ButtonMessage / SessionMessage 一样必须是 `type`（隐式索引签名，见上）。
 *
 * 用新的 action 名 `i`，不和老的 `b` 混在一起：老版本客户端不认识 `i`，收到会直接
 * 丢掉，所以两边都得先确认对方支持（房主在会话包里带 `i: 1`，加入者见到才切过来）。
 */
type MaskMessage = {
  m: number;
};

/**
 * 线上传的会话状态：房主当前在不在出画面、出的是哪盘、**有没有暂停**。
 *
 * 为什么不能只靠媒体流判断「有没有画面」：Trystero 没有「远端流结束」的回调，
 * 房主弹卡之后加入者那边的 `<video>` 会冻在最后一帧上，看着像游戏卡住了。
 * 所以「有没有画面」由这条消息说了算，媒体流只负责像素。
 *
 * 暂停同理，而且是**更需要明说**的一种：暂停时画面不动是设计好的，可加入者手里
 * 那条 `<video>` 冻住的样子和「卡死 / 掉线」一模一样，他本机又没有模拟器、没有那颗
 * 暂停钮（面板那排全灰）—— 不说这一句，他只能对着镜头猜。
 *
 * 和 ButtonMessage 一样，必须是 `type` 而非 `interface`（隐式索引签名，见上）。
 */
type SessionMessage = {
  p: 0 | 1;
  n?: string;
  c?: ConsoleType;
  /**
   * 暂停。字母取 `z` —— 「睡着了」，和 p / n / c 不冲突，短。
   *
   * 用 `?:` 而不是必填是为了**版本错配**：老版本客户端发的包里没有这一位，
   * 收到 undefined 就当「没暂停」（见 onMessage 里的解析），不会翻车。
   */
  z?: 0 | 1;
  /**
   * 房主支持位图输入（`i` action）。
   *
   * 加入者**必须等这一位到了**才把按键切到位图：老版本房主根本没有 `i` 这个 action，
   * 发过去会被静默丢掉，表现就是「怎么按都没反应」。带 `?:` 是为了向下兼容 ——
   * 不认识就当没有，继续走老的 `b` 事件。
   */
  i?: 1;
};

/**
 * 控制指令：房主对**某一个** peer 说的话，和游戏数据无关。
 *
 * 目前只有一种 —— `full`：房间已经有一对了，房主把第三个来的人请出去。
 * 本站是严格的 1 对 1（玩家位只有两个、输入注入靠键位表反查，见文件顶部的说明），
 * 所以**不能**像 Trystero 那样放任多人进来（传输层支持多人，是我们自己不支持）。
 * 为什么不当场就把人踢掉：房主没有「踢人」的 API，能做的只是告诉对方「满了」，
 * 由**对方自己** `leave()` —— 这也是唯一干净的做法（否则那个 peer 会一直挂在房间里，
 * `getPeers()` 里多一条、`heldButtons` 那本账也会串）。
 *
 * 和 ButtonMessage / SessionMessage 一样必须是 `type`（隐式索引签名，见上）。
 */
type ControlMessage = {
  t: 'full';
};

/** 空状态。界面拿它做初值，控制器也拿它做复位。 */
export const IDLE_NETPLAY_STATE: NetplayState = {
  status: 'idle',
  role: null,
  code: null,
  peerId: null,
  rtt: null,
  error: null,
  remotePlaying: false,
  remoteGame: null,
  remotePaused: false,
};

export function generateRoomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return out;
}

/**
 * 加入者等多久还没见到房主就判失败（毫秒）。
 *
 * 为什么只能靠等：信令层（Trystero + MQTT）里的「房间」只是一个由房间码拼出来的
 * topic，加入 = 订阅。订阅一个**没人订阅过**的 topic 完全合法，服务端也不会告诉你
 * 「这房间不存在」—— 于是输错码和房主还没开房在协议层长得一模一样，
 * 界面原先只能一直停在「正在加入房间…」。
 *
 * 20 秒是按「正常建连几秒内就有反应」留的余量：MQTT 连上 + SDP 交换通常在 3 秒内，
 * 网络差也在 10 秒内。再长就不该让用户继续对着一个死房间干等了。
 */
const JOIN_WAIT_MS = 20_000;

/** 把用户输入的码洗干净。长度不对或含非法字符就返回 null（调用方据此报错）。 */
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

/*
 * 「哪个物理键 = 哪个钮」的映射不在这里写死。
 *
 * 加入者转发按键时，那张表由**加入者自己的 1P 键位**反查得到
 * （`lib/keybindings.ts` 的 `codeToButton(bindings.p1)`），所以用户在按键面板里
 * 改了键位，转发立刻跟着变 —— 加入者本机没有模拟器，不需要重插卡带。
 *
 * 这里传的是 `p1` 而不是「他游戏里的 2P」：联机时两人各在自己的键盘前，抢键不成立，
 * 加入者按的该是自己配惯的那套。传过来的也只是钮名，房主自己按 P2 那组合成事件。
 *
 * 为什么用 `e.code` 而不是 `e.key`：code 认的是物理键位，不受输入法、大小写、
 * 以及中文输入状态下 `e.key` 变成 `Process` 的影响。
 *
 * 也正因如此，这里不再需要「host 那张表」—— 房主不转发任何按键，他的输入由
 * RetroArch 自己按 `input_player1_*` 读。
 */

/**
 * 对手柄的哪一号玩家。创建者是 1P，加入者是 2P。
 *
 * 房主本机跑着模拟器，所以只有房主会用到 `remotePlayer` —— 把加入者的输入
 * 注入成 2P。加入者那边没有模拟器（屏幕上是房主推来的画面），不需要注入。
 */
export function localPlayer(role: NetplayRole): number {
  return role === 'host' ? 1 : 2;
}

export function remotePlayer(role: NetplayRole): number {
  return role === 'host' ? 2 : 1;
}

export class NetplayController {
  private room: Room | null = null;
  private buttonAction: MessageAction<ButtonMessage> | null = null;
  private sessionAction: MessageAction<SessionMessage> | null = null;
  private controlAction: MessageAction<ControlMessage> | null = null;
  /** 位图输入通道（协议见 `MaskMessage`）。老版本对端没有这个 action。 */
  private maskAction: MessageAction<MaskMessage> | null = null;
  /** 加入者：房主已经在会话包里声明支持位图（`SessionMessage.i`）。 */
  private maskCapable = false;
  /** 加入者本机当前按住的钮（位图）。 */
  private localMask = 0;
  /** 房主：对方上一帧的位图，用来做差量注入。 */
  private remoteMask = 0;
  /** 同一轮里连按几个键只发一包 —— 微任务里合流，不额外加一帧延迟。 */
  private maskFlushScheduled = false;
  /** 位图心跳：丢包后靠它把状态纠回来。 */
  private maskHeartbeat: ReturnType<typeof setInterval> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  /** 开发态链路体检的停止函数（`lib/netplay-telemetry.ts`）。生产环境是空函数。 */
  private stopTelemetry: (() => void) | null = null;
  /** 加入者的「等房主」超时计时器，见 JOIN_WAIT_MS */
  private joinTimer: ReturnType<typeof setTimeout> | null = null;
  private state: NetplayState = IDLE_NETPLAY_STATE;
  /**
   * 对方当前按着、且已经被我们注入到本机的按钮。
   *
   * 必须记这本账：对方**直接关掉页面**时不会补发 keyup，不管它的话，本机那个玩家位
   * 会永远卡在按住状态（角色一直往一个方向走）。断线 / 离开房间时按账本逐个松开。
   */
  private readonly heldButtons = new Set<string>();
  /**
   * 本机正在推给对方的画面流（房主才有）。
   *
   * 存着它是为了补发：Trystero 的 `addStream` 只作用于**当前已连接**的 peer，
   * 房主先开房、后插卡带（或者对方掉线重连）时都得重新 add 一次，
   * 否则新连上的人永远收不到画面。
   */
  private localStream: MediaStream | null = null;
  /** 本机插着的那盘卡带（房主才有），连上新人时要把这条状态补发过去 */
  private localGame: RemoteGame | null = null;
  /**
   * 本机暂停着没有（房主才有意义）。
   *
   * 为什么不塞进 `localGame`：暂停不改变「在玩哪盘」，它是个独立的开关，
   * 而广播是整包发的 —— 存在成员变量里，晚连上的人也能在补发时拿到当前值。
   */
  private localPaused = false;
  /**
   * 当前出画档位。由 `publishStream` 带进来（帧率已经在那里建流时用掉了），
   * 留着是为了「对方连上 / 补发音频」这些**重新 addStream 的时刻**能再压一遍参数。
   */
  private quality: StreamQuality = DEFAULT_STREAM_QUALITY;
  private readonly tunedConnections = new WeakSet<RTCPeerConnection>();
  /**
   * 画布尺寸观察。
   *
   * 为什么需要它：`tuneVideoSender` 的码率是拿 `track.getSettings()` 的宽高乘出来的，
   * 而建流那一刻画布往往还是 JSX 上的初始 720×540 —— RetroArch 要等核心起完、
   * 布局落定才把画布改成实际大小。2026-11-12 实测：1920 宽的窗口下画布是 1172×879，
   * 码率却仍按 720×540 算，只有 4.67 Mbps，等于每像素 0.057 bit，加入者看到的就是糊的。
   * 尺寸一变就重压一次，这个错配才追得上。
   */
  private sizeWatch: ReturnType<typeof setInterval> | null = null;
  private watchedVideoSize = '';
  private readonly callbacks: NetplayCallbacks;

  constructor(callbacks: NetplayCallbacks) {
    this.callbacks = callbacks;
  }

  get current(): NetplayState {
    return this.state;
  }

  /** 创建房间，返回 4 位房间码。 */
  async host(mode: NetplayMode): Promise<string> {
    const code = generateRoomCode();
    await this.open(code, 'host', mode);
    return code;
  }

  /** 用对方给的码加入。码不合法时走 state.error（'bad-code'），不抛异常。 */
  async join(rawCode: string, mode: NetplayMode): Promise<void> {
    const code = normalizeRoomCode(rawCode);
    if (!code) {
      this.fail('bad-code');
      return;
    }
    await this.open(code, 'guest', mode);
  }

  /**
   * 退出房间（销毁房间）。
   *
   * 房主离开后对方的 `onPeerLeave` 会触发：加入者那边**自己也会调这个** ——
   * 房主一走，加入者手里的房间就没有意义了（见 onPeerLeave）。
   * 房主那边对方走了则退回「等待」，房间继续开着，不用重新开房。
   */
  async leave(): Promise<void> {
    this.stopPing();
    this.stopMaskHeartbeat();
    this.stopTelemetry?.();
    this.stopTelemetry = null;
    // 退房/换房那条「等房主」的计时也要停，否则它会在下一个房间里放着跑
    this.stopJoinWatchdog();
    // 必须在重置 state 之前松 —— releaseHeld 要靠 state.role 才知道该注到哪个玩家位
    this.releaseHeld();

    const room = this.room;
    this.room = null;
    this.buttonAction = null;
    this.sessionAction = null;
    this.controlAction = null;
    this.maskAction = null;
    this.maskCapable = false;
    this.localMask = 0;
    this.remoteMask = 0;
    this.maskFlushScheduled = false;
    this.localGame = null;
    this.localPaused = false;

    // 流要显式收掉：光把 room 置空不会停掉 canvas 的采集，
    // 那张 canvas 会一直被 captureStream 攥着，弹卡之后还在编码。
    const stream = this.localStream;
    this.localStream = null;
    this.stopVideoSizeWatch();
    if (room && stream) room.removeStream(stream);
    if (stream) for (const track of stream.getTracks()) track.stop();

    this.state = IDLE_NETPLAY_STATE;
    this.callbacks.onState(this.state);
    // 加入者那边把视频摘掉，别冻在最后一帧
    this.callbacks.onRemoteStream(null);

    if (room) {
      // 已断开时再调 leave 会抛，这里不该影响界面
      await room.leave().catch(() => undefined);
    }
  }

  /**
   * 把本地按下的键发给对方。没在房间里就是空操作。
   *
   * 对端支持位图时这里只改一个整数、在同一轮微任务里合并成一包；不支持（老版本房主，
   * 或者会话包还没到）就走原来的一条事件一包。两条路的**语义完全一样**，所以调用方
   * （键盘、手柄、虚拟钮、失焦时的一次性松开）不用改。
   */
  sendButton(button: string, down: boolean): void {
    // 用 hasOwnProperty 而不是直接查表：`BUTTON_BITS['toString']` 会命中原型链上的函数
    const known = Object.prototype.hasOwnProperty.call(BUTTON_BITS, button);
    const bit = known ? BUTTON_BITS[button as ButtonName] : 0;
    if (!bit) {
      void this.buttonAction?.send({ b: button, d: down ? 1 : 0 }).catch(() => undefined);
      return;
    }

    /*
     * 位图**不管当前走哪条路都要跟着改**。
     *
     * 会话包到得比第一次按键晚的话，按下那一下是走老 `b` 通道发出去的；如果这里
     * 不记账，切到位图之后按同一颗键松开时，「新状态」和「旧状态」都算不出变化，
     * 那一包就永远不会发 —— 房主那边角色会一直往一个方向走。
     */
    const before = this.localMask;
    this.localMask = down ? before | bit : before & ~bit;

    if (!this.maskCapable || !this.maskAction) {
      void this.buttonAction?.send({ b: button, d: down ? 1 : 0 }).catch(() => undefined);
      return;
    }

    if (this.localMask === before) return;
    this.flushMask();
  }

  /**
   * 把当前位图发出去。
   *
   * 用微任务而不是 rAF：同一轮里「方向键换向」可能连着改两位，合流后只发一包；
   * 而 rAF 在后台标签页会停，恰好错过「切走窗口时松开所有键」那一包 —— 那正是最
   * 需要送出去的一包（否则房主那边角色会一直往一个方向走）。
   */
  private flushMask(): void {
    if (this.maskFlushScheduled || !this.maskAction) return;
    this.maskFlushScheduled = true;
    queueMicrotask(() => {
      this.maskFlushScheduled = false;
      void this.maskAction?.send({ m: this.localMask }).catch(() => undefined);
    });
  }

  /**
   * 位图心跳（250ms 一次）。
   *
   * 位图本身能自愈，但前提是**后面还有包**。用户一直不按键时，最后那一包要是丢了，
   * 房主那边就会保持一个按住的状态直到下次操作 —— 加个低频心跳兜住这一种。
   * 4 包/秒、每包十几字节，可以忽略。
   */
  private startMaskHeartbeat(): void {
    this.stopMaskHeartbeat();
    this.maskHeartbeat = setInterval(() => {
      if (!this.maskCapable || !this.maskAction) return;
      void this.maskAction.send({ m: this.localMask }).catch(() => undefined);
    }, 250);
  }

  private stopMaskHeartbeat(): void {
    if (this.maskHeartbeat !== null) {
      clearInterval(this.maskHeartbeat);
      this.maskHeartbeat = null;
    }
  }

  /**
   * 开始把画面推给对方（房主）。重复调用会先把上一条收掉。
   * 对方还没连上也没关系 —— `onPeerJoin` 会补发。
   *
   * `quality` 就是当前档位：帧率在**建流那一刻**已经定死了（`captureStream(fps)`），
   * 这里能改的是编码侧那几项（分辨率上限 / 码率上限）。换档要连帧率一起换，
   * 所以调用方换档时会重建整条流、再调一次这里。
   */
  publishStream(stream: MediaStream, quality: StreamQuality): void {
    const previous = this.localStream;
    if (previous === stream) return;
    this.localStream = stream;
    this.quality = quality;
    configureStreamContent(stream, quality);
    this.watchVideoSize(stream);
    if (previous) {
      const room = this.room;
      if (room) room.removeStream(previous);
      for (const track of previous.getTracks()) track.stop();
    }
    const room = this.room;
    if (room)
      void Promise.all(room.addStream(stream))
        .then(() => this.tuneStream())
        .catch(() => undefined);
  }

  /** 收掉画面流（房主弹卡 / 退房）。会顺手 stop 掉轨道，否则 canvas 一直被采集。 */
  unpublishStream(): void {
    const stream = this.localStream;
    this.localStream = null;
    this.stopVideoSizeWatch();
    if (!stream) return;
    const room = this.room;
    if (room) room.removeStream(stream);
    for (const track of stream.getTracks()) track.stop();
  }

  /**
   * 盯住采集尺寸，一变就重压参数。
   *
   * 只关心 `getSettings()` 报出来的宽高（= 画布后备尺寸），不关心窗口本身：画布变大
   * 才意味着编码像素变多、码率该跟着涨。500ms 一次足够 —— 画布只会在核心启动和
   * 窗口缩放时变，一秒内最多变一两次。
   *
   * 建流那一刻先把当前尺寸记下来：如果那时画布已经是对的，这次记录就顶掉第一次
   * 「变化」，免得白白多压一遍；如果还是初始的 720×540，等真实尺寸出现时会正好
   * 被判定为「变了」，补上那一次。
   */
  private watchVideoSize(stream: MediaStream): void {
    this.stopVideoSizeWatch();
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    const initial = track.getSettings();
    this.watchedVideoSize =
      initial.width && initial.height ? `${initial.width}x${initial.height}` : '';

    this.sizeWatch = setInterval(() => {
      if (this.localStream !== stream) {
        this.stopVideoSizeWatch();
        return;
      }
      const current = stream.getVideoTracks()[0];
      if (!current) {
        this.stopVideoSizeWatch();
        return;
      }
      const { width = 0, height = 0 } = current.getSettings();
      if (!width || !height) return;
      const key = `${width}x${height}`;
      if (key === this.watchedVideoSize) return;
      this.watchedVideoSize = key;
      this.tuneStream();
    }, 500);
  }

  private stopVideoSizeWatch(): void {
    if (this.sizeWatch !== null) clearInterval(this.sizeWatch);
    this.sizeWatch = null;
    this.watchedVideoSize = '';
  }

  /**
   * 把当前这条流重新 add 一次。
   *
   * 用途是「声音迟到」：RetroArch 的 AudioContext 是核心启动时才建的，抓流那一刻
   * 音频节点有可能还没接上，流里就只有画面。等它出现后往流里 addTrack，再调这里一次。
   * 重复 add 是安全的 —— Trystero 内部会先按 track 查已有的 sender，画面不会推两遍。
   */
  refreshStream(): void {
    const stream = this.localStream;
    const room = this.room;
    if (!stream || !room) return;
    void Promise.all(room.addStream(stream))
      .then(() => this.tuneStream())
      .catch(() => undefined);
  }

  /**
   * 按当前档位把所有视频 sender 压一遍。
   *
   * 几个必须重压的时刻：**对方新连上**（那时才出现 sender）、重新 addStream 之后，
   * 以及每次重建流。参数丢失只会让编码变回默认（费一点），不会断流 ——
   * 所以这里不需要记账，随手重压即可。
   */
  private tuneStream(): void {
    const room = this.room;
    const stream = this.localStream;
    if (!room || !stream) return;
    for (const connection of Object.values(room.getPeers())) {
      // addStream can resolve before SDP negotiation finishes. Reapply after the
      // answer so a new sender never remains on browser defaults indefinitely.
      if (!this.tunedConnections.has(connection)) {
        this.tunedConnections.add(connection);
        connection.addEventListener('signalingstatechange', () => {
          if (this.room === room && connection.signalingState === 'stable') this.tuneStream();
        });
      }
      // 编码格式要在第一次协商之前钉住（见 preferLowLatencyCodecs 的注释）
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) preferLowLatencyCodecs(connection, videoTrack);

      for (const sender of connection.getSenders()) {
        void tuneVideoSender(sender, stream, this.quality);
        // 音频 sender 和视频共用同一条候选对，它多占的每一 kbps 都是视频的排队时间
        void tuneAudioSender(sender);
      }
    }
  }

  /**
   * 向对端要一个关键帧。
   *
   * 新接收端接上轨道时浏览器自己会发 PLI，这一枪是补在「补发流」之后的：那条路上
   * 多了一次 addStream / setParameters，个别实现会把刚出的关键帧等丢掉，表现就是
   * 加入者先看到一两秒灰屏。失败无所谓（Chrome 之外的实现可能没有这个方法）。
   */
  private requestKeyFrame(): void {
    const room = this.room;
    if (!room) return;
    for (const connection of Object.values(room.getPeers())) {
      for (const sender of connection.getSenders()) {
        if (sender.track?.kind !== 'video') continue;
        const keyed = sender as RTCRtpSender & { generateKeyFrame?: () => Promise<void> };
        try {
          const request = keyed.generateKeyFrame?.();
          if (request && typeof request.catch === 'function') void request.catch(() => undefined);
        } catch {
          // 没协商完 / 不支持的实现：忽略
        }
      }
    }
  }

  /**
   * 告诉对方「我现在插的是哪盘卡带 / 没插卡」。房主每次插卡、弹卡都要叫一次。
   *
   * 传 null = 没在出画面。加入者据此把视频摘掉退回雪花 —— 光看媒体流判断不出来，
   * 因为流不会「结束」，只会冻住。
   */
  announceGame(game: RemoteGame | null): void {
    this.localGame = game;
    /*
     * 换卡带 = 换了一张盘，暂停状态跟着归零。
     *
     * 不在这里清会串味：房主「暂停 → 弹卡 → 插新卡」，新卡一上来就被标成暂停着
     * （`setPaused(false)` 是 React 那边的事，控制器看不见）。清在这里就覆盖了
     * 载入 / 弹卡两条路径，调用方不必再各叫一次 announcePaused。
     */
    this.localPaused = false;
    this.sendSession();
  }

  /**
   * 告诉对方「我这边暂停了 / 恢复了」。房主每次按下机身那颗暂停钮都要叫一次。
   *
   * 为什么不复用 `announceGame`：暂停不改变「在玩哪盘」，只是那盘停了。
   * 加入者需要的是「画面为什么不动」这个解释 —— 见 SessionMessage.z 的注释。
   *
   * 非房主调用是空操作（`sendSession` 只认房主），所以加入者那边即使在载入本地卡带时
   * 顺手调了也不会串味。
   */
  announcePaused(paused: boolean): void {
    if (this.localPaused === paused) return;
    this.localPaused = paused;
    this.sendSession();
  }

  private async open(code: string, role: NetplayRole, mode: NetplayMode): Promise<void> {
    // 换房间前先清干净，避免两个 room 同时活着互相抢事件
    await this.leave();

    /*
     * 安全上下文预检。
     *
     * Trystero 建房时就要用 `crypto.subtle` 算 topic 哈希（SHA-1）和信令密钥
     * （SHA-256 → AES-GCM），而这个 API 只在安全上下文（https / localhost）下暴露。
     * 局域网里用 http://192.168.x.x 打开时它是 undefined，库内部会抛错，
     * 界面只会停在「等待中」或报一句看不懂的原因。这里提前拦掉，给出能照着做的提示。
     */
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      this.fail('insecure-context');
      return;
    }

    // Trystero 在模块顶层就会摸 WebSocket，必须动态 import，
    // 否则 Next 的服务端渲染阶段会直接炸。
    const { joinRoom } = await import('@trystero-p2p/mqtt');

    this.state = {
      ...IDLE_NETPLAY_STATE,
      status: 'waiting',
      role,
      code,
    };
    this.callbacks.onState(this.state);

    let room: Room;
    try {
      room = joinRoom({ appId: APP_ID, turnConfig: turnConfig(mode === 'wan') }, code, {
        onJoinError: (details) => {
          // 原文只进 console —— 界面按稳定码选文案（见 classifyJoinError）
          console.warn('[netplay] join error:', details.error, details);
          this.fail(classifyJoinError(details.error));
        },
      });
    } catch (e) {
      console.warn('[netplay] joinRoom threw:', e);
      this.fail('join-failed');
      return;
    }

    this.room = room;
    this.buttonAction = room.makeAction<ButtonMessage>('b');
    this.sessionAction = room.makeAction<SessionMessage>('s');
    this.controlAction = room.makeAction<ControlMessage>('c');
    this.maskAction = room.makeAction<MaskMessage>('i');

    /*
     * 加入者的兜底：房间码打错 / 房主根本没开房时，信令层不会给我们任何事件
     * （见 JOIN_WAIT_MS 的注释），只能自己掐时间。房主那边不计时 ——
     * 空房间干等对方是正常状态，不该被判定成错误。
     */
    if (role === 'guest') this.startJoinWatchdog();

    this.buttonAction.onMessage = (data) => {
      // 对面可能发了脏数据（版本不一致），字段不对就当没收到
      if (typeof data?.b !== 'string') return;
      const role = this.state.role;
      if (!role) return;

      if (data.d === 1) this.heldButtons.add(data.b);
      else this.heldButtons.delete(data.b);

      this.callbacks.onRemoteButton(data.b, data.d === 1, role);
    };

    this.sessionAction.onMessage = (data) => {
      const role = this.state.role;
      if (!role) return;

      /*
       * 房主声明支持位图输入。放在 `p` 判空之前：这一位和「在不在出画面」无关，
       * 但它决定加入者接下来按的键走哪条通道，越早切越好。
       */
      if (role === 'guest' && data?.i === 1) {
        this.maskCapable = true;
        this.startMaskHeartbeat();
        this.flushMask();
      }

      if (data?.p === undefined) return;

      const playing = data.p === 1;
      const game: RemoteGame | null =
        playing && typeof data.n === 'string'
          ? { name: data.n, console: readConsole(data.c) }
          : null;

      this.state = {
        ...this.state,
        remotePlaying: playing,
        remoteGame: game,
        /*
         * 只信「在出画面」时的暂停位。老版本客户端不发 `z`（undefined）、或者发了脏数据，
         * 这里一律落到 false —— 宁可少提示，也不能在别人的画面上凭空盖一层 PAUSED。
         */
        remotePaused: playing && data.z === 1,
      };
      this.callbacks.onState(this.state);

      // 房主弹卡了 —— 把视频摘掉，别让它冻在最后一帧上
      if (!playing) this.callbacks.onRemoteStream(null);
    };

    this.controlAction.onMessage = (data) => {
      /*
       * 房主说「房间满了」。只有加入者会收到这一条（房主自己不发给自己）。
       *
       * 必须**由加入者自己**退出房间：房主没有踢人的 API，而且此时房间还没被
       * 正式认领（下面的 onPeerJoin 会把这个 peer 晾着不动），对方不走的话
       * 会一直挂在 `getPeers()` 里。退完再报 `room-full`，界面据此提示。
       *
       * 顺序和 `host-left` 那边同一个道理：`leave()` 先同步把 state 清空、
       * `.then` 里的 `fail()` 再挂原因码，所以不会被覆盖。
       */
      if (data?.t !== 'full') return;
      void this.leave().then(() => this.fail('room-full'));
    };

    /*
     * 位图输入。只有房主有得注，加入者收到也不该动（他本机没有模拟器）。
     *
     * 差量注入：拿这一帧和上一帧异或，只对变了的位调 pressButton。这样即使位图
     * 重复到达（心跳、或者一次按键没改变状态），也不会反复注入同一个事件。
     */
    this.maskAction.onMessage = (data) => {
      if (typeof data?.m !== 'number') return;
      const role = this.state.role;
      if (role !== 'host') return;

      const next = data.m & MASK_ALL;
      const changed = next ^ this.remoteMask;
      if (changed === 0) return;
      this.remoteMask = next;

      for (const [button, bit] of BUTTON_ENTRIES) {
        if ((changed & bit) === 0) continue;
        const down = (next & bit) !== 0;
        if (down) this.heldButtons.add(button);
        else this.heldButtons.delete(button);
        this.callbacks.onRemoteButton(button, down, role);
      }
    };

    // 房主推来的画面。注意这里**不**直接决定「屏幕显示什么」——
    // 那是 remotePlaying 说了算（见 SessionMessage 的注释）。
    room.onPeerStream = (stream) => {
      for (const connection of Object.values(room.getPeers())) {
        /*
         * 兜一次 SDP 改写。`onPeerJoin` 那一刻 pc 一定在，正常不会走到这里 —
         * 但万一哪天 Trystero 改了握手时序，这条路上补装还能赶上后续的重协商
         * （函数内部有 WeakSet，重复调用是空操作）。
         */
        preferLowLatencyAudio(connection);
        for (const receiver of connection.getReceivers()) tuneMediaReceiver(receiver);
      }
      this.callbacks.onRemoteStream(stream);
    };

    room.onPeerJoin = (peerId) => {
      /*
       * 房间已满 —— 我们是严格的 1 对 1，第三个来的人必须请出去。
       *
       * `peerId` 是单值槽（房间状态只存一个 peer），要是不拦，后来者会**顶掉**
       * 前一个 —— 房主屏幕开始收新人的输入、旧人却还以为自己连着。传输层
       * （Trystero）本来就允许一个房间挂多个 peer，所以这里得我们自己把关。
       *
       * 做法：**只发一句「满了」，然后什么都不做** —— 不认领这个 peer、不记它的 id、
       * 不补发画面/会话状态。对方收到后会自己 `leave()`（见 controlAction.onMessage），
       * 于是这次 onPeerJoin 连带的 `onPeerLeave` 也不会影响台上那一对（因为压根没认领）。
       */
      if (this.state.peerId && this.state.peerId !== peerId) {
        void this.controlAction?.send({ t: 'full' }, { target: peerId }).catch(() => undefined);
        return;
      }

      this.state = { ...this.state, status: 'connected', peerId, error: null };
      this.callbacks.onState(this.state);
      // 人已到场，「等房主」的兜底不用再跑了
      this.stopJoinWatchdog();
      this.startPing(peerId);

      /*
       * SDP 改写要在**媒体协商之前**挂上去 —— 两侧都要挂：房主的 offer 里带
       * opus 的 fmtp，加入者的 answer 里也带一份。
       *
       * 时机是够的：`onPeerJoin` 在 Trystero 握手完成时才回调，而第一次协商
       * （只建 DataChannel）早就交换完了。媒体那条流是在下面 `addStream` 之后
       * 才触发**第二次**协商，所以现在包上去正好赶在那之前。
       */
      const connection = room.getPeers()[peerId];
      if (connection) preferLowLatencyAudio(connection);

      // 只在开发态：每 2 秒一张 getStats 表，生产构建里是空函数
      this.stopTelemetry?.();
      this.stopTelemetry = startNetplayTelemetry(
        this.state.role ?? 'guest',
        () => Object.values(this.room?.getPeers() ?? {})
      );

      // 新 peer 的位图从 0 起算，别拿上一局的残留状态做差量
      this.remoteMask = 0;
      // 加入者：等房主的会话包声明支持后，心跳才真正开始发（见 startMaskHeartbeat）
      if (this.state.role === 'guest') this.startMaskHeartbeat();

      /*
       * 补发：流和会话状态都是在对方连上之前就准备好的，Trystero 不会自动补给后来者。
       * `.then(tuneStream)` 不能省 —— sender 是**这一刻**才出现的，开房时那次
       * `publishStream` 里根本还没有 peer 可以调参数。
       */
      const stream = this.localStream;
      if (stream)
        void Promise.all(room.addStream(stream))
          .then(() => {
            this.tuneStream();
            /*
             * 补一个关键帧：接收端在轨道刚接上时自己也会发 PLI，但这一枪不花什么钱，
             * 能少掉一次「加入后黑屏一两秒」。450ms 留给 SDP 走完。
             */
            setTimeout(() => this.requestKeyFrame(), 450);
          })
          .catch(() => undefined);
      this.sendSession();
    };

    room.onPeerLeave = (peerId) => {
      /*
       * 走的是「被请出去的那个第三个人」—— 他从头到尾就没被认领过
       * （`state.peerId` 不是他），这一整套收尾都不该跑，否则会把台上的房间
       * 误当成「对方走了」给清掉。直接忽略。
       */
      if (this.state.peerId && peerId !== this.state.peerId) return;

      this.stopPing();
      this.stopMaskHeartbeat();
      this.stopTelemetry?.();
      this.stopTelemetry = null;
      this.remoteMask = 0;
      this.maskCapable = false;
      // 对方可能是直接关的页面 —— 他欠的那些 keyup 永远不会到，得我们替他松开
      this.releaseHeld();

      /*
       * 加入者：房主走了。
       *
       * 退回 'waiting' 对加入者是错的 —— 它会对着「等待对方加入」干等，可这个房间里
       * 根本不会再有人来（只有房主手里的码能招人，而房主已经走了）。
       * 所以直接把房间**销毁**掉、回到初始态，并把原因摆出来（'host-left'）。
       *
       * `leave()` 是异步的，但它先把 state 同步重置再 await，所以这里 `.then` 接的
       * `fail()` 一定跑在重置之后 —— 顺序是「先清空、再挂上原因」，不会被覆盖掉。
       *
       * ⚠️ **摘流交给 `leave()` 去做，这里不能提前摘**：先摘流再重置 state 的话，
       * 会有一帧 `remotePlaying` 还是 true 而 `remoteStream` 已经没了 ——
       * 屏幕那句提示的判定是 `!rom && remotePlaying && !remoteStream`，
       * 于是会闪一下 `WAITING FOR HOST`。
       */
      if (this.state.role === 'guest') {
        void this.leave().then(() => this.fail('host-left'));
        return;
      }

      // 房主：对方走了但房间还开着 —— 退回等待，房主不用重新开房
      this.state = {
        ...this.state,
        status: 'waiting',
        peerId: null,
        rtt: null,
        remotePlaying: false,
        remoteGame: null,
        remotePaused: false,
      };
      this.callbacks.onState(this.state);
      // 对方推来的画面作废（房主其实收不到流，这行是防御性的，和改造前保持一致）
      this.callbacks.onRemoteStream(null);
    };
  }

  private sendSession(): void {
    /*
     * 只有房主该广播这个状态。加入者发过去只会把房主那边的 remotePlaying
     * 抹成 false（房主自己不看这两个字段，但留着这种串味的状态迟早出事）。
     */
    if (this.state.role !== 'host') return;

    const game = this.localGame;
    void this.sessionAction
      ?.send({
        p: game ? 1 : 0,
        n: game?.name,
        c: game?.console,
        // 没在出画面时暂停位必然是 0 —— `announceGame` 已经把开关归零了
        z: this.localPaused ? 1 : 0,
        // 本端支持位图输入，加入者见到这一位才切通道（见 MaskMessage）
        i: 1,
      })
      .catch(() => undefined);
  }

  private fail(reason: NetplayError): void {
    this.state = { ...this.state, status: 'idle', error: reason };
    this.callbacks.onState(this.state);
  }

  /**
   * 加入者的「等房主」兜底计时：开着就说明还在等第一个 peer。
   *
   * 到点还没连上就**主动退房**再报原因 —— 和 `host-left` 那边同一个次序
   * （`leave()` 同步重置 state，`.then` 里的 `fail()` 再把原因码挂上去，
   * 否则会被随后那次 `error: null` 的状态刷掉）。
   * 不主动退的话，那个空房间会一直挂在 MQTT 上，用户重新输码时还会撞到它。
   */
  private startJoinWatchdog(): void {
    this.stopJoinWatchdog();
    this.joinTimer = setTimeout(() => {
      this.joinTimer = null;
      // 这中间可能已经连上（stopJoinWatchdog 被叫过）或者用户自己退了 —— 都不是错误
      if (this.state.role !== 'guest' || this.state.status !== 'waiting') return;
      void this.leave().then(() => this.fail('no-room'));
    }, JOIN_WAIT_MS);
  }

  private stopJoinWatchdog(): void {
    if (this.joinTimer !== null) {
      clearTimeout(this.joinTimer);
      this.joinTimer = null;
    }
  }

  private startPing(peerId: string): void {
    this.stopPing();
    const tick = async () => {
      const room = this.room;
      if (!room) return;
      try {
        const rtt = await room.ping(peerId);
        if (this.state.peerId === peerId) {
          this.state = { ...this.state, rtt };
          this.callbacks.onState(this.state);
        }
      } catch {
        // 对面正在断开，下一轮 onPeerLeave 会收尾
      }
    };
    void tick();
    this.pingTimer = setInterval(() => void tick(), 2000);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * 把账本上还按着的按钮逐个松开。
   * 只在「对方不可能再补发 keyup」的时刻调用：断线、离开房间。
   */
  private releaseHeld(): void {
    const role = this.state.role;
    if (role) {
      for (const button of this.heldButtons) {
        this.callbacks.onRemoteButton(button, false, role);
      }
    }
    this.heldButtons.clear();
  }
}
