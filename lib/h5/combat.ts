import type { Vector3 } from 'three';
import { type Point3, spreadDir } from './math';
import { type Collider, type ShotHit, losClear, traceShot } from './physics';
import type { Actor, Surface, WeaponId } from './types';
import { type WeaponSpec, WEAPONS, damageFalloff } from './weapons';

/**
 * 伤害结算与开火 —— **玩家和 Bot 走完全相同的这条路径**。
 *
 * 这一点是刻意的：如果给玩家写一套「射线 + 衰减 + 爆头」，给 Bot 再写一套
 * 「随机命中」，两边的手感差异会立刻暴露（Bot 隔着木箱打人、玩家打不死人）。
 * 现在两边都只是「调 `fireWeapon` 的一个 Actor」，命中判定、穿透、衰减、护甲
 * 全部只有一份实现。
 *
 * ## 副作用怎么出去
 *
 * 这个文件**不碰场景、不碰音效、不碰 React**。命中之后要冒血雾、要响一声、
 * 要往击杀播报里塞一条 —— 那些通过 `CombatHooks` 回调出去，由 `engine.ts`
 * 接住。好处是这里可以纯逻辑测试，也保证了「一枪打出去发生了几件事」只有
 * 一个地方在编排。
 */

/** 时钟。全工程只用这一个（`performance.now()` 毫秒 → 秒）。 */
export function nowSeconds(): number {
  return performance.now() / 1000;
}

export interface CombatHooks {
  /** 有人被扣血（还没死）。`damage` 是护甲吸收后的实际伤害。 */
  onActorHit?: (
    target: Actor,
    attacker: Actor | null,
    head: boolean,
    damage: number,
    point: Point3,
    dir: Point3,
  ) => void;
  /** 子弹打在几何体上。`surface` 决定火花颜色和音效。 */
  onWorldHit?: (point: Point3, normal: Point3, surface: Surface, dir: Point3) => void;
  /** 有人死了。`attacker` 可能是 null（比如自己炸自己）。 */
  onKill?: (attacker: Actor | null, victim: Actor, weapon: WeaponId, head: boolean) => void;
  /**
   * 有人开了一枪（**每次击发一次**，不是每颗弹丸）。Bot 的枪口火光靠它。
   *
   * `endT` 是本次击发**最远的命中距离**（从 `fireWeapon` 结果里取最远的 `t`，
   * 什么都没打中就是 0）—— 观察者拿它画曳光，终点贴着真实弹着点而不是画到
   * 一个伪造的固定距离。方向信息以 `dir` 为准，两个参数合起来就是完整弹道。
   */
  onShot?: (shooter: Actor, weapon: WeaponId, origin: Point3, dir: Point3, endT: number) => void;
}

/* ============================================================
   伤害
   ============================================================ */

/**
 * 结算一次伤害。返回「这一下打死了没」。
 *
 * ## `rawDamage` 的约定
 *
 * 传进来的必须是**已经算过距离衰减**的伤害（`fireWeapon` 里 `spec.damage ×
 * 穿透折扣 × damageFalloff(...)`）。距离衰减**不在这里**做，是因为它需要 `hit.t`
 * —— 那是射线量出来的弹道长度，只有 `fireWeapon` 有。这一层只负责「部位倍率
 * → 护甲 → 扣血 → 死亡」。
 *
 * 顺序有讲究：出生保护 → 爆头倍率 → 护甲吸收 50% → 扣血 → 死亡判定。
 * 护甲在爆头之后算，所以「满甲被 AWM 爆头」依然是一枪死 —— 这是有意的，
 * 狙击枪的定位就是「一枪一个」，让它被护甲吃掉一半伤害就没意义了。
 *
 * 推给 HUD 的 `damage` 是**扣完护甲的真实值**，不是配置表里的原始数字 ——
 * 所以界面上看到的伤害和实际掉血永远是同一个数。
 */
export function applyDamage(
  target: Actor | null,
  rawDamage: number,
  attacker: Actor | null,
  head: boolean,
  weaponId: WeaponId,
  point: Point3,
  dir: Point3,
  hooks: CombatHooks,
): boolean {
  if (!target || !target.alive) return false;

  // 出生保护：重生后 2 秒无敌，防止「刚复活就被对面架着点死」
  if (target.protectUntil > 0 && nowSeconds() < target.protectUntil) return false;

  const spec = WEAPONS[weaponId];
  let damage = rawDamage * (head ? spec.headMul : 1);

  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, damage * 0.5);
    target.armor -= absorbed;
    damage -= absorbed;
  }

  target.health -= damage;
  target.lastHitBy = attacker;

  hooks.onActorHit?.(target, attacker, head, damage, point, dir);

  if (target.health <= 0) {
    target.health = 0;
    killActor(target, attacker, weaponId, head, hooks);
    return true;
  }
  return false;
}

