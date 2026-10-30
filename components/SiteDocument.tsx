import type { Metadata, Viewport } from 'next';
import NextTopLoader from 'nextjs-toploader';
import Analytics from '@/components/Analytics';
import BootAttributes from '@/components/BootAttributes';
import { I18nProvider } from '@/components/I18nProvider';
import LocalePrompt from '@/components/LocalePrompt';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';
import {
  SITE_NAME,
  alternatesFor,
  htmlLang,
  localePath,
  ogLocale,
  otherLocales,
  translate,
  type Locale,
  type MessageKey,
} from '@/lib/i18n';
import { Suspense } from 'react';
import { resolveSiteOrigin } from '@/lib/site';
import '@/app/globals.css';

/**
 * 全站 metadata（SEO）。
 *
 * 几个刻意的取舍，别照着「惯例清单」把它改回去：
 *
 * - **`alternates` 要写全（canonical + hreflang）**。2026-10-13 起语言分了路径
 *   （英文无前缀、中文 `/zh`），同一个页面有了两个地址 —— 这正是 hreflang 的用武之地：
 *   `en` / `zh-CN` 互指，`x-default` 指英文。反过来，**现在不写 hreflang 才是错的**：
 *   两份内容同源却互不声明，会被当成重复内容（这跟 2026-10-13 之前「共用一个 URL、
 *   写了反而自我重复」的判断正好相反，别再照老注释改回去）。
 *
 *   本函数接收路径语言；子页面覆盖各自 canonical 与 hreflang。
 * - **`title.default` + `template` 都要**。default 是首页自己的标题（首页不该吃模板），
 *   template 给将来的子页面用（`/admin` 那几页会带上站名后缀）。
 * - **`robots` 显式写全**，包括 googleBot 的三个 max-*：不写的话图片预览会被压成缩略图，
 *   搜索结果的摘要长度也拿不到上限。`/admin` 与 `/api` 的排除在 app/robots.ts 里
 *   （那是爬虫文件层的事），另外后台自己还有一道 noindex，见 app/admin/layout.tsx ——
 *   robots.txt 只挡守规矩的爬虫，页面级的 noindex 才是真正的兜底。
 * - **keywords 是给非 Google 引擎的**，理由见 lib/i18n.ts 里那段注释。
 * - 独立根布局显式引用共享的 OG / Twitter 图端点。
 */
