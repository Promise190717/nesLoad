import type { Locale } from '../i18n';
import type { Team } from './types';

/**
 * H5 游戏**内部**的界面文案。
 *
 * 为什么不进 `lib/i18n.ts`：那是站点的界面语言表，18 种语言、每加一个键就要
 * 在 18 个文件里各补一条。游戏里的按钮和 HUD 属于**内容**（和「这款游戏叫什么名字」
 * 同一层级，见 `lib/game-text.ts`），所以这里只做站点最主要的三种：
 * 简体 / 繁体 / 英文，其余语言回退英文。
 *
 * 加第四种语言 = 这里加一个 `Record<TextKey, string>`，不用动 18 张站点文案表。
 * 这和 `lib/legal.ts`（四语言 + 其余回退英文）是同一套取舍。
 *
 * ⚠️ 占位符 `{count}` / `{fps}` / `{kills}` / `{deaths}` 必须原样保留，
 *    `h5Text()` 在运行时替换。
 * ⚠️ 枪名（AK-47 / M4A1 / AWM / M870 / USP）**不翻译**，所以不在这张表里；
 *    只有「尼泊尔军刀」「高爆手雷」这种有实义的名称需要翻。
 */

const ZH = {
  /* 通用 */
  title: '运输船枪战',
  tagline: '第一人称射击 · AK-47 / M4A1 / AWM · 10 人对抗人机',
  'unit.minute': '分钟',
  'unit.second': '秒',

  /* 开始界面 */
  'start.eyebrow': '第一人称射击',
  'start.begin': '开始战斗',
  'start.settings': '设置',
  'start.hint': 'WASD 移动 · 左键开火 · 右键开镜 · R 换弹 · B 换枪',
  'start.difficulty': '人机强度',
  'setup.difficulty.easy': '轻松',
  'setup.difficulty.normal': '普通',
  'setup.difficulty.hard': '凶狠',

  /* 阵营 */
  'team.a': '保卫者',
  'team.b': '潜伏者',

  /* 武器（枪名不翻，只有这两个有实义） */
  'weapon.knife': '尼泊尔军刀',
  'weapon.grenade': '高爆手雷',

  /* HUD */
  'hud.hp': '生命',
  'hud.armor': '护甲',
  'hud.ammo': '弹药',
  'hud.time': '剩余',
  'hud.kills': '人头',
  'hud.deaths': '阵亡',
  'hud.reloading': '换弹中',
  // 死亡倒计时条上的标签。秒数由组件用等宽字单独显示，这里不要再带 `{s}`
  'hud.dead': '重生中',
  'hud.you': '你',
  'hud.fps': '{fps} FPS',
  'hud.target': '目标 {count}',
  'hud.killsLeft': '还差 {count} 个',
  'hud.scoreboard': '计分板',
  'hud.spawnHint': '按 B 换枪',
  'hud.grenade': '手雷',

  /* 击杀播报 */
  'feed.world': '世界',

  /* 死亡信息卡 */
  'death.killer': '击杀者',
  'death.head': '爆头',
  'death.body': '躯干',

  /* 连杀播报 */
  'streak.2': '双杀',
  'streak.3': '三杀',
  'streak.4': '四杀',
  'streak.high': '无人能挡',

  /* 换枪菜单 */
  'buy.title': '换枪',
  'buy.hint': '复活后 5 秒内、未开过枪时可换枪',
  'buy.locked': '复活时限已过或已开枪，无法换枪',
  'buy.current': '当前',
  'buy.close': '关闭',

  /* 设置 */
  'settings.title': '设置',
  'settings.sensitivity': '鼠标灵敏度',
  'settings.adsSensitivity': '开镜鼠标灵敏度',
  'settings.volume': '音量',
  'settings.fov': '视野范围',
  'settings.quality': '渲染精度',
  'settings.quality.low': '流畅',
  'settings.quality.mid': '均衡',
  'settings.quality.high': '精细',
  'settings.reset': '恢复默认',
  'settings.close': '关闭',
  'settings.controls': '键位',
  'settings.controls.move': 'W A S D 移动 · Shift 静步',
  'settings.controls.fire': '左键开火 · 右键开镜（仅 AWM）',
  'settings.controls.reload': 'R 换弹',
  'settings.controls.jump': '空格 跳跃',
  'settings.controls.crouch': 'C / Ctrl 下蹲',
  'settings.controls.weapon': '1 / 2 / 3 / 4 或滚轮切武器 · B 换枪（出生点）· Q 切回上一把',
  'settings.controls.grenade': 'G 快速扔雷',
  'settings.controls.pause': 'Esc 暂停',
  'settings.touch': '触屏：左下摇杆移动，右侧拖动转视角',

  /* 结算 */
  'result.win': '你赢了',
  'result.lose': '这一局输了',
  'result.draw': '平局',
  'result.mvp': 'MVP',
  'result.summary': '人头 {kills} · 阵亡 {deaths}',
  'result.again': '再来一局',
  'result.leave': '返回专栏',

  /* 暂停 */
  'pause.title': '已暂停',
  'pause.resume': '继续战斗',
  'pause.restart': '重新开始',
  'pause.quit': '退出对局',
  'pause.settings': '设置',

  /* 其它 */
  'hint.lock': '点击画面继续',
  'hint.loading': '正在准备…',
  'menu.back': '返回专栏',

  /* 触屏 */
  'touch.fire': '开火',
  'touch.aim': '开镜',
  'touch.jump': '跳',
  'touch.crouch': '蹲',
  'touch.reload': '换弹',
  'touch.grenade': '雷',
  'touch.buy': '换枪',

  /* 局域网联机 */
  'net.entry': '局域网联机',
  'net.title': '局域网联机',
  'net.subtitle': '房主开局即 1 真人 + 9 人机 · 其他人随时可以中途加入',
  'net.single': '单人 / 人机',
  'net.create': '创建房间',
  'net.join': '加入房间',
  'net.code': '房间码',
  'net.codePlaceholder': '5 位房间码',
  'net.rooms': '附近的房间',
  'net.roomsEmpty': '还没发现房间。可以让房主把邀请链接发给你，或者直接输房间码。',
  'net.name': '你的名字',
  'net.namePlaceholder': '留空用默认名',
  'net.teamTitle': '选择阵营',
  'net.teamHint': '加入后会替换该阵营的 1 名人机，场上始终是 10 个角色',
  'net.humans': '真人 {count}',
  'net.bots': '人机 {count}',
  'net.canJoin': '可加入',
  'net.full': '已满',
  'net.joining': '正在加入…',
  'net.waitingHost': '等待房主回应…',
  'net.connecting': '正在连接…',
  'net.copyLink': '复制邀请链接',
  'net.copied': '已复制',
  'net.leave': '退出联机',
  'net.back': '返回',
  'net.room': '房间 {code}',
  'net.hostBadge': '房主',
  'net.guestBadge': '加入者',
  'net.pending': '{count} 人正在选阵营',
  'net.startHint': '创建房间后立刻开局，不用等其他人',
  'net.leftTitle': '房主已离开',
  'net.leftHint': '房间已经关闭。可以回开始界面自己开一局，或者重新加入别的房间。',
  'net.endedTitle': '对局已结束',
  'net.endedHint': '这一局不再接受新玩家。回开始界面可以再开一局。',
  'net.err.insecure-context': '需要 https 或 localhost：局域网用 IP 直接打开时浏览器不给建连',
  'net.err.bad-code': '房间码不对（5 位字母数字）',
  'net.err.no-room': '没找到这个房间：码可能不对，或者房主不在',
  'net.err.no-direct-connection': '两端连不上（NAT / 防火墙），换一台机器或改用有线网络试试',
  'net.err.handshake': '握手超时，房主可能刚离开',
  'net.err.team-full': '这个阵营已经没有人机可以替换了',
  'net.err.match-ended': '对局已经结束，不能再加入',
  'net.err.already-joined': '你已经在场上了',
  'net.err.room-full': '房间满了（10 个角色全是真人）',
  'net.err.host-left': '房主已经离开房间',
  'net.err.join-failed': '加入失败，详情见控制台',
  'hud.bot': '机',
} as const;

