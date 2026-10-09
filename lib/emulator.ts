'use client';

import { Nostalgist } from 'nostalgist';
import { installAudioTap } from './audio-tap';
import { bindingsToRetroArch, DEFAULT_BINDINGS, type KeyBindings } from './keybindings';

/*
 * 音频旁路要赶在核心启动之前装好 —— 核心一启动就会建 AudioContext 并把音频节点
 * 接到 destination 上，晚了就截不到那一次 connect。
 * 放在模块顶层就够了：这里是唯一会 launch 的地方，而且补丁本身是惰性的
 * （没有节点往 destination 连过就什么都不做）；服务端没有 AudioNode，会直接返回。
 */
installAudioTap();

export type ConsoleType = 'nes' | 'snes' | 'arcade';

export interface LoadedRom {
  name: string;
  console: ConsoleType;
  size: number;
}

/**
 * 机种识别失败。
 * 这里只带错误码、不带成品文案 —— 文案由界面层按当前语言翻译，
 * 否则中文串会被写死在引擎层，切到英文时仍显示中文。
 */
export class UnsupportedRomError extends Error {
  constructor() {
    super('unsupported-rom');
    this.name = 'UnsupportedRomError';
  }
}

/**
 * 机种 → libretro 核心名。核心由 Nostalgist 从它自己的 CDN 拉
 * （`arianrhodsandlot/retroarch-emscripten-build@v1.22.2`），拉过一次之后进 CacheStorage。
 *
 * 街机刻意只挂 **fbneo** 一个：它一套 romset 覆盖 CPS1 / CPS2 / Neo Geo / 大量 8-16 位基板，
 * 是「一个核心管一大片」的那个。MAME 系（`mame2003_plus` 等）在同一个 CDN 上也有，
 * 但各自的 romset 版本互相不认，多挂一个只会多一类「拖进来没反应」。
 *
 * ⚠️ FBNeo 的 romset 是**版本锁死**的：zip 里的文件必须和核心期望的版本对得上，
 * 对不上就直接不加载（表现和「格式不支持」一样是静默的）。这不是这个项目能绕开的。
 */
const CORE_MAP: Record<ConsoleType, string> = {
  nes: 'fceumm',
  snes: 'snes9x',
  arcade: 'fbneo',
};

/** 扩展名 → 机种。仅在文件头识别失败时作为回退。 */
const EXTENSION_MAP: Record<string, ConsoleType> = {
  nes: 'nes',
  fds: 'nes',
  unf: 'nes',
  unif: 'nes',
  sfc: 'snes',
  smc: 'snes',
  swc: 'snes',
  fig: 'snes',
  bs: 'snes',
  zip: 'arcade',
};

const SNES_MIN_SIZE = 0x8000; // 32 KiB
const SNES_MAX_SIZE = 8 * 1024 * 1024;

/*
 * 键盘映射不再写死在这里 —— 它现在是用户可改的，默认值和换算规则都在
 * `lib/keybindings.ts`（默认 1P：方向键 / Z X / A S / Q E / Shift / Enter，
 * 2P：I J K L / U O / N M / G H / 数字行 1 2，两套完全不重叠）。
 *
 * 为什么这一张表是唯一的着力点：RetroArch 自己读键走它，联机注入
 * （`pressDown` → `getKeyboardCode` → 查同一张表）也走它，改一处两条路一起变。
 */

/** 音量档位上限：0 档是静音，这个档位是最大音量。 */
export const VOLUME_MAX = 6;

/**
 * 最大档的增益，单位 dB（0 dB = 原音量）。
 *
 * 刻意**不设成 0**：0 dB 是 RetroArch 的默认满音量，在浏览器里放 NES 游戏明显偏吵
 * —— 用户实测「最大档和倒数第二大档声音都很大」。低 6 dB 差不多就是响度砍半。
 */
const VOLUME_TOP_DB = -6;

/**
 * 相邻两档之间差多少 dB。这是**设计选择**，不是 RetroArch 的步长（见下）。
 *
 * 原来是 4 dB，用户反馈「音量控制不明显」—— 4 dB 的差距确实容易被当成没反应。
 * 6 dB 才是「一耳朵能听出来」的量级，1 档到 6 档总共 30 dB。
 */
const LEVEL_STEP_DB = 6;

/**
 * RetroArch 的 VOLUME_UP / VOLUME_DOWN 每次只走 0.5 dB —— 这是它的实现细节，
 * 和上面的**档位间距**是两码事，别混用（一步 6 dB 要发 12 条命令）。
 *
 * 而且**没有** SET_VOLUME 这类能直接赋值的命令（查过核心构建的命令名表，
 * 音量只有 VOLUME_UP / VOLUME_DOWN / MUTE），所以运行时只能按差值补够步数，
 * 当前值必须由我们自己记着。
 */
