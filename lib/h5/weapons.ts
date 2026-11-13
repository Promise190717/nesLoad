import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { PrimaryId, SlotId, WeaponId } from './types';
import { type PbrTextureSet, type WeaponTextureLibrary, weaponTextures } from './weapon-textures';

/**
 * 全部武器的数值表 + 第一人称枪模。
 *
 * **手感全部在这里调** —— 引擎（`combat.ts` / `engine.ts`）只读这张表，没有任何
 * 一处写死伤害、射速、弹匣容量。加一把枪 = 这里加一条 + `buildWeaponModel` 加一个分支。
 *
 * ## 设计意图（别随手抹平差异）
 *
 *   AK-47   —— 通用的那把。单发 33、爆头 ×4 一枪带走，射速 600，后坐明显。
 *   M4A1    —— 射速更快（685）、后坐更小、单发更低（30）。追枪和贴脸更稳。
 *   AWM     —— 栓动狙击，110 伤害，开镜才准。不开镜散布 0.012 弧度（约 0.7°），
 *              逼玩家「停下来、开镜、开一枪」。
 *   M870    —— 8 弹丸 × 9，15 米内致命，逐发装填（装填中开火会中断）。
 *   USP     —— 副武器。25 伤害、12 发、半自动，主武器打空了才拿出来。
 *   尼泊尔刀 —— 轻刀 55（0.5s 一套）、重刀 90（1.0s 一套），2.2 米扇形扫掠判定。
 *               **不是「按下就结算一次」** —— 判定窗口内每帧扫一次，刀还在空中时
 *               敌人走进来也砍得到（见 `combat.ts` 的 `meleeSwing`）。
 *   高爆手雷 —— 3 秒引信、8 米半径、中心 98 衰减到 20，可捏雷。
 *
 * `spread` 是**弧度**的圆锥半角。命中判定用「射一条带随机扰动的射线」，
 * 于是散布在画面上表现为「有时候打空」，和真枪一样，不需要额外的随机数表。
 *
 * `falloff` 是**射程**，不是「另一套伤害表」：`start` 米内倍率恒为 1（伤害和加衰减
 * 之前一模一样），到 `end` 米按 `curve` 平滑降到 `min`，之后不再下降。三档定位：
 *
 *   短射程（霰弹 15/34/0.12、手枪 22/55/0.50）—— 出射程立刻掉，逼你在近处解决
 *   中射程（AK 30/85/0.55、M4 32/85/0.58）—— 全图（最长视线约 58m）都掉不到底
 *   长射程（AWM 50/130/0.92）—— 底卡在 0.92 是为了保住「任何距离一枪一个」
 *
 * 求值只有 `damageFalloff()` 一处，玩家 / Bot / 任何未来的权威端共用，所以「Bot 远
 * 距离打不疼」和「玩家远距离打不疼」必然是同一条曲线。
 */

export type GunSound = 'ak47' | 'm4a1' | 'awm' | 'shotgun' | 'usp';

export interface SpreadSpec {
  base: number;
  /** 每开一枪额外增加的散布 */
  perShot: number;
  max: number;
  /** 满速移动时额外增加的散布 */
  move: number;
  /** 空中的散布倍率 */
  air: number;
}

export interface RecoilSpec {
  /** 每发抬起的角度（度） */
  up: number;
  /** 每发横向抖动的最大角度（度） */
  side: number;
  /** 回正速度（指数逼近系数） */
  recover: number;
}

/**
 * 开枪的**表现**参数 —— 纯手感，一个数字都不参与伤害 / 射速 / 散布结算。
 *
 * 为什么单开一张表而不是塞进 `RecoilSpec`：`RecoilSpec` 是**玩法**参数（它真的
 * 会把准星顶上去，影响下一发的弹道），这张表只影响「看起来有多狠」。两者混在
 * 一起，下次调「AWM 更有冲击感」就会不小心改到弹道 —— 那是验收里明令禁止的。
 *
 * 四件事各自独立，所以「狙击更重」可以只加重量、不加抖动：
 *
 *   kick        枪模后坐幅度倍率（1 = 基准）。只动第一人称枪模，不动准星
 *   punchPitch  镜头**俯仰**冲击（度）。只加在相机上，`aimPitch` 不含它 ——
 *               弹道不受影响；衰减极快（约 40ms），不足以让人瞄偏
 *   punchRoll   镜头**侧倾**冲击（度）。绕视线滚转，**完全不改变前向量**，
 *               所以它是零瞄准代价的「力度」表达；狙击 / 霰弹才有明显值
 *   shake       随机震屏强度（0 = 不震）。随机抖动最晕，只给最重的两把一点点
 *   flashScale  枪口焰尺寸倍率
 *   flashLife   枪口焰存在时长（秒）。大口径的焰要「挂」一下才像有火药
 */
export interface FeelSpec {
  kick: number;
  punchPitch: number;
  punchRoll: number;
  shake: number;
  flashScale: number;
  flashLife: number;
}

/** 没配 `feel` 的武器（刀 / 手雷）走这一份 —— 它们不走枪械的开火反馈路径。 */
export const DEFAULT_FEEL: FeelSpec = {
  kick: 1,
  punchPitch: 0,
  punchRoll: 0,
  shake: 0,
  flashScale: 1,
  flashLife: 0.05,
};

/** 取一把枪的表现参数。集中在这里取值，调用方不用处理 `undefined`。 */
export function weaponFeel(id: WeaponId): FeelSpec {
  return WEAPONS[id].feel ?? DEFAULT_FEEL;
}

/**
 * 距离衰减的**插值方式**。三种都是把「出射程后的进度」`t ∈ [0,1]` 单调映射到
 * `[0,1]` 的权重 —— 只改「怎么掉」，不改「掉到哪」（那由 `min` 决定）。
 *
 * 需求里「不能刚超过某个距离就突然大幅下降」就靠这三种曲线保证：三者在 `t=0`
 * 处都连续接到 1，不存在台阶。
 */
export type FalloffCurve =
  /** 线性：掉得均匀。近距武器（霰弹 / 手枪）用它，超出射程立刻有感 */
  | 'linear'
  /** smoothstep `3t²-2t³`：两端导数为 0，出射程几乎不掉、到末端缓缓落底 */
  | 'smooth'
  /** `t^1.8`：前段压平、后段变陡。步枪 / 狙击用它，中距离「几乎没感觉」 */
  | 'hold';

/**
 * 一把枪的射程曲线。**玩家和 Bot 读的是同一份**，`damageFalloff()` 是唯一求值处。
 *
 * 近战（刀）与投掷物（手雷）不经过这套 —— 刀的伤害与距离无关（扇形判定已经限定了
 * 2.2 米），手雷走自己的 `t²` 半径衰减（见 `combat.ts` 的 `grenadeBlast`）。
 */
export interface FalloffSpec {
  /**
   * 有效射程（米）：这个距离内满伤害。距离从**射线起点**（射手眼睛）量到命中点，
   * 所以打同一个目标、换一个站位，衰减系数就会不一样 —— 这是刻意的。
   */
  start: number;
  /** 到这个距离衰减到 `min` */
  end: number;
  /** 最低伤害倍率。**永远 > 0**，远距离也留一点伤害，绝不出现「打中不掉血」 */
  min: number;
  /** 插值方式。不填 = `'linear'` */
  curve?: FalloffCurve;
}

export interface WeaponSpec {
  id: WeaponId;
  /** 分派用：枪走弹道，刀走扇形，手雷走投掷物 */
  kind: 'gun' | 'melee' | 'throwable';
  slot: SlotId;
  /** 显示名。不翻译 —— 枪名在哪种语言里都一样 */
  name: string;
  /** 单发伤害（手雷是爆心伤害） */
  damage: number;
  /** 爆头倍率 */
  headMul: number;
  /** 两次攻击之间的最短间隔（秒）。`60 / interval` = RPM */
  interval: number;
  magazine: number;
  /**
   * 备弹量。**只给 Bot 用** —— 玩家的备弹是无限的（见 `player.ts` 的 `Ammo`），
   * 换枪菜单和 HUD 都显示 ∞。Bot 需要这个数来安排「打空了要缩回去换弹」的节奏。
   */
  reserve: number;
  auto: boolean;
  /** 换弹时长（秒） */
  reload: number;
  /** 霰弹枪逐发装填 */
  perShell: boolean;
  /** 一次击发的弹丸数 */
  pellets: number;
  spread: SpreadSpec;
  recoil: RecoilSpec;
  /** 开枪的**表现**参数（枪模后坐 / 镜头冲击 / 枪口焰）。不参与任何结算 */
  feel?: FeelSpec;
  /** 距离衰减；null = 不衰减 */
  falloff: FalloffSpec | null;
  /** 可穿透的木箱层数 */
  pen: number;
  /** 只有狙击能开镜 */
  scoped: boolean;
  /**
   * 栓动周期（秒）：击发后进入拉栓状态，走完之前不能开火。
   * 目前只有 AWM 有；取值与 `interval` 相同 —— 拉栓动作本身就是这把枪的射速。
   * 没有这个字段的枪（AK/M4/霰弹/USP）射击逻辑完全不变。
   */
  boltCycle?: number;
  sound: GunSound | null;

