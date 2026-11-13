'use client';

import { useEffect, useRef, useState } from 'react';
import type { Locale } from '@/lib/i18n';
import { ShipGame } from '@/lib/h5/engine';
import { gameAudio } from '@/lib/h5/audio';
import type { InputController } from '@/lib/h5/input';
import {
  DEFAULT_RULES,
  DEFAULT_SETTINGS,
  sanitizeSettings,
  type DeathInfo,
  type DeathPhase,
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
  LOBBY_ANNOUNCE_MS,
  NET_STORAGE_KEY,
  readRoomCodeFromLocation,
  type NetErrorCode,
  type RosterWire,
  type Snapshot,
} from '@/lib/h5/net/protocol';
import { ShipLobby, ShipNetSession, type LobbyEntry, type SessionStatus } from '@/lib/h5/net/session';
import { preloadWeaponGlbs } from '@/lib/h5/weapons';
import { h5Text, type H5TextKey } from '@/lib/h5/ui-text';
import ShipBuyMenu from './ShipBuyMenu';
import { ShipCrosshair, ShipDamageArc, ShipDamageVignette, ShipHitMarker, ShipLowHpPulse } from './ShipCrosshair';
import ShipDeathOverlay from './ShipDeathOverlay';
import ShipHud from './ShipHud';
import ShipKillIcon, { ShipKillPulse } from './ShipKillIcon';
import ShipKillFeed, { ShipStreakBanner } from './ShipKillFeed';
import ShipLoading, { type LoadStage } from './ShipLoading';
import ShipModeSelect, { type GameMode } from './ShipModeSelect';
import ShipNetPanel, { type NetScreen } from './ShipNetPanel';
import ShipGameMenu from './ShipGameMenu';
import ShipResultPanel from './ShipResultPanel';
import ShipScoreboard from './ShipScoreboard';
import ShipSettingsPanel from './ShipSettingsPanel';
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
 *   mode ──单人 / 建房──▶ loading ──资源就绪──▶ playing ──Esc──▶ menu
 *     │                                  │           │
 *     │                                  │           └──打满时间 / 到人头──▶ result
 *     └──加入房间──▶ lobby(选阵营) ──房主同意──▶ loading ──资源就绪──▶ playing
 *
 * 前两格是 2026-11-13 加的：**先选模式，再加载资源**。以前引擎在页面一挂载就建好，
 * 访客看到的是一个已经能点的开始界面，却分不清「单人」和「多人」是两条路；
 * 而且建引擎那几百毫秒里页面是卡的，没有任何提示。现在选择在前、加载居中。
 *
 * **加房是个例外：阵营选完才载入**（2026-11-13 用户要求）。选阵营要先看见两边
 * 现在有几个人，所以先连房间（开会话不需要引擎）、后拉资源 —— 载入页落在选择
 * 之后，正好当他确认完的等待反馈。单人 / 建房没有要先看一眼的东西，仍然是
 * 「点一下 → 载入 → 开局」。
 *
 * 单人**没有中间站**：人机强度长在模式页的单人卡里，载入一结束就直接开局 ——
 * 以前那张「开始界面」要多点一次才开枪，现在那一次就是 `start.begin`。
 * 房间面板（`lobby`）的「返回」直接回 `mode`。
 *
 * ## 引擎只建一次
 *
 * 换难度、换画质、重开一局、切回模式页再进来**都不重建引擎** —— 引擎提供了
 * `setDifficulty` / `applySettings` / `start()`，重建一次的代价是重新生成整张地图的
 * 贴图（几十毫秒的同步卡顿，还伴随一次 WebGL 上下文重建）。
 *
 * ## 为什么不用 useCallback / useMemo
 *
 * 这些处理函数捕获的是 `engineRef.current`（命令式对象，不是 state）。项目开了
 * React Compiler，给它看到「捕获 ref 的闭包」会直接放弃编译这个组件。权衡下来：
 * 这个组件本来就要按 10Hz 被 HUD 数据推着重渲染，多几个闭包无感。
 */

type Phase = 'mode' | 'loading' | 'lobby' | 'playing' | 'menu' | 'result';

