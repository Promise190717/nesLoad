import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SITE_NAME, alternatesFor, localePath, ogLocale, otherLocales, translate } from '@/lib/i18n';
import { readLocaleParam } from '@/lib/server/locale';
import StaticPlay from '@/components/StaticPlay';

/**
 * `/games/[id]/play` —— 开局页（2026-11-17 从 `/play?id=` 路径化迁来）。
 *
 * 🔴 **2026-11-21：这一页的服务端输出改成「与 id 无关」了，不要往回加。**
 *
 * 起因是 CF 日志：45 次 1102 里有 18 次落在这一族，全是最冷的那次渲染被 CPU 砍掉。
 * 病根是「2110 款 × 18 语言 = 3.8 万条 URL，每条都要先有一次成功的完整 SSR 才进得了
 * 缓存」，而一次 SSR 要 100–500ms CPU，砍了就没有副本，那条地址从此永远冷。
 *
 * 所以现在的分工：
 *   · **服务端**只输出一份逐语言相同的空壳 —— 没有游戏名（`seo.play.title`）、
 *     没有带 id 的 canonical / hreflang、不查库、不判 404；
 *   · **id 由客户端读**：`StaticPlay` 挂载后从 `usePathname()` 里剥出 `<id>`，
 *     再去 `/api/games/<id>` 取资料、写 `document.title`。
 *   于是 `worker.ts` 能把缓存键折叠成 `/<locale>/__nesload_play`（见 `playKeyPath`），
 *   3.8 万条 URL 共用 18 份副本，一次渲染成功就全语言恒热。
 *
 * 代价（已知并接受）：
 *   · 标签页标题先通用、几百毫秒后才变成游戏名（`StaticPlay` 里那段 effect）；
 *   · 乱造的 id 不再 404 —— 空壳照发，客户端取不到资料就是「查无此款」的表现。
 *
 * ⚠️ 正文挂在 `<Suspense fallback={null}>` 里是**必须的**：`StaticPlay` 用了
 *    `useSearchParams()`（`room` / `mode` / `lang`），静态渲染的页面必须给它一个
 *    边界，否则构建直接报错。裸 `/play` 一直是这个写法（见那条路由），
 *    两页现在的形态一致：HTML 是空壳，正文全靠客户端。
 *
 * noindex 性质不变（2026-11-16 起）：正文只有一块 canvas，被收录就是给 Google 的
 * 「低价值内容」评分喂薄页。`follow: true` 保留 —— 页内链接照常可被顺着走。
 * sitemap 也照旧不列（见 app/sitemap.ts 顶上「薄壳页」那段）。
 *
 * canonical 只能指 `/play`（这一族现在的公共地址）：它不能再带 id，否则 HTML 又
 * 逐 id 不同、折叠就白做了。noindex 页上 canonical 本来就被引擎忽略，这样写只是
 * 为了不继承根布局那份 `/`。
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await readLocaleParam(params);
  const title = translate(locale, 'seo.play.title');
  const description = translate(locale, 'seo.play.description');
  return {
    title,
    description,
    robots: { index: false, follow: true },
    alternates: alternatesFor(locale, '/play'),
    openGraph: {
      type: 'website',
      url: localePath(locale, '/play'),
      siteName: SITE_NAME[locale],
      title,
      description,
      locale: ogLocale(locale),
      alternateLocale: otherLocales(locale).map(ogLocale),
    },
  };
}

/*
 * 按需 ISR：这一页现在是纯空壳（服务端不查库、不读 cookie），渲染成本只剩
 * 「铺一次 Suspense 边界 + 布局」。`revalidate` 留着是为了让 R2 那份最多 30 天
 * 自然重写一次，和别的内容页同一口径（见 lib/server/sb-games.ts 顶上那段）。
 * 真正决定线上命中率的是 `worker.ts` 的折叠键，不是这里。
 */
export const revalidate = 2592000;

export default function Page() {
  return (
    <Suspense fallback={null}>
      <StaticPlay />
    </Suspense>
  );
}
