import Page, { generateMetadata as metadata } from '@/lib/server/pages/developer';

/**
 * `/developers/nintendo/page/2` —— 开发商详情页「他名下的游戏」分页进路径（2026-10-20）。
 *
 * 段序就是 `[id]` → `page` → `[n]`：`[id]` 是开发商 slug，后面两层是分页。
 * 和列表页同一条规矩 —— 真路由才能软导航（起因见 `lib/catalog-route.ts` 文件头）。
 */

export const revalidate = 604800; // = DEVELOPERS_PAGE_REVALIDATE_SECONDS(lib/server/developers.ts)；Next 的段配置只认字面量，别改回常量导入

type Props = { params: Promise<{ locale: string; id: string; n: string }> };

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
