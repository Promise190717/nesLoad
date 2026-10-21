/**
 * 7z 解压 worker —— **wasm 版**（2026-10-21 从 EmulatorJS 那份 asm.js 换过来）。
 *
 * ## 换掉的是什么
 *
 * 原来用的是 `public/compression/extract7z.js`，EmulatorJS 4.2.3 的产物，
 * 一份 280 KB 的 **asm.js**（emscripten 的 asm.js 后端）。本机 Node 实测：
 * 266 MB 的 PS1 包（解出 692 MB）它要几分钟，wasm 版只要 **16 秒**。
 * asm.js 那条路上「解压」是真实的瓶颈 —— 用户在 `/play` 上看到的就是十几秒
 * 到几分钟的死屏。
 *
 * ## 换成了什么
 *
 * `7zz.umd.js` + `7zz.wasm` = 7-Zip 24.09 官方源码用 emcc 编的 wasm
 * （npm `7z-wasm@1.2.0`，MIT + 7-Zip License）。1.6 MB 的 wasm，比原来那份 asm.js
 * 大一些，但**只在真的遇到 7z 包时才下载**，而且跑完就随 worker 一起销毁。
 *
 * ## 为什么不用 `FS.writeFile` 把包塞进去（这条才是重点）
 *
 * 7z 包本身就有 200–300 MB。原来那条路（以及 7z-wasm README 里的示例）都是
 * `FS.writeFile(name, bytes)` —— 那等于**在 wasm 侧再放一份**。主线程为了拿字节
 * 还得先 `blob.arrayBuffer()`，再加一份。一来二去，一台 PS1 光「把包塞进去」
 * 就白占 500 MB 以上。
 *
 * 这里改用 emscripten 的 **WORKERFS**：它把 `Blob` 直接挂成一个只读文件，读的时候
 * 才 `FileReaderSync` 取那一段（`Blob.slice` 是引用，`FileReaderSync` 是 worker 里
 * 才有的同步读）。**输入侧一次复制都没有**，挂上去就是零成本。
 *
 * ⚠️ WORKERFS 的 `mount` 里写着 `assert(ENVIRONMENT_IS_WORKER)` —— 必须在本文件
 * 这种 worker 上下文里挂。这正是我们把 7z 放在 worker 里的原因之一。
 *
 * ## 输出侧：为什么不 slice 一份再交出去
 *
 * MEMFS 扩容是几何的（小于 1 MiB 时翻倍，之后每次 1.125 倍），所以解出来的
 * 692 MB 文件实际占 702.9 MB —— `Uint8Array` 的 `byteLength` 是 692，
 * 背后 `buffer` 是 702.9。`FS.readFile` 返回的正是这个**精确长度、共享 buffer 的视图**。
 *
 * 于是这里直接把 `bytes` 本体 `postMessage` 出去（带 transfer，移交所有权），
 * 主线程收到的是一个 `length === 692 MB` 的视图 —— **精确**，后面 `createDataFile`
 * 也按视图长度接管，多出来的 10.9 MB 只是容量浪费，不影响内容。
 *
 * 反过来「先 `slice()` 成精确 buffer 再交」要多复制一整盘（692 MB）。
 * 「把 MEMFS 的扩容改成精确分配」也试过：7-Zip 是边写边扩的（不是先 truncate 到
 * 最终大小），精确分配直接退化成 O(n²) —— 同一个包 16.2 s 变 74.1 s，内存 3.8 GB。否决。
 *
 * ## 协议
 *
 * 和原来那份 EJS worker **完全一致**，`lib/unwrap.ts` 那边只改了「怎么把包传进来」：
 *
 *   · **收**：`Blob`（7z 的整份字节）；
 *   · **发**：`{t:4, current, total}` 进度（百分比 0–100）
 *            `{t:2, file, size, data}` 每个条目（`data` 已 transfer）
 *            `{t:1}` 全部解完
 *            `{t:9, message}` 失败（原协议没有这一条，靠 worker 的 uncaught error，
 *            但在 async 流程里未捕获的 rejection 不会触发 `onerror`，会静默挂住）
 *
 * ⚠️ 进度是从 **stdout 字符流**里抠的：7z 的进度是 `\b\b\b\b 12%` 这种不换行的
 * 形式，emscripten 的 `print`（行缓冲）永远等不到换行，只能接管 `stdout` 逐字符。
 * 只有进度字符会走这条路（`-bso0` 关掉了文件列表），开销可以忽略。
 */
'use strict';

/* 产物在同一目录：会定义全局 `SevenZip`（async 工厂），wasm 由 `locateFile` 取。 */
importScripts('7zz.umd.js');

