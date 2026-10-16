'use client';

import type { ConsoleType } from './emulator';
import type { Translate } from './i18n';

/**
 * 可自定义的键位。
 *
 * ## 为什么只需要改一张表
 *
 * 这个项目里按键有两条路，但它们**共用同一张 RetroArch 配置表**：
 *
 *   1. 本地：RetroArch 自己读键盘，查 `input_playerN_<button>`。
 *   2. 联机注入：`Nostalgist.pressDown({ button, player })` 先查**同一张表**拿到键名，
 *      再合成键盘事件，由 RetroArch 读回去。查表那一步的解码器被我们换成了自己的
 *      （见 `lib/emulator.ts` 的 `overrideInjectionKeyMap` —— Nostalgist 自带那份有 bug）。
 *
 * 所以「改键位」这件事只有一个着力点：把 `input_playerN_*` 换成用户要的键。
 * 两条路一起变，不需要各写一套。
 *
 * ## 存的是 DOM code，不是 key
 *
 * 一律用 `KeyboardEvent.code`（物理键位）。`key` 会被输入法、大小写、以及中文输入
 * 状态影响（`e.key` 会变成 `Process`），不能用来做键位。
 *
 * ## 换算以 RetroArch 为准，不是以 Nostalgist 为准
 *
 * 这张表写出去的值是给 **RetroArch 自己**读的（本地键盘输入那条路），所以键名必须用
 * RetroArch 的命名 —— 见 `input/input_keymaps.c`：
 *
 *   单字符              → `a`..`z`、`0`..`9`
 *   `f1`..`f12`        → 功能键
 *   `num0`..`num9`     → RETROK_0..RETROK_9        ← 字母上方那排数字行
 *   `keypad0`..`keypad9` → RETROK_KP0..RETROK_KP9  ← 小键盘
 *   其余               → 具名表（left / enter / shift / kp_enter …）
 *
 * **别被 Nostalgist 带偏**：它的 `getKeyboardCode`（把配置值反解成 DOM code，原本只用于联机
 * 注入）把上面这两组**写反了** —— 它认为 `num*` 是小键盘、`keypad*` 是数字行，正好和
 * RetroArch 相反。照它去写配置，本地键盘就会错位：小键盘按了没反应、反倒是数字行在动
 * （P2 的面键踩过这个坑，默认键位就落在小键盘上）。
 *
 * 联机注入**已经不走它了**：`EmulatorController` 启动时会把这个解码器换成我们自己的
 * （见 `lib/emulator.ts` 的 `overrideInjectionKeyMap`）—— 换之前，注入会把 `keypad4`
 * 解成 `Digit4`，小键盘面键在联机里全是死的（方向键走具名表，所以只有面键不动，
 * 看着像「方向能用、按键不行」）。现在小键盘键联机也能用。
 *
 * **反过来推不出名字的键一律不接受**。典型的是 `Backslash`：RetroArch 其实认它，
 * 但 Nostalgist 的具名表里 `backslash` 对应空串（`NAMED_KEYS` 干脆剔掉了），配置层面
 * 就写不出去 —— 与其让用户配一个「按了没反应」的键，不如在面板上直接拒绝。
 */

/**
 * RetroArch retropad 的钮名，和 `input_playerN_<button>` 一一对应，三种机种共用。
 *
 * **这不是面板上显示的名字。** 面板走街机叫法（A B C X Y Z / 开始 / 投币），映射按街机惯例：
 * 面板 A→`b`、B→`a`、C→`y`、X→`x`、Y→`l`、Z→`r`、投币→`select`、开始→`start`。
 * 显示名在 `KeyBindingsPanel` 的 `BUTTON_LABELS` / `buttonLabel`，**按机种还能再换一套**
 * （见 `CONSOLE_BUTTON_LABELS` —— NDS 的丝印不是街机那套）。
 */
export type ButtonName =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'b'
  | 'a'
  | 'y'
  | 'x'
  | 'l'
  | 'r'
  | 'l2'
  | 'r2'
  | 'select'
  | 'start';

/**
 * 键位模型里的**全部**钮 —— 存盘、写 RetroArch 配置、查重一律按这一份走。
 *
 * `l2` / `r2` 是 2026-10-15 加的（NDS 那套键位表里有第二排肩键）。它们**不是每种机器
 * 都有**，可键位表必须整份存在（`PlayerBindings` 是 `Record<ButtonName, string>`，
 * 少一个钮就没法表达），所以「模型里有没有这个钮」和「面板上画不画它」是两件事：
 *
 *   · 存储 / 换算 / 查重 → 本表（14 个）；
 *   · 面板与按键说明画哪几个 → `buttonsFor(consoleType)`。
 *
 * 顺序就是面板上的顺序（面板是两列，见 `KeyBindingsPanel` 的网格）。
 */
export const ALL_BUTTONS: readonly ButtonName[] = [
  'up',
  'down',
  'left',
  'right',
  'b',
  'a',
  'y',
  'x',
  'l',
  'r',
  'l2',
  'r2',
  'select',
  'start',
];

