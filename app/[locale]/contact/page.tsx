import type { Metadata } from 'next';
import DocPage from '@/components/DocPage';
import { SITE_NAME, alternatesFor, localePath, ogLocale, otherLocales } from '@/lib/i18n';
import { siteDoc } from '@/lib/site-doc';
import { readLocaleParam } from '@/lib/server/locale';

/**
 * /contact —— 联系我们。
 *
 * 与 `/about` 同一个壳、同一套理由，见那边顶上的注释。
 *
 * ⚠️ 这一页**没有表单**：本站的联系方式只有邮箱（`SUPPORT_EMAIL`，定义在 lib/legal.ts）。
 *    站内的留言本在游戏房间那本「地上的本子」里（`components/FeedbackPanel.tsx`），
 *    它没有独立 URL、也不适合当正式的联系渠道 —— 别为了「看起来完整」在这里
 *    再挂一个自建表单，那要额外的防滥用（Turnstile）和收件端，收益为零。
 *
 * ⚠️ 邮箱做成 `mailto:` 链接，靠 DocPage 的 `[文字](地址)` 行内标记渲染。
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = await readLocaleParam(params);
  const doc = siteDoc('contact', locale);

  return {
    title: doc.title,
    description: doc.summary,
    alternates: alternatesFor(locale, '/contact'),
    openGraph: {
      type: 'website',
      url: localePath(locale, '/contact'),
      siteName: SITE_NAME[locale],
      title: doc.title,
      description: doc.summary,
      locale: ogLocale(locale),
      alternateLocale: otherLocales(locale).map(ogLocale),
    },
  };
}

/* 同 `/about`：按需 ISR。文案是死的，语言来自 URL，没有逐请求渲染的理由。 */
export const revalidate = 604800;

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await readLocaleParam(params);
  return <DocPage doc={siteDoc('contact', locale)} locale={locale} current="/contact" />;
}
