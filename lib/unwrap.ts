/**
 * 「压缩包伪装成 ROM」的拆包。
 *
 * ## 为什么需要它
 *
 * 网上流通的 ROM 有两个很常见的形态，`detectConsole` 都接不住：
 *
 *   1. **文件名是 `.zip`，里面装着一盘 NES / SFC ROM**（`super-mario.zip` 里是 `.nes`）；
 *   2. **文件名是 ROM 扩展名，内容其实是 zip**（`jojos-bizarre-adventure-snes.smc`
 *      前四字节是 `PK\x03\x04`，解出来才是一盘真 `.smc`）。
 *
 * 第 2 种更阴 —— 拖进来看着像正常 ROM，实际 `detectConsole` 读文件头会把它判成**街机**
 * （任何 `PK\x03\x04` 都当 romset），然后交给 FBNeo 拿文件名当驱动名查表，查不到就
 * **完全静默地失败**（屏幕照旧出雪花，核心不抛异常）。用户只会觉得「这游戏不能玩」。
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
 * ## 为什么不顺手支持 7z / rar
 *
 * 那两种要引 wasm 解压器（EmulatorJS 是自托管 280 KB 的 7z + 241 KB 的 unrar），
 * 是另一个量级的改动，先不混在这里。
 */

import { baseName, inflateEntry, readZipEntries } from './zip';

/**
 * 命中这些扩展名才认为「内层是一盘单机 ROM」。
 *
 * 和 `lib/emulator.ts` 的 `EXTENSION_MAP` 是**同一批**，但这里刻意不复用那个表：
 * 那张表是「扩展名 → 机种」的回退映射，把 `zip` 也映到了街机；这张是「像 ROM 吗」，
 * 语义不同，混用会让以后加机种时两边打架。
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
]);

/**
 * 解压后允许的最大体积。
 *
 * SNES 的 ROM 上限是 8 MB（`SNES_MAX_SIZE`），NES 更小。放到 32 MB 是给改版 / 合集留余量，
 * 同时挡住「拖进来一个几百 MB 的整合包、每个条目都试着解一遍」这种开销。
 */
const MAX_UNWRAP_BYTES = 32 * 1024 * 1024;

export interface UnwrappedRom {
  /** 解出来的 ROM。**文件名用内层条目的 basename** —— 那才是这盘 ROM 的真名 */
  file: File;
  /** 内层条目在 zip 里的完整名字（可能带 `dir/` 前缀），只用来打日志 */
  innerName: string;
}

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

/**
 * 如果是「装着单机 ROM 的压缩包」，把 ROM 解出来；否则返回 `null`。
 *
 * 只处理**顶层就是 zip** 的情况（`PK\x03\x04`）。嵌套（zip 里还有 zip）不碰 ——
 * 那种形态基本只出现在街机整合包里，归 `resolveArcadeCore` 的「挖一层」管。
 */
export async function unwrapRom(file: File): Promise<UnwrappedRom | null> {
  // 先看文件头，不是 zip 直接走人 —— 绝大多数 ROM 到这一步就返回了，零开销
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (!(head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)) {
    return null;
  }

  const entries = await readZipEntries(file);
  if (!entries) return null;

  const candidates = entries.filter((entry) => {
    if (entry.name.endsWith('/')) return false; // 目录条目
    if (entry.size === 0 || entry.size > MAX_UNWRAP_BYTES) return false;
    if (entry.name.startsWith('__MACOSX/')) return false; // macOS 打包垃圾

    const base = baseName(entry.name);
    if (base.startsWith('.')) return false; // `.DS_Store` / `._foo`
    return ROM_EXTENSIONS.has(extensionOf(base));
  });

  if (candidates.length === 0) return null;

  /*
   * 有多个候选时取**最大**的那个。
   *
   * 单机 ROM 包通常只有一个；但「游戏 + 说明书 + 一堆小 hack」这种合集也存在，
   * 而主 ROM 一定是里面最大的那个。取最大是最省事又不容易错的挑法。
   */
  let pick = candidates[0];
  for (const entry of candidates) {
    if (entry.size > pick.size) pick = entry;
  }

  const blob = await inflateEntry(file, pick);
  if (!blob) return null;

  /*
   * 文件名用内层 basename，不带目录。
   *
   * 两个用处：`detectConsole` 认不出文件头时会回退到扩展名（内层名才有正确扩展名），
   * 以及街机那边**拿文件名当驱动名** —— 虽然这条路只服务 NES / SFC，但保持
   * 「文件名是这盘 ROM 的真名」这条规矩能让日志和排查都简单。
   */
  const innerName = baseName(pick.name);
  return { file: new File([blob], innerName), innerName: pick.name };
}
