import * as THREE from 'three';
import type { Collider } from './physics';
import type { Surface } from './types';

/**
 * 程序化关卡「运输船」—— 船体、集装箱阵列、狙击台、掩体、环境光。
 *
 * **没有任何外部资源**：几何体全是 Box / Cylinder / Sphere 拼的，贴图全部由
 * Canvas 2D 现画（甲板防滑纹、集装箱波纹、木纹、拉丝金属、天空渐变）。
 * 这不是「省事」，是硬要求 —— 商用贴图要么有版权风险，要么得打几百 KB 的包。
 *
 * ## 几何即碰撞
 *
 * 每一个 `block()` 调用同时做两件事：往场景里放一个 Mesh，往 `colliders` 里
 * 推一个 AABB。**只有一处例外**是 `collide: false` 的纯装饰（栏杆立柱、龙门吊
 * 横梁、狙击台护栏）—— 那些东西看得见但挡不住人，因为「能看见的横梁挡住子弹」
 * 会让玩家觉得子弹在空气里炸开。
 *
 * ## 坐标系
 *
 * three 原生系：x 右、y 上、z 朝屏幕外。甲板顶面 `y = 0`。
 * 保卫者出生在 `z = SPAWN_Z[0]`（船头方向），潜伏者在 `SPAWN_Z[1]`。
 * 船体尺寸 `52 × 26` 米 —— 早期版本是 80 米长，实测「跑图五分钟、交火五秒钟」。
 *
 * ## 缩短的方式：删中段，不是等比缩小
 *
 * 第一版缩图是把所有 z 坐标乘一个 `Z_SCALE = 52/80`（连集装箱长度一起缩到
 * 3.97 米）。那是错的：**箱子缩了、人没缩**，2.6 × 4.0 米的集装箱配 1.8 米的
 * 人物，看起来像儿童玩具货场，掩体的「高过人头 / 半身高」关系也全乱了。
 *
 * 现在改回**固定尺寸 + 删排数**：`CW/CH/CL` 永远是 2.6 / 2.6 / 6.1 米，
 * 压缩的是「中段空旷甲板」和「每个货圈的排数」（内圈 3 排 → 2 排、
 * 外圈 3 排 → 2 排）。所有 z 坐标直接写死，不再有缩放系数。
 */

/* ============================================================
   尺寸常量
   ============================================================ */

export const HALF_W = 13; // 船宽的一半，x ∈ [-13, 13] → 全宽 26 米
export const HALF_L = 26; // 船长的一半，z ∈ [-26, 26] → 全长 52 米
export const DECK_Y = 0;

const CW = 2.6; // 集装箱宽
const CH = 2.6; // 集装箱高
/**
 * 集装箱长。**固定 6.1 米，绝不跟地图一起缩。**
 *
 * 20 尺箱的真实尺寸就是 6.06 × 2.44 × 2.59，这里取整到 6.1 / 2.6。
 * 早先缩图时把它乘了 0.65 变成 3.97 米 —— 箱子比人还短，掩体关系全废。
 */
const CL = 6.1;

/** 两个阵营的出生线 z。`nearSpawn` 判定和重生点都用它。 */
export const SPAWN_Z: readonly [number, number] = [-HALF_L + 3, HALF_L - 3];

/**
 * 出生点横向分布。**6 个**：一队最多 6 人（6v6），第 0 个永远留给本机玩家。
 *
 * 最外侧 ±9（不是 ±9.5）：外圈集装箱在 x = 10.4~13.0，人机重生还带 ±0.8 的
 * 随机偏移，±9.5 + 偏移会把人塞进箱子里。中间四个等距插值（3.6 米一个），
 * 6 个并排也不会挤在一起。
 */
const SPAWN_X = [-9, -5.4, -1.8, 1.8, 5.4, 9] as const;

/** 站在出生点 ±这个距离内可以换枪。 */
export const SPAWN_ZONE = 7;

/* ============================================================
   导航网格（Bot 用）
   ============================================================ */

/**
 * 1.5 米格子图。**只覆盖甲板层**（y ≈ 0）。
 *
 * `walk` 是「几何上能不能站」，`reach` 是「从出生点泛洪能不能到」——
 * 两者都满足才是可走格。只做前者会让 Bot 试图走进集装箱围出来的死胡同，
 * 进去以后 A* 找不到出路，原地抽搐。
 */
