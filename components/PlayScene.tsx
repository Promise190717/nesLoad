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
import { biosTypeFor, ensureBios } from '@/lib/bios';
import {
  EmulatorController,
  IncompleteRomError,
  localCoreWasmUrl,
  unsupportedArchive,
  UnsupportedRomError,
  VOLUME_MAX,
  type LoadedRom
} from '@/lib/emulator';
import { preloadCoreWasm, settlePreload } from '@/lib/core-preload';
import { readGamepads } from '@/lib/gamepad';
import { IncompleteBodyError, fetchRomWithProgress, isAbortError } from '@/lib/http';
import { unwrapRom, type UnwrappedEntry, type UnwrappedRom } from '@/lib/unwrap';
import { setPlayActive } from '@/lib/play-leave-guard';
import { localePath, type MessageKey } from '@/lib/i18n';
import {
  buttonLabel,
  buttonsFor,
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
import { consoleLabel } from '@/lib/consoles';
import ConsoleScreen from './ConsoleScreen';
import { localizeLibraryGame, type LibraryGame } from './GameLibraryPanel';
import { useI18n } from './I18nProvider';
import KeyBindingsPanel from './KeyBindingsPanel';
import PadGlyph from './PadGlyph';
import PlaySaveControls from './PlaySaveControls';
import { unpackSave } from '@/lib/state-file';
import { MobileGamepad } from './HandheldConsole';
import { ExpandIcon, PlayMoonIcon, ReloadIcon, SunIcon } from './icons';
import { TV_SIZES, type TvSize } from '@/lib/tv-size';
import { readTheme, saveTheme } from '@/lib/theme';

/*
 * `/play` —— 从游戏详情那颗「联机游戏」进来的**简洁开局页**（2026-10-14 加，用户要求）。
 *
 * 加载 ROM、核心、BIOS、键盘转发、联机推流这些「引擎侧」的事走 `EmulatorController` /
 * `NetplayController` / `lib/http.ts` / `lib/bios.ts`，屏幕那块直接复用 `ConsoleScreen`。
 *
 * 这一页的**功能面**刻意窄 —— 没有存档 / 读档 / 历史 / 云端 / 拖本地文件 / 彩蛋。
 * 用户的原话就是「尽量简洁」。
 *
 * 两页刻意**不追求行为一致**的地方只有一个：这一页不会自动载入。用户要的是
 * 「先选模式，点开始才加载」——`?id=` 只负责把要玩的那一款摆在黑区里。
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
 * **别把满屋子的布景 / 电视机 / 抽屉 / 键帽面板搬过来**，
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
   * 服务端预取的那一款。三态：
   * `undefined` = 地址上没有 `?id=` 或服务端查询抛了异常（客户端打接口兜底）、
   * `null` = 有 id 但库里没有、`Game` = 查到了。
   */
  serverGame?: LibraryGame | null;
  initialMode?: 'solo' | 'host';
  autoStart?: boolean;
  initialRoomCode?: string;
  /**
   * 这一局用哪个语言版本的 ROM（`?lang=`，2026-10-19 加）。
   *
   * 只对**源站模式**（`CATALOG_SOURCE=upstream`）有意义：数据库那条路里 id 已经决定了是哪一份。
   * 空 = 不带参数，ROM 代理按默认版本回源。
   */
  romLang?: string;
}

