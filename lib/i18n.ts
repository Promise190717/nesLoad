/**
 * 极简 i18n：不引第三方库，但**做按语言分路由**（2026-10-13 起）。
 *
 * 语言是**路径说了算**：
 *   · 英文 —— 默认语言，**不占前缀**（`/`、`/games`、`/games/<id>`）；
 *   · 中文 —— 占 `/zh`；繁体 —— `/zh-TW`；
 *   · 日文 —— `/ja`；韩文 —— `/ko`（2026-10-16 加）；
 *   · 其余 13 种 —— `/es` `/hi` `/pt` `/fr` `/de` `/it` `/ru` `/fil` `/nl` `/vi`
 *     `/th` `/ms` `/id`（**2026-10-20 加**，口径与上游站点的语言切换器对齐）。
 * 所以同一个页面有 **18 个地址**，各自一种语言，`hreflang` 互指。
 *
 * 前台页面都住在 `app/[locale]/` 下（语言是路由参数 `params.locale`），
 * 而**前缀的搬运全在 middleware**（见 middleware.ts）：无前缀会被内部 rewrite 成
 * `/en/...`，带前缀的原样放行，两边都往请求头塞一个语言戳（根布局在 `[locale]`
 * 段外面，只能靠那个头拿语言）。
 *
 * 语言只有两个来源：
 *   · **路径** —— 带前缀就是那个语言，对谁都一样（`/zh/games` 一定是中文）；
 *   · **cookie** —— 用户主动设置过。它只在「访问无前缀地址」时决定要不要送去带前缀那份。
 *
 * ⚠️ **浏览器语言（Accept-Language / navigator.language）不再是任何语言的来源**
 * （2026-10-13 用户要求：「没主动设置过，访问哪个就是哪个，不要跳转」）。
 * 它只在客户端弹窗里用一次 —— 问用户要不要切（`components/LocalePrompt.tsx`）。
 * 唯一例外是**后台**：它没有语言前缀，路径里读不出语言，所以 middleware 的守卫分支
 * 仍按 cookie → Accept-Language 兜底（只写请求头，不引起跳转）。
 *
 * ⚠️ **界面语言（这里）≠ 内容语言**（`lib/game-text.ts` 的 `CONTENT_LOCALES`）。
 * 界面 2026-10-20 起是 **18 种**，内容语言仍然只有 zh / en / ja / ko，**这是两套东西**：
 * 这里管的是「按钮上写什么」，那边管的是「库里这款游戏叫什么」。
 * 内容语言可以**先录数据、界面后开**，反之亦然（现在就是：18 种界面里，
 * 只有 4 种能在库里找到对应语言的游戏文案，其余 14 种站看到的是中文原文兜底）。
 *
 * ⚠️ **18 张文案表**：`en` / `zh` 在下面（`en` 是基准表，`MessageKey` 由它推导），
 * 其余 16 张在**同目录的独立文件**里（`i18n.<code>.ts`）——
 * 理由和 `lib/legal.ts` 当初分出去的一样：18 份表全塞进这个文件会把它冲到上万行，
 * 谁都翻不动。代价是「加语言」变成「加一个文件 + 改 `messages`」两步，不再是纯改一处。
 * 每张表都是 `Record<MessageKey, string>`（558 个键），少一个 / 多一个都编译报错。
 *
 * 这里只放「常驻在界面上的文案」。屏幕里没有任何提示语，所以载入失败、存档结果
 * 这类一次性反馈没有对应条目 —— 它们的表现是画面本身（雪花 / 游戏画面）和
 * 面板按钮的可用状态。
 */

import { ja } from './i18n.ja';
import { ko } from './i18n.ko';
import { es } from './i18n.es';
import { hi } from './i18n.hi';
import { pt } from './i18n.pt';
import { fr } from './i18n.fr';
import { de } from './i18n.de';
import { it } from './i18n.it';
import { ru } from './i18n.ru';
import { fil } from './i18n.fil';
import { nl } from './i18n.nl';
import { vi } from './i18n.vi';
import { th } from './i18n.th';
import { ms } from './i18n.ms';
import { id } from './i18n.id';
import { zhTW } from './i18n.zh-TW';

export type Locale =
  | 'zh'
  | 'zh-TW'
  | 'en'
  | 'ja'
  | 'ko'
  | 'es'
  | 'hi'
  | 'pt'
  | 'fr'
  | 'de'
  | 'it'
  | 'ru'
  | 'fil'
  | 'nl'
  | 'vi'
  | 'th'
  | 'ms'
  | 'id';

/**
 * 全部受支持的语言。遍历前缀 / 生成 hreflang / sitemap 每条路径出几份都从这儿走。
 * **默认语言放第一个**（`x-default` 与无前缀那份都是它）。
 *
 * ⚠️ **2026-10-20 从 4 种扩到 18 种**，口径与上游站点（retrogamesnexus.com）的
 *    语言切换器逐项对齐：`en / zh / zh-TW / ja / ko / es / hi / pt / fr / de / it /
 *    ru / fil / nl / vi / th / ms / id`。顺序照上游的 `hrefLang` 顺序抄，别随手重排 ——
 *    hreflang 那组标注只要顺序变了就整组重发一遍，收益为零。
 *
 * ⚠️ **加语言要动的清单**（漏一处就是「路由有了、界面还是英文」或者编译报错）：
 *    ① 这里 + `Locale` 联合类型；
 *    ② 新文件 `lib/i18n.<code>.ts`（558 个键，与 `en` 逐键对齐）+ 上面的 import + `messages`；
 *    ③ `LOCALE_OPTIONS` / `LOCALE_SWITCH_LABEL` / `LOCALE_PREFIX` / `SITE_NAME`；
 *    ④ `HTML_LANG` / `OG_LOCALE` / `DATE_LOCALE`；
 *    ⑤ `resolveLocale`（浏览器语言标签 → 本站 locale）；
 *    ⑥ `lib/legal.ts` 的两份法务文档（没翻的语言回退英文，见那边的注释）。
 *    `middleware.ts` / `sitemap.ts` / `alternatesFor` / 语言下拉**都不用改** —— 它们遍历这份清单。
 */
export const LOCALES: readonly Locale[] = [
  'en',
  'zh',
  'zh-TW',
  'ja',
  'ko',
  'es',
  'hi',
  'pt',
  'fr',
  'de',
  'it',
  'ru',
  'fil',
  'nl',
  'vi',
  'th',
  'ms',
  'id',
];


/** 兜底语言：任何语言标签都匹配不上时用它。也是**唯一不占前缀**的那个。 */
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * 语言选择器的选项。
 *
 * **文字各用本语言写**（简体中文 / English / 日本語 / Español …）—— 语言选择器的惯例：
 * 万一用户看不懂当前界面语言，也得能认出自己要选哪个。
 *
 * ⚠️ 和「切换钮」上那句话（`LOCALE_SWITCH_LABEL`）**刻意不同**：那颗钮是一个动词短语
 *    （「切换到简体中文」），下拉里的选项只是一个名字（「简体中文」）。
 *
 * ⚠️ **顺序刻意不是 `LOCALES` 的顺序**：`LOCALES` 把默认语言（英文）放第一个是为了
 *    hreflang / sitemap 的稳定顺序；这里原排「中文（简 → 繁）→ 英文 → 日韩 →
 *    其余按上游语言切换器的顺序」，别顺手改成 `LOCALES.map(…)`。
 *    2026-10-13 定下「中文优先」，2026-10-16 接日韩，2026-10-20 接其余 14 种；
 *    同日用户改主意：**英文提到第一位**，其余不变。
 *
 * ⚠️ **18 项**：下拉必须能滚（`.locale-options` 的 `max-height` + `overflow-y`，
 *    见 `app/globals.css`）—— 不加限高会顶出屏幕、底部那几项点不到。
 *
 * 放在 `lib/i18n.ts` 而不是某个组件里：**三处**在用 —— 房间右上角那行
 * （`ConsoleScene`）、内容页顶栏（`components/LocaleSwitcher.tsx`）、
 * 首次访问的语言提示（`components/LocalePrompt.tsx`，取目标语言的名字）。
 * 各写一份的话，加语言时只会改到其中一处。
 */
export const LOCALE_OPTIONS: readonly { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'es', label: 'Español' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'pt', label: 'Português' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'it', label: 'Italiano' },
  { value: 'ru', label: 'Русский' },
  { value: 'fil', label: 'Filipino' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'th', label: 'ไทย' },
  { value: 'ms', label: 'Bahasa Melayu' },
  { value: 'id', label: 'Bahasa Indonesia' },
];

/**
 * 「切换到 <某语言>」那颗钮上的字 —— **用目标语言写**，一份语言一条。
 *
 * 为什么不放进文案表（`locale.toZh` / `locale.toEn` 那两个键 2026-10-16 删了）：
 * 那颗钮的读者是**想要另一种语言的人**，所以字必须是他看得懂的那种语言，
 * 而**不是当前页面语言**。放进文案表就得按「目标语言 × 页面语言」开 18×18 个键，
 * 其中绝大多数取值还都一样 —— 那是把一张 18 行的表摊成矩阵。
 *
 * 于是规矩一句话：**页面语言决定弹窗正文（`localePrompt.*`），目标语言决定这颗钮。**
 * 前两种语言的写法沿用 2026-10-13 的老文案（中文那份本来就是中文写的，
 * 英文那份本来就是英文写的 —— 只是当年放在 `en` 表里看着像巧合）。
 */
export const LOCALE_SWITCH_LABEL: Record<Locale, string> = {
  zh: '切换到简体中文',
  'zh-TW': '切換到繁體中文',
  en: 'Switch to English',
  ja: '日本語に切り替える',
  ko: '한국어로 전환',
  es: 'Cambiar a español',
  hi: 'हिन्दी में बदलें',
  pt: 'Mudar para português',
  fr: 'Passer au français',
  de: 'Auf Deutsch wechseln',
  it: "Passa all'italiano",
  ru: 'Переключить на русский',
  fil: 'Lumipat sa Filipino',
  nl: 'Overschakelen naar Nederlands',
  vi: 'Chuyển sang tiếng Việt',
  th: 'เปลี่ยนเป็นภาษาไทย',
  ms: 'Tukar ke bahasa Melayu',
  id: 'Ganti ke bahasa Indonesia',
};

/**
 * 各语言的 URL 前缀。**默认语言刻意是空串** —— 英文页不该多一层 `/en`，
 * 那样老地址（`/games`）会全部变成 301，分享出去的链接也跟着变。
 *
 * ⚠️ `zh-TW` 的前缀是 `/zh-TW`（**大小写照上游**，不是 `/zh-tw`）。
 *    middleware 的匹配用的是 `pathname === prefix || pathname.startsWith(prefix + '/')`，
 *    所以 `/zh` 不会把 `/zh-TW/…` 吃掉 —— 改这里时别把那个斜杠去掉。
 */
export const LOCALE_PREFIX: Record<Locale, string> = {
  en: '',
  zh: '/zh',
  'zh-TW': '/zh-TW',
  ja: '/ja',
  ko: '/ko',
  es: '/es',
  hi: '/hi',
  pt: '/pt',
  fr: '/fr',
  de: '/de',
  it: '/it',
  ru: '/ru',
  fil: '/fil',
  nl: '/nl',
  vi: '/vi',
  th: '/th',
  ms: '/ms',
  id: '/id',
};

/**
 * 英文前缀的**显式写法**。它不是合法地址：`/en/games` 与 `/games` 是同一页，
 * 留着就是重复内容，middleware 会 301 掉它（`hreflang` 里也只能出现一种）。
 * 单独列出来是因为它是**用户会手输**的形态（从别的站抄过来、或者猜出来的）。
 */
export const EN_PREFIX = '/en';

/**
 * middleware 往请求头里塞的「本次请求该用哪种语言」。
 *
 * 页面（`lib/server/locale.ts`）靠它定语言，不再自己解析 cookie —— 路径已经
 * 把语言定死了，再让页面自己猜一遍只会猜出不一致的结果。
 *
 * 前缀 `x-nesload-` 是自留地：middleware 见到它就知道「这条请求已经过一遍手了」，
 * 用它防 rewrite 之后再次执行时的死循环（见 middleware.ts）。
 */
export const LOCALE_HEADER = 'x-nesload-locale';

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
 *
 * ⚠️ 2026-10-16 加日韩时，用户定的是「**起一个本地友好的名字**」而不是沿用
 *    `Game Hut` —— 所以四份都是本地写法。日文取「ゲーム小屋」（和中文同构，
 *    `ゲーム` 是日语里通用的外来语写法）；韩文取「게임 하우스」（韩文里
 *    `하우스` 作店名 / 品牌后缀比直译「오두막」自然得多）。
 *    改名仍然只动这一处。
 *
 * ⚠️ **2026-10-20 加其余 14 种时，口径反过来**：一律沿用英文品牌 `Game Hut`，
 *    只有 `zh-TW` 跟简体那份走、写「遊戲小屋」（同一个中文品牌，只是字形不同）。
 *    理由：拉丁字母品牌在 es / fr / de / it / pt / nl / vi / id / ms / fil 里
 *    直接当专名用是常态，硬译成「Cabaña de Juegos」「Spielehütte」反而像另一个站；
 *    而 hi / th / ru 里品牌名保留拉丁字母也比音译更好认。
 *    以后真要本地化某一个，只改那一行即可，别顺手全改。
 */
export const SITE_NAME: Record<Locale, string> = {
  zh: '游戏小屋',
  'zh-TW': '遊戲小屋',
  en: 'Game Hut',
  ja: 'ゲーム小屋',
  ko: '게임 하우스',
  es: 'Game Hut',
  hi: 'Game Hut',
  pt: 'Game Hut',
  fr: 'Game Hut',
  de: 'Game Hut',
  it: 'Game Hut',
  ru: 'Game Hut',
  fil: 'Game Hut',
  nl: 'Game Hut',
  vi: 'Game Hut',
  th: 'Game Hut',
  ms: 'Game Hut',
  id: 'Game Hut',
};

