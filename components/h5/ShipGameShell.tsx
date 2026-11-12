'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/lib/i18n';
import { ShipGame } from '@/lib/h5/engine';
import type { InputController } from '@/lib/h5/input';
import {
  DEFAULT_RULES,
  DEFAULT_SETTINGS,
  sanitizeSettings,
  type DeathInfo,
  type DeathPhase,
  type Difficulty,
  type GameSettings,
  type HitSpot,
  type HitTier,
  type HudSnapshot,
  type MatchResult,
  type MatchRules,
  type PrimaryId,
  type Team,
} from '@/lib/h5/types';
import {
  ACTOR_TOTAL,
  NET_STORAGE_KEY,
  readRoomCodeFromLocation,
  type NetErrorCode,
  type RosterWire,
} from '@/lib/h5/net/protocol';
import { ShipLobby, ShipNetSession, type LobbyEntry, type SessionStatus } from '@/lib/h5/net/session';
import { h5Text, type H5TextKey } from '@/lib/h5/ui-text';
import ShipBuyMenu from './ShipBuyMenu';
import { ShipCrosshair, ShipDamageArc, ShipDamageVignette, ShipHitMarker, ShipLowHpPulse } from './ShipCrosshair';
import ShipDeathOverlay from './ShipDeathOverlay';
import ShipHud from './ShipHud';
import ShipKillIcon, { ShipKillPulse } from './ShipKillIcon';
import ShipKillFeed, { ShipStreakBanner } from './ShipKillFeed';
import ShipNetPanel, { type NetScreen } from './ShipNetPanel';
import ShipPauseMenu from './ShipPauseMenu';
import ShipResultPanel from './ShipResultPanel';
import ShipScoreboard from './ShipScoreboard';
import ShipSettingsPanel from './ShipSettingsPanel';
import ShipStartScreen from './ShipStartScreen';
import ShipTouchControls from './ShipTouchControls';

/**
 * H5 射击游戏的**宿主**：一张全屏画布 + 一堆覆盖层。
 *
 * ## 为什么画布从不卸载
 *
 * WebGL 上下文、程序化贴图、几何体全挂在 canvas 上。菜单期间把 canvas 从 DOM 里
 * 摘掉再挂回去，上下文会失效、所有资源要重建 —— 那正好卡在「点开始」那一下。
 * 所以布局永远是「canvas 在最底下，菜单盖在上面」，开一局只是把覆盖层收起来。
 *
 * ## 状态机
 *
 *   ready ──开始──▶ playing ──Esc──▶ paused ──继续──▶ playing
 *     │                │
 *     └──设置──▶（设置面板，可从 ready / paused 打开）
 *                      └──打满时间 / 到人头──▶ result ──再来一局──▶ playing
 *
 * ## 引擎只建一次
 *
 * 换难度、换画质、重开一局**都不重建引擎** —— 引擎提供了 `setDifficulty` /
 * `applySettings` / `start()`，重建一次的代价是重新生成整张地图的贴图（几十毫秒
 * 的同步卡顿，还伴随一次 WebGL 上下文重建）。
 *
 * ## 为什么不用 useCallback / useMemo
 *
 * 这些处理函数捕获的是 `engineRef.current`（命令式对象，不是 state）。项目开了
 * React Compiler，给它看到「捕获 ref 的闭包」会直接放弃编译这个组件。权衡下来：
 * 这个组件本来就要按 10Hz 被 HUD 数据推着重渲染，多几个闭包无感。
 */

type Phase = 'ready' | 'playing' | 'paused' | 'result';

/**
 * 设置存档键。
 *
 * **带版本号，和上一版刻意不同**：上一版往 `nesload:h5-fps:settings` 里存过
 * 一套字段含义不同的数据（灵敏度可能是 0、画质是别的取值）。沿用同一个键，
 * 老访客一进游戏就是「鼠标完全不转」，还很难猜到是设置的问题。
 */
const SETTINGS_KEY = 'nesload:h5-ship:settings:v1';

/** 红色暗角持续多久（毫秒）。比命中标记长一点，让人看清「我在挨打」。 */
const DAMAGE_FLASH_MS = 220;

/**
 * 死亡时给画布加的去饱和强度。
 *
 * 用 CSS `filter` 而不是 three 的后处理链：`EffectComposer` 要多渲染一遍整个场景，
 * 为了一个「死了之后画面变灰」的辅助效果不值得。这里只影响 canvas 一层，
 * HUD 文字仍然是彩色的 —— 正好是想要的层次。
 *
 * 需求给的上限是「辅助效果，不能是全部」，所以最浓也只到 0.42。
 */
