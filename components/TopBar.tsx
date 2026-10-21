'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { fetchCurrentUser, type AuthUser } from '@/lib/current-user';
import { splitLocalePath } from '@/lib/i18n';
import { readTheme, saveTheme, type Theme } from '@/lib/theme';
import { GamepadIcon, MoonIcon, SunIcon } from './icons';
import { useI18n } from './I18nProvider';
import LocaleSwitcher from './LocaleSwitcher';

/**
 * 内容页**顶栏**（2026-10-13 加）：语言切换 + 账号 + 游戏库。
 *
 * **顺序（2026-10-14 起）**：语言 → 首页 → 游戏库 → 账号。原来账号夹在首页和游戏库
 * 之间，当天用户要求「登录放在游戏列表后面」，两处一起调成了现在这个组序。
 *
 * **「游戏库」文字前带一个手柄图标**（2026-10-14 加，用户要求「游戏列表文字前面加一个
 * 游戏手柄的图标」）—— 只在这一处，法务页页脚不加。见下面那条链接的注释。
 *
 * ⚠️ **哪些页面有它**：`/`、`/games*`、`/developers*`、`/privacy`、`/terms`。
 *    **没有**的是 —— `/login` 与 `/account`（这两页自己就是账号相关的页面，顶栏会重复）、
 *    404 页（它只给一个确定去处，不该铺一排入口）、`/admin`（另一套体系，无语言前缀）。
 *
 * ⚠️ **是客户端组件**：语言切换要 `useI18n()`（读当前语言、写 cookie、算另一种语言的
 *    地址），登录态要问一次 `/api/user/login`。内容页那几个壳（`GamesShell` /
 *    `LegalPage` / 首页）都是服务端组件，服务端渲染一个客户端子树没有任何问题。
 *
 * ⚠️ **登录态那次探测走 `lib/current-user.ts`（带缓存，2026-10-19）**：这一整排顶栏
 *    是**每页各挂一次**的，`<Link>` 一点它就卸载重挂 —— 自己裸 fetch 的话，未登录的人
 *    每切一次页面就白打一次 `/api/user/login`。缓存也在那里管登录 / 退出的失效。
 *
 * **登录按钮去 `/login`（2026-10-13 加的独立登录页），并把当前页塞进 `?next=`** ——
 * 登录成功之后能回到他刚才在看的那一页。`next` 传的是
 * **不带语言前缀**的站内路径（`/games?q=mario` 这种），登录页那边再按自己的语言
 * 拼前缀（见 `app/[locale]/login/page.tsx`）—— 否则中文用户会拿到 `/zh/zh/games`。
 *
 * 已登录时这一格变成**用户名**（点进 `/account`）：
 * `max-w-[9rem] truncate` 截断，全名留在 `title` 里。
 */
