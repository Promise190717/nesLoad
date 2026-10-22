import Page, { generateMetadata as metadata } from '@/lib/server/pages/developer';

/*
 * 页面级缓存已撤掉（2026-10-22 迁 Vercel）。
 *
 * 这里曾经用 `generateStaticParams` 把 269 家开发商 × 英文/中文在构建期预渲染 ——
 * sitemap 里列着全部开发商，爬虫扫到谁就现场渲染谁，而 Cloudflare 免费版
 * 每请求只有 10ms CPU，必然 1102。迁 Vercel 后这个前提不存在了，一并删掉。
 * 取数仍走 `listDevelopersCached` / `getDeveloperCached`（7 天）。
 */
export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ locale: string; id: string }> };
export function generateMetadata(props: Props) { return metadata(props); }
export default function StaticPage(props: Props) { return Page({ ...props, searchParams: Promise.resolve({}) }); }
