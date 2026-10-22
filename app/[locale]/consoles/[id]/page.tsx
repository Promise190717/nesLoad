import Page, { generateMetadata as metadata } from '@/lib/server/pages/console';

/*
 * 页面级缓存已撤掉（2026-10-22 迁 Vercel）。
 *
 * 这里曾经用 `generateStaticParams` 把 14 台机种 × 英文/中文在构建期预渲染，
 * 为的是让爬虫第一次抓 sitemap 里的机种页时不现场 SSR（Cloudflare 免费版 10ms CPU）。
 * 迁 Vercel 后那个前提消失了，预渲染只剩构建成本，一并删掉。
 * 取数仍走 `listConsolesCached`（7 天）。
 */
export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ locale: string; id: string }> };
export function generateMetadata(props: Props) { return metadata({ ...props, searchParams: Promise.resolve({}) }); }
export default function StaticPage(props: Props) { return Page({ ...props, searchParams: Promise.resolve({}) }); }
