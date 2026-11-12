'use client';

import type { MessageAction, Room } from '@trystero-p2p/mqtt';
import type { PrimaryId, Team } from '../types';
import {
  JOIN_WAIT_MS,
  LOBBY_ANNOUNCE_MS,
  LOBBY_ROOM_ID,
  LOBBY_STALE_MS,
  NET_APP_ID,
  NET_VERSION,
  generateRoomCode,
  normalizeRoomCode,
  type AckWire,
  type BeaconWire,
  type HelloWire,
  type InputWire,
  type JoinRejectReason,
  type JoinWire,
  type LoadoutWire,
  type NetErrorCode,
  type RosterWire,
  type Snapshot,
} from './protocol';

/**
 * 联机的**会话层** —— Trystero 房间 + 收发原语，**不含任何游戏逻辑**。
 *
 * 分工：
 *
 *   protocol.ts  线上长什么样（形状、常量、编解码）
 *   session.ts   这里。谁发什么、谁收什么、什么时候算断线
 *   engine.ts    谁该被替换成人机、快照里填什么、收到快照怎么画
 *
 * 这样拆的理由：会话层要能在「还没开局」的时候工作（阵营选择界面要收名单），
 * 而引擎只在开局之后才存在。两边都碰 Trystero 的话，房间的生命周期会被撕成两半。
 *
 * ## 拓扑
 *
 * Trystero 的房间里**所有 peer 互相直连**（它没有星形拓扑），所以 10 人房间是
 * 45 条 DataChannel。这里不打算绕开它（那要自己写信令），而是靠「只让房主发状态」
 * 把流量压到「房主 → 每人一条快照流」：加入者之间互发的只有开局前的一条 `hello`。
 *
 * ## 和模拟器联机的关系
 *
 * 零关系。独立 appId、独立房间码长度、独立存储键（见 protocol.ts 顶部）。
 * 这里也不 import `lib/netplay.ts` 的任何东西 —— 那套是 1 对 1 推视频流，
 * 和这里的状态同步没有一行代码可以复用。
 */

export type SessionRole = 'host' | 'guest';

/**
 * connecting  正在连信令
 * waiting     房间已开/已加入，但还没就绪（房主：等第一个人；加入者：等回执）
 * ready       房主：对局在跑；加入者：已被准入
 * error       失败（原因见 `error`）
 * closed      已退出
 */
export type SessionStatus = 'connecting' | 'waiting' | 'ready' | 'error' | 'closed';

export interface SessionCallbacks {
  onStatus?: (status: SessionStatus, error: NetErrorCode | null) => void;
  /** 房主：有 peer 连上了（还没准入）。加入者也会收到（房间里其他人连上了） */
  onPeerJoin?: (peerId: string) => void;
  /** 房主：某个 peer 掉线了（可能是没准入的旁观者，也可能是场上的人） */
  onPeerLeave?: (peerId: string) => void;
  /** 房主：有人申请加入某个阵营 */
  onJoinRequest?: (peerId: string, team: Team, name: string) => void;
  /** 房主：某个加入者的输入帧 */
  onInput?: (peerId: string, input: InputWire) => void;
  /** 房主：某个加入者换了主武器 */
  onLoadout?: (peerId: string, primary: PrimaryId) => void;
  /** 加入者：房主推来的快照 */
  onSnapshot?: (snapshot: Snapshot) => void;
  /** 加入者：准入回执 */
  onAck?: (ack: AckWire) => void;
  /** 加入者：房主广播的名单 */
  onRoster?: (roster: RosterWire) => void;
  /** 加入者：房主退出了房间 */
  onHostLeft?: () => void;
}

/** 把 Trystero 抛的英文原文归成稳定码。原文一律进 console 方便排查。 */
function classifyJoinError(raw: string): NetErrorCode {
  if (raw.includes('could not connect to peer')) return 'no-direct-connection';
  if (raw.includes('password')) return 'join-failed';
  if (raw.includes('handshake') || raw.includes('timed out')) return 'handshake';
  return 'join-failed';
}

