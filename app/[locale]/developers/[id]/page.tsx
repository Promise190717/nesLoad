import Page, { generateMetadata as metadata } from '@/lib/server/pages/developer';

import { DEVELOPERS_PAGE_REVALIDATE_SECONDS } from '@/lib/server/developers';

/*
 * 页面级按需缓存（2026-10-24 恢复；构建期预渲染仍然不做）。
 *
 * 历史上曾用 `generateStaticParams` 把开发商页在构建期预渲染（sitemap 里列着全部
 * 开发商，爬虫扫到谁就现场渲染谁，而 Cloudflare 免费版每请求只有 10ms CPU），
 * 2026-10-22 迁 Vercel 时删掉。现在回到按需生成：首次访问渲染、之后走增量缓存，
 * 外面再叠一层 worker.ts 的 10 分钟边缘缓存（见 docs/cloudflare-deployment.md）。
 * 取数仍走 `listDevelopersCached` / `getDeveloperCached`（7 天）。
 */
export const revalidate = DEVELOPERS_PAGE_REVALIDATE_SECONDS;
type Props = { params: Promise<{ locale: string; id: string }> };
export function generateMetadata(props: Props) { return metadata(props); }
export default function StaticPage(props: Props) { return Page({ ...props, searchParams: Promise.resolve({}) }); }