/**
 * 面板 / 按键说明**默认**画的那几个 —— 就是原来那 12 个，**不含 `l2` / `r2`**。
 *
 * 为什么默认不画那两颗：肩键的第二排到今天为止只有 NDS 那套键位用得上，其余机种
 * 的面板一直是 12 行、两列正好配成「上/下、左/右、A/B、C/X、Y/Z、投币/开始」。
 * 一起摊出来只会让 NES / 街机的面板凭空多两行用不着的东西。
 */
export const BUTTONS: readonly ButtonName[] = ALL_BUTTONS.filter(
  (button) => button !== 'l2' && button !== 'r2'
);

/**
 * 机种专属的钮表 —— 面板和按键说明按它画。**只列和默认那 12 个不一样的机种**。
 *
 * NDS（2026-10-15）：机身丝印是 A / B / X / Y 四颗面键、L / R / L2 / R2 两对肩键、
 * START / SELECT，所以 14 个钮一个不少。
 *
 * PS1（2026-10-16）：同理 —— △ ○ × □ 四颗面键 + L1 / L2 / R1 / R2 两对肩键 +
 * SELECT / START，也是 14 个。**注意 PS1 还有 L3 / R3（摇杆按下去）**，那两颗不在
 * `ButtonName` 里（模型只有 14 个钮），所以面板上不画、也键不了 —— 少数游戏会用到，
 * 属于已知缺口。
 */
const CONSOLE_BUTTONS: Partial<Record<ConsoleType, readonly ButtonName[]>> = {
  nds: [
    'up',
    'down',
    'left',
    'right',
    'b',
    'a',
    'y',
    'x',
    'l',
    'r',
    'l2',
    'r2',
    'select',
    'start',
  ],
  ps1: [
    'up',
    'down',
    'left',
    'right',
    'b',
    'a',
    'y',
    'x',
    'l',
    'r',
    'l2',
    'r2',
    'select',
    'start',
  ],
};

/**
 * 这个机种在面板 / 按键说明里画哪几个钮。
 *
 * 认不出机种（没插卡带 / 加入者还没连上）或机种没单独登记 → 退回 `BUTTONS`。
 */
export function buttonsFor(consoleType?: ConsoleType | null): readonly ButtonName[] {
  return (consoleType ? CONSOLE_BUTTONS[consoleType] : undefined) ?? BUTTONS;
}

/** 一个玩家的键位表。值一律是 `KeyboardEvent.code`。 */
export type PlayerBindings = Record<ButtonName, string>;

export interface KeyBindings {
  p1: PlayerBindings;
  p2: PlayerBindings;
}

/**
 * 默认键位 —— 一套街机 / 格斗向的键盘布局。
 *
 *   P1  W A S D 移动 · 面键 J K L（面板 A B C）/ U I O（面板 X Y Z）· 投币 B · 开始 Enter
 *   P2  方向键移动 · 小键盘 1 2 4 5 7 8 面键（A B C / X Y Z）· 投币 Delete · 开始 小键盘 0
 *
 * 两套按键刻意完全不重叠：单机双人时两个人共用一块键盘，重叠的键会让双方互相抢输入。
 *
 * P2 的面键跳过了小键盘的 3 和 6，取的是**三行各左边两个**：
 *
 *     7 8 9      ← 面板 Y Z
 *     4 5 6      ← 面板 C X
 *     1 2 3      ← 面板 A B
 *
 * 这样六个面键在小键盘上是一块紧凑的 2×3 矩形，盲按不容易串行。
 *
 * `l2` / `r2`（2026-10-15 随 NDS 加）：**街机 / 红白机那几档根本用不上这两颗**
 * （面板也不画，见 `BUTTONS`），但键位表是整份存的，必须给个不撞车的键填满。
 * 挑的是没被占用的 `Q` / `E`（P1）和小键盘右列剩下的 `9` / `3`（P2）。
 *
 * ⚠️ **NDS 不用这一套** —— 它有自己的 `NDS_DEFAULT_BINDINGS`，见下面那段。
 */
export const DEFAULT_BINDINGS: KeyBindings = {
  p1: {
    up: 'KeyW',
    down: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    b: 'KeyJ',
    a: 'KeyK',
    y: 'KeyL',
    x: 'KeyU',
    l: 'KeyI',
    r: 'KeyO',
    l2: 'KeyQ',
    r2: 'KeyE',
    select: 'KeyB',
    start: 'Enter',
  },
  p2: {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    b: 'Numpad1',
    a: 'Numpad2',
    y: 'Numpad4',
    x: 'Numpad5',
    l: 'Numpad7',
    r: 'Numpad8',
    l2: 'Numpad9',
    r2: 'Numpad3',
    select: 'Delete',
    start: 'Numpad0',
  },
};

