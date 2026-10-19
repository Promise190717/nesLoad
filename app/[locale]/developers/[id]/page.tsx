import Page, { generateMetadata as metadata } from '@/lib/server/pages/developer';
export const revalidate = 86400;
type Props = { params: Promise<{ locale: string; id: string }> };
export function generateMetadata(props: Props) { return metadata(props); }
export default function StaticPage(props: Props) { return Page({ ...props, searchParams: Promise.resolve({}) }); }

export { developerStaticParams as generateStaticParams } from '@/lib/server/static-params';
