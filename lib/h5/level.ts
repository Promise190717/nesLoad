import * as THREE from 'three';
import type { Collider } from './physics';
import { surfaceMaps, type SurfaceMaps } from './surface-textures';
import type { Surface } from './types';

/**
 * 程序化关卡「运输船」—— 船体、集装箱阵列、狙击台、掩体、环境光。
 *
 * **没有任何外部资源**：几何体全是 Box / Cylinder / Sphere 拼的，贴图全部由
 * Canvas 2D 现画（见 `surface-textures.ts`：每种表面一张底色 + 一张法线 +
 * 一张粗糙度）。这不是「省事」，是硬要求 —— 商用贴图要么有版权风险，要么
 * 得打几百 KB 的包。
 *
 * ## 贴图为什么按「米」铺（2026-11-13 真实度轮）
 *
 * 旧版所有盒子的 UV 都是 0..1，一张 128px 的金属图同时铺在 1.1 米的铁箱和
 * 10 米长的台面上 —— 纹素密度差十倍，近看是一团糊、远看是一片噪点，而且
 * **只有底色没有法线**，凹凸全画在颜色里，光怎么打都不变。现在每个盒子按
 * `fitBoxUv()` 把 UV 乘成「面宽 / 贴图覆盖米数」，纹素密度全场一致；三种贴图
 * 各管一件事（颜色 / 凹凸 / 反光），跑动时表面才有反应。
 *
 * ## 几何即碰撞
 *
 * 每一个 `block()` 调用同时做两件事：往场景里放一个 Mesh，往 `colliders` 里
 * 推一个 AABB。**只有一处例外**是 `collide: false` 的纯装饰（栏杆立柱、吊机
 * 桁架、狙击台护栏、甲板中线）—— 那些东西看得见但挡不住人，因为「能看见的
 * 横梁挡住子弹」会让玩家觉得子弹在空气里炸开。
 *
 * ## 坐标系
 *
 * three 原生系：x 右、y 上、z 朝屏幕外。甲板顶面 `y = 0`。
 * 潜伏者出生在 `z = SPAWN_Z[0]`（船头方向），保卫者在 `SPAWN_Z[1]`。
 *
 * ## 尺寸沿革：80 → 52 → 42 → 50 → **44 × 22**
 *
 * 前几轮一路在缩（「跑图太远、交火太少」），第六轮又按 CF 俯视图拉回 50 米。
 * 这一轮用户要求「长度和宽度都缩小」，缩到 **44 × 22**（`HALF_L` 25 → 22，
 * `HALF_W` 13 → 11），比例仍是 1:2 的细长条。
 *
 * 出生的对穿距离 38 米，`SPEED_RUN` 5.5 m/s 合 6.9 秒 —— 比 50 米那版的 8 秒
 * 收紧一档，但不至于像 42 米那版一样贴脸。
 *
 * 宽度是跟着**狙击台**走的：台体 3.4 宽、外沿要嵌进舷板 0.3 米，所以
 * `HALF_W` 每减 1 米，台心就跟着内移 1 米（见第 2 节）。缩宽度不是简单
 * 改一个常量，台子的 x 必须同时挪，否则会穿出舷墙。
 *
 * ⚠️ 缩放只动**地图，不动箱子**。第一轮的教训是拿 `Z_SCALE = 52/80` 把
 * 集装箱一起缩到 3.97 米 —— 箱子缩了、人没缩，2.6×4.0 的箱子配 1.8 米的人，
 * 看起来像儿童玩具货场，掩体的「高过人头 / 半身高」关系全乱。
 * `CW/CH/CL` 永远 2.6 / 2.6 / 6.1，改图只改坐标，不许再引入缩放系数。
 *
 * ## 第七轮（2026-11-13 晚）：照三张实景角度图重排 —— 当「货舱」摆，不当「关卡」摆
 *
 * 上一版只看了俯视剪影，把箱子当对称掩体在摆：每舷两只 20 尺箱、中场两条
 * 错位方箱斜带、四组攀爬阶梯、一圈铁箱在场上铺开，配色沙黄锈橙。用户给了
 * 三张实景角度图后指出「地图有问题」—— 问题不在箱子数量，在**它不像一条
 * 装满货的船**。照图重读到四件事：
 *
 * 1. **舷侧是整排 40 尺箱**。实景里两条长边是首尾相接、长边平行舷墙的一整排，
 *    从楼梯口一直铺到船尾，不是孤立的四个岛。当时每舷放了一只 12.2 米的
 *    40 尺箱（`CL40`），占 z 9.8~22.0 —— 侧巷因此成了真正的「走廊」。
 *    ⚠️ **这一条在第八轮被用户否掉了**，四只箱子已删，`CL40` 也一起删了。
 * 2. **中路是空的 + 散货**。实景中段是一大片空甲板，只有几只散放的箱子和小
 *    木箱。上一版那两条对称斜带 + 铁箱阵读起来像 CS 的 box 图，全删了。
 * 3. **配色是冷调**。实景的箱体是米白 / 军绿 / 深绿 / 蓝灰，甲板是**蓝灰钢**
 *    而不是中灰水泥。上一版的沙黄 + 锈橙太暖，俯视一眼不像货轮。
 * 4. **吊机在一角**。实景的吊是立在船头的黄色格构吊臂，不是横跨全船的龙门
 *    吊 —— 旧版那两根 x = ±12.7 的立柱正好顶在侧巷里，跑起来像钻门框。
 *
 * ## 第八轮（2026-11-13）：删舷侧四只箱 + 长宽各收一档
 *
 * 用户圈着俯视图上那四只贴舷的 40 尺箱，原话「两侧这四个箱子去除 另外地图
 * 长度和宽度都缩小」。
 *
 * - **四只箱子连同 `CL40` / `container()` 的 `long` 选项一起删掉**。现在两条
 *   长边是空甲板，掩体全压在中路散货和两座狙击台上 —— 也因此**别再把箱子
 *   排成一条墙**，用户要的是敞开的舷侧。
 * - **26 × 50 → 22 × 44**。宽度不是改个常量就完事：狙击台心 `cx` 必须跟着
 *   `HALF_W` 内移 2 米（10.7 → 8.7），楼梯 12.05 → 10.05，否则台子穿出舷墙。
 * - 散货坐标整体内收重排，**受导航格约束**（见第 4 节开头）：22 米宽之后
 *   只剩 15 列格子，箱子外沿落在 5.55 附近会把整条侧巷判成不可达。
 * - 吊机跟着船头角挪到 (-9.7, -20.9)，臂长 20 → 18 米（臂尖仍落在中偏船头）。
 * - 甲板贴图 repeat 11×22、阴影相机 ±34 → ±30。
 *
 * ## 依然不做真旋转
 *
 * 实景中路那几只斜着摆的箱子是这张图最强的识别点，但物理层是纯 AABB
 * （见 `physics.ts` 头部：「明确不做斜坡」），要上真旋转就得同时改
 * `collideAt` / `rayWorld` / `buildNav`，还要给 `pushAxis` 定义「沿局部轴推出」
 * —— 那是「偶发瞬移」那条 bug 的重灾区，收益配不上风险。
 *
 * 折中：散货用「一只平行 + 一只垂直（`alongX`）」错开，俯视读起来是散的而
 * 不是对称的。`alongX` 是绕 y 转 90°，碰撞盒只是宽深互换，物理层零改动。
 * 唯一真旋转的是船头吊臂 —— 它在 `THREE.Group` 里、**完全不进碰撞表**，
 * 转多少度都不影响物理。
 */

