'use client';

/**
 * 可自定义的键位。
 *
 * ## 为什么只需要改一张表
 *
 * 这个项目里按键有两条路，但它们**共用同一张 RetroArch 配置表**：
 *
 *   1. 本地：RetroArch 自己读键盘，查 `input_playerN_<button>`。
 *   2. 联机注入：`Nostalgist.pressDown({ button, player })` 内部先
 *      `getKeyboardCode(button, player)` 去查**同一张表**拿到键名，再合成键盘事件，
 *      由 RetroArch 读回去（`nostalgist.js` 的 `pressDown` 就是这么实现的）。
 *
 * 所以「改键位」这件事只有一个着力点：把 `input_playerN_*` 换成用户要的键。
 * 两条路一起变，不需要各写一套。
 *
 * ## 存的是 DOM code，不是 key
 *
 * 一律用 `KeyboardEvent.code`（物理键位）。`key` 会被输入法、大小写、以及中文输入
 * 状态影响（`e.key` 会变成 `Process`），不能用来做键位。
 *
 * ## 和 Nostalgist 的换算必须严格对齐
 *
 * `getKeyboardCode` 的规则（照抄自 `nostalgist.js`）：
 *
 *   单字符         → `Key${大写}`          → 我们反过来存成小写单字符
 *   `f1`..`f12`   → `F1`..`F12`
 *   `num0`..`num9`→ `Numpad0`..`Numpad9`
 *   `keypad0`..`keypad9` → `Digit0`..`Digit9`   ← 注意：数字行叫 keypad，小键盘才叫 num
 *   其余          → 查具名表
 *
 * **反过来推不出名字的键一律不接受**。典型的是 `Backslash`：Nostalgist 的具名表里
 * `backslash` 对应的是空串，拿它做注入会静默失效 —— 与其让用户配一个「按了没反应」
 * 的键，不如在面板上直接拒绝。
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
 *   P2  方向键移动 · 小键盘 1-6 面键（A B C / X Y Z）· 投币 Delete · 开始 小键盘 0
 *
 * 两套按键刻意完全不重叠：单机双人时两个人共用一块键盘，重叠的键会让双方互相抢输入。
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
    y: 'Numpad3',
    x: 'Numpad4',
    l: 'Numpad5',
    r: 'Numpad6',
    select: 'Delete',
    start: 'Numpad0',
  },
};

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
  // KeyA..KeyZ → 'a'..'z'。Nostalgist 对单字符键名会拼回 `Key${大写}`。
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  // 数字行：RetroArch 叫 keypad，不是 num（num 是小键盘）。
  if (/^Digit[0-9]$/.test(code)) return `keypad${code.slice(5)}`;
  if (/^Numpad[0-9]$/.test(code)) return `num${code.slice(6)}`;
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
    return { p1, p2 };
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