export class ShipNetSession {
  readonly role: SessionRole;
  readonly code: string;
  readonly selfId: string;
  readonly callbacks: SessionCallbacks;

  status: SessionStatus = 'connecting';
  error: NetErrorCode | null = null;

  /** 房间里当前连着的 peer（房主侧还包含没准入的旁观者）。 */
  readonly peers = new Set<string>();
  /** 房主侧：已经准入的 peer → 角色 id。没进这张表的一律不算场上的人。 */
  readonly admitted = new Map<string, string>();

  private room: Room | null = null;
  private helloAction: MessageAction<HelloWire> | null = null;
  private rosterAction: MessageAction<RosterWire> | null = null;
  private joinAction: MessageAction<JoinWire> | null = null;
  private ackAction: MessageAction<AckWire> | null = null;
  private inputAction: MessageAction<InputWire> | null = null;
  private snapAction: MessageAction<Snapshot> | null = null;
  private loadoutAction: MessageAction<LoadoutWire> | null = null;

  /** 加入者：认出来的房主 peer id（第一条 roster / ack 来自谁）。 */
  private hostPeerId: string | null = null;
  /** 加入者：等回执的超时计时。 */
  private joinTimer: ReturnType<typeof setTimeout> | null = null;
  /** 加入者本机名字，`requestJoin` 时带给房主。 */
  private readonly localName: string;
  private closed = false;

  private constructor(role: SessionRole, code: string, selfId: string, name: string, callbacks: SessionCallbacks) {
    this.role = role;
    this.code = code;
    this.selfId = selfId;
    this.localName = name;
    this.callbacks = callbacks;
  }

  /* ============================================================
     开房 / 加入
     ============================================================ */

  /**
   * 建房。**不等任何人** —— 房主开完房立刻就能开局（验收二.2），
   * 人什么时候来、来几个都不影响这一局先跑起来。
   */
  static async host(name: string, callbacks: SessionCallbacks = {}): Promise<ShipNetSession> {
    const code = generateRoomCode();
    return ShipNetSession.open('host', code, name, callbacks);
  }

  /** 用对方给的码加入。码不合法时直接返回一个 `error` 状态的会话，不抛异常。 */
  static async join(rawCode: string, name: string, callbacks: SessionCallbacks = {}): Promise<ShipNetSession> {
    const code = normalizeRoomCode(rawCode);
    if (!code) {
      const session = new ShipNetSession('guest', rawCode, '', name, callbacks);
      session.fail('bad-code');
      return session;
    }
    return ShipNetSession.open('guest', code, name, callbacks);
  }

  private static async open(
    role: SessionRole,
    code: string,
    name: string,
    callbacks: SessionCallbacks,
  ): Promise<ShipNetSession> {
    /*
     * 安全上下文预检。Trystero 建房时就要 `crypto.subtle`（topic 哈希 + 信令密钥），
     * 而这个 API 只在 https / localhost 下暴露。局域网里用 http://192.168.x.x 打开
     * 时它是 undefined —— 提前拦掉，给一句能照着做的提示，而不是停在「连接中」。
     */
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      const broken = new ShipNetSession(role, code, '', name, callbacks);
      broken.fail('insecure-context');
      return broken;
    }

    const { joinRoom, selfId } = await import('@trystero-p2p/mqtt');
    const session = new ShipNetSession(role, code, selfId, name, callbacks);

    let room: Room;
    try {
      room = joinRoom({ appId: NET_APP_ID }, code, {
        onJoinError: (details) => {
          console.warn('[h5-net] join error:', details.error, details);
          session.fail(classifyJoinError(details.error));
        },
      });
    } catch (e) {
      console.warn('[h5-net] joinRoom threw:', e);
      session.fail('join-failed');
      return session;
    }

