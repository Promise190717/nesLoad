import Page, { generateMetadata as metadata } from '@/lib/server/pages/console';

/**
 * `/consoles/nds/page/2` —— 机种页分页进路径（2026-10-20）。
 *
 * 与 `/games/page/[n]` 同一个壳：段值塞进 `searchParams`，页面组件不动。
 * 起因见 `lib/catalog-route.ts` 文件头。
 */

export const revalidate = 604800; // = CONSOLES_PAGE_REVALIDATE_SECONDS(lib/server/consoles.ts)；Next 的段配置只认字面量，别改回常量导入

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
