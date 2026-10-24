import Page, { generateMetadata as metadata } from '@/lib/server/pages/developers';

/**
 * `/developers/page/2` —— 开发商列表分页进路径（2026-10-20）。
 *
 * 起因见 `lib/catalog-route.ts` 文件头：`?page=` 会被改写成影子路由，
 * 客户端软导航对不上 ⇒ 点「下一页」整页刷新。
 */

export const revalidate = 604800; // = DEVELOPERS_PAGE_REVALIDATE_SECONDS(lib/server/developers.ts)；Next 的段配置只认字面量，别改回常量导入

type Props = { params: Promise<{ locale: string; n: string }> };

async function args({ params }: Props) {
  const { n } = await params;
  return { params, searchParams: Promise.resolve({ page: n }) };
}

export async function generateMetadata(props: Props) {
  return metadata(await args(props));
}

export default async function StaticPage(props: Props) {
  return Page(await args(props));
}
