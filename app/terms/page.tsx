import type { Metadata } from 'next';
import LegalPage from '@/components/LegalPage';
import { SITE_NAME } from '@/lib/i18n';
import { legalDoc } from '@/lib/legal';
import { readLocale } from '@/lib/server/locale';

/**
 * /terms —— 服务条款（含游戏 ROM 的版权声明与侵权通知方式）。
 *
 * 与 /privacy 是同一个壳、同一套理由，见 app/privacy/page.tsx 的注释。
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await readLocale();
  const doc = legalDoc('terms', locale);

  return {
    title: doc.title,
    description: doc.summary,
    alternates: { canonical: '/terms' },
    openGraph: {
      type: 'website',
      url: '/terms',
      siteName: SITE_NAME[locale],
      title: doc.title,
      description: doc.summary,
      locale: locale === 'zh' ? 'zh_CN' : 'en_US',
    },
  };
}

export default async function TermsOfServicePage() {
  const locale = await readLocale();
  return <LegalPage kind="terms" locale={locale} />;
}