export default function PlayScene({
  serverGame,
  initialMode = 'solo',
  autoStart = false,
  initialRoomCode = '',
  romLang = ''
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
      /*
      宽高比**所有机种统一按 4 / 3**，NDS 也不例外。

      原因（2026-10-15 用户定的）：NDS 是竖屏双屏，如果让它的外框按自己的 2:3 缩窄，
      切换游戏时整块屏幕会**忽大忽小、形状突变**，很突兀。改成「外框尺寸统一、
      竖屏在里面居中内缩」—— 和别的机种一个占位，
      多出来的两侧由屏幕自己的黑底（`ConsoleScreen` 根节点是 `bg-black`，
      配合 `canvas { object-fit: contain }`）自然填成黑色，读起来还是一整块屏幕。
      */
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
  /** 防重入：载入中再点一次「开始」不该把正在跑的那次搅了 */
  const loadingRef = useRef(false);
  const activeRef = useRef(false);

  // 惰性初始化持有实例：只建一次，也避免在渲染期读写 ref（react-hooks/refs）
  const [controller] = useState(() => new EmulatorController());

  const [game, setGame] = useState<LibraryGame | null>(serverGame ?? null);
  const [rom, setRom] = useState<LoadedRom | null>(null);
  const [paused, setPaused] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [loadCancelled, setLoadCancelled] = useState(false);

  /**
   * 这一局的机种。三个来源按可信度排：
   *   1. `rom.console` —— 真插上去的那盘说了算；
   *   2. `game.consoleType` —— 服务端预取（或接口兜底）那一款，**还没插卡带时唯一能用的**；
   *   3. null —— 地址上没带 `?id=`（首页那个「加入房间」表单跳过来的就是这种），
   *      这会儿压根不知道要跑什么，只能等房主出画面。
   */
  const consoleType = rom?.console ?? game?.consoleType ?? null;

  /**
   * 单人机 —— 现在只有 NDS（2026-10-15 用户定的：「nds 不支持双人了」）。
   *
   * 这一页要拦的是**地址栏上手动塞进来的联机参数**：`?mode=host`（建房）和
   * `?room=XXXX`（当加入者）。两个都不该对 NDS 生效 —— 见下面 `mode` 和那条
   * 自动加入的 effect。
   *
   * 判据跟着 `consoleType` 走，所以服务端预取到了（正常情况）第一帧就成立；
   * 万一服务端那次查询抛了、走客户端兜底，`game` 到齐那一刻也会自动成立。
   */
  const soloOnly = consoleType === 'nds';

  const directSolo = (autoStart && initialMode === 'solo') || (soloOnly && Boolean(game));
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
  /**
   * 这盘 ROM 是站点吃不下的格式时挂上 —— 和 `notice` **并排**显示。
   * 三种：`7z` / `rar`（压缩包），以及 `disc`（**多文件光盘镜像的描述文件**）。
   *
   * 判据统一走 `unsupportedArchive()`；这一页没有弹窗，只能直接摊在屏幕上。
   *
   * ⚠️ 单独一个 state 而不是塞进 `notice`：`notice` 存的是 `MessageKey`（不带参数），
   *    而 `7z` / `rar` 那条要带 `{ ext }`。两者的生命周期倒是一样的（每次 `load` 开头一起清）。
   */
  const [archive, setArchive] = useState<'7z' | 'rar' | 'disc' | null>(null);
  /** 这一笔 ROM 下载的取消把手；没有下载在飞时是 null */
  const abortRef = useRef<AbortController | null>(null);
  /**
   * 当前这盘 ROM 的文件本体。
   *
   * 「重载」拿它重新插一次，不必再下几十 MB。
   * 代价是它整局都留在内存里（浏览器对大 Blob 多半落盘），换「重载不必联网」值得。
   */
  const lastRomRef = useRef<File | null>(null);

  const [volume, setVolume] = useState(VOLUME_MAX);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const workspaceRef = useRef<HTMLDivElement>(null);
  const themeFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (themeFadeTimer.current !== null) clearTimeout(themeFadeTimer.current);
      document.documentElement.classList.remove('play-theme-fading');
      document.documentElement.style.removeProperty('--theme-fade-duration');
    };
  }, []);
  const [bindings, setBindings] = useState<KeyBindings>(DEFAULT_BINDINGS);
  const [keybindOpen, setKeybindOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [savesOpen, setSavesOpen] = useState(false);
  /**
   * 右侧按键表当前看的是哪一组。**只在单机（`mode === 'solo'`）下有意义** ——
   * 联机和单人机都锁在 1P 上（见下面 `keysLocked`），那时这个 state 被整个绕过。
   *
   * 初值恒定 `'p1'`。原来写的是 `initialRoomCode ? 'p2' : 'p1'`（邀请链接进来默认
   * 停在玩家 2），那是按「加入者在游戏里是 2P」猜的，可**联机时他手上按的仍是自己
   * 那套 1P 键位** —— 转发就按 `bindings.p1` 反查（见 lib/keybindings.ts 的
   * `codeToButton`）。表上写 2P、实际按 1P，属于说一套做一套，删掉。
   */
  const [keysPlayer, setKeysPlayer] = useState<'p1' | 'p2'>('p1');
  /*
   * 预挂载值只能是`PLAY_DEFAULT_SCREEN_SIZE`（中）：服务端没有 localStorage，
   * 首屏那份**用户真实偏好**由下面的 effect 从 `<html data-tv>` 读回来后补上。
   * 两边都是「中」时首帧不跳；用户存过别的档位，就由首屏内联脚本先写属性、
   * effect 再对齐 —— 和主题 / 键位同一条路。
   */
  const [screenSize, setScreenSize] = useState<TvSize>(
    PLAY_DEFAULT_SCREEN_SIZE
  );
  /**
   * 右栏（按键设置 / 房间卡 / 游戏控制）收起来没有（2026-10-19 加，用户要求）。
   *
   * **不落盘**：这是「这一会儿想不想看面板」，不是长期偏好 —— 而且初值只能是
   * 「展开」（服务端没有 localStorage），存过值的话首屏必然先画开再收起，闪一下。
   * 收起时右栏只剩一条 40px 的窄轨（那颗钮还在），屏幕能多吃 260px 的宽度
   * （窗口又高又窄、屏幕被宽度卡住时才真的变大；其余情况屏幕尺寸是高度算死的）。
   */
  const [sidebarOpen, setSidebarOpen] = useState(true);

  /**
   * 地址栏上写着的模式（`?room=` 优先当加入者，否则看 `?mode=`）。**只是初值**，
   * 真正生效的是下面那个 `mode` —— 它是从这里派生出来的。
   */
  const [rawMode] = useState<PlayMode>(initialRoomCode ? 'join' : initialMode);
  /**
   * 实际生效的模式。
   *
   * ⚠️ **单人机（NDS）一律落回单人**：`?mode=host` / `?room=` 是可以在地址栏上手打的，
   * 用户 2026-10-15 明确要求「即使自己添加联机参数进来也要忽略」。拦在这里而不是只拦
   * 在游戏详情那颗钮上 —— 那颗钮只管「正常入口」，管不住手打地址。
   *
   * 派生而不是 `useEffect` 里改 state：`consoleType` 可能晚一步才知道（服务端预取失败
   * 时走客户端兜底），派生出来的一定跟着变，不会留下一个已经点开了的建房弹窗。
   */
  const mode: PlayMode = soloOnly ? 'solo' : rawMode;
  /**
   * 右侧那张按键表是不是**锁在 1P**、并且不画 P1 / P2 切换。两种情况锁的是同一组：
   *
   *   · **单人机（NDS）**：它不支持双人，摆一颗「玩家 2」出来等于告诉用户「这台机器
   *     能双人」（2026-10-15 用户要求）—— 和 `KeyBindingsPanel` 的 `soloOnly` 同一个理由。
   *   · **联机（房主 / 加入者）**：两位玩家各在自己的设备前，用的都是**自己那套 1P 键位**。
   *     房主本机跑模拟器，核心只读 `input_player1_*`；加入者转发按键也按自己的
   *     `bindings.p1` 反查（见 lib/keybindings.ts 的 `codeToButton`）。P2 那组在联机里
   *     是**对面输入落地的位置**（房主侧注入），压根不是本机能配的东西。
   *
   * 判据用派生的 `mode` 而不是 `netplayState.role`：后者要连上才有，而地址上带了
   * `?room=` / `?mode=host` 进来时，**进页面那一刻起**两边用的就都是 1P 键位了。
   */
  const keysLocked = soloOnly || mode !== 'solo';
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
   * 这里**不认「刚连上 / 对方离开」那两枚会自动消失的提示**：
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
     * （本仓库既有规则），所以推到 `.then()` 里。
     */
    const storedTheme = readTheme();
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
     * 屏幕尺寸用 `nesload:tv` 落盘（首屏内联脚本读的也是这个键），
     * 所以这一页选完刷新、下次再进来都还是那一档。
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
   * 这一页没有拖本地文件，`file` 只从「重载 / 恢复电池存档」来。
   * 取消只覆盖**下载 ROM 那一段**：核心启动之后 Nostalgist 没有公开的中断接口，
   * 所以「取消」按钮在 booting 阶段是灰的。
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
      setArchive(null);
      setRomRatio(null);
      setCoreRatio(null);

      // 重载那条路：文件已经在手上，不必再下一次
      let romFile = file ?? null;
      /*
       * 多碟的 `.m3u` 只是一份播放列表（几行文本），重载 / 读档时不能拿它去启动 ——
       * 核心要的是碟片镜像。看到它就退回「手上没有文件」，走下面那条重新下载全部碟的路。
       */
      if (romFile && /\.m3u$/i.test(romFile.name)) romFile = null;
      /*
       * 多碟时由下面那段自己拼出来的「m3u + 全部碟」的包裹结果。
       * 非多碟恒为 null，`unwrapRom` 照旧在这儿拆一次。
       */
      let preparedOverride: UnwrappedRom | null = null;
      /*
       * 核心预热的句柄（见 `lib/core-preload.ts`）。只在下 ROM 那条路上开，
       * 重载时核心必然已经在缓存里，再预热一遍是白活。
       */
      let coreWarm: Promise<void> | null = null;
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        if (!romFile) {
          setPhase('downloading');
          /*
           * 边下 ROM 边把核心拉进缓存：这两段网络以前是**串行**的（PS1 那张 300 MB
           * 的盘下完才轮到 2.9 MB 的核心），现在重叠起来，启动阶段只剩编译。
           *
           * 用 `game.consoleType` 就够：光盘套装的真机种要等 `unwrapRom` 才知道，
           * 但那一路预热失败也只是「没提速」，核心自己还会照常去拉。
           */
          coreWarm = preloadCoreWasm(localCoreWasmUrl(game!.consoleType ?? null), ac.signal);
          /*
           * 多碟 CD 游戏（2026-10-22）走单独一条：**全部碟下完、各自解包，再拼一份 `.m3u` 当启动文件**。
           *
           * 为什么不是「按需换碟」：libretro 的 m3u 必须在启动时就列全，而且
           * `EJS` 那个右下角软盘菜单是**同步切碟**的 —— 它不会等我们下载。文件不在虚拟
           * 文件系统里，切过去就是黑的。所以能确定的只有这一条：启动前把碟都放进去。
           *
           * 顺序有讲究：`loadRom` 里 `runMain()` 取的是 `rom[0].name`，所以 m3u 必须排第一
           * （见 lib/emulator.ts 的 `romFiles` 那段），其余碟跟在后面一起写进内容目录。
           */
          const langGroup =
            game!.romLanguages?.find((item) => item.code === romLang) ?? game!.romLanguages?.[0];
          const discs = langGroup?.discs ?? [];
          if (discs.length > 1 && game!.consoleType === 'ps1') {
            const entries: UnwrappedEntry[] = [];
            /* m3u 的每一行：解包后主文件的名字（`.cue`），拿不到才退回库里的入口名/原名。 */
            const lines: string[] = [];

            for (const [index, disc] of discs.entries()) {
              const query = new URLSearchParams({ disc: String(disc.disc) });
              if (romLang) query.set('lang', romLang);
              const report = (ratio: number | null) => {
                if (!ac.signal.aborted && activeRef.current) {
                  /* 多碟按碟数均分进度条，否则第二碟会把 0→100% 再走一遍。 */
                  setRomRatio((index + (ratio ?? 0)) / discs.length);
                }
              };

              const blob = await fetchRomWithProgress(
                `/api/games/${game!.id}/rom?${query.toString()}`,
                { signal: ac.signal, onProgress: report }
              );
              if (ac.signal.aborted || !activeRef.current) return;

              const discFile = new File([blob], disc.name, { type: 'application/octet-stream' });
              const unwrappedDisc = await unwrapRom(discFile, report, ac.signal);
              if (ac.signal.aborted || !activeRef.current) return;

              if (unwrappedDisc) {
                /* zip / 7z：主文件（cue）+ 伴生 bin 一起进内容目录，m3u 写 cue 名。 */
                entries.push(unwrappedDisc.main, ...(unwrappedDisc.companions ?? []));
                lines.push(unwrappedDisc.main.name);
              } else {
                /* chd / pbp 这类单文件：本身就是 m3u 的一行。 */
                entries.push({ name: discFile.name, size: discFile.size, file: discFile, bytes: null });
                lines.push(disc.entryName ?? disc.name);
              }
            }

            const m3uName = `${game!.id}.m3u`;
            const m3uFile = new File([`${lines.join('\n')}\n`], m3uName, {
              type: 'application/x-mpegurl',
            });
            preparedOverride = {
              main: { name: m3uName, size: m3uFile.size, file: m3uFile, bytes: null },
              companions: entries,
              console: 'ps1',
              innerName: m3uName,
              container: 'zip',
            };
            romFile = m3uFile;
          } else {
            /*
             * 走**分片**那条（见 `lib/http.ts` 的 `fetchRomWithProgress`）：
             * 一个请求搬不动几百 MB，PS1 的盘动辄 300 MiB，整包 GET 会被截断在几 MB 上。
             */
            const romUrl = romLang
              ? `/api/games/${game!.id}/rom?lang=${encodeURIComponent(romLang)}`
              : `/api/games/${game!.id}/rom`;
            const blob = await fetchRomWithProgress(romUrl, {
              signal: ac.signal,
              onProgress: setRomRatio,
            });
            /*
             * 文件名必须跟着**选中的那一份语言**走（源站模式那批才有多个版本）：
             * `unwrapRom` / `detectConsole` 看扩展名决定要不要解包 —— 选了中文 `.nes`
             * 却顶着英文版那个 `.zip` 的名字，就会去解一个根本不是压缩包的文件。
             */
            const romName =
              game!.romLanguages?.find((item) => item.code === romLang)?.name ?? game!.romName;
            romFile = new File([blob], romName, {
              type: 'application/octet-stream'
            });
          }
        }

        if (ac.signal.aborted || !activeRef.current) return;
        lastRomRef.current = romFile;

        /*
         * **先拆包**（2026-10-19）：PS1 的盘常见「zip 里装 `.cue` + `.bin`」，
         * 拆出来才知道这是 PS1（`.cue` 没有魔数，`EXTENSION_MAP` 也不收它）。
         * 结果要传给 `loadRom`（第 5 个参数）—— 否则它内部会再拆一遍，
         * 252 MB 的盘白解一次。
         *
         * ⚠️ 这一段的 phase **还是 `downloading`**（不是 `booting`）：7z 包要在
         *    Worker 里解十几秒，进度得接在 ROM 那根条上，否则那十几秒是一块死屏。
         */
        /* 多碟那条路已经在上面拼好 m3u + 全部碟了，别再拆一遍（m3u 也拆不出东西）。 */
        const prepared = preparedOverride ?? await unwrapRom(
          romFile,
          (ratio) => {
            if (ac.signal.aborted || !activeRef.current) return;
            setRomRatio(ratio);
          },
          /*
           * 把取消信号接进来：7z 解一张几百 MB 的盘要跑几十秒，光 reject 掉 Promise
           * 不够 —— worker 还在解、输入整包和已解出的字节都还钉在它的堆上。
           * 信号一到 `extractSevenZip` 就 `terminate()`。
           */
          ac.signal
        );
        if (ac.signal.aborted || !activeRef.current) return;
        setPhase('booting');

        /*
         * 需要 BIOS 的机种（街机 / PS1，见 `lib/bios.ts` 的 `biosTypeFor`）要带上那一份 ——
         * `ensureBios()` 会先把**站点自带**的那份备上（`public/bios/`），用户拖进来的能覆盖它。
         *
         * ⚠️ 只有街机有站点副本：PS1 那份（SCPH1001.BIN）是版权物，`public/bios/` 里不放，
         *    所以 `ensureBios('ps1')` 正常恒为 null —— 那是预期行为（核心回落 HLE，游戏照跑）。
         * 其余机种一律 null，`loadRom` 内部按机种自己判断要不要用。
         */
        const targetConsole = prepared?.console ?? game?.consoleType ?? null;
        const wantedBios = biosTypeFor(targetConsole);
        const bios = wantedBios ? await ensureBios(wantedBios) : null;
        if (ac.signal.aborted || !activeRef.current) return;

        /*
         * 机种定了，键位也跟着定 —— 用户**没自定义过**的话，NDS 要换成它自己那套
         * （见 lib/keybindings.ts 的 `defaultBindingsFor`：十字键在方向键、A/B/X/Y
         * 在 Z X / A S、肩键在 Q E / R W）。
         *
         * ⚠️ 必须在**启动之前**做：`bindingsToRetroArch(this.bindings)` 是 `loadRom`
         * 里一次性写进 RetroArch 配置的，核心起来之后再改就得重载卡带。
         * 也不能只靠 `consoleType` 那个派生值来「重新算一遍」—— 它要到 `setRom`
         * 之后才知道（那是启动完的事），那时候已经晚了。
         *
         * `loadBindings(机种)` 的语义是「存过就用存的那份」，所以真改过键位的人
         * 一个字都不会被冲掉。
         */
        const resolved = loadBindings(targetConsole);
        setBindings(resolved);
        controller.setBindings(resolved);

        /*
         * 核心包那段进度按 1% 节流（几百个 chunk 全 setState 会把整页重渲染几百次）；
         * 下完退回「不确定」—— 后面还有核心启动那一段，否则进度条会卡在 100% 不动。
         */
        /*
         * 冷启动时等预热落定（最多 20 秒）：不等的话 `Nostalgist.launch` 会对着
         * 同一个 URL 再发一条，浏览器并不保证合并 —— 最坏白下两份核心。
         * 正常情况下预热从「点开始」就跑，走到这里早就完成了。
         */
        if (coreWarm) await settlePreload(coreWarm);

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
          bios,
          /* 上面已经拆过一次的包（含光盘套装的伴生 bin），别让 loadRom 再拆一遍 */
          prepared,
          /*
           * 机种也从上面那条游戏记录带下去（2026-10-21）：`/play` 只开库里已有的游戏，
           * 这一页**没有**「随便拖一个文件进来」的入口，所以库里的 `console` 就是权威。
           * 有了它 `loadRom` 不必再嗅文件头 —— 那一步在 7z 那条路上意味着「把整盘
           * 再包成一个 File」，正好抵掉字节通道省下的内存（见 `loadRom` 的注释）。
           */
          game?.consoleType ?? null
        );

        // 核心启动不可中断；离开时尚未完成的启动，在完成后立即退出。
        if (ac.signal.aborted || !activeRef.current) {
          await controller.exit();
          return;
        }
        setRom(controller.rom);
        setPaused(false);
        setPhase('ready');

        /*
         * 云端历史（登录了才写得进；没登录会回 401，静默忽略）。
         *
         * ⚠️ **2026-10-19 补上**：这一页原本刻意不写历史，
         *    可详情页那颗「开始游戏」早就指向 `/play?id=` 了 —— 于是从它进来的每一局
         *    都不进历史。现象就是个人中心的历史停在某一天不再动，而**云端存档照常在写**
         *    （存档控件这一页有），很容易误判成「历史数据丢了」。
         *    历史讲的是「我最近玩过什么」，和从哪扇门进来无关，所以补齐。
         *
         * 只写**在线库里的那款**：`game.id` 来自 `/api/games`，天然成立；本机拖进来的
         * 文件没有 id（那种走 `load(file)`，`game` 也可能是 null），不进历史。
         *
         * ⚠️ 只在 `!file` 这条路上写 —— `file` 有值说明是**重载 / 恢复存档**（同一款、
         *    时间戳刚写过），那两条不该再刷一次「最近游玩时间」。
         *
         * 不等结果、不管成败：游戏已经跑起来了，历史写不上只是少一行记录。
         */
        if (!file && game?.id) {
          void fetch('/api/user/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: game.id }),
          }).catch((error: unknown) => {
            console.warn('[play] 写云端历史失败（不影响本局）：', error);
          });
        }
      } catch (error) {
        if (!activeRef.current) return;
        // 用户自己掐的：不是故障，回到「设置好了，点开始」那一屏
        if (isAbortError(error))
          console.info('[play] 已取消载入：', title);
        else {
          console.error('[play] 载入失败：', title, error);
          /*
           * 机种认不出时单独认一次压缩格式。这一类是「有准话可给」的失败：
           * 7z / rar 用不着用户瞎猜。
           *
           * 走到这里 `romFile` 必然有值（`UnsupportedRomError` 只在 `detectConsole`
           * 返回 null 时抛，而那一步在下载之后），那个判断只是别让类型收窄难看。
           */
          if (error instanceof UnsupportedRomError && romFile) {
            setArchive(await unsupportedArchive(romFile));
          }
          /*
           * 「文件不完整」单独给一句准话：下载短读（`IncompleteBodyError`）和
           * `.chd` 结构自检失败（`IncompleteRomError`）都是**重下一遍就能好**的那类，
           * 混进泛泛的「载入失败」会让人以为换一盘游戏才行。
           */
          setNotice(
            error instanceof IncompleteBodyError || error instanceof IncompleteRomError
              ? 'play.romIncomplete'
              : 'play.loadFail'
          );
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
    /*
     * `title` 只在两处日志里用（`game?.title` 那种写法随 `LibraryGame` 侧表化一起没了）。
     * 它是派生的字符串，跟着 `game` / `locale` 走 —— 列在这里是为了让 lint 的
     * `exhaustive-deps` 过，不会因为一次渲染而改变 `load` 的身份。
     */
    [controller, game, title, romLang]
  );

  /** 取消正在飞的那一笔 ROM 下载。没有下载在飞时是空操作。 */
  const cancelLoad = useCallback(() => {
    setLoadCancelled(true);
    abortRef.current?.abort();
  }, []);

  /**
   * 即时存档恢复当前模拟器状态；旧电池存档仍通过重启核心读取。
   */
  const applySave = useCallback(
    async (bytes: Uint8Array) => {
      const save = await unpackSave(bytes);
      if (save.kind === 'state') {
        await controller.loadState(save.bytes);
        return;
      }
      const file = lastRomRef.current;
      if (!file) throw new Error('No loaded ROM');
      controller.stageBatterySave(save.bytes);
      await load(file);
    },
    [controller, load]
  );

  /* ---------------- 联机 ---------------- */

  /**
   * 右侧那颗主钮按下之后要做的事（按当前选的项目分三条路）。
   *
   * 三个动作都不往外抛：失败原因由 netplay 写进 `state.error`，界面自己读 ——
   * 三个回调同一个规矩，`busy` 一律放 finally（漏一条按钮就永久变灰）。
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

  /*
   * 进页面就自己开跑。判据收敛到 `directSolo`（它把「正常入口」和「单人机」两种情况
   * 一起管了，见那边的注释）—— 原来这里写的是 `autoStart && initialMode === 'solo'`，
   * 和 `directSolo` 是同一句话，分开写只会让两处漂。
   */
  useEffect(() => {
    if (!directSolo || mode !== 'solo' || !game || autoStartedRef.current) return;
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
  }, [directSolo, mode, game, start]);

  /*
   * `?room=XXXX` 进来就自动加入。
   *
   * `mode` 已经是派生过的（单人机被按成 `'solo'`），所以 NDS 手打 `?room=` 时这里
   * 整条不会跑 —— 不需要再单独判一次 `soloOnly`。
   */
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
   * 主题保存后在语言切换、刷新和返回时恢复。
   * 这份 state 只喂按钮的 title / aria，昼夜切换只做颜色过渡。
   */
  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    const next = readTheme() === 'dark' ? 'light' : 'dark';
    const commit = () => {
      saveTheme(next);
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
   * 和电视机那套 `--tv-ratio` 是两套 CSS，但**档位是同一个偏好**：
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
            // 用 localePath 而不是三元表达式：2026-10-16 之前这里写的是
            // `locale === 'zh' ? '/zh/games' : '/games'`，加日韩时那种写法
            // 会把日韩用户直接扔回英文页（而且不报错，只是送错语言）。
            else window.location.assign(localePath(locale, '/games'));
          }}
        />
      )}
      {/*
        这一行的根**不是 `<main>`**：`.wall` 背景、右上一排入口、返回、页脚全在
        `GamesShell` 里（见 `app/[locale]/play/page.tsx`），`<main>` 由外层出。
        工作区按游戏区域的实际高度布局，不拉伸填满外壳的剩余空间。
      */}
      <div
        ref={workspaceRef}
        className="play-workspace w-full"
        data-screen-size={screenSize}
        data-sidebar={sidebarOpen ? 'open' : 'closed'}
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

          左栏由游戏区域撑开，不使用 flex-1 分配剩余空间。
          屏幕尺寸由 updateSize() 和 .play-display 的样式共同控制。
        */}
        <section
          ref={stageRef}
          className="play-stage flex min-w-0 items-center justify-center"
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
                    /* 这一页没有机身：暂停那句副标题指向右栏的「继续」（见 ConsoleScreen 的 prop 注释） */
                    resumeHint="panel"
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
                                {consoleLabel(game.consoleType, locale)}
                              </span>
                            )}
                          </div>
                        )}
                      {notice && (
                        <span className="text-[12px] text-danger">
                          {t(notice)}
                        </span>
                      )}
                      {/*
                        格式那条（7z / rar / 多文件光盘镜像）跟在报错下面：它不是「出事了」而是
                        「换个包就行」—— 所以用 `crt-ink-300` 而不是 `danger`，
                        口径统一：这一条不是「出事了」，只是「换个包就行」。
                        `disc` 那条不带参数（它说的不是「哪种格式」而是「要单文件」）。
                      */}
                      {archive && (
                        <span className="text-[12px] text-crt-ink-300">
                          {archive === 'disc'
                            ? t('play.needDisc')
                            : t('play.needZip', { ext: archive })}
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
                          subtitle={game ? consoleLabel(game.consoleType, locale) : null}
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
                              subtitle={game ? consoleLabel(game.consoleType, locale) : null}
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
          右栏：最上面是按键设置，中间是联机房间卡（进了房才出现），
          最底下一张平铺的「说明 + 控件」操作表。

          ⚠️ 2026-10-19：这一款的**资料块**（封面 + 名字 + 机种 / 年份 / 开发商）已经
          **不在这一列了** —— 用户要求挪到顶栏「返回」右边、尺寸压小一号
          （`StaticPlay.tsx` 的 `PlayGameInfo`，走 `GamesShell` 的 `navExtra`）。
          数据那一层也在那边取（`StaticPlay` 的 `useState`），这一列现在不用 `game.imageUrl`。
          操作表仍是站上那套描边（`pixel-edge pxw-* pxc-*`）——「干净」指的是
          **只放该有的东西**（说明 + 控件，没有分组卡片、没有键帽、没有多余标题），
          不是把站上的视觉语言砍掉。
        */}
        <aside className="play-sidebar" data-collapsed={sidebarOpen ? undefined : 'true'}>
          {/*
            收起 / 展开的**窄轨那一颗**（2026-10-19）。

            为什么有两颗同样的钮：展开时那颗按用户要求摆在「编辑」右边（见下面按键设置
            标题行），可收起之后三块面板全被 `display: none` 藏起来，那颗也跟着没了 ——
            这一颗是 `.play-sidebar` 的直接孩子，藏在面板外面，专门负责「把面板叫回来」。
            两边靠 CSS 分工：窄轨这颗只在**收起时**（以及窄屏 / 触屏上）显示，另一颗反之。
            ⚠️ 收起时靠 `[data-collapsed='true'] > :not(.play-sidebar-toggle)` 隐藏面板，
               所以两颗钮都必须留着 `.play-sidebar-toggle` 这个类名。
          */}
          <button
            type="button"
            className="play-sidebar-toggle pixel-edge pxw-1 pxc-500 bg-ink-800"
            aria-expanded={sidebarOpen}
            title={t(sidebarOpen ? 'play.hideSidebar' : 'play.showSidebar')}
            onClick={() => setSidebarOpen((open) => !open)}
          >
            <span aria-hidden="true">{sidebarOpen ? '»' : '«'}</span>
            <span>{t(sidebarOpen ? 'play.hideSidebar' : 'play.showSidebar')}</span>
          </button>

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
              {/*
                ⚠️ **NDS 不画这颗「编辑」**（2026-10-15 用户要求「nds 游戏按钮编辑隐藏」）。
                它开的是自定义按键面板；NDS 的键位是固定那套（掌机键位没有可换的余地，
                面板里那 14 个钮也只是给人看的），给一颗点不出结果入口不如不给。

                **只藏入口，不藏这张表** —— 下面那份键位列表照旧列出来（用户明确要
                「按键说明要显示」），NDS 那套丝印和键值由 `buttonsFor` / `buttonLabel`
                按机种给。

                `KeyBindingsPanel` 里那套 `soloOnly` 逻辑**留着没删**：入口藏起来之后
                它在 NDS 下确实走不到了，但删掉的话，哪天要放回入口就得连逻辑一起重写。
              */}
              {!soloOnly && (
                <button
                  type="button"
                  onClick={() => setKeybindOpen(true)}
                  title={t('keybind.open')}
                  aria-label={t('keybind.open')}
                  className="play-edit pixel-edge pxw-1 pxc-500 bg-ink-800 px-2 py-1 text-[11px] text-ink-200 transition-colors hover:text-accent"
                >
                  {t('play.edit')}
                </button>
              )}
            </div>
            {/*
              P1 / P2 切换**只在单机**时才画（`keysLocked` 为假）。

              联机和单人机两种情况都不画，且锁的是同一组（1P），理由见 `keysLocked`：
              联机时两人各用自己的 1P，切到 2P 显示的是**对面输入落地的位置**、不是本机
              能配的东西；NDS 则根本不支持双人。

              ⚠️ 不画的同时**下面那张表也跟着锁到 1P** —— 两处是同一个判据，别只改一处。
            */}
            {!keysLocked && (
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
            )}
            {/*
              钮名和「有哪几个钮」都按机种来（`buttonsFor` / `buttonLabel` 的
              `consoleType`）—— NDS 列的是 A / B / X / Y + L / R + L2 / R2 +
              START / SELECT，不是街机那套 A B C X Y Z / 投币。
            */}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              {buttonsFor(consoleType).map((button) => (
                <div
                  key={button}
                  className="flex min-w-0 items-center justify-between gap-1 border-b border-ink-800 pb-2"
                >
                  <dt className="shrink-0 text-[12px] text-ink-300">
                    {/* PS1 那四颗符号走图形（根因见 components/PadGlyph.tsx） */}
                    <PadGlyph name={buttonLabel(button, t, consoleType)} />
                  </dt>
                  <dd className="min-w-0 text-right">
                    <kbd className="inline-block max-w-full break-words border border-ink-600 bg-ink-850 px-1.5 py-0.5 font-mono text-[11px] text-ink-100">
                      {codeLabel(bindings[keysLocked ? 'p1' : keysPlayer][button])}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>

            {/*
              收起 / 展开：**卡在两块面板的分隔线上、贴着右沿**（2026-10-19 用户指定这个位置）。
              它用绝对定位挂在按键设置这一块上（`bottom: 0` + `translateY(50%)`）——
              于是正好骑在「按键设置 / 游戏控制」中间那道 12px 的缝上，**不占布局高度**，
              两块面板的间距一点没变。

              ⚠️ 它藏在面板**里面**，收起时会跟着面板一起消失 —— 右沿窄轨上那颗
              （`aside` 的直接孩子）就是接班的那颗，窄屏 / 触屏也用它。
            */}
            <button
              type="button"
              className="play-sidebar-toggle play-sidebar-seam pixel-edge pxw-1 pxc-500 bg-ink-800"
              aria-expanded={sidebarOpen}
              aria-label={t('play.hideSidebar')}
              title={t('play.hideSidebar')}
              onClick={() => setSidebarOpen(false)}
            >
              <span aria-hidden="true">»</span>
            </button>
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

              {/* 音量：− / 档位格 / +。点档位格直接跳档 */}
              <PlaySaveControls
                controller={controller}
                rom={rom}
                gameId={game?.id}
                disabled={busy || saveBusy}
                onBusy={setSaveBusy}
                onOpen={setSavesOpen}
                onApplySave={applySave}
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

        `consoleType` 决定面板画哪几个钮、钮叫什么、以及是不是单人机（NDS 收成一个页签）。

        `online` 让面板在**还没连上**时就锁 1P 页签（`mode !== 'solo'`）—— `role` 要连上
        才有值，而右侧那张表从进页面起就已经是 1P 了，面板不该慢半拍还亮两个页签。
      */}
      <KeyBindingsPanel
        open={keybindOpen}
        bindings={bindings}
        consoleType={consoleType}
        role={netplayState.role}
        online={mode !== 'solo'}
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
 * 下面这些是这一页自己的小组件与常量
 * ================================================================== */

/** 重试音频轨的最长尝试次数（每次 500ms） */
const AUDIO_RETRY_LIMIT = 10;

/**
 * 屏幕档位的落盘键。**等于首屏内联脚本里读的那个键** —— 全站共用一份偏好，
 * 所以刻意不另起 `nesload:play-size`。
 */
const TV_KEY = 'nesload:tv';

/**
 * 这一页的默认档：**中**（2026-10-15 用户指定「初次默认是中」）。
 *
 * 刻意不复用 `lib/tv-size.ts` 的 `DEFAULT_TV_SIZE`（那边是 `small`）：
 * 这里 `medium` 映射的是 `--play-size-scale: .88`，电视机那套同一档是 `--tv-ratio: .9`，
 * 各自是「自己那套排版里合适的大小」，两者的默认没有理由绑在一起。
 *
 * ⚠️ 这只在**从没选过**时生效。用户一旦点过任意一档，`nesload:tv` 就有值了 ——
 * 在别处点的那一次也属共用偏好（见上面 `TV_KEY`），这里会照样跟着走。
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
              <span className="text-[10px] text-crt-ink-200">{subtitle}</span>
            )}
            <span className="text-[10px] text-crt-ink-200">{phaseLabel}</span>
          </div>
        </div>
      )}
      {!(image || title) && (
        <span className="text-[11px] text-crt-ink-200">{phaseLabel}</span>
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
 * ⚠️ 别和 `.panel-key` 那套键帽混：那一套有立体描边和按下下沉，
 * 这一页要的就是干净的一格。`danger` 那颗（弹出）默认带一档红 —— 危险动作
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
