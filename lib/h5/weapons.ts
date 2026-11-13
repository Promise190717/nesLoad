import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { TEAM_CLOTH, surfaceMaps } from './surface-textures';
import type { PrimaryId, SlotId, WeaponId } from './types';
import { type PbrTextureSet, weaponTextures } from './weapon-textures';

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
 * ## 落点 = 视角后坐（可压）+ 随机锥（不可压）
 *
 * 和 CSGO 同构：`recoil.up` 每发把**视角**顶上去，玩家必须反向拖鼠标压枪；
 * `spread` 只是在被顶歪的视线之上再撒一层随机。想让一把枪「连发更难」先调
 * `recoil.up` / `recover`，只堆 `spread` 会变成打不中也没法练的玄学。
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
  /** 连发随机锥的上限。移动惩罚在这个上限**之外**叠加，见 `currentSpread()` */
  max: number;
  /** 满速移动时额外增加的散布 */
  move: number;
  /** 空中的散布倍率 */
  air: number;
}

export interface RecoilSpec {
  /** 每发抬起的角度（度）—— 直接加到 `aimPitch` 上，玩家必须反向压枪 */
  up: number;
  /** 每发横向抖动的最大角度（度） */
  side: number;
  /** 回正速度（指数逼近系数，越小回得越慢）。`Player.applyRecoil` 读它 */
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

/**
 * 武器的**机动性**规格 —— 拿着它时移动多快、跳多高。
 *
 * 沿用 CS 的手感分层：越重的武器越拖腿。倍率乘在基础速度（跑 / 走）和起跳
 * 速度上 —— 起跳速度同时决定跳高与跳远，所以「跳跃距离」不用单独一个字段。
 *
 *   刀       —— 空手跑刀最快，是换武器跑图的收益
 *   手枪     —— 单手轻携，略快
 *   步枪     —— 基准（1.0）
 *   霰弹     —— 泵动长枪，略沉
 *   AWM      —— 全表最重：拿着它就别指望当突击手用
 *   手雷     —— 捏着雷和拿刀差不多轻（快扔的战术价值就靠这点机动性）
 */
export interface MobilitySpec {
  /** 移动速度倍率。乘在 `SPEED_RUN` / `SPEED_WALK` 上（开镜 / 换弹惩罚另行叠加） */
  speed: number;
  /** 起跳速度倍率。乘在 `JUMP_SPEED` 上 */
  jump: number;
}

/** 没配 `mobility` 的武器走这一份 —— 步枪就是基准，行为与以前完全一致 */
export const DEFAULT_MOBILITY: MobilitySpec = { speed: 1, jump: 1 };

/** 取一把武器的机动性。集中取值，调用方不用处理 `undefined`（与 `weaponFeel` 同构） */
export function weaponMobility(id: WeaponId): MobilitySpec {
  return WEAPONS[id].mobility ?? DEFAULT_MOBILITY;
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
  /**
   * 机动性（移动速度 / 起跳速度倍率）。不填 = 步枪基准 `{1, 1}`。
   * 玩家的 `applyMovement`、跳跃和加入者的本地预跳都读它 —— 三条路同一张表。
   */
  mobility?: MobilitySpec;
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

/**
 * 步枪 / 手枪的散布配置。参数顺序：基准、每发累积、上限、满速移动惩罚。
 *
 * 🔴 `max` 只管**连发随机锥**：`currentSpread()` 里移动惩罚是在它之外加法叠加的，
 * 不会被连发上限吃掉。所以这三个数可以各自独立调 —— 想让跑打更废只动 move。
 * 反过来说，如果你把 move 调到比 max 还大也不要紧，那是 CSGO 的常态（移动散布
 * 本来就该远大于连发散布）。
 */
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
    damage: 28,
    headMul: 4,
    interval: 0.1,
    magazine: 30,
    reserve: 90,
    auto: true,
    reload: 2.5,
    perShell: false,
    pellets: 1,
    // 2026-11-13 第五次调（用户：「参考 CSGO 的落点算法，还是太准」「连发时视角要动、
    // 要靠鼠标压枪」）。上一版把随机锥抬到 0.13 是错的方向 —— CSGO 扫射的随机锥其实
    // 很小（散布大头是**视角被顶上去**，可压），抬随机锥只会变成玄学。
    // 现在分工：随机锥 0.055（3.1°，泼水时也确实打不满）+ 后坐 up 2.7。
    // 2026-11-13 第六次调：用户「抬升幅度太小、压枪太容易」。up 2.0 → 2.7，
    // 同时 `RECOIL_HOLD_SCALE` 0.33 → 0.24 —— **必须两个一起改**，只抬 up 会被
    // 衰减免掉一半（稳态 = up / (1 − e^(−recover·scale·interval))）。
    // 现在扫射 10 发视角抬约 12°（20m 上偏 4m+），按住到稳态约 17.5°，
    // 全程得把鼠标往下拖；松手按 recover 7 回位，约 0.4 秒重新变准。
    // 2026-11-13 第七次调（用户仍嫌压枪容易）：up 2.7 → 3.4，配合
    // `RECOIL_HOLD_SCALE` 0.19 —— 稳态约 27°，过头了（「太快也太高」）。
    // 第八次调收到 up 3.0 + HOLD_SCALE 0.22：扫射 10 发约 16.5°、稳态约 21°。
    // move 0.105 = 满速 6°，跑打必空 —— CSGO 里 AK 的移动散布是站立的二十多倍。
    spread: RIFLE_SPREAD(0.005, 0.0065, 0.055, 0.105),
    recoil: { up: 3.0, side: 0.6, recover: 7 },
    // 7.62 大口径：枪模后退最狠、枪口焰最大最久。镜头只给一点侧倾，
    // 不给随机震屏 —— 600 RPM 下随机抖动会连成一片，20 秒就晕
    feel: { kick: 1.2, punchPitch: 0.16, punchRoll: 0.4, shake: 0, flashScale: 1.05, flashLife: 0.055 },
    // 2026-11-13 伤害整体下调（用户「降低枪支伤害」）：33 → 28。爆头仍一枪
    // （28 × 4 = 112），身体 4 发死（84 / 112），续航对枪更久
    // 射程：30m 内满伤害（28），85m 掉到 55%（15.4）。85 > 全图最长视线
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
    damage: 26,
    headMul: 4,
    interval: 60 / 685,
    magazine: 30,
    reserve: 90,
    auto: true,
    reload: 2.5,
    perShell: false,
    pellets: 1,
    // 2026-11-13 第五次调：和 AK 同一轮改成「小随机锥 + 大上飘」的 CSGO 结构。
    // 第六次调跟着 AK 一起抬（up 1.35 → 1.8），保持「5.56 比 7.62 稳一档」。
    // 第七次 2.3 过头，第八次收到 2.05（配 HOLD_SCALE 0.22）：
    // 连射 10 发约 11.5°、按住稳态约 14.5°，仍和 AK 差 6° 左右，
    // 甩枪和点射的回位（recover 8）也明显更跟手。
    spread: RIFLE_SPREAD(0.004, 0.0052, 0.048, 0.092),
    recoil: { up: 2.05, side: 0.4, recover: 8 },
    // 5.56 小口径 + 685 RPM：**最干脆的一把** —— 枪模位移小、回位快，
    // 枪口焰小而短。连发时看起来是「哒哒哒」的节奏而不是「砰砰砰」的糊
    feel: { kick: 0.85, punchPitch: 0.12, punchRoll: 0.3, shake: 0, flashScale: 0.85, flashLife: 0.042 },
    // 2026-11-13 伤害整体下调：30 → 26。仍 4 发死（26 × 4 = 104），
    // 爆头仍一枪（104），和 AK 一起变「更依赖命中数」
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
    // 2026-11-13 那轮「移动 / 连发加大」刻意跳过 AWM：move 0.06 已是全表最大档，
    // 开镜移动又会全额吃这份惩罚（50m 上偏约 3m），再抬就和「停下来、开镜、开一枪」
    // 的定位冲突了
    spread: { base: 0.012, perShot: 0.02, max: 0.06, move: 0.06, air: 3 },
    recoil: { up: 3.4, side: 0.7, recover: 6 },
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
    // 全表最重的一把：移动 -12%、起跳 -10%。狙击的定位就是「停下来开枪」，
    // 机动性再高这个定位就名存实亡 —— 这是手感差异里最能被身体感知到的一档
    mobility: { speed: 0.88, jump: 0.9 },
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
    damage: 8,
    headMul: 1.6,
    interval: 60 / 72,
    magazine: 7,
    reserve: 21,
    auto: false,
    reload: 0.55,
    perShell: true,
    pellets: 8,
    // 弹丸锥靠 base 0.055 就已经很散；这一轮（2026-11-13 第五次）把移动惩罚再抬到
    // 0.048 —— 边走边喷应该明显漏人。泵动 0.83s 一发，连发累积不是主项
    spread: { base: 0.055, perShot: 0.006, max: 0.085, move: 0.048, air: 1.6 },
    recoil: { up: 2.6, side: 0.9, recover: 5 },
    // 12 号霰弹：枪模砸得比 AK 重、枪口焰最宽（8 颗弹丸一起出膛，火光本来就大）。
    // 泵动间隔 0.83s，所以侧倾可以给到 0.85° 而不至于连成抖动
    feel: { kick: 1.7, punchPitch: 0.3, punchRoll: 0.85, shake: 0.06, flashScale: 1.5, flashLife: 0.075 },
    // 2026-11-13 伤害整体下调：9 → 8（贴脸 8 颗 64，原 72）
    // 射程最短、掉得最狠：15m 内 8 颗弹丸满伤害，34m 就只剩 12%（每颗 0.96）。
    // 用 'linear' —— 霰弹要的就是「出了射程立刻没戏」，曲线压平反而违背直觉
    falloff: { start: 15, end: 34, min: 0.12, curve: 'linear' },
    // 长管泵动枪，比步枪沉一点但不至于拖沓
    mobility: { speed: 0.95, jump: 0.95 },
    pen: 0,
    scoped: false,
    sound: 'shotgun',
  },
  usp: {
    id: 'usp',
    kind: 'gun',
    slot: 'secondary',
    name: 'USP',
    damage: 21,
    headMul: 3.2,
    interval: 60 / 400,
    magazine: 12,
    reserve: 48,
    auto: false,
    reload: 1.9,
    perShell: false,
    pellets: 1,
    // 手枪半自动，「连发」实际是快速连点：perShot 0.008 让连点也散。
    // 移动惩罚 0.085 比步枪略低 —— 但手枪单手更晃，跑起来照样打不准
    // （2026-11-13 第五次调，与步枪同一条 CSGO 结构）
    // 第六次调：连点抬升 1.8 → 2.2。第七次 2.6 过头，第八次收到 2.4
    // （配 HOLD_SCALE 0.22）：12 发连点到空约 11°，跟步枪一起变难压
    spread: RIFLE_SPREAD(0.007, 0.008, 0.062, 0.085),
    recoil: { up: 2.4, side: 0.55, recover: 7.5 },
    // .45 手枪：全表最轻。枪模几乎只抖一下、枪口焰最小，和步枪的「砸」拉开距离
    feel: { kick: 0.6, punchPitch: 0.1, punchRoll: 0.25, shake: 0, flashScale: 0.7, flashLife: 0.038 },
    // 2026-11-13 伤害整体下调：25 → 21。原来 4 发正好 100，现在要 5 发
    //（21 × 5 = 105）—— 手枪从「补枪」进一步退到「应急」
    // 手枪：22m 内满伤害（21），55m 掉到 50%（10.5）。'linear' + 全表第二早的
    // 起衰点 —— 「短射程武器远距离衰减更明显」这条由它和霰弹承担
    // （表里没有冲锋枪；将来加 SMG 就照这一档填：start 18~22 / min 0.4~0.5）
    falloff: { start: 22, end: 55, min: 0.5, curve: 'linear' },
    // 单手轻携：比步枪快一档 —— 手枪对枪打不赢，就用这点速度换位
    mobility: { speed: 1.05, jump: 1.02 },
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
    // 空手跑刀是全表最快的机动性 —— 换武器跑图的收益，CF/CS 都有这条
    mobility: { speed: 1.12, jump: 1.05 },
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
    // 捏着雷和拿刀差不多轻：快扔雷的战术价值就靠这点机动性兜着
    mobility: { speed: 1.06, jump: 1 },
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
    // 手套：哑光深灰织物（战术手套不反光），纹理沿用聚合物噪声
    glove: pbr(0x2f343c, 0.96, 0.02, tex.polymer, 0.55),
    // 袖子：和人物模型的作训服同一张 cloth 迷彩（灰度图案、按本机队伍染色 ——
    // 第一人称袖子就是第三人称那套衣服的袖子，不用两张图）。surface-textures
    // 的 cloth 图是「一个部件一张 0..1 UV」的用法，正好匹配袖子的圆柱 UV。
    // color 默认 0 队（玩家单人默认阵营），开局后由 setFirstPersonSleeveTeam 同步
    sleeve: (() => {
      const cloth = surfaceMaps('cloth');
      return new THREE.MeshStandardMaterial({
        color: TEAM_CLOTH[0][0],
        map: cloth.map,
        normalMap: cloth.normalMap,
        roughnessMap: cloth.roughnessMap,
        roughness: 1, // 带 roughnessMap 时标量必须是 1（乘数）
        metalness: 0,
        normalScale: new THREE.Vector2(0.7, 0.7),
      });
    })(),
    // 刀身比枪身亮一档、更光；开刃的反光交给下面的 `edge`
    blade: pbr(0xb8c0c8, 0.5, 0.92, tex.metal, 0.6),
    // 开刃斜面（ExtrudeGeometry 的侧壁材质）：最亮最光的一道，刀刃的高光线
    edge: pbr(0xd0d6dc, 0.22, 0.95, null),
    // 刀柄：深色硬木
    woodDark: pbr(0x4a2f1c, 0.95, 0, tex.wood),
  };
  return mats;
}

