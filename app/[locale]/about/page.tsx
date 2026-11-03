import type { Metadata } from 'next';
import DocPage from '@/components/DocPage';
import { SITE_NAME, alternatesFor, localePath, ogLocale, otherLocales } from '@/lib/i18n';
import { siteDoc } from '@/lib/site-doc';
import { readLocaleParam } from '@/lib/server/locale';

/**
 * /about —— 关于我们。
 *
 * 和 `/privacy` `/terms` 是同一个壳（`components/DocPage.tsx`）、同一套理由：
 * 这类页面要能被**直接分享**、被搜索引擎收录（见 app/sitemap.ts）、被第三方当作
 * 固定地址来检查，所以必须是真路由，不能是某个面板里的浮层。
 *
 * 文案在 `lib/site-doc.ts`（四语言 + 英文兜底，和法务两页同一套策略），
 * 版式在 `components/DocPage.tsx`。这个文件只负责 metadata 和取语言。
 *
 * 2026-11-03 加（用户参考 retrogamesnexus.com 的 about / contact 两页）。
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = await readLocaleParam(params);
  const doc = siteDoc('about', locale);

  return {
    // 站名后缀由根布局的 title.template 补上（`%s · 游戏小屋`）
    title: doc.title,
    description: doc.summary,
    alternates: alternatesFor(locale, '/about'),
    openGraph: {
      type: 'website',
      url: localePath(locale, '/about'),
      siteName: SITE_NAME[locale],
      title: doc.title,
      description: doc.summary,
      locale: ogLocale(locale),
      alternateLocale: otherLocales(locale).map(ogLocale),
    },
  };
}

/* 同 `/privacy`：按需 ISR。文案是死的，语言来自 URL，没有逐请求渲染的理由。 */
export const revalidate = 604800;

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await readLocaleParam(params);
  return <DocPage doc={siteDoc('about', locale)} locale={locale} current="/about" />;
}
