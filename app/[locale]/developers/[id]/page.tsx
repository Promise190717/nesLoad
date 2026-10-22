import Page, { generateMetadata as metadata } from '@/lib/server/pages/developer';
import { listDeveloperStubs } from '@/lib/server/developers';
import { PRERENDER_LOCALES } from '@/lib/i18n';

/*
 * 构建期预渲染开发商页（2026-10-22 加，为压住免费版 10ms CPU 的 1102）。
 *
 * 和详情页同一条理由：没有它，每家开发商的页面都是 on-demand ISR，
 * 而 sitemap 里**列着全部 269 家**，爬虫扫到谁就现场渲染谁，免费版 10ms 必炸。
 * 269 × 预渲染语言 ≈ 538 页，构建增量很小。
 *
 * ⚠️ 读库失败返回空数组：退化成原来的 on-demand，不让整次部署失败。
 */
export async function generateStaticParams() {
  try {
    const stubs = await listDeveloperStubs();
    return stubs.flatMap((stub) =>
      PRERENDER_LOCALES.map((locale) => ({ locale, id: stub.id }))
    );
  } catch (error) {
    console.error('[developers/[id]] 读取预渲染清单失败，本次不预渲染', error);
    return [];
  }
}

export const revalidate = 2592000;
type Props = { params: Promise<{ locale: string; id: string }> };
export function generateMetadata(props: Props) { return metadata(props); }
export default function StaticPage(props: Props) { return Page({ ...props, searchParams: Promise.resolve({}) }); }