/**
 * 第一人称袖子按本机玩家的阵营染色（第三人称队服在 actor-view，同一个来源）。
 *
 * 袖子材质是 `materials()` 的共享实例，改 color 全部袖子一起变 —— 第一人称
 * 同一时刻只有一个玩家在看，正好就是想要的行为。每帧调用是安全的（引擎在
 * updateViewModel 里同步），但 viewmodel 那层有缓存挡着，真写材质只在换队时发生。
 */
export function setFirstPersonSleeveTeam(team: 0 | 1): void {
  materials().sleeve.color.setHex(TEAM_CLOTH[team][0]);
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

/**
 * 换弹动画用的弹匣装配。**换弹是唯一一件「枪身上零件真的离开枪」的动作**，
 * 只把整把枪往下压是糊弄不过去的（用户 2026-11-13 明确否掉「换弹就是枪口向下」）。
 *
 * 外部枪模每个文件只有一个 `Magazine` 节点，装不出「旧匣掉出去 + 新匣插进来」，
 * 所以加载时把该节点**克隆一份当备用匣**（`spare`）：前段原匣拔出画面外后隐藏，
 * 后段备用匣从下方升进弹匣井，到位的那一帧两者交换 —— 肉眼看是两颗匣在换。
 * 程序化枪模没有克隆件（`spare = null`），此时退化成原匣自己升回去。
 */
export interface WeaponMagazine {
  /** 枪上原有的弹匣（静止位姿 = `rest`） */
  body: THREE.Group;
  /** 备用弹匣（同一份几何的克隆，平时隐藏） */
  spare: THREE.Group | null;
  /** 脱出方向（`body` 父空间的单位向量，指向弹匣井外） */
  dir: THREE.Vector3;
  /** 完全脱出弹匣井所需的行程（米） */
  travel: number;
  /** `body` 的静止位置（父空间） */
  rest: THREE.Vector3;
  /** `body` 的静止旋转（父空间）。拔匣时在它上面叠一点前倾，收尾要能还原 */
  restRot: THREE.Euler;
}

export interface ViewModel {
  group: THREE.Group;
  /** 枪口位置（局部坐标），引擎用它算火光的世界坐标 */
  muzzle: THREE.Object3D;
  /**
   * 可拆卸弹匣。换弹由 `viewmodel.ts` 驱动「拔出 → 掉出画面 → 新匣插入」；
   * 霰弹枪（泵动）、刀、雷为 null。
   */
  magazine: WeaponMagazine | null;
  /**
   * 可动画的枪栓（独立子组，静止位姿已摆好）。
   * 拉栓时由 `viewmodel.ts` 驱动它「提栓 → 后拉 → 推回 → 压下」；只有 AWM 有，其余为 null。
   * GLB 路径同样恒为 null。
   */
  bolt: THREE.Group | null;
  /**
   * 第一人称手臂，挂成 group 的子节点，枪的一切动画自动带动它。
   *
   * 两个来源：① 外部枪模自带的蒙皮手臂（`FPArms`，有皮肤贴图，加载时就绪）；
   * ② 程序化手臂（`buildFirstPersonArms`，刀 / 手雷 / 枪模就绪前的兜底）。
   * `buildFirstPersonArms` 见 `arms` 已存在就直接返回，不会叠出四只手。
   * **掉在地上的枪恒为 null** —— `dropped.ts` 用 `stripFirstPersonArms` 摘掉。
   */
  arms: THREE.Object3D | null;
  /**
   * 资产自带的第一人称取景（`extras.fp.hip`），直接给 `viewmodel.ts` 当基准位姿用。
   *
   * 🔴 **必须用它，不能再用 `BASE_POSES`**：这套资产是「枪 + 手臂」按真人尺寸在
   * 同一个骨架里摆好姿势导出的，二者的相对关系是死的。用脚本位姿（z −0.55）
   * 摆放时整条枪被推远到 40cm 外 —— 枪看着还行，但**手臂是对角着从镜头里穿出来的**：
   * 装订好的肘部位置假定手在 15cm 处，推远 3 倍之后肘部（离眼 20cm）会被压到
   * 画面正中，小臂变成一根横在准星下方的巨柱。取景是纯角度量，整体平移不是
   * `BASE_POSES` 那种「挪一点更顺眼」，它改的是手与枪的透视关系。
   * 没有元数据的旧模型（程序化刀 / 雷）仍是 null，走 `BASE_POSES`。
   */
  pose: WeaponPose | null;
  /** 左手 IK（换弹时去抓弹匣 / 拉护木 / 拉栓）。程序化武器为 null */
  hands: FpHands | null;
  /**
   * 换弹时左手去抓的部件。
   *
   * - 弹匣枪 = 弹匣上的**握持插槽**（`MagazineGrip` / `MagazineGripSocket`），位置由
   *   `magazine` 那套动画驱动；`spareChild` 是它在备用匣里的同名子节点 —— 新匣升上来
   *   之后手要改抓新匣，靠这个名字在克隆体里找回同一个点。
   * - 霰弹 = 护木、AWM = 隐形锚点（这两件要自己往复，见 `stroke`）。
   */
  handPart: {
    node: THREE.Object3D;
    rest: THREE.Vector3;
    stroke: number;
    /** 弹匣枪专用：备用匣（`MagazineSpare`）里同名的握持子节点 */
    spareChild: string | null;
  } | null;
}

/** 武器在枪模相机空间里的基准位姿（弧度） */
export interface WeaponPose {
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
}

/**
 * 各武器枪口在模型局部坐标里的位置 —— **GLB 与程序化两条路共用这一份**。
 *
 * 引擎的契约（火光世界坐标、`muzzleScreen` 的准星对齐）全挂在这个点上：
 * GLB 优先用模型自带的 `MuzzleDeviceTip` / `MuzzleSocket` 节点，找不到才退回这里；
 * 程序化分支直接用它摆 `muzzle`。改任何一个数，两条路都要同时验。
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
 * 外部枪模 —— **写实 PBR 资产包**，文件在 `public/h5/guns/*-real.glb`。
 * 刀与手雷没有合适的对应模型，**仍走程序化路线**（kukri 的挤出剖面也比低模刀好）。
 *
 * ## 为什么是这一套（第四代）
 *
 * 前三代依次被否：① 程序化盒子「太塑料」→ ② Quaternius「太低清」→
 * ③ 3dassets.dev 的高模「不够真实」—— 它有 3.7 万面，但**材质是纯 PBR 参数，
 * 零贴图**，表面只能靠几何和光照撑，近看就是一块上色的铁。
 *
 * 现在这套每把枪都带完整贴图集：**baseColor + metallicRoughness + normal + AO**，
 * 1024²（手枪 2048²）WebP，另加第一人称手臂（14800 面的蒙皮网格，带皮肤贴图）。
 * 「真实质感」是贴图给的，不是面数给的。
 *
 * ## 取景与尺寸（`applyFpFraming`）
 *
 * 资产是 Unreal 口径：**+Y up、枪口朝 -Z**（与引擎一致，不用转 180°），
 * 整体按真实尺寸的 **2 倍**建模（AK 量出来 1.76m）。所以加载时只做一件事：
 * 缩 `1/K`（K 来自资产元数据，=2）。**位置和朝向不在这里定**，而是读
 * `glTF node.extras.fp.hip`（资产在 Blender 里对着 34 张商用 FPS 截图量出来的
 * 机位），交给 `viewmodel.ts` 当基准位姿用。
 *
 * 🔴 **不能再按「握把 → GRIP_POS」自己摆**（第三代的做法）。手臂和枪是同一副
 * 骨架、同一个刚体，脚本位姿把整条枪推到 40cm 外之后，枪看着还算正常，但
 * 肘部会被压到画面正中，小臂变成一根横在准星下方的巨柱 —— 用户 2026-11-13
 * 的四张截图就是这个现象。取景是**纯角度量**，平移改的是手与枪的透视关系，
 * 不是「挪一点更顺眼」。
 *
 * 🔴 包围盒**必须排掉蒙皮网格**（`FPArms`）：蒙皮几何的包围盒是绑定空间的，
 * 和摆好姿势的手完全不是一回事，混进去会把整把枪缩成一根火柴。
 *
 * ## 换弹（左手是真的在动）
 *
 * 骨架给了 `IK_Hand_Cntrl_L`（腕控制器）和 `BoneTwist_01.L_end`（前臂末端），
 * 于是 `FpHands` 能对左臂做解析两骨 IK：把手拉到弹匣 / 护木 / 拉机柄上。
 * 右臂不动 —— 它本来就随枪走，动了反而会脱开握把。
 *
 * ## 生命周期（与 `materials()` 同一条铁律）
 *
 * 模板在模块级缓存存一份，`buildWeaponModel` 返回克隆：
 * 几何体与材质全场共享，所以 `disposeWeaponModel` 对 GLB 克隆**必须跳过
 * dispose**（打穿模板 = 下次切枪拿到已释放几何体，枪变全黑）。
 * **克隆必须走 `SkeletonUtils.clone`**：模型里有一条手臂骨架，`Object3D.clone()`
 * 只会复制蒙皮网格、骨架仍指向模板那一份，手会按模板的世界矩阵变形 —— 表现为
 * 手臂被拉成两倍长、飞出画面。
 *
 * ## 换弹 / 拉栓
 *
 *   - **弹匣是真的会掉出来的**：每个文件都有独立的 `Magazine` 节点，加载时按
 *     「节点 → 匣体质心」的方向算出脱出轴、按匣体最长边算出行程，并克隆一份
 *     备用匣（见 `WeaponMagazine`）。换弹时间轴在 `viewmodel.ts`。
 *   - **左手去抓它**：`FpHands` 把左腕 IK 到弹匣上（霰弹抓 `Pump`、M24 抓一个
 *     隐形的机匣锚点），弹匣滑到哪手跟到哪。
 *   - **AWM 的拉机柄仍然没有独立节点**：这套 M24 的栓体是 `Body` 网格的一部分，
 *     按坐标盒切会从机匣撕下一块（这条坑在第三代就踩过）。`bolt` 传 null，
 *     `viewmodel.ts` 有兼容分支；换弹时靠上面那个隐形锚点让手「拉一趟」。
 */
interface GlbGunConfig {
  /** public 下的资源路径 */
  file: string;
  /**
   * 枪身总长（米）= 真实枪械全长，**只在资产没有 `extras.fp` 元数据时**用来算缩放。
   * 有元数据的模型按 `1/K` 缩，这里的数只是对照值（K=2 时两边等价）。
   */
  length: number;
}

/**
 * 文件对应关系（武器 id → 资产）：
 *
 *   ak47    → ak47.glb      8 个材质、独立的弹匣/拉机柄节点
 *   m4a1    → m4a1.glb      单材质图集
 *   awm     → m24.glb       栓动狙击 + 瞄准镜镜片
 *   shotgun → shotgun.glb   泵动（`Pump` 节点可往复）
 *   usp     → p226.glb      手枪，2048² 图集
 *
 * 手臂贴图 `arms_basecolor.webp` / `arms_normal.webp` 是 GLB 里的**外置**引用
 * （相对路径），必须和 glb 放在同一个目录 —— 少了这两个文件，手臂会变成白模。
 */
const GLB_GUNS: Partial<Record<WeaponId, GlbGunConfig>> = {
  ak47: { file: '/h5/guns/ak47-real.glb', length: 0.88 },
  m4a1: { file: '/h5/guns/m4a1-real.glb', length: 0.84 },
  awm: { file: '/h5/guns/awm-real.glb', length: 1.09 },
  shotgun: { file: '/h5/guns/shotgun-real.glb', length: 1.01 },
  usp: { file: '/h5/guns/usp-real.glb', length: 0.2 },
};

/** 模型里弹匣节点 / 备用匣节点的名字（`clone(true)` 保留 name） */
const MAG_BODY_NAME = 'Magazine';
const MAG_SPARE_NAME = 'MagazineSpare';

/**
 * 每把枪的弹匣「往哪个方向拔」。**枪空间**（= 弹匣节点父空间，父节点无旋转），
 * 未归一化时就用 —— 单位向量，不需要长度。
 *
 * 方向不是随手写的：AK 的弹匣井向前倾（匣体往前下方挂），M4 接近垂直，
 * 手枪的握把向后倾 20°，所以匣是往**后下方**退出来的。
 */
const MAG_DROP: Partial<Record<WeaponId, readonly [number, number, number]>> = {
  ak47: [0, -1, -0.34],
  m4a1: [0, -1, -0.12],
  usp: [0, -1, 0.2],
};

/** 加载时量出来的弹匣参数（脱出方向 / 行程），克隆时照抄 */
const magRigs = new Map<WeaponId, { dir: THREE.Vector3; travel: number }>();

/** 枪口节点在模板局部坐标里的位置（模型自带的 `MuzzleDeviceTip` / `MuzzleSocket`） */
const muzzleOffsets = new Map<WeaponId, THREE.Vector3>();

const glbTemplates = new Map<WeaponId, THREE.Group>();
const glbJobs = new Map<WeaponId, Promise<boolean>>();
/** 资产自带的取景（相机空间位姿），`viewmodel.ts` 用它替掉 `BASE_POSES` */
const rigPoses = new Map<WeaponId, WeaponPose>();
/**
 * 换弹时左手去抓的节点名，加载后按资产结构决定。
 *
 * `spareChild` 只有弹匣枪有：`Magazine` 的克隆体（备用匣）里还留着同名的
 * `MagazineGrip`，新匣升上来时按名字在克隆体里找同一个握点。
 */
const handPartNames = new Map<
  WeaponId,
  { node: string; stroke: number; spareChild: string | null }
>();

/**
 * ⚠️ 旧的两件套 `tuneGlbMaterial`（给无贴图低模挂 Canvas 噪声贴图）与
 * `generateUv`（三平面 UV）在 2026-11-13 换高清枪模时**一起删了**。
 * 现在的枪自带 1024/2048 PBR 贴图与展好的 UV，那套补丁只会把高清贴图
 * 换成 512px 手绘噪声。别再按「模型没贴图」的理由加回来 —— 真的需要时，
 * 应该在资产侧修，而不是在运行时用投影 UV 掩盖。
 */

/* ---------- AWM 拉栓动画组的名字（当前不产出，见下方说明） ---------- */

/** 拉栓动画组挂到克隆体上后用名字找回来（`clone(true)` 保留 name） */
const AWM_BOLT_NAME = 'awm_bolt';

/**
 * 拉机柄切分**已删除**（2026-11-13 换高清枪模时）。
 *
 * 旧实现从 Quaternius 的 AWM 网格里按一簇固定坐标的三角形切出拉机柄，坐标是
 * 对着那一份模型逐三角形量的。新 AWM 是 10.6k 面的另一套模型，同一个坐标盒
 * 会命中完全不相干的三角形 —— 轻则拉栓飞出镜头，重则机匣被撕开一个洞。
 *
 * 新模型自带 `bolt cycle` 动画（4 个 clip），但要接上得改成按 GLB 节点名驱动
 * `AnimationMixer`，与现有「程序化拉栓行程」那套合同（`viewmodel.ts` 的
 * `bolt.position.z`）不是一条路。所以这一轮**先不做**：`bolt` 传 null，
 * `viewmodel` 已有兼容分支（整体动作代替），枪身完整优先。
 */

/** 枪贴图的各向异性上限：4x 足够把导轨的横向拉丝在斜视时拉清楚 */
const MAX_GUN_ANISOTROPY = 4;

/**
 * 高清枪模的材质「轻加工」：**不改颜色、不换贴图**，只补采样质量。
 *
 * 上一代 `tuneGlbMaterial` 会给材质挂 Canvas 灰度噪声 + 三平面 UV，那是给
 * 没有 TEXCOORD 的低模补细节用的。新模型自带 baseColor / normal / metal-rough，
 * 再盖一层 512px 手绘噪声，等于用噪声替换 2048px 的真实贴图 —— 越「优化」越糊。
 */
function tuneHdMaterial(src: THREE.Material): THREE.Material {
  const std = src as THREE.MeshStandardMaterial;
  if (!std.isMeshStandardMaterial) return src;
  std.side = THREE.FrontSide;
  for (const texture of [std.map, std.normalMap, std.roughnessMap, std.metalnessMap, std.aoMap]) {
    if (texture) texture.anisotropy = MAX_GUN_ANISOTROPY;
  }
  std.needsUpdate = true;
  return std;
}

/** 枪械静态资源目录（手臂贴图是 GLB 里的相对引用，必须同目录） */
const GUN_ASSET_BASE = '/h5/guns/';

/**
 * **只统计非蒙皮网格**的包围盒。
 *
 * 🔴 不能直接用 `Box3.setFromObject`：模型里挂着一条 14800 面的手臂蒙皮网格，
 * 它的几何包围盒属于「绑定空间」（还没乘骨骼矩阵），和摆好姿势的手臂完全不是
 * 一回事 —— 实测是一块 ±1m 的空盒子。混进去会把整把枪缩成一根火柴。
 */
function gunBounds(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const corner = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    const geometry = mesh.geometry;
    if (!geometry) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    if (!bb) return;
    for (let i = 0; i < 8; i += 1) {
      corner.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
      box.expandByPoint(corner.applyMatrix4(mesh.matrixWorld));
    }
  });
  return box;
}

