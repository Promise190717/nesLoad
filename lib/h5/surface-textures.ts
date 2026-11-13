import * as THREE from 'three';

/**
 * 关卡 / 人物表面的**程序化 PBR 贴图库** —— 运行时画，零静态资源。
 *
 * 为什么要有这个文件：旧的关卡贴图只有一张 `map`（底色）。所谓「钢板缝」「集装箱
 * 波纹」「木纹」全部是**画进颜色里的假阴影** —— 光的入射方向被烘死在贴图里，玩家
 * 一跑动、一抬头，表面毫无反应，于是同样一张图在近看时就成了一块贴纸。这里给每
 * 种表面补齐三张图，让 `MeshStandardMaterial` 真的有东西可算：
 *
 *   map           底色
 *   normalMap     法线（由高度场中心差分生成）：这才是「凹凸」的唯一来源
 *   roughnessMap 粗糙度（灰度）：漆面、裸钢、锈、油污的反光完全不同，
 *                 这是「同一块钢板上有的地方亮有的地方哑」的原因
 *
 * 三条硬约束（踩过就别再踩）：
 *   1. **可平铺**：所有噪声都走 `TileNoise`（整数格点 + 环绕采样），任何在 u/v 上
 *      乘系数的写法都会在拼缝处出现镜像断层，必须用「换 seed / 换偏移」代替缩放。
 *   2. **纹素密度必须按真实米数**：`tileMeters` 是这张图覆盖的米数，`level.ts` 的
 *      `fitBoxUv` 用它把每个盒子的 UV 乘成「面宽 / 米数」，这样 1.1 米的木箱和
 *      10 米的台面纹素一样大 —— 旧版所有盒子都吃 0..1，纹素密度差十倍。
 *   3. **贴图是模块级缓存，永远不要 dispose**：和 `weapon-textures.ts` 同一条铁律，
 *      材质每次 buildLevel 都会重建，清了贴图重进游戏就是一片黑。
 *
 * 和 `weapon-textures.ts` 的分工：那边只服务枪（512、三类表面、带划痕做旧），
 * 这边服务大件（按米铺、图案是板缝/铆钉/波纹这种**结构性**细节）。两边互不引用，
 * 别为了省几十行把枪的贴图挪过来 —— 枪的 UV 是 0..1 的，这里的密度逻辑会打乱它。
 */

export type SurfaceKind =
  | 'deck'
  | 'container'
  | 'containerDoor'
  | 'containerRoof'
  | 'steel'
  | 'wood'
  | 'cloth'
  | 'vest'
  | 'gear'
  | 'skin';

export interface SurfaceMaps {
  /** 底色。程序化兜底是 CanvasTexture，HD 换装后是 webp 的 Texture */
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  /** 这张图覆盖多少米 —— `fitBoxUv` 靠它换算 UV，改图案密度必须一起改 */
  tileMeters: number;
}

/* ============================================================
   基础工具
   ============================================================ */

/** 确定性随机：同一个 seed 每次进游戏画出来一模一样，方便肉眼对比调参。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

/**
 * 可平铺的 fbm 噪声。
 *
 * 每个八度的格点数都是 2 的幂，采样时把格子索引按位与环绕 —— 贴图的左右/上下边
 * 天然接得上。**不要**在调用处乘系数压缩坐标（`at(u * 0.5, v)`），那会让右半边
 * 采样到左半边的数据，拼缝上出现一条镜像痕。
 */
class TileNoise {
  private readonly levels: { mask: number; grid: Float32Array }[] = [];

  constructor(seed: number, octaves: number, base: number) {
    const rand = mulberry32(seed);
    let n = base;
    for (let o = 0; o < octaves; o += 1) {
      const grid = new Float32Array(n * n);
      for (let i = 0; i < grid.length; i += 1) grid[i] = rand();
      this.levels.push({ mask: n - 1, grid });
      n *= 2;
    }
  }

  at(u: number, v: number): number {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    for (let l = 0; l < this.levels.length; l += 1) {
      const level = this.levels[l]!;
      const n = level.mask + 1;
      const gx = u * n;
      const gy = v * n;
      const ix = Math.floor(gx);
      const iy = Math.floor(gy);
      const x0 = ix & level.mask;
      const y0 = iy & level.mask;
      const x1 = (x0 + 1) & level.mask;
      const y1 = (y0 + 1) & level.mask;
      const tx = smoothstep(0, 1, gx - ix);
      const ty = smoothstep(0, 1, gy - iy);
      const g = level.grid;
      const ax = g[y0 * n + x0]! + (g[y0 * n + x1]! - g[y0 * n + x0]!) * tx;
      const bx = g[y1 * n + x0]! + (g[y1 * n + x1]! - g[y1 * n + x0]!) * tx;
      sum += amp * (ax + (bx - ax) * ty);
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  }
}

/** 逐像素工作区的当前值。回调里就地改，避免每个像素分配一个对象（1024² 会直接卡死）。 */
interface Shade {
  r: number;
  g: number;
  b: number;
  /** 高度 0..1，法线由它差分出来 */
  h: number;
  /** 粗糙度 0..1 */
  rough: number;
}

/**
 * 一次绘制 = 三个并行的像素数组（底色 / 高度 / 粗糙度）。
 *
 * 三数组**逐像素对齐**是这里的核心：锈斑不仅要改颜色，还要抬高粗糙度、压出凹坑；
 * 如果像旧版那样只画 canvas，凹凸就永远只能用「画一条深色线」来假装。
 */
class Painter {
  readonly size: number;
  readonly tileMeters: number;
  /** 中频噪声（约 4 格起） */
  readonly noise: TileNoise;
  /** 低频噪声（2 格起）：大块的漆面不均、凹陷 */
  readonly coarse: TileNoise;
  readonly rand: () => number;

  private readonly color: Uint8ClampedArray<ArrayBuffer>;
  private readonly height: Float32Array;
  private readonly rough: Float32Array;

  constructor(size: number, tileMeters: number, seed: number) {
    this.size = size;
    this.tileMeters = tileMeters;
    this.color = new Uint8ClampedArray(size * size * 4);
    this.height = new Float32Array(size * size);
    this.rough = new Float32Array(size * size);
    this.rand = mulberry32(seed);
    // 三个八度（格点 4 / 8 / 16）够用：再细的一层交给每像素随机，否则 10 张图
    // 加起来在手机上进关卡要卡半秒多
    this.noise = new TileNoise(seed ^ 0x51ed, 3, 4);
    this.coarse = new TileNoise(seed ^ 0x9e37, 3, 2);
  }

