import * as THREE from 'three';
import { gameAudio } from './audio';
import { TAU, clamp, damp, easeInCubic, easeInOutCubic, easeOutBack, easeOutCubic, rand } from './math';
import type { MeleePose } from './player';
import type { WeaponId } from './types';
import {
  SWITCH_PROFILES,
  type SwitchFlourish,
  type SwitchProfile,
  type ViewModel,
  buildFirstPersonArms,
  buildWeaponModel,
  disposeWeaponModel,
  hasGlbTemplate,
  preloadWeaponGlbs,
  setFirstPersonSleeveTeam,
} from './weapons';

/**
 * 第一人称枪模层 —— **独立的 scene 和 camera**，主场景渲染完之后清一次深度再画。
 *
 * ## 为什么要两个场景
 *
 * 枪离相机只有半米。如果它和世界在同一个场景里，贴墙站着时枪管会插进墙里
 * （枪比墙更近，深度测试判它可见），表现为「枪穿墙」。标准做法就是单独渲染
 * 一层：`renderer.clearDepth()` 之后枪永远画在最前面。
 *
 * ## 光也要单独给
 *
 * 主场景的太阳和天光对这把枪没意义（枪不在那个坐标系里），所以这一层自己
 * 放一盏半球光 + 一盏方向光，让枪面有明确的明暗交界 —— 低模枪靠明暗才看得出
 * 体积，全平光会糊成一块灰。
 *
 * ## 动作表（改手感看这里）
 *
 *   开火  → 向后 5.5cm + 上翘 1.7cm + 微抬头 2°  （`kick` / `kickRotation`，幅度与回位
 *            速度按武器 `WeaponSpec.feel.kick` 缩放：AWM 2.0 最重、USP 0.6 最轻）
 *            🔴 抬头**必须很小**：视角后坐已经由 `Player.recoilPitch` 负责了，枪模再抬
 *            一大截就是「枪口朝上」，2026-11-13 用户明确否掉过（0.14 → 0.03）
 *   换弹  → 下沉 14cm + 前倾 49°  （`reloadArc`）
 *   走路  → 12mm 横摆 + 10mm 上下（`bobAmount`）
 *   开镜  → 退到画面正下方并隐藏
 *   切枪  → 收起（右下出画）→ 掏出（从下方升起 + 过冲回弹）→ 就绪
 *   刺刀  → `melee.swing` 驱动的「蓄力 → 直刺 → 收刀」三阶段（见 `applyMelee`）
 *
 * ## 为什么全是「程序化动画」而不是骨骼动画
 *
 * 枪模是一个 `THREE.Group`，所有动作都是对它的 `position` / `rotation` 做
 * tween。没有骨骼、没有动画文件 —— 加一把武器只需要在 `SWITCH_PROFILES`
 * 里配一行参数，不用再导一套动画。
 */

/** 枪模相机的 FOV。比主相机窄，枪看起来更「近」。 */
const VIEW_FOV = 50;

/** 军刀待机时转一次刀用多久（秒）。 */
const KNIFE_SPIN_TIME = 1.05;

interface BasePose {
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
}

/**
 * 每把武器自己的基准位姿。
 *
 * 旋转角**不再是全零**：真实持枪时枪托抵在肩上、手往身体中线带，枪口轴线
 * 会微微收向准星（rotY）、枪身带一点侧倾（rotZ）、枪口比视线低一丝（rotX）。
 * 三个角全零的枪模看起来像一块悬浮在相机前的展品，而不是「有人拿着」。
 * 幅度都压在 5° 以内，不会让枪口火光偏离准星太远（火光位置投影的是真实
 * muzzle 节点，跟着姿态走，弹道仍由主相机决定，互不影响）。
 *
 * 2026-11-13 y 普遍抬高（步枪 −0.16 → −0.105）：装上第一人称手臂后按用户给的
 * CS:GO 参考图，右手扣握把的手背要露出画面下沿 —— 原高度整只手都在画外。
 * 只动 y/x 平移不影响准星对齐（火光投影真实 muzzle 节点，弹道仍由主相机决定）。
 *
 * **军刀是唯一的例外** —— 刺击握法（见 `weapons.ts` 的 `knife` 分支）。
 */
const RIFLE_POSE: BasePose = { x: 0.15, y: -0.105, z: -0.55, rotX: -0.012, rotY: 0.055, rotZ: 0.06 };
/** AWM 更沉：端得更低、侧倾略大，和它「重」的开火手感对齐 */
const SNIPER_POSE: BasePose = { x: 0.16, y: -0.12, z: -0.56, rotX: -0.02, rotY: 0.05, rotZ: 0.075 };
/** 手枪单手持：更靠近视线中线，姿态比步枪收敛 */
const PISTOL_POSE: BasePose = { x: 0.12, y: -0.115, z: -0.5, rotX: -0.008, rotY: 0.045, rotZ: 0.04 };
const GRENADE_POSE: BasePose = { x: 0.17, y: -0.15, z: -0.5, rotX: 0, rotY: 0.05, rotZ: 0 };

const BASE_POSES: Record<WeaponId, BasePose> = {
  ak47: RIFLE_POSE,
  m4a1: RIFLE_POSE,
  awm: SNIPER_POSE,
  shotgun: RIFLE_POSE,
  usp: PISTOL_POSE,
  grenade: GRENADE_POSE,
  knife: { x: 0.3, y: -0.26, z: -0.82, rotX: 0, rotY: 0, rotZ: 0 },
};