/**
 * 握把锚点（武器坐标系里的常数值，四把长枪共用）。
 *
 * 「把这个点摆到 `GRIP_POS`」而不是「把枪口摆到 `MUZZLE_POS`」——
 * 换到真实尺寸之后这一条变得关键：真枪比之前那套充气比例的模型短 20cm，
 * 按枪口锚定会把整把枪往前推 20cm，握把离镜头 60cm，手臂得伸直才够得着，
 * 看起来像举着一把玩具。按握把锚定，**手的位置不动**，短掉的那截从枪口那头减。
 *
 * 数值是和 `BASE_POSES` 一起定的：步枪 `BASE.z = -0.55`，握把落在 −0.15
 * → 世界坐标 −0.40（手离眼 40cm）；AK 的握把到枪口 0.63，于是枪口在 −1.03，
 * 枪托在 −0.15 —— 抵肩的构图。
 */
const GRIP_POS: readonly [number, number, number] = [0, -0.05, 0.15];

/**
 * 资产自带的取景元数据（`glTF node.extras.fp`，字符串化的 JSON）。
 *
 * `hip.pos` 是**相机空间**（x 右、y 前、z 上，米）里「握把上方那条膛线点」的位置，
 * `hip.rot` 是同一点的俯仰 / 偏航 / 横滚（度），`hip.boreRef` 是那个点在自己的
 * 枪身坐标系（K 倍空间）里的位置，`K` 是建模倍率。这套数在 Blender 里对着 34 张
 * 商用 FPS 截图逐张量出来的（资产方 `docs/FP_FRAMING.md`），比自己拍脑袋写
 * `BASE_POSES` 靠谱得多 —— 那份文档里连「托手应落在 x 45~65%、y 62~85%」都有。
 *
 * 实测：按这套数摆，AK 的托手落 55%/77%、小臂 33%/98%（从画面左下入库），
 * M4 的照门 69%/57% —— 和文档的目标带逐项吻合。
 */
