import * as THREE from 'three';
import { type Point3, rand } from './math';
import type { Quality, Surface } from './types';

/**
 * 视觉特效池 —— 粒子、弹痕、曳光、枪口火光、爆炸。
 *
 * ## 为什么全部是「池」
 *
 * 一局 10 分钟的对枪，光是弹痕就能打到几百个、火花粒子几千个。每次都
 * `new Mesh()` 再 `dispose()`，GC 会把帧时间撕成一堆 20ms 的尖刺 —— 玩家
 * 感受到的是「打起来就卡」。所以：
 *
 *   粒子  → 一个 `Points` + 固定长度的属性数组，只改数据不增删对象
 *   弹痕  → 140 个 Plane 循环复用，转着圈覆盖最老的
 *   曳光  → 20 根共享圆柱几何体 + 20 份材质，环形复用（只改位置/缩放/透明度）
 *   火光  → 12 个枪口焰 + 10 个弹着光点，预建 Sprite + 独占材质，环形复用
 *
 * ## 光源必须常驻
 *
 * 枪口光和爆炸光是场景里**一直存在**的 `PointLight`，只改 `intensity`。
 * 如果每次开火 `scene.add(new PointLight())` 再 remove，three 会因为「场景里
 * 光源数量变了」重新编译所有材质的 shader —— 一枪卡一下，这个坑很深。
 */

export interface EffectsOptions {
  quality: Quality;
}

const PARTICLE_BUDGET: Record<Quality, number> = {
  low: 180,
  mid: 320,
  high: 480,
};

/** 弹痕上限。超过就覆盖最老的，不增长。 */
const DECAL_LIMIT = 140;

/** 粒子重力。比真实重力小一点，火花飘得更久、更好看。 */
const PARTICLE_GRAVITY = 16;

/**
 * 枪口焰池。
 *
 * 上一版是「每开一枪 new Sprite + new SpriteMaterial，50ms 后 remove + dispose」。
 * 自动武器 10 发/秒、场上还有 5 个 Bot 一起开火时，那是每秒几十次分配 + 几十次
 * 材质释放 —— 正是需求里「多人交火不能掉帧」要盯的地方。改成预建、只改属性的
 * 环形池：稳态零分配。
 *
 * 每个火光必须**独占一份材质**：`SpriteMaterial.rotation` / `opacity` 是逐实例的，
 * 共享一份会让所有火光同时转、同时灭。所以池子里建 12 个 Sprite + 12 份材质，
 * 而不是 12 个 Sprite 共享一份。
 */
const FLASH_LIMIT = 12;

/** 命中点的短促火花池。比枪口焰小、更短，用来「点亮」弹着点。 */
const IMPACT_FLASH_LIMIT = 10;

/** 曳光池。曳光只活 55ms，20 条足够覆盖多人同时交火的峰值。 */
const TRACER_LIMIT = 20;

/** 曳光存活时长（秒）。 */
const TRACER_LIFE = 0.055;

/** 人机曳光色（暖金）——枪手里只有人机用这个色，联机真人全走紫色 */
export const TRACER_COLOR_BOT = 0xffd79a;
/** 人类玩家曳光色（亮紫罗兰）：本机自己 + 联机对端共用，加色混合下在深色掩体和蓝灰甲板上都醒目 */
export const TRACER_COLOR_HUMAN = 0xb26bff;

/** 曳光朝向计算用的临时向量（模块级复用，避免每发子弹都新建 Vector3）。 */
const TRACER_UP = new THREE.Vector3(0, 1, 0);
const TRACER_DIR = new THREE.Vector3();

interface PooledSprite {
  object: THREE.Object3D;
  material: THREE.SpriteMaterial | THREE.MeshBasicMaterial;
  life: number;
  max: number;
}

/** 池里的一发火光。`cursor` 用一个可变对象传进来，池与游标一一对应。 */
interface FlashEntry {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  life: number;
  max: number;
}

interface PooledTracer {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
}

/**
 * 弹壳池大小。
 *
 * 自动武器满射速 10 发/秒、弹壳在地上留 3 秒，理论上要 30 个。给 24 个够用 ——
 * 池满时**回收最老的那个**（环形缓冲），视觉上「少一个旧弹壳」没人看得出来。
 */
