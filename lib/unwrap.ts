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
 * PS1 那一条（2026-10-16 加）同理**只收单文件镜像**，`.cue` / `.m3u` / `.toc` / `.ccd`
 * 这些**描述文件**不收 —— 它们是纯文本、指向同目录的 `.bin`，拆出来也没法跑
 * （见 `lib/emulator.ts` 的 `unsupportedArchive`）。
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
  // PS1（2026-10-16 加，2026-10-19 补 `chd`）—— **只有单文件镜像**，理由见上面那段 ⚠️。
  // 这条特别要紧：上游那批 PS1 的 7z 里装的就是 `.pbp` / `.iso` / `.chd`（实测
  // `files.retrogamesnexus.com/games/roms/*.7z`），不加这一组那些包会被判成
  // 「机种认不出」而报 `UnsupportedRomError`。
  'pbp',
  'iso',
  'img',
  'chd',
]);

/**
 * 解压后允许的最大体积（**卡带 ROM 那一档**；光盘镜像走下面的
 * `MAX_DISC_IMAGE_BYTES`，由 `maxEntryBytes()` 按扩展名分派）。
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

/*
 * ---------------------------------------------------------------- 光盘套装
 *
 * 2026-10-19 加：**PS1 的 `.bin` + `.cue` 双文件镜像**。
 *
 * 为什么原来不收、现在收：站点的入口是「一个文件」，而 `.cue` 只是**描述文件**，
 * 它指向的 `.bin` 才是数据（见 `lib/emulator.ts` 的 `EXTENSION_MAP` 注释）。
 * 单拖一个 `.cue` 进来永远跑不了，所以那张表刻意不收它。
 *
 * 但**压缩包里装着这两个文件**是另一回事 —— 这一次两个都拿到了，完全能跑：
 * Nostalgist 的 `rom` 本来就支持数组（官方示例就是
 * `['game.m3u', 'game_cd1.chd', …]`），数组第一项是核心加载的那一个，
 * 其余的一起写进同一个内容目录。`pcsx_rearmed` 读 cue、按 cue 里的 `FILE "…bin"`
 * 找同目录的 bin —— 只要两个文件都放进去、名字和 cue 里写的一致就行。
 *
 * 判据刻意**只认 `.cue` 配 `.bin` / `.img`**（不认 `.m3u` / `.ccd`）：
 * `.m3u` 是多盘清单，里面还引用别的 `.cue`，要递归解一层；`.ccd` 还要配 `.sub`。
 * 这两类这次没遇到，先不做 —— 认不出就照旧返回 `null`，行为和以前完全一样。
 */
const DISC_DESCRIPTOR_EXTENSIONS = new Set(['cue']);
const DISC_DATA_EXTENSIONS = new Set(['bin', 'img']);

/** 描述文件（`.cue`）正常就几百字节；给 1 MB 已经极宽松，超了多半是认错了。 */
const MAX_DISC_DESCRIPTOR_BYTES = 1024 * 1024;

