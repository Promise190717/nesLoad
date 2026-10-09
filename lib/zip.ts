/**
 * 极简 zip 读写 —— 只为街机 romset 服务，不追求通用。
 *
 * 只做三件事：
 *   1. 列目录（`readZipEntries`）：拿每个条目的名字、CRC32、压缩数据的位置和长度；
 *   2. 按新名字重打包（`rebuildZip`）：**原样搬运压缩数据**，只重写两处名字字段；
 *   3. 取出单个条目（`inflateEntry`）：给「整合包往里挖一层」用。
 *
 * 为什么重打包时不动压缩数据：romset 动辄几 MB，解压再压一遍既慢、又可能压出核心
 * 不认的东西。而 zip 的每个条目在中央目录里**自带 CRC32**，搬运时一个字节都不用改，
 * 核心那边看到的还是同一份数据 —— 变的只有名字。
 *
 * 为什么能改名字就够：FBNeo / FBA 拿 zip 里的**文件名**去查驱动表，内容是靠名字定位的，
 * 它自己**不校验 CRC**。所以「内容对、名字不对」的 romset 只要把名字改对就能跑。
 *
 * 支持范围：单卷、非加密、非 zip64。其余一律返回 `null`，调用方退回原文件 ——
 * 读不动就当没这回事，不能因为这里出错把原本能跑的弄挂。
 */

const EOCD_SIG = 0x06054b50; // "PK\x05\x06" 中央目录结束记录
const CEN_SIG = 0x02014b50; // "PK\x01\x02" 中央目录条目
const LOC_SIG = 0x04034b50; // "PK\x03\x04" 本地文件头

const FLAG_ENCRYPTED = 0x0001;

/** zip64 用 0xffffffff 占位 —— 街机 romset 到不了那个尺寸，见到就放弃。 */
const ZIP64_SENTINEL = 0xffffffff;

/**
 * 写进 zip 的固定日期。刻意不写 0：DOS 日期里 day = 0 是非法的，
 * 有些解压工具会当成 1979-11-30 甚至直接报错。2020-01-01 干净。
 */
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;

export interface ZipEntry {
  /** 条目在 zip 里的**完整**名字（可能带 `dir/` 前缀） */
  name: string;
  /** 解压后数据的 CRC32（中央目录里现成的） */
  crc: number;
  /** 压缩后字节数 */
  compressedSize: number;
  /** 原始字节数 */
  size: number;
  /** 压缩方式：0 = store，8 = deflate */
  method: number;
  /** 压缩数据在文件里的偏移 */
  dataOffset: number;
}

/** 取 `a/b/c.bin` 的最后一段。 */
export function baseName(name: string): string {
  const i = name.lastIndexOf('/');
  return i >= 0 ? name.slice(i + 1) : name;
}

/**
 * 列目录。读不动（不是 zip、中央目录坏了、分卷、加密、zip64）返回 `null`。
 *
 * 只读中央目录 + 每个条目的 30 字节本地头，**不碰压缩数据** ——
 * 几十 MB 的 romset 也几乎不花时间。
 */
