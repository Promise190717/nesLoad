import * as THREE from 'three';
import type { Actor, Team } from './types';

/**
 * 把 `Actor` 的数据翻译成一个看得见的模型 —— **只管渲染，不懂 AI**。
 *
 * 拆出来的理由：`bot.ts` 里一旦混进 Mesh 和材质，就会出现「AI 逻辑依赖渲染
 * 顺序」「Bot 不生成模型就不更新」这类耦合。现在引擎每帧只做一件事：
 * `for (bot of bots) view.sync(bot, dt)`。
 *
 * 模型还是纯几何体拼的（Box 拼人形），没有 glTF —— 和场景、枪模保持同一套
 * 「零外部资源」的规矩。
 *
 * ## 两套造型：真人 / 人机
 *
 * 联机之后场上同时有真人和人机，**光靠头顶文字分不出来**（文字在 30 米外根本
 * 看不见），所以两套造型在**轮廓**上就不同：
 *
 *   真人  战术头盔 + 前檐 + 护目镜条 + 肩甲 + 背包 + 胸前弹匣袋 + 大腿枪套
 *   人机  金属头（没有脸）+ 单眼传感器 + 天线 + 背部电池盒，没有背包和肩甲
 *
 * 关键约束：**区分不能和阵营识别打架**。所以两套造型的**布料颜色完全一样**
 * （阵营色仍是第一眼信息），差别只落在「加了几块装备」和「头是肉还是铁」上；
 * 护目镜 / 传感器的自发光也刻意选了中性色（真人是冷白、人机是琥珀），
 * 不占用蓝 / 红这两个阵营色。
 *
 * ## 尸体
 *
 * Bot 死了不能原地消失。这里管三件事：
 *
 *   ① 倒地方向跟着弹道走（`setDeathImpulse`）—— 从正面打中的人应该往后仰，
 *      而不是所有尸体都用同一个姿势扑倒；
 *   ② 倒地过程有「弹一下」的余震，不是匀速转到 90°；
 *   ③ 最后一段淡出（`setOpacity`），尸体保留几秒后慢慢消失，不是被谁按了删除键。
 */

/** 造型：真人（战术装备）还是人机（机械造型）。**由 `Actor.isHuman` 决定**。 */
export type ActorKind = 'human' | 'bot';

export interface ActorView {
  readonly group: THREE.Group;
  /** 每帧调用。位置、朝向、走路摆臂、倒地动画都在这里。 */
  sync(actor: Actor, dt: number): void;
  /**
   * 被击杀的瞬间调用。`dx / dz` 是**弹道的水平方向**（从击杀者指向死者），
   * 尸体沿它倒下去 —— 所以正面中弹会往后仰，背后中弹会往前扑。
   * 传 (0, 0) 或长度过短时退回「往前扑」。
   */
  setDeathImpulse(dx: number, dz: number): void;
  /** 尸体透明度 1 → 0。活着的时候会被 `sync` 自动重置回 1。 */
  setOpacity(value: number): void;
  /** 只释放几何体。材质是每个视图自己克隆的一份，也要在这里释放。 */
  dispose(): void;
}

interface TeamMaterials {
  cloth: THREE.MeshStandardMaterial;
  clothDark: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  gear: THREE.MeshStandardMaterial;
  gun: THREE.MeshStandardMaterial;
  /** 护目镜 / 传感器 / 天线这类「小面积高光」。自发光，远处也能看出一点亮 */
  trim: THREE.MeshStandardMaterial;
}

/**
 * 材质模板按「阵营 + 造型」缓存。
 *
 * 缓存的是**模板**，每个视图再从它 `clone()` 一份 —— 因为尸体要淡出，而
 * `opacity` 是材质级的状态，共享一份会让一个 Bot 淡出时全场一起变透明。
 * 克隆出来的材质参数完全相同，three 的 program cache 会把它们合并到同一个
 * shader 程序上，所以并不存在「多一份材质就多编译一次」的问题。
 */
const teamMaterials = new Map<string, TeamMaterials>();

