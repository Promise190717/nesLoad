import Page, { generateMetadata as metadata } from '@/lib/server/pages/games';

/**
 * `/games/page/2` —— 分页从 `?page=2` 搬进路径段（2026-10-20）。
 *
 * 为什么要这一层壳：页面组件读的是 `searchParams`（解析、非规范收敛、canonical 都在里面，
 * 一行都不想复制两份），这里只把**路径段**翻译成同一份形状。于是 `/games/page/2` 与老的
 * `/games?page=2` 走同一条渲染路径，而新地址是**真路由** —— `middleware` 不再把它改写成
 * `/catalog/...` 那棵影子树，客户端软导航拿到的 flight 才对得上。
 * 改动的起因见 `lib/catalog-route.ts` 文件头。
 */

export const revalidate = 604800; // = GAMES_PAGE_REVALIDATE_SECONDS(lib/server/sb-games.ts)；Next 的段配置只认字面量，别改回常量导入

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
