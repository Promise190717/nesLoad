import * as THREE from 'three';
import { TEAM_CLOTH, surfaceMaps } from './surface-textures';
import type { Actor, Team, WeaponId } from './types';

/**
 * 把 `Actor` 的数据翻译成一个看得见的模型 —— **只管渲染，不懂 AI**。
 *
 * 拆出来的理由：`bot.ts` 里一旦混进 Mesh 和材质，就会出现「AI 逻辑依赖渲染
 * 顺序」「Bot 不生成模型就不更新」这类耦合。现在引擎每帧只做一件事：
 * `for (bot of bots) view.sync(bot, dt)`。
 *
 * ## 为什么是自己建模（2026-11-12 第三轮定稿）
 *
 * 外部 GLB 走过两轮（shanebrumback 士兵 → Quaternius Toon Shooter），用户先后
 * 否掉：第一轮「太丑、分不清敌我」，第二轮「和地图不搭 + 人机看不见 + 尸体
 * 站着走路」。**GLB 路线彻底删除**（actor-model.ts / public/h5/soldier.glb 已删），
 * 回到纯几何体拼装 —— 但比最早的 Box 小人认真得多：
 *
 *   - 分节四肢（髋/膝、肩/肘两级 pivot），走路有屈膝、跑步有前倾；
 *   - 护甲 / 弹匣袋 / 背包 / 肩垫 / 头盔（半球）+ 风镜 + 脖子/领口、肩带、
 *     电台与天线、护膝、头盔夜视仪底座；真人额外有鼻子/耳朵。人机只戴面罩，
 *     不做金属头/天线/发光眼（机器人造型被用户否掉：机械感太重）；
 *   - 双手持枪姿势（**枪在手里，不是挂在肚子上**），枪按武器换形，且
 *     **AK / M4 必须长得不一样**（换主武器是最常见的换枪，同几何 = 看不出换了）：
 *     AK 弯弹匣粗护木 / M4 直弹匣细护木 + 提把 / AWM 长管 + 镜 / 霰弹粗管 /
 *     手枪 / 刀 / 手雷；`sync()` 每帧比对 `actor.weapon` 自动重建；
 *   - 开火后座（枪身后顶 + 枪口上跳）；
 *   - 死亡沿用弹道倒地 + 落地余震 + 淡出。
 *
 * ## 敌我识别
 *
 *   ① 布料整块高饱和阵营色（0 队蓝 / 1 队红棕），和写实军事地图的冷灰底
 *      拉开对比 —— 用户反馈过「轻微 lerp 看不出来」；
 *   ② **只有阵营色这一层信号，头顶不挂任何标记**。倒三角标记先是在 2026-11-12
 *      因为「给敌人开透视」被限制到队友，2026-11-13 用户要求连蓝方一起去掉 ——
 *      头顶飘一个 sprite 本身就出戏。删掉的是 `markerTextureFor` 那套 Canvas
 *      纹理 + Sprite（曾经还带死亡熄灭和尸体淡出联动），别再按「队友才挂」加回来。
 *
 * ## 零静态资源
 *
 * 和场景、枪模同一套规矩：没有外部模型 / 贴图 / 音频，全部 three 几何体 +
 * 运行时 Canvas。几何体逐视图新建（逐个 dispose），材质按「阵营 + 造型」
 * 缓存模板、逐视图 clone（淡出是材质级 opacity）。
 */

/** 造型：真人还是人机。**由 `Actor.isHuman` 决定**。两者都是普通士兵外观 —— 用户否掉了「机器人」造型（金属头/天线/发光眼太机械感），人机只戴面罩，敌我识别全靠阵营色布料。 */
export type ActorKind = 'human' | 'bot';