/**
 * 联机要干的那件事。
 *
 * 模式页点「创建房间 / 加入房间」时把意图带进 `enterMode`：建房要等引擎建好
 * 再执行（载入在前），加房则立刻进阵营选择、载入推后（见 `acceptJoin`）。
 * 以前这一步是「先进房间面板、再点一次」，现在点击即意图，中间没有第二页。
 */
type NetIntent = { kind: 'create' } | { kind: 'join'; code: string };

/** 载入页的状态。`pct` 只增不减，`detail` 是进度条右侧的小字（枪模 `3/5`）。 */
interface LoadState {
  pct: number;
  stage: LoadStage;
  detail: string;
}

/**
 * 等枪模的上限。
 *
 * 五个 GLB 是本作唯一的外部资源。超时就直接用程序化枪模开打 —— 下载不会取消，
 * 就绪后 viewmodel 会自己热替换（见 `viewmodel.ts` 构造里的那个 `then`）。
 * 宁可先拿一把朴素点的枪，也不能把人按在载入页上干等。
 */
const GLB_WAIT_MS = 8000;

/** 100% 停留多久再切走。闪一下就消失等于没画。 */
const LOAD_TAIL_MS = 240;

/**
 * 「正在搜索房间」至少亮多久。
 *
 * 大厅连上 ≠ 马上有房间：房主每 `LOBBY_ANNOUNCE_MS`（2s）才广播一次，连接建好
 * 还要等对面报一轮。给一个广播周期 + 一点握手里程碑，超时就老实说「没发现房间」
 * —— 那比一直转圈不说结果好。真晚到的房间照样会冒出来（列表是活的）。
 */
const ROOM_SCAN_MS = LOBBY_ANNOUNCE_MS + 1200;

/** 等浏览器真画过一帧。同步的重活（建引擎）必须排在它后面，否则加载页根本露不出来。 */
const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