/**
 * 光盘数据文件（`.bin`）的上限。
 *
 * ⚠️ **这个数和 `MAX_UNWRAP_BYTES` 是两回事，别合并**：256 MB 那个是「普通 ROM 在
 *    内存里放三份还撑得住」的门槛，而 PS1 一张盘光裸数据就是 **300–700 MB**
 *    （MODE2/2352 的 74 分钟盘约 780 MB），按那个数卡会把绝大多数 PS1 游戏挡在外面
 *    —— 2026-10-19 那盘《数码宝贝 格斗竞技场》的 bin 就是 **252 MiB**，再大一点就没了。
 *
 * 800 MiB 是**内存现实**和「能覆盖多少盘」之间的折中（PS1 单盘上限也就 800 MB 上下）：
 * 解压出来是一个 Blob（浏览器多半落盘），但接下来 Nostalgist 要把它写进 Emscripten 的
 * MEMFS，那一步是**整份进内存**，再加上核心自己的堆，峰值大约是这个数的 2–3 倍。
 * 再往上放只会把「载入失败」换成「标签页被 OOM 杀掉」，后者更难查。
 *
 * ⚠️ **2026-10-19 从 512 抬到 800 MiB**：当天把库里 231 个 PS1 的 zip 全扫了一遍
 * （`pickDiscSet` 的判据 + 拉每个 zip 的中央目录），196 个带 bin 的包里 **85 个的 bin
 * 超过 512 MiB**，最大的 790 MiB（`langrisser-i-ii-cn.zip`）。512 会把其中四成挡在门外，
 * 而 PS1 的裸盘本来就是这个量级 —— 800 MiB 正好覆盖全部（CD 上限约 800 MB）。
 * 代价是内存：790 MiB 的盘在桌面上大约要 1.5–2 GB 峰值，手机基本没戏。
 *
 * 超限时**不静默**：`discDataWithinLimit` 会留一行日志，说明「有 cue 但 bin 太大」。
 */
const MAX_DISC_IMAGE_BYTES = 800 * 1024 * 1024;

/**
 * 这几个扩展名是**光盘镜像**，单个条目的体积上限按 `MAX_DISC_IMAGE_BYTES` 走。
 *
 * ⚠️ 2026-10-19 补：`pbp` / `iso` / `img` 一开始也挤在 256 MB 那个门槛里，只是当时
 * 遇到的盘都小；《激走！Tomarunner》的 `.chd` 是 **306 MB**，装进 zip 就会被静默滤掉
 * （表现和「包坏了」一模一样）。光盘镜像天生几百 MB，必须和卡带 ROM 分开算。
 */
const DISC_SINGLE_FILE_EXTENSIONS = new Set(['pbp', 'iso', 'img', 'chd']);

/** 单个条目解压后的体积上限：光盘镜像一档、其余一档。 */
function maxEntryBytes(name: string): number {
  const ext = extensionOf(baseName(name));
  return DISC_SINGLE_FILE_EXTENSIONS.has(ext) ? MAX_DISC_IMAGE_BYTES : MAX_UNWRAP_BYTES;
}

