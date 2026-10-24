import Page, { generateMetadata as metadata } from '@/lib/server/pages/console';

import { CONSOLES_PAGE_REVALIDATE_SECONDS } from '@/lib/server/consoles';

/**
 * `/consoles/nds/page/2` —— 机种页分页进路径（2026-10-20）。
 *
 * 与 `/games/page/[n]` 同一个壳：段值塞进 `searchParams`，页面组件不动。
 * 起因见 `lib/catalog-route.ts` 文件头。
 */

export const revalidate = CONSOLES_PAGE_REVALIDATE_SECONDS;

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
