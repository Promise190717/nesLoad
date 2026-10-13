import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n';

/**
 * `[locale]` 段 —— 前台的**所有页面**都住在这里（后台 `/admin` 与 `/api` 不在）。
 *
 * 它自己几乎不做事（不渲染任何 DOM），存在是为了两件：
 *   1. 让「语言」成为一个真正的**路由参数**：页面直接 `params.locale` 取，
 *      不再靠请求头或 cookie 猜；
 *   2. 在唯一的入口处校验它 —— 见下面。
 *
 * **为什么还要校验**：middleware 保证了走到这儿的只有 `en` / `zh`（无前缀会被
 * rewrite 成 `/en/...`，中文必须带 `/zh`），但 `[locale]` 是个动态段，
 * Next 对它的取值没有任何约束 —— 万一 matcher 哪天被改窄，`/de/games` 会直接把
 * `de` 当语言传下来，而 `translate('de', …)` 会在运行时炸在 `messages['de'][key]` 上
 * （`Record<Locale, …>` 只在编译期拦得住自己人，拦不住 URL）。
 *
 * ⚠️ 这个 `notFound()` 会落到 **`app/not-found.tsx`**（本段内没有 not-found，
 * Next 往上找一层）—— 那里用 `readLocale()` 取语言，而 middleware 已经按路径
 * 把语言写进请求头了，所以 404 页的语言也是对的。
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <>{children}</>;
}
