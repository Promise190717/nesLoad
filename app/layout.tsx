import type { Metadata, Viewport } from 'next';
import { I18nProvider } from '@/components/I18nProvider';
import { SITE_NAME, translate, type Locale, type MessageKey } from '@/lib/i18n';
import { readLocale } from '@/lib/server/locale';
import { resolveSiteOrigin } from '@/lib/site';
import './globals.css';

/**
 * 全站 metadata（SEO）。
 *
 * 几个刻意的取舍，别照着「惯例清单」把它改回去：
 *
 * - **不写 `alternates.languages`（hreflang）**。本站没有 `/en` `/zh` 这种分语言 URL，
 *   语言靠 cookie 决定，所有语言共用同一个地址。给同一个 URL 挂多个 hreflang 是
 *   无效标注（Google 会当成自我重复），只留一条 canonical。
 * - **`title.default` + `template` 都要**。default 是首页自己的标题（首页不该吃模板），
 *   template 给将来的子页面用（`/admin` 那几页会带上站名后缀）。
 * - **`robots` 显式写全**，包括 googleBot 的三个 max-*：不写的话图片预览会被压成缩略图，
 *   搜索结果的摘要长度也拿不到上限。`/admin` 与 `/api` 的排除在 app/robots.ts 里
 *   （那是爬虫文件层的事），另外后台自己还有一道 noindex，见 app/admin/layout.tsx ——
 *   robots.txt 只挡守规矩的爬虫，页面级的 noindex 才是真正的兜底。
 * - **keywords 是给非 Google 引擎的**，理由见 lib/i18n.ts 里那段注释。
 * - **OG 图不在这里写 `images`**：由 `app/opengraph-image.tsx` 用文件约定提供，
 *   Next 会自动补上 `og:image` 的绝对地址、尺寸与 alt。手写一份只会和它打架。
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await readLocale();
  const site = SITE_NAME[locale];
  /* 站名走 {site} 占位而不是在文案里硬写 —— 改名只要动 lib/i18n.ts 的 SITE_NAME */
  const t = (key: MessageKey) => translate(locale, key, { site });

  return {
    /*
     * metadataBase 是所有**相对**地址（canonical、og:image…）的解析基准，
     * 少了它 Next 会在构建时警告、生产环境还可能吐出发往 localhost 的绝对地址。
     * 取源规则见 lib/site.ts（环境变量 → 请求头 → 兜底）。
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
    alternates: { canonical: '/' },
    /*
     * 别把机身上的版本号（BETA v0.1.0）、存档时间戳之类自动识别成电话 / 地址
     * 并加上链接 —— iOS Safari 尤其爱干这事，点在像素风的界面上会非常出戏。
     */
    formatDetection: { telephone: false, email: false, address: false },
    openGraph: {
      type: 'website',
      url: '/',
      siteName: site,
      title: t('meta.title'),
      description: t('meta.description'),
      locale: locale === 'zh' ? 'zh_CN' : 'en_US',
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
 * 首屏必须在样式生效前把 <html> 上的四个属性落到实处，否则会闪一帧：
 *   - `data-theme`：不写就会先闪一帧深色（浅色主题的用户最明显）。
 *   - `data-lamp`：不写的话，吊灯会先按「亮着」画出来再灭掉（熄灭时最明显）。
 *   - `data-season`：不写就会先闪一帧冬天（窗外是春夏秋冬四季）。
 *   - `data-simple`：不写的话，开着简洁模式的人会先看到满屋子杂物再「唰」地消失。
 * 所以这里用内联脚本而不是 useEffect —— useEffect 跑在首次绘制之后。
 * 代价是服务端 HTML 上没有这四个属性，因此 <html> 需要 suppressHydrationWarning。
 *
 * **默认值 + 手动覆盖**，但四个属性的落盘策略不同：
 *   - 主题：记住，写 localStorage（刷新后还在）。
 *   - 灯：默认跟主题（白天关、夜晚开），手动点灯**也记住**（写 localStorage）。
 *   - 季节：默认**按农历算**（见下），点窗户只是**当次会话的临时覆盖，不落盘** ——
 *     刷新就回到按农历算的那一季。所以下面这段**不读 localStorage**，
 *     只管按农历算一个默认值；`nesload:season` 这个键已经废弃（旧值不再被读取）。
 *   - 简洁模式：记住，写 localStorage（`nesload:simple`，`'on'` 才是开）。
 * 季节和主题**无关**：切主题不会重置季节，季节只看农历
 * （雪夜、晴冬都能有，屋里开不开灯是两回事）。
 *
 * ⚠️ 季节那段的农历逻辑是从 `lib/season.ts` **手抄**过来的（内联脚本没法 import），
 * **改那边必须同步这里**。抄的是：Intl 的 chinese 日历取农历月 → 正月–三月春、
 * 四月–六月夏、七月–九月秋、其余冬；拿不到农历就退回公历月。
 */
const BOOT_INIT = `(function(){try{var t=localStorage.getItem('nesload:theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=t;var l=localStorage.getItem('nesload:lamp');if(t==='light')l='off';document.documentElement.dataset.lamp=l==='off'?'off':'on';var sm=localStorage.getItem('nesload:simple');document.documentElement.dataset.simple=sm==='on'?'on':'off';var s;try{var p=new Intl.DateTimeFormat('en-u-ca-chinese',{month:'numeric'}).formatToParts(new Date());var v='';for(var i=0;i<p.length;i++){if(p[i].type==='month'){v=p[i].value;}}var m=parseInt(v,10);if(!(m>=1&&m<=12)){m=new Date().getMonth()+1;}s=m<=3?'spring':m<=6?'summer':m<=9?'autumn':'winter';}catch(err){s='winter';}document.documentElement.dataset.season=s;}catch(e){document.documentElement.dataset.theme='dark';document.documentElement.dataset.lamp='on';document.documentElement.dataset.simple='off';document.documentElement.dataset.season='winter';}})();`;

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
  const language = locale === 'zh' ? 'zh-CN' : 'en';

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await readLocale();
  const origin = await resolveSiteOrigin();
  const jsonLd = buildJsonLd(
    origin,
    locale,
    SITE_NAME[locale],
    translate(locale, 'meta.description')
  );

  return (
    <html
      lang={locale === 'zh' ? 'zh-CN' : 'en'}
      data-locale={locale}
      suppressHydrationWarning
    >
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
        <script dangerouslySetInnerHTML={{ __html: BOOT_INIT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
          }}
        />
      </head>
      <body>
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