export interface ActorView {
  readonly group: THREE.Group;
  /**
   * 每帧调用。位置、朝向、走路摆臂、倒地动画都在这里。
   *
   * 手里的武器模型也在这里**跟着 `actor.weapon` 自动换**：远端玩家/人机切到
   * 手枪、刀或手雷时，别人看到的不再永远是出生时那把步枪。
   */
  sync(actor: Actor, dt: number): void;
  /**
   * 被击杀的瞬间调用。`dx / dz` 是**弹道的水平方向**（从击杀者指向死者），
   * 尸体沿它倒下去 —— 所以正面中弹会往后仰，背后中弹会往前扑。
   * 传 (0, 0) 或长度过短时退回「往前扑」。
   */
  setDeathImpulse(dx: number, dz: number): void;
  /** 尸体透明度 1 → 0。活着的时候会被 `sync` 自动重置回 1。 */
  setOpacity(value: number): void;
  /** 远端这一枪响了 —— 触发一次开火后座动画。 */
  playFire(): void;
  /**
   * 这个角色被子弹打中了 —— 触发一次受击顿挫（身体后仰 + 头部前点）。
   *
   * `head` 只影响动作幅度（爆头更大）。**不改位置/朝向**：那一份永远属于
   * 权威端，模型自己歪一下不会让人觉得「打中了却打偏」。
   */
  playHit(head: boolean): void;
  /** 只释放几何体。材质是每个视图自己克隆的一份，也要在这里释放。 */
  dispose(): void;
}

interface TeamMaterials {
  /** 主布料（作训服）：高饱和阵营色 */
  cloth: THREE.MeshStandardMaterial;
  clothDark: THREE.MeshStandardMaterial;
  /** 护甲 / 背心：比布料更深一档的冷灰 */
  vest: THREE.MeshStandardMaterial;
  /** 装备（枪套 / 头盔底 / 垫肩）：近黑 */
  gear: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  gun: THREE.MeshStandardMaterial;
  /** 风镜镜片：哑光深色，不发光（发光 = 机械感，用户否掉） */
  trim: THREE.MeshStandardMaterial;
}

/**
 * 材质模板按「阵营 + 造型」缓存，每个视图 clone 一份（尸体淡出是材质级
 * opacity，共享会让全场一起透明）。克隆参数相同，three 的 program cache
 * 会合并 shader，不存在多编译的问题。
 */
const teamMaterials = new Map<string, TeamMaterials>();

function materialsFor(team: Team, kind: ActorKind): TeamMaterials {
  const key = `${team}:${kind}`;
  const cached = teamMaterials.get(key);
  if (cached) return cached;

  // 🔴 敌我识别第一眼信息：0 队 CF 潜伏者土黄（匪）、1 队 CF 保卫者蓝灰（警）。
  // 色相按 CF 军服做旧感压了饱和度（写实地图上不刺眼），但色差仍然拉开 —— 别改回同色系。
  // ⚠️ 数值 = 原色 × 1.18：cloth 迷彩贴图的平均亮度从 0.965 掉到 ~0.8
  //（见 surface-textures.ts paintCloth），不补偿的话队服整体暗一档。
  const [cloth, clothDark] = TEAM_CLOTH[team];

  // 布料 / 背心 / 装具 / 皮肤各有一张**灰度**的贴图（见 surface-textures.ts）：
  // 迷彩、织带、颗粒全是灰阶图案，阵营色仍然由 `color` 染 —— 一张图两队共用，
  // 敌我识别还是只靠色相。人物贴图不做 UV 铺米：胶囊/球体本身只有 0..1 的 UV，
  // 一个部件一张图，图案按部件大小自然缩放，近看刚好是 3~10 厘米的迷彩色块
  const clothMaps = surfaceMaps('cloth');
  const vestMaps = surfaceMaps('vest');
  const gearMaps = surfaceMaps('gear');
  const skinMaps = surfaceMaps('skin');

  const fabric = (maps: ReturnType<typeof surfaceMaps>, color: number): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({
      color,
      map: maps.map,
      normalMap: maps.normalMap,
      roughnessMap: maps.roughnessMap,
      // 和关卡同一条规矩：带 roughnessMap 时标量必须是 1（它是乘数）
      roughness: 1,
      metalness: 0,
      normalScale: new THREE.Vector2(0.7, 0.7),
    });

  const materials: TeamMaterials = {
    cloth: fabric(clothMaps, cloth),
    clothDark: fabric(clothMaps, clothDark),
    // 背心 = CF 风深橄榄，装备近黑灰；金属度全部压到 0（机械感被否过）
    vest: fabric(vestMaps, 0x3a4034),
    gear: fabric(gearMaps, 0x23272b),
    skin: fabric(skinMaps, 0xb08a66),
    gun: new THREE.MeshStandardMaterial({ color: 0x1c1f23, roughness: 0.6, metalness: 0.45 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.35, metalness: 0.1 }),
  };
  teamMaterials.set(key, materials);
  return materials;
}