interface FpMeta {
  K: number;
  hip: {
    pos: [number, number, number];
    rot: [number, number, number];
    boreRef: [number, number, number];
  };
}

/** 从加载好的场景里捞出 `extras.fp`（three 会把 glTF extras 塞进 `userData`） */
function readFpMeta(root: THREE.Object3D): FpMeta | null {
  let meta: FpMeta | null = null;
  root.traverse((object) => {
    if (meta) return;
    const raw = object.userData?.fp;
    if (typeof raw !== 'string') return;
    try {
      const parsed = JSON.parse(raw) as FpMeta;
      if (parsed?.hip?.pos && parsed?.hip?.boreRef) meta = parsed;
    } catch {
      // 元数据坏了就当没有：下面会退回按握把锚定的老路
    }
  });
  return meta;
}

/**
 * 各武器的「取景推远系数」。资产方的 `FP_TUNE.hipPush`：以眼睛为原点整体缩放
 * 机位，屏幕构图不变、但离眼睛更远（枪看起来略小一圈）。
 *
 * 手枪给 1.3 是资产方自己调过的 —— 手枪的托手离眼太近，不推远会把整个手背
 * 糊在画面下沿之外。步枪 1.05 / 1.12 是同源的小幅修正。
 */
const HIP_PUSH: Partial<Record<WeaponId, number>> = {
  ak47: 1.05,
  m4a1: 1.12,
  usp: 1.3,
};