const DEATH_SATURATION: Record<DeathPhase, number> = {
  alive: 1,
  dying: 0.82,
  gaze: 0.42,
  spectate: 0.6,
  respawn: 1,
};

export default function ShipGameShell({ locale, backHref }: { locale: Locale; backHref: string }) {
  const text = (key: H5TextKey, vars?: Record<string, string | number>) => h5Text(locale, key, vars);
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('ready');
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [rules, setRules] = useState<MatchRules>(DEFAULT_RULES);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [touch, setTouch] = useState(false);
  /**
   * 命中标记。`spot` 是引擎投影出来的**真实命中点**（NDC），标记画在那儿；
   * 没有就是屏幕正中（近战 / 点在相机背后）。
   */
  const [hitMarker, setHitMarker] = useState<{ at: number; tier: HitTier; spot?: HitSpot }>({
    at: 0,
    tier: 'hit',
  });
  /**
   * 击杀特效。和 `hitMarker` 分开存：命中标记是「准星外面四根斜杠」，击杀图标是
   * 屏幕中下方那个骷髅翅膀勋章 —— 两者可以同时存在（红 hitmarker + 金色勋章），
   * 塞进同一个 state 就会互相覆盖。
   */
  const [killFx, setKillFx] = useState<{ at: number; head: boolean; streak: number }>({
    at: 0,
    head: false,
    streak: 0,
  });
  /** 爆头击杀时准星放大回弹的时间戳。0 = 不播 */
  const [crosshairPulse, setCrosshairPulse] = useState(0);
  const [damage, setDamage] = useState(0);
  /** 最近一次死亡的击杀信息卡。只在 `deathPhase !== 'alive'` 时显示 */
  const [deathInfo, setDeathInfo] = useState<DeathInfo | null>(null);
  /** 连杀播报。`count < 2` 时不显示 */
  const [streak, setStreak] = useState({ count: 0, at: 0 });
  /** 引擎建好之后才有值。触屏按钮要拿它下发虚拟按键。 */
  const [controller, setController] = useState<InputController | null>(null);

  /* ── 联机 ──────────────────────────────────────────────────────
     `netScreen === null` 表示「没有联机覆盖层」，**不代表没联机** —— 对局中
     面板是收起来的（房间码挂在 HUD 左上角）。这两件事刻意分开存。 */
  const [netScreen, setNetScreen] = useState<NetScreen | null>(null);
  const [netError, setNetError] = useState<NetErrorCode | null>(null);
  const [netRoster, setNetRoster] = useState<RosterWire | null>(null);
  const [netRooms, setNetRooms] = useState<LobbyEntry[]>([]);
  const [netJoining, setNetJoining] = useState(false);
  const [netCode, setNetCode] = useState('');
  const [playerName, setPlayerName] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ShipGame | null>(null);
  const settingsRef = useRef<GameSettings>(DEFAULT_SETTINGS);
  const damageTimer = useRef<number | null>(null);
  const netRef = useRef<ShipNetSession | null>(null);
  const lobbyRef = useRef<ShipLobby | null>(null);
  /**
   * 联机是否已经开局。
   *
   * 用途只有一个：开局之后网络层再报错（某个 peer 连不上之类）**不能**弹回
   * 开始界面 —— 那时候人已经在场上打了。开局前的错误才是「这个房间进不去」。
   */
  const netLiveRef = useRef(false);

  // ── 建引擎 ────────────────────────────────────────────────────────
  // 放在微任务里：引擎构造时就会同步回调 `onHud`，在 effect 体内直接 setState
  // 会触发 `react-hooks/set-state-in-effect`（项目里其它组件也是这么绕开的）。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;

      const engine = new ShipGame(canvas, {
        rules: DEFAULT_RULES,
        settings: settingsRef.current,
        onHud: (snapshot) => setHud(snapshot),
        onFinish: (matchResult) => {
          setResult(matchResult);
          setPhase('result');
        },
        onPauseChange: (paused) => setPhase(paused ? 'paused' : 'playing'),
        onLockChange: (value) => setLocked(value),
        onHitMarker: (tier, spot) => setHitMarker({ at: Date.now(), tier, spot }),
        onKillFeedback: (info) => {
          setKillFx({ at: Date.now(), head: info.head, streak: info.streak });
          // 爆头额外让准星「放大回弹」一下 —— 需求里点名要的那一下爽感。
          // 只有爆头才有：普通击杀也弹的话，这个动作就不再有信息量了
          if (info.head) setCrosshairPulse(Date.now());
        },
        onDamage: (strength) => {
          setDamage(strength);
          if (damageTimer.current !== null) window.clearTimeout(damageTimer.current);
          damageTimer.current = window.setTimeout(() => setDamage(0), DAMAGE_FLASH_MS);
        },
        onDeath: (info) => {
          setDeathInfo(info);
          // 死了就把击杀特效清掉。死亡期间击杀勋章已经卸下，重生时它会重新挂载，
          // 留着旧时间戳就会在新一局开局凭空弹一个「你击杀了」的勋章
          setCrosshairPulse(0);
          setKillFx({ at: 0, head: false, streak: 0 });
        },
        onStreak: (count) => setStreak({ count, at: Date.now() }),
        onScoreboard: (visible) => setScoreboardOpen(visible),
      });
      engineRef.current = engine;
      setController(engine.controller);
    });

    return () => {
      cancelled = true;
      if (damageTimer.current !== null) window.clearTimeout(damageTimer.current);
      // 联机资源必须先关：`detachNet` 要在引擎还活着的时候跑（它要摘人机、补人机）
      engineRef.current?.detachNet();
      void netRef.current?.leave();
      netRef.current = null;
      void lobbyRef.current?.close();
      lobbyRef.current = null;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // ── 设置：读盘 / 落盘 / 应用 ──────────────────────────────────────
  useEffect(() => {
    let stored: Partial<GameSettings> | null = null;
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (raw) stored = JSON.parse(raw) as Partial<GameSettings>;
    } catch {
      // 隐私模式 / 坏数据：用默认值，不打断游戏
    }
    const coarse = window.matchMedia('(pointer: coarse)').matches;

    void Promise.resolve().then(() => {
      if (stored) {
        // 逐项夹取：存档可能是上一版留下的，也可能被人手改过
        const merged = sanitizeSettings(stored);
        settingsRef.current = merged;
        setSettings(merged);
        engineRef.current?.applySettings(merged);
      }
      setTouch(coarse);
    });
  }, []);

  const changeSettings = (next: GameSettings) => {
    const clean = sanitizeSettings(next);
    settingsRef.current = clean;
    setSettings(clean);
    engineRef.current?.applySettings(clean);
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(clean));
    } catch {
      // 写不进去就算了，下次打开回到默认值而已
    }
  };

  const changeDifficulty = (difficulty: Difficulty) => {
    setRules((current) => ({ ...current, difficulty }));
    engineRef.current?.setDifficulty(difficulty);
  };

  // ── 对局动作 ──────────────────────────────────────────────────────

  /**
   * 清掉「上一局留下的」一次性 UI 状态。
   *
   * 不清的话：上一局死在观战视角时点「再来一局」，新一局开局会先闪一下
   * 上一局那张击杀信息卡和连杀播报。
   */
  const resetTransient = () => {
    setDeathInfo(null);
    setStreak({ count: 0, at: 0 });
    setHitMarker({ at: 0, tier: 'hit', spot: undefined });
    setKillFx({ at: 0, head: false, streak: 0 });
    setCrosshairPulse(0);
    setDamage(0);
  };

  const startMatch = () => {
    setResult(null);
    resetTransient();
    setPhase('playing');
    engineRef.current?.start();
  };

  const resume = () => {
    setPhase('playing');
    engineRef.current?.resume();
  };

  const restart = () => {
    setResult(null);
    resetTransient();
    setPhase('playing');
    engineRef.current?.start();
  };

  const quitToStart = () => {
    // 联机局退出对局 = 退出联机：光停循环的话，房主那边还会等你 6 秒才补人机
    if (netRef.current) {
      leaveNet();
      return;
    }
    engineRef.current?.stop();
    setResult(null);
    setPhase('ready');
  };

  /** 结算页的「返回专栏」：真的回列表页，不是回开始界面。 */
  const leaveToCatalog = () => {
    engineRef.current?.stop();
    router.push(backHref);
  };

  const selectPrimary = (id: PrimaryId) => {
    engineRef.current?.selectPrimary(id);
  };

  /* ============================================================
     联机
     ============================================================ */

  /**
   * 打开（或复用）房间列表连接。
   *
   * 失败时返回 null 也照常能玩 —— 没有列表还有房间码和邀请链接两条路。
   * 连上之后**不关**：房主要靠它每 2 秒报到，别人才看得见他这一局。
   */
  const ensureLobby = async (): Promise<ShipLobby | null> => {
    if (lobbyRef.current) return lobbyRef.current;
    const lobby = await ShipLobby.open((entries) => setNetRooms(entries));
    if (lobbyRef.current) {
      // 竞态：两次点击各开了一个，留先到的那个
      void lobby.close();
      return lobbyRef.current;
    }
    lobbyRef.current = lobby;
    return lobby;
  };

  /** 玩家名：空串用默认名。引擎和线上协议都按 16 字截断，这里统一。 */
  const resolveName = () => playerName.trim().slice(0, 16) || 'Player';

  const changeName = (next: string) => {
    setPlayerName(next);
    engineRef.current?.setPlayerName(next.trim() || 'Player');
    try {
      window.localStorage.setItem(NET_STORAGE_KEY, JSON.stringify({ name: next.slice(0, 16) }));
    } catch {
      // 存不进去就算了，下次进来回到默认名而已
    }
  };

  const openNetMenu = () => {
    setNetError(null);
    setNetRoster(null);
    setNetScreen('menu');
  };

  /**
   * 网络层状态回调。
   *
   * 开局之后的错误**只进控制台**：那时候人已经在场上打了，弹一张「连不上」的
   * 面板只会挡住画面。开局前的错误才是「这个房间进不去」。
   */
  const handleNetStatus = (status: SessionStatus, error: NetErrorCode | null) => {
    if (status !== 'error') return;
    console.warn('[h5-net] session error:', error);
    if (netLiveRef.current) return;
    setNetJoining(false);
    setNetError(error ?? 'join-failed');
    // 「对局已经结束」有自己的一套说法（需求三.7 要明确提示），不混进通用错误
    setNetScreen(error === 'match-ended' ? 'ended' : 'error');
  };

  /** 收摊：停循环、摘联机、退房间、停报到。所有联机退出口都走这里。 */
  const teardownNet = () => {
    engineRef.current?.stop();
    engineRef.current?.detachNet();
    void netRef.current?.leave();
    netRef.current = null;
    netLiveRef.current = false;
    lobbyRef.current?.stopAnnounce();
    setNetRoster(null);
    setNetJoining(false);
    setNetError(null);
  };

  /** 回开始界面，真的退出联机（开始界面里的「单人」、结算页的「返回」都走它）。 */
  const leaveNet = () => {
    teardownNet();
    setNetScreen(null);
    setNetCode('');
    setPhase('ready');
    setResult(null);
  };

  /** 从「连接中 / 选阵营」退回菜单，不关大厅连接。 */
  const cancelNet = () => {
    teardownNet();
    setNetCode('');
    setNetScreen('menu');
  };

  /**
   * 建房 —— **建完立刻开局**（需求二.2）。
   *
   * 不等人：房主的世界本来就是「1 真人 + 9 人机」，正好是要的初始阵容，
   * 一个人机都不用额外生成（需求二.3）。别人之后随时可以进来替换人机。
   */
  const createRoom = () => {
    const name = resolveName();
    setNetError(null);
    setNetScreen('connecting');

    void (async () => {
      // 先把大厅连上，房主才能被别人的列表看见（连不上也继续，码还能用）
      const lobby = await ensureLobby();
      const session = await ShipNetSession.host(name, { onStatus: handleNetStatus });

      if (session.status === 'error') {
        setNetError(session.error ?? 'join-failed');
        setNetScreen('error');
        return;
      }

      const engine = engineRef.current;
      if (!engine) {
        void session.leave();
        setNetScreen(null);
        return;
      }

      netRef.current = session;
      netLiveRef.current = true;
      setNetCode(session.code);

      engine.setPlayerName(name);
      engine.attachNet(session);

      lobby?.announce({
        code: session.code,
        host: name,
        humans: 1,
        bots: ACTOR_TOTAL - 1,
        open: true,
      });

      setNetScreen(null);
      startMatch();
    })();
  };

  /**
   * 用房间码加入。
   *
   * 先把会话开起来（这样阵营选择界面上的人数就是**实时**的，需求三.2），
   * 但**不**挂到引擎上 —— 引擎一旦进 guest 模式就会把人机全清掉，那时候
   * 万一被房主拒绝，回单人局还得再摆一次。所以挂引擎只发生在拿到回执之后。
   */
  const joinRoom = (code: string) => {
    const name = resolveName();
    setNetError(null);
    setNetRoster(null);
    setNetJoining(false);
    setNetCode(code);
    setNetScreen('team');

    let self: ShipNetSession | null = null;

    void (async () => {
      const session = await ShipNetSession.join(code, name, {
        onStatus: handleNetStatus,
        onRoster: (roster) => setNetRoster(roster),
        onAck: (ack) => {
          if (ack.ok !== 1) return; // 拒绝已经由 onStatus 走了一遍，这里不重复处理
          const engine = engineRef.current;
          if (!self || !engine) return;

          engine.setPlayerName(name);
          // 回执里带着房主**替换完之后**生成的完整快照：先用它摆位再开循环。
          // 不然开局那一下会站在房主世界的原点，然后被下一帧拽过去（需求六.2）
          engine.attachNet(self, ack.id, ack.snap);
          netLiveRef.current = true;
          setNetJoining(false);
          setNetScreen(null);
          startMatch();
        },
        onHostLeft: () => {
          // 房主走了 = 这一局没有裁判了。立刻收摊，别让人对着冻结的场面继续打
          teardownNet();
          setNetScreen('left');
          setPhase('ready');
          setResult(null);
        },
      });

      if (session.status === 'error') {
        setNetError(session.error ?? 'join-failed');
        setNetScreen(session.error === 'match-ended' ? 'ended' : 'error');
        return;
      }

      self = session;
      netRef.current = session;
    })();
  };

  /** 选阵营 → 发申请。`netJoining` 同时把两张卡片禁用，挡住连点（需求三.8）。 */
  const pickTeam = (team: Team) => {
    const session = netRef.current;
    if (!session || netJoining) return;
    setNetJoining(true);
    session.requestJoin(team);
  };

  // 名字 / 邀请链接：进页面就读一次
  useEffect(() => {
    let stored = '';
    try {
      const raw = window.localStorage.getItem(NET_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { name?: unknown };
        if (typeof parsed.name === 'string') stored = parsed.name.slice(0, 16);
      }
    } catch {
      // 坏数据 / 隐私模式：用默认名
    }
    const invited = readRoomCodeFromLocation();

    void Promise.resolve().then(() => {
      if (stored) setPlayerName(stored);
      if (!invited) return;
      // 邀请链接：把面板打开、码填好，用户只差按一下「加入房间」
      setNetCode(invited);
      setNetScreen('menu');
    });
  }, []);

  // 面板一露头就连大厅。纯单机玩家永远不会进这张网 —— 不开面板就不建连
  useEffect(() => {
    if (netScreen === null || lobbyRef.current) return;
    void ensureLobby();
  }, [netScreen]);

  // 房主：人数一变就重报一次，否则列表里永远显示建房那一瞬间的「1 真人 9 人机」
  const netPeers = hud?.net?.peers ?? 0;
  const netBots = (hud?.net?.bots[0] ?? 0) + (hud?.net?.bots[1] ?? 0);
  const netOpen = hud?.net?.open ?? false;
  const isHosting = hud?.net?.role === 'host';

  useEffect(() => {
    if (!isHosting || !netLiveRef.current || !netCode) return;
    lobbyRef.current?.announce({
      code: netCode,
      host: playerName || 'Player',
      humans: netPeers,
      bots: netBots,
      open: netOpen,
    });
  }, [isHosting, netCode, netPeers, netBots, netOpen, playerName]);

  // ── 渲染 ─────────────────────────────────────────────────────────

  const playing = phase === 'playing' || phase === 'paused';
  /** 这一局是不是联机局。`hud.net === null` 就是单人局 —— 单人玩法一点不碰 */
  const netMode = Boolean(hud?.net);
  const deathPhase: DeathPhase = hud?.deathPhase ?? 'alive';

  /**
   * 死亡时画面慢慢褪色、重生再褪回来。
   *
   * 去饱和挂在 canvas 上而不是整页：HUD 文字要保持彩色，只有 3D 画面变灰 ——
   * 正好是想要的层次。这是**辅助氛围**，需求明确禁止用全屏色块表达死亡。
   *
   * 活着的时候也保留 `saturate(1)`：CSS 无法在 `none` 和 `saturate()` 之间插值，
   * 写成 `undefined` 会让死亡那一刻「啪」地跳一下。空转一个色彩矩阵不值几个钱。
   */
  const canvasStyle = {
    filter: `saturate(${DEATH_SATURATION[deathPhase]})`,
    transition: 'filter 700ms linear',
  };

  return (
    <div className="relative h-[100dvh] w-full touch-none overflow-hidden bg-[#080a0d] select-none">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" style={canvasStyle} />

      {playing && hud ? (
        <>
          <ShipCrosshair scoped={hud.scoped} dead={hud.dead} pulseAt={crosshairPulse} />
          <ShipDamageArc angle={hud.damageFrom} />
          <ShipDamageVignette strength={damage} />
          <ShipLowHpPulse hp={hud.hp} />
          {/* 连杀时**不弹边缘脉冲**：那一下已经有「双杀/三杀」大字和 ×N 角标了，
              再加一层全屏脉冲就是三个东西同时抢注意力（需求：不要堆叠过多） */}
          {killFx.streak >= 2 ? null : <ShipKillPulse at={killFx.at} head={killFx.head} />}
          <ShipHitMarker at={hitMarker.at} tier={hitMarker.tier} spot={hitMarker.spot} />
          {/* 自己死了就别再弹击杀勋章了 —— 它会正好压在死亡信息卡上面 */}
          {hud.dead ? null : <ShipKillIcon at={killFx.at} head={killFx.head} streak={killFx.streak} />}
          <ShipDeathOverlay
            info={deathInfo}
            phase={deathPhase}
            deathTime={hud.deathTime}
            respawnIn={hud.respawnIn}
            locale={locale}
          />
          <ShipStreakBanner streak={streak.count} at={streak.at} locale={locale} />
          <ShipKillFeed feed={hud.feed} locale={locale} />
          <ShipHud
            hud={hud}
            locale={locale}
            touch={touch}
            onOpenBuy={() => engineRef.current?.openBuyMenu()}
          />
          {touch && phase === 'playing' && !hud.buyOpen && !hud.dead ? (
            <ShipTouchControls
              controller={controller}
              locale={locale}
              onOpenBuy={() => engineRef.current?.openBuyMenu()}
            />
          ) : null}
        </>
      ) : null}

      {/* 没拿到指针锁定时的提示。`pointer-events-none` 是刻意的：这一层不能挡住
          画布，玩家点一下画面由引擎重新申请锁定。 */}
      {phase === 'playing' && !locked && !touch && !hud?.buyOpen ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[22%] z-20 flex justify-center">
          <div className="flex items-center gap-2.5 border border-[#343a42] bg-[#0d1116]/85 px-4 py-2 backdrop-blur-sm">
            <span className="text-[13px] font-semibold text-white">{text('hint.lock')}</span>
            <span className="text-[11px] text-white/45">{text('settings.controls.pause')}</span>
          </div>
        </div>
      ) : null}

      {playing && scoreboardOpen && hud ? (
        <ShipScoreboard hud={hud} locale={locale} killTarget={rules.killTarget} />
      ) : null}

      {playing && hud?.buyOpen ? (
        <ShipBuyMenu
          hud={hud}
          locale={locale}
          onSelect={selectPrimary}
          onClose={() => engineRef.current?.closeBuyMenu()}
        />
      ) : null}

      {phase === 'ready' ? (
        <ShipStartScreen
          locale={locale}
          difficulty={rules.difficulty}
          onDifficulty={changeDifficulty}
          onStart={startMatch}
          onNet={openNetMenu}
          onSettings={() => setSettingsOpen(true)}
          backHref={backHref}
        />
      ) : null}

      {/* 联机面板。z-20，和开始界面同层，但渲染在后面 —— 盖在它上面 */}
      {netScreen ? (
        <ShipNetPanel
          locale={locale}
          screen={netScreen}
          error={netError}
          roster={netRoster}
          code={netCode}
          name={playerName}
          onName={changeName}
          rooms={netRooms}
          joining={netJoining}
          onCreate={createRoom}
          onJoin={joinRoom}
          onPickTeam={pickTeam}
          onBack={leaveNet}
          onCancel={cancelNet}
        />
      ) : null}

      {phase === 'paused' && !settingsOpen ? (
        <ShipPauseMenu
          locale={locale}
          onResume={resume}
          // 联机局不给「重新开始」：比分是全场共用的，单方面清掉就违反了
          // 「不因加入 / 退出而重置比分」（需求六.4）
          onRestart={netMode ? undefined : restart}
          onSettings={() => setSettingsOpen(true)}
          onQuit={quitToStart}
        />
      ) : null}

      {phase === 'result' && result ? (
        <ShipResultPanel
          result={result}
          locale={locale}
          onAgain={netMode ? undefined : restart}
          onLeave={leaveToCatalog}
          markBots={netMode}
        />
      ) : null}

      {settingsOpen ? (
        <ShipSettingsPanel
          settings={settings}
          locale={locale}
          onChange={changeSettings}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}
