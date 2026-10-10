import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { I18nProvider } from '@/components/I18nProvider';
import {
  LOCALE_COOKIE,
  isLocale,
  parseAcceptLanguage,
  resolveLocale,
  translate,
  type Locale,
} from '@/lib/i18n';
import './globals.css';

/**
 * 语言：手动切过的 cookie 优先，其次是浏览器的 Accept-Language（即浏览器设置），
 * 一条都匹配不上才落到英文。
 *
 * cookies() / headers() 会让这个路由变成动态渲染 —— 换来的是首屏文案就是对的，
 * 不会先渲染英文再翻成中文。代价是不能再用 output: 'export' 做纯静态托管。
 */
async function readLocale(): Promise<Locale> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);

  const saved = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;

  return resolveLocale(parseAcceptLanguage(headerList.get('accept-language')));
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await readLocale();
  return {
    title: 'NES / SFC Loader',
    description: translate(locale, 'meta.description'),
  };
}

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await readLocale();

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
      </head>
      <body>
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