/** 英文是基准表，中文必须逐键对齐（漏键会在编译期报错）。 */
const en = {
  /*
   * SEO 文案（<title> / description / og:* / JSON-LD）。
   *
   * 为什么单独列一组、而不是散在界面文案里：这几条**不进界面**，只给爬虫和社交
   * 卡片看；但它们和界面文案一样**跟着语言走** —— 2026-10-13 起语言分了路径
   * （英文无前缀、中文 `/zh`），所以 meta 按**当前地址**那一份渲染，不再看 cookie。
   *
   * 定位（用户 2026-10-10 明确）：主推「在线玩复古游戏」，NES / SFC / GBA / 街机都算，
   * 有在线游戏库，也支持用自己的 ROM 文件。三条卖点按这个优先级排：
   * 玩什么（复古游戏）> 怎么玩（在线游戏库 / 拖自己的 ROM）> 免安装。
   *
   * ⚠️ 站内机种 **2026-10-14 从四个扩到十二个**（GB / GBC / MD / GG / SMS / 32X /
   *    WonderSwan / Neo Geo Pocket），**2026-10-15 又加了 NDS（第十三个）**。
   *    文案里凡是要列举机种的地方，2026-10-14 起统一成
   *    「**代表机型 + and more / 等**」——全列出来既读不通也超长，而且每加一个机种
   *    就得回来改一遍。所以下面那些列举看着不全，是**刻意的**，别当漏字补全。
   *    ⚠️ 但**「等十余款机种」这个量词**（中文那几条）现在是准的：十三个 = 十余款。
   *       再往上加就得换说法（「等十几款」/「等二十款」）。
   */
  /*
   * <title>：站名在前（品牌词是搜索时最容易命中的），冒号后是「这站能干什么」。
   * 整个标题压在 60 字符上下 —— 再长 Google 就截断了。
   * `{site}` 由调用方替换成 SITE_NAME[locale]，别在这里手写站名。
   */
  'meta.title':
    '{site} — Play Retro Games in Your Browser: NES, SNES, GBA & Arcade',
  /*
   * description：长度按 **155 字符上下** 写（桌面端 Google 大约只显示这么多），
   * 前半句必须能独立成立 —— 后半句被截掉也不能读不通。
   *
   * ⚠️ 机种那串**刻意只列代表机型、末尾加 and more**（2026-10-14 从四个扩到十二个时定的口径，
   *    2026-10-15 加 NDS、2026-10-16 加 PS1 后仍照这套走 —— 不用回来改）：
   *    十四个全列进来既读不通也超长，而每加一个机种就得回来改一遍。机种全名放下面
   *    `meta.keywords` 那条（逗号列表，越长越没关系）。
   */
  'meta.description':
    'Play NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive and arcade games in your browser. Pick a title from the online library, or load your own ROM file.',
  /*
   * keywords：Google 早在 2009 年就不看了，这里留着是给 Bing / Yandex / 站内搜索
   * 之类还有一点权重的地方 —— 属于「写了没坏处、别指望它」的一条。
   * 机种多了之后这里是**唯一把所有机型写全**的地方，加机种顺手补一组词。
   */
  'meta.keywords':
    'retro games, online retro game library, NES emulator, SNES emulator, SFC emulator, GBA emulator, Game Boy Advance emulator, Game Boy emulator, Game Boy Color emulator, NDS emulator, Nintendo DS emulator, Sega Mega Drive emulator, Sega Genesis emulator, Game Gear emulator, Master System emulator, Sega 32X emulator, WonderSwan emulator, Neo Geo Pocket emulator, PlayStation emulator, PS1 emulator, PSX emulator, arcade emulator, play NES in browser, browser emulator, RetroArch WASM, {site}',
  /*
   * 这里**没有** og:image 的 alt —— 不是漏了。
   * alt 由 app/opengraph-image.tsx 按文件约定导出，而那个导出必须是**静态值**，
   * 拿不到当前请求的语言，所以只能是一句写死的英文（见 lib/og-image.tsx 的 OG_ALT）。
   * 写一个 `{site}` 版本放在这里也没人会读，属于dead code，干脆不留。
   */

  /* 下线页面（`app/[locale]/_room`）的 meta。键留着是因为那段代码还在引用，删了编译不过。 */
  'seo.room.title': 'Pixel Room — Play Retro Games in Your Browser',
  'seo.room.description':
    'Step into the pixel room: NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive and arcade games run on the CRT. Pick a title from the online library, or drop your own ROM file onto the screen.',

  /*
   * 登录页（`/login`，2026-10-13 加）。
   *
   * 2026-10-13 之前前台**没有登录页** —— 登录是屋里那颗账号钮弹出来的浮层
   * （`components/UserPanel.tsx`）。内容页顶栏（`components/TopBar.tsx`）那颗「登录」
   * 需要一个能落地的地址（顶栏是普通页面，弹不了屋里的浮层），所以补了这一页。
   *
   * ⚠️ **这一页是 `noindex, follow`**（见 `app/[locale]/login/page.tsx`）：它是一张
   *    表单，没有可索引的正文，收录进去只会是「一页和首页抢同一个词的空壳」。
   *    `follow` 留着 —— 页脚的链接照旧能被顺着爬走。
   *
   * 标题里不写 `{site}`（根布局的 `title.template` 会补，见上面 `seo.room` 那条注释）。
   */
  'seo.login.title': 'Sign in',
  'seo.login.description':
    'Sign in to your account to keep saves, game history and favorites in sync across devices.',

  /*
   * 首页落地页（2026-10-13 加）—— `app/[locale]/page.tsx`。
   *
   * 这一页是**内容页**：Hero + 按机种浏览 + 最新收录 + 按开发商浏览 + FAQ。
   * 每个区块都要给爬虫一段能索引的正文 —— 原来那一页整页只有 canvas 和 CSS 画的屋子，
   * 唯一可读的文字是 sr-only 那三句（见下面 `seo.heading` 那组）。
   *
   * ⚠️ **首页自己不写 metadata**（不导出 `generateMetadata`）：`/` 的标题 / 说明 / canonical
   *    正是根布局那三样（`meta.title` / `meta.description` / `alternatesFor(locale, '/')`），
   *    再写一份只是把同一句话写两遍。子页面（`/games`、`/developers`…）才各写各的。
   */
  'home.hero.title': 'Play classic retro games in your browser',
  'home.hero.lead':
    '{site} has NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, arcade and more to play online, with two-player netplay.',
  /* 首屏那颗「加载本地 ROM」的文案。钮已下线，键留着是因为 18 份表要逐键对齐。 */
  'home.hero.play': 'Load a local ROM',
  'home.hero.browse': 'Browse all games',
  'home.join.title': 'Play with a friend',
  'home.join.hint': 'Enter the 4-character room code shared by your friend.',
  'home.join.submit': 'Join room',
  /* 首屏按钮与搜索框之间的分隔词，单独一行（参考站也是这个结构） */
  'home.hero.or': 'OR',
  'home.search.label': 'Search the game library',
  'home.search.placeholder': 'Search title / developer / series',
  'home.search.submit': 'Search',
  'home.consoles.title': 'Browse by console',
  'home.consoles.lead':
    'NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, arcade and more — pick one to see its games.',
  'home.consoles.count': '{count} games',
  /* 2026-10-14 改：原来写「See every game」（指向 /games），现在机种有了自己的专题页，这里指向 /consoles */
  'home.consoles.all': 'All consoles',
  'home.latest.title': 'Latest additions',
  'home.latest.lead': 'The newest games on the site.',
  'home.latest.viewAll': 'All games',
  'home.developers.title': 'Browse by developer',
  'home.developers.lead': 'These studios have the most games here.',
  'home.developers.viewAll': 'All developers',
  /* 库空了才会用到（正常情况下首页三个区块都有东西可列） */
  'home.empty':
    'The library is empty right now — open the room and drop a ROM onto the CRT to start playing.',
  /*
   * 折叠问答（`<details>`，零 JS）。都只讲**真的实现了**的事，不写没做的卖点 ——
   * 「能用自己的 ROM 吗」那条 2026-10-15 用户要求删掉；手机那条**只说支持**，
   * 别提「变成掌机」（内部实现细节，用户不需要知道）。
   * 联机那条讲联机，2026-10-13 用户明确要求**就写一句招呼**（「快喊上小伙伴，开个房间一起对战吧」），
   * 不展开「谁开房 / 怎么连」这些技术细节。⚠️ 代价：「公网那一档要站点配了 TURN 才放行」
   * 这件事只剩**联机面板里的提示**兜着（没配时那里显示 `netplay.wanDev`）——
   * 那条提示别删，否则「跨网络连不上」就没人告知了。
   */
  'home.faq.title': 'Frequently asked questions',
  'home.faq.q1': 'Is it free?',
  'home.faq.a1':
    'Completely free — every game is open to play. Signing in adds cloud saves for your play history and save files.',
  'home.faq.q2': 'Do I need to install anything?',
  'home.faq.a2':
    'No — just click a game and play it right in your browser.',
  'home.faq.q3': 'Does it work on phones and tablets?',
  'home.faq.a3':
    'Yes — it works right in the browser on phones and tablets.',
  'home.faq.q4': 'Can I download the ROM files?',
  'home.faq.a4':
    'Yes — every game page has a download button. Only download ROM files you are legally allowed to use.',
  'home.faq.q5': 'Can I play with a friend?',
  'home.faq.a5':
    'Of course! Grab a friend and start a room for a match.',
  'home.faq.q6': 'Does it support game controllers?',
  'home.faq.a6':
    'Yes — plug in a USB or Bluetooth controller and the emulator picks it up through your browser. Button mapping follows each core\'s defaults; on a phone you use the on-screen buttons.',

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
    '{site} is an online retro game room. NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive and arcade titles run right here in the browser — emulated on your own machine, with RetroArch compiled to WebAssembly.',
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
   * （`lib/consoles.ts` 的 `consoleLabel(type, locale)` —— 中文站是 FC、英文站是 NES）。
   * 列表页那条带 `{count}` —— 条数是现从库里读的，写死会在增减游戏后变成假话。
   */
  'seo.games.title': 'All games — Play NES, SNES, GBA & Arcade Online',
  'seo.games.description':
    '{count} retro games in the online library, all playable in your browser: NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, arcade and more. Open a title for details, play it instantly, or download the ROM file.',
  /*
   * 搜索结果的标题与说明。**这两条不会进索引**（列表页有 `q` 时是 noindex, follow，
   * 见 app/games/page.tsx 的注释）—— 它们服务的是**人**：标签页上写着搜了什么，
   * 把链接发到聊天里时预览卡也该说得清。所以照「每个页面的标题说明都要写好」写。
   */
  'seo.games.search.title': 'Search results for “{keyword}”',
  'seo.games.search.description':
    '{count} games in the online library match “{keyword}”. Play them in your browser or download the ROM file.',
  /*
   * 机种筛选（`/games?console=<机种>`，2026-10-13 加）。
   *
   * `{console}` 是 `consoleLabel(type, locale)` 的短标签（英文站 NES / SNES / GBA…，
   * 中文与日韩站 FC / SFC / GBA…）—— 和首页「按机种浏览」那几张卡片用的是同一份，
   * 别在这里另写一套机种名（两套迟早对不上）。
   *
   * 这一页**可以收录**（和 `?q=` 的搜索页不同，见上面那两条的注释）：机种是一份有限、
   * 封闭的清单，每个都是一份真实分类，而不是「同一份列表的无限多个子集」。
   */
  'seo.games.console.title': '{console} games — Play Online in Your Browser',
  'seo.games.console.description':
    '{count} {console} games in the online library, all playable in your browser or downloadable as ROM files.',
  'seo.game.title': '{title} — Play {console} Online',
  'seo.game.description':
    'Play {title} ({console}) right in the browser — free, nothing to install. The ROM file is available for download too.',
  'seo.gameDownload.title': 'Download the {title} ROM ({console})',
  'seo.gameDownload.description':
    'Download the ROM file for {title} ({console}) in one click, no sign-up needed. You can also play it right in the browser.',
  /*
   * 开发商两页（2026-10-12 加的）。`developers` 是列表页、`developer` 是单页，
   * 和 games / game 同一套命名。`{count}` 同样是现读的条数。
   */
  'seo.developers.title': 'Game developers — Play their NES, SNES, GBA & Arcade games',
  'seo.developers.description':
    '{count} developers behind the games in the online library. Open one to see every title we have from that studio.',
  'seo.developer.title': '{name} — Games from this developer',
  'seo.developer.description':
    'Every {name} game in the online library ({count}), playable in your browser or downloadable as a ROM file.',

  /*
   * 机种两页（2026-10-14 加的）。`consoles` 是列表页、`console` 是单页，
   * 和 developers / developer 同一套命名。`{count}` 同样是现读的条数。
   */
  'seo.consoles.title': 'Browse by console — Play NES, SNES, GBA & Arcade games online',
  'seo.consoles.description':
    'Every console in the online library ({count} games in total). Pick one to see all of its games, playable in your browser.',
  'seo.console.title': '{name} games — Play online',
  'seo.console.description':
    'Every {name} game in the online library ({count}), playable in your browser or downloadable as a ROM file.',

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
  /*
   * 语言下拉（`ConsoleScene` 右上角那一行第一位那颗自绘下拉）的**读屏名字**。
   * 下拉和旁边那几条文字链接不同 —— 光有当前值（「中文」/「English」）不算标签，
   * 读屏念出来得先知道这是个什么控件。
   *
   * ⚠️ 这里**没有**「切换到 X 语言」的键：那颗钮上的字是 `LOCALE_SWITCH_LABEL`
   *    （在文件上半部分，**按目标语言**写、一份语言一条），不进这张表。
   *    2026-10-13 曾经有 `locale.toZh` / `locale.toEn` 两个键，2026-10-16 加日韩时删了 ——
   *    四种语言再放这儿就是 16 个键、其中 12 个取值重复。
   */
  'locale.label': 'Language',
  /*
   * 语言提示弹窗（`components/LocalePrompt.tsx`）—— 浏览器语言与页面语言不符、
   * 且用户从没主动设置过语言时，在客户端问一句「要不要切」。
   *
   * 文案用**当前页面的语言**写：弹窗是页面的一部分，夹一段外语会更突兀。
   * 只有那颗切换钮写的是**目标语言自己的说法**（`LOCALE_SWITCH_LABEL`，
   * 让目标语言的读者能直接认出来）。
   *
   * ⚠️ 三条都提到了「英文 / 中文」这种语言名，所以**每条语言都要自己一份**
   *    （不像 `locale.label` 那样可以照抄）。
   */
  'localePrompt.title': 'This page is in English',
  'localePrompt.body': 'Your browser prefers another language. Switch?',
  'localePrompt.keep': 'Stay in English',
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
   * 中文刻意压到最短：屏幕本身就不大（1080 高的窗口上最小一档 733×550，矮窗口更小），
   * 字越大越糊；10px 是这套界面上中文的下限
   * （再小笔画就黏在一起了，见 RetroTv 里那几处的字号注释）。
   * 全大写是**英文那一侧的排版风格**，中文不跟（汉字没有大小写）。
   *
   * 2026-10-13：桌面待机提示从三行（拖 / 点 / 库）收成两行 —— 不再提「拖进来」，
   * 第一行直接说点屏幕能干嘛（加载本地 ROM），第二行说在线游戏库。
   * 拖拽功能本身还在（外壳的 onDrop 没动），只是待机文案不再宣传它；
   * 悬停时那句 `screen.pick`（title）仍保留「或把文件拖到这里」的说法。
   *
   * ⚠️ 2026-10-15：`screen.orLibrary` 和下面那对 `screen.mobile*` **目前没有任何代码引用**
   * —— 房间里的游戏库入口收了（用户要求，见 ConsoleScene 那颗钮的注释），
   * ConsoleScreen 的待机层只剩桌面端那一行。键**故意留着不删**：恢复入口时原样放回去。
   */
  'screen.tapLoad': 'CLICK TO LOAD A LOCAL ROM',
  'screen.orLibrary': 'OR LAUNCH FROM THE ONLINE LIBRARY',
  'screen.release': 'RELEASE TO LOAD',
  /*
   * 移动端的待机提示（2026-10-12）。原本移动端**只能从在线游戏库载入** ——
   * 手机上没有拖拽、也没有「选本地文件」那条路（点屏幕 = 打开游戏库），
   * 所以措辞不提文件，只说从库启动。
   * 两行 + 光标，和桌面那套一一对应（主提示 `.screen-hint-sm`，副提示 `.screen-hint-xs`）。
   *
   * ⚠️ 2026-10-15 起**未使用**：房间里掌机那个入口一并收了，掌机不再有待机层。
   */
  'screen.mobileLibrary': 'LAUNCH FROM LIBRARY',
  'screen.mobileTap': 'TAP THE SCREEN TO OPEN THE LIBRARY',
  'screen.waitingHost': 'WAITING FOR HOST',
  'screen.paused': 'PAUSED',
  'screen.resumeOnPanel': 'PRESS RESUME ON THE PANEL',
  /* `/play` 没有机身：那颗「继续」在页面右侧的面板上 */
  'screen.resumeInPanel': 'PRESS RESUME IN THE RIGHT PANEL',
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
   * 存档。列表浮在房间上，不在屏幕里 —— 屏幕里跑的是游戏画面。
   *
   * 2026-10-15：存档已从「快照槽位制」换成**电池存档**（一款一份），所以文案里不再有
   * 「状态 / state」这个说法，也不再提份数。
   */
  'saves.title': 'Load save',
  'saves.load': 'Load',
  'saves.close': 'Close',
  /*
   * 存档列表里两组的分组标题（2026-10-13 加了云端那组）。
   * 「本地 / 云端」是**技术事实**，不是营销词 —— 用户看到两组一样的列表会本能地问
   * 「这俩啥区别」，这两个词就是最省话的回答：一组在这台机器上，一组跟着账号走。
   */
  'saves.groupLocal': 'This device',
  'saves.groupCloud': 'Cloud (account)',
  'saves.deleteCloud': 'Delete this cloud save',
  'saves.delete': 'Delete',
  /* 未登录时云端那组的占位提示 */
  'saves.loginHint': 'Sign in to keep cloud saves and pick up on any device.',
  'saves.login': 'Sign in',
  /* 面板刚弹出来、列表还在路上时的那一行（openLoad 先开面板再取数） */
  'saves.loading': 'Loading…',
  'saves.downloading': 'Downloading cloud save…',
  'saves.restoring': 'Restoring game…',
  /* 本机 + 云端一份都没有 */
  'saves.empty': 'No save yet',

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
   * `/play` 专用（2026-10-15）：那一页的报错只有屏幕里一行 `notice`，
   * 没有 room 那个「按键说明」弹窗可以挂 —— 格式这类「有准话可给」的失败只能并排摊着。
   * ⚠️ 措辞刻意**不照抄** `legend.needZip`（那句说「FBNeo 只吃 .zip」）：这一页
   *    认不出格式时未必是街机（NDS / PS1 的 7z / rar 也走这条路），提 FBNeo 会指错方向。
   */
  'play.needZip':
    'Format  This ROM is a {ext} archive that could not be unpacked — try a .zip or a bare ROM',
  /*
   * 多文件光盘镜像（2026-10-16 加，随 PS1）。
   *
   * 为什么单独一条：PS1 的光盘镜像有一大半是 `.cue` + `.bin` 两个文件，而 `.cue` 只是
   * 一张**纯文本的目录**，真正的数据在同目录的 `.bin` 里。这个入口一次只收一个文件，
   * 收下那张目录也没用（核心找不到它指向的 `.bin`，而且失败是静默的）。
   * 所以这条不说「哪种格式不吃」，而是说「**要单文件**」—— 用户该换的是
   * `.pbp` / `.iso` / `.chd`（`.cue` + `.bin` 装在压缩包里也能跑，见 `lib/unwrap.ts`）。
   *
   * ⚠️ 它**不带 `{ext}` 参数**（和上面两条不同）：要说的不是「你给的是哪种格式」。
   */
  'legend.needDisc':
    'Format  Disc images are usually multi-file (.cue + .bin). This site only takes single-file images — grab a .pbp, .iso or .chd build',
  'play.needDisc':
    'Format  This is a multi-file disc image (.cue + .bin). Only single-file images work here — try a .pbp, .iso or .chd build',
  /*
   * 这盘街机卡带**看着像** Neo Geo 游戏，而 BIOS 本地和站点两份都没拿到。
   * （正常情况下 `ensureBios()` 会自动装站点自带的那份，这条根本不出现 ——
   * 所以它只在「自建部署没放文件」或「用户手动删过」时才可能被看到。）
   *
   * 判据是猜的（见 `lib/bios.ts` 的 `looksLikeNeoGeoRomset`：按 rom 名认，不读内容），
   * 所以措辞留了余地 —— 写「需要」而不是「必须」，别写成断言。
   * 末尾那句「CPS1 / CPS2 不需要」是刻意加的：不装 BIOS 的 CPS 用户看到这条会以为
   * 自己也得去搞一盘，而那类游戏本来就能跑。
   */
  'legend.needBios':
    'BIOS  This looks like a Neo Geo game (KOF, Metal Slug…). It needs neogeo.zip — drag that file onto the page and it gets installed. CPS1 / CPS2 games do not need it.',
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
  'netplay.closeRoom': 'Close room',
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
   * `/play` —— 从游戏详情那颗「联机游戏」进来的那一页（2026-10-14 加）。
   *
   * 版式是「左边一块黑屏 + 右边一列控件」，一页把「怎么开这一局」摆清楚。
   * 文案刻意短 —— 这一页要的就是简洁。
   *
   * ⚠️ 联机那部分的词**一个都没抄在这里**：房间码 / 分享 / 链路 / 画质 / 状态行
   *    全部复用上面的 `netplay.*`。两页说的是同一件事，各存一份迟早漂成两种说法。
   */
  'seo.play.title': 'Play Room — Load a Game and Play Online',
  'seo.play.description':
    'One screen to start a game: play solo, or open a 1v1 room and share the code. NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive and arcade titles.',
  'play.modeSolo': 'Solo',
  'play.start': 'Start',
  'play.confirmStart': 'Confirm and start',
  'play.confirm': 'Confirm',
  'play.qualityIntro': 'Choose the picture quality for online play based on your connection.',
  'play.qualityHint.smooth': '30 fps · Uses less bandwidth, suited to slower connections.',
  'play.qualityHint.balanced': 'Up to 720p / 60 fps · Balances clarity and smooth motion.',
  'play.qualityHint.sharp': 'Up to 60 fps · Prioritizes original-resolution detail; needs a fast connection. Frame rate may drop on slower networks.',
  'play.qualityConfirmHint': 'Confirm to connect to the room. Hosts then load the game; guests receive the host’s picture.',
  'play.connecting': 'Connecting…',
  'play.confirmJoin': 'Confirm and join',
  'play.cancel': 'Cancel',
  'play.screenSize': 'Screen size',
  'play.controlsTitle': 'Game controls',
  'play.netplayKeysHint': 'For online play, each player uses their own Player 1 keys.',
  'play.cancelled': 'Loading cancelled.',
  'play.retry': 'Load again',
  'play.retryJoin': 'Try joining again',
  'play.saved': 'Game saved.',
  'play.localSaving': 'Saving…',
  'play.uploading': 'Uploading…',
  'play.cloudFailed': 'Cloud sync failed.',
  /* 401 专用：本机那份是好的，登录之后云同步就正常 —— 别和「同步失败」混在一起 */
  'play.saveNoLogin': 'Sign in to sync',
  /* 游戏里还没存过盘 —— 没有卡带记忆可拿。**不是错误**，别写成失败口吻 */
  /* 超过云端上限，压根没发出去（本机那份是好的） */
  'play.tooLarge': 'Save too large',
  'play.theme': 'Theme',
  'play.saveFailed': 'Could not save the game. Please try again.',
  'play.loadFailed': 'Could not load the save. Please try again.',
  'play.leftRoom': 'You left the room.',
  'play.latency': 'Latency',
  'play.measuringLatency': 'Measuring…',
  'play.downloading': 'Downloading the ROM…',
  'play.booting': 'Starting the core…',
  'play.loadFail': 'This cartridge failed to load.',
  'play.romIncomplete': 'The ROM file is incomplete — please load it again.',
  'play.notFound': 'That game could not be found.',
  'play.fullscreen': 'Fullscreen',
  /* 右侧操作表上那个音量行的说明词（音量档位本身复用 `volume.*`） */
  'play.volume': 'Volume',
  /* 操作表底部那颗钮。**只写「编辑」**，具体编辑什么靠 tooltip（`keybind.open`）说 */
  'play.edit': 'Edit',
  /* 右栏收起 / 展开那颗钮（2026-10-19 加）。**短** —— 收起后它只有 40px 宽、竖排 */
  'play.hideSidebar': 'Hide panel',
  'play.showSidebar': 'Show panel',
  'play.hint': 'Esc leaves fullscreen. Nothing else here uses the keyboard.',
  /* 左上角返回钮在游戏运行中拦截时弹的自绘确认框（见 PlayBackLink） */
  'play.leaveTitle': 'Game in progress',
  'play.leaveBody':
    'Going back ends this session — progress is not saved automatically.',
  'play.leaveStay': 'Keep playing',
  'play.leaveGo': 'Leave',
  'gamesPage.playOnline': 'Play online',

  /*
   * 自定义按键面板。同样浮在房间上、不进屏幕。
   * 钮名**默认**走街机叫法（A B C X Y Z），由 `lib/keybindings.ts` 的 `BUTTON_LABELS`
   * 直接给出 —— 它们是手柄上的丝印、不进文案表。机种丝印不一样的（NDS 的 A/B/X/Y + L/R、
   * PS1 的 △○×□ + L1/L2/R1/R2）走 `CONSOLE_BUTTON_LABELS` 覆盖，取值一律经
   * `buttonLabel(button, t, consoleType)`。只有「开始 / 投币」是词，跟着语言走。
   * ⚠️ 按钮 tooltip（`keybind.open`）=「按键设置」，和面板标题（`keybind.title`）**故意不同名**：
   * 按钮是「入口」，面板标题说的是里面干的活。别顺手统一成一个词。
   */
  'keybind.title': 'Key bindings',
  'keybind.open': 'Key settings',
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
  /*
   * 单人机（NDS）那一档的提示 —— 就是 `keybind.hint` 去掉「两位玩家不能共用同一个键」
   * 那半句。那句话对单人机是错的：面板上根本没有玩家 2 可切，说了只会让人去找。
   */
  'keybind.soloHint':
    'The keyboard map is read once, when a cartridge loads — reload it for changes to apply.',
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
   *
   * ⚠️ 2026-10-15：`games.open`（那颗钮的名字）**暂时没有引用了** —— 房间里那个入口
   * 收了（用户要求，见 ConsoleScene 那颗钮的注释）。键留着不删，恢复入口时放回来。
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
   * 收藏（2026-10-13 加，云端，需要登录）。
   *
   * `favorite` / `unfavorite` 带 `{name}`：星标按钮小得放不下文字，所以它是
   * **aria-label** —— 读屏要靠它才知道点下去会发生什么（「收藏「超级马里奥」」
   * 比一个孤零零的「收藏」有用）。
   *
   * `favoritesSignIn` 那一句要**说清去哪儿登**（右上角那颗人像钮），
   * 只写「请先登录」用户不知道往哪儿点。
   */
  'games.tabFavorites': 'Favorites',
  'games.favorite': 'Add {name} to favorites',
  'games.unfavorite': 'Remove {name} from favorites',
  'games.favoritesEmpty': 'No favorites yet — tap the star on any cover.',
  /*
   * 收藏 tab 未登录时那句提示。`{link}` 是**可点的那两个字**（点开登录弹窗），
   * 句子拆成前后两截，由 GameLibraryPanel 把中间塞成一颗 <button>。
   *
   * 为什么不整句做成一个按钮：那样用户不知道**点哪儿**是登录 ——
   * 「点这里」和「登录」指的必须是同一件事，所以只有「登录 / Sign in」那两个字是链接。
   */
  'games.favoritesSignInBefore': 'Sign in to keep favorites — ',
  'games.favoritesSignInLink': 'Sign in',
  'games.favoritesSignInAfter': ' right here, or use the account button at the top right.',

  /*
   * 用户面板（2026-10-13 加）：注册 / 登录 / 退出 + 云端三件套的说明。
   *
   * ⚠️ 这套账号和**后台管理员**是两回事（两张表、两只 cookie）。文案里不许有任何
   * 暗示两者相通的写法 —— 用户看到这里的东西，不该联想到 /admin 那套。
   *
   * ⚠️ 这里原先有一条 `user.benefits`（「注册之后有三样东西会跟着你走…」），
   * 2026-10-13 用户要求**删掉**，见 `components/AuthForm.tsx` 那处注释 —— 那条**还是死的**。
   * 同日更晚用户又点名把 `login.lead` 那句好处**加回表单里**（屋里浮层也要看到），
   * 于是有了 `user.formLead`（上面）—— 两条别混，`benefits` 别借尸还魂。
   * 别因为「不说好处没人注册」又把 `benefits` 加回表单下面。
   */
  'user.title': 'Account',
  'user.close': 'Close',
  /*
   * 右侧那排账号钮的 title / aria-label。两个键而不是一个：
   * 登录之后把用户名带进去，鼠标悬上去就能确认「我现在登的是哪个号」——
   * 而那颗钮上只有个图标，没有别的地方能显示这个信息。
   */
  'user.open': 'Account — sign in or register',
  'user.openSignedIn': 'Account: {name}',
  'user.tabLogin': 'Sign in',
  'user.tabRegister': 'Create account',
  'user.username': 'Username',
  'user.password': 'Password',
  /*
   * 两条规则提示 —— 现在**当 placeholder 用**（2026-10-13 用户要求「提示放在 input 里面」），
   * 注册模式下填进两个输入框的 `placeholder`，不再画在框下面。所以这里写得越短越好：
   * 太长会被输入框宽度截断（`AuthForm` 那个卡片 `max-w-md`）。
   * ⚠️ 登录模式**不设 placeholder**（登录的人不需要知道规则）—— 见 AuthForm 里那两个 input。
   */
  'user.usernameHint': '3–20 characters: letters, digits, _ - .',
  /*
   * 注册账号 = 邮箱（2026-10-14 起）：注册模式的标签 / placeholder 换用这一对；
   * 登录模式**仍是** `user.username`（老账号可能是普通用户名，登录不校验邮箱）。
   * 上面的 `user.usernameHint` 因此闲置了 —— 别删，将来若恢复用户名注册还要用。
   */
  'user.emailLabel': 'Email',
  'user.emailHint': 'Your email. No + aliases, no temp mail.',
  'user.passwordHint': 'At least 6 characters, no spaces.',
  'user.signIn': 'Sign in',
  'user.signUp': 'Create account',
  'user.signingIn': 'Signing in…',
  'user.signingUp': 'Creating…',
  'user.signOut': 'Sign out',
  'user.signedInAs': 'Signed in as {name}.',
  'user.cloudHint':
    'Your game history, saves and favorites are stored in your account — open any game from the online library and they sync automatically.',
  /*
   * 表单里那句「登录了能干什么」（2026-10-13 用户要求加回表单 —— 用的是 login.lead 的措辞）。
   * 和 `login.lead` 的区别：这句是**纯好处**，不带「还没有账号？去注册」（表单自己就有
   * 登录 / 注册切换，不用再指路）。`/login` 页头已经说过同一句，那边传 `hideCloudLead`
   * 不渲染 —— 见 `AuthForm` 的 prop。
   */
  'user.formLead':
    'Sign in and your saves, game history and favorites are kept in the cloud — play anytime, anywhere!',
  /*
   * 表单下面那句法律声明（2026-10-13 加，用户要求「表单下方增加…」）。
   *
   * **拆成四段**（Login / Register / Middle / After），中间夹两个**真链接** ——
   * 链接文字借 `legal.terms` / `legal.privacy`（那两条本来就是两页的标题，
   * 见上面 legal 那段的注释），所以中英语序的差异由这几段自己扛，不用为这句话另起键。
   *
   * 开头**分登录 / 注册两种**（2026-10-13 用户要求）：这张表两个模式共用，
   * 切到注册还写「登录即表示…」读起来不对。
   *
   * ⚠️ **值首尾的空格是有意义的**（英文要靠它把链接和正文分开），别顺手 trim 掉。
   */
  'user.consentLogin': 'By signing in you agree to our ',
  'user.consentRegister': 'By creating an account you agree to our ',
  'user.consentMiddle': ' and ',
  'user.consentAfter': '.',

  'user.error.failed': 'Something went wrong — try again.',
  'user.error.missingCredentials': 'Enter a username and password.',
  'user.error.usernameInvalid': 'Username may only contain letters, digits, _ - and .',
  'user.error.usernameTooShort': 'Username is too short (at least 3 characters).',
  'user.error.usernameTooLong': 'Username is too long (at most 20 characters).',
  'user.error.usernameTaken': 'That username is taken — pick another.',
  /*
   * 注册邮箱校验（2026-10-14 加）。规则本体在 `lib/email.ts`（前后端共用同一份）；
   * 服务端回 `email-invalid` / `email-alias` / `email-temp` 三个码。
   * ⚠️ **登录不校验邮箱**（用户明确要求）—— 老账号的用户名可能根本不是邮箱。
   */
  'user.error.emailInvalid': 'Enter a valid email address.',
  'user.error.emailAlias': 'Alias emails (like name+tag@… or Gmail with dots) are not allowed.',
  'user.error.emailTemp': 'Disposable email providers are not allowed — use your regular mailbox.',
  'user.error.passwordInvalid': 'Enter a password.',
  'user.error.passwordTooShort': 'Password is too short (at least 6 characters).',
  'user.error.passwordTooLong': 'Password is too long (at most 72 characters).',
  /* 口令里有空白字符。注册 + 改密码都会回这个码；登录不会（见 lib/server/app-users.ts） */
  'user.error.passwordHasSpace': 'Password cannot contain spaces.',
  'user.error.invalidCredentials': 'Wrong username or password.',
  'user.error.banned': 'This account has been suspended.',
  /*
   * 人机验证（Cloudflare Turnstile，2026-10-13 加）。
   * `captchaRequired` = 没解出验证码就点了提交（挂件还在加载 / 被扩展拦掉时也会看到）；
   * `captchaFailed` = 解出来了但服务端不认 —— token 一次性，最常见的原因是上一轮已经用掉了。
   * 两句都只说「怎么办」，不解释 token 是什么（用户不关心，也解释不清）。
   */
  'user.error.captchaRequired': 'Please complete the human verification first.',
  'user.error.captchaFailed': 'Human verification failed — please try again.',

  /*
   * 独立登录页（`/login`）标题下面那句说明（2026-10-13 加）。
   *
   * 页面的 `<h1>` **借 `user.title`**（屋里那个账号浮层的标题）—— 同一个东西在站里
   * 只该有一个名字，这里不再为「账号」另起一个键。
   *
   * 这一句要说两件事：① 登录之后多了什么（这间屋子本来不需要账号，
   * 不说清好处没人会注册）；② 这一页同时管注册（表单里那颗分段钮），别让人以为走错了地方
   * —— 所以结尾点名「去注册 / Create one」。
   *
   * ⚠️ 2026-10-13 用户连着改了三处词：
   *   · 结尾从「同一个表单切到『注册』就行」压成**三个字「去注册」**
   *     （别把「同一个表单」那层解释加回来）；
   *   · 原先表单下面还有一条 `user.benefits`（「三样东西会跟着你走」）**整条删了**
   *     —— 见 `components/AuthForm.tsx` 那处注释；
   *   · 前半句从「存档…都挂在你的账号上，换台设备也还在」换成**「存到云端 / in the cloud」
   *     + 随时随地即刻开玩**（用户给的措辞）。云存档确实是这么工作的，不是空话。
   */
  'login.lead':
    'Sign in and your saves, game history and favorites are kept in the cloud — play anytime, anywhere. No account yet? Create one.',

  /*
   * 个人中心（`/account`，2026-10-13 加）。三个 tab：收藏 / 存档 / 资料。
   *
   * 「资料」那一组（`account.error.*`）**刻意和 `user.error.*` 分开** ——
   * 前者是注册 / 登录那套（用户名重复、口令太短…），后者是登录之后改自己资料那套
   * （旧口令不对、头像太大…）。两批错误码的来源和上下文都不同，混在一起
   * 会让「什么情况下会看到哪句」变得说不清。
   *
   * ⚠️ 这一页**没有「历史」tab**（理由见 AccountCenter 文件头）：历史没有可管理的
   *    东西，清空入口在房间那个游戏库面板里已经有了。
   */
  'account.title': 'Your account',
  'account.loading': 'Loading…',
  'account.failed': 'Something went wrong — try again.',
  /* 页头注册时间那行。`{time}` 是格式化好的时间戳 */
  'account.since': 'Member since {time}',
  /*
   * VIP 标识（个人中心页头，2026-10-13 加）。**两种徽章都要有** —— 非 VIP 那颗是灰的，
   * 让「不是会员」成为一个明确的说法，而不是「好像忘了显示什么」。
   * `vipUntil` / `vipExpired` 由 `vipExpiresAt` 现判：`> now` 走前者，否则后者
   * （过期了原样给出时间，比只写「已过期」有用）。
   */
  'account.vipBadge': 'VIP',
  'account.nonVipBadge': 'Standard',
  'account.vipUntil': 'VIP until {time}',
  'account.vipExpired': 'VIP expired {time}',
  'account.tabFavorites': 'Favorites',
  'account.tabHistory': 'History',
  'account.tabSaves': 'Save states',
  'account.tabProfile': 'Profile',
  'account.tabPassword': 'Password',
  /*
   * 收藏 / 历史 / 存档列表的骨架屏文案。和 `account.loading`（页头那行「Loading…」）分开：
   * 页头那行是纯文字占位，这几处是**列表骨架**，语义上是「正在取列表」。
   * 给读屏用 `role="status"`，视觉上配 `.loading-dots` 那颗跳动的方点。
   */
  'account.favoritesLoading': 'Loading favorites…',
  'account.historyLoading': 'Loading history…',
  'account.savesLoading': 'Loading saves…',

  'account.favoritesEmpty':
    'No favorites yet — open the game library in the room and tap the star on a cover.',
  /* 卡片左上那颗星。`{name}` = 游戏名（读屏和 tooltip 都用它） */
  'account.unfavorite': 'Remove {name} from favorites',

  /* ---- 历史 ---- */
  'account.historyEmpty': 'No play history yet — games you open from the online library show up here.',
  'account.historyCount': '{count} games played recently',
  'account.historyDeleted': 'Removed from history.',
  'account.clearHistory': 'Clear all',
  'account.confirmClearHistory': 'Really clear all?',
  'account.historyCleared': 'History cleared.',
  /*
   * 上限说明：和本地 lib/library.ts 的 MAX_CARTRIDGES 同口径（最近 N 款，不是全量流水）。
   * **不写死数字** —— 那个数改了这里就会说谎（同 account.savesHint 的理由）。
   */
  'account.historyHint':
    'History keeps your {max} most recently played games — playing an older one again moves it back to the top.',

  'account.savesEmpty': 'No cloud save yet.',
  'account.savesCount': '{count} saves in total',
  /*
   * 树视图里每个游戏行右侧的存档份数（点开游戏行才看到具体存档）。
   */
  'account.savesGroupCount': '{count} save',
  'account.viewGame': 'View {name}',
  /*
   * 存档制式说明。即时存档保存当前模拟器状态，
   * 所以一款只有一份，再存就是覆盖。**不要在文案里写死数字**，规则会变。
   */
  'account.savesHint':
    'One save per game — saving again overwrites it. The same applies locally and in the cloud.',
  'account.saveDeleted': 'Save deleted.',
  'account.clearSaves': 'Clear all',
  'account.confirmClearSaves': 'Really clear all?',
  'account.savesCleared': 'Cleared {count} save(s).',
  'account.delete': 'Delete',
  'account.confirmDelete': 'Really delete?',

  /* ---- 资料 ---- */
  'account.avatar': 'Avatar',
  'account.chooseImage': 'Choose image',
  'account.clearAvatar': 'Remove avatar',
  'account.uploading': 'Uploading…',
  'account.avatarSaved': 'Avatar updated.',
  'account.avatarCleared': 'Avatar removed.',
  'account.avatarHint': 'PNG, JPEG, WebP or GIF, up to 2 MB.',
  'account.gender': 'Gender',
  /*
   * 性别三档：未知 / 男 / 女。`account.genderNone` 是**默认态**（库里存 NULL）。
   * ⚠️ 原先还有一档 `account.genderOther`（「其他」），2026-10-13 取消 ——
   *    它和「未知」在界面上是一回事。键也一并删了，别再加回来。
   */
  'account.genderNone': 'Not specified',
  'account.genderMale': 'Male',
  'account.genderFemale': 'Female',
  'account.genderSaved': 'Saved.',
  'account.genderHint': 'Optional — shown to nobody but you.',
  'account.passwordTabHint': 'You stay signed in on this device afterwards — no need to log in again.',
  'account.password': 'Password',
  'account.oldPassword': 'Current password',
  'account.newPassword': 'New password',
  'account.confirmPassword': 'Repeat new password',
  'account.savePassword': 'Change password',
  'account.saving': 'Saving…',
  'account.passwordSaved': 'Password changed.',
  'account.passwordHint':
    'You stay signed in on this device after changing it. Other signed-in devices keep working until their session expires.',

  'account.error.missingOld': 'Enter your current password.',
  'account.error.wrongPassword': 'Current password is wrong.',
  'account.error.passwordTooShort': 'New password is too short (at least 6 characters).',
  'account.error.passwordTooLong': 'New password is too long (at most 72 characters).',
  /* 新口令里有空白字符（同 `user.error.passwordHasSpace`，但这一页说的是「新密码」） */
  'account.error.passwordHasSpace': 'New password cannot contain spaces.',
  'account.error.mismatch': 'The two new passwords do not match.',
  'account.error.avatarMissing': 'Pick an image first.',
  'account.error.avatarTooLarge': 'That image is too large (2 MB max).',
  'account.error.avatarType': 'Unsupported format — use PNG, JPEG, WebP or GIF.',

  /*
   * 在线库列表上那排筛选：机种 + 搜索。两者都只在**已经拉回来的那份列表**上过滤
   * （客户端过滤，不再打接口）。「全部」那一档和 FC / SFC / ARC 并排，
   * 机种名走 `consoleLabel()`，不进这张表。
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
   * 那两页是长文档、结构化存储，理由见那边的顶部注释。这里只有**房间界面**要用的几个词。
   *
   * `legal.privacy` / `legal.terms` 既是页面上那两条链接的文字（桌面端在右上角那一行，
   * 小屏在菜单抽屉里），也是两页自己的标题 —— 和留言本那颗钮借 `feedback.title`
   * 同一个路子：它就是最准的说法，没必要另起一个键。
   *
   * ⚠️ 这里原来还有一条 `legal.open`（右侧那颗盾牌钮的 title / aria）。那颗钮
   * 2026-10-13 并进了小屏抽屉，键跟着删了 —— 别按「少了一条」又补回来。
   */
  'legal.privacy': 'Privacy Policy',
  'legal.terms': 'Terms of Service',
  /* 两页顶部那行「最后更新」。日期由页面按语言格式化后传进来 */
  'legal.updated': 'Last updated {date}',
  /*
   * ⚠️ `legal.back` 原先是「Back to the game room」（2026-10-14 用户要求改文案 + 改行为）：
   *    左上那颗钮现在是**浏览器回退**（`BackLink`），不再承诺固定落点，所以文案走
   *    `common.back`（「返回」）—— 和内容页左上那颗统一。这一条**已删除**，别再加回来。
   */
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
    'Drag a ROM file (.nes, .sfc, .gba, .md, .gb …) or an arcade .zip onto the TV, or just click the screen to pick a file. No ROMs ship with this repo — bring your own.',
  'tour.rail.title': 'The switch rail',
  /*
   * ⚠️ 2026-10-15：这一句里**去掉了「游戏库」那一项** —— 房间里的游戏库入口收了
   * （用户要求，见 components/ConsoleScene.tsx 那颗钮的注释）。指引是逐项念那一列开关的，
   * 念到一个不存在的钮就是错的。恢复入口时把这一项放回来（四份一起改）。
   *
   * ⚠️ 2026-10-16：语言那一项括号里原来写「中 / EN」（那颗钮当年的短标签），
   * 现在下拉显示的是**全名**、而且有四种 —— 写成四种语言的全名，
   * 和 theme（night / day）、TV size（大 / 中 / 小）那两处「把选项念出来」的写法一致。
   */
  'tour.rail.body':
    'Three groups, top to bottom. Look: theme (night / day), language (中文 / English / 日本語 / 한국어), Fullscreen (it is the screen itself that goes fullscreen), Simple mode (keep only the wall, TV, desk and floor), TV size (opens a large / medium / small picker — the desk widens with it). Games: Netplay, Key bindings. Help: Controls help, and the Guestbook.',

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

  /*
   * 小屏右上角那颗「菜单」钮（2026-10-13 加）。
   *
   * 窗口放不下那一行 / 那一列时（宽 < 900，或高 < 950），桌面那批入口整批收进它点开的
   * 右侧抽屉，页面上只剩这一颗钮 —— 所以它的名字得说清「点开会看到什么」，
   * 而不是借用某个条目的名字。抽屉开着时同一个位置变成 `menu.close`（点一下收起）。
   */
  'menu.open': 'Open menu',
  'menu.close': 'Close menu',
  /*
   * 抽屉里「主题」那一行的文案。**刻意不用 `theme.toDark` / `toLight`**：
   * 那两条说的是「按下去切到哪」（是给 tooltip / aria 用的），而这一行是一条**目录项**
   * ——它说明「这一行管什么」。而且跟着主题翻的那两条会让文案也随 `<html data-theme>` 变，
   * 那又是 React 挑文案，首帧闪烁的老问题会回来。
   */
  'menu.theme': 'Theme',
  /*
   * 抽屉里「简洁模式」那一行的文案（2026-10-13 加，用户要求就写「简洁模式」四个字）。
   * 和 `menu.theme` 同一个道理：它是一条**目录项**，说明「这一行管什么」，
   * 不是动作描述 —— 所以**不用** `simple.enter` / `simple.exit`
   * （那两条说的是「按下去会切到哪」，留给 tooltip / aria）。
   */
  'menu.simple': 'Simple mode',

  /* 「离开房间」确认：房间那条「游戏列表」在房间里有活时先弹这层（见 ConsoleScene 的 leaveOpen） */
  'leave.title': 'Leave this page?',
  'leave.bodyGame': 'The running game will be interrupted — progress is not saved.',
  'leave.bodyNetplay': 'You will leave the netplay room, and your partner will be disconnected.',
  'leave.stay': 'Stay',
  'leave.confirm': 'Leave',

  'gamesPage.heading': 'All games',
  'gamesPage.intro':
    '{count} games in the online library — NES, SNES / SFC, Game Boy, GBA, Sega Mega Drive, arcade and more. Click a cover for details, or start playing straight away.',
  'gamesPage.empty': 'The library is empty right now.',
  /*
   * 机种筛选（`?console=<机种>`，2026-10-13 加）。
   *
   * `introConsole` 顶上 `intro`：筛了机种之后「共 N 款」说的是**这一档**的条数，
   * 再念一遍那一长串机种就自相矛盾了。
   * `filterAll` 是筛选条上那颗「全部」，`filterLabel` 是那条 `<nav>` 的读屏名字。
   */
  'gamesPage.introConsole':
    '{count} {console} games in the library. Click a cover for details, or start playing straight away.',
  'gamesPage.filterLabel': 'Filter by console',
  'gamesPage.filterAll': 'All',
  /* 筛了机种、而这一档一款都没有时的空态（和 `empty` / `searchEmpty` 是三种不同的空） */
  'gamesPage.consoleEmpty': 'No {console} games in the library yet.',
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
  /* 提交后的 pending 态（GamesSearchForm）：D1 查询那一两秒里按钮上的字 */
  'gamesPage.searchLoading': 'Searching…',
  'gamesPage.searchClear': 'Clear search',
  'gamesPage.searchResults': '“{keyword}” — {count} matching games.',
  'gamesPage.searchEmpty': 'No games match “{keyword}”. Try a shorter word, or the game title.',
  'gamesPage.prev': 'Prev',
  'gamesPage.next': 'Next',
  /*
   * 「回到首页」。404 页那两颗用它（左上角那颗真链接 + 正文下面那颗钮）——
   * 404 刻意不挂顶栏，那两颗就是迷路的人唯一的确定去处。
   */
  'gamesPage.backHome': 'Back to home',
  'gamesPage.backToGames': 'All games',
  /*
   * 内容页左上角那条返回链接的**通用文案**（2026-10-13 起）。
   *
   * ⚠️ 为什么单独一个键、而不是复用 `backToGames`：
   *    那条说的是「回**哪儿**」（全部游戏），而左上角那颗钮**实际做的是浏览器回退**
   *    （`BackLink`，`mode: 'history'`）—— 用户可能是从 `/games?q=…&page=3` 或
   *    `/developers` 点进来的，回的是**来时的那个地址**，根本不是这条链接的 `href`。
   *    既然行为是「返回」，文案就该说「返回」，写「全部游戏」是在
   *    **承诺一个它不一定兑现的落点**（2026-10-13 用户要求统一改的）。
   *
   * 用它的地方（都是 `mode: 'history'`）：
   *   游戏详情页、下载页、开发商详情页 —— 三处左上角那颗。
   *
   * ⚠️ 同一天**删掉了两条**曾被它们各自使用的旧键（别再加回来）：
   *    `gamesPage.backToGame`（下载页原来写「返回游戏详情」）、
   *    `developersPage.back`（开发商页原来写「返回」）。
   *  `backToGames` / `backToDevelopers` 这两个**留着** —— **页脚**那几条是真链接，
   *  落点就是固定的列表页，那里写「全部游戏 / 全部开发商」才准确。
   *  404 页左上角也仍用它们（那页的行为是硬跳列表，不是回退）。
   */
  'common.back': 'Back',
  /* 页脚那颗「首页」（2026-10-13 加）。 */
  'common.home': 'Home',
  'gamesPage.play': 'Play now',
  'gamesPage.download': 'Download ROM',
  /* 详情页「分享游戏」：点一下复制这一页的规范地址（见 components/ShareGameButton.tsx） */
  'gamesPage.share': 'Share this game',
  'gamesPage.shareCopied': 'Link copied',
  'gamesPage.shareFailed': 'Copy failed',
  /*
   * 详情页那颗收藏按钮（2026-10-13 加，挨着「开始游戏」）。见 components/FavoriteButton.tsx。
   *
   * ⚠️ 和游戏库里那颗**星标**用词不同：星标只画一个 ★ 图标（没有文字位），
   *    这里是一颗有文字的按钮，所以得说清「点了会发生什么」。
   *    `{name}` = 游戏名，只用在 aria-label / title 上。
   */
  'gamesPage.favorite': 'Add to favorites',
  'gamesPage.unfavorite': 'Remove from favorites',
  /* 未登录时点它：先提示，再让用户自己去顶栏登录（这一页没有登录入口） */
  'gamesPage.favoriteSignIn': 'Sign in to save favorites — use the sign-in button in the top bar.',
  /* 请求失败的回滚提示（乐观更新翻回去之后说一句） */
  'gamesPage.favoriteFailed': 'Could not update favorites — try again.',
  /*
   * 收藏钮上那个数字（2026-10-13 加，用户要的「详情页显示游戏收藏数量」）。
   * `{n}` = 收藏人数。只当 `title`/悬停说明用 —— 按钮本身显示的就是那个数字，
   * 而按钮的可访问名字仍是「收藏 / 取消收藏」（说的是点了会发生什么）。
   */
  'gamesPage.favoriteCount': '{n} on the favorites list',
  /*
   * 详情页那颗「反馈问题」+ 它弹出的那个窗（2026-10-13 加）。
   * 见 components/ReportGameButton.tsx —— 提交**不需要登录**，所以文案里
   * 不要出现「登录」二字。
   */
  'gamesPage.report': 'Report a problem',
  'gamesPage.reportTitle': 'Report a problem',
  /* `{name}` = 游戏名：说清报的是哪一款，免得用户在别的游戏上遇到问题却报错地方 */
  'gamesPage.reportSubject': 'About: {name}',
  'gamesPage.reportPlaceholder':
    'What went wrong? For example: it will not start, the picture is garbled, the sound is missing…',
  'gamesPage.reportSubmit': 'Send report',
  'gamesPage.reportSubmitting': 'Sending…',
  'gamesPage.reportOk': 'Thanks — we will look into it.',
  /* 空串 / 纯空白不让提交（前端拦一道，服务端还有一道） */
  'gamesPage.reportRequired': 'Please describe the problem first.',
  'gamesPage.reportFailed': 'Could not send — try again.',
  'gamesPage.reportClose': 'Cancel',
  /*
   * 详情页的**评论模块**（2026-10-13 加，用户要求「详情模块下方再加一个评论模块」）。
   * 见 components/GameComments.tsx。
   *
   * ⚠️ 和上面「反馈问题」那组**最要紧的区别**：**发评论必须先登录**（用户明确要求），
   *    所以这里多出一组登录相关的文案（`signInLead` / `signIn` / `signInRequired`）。
   *    列表本身是公开的 —— 未登录也看得到别人写了什么。
   */
  'comments.heading': 'Comments',
  /* 列表全部载完才显示（还有下一页时不报数，免得「{n} 条」被当成总数） */
  'comments.count': '{n} comments',
  'comments.empty': 'No comments yet — be the first.',
  'comments.placeholder': 'What do you think of this game?',
  'comments.ratingLabel': 'Your rating',
  'comments.ratingStar': 'Rate {n} out of 5',
  'comments.ratingValue': '{n} out of 5 stars',
  'comments.ratingAverage': '{avg} / 5',
  'comments.ratingRequired': 'Pick a star rating first.',
  'comments.submit': 'Post comment',
  'comments.submitting': 'Posting…',
  'comments.ok': 'Posted — it is at the top of the list.',
  'comments.required': 'Write something first.',
  'comments.failed': 'Could not post — try again.',
  /* 未登录时顶掉输入框的那一行 + 那颗链接（链接带着 `?next=` 把人送回这一页） */
  'comments.signInLead': 'Sign in to post a comment.',
  'comments.signIn': 'Sign in',
  /* 发表时才发现没登录（会话过期）：比「发表失败」更准，说清该怎么办 */
  'comments.signInRequired': 'Please sign in again to post.',
  'comments.loading': 'Loading comments…',
  'comments.retry': 'Retry',
  /* 列表本身拉不到（和「发表失败」是两件事，别共用一条） */
  'comments.loadFailed': 'Could not load comments.',
  'comments.loadMore': 'Load more',
  /* 自己的那条上的删除（两步：先「删除」，再「确认」，见组件里的 pendingDelete） */
  'comments.delete': 'Delete',
  'comments.deleteConfirm': 'Confirm',
  'comments.cancel': 'Cancel',
  'comments.deleted': 'Comment removed.',
  'comments.deleteFailed': 'Could not delete — try again.',
  'gamesPage.field.console': 'Console',
  'gamesPage.field.year': 'Year',
  'gamesPage.field.developer': 'Developer',
  'gamesPage.field.series': 'Series',
  'gamesPage.field.language': 'Language',
  /*
   * 详情页「操作说明」那块的标题（2026-10-19 加）。
   * ⚠️ 只有**源站模式**的数据带这一段（`GameText.controls`）—— 数据库没有这一列，
   *    所以 D1 模式下这块整块不渲染，这条文案也就用不到。
   */
  'gamesPage.controls': 'Controls',
  /* 详情页点「开始游戏 / 联机游戏」时那个选语言版本的弹框标题 */
  'gamesPage.selectLanguage': 'Choose language',
  /*
   * 全站 404（app/not-found.tsx）。和下面那条 `gamesPage.notFoundTitle` 分开命名：
   * 那条讲的是「这个游戏从库里没了」，这条讲的是「这个地址本来就不存在」。
   */
  'notFound.title': 'Page not found',
  'notFound.description':
    'That address does not exist on {site}. Check the link, or head back to the home page.',
  'gamesPage.notFoundTitle': 'Game not found',
  'gamesPage.notFound': 'This game is not in the library (any more).',
  /* 详情页正文：`fallbackDescription` 只在后台没填「说明」时顶上 */
  'gamesPage.fallbackDescription': '{title} is a {console} game.',

  /*
   * 开发商两页（2026-10-12 加的）。和上面 `gamesPage.*` 同一类：真路由、服务端组件、
   * 整页没有 state。列表页 + 详情页共用一个 `heading`（两页的标签/标题都是它），
   * 详情页里「这家公司的游戏」那一节另用 `gamesHeading`。
   */
  'developersPage.heading': 'Developers',
  'developersPage.intro':
    '{count} developers behind the games in the library. Open one to see everything we have from that studio.',
  'developersPage.empty': 'No developers listed yet.',
  'developersPage.gameCount': '{count} games',
  'developersPage.gamesHeading': 'Games from {name}',
  'developersPage.gamesEmpty': 'There is no game from this developer in the library yet.',
  'developersPage.field.founded': 'Founded',
  /*
   * ⚠️ 原先这里有一条 `developersPage.back`（左上那颗返回），2026-10-13 **已删除** ——
   *    它和游戏详情页、下载页左上角那条说的是同一件事（都是浏览器回退），
   *    已统一到上面的 `common.back`。别再单独加回来。
   *
   * 页脚与面包屑里那条「全部开发商」是 `backToDevelopers`（真链接），**留着**。
   */
  'developersPage.backToDevelopers': 'All developers',
  'developersPage.notFoundTitle': 'Developer not found',
  'developersPage.notFound': 'This developer is not in the library (any more).',

  /*
   * 机种两页（2026-10-14 加的，用户要的「机种专题页」）。结构照抄 developersPage：
   * 列表页 heading / intro，单页 gamesHeading / gamesEmpty / 资料表字段 / 404。
   * ⚠️ 没有写 `consolesPage.empty`：机种清单是代码里的固定四项（CONSOLE_TYPES），
   *    列表页**永远**有四张卡可画，不存在「一条都没有」的空态。
   */
  'consolesPage.heading': 'Consoles',
  'consolesPage.intro':
    'The consoles in the library — {count} games in total. Open one to see every title it runs.',
  'consolesPage.gameCount': '{count} games',
  'consolesPage.gamesHeading': 'Games on {name}',
  'consolesPage.gamesEmpty': 'There is no game for this console in the library yet.',
  /* 筛了语种却一款都没有（`{lang}` 来自 lib/rom-lang.ts 的语言全称，如 English） */
  'consolesPage.gamesEmptyLang': 'There is no {lang} game for this console yet.',
  /*
   * 语种筛选条的 `aria-label`（2026-10-16 加）。可见的标签本身就是语言名
   * （简体中文 / English / 日本語 / 한국어，来自 lib/rom-lang.ts，不进文案表 ——
   * 语言名要用**它自己的语言**写，翻译它不是本地化），所以这里只需要一个朗读用的说明。
   */
  'consolesPage.filterLangLabel': 'Filter by language',
  'consolesPage.field.released': 'Released',
  /* 页脚与面包屑里那条「全部机种」（真链接），与 developersPage.backToDevelopers 同一角色 */
  'consolesPage.backToConsoles': 'All consoles',
  'consolesPage.notFoundTitle': 'Console not found',
  'consolesPage.notFound': 'This console is not part of the site (any more).',

  'download.heading': 'Download the ROM',
  'download.hint': 'Click the button below — the download starts 6 seconds later.',
  'download.button': 'Start download',
  'download.waiting': 'Starting in {seconds}s…',
  'download.started': 'Download started — check your browser downloads.',
  /* 兜底那条「没有反应？直接下载」2026-10-12 按用户要求去掉了（它绕开 6 秒缓冲），
     所以 `download.manual` / `download.manualLink` 两条文案跟着删了。 */
  'download.rights': 'Only download ROM files you are legally allowed to use.',
  /*
   * 免责声明（2026-10-14 用户要求加上）：说明 ROM 来自第三方、本站只做分享，
   * 版权归原权利人。挂在下载页按钮下方，和 download.rights 是两条、别合并。
   */
  'download.disclaimer':
    'Disclaimer: all ROM files on this page are collected from third parties and are for personal study and backup purposes only. All copyrights belong to their original publishers; if any content infringes your rights, please contact us for removal.',
  /* `?id=` 深链：从详情页点「开始游戏」过来，但库里已经没有这条了 */
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
  'meta.title': '{site} — 在浏览器里在线玩复古游戏：FC / SFC / GBA / 街机',
  'meta.description':
    '在浏览器里直接玩复古游戏：FC（红白机）、SFC（超级任天堂）、GBA、Game Boy、世嘉 MD、街机等十余款机种都能跑。从在线游戏库挑一盘，或载入自己的 ROM 文件，打开即玩、免安装。',
  'meta.keywords':
    '复古游戏, 在线游戏库, 在线玩 FC, FC 模拟器, 红白机, NES 模拟器, SFC 模拟器, 超级任天堂, GBA 模拟器, GBA 游戏, Game Boy Advance, Game Boy 模拟器, GBC 模拟器, NDS 模拟器, NDS 游戏, 任天堂 DS, 世嘉 MD 模拟器, MD 游戏, Game Gear, Master System, 32X, WonderSwan, Neo Geo Pocket, PlayStation 模拟器, PS1 模拟器, PSX 模拟器, 街机模拟器, 浏览器模拟器, 网页模拟器, 免安装, {site}',
  /* 下线页面的 meta，见上面英文那份的注释（标题不写 {site}，模板会补） */
  'seo.room.title': '像素小屋 —— 在浏览器里玩复古游戏',
  'seo.room.description':
    '走进像素小屋：FC（红白机）、SFC（超级任天堂）、GBA、Game Boy、世嘉 MD 和街机游戏都跑在电视机上。从在线游戏库挑一盘，或把自己的 ROM 文件拖到屏幕上。',

  /* 登录页（`/login`），见上面英文那份的注释 */
  'seo.login.title': '登录',
  'seo.login.description': '登录账号，在多台设备之间同步存档、游戏历史和收藏。',

  /* 首页落地页，见上面英文那份的注释 */
  'home.hero.title': '在浏览器里在线玩经典复古游戏',
  /*
   * ⚠️「支持联机对战」这半句（2026-10-13 用户要求加）和下面的 `home.faq.a6`、联机面板那颗
   *    `netplay.open`（「联机对战」）说的是同一件事，**措辞对齐** —— 三处都只说「能一起对战」。
   *    **不在这儿展开「谁开房 / 公网那一档要不要 TURN」**：那类前提由联机面板里的
   *    `netplay.wanDev` 兜着（没配 TURN 时公网档进不去），落地页不背这个包袱。
   */
  'home.hero.lead':
    '{site}上在线玩 FC（红白机）、SFC（超级任天堂）、GBA、世嘉 MD、Game Boy 和街机等十余款机种的游戏，支持联机对战。',
  /*
   * ⚠️ 2026-10-15：改成「加载本地 ROM」并挂回首屏右侧（原来叫「进入小屋」、已从首屏撤掉）。
   *    「加载」这个动词和房间里点进去第一句是同一个词（`screen.tapLoad`「点击从本地加载」），
   *    也就是 "LOAD A LOCAL ROM" 的直译。当天先写过「游玩本地 ROM」，弃用原因见 en 那份的注释。
   */
  'home.hero.play': '加载本地 ROM',
  'home.hero.browse': '浏览全部游戏',
  'home.join.title': '和朋友一起玩',
  'home.join.hint': '输入朋友分享的 4 位房间码，即可加入联机。',
  'home.join.submit': '加入房间',
  'home.hero.or': '或',
  'home.search.label': '搜索游戏库',
  'home.search.placeholder': '搜索标题 / 开发者 / 系列',
  'home.search.submit': '搜索',
  'home.consoles.title': '按机种浏览',
  'home.consoles.lead':
    'FC、SFC、GBA、世嘉 MD、Game Boy、街机等十余款机种 —— 点一个看它有哪些游戏。',
  'home.consoles.count': '{count} 款游戏',
  /* 2026-10-14 改：原来写「查看全部游戏」（指向 /games），现在机种有了自己的专题页，这里指向 /consoles */
  'home.consoles.all': '全部机种',
  'home.latest.title': '最新收录',
  'home.latest.lead': '最近新上的几款。',
  'home.latest.viewAll': '全部游戏',
  'home.developers.title': '按开发商浏览',
  'home.developers.lead': '这几家开发商在库里的游戏最多。',
  'home.developers.viewAll': '全部开发商',
  'home.empty': '游戏库现在还是空的 —— 进小屋把 ROM 拖到电视上就能开玩。',
  /* 折叠问答六条，见上面英文那份的注释（只写真的实现了的事） */
  'home.faq.title': '常见问题',
  'home.faq.q1': '免费吗？',
  'home.faq.a1':
    '完全免费，任何游戏都可以随便玩。登录之后可以云端保存游戏记录和存档。',
  'home.faq.q2': '要装什么东西吗？',
  'home.faq.a2':
    '不用，点击游戏即可在网页在线玩。',
  'home.faq.q3': '手机上能玩吗？',
  'home.faq.a3':
    '支持，手机和平板上直接在浏览器里玩。',
  'home.faq.q4': '能下载 ROM 吗？',
  'home.faq.a4': '能，每个游戏页上都有下载按钮。请只下载你有权使用的 ROM 文件。',
  'home.faq.q5': '能和朋友一起玩吗？',
  'home.faq.a5':
    '当然！快喊上小伙伴，开个房间一起联机对战吧。',
  'home.faq.q6': '支持手柄吗？',
  'home.faq.a6':
    '支持。用 USB 或蓝牙连上手柄，浏览器识别后模拟器核心会直接读到；按键映射以各核心默认为准。手机上用屏幕上的虚拟按键。',

  'seo.heading': '在浏览器里玩复古游戏',
  'seo.intro':
    '{site}是一个在线复古游戏厅。FC（红白机）、SFC（超级任天堂）、GBA、Game Boy、世嘉 MD 和街机等十余款机种的游戏直接跑在浏览器里 —— 由本机模拟，内核是编译成 WebAssembly 的 RetroArch。',
  'seo.howTo': '从在线游戏库挑一盘，或把自己的 ROM 文件拖到电视机上。无需安装。',

  /* 游戏列表 / 详情 / 下载三页的 SEO 文案，见上面英文那份的注释 */
  'seo.games.title': '全部游戏 —— 在线玩 FC / SFC / GBA / 街机',
  'seo.games.description':
    '在线游戏库共 {count} 款复古游戏，全部可以直接在浏览器里玩：FC（红白机）、SFC（超级任天堂）、GBA、Game Boy、世嘉 MD、街机等十余款机种。点开任意一款看详情、直接开玩，或者下载 ROM 文件。',
  /* 搜索结果两条，见上面英文那份的注释（人不索引、只给人看） */
  'seo.games.search.title': '「{keyword}」的搜索结果',
  'seo.games.search.description':
    '在线游戏库里匹配「{keyword}」的游戏共 {count} 款。可以直接在浏览器里玩，也可以下载 ROM 文件。',
  /* 机种筛选，见上面英文那份的注释（`{console}` 是 FC / SFC / GBA / ARC 等短标签） */
  'seo.games.console.title': '{console} 游戏 —— 在线玩',
  'seo.games.console.description':
    '在线游戏库里的 {count} 款 {console} 游戏，全部可以直接在浏览器里玩，也可以下载 ROM 文件。',
  'seo.game.title': '{title} —— 在线玩 {console} 游戏',
  'seo.game.description':
    '直接在浏览器里玩《{title}》（{console}）—— 免费、免安装，也可以下载 ROM 文件。',
  'seo.gameDownload.title': '下载《{title}》ROM（{console}）',
  'seo.gameDownload.description':
    '一键下载《{title}》（{console}）的 ROM 文件，无需注册。也可以直接在浏览器里玩。',
  /* 开发商两页，见上面英文那份的注释 */
  'seo.developers.title': '游戏开发商 —— 在线玩他们做的 FC / SFC / GBA / 街机游戏',
  'seo.developers.description':
    '在线游戏库背后的 {count} 家开发商。点进去看这家公司在我们库里的全部游戏。',
  'seo.developer.title': '{name} —— 这家开发商的游戏',
  'seo.developer.description':
    '{name} 在在线游戏库里的全部游戏（{count} 款），可以直接在浏览器里玩，也可以下载 ROM 文件。',

  /*
   * 机种两页（2026-10-14 加的）。`consoles` 是列表页、`console` 是单页，
   * 和 developers / developer 同一套命名。`{count}` 同样是现读的条数。
   */
  'seo.consoles.title': '按机种浏览 —— 在线玩 FC / SFC / GBA / 街机游戏',
  'seo.consoles.description':
    '在线游戏库里的每个机种（共 {count} 款游戏）。挑一个机种，看它名下的全部游戏，直接在浏览器里开玩。',
  'seo.console.title': '{name} 游戏 —— 在线玩',
  'seo.console.description':
    '{name} 在在线游戏库里的全部游戏（{count} 款），可以直接在浏览器里玩，也可以下载 ROM 文件。',

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
  /* 语言下拉的读屏名字，见上面英文那份的注释 */
  'locale.label': '语言',
  /* 语言提示弹窗，见上面英文那份的注释（文案跟当前页面语言，钮跟目标语言） */
  'localePrompt.title': '当前页面是中文',
  'localePrompt.body': '你的浏览器更习惯另一种语言，要切过去吗？',
  'localePrompt.keep': '保持中文',
  'fullscreen.enter': '游戏画面全屏',
  'fullscreen.exit': '退出全屏',

  'screen.pick': '点击选择 ROM 文件，或把文件拖到这里',
  'screen.srLabel': '选择要运行的 ROM 文件',

  /* 屏幕里那几句提示的可见文字（英文那侧全大写，中文不跟）。2026-10-13 从三行收成两行，见 en 那边的注释。
     ⚠️ 2026-10-15：`screen.orLibrary` 和下面那一对 `screen.mobile*` 当前**没有代码引用**
     —— 房间里的游戏库入口收了（见 ConsoleScene 那颗钮的注释）。键留着不删，恢复入口时放回来 */
  'screen.tapLoad': '点击从本地加载',
  'screen.orLibrary': '或者从在线游戏库启动',
  'screen.release': '松手载入',
  /* 移动端的待机提示 —— 原本移动端只能从在线游戏库载入，见 en 那边同一段的注释。⚠️ 2026-10-15 起未使用 */
  'screen.mobileLibrary': '从游戏库载入游戏',
  'screen.mobileTap': '点屏幕打开游戏库',
  'screen.waitingHost': '等待房主画面',
  'screen.paused': '已暂停',
  'screen.resumeOnPanel': '按机身面板的继续键',
  /* `/play` 没有机身：那颗「继续」在页面右侧的面板上 */
  'screen.resumeInPanel': '点右侧面板的「继续」',
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

  /* 见上面英文表里的说明：存档换成电池存档（一款一份），文案不再提「状态 / 份数」 */
  'saves.title': '读档',
  'saves.load': '加载',
  'saves.close': '关闭',
  /* 两组的分组标题。见上面英文表里的说明：说的是「存哪儿」这个事实 */
  'saves.groupLocal': '本机',
  'saves.groupCloud': '云端（账号）',
  'saves.deleteCloud': '删除这份云端存档',
  'saves.delete': '删除',
  /* 未登录时云端那组的占位提示 */
  'saves.loginHint': '登录后可用云端存档，换台设备也能接着玩。',
  'saves.login': '去登录',
  'saves.loading': '读取中…',
  'saves.downloading': '正在下载云端存档…',
  'saves.restoring': '正在恢复游戏进度…',
  'saves.empty': '还没有存档',
  'library.removeLabel': '移除 {name}',

  'legend.moves': '移动',
  // 原来这里有一条 `legend.shortcut`（P / R / F5 / F8）—— 快捷键已全部取消，见英文版注释
  'legend.open': '按键说明',
  'legend.title': '按键说明',
  'legend.close': '关闭',
  'legend.needZip': '格式  FBNeo 只吃 .zip —— 这个是 {ext}，重新打包一下（或换一个 .zip 版）',
  /* `/play` 那条通道专用，来由和措辞的取舍见上面英文那份的注释。 */
  'play.needZip': '格式  这个 ROM 是 {ext} 压缩包，没能解开 —— 换成 .zip 或裸 ROM 再试',
  /* 多文件光盘镜像那条，来由和措辞的取舍见上面英文那份的注释（不带 {ext} 参数）。 */
  'legend.needDisc':
    '格式  光盘镜像是多文件的（.cue + .bin），本站只吃单文件 —— 换 .pbp / .iso / .chd 的版本',
  'play.needDisc':
    '格式  这是一张多文件光盘镜像（.cue + .bin），本站只吃单文件 —— 换成 .pbp / .iso / .chd 再试',
  /* Neo Geo 缺 BIOS 的提示，判据和措辞的来由见上面英文那份的注释。 */
  'legend.needBios':
    'BIOS  这盘看着像 Neo Geo 游戏（拳皇 / 合金弹头 / 侍魂…），需要 neogeo.zip —— 把它拖进页面就装上了。CPS1 / CPS2 那类不需要。',
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
  'netplay.closeRoom': '关闭房间',
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

  // `/play`（联机游戏页）。和英文侧同一套说明：短，联机词汇一律复用上面的 netplay.*
  'seo.play.title': '开玩 —— 载入游戏、在线联机',
  'seo.play.description':
    '一块屏幕开局：单人直接玩，也可以开一间 1v1 房间把房间码分享出去。支持 FC、SFC、GB、GBA、MD 与街机。',
  'play.modeSolo': '单人',
  'play.start': '开始',
  'play.confirmStart': '确定并开始',
  'play.confirm': '确认',
  'play.qualityIntro': '根据网络情况选择联机画面的出画质量。',
  'play.qualityHint.smooth': '30 帧 · 带宽占用较低，适合网络较慢时使用。',
  'play.qualityHint.balanced': '最高 720p / 60 帧 · 兼顾画面清晰度与流畅度。',
  'play.qualityHint.sharp': '最高 60 帧 · 优先保留原始分辨率与像素细节，适合高速网络；网络不足时可能降低帧率。',
  'play.qualityConfirmHint': '确认后连接房间。房主自动加载游戏，加入者接收房主画面。',
  'play.connecting': '正在连接…',
  'play.confirmJoin': '确定并加入',
  'play.cancel': '取消',
  'play.screenSize': '屏幕大小',
  'play.controlsTitle': '游戏控制',
  'play.netplayKeysHint': '联机时，两位玩家各自使用自己设备上的玩家 1 键位。',
  'play.cancelled': '已取消加载',
  'play.retry': '重新加载',
  'play.retryJoin': '重新加入',
  'play.saved': '保存成功',
  'play.localSaving': '本地保存…',
  'play.uploading': '上传云端…',
  'play.cloudFailed': '云端同步失败',
  /* 401 专用：本机那份是好的，登录之后云同步就正常 —— 别和「同步失败」混在一起 */
  'play.saveNoLogin': '未登录，未上云',
  /* 游戏里还没存过盘 —— 没有卡带记忆可拿。**不是错误**，别写成失败口吻 */
  /* 超过云端上限，压根没发出去（本机那份是好的） */
  'play.tooLarge': '存档过大',
  'play.theme': '模式',
  'play.saveFailed': '存档失败，请重试',
  'play.loadFailed': '读档失败，请重试',
  'play.leftRoom': '你已离开房间',
  'play.latency': '延迟',
  'play.measuringLatency': '测量中…',
  'play.downloading': '正在下载游戏文件…',
  'play.booting': '正在启动核心…',
  'play.loadFail': '这盘游戏载入失败。',
  'play.romIncomplete': '游戏文件不完整，请重新载入。',
  'play.notFound': '找不到这个游戏。',
  'play.fullscreen': '全屏',
  'play.volume': '音量',
  'play.edit': '编辑',
  /* 见英文表同一条：收起后只有 40px 宽、竖排，必须短 */
  'play.hideSidebar': '收起',
  'play.showSidebar': '展开',
  'play.hint': 'Esc 退出全屏，其余操作都在右侧。',
  'play.leaveTitle': '游戏正在进行中',
  'play.leaveBody': '返回会结束当前这一局，进度不会自动保存。',
  'play.leaveStay': '继续游戏',
  'play.leaveGo': '离开并返回',
  'gamesPage.playOnline': '联机游戏',

  // 按钮 tooltip 叫「按键设置」，面板标题仍叫「自定义按键」—— 刻意不同名（理由见英文侧注释）
  'keybind.title': '自定义按键',
  'keybind.open': '按键设置',
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
  'keybind.soloHint': '键盘映射只在插卡带时读一次，改完要重载卡带才生效。',
  'keybind.hostHint':
    '你是房主：玩家 1 是你自己的键，玩家 2 是用来把加入者的输入注入本机的。两组不能共用一个键，否则注入会连带驱动你的玩家 1。改完要重载卡带。',
  'keybind.guestHint':
    '你是加入者，用你自己那套（玩家 1 组）—— 联机时两人各在自己的键盘前，不存在抢键。改完立刻生效，不用重载卡带。',
  'keybind.guestLocalHint':
    '你是加入者，本机还跑着一盘自己的卡带。你按的就是「玩家 1」那组：本机那盘按它读键盘，改完要重载卡带；发给房主的也是它，那部分立刻生效。',

  /* ⚠️ 2026-10-15：这颗「打开游戏库」的钮文案当前没有引用，见 en 那边同一处的注释 */
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
  /* 收藏，见英文表里那一段的说明 */
  'games.tabFavorites': '收藏',
  'games.favorite': '收藏「{name}」',
  'games.unfavorite': '取消收藏「{name}」',
  'games.favoritesEmpty': '还没有收藏 —— 点封面左上角那颗星就能收藏。',
  /* 收藏 tab 未登录那两句。`{link}` 那两个字是可点开登录弹窗的按钮，见英文表的说明 */
  'games.favoritesSignInBefore': '登录后可以把喜欢的游戏收进收藏 —— 点这里',
  'games.favoritesSignInLink': '登录',
  'games.favoritesSignInAfter': '，或在右上角点那颗账号钮。',

  /* 用户面板，见英文表里那一段的说明 */
  'user.title': '账号',
  'user.close': '关闭',
  /* 账号钮的悬停文案。登录后带上用户名 —— 那颗钮上只有图标，没别处能看出登的是谁 */
  'user.open': '账号 —— 登录 / 注册',
  'user.openSignedIn': '账号：{name}',
  'user.tabLogin': '登录',
  'user.tabRegister': '注册',
  'user.username': '用户名',
  'user.password': '密码',
  /* 规则提示当 placeholder 用，见英文表里那一段的说明（登录模式不设 placeholder）。
   * 2026-10-14 起注册走邮箱（user.emailLabel / user.emailHint），usernameHint 闲置。 */
  'user.usernameHint': '3–20 个字符：字母、数字、_ - .',
  'user.emailLabel': '邮箱',
  'user.emailHint': '用邮箱注册，不支持别名和临时邮箱。',
  'user.passwordHint': '至少 6 位，不能有空格。',
  'user.signIn': '登录',
  'user.signUp': '注册',
  'user.signingIn': '登录中…',
  'user.signingUp': '注册中…',
  'user.signOut': '退出登录',
  'user.signedInAs': '已登录：{name}',
  'user.cloudHint':
    '你的游戏历史、存档和收藏都存在账号里 —— 从在线游戏库打开任何一款，都会自动同步。',
  /* 表单里那句「登录了能干什么」，见英文表里那一段的说明 */
  'user.formLead': '登录之后，存档、游戏历史和收藏都存到云端，随时随地即刻开玩！',
  /* 表单下面那句法律声明，见英文表里那一段的说明（拆四段：夹两个链接 + 分登录 / 注册） */
  'user.consentLogin': '登录即表示您同意我们的',
  'user.consentRegister': '注册即表示您同意我们的',
  'user.consentMiddle': '和',
  'user.consentAfter': '。',

  'user.error.failed': '出错了，请重试。',
  'user.error.missingCredentials': '请填写用户名和密码。',
  'user.error.usernameInvalid': '用户名只能用字母、数字和 _ - .',
  'user.error.usernameTooShort': '用户名太短了（至少 3 个字符）。',
  'user.error.usernameTooLong': '用户名太长了（最多 20 个字符）。',
  'user.error.usernameTaken': '这个用户名已经被占用了，换一个。',
  /* 注册邮箱校验（2026-10-14 加），见英文表里那一段的说明 */
  'user.error.emailInvalid': '邮箱格式不对，请检查一下。',
  'user.error.emailAlias': '不支持别名邮箱（如 name+tag@… 或 Gmail 加点那种）。',
  'user.error.emailTemp': '不支持临时邮箱注册，请用你的常用邮箱。',
  'user.error.passwordInvalid': '请填写密码。',
  'user.error.passwordTooShort': '密码太短了（至少 6 位）。',
  'user.error.passwordTooLong': '密码太长了（最多 72 位）。',
  /* 口令里有空白字符。注册 + 改密码都会回这个码；登录不会（见 lib/server/app-users.ts） */
  'user.error.passwordHasSpace': '密码不能包含空格。',
  'user.error.invalidCredentials': '用户名或密码不对。',
  'user.error.banned': '这个账号已被封禁。',
  /* 人机验证，见英文表里那一段的说明 */
  'user.error.captchaRequired': '请先完成人机验证。',
  'user.error.captchaFailed': '人机验证没通过，请重试。',

  /* 登录页（`/login`）标题下面那句说明，见英文表里那一段的说明 */
  'login.lead':
    '登录之后，存档、游戏历史和收藏都存到云端，随时随地即刻开玩！还没有账号？去注册。',

  /* 个人中心，见英文表里那一段的说明。注意 `account.error.*` 和 `user.error.*` 是两套 */
  'account.title': '个人中心',
  'account.loading': '载入中…',
  'account.failed': '出错了，请重试。',
  'account.since': '注册于 {time}',
  /* VIP 标识，见英文表里那一段的说明 */
  'account.vipBadge': 'VIP',
  'account.nonVipBadge': '普通用户',
  'account.vipUntil': '会员有效期至 {time}',
  'account.vipExpired': '会员已于 {time} 过期',
  'account.tabFavorites': '收藏',
  'account.tabHistory': '历史',
  'account.tabSaves': '存档',
  'account.tabProfile': '资料',
  'account.tabPassword': '密码',
  /* 列表骨架屏，见英文表里的说明 */
  'account.favoritesLoading': '正在取收藏…',
  'account.historyLoading': '正在取历史…',
  'account.savesLoading': '正在取存档…',

  'account.favoritesEmpty': '还没有收藏 —— 在房间的游戏库里点封面左上角那颗星就能收藏。',
  'account.unfavorite': '取消收藏「{name}」',

  /* ---- 历史 ---- */
  'account.historyEmpty': '还没有游玩记录 —— 从在线游戏库点开过的游戏会出现在这里。',
  'account.historyCount': '最近玩过 {count} 款',
  'account.historyDeleted': '已从历史中移除。',
  'account.clearHistory': '全部清空',
  'account.confirmClearHistory': '确认清空？',
  'account.historyCleared': '历史已清空。',
  'account.historyHint': '历史保留最近玩过的 {max} 款，重玩较早的一款会把它顶回最前面。',

  'account.savesEmpty': '还没有云端存档。',
  'account.savesCount': '共 {count} 份存档',
  'account.savesGroupCount': '{count} 份存档',
  'account.viewGame': '查看《{name}》',
  'account.savesHint':
    '每款游戏只保留一份存档，再存会覆盖前一份。本机和云端一致。',
  'account.saveDeleted': '存档已删除。',
  'account.clearSaves': '全部清空',
  'account.confirmClearSaves': '确认清空？',
  'account.savesCleared': '已清空 {count} 份存档。',
  'account.delete': '删除',
  'account.confirmDelete': '确认删除？',

  /* ---- 资料 ---- */
  'account.avatar': '头像',
  'account.chooseImage': '选择图片',
  'account.clearAvatar': '移除头像',
  'account.uploading': '上传中…',
  'account.avatarSaved': '头像已更新。',
  'account.avatarCleared': '头像已移除。',
  'account.avatarHint': 'PNG / JPEG / WebP / GIF，不超过 2 MB。',
  'account.gender': '性别',
  /* 三档：未知（默认，库里存 NULL）/ 男 / 女。原先那档「其他」已删，见英文表说明 */
  'account.genderNone': '未知',
  'account.genderMale': '男',
  'account.genderFemale': '女',
  'account.genderSaved': '已保存。',
  'account.genderHint': '选填 —— 只有你自己看得到。',
  /*
   * 「密码」那个独立 tab 下的说明。和资料 tab 里性别 / 头像分开之后，
   * 这一页只讲一件事，所以 hint 也可以更聚焦。
   */
  'account.passwordTabHint': '改完之后这台设备仍然登着，不用重新登录。',
  'account.password': '密码',
  'account.oldPassword': '当前密码',
  'account.newPassword': '新密码',
  'account.confirmPassword': '重复新密码',
  'account.savePassword': '修改密码',
  'account.saving': '保存中…',
  'account.passwordSaved': '密码已修改。',
  'account.passwordHint':
    '改完之后这台设备仍然登着。别的设备要等它自己的登录态过期才会失效。',

  'account.error.missingOld': '请填写当前密码。',
  'account.error.wrongPassword': '当前密码不对。',
  'account.error.passwordTooShort': '新密码太短了（至少 6 位）。',
  'account.error.passwordTooLong': '新密码太长了（最多 72 位）。',
  /* 新口令里有空白字符（同 `user.error.passwordHasSpace`，但这一页说的是「新密码」） */
  'account.error.passwordHasSpace': '新密码不能包含空格。',
  'account.error.mismatch': '两次输入的新密码不一样。',
  'account.error.avatarMissing': '请先选一张图片。',
  'account.error.avatarTooLarge': '这张图太大了（最多 2 MB）。',
  'account.error.avatarType': '不支持的格式 —— 请用 PNG / JPEG / WebP / GIF。',

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
  'legal.privacy': '隐私政策',
  'legal.terms': '服务条款',
  'legal.updated': '最后更新 {date}',
  /* `legal.back`（「返回游戏屋」）已删除，见英文表里那一段的说明 */
  'legal.contact': '联系我们：',

  'tour.title': '操作指引',
  'tour.skip': '跳过',
  'tour.back': '上一步',
  'tour.next': '下一步',
  'tour.done': '开始玩',
  'tour.replay': '重看操作指引',
  'tour.screen.title': '先来一盘游戏',
  'tour.screen.body':
    '把 ROM 文件（.nes / .sfc / .gba / .md / .gb 等）或街机 .zip 拖到电视机上就能玩，也可以直接点屏幕挑文件。',
  'tour.rail.title': '右边这一列开关',
  /* ⚠️ 2026-10-15：去掉了「游戏库」那一项；2026-10-16：语言那一项写成四种语言的全名。
     两处的理由见 en 那份同一处的注释 */
  'tour.rail.body':
    '分三组，从上到下。外观：主题（夜晚 / 白天）、语言（中文 / English / 日本語 / 한국어）、全屏（全屏的是屏幕本身）、简洁模式（只留背景墙、电视机、桌子和地面）、电视机大小（点开是 大 / 中 / 小 三档，桌子跟着变长）。游戏：联机、自定义按键。帮助：按键说明、留言本。',

  /* 游戏列表 / 详情 / 下载三页的界面文案，见上面英文那份的注释 */
  'topLinks.label': '站点页面',
  'topLinks.games': '游戏列表',

  /* 小屏右上角那颗「菜单」钮，说明见上面英文那份 */
  'menu.open': '打开菜单',
  'menu.close': '关闭菜单',
  /* 抽屉里「主题」那一行的文案，说明见上面英文那份 */
  'menu.theme': '主题',
  /* 抽屉里「简洁模式」那一行的文案，说明见上面英文那份 */
  'menu.simple': '简洁模式',

  // 「离开房间」确认：房间那条「游戏列表」在房间里有活时先弹这层（见 ConsoleScene 的 leaveOpen）
  'leave.title': '确定要离开吗？',
  'leave.bodyGame': '正在运行的游戏会中断，进度不会保存。',
  'leave.bodyNetplay': '会退出当前联机房间，对面会掉线。',
  'leave.stay': '留下',
  'leave.confirm': '离开',

  'gamesPage.heading': '全部游戏',
  'gamesPage.intro':
    '在线游戏库共 {count} 款：FC（红白机）、SFC（超级任天堂）、GBA、Game Boy、世嘉 MD、街机等十余款机种。点封面看详情，也可以直接开玩。',
  'gamesPage.empty': '游戏库现在还是空的。',
  /* 机种筛选三条，见上面英文那份的注释 */
  'gamesPage.introConsole': '游戏库里共 {count} 款 {console} 游戏。点封面看详情，也可以直接开玩。',
  'gamesPage.filterLabel': '按机种筛选',
  'gamesPage.filterAll': '全部',
  'gamesPage.consoleEmpty': '库里还没有 {console} 游戏。',
  /* 列表页的搜索框，见上面英文那份的注释（和房间弹窗那组 `games.search*` 各写一份） */
  'gamesPage.searchLabel': '搜索游戏库',
  'gamesPage.searchPlaceholder': '搜索标题 / 开发者 / 系列',
  'gamesPage.searchSubmit': '搜索',
  'gamesPage.searchLoading': '搜索中…',
  'gamesPage.searchClear': '清除搜索',
  'gamesPage.searchResults': '「{keyword}」共 {count} 个结果。',
  'gamesPage.searchEmpty': '没有匹配「{keyword}」的游戏，换个短一点的词，或者直接搜游戏名。',
  'gamesPage.prev': '上一页',
  'gamesPage.next': '下一页',
  /* 「回到首页」。只剩 404 页那两颗在用，见 en 那份的注释 */
  'gamesPage.backHome': '回到首页',
  'gamesPage.backToGames': '全部游戏',
  /* `gamesPage.backToGame` 已删除，统一到 `common.back`，见英文表里那一段的说明 */
  'common.back': '返回',
  /* 页脚那颗「首页」，见上面英文那份的注释 */
  'common.home': '首页',
  'gamesPage.play': '开始游戏',
  'gamesPage.download': '下载 ROM',
  'gamesPage.share': '分享游戏',
  'gamesPage.shareCopied': '已复制',
  'gamesPage.shareFailed': '复制失败',
  /* 收藏按钮，见英文表里那一段的说明 */
  'gamesPage.favorite': '收藏',
  'gamesPage.unfavorite': '已收藏',
  'gamesPage.favoriteSignIn': '登录后才能收藏 —— 点右上角顶栏那颗登录钮。',
  'gamesPage.favoriteFailed': '收藏没能更新，请重试。',
  /* 收藏钮上那个数字（2026-10-13 加，用户要的「详情页显示游戏收藏数量」），只当悬停说明用 */
  'gamesPage.favoriteCount': '{n} 人收藏',
  /*
   * 详情页那颗「反馈问题」+ 它弹出的那个窗（2026-10-13 加）。
   * 见 components/ReportGameButton.tsx —— 提交**不需要登录**，文案里别写「登录」。
   */
  'gamesPage.report': '反馈问题',
  'gamesPage.reportTitle': '反馈问题',
  /* `{name}` = 游戏名：说清报的是哪一款，免得用户在别的游戏上遇到问题却报错地方 */
  'gamesPage.reportSubject': '关于：{name}',
  'gamesPage.reportPlaceholder': '遇到了什么问题？比如：打不开、画面花了、没有声音…',
  'gamesPage.reportSubmit': '提交反馈',
  'gamesPage.reportSubmitting': '提交中…',
  'gamesPage.reportOk': '已收到，谢谢！',
  /* 空串 / 纯空白不让提交（前端拦一道，服务端还有一道） */
  'gamesPage.reportRequired': '先说说遇到了什么问题吧。',
  'gamesPage.reportFailed': '提交失败，再试一次。',
  'gamesPage.reportClose': '取消',
  /* 详情页的评论模块（2026-10-13 加），见英文表里那一段的说明 —— 发评论必须先登录 */
  'comments.heading': '评论',
  'comments.count': '{n} 条评论',
  'comments.empty': '还没有评论，来做第一个吧。',
  'comments.placeholder': '说说你对这款游戏的看法…',
  'comments.ratingLabel': '打个分',
  'comments.ratingStar': '打 {n} 星',
  'comments.ratingValue': '{n} 星',
  'comments.ratingAverage': '{avg} / 5',
  'comments.ratingRequired': '先给个星数吧。',
  'comments.submit': '发表评论',
  'comments.submitting': '发表中…',
  'comments.ok': '已发表，在上面第一条。',
  'comments.required': '写点什么再发表吧。',
  'comments.failed': '发表失败，再试一次。',
  'comments.signInLead': '登录后才能发表评论。',
  'comments.signIn': '去登录',
  'comments.signInRequired': '请重新登录后再发表。',
  'comments.loading': '正在载入评论…',
  'comments.retry': '重试',
  'comments.loadFailed': '评论载入失败。',
  'comments.loadMore': '加载更多',
  'comments.delete': '删除',
  'comments.deleteConfirm': '确认删除',
  'comments.cancel': '取消',
  'comments.deleted': '评论已删除。',
  'comments.deleteFailed': '删除失败，再试一次。',
  'gamesPage.field.console': '类型',
  'gamesPage.field.year': '年份',
  'gamesPage.field.developer': '开发商',
  'gamesPage.field.series': '系列',
  'gamesPage.field.language': '语言',
  /* 详情页「操作说明」那块，见英文那份的注释 */
  'gamesPage.controls': '操作说明',
  'gamesPage.selectLanguage': '选择语言',
  'notFound.title': '这个页面不存在',
  'notFound.description': '这个地址在 {site} 上不存在。检查一下链接，或者回首页看看。',
  'gamesPage.notFoundTitle': '找不到这个游戏',
  'gamesPage.notFound': '这个游戏不在游戏库里（可能已经被移除）。',
  'gamesPage.fallbackDescription': '《{title}》是一款 {console} 游戏。',

  /* 开发商两页，见上面英文那份的注释 */
  'developersPage.heading': '开发商',
  'developersPage.intro':
    '在线游戏库背后的 {count} 家开发商。点进去看这家公司在我们库里的全部游戏。',
  'developersPage.empty': '还没有登记任何开发商。',
  'developersPage.gameCount': '{count} 款游戏',
  'developersPage.gamesHeading': '{name} 的游戏',
  'developersPage.gamesEmpty': '库里还没有这家公司的游戏。',
  'developersPage.field.founded': '成立年份',
  /* `developersPage.back` 已删除，统一到 `common.back`，见英文表里那一段的说明 */
  'developersPage.backToDevelopers': '全部开发商',
  'developersPage.notFoundTitle': '找不到这个开发商',
  'developersPage.notFound': '这个开发商已经不在库里了。',

  /*
   * 机种两页（2026-10-14 加的，用户要的「机种专题页」）。结构照抄 developersPage。
   * ⚠️ 没有写 `consolesPage.empty`：机种清单是代码里的固定四项（CONSOLE_TYPES），
   *    列表页**永远**有四张卡可画，不存在「一条都没有」的空态。
   */
  'consolesPage.heading': '机种',
  'consolesPage.intro': '游戏库里的机种 —— 共收录 {count} 款游戏。点一个看它名下的全部游戏。',
  'consolesPage.gameCount': '{count} 款游戏',
  'consolesPage.gamesHeading': '{name} 上的游戏',
  'consolesPage.gamesEmpty': '库里还没有这个机种的游戏。',
  /* 筛了语种却一款都没有（`{lang}` 来自 lib/rom-lang.ts 的语言全称，如 简体中文） */
  'consolesPage.gamesEmptyLang': '这个机种下还没有 {lang} 的游戏。',
  'consolesPage.filterLangLabel': '按语种筛选',
  'consolesPage.field.released': '发售年份',
  /* 页脚与面包屑里那条「全部机种」（真链接），与 developersPage.backToDevelopers 同一角色 */
  'consolesPage.backToConsoles': '全部机种',
  'consolesPage.notFoundTitle': '找不到这个机种',
  'consolesPage.notFound': '这个机种不属于本站（或已被移除）。',

  'download.heading': '下载 ROM',
  'download.hint': '点下面的按钮，6 秒后开始下载。',
  'download.button': '开始下载',
  'download.waiting': '{seconds} 秒后开始…',
  'download.started': '已开始下载，请查看浏览器的下载目录。',
  /* 见上面 en 那份的说明：兜底那条「直接下载」连同它的文案一起删了 */
  'download.rights': '请只下载你有权使用的 ROM 文件。',
  /* 免责声明，见上面 en 那份的说明 */
  'download.disclaimer':
    '免责声明：本页面所有 ROM 文件均收集自第三方，仅供个人学习与备份研究使用，请在下载后 24 小时内自行删除；相关版权归原权利方所有，如有侵权请联系我们删除。',

  'deepLink.notFound': '找不到这个游戏，可能已经被移除。',
  /* 深链载入中那颗独立弹窗，见英文表里同一条上面的说明 */
  'deepLink.title': '正在载入游戏',
  'deepLink.loading': '正在下载 ROM…',
  'deepLink.hint': '下载完成后自动开始',
};