/**
 * NDS 的默认键位 —— **单独一套**（2026-10-15 用户给的对照表）。
 *
 * 为什么不能沿用上面那套街机布局：NDS 是竖屏掌机，两只手的分工和街机完全不同 ——
 * 十字键和四颗面键都归**右手拇指**（左边是屏、没有方向键），肩键归食指。用户那张表是：
 *
 *     十字键   ↑ ↓ ← →
 *     A / B    Z / X
 *     X / Y    A / S
 *     L / R    Q / E
 *     L2 / R2  R / W
 *     START    Enter
 *     SELECT   Shift
 *
 * 左边那一片摊在键盘上是
 *
 *     Q W E R     ← L / R2 / R / L2
 *     A S         ← X / Y
 *     Z X         ← A / B
 *
 * —— 左手食指到小指刚好盖住两排肩键和四颗面键，右手整只交给方向键。
 *
 * ⚠️ **P2 那组必须和 P1 完全不重叠。** NDS 是单人机、面板上根本不画玩家 2
 * （见 `KeyBindingsPanel` 的 `soloOnly`），可 `conflictInOtherPlayer` 照样会拿 P2
 * 拦人 —— 而 P1 已经把方向键占了，P2 要是还按全局默认用方向键，用户想给十字键换个
 * 方向键都会被「已绑给玩家 2」挡下。所以 P2 整组挪到小键盘上（反正它不参与实际游戏）。
 */
export const NDS_DEFAULT_BINDINGS: KeyBindings = {
  p1: {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    b: 'KeyX',
    a: 'KeyZ',
    y: 'KeyS',
    x: 'KeyA',
    l: 'KeyQ',
    r: 'KeyE',
    l2: 'KeyR',
    r2: 'KeyW',
    select: 'ShiftLeft',
    start: 'Enter',
  },
  p2: {
    up: 'Numpad8',
    down: 'Numpad2',
    left: 'Numpad4',
    right: 'Numpad6',
    b: 'Numpad1',
    a: 'Numpad3',
    y: 'Numpad7',
    x: 'Numpad9',
    l: 'NumpadDivide',
    r: 'NumpadMultiply',
    l2: 'NumpadSubtract',
    r2: 'NumpadAdd',
    select: 'NumpadDecimal',
    start: 'NumpadEnter',
  },
};

/**
 * PS1 的默认键位 —— **单独一套**（2026-10-16 加，用户拍板的「菱形方案」）。
 *
 * ## 为什么不能沿用街机那套
 *
 * `DEFAULT_BINDINGS` 是给「一排六颗面键」的机器排的（`J K L` 一排 + `U I O` 一排）。
 * 套到 PS1 上四颗面键会落成 `U=△ / J=× / K=○ / L=□` —— △ 跑到 `J` 的**正上方**，
 * 而手柄上 △ 在 □ 和 ○ 的**正中间上方**。看着能用，菱形是歪的。
 *
 * ## 这一套按语义对齐（△=上 / □=左 / ×=下 / ○=右，和十字键同构）
 *
 *     十字键    W A S D          ← 上 / 左 / 下 / 右
 *     △ / □     I / J            ← 上 / 左
 *     × / ○     K / L            ← 下 / 右
 *     L1 / L2   U / Q
 *     R1 / R2   O / E
 *     START     Enter
 *     SELECT    B
 *
 * 于是 `I J K L` 在键盘上正好是一个小十字（`I` 正在 `K` 正上方），和 PS1 手柄的
 * △□×○ 菱形对得上；同时它又是「WASD 那一块整体右移一格」的镜像 —— 左手管方向、
 * 右手管四颗面键，两只手的分工和握着手柄时一致。
 *
 * ⚠️ **肩键换过位**：`l` / `r` 从街机那套的 `I` / `O` 挪到 `U` / `O` —— `I` 让给 △
 *    之后必须换，`U` 是右手上方那颗，食指够得着。`l2` / `r2` 仍是 `Q` / `E`（没动）。
 *
 * ⚠️ **P2 那组直接沿用全局默认**（方向键 + 小键盘）：PS1 支持双人，而这一套 P1
 *    用的是 `WASD` + `IJKL` + `Q/E`，和全局 P2 那组一个键都不撞 —— 单机双人时
 *    两人共用一块键盘不会互相抢键（`conflictInOtherPlayer` 会拦重叠的）。
 *    NDS 那套 P2 之所以要另排，是因为 NDS 是单人机、P1 把方向键占了（见那边注释）。
 */
export const PS1_DEFAULT_BINDINGS: KeyBindings = {
  p1: {
    up: 'KeyW',
    down: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    b: 'KeyK', // ×（下）
    a: 'KeyL', // ○（右）
    y: 'KeyJ', // □（左）
    x: 'KeyI', // △（上）
    l: 'KeyU', // L1
    r: 'KeyO', // R1
    l2: 'KeyQ', // L2
    r2: 'KeyE', // R2
    select: 'KeyB',
    start: 'Enter',
  },
  p2: { ...DEFAULT_BINDINGS.p2 },
};

