import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SITE_NAME, alternatesFor, localePath, ogLocale, otherLocales, translate } from '@/lib/i18n';
import { readLocaleParam } from '@/lib/server/locale';
import ConsoleScene from '@/components/ConsoleScene';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await readLocaleParam(params);
  const title = translate(locale, 'seo.room.title');
  const description = translate(locale, 'seo.room.description');
  return { title, description, alternates: alternatesFor(locale, '/room'), openGraph: {
    type: 'website', url: localePath(locale, '/room'), siteName: SITE_NAME[locale], title, description,
    locale: ogLocale(locale), alternateLocale: otherLocales(locale).map(ogLocale),
  } };
}
export default function Page() {
  return <Suspense fallback={null}><ConsoleScene /></Suspense>;
}