    session.room = room;
    session.wire(room);
    session.setStatus(role === 'host' ? 'ready' : 'waiting', null);
    if (role === 'guest') session.startJoinWatchdog();
    return session;
  }

  /* ============================================================
     消息绑定
     ============================================================ */

  private wire(room: Room): void {
    this.helloAction = room.makeAction<HelloWire>('hello');
    this.rosterAction = room.makeAction<RosterWire>('roster');
    this.joinAction = room.makeAction<JoinWire>('join');
    this.ackAction = room.makeAction<AckWire>('ack');
    this.inputAction = room.makeAction<InputWire>('input');
    this.snapAction = room.makeAction<Snapshot>('snap');
    this.loadoutAction = room.makeAction<LoadoutWire>('load');

    this.helloAction.onMessage = (data, context) => {
      if (!data || data.v !== NET_VERSION) return;
      if (this.role === 'host') {
        // 有人连上就先把自己的名单推给他 —— 他在阵营选择界面上等着这组数字
        this.callbacks.onPeerJoin?.(context.peerId);
      }
    };

    this.rosterAction.onMessage = (data, context) => {
      if (this.role !== 'guest' || !data || data.v !== NET_VERSION) return;
      this.noteHost(context.peerId);
      // 收到名单 = 房主活着。这时候再掐着「等房间有人」的超时就不对了 ——
      // 用户可能在阵营选择界面上看半分钟。等回执的超时从 `requestJoin` 重新起算
      this.stopJoinWatchdog();
      this.callbacks.onRoster?.(data);
    };

    this.joinAction.onMessage = (data, context) => {
      if (this.role !== 'host' || !data) return;
      if (data.v !== NET_VERSION) {
        // 版本对不上：明确拒绝，别让对面停在「正在加入」
        void this.ackAction?.send({ ok: 0, v: NET_VERSION, reason: 'version' }, { target: context.peerId });
        return;
      }
      const team: Team = data.team === 1 ? 1 : 0;
      const name = typeof data.n === 'string' ? data.n.slice(0, 16) : 'Player';
      this.callbacks.onJoinRequest?.(context.peerId, team, name);
    };

    this.ackAction.onMessage = (data, context) => {
      if (this.role !== 'guest' || !data) return;
      this.noteHost(context.peerId);
      this.stopJoinWatchdog();
      if (data.ok === 1) this.setStatus('ready', null);
      else this.fail(reasonToError(data.reason));
      this.callbacks.onAck?.(data);
    };

    this.inputAction.onMessage = (data, context) => {
      if (this.role !== 'host' || !data) return;
      this.callbacks.onInput?.(context.peerId, data);
    };

    this.loadoutAction.onMessage = (data, context) => {
      if (this.role !== 'host' || !data) return;
      this.callbacks.onLoadout?.(context.peerId, data.p);
    };

    this.snapAction.onMessage = (data, context) => {
      if (this.role !== 'guest' || !data || data.v !== NET_VERSION) return;
      this.noteHost(context.peerId);
      this.callbacks.onSnapshot?.(data);
    };

    room.onPeerJoin = (peerId) => {
      this.peers.add(peerId);
      if (this.role === 'guest') {
        // 主动报到：房主据此知道有个新人要名单（他也会在收到 hello 时回调）
        void this.helloAction?.send({ v: NET_VERSION, n: this.localName }).catch(() => undefined);
      } else {
        this.callbacks.onPeerJoin?.(peerId);
      }
    };

    room.onPeerLeave = (peerId) => {
      this.peers.delete(peerId);
      this.admitted.delete(peerId);
      if (this.role === 'guest') {
        // 房主走了 = 这个房间没有意义了（只有他手里的码能招人）
        if (peerId === this.hostPeerId) this.callbacks.onHostLeft?.();
        return;
      }
      this.callbacks.onPeerLeave?.(peerId);
    };
  }

  /**
   * 加入者：认出房主。
   *
   * **必须用消息的发送方**，不能拿 `peers` 的第一个 —— 房间里可能已经有别的
   * 加入者，谁是房主只有「名单 / 回执 / 快照」的发送方能说明。认错了就会在
   * 房主还活着的时候以为「房主走了」。
   */
  private noteHost(peerId: string): void {
    if (this.role !== 'guest' || this.hostPeerId) return;
    this.hostPeerId = peerId;
  }

  /* ============================================================
     房主侧
     ============================================================ */

  /**
   * 准入一个人。
   *
   * ⚠️ 调用方（engine）必须**先**把场上的人机换成真人，再调这里：回执里带着
   * 快照，加入者一收到就按快照摆位。反过来的话，加入者会先看到「自己已经加入
   * 但场上还是 10 个人机」的一帧。
   */
  admit(peerId: string, actorId: string, team: Team, snapshot: Snapshot): void {
    if (this.role !== 'host') return;
    this.admitted.set(peerId, actorId);
    void this.ackAction
      ?.send({ ok: 1, v: NET_VERSION, id: actorId, team, snap: snapshot }, { target: peerId })
      .catch(() => undefined);
  }

  reject(peerId: string, reason: JoinRejectReason): void {
    if (this.role !== 'host') return;
    void this.ackAction?.send({ ok: 0, v: NET_VERSION, reason }, { target: peerId }).catch(() => undefined);
  }

  broadcastSnapshot(snapshot: Snapshot): void {
    if (this.role !== 'host') return;
    void this.snapAction?.send(snapshot).catch(() => undefined);
  }

  broadcastRoster(roster: RosterWire, target?: string): void {
    if (this.role !== 'host') return;
    void this.rosterAction?.send(roster, target ? { target } : undefined).catch(() => undefined);
  }

  /* ============================================================
     加入者侧
     ============================================================ */

  requestJoin(team: Team): void {
    if (this.role !== 'guest') return;
    // 点「加入」之后才开始等回执：之前的 20 秒是「等房间里有人」，用途不同
    this.startJoinWatchdog();
    void this.joinAction?.send({ v: NET_VERSION, team, n: this.localName }).catch(() => undefined);
  }

  sendInput(input: InputWire): void {
    if (this.role !== 'guest') return;
    void this.inputAction?.send(input).catch(() => undefined);
  }

  sendLoadout(primary: PrimaryId): void {
    if (this.role !== 'guest') return;
    void this.loadoutAction?.send({ p: primary }).catch(() => undefined);
  }

  /* ============================================================
     状态 / 收尾
     ============================================================ */

  private setStatus(status: SessionStatus, error: NetErrorCode | null): void {
    this.status = status;
    this.error = error;
    this.callbacks.onStatus?.(status, error);
  }

  private fail(reason: NetErrorCode): void {
    this.stopJoinWatchdog();
    this.setStatus('error', reason);
  }

  /**
   * 加入者的「等房主」兜底。
   *
   * 信令层的「房间」只是一个由房间码拼出来的 topic，加入 = 订阅一个可能没人的
   * topic。订阅空 topic 不会报错，只会永远静默 —— 所以只能等超时再下结论，
   * 文案必须把「码可能不对」和「房主可能不在」并列写。
   */
  private startJoinWatchdog(): void {
    this.stopJoinWatchdog();
    this.joinTimer = setTimeout(() => {
      this.joinTimer = null;
      if (this.status !== 'waiting') return;
      this.fail(this.peers.size > 0 ? 'join-failed' : 'no-room');
    }, JOIN_WAIT_MS);
  }

  private stopJoinWatchdog(): void {
    if (this.joinTimer !== null) {
      clearTimeout(this.joinTimer);
      this.joinTimer = null;
    }
  }

  async leave(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.stopJoinWatchdog();
    const room = this.room;
    this.room = null;
    this.helloAction = null;
    this.rosterAction = null;
    this.joinAction = null;
    this.ackAction = null;
    this.inputAction = null;
    this.snapAction = null;
    this.loadoutAction = null;
    this.peers.clear();
    this.admitted.clear();
    this.setStatus('closed', null);
    if (room) await room.leave().catch(() => undefined);
  }
}

