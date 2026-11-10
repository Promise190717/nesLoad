import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import PlayScene from '@/components/PlayScene';
import { SITE_NAME, localePath, translate } from '@/lib/i18n';
import { readLocaleParam } from '@/lib/server/locale';
import { getGameCached, localizeGame } from '@/lib/server/sb-games';

/**
 * `/embed/games/<id>` —— 给第三方网站 iframe 的**纯播放页**（2026-11-10 加）。
 *
 * 详情页那块「嵌入此游戏」给出的地址就是它：复制回去贴进对方站点的 HTML，
 * 访客在对方页面上直接玩，不再跳回本站。
 *
 * ## 刻意的事
 *
 * - **没有 `GamesShell`**：顶栏、返回、页脚、主题切换全不要。嵌入方要的是一块
 *   屏幕，不是一整站。外层只给一个黑底 `<main>`，其余交给 `PlayScene` 的
 *   `embed` 模式（它同时不画右栏，见那个 prop 的注释）。
 * - **`noindex, follow` + canonical 指回详情页**：这一页是同一款游戏的第二种排版，
 *   让它自己参与排名只会和详情页抢同一个词。canonical 明确说「正主是
 *   `/games/<id>`」，索引权归那边。
 * - **按需 ISR 7 天**：嵌入页会被很多第三方页面引用，每次请求现场查库毫无意义；
 *   数据变化靠后台的 `revalidateTag('games')` 失效（和详情页同一条路）。
 * - **`autoStart`**：嵌入方已经用 iframe 表达了「我要玩这一款」，再让访客点一次
 *   「开始」是多余的。真正的用户手势（键盘 / 手柄）在画面出来后自然发生。
 *
 * ⚠️ 这一页**不做任何防嵌入限制**（没有 `X-Frame-Options` / CSP `frame-ancestors`，
 *    全站本来就没设）。要收回这个能力时，改的是嵌入代码那一块，不是这里。
 */
export const revalidate = 604800;
/** 动态段按需生成（理由同详情页：构建期不预渲染任何一款）。 */
export const dynamicParams = true;

/** 同一次渲染里 metadata 和正文共用一次查询 —— `getGameCached` 自己也有缓存，这层省的是重复调用。 */
const loadGame = cache(async (id: string, locale: string) => getGameCached(id, locale));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const locale = await readLocaleParam(params);
  const game = await loadGame(id, locale);

  /*
   * 查不到时**不抛 404**（那是页面正文的事）：这里只把索引关掉。
   * 在 metadata 里 notFound 会让 `<head>` 也走 404 那条路，而嵌入页的 head
   * 本来就没有可索引内容，多一层没有意义。
   */
  if (!game) return { robots: { index: false, follow: false } };

  const text = localizeGame(game, locale);
  return {
    title: text.title,
    description: translate(locale, 'seo.play.description'),
    /* 嵌入页不参与排名，但跟着它走能到详情页，所以 follow 保留 */
    robots: { index: false, follow: true },
    alternates: { canonical: localePath(locale, `/games/${id}`) },
    openGraph: {
      type: 'website',
      title: text.title,
      siteName: SITE_NAME[locale],
      url: localePath(locale, `/embed/games/${id}`),
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const locale = await readLocaleParam(params);
  const game = await loadGame(id, locale);
  if (!game) notFound();

  return (
    <main className="min-h-dvh bg-black">
      {/*
        `serverGame` 直接把服务端那份 `Game` 传下去：它的字段是 `LibraryGame` 的超集
        （`players` / `tags` 只在详情页用），`PlayScene` 读的那几项一个不少 ——
        省掉一次客户端 `/api/games/<id>` 往返。
      */}
      <PlayScene serverGame={game} autoStart initialMode="solo" embed />
    </main>
  );
}