export interface UnwrappedRom {
  /** 解出来的 ROM。**文件名用内层条目的 basename** —— 那才是这盘 ROM 的真名 */
  file: File;
  /**
   * 要和主文件一起放进虚拟文件系统的**伴生文件**（现在只有光盘套装的 `.bin`）。
   *
   * 普通 ROM 是 `undefined`；`loadRom` 会把它们排进 Nostalgist 的 `rom` 数组
   * （第一项仍然是 `file`）。名字必须保持内层 basename —— `.cue` 里的
   * `FILE "xxx.bin"` 就是按这个名字找的。
   */
  companions?: File[];
  /**
   * 拆包之后就能确定的机种。**只有光盘套装会填 `'ps1'`**。
   *
   * 为什么不能交给 `detectConsole` 自己认：主文件现在是 `.cue`（纯文本、无魔数），
   * 而 `EXTENSION_MAP` 刻意不收 `cue`（直接拖一个 `.cue` 进来仍然应该是「认不出」）。
   * 两条路要区分开，所以「从包里解出来的」这一条自己把机种带上。
   */
  console?: 'ps1';
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
 * 280,155 B，原始 sha1 `a336ae28f610defa758b1223bc65ae58eda534ef`），
 * emscripten 编的 **asm.js** 版 7z。
 *
 * ⚠️ **2026-10-19 打过一次补丁**（现在 280,161 B / sha1
 * `a024708cbf62cb24c96a4c6ca815a154879ac3dd`）：它原来每个条目都是
 * `for (i=0;i<r;i++) n[i]=getValue(t+i)` 逐字节从堆里拷出来，再 `postMessage`
 * **不带 transfer list**（结构化克隆再复制一整份）。PS1 的 bin 动辄几百 MB，
 * 光那个逐字节循环就是几亿次调用。改成 `n.set(HEAPU8.subarray(t,t+r))` +
 * `postMessage(..., [n.buffer])`：拷贝从「逐字节」变成一次 `memcpy`，
 * 跨线程那一步变成**移交所有权**（worker 那边 `n` 随即失效，但它用完就丢，无所谓）。
 * ⚠️ 换这个文件时要记住补丁会丢 —— 重新从 EJS 拿的话得再打一遍。
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
  if (size === 0 || size > maxEntryBytes(name)) return false;
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
 * 挑出「一张光盘镜像」的**描述文件 + 数据文件**，挑不出来返回 `null`。
 *
 * 只在**压缩包里同时有 `.cue` 和 `.bin` / `.img`** 时命中（见上面「光盘套装」那段）。
 *
 * 多盘游戏（包里好几个 `.cue`）**只取第一张**：这一档的目的是「让它能启动」，
 * 换盘要另做一套 UI，不在这次范围里。挑法按文件名排序取第一个 —— 单盘包只有一个，
 * 多盘包这样至少是确定的（不会随 zip 条目顺序漂）。
 *
 * ⚠️ 这里**只负责认出「有没有 cue + 有没有数据文件」**，具体带哪几个 bin 交给
 *    `discDataWithinLimit()` 按 cue 里 `FILE "…"` 那几行收窄（2026-10-19 改）。
 *    原来是在这里按「和 cue 同名」猜，遇到 `(Track 1)` / `(Track 2)` 那种一条轨一个
 *    bin 的包就猜不中，只能退回「全带上」—— 多盘包会把另一张盘也解出来。
 */
function pickDiscSet<T extends { name: string; size: number }>(
  entries: readonly T[]
): { descriptor: T; data: T[] } | null {
  const usable = entries.filter(
    (entry) => !entry.name.endsWith('/') && !entry.name.startsWith('__MACOSX/')
  );

  const descriptors = usable.filter((entry) => {
    const base = baseName(entry.name);
    if (base.startsWith('.')) return false;
    if (!DISC_DESCRIPTOR_EXTENSIONS.has(extensionOf(base))) return false;
    return entry.size > 0 && entry.size <= MAX_DISC_DESCRIPTOR_BYTES;
  });
  if (descriptors.length === 0) return null;

  const allData = usable.filter((entry) => {
    const base = baseName(entry.name);
    if (base.startsWith('.')) return false;
    if (!DISC_DATA_EXTENSIONS.has(extensionOf(base))) return false;
    return entry.size > 0;
  });
  if (allData.length === 0) return null;

  descriptors.sort((a, b) => baseName(a.name).localeCompare(baseName(b.name)));
  return { descriptor: descriptors[0], data: allData };
}

/**
 * 从 cue 文本里读出它引用的数据文件名。
 *
 * cue 的写法就两种：`FILE "xxx.bin" BINARY` 和 `FILE xxx.bin BINARY`（引号可有可无），
 * 所以两种都收。取 **basename** —— 我们写进虚拟文件系统时是拍平的（不带目录），
 * cue 里的路径前缀也就没意义了。
 *
 * 为什么值得解析：一个 zip 里可能装着**好几张盘**（`Disc 1/`、`Disc 2/` 各一个 cue），
 * 也可能是**一条轨一个 bin**。不按 cue 收窄的话会把所有 bin 全解出来 —— 多盘包直接
 * 翻倍占用内存，而且核心只读第一个 cue，剩下的纯属浪费。
 */
function cueFileNames(text: string): string[] {
  const names: string[] = [];
  const re = /^[ \t]*FILE[ \t]+(?:"([^"]+)"|(\S+))/gim;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const raw = match[1] ?? match[2] ?? '';
    if (raw) names.push(baseName(raw));
  }
  return names;
}

