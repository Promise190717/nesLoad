import Page, { generateMetadata as metadata } from '@/lib/server/pages/games';
export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ locale: string }> };
export function generateMetadata(props: Props) { return metadata({ ...props, searchParams: Promise.resolve({}) }); }
export default function StaticPage(props: Props) { return Page({ ...props, searchParams: Promise.resolve({}) }); }