/* ============================================================
   尺寸常量
   ============================================================ */

export const HALF_W = 11; // 船宽的一半，x ∈ [-11, 11] → 全宽 22 米
export const HALF_L = 22; // 船长的一半，z ∈ [-22, 22] → 全长 44 米
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
 * 最外侧从 ±9 收到 **±7.6**（2026-11-13 用户：「不要总在复活点的角落复活」）。
 * 原来的 ±9 只离舷墙内壁（±10.6）1.6 米，两条长边现在又是空甲板 —— 从那儿
 * 站起来纯粹是「又被塞进甲板角落」，既没有掩体收益也没有战术意义；俯视看
 * 那两格就是地图的四个角。收进来之后离舷墙 3 米，`z` 不动，出生线仍是直线。
 *
 * 中间四格的坐标不能随便改：出生区正前方有掩体（`metalBox(0, ±16)`、
 * `crate(±4.2, ±17)`），所以 **x = 0 和 x = ±4.2 附近必须空着**，否则复活
 * 出来第一步就顶着箱子。再留出玩家 ±0.8 / 人机 ±0.5 的落脚偏移（最坏 1.3），
 * 相邻两格至少要有 2.4 的距离 —— 下面这个 2.4 / 3.4 / 3.6 / 3.4 / 2.4 的
 * 分布是照这两条约束算出来的，不是随手取整。
 */
const SPAWN_X = [-7.6, -5.2, -1.8, 1.8, 5.2, 7.6] as const;

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
  /** `[潜伏者, 保卫者]`，每个阵营按 `SPAWN_X` 一行 6 个点 */
  spawns: [THREE.Vector3[], THREE.Vector3[]];
  nav: NavGrid;
  /** 低画质要关阴影，得能拿到它 */
  sun: THREE.DirectionalLight;
  dispose(): void;
}

/* ============================================================
   贴图铺法（贴图本身在 surface-textures.ts）
   ============================================================ */

/**
 * 把 BoxGeometry 的 UV 按**真实尺寸**铺开。
 *
 * 这是这一轮「贴图太假」的头号病根：旧版所有盒子 UV 都是 0..1，同一张金属图
 * 既铺在 1.1 米的铁箱上、也铺在 10 米长的台面上 —— 纹素密度差十倍，木箱上的
 * 拉丝比台面上的粗一个数量级，眼睛立刻能看出「这不是一块真的金属」。
 *
 * 做法：`u *= 面宽 / tile`、`v *= 面高 / tile`，贴图 `repeat` 保持 1、
 * wrap 是 Repeat，于是每个面都按米铺、跨面一致。副作用是好的：小于 tile 的
 * 盒子，板缝正好落在棱边上，看起来像箱体的边框焊缝。
 *
 * BoxGeometry 的顶点顺序固定为 +x / -x / +y / -y / +z / -z，每面 4 个顶点、
 * 且每个面的 UV 都是 0..1，所以这里可以直接按下标算。
 */