/**
 * 这个机种在**没自定义过键位**时该用哪一套默认。
 *
 * NDS 和 PS1 各有自己那套（见 `NDS_DEFAULT_BINDINGS` / `PS1_DEFAULT_BINDINGS`），
 * 其余机种共用 `DEFAULT_BINDINGS`。「自定义过没有」由 `loadBindings()` 判 ——
 * 用户改过键位就整份用他的，跟机种无关。
 *
 * ⚠️ 这两套机种专属默认**不进 `LEGACY_DEFAULTS`** —— 那张表认的是「**历史**默认值」，
 *    用来判「这个用户从没改过键位」。机种专属这几套是**当前**默认，放进去没有意义。
 *    副作用（既有设计，NDS 那次就带上了）：本地那份 `nesload:keybindings` 是**全机种共用
 *    一份**，所以在 PS1 上改过一个键之后，再去玩 NES 用的也是那份 —— 改键位是全局的，
 *    想分开只能改存储模型（见 `.workbuddy-ai/memory/REFERENCE.md` 的 PS1 一节）。
 */
export function defaultBindingsFor(consoleType?: ConsoleType | null): KeyBindings {
  if (consoleType === 'nds') return NDS_DEFAULT_BINDINGS;
  if (consoleType === 'ps1') return PS1_DEFAULT_BINDINGS;
  return DEFAULT_BINDINGS;
}

/**
 * 历次发布过的默认键位。
 *
 * 为什么需要留这个：`loadBindings()` 一读到 localStorage 里存的那份就整份用它 —— 这是对的，
 * 不能拿新默认值去覆盖用户的自定义。但副作用是**只改 `DEFAULT_BINDINGS` 对老用户无效**：
 * 他本地存着旧默认值，界面上看着就是「改了没生效」，而他其实一个键都没动过。
 *
 * 所以这里留一份历史：存的那份如果和某个历史默认值**完全一致**，说明他从没改过键位，
 * 那就跟着当前默认值走；只要动过一个键，就整份保留他的。
 *
 * **改 `DEFAULT_BINDINGS` 时把旧的那份挪进来**，老用户才会跟着升。
 *
 * ⚠️ `l2` / `r2` 是 2026-10-15 才进模型的，**这两项在历史版本里压根不存在**。
 * 比对之前 `sanitizePlayer` 会先拿**当前全局默认**的这两项补上（它只补缺项、不补错项），
 * 所以下面每一份历史表里的 `l2` / `r2` 都得写成**当前 `DEFAULT_BINDINGS` 的那两个值**，
 * 否则「从没改过键位」就认不出来了。别改成当年那版真实存在过的值（当年没有值）。
 */
const LEGACY_DEFAULTS: readonly KeyBindings[] = [
  {
    /*
     * 街机布局的上上版（12 个钮）：P1 方向键 / Z X / A S / Q E / Shift / Enter
     * 和 P2 的 I K J L / U O / N M / G H / 1 2。
     *
     * ⚠️ 这一份里 `l` 和 `l2` **都是 `KeyQ`**（`r` / `r2` 都是 `KeyE`），看着像抄错 ——
     * 不是：当年 `l2` / `r2` 还不存在，这两项是按上面那条规矩**补**出来的当前默认值，
     * 而当年 `l` / `r` 恰好就落在 Q / E 上。补出来的表要能和用户本地那份（同样是补出来的）
     * 逐项对上，就不能「顺手去重」。真去重了，这批用户会被判成「自定义过键位」，
     * 于是永远升不到新默认值 —— 而这个站里他们恰恰是从没改过键位的那批人。
     */
    p1: {
      up: 'ArrowUp',
      down: 'ArrowDown',
      left: 'ArrowLeft',
      right: 'ArrowRight',
      b: 'KeyZ',
      a: 'KeyX',
      y: 'KeyA',
      x: 'KeyS',
      l: 'KeyQ',
      r: 'KeyE',
      l2: 'KeyQ',
      r2: 'KeyE',
      select: 'ShiftLeft',
      start: 'Enter',
    },
    p2: {
      up: 'KeyI',
      down: 'KeyK',
      left: 'KeyJ',
      right: 'KeyL',
      b: 'KeyU',
      a: 'KeyO',
      y: 'KeyN',
      x: 'KeyM',
      l: 'KeyG',
      r: 'KeyH',
      l2: 'Numpad9',
      r2: 'Numpad3',
      select: 'Digit1',
      start: 'Digit2',
    },
  },
  {
    /*
     * 街机布局那一版（12 个钮）—— 就是 2026-10-15 之前发布的 `DEFAULT_BINDINGS`，
     * 只是没有 `l2` / `r2` 那两行（按上面那条规矩补成当前默认值）。
     */
    p1: {
      up: 'KeyW',
      down: 'KeyS',
      left: 'KeyA',
      right: 'KeyD',
      b: 'KeyJ',
      a: 'KeyK',
      y: 'KeyL',
      x: 'KeyU',
      l: 'KeyI',
      r: 'KeyO',
      l2: 'KeyQ',
      r2: 'KeyE',
      select: 'KeyB',
      start: 'Enter',
    },
    p2: {
      up: 'ArrowUp',
      down: 'ArrowDown',
      left: 'ArrowLeft',
      right: 'ArrowRight',
      b: 'Numpad1',
      a: 'Numpad2',
      y: 'Numpad4',
      x: 'Numpad5',
      l: 'Numpad7',
      r: 'Numpad8',
      l2: 'Numpad9',
      r2: 'Numpad3',
      select: 'Delete',
      start: 'Numpad0',
    },
  },
];

