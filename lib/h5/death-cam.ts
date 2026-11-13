import * as THREE from 'three';
import { clamp, easeInOutCubic, easeOutCubic, lerp, rand } from './math';
import type { Actor, DeathPhase } from './types';

/**
 * 死亡相机 —— 玩家死后接管相机，**替代原来那块全屏遮罩**。
 *
 * ## 为什么要单独一个控制器
 *
 * 原来玩家一死，`Player.update()` 直接早退，相机就冻在死亡瞬间那个位姿上，
 * 然后 UI 盖一层半透明黑块 + 倒计时。看起来像「游戏卡住了，弹了个框」。
 *
 * 现在相机在死后继续演：先跌到甲板上（这一段是「重量感」的全部来源），
 * 贴地凝视两秒，再升起来切到击杀者的第三人称。整个过程画面一直在渲染，
 * 玩家看到的是**自己倒下**，而不是一块遮罩。
 *
 * ## 时间轴
 *
 *   0.00 ~ 0.08  hit-stop（引擎那层把 dt 乘 0.6，不在这里做）
 *   0.15 ~ 1.15  倒地：眼高 1.6m → 0.26m，roll 60°~90°，easeOut
 *   1.15 ~ 2.10  凝视：贴地静止，只有极缓慢的呼吸漂移
 *   2.10 ~ 2.80  升起并切到击杀者第三人称（观战）
 *   3.50         底部倒计时条出现（UI 侧按 `respawnIn` 判）
 *   6.50         重生，镜头**当帧直接**切回第一人称
 *
 * ## 重生为什么没有过渡（2026-11-13）
 *
 * 这里原来有一段 0.45s 的插值：镜头从观战位姿滑回第一人称。问题出在起点 ——
 * 观战位在**击杀者身后**，插值途中画面会把交火区、敌人的位置和朝向一路拖过去，
 * 等于每次复活白送半秒透视。用户原话「不然知道敌人位置在哪」，直接砍掉：
 * `end()` 把相机交还引擎，下一帧就是新出生点的第一人称。
 *
 * ## 位姿怎么表示
 *
 * 全程用四元数而不是欧拉角：倒地要 roll、观战要 lookAt，两套坐标系混在
 * 三个欧拉角里一定会出现「插值途中画面绕圈」。四元数 slerp 没有这个问题。
 */

/* ============================================================
   时间轴
   ============================================================ */

export const DEATH_TIMELINE = {
  /** 致死一击之后的慢放时长（秒） */
  hitStop: 0.08,
  /** 慢放期间的时间倍率 */
  hitStopScale: 0.6,

  /** 倒地动画：从站立眼高跌到贴地 */
  fallStart: 0.15,
  fallEnd: 1.15,

  /** 死亡凝视结束（观战从这里开始混入） */
  gazeEnd: 2.1,
  /** 升起并切到击杀者视角的过渡时长 */
  spectateBlend: 0.7,

  /** 重生瞬间（= 死亡总时长） */
  respawnAt: 6.5,
} as const;

/** 倒地后眼睛离地多高。再低就会穿进甲板，再高就不像躺着。 */
const GROUND_EYE = 0.26;

/** 倒下时身体往外滑的距离（米）。**不是装饰** —— 少了这一下就没有重量。 */
const FALL_SLIDE = 0.8;

/** 躺下后 roll 的目标角度（弧度）：60° ~ 90°，方向随机。 */
const ROLL_MIN = 1.05;
const ROLL_MAX = 1.57;

/** 观战相机相对击杀者的偏移：身后 3.1 米、头顶 1.95 米。 */
const SPECTATE_BACK = 3.1;
const SPECTATE_UP = 1.95;

export function deathPhaseAt(t: number): DeathPhase {
  if (t < DEATH_TIMELINE.fallEnd) return 'dying';
  if (t < DEATH_TIMELINE.gazeEnd) return 'gaze';
  if (t < DEATH_TIMELINE.respawnAt) return 'spectate';
  return 'respawn';
}

/* ============================================================
   临时对象（模块级复用，避免每帧分配）
   ============================================================ */

const UP = new THREE.Vector3(0, 1, 0);
const lookMatrix = new THREE.Matrix4();
const lookTarget = new THREE.Vector3();
const eyePoint = new THREE.Vector3();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const desiredQuat = new THREE.Quaternion();