function fitBoxUv(geometry: THREE.BufferGeometry, w: number, h: number, d: number, tile: number): void {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const faceScale: [number, number][] = [
    [d / tile, h / tile], // +x
    [d / tile, h / tile], // -x
    [w / tile, d / tile], // +y
    [w / tile, d / tile], // -y
    [w / tile, h / tile], // +z
    [w / tile, h / tile], // -z
  ];
  for (let face = 0; face < 6; face += 1) {
    const [su, sv] = faceScale[face]!;
    for (let i = 0; i < 4; i += 1) {
      const index = face * 4 + i;
      uv.setXY(index, uv.getX(index) * su, uv.getY(index) * sv);
    }
  }
  uv.needsUpdate = true;
}

/**
 * 天空：竖直渐变 + 一层低对比度的云带，贴在反面球上。
 *
 * 只加云、**不改渐变的那五个色标** —— 天空球是 `MeshBasicMaterial`（不吃光），
 * 它的亮度就是整个画面的上限，之前为了「场景太暗」把这组值调亮过一档，
 * 动它等于重调全局曝光。
 *
 * 云只画在 0.28~0.66 这一段（canvas 的 y=0 是头顶，越大越靠近地平线）：
 * 地平线附近本来就有暖色霾，云压到那儿反而脏。
 */
