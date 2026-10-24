import Page, { generateMetadata as metadata } from '@/lib/server/pages/games';

/**
 * `/games/console/nes/page/2` —— 机种筛选 + 分页的组合（2026-10-20）。
 *
 * 两个维度都进路径后必须有一个组合地址，否则「筛着 NES 翻页」只能退回带查询参数的那份，
 * 又变成整页刷新。段序固定 `console` → `page`，与 `gamesHref` 的拼法一字不差。
 */

export const revalidate = 604800; // = GAMES_PAGE_REVALIDATE_SECONDS(lib/server/sb-games.ts)；Next 的段配置只认字面量，别改回常量导入

type Props = { params: Promise<{ locale: string; type: string; n: string }> };

async function args({ params }: Props) {
  const { type, n } = await params;
  return { params, searchParams: Promise.resolve({ console: type, page: n }) };
}

export async function generateMetadata(props: Props) {
  return metadata(await args(props));
}

export default async function StaticPage(props: Props) {
  return Page(await args(props));
}