/** 用 YXZ 序的欧拉角拼一个四元数。相机 `rotation.order` 就是 YXZ，两边必须一致。 */
function quatFromAngles(out: THREE.Quaternion, pitch: number, yaw: number, roll: number): void {
  euler.set(pitch, yaw, roll, 'YXZ');
  out.setFromEuler(euler);
}

/* ============================================================
   控制器
   ============================================================ */

export class DeathCamera {
  /** 相机这一帧要不要交给死亡相机。`end()` / `reset()` 之后为 false。 */
  private active = false;
  private spectateReady = false;

  /** 死亡后累计的秒数 */
  private t = 0;

  /* ---- 死亡瞬间的快照 ---- */
  private readonly origin = new THREE.Vector3();
  private eyeY = 0;
  private yaw = 0;
  private pitch = 0;
  /** 倒下的水平方向（单位向量）：沿弹道走，也就是「被打飞」的方向 */
  private fallX = 0;
  private fallZ = 1;
  private yawDrift = 0;
  private rollMax = ROLL_MAX;
  private killer: Actor | null = null;

  /* ---- 各种位姿 ---- */
  private readonly lyingPos = new THREE.Vector3();
  private readonly lyingQuat = new THREE.Quaternion();
  private readonly spectatePos = new THREE.Vector3();
  private readonly spectateQuat = new THREE.Quaternion();

  /** 引擎每帧问它：现在是不是该由我接管相机。 */
  get busy(): boolean {
    return this.active;
  }

  /**
   * 开始一次死亡。
   *
   * `killer` 只用来算倒地方向和观战目标 —— 它可能在中途复活、传送甚至再死一次，
   * 所以每一帧都要重新读它的 `pos / yaw / alive`，不能缓存坐标。
   */
  begin(pos: { x: number; y: number; z: number }, yaw: number, pitch: number, eyeY: number, killer: Actor | null): void {
    this.active = true;
    this.spectateReady = false;
    this.t = 0;

    this.origin.set(pos.x, pos.y, pos.z);
    this.yaw = yaw;
    this.pitch = pitch;
    this.eyeY = eyeY;
    this.killer = killer;

    // 倒地方向 = 从击杀者指向自己。没有击杀者（摔死 / 自爆）就随便挑一个，
    // 否则尸体会「站着倒」—— 那种垂直下落看着像 bug
    let fx = 0;
    let fz = 0;
    if (killer) {
      fx = pos.x - killer.pos.x;
      fz = pos.z - killer.pos.z;
    }
    const length = Math.hypot(fx, fz);
    if (length > 0.05) {
      this.fallX = fx / length;
      this.fallZ = fz / length;
    } else {
      const angle = rand(0, Math.PI * 2);
      this.fallX = Math.cos(angle);
      this.fallZ = Math.sin(angle);
    }

    // roll 的方向随机（往左躺还是往右躺），角度 60°~90°
    this.rollMax = rand(ROLL_MIN, ROLL_MAX) * (Math.random() < 0.5 ? -1 : 1);
    // 倒下时视角会跟着身体偏一点，纯 roll 看起来像镜头歪了而不是人倒了
    this.yawDrift = rand(-0.35, 0.35);
  }

  /**
   * 重生：**当帧交还相机**，不做任何过渡。
   *
   * 不做插值的原因是「过渡会漏位置」：起点是击杀者身后的观战位，途中会把
   * 整个交火区拖进画面。所以这里只把 `active` 关掉，下一帧 `update()` 返回
   * false，引擎直接按新出生点的第一人称写相机。
   */
  end(): void {
    this.active = false;
  }

  /** 重开一局 / 退出对局时清干净。 */
  reset(): void {
    this.active = false;
    this.spectateReady = false;
    this.t = 0;
    this.killer = null;
  }

