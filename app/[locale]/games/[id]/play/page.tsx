import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { SITE_NAME, alternatesFor, localePath, ogLocale, otherLocales, translate } from '@/lib/i18n';
import { getGameCached, localizeGame } from '@/lib/server/sb-games';
import { readLocaleParam } from '@/lib/server/locale';
import StaticPlay from '@/components/StaticPlay';

/**
 * `/games/[id]/play` —— 开局页（2026-11-17 从 `/play?id=` 路径化迁来）。
 *
 * id 进了路径段，服务端**第一次知道自己在开哪一款**：metadata 能真正按游戏出标题
 * （空壳时代标题全靠客户端补写，见 `StaticPlay` 里的那段）。noindex 性质不变 ——
 * 正文还是只有一块 canvas（`StaticPlay` 是客户端组件），被收录仍是薄页，
 * sitemap 也照旧不列（见 app/sitemap.ts 顶上「薄壳页」那段）。
 *
 * 为什么还是空壳 + 按需 ISR：正文对同一个 id + 语言逐字节相同，`room` / `mode` /
 * `lang` 三个参数全由客户端读。查询串不进缓存键（`worker.ts` 把它们整个剥掉，
 * 否则每个房间码都存一份 HTML）；`<id>` 那段**不折叠** —— 标题里带游戏名之后
 * HTML 已经逐 id 不同，下载页那种按语言折叠（`downloadKeyPath`）在这里做不到。
 * 副本量从「每语言 1 份」变成「每 id × 语言 1 份」，都是几 KB 的空壳，量级可接受。
 *
 * ⚠️ 裸 `/play`（不带 id）**仍然保留**：首页「加入房间」表单和本机文件入口没有
 * 游戏上下文，到不了这条带 id 的路由。带 id 的旧深链由 middleware 301 到这里
 * （见 middleware.ts `publicRoute` 里那段）。
 */
const loadGame = cache(async (id: string, locale: string) => getGameCached(id, locale));

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const locale = await readLocaleParam(params);
  const { id } = await params;
  const game = await loadGame(id, locale);
  /* 查无此款时兜回默认标题 —— 正文那边会 notFound()，这里只是别让 404 页缺标题。 */
  const title = game ? localizeGame(game, locale).title : translate(locale, 'seo.play.title');
  const description = translate(locale, 'seo.play.description');
  /*
   * noindex（2026-11-16 起，原 `/play` 页的判词原样带来）：这一页的 HTML 是空壳
   * （正文只有一块 canvas，文案全靠客户端挂载），被收录就是给 Google 的
   * 「低价值内容」评分喂薄页 —— AdSense 那次判词之后的收缩动作之一。
   * `follow: true` 保留：页面上的链接（顶栏 / 返回）照常可被顺着走。
   * ⚠️ robots.txt 别加 Disallow：挡掉抓取就连 noindex 一起挡了，已收录的地址收不回去。
   */
  return { title, description, robots: { index: false, follow: true }, alternates: alternatesFor(locale, `/games/${id}/play`), openGraph: {
    type: 'website', url: localePath(locale, `/games/${id}/play`), siteName: SITE_NAME[locale], title, description,
    locale: ogLocale(locale), alternateLocale: otherLocales(locale).map(ogLocale),
  } };
}

/*
 * 按需 ISR（和旧 `/play` 同一个理由）：这一页是访问量最大的一页，每个玩家每次
 * 开一局都要过一次，`force-dynamic` 等于把最热的请求钉死在免费版 10ms CPU 上。
 * 发版后的「HTML 指向已换掉的 chunk」循环有两道保险：
 *   · `/_next/static/*` 是 `max-age=0, must-revalidate`（next.config.js）；
 *   · OpenNext 增量缓存的 key 里带 `OPEN_NEXT_BUILD_ID`，新版本上线即换一套缓存。
 */
export const revalidate = 604800;

export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const locale = await readLocaleParam(params);
  const { id } = await params;
  /*
   * 查无此款直接 404：这条地址只该由详情页 / 分享链接到达，乱造的 id 不值得给它
   * 留一个能被缓存的空壳（404 也进 worker 缓存 1 小时，正好挡扫描器）。
   * 「不认识 id 也照常服务」的入口是裸 `/play`，两个地址各司其职。
   */
  if (!(await loadGame(id, locale))) notFound();
  return <StaticPlay gameId={id} />;
}