export async function siteMetadata(locale: Locale): Promise<Metadata> {
  const site = SITE_NAME[locale];
  /* 站名走 {site} 占位而不是在文案里硬写 —— 改名只要动 lib/i18n.ts 的 SITE_NAME */
  const t = (key: MessageKey) => translate(locale, key, { site });

  return {
    /*
     * metadataBase 是所有**相对**地址（canonical、og:image…）的解析基准，
     * 少了它 Next 会在构建时警告、生产环境还可能吐出发往 localhost 的绝对地址。
     * 取源规则见 lib/site.ts（构建环境变量 → 正式域名）。
     */
    metadataBase: new URL(await resolveSiteOrigin()),
    title: {
      default: t('meta.title'),
      template: `%s · ${site}`,
    },
    description: t('meta.description'),
    keywords: t('meta.keywords').split(',').map((word) => word.trim()),
    applicationName: site,
    authors: [{ name: site }],
    creator: site,
    publisher: site,
    /* 归到「游戏」这一类，帮搜索引擎把站放进正确的目录里 */
    category: 'games',
    alternates: alternatesFor(locale, '/'),
    /*
     * 别把机身上的版本号（BETA v0.1.0）、存档时间戳之类自动识别成电话 / 地址
     * 并加上链接 —— iOS Safari 尤其爱干这事，点在像素风的界面上会非常出戏。
     */
    formatDetection: { telephone: false, email: false, address: false },
    /*
     * iOS 的「添加到主屏幕」。Next 会把这几项翻成 `apple-mobile-web-app-*` 那组 meta。
     *
     * 这里**只写 iOS 那套**：Android / 桌面端的可安装性走的是 PWA 标准那条路 ——
     * 清单由 app/manifest.ts 按文件约定提供（`<link rel="manifest">` 是 Next 自动插的，
     * 别在这里再写一遍 `manifest` 字段，两处都写只会打架）。
     * 180×180 的 iOS 主屏图标同理，走文件约定 `app/apple-icon.png`，不在这里写 `icons`。
     *
     * `title` 只能是英文：这行字 iOS 只在「添加到主屏幕」那一刻读一次，
     * 而它是**静态**的 —— 跟不了语言。理由和 manifest 里 name 那条一模一样，见 app/manifest.ts。
     *
     * `statusBarStyle: 'black'` 而不是 `'black-translucent'`：后者会让页面顶到状态栏底下，
     * 必须配 `env(safe-area-inset-*)` 才不被遮住，而掌机那套没处理安全区。
     * 黑色状态栏最稳 —— 深色主题下和房间底色（#08080a）几乎分不出边界。
     */
    appleWebApp: {
      capable: true,
      title: SITE_NAME.en,
      statusBarStyle: 'black',
    },
    openGraph: {
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: SITE_NAME.en }],
      type: 'website',
      /*
       * `url` 也按语言分路径 —— 中文首页的 og:url 该是 `/zh`，跟 canonical 一致。
       * `locale` / `alternateLocale` 用 `ogLocale()`（下划线那套，`zh_CN`），
       * 跟 `htmlLang()`（连字符 `zh-CN`）不是一个体系，别混。
       *
       * ⚠️ `alternateLocale` 是**另外所有语言**（`otherLocales` 返回数组，
       *    2026-10-16 从「另一种」改成列表）—— 两种语言时它俩等价，
       *    四种语言下只报一种会让另外两种在 OG 标注里凭空消失。
       */
      url: localePath(locale, '/'),
      siteName: site,
      title: t('meta.title'),
      description: t('meta.description'),
      locale: ogLocale(locale),
      alternateLocale: otherLocales(locale).map(ogLocale),
    },
    /*
     * `summary_large_image` 才会横着铺开那张 1200×630 的图。
     * 图**不在这里写**：由 `app/twitter-image.tsx` 按文件约定提供（画法与 og 那张共用
     * lib/og-image.tsx，所以两边永远是同一张图）。手写一份 images 只会和文件约定打架。
     *
     * 虽然 X 在缺 twitter:image 时会回落到 og:image，但那个回落行为没有进规范、
     * 各家抓取器（尤其缓存旧卡片的）实现并不一致，所以仍然显式给一份 ——
     * 代价只是一个转发文件。
     */
    twitter: {
      images: ['/twitter-image'],
      card: 'summary_large_image',
      title: t('meta.title'),
      description: t('meta.description'),
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
  };
}

