import Page, { generateMetadata as metadata } from '@/lib/server/pages/console';
import { CONSOLE_TYPES } from '@/lib/consoles';
import { PRERENDER_LOCALES } from '@/lib/i18n';

/*
 * 构建期预渲染机种页（2026-10-22 加，为压住免费版 10ms CPU 的 1102）。
 *
 * 这一页同时是「机种浏览第 1 页」，**并且写在 sitemap 里**，爬虫会主动来抓。
 * 原来没有 `generateStaticParams`，每条具体路径都是 on-demand ISR ——
 * 爬虫第一次抓 14 个机种就是 14 次现场 SSR，每次都是几十到几百毫秒 CPU，
 * 而免费版每请求只有 10ms，于是必炸。
 *
 * 数量很小（14 台 × 预渲染语言），构建几乎无感。
 * ⚠️ 机种清单**只从 `CONSOLE_TYPES` 取**，别在这里手抄数组 —— 那是全站唯一出口。
 */
export async function generateStaticParams() {
  return PRERENDER_LOCALES.flatMap((locale) =>
    CONSOLE_TYPES.map((id) => ({ locale, id }))
  );
}

export const revalidate = 2592000;
type Props = { params: Promise<{ locale: string; id: string }> };
export function generateMetadata(props: Props) { return metadata({ ...props, searchParams: Promise.resolve({}) }); }
export default function StaticPage(props: Props) { return Page({ ...props, searchParams: Promise.resolve({}) }); }