const CASING_LIMIT = 24;

/** 弹壳重力。比粒子重得多：弹壳是黄铜，掉得快、弹一下就躺住。 */
const CASING_GRAVITY = 22;

interface Casing {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}

export class Effects {
  private readonly scene: THREE.Scene;

  /* ---- 粒子 ---- */
  private readonly particleCount: number;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly alphas: Float32Array;
  private readonly sizes: Float32Array;
  private readonly velocities: Float32Array;
  private readonly lives: Float32Array;
  private readonly maxLives: Float32Array;
  private readonly points: THREE.Points;
  private particleHead = 0;

  /* ---- 弹痕 ---- */
  private readonly decalGeometry: THREE.PlaneGeometry;
  /** 按材质分两份：木头弹孔偏褐、金属弹孔偏冷黑 —— 一眼能看出打在什么上 */
  private readonly decalMaterials: Record<Surface, THREE.MeshBasicMaterial>;
  private readonly decals: THREE.Mesh[] = [];
  private decalCursor = 0;

  /* ---- 曳光 ---- */
  private readonly tracerGeometry: THREE.CylinderGeometry;
  private readonly tracers: PooledTracer[] = [];
  private tracerCursor = 0;

  /* ---- 弹壳 ---- */
  private readonly casingGeometry: THREE.CylinderGeometry;
  private readonly casingMaterial: THREE.MeshStandardMaterial;
  private readonly casings: Casing[] = [];
  private casingCursor = 0;

  /* ---- 火光 / 爆炸 ---- */
  private readonly flashTexture: THREE.Texture;
  /** 枪口焰池（环形复用，稳态零分配） */
  private readonly flashes: FlashEntry[] = [];
  private readonly flashCursor = { index: 0 };
  /** 命中点火花池 */
  private readonly impactFlashes: FlashEntry[] = [];
  private readonly impactCursor = { index: 0 };
  /** 爆炸 / 烟球这类低频、形状各异的东西，仍然单独建（一局没几个） */
  private readonly sprites: PooledSprite[] = [];
  private readonly boomGeometry: THREE.SphereGeometry;

  /* ---- 常驻光源 ---- */
  private readonly muzzleLight: THREE.PointLight;
  private readonly boomLight: THREE.PointLight;

