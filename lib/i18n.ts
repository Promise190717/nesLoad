/**
 * 极简 i18n：不引第三方库，也不做按语言分路由。
 *
 * 语言解析顺序（服务端与客户端共用同一套逻辑，因此首屏渲染结果与水合结果必然一致）：
 *   1. cookie —— 用户手动切换过语言
 *   2. Accept-Language —— 浏览器设置（等价于 navigator.languages）
 *   3. 英文 —— 一条都没匹配上时的兜底
 *
 * 为什么由服务端读 Accept-Language 而不是客户端读 navigator.language：
 * 客户端读只能在挂载后 setState，中文用户会先看到一帧英文再翻成中文。
 * 主题那边靠内联脚本躲掉了闪烁，文案没法用同样的办法，所以从请求头拿。
 *
 * 这里只放「常驻在界面上的文案」。屏幕里没有任何提示语，所以载入失败、存档结果
 * 这类一次性反馈没有对应条目 —— 它们的表现是画面本身（雪花 / 游戏画面）和
 * 面板按钮的可用状态。
 */

export type Locale = 'zh' | 'en';

/** 兜底语言：任何语言标签都匹配不上时用它。 */
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * cookie 名刻意用下划线：RFC 6265 的 token 不允许 `:`，
 * 而 localStorage 的 `nesload:theme` / `nesload:state:*` 不受这个限制。
 */
export const LOCALE_COOKIE = 'nesload_locale';

/** 英文是基准表，中文必须逐键对齐（漏键会在编译期报错）。 */
const en = {
  'meta.description':
    'An NES / SFC cartridge loader that runs in your browser. Drop a ROM onto the console and play.',

  'notice.desktopOnly':
    'This room is desktop-only. Widen your browser window to at least 1100px.',

  'theme.toDark': 'Switch to night mode',
  'theme.toLight': 'Switch to day mode',
  'locale.toZh': '切换到中文',
  'locale.toEn': 'Switch to English',
  'fullscreen.enter': 'Fullscreen the game screen',
  'fullscreen.exit': 'Exit fullscreen',

  'slot.pick': 'Click to choose a ROM file, or drop one here',
  'slot.srLabel': 'Insert cartridge (choose a ROM file)',

  'panel.resume': 'Resume',
  'panel.pause': 'Pause',
  'panel.save': 'Save',
  'panel.load': 'Load',
  'panel.import': 'Import',
  'panel.export': 'Export',
  'panel.eject': 'Eject',

  'volume.down': 'Volume down one step',
  'volume.up': 'Volume up one step',
  'volume.set': 'Set volume to {level} of {max}',

  /*
   * 存档槽。列表浮在房间上，不在屏幕里 —— 「屏幕内不放任何文案」是硬规矩。
   */
  'saves.title': 'Load state',
  'saves.load': 'Load',
  'saves.close': 'Close',

  'library.empty': 'No cartridges yet — games you load will line up here',
  'library.recent': 'Recently loaded',
  'library.launchTitle': '{name}\nClick to load, or drag it into the TV slot',
  'library.removeLabel': 'Remove {name}',

  /*
   * 键位表。刻意**不用** font-pixel：Press Start 2P 没有中日韩字形，
   * 而这几条是给人读懂的说明（原版 `1P ARROWS / Z X / A S / Q E / SHIFT / ENTER`
   * 只列键名不说对应关系，等于没说明），所以走系统字体。
   * 行首的 1P / 2P / 快捷键 直接写在串里，省得再拆一层。
   */
  'legend.p1':
    '1P (default)  D-pad moves · Z=B · X=A · A/S=Y/X · Q/E=L/R · Shift=Select · Enter=Start',
  'legend.p2': '2P (default)  I/J/K/L moves · U=B · O=A · N/M=Y/X · G/H=L/R · 1=Select · 2=Start',
  'legend.shortcut': 'Keys  P Pause · R Reset · F5 Save · F8 Load — bindings are customizable (top right)',

  /*
   * 联机面板。同样浮在房间上、不进屏幕。
   * `netplay.codePlaceholder` 两行都保持 ASCII：房间码输入框走 font-pixel
   * （Press Start 2P），该字模没有中日韩字形，写中文会掉到等宽字体上。
   */
  'netplay.title': 'Netplay',
  'netplay.open': 'Play over the network',
  'netplay.close': 'Close',
  'netplay.create': 'Create a room',
  'netplay.or': 'or',
  'netplay.join': 'Join',
  'netplay.codePlaceholder': 'CODE',
  'netplay.hint':
    'Both sides only need to reach the public relay — same LAN works best. Read the 4-character code out to the other player. The host runs the emulator and streams the picture; the guest does not need the ROM.',
  'netplay.roomCode': 'Room code',
  'netplay.copy': 'Copy',
  'netplay.copied': 'Copied',
  'netplay.connected': 'Connected',
  'netplay.waiting': 'Waiting for the other player',
  'netplay.waitingGame': 'Connected — waiting for the host to load a cartridge',
  'netplay.hostPlaying': 'Host is playing',
  'netplay.youAreHost':
    'You are player 1. Load a cartridge and the picture is pushed to the guest automatically. Default keys: D-pad, Z, X, A, S, Q, E, Shift, Enter — customizable at the top right.',
  'netplay.youAreGuest':
    'You are player 2. No cartridge needed — the host streams the picture. Your keys are sent to the host. Default keys: I, J, K, L, U, O, N, M, G, H, 1, 2 — customizable at the top right.',
  'netplay.leave': 'Leave room',
  'netplay.badCode': 'That code does not look right — it should be 4 characters.',
  'netplay.errInsecure':
    'Netplay needs HTTPS or localhost. This page is on plain http, so the browser withholds the crypto API it relies on.',
  'netplay.errNoDirect':
    'Both sides reached the relay, but no direct connection could be opened — usually NAT or a firewall. Same LAN works best.',
  'netplay.errPassword': 'Room code mismatch.',
  'netplay.errHandshake': 'Handshake timed out — the other player may have left.',
  'netplay.errUnknown':
    'Could not connect to the other player. The browser console has the exact reason.',

  /*
   * 自定义按键面板。同样浮在房间上、不进屏幕。
   * 钮名（B/A/Y/X/L/R/SELECT/START）刻意不进文案表 —— 它们是手柄上的丝印，
   * 由 `KeyBindingsPanel` 的 BUTTON_LABELS 直接给出，翻了反而对不上页脚。
   */
  'keybind.title': 'Key bindings',
  'keybind.open': 'Customize keys',
  'keybind.close': 'Close',
  'keybind.p1': 'Player 1',
  'keybind.p2': 'Player 2',
  'keybind.pressKey': 'PRESS…',
  'keybind.reset': 'Restore defaults',
  'keybind.unsupported': 'That key cannot be used — try another one.',
  'keybind.conflictSame': 'Already bound to {button} — try another one.',
  'keybind.conflictOther':
    'Also bound to player {player} ({button}). On one keyboard the two of you will fight over it.',
  'keybind.hint':
    'The keyboard map is read once, when a cartridge loads — load one again for changes to apply. In one-keyboard two-player, keep the two sets from overlapping.',
  'keybind.hostHint':
    'You are the host: Player 1 is your own keys, Player 2 is what the guest’s input is injected as. Load a cartridge again after changing either.',
  'keybind.guestHint':
    'You are the guest and play with the Player 2 keys. Changes take effect right away — no need to load a cartridge again.',
  'keybind.guestLocalHint':
    'You are the guest, and a cartridge of your own is running here too. Player 1 drives that local cartridge — load it again after changing. Player 2 is what gets sent to the host and applies right away.',
} as const;

