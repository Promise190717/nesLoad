'use client';

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
 * 显示名在 `KeyBindingsPanel` 的 `BUTTON_LABELS` / `buttonLabel`。
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
  | 'select'
  | 'start';

/** 面板上的展示顺序：方向 → 面键（A B C / X Y Z）→ 投币 / 开始。 */
export const BUTTONS: readonly ButtonName[] = [
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
  'select',
  'start',
];

/** 一个玩家 12 个钮的键位。值一律是 `KeyboardEvent.code`。 */
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
    select: 'Delete',
    start: 'Numpad0',
  },
};

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
 */
const LEGACY_DEFAULTS: readonly KeyBindings[] = [
  {
    // 街机布局之前那一版：P1 方向键 / Z X / A S / Q E / Shift / Enter
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
      select: 'Digit1',
      start: 'Digit2',
    },
  },
];

/** 两份键位表是不是一模一样（12 个钮逐一比）。 */
function sameBindings(a: KeyBindings, b: KeyBindings): boolean {
  return (['p1', 'p2'] as const).every((player) =>
    BUTTONS.every((button) => a[player][button] === b[player][button])
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
 * 面板上的钮名，走**街机叫法**：方向箭头 + A B C X Y Z + 开始 / 投币。
 *
 * 内部仍是 RetroArch 的 retropad 钮名（`b/a/y/x/l/r/select/start`，见 `ButtonName`），
 * 面板 A→`b`、B→`a`、C→`y`、X→`x`、Y→`l`、Z→`r`。
 *
 * A B C X Y Z 和箭头是手柄丝印、**刻意不翻译**；开始 / 投币是词，跟着语言走
 * （`keybind.btnStart` / `keybind.btnCoin`），所以下面这两项只是英文兜底。
 *
 * 放在这里而不是面板组件里：页脚那行键位说明也要用它，两处必须同源。
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
  select: 'COIN',
  start: 'START',
};

/** 取钮名：开始 / 投币 跟着语言走，其余固定。 */
export function buttonLabel(button: ButtonName, t: Translate): string {
  if (button === 'select') return t('keybind.btnCoin');
  if (button === 'start') return t('keybind.btnStart');
  return BUTTON_LABELS[button];
}

/** 面键在页脚 / 面板上的排列顺序：面板 A B C（下排）→ X Y Z（上排）。 */
export const FACE_BUTTONS: readonly ButtonName[] = ['b', 'a', 'y', 'x', 'l', 'r'];

/** 方向键在页脚里的排列顺序，对应键盘上「上左下右」的读法。 */
export const DIRECTION_BUTTONS: readonly ButtonName[] = ['up', 'left', 'down', 'right'];

/**
 * 把一位玩家的键位渲染成页脚那一行说明。
 *
 * **必须从实际的 bindings 生成，不能写死文案。** 写死过一次，代价是：页脚描述的是
 * `DEFAULT_BINDINGS`，而面板读的是 localStorage 里那份（改过默认值也不会自动跟随），
 * 于是老用户看到「页脚说 W/A/S/D、面板里却是方向键」——两边都觉得自己是对的。
 */
export function playerLegend(
  table: PlayerBindings,
  player: 1 | 2,
  t: Translate
): string {
  const moves = DIRECTION_BUTTONS.map((button) => codeLabel(table[button])).join('/');
  const faces = FACE_BUTTONS.map(
    (button) => `${codeLabel(table[button])}=${buttonLabel(button, t)}`
  ).join(' · ');
  const coin = codeLabel(table.select);
  const start = codeLabel(table.start);

  return (
    `${player}P  ${moves} ${t('legend.moves')} · ${faces}` +
    ` · ${coin}=${buttonLabel('select', t)} · ${start}=${buttonLabel('start', t)}`
  );
}

/**
 * 键位表 → RetroArch 配置片段（`input_player1_up` 这种）。
 * 转不出名字的键会被跳过 —— 正常流程走不到（入口已校验），这里只是兜底。
 */
export function bindingsToRetroArch(bindings: KeyBindings): Record<string, string> {
  const out: Record<string, string> = {};
  for (const player of [1, 2] as const) {
    const table = player === 1 ? bindings.p1 : bindings.p2;
    for (const button of BUTTONS) {
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
 * 由房主那边注入成 2P。所以这张反表用的是**加入者自己的 2P 键位** —— 房主怎么配 P2
 * 不影响加入者按什么键（房主那边只按钮名查表拿一个能用的键名去合成事件）。
 */
export function codeToButton(table: PlayerBindings): Record<string, ButtonName> {
  const out: Record<string, ButtonName> = {};
  for (const button of BUTTONS) out[table[button]] = button;
  return out;
}

/**
 * 这个键被这张表里的哪个钮占了？没有就返回 null。
 *
 * 和 `conflictInPlayer` 的区别：那个是「除了我要改的钮，还有谁占着这个键」，
 * 这个是不带排除项的纯反查 —— 用来查**另一个玩家**那边是谁占了这个键。
 */
export function buttonHolding(table: PlayerBindings, code: string): ButtonName | null {
  for (const button of BUTTONS) {
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
  for (const other of BUTTONS) {
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
  for (const button of BUTTONS) {
    if (bindings[other][button] === code) return other;
  }
  return null;
}

const STORAGE_KEY = 'nesload:keybindings';

/** 校验一份玩家键位表：12 个钮齐全、值都是字符串、且 Nostalgist 认得出。 */
function sanitizePlayer(input: unknown): PlayerBindings | null {
  if (typeof input !== 'object' || input === null) return null;
  const record = input as Record<string, unknown>;
  const out = {} as PlayerBindings;
  for (const button of BUTTONS) {
    const code = record[button];
    if (typeof code !== 'string' || !codeToRetroArch(code)) return null;
    out[button] = code;
  }
  return out;
}

/**
 * 读键位。任何一处不合法就**整份**退回默认值，不做局部修补 ——
 * 半份自定义半份默认的组合比全默认更难排查。
 */
export function loadBindings(): KeyBindings {
  if (typeof localStorage === 'undefined') return DEFAULT_BINDINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BINDINGS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_BINDINGS;
    const record = parsed as Record<string, unknown>;
    const p1 = sanitizePlayer(record.p1);
    const p2 = sanitizePlayer(record.p2);
    if (!p1 || !p2) return DEFAULT_BINDINGS;

    const stored: KeyBindings = { p1, p2 };
    /*
     * 存的那份正好是某个历史默认值 → 用户从没改过键位，跟着当前默认值走。
     * 这不算「覆盖用户设置」：一个键都没动过，那就不是他的设置，只是旧默认值的残留。
     */
    if (LEGACY_DEFAULTS.some((legacy) => sameBindings(stored, legacy))) {
      return DEFAULT_BINDINGS;
    }
    return stored;
  } catch {
    return DEFAULT_BINDINGS;
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

/** 深拷一份默认值，避免调用方改到常量本身。 */
export function cloneDefaultBindings(): KeyBindings {
  return {
    p1: { ...DEFAULT_BINDINGS.p1 },
    p2: { ...DEFAULT_BINDINGS.p2 },
  };
}

/**
 * 只把**某一组**恢复成默认值，另一组原样留着。
 *
 * 联机时用：面板上只给你自己那组（房主 = 1P、加入者 = 2P），「恢复默认」要是把两组
 * 一起推回默认，就等于改了对面那组 —— 那是这个面板在联机下唯一不该碰的东西。
 *
 * 刻意写成两个分支而不是 `{ ...bindings, [which]: ... }`：计算属性名会让 TS
 * 把结果推成带索引签名的类型，对不上 `KeyBindings`。
 */
export function resetPlayerBindings(bindings: KeyBindings, which: 'p1' | 'p2'): KeyBindings {
  return which === 'p1'
    ? { ...bindings, p1: { ...DEFAULT_BINDINGS.p1 } }
    : { ...bindings, p2: { ...DEFAULT_BINDINGS.p2 } };
}