/**
 * 把模型缩到真人尺寸（`1/K`），并算出它相对**枪模相机**的基准位姿。
 *
 * 关键点：位姿算的是「整条枪 + 两条手臂」这个刚体的位置，不再按握把锚定。
 * `boreRef` 那一步是把「膛线点」对到 `hip.pos` 上 —— 换模型不用重调，改构图
 * 只改资产里的元数据。
 *
 * 返回的位姿写进 `rigPoses`，由 `viewmodel.ts` 当作 `BASE_POSES` 的替代品。
 */
function applyFpFraming(inner: THREE.Group, id: WeaponId, meta: FpMeta): WeaponPose {
  const k = meta.K > 0 ? meta.K : 2;
  inner.scale.setScalar(1 / k);
  inner.position.set(0, 0, 0);
  inner.rotation.set(0, 0, 0);
  inner.updateMatrixWorld(true);

  // 相机空间 (x 右, y 前, z 上) → three 空间 (x 右, y 上, z 后)
  const toScene = (v: readonly [number, number, number]) => new THREE.Vector3(v[0], v[2], -v[1]);
  const deg = Math.PI / 180;
  const rot = new THREE.Euler(meta.hip.rot[0] * deg, meta.hip.rot[1] * deg, meta.hip.rot[2] * deg, 'YXZ');
  const bore = toScene(meta.hip.boreRef).applyEuler(rot);
  const push = HIP_PUSH[id] ?? 1;
  const pos = toScene(meta.hip.pos).sub(bore).multiplyScalar(push);

  // 资产给的旋转是 **YXZ** 阶，而 `group.rotation` 是 XYZ —— 必须过一遍四元数
  // 重新分解，不能把 yxz 的三个分量直接塞进 XYZ（AK 只有 roll 时等价，
  // 一旦俯仰和偏航同时非零就会差出零点几度，换成别的资产会放大）
  const order = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().setFromEuler(rot),
    'XYZ',
  );
  return { x: pos.x, y: pos.y, z: pos.z, rotX: order.x, rotY: order.y, rotZ: order.z };
}

/** 没有元数据的旧模型兜底：按 `GripR` → `GRIP_POS` 摆（第三代资产用的算法） */
function alignByGrip(inner: THREE.Group, length: number): WeaponPose {
  inner.updateMatrixWorld(true);
  const rawSize = gunBounds(inner).getSize(new THREE.Vector3());
  inner.scale.setScalar(length / Math.max(rawSize.z, 1e-4));
  inner.updateMatrixWorld(true);
  const grip = inner.getObjectByName('GripR');
  const base: WeaponPose = { x: 0.15, y: -0.105, z: -0.55, rotX: -0.012, rotY: 0.055, rotZ: 0.06 };
  const box = gunBounds(inner);
  const anchor = grip
    ? grip.getWorldPosition(new THREE.Vector3())
    : new THREE.Vector3(0, (box.min.y + box.max.y) / 2, box.max.z);
  inner.position.x += GRIP_POS[0] - anchor.x;
  inner.position.y += GRIP_POS[1] - anchor.y;
  inner.position.z += GRIP_POS[2] - anchor.z;
  inner.updateMatrixWorld(true);
  return base;
}

/**
 * 左手的两骨 IK。
 *
 * 素材里两条手臂和枪是同一副骨架：右臂随枪刚性移动，左臂要能离开护木去抓弹匣。
 * 这套骨架给了 `IK_Hand_Cntrl_L`（手腕控制器，`Hand_L` 是它的子节点）和
 * `BoneTwist_01.L_end`（前臂末端），正好够解一个解析两骨 IK：肩固定、肘保持
 * 建模时的弯曲平面，把肘摆到解出来的位置，再转前臂让腕落到目标点。
 *
 * 只对左臂做 —— 右臂本来就是「随枪走」，动它反而会脱开握把。
 */
export class FpHands {
  private readonly root: THREE.Object3D;
  private readonly up: THREE.Object3D | null;
  private readonly fo: THREE.Object3D | null;
  private readonly end: THREE.Object3D | null;
  private readonly ctrl: THREE.Object3D | null;
  private readonly hand: THREE.Object3D | null;
  /** 三个受控骨骼的静止位姿，每帧解算前先还原 */
  private readonly rest: { b: THREE.Object3D; p: THREE.Vector3; q: THREE.Quaternion }[] = [];
  /** 静止时手腕在 group 局部空间的位置（第一次解算时记下） */
  private home: THREE.Vector3 | null = null;
  /**
   * 「腕 → 抓点」的偏移（group 局部空间）。
   *
   * 骨架里的 `Hand_L` 是**腕关节**，不是掌心：建模姿势下腕在护木握点后方 5cm、
   * 下方 4cm。要把握把 / 弹匣摆到手心，目标点必须先减去这段偏移 —— 直接把腕
   * 拉到弹匣上，掌心会越过去插进匣体里。
   *
   * 偏移量不写死：拿资产自带的 `GripL`（托手握点）当场量一次。没有 `GripL`
   * 的手枪用 `GripR`（双手握把点，也是一回事）。
   */
  private gripOffset: THREE.Vector3 | null = null;

  constructor(root: THREE.Object3D) {
    this.root = root;
    const find = (names: string[]) => {
      for (const name of names) {
        const node = root.getObjectByName(name);
        if (node) return node;
      }
      return null;
    };
    this.up = find(['UpArm_L']);
    this.fo = find(['Forearm_L']);
    // 资产里是 `BoneTwist_01.L_end`，另一份导出写成 `BoneTwist_01L_end`
    this.end = find(['BoneTwist_01.L_end', 'BoneTwist_01L_end']);
    this.ctrl = find(['IK_Hand_Cntrl_L']);
    this.hand = find(['Hand_L']);
    if (!this.up || !this.fo || !this.end || !this.ctrl || !this.hand) return;
    for (const bone of [this.up, this.fo, this.ctrl]) {
      this.rest.push({ b: bone, p: bone.position.clone(), q: bone.quaternion.clone() });
    }
    // 量「腕 → 抓点」：必须在对 root 做任何变换**之前**量，两边都是局部坐标
    const socket = find(['GripL']) ?? find(['GripR']);
    if (socket) {
      root.updateMatrixWorld(true);
      const wrist = root.worldToLocal(this.hand.getWorldPosition(new THREE.Vector3()));
      const point = root.worldToLocal(socket.getWorldPosition(new THREE.Vector3()));
      this.gripOffset = wrist.sub(point);
    }
  }

  /** 这套骨架解不了 IK（缺节点）时为 false，调用方就别再算了 */
  get ok(): boolean {
    return this.rest.length === 3;
  }

  /** 回到模型自带的持枪姿势 */
  reset(): void {
    for (const r of this.rest) {
      r.b.position.copy(r.p);
      r.b.quaternion.copy(r.q);
    }
    this.home = null;
  }

