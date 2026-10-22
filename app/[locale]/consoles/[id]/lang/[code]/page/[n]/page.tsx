import Page, { generateMetadata as metadata } from '@/lib/server/pages/console';

/**
 * `/consoles/nds/lang/zh/page/2` —— 语种筛选 + 分页的组合（2026-10-20）。
 *
 * 段序固定 `lang` → `page`，与 `consoleHref` 的拼法一致（少一条组合地址，
 * 「筛着日本語翻页」就只能退回带查询参数那份、又变回整页刷新）。
 */

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string; id: string; code: string; n: string }> };

async function args({ params }: Props) {
  const { code, n } = await params;
  return { params, searchParams: Promise.resolve({ lang: code, page: n }) };
}

export async function generateMetadata(props: Props) {
  return metadata(await args(props));
}

export default async function StaticPage(props: Props) {
  return Page(await args(props));
}
