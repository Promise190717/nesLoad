import Page, { generateMetadata as metadata } from '@/lib/server/pages/developers';
export const revalidate = 604800; // = DEVELOPERS_PAGE_REVALIDATE_SECONDS(lib/server/developers.ts)；Next 的段配置只认字面量，别改回常量导入
type Props = { params: Promise<{ locale: string }> };
export function generateMetadata(props: Props) { return metadata({ ...props, searchParams: Promise.resolve({}) }); }
export default function StaticPage(props: Props) { return Page({ ...props, searchParams: Promise.resolve({}) }); }