/**
 * 按 cue 引用的名字收窄数据文件，并**把名字改成 cue 里写的那个**。
 *
 * 为什么连名字一起改：虚拟文件系统（Emscripten 的 MEMFS）**区分大小写**。zip 里可能
 * 是 `GAME.BIN`、cue 里写的是 `game.bin` —— 内容对得上、名字对不上，核心照样找不到。
 * 既然 cue 才是「谁引用谁」的权威，就按它写的名字落盘。
 *
 * 解析不出、或者一个都对不上时**原样返回全部**（名字用各自的 basename）—— 那种情况
 * 多半是名字被改过，交给核心自己按内容试，比我们瞎猜强。
 */
function narrowByCue<T extends { name: string }>(
  data: readonly T[],
  names: readonly string[]
): { entry: T; name: string }[] {
  const asIs = () => data.map((entry) => ({ entry, name: baseName(entry.name) }));
  if (names.length === 0) return asIs();

  const byName = new Map(data.map((entry) => [baseName(entry.name).toLowerCase(), entry]));
  const hit: { entry: T; name: string }[] = [];
  for (const name of names) {
    const entry = byName.get(name.toLowerCase());
    if (entry) hit.push({ entry, name });
  }
  return hit.length > 0 ? hit : asIs();
}

/**
 * 收窄之后再过一道体积门槛。超限返回 `null`（**并留日志**）。
 *
 * ⚠️ 顺序很重要：**先按 cue 收窄、再看大小**。反过来的话，多盘包里只要第二张盘
 * 超限，第一张也会被一起判死。
 */
function discDataWithinLimit<T extends { name: string; size: number }>(
  data: readonly T[],
  cueText: string
): { entry: T; name: string }[] | null {
  const picked = narrowByCue(data, cueFileNames(cueText));
  const oversized = picked.find((item) => item.entry.size > MAX_DISC_IMAGE_BYTES);
  if (oversized) {
    console.warn(
      `[nesload] 光盘镜像「${baseName(oversized.entry.name)}」有 ${(
        oversized.entry.size /
        1024 /
        1024
      ).toFixed(0)} MB，` +
        `超过单文件上限 ${MAX_DISC_IMAGE_BYTES / 1024 / 1024} MB，不拆包`
    );
    return null;
  }
  return picked;
}

/** 一张裸盘镜像（`.bin` / `.img`）至少要这么大才可能是光盘；再小的多半是别的东西。 */
const MIN_BARE_IMAGE_BYTES = 32 * 1024 * 1024;

/**
 * 挑出「**没有 cue、只有一个大 bin**」的裸盘镜像（2026-10-19 加）。
 *
 * 库里确实有这种包：`silent-bomber-cn.zip` / `langrisser-iv-cn.zip` /
 * `castlevania-symphony-of-the-night-cn.zip` 都是一个几百 MB 的 `.bin` 加几个说明文件，
 * 没有 cue。`pcsx_rearmed` 本来就能直接读 `.bin`（它自己会按 `CD001` 找扇区大小），
 * 所以这类包完全能跑，只是原来的白名单不认 `.bin` 而已。
 *
 * ⚠️ 判据必须**保守**，否则会把街机 romset 当成 PS1：romset 里 `.bin` 遍地都是。
 *    所以要求「**恰好一个** ≥ 32 MiB 的镜像文件，且其余条目都 ≤ 1 MiB」（说明 / 封面 / 存档）。
 *    街机 romset 要么没有这么大的单文件，要么还有一堆同量级的 rom。
 */
