import { LOCALES } from '@/lib/i18n';
import { readLocaleParam } from '@/lib/server/locale';
import SiteDocument, { siteMetadata } from '@/components/SiteDocument';
export { viewport } from '@/components/SiteDocument';

// The locale is part of the cache key, never a cookie-dependent HTML variant.
export function generateStaticParams() { return LOCALES.map(locale => ({ locale })); }
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return siteMetadata(await readLocaleParam(params));
}
export default async function LocaleLayout({ children, params }: {
  children: React.ReactNode; params: Promise<{ locale: string }>;
}) {
  return <SiteDocument locale={await readLocaleParam(params)}>{children}</SiteDocument>;
}
