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
 * 推一个 AABB。**只有一处例外**是 `collide: false` 的纯装饰（栏杆立柱、吊机
 * 桁架、狙击台护栏、甲板中线）—— 那些东西看得见但挡不住人，因为「能看见的
 * 横梁挡住子弹」会让玩家觉得子弹在空气里炸开。
 *
 * ## 坐标系
 *
 * three 原生系：x 右、y 上、z 朝屏幕外。甲板顶面 `y = 0`。
 * 保卫者出生在 `z = SPAWN_Z[0]`（船头方向），潜伏者在 `SPAWN_Z[1]`。
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
 * `HALF_W` 每减 1 米，台心就跟着内移 1 米（见第 3 节）。缩宽度不是简单
 * 改一个常量，台子和楼梯的 x 必须同时挪，否则会穿出舷墙。
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

/** 甲板：防滑钢板，64px 一块，带锈斑。整块甲板铺 11×22 次（一块 2×2 米）。 */
function textureDeck(): THREE.CanvasTexture {
  return canvasTexture(
    256,
    (g, w, h) => {
      // 贴图本身要偏亮：材质的 color 会**乘**在这上面，两张中灰相乘就是黑
      //
      // 基色是**蓝灰**，不是水泥灰 —— 实景俯视图里那块甲板明显偏冷（钢板刷的
      // 防锈漆带蓝），上一版的 #9aa2a9 中性灰俯视读起来像停车场
      g.fillStyle = '#7f8d98';
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 64) {
        for (let x = 0; x < w; x += 64) {
          g.fillStyle = (x / 64 + y / 64) % 2 ? '#8896a1' : '#76828d';
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
    // 重复次数 = 尺寸 / 2 米：x 方向 22 米铺 11 次，z 方向 44 米铺 22 次，
    // 一块钢板永远是 2×2 米。船长改了这里必须同步，否则砖块会被拉长
    11,
    22,
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
  /**
   * 集装箱配色 —— **照三张实景角度图取的冷调工业漆**。
   *
   * 上一版是沙黄 / 卡其 / 锈橙，暖色占了大半，俯视一眼像货场而不是货轮。
   * 实景里箱体压倒性是**米白**，其次军绿 / 深绿，再夹几只蓝灰和卡其。
   * 顺序也照这个权重排 —— 五色里 bone 用得最多，slate / sand 是点缀。
   * （上一版的锈橙整条删了：「锈」在俯视图里是暖橙色，而这张图的箱体没有
   * 一只是那么暖的，留着反而把整片甲板往暖调拖。）
   *
   * ⚠️ 这里给的是**材质色**，显示出来会乘上 `texContainer` 的亮度（约 0.85，
   * 波纹的暗部），所以每个值都比目标颜色亮一档。直接填截图里的 hex 会暗半级。
   */
  const PAINT = {
    bone: 0,
    olive: 1,
    moss: 2,
    slate: 3,
    sand: 4,
  } as const;

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
    /** 甲板中线：CF 运输船甲板正中那条浅色通道带，俯视最直接的识别物 */
    marking: new THREE.MeshStandardMaterial({ color: 0xc0bda9, roughness: 0.85, metalness: 0.1 }),
    /** 吊机桁架：实景里那只吊是**黄色**的，是全图唯一的高饱和色，当路标用 */
    crane: new THREE.MeshStandardMaterial({ color: 0xd8a521, roughness: 0.62, metalness: 0.22 }),
    containers: [
      // bone：米白，实景里占一半以上
      new THREE.MeshStandardMaterial({ map: texContainer, color: 0xe2dccb, roughness: 0.78, metalness: 0.18 }),
      // olive：军绿
      new THREE.MeshStandardMaterial({ map: texContainer, color: 0x76805c, roughness: 0.78, metalness: 0.18 }),
      // moss：深绿，实景里那几只压在阴影里的箱子
      new THREE.MeshStandardMaterial({ map: texContainer, color: 0x50604a, roughness: 0.78, metalness: 0.18 }),
      // slate：蓝灰，实景里少数几只
      new THREE.MeshStandardMaterial({ map: texContainer, color: 0x5c6874, roughness: 0.7, metalness: 0.26 }),
      // sand：卡其，实景里那只偏黄的旧柜
      new THREE.MeshStandardMaterial({ map: texContainer, color: 0xc0b195, roughness: 0.78, metalness: 0.18 }),
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
        ghost: options.ghost === true,
      });
    }

    return mesh;
  }

  // 集装箱共用几何体：同尺寸的箱子有十几只，各建一份是纯浪费显存
  const containerGeometry = new THREE.BoxGeometry(CW, CH, CL);

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

     缩宽度的**唯一锚点**：台体 3.4 宽、楼梯 1.7 宽，两者的相对位置是定死的
     （楼梯贴台体外侧、外沿比台面多出 0.5 米）。舷板内壁在 `HALF_W - 0.4`，
     楼梯外沿要嵌进去 0.3 米，于是

         stairX + 0.85 = HALF_W - 0.4 + 0.3  ⇒  stairX = HALF_W - 0.95
         cx = stairX - 1.35                  ⇒  cx     = HALF_W - 2.3

     宽度 26 → 22 之后 `cx` 必须从 ±10.7 挪到 ±8.7、楼梯从 ±12.05 挪到
     ±10.05。只改 `HALF_W` 不改这里，台子会整块穿出船外。

     （原来这一节前面还有一段「舷侧 40 尺货排」—— 每舷两只长箱贴舷墙。
     用户 2026-11-13 明确要求去掉那四只箱子，整段连同 `CL40` / `long`
     选项一起删了。现在两条长边是空甲板，掩体全靠中路散货和两座台。）
     ============================================================ */

  function sniperDeck(side: number): void {
    const cx = side * 8.7;
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
        block(side * 10.05, z0, 1.7, rise * (steps - s), run, materials.steel, { y0: 0 });
      }
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
  // 四根主弦杆
  const chordGeometry = new THREE.BoxGeometry(BOOM_LEN, 0.13, 0.13);
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

  // 楼梯口：接在台阶末端（台阶铺到 z = 9.6），挡楼梯下来的人正面视线。
  // 刻意错开台阶本身，不占 z ∈ [5, 9.6] 的下台落脚区
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