/*
 * 语言 → 文案表。**这里的键必须与 `LOCALES` 一一对应**（`Record<Locale, …>` 会在
 * 编译期盯着），每张表内部再被 `Record<MessageKey, string>` 盯着键是否齐全。
 * 两张网叠起来 = 「加了语言忘了挂表」和「表里少写一个键」都跑不到运行时。
 */
const messages: Record<Locale, Record<MessageKey, string>> = {
  en,
  zh,
  'zh-TW': zhTW,
  ja,
  ko,
  es,
  hi,
  pt,
  fr,
  de,
  it,
  ru,
  fil,
  nl,
  vi,
  th,
  ms,
  id,
};

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function isLocale(value: unknown): value is Locale {
  return (LOCALES as readonly string[]).includes(value as string);
}

/**
 * 给站内地址加上语言前缀 —— **所有站内 `<Link>` 都要过这一道**。
 *
 *   localePath('zh', '/games')        → '/zh/games'
 *   localePath('zh', '/')             → '/zh'
 *   localePath('zh', '/?id=3')        → '/zh?id=3'   ← 不是 '/zh/?id=3'
 *   localePath('en', '/games')        → '/games'     ← 默认语言不加前缀
 *   localePath('zh', 'https://x.com') → 'https://x.com'  ← 外链原样放行
 *
 * 为什么 `/` 带 query 要特殊处理：`/zh/?id=3` 不是 `/zh` 的规范形式，
 * Next 会先 308 到 `/zh?id=3`，白白多一跳。`/?` 分支留着 —— `/` 照样可能带 query。
 *
 * 外链那一条不是洁癖：漏掉它，`href="https://github.com/..."` 会变成
 * `https://github.com/...` 被当成相对路径，直接拼成 `/zh/https://...`。
 * 判据用「协议头」而不是「以 http 开头」，`mailto:` / `tel:` / `data:` 一并覆盖。
 */
