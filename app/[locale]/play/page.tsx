import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SITE_NAME, alternatesFor, localePath, ogLocale, otherLocales, translate } from '@/lib/i18n';
import { readLocaleParam } from '@/lib/server/locale';
import StaticPlay from '@/components/StaticPlay';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await readLocaleParam(params);
  const title = translate(locale, 'seo.play.title');
  const description = translate(locale, 'seo.play.description');
  return { title, description, alternates: alternatesFor(locale, '/play'), openGraph: {
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