/** 两份键位表是不是一模一样（`ALL_BUTTONS` 逐一比，含 `l2` / `r2`）。 */
function sameBindings(a: KeyBindings, b: KeyBindings): boolean {
  return (['p1', 'p2'] as const).every((player) =>
    ALL_BUTTONS.every((button) => a[player][button] === b[player][button])
  );
}

/**
 * RetroArch 具名键 → DOM code。
 *
 * 照抄 Nostalgist 内部的 `keyboardCodeMap`，但**剔掉了 `backslash` 和 `tilde`
 * 那两个空串** —— 它们解析出来是空字符串，做注入时会静默失败，所以干脆不提供。
 */
const NAMED_KEYS: Record<string, string> = {
  add: 'NumpadAdd',
  alt: 'AltLeft',
  backquote: 'Backquote',
  backspace: 'Backspace',
  capslock: 'CapsLock',
  comma: 'Comma',
  ctrl: 'ControlLeft',
  del: 'Delete',
  divide: 'NumpadDivide',
  down: 'ArrowDown',
  end: 'End',
  enter: 'Enter',
  equals: 'Equal',
  escape: 'Escape',
  home: 'Home',
  insert: 'Insert',
  kp_enter: 'NumpadEnter',
  kp_equals: 'NumpadEquals',
  kp_minus: 'NumpadSubtract',
  kp_period: 'NumpadDecimal',
  kp_plus: 'NumpadAdd',
  left: 'ArrowLeft',
  leftbracket: 'BracketLeft',
  minus: 'Minus',
  multiply: 'NumpadMultiply',
  numlock: 'NumLock',
  pagedown: 'PageDown',
  pageup: 'PageUp',
  pause: 'Pause',
  period: 'Period',
  print_screen: 'PrintScreen',
  quote: 'Quote',
  ralt: 'AltRight',
  rctrl: 'ControlRight',
  right: 'ArrowRight',
  rightbracket: 'BracketRight',
  rshift: 'ShiftRight',
  scroll_lock: 'ScrollLock',
  semicolon: 'Semicolon',
  shift: 'ShiftLeft',
  slash: 'Slash',
  space: 'Space',
  tab: 'Tab',
  up: 'ArrowUp',
};

/** 具名表反查。`add`/`kp_plus` 这类同码异名只留一个，用哪个都等价。 */
const REVERSE_NAMED: Record<string, string> = Object.fromEntries(
  Object.entries(NAMED_KEYS).map(([name, code]) => [code, name])
);

/**
 * DOM code → RetroArch 键名。返回 null 表示这个键 Nostalgist 认不出来，
 * **不能用于注入**（联机时房主那边会静默丢掉）。
 */
export function codeToRetroArch(code: string): string | null {
  // KeyA..KeyZ → 'a'..'z'。RetroArch 接受 "a".."z" 作单字符键名。
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  // 数字行。RetroArch 的 `num*` 是字母上方那排（input_keymaps.c: "num4" → RETROK_4）。
  if (/^Digit[0-9]$/.test(code)) return `num${code.slice(5)}`;
  // 小键盘。RetroArch 的 `keypad*` 才是小键盘（"keypad4" → RETROK_KP4）。
  if (/^Numpad[0-9]$/.test(code)) return `keypad${code.slice(6)}`;
  if (/^F([1-9]|1[0-2])$/.test(code)) return code.toLowerCase();
  return REVERSE_NAMED[code] ?? null;
}

/** 面板上显示用的短标签。取不到就原样返回 code，至少能看出是什么键。 */
const NAMED_LABELS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ShiftLeft: 'Shift',
  ShiftRight: 'RShift',
  ControlLeft: 'Ctrl',
  ControlRight: 'RCtrl',
  AltLeft: 'Alt',
  AltRight: 'RAlt',
  Space: 'Space',
  Enter: 'Enter',
  Backspace: 'Bksp',
  Tab: 'Tab',
  Escape: 'Esc',
  CapsLock: 'Caps',
  Delete: 'Del',
  Insert: 'Ins',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  PrintScreen: 'PrtSc',
  ScrollLock: 'ScrLk',
  NumLock: 'NumLk',
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num -',
  NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /',
  NumpadDecimal: 'Num .',
  NumpadEnter: 'Num Ent',
  NumpadEquals: 'Num =',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
};

export function codeLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `Num ${code.slice(6)}`;
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  return NAMED_LABELS[code] ?? code;
}

