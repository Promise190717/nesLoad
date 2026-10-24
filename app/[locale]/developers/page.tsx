import Page, { generateMetadata as metadata } from '@/lib/server/pages/developers';
import { DEVELOPERS_PAGE_REVALIDATE_SECONDS } from '@/lib/server/developers';
export const revalidate = DEVELOPERS_PAGE_REVALIDATE_SECONDS;
type Props = { params: Promise<{ locale: string }> };
export function generateMetadata(props: Props) { return metadata({ ...props, searchParams: Promise.resolve({}) }); }
export default function StaticPage(props: Props) { return Page({ ...props, searchParams: Promise.resolve({}) }); }