  /**
   * 每帧调用。返回 `true` 表示这一帧相机已经由死亡相机写好，引擎不要覆盖。
   */
  update(dt: number, camera: THREE.PerspectiveCamera): boolean {
    if (!this.active) return false;

    this.t += dt;

    // 观战目标每帧都要重算：击杀者在跑、在转身，甚至可能已经死了
    this.trackSpectate(dt);
    this.computeLyingPose();

    if (this.t < DEATH_TIMELINE.gazeEnd) {
      camera.position.copy(this.lyingPos);
      camera.quaternion.copy(this.lyingQuat);
      return true;
    }

    const blend = clamp((this.t - DEATH_TIMELINE.gazeEnd) / DEATH_TIMELINE.spectateBlend, 0, 1);
    const e = easeInOutCubic(blend);

    camera.position.set(
      lerp(this.lyingPos.x, this.spectatePos.x, e),
      lerp(this.lyingPos.y, this.spectatePos.y, e),
      lerp(this.lyingPos.z, this.spectatePos.z, e),
    );
    camera.quaternion.copy(this.lyingQuat).slerp(this.spectateQuat, e);
    return true;
  }

  /* ============================================================
     内部
     ============================================================ */

  /**
   * 倒地 / 贴地位姿。
   *
   * 下落用 `easeOutCubic`：一开始掉得快、最后几厘米慢慢停住。线性插值会让
   * 1.6 米的下落像电梯，这是「有没有重量感」的分水岭。
   */
  private computeLyingPose(): void {
    const fall = clamp(
      (this.t - DEATH_TIMELINE.fallStart) / (DEATH_TIMELINE.fallEnd - DEATH_TIMELINE.fallStart),
      0,
      1,
    );
    const e = easeOutCubic(fall);
    // 落地之后开始「呼吸」：完全静止的镜头看起来像死机
    const settle = Math.max(0, this.t - DEATH_TIMELINE.fallEnd);

    this.lyingPos.set(
      this.origin.x + this.fallX * FALL_SLIDE * e,
      lerp(this.eyeY, this.origin.y + GROUND_EYE, e) + Math.sin(settle * 1.6) * 0.005,
      this.origin.z + this.fallZ * FALL_SLIDE * e,
    );

    const roll = this.rollMax * e;
    const pitch = lerp(this.pitch, this.pitch * 0.25 - 0.14, e) + Math.sin(settle * 0.9) * 0.01;
    const yaw = this.yaw + this.yawDrift * e + Math.sin(settle * 0.55) * 0.015;
    quatFromAngles(this.lyingQuat, pitch, yaw, roll);
  }

  /**
   * 观战位姿：镜头在击杀者身后上方，看向击杀者前方的地面。
   *
   * 用指数逼近而不是直接赋值 —— 击杀者复活 / 被传送时位置会瞬变，直接赋值
   * 就是一次硬切；逼近之后镜头是「滑过去」的。
   */
  private trackSpectate(dt: number): void {
    const killer = this.killer;

    if (killer && killer.alive) {
      // 击杀者的「身后」= 前向的反方向。前向是 (-sin yaw, 0, -cos yaw)
      const bx = Math.sin(killer.yaw);
      const bz = Math.cos(killer.yaw);
      eyePoint.set(killer.pos.x + bx * SPECTATE_BACK, killer.pos.y + SPECTATE_UP, killer.pos.z + bz * SPECTATE_BACK);
      lookTarget.set(killer.pos.x - bx * 1.5, killer.pos.y + 1.3, killer.pos.z - bz * 1.5);
    } else {
      // 没有凶手，或者凶手也躺下了：绕着自己的尸体缓慢环绕
      const angle = this.t * 0.32 + 1.1;
      eyePoint.set(this.origin.x + Math.cos(angle) * 3.2, this.origin.y + 2.1, this.origin.z + Math.sin(angle) * 3.2);
      lookTarget.set(this.origin.x, this.origin.y + 0.3, this.origin.z);
    }

    // `Matrix4.lookAt(eye, target, up)` 得到的旋转矩阵，-z 轴指向 target ——
    // 正好就是相机的朝向，可以直接拆成四元数
    lookMatrix.lookAt(eyePoint, lookTarget, UP);
    desiredQuat.setFromRotationMatrix(lookMatrix);

    if (!this.spectateReady) {
      this.spectateReady = true;
      this.spectatePos.copy(eyePoint);
      this.spectateQuat.copy(desiredQuat);
      return;
    }

    const k = 1 - Math.exp(-4.5 * dt);
    this.spectatePos.lerp(eyePoint, k);
    this.spectateQuat.slerp(desiredQuat, k);
  }
}
