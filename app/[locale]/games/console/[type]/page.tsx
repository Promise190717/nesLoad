import Page, { generateMetadata as metadata } from '@/lib/server/pages/games';

/**
 * `/games/console/nes` —— 机种筛选从 `?console=nes` 搬进路径段（2026-10-20）。
 *
 * 和 `/games/page/[n]` 同一套壳：路径段 → `searchParams`，页面组件一行不改。
 * 新地址是真路由 ⇒ 点机种 tab 是软导航，不再整页刷新。
 * 改动的起因见 `lib/catalog-route.ts` 文件头。
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

type Props = { params: Promise<{ locale: string; type: string }> };

async function args({ params }: Props) {
  const { type } = await params;
  return { params, searchParams: Promise.resolve({ console: type }) };
}

export async function generateMetadata(props: Props) {
  return metadata(await args(props));
}

export default async function StaticPage(props: Props) {
  return Page(await args(props));
}
