import Page, { generateMetadata as metadata } from '@/lib/server/pages/games';

/**
 * `/games/console/nes/page/2` —— 机种筛选 + 分页的组合（2026-10-20）。
 *
 * 两个维度都进路径后必须有一个组合地址，否则「筛着 NES 翻页」只能退回带查询参数的那份，
 * 又变成整页刷新。段序固定 `console` → `page`，与 `gamesHref` 的拼法一字不差。
 */

export const revalidate = 604800; // = GAMES_PAGE_REVALIDATE_SECONDS(lib/server/sb-games.ts)；Next 的段配置只认字面量，别改回常量导入

/*
 * 动态段要进按需 ISR 必须有这个钩子：返回空数组 = 构建期一个参数组合都不预渲染，
 * 未知参数在运行时首次访问时生成并写入增量缓存（相当于 fallback: 'blocking'）。
 * 没有它，这条路由永远逐请求渲染（免费版 10ms CPU 必超限），Cache-Control 也是
 * private, no-cache（2026-10-24 踩过：只写 revalidate 时 /games/[id] 就是这个表现）。
 */
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

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