  /**
   * 把左手拉到 `target`（group 局部坐标，**抓点**：弹匣 / 护木 / 拉机柄的位置），
   * `weight` 0..1 与自带姿势插值。
   *
   * 先按静止姿势记下腕关节位置，再线性过渡过去，起手 / 收手都是连续的，
   * 不会在换弹开始那一帧「啪」地跳到弹匣上。
   */
  reach(target: THREE.Vector3, weight: number): void {
    if (!this.ok) return;
    this.reset();
    if (weight <= 0.001) return;

    const root = this.root;
    root.updateMatrixWorld(true);
    const ctrl = this.ctrl!;
    const up = this.up!;
    const fo = this.fo!;
    const end = this.end!;
    const hand = this.hand!;

    if (!this.home) this.home = root.worldToLocal(ctrl.getWorldPosition(new THREE.Vector3()));
    // 抓点 → 腕：掌心要落在抓点上，腕得退回建模时那段偏移
    const wristGoal = target.clone();
    if (this.gripOffset) wristGoal.add(this.gripOffset);
    const toWorld = (local: THREE.Vector3) => local.clone().applyMatrix4(root.matrixWorld);
    const goal = toWorld(this.home).lerp(toWorld(wristGoal), Math.min(1, weight));

    const shoulder = up.getWorldPosition(new THREE.Vector3());
    const elbow0 = fo.getWorldPosition(new THREE.Vector3());
    const wrist0 = end.getWorldPosition(new THREE.Vector3());

    // 手腕控制器直接搬过去 —— `Hand_L` 是它的子节点，搬控制器就是搬整只手
    ctrl.position.copy(ctrl.parent ? ctrl.parent.worldToLocal(goal.clone()) : goal);
    ctrl.updateMatrixWorld(true);
    const wrist = hand.getWorldPosition(new THREE.Vector3());

    const upper = elbow0.distanceTo(shoulder);
    const fore = wrist0.distanceTo(elbow0);
    const span = wrist.clone().sub(shoulder);
    // 夹到可达范围：目标太近 / 太远时不硬拉断手臂，长度不够就伸到极限
    const dist = THREE.MathUtils.clamp(span.length(), Math.abs(upper - fore) + 1e-4, upper + fore - 1e-4);
    const axis = span.normalize();

    // 弯曲平面沿用建模时的：把静止的「肩→肘」相对「肩→腕」的分量随新轴线转过去
    const bend0 = elbow0.clone().sub(shoulder);
    const axis0 = wrist0.clone().sub(shoulder).normalize();
    bend0.addScaledVector(axis0, -bend0.dot(axis0));
    const bend = bend0.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(axis0, axis));
    bend.addScaledVector(axis, -bend.dot(axis)).normalize();

    const cosA = (upper * upper + dist * dist - fore * fore) / (2 * upper * dist);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const elbow = shoulder
      .clone()
      .addScaledVector(axis, upper * cosA)
      .addScaledVector(bend, upper * sinA);

    // 上臂：把静止的肘方向旋到解出来的肘方向
    const swing = new THREE.Quaternion().setFromUnitVectors(
      elbow0.clone().sub(shoulder).normalize(),
      elbow.clone().sub(shoulder).normalize(),
    );
    this.setWorldQuaternion(up, swing.multiply(up.getWorldQuaternion(new THREE.Quaternion())));

    // 前臂：把当前的腕再摆到目标上
    const elbow1 = fo.getWorldPosition(new THREE.Vector3());
    const wrist1 = end.getWorldPosition(new THREE.Vector3());
    const fold = new THREE.Quaternion().setFromUnitVectors(
      wrist1.clone().sub(elbow1).normalize(),
      wrist.clone().sub(elbow1).normalize(),
    );
    this.setWorldQuaternion(fo, fold.multiply(fo.getWorldQuaternion(new THREE.Quaternion())));
  }

  /** 世界空间给骨骼定姿：先把世界四元数换进父空间，再写回本地 */
  private setWorldQuaternion(bone: THREE.Object3D, world: THREE.Quaternion): void {
    const parent = bone.parent;
    if (parent) {
      bone.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
    } else {
      bone.quaternion.copy(world);
    }
    bone.updateMatrixWorld(true);
  }
}


/**
 * 读模型自带的枪口节点 → 模板局部坐标。
 *
 * 模型给的是 `MuzzleDeviceTip`（AK）或 `MuzzleSocket`（M4 / M24 / M870 / P226）。
 * 用它比用 `MUZZLE_POS` 准：枪口火光正好落在消焰器口，而不是「大约在枪管前端」。
 * 找不到就退回 `MUZZLE_POS` —— 火光位置宁可差一点，也不能没有。
 */
function findMuzzleOffset(inner: THREE.Group, id: WeaponId): THREE.Vector3 {
  const node =
    inner.getObjectByName('MuzzleDeviceTip') ??
    inner.getObjectByName('MuzzleSocket') ??
    inner.getObjectByName('MuzzleDevice');
  if (!node) return new THREE.Vector3(...MUZZLE_POS[id]);
  return node.getWorldPosition(new THREE.Vector3());
}

/**
 * 量弹匣：脱出方向 + 行程，并克隆一份备用匣挂回同一父节点（见 `WeaponMagazine`）。
 *
 * 方向用 `MAG_DROP` 的先验，而不是「节点 → 匣体质心」现算：手枪的匣体是对称件，
 * 质心几乎落在节点原点上，现算会得到一条零向量。先验写的是枪空间方向，
 * 这里再按父节点的世界四元数逆变换转进父空间（这几个父节点其实都没旋转，
 * 但一旦哪天资产换了，这行能兜住）。
 */
function prepareMagazine(inner: THREE.Group, id: WeaponId): void {
  const body = inner.getObjectByName(MAG_BODY_NAME) as THREE.Group | null;
  if (!body || !body.parent) return;

  const preset = MAG_DROP[id] ?? [0, -1, 0];
  const parentQuat = body.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  const dir = new THREE.Vector3(preset[0], preset[1], preset[2]).applyQuaternion(parentQuat).normalize();

  // 行程 = 匣体最长边（弹匣的长轴就是它自己的长度）+ 5% 余量，确保整颗出井。
  // 🔴 `setFromObject` 给的是**世界单位**，而动画里是加在 `body.position` 上的
  // **父空间**位移 —— 中间夹着归一化的 0.5 和模型自带的 1.2575，必须除掉世界缩放，
  // 否则弹匣只滑出一半就停住（看着像卡在井里）。
  const size = new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3());
  const parentScale = body.parent.getWorldScale(new THREE.Vector3());
  const travel = (Math.max(size.x, size.y, size.z) * 1.05) / Math.max(parentScale.x, 1e-6);
  magRigs.set(id, { dir, travel });

  const spare = body.clone(true);
  spare.name = MAG_SPARE_NAME;
  spare.visible = false;
  body.parent.add(spare);
}

async function loadGlbWeapon(id: WeaponId, config: GlbGunConfig): Promise<boolean> {
  try {
    const res = await fetch(config.file);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    const loader = new GLTFLoader();
    // 资产用 EXT_meshopt_compression 压过几何、KHR_mesh_quantization 量化过顶点。
    // 不挂解码器 `parse` 会直接抛错，整把枪退回程序化盒子。
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
      // base 路径必须给对：手臂贴图是 GLB 里的**外置**相对引用
      // （`arms_basecolor.webp` / `arms_normal.webp`），给空串会按页面根目录取 → 404 → 白模手臂
      loader.parse(buffer, GUN_ASSET_BASE, resolve, reject);
    });

    const inner = gltf.scene;
    // 资产里还带一颗「备用弹匣」（`SpareMagazine`，挂在骨架腰侧，是给原包自家
    // 换弹动画当道具的）。我们不播那套动画，留着它就是一颗悬在腰前的匣
    // —— AK 量出来在握把下方 35cm，正好落在画面下沿里。摘掉。
    inner.getObjectByName('SpareMagazine')?.removeFromParent();

    // 取景：优先用资产自带的 `extras.fp.hip`（对过 34 张商用 FPS 截图的目标带），
    // 没有元数据才退回「握把 → GRIP_POS」的老算法
    const meta = readFpMeta(inner);
    const pose = meta ? applyFpFraming(inner, id, meta) : alignByGrip(inner, config.length);
    rigPoses.set(id, pose);

    // 高清模自带 UV 与 PBR 贴图：**不要再走 `tuneGlbMaterial` 那套 Canvas 贴图**。
    // 那套是给「没有 TEXCOORD 的低模」补细节的（灰度噪声 + 三平面 UV），
    // 盖到已经有 2048 贴图的模型上等于把高清贴图换成噪声，越换越糊。
    const tuned = new Map<THREE.Material, THREE.Material>();
    inner.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      // 枪永远在视野里；手臂是蒙皮网格，绑定空间的包围盒和实际姿势对不上，
      // 开着剔除会让手臂在画面边缘整条消失
      mesh.frustumCulled = false;
      const src = mesh.material as THREE.Material;
      let mat = tuned.get(src);
      if (!mat) {
        mat = tuneHdMaterial(src);
        tuned.set(src, mat);
      }
      mesh.material = mat;
    });

    prepareMagazine(inner, id);
    // 换弹时左手抓哪一件：有弹匣抓弹匣（位置由弹匣那套驱动），
    // 霰弹抓护木、AWM 抓拉机柄 —— 这两件没有弹匣，得靠 `stroke` 自己往复，
    // 否则「换弹」就只是枪在抖、手不动。
    const part = pickHandPart(inner);
    if (part) handPartNames.set(id, part);
    muzzleOffsets.set(id, findMuzzleOffset(inner, id));

    const root = new THREE.Group();
    root.userData.shared = true; // disposeWeaponModel 见此跳过 dispose
    root.add(inner);

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
 * `onProgress` 是给**载入页的进度条**用的：写实 PBR 枪模 1.0~2.0MB 一把
 * （低模时代是 50~130KB），五把合计约 7MB，逐个回一个 `(已完成, 总数)`。计数器是
 * **每次调用独立**的 —— 任务本身被 `glbJobs` 共享，但「等的人」可能不止一个
 * （引擎构造时先起一次，载入页紧接着再等一次），共用同一个计数器会出现
 * 「第二次调用一上来就 5/5」。
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