export function localePath(locale: Locale, path: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) return path;

  const prefix = LOCALE_PREFIX[locale];
  if (!prefix) return path;

  if (path === '' || path === '/') return prefix;
  if (path.startsWith('/?')) return prefix + path.slice(1);
  return prefix + (path.startsWith('/') ? path : `/${path}`);
}

/**
 * 从 pathname 里剥出语言前缀。`localePath()` 的反函数。
 *
 *   '/zh/games' → { locale: 'zh', path: '/games' }
 *   '/zh'       → { locale: 'zh', path: '/' }
 *   '/games'    → { locale: 'en', path: '/games' }   ← 无前缀即默认语言
 *   '/en/games' → { locale: 'en', path: '/games' }   ← 见下面那条 ⚠️
 *
 * ⚠️ **只认 pathname，不吃 query**（`usePathname()` 返回的也不含 query）。
 * 传进来带 `?` 的字符串会得到错误结果，别那么用。
 *
 * ⚠️ **显式英文前缀 `/en/...` 也要剥**。正常流量里地址栏看不到它（middleware 会
 * 301 掉），但 middleware 的**内部 rewrite** 会让 `usePathname()` 报出
 * `/en/games` 这种路由内部路径。不剥的话语言判断仍然对（`/en` 也是英文），
 * 但 `I18nProvider` 算「当前页面的某个语言版本地址」会得到 `/zh/en/games` ——
 * 一个只在切换钮上出现、平时看不出来的坏链接。
 *
 * ⚠️ 中文 / 日文 / 韩文**不用单独列**（它们的前缀都不是空串，下面那个循环会挨个试）。
 *    2026-10-16 加日韩时这一处**没有改动** —— 前缀表加两行就够了，别在这里加分支。
 *
 * 无前缀一律判成 `DEFAULT_LOCALE`：这是「英文占空」的另一面。
 * 后台（`/admin/...`）也落在这条分支上 —— 它本来就不过语言前缀那套，
 * 语言由 cookie 决定，见 components/I18nProvider.tsx 里的说明。
 */