/**
 * viewport / 浏览器 UI 相关的 meta。Next 14 起从 metadata 里拆出来单独导出
 * （混在 metadata 里会报废弃警告）。
 *
 * `themeColor` 按 `prefers-color-scheme` 分两条 —— 界面主题默认就是跟着系统走的
 * （见下面 BOOT_INIT），所以两条分别取深度主题的底色 `ink-950`：
 * 深色 #08080a、浅色 #f1f1f4（两个值都对着 globals.css 的 --color-ink-950 抄的）。
 * 移动端浏览器会把地址栏染成这个色，和房间底色连成一片，不会在顶上留一条白边。
 *
 * `colorScheme: 'dark light'` 更关键：在 CSS 到达之前，浏览器就先按系统偏好决定
 * 默认画布色，深色用户不会先闪一帧白屏 —— 这正是 BOOT_INIT 想解决的那个闪烁的另一半。
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark light',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#08080a' },
    { media: '(prefers-color-scheme: light)', color: '#f1f1f4' },
  ],
};

/**
 * 首屏必须在样式生效前把 <html> 上的六个属性落到实处，否则会闪一帧：
 *   - `data-theme`：不写就会先闪一帧深色（浅色主题的用户最明显）。
 *   - `data-lamp`：不写的话，吊灯会先按「亮着」画出来再灭掉（熄灭时最明显）。
 *   - `data-season`：不写就会先闪一帧冬天（窗外是春夏秋冬四季）。
 *   - `data-simple`：不写的话，开着简洁模式的人会先看到满屋子杂物再「唰」地消失。
 *   - `data-tv`：不写就会先按「小」档画一台电视机，再「啪」地长成大档 ——
 *     它动的是**整间屋子的尺寸**（屏幕 / 桌子 / 地板线 / 吊灯线），
 *     比前四个都显眼（尺寸由 globals.css 那组 --tv-* 变量推出来，见 lib/tv-size.ts）。
 *   - `data-mobile`（'on' / 'off'）：移动端要画的是**另一台机器**（掌机，见
 *     components/HandheldConsole.tsx），不写就会先画一帧桌面那间屋子 ——
 *     那一下比前面五个加起来都显眼（整页换掉）。
 * 所以这里用内联脚本而不是 useEffect —— useEffect 跑在首次绘制之后。
 * 代价是服务端 HTML 上没有这六个属性，因此 <html> 需要 suppressHydrationWarning。
 *
 * **默认值 + 手动覆盖**，但六个属性的落盘策略不同：
 *   - 主题：记住，写 localStorage（`nesload:theme`）。
 *     ⚠️ **没存过值时，首屏会把现算出来的结果写回去**（2026-10-19 加）。
 *     在这之前只有「手动点主题钮」才落盘，于是没点过钮的人，浅色只活在
 *     **当前这份 DOM** 里（`<html data-theme>`）；而这脚本只在整页加载时跑，
 *     软导航不跑 —— 两条路径一个「记住」一个「重新按系统算」，
 *     系统是深色的用户就会「切个路由突然变黑」（用户 2026-10-19 报的现象）。
 *     落盘之后两条路径读的是同一个值，结果稳定。
 *     ⚠️ 代价：**不再跟随系统主题的实时变化**（用户在系统里切深色，本站不动）。
 *     这是刻意换来的 —— 要跟随就得两条路径都跟随，而软导航根本没有「重新算」
 *     的时机，只会把同一个不一致换个方向再演一遍。
 *     ⚠️ **但落盘盖不住「软导航时属性被抹掉」这一种**：切语言走的是客户端导航，
 *     这段脚本根本不重跑，`<html data-theme>` 却会随根布局重渲染一起没了 ——
 *     用户 2026-10-19 报的「切语言变黑夜、刷新又恢复」就是它。那半边由
 *     `components/BootAttributes.tsx` 补（导航后把缺的属性填回去），两处是一件事的两半。
 *   - 灯：默认跟主题（白天关、夜晚开），手动点灯**也记住**（写 localStorage）。
 *   - 季节：默认**按农历算**（见下），点窗户只是**当次会话的临时覆盖，不落盘** ——
 *     刷新就回到按农历算的那一季。所以下面这段**不读 localStorage**，
 *     只管按农历算一个默认值；`nesload:season` 这个键已经废弃（旧值不再被读取）。
 *   - 简洁模式：记住，写 localStorage（`nesload:simple`，`'on'` 才是开）。
 *   - 电视机大小：记住，写 localStorage（`nesload:tv`，`small` / `medium` / `large`，
 *     **三个都是合法值**——用户明确选了哪档就是哪档；认不出的值才走分页面兜底）。
 *     **只读这一个键**，尺寸本身在 CSS 里。
 *     ⚠️ **兜底值分页面**：`/play` 是 `medium`，其它页面是 `small` ——
 *     两页的档位映射的是**两套 CSS**（`--play-size-scale` vs `--tv-ratio`），
 *     同一档在两页量出来的大小本来就不一样，默认自然也不该一样。
 *     判据是**路径前缀**（下面那段用 `location.pathname` 现读），
 *     写法是「以 `/play` 段收尾」而不是写死语种（`/^\/(zh\/)?play/` 那种）——
 *     2026-10-19 之前的写法只认 `/zh`，`/ja/play` `/ko/play` 整页加载会掉回 small。
 *     ⚠️ **改这里必须同步 `PlayScene.tsx` 的 `PLAY_DEFAULT_SCREEN_SIZE`**。
 *     ⚠️ **`small` 必须出现在合法值列表里**：老写法只认 medium/large、把 small
 *     当「没存过」，在兜底恰好也是 small 的年代没暴露；现在 /play 兜底是 medium，
 *     漏掉它就会把用户明确选的小档强行抬成中档。
 *   - 移动端：**不落盘**，每次现判 —— 它是设备的属性，不是用户的偏好
 *     （同一台手机永远是移动端，换成桌面端就该变回来）。
 * 季节和主题**无关**：切主题不会重置季节，季节只看农历
 * （雪夜、晴冬都能有，屋里开不开灯是两回事）。
 *
 * ⚠️ 季节那段的农历逻辑是从 `lib/season.ts` **手抄**过来的（内联脚本没法 import），
 * **改那边必须同步这里**。抄的是：Intl 的 chinese 日历取农历月 → 正月–三月春、
 * 四月–六月夏、七月–九月秋、其余冬；拿不到农历就退回公历月。
 * 同理，`data-tv` 的合法值抄的是 `lib/tv-size.ts` 的 `TvSize`，那边加档位要同步这里；
 * `data-mobile` 的判定抄的是 `lib/device.ts` 的 `isMobileDevice()`，**改那边必须同步这里**。
 *
 * ⚠️ **每个键各自 try，禁止再在外面包一个大 try**（2026-10-19 改）：
 * 以前整段一个 try/catch，catch 里硬编码 `data-theme='dark'` —— 只要任何一步抛错
 * （最典型是 localStorage 在隐私模式 / 存储被限制时抛 SecurityError），
 * 就会把用户已经存好的浅色一并丢掉、整站按深色重画，六个属性还会一起退回默认。
 * 现在读写都走小函数，单条失败只影响那一条；主题读不到时退回当前算出来的，
 * 而不是无条件 dark。
 *
 * ⚠️ **为什么 2026-10-19 之前「切路由会变黑」听起来变频繁了**：`a599d47 静态缓存`
 * 把根文档从唯一的 `app/layout.tsx` 挪进了 `app/[locale]/layout.tsx`（带 `[locale]`
 * 动态段的 root layout），另外还有 `app/admin/layout.tsx`、`app/global-not-found.tsx`
 * 两个独立根。软导航不会重跑这段脚本，但**跨 root layout、切语言（动态段参数变了）、
 * 进 404、联机退出时的 `window.location.assign`、middleware 的 307** 都是整页加载
 * ⇒ 都会重跑。所以修法是「重跑也必须算出同一个结果」，不是「让它别重跑」。
 */