/** 加载时决定「换弹那只手抓哪里」。行程在资产各自的枪空间（K 倍空间）里 */
function pickHandPart(
  inner: THREE.Object3D,
): { node: string; stroke: number; spareChild: string | null } | null {
  const mag = inner.getObjectByName(MAG_BODY_NAME);
  if (mag) {
    // 抓握持插槽而不是弹匣节点本身：`Magazine` 的原点在弹匣井口，掌心落在那里
    // 就成了「扶着井口」，看着像没抓匣。资产给的 `MagazineGrip` 才是手该握的位置
    // （AK 在匣体下方 11cm、M4 在下方 16cm）。
    const socket = mag.getObjectByName('MagazineGrip') ?? mag.getObjectByName('MagazineGripSocket');
    return {
      node: socket ? socket.name : MAG_BODY_NAME,
      stroke: 0,
      spareChild: socket ? socket.name : null,
    };
  }
  // 泵动霰弹：护木往射手方向退 9cm（模型局部是 K 空间，0.18 × 1/K = 9cm），再推回去
  if (inner.getObjectByName('Pump')) return { node: 'Pump', stroke: 0.18, spareChild: null };
  if (inner.getObjectByName('ChargingHandle'))
    return { node: 'ChargingHandle', stroke: 0.12, spareChild: null };

  // M24 这种「枪机是机匣网格的一部分、没有独立节点」的栓动枪：造一个隐形锚点挂在
  // 机匣上方（握把**上方** 4cm、**前方** 9cm —— 也就是拉栓手柄那儿），让左手
  // 在那儿前后走一趟。枪机本体不能动（按坐标盒切三角形会撕开机匣，第三代踩过这个坑），
  // 但「手在拉栓」这件事必须看得见。
  //
  // 🔴 偏移是**模型局部的 K 空间**（`inner` 已经被 `1/K` 缩过），写 0.08 / −0.18
  // 等于世界上 4cm / 9cm。前一版写的是 +0.05 / −0.35（世界上 17.5cm 前方），
  // 那个点离肩 0.42m、比整条手臂（0.348m）还长，IK 直接被夹断 ——
  // 表现是掌心停在半空、离锚点差 5cm，看着像手在瞎摸。
  // 这一版实测锚点落 71%/79%、臂展 0.197m，可达。
  const grip = inner.getObjectByName('GripR');
  if (!grip) return null;
  const local = inner.worldToLocal(grip.getWorldPosition(new THREE.Vector3()));
  const anchor = new THREE.Object3D();
  anchor.name = 'ReloadHandAnchor';
  anchor.position.set(local.x, local.y + 0.08, local.z - 0.18);
  inner.add(anchor);
  return { node: 'ReloadHandAnchor', stroke: 0.2, spareChild: null };
}

/**
 * 从模板克隆一把 GLB 枪。几何体与材质共享模板，dispose 侧跳过。
 *
 * 🔴 必须用 `SkeletonUtils.clone` 而不是 `template.clone(true)`：模型里有一条
 * 手臂骨架，普通 clone 只复制蒙皮网格、骨架仍指向模板那一份 —— 手会按模板的
 * 世界矩阵被拉变形（表现为手臂飞出画面）。
 */
function cloneGlbViewModel(id: WeaponId, template: THREE.Group): ViewModel {
  const group = cloneSkinned(template) as THREE.Group;

  const muzzle = new THREE.Object3D();
  const offset = muzzleOffsets.get(id);
  if (offset) muzzle.position.copy(offset);
  else muzzle.position.set(...MUZZLE_POS[id]);
  group.add(muzzle);

  const rig = magRigs.get(id);
  let magazine: WeaponMagazine | null = null;
  if (rig) {
    const body = group.getObjectByName(MAG_BODY_NAME) as THREE.Group | null;
    const spare = group.getObjectByName(MAG_SPARE_NAME) as THREE.Group | null;
    if (body) {
      magazine = {
        body,
        spare,
        dir: rig.dir.clone(),
        travel: rig.travel,
        rest: body.position.clone(),
        restRot: body.rotation.clone(),
      };
    }
  }

  // AWM：模板里预切好的拉机柄动画组；这套模型不产出（见上方说明）→ null
  const bolt = id === 'awm' ? (group.getObjectByName(AWM_BOLT_NAME) as THREE.Group | undefined) : undefined;
  // 模型自带第一人称手臂（蒙皮网格）：挂进 ViewModel 后 `buildFirstPersonArms`
  // 会自动跳过，程序化手臂不会叠上来
  const arms = (group.getObjectByName('FPArms') ?? null) as THREE.Object3D | null;

  // 左手 IK：骨架是从模板克隆出来的**新**对象，骨骼引用必须在这一份上重新抓，
  // 否则解算会去动模板的骨头（=`SkeletonUtils.clone` 那条坑的另一面）
  const hands = arms ? new FpHands(group) : null;

  // 换弹时左手抓的节点（克隆体上按名字找回来）+ 它自己的静止位置
  const spec = handPartNames.get(id);
  const node = spec ? group.getObjectByName(spec.node) : null;
  const handPart =
    spec && node
      ? { node, rest: node.position.clone(), stroke: spec.stroke, spareChild: spec.spareChild }
      : null;

  return {
    group,
    muzzle,
    magazine,
    bolt: bolt ?? null,
    arms,
    pose: rigPoses.get(id) ?? null,
    hands: hands?.ok ? hands : null,
    handPart,
  };
}

/** 掉在地上的枪不能长手：摘掉模型自带的蒙皮手臂（`dropped.ts` 用） */
export function stripFirstPersonArms(model: ViewModel): void {
  if (!model.arms) return;
  model.arms.removeFromParent();
  model.arms = null;
  // 手没了，IK 的骨骼引用也就成了悬空指针 —— 一起清掉
  model.hands = null;
  model.handPart = null;
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
  if (template) return cloneGlbViewModel(id, template);

  const group = new THREE.Group();
  const muzzle = new THREE.Object3D();
  // 用对象包一层：`let` 变量在闭包里赋值后，TS 的控制流分析会在函数末尾
  // 把它窄化成 null（认不出闭包已经跑过），下面读 `.position` 会报 never
  const magHolder: { body: THREE.Group | null } = { body: null };
  let bolt: THREE.Group | null = null;

  /** 弹匣独立成组：换弹动画只挪这个组，枪身不动。调用一次即登记到 `magazine` */
  const magGroup = (): THREE.Group => {
    const g = new THREE.Group();
    group.add(g);
    magHolder.body = g;
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
    // 手雷：一颗弹体 + 保险片 + 保险环 + 保险销。握着它的手由
    // `buildFirstPersonArms` 装（第一人称才有，掉在地上的雷没有手）
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
    muzzle.position.set(...MUZZLE_POS[id]);
  }

  group.add(muzzle);
  // 程序化枪的弹匣是「一个组整块往下走」（组内零件位置已摆好），
  // 没有克隆件 —— `spare` 给 null，viewmodel 会让这颗匣自己升回去
  const magazineBody = magHolder.body as THREE.Group | null;
  const magazine: WeaponMagazine | null = magazineBody
    ? {
        body: magazineBody,
        spare: null,
        dir: new THREE.Vector3(0, -1, 0),
        travel: 0.16,
        rest: magazineBody.position.clone(),
        restRot: magazineBody.rotation.clone(),
      }
    : null;
  // 程序化武器（刀 / 雷 / 枪模未就绪兜底）：位姿仍走 viewmodel 的 `BASE_POSES`，
  // 没有骨架也就没有 IK —— 三个新字段一律 null
  return { group, muzzle, magazine, bolt, arms: null, pose: null, hands: null, handPart: null };
}