/**
 * 面板上的钮名**默认**走**街机叫法**：方向箭头 + A B C X Y Z + 开始 / 投币。
 *
 * 内部仍是 RetroArch 的 retropad 钮名（`b/a/y/x/l/r/l2/r2/select/start`，见 `ButtonName`），
 * 面板 A→`b`、B→`a`、C→`y`、X→`x`、Y→`l`、Z→`r`。
 *
 * A B C X Y Z 和箭头是手柄丝印、**刻意不翻译**；开始 / 投币是词，跟着语言走
 * （`keybind.btnStart` / `keybind.btnCoin`），所以下面这两项只是英文兜底。
 *
 * 放在这里而不是面板组件里：页脚那行键位说明也要用它，两处必须同源。
 *
 * ⚠️ 这只是**默认**那一套。机种有自己的丝印时要走 `CONSOLE_BUTTON_LABELS`，
 *    统一从 `buttonLabel(button, t, consoleType)` 取，别直接读这张表。
 */
export const BUTTON_LABELS: Record<ButtonName, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  b: 'A',
  a: 'B',
  y: 'C',
  x: 'X',
  l: 'Y',
  r: 'Z',
  l2: 'L2',
  r2: 'R2',
  select: 'COIN',
  start: 'START',
};

/**
 * 机种专属的钮名 —— **只列和街机叫法不一样的钮**。
 *
 * 为什么要有这一层：街机那套（A B C X Y Z）是给「一排六颗面键」的机器用的，
 * 套到丝印完全不同的机器上就会出现**机器上根本不存在的字**。NDS 是最典型的
 * （2026-10-15 用户报的）：它的面板写的是 A / B / X / Y 四颗面键 + L / R 肩键，
 * 套街机叫法会长出「C」「Y」「Z」，而真正要按的 **L / R 反而看不见**。
 *
 * 开始 / 投币这两项也在这里覆盖：NDS 机身丝印是 START / SELECT，不该跟着语言
 * 变成「开始 / 投币」（和 `CONSOLE_LABEL` 一样，丝印词不进文案表）。
 *
 * PS1（2026-10-16）：△ ○ × □ 四颗面键 + L1 / L2 / R1 / R2。
 * ⚠️ 换算**不是**「按丝印顺序对齐」，而是照 libretro 对 PS1 的标准映射：
 *
 *     retropad B → ×    retropad A → ○    retropad Y → □    retropad X → △
 *     L / R → L1 / R1    L2 / R2 → L2 / R2    select / start → SELECT / START
 *
 * 所以面板上「×」落在 `b`、「○」落在 `a`、「□」落在 `y`、「△」落在 `x` ——
 * 看着像打乱，其实是这套机器的标准（pcsx_rearmed 也是这一套）。
 *
 * ⚠️ PS1 这四颗的**值只是「哪颗符号」的记号，不是拿去当文字画的**：`×`(U+00D7) 和
 *    `○`(U+25CB) / `□`(U+25A1) / `△`(U+25B3) 分属两个 Unicode 区，落到两种字体上、
 *    同字号下一颗小、三颗大（2026-10-16 用户报「圈叉三角正方形大小都不是统一的」）。
 *    渲染处一律过 `components/PadGlyph.tsx` 换成**图形** —— 这里保留原字符只是为了
 *    纯文本场合（aria-label、`playerLegend` 的字符串）还能读出「哪一颗」。
 */
const CONSOLE_BUTTON_LABELS: Partial<
  Record<ConsoleType, Partial<Record<ButtonName, string>>>
> = {
  nds: {
    b: 'B',
    a: 'A',
    y: 'Y',
    x: 'X',
    l: 'L',
    r: 'R',
    select: 'SELECT',
    start: 'START',
  },
  ps1: {
    b: '×',
    a: '○',
    y: '□',
    x: '△',
    l: 'L1',
    r: 'R1',
    l2: 'L2',
    r2: 'R2',
    select: 'SELECT',
    start: 'START',
  },
};

/**
 * 取钮名。`consoleType` 决定用哪套丝印（不给就是街机那套）；
 * 开始 / 投币 跟着语言走 —— 但机种表里写了字的话以机种为准。
 */
export function buttonLabel(
  button: ButtonName,
  t: Translate,
  consoleType?: ConsoleType | null
): string {
  const own = consoleType ? CONSOLE_BUTTON_LABELS[consoleType]?.[button] : undefined;
  if (own) return own;
  if (button === 'select') return t('keybind.btnCoin');
  if (button === 'start') return t('keybind.btnStart');
  return BUTTON_LABELS[button];
}

/** 方向键在页脚里的排列顺序，对应键盘上「上左下右」的读法。 */
export const DIRECTION_BUTTONS: readonly ButtonName[] = ['up', 'left', 'down', 'right'];

/**
 * 按键说明里「面键 + 肩键」那一段要列哪几个 —— 就是机种钮表去掉方向和 SELECT / START。
 *
 * 默认（非 NDS）正好是那 6 个：`b a y x l r` → 面板 A B C X Y Z。
 * NDS 多两排肩键，会连 `l2` / `r2` 一起列出来。
 *
 * **不写死一张 `FACE_BUTTONS` 常量**：那样每加一个机种都要回来补一份，
 * 而 `buttonsFor` 已经是「这个机种有哪几个钮」的唯一出处了。
 */
