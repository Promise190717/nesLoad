import * as THREE from 'three';

/**
 * 武器 PBR 贴图 —— 全部运行时用 Canvas 2D 画出来，**零静态资源**。
 *
 * 路线 A 的核心：枪「糙」往往不是面数低，而是材质平。这里给三类表面各配齐
 * 三张贴图，让 `MeshStandardMaterial` 真正有东西可算：
 *
 *   map        底色（**以灰度为主**，上色交给材质的 `color`，一张贴图多种配色）
 *   normalMap  法线：拉丝、防滑颗粒、木纹、划痕凹槽都靠它出细节
 *   ormMap     三合一打包：R = AO、G = roughness、B = metalness（恒 1，
 *              实际金属度仍由材质标量决定）。一张图喂三个槽，省两次采样
 *
 * 做旧思路（不引入外部磨损遮罩）：
 *   - 划痕 = 露出的金属底：底色画亮、粗糙度拉低、法线压出凹槽，三者**逐像素对齐**
 *   - 污渍 = 粗糙度拉高 + AO 压暗 + 底色画暗斑，摸上去「发乌」的就是它
 *
 * ⚠️ 三张图**统一用 CanvasTexture**：`DataTexture` 的 `flipY` 默认是 false，
 * 和 CanvasTexture 混用会让划痕与凹槽在 V 方向错位，这里不要混。
 *
 * ⚠️ 生命周期 = 模块级缓存，和 `weapons.ts` 的共享材质同寿命。**不要**在
 * engine.dispose 里清这些贴图：材质缓存不会重建，重进游戏页就会引用已释放的
 * 贴图（枪变全黑）。页面卸载时由浏览器统一回收。
 */

/** 贴图边长。512 足够：枪最多占三分之一屏宽，更大只是白吃显存。 */
const SIZE = 512;

export interface PbrTextureSet {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  ormMap: THREE.CanvasTexture;
}

export interface WeaponTextureLibrary {
  metal: PbrTextureSet;
  wood: PbrTextureSet;
  polymer: PbrTextureSet;
}

let cache: WeaponTextureLibrary | null = null;

export function weaponTextures(): WeaponTextureLibrary {
  if (!cache) {
    cache = { metal: buildSet('metal'), wood: buildSet('wood'), polymer: buildSet('polymer') };
  }
  return cache;
}

/* ============================================================
   确定性随机：每次进游戏贴图都一样，方便肉眼对比调参
   ============================================================ */

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

/* ============================================================
   像素层：底色 canvas + 高度 / 粗糙度 / AO 三个数组（互相对齐）
   ============================================================ */

interface PixelLayer {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  height: Float32Array;
  roughness: Float32Array;
  ao: Float32Array;
  rand: () => number;
}

type SurfaceKind = 'metal' | 'wood' | 'polymer';

function createLayer(kind: SurfaceKind): PixelLayer {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('weapon-textures: 2d context unavailable');

  const layer: PixelLayer = {
    ctx,
    canvas,
    height: new Float32Array(SIZE * SIZE),
    roughness: new Float32Array(SIZE * SIZE),
    ao: new Float32Array(SIZE * SIZE).fill(1),
    rand: mulberry32(kind === 'metal' ? 0xa17 : kind === 'wood' ? 0xb33 : 0xc5),
  };

  const { rand } = layer;
  const image = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const i = y * SIZE + x;
      let gray: number;
      if (kind === 'metal') {
        // 细噪 + 水平拉丝：金属板材的「轧制感」
        const brush = Math.sin(y * 1.7) * 4 + Math.sin(y * 0.43) * 5;
        gray = 228 + (rand() - 0.5) * 16 + brush;
        layer.height[i] = 0.5 + (rand() - 0.5) * 0.06 + brush * 0.006;
        layer.roughness[i] = 0.6 + (rand() - 0.5) * 0.16;
      } else if (kind === 'wood') {
        // 顺纹波条：x 方向快变、y 方向慢扰动，出来的是竖向木纹
        const grain = Math.sin(x * 0.16 + Math.sin(y * 0.018) * 2.6 + Math.sin(y * 0.05 + x * 0.01) * 0.8);
        gray = 196 + grain * 42 + (rand() - 0.5) * 12;
        layer.height[i] = 0.5 + grain * 0.1 + (rand() - 0.5) * 0.03;
        layer.roughness[i] = 0.74 + grain * 0.1;
      } else {
        // 防滑麻面：逐像素颗粒，法线强度给足就是磨砂塑料
        gray = 222 + (rand() - 0.5) * 22;
        layer.height[i] = 0.5 + (rand() - 0.5) * 0.5;
        layer.roughness[i] = 0.86 + rand() * 0.1;
      }
      const v = Math.max(0, Math.min(255, Math.round(gray)));
      const p = i * 4;
      image.data[p] = v;
      image.data[p + 1] = v;
      image.data[p + 2] = v;
      image.data[p + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return layer;
}

/** 在「(x,y) 附近 r 半径内」同步修改三个数组 + 底色，做旧的两个主角都用它。 */
function paintSpot(
  layer: PixelLayer,
  cx: number,
  cy: number,
  radius: number,
  apply: (i: number, falloff: number) => number,
): void {
  const r = Math.ceil(radius);
  for (let y = Math.max(0, cy - r); y <= Math.min(SIZE - 1, cy + r); y += 1) {
    for (let x = Math.max(0, cx - r); x <= Math.min(SIZE - 1, cx + r); x += 1) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist > radius) continue;
      const falloff = 1 - dist / radius;
      const gray = apply(y * SIZE + x, falloff);
      layer.ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
      layer.ctx.fillRect(x, y, 1, 1);
    }
  }
}