const BOOT_INIT = `(function(){
var root=document.documentElement;
function read(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function write(k,v){try{localStorage.setItem(k,v);}catch(e){}}
var t=read('nesload:theme');
if(t!=='light'&&t!=='dark'){
t='dark';
try{if(window.matchMedia('(prefers-color-scheme: light)').matches)t='light';}catch(e){}
write('nesload:theme',t);
}
root.dataset.theme=t;
var l=read('nesload:lamp');
if(t==='light')l='off';
root.dataset.lamp=l==='off'?'off':'on';
root.dataset.simple=read('nesload:simple')==='on'?'on':'off';
var tv=read('nesload:tv');
root.dataset.tv=tv==='medium'||tv==='large'||tv==='small'?tv:(/\\/play(?:\\/|$)/.test(location.pathname)?'medium':'small');
var ua=navigator.userAgent;
var mob=!!(navigator.userAgentData&&navigator.userAgentData.mobile)||/Android|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);
root.dataset.mobile=mob?'on':'off';
var s='winter';
try{var p=new Intl.DateTimeFormat('en-u-ca-chinese',{month:'numeric'}).formatToParts(new Date());var v='';for(var i=0;i<p.length;i++){if(p[i].type==='month'){v=p[i].value;}}var m=parseInt(v,10);if(!(m>=1&&m<=12)){m=new Date().getMonth()+1;}s=m<=3?'spring':m<=6?'summer':m<=9?'autumn':'winter';}catch(err){}
root.dataset.season=s;
})();`;

