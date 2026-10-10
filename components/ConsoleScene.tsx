'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import { getAudioTrack } from '@/lib/audio-tap';
import { getBios, getBiosInfo, isNeoGeoBios, putBios, type BiosInfo } from '@/lib/bios';
import {
  EmulatorController,
  VOLUME_MAX,
  detectConsole,
  unsupportedArchive,
  type ConsoleType,
  type LoadedRom,
} from '@/lib/emulator';
import { formatTime, type Locale } from '@/lib/i18n';
import {
  captureFpsFor,
  DEFAULT_STREAM_QUALITY,
  IDLE_NETPLAY_STATE,
  NetplayController,
  remotePlayer,
  type NetplayMode,
  type NetplayState,
  type StreamQuality,
} from '@/lib/netplay';
import {
  codeToButton,
  DEFAULT_BINDINGS,
  loadBindings,
  playerLegend,
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
import { isSeason, nextSeason } from '@/lib/season';
import FeedbackPanel from './FeedbackPanel';
import GameLibraryPanel, { type LibraryGame } from './GameLibraryPanel';
import { useI18n } from './I18nProvider';
import KeyBindingsPanel from './KeyBindingsPanel';
import NetplayPanel from './NetplayPanel';
import OnboardingTour from './OnboardingTour';
import RetroTv from './RetroTv';
import {
  DESK_HEIGHT,
  RoomCalendar,
  RoomDesk,
  RoomFloorItems,
  RoomLamp,
  RoomWall,
  RoomWindow,
} from './RoomBackdrop';
import {
  ExpandIcon,
  HelpIcon,
  KeyboardIcon,
  LibraryIcon,
  MinimalIcon,
  MoonIcon,
  NoteIcon,
  PlayersIcon,
  SunIcon,
} from './icons';

const THEME_KEY = 'nesload:theme';

/**
 * 主题切换时挂 `theme-fading` 的时长，**必须 ≥ globals.css 里那几条 transition 的时长**。
 *
 * 挂多久就过渡多久：早了会在颜色还没走完时把过渡属性摘掉，后半程直接跳；
 * 晚了则白白让所有 hover 都慢半拍。见下面 applyTheme。
 */
const THEME_FADE_MS = 400;
/**
 * 吊灯开关。值只有 'on' / 'off'，首屏由 layout 的内联脚本读进 <html data-lamp>。
 * 它**跟着主题走**（白天关、夜晚开，见下面的 applyTheme），手动点灯只是临时覆盖。
 */
const LAMP_KEY = 'nesload:lamp';

/**
 * 简洁模式开关。值只有 'on' / 'off'（'on' 才是开），首屏由 layout 的内联脚本读进
 * <html data-simple>。真正藏东西的是 CSS，见 globals.css 里 `:root[data-simple='on']`。
 */
const SIMPLE_KEY = 'nesload:simple';

/**
 * 操作指引「看过了没有」的标记。
 *
 * **只有两种状态**：写过（看过）和没写过（没看过）。判断一律用 `!== null`，
 * 所以以后想重置只要删掉这个键即可 —— 见下面那个 effect。
 */
const TOUR_KEY = 'nesload:tour-done';
/**
 * 联机出画档位。**要记住**（和主题 / 吊灯同类）—— 它是按机器性能选的，
 * 每开一局都要重选一遍太烦。值的类型是 `StreamQuality`，存在 `lib/netplay.ts`。
 */
const QUALITY_KEY = 'nesload:netplay-quality';

/**
 * 注意：抓流请求的帧率**不再是这里的常量**，由出画档位给出（`captureFpsFor`）。
 *
 * 为什么帧率必须在建流那一刻定死：`captureStream(fps)` 的帧率是建流参数，事后改不了
 * （`applyConstraints` 对画布来的轨并不可靠），所以「换档」等于「重建整条流」。
 * 档位为什么能换到帧数、以及「房主掉帧 = 整局变慢」的完整因果，
 * 写在 lib/netplay.ts 的 `StreamQuality` 那一段。
 */
/** 等音频轨的最长尝试次数（每次 500ms，共 5 秒）—— 见下面的「声音迟到」注释 */
const AUDIO_RETRY_LIMIT = 10;

type Theme = 'dark' | 'light';

/** 分段开关的两个选项。文案刻意用短标签：中文一个字、英文两个字母，宽度才对称。 */
const LOCALE_OPTIONS: { value: Locale; label: string }[] = [
  { value: 'zh', label: '中' },
  { value: 'en', label: 'EN' },
];

/**
 * 抓一条「画面 + 声音」的流，给联机时的加入者看。
 *
 * 画面来自 canvas.captureStream；声音是从 WebAudio 上旁路出来的（见 lib/audio-tap.ts），
 * 核心还没建 AudioContext 时拿不到 —— 那就先推画面，声音由调用方重试补上。
 *
 * `contentHint = 'motion'`：告诉编码器这是一路**动的东西**（游戏画面），
 * 让它按「保住动作连贯」的口径去分配码率，而不是按「保住静态细节」——
 * 后者会把码率堆在单帧画质上，既费编码算力又对游戏没意义。
 */
function createCaptureStream(canvas: HTMLCanvasElement | null, fps: number): MediaStream | null {
  if (!canvas || typeof canvas.captureStream !== 'function') return null;
  const stream = canvas.captureStream(fps);
  const [video] = stream.getVideoTracks();
  if (video) video.contentHint = 'motion';
  const audio = getAudioTrack();
  if (audio) stream.addTrack(audio);
  return stream;
}

/**
 * 右侧开关栏里「组与组之间」的那道分隔线。
 *
 * 用户 2026-10-10 要求把这一列按功能分组、组间拉开：
 * 组内的间距是容器的 `gap-2`（8px），组间额外插一道 1px 短线，
 * 再叠上它自己的上下外边距（`my-1.5`），合起来约 29px —— 和组内的 8px 一眼分得开。
 * 纯装饰，`aria-hidden`（分组信息对读屏没有意义，逐个按钮本来就能读）。
 */
function RailDivider() {
  return <span aria-hidden className="my-1.5 h-px w-7 bg-ink-600" />;
}

/**
 * 流式读一个响应体，边读边报下载进度。
 *
 * 从游戏库载入时 ROM 是整包拉下来的，几 MB 的街机 romset 不给进度就像卡死了 ——
 * `res.blob()` 要等全部下完才 resolve，中途什么都看不到，所以这里手动读流。
 *
 * 拿不到 Content-Length（响应被压缩 / 分块传输）时进度一律报 null，
 * 界面据此退回一条来回滑的「不确定」进度条 —— 总比原地不动强。
 * 和核心包那段一样按 1% 节流，避免几百个 chunk 把场景重渲染几百次。
 */
async function readBodyWithProgress(
  res: Response,
  onProgress: (ratio: number | null) => void
): Promise<Blob> {
  const total = Number(res.headers.get('content-length')) || 0;
  const body = res.body;
  if (!body) return res.blob();

  const reader = body.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;
  let lastPct = -1;

  // 先给一帧「开始下载」：总字节数未知时是 null（不确定进度条），已知时从 0 起步
  onProgress(total > 0 ? 0 : null);

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    // 拷一份再进 chunk 数组：读出来的 Uint8Array 底层是 ArrayBufferLike，直接塞给
    // Blob 过不了类型（BlobPart 要求 ArrayBuffer 支撑），复制一次最省事。
    chunks.push(new Uint8Array(value));
    loaded += value.byteLength;

    if (total <= 0) continue;
    const pct = Math.floor((loaded / total) * 100);
    if (pct === lastPct) continue;
    lastPct = pct;
    onProgress(Math.min(loaded / total, 1));
  }

  return new Blob(chunks, { type: 'application/octet-stream' });
}