/** 记一次死亡。击杀数只在「不是自己打死自己」时加。 */
export function killActor(
  victim: Actor,
  attacker: Actor | null,
  weaponId: WeaponId,
  head: boolean,
  hooks: CombatHooks,
): void {
  if (!victim.alive) return;
  victim.alive = false;
  victim.deaths += 1;
  // 归零而不是写当前时间：死亡后由 update 每帧 `+= dt` 累加，
  // 两种时钟混用会让重生计时忽快忽慢
  victim.deathTime = 0;
  if (attacker && attacker !== victim) attacker.kills += 1;
  hooks.onKill?.(attacker, victim, weaponId, head);
}

/* ============================================================
   开火
   ============================================================ */

export interface FireOptions {
  /** 圆锥半角（弧度）。不传就按武器基础散布。 */
  spread?: number;
  /** 最大射程（米） */
  maxDist?: number;
  /**
   * 伤害倍率。不传 = 1。
   *
   * 存在的唯一理由：**Bot 和玩家打的是同一张 `WEAPONS` 表**，如果为了削弱 Bot
   * 去改表里的 `damage`，玩家手里那把枪会跟着一起变弱。倍率走参数，
   * 武器属性还是那一份。
   */
  damageMul?: number;
}

/**
 * 一次击发：按 `pellets` 打若干条射线，逐条结算。
 *
 * 返回**每一颗弹丸**的结果（包括打空的 `none`），每条都带自己的 `dir` 和落点。
 * 调用方画曳光 / 算观察者视角的弹道时，必须用结果里的 `dir` 或 `point`，
 * 不能退回传进来的 `dir` —— 那个是未加散布的基础朝向，用它画曳光等于把散布抹掉。
 */
export function fireWeapon(
  shooter: Actor,
  weaponId: WeaponId,
  origin: Point3,
  dir: Vector3,
  actors: readonly Actor[],
  colliders: readonly Collider[],
  hooks: CombatHooks,
  options: FireOptions = {},
): ShotHit[] {
  const spec = WEAPONS[weaponId];
  const pellets = Math.max(1, spec.pellets);
  const maxDist = options.maxDist ?? 160;
  const damageMul = options.damageMul ?? 1;
  const results: ShotHit[] = [];

  // 复用一个临时方向向量：一枪 8 颗弹丸时能省 8 次分配
  const aim = { x: 0, y: 0, z: 0 } as Vector3;

  for (let i = 0; i < pellets; i += 1) {
    // 散布默认值取**武器基础散布**，绝不默认 0。
    //
    // 上一版这里是「单发武器不传 spread 就按 0」，于是只要有一条调用路径漏传
    // `options.spread`，步枪/手枪/狙击就退化成「指哪打哪的激光」—— 而配置表里的
    // spread 看着还在，改数值也不会有任何变化。这正是「参数改了但没被射击逻辑
    // 读取」最难查的形态，兜底必须落在武器表上。
    // 开镜后的极小散布由调用方显式传（`currentSpread` 已经乘过 0.05）。
    const spread = options.spread ?? spec.spread.base;
    spreadDir(dir, spread, aim);

    const hit = traceShot(origin, aim, maxDist, actors, colliders, shooter, spec.pen);

    if (hit.type === 'actor') {
      // 伤害的四步，**顺序固定**（爆头/部位倍率在 `applyDamage` 里乘，也就是最后）：
      //
      //   ① 基础伤害     spec.damage
      //   ② 穿透折扣     hit.dmgMul（穿一层木箱 ×0.4）
      //   ③ 距离衰减     damageFalloff(spec, hit.t) —— hit.t 是射线起点到命中点的米数
      //   ④ 部位倍率     ×headMul（在 applyDamage 里，见那里的注释）
      //
      // ③ 在 ④ 之前是需求明确要求的：先算「这把枪在这个距离上还剩多少伤害」，
      // 再套爆头。反过来（先乘爆头再乘衰减）在数学上等价，但会让「远距离爆头」
      // 的数值散落在两处、排查时对不上账 —— 而且一旦将来给部位倍率加下限，
      // 顺序就会真的影响结果。
      //
      // 玩家和 Bot 走的都是这一条路径（`damageMul` 只是 Bot 的整体折扣，乘法位置
      // 无所谓），所以不存在「客户端一套、服务端另一套」的第二份实现。
      const falloff = damageFalloff(spec, hit.t);
      const damage = spec.damage * hit.dmgMul * falloff * damageMul;
      applyDamage(hit.actor, damage, shooter, hit.head, weaponId, hit.point, aim, hooks);
    } else if (hit.type === 'world') {
      hooks.onWorldHit?.(hit.point, hit.normal, hit.collider.surf, aim);
    }

    // `none`（打空）也进结果：调用方要靠 `hit.dir` 知道这一发**实际飞到哪去了**。
    // 打空的一发如果被丢掉，曳光就只能退回基础朝向 —— 那又变成中心射线了
    results.push(hit);
  }

  return results;
}

