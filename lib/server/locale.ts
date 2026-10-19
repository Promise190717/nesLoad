import { notFound } from 'next/navigation';
import { isLocale, type Locale } from '../i18n';

/** Public page language comes from the URL and can be prerendered.
 * Reading headers or cookies here would opt every caller out of SSG.
 */
export async function readLocaleParam(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return locale;
}