export interface NavGrid {
  readonly cell: number;
  readonly x0: number;
  readonly z0: number;
  readonly nx: number;
  readonly nz: number;
  readonly walk: Int8Array;
  readonly reach: Int8Array;
  toIndex(x: number, z: number): number;
  center(index: number): { x: number; z: number };
  isWalkable(index: number): boolean;
  blockedAt(x: number, z: number): boolean;
  /** 两点之间是否直线可走（用来平滑路径，去掉多余的拐点） */
  segClear(ax: number, az: number, bx: number, bz: number): boolean;
}

/* ============================================================
   产物
   ============================================================ */

export interface Level {
  /** 所有关卡几何的父节点。引擎只管 `root` 的可见性，不逐个碰子节点。 */
  root: THREE.Group;
  colliders: Collider[];
  /** `[保卫者, 潜伏者]`，每个阵营按 `SPAWN_X` 一行 6 个点 */
  spawns: [THREE.Vector3[], THREE.Vector3[]];
  nav: NavGrid;
  /** 低画质要关阴影，得能拿到它 */
  sun: THREE.DirectionalLight;
  dispose(): void;
}

/* ============================================================
   贴图（Canvas 程序化生成）
   ============================================================ */

function canvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法获取 2D 上下文，贴图生成失败');
  draw(ctx, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // r152 起 `encoding` 换成 `colorSpace`；写 `SRGBColorSpace` 才不会整体发灰
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

/** 甲板：防滑钢板，64px 一块，带锈斑。整块甲板铺 13×26 次（一块 2×2 米）。 */
function textureDeck(): THREE.CanvasTexture {
  return canvasTexture(
    256,
    (g, w, h) => {
      // 贴图本身要偏亮：材质的 color 会**乘**在这上面，两张中灰相乘就是黑
      g.fillStyle = '#9aa2a9';
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 64) {
        for (let x = 0; x < w; x += 64) {
          g.fillStyle = (x / 64 + y / 64) % 2 ? '#a4acb3' : '#8f979e';
          g.fillRect(x + 1, y + 1, 62, 62);
        }
      }
      g.strokeStyle = 'rgba(0,0,0,0.42)';
      g.lineWidth = 2;
      for (let y = 0; y <= h; y += 64) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      for (let x = 0; x <= w; x += 64) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
      // 防滑凸点
      g.fillStyle = 'rgba(0,0,0,0.3)';
      for (let y = 9; y < h; y += 64) {
        for (let x = 9; x < w; x += 16) g.fillRect(x, y, 2, 2);
      }
      // 锈
      for (let i = 0; i < 70; i += 1) {
        g.fillStyle = `rgba(122,74,44,${(Math.random() * 0.15).toFixed(3)})`;
        g.beginPath();
        g.arc(Math.random() * w, Math.random() * h, Math.random() * 11 + 2, 0, 7);
        g.fill();
      }
    },
    // 重复次数 = 尺寸 / 2 米：x 方向 26 米铺 13 次，z 方向 52 米铺 26 次，
    // 一块钢板永远是 2×2 米。船缩短之后这里要跟着改，否则砖块会被拉长
    13,
    26,
  );
}

/** 集装箱：竖向波纹 + 上下边框。底色靠材质 `color` 染，所以这里画成白色。 */
function textureContainer(): THREE.CanvasTexture {
  return canvasTexture(256, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 12) {
      g.fillStyle = 'rgba(0,0,0,0.17)';
      g.fillRect(x, 0, 4, h);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x + 6, 0, 2, h);
    }
    g.fillStyle = 'rgba(0,0,0,0.30)';
    g.fillRect(0, 0, w, 15);
    g.fillRect(0, h - 15, w, 15);
    g.fillRect(0, 0, 8, h);
    g.fillRect(w - 8, 0, 8, h);
    for (let i = 0; i < 30; i += 1) {
      const rx = Math.random() * w;
      const ry = Math.random() * h;
      const rr = Math.random() * 15 + 3;
      const grad = g.createRadialGradient(rx, ry, 0, rx, ry, rr);
      grad.addColorStop(0, 'rgba(74,42,20,0.34)');
      grad.addColorStop(1, 'rgba(74,42,20,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(rx, ry, rr, 0, 7);
      g.fill();
    }
  });
}