export function splitLocalePath(pathname: string): { locale: Locale; path: string } {
  /* 英文前缀单独处理：它在 LOCALE_PREFIX 里是空串，那个循环会直接跳过它 */
  if (pathname === EN_PREFIX) return { locale: 'en', path: '/' };
  if (pathname.startsWith(`${EN_PREFIX}/`)) {
    return { locale: 'en', path: pathname.slice(EN_PREFIX.length) };
  }

  for (const locale of LOCALES) {
    const prefix = LOCALE_PREFIX[locale];
    if (!prefix) continue;
    if (pathname === prefix) return { locale, path: '/' };
    if (pathname.startsWith(`${prefix}/`)) return { locale, path: pathname.slice(prefix.length) };
  }
  return { locale: DEFAULT_LOCALE, path: pathname };
}

/**
 * `<html lang>` 的值（也是 JSON-LD 的 `inLanguage`、`hreflang` 的键）。
 *
 * 集中在一处是因为它散得到处都是：根布局的 `<html>`、JSON-LD 两个节点、
 * 每个页面的 `alternates.languages`。各写各的迟早漂成 `zh` / `zh-CN` / `zh-Hans`
 * 三种，而 `hreflang` 的值**必须逐字一致**才算同一组标注。
 *
 * ⚠️ 英文是**光秃秃的 `en`**（不是 `en-US`）：它同时是 `x-default` 指的那份，
 *    而且当年就是这么定的 —— 改成 `en-US` 会把已有的 hreflang 标注全部换一遍，
 *    收益只有「更精确」，不值得。日韩没有这个包袱，按惯例写全 `ja-JP` / `ko-KR`。
 *
 * ⚠️ **2026-10-20 扩到 18 种**：新加的 14 种一律写「语言-地区」全称
 *    （`es-ES` / `fr-FR` / `pt-BR` …），`zh-TW` 写 `zh-TW`（**和上游的 hrefLang 逐字一致**，
 *    上游用的是 `zh-TW` 而不是 `zh-Hant`）。`fil` 写 `fil-PH`（菲律宾语的标准标签）。
 *    返回值类型因此从联合字面量放宽成 `string` —— 18 个标签没必要再列一遍。
 */