  /* 近战 */
  heavyDamage?: number;
  heavyInterval?: number;
  /** 近战攻击距离（米） */
  reach?: number;
  /**
   * 近战判定窗口，占整个动作的比例 `[start, end]`。
   *
   * 判定不是「按下就结算一次」，而是窗口内每帧做一次扫掠 —— 这就是需求里
   * 「模拟挥过去的轨迹」的落点：刀还在空中时敌人走进来也砍得到。
   * 轻击前摇短（0.2 × 0.5s = 0.1s），重击前摇长（0.25 × 1.0s = 0.25s）。
   */
  meleeWindow?: readonly [number, number];
  /** 重击的判定窗口。不填就用 `meleeWindow` */
  heavyWindow?: readonly [number, number];
  /** 近战扇形的**全角**（度）。轻击宽、重击窄 */
  meleeArc?: number;
  /** 重击的扇形全角（度） */
  heavyArc?: number;

  /* 投掷物 */
  fuse?: number;
  radius?: number;
  minDamage?: number;
  throwSpeed?: number;
}

const RIFLE_SPREAD = (base: number, perShot: number, max: number, move: number): SpreadSpec => ({
  base,
  perShot,
  max,
  move,
  air: 2.4,
});

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  ak47: {
    id: 'ak47',
    kind: 'gun',
    slot: 'primary',
    name: 'AK-47',
    damage: 33,
    headMul: 4,
    interval: 0.1,
    magazine: 30,
    reserve: 90,
    auto: true,
    reload: 2.5,
    perShell: false,
    pellets: 1,
    // 2026-11-12 第十二轮第三次调：用户两次反馈「还是太准」。基准散布也抬了，
    // 静止点射不再指哪打哪；连发累积加大让扫射快速进入「泼水」状态
    spread: RIFLE_SPREAD(0.005, 0.007, 0.075, 0.032),
    recoil: { up: 1.05, side: 0.42, recover: 7 },
    // 7.62 大口径：枪模后退最狠、枪口焰最大最久。镜头只给一点侧倾，
    // 不给随机震屏 —— 600 RPM 下随机抖动会连成一片，20 秒就晕
    feel: { kick: 1.2, punchPitch: 0.16, punchRoll: 0.4, shake: 0, flashScale: 1.05, flashLife: 0.055 },
    // 射程：30m 内满伤害（33），85m 掉到 55%（18.2）。85 > 全图最长视线
    // （船长 52m、对角约 58m），所以「打满整张图也不会掉到底」—— 步枪的中距离
    // 稳定性就是靠这个余量 + 'hold' 曲线的前段压平撑起来的
    falloff: { start: 30, end: 85, min: 0.55, curve: 'hold' },
    pen: 1,
    scoped: false,
    sound: 'ak47',
  },
  m4a1: {
    id: 'm4a1',
    kind: 'gun',
    slot: 'primary',
    name: 'M4A1',
    damage: 30,
    headMul: 4,
    interval: 60 / 685,
    magazine: 30,
    reserve: 90,
    auto: true,
    reload: 2.5,
    perShell: false,
    pellets: 1,
    spread: RIFLE_SPREAD(0.004, 0.0055, 0.065, 0.026),
    recoil: { up: 0.82, side: 0.28, recover: 8.5 },
    // 5.56 小口径 + 685 RPM：**最干脆的一把** —— 枪模位移小、回位快，
    // 枪口焰小而短。连发时看起来是「哒哒哒」的节奏而不是「砰砰砰」的糊
    feel: { kick: 0.85, punchPitch: 0.12, punchRoll: 0.3, shake: 0, flashScale: 0.85, flashLife: 0.042 },
    // 比 AK 略晚起衰（32m）、底更低（58%），但用 'smooth' 曲线 —— 出射程那段几乎
    // 不掉、到 85m 才缓缓落底。5.56 的定位就是「远一点也还能打」
    falloff: { start: 32, end: 85, min: 0.58, curve: 'smooth' },
    pen: 1,
    scoped: false,
    sound: 'm4a1',
  },
  awm: {
    id: 'awm',
    kind: 'gun',
    slot: 'primary',
    name: 'AWM',
    damage: 110,
    headMul: 2.5,
    interval: 60 / 42,
    magazine: 5,
    reserve: 15,
    auto: false,
    reload: 3.5,
    perShell: false,
    pellets: 1,
    spread: { base: 0.012, perShot: 0.02, max: 0.06, move: 0.06, air: 3 },
    recoil: { up: 3.4, side: 0.7, recover: 4.5 },
    // 全表最重的一档：枪模往后砸、枪口焰大且挂得久（0.09s 能看见「喷出来」而不是
    // 一闪）。侧倾 1.05° 是「一枪把人掀一下」的来源，衰减 60ms，不影响瞄准；
    // 随机震屏只给 0.08 —— 有它才像后坐，再多就晕
    feel: { kick: 2, punchPitch: 0.32, punchRoll: 1.05, shake: 0.08, flashScale: 1.8, flashLife: 0.09 },
    // 🔴 全表最长的有效射程：50m 内满伤害，130m 才掉到 92%。
    //
    // 为什么底卡在 0.92 而不是更低：110 × 0.92 = 101.2 > 100 血 —— **保住「任何
    // 距离都是一枪一个」这个定位**（见文件头的设计意图）。定 0.9 就会在超远距离
    // 出现「一枪打不死」，那是把狙击枪变成「看运气的枪」。
    // 本图最长视线约 58m，所以实际衰减只有 50~58m 那一段、幅度 <1%，玩家感知不到 ——
    // 这正是「有效射程长」应有的表现，不是没生效。
    falloff: { start: 50, end: 130, min: 0.92, curve: 'hold' },
    pen: 2,
    scoped: true,
    // 拉栓周期 = 射击间隔（42 RPM）：每一发之间演一整套拉栓，拉完才能打下一发
    boltCycle: 60 / 42,
    sound: 'awm',
  },
  shotgun: {
    id: 'shotgun',
    kind: 'gun',
    slot: 'primary',
    name: 'M870',
    damage: 9,
    headMul: 1.6,
    interval: 60 / 72,
    magazine: 7,
    reserve: 21,
    auto: false,
    reload: 0.55,
    perShell: true,
    pellets: 8,
    spread: { base: 0.055, perShot: 0.006, max: 0.075, move: 0.012, air: 1.6 },
    recoil: { up: 2.6, side: 0.9, recover: 4 },
    // 12 号霰弹：枪模砸得比 AK 重、枪口焰最宽（8 颗弹丸一起出膛，火光本来就大）。
    // 泵动间隔 0.83s，所以侧倾可以给到 0.85° 而不至于连成抖动
    feel: { kick: 1.7, punchPitch: 0.3, punchRoll: 0.85, shake: 0.06, flashScale: 1.5, flashLife: 0.075 },
    // 射程最短、掉得最狠：15m 内 8 颗弹丸满伤害，34m 就只剩 12%（每颗 1.08）。
    // 用 'linear' —— 霰弹要的就是「出了射程立刻没戏」，曲线压平反而违背直觉
    falloff: { start: 15, end: 34, min: 0.12, curve: 'linear' },
    pen: 0,
    scoped: false,
    sound: 'shotgun',
  },
  usp: {
    id: 'usp',
    kind: 'gun',
    slot: 'secondary',
    name: 'USP',
    damage: 25,
    headMul: 3.2,
    interval: 60 / 400,
    magazine: 12,
    reserve: 48,
    auto: false,
    reload: 1.9,
    perShell: false,
    pellets: 1,
    spread: RIFLE_SPREAD(0.007, 0.009, 0.072, 0.028),
    recoil: { up: 1.5, side: 0.5, recover: 9 },
    // .45 手枪：全表最轻。枪模几乎只抖一下、枪口焰最小，和步枪的「砸」拉开距离
    feel: { kick: 0.6, punchPitch: 0.1, punchRoll: 0.25, shake: 0, flashScale: 0.7, flashLife: 0.038 },
    // 手枪：22m 内满伤害（25），55m 掉到 50%（12.5）。'linear' + 全表第二早的
    // 起衰点 —— 「短射程武器远距离衰减更明显」这条由它和霰弹承担
    // （表里没有冲锋枪；将来加 SMG 就照这一档填：start 18~22 / min 0.4~0.5）
    falloff: { start: 22, end: 55, min: 0.5, curve: 'linear' },
    pen: 0,
    scoped: false,
    sound: 'usp',
  },
  knife: {
    id: 'knife',
    kind: 'melee',
    slot: 'melee',
    name: '尼泊尔军刀',
    damage: 55,
    headMul: 1.5,
    // 0.5s 一套：前摇 0.1 + 判定 0.15 + 后摇 0.25
    interval: 0.5,
    magazine: 0,
    reserve: -1,
    auto: false,
    reload: 0,
    perShell: false,
    pellets: 1,
    spread: { base: 0, perShot: 0, max: 0, move: 0, air: 1 },
    recoil: { up: 0, side: 0, recover: 1 },
    falloff: null,
    pen: 0,
    scoped: false,
    sound: null,
    heavyDamage: 90,
    // 1.0s 一套：前摇 0.25 + 判定 0.15 + 后摇 0.6 —— 「出手明显更重更慢」
    heavyInterval: 1,
    reach: 2.2,
    // 判定窗口占整套动作的比例。0.2 × 0.5s = 0.1s 起手，0.5 × 0.5s = 0.25s 收刀
    meleeWindow: [0.2, 0.5],
    heavyWindow: [0.25, 0.4],
    // 轻击横扫，扇形宽；重击是斜劈，扇形窄但更远（+0.3m 见 `HEAVY_REACH_BONUS`）
    meleeArc: 70,
    heavyArc: 46,
  },
  grenade: {
    id: 'grenade',
    kind: 'throwable',
    slot: 'throwable',
    name: '高爆手雷',
    damage: 98,
    headMul: 1,
    interval: 0.8,
    magazine: 0,
    reserve: -1,
    auto: false,
    reload: 0,
    perShell: false,
    pellets: 1,
    spread: { base: 0, perShot: 0, max: 0, move: 0, air: 1 },
    recoil: { up: 0, side: 0, recover: 1 },
    falloff: null,
    pen: 0,
    scoped: false,
    sound: null,
    fuse: 3,
    radius: 8,
    minDamage: 20,
    throwSpeed: 17,
  },
};

