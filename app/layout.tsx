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
 * 首屏主题必须在样式生效前落到 <html data-theme> 上，否则会先闪一帧深色。
 * 所以这里用内联脚本而不是 useEffect —— useEffect 跑在首次绘制之后。
 * 代价是服务端 HTML 上没有 data-theme，因此 <html> 需要 suppressHydrationWarning。
 */
const THEME_INIT = `(function(){try{var t=localStorage.getItem('nesload:theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

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
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
