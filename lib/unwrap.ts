/**
 * 「压缩包伪装成 ROM」的拆包。
 *
 * ## 为什么需要它
 *
 * 网上流通的 ROM 有几个很常见的形态，`detectConsole` 都接不住：
 *
 *   1. **文件名是 `.zip`，里面装着一盘单机 ROM**（`super-mario.zip` 里是 `.nes`）；
 *   2. **文件名是 ROM 扩展名，内容其实是 zip**（`jojos-bizarre-adventure-snes.smc`
 *      前四字节是 `PK\x03\x04`，解出来才是一盘真 `.smc`）；
 *   3. **文件名是 `.zip`，内容其实是 7z**（2026-10-15 追加支持，见下）。
 *
 * 第 2 种更阴 —— 拖进来看着像正常 ROM，实际 `detectConsole` 读文件头会把它判成**街机**
 * （任何 `PK\x03\x04` 都当 romset），然后交给 FBNeo 拿文件名当驱动名查表，查不到就
 * **完全静默地失败**（屏幕照旧出雪花，核心不抛异常）。用户只会觉得「这游戏不能玩」。
 *
 * ## 第 3 种（7z）是「宝可梦 珍珠打不开」的根因 —— 2026-10-15 加
 *
 * 它比第 2 种还难查：`PK\x03\x04` 那条判据对 7z 根本不命中，所以这里返回 `null`、
 * 原文件被交回去，`detectConsole` 一路落到**扩展名回退**，而
 * `EXTENSION_MAP['zip'] = 'arcade'` —— 于是又一个 7z 被当成街机 romset 喂给 FBNeo，
 * 屏幕上是 FBNeo 自己画的那句
 * `THIS IS NOT A BUG ! If you don't understand what this message means,`。
 * 实测证据与完整链路记在 `.workbuddy-ai/memory/REFERENCE.md`。
 *
 * ⚠️ **NDS / PS1 的 ROM 站大量用 7z**（单文件 + 自带封面），所以这不是个例。
 *
 * ## 判定原则：只拆「一眼能看出是单机 ROM」的包
 *
 * 街机 romset 也是 zip，**绝不能**被这里拆掉。区分办法是看**内层条目的扩展名**：
 * romset 里是 `p_1.3a` / `tk2_gfx1.rom` 这类名字，命中不了下面那张 ROM 扩展名表；
 * 而单机 ROM 压缩包内层是 `xxx.nes` / `xxx.smc`。所以只要按扩展名筛，两边天然不打架。
 *
 * 筛不出来就返回 `null`，调用方照旧走原来的路 —— 和 `lib/zip.ts` 一样，
 * **读不动就当没这回事，不能因为这里出错把原本能跑的弄挂**。
 *
 * ## rar 仍然不支持
 *
 * 那要再引一套 `libunrar.js` + `libunrar.wasm`（EmulatorJS 那边有现成的，
 * 走法和下面 7z 这条完全一样），先不做 —— 7z 才是实际踩到的那个。
 * 认不出 rar 时**至少要给用户一句准话**：`lib/emulator.ts` 的 `unsupportedArchive()`
 * 负责认出它，`/room` 和 `/play` 拿它显示提示。
 */

import { baseName, inflateEntry, readZipEntries } from './zip';

/**
 * 命中这些扩展名才认为「内层是一盘单机 ROM」。
 *
 * 和 `lib/emulator.ts` 的 `EXTENSION_MAP` 是**同一批**，但这里刻意不复用那个表：
 * 那张表是「扩展名 → 机种」的回退映射，把 `zip` 也映到了街机；这张是「像 ROM 吗」，
 * 语义不同，混用会让以后加机种时两边打架。
 *
 * ⚠️ 和那张表一样**不收 `.bin`**：它太泛（光盘镜像、各种裸 dump），
 * 收进来会让「装着一堆无关 bin 的压缩包」被当成 ROM 包拆开。
 */