function textureSky(): THREE.CanvasTexture {
  const W = 512;
  const H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('无法获取 2D 上下文，天空生成失败');
  const grad = g.createLinearGradient(0, 0, 0, H);
  // 整体比「真实阴天」亮一档：天空球是 MeshBasicMaterial（不吃光），
  // 它的亮度就是画面的上限 —— 天空压暗的话整个场景都跟着发灰
  grad.addColorStop(0.0, '#2c5c88');
  grad.addColorStop(0.42, '#78a8cc');
  grad.addColorStop(0.62, '#bcd8e8');
  grad.addColorStop(0.74, '#f0e2c8');
  grad.addColorStop(1.0, '#a3b6c2');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // 云：一团一团叠出来的软边，不是云图。每团先垫一层偏灰的底（云的暗面在
  // 下方），再叠一层亮面 —— 单层径向渐变看起来像烟雾，不像云
  let seed = 0x5eed;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 46; i += 1) {
    const cy = H * (0.28 + rand() * 0.34);
    const cx = rand() * W;
    const rx = 26 + rand() * 90;
    const ry = rx * (0.22 + rand() * 0.22);
    // 云在球面 u 方向要接得上：左右各画一份绕过去的副本
    for (const dx of [-W, 0, W]) {
      for (const [tone, alpha, dy] of [
        ['190,198,208', 0.10, ry * 0.35],
        ['255,255,255', 0.13, 0],
      ] as const) {
        g.save();
        g.translate(cx + dx, cy + dy);
        g.scale(1, ry / rx);
        const blob = g.createRadialGradient(0, 0, 0, 0, 0, rx);
        blob.addColorStop(0, `rgba(${tone},${alpha})`);
        blob.addColorStop(1, `rgba(${tone},0)`);
        g.fillStyle = blob;
        g.beginPath();
        g.arc(0, 0, rx, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
  }

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
  /**
   * 空气墙：只挡人，不挡子弹 / 视线 / 手雷（见 `Collider.ghost`）。
   * 舷墙上方那段「看不见的加高挡板」必须用它，否则两侧低处的天空会留下弹孔。
   */
  ghost?: boolean;
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

  // 贴图来自 `surface-textures` 的模块级缓存：**只取不建**。也不要在这里
  // dispose（见本文件末尾的 dispose）—— 贴图活得比这一份 level 长
  const deckTex = surfaceMaps('deck');
  const containerTex = surfaceMaps('container');
  const doorTex = surfaceMaps('containerDoor');
  const roofTex = surfaceMaps('containerRoof');
  const steelTex = surfaceMaps('steel');
  const woodTex = surfaceMaps('wood');
  const texSky = textureSky();

  /**
   * `metalness` 全部压在 0.3 以下。
   *
   * 主场景确实有 PMREM 环境图（`engine.ts`，`environmentIntensity 0.3`），但那个
   * 强度只够给金属补一层反射，不够把纯金属照亮 —— 给到「真金属」的 0.8~0.9，
   * 背光面会直接掉进暗部。0.2~0.3 是这套灯下能出金属感又不变黑的上限。
   */
  /**
   * 集装箱配色 —— **照三张实景角度图取的冷调工业漆**。
   *
   * 上一版是沙黄 / 卡其 / 锈橙，暖色占了大半，俯视一眼像货场而不是货轮。
   * 实景里箱体压倒性是**米白**，其次军绿 / 深绿，再夹几只蓝灰和卡其。
   * 顺序也照这个权重排 —— 五色里 bone 用得最多，slate / sand 是点缀。
   * （上一版的锈橙整条删了：「锈」在俯视图里是暖橙色，而这张图的箱体没有
   * 一只是那么暖的，留着反而把整片甲板往暖调拖。）
   *
   * ⚠️ 贴图底色是接近白的 246（波纹本身靠法线出明暗，不再靠画阴影），
   * 所以这里的值比上一版（纯白底）亮约 4%。改贴图底色必须回来看一眼这里。
   */
  const PAINT = {
    bone: 0,
    olive: 1,
    moss: 2,
    slate: 3,
    sand: 4,
  } as const;

  /**
   * 建一个带 PBR 三件套的材质。
   *
   * `roughness` 固定 1 是刻意的：它是**乘在 roughnessMap 上的系数**，贴图里
   * 已经把「漆面 0.72 / 裸钢 0.34 / 晒褪 0.8」写死了，这里再乘一个 0.8 只会
   * 把整张图的层次压平。
   */
  function pbr(maps: SurfaceMaps, color: number, metalness: number, normalScale = 1): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      map: maps.map,
      normalMap: maps.normalMap,
      roughnessMap: maps.roughnessMap,
      color,
      roughness: 1,
      metalness,
      normalScale: new THREE.Vector2(normalScale, normalScale),
    });
    // `block()` 靠它把 UV 乘成「面宽 / 米数」，见 `fitBoxUv`
    material.userData.tileM = maps.tileMeters;
    return material;
  }

  /**
   * 一只集装箱 = 6 个面槽位，顺序是 BoxGeometry 的 `[+x, -x, +y, -y, +z, -z]`。
   *
   * 箱体 2.6 宽 × 2.6 高 × 6.1 长，所以 **±x 才是长边、±z 是端门**。旧版六面
   * 共用一张竖波纹，端头也是一片波纹 —— 凑近看没有门缝、没有锁杆、没有角件，
   * 这是「像贴纸」最主要的来源之一。
   */
  function containerMaterials(tint: number): THREE.MeshStandardMaterial[] {
    const side = pbr(containerTex, tint, 0.16, 1.15);
    const roof = pbr(roofTex, tint, 0.16, 1);
    const door = pbr(doorTex, tint, 0.16, 1);
    // 端门是「一整面一张图」：几何 UV 按 2 米铺出来是 1.3 个 tile，用贴图
    // 自身的 repeat 压回 1（2/2.6 = 0.769），门框和锁杆才刚好占满一面。
    // 🔴 **三张贴图必须一起压**：three 的每张图有独立的 uvTransform，只压 map
    // 的话法线/粗糙度还是 1.3 个 tile —— 锁杆的凹凸会和底色错开半根
    // 同时把 tileM 改回 2：这个材质的 UV 基准是几何那边的 2 米，不是图自己的 2.6
    door.userData.tileM = containerTex.tileMeters;
    return [side, side, roof, side, door, door];
  }

  const doorRepeat = containerTex.tileMeters / CW;
  for (const texture of [doorTex.map, doorTex.normalMap, doorTex.roughnessMap]) {
    texture.repeat.set(doorRepeat, containerTex.tileMeters / CH);
  }

  const materials = {
    // ⚠️ 带贴图的材质，`color` 是**乘在贴图上的**：贴图 #6d737a × 颜色 #b6bbc1
    // 的乘积只有 0.07 的反照率，比水泥还黑。甲板 / 木板 / 钢板的底色由贴图
    // 自己承担（所以给白），只有「一张灰度图染五种箱色」这种才需要染。
    deck: pbr(deckTex, 0xffffff, 0.22, 1),
    hull: pbr(steelTex, 0x6d7a85, 0.26, 0.9),
    rail: pbr(steelTex, 0x58636e, 0.3, 0.9),
    wood: pbr(woodTex, 0xffffff, 0.02, 1),
    metal: pbr(steelTex, 0xbfc7ce, 0.3, 1),
    steel: pbr(steelTex, 0x99a2aa, 0.3, 1),
    dark: pbr(steelTex, 0x40474f, 0.16, 0.9),
    /** 甲板中线：CF 运输船甲板正中那条浅色通道带，俯视最直接的识别物 */
    marking: new THREE.MeshStandardMaterial({ color: 0xc0bda9, roughness: 0.85, metalness: 0.1 }),
    /** 吊机桁架：实景里那只吊是**黄色**的，是全图唯一的高饱和色，当路标用 */
    crane: pbr(steelTex, 0xe8b325, 0.24, 0.9),
    containers: [
      // bone：米白，实景里占一半以上
      containerMaterials(0xe6dfce),
      // olive：军绿
      containerMaterials(0x7a8460),
      // moss：深绿，实景里那几只压在阴影里的箱子
      containerMaterials(0x54644e),
      // slate：蓝灰，实景里少数几只
      containerMaterials(0x606c78),
      // sand：卡其，实景里那只偏黄的旧柜
      containerMaterials(0xc4b599),
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
      const geometry = new THREE.BoxGeometry(w, h, d);
      // 带贴图的材质自己带 `tileM`（surface-textures 那边定的米数），
      // 没有的就是纯色材质（甲板中线、天空之类），不用铺 UV
      const tile = material.userData.tileM as number | undefined;
      if (tile) fitBoxUv(geometry, w, h, d, tile);
      mesh = new THREE.Mesh(geometry, material);
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
        ghost: options.ghost === true,
      });
    }

    return mesh;
  }

  // 集装箱共用几何体：同尺寸的箱子有十几只，各建一份是纯浪费显存。
  // UV 按 2 米铺（和侧板贴图的 tileMeters 一致），端门靠贴图 repeat 再压回 1 面
  const containerGeometry = new THREE.BoxGeometry(CW, CH, CL);
  fitBoxUv(containerGeometry, CW, CH, CL, containerTex.tileMeters);

  /**
   * 放一只集装箱。
   *
   * `alongX` 是**绕 y 轴转 90°**，不是斜放 —— 所以碰撞盒只是把宽深互换，
   * 依然是精确的 AABB，物理层一行都不用动（斜放才是禁区，见文件头）。
   */
  function container(x: number, z: number, level: number, colorIndex: number, options: { alongX?: boolean } = {}): void {
    const { alongX = false } = options;
    const y0 = level * CH;
    const mesh = new THREE.Mesh(containerGeometry, materials.containers[colorIndex]!);
    if (alongX) mesh.rotation.y = Math.PI / 2;
    mesh.position.set(x, y0 + CH / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);

    const halfX = alongX ? CL / 2 : CW / 2;
    const halfZ = alongX ? CW / 2 : CL / 2;
    colliders.push({
      min: { x: x - halfX, y: y0, z: z - halfZ },
      max: { x: x + halfX, y: y0 + CH, z: z + halfZ },
      pen: false,
      surf: 'metal',
    });
  }

  /* ============================================================
     1. 船体
     ============================================================ */

  // 甲板：顶面正好 y = 0
  block(0, 0, HALF_W * 2, 2.2, HALF_L * 2, materials.deck, { y0: -2.2, surf: 'metal' });

  // 甲板中线：CF 运输船甲板正中那条浅色通道带。俯视是这张图最直接的识别物，
  // 第一人称下它还会在跑动时提供速度参照（纯色甲板跑起来像原地踏步）。
  // 0.02 米高、不碰撞不投影 —— 站上去既没有台阶感也不会挡子弹。
  block(0, 0, 1.6, 0.02, HALF_L * 2 - 3, materials.marking, {
    y0: 0,
    collide: false,
    cast: false,
  });

  // 舷侧：看得见 1.55 米高的挡板（实景里那道舷墙大概到胸口以上），
  // 碰撞体做到 5.55 米高 —— 目的是「跳不出去掉进海里」，
  // 而不是视觉上真的有一堵墙。上面那段**看不见**的 4 米必须标成 `ghost`：
  // 只挡人、不挡子弹，否则朝两侧低处的天空开枪会在半空留下弹孔和火花。
  block(-HALF_W, 0, 0.8, 1.55, HALF_L * 2, materials.rail, { y0: 0 });
  block(HALF_W, 0, 0.8, 1.55, HALF_L * 2, materials.rail, { y0: 0 });
  block(-HALF_W, 0, 0.8, 4.0, HALF_L * 2, materials.hull, { y0: 1.55, visible: false, ghost: true });
  block(HALF_W, 0, 0.8, 4.0, HALF_L * 2, materials.hull, { y0: 1.55, visible: false, ghost: true });

  // 船头 / 船尾挡墙
  block(0, -HALF_L, HALF_W * 2, 5, 1.4, materials.hull, { y0: 0 });
  block(0, HALF_L, HALF_W * 2, 5, 1.4, materials.hull, { y0: 0 });

  // 舷墙顶上的立柱 + 一道通长横杆：实景里舷墙上面那道铁丝网的骨架。
  // 纯装饰 —— 2.5 米高的杆子挡住子弹，玩家只会觉得子弹在空气里炸开
  for (let z = -HALF_L + 2; z <= HALF_L - 2; z += 2.6) {
    block(-HALF_W + 0.15, z, 0.1, 1.0, 0.1, materials.steel, { y0: 1.55, collide: false, cast: false });
    block(HALF_W - 0.15, z, 0.1, 1.0, 0.1, materials.steel, { y0: 1.55, collide: false, cast: false });
  }
  block(-HALF_W + 0.15, 0, 0.08, 0.08, HALF_L * 2 - 3, materials.steel, { y0: 2.5, collide: false, cast: false });
  block(HALF_W - 0.15, 0, 0.08, 0.08, HALF_L * 2 - 3, materials.steel, { y0: 2.5, collide: false, cast: false });

  /* ============================================================
     2. 两侧狙击台（对称）

     台体 3.4 宽，台心 `cx = HALF_W - 2.3`（宽度 26 → 22 时从 ±10.7 挪到
     ±8.7）。只改 `HALF_W` 不改这里，台子会整块穿出船外。

     🔴 登台斜坡：开在**短边端面**（z = ±5 端、旧楼梯的位置）靠台体**内侧**
     的那半幅（宽 1.7，x 靠中路），整个掏在台体原轮廓之内、零外伸 —— 旧
     楼梯「外沿嵌进舷板 0.3 米」的 stairX 锚点推导已废。视觉是一整块楔形
     真斜面（用户 2026-11-13：「加一个斜坡（不要楼梯）」），碰撞是看不见
     的细台阶（物理层是纯 AABB，见文件头铁律）。两座台**点对称**：+x 台坡
     在 z=+5 端、-x 台坡在 z=-5 端，两队各有一座近家的坡。这一轮的前一版
     曾把坡开在内侧面正中间、八级大台阶，被用户否掉（「不是中间加楼梯」）。

     （原来这一节前面还有一段「舷侧 40 尺货排」—— 每舷两只长箱贴舷墙。
     用户 2026-11-13 明确要求去掉那四只箱子，整段连同 `CL40` / `long`
     选项一起删了。现在两条长边是空甲板，掩体全靠中路散货和两座台。）
     ============================================================ */

  // 楔形斜面（两座台共用一份几何体）：拿盒子把**远端上沿**两根顶点压到
  // 地面 —— 顶面变斜面、远端面退化成零面积（画不出来），侧脸变三角。
  // UV 必须在折叠**前**按 fitBoxUv 铺好：斜面继承原顶面的米数 UV，纹素
  // 密度和台体一致；折叠后再算一次顶点法线，斜面才真正受光。
  const rampGeometry = (() => {
    const geometry = new THREE.BoxGeometry(1.7, 3.2, 4.6);
    const tile = materials.steel.userData.tileM as number;
    fitBoxUv(geometry, 1.7, 3.2, 4.6, tile);
    geometry.translate(0, 1.6, 0);
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      if (pos.getY(i) > 0 && pos.getZ(i) > 0) pos.setY(i, 0);
    }
    geometry.computeVertexNormals();
    return geometry;
  })();

  function sniperDeck(side: number): void {
    const cx = side * 8.7;
    // 坡端：+x 台开在 z=+5 端、-x 台开在 z=-5 端（点对称，与散货摆法一致）
    const rampEnd = side;
    // 台体主体：z 向让出坡端的外 4.6 米，其余实心（z ∈ [-5, 0.4]）
    block(cx, -rampEnd * 2.3, 3.4, 3.2, 5.4, materials.steel, { y0: 0, surf: 'metal' });
    // 坡端的外半幅（x 贴舷侧）仍是实心台体，坡只占内半幅
    block(cx + side * 0.85, rampEnd * 2.7, 1.7, 3.2, 4.6, materials.steel, { y0: 0, surf: 'metal' });

    // 楔形：本地坐标系里高端在 -z（贴台体）、低端在 +z（贴甲板），低端
    // 正好落在甲板上；-x 台绕 y 转 180°（棱柱左右对称，转完严丝合缝）
    const ramp = new THREE.Mesh(rampGeometry, materials.steel);
    ramp.position.set(cx - side * 0.85, 0, rampEnd * 2.7);
    ramp.rotation.y = rampEnd === 1 ? 0 : Math.PI;
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    root.add(ramp);

    // 碰撞：物理层没有斜面（文件头铁律），用一排**看不见的细台阶**垫在
    // 楔形下面 —— 0.1 米一级，顶面取楔形斜面在每级跨度的**中点高度**
    //（偏差 ≤ 5 厘米，走路的手感顿挫由 player.ts 的 stepLift 抹平）
    const STEPS = 32;
    const rise = 3.2 / STEPS;
    const run = 4.6 / STEPS;
    for (let s = 0; s < STEPS; s += 1) {
      const h = rise * (STEPS - s - 0.5);
      block(
        cx - side * 0.85,
        rampEnd * (0.4 + s * run + run / 2),
        1.7,
        h,
        run,
        materials.steel,
        { visible: false, surf: 'metal' },
      );
    }
  }
  sniperDeck(1);
  sniperDeck(-1);

  /* ============================================================
     3. 船头吊机（照实景：立在船头一角的黄色格构吊臂）

     旧版是全宽龙门吊，两根立柱在 x = ±12.7、横梁在 z = 0 —— 俯视像一座
     门框扣在船上。实景里根本没有这东西：那只吊**立在船头一角**，桁架臂
     斜伸到甲板上方，是整个剪影里最醒目的一笔，也是全图唯一的高饱和黄。

     底座贴着船头挡墙（内壁 -21.3）站，**进深只做 1.2 米**：底座前沿
     z = -20.3，而人机重生最靠前能到 z = -19.9（出生线 -19 再叠 -0.5 的
     随机偏移，加 0.4 半径），留 0.4 米余量。这块必须让开，否则人机会
     直接复活在吊机肚子里。
     ============================================================ */

  block(-9.7, -20.9, 2.2, 0.6, 1.2, materials.dark, { y0: 0 });
  block(-9.7, -20.9, 0.85, 12.6, 0.85, materials.crane, { y0: 0.6 });

  /**
   * 吊臂：局部 +x 是臂长方向，整组只做一次 yaw（指向甲板）和一次轻微俯角。
   *
   * `rotation.y = -0.96` ⇒ 臂指向 (+x, +z) 约 55°，18 米长的臂尖落在
   * (0.7, -6.1) 的甲板上方 11.4 米 —— 正中偏船头，和实景那张斜角图一致。
   * 这一组**不进碰撞表**（Group 里的 Mesh 不经过 `block()`），所以旋转
   * 是绝对安全的，不会碰到「斜放箱体」那条禁区。
   */
  const boom = new THREE.Group();
  boom.position.set(-9.7, 12.6, -20.9);
  boom.rotation.y = -0.96;
  boom.rotation.z = -0.06; // 微微下垂：吊着载的臂不会是水平的
  root.add(boom);

  const BOOM_LEN = 18;
  // 四根主弦杆。UV 必须按真实长度铺：18 米的杆子上，2 米的板缝要重复 9 次，
  // 吃 0..1 的话整根杆只有一块板、一颗螺栓，远看是一根纯黄的方条
  const chordGeometry = new THREE.BoxGeometry(BOOM_LEN, 0.13, 0.13);
  fitBoxUv(chordGeometry, BOOM_LEN, 0.13, 0.13, steelTex.tileMeters);
  for (const dy of [-0.55, 0.55]) {
    for (const dz of [-0.55, 0.55]) {
      const chord = new THREE.Mesh(chordGeometry, materials.crane);
      chord.position.set(BOOM_LEN / 2, dy, dz);
      chord.castShadow = true;
      boom.add(chord);
    }
  }
  // 横撑：每 2.2 米一道，只做左右两侧的立杆。四面全做是三十多个 draw call，
  // 而俯视/第一人称都看不出差别
  const braceGeometry = new THREE.BoxGeometry(0.1, 1.1, 0.1);
  fitBoxUv(braceGeometry, 0.1, 1.1, 0.1, steelTex.tileMeters);
  for (let i = 0; i < 8; i += 1) {
    for (const dz of [-0.55, 0.55]) {
      const brace = new THREE.Mesh(braceGeometry, materials.crane);
      brace.position.set(1.8 + i * 2.2, 0, dz);
      boom.add(brace);
    }
  }
  // 吊钩：钢丝绳 + 滑轮组，纯视觉
  const cable = new THREE.Mesh(new THREE.BoxGeometry(0.07, 4.2, 0.07), materials.dark);
  cable.position.set(15, -2.1, 0);
  boom.add(cable);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.9), materials.crane);
  hook.position.set(15, -4.7, 0);
  hook.castShadow = true;
  boom.add(hook);

  /* ============================================================
     4. 掩体：木箱可穿，铁箱不可穿

     全图关于原点**中心对称**（转 180° 两边互换），双方条件一致。
     这一版照实景重排，最大的区别是**「关卡掩体」换成了「散货」**：
     上一版有两条对称的错位方箱斜带 + 四组攀爬阶梯 + 一圈铁箱，俯视是一张
     对称图案；实景中段就是一大片空甲板加几只散箱。图案感越强越不像货轮。

     ⚠️ 缩到 22 米宽之后，**所有 x 坐标都受导航格约束**：格子 1.5 米一格、
     中心在 x = 0, ±1.5, ±3 …，`blockedAt` 还要吃 0.45 米半径。一件箱子的
     外沿落在 x = 5.55 附近时，x = 6 那一格的判定就会连带被挡掉 —— 于是
     「物理上 1.5 米能过人、导航却判整条巷不可达」，Bot 从此只走中路。
     中段散货一律压在外沿 ≤ 5.3（x = 6 那格留空），就是为了这个。

     - 中央（z ≈ 0）：一只**横放**的 20 尺箱拦腰截断出生对狙 —— 38 米直线
       上 AWM 一枪 100 点，这条线不截掉就没法玩。
     - 中场：三只 20 尺箱散放（两只平行、一只垂直），另有两摞木箱。
     - 出生区（z ≈ ±16~17）：一只铁箱守正中 + 一只木箱偏侧。实景的出生段
       基本是空的，别堆成迷宫。
     ============================================================ */

  function crate(x: number, z: number, size: number, height: number): void {
    block(x, z, size, height, size, materials.wood, { y0: 0, pen: true, surf: 'wood' });
  }

  function metalBox(x: number, z: number, size: number, height: number): void {
    block(x, z, size, height, size, materials.metal, { y0: 0, pen: false, surf: 'metal' });
  }

  // 中央：横着的 20 尺箱（长轴沿 x，占 x ±3.05 / z ±1.3）。
  // 两侧各留 3.95 米到狙击台内壁 —— 缩图后仍是全图最宽的一条横截面。
  container(0, 0, 0, PAINT.bone, { alongX: true });

  /**
   * 攀爬链（180° 对称）：木箱 1.0 → 铁箱 1.9 → 箱顶 2.6，落差 0.9 / 0.7，
   * 都跳得上去（跳高 1.09）。
   *
   * 三级**必须面贴面**：木箱左沿 = 铁箱右沿 = 4.15，铁箱左沿 = 箱体端面 = 3.05。
   * 中间只要漏出 0.5 米，自动上台阶就够不着，人会掉进两道箱子的夹缝里 ——
   * 那正是「卡在缝里」这类 bug 的经典形状。
   *
   * 尺寸从 1.3 收到 **1.1**：最外沿 5.25，离台体内壁 7.0 还剩 1.75 米，
   * 正好让 x = 6 那一格导航通过（见本节开头）。
   */
  crate(4.7, 0, 1.1, 1.0);
  metalBox(3.6, 0, 1.1, 1.9);
  crate(-4.7, 0, 1.1, 1.0);
  metalBox(-3.6, 0, 1.1, 1.9);

  /**
   * 散货：三对 20 尺箱，180° 对称。
   *
   * 实景里中段的箱子是**斜着散**的。这里用「一只平行 + 一只垂直」错开，
   * 而不是真旋转 —— 真旋转要动 `collideAt` / `rayWorld` / `pushAxis`，
   * 是「偶发瞬移」那条 bug 的重灾区，收益配不上风险（见文件头）。
   */
  container(4.0, 5.8, 0, PAINT.moss);
  container(-4.0, -5.8, 0, PAINT.moss);
  container(2.2, 12.4, 0, PAINT.slate, { alongX: true });
  container(-2.2, -12.4, 0, PAINT.slate, { alongX: true });
  container(-5.6, 10.6, 0, PAINT.sand);
  container(5.6, -10.6, 0, PAINT.sand);

  /**
   * 木箱：实景里中路散着几摞小木箱，是唯一「踩着能上箱顶」的矮掩体。
   *
   * ⚠️ 角落那两只是**贴死舷板**的：外沿 10.5，舷板内壁 10.6，中间 0.1 米
   * 进不去人，不会留出一条钻得进出不来的缝。
   */
  crate(-1.9, 5.6, 1.4, 1.05);
  crate(1.9, -5.6, 1.4, 1.05);
  crate(9.9, 12.4, 1.2, 0.95);
  crate(-9.9, -12.4, 1.2, 0.95);

  // 台端铁箱（旧「楼梯口」掩体）：楼梯 2026-11-13 删掉后仍在，位置本来
  // 就在台体两端外沿，留作端巷拐角的正面掩体 —— 别顺着旧注释去找台阶了
  metalBox(8.4, 10.2, 1.2, 1.6);
  metalBox(-8.4, -10.2, 1.2, 1.6);

  // 出生区掩体。⚠️ 六个出生位（x = ±7.6 / ±5.2 / ±1.8）的正前方都要留空，
  // 这两件只能挡斜向枪线，不能挡复活后第一步（x = 0 / ±4.2 附近就是因此留空
  // 的，见 `SPAWN_X`）。木箱前沿 17.7，人机最靠前复活在 18.1（出生线 19 − 0.5
  // 偏移 − 0.4 半径），留 0.4 米余量。
  metalBox(0, 16.0, 1.6, 1.9);
  metalBox(0, -16.0, 1.6, 1.9);
  crate(4.2, 17.0, 1.4, 1.05);
  crate(-4.2, -17.0, 1.4, 1.05);

  /* ============================================================
     5. 出生点
     ============================================================ */

  for (const x of SPAWN_X) {
    spawns[0].push(new THREE.Vector3(x, 0, SPAWN_Z[0]));
    spawns[1].push(new THREE.Vector3(x, 0, SPAWN_Z[1]));
  }

  /* ============================================================
     6. 环境：天空球 / 海面 / 远景港口
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
     7. 光照
     ============================================================ */

  // 天光：上蓝下灰，负责「阴影里也看得见东西」。
  // 强度给得比物理上合理值高：这张图有一半时间玩家在看集装箱的背光面，
  // 那一片如果只靠太阳，会暗到分不清箱体和缝
  scene.add(new THREE.HemisphereLight(0xd8e8f6, 0x6a727a, 1.7));

  const sun = new THREE.DirectionalLight(0xfff4e2, 3.0);
  sun.position.set(46, 58, 24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // 包住 22 × 44 的甲板：对角半径 = √(11² + 22²) ≈ 24.6，取 30（≈1.2 倍余量）。
  // 改船长 / 船宽之后这里必须跟着走，不然远端集装箱会掉出阴影相机、
  // 影子直接消失
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0006;
  // normalBias 比 bias 好用：bias 会把影子整体推离物体，产生「浮空」感；
  // normalBias 沿法线推，接缝小得多
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  /* ============================================================
     8. 导航网格
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
        // 🔴 贴图来自 `surface-textures` 的模块级缓存，**绝对不能在这里 dispose**：
        // 材质每次 buildLevel 都会重建、贴图不重建，清了重进游戏就是一片黑
        // （和 `weapon-textures.ts` 同一条铁律）。天空图是这一份 level 自己生成的，
        // 所以下面单独释放
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
      const skyMaterial = sky.material as THREE.MeshBasicMaterial;
      skyMaterial.map?.dispose();
      collectMaterial(skyMaterial);
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
 * 再让人从船头重跑一趟就是「跑马拉松」。线性扫全表（15×29 ≈ 435 格）只在
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