const RA_VOLUME_STEP_DB = 0.5;

/**
 * 档位 → dB。0 档不走这里（它靠静音开关表达），调用方一律传 Math.max(1, level)。
 * 6 档 = -6 dB（最大），1 档 = -36 dB（最小可听档）。
 */
function levelToDb(level: number): number {
  return VOLUME_TOP_DB - (VOLUME_MAX - level) * LEVEL_STEP_DB;
}

function ascii(bytes: Uint8Array, from: number, len: number): string {
  let out = '';
  for (let i = from; i < from + len && i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

/**
 * SNES ROM 在 0x7FC0 处存有一对互为反码的校验和。
 * base 为 0 表示无 copier header，为 0x200 表示带 512 字节 header。
 */
function hasSnesChecksum(bytes: Uint8Array, base: number): boolean {
  const off = base + 0x7fc0;
  if (off + 0x20 > bytes.length) return false;
  const complement = bytes[off + 0x1c] | (bytes[off + 0x1d] << 8);
  const checksum = bytes[off + 0x1e] | (bytes[off + 0x1f] << 8);
  return ((checksum ^ complement) & 0xffff) === 0xffff;
}

function looksLikeSnes(bytes: Uint8Array, size: number): boolean {
  if (size < SNES_MIN_SIZE || size > SNES_MAX_SIZE) return false;
  if (size % 0x8000 === 0 && hasSnesChecksum(bytes, 0)) return true;
  if ((size - 0x200) % 0x8000 === 0 && hasSnesChecksum(bytes, 0x200)) return true;
  return false;
}

export function consoleFromExtension(fileName: string): ConsoleType | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return EXTENSION_MAP[ext] ?? null;
}

/**
 * 识别 ROM 机种：优先看文件头 magic number，认不出再回退到扩展名。
 * 这样即便 ROM 被改过名，也不会挂错核心。
 */
export async function detectConsole(file: File): Promise<ConsoleType | null> {
  const head = new Uint8Array(await file.slice(0, 0x10000).arrayBuffer());

  // iNES / NES 2.0
  if (head[0] === 0x4e && head[1] === 0x45 && head[2] === 0x53 && head[3] === 0x1a) {
    return 'nes';
  }
  // Famicom Disk System
  if (ascii(head, 0, 3) === 'FDS' && head[3] === 0x1a) return 'nes';
  // UNIF
  if (ascii(head, 0, 4) === 'UNIF') return 'nes';

  /*
   * 街机 romset 本身就是一个 zip（本地文件头 `PK\x03\x04`）。
   *
   * 刻意读文件头而不是只看扩展名：romset 被人改过名字的情况太常见了。
   * 代价是「把一盘 NES ROM 压成 zip」也会被认成街机 —— 这种玩法在这个项目里
   * 不支持，会静默失败（FBNeo 读不出 .nes）。README 的「已知限制」里写明了。
   */
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
    return 'arcade';
  }

  if (looksLikeSnes(head, file.size)) return 'snes';

  return consoleFromExtension(file.name);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 偷看核心包的下载进度。
 *
 * 核心是 Nostalgist 从 CDN 拉的（第一次几 MB，之后进 CacheStorage 就快了），
 * 而它**不给任何进度回调** —— 拖进一盘卡带后界面会静默好几秒，这就是「没反应」的来源。
 *
 * 拿进度的办法是 `Response.clone()` 的分流能力：克隆出来的那一份专门读字节数，
 * **原始那一份原封不动还回去**，所以 Nostalgist 走的那条路一个字节都没变 ——
 * 最坏情况（读失败、拿不到长度）也只是没有进度，不会影响载入本身。
 *
 * 只认 URL 里带 `_libretro.zip` 的请求（核心包的固定命名），其余请求原样放行。
 * 核心已经在 CacheStorage 里时根本不会有这个请求，回调不触发，界面据此退回「不确定」进度。
 */
function watchCoreDownload(onProgress: (loaded: number, total: number) => void): () => void {
  const original = window.fetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await original.call(window, input, init);

    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('_libretro.zip') || !response.body) return response;

    const total = Number(response.headers.get('content-length')) || 0;
    const mirror = response.clone();

    void (async () => {
      const reader = mirror.body?.getReader();
      if (!reader) return;
      let loaded = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          loaded += value.byteLength;
          onProgress(loaded, total);
        }
      } catch {
        // 读失败就当作没有进度 —— 别影响已经还回去的那一份
      }
    })();

    return response;
  };

  return () => {
    window.fetch = original;
  };
}