/** 主武器四选一的顺序。换枪菜单、背包循环都按这个来。 */
export const PRIMARY_ORDER: readonly PrimaryId[] = ['ak47', 'm4a1', 'awm', 'shotgun'];

/**
 * 伤害衰减的**绝对下限**。任何配置（哪怕是手写错的 `min: 0`）都不许把伤害压到 0：
 * 0 伤害的表现是「明明打中了却不掉血」，玩家只会判定成命中判定坏了。
 */
const MIN_FALLOFF = 0.05;

/** 把「出射程后的进度」按配置的曲线映射成 0..1 的权重。三种曲线在 t=0 处都接 1。 */
function falloffWeight(curve: FalloffCurve | undefined, t: number): number {
  switch (curve) {
    case 'smooth':
      // smoothstep：两端导数为 0，出射程和到末端都是「缓缓」的
      return t * t * (3 - 2 * t);
    case 'hold':
      // t^1.8：前段几乎压平，后段才陡起来
      return Math.pow(t, 1.8);
    default:
      return t;
  }
}

/**
 * 距离伤害倍率（1 = 满伤害）。**枪械距离衰减的唯一求值处** —— 玩家、Bot、将来任何
 * 权威端都调它，不存在第二份曲线。
 *
 * `distance` 是「射线起点（射手眼睛）到命中点」的米数，不是两人之间的水平距离：
 * 打高处的目标、隔着木箱穿透后再命中，算出来的都是真实弹道长度。
 *
 * 分段：
 *   ≤ start          → 1（有效射程内，伤害与以前完全一致）
 *   start ~ end      → 按 `curve` 从 1 平滑降到 `min`（无台阶）
 *   ≥ end            → `min`（不再继续掉，也不会变成 0 / 负数）
 */
export function damageFalloff(spec: WeaponSpec, distance: number): number {
  const falloff = spec.falloff;
  if (!falloff) return 1;

  // 配置里写的底，再兜一层绝对下限 —— 两个都夹住，负倍率 / 0 倍率进不来
  const floor = Math.max(MIN_FALLOFF, falloff.min);

  // 距离非法（NaN / Infinity）时按满伤害处理，不让 NaN 顺着乘法污染整条伤害链
  if (!(distance > falloff.start)) return 1;
  if (!(distance < falloff.end)) return floor;

  const span = falloff.end - falloff.start;
  // end <= start 这种写反的配置：当作「出射程即到底」，而不是除零得 NaN
  if (!(span > 0)) return floor;

  const weight = falloffWeight(falloff.curve, (distance - falloff.start) / span);
  const factor = 1 + (floor - 1) * weight;
  // 最后再夹一次：曲线配置异常也不可能超过 1 或低于 floor
  return Math.min(1, Math.max(floor, factor));
}

/* ============================================================
   近战 / 切枪 的附加参数
   ============================================================ */

/**
 * 重击的额外攻击距离（米）。
 *
 * 需求原文是「重击扇形窄一点但距离 +0.3m」。不并进 `reach` 是因为 `reach` 描述的是
 * 「这把刀够得着多远」这个武器属性，而 +0.3 是**重击这个动作**的属性 ——
 * 将来若加第二把刀，这个加成不该跟着复制。
 */
export const HEAVY_REACH_BONUS = 0.3;

/** 切枪音色。只影响合成的频谱，不携带任何语义。 */
export type SwitchSound = 'rifle' | 'pistol' | 'sniper' | 'shotgun' | 'knife' | 'grenade';

/**
 * 掏出武器时叠在通用 tween 上的「个性小动作」。
 *
 *   none   什么都不加（手雷：握住雷体就算完成）
 *   bolt   拉栓检查弹匣（AK / M4，**只在第一次切过去时演全套**）
 *   raise  从右下斜着抬起来 + 金属摩擦声（AWM，栓动枪的仪式感）
 *   pump   泵动拉护木（M870）
 *   slide  滑套轻拉（USP）
 *   spin   在手里转一圈再接住（军刀，这一下是灵魂）
 */
export type SwitchFlourish = 'none' | 'bolt' | 'raise' | 'pump' | 'slide' | 'spin';

export interface SwitchProfile {
  /** 收起旧武器用时（秒）。这一段结束时模型才真的换掉 —— 换的时候它已经在画面外了 */
  holster: number;
  /** 掏出新武器用时（秒） */
  draw: number;
  /** 掏出时的起始偏移（米，相对基准位姿）。从哪个方向升起来 */
  from: { x: number; y: number; z: number };
  /** 掏出时的起始朝向（弧度，叠加在基准朝向之上） */
  fromRot: { x: number; y: number; z: number };
  /**
   * 落位过冲。直接喂给 `easeOutBack` 的 `s` 参数：
   * 0.45 大约多走位移的 2.5%，肉眼刚好能看出「咔一下弹回来」。
   */
  overshoot: number;
  flourish: SwitchFlourish;
  sound: SwitchSound;
}

/**
 * 切枪动画参数表 —— **唯一出处**。
 *
 * 总时长按武器分档（需求：手枪/刀 0.4s、步枪 0.5s、AWM 0.65s），收起和掏出
 * 按 4:6 分。`player.ts` 拿 `holster + draw` 当开火锁定时间，`viewmodel.ts`
 * 拿它驱动 tween —— 两边读同一份，不会出现「动画演完了但还不能开枪」。
 */