function faceButtonsFor(consoleType?: ConsoleType | null): readonly ButtonName[] {
  return buttonsFor(consoleType).filter(
    (button) =>
      button !== 'select' && button !== 'start' && !DIRECTION_BUTTONS.includes(button)
  );
}

/**
 * 把一位玩家的键位渲染成页脚那一行说明。
 *
 * **必须从实际的 bindings 生成，不能写死文案。** 写死过一次，代价是：页脚描述的是
 * `DEFAULT_BINDINGS`，而面板读的是 localStorage 里那份（改过默认值也不会自动跟随），
 * 于是老用户看到「页脚说 W/A/S/D、面板里却是方向键」——两边都觉得自己是对的。
 *
 * `consoleType` 只影响**钮名和列哪几个钮**（NDS 那套丝印见 `CONSOLE_BUTTON_LABELS`）；
 * 键位本身始终来自 `table`，和机种无关。
 */
export function playerLegend(
  table: PlayerBindings,
  player: 1 | 2,
  t: Translate,
  consoleType?: ConsoleType | null
): string {
  const moves = DIRECTION_BUTTONS.map((button) => codeLabel(table[button])).join('/');
  const faces = faceButtonsFor(consoleType)
    .map((button) => `${codeLabel(table[button])}=${buttonLabel(button, t, consoleType)}`)
    .join(' · ');
  const coin = codeLabel(table.select);
  const start = codeLabel(table.start);

  return (
    `${player}P  ${moves} ${t('legend.moves')} · ${faces}` +
    ` · ${coin}=${buttonLabel('select', t, consoleType)} · ${start}=${buttonLabel('start', t, consoleType)}`
  );
}

/**
 * 键位表 → RetroArch 配置片段（`input_player1_up` 这种）。
 * 转不出名字的键会被跳过 —— 正常流程走不到（入口已校验），这里只是兜底。
 *
 * 遍历的是 `ALL_BUTTONS`（**含 `l2` / `r2`**），不是面板那份 `BUTTONS`：
 * 面板不画不等于核心不用 —— NDS 那套键位里 `L2` / `R2` 是要真按的。
 * 多写出去的 `input_playerN_l2` 对没有这两颗的机器是无害的（核心不读）。
 */
export function bindingsToRetroArch(bindings: KeyBindings): Record<string, string> {
  const out: Record<string, string> = {};
  for (const player of [1, 2] as const) {
    const table = player === 1 ? bindings.p1 : bindings.p2;
    for (const button of ALL_BUTTONS) {
      const name = codeToRetroArch(table[button]);
      if (name) out[`input_player${player}_${button}`] = name;
    }
  }
  return out;
}

/**
 * 键位表 → `code → 钮名` 的反表。
 *
 * 加入者转发按键时用：加入者本机没有模拟器，它只把「哪个物理键」翻成「哪个钮」发给房主，
 * 由房主那边注入成 2P。所以这张反表用的是**加入者自己的 1P 键位** —— 房主怎么配 P2
 * 不影响加入者按什么键（房主那边只按钮名查表拿一个能用的键名去合成事件）。
 *
 * 用 1P 那组不是笔误：联机时两人各在自己的键盘前，抢键不成立，加入者该按自己配惯的那套
 * —— 也就是 1P 那组。2P 那组只服务单机双人共用一块键盘。
 */
export function codeToButton(table: PlayerBindings): Record<string, ButtonName> {
  const out: Record<string, ButtonName> = {};
  // 按 `ALL_BUTTONS` 走：加入者也可能按到 L2 / R2（NDS 那套），漏了就静默转发不出去
  for (const button of ALL_BUTTONS) out[table[button]] = button;
  return out;
}

/**
 * 这个键被这张表里的哪个钮占了？没有就返回 null。
 *
 * 和 `conflictInPlayer` 的区别：那个是「除了我要改的钮，还有谁占着这个键」，
 * 这个是不带排除项的纯反查 —— 用来查**另一个玩家**那边是谁占了这个键。
 */
export function buttonHolding(table: PlayerBindings, code: string): ButtonName | null {
  for (const button of ALL_BUTTONS) {
    if (table[button] === code) return button;
  }
  return null;
}

/**
 * 这个键是不是已经被同一位玩家的别的钮占了？是就返回那个钮。
 * 只做提示用，不在这里改数据 —— 面板要拿它显示冲突原因。
 */
export function conflictInPlayer(
  table: PlayerBindings,
  button: ButtonName,
  code: string
): ButtonName | null {
  for (const other of ALL_BUTTONS) {
    if (other !== button && table[other] === code) return other;
  }
  return null;
}

/**
 * 这个键是不是被**另一位玩家**占了？是就返回 `'p1'` / `'p2'`。
 *
 * 单机双人时两个人共用一块键盘，跨玩家重叠会让双方互相抢输入，所以要拦。
 * 联机时这条其实不成立（两人各在自己的机器上），但拦下来也不算错 —— 默认键位本来
 * 就不重叠，真重叠了多半是配错了。
 */