export class EmulatorController {
  private instance: Nostalgist | null = null;
  private currentRom: LoadedRom | null = null;
  private paused = false;

  /**
   * 当前这套键位。只在 `loadRom` 里被写进 retroarchConfig。
   *
   * 也就是说**改完要重新插一次卡带才生效** —— RetroArch 的按键映射是启动时一次性
   * 读进核心的，没有能在运行时重载配置的接口（`getKeyboardCode` 虽然每次都会去
   * 读配置文件的 mtime，但那只影响我们自己发起的注入，改不了核心自己读键盘用的内存副本）。
   */
  private bindings: KeyBindings = DEFAULT_BINDINGS;

  /** 音量档位（0 = 静音，VOLUME_MAX = 原音量）。没有实例时也留着，插卡带时生效。 */
  private volumeLevel = VOLUME_MAX;
  /** 我们自己记着的当前 dB —— RetroArch 没有能读回音量的命令 */
  private volumeDb = levelToDb(VOLUME_MAX);
  private muted = false;

  get rom() {
    return this.currentRom;
  }

  get isPaused() {
    return this.paused;
  }

  get isRunning() {
    return this.instance !== null;
  }

  /**
   * 换一套键位。**不会**作用于正在跑的实例（见 `bindings` 的注释），
   * 下次 `loadRom` 才会带上新键位。
   */
  setBindings(bindings: KeyBindings): void {
    this.bindings = bindings;
  }

  /**
   * 插上卡带并启动。
   *
   * `onProgress` 是可选的：核心第一次要从 CDN 下几 MB，界面靠它画进度条
   * （实现见 `watchCoreDownload`）。不传就完全按老样子走。
   */
  async loadRom(
    file: File,
    canvas: HTMLCanvasElement,
    onProgress?: (loaded: number, total: number) => void
  ) {
    // 先退出正在运行的实例，避免多个核心叠加占用内存
    await this.exit();

    const consoleType = await detectConsole(file);
    if (!consoleType) {
      throw new UnsupportedRomError();
    }

    /*
     * 只在下核心包那段时间挂上观测，launch 一结束就摘掉 ——
     * 别让一个全局的 fetch 补丁一直留在页面上。
     */
    const stopWatching = onProgress ? watchCoreDownload(onProgress) : null;

    const nostalgist = await Nostalgist.launch({
      element: canvas,
      core: CORE_MAP[consoleType],
      rom: file,
      retroarchConfig: {
        ...bindingsToRetroArch(this.bindings),
        video_aspect_ratio_auto: true,
        video_windowed_fullscreen: false,
        // 单位是 dB，0 即原音量。此前设为 6.0（+6dB）会削波爆音。
        // 静音档刻意不用 -80 dB 表达，而是把音量停在最小可听档 + 打开静音开关 ——
        // 否则取消静音时要爬一百多步 VOLUME_UP 才回得来。
        audio_volume: levelToDb(Math.max(1, this.volumeLevel)),
        audio_mute_enable: this.volumeLevel === 0,
        input_overlay_enable: false,
      },
      size: { width: canvas.width, height: canvas.height },
      style: {
        width: '100%',
        height: '100%',
      },
    }).finally(() => stopWatching?.());

    this.instance = nostalgist;
    this.currentRom = {
      name: file.name,
      console: consoleType,
      size: file.size,
    };
    this.paused = false;

    // 记下这次启动实际用的音量 —— 运行时的 VOLUME_UP / VOLUME_DOWN 都是相对调整，
    // 基准必须和启动配置对上，否则档位和实际响度会越走越偏。
    this.volumeDb = levelToDb(Math.max(1, this.volumeLevel));
    this.muted = this.volumeLevel === 0;
  }

  /**
   * 抓一份快照交给调用方。
   * **存哪儿不归引擎管** —— 存档槽（每 ROM 五份、超出顶掉最早的）由 lib/saves.ts 负责，
   * 引擎只做两件事：产出一份 Blob、吃下一份 Blob。
   */
  async saveState(): Promise<Blob | null> {
    if (!this.instance) return null;
    const { state } = await this.instance.saveState();
    return state;
  }

  /** 载入一份快照。从槽位里取出来的是 Blob，导入的文件是 File —— File 也是 Blob。 */
  async loadStateFrom(data: Blob | ArrayBuffer): Promise<boolean> {
    if (!this.instance) return false;
    try {
      await this.instance.loadState(data);
      return true;
    } catch (e) {
      console.error('读取存档失败', e);
      return false;
    }
  }