function TopBarContent({ showTheme }: { showTheme: boolean }) {
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
   * 主题钮（2026-10-19 加）。
   *
   * **真身在 `<html data-theme>`**（首屏由 layout 的内联脚本写入），这份 state 只喂
   * title / aria-label —— 和 `/play` 那一套完全一样：露哪颗图标由 CSS 按属性挑
   * （globals.css 的 `.theme-toggle`），React 不参与。写成
   * `theme === 'light' ? <Moon/> : <Sun/>` 会先按默认主题画一颗、挂载后再「啪」地换。
   *
   * 水合前服务端拿不到 localStorage，所以初值只能给 'dark'，挂载后再同步；
   * 塞微任务是因为 effect 里同步 setState 会撞上 `react-hooks/set-state-in-effect`。
   */
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const stored = readTheme();
    void Promise.resolve().then(() => setTheme(stored));
  }, []);

  /**
   * 切换。读 DOM 属性取当前值再翻过来 —— 和 `ConsoleScene.toggleTheme` 同一个写法，
   * 连点两下不会因为 state 批处理丢掉一次翻转。
   *
   * 切完 `saveTheme` 会同时写 `nesload:theme` 和 `data-lamp`（白天自动关灯）。
   * 过渡优先走 View Transitions（和开玩那页「光从左上角推开」同一套 CSS）；
   * 不支持就挂 0.36s 的颜色过渡类 `theme-fading`（globals.css 里那组兜底）。
   */
  const toggleTheme = useCallback(() => {
    const next = readTheme() === 'dark' ? 'light' : 'dark';
    const root = document.documentElement;
    const commit = () => {
      saveTheme(next);
      setTheme(next);
    };
    if (typeof document.startViewTransition === 'function') {
      document.startViewTransition(commit);
      return;
    }
    root.classList.add('theme-fading');
    /* 强制算一次样式：少了它，浏览器会把「加类」和「改主题」并进同一次样式计算 */
    void root.offsetHeight;
    commit();
    window.setTimeout(() => root.classList.remove('theme-fading'), 400);
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
        `/privacy`、`/terms`（首页自己不需要）。

        排在语言之后：语言切换和它都是「站点级」的东西，再往后才是游戏库 / 账号。
      */}
      <span aria-hidden className="h-[10px] w-px bg-ink-500" />
      <Link
        href={localeHref('/')}
        className="text-[12px] text-ink-300 transition-colors hover:text-accent"
      >
        {t('common.home')}
      </Link>

      <span aria-hidden className="h-[10px] w-px bg-ink-500" />
      {/*
        游戏库。文案借 `topLinks.games`（法务页页脚用的是同一个键）——
        同一个落点（`/games`）在站里只该有一个名字。

        ⚠️ 文字前面那个**手柄图标是 2026-10-14 用户要求加的**（「游戏列表文字前面加一个
        游戏手柄的图标」）—— 只加在**这个顶栏**（首页 `/` 与 `/games*`、`/developers*`、
        `/privacy`、`/terms` 共用），法务页页脚不加。

        ⚠️ **这里刻意不复用 `.row-icon`**：那个类在小屏抽屉里是「左边图标、右边文案」用的，
        但它**大屏默认 `display: none`**（见 globals.css 那段注释 —— 大屏右上角那一行
        照规矩是纯文字）。这个顶栏不是抽屉，直接用一个 inline-flex 的 `<span>` 包住图标
        即可，不碰那套开关。

        ⚠️ 2026-10-14 曾给这一处另画过一个实心手柄剪影（`JoystickIcon`），用户看过之后
        **当天就要求换回 `GamepadIcon`**，那个图标已删；别再加第二个手柄图标。
      */}
      <Link
        href={localeHref('/games')}
        className="inline-flex items-center gap-1.5 text-[12px] text-ink-300 transition-colors hover:text-accent"
      >
        <span className="inline-flex items-center">
          <GamepadIcon size={16} />
        </span>
        {t('topLinks.games')}
      </Link>

      {/*
        账号那一格（2026-10-14 用户要求挪到「游戏库」**后面**：组顺序为
        语言 → 首页 → 游戏库 → 账号）。原先它排在首页和游戏库之间。

        ⚠️ **`loading` 期间整格不渲染**（连分隔线一起）—— 首屏还不知道「我是谁」，
           先画成未登录的话，已登录用户会看见它先写「登录」再「啪」地换成自己的名字。
           那几十毫秒宁可空着，比闪一下好。
      */}
      {!loading && (
        <>
          <span aria-hidden className="h-[10px] w-px bg-ink-500" />
          {user ? (
            /*
             * ⚠️ **这两颗（个人中心 / 登录页）都关掉了预取**（`prefetch={false}`，2026-10-19）。
             *
             * 本站的 `/account` 与 `/login` 都读 cookie（动态渲染），预取拿不到页面数据 ——
             * Next 只会去取一份「纯布局壳」（实测 373 / 426 字节，`__PAGE__` 里是空的），
             * 而**每次页面切换**这排顶栏重新挂载时它都会再发一遍，一次两条（带 query 的
             * 加上不带 query 的壳）。也就是说：未登录的人每翻一页，Worker 上就多两个
             * 只能扔掉的请求，登录页打开速度却一点没快（那一次往返无论如何都要发生）。
             * 省掉它的代价只是点下去之后多等一个 RSC 往返 —— 和点「游戏库」那种静态页
             * 不一样，这两页本来就没有「秒开」可省。
             */
            <Link
              href={localeHref('/account')}
              prefetch={false}
              title={t('user.openSignedIn', { name: user.username })}
              className="max-w-[9rem] truncate text-[12px] text-ink-300 transition-colors hover:text-accent"
            >
              {user.username}
            </Link>
          ) : (
            <Link
              href={signInHref}
              prefetch={false}
              className="text-[12px] text-ink-300 transition-colors hover:text-accent"
            >
              {t('user.signIn')}
            </Link>
          )}
        </>
      )}
      {/*
        主题（2026-10-19 加）。用户要求「首页及列表那些页面右上入口最后边也加白天 /
        黑夜模式的切换钮」—— 所以排在**账号之后**，是这一排的最后一格。

        `showTheme={false}` 目前只有 `/play` 传：那一页右栏的「显示」那一行已经有一颗
        同一功能的钮（见 PlayScene），顶栏再放一颗就是同一件事说两遍。
      */}
      {showTheme && (
        <>
          <span aria-hidden className="h-[10px] w-px bg-ink-500" />
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'light' ? t('theme.toDark') : t('theme.toLight')}
            aria-label={theme === 'light' ? t('theme.toDark') : t('theme.toLight')}
            className="theme-toggle p-1 text-ink-300 transition-colors hover:text-accent"
          >
            {/* 图标画的是**切过去之后**的那一颗，和 title 同方向 */}
            <span className="theme-icon-light">
              <SunIcon size={16} />
            </span>
            <span className="theme-icon-dark">
              <MoonIcon size={16} />
            </span>
          </button>
        </>
      )}
    </nav>
  );
}

export default function TopBar({ showTheme = true }: { showTheme?: boolean }) {
  return <Suspense fallback={null}><TopBarContent showTheme={showTheme} /></Suspense>;
}
