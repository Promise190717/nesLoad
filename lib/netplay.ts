'use client';

import type { MessageAction, Room, TurnServerConfig } from '@trystero-p2p/mqtt';
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
const CODE_LENGTH = 4;

/** 输入时常见的看错：把 0 打成 O、1 打成 I/L、V 打成 U。归一回去而不是直接报错。 */
const CONFUSABLE: Record<string, string> = { O: '0', I: '1', L: '1', U: 'V' };

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
 * 线上传的会话状态：房主当前在不在出画面、出的是哪盘。
 *
 * 为什么不能只靠媒体流判断「有没有画面」：Trystero 没有「远端流结束」的回调，
 * 房主弹卡之后加入者那边的 `<video>` 会冻在最后一帧上，看着像游戏卡住了。
 * 所以「有没有画面」由这条消息说了算，媒体流只负责像素。
 *
 * 和 ButtonMessage 一样，必须是 `type` 而非 `interface`（隐式索引签名，见上）。
 */
type SessionMessage = {
  p: 0 | 1;
  n?: string;
  c?: ConsoleType;
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
};

export function generateRoomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return out;
}

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
 * 加入者转发按键时，那张表由**加入者自己的 P2 键位**反查得到
 * （`lib/keybindings.ts` 的 `codeToButton(bindings.p2)`），所以用户在按键面板里
 * 改了 2P 键位，转发立刻跟着变 —— 加入者本机没有模拟器，不需要重插卡带。
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
  private pingTimer: ReturnType<typeof setInterval> | null = null;
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
    // 必须在重置 state 之前松 —— releaseHeld 要靠 state.role 才知道该注到哪个玩家位
    this.releaseHeld();

    const room = this.room;
    this.room = null;
    this.buttonAction = null;
    this.sessionAction = null;
    this.localGame = null;

    // 流要显式收掉：光把 room 置空不会停掉 canvas 的采集，
    // 那张 canvas 会一直被 captureStream 攥着，弹卡之后还在编码。
    const stream = this.localStream;
    this.localStream = null;
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

  /** 把本地按下的键发给对方。没在房间里就是空操作。 */
  sendButton(button: string, down: boolean): void {
    void this.buttonAction?.send({ b: button, d: down ? 1 : 0 }).catch(() => undefined);
  }

  /**
   * 开始把画面推给对方（房主）。重复调用会先把上一条收掉。
   * 对方还没连上也没关系 —— `onPeerJoin` 会补发。
   */
  publishStream(stream: MediaStream): void {
    const previous = this.localStream;
    if (previous === stream) return;
    this.localStream = stream;
    if (previous) {
      const room = this.room;
      if (room) room.removeStream(previous);
      for (const track of previous.getTracks()) track.stop();
    }
    const room = this.room;
    if (room) void Promise.all(room.addStream(stream)).catch(() => undefined);
  }

  /** 收掉画面流（房主弹卡 / 退房）。会顺手 stop 掉轨道，否则 canvas 一直被采集。 */
  unpublishStream(): void {
    const stream = this.localStream;
    this.localStream = null;
    if (!stream) return;
    const room = this.room;
    if (room) room.removeStream(stream);
    for (const track of stream.getTracks()) track.stop();
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
    void Promise.all(room.addStream(stream)).catch(() => undefined);
  }

  /**
   * 告诉对方「我现在插的是哪盘卡带 / 没插卡」。房主每次插卡、弹卡都要叫一次。
   *
   * 传 null = 没在出画面。加入者据此把视频摘掉退回雪花 —— 光看媒体流判断不出来，
   * 因为流不会「结束」，只会冻住。
   */
  announceGame(game: RemoteGame | null): void {
    this.localGame = game;
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
      if (!role || data?.p === undefined) return;

      const playing = data.p === 1;
      const game: RemoteGame | null =
        playing && typeof data.n === 'string'
          ? { name: data.n, console: data.c === 'snes' ? 'snes' : 'nes' }
          : null;

      this.state = { ...this.state, remotePlaying: playing, remoteGame: game };
      this.callbacks.onState(this.state);

      // 房主弹卡了 —— 把视频摘掉，别让它冻在最后一帧上
      if (!playing) this.callbacks.onRemoteStream(null);
    };

    // 房主推来的画面。注意这里**不**直接决定「屏幕显示什么」——
    // 那是 remotePlaying 说了算（见 SessionMessage 的注释）。
    room.onPeerStream = (stream) => {
      this.callbacks.onRemoteStream(stream);
    };

    room.onPeerJoin = (peerId) => {
      this.state = { ...this.state, status: 'connected', peerId, error: null };
      this.callbacks.onState(this.state);
      this.startPing(peerId);
      // 补发：流和会话状态都是在对方连上之前就准备好的，Trystero 不会自动补给后来者
      const stream = this.localStream;
      if (stream) void Promise.all(room.addStream(stream)).catch(() => undefined);
      this.sendSession();
    };

    room.onPeerLeave = () => {
      this.stopPing();
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
      ?.send({ p: game ? 1 : 0, n: game?.name, c: game?.console })
      .catch(() => undefined);
  }

  private fail(reason: NetplayError): void {
    this.state = { ...this.state, status: 'idle', error: reason };
    this.callbacks.onState(this.state);
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