export const SWITCH_PROFILES: Record<WeaponId, SwitchProfile> = {
  ak47: {
    holster: 0.2,
    draw: 0.3,
    from: { x: 0.02, y: -0.34, z: 0.06 },
    fromRot: { x: -0.5, y: 0.24, z: 0.16 },
    overshoot: 0.5,
    flourish: 'bolt',
    sound: 'rifle',
  },
  m4a1: {
    holster: 0.2,
    draw: 0.3,
    from: { x: 0.02, y: -0.34, z: 0.06 },
    fromRot: { x: -0.46, y: 0.22, z: 0.14 },
    overshoot: 0.5,
    flourish: 'bolt',
    sound: 'rifle',
  },
  awm: {
    holster: 0.26,
    draw: 0.39,
    from: { x: 0.12, y: -0.42, z: 0.1 },
    fromRot: { x: -0.62, y: 0.34, z: 0.38 },
    overshoot: 0.55,
    flourish: 'raise',
    sound: 'sniper',
  },
  shotgun: {
    holster: 0.2,
    draw: 0.3,
    from: { x: 0.02, y: -0.34, z: 0.06 },
    fromRot: { x: -0.44, y: 0.2, z: 0.12 },
    overshoot: 0.5,
    flourish: 'pump',
    sound: 'shotgun',
  },
  usp: {
    holster: 0.16,
    draw: 0.24,
    from: { x: 0.08, y: -0.28, z: 0.05 },
    fromRot: { x: -0.4, y: 0.2, z: 0.2 },
    overshoot: 0.45,
    flourish: 'slide',
    sound: 'pistol',
  },
  knife: {
    holster: 0.16,
    draw: 0.24,
    from: { x: 0.14, y: -0.32, z: 0.08 },
    fromRot: { x: -0.3, y: 0.42, z: 0.5 },
    overshoot: 0.45,
    flourish: 'spin',
    sound: 'knife',
  },
  grenade: {
    holster: 0.16,
    draw: 0.24,
    from: { x: 0.06, y: -0.3, z: 0.04 },
    fromRot: { x: -0.4, y: 0.16, z: 0.1 },
    overshoot: 0.4,
    flourish: 'none',
    sound: 'grenade',
  },
};

/* ============================================================
   第一人称枪模
   ============================================================ */

/**
 * 材质在**第一次建模型时**才创建。
 *
 * 不在模块顶层 `new THREE.MeshStandardMaterial()`：这个文件会被 Next 在服务端
 * 预渲染阶段求值一次，顶层建材质等于给每个请求白造一堆对象（虽然不进 GPU，
 * 但没有任何好处）。惰性建一次，全场共享。
 */
let mats: Record<string, THREE.MeshStandardMaterial> | null = null;

function materials() {
  if (mats) return mats;
  const tex = weaponTextures();

  /**
   * 统一接三张贴图（底色 / 法线 / ORM）。贴图以灰度为主，颜色由 `color` 上，
   * 一张金属贴图就能喂钢、铜、刀身三种配色。
   *
   * 🔴 金属度能提到 0.9 的前提是 **engine 给两个场景都注入了环境贴图**
   * （`scene.environment`）。没有 envMap 时高金属度只会反射到黑色 ——
   * 这就是上一版把 metalness 压在 0.35 的原因。掉在地上的枪（`dropped.ts`）
   * 用的是同一份材质，所以主场景的环境贴图不是可选项。
   *
   * 粗糙度是「标量 × 贴图」：metal 贴图均值约 0.6，所以标量给得比目标值高。
   */
  const pbr = (
    color: number,
    roughness: number,
    metalness: number,
    set: PbrTextureSet | null,
    normalScale = 0.8,
  ): THREE.MeshStandardMaterial => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    if (set) {
      mat.map = set.map;
      mat.normalMap = set.normalMap;
      mat.normalScale = new THREE.Vector2(normalScale, normalScale);
      mat.aoMap = set.ormMap;
      mat.aoMapIntensity = 0.7;
      mat.roughnessMap = set.ormMap;
      mat.metalnessMap = set.ormMap;
    }
    return mat;
  };

  mats = {
    steel: pbr(0x6a7076, 0.78, 0.9, tex.metal),
    steelLite: pbr(0x7d848c, 0.88, 0.85, tex.metal),
    wood: pbr(0x9a6a3c, 1.0, 0, tex.wood),
    polymer: pbr(0x2a2e33, 1.0, 0.05, tex.polymer, 0.9),
    olive: pbr(0x5a6349, 0.95, 0.2, tex.polymer, 0.7),
    brass: pbr(0xc39a45, 0.6, 0.9, tex.metal, 0.6),
    // 镜片：低粗糙 + 环境反射出高光，metalness 留一半压住底色，别成一面镜子
    glass: pbr(0x2f4c5c, 0.1, 0.5, null),
    hand: pbr(0x9c7a5e, 0.9, 0, null),
    // 刀身比枪身亮一档、更光；开刃的反光交给下面的 `edge`
    blade: pbr(0xb8c0c8, 0.5, 0.92, tex.metal, 0.6),
    // 开刃斜面（ExtrudeGeometry 的侧壁材质）：最亮最光的一道，刀刃的高光线
    edge: pbr(0xd0d6dc, 0.22, 0.95, null),
    // 刀柄：深色硬木
    woodDark: pbr(0x4a2f1c, 0.95, 0, tex.wood),
  };
  return mats;
}

function box(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function cyl(
  parent: THREE.Object3D,
  radius: number,
  height: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
  segments = 10,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.x = Math.PI / 2;
  parent.add(mesh);
  return mesh;
}

/** 机匣铆钉：一颗小半球，侧光下的阴影比贴图更像「冲压件」。 */
function rivet(parent: THREE.Object3D, x: number, y: number, z: number, mat: THREE.Material): void {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.0032, 6, 4), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
}

export interface ViewModel {
  group: THREE.Group;
  /** 枪口位置（局部坐标），引擎用它算火光的世界坐标 */
  muzzle: THREE.Object3D;
  /**
   * 可拆卸弹匣（独立子组，静止位姿已摆好）。
   * 换弹时由 `viewmodel.ts` 驱动它「拔出 → 插入」；霰弹枪逐发装填、刀、雷为 null。
   * GLB 枪模是整块网格，没有独立弹匣节点 —— 恒为 null（见下方 GLB 一节的妥协说明）。
   */
  magazine: THREE.Group | null;
  /**
   * 可动画的枪栓（独立子组，静止位姿已摆好）。
   * 拉栓时由 `viewmodel.ts` 驱动它「提栓 → 后拉 → 推回 → 压下」；只有 AWM 有，其余为 null。
   * GLB 路径同样恒为 null。
   */
  bolt: THREE.Group | null;
}

/**
 * 各武器枪口在模型局部坐标里的位置 —— **GLB 与程序化两条路共用这一份**。
 *
 * 引擎的契约（火光世界坐标、`muzzleScreen` 的准星对齐）全挂在这个点上：
 * GLB 归一化时把枪管轴线精确对到这里的 y/z，程序化分支直接用它摆 `muzzle`。
 * 改任何一个数，两条路都要同时验。
 */
const MUZZLE_POS: Record<WeaponId, readonly [number, number, number]> = {
  ak47: [0, 0.018, -0.7],
  m4a1: [0, 0.012, -0.7],
  awm: [0, 0.01, -0.85],
  shotgun: [0, 0.028, -0.74],
  usp: [0, 0.028, -0.32],
  knife: [-0.047, 0.01, -0.295],
  grenade: [0, 0, -0.06],
};

/* ============================================================
   GLB 枪模模板（外部 CC0 模型）
   ============================================================ */

/**
 * 外部枪模。来源：Quaternius「Ultimate Guns Pack」（经 poly.pizza 分发），
 * **CC0 公有领域** —— 可商用、免署名。文件已重命名放进 `public/h5/guns/`，
 * 刀与手雷没有合适的 CC0 模型，**仍走程序化路线**（kukri 的挤出剖面也比低模刀好）。
 *
 * ## 归一化（关键：为什么引擎完全不用改）
 *
 * GLB 原始朝向是「枪口朝 +x、上为 +y」（对五个模型逐顶点实测确认）。加载时：
 *
 *   1. `rotation.y = π/2` 把枪口转到 -z（和程序化枪模同向）
 *   2. 按 `scale` 压到程序化模型的包络长度（AK 1.12m、AWM 1.33m……）
 *   3. 按 `offset` 把**枪管轴线**对齐到 `MUZZLE_POS[id]` 的 y/z
 *
 * 于是枪口火光位置、`muzzleScreen` 的准星对齐、`BASE_POSES` 的持枪位姿
 * 这些引擎契约**原封不动** —— 枪托落点与程序化模型的偏差实测都在毫米级。
 *
 * ## 生命周期（与 `materials()` 同一条铁律）
 *
 * 模板在模块级缓存存一份，`buildWeaponModel` 返回 `clone(true)`：
 * 几何体与材质全场共享，所以 `disposeWeaponModel` 对 GLB 克隆**必须跳过
 * dispose**（打穿模板 = 下次切枪拿到已释放几何体，枪变全黑）。
 *
 * 已知妥协：GLB 是整块网格，没有独立弹匣节点，换弹拔匣在 GLB 路径上退化为
 * 整体动作（`magazine` 传 null，`viewmodel.ts` 对 null 已有兼容分支）。
 * **AWM 拉栓不在此列**：拉机柄是 DarkMetal 网格里一簇可按质心干净切出的
 * 三角形（见 `splitBoltHandle`），加载时切出来装进动画组，原装手柄自己动。
 * USP 本体不带消音器 → 程序化 `attachSuppressor` 附加件补上。
 */