export type H5TextKey = keyof typeof ZH;

const ZH_TW: Record<H5TextKey, string> = {
  title: '運輸船槍戰',
  tagline: '第一人稱射擊 · AK-47 / M4A1 / AWM · 10 人對抗人機',
  'unit.minute': '分鐘',
  'unit.second': '秒',

  'start.eyebrow': '第一人稱射擊',
  'start.begin': '開始戰鬥',
  'start.settings': '設定',
  'start.hint': 'WASD 移動 · 左鍵開火 · 右鍵開鏡 · R 換彈 · B 換槍',
  'start.difficulty': '人機強度',
  'setup.difficulty.easy': '輕鬆',
  'setup.difficulty.normal': '普通',
  'setup.difficulty.hard': '兇狠',

  'team.a': '保衛者',
  'team.b': '潛伏者',

  'weapon.knife': '尼泊爾軍刀',
  'weapon.grenade': '高爆手榴彈',

  'hud.hp': '生命',
  'hud.armor': '護甲',
  'hud.ammo': '彈藥',
  'hud.time': '剩餘',
  'hud.kills': '人頭',
  'hud.deaths': '陣亡',
  'hud.reloading': '換彈中',
  'hud.dead': '重生中',
  'hud.you': '你',
  'hud.fps': '{fps} FPS',
  'hud.target': '目標 {count}',
  'hud.killsLeft': '還差 {count} 個',
  'hud.scoreboard': '計分板',
  'hud.spawnHint': '按 B 換槍',
  'hud.grenade': '手榴彈',

  'feed.world': '世界',

  'death.killer': '擊殺者',
  'death.head': '爆頭',
  'death.body': '軀幹',

  'streak.2': '雙殺',
  'streak.3': '三殺',
  'streak.4': '四殺',
  'streak.high': '無人能擋',

  'buy.title': '換槍',
  'buy.hint': '復活後 5 秒內、未開過槍時可換槍',
  'buy.locked': '復活時限已過或已開槍，無法換槍',
  'buy.current': '目前',
  'buy.close': '關閉',

  'settings.title': '設定',
  'settings.sensitivity': '滑鼠靈敏度',
  'settings.adsSensitivity': '開鏡滑鼠靈敏度',
  'settings.volume': '音量',
  'settings.fov': '視野範圍',
  'settings.quality': '渲染精度',
  'settings.quality.low': '流暢',
  'settings.quality.mid': '均衡',
  'settings.quality.high': '精細',
  'settings.reset': '恢復預設',
  'settings.close': '關閉',
  'settings.controls': '按鍵',
  'settings.controls.move': 'W A S D 移動 · Shift 靜步',
  'settings.controls.fire': '左鍵開火 · 右鍵開鏡（僅 AWM）',
  'settings.controls.reload': 'R 換彈',
  'settings.controls.jump': '空白鍵 跳躍',
  'settings.controls.crouch': 'C / Ctrl 蹲下',
  'settings.controls.weapon': '1 / 2 / 3 / 4 或滾輪切武器 · B 換槍（出生點）· Q 切回上一把',
  'settings.controls.grenade': 'G 快速丟雷',
  'settings.controls.pause': 'Esc 暫停',
  'settings.touch': '觸控：左下搖桿移動，右側拖曳轉視角',

  'result.win': '你贏了',
  'result.lose': '這一局輸了',
  'result.draw': '平局',
  'result.mvp': 'MVP',
  'result.summary': '人頭 {kills} · 陣亡 {deaths}',
  'result.again': '再來一局',
  'result.leave': '返回專欄',

  'pause.title': '已暫停',
  'pause.resume': '繼續戰鬥',
  'pause.restart': '重新開始',
  'pause.quit': '離開對局',
  'pause.settings': '設定',

  'hint.lock': '點擊畫面繼續',
  'hint.loading': '正在準備…',
  'menu.back': '返回專欄',

  'touch.fire': '開火',
  'touch.aim': '開鏡',
  'touch.jump': '跳',
  'touch.crouch': '蹲',
  'touch.reload': '換彈',
  'touch.grenade': '雷',
  'touch.buy': '換槍',

  /* 局域網聯機 */
  'net.entry': '局域網聯機',
  'net.title': '局域網聯機',
  'net.subtitle': '房主開局即 1 真人 + 9 人機 · 其他人隨時可以中途加入',
  'net.single': '單人 / 人機',
  'net.create': '建立房間',
  'net.join': '加入房間',
  'net.code': '房間碼',
  'net.codePlaceholder': '5 位房間碼',
  'net.rooms': '附近的房間',
  'net.roomsEmpty': '還沒發現房間。可以讓房主把邀請連結發給你，或直接輸入房間碼。',
  'net.name': '你的名字',
  'net.namePlaceholder': '留空用預設名',
  'net.teamTitle': '選擇陣營',
  'net.teamHint': '加入後會替換該陣營的 1 名人機，場上始終是 10 個角色',
  'net.humans': '真人 {count}',
  'net.bots': '人機 {count}',
  'net.canJoin': '可加入',
  'net.full': '已滿',
  'net.joining': '正在加入…',
  'net.waitingHost': '等待房主回應…',
  'net.connecting': '正在連線…',
  'net.copyLink': '複製邀請連結',
  'net.copied': '已複製',
  'net.leave': '退出聯機',
  'net.back': '返回',
  'net.room': '房間 {code}',
  'net.hostBadge': '房主',
  'net.guestBadge': '加入者',
  'net.pending': '{count} 人正在選陣營',
  'net.startHint': '建立房間後立刻開局，不用等其他人',
  'net.leftTitle': '房主已離開',
  'net.leftHint': '房間已經關閉。可以回開始介面自己開一局，或重新加入別的房間。',
  'net.endedTitle': '對局已結束',
  'net.endedHint': '這一局不再接受新玩家。回開始介面可以再開一局。',
  'net.err.insecure-context': '需要 https 或 localhost：區網用 IP 直接開啟時瀏覽器不給連線',
  'net.err.bad-code': '房間碼不對（5 位字母數字）',
  'net.err.no-room': '找不到這個房間：碼可能不對，或房主不在',
  'net.err.no-direct-connection': '兩端連不上（NAT / 防火牆），換一台機器或改用有線網路試試',
  'net.err.handshake': '握手逾時，房主可能剛離開',
  'net.err.team-full': '這個陣營已經沒有人機可以替換了',
  'net.err.match-ended': '對局已經結束，不能再加入',
  'net.err.already-joined': '你已經在場上了',
  'net.err.room-full': '房間滿了（10 個角色全是真人）',
  'net.err.host-left': '房主已經離開房間',
  'net.err.join-failed': '加入失敗，詳情見主控台',
  'hud.bot': '機',
};