/** 一道划痕：露出的金属底更亮、更光、带凹槽。三个数组与底色逐步打点，保证对齐。 */
function paintScratch(layer: PixelLayer): void {
  const { rand } = layer;
  const x0 = rand() * SIZE;
  const y0 = rand() * SIZE;
  const angle = rand() * Math.PI;
  const length = 8 + rand() * 48;
  const bright = 235 + Math.floor(rand() * 20);
  layer.ctx.fillStyle = `rgb(${bright},${bright},${bright})`;
  for (let t = 0; t < length; t += 1) {
    const x = Math.round(x0 + Math.cos(angle) * t);
    const y = Math.round(y0 + Math.sin(angle) * t);
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
    const i = y * SIZE + x;
    layer.height[i] = 0.22;
    layer.roughness[i] = 0.32;
    layer.ctx.fillRect(x, y, 1, 1);
  }
}

/* ============================================================
   组装：height → 法线，roughness/ao → ORM
   ============================================================ */

function makeTexture(canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4; // 枪身大量斜视角度，便宜且明显的清晰度提升
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildSet(kind: SurfaceKind): PbrTextureSet {
  const layer = createLayer(kind);

  if (kind === 'metal') {
    // 划痕（露白）与污渍（发乌）是「用过一段时间的枪」的全部线索
    for (let i = 0; i < 46; i += 1) paintScratch(layer);
    for (let i = 0; i < 10; i += 1) {
      const cx = Math.floor(layer.rand() * SIZE);
      const cy = Math.floor(layer.rand() * SIZE);
      const radius = 18 + layer.rand() * 42;
      paintSpot(layer, cx, cy, radius, (idx, falloff) => {
        layer.roughness[idx] = Math.min(1, layer.roughness[idx]! + falloff * 0.3);
        layer.ao[idx] = 1 - falloff * 0.25;
        return 200 - Math.round(falloff * 40);
      });
    }
  } else if (kind === 'wood') {
    // 顺纹裂缝：比波条更深更细的竖向短线，木头的「干裂感」
    for (let i = 0; i < 22; i += 1) {
      const x = Math.floor(layer.rand() * SIZE);
      const y0 = Math.floor(layer.rand() * SIZE);
      const length = 20 + layer.rand() * 90;
      for (let t = 0; t < length; t += 1) {
        const y = (y0 + t) % SIZE;
        const idx = y * SIZE + x;
        layer.height[idx] = 0.24;
        layer.roughness[idx] = 0.92;
        layer.ctx.fillStyle = 'rgb(120,120,120)';
        layer.ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  /* ---- 法线：对高度图做中心差分。环绕采样让 repeat 接缝处也连续 ---- */
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = SIZE;
  normalCanvas.height = SIZE;
  const normalCtx = normalCanvas.getContext('2d');
  if (!normalCtx) throw new Error('weapon-textures: 2d context unavailable');
  const normalImage = normalCtx.createImageData(SIZE, SIZE);
  // 强度按表面类型给：金属只留细纹，聚合物的颗粒要看得见凹凸
  const strength = kind === 'polymer' ? 1.6 : kind === 'wood' ? 3.2 : 5;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const xm = (x - 1 + SIZE) % SIZE;
      const xp = (x + 1) % SIZE;
      const ym = (y - 1 + SIZE) % SIZE;
      const yp = (y + 1) % SIZE;
      const dx = (layer.height[y * SIZE + xp]! - layer.height[y * SIZE + xm]!) * strength;
      const dy = (layer.height[yp * SIZE + x]! - layer.height[ym * SIZE + x]!) * strength;
      // n = (-dh/du, -dh/dv, 1)。canvas 的 y 向下而 CanvasTexture flipY = true，
      // 所以 dh/dv = -dy_canvas，绿通道取 +dy
      const inv = 1 / Math.hypot(dx, dy, 1);
      const p = (y * SIZE + x) * 4;
      normalImage.data[p] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      normalImage.data[p + 1] = Math.round((dy * inv * 0.5 + 0.5) * 255);
      normalImage.data[p + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      normalImage.data[p + 3] = 255;
    }
  }
  normalCtx.putImageData(normalImage, 0, 0);

  /* ---- ORM：R = AO、G = roughness、B = metalness（恒 1，标量在材质上） ---- */
  const ormCanvas = document.createElement('canvas');
  ormCanvas.width = SIZE;
  ormCanvas.height = SIZE;
  const ormCtx = ormCanvas.getContext('2d');
  if (!ormCtx) throw new Error('weapon-textures: 2d context unavailable');
  const ormImage = ormCtx.createImageData(SIZE, SIZE);
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    const p = i * 4;
    ormImage.data[p] = Math.round(layer.ao[i]! * 255);
    ormImage.data[p + 1] = Math.round(Math.max(0, Math.min(1, layer.roughness[i]!)) * 255);
    ormImage.data[p + 2] = 255;
    ormImage.data[p + 3] = 255;
  }
  ormCtx.putImageData(ormImage, 0, 0);

  return {
    map: makeTexture(layer.canvas, true),
    normalMap: makeTexture(normalCanvas, false),
    ormMap: makeTexture(ormCanvas, false),
  };
}