/** 木板：横向板缝 + 随机木纹曲线。 */
function textureWood(): THREE.CanvasTexture {
  return canvasTexture(128, (g, w, h) => {
    g.fillStyle = '#c08f5c';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      g.fillStyle = 'rgba(0,0,0,0.10)';
      g.fillRect(0, y, w, 2);
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fillRect(0, y + 2, w, 1);
    }
    for (let i = 0; i < 90; i += 1) {
      g.strokeStyle = `rgba(90,58,30,${(Math.random() * 0.16).toFixed(3)})`;
      g.lineWidth = Math.random() * 1.6 + 0.4;
      const y0 = Math.random() * h;
      g.beginPath();
      g.moveTo(0, y0);
      g.bezierCurveTo(w * 0.3, y0 + Math.random() * 4 - 2, w * 0.6, y0 + Math.random() * 4 - 2, w, y0);
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.fillRect(0, 0, w, 3);
    g.fillRect(0, h - 3, w, 3);
  });
}

/** 拉丝金属：随机短划线 + 锈点 + 内描边。 */
function textureMetal(): THREE.CanvasTexture {
  return canvasTexture(128, (g, w, h) => {
    g.fillStyle = '#b0b8bf';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i += 1) {
      g.strokeStyle = `rgba(255,255,255,${(Math.random() * 0.1).toFixed(3)})`;
      g.lineWidth = Math.random() * 1.4;
      const x = Math.random() * w;
      const y = Math.random() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.random() * 18 - 9, y + Math.random() * 18 - 9);
      g.stroke();
    }
    for (let i = 0; i < 24; i += 1) {
      g.fillStyle = `rgba(110,70,40,${(Math.random() * 0.18).toFixed(3)})`;
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, Math.random() * 8 + 1, 0, 7);
      g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.30)';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, w - 3, h - 3);
  });
}

