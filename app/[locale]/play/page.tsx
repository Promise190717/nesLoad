import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SITE_NAME, alternatesFor, localePath, ogLocale, otherLocales, translate } from '@/lib/i18n';
import { readLocaleParam } from '@/lib/server/locale';
import StaticPlay from '@/components/StaticPlay';
/*
 * 裸 `/play`（2026-11-17 起角色收窄）：开一款**库里已有**的游戏去 `/games/<id>/play`
 * （路径化迁移，见那条路由的文件头），这一页只剩两个没有游戏上下文的入口 ——
 * 首页「加入房间」表单（`/play?room=<码>`）和本机文件开 ROM。
 * 带 `?id=` 的旧深链由 middleware 301 到新路由，这里不再服务「按 id 开玩」。
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await readLocaleParam(params);
  const title = translate(locale, 'seo.play.title');
  const description = translate(locale, 'seo.play.description');
  /*
   * noindex（2026-11-16）：这一页的 HTML 是空壳（正文只有一块 canvas，文案全靠客户端
   * 挂载），被收录就是给 Google 的「低价值内容」评分喂薄页 —— AdSense 那次判词之后的
   * 收缩动作之一，sitemap 同步移出（见 app/sitemap.ts 顶上那段）。
   * `follow: true` 保留：页面上的链接（顶栏 / 返回）照常可被顺着走。
   * ⚠️ robots.txt 别加 Disallow：挡掉抓取就连 noindex 一起挡了，已收录的地址收不回去。
   */
  return { title, description, robots: { index: false, follow: true }, alternates: alternatesFor(locale, '/play'), openGraph: {
    type: 'website', url: localePath(locale, '/play'), siteName: SITE_NAME[locale], title, description,
    locale: ogLocale(locale), alternateLocale: otherLocales(locale).map(ogLocale),
  } };
}
/*
 * 按需 ISR（2026-11-03 从 `force-dynamic` 改回）。
 *
 * 这一页的 HTML 只是一个空壳（`StaticPlay` 是客户端组件），`id` / `room` / `lang`
 * 三个参数全由客户端读 —— 服务端渲染结果对同一个语言**逐字节相同**，
 * 是这条线上最不该逐请求渲染的一页。而它恰恰是访问量最大的一页：
 * 每个玩家每次开一局都要过一次，`force-dynamic` 等于把最热的请求钉死在
 * 免费版 10ms CPU 的现场渲染上。
 *
 * 以前写 `force-dynamic` 是为了躲「HTML 在 CDN 上钉一年 → 发版后指向已换掉的 chunk
 * → 无限刷新」那个循环。现在那个循环有两道保险：
 *   · `/_next/static/*` 是 `max-age=0, must-revalidate`（next.config.js）；
 *   · OpenNext 增量缓存的 key 里带 `OPEN_NEXT_BUILD_ID`，新版本上线即换一套缓存。
 * 另外 `worker.ts` 还会把 `/play` 的查询串整个剥掉再当缓存键 —— 同一份空壳
 * 不会因为 `?id=` 不同而存几十遍。
 */
export const revalidate = 604800;

export default function Page() {
  return <Suspense fallback={null}><StaticPlay /></Suspense>;
}