export interface ViewModelParams {
  /** 水平速度（米/秒），决定晃动幅度 */
  speed: number;
  /** 走路相位（由玩家提供，保证脚和枪同步晃） */
  bobPhase: number;
  onGround: boolean;
  reloading: boolean;
  /** 0..1，换弹进度 */
  reloadProgress: number;
  /** 开镜时整把枪退到画面下方并隐藏 */
  scoped: boolean;
  /**
   * 本帧视角增量（弧度，与 `InputFrame.lookYaw / lookPitch` 同源同号）。
   * 枪是拿在手里的重物：转向时它会慢半拍追上来 —— 这个「滞后」就是
   * `swayYaw / swayPitch` 的来源。菜单 / 死亡冻结时传 0。
   */
  lookYaw: number;
  lookPitch: number;
  /** 拉栓进度 0..1。0 = 没在拉栓；只有带 `boltCycle` 的武器（AWM）会 > 0 */
  bolt: number;
  /**
   * 死亡倒地进度 0..1。枪会跟着镜头一起往下坠、翻转着滑出画面 ——
   * 需求的「武器脱手」在这里是**视觉上的第一拍**，真正掉在甲板上的那把
   * 由 `dropped.ts` 单独生成（枪模不能同时出现在两个坐标系里）。
   */
  dying: number;
  /** 近战挥砍状态。非近战武器时传玩家身上那个恒零的常量就行 */
  melee: MeleePose;
  /** 捏雷抬手进度 0..1（手里不是手雷时恒 0） */
  grenadeCook: number;
  /** 投掷动画进度 0..1。0 = 没在投掷 */
  grenadeThrow: number;
  /** 这次投掷是「快速扔雷」（G）—— 模型这一帧才出现，要补一段拔雷起手 */
  grenadeThrowQuick: boolean;
}

/** 切枪的三个阶段。 */
type SwitchPhase = 'ready' | 'holster' | 'draw';

/** 枪口世界坐标的复用向量（每帧最多查一次，不值得 new） */
const muzzleTmp = new THREE.Vector3();

/** `flourishAt` 的返回值：叠加在通用 tween 之上的偏移量。 */
interface FlourishOffset {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

const ZERO_OFFSET: FlourishOffset = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };

export class ViewModelLayer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  private model: ViewModel | null = null;
  /** 当前手里（或正在掏出）的是哪把 */
  private weapon: WeaponId | null = null;

  private kick = 0;
  private kickRotation = 0;
  /**
   * 后坐的**回位速度**（指数逼近系数）。按武器重量给：`triggerKick` 里由
   * `strength` 反推，重的枪回位更慢。
   *
   * 为什么不是固定值：位移幅度只决定「砸下去多深」，回位速度决定「砸完多久回来」。
   * 两者都跟着武器走，AWM 才会是「砸下去、慢慢抬回来」，M4 是「一抖就回」——
   * 只调幅度的话，所有枪看起来都像同一把枪换了震动强度。
   */
  private kickDamping = 15;
  private kickRotDamping = 12;
  /** 弹簧回位的速度状态（`advanceKick` 积分用）。单位：倍率/秒 */
  private kickVel = 0;
  private kickRotVel = 0;
  /**
   * 连发力度（0..1，由 `triggerKick` 的第二个参数写入）。
   *
   * 它做两件事：把后坐幅度按「这一梭子打到第几发」放大（最多 +45%），
   * 以及在枪身上叠一层左右抽动 —— 真实的自动武器连发时枪不是「一直往后退」，
   * 是被枪机往复推得在手里乱跳。这两个量都只影响第一人称模型。
   */
  private burstHeat = 0;

  /* ---- 切枪状态机 ---- */
  private phase: SwitchPhase = 'ready';
  private phaseTimer = 0;
  /** 收起演完之后要换成哪把 */
  private pending: WeaponId | null = null;
  private profile: SwitchProfile | null = null;
  /** 这次掏出要不要演全套小动作（AK / M4 的「检查弹匣」只在第一次） */
  private flourishFull = false;
  /** 已经掏出过一次的武器 */
  private readonly drawnOnce = new Set<WeaponId>();

  /* ---- 军刀待机 ---- */
  private idleTime = 0;
  private spinCooldown = rand(8, 12);
  /** >= 0 表示正在转刀（0..1 的进度），< 0 表示没在转 */
  private spinProgress = -1;

  /* ---- 视角摇晃（平滑后的视角角速度，rad/s） ---- */
  private swayYaw = 0;
  private swayPitch = 0;

  /**
   * 平滑后的捏雷抬手量。
   *
   * 玩家松手那一帧 `grenadeCook` 直接从 1 跳回 0（`cooking` 被清掉），照原值
   * 用会让手「啪」地掉回原位、紧接着又开始挥臂 —— 两次动作之间闪一帧。
   * 所以这里自己 damp 一遍，抬手和收回都是渐变的。
   */
  private cookView = 0;

  /** 袖子当前染的队色（-1 = 还没染过）；没换队就不写材质 */
  private sleeveTeam = -1;

  /**
   * 第一人称袖子跟随本机玩家的阵营（和第三人称队服同一个来源色）。
   *
   * 引擎每帧从 `updateViewModel` 调 —— 联机选阵营、重开一局、回单人，任何改队
   * 路径都会自然走到这里，不用挨个挂钩子。真正写材质只在队伍变化的那一帧。
   */
  setTeam(team: 0 | 1): void {
    if (team === this.sleeveTeam) return;
    this.sleeveTeam = team;
    setFirstPersonSleeveTeam(team);
  }

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(VIEW_FOV, aspect, 0.01, 8);

    // 枪模自己的光：一盏半球光打底，一盏方向光造明暗。
    // 半球光从 1.55 降到 1.1：环境贴图（engine 注入的 PMREM）已经补了一块
    // 漫反射，再给满会把枪身的明暗交界冲平 —— 低模枪靠明暗才看得出体积
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6a7076, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(0.6, 1.2, 0.9);
    this.scene.add(key);
    // 枪口方向的暖色补光：模拟手部区域的反射光。第一人称视角里枪身下半部
    // 原来只有冷灰的环境色，这一层暖光让握把和护木「有人拿着」的感觉
    const warm = new THREE.DirectionalLight(0xffd9a0, 0.4);
    warm.position.set(0.4, -0.6, 0.3);
    this.scene.add(warm);

    // 🔴 不给枪模场景加枪口点光（用户 2026-11-13 明确要求：开枪时枪身不要有
    // 反光效果）。曾经有一盏跟随 kick 的 PointLight 专门在开火瞬间照亮枪身，
    // 橙光打在金属件上就是一片高光 —— 已整盏删除。主场景的枪口光照不到这里
    // （独立 scene / 独立相机），所以开火时第一人称枪身保持常亮不变。

    // GLB 枪模后台预载（CC0 外部模型，见 weapons.ts 的 GLB 一节）。
    // 就绪前 buildWeaponModel 走程序化兜底，全部就绪后如果手里还是程序化模型
    // （开局就切枪、网络慢的极端情况），热替换一次 —— 换的时候玩家看到的仍是
    // 自己手里那把枪，姿态不变，只是模型变精细。
    // 失败的枪永久留在程序化路线上（loadGlbWeapon 不重试）。
    void preloadWeaponGlbs().then(() => {
      if (this.weapon && this.phase === 'ready' && hasGlbTemplate(this.weapon)) {
        this.swapModel(this.weapon);
      }
    });
  }

  /* ============================================================
     换武器
     ============================================================ */

  /**
   * **立刻**换武器，不走动画。
   *
   * 只给「没有旧武器可收」的时机用：开局、重生。平时换枪一律走 `beginSwitch`。
   */
  setWeapon(weapon: WeaponId): void {
    this.swapModel(weapon);
    this.phase = 'ready';
    this.phaseTimer = 0;
    this.pending = null;
    this.profile = null;
    this.spinProgress = -1;
  }

  /**
   * 开始切枪动画：收起旧武器 → 换模型 → 掏出新武器。
   *
   * **开火锁定不在这里** —— 那是 `player.ts` 的 `switchTimer` 管的，两边读的
   * 是同一张 `SWITCH_PROFILES`，所以「动画演完了」和「能开枪了」不会错拍。
   *
   * 切枪途中再按别的武器键会**重开**这段动画（不是排队）：玩家按 1 又立刻按 3，
   * 手里应该是 3，动画从当前姿态重新收起再掏出 3。
   */
  beginSwitch(weapon: WeaponId): void {
    if (!this.model) {
      this.setWeapon(weapon);
      return;
    }
    if (this.weapon === weapon && this.phase === 'ready') return;

    this.pending = weapon;
    this.profile = SWITCH_PROFILES[weapon];
    this.flourishFull = !this.drawnOnce.has(weapon);
    this.phase = 'holster';
    this.phaseTimer = 0;
    this.spinProgress = -1;
  }

  private swapModel(weapon: WeaponId): void {
    if (this.model) {
      this.scene.remove(this.model.group);
      disposeWeaponModel(this.model);
      this.model = null;
    }

    const pose = BASE_POSES[weapon];
    const model = buildWeaponModel(weapon);
    // 第一人称手臂（手套 + 小臂）：挂成 group 的子节点，枪的一切动画自动带动。
    // 掉在地上的枪（dropped.ts）不走这里，所以地上的枪没有手
    buildFirstPersonArms(weapon, model);
    model.group.position.set(pose.x, pose.y, pose.z);
    model.group.rotation.set(pose.rotX, pose.rotY, pose.rotZ);
    this.scene.add(model.group);

    this.model = model;
    this.weapon = weapon;
    this.kick = 0;
    this.kickRotation = 0;
    this.kickVel = 0;
    this.kickRotVel = 0;
  }

  /**
   * 推进切枪状态机。返回「这一帧是不是在切枪」。
   *
   *   ready   → 待机
   *   holster → 旧武器往右下移出画面。**这段结束时才真的换模型** ——
   *             换的那一刻它已经在画面外，玩家看不到任何跳变
   *   draw    → 新武器从 `from` 升到基准位姿，带过冲回弹
   */
  private advanceSwitch(dt: number): boolean {
    if (this.phase === 'ready') return false;

    const profile = this.profile;
    if (!profile) {
      this.phase = 'ready';
      return false;
    }

    this.phaseTimer += dt;
    const span = this.phase === 'holster' ? profile.holster : profile.draw;
    if (this.phaseTimer < span) return true;

    if (this.phase === 'holster') {
      const next = this.pending;
      this.pending = null;
      if (next) this.swapModel(next);
      this.phase = 'draw';
      this.phaseTimer = 0;
      return true;
    }

    // 掏出演完：记住「这把已经掏出过了」，下次不再演全套小动作
    if (this.weapon) this.drawnOnce.add(this.weapon);
    this.phase = 'ready';
    this.phaseTimer = 0;
    this.profile = null;
    return false;
  }

  /**
   * 掏出武器时的「个性小动作」。
   *
   * 返回**叠加在通用 tween 之上**的偏移量 —— 它不负责把武器送到位，只负责在
   * 到位的过程中多做一件事（转一圈、拉一下栓）。所以每一段都必须在 `t = 1`
   * 时回到 0，否则武器会落不到位。
   */
  private flourishAt(type: SwitchFlourish, t: number, full: boolean): FlourishOffset {
    if (t <= 0 || t >= 1) return ZERO_OFFSET;
    const out: FlourishOffset = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
    // 通用包络：两头为 0、中间为 1，保证不破坏落位
    const envelope = Math.sin(t * Math.PI);

    switch (type) {
      case 'bolt':
        // 拉栓检查弹匣：往后一拽再推回去。第一次切过去演全套，之后只轻抖一下
        if (full) {
          out.z = Math.sin(t * Math.PI * 2) * 0.055 * envelope;
          out.rz = Math.sin(t * Math.PI * 2) * 0.16 * envelope;
        } else {
          out.z = envelope * 0.02;
        }
        break;
      case 'raise':
        // AWM：从右下斜着抬起来，抬的过程里还带着一点「甩正」
        out.rz = -envelope * 0.3;
        out.ry = envelope * 0.16;
        break;
      case 'pump':
        // 泵动拉护木：整把枪跟着护木前后走一趟
        out.z = Math.sin(t * Math.PI * 2) * 0.045 * envelope;
        break;
      case 'slide':
        // 滑套轻拉：一下短促的后退，比拉栓小
        out.z = envelope * 0.03;
        out.rx = envelope * 0.1;
        break;
      case 'spin': {
        // 转刀：在屏幕平面里转满一圈，同时往上抛一下再接住 —— 军刀的灵魂。
        // `(k - 1) * TAU` 而不是 `k * TAU`：从 -360° 转到 0°，收尾正好落在原位，
        // 不会在动画结束那一帧被 damp 反着转回去
        const p = Math.min(1, t / 0.8);
        const k = easeOutCubic(p);
        out.rz = (k - 1) * TAU;
        out.y = Math.sin(p * Math.PI) * 0.1;
        out.x = -Math.sin(p * Math.PI) * 0.05;
        break;
      }
      default:
        break;
    }
    return out;
  }

  /* ============================================================
     对外动作
     ============================================================ */

  /**
   * 开火时抖一下。
   *
   * `strength` 来自武器表 `WeaponSpec.feel.kick`（AWM 2.0 / AK 1.2 / M4 0.85 /
   * USP 0.6）。**位移和回位速度都跟着它走** —— 只改幅度的话，重枪只是「抖得
   * 更远」，回位还是那么快，看起来像在震而不是在后坐。
   *
   * `burst` 是玩家那一侧算出来的连发力度（0..1，见 `Player.recoilBurst`）。
   * 连发时幅度最多再加 45%、回位更慢一点点 —— 第 1 发和「一梭子打到一半」
   * 在画面上必须有明显区别，否则自动武器和半自动看起来一模一样。
   *
   * 🔴 上限 2.6 是安全值，不是审美值：`kick` 直接乘 0.055 米的后退量，
   * 再大枪托会穿过近平面（0.01），一发子弹就能让枪消失一帧。
   */
  triggerKick(strength = 1, burst = 0): void {
    const s = Math.max(0.4, strength);
    const heat = Math.min(1, Math.max(0, burst));
    const next = Math.min(2.6, s * (1 + heat * 0.45));
    this.kick = Math.max(this.kick, next);
    this.kickRotation = Math.max(this.kickRotation, next);
    this.kickDamping = 15 / next;
    this.kickRotDamping = 12 / next;
    // 每发都是新的冲击：速度归零，从峰值开始回落。不清的话连发会把速度
    // 一直加上去，枪会在手里越甩越远（而且幅度不受武器表控制）
    this.kickVel = 0;
    this.kickRotVel = 0;
    this.burstHeat = Math.max(this.burstHeat, heat);
  }

  /**
   * 后坐的回位：欠阻尼弹簧，不是指数衰减。
   *
   * 一阶 `damp` 永远从正面逼近 0 —— 看起来像枪被一只手按回去。真实的枪托
   * 顶在肩窝上，回位会**过冲一点点**再落定（肩窝和枪身的弹性）。ζ = 0.86
   * 只过一次冲，幅度约峰值的 4%，肉眼刚好是「弹了一下」。
   *
   * 半隐式欧拉 + 步长夹在 1/30 秒：卡顿时 `dt` 可能到 0.05，
   * 不夹的话 `ω²·dt` 会让弹簧发散（枪抖成噪点）。
   */
  private advanceKick(dt: number): void {
    const step = Math.min(dt, 1 / 30);
    const zeta = 0.86;
    const stiffness = this.kickDamping * this.kickDamping;
    this.kickVel += (-stiffness * this.kick - 2 * zeta * this.kickDamping * this.kickVel) * step;
    this.kick = clamp(this.kick + this.kickVel * step, -0.06, 2.6);

    const rotStiffness = this.kickRotDamping * this.kickRotDamping;
    this.kickRotVel +=
      (-rotStiffness * this.kickRotation - 2 * zeta * this.kickRotDamping * this.kickRotVel) * step;
    this.kickRotation = clamp(this.kickRotation + this.kickRotVel * step, -0.06, 2.6);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * 枪口在**枪模相机**里的屏幕坐标（NDC，-1..1）。
   *
   * 为什么不能「按基准位姿手算」：开火抖动、走路摆动、切枪动画都在改枪模的
   * 位姿，只有模型上那个真实的 `muzzle` 节点才知道枪口此刻在哪。引擎拿这个
   * NDC 去**主相机**反投影，就把「枪模坐标系」和「世界坐标系」接上了 ——
   * 火光 / 曳光的起点永远贴在画面里枪口喷出来的位置，不随 FOV、俯仰错位。
   *
   * 没有枪模（理论上不会发生）回 null，调用方走几何近似兜底。
   */
  muzzleScreen(): { x: number; y: number } | null {
    const model = this.model;
    if (!model) return null;
    // handleFire 跑在 viewModel.update / render 之前，矩阵还是上一帧的；
    // 强制刷一遍（枪模层级就十来个节点，代价可忽略）
    model.group.updateMatrixWorld(true);
    model.muzzle.getWorldPosition(muzzleTmp);
    muzzleTmp.project(this.camera);
    return { x: muzzleTmp.x, y: muzzleTmp.y };
  }

  /* ============================================================
     每帧
     ============================================================ */

  update(dt: number, params: ViewModelParams): void {
    // 先推进切枪 —— 它可能在这一帧把模型换掉，所以下面要重新取 `this.model`
    const switching = this.advanceSwitch(dt);
    // 后坐弹簧在 model 判空之前推进：切枪/载入的空档里积压的速度也要落地，
    // 否则换出枪的那一帧枪会带着上一把的余速「嗖」地弹一下
    this.advanceKick(dt);
    const model = this.model;
    if (!model) return;
    // 连发热度：上升由 `triggerKick` 当场写入（不等平滑），这里只负责退火。
    // 5 的系数约 0.2 秒松掉 —— 松手后枪还在余震里，是「刚打完一梭子」的重量
    this.burstHeat = damp(this.burstHeat, 0, 5, dt);
    this.idleTime += dt;

    const pose = BASE_POSES[this.weapon ?? 'ak47'];
    const isKnife = this.weapon === 'knife';
    const isGrenade = this.weapon === 'grenade';

    // 换弹动画：整把枪往下压再回位，用 sin 做「压下 → 抬起」
    const reloadArc = params.reloading ? Math.sin(Math.min(params.reloadProgress, 1) * Math.PI) : 0;

    // 弹匣自己的「拔出 → 插入」：整枪下沉翻转之外，弹匣必须真的离开弹匣井，
    // 否则精细模型配假换弹一眼就露馅。时序：前段加速拔出（旧匣掉落藏起），
    // 后段新匣减速插入。进度来自 player 的 reloadProgress，联机两边一致
    const magazine = model.magazine;
    if (magazine) {
      let drop = 0;
      if (params.reloading) {
        const p = Math.min(params.reloadProgress, 1);
        if (p < 0.32) {
          const t = Math.max(0, Math.min(1, (p - 0.06) / 0.26));
          drop = easeInCubic(t);
        } else if (p < 0.52) {
          drop = 1;
        } else if (p < 0.8) {
          drop = 1 - easeOutCubic((p - 0.52) / 0.28);
        }
      }
      magazine.position.y = -drop * 0.16;
      // 拔到底的旧弹匣直接藏起（它已经「掉出画面」），新匣从下方升回来
      magazine.visible = drop < 0.98;
    }

    /* ---- 拉栓：提栓 → 后拉 → 推回 → 压下 ----
     * 时间轴和 `player.ts` 的 `advanceBolt` 音效节点对齐：0.12 提栓、0.74 推回到位。
     * 全是进度的确定性函数，不走 damp —— damp 追一个往复动作会拖泥带水。
     * 前段 0~0.12 留白给后坐（kick 还在演），不能一开火栓就动。 */
    // 拉栓时**整把枪也要跟着动**：右手在枪右侧做往复动作，枪身会被带着
    // 往左压、微微下沉、枪口上翘一点。包络 0.12~0.88 与栓的时间轴同步，
    // 中段（后拉/推回）幅度最大 —— 只动画枪栓不动枪身，枪看起来是死的
    let boltRoll = 0;
    let boltDip = 0;
    let boltTilt = 0;
    const boltGroup = model.bolt;
    if (boltGroup) {
      const t = params.bolt;
      if (t > 0 && t < 1) {
        if (t > 0.12 && t < 0.88) {
          const env = Math.sin(clamp((t - 0.12) / 0.76, 0, 1) * Math.PI);
          boltRoll = env * 0.16;
          boltDip = env * 0.02;
          boltTilt = env * 0.1;
        }
        // 提栓：拉机柄从水平（朝右）转到竖直（朝上），绕枪机轴转约 66°
        const lift = t < 0.3 ? clamp((t - 0.12) / 0.18, 0, 1) : t < 0.74 ? 1 : 1 - clamp((t - 0.74) / 0.14, 0, 1);
        // 枪机沿枪管轴向往复：0.30~0.52 后拉（朝射手），0.52~0.74 推回
        const travel = t < 0.52 ? clamp((t - 0.3) / 0.22, 0, 1) : 1 - clamp((t - 0.52) / 0.22, 0, 1);
        boltGroup.rotation.z = easeInOutCubic(lift) * 1.15;
        boltGroup.position.z = easeInOutCubic(travel) * 0.085;
      } else if (boltGroup.rotation.z !== 0 || boltGroup.position.z !== 0) {
        // 拉完 / 被切枪作废：直接落回静止位姿（提栓结束时角度已归零，无跳变）
        boltGroup.rotation.z = 0;
        boltGroup.position.z = 0;
      }
    }

    const bobAmount = params.onGround ? Math.min(params.speed / 5.5, 1) : 0;
    const bobX = Math.sin(params.bobPhase) * 0.012 * bobAmount;
    const bobY = Math.abs(Math.cos(params.bobPhase)) * 0.01 * bobAmount;

    let targetX = pose.x + bobX;
    let targetY = pose.y + bobY - reloadArc * 0.14;
    let targetZ = pose.z + this.kick * 0.055;
    let targetRotX = pose.rotX + this.kickRotation * 0.03 - reloadArc * 0.85;
    let targetRotY = pose.rotY;
    let targetRotZ = pose.rotZ - reloadArc * 0.35 + Math.sin(params.bobPhase) * 0.01 * bobAmount;

    // 后坐的「另外两个轴」：枪托被顶住时枪身会**微微上跳 + 朝持枪侧拧一下**。
    // 只做后退 + 抬头（上一版）看起来像枪被往后拉；补上这两个小分量，
    // 才是「一发打在肩窝里」。幅度都很小（1~2cm / 1° 级），不会挡准星
    targetY += this.kick * 0.014;
    targetRotZ -= this.kickRotation * 0.022;

    // 连发时枪在手里「跳」：两个错开的低频横摆，幅度跟热度走。
    // 只有后退 + 抬头的话，一梭子看起来是「枪被一只看不见的手匀速拖走」；
    // 真实的连发是机匣在往复、整把枪在手里左右抽。0.028 rad ≈ 1.6°（满热度）
    if (this.burstHeat > 0.01) {
      const burstSway = this.burstHeat * Math.max(0, this.kick) * 0.028;
      targetRotZ += Math.sin(this.idleTime * 27) * burstSway;
      targetX += Math.sin(this.idleTime * 19 + 1.1) * burstSway * 0.45;
      // 枪机往复：前后方向的高频小振（40 rad/s ≈ 6.4Hz，接近 400 RPM 的机械节奏）。
      // 只有 4 毫米，但它让「枪在连续工作」这件事有体积感 —— 少了这一层，
      // 连发看起来是枪整体在平移
      targetZ += Math.sin(this.idleTime * 40) * this.burstHeat * 0.004;
    }

    // 拉栓带动的枪身动作（幅度都很小 —— 是「手在忙」，不是「枪在甩」）
    targetRotZ -= boltRoll;
    targetY -= boltDip;
    targetRotX -= boltTilt;

    /* ---- 视角摇晃：转向时枪慢半拍追上来 ----
     * 把本帧视角增量换算成角速度（除以 dt 抹平帧率差异），限幅后做指数平滑
     * —— 鼠标一甩就停的话，增量是脉冲，不平均一下枪会抽搐。枪「追上来」的
     * 方向：视线左转（lookYaw 正）枪往右拖（+x）、枪口相对视线偏右（rotY 负，
     * 见下方推导：rotY 正是枪口朝左）。幅度按 1.5 rad/s 的常规转头标定，
     * 猛甩头（6 rad/s）会到限幅边缘，权重感最重。 */
    const velYaw = dt > 0 ? clamp(params.lookYaw / dt, -6, 6) : 0;
    const velPitch = dt > 0 ? clamp(params.lookPitch / dt, -6, 6) : 0;
    this.swayYaw = damp(this.swayYaw, velYaw, 8, dt);
    this.swayPitch = damp(this.swayPitch, velPitch, 8, dt);
    targetX += this.swayYaw * 0.01;
    targetY -= this.swayPitch * 0.008;
    targetRotY -= this.swayYaw * 0.028;
    targetRotX -= this.swayPitch * 0.022;

    // 军刀的走路摆动（walk sway）：刀尖朝前，摆动就是「刀尖随步伐上下点、
    // 左右摆」；奔跑时往画面内侧收一点，免得跑起来刀柄在右下角乱晃
    if (isKnife && bobAmount > 0.01) {
      targetRotX += Math.sin(params.bobPhase) * 0.04 * bobAmount;
      targetRotY += Math.sin(params.bobPhase) * 0.07 * bobAmount;
      targetX -= bobAmount * 0.03;
    }

    /* ---- 军刀待机：呼吸浮动 + 每 8~12 秒转一次刀 ---- */
    let snap = switching;
    if (isKnife && !switching && !params.melee.active && params.dying <= 0) {
      targetY += Math.sin(this.idleTime * 1.5) * 0.009;
      targetX += Math.sin(this.idleTime * 0.85) * 0.005;
      targetRotZ += Math.sin(this.idleTime * 1.1) * 0.022;

      if (this.spinProgress < 0) {
        this.spinCooldown -= dt;
        if (this.spinCooldown <= 0) {
          this.spinProgress = 0;
          this.spinCooldown = rand(8, 12);
          // 音效在这里播是刻意的：这个计时器是纯视觉的，只有渲染层知道它
          gameAudio.knifeSpin();
        }
      } else {
        this.spinProgress += dt / KNIFE_SPIN_TIME;
        if (this.spinProgress >= 1) {
          // 转完这一帧直接把角度落回基准位姿：-360° 和 0° 是同一个朝向，
          // 归零看不见跳变；不这么做的话，下一帧 damp 会从 -360° 一路转回去
          this.spinProgress = -1;
          snap = true;
        } else {
          const p = this.spinProgress;
          const k = easeOutCubic(Math.min(1, p / 0.85));
          const lift = Math.sin(Math.min(1, p / 0.85) * Math.PI);
          // 在屏幕平面里转满一圈，同时往上抛一下再接住
          targetRotZ -= TAU * k;
          targetY += lift * 0.1;
          targetX -= lift * 0.04;
          // 这一段直接赋值，不走 damp —— damp 追一个旋转目标会「转不完」
          snap = true;
        }
      }
    } else {
      this.spinProgress = -1;
      /* ---- 枪械待机：呼吸浮动 ----
       * 人站着不动也在呼吸，持枪的手会跟着起伏。幅度是刀的 1/3（枪端得
       * 更稳，起伏大会像帕金森）；切枪 / 死亡 / 开镜时停掉，免得和那些
       * 绝对覆盖的姿态打架。 */
      if (!switching && !params.melee.active && params.dying <= 0 && !params.scoped) {
        targetY += Math.sin(this.idleTime * 1.3) * 0.0035;
        targetRotZ += Math.sin(this.idleTime * 0.9) * 0.008;
        targetRotX += Math.sin(this.idleTime * 1.7) * 0.004;
      }
    }

    /* ---- 近战挥砍 ---- */
    applyMelee(params.melee, isKnife, (o) => {
      targetX += o.x;
      targetY += o.y;
      targetZ += o.z;
      targetRotX += o.rx;
      targetRotY += o.ry;
      targetRotZ += o.rz;
    });

    /* ---- 手雷：捏雷抬手 → 甩出 → 收手 ----
     *
     * 时间轴由 `player.ts` 的两条进度驱动（这里只认 0..1，不碰判定）：
     * `grenadeCook` 是按住左键的前 0.22s（抬手凑近，之后保持），
     * `grenadeThrow` 是松手之后 `GRENADE_THROW_TIME` 0.42s 的整段动作。
     *
     * 三段：「起手」→「蓄力后拉」→「甩出（往前下方砸出画外）」→「收手」。
     * 快速扔雷（G）多一段起手：那个模型是这一帧才换出来的，如果不从下方
     * 拔上来，手雷就是硬生生出现在画面中央。
     *
     * 🔴 snap：这段是精确编排的，走 damp 会被拖成慢动作（和切枪 / 转刀同理）。
     * 所有偏移在进度到 1 时都被 `back` 系数抹回 0，不会和待机呼吸打架。 */
    // 抬手量先过一遍平滑（松手那一帧源值是跳变的，见 `cookView`）
    this.cookView = damp(this.cookView, clamp(params.grenadeCook, 0, 1), 22, dt);

    if (isGrenade) {
      const cook = this.cookView;
      if (cook > 0) {
        const c = easeOutCubic(cook);
        targetX -= c * 0.05; // 往画面中线收
        targetY += c * 0.08; // 抬到胸口以上
        targetZ += c * 0.03; // 凑近镜头
        targetRotX += c * 0.28; // 手腕后仰（雷体顶部朝镜头倒，看得见引信）
        targetRotZ += c * 0.18;
      }

      const p = clamp(params.grenadeThrow, 0, 1);
      if (p > 0 && p < 1) {
        let gx = 0;
        let gy = 0;
        let gz = 0;
        let grx = 0;
        let grz = 0;

        // ① 起手（只有快速扔雷）：从右下画外拔上来
        if (params.grenadeThrowQuick) {
          const e = 1 - easeOutCubic(clamp(p / 0.26, 0, 1));
          gx += e * 0.2;
          gy -= e * 0.45;
          gz += e * 0.06;
          grx += e * 0.7;
          grz -= e * 0.6;
        }

        // ② 蓄力：抬手往后拉，0.36 最满；0.36~0.56 被甩出抵消回去
        const wind =
          p < 0.36 ? easeOutCubic(p / 0.36) : 1 - easeInCubic(clamp((p - 0.36) / 0.2, 0, 1));
        gx -= wind * 0.1;
        gy += wind * 0.12;
        gz += wind * 0.06;
        grx += wind * 0.5; // 顶部朝镜头倒 = 手举到肩后
        grz += wind * 0.35;

        // ③ 甩出：0.40 起加速往前下方砸，0.62 到最深 —— 那时已经出画
        const flick = easeInCubic(clamp((p - 0.4) / 0.22, 0, 1));
        gx += flick * 0.05;
        gy -= flick * 0.55;
        gz -= flick * 0.3;
        grx -= flick * 1.45; // 手腕前甩：顶部翻向前方，跟着手一起沉出画面
        grz -= flick * 0.5;

        // ④ 收手：0.66 之后把上面所有偏移一起抹回 0（等于手抬回持雷位姿）
        const back = p > 0.66 ? easeInOutCubic(clamp((p - 0.66) / 0.34, 0, 1)) : 0;
        const k = 1 - back;

        targetX += gx * k;
        targetY += gy * k;
        targetZ += gz * k;
        targetRotX += grx * k;
        targetRotZ += grz * k;
        snap = true;
      }
    }

    /* ---- 切枪位移 / 旋转 ---- */
    const profile = this.profile;
    if (switching && profile) {
      if (this.phase === 'holster') {
        // 收起：往下 + 往右移出画面，带一点旋转。缓入曲线 —— 手一甩就出去了
        const k = easeInCubic(this.phaseTimer / profile.holster);
        targetX += k * 0.36;
        targetY += k * -0.5;
        targetZ += k * 0.1;
        targetRotX += k * 0.45;
        targetRotZ += k * -0.9;
      } else {
        // 掏出：从 `from` 升到 0。`easeOutBack` 会在中段冲过 1 —— 那一下就是落位回弹
        const t = this.phaseTimer / profile.draw;
        const inv = 1 - easeOutBack(t, profile.overshoot);
        targetX += inv * profile.from.x;
        targetY += inv * profile.from.y;
        targetZ += inv * profile.from.z;
        targetRotX += inv * profile.fromRot.x;
        targetRotY += inv * profile.fromRot.y;
        targetRotZ += inv * profile.fromRot.z;

        const f = this.flourishAt(profile.flourish, t, this.flourishFull);
        targetX += f.x;
        targetY += f.y;
        targetZ += f.z;
        targetRotX += f.rx;
        targetRotY += f.ry;
        targetRotZ += f.rz;
      }
    }

    /* ---- 开镜 / 死亡：直接覆盖，不是叠加 ---- */
    if (params.scoped) {
      // 开镜：枪退到画面正下方，视线上没有遮挡
      targetX = 0;
      targetY = -0.06;
      targetZ = -0.3;
      targetRotX = 0;
      targetRotY = 0;
      targetRotZ = 0;
    }

    if (params.dying > 0) {
      // 死亡：枪从手里滑出去 —— 往下坠、向后翻、往右甩，和镜头一起出画
      const d = Math.min(1, params.dying);
      targetX = pose.x + d * 0.3;
      targetY = pose.y - d * 1.6;
      targetZ = pose.z + d * 0.4;
      targetRotX = -d * 2.1;
      targetRotY = 0;
      targetRotZ = d * 1.1;
    }

    /* ---- 落到 group 上 ---- */
    const group = model.group;
    if (snap) {
      // 切枪 / 转刀这两段是「精确编排」的，damp 会把它们拖成慢动作
      group.position.set(targetX, targetY, targetZ);
      group.rotation.set(targetRotX, targetRotY, targetRotZ);
    } else {
      group.position.x = damp(group.position.x, targetX, 18, dt);
      group.position.y = damp(group.position.y, targetY, 18, dt);
      group.position.z = damp(group.position.z, targetZ, 18, dt);
      group.rotation.x = damp(group.rotation.x, targetRotX, 16, dt);
      group.rotation.y = damp(group.rotation.y, targetRotY, 16, dt);
      group.rotation.z = damp(group.rotation.z, targetRotZ, 16, dt);
    }

    // 掉到画面外之后就彻底不画了：留着只会浪费一次 draw call
    group.visible = !params.scoped && params.dying < 0.95;
    // 死亡 = 武器脱手：枪滑出画面的同时手臂留在画外，不能跟着枪一起飞
    if (model.arms) model.arms.visible = params.dying <= 0;
  }

  dispose(): void {
    if (this.model) {
      this.scene.remove(this.model.group);
      disposeWeaponModel(this.model);
      this.model = null;
    }
  }
}

