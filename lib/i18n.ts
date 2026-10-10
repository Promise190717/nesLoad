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
    'This room is desktop-only. Widen your browser window to at least 900px.',

  'theme.toDark': 'Switch to night mode',
  'theme.toLight': 'Switch to day mode',
  /* 吊灯的点击目标 —— 描述的是「点下去会发生什么」，和全屏那两条同一写法 */
  'lamp.turnOn': 'Turn on the lamp',
  'lamp.turnOff': 'Turn off the lamp',
  'locale.toZh': '切换到中文',
  'locale.toEn': 'Switch to English',
  'fullscreen.enter': 'Fullscreen the game screen',
  'fullscreen.exit': 'Exit fullscreen',

  /*
   * 屏幕里那条提示的**无障碍名字**。屏幕上显示的是英文像素字（font-pixel 没有汉字，
   * 见 RetroTv），但读屏软件念出来的应该是用户当前的语言，所以这两条留在文案表里。
   */
  'screen.pick': 'Click to choose a ROM file, or drop one here',
  'screen.srLabel': 'Choose a ROM file to run',

  'panel.resume': 'Resume',
  'panel.pause': 'Pause',
  'panel.save': 'Save',
  'panel.load': 'Load',
  'panel.eject': 'Eject',

  'volume.down': 'Volume down one step',
  'volume.up': 'Volume up one step',
  'volume.set': 'Set volume to {level} of {max}',

  /*
   * 存档槽。列表浮在房间上，不在屏幕里 —— 屏幕里跑的是游戏画面。
   */
  'saves.title': 'Load state',
  'saves.load': 'Load',
  'saves.close': 'Close',

  /* 卡带架 2026-10-09 撤掉，历史改在游戏库弹窗里（见 games.tabHistory）。 */
  'library.removeLabel': 'Remove {name}',

  /*
   * 键位表。刻意**不用** font-pixel：Press Start 2P 没有中日韩字形，
   * 而这几条是给人读懂的说明（原版 `1P ARROWS / Z X / A S / Q E / SHIFT / ENTER`
   * 只列键名不说对应关系，等于没说明），所以走系统字体。
   *
   * 1P / 2P 那两行**不是文案** —— 由 `playerLegend()`（lib/keybindings.ts）从
   * 当前生效的键位现算出来，所以这里只有「移动」这一个词要翻译，键名和钮名
   * （W/A/S/D、A B C X Y Z）都是丝印，中英一样。
   */
  'legend.moves': 'moves',
  'legend.shortcut': 'Keys  P Pause · R Reset · F5 Save · F8 Load',
  /* 「按键说明」弹窗本身。内容由 playerLegend() 现算，这里只有壳的文案。 */
  'legend.open': 'Controls',
  'legend.title': 'Controls',
  'legend.close': 'Close',
  /*
   * 载入失败时**唯一**的提示通道（屏幕里只有状态提示，载入失败本身是静默的）。
   * FBNeo 只吃 .zip，而街机 romset 大量以 7z / rar 流通 —— 认出来就把这句亮出来。
   */
  'legend.needZip':
    'Format  FBNeo only reads .zip — this one looks like {ext}. Repack it, or grab a .zip build',

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
    'You are player 1. Load a cartridge and the picture is pushed to the guest automatically. Default keys: W/A/S/D, J, K, L, U, I, O, B, Enter.',
  'netplay.youAreGuest':
    'You are player 2. No cartridge needed — the host streams the picture. Your keys are sent to the host. Default keys: arrows, Num 1 2 4 5 7 8, Del, Num 0.',
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
   * 钮名走街机叫法（A B C X Y Z），由 `KeyBindingsPanel` 的 BUTTON_LABELS 直接给出
   * —— 它们是手柄上的丝印、不进文案表。只有「开始 / 投币」是词，跟着语言走。
   */
  'keybind.title': 'Key bindings',
  'keybind.open': 'Customize keys',
  'keybind.close': 'Close',
  'keybind.p1': 'Player 1',
  'keybind.p2': 'Player 2',
  'keybind.pressKey': 'PRESS…',
  'keybind.btnStart': 'START',
  'keybind.btnCoin': 'COIN',
  'keybind.reset': 'Restore defaults',
  'keybind.reload': 'Reload cartridge',
  'keybind.reloading': 'Reloading…',
  'keybind.unsupported': 'That key cannot be used — try another one.',
  'keybind.conflictSame': '{pressed} is already bound to the {button} button — try another key.',
  'keybind.conflictOther':
    '{pressed} is already bound to the {button} button on player {player} — try another key.',
  'keybind.hint':
    'The keyboard map is read once, when a cartridge loads — reload it for changes to apply. The two players cannot share a key.',
  'keybind.hostHint':
    'You are the host: Player 1 is your own keys, Player 2 is what the guest’s input is injected as. They cannot share a key, or the injected input would also drive your Player 1. Reload a cartridge after changing.',
  'keybind.guestHint':
    'You are the guest and play with the Player 2 keys. Changes take effect right away — no need to reload the cartridge.',
  'keybind.guestLocalHint':
    'You are the guest, and a cartridge of your own is running here too. Player 1 drives that local cartridge — reload it after changing. Player 2 is what gets sent to the host and applies right away.',

  /*
   * 在线游戏库（服务端上传的那批游戏）。和本机历史是两回事：
   * 历史是这台机器上载入过的（`library.*`），这里是 R2 + D1 里的公共库。
   */
  'games.open': 'Game library',
  'games.title': 'Game library',
  'games.close': 'Close',
  'games.empty': 'The library is empty — nothing has been uploaded yet',
  'games.loading': 'Loading…',
  'games.failed': 'Could not load the game library',
  /*
   * 弹窗里的两个 tab：「游戏库」是在线库，「历史」是本机载入过的卡带 ——
   * 就是这台机器上载入过的那批（上限 10 盘）。两者刻意分开：在线库是公共的，
   * 历史只属于这台机器，混在一起会分不清哪盘是自己拖进来的。
   */
  'games.tabLibrary': 'Game library',
  'games.tabHistory': 'History',
  'games.historyEmpty': 'Nothing loaded yet — cartridges you load will show up here',
  'games.historyLoad': '{name}\nClick to load',
  /*
   * 在线库列表上那排筛选：机种 + 搜索。两者都只在**已经拉回来的那份列表**上过滤
   * （客户端过滤，不再打接口）。「全部」那一档和 NES / SFC / ARC 并排，
   * 机种名是丝印（CONSOLE_LABEL），不走这张表。
   */
  'games.filterAll': 'All',
  'games.searchPlaceholder': 'Search title / developer / series',
  'games.search': 'Search',
  'games.noMatch': 'No matching games.',
  /*
   * 在线库的加载速度提示。**刻意只有中文版**（英文是空串，组件那边按「空串不渲染」处理）：
   * 那句话是说给国内用户听的 —— 文件存在境外，慢是常态。英文界面下读者多半就在境外，
   * 这条既没用又显得莫名其妙。
   */
  'games.remoteSlow': '',

  /*
   * 地板上那张纸片，点开弹出来的那句话。
   * 中文原文由用户给定（他打成「童年是的开心」，这里按语义还原成「童年时的开心」）。
   * 纸上的字走系统字体 —— Press Start 2P 没有中日韩字形，这一点和别的文案一样。
   */
  'note.text': 'May we all find again the joy we had as kids..',
  'note.open': 'Read the note on the floor',
  'note.title': 'A note',
  'note.close': 'Close',
  'window.cycle': 'Change the season outside',

  /*
   * 地上那本留言本（点开是留言列表 + 提交框）。
   * 列表里的正文是用户写的、可能含中文，一律走系统字体 —— 和存档列表、按键说明同一套做法。
   */
  'feedback.open': 'Read the guestbook on the floor',
  'feedback.title': 'Guestbook',
  'feedback.close': 'Close',
  'feedback.placeholder': 'Say something — a suggestion, or a game you would like to see here…',
  'feedback.submit': 'Post',
  'feedback.submitting': 'Posting…',
  'feedback.ok': 'Posted — thanks!',
  'feedback.required': 'Write something first.',
  'feedback.failed': 'Could not post — try again.',
  'feedback.loading': 'Loading…',
  'feedback.empty': 'No messages yet — be the first to write one.',
  'feedback.retry': 'Try again',
  /* 翻页条。没有总页数（游标分页拿不到总数），所以只有「第几页」 */
  'feedback.prev': 'Previous',
  'feedback.next': 'Next',
  'feedback.page': 'Page {n}',
  'feedback.resolved': 'Resolved',
  'feedback.unresolved': 'Open',

  /*
   * 初次打开的操作指引（两步）。指向屏幕和右侧那排开关 —— 靠 `data-tour` 属性找元素，
   * 见 components/OnboardingTour.tsx。是给人读的说明，所以走系统字体、中英两版。
   *
   * 刻意只说「怎么把游戏弄进去」和「右边那列按钮是干嘛的」：机身上的按钮一眼就懂，
   * 吊灯和那张纸片是彩蛋，**不在指引里剧透**。
   */
  'tour.title': 'Quick tour',
  'tour.skip': 'Skip',
  'tour.back': 'Back',
  'tour.next': 'Next',
  'tour.done': 'Start playing',
  'tour.replay': 'Show the tour again',
  'tour.screen.title': 'Start with a game',
  'tour.screen.body':
    'Drag a .nes / .sfc / arcade .zip file onto the TV, or just click the screen to pick a file. No ROMs ship with this repo — bring your own.',
  'tour.rail.title': 'The switch rail',
  'tour.rail.body':
    'Top to bottom: theme (night / day), language (中 / EN), Library (online games and this machine’s history), Fullscreen (it is the screen itself that goes fullscreen), Netplay, Key bindings, and Controls help.',

  /* 后台（登录 + 录入），独立于房间界面。 */
  'admin.title': 'Admin',
  'admin.login.title': 'Admin sign-in',
  'admin.login.username': 'Username',
  'admin.login.password': 'Password',
  'admin.login.submit': 'Sign in',
  'admin.login.submitting': 'Signing in…',
  'admin.login.error': 'Wrong username or password',
  'admin.login.failed': 'Sign-in failed — try again',
  'admin.logout': 'Sign out',
  'admin.upload.title': 'Add a game',
  'admin.field.title': 'Title',
  'admin.field.image': 'Cover image',
  'admin.field.rom': 'ROM file',
  'admin.field.console': 'Console',
  'admin.field.language': 'Language',
  'admin.field.series': 'Series',
  'admin.field.year': 'Year',
  'admin.field.developer': 'Developer',
  'admin.upload.submit': 'Upload',
  'admin.upload.submitting': 'Uploading…',
  'admin.upload.ok': 'Uploaded.',
  'admin.upload.required': 'Title, cover image and ROM file are required.',
  'admin.upload.failed': 'Upload failed.',
  'admin.list.title': 'Uploaded games',
  'admin.list.empty': 'Nothing uploaded yet.',
  'admin.add': 'Add',
  'admin.searchPlaceholder': 'Search title / developer / series',
  'admin.noMatch': 'No matching games.',
  'admin.edit': 'Edit',
  'admin.delete': 'Delete',
  'admin.deleteConfirm': 'Delete “{name}”? This cannot be undone.',
  'admin.edit.title': 'Edit game',
  'admin.save': 'Save',
  'admin.saving': 'Saving…',
  'admin.cancel': 'Cancel',
  'admin.files.locked': 'Cover and ROM are set only when adding — delete and re-add to replace them.',
  'admin.language.none': 'Unspecified',
  'admin.request.failed': 'Request failed.',
  'admin.title.required': 'Title is required.',
  'admin.badYear': 'Year must be a whole number.',
  'admin.search': 'Search',
  'admin.prev': 'Prev',
  'admin.next': 'Next',

  /* 留言本（房间地板上那本）。后台只管「解决没有」——正文不给改，理由见那条接口的注释。 */
  'admin.feedback.title': 'Guestbook',
  'admin.feedback.empty': 'No messages yet.',
  'admin.feedback.loadMore': 'Load more',
  'admin.feedback.resolved': 'Resolved',
  'admin.feedback.unresolved': 'Open',
  'admin.feedback.markResolved': 'Mark resolved',
  'admin.feedback.markUnresolved': 'Mark open',
  'admin.feedback.failed': 'Request failed.',
} as const;