function reasonToError(reason: JoinRejectReason): NetErrorCode {
  switch (reason) {
    case 'team-full':
      return 'team-full';
    case 'match-ended':
      return 'match-ended';
    case 'already-joined':
      return 'already-joined';
    case 'room-full':
      return 'room-full';
    default:
      return 'join-failed';
  }
}

/* ============================================================
   房间列表（大厅）
   ============================================================ */

/**
 * 局域网房间列表。
 *
 * 没有注册服务器，所以「列表」是这么来的：所有人进**同一个固定的 lobby 房间**，
 * 房主每 2 秒用一条 `beacon` 广播自己的房间码和人数，其他人按 peer 记下来。
 *
 * 代价说清楚：大厅里的人互相直连（N 个人 = N² 条 DataChannel）。局域网里 N 通常
 * 是个位数，这点连接是白送的；而且**只有开着联机面板时才连**，进对局后房主留着
 * （为了继续被看见），加入者会关掉。
 *
 * 找不到 / 连不上大厅不影响任何事：面板上还有房间码和邀请链接两条路。
 */
export interface LobbyEntry {
  code: string;
  host: string;
  humans: number;
  bots: number;
  open: boolean;
  /** 最后一次收到公告的时刻（`Date.now()`） */
  at: number;
}

export class ShipLobby {
  private room: Room | null = null;
  private beacon: MessageAction<BeaconWire> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private readonly byPeer = new Map<string, LobbyEntry>();
  private own: Omit<LobbyEntry, 'at'> | null = null;
  private listener: ((entries: LobbyEntry[]) => void) | null = null;
  private closed = false;