function pickBareDiscImage<T extends { name: string; size: number }>(
  entries: readonly T[]
): T | null {
  const usable = entries.filter(
    (entry) => !entry.name.endsWith('/') && !entry.name.startsWith('__MACOSX/')
  );
  const images = usable.filter((entry) => {
    const base = baseName(entry.name);
    if (base.startsWith('.')) return false;
    if (!DISC_DATA_EXTENSIONS.has(extensionOf(base))) return false;
    return entry.size >= MIN_BARE_IMAGE_BYTES && entry.size <= MAX_DISC_IMAGE_BYTES;
  });
  if (images.length !== 1) return null;

  const image = images[0];
  if (usable.some((entry) => entry !== image && entry.size > MAX_DISC_DESCRIPTOR_BYTES)) {
    return null;
  }
  return image;
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

    /*
     * 先试「光盘套装」（`.cue` + `.bin`）—— 7z 这条路一次全解出来了，字节现成，
     * 不需要额外解压。见上面「光盘套装」那段。
     */
    const disc = pickDiscSet(entries);
    if (disc) {
      const data = discDataWithinLimit(
        disc.data,
        new TextDecoder().decode(toBytes(disc.descriptor.data))
      );
      if (data) {
        return {
          file: new File([toBytes(disc.descriptor.data)], baseName(disc.descriptor.name)),
          companions: data.map((item) => new File([toBytes(item.entry.data)], item.name)),
          console: 'ps1',
          innerName: disc.descriptor.name,
          container: '7z',
        };
      }
    }

    /*
     * 没有 cue、只有一个大 bin 的裸盘镜像 —— 和 zip 那条一样，见 `pickBareDiscImage`。
     */
    const bare = pickBareDiscImage(entries);
    if (bare) {
      return {
        file: new File([toBytes(bare.data)], baseName(bare.name)),
        innerName: bare.name,
        container: '7z',
      };
    }

    const pick = pickRomEntry(entries);
    if (!pick) {
      console.warn(
        `[nesload] 「${file.name}」是 7z，但里面没有认得出的 ROM 条目` +
          `（认的是 ${[...ROM_EXTENSIONS].join(' / ')}；` +
          `卡带上限 ${MAX_UNWRAP_BYTES / 1024 / 1024} MB、光盘镜像 ${MAX_DISC_IMAGE_BYTES / 1024 / 1024} MB）`
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

  /*
   * 光盘套装（`.cue` + `.bin`）：**先于单文件 ROM 试**。
   *
   * 这两类不会打架 —— `.cue` / `.bin` 都不在 `ROM_EXTENSIONS` 里，单文件那条路
   * 本来也挑不出它们。顺序写成「先套装」只是为了让意图清楚：一个包里同时有
   * `.iso` 和 `cue+bin` 时，以套装为准（那是更完整的一份）。
   */
  const disc = pickDiscSet(entries);
  if (disc) {
    const descriptor = await inflateEntry(file, disc.descriptor);
    if (descriptor) {
      /*
       * 按 cue 里 `FILE "…"` 那几行收窄，再查体积（见 `discDataWithinLimit`）。
       * `text()` 只读那几百字节，不占内存。
       */
      const data = discDataWithinLimit(disc.data, await descriptor.text());
      if (data) {
        const companions: File[] = [];
        for (const item of data) {
          const blob = await inflateEntry(file, item.entry);
          if (!blob) {
            companions.length = 0;
            break;
          }
          companions.push(new File([blob], item.name));
        }
        if (companions.length > 0) {
          return {
            file: new File([descriptor], baseName(disc.descriptor.name)),
            companions,
            console: 'ps1',
            innerName: disc.descriptor.name,
            container: 'zip',
          };
        }
        console.warn(
          `[nesload] 「${file.name}」里有 cue，但数据文件解不出来（压缩方式不支持或已损坏）`
        );
      }
    }
  }

  /*
   * 没有 cue、只有一个大 bin 的裸盘镜像（见 `pickBareDiscImage`）。
   * 不带 `console` —— 交给 `detectConsole` 按 `CD001` 认，认不出就照旧报「机种认不出」。
   */
  const bare = pickBareDiscImage(entries);
  if (bare) {
    const bareBlob = await inflateEntry(file, bare);
    if (bareBlob) {
      return {
        file: new File([bareBlob], baseName(bare.name)),
        innerName: bare.name,
        container: 'zip',
      };
    }
  }

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
