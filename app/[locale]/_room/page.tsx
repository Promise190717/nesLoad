/*
 * ⚠️ 这一页**已下线**（2026-10-21 用户要求永久停用）。
 *
 * 目录名前缀 `_` 让 Next 把整个文件夹当私有目录，**不注册路由** —— `/room` 现在
 * 没有任何入口，也没有任何地址能打开它。代码留着纯粹是为了那套满屏像素屋的视觉与
 * 交互实现（`components/ConsoleScene.tsx`），将来若要做回来，把目录名改回 `room` 即可。
 *
 * 不要再往站里加 `/room` 的入口，也不要把它写进 sitemap / ai-policy。
 */
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SITE_NAME, alternatesFor, localePath, ogLocale, otherLocales, translate } from '@/lib/i18n';
import { readLocaleParam } from '@/lib/server/locale';
import ConsoleScene from '@/components/ConsoleScene';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await readLocaleParam(params);
  const title = translate(locale, 'seo.room.title');
  const description = translate(locale, 'seo.room.description');
  return { title, description, alternates: alternatesFor(locale, '/room'), openGraph: {
    type: 'website', url: localePath(locale, '/room'), siteName: SITE_NAME[locale], title, description,
    locale: ogLocale(locale), alternateLocale: otherLocales(locale).map(ogLocale),
  } };
}
/*
 * 和 `/play` 同一条规矩：这一页是客户端壳，被 Next 当永久静态页输出
 * `s-maxage=31536000`，等于把 HTML 在 CDN 上钉一年 —— 发版后旧 HTML 指向
 * 已被替换掉的 chunk，客户端就进「加载失败 → 自动刷新 → 还是旧 HTML」的循环。
 * 完整来龙去脉见 `app/[locale]/play/page.tsx` 上面那段。
 */
export const dynamic = 'force-dynamic';

export default function Page() {
  return <Suspense fallback={null}><ConsoleScene /></Suspense>;
}