/** 天空：竖直渐变，贴在反面球上。 */
function textureSky(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('无法获取 2D 上下文，天空生成失败');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  // 整体比「真实阴天」亮一档：天空球是 MeshBasicMaterial（不吃光），
  // 它的亮度就是画面的上限 —— 天空压暗的话整个场景都跟着发灰
  grad.addColorStop(0.0, '#2c5c88');
  grad.addColorStop(0.42, '#78a8cc');
  grad.addColorStop(0.62, '#bcd8e8');
  grad.addColorStop(0.74, '#f0e2c8');
  grad.addColorStop(1.0, '#a3b6c2');
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* ============================================================
   建造
   ============================================================ */

interface BlockOptions {
  /** 底面高度，默认 0（甲板面） */
  y0?: number;
  /** 要不要真的放 Mesh（只要碰撞时设 false） */
  visible?: boolean;
  /** 要不要产生碰撞（纯装饰设 false） */
  collide?: boolean;
  /** 木箱可被子弹穿透 */
  pen?: boolean;
  surf?: Surface;
  cast?: boolean;
  receive?: boolean;
}

export function buildLevel(scene: THREE.Scene): Level {
  const colliders: Collider[] = [];
  const spawns: [THREE.Vector3[], THREE.Vector3[]] = [[], []];
  const root = new THREE.Group();
  root.name = 'transport-ship';
  scene.add(root);

  /* ---------- 贴图与材质 ---------- */

  const texDeck = textureDeck();
  const texContainer = textureContainer();
  const texWood = textureWood();
  const texMetal = textureMetal();
  const texSky = textureSky();

  /**
   * `metalness` 全部压在 0.3 以下。
   *
   * 场景里**没有环境贴图**，而 three 的金属材质靠 `envMap` 反射环境 —— 没有它，
   * 高 metalness 的表面会渲染成死黑（只能反射到黑色）。0.2~0.3 之间还能靠
   * 直接光照出一点金属感，再高就开始发暗。
   */
  const materials = {
    // ⚠️ 带贴图的材质一律 `color: 0xffffff`。
    //
    // `MeshStandardMaterial.color` 是**乘在贴图上的**：贴图 #6d737a × 颜色 #b6bbc1
    // 的乘积只有 0.07 的反照率，比水泥还黑 —— 这正是早期版本「整体发暗」的主因。
    // 让贴图自己承担颜色，材质色只用来调明暗（无贴图的那些才给具体颜色）。
    deck: new THREE.MeshStandardMaterial({ map: texDeck, color: 0xffffff, roughness: 0.8, metalness: 0.22 }),
    hull: new THREE.MeshStandardMaterial({ color: 0x64707a, roughness: 0.82, metalness: 0.18 }),
    rail: new THREE.MeshStandardMaterial({ color: 0x505a64, roughness: 0.7, metalness: 0.3 }),
    wood: new THREE.MeshStandardMaterial({ map: texWood, color: 0xffffff, roughness: 0.9, metalness: 0.02 }),
    metal: new THREE.MeshStandardMaterial({ map: texMetal, color: 0xffffff, roughness: 0.55, metalness: 0.3 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8d959d, roughness: 0.58, metalness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3b434a, roughness: 0.9, metalness: 0.15 }),
    containers: [
      new THREE.MeshStandardMaterial({ map: texContainer, color: 0xc44f36, roughness: 0.74, metalness: 0.2 }),
      new THREE.MeshStandardMaterial({ map: texContainer, color: 0x3a76a8, roughness: 0.74, metalness: 0.2 }),
      new THREE.MeshStandardMaterial({ map: texContainer, color: 0x378c60, roughness: 0.74, metalness: 0.2 }),
      new THREE.MeshStandardMaterial({ map: texContainer, color: 0xd39c2a, roughness: 0.74, metalness: 0.2 }),
    ],
  };

  /* ---------- 积木工具 ---------- */

  function block(
    x: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: THREE.Material,
    options: BlockOptions = {},
  ): THREE.Mesh | null {
    const y0 = options.y0 ?? 0;
    let mesh: THREE.Mesh | null = null;

    if (options.visible !== false) {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y0 + h / 2, z);
      mesh.castShadow = options.cast !== false;
      mesh.receiveShadow = options.receive !== false;
      root.add(mesh);
    }

    if (options.collide !== false) {
      colliders.push({
        // 用普通对象而不是 Vector3：物理层只读 .x/.y/.z，多一层 Vector3 只是浪费
        min: { x: x - w / 2, y: y0, z: z - d / 2 },
        max: { x: x + w / 2, y: y0 + h, z: z + d / 2 },
        pen: options.pen === true,
        surf: options.surf ?? 'metal',
      });
    }

    return mesh;
  }

  // 集装箱共用一份几何体：同尺寸的箱子有 20 多个，各建一份是纯浪费显存
  const containerGeometry = new THREE.BoxGeometry(CW, CH, CL);

  function container(x: number, z: number, level: number, colorIndex: number): void {
    const y0 = level * CH;
    const mesh = new THREE.Mesh(containerGeometry, materials.containers[colorIndex % 4]!);
    mesh.position.set(x, y0 + CH / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);

    colliders.push({
      min: { x: x - CW / 2, y: y0, z: z - CL / 2 },
      max: { x: x + CW / 2, y: y0 + CH, z: z + CL / 2 },
      pen: false,
      surf: 'metal',
    });
  }

  /* ============================================================
     1. 船体
     ============================================================ */

  // 甲板：顶面正好 y = 0
  block(0, 0, HALF_W * 2, 2.2, HALF_L * 2, materials.deck, { y0: -2.2, surf: 'metal' });

  // 舷侧：看得见 1.35 米高的挡板，碰撞体做到 5.35 米高 ——
  // 目的是「跳不出去掉进海里」，而不是视觉上真的有一堵墙
  block(-HALF_W, 0, 0.8, 1.35, HALF_L * 2, materials.rail, { y0: 0 });
  block(HALF_W, 0, 0.8, 1.35, HALF_L * 2, materials.rail, { y0: 0 });
  block(-HALF_W, 0, 0.8, 4.0, HALF_L * 2, materials.hull, { y0: 1.35, visible: false });
  block(HALF_W, 0, 0.8, 4.0, HALF_L * 2, materials.hull, { y0: 1.35, visible: false });

  // 船头 / 船尾挡墙
  block(0, -HALF_L, HALF_W * 2, 5, 1.4, materials.hull, { y0: 0 });
  block(0, HALF_L, HALF_W * 2, 5, 1.4, materials.hull, { y0: 0 });

  // 舷侧栏杆立柱（纯装饰，不挡人也不挡子弹）
  for (let z = -HALF_L + 2; z <= HALF_L - 2; z += 2.6) {
    block(-HALF_W + 0.15, z, 0.12, 0.9, 0.12, materials.steel, { collide: false, cast: false });
    block(HALF_W - 0.15, z, 0.12, 0.9, 0.12, materials.steel, { collide: false, cast: false });
  }

  /* ============================================================
     2. 集装箱阵列（左右镜像）

     每个货圈**两排**（原来是三排），删掉的是最靠近船头/船尾那排 —— 那一排
     原本只用来「填满中段空旷甲板」，删了正好把交战距离压下来，掩体密度不变。

     箱子长 6.1 米，所以同一列相邻两排的中心距必须 > 6.1 + 0.8（人要能过去），
     下面每组间距都是按这条算的，别随手改数字。
     ============================================================ */

  // 内圈 x = ±5.4，z 槽位 ±7 / ±17（±7 那排离中线近，向心端配三级攀爬）
  const innerPlan = [
    { z: 7, levels: 1 },
    { z: 17, levels: 2 },
    { z: -7, levels: 1 },
    { z: -17, levels: 2 },
  ];
  for (let i = 0; i < innerPlan.length; i += 1) {
    const plan = innerPlan[i]!;
    const color = (i * 7 + 1) % 4;
    container(5.4, plan.z, 0, color);
    if (plan.levels >= 2) container(5.4, plan.z, 1, (color + 1) % 4);
    container(-5.4, plan.z, 0, (color + 2) % 4);
    if (plan.levels >= 2) container(-5.4, plan.z, 1, (color + 3) % 4);
  }

  // 外圈 x = ±11.7，z 槽位 ±13.5 / ±22
  // ⚠️ 13.5 是下限：狙击台钢梯一直铺到 z = 9.6，再往里就撞上了
  const outerPlan = [
    { z: 13.5, levels: 1 },
    { z: 22, levels: 2 },
    { z: -13.5, levels: 1 },
    { z: -22, levels: 2 },
  ];
  for (let i = 0; i < outerPlan.length; i += 1) {
    const plan = outerPlan[i]!;
    const color = (i * 5 + 3) % 4;
    container(11.7, plan.z, 0, color);
    if (plan.levels >= 2) container(11.7, plan.z, 1, (color + 2) % 4);
    container(-11.7, plan.z, 0, (color + 1) % 4);
    if (plan.levels >= 2) container(-11.7, plan.z, 1, (color + 3) % 4);
  }

  /* ============================================================
     3. 两侧狙击台（对称）
     ============================================================ */

  function sniperDeck(side: number): void {
    const cx = side * 10.7;
    // 台体：3.4 宽 × 3.2 高 × 10 长（尺寸不跟地图缩，和人物比例对齐）
    block(cx, 0, 3.4, 3.2, 10.0, materials.steel, { y0: 0, surf: 'metal' });

    // 台面护栏：只挡视觉，可以越过开枪 —— 否则台子上的人完全没法还手
    block(cx, -5.05, 3.4, 0.9, 0.12, materials.rail, { y0: 3.2, collide: false });
    block(cx, 5.05, 3.4, 0.9, 0.12, materials.rail, { y0: 3.2, collide: false });
    block(cx - side * 1.7, 0, 0.12, 0.9, 10.0, materials.rail, { y0: 3.2, collide: false });

    // 楼梯：10 级，靠台面那级最高 —— `rise * (steps - s)` 让台阶从远到近逐级升高，
    // 于是每一级都是一个「实心柱」而不是悬空板，自动上台阶逻辑直接能爬。
    // 台面**两端各一段**：旧版只有 +z 端有梯子，两座台都只能从潜伏者半场登，
    // 保卫者想上自己的台得绕过整座 10 米台体 —— 隐性的半场优势。
    const steps = 10;
    const rise = 3.2 / steps;
    const run = 4.6 / steps;
    for (const zSign of [1, -1] as const) {
      for (let s = 0; s < steps; s += 1) {
        const z0 = zSign * (5 + s * run + run / 2);
        block(side * 12.05, z0, 1.7, rise * (steps - s), run, materials.steel, { y0: 0 });
      }
    }
  }
  sniperDeck(1);
  sniperDeck(-1);

  /* ============================================================
     4. 龙门吊（两根立柱有碰撞，横梁纯装饰）
     ============================================================ */

  block(-12.7, 0, 0.6, 9, 0.6, materials.steel, { y0: 0 });
  block(12.7, 0, 0.6, 9, 0.6, materials.steel, { y0: 0 });
  block(0, 0, 26, 0.9, 1.1, materials.steel, { y0: 9, collide: false });
  block(0, 0, 26, 0.3, 0.5, materials.dark, { y0: 8.7, collide: false, cast: false });
  // 吊具
  block(3, 0, 2.4, 1.2, 2.4, materials.dark, { y0: 6.4, collide: false });
  block(3, 0, 0.1, 2.0, 0.1, materials.steel, { y0: 7.6, collide: false, cast: false });

  /* ============================================================
     5. 掩体：木箱可穿，铁箱不可穿

     布局按「出生掩体 → 过渡场 → 开阔带 → 中央 crossing」分层，
     全图关于原点**中心对称**（转 180° 两边互换），双方条件一致：

     - 中央一只集装箱横在 z=0：旧版 x=0 一线从出生点到出生点 46 米
       完全通视（midCover 都在 ±2.4~±3.0，不在轴线上），AWM 能从船头
       架到船尾 —— 「蹲守点」的根源。这只箱是唯一的大件遮挡。
     - 内圈箱的向心端配三级攀爬（木箱 1.0 → 铁箱 1.9 → 箱顶 2.6，
       落差 1.0/0.9/0.7 都在跳高 1.09m 内）。位置从旧版 (±2.5/±3.7,
       ±4.8) 挪到 (±5.4, ±2.0/±3.3)：旧位置插在 crossing 出口把通道
       挤窄，而且铁箱嵌进集装箱 0.25 米、和木箱叠 0.1 米（穿模）；
       新位置面对面贴合、零嵌叠，也不占 crossing 的 2.8 米通道。
     - 两片过渡场（z≈±4~10、±14~20）各放一对**斜错位**低箱+铁箱打断
       场内长通视；开阔带（z≈±10~14）刻意全空 —— 正面交火发生在这里，
       形成「掩体—开阔—掩体」的节奏。
     - 侧巷（内圈箱与狙击台/外圈箱之间）各留两件掩体。坐标必须让
       导航格心（x=8.25 / 9.75）落进缝隙，否则 Bot 的泛洪会把整条
       巷判成不可达，永远只走中路。
     ============================================================ */

  function crate(x: number, z: number, size: number, height: number): void {
    block(x, z, size, height, size, materials.wood, { y0: 0, pen: true, surf: 'wood' });
  }

  function metalBox(x: number, z: number, size: number, height: number): void {
    block(x, z, size, height, size, materials.metal, { y0: 0, pen: false, surf: 'metal' });
  }

  // 中央 crossing：一只集装箱横在船中，拦腰截断出生对狙的 46 米通视，
  // 两侧各留 2.8 米通道绕行
  container(0, 0, 0, 1);

  // 攀爬阶梯：贴内圈箱向心端，木箱→铁箱→箱顶；所有接触面贴合不嵌叠
  function climbSet(sx: number, sz: number): void {
    crate(sx * 5.4, sz * 2.0, 1.3, 1.0);
    metalBox(sx * 5.4, sz * 3.3, 1.3, 1.9);
  }
  climbSet(1, 1);
  climbSet(-1, 1);
  climbSet(1, -1);
  climbSet(-1, -1);

  // 近场（z≈±4~10）：低箱 + 铁箱斜错摆放，两侧绕行空间都 ≥2 米
  crate(-2.2, 6.6, 1.5, 1.05);
  metalBox(2.5, 8.2, 1.6, 1.9);
  crate(2.2, -6.6, 1.5, 1.05);
  metalBox(-2.5, -8.2, 1.6, 1.9);

  // 开阔带（z≈±10~14）：不放任何东西

  // 远场（z≈±14~20）：同样斜错；低箱贴内圈箱内壁，读作「靠箱堆放」
  metalBox(1.9, 16.2, 1.6, 1.9);
  crate(-3.45, 15.8, 1.3, 1.05);
  metalBox(-1.9, -16.2, 1.6, 1.9);
  crate(3.45, -15.8, 1.3, 1.05);

  // 侧巷掩体：铁箱守楼梯脚（x=10.5 贴梯不堵巷），木箱守巷口
  // （x=9.55 贴外圈箱外壁，留出 x∈[6.7,8.9] 的通行带）
  metalBox(10.5, 8.0, 1.2, 1.6);
  crate(9.55, 14.8, 1.3, 1.0);
  metalBox(-10.5, -8.0, 1.2, 1.6);
  crate(-9.55, -14.8, 1.3, 1.0);

  // 出生点掩体：旧版 x=0 出生位正前方完全裸奔，正中补一只铁箱
  // （1.9 米高，蹲站都藏得住；离最近出生位 ≥2.6 米，复活不卡模）
  crate(2.6, 20.5, 1.6, 1.05);
  crate(-2.6, 20.5, 1.6, 1.05);
  crate(2.6, -20.5, 1.6, 1.05);
  crate(-2.6, -20.5, 1.6, 1.05);
  metalBox(0, 19.4, 1.5, 1.9);
  metalBox(0, -19.4, 1.5, 1.9);
  metalBox(-8.2, 20, 1.5, 1.9);
  metalBox(8.2, 20, 1.5, 1.9);
  metalBox(-8.2, -20, 1.5, 1.9);
  metalBox(8.2, -20, 1.5, 1.9);

  /* ============================================================
     6. 出生点
     ============================================================ */

  for (const x of SPAWN_X) {
    spawns[0].push(new THREE.Vector3(x, 0, SPAWN_Z[0]));
    spawns[1].push(new THREE.Vector3(x, 0, SPAWN_Z[1]));
  }

  /* ============================================================
     7. 环境：天空球 / 海面 / 远景港口
     ============================================================ */

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(600, 24, 16),
    new THREE.MeshBasicMaterial({
      map: texSky,
      side: THREE.BackSide,
      fog: false,
      // 天空球永远在最远处，写深度只会跟雾打架
      depthWrite: false,
    }),
  );
  scene.add(sky);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x27455c, roughness: 0.42, metalness: 0.55 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -3.2;
  sea.receiveShadow = false;
  scene.add(sea);

  // 远景港口剪影：只为了地平线上有点东西，不受光照、吃雾
  const farMaterial = new THREE.MeshBasicMaterial({ color: 0x4a5c68 });
  for (let i = 0; i < 10; i += 1) {
    const w = 12 + Math.random() * 26;
    const h = 8 + Math.random() * 26;
    const silhouette = new THREE.Mesh(new THREE.BoxGeometry(w, h, 10), farMaterial);
    silhouette.position.set(-260 + i * 58, -3 + h / 2, -300 + Math.random() * 60);
    scene.add(silhouette);
  }

  /* ============================================================
     8. 光照
     ============================================================ */

  // 天光：上蓝下灰，负责「阴影里也看得见东西」。
  // 强度给得比物理上合理值高：这张图有一半时间玩家在看集装箱的背光面，
  // 那一片如果只靠太阳，会暗到分不清箱体和缝
  scene.add(new THREE.HemisphereLight(0xd8e8f6, 0x6a727a, 1.7));

  const sun = new THREE.DirectionalLight(0xfff4e2, 3.0);
  sun.position.set(46, 58, 24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -36;
  sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 36;
  sun.shadow.camera.bottom = -36;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0006;
  // normalBias 比 bias 好用：bias 会把影子整体推离物体，产生「浮空」感；
  // normalBias 沿法线推，接缝小得多
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  /* ============================================================
     9. 导航网格
     ============================================================ */

  const nav = buildNav(colliders);

  return {
    root,
    colliders,
    spawns,
    nav,
    sun,
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      const seenMaterials = new Set<THREE.Material>();

      const collectMaterial = (material: THREE.Material) => {
        if (seenMaterials.has(material)) return;
        seenMaterials.add(material);
        const textured = material as THREE.MeshStandardMaterial;
        textured.map?.dispose();
        material.dispose();
      };

      root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) geometries.add(mesh.geometry);
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach(collectMaterial);
        else if (material) collectMaterial(material);
      });

      sky.geometry.dispose();
      collectMaterial(sky.material as THREE.Material);
      sea.geometry.dispose();
      collectMaterial(sea.material as THREE.Material);
      farMaterial.dispose();
      geometries.add(containerGeometry);
      geometries.forEach((geometry) => geometry.dispose());
    },
  };
}