  constructor(scene: THREE.Scene, options: EffectsOptions) {
    this.scene = scene;
    this.particleCount = PARTICLE_BUDGET[options.quality];

    /* ---------- 粒子 ---------- */
    const count = this.particleCount;
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.alphas = new Float32Array(count);
    this.sizes = new Float32Array(count);
    this.velocities = new Float32Array(count * 3);
    this.lives = new Float32Array(count);
    this.maxLives = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      this.positions[i * 3 + 1] = -999;
      this.alphas[i] = 0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: dotTexture() } },
      vertexShader: `
        attribute float aAlpha;
        attribute float aSize;
        attribute vec3 aColor;
        varying float vA;
        varying vec3 vC;
        void main() {
          vA = aAlpha;
          vC = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // 620 是把「米」换算成屏幕像素的经验系数：离得越远点越小
          gl_PointSize = aSize * 620.0 / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uTex;
        varying float vA;
        varying vec3 vC;
        void main() {
          vec4 t = texture2D(uTex, gl_PointCoord);
          if (t.a * vA < 0.01) discard;
          gl_FragColor = vec4(vC, t.a * vA);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, material);
    // 顶点在 GPU 里被改过位置，包围盒永远是初始值 —— 不关剔除会整块消失
    this.points.frustumCulled = false;
    scene.add(this.points);

    /* ---------- 弹痕 ---------- */
    this.decalGeometry = new THREE.PlaneGeometry(0.13, 0.13);
    const decalMap = decalTexture();
    const makeDecalMaterial = (color: number) =>
      new THREE.MeshBasicMaterial({
        map: decalMap,
        color,
        transparent: true,
        depthWrite: false,
        // 弹痕贴在墙面上，z-fighting 会让它一闪一闪；polygonOffset 往前推一点
        polygonOffset: true,
        polygonOffsetFactor: -4,
        opacity: 0.95,
      });
    this.decalMaterials = {
      metal: makeDecalMaterial(0xffffff),
      // 木头弹孔偏褐：贴图本身是灰黑，乘一个暖色就成「打穿的木屑坑」
      wood: makeDecalMaterial(0xa8835a),
    };

    /* ---------- 曳光 ---------- */
    this.tracerGeometry = new THREE.CylinderGeometry(0.011, 0.011, 1, 4, 1, true);
    // 预建、全部隐藏：曳光是每发都要画的东西，临时 new Mesh + new Material
    // 再 dispose 会在连发时制造 GC 抖动（材质要逐实例控制 opacity，不能共享）
    for (let i = 0; i < TRACER_LIMIT; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: TRACER_COLOR_BOT,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.tracerGeometry, material);
      mesh.visible = false;
      scene.add(mesh);
      this.tracers.push({ mesh, material, life: 0 });
    }

    /* ---------- 弹壳 ---------- */
    // 8mm 粗、28mm 长的黄铜壳。用真几何体而不是点精灵：弹壳要「翻滚」，
    // 一个圆点转起来还是圆点，看起来只是颗灰尘
    this.casingGeometry = new THREE.CylinderGeometry(0.0085, 0.0085, 0.028, 6, 1, false);
    // metalness 压在 0.35：没有环境贴图，再高会渲染成死黑
    this.casingMaterial = new THREE.MeshStandardMaterial({
      color: 0xc9a227,
      roughness: 0.36,
      metalness: 0.35,
      emissive: 0x2a1e05,
    });
    // 预建好、全部隐藏：抛壳是每发都要做的事，临时 new Mesh 会在连射时制造 GC 抖动
    for (let i = 0; i < CASING_LIMIT; i += 1) {
      const mesh = new THREE.Mesh(this.casingGeometry, this.casingMaterial);
      mesh.visible = false;
      mesh.castShadow = false;
      scene.add(mesh);
      this.casings.push({ mesh, velocity: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }

    /* ---------- 火光 ---------- */
    this.flashTexture = flashTexture();
    this.boomGeometry = new THREE.SphereGeometry(1, 16, 12);

    // 枪口焰池：预建 + 隐藏，`spawnMuzzleFlash` 只改位置/尺寸/透明度
    for (let i = 0; i < FLASH_LIMIT; i += 1) {
      this.flashes.push(this.createFlash(scene));
    }
    for (let i = 0; i < IMPACT_FLASH_LIMIT; i += 1) {
      this.impactFlashes.push(this.createFlash(scene, true));
    }

    /* ---------- 常驻光源 ---------- */
    // 强度是按 r155+ 的物理单位给的（点光衰减 = intensity / d²）。
    // 老版本的「6 / 30」在物理单位下几乎看不见。
    this.muzzleLight = new THREE.PointLight(0xffcf8a, 0, 12, 2);
    this.boomLight = new THREE.PointLight(0xffa040, 0, 34, 2);
    scene.add(this.muzzleLight);
    scene.add(this.boomLight);
  }

  /* ============================================================
     粒子
     ============================================================ */

  /** 发一颗粒子。池满时覆盖最老的那颗（环形缓冲）。 */
  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: readonly [number, number, number],
    size: number,
    life: number,
  ): void {
    const index = this.particleHead;
    this.particleHead = (this.particleHead + 1) % this.particleCount;

    this.positions[index * 3] = x;
    this.positions[index * 3 + 1] = y;
    this.positions[index * 3 + 2] = z;

    this.velocities[index * 3] = vx;
    this.velocities[index * 3 + 1] = vy;
    this.velocities[index * 3 + 2] = vz;

    this.colors[index * 3] = color[0];
    this.colors[index * 3 + 1] = color[1];
    this.colors[index * 3 + 2] = color[2];

    this.sizes[index] = size;
    this.lives[index] = life;
    this.maxLives[index] = life;
    this.alphas[index] = 1;
  }

  /** 血雾。`dir` 是子弹方向，喷溅跟着弹道走。爆头再混一撮硬碎片。 */
  bloodBurst(point: Point3, dir: Point3, head: boolean): void {
    const count = head ? 10 : 6;
    for (let i = 0; i < count; i += 1) {
      this.emit(
        point.x,
        point.y,
        point.z,
        dir.x * rand(1, 4) + rand(-1.6, 1.6),
        rand(0.4, 3),
        dir.z * rand(1, 4) + rand(-1.6, 1.6),
        [0.85, 0.08, 0.06],
        rand(0.06, 0.13),
        rand(0.25, 0.5),
      );
    }
    if (head) {
      // 爆头碎屑：血雾里混几粒骨头色 / 头盔色的硬碎片，更快、更小、喷得更远 ——
      // 「打穿了」和「打中了」在余光里一眼可辨（COD 爆头的碎屑感）
      for (let i = 0; i < 6; i += 1) {
        const bone = i % 2 === 0;
        this.emit(
          point.x,
          point.y,
          point.z,
          dir.x * rand(2.5, 6) + rand(-2.4, 2.4),
          rand(1.2, 4),
          dir.z * rand(2.5, 6) + rand(-2.4, 2.4),
          bone ? [0.92, 0.88, 0.76] : [0.32, 0.3, 0.28],
          rand(0.03, 0.06),
          rand(0.3, 0.55),
        );
      }
    }
  }

  /**
   * 打在几何体上的火花。
   *
   * 三种表现，一眼能分出「打在什么上」：
   *
   *   金属墙面  亮黄火花，往法线方向崩
   *   木质障碍  褐色木屑，更少更短
   *   **地面**  尘土：颗粒更大、更慢、往四周散开而不是往上崩 —— 甲板被打中
   *             和钢板被打中，在余光里也应该看得出区别
   */
  impactSparks(point: Point3, normal: Point3, surface: Surface, ground = false): void {
    if (ground) {
      const count = surface === 'wood' ? 4 : 5;
      for (let i = 0; i < count; i += 1) {
        this.emit(
          point.x,
          point.y + 0.02,
          point.z,
          // 地面命中：水平方向散开（尘土被掀起），竖直方向几乎不动
          rand(-2.4, 2.4),
          rand(0.4, 1.4),
          rand(-2.4, 2.4),
          surface === 'wood' ? [0.5, 0.42, 0.3] : [0.42, 0.42, 0.4],
          rand(0.08, 0.15),
          rand(0.3, 0.55),
        );
      }
      return;
    }

    const wood = surface === 'wood';
    const count = wood ? 4 : 5;
    const color: [number, number, number] = wood ? [0.55, 0.38, 0.2] : [1, 0.82, 0.4];

    for (let i = 0; i < count; i += 1) {
      this.emit(
        point.x + normal.x * 0.05,
        point.y + normal.y * 0.05,
        point.z + normal.z * 0.05,
        normal.x * rand(1, 4) + rand(-1.2, 1.2),
        normal.y * rand(1, 3) + rand(0.2, 2.2),
        normal.z * rand(1, 4) + rand(-1.2, 1.2),
        color,
        wood ? 0.06 : 0.045,
        rand(0.15, 0.35),
      );
    }
  }

  /**
   * 抛壳：从枪身右侧甩出一枚弹壳。
   *
   * `port` 是**抛壳口的位置**（不是枪口），由玩家那边算好 —— 弹壳从枪口飞出来
   * 一眼就假。初速朝右后方，带翻滚，落到甲板上弹一下再躺住。
   */
  ejectShells(port: Point3, yaw: number): void {
    const casing = this.casings[this.casingCursor];
    this.casingCursor = (this.casingCursor + 1) % this.casings.length;

    // 右向量：yaw = 0 朝 -z 时，右侧是 +x
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const backX = Math.sin(yaw);
    const backZ = Math.cos(yaw);

    const mesh = casing.mesh;
    mesh.position.set(port.x, port.y, port.z);
    mesh.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));
    mesh.visible = true;

    // 右 1.6~2.6、上 1.4~2.2、后 0.3~0.9 —— 真人开枪时弹壳就是往右后方蹦的
    const side = rand(1.6, 2.6);
    const back = rand(0.3, 0.9);
    casing.velocity.set(
      rightX * side + backX * back,
      rand(1.4, 2.2),
      rightZ * side + backZ * back,
    );
    // 翻滚速度（弧度/秒）：给得大一点，小圆柱才看得出在转
    casing.spin.set(rand(-22, 22), rand(-16, 16), rand(-22, 22));
    casing.life = 3.2;
  }

  /* ============================================================
     弹痕 / 曳光 / 火光
     ============================================================ */

  spawnDecal(point: Point3, normal: Point3, surface: Surface = 'metal'): void {
    let mesh: THREE.Mesh;
    if (this.decals.length < DECAL_LIMIT) {
      mesh = new THREE.Mesh(this.decalGeometry, this.decalMaterials[surface]);
      this.scene.add(mesh);
      this.decals.push(mesh);
    } else {
      mesh = this.decals[this.decalCursor % this.decals.length]!;
      this.decalCursor += 1;
      // 环形复用：同一个 Mesh 会在「金属」和「木头」之间换材质，
      // 不换的话木箱上会慢慢爬满钢板的冷色弹孔
      mesh.material = this.decalMaterials[surface];
    }

    // 沿法线挪 1.2cm，避免和墙面共面
    mesh.position.set(point.x + normal.x * 0.012, point.y + normal.y * 0.012, point.z + normal.z * 0.012);
    mesh.lookAt(point.x + normal.x, point.y + normal.y, point.z + normal.z);
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.scale.setScalar(rand(0.8, 1.25));
    mesh.visible = true;
  }

  /**
   * 曳光。从池里取一条，改位置 / 长度 / 朝向。
   *
   * `dir` 必须用**这一发真实打出去的方向**（含散布），否则所有曳光都会收束到
   * 准星中心线上，看起来像「子弹全打在一个点」。
   */
  spawnTracer(from: Point3, to: Point3, color: number = TRACER_COLOR_BOT): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dy, dz);
    // 太短就不画：贴脸开枪时一条 20cm 的线看起来像准星卡住了
    if (length < 0.1) return;

    const entry = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % this.tracers.length;

    const mesh = entry.mesh;
    // 颜色逐实例设：池里的材质本来就不共享（opacity 要逐实例控制），
    // 每发 setHex 只是一个赋值，不会比原来多出分配
    entry.material.color.setHex(color);
    mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    mesh.scale.set(1, length, 1);
    // 复用两个临时向量：这里是每发子弹都走的路径，`new Vector3()` 两次
    // 在满射速下就是每秒二十次分配，正是要避免的那种 GC 抖动
    TRACER_UP.set(0, 1, 0);
    TRACER_DIR.set(dx / length, dy / length, dz / length);
    mesh.quaternion.setFromUnitVectors(TRACER_UP, TRACER_DIR);
    mesh.visible = true;
    entry.material.opacity = 0.85;
    entry.life = TRACER_LIFE;
  }

  /**
   * 枪口焰。
   *
   * `scale` / `life` 由武器表（`WeaponSpec.feel`）给：AWM 的焰要大一圈、挂 90ms，
   * M4 的小而短（42ms）—— 同一套表现参数下，口径差异才看得出来。
   *
   * ## 谁能「透墙」：只有本机自己的枪口
   *
   * 默认 `depthTest: true` —— 别人的枪口焰必须被集装箱正常挡住。之前整个池子
   * 都关着深度测试（为了本机贴墙开枪时火焰不被墙切一半），代价是隔着箱子也能
   * 看见对面开枪的那团光，等于送了一个「看火光找人」的透视。现在按**这一发是
   * 谁**逐发决定：本机（第一人称枪口就在镜头前 0.6 米）传 false，其余一律 true。
   *
   * `light` 同理：被挡住的枪口光不该把甲板/箱体照亮（点光没有阴影，光会从掩体
   * 里漏出来）。所以默认只在 `depthTest: false`（本机自己）时点灯；远处别人的
   * 火光只画 Sprite，不给场景打光。
   */
  spawnMuzzleFlash(
    point: Point3,
    dir: Point3,
    opts: { scale?: number; life?: number; depthTest?: boolean; light?: boolean } = {},
  ): void {
    const size = rand(0.28, 0.42) * (opts.scale ?? 1);
    const depthTest = opts.depthTest ?? true;
    this.takeFlash(
      this.flashes,
      this.flashCursor,
      {
        x: point.x + dir.x * 0.15,
        y: point.y + dir.y * 0.15,
        z: point.z + dir.z * 0.15,
      },
      size,
      opts.life ?? 0.05,
      0xffffff,
      depthTest,
    );

    // 枪口光照亮枪身和近处环境。强度随焰的大小走，否则大狙和小手枪一样亮。
    // 只给「本机自己的枪」点灯：别人的位置在掩体后面，点光会穿过去把这一侧照亮
    if (opts.light ?? !depthTest) {
      this.muzzleLight.position.set(point.x, point.y, point.z);
      this.muzzleLight.intensity = 45 * (opts.scale ?? 1);
    }
  }

  /**
   * 弹着点的短促亮点。
   *
   * 存在的理由：弹孔和火花都是「暗的」，连续交火时玩家看不清自己到底打在哪。
   * 这一点光只有 40ms、直径十来厘米，贴在**真实弹着点**上 —— 命中位置因此
   * 是一眼可辨的，而不是靠猜屏幕中心。
   */
  spawnImpactFlash(point: Point3, normal: Point3, surface: Surface): void {
    const metal = surface === 'metal';
    this.takeFlash(
      this.impactFlashes,
      this.impactCursor,
      {
        x: point.x + normal.x * 0.04,
        y: point.y + normal.y * 0.04,
        z: point.z + normal.z * 0.04,
      },
      metal ? rand(0.1, 0.14) : rand(0.08, 0.11),
      0.04,
      metal ? 0xdce8ff : 0xffc488,
    );
  }

  /** 从池里取一个火光，改位置 / 尺寸 / 朝向 / 颜色 / 是否被遮挡。池满时覆盖最老的那个。 */
  private takeFlash(
    pool: FlashEntry[],
    cursor: { index: number },
    point: Point3,
    size: number,
    life: number,
    color: number,
    depthTest = true,
  ): void {
    const entry = pool[cursor.index];
    cursor.index = (cursor.index + 1) % pool.length;

    entry.sprite.position.set(point.x, point.y, point.z);
    entry.sprite.scale.setScalar(size);
    entry.sprite.visible = true;
    entry.material.rotation = Math.random() * Math.PI * 2;
    entry.material.color.setHex(color);
    entry.material.opacity = 1;
    // 池子是本地/远端共用的，所以深度测试必须**逐发**设 —— 建池时写死会让
    // 本机的贴墙火焰和别人的透墙火焰只能二选一。depthTest 是渲染状态不是
    // shader 参数，逐发改不会触发材质重编。
    entry.material.depthTest = depthTest;
    entry.life = life;
    entry.max = life;
  }

  private createFlash(scene: THREE.Scene, depthTest = false): FlashEntry {
    const material = new THREE.SpriteMaterial({
      map: this.flashTexture,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      // 初始值只是占位：枪口焰池在 `takeFlash` 里按「本机 / 别人」逐发设
      // `material.depthTest`（本机 false 防贴墙切焰，别人 true 防透箱）。
      // 弹着点池反过来 —— 它必须被掩体正常遮挡，否则隔着箱子也能看见对面墙上
      // 的命中光点，那就成了「未命中却显示命中」的观感
      depthTest,
      transparent: true,
      opacity: 0,
    });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, material, life: 0, max: 0 };
  }

  /** 爆炸：一个膨胀的光球 + 一圈火花 + 一股灰烟。 */
  spawnExplosion(point: Point3): void {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffb050,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sphere = new THREE.Mesh(this.boomGeometry, material);
    sphere.position.set(point.x, point.y, point.z);
    this.scene.add(sphere);
    this.sprites.push({ object: sphere, material, life: 0.35, max: 0.35 });

    for (let i = 0; i < 34; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const elevation = Math.random() * Math.PI * 0.5;
      const speed = rand(4, 16);
      this.emit(
        point.x,
        point.y,
        point.z,
        Math.cos(angle) * Math.cos(elevation) * speed,
        Math.sin(elevation) * speed,
        Math.sin(angle) * Math.cos(elevation) * speed,
        [1, rand(0.5, 0.85), 0.2],
        rand(0.1, 0.24),
        rand(0.35, 0.8),
      );
    }
    for (let i = 0; i < 10; i += 1) {
      this.emit(
        point.x,
        point.y,
        point.z,
        rand(-2, 2),
        rand(1, 5),
        rand(-2, 2),
        [0.25, 0.24, 0.22],
        rand(0.3, 0.55),
        rand(0.8, 1.4),
      );
    }

    this.boomLight.position.set(point.x, point.y, point.z);
    this.boomLight.intensity = 260;
  }

  /* ============================================================
     每帧
     ============================================================ */

  update(dt: number): void {
    this.updateParticles(dt);
    this.updateTracers(dt);
    this.updateFlashes(dt);
    this.updateCasings(dt);
    this.updateSprites(dt);

    // 光源按指数衰减；用固定速率减（原版 dt*220）在低帧率下会拖得更久
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 900);
    this.boomLight.intensity = Math.max(0, this.boomLight.intensity - dt * 760);
  }

  private updateParticles(dt: number): void {
    const { positions, velocities, lives, maxLives, alphas } = this;

    for (let i = 0; i < this.particleCount; i += 1) {
      const life = lives[i];
      if (life <= 0) {
        alphas[i] = 0;
        continue;
      }

      const remaining = life - dt;
      if (remaining <= 0) {
        lives[i] = 0;
        alphas[i] = 0;
        positions[i * 3 + 1] = -999;
        continue;
      }
      lives[i] = remaining;

      // 平方淡出：火花一开始亮、最后几乎瞬间消失，比线性自然
      const t = remaining / maxLives[i];
      alphas[i] = t * t;

      const vy = velocities[i * 3 + 1] - PARTICLE_GRAVITY * dt;
      velocities[i * 3 + 1] = vy;

      const px = positions[i * 3] + velocities[i * 3] * dt;
      const py = positions[i * 3 + 1] + vy * dt;
      const pz = positions[i * 3 + 2] + velocities[i * 3 + 2] * dt;

      if (py < 0.02) {
        // 甲板面反弹，弹两下就停
        positions[i * 3] = px;
        positions[i * 3 + 1] = 0.02;
        positions[i * 3 + 2] = pz;
        velocities[i * 3 + 1] = vy * -0.32;
        velocities[i * 3] *= 0.6;
        velocities[i * 3 + 2] *= 0.6;
      } else {
        positions[i * 3] = px;
        positions[i * 3 + 1] = py;
        positions[i * 3 + 2] = pz;
      }
    }

    const geometry = this.points.geometry;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aColor.needsUpdate = true;
    geometry.attributes.aAlpha.needsUpdate = true;
    geometry.attributes.aSize.needsUpdate = true;
  }

  /**
   * 弹壳：重力 + 翻滚 + 落地弹一下。
   *
   * 弹壳**不参与射线检测**，会穿过箱子掉下去 —— 这是刻意的：真去算碰撞的话，
   * 每发子弹都要多一次 AABB 查询，而弹壳只在脚下几十厘米处存在半秒，穿模看不见。
   */
  private updateCasings(dt: number): void {
    for (const casing of this.casings) {
      if (casing.life <= 0) continue;

      casing.life -= dt;
      if (casing.life <= 0) {
        casing.mesh.visible = false;
        continue;
      }

      const velocity = casing.velocity;
      velocity.y -= CASING_GRAVITY * dt;

      const mesh = casing.mesh;
      mesh.position.x += velocity.x * dt;
      mesh.position.y += velocity.y * dt;
      mesh.position.z += velocity.z * dt;
      mesh.rotation.x += casing.spin.x * dt;
      mesh.rotation.y += casing.spin.y * dt;
      mesh.rotation.z += casing.spin.z * dt;

      // 落到甲板上：还有速度就弹一下（损失大部分能量），否则躺住不动
      if (mesh.position.y < 0.012) {
        mesh.position.y = 0.012;
        if (Math.abs(velocity.y) > 1.2) {
          velocity.y = -velocity.y * 0.34;
          velocity.x *= 0.55;
          velocity.z *= 0.55;
          casing.spin.multiplyScalar(0.4);
        } else {
          velocity.set(0, 0, 0);
          casing.spin.set(0, 0, 0);
          // 躺平：让圆柱的轴贴地，看起来才像「掉在地上的弹壳」
          mesh.rotation.x = Math.PI / 2;
        }
      }
    }
  }

  private updateTracers(dt: number): void {
    for (const tracer of this.tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt;
      if (tracer.life <= 0) {
        // 池里的对象**不销毁**，只隐藏 —— 下一发直接复用
        tracer.mesh.visible = false;
        tracer.material.opacity = 0;
        continue;
      }
      tracer.material.opacity = Math.min(0.85, (tracer.life / TRACER_LIFE) * 0.85);
    }
  }

  /** 火光淡出。枪口焰 40~90ms、弹着点 40ms，平方曲线收尾干脆，不会拖成光斑。 */
  private updateFlashes(dt: number): void {
    this.fadeFlashPool(this.flashes, dt);
    this.fadeFlashPool(this.impactFlashes, dt);
  }

  private fadeFlashPool(pool: FlashEntry[], dt: number): void {
    for (const entry of pool) {
      if (entry.life <= 0) continue;
      entry.life -= dt;
      if (entry.life <= 0) {
        entry.life = 0;
        entry.sprite.visible = false;
        entry.material.opacity = 0;
        continue;
      }
      const t = entry.life / entry.max;
      entry.material.opacity = t * t;
    }
  }

  /** 爆炸球：低频、形状各异，不进池 —— 一局也没几个，每次新建再释放更简单。 */
  private updateSprites(dt: number): void {
    for (let i = this.sprites.length - 1; i >= 0; i -= 1) {
      const entry = this.sprites[i]!;
      entry.life -= dt;

      if (entry.life <= 0) {
        this.scene.remove(entry.object);
        entry.material.dispose();
        this.sprites.splice(i, 1);
        continue;
      }

      // 膨胀到 4.5 倍半径，同时淡出
      const progress = 1 - entry.life / entry.max;
      const scale = 1 + progress * 3.5;
      entry.object.scale.set(scale, scale, scale);
      entry.material.opacity = 0.85 * (1 - progress);
    }
  }

  /* ============================================================
     清理
     ============================================================ */

  dispose(): void {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();

    for (const decal of this.decals) this.scene.remove(decal);
    this.decalGeometry.dispose();
    // 两张弹痕材质共用同一张贴图：只释放一次
    this.decalMaterials.metal.map?.dispose();
    this.decalMaterials.metal.dispose();
    this.decalMaterials.wood.dispose();

    for (const tracer of this.tracers) {
      this.scene.remove(tracer.mesh);
      tracer.material.dispose();
    }
    this.tracers.length = 0;
    this.tracerGeometry.dispose();

    for (const casing of this.casings) this.scene.remove(casing.mesh);
    this.casings.length = 0;
    this.casingGeometry.dispose();
    this.casingMaterial.dispose();

    for (const pool of [this.flashes, this.impactFlashes]) {
      for (const entry of pool) {
        this.scene.remove(entry.sprite);
        entry.material.dispose();
      }
      pool.length = 0;
    }

    for (const entry of this.sprites) {
      this.scene.remove(entry.object);
      entry.material.dispose();
    }
    this.boomGeometry.dispose();
    this.flashTexture.dispose();

    this.scene.remove(this.muzzleLight);
    this.scene.remove(this.boomLight);
  }
}

/* ============================================================
   贴图
   ============================================================ */

function dotTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function decalTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(12,10,8,0.95)');
  gradient.addColorStop(0.45, 'rgba(30,26,22,0.7)');
  gradient.addColorStop(0.8, 'rgba(60,52,44,0.22)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function flashTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,240,1)');
  gradient.addColorStop(0.25, 'rgba(255,205,120,0.9)');
  gradient.addColorStop(0.6, 'rgba(255,140,40,0.35)');
  gradient.addColorStop(1, 'rgba(255,90,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}
