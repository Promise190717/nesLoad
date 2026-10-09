'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { getAudioTrack } from '@/lib/audio-tap';
import { getBios, getBiosInfo, isNeoGeoBios, putBios, type BiosInfo } from '@/lib/bios';
import { EmulatorController, VOLUME_MAX, detectConsole, type ConsoleType, type LoadedRom } from '@/lib/emulator';
import type { Locale } from '@/lib/i18n';
import {
  IDLE_NETPLAY_STATE,
  NetplayController,
  remotePlayer,
  type NetplayState,
} from '@/lib/netplay';
import {
  codeToButton,
  DEFAULT_BINDINGS,
  loadBindings,
  saveBindings,
  type KeyBindings,
} from '@/lib/keybindings';
import {
  listCartridges,
  pruneCartridges,
  putCartridge,
  readCartridge,
  removeCartridge,
  type Cartridge,
} from '@/lib/library';
import { listSaves, readSave, saveSlot, MAX_SAVES, type SaveSlot } from '@/lib/saves';
import CartridgeRack, { CART_WIDTH } from './CartridgeRack';
import CartridgeSprite from './CartridgeSprite';
import { useI18n } from './I18nProvider';
import KeyBindingsPanel from './KeyBindingsPanel';
import NetplayPanel from './NetplayPanel';
import RetroTv, { TV_WIDTH } from './RetroTv';
import { ExpandIcon, KeyboardIcon, LinkIcon, MoonIcon, SunIcon } from './icons';

interface DragGhost {
  x: number;
  y: number;
  name: string;
  consoleType: ConsoleType;
}

/** 拎起卡带后，指针离卡槽这么近就算命中 */
const SLOT_HIT_PAD_X = 56;
const SLOT_HIT_PAD_Y = 64;
/** 位移小于这个值算「点击」而不是「拖拽」 */
const CLICK_SLOP = 6;
const THEME_KEY = 'nesload:theme';

/**
 * 抓流时请求的帧率。NES 是 60fps，给足就不会丢帧；
 * 浏览器会按实际编码能力降，不会硬撑。
 */
const CAPTURE_FPS = 60;
/** 等音频轨的最长尝试次数（每次 500ms，共 5 秒）—— 见下面的「声音迟到」注释 */
const AUDIO_RETRY_LIMIT = 10;

type Theme = 'dark' | 'light';

/** 分段开关的两个选项。文案刻意用短标签：中文一个字、英文两个字母，宽度才对称。 */
const LOCALE_OPTIONS: { value: Locale; label: string }[] = [
  { value: 'zh', label: '中' },
  { value: 'en', label: 'EN' },
];

/**
 * 存档时间的显示格式，如 `2026/10/08 16:21`。
 * 带上年份是为了跨年之后还能分清 —— 槽位只有 5 个，最旧的那份可能放很久。
 */
