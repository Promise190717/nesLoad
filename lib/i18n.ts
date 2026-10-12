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

/**
 * 站点名（品牌）。2026-10-10 定名、**2026-10-12 用户改成「游戏小屋」**（英文 Game Hut）。
 *
 * **为什么是「按语言的映射」而不是一个字符串**：站名会出现在 <title>、description、
 * JSON-LD、分享图上，而这些全都跟着语言走（中文用户看到「游戏小屋 — 在浏览器里…」，
 * 英文用户该看到英文写法，不能是一串汉字）。
 *
 * **为什么不写成下面文案表里的一个键**（`meta.siteName`）：分享图那支
 * （lib/og-image.tsx）是没有「当前语言」这个概念的 —— 它由 Satori 在服务端画，
 * 图上也只能是英文（默认字体没有汉字，见那边的注释）。给它一个 `SITE_NAME.en`
 * 比塞一个必须传 locale 才能取值的键直接得多。
 *
 * 唯一的源在这里：别在标题 / description 里手写站名，用 `{site}` 占位
 * （见下面 meta.title / seo.intro，translate() 会把它替换掉）—— 改名才只改一处。
 *
 * ⚠️ **改 `en` 会牵动分享图**：lib/og-image.tsx 里站名那行的字号是按**字符数量**量过的
 * （名字长短直接决定字号），改完记得回去核一遍，那边注释写了算法。
 *
 * ⚠️ 这是**对外的展示名**。仓库名 / npm 包名（package.json 的 `nesload`）、
 * localStorage 与 IndexedDB 的键前缀（`nesload:*`、`nesload_locale`）、
 * 联机的 APP_ID（lib/netplay.ts）都**不是**它，改这些会让老用户的数据和联机房间全部失联。
 */
export const SITE_NAME: Record<Locale, string> = {
  zh: '游戏小屋',
  en: 'Game Hut',
};