/* ============================================================
   近战
   ============================================================ */

/** 一次挥砍的参数。扇形、距离、轻重都由调用方从武器表里取，这里不写死。 */
export interface MeleeOptions {
  heavy: boolean;
  /** 扇形的**全角**（度）。轻击宽（70°）、重击窄（46°） */
  arc: number;
  /** 攻击距离（米）。重击由调用方额外 +`HEAVY_REACH_BONUS` */
  reach: number;
  /** 本次挥砍已经打过的目标 —— 同一次挥砍绝不重复结算 */
  already?: ReadonlySet<Actor>;
}

/**
 * 挥刀：以视线为轴的**扇形**判定，只打最近的一个。
 *
 * ## 为什么是扇形而不是射线
 *
 * 近战距离只有 2 米出头，玩家在贴脸时会大幅度甩视角。用射线判会经常
 * 「明明砍到了却没伤害」；扇形宽容得多，手感才像刀。
 *
 * ## 为什么要每帧调一次
 *
 * 这不是「按下就结算一次」的老写法 —— 调用方在**判定窗口内每帧**调一次，
 * 于是这一刀打的是「刀扫过去的那条轨迹」：起手时敌人还在 2.5 米外、挥到一半
 * 才踏进 2.2 米，照样砍得到；反过来，起手时贴着、挥到一半跳开了，就砍空。
 * 这正是需求里「判定窗口内做多次检测，模拟挥过去的轨迹」的落点。
 *
 * `already` 保证同一次挥砍只结算一次伤害 —— 否则一帧一结算，一刀能打十下。
 */
export function meleeSwing(
  attacker: Actor,
  eye: Point3,
  dir: Point3,
  actors: readonly Actor[],
  hooks: CombatHooks,
  options: MeleeOptions,
): Actor | null {
  const spec = WEAPONS.knife;
  const reach = options.reach;
  const damage = options.heavy ? (spec.heavyDamage ?? 90) : spec.damage;
  // 半角余弦：扇形全角 70° → 半角 35° → cos ≈ 0.819。比原来的固定 0.55 宽容
  const cosHalf = Math.cos((options.arc * 0.5 * Math.PI) / 180);

  let best: Actor | null = null;
  let bestDistance = Infinity;

  for (const other of actors) {
    if (other === attacker || !other.alive || other.team === attacker.team) continue;
    if (options.already?.has(other)) continue;

    // 从**胸口**量距离和角度：只用脚底的话，贴脸时判出来的角度偏差很大，
    // 表现成「砍空气」
    const dx = other.pos.x - attacker.pos.x;
    const dz = other.pos.z - attacker.pos.z;
    const dy = other.pos.y + other.height * 0.5 - eye.y;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distance > reach) continue;

    const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / (distance || 1);
    if (dot < cosHalf) continue;

    if (distance < bestDistance) {
      bestDistance = distance;
      best = other;
    }
  }

  if (best) {
    const point = { x: best.pos.x, y: best.pos.y + best.height * 0.5, z: best.pos.z };
    applyDamage(best, damage, attacker, false, 'knife', point, dir, hooks);
  }
  return best;
}

/* ============================================================
   手雷
   ============================================================ */

/**
 * 爆炸结算。
 *
 * 伤害曲线用 `t²`（`t = 1 - d/r`）而不是线性：线性会让「边缘 8 米外还能炸掉
 * 三分之一血」，玩家体感是「手雷范围大得离谱」。平方之后只有贴脸才致命。
 *
 * 遮挡判定只挡几何体（`losClear`）—— 站在集装箱后面能挡爆炸，站在队友后面不能。
 */
