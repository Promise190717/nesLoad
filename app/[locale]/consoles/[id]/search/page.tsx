import { redirect } from 'next/navigation';
import Page, { generateMetadata as metadata } from '@/lib/server/pages/console';
import { localePath } from '@/lib/i18n';
import { readLocaleParam } from '@/lib/server/locale';

/**
 * `/consoles/nds/search?q=…&lang=…&page=…` —— 机种页里的搜索结果（2026-10-20）。
 *
 * 和 `/games/search` 同一套理由（见那边文件头）：关键词留 query、单独一条动态路由，
 * 这样「搜完再翻页 / 换语种」是软导航而不是整页刷新。
 *
 * ⚠️ `force-dynamic`：靠 `searchParams` 渲染，不能预渲染成无关键词的壳。
 * ⚠️ 没有关键词就回机种页的浏览态（`/consoles/nds`）。
 */

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function requireKeyword({ params, searchParams }: Props) {
  const [locale, id, query] = await Promise.all([
    readLocaleParam(params),
    params.then((p) => p.id),
    searchParams,
  ]);
  const keyword = typeof query.q === 'string' ? query.q.trim() : '';
  if (!keyword) redirect(localePath(locale, `/consoles/${id}`));
}

export function generateMetadata(props: Props) {
  return metadata(props);
}

export default async function SearchPage(props: Props) {
  await requireKeyword(props);
  return Page(props);
}