/** 英文是基准表，中文必须逐键对齐（漏键会在编译期报错）。 */
const en = {
  /*
   * SEO 文案（<title> / description / og:* / JSON-LD）。
   *
   * 为什么单独列一组、而不是散在界面文案里：这几条**不进界面**，只给爬虫和社交
   * 卡片看；但它们和界面文案一样**跟着语言走** —— 本站的语言由 cookie 决定，
   * 没有 /en /zh 这种分语言 URL，所以 meta 只能按当前请求的语言渲染。
   *
   * 定位（用户 2026-10-10 明确）：主推「在线玩复古游戏」，NES / SFC / 街机都算，
   * 有在线游戏库，也支持用自己的 ROM 文件。三条卖点按这个优先级排：
   * 玩什么（复古游戏）> 怎么玩（在线游戏库 / 拖自己的 ROM）> 免安装。
   */
  /*
   * <title>：站名在前（品牌词是搜索时最容易命中的），冒号后是「这站能干什么」。
   * 整个标题压在 60 字符上下 —— 再长 Google 就截断了。
   * `{site}` 由调用方替换成 SITE_NAME[locale]，别在这里手写站名。
   */
  'meta.title': '{site} — Play Retro Games in Your Browser: NES, SNES & Arcade',
  /*
   * description：长度按 **155 字符上下** 写（桌面端 Google 大约只显示这么多），
   * 前半句必须能独立成立 —— 后半句被截掉也不能读不通。
   */
  'meta.description':
    'Play NES, SNES / SFC and arcade games right in your browser. Pick a title from the online library, or drop your own ROM file onto the pixel-art CRT.',
  /*
   * keywords：Google 早在 2009 年就不看了，这里留着是给 Bing / Yandex / 站内搜索
   * 之类还有一点权重的地方 —— 属于「写了没坏处、别指望它」的一条。
   */
  'meta.keywords':
    'retro games, online retro game library, NES emulator, SNES emulator, SFC emulator, arcade emulator, play NES in browser, browser emulator, RetroArch WASM, {site}',
  /*
   * 这里**没有** og:image 的 alt —— 不是漏了。
   * alt 由 app/opengraph-image.tsx 按文件约定导出，而那个导出必须是**静态值**，
   * 拿不到当前请求的语言，所以只能是一句写死的英文（见 lib/og-image.tsx 的 OG_ALT）。
   * 写一个 `{site}` 版本放在这里也没人会读，属于dead code，干脆不留。
   */

  /*
   * 首屏那段**看不见的正文**（ConsoleScene 里用 sr-only 渲染）。
   *
   * 为什么需要它：这间屋子里所有东西都是 CSS 画的，游戏跑在 canvas 里，
   * 整页除了按钮上那几个词之外**没有一个字**是可索引的文本 ——
   * 一个没有正文的站在搜索结果里等于不存在，标题和 description 写得再好也没用，
   * 因为没有任何东西支撑「这页讲了什么」。
   *
   * 用 sr-only 而不是渲染出来：这是刻意的极简视觉（屋里只该有电视机），
   * 加一段文字说明就把设计毁了。而 sr-only 对读屏用户本来就是好事 ——
   * 现在他们进来听到的第一句就是「这是什么、怎么开始玩」，而不是一片空白。
   *
   * 分寸：**简短、且与页面真实功能一致**。隐藏文本堆关键词会被判作弊，
   * 这里只是把「这是什么、能干什么、怎么开始」如实说一遍，不塞任何没实现的卖点。
   */
  'seo.heading': 'Play retro games in your browser',
  'seo.intro':
    '{site} is an online retro game room. NES, SNES / SFC and arcade titles run right here in the browser — emulated on your own machine, with RetroArch compiled to WebAssembly.',
  'seo.howTo':
    'Pick a game from the online library, or drop your own ROM file onto the television. Nothing to install.',

  /*
   * 游戏列表 / 详情 / 下载这三页的 SEO 文案（2026-10-12 加，用户要求
   * 「每个页面的标题的说明都要写好」）。
   *
   * 和上面那组同理：跟着语言走，不写进界面（页面正文另有一组 `gamesPage.*`）。
   * 三页都是**真路由**（`/games`、`/games/[id]`、`/games/[id]/download`），
   * 要能被直接搜到 —— 所以描述里都要带「能玩、能下载、免安装」这几个词。
   *
   * 详情页 / 下载页的两条带占位符：`{title}` 是游戏名、`{console}` 是机种
   * （NES / SFC / ARC，丝印那三个英文词，不进文案表）。
   * 列表页那条带 `{count}` —— 条数是现从库里读的，写死会在增减游戏后变成假话。
   */
  'seo.games.title': 'All games — Play NES, SNES & Arcade Online',
  'seo.games.description':
    '{count} retro games in the online library, all playable in your browser: NES, SNES / SFC and arcade. Open a title for details, play it instantly, or download the ROM file.',
  /*
   * 搜索结果的标题与说明。**这两条不会进索引**（列表页有 `q` 时是 noindex, follow，
   * 见 app/games/page.tsx 的注释）—— 它们服务的是**人**：标签页上写着搜了什么，
   * 把链接发到聊天里时预览卡也该说得清。所以照「每个页面的标题说明都要写好」写。
   */
  'seo.games.search.title': 'Search results for “{keyword}”',
  'seo.games.search.description':
    '{count} games in the online library match “{keyword}”. Play them in your browser or download the ROM file.',
  'seo.game.title': '{title} — Play {console} Online',
  'seo.game.description':
    'Play {title} ({console}) right in the browser — free, nothing to install. The ROM file is available for download too.',
  'seo.gameDownload.title': 'Download the {title} ROM ({console})',
  'seo.gameDownload.description':
    'Download the ROM file for {title} ({console}) in one click, no sign-up needed. You can also play it right in the browser.',

  /*
   * 窄窗口下顶在房间前面那块提示。**标题和正文分开两个键** ——
   * 标题走 font-pixel（一行短标签），正文走系统字体 12px（一句要读的话）。
   * 标题原先硬编码成 'DESKTOP ONLY'，2026-10-12 收进文案表：它下面那句正文本来就是
   * 翻译过的，中英混着摆看着像漏翻（中文同样靠字体回退显示，见 screen.* 那段注释）。
   */
  'notice.desktopOnlyTitle': 'DESKTOP ONLY',
  'notice.desktopOnly':
    'This room is desktop-only. Widen your browser window to at least 900px.',

  'theme.toDark': 'Switch to night mode',
  'theme.toLight': 'Switch to day mode',
  /* 吊灯的点击目标 —— 描述的是「点下去会发生什么」，和全屏那两条同一写法 */
  'lamp.turnOn': 'Turn on the lamp',
  'lamp.turnOff': 'Turn off the lamp',
  /*
   * 简洁模式。同样是「描述点下去会发生什么」：
   * 开着的时候点 = 退出，关着的时候点 = 只留背景墙 / 电视机 / 桌子 / 地面。
   */
  'simple.enter': 'Simple mode: keep only the wall, TV, desk and floor',
  'simple.exit': 'Exit simple mode',
  /*
   * 电视机大小。右侧那排里那颗钮**点开是个选择器**（大 / 中 / 小，横排弹在钮的左边），
   * 当前那一档在 CSS 里高亮（见 globals.css 的 `.tv-size-seg`），所以这里只有：
   * 钮自己的名字、三个选项的名字、以及选项读屏时那句完整的话。
   */
  'tvSize.open': 'TV size',
  'tvSize.opt.large': 'Large',
  'tvSize.opt.medium': 'Medium',
  'tvSize.opt.small': 'Small',
  'tvSize.pick': 'Set the TV size to {level}',
  'locale.toZh': '切换到中文',
  'locale.toEn': 'Switch to English',
  'fullscreen.enter': 'Fullscreen the game screen',
  'fullscreen.exit': 'Exit fullscreen',

  /*
   * 屏幕里那块提示的**无障碍名字**（整块屏幕就是按钮，点它 = 选 ROM 文件）。
   */
  'screen.pick': 'Click to choose a ROM file, or drop one here',
  'screen.srLabel': 'Choose a ROM file to run',

  /*
   * 屏幕里那几句提示的**可见文字**。
   *
   * **2026-10-12 起进文案表了**。之前只有英文、不进表，理由是 `font-pixel`
   * （Press Start 2P）没有汉字字形 —— 现在中文靠**字体回退**显示（落到系统自带的
   * 中文字体上，Windows 通常是新宋体；和机身面板那排「暂停 / 存档 / 读档 / 重载 / 弹出」
   * 同一个路子，那排本来就是系统字体）。英文那几句的**大写和字面一个字都没动**，
   * 所以 en 用户看到的还是原来那几句。
   *
   * 中文刻意压到最短：屏幕就 720×540，字越大越糊；10px 是这套界面上中文的下限
   * （再小笔画就黏在一起了，见 RetroTv 里那几处的字号注释）。
   * 全大写是**英文那一侧的排版风格**，中文不跟（汉字没有大小写）。
   */
  'screen.dragDrop': 'DRAG & DROP A ROM',
  'screen.orClick': 'OR CLICK TO CHOOSE A FILE',
  'screen.orLibrary': 'OR LAUNCH FROM LIBRARY',
  'screen.release': 'RELEASE TO LOAD',
  /*
   * 移动端的待机提示（2026-10-12）。移动端**只能从在线游戏库载入** ——
   * 手机上没有拖拽、也没有「选本地文件」那条路（点屏幕 = 打开游戏库），
   * 所以桌面那三行（拖 / 点 / 库）换成这两行，措辞也不再提文件。
   * 两行 + 光标，结构和桌面那套一一对应（主提示 `.screen-hint-sm`，副提示 `.screen-hint-xs`）。
   */
  'screen.mobileLibrary': 'LAUNCH FROM LIBRARY',
  'screen.mobileTap': 'TAP THE SCREEN TO OPEN THE LIBRARY',
  'screen.waitingHost': 'WAITING FOR HOST',
  'screen.paused': 'PAUSED',
  'screen.resumeOnPanel': 'PRESS RESUME ON THE PANEL',
  'screen.waitHostResume': 'WAITING FOR HOST TO RESUME',

  'panel.resume': 'Resume',
  'panel.pause': 'Pause',
  'panel.save': 'Save',
  'panel.load': 'Load',
  /* 机身上的 RESET 钮：重启核心，游戏从头开始（对应键盘上的 R） */
  'panel.reset': 'Reset',
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
  /*
   * 这里原来有一条 `legend.shortcut`（P 暂停 / R 重置 / F5 存档 / F8 读档）。
   * 2026-10-10 用户要求把键盘快捷键全部取消，那条说明连同它的键一起删了
   * （为什么撤、以及 Esc 为什么留着，见 ConsoleScene 里那个 effect 的注释）。
   * **别再补回来** —— 键都没了，说明行只会教人按了没反应。
   */
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
   * 手柄。单机是引擎白送的（RetroArch 的 `rwebpad` 驱动，我们一行代码没写），
   * 但界面上不说就等于没有 —— 用户不会去猜插上的东西有没有生效。
   * 房间里那句照样成立：加入者那侧的手柄是我们自己实现的（见 lib/gamepad.ts）。
   */
  'legend.gamepad': 'Gamepad  Plug one in and it works — on both sides when you are in a room.',

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
  /* 链路选择器。「局域网」= 只 STUN；「公网」= 额外带 TURN 兜底（仍是直连优先） */
  'netplay.modeLan': 'LAN',
  'netplay.modeWan': 'Public internet',
  'netplay.wanDev': 'Public-internet netplay is under development.',
  /*
   * 出画档位。三档的差别是抓帧帧率 / 编码分辨率 / 码率上限，完整理由见
   * lib/netplay.ts 的 `StreamQuality`。标签保持一两个词 —— 三个按钮要并排塞下。
   */
  'netplay.quality': 'Stream quality',
  'netplay.qualitySmooth': 'Smooth',
  'netplay.qualityBalanced': 'Balanced',
  'netplay.qualitySharp': 'Sharp',
  'netplay.qualityHint':
    'The host runs the emulator and the stream on one machine. If it cannot keep up, the whole game slows down (slow motion). Drop a level if that happens — this only applies on the host.',
  'netplay.copy': 'Copy',
  'netplay.copied': 'Copied',
  /*
   * 「分享」= 复制一条**带房间码的链接**（`?room=XXXX`），对方点开就能确认加入。
   * 和上面那条「复制」的分工：那条复制的是**码**（4 个字符，念给对方听），
   * 这条复制的是**整条链接**（发给对方点）。
   */
  'netplay.share': 'Share',
  'netplay.shareCopied': 'Link copied',
  /*
   * 打开分享链接时先弹这个确认框，**不直接进房间** ——
   * 光点一条链接就被塞进陌生人的房间太突然了，而且对方可能已经走了。
   */
  'netplay.inviteTitle': 'Room invite',
  'netplay.inviteBody': 'Join room {code}?',
  'netplay.inviteJoin': 'Join',
  'netplay.inviteCancel': 'Cancel',
  'netplay.connected': 'Connected',
  'netplay.waiting': 'Waiting for the other player',
  /*
   * 加入者侧的「还没连上」——和上面那句是**两码事**。
   * `waiting` 对房主是「房间开好了、等对方来」，对加入者却是「我正在连过去」。
   * 给加入者看「等待对方加入」会让他误以为自己是房主（明明是他输码去投奔别人）。
   * 所以按角色分开，文案由 NetplayPanel 现选（见 334 行附近那段）。
   */
  'netplay.joining': 'Joining the room…',
  'netplay.waitingGame': 'Connected — waiting for the host to load a cartridge',
  'netplay.hostPlaying': 'Host is playing',
  /** 房主按了暂停 —— 挂在游戏名后面的小标（屏幕里那层 PAUSED 说的是同一件事） */
  'netplay.paused': 'Paused',
  /*
   * 刚连上那枚几秒后自己消失的提示。**分两句**：房主等的是「对方进来了」，
   * 加入者等的是「连上房主了」，两边的关注点不是一件事。
   *
   * 它同时是「你是谁」的第一句话 —— 面板在连上的瞬间就被自动收掉了，
   * 那一刻屏幕上没有别处写着这件事。和下面两句同一个理由：**不列键位**。
   */
  'netplay.toastHost': 'Connected · the other player is in · you are player 1',
  'netplay.toastGuest': 'Connected to the host · you are player 2',
  /*
   * 对方离开那两枚提示。和上面「刚连上」共用同一条提示通道（`netplayToast`），
   * 只是**颜色换成警示**（见 ConsoleScene 那段注释）。
   *
   * 分开写是因为两边的处境完全不同：房主是「人走了、房间还开着」（可以干等对方回来），
   * 加入者是「房主走了、房间已经没了」（手里的码再也招不到人，得重新要一个）。
   * 后一句和 `netplay.errHostLeft` 说的是同一件事，但那句只在联机面板里出现，
   * 而面板在连上的瞬间就被自动收掉了 —— 所以离开时也得各有一枚浮出来的提示。
   */
  'netplay.toastHostLeft': 'The host left — the room is closed',
  'netplay.toastGuestLeft': 'Player 2 left the room',
  /*
   * 这两句**刻意不列键位**。原先各写了一段「默认键位：…」，用户改过键位之后它就开始
   * 说假话（`playerLegend()` 那段注释记过同一个坑）。键位只由实时值生成，在「Controls」
   * 弹窗里；这里只负责说清「你是谁、对方是谁」，值一律指过去看。
   */
  'netplay.youAreHost':
    'You are player 1. Load a cartridge and the picture is pushed to the guest automatically. You play with your own key set — see Controls for the current bindings.',
  'netplay.youAreGuest':
    'You are player 2. No cartridge needed — the host streams the picture, and your input is sent to the host. Play with your own key set (the Player 1 group) or a gamepad — see Controls.',
  'netplay.leave': 'Leave room',
  'netplay.badCode': 'That code does not look right — it should be 4 characters.',
  'netplay.errInsecure':
    'Netplay needs HTTPS or localhost. This page is on plain http, so the browser withholds the crypto API it relies on.',
  'netplay.errNoDirect':
    'Both sides reached the relay, but no direct connection could be opened — usually NAT or a firewall. Same LAN works best.',
  'netplay.errPassword': 'Room code mismatch.',
  'netplay.errHandshake': 'Handshake timed out — the other player may have left.',
  /* 加入者专用：房主退出了，房间已经被我们主动销毁 */
  'netplay.errHostLeft': 'The host left the room — it has been closed.',
  /* 加入者专用：房间已经有一对在玩了。本站只支持 1 对 1，第三个人会被房主请出去 */
  'netplay.errRoomFull': 'That room is already full — this game is one-on-one only.',
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
  /*
   * 联机时那个**唯一**的标签：锁的一定是 1P 那组，但对加入者不能写「Player 1」
   * —— 他在游戏里是 2P，会读成「那是房主的键」。所以按「归属」命名，不按号位。
   */
  'keybind.mine': 'Your keys',
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
    'You are the guest and play with your own key set (the Player 1 group) — each side sits at its own keyboard, so nothing can clash. Changes take effect right away — no need to reload the cartridge.',
  'keybind.guestLocalHint':
    'You are the guest, and a cartridge of your own is running here too. Your keys are the Player 1 group: they drive that local cartridge, so reload it after changing — and they are also what gets sent to the host, which applies right away.',

  /*
   * 在线游戏库（服务端上传的那批游戏）。和本机历史是两回事：
   * 历史只记「这台机器从游戏库点开过哪几盘」（`library.*`，纯字符串记录），
   * 这里是 R2 + D1 里的公共库、全部游戏都在。
   */
  'games.open': 'Game library',
  'games.title': 'Game library',
  'games.close': 'Close',
  'games.empty': 'The library is empty — nothing has been uploaded yet',
  'games.loading': 'Loading…',
  /*
   * 从在线库载入一盘时，面板底部那条状态栏。
   * 带游戏名 —— 面板里同时有十几张封面，只说「载入中」还得让人自己找是哪一张。
   */
  'games.loadingRom': 'Loading {name}…',
  /* 上面那条状态栏右边的取消钮。只覆盖 ROM 整包下载这一段，见 ConsoleScene 的注释。 */
  'games.cancel': 'Cancel',
  'games.failed': 'Could not load the game library',
  /*
   * 弹窗里的两个 tab：「游戏库」是在线库，「历史」是**从游戏库点开过的那批** ——
   * 上限 10 盘，只存名字 / 封面地址 / 下载地址（2026-10-12 改造，见 lib/library.ts）。
   * 两者刻意分开：在线库是公共的、全部游戏都在，历史只是「我最近点过哪几盘」。
   * 自己拖进来的本地文件**不进历史** —— 它没有可重新下载的地址，存了也点不动。
   */
  'games.tabLibrary': 'Game library',
  'games.tabHistory': 'History',
  'games.historyEmpty': 'Nothing opened from the library yet',
  'games.historyLoad': '{name}\nClick to load again',
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
   * 列表下方的翻页条。和后台 `admin.prev` / `admin.next` 同一套写法
   * （只有上一页 / 下一页 + `第几页 / 共几页`，没有跳页和页码按钮组）。
   *
   * 页码本身是纯数字，不进文案表 —— 和后台一样直接写 `{n} / {m}`。
   * 走系统字体：按钮上是词，不是丝印。
   */
  'games.prev': 'Prev',
  'games.next': 'Next',
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
   * 墙上那幅挂画。2026-10-12 先由用户点名「日历改成挂画、刷新随机抽一幅」，当天又加了
   * 「点开看大图」—— 所以这里既有那颗按钮的名字，也有每一幅的画名和作者。
   *
   * ⚠️ **画名和作者只有这一个出处**：墙上就一张画、画面上一个字都不写，
   * 只有点开之后那张说明牌才把两行摆出来（见 components/PaintingPanel.tsx）。
   * 键名跟着 `RoomBackdrop.tsx` 的 `PAINTINGS` 里 `titleKey` / `artistKey` 走，改名要一起改。
   *
   * ⚠️ 第七幅（`unknown`）是用户当天发的**自家照片**（退潮的滩涂上大人带小孩玩水），
   * 他指定的说法就是「不知从哪来的不知名画作」—— **别自作主张改成正经画名**，
   * 作者也照写「佚名」。前六幅才是真的名画。
   */
  'painting.open': 'Look closer at the painting',
  'painting.close': 'Close',
  'painting.title.sunflowers': 'Sunflowers',
  'painting.artist.sunflowers': 'Vincent van Gogh',
  'painting.title.monaLisa': 'Mona Lisa',
  'painting.artist.monaLisa': 'Leonardo da Vinci',
  'painting.title.starryNight': 'The Starry Night',
  'painting.artist.starryNight': 'Vincent van Gogh',
  'painting.title.scream': 'The Scream',
  'painting.artist.scream': 'Edvard Munch',
  'painting.title.pearl': 'Girl with a Pearl Earring',
  'painting.artist.pearl': 'Johannes Vermeer',
  'painting.title.wave': 'The Great Wave off Kanagawa',
  'painting.artist.wave': 'Katsushika Hokusai',
  'painting.title.unknown': 'A Nameless Painting from Who-Knows-Where',
  'painting.artist.unknown': 'Anonymous',
  /*
   * 地板上那台 MP4。整台机器就是一个 <button>（点一下播放 / 暂停），
   * 所以这两条是它的**无障碍名字**，和吊灯那两条同一写法 —— 描述「点下去会发生什么」。
   *
   * 刻意**不写歌名**：名字进了 aria-label 就得跟着语言走，而歌名是个专有名词，
   * 翻译反而更糊涂；而且曲目是使用者自己放进 `public/audio/` 的，写死一个名字
   * 在他换成别的歌之后就成了假话。说的是「这台机器」，不是「这首歌」。
   */
  'mp4.play': 'Play a song on the MP4 player',
  'mp4.pause': 'Pause the MP4 player',

  /*
   * 地板上的逗猫棒 —— **彩蛋的开关**：点一下，桌子上那摞书后面会探出一个猫头
   * （见 components/RoomBackdrop.tsx 的 TvCat）。
   *
   * ⚠️ 这一条**同时当鼠标悬停那行提示（title）和读屏名字（aria-label）用**，
   * 所以写的是**叫人做什么动作**（「摇一摇」），而不是干巴巴地报出物件名字。
   *
   * 下面七条是**猫的品种名**，只当那只猫的无障碍名字用 ——
   * 画面上**不写名字**（第几次探出来是哪一品，靠毛色和花纹认），
   * 所以这里也不需要一个「品种」的展示位。
   */
  'cat.wand': 'Shake the cat wand on the floor',
  'cat.ragdoll': 'A ragdoll peeks out from behind the books',
  'cat.siamese': 'A Siamese peeks out from behind the books',
  'cat.tabby': 'A tabby peeks out from behind the books',
  'cat.orange': 'An orange tabby peeks out from behind the books',
  'cat.american': 'An American shorthair peeks out from behind the books',
  'cat.tuxedo': 'A tuxedo cat peeks out from behind the books',
  'cat.calico': 'A calico peeks out from behind the books',

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
   * 隐私政策 / 服务条款（2026-10-12 加）。**正文不在这张表里**，在 lib/legal.ts ——
   * 那两页是长文档、结构化存储，理由见那边的顶部注释。这里只有**房间界面**要用的几个词：
   * 右侧竖排那颗钮的名字，以及它左边弹层里的两条链接。
   *
   * `legal.open` 是那颗钮的 title / aria（描述它点开什么）；
   * `legal.privacy` / `legal.terms` 既是弹层里那两条链接的文字，也是两页自己的标题
   * （和留言本那颗钮借 `feedback.title` 同一个路子：它就是最准的说法，没必要另起一个键）。
   */
  'legal.open': 'Privacy & Terms',
  'legal.privacy': 'Privacy Policy',
  'legal.terms': 'Terms of Service',
  /* 两页顶部那行「最后更新」。日期由页面按语言格式化后传进来 */
  'legal.updated': 'Last updated {date}',
  'legal.back': 'Back to the game room',
  /* 页脚那个小标题，后面跟着邮箱 */
  'legal.contact': 'Contact us:',

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
    'Three groups, top to bottom. Look: theme (night / day), language (中 / EN), Fullscreen (it is the screen itself that goes fullscreen), Simple mode (keep only the wall, TV, desk and floor), TV size (opens a large / medium / small picker — the desk widens with it). Games: Library (online games and this machine’s history), Netplay, Key bindings. Help: Controls help, and the Guestbook.',

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
  /* 后台左侧那两个 tab —— 游戏列表和留言本 2026-10-10 起分成两页，靠它俩切换 */
  'admin.nav.games': 'Games',
  'admin.nav.feedback': 'Guestbook',
  'admin.upload.title': 'Add a game',
  'admin.field.title': 'Title',
  'admin.field.image': 'Cover image',
  'admin.field.rom': 'ROM file',
  'admin.field.console': 'Console',
  'admin.field.language': 'Language',
  'admin.field.series': 'Series',
  'admin.field.year': 'Year',
  'admin.field.developer': 'Developer',
  /* 说明 / 简介（2026-10-12 加的字段）。多行，可留空；前台只在游戏库卡片的悬停提示里露 */
  'admin.field.description': 'Description',
  'admin.description.placeholder': 'Optional. Shows up as a hover hint on the library card.',
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

  /*
   * 游戏列表 / 详情 / 下载三页的**界面文案**（2026-10-12）。
   *
   * 这三页和法务那两页同一类：真正的路由、**服务端组件**（语言在服务端读好，
   * 见 lib/server/locale.ts），整页没有一个 state —— 唯一的交互是下载那个倒计时，
   * 在客户端组件 `RomDownloadGate` 里。
   *
   * `topLinks.*` 是房间右上角那一行：`games` 是新加的入口，`label` 是那一行
   * `<nav>` 的名字（它现在同时装着游戏列表和两页法务，所以不能再叫「法务」）。
   */
  'topLinks.label': 'Site pages',
  'topLinks.games': 'Game list',

  'gamesPage.heading': 'All games',
  'gamesPage.intro':
    '{count} games in the online library — NES, SNES / SFC and arcade. Click a cover for details, or start playing straight away.',
  'gamesPage.empty': 'The library is empty right now.',
  /*
   * 列表页的搜索框（2026-10-12 加）。刻意**和房间弹窗那组 `games.search*` 各写一份** ——
   * 那组是弹窗里的（客户端过滤一份已拉回来的列表），这组是**服务端搜索**（关键词进 URL
   * `?q=`，跟着 D1 一起查）。两边行为不同、将来文案也会各走各的，共用键只会互相绊住。
   * （`prev` / `next` / `empty` 也是这么两份的，见上面。）
   *
   * `searchResults` / `searchEmpty` 带 `{keyword}`：搜索页必须把「搜的是什么」写出来，
   * 否则用户看到一屏结果不知道是自己搜的哪一句（尤其从别人发的链接点进来时）。
   */
  'gamesPage.searchLabel': 'Search the game library',
  'gamesPage.searchPlaceholder': 'Search title / developer / series',
  'gamesPage.searchSubmit': 'Search',
  'gamesPage.searchClear': 'Clear search',
  'gamesPage.searchResults': '“{keyword}” — {count} matching games.',
  'gamesPage.searchEmpty': 'No games match “{keyword}”. Try a shorter word, or the game title.',
  'gamesPage.prev': 'Prev',
  'gamesPage.next': 'Next',
  'gamesPage.backHome': 'Back to the room',
  'gamesPage.backToGames': 'All games',
  'gamesPage.backToGame': 'Back to the game',
  'gamesPage.play': 'Play now',
  'gamesPage.download': 'Download ROM',
  /* 详情页「分享游戏」：点一下复制这一页的规范地址（见 components/ShareGameButton.tsx） */
  'gamesPage.share': 'Share this game',
  'gamesPage.shareCopied': 'Link copied',
  'gamesPage.shareFailed': 'Copy failed',
  'gamesPage.field.console': 'Console',
  'gamesPage.field.year': 'Year',
  'gamesPage.field.developer': 'Developer',
  'gamesPage.field.series': 'Series',
  'gamesPage.field.language': 'Language',
  'gamesPage.notFoundTitle': 'Game not found',
  'gamesPage.notFound': 'This game is not in the library (any more).',
  /* 详情页正文：`fallbackDescription` 只在后台没填「说明」时顶上 */
  'gamesPage.fallbackDescription': '{title} is a {console} game.',

  'download.heading': 'Download the ROM',
  'download.hint': 'Click the button below — the download starts 6 seconds later.',
  'download.button': 'Start download',
  'download.waiting': 'Starting in {seconds}s…',
  'download.started': 'Download started — check your browser downloads.',
  /* 兜底那条「没有反应？直接下载」2026-10-12 按用户要求去掉了（它绕开 6 秒缓冲），
     所以 `download.manual` / `download.manualLink` 两条文案跟着删了。 */
  'download.rights': 'Only download ROM files you are legally allowed to use.',
  /* 首页那条 `?id=` 深链：从详情页点「开始游戏」过来，但库里已经没有这条了 */
  'deepLink.notFound': 'That game could not be found — it may have been removed.',
  /*
   * 深链载入中那颗**独立弹窗**（ConsoleScene 的 `deepLinkGame`）：标题栏、进度条
   * 上面那行、以及底部那句「下完会自己开始」。弹窗上的「取消」直接复用
   * `games.cancel` —— 就是同一个动作、同一个词，没必要再抄一遍。
   */
  'deepLink.title': 'Loading game',
  'deepLink.loading': 'Downloading the ROM…',
  'deepLink.hint': 'Starts automatically once the download finishes.',
} as const;