function materialsFor(team: Team, kind: ActorKind): TeamMaterials {
  const key = `${team}:${kind}`;
  const cached = teamMaterials.get(key);
  if (cached) return cached;

  const materials: TeamMaterials = {
    // 保卫者冷色（蓝灰）、潜伏者暖色（红棕）—— 不看头顶也能一眼分敌我。
    // ⚠️ 这一段**两套造型共用**，别为了区分真人去改它（阵营识别优先）
    cloth: new THREE.MeshStandardMaterial({
      color: team === 0 ? 0x33546e : 0x6e3a2f,
      roughness: 0.88,
      metalness: 0.05,
    }),
    clothDark: new THREE.MeshStandardMaterial({
      color: team === 0 ? 0x22384a : 0x4a251d,
      roughness: 0.9,
      metalness: 0.05,
    }),
    skin: new THREE.MeshStandardMaterial({ color: 0x9c7a5e, roughness: 0.9 }),
    gear: new THREE.MeshStandardMaterial({ color: 0x2a2f34, roughness: 0.7, metalness: 0.3 }),
    // 枪身金属度可以高一点：它小、离得远，黑一点也不显眼
    gun: new THREE.MeshStandardMaterial({ color: 0x1c1f23, roughness: 0.5, metalness: 0.7 }),
    // 真人冷白（像夜视镜片）、人机琥珀（像机械传感器）—— 两者都不占阵营色
    trim:
      kind === 'human'
        ? new THREE.MeshStandardMaterial({
            color: 0xc9d8e4,
            emissive: 0x8fb6d6,
            emissiveIntensity: 0.55,
            roughness: 0.35,
            metalness: 0.2,
          })
        : new THREE.MeshStandardMaterial({
            color: 0xffa245,
            emissive: 0xff7a18,
            emissiveIntensity: 0.9,
            roughness: 0.4,
            metalness: 0.1,
          }),
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
    skin: clone(base.skin),
    gear: clone(base.gear),
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

const UP = new THREE.Vector3(0, 1, 0);
const yawQuat = new THREE.Quaternion();
const fallQuat = new THREE.Quaternion();
const fallAxis = new THREE.Vector3();

export function createActorView(team: Team, kind: ActorKind = 'bot'): ActorView {
  const materials = cloneMaterials(materialsFor(team, kind));
  const group = new THREE.Group();

  const part = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  // ---- 腿：放进 pivot，绕髋关节转 ----
  const makeLeg = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.13, 0.86, 0);
    pivot.add(part(0.17, 0.86, 0.2, 0, -0.43, 0, materials.clothDark));
    pivot.add(part(0.18, 0.12, 0.26, 0, -0.86, -0.03, materials.gear));
    group.add(pivot);
    return pivot;
  };
  const legLeft = makeLeg(-1);
  const legRight = makeLeg(1);

  // ---- 躯干 / 背心 / 腰带 ----
  group.add(part(0.46, 0.6, 0.26, 0, 1.16, 0, materials.cloth));
  group.add(part(0.5, 0.44, 0.32, 0, 1.2, 0, materials.gear));
  group.add(part(0.48, 0.1, 0.28, 0, 0.88, 0, materials.clothDark));

  if (kind === 'human') {
    /* ================= 真人：战术装备 ================= */

    // 头 + 战术头盔（比人机那顶大一圈，侧面轮廓更「方」）
    group.add(part(0.21, 0.23, 0.22, 0, 1.6, 0, materials.skin));
    group.add(part(0.29, 0.17, 0.31, 0, 1.71, -0.01, materials.gear));
    // 前檐：往外斜出去一小块 —— 远看就是「戴着头盔」而不是「顶着一块砖」
    const brim = part(0.27, 0.045, 0.09, 0, 1.65, -0.16, materials.gear);
    brim.rotation.x = -0.22;
    group.add(brim);
    // 护目镜条：横在脸上的一条冷白自发光。这是近距离最直接的「这是真人」信号
    group.add(part(0.2, 0.055, 0.02, 0, 1.6, -0.115, materials.trim));

    // 肩甲：两侧各一块，把肩膀垫宽 —— 剪影和瘦削的人机明显不同
    group.add(part(0.13, 0.1, 0.2, -0.28, 1.42, 0, materials.gear));
    group.add(part(0.13, 0.1, 0.2, 0.28, 1.42, 0, materials.gear));

    // 胸前弹匣袋：两块小方块，贴在护甲正面
    group.add(part(0.12, 0.1, 0.04, -0.1, 1.22, -0.17, materials.clothDark));
    group.add(part(0.12, 0.1, 0.04, 0.1, 1.22, -0.17, materials.clothDark));

    // 背包：身后一块厚实的方块。**这是最远距离都能看出来的差异**
    group.add(part(0.34, 0.4, 0.16, 0, 1.22, 0.24, materials.clothDark));
    group.add(part(0.3, 0.07, 0.17, 0, 1.42, 0.245, materials.gear));

    // 大腿枪套：右腿外侧
    group.add(part(0.1, 0.2, 0.13, 0.22, 0.62, -0.02, materials.gear));
  } else {
    /* ================= 人机：机械造型 ================= */

    // 头：**没有皮肤**，直接一块金属。脸的位置是黑色面板
    group.add(part(0.23, 0.25, 0.24, 0, 1.6, 0, materials.gear));
    group.add(part(0.19, 0.12, 0.02, 0, 1.6, -0.125, materials.clothDark));
    // 单眼传感器：琥珀色自发光，比真人的护目镜条更小更圆（一块方块）
    group.add(part(0.06, 0.06, 0.03, 0, 1.61, -0.135, materials.trim));
    // 头盔：扁一些，没有前檐
    group.add(part(0.26, 0.11, 0.27, 0, 1.71, 0, materials.gear));
    // 天线：从右后脑斜出去一根细杆
    const antenna = part(0.018, 0.3, 0.018, 0.1, 1.86, 0.07, materials.trim);
    antenna.rotation.z = -0.18;
    group.add(antenna);

    // 背部电池盒：比真人的背包小得多，位置更靠上
    group.add(part(0.22, 0.16, 0.1, 0, 1.36, 0.19, materials.gear));
    // 胸口一条散热槽
    group.add(part(0.26, 0.03, 0.02, 0, 1.1, -0.17, materials.clothDark));
  }

  // ---- 手臂 ----
  const makeArm = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.3, 1.4, 0);
    pivot.add(part(0.13, 0.52, 0.15, 0, -0.24, 0, materials.cloth));
    group.add(pivot);
    return pivot;
  };
  const armLeft = makeArm(-1);
  makeArm(1);

  // ---- 端在身前的枪 ----
  const gun = new THREE.Group();
  gun.position.set(0.1, 1.22, -0.3);
  gun.add(part(0.07, 0.1, 0.52, 0, 0, 0, materials.gun));
  gun.add(part(0.035, 0.035, 0.34, 0, 0.02, -0.42, materials.gun));
  gun.add(part(0.05, 0.16, 0.08, 0, -0.12, 0.02, materials.gun));
  group.add(gun);

  group.visible = false;

  let animPhase = 0;
  let deathPhase = 0;
  let wasAlive = true;
  let opacity = 1;

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
    materials.skin.opacity = next;
    materials.gear.opacity = next;
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

  const sync = (actor: Actor, dt: number): void => {
    group.position.set(actor.pos.x, actor.pos.y, actor.pos.z);

    if (!actor.alive) {
      // 倒地：绕「与弹道垂直的水平轴」旋转，所以往哪边倒跟着中弹方向走
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
      applyOpacity(1);
      group.visible = true;
    }

    group.rotation.set(0, actor.yaw, 0);

    const speed = Math.hypot(actor.vel.x, actor.vel.z);
    animPhase += dt * (1 + speed * 0.45);

    // 摆幅随速度增大，站住时腿是直的
    const swing = Math.sin(animPhase * 7) * 0.55 * Math.min(1, speed / 3.5);
    legLeft.rotation.x = swing;
    legRight.rotation.x = -swing;
    armLeft.rotation.x = -swing * 0.6;
  };

  return {
    group,
    sync,
    setDeathImpulse,
    setOpacity,
    dispose(): void {
      group.traverse((child) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
      });
      materials.cloth.dispose();
      materials.clothDark.dispose();
      materials.skin.dispose();
      materials.gear.dispose();
      materials.gun.dispose();
      materials.trim.dispose();
    },
  };
}