const ROM_EXTENSIONS = new Set([
  // NES / Famicom
  'nes',
  'fds',
  'unf',
  'unif',
  // SNES
  'sfc',
  'smc',
  'swc',
  'fig',
  'bs',
  // Game Boy 一系（2026-10-14 加：gb / gbc 是当天新增的两个机种，GBA 早就在）
  'gb',
  'gbc',
  'gba',
  // NDS（2026-10-15 加）。⚠️ `.dsi` 不算 —— 那是 DSi 增强卡带，和 `.nds` 同一个核心，
  // 但网上几乎见不到，收进来只多一类会被解开的包
  'nds',
  // 世嘉
  'md',
  'gen',
  'smd',
  'gg',
  'sms',
  '32x',
  // 万代 / SNK 掌机
  'ws',
  'wsc',
  'ngp',
  'ngc',
]);

/**
 * 解压后允许的最大体积。
 *
 * ⚠️ **2026-10-15 从 32 MB 抬到 256 MB**，理由是原来那个数会让 NDS 直接失效：
 * NDS 卡带**最大就是 256 MB**（`宝可梦 珍珠` 那个包解出来是 64 MB 的 `.nds`），
 * 而 32 MB 是按 NES / SNES 定的。上限太小 → 候选被静默滤掉 → 这里返回 `null`
 * → `detectConsole` 退到扩展名 → 判成街机 → FBNeo 画 `THIS IS NOT A BUG !`。
 * 也就是说**光支持 7z 还不够，上限得跟着抬**（两个是同一个坑的两半）。
 *
 * 为什么是 256 而不是更大：这个数同时是「解出来之后要在内存里放得下」的门槛 ——
 * 7z 那条路会在 Worker 里解一份、postMessage 再克隆一份、最后 `new File()` 又拷一份，
 * 峰值是它的三倍上下。256 MB 的 ROM 在桌面浏览器上已经很吃力，手机上多半会崩；
 * 再往上放只会把「解不开」换成「整页卡死」，那更难查。
 */
const MAX_UNWRAP_BYTES = 256 * 1024 * 1024;

export interface UnwrappedRom {
  /** 解出来的 ROM。**文件名用内层条目的 basename** —— 那才是这盘 ROM 的真名 */
  file: File;
  /** 内层条目在压缩包里的完整名字（可能带 `dir/` 前缀），只用来打日志 */
  innerName: string;
  /** 外面那层壳是哪种 —— 只用来打日志（「是个 zip」/「是个 7z」，排查时一眼看出） */
  container: 'zip' | '7z';
}

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** zip 的本地文件头：`PK\x03\x04`。 */
function isZipHead(head: Uint8Array): boolean {
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}

/** 7z 的固定魔数：`37 7A BC AF 27 1C`。 */
function isSevenZipHead(head: Uint8Array): boolean {
  return (
    head[0] === 0x37 &&
    head[1] === 0x7a &&
    head[2] === 0xbc &&
    head[3] === 0xaf &&
    head[4] === 0x27 &&
    head[5] === 0x1c
  );
}

/**
 * 7z 解压 worker —— `public/compression/extract7z.js`。
 *
 * 这份是 **EmulatorJS 4.2.3 的产物**（`data/compression/extract7z.js`，
 * 280,155 B，sha1 `a336ae28f610defa758b1223bc65ae58eda534ef`），
 * emscripten 编的 **asm.js** 版 7z。
 *
 * 为什么从 EJS 拿而不是装 npm 包：`@emulatorjs/emulatorjs` 的 tgz 里**不含**这些产物
 * （和 NDS 核心那次一模一样的坑，见 `lib/emulator.ts` 的 NDS 注释），
 * 而 `cdn.emulatorjs.org` 上是现成的。落进 `public/` 之后运行时就不再依赖 CDN ——
 * 和核心、BIOS 同一条思路（理由见 `lib/emulator.ts` 的 `LOCAL_CORE_DIR`）。
 *
 * ⚠️ 缓存头在 `next.config.js` 里单独配了一条（`/compression/:path*`），
 * 换文件后要 purge CDN，和 `/cores`、`/bios` 一个规矩。
 */
const EXTRACT_7Z_WORKER = '/compression/extract7z.js';

/** 7z 解出来的一个条目。`data` 是 emscripten HEAP 上的 view，会被结构化克隆带过来。 */
interface SevenZipEntry {
  name: string;
  size: number;
  data: Uint8Array;
}