export async function readZipEntries(file: Blob): Promise<ZipEntry[] | null> {
  // EOCD 固定 22 字节，后面最多再跟 65535 字节的 zip 注释
  const tailLen = Math.min(file.size, 22 + 0xffff);
  if (tailLen < 22) return null;

  const tail = new Uint8Array(await file.slice(file.size - tailLen).arrayBuffer());
  const tv = new DataView(tail.buffer);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (tv.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  // 分卷 zip（本盘号 / 中央目录起始盘号 非 0）不支持
  if (tv.getUint16(eocd + 4, true) !== 0 || tv.getUint16(eocd + 6, true) !== 0) return null;

  const count = tv.getUint16(eocd + 10, true);
  const cdSize = tv.getUint32(eocd + 12, true);
  const cdOffset = tv.getUint32(eocd + 16, true);
  if (count === 0 || cdSize === 0) return null;
  if (cdOffset === ZIP64_SENTINEL || cdSize === ZIP64_SENTINEL) return null;
  if (cdOffset + cdSize > file.size) return null;

  const cd = new Uint8Array(await file.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const cv = new DataView(cd.buffer);
  const decoder = new TextDecoder();

  const entries: ZipEntry[] = [];
  let p = 0;
  for (let i = 0; i < count; i += 1) {
    if (p + 46 > cd.length) return null;
    if (cv.getUint32(p, true) !== CEN_SIG) return null;

    const flags = cv.getUint16(p + 8, true);
    const method = cv.getUint16(p + 10, true);
    const crc = cv.getUint32(p + 16, true);
    const compressedSize = cv.getUint32(p + 20, true);
    const size = cv.getUint32(p + 24, true);
    const nameLen = cv.getUint16(p + 28, true);
    const extraLen = cv.getUint16(p + 30, true);
    const commentLen = cv.getUint16(p + 32, true);
    const localOffset = cv.getUint32(p + 42, true);

    if (flags & FLAG_ENCRYPTED) return null;
    if (
      compressedSize === ZIP64_SENTINEL ||
      size === ZIP64_SENTINEL ||
      localOffset === ZIP64_SENTINEL
    ) {
      return null;
    }
    if (p + 46 + nameLen > cd.length) return null;

    const name = decoder.decode(cd.subarray(p + 46, p + 46 + nameLen));

    /*
     * 数据起点必须读**本地头**算：本地头里的 name / extra 长度可能和中央目录里的不一样
     * （有 writer 会这么干，比如本地头额外挂一个 UT 字段），拿中央目录的长度直接加会错位。
     */
    if (localOffset + 30 > file.size) return null;
    const loc = new Uint8Array(await file.slice(localOffset, localOffset + 30).arrayBuffer());
    if (loc.length < 30) return null;
    const lv = new DataView(loc.buffer);
    if (lv.getUint32(0, true) !== LOC_SIG) return null;
    const dataOffset = localOffset + 30 + lv.getUint16(26, true) + lv.getUint16(28, true);
    if (dataOffset + compressedSize > file.size) return null;

    entries.push({ name, crc, compressedSize, size, method, dataOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * 按新名字重打包。压缩数据从原文件里**切出来原样搬**，所以不涉及解压 / 重压。
 *
 * `nameOf` 对每个条目返回它的新名字。返回 `null` 表示这个 zip 超出了能安全重写的范围
 * （条目太多、偏移超 4 GB…），调用方退回原文件。
 *
 * 本地头里的通用标志位刻意写成 0（清掉 bit3「数据描述符」）：原文件可能把 CRC / 尺寸
 * 放在数据后面的描述符里、本地头留空，而我们是从中央目录拿的准确值，直接写死更省事，
 * 也省得去猜描述符有多长（带不带签名是两种长度）。
 */
export async function rebuildZip(
  file: Blob,
  entries: ZipEntry[],
  nameOf: (entry: ZipEntry, index: number) => string
): Promise<Blob | null> {
  if (entries.length === 0 || entries.length > 0xffff) return null;

  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  /*
   * 这里必须写 `Uint8Array<ArrayBuffer>` 而不能只写 `Uint8Array`。
   *
   * TS 5.7 起 `Uint8Array` 多了个 buffer 类型参数，省略时默认 `ArrayBufferLike` ——
   * 那可能是 `SharedArrayBuffer`，而 `BlobPart` 只收 `ArrayBufferView<ArrayBuffer>`。
   * 于是 `new Blob([...central])` 会报 TS2322「Type 'Uint8Array<ArrayBufferLike>'
   * is not assignable to type 'BlobPart'」。`new Uint8Array(n)` 本身返回的就是
   * `Uint8Array<ArrayBuffer>`，所以只要把数组声明写死就能对上。
   */
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry.dataOffset + entry.compressedSize > file.size) return null;

    const nameBytes = encoder.encode(nameOf(entry, i));
    if (nameBytes.length === 0 || nameBytes.length > 0xffff) return null;
    if (offset >= ZIP64_SENTINEL) return null;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, LOC_SIG, true);
    lv.setUint16(4, 20, true); // 解压所需版本：2.0
    lv.setUint16(6, 0, true); // 通用标志位：见函数头注释
    lv.setUint16(8, entry.method, true);
    lv.setUint16(10, 0, true); // 时间
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, entry.crc, true);
    lv.setUint32(18, entry.compressedSize, true);
    lv.setUint32(22, entry.size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // 本地 extra：0（原 extra 一律丢掉）
    local.set(nameBytes, 30);

    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, CEN_SIG, true);
    cv.setUint16(4, 20, true); // 创建版本
    cv.setUint16(6, 20, true); // 解压所需版本
    cv.setUint16(8, 0, true); // 通用标志位
    cv.setUint16(10, entry.method, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, entry.crc, true);
    cv.setUint32(20, entry.compressedSize, true);
    cv.setUint32(24, entry.size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // comment
    cv.setUint16(34, 0, true); // 起始盘号
    cv.setUint16(36, 0, true); // 内部属性
    cv.setUint32(38, 0, true); // 外部属性
    cv.setUint32(42, offset, true); // 本地头偏移
    cen.set(nameBytes, 46);

    parts.push(local, file.slice(entry.dataOffset, entry.dataOffset + entry.compressedSize));
    central.push(cen);
    offset += local.length + entry.compressedSize;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) centralSize += c.length;
  if (centralStart >= ZIP64_SENTINEL || centralSize >= ZIP64_SENTINEL) return null;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, EOCD_SIG, true);
  ev.setUint16(4, 0, true); // 本盘号
  ev.setUint16(6, 0, true); // 中央目录起始盘号
  ev.setUint16(8, entries.length, true); // 本盘条目数
  ev.setUint16(10, entries.length, true); // 总条目数
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralStart, true);
  ev.setUint16(20, 0, true); // 注释长度

  return new Blob([...parts, ...central, eocd], { type: 'application/zip' });
}

/**
 * 把单个条目解出来（只支持 store / deflate）。用来往「整合包」里挖一层。
 * 失败返回 `null` —— 挖不动就当没这个内层。
 */
export async function inflateEntry(file: Blob, entry: ZipEntry): Promise<Blob | null> {
  const data = file.slice(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method !== 8) return null;
  if (typeof DecompressionStream === 'undefined') return null;

  try {
    // 'deflate-raw' 是**不带 zlib 头**的裸 deflate —— 正是 zip 条目用的那种。
    const stream = data.stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(stream).blob();
  } catch {
    return null;
  }
}
