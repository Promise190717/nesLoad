'use client';

import type { ButtonName } from './keybindings';

/**
 * 浏览器手柄 → RetroPad 钮名。
 *
 * ## 这个文件为什么存在
 *
 * 引擎自己会读手柄（RetroArch 的 `rwebpad` 驱动），但**只对房主有效** —— 加入者本机
 * 没有模拟器，手柄按下去没有任何东西在看它。联机那条链路上，「物理输入 → 钮名」这一步
 * 从来都是我们自己做的（键盘走 `codeToButton`），手柄得补上同一件事。
 *
 * ## 映射表必须和引擎那份一模一样
 *
 * 否则同一个手柄在两个人手里手感不同：房主本机按「下键」出 A，加入者按同一个键出 B。
 * 引擎那份是 RetroArch **内置的 SDL 标准手柄 autoconfig**，直接从核心的 wasm 里读出来的：
 *
 *     input_b_btn = 0   input_a_btn = 1   input_y_btn = 2   input_x_btn = 3
 *     input_l_btn = 4   input_r_btn = 5   input_l2_btn = 6  input_r2_btn = 7
 *     input_select_btn = 8   input_start_btn = 9
 *     input_l3_btn = 10  input_r3_btn = 11
 *     input_up_btn = 12  input_down_btn = 13  input_left_btn = 14  input_right_btn = 15
 *
 * 下标就是 W3C 标准布局（`gamepad.mapping === 'standard'`）的 `buttons` 下标。
 *
 * **前两位是反的，这不是笔误**：手柄的「下键」（Xbox A / PS ✕）落在 RetroPad 的 **B** 上，
 * 「右键」（Xbox B / PS ○）才是 RetroPad 的 **A**。这是 RetroArch 的既定行为，实测过
 * （伪造手柄按下 `buttons[1]` 时，NES 的 A 键响应）。
 *
 * 站内只有 12 个钮（`ButtonName`），所以 l2/r2/l3/r3 和 guide（16）在这里是 `null` ——
 * 送过去房主也注入不了，`bindingsToRetroArch` 里没有对应的键位项，纯属白发包。
 *
 * ## 为什么不做 `mapping !== 'standard'` 的分支
 *
 * 非标准布局设备的 `buttons` 下标是各家长各家的（有的把 d-pad 放前面、有的把摇杆放开头），
 * 没有通吃的办法，引擎也一样只能靠 autoconfig 逐个设备适配。这里按标准布局处理，
 * 非标准设备最多是键位错乱 —— 但也比完全不能用好，而且和引擎的失败方式一致。
 */
const BUTTONS_BY_INDEX: readonly (ButtonName | null)[] = [
  'b', // 0  下键（Xbox A / PS ✕）
  'a', // 1  右键（Xbox B / PS ○）
  'y', // 2  左键（Xbox X / PS □）
  'x', // 3  上键（Xbox Y / PS △）
  'l', // 4  LB / L1
  'r', // 5  RB / R1
  null, // 6  LT / L2 —— 站内没有这个钮
  null, // 7  RT / R2 —— 同上
  'select', // 8  Back / Share
  'start', // 9  Start / Options
  null, // 10 L3 —— 没有
  null, // 11 R3 —— 没有
  'up', // 12 十字键上
  'down', // 13 十字键下
  'left', // 14 十字键左
  'right', // 15 十字键右
];

/**
 * 左摇杆推到多少算「按下」。
 *
 * 0.5 是绝大多数模拟器的常用值，也够躲开摇杆自己的回中漂移（正常手柄静止时抖动在 0.1 内）。
 * 取得太低会让手一碰就开始走，游戏里没法站住。
 */
const STICK_THRESHOLD = 0.5;

/**
 * 只用到这几个字段的最小结构。
 *
 * 不直接用 DOM 的 `Gamepad` 类型，是为了让 Node 里做单测时能随手造一个对象，
 * 不必去凑 `vibrationActuator` / `timestamp` 那一堆用不到的东西。
 */
export interface PadSnapshot {
  buttons: readonly { pressed: boolean }[];
  /** 标准布局下 [0]/[1] 是左摇杆的 X / Y（右正、下正） */
  axes?: readonly number[];
}

/**
 * 一个手柄当前按着的钮。纯函数，可单测。
 *
 * 十字键和左摇杆**都**映射到方向：引擎默认不开 `input_analog_dpad_mode`（摇杆不驱动方向键），
 * 这里是故意放宽的 —— 加入者手上只有这个手柄、本机也没有引擎要迁就，而很多手柄的十字键
 * 手感很糟、玩家习惯推摇杆。多这一条只影响加入者自己，不会和房主那边的行为打架。
 */
export function buttonsFromPad(pad: PadSnapshot): ButtonName[] {
  const out = new Set<ButtonName>();

  for (let index = 0; index < BUTTONS_BY_INDEX.length; index++) {
    const button = BUTTONS_BY_INDEX[index];
    if (button && pad.buttons[index]?.pressed) out.add(button);
  }

  const [x = 0, y = 0] = pad.axes ?? [];
  if (x <= -STICK_THRESHOLD) out.add('left');
  else if (x >= STICK_THRESHOLD) out.add('right');
  if (y <= -STICK_THRESHOLD) out.add('up');
  else if (y >= STICK_THRESHOLD) out.add('down');

  return [...out];
}

/**
 * 所有已连接手柄当前按着的钮（多个手柄取并集）。
 *
 * 取并集而不是「只用第一个」：加入者可能插着一个手柄又在用键盘，也可能随手插了两个 ——
 * 这些情况下「哪个能用」不该由我们挑，全都要能按得动。
 */
export function readGamepads(): Set<ButtonName> {
  const out = new Set<ButtonName>();
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return out;

  for (const pad of navigator.getGamepads()) {
    // 槽位可能为空（拔掉的手柄 / 没连满 4 个）
    if (!pad) continue;
    for (const button of buttonsFromPad(pad)) out.add(button);
  }
  return out;
}