interface GlbGunConfig {
  /** public 下的资源路径 */
  file: string;
  /** 统一缩放：GLB 原始包围盒压到程序化模型的包络长度 */
  scale: number;
  /** 内层偏移：把枪管轴线对齐到 `MUZZLE_POS[id]`（实测值，见上方说明） */
  offset: [number, number, number];
}

const GLB_GUNS: Partial<Record<WeaponId, GlbGunConfig>> = {
  ak47: { file: '/h5/guns/ak47.glb', scale: 0.2066, offset: [0, -0.1148, 0.0885] },
  m4a1: { file: '/h5/guns/m4a1.glb', scale: 0.2196, offset: [0, -0.1279, 0.0926] },
  awm: { file: '/h5/guns/awm.glb', scale: 0.1823, offset: [0, -0.0465, 0.1073] },
  shotgun: { file: '/h5/guns/shotgun.glb', scale: 0.2066, offset: [0, -0.0126, 0.1501] },
  usp: { file: '/h5/guns/usp.glb', scale: 0.1237, offset: [0, -0.0409, 0.0646] },
};

const glbTemplates = new Map<WeaponId, THREE.Group>();
const glbJobs = new Map<WeaponId, Promise<boolean>>();

/**
 * GLB 材质按名字挂上 Canvas PBR 贴图（法线 + 粗糙度 + AO）。
 *
 * Quaternius 模型全是无贴图的顶点色材质 —— 轮廓是真枪的，表面却是塑料。
 * 名字里带 wood / metal / glass 的按语义分派，其余一律当聚合物处理；
 * 底色保留 GLB 原色（贴图是灰度，只在上面叠纹理）。
 * **不挂 metalnessMap**：ORM 的 B 通道恒为 1，会把聚合物也变金属。
 */
function tuneGlbMaterial(src: THREE.MeshStandardMaterial, tex: WeaponTextureLibrary): THREE.MeshStandardMaterial {
  const name = src.name.toLowerCase();
  const mat = new THREE.MeshStandardMaterial({ color: src.color.clone() });
  mat.aoMapIntensity = 0.7;
  if (name.includes('glass')) {
    // 镜片：低粗糙 + 环境反射出高光（与程序化 m.glass 同参）
    mat.roughness = 0.12;
    mat.metalness = 0.5;
    return mat;
  }
  const set = name.includes('wood') ? tex.wood : name.includes('metal') ? tex.metal : tex.polymer;
  mat.map = set.map;
  mat.normalMap = set.normalMap;
  mat.normalScale = new THREE.Vector2(0.8, 0.8);
  mat.roughnessMap = set.ormMap;
  mat.aoMap = set.ormMap;
  mat.roughness = name.includes('metal') ? 0.78 : 1;
  mat.metalness = name.includes('metal') ? 0.9 : name.includes('wood') ? 0 : 0.08;
  return mat;
}

/**
 * 三平面投射生成 UV。Quaternius 的 GLB 大多不带 TEXCOORD（没有贴图就不导出），
 * 而我们的噪声 / 划痕贴图必须有 UV 才能采样。按法线主导轴把局部坐标投影出去，
 * 对噪声类贴图完全够用，还省去了逐部件展 UV 的功夫。
 */
function generateUv(geometry: THREE.BufferGeometry): void {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  if (!pos || !nor) return;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    let u: number;
    let v: number;
    if (nx >= ny && nx >= nz) {
      u = z;
      v = y;
    } else if (ny >= nz) {
      u = x;
      v = z;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u * 8;
    uv[i * 2 + 1] = v * 8;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/* ---------- AWM 拉机柄切分（GLB 拉栓动画的前提） ---------- */

/** 拉栓动画组挂到克隆体上后用名字找回来（`clone(true)` 保留 name） */
const AWM_BOLT_NAME = 'awm_bolt';

/**
 * 拉机柄的质心判定区域（**归一化坐标**，对 `awm.glb` 逐三角形实测得出）。
 *
 * GLB 的拉机柄是 DarkMetal 网格里一小簇 42 个三角形（x 0.021~0.055、
 * z 0.053~0.063、轴线下方），与机匣壁（质心 x ≤ 0.013）之间有干净的空隙，
 * 按质心切一刀不会伤到机匣 —— 切出来的手柄装进动画组，原装件自己动，
 * 比另造一个程序化手柄盖上去少一层「双拉机柄」的破绽。
 */
const BOLT_REGION = { xMin: 0.017, yMax: 0.002, zMin: 0.045, zMax: 0.075 };

/**
 * 从 GLB 网格中切出拉机柄，返回烘到归一化坐标的手柄几何体；
 * 原网格的索引同步剔除手柄三角形（几何体数组共享，只有索引分家）。
 * 找不到手柄（结构不符预期 / 非索引网格）返回 null，调用方静默跳过 ——
 * 宁可没有拉栓动画，也不能把机匣撕个洞。
 */
function splitBoltHandle(mesh: THREE.Mesh): THREE.BufferGeometry | null {
  const geo = mesh.geometry;
  const index = geo.getIndex();
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  if (!index || !pos || !nor) return null;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  const boltIdx: number[] = [];
  const keepIdx: number[] = [];
  for (let t = 0; t < index.count; t += 3) {
    const ia = index.getX(t);
    const ib = index.getX(t + 1);
    const ic = index.getX(t + 2);
    a.fromBufferAttribute(pos, ia);
    b.fromBufferAttribute(pos, ib);
    c.fromBufferAttribute(pos, ic);
    centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    // matrixWorld = raw → 归一化坐标的完整链（节点 ×100 / -90°X + 外层摆位）
    mesh.localToWorld(centroid);
    const hit =
      centroid.x > BOLT_REGION.xMin &&
      centroid.y < BOLT_REGION.yMax &&
      centroid.z > BOLT_REGION.zMin &&
      centroid.z < BOLT_REGION.zMax;
    (hit ? boltIdx : keepIdx).push(ia, ib, ic);
  }
  // 两边都得有货：全判成手柄说明区域写错了，此时绝不能动原网格
  if (boltIdx.length === 0 || keepIdx.length === 0) return null;

  const handleGeo = new THREE.BufferGeometry();
  // position / normal **必须克隆**：applyMatrix4 是原地变换属性数组，共享的话
  // 烘矩阵会把原网格的顶点一起烘掉 —— 原网格对象树上还挂着同一条 ×18 的
  // 变换链，等于被双重变换，整个枪身金属件直接糊到镜头上。uv 无变换，可共享。
  handleGeo.setAttribute('position', pos.clone());
  handleGeo.setAttribute('normal', nor.clone());
  const uv = geo.getAttribute('uv');
  if (uv) handleGeo.setAttribute('uv', uv);
  handleGeo.setIndex(boltIdx);
  handleGeo.applyMatrix4(mesh.matrixWorld); // 烘死变换，动画组直接挂最终坐标

  geo.setIndex(keepIdx); // 原网格只剩机匣部分
  return handleGeo;
}

async function loadGlbWeapon(id: WeaponId, config: GlbGunConfig): Promise<boolean> {
  try {
    const res = await fetch(config.file);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    const loader = new GLTFLoader();
    const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
      loader.parse(buffer, '', resolve, reject);
    });

    const inner = gltf.scene;
    inner.rotation.y = Math.PI / 2; // 枪口 +x → -z（实测五把枪枪口都在 +x）
    inner.scale.setScalar(config.scale);
    inner.position.set(...config.offset);

    const tex = weaponTextures();
    const tuned = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    inner.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      mesh.frustumCulled = false; // 枪永远在视野里（与程序化枪模同一策略）
      generateUv(mesh.geometry);
      const src = mesh.material as THREE.MeshStandardMaterial;
      let mat = tuned.get(src);
      if (!mat) {
        mat = tuneGlbMaterial(src, tex);
        tuned.set(src, mat);
      }
      mesh.material = mat;
    });

    const root = new THREE.Group();
    root.userData.shared = true; // disposeWeaponModel 见此跳过 dispose
    root.add(inner);

    // AWM：切出拉机柄装进动画组（viewmodel 的拉栓动画合同见 ViewModel.bolt）。
    // 组挂在 **root**（最终坐标）而不是 inner —— inner 带 0.18 缩放，会把
    // position.z 的 0.085 拉栓行程也缩掉。轴心 = 枪管轴线（提栓绕轴转 66°）。
    if (id === 'awm') {
      root.updateMatrixWorld(true); // localToWorld / matrixWorld 需要
      inner.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const handleGeo = splitBoltHandle(mesh);
        if (!handleGeo) return;
        const boltGroup = new THREE.Group();
        boltGroup.name = AWM_BOLT_NAME;
        boltGroup.position.set(0, MUZZLE_POS.awm[1], 0);
        const handle = new THREE.Mesh(handleGeo, mesh.material);
        handle.position.set(0, -MUZZLE_POS.awm[1], 0); // 静止位姿与原位重合
        handle.frustumCulled = false;
        boltGroup.add(handle);
        root.add(boltGroup);
      });
    }

    glbTemplates.set(id, root);
    return true;
  } catch {
    // 加载失败**永久**回退程序化模型，不重试：本地静态资源都拉不到说明
    // 环境有问题，重试只会每次进图都闪一下兜底模型
    return false;
  }
}