const IN_DIR = '/in';
const IN_NAME = 'rom.7z';
const OUT_DIR = '/out';

/** 上一次报过的百分比。7z 的进度会回退重画，只让上报值单调上升。 */
let lastPercent = -1;

function reportProgress(percent) {
  if (!(percent >= 0 && percent <= 100)) return;
  if (percent <= lastPercent) return;
  lastPercent = percent;
  self.postMessage({ t: 4, current: percent, total: 100 });
}

/** 进度字符的尾巴。最多留 3 位数字 + 前导空格，够 `100%` 用。 */
let progressTail = '';

const CHAR_PERCENT = 37; // '%'
const CHAR_BACKSPACE = 8;

/**
 * `stdout` 逐字符回调 —— 只用来抠进度。
 *
 * 7-Zip 的进度形如 `\b\b\b\b 12%`：退格把上一次的数字擦掉再画新的。所以遇到
 * 退格 / 回车 / 换行就把尾巴清空，遇到 `%` 就从尾巴上读数字。
 */
function onStdoutCode(code) {
  if (code === CHAR_PERCENT) {
    const match = /(\d{1,3})$/.exec(progressTail);
    progressTail = '';
    if (match) reportProgress(Number(match[1]));
    return;
  }
  if (code === CHAR_BACKSPACE || code === 10 || code === 13) {
    progressTail = '';
    return;
  }
  progressTail = (progressTail + String.fromCharCode(code)).slice(-3);
}

/** 把输出目录整个走一遍，返回 `{path, rel}` —— `rel` 是相对路径，只用来打日志 / 落盘名。 */
function walk(fs, dir, prefix, out) {
  for (const name of fs.readdir(dir)) {
    if (name === '.' || name === '..') continue;
    const path = dir + '/' + name;
    if (fs.isDir(fs.stat(path).mode)) {
      walk(fs, path, prefix + name + '/', out);
    } else {
      out.push({ path, rel: prefix + name });
    }
  }
  return out;
}

function describe(error) {
  if (!error) return 'unknown';
  return String(error.message || error);
}

self.onmessage = (event) => {
  const blob = event.data;
  if (!(blob instanceof Blob)) {
    self.postMessage({ t: 9, message: '输入不是 Blob' });
    return;
  }
  run(blob).catch((error) => {
    self.postMessage({ t: 9, message: describe(error) });
  });
};

async function run(blob) {
  /* 7z 打到 stderr 的行留一个短尾巴：解出 0 个文件时把最后几行带回去当诊断。 */
  const log = [];

  const mod = await self.SevenZip({
    locateFile: (path) => new URL(path, self.location.href).href,
    print: () => {},
    printErr: (line) => {
      log.push(line);
      if (log.length > 10) log.shift();
    },
    stdout: onStdoutCode,
  });

  const fs = mod.FS;

  // 输入：Blob 挂成只读文件，读的时候才按段取。见文件头那段。
  fs.mkdir(IN_DIR);
  fs.mount(fs.filesystems.WORKERFS, { blobs: [{ name: IN_NAME, data: blob }] }, IN_DIR);

  fs.mkdir(OUT_DIR);

  /*
   * `-bso0` 关掉文件列表（只留 `-bsp1` 的进度），`-bse1` 保留错误。
   * 7z 正常结束时不抛；非 0 返回码才抛，这里先接住 —— 判成功与否看**解出几个文件**，
   * 比解析返回码稳（CRC 警告这类在 7z 里也是非 0，但内容是好的）。
   */
  let threw = null;
  try {
    mod.callMain([
      'x',
      IN_DIR + '/' + IN_NAME,
      '-o' + OUT_DIR,
      '-y',
      '-bsp1',
      '-bso0',
      '-bse1',
    ]);
  } catch (error) {
    threw = error;
  }

  const files = walk(fs, OUT_DIR, '', []);
  if (files.length === 0) {
    const detail = [threw ? describe(threw) : '', log.join('\n')].filter(Boolean).join('\n');
    throw new Error(detail || '没解出任何文件');
  }

  /*
   * 逐个交出去。transfer 之后 `bytes.buffer` 就归主线程了，worker 这边那块
   * MEMFS 内容随即失效 —— 反正整个 worker 马上就结束，不用管。
   * 见文件头「输出侧」那段：这里**不 slice**，多出来的容量只是浪费。
   */
  for (const file of files) {
    const bytes = fs.readFile(file.path);
    self.postMessage({ t: 2, file: file.rel, size: bytes.length, data: bytes }, [bytes.buffer]);
  }

  self.postMessage({ t: 1 });
}