/**
 * 结构化数据（JSON-LD）。搜索引擎读不懂 canvas 里跑的东西 —— 页面本身几乎没有
 * 可索引的文字（房间、电视机都是 CSS 画的），所以这里用 schema.org 明说：
 * 这是个什么站、能不能免费用、跑在什么上。
 *
 * `@graph` 两个节点互相引用（WebApplication 的 publisher 指向 WebSite），
 * 这是 schema.org 推荐的写法：比两个互不相干的块更容易被当成「一个实体」。
 * 用 `@id` 而不是把 WebSite 整个内联，是为了以后加别的节点时能继续复用这两个 id。
 *
 * **注意 `isAccessibleForFree` 与 `offers` 都要写**：Google 的软件类富结果会看这两项，
 * 只写 offer 不写 isAccessibleForFree 有时不认。
 *
 * 序列化后把 `<` 换成 `\u003c` —— 内联 `<script>` 里出现 `</script>` 就能提前闭合标签。
 * 这里的字符串全是自己写死的文案，理论上不会带 `<`，但这是零成本的正确写法，
 * 何况将来 description 可能会带上用户可控的内容。
 */
function buildJsonLd(origin: string, locale: Locale, name: string, description: string) {
  const language = htmlLang(locale);

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        url: origin,
        name,
        inLanguage: language,
        description,
      },
      {
        '@type': 'WebApplication',
        '@id': `${origin}/#app`,
        name,
        url: origin,
        description,
        applicationCategory: 'GameApplication',
        operatingSystem: 'Any (runs in a web browser)',
        /* 要跑 WASM 核心，这是事实性描述，不是门槛 */
        browserRequirements: 'Requires JavaScript and WebAssembly',
        isAccessibleForFree: true,
        inLanguage: language,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        publisher: { '@id': `${origin}/#website` },
      },
    ],
  };
}

