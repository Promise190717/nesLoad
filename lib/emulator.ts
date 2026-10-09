'use client';

import { Nostalgist } from 'nostalgist';
import { resolveArcadeCore } from './arcade-core';
import { installAudioTap } from './audio-tap';
import { NEOGEO_BIOS_NAME } from './bios';
import {
  bindingsToRetroArch,
  DEFAULT_BINDINGS,
  type ButtonName,
  type KeyBindings,
} from './keybindings';

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
 * 街机实际用哪个核心**不在这里定** —— `loadRom` 会先跑 `resolveArcadeCore()`
 * （见 `lib/arcade-core.ts`），在 `fbneo` 和 `fbalpha2012_cps1` 之间按 romset 内容挑。
 * 这里的 `'fbneo'` 只是**兜底默认值**。
 *
 * 为什么是这两个：fbneo 一套 romset 覆盖 CPS1 / CPS2 / Neo Geo / 大量 8-16 位基板；
 * 但它的 CPS1 romset 比老 FBA 改过名，还砍掉了一批 hack 驱动 —— 那些只有
 * `fbalpha2012_cps1`（FBA 0.2.97.42）认。两个核心都放在 `public/cores/`。
 *
 * ⚠️ 两个核心的 romset 都是**版本锁死**的：zip 里的文件必须和核心期望的版本对得上，
 * 对不上就直接不加载（表现和「格式不支持」一样是静默的）。这不是这个项目能绕开的。
 */
const CORE_MAP: Record<ConsoleType, string> = {
  nes: 'fceumm',
  snes: 'snes9x',
  arcade: 'fbneo',
};

/**
 * 街机核心的**本站路径**（`public/cores/`）。
 *
 * NES / SFC 的核心仍由 Nostalgist 从 jsdelivr 拉（一直正常，不动它）；只有街机改走本地。
 * `fbneo` / `fbalpha2012_cps1` 两个核心都是从 Nostalgist 用的**同一个构建**里取出来的
 * （`arianrhodsandlot/retroarch-emscripten-build@v1.22.2` 的 `retroarch/<core>_libretro.zip`），
 * 所以核心本身没换，换掉的只是「运行时去哪儿拿这几十 MB」。
 *
 * 走本地的理由：核心包是整个项目里**唯一在运行时才去下载**的东西
 * （fbneo 解出来 36 MB 的 wasm、fbalpha2012_cps1 是 3.4 MB），而 jsdelivr 在国内经常
 * 连不上或被限速 —— 拉不动就是「拖进去毫无反应」。放进 `public/` 之后这一段就再没有网络变量了。
 *
 * 文件名必须和核心名严格对上：`<core>_libretro.js` / `<core>_libretro.wasm`。
 * 以后再加核心，同样从上面那个仓库的 `retroarch/<core>_libretro.zip` 里解出来放这儿。
 */
const LOCAL_CORE_DIR = '/cores';

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
 * `lib/keybindings.ts`，那里也写清了「为什么换算以 RetroArch 为准」。
 *
 * 为什么这一张表是唯一的着力点：RetroArch 自己读键走它，联机注入
 * （`pressDown` → 我们换掉的解码器，见 `overrideInjectionKeyMap`）也走它，
 * 改一处两条路一起变。
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

/**
 * 认出「网上常见、但这个项目不吃」的压缩格式。
 *
 * 街机 romset 大量以 `.7z` / `.rar` 流通，而 FBNeo 只认 `.zip`。这两种在
 * `detectConsole` 里会落到「机种认不出」—— 如果就这么静默失败，用户根本想不到
 * 是压缩格式的问题（他会以为是 ROM 坏了或者模拟器不行）。这个函数存在的意义，
 * 就是给那种情况一句准话。
 */
export async function unsupportedArchive(file: File): Promise<'7z' | 'rar' | null> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());

  // 7z: 37 7A BC AF 27 1C
  if (
    head[0] === 0x37 &&
    head[1] === 0x7a &&
    head[2] === 0xbc &&
    head[3] === 0xaf &&
    head[4] === 0x27 &&
    head[5] === 0x1c
  ) {
    return '7z';
  }

  // RAR: "Rar!" + 1A 07（4.x 及更早）或 1A 07 01（5.x）
  if (ascii(head, 0, 4) === 'Rar!' && head[4] === 0x1a && head[5] === 0x07) {
    return 'rar';
  }

  return null;
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
 * 只认 URL 里带 `_libretro.zip`（Nostalgist 从 CDN 拉的核心包）或 `_libretro.wasm`
 * （街机改走本地之后拉的是这个）的请求，其余请求原样放行。核心已经在 CacheStorage 里、
 * 或者走的是本地小文件时，回调可能一次都不触发，界面据此退回「不确定」进度。
 */