/**
 * 跑一次 7z 解压。
 *
 * ## 协议（EJS 那份 worker 定的，不是我们设计的）
 *
 *   · **收**：`postMessage(Uint8Array)` —— 7z 的**整份字节**（它内部写死解 `1.7z`）；
 *   · **发**：`{t:4, current, total}` 进度 / `{t:2, file, size, data}` 每个条目 /
 *            `{t:1}` 全部解完（发完它自己 `close()`）。
 *
 * ⚠️ **它没有「只解某一个条目」的选项**，一次全解 —— 所以 7z 里那些封面 png / nfo
 * 也会跟着解出来。这个包里有 3 张图共 82 KB，忽略不计。
 *
 * ⚠️ **asm.js 比 wasm 慢一个量级**：本机 Node 实测解那个 64 MB 的包用了 **14.6 秒**
 * （内存从 16 MB 自增到 128 MB）。浏览器里只会更慢，所以进度回调必须接上 ——
 * 否则用户看到的就是十几秒死屏。
 *
 * 失败一律 reject，由 `unwrapRom` 吞掉（见那边的注释）。
 */
function extractSevenZip(
  file: Blob,
  onProgress?: (ratio: number) => void
): Promise<SevenZipEntry[]> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(EXTRACT_7Z_WORKER);
    } catch (error) {
      reject(error);
      return;
    }

    const entries: SevenZipEntry[] = [];
    let settled = false;

    /* 收尾一律走这里：`terminate()` 幂等，`settled` 保证 resolve / reject 只落一次。 */
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      run();
    };

    worker.onmessage = (event: MessageEvent) => {
      const message = event.data as
        | { t: 1 }
        | { t: 2; file: string; size: number; data: Uint8Array }
        | { t: 4; current: number; total: number }
        | null;
      if (!message) return;

      if (message.t === 2) {
        entries.push({ name: message.file, size: message.size, data: message.data });
      } else if (message.t === 4) {
        if (onProgress && message.total > 0) onProgress(message.current / message.total);
      } else if (message.t === 1) {
        finish(() => resolve(entries));
      }
    };

    worker.onerror = (event) => {
      finish(() => reject(new Error(`7z worker error: ${event.message || 'unknown'}`)));
    };

    /*
     * 先转成 `Uint8Array` 再 postMessage：worker 那边是 `FS_createDataFile(..., e.data)`，
     * 它要的就是 typed array / ArrayBuffer。结构化克隆会复制这一份（十几 MB，可接受）——
     * ⚠️ EJS 那份 worker 没给 transfer list 的余地（postMessage 的参数是写死的），
     * 所以这里拿不到「零拷贝移交」。
     */
    void file
      .arrayBuffer()
      .then((buffer) => worker.postMessage(new Uint8Array(buffer)))
      .catch((error) => finish(() => reject(error)));
  });
}

/**
 * worker 回来的是 HEAP 上的 `Uint8Array`（也可能是 `ArrayBuffer`），两种都收。
 *
 * ⚠️ 返回类型写死 `Uint8Array<ArrayBuffer>` 而不是默认的 `ArrayBufferLike`，
 * 是给下面 `new File([...])` 用的：TS 5.7 起 `BlobPart` 只收背后是**独占**
 * `ArrayBuffer` 的视图，而 `ArrayBufferLike` 还含 `SharedArrayBuffer`（拿它建 File
 * 运行时会抛）。这里的字节是 worker **结构化克隆**回来的，到手的 buffer 一定独占，
 * 所以断言成立 —— 改写成 `.slice()` 也能过类型，但那要多复制一份整盘 ROM。
 */
function toBytes(data: Uint8Array | ArrayBuffer): Uint8Array<ArrayBuffer> {
  return (data instanceof Uint8Array ? data : new Uint8Array(data)) as Uint8Array<ArrayBuffer>;
}

/**
 * 一个条目「像不像主 ROM」。
 *
 * zip 和 7z 两条路共用这一条判据 —— 两边能解出来的东西不一样，但「什么才算 ROM」
 * 必须只有一种说法，否则以后加格式时又要各写一遍。
 */