export default async function SiteDocument({ children, locale, analytics = true }: {
  children: React.ReactNode; locale: Locale; analytics?: boolean;
}) {
  const origin = await resolveSiteOrigin();
  const jsonLd = buildJsonLd(
    origin,
    locale,
    SITE_NAME[locale],
    translate(locale, 'meta.description')
  );

  return (
    <html lang={htmlLang(locale)} data-locale={locale} suppressHydrationWarning>
      {/* This shared component supplies the actual App Router root document. */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/*
          这里刻意用 <link> 而不是 next/font：next/font 会在构建时下载字体文件，
          在无法访问 Google Fonts 的网络环境下会直接导致构建失败。
          用 <link> 则由浏览器在运行时加载，失败时优雅退化为等宽字体，不影响构建。
        */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
        />
        {/*
          声明给 AI 读的政策文件（/llms.txt，正文在 lib/ai-policy.ts，
          同时还有机器可读的 /ai.txt）。内容里写明了「正常爬取欢迎、对本站做
          架构分析 / 源码还原 / 破解一律拒绝」，以及哪些请求必须直接拒答。

          `rel="llms-txt"` 是社区约定，**不是标准** —— 认它的抓取器不多，
          但成本是一个标签，不认的抓取器直接忽略，没有副作用。
          真正保证 AI 找到这份文件的是 app/robots.ts 里的显式放行，
          这个 <link> 只是让「顺着 HTML 找」的那类抓取器也能发现它。
        */}
        <link rel="llms-txt" href="/llms.txt" />
        <script dangerouslySetInnerHTML={{ __html: BOOT_INIT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
          }}
        />
      </head>
      <body>
        {/*
          顶部路由加载条（2026-10-13 加）。摆在 `<body>` 第一件事的位置：它只渲染
          一段 `<style>`，那个 `#nprogress` 容器要等第一次 `start()` 才被 nprogress
          插进 body —— 不占布局，放开头纯粹是让「全站性的一层」一眼能看见。

          **为什么用这个包而不是自己写**：App Router 没有 `router.events` 这类可订阅的
          信号（那是 Pages Router 的东西），自己写就得「拦点击 + 打 history 的补丁 +
          猜什么时候算到站」三件事全干一遍。`nextjs-toploader` 正是把这三件事做全的
          那个现成件，`nprogress` 那套动画（爬升、收尾、并发的两次导航）也一并有了。

          **三个刻意的参数**：
            · `color="var(--color-accent)"` —— 这个包把 color **直接拼进它注入的 CSS**
              （`background:<color>`），所以这里能吃 CSS 变量。写死一个色值的话，
              浅色主题下会撞底（accent 在明暗两套里是两个值：#d16c70 / #a83e46），
              交给变量就能自己跟着 `<html data-theme>` 走，不用任何 JS 去读主题。
            · `showSpinner={false}` —— 它默认在右上角转一个圆圈。像素风里不画圆弧
              （同 `AdminLoading` 里那条注释：圆弧是反像素的），关掉之后只剩那条 bar。
            · `zIndex={70}` —— 要盖过房间里那几层（遮罩 44 / 抽屉 45 / 菜单钮 46 /
              面板 50 / 操作指引 60）。它的默认值 1600 是给普通站用的，本站的层级是
              一套小数字，放进这套里更好读，也省得为它记一个例外。

          `shadow` 默认是「10px 柔光 × 2」，这里收到 6px：3px 高的条子上默认那圈会糊成
          一片，收窄之后还是「CRT 荧光」那个意思，但不抢戏。

          ⚠️ 它只是**听**（`document` 上的点击 + history 补丁），题目外那几种情况它听不见，
          得靠 `useTopLoader()` 手动喊 —— 全站只有三处（都带注释，搜 `topLoader`）：
            · `ConsoleScene` —— 屋里有活时点「游戏列表 / 账号 / 首页」弹确认框，
              那次点击**没有**跳转，要把已经起来的条收掉（写在那条 effect 里）；
            · `ConsoleScene` —— 语言那颗下拉不是 `<a>`，`router.push` 前手动 `start()`；
            · `AccountCenter` —— 退出登录后那次 `router.push`，同上。
        */}
        <NextTopLoader
          color="var(--color-accent)"
          height={3}
          shadow="0 0 6px var(--color-accent)"
          showSpinner={false}
          zIndex={70}
        />
        <I18nProvider initialLocale={locale}>
          {children}
          {/*
            「要不要换成你的语言」提示。**必须在 Provider 里面** —— 它要读当前语言、
            要拿到另一种语言的地址。挂在根布局而不是房间里，是因为内容页（/games 等）
            同样需要：从搜索点进来的人也可能是个中文用户。
            它自己不渲染任何东西，除非「没设置过语言 且 浏览器语言 ≠ 页面语言」。
          */}
          <Suspense fallback={null}><LocalePrompt /></Suspense>
        </I18nProvider>
        {/*
          PWA 的 Service Worker 注册（清单在 app/manifest.ts，策略在 public/sw.js）。
          它不渲染任何东西，也不依赖 i18n 上下文，所以摆在 Provider 外面 ——
          顺带保证**即使 I18nProvider 出问题，SW 也照样注册**。
        */}
        <ServiceWorkerRegistrar />
        {/*
          导航后把上面那六个属性补回来（2026-10-19 加，修「切语言变黑夜」）。

          **必须在 `<body>` 里、和 BOOT_INIT 隔开**：那个内联脚本只在整页加载时跑，
          客户端导航（切语言就是）不会重跑，属性却在根布局重渲染时没了 —— 详见组件自己的注释。
          它不渲染任何东西，也不依赖 i18n 上下文。
        */}
        <BootAttributes />
        {/*
          Google Analytics（GA4，见 components/Analytics.tsx）。
          **`analytics` 默认 true，只有 /admin 传 false** —— 后台是自己的操作台，
          混进 GA 里只会把「自己点了几次」算成真实流量，而且 /admin 本来就不该被收录。
          注意它**不是 `<head>` 里的裸标签**：走 `next/script` 的 afterInteractive，
          水合之后才拉，不占首屏关键路径。
        */}
        <Analytics enabled={analytics} />
      </body>
    </html>
  );
}
