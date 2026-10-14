/**
 * 生成 PWA 图标（PNG）。
 *
 * 用法：`node scripts/generate-icons.mjs`
 *
 * ---------------------------------------------------------------------------
 * 为什么是「手写 PNG」而不是引一个图形库
 *
 * 项目里唯一的图标源是 `app/icon.svg` —— 一张 **16×16 的像素画**（一台小机器，
 * 深色机身 + 亮屏）。要交给 PWA 的图标必须是 PNG（manifest 的 icons 虽然允许 SVG，
 * 但 Android / 部分桌面环境对它的支持并不一致，而 apple-touch-icon **完全不认 SVG**）。
 *
 * 把 SVG 转成 PNG 通常要 rasterizer（sharp / resvg / canvas）—— 那是一个几十 MB 的
 * 原生依赖，只为了跑一次、产出 4 张小图。而这里要做的事情**根本不需要渲染器**：
 * 图案是 16×16 的整数方格，目标尺寸又都是 16 的整数倍（192/512/180 里 180 不是，
 * 所以下面按 `floor` 取整数倍、居中留边），放大就是**把每个像素画成 scale×scale 的方块**，
 * 也就是「最近邻放大」—— 手工算比调库还准，而且**永远不会把硬边糊成抗锯齿的灰边**
 * （这正是像素画最怕的）。所以这里直接用 Node 内置的 zlib 拼 PNG 数据块。
 *
 * ---------------------------------------------------------------------------
 * 图标规格（写死在这里，改尺寸改这张表）
 *
 *   public/icons/icon-192.png           192  「any」用
 *   public/icons/icon-512.png           512  「any」用（也是应用商店 / 安装弹窗取的那张）
 *   public/icons/icon-maskable-512.png  512  「maskable」用，图案更小、四周留更多底色
 *   app/apple-icon.png                  180  iOS 主屏图标（Next 文件约定，自动接进 metadata）
 *
 * 「any」与「maskable」的区别：前者会被原样显示（圆角由系统裁），后者会被系统**裁成
 * 任意形状**（圆 / 方 / 水滴），所以内容必须收在**中心 80% 的安全区**里，四周留出底色。
 * 同一个图案两用是不行的：按 any 那个比例（占 75%）做成 maskable，方形的四个角会顶到
 * 安全圆外面被切掉。所以 maskable 单独生成一版，比例降到 60%。
 *
 * ---------------------------------------------------------------------------
 * 图案的唯一出处
 *
 * 下面 SHAPES 是从 `app/icon.svg` **手抄**过来的（同一个 16×16 网格、同一个颜色）。
 * ⚠️ **改 icon.svg 就要同步这里**，否则浏览器标签页和主屏图标会长得不一样。
 * 不直接解析 SVG 是因为那份文件只有 6 个 <rect>，为它引一个 XML 解析器不值当。
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 图案的网格尺寸（icon.svg 的 viewBox 就是 0 0 16 16）。 */
const GRID = 16;

/** 底色：深色主题的房间底（`--color-ink-950` 的深色值）。 */
const BACKGROUND = '#08080a';

/**
 * 图案本体，**按绘制顺序**（后面的盖前面的），和 icon.svg 里的 <rect> 一一对应。
 * 每条是 [x, y, w, h, 颜色]。
 */
const SHAPES = [
  [2, 2, 12, 12, '#16161c'], // 机身
  [3, 3, 10, 2, '#4a4a55'], // 顶沿
  [3, 5, 10, 8, '#c9c9d4'], // 屏幕
  [4, 6, 8, 4, '#d16c70'], // 屏幕里的红色画面
  [5, 7, 6, 1, '#8a6a1a'], // 画面里那道暗线
  [5, 9, 6, 1, '#8a6a1a'], // 画面里那道暗线
];

/* ------------------------------------------------------------------ *
 * 目标文件
 * ------------------------------------------------------------------ */

const TARGETS = [
  { file: 'public/icons/icon-192.png', size: 192, ratio: 0.75 },
  { file: 'public/icons/icon-512.png', size: 512, ratio: 0.75 },
  { file: 'public/icons/icon-maskable-512.png', size: 512, ratio: 0.6 },
  { file: 'app/apple-icon.png', size: 180, ratio: 0.75 },
];

/* ------------------------------------------------------------------ *
 * 极简 PNG 编码（RGBA8）
 *
 * PNG 的结构就是「签名 + 若干数据块」，每个块是 [长度][类型][数据][CRC]。
 * 这里只需要三个块：IHDR（尺寸与格式）、IDAT（像素，zlib 压过的）、IEND（结束）。
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // 宽
  ihdr.writeUInt32BE(size, 4); // 高
  ihdr[8] = 8; // 位深
  ihdr[9] = 6; // 颜色类型 6 = 真彩 + alpha
  ihdr[10] = 0; // 压缩方法
  ihdr[11] = 0; // 过滤方法
  ihdr[12] = 0; // 非隔行

  /*
   * 像素数据每行前面要加一个「过滤类型」字节。全用 0（None）：
   * 图案是大块纯色，PNG 的过滤对它的压缩率帮助很小，而 None 最简单、不会算错。
   */
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ *
 * 画图
 * ------------------------------------------------------------------ */

function parseColor(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
    255,
  ];
}

/** 把一块矩形涂进 RGBA 缓冲。坐标与尺寸都是**目标尺寸的像素**，不是网格格数。 */
function fillRect(buffer, size, x, y, width, height, rgba) {
  for (let row = y; row < y + height; row += 1) {
    for (let col = x; col < x + width; col += 1) {
      const offset = (row * size + col) * 4;
      buffer[offset] = rgba[0];
      buffer[offset + 1] = rgba[1];
      buffer[offset + 2] = rgba[2];
      buffer[offset + 3] = rgba[3];
    }
  }
}

function renderIcon(size, ratio) {
  const buffer = Buffer.alloc(size * size * 4);
  fillRect(buffer, size, 0, 0, size, size, parseColor(BACKGROUND));

  /*
   * 放大倍数**取整数**（floor），这样每个网格像素落成 scale×scale 的方块，边界干净。
   * 180 那种除不尽的尺寸会因此比 75% 略小一点（8/16 = 50%… 见下），
   * 但宁可小一点、也不能让图案出现半像素的错位。
   *
   * ⚠️ 180 那档 scale = floor(180 * 0.75 / 16) = floor(8.4375) = 8，图案占 128/180 ≈ 71%，
   * 比另外两档的 75% 略小 —— 这是刻意的取舍（宁可小、不可歪），不是 bug。
   */
  const scale = Math.max(1, Math.floor((size * ratio) / GRID));
  const drawn = GRID * scale;
  const origin = Math.floor((size - drawn) / 2);

  for (const [x, y, width, height, hex] of SHAPES) {
    fillRect(
      buffer,
      size,
      origin + x * scale,
      origin + y * scale,
      width * scale,
      height * scale,
      parseColor(hex)
    );
  }

  return buffer;
}

/* ------------------------------------------------------------------ *
 * 跑
 * ------------------------------------------------------------------ */

for (const target of TARGETS) {
  const pixels = renderIcon(target.size, target.ratio);
  const output = join(ROOT, target.file);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, encodePng(target.size, pixels));
  console.log(`${target.file}  ${target.size}×${target.size}`);
}