function cloneMaterials(base: TeamMaterials): TeamMaterials {
  const clone = (material: THREE.MeshStandardMaterial) => {
    const copy = material.clone();
    // 一开始就把 transparent 打开：等到真淡出那一刻再改，会触发一次 shader
    // 重编译 —— 而那一刻正好是玩家在看自己的尸体
    copy.transparent = true;
    copy.opacity = 1;
    return copy;
  };
  return {
    cloth: clone(base.cloth),
    clothDark: clone(base.clothDark),
    vest: clone(base.vest),
    gear: clone(base.gear),
    skin: clone(base.skin),
    gun: clone(base.gun),
    trim: clone(base.trim),
  };
}

/** 倒地动画的时长（秒）。1/2.6 ≈ 0.38 秒，比「瞬间躺下」自然，又不拖节奏。 */
const DEATH_FALL_SPEED = 2.6;

/** 倒地时绕水平轴转的角度。90° = 完全躺平。 */
const FALL_ANGLE = Math.PI / 2;

/** 落地那一下的回弹高度（米）。 */
const FALL_BOUNCE = 0.14;

/** 开火后座动画在最后一枪之后继续保持的秒数（连发期间每枪刷新）。 */
const FIRE_HOLD = 0.35;

/**
 * 受击顿挫的时长（秒）。
 *
 * 0.17 秒 ≈ 10 帧：短到能跟上 600 RPM 的连发（每 0.1 秒一发，动作会被下一发
 * 接着推），又长到「一眼看见」。再长会变成抽搐，再短就等于没有。
 */
const HIT_HOLD = 0.17;

const UP = new THREE.Vector3(0, 1, 0);
const yawQuat = new THREE.Quaternion();
const fallQuat = new THREE.Quaternion();
const fallAxis = new THREE.Vector3();

