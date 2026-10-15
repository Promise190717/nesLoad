'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode
} from 'react';
import { useRouter } from 'next/navigation';
import { canReturnWithinSite } from '@/lib/site-history';
import { getAudioTrack } from '@/lib/audio-tap';
import { ensureBios } from '@/lib/bios';
import { EmulatorController, VOLUME_MAX, type LoadedRom } from '@/lib/emulator';
import { readGamepads } from '@/lib/gamepad';
import { isAbortError, readBodyWithProgress } from '@/lib/http';
import { setPlayActive } from '@/lib/play-leave-guard';
import type { MessageKey } from '@/lib/i18n';
import {
  BUTTONS,
  buttonLabel,
  codeLabel,
  codeToButton,
  DEFAULT_BINDINGS,
  loadBindings,
  saveBindings,
  type ButtonName,
  type KeyBindings
} from '@/lib/keybindings';
import {
  captureFpsFor,
  DEFAULT_STREAM_QUALITY,
  IDLE_NETPLAY_STATE,
  NetplayController,
  ROOM_QUERY_PARAM,
  type NetplayError,
  type NetplayMode,
  type NetplayState,
  type StreamQuality
} from '@/lib/netplay';
import { CONSOLE_LABEL } from './CartridgeSprite';
import ConsoleScreen from './ConsoleScreen';
import { localizeLibraryGame, type LibraryGame } from './GameLibraryPanel';
import { useI18n } from './I18nProvider';
import KeyBindingsPanel from './KeyBindingsPanel';
import PlaySaveControls from './PlaySaveControls';
import { MobileGamepad } from './HandheldConsole';
import { ExpandIcon, PlayMoonIcon, ReloadIcon, SunIcon } from './icons';
import { TV_SIZES, type TvSize } from '@/lib/tv-size';

/*
 * `/play` —— 从游戏详情那颗「联机游戏」进来的**简洁版房间**（2026-10-14 加，用户要求）。
 *
 * 和 `ConsoleScene`（`/room`，满屏像素屋 + 抽屉 + 一堆弹窗）的关系：
 * **同一件事的两种壳**，不是两套实现。加载 ROM、核心、BIOS、键盘转发、联机推流
 * 这些「引擎侧」的事两边都走同一批 lib（`EmulatorController` / `NetplayController` /
 * `lib/http.ts` / `lib/bios.ts`），屏幕那块更干脆 —— 直接复用 `ConsoleScreen`。
 *
 * 为什么另起一个组件而不是给 ConsoleScene 加一个 `chrome` 分支：那边 4700 行、
 * 渲染树里全是房间布景和抽屉，简单外壳在它里面只是一小段条件分支，反而更难读；
 * 而这一页的**功能面**确实更窄 —— 没有存档 / 读档 / 历史 / 云端 / 拖本地文件 / 彩蛋。
 * 用户的原话就是「尽量简洁」。
 *
 * 两页刻意**不追求行为一致**的地方只有一个：这一页不会自动载入。用户要的是
 * 「先进房间设置，点开始才加载」——`?id=` 只负责把要玩的那一款摆在黑区里。
 *
 * 布局（2026-10-14 第二版，用户改的）：**左边一块屏幕 + 右边一列**。
 * 没有画面时屏幕里那层叠层负责说事 ——「房间选择」（单人 / 创建房间 / 加入 + 链路 + 画质）
 * **就摆在屏幕上**，进了房就换成房间码 / 分享 / 连接状态 / 离开，载入中换进度条。
 * 右列最上面是**这一款游戏的封面 + 名字等信息**，下面一张平铺的「说明 + 控件」操作表
 * （暂停 / 重载 / 弹出 / 音量 / 显示 / 全屏），最底下单独一颗「编辑」开按键设置。
 *
 * **页面外壳不在这儿**：背景（`.wall`）、右上一排入口（`TopBar`）、左上那颗「返回」、
 * 页脚全在 `GamesShell` 里，由 `app/[locale]/play/page.tsx` 套上 —— 用户要求这一页
 * 的「背景和 layout 和 `/consoles/<机种>` 那一页长得像」。所以这个组件只画「屏幕 + 右列」
 * 这一段，根元素是普通 `<div>` 而**不是** `<main>`（`<main>` 和 `<h1>` 都在外层 / 这儿是 sr-only）。
 *
 * ⚠️ **视觉一律和网站整体保持一致**（2026-10-14 用户原话：「ui 尽量干净」「风格要和网站
 * 整体保持一致」）：描边走站上那套 `pixel-edge pxw-* pxc-*`，字体与配色走同一批设计令牌
 * （`ink-*` 跟主题翻转；屏幕里那层用 `crt-*`，因为屏幕底永远是黑的）。别在这儿另搞一套
 * 1px 细边 —— 我第一版那么写过，被用户退回来了。
 * 「不要 room 的样式」说的是**别把满屋子的布景 / 电视机 / 抽屉 / 键帽面板搬过来**，
 * 也就是「布局和控件集不同」，不是把站上的描边风格也丢掉。
 */

/**
 * 房间设置区选的项目。
 *
 * `solo` 不建房、直接下 ROM 开跑；`host` 先开房再下（下载期间对方就能进来等）；
 * `join` 只连房主 —— 加入者**本机不载入任何东西**，画面是房主推来的。
 */
type PlayMode = 'solo' | 'host' | 'join';

/** 黑区当前处于哪一段。`ready` = 已经有画面（本机的或房主推来的） */
type Phase = 'idle' | 'downloading' | 'booting' | 'ready';

interface PlaySceneProps {
  /**
   * 服务端预取的那一款。三态和 `/room` 完全一致（见 `room/page.tsx` 的注释）：
   * `undefined` = 地址上没有 `?id=` 或服务端查询抛了异常（客户端打接口兜底）、
   * `null` = 有 id 但库里没有、`Game` = 查到了。
   */
  serverGame?: LibraryGame | null;
  initialMode?: 'solo' | 'host';
  autoStart?: boolean;
  initialRoomCode?: string;
}