const EN: Record<H5TextKey, string> = {
  title: 'Transport Ship',
  tagline: 'First-person shooter · AK-47 / M4A1 / AWM · 10-player bot match',
  'unit.minute': 'min',
  'unit.second': 's',

  'start.eyebrow': 'First-person shooter',
  'start.begin': 'Deploy',
  'start.settings': 'Settings',
  'start.hint': 'WASD move · LMB fire · RMB scope · R reload · B loadout',
  'start.difficulty': 'Bot skill',
  'setup.difficulty.easy': 'Easy',
  'setup.difficulty.normal': 'Normal',
  'setup.difficulty.hard': 'Brutal',

  'team.a': 'Vanguard',
  'team.b': 'Insurgent',

  'weapon.knife': 'Kukri',
  'weapon.grenade': 'HE grenade',

  'hud.hp': 'HP',
  'hud.armor': 'Armor',
  'hud.ammo': 'Ammo',
  'hud.time': 'Time',
  'hud.kills': 'Kills',
  'hud.deaths': 'Deaths',
  'hud.reloading': 'Reloading',
  'hud.dead': 'Respawning',
  'hud.you': 'You',
  'hud.fps': '{fps} FPS',
  'hud.target': 'Target {count}',
  'hud.killsLeft': '{count} to go',
  'hud.scoreboard': 'Scoreboard',
  'hud.spawnHint': 'B to change loadout',
  'hud.grenade': 'Grenades',

  'feed.world': 'World',

  'death.killer': 'Killed by',
  'death.head': 'Headshot',
  'death.body': 'Body',

  'streak.2': 'Double kill',
  'streak.3': 'Triple kill',
  'streak.4': 'Quad kill',
  'streak.high': 'Unstoppable',

  'buy.title': 'Loadout',
  'buy.hint': 'Change loadout within 5s of respawn, before firing',
  'buy.locked': 'Window expired or weapon fired — loadout locked',
  'buy.current': 'Equipped',
  'buy.close': 'Close',

  'settings.title': 'Settings',
  'settings.sensitivity': 'Mouse sensitivity',
  'settings.adsSensitivity': 'ADS mouse sensitivity',
  'settings.volume': 'Volume',
  'settings.fov': 'Field of view',
  'settings.quality': 'Render quality',
  'settings.quality.low': 'Fast',
  'settings.quality.mid': 'Balanced',
  'settings.quality.high': 'Sharp',
  'settings.reset': 'Reset defaults',
  'settings.close': 'Close',
  'settings.controls': 'Controls',
  'settings.controls.move': 'W A S D to move · Shift to walk',
  'settings.controls.fire': 'Left click fire · right click scope (AWM only)',
  'settings.controls.reload': 'R to reload',
  'settings.controls.jump': 'Space to jump',
  'settings.controls.crouch': 'C / Ctrl to crouch',
  'settings.controls.weapon': '1 / 2 / 3 / 4 or wheel to switch · B loadout (at spawn) · Q quick-swap',
  'settings.controls.grenade': 'G to quick-throw a grenade',
  'settings.controls.pause': 'Esc to pause',
  'settings.touch': 'Touch: left stick to move, drag right side to look',

  'result.win': 'You win',
  'result.lose': 'You lost this one',
  'result.draw': 'Draw',
  'result.mvp': 'MVP',
  'result.summary': '{kills} kills · {deaths} deaths',
  'result.again': 'Play again',
  'result.leave': 'Back to H5',

  'pause.title': 'Paused',
  'pause.resume': 'Resume',
  'pause.restart': 'Restart',
  'pause.quit': 'Quit match',
  'pause.settings': 'Settings',

  'hint.lock': 'Click to resume',
  'hint.loading': 'Getting ready…',
  'menu.back': 'Back to H5',

  'touch.fire': 'Fire',
  'touch.aim': 'Scope',
  'touch.jump': 'Jump',
  'touch.crouch': 'Crouch',
  'touch.reload': 'Reload',
  'touch.grenade': 'Nade',
  'touch.buy': 'Loadout',

  /* LAN multiplayer */
  'net.entry': 'LAN multiplayer',
  'net.title': 'LAN multiplayer',
  'net.subtitle': 'Host starts with 1 human + 9 bots · anyone can drop in mid-match',
  'net.single': 'Solo / bots',
  'net.create': 'Create room',
  'net.join': 'Join room',
  'net.code': 'Room code',
  'net.codePlaceholder': '5-character code',
  'net.rooms': 'Rooms nearby',
  'net.roomsEmpty': 'No rooms found yet. Ask the host for an invite link, or type the room code.',
  'net.name': 'Your name',
  'net.namePlaceholder': 'Leave blank for the default',
  'net.teamTitle': 'Pick a side',
  'net.teamHint': 'Joining replaces one bot on that side — the match always holds 10 characters',
  'net.humans': '{count} human',
  'net.bots': '{count} bot',
  'net.canJoin': 'Open',
  'net.full': 'Full',
  'net.joining': 'Joining…',
  'net.waitingHost': 'Waiting for the host…',
  'net.connecting': 'Connecting…',
  'net.copyLink': 'Copy invite link',
  'net.copied': 'Copied',
  'net.leave': 'Leave multiplayer',
  'net.back': 'Back',
  'net.room': 'Room {code}',
  'net.hostBadge': 'Host',
  'net.guestBadge': 'Guest',
  'net.pending': '{count} picking a side',
  'net.startHint': 'The match starts the moment you create the room — no waiting',
  'net.leftTitle': 'The host left',
  'net.leftHint': 'This room is closed. Start your own match from the menu, or join another room.',
  'net.endedTitle': 'Match over',
  'net.endedHint': 'This match no longer accepts new players. Start another one from the menu.',
  'net.err.insecure-context': 'Needs https or localhost — browsers refuse to connect when opened over a LAN IP',
  'net.err.bad-code': 'That room code is invalid (5 letters or digits)',
  'net.err.no-room': 'Room not found — wrong code, or the host is gone',
  'net.err.no-direct-connection': 'Could not reach the other side (NAT / firewall). Try another machine or a wired network',
  'net.err.handshake': 'Handshake timed out — the host may have just left',
  'net.err.team-full': 'No bots left to replace on that side',
  'net.err.match-ended': 'The match is over — you cannot join it',
  'net.err.already-joined': 'You are already in the match',
  'net.err.room-full': 'Room is full (all 10 characters are human)',
  'net.err.host-left': 'The host has left the room',
  'net.err.join-failed': 'Join failed — see the console for details',
  'hud.bot': 'BOT',
};

const TABLES: Partial<Record<Locale, Record<H5TextKey, string>>> = {
  zh: ZH,
  'zh-TW': ZH_TW,
  en: EN,
};

/** 按语言取一条游戏内文案。没有对应翻译的语言回退英文。 */
export function h5Text(locale: Locale, key: H5TextKey, vars?: Record<string, string | number>): string {
  const table = TABLES[locale] ?? EN;
  const raw = table[key] ?? EN[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/** 阵营名。计分板、击杀播报、比分条共用，别在组件里再抄一遍。 */
export function teamLabel(locale: Locale, team: Team): string {
  return h5Text(locale, team === 0 ? 'team.a' : 'team.b');
}

/**
 * 场上某个人的显示名。三处（计分板 / 击杀播报 / 结算表）共用。
 *
 * 两个特例：
 *   · 玩家自己 → 「你 / You」。`Actor.name` 是引擎内部标识，不参与本地化；
 *   · `name === null` → 没有凶手（摔死、自己炸自己），显示成「世界 / World」。
 */
export function actorLabel(locale: Locale, name: string | null, isPlayer: boolean): string {
  if (isPlayer) return h5Text(locale, 'hud.you');
  if (name === null) return h5Text(locale, 'feed.world');
  return name;
}
