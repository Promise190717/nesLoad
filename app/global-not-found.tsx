import SiteDocument from '@/components/SiteDocument';
import NotFound from './[locale]/not-found';
export const metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.retrogamesbox.com'),
  title: '404 — Retro Games Box', robots: { index: false, follow: true },
};
export default function GlobalNotFound() { return <SiteDocument locale="en"><NotFound /></SiteDocument>; }