/**
 * 把 `melee.swing`（-1 蓄力 → +1 刺到尽头 → 0 收刀）翻译成刀模的位姿偏移。
 *
 * 判定窗口、前摇后摇的边界**全在 `player.ts` 里**，这里只认一个标量 ——
 * 于是调手感（窗口多长）和调观感（刺多深）是两件互不影响的事。
 *
 * ## 刺击（2026-11-12 改：挥砍 → 直刺）
 *
 * 需求：攻击由上下挥砍改为「沿视线方向向前刺出」。刀现在是刀尖朝 -z 的刺击
 * 握法，所以三个阶段都只动 z（进深）和一点手腕：
 *
 *   蓄力（s: 0→-1）—— 整把刀往后拉 + 手腕后仰。轻击前摇只有 0.1s，短促
 *   刺出（s: -1→+1）—— 沿 -z 直刺，刀尖微微前压、向屏幕中线带
 *   收刀（s: +1→0）—— 走 `player.ts` 的缓动曲线回到持刀位
 *
 * 重击刺得更深、蓄力更足，但也是同一条直线 —— 不再有横扫和上下劈的分量。
 *
 * 非近战武器直接跳过：切枪时刺到一半的动作会被 `player.ts` 作废，不会串味。
 */
function applyMelee(pose: MeleePose, isKnife: boolean, add: (offset: FlourishOffset) => void): void {
  if (!isKnife) return;
  const s = pose.swing;
  if (!pose.active && Math.abs(s) < 0.001 && pose.rebound < 0.001) return;

  const out: FlourishOffset = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };

  // 把有符号的 swing 拆成「往后拉多少」和「往前刺多少」两段
  const windup = Math.max(0, -s);
  const thrust = Math.max(0, s);
  const pullBack = pose.heavy ? 0.2 : 0.14;
  const depth = pose.heavy ? 0.46 : 0.36;

  out.z = windup * pullBack - thrust * depth;
  out.y = windup * 0.035 - thrust * 0.015;
  out.x = -thrust * 0.04;
  out.rx = windup * 0.16 + thrust * 0.05;
  out.ry = -thrust * 0.06;

  // 弹刀：刀尖顶在墙 / 箱子上被顶回来 —— 刀往后缩、手腕后仰，和动作叠加
  out.z += pose.rebound * 0.09;
  out.rx += pose.rebound * 0.2;

  add(out);
}
