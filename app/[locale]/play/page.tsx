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
 * ⚠️ **必须动态渲染，不能预渲染（2026-10-19）**。
 *
 * 这一页没有数据、没有 revalidate，Next 于是把它当永久静态页，输出
 * `Cache-Control: s-maxage=31536000, stale-while-revalidate=2592000`
 * —— 也就是 **HTML 在 CDN 上挂一年**，而它引用的 `_next/static/chunks/*.js`
 * 每次发版都会换名字（内容 hash）。
 *
 * 线上踩到的样子：发版后 HTML 还是旧的，指向的 chunk 已经被新部署替换掉，
 * 于是 Next 客户端判定「chunk 加载失败」→ 自动 `location.reload()` → 还是旧 HTML
 * → 再失败，**变成无限刷新**；偶尔还能拿到一个「名字没变、内容偏旧」的 chunk，
 * 表现成 `(0, h.v) is not a function` / `Right-hand side of 'instanceof' is not an object`
 * （新代码调用了旧 chunk 里没有的导出）。
 *
 * 这一页的 HTML 只是一个空壳（`StaticPlay` 是客户端组件），预渲染省不下什么；
 * 换成每次渲染反而几毫秒就出来。别为了这点收益把部署后的页面钉死在一年前的版本上。
 */
export const dynamic = 'force-dynamic';

export default function Page() {
  return <Suspense fallback={null}><StaticPlay /></Suspense>;
}