const HTML_LANG: Record<Locale, string> = {
  en: 'en',
  zh: 'zh-CN',
  'zh-TW': 'zh-TW',
  ja: 'ja-JP',
  ko: 'ko-KR',
  es: 'es-ES',
  hi: 'hi-IN',
  pt: 'pt-BR',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  ru: 'ru-RU',
  fil: 'fil-PH',
  nl: 'nl-NL',
  vi: 'vi-VN',
  th: 'th-TH',
  ms: 'ms-MY',
  id: 'id-ID',
};

export function htmlLang(locale: Locale): string {
  return HTML_LANG[locale];
}

/**
 * `og:locale` 的值。**和 `htmlLang` 不是一个体系**：Open Graph 用的是
 * `zh_CN` 这种下划线写法，hreflang / `<html lang>` 用的是 `zh-CN` 连字符写法。
 * 看着像同一个东西，写混了爬虫不报错、只是那半边标注失效 —— 所以各留一个函数。
 */
const OG_LOCALE: Record<Locale, string> = {
  en: 'en_US',
  zh: 'zh_CN',
  'zh-TW': 'zh_TW',
  ja: 'ja_JP',
  ko: 'ko_KR',
  es: 'es_ES',
  hi: 'hi_IN',
  pt: 'pt_BR',
  fr: 'fr_FR',
  de: 'de_DE',
  it: 'it_IT',
  ru: 'ru_RU',
  fil: 'fil_PH',
  nl: 'nl_NL',
  vi: 'vi_VN',
  th: 'th_TH',
  ms: 'ms_MY',
  id: 'id_ID',
};