  static async open(onChange: (entries: LobbyEntry[]) => void): Promise<ShipLobby> {
    const lobby = new ShipLobby();
    lobby.listener = onChange;

    if (typeof crypto === 'undefined' || !crypto.subtle) return lobby;

    const { joinRoom } = await import('@trystero-p2p/mqtt');
    try {
      const room = joinRoom({ appId: NET_APP_ID }, LOBBY_ROOM_ID);
      lobby.room = room;
      const beacon = room.makeAction<BeaconWire>('beacon');
      lobby.beacon = beacon;

      beacon.onMessage = (data, context) => {
        if (!data || data.v !== NET_VERSION || typeof data.code !== 'string') return;
        lobby.byPeer.set(context.peerId, {
          code: data.code,
          host: typeof data.n === 'string' ? data.n : '—',
          humans: Number(data.h) || 0,
          bots: Number(data.b) || 0,
          open: data.o !== false,
          at: Date.now(),
        });
        lobby.emit();
      };

      room.onPeerJoin = () => {
        // 新来的可能没看到我刚才那条公告，补发一次
        if (lobby.own) lobby.push();
      };

      room.onPeerLeave = (peerId) => {
        if (lobby.byPeer.delete(peerId)) lobby.emit();
      };

      // 过期清理：房主关页面后公告会留在这里，不清理就是一条永远点不进去的房间
      lobby.pruneTimer = setInterval(() => lobby.prune(), 1000);
    } catch (e) {
      console.warn('[h5-net] lobby unavailable:', e);
    }
    return lobby;
  }

  /** 房主：把自己的房间报上去（每 `LOBBY_ANNOUNCE_MS` 自动重复）。 */
  announce(entry: Omit<LobbyEntry, 'at'>): void {
    this.own = entry;
    this.push();
    if (this.timer) return;
    this.timer = setInterval(() => this.push(), LOBBY_ANNOUNCE_MS);
  }

  /** 房主：对局结束 / 房间关了 —— 立刻停止报到并让列表里那条消失。 */
  stopAnnounce(): void {
    this.own = null;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private push(): void {
    const own = this.own;
    if (!own) return;
    void this.beacon?.send({ v: NET_VERSION, ...own }).catch(() => undefined);
  }

  private prune(): void {
    const cutoff = Date.now() - LOBBY_STALE_MS;
    let changed = false;
    for (const [peer, entry] of this.byPeer) {
      if (entry.at < cutoff) {
        this.byPeer.delete(peer);
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  private emit(): void {
    this.listener?.(this.entries());
  }

  entries(): LobbyEntry[] {
    return [...this.byPeer.values()].sort((a, b) => b.at - a.at);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.stopAnnounce();
    if (this.pruneTimer !== null) clearInterval(this.pruneTimer);
    this.pruneTimer = null;
    const room = this.room;
    this.room = null;
    this.beacon = null;
    this.byPeer.clear();
    if (room) await room.leave().catch(() => undefined);
  }
}