function formatTime(timestamp: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

/**
 * 抓一条「画面 + 声音」的流，给联机时的加入者看。
 *
 * 画面来自 canvas.captureStream；声音是从 WebAudio 上旁路出来的（见 lib/audio-tap.ts），
 * 核心还没建 AudioContext 时拿不到 —— 那就先推画面，声音由调用方重试补上。
 */
function createCaptureStream(canvas: HTMLCanvasElement | null): MediaStream | null {
  if (!canvas || typeof canvas.captureStream !== 'function') return null;
  const stream = canvas.captureStream(CAPTURE_FPS);
  const audio = getAudioTrack();
  if (audio) stream.addTrack(audio);
  return stream;
}

export default function ConsoleScene() {
  const { t, locale, setLocale } = useI18n();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const romInputRef = useRef<HTMLInputElement>(null);
  const stateInputRef = useRef<HTMLInputElement>(null);
  const slotRef = useRef<HTMLButtonElement>(null);

  const dragCartridgeRef = useRef<Cartridge | null>(null);
  const dragOriginRef = useRef({ x: 0, y: 0 });
  /**
   * 「正在载入」的同步标记。
   *
   * `loading` 是异步 state，挡不住「载入还没完又拖一盘进来」—— 那会再走一遍 loadRom
   * （内部先 exit 再 launch），白等一次还容易把两边的状态搅在一起。
   * 用 ref 而不是把 `loading` 放进 useCallback 依赖：那样拖拽那套 effect 会跟着重订阅。
   */
  const loadingRef = useRef(false);

  // 用 state 的惰性初始化持有实例：只会创建一次，
  // 同时避免在渲染期间读写 ref（react-hooks/refs 规则禁止）
  const [controller] = useState(() => new EmulatorController());

  const [rom, setRom] = useState<LoadedRom | null>(null);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  /*
   * 正在插卡带。`ratio` 是核心包的下载进度（0..1），null 表示「拿不到字节数」——
   * 核心已经躺在 CacheStorage 里、或者响应没有 Content-Length 时就是 null，
   * 界面据此退回一条来回滑动的「不确定」进度条。
   *
   * 单独一个 state 而不是复用 busy：busy 是面板六个按钮共用的禁用开关，
   * 存档 / 读档也会把它置起来，而那些操作不该在插卡舱上冒出进度条。
   */
  const [loading, setLoading] = useState<{ ratio: number | null } | null>(null);
  // 当前这盘卡带的存档槽，新的在前。「有没有存档可读」就是 saves.length > 0，
  // 不再单独维护一个布尔 —— 两份状态迟早会对不上。
  const [saves, setSaves] = useState<SaveSlot[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  // 音量档位（0 = 静音，VOLUME_MAX = 原音量）。没插卡带时调它也不会丢 ——
  // controller 自己记着档位，下次载入 ROM 时作为 audio_volume 的初值。
  const [volume, setVolume] = useState(VOLUME_MAX);

  const [library, setLibrary] = useState<Cartridge[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  /**
   * 已装上的街机 BIOS（Neo Geo 的 neogeo.zip），null 表示没装。
   *
   * 只用来画页脚那一行状态 —— 真正递给模拟器的那份由 loadFile 现取（`getBios()`），
   * 免得把一个几 MB 的 File 长期挂在 React state 上。
   */
  const [bios, setBios] = useState<BiosInfo | null>(null);

  /**
   * 「刚失败的那次是街机」。
   *
   * 失败的卡带不会进卡带架（`putCartridge` 在载入成功之后才跑），所以光看架子和当前
   * 卡带都判断不出用户刚才拖的是街机 —— 而没有这个，页脚那行 BIOS 提示就永远不会出现，
   * 用户也就永远不知道 Neo Geo 游戏要 neogeo.zip。只置位、不清零。
   */
  const [biosHint, setBiosHint] = useState(false);

  const [fileOver, setFileOver] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [ghost, setGhost] = useState<DragGhost | null>(null);
  const [slotHot, setSlotHot] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  /* ---------------- 联机 ---------------- */

  const [netplayOpen, setNetplayOpen] = useState(false);
  const [netplayState, setNetplayState] = useState<NetplayState>(IDLE_NETPLAY_STATE);
  const [netplayBusy, setNetplayBusy] = useState(false);
  /** 房主推过来的画面流。只有加入者会拿到，房主那边永远是 null */
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  /**
   * 联机控制器，和 EmulatorController 一样用惰性初始化持有。
   *
   * 三个回调里要读 `controller`（房主把对方的输入打进本机），而 controller 在这个
   * useState 之前就建好了 —— 闭包捕获的是那个稳定引用，所以不需要 ref。
   * 本地角色由控制器回传，避免回调反过来引用 netplay 自己（那样是循环引用）。
   */
  const [netplay] = useState(
    () =>
      new NetplayController({
        onState: (next) => setNetplayState(next),
        onRemoteButton: (button, down, role) => {
          /*
           * 只有房主本机跑着模拟器。加入者屏幕上是房主推来的画面，
           * 本机连模拟器都没有，注入无处可去 —— 所以这里是单向的。
           */
          if (role !== 'host') return;
          controller.pressButton(button, remotePlayer(role), down);
        },
        onRemoteStream: (stream) => setRemoteStream(stream),
      })
  );

  /* ---------------- 按键 ---------------- */

  const [bindings, setBindings] = useState<KeyBindings>(DEFAULT_BINDINGS);
  const [keybindOpen, setKeybindOpen] = useState(false);

  // 刷新页面后，已经装过的 BIOS 还得在页脚那行状态里体现出来
  useEffect(() => {
    void getBiosInfo().then(setBios);
  }, []);

  /**
   * 键位在挂载后读，不用 `useState(() => loadBindings())` 惰性初始化。
   *
   * 客户端组件在服务端也会渲染一遍，那时没有 localStorage，惰性初始化拿到的是默认值；
   * 客户端 hydration 再跑一次才拿到用户存的那份 —— 两次结果不同就是 hydration 不一致。
   * 放到 effect 里读，服务端和首帧客户端都从默认值出发，一致。
   */
  useEffect(() => {
    const stored = loadBindings();
    setBindings(stored);
    controller.setBindings(stored);
  }, [controller]);

  /**
   * 改键位的唯一出口：写回引擎（**下次插卡带**才生效）、存盘、更新界面。
   *
   * 加入者那边还会顺带改到转发映射 —— 他没有模拟器，所以那条路是立刻生效的。
   */
  const applyBindings = useCallback(
    (next: KeyBindings) => {
      setBindings(next);
      controller.setBindings(next);
      saveBindings(next);
    },
    [controller]
  );

  /* ---------------- 载入 ---------------- */

  const loadFile = useCallback(
    async (file: File) => {
      // 房主正在出画面时不接受本地载入：屏幕上已经有画面了，再插一盘只会打架。
      // 用 netplay.current 而不是 state，省得把 netplayState 拖进依赖、让这个
      // 回调每次状态变化都换一次身份（拖拽那套 effect 依赖它）。
      if (netplay.current.remotePlaying) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      // 载入中再丢一盘进来：直接忽略，别把正在跑的那次搅了
      if (loadingRef.current) return;

      /*
       * 拖进来的可能不是游戏，而是街机 BIOS（Neo Geo 的 neogeo.zip）。
       *
       * 它和 romset 一样是个 zip、文件头也一模一样，光看头分不出来，只能问内容
       * （见 lib/bios.ts）。认出来就存成系统文件 —— 不进卡带架、不启动模拟器。
       * 这条路刻意做得和拖卡带一样：用户不需要知道「BIOS」这个概念，
       * 拖进来就算装上了。
       */
      if (await isNeoGeoBios(file)) {
        const info = await putBios(file);
        setBios(info);
        console.info(
          `[nesload] 街机 BIOS 已装上：${file.name}。` +
            'Neo Geo 游戏（合金弹头、拳皇、侍魂…）现在能跑了 —— 重新拖一次那盘卡带即可。'
        );
        return;
      }

      loadingRef.current = true;
      setBusy(true);
      // 进度条立刻出现（此刻还是「不确定」态）—— 用户刚把文件丢进来，
      // 界面必须在同一帧给出反应，不能等他看到几秒雪花之后才动。
      setLoading({ ratio: null });

      // 载入失败时要靠它决定页脚给不给 BIOS 提示，所以在 try 里先认一次机种。
      // （loadRom 内部还会再认一次 —— 只读文件头，不值得为省这一次把签名搅乱。）
      let consoleType: ConsoleType | null = null;
      try {
        consoleType = await detectConsole(file);
        /*
         * 每 1% 才更新一次 state：几 MB 的核心包会有几百个 chunk，
         * 每个都 setState 会把整个场景重渲染几百次。
         *
         * `total <= 0` 直接不更新，state 停在初值那条「不确定」进度上。
         * 下完（pct 到 100）也退回「不确定」—— 后面还有核心启动那一段，
         * 否则进度条会卡在 100% 一动不动。
         */
        let lastPct = -1;
        await controller.loadRom(
          file,
          canvas,
          (loaded, total) => {
            if (total <= 0) return;
            const pct = Math.floor((loaded / total) * 100);
            if (pct === lastPct) return;
            lastPct = pct;
            setLoading({ ratio: pct >= 100 ? null : loaded / total });
          },
          /*
           * 街机要带上 BIOS（Neo Geo 的 neogeo.zip）。没装就是 null，照常启动 ——
           * CPS1 / CPS2 那类本来就不需要，缺了只是 Neo Geo 游戏会静默失败。
           * 先用 state 短路一下，没装过就不必去翻一次 IndexedDB。
           */
          bios ? await getBios() : null
        );
        const loaded = controller.rom;
        setRom(loaded);
        setPaused(false);
        setSaveOpen(false);

        if (loaded) {
          // 换了一盘卡带，存档列表也要跟着换 —— 槽位是按 ROM 文件名分的
          setSaves(await listSaves(loaded.name));

          // 载入即入架；putCartridge 会刷新 lastPlayedAt，
          // 于是这盘自然排到最前面，超出 10 盘的旧卡带被淘汰
          const meta = await putCartridge(file, loaded.console);
          await pruneCartridges();
          setLibrary(await listCartridges());
          if (meta) setActiveId(meta.id);
        }
      } catch (e) {
        /*
         * 屏幕里不显示任何文案，所以失败是「静默」的：
         * 表现为卡带没插上 —— 没画面，电视机继续出雪花。
         *
         * 但日志必须留一条：街机失败最常见的原因就两个 —— romset 版本和核心对不上、
         * 或者 Neo Geo 缺 neogeo.zip —— 少了这条连往哪儿查都不知道。
         */
        console.error('[nesload] 载入失败：', file.name, e);
        /*
         * 街机失败时把页脚那行 BIOS 提示叫出来 —— 这是唯一能告诉用户
         * 「Neo Geo 游戏需要 neogeo.zip」的通道。
         */
        if (!bios && consoleType === 'arcade') setBiosHint(true);
        setRom(null);
        setSaves([]);
        setActiveId(null);
      } finally {
        loadingRef.current = false;
        setBusy(false);
        setLoading(null);
      }
    },
    [bios, controller, netplay]
  );

  const loadFromLibrary = useCallback(
    async (id: string) => {
      const file = await readCartridge(id);
      if (!file) return;
      await loadFile(file);
    },
    [loadFile]
  );

  /**
   * 重载当前卡带 —— 「改完键位要重新插一次卡带」这件事的一键版。
   *
   * 为什么必须整个重来：RetroArch 的键盘映射只在核心启动时读一次，而 Nostalgist
   * **没有公开的「写配置」接口**（`getCurrentRetroarchConfig` 在 Emulator 上是 private，
   * `restart()` 只会拿旧配置重启核心），所以新键位只能靠重新 launch 带进去。
   *
   * 重来之前先把当前进度存成快照、回来再读回去：改个键位就把游戏打回标题画面太亏。
   * 读档失败不算致命 —— 最差就是回到标题画面，卡带还是插着的。
   *
   * 走的是 loadFile，所以「加入者（房主正在出画面）不接受本地载入」那道闸照样生效：
   * 他本来就插不了卡带，也就无所谓重载。房主不受影响 —— `remotePlaying` 是加入者
   * 才有的状态（只有加入者会收到 `'s'` 消息）。
   */
  const reloadRom = useCallback(async () => {
    if (!controller.isRunning || !activeId) return;
    setBusy(true);
    try {
      const snapshot = await controller.saveState();
      const file = await readCartridge(activeId);
      if (!file) return;
      await loadFile(file);
      if (snapshot && controller.isRunning) await controller.loadStateFrom(snapshot);
    } catch (e) {
      console.warn('重载卡带失败', e);
    } finally {
      setBusy(false);
    }
  }, [controller, activeId, loadFile]);

  /* ---------------- 卡带架 ---------------- */

  useEffect(() => {
    // 首屏把上次留下的卡带捞出来。异步读，所以不会触发 set-state-in-effect。
    let cancelled = false;
    void listCartridges().then((items) => {
      if (!cancelled) setLibrary(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const removeFromLibrary = useCallback(async (id: string) => {
    await removeCartridge(id);
    setLibrary(await listCartridges());
    setActiveId((current) => (current === id ? null : current));
  }, []);

  /* ---------------- 拎起卡带 ---------------- */

  const isOverSlot = useCallback((x: number, y: number) => {
    const rect = slotRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return (
      x >= rect.left - SLOT_HIT_PAD_X &&
      x <= rect.right + SLOT_HIT_PAD_X &&
      y >= rect.top - SLOT_HIT_PAD_Y &&
      y <= rect.bottom + SLOT_HIT_PAD_Y
    );
  }, []);

  const pickUp = useCallback((cartridge: Cartridge, e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // 阻止原生文本选中 / 图片拖拽，卡带完全由指针事件接管
    e.preventDefault();
    dragCartridgeRef.current = cartridge;
    dragOriginRef.current = { x: e.clientX, y: e.clientY };
    setGhost({ x: e.clientX, y: e.clientY, name: cartridge.name, consoleType: cartridge.console });
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      setGhost((current) => (current ? { ...current, x: e.clientX, y: e.clientY } : current));
      setSlotHot(isOverSlot(e.clientX, e.clientY));
    };

    const onRelease = (e: PointerEvent) => {
      const cartridge = dragCartridgeRef.current;
      const moved = Math.hypot(
        e.clientX - dragOriginRef.current.x,
        e.clientY - dragOriginRef.current.y
      );
      const hot = isOverSlot(e.clientX, e.clientY);

      dragCartridgeRef.current = null;
      setDragging(false);
      setGhost(null);
      setSlotHot(false);

      if (!cartridge) return;
      // 拖到卡槽 = 载入；几乎没动 = 当作点击，也载入
      if (hot || moved < CLICK_SLOP) void loadFromLibrary(cartridge.id);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onRelease);
    window.addEventListener('pointercancel', onRelease);
    document.body.style.cursor = 'grabbing';

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onRelease);
      window.removeEventListener('pointercancel', onRelease);
      document.body.style.cursor = '';
    };
  }, [dragging, isOverSlot, loadFromLibrary]);

  /* ---------------- 控制 ---------------- */

  const eject = useCallback(async () => {
    await controller.exit();
    setRom(null);
    setPaused(false);
    setSaves([]);
    setSaveOpen(false);
    setActiveId(null);
  }, [controller]);

  const togglePause = useCallback(async () => {
    if (!controller.isRunning) return;
    await controller.togglePause();
    setPaused(controller.isPaused);
  }, [controller]);

  const reset = useCallback(async () => {
    if (!controller.isRunning) return;
    await controller.reset();
    setPaused(false);
  }, [controller]);

  /*
   * 存档 / 读档 / 导入都必须把 setBusy(false) 放进 finally。
   * busy 是面板六个按钮共用的禁用开关 —— 只要有一条路径漏了复位，
   * 整排按钮（包括「弹出」）就会永久变灰，表现就是「点了弹出没反应，游戏还在跑」。
   */

  /**
   * 存档 = 开一个新槽。写满 MAX_SAVES 份之后再存会顶掉最早的那份
   * （淘汰规则在 lib/saves.ts 里，这里不重复判断）。
   */
  const saveState = useCallback(async () => {
    if (!controller.isRunning || !rom) return;
    setBusy(true);
    try {
      const blob = await controller.saveState();
      if (!blob) return;

      // 先试着落进槽位；IndexedDB 用不了（隐私模式等）时退回下载 .state 文件，
      // 否则这一下存档就白按了。
      const slot = await saveSlot(rom.name, blob);
      if (slot) setSaves(await listSaves(rom.name));
      else await controller.downloadState(blob);
    } catch (e) {
      console.warn('存档失败', e);
    } finally {
      setBusy(false);
    }
  }, [controller, rom]);

  /** 打开存档列表。每次都重新拉一遍，免得列出来的时间是过期的。 */
  const openLoad = useCallback(async () => {
    if (!controller.isRunning || !rom) return;
    const items = await listSaves(rom.name);
    setSaves(items);
    if (items.length > 0) setSaveOpen(true);
  }, [controller, rom]);

  const loadSlot = useCallback(
    async (id: string) => {
      if (!controller.isRunning) return;
      setBusy(true);
      try {
        const blob = await readSave(id);
        if (!blob) return;
        await controller.loadStateFrom(blob);
        setSaveOpen(false);
      } catch (e) {
        console.warn('读档失败', e);
      } finally {
        setBusy(false);
      }
    },
    [controller]
  );

  const importState = useCallback(
    async (file: File) => {
      if (!controller.isRunning) return;
      setBusy(true);
      try {
        await controller.loadStateFrom(file);
      } catch (e) {
        console.warn('导入存档失败', e);
      } finally {
        setBusy(false);
      }
    },
    [controller]
  );

  const exportState = useCallback(async () => {
    if (!controller.isRunning) return;
    await controller.downloadState();
  }, [controller]);

  /** 档位由 controller 夹紧后返回，界面上显示的永远是真正生效的那一档 */
  const changeVolume = useCallback(
    (level: number) => {
      setVolume(controller.setVolume(level));
    },
    [controller]
  );

  /* ---------------- 联机 ---------------- */

  /*
   * 三个操作都不往外抛：失败原因由 netplay 写进 state.error，界面自己读。
   * busy 一律放 finally —— 和存档那几处同一个理由，漏一条按钮就永久变灰。
   */

  const createRoom = useCallback(async () => {
    setNetplayBusy(true);
    try {
      await netplay.host();
    } catch (e) {
      console.warn('创建房间失败', e);
    } finally {
      setNetplayBusy(false);
    }
  }, [netplay]);

  const joinRoom = useCallback(
    async (code: string) => {
      setNetplayBusy(true);
      try {
        await netplay.join(code);
      } catch (e) {
        console.warn('加入房间失败', e);
      } finally {
        setNetplayBusy(false);
      }
    },
    [netplay]
  );

  const leaveRoom = useCallback(async () => {
    setNetplayBusy(true);
    try {
      await netplay.leave();
    } catch (e) {
      console.warn('离开房间失败', e);
    } finally {
      setNetplayBusy(false);
    }
  }, [netplay]);

  /**
   * 房主：插上卡带就把画面推给对方。
   *
   * 依赖里带 `role` 是为了覆盖「先插卡带、后开房」——开房那一刻 role 才变成 host，
   * 这个 effect 会重跑一遍、把流建起来。反过来退房（role 变 null）时走清理。
   */
  useEffect(() => {
    if (netplayState.role !== 'host' || !rom) return;

    const stream = createCaptureStream(canvasRef.current);
    if (!stream) return;

    netplay.publishStream(stream);
    netplay.announceGame({ name: rom.name, console: rom.console });

    /*
     * 声音可能迟到：RetroArch 的 AudioContext 是核心启动时才建的，抓流那一刻
     * 音频节点有可能还没接到 destination 上，流里就只有画面。这里补几次 ——
     * 拿到音频轨就塞进**同一条**流再 add 一遍（Trystero 会跳过已在连接里的轨道，
     * 画面不会被推两遍）。
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
      // 先报「没在玩」再收流：加入者收到就会把视频摘掉，不会冻在最后一帧上
      netplay.announceGame(null);
      netplay.unpublishStream();
    };
  }, [rom, netplayState.role, netplay]);

  /**
   * 加入者：房主一出画面，就把本机那盘卡带弹掉。
   *
   * 一台机器上不能同时有「本地模拟器」和「房主的画面」两个画面源；
   * 而且加入者此刻按的键是发给房主的，本地那个模拟器只会看到一半的输入。
   */
  useEffect(() => {
    if (!netplayState.remotePlaying || !controller.isRunning) return;
    void eject();
  }, [netplayState.remotePlaying, controller, eject]);

  const handleDropFile = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setFileOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile]
  );

  /* ---------------- 主题 / 全屏 ---------------- */

  /**
   * 主题状态刻意不放进 React：首屏由 layout 的内联脚本写到 <html data-theme>，
   * 图标的高亮交给 CSS 按属性切换。这样既没有水合不一致，也不用在 effect 里 setState。
   */
  const applyTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // 隐私模式下写不进去，忽略即可
    }
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  /** 全屏的是屏幕本身，不是整页 —— 所以目标是 screenRef 而不是 documentElement */
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    const screen = screenRef.current;
    if (!screen) return;
    // 被拒时静默返回：屏幕里没有地方显示提示了
    void screen.requestFullscreen().catch(() => undefined);
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      // 有面板开着的时候只认 Esc。否则在面板上按 P / R / F5 会顺手把游戏
      // 暂停、重置、或者又存一份 —— 全是意外。
      if (saveOpen || netplayOpen || keybindOpen) {
        if (e.key === 'Escape') {
          setSaveOpen(false);
          setNetplayOpen(false);
          setKeybindOpen(false);
        }
        return;
      }

      const k = e.key.toLowerCase();
      if (k === 'p') {
        e.preventDefault();
        void togglePause();
      } else if (k === 'r') {
        e.preventDefault();
        void reset();
      } else if (e.key === 'F5') {
        e.preventDefault();
        void saveState();
      } else if (e.key === 'F8') {
        e.preventDefault();
        void openLoad();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePause, reset, saveState, openLoad, saveOpen, netplayOpen, keybindOpen]);

  /**
   * 把本地按键转发给对方。**只有加入者转发。**
   *
   * 房主那边不用转发：他的按键由 RetroArch 自己读（P1），加入者是从房主推来的
   * 画面里看到这一下动作的 —— 再转发一遍反而会让加入者去注入一个不存在的模拟器。
   * 加入者这边反过来：本机没有模拟器，所有按键都得送给房主，由房主注入成 2P。
   *
   * 刻意**不**阻止默认行为、也不接管输入：本地那一半（房主读 P1）完全不用我们插手。
   *
   * 也正因如此，这个方案要求**双人游戏**：加入者按的是 2P 键位，而单人游戏只认 P1。
   *
   * 依赖 role：不在房间里就整段不生效，连监听都不挂。面板开着时也不挂 ——
   * 改键位的过程中按下的键不该被当成游戏输入送到对面去。
   */
  useEffect(() => {
    if (netplayState.role !== 'guest') return;
    if (saveOpen || netplayOpen || keybindOpen) return;

    /*
     * 「物理键 → 钮」由**加入者自己的 2P 键位**反查得到。
     *
     * 房主怎么配 P2 跟加入者无关：加入者只把钮名发过去，房主那边按自己的表
     * 合成一个按键事件喂给核心。所以加入者改完键位是**立刻生效**的 ——
     * 他没有模拟器，不需要重插卡带（房主那边才需要）。
     */
    const keys = codeToButton(bindings.p2);
    /** 本地正按着的按钮 —— 切走窗口时靠它把欠下的 keyup 补上 */
    const held = new Set<string>();

    const forward = (e: KeyboardEvent, down: boolean) => {
      if (e.target instanceof HTMLInputElement) return;
      const button = keys[e.code];
      if (!button) return;
      // 按住不放会连发 keydown，重复转发没有意义
      if (down && e.repeat) return;
      if (down) held.add(button);
      else held.delete(button);
      netplay.sendButton(button, down);
    };

    const onDown = (e: KeyboardEvent) => forward(e, true);
    const onUp = (e: KeyboardEvent) => forward(e, false);

    /*
     * 切走窗口（alt+tab、点别的应用）时浏览器**不会补发 keyup**，
     * 不主动松的话对面会一直以为你按着那个方向键 —— 角色自己往边上走。
     */
    const onBlur = () => {
      for (const button of held) netplay.sendButton(button, false);
      held.clear();
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      /*
       * 摘监听时把欠着的 keyup 补上。不只为了关页面：开面板 / 改键位都会让这段
       * effect 重跑（依赖里有 bindings 和面板开关），正按着方向键的那一刻打开面板，
       * 后面那个 keyup 就再也没人转发了 —— 房主那边会一直以为你按着。
       */
      for (const button of held) netplay.sendButton(button, false);
      held.clear();
    };
  }, [netplayState.role, netplay, bindings, saveOpen, netplayOpen, keybindOpen]);

  /**
   * 面板关掉之后，把焦点从按钮上摘掉。
   *
   * Nostalgist 默认 `respondToGlobalEvents: true`，但它的键盘回调有一道过滤：
   * 事件目标是 `<button>` / `<input>` / `<a>` 这类可交互元素时**直接不转给核心**
   * （Nostalgist 内部的 isInteractable）。而面板的开关、关闭键全是 `<button>` ——
   * 用角落那个联机图标打开面板、再按 Esc 关掉，焦点还留在那颗按钮上，
   * 之后按方向键 RetroArch 一声不吭，看着就像「联机没生效」。
   *
   * blur() 而不是 focus(canvas)：canvas 没有 tabindex，focus() 是空操作；
   * 摘掉焦点后事件目标落回 body，核心才会重新读键盘。
   */
  useEffect(() => {
    if (saveOpen || netplayOpen || keybindOpen) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) active.blur();
  }, [saveOpen, netplayOpen, keybindOpen]);

  /**
   * 点完按钮就把焦点摘掉。
   *
   * 上面那条只管「面板关闭」这一种收尾，而麻烦不限于面板：按「暂停」再按一次恢复、
   * 点一下角落的主题 / 语言开关 —— 焦点都会留在那颗 `<button>` 上，之后核心就不读键盘了。
   * 这里统一收口：只要是按钮被点过，就把焦点放回 body。
   *
   * 只对 `<button>` 生效：`<input>`（房间码输入框）点了不能 blur，否则刚点进去就失焦、
   * 一个字都打不进来。
   */
  useEffect(() => {
    const onPointerUp = (e: PointerEvent) => {
      if (e.target instanceof HTMLButtonElement) e.target.blur();
    };
    document.addEventListener('pointerup', onPointerUp);
    return () => document.removeEventListener('pointerup', onPointerUp);
  }, []);

  useEffect(() => {
    return () => {
      void controller.exit();
      // 关页面 / 热更新时把房间退掉，否则对面会一直等着一个已经走了的人
      void netplay.leave();
    };
  }, [controller, netplay]);

  return (
    <main className="room relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden px-6 py-4">
      <div className="vignette pointer-events-none absolute inset-0" />

      <div className="pc-notice relative max-w-md flex-col items-center gap-3 text-center">
        <span className="font-pixel text-[10px] text-accent">DESKTOP ONLY</span>
        <p className="text-[12px] leading-relaxed text-ink-400">{t('notice.desktopOnly')}</p>
      </div>

      {/* 房间角落的开关：主题 / 语言 / 全屏 / 联机 */}
      <div className="stage absolute right-6 top-6 z-40 flex items-center gap-2">
        <div className="theme-seg pixel-edge pxw-2 bg-ink-800">
          <button
            type="button"
            className="seg-dark"
            onClick={() => applyTheme('dark')}
            title={t('theme.toDark')}
            aria-label={t('theme.toDark')}
          >
            <MoonIcon size={13} />
          </button>
          <button
            type="button"
            className="seg-light"
            onClick={() => applyTheme('light')}
            title={t('theme.toLight')}
            aria-label={t('theme.toLight')}
          >
            <SunIcon size={13} />
          </button>
        </div>

        <div className="locale-seg pixel-edge pxw-2 bg-ink-800">
          {LOCALE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={option.value === 'zh' ? 'seg-zh' : 'seg-en'}
              onClick={() => setLocale(option.value)}
              title={t(option.value === 'zh' ? 'locale.toZh' : 'locale.toEn')}
              aria-label={t(option.value === 'zh' ? 'locale.toZh' : 'locale.toEn')}
              aria-pressed={locale === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={toggleFullscreen}
          title={t(fullscreen ? 'fullscreen.exit' : 'fullscreen.enter')}
          aria-label={t(fullscreen ? 'fullscreen.exit' : 'fullscreen.enter')}
          className={`pixel-edge pxw-2 p-1.5 transition-colors ${
            fullscreen ? 'pxc-accent bg-accent/20 text-accent' : 'bg-ink-800 text-ink-300 hover:text-accent'
          }`}
        >
          <ExpandIcon size={13} />
        </button>

        {/* 在房间里（等待或已连上）就一直亮着，免得关掉面板后忘了自己还在房 */}
        <button
          type="button"
          onClick={() => setNetplayOpen(true)}
          title={t('netplay.open')}
          aria-label={t('netplay.open')}
          className={`pixel-edge pxw-2 p-1.5 transition-colors ${
            netplayState.status !== 'idle'
              ? 'pxc-accent bg-accent/20 text-accent'
              : 'bg-ink-800 text-ink-300 hover:text-accent'
          }`}
        >
          <LinkIcon size={13} />
        </button>

        {/* 自定义按键。单机双人也用得上，所以不跟着联机状态走 */}
        <button
          type="button"
          onClick={() => setKeybindOpen(true)}
          title={t('keybind.open')}
          aria-label={t('keybind.open')}
          className="pixel-edge pxw-2 bg-ink-800 p-1.5 text-ink-300 transition-colors hover:text-accent"
        >
          <KeyboardIcon size={13} />
        </button>
      </div>

      <div
        className="stage flex flex-col items-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) void loadFile(file);
        }}
      >
        {/* 电视机 + 右侧卡带架并排；items-end 让架子站在和电视机同一条地平线上 */}
        <div className="relative flex items-end gap-4">
          {/*
            地板铺在场景内部而不是视口上：这样地板线永远贴着物件的落地线，
            不会随窗口高度切到家具身上。
            向下铺 200vh 并让 main 的 overflow 裁掉，避免物件下方又露出墙面。
          */}
          <div className="pointer-events-none absolute -inset-x-[600px] top-[calc(100%-150px)] h-[200vh] bg-floor">
            <div className="absolute inset-x-0 top-0 h-[2px] bg-ink-800" />
          </div>

          <RetroTv
            canvasRef={canvasRef}
            screenRef={screenRef}
            rom={rom}
            /*
              房主报「没在玩」之后流可能还在路上，所以屏幕上放什么由 remotePlaying
              说了算 —— 光看流有没有到会有一小段「已经弹卡了但还显示旧画面」。
            */
            remoteStream={netplayState.remotePlaying ? remoteStream : null}
            remoteRom={netplayState.remoteGame}
            paused={paused}
            busy={busy}
            loading={loading}
            canLoad={saves.length > 0}
            volume={volume}
            fileOver={fileOver}
            slotHot={slotHot}
            slotRef={slotRef}
            onPickFile={() => romInputRef.current?.click()}
            onDragOver={() => setFileOver(true)}
            onDragLeave={() => setFileOver(false)}
            onDropFile={handleDropFile}
            onTogglePause={() => void togglePause()}
            onSave={() => void saveState()}
            onLoad={() => void openLoad()}
            onImport={() => stateInputRef.current?.click()}
            onExport={() => void exportState()}
            onEject={() => void eject()}
            onVolume={changeVolume}
            onExitFullscreen={exitFullscreen}
          />

          <CartridgeRack
            cartridges={library}
            activeId={activeId}
            onPickUp={pickUp}
            onLaunch={(id) => void loadFromLibrary(id)}
            onRemove={(id) => void removeFromLibrary(id)}
          />
        </div>

        {/*
          键位表。三行竖排，一行一套（1P / 2P / 快捷键）。

          刻意**不用** font-pixel：Press Start 2P 没有中日韩字形，而这版是中文说明 ——
          原文 `1P ARROWS / Z X / A S / Q E / SHIFT / ENTER` 只列键名、不说对应手柄上的
          哪个钮（Z=B、X=A、A/S=Y/X、Q/E=L/R 全都没写），等于没说明白。
          所以这里走系统字体、11px，和面板按钮同一套字。

          `relative` 不能省：地板那一层是 absolute + 不透明，从「场景底边往上 150px」
          一直铺到 200vh，正好把这个页脚也罩在里面 —— 页脚不是定位元素，会被地板
          **盖在下面**，ink-500 的字压在地板色上几乎看不见。
          relative 让它进入定位层、画在地板之上。

          `self-start` + `width: TV_WIDTH` 是「对中在机身上」的做法：
          外层 `.stage` 是 `items-center`，而 stage 的宽度是**整排**
          （机身 766 + 间距 16 + 卡带架 220 = 1002），居中会居到整排的中线（x=501）上；
          机身的中心在 x=383 —— 差 118px，看着就是歪的。
          给页脚量出机身那一栏的宽度、再让它从 stage 左边起排，文字就落在机身的轴上。
        */}
        <footer
          className="relative mt-8 flex flex-col items-center gap-1 self-start text-[11px] leading-snug text-ink-500"
          style={{ width: TV_WIDTH }}
        >
          <p>{t('legend.p1')}</p>
          <p>{t('legend.p2')}</p>
          <p>{t('legend.shortcut')}</p>
          {/*
            BIOS 状态行。只在**跟街机有关**的时候出现：已经装了 BIOS、刚有街机载入失败、
            架子上有街机卡带、或者正在玩街机。玩 NES / SFC 的人不需要被这一行打扰。

            为什么非要有这一行：Neo Geo 游戏缺 neogeo.zip 时，核心既不报错也不黑屏提示，
            表现就是「拖进去没反应」—— 用户根本无从知道该做什么。这是唯一能告诉他
            「拖个 neogeo.zip 进来就好」的地方（屏幕里放不下文案，见 RetroTv）。
          */}
          {(bios ||
            biosHint ||
            rom?.console === 'arcade' ||
            library.some((c) => c.console === 'arcade')) && (
            <p>{bios ? t('legend.biosReady') : t('legend.biosMissing')}</p>
          )}
        </footer>
      </div>

      {/*
        存档列表。刻意浮在房间上、**不进屏幕** —— 「屏幕里不放任何文案」是这个项目的
        硬规矩（见 RetroTv），而这张表必须写字，所以只能在外面。

        它自己不是物件，没必要做成拟物：一块带像素描边的面板 + 点背板或 Esc 关掉。
        行按时间从新到旧排，点哪一条载入哪一条。
      */}
      {saveOpen && rom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => setSaveOpen(false)}
        >
          <div className="absolute inset-0 bg-ink-950/70" />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('saves.title')}
            className="relative w-[440px] max-w-full bg-ink-800 pixel-edge pxw-4 pxc-600"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b-2 border-ink-900 bg-ink-850 px-4 py-3">
              <span className="text-[12px] text-ink-200">{t('saves.title')}</span>
              {/* 计数走 font-pixel：全是数字，没有掉字形的问题，和架子上的 nn/10 同一套 */}
              <span className="ml-auto font-pixel text-[8px] text-ink-400">
                {String(saves.length).padStart(2, '0')}/{String(MAX_SAVES).padStart(2, '0')}
              </span>
              <button
                type="button"
                aria-label={t('saves.close')}
                onClick={() => setSaveOpen(false)}
                className="pixel-edge pxw-2 pxc-500 flex h-[18px] w-[18px] items-center justify-center bg-ink-700 text-[10px] leading-none text-ink-100 hover:bg-danger hover:text-ink-950"
              >
                ×
              </button>
            </div>

            <div className="flex flex-col">
              {saves.map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void loadSlot(slot.id)}
                  className="flex items-center justify-between gap-4 border-b-2 border-ink-900 px-4 py-3 text-left text-[12px] text-ink-200 transition-colors last:border-b-0 enabled:hover:bg-ink-700 enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <span>{formatTime(slot.createdAt, locale)}</span>
                  <span className="shrink-0 text-[11px] opacity-60">{t('saves.load')}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/*
        联机面板。和存档列表一样浮在房间上、**不进屏幕** ——
        「屏幕里不放任何文案」是硬规矩，而这张面板必须写字。
      */}
      <NetplayPanel
        open={netplayOpen}
        state={netplayState}
        busy={netplayBusy}
        onClose={() => setNetplayOpen(false)}
        onCreate={() => void createRoom()}
        onJoin={(code) => void joinRoom(code)}
        onLeave={() => void leaveRoom()}
      />

      {/*
        自定义按键面板。和上面两块一样浮在房间上、不进屏幕。
        role + localPlaying 决定底部那句提示：加入者用的是 2P 键位、改完立刻生效；
        但他要是自己在房主出画面之前插了一盘，那盘按 P1 读键盘，一样要重载卡带。
        `rom !== null` 就是「本机跑着一盘自己的卡带」，同时也是重载按钮的可用条件。
      */}
      <KeyBindingsPanel
        open={keybindOpen}
        bindings={bindings}
        role={netplayState.role}
        localPlaying={rom !== null}
        onChange={applyBindings}
        onReload={reloadRom}
        onClose={() => setKeybindOpen(false)}
      />

      {/*
        被拎在手上的那盘卡带。
        fixed 定位下宽度是收缩到内容的，sprite 的 w-full 会算成 0，必须在这里显式给宽度。
        宽度取架子里那盘的宽度（不是机身卡槽的 288）：按下指针的一瞬间卡带宽度不能跳，
        而架子里那一盘就是这么宽 —— 插进卡槽后变宽，正好是「推进去」这件事本身。
      */}
      {ghost && (
        <div
          className="pointer-events-none fixed z-50"
          style={{
            width: CART_WIDTH,
            left: ghost.x,
            top: ghost.y,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <CartridgeSprite name={ghost.name} consoleType={ghost.consoleType} floating />
        </div>
      )}

      <input
        ref={romInputRef}
        type="file"
        accept=".nes,.fds,.unf,.unif,.sfc,.smc,.swc,.fig,.bs,.zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void loadFile(file);
          e.target.value = '';
        }}
      />
      <input
        ref={stateInputRef}
        type="file"
        accept=".state,.sav,.bin"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importState(file);
          e.target.value = '';
        }}
      />
    </main>
  );
}
