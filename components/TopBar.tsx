'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { splitLocalePath } from '@/lib/i18n';
import { fetchCurrentUser, type AuthUser } from './AuthForm';
import { useI18n } from './I18nProvider';
import LocaleSwitcher from './LocaleSwitcher';

/**
 * 内容页**顶栏**（2026-10-13 加）：语言切换 + 账号 + 游戏库。
 *
 * 三样东西和房间右上角那一行（`ConsoleScene` 的 `.top-links`）是同一个口径 ——
 * 人在屋里屋外看到的「怎么切语言、怎么登录、怎么去游戏列表」应该是同一套。
 *
 * ⚠️ **哪些页面有它**：`/`、`/games*`、`/developers*`、`/privacy`、`/terms`。
 *    **没有**的是 —— `/room`（房间自己那行 `.top-links` 就是它）、
 *    `/login` 与 `/account`（这两页自己就是账号相关的页面，顶栏会重复）、
 *    404 页（它只给一个确定去处，不该铺一排入口）、`/admin`（另一套体系，无语言前缀）。
 *
 * ⚠️ **是客户端组件**：语言切换要 `useI18n()`（读当前语言、写 cookie、算另一种语言的
 *    地址），登录态要问一次 `/api/user/login`。内容页那几个壳（`GamesShell` /
 *    `LegalPage` / 首页）都是服务端组件，服务端渲染一个客户端子树没有任何问题。
 *
 * **登录按钮去 `/login`（2026-10-13 加的独立登录页），并把当前页塞进 `?next=`** ——
 * 登录成功之后能回到他刚才在看的那一页，而不是被扔回房间。`next` 传的是
 * **不带语言前缀**的站内路径（`/games?q=mario` 这种），登录页那边再按自己的语言
 * 拼前缀（见 `app/[locale]/login/page.tsx`）—— 否则中文用户会拿到 `/zh/zh/games`。
 *
 * 已登录时这一格变成**用户名**（点进 `/account`），和房间那颗钮同一套写法：
 * `max-w-[9rem] truncate` 截断，全名留在 `title` 里。
 */
export default function TopBar() {
  const { t, href: localeHref } = useI18n();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchCurrentUser().then((current) => {
      if (cancelled) return;
      setUser(current);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * 登录页的 `?next=`。
   *
   * `usePathname()` 可能报出 middleware 内部 rewrite 之后的 `/en/games`（见
   * lib/i18n.ts 的 `splitLocalePath`），所以要剥一次前缀；query 要带上 ——
   * 从 `/games?console=nes&page=2` 点登录，登完该回到那一页。
   */
  const { path } = splitLocalePath(pathname);
  const query = searchParams.toString();
  const next = path + (query ? `?${query}` : '');
  const signInHref = `${localeHref('/login')}?next=${encodeURIComponent(next)}`;

  return (
    <nav aria-label={t('topLinks.label')} className="flex items-center justify-end gap-3">
      <LocaleSwitcher />

      {/*
        首页（2026-10-13 加）。用户要求「除首页外，每个页面都有一颗回首页的入口」——
        顶栏是内容页唯一常驻的导航，放这一处就覆盖了 `/games*`、`/developers*`、
        `/privacy`、`/terms`（房间那页有它自己那行 `.top-links`，首页自己不需要）。

        排在语言之后：语言切换和它都是「站点级」的东西，再往后才是账号 / 游戏库。
      */}
      <span aria-hidden className="h-[10px] w-px bg-ink-500" />
      <Link
        href={localeHref('/')}
        className="text-[11px] text-ink-300 transition-colors hover:text-accent"
      >
        {t('common.home')}
      </Link>

      {/*
        账号那一格。
        ⚠️ **`loading` 期间整格不渲染**（连分隔线一起）—— 首屏还不知道「我是谁」，
           先画成未登录的话，已登录用户会看见它先写「登录」再「啪」地换成自己的名字。
           那几十毫秒宁可空着，比闪一下好。房间那行也是这个处理。
      */}
      {!loading && (
        <>
          <span aria-hidden className="h-[10px] w-px bg-ink-500" />
          {user ? (
            <Link
              href={localeHref('/account')}
              title={t('user.openSignedIn', { name: user.username })}
              className="max-w-[9rem] truncate text-[11px] text-ink-300 transition-colors hover:text-accent"
            >
              {user.username}
            </Link>
          ) : (
            <Link
              href={signInHref}
              className="text-[11px] text-ink-300 transition-colors hover:text-accent"
            >
              {t('user.signIn')}
            </Link>
          )}
        </>
      )}

      <span aria-hidden className="h-[10px] w-px bg-ink-500" />
      {/*
        游戏库。文案借 `topLinks.games`（房间那行、法务页页脚用的是同一个键）——
        同一个落点（`/games`）在站里只该有一个名字。
      */}
      <Link
        href={localeHref('/games')}
        className="text-[11px] text-ink-300 transition-colors hover:text-accent"
      >
        {t('topLinks.games')}
      </Link>
    </nav>
  );
}