export type MessageKey = keyof typeof en;

const zh: Record<MessageKey, string> = {
  'meta.description': '在浏览器里运行的 NES / SFC 卡带加载器，把卡带拖到游戏机上即可开始。',

  'notice.desktopOnly': '这个房间只在桌面端开放，请把浏览器窗口拉宽到 900px 以上。',

  'theme.toDark': '切换到夜晚模式',
  'theme.toLight': '切换到白天模式',
  'lamp.turnOn': '开灯',
  'lamp.turnOff': '关灯',
  'locale.toZh': '切换到中文',
  'locale.toEn': '切换到英文',
  'fullscreen.enter': '游戏画面全屏',
  'fullscreen.exit': '退出全屏',

  'screen.pick': '点击选择 ROM 文件，或把文件拖到这里',
  'screen.srLabel': '选择要运行的 ROM 文件',

  'panel.resume': '继续',
  'panel.pause': '暂停',
  'panel.save': '存档',
  'panel.load': '读档',
  'panel.eject': '弹出',

  'volume.down': '音量减一档',
  'volume.up': '音量加一档',
  'volume.set': '把音量设为第 {level} 档（共 {max} 档）',

  'saves.title': '读档',
  'saves.load': '加载',
  'saves.close': '关闭',

  'library.removeLabel': '移除 {name}',

  'legend.moves': '移动',
  'legend.shortcut': '快捷键  P 暂停 · R 重置 · F5 存档 · F8 读档',
  'legend.open': '按键说明',
  'legend.title': '按键说明',
  'legend.close': '关闭',
  'legend.needZip': '格式  FBNeo 只吃 .zip —— 这个是 {ext}，重新打包一下（或换一个 .zip 版）',

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
    '你是 1P。插上卡带后画面会自动推给对方。默认键位：W/A/S/D、J、K、L、U、I、O、B、Enter。',
  'netplay.youAreGuest':
    '你是 2P。不需要卡带，房主会把画面推过来；你的按键会发给房主。默认键位：方向键、小键盘 1 2 4 5 7 8、Del、小键盘 0。',
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
  'keybind.btnStart': '开始',
  'keybind.btnCoin': '投币',
  'keybind.reset': '恢复默认',
  'keybind.reload': '重载卡带',
  'keybind.reloading': '重载中…',
  'keybind.unsupported': '这个键不能用，换一个。',
  'keybind.conflictSame': '「{pressed}」已经绑给「{button}」钮了，换一个键。',
  'keybind.conflictOther': '「{pressed}」已经绑给玩家 {player} 的「{button}」钮了，换一个键。',
  'keybind.hint': '键盘映射只在插卡带时读一次，改完要重载卡带才生效。两位玩家不能共用同一个键。',
  'keybind.hostHint':
    '你是房主：玩家 1 是你自己的键，玩家 2 是用来把加入者的输入注入本机的。两组不能共用一个键，否则注入会连带驱动你的玩家 1。改完要重载卡带。',
  'keybind.guestHint': '你是加入者，用玩家 2 的键位。改完立刻生效，不用重载卡带。',
  'keybind.guestLocalHint':
    '你是加入者，本机还跑着一盘自己的卡带。玩家 1 给本机那盘用，改完要重载卡带；玩家 2 是发给房主的，立刻生效。',

  'games.open': '游戏库',
  'games.title': '游戏库',
  'games.close': '关闭',
  'games.empty': '游戏库还是空的 —— 还没有上传过游戏',
  'games.loading': '载入中…',
  'games.failed': '游戏库读取失败',
  'games.tabLibrary': '游戏库',
  'games.tabHistory': '历史',
  'games.historyEmpty': '还没有载入过卡带 —— 载入过的会出现在这里',
  'games.historyLoad': '{name}\n点击载入',
  'games.filterAll': '全部',
  'games.searchPlaceholder': '搜索标题 / 开发者 / 系列',
  'games.search': '搜索',
  'games.noMatch': '没有匹配的游戏。',
  /* 只有中文版，英文那份是空串 —— 见英文表里同一条上面的说明 */
  'games.remoteSlow':
    '提示：在线游戏库的文件存放在境外服务器，载入可能偏慢。',

  'note.text': '愿我们都能找回童年时的开心.. \n 更多彩蛋等你发现哦!',
  'note.open': '读一读地上那张纸',
  'note.title': '一张纸',
  'note.close': '关闭',
  'window.cycle': '换一换窗外的季节',

  'feedback.open': '翻一翻地上那本留言本',
  'feedback.title': '留言本',
  'feedback.close': '关闭',
  'feedback.placeholder': '写句留言 —— 建议、想加的游戏，都行…',
  'feedback.submit': '发布',
  'feedback.submitting': '提交中…',
  'feedback.ok': '已发布，谢谢！',
  'feedback.required': '先写点什么吧。',
  'feedback.failed': '提交失败，再试一次。',
  'feedback.loading': '载入中…',
  'feedback.empty': '还没有留言 —— 第一个写点什么吧。',
  'feedback.retry': '重试',
  'feedback.prev': '上一页',
  'feedback.next': '下一页',
  'feedback.page': '第 {n} 页',
  'feedback.resolved': '已解决',
  'feedback.unresolved': '未解决',

  'tour.title': '操作指引',
  'tour.skip': '跳过',
  'tour.back': '上一步',
  'tour.next': '下一步',
  'tour.done': '开始玩',
  'tour.replay': '重看操作指引',
  'tour.screen.title': '先来一盘游戏',
  'tour.screen.body':
    '把 .nes / .sfc / 街机 .zip 文件拖到电视机上就能玩，也可以直接点屏幕挑文件。',
  'tour.rail.title': '右边这一列开关',
  'tour.rail.body':
    '从上到下：主题（夜晚 / 白天）、语言（中 / EN）、游戏库（在线库 + 本机历史）、全屏（全屏的是屏幕本身）、联机、自定义按键、按键说明。',

  'admin.title': '后台',
  'admin.login.title': '后台登录',
  'admin.login.username': '用户名',
  'admin.login.password': '口令',
  'admin.login.submit': '登录',
  'admin.login.submitting': '登录中…',
  'admin.login.error': '用户名或口令不对',
  'admin.login.failed': '登录失败，请重试',
  'admin.logout': '退出登录',
  'admin.upload.title': '添加游戏',
  'admin.field.title': '游戏名',
  'admin.field.image': '封面图片',
  'admin.field.rom': '游戏文件',
  'admin.field.console': '类型',
  'admin.field.language': '语言',
  'admin.field.series': '系列',
  'admin.field.year': '年份',
  'admin.field.developer': '开发者',
  'admin.upload.submit': '上传',
  'admin.upload.submitting': '上传中…',
  'admin.upload.ok': '已上传。',
  'admin.upload.required': '游戏名、封面图片、游戏文件为必传项。',
  'admin.upload.failed': '上传失败。',
  'admin.list.title': '已上传的游戏',
  'admin.list.empty': '还没有上传任何游戏。',
  'admin.add': '添加',
  'admin.searchPlaceholder': '搜索游戏名 / 开发者 / 系列',
  'admin.noMatch': '没有匹配的游戏。',
  'admin.edit': '编辑',
  'admin.delete': '删除',
  'admin.deleteConfirm': '删除「{name}」？此操作不可撤销。',
  'admin.edit.title': '编辑游戏',
  'admin.save': '保存',
  'admin.saving': '保存中…',
  'admin.cancel': '取消',
  'admin.files.locked': '封面与游戏文件仅在添加时设置 —— 如需更换请删除后重新添加。',
  'admin.language.none': '未指定',
  'admin.request.failed': '请求失败。',
  'admin.title.required': '请填写游戏名。',
  'admin.badYear': '年份必须是整数。',
  'admin.search': '搜索',
  'admin.prev': '上一页',
  'admin.next': '下一页',

  'admin.feedback.title': '留言本',
  'admin.feedback.empty': '还没有留言。',
  'admin.feedback.loadMore': '加载更多',
  'admin.feedback.resolved': '已解决',
  'admin.feedback.unresolved': '未解决',
  'admin.feedback.markResolved': '标记已解决',
  'admin.feedback.markUnresolved': '标记未解决',
  'admin.feedback.failed': '请求失败。',
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

/**
 * 存档列表 / 游戏库历史里那种「2026/10/08 16:21」的时间戳。
 *
 * 带上年份是为了跨年之后还能分清 —— 存档只有 5 份、历史最多 10 盘，最旧的那份可能放很久。
 * 放在这里是因为它**跟着语言走**（zh-CN 与 en-US 的日期写法不同），而存档面板和游戏库
 * 历史都要用；两处各写一份迟早会漂成两种格式。
 */
export function formatTime(timestamp: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
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