/* ============================================================
   导航网格
   ============================================================ */

function buildNav(colliders: readonly Collider[]): NavGrid {
  const cell = 1.5;
  // 只铺甲板内部：两边各留 0.6 米，免得最外圈格子有一半悬在舷外。
  // 格子数取整之后**按格宽重新居中**，否则网格会偏向一侧（右侧少半米走不了）
  const nx = Math.round(((HALF_W - 0.6) * 2) / cell) + 1;
  const nz = Math.round(((HALF_L - 1) * 2) / cell) + 1;
  const x0 = (-(nx - 1) * cell) / 2;
  const z0 = (-(nz - 1) * cell) / 2;

  const walk = new Int8Array(nx * nz);

  const center = (index: number) => ({
    x: x0 + (index % nx) * cell,
    z: z0 + Math.floor(index / nx) * cell,
  });

  /**
   * 某个点能不能站人。
   *
   * 判定用的是「一个 0.9 米宽的方柱」，比玩家实际半径（0.4）略宽 —— 留出的
   * 余量让 Bot 不会贴着墙角蹭过去然后卡在 1 厘米的缝里。
   *
   * 高度上的两个例外：低于 0.25 米的东西可以踩过去（甲板接缝），高于 1.7 米的
   * 东西在头顶之上（龙门吊横梁），都不算阻挡。
   */
  function blockedAt(x: number, z: number): boolean {
    for (let i = 0; i < colliders.length; i += 1) {
      const box = colliders[i]!;
      if (x + 0.45 <= box.min.x || x - 0.45 >= box.max.x) continue;
      if (z + 0.45 <= box.min.z || z - 0.45 >= box.max.z) continue;
      if (box.max.y <= 0.25) continue;
      if (box.min.y >= 1.7) continue;
      return true;
    }
    return false;
  }

  for (let iz = 0; iz < nz; iz += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const x = x0 + ix * cell;
      const z = z0 + iz * cell;
      walk[iz * nx + ix] = blockedAt(x, z) ? 0 : 1;
    }
  }

  /**
   * 从两侧出生点做泛洪，标出「真的走得到」的格子。
   *
   * 不做这一步的话，集装箱围出来的死胡同也是 `walk = 1`，Bot 一路 A* 冲进去，
   * 到了才发现没有出口 —— 表现就是「Bot 走进集装箱缝里站着不动」。
   */
  const reach = new Int8Array(nx * nz);
  const queue: number[] = [];

  const seed = (x: number, z: number) => {
    const ix = Math.round((x - x0) / cell);
    const iz = Math.round((z - z0) / cell);
    if (ix < 0 || ix >= nx || iz < 0 || iz >= nz) return;
    const index = iz * nx + ix;
    if (!walk[index] || reach[index]) return;
    reach[index] = 1;
    queue.push(index);
  };
  seed(0, SPAWN_Z[0] + 1);
  seed(0, SPAWN_Z[1] - 1);

  const NEIGHBOURS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;

  while (queue.length > 0) {
    const current = queue.pop()!;
    const cx = current % nx;
    const cz = Math.floor(current / nx);
    for (const [dx, dz] of NEIGHBOURS) {
      const nix = cx + dx;
      const niz = cz + dz;
      if (nix < 0 || nix >= nx || niz < 0 || niz >= nz) continue;
      const next = niz * nx + nix;
      if (!walk[next] || reach[next]) continue;
      reach[next] = 1;
      queue.push(next);
    }
  }

  return {
    cell,
    x0,
    z0,
    nx,
    nz,
    walk,
    reach,
    toIndex(x: number, z: number): number {
      const ix = Math.round((x - x0) / cell);
      const iz = Math.round((z - z0) / cell);
      if (ix < 0 || ix >= nx || iz < 0 || iz >= nz) return -1;
      return iz * nx + ix;
    },
    center,
    isWalkable(index: number): boolean {
      return index >= 0 && walk[index] === 1 && reach[index] === 1;
    },
    blockedAt,
    /**
     * 线段通行检查。
     *
     * 只用来**平滑路径**（把一串格子拐点换成几个直线可达的跳点），所以采样
     * 步长 0.7 米够用 —— 玩家看不见的那 30 厘米误差无所谓，但如果这里太粗，
     * 平滑后的路径会让 Bot 蹭着集装箱角走。
     */
    segClear(ax: number, az: number, bx: number, bz: number): boolean {
      const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.7);
      for (let s = 1; s < steps; s += 1) {
        const t = s / steps;
        if (blockedAt(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
      }
      return true;
    },
  };
}

/**
 * 最近的可走格点。
 *
 * 掉出船体 / 坐标被写成 NaN 时用。**不回出生点** —— 死亡已经够打断节奏了，
 * 再让人从船头重跑一趟就是「跑马拉松」。线性扫全表（18×34 ≈ 600 格）只在
 * 出错时调一次，不值得为它建索引。
 */
export function nearestWalkablePoint(
  nav: NavGrid,
  x: number,
  z: number,
): { x: number; z: number } | null {
  const fromX = Number.isFinite(x) ? x : 0;
  const fromZ = Number.isFinite(z) ? z : 0;

  let best: { x: number; z: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < nav.walk.length; i += 1) {
    if (!nav.isWalkable(i)) continue;
    const center = nav.center(i);
    const dx = center.x - fromX;
    const dz = center.z - fromZ;
    const distance = dx * dx + dz * dz;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = center;
    }
  }

  return best;
}
