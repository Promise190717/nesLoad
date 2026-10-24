import Page, { generateMetadata as metadata } from '@/lib/server/pages/console';

/**
 * `/consoles/nds/lang/zh` —— 语种筛选从 `?lang=zh` 搬进路径段（2026-10-20）。
 *
 * 这一条是用户点名的那颗 tab：它原来是 `/consoles/nds?lang=zh`，被 `catalogRewrite`
 * 改写成影子路由，客户端软导航对不上 ⇒ 点一下整页刷新。进路径后是真路由，恢复软导航。
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

type Props = { params: Promise<{ locale: string; id: string; code: string }> };

async function args({ params }: Props) {
  const { code } = await params;
  return { params, searchParams: Promise.resolve({ lang: code }) };
}

export async function generateMetadata(props: Props) {
  return metadata(await args(props));
}

export default async function StaticPage(props: Props) {
  return Page(await args(props));
}