/** 释放一把枪模的几何体（材质是共享的，不能 dispose）。 */
export function disposeWeaponModel(model: ViewModel): void {
  // GLB 模板克隆（userData.shared）：几何体与材质和模块级模板共享，
  // dispose 会把模板打穿 —— 下次切枪拿到已释放几何体，枪变全黑。
  // 与 materials() 缓存「不能清」是同一条铁律。
  // ⚠️ 必须**放在手臂之前**判断：GLB 的手臂也是模板里的共享几何，先 traverse 一遍
  // 手臂 = 直接把模板的蒙皮网格打穿（下一把手变全黑、手消失）。
  if (model.group.userData.shared === true) return;

  // 程序化手臂几何是每次现建的（不像 GLB 与模板共享），无条件释放。
  // 它们也在 group 里，下面的 traverse 会再扫一遍 —— dispose 两次无害
  if (model.arms) {
    model.arms.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }
  model.group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
}

/* ============================================================
   第一人称手臂（2026-11-13，用户给了 CS:GO 的持枪参考图拍板）
   ============================================================ */

/**
 * 第一人称的手 + 小臂。之前一直没做（备注：「程序化手容易丑，等用户定」），
 * 现按参考图定式：**步枪双手**（右手扣握把、左手掌心朝上托护木）、
 * **手枪单手**、**军刀单手** —— 全部低模几何拼装，与枪模同一套材质库。
 *
 * ## 挂载与生命周期
 *
 * 手臂是 `model.group` 的**子节点** —— 后坐、换弹下沉、切枪、走路摇晃全都
 * 作用在 group 上，手臂自动跟随，一行同步代码都不用写。代价是军刀的转刀
 * 花式会让手跟着滚一圈 —— 正好读作「手腕翻了个面」，可接受。
 *
 * 为什么不直接在 `buildWeaponModel` 里挂：**掉在地上的枪**（`dropped.ts`）
 * 走同一个构建函数，地上的枪不能长手 —— 所以拆成独立函数，只有
 * `viewmodel.ts` 的 `swapModel` 调用。
 *
 * ## 几何
 *
 * 一只手 = 掌（盒）+ 四指（横穿握把前方的细圆柱，读作合抱）+ 拇指（斜管）
 * + 腕球；前臂 = 一根从腕伸到画外的锥形圆柱（袖子）。手指和雷体/护木**故意
 * 轻微穿插** —— 低模下「嵌进去一点」比「悬空一毫米」更像真的握住。
 * 袖子比腕球大一圈，自然形成「袖口盖住手套」的层次。
 *
 * 坐标全是枪模局部坐标（原点在握把上方机匣尾部，−z 朝枪口）。GLB 与程序化
 * 两条路的包络已归一到同一组坐标（见 GLB 一节），摆位两条路通用。
 */

/** 一只「右手握竖直握把」的手：握持轴 = 本地 Y，手背朝 +z/+x，拇指在 −x 侧。 */
function buildGripHand(m: Record<string, THREE.MeshStandardMaterial>): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.038, 0.08, 0.06, 0.005, 0, 0.016, m.glove); // 掌（兜住握把后侧）
  box(g, 0.03, 0.055, 0.014, 0.01, 0.004, 0.05, m.glove); // 手背指节垫
  // 四指：横穿握把前方的圆管，从上往下排，逐根微拧出「合抱」的错落。
  // z −0.028 让指管骑在握把前缘上：一半埋进握把（接缝藏在枪体里），一半露出
  for (let i = 0; i < 4; i += 1) {
    const f = cyl(g, 0.0088, 0.064, 0, 0.026 - i * 0.017, -0.028, m.glove, 8);
    f.rotation.set(0, -0.05 + i * 0.03, Math.PI / 2);
  }
  // 拇指：从虎口斜向前的短管（右手 → 在 −x 侧扣向握把前方）
  const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.011, 0.052, 8), m.glove);
  thumb.position.set(-0.02, 0.02, -0.018);
  thumb.rotation.set(1.25, 0, 0.5);
  g.add(thumb);
  // 腕球：掌底过渡，被袖口盖住一半
  const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), m.glove);
  wrist.position.set(0.006, -0.055, 0.02);
  g.add(wrist);
  return g;
}

/** 两点之间的一根锥形管（前臂/袖子）。`rA` 是腕端半径、`rB` 是肘端半径。 */
function limb(
  parent: THREE.Object3D,
  a: [number, number, number],
  b: [number, number, number],
  rA: number,
  rB: number,
  mat: THREE.Material,
): THREE.Mesh {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rB, rA, len, 10), mat);
  mesh.position.copy(va).add(vb).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  parent.add(mesh);
  return mesh;
}

/** 一只手 + 一段前臂。左手 = 右手模板先绕 y 翻半圈，外层 wrapper 再摆姿态。 */
function addArm(
  arms: THREE.Object3D,
  m: Record<string, THREE.MeshStandardMaterial>,
  side: 'left' | 'right',
  handPos: [number, number, number],
  handRot: [number, number, number],
  wristFrom: [number, number, number],
  elbowTo: [number, number, number],
): void {
  const hand = buildGripHand(m);
  if (side === 'left') {
    // 翻转（chirality）必须先于姿态：wrapper 在外层、hand.rotation.y = π 在内层
    const wrap = new THREE.Group();
    wrap.position.set(...handPos);
    wrap.rotation.set(...handRot);
    hand.rotation.y = Math.PI;
    wrap.add(hand);
    arms.add(wrap);
  } else {
    hand.position.set(...handPos);
    hand.rotation.set(...handRot);
    arms.add(hand);
  }
  limb(arms, wristFrom, elbowTo, 0.032, 0.044, m.sleeve);
}

/**
 * 给一把**第一人称**枪模装手。`dropped.ts` 不调用 —— 地上的枪是空的。
 *
 * 摆位口算过一遍相机投影（FOV 50 + BASE_POSES 的持枪位）：手腕两端都落在
 * 画面外/下沿，只露手背和护木上的托手，和参考图一致。
 */
export function buildFirstPersonArms(id: WeaponId, model: ViewModel): void {
  if (model.arms) return;
  const m = materials();
  const arms = new THREE.Group();
  arms.name = 'fp_arms';

  switch (id) {
    case 'ak47':
    case 'm4a1':
      // 步枪：右手扣握把，左手掌心朝上托住下护木（参考图 1 的持枪式）
      addArm(arms, m, 'right', [0.002, -0.085, 0.105], [0.12, 0, 0], [0.01, -0.142, 0.118], [0.27, -0.6, 0.72]);
      addArm(arms, m, 'left', [-0.004, -0.062, -0.32], [-0.85, 0, 0.12], [0, -0.115, -0.29], [-0.36, -0.62, 0.45]);
      break;
    case 'awm':
      // 端得更开：左手托在前护托下，肘位比步枪更靠外，撑出「重」的架型
      addArm(arms, m, 'right', [0.002, -0.08, 0.105], [0.12, 0, 0], [0.01, -0.137, 0.118], [0.28, -0.62, 0.7]);
      addArm(arms, m, 'left', [-0.004, -0.062, -0.26], [-0.8, 0, 0.12], [0, -0.135, -0.23], [-0.38, -0.64, 0.45]);
      break;
    case 'shotgun':
      // 泵动：左手直接握在护木上（护木就是往复件，参考 CS 的 M870 持枪）
      addArm(arms, m, 'right', [0.002, -0.07, 0.115], [0.12, 0, 0], [0.01, -0.127, 0.128], [0.27, -0.6, 0.72]);
      addArm(arms, m, 'left', [-0.004, -0.07, -0.34], [-0.85, 0, 0], [0, -0.143, -0.31], [-0.36, -0.62, 0.45]);
      break;
    case 'usp':
      // 手枪单手（参考图 2），手的倾角和握把的 −0.18 对齐
      addArm(arms, m, 'right', [0.002, -0.068, 0.062], [-0.18, 0, 0], [0.01, -0.12, 0.09], [0.25, -0.6, 0.6]);
      break;
    case 'knife':
      // 刺击握法：手背朝上扣住刀柄，握持轴从竖直转到沿刀柄方向（参考图 3）。
      // (−1.47, 0, 0.16) 是把模板的 Y 握持轴对到刀柄轴向 (−0.158, 0.099, −0.982)
      addArm(arms, m, 'right', [0.013, -0.002, 0.09], [-1.47, 0, 0.16], [0.028, 0.012, 0.145], [0.3, -0.5, 0.68]);
      break;
    default:
      // 手雷：整只手兜住雷体下半（旧的一块方「手」已删）
      addArm(arms, m, 'right', [0.008, -0.06, 0.008], [0.45, 0, 0.1], [0.02, -0.117, 0.003], [0.26, -0.6, 0.55]);
      break;
  }

  model.group.add(arms);
  model.arms = arms;
}
