import Page, { generateMetadata as metadata } from '@/lib/server/pages/console';
export const revalidate = 2592000;
type Props = { params: Promise<{ locale: string; id: string }> };
export function generateMetadata(props: Props) { return metadata({ ...props, searchParams: Promise.resolve({}) }); }
export default function StaticPage(props: Props) { return Page({ ...props, searchParams: Promise.resolve({}) }); }
