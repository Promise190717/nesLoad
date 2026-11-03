import type { Metadata } from 'next';
import DocPage from '@/components/DocPage';
import { SITE_NAME, alternatesFor, localePath, ogLocale, otherLocales } from '@/lib/i18n';
import { legalDoc } from '@/lib/legal';
import { readLocaleParam } from '@/lib/server/locale';

/**
 * /privacy —— 隐私政策。
 *
 * **为什么是独立路由，而不是某个面板里的浮层**：游戏库 / 联机 / 存档那些面板全都没有
 * 自己的 URL，因为它们只在全屏场景里才有意义。隐私政策和条款不一样 ——
 * 它们要能被**直接分享**、被搜索引擎收录（见 app/sitemap.ts）、被第三方（广告平台 /
 * 应用商店审核之类）当作一个固定地址来检查。所以它们和 /admin 一样是真正的页面。
 *
 * 2026-10-13 起它住在 `app/[locale]/` 下：语言从 `params` 来（`/privacy` 英文、
 * `/zh/privacy` 中文），不再是「读 cookie 猜」。`alternates` 两条互指，
 * 收口在 `alternatesFor()`。
 *
 * 版式与文案都不在这里，在 components/DocPage.tsx 和 lib/legal.ts。
 *
 * 这个文件**不写 `export const dynamic`**：根布局已经在读请求头决定语言，
 * 整棵树本来就是动态渲染（构建输出里的 ƒ），这里再声明一次是多余的。
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = await readLocaleParam(params);
  const doc = legalDoc('privacy', locale);

  return {
    // 站名后缀由根布局的 title.template 补上（`%s · 游戏小屋`）
    title: doc.title,
    description: doc.summary,
    alternates: alternatesFor(locale, '/privacy'),
    openGraph: {
      type: 'website',
      url: localePath(locale, '/privacy'),
      siteName: SITE_NAME[locale],
      title: doc.title,
      description: doc.summary,
      locale: ogLocale(locale),
      alternateLocale: otherLocales(locale).map(ogLocale),
    },
  };
}

/*
 * 按需 ISR（2026-11-03 从 `force-dynamic` 改回）。
 *
 * 以前这里的理由是「预渲染会给 HTML 挂 `s-maxage=31536000`，发版后旧 HTML 指向
 * 已经换掉的 chunk，用户陷进刷新循环」。那个风险**已经在两层上消掉了**：
 *   · `/_next/static/*` 现在是 `max-age=0, must-revalidate`（见 next.config.js），
 *     浏览器和 CDN 每次都回源验一次，不会再吃一年前的 chunk；
 *   · OpenNext 的增量缓存 key 里带 `OPEN_NEXT_BUILD_ID`，新版本上线等于换了一套缓存，
 *     这份 HTML 会重新生成。
 *
 * 而 `force-dynamic` 的代价是实打实的：这四页（privacy / terms / about / contact）
 * 被每一页的页脚链着，是爬虫最常抓的一批地址，每次抓取都要在免费版 10ms CPU 里
 * 现场跑一遍 React SSR。文案是死的、语言来自 URL，没有任何理由逐请求渲染。
 */
export const revalidate = 604800;

export default async function PrivacyPolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = await readLocaleParam(params);
  return <DocPage doc={legalDoc('privacy', locale)} locale={locale} current="/privacy" />;
}