  /** 每米多少像素。画细节一律按真实尺寸乘它，不要写魔数。 */
  get pxPerM(): number {
    return this.size / this.tileMeters;
  }

  fill(r: number, g: number, b: number, h: number, rough: number): void {
    const n = this.size * this.size;
    for (let i = 0; i < n; i += 1) {
      const p = i * 4;
      this.color[p] = r;
      this.color[p + 1] = g;
      this.color[p + 2] = b;
      this.color[p + 3] = 255;
      this.height[i] = h;
      this.rough[i] = rough;
    }
  }

  each(fn: (x: number, y: number, u: number, v: number, out: Shade) => void): void {
    const s = this.size;
    const out: Shade = { r: 0, g: 0, b: 0, h: 0.5, rough: 0.5 };
    for (let y = 0; y < s; y += 1) {
      for (let x = 0; x < s; x += 1) {
        const i = y * s + x;
        this.read(i, out);
        fn(x, y, x / s, y / s, out);
        this.write(i, out);
      }
    }
  }

  /**
   * 圆斑（可跨越贴图边界）。`apply(k, out)` 里 k 是 1 在圆心 / 0 在边缘的衰减。
   * 锈迹、油污、弹坑、迷彩色块全部走它。
   */
  disc(cx: number, cy: number, radius: number, apply: (k: number, out: Shade) => void): void {
    const s = this.size;
    const out: Shade = { r: 0, g: 0, b: 0, h: 0.5, rough: 0.5 };
    const x0 = Math.floor(cx - radius);
    const x1 = Math.ceil(cx + radius);
    const y0 = Math.floor(cy - radius);
    const y1 = Math.ceil(cy + radius);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.sqrt(dx * dx + dy * dy) / radius;
        if (d >= 1) continue;
        const i = (((y % s) + s) % s) * s + (((x % s) + s) % s);
        this.read(i, out);
        apply(1 - d, out);
        this.write(i, out);
      }
    }
  }

  /** 一道短划（划痕、防滑凸条、锁杆）。angle 弧度，`apply(k, out)` 同 `disc`。 */
  bar(cx: number, cy: number, angle: number, length: number, halfWidth: number, apply: (k: number, out: Shade) => void): void {
    const s = this.size;
    const out: Shade = { r: 0, g: 0, b: 0, h: 0.5, rough: 0.5 };
    const hx = Math.cos(angle) * length * 0.5;
    const hy = Math.sin(angle) * length * 0.5;
    const ax = cx - hx;
    const ay = cy - hy;
    const bx = cx + hx;
    const by = cy + hy;
    const segSq = length * length || 1;
    const minX = Math.floor(Math.min(ax, bx) - halfWidth - 1);
    const maxX = Math.ceil(Math.max(ax, bx) + halfWidth + 1);
    const minY = Math.floor(Math.min(ay, by) - halfWidth - 1);
    const maxY = Math.ceil(Math.max(ay, by) + halfWidth + 1);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const t = clamp01(((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / segSq);
        const dx = x - (ax + (bx - ax) * t);
        const dy = y - (ay + (by - ay) * t);
        const d = Math.sqrt(dx * dx + dy * dy) / halfWidth;
        if (d >= 1) continue;
        const i = (((y % s) + s) % s) * s + (((x % s) + s) % s);
        this.read(i, out);
        apply(1 - d, out);
        this.write(i, out);
      }
    }
  }

  /** 竖直流挂（锈水、水渍）。`width` 是半宽，`alpha` 是最大强度。 */
  streak(cx: number, cy: number, length: number, halfWidth: number, alpha: number, r: number, g: number, b: number): void {
    const s = this.size;
    const out: Shade = { r: 0, g: 0, b: 0, h: 0.5, rough: 0.5 };
    const x0 = Math.floor(cx - halfWidth - 1);
    const x1 = Math.ceil(cx + halfWidth + 1);
    for (let y = Math.floor(cy); y < cy + length; y += 1) {
      const t = (y - cy) / length;
      const fade = (1 - t) * smoothstep(0, 0.12, t);
      if (fade <= 0) continue;
      for (let x = x0; x <= x1; x += 1) {
        const dx = Math.abs(x - cx) / halfWidth;
        if (dx >= 1) continue;
        const edge = 1 - dx;
        const i = (((y % s) + s) % s) * s + (((x % s) + s) % s);
        this.read(i, out);
        const k = fade * edge * alpha;
        out.r = mix(out.r, r, k);
        out.g = mix(out.g, g, k);
        out.b = mix(out.b, b, k);
        out.rough = mix(out.rough, 0.94, k);
        this.write(i, out);
      }
    }
  }

  /** 底色 → CanvasTexture（sRGB）。 */
  colorTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = this.size;
    canvas.height = this.size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('surface-textures: 2d context unavailable');
    ctx.putImageData(new ImageData(this.color, this.size, this.size), 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return finishTexture(texture);
  }

  /** 高度场 → 法线（中心差分，环绕采样，拼缝处也连续）。 */
  normalTexture(strength: number): THREE.CanvasTexture {
    const s = this.size;
    const data = new Uint8ClampedArray(s * s * 4);
    for (let y = 0; y < s; y += 1) {
      const ym = ((y - 1 + s) % s) * s;
      const yp = ((y + 1) % s) * s;
      const yc = y * s;
      for (let x = 0; x < s; x += 1) {
        const xm = (x - 1 + s) % s;
        const xp = (x + 1) % s;
        const dx = (this.height[yc + xp]! - this.height[yc + xm]!) * strength;
        const dy = (this.height[yp + x]! - this.height[ym + x]!) * strength;
        // n = (-dh/du, -dh/dv, 1)。canvas 的 y 向下而 CanvasTexture 的 flipY = true，
        // 所以 dh/dv = -dy_canvas，绿通道取 +dy（和 weapon-textures 同一套推导）
        const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        const p = (yc + x) * 4;
        data[p] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
        data[p + 1] = Math.round((dy * inv * 0.5 + 0.5) * 255);
        data[p + 2] = Math.round((inv * 0.5 + 0.5) * 255);
        data[p + 3] = 255;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = s;
    canvas.height = s;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('surface-textures: 2d context unavailable');
    ctx.putImageData(new ImageData(data, s, s), 0, 0);
    return finishTexture(new THREE.CanvasTexture(canvas));
  }

  /** 粗糙度 → 灰度图（three 的 roughnessMap 取 G 通道，灰度即 r=g=b）。 */
  roughnessTexture(): THREE.CanvasTexture {
    const s = this.size;
    const data = new Uint8ClampedArray(s * s * 4);
    for (let i = 0; i < s * s; i += 1) {
      const v = Math.round(clamp01(this.rough[i]!) * 255);
      const p = i * 4;
      data[p] = v;
      data[p + 1] = v;
      data[p + 2] = v;
      data[p + 3] = 255;
    }
    const canvas = document.createElement('canvas');
    canvas.width = s;
    canvas.height = s;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('surface-textures: 2d context unavailable');
    ctx.putImageData(new ImageData(data, s, s), 0, 0);
    return finishTexture(new THREE.CanvasTexture(canvas));
  }

  private read(i: number, out: Shade): void {
    const p = i * 4;
    out.r = this.color[p]!;
    out.g = this.color[p + 1]!;
    out.b = this.color[p + 2]!;
    out.h = this.height[i]!;
    out.rough = this.rough[i]!;
  }

  private write(i: number, out: Shade): void {
    const p = i * 4;
    this.color[p] = out.r;
    this.color[p + 1] = out.g;
    this.color[p + 2] = out.b;
    this.height[i] = out.h;
    this.rough[i] = out.rough;
  }
}

function finishTexture(texture: THREE.CanvasTexture): THREE.CanvasTexture {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // 甲板/船壳大量是掠射角，各向异性 4 在远处会糊成一片灰 —— 这是「贴图看起来假」
  // 里最容易被忽略的一条。three 会按硬件上限自动 clamp。
  texture.anisotropy = 8;
  return texture;
}

/* ============================================================
   各表面
   ============================================================ */

/** 甲板：2×2 米钢板错缝铺装 + 菱形防滑凸起 + 锈斑/油污/磨损。 */
function paintDeck(p: Painter): void {
  const s = p.size;
  const px = p.pxPerM;

  // 基色直接承担颜色（材质 `color` 保持 0xffffff），和旧版一致，不改变整体明度
  p.fill(127, 141, 152, 0.58, 0.74);

  p.each((x, y, u, v, out) => {
    const macro = p.noise.at(u, v);
    const blotch = p.coarse.at(u, v);

    // 板缝：左半列缝在 y = 0 / s/2，右半列错开 1 米。2 米钢板，错缝铺法
    const seamX = Math.min(x, Math.abs(x - s / 2), s - x);
    const seamY =
      x < s / 2
        ? Math.min(y, Math.abs(y - s / 2), s - y)
        : Math.min(Math.abs(y - s / 4), Math.abs(y - (3 * s) / 4));
    const seam = Math.min(seamX, seamY);

    // 漆膜不均（±7%）+ 走道磨白
    const wear = smoothstep(0.52, 0.78, blotch);
    const k = 0.94 + macro * 0.12 - wear * 0.05;
    out.r = 127 * k;
    out.g = 141 * k;
    out.b = 152 * k;
    out.h = 0.58 + (macro - 0.5) * 0.10;
    out.rough = 0.76 - wear * 0.3 + (macro - 0.5) * 0.08;

    if (seam < 2.2) {
      // 焊缝：一条压暗的沟，边缘稍亮（焊道被磨光过）
      const t = 1 - seam / 2.2;
      out.r *= 1 - 0.34 * t;
      out.g *= 1 - 0.34 * t;
      out.b *= 1 - 0.32 * t;
      out.h = 0.58 - 0.34 * t;
      out.rough = mix(out.rough, 0.86, t * 0.8);
    } else if (seam < 4.4) {
      const t = 1 - (seam - 2.2) / 2.2;
      out.r *= 1 + 0.05 * t;
      out.g *= 1 + 0.05 * t;
      out.b *= 1 + 0.05 * t;
      out.h += 0.16 * t;
      out.rough = mix(out.rough, 0.48, t * 0.7);
    }

    // 缝边长锈：噪声决定哪一段有，避免整条缝均匀发红（一眼假）
    const rustBand = smoothstep(10, 1, seam) * smoothstep(0.42, 0.72, p.noise.at((u + 0.37) % 1, (v + 0.61) % 1));
    if (rustBand > 0.01) {
      out.r = mix(out.r, 112, rustBand * 0.85);
      out.g = mix(out.g, 74, rustBand * 0.85);
      out.b = mix(out.b, 50, rustBand * 0.85);
      out.h -= rustBand * 0.10;
      out.rough = mix(out.rough, 0.95, rustBand);
    }
  });

  // 菱形防滑凸起：82mm 一个、58mm 一排，相邻排反向 45°。
  // 3D 里这是几毫米高的颗粒，法线一开，斜射光下就有细碎的闪光
  const rowStep = 0.058 * px;
  const colStep = 0.082 * px;
  const lugLen = 0.076 * px;
  const lugHalf = 0.011 * px;
  for (let row = 0; row * rowStep < s; row += 1) {
    const cy = row * rowStep;
    const offset = (row % 2) * colStep * 0.5;
    for (let col = 0; col * colStep + offset < s; col += 1) {
      const cx = col * colStep + offset;
      const angle = ((row + col) % 2 === 0 ? 1 : -1) * (Math.PI / 4);
      p.bar(cx, cy, angle, lugLen, lugHalf, (t, out) => {
        out.h += 0.26 * t;
        const light = 1 + 0.07 * t;
        out.r *= light;
        out.g *= light;
        out.b *= light;
        out.rough = mix(out.rough, 0.55, t * 0.5);
      });
    }
  }

  // 漆面剥落：露出亮钢（亮、光滑、略凹）
  for (let i = 0; i < 26; i += 1) {
    const cx = p.rand() * s;
    const cy = p.rand() * s;
    const radius = (0.006 + p.rand() * 0.02) * px;
    p.disc(cx, cy, radius, (k, out) => {
      const f = smoothstep(0, 0.7, k);
      out.r = mix(out.r, 168, f * 0.8);
      out.g = mix(out.g, 172, f * 0.8);
      out.b = mix(out.b, 176, f * 0.8);
      out.h -= 0.12 * f;
      out.rough = mix(out.rough, 0.32, f);
    });
  }

  // 油污：大块、压暗、反光强（粗糙度低）—— 甲板上最真实的一层脏
  for (let i = 0; i < 5; i += 1) {
    const cx = p.rand() * s;
    const cy = p.rand() * s;
    const radius = (0.18 + p.rand() * 0.5) * px;
    p.disc(cx, cy, radius, (k, out) => {
      const f = smoothstep(0, 0.85, k) * 0.75;
      out.r *= 1 - 0.16 * f;
      out.g *= 1 - 0.15 * f;
      out.b *= 1 - 0.12 * f;
      out.rough = mix(out.rough, 0.26, f);
      out.h -= 0.04 * f;
    });
  }

  // 锈水下游（沿 v 方向流），从随机位置往下流 20~80 厘米
  for (let i = 0; i < 18; i += 1) {
    p.streak(p.rand() * s, p.rand() * s, (0.2 + p.rand() * 0.6) * px, 2 + p.rand() * 4, 0.28, 118, 78, 52);
  }
}

/** 集装箱侧面：竖瓦楞（一个 tile 7 道，间距 0.286 米）+ 凹陷 + 掉漆。 */
function paintContainer(p: Painter): void {
  const s = p.size;
  const px = p.pxPerM;
  const ridges = 7;
  const pitch = s / ridges;

  // 底色接近白：真正的颜色由材质 `color` 染（五种箱色共用一张图）。
  // 246 而不是 255：留一点余量给掉漆/锈斑提亮，染色后总亮度不至于比旧版低
  p.fill(246, 246, 246, 0.5, 0.76);

  p.each((x, y, u, v, out) => {
    // 梯形波：外凸平台 → 一道**陡**的斜坡 → 凹陷平台。斜坡宽度必须窄：
    // 真实箱体的波深 36mm、水平过渡只有 40mm 左右，斜坡画宽了法线就只有
    // 二十几度，看着像瓦楞纸而不是 2 毫米厚的钢板
    const phase = x / pitch;
    const f = phase - Math.floor(phase);
    let profile: number;
    if (f < 0.56) profile = 1;
    else if (f < 0.64) profile = 1 - smoothstep(0.56, 0.64, f) * 0.82;
    else if (f < 0.9) profile = 0.18;
    else profile = 0.18 + smoothstep(0.9, 1, f) * 0.82;

    const macro = p.noise.at(u, v);
    const dent = p.noise.at((u + 0.41) % 1, (v + 0.23) % 1) - 0.5;

    out.h = 0.35 + profile * 0.5 + dent * 0.16;
    // 颜色只做很轻的脏污变化：明暗交给法线，烘死在颜色里会和光照打架
    const k = 0.96 + macro * 0.08 - Math.abs(dent) * 0.16;
    out.r = 246 * k;
    out.g = 246 * k;
    out.b = 246 * k;
    out.rough = 0.74 + (macro - 0.5) * 0.16;
  });

  // 掉漆点（露出灰钢，光滑）
  for (let i = 0; i < 30; i += 1) {
    p.disc(p.rand() * s, p.rand() * s, (0.004 + p.rand() * 0.014) * px, (k, out) => {
      const f = smoothstep(0, 0.8, k);
      out.r = mix(out.r, 150, f * 0.75);
      out.g = mix(out.g, 152, f * 0.75);
      out.b = mix(out.b, 154, f * 0.75);
      out.h -= 0.08 * f;
      out.rough = mix(out.rough, 0.34, f);
    });
  }

  // 雨水灰痕（用户 2026-11-13 要求去掉铁锈：旧版这里是橙棕色的锈水，同一张
  // 图染五种箱色后就是「墙上好几块颜色不一样的锈贴片」；改成中性灰的污水
  // 痕，保留竖向流挂的结构感，但不再带色相）
  for (let i = 0; i < 6; i += 1) {
    p.streak(p.rand() * s, p.rand() * s * 0.4, (0.25 + p.rand() * 0.9) * px, 2 + p.rand() * 5, 0.12, 88, 90, 94);
  }
}

/**
 * 集装箱端门：**一整面门**，不平铺（几何 UV 按 2.6 米算，材质侧的
 * `map.repeat` 再把 1.3 个 tile 压回 1 个，见 `level.ts` 的 container）。
 *
 * 这面为什么值得单独画：旧版六面共用侧板贴图，箱子的端头也是一片竖波纹，
 * 凑近看没有锁杆、没有门缝、没有角件 —— 「像贴纸」有一半来自这里。
 */
function paintContainerDoor(p: Painter): void {
  const s = p.size;
  const px = p.pxPerM;
  const frame = 0.07 * px; // 门框 7 厘米
  const casting = 0.17 * px; // 角件 17 厘米
  const bars = [0.14, 0.38, 0.62, 0.86].map((f) => f * s);
  const barHalf = 0.016 * px; // 锁杆直径 3.2 厘米
  const seamHalf = 2.2;

  p.fill(240, 240, 240, 0.5, 0.74);

  p.each((x, y, u, v, out) => {
    // 板面瓦楞（门板同样是竖波纹，9 道一面）
    const f = (x / (s / 9)) % 1;
    const profile = f < 0.55 ? 1 : f < 0.72 ? 1 - smoothstep(0.55, 0.72, f) * 0.7 : 0.3;
    const macro = p.noise.at(u, v);

    out.h = 0.34 + profile * 0.34;
    const k = 0.97 + macro * 0.06;
    out.r = 240 * k;
    out.g = 240 * k;
    out.b = 240 * k;
    out.rough = 0.72 + (macro - 0.5) * 0.14;

    // 两扇门的中缝（橡胶密封条压出来的黑缝）
    const seam = Math.abs(x - s / 2);
    if (seam < seamHalf) {
      const t = 1 - seam / seamHalf;
      out.r *= 1 - 0.62 * t;
      out.g *= 1 - 0.62 * t;
      out.b *= 1 - 0.62 * t;
      out.h = 0.2;
      out.rough = 0.92;
    }

    // 门框：四周一圈比板面高、比板面暗
    const edge = Math.min(x, y, s - x, s - y);
    if (edge < frame) {
      const t = smoothstep(0, 2, frame - edge);
      out.h += 0.2 * t;
      out.r *= 1 - 0.07 * t;
      out.g *= 1 - 0.07 * t;
      out.b *= 1 - 0.07 * t;
      out.rough = mix(out.rough, 0.66, t);
    }

    // 四角角件：铸钢件，比板面暗、比板面糙
    const corner = Math.min(Math.hypot(x, y), Math.hypot(x - s, y), Math.hypot(x, y - s), Math.hypot(x - s, y - s));
    if (corner < casting) {
      const t = smoothstep(casting, casting - 3, corner);
      out.r = mix(out.r, 150, t * 0.8);
      out.g = mix(out.g, 150, t * 0.8);
      out.b = mix(out.b, 148, t * 0.8);
      out.h += 0.26 * t;
      out.rough = mix(out.rough, 0.8, t);
    }

    // 四根锁杆：圆柱受光一侧亮、靠门板一侧压暗，才有「凸出来」的错觉
    for (let i = 0; i < bars.length; i += 1) {
      const d = Math.abs(x - bars[i]!);
      if (d > barHalf + 1.6) continue;
      if (d <= barHalf) {
        const side = x < bars[i]! ? 0.14 : -0.1;
        out.r *= 1 + side;
        out.g *= 1 + side;
        out.b *= 1 + side;
        out.h += 0.34;
        out.rough = mix(out.rough, 0.5, 0.8);
      } else {
        out.r *= 0.86;
        out.g *= 0.86;
        out.b *= 0.86;
      }
    }

    // 锁杆上的凸轮把手：每根杆往一侧伸出一小截（不是一根通长的横杠，
    // 通长横杠看起来像门板被切成两半）
    for (let i = 0; i < bars.length; i += 1) {
      const bx = bars[i]!;
      const hx = bx + (i % 2 === 0 ? 1 : -1) * 0.03 * px;
      if (Math.abs(x - hx) > 0.035 * px) continue;
      if (Math.abs(y - 0.52 * s) > barHalf) continue;
      out.h += 0.3;
      out.r *= 1.05;
      out.g *= 1.05;
      out.b *= 1.05;
      out.rough = mix(out.rough, 0.48, 0.7);
    }

    // 铰链：左右两边各三组
    for (const hx of [0.02 * s, 0.98 * s]) {
      for (const hy of [0.2 * s, 0.5 * s, 0.8 * s]) {
        const dx = Math.abs(x - hx) / (0.045 * s);
        const dy = Math.abs(y - hy) / (0.03 * s);
        if (dx > 1 || dy > 1) continue;
        out.h += 0.3;
        out.r *= 0.8;
        out.g *= 0.8;
        out.b *= 0.8;
        out.rough = mix(out.rough, 0.55, 0.6);
      }
    }
    // 底部积灰：贴着甲板那一截总是脏的（v 越大越靠下）
    const dirt = smoothstep(0.9, 1, v);
    if (dirt > 0) {
      out.r *= 1 - 0.16 * dirt;
      out.g *= 1 - 0.16 * dirt;
      out.b *= 1 - 0.15 * dirt;
      out.rough = mix(out.rough, 0.9, dirt);
    }
  });

  // 锁杆底部的灰水痕（同侧板：铁锈整条去掉，换成不带色相的积灰流挂）
  for (let i = 0; i < bars.length; i += 1) {
    for (let j = 0; j < 2; j += 1) {
      p.streak(bars[i]! + (p.rand() - 0.5) * 6, 0.3 * s + p.rand() * 0.5 * s, (0.1 + p.rand() * 0.4) * px, 2.2, 0.18, 72, 74, 78);
    }
  }
  for (let i = 0; i < 5; i += 1) {
    p.streak(p.rand() * s, 0.02 * s, (0.2 + p.rand() * 0.7) * px, 2 + p.rand() * 4, 0.12, 74, 76, 80);
  }
}

/** 集装箱顶：横向加强筋 + 积灰（俯射视角看的就是它）。 */
function paintContainerRoof(p: Painter): void {
  const s = p.size;
  const px = p.pxPerM;
  p.fill(214, 214, 212, 0.5, 0.82);
  p.each((x, y, u, v, out) => {
    // 8 道 / 2 米 = 25 厘米一道，和真实箱顶的横向波纹一致
    const f = (y / (s / 8)) % 1;
    const rib = f < 0.2 ? 1 : f < 0.4 ? 1 - smoothstep(0.2, 0.4, f) : 0.2;
    const macro = p.noise.at(u, v);
    out.h = 0.4 + rib * 0.28 + (macro - 0.5) * 0.1;
    const k = 0.92 + macro * 0.12;
    out.r = 214 * k;
    out.g = 214 * k;
    out.b = 212 * k;
    out.rough = 0.8 + (macro - 0.5) * 0.12;
  });
  for (let i = 0; i < 10; i += 1) {
    p.disc(p.rand() * s, p.rand() * s, (0.05 + p.rand() * 0.18) * px, (k, out) => {
      const f = smoothstep(0, 0.9, k) * 0.5;
      out.r *= 1 - 0.12 * f;
      out.g *= 1 - 0.12 * f;
      out.b *= 1 - 0.1 * f;
      out.rough = mix(out.rough, 0.95, f);
    });
  }
}

/** 刷漆钢板：狙击台、楼梯、舷墙、吊机臂都用它（靠材质 color 染色）。 */
function paintSteel(p: Painter): void {
  const s = p.size;
  const px = p.pxPerM;

  // 底色接近白：`color` 决定这块是黄吊臂、灰台面还是深舷墙
  p.fill(244, 246, 248, 0.58, 0.62);

  p.each((x, y, u, v, out) => {
    const macro = p.noise.at(u, v);
    const blotch = p.coarse.at(u, v);
    const grain = p.rand() - 0.5;

    // 2×2 米的钢板缝 + 一道焊道。盒子小于 2 米时缝正好落在棱边上，看起来像箱体的
    // 边框焊接 —— 这正是想要的
    const seamX = Math.min(x, s - x);
    const seamY = Math.min(y, s - y);
    const seam = Math.min(seamX, seamY);

    const k = 0.95 + macro * 0.09;
    out.r = 244 * k + grain * 4;
    out.g = 246 * k + grain * 4;
    out.b = 248 * k + grain * 4;
    out.h = 0.56 + (blotch - 0.5) * 0.1 + grain * 0.01;
    out.rough = 0.55 + (macro - 0.5) * 0.24;

    if (seam < 1.4) {
      const t = 1 - seam / 1.4;
      out.r *= 1 - 0.3 * t;
      out.g *= 1 - 0.3 * t;
      out.b *= 1 - 0.3 * t;
      out.h -= 0.3 * t;
      out.rough = mix(out.rough, 0.84, t);
    } else if (seam < 3) {
      const t = 1 - (seam - 1.4) / 1.6;
      out.h += 0.14 * t;
      out.rough = mix(out.rough, 0.44, t * 0.8);
    }
  });

  // 螺栓沿缝排布（0.25 米一颗），带投影
  const boltR = 0.011 * px;
  for (let t = 0.06; t < 1; t += 0.125) {
    for (const [bx, by] of [
      [0.05 * px, t * s],
      [s - 0.05 * px, t * s],
      [t * s, 0.05 * px],
      [t * s, s - 0.05 * px],
    ] as const) {
      p.disc(bx, by, boltR, (k, out) => {
        const f = smoothstep(0.2, 0.9, k);
        out.h += 0.3 * f;
        out.r *= 1 - 0.14 * f;
        out.g *= 1 - 0.14 * f;
        out.b *= 1 - 0.14 * f;
        out.rough = mix(out.rough, 0.4, f);
      });
    }
  }

  // 划痕：露出的钢更亮更光、带凹槽
  for (let i = 0; i < 34; i += 1) {
    p.bar(p.rand() * s, p.rand() * s, p.rand() * Math.PI, (0.02 + p.rand() * 0.14) * px, 0.9 + p.rand() * 1.2, (k, out) => {
      out.h -= 0.16 * k;
      const light = 1 + 0.16 * k;
      out.r *= light;
      out.g *= light;
      out.b *= light;
      out.rough = mix(out.rough, 0.3, k);
    });
  }

  // 漆面晒褪：大块低对比的软斑（暴晒多年的漆发白、起粉、粗糙度上升）。
  // 真实感的来源和甲板一样是**大尺度不均**，不是小噪点 —— 旧版唯一的
  // 大尺度变化是锈斑，锈斑一删就要有东西补上这个位置
  for (let i = 0; i < 6; i += 1) {
    p.disc(p.rand() * s, p.rand() * s, (0.15 + p.rand() * 0.4) * px, (k, out) => {
      const f = smoothstep(0, 0.85, k) * 0.5;
      out.r *= 1 + 0.05 * f;
      out.g *= 1 + 0.05 * f;
      out.b *= 1 + 0.03 * f;
      out.rough = mix(out.rough, 0.8, f);
    });
  }

  // 漆面剥落：露出底下更亮的裸钢（光滑、略凹），和甲板「漆面剥落」同一套
  for (let i = 0; i < 14; i += 1) {
    p.disc(p.rand() * s, p.rand() * s, (0.005 + p.rand() * 0.018) * px, (k, out) => {
      const f = smoothstep(0, 0.7, k);
      out.r = mix(out.r, 176, f * 0.8);
      out.g = mix(out.g, 180, f * 0.8);
      out.b = mix(out.b, 184, f * 0.8);
      out.h -= 0.1 * f;
      out.rough = mix(out.rough, 0.3, f);
    });
  }

  // 淡灰水痕：只留「竖向流挂」的结构感，不带锈色（用户要求整图去铁锈，
  // 旧版这里是锈斑 + 螺栓锈水，染六种颜色后就是「墙上好几块颜色不一样的
  // 锈贴片」的来源）
  for (let i = 0; i < 5; i += 1) {
    p.streak(p.rand() * s, p.rand() * s * 0.5, (0.15 + p.rand() * 0.5) * px, 1.5 + p.rand() * 3, 0.09, 96, 100, 106);
  }
}

/** 木板箱：横向板缝 + 木纹 + 节疤 + 钉头。 */
function paintWood(p: Painter): void {
  const s = p.size;
  const px = p.pxPerM;
  const plank = 0.22 * px;

  p.fill(186, 137, 88, 0.52, 0.86);

  p.each((x, y, u, v, out) => {
    const row = Math.floor(y / plank);
    const fy = (y - row * plank) / plank;
    const macro = p.noise.at(u, v);

    // 木纹：沿板长方向波动（板是横铺的，所以纹路随 y 变）
    const grain = Math.sin(y * 0.16 + macro * 7 + row * 2.3) * 0.5 + Math.sin(y * 0.045 + row) * 0.5;
    const k = 0.93 + grain * 0.09 + (macro - 0.5) * 0.1;
    out.r = 186 * k;
    out.g = 137 * k;
    out.b = 88 * k;
    out.h = 0.52 + grain * 0.05;
    out.rough = 0.84 + grain * 0.05;

    // 板缝：上沿一条深沟
    if (fy < 0.06) {
      const t = 1 - fy / 0.06;
      out.r *= 1 - 0.5 * t;
      out.g *= 1 - 0.5 * t;
      out.b *= 1 - 0.5 * t;
      out.h -= 0.34 * t;
      out.rough = mix(out.rough, 0.95, t);
    } else if (fy < 0.1) {
      out.h += 0.1;
      out.r *= 1.04;
      out.g *= 1.04;
      out.b *= 1.04;
    }
  });

  // 节疤
  for (let i = 0; i < 6; i += 1) {
    const cx = p.rand() * s;
    const cy = p.rand() * s;
    const r = (0.012 + p.rand() * 0.02) * px;
    p.disc(cx, cy, r, (k, out) => {
      const ring = Math.sin((1 - k) * 14) * 0.5 + 0.5;
      const f = smoothstep(0, 0.6, k);
      out.r = mix(out.r, 132 + ring * 20, f * 0.8);
      out.g = mix(out.g, 92 + ring * 16, f * 0.8);
      out.b = mix(out.b, 56 + ring * 10, f * 0.8);
      out.h += 0.06 * f;
      out.rough = mix(out.rough, 0.93, f);
    });
  }

  // 钉头：贴着板缝打，一颗一颗凹进木头
  const nailR = 0.006 * px;
  for (let row = 0; row * plank < s; row += 1) {
    const y = row * plank + plank * 0.03;
    for (let t = 0.08; t < 1; t += 0.3) {
      p.disc(t * s, y, nailR, (k, out) => {
        const f = smoothstep(0.1, 0.9, k);
        out.r *= 1 - 0.42 * f;
        out.g *= 1 - 0.42 * f;
        out.b *= 1 - 0.42 * f;
        out.h -= 0.22 * f;
        out.rough = mix(out.rough, 0.45, f);
      });
    }
  }
}

/**
 * 各队作训服布料染色（[cloth, clothDark]，**已含 ×1.18 贴图亮度补偿**）。
 *
 * 这是队服颜色的唯一来源：actor-view 的第三人称衣服和 weapons.ts 的第一人称
 * 袖子都从这里取色 —— 别在用色处再手抄一份数字。
 * 灰度迷彩贴图 × 这里的 color = 最终迷彩图案，敌我识别只靠色相。
 */
export const TEAM_CLOTH: ReadonlyArray<readonly [number, number]> = [
  [0xa99661, 0x7f7049], // 0 队：CF 潜伏者土黄迷彩（匪，默认 AK —— 2026-11-13 用户点名「换成cf那样的土黄色」）
  [0x54779e, 0x3d5877], // 1 队：CF 保卫者蓝灰迷彩（警，默认 M4 —— 原锈红 0xb85139 已弃用）
];

/**
 * 作训服布料：林地迷彩（灰度，颜色由阵营色染）+ 织物纹理。
 *
 * 上一版的「迷彩」是噪声四阶（232..255，只有 9% 亮度差），染上阵营色后肉眼
 * 根本分辨不出图案 —— 用户反馈「衣服是纯色的」。现在用 `disc` 画真色块：
 * 三档亮度差 ≥ 25%，染色后是清晰的同色相迷彩（土黄队 = 沙漠迷彩、蓝灰队 =
 * 蓝迷彩），敌我识别仍然只靠色相（灰度图案不引入第二种色相）。 *
 * ⚠️ 色块把贴图平均亮度从 0.965 压到 ~0.8，队服颜色（上面 `TEAM_CLOTH` 和
 * weapons.ts 第一人称袖子）已按 ×1.18 补偿 —— 改色块覆盖率必须同步补偿系数。
 */
function paintCloth(p: Painter): void {
  const s = p.size;
  const px = p.pxPerM; // 1 米 = 256 像素

  p.fill(236, 236, 236, 0.5, 0.9);

  p.each((x, y, u, v, out) => {
    // 织物：细经纬 + 逐像素毛羽。迷彩色块画完会盖住底色，织物纹理只对
    // 底色区域生效 —— 这正是想要的：色块是印上去的，底布有自己的织纹
    const weave = Math.sin(x * 1.7) * 1.6 + Math.sin(y * 1.9) * 1.6 + (p.rand() - 0.5) * 7;
    const v255 = 236 + weave;
    out.r = v255;
    out.g = v255;
    out.b = v255;
    out.h = 0.5 + Math.sin(x * 1.7) * 0.02 + Math.sin(y * 1.9) * 0.02;
    out.rough = 0.9 + (p.rand() - 0.5) * 0.06;
  });

  // 迷彩色块：中调铺底 → 深斑成型 → 亮斑提缝。色块尺寸 2.5~8.5 厘米
  //（真实作训服的斑块尺度），边缘半硬（丝印感），disc 自带跨边界环绕。
  // 只改颜色不动高度 —— 迷彩是印染不是凹凸，法线保持织纹
  const blotch = (count: number, rMin: number, rMax: number, tone: number): void => {
    for (let i = 0; i < count; i += 1) {
      p.disc(p.rand() * s, p.rand() * s, (rMin + p.rand() * (rMax - rMin)) * px, (k, out) => {
        const f = smoothstep(0.2, 0.62, k);
        out.r = mix(out.r, tone, f);
        out.g = mix(out.g, tone, f);
        out.b = mix(out.b, tone, f);
      });
    }
  };
  blotch(30, 0.035, 0.085, 184);
  blotch(24, 0.025, 0.06, 128);
  blotch(16, 0.02, 0.045, 250);

  // 磨损：肘/膝的位置没法知道，做几块随机磨白（比整件均匀新布真实）
  for (let i = 0; i < 4; i += 1) {
    p.disc(p.rand() * s, p.rand() * s, (0.1 + p.rand() * 0.2) * s, (k, out) => {
      const f = smoothstep(0, 0.9, k) * 0.3;
      out.r = mix(out.r, 252, f);
      out.g = mix(out.g, 250, f);
      out.b = mix(out.b, 244, f);
      out.rough = mix(out.rough, 0.95, f);
    });
  }
}

/** 战术背心：横向织带（MOLLE）+ 缝线。 */
function paintVest(p: Painter): void {
  const s = p.size;
  p.fill(238, 238, 234, 0.5, 0.86);

  p.each((x, y, u, v, out) => {
    // 18 道 = 每道约 39 毫米，正好是 MOLLE 织带的真实宽度
    const band = (y / (s / 18)) % 1;
    const raised = band < 0.55 ? 1 : 0;
    const noise = p.noise.at(u, v);
    const k = 0.94 + noise * 0.1;
    out.r = 238 * k;
    out.g = 238 * k;
    out.b = 234 * k;
    out.h = 0.45 + raised * 0.22 + (p.rand() - 0.5) * 0.02;
    out.rough = 0.82 + (noise - 0.5) * 0.12;

    // 织带压线：两条深色细线
    if (band > 0.06 && band < 0.12) {
      out.r *= 0.86;
      out.g *= 0.86;
      out.b *= 0.86;
      out.h -= 0.12;
    } else if (band > 0.48 && band < 0.53) {
      out.r *= 0.9;
      out.g *= 0.9;
      out.b *= 0.9;
      out.h -= 0.1;
    }
  });
}

/** 装具：橡胶/尼龙，细密颗粒。 */
function paintGear(p: Painter): void {
  const s = p.size;
  p.fill(240, 242, 242, 0.5, 0.78);

  p.each((x, y, u, v, out) => {
    const macro = p.noise.at(u, v);
    const pebble = p.coarse.at(u, v);
    const grain = p.rand() - 0.5;
    const k = 0.94 + macro * 0.1;
    out.r = 240 * k + grain * 6;
    out.g = 242 * k + grain * 6;
    out.b = 242 * k + grain * 6;
    out.h = 0.5 + (pebble - 0.5) * 0.16 + grain * 0.03;
    out.rough = 0.72 + (macro - 0.5) * 0.2;
  });

  // 磨蹭出来的亮痕
  for (let i = 0; i < 8; i += 1) {
    p.disc(p.rand() * s, p.rand() * s, (0.02 + p.rand() * 0.06) * s, (k, out) => {
      const f = smoothstep(0, 0.9, k) * 0.4;
      out.r = mix(out.r, 252, f);
      out.g = mix(out.g, 252, f);
      out.b = mix(out.b, 252, f);
      out.rough = mix(out.rough, 0.42, f);
      out.h -= 0.04 * f;
    });
  }
}

/** 皮肤：极轻的色斑 + 毛孔（真人脸近看不能是一块塑料）。 */
function paintSkin(p: Painter): void {
  p.fill(246, 242, 238, 0.5, 0.86);

  p.each((x, y, u, v, out) => {
    const macro = p.coarse.at(u, v);
    const pores = p.rand() - 0.5;
    // 血色：红通道多一点、蓝少一点，整体只差 3%
    out.r = 246 + (macro - 0.5) * 12 + pores * 4;
    out.g = 242 + (macro - 0.5) * 10 + pores * 4;
    out.b = 238 + (macro - 0.5) * 9 + pores * 4;
    out.h = 0.5 + pores * 0.05 + (macro - 0.5) * 0.05;
    out.rough = 0.84 + (macro - 0.5) * 0.1;
  });
}

/* ============================================================
   注册表
   ============================================================ */

interface SurfaceSpec {
  size: number;
  tileMeters: number;
  seed: number;
  /** 法线强度：高度差 × 它。波纹、凸点要钝一点，织物要更钝 */
  normalStrength: number;
  paint(painter: Painter): void;
}

/**
 * 尺寸取舍：甲板是唯一铺满全屏的表面，512（2.8 米一张 → 5.5mm/像素）够用；
 * 其余 512（2~3.2 米一张 → 3.9~6mm/像素）。人物 256 就够 —— 士兵整个才 1.8 米高，
 * 屏幕上最多占几百像素，再大纯烧显存。
 *
 * 🔴 `tileMeters` 是**几何 UV 的唯一基准**（`level.ts` 的 `fitBoxUv` 用它算
 * `u *= 面宽 / tile`），HD 实拍贴图到货时只换图、不换这个值 —— 所以这里的数字
 * 必须按「实拍图一张覆盖多少米」来定，不能按程序化图案的喜好定：
 *
 *   deck          DiamondPlate009  2048px 里 34 个菱形 → 12 个/米的真实绊钉密度
 *   container     CorrugatedSteel005 竖波纹 → 10.6cm 一道（真箱 28.6cm，但纹素
 *                 密度优先：铺到 8 米去凑波纹间距，近看就是一片糊）
 *   containerDoor 名义 2.6（= CW），真正生效的是 `level.ts` 的 doorRepeat 把它
 *                 压成「一张图铺满一面门」，这里的值只用于 `pbr()` 的初值
 *   containerRoof CorrugatedSteel009 横向细波纹 → 8cm 一道（真实箱顶）
 *   steel         划痕 / 掉漆尺度，2 米一张正好
 *   wood          Planks021 一张 12 块板 → 20cm 一块
 */
const SPECS: Record<SurfaceKind, SurfaceSpec> = {
  deck: { size: 512, tileMeters: 2.8, seed: 0x1a2b, normalStrength: 5, paint: paintDeck },
  container: { size: 512, tileMeters: 3.2, seed: 0x2b3c, normalStrength: 6, paint: paintContainer },
  containerDoor: { size: 512, tileMeters: 2.6, seed: 0x3c4d, normalStrength: 6, paint: paintContainerDoor },
  containerRoof: { size: 512, tileMeters: 1.2, seed: 0x4d5e, normalStrength: 5, paint: paintContainerRoof },
  steel: { size: 512, tileMeters: 2, seed: 0x5e6f, normalStrength: 4, paint: paintSteel },
  wood: { size: 512, tileMeters: 2.4, seed: 0x6f70, normalStrength: 5, paint: paintWood },
  cloth: { size: 256, tileMeters: 1, seed: 0x7081, normalStrength: 2.5, paint: paintCloth },
  vest: { size: 256, tileMeters: 0.7, seed: 0x8192, normalStrength: 4, paint: paintVest },
  gear: { size: 256, tileMeters: 0.5, seed: 0x92a3, normalStrength: 3, paint: paintGear },
  skin: { size: 256, tileMeters: 0.4, seed: 0xa3b4, normalStrength: 1.5, paint: paintSkin },
};

const cache = new Map<SurfaceKind, SurfaceMaps>();

/**
 * 这张贴图覆盖多少米 —— **不建图，只读元数据**。
 *
 * `hd-textures.ts` 拉完实拍图后要用它填 `SurfaceMaps.tileMeters`，但如果直接调
 * `surfaceMaps()` 就会白画一遍 512² 的程序化图（每类十几毫秒，六类加起来够卡
 * 一个帧）。几何 UV 已经在 `buildLevel` 里按这个数字铺死了，两边必须是同一个来源。
 */
export function surfaceTileMeters(kind: SurfaceKind): number {
  return SPECS[kind].tileMeters;
}

export function surfaceMaps(kind: SurfaceKind): SurfaceMaps {
  const cached = cache.get(kind);
  if (cached) return cached;
  const spec = SPECS[kind];
  const painter = new Painter(spec.size, spec.tileMeters, spec.seed);
  spec.paint(painter);
  const maps: SurfaceMaps = {
    map: painter.colorTexture(),
    normalMap: painter.normalTexture(spec.normalStrength),
    roughnessMap: painter.roughnessTexture(),
    tileMeters: spec.tileMeters,
  };
  cache.set(kind, maps);
  return maps;
}