const waitFrames = async (count: number): Promise<void> => {
  for (let i = 0; i < count; i += 1) await nextFrame();
};

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

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

  const [phase, setPhase] = useState<Phase>('mode');
  /** 当前选中的模式。选完才加载资源，加载完的落点（开始界面 / 房间列表）由它决定 */
  const [mode, setMode] = useState<GameMode>('solo');
  const [load, setLoad] = useState<LoadState>({ pct: 0, stage: 'boot', detail: '' });
  /** 引擎构造抛错（多半是没有 WebGL）。载入页据此换掉「卡住」的样子 */
  const [loadFailed, setLoadFailed] = useState(false);
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
  /** 击杀时准星「放大回弹」的时间戳。`strong` = 爆头击杀；`at` 为 0 = 不播 */
  const [crosshairPulse, setCrosshairPulse] = useState({ at: 0, strong: false });
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
  /** 大厅刚连上、还没收到第一条广播 —— 面板上「附近的房间」那块显示加载标识 */
  const [netScanning, setNetScanning] = useState(false);
  const [netJoining, setNetJoining] = useState(false);
  const [netCode, setNetCode] = useState('');
  const [playerName, setPlayerName] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ShipGame | null>(null);
  const settingsRef = useRef<GameSettings>(DEFAULT_SETTINGS);
  const damageTimer = useRef<number | null>(null);
  const netRef = useRef<ShipNetSession | null>(null);
  const lobbyRef = useRef<ShipLobby | null>(null);
  /** 「正在搜索房间」的超时闸（见 `ROOM_SCAN_MS`） */
  const scanTimer = useRef<number | null>(null);
  /**
   * 联机是否已经开局。
   *
   * 用途只有一个：开局之后网络层再报错（某个 peer 连不上之类）**不能**弹回
   * 开始界面 —— 那时候人已经在场上打了。开局前的错误才是「这个房间进不去」。
   */
  const netLiveRef = useRef(false);
  /**
   * 房主同意了加入、但引擎还没建好时暂存的回执。
   *
   * 加房的新顺序是「选阵营 → 载入 → 开局」，回执会比引擎早到；`ack.snap` 是房主
   * 替换完人机后的**完整快照**，丢了就得等下一帧快照才站到正确位置（会先闪一下
   * 原点）。所以先存在这里，`finishJoin` 建好引擎后立刻用上。
   */
  const pendingJoinRef = useRef<{ id: string; snap: Snapshot } | null>(null);

  // ── 建引擎 ────────────────────────────────────────────────────────
  /**
   * 组件还活在页面上吗。载入流程跨了好几个 await（两帧 / 枪模 / 尾帧），
   * 每次醒来都要问一遍 —— 用户可能已经点返回专栏走了，那时候再 setState
   * 只会报警告，建出来的引擎也没人回收。
   */
  const aliveRef = useRef(true);
  /** 载入是否在跑。挡连点：模式页的按钮连点两下不能建两个 WebGL 上下文 */
  const loadingRef = useRef(false);
  /**
   * 载入批次号。每次 `enterMode` 领一个新号，`runLoad` 手里那个号一旦过期就整个作废。
   *
   * 为什么需要它：载入页的「返回模式选择」只把 phase 改回 `mode`，流水线还在 await 里
   * 睡着 —— 醒来后照样会 `startMatch()` / 建房，人明明已经退回模式页，几秒后却被拽进
   * 对局。光靠 `aliveRef` 拦不住（组件还活着），也不能用「回来后再点一次」重置一个布尔
   * 标记 —— 旧流水线会跟着复活，最后建出两个 WebGL 上下文。
   */
  const loadSeq = useRef(0);

  /**
   * 引擎构造参数。
   *
   * 以前这段写死在 effect 里（挂载即建）；现在由 `runLoad` 在用户选完模式之后调用，
   * 所以抽成函数 —— 回调全部指向 React 的 setState，和引擎的生命周期无关。
   */
  const createEngine = (canvas: HTMLCanvasElement) =>
    new ShipGame(canvas, {
      rules,
      settings: settingsRef.current,
      onHud: (snapshot) => setHud(snapshot),
      onFinish: (matchResult) => {
        setResult(matchResult);
        setPhase('result');
      },
      onMenuChange: (open) => setPhase(open ? 'menu' : 'playing'),
      onLockChange: (value) => setLocked(value),
      onHitMarker: (tier, spot) => setHitMarker({ at: Date.now(), tier, spot }),
      onKillFeedback: (info) => {
        setKillFx({ at: Date.now(), head: info.head, streak: info.streak });
        // 每次击杀准星都「放大回弹」一下：普通击杀走小一档、爆头走大档 ——
        // 「每次击杀都有确认」和「爆头仍然更值钱」同时成立（与 ShipCrosshair 的档位注释对齐）
        setCrosshairPulse({ at: Date.now(), strong: info.head });
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
        setCrosshairPulse({ at: 0, strong: false });
        setKillFx({ at: 0, head: false, streak: 0 });
      },
      onStreak: (count) => setStreak({ count, at: Date.now() }),
      onScoreboard: (visible) => setScoreboardOpen(visible),
    });

  /**
   * 载入流水线。四段进度对应四件真事，不是定时器摆出来的：
   *
   *   5%   加载页自己先画出来（同步建引擎之前必须让出一帧）
   *   14%  建引擎：WebGL 上下文、货场贴图、环境反射、首帧（这一段是同步的，进度会停住）
   *   52%  五个 GLB 枪模，逐个回调 → 86%
   *   94%  等首帧落屏（shader 编译在这一帧里发生）
   *   100% 停 240ms 再切走
   *
   * 跑完调 `then` —— 它只负责「把引擎和枪模准备好」，接下来做什么由调用方决定：
   * 单人直接开局、房主建完房开局、加入者把房主给的角色挂上去再开局。
   */
  const runLoad = async (canvas: HTMLCanvasElement, seq: number, then: () => void) => {
    /** 组件没了 / 这一批被用户取消（又开了一批）：流水线到此为止 */
    const stopped = () => !aliveRef.current || loadSeq.current !== seq;

    await waitFrames(2);
    if (stopped()) return;

    setLoad({ pct: 14, stage: 'engine', detail: '' });

    let engine: ShipGame;
    try {
      engine = createEngine(canvas);
    } catch (error) {
      // 没有 WebGL / 上下文数量超限：留在这一页给一个出口，别让人对着 0% 干等。
      // 进度条**不补到 100%** —— 那看起来像「加载完了」，可实际什么都没建起来
      console.error('[h5] engine build failed:', error);
      loadingRef.current = false;
      setLoadFailed(true);
      return;
    }

    if (stopped()) {
      engine.dispose();
      return;
    }
    engineRef.current = engine;
    setController(engine.controller);

    setLoad({ pct: 52, stage: 'weapons', detail: '' });

    await Promise.race([
      preloadWeaponGlbs((done, total) => {
        if (stopped()) return;
        // 只在「枪模」这一段里更新：超时（GLB_WAIT_MS）之后流程已经往前走了，
        // 迟到的回调不能再把进度条拽回去 —— 进度只许往前
        setLoad((prev) =>
          prev.stage === 'weapons'
            ? { pct: Math.max(prev.pct, 52 + Math.round((done / total) * 34)), stage: 'weapons', detail: `${done}/${total}` }
            : prev,
        );
      }),
      delay(GLB_WAIT_MS),
    ]);
    if (stopped()) return;

    setLoad({ pct: 94, stage: 'warmup', detail: '' });
    await waitFrames(2);
    if (stopped()) return;

    setLoad({ pct: 100, stage: 'done', detail: '' });
    await delay(LOAD_TAIL_MS);
    if (stopped()) return;

    loadingRef.current = false;
    then();
  };

  /**
   * 模式页上按下的那一下：单人「开始战斗」/ 联机「创建房间」/「加入房间」。
   *
   * **加入别人的房间是个例外：不载入，直接进阵营选择**（2026-11-13 用户要求）。
   * 阵营界面上的人数得是实时的，所以先开会话（不需要引擎）；选完阵营、房主
   * 回执到手，才在 `acceptJoin` 里拉资源。其余两条路（单人 / 建房）仍然是
   * 「先载入，载完就开局」—— 它们没有需要先看一眼的东西。
   *
   * 已经建过引擎（切回模式页再进来）就跳过载入 —— WebGL 上下文、地图贴图、
   * 枪模全在，重来一遍只是白卡几百毫秒。这时进度条根本不出现，动作直接执行。
   */
  const enterMode = (next: GameMode, intent: NetIntent | null = null) => {
    if (loadingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 领新号：上一次没跑完的流水线（如果还有）从这一刻起作废
    const seq = ++loadSeq.current;
    setMode(next);
    setLoadFailed(false);

    // 加房：先把房间连上，在阵营选择里看着实时人数选边（引擎此时还没建）
    if (intent?.kind === 'join') {
      setPhase('lobby');
      joinRoom(intent.code);
      return;
    }

    if (engineRef.current) {
      if (intent) startHosting();
      else startMatch();
      return;
    }

    loadingRef.current = true;
    setLoad({ pct: 5, stage: 'boot', detail: '' });
    setPhase('loading');
    void runLoad(canvas, seq, () => {
      if (intent) startHosting();
      else startMatch();
    });
  };

  // 卸载：联机资源先关（`detachNet` 要在引擎还活着的时候跑，它要摘人机、补人机），
  // 再销毁引擎。**这里不建引擎** —— 建与不建由用户选模式决定，见 `enterMode`。
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (damageTimer.current !== null) window.clearTimeout(damageTimer.current);
      if (scanTimer.current !== null) window.clearTimeout(scanTimer.current);
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

  /**
   * 模式页改对局参数（时长 / 目标人头 / 人机强度）。
   *
   * 引擎只建一次，所以这里必须**立刻**同步进去：等到开局再传就晚了 ——
   * `startMatch` 只负责开跑，不认识「这次的规则变了」。
   */
  const changeRules = (patch: Partial<MatchRules>) => {
    const next = { ...rules, ...patch };
    setRules(next);
    engineRef.current?.setRules(next);
    if (patch.difficulty) engineRef.current?.setDifficulty(patch.difficulty);
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
    setCrosshairPulse({ at: 0, strong: false });
    setDamage(0);
  };

  const startMatch = () => {
    setResult(null);
    resetTransient();
    setPhase('playing');
    // 开局前把最新规则交给引擎（时长决定时钟、人头决定结算），再 start
    engineRef.current?.setRules(rules);
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
    engineRef.current?.setRules(rules);
    engineRef.current?.start();
  };

  /**
   * 回模式选择页（Esc 菜单的「退出对局」、结算页的「返回」都走这里）。
   * 引擎**不销毁** —— 场景继续当背景，重新进来不用再加载一遍。
   * 联机局从这里退出去时会顺带退出联机（`leaveNet`），不然房间还挂着。
   */
  const switchMode = () => {
    // 载入途中按返回：作废手上那一批流水线，并把「载入中」松开，否则回来再点按钮会被挡
    loadSeq.current += 1;
    loadingRef.current = false;
    if (netRef.current) {
      leaveNet();
      return;
    }
    engineRef.current?.stop();
    setSettingsOpen(false);
    setResult(null);
    setPhase('mode');
  };

  /** 结算页的「返回」：回模式选择页，不是回专栏列表。 */
  const leaveMatch = switchMode;

  const selectPrimary = (id: PrimaryId) => {
    engineRef.current?.selectPrimary(id);
  };

  /* ============================================================
     联机
     ============================================================ */

  /** 收掉「正在搜索」标识（幂等）。列表空了也是它 —— 超时和「收到第一批」共用。 */
  const stopRoomScan = () => {
    if (scanTimer.current !== null) {
      window.clearTimeout(scanTimer.current);
      scanTimer.current = null;
    }
    setNetScanning(false);
  };

  /**
   * 点亮「正在搜索房间」。
   *
   * 放在**打开面板的那一刻**而不是「连上之后」：动态 import + MQTT 握手正是最该有
   * 反馈的那一段，而且这段里列表必然空着（房间靠广播，广播得等连接建好）。
   * 已经拿到过房间就不亮 —— 列表本身已经是结果，再盖一层「搜索中」只是噪声。
   */
  const startRoomScan = (known: number) => {
    if (known > 0) return;
    if (scanTimer.current !== null) window.clearTimeout(scanTimer.current);
    setNetScanning(true);
    scanTimer.current = window.setTimeout(() => {
      scanTimer.current = null;
      setNetScanning(false);
    }, ROOM_SCAN_MS);
  };

  /**
   * 打开（或复用）房间列表连接。
   *
   * 失败时返回 null 也照常能玩 —— 没有列表还有房间码和邀请链接两条路。
   * 连上之后**不关**：房主要靠它每 2 秒报到，别人才看得见他这一局。
   */
  const ensureLobby = async (): Promise<ShipLobby | null> => {
    if (lobbyRef.current) return lobbyRef.current;
    const lobby = await ShipLobby.open((entries) => {
      setNetRooms(entries);
      // 收到第一条广播就撤标识：再转下去只会盖住真实列表
      if (entries.length > 0) stopRoomScan();
    });
    if (lobbyRef.current) {
      // 竞态：两次点击各开了一个，留先到的那个
      void lobby.close();
      return lobbyRef.current;
    }
    lobbyRef.current = lobby;
    // 连不上（没有 crypto.subtle / joinRoom 抛错）就别装着还在扫，直接给「没发现」
    if (!lobby.live) stopRoomScan();
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

  /**
   * 建房（引擎就绪之后才调；`enterMode` 保证这一点）。
   *
   * 这里才把 phase 推进 `lobby`：模式页 z-30、房间面板 z-20，不先收掉模式页
   * 面板会被它盖住。建房立刻开局（`createRoom` 内部 `startMatch`）。
   */
  const startHosting = () => {
    // 用户手势里就把 AudioContext 建好、音效烘焙排进后台：真正开局时不用再付这笔开销
    engineRef.current?.prewarmAudio();
    setNetError(null);
    setNetRoster(null);
    setPhase('lobby');
    createRoom();
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
    // 已经选完阵营、正在载入时被拒（房间刚好满 / 房主刚好撤了）：作废这批流水线，
    // 不然载入页 z-40 会一直压着错误面板，人对着 100% 的进度条不知道发生了什么
    if (loadingRef.current) {
      loadSeq.current += 1;
      loadingRef.current = false;
      pendingJoinRef.current = null;
      setPhase('lobby');
    }
  };

  /** 收摊：停循环、摘联机、退房间、停报到。所有联机退出口都走这里。 */
  const teardownNet = () => {
    engineRef.current?.stop();
    engineRef.current?.detachNet();
    void netRef.current?.leave();
    netRef.current = null;
    netLiveRef.current = false;
    pendingJoinRef.current = null;
    lobbyRef.current?.stopAnnounce();
    stopRoomScan();
    setNetRoster(null);
    setNetJoining(false);
    setNetError(null);
  };

  /**
   * 回模式选择，真的退出联机。
   *
   * 房间面板（连接中 / 选阵营 / 出错 / 房主走了）里的每一个「返回」都走这一条 ——
   * 建房和加房都是模式页上按的，退回的自然是那一页，不再是某个中间菜单。
   */
  const leaveNet = () => {
    teardownNet();
    setNetScreen(null);
    setNetCode('');
    setPhase('mode');
    setResult(null);
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
        // 没有引擎（理论上到不了：`startHosting` 只在引擎就绪后才跑）——
        // 别把人留在空场上，退回模式页
        setPhase('mode');
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
        // 场上人数 = 2 × 每队人数，自己算一个真人，剩下都是人机
        bots: rules.teamSize * 2 - 1,
        open: true,
      });

      setNetScreen(null);
      startMatch();
    })();
  };

  /**
   * 用房间码加入。
   *
   * 只开会话、不载入：阵营选择界面上的人数得是**实时**的（需求三.2），而这一页
   * 在「点加入房间」之后立刻就要出现 —— 载入要建 WebGL、拉枪模，放在它前面
   * 就是让人先干等一秒才看见自己该选什么（2026-11-13 用户要求把顺序倒过来）。
   *
   * 也**不**挂到引擎上：引擎一旦进 guest 模式就会把人机全清掉，那时候万一被
   * 房主拒绝，回单人局还得再摆一次。挂引擎只发生在回执之后（`acceptJoin`）。
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
          if (!self) return;
          acceptJoin({ id: ack.id, snap: ack.snap });
        },
        onHostLeft: () => {
          // 房主走了 = 这一局没有裁判了。立刻收摊，别让人对着冻结的场面继续打。
          // 面板自己带背景，所以这里只把 phase 退回 'lobby'（联机落点就是房间面板）
          teardownNet();
          setNetScreen('left');
          setPhase('lobby');
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

  /**
   * 房主同意了加入 —— **到这一步才开始载入游戏**。
   *
   * 回执里带着房主替换完人机之后的完整快照，先存进 `pendingJoinRef`：引擎这
   * 会儿可能还不存在，等它建好再由 `finishJoin` 用上（不然加入者会先站在房主
   * 世界的原点，下一帧才被拽过去，需求六.2）。
   *
   * 引擎已经在（切回模式页再进来）就不用再载，直接挂上开局。
   */
  const acceptJoin = (ack: { id: string; snap: Snapshot }) => {
    pendingJoinRef.current = ack;
    setNetScreen(null);

    if (engineRef.current) {
      finishJoin();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      setPhase('lobby');
      return;
    }

    const seq = ++loadSeq.current;
    setLoadFailed(false);
    loadingRef.current = true;
    setLoad({ pct: 5, stage: 'boot', detail: '' });
    setPhase('loading');
    void runLoad(canvas, seq, finishJoin);
  };

  /** 载入跑完（或引擎本来就在）：把房主给的角色挂上去，开局。 */
  const finishJoin = () => {
    const pending = pendingJoinRef.current;
    const engine = engineRef.current;
    const session = netRef.current;
    pendingJoinRef.current = null;
    setNetJoining(false);

    if (!pending || !engine || !session) {
      // 载入途中房间没了（房主撤了 / 被拒）：别把人留在 100% 的载入页上，
      // 退回面板 —— 那里已经有 error / left 之类的说法
      setPhase('lobby');
      return;
    }

    engine.setPlayerName(resolveName());
    engine.attachNet(session, pending.id, pending.snap);
    netLiveRef.current = true;
    startMatch();
  };

  /** 选阵营 → 发申请。`netJoining` 同时把两张卡片禁用，挡住连点（需求三.8）。 */
  const pickTeam = (team: Team) => {
    const session = netRef.current;
    if (!session || netJoining) return;
    // 这一下是加房流程里**唯一还在手势窗口内**的点击（载入已经挪到回执之后），
    // 音频上下文必须在这里建 —— 等引擎建好再 unlock 就不算用户手势了，
    // Chrome 会把 ctx 停在 suspended，开局听不到枪声。
    // `unlock` 幂等：引擎 `start()` 时再调一次只是 resume + 续排预热。
    gameAudio.unlock();
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
      // 邀请链接：切到联机页签、把码填好，用户只差按一下「加入房间」
      // （不自动开局：载入要建 WebGL、拉枪模，得留一次明确的点击）
      setNetCode(invited);
      setMode('net');
    });
  }, []);

  // 联机页签一露头就连大厅 + 点亮「搜索中」。
  // 纯单机玩家永远不会进这张网 —— 没点过联机页签就不建连。
  useEffect(() => {
    if (phase !== 'mode' || mode !== 'net' || lobbyRef.current) return;
    // 微任务里点灯：effect 体内同步 setState 会触发 `react-hooks/set-state-in-effect`
    void Promise.resolve().then(() => startRoomScan(0));
    void ensureLobby();
  }, [phase, mode, netRooms.length]);

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

  const playing = phase === 'playing' || phase === 'menu';
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

      {/* 进游戏的第一道门（也是唯一的准备页）。z-30；载入页再高一档（z-40） */}
      {phase === 'mode' ? (
        <ShipModeSelect
          locale={locale}
          mode={mode}
          onMode={setMode}
          difficulty={rules.difficulty}
          onDifficulty={(difficulty) => changeRules({ difficulty })}
          teamSize={rules.teamSize}
          onTeamSize={(teamSize) => changeRules({ teamSize })}
          endMode={rules.endMode}
          onEndMode={(endMode) => changeRules({ endMode })}
          durationSec={rules.durationSec}
          onDuration={(durationSec) => changeRules({ durationSec })}
          killTarget={rules.killTarget}
          onKillTarget={(killTarget) => changeRules({ killTarget })}
          onEnter={() => enterMode('solo')}
          name={playerName}
          onName={changeName}
          code={netCode}
          onCode={setNetCode}
          onCreate={() => enterMode('net', { kind: 'create' })}
          onJoin={(code) => enterMode('net', { kind: 'join', code })}
          rooms={netRooms}
          scanning={netScanning}
          onSettings={() => setSettingsOpen(true)}
          backHref={backHref}
        />
      ) : null}

      {/* 载入页 z-40：这一页在的时候，底下什么都不该被点到 */}
      {phase === 'loading' ? (
        <ShipLoading
          locale={locale}
          mode={mode}
          pct={load.pct}
          stage={load.stage}
          detail={load.detail}
          failed={loadFailed}
          onBack={switchMode}
        />
      ) : null}

      {playing && hud ? (
        <>
          <ShipCrosshair scoped={hud.scoped} weapon={hud.weapon} dead={hud.dead} pulse={crosshairPulse} />
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
        <ShipScoreboard hud={hud} locale={locale} killTarget={hud.killTarget} />
      ) : null}

      {playing && hud?.buyOpen ? (
        <ShipBuyMenu
          hud={hud}
          locale={locale}
          onSelect={selectPrimary}
          onClose={() => engineRef.current?.closeBuyMenu()}
        />
      ) : null}

      {/* 开始界面已经并进模式页：单人按「开始战斗」就是载入 + 开局，联机落点是房间面板 */}

      {/* 联机面板。z-20，和开始界面同层，但渲染在后面 —— 盖在它上面 */}
      {netScreen ? (
        <ShipNetPanel
          locale={locale}
          screen={netScreen}
          error={netError}
          roster={netRoster}
          code={netCode}
          joining={netJoining}
          cover={!controller}
          onPickTeam={pickTeam}
          onBack={leaveNet}
        />
      ) : null}

      {phase === 'menu' && !settingsOpen ? (
        <ShipGameMenu
          locale={locale}
          // 联机局才有房间号；单人局 `hud.net` 是 null，菜单里那一行不画
          net={hud?.net}
          onResume={resume}
          // 联机局不给「重新开始」：比分是全场共用的，单方面清掉就违反了
          // 「不因加入 / 退出而重置比分」（需求六.4）
          onRestart={netMode ? undefined : restart}
          onSettings={() => setSettingsOpen(true)}
          // 「退出对局」回模式页（以前回的是开始界面，那张页已经并进模式页了）
          onQuit={switchMode}
        />
      ) : null}

      {phase === 'result' && result ? (
        <ShipResultPanel
          result={result}
          locale={locale}
          onAgain={netMode ? undefined : restart}
          onLeave={leaveMatch}
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