/**
 * 预载全部 GLB 枪模（幂等：并发调用共享同一个任务）。在 viewmodel 层开局时调用。
 *
 * `onProgress` 是给**载入页的进度条**用的：五把枪各自 50~130KB，逐个回一个
 * `(已完成, 总数)`。计数器是**每次调用独立**的 —— 任务本身被 `glbJobs` 共享，
 * 但「等的人」可能不止一个（引擎构造时先起一次，载入页紧接着再等一次），
 * 共用同一个计数器会出现「第二次调用一上来就 5/5」。
 */
export function preloadWeaponGlbs(
  onProgress?: (done: number, total: number) => void,
): Promise<boolean[]> {
  const jobs: Promise<boolean>[] = [];
  for (const [id, config] of Object.entries(GLB_GUNS) as [WeaponId, GlbGunConfig][]) {
    let job = glbJobs.get(id);
    if (!job) {
      job = loadGlbWeapon(id, config);
      glbJobs.set(id, job);
    }
    jobs.push(job);
  }

  if (!onProgress) return Promise.all(jobs);

  let done = 0;
  onProgress(0, jobs.length);
  return Promise.all(
    jobs.map((job) =>
      job.then((ok) => {
        done += 1;
        onProgress(done, jobs.length);
        return ok;
      }),
    ),
  );
}

/** 这把枪的 GLB 模板是否已就绪（供 viewmodel 层决定要不要热替换） */
export function hasGlbTemplate(id: WeaponId): boolean {
  return glbTemplates.has(id);
}

/** 从模板克隆一把 GLB 枪。几何体与材质共享模板，dispose 侧跳过 */
function cloneGlbViewModel(id: WeaponId, template: THREE.Group, m: Record<string, THREE.MeshStandardMaterial>): ViewModel {
  const group = template.clone(true);
  if (id === 'usp') attachSuppressor(group, m); // GLB 本体不带消音器
  const muzzle = new THREE.Object3D();
  muzzle.position.set(...MUZZLE_POS[id]);
  group.add(muzzle);
  // AWM：模板里预切好的拉机柄动画组（loadGlbWeapon 内 splitBoltHandle 产物）；
  // 切分失败 / 结构不符时为 undefined → 退回整体动作的兜底分支
  const bolt = id === 'awm' ? (group.getObjectByName(AWM_BOLT_NAME) as THREE.Group | undefined) : undefined;
  return { group, muzzle, magazine: null, bolt: bolt ?? null };
}

/* ---------- 尼泊尔军刀（kukri）---------- */

/** 刀身长度（米）。真实 kukri 大约 30~35cm，取中间值。 */
const KUKRI_BLADE = 0.3;

/**
 * 按廓尔喀弯刀（kukri）的**公开廓形**程序化建一把刀身。
 *
 * ⚠️ **版权红线**：这里没有、也不允许使用任何商业游戏里的模型文件。下面是
 * 一条二维闭合曲线 + `ExtrudeGeometry` 挤出来的，纯几何，无外部资源。
 *
 * ## kukri 的三个识别特征（缺一个就不像了）
 *
 *   ① **前宽后窄**：刀刃在靠近刀尖处鼓到最宽（刀腹），往刀根方向收细
 *   ② **内弯刀刃**：刀腹之前有一小段凹进去的「腰」，这是 kukri 的灵魂
 *   ③ **刀背几乎是一条直线**，只在刀尖处微微上翘
 *
 * 曲线定义在 XY 平面：x = 从刀根指向刀尖，y = 从刀背指向刀刃（**刀刃在 +y 侧**）。
 * 这个「刀刃朝 +y」的约定和下面的外层旋转配套 —— 内层绕刀身轴转 180° 后，+y
 * 恰好朝下，于是刀尖朝前、刀刃朝下（刺击握法）。
 */
function buildKukriBlade(parent: THREE.Object3D, mat: THREE.Material, edgeMat: THREE.Material): void {
  const L = KUKRI_BLADE;
  const shape = new THREE.Shape();

  shape.moveTo(0, 0);
  // 刀背：一条微微上翘的直线（控制点压到 -0.008 让它略呈反曲）
  shape.quadraticCurveTo(L * 0.55, -0.008, L, 0.014);
  // 刀刃，从刀尖往回走：
  shape.quadraticCurveTo(L * 0.97, 0.05, L * 0.82, 0.064); // ① 刀尖前的刀腹，最宽
  shape.quadraticCurveTo(L * 0.58, 0.058, L * 0.38, 0.03); // ② 收腰 —— 内弯就在这一段
  shape.quadraticCurveTo(L * 0.18, 0.013, 0, 0.026); // ③ 刀根略微放开，接护手
  shape.lineTo(0, 0);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.008,
    // 一点点倒角：低模刀身如果是一块纯平板，边缘在侧光下会显得像纸片
    bevelEnabled: true,
    bevelThickness: 0.0011,
    bevelSize: 0.0014,
    bevelSegments: 1,
    curveSegments: 7,
  });
  // ExtrudeGeometry 从 z=0 挤到 z=depth，挪一半让厚度居中
  geometry.translate(0, 0, -0.004);

  // 材质数组：0 = 正反刀面，1 = 侧壁与倒角。开刃斜面用更亮更光的 `edge`，
  // 侧光一开枪刃上就是一道高光线，比换贴图便宜得多
  const blade = new THREE.Mesh(geometry, [mat, edgeMat]);
  // 往护手方向压 2mm：刀根和护手要有一点点重叠，纯对接会露出一条缝
  blade.position.x = -0.002;
  parent.add(blade);
}

/**
 * USP 的消音器（**程序化附加件**）：GLB 本体不带消音器，两条路都挂这一份，
 * 保证「带消音的 USP」这个形象在两种模型来源下完全一致。
 * 桥接段（螺纹枪管）从滑套前口一直铺到消音器后端，中间不留悬空缝。
 */
function attachSuppressor(parent: THREE.Object3D, m: Record<string, THREE.MeshStandardMaterial>): void {
  cyl(parent, 0.016, 0.1, 0, 0.028, -0.14, m.steelLite, 12); // 螺纹枪管桥
  cyl(parent, 0.022, 0.12, 0, 0.028, -0.24, m.steel, 18); // 消音器筒
  cyl(parent, 0.023, 0.006, 0, 0.028, -0.297, m.steelLite, 18); // 端盖
  cyl(parent, 0.008, 0.002, 0, 0.028, -0.301, m.polymer, 12); // 前口
  // 三道滚花环：光筒消音器在侧光下就是根水管，滚花才有「拧上去的」质感
  for (let i = 0; i < 3; i += 1) {
    cyl(parent, 0.0225, 0.005, 0, 0.028, -0.21 + i * 0.028, m.steelLite, 18);
  }
}

/**
 * 拼一把枪。**模型朝 -z**（和相机的前向一致），原点在握把附近。
 *
 * **优先走 GLB 模板**（见下方 GLB 一节）：模板就绪就克隆外部模型返回；
 * 未就绪 / 加载失败时用下面的程序化拼装兜底 —— 所以这条老路必须一直活着。
 *
 * 程序化路全部用 Box / Cylinder 拼 —— 没有 glTF、没有外部资源、没有版权问题。
 * 低模 FPS 枪械用几何体拼装的观感并不差，而且尺寸能精确对齐准星。
 *
 * ⚠️ **军刀是唯一的例外**：它不走「朝 -z」这套外层摆位，而是建在自己的 `arm`
 * 子组里、已经摆成**刺击握法**（刀尖朝 -z 正前方、刀刃朝下）。原因见 `knife`
 * 分支的注释。
 */
