'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { trackSiteHistory } from '@/lib/site-history';
import {
  LOCALE_COOKIE,
  SITE_NAME,
  htmlLang,
  localePath,
  otherLocale,
  splitLocalePath,
  translate,
  type Locale,
  type Translate,
} from '@/lib/i18n';

interface I18nValue {
  locale: Locale;
  t: Translate;
  /** 给站内路径加语言前缀（`/games` → `/zh/games`）。**站内 `<Link>` 一律走它。** */
  href: (path: string) => string;
  /** 另一种语言 —— 语言切换那颗钮要显示的就是它。 */
  altLocale: Locale;
  /** 当前页面的另一种语言地址（含 query）。语言切换那颗钮的 `href`。 */
  altHref: string;
  /** 记住用户的选择（写 cookie）。**不导航** —— 导航由调用方的 `<Link>` 负责。 */
  rememberLocale: (next: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

/** 后台不做语言前缀（见 middleware.ts），它的路径一律落在这条判据上。 */
function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

/**
 * 语言上下文。
 *
 * **首屏的 locale 从哪来**：`app/layout.tsx` 在服务端按路径算好（`readLocale()`），
 * 但这里**不用它当最终答案** —— 客户端导航（`<Link>` 点一下）不会重新渲染根布局，
 * 那个 prop 会一直停在首屏的值上，从 `/` 点进 `/zh/games` 之后它还是 `en`。
 * 所以真正的来源是 **`usePathname()`**：地址变了它就跟着变，这是唯一能跟上导航的信号。
 *
 * `initialLocale` 只在一种情况下用得上 —— **后台**：`/admin/...` 没有前缀，
 * `splitLocalePath()` 会一律判成英文，而后台的语言其实由 cookie 决定。
 * 那部分 cookie 只有服务端读得到，所以走这个 prop。
 *
 * `<html lang>` / `data-locale` 由根布局在服务端写死（首屏是对的），但客户端导航
 * 改不了服务端渲染的属性，所以下面那个 effect 负责在语言变化时手动同步 ——
 * 屏幕里的提示文案按 `data-locale` 选字号（见 globals.css 的 `.screen-hint-*`），
 * 读屏和 SEO 看 `lang`。
 */
export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(trackSiteHistory, []);

  const admin = isAdminPath(pathname);
  const locale = admin ? initialLocale : splitLocalePath(pathname).locale;

  useEffect(() => {
    document.documentElement.lang = htmlLang(locale);
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  const rememberLocale = useCallback((next: Locale) => {
    // 写 cookie 而不是 localStorage：middleware 读的是 cookie，用它决定
    // 「无前缀地址要不要把你送去 /zh」；服务端下次渲染也能直接读到。
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
  }, []);

  const value = useMemo<I18nValue>(() => {
    /*
     * 站名（文案里的 `{site}` 占位）在这里**统一注入**，不在每个调用点手写。
     * 这样任何写了 `{site}` 的键，无论从服务端（layout 的 translate）还是客户端
     * （这个 t）取，拿到的都是当前语言的站名。
     *
     * 顺序上 vars 在后：调用方传的变量优先级更高，需要时可以覆盖掉站名。
     */
    const t: Translate = (key, vars) =>
      translate(locale, key, { site: SITE_NAME[locale], ...vars });

    /*
     * 另一种语言的当前页地址。
     *
     * `splitLocalePath(pathname).path` 先把可能存在的 `/zh` 剥掉 —— 不剥的话
     * 从 `/zh/games` 切英文会算出 `/en/zh/games`。
     *
     * query 要带上：房间那页的深链是 `/?id=<游戏>`（见 app/[locale]/games/[id]/page.tsx），
     * 丢掉它，用户在中文页切一下英文就会从「正在载入那款游戏」退回一间空屋子。
     *
     * 后台不参与（它没有第二种语言的地址），`altHref` 退回当前地址 ——
     * 后台界面里也没有语言切换入口，这个值只是为了让类型完整。
     */
    const altLocale: Locale = otherLocale(locale);
    const query = searchParams.toString();
    const altHref = admin
      ? pathname
      : localePath(altLocale, splitLocalePath(pathname).path) + (query ? `?${query}` : '');

    return {
      locale,
      t,
      href: (path) => localePath(locale, path),
      altLocale,
      altHref,
      rememberLocale,
    };
  }, [locale, pathname, searchParams, rememberLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n 必须在 I18nProvider 内部使用');
  return ctx;
}
