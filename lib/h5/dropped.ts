import * as THREE from 'three';
import { type Point3, rand } from './math';
import type { WeaponId } from './types';
import { type ViewModel, buildWeaponModel, disposeWeaponModel, stripFirstPersonArms } from './weapons';

/**
 * 掉在地上的武器 —— 死亡瞬间从手里脱手的那一把。
 *
 * ## 为什么不做刚体
 *
 * 需求里写得很清楚：「简单物理：自由落体 + 碰到地面弹跳一次」。上一版整个工程
 * 就没有物理引擎（`physics.ts` 是手写的 AABB + 台阶），为了几把掉在地上的枪
 * 引入 cannon-es 不划算。这里只要三件事：重力、一次弹跳、躺平。
 *
 * ## 为什么每次新建模型而不是池化
 *
 * 弹壳能池化是因为「一秒钟抛十个、外观完全一样」。武器不一样：同一把枪可能
 * 同时掉两把在地上，而 `THREE.Object3D` 不能出现在两个位置。死亡是低频事件
 * （一局几十次），每次 `buildWeaponModel` 建十来个 BoxGeometry、十几秒后
 * 连几何体一起释放，代价可以接受，换来的是代码里没有任何「取一个空槽」的分支。
 *
 * 材质是共享的（`weapons.ts` 里那份），所以**不会**因为掉落而触发 shader 重编译。
 */

/** 掉落物在地上躺多久（秒）。够玩家看完自己那把枪，又不至于堆一地。 */
const LIFE = 14;

const GRAVITY = 20;

/** 躺平时的离地高度。原点按包围盒居中（见 `recenter`），半个枪身厚就够。 */
const REST_Y = 0.045;

interface Dropped {
  model: ViewModel;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  /** 地面高度（掉落物出生点脚下的甲板） */
  groundY: number;
  life: number;
  rest: boolean;
}

/**
 * 把模型内容挪到 group 原点（= 包围盒中心）。
 *
 * 🔴 必须做：外部枪模的原点在**眼睛**那一端 —— 资产是按第一人称机位导出的，
 * `applyFpFraming` 只把 `inner` 摆到位、原点一动不动。不居中的话枪身整个躺在
 * 落点前方 30~40cm，落地弹跳和「躺平」（绕 z 转 90°）都会绕着枪托外侧那一点转，
 * 看起来像枪自己在空中划圈。程序化刀 / 雷本来就居中，挪一次是零代价的幂等操作。
 */
function recenter(group: THREE.Group): void {
  group.updateMatrixWorld(true);
  const center = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
  for (const child of group.children) child.position.sub(center);
  group.updateMatrixWorld(true);
}

export class DroppedWeapons {
  private readonly scene: THREE.Scene;
  private readonly items: Dropped[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * 甩出一把枪。
   *
   * `dirX / dirZ` 是水平甩出的方向（不必归一化）：玩家死亡时用视线方向，
   * Bot 死亡时用「被打飞」的方向 —— 枪跟着人一起往那边飞才像脱手。
   */
  spawn(weapon: WeaponId, origin: Point3, dirX: number, dirZ: number, groundY: number): void {
    const length = Math.hypot(dirX, dirZ);
    const nx = length > 0.01 ? dirX / length : 0;
    const nz = length > 0.01 ? dirZ / length : -1;
    // 侧向量：和甩出方向垂直，让落点不总在一条直线上
    const rx = -nz;
    const rz = nx;

    const model = buildWeaponModel(weapon);
    // 地上的枪不能长手：外部枪模自带第一人称手臂（蒙皮网格），摘掉
    stripFirstPersonArms(model);
    recenter(model.group);
    const pos = new THREE.Vector3(origin.x, origin.y, origin.z);
    model.group.position.copy(pos);
    // 枪模朝 -z：想让它朝 (nx, nz)，yaw 就是 atan2(-nx, -nz)
    model.group.rotation.set(0, Math.atan2(-nx, -nz), 0);
    this.scene.add(model.group);

    this.items.push({
      model,
      pos,
      vel: new THREE.Vector3(
        nx * rand(1.0, 1.8) + rx * rand(-0.5, 0.5),
        rand(1.1, 1.9),
        nz * rand(1.0, 1.8) + rz * rand(-0.5, 0.5),
      ),
      spin: new THREE.Vector3(rand(-7, 7), rand(-3, 3), rand(-7, 7)),
      groundY,
      life: LIFE,
      rest: false,
    });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const item = this.items[i]!;
      item.life -= dt;
      if (item.life <= 0) {
        this.remove(i);
        continue;
      }
      if (item.rest) continue;

      item.vel.y -= GRAVITY * dt;
      item.pos.x += item.vel.x * dt;
      item.pos.y += item.vel.y * dt;
      item.pos.z += item.vel.z * dt;

      const group = item.model.group;
      group.position.copy(item.pos);
      group.rotation.x += item.spin.x * dt;
      group.rotation.y += item.spin.y * dt;
      group.rotation.z += item.spin.z * dt;

      const restY = item.groundY + REST_Y;
      if (item.pos.y > restY) continue;

      item.pos.y = restY;
      group.position.y = restY;

      if (Math.abs(item.vel.y) > 1.6) {
        // 弹一次：竖直速度反转并吃掉七成能量，水平速度减半
        item.vel.y = -item.vel.y * 0.3;
        item.vel.x *= 0.5;
        item.vel.z *= 0.5;
        item.spin.multiplyScalar(0.35);
      } else {
        item.rest = true;
        item.vel.set(0, 0, 0);
        // 躺平：绕 z 轴倒 90°，枪管保持水平（绕 x 倒的话枪口会朝天）
        group.rotation.set(0, group.rotation.y, Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1));
      }
    }
  }

  private remove(index: number): void {
    const item = this.items[index]!;
    this.scene.remove(item.model.group);
    disposeWeaponModel(item.model);
    this.items.splice(index, 1);
  }

  dispose(): void {
    for (const item of this.items) {
      this.scene.remove(item.model.group);
      disposeWeaponModel(item.model);
    }
    this.items.length = 0;
  }
}
