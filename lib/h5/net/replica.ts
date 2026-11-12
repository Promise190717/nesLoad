import { Vector3 } from 'three';
import { clamp, damp, normalizeAngle } from '../math';
import type { Actor, Team, WeaponId } from '../types';
import {
  ACTOR_DEATHS,
  ACTOR_DEATH_TIME,
  ACTOR_FLAGS,
  ACTOR_GRENADES,
  ACTOR_HEIGHT,
  ACTOR_HP,
  ACTOR_ID,
  ACTOR_KILLS,
  ACTOR_MAG,
  ACTOR_NAME,
  ACTOR_PITCH,
  ACTOR_TEAM,
  ACTOR_VX,
  ACTOR_VZ,
  ACTOR_WEAPON,
  ACTOR_X,
  ACTOR_Y,
  ACTOR_YAW,
  ACTOR_Z,
  F_ALIVE,
  F_CROUCH,
  F_GROUND,
  F_HUMAN,
  F_LOADOUT,
  F_RELOADING,
  F_SCOPED,
  indexToWeapon,
  num,
  str,
  type ActorWire,
} from './protocol';

/**
 * 加入者本地的**角色副本** —— 只负责「把快照里那一行变成能渲染的 Actor」。
 *
 * 它不跑 AI、不跑物理、不结算伤害：所有事实都来自房主的快照。位置和朝向做
 * 指数平滑，因为快照只有 20Hz —— 直接赋值会让远处的人一顿一顿地跳。
 *
 * 平滑的代价是「看到的位置比真实位置晚几十毫秒」。对 10 米外的人来说是 10 厘米，
 * 看不出来；对本机自己的角色（`engine` 里那份 `Player`）**不做平滑**，否则
 * 走路会有「踩在冰上」的拖沓感。
 */
export class ReplicaActor implements Actor {
  readonly id: string;
  readonly name: string;
  readonly team: Team;
  readonly isPlayer = false;
  isHuman: boolean;

  pos = new Vector3();
  vel = new Vector3();
  radius = 0.4;
  height = 1.8;
  yaw = 0;
  pitch = 0;
  health = 100;
  armor = 0;
  alive = true;
  kills = 0;
  deaths = 0;
  weapon: WeaponId = 'ak47';
  protectUntil = 0;
  deathTime = 0;
  lastHitBy: Actor | null = null;

  /* ---- 副本专用（不参与 Actor 契约，渲染/HUD 会读） ---- */
  /** 平滑目标位置。`step()` 每帧把 `pos` 往这里拉 */
  readonly target = new Vector3();
  targetVx = 0;
  targetVz = 0;
  crouching = false;
  scoped = false;
  reloading = false;
  canChangeLoadout = false;
  onGround = true;
  mag = 0;
  grenades = 0;
  /** 这一帧有没有收到过数据（没收到的角色不上屏） */
  live = false;

  private targetYaw = 0;
  private targetPitch = 0;

  constructor(wire: ActorWire) {
    this.id = str(wire, ACTOR_ID, 'net');
    this.name = str(wire, ACTOR_NAME, 'Player');
    this.team = num(wire, ACTOR_TEAM, 0) === 1 ? 1 : 0;
    this.isHuman = true;
    this.apply(wire, true);
  }

  /**
   * 吃一行快照。
   *
   * `snap = true` 表示这是第一次 / 重生后的第一帧 —— 位置直接赋值，不做平滑，
   * 否则「在 A 点被打死、在 B 点复活」会看到尸体从 A 滑到 B。
   */
  apply(wire: ActorWire, snap = false): void {
    const flags = num(wire, ACTOR_FLAGS, 0);
    const x = num(wire, ACTOR_X, 0);
    const y = num(wire, ACTOR_Y, 0);
    const z = num(wire, ACTOR_Z, 0);

    this.target.set(x, y, z);
    if (snap) this.pos.set(x, y, z);

    this.targetYaw = num(wire, ACTOR_YAW, 0);
    this.targetPitch = num(wire, ACTOR_PITCH, 0);
    if (snap) {
      this.yaw = this.targetYaw;
      this.pitch = this.targetPitch;
    }

    this.targetVx = num(wire, ACTOR_VX, 0);
    this.targetVz = num(wire, ACTOR_VZ, 0);
    if (snap) this.vel.set(this.targetVx, 0, this.targetVz);

    const alive = (flags & F_ALIVE) !== 0;
    if (alive && !this.alive) {
      // 复活：位置/朝向重置，别让尸体滑过去
      this.pos.copy(this.target);
      this.yaw = this.targetYaw;
      this.pitch = this.targetPitch;
    }

    this.alive = alive;
    this.health = num(wire, ACTOR_HP, 0);
    this.kills = num(wire, ACTOR_KILLS, 0);
    this.deaths = num(wire, ACTOR_DEATHS, 0);
    this.weapon = indexToWeapon(num(wire, ACTOR_WEAPON, 0));
    this.height = clamp(num(wire, ACTOR_HEIGHT, 1.8), 0.9, 2);
    this.deathTime = num(wire, ACTOR_DEATH_TIME, 0);
    this.mag = num(wire, ACTOR_MAG, 0);
    this.grenades = num(wire, ACTOR_GRENADES, 0);

    this.crouching = (flags & F_CROUCH) !== 0;
    this.scoped = (flags & F_SCOPED) !== 0;
    this.reloading = (flags & F_RELOADING) !== 0;
    this.canChangeLoadout = (flags & F_LOADOUT) !== 0;
    this.onGround = (flags & F_GROUND) !== 0;
    this.live = true;
    // 人机也走这条路径（人机在快照里就是 `isHuman = 0` 的角色）
    this.isHuman = (flags & F_HUMAN) !== 0;
  }

  /** 每帧平滑。`dt` 是真实帧步长。 */
  step(dt: number): void {
    if (!this.alive) return;
    // 22 的 λ ≈ 45ms 收敛到 63%：20Hz 的快照下既不抖也不拖
    this.pos.x = damp(this.pos.x, this.target.x, 22, dt);
    this.pos.y = damp(this.pos.y, this.target.y, 22, dt);
    this.pos.z = damp(this.pos.z, this.target.z, 22, dt);
    this.vel.x = damp(this.vel.x, this.targetVx, 18, dt);
    this.vel.z = damp(this.vel.z, this.targetVz, 18, dt);
    this.yaw += normalizeAngle(this.targetYaw - this.yaw) * Math.min(1, dt * 18);
    this.pitch = damp(this.pitch, this.targetPitch, 18, dt);
  }
}

/** 把一行快照里的阵营读出来（新建副本时用，避免先 new 再 apply 的重复解析）。 */
export function teamOf(wire: ActorWire): Team {
  return num(wire, ACTOR_TEAM, 0) === 1 ? 1 : 0;
}
