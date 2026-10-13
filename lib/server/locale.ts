import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_HEADER, isLocale, type Locale } from '../i18n';

/*
 * 「当前这次请求该用哪种语言」。
 *
 * 2026-10-13 起语言是**路径说了算**（英文无前缀、中文 `/zh`），而前缀的搬运在
 * middleware 里 —— 它把结果写进请求头，这里只负责把它读出来。所以**首屏的
 * 语言不再靠猜**：`/zh/games` 一定是中文，跟 cookie、浏览器设置都无关。
 *
 * 页面自己该用 `readLocaleParam(params)`（`app/[locale]/` 给的路由参数，更显式）；
 * 这个函数留给**拿不到路由参数的三处**：
 *   · 根布局 `app/layout.tsx` —— 它在 `[locale]` 段外面，却要出 `<html lang>`、
 *     canonical、hreflang；
 *   · 后台 `app/admin/layout.tsx` —— 后台不做语言前缀，语言由 cookie（没设置过
 *     就按浏览器）定，middleware 在守卫分支里已经把它算好写进同一个头了；
 *   · `app/not-found.tsx` 与两个 `[id]/not-found.tsx` —— 404 拿不到 params。
 *
 * ⚠️ **兜底链里刻意没有 Accept-Language**（2026-10-13 用户定：「没有主动设置过，
 * 访问哪个就是哪个，不要跳转」）。所以整个系统的规则可以一句话说完：
 *
 *   语言只由**路径**或**用户主动设置的 cookie** 决定；
 *   浏览器语言只在**客户端弹窗**里用一次（问用户要不要切，`LocalePrompt`），
 *   绝不自动生效。
 *
 * 兜底到 `DEFAULT_LOCALE`（英文）**理论上跑不到**：middleware 的 matcher 覆盖了
 * 所有页面路径。留着是因为它是零成本的保险 —— matcher 哪天被改窄了，页面会退回成
 * 英文，而不是所有中文用户一起看到英文。唯一真正会走到它的地方是
 * `app/opengraph-image.tsx` / `app/twitter-image.tsx`（分享图，被 matcher 排除，
 * 见 middleware.ts），那里拿到的就是英文 —— 也对，图上本来只有英文。
 *
 * 代价和以前一样：**用它的路由都会变成动态渲染**（cookies() / headers() 会退出
 * 静态渲染）。首页本来就要读语言，后台本来就要读 cookie 判登录，两边都不亏。
 * 但这意味着这里**不能**被任何客户端组件 import —— next/headers 在浏览器里不存在。
 * 所以它待在 lib/server/ 而不是 lib/ 下。
 */
export async function readLocale(): Promise<Locale> {
  const [headerList, cookieStore] = await Promise.all([headers(), cookies()]);

  const injected = headerList.get(LOCALE_HEADER);
  if (isLocale(injected)) return injected;

  const saved = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;

  return DEFAULT_LOCALE;
}

/**
 * `app/[locale]/` 下每个页面开头的那两行，收成一个函数。
 *
 *   const locale = await readLocaleParam(params);
 *
 * 做两件事：把 `params` 解出来（Next 15 起是 Promise），把 `string` 收窄成 `Locale`。
 *
 * **为什么要校验**：`[locale]` 是动态段，Next 对它没有任何取值约束。middleware
 * 保证了正常流量里只会是 `en` / `zh`，但 `app/[locale]/layout.tsx` 的注释里
 * 说明了不校验的后果 —— `translate('de', …)` 会在运行时炸。
 * layout 里已经挡了一道，这里是**类型层面**的收窄：不写 `if (!isLocale(...))`，
 * 页面里的 `locale` 就是 `string`，传给 `translate` 直接编译报错。
 *
 * `notFound()` 而不是抛错：地址里那段本来就不是合法语言，404 是最贴切的响应，
 * 也顺带把它挡在搜索引擎外面（404 不会被收录）。
 *
 * 泛型写法是为了 `{ locale, id }` 这种带其他字段的 params —— 多出来的字段
 * 不关心，只要有 `locale` 就能用（`app/[locale]/games/[id]/page.tsx` 那几页）。
 */
export async function readLocaleParam(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return locale;
}