function isRomEntry(name: string, size: number): boolean {
  if (name.endsWith('/')) return false; // 目录条目
  if (size === 0 || size > MAX_UNWRAP_BYTES) return false;
  if (name.startsWith('__MACOSX/')) return false; // macOS 打包垃圾

  const base = baseName(name);
  if (base.startsWith('.')) return false; // `.DS_Store` / `._foo`
  return ROM_EXTENSIONS.has(extensionOf(base));
}

/**
 * 挑出「最像主 ROM 的那一个」，挑不出来返回 `null`。
 *
 * 单机 ROM 包通常只有一个候选；但「游戏 + 说明书 + 一堆小 hack」这种合集也存在，
 * 而主 ROM 一定是里面最大的那个。取最大是最省事又不容易错的挑法。
 */
function pickRomEntry<T extends { name: string; size: number }>(entries: readonly T[]): T | null {
  let pick: T | null = null;
  for (const entry of entries) {
    if (!isRomEntry(entry.name, entry.size)) continue;
    if (!pick || entry.size > pick.size) pick = entry;
  }
  return pick;
}

/**
 * 如果是「装着单机 ROM 的压缩包」，把 ROM 解出来；否则返回 `null`。
 *
 * 认两种壳：**zip**（`PK\x03\x04`）和 **7z**（`37 7A BC AF 27 1C`）。
 * 嵌套（zip 里还有 zip）不碰 —— 那种形态基本只出现在街机整合包里，
 * 归 `resolveArcadeCore` 的「挖一层」管。
 *
 * `onProgress` 只对 7z 那条路有效（zip 只解一个条目，快得没必要报进度）。
 * 值是 0–1 的比例，调用方接在「下载 ROM」那根进度条上。
 */
export async function unwrapRom(
  file: File,
  onProgress?: (ratio: number) => void
): Promise<UnwrappedRom | null> {
  /*
   * 先看文件头。读 8 个字节：zip 要 4 个，7z 要 6 个。
   * 绝大多数 ROM 到这一步就返回了（零开销）。
   */
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());

  if (isSevenZipHead(head)) {
    let entries: SevenZipEntry[];
    try {
      entries = await extractSevenZip(file, onProgress);
    } catch (error) {
      /*
       * 解不开（加密 / 分卷 / 内存不够 / worker 挂了）就当没这回事，
       * 原文件照旧交给 `detectConsole` —— 它会走扩展名回退。
       * ⚠️ 对 `.zip` 结尾的 7z 来说那条回退会判成**街机**（见文件头那段），
       *    所以这里必须留一行日志，否则排查时只剩 FBNeo 画的那句话。
       */
      console.warn('[nesload] 7z 解压失败，按原文件继续：', file.name, error);
      return null;
    }

    const pick = pickRomEntry(entries);
    if (!pick) {
      console.warn(
        `[nesload] 「${file.name}」是 7z，但里面没有认得出的 ROM 条目` +
          `（认的是 ${[...ROM_EXTENSIONS].join(' / ')}；单条上限 ${MAX_UNWRAP_BYTES / 1024 / 1024} MB）`
      );
      return null;
    }

    const innerName = baseName(pick.name);
    return {
      file: new File([toBytes(pick.data)], innerName),
      innerName: pick.name,
      container: '7z',
    };
  }

  if (!isZipHead(head)) return null;

  const entries = await readZipEntries(file);
  if (!entries) return null;

  const pick = pickRomEntry(entries);
  if (!pick) return null;

  const blob = await inflateEntry(file, pick);
  if (!blob) return null;

  /*
   * 文件名用内层 basename，不带目录。
   *
   * 两个用处：`detectConsole` 认不出文件头时会回退到扩展名（内层名才有正确扩展名），
   * 以及街机那边**拿文件名当驱动名** —— 虽然这条路只服务单机 ROM，但保持
   * 「文件名是这盘 ROM 的真名」这条规矩能让日志和排查都简单。
   */
  const innerName = baseName(pick.name);
  return { file: new File([blob], innerName), innerName: pick.name, container: 'zip' };
}
