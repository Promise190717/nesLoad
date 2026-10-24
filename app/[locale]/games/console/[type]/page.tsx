import Page, { generateMetadata as metadata } from '@/lib/server/pages/games';

import { GAMES_PAGE_REVALIDATE_SECONDS } from '@/lib/server/sb-games';

/**
 * `/games/console/nes` —— 机种筛选从 `?console=nes` 搬进路径段（2026-10-20）。
 *
 * 和 `/games/page/[n]` 同一套壳：路径段 → `searchParams`，页面组件一行不改。
 * 新地址是真路由 ⇒ 点机种 tab 是软导航，不再整页刷新。
 * 改动的起因见 `lib/catalog-route.ts` 文件头。
 */

export const revalidate = GAMES_PAGE_REVALIDATE_SECONDS;

type Props = { params: Promise<{ locale: string; type: string }> };

async function args({ params }: Props) {
  const { type } = await params;
  return { params, searchParams: Promise.resolve({ console: type }) };
}

export async function generateMetadata(props: Props) {
  return metadata(await args(props));
}

export default async function StaticPage(props: Props) {
  return Page(await args(props));
}