export function createActorView(team: Team, kind: ActorKind = 'bot', weapon: WeaponId = 'ak47'): ActorView {
  const materials = cloneMaterials(materialsFor(team, kind));
  const group = new THREE.Group();

  /* ============================================================
     士兵建模（正面 = -z。所有 y 都是「站立时离地高度」）

     形体参考 CF：圆润人体块（胶囊四肢 + 球关节），不是直角盒子；
     宽肩、收腰、长腿 —— 比例按 1.8m 拉开，摆脱「乐高感」。
     ============================================================ */

  const part = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  /** 球（关节 / 头 / 鞋头）。squash = y 向压扁系数。 */
  const blob = (r: number, x: number, y: number, z: number, material: THREE.Material, squash = 1) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), material);
    mesh.position.set(x, y, z);
    mesh.scale.y = squash;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  /** 胶囊：垂直放置，`y0` 是顶端离地高、`y1` 是底端，中段半径 r（相对 pivot）。 */
  const capsule = (r: number, y0: number, y1: number, x: number, z: number, material: THREE.Material) => {
    const length = Math.max(0.02, y0 - y1 - r * 2);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, length, 3, 8), material);
    mesh.position.set(x, (y0 + y1) / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  /**
   * 整个身体挂在 `body` 下：走路上下起伏、跑步前倾都只动这一个
   * 组，腿和上身不用分别算。
   */
  const body = new THREE.Group();
  group.add(body);

  // ---- 腿：髋 pivot（大腿）→ 膝 pivot（小腿 + 靴），两级才能屈膝 ----
  // 长腿是「摆脱乐高感」的关键：髋在 0.98，腿占身高一半以上
  const makeLeg = (side: number) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.1, 0.98, 0);
    hip.add(capsule(0.072, 0, -0.46, 0, 0, materials.clothDark)); // 大腿（相对 pivot）
    hip.add(blob(0.075, 0, -0.46, 0, materials.clothDark)); // 膝关节球
    const knee = new THREE.Group();
    knee.position.set(0, -0.46, 0);
    knee.add(capsule(0.058, -0.02, -0.42, 0, 0, materials.clothDark)); // 小腿
    // 护膝：压扁的球贴在膝盖正面，跑动时比光秃秃的胶囊腿更像战术装备
    knee.add(blob(0.078, 0, -0.1, -0.055, materials.gear, 0.78));
    // 军靴：鞋就该有棱角，保留盒子；鞋头用球收圆
    knee.add(part(0.13, 0.16, 0.15, 0, -0.34, 0.01, materials.gear));
    knee.add(blob(0.065, 0, -0.395, -0.09, materials.gear));
    knee.add(part(0.14, 0.05, 0.3, 0, -0.43, -0.06, materials.gear)); // 靴底
    hip.add(knee);
    body.add(hip);
    return { hip, knee };
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // ---- 骨盆 / 躯干 / 战术背心 ----
  // 躯干用变径圆柱（上粗下细）压扁成椭圆截面：收腰 + 挺胸，CF 的倒三角身形
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.115, 0.44, 10), materials.cloth);
  torso.scale.z = 0.68;
  torso.position.set(0, 1.28, 0);
  torso.castShadow = true;
  torso.receiveShadow = true;
  body.add(torso);
  body.add(blob(0.105, 0, 1.06, 0, materials.clothDark)); // 骨盆球
  // 战术背心：包住胸腔的橄榄色壳 + 肩带
  const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.15, 0.36, 10), materials.vest);
  vest.scale.z = 0.75;
  vest.position.set(0, 1.33, 0);
  vest.castShadow = true;
  vest.receiveShadow = true;
  body.add(vest);
  // 胸前三联弹匣袋（CF 标志性装具）
  body.add(part(0.085, 0.13, 0.06, -0.085, 1.3, -0.15, materials.vest));
  body.add(part(0.085, 0.13, 0.06, 0.005, 1.3, -0.155, materials.vest));
  body.add(part(0.085, 0.13, 0.06, 0.09, 1.3, -0.15, materials.vest));
  // 腰带 + 后腰包
  body.add(part(0.3, 0.06, 0.2, 0, 1.1, 0, materials.gear));
  body.add(part(0.22, 0.14, 0.1, 0, 1.16, 0.13, materials.vest));
  // 肩垫：盖在肩球上的小扁球，撑出宽肩轮廓
  body.add(blob(0.085, -0.2, 1.52, 0, materials.vest, 0.7));
  body.add(blob(0.085, 0.2, 1.52, 0, materials.vest, 0.7));
  // 肩带：从胸前跨过肩顶到后背的两条窄带。没有它，背心像一个套在身上的桶
  body.add(part(0.06, 0.035, 0.24, -0.16, 1.535, -0.01, materials.gear));
  body.add(part(0.06, 0.035, 0.24, 0.16, 1.535, -0.01, materials.gear));
  // 左胸电台包 + 天线（小队通讯兵既视感），右胸一个小工具包。
  // x 不能超过 ±0.11：背心是椭圆截面，再往外表面就缩到 z≈-0.07，包会浮空
  body.add(part(0.07, 0.1, 0.05, -0.11, 1.42, -0.12, materials.vest));
  body.add(part(0.012, 0.17, 0.012, -0.13, 1.55, -0.11, materials.trim));
  body.add(part(0.06, 0.08, 0.04, 0.11, 1.42, -0.12, materials.gear));

  // ---- 脖子 / 领口：头直接悬在躯干上会有一道缝，补一节脖子和一圈领口 ----
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.058, 0.068, 0.11, 8),
    kind === 'human' ? materials.skin : materials.clothDark,
  );
  neck.position.set(0, 1.55, 0);
  neck.castShadow = true;
  neck.receiveShadow = true;
  body.add(neck);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.055, 10), materials.clothDark);
  collar.position.set(0, 1.52, 0);
  collar.castShadow = true;
  collar.receiveShadow = true;
  body.add(collar);

  // ---- 头：球头 + 球壳头盔 + 风镜（真人露脸，人机戴面罩） ----
  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  body.add(head);

  if (kind === 'human') {
    head.add(blob(0.11, 0, 0.02, 0, materials.skin));
    // 眼睛：一条深色横条，让正脸不是一整块肉色
    head.add(part(0.13, 0.03, 0.02, 0, 0.045, -0.1, materials.gear));
    // 鼻子 / 耳朵：圆头侧面和正面各补一块，不然正脸像颗鸡蛋
    head.add(blob(0.028, 0, 0.005, -0.108, materials.skin));
    head.add(blob(0.026, -0.105, 0.02, 0, materials.skin));
    head.add(blob(0.026, 0.105, 0.02, 0, materials.skin));
  } else {
    // 人机 = 戴面罩的士兵：整个头是布料色（巴拉克拉法帽），留风镜缝。
    // 不要金属头/天线/发光眼 —— 用户反馈机械感太重。
    head.add(blob(0.11, 0, 0.02, 0, materials.clothDark));
  }
  // 头盔：大半球壳 + 短裙边（下沿外扩一圈，像 CF 的战术头盔）
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), materials.vest);
  dome.position.set(0, 0.03, 0);
  dome.castShadow = true;
  head.add(dome);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.142, 0.05, 12), materials.vest);
  rim.position.set(0, 0.028, 0);
  rim.castShadow = true;
  head.add(rim);
  // 风镜：哑光深色镜片，两边一样 —— 不再自发光（发光 = 机械感）
  head.add(part(0.16, 0.04, 0.03, 0, 0.045, -0.105, materials.trim));
  // 头盔正面的夜视仪底座：一个很小的方块，侧面轮廓就多一层装备感
  head.add(part(0.05, 0.03, 0.035, 0, 0.075, -0.125, materials.trim));

  // ---- 手臂：肩 pivot（大臂）→ 肘 pivot（小臂 + 手套），摆成持枪姿势 ----
  const makeArm = (side: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.24, 1.46, 0);
    shoulder.add(blob(0.07, 0, 0.02, 0, materials.cloth)); // 肩关节球
    shoulder.add(capsule(0.058, -0.04, -0.3, 0, 0, materials.cloth)); // 大臂
    shoulder.add(blob(0.058, 0, -0.3, 0, materials.cloth)); // 肘关节球
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.3, 0);
    elbow.add(capsule(0.05, -0.02, -0.26, 0, 0, materials.clothDark)); // 小臂
    elbow.add(blob(0.052, 0, -0.27, 0, materials.gear)); // 手套
    shoulder.add(elbow);
    body.add(shoulder);
    return { shoulder, elbow };
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);
  // 持枪姿势：双手都要落在枪上，而不是垂在身体两侧。
  // - 右臂：肘弯得大一点，右手停在握把高度；
  // - 左臂：肩抬得更高、肘几乎伸直，左手前伸扶住机匣/护木；
  // - `rotation.z`（±0.4）把两条上臂从肩膀向内收 —— 没有这一下，两只手
  //   停在身体两侧，枪就只能像挂在肚子前面。
  // rotation.x 正 = 手往身前（-z）摆。
  armR.shoulder.rotation.set(0.3, 0, -0.4);
  armR.elbow.rotation.x = 1.15;
  armL.shoulder.rotation.set(0.9, 0, 0.4);
  armL.elbow.rotation.x = 0.5;

  // ---- 枪：按武器换形。挂在 body 上（不挂手臂 —— 双手 IK 太贵，姿势固定即可） ----
  // y = 1.28 是胸口高度（不是肚子），z = -0.44 让机匣整体落在双手前方；
  // 枪托尾端会藏进胸口，这是正常的 —— 真枪的枪托也贴着肩窝。
  const gun = new THREE.Group();
  gun.position.set(0, 1.28, -0.44);
  const GUN_Z = gun.position.z;
  const buildGun = (id: WeaponId): void => {
    if (id === 'awm') {
      // 狙击：长管 + 瞄准镜
      gun.add(part(0.05, 0.09, 0.5, 0, 0, 0, materials.gun));
      gun.add(part(0.028, 0.028, 0.5, 0, 0.01, -0.48, materials.gun));
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.18, 8), materials.gun);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.09, -0.06);
      scope.castShadow = true;
      gun.add(scope);
      gun.add(part(0.045, 0.14, 0.08, 0, -0.1, 0.06, materials.gun));
      gun.add(part(0.05, 0.1, 0.16, 0, -0.02, 0.32, materials.gun));
    } else if (id === 'shotgun') {
      // 霰弹：粗管 + 护木
      gun.add(part(0.06, 0.1, 0.4, 0, 0, 0, materials.gun));
      gun.add(part(0.05, 0.05, 0.34, 0, 0.01, -0.36, materials.gun));
      gun.add(part(0.055, 0.05, 0.14, 0, -0.06, -0.26, materials.gear));
      gun.add(part(0.05, 0.1, 0.16, 0, -0.02, 0.28, materials.gun));
    } else if (id === 'usp') {
      // 手枪：套筒 + 握把。握把落在右手高度，枪口短，轮廓和步枪明显不同
      gun.add(part(0.04, 0.07, 0.2, 0, -0.05, 0, materials.gun));
      gun.add(part(0.038, 0.11, 0.05, 0, -0.12, 0.08, materials.gun));
    } else if (id === 'knife') {
      // 军刀：短握把 + 刀身 + 护手。刀身朝前（-z），一眼能和枪分开
      gun.add(part(0.034, 0.045, 0.14, 0, -0.11, 0.1, materials.gear));
      gun.add(part(0.012, 0.055, 0.24, 0, -0.095, -0.13, materials.trim));
      gun.add(part(0.05, 0.018, 0.035, 0, -0.105, 0.02, materials.gear));
    } else if (id === 'grenade') {
      // 手雷：小圆球 + 顶盖 + 保险杆，握在右手位置。不是枪，轮廓必须明显不同
      gun.add(blob(0.055, 0.02, -0.1, 0.04, materials.gear, 1.1));
      gun.add(part(0.032, 0.022, 0.032, 0.02, -0.037, 0.04, materials.gun));
      gun.add(part(0.012, 0.02, 0.075, 0.042, -0.03, 0.07, materials.trim));
    } else if (id === 'm4a1') {
      // M4：细护木 + 直弹匣 + 提把 + 伸缩托。**必须和 AK 分开** —— 换主武器是
      // 最常见的换枪，两把枪要是一套几何，别人眼里就是「他怎么换都没变」。
      gun.add(part(0.055, 0.095, 0.42, 0, 0, 0, materials.gun)); // 机匣
      gun.add(part(0.026, 0.026, 0.36, 0, 0.015, -0.36, materials.gun)); // 枪管
      gun.add(part(0.042, 0.045, 0.17, 0, 0.01, -0.22, materials.gear)); // 细护木
      const straight = part(0.037, 0.15, 0.075, 0, -0.1, 0.05, materials.gun); // 直弹匣
      straight.rotation.x = 0.06;
      gun.add(straight);
      gun.add(part(0.055, 0.022, 0.16, 0, 0.058, -0.02, materials.trim)); // 提把
      gun.add(part(0.028, 0.05, 0.03, 0, 0.055, -0.38, materials.gear)); // 准星
      gun.add(part(0.038, 0.085, 0.15, 0, -0.005, 0.29, materials.gun)); // 伸缩托
    } else {
      // AK：机匣 + 枪管 + 弯弹匣 + 木托 + 准星
      gun.add(part(0.06, 0.1, 0.46, 0, 0, 0, materials.gun));
      gun.add(part(0.03, 0.03, 0.34, 0, 0.015, -0.38, materials.gun));
      const mag = part(0.045, 0.16, 0.09, 0, -0.11, 0.04, materials.gun);
      mag.rotation.x = 0.25;
      gun.add(mag);
      gun.add(part(0.04, 0.1, 0.05, 0, -0.09, 0.13, materials.gear));
      gun.add(part(0.05, 0.09, 0.17, 0, -0.01, 0.31, materials.gun));
      gun.add(part(0.03, 0.04, 0.12, 0, 0.075, -0.05, materials.gear));
    }
  };
  let gunWeapon = weapon;
  buildGun(gunWeapon);

  /**
   * 换枪模：远端切主武器/手枪/刀/雷时，别人看到的手里那把东西要跟着变。
   *
   * 用「清掉重建」而不是开局把六套模型都建好再切 visible：切枪一局也就几次，
   * 每次只有六七个 BoxGeometry，远不是稳态开销；反过来常驻六套模型会让每个
   * 角色多背几十个 Mesh，12 个人就是几百个节点，纯浪费。
   * 旧几何体必须在这里 dispose —— `dispose()` 只遍历当前挂着的孩子，
   * 被 clear 掉的不会有人再释放。
   */
  const setGunWeapon = (id: WeaponId): void => {
    if (id === gunWeapon) return;
    gunWeapon = id;
    gun.traverse((child) => {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
    });
    gun.clear();
    buildGun(id);
  };
  body.add(gun);

  /* ============================================================
     动画状态
     ============================================================ */
  let animPhase = 0;
  let deathPhase = 0;
  let wasAlive = true;
  let opacity = 1;
  let fireTimer = 0;
  let recoil = 0;
  /**
   * 受击反应的剩余时长（秒）与「这一下是不是爆头」。
   *
   * 为什么必须有：血雾会飘走、hitmarker 会消失，但敌人的模型会明确告诉你
   * 「这一发进去了」。CS 里被打中的人会有一个短促的顿挫 —— 没有它，连续
   * 命中会让人怀疑子弹是不是穿过去了。
   *
   * 和 `fireTimer` 分开：开火是射手自己的动作，受击是被打的那一方，两者
   * 可以同时发生（对枪互换），用一个计时器会互相清掉。
   */
  let hitTimer = 0;
  let hitHead = false;

  /* ---- 倒地方向：世界坐标下的弹道方向，`impulseSet` 为假时退回「往前扑」 ---- */
  let impulseX = 0;
  let impulseZ = -1;
  let impulseSet = false;

  const applyOpacity = (value: number): void => {
    const next = Math.max(0, Math.min(1, value));
    if (Math.abs(next - opacity) < 0.004) return;
    opacity = next;
    materials.cloth.opacity = next;
    materials.clothDark.opacity = next;
    materials.vest.opacity = next;
    materials.gear.opacity = next;
    materials.skin.opacity = next;
    materials.gun.opacity = next;
    materials.trim.opacity = next;
    group.visible = next > 0.02;
  };

  const setDeathImpulse = (dx: number, dz: number): void => {
    const length = Math.hypot(dx, dz);
    if (length < 0.01) {
      impulseSet = false;
      return;
    }
    impulseX = dx / length;
    impulseZ = dz / length;
    impulseSet = true;
  };

  const setOpacity = (value: number): void => {
    applyOpacity(value);
  };

  const playFire = (): void => {
    fireTimer = FIRE_HOLD;
    recoil = 1;
  };

  /**
   * 被打中时的顿挫。`head` = 爆头，动作更大。
   *
   * 只驱动第三人称模型（姿态），不改位置、不改朝向 —— 位置永远由权威端决定，
   * 模型自己歪一下不会造成「打中了却打偏」的错觉。
   */
  const playHit = (head: boolean): void => {
    hitTimer = HIT_HOLD;
    if (head) hitHead = true;
  };

  const sync = (actor: Actor, dt: number): void => {
    group.position.set(actor.pos.x, actor.pos.y, actor.pos.z);
    // 手里武器变了就换模型。放在 `alive` 早退之前：死亡期间（观战/等待复活）
    // 也可能收到切枪快照，复活第一帧就该是新枪
    setGunWeapon(actor.weapon);

    if (!actor.alive) {
      // 倒地：绕「与弹道垂直的水平轴」旋转，往哪边倒跟着中弹方向走
      if (deathPhase < 1) {
        deathPhase = Math.min(1, deathPhase + dt * DEATH_FALL_SPEED);

        // 世界方向 → 角色本地方向（角色已经按 yaw 转过了）
        const c = Math.cos(actor.yaw);
        const s = Math.sin(actor.yaw);
        const localX = impulseSet ? impulseX * c - impulseZ * s : 0;
        const localZ = impulseSet ? impulseX * s + impulseZ * c : -1;
        const localLength = Math.hypot(localX, localZ) || 1;

        // 旋转轴 = 本地方向在水平面内转 90°。(0,0,-1) 会得到 (1,0,0)，
        // 也就是「绕 x 轴 -90°」= 向前扑 —— 和没有弹道信息时的默认姿势一致
        fallAxis.set(-localZ / localLength, 0, localX / localLength);
        yawQuat.setFromAxisAngle(UP, actor.yaw);
        fallQuat.setFromAxisAngle(fallAxis, -FALL_ANGLE * deathPhase);
        group.quaternion.copy(yawQuat).multiply(fallQuat);

        // 落地那一下的余震：sin 曲线在 phase=0.5 时最高、phase=1 时归零
        group.position.y = actor.pos.y + Math.sin(deathPhase * Math.PI) * FALL_BOUNCE;
      }
      wasAlive = false;
      return;
    }

    // 复活：把倒地状态、透明度全部清掉
    if (!wasAlive) {
      wasAlive = true;
      deathPhase = 0;
      impulseSet = false;
      fireTimer = 0;
      recoil = 0;
      hitTimer = 0;
      hitHead = false;
      applyOpacity(1);
      group.visible = true;
    }

    group.rotation.set(0, actor.yaw, 0);

    const speed = Math.hypot(actor.vel.x, actor.vel.z);
    const speedFactor = Math.min(1, speed / 3.5);

    // ---- 后座：枪身后顶 + 枪口上跳，指数衰减 ----
    if (fireTimer > 0) fireTimer -= dt;
    recoil = Math.max(0, recoil - dt * 6);
    gun.position.z = GUN_Z + recoil * 0.05;
    gun.rotation.x = recoil * 0.07;

    // ---- 走路相位 + 起伏 ----
    animPhase += dt * (1 + speed * 0.45);
    const swing = Math.sin(animPhase * 7) * 0.6 * speedFactor;
    const bob = Math.abs(Math.sin(animPhase * 7)) * 0.04 * speedFactor;
    // 站立呼吸：极小幅度的起伏，站住时不是一尊雕像
    const breath = (1 - speedFactor) * Math.sin(animPhase * 1.6) * 0.008;

    body.position.y = bob + breath;
    // ---- 受击顿挫 ----
    // 身体被打得往后一顿（正的 x 旋转是前倾，所以受击要往下减），
    // 头再往前点一下 —— 「头被子弹带得往前一甩」是最容易被认出来的受击信号。
    // 曲线用平方：命中那一帧直接到位、尾段快速收回，不会拖成慢动作
    if (hitTimer > 0) hitTimer -= dt;
    if (hitTimer <= 0) hitHead = false;
    const flinch = hitTimer > 0 ? (hitTimer / HIT_HOLD) ** 2 : 0;
    body.rotation.x = 0.07 * speedFactor - flinch * (hitHead ? 0.3 : 0.16);
    head.rotation.x = -flinch * (hitHead ? 0.55 : 0.2);

    // ---- 腿：摆腿 + 屈膝（摆到前面的那条腿膝盖弯） ----
    legL.hip.rotation.x = swing;
    legR.hip.rotation.x = -swing;
    legL.knee.rotation.x = -Math.max(0, swing) * 1.15;
    legR.knee.rotation.x = -Math.max(0, -swing) * 1.15;

    // ---- 手臂：持枪姿势上叠一点随步伐的摆动，像端着枪在走 ----
    // 基础角和上面 `armX.shoulder.rotation.set()` 保持一致；z（内收）不动
    armL.shoulder.rotation.x = 0.9 + swing * 0.08;
    armR.shoulder.rotation.x = 0.3 - swing * 0.08 - flinch * 0.22;
  };

  return {
    group,
    sync,
    setDeathImpulse,
    setOpacity,
    playFire,
    playHit,
    dispose(): void {
      group.traverse((child) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
      });
      materials.cloth.dispose();
      materials.clothDark.dispose();
      materials.vest.dispose();
      materials.gear.dispose();
      materials.skin.dispose();
      materials.gun.dispose();
      materials.trim.dispose();
    },
  };
}