export type MessageKey = keyof typeof en;

const zh: Record<MessageKey, string> = {
  'meta.title': '{site} — 在浏览器里在线玩复古游戏：NES / SFC / 街机',
  'meta.description':
    '在浏览器里直接玩复古游戏：NES、SFC（超级任天堂）和街机都能跑。从在线游戏库挑一盘，或把自己的 ROM 文件拖到像素风电视机上，打开即玩、免安装。',
  'meta.keywords':
    '复古游戏, 在线游戏库, 在线玩 NES, NES 模拟器, SFC 模拟器, 超级任天堂, 街机模拟器, 浏览器模拟器, 网页模拟器, 免安装, {site}',
  'seo.heading': '在浏览器里玩复古游戏',
  'seo.intro':
    '{site}是一个在线复古游戏厅。NES、SFC（超级任天堂）和街机游戏直接跑在浏览器里 —— 由本机模拟，内核是编译成 WebAssembly 的 RetroArch。',
  'seo.howTo': '从在线游戏库挑一盘，或把自己的 ROM 文件拖到电视机上。无需安装。',

  /* 游戏列表 / 详情 / 下载三页的 SEO 文案，见上面英文那份的注释 */
  'seo.games.title': '全部游戏 —— 在线玩 NES / SFC / 街机',
  'seo.games.description':
    '在线游戏库共 {count} 款复古游戏，全部可以直接在浏览器里玩：NES、SFC（超级任天堂）和街机。点开任意一款看详情、直接开玩，或者下载 ROM 文件。',
  /* 搜索结果两条，见上面英文那份的注释（人不索引、只给人看） */
  'seo.games.search.title': '「{keyword}」的搜索结果',
  'seo.games.search.description':
    '在线游戏库里匹配「{keyword}」的游戏共 {count} 款。可以直接在浏览器里玩，也可以下载 ROM 文件。',
  'seo.game.title': '{title} —— 在线玩 {console} 游戏',
  'seo.game.description':
    '直接在浏览器里玩《{title}》（{console}）—— 免费、免安装，也可以下载 ROM 文件。',
  'seo.gameDownload.title': '下载《{title}》ROM（{console}）',
  'seo.gameDownload.description':
    '一键下载《{title}》（{console}）的 ROM 文件，无需注册。也可以直接在浏览器里玩。',

  'notice.desktopOnlyTitle': '仅限桌面端',
  'notice.desktopOnly': '这个房间只在桌面端开放，请把浏览器窗口拉宽到 900px 以上。',

  'theme.toDark': '切换到夜晚模式',
  'theme.toLight': '切换到白天模式',
  'lamp.turnOn': '开灯',
  'lamp.turnOff': '关灯',
  'simple.enter': '简洁模式：只保留背景墙、电视机、桌子和地面',
  'simple.exit': '退出简洁模式',
  /* 电视机大小，见上面英文那份的注释（点开是 大 / 中 / 小 三档的选择器） */
  'tvSize.open': '电视机大小',
  'tvSize.opt.large': '大',
  'tvSize.opt.medium': '中',
  'tvSize.opt.small': '小',
  'tvSize.pick': '把电视机大小设为「{level}」',
  'locale.toZh': '切换到中文',
  'locale.toEn': '切换到英文',
  'fullscreen.enter': '游戏画面全屏',
  'fullscreen.exit': '退出全屏',

  'screen.pick': '点击选择 ROM 文件，或把文件拖到这里',
  'screen.srLabel': '选择要运行的 ROM 文件',

  /* 屏幕里那几句提示的可见文字（英文那侧全大写，中文不跟） */
  'screen.dragDrop': '把 ROM 拖进来',
  'screen.orClick': '或点屏幕选择文件',
  'screen.orLibrary': '或从游戏库启动',
  'screen.release': '松手载入',
  /* 移动端的待机提示 —— 移动端只能从在线游戏库载入，见 en 那边同一段的注释 */
  'screen.mobileLibrary': '从游戏库载入游戏',
  'screen.mobileTap': '点屏幕打开游戏库',
  'screen.waitingHost': '等待房主画面',
  'screen.paused': '已暂停',
  'screen.resumeOnPanel': '按机身面板的继续键',
  'screen.waitHostResume': '等待房主继续',

  'panel.resume': '继续',
  'panel.pause': '暂停',
  'panel.save': '存档',
  'panel.load': '读档',
  'panel.reset': '重载',
  'panel.eject': '弹出',

  'volume.down': '音量减一档',
  'volume.up': '音量加一档',
  'volume.set': '把音量设为第 {level} 档（共 {max} 档）',

  'saves.title': '读档',
  'saves.load': '加载',
  'saves.close': '关闭',

  'library.removeLabel': '移除 {name}',

  'legend.moves': '移动',
  // 原来这里有一条 `legend.shortcut`（P / R / F5 / F8）—— 快捷键已全部取消，见英文版注释
  'legend.open': '按键说明',
  'legend.title': '按键说明',
  'legend.close': '关闭',
  'legend.needZip': '格式  FBNeo 只吃 .zip —— 这个是 {ext}，重新打包一下（或换一个 .zip 版）',
  /* 手柄，见上面英文那份的注释。 */
  'legend.gamepad': '手柄  插上就能用；联机时房主和加入者各插一个也可以。',

  'netplay.title': '联机',
  'netplay.open': '联机对战',
  'netplay.close': '关闭',
  'netplay.create': '创建房间',
  'netplay.or': '或',
  'netplay.join': '加入',
  // 保持 ASCII：输入框走 font-pixel，该字模没有中日韩字形
  'netplay.codePlaceholder': 'CODE',
  'netplay.hint':
    '双方都能访问公共中继即可，请确保在同一个局域网。',
  'netplay.roomCode': '房间码',
  /* 链路选择器。「局域网」= 只 STUN；「公网」= 额外带 TURN 兜底（仍是直连优先） */
  'netplay.modeLan': '局域网',
  'netplay.modeWan': '公网',
  'netplay.wanDev': '公网联机正在开发中。',
  /* 出画档位。理由同英文版那段：差别是帧率 / 分辨率 / 码率，来龙去脉见 lib/netplay.ts */
  'netplay.quality': '出画质量',
  'netplay.qualitySmooth': '流畅',
  'netplay.qualityBalanced': '均衡',
  'netplay.qualitySharp': '清晰',
  'netplay.qualityHint':
    '出画质量会影响流畅度,建议使用均衡档。',
  'netplay.copy': '复制',
  'netplay.copied': '已复制',
  /* 「分享」= 复制带房间码的链接，见英文表里同一条上面的说明 */
  'netplay.share': '分享',
  'netplay.shareCopied': '链接已复制',
  /* 打开分享链接时的确认框 */
  'netplay.inviteTitle': '房间邀请',
  'netplay.inviteBody': '加入房间 {code}？',
  'netplay.inviteJoin': '加入',
  'netplay.inviteCancel': '取消',
  'netplay.connected': '已连接',
  'netplay.waiting': '等待对方加入',
  // 加入者侧的「还没连上」是另一回事（我正在连过去），理由同英文版
  'netplay.joining': '正在加入房间…',
  'netplay.waitingGame': '已连接，等房主插上卡带',
  'netplay.hostPlaying': '房主正在玩',
  /** 房主按了暂停 —— 挂在游戏名后面的小标（屏幕里那层 PAUSED 说的是同一件事） */
  'netplay.paused': '已暂停',
  // 和英文版同一个理由：分两句说（房主等的和加入者等的不是一件事）、都不列键位
  'netplay.toastHost': '已连上 · 对方进来了 · 你是 1P',
  'netplay.toastGuest': '已连上房主 · 你是 2P',
  // 对方离开那两枚提示，理由同英文版：房主「人走了房间还在」、加入者「房主走了房间没了」，两码事
  'netplay.toastHostLeft': '房主已离开 · 房间已关闭',
  'netplay.toastGuestLeft': '玩家二已离开房间',
  // 和英文版同一个理由：这里不列键位，改过键位之后那段清单就会说假话
  'netplay.youAreHost':
    '你是 1P。插上卡带后画面会自动推给对方。键位就是你自己的那套，当前值见「按键说明」。',
  'netplay.youAreGuest':
    '你是 2P。不需要卡带，房主会把画面推过来；你的键盘和手柄都会发给房主。键盘按的是自己那套键（玩家 1 组），手柄插上直接能用 —— 当前值见「按键说明」。',
  'netplay.leave': '离开房间',
  'netplay.badCode': '房间码不对，应该是 4 位。',
  'netplay.errInsecure':
    '联机需要 HTTPS 或 localhost。当前页面是普通 http，浏览器不提供它依赖的加密接口。',
  'netplay.errNoDirect':
    '双方都连上了中继，但建不起直连 —— 通常是 NAT 或防火墙。同一个局域网成功率最高。',
  'netplay.errPassword': '房间码对不上。',
  'netplay.errHandshake': '握手超时，对方可能已经离开了。',
  'netplay.errHostLeft': '房主已离开房间，房间已关闭。',
  // 加入者专用：房间已有一对在玩（本站只支持 1 对 1，第三个人会被房主请出去）
  'netplay.errRoomFull': '房间已满，本游戏只支持 1 对 1。',
  'netplay.errUnknown': '连不上对方。具体原因在浏览器控制台里。',

  'keybind.title': '自定义按键',
  'keybind.open': '自定义按键',
  'keybind.close': '关闭',
  'keybind.p1': '玩家 1',
  'keybind.p2': '玩家 2',
  'keybind.mine': '你的键位',
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
  'keybind.guestHint':
    '你是加入者，用你自己那套（玩家 1 组）—— 联机时两人各在自己的键盘前，不存在抢键。改完立刻生效，不用重载卡带。',
  'keybind.guestLocalHint':
    '你是加入者，本机还跑着一盘自己的卡带。你按的就是「玩家 1」那组：本机那盘按它读键盘，改完要重载卡带；发给房主的也是它，那部分立刻生效。',

  'games.open': '游戏库',
  'games.title': '游戏库',
  'games.close': '关闭',
  'games.empty': '游戏库还是空的 —— 还没有上传过游戏',
  'games.loading': '载入中…',
  /* 载入某盘游戏时面板底部那条状态栏，见英文表里同一条上面的说明 */
  'games.loadingRom': '正在载入 {name}…',
  'games.cancel': '取消',
  'games.failed': '游戏库读取失败',
  'games.tabLibrary': '游戏库',
  'games.tabHistory': '历史',
  'games.historyEmpty': '还没有从游戏库载入过游戏',
  'games.historyLoad': '{name}\n点击重新载入',
  'games.filterAll': '全部',
  'games.searchPlaceholder': '搜索标题 / 开发者 / 系列',
  'games.search': '搜索',
  'games.noMatch': '没有匹配的游戏。',
  /* 翻页条，见英文表里同一条上面的说明 */
  'games.prev': '上一页',
  'games.next': '下一页',
  /* 只有中文版，英文那份是空串 —— 见英文表里同一条上面的说明 */
  'games.remoteSlow':
    '提示：在线游戏库的文件存放在境外服务器，载入可能偏慢。',

  'note.text': '愿我们都能找回童年时的开心.. \n 更多彩蛋等你发现哦!',
  'note.open': '读一读地上那张纸',
  'note.title': '一张纸',
  'note.close': '关闭',
  'window.cycle': '换一换窗外的季节',
  /* 墙上那幅挂画：点开按钮 + 每幅的画名与作者，见英文表里那一组上面的注释 */
  'painting.open': '凑近看看这幅画',
  'painting.close': '关闭',
  'painting.title.sunflowers': '向日葵',
  'painting.artist.sunflowers': '文森特·梵高',
  'painting.title.monaLisa': '蒙娜丽莎',
  'painting.artist.monaLisa': '列奥纳多·达·芬奇',
  'painting.title.starryNight': '星月夜',
  'painting.artist.starryNight': '文森特·梵高',
  'painting.title.scream': '呐喊',
  'painting.artist.scream': '爱德华·蒙克',
  'painting.title.pearl': '戴珍珠耳环的少女',
  'painting.artist.pearl': '约翰内斯·维米尔',
  'painting.title.wave': '神奈川冲浪里',
  'painting.artist.wave': '葛饰北斋',
  /* 第七幅是用户自己的照片，说法由他指定 —— 别改（见英文表里那条注释） */
  'painting.title.unknown': '不知从哪来的不知名画作',
  'painting.artist.unknown': '佚名',
  /* 地板上那台 MP4，见上面英文那份的注释（整台机器是一个按钮，这里只有它的名字） */
  'mp4.play': '在 MP4 上放首歌',
  'mp4.pause': '暂停 MP4',

  /* 逗猫棒（彩蛋的开关）和七只猫的品种名，见英文表里那一组上面的注释 */
  'cat.wand': '摇一摇逗猫棒',
  'cat.ragdoll': '书后面探出一只布偶猫',
  'cat.siamese': '书后面探出一只暹罗猫',
  'cat.tabby': '书后面探出一只狸花猫',
  'cat.orange': '书后面探出一只橘猫',
  'cat.american': '书后面探出一只美短',
  'cat.tuxedo': '书后面探出一只奶牛猫',
  'cat.calico': '书后面探出一只三花猫',

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

  /* 隐私政策 / 服务条款，正文在 lib/legal.ts（见英文表里那一组上面的注释） */
  'legal.open': '隐私与服务条款',
  'legal.privacy': '隐私政策',
  'legal.terms': '服务条款',
  'legal.updated': '最后更新 {date}',
  'legal.back': '返回游戏屋',
  'legal.contact': '联系我们：',

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
    '分三组，从上到下。外观：主题（夜晚 / 白天）、语言（中 / EN）、全屏（全屏的是屏幕本身）、简洁模式（只留背景墙、电视机、桌子和地面）、电视机大小（点开是 大 / 中 / 小 三档，桌子跟着变长）。游戏：游戏库（在线库 + 本机历史）、联机、自定义按键。帮助：按键说明、留言本。',

  'admin.title': '后台',
  'admin.login.title': '后台登录',
  'admin.login.username': '用户名',
  'admin.login.password': '口令',
  'admin.login.submit': '登录',
  'admin.login.submitting': '登录中…',
  'admin.login.error': '用户名或口令不对',
  'admin.login.failed': '登录失败，请重试',
  'admin.logout': '退出登录',
  'admin.nav.games': '游戏列表',
  'admin.nav.feedback': '留言本',
  'admin.upload.title': '添加游戏',
  'admin.field.title': '游戏名',
  'admin.field.image': '封面图片',
  'admin.field.rom': '游戏文件',
  'admin.field.console': '类型',
  'admin.field.language': '语言',
  'admin.field.series': '系列',
  'admin.field.year': '年份',
  'admin.field.developer': '开发者',
  /* 说明 / 简介，见上面英文那份的注释 */
  'admin.field.description': '说明',
  'admin.description.placeholder': '选填。鼠标停在游戏库那张卡片上时会显示这行字。',
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

  /* 游戏列表 / 详情 / 下载三页的界面文案，见上面英文那份的注释 */
  'topLinks.label': '站点页面',
  'topLinks.games': '游戏列表',

  'gamesPage.heading': '全部游戏',
  'gamesPage.intro':
    '在线游戏库共 {count} 款：NES、SFC（超级任天堂）和街机。点封面看详情，也可以直接开玩。',
  'gamesPage.empty': '游戏库现在还是空的。',
  /* 列表页的搜索框，见上面英文那份的注释（和房间弹窗那组 `games.search*` 各写一份） */
  'gamesPage.searchLabel': '搜索游戏库',
  'gamesPage.searchPlaceholder': '搜索标题 / 开发者 / 系列',
  'gamesPage.searchSubmit': '搜索',
  'gamesPage.searchClear': '清除搜索',
  'gamesPage.searchResults': '「{keyword}」共 {count} 个结果。',
  'gamesPage.searchEmpty': '没有匹配「{keyword}」的游戏，换个短一点的词，或者直接搜游戏名。',
  'gamesPage.prev': '上一页',
  'gamesPage.next': '下一页',
  'gamesPage.backHome': '回到房间',
  'gamesPage.backToGames': '全部游戏',
  'gamesPage.backToGame': '返回游戏详情',
  'gamesPage.play': '开始游戏',
  'gamesPage.download': '下载 ROM',
  'gamesPage.share': '分享游戏',
  'gamesPage.shareCopied': '已复制',
  'gamesPage.shareFailed': '复制失败',
  'gamesPage.field.console': '类型',
  'gamesPage.field.year': '年份',
  'gamesPage.field.developer': '开发者',
  'gamesPage.field.series': '系列',
  'gamesPage.field.language': '语言',
  'gamesPage.notFoundTitle': '找不到这个游戏',
  'gamesPage.notFound': '这个游戏不在游戏库里（可能已经被移除）。',
  'gamesPage.fallbackDescription': '《{title}》是一款 {console} 游戏。',

  'download.heading': '下载 ROM',
  'download.hint': '点下面的按钮，6 秒后开始下载。',
  'download.button': '开始下载',
  'download.waiting': '{seconds} 秒后开始…',
  'download.started': '已开始下载，请查看浏览器的下载目录。',
  /* 见上面 en 那份的说明：兜底那条「直接下载」连同它的文案一起删了 */
  'download.rights': '请只下载你有权使用的 ROM 文件。',

  'deepLink.notFound': '找不到这个游戏，可能已经被移除。',
  /* 深链载入中那颗独立弹窗，见英文表里同一条上面的说明 */
  'deepLink.title': '正在载入游戏',
  'deepLink.loading': '正在下载 ROM…',
  'deepLink.hint': '下载完成后自动开始',
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
 * 带上年份是为了跨年之后还能分清 —— 存档只有 5 份、历史最多 10 条，最旧的那条可能放很久。
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
