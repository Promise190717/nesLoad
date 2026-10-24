import Page, { generateMetadata as metadata } from '@/lib/server/pages/console';

/*
 * 页面级按需缓存（2026-10-24 恢复；构建期预渲染仍然不做）。
 *
 * 历史上曾用 `generateStaticParams` 把机种页在构建期预渲染（为压住 Cloudflare
 * 免费版 10ms CPU 的 1102），2026-10-22 迁 Vercel 时删掉。现在回到按需生成：
 * 首次访问现场渲染并写入增量缓存，之后由 `enableCacheInterception` 直接返回，
 * 外面再叠一层 worker.ts 的 10 分钟边缘缓存（见 docs/cloudflare-deployment.md）。
 * 取数仍走 `listConsolesCached`（7 天）。
 */
export const revalidate = 604800; // = CONSOLES_PAGE_REVALIDATE_SECONDS(lib/server/consoles.ts)；Next 的段配置只认字面量，别改回常量导入
type Props = { params: Promise<{ locale: string; id: string }> };
export function generateMetadata(props: Props) { return metadata({ ...props, searchParams: Promise.resolve({}) }); }
export default function StaticPage(props: Props) { return Page({ ...props, searchParams: Promise.resolve({}) }); }
