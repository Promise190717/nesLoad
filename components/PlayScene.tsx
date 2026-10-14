'use client';

import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { getAudioTrack } from '@/lib/audio-tap';
import { ensureBios } from '@/lib/bios';
import { EmulatorController, VOLUME_MAX, type LoadedRom } from '@/lib/emulator';
import { readGamepads } from '@/lib/gamepad';
import { isAbortError, readBodyWithProgress } from '@/lib/http';
import type { MessageKey } from '@/lib/i18n';
import {
  codeToButton,
  DEFAULT_BINDINGS,
  loadBindings,
  saveBindings,
  type ButtonName,
  type KeyBindings,
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
  type StreamQuality,
} from '@/lib/netplay';
import { CONSOLE_LABEL } from './CartridgeSprite';
import ConsoleScreen from './ConsoleScreen';
import { localizeLibraryGame, type LibraryGame } from './GameLibraryPanel';
import { useI18n } from './I18nProvider';
import KeyBindingsPanel from './KeyBindingsPanel';
import { ExpandIcon, MoonIcon, SunIcon } from './icons';

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
}

export default function PlayScene({ serverGame }: PlaySceneProps) {
  const { t, locale } = useI18n();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  /** 防重入：载入中再点一次「开始」不该把正在跑的那次搅了（和 room 里同一个理由） */
  const loadingRef = useRef(false);

  // 惰性初始化持有实例：只建一次，也避免在渲染期读写 ref（react-hooks/refs）
  const [controller] = useState(() => new EmulatorController());

  const [game, setGame] = useState<LibraryGame | null>(serverGame ?? null);
  const [rom, setRom] = useState<LoadedRom | null>(null);
  const [paused, setPaused] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
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
  const [bindings, setBindings] = useState<KeyBindings>(DEFAULT_BINDINGS);
  const [keybindOpen, setKeybindOpen] = useState(false);

  const [mode, setMode] = useState<PlayMode>('solo');
  const [joinCode, setJoinCode] = useState('');
  const [netplayMode, setNetplayMode] = useState<NetplayMode>('lan');
  const [streamQuality, setStreamQuality] = useState<StreamQuality>(DEFAULT_STREAM_QUALITY);
  const [netplayState, setNetplayState] = useState<NetplayState>(IDLE_NETPLAY_STATE);
  const [netplayBusy, setNetplayBusy] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  /**
   * 联机控制器。回调里要读 `controller`（房主把对方的输入打进本机），
   * 而 controller 在上面就建好了 —— 闭包捕获的是那个稳定引用，所以不需要 ref。
   *
   * 和 room 相比这里**不认「刚连上 / 对方离开」那两枚会自动消失的提示**：
   * 这一页的状态行是常驻在右侧的（房间码下面那行），不需要另开一条会过期的通道。
   */
  const [netplay] = useState(
    () =>
      new NetplayController({
        onState: setNetplayState,
        onRemoteButton: (button, down, role) => {
          // 只有房主本机跑着模拟器；加入者那份注入无处可去，所以这里是单向的
          if (role !== 'host') return;
          // 对方那台机器上的 1P，在这台机器上是 2P（`remotePlayer('host')` 就是这个 2）
          controller.pressButton(button, 2, down);
        },
        onRemoteStream: (stream) => setRemoteStream(stream),
      })
  );

  const hasPicture = Boolean(rom) || Boolean(remoteStream);
  const inRoom = netplayState.status !== 'idle';
  const busy = phase === 'downloading' || phase === 'booting';
  /**
   * 这一款的文案（标题 / 开发商按当前语言取一份，见 `localizeLibraryGame`）。
   * `gameText` 可能为 null（地址上没有 `?id=`，或者查无此款），下面一路都得判空。
   */
  const gameText = game ? localizeLibraryGame(game, locale) : null;
  const title = gameText?.title ?? '';

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
    const storedTheme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
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
     * 分享链接里的 `?room=XXXX` —— 别人把房间码分享过来时，直接把「加入」这一档
     * 选好、码填上，用户点一下「加入房间」就进屋。
     *
     * ⚠️ **刻意不自动连**：这一页的入口是「游戏详情 → 联机游戏」，进来的人多半是想
     * 自己开一局；地址上那个码有可能是上一次留下的。等他点一下再连，比默默连进
     * 某个房间安全得多。
     */
    const code = new URL(window.location.href).searchParams.get(ROOM_QUERY_PARAM);
    if (code) {
      void Promise.resolve().then(() => {
        setMode('join');
        setJoinCode(code.toUpperCase());
      });
    }
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
        const res = await fetch(`/api/games/${encodeURIComponent(id)}`, { signal: ac.signal });
        const found = res.ok ? ((await res.json()) as { game?: LibraryGame }).game : undefined;
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
      if (!game && !file) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      // 载入中再点一次：直接忽略，别把正在跑的那次搅了
      if (loadingRef.current) return;

      loadingRef.current = true;
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
          const res = await fetch(`/api/games/${game!.id}/rom`, { signal: ac.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await readBodyWithProgress(res, setRomRatio);
          romFile = new File([blob], game!.romName, { type: 'application/octet-stream' });
        }

        setPhase('booting');
        lastRomRef.current = romFile;

        /*
         * 街机要带上 BIOS（Neo Geo 的 neogeo.zip）—— `ensureBios()` 会先把站点自带那份
         * 备上（`public/bios/`），用户拖进来的那份能覆盖它。非街机一律 null，
         * `loadRom` 也只认街机那条分支。
         */
        const consoleType = game?.consoleType ?? null;
        const bios = consoleType === 'arcade' ? await ensureBios() : null;

        /*
         * 核心包那段进度按 1% 节流（几百个 chunk 全 setState 会把整页重渲染几百次）；
         * 下完退回「不确定」—— 后面还有核心启动那一段，否则进度条会卡在 100% 不动。
         */
        let lastPct = -1;
        await controller.loadRom(
          romFile,
          canvas,
          (loaded, total) => {
            if (total <= 0) return;
            const pct = Math.floor((loaded / total) * 100);
            if (pct === lastPct) return;
            lastPct = pct;
            setCoreRatio(pct >= 100 ? null : loaded / total);
          },
          bios
        );

        setRom(controller.rom);
        setPaused(false);
        setPhase('ready');
      } catch (error) {
        // 用户自己掐的：不是故障，回到「设置好了，点开始」那一屏
        if (isAbortError(error)) console.info('[play] 已取消载入：', game?.title);
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
        setRomRatio(null);
        setCoreRatio(null);
      }
    },
    [controller, game]
  );

  /** 取消正在飞的那一笔 ROM 下载。没有下载在飞时是空操作。 */
  const cancelLoad = useCallback(() => {
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
    if (mode === 'join') {
      if (!joinCode.trim()) return;
      setNetplayBusy(true);
      try {
        await netplay.join(joinCode.trim().toUpperCase(), netplayMode);
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

  const leaveRoom = useCallback(async () => {
    setNetplayBusy(true);
    try {
      await netplay.leave();
    } catch (error) {
      console.warn('[play] 离开房间失败', error);
    } finally {
      setNetplayBusy(false);
    }
  }, [netplay]);

  /**
   * 房主：插上卡带就把画面推给对方。
   *
   * 依赖里带 `role` 是为了覆盖「先开房、后加载」这个顺序（这一页就是这顺序：
   * `start()` 先 `host()` 再 `load()`）—— 两条都落定之后 effect 会跑，把流建起来。
   * 带 `streamQuality` 是为了换档（帧率是建流参数，事后改不了，所以换档＝重建整条流）。
   */
  useEffect(() => {
    if (netplayState.role !== 'host' || !rom) return;

    const stream = createCaptureStream(canvasRef.current, captureFpsFor(streamQuality));
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
    if (netplayState.role !== 'guest' || keybindOpen) return;

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
  }, [netplayState.role, netplay, bindings, keybindOpen]);

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

  const eject = useCallback(async () => {
    await controller.exit();
    setRom(null);
    setPaused(false);
    setPhase('idle');
    lastRomRef.current = null;
  }, [controller]);

  const changeVolume = useCallback(
    (level: number) => setVolume(controller.setVolume(level)),
    [controller]
  );

  /* ---------------- 主题 / 全屏 ---------------- */

  /**
   * 主题切换。**真身是 `<html data-theme>`**（CSS 按它翻整页的色板），
   * 这份 state 只喂按钮的 title / aria —— 和 room 那边同一套路，
   * 只是这里不做那一层 View Transitions 的「天光」动画（这一页没有屋子）。
   */
  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem('nesload:theme', next);
    } catch {
      // 隐私模式下写不进去，忽略即可（下次打开退回跟随系统）
    }
  }, [theme]);

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
      {/*
        这一行的根**不是 `<main>`**：`.wall` 背景、右上一排入口、返回、页脚全在
        `GamesShell` 里（见 `app/[locale]/play/page.tsx`），`<main>` 由外层出。
        这里 `flex-1` + `lg:items-stretch` 是为了「吃掉外壳剩下来的纵向空间」——
        `GamesShell` 传了 `fill`，页脚因此被压到视口最底部（2026-10-14 用户要求）。
      */}
      <div className="flex w-full flex-1 flex-col gap-8 lg:flex-row lg:items-stretch">
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
        <section className="flex min-w-0 flex-1 items-center justify-center">
          <div className="w-full max-w-[min(100%,calc((100vh_-_320px)*4/3))]">
            {/*
              屏幕外框就是站上那套像素描边（`pixel-edge pxw-3 pxc-600 bg-ink-800 p-3`）——
              和别处的「一块屏幕」同一个观感，**别改成 1px 细边**（我第一版那么写过，被退了）。
            */}
            <div className="pixel-edge pxw-3 pxc-600 bg-ink-800 p-3">
            <div className="relative">
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
                frameClassName="aspect-[4/3] w-full"
                onExitFullscreen={exitFullscreen}
              />

              {/*
                叠层：没画面时盖住整块屏幕。三种状态按优先级分开说 ——
                载入中（进度 + 取消）→ 联机中（房间码 / 状态 / 离开）→ 房间选择。
                有画面（本机的或房主推来的）就整块撤掉。

                配色一律 `crt-*`：屏幕底永远是黑的，而 `ink-*` 会跟着主题翻转，
                浅色主题下就成了黑底黑字。`overflow-y-auto` 是兜底 —— 屏幕窄/矮到
                装不下那几行时能滚，而不是把内容顶出去。
              */}
              {!hasPicture && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-black/90 px-8 py-8 text-center">
                  {/* 先报「这是哪一款 / 出了什么事」 */}
                  <div className="flex flex-col items-center gap-1">
                    {headline && <span className="text-[13px] text-crt-ink-200">{headline}</span>}
                    {game && (
                      <span className="text-[12px] text-crt-ink-500">
                        {CONSOLE_LABEL[game.consoleType]}
                      </span>
                    )}
                    {game && notice && <span className="text-[12px] text-danger">{t(notice)}</span>}
                  </div>

                  {busy ? (
                    /* ① 载入中：阶段 + 进度 + 取消 */
                    <>
                      <span className="text-[12px] text-crt-ink-300">
                        {t(phase === 'downloading' ? 'play.downloading' : 'play.booting')}
                      </span>
                      <LoadBar ratio={phase === 'downloading' ? romRatio : coreRatio} />
                      {/*
                        取消：**只在 ROM 下载那一段可用**。核心已经在唱戏之后
                        Nostalgist 没有中断接口（见 load() 的注释），按了也没用 ——
                        与其画一颗假的，不如让它灰着。
                      */}
                      <button
                        type="button"
                        onClick={cancelLoad}
                        disabled={phase !== 'downloading'}
                        className="pixel-edge pxw-2 pxc-500 bg-crt-950/85 px-4 py-1.5 text-[12px] text-crt-ink-200 transition-colors enabled:hover:text-crt-accent disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        {t('play.cancel')}
                      </button>
                    </>
                  ) : inRoom ? (
                    /* ② 联机中：房间码 + 分享 + 状态 + 离开 */
                    <div className="flex w-full max-w-[320px] flex-col items-center gap-4">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[12px] text-crt-ink-400">{t('netplay.roomCode')}</span>
                        <span className="font-pixel text-[24px] leading-none tracking-[0.3em] text-crt-accent">
                          {netplayState.code}
                        </span>
                        <div className="mt-2 flex items-center gap-2">
                          <CopyBtn
                            text={netplayState.code ?? ''}
                            label={t('netplay.copy')}
                            done={t('netplay.copied')}
                          />
                          <CopyBtn
                            text={shareLink(netplayState.code ?? '')}
                            label={t('netplay.share')}
                            done={t('netplay.shareCopied')}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-2 text-[12px]">
                        <span
                          className={`h-[6px] w-[6px] shrink-0 ${
                            netplayState.status === 'connected' ? 'bg-crt-ok' : 'bg-crt-accent'
                          }`}
                        />
                        <span className="min-w-0 truncate text-crt-ink-200">
                          {netplayState.status === 'connected'
                            ? t('netplay.connected')
                            : netplayState.role === 'guest'
                              ? t('netplay.joining')
                              : t('netplay.waiting')}
                        </span>
                        {netplayState.status === 'connected' && netplayState.rtt !== null && (
                          <span className="text-crt-ink-500">{Math.round(netplayState.rtt)}ms</span>
                        )}
                      </div>

                      <p className="text-[12px] leading-relaxed text-crt-ink-400">
                        {netplayState.role === 'host'
                          ? t('netplay.youAreHost')
                          : t('netplay.youAreGuest')}
                      </p>

                      {/* 加入者连上了、房主还没开跑 —— 说清楚是在等，不是坏了 */}
                      {netplayState.role === 'guest' &&
                        netplayState.status === 'connected' &&
                        !remoteStream && (
                          <span className="text-[12px] text-crt-ink-300">
                            {t('netplay.waitingGame')}
                          </span>
                        )}

                      {/*
                        房主、房间开好了、卡带还没插上 —— 给他一颗按钮。

                        为什么非要这一颗：上面那颗「开始」是**建房 + 载入**一次做完的，
                        点下去之后屏幕就换成房间信息了；万一**建房成了、载入失败**
                        （网络抖、ROM 404），页面就停在一间没人玩的空房里，再没有第二个入口
                        —— 那是条死路。加入者不需要它：他的画面由房主推过来。
                      */}
                      {netplayState.role === 'host' && !rom && (
                        <button
                          type="button"
                          disabled={busy || !game}
                          onClick={() => void load()}
                          className="pixel-edge pxw-3 pxc-600 w-[220px] bg-crt-accent py-2 text-[12px] text-ink-950 transition-colors enabled:hover:bg-crt-accent/80 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          {busy ? t('play.downloading') : t('play.start')}
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={netplayBusy}
                        onClick={() => void leaveRoom()}
                        className="pixel-edge pxw-2 pxc-500 bg-crt-950/85 px-4 py-1.5 text-[12px] text-crt-ink-300 transition-colors enabled:hover:text-danger disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        {t('netplay.leave')}
                      </button>
                    </div>
                  ) : (
                    /* ③ 房间选择。**这一页开局要做的选择全在这儿**（右侧只剩操作表） */
                    <div className="flex flex-col items-center gap-4">
                      {/* 三个项目：单人 / 开房 / 加入。选中的那颗实心 accent */}
                      <div className="flex gap-2">
                        {PLAY_MODES.map((value) => (
                          <OvBtn
                            key={value}
                            active={mode === value}
                            disabled={busy}
                            onClick={() => setMode(value)}
                          >
                            {t(PLAY_MODE_MESSAGE[value])}
                          </OvBtn>
                        ))}
                      </div>

                      {/* 加入才要码 */}
                      {mode === 'join' && (
                        <input
                          value={joinCode}
                          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                          maxLength={4}
                          placeholder={t('netplay.codePlaceholder')}
                          aria-label={t('netplay.codePlaceholder')}
                          className="pixel-edge pxw-2 pxc-500 w-[148px] bg-crt-950/85 px-3 py-2 text-center font-pixel text-[14px] text-crt-ink-100 uppercase tracking-[0.25em] placeholder:text-crt-ink-500 focus:outline-none"
                        />
                      )}

                      {/* 联机才要这两项：单人模式它们一个都不生效 */}
                      {mode !== 'solo' && (
                        <>
                          <div className="flex gap-2">
                            {(['lan', 'wan'] as const).map((value) => (
                              <OvBtn
                                key={value}
                                active={netplayMode === value}
                                disabled={busy}
                                onClick={() => setNetplayMode(value)}
                              >
                                {t(value === 'lan' ? 'netplay.modeLan' : 'netplay.modeWan')}
                              </OvBtn>
                            ))}
                          </div>

                          <div className="flex flex-col items-center gap-2">
                            <span className="text-[12px] text-crt-ink-400">{t('netplay.quality')}</span>
                            <div className="flex gap-2">
                              {QUALITY_ORDER.map((value) => (
                                <OvBtn
                                  key={value}
                                  active={streamQuality === value}
                                  disabled={busy}
                                  onClick={() => setStreamQuality(value)}
                                >
                                  {t(QUALITY_MESSAGE[value])}
                                </OvBtn>
                              ))}
                            </div>
                          </div>
                        </>
                      )}

                      <button
                        type="button"
                        disabled={busy || netplayBusy || !game || (mode === 'join' && !joinCode.trim())}
                        onClick={() => void start()}
                        className="pixel-edge pxw-3 pxc-600 w-[220px] bg-crt-accent py-2 text-[12px] text-ink-950 transition-colors enabled:hover:bg-crt-accent/80 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        {/*
                          按钮说的是**这一下要干的动作**，不是选项的名字：
                          「开始」是下 ROM 开跑（单人 / 房主都算），「加入」是连过去。
                        */}
                        {busy
                          ? t('play.downloading')
                          : mode === 'join'
                            ? t('netplay.join')
                            : t('play.start')}
                      </button>

                      {/* 报错只在这一处：房主那把 `error` 写进 state 的理由，见 start() 的注释 */}
                      {netplayState.error && (
                        <p className="text-[12px] text-danger">
                          {t(NETPLAY_ERROR_MESSAGE[netplayState.error])}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
          </div>

        </section>

        {/*
          右栏：最上面是这一款的**资料块**（封面 + 名字 + 机种 / 年份 / 开发商），
          下面一张平铺的「说明 + 控件」操作表，最底下一颗「编辑」开按键设置。

          ⚠️ 资料块**照抄 `/consoles/<机种>` 那一页**（`pixel-edge` 描边块 + `object-cover`
          的 3:4 封面）：用户点名要这一页的观感向那一页看齐。操作表也一样是站上那套描边
          （`pixel-edge pxw-* pxc-*`）——「干净」指的是**只放该有的东西**（说明 + 控件，
          没有分组卡片、没有键帽、没有多余标题），不是把站上的视觉语言砍掉。
        */}
        <aside className="flex w-full shrink-0 flex-col gap-6 lg:w-[264px]">
          {game && (
            <div className="flex gap-3">
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
                  <p className="mt-0.5 truncate text-[12px] text-ink-500">{gameText.developer}</p>
                )}
              </div>
            </div>
          )}

          <ul className="divide-y divide-ink-800 border-y border-ink-800">
            <Row label={t(paused ? 'panel.resume' : 'panel.pause')}>
              <RowBtn
                label={t(paused ? 'panel.resume' : 'panel.pause')}
                onClick={() => void togglePause()}
                disabled={!rom}
              >
                {paused ? '▶' : '❚❚'}
              </RowBtn>
            </Row>

            <Row label={t('panel.reset')}>
              <RowBtn label={t('panel.reset')} onClick={() => void reload()} disabled={!rom || busy}>
                ↻
              </RowBtn>
            </Row>

            {/* 弹出是危险动作：默认就带一档红，不靠 hover 才看得出来 */}
            <Row label={t('panel.eject')}>
              <RowBtn label={t('panel.eject')} danger onClick={() => void eject()} disabled={!rom}>
                ⏏
              </RowBtn>
            </Row>

            {/* 音量：− / 档位格 / +。点档位格直接跳档（和 `/room` 面板上那套同语义） */}
            <Row label={t('play.volume')}>
              <span className="flex items-center gap-1.5">
                <RowBtn
                  label={t('volume.down')}
                  onClick={() => changeVolume(volume - 1)}
                  disabled={volume <= 0}
                >
                  −
                </RowBtn>
                <span className="flex items-center gap-[3px]">
                  {Array.from({ length: VOLUME_MAX }, (_, i) => i + 1).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => changeVolume(level)}
                      title={t('volume.set', { level, max: VOLUME_MAX })}
                      aria-label={t('volume.set', { level, max: VOLUME_MAX })}
                      className={`h-[12px] w-[5px] transition-colors ${
                        level <= volume ? 'bg-accent' : 'bg-ink-700'
                      }`}
                    />
                  ))}
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

            {/* 显示（夜 / 昼）。说明写的是「点了会变成什么」，和上面几行同一口径 */}
            <Row label={t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')}>
              <RowBtn
                label={t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')}
                onClick={toggleTheme}
              >
                {theme === 'dark' ? <SunIcon size={15} /> : <MoonIcon size={15} />}
              </RowBtn>
            </Row>

            <Row label={t('play.fullscreen')}>
              <RowBtn label={t('play.fullscreen')} onClick={() => void requestFullscreen()}>
                <ExpandIcon size={15} />
              </RowBtn>
            </Row>
          </ul>

          {/*
            「编辑」。可见文字就这俩字（用户要的），具体编辑什么交给 tooltip ——
            它开的是按键设置面板，那份键位配置和 `/room` 共用同一套 localStorage。
          */}
          <button
            type="button"
            onClick={() => setKeybindOpen(true)}
            title={t('keybind.open')}
            aria-label={t('keybind.open')}
            className="pixel-edge pxw-2 pxc-500 bg-ink-800 py-2 text-[12px] text-ink-200 transition-colors hover:text-accent"
          >
            {t('play.edit')}
          </button>

          <p className="text-[12px] leading-relaxed text-ink-600">{t('play.hint')}</p>
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

/** 房间设置区三个项目的顺序（数组顺序 = 界面顺序，别改成对象遍历） */
const PLAY_MODES: PlayMode[] = ['solo', 'host', 'join'];

const PLAY_MODE_MESSAGE: Record<PlayMode, MessageKey> = {
  solo: 'play.modeSolo',
  // 「创建房间」和「加入」两个词直接借联机面板那两句：同一件事在站上只有一种说法
  host: 'netplay.create',
  join: 'netplay.join',
};

/** 画质三档的顺序：由省到费 */
const QUALITY_ORDER: StreamQuality[] = ['smooth', 'balanced', 'sharp'];

const QUALITY_MESSAGE: Record<StreamQuality, MessageKey> = {
  smooth: 'netplay.qualitySmooth',
  balanced: 'netplay.qualityBalanced',
  sharp: 'netplay.qualitySharp',
};

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
  'join-failed': 'netplay.errUnknown',
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
  url.hash = '';
  return url.toString();
}

/**
 * 房主出画用的那条流。
 *
 * 画面来自 `canvas.captureStream`（声音另走 WebAudio 旁路，见 lib/audio-tap.ts）——
 * 帧率是**建流参数**，事后改不了，所以质量档变了只能整条重建。
 */
function createCaptureStream(canvas: HTMLCanvasElement | null, fps: number): MediaStream | null {
  if (!canvas || typeof canvas.captureStream !== 'function') return null;
  return canvas.captureStream(fps);
}

/** 黑区那条进度条。`ratio` 为 null 时画一条来回滑的「不确定」进度条 */
function LoadBar({ ratio }: { ratio: number | null }) {
  const pct = ratio === null ? null : Math.round(ratio * 100);
  return (
    <div className="flex items-center justify-center gap-3">
      <div className="relative h-[10px] w-[min(300px,72%)] overflow-hidden border-2 border-crt-ink-500 bg-crt-950/90">
        {pct === null ? (
          <span className="load-slide absolute inset-y-0 left-0 w-1/3 bg-crt-accent/70" />
        ) : (
          <span className="absolute inset-y-0 left-0 bg-crt-accent" style={{ width: `${pct}%` }} />
        )}
      </div>
      {/* 百分数全是数字，font-pixel 掉不了字形；宽度写死，位数变化时不抖 */}
      <span className="w-[34px] shrink-0 font-pixel text-[12px] text-crt-ink-300">
        {pct === null ? '' : `${pct}%`}
      </span>
    </div>
  );
}

/** 复制一颗东西到剪贴板，成功后自己显示一小会儿「已复制」。 */
function CopyBtn({ text, label, done }: { text: string; label: string; done: string }) {
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
      className="pixel-edge pxw-2 pxc-500 bg-crt-950/85 px-2.5 py-1 text-[12px] text-crt-ink-200 transition-colors hover:text-crt-accent"
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
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
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
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`pixel-edge pxw-2 pxc-500 flex h-[28px] min-w-[28px] shrink-0 items-center justify-center px-1.5 text-[12px] leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
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

/**
 * 屏幕里那颗选项钮（单人 / 创建房间 / 加入、局域网 / 公网、画质三档）。
 *
 * ⚠️ 配色只能走 `crt-*`：这一层浮在全黑的屏幕上，`ink-*` 会跟着主题翻转，
 * 浅色主题下就成了黑底黑字（见文件头那条）。选中态实心 accent。
 */
function OvBtn({
  active,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`pixel-edge pxw-2 pxc-500 px-4 py-1.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        active
          ? 'bg-crt-accent text-ink-950'
          : 'bg-crt-950/85 text-crt-ink-200 enabled:hover:text-crt-accent'
      }`}
      {...props}
    >
      {children}
    </button>
  );
}