export function buildWeaponModel(id: WeaponId): ViewModel {
  const m = materials();

  // GLB 模板就绪 → 外部模型。没有模板时走程序化兜底，之后由 viewmodel 层热替换
  const template = glbTemplates.get(id);
  if (template) return cloneGlbViewModel(id, template, m);

  const group = new THREE.Group();
  const muzzle = new THREE.Object3D();
  let magazine: THREE.Group | null = null;
  let bolt: THREE.Group | null = null;

  /** 弹匣独立成组：换弹动画只挪这个组，枪身不动。调用一次即登记到 `magazine` */
  const magGroup = (): THREE.Group => {
    const g = new THREE.Group();
    group.add(g);
    magazine = g;
    return g;
  };

  if (id === 'ak47') {
    box(group, 0.075, 0.1, 0.34, 0, 0, 0, m.steel); // 机匣
    box(group, 0.05, 0.055, 0.4, 0, 0.012, -0.35, m.wood); // 下护木（木质）
    cyl(group, 0.016, 0.34, 0, 0.018, -0.52, m.steel); // 枪管
    box(group, 0.058, 0.075, 0.2, 0, -0.005, -0.28, m.wood); // 上护木
    cyl(group, 0.008, 0.3, 0, 0.052, -0.42, m.steelLite); // 导气管
    // 弯曲弹匣：三段盒逐段前倾，AK 的第一识别点
    const mag = magGroup();
    box(mag, 0.05, 0.07, 0.082, 0, -0.075, 0.008, m.steelLite).rotation.x = 0.12;
    box(mag, 0.048, 0.07, 0.08, 0, -0.135, 0.026, m.steelLite).rotation.x = 0.38;
    box(mag, 0.046, 0.06, 0.076, 0, -0.19, 0.052, m.steelLite).rotation.x = 0.62;
    box(mag, 0.05, 0.008, 0.08, 0, -0.218, 0.066, m.steel).rotation.x = 0.62; // 底板
    box(group, 0.045, 0.1, 0.05, 0, -0.09, 0.1, m.polymer); // 握把
    box(group, 0.05, 0.075, 0.24, 0, -0.015, 0.29, m.wood); // 枪托
    box(group, 0.052, 0.08, 0.015, 0, -0.015, 0.415, m.polymer); // 托垫
    // 准星 + 护圈（两立柱一顶梁），AK 的第二识别点
    box(group, 0.012, 0.05, 0.012, 0, 0.075, -0.44, m.steel);
    box(group, 0.004, 0.055, 0.006, -0.014, 0.072, -0.44, m.steel);
    box(group, 0.004, 0.055, 0.006, 0.014, 0.072, -0.44, m.steel);
    box(group, 0.032, 0.005, 0.006, 0, 0.1, -0.44, m.steel);
    box(group, 0.03, 0.02, 0.03, 0, 0.06, 0.13, m.steel); // 照门
    // 机匣铆钉：侧光下这排小凸点比贴图更像冲压机匣
    for (const side of [-1, 1]) {
      for (const [ry, rz] of [[0.025, -0.12], [-0.025, -0.04], [0.02, 0.1]] as const) {
        rivet(group, side * 0.038, ry, rz, m.steelLite);
      }
    }
    // 拉机柄（右侧）
    cyl(group, 0.006, 0.03, 0.05, 0.02, 0.05, m.steelLite).rotation.set(0, 0, Math.PI / 2);
    box(group, 0.02, 0.012, 0.014, 0.062, 0.02, 0.05, m.steelLite);
    // 斜切防跳器：短粗筒 + 一片斜面，枪口不再是一根光杆
    cyl(group, 0.02, 0.055, 0, 0.02, -0.672, m.steel);
    box(group, 0.04, 0.006, 0.05, 0, 0.042, -0.672, m.steelLite).rotation.x = -0.5;
    muzzle.position.set(...MUZZLE_POS[id]);
  } else if (id === 'm4a1') {
    box(group, 0.07, 0.095, 0.36, 0, 0, 0, m.steel);
    box(group, 0.052, 0.052, 0.3, 0, 0.008, -0.32, m.steelLite);
    cyl(group, 0.013, 0.34, 0, 0.012, -0.52, m.steel);
    box(group, 0.055, 0.07, 0.18, 0, -0.002, -0.26, m.polymer);
    // 直弹匣（和 AK 的弯匣相对）+ 底板
    const mag = magGroup();
    box(mag, 0.048, 0.17, 0.08, 0, -0.115, 0.02, m.steelLite).rotation.x = 0.02;
    box(mag, 0.052, 0.008, 0.084, 0, -0.198, 0.022, m.polymer);
    box(group, 0.045, 0.1, 0.05, 0, -0.085, 0.1, m.polymer);
    // 伸缩枪托：托芯 + 托体 + 托垫三段，不再是一整块铁
    cyl(group, 0.014, 0.16, 0, 0.005, 0.24, m.steelLite);
    box(group, 0.05, 0.075, 0.14, 0, -0.005, 0.36, m.polymer);
    box(group, 0.052, 0.08, 0.012, 0, -0.005, 0.435, m.polymer);
    // 皮卡汀尼导轨：一根扁条 + 等距横档
    box(group, 0.024, 0.006, 0.34, 0, 0.052, 0, m.steelLite);
    for (let i = 0; i < 8; i += 1) {
      box(group, 0.028, 0.005, 0.01, 0, 0.057, -0.14 + i * 0.04, m.steelLite);
    }
    box(group, 0.02, 0.03, 0.22, 0, 0.062, -0.1, m.steel); // 提把
    box(group, 0.012, 0.045, 0.012, 0, 0.06, -0.44, m.steel); // 准星
    // 鸟笼消焰器：粗筒 + 前环 + 四条开槽
    cyl(group, 0.017, 0.06, 0, 0.012, -0.665, m.steel);
    cyl(group, 0.018, 0.008, 0, 0.012, -0.69, m.steelLite);
    for (const side of [-1, 1]) {
      box(group, 0.002, 0.006, 0.045, side * 0.016, 0.012, -0.66, m.polymer);
      box(group, 0.006, 0.002, 0.045, 0, 0.012 + side * 0.016, -0.66, m.polymer);
    }
    box(group, 0.002, 0.018, 0.05, 0.036, 0.01, 0.02, m.polymer); // 抛壳窗
    box(group, 0.05, 0.008, 0.02, 0, 0.045, 0.175, m.steelLite); // 拉机柄
    muzzle.position.set(...MUZZLE_POS[id]);
  } else if (id === 'awm') {
    box(group, 0.07, 0.09, 0.4, 0, 0, 0, m.olive);
    cyl(group, 0.014, 0.62, 0, 0.01, -0.52, m.steel);
    box(group, 0.05, 0.05, 0.1, 0, 0.012, -0.24, m.olive);
    // 瞄准镜：镜筒 + 物镜/目镜镜片（环境反射出高光）+ 调节旋钮 + 镜架
    cyl(group, 0.032, 0.26, 0, 0.085, -0.02, m.steel, 12);
    cyl(group, 0.042, 0.05, 0, 0.085, -0.16, m.steel, 12);
    cyl(group, 0.042, 0.05, 0, 0.085, 0.12, m.steel, 12);
    cyl(group, 0.036, 0.012, 0, 0.085, 0.145, m.glass, 12); // 目镜镜片
    cyl(group, 0.038, 0.008, 0, 0.085, -0.182, m.glass, 12); // 物镜镜片
    cyl(group, 0.014, 0.02, 0, 0.125, -0.02, m.steelLite).rotation.set(0, 0, 0); // 顶旋钮（朝上）
    cyl(group, 0.012, 0.02, 0.045, 0.085, -0.02, m.steelLite).rotation.set(0, 0, Math.PI / 2); // 侧旋钮
    box(group, 0.02, 0.03, 0.02, 0, 0.05, -0.1, m.steel); // 镜架前
    box(group, 0.02, 0.03, 0.02, 0, 0.05, 0.06, m.steel); // 镜架后
    // 枪栓：独立成组，拉栓动画只动这个组（提栓 → 后拉 → 推回 → 压下）
    const boltGroup = new THREE.Group();
    group.add(boltGroup);
    bolt = boltGroup;
    box(boltGroup, 0.012, 0.012, 0.09, 0.05, 0.02, 0.06, m.steel);
    box(boltGroup, 0.035, 0.035, 0.035, 0.085, 0.02, 0.06, m.steel);
    // 枪托 + 贴腮板 + 托垫
    box(group, 0.055, 0.09, 0.3, 0, -0.012, 0.32, m.olive);
    box(group, 0.05, 0.05, 0.16, 0, 0.045, 0.3, m.olive);
    box(group, 0.057, 0.095, 0.014, 0, -0.012, 0.475, m.polymer);
    box(group, 0.045, 0.1, 0.05, 0, -0.085, 0.1, m.polymer);
    const mag = magGroup();
    box(mag, 0.05, 0.1, 0.07, 0, -0.075, -0.04, m.steel).rotation.x = 0.1;
    box(mag, 0.054, 0.008, 0.074, 0, -0.123, -0.035, m.polymer).rotation.x = 0.1;
    // 制退器：粗筒 + 两侧排气孔 + 黑色前口
    cyl(group, 0.024, 0.09, 0, 0.01, -0.8, m.steel, 12);
    for (const side of [-1, 1]) {
      box(group, 0.002, 0.014, 0.02, side * 0.024, 0.01, -0.785, m.polymer);
      box(group, 0.002, 0.014, 0.02, side * 0.024, 0.01, -0.815, m.polymer);
    }
    cyl(group, 0.016, 0.004, 0, 0.01, -0.846, m.polymer, 12);
    // 两脚架：斜撑 + 连接横杆
    box(group, 0.008, 0.008, 0.14, -0.035, -0.06, -0.62, m.steel).rotation.x = 0.6;
    box(group, 0.008, 0.008, 0.14, 0.035, -0.06, -0.62, m.steel).rotation.x = 0.6;
    box(group, 0.08, 0.008, 0.008, 0, -0.045, -0.58, m.steel);
    muzzle.position.set(...MUZZLE_POS[id]);
  } else if (id === 'shotgun') {
    box(group, 0.075, 0.1, 0.3, 0, 0, 0, m.steel);
    cyl(group, 0.024, 0.6, 0, 0.028, -0.42, m.steel);
    cyl(group, 0.02, 0.44, 0, -0.018, -0.36, m.steelLite); // 管状弹仓
    cyl(group, 0.022, 0.02, 0, -0.018, -0.585, m.steel); // 弹仓帽
    box(group, 0.06, 0.055, 0.16, 0, -0.01, -0.34, m.wood); // 泵动护木
    // 护木防滑肋：比护木大一圈的等距木环
    for (let i = 0; i < 5; i += 1) {
      box(group, 0.064, 0.06, 0.008, 0, -0.01, -0.395 + i * 0.028, m.woodDark);
    }
    box(group, 0.008, 0.008, 0.5, 0, 0.056, -0.42, m.steelLite); // 枪管顶散热肋
    box(group, 0.05, 0.09, 0.3, 0, -0.02, 0.3, m.wood);
    box(group, 0.052, 0.095, 0.014, 0, -0.02, 0.455, m.polymer); // 托垫
    box(group, 0.045, 0.09, 0.05, 0, -0.075, 0.11, m.wood);
    box(group, 0.012, 0.03, 0.012, 0, 0.062, -0.66, m.brass);
    box(group, 0.002, 0.02, 0.06, 0.038, 0.01, -0.02, m.polymer); // 抛壳窗
    muzzle.position.set(...MUZZLE_POS[id]);
  } else if (id === 'usp') {
    box(group, 0.048, 0.075, 0.2, 0, 0.02, 0, m.steel); // 套筒
    // 套筒后部防滑纹：两侧各五条细槽
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i += 1) {
        box(group, 0.002, 0.05, 0.004, side * 0.025, 0.025, 0.045 + i * 0.009, m.polymer);
      }
    }
    box(group, 0.01, 0.025, 0.012, 0, 0.05, 0.105, m.steelLite).rotation.x = -0.3; // 击锤
    box(group, 0.02, 0.012, 0.01, 0, 0.062, 0.085, m.steelLite); // 照门
    const grip = box(group, 0.042, 0.13, 0.06, 0, -0.075, 0.06, m.polymer);
    grip.rotation.x = -0.18;
    const mag = magGroup();
    box(mag, 0.03, 0.1, 0.045, 0, -0.07, 0.06, m.steelLite).rotation.x = -0.18;
    box(mag, 0.034, 0.008, 0.05, 0, -0.122, 0.07, m.polymer).rotation.x = -0.18; // 底板
    // 弹匣释放钮（左侧）
    cyl(group, 0.006, 0.006, -0.024, -0.02, 0.05, m.steelLite).rotation.set(0, 0, Math.PI / 2);
    // 扳机护圈 + 扳机
    box(group, 0.006, 0.035, 0.006, 0, -0.045, -0.055, m.steelLite);
    box(group, 0.006, 0.006, 0.075, 0, -0.062, -0.015, m.steelLite);
    box(group, 0.004, 0.02, 0.006, 0, -0.04, 0.005, m.steel).rotation.x = 0.2;
    box(group, 0.008, 0.022, 0.008, 0, 0.062, -0.12, m.steel); // 准星
    attachSuppressor(group, m);
    muzzle.position.set(...MUZZLE_POS[id]);
  } else if (id === 'knife') {
    // 尼泊尔军刀（kukri）。
    //
    // ⚠️ 朝向和枪**不一样**：刀是**刺击握法** —— 刀尖朝 -z（视线正前方）、刀刃
    // 朝下，攻击时沿视线直刺。它建在自己的 `arm` 子组里，外层 `group` 的旋转
    // 留空给动画用（切枪 / 刺击 / 转刀全都改 `group`，不会和这里的固定姿态打架）。
    const arm = new THREE.Group();
    // 内层先绕刀身轴（x）把刀刃滚到朝下：刀刃约定在 +y 侧（见 buildKukriBlade），
    // 绕 x 转 180° 后 +y → -y。「刀尖朝前 + 刀刃朝下」就是正握刺击的握法
    const bladeRoll = new THREE.Group();
    bladeRoll.rotation.x = Math.PI;
    arm.add(bladeRoll);

    buildKukriBlade(bladeRoll, m.blade, m.edge);

    // 刀柄：深色木质，往柄尾略粗。整条刀柄接在刀背那条线上（截面对称，
    // 跟着内层翻转不可见）
    box(bladeRoll, 0.145, 0.03, 0.034, -0.086, 0.002, 0, m.woodDark);
    box(bladeRoll, 0.022, 0.04, 0.042, -0.164, 0.004, 0, m.brass); // 柄尾
    box(bladeRoll, 0.014, 0.056, 0.048, -0.01, 0.001, 0, m.brass); // 护手
    // 四道缠绳：等距的明暗差让刀柄有「缠出来」的触感，不是一根光木头
    for (const x of [-0.04, -0.068, -0.096, -0.124]) {
      box(bladeRoll, 0.01, 0.034, 0.038, x, 0.002, 0, m.polymer);
    }

    // 外层姿态：先绕 y 转 ~96°，把「刀尖沿 +x」转到「刀尖朝 -z 正前方」，
    // 少转的那 9° 让刀尖微微偏向屏幕中线（右下持刀，尖往准星方向带）；
    // 再绕 x 抬 6°，待机时刀尖微微上翘
    arm.rotation.set(0.1, Math.PI / 2 + 0.16, 0);
    group.add(arm);

    // 近战没有枪口火光，这个点只作为「刀尖」的语义占位（`group` 空间）——
    // 刀尖现在指向 -z，位置是 arm 姿态变换后刀尖的落点
    muzzle.position.set(...MUZZLE_POS[id]);
  } else {
    // 手雷：一颗弹体 + 保险片 + 保险环 + 一只握着它的手
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), m.olive);
    body.position.set(0, 0, -0.02);
    body.scale.set(1, 1.15, 1);
    group.add(body);
    // 上下半壳的接缝：一道细环，光面雷体靠它分出层次
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.0455, 0.0018, 6, 24), m.polymer);
    seam.position.set(0, 0, -0.02);
    seam.rotation.x = Math.PI / 2;
    group.add(seam);
    box(group, 0.03, 0.03, 0.012, 0, 0.06, -0.02, m.steel); // 引信座
    box(group, 0.008, 0.05, 0.008, 0.022, 0.085, -0.02, m.brass); // 保险销
    // 保险片（握片）：贴雷体侧面的长钢片
    box(group, 0.012, 0.085, 0.006, 0.032, 0.03, -0.02, m.steelLite).rotation.z = -0.12;
    // 保险环：挂在保险销上的金属小圈
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0022, 6, 18), m.steelLite);
    ring.position.set(0.024, 0.104, -0.02);
    group.add(ring);
    box(group, 0.055, 0.075, 0.055, 0.01, -0.05, 0.03, m.hand);
    muzzle.position.set(...MUZZLE_POS[id]);
  }

  group.add(muzzle);
  return { group, muzzle, magazine, bolt };
}

/** 释放一把枪模的几何体（材质是共享的，不能 dispose）。 */
export function disposeWeaponModel(model: ViewModel): void {
  // GLB 模板克隆（userData.shared）：几何体与材质和模块级模板共享，
  // dispose 会把模板打穿 —— 下次切枪拿到已释放几何体，枪变全黑。
  // 与 materials() 缓存「不能清」是同一条铁律。
  if (model.group.userData.shared === true) return;
  model.group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
}
