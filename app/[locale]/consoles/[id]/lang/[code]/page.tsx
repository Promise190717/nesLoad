import Page, { generateMetadata as metadata } from '@/lib/server/pages/console';

import { CONSOLES_PAGE_REVALIDATE_SECONDS } from '@/lib/server/consoles';

/**
 * `/consoles/nds/lang/zh` —— 语种筛选从 `?lang=zh` 搬进路径段（2026-10-20）。
 *
 * 这一条是用户点名的那颗 tab：它原来是 `/consoles/nds?lang=zh`，被 `catalogRewrite`
 * 改写成影子路由，客户端软导航对不上 ⇒ 点一下整页刷新。进路径后是真路由，恢复软导航。
 */

export const revalidate = CONSOLES_PAGE_REVALIDATE_SECONDS;

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
