import { redirect } from 'next/navigation';
import Page, { generateMetadata as metadata } from '@/lib/server/pages/games';
import { localePath } from '@/lib/i18n';
import { readLocaleParam } from '@/lib/server/locale';

/**
 * `/games/search?q=…&console=…&page=…` —— 搜索结果的**独立路由**（2026-10-20）。
 *
 * 为什么把搜索从 `/games?q=` 里摘出来：
 *   · 关键词是任意用户输入（空格、斜杠、超长串），塞进路径段要么被 `%2F` 的编码规则咬到，
 *     要么得清洗字符集、把用户搜的东西改掉 —— 所以它留在 query 里；
 *   · 但落在 `/games` 上的 query 会被 `middleware` 的 `catalogRewrite` 改写成
 *     `/catalog/games/_/q%3D…` 这棵影子树，客户端软导航拿回来的 flight 对不上
 *     （历史上表现为「地址变了内容不动」）。单独一条路由之后，**这条路由本身就是动态的**
 *     （它按 query 渲染），同一路由上改 query 是软导航 ⇒ 搜完再翻页 / 换机种都不刷新。
 *
 * ⚠️ **必须 `force-dynamic`**：它靠 `searchParams` 渲染，不能被预渲染成一份「无关键词」的壳。
 * ⚠️ 没有关键词的 `/games/search` 就是「全部游戏」那份 —— 直接踢回浏览态，
 *    别让同一批内容挂两个地址。
 */

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** 没有关键词就回浏览态（第 1 页、不筛机种那份由页面自己算）。 */
async function requireKeyword({ params, searchParams }: Props) {
  const [locale, query] = await Promise.all([readLocaleParam(params), searchParams]);
  const keyword = typeof query.q === 'string' ? query.q.trim() : '';
  if (!keyword) redirect(localePath(locale, '/games'));
}

export function generateMetadata(props: Props) {
  return metadata(props);
}

export default async function SearchPage(props: Props) {
  await requireKeyword(props);
  return Page(props);
}