export type MessageKey = keyof typeof en;

const zh: Record<MessageKey, string> = {
  'meta.description': '在浏览器里运行的 NES / SFC 卡带加载器，把卡带拖到游戏机上即可开始。',

  'notice.desktopOnly': '这个房间只在桌面端开放，请把浏览器窗口拉宽到 1100px 以上。',

  'theme.toDark': '切换到夜晚模式',
  'theme.toLight': '切换到白天模式',
  'locale.toZh': '切换到中文',
  'locale.toEn': '切换到英文',
  'fullscreen.enter': '游戏画面全屏',
  'fullscreen.exit': '退出全屏',

  'slot.pick': '点击选择 ROM 文件，或把文件拖到这里',
  'slot.srLabel': '插入卡带（选择 ROM 文件）',

  'panel.resume': '继续',
  'panel.pause': '暂停',
  'panel.save': '存档',
  'panel.load': '读档',
  'panel.import': '导入',
  'panel.export': '导出',
  'panel.eject': '弹出',

  'volume.down': '音量减一档',
  'volume.up': '音量加一档',
  'volume.set': '把音量设为第 {level} 档（共 {max} 档）',

  'saves.title': '读档',
  'saves.load': '加载',
  'saves.close': '关闭',

  'library.empty': '还没有卡带，载入过的游戏会摆在这里',
  'library.recent': '最近载入',
  'library.launchTitle': '{name}\n点击载入，或拖到电视机卡槽里',
  'library.removeLabel': '移除 {name}',

  'legend.p1': '1P（默认）方向键移动 · Z=B · X=A · A/S=Y/X · Q/E=L/R · Shift=选择 · Enter=开始',
  'legend.p2': '2P（默认）I/J/K/L 移动 · U=B · O=A · N/M=Y/X · G/H=L/R · 1=选择 · 2=开始',
  'legend.shortcut': '快捷键  P 暂停 · R 重置 · F5 存档 · F8 读档 —— 键位可在右上角自定义',

  'netplay.title': '联机',
  'netplay.open': '联机对战',
  'netplay.close': '关闭',
  'netplay.create': '创建房间',
  'netplay.or': '或',
  'netplay.join': '加入',
  // 保持 ASCII：输入框走 font-pixel，该字模没有中日韩字形
  'netplay.codePlaceholder': 'CODE',
  'netplay.hint':
    '双方都能访问公共中继即可，同一个局域网更佳。把 4 位房间码念给对方。房主负责跑游戏、把画面推过去，加入者不需要有卡带。',
  'netplay.roomCode': '房间码',
  'netplay.copy': '复制',
  'netplay.copied': '已复制',
  'netplay.connected': '已连接',
  'netplay.waiting': '等待对方加入',
  'netplay.waitingGame': '已连接，等房主插上卡带',
  'netplay.hostPlaying': '房主正在玩',
  'netplay.youAreHost':
    '你是 1P。插上卡带后画面会自动推给对方。默认键位：方向键、Z、X、A、S、Q、E、Shift、Enter —— 可在右上角自定义。',
  'netplay.youAreGuest':
    '你是 2P。不需要卡带，房主会把画面推过来；你的按键会发给房主。默认键位：I、J、K、L、U、O、N、M、G、H、1、2 —— 可在右上角自定义。',
  'netplay.leave': '离开房间',
  'netplay.badCode': '房间码不对，应该是 4 位。',
  'netplay.errInsecure':
    '联机需要 HTTPS 或 localhost。当前页面是普通 http，浏览器不提供它依赖的加密接口。',
  'netplay.errNoDirect':
    '双方都连上了中继，但建不起直连 —— 通常是 NAT 或防火墙。同一个局域网成功率最高。',
  'netplay.errPassword': '房间码对不上。',
  'netplay.errHandshake': '握手超时，对方可能已经离开了。',
  'netplay.errUnknown': '连不上对方。具体原因在浏览器控制台里。',

  'keybind.title': '自定义按键',
  'keybind.open': '自定义按键',
  'keybind.close': '关闭',
  'keybind.p1': '玩家 1',
  'keybind.p2': '玩家 2',
  'keybind.pressKey': '按下新键…',
  'keybind.reset': '恢复默认',
  'keybind.unsupported': '这个键不能用，换一个。',
  'keybind.conflictSame': '已经绑给「{button}」了，换一个。',
  'keybind.conflictOther': '和玩家 {player} 的「{button}」重复了 —— 单机双人时两个人会抢这个键。',
  'keybind.hint':
    '键盘映射只在插卡带时读一次，改完要重新插一次才生效。单机双人时，两套键位不要重叠。',
  'keybind.hostHint':
    '你是房主：玩家 1 是你自己的键，玩家 2 是用来把加入者的输入注入本机的。两组改完都要重新插一次卡带。',
  'keybind.guestHint': '你是加入者，用玩家 2 的键位。改完立刻生效，不用重新插卡带。',
  'keybind.guestLocalHint':
    '你是加入者，本机还跑着一盘自己的卡带。玩家 1 给本机那盘用，改完要重新插卡带；玩家 2 是发给房主的，立刻生效。',
};

const messages: Record<Locale, Record<MessageKey, string>> = { en, zh };

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function isLocale(value: unknown): value is Locale {
  return value === 'zh' || value === 'en';
}

/**
 * 把一串语言标签收敛成受支持的 locale。
 * 顺序即优先级：zh-CN → zh，en-GB → en，fr → 跳过继续看下一个。
 * 全部匹配不上时返回 DEFAULT_LOCALE（英文）。
 */
export function resolveLocale(tags: readonly string[]): Locale {
  for (const tag of tags) {
    const lower = tag.trim().toLowerCase();
    if (lower.startsWith('zh')) return 'zh';
    if (lower.startsWith('en')) return 'en';
  }
  return DEFAULT_LOCALE;
}

/**
 * `zh-CN,zh;q=0.9,en;q=0.8` → ['zh-CN', 'zh', 'en']
 * 刻意不按 q 值重排：浏览器发出的顺序本身就是偏好顺序，
 * 顺着读即可，也省得为一个玩具项目引入完整的 RFC 4647 匹配。
 */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part) => part.split(';')[0].trim())
    .filter(Boolean);
}

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>
): string {
  const template = messages[locale][key];
  if (!vars) return template;
  // 认不出的占位符原样留下，比渲染成 undefined 好排查
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
}