export function grenadeBlast(
  center: Point3,
  owner: Actor | null,
  actors: readonly Actor[],
  colliders: readonly Collider[],
  hooks: CombatHooks,
): void {
  const spec = WEAPONS.grenade;
  const radius = spec.radius ?? 8;
  const minDamage = spec.minDamage ?? 20;

  for (const actor of actors) {
    if (!actor.alive) continue;

    const target = { x: actor.pos.x, y: actor.pos.y + actor.height * 0.5, z: actor.pos.z };
    const distance = Math.hypot(target.x - center.x, target.y - center.y, target.z - center.z);
    if (distance > radius) continue;
    if (!losClear(center, target, colliders)) continue;

    const t = 1 - distance / radius;
    const damage = minDamage + (spec.damage - minDamage) * (t * t);
    const dir = {
      x: (target.x - center.x) / (distance || 1),
      y: (target.y - center.y) / (distance || 1),
      z: (target.z - center.z) / (distance || 1),
    };
    applyDamage(actor, damage, owner, false, 'grenade', target, dir, hooks);
  }
}

/* ============================================================
   散布
   ============================================================ */

/** 算散布需要的「射手当前状态」。玩家和 Bot 各填一份。 */
export interface AimState {
  /** 水平速度（米/秒） */
  speed: number;
  onGround: boolean;
  scoped: boolean;
  /** 连射累积的额外散布 */
  accum: number;
}

/** 奔跑时的参考速度。速度占它多少比例，就吃多少移动惩罚。 */
const RUN_SPEED = 5.4;

/**
 * 当前这一枪的实际散布（弧度）。**这是散布的唯一算法**，玩家和 Bot 都走它。
 *
 * 五项按固定顺序叠加，顺序本身就是需求里的手感：
 *
 *   ① 基准 + 连发累积 —— 第一发最准，按住不放越打越散（`accum` 由击发方累加、
 *      停火后自己衰减回 0）。累积**单独**夹在 0.85×max，给下面几项留出叠加空间；
 *   ② 移动 —— 按速度占奔跑速度的比例线性叠加。**是加法**，所以「移动连发」一定
 *      比「静止连发」更散，不会被连发累积先顶到上限而看不出区别；
 *   ③ 姿态 —— 空中更散（×>1），乘法叠加在①+②之上。这一项原来还管「蹲下更准」，
 *      蹲下功能整体移除后只剩空中；
 *   ④ 开镜 —— ×0.05 只压「站桩」那部分散布；移动惩罚在开镜之后**再加一次全额**
 *      （2026-11-12 用户要求「开镜移动时子弹落点不要很准」）。之前移动惩罚先加、
 *      再被 ×0.05 一起压掉，开镜滑步等于指哪打哪；现在开镜急走约 +0.027 rad
 *      （scoped 减速到 0.45 倍速 → 比例 0.45 × move），远距离明显打偏。
 *      不开镜的路径与旧版逐字节一致。
 *   ⑤ 上限 —— 最后统一夹到 `spread.max`，任何组合都不会失控。
 *
 * ⚠️ 累积的 0.85×max 夹取**必须发生在②之前**：这样 `base + accum` 永远自己顶不到
 * `max`，移动 / 姿态才有可叠加的空间。上一版把 `accum` 加在最后、和 base+move 一起
 * 被 max 夹死，于是连发打满之后「移动更散」这一条就再也看不出来了（两种状态都是
 * 同一个 max 值）。
 */
export function currentSpread(spec: WeaponSpec, state: AimState): number {
  const s = spec.spread;

  // ① 基准 + 连发累积
  let spread = s.base + Math.min(state.accum, s.max * 0.85);

  // ② 移动（加法，跑满 = +move）
  if (state.speed > 0.4) spread += s.move * Math.min(1, state.speed / RUN_SPEED);

  // ③ 姿态（乘法）
  if (!state.onGround) spread *= s.air;

  // ④ 开镜：×0.05 之后把移动惩罚全额补回（站桩开镜依然是激光，移动开镜不准）
  if (state.scoped) {
    spread *= 0.05;
    if (state.speed > 0.4) spread += s.move * Math.min(1, state.speed / RUN_SPEED);
  }

  // ⑤ 上限
  return Math.min(spread, s.max);
}