function watchCoreDownload(onProgress: (loaded: number, total: number) => void): () => void {
  const original = window.fetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await original.call(window, input, init);

    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const isCorePayload =
      url.includes('_libretro.zip') || url.includes('_libretro.wasm');
    if (!isCorePayload || !response.body) return response;

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

/**
 * 注入用的「配置键名 → DOM code」解码器。`Emulator.getKeyboardCode` 在 d.ts 里是
 * private，而我们只是**替换**它、不碰任何内部状态，所以用最小结构类型绕开可见性检查，
 * 而不是去改 Nostalgist 的类型定义。
 */
type KeyboardCodeHook = {
  getKeyboardCode: (button: string, player?: number) => string | undefined;
};

/**
 * 把 Nostalgist 的解码器换成我们自己的。**只影响联机注入这条路。**
 *
 * Nostalgist 自己那份（`getKeyboardCode`）把 `num*` / `keypad*` **解反了** —— 认为
 * `num4` 是小键盘、`keypad4` 是字母上方那排数字行，正好和 RetroArch
 * （`input/input_keymaps.c`）相反。而联机注入**全靠它**：房主把对方的钮名喂给
 * `pressDown`，它去查配置拿到键名、再解成一个 DOM code，最后合成键盘事件给核心。
 * 于是默认键位里 P2 那几个**小键盘**面键（`keypad1`…）被它解成 `Digit1`…，
 * 合成出来的事件和核心认的键对不上 —— 表现就是**联机时方向键能动、面键全死**
 * （方向键走具名表，解出来是 `ArrowUp` 这类，恰好没被解错）。
 *
 * 不跟它的解码表绕：注入要的 DOM code 本来就是**这次启动写进配置的那份键位**，
 * 而 `KeyBindings` 里存的值就是 `KeyboardEvent.code`，直接取，一步到位。
 * 这也顺带把「配置里写了什么、注入就合成什么」钉死在自己手里 —— 以后加机种 / 加钮，
 * 都不用再去管它的解码表。
 *
 * `launched` 必须是**启动那一刻**的快照：`setBindings` 会在运行中立刻改
 * `this.bindings`（键位面板就是直接调的），而核心读的是启动时那份配置，两者会短暂
 * 不一致。注入要是跟着新的走，就会合成一个核心根本不认的键 —— 那还不如原来。
 */
function overrideInjectionKeyMap(nostalgist: Nostalgist, launched: KeyBindings): void {
  const hook = nostalgist.getEmulator() as unknown as KeyboardCodeHook;
  hook.getKeyboardCode = (button, player = 1) =>
    (player === 1 ? launched.p1 : launched.p2)[button as ButtonName];
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
   *
   * `bios` 也是可选的，目前只有街机用得上：FBNeo 跑 Neo Geo 游戏时要去 system 目录
   * 找 `neogeo.zip`，拿不到就直接不加载。这盘 BIOS 由用户自己拖进来（见 lib/bios.ts），
   * 引擎只负责把它交给 Nostalgist —— 存哪儿、从哪儿取，不归引擎管。
   */
  async loadRom(
    file: File,
    canvas: HTMLCanvasElement,
    onProgress?: (loaded: number, total: number) => void,
    bios?: File | null
  ) {
    // 先退出正在运行的实例，避免多个核心叠加占用内存
    await this.exit();

    const consoleType = await detectConsole(file);
    if (!consoleType) {
      throw new UnsupportedRomError();
    }

    /*
     * 街机不带 BIOS 时不拦 —— CPS1 / CPS2 那类本来就不需要，拦了反而把它们也挡住。
     * 只在 console 里说一句，因为 Neo Geo 游戏缺 BIOS 的失败是**完全静默**的
     * （核心不报错、界面照常出雪花），没有这句话就彻底没有排查入口。
     */
    if (consoleType === 'arcade' && !bios) {
      console.warn(
        '[nesload] 街机 ROM 启动时没有 BIOS。如果这是 Neo Geo 游戏（合金弹头、拳皇、侍魂…），' +
          '它需要 neogeo.zip —— 把 neogeo.zip 拖进页面就能装上；CPS1 / CPS2 那类不需要。'
      );
    }

    /*
     * 街机要多做一步：**决定用哪个核心、romset 叫什么名字、喂哪份字节**。
     *
     * 三件事都可能变：
     *   - 核心：FBA 0.2.97.42（`fbalpha2012_cps1`）多出 9 个 FBNeo 没有的 hack 驱动；
     *   - 名字：FBNeo / FBA 拿 zip 的文件名当驱动名，网上流通的 romset 经常被改过名；
     *   - 内容：如果 zip 里 rom 的**名字**和驱动期望的对不上（内容是对的），
     *     `resolveArcadeCore` 会把 zip 重打包一遍补上名字 —— 核心自己不校验 CRC，
     *     只认名字，所以这是唯一能救「内容对、名字错」那类的办法。
     *
     * 判定依据、两张表的来历、重打包的细节都在 `lib/arcade-core.ts` / `lib/zip.ts` 里。
     * NES / SFC 不掺和，照旧走 `CORE_MAP`。
     */
    let core = CORE_MAP[consoleType];
    let romFileName = file.name;
    let romContent: Blob = file;
    if (consoleType === 'arcade') {
      const resolved = await resolveArcadeCore(file);
      core = resolved.core;
      romFileName = resolved.fileName;
      romContent = resolved.content;
      /*
       * 街机失败是**完全静默**的（屏幕照常出雪花、核心也不抛异常，FBNeo 只把错误画在画面里），
       * 所以这次到底选了哪个核心、romset 被叫成什么、有没有动过字节，必须留一行日志
       * —— 这是唯一的排查入口。
       */
      const why =
        resolved.reason === 'name'
          ? '文件名即驱动名，内容已核对'
          : resolved.reason === 'content'
            ? '文件名不是驱动名，按内容认出来的'
            : resolved.reason === 'rewritten'
              ? '按内容认出来的，并重写了 zip 里的 rom 名'
              : '没认出来，按原名交给核心';
      const from = resolved.container ? `，取自整合包内层「${resolved.container}」` : '';
      console.info(
        `[nesload] 街机核心：${core}（本站 ${LOCAL_CORE_DIR}/），` +
          `romset 名「${romFileName}」（${why}）${from}`
      );
      if (/[^\x20-\x7e]/.test(romFileName.replace(/\.[^.]+$/, ''))) {
        console.warn(
          `[nesload] romset 名「${romFileName}」里含非 ASCII 字符。FBNeo / FBA 都用文件名认驱动，` +
            '改名后大概率找不到 —— 把 zip 恢复成原始 romset 名（kof98.zip、dino.zip 这种）再试。'
        );
      }
    }

    /*
     * 街机核心走本站静态文件（`public/cores/`）；NES / SFC 不传这两个 resolve，
     * 保持走 Nostalgist 的 CDN —— 只改出问题的街机，不动正在正常工作的那两条路。
     *
     * 参数类型写 `unknown` 是刻意的：Nostalgist 把这两个回调的参数声明成
     * `NostalgistCoreDict | string`（那个类型没导出，我们引不到），而它实际传进来的
     * **永远是核心名字符串** —— `updateCore()` 里是 `resolver(core, options)`，
     * `core` 就是我们传的 `'fbneo'` / `'fbalpha2012_cps1'`。手写成 `string` 会踩逆变检查
     * （`NostalgistCoreDict` 不能赋给 `string`）编译不过；改成让上下文推断，
     * 模板串里又会出现对象类型、同样报错。`unknown` 两头都绕开。
     */
    const coreSource =
      consoleType === 'arcade'
        ? {
            resolveCoreJs: (name: unknown) => `${LOCAL_CORE_DIR}/${String(name)}_libretro.js`,
            resolveCoreWasm: (name: unknown) =>
              `${LOCAL_CORE_DIR}/${String(name)}_libretro.wasm`,
          }
        : {};

    /*
     * 只在下核心包那段时间挂上观测，launch 一结束就摘掉 ——
     * 别让一个全局的 fetch 补丁一直留在页面上。
     */
    const stopWatching = onProgress ? watchCoreDownload(onProgress) : null;

    // 用 `| null` 初值而不是裸声明：catch 分支必然 rethrow，赋值一定发生，
    // 但这样写省得跟 TS 的 try/catch 控制流分析较劲。
    let nostalgist: Nostalgist | null = null;
    try {
      nostalgist = await Nostalgist.launch({
        element: canvas,
        core,
        /*
         * ROM 也必须以 `{ fileName, fileContent }` 的形式给，理由和下面的 BIOS 完全一样：
         * 直接传 File 会走 ResolvableFile 的 `isBlob` 分支，而那条路**不读 File.name**，
         * 最终落到 `generateValidFileName()` 生成一个随机名（`data<随机>.zip`）写进 content 目录。
         *
         * 对 NES / SFC 无所谓（核心按内容识别），但 **FBNeo / FBA 都是拿 zip 的文件名
         * （去扩展名）当 romset 名去查驱动表的** —— 名字变成 `data<随机>` 就查不到任何游戏，
         * 屏幕上是核心自己画的「Romset is unknown.」，跟 romset 版本、内容对不对全都无关。
         *
         * 名字用 `romFileName` 而不是 `file.name`：街机的那个名字可能是
         * `resolveArcadeCore()` 按内容认出来纠正过的（见 `lib/arcade-core.ts`）。
         *
         * 内容同理用 `romContent`：街机那盘可能是**重打包过**的（补了 zip 里的 rom 名），
         * 也可能取自整合包的内层 zip。NES / SFC 下它恒等于 `file`，没有额外开销。
         */
        rom: { fileName: romFileName, fileContent: romContent },
        ...coreSource,
        /*
         * BIOS 只能以 `{ fileName, fileContent }` 的形式给。
         *
         * 直接传 File 对象会走 ResolvableFile 的 `isBlob` 分支，而那条路**不读 File.name**
         * （`isBlob` 在 `loadFileSystemFileHandle` 之前），最后落到 `generateValidFileName()`
         * 生成一个随机名（`data<随机>.zip`）—— 文件被写进 system 目录时名字不对，
         * FBNeo 照样找不到。所以名字必须自己钉死。
         *
         * （nostalgist.d.ts 里那段注释写成 `filename` 是笔误，实现读的是 `fileName`。）
         */
        bios: bios ? { fileName: NEOGEO_BIOS_NAME, fileContent: bios } : undefined,
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
      });
    } catch (e) {
      /*
       * 屏幕里没有任何地方能报错，日志是唯一的排查入口 —— 少了它，
       * 「拖进去没反应」就只剩雪花屏这一条线索。
       */
      console.error(
        `[nesload] 启动核心失败：${file.name}（${consoleType} / ${core}）`,
        e
      );
      throw e;
    } finally {
      stopWatching?.();
    }

    this.instance = nostalgist;
    /*
     * 注入用的解码器在这里换掉（见 `overrideInjectionKeyMap`）。
     * 快照必须**在这里**取：`this.bindings` 之后随时会被键位面板改掉，
     * 而核心认的始终是这次启动写进去的那份。
     */
    overrideInjectionKeyMap(nostalgist, this.bindings);
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

  /**
   * 载入一份快照。存档槽里存的就是 Blob（`lib/saves.ts` 不做 base64 膨胀）。
   * 入参留着 `ArrayBuffer` 是因为 Nostalgist 的 `loadState` 两种都收，
   * 现在实际只会走 Blob 这一条（面板上的「导入 .state」2026-10-09 已撤）。
   */
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

  /**
   * 把快照下载成 `.state` 文件。传入已有的快照可避免重复抓取。
   *
   * 面板上那个「导出」按钮 2026-10-09 撤了，现在只剩一个调用点：
   * 存档时 IndexedDB 不可用（隐私模式等）的**兜底** —— 存不进去就退化成下载。
   */
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
   * 钮名 → 键名的换算由 `overrideInjectionKeyMap` 换过的那份解码器负责（启动时装的），
   * 所以这里喂进来的钮名只要在键位表里，就一定能合成出核心认的那个键。
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
