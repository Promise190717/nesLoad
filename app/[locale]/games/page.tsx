import Page, { generateMetadata as metadata } from '@/lib/server/pages/games';
import { GAMES_PAGE_REVALIDATE_SECONDS } from '@/lib/server/sb-games';
export const revalidate = GAMES_PAGE_REVALIDATE_SECONDS;
type Props = { params: Promise<{ locale: string }> };
export function generateMetadata(props: Props) { return metadata({ ...props, searchParams: Promise.resolve({}) }); }
export default function StaticPage(props: Props) { return Page({ ...props, searchParams: Promise.resolve({}) }); }
