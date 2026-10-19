/*
 * CHD 光盘镜像的**结构自检**（只读文件头，不解压任何数据）。
 *
 * 为什么需要这一层：PS1 的盘是全站最大的文件（常见 200–500 MiB），而 `.chd` 的
 * **hunk 映射表（map）放在文件最末尾**。下载链路只要断一次，拿到的就是一个尾部缺失的
 * 文件 —— 核心侧 `chd_open()` 读 map 时短读，返回错误，`retro_load_game()` 于是
 * 返回 false，RetroArch **静默退回主菜单**（屏幕上只有「Select which core to use.」，
 * 连一句「载入失败」都没有）。这条失败路径在界面上和「游戏启动成功但没画面」长得一样，
 * 没有自检就只能靠猜。
 *
 * 校验的是**最便宜也最有效**的那一处：`mapoffset + 16 + mapbytes` 必须落在文件长度之内。
 *
 * ⚠️ **不能**拿 `hunk 数 × 12` 去比 —— CHD v5 的 map 在**压缩盘上是压缩存储**的：
 *    `mapoffset` 处先是一个 16 字节的头（`mapbytes` / `firstoffs` / `mapcrc` /
 *    `lengthbits` / `selfbits` / `parentbits`），压缩数据紧随其后，长度就是 `mapbytes`。
 *    拿 12 字节一条去算会得出「所有 chd 都缺 map」的假结论（2026-10-19 踩过）。
 *    未压缩的 v5 盘（header 里四个 codec 全 0）map 才是 `hunk 数 × 4`，那种这里不判，
 *    直接放行 —— 站点上的盘全是压缩的，没必要为它多写一条易错的路径。
 *
 * 字段偏移来自 MAME 的 `chd_header`（v5，`length` = 124，不含 8 字节 tag 之外的扩展）：
 *   0x00 tag(8) · 0x08 length(4) · 0x0C version(4) · 0x10 compression[4](16)
 *   0x20 logicalbytes(8) · 0x28 mapoffset(8) · 0x30 metaoffset(8)
 *   0x38 hunkbytes(4) · 0x3C unitbytes(4)
 */

/** `MComprHD`。 */
const CHD_TAG = [0x4d, 0x43, 0x6f, 0x6d, 0x70, 0x72, 0x48, 0x44];

/** v5 的头恒为 124 字节，多读 4 字节当余量。 */
const HEADER_BYTES = 128;

/** 压缩 map 的那 16 字节头。 */
const MAP_HEADER_BYTES = 16;

/**
 * 自检结论。
 *
 * `not-chd` / `unknown` 都是**放行**：前者根本不是 CHD（交给调用方按别的格式处理），
 * 后者是「我们没把握判」的版本 / 布局（宁可让它进核心，也不要误杀一个正常文件）。
 */
export type ChdIntegrity = 'ok' | 'truncated' | 'not-chd' | 'unknown';

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
      0)
  );
}

/**
 * 读 64 位大端。
 *
 * 用 `Number` 而不是 `BigInt`：文件偏移不会超过 2^53（9 PB），而这个函数的返回值
 * 要直接和 `Blob.size` 比大小，混进 BigInt 只会让调用点多一堆转换。
 */
function readU64BE(bytes: Uint8Array, offset: number): number {
  return readU32BE(bytes, offset) * 0x1_0000_0000 + readU32BE(bytes, offset + 4);
}

/**
 * 判一个 Blob 是不是**结构完整**的 CHD v5。
 *
 * 只读两小段（文件头 128 字节 + map 头 16 字节），`Blob.slice()` 不会把整个文件
 * 读进内存，所以对 500 MiB 的盘也没有额外开销。
 */
export async function checkChdIntegrity(file: Blob): Promise<ChdIntegrity> {
  if (file.size < HEADER_BYTES) return 'not-chd';

  const head = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  if (head.length < HEADER_BYTES) return 'not-chd';
  for (let i = 0; i < CHD_TAG.length; i += 1) {
    if (head[i] !== CHD_TAG[i]) return 'not-chd';
  }

  const version = readU32BE(head, 12);
  // v1–v4 的 map 布局是另一套（每条 16 字节、无压缩），不在这一层的判据里。
  if (version !== 5) return 'unknown';

  /*
   * 有 codec ⇒ map 是压缩存储的（见文件头那段）。四个槽全 0 的未压缩盘放行。
   */
  const compressed = [16, 20, 24, 28].some((offset) => readU32BE(head, offset) !== 0);
  if (!compressed) return 'unknown';

  const mapOffset = readU64BE(head, 40);
  // 0 表示 map 还没写过（只出现在正在创建的盘上），不是我们该管的文件。
  if (mapOffset === 0) return 'unknown';

  if (mapOffset + MAP_HEADER_BYTES > file.size) return 'truncated';

  const mapHead = new Uint8Array(
    await file.slice(mapOffset, mapOffset + MAP_HEADER_BYTES).arrayBuffer()
  );
  if (mapHead.length < MAP_HEADER_BYTES) return 'truncated';

  const mapBytes = readU32BE(mapHead, 0);
  return mapOffset + MAP_HEADER_BYTES + mapBytes > file.size ? 'truncated' : 'ok';
}