export function ogLocale(locale: Locale): string {
  return OG_LOCALE[locale];
}

/**
 * **其他所有**语言。`og:locale:alternate` 用它 —— 那份是**一个列表**
 * （Next 的 `alternateLocale` 收 `string[]`），不是「另一种」。
 *
 * ⚠️ 2026-10-16 之前叫 `otherLocale`、返回单个 `Locale`，只在两种语言时成立
 * （「另一种」= 唯一的那一种）。加到四种之后那个函数本身就是错的 ——
 * 它只会返回四种里的一种，另外两种语言在 OG 标注里直接消失。
 * 所以改名 + 改返回值，**让所有调用点在编译期报错**，逐个改成列表。
 */
export function otherLocales(locale: Locale): Locale[] {
  return LOCALES.filter((item) => item !== locale);
}

/**
 * 一个页面的 `alternates` 三件套：canonical + 每条 hreflang + `x-default`。
 *
 * 入参是**不带前缀的路径**（`/games`、`/games/<id>`），前缀在这里加。
 * 这样调用点不必自己拼，也就不会出现「canonical 加了前缀、hreflang 忘了加」
 * 这种一半对一半的标注 —— 那种错 Google 会直接判成 hreflang 无效。
 *
 * 语言那份**遍历 `LOCALES` 现拼**，所以 2026-10-16 加日韩时这一处没改逻辑、
 * 只是自动多出两条。别退回手写 —— 手写就是漏日韩那条的来源。
 *
 * `x-default` 指默认语言（英文）：它是无前缀的那个地址，也是**没表态的访客**
 * 该看到的版本。
 *
 * ⚠️ Next 的 `alternates` 是**整体覆盖**而不是深合并：子页面写了自己的 `alternates`，
 * 父级那份就整个作废。所以每个 `generateMetadata` 都要写全 —— 少写一页，
 * 那页的 canonical 就会指向父级的（首页）。
 */