export function conflictInOtherPlayer(
  bindings: KeyBindings,
  player: 'p1' | 'p2',
  code: string
): 'p1' | 'p2' | null {
  const other: 'p1' | 'p2' = player === 'p1' ? 'p2' : 'p1';
  for (const button of ALL_BUTTONS) {
    if (bindings[other][button] === code) return other;
  }
  return null;
}

const STORAGE_KEY = 'nesload:keybindings';

/**
 * 校验一份玩家键位表：钮齐全、值都是字符串、且 Nostalgist 认得出。
 *
 * `fallback` 是**缺项时的补值**，传的一律是 `DEFAULT_BINDINGS` 那一组（**不跟着机种走**）：
 * `l2` / `r2` 是 2026-10-15 才进模型的，之前存下来的那份里没有这两项。补什么值必须和
 * `LEGACY_DEFAULTS` 里写的一致，否则「从没改过键位」就认不出来、老用户会被当成
 * 自定义过（他本地那份旧默认值就永远升不上来了）。
 *
 * 只补**缺项**，不补错项：值存在但 Nostalgist 认不出来，照样整份判脏。
 */
function sanitizePlayer(input: unknown, fallback: PlayerBindings): PlayerBindings | null {
  if (typeof input !== 'object' || input === null) return null;
  const record = input as Record<string, unknown>;
  const out = {} as PlayerBindings;
  for (const button of ALL_BUTTONS) {
    const code = record[button];
    // 老数据没有 l2 / r2 —— 只有这两项允许缺，别的钮缺一个就是脏数据
    if (code === undefined && (button === 'l2' || button === 'r2')) {
      out[button] = fallback[button];
      continue;
    }
    if (typeof code !== 'string' || !codeToRetroArch(code)) return null;
    out[button] = code;
  }
  return out;
}

/**
 * 读键位。任何一处不合法就**整份**退回默认值，不做局部修补 ——
 * 半份自定义半份默认的组合比全默认更难排查。
 *
 * `consoleType` 只决定**退回默认值时退回哪一套**（NDS / PS1 各有自己那套，见
 * `defaultBindingsFor`）。用户真改过键位的话，存的那份和机种无关、整份用他的 ——
 * 所以载入卡带时可以放心重新调一次这个函数，不会把用户改过的键位冲掉。
 */
export function loadBindings(consoleType?: ConsoleType | null): KeyBindings {
  const fallback = defaultBindingsFor(consoleType);
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return fallback;
    const record = parsed as Record<string, unknown>;
    const p1 = sanitizePlayer(record.p1, DEFAULT_BINDINGS.p1);
    const p2 = sanitizePlayer(record.p2, DEFAULT_BINDINGS.p2);
    if (!p1 || !p2) return fallback;

    const stored: KeyBindings = { p1, p2 };
    /*
     * 存的那份正好是某个历史默认值 → 用户从没改过键位，跟着当前默认值走。
     * 这不算「覆盖用户设置」：一个键都没动过，那就不是他的设置，只是旧默认值的残留。
     */
    if (LEGACY_DEFAULTS.some((legacy) => sameBindings(stored, legacy))) {
      return fallback;
    }
    return stored;
  } catch {
    return fallback;
  }
}

/** 存键位。隐私模式下 localStorage 会抛，静默即可 —— 本次会话里照样生效。 */
export function saveBindings(bindings: KeyBindings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    // 忽略
  }
}

/** 深拷一份默认值，避免调用方改到常量本身。`consoleType` 决定拷哪一套（见 `defaultBindingsFor`）。 */
export function cloneDefaultBindings(consoleType?: ConsoleType | null): KeyBindings {
  const source = defaultBindingsFor(consoleType);
  return {
    p1: { ...source.p1 },
    p2: { ...source.p2 },
  };
}

/**
 * 只把**某一组**恢复成默认值，另一组原样留着。
 *
 * 联机时用：面板上只给你自己那组（两边都是 1P），「恢复默认」要是把两组
 * 一起推回默认，就等于改了对面那组 —— 那是这个面板在联机下唯一不该碰的东西。
 * 单机单人机（NDS）同理：玩家 2 那组面板上根本不画，也就没理由跟着一起推回默认。
 *
 * `consoleType` 决定推回**哪一套**默认（见 `defaultBindingsFor`）——
 * NDS 要推回 NDS 那套，不是街机那套。
 *
 * 刻意写成两个分支而不是 `{ ...bindings, [which]: ... }`：计算属性名会让 TS
 * 把结果推成带索引签名的类型，对不上 `KeyBindings`。
 */
export function resetPlayerBindings(
  bindings: KeyBindings,
  which: 'p1' | 'p2',
  consoleType?: ConsoleType | null
): KeyBindings {
  const source = defaultBindingsFor(consoleType);
  return which === 'p1'
    ? { ...bindings, p1: { ...source.p1 } }
    : { ...bindings, p2: { ...source.p2 } };
}