export default function PlayScene({
  serverGame,
  initialMode = 'solo',
  autoStart = false,
  initialRoomCode = ''
}: PlaySceneProps) {
  const { t, locale, href } = useI18n();
  const router = useRouter();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const display = displayRef.current;
    if (!stage || !display) return;
    const updateSize = () => {
      const stageStyle = getComputedStyle(stage);
      const frame = display.querySelector('.play-frame');
      if (!frame) return;
      const frameStyle = getComputedStyle(frame);
      const number = (value: string) => Number.parseFloat(value) || 0;
      const workspace = stage.parentElement;
      const top =
        (workspace ?? stage).getBoundingClientRect().top +
        window.scrollY +
        (workspace ? number(getComputedStyle(workspace).paddingTop) : 0);
      const availableHeight = Math.max(0, window.innerHeight - top - 20) * 0.92;
      const stageInset =
        number(stageStyle.paddingTop) +
        number(stageStyle.paddingBottom) +
        number(stageStyle.borderTopWidth) +
        number(stageStyle.borderBottomWidth);
      const frameInsetY =
        number(frameStyle.paddingTop) + number(frameStyle.paddingBottom);
      const frameInsetX =
        number(frameStyle.paddingLeft) + number(frameStyle.paddingRight);
      const maxWidth =
        (Math.max(0, availableHeight - stageInset - frameInsetY) * 4) / 3 +
        frameInsetX;
      stage.style.setProperty(
        '--play-display-height',
        `${Math.max(0, availableHeight - stageInset)}px`
      );
      stage.style.setProperty('--play-display-max-width', `${maxWidth}px`);
      stage.parentElement?.style.setProperty(
        '--play-display-max-width',
        `${maxWidth}px`
      );
      document
        .querySelector<HTMLElement>('.play-navigation')
        ?.style.setProperty('--play-display-max-width', `${maxWidth}px`);
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    const navigation = document.querySelector('.play-navigation');
    if (navigation) observer.observe(navigation);
    window.addEventListener('resize', updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);
  /** 防重入：载入中再点一次「开始」不该把正在跑的那次搅了（和 room 里同一个理由） */
  const loadingRef = useRef(false);
  const activeRef = useRef(false);

  // 惰性初始化持有实例：只建一次，也避免在渲染期读写 ref（react-hooks/refs）
  const [controller] = useState(() => new EmulatorController());

  const [game, setGame] = useState<LibraryGame | null>(serverGame ?? null);
  const [rom, setRom] = useState<LoadedRom | null>(null);
  const [paused, setPaused] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [loadCancelled, setLoadCancelled] = useState(false);
  const directSolo = autoStart && initialMode === 'solo';
  /** ROM 整包下载进度（0..1），null = 拿不到字节数或这一阶段还没开始 */
  const [romRatio, setRomRatio] = useState<number | null>(null);
  /** 核心包下载进度（0..1），null = 拿不到字节数 */
  const [coreRatio, setCoreRatio] = useState<number | null>(null);
  /**
   * 载入失败 / 找不到那一款的提示。
   *
   * 存 MessageKey 不存译好的串：它跟着语言走就行（切语言不该重开一局）。
   * 成功 / 取消都清掉它 —— 这个位置只回答「刚才那一下出了什么事」。
   *
   * ⚠️ 初值刻意看 `serverGame === null`：那是「地址上带了 `?id=` 但库里查无此款」，
   * 一进页面就该说「找不到」。**不能**把「压根没带 id」也并进来 —— 不带 id 是
   * 正常入口（首页那个「加入房间」表单跳的就是 `/play?room=XXX`，没有 id），
   * 那一趟屏幕上不该出现「找不到这个游戏」。
   */
  const [notice, setNotice] = useState<MessageKey | null>(
    serverGame === null ? 'play.notFound' : null
  );
  /** 这一笔 ROM 下载的取消把手；没有下载在飞时是 null */
  const abortRef = useRef<AbortController | null>(null);
  /**
   * 当前这盘 ROM 的文件本体。
   *
   * 「重载」拿它重新插一次，不必再下几十 MB —— 和 room 里 `lastRomRef` 同一个用处。
   * 代价是它整局都留在内存里（浏览器对大 Blob 多半落盘），换「重载不必联网」值得。
   */
  const lastRomRef = useRef<File | null>(null);

  const [volume, setVolume] = useState(VOLUME_MAX);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const workspaceRef = useRef<HTMLDivElement>(null);
  const pageThemeRef = useRef<HTMLElement | null>(null);
  const themeFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const page = workspaceRef.current?.closest<HTMLElement>('.play-page');
    if (!page) return;
    pageThemeRef.current = page;
    page.dataset.playTheme =
      document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    return () => {
      if (themeFadeTimer.current !== null) clearTimeout(themeFadeTimer.current);
      page.classList.remove('play-theme-fading');
      delete page.dataset.playTheme;
      pageThemeRef.current = null;
    };
  }, []);
  const [bindings, setBindings] = useState<KeyBindings>(DEFAULT_BINDINGS);
  const [keybindOpen, setKeybindOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [savesOpen, setSavesOpen] = useState(false);
  const [keysPlayer, setKeysPlayer] = useState<'p1' | 'p2'>(
    initialRoomCode ? 'p2' : 'p1'
  );
  /*
   * 预挂载值只能是`PLAY_DEFAULT_SCREEN_SIZE`（中）：服务端没有 localStorage，
   * 首屏那份**用户真实偏好**由下面的 effect 从 `<html data-tv>` 读回来后补上。
   * 两边都是「中」时首帧不跳；用户存过别的档位，就由首屏内联脚本先写属性、
   * effect 再对齐 —— 和主题 / 键位同一条路。
   */
  const [screenSize, setScreenSize] = useState<TvSize>(
    PLAY_DEFAULT_SCREEN_SIZE
  );

  const [mode] = useState<PlayMode>(initialRoomCode ? 'join' : initialMode);
  /**
   * 房间卡「刚出现」的高亮。建好房 / 加入成功那一刻置 true，几秒后自己落回 ——
   * 对应卡片边框闪主题色（`play-room-flash`），提醒用户看右栏。
   */
  const [roomFlash, setRoomFlash] = useState(false);
  const autoStartedRef = useRef(false);
  const [joinCode] = useState(initialRoomCode.toUpperCase());
  const [netplayMode] = useState<NetplayMode>('wan');
  const [streamQuality, setStreamQuality] = useState<StreamQuality>(
    DEFAULT_STREAM_QUALITY
  );
  const [netplayState, setNetplayState] =
    useState<NetplayState>(IDLE_NETPLAY_STATE);
  const [netplayBusy, setNetplayBusy] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [roomToast, setRoomToast] = useState<{
    key: MessageKey;
    kind: 'ok' | 'danger';
    id: number;
  } | null>(null);

  useEffect(() => {
    if (!roomToast) return;
    const timer = setTimeout(() => setRoomToast(null), 4500);
    return () => clearTimeout(timer);
  }, [roomToast]);

  /**
   * 联机控制器。回调里要读 `controller`（房主把对方的输入打进本机），
   * 而 controller 在上面就建好了 —— 闭包捕获的是那个稳定引用，所以不需要 ref。
   *
   * 和 room 相比这里**不认「刚连上 / 对方离开」那两枚会自动消失的提示**：
   * 这一页的状态行是常驻在右侧的（房间码下面那行），不需要另开一条会过期的通道。
   */
  const [netplay] = useState(() => {
    let previousState = IDLE_NETPLAY_STATE;
    return new NetplayController({
      onState: (next) => {
        const previous = previousState;
        previousState = next;
        setNetplayState(next);
        if (next.status === 'connected' && previous.status !== 'connected') {
          setRoomToast({
            key:
              next.role === 'host' ? 'netplay.toastHost' : 'netplay.toastGuest',
            kind: 'ok',
            id: Date.now()
          });
        } else if (
          previous.status === 'connected' &&
          next.status === 'waiting' &&
          next.role === 'host'
        ) {
          setRoomToast({
            key: 'netplay.toastGuestLeft',
            kind: 'danger',
            id: Date.now()
          });
        } else if (
          next.error === 'host-left' &&
          previous.error !== 'host-left'
        ) {
          setRoomToast({
            key: 'netplay.toastHostLeft',
            kind: 'danger',
            id: Date.now()
          });
        }
      },
      onRemoteButton: (button, down, role) => {
        // 只有房主本机跑着模拟器；加入者那份注入无处可去，所以这里是单向的
        if (role !== 'host') return;
        // 对方那台机器上的 1P，在这台机器上是 2P（`remotePlayer('host')` 就是这个 2）
        controller.pressButton(button, 2, down);
      },
      onRemoteStream: (stream) => setRemoteStream(stream)
    });
  });

  const hasPicture = Boolean(rom) || Boolean(remoteStream);
  const inRoom = netplayState.status !== 'idle';
  const busy = phase === 'downloading' || phase === 'booting';
  /**
   * 加载卡正盖在屏幕上吗？两个入口：主流程（busy）和 directSolo 的自动开播。
   * 卡里已经带了游戏名 + 机种，叠层顶部那两行就不再重复画（见渲染处）。
   */
  const loadingCardVisible =
    busy || (directSolo && !notice && !loadCancelled);

  useEffect(() => {
    if (!(inRoom && netplayState.code)) return;
    // 微任务里置位：effect 里同步 setState 会撞 react-hooks/set-state-in-effect
    // （本仓库既有规则），和上面主题/键位那两段是同一个理由。
    void Promise.resolve().then(() => setRoomFlash(true));
    const timer = setTimeout(() => setRoomFlash(false), 5000);
    return () => clearTimeout(timer);
  }, [inRoom, netplayState.code]);
  /*
   * 「游戏运行中」= ROM 已载入开玩（`phase === 'ready'`），或联机加入者已连上
   * 房主正在收画面（guest 本机没有模拟器，`phase` 永远到不了 ready）。
   * 报给左上角那颗返回（`lib/play-leave-guard.ts`）：运行中点返回要先确认。
   * 卸载时清回 false —— SPA 里离开这一页的收尾不会自动清它。
   */
  const playing =
    phase === 'ready' ||
    (netplayState.role === 'guest' && netplayState.status === 'connected');
  useEffect(() => {
    setPlayActive(playing);
    return () => setPlayActive(false);
  }, [playing]);
  /**
   * 这一款的文案（标题 / 开发商按当前语言取一份，见 `localizeLibraryGame`）。
   * `gameText` 可能为 null（地址上没有 `?id=`，或者查无此款），下面一路都得判空。
   */
  const gameText = game ? localizeLibraryGame(game, locale) : null;
  const title = gameText?.title ?? '';

  // 路由返回不会刷新浏览器，必须显式释放模拟器和联机资源。
  useEffect(() => {
    activeRef.current = true;
    const stop = () => {
      activeRef.current = false;
      abortRef.current?.abort();
      lastRomRef.current = null;
      void controller
        .exit()
        .catch((error) => console.warn('[play] 退出失败', error));
      void netplay
        .leave()
        .catch((error) => console.warn('[play] 退房失败', error));
    };
    const restore = () => {
      activeRef.current = true;
    };
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('pagehide', stop);
      window.removeEventListener('pageshow', restore);
      stop();
    };
  }, [controller, netplay]);

  /* ---------------- 首屏：把 localStorage / <html> 上的偏好同步进来 ---------------- */

  useEffect(() => {
    /*
     * 主题的**真身在 `<html data-theme>`** 上（首屏由 layout 的内联脚本写入），
     * 这份 state 只喂下面那颗钮的 title / aria-label —— 和 ConsoleScene 里那一套
     * （以及那盏灯、键位）完全同一个做法：服务端没有 localStorage，
     * 惰性初始化会让水合前后对不上，只能挂载后同步。
     *
     * 塞进微任务是因为 effect 里同步 setState 会撞上 `react-hooks/set-state-in-effect`
     * （本仓库既有规则），和 room 那边推到 `.then()` 里是同一个理由。
     */
    const storedTheme =
      document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    void Promise.resolve().then(() => setTheme(storedTheme));

    /*
     * 键位同理（`loadBindings` 是同步读 localStorage）。除了 UI 那份 state，
     * 还要交给控制器 —— 它在**下次启动核心**时才把键位写进 RetroArch 配置，
     * 所以进这一页之前改过的键位照样生效。
     */
    const stored = loadBindings();
    controller.setBindings(stored);
    void Promise.resolve().then(() => setBindings(stored));

    /*
     * 屏幕尺寸。和 room 共用同一份落盘（`nesload:tv`，也是首屏内联脚本读的那个键），
     * 所以这一页选完刷新、下次再进来都还是那一档，切到 `/room` 也认得。
     *
     * **为什么读 localStorage 而不是 `<html data-tv>`**：内联脚本只在**整页加载**
     * 时跑一次。从游戏详情点「联机游戏」进这页是 SPA 内部跳转——脚本不会重跑，
     * 属性上还留着首载页面（比如首页）算出的值；而本页默认档是分页面的
     * （/play 是 medium，别处是 small），跟着旧属性走必然错。
     * 直接读键 + 本页自己的合法值表 + 本页默认，两条进入路径都对。
     * （`data-screen-size` 只挂在 .play-display 上、吃的全是 React state，
     * `<html data-tv>` 在这一页没有视觉职责，不需要同步回去。）
     */
    const raw = (() => {
      try {
        return localStorage.getItem(TV_KEY);
      } catch {
        return null; // 隐私模式读不出来，走默认
      }
    })();
    void Promise.resolve().then(() =>
      setScreenSize(
        raw === 'small' || raw === 'medium' || raw === 'large'
          ? raw
          : PLAY_DEFAULT_SCREEN_SIZE
      )
    );
  }, [controller]);

  /* ---------------- 游戏数据 ---------------- */

  /**
   * 服务端没给（地址上没 `?id=`，或者那次查询抛了异常）时打接口兜底。
   *
   * 只有「地址上有 id」才走 —— id 从 URL 现读，不另立 state：它是个只读一次的东西，
   * 存成 state 只会多一次渲染。
   */
  useEffect(() => {
    const id = new URL(window.location.href).searchParams.get('id');
    if (!id || serverGame !== undefined) return;

    const ac = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/games/${encodeURIComponent(id)}`, {
          signal: ac.signal
        });
        const found = res.ok
          ? ((await res.json()) as { game?: LibraryGame }).game
          : undefined;
        if (found) setGame(found);
        else setNotice('play.notFound');
      } catch (error) {
        if (isAbortError(error)) return;
        console.error('[play] 取游戏数据失败：', id, error);
        setNotice('play.notFound');
      }
    })();
    return () => ac.abort();
  }, [serverGame]);

  /* ---------------- 载入 ---------------- */

  /**
   * 下 ROM、启核心。
   *
   * 和 room 的 `loadRemote` + `loadFile` 是一条路子，只是这里不写历史、不记云端 ——
   * 这一页没有存档 / 历史的入口，那些记录也就没有用处（room 才是「玩过什么」的家）。
   * 取消只覆盖**下载 ROM 那一段**：核心启动之后 Nostalgist 没有公开的中断接口
   * （和 room 里那条注释说的是同一件事），所以「取消」按钮在 booting 阶段是灰的。
   */
  const load = useCallback(
    async (file?: File) => {
      if (!activeRef.current) return;
      if (!game && !file) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      // 载入中再点一次：直接忽略，别把正在跑的那次搅了
      if (loadingRef.current) return;

      loadingRef.current = true;
      setLoadCancelled(false);
      setNotice(null);
      setRomRatio(null);
      setCoreRatio(null);

      // 重载那条路：文件已经在手上，不必再下一次
      let romFile = file ?? null;
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        if (!romFile) {
          setPhase('downloading');
          const res = await fetch(`/api/games/${game!.id}/rom`, {
            signal: ac.signal
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await readBodyWithProgress(res, setRomRatio);
          romFile = new File([blob], game!.romName, {
            type: 'application/octet-stream'
          });
        }

        if (ac.signal.aborted || !activeRef.current) return;
        setPhase('booting');
        lastRomRef.current = romFile;

        /*
         * 街机要带上 BIOS（Neo Geo 的 neogeo.zip）—— `ensureBios()` 会先把站点自带那份
         * 备上（`public/bios/`），用户拖进来的那份能覆盖它。非街机一律 null，
         * `loadRom` 也只认街机那条分支。
         */
        const consoleType = game?.consoleType ?? null;
        const bios = consoleType === 'arcade' ? await ensureBios() : null;
        if (ac.signal.aborted || !activeRef.current) return;

        /*
         * 核心包那段进度按 1% 节流（几百个 chunk 全 setState 会把整页重渲染几百次）；
         * 下完退回「不确定」—— 后面还有核心启动那一段，否则进度条会卡在 100% 不动。
         */
        let lastPct = -1;
        await controller.loadRom(
          romFile,
          canvas,
          (loaded, total) => {
            if (ac.signal.aborted || !activeRef.current) return;
            if (total <= 0) return;
            const pct = Math.floor((loaded / total) * 100);
            if (pct === lastPct) return;
            lastPct = pct;
            setCoreRatio(pct >= 100 ? null : loaded / total);
          },
          bios
        );

        // 核心启动不可中断；离开时尚未完成的启动，在完成后立即退出。
        if (ac.signal.aborted || !activeRef.current) {
          await controller.exit();
          return;
        }
        setRom(controller.rom);
        setPaused(false);
        setPhase('ready');
      } catch (error) {
        if (!activeRef.current) return;
        // 用户自己掐的：不是故障，回到「设置好了，点开始」那一屏
        if (isAbortError(error))
          console.info('[play] 已取消载入：', game?.title);
        else {
          console.error('[play] 载入失败：', game?.title, error);
          setNotice('play.loadFail');
        }
        setRom(null);
        setPhase('idle');
        /*
         * 取消 / 失败时把攥着的文件放掉：下一局要嘛重新下、要嘛换一款，
         * 留着这盘 Blob 只会白占内存。
         */
        lastRomRef.current = null;
      } finally {
        loadingRef.current = false;
        if (abortRef.current === ac) abortRef.current = null;
        if (activeRef.current) {
          setRomRatio(null);
          setCoreRatio(null);
        }
      }
    },
    [controller, game]
  );

  /** 取消正在飞的那一笔 ROM 下载。没有下载在飞时是空操作。 */
  const cancelLoad = useCallback(() => {
    setLoadCancelled(true);
    abortRef.current?.abort();
  }, []);

  /* ---------------- 联机 ---------------- */

  /**
   * 右侧那颗主钮按下之后要做的事（按当前选的项目分三条路）。
   *
   * 三个动作都不往外抛：失败原因由 netplay 写进 `state.error`，界面自己读 ——
   * 和 room 那三个回调同一个规矩，`busy` 一律放 finally（漏一条按钮就永久变灰）。
   */
  const start = useCallback(async () => {
    if (!activeRef.current) return;
    if (mode === 'join') {
      if (!joinCode.trim()) return;
      setNetplayBusy(true);
      try {
        await netplay.join(joinCode.trim().toUpperCase(), netplayMode);
        if (!activeRef.current) await netplay.leave();
      } catch (error) {
        console.warn('[play] 加入房间失败', error);
      } finally {
        setNetplayBusy(false);
      }
      // 加入者本机不载入任何东西：画面由房主推过来（见推流那段 effect）
      return;
    }

    if (mode === 'host') {
      setNetplayBusy(true);
      try {
        await netplay.host(netplayMode);
        if (!activeRef.current) {
          await netplay.leave();
          return;
        }
        // host() 的失败也可能通过 state.error 返回，只有建房成功才加载游戏。
        if (netplay.current.status === 'idle' || netplay.current.error) {
          setNetplayBusy(false);
          return;
        }
      } catch (error) {
        console.warn('[play] 创建房间失败', error);
        setNetplayBusy(false);
        return;
      }
      setNetplayBusy(false);
    }

    // 单人 / 房主都真的要下 ROM 开跑（房主开跑之后画面会自动推给对方）
    await load();
  }, [joinCode, load, mode, netplay, netplayMode]);

  useEffect(() => {
    if (
      !autoStart ||
      initialMode !== 'solo' ||
      mode !== 'solo' ||
      !game ||
      autoStartedRef.current
    )
      return;
    let cancelled = false;
    // 等挂载和偏好初始化完成；StrictMode 清理的那次任务不会执行。
    void Promise.resolve().then(() => {
      if (cancelled || autoStartedRef.current) return;
      autoStartedRef.current = true;
      void start();
    });
    return () => {
      cancelled = true;
    };
  }, [autoStart, initialMode, mode, game, start]);

  useEffect(() => {
    if (mode !== 'join' || !joinCode || autoStartedRef.current) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled || autoStartedRef.current) return;
      autoStartedRef.current = true;
      void start();
    });
    return () => {
      cancelled = true;
    };
  }, [mode, joinCode, start]);

  const leaveRoom = useCallback(async () => {
    setNetplayBusy(true);
    try {
      await netplay.leave();
      if (canReturnWithinSite()) router.back();
      else router.replace(href('/'));
    } catch (error) {
      console.warn('[play] 离开房间失败', error);
    } finally {
      setNetplayBusy(false);
    }
  }, [netplay, router, href]);

  /**
   * 房主：插上卡带就把画面推给对方。
   *
   * 依赖里带 `role` 是为了覆盖「先开房、后加载」这个顺序（这一页就是这顺序：
   * `start()` 先 `host()` 再 `load()`）—— 两条都落定之后 effect 会跑，把流建起来。
   * 带 `streamQuality` 是为了换档（帧率是建流参数，事后改不了，所以换档＝重建整条流）。
   */
  useEffect(() => {
    if (netplayState.role !== 'host' || !rom) return;

    const stream = createCaptureStream(
      canvasRef.current,
      captureFpsFor(streamQuality)
    );
    if (!stream) return;

    netplay.publishStream(stream, streamQuality);
    netplay.announceGame({ name: rom.name, console: rom.console });

    /*
     * 声音可能迟到：RetroArch 的 AudioContext 是核心启动时才建的，抓流那一刻
     * 音频节点有可能还没接到 destination 上。补几次，拿到就塞进**同一条**流
     * （Trystero 会跳过已在连接里的轨道，画面不会被推两遍）。
     */
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const audio = getAudioTrack();
      if (audio) {
        stream.addTrack(audio);
        netplay.refreshStream();
      }
      if (audio || tries >= AUDIO_RETRY_LIMIT) clearInterval(timer);
    }, 500);

    return () => {
      clearInterval(timer);
      // 先报「没在玩」再收流：加入者收到就把视频摘掉，不会冻在最后一帧上
      netplay.announceGame(null);
      netplay.unpublishStream();
    };
  }, [rom, netplayState.role, netplay, streamQuality]);

  /**
   * 加入者的输入转发（键盘 + 手柄）。
   *
   * ⚠️ 判据必须是 `role === 'guest'`：加入者本机没有模拟器，按下的键只能发给房主；
   * 单人 / 房主那条路上核心自己读键盘，这里插一脚会让每个键被注入两次。
   *
   * 键位用**加入者自己的 1P 那套**（`bindings.p1`）反查：他在游戏里是 2P，
   * 但手上按的该是自己配惯的那套 —— 房主那边按自己的表合成按键事件。
   */
  useEffect(() => {
    if (netplayState.role !== 'guest' || keybindOpen || savesOpen) return;

    const keys = codeToButton(bindings.p1);
    /*
     * 两个输入来源各自记账再取并集：同一个钮被两边同时按着时（左手键盘推方向、
     * 右手顺手也推了摇杆），任何一边松手都不该让对面收到 keyup —— 那会让角色
     * 在房主手里突然停住。
     */
    const fromKeyboard = new Set<ButtonName>();
    let fromPad = new Set<ButtonName>();
    const sent = new Set<ButtonName>();

    const sync = () => {
      const want = new Set<ButtonName>(fromKeyboard);
      for (const button of fromPad) want.add(button);
      for (const button of want) {
        if (sent.has(button)) continue;
        sent.add(button);
        netplay.sendButton(button, true);
      }
      for (const button of [...sent]) {
        if (want.has(button)) continue;
        sent.delete(button);
        netplay.sendButton(button, false);
      }
    };

    const forward = (e: KeyboardEvent, down: boolean) => {
      if (e.target instanceof HTMLInputElement) return;
      const button = keys[e.code];
      if (!button) return;
      if (down && e.repeat) return;
      if (down) fromKeyboard.add(button);
      else fromKeyboard.delete(button);
      sync();
    };

    const onDown = (e: KeyboardEvent) => forward(e, true);
    const onUp = (e: KeyboardEvent) => forward(e, false);

    // 手柄每帧读一次（`gamepadconnected` 只在插上时来一次，之后全靠轮询）
    let raf = 0;
    const pollPad = () => {
      fromPad = readGamepads();
      sync();
      raf = requestAnimationFrame(pollPad);
    };
    raf = requestAnimationFrame(pollPad);

    /** 切走窗口 / 标签页时把手里的钮一次性松开（那边不补发 keyup，rAF 也会停） */
    const releaseAll = () => {
      for (const button of sent) netplay.sendButton(button, false);
      sent.clear();
      fromKeyboard.clear();
      fromPad = new Set();
    };
    const onVisibility = () => {
      if (document.hidden) releaseAll();
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(raf);
      // 摘监听时把欠着的 keyup 补上，否则房主会一直以为你还按着方向键
      releaseAll();
    };
  }, [netplayState.role, netplay, bindings, keybindOpen, savesOpen]);

  const handleTouchButton = useCallback(
    (button: ButtonName, down: boolean) => {
      if (netplayState.role === 'guest') {
        netplay.sendButton(button, down);
      } else {
        controller.pressButton(button, 1, down);
      }
    },
    [controller, netplay, netplayState.role]
  );

  /* ---------------- 播放控制 ---------------- */

  const togglePause = useCallback(async () => {
    if (!controller.isRunning) return;
    await controller.togglePause();
    setPaused(controller.isPaused);
    // 把暂停说给对方：他手上是一条冻住的视频，不说就成了「卡死 / 掉线」
    netplay.announcePaused(controller.isPaused);
  }, [controller, netplay]);

  const reload = useCallback(async () => {
    const file = lastRomRef.current;
    if (!file) return;
    await load(file);
  }, [load]);

  const changeVolume = useCallback(
    (level: number) => setVolume(controller.setVolume(level)),
    [controller]
  );

  /* ---------------- 主题 / 全屏 ---------------- */

  /**
   * 主题切换只改当前 `.play-page` 的局部色板，保留全站主题。
   * 这份 state 只喂按钮的 title / aria —— 和 room 那边同一套路，
   * 昼夜切换只做颜色过渡。
   */
  const toggleTheme = useCallback(() => {
    const root = pageThemeRef.current;
    if (!root) return;
    const next = root.dataset.playTheme === 'dark' ? 'light' : 'dark';
    const commit = () => {
      root.dataset.playTheme = next;
      setTheme(next);
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      commit();
    } else {
      root.classList.add('play-theme-fading');
      root.style.setProperty('--theme-fade-duration', '0.5s');
      void root.offsetHeight;
      commit();
      if (themeFadeTimer.current !== null) clearTimeout(themeFadeTimer.current);
      themeFadeTimer.current = setTimeout(() => {
        root.classList.remove('play-theme-fading');
        root.style.removeProperty('--theme-fade-duration');
        themeFadeTimer.current = null;
      }, 550);
    }
  }, []);

  /**
   * 切屏幕档位。
   *
   * `data-screen-size` 撑的是**这一页自己的排版**（`--play-size-scale`），
   * 和 `/room` 那台电视机的 `--tv-ratio` 是两套 CSS，但**档位是同一个偏好**：
   * 除了本地 state，还要写 `<html data-tv>` 和 `localStorage`（`nesload:tv`）。
   * 不写属性只写 state 的话，刷新就被首屏内联脚本按旧值/默认值覆盖回去 ——
   * 这正是之前「选完刷新又变回原样」的原因。
   *
   * 写存储失败（隐私模式）静默即可，和 `applyTvSize` / `saveBindings` 同一处置。
   */
  const applyScreenSize = useCallback((next: TvSize) => {
    document.documentElement.dataset.tv = next;
    setScreenSize(next);
    try {
      localStorage.setItem(TV_KEY, next);
    } catch {
      // 隐私模式下写不进去，忽略即可
    }
  }, []);

  const requestFullscreen = useCallback(async () => {
    const screen = screenRef.current;
    if (!screen) return;
    await screen.requestFullscreen().catch(() => undefined);
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
  }, []);

  /**
   * `Esc` 退出全屏。
   *
   * ⚠️ 这一页**只有这一个键盘操作**（和站上那条铁律一致）。游戏自己用的键位
   * 走的是核心 / 转发那两条路，跟这里无关。
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exitFullscreen]);

  /* ---------------- 渲染 ---------------- */

  /**
   * 屏幕上第一行那句话：这是哪一款 / 刚才出了什么事。
   *
   * 有游戏名就报名字（载入失败时 `notice` 会另挂一行红字，两个都要说）；
   * 没名字就报 `notice` —— 「查无此款」在进页面时就已经在里面了（见上面 useState 的注释）。
   * 两样都没有（不带 id 直接进来，比如首页那个「加入房间」跳过来的）就空着：
   * 那时候屏幕上该是「房间选择」，不该出现「找不到这个游戏」。
   */
  const headline = game ? title : notice ? t(notice) : '';

  return (
    <>
      {roomToast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed left-1/2 top-5 z-[80] flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-3 border bg-ink-900 px-5 py-3 text-[13px] shadow-lg ${roomToast.kind === 'ok' ? 'border-ok/40 text-ok' : 'border-danger/40 text-danger'}`}
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full bg-current"
          />
          <span>{t(roomToast.key)}</span>
        </div>
      )}
      {mode === 'host' && !inRoom && !busy && (
        <QualityDialog
          quality={streamQuality}
          onQuality={setStreamQuality}
          pending={netplayBusy}
          disabled={mode === 'host' ? !game : !joinCode.trim()}
          error={
            netplayState.error
              ? t(NETPLAY_ERROR_MESSAGE[netplayState.error])
              : null
          }
          onConfirm={() => void start()}
          onBack={() => {
            if (window.history.length > 1) window.history.back();
            else
              window.location.assign(locale === 'zh' ? '/zh/games' : '/games');
          }}
        />
      )}
      {/*
        这一行的根**不是 `<main>`**：`.wall` 背景、右上一排入口、返回、页脚全在
        `GamesShell` 里（见 `app/[locale]/play/page.tsx`），`<main>` 由外层出。
        这里 `flex-1` + `lg:items-stretch` 是为了「吃掉外壳剩下来的纵向空间」——
        `GamesShell` 传了 `fill`，页脚因此被压到视口最底部（2026-10-14 用户要求）。
      */}
      <div
        ref={workspaceRef}
        className="play-workspace flex w-full flex-1 flex-col gap-8 lg:flex-row lg:items-stretch"
      >
        {/*
          这一页没有可见的大标题（用户要的就是干净），但**不能没有 h1** ——
          读屏和爬虫都靠它认「这一页在讲什么」。用游戏名当它，没有就退回页面自己的名字。
          （`sr-only` 是绝对定位，不参与上面那个 flex 行的分栏。）
        */}
        <h1 className="sr-only">{title || t('seo.play.title')}</h1>

        {/*
          左栏：屏幕。

          ⚠️ **这一页的「房间选择」就在这块屏幕里**（没画面时那层叠层）—— 2026-10-14
          用户定的：右侧不再有设置卡片，开局要做的选择（单人 / 创建房间 / 加入 + 链路 +
          画质）全在黑区上做完，进了房那层就换成房间码 / 分享 / 状态 / 离开。

          这块**吃满左栏的高度、屏幕在里面上下居中**（`items-center`，用户要求）。
          宽度要**同时**受两边约束：左栏给多宽就用多宽，但不能高过可用高度 —— 屏幕是
          写死 4:3 的盒子，宽度不被卡住时会撑出视口。所以里面那层卡宽度
          = min(左栏 100%, 可用高度 × 4/3)，那个 320px 是外壳（顶栏 / 返回 / 页脚）
          + 屏幕外框 + 页边距的估计值。
          ⚠️ 别改成给屏幕挂 `max-h`（或 `h-full`）—— 会和 `aspect-ratio` 打架：
          宽度还是 100%、高度被截短，而 canvas 是 `h-full w-full`，画面会被压扁。
        */}
        <section
          ref={stageRef}
          className="play-stage flex min-w-0 flex-1 items-center justify-center"
        >
          <div className="play-screen-area">
            <div
              ref={displayRef}
              className="play-display w-full"
              data-screen-size={screenSize}
            >
              {/*
              屏幕外框就是站上那套像素描边（`pixel-edge pxw-3 pxc-600 bg-ink-800 p-3`）——
              和别处的「一块屏幕」同一个观感，**别改成 1px 细边**（我第一版那么写过，被退了）。
            */}
              <div className="play-frame">
                <div className="relative" data-playing={hasPicture}>
                  <ConsoleScreen
                    canvasRef={canvasRef}
                    screenRef={screenRef}
                    rom={rom}
                    crtOff={false}
                    remoteStream={remoteStream}
                    remotePlaying={netplayState.remotePlaying}
                    remotePaused={netplayState.remotePaused}
                    netplayLive={netplayState.status === 'connected'}
                    paused={paused}
                    /* 进度走下面那块叠层（它要连「第几段 + 取消」一起说），屏幕里不再画一条 */
                    loading={null}
                    volume={volume}
                    fileOver={false}
                    variant="desktop"
                    hideHint
                    frameClassName="play-game-screen w-full"
                    onExitFullscreen={exitFullscreen}
                  />

                  {/*
                叠层：没画面时盖住整块屏幕。三种状态按优先级分开说 ——
                载入中（进度 + 取消）→ 联机等待 → 房间选择；房间信息显示在右侧。
                有画面（本机的或房主推来的）就整块撤掉。

                配色一律 `crt-*`：屏幕底永远是黑的，而 `ink-*` 会跟着主题翻转，
                浅色主题下就成了黑底黑字。`overflow-y-auto` 是兜底 —— 屏幕窄/矮到
                装不下那几行时能滚，而不是把内容顶出去。
              */}
                  {!hasPicture && (
                    <div className="play-overlay absolute inset-0 flex flex-col items-center justify-center gap-5 overflow-y-auto px-8 py-8 text-center">
                      {/*
                    「这是哪一款」两行（游戏名 + 机种）**只在加载卡不显示时才画** ——
                    卡片里已经有封面 + 名字 + 机种，叠两层就是同一句话说两遍。
                    报错那行（notice）不在此列：它不在卡里，得永远留着。
                  */}
                      {(game || notice) &&
                        !loadingCardVisible && (headline || (game && !notice)) && (
                          <div className="play-headline flex flex-col items-center gap-1">
                            {headline && !notice && (
                              <span className="text-[13px] text-crt-ink-200">
                                {headline}
                              </span>
                            )}
                            {game && (
                              <span className="text-[12px] text-crt-ink-500">
                                {CONSOLE_LABEL[game.consoleType]}
                              </span>
                            )}
                          </div>
                        )}
                      {notice && (
                        <span className="text-[12px] text-danger">
                          {t(notice)}
                        </span>
                      )}

                      {mode === 'join' &&
                      netplayState.status !== 'connected' ? (
                        <div
                          className="flex w-full max-w-[320px] flex-col items-center gap-4"
                          role="status"
                        >
                          {netplayState.error ? (
                            <>
                              <p className="text-[12px] text-danger">
                                {t(NETPLAY_ERROR_MESSAGE[netplayState.error])}
                              </p>
                              <button
                                type="button"
                                disabled={netplayBusy}
                                onClick={() => void start()}
                                className="border border-crt-ink-500 px-4 py-2 text-[12px] text-crt-ink-200 disabled:opacity-40"
                              >
                                {t('play.retryJoin')}
                              </button>
                            </>
                          ) : (
                            <>
                              <span
                                aria-hidden="true"
                                className="h-7 w-7 animate-spin rounded-full border-2 border-crt-ink-600 border-t-crt-ink-200 motion-reduce:animate-none"
                              />
                              <p className="text-[13px] text-crt-ink-200">
                                {t('netplay.joining')}
                              </p>
                            </>
                          )}
                        </div>
                      ) : busy ? (
                        /* ① 载入中：封面 + 游戏名 + 长进度条 + 取消（2026-10-15 重写） */
                        <LoadingCard
                          image={game?.imageUrl ?? null}
                          title={gameText?.title ?? null}
                          subtitle={game ? CONSOLE_LABEL[game.consoleType] : null}
                          phaseLabel={t(
                            phase === 'downloading'
                              ? 'play.downloading'
                              : 'play.booting'
                          )}
                          ratio={
                            phase === 'downloading' ? romRatio : coreRatio
                          }
                          onCancel={cancelLoad}
                          cancelDisabled={phase !== 'downloading'}
                          cancelLabel={t('play.cancel')}
                        />
                      ) : directSolo ? (
                        <div className="flex w-full max-w-[320px] flex-col items-center gap-4">
                          {!notice && !loadCancelled ? (
                            <LoadingCard
                              image={game?.imageUrl ?? null}
                              title={gameText?.title ?? null}
                              subtitle={game ? CONSOLE_LABEL[game.consoleType] : null}
                              phaseLabel={t('play.downloading')}
                              ratio={null}
                            />
                          ) : (
                            <>
                              {loadCancelled && (
                                <span
                                  role="status"
                                  className="text-[12px] text-crt-ink-300"
                                >
                                  {t('play.cancelled')}
                                </span>
                              )}
                              {game && (
                                <button
                                  type="button"
                                  onClick={() => void load()}
                                  className="pixel-edge pxw-2 pxc-500 bg-crt-950/85 px-4 py-1.5 text-[12px] text-crt-ink-200 hover:text-crt-accent"
                                >
                                  {t('play.retry')}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      ) : inRoom ? (
                        <span
                          role="status"
                          className="flex items-center gap-2 text-[12px] text-info"
                        >
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 animate-pulse rounded-full bg-current motion-reduce:animate-none"
                          />
                          {t(
                            netplayState.role === 'guest'
                              ? 'netplay.waitingGame'
                              : 'netplay.waiting'
                          )}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <MobileGamepad
            consoleType={
              rom?.console ??
              netplayState.remoteGame?.console ??
              game?.consoleType ??
              'nes'
            }
            enabled={
              hasPicture &&
              !busy &&
              !saveBusy &&
              !savesOpen &&
              !paused &&
              !netplayState.remotePaused &&
              !keybindOpen
            }
            onButton={handleTouchButton}
          />
        </section>

        {/*
          右栏：最上面是这一款的**资料块**（封面 + 名字 + 机种 / 年份 / 开发商），
          下面一张平铺的「说明 + 控件」操作表，最底下一颗「编辑」开按键设置。

          ⚠️ 资料块**照抄 `/consoles/<机种>` 那一页**（`pixel-edge` 描边块 + `object-cover`
          的 3:4 封面）：用户点名要这一页的观感向那一页看齐。操作表也一样是站上那套描边
          （`pixel-edge pxw-* pxc-*`）——「干净」指的是**只放该有的东西**（说明 + 控件，
          没有分组卡片、没有键帽、没有多余标题），不是把站上的视觉语言砍掉。
        */}
        <aside className="play-sidebar">
          {game && (
            <div className="play-game pixel-edge pxw-2 pxc-700 flex gap-3">
              <div className="pixel-edge pxw-2 pxc-700 w-[92px] shrink-0 bg-ink-900">
                {/*
                  图不在链接里、是这一页自己的主图，所以配 alt
                  —— 和游戏卡片里那个 `alt=""` 的规矩正好相反（那边紧挨着标题文字）。
                */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={game.imageUrl}
                  alt={title}
                  className="block aspect-[3/4] w-full object-cover"
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug text-ink-100">{title}</p>
                <p className="mt-1 text-[12px] text-ink-500">
                  {CONSOLE_LABEL[game.consoleType]}
                  {game.year ? ` · ${game.year}` : ''}
                </p>
                {gameText?.developer && (
                  <p className="mt-0.5 truncate text-[12px] text-ink-500">
                    {gameText.developer}
                  </p>
                )}
              </div>
            </div>
          )}

          {/*
        联机房间卡（2026-10-15：从按键下面挪上来 + 紧凑重排）。
        挪上来是因为：房主选完画质、房间建好，这张卡才冒出来 —— 原来压在
        按键长列表底下根本注意不到。刚出现时 `play-room-flash` 让边框闪几下
        主题色（见 globals.css），几秒后自己停，不打扰。
      */}
          {inRoom && netplayState.code && (
            <section
              aria-label={t('netplay.roomCode')}
              className={`play-room pixel-edge pxw-2 pxc-700 ${roomFlash ? 'play-room-flash' : ''}`}
            >
              <div className="play-panel-heading">
                <h2>{t('netplay.roomCode')}</h2>
                <button
                  type="button"
                  disabled={netplayBusy}
                  onClick={() => void leaveRoom()}
                  className="inline-flex items-center border border-danger/40 bg-danger/10 px-2 py-0.5 text-[11px] text-danger transition-colors hover:bg-danger/20 disabled:opacity-40"
                >
                  {t(
                    netplayState.role === 'host'
                      ? 'netplay.closeRoom'
                      : 'netplay.leave'
                  )}
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="font-pixel text-[16px] tracking-[0.2em] text-accent">
                  {netplayState.code}
                </p>
                <CopyBtn
                  text={netplayState.code}
                  label={t('netplay.copy')}
                  done={t('netplay.copied')}
                  sidebar
                />
              </div>
              <p
                role="status"
                className={`mt-2 flex items-center gap-2 text-[12px] ${netplayState.error ? 'text-danger' : netplayState.status === 'connected' ? 'text-ok' : netplayState.role === 'guest' ? 'text-accent' : 'text-info'}`}
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full bg-current ${!netplayState.error && netplayState.status !== 'connected' ? 'animate-pulse motion-reduce:animate-none' : ''}`}
                />
                {netplayState.error
                  ? t(NETPLAY_ERROR_MESSAGE[netplayState.error])
                  : t(
                      netplayState.status === 'connected'
                        ? 'netplay.connected'
                        : netplayState.role === 'guest'
                          ? 'netplay.joining'
                          : 'netplay.waiting'
                    )}
                {netplayState.status === 'connected' && (
                  <span
                    className={`ml-auto shrink-0 text-right text-[12px] ${netplayState.rtt === null ? 'text-ink-300' : netplayState.rtt < 100 ? 'text-ok' : netplayState.rtt < 200 ? 'text-warn' : 'text-danger'}`}
                  >
                    {t('play.latency')} ·{' '}
                    {netplayState.rtt === null
                      ? t('play.measuringLatency')
                      : `${Math.round(netplayState.rtt)} ms`}
                  </span>
                )}
              </p>
              {netplayState.role === 'host' && (
                <p className="mt-1.5 text-[12px] text-ink-400">
                  {t('netplay.quality')} · {t(QUALITY_MESSAGE[streamQuality])}
                </p>
              )}
              {netplayState.role === 'host' && !rom && !busy && (
                <button
                  type="button"
                  disabled={!game || netplayBusy}
                  onClick={() => void load()}
                  className="mt-2 w-full bg-accent px-3 py-1.5 text-[12px] text-ink-950 disabled:opacity-40"
                >
                  {t('play.retry')}
                </button>
              )}
              <div className="play-share-row mt-2 flex items-center gap-2">
                <input
                  aria-label={t('netplay.share')}
                  readOnly
                  value={shareLink(netplayState.code)}
                  onFocus={(event) => event.currentTarget.select()}
                  className="play-share-input pixel-edge pxw-1 pxc-700 w-full min-w-0 flex-1 bg-ink-950 px-2 py-1.5 text-[12px] text-ink-300"
                />
                <CopyBtn
                  text={shareLink(netplayState.code)}
                  label={t('netplay.share')}
                  done={t('netplay.shareCopied')}
                  sidebar
                />
              </div>
            </section>
          )}

          <section
            aria-label={t('keybind.open')}
            className="play-keys pixel-edge pxw-2 pxc-700"
          >
            <div className="play-panel-heading">
              <h2>{t('keybind.open')}</h2>{' '}
              {/* 编辑仍复用原有按键设置，右侧列表跟随自定义键位更新。 */}
              <button
                type="button"
                onClick={() => setKeybindOpen(true)}
                title={t('keybind.open')}
                aria-label={t('keybind.open')}
                className="play-edit pixel-edge pxw-2 pxc-500 bg-ink-800 py-2 text-[12px] text-ink-200 transition-colors hover:text-accent"
              >
                {t('play.edit')}
              </button>
            </div>
            <div
              className="mb-3 flex gap-2"
              role="group"
              aria-label={t('keybind.open')}
            >
              {(['p1', 'p2'] as const).map((player) => (
                <button
                  key={player}
                  type="button"
                  aria-pressed={keysPlayer === player}
                  onClick={() => setKeysPlayer(player)}
                  className={`flex-1 px-2 py-1.5 text-[12px] transition-colors ${keysPlayer === player ? 'bg-accent text-ink-950' : 'bg-ink-800 text-ink-200 hover:text-accent'}`}
                >
                  {t(`keybind.${player}`)}
                </button>
              ))}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              {BUTTONS.map((button) => (
                <div
                  key={button}
                  className="flex min-w-0 items-center justify-between gap-1 border-b border-ink-800 pb-2"
                >
                  <dt className="shrink-0 text-[12px] text-ink-300">
                    {buttonLabel(button, t)}
                  </dt>
                  <dd className="min-w-0 text-right">
                    <kbd className="inline-block max-w-full break-words border border-ink-600 bg-ink-850 px-1.5 py-0.5 font-mono text-[11px] text-ink-100">
                      {codeLabel(bindings[keysPlayer][button])}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
            {netplayState.role && (
              <p className="mt-3 text-[12px] leading-5 text-ink-300">
                {t('play.netplayKeysHint')}
              </p>
            )}
          </section>

          <section className="play-control-panel pixel-edge pxw-2 pxc-700">
            <h2 className="play-panel-title">{t('play.controlsTitle')}</h2>
            <ul className="play-controls">
              <Row label={t(paused ? 'panel.resume' : 'panel.pause')}>
                <RowBtn
                  label={t(paused ? 'panel.resume' : 'panel.pause')}
                  onClick={() => void togglePause()}
                  disabled={!rom || saveBusy}
                >
                  {paused ? '▶' : '❚❚'}
                </RowBtn>
              </Row>

              <Row label={t('panel.reset')}>
                <RowBtn
                  label={t('panel.reset')}
                  onClick={() => void reload()}
                  disabled={!rom || busy || saveBusy}
                >
                  <ReloadIcon size={16} />
                </RowBtn>
              </Row>

              <Row label={t('play.fullscreen')}>
                <RowBtn
                  label={t('play.fullscreen')}
                  onClick={() => void requestFullscreen()}
                >
                  <ExpandIcon size={15} />
                </RowBtn>
              </Row>

              {/* 显示（夜 / 昼）。说明写的是「点了会变成什么」，和上面几行同一口径 */}
              <Row label={t('play.theme')}>
                <RowBtn
                  label={t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')}
                  onClick={toggleTheme}
                >
                  {theme === 'dark' ? (
                    <SunIcon size={15} />
                  ) : (
                    <PlayMoonIcon size={16} />
                  )}
                </RowBtn>
              </Row>

              {/* 音量：− / 档位格 / +。点档位格直接跳档（和 `/room` 面板上那套同语义） */}
              <PlaySaveControls
                controller={controller}
                rom={rom}
                gameId={game?.id}
                disabled={busy || saveBusy}
                onBusy={setSaveBusy}
                onOpen={setSavesOpen}
              />
              <Row label={t('play.volume')} wide>
                <span
                  className="play-volume-group flex items-center gap-1.5"
                  style={{
                    width: `calc(var(--play-control-size, 26px) * 2 + ${VOLUME_MAX * 9 + 9}px)`
                  }}
                >
                  <RowBtn
                    label={t('volume.down')}
                    onClick={() => changeVolume(volume - 1)}
                    disabled={volume <= 0}
                  >
                    −
                  </RowBtn>
                  <span className="flex items-center gap-[3px]">
                    {Array.from({ length: VOLUME_MAX }, (_, i) => i + 1).map(
                      (level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => changeVolume(level)}
                          title={t('volume.set', { level, max: VOLUME_MAX })}
                          aria-label={t('volume.set', {
                            level,
                            max: VOLUME_MAX
                          })}
                          className={`h-[12px] w-[5px] transition-colors ${
                            level <= volume ? 'bg-accent' : 'bg-ink-700'
                          }`}
                        />
                      )
                    )}
                  </span>
                  <RowBtn
                    label={t('volume.up')}
                    onClick={() => changeVolume(volume + 1)}
                    disabled={volume >= VOLUME_MAX}
                  >
                    +
                  </RowBtn>
                </span>
              </Row>

              <Row label={t('play.screenSize')} wide>
                <span
                  className="play-size-group grid grid-cols-3 items-center gap-3"
                  style={{
                    width: `calc(var(--play-control-size, 26px) * 2 + ${VOLUME_MAX * 9 + 9}px)`
                  }}
                >
                  {TV_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      aria-pressed={screenSize === size}
                      aria-label={t('tvSize.pick', {
                        level: t(`tvSize.opt.${size}`)
                      })}
                      onClick={() => applyScreenSize(size)}
                      className={`pixel-edge pxw-2 pxc-500 px-2 py-1 text-[12px] transition-colors ${screenSize === size ? 'bg-accent text-ink-950' : 'bg-ink-800 text-ink-200 hover:text-accent'}`}
                    >
                      {t(`tvSize.opt.${size}`)}
                    </button>
                  ))}
                </span>
              </Row>
            </ul>
          </section>
        </aside>
      </div>

      {/*
        自定义按键。这一页的 `localPlaying` 就是「本机插着卡带没有」——
        房主天然是 true，加入者是 false（他没有本机模拟器，改完立刻生效）。
      */}
      <KeyBindingsPanel
        open={keybindOpen}
        bindings={bindings}
        role={netplayState.role}
        localPlaying={Boolean(rom)}
        onChange={(next) => {
          setBindings(next);
          controller.setBindings(next);
          void saveBindings(next);
        }}
        onReload={reload}
        onClose={() => setKeybindOpen(false)}
      />
    </>
  );
}

/* ================================================================== *
 * 下面这些是这一页自己的小组件与常量（房间那边有各自的一套，没必要合并）
 * ================================================================== */

/** 重试音频轨的最长尝试次数（每次 500ms）—— 和 ConsoleScene 里那个常量同值 */
const AUDIO_RETRY_LIMIT = 10;

/**
 * 屏幕档位的落盘键。**和 room 的 `TV_KEY` 是同一个字符串**（也等于首屏内联脚本
 * 里读的那个键）—— 两页共用一份偏好，所以刻意不另起 `nesload:play-size`。
 */
const TV_KEY = 'nesload:tv';

/**
 * 这一页的默认档：**中**（2026-10-15 用户指定「初次默认是中」）。
 *
 * 刻意不复用 `lib/tv-size.ts` 的 `DEFAULT_TV_SIZE`（那边是 `small`，是**房间**的默认）：
 * 这里 `medium` 映射的是 `--play-size-scale: .88`，而房间那边同一档是 `--tv-ratio: .9`，
 * 各自是「自己那套排版里合适的大小」，两页的默认没有理由绑在一起。
 *
 * ⚠️ 这只在**从没选过**时生效。用户一旦点过任意一档，`nesload:tv` 就有值了 ——
 * 包括在 `/room` 里点的那一次，属共用偏好（见上面 `TV_KEY`），这里会照样跟着走。
 * 也就是说「初次」指的是**这台浏览器从没记录过档位**，不是「每次打开 /play」。
 */
const PLAY_DEFAULT_SCREEN_SIZE: TvSize = 'medium';

/** 画质三档的顺序：由省到费 */
const QUALITY_ORDER: StreamQuality[] = ['smooth', 'balanced', 'sharp'];

const QUALITY_MESSAGE: Record<StreamQuality, MessageKey> = {
  smooth: 'netplay.qualitySmooth',
  balanced: 'netplay.qualityBalanced',
  sharp: 'netplay.qualitySharp'
};

function QualityDialog({
  quality,
  onQuality,
  pending,
  disabled,
  error,
  onConfirm,
  onBack
}: {
  quality: StreamQuality;
  onQuality: (quality: StreamQuality) => void;
  pending: boolean;
  disabled: boolean;
  error: string | null;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    headingRef.current?.focus();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="play-quality-title"
      onCancel={(event) => event.preventDefault()}
      onKeyDown={(event) => event.stopPropagation()}
      className="play-quality-dialog"
    >
      <h2
        ref={headingRef}
        tabIndex={-1}
        id="play-quality-title"
        className="text-[20px] font-semibold text-ink-100 outline-none"
      >
        {t('netplay.quality')}
      </h2>
      <p className="mt-2 text-[13px] leading-6 text-ink-300">
        {t('play.qualityIntro')}
      </p>
      <div className="my-5 flex flex-col gap-2.5">
        {QUALITY_ORDER.map((value) => (
          <button
            key={value}
            type="button"
            disabled={pending}
            aria-pressed={quality === value}
            onClick={() => onQuality(value)}
            className={`flex items-center gap-3 border px-4 py-3 text-left transition-colors disabled:opacity-50 ${quality === value ? 'border-ink-300 bg-ink-800' : 'border-ink-700 bg-ink-900 hover:bg-ink-850'}`}
          >
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[12px] ${quality === value ? 'border-ink-200 bg-ink-200 text-ink-950' : 'border-ink-500'}`}
            >
              {quality === value ? '✓' : ''}
            </span>
            <span>
              <span className="block text-[13px] font-semibold text-ink-100">
                {t(QUALITY_MESSAGE[value])}
              </span>
              <span className="mt-1 block text-[12px] leading-5 text-ink-300">
                {t(`play.qualityHint.${value}`)}
              </span>
            </span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mb-4 text-[12px] text-danger">
          {error}
        </p>
      )}
      <p className="mb-4 text-[12px] leading-5 text-ink-400">
        {t('play.qualityConfirmHint')}
      </p>
      <div className="grid grid-cols-2 gap-3 border-t border-ink-700 pt-4">
        <button
          type="button"
          onClick={onBack}
          className="border border-ink-600 px-4 py-2.5 text-[13px] text-ink-200 hover:bg-ink-800"
        >
          {t('common.back')}
        </button>
        <button
          type="button"
          disabled={pending || disabled}
          onClick={onConfirm}
          className="bg-accent px-4 py-2.5 text-[13px] font-semibold text-ink-950 hover:bg-accent/80 disabled:opacity-40"
        >
          {t(pending ? 'play.connecting' : 'play.confirm')}
        </button>
      </div>
    </dialog>
  );
}

/**
 * 错误码 → 文案。写成 Record 是为了拿穷尽性检查：`lib/netplay.ts` 里加了新码、
 * 这里漏一条就直接编译不过（和 NetplayPanel 里那张表同一个用意）。
 */
const NETPLAY_ERROR_MESSAGE: Record<NetplayError, MessageKey> = {
  'bad-code': 'netplay.badCode',
  'insecure-context': 'netplay.errInsecure',
  'no-direct-connection': 'netplay.errNoDirect',
  'room-password': 'netplay.errPassword',
  handshake: 'netplay.errHandshake',
  'host-left': 'netplay.errHostLeft',
  'room-full': 'netplay.errRoomFull',
  'join-failed': 'netplay.errUnknown'
};

/**
 * 分享链接 = 当前地址 + `?room=<码>`。
 *
 * 拼的是 `window.location` 现址（协议 / 域名 / 端口全带上），而不是自己拼 origin ——
 * 本地 `localhost:3000` 和线上域名都不用分支判断。顺手抹掉 hash：`#` 后面那段是
 * 页面自己的状态，留着只会让链接更长。（和 NetplayPanel 里那颗分享钮同一套做法。）
 *
 * ⚠️ `?id=` 会**留在链接里** —— 收到的人打开就是同一款游戏、房间码也预填好了。
 */
function shareLink(code: string): string {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  url.searchParams.set(ROOM_QUERY_PARAM, code);
  // 邀请链接只预填加入房间，不能继承房主入口的自动创建行为。
  url.searchParams.delete('mode');
  url.hash = '';
  return url.toString();
}

/**
 * 房主出画用的那条流。
 *
 * 画面来自 `canvas.captureStream`（声音另走 WebAudio 旁路，见 lib/audio-tap.ts）——
 * 帧率是**建流参数**，事后改不了，所以质量档变了只能整条重建。
 */
function createCaptureStream(
  canvas: HTMLCanvasElement | null,
  fps: number
): MediaStream | null {
  if (!canvas || typeof canvas.captureStream !== 'function') return null;
  return canvas.captureStream(fps);
}

/**
 * 载入卡（2026-10-15 重写，替代旧的「一行字 + 短进度条」）：
 * 封面图 + 游戏名 + 机种 + 阶段文案，下面一条**长进度条**（`ratio` 到 1 时填满）
 * 和百分比；传了 `onCancel` 就带取消钮（没传就不画 —— directSolo 那条老路径没有取消）。
 *
 * 颜色一律 `crt-*`：面板底是 `crt-ink-600`（#33333c，实心灰蓝）—— 黑屏幕上
 * 「亮一块」的卡片感，比再垫一层近黑底对比明显；`ink-*` 会跟主题翻转、浅色下会黑底黑字。
 * `game` 取不到时（地址上没 id / 查询失败）自动退化成「只有进度条」的极简版。
 * 封面走 `<img>` 不走 next/image —— 和游戏库那边同一个理由（R2 公网域名没登记 remotePatterns）。
 */
function LoadingCard({
  image,
  title,
  subtitle,
  phaseLabel,
  ratio,
  onCancel,
  cancelDisabled = false,
  cancelLabel
}: {
  image: string | null;
  title: string | null;
  subtitle: string | null;
  phaseLabel: string;
  ratio: number | null;
  onCancel?: () => void;
  cancelDisabled?: boolean;
  cancelLabel?: string;
}) {
  const pct = ratio === null ? null : Math.round(ratio * 100);
  return (
    <div
      role="status"
      className="flex w-full max-w-[320px] flex-col items-center gap-3 border border-crt-ink-500 bg-crt-ink-600 px-5 py-4"
    >
      {(image || title) && (
        <div className="flex w-full items-center gap-2.5 text-left">
          {image && (
            <img
              src={image}
              alt=""
              className="h-16 w-12 shrink-0 border border-crt-ink-500 bg-crt-950 object-cover"
            />
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            {title && (
              <span className="line-clamp-2 text-[12px] font-semibold leading-snug text-crt-ink-200">
                {title}
              </span>
            )}
            {subtitle && (
              <span className="text-[10px] text-crt-ink-500">{subtitle}</span>
            )}
            <span className="text-[10px] text-crt-ink-400">{phaseLabel}</span>
          </div>
        </div>
      )}
      {!(image || title) && (
        <span className="text-[11px] text-crt-ink-300">{phaseLabel}</span>
      )}

      {/* 长条：到 100% 恰好填满。`ratio` 为 null 时画来回滑的「不确定」条 */}
      <div className="flex w-full items-center gap-2.5">
        <div className="relative h-2 flex-1 overflow-hidden border border-crt-ink-500 bg-crt-950">
          {pct === null ? (
            <span className="load-slide absolute inset-y-0 left-0 w-1/3 bg-crt-accent/70" />
          ) : (
            <span
              className="absolute inset-y-0 left-0 bg-crt-accent transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
        {/* 百分数全是数字，font-pixel 掉不了字形；宽度写死，位数变化时不抖 */}
        <span className="w-[34px] shrink-0 font-pixel text-[11px] text-crt-ink-300">
          {pct === null ? '' : `${pct}%`}
        </span>
      </div>

      {onCancel && (
        /*
          取消：**只在 ROM 下载那一段可用**。核心已经在唱戏之后
          Nostalgist 没有中断接口（见 load() 的注释），按了也没用 ——
          与其画一颗假的，不如让它灰着。
        */
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelDisabled}
          className="pixel-edge pxw-2 pxc-500 bg-crt-950 px-4 py-1 text-[11px] text-crt-ink-200 transition-colors enabled:hover:text-crt-accent disabled:cursor-not-allowed disabled:opacity-35"
        >
          {cancelLabel}
        </button>
      )}
    </div>
  );
}

/** 复制一颗东西到剪贴板，成功后自己显示一小会儿「已复制」。 */
function CopyBtn({
  text,
  label,
  done,
  sidebar = false
}: {
  text: string;
  label: string;
  done: string;
  sidebar?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => {
        if (!text) return;
        void navigator.clipboard.writeText(text).then(
          () => setCopied(true),
          // 剪贴板被拒（非安全上下文 / 用户拒绝）时静默：码就在屏幕上，手抄也行
          () => undefined
        );
      }}
      className={`pixel-edge pxw-2 pxc-500 shrink-0 whitespace-nowrap px-2.5 py-1 text-[12px] transition-colors ${sidebar ? 'bg-ink-800 text-ink-200 hover:text-accent' : 'bg-crt-950/85 text-crt-ink-200 hover:text-crt-accent'}`}
    >
      {copied ? done : label}
    </button>
  );
}

/**
 * 操作表的一行：左边说明，右边控件。
 *
 * 抽出来是因为六行的版式完全一样（`justify-between` + 同样的上下内边距），
 * 各写一遍迟早会有行高不一样。行之间的分隔线交给父级 `<ul>` 的 `divide-y`。
 */
function Row({
  label,
  children,
  wide = false
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <li
      className={`flex items-center justify-between gap-3 py-2.5 ${wide ? 'col-span-2' : ''}`}
    >
      <span className="text-[12px] text-ink-400">{label}</span>
      {children}
    </li>
  );
}

/**
 * 操作表右侧那颗小方钮。
 *
 * ⚠️ 和 `/room` 的键帽（`.panel-key`）**不是一回事**，别混：那一套有立体描边和按下
 * 下沉，这一页要的就是干净的一格。`danger` 那颗（弹出）默认带一档红 —— 危险动作
 * 不靠 hover 才看得出来。`title` / `aria-label` 都取 label：右侧控件只剩图标或符号，
 * 说明文字在左边那一列里（所以两颗都得有，不然读屏读出来是空的）。
 */
function RowBtn({
  label,
  danger = false,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`play-icon-button pixel-edge pxw-2 pxc-500 flex shrink-0 items-center justify-center text-[12px] leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        danger
          ? 'bg-ink-800 text-danger/75 enabled:hover:bg-ink-700 enabled:hover:text-danger'
          : 'bg-ink-800 text-ink-300 enabled:hover:bg-ink-700 enabled:hover:text-accent'
      }`}
      {...props}
    >
      {children}
    </button>
  );
}