export function alternatesFor(locale: Locale, path: string) {
  const languages: Record<string, string> = {};
  for (const item of LOCALES) languages[htmlLang(item)] = localePath(item, path);
  languages['x-default'] = localePath(DEFAULT_LOCALE, path);

  return { canonical: localePath(locale, path), languages };
}

/**
 * 把一串语言标签收敛成受支持的 locale。
 * 顺序即优先级：`zh-CN` → zh，`en-GB` → en，`ja-JP` → ja，认不出的跳过看下一个。
 * 全部匹配不上时返回 DEFAULT_LOCALE（英文）。
 *
 * ⚠️ **2026-10-20 起不再只按主语言子标签判**：多了一份 `zh-TW`，必须先把繁体挑出来
 *    （`zh-TW` / `zh-HK` / `zh-MO` / 任何带 `Hant` 的标签 → `zh-TW`），
 *    剩下的 `zh-*` 才归简体。只写 `startsWith('zh')` 的话，繁体用户会被送到简体页。
 *
 * ⚠️ 认两处历史别名：`tl`（Tagalog 的旧标签）→ `fil`、`in`（印尼语的旧标签）→ `id`。
 *    浏览器至今还会发这两个，尤其老安卓机。
 *
 * ⚠️ 剩下的按**主语言子标签**（`split('-')[0]`）精确匹配 `LOCALES`，不做前缀模糊 ——
 *    `fr-CA` 归 fr（主标签相同），但 `fil` 不会被 `fi` 之类的标签误伤。
 */
export function resolveLocale(tags: readonly string[]): Locale {
  for (const tag of tags) {
    const lower = tag.trim().toLowerCase();
    if (!lower) continue;

    if (lower.startsWith('zh')) {
      if (
        lower.includes('hant') ||
        lower.startsWith('zh-tw') ||
        lower.startsWith('zh-hk') ||
        lower.startsWith('zh-mo')
      ) {
        return 'zh-TW';
      }
      return 'zh';
    }

    const base = lower.split('-')[0];
    if (base === 'tl') return 'fil';
    if (base === 'in') return 'id';
    const hit = LOCALES.find((locale) => locale === base);
    if (hit) return hit;
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
 *
 * ⚠️ 这份**不是 `htmlLang()`**：那边英文是光秃秃的 `en`（hreflang 的历史包袱），
 *    而 `Intl` 这里要 `en-US` 才明确。看着像重复，其实是两件事，别合并。
 */
const DATE_LOCALE: Record<Locale, string> = {
  en: 'en-US',
  zh: 'zh-CN',
  'zh-TW': 'zh-TW',
  ja: 'ja-JP',
  ko: 'ko-KR',
  es: 'es-ES',
  hi: 'hi-IN',
  pt: 'pt-BR',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  ru: 'ru-RU',
  fil: 'fil-PH',
  nl: 'nl-NL',
  vi: 'vi-VN',
  th: 'th-TH',
  ms: 'ms-MY',
  id: 'id-ID',
};

/**
 * `Intl.DateTimeFormat` / `toLocaleString` 用的语言标签。
 *
 * 从 `formatTime` 里单独提出来，是因为**页面上还有两处各写了一份**
 * （`LegalPage` 的「最后更新」、`PlaySaveControls` 的存档时间）——
 * 它们当年各写一个三元表达式，2026-10-16 加日韩时那种写法只会漏掉新语言。
 * 一律走这里。
 */
export function dateLocale(locale: Locale): string {
  return DATE_LOCALE[locale];
}

export function formatTime(timestamp: number, locale: Locale): string {
  return new Intl.DateTimeFormat(DATE_LOCALE[locale], {
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
