import type { Metadata } from 'next';
import LegalPage from '@/components/LegalPage';
import { SITE_NAME, alternatesFor, localePath, ogLocale, otherLocales } from '@/lib/i18n';
import { legalDoc } from '@/lib/legal';
import { readLocaleParam } from '@/lib/server/locale';

/**
 * /terms —— 服务条款（含游戏 ROM 的版权声明与侵权通知方式）。
 *
 * 与 /privacy 是同一个壳、同一套理由，见 app/[locale]/privacy/page.tsx 的注释。
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = await readLocaleParam(params);
  const doc = legalDoc('terms', locale);

  return {
    title: doc.title,
    description: doc.summary,
    alternates: alternatesFor(locale, '/terms'),
    openGraph: {
      type: 'website',
      url: localePath(locale, '/terms'),
      siteName: SITE_NAME[locale],
      title: doc.title,
      description: doc.summary,
      locale: ogLocale(locale),
      alternateLocale: otherLocales(locale).map(ogLocale),
    },
  };
}

export default async function TermsOfServicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = await readLocaleParam(params);
  return <LegalPage kind="terms" locale={locale} />;
}