export default function ConsoleScene() {
  const { t, locale, setLocale } = useI18n();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const romInputRef = useRef<HTMLInputElement>(null);
  /**
   * 「正在载入」的同步标记。
   *
   * `loading` 是异步 state，挡不住「载入还没完又拖一盘进来」—— 那会再走一遍 loadRom
   * （内部先 exit 再 launch），白等一次还容易把两边的状态搅在一起。
   * 用 ref 而不是把 `loading` 放进 useCallback 依赖：那样载入回调会每次换一次身份。
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
   * 单独一个 state 而不是复用 busy：busy 是面板四个按钮共用的禁用开关，
   * 存档 / 读档也会把它置起来，而那些操作不该在屏幕上冒出进度条。
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
   * **只当一个布尔用**（装过没有），决定 loadFile 要不要去翻一次 IndexedDB；
   * 真正递给模拟器的那份由 loadFile 现取（`getBios()`），
   * 免得把一个几 MB 的 File 长期挂在 React state 上。
   */
  const [bios, setBios] = useState<BiosInfo | null>(null);

  /**
   * 刚拖进来的文件是 `.7z` / `.rar` 这类 FBNeo 吃不下的压缩格式。
   *
   * 载入失败在屏幕上是完全静默的（刻意的），所以这一条是**唯一**还能告诉用户
   * 「为什么拖进去没反应」的通道 —— 它挂在「按键说明」那个弹窗里。存 null 表示没这回事。
   */
  const [archiveHint, setArchiveHint] = useState<'7z' | 'rar' | null>(null);

  const [fileOver, setFileOver] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  /**
   * 吊灯开着没有。
   *
   * 真身其实在 `<html data-lamp>` 上（首屏由 layout 的内联脚本写入），CSS 按那个属性
   * 决定亮不亮 —— 和主题同一套路。这里这份 state **只为了 aria-pressed 和按钮文案**，
   * 挂载后再从属性同步（见下面那个 effect），所以不会影响首帧的观感。
   */
  const [lampOn, setLampOn] = useState(true);

  /**
   * 简洁模式开着没有。真身在 `<html data-simple>` 上（首屏由 layout 的内联脚本写入），
   * 这份 state **只为了 aria-pressed 和按钮文案**，挂载后再从属性同步 —— 和上面那盏灯一样。
   */
  const [simple, setSimple] = useState(false);

  /* ---------------- 联机 ---------------- */

  const [netplayOpen, setNetplayOpen] = useState(false);
  const [netplayState, setNetplayState] = useState<NetplayState>(IDLE_NETPLAY_STATE);
  const [netplayBusy, setNetplayBusy] = useState(false);
  /**
   * 选的链路。默认 `lan`（只 STUN）—— 这是不依赖任何外部配置就能跑的那一档，
   * `wan` 要构建期配了 TURN 才有意义（没配时面板会把它标成开发中）。
   * 不持久化：每次开面板都从局域网开始，省得用户上次选了公网、这次忘了切回去。
   */
  const [netplayMode, setNetplayMode] = useState<NetplayMode>('lan');
  /**
   * 出画档位（房主选）。默认值先给 `DEFAULT_STREAM_QUALITY`，真正存的份在挂载后读
   * （和键位同一套路：服务端没有 localStorage，惰性初始化会两边不一致）。
   */
  const [streamQuality, setStreamQuality] = useState<StreamQuality>(DEFAULT_STREAM_QUALITY);
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
  /** 「按键说明」弹窗。内容原先是常驻在右上角的一块文字，现在收进按钮里 */
  const [legendOpen, setLegendOpen] = useState(false);
  /**
   * 「一张纸」。点地板右下角那张纸片弹出来 —— 不是面板，是一句祝福，
   * 所以它不做工具栏那套，只做「窗口糊掉 + 浮起一张纸」。
   */
  const [noteOpen, setNoteOpen] = useState(false);

  /**
   * 留言本。内容来自 `/api/feedback`，是**公开**的，面板自己也负责提交（见 FeedbackPanel）。
   *
   * 有**两个**入口，开的是同一个面板：
   *   - 右侧开关栏那颗（正经入口，2026-10-10 加）
   *   - 房间里地板上那本（亮青封面 + 斜搁着的笔）—— 从此退成**彩蛋**，点开照旧能用
   * 列表数据不放在这里：面板每次打开都是一次全新挂载，翻页 / 提交的状态没必要留在父级。
   */
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  /**
   * 操作指引开着没有。**初次访问自动打开**（下面那个 effect），之后靠「重看操作指引」
   * 再打开（在按键说明弹窗里）。
   *
   * 默认 false、由 effect 打开而不是惰性初始化：客户端组件在服务端也会渲染一遍，
   * 那时没有 localStorage，惰性初始化会在两遍之间给出不同结果 → hydration 不一致。
   * 和键位那份用同一个理由（见下面 loadBindings 那段）。
   */
  const [tourOpen, setTourOpen] = useState(false);

  /* ---------------- 在线游戏库 ---------------- */

  const [libraryOpen, setLibraryOpen] = useState(false);
  /** 正在从游戏库载入的那盘游戏 id；非 null 时弹窗里的卡片全部置灰 */
  const [libraryLoadingId, setLibraryLoadingId] = useState<string | null>(null);
  /** ROM 下载进度（0..1）；null = 拿不到总字节数，弹窗里画不确定进度条 */
  const [libraryProgress, setLibraryProgress] = useState<number | null>(null);

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
   * 出画档位也是挂载后读（同上：服务端没有 localStorage）。
   * 读到的值不是合法档位（手改过、或旧版本留下的）就当没存过、退回默认 ——
   * 免得一个脏值被当成档位传下去。
   */
  useEffect(() => {
    const stored = localStorage.getItem(QUALITY_KEY);
    if (stored === 'smooth' || stored === 'balanced' || stored === 'sharp') {
      setStreamQuality(stored);
    }
  }, []);

  /**
   * 换档：状态 + 记住。写入失败（隐私模式）不影响本次生效，只是下次要重选。
   *
   * 这里**不碰流** —— 下面那个「房主推画面」的 effect 依赖里有 `streamQuality`，
   * 值一变它会自动收掉旧流、按新帧率重建一条。帧率是建流参数、事后改不了，
   * 所以「换档 = 重建整条流」这件事只有那一个地方该做。
   */
  const changeStreamQuality = useCallback((next: StreamQuality) => {
    setStreamQuality(next);
    try {
      localStorage.setItem(QUALITY_KEY, next);
    } catch {
      // 隐私模式下 localStorage 会抛，静默即可
    }
  }, []);

  /*
   * 初次访问自动弹操作指引。和上面键位同一套路：挂载后读，不在惰性初始化里读。
   *
   * 窄屏（< 900px）时指引整块是 display:none，用户根本看不到；**这里照样把它置开**，
   * 因为「标记」只在 onClose 里写（见 closeTour）—— 他看不到就没机会关，标记也就写不进去，
   * 之后换到宽窗口还会补上这一遍。这正是我们要的。
   */
  useEffect(() => {
    if (localStorage.getItem(TOUR_KEY) === null) setTourOpen(true);
  }, []);

  /** 关掉指引（走完 / 跳过都走这里），顺手记下「看过了」。 */
  const closeTour = useCallback(() => {
    setTourOpen(false);
    try {
      localStorage.setItem(TOUR_KEY, '1');
    } catch {
      // 隐私模式下写不进去也无所谓：下次还会再弹一遍，不影响功能
    }
  }, []);

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
      /*
       * 拖进来的第一件事就是留个痕。载入失败在屏幕上是静默的（这是刻意的），
       * 所以「拖了没反应」到底是没走到这儿、还是走到了又失败，只能靠这行日志区分
       * —— 连它都没有，问题就在拖拽事件那一层，不在载入流程。
       */
      console.info(
        `[nesload] 收到文件：${file.name}（${file.size} 字节，type=${file.type || '空'}）`
      );
      // 每次拖入都重置上一条格式提示 —— 它说的是「刚才那个文件」，不是历史状态
      setArchiveHint(null);

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
       * 它和 romset 一样是个 zip、文件头一模一样，只能靠文件名分（见 lib/bios.ts）。
       * 认出来就存成系统文件 —— 不进历史、不启动模拟器。
       * 这条路刻意做得和拖卡带一样：用户不需要知道「BIOS」这个概念，拖进来就算装上了。
       */
      if (isNeoGeoBios(file)) {
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
         * 机种认不出（`consoleType` 是 null）时给不出任何准话，只能单独认一次压缩格式 ——
         * 那是最常见的原因：街机 romset 大量以 7z / rar 流通，而 FBNeo 只吃 zip。
         */
        if (consoleType === null) setArchiveHint(await unsupportedArchive(file));
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

  /**
   * 从在线游戏库载入：按 id 走本站代理把 ROM 拉回来，再当成一个文件插进卡带槽。
   *
   * 走的是和本地拖入同一条 `loadFile`，所以 BIOS 装置、卡带历史、存档槽这些既有
   * 逻辑全都自动带上；文件名必须用后库存的 `romName` —— 街机 FBNeo 拿 zip 文件名认驱动。
   *
   * 下载这段**面板一直开着**并显示进度条：ROM 整包拉下来之前关掉弹窗，用户就只看到
   * 一片空荡荡的房间，不知道是在下载还是卡住了。拉完再关窗、交给 `loadFile`——
   * 后面核心包的下载进度由电视机屏幕里的进度条接着显示。
   */
  const loadRemoteGame = useCallback(
    async (game: LibraryGame) => {
      if (libraryLoadingId !== null) return;
      setLibraryLoadingId(game.id);
      setLibraryProgress(null);
      try {
        const res = await fetch(`/api/games/${game.id}/rom`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await readBodyWithProgress(res, setLibraryProgress);
        const file = new File([blob], game.romName, { type: 'application/octet-stream' });
        setLibraryOpen(false);
        await loadFile(file);
      } catch (e) {
        console.error('[nesload] 从游戏库载入失败：', game.title, e);
      } finally {
        setLibraryLoadingId(null);
        setLibraryProgress(null);
      }
    },
    [libraryLoadingId, loadFile]
  );

  /* ---------------- 卡带列表 ---------------- */

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
    /*
     * 把暂停说给对方。加入者手上的是一条 `<video>`，房主一暂停它就冻在最后一帧 ——
     * 那个样子和「卡死 / 掉线」完全一样，而他本机没有模拟器、也没有那颗暂停钮
     * （面板那排因为没卡带全是灰的），不告诉他就只能对着镜头猜。
     *
     * 加入者调到这里是空操作：没卡带时上面那句已经 return 了，就算调到了，
     * 控制器也只在房主身份下广播（见 sendSession）。
     */
    netplay.announcePaused(controller.isPaused);
  }, [controller, netplay]);

  const reset = useCallback(async () => {
    if (!controller.isRunning) return;
    await controller.reset();
    setPaused(false);
    // 重载会把暂停一并解掉，对方屏幕上那层 PAUSED 也得跟着撤
    netplay.announcePaused(false);
  }, [controller, netplay]);

  /*
   * 存档 / 读档都必须把 setBusy(false) 放进 finally。
   * busy 是面板四个按钮共用的禁用开关 —— 只要有一条路径漏了复位，
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
      await netplay.host(netplayMode);
    } catch (e) {
      console.warn('创建房间失败', e);
    } finally {
      setNetplayBusy(false);
    }
  }, [netplay, netplayMode]);

  const joinRoom = useCallback(
    async (code: string) => {
      setNetplayBusy(true);
      try {
        await netplay.join(code, netplayMode);
      } catch (e) {
        console.warn('加入房间失败', e);
      } finally {
        setNetplayBusy(false);
      }
    },
    [netplay, netplayMode]
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
   *
   * 依赖里带 `streamQuality` 是为了**换档**：帧率是 `captureStream(fps)` 的建流参数，
   * 事后改不了，所以换档必须重建整条流 —— 也就是「先按老样子收掉、再按新帧率建一条」。
   * 正常情况下换不了：档位选择器只在没进房间时显示（见 NetplayPanel）。
   */
  useEffect(() => {
    if (netplayState.role !== 'host' || !rom) return;

    const stream = createCaptureStream(canvasRef.current, captureFpsFor(streamQuality));
    if (!stream) return;

    netplay.publishStream(stream, streamQuality);
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
  }, [rom, netplayState.role, netplay, streamQuality]);

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
   * 写吊灯的开关。**DOM 属性是唯一真相**：先写 <html data-lamp>，再同步 React 那份
   * （只为 aria）。反过来的话，连续点两下可能因为 state 批处理丢掉一次翻转。
   */
  const applyLamp = useCallback((next: boolean) => {
    document.documentElement.dataset.lamp = next ? 'on' : 'off';
    setLampOn(next);
    try {
      localStorage.setItem(LAMP_KEY, next ? 'on' : 'off');
    } catch {
      // 隐私模式下写不进去，忽略即可
    }
  }, []);

  /**
   * 主题过渡类的摘除定时器。
   *
   * 用 ref 不用 state —— 它一变就要重渲染，而这个值跟渲染没有任何关系。
   */
  const themeFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 主题状态刻意不放进 React：首屏由 layout 的内联脚本写到 <html data-theme>，
   * 图标的高亮交给 CSS 按属性切换。这样既没有水合不一致，也不用在 effect 里 setState。
   *
   * **吊灯跟着主题走**：切白天自动关灯、切夜晚自动开灯（用户要求）。
   * 手动点灯只是**临时覆盖** —— 下次切主题、或者刷新页面（首屏脚本按主题决定）
   * 就又回到主题说了算。
   *
   * **切换时有一层「天光」动画**（2026-10-10 加）：新的一帧从左上角用一个圆推开。
   * 走 View Transitions API，不支持才退回整屏颜色淡入 —— 见下面那两分支。
   */
  const applyTheme = useCallback(
    (next: Theme) => {
      const root = document.documentElement;

      /** 真正落主题。两条路径都走它 —— View Transition 那条要把它塞进回调里。 */
      const commit = () => {
        root.dataset.theme = next;
        applyLamp(next === 'dark');
      };

      /*
       * 首选 View Transitions：浏览器把旧的一帧冻成快照，新的一帧从左上角用一个圆
       * 推出去（`::view-transition-*` 那几条在 globals.css），观感就是「光从左上角
       * 漫过来」。这样**不用在动画中途改主题**，也不会出现一整屏纯色。
       *
       * 回调里**只改 DOM 属性、不碰 setState**：快照是在回调（及其返回的 promise）
       * 结束后立刻拍的，而 `applyLamp` 里那次 setState 只影响 aria，重渲染跑在
       * 快照之后也无所谓，画面一模一样。
       */
      if (typeof document.startViewTransition === 'function') {
        document.startViewTransition(commit);
      } else {
        /*
         * 兜底（老 Firefox 等）：整屏颜色交叉淡入。
         *
         * 顺序是「加类 → 强制算一次样式 → 再改属性」：中间那步不能省。
         * 少了它，浏览器会把「加类」和「改 data-theme」并进同一次样式计算，
         * 于是过渡属性在**前一份**样式里根本不存在 —— 直接跳过去，看不到过渡。
         * 读一下 offsetHeight 就够，代价是一次同步布局，而这是点击触发的，无所谓。
         */
        root.classList.add('theme-fading');
        void root.offsetHeight;
        commit();

        /*
         * 连点（白天→夜晚→白天）时**重置**定时器而不是叠加：
         * 否则第一下那个定时器会在第二下过渡还没走完时把类摘掉，后半程直接跳。
         */
        if (themeFadeTimer.current !== null) clearTimeout(themeFadeTimer.current);
        themeFadeTimer.current = setTimeout(() => {
          root.classList.remove('theme-fading');
          themeFadeTimer.current = null;
        }, THEME_FADE_MS);
      }

      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // 隐私模式下写不进去，忽略即可
      }
    },
    [applyLamp]
  );

  /** 点灯：把当前状态翻过来（读的是 DOM 属性，和上面同一份真相） */
  const toggleLamp = useCallback(() => {
    applyLamp(document.documentElement.dataset.lamp !== 'on');
  }, [applyLamp]);

  /**
   * 写简洁模式。和 `applyLamp` 一模一样的顺序：**先写 DOM 属性再同步 React**
   * （反过来的话，连点两下可能因为 state 批处理丢掉一次翻转）。
   *
   * 真正藏东西的是 CSS（`globals.css` 里 `:root[data-simple='on']` 那几条），
   * 这里一个组件都不卸载 —— 和季节四套 `<svg>` 留在 DOM 里同一个理由：
   * 状态在属性上，React 不持有「藏了谁」。
   */
  const applySimple = useCallback((next: boolean) => {
    document.documentElement.dataset.simple = next ? 'on' : 'off';
    setSimple(next);
    try {
      localStorage.setItem(SIMPLE_KEY, next ? 'on' : 'off');
    } catch {
      // 隐私模式下写不进去，忽略即可
    }
  }, []);

  const toggleSimple = useCallback(() => {
    applySimple(document.documentElement.dataset.simple !== 'on');
  }, [applySimple]);

  /**
   * 换窗外的季节：切到下一季（春→夏→秋→冬→春）。
   *
   * 和 `toggleLamp` 一样**读 DOM 属性取当前值** —— `<html data-season>` 是唯一真相，
   * React 不持有季节（首屏由 layout.tsx 的内联脚本按农历写，见 lib/season.ts）。
   * 所以这里连 state 都不需要：按钮的文案是固定的，界面别处也不显示季节。
   *
   * **只改当次会话，不落盘** —— 手动选的季节是临时看看，刷新要回到按农历算的那一季。
   * 所以这里**不写 localStorage**（和主题 / 吊灯不同，那两个是要记住的偏好）。
   *
   * 和主题**无关**：季节只看农历 + 手动，切主题不会把它重置掉
   * （雪夜、晴冬都能有，屋里开不开灯是另一回事）。
   */
  const cycleSeason = useCallback(() => {
    const current = document.documentElement.dataset.season;
    const next = nextSeason(isSeason(current) ? current : 'winter');
    document.documentElement.dataset.season = next;
  }, []);

  /**
   * 挂载后把 React 那份对齐到属性上（首屏是内联脚本写的，React 无从得知）。
   * 和键位一样是「挂载后再读」—— 服务端没有 localStorage，惰性初始化会两边不一致。
   */
  useEffect(() => {
    setLampOn(document.documentElement.dataset.lamp === 'on');
    setSimple(document.documentElement.dataset.simple === 'on');
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

  /**
   * Esc 关面板。
   *
   * **键盘快捷键（P / R / F5 / F8）2026-10-10 全部取消了**（用户要求）。
   * 它们都是「看不见的操作」，而按错的代价不小：P 一按游戏就停住（画面冻在最后一帧，
   * 看着就是卡死），F5 会直接把存档槽覆盖掉。这四件事在机身前面板上一人一颗钮 ——
   * 看得见、点得到，键盘这条路没有存在的必要。
   *
   * 所以这个 effect 现在只剩一件事：面板开着时按 Esc 关掉它。
   *
   * 输入框里按 Esc 不算关面板（房间码打了一半、留言本写了一行，都不该被撤掉）——
   * 留言本尤其如此：它的输入框是 `<textarea>`，不在下面那道 `HTMLInputElement`
   * 过滤里，只能靠早退那一行挡住。
   */
  useEffect(() => {
    const anyPanelOpen =
      saveOpen ||
      netplayOpen ||
      keybindOpen ||
      libraryOpen ||
      legendOpen ||
      noteOpen ||
      feedbackOpen ||
      tourOpen;

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (!anyPanelOpen || e.key !== 'Escape') return;

      setSaveOpen(false);
      setNetplayOpen(false);
      setKeybindOpen(false);
      setLibraryOpen(false);
      setLegendOpen(false);
      setNoteOpen(false);
      setFeedbackOpen(false);
      // 指引自己也挂了一个 Esc（见 OnboardingTour），这里再兜一次。
      // 两条路都通到 closeTour，重复调用只是多写一次标记，无副作用。
      if (tourOpen) closeTour();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    saveOpen,
    netplayOpen,
    keybindOpen,
    libraryOpen,
    legendOpen,
    noteOpen,
    feedbackOpen,
    tourOpen,
    closeTour,
  ]);

  /**
   * 把本地按键转发给对方。**只有加入者转发。**
   *
   * 房主那边不用转发：他的按键由 RetroArch 自己读（P1），加入者是从房主推来的
   * 画面里看到这一下动作的 —— 再转发一遍反而会让加入者去注入一个不存在的模拟器。
   * 加入者这边反过来：本机没有模拟器，所有按键都得送给房主，由房主注入成 2P。
   *
   * 刻意**不**阻止默认行为、也不接管输入：本地那一半（房主读 P1）完全不用我们插手。
   *
   * 也正因如此，这个方案要求**双人游戏**：加入者的输入落在 2P 位上，而单人游戏只认 P1。
   * 注意那是**游戏里的号位**，和他手上按哪几个键无关（见下面那张表）。
   *
   * 依赖 role：不在房间里就整段不生效，连监听都不挂。面板开着时也不挂 ——
   * 改键位的过程中按下的键不该被当成游戏输入送到对面去。
   */
  useEffect(() => {
    if (netplayState.role !== 'guest') return;
    if (saveOpen || netplayOpen || keybindOpen || legendOpen || noteOpen || feedbackOpen || tourOpen) return;

    /*
     * 「物理键 → 钮」由**加入者自己的 1P 键位**反查得到。
     *
     * 为什么是 1P 那组、不是看起来更「对位」的 2P：联机时两人各在自己的键盘前，
     * **不存在抢键**，所以「游戏里的号位」和「手上按哪几个键」彻底解耦 —— 加入者
     * 在游戏里是 2P，键位却该用他自己的 1P 布局（那才是他配惯的那套）。这样一来
     * 1P 那组永远是「你自己的键」，2P 那组只服务单机双人共用一块键盘。
     *
     * 房主怎么配 P2 跟加入者无关：加入者只把钮名发过去，房主那边按自己的表
     * 合成一个按键事件喂给核心。所以加入者改完键位是**立刻生效**的 ——
     * 他没有模拟器，不需要重插卡带（房主那边才需要）。
     */
    const keys = codeToButton(bindings.p1);
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
  }, [netplayState.role, netplay, bindings, saveOpen, netplayOpen, keybindOpen, legendOpen, noteOpen, feedbackOpen, tourOpen]);

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
    if (saveOpen || netplayOpen || keybindOpen || legendOpen || noteOpen || feedbackOpen || tourOpen) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) active.blur();
  }, [saveOpen, netplayOpen, keybindOpen, legendOpen, noteOpen, feedbackOpen, tourOpen]);

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
      {/*
        页面里唯一一段**真正的文字**，给搜索引擎和读屏软件看。
        视觉上完全不可见（sr-only = 定位到 1px 再裁掉），不占位、不吃点击。

        为什么非要有：屋子里的一切都是 CSS 画的，游戏跑在 canvas 里，
        整页没有一个可索引的词 —— 爬虫进来只看到空壳。正文、层级（h1）都在这里补齐。
        文案在 lib/i18n.ts 的 seo.* 里，跟着语言走。

        位置放在 <main> 最前面：读屏用户 tab 进来的第一个焦点之前就能听到
        「这是什么、怎么开始玩」，而不是直接从一片没有任何说明的按钮列表开始。

        ⚠️ 别把 sr-only 改成可见，也别往里面堆关键词 —— 前者会毁掉这间屋子的极简感，
        后者是会被判作弊的隐藏文本。这里只如实描述页面上真的有的功能。
      */}
      <div className="sr-only">
        <h1>{t('seo.heading')}</h1>
        <p>{t('seo.intro')}</p>
        <p>{t('seo.howTo')}</p>
      </div>

      {/*
        墙纸。**必须在 .vignette 之前** —— 两者都是 z-auto 的定位元素，谁先渲染谁在下，
        墙纸要是排在暗角后面，四角那圈压暗就被它盖掉了（见 RoomBackdrop 顶部注释）。
      */}
      <RoomWall />
      <div className="vignette pointer-events-none absolute inset-0" />

      <div className="pc-notice relative max-w-md flex-col items-center gap-3 text-center">
        <span className="font-pixel text-[10px] text-accent">DESKTOP ONLY</span>
        <p className="text-[12px] leading-relaxed text-ink-400">{t('notice.desktopOnly')}</p>
      </div>

      {/*
        右侧竖排开关：**上下居中贴右边**，并且**按功能分成三组**
        （用户 2026-10-10 要求：外观 / 游戏 / 帮助，组间拉开）。

        从上到下：
          ① 外观 —— 明暗、语言、全屏、简洁
          ② 游戏 —— 游戏库、联机、自定义按键
          ③ 帮助与留言 —— 按键说明、留言本
        组内间距是容器的 `gap-2`，组间插一道 `RailDivider`（1px 短线 + 更大的外边距）。

        留言本原先**只能**点房间里地板上那本，现在给了它一个正经入口；
        地板上那本**留着**，成了彩蛋 —— 见 `RoomFloorItems` 的注释。

        原先是横着摆在右上角，整排压住了机身右上角（说明那块更是直接盖在电视机上）。
        竖过来之后宽度只有原来的一半不到，场景横向又空出来，不再和电视机抢地方。
        两个分段控件也跟着竖排 —— 见 globals.css 的 `.theme-seg / .locale-seg`。
      */}
      <div
        data-tour="rail"
        className="stage absolute right-6 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-2"
      >
        {/* ==================== 组 ①：外观 ==================== */}

        {/*
          白天在上、夜晚在下（用户要求，2026-10-10 换过）。
          分段控件是 `flex-direction: column`（见 globals.css 的 `.theme-seg`），
          所以 DOM 顺序就是上下顺序 —— 高亮由 `.seg-light / .seg-dark` 类决定，
          和先后无关，换位置不会影响选中态。
        */}
        <div className="theme-seg pixel-edge pxw-2 bg-ink-800">
          <button
            type="button"
            className="seg-light"
            onClick={() => applyTheme('light')}
            title={t('theme.toLight')}
            aria-label={t('theme.toLight')}
          >
            <SunIcon size={13} />
          </button>
          <button
            type="button"
            className="seg-dark"
            onClick={() => applyTheme('dark')}
            title={t('theme.toDark')}
            aria-label={t('theme.toDark')}
          >
            <MoonIcon size={13} />
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

        {/*
          简洁模式：只留背景墙 / 电视机 / 桌子 / 地面。
          和全屏那颗一样是**有开关状态的按钮**，所以亮着的样式跟它同一套（accent 底）。
          真正藏东西的是 CSS，这里只负责翻 <html data-simple>。
        */}
        <button
          type="button"
          onClick={toggleSimple}
          title={t(simple ? 'simple.exit' : 'simple.enter')}
          aria-label={t(simple ? 'simple.exit' : 'simple.enter')}
          aria-pressed={simple}
          className={`pixel-edge pxw-2 p-1.5 transition-colors ${
            simple ? 'pxc-accent bg-accent/20 text-accent' : 'bg-ink-800 text-ink-300 hover:text-accent'
          }`}
        >
          <MinimalIcon size={13} />
        </button>

        <RailDivider />

        {/* ==================== 组 ②：游戏 ==================== */}

        {/* 在线游戏库。点开是个全屏弹窗，选一盘直接载入 */}
        <button
          type="button"
          onClick={() => setLibraryOpen(true)}
          title={t('games.open')}
          aria-label={t('games.open')}
          className="pixel-edge pxw-2 bg-ink-800 p-1.5 text-ink-300 transition-colors hover:text-accent"
        >
          <LibraryIcon size={13} />
        </button>

        {/*
          联机。在房间里（等待或已连上）就一直亮着，免得关掉面板后忘了自己还在房。

          外面这层 `relative` 只是为了**挂延迟读数**：竖排这一列每个按钮才 28px 宽，
          里面塞不下字，所以把读数绝对定位到按钮**左边**（`right-full` + 一点外边距）。
          读数本身在 <html data-*> 之外、跟着 React state 走 —— 它两秒一刷，
          走 DOM 属性反而要自己管生命周期。
        */}
        <div className="relative">
          {/*
            延迟。只在**真的连上**且**测出值**时出现：`rtt` 是 ping 的往返时间，
            连上到第一次 ping 回来之间有一小段空窗，那时不显示比显示个「--」干净。
            用 font-pixel 的英文/数字（`123ms`），和面板里那一处读数同一套。
          */}
          {netplayState.status === 'connected' && netplayState.rtt !== null && (
            <span className="absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap font-pixel text-[9px] text-accent">
              {Math.round(netplayState.rtt)}ms
            </span>
          )}
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
            <PlayersIcon size={13} />
          </button>
        </div>

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

        <RailDivider />

        {/* ==================== 组 ③：帮助与留言 ==================== */}

        {/*
          按键说明。内容从**当前**键位现算（`playerLegend`），收进弹窗也永远是准的 ——
          写死过一次，结果是说明描述默认值、面板显示 localStorage 里存的那份，
          两边说的不是一回事（老用户看到「说明说 W/A/S/D、面板里却是方向键」）。
        */}
        <button
          type="button"
          onClick={() => setLegendOpen(true)}
          title={t('legend.open')}
          aria-label={t('legend.open')}
          className="pixel-edge pxw-2 bg-ink-800 p-1.5 text-ink-300 transition-colors hover:text-accent"
        >
          <HelpIcon size={13} />
        </button>

        {/*
          留言本。和地板上那本打开的是**同一个面板**（`FeedbackPanel`），
          只是这里才是正经入口 —— 地板上那本从此是彩蛋。

          按钮文案直接借面板的标题（`feedback.title` = 留言本 / Guestbook）：
          它就是这个按钮最准的两个字，没必要再起一个同义键。
          `feedback.open` 那句「翻一翻地上那本留言本」是**地板那本专属**的措辞，
          指路指向地板，用在这里会把人对到房间里去，所以不借。
        */}
        <button
          type="button"
          onClick={() => setFeedbackOpen(true)}
          title={t('feedback.title')}
          aria-label={t('feedback.title')}
          className="pixel-edge pxw-2 bg-ink-800 p-1.5 text-ink-300 transition-colors hover:text-accent"
        >
          <NoteIcon size={13} />
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
        {/*
          吊灯。**排在电视机之前** —— 整盏灯（灯具 + 光晕）都在机身背后：
          光晕糊在屏幕画面上就毁了；而窗口一矮天花板会贴到机身顶边，灯顶上去时
          也必须让**机身压住灯**，不能反过来挡着电视机（灯线会跟着窗口高度缩，
          见 globals.css 的 .lamp-cord）。
        */}
        <RoomLamp
          on={lampOn}
          onToggle={toggleLamp}
          label={t(lampOn ? 'lamp.turnOff' : 'lamp.turnOn')}
        />

        {/* 电视机。右侧那个卡带架 2026-10-09 撤掉了（历史挪进游戏库弹窗） */}
        <div className="relative flex items-end gap-4">
          {/*
            墙上的窗户。挂在这一层（= 电视机的盒子）上，窗户就永远贴着机身左上角。
            排在 RetroTv 之前 → 被机身挡住，只从左侧和上方露出两条。

            窗外是**四季**（靠 `<html data-season>` 切），**点玻璃换下一季** ——
            `cycleSeason` 只写属性和 localStorage，不经过 React（和吊灯同一套路）。
          */}
          <RoomWindow onCycleSeason={cycleSeason} label={t('window.cycle')} />

          {/*
            墙上的日历。和窗户同一层、同样排在 RetroTv 之前 —— 挂在机身右侧那片空墙上
            （窗户占了左边）。**纯装饰**，不能点：留言本已经挪到地板上那摊杂物里了。
          */}
          <RoomCalendar />

          {/*
            地板铺在场景内部而不是视口上：这样地板线永远贴着物件的落地线，
            不会随窗口高度切到家具身上。
            向下铺 200vh 并让 main 的 overflow 裁掉，避免物件下方又露出墙面。

            墙地交界线按 **DESK_HEIGHT 再往下让**一段（原来是 `-150px`）：
            电视机摆在桌子上，桌子站在地板上 —— 交界线要落在**桌腿底端**，
            桌子才不是陷在地里。桌子是 absolute、不占布局，所以这里只能手算这个偏移。
          */}
          <div
            className="floor pointer-events-none absolute -inset-x-[600px] h-[200vh] bg-floor"
            style={{ top: `calc(100% + ${DESK_HEIGHT}px)` }}
          >
            <div className="absolute inset-x-0 top-0 h-[2px] bg-ink-800" />
          </div>

          {/* 桌子。`top-full` 挂在电视机下沿，腿向下伸到地板上 */}
          <RoomDesk />

          {/*
            地板上那摊杂物（红白机 / 手柄 / 黄卡带 / 一本留言本 / 右下角那张纸片）。
            **必须排在桌子之后** —— 它在桌子前面，压在桌腿上；排前面就会被桌子挡住，
            像嵌进桌子里。它自己锚在墙地交界线（`top-full` + DESK_HEIGHT），
            不占布局、也不影响机身。

            这摊里能点的有两处：**留言本**和右下角那张**纸片**（点开「一张纸」，
            见文件末尾那个弹窗）。

            其中**留言本已经退成彩蛋**：留言本的正经入口挪到了右侧开关栏那颗（同一面板），
            这里纯粹是「顺手在房间里点到了也会开」的隐藏彩蛋。纸片则是唯一的入口，照旧。
          */}
          <RoomFloorItems
            onOpenNote={() => setNoteOpen(true)}
            noteLabel={t('note.open')}
            onOpenFeedback={() => setFeedbackOpen(true)}
            feedbackLabel={t('feedback.open')}
          />

          <RetroTv
            canvasRef={canvasRef}
            screenRef={screenRef}
            rom={rom}
            /*
              房主报「没在玩」之后流可能还在路上，所以屏幕上放什么由 remotePlaying
              说了算 —— 光看流有没有到会有一小段「已经弹卡了但还显示旧画面」。
            */
            remoteStream={netplayState.remotePlaying ? remoteStream : null}
            remotePlaying={netplayState.remotePlaying}
            remotePaused={netplayState.remotePaused}
            paused={paused}
            busy={busy}
            loading={loading}
            canLoad={saves.length > 0}
            volume={volume}
            fileOver={fileOver}
            onPickFile={() => romInputRef.current?.click()}
            onDragOver={() => setFileOver(true)}
            onDragLeave={() => setFileOver(false)}
            onDropFile={handleDropFile}
            onTogglePause={() => void togglePause()}
            onSave={() => void saveState()}
            onLoad={() => void openLoad()}
            onReload={() => void reset()}
            onEject={() => void eject()}
            onVolume={changeVolume}
            onExitFullscreen={exitFullscreen}
          />
        </div>
      </div>

      {/*
        存档列表。刻意浮在房间上、**不进屏幕** —— 屏幕里跑的是游戏画面，
        盖一张列表上去就把画面挡了；而且它是要点选的面板，不该占着显像管。
        屏幕里只放**状态提示**（怎么开始玩 / RELEASE TO LOAD / 载入进度 / PAUSED），
        要读的说明一律走这种弹窗。存档列表尤其如此 —— 它是要点选的东西，
        而且从 2026-10-10 起它也是读档**唯一**的入口（F8 那个快捷键撤了）。

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
              {/* 计数走 font-pixel：全是数字，没有掉字形的问题 */}
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
        屏幕里跑的是游戏画面，这张面板要写字、还要输入房间码。
      */}
      <NetplayPanel
        open={netplayOpen}
        state={netplayState}
        busy={netplayBusy}
        mode={netplayMode}
        onModeChange={setNetplayMode}
        quality={streamQuality}
        onQualityChange={changeStreamQuality}
        onClose={() => setNetplayOpen(false)}
        onCreate={() => void createRoom()}
        onJoin={(code) => void joinRoom(code)}
        onLeave={() => void leaveRoom()}
      />

      {/*
        自定义按键面板。和上面两块一样浮在房间上、不进屏幕。
        role + localPlaying 决定底部那句提示：加入者用的是他自己那套（1P 组）、改完立刻生效；
        但他要是自己在房主出画面之前插了一盘，那盘也按同一组读键盘，一样要重载卡带。
        `rom !== null` 就是「本机跑着一盘自己的卡带」，同时也是重载按钮的可用条件。

        `role` 还决定**页签锁在哪一组**：联机时只能改自己那组（两边都是 1P 那组），
        所以面板在房间里只画一个标签、不给切换。见 KeyBindingsPanel 的 lockedPlayer。
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
        在线游戏库。和上面三块一样浮在房间上、不进屏幕。
        弹窗里两个 tab：「游戏库」是在线列表（选中的那盘由父级记 loadingId，
        弹窗据此把卡片置灰、并显示下载进度），「历史」是本机载入过的卡带 ——
        数据直接用父级的 `library`（和卡带历史同一份），面板自己不再去翻一遍 IndexedDB。
      */}
      {libraryOpen && (
        <GameLibraryPanel
          loadingId={libraryLoadingId}
          progress={libraryProgress}
          cartridges={library}
          activeId={activeId}
          onPick={(game) => void loadRemoteGame(game)}
          /*
            从「历史」里挑一盘本机卡带：**先关面板再载入** —— ROM 就在 IndexedDB 里，
            没有下载那一段要给用户看进度（远程那盘正好相反，得留着面板显示进度条）。
          */
          onPickCartridge={(id) => {
            setLibraryOpen(false);
            void loadFromLibrary(id);
          }}
          onRemoveCartridge={(id) => void removeFromLibrary(id)}
          onClose={() => setLibraryOpen(false)}
        />
      )}

      {/*
        按键说明。原先是一块常驻在电视机右上角上方（`pointer-events-none`）的文字，
        现在收进右侧那排开关里的问号按钮 —— 它本来就只是给人读的，占着一块地方还压机身。

        和上面几块面板一样浮在房间上、**不进屏幕**。压缩格式那条提示也挂在这儿：
        载入失败在屏幕上是静默的，这是唯一还能说出「为什么没反应」的地方。
      */}
      {legendOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => setLegendOpen(false)}
        >
          <div className="absolute inset-0 bg-ink-950/70" />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('legend.title')}
            className="relative w-[420px] max-w-full bg-ink-800 pixel-edge pxw-4 pxc-600"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b-2 border-ink-900 bg-ink-850 px-4 py-3">
              <span className="text-[12px] text-ink-200">{t('legend.title')}</span>
              <button
                type="button"
                aria-label={t('legend.close')}
                onClick={() => setLegendOpen(false)}
                className="pixel-edge pxw-2 pxc-500 ml-auto flex h-[18px] w-[18px] items-center justify-center bg-ink-700 text-[10px] leading-none text-ink-100 hover:bg-danger hover:text-ink-950"
              >
                ×
              </button>
            </div>

            {/*
              系统字体 11px，**不用 font-pixel**：里面有 ↑↓←→ 和小键盘名，
              而 Press Start 2P 没有箭头字形，那几个会掉回系统字体、和旁边的
              `J`、`Enter` 混排出两种字形。
            */}
            <div className="flex flex-col gap-2 p-4 text-[11px] leading-relaxed text-ink-300">
              <p>{playerLegend(bindings.p1, 1, t)}</p>
              <p>{playerLegend(bindings.p2, 2, t)}</p>
              {/*
                这里原来还有一行 `legend.shortcut`（P 暂停 / R 重置 / F5 存档 / F8 读档）。
                快捷键 2026-10-10 全撤了，那行文案跟着删掉 —— 留着就是教用户去做一件
                现在不会有任何反应的事。暂停 / 重置 / 存档 / 读档都在机身前面板上，
                按钮上写的字和这里原来那句一模一样，不需要再说明一遍。
              */}
              {archiveHint && <p>{t('legend.needZip', { ext: archiveHint })}</p>}

              {/*
                重看操作指引。**先关自己再开指引** —— 两个弹窗的层级不一样
                （这里 z-50，指引 z-[60]），虽然指引会盖在上面，但留着这个面板
                会让底下那颗「按键说明」按钮一直保持按下态，收尾时不好看。
              */}
              <button
                type="button"
                onClick={() => {
                  setLegendOpen(false);
                  setTourOpen(true);
                }}
                className="pixel-edge pxw-2 pxc-500 mt-1 self-start bg-ink-700 px-3 py-1.5 text-[11px] text-ink-100 transition-colors hover:bg-ink-600 hover:text-accent"
              >
                {t('tour.replay')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/*
        「一张纸」。点地板右下角那张纸片弹出来的。

        它和别的面板不是一路货：那些是工具，这张纸只是一句祝福。所以刻意做成
        **游戏里过场提示**的样子 —— 整个窗口糊掉（backdrop-blur），中间浮起一张纸。
        点背板或 Esc 关掉。

        **背板用固定暗色，不走 ink 令牌**（别的面板都是 `bg-ink-950/70`）：
        ink-950 会随主题翻，浅色主题下它是近白（#f1f1f4），45% 叠上去整屏变成一片白雾
        —— 用户报「纸片打开时不能纯白」就是指这个。过场提示本来就该把世界压暗。

        纸是**物件**，颜色全写死（和地板杂物、吊灯一个规矩），不跟主题翻 ——
        白天夜里它都是这张米黄的纸。**刻意用 `#e8dcbd` 而不是更浅的纸色**：
        用户明确要「不能纯白」，所以给足黄味。

        **纸上铺的是作业本那种横线**（`.note-rules`，globals.css）：
        一行 30px、线在行内 23px 处，正文 `leading-[30px]` 正好**坐在线上**。
        书写区高 240 = 30 × 8 行，顶底都收在整行边界上，不会切出半条线。

        正文走 `font-pixel`：英文是真像素字；**中文没有像素字模**，
        会掉回系统等宽字体（和屏幕里那句提示同一个取舍，见 RoomBackdrop 顶部那段）。
      */}
      {noteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => setNoteOpen(false)}
        >
          {/* 背板：模糊 + 压暗。固定暗色 —— 理由见上面那段 */}
          <div className="absolute inset-0 bg-[#0b0b10]/55 backdrop-blur-[3px]" />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('note.title')}
            className="relative w-[400px] max-w-full bg-[#e8dcbd] pixel-edge pxw-4 pxc-paper"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 折角：右上角折下去的那一块（外暗内亮，读起来是纸被翻起来一个角） */}
            <span aria-hidden className="absolute right-0 top-0 h-[18px] w-[18px] bg-[#cdbb92]" />
            <span aria-hidden className="absolute right-[5px] top-[5px] h-[8px] w-[8px] bg-[#f0e7cf]" />

            {/* 书写区：作业本横线 + 写在线上的字 */}
            <div className="note-rules mx-10 my-8 h-[240px]">
              <p className="font-pixel text-[12px] leading-[30px] text-[#3b3327]">
                {t('note.text')}
              </p>
            </div>

            {/* 关掉。压在纸的右下角，用纸色系做底、深棕做字 */}
            <button
              type="button"
              aria-label={t('note.close')}
              onClick={() => setNoteOpen(false)}
              className="absolute bottom-[12px] right-[12px] flex h-[24px] w-[24px] items-center justify-center bg-[#d6c69e] text-[13px] leading-none text-[#6b5c3c] transition-colors hover:bg-[#3b3327] hover:text-[#e8dcbd]"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/*
        留言本。点地上那本弹出来 —— 和存档 / 联机 / 按键几块面板同一套视觉，
        但内容是从 `/api/feedback` 拉的（公开），并且自带提交框。
        列表状态全在面板内部：每次打开都是全新挂载；翻页进度和已拉过的页靠
        `FeedbackPanel` 文件里那份**模块级页缓存**跨挂载保留，父级一概不碰
        （缓存必须挂在模块上 —— 挂组件里的话「关掉再打开」就白费了，而 D1 请求有限额）。
      */}
      {feedbackOpen && <FeedbackPanel onClose={() => setFeedbackOpen(false)} />}

      {/*
        操作指引。挂在所有弹窗**之后**、层级也最高（z-[60]，其余是 z-50）——
        它要能圈住右侧那排开关（z-40）和整台机身，还要把底下的点击全吃掉。
        初次访问由上面那个 effect 自动打开，之后从「按键说明」里的按钮重看。
      */}
      <OnboardingTour open={tourOpen} onClose={closeTour} />

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
    </main>
  );
}