  /** 导出存档。传入已有的快照可避免重复抓取。 */
  async downloadState(blob?: Blob): Promise<void> {
    if (!this.instance || !this.currentRom) return;
    const state = blob ?? (await this.instance.saveState()).state;
    downloadBlob(
      new Blob([state], { type: 'application/octet-stream' }),
      `${this.currentRom.name.replace(/\.[^.]+$/, '')}.state`
    );
  }

  async togglePause(): Promise<void> {
    if (!this.instance) return;
    // pause / resume 是同步的，返回 void
    if (this.paused) {
      this.instance.resume();
      this.paused = false;
    } else {
      this.instance.pause();
      this.paused = true;
    }
  }

  async reset(): Promise<void> {
    if (!this.instance) return;
    // Nostalgist 暴露的是 restart()，并没有 reset()
    this.instance.restart();
  }

  /**
   * 设定音量档位（0 = 静音，VOLUME_MAX = 原音量），返回夹紧后的档位。
   * 没有正在运行的实例时只记下来 —— 下次 loadRom 会把它作为 audio_volume 的初值。
   */
  setVolume(level: number): number {
    const next = Math.max(0, Math.min(VOLUME_MAX, Math.round(level)));
    this.volumeLevel = next;

    const instance = this.instance;
    if (!instance) return next;

    // 静音用 MUTE 开关表达，而不是把 dB 拉到 -80：
    // 后者要一百多步 VOLUME_DOWN 才爬得到，取消静音时还得再爬回来。
    if (next === 0) {
      if (!this.muted) {
        instance.sendCommand('MUTE');
        this.muted = true;
      }
      return next;
    }

    if (this.muted) {
      instance.sendCommand('MUTE');
      this.muted = false;
    }

    const target = levelToDb(next);
    const delta = target - this.volumeDb;
    // 按 RetroArch 的 0.5 dB/步补够条数：跨一档（6 dB）就是 12 条
    const steps = Math.round(Math.abs(delta) / RA_VOLUME_STEP_DB);
    if (steps > 0) {
      const command = delta > 0 ? 'VOLUME_UP' : 'VOLUME_DOWN';
      for (let i = 0; i < steps; i += 1) instance.sendCommand(command);
    }
    this.volumeDb = target;

    return next;
  }

  /**
   * 把某个手柄钮按下 / 松开。联机时用来把**对方**的输入打进本机的另一个玩家位。
   *
   * 注意这是事件级注入（Nostalgist 没有帧级钩子），所以只能做到「对方一按这边就跟着按」，
   * 做不到逐帧锁步。局域网内 RTT 通常在个位数毫秒，实际手感够用；
   * 但两端一旦不同步（比如一边暂停了），错误不会自己纠正 —— 这是当前方案的天花板。
   */
  pressButton(button: string, player: number, down: boolean): void {
    const instance = this.instance;
    if (!instance) return;
    // 必须传对象形式 `{ button, player }`。
    // 上层 Nostalgist.pressDown 只接受**一个**参数：
    //   pressDown(options) {
    //     if (typeof options === "string") return emulator.pressDown(options);
    //     return emulator.pressDown(options.button, options.player);
    //   }
    // 写成 pressDown(button, player) 会命中字符串分支，player 被静默丢掉、
    // 在底层退回默认值 1 —— 表现就是「对方怎么按都没用」。
    const options = { button, player };
    if (down) instance.pressDown(options);
    else instance.pressUp(options);
  }

  async exit(): Promise<void> {
    const instance = this.instance;

    // 先把引用清干净再动手：下面任何一步抛异常，控制器也不会留着一个半死的实例，
    // isRunning 立刻变 false，界面不会卡在「还插着卡带」的状态。
    this.instance = null;
    this.currentRom = null;
    this.paused = false;

    if (!instance) return;

    try {
      // 先发一次 PAUSE_TOGGLE 再退出。
      // 这条命令和面板上的「暂停」走的是同一条路径，一定能停住画面和声音；
      // 万一核心构建的 exit() 没有真正终止 runtime（nostalgist 内部用
      // try/catch 把 exit 的异常吞掉了，出错时它照样会把状态标成 terminated），
      // 至少不会让用户看到游戏还在跑。
      instance.pause();
    } catch (e) {
      console.warn('退出前暂停失败', e);
    }

    try {
      // removeCanvas 必须为 false：canvas 由 React 渲染和管理，
      // 若让 Nostalgist 把它从 DOM 移除，React 后续会拿到脱离文档的节点。
      instance.exit({ removeCanvas: false });
    } catch (e) {
      console.warn('退出模拟器时出错', e);
    }
  }
}
