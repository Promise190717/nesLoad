'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { fetchCurrentUser, type AuthUser } from '@/lib/current-user';
import { splitLocalePath } from '@/lib/i18n';
import { readTheme, saveTheme, type Theme } from '@/lib/theme';
import { PlayMoonIcon, SunIcon } from './icons';
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
 * ⚠️ **哪些页面有它**：`/`、`/games*`、`/developers*`、`/consoles*`、`/privacy`、`/terms`、
 *    `/about`、`/contact`。
 *    **没有**的是 —— `/login` 与 `/account`（这两页自己就是账号相关的页面，顶栏会重复）、
 *    404 页（它只给一个确定去处，不该铺一排入口）、`/admin`（另一套体系，无语言前缀）。
 *
 * ⚠️ **是客户端组件**：语言切换要 `useI18n()`（读当前语言、写 cookie、算另一种语言的
 *    地址），登录态要问一次 `/api/user/login`。内容页那几个壳（`GamesShell` /
 *    `DocPage` / 首页）都是服务端组件，服务端渲染一个客户端子树没有任何问题。
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
 *
 * ---
 *
 * **窄屏两行版式（2026-11-06 用户指定）**：小屏上这一排不再是「一行硬塞」——
 * **第一行 = 左上角那颗（logo / 返回，由 `left` 传进来）+ 语言**，
 * **第二行 = 首页 / 游戏库 / 账号 / 主题**（右对齐，仍然带分隔竖线）。
 * `sm` 以上还是原来那一整行，桌面版式一个字都没动。
 *
 * `left` 只在 `sm` 以下渲染：桌面版那两颗仍由各自的页面摆在原来的位置
 * （`/` 的品牌标在 `.home-nav` 里，内容页的「返回」在顶栏下面那一行），
 * 宿主那边用 `hidden sm:flex` 把移动端那份藏掉，所以同一个节点在 DOM 里会出现两次
 * —— 一次给窄屏、一次给宽屏，**同一时刻只有一份可见**。
 */
function TopBarContent({ showTheme, left }: { showTheme: boolean; left?: ReactNode }) {
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

  /*
   * ⚠️ **窄屏分两行**（2026-11-06）：外层这一组只负责「第一行放哪两颗」。
   * 顺序刻意是「左上角那颗 → 语言」，和桌面版那一行（语言在最前）不冲突：
   * `sm` 以上 `left` 不渲染，这一组就只剩语言，自然接在四个入口前面。
   *
   * ⚠️ 语言**不在 `<nav>` 里**：它是站点级设置，不是导航链接；拆出来之后
   * `<nav>` 只剩「首页 / 游戏库 / 账号 / 主题」，读屏软件念出来的目录也更干净。
   *
   * ⚠️ 入口之间那几条竖线**一律保留**（别为了换行好看去 `hidden sm:block` 藏掉 ——
   * 当天试过，用户立刻问「怎么没有分割线了」）。窄屏第二行放不下时它可能落在行首/行尾，
   * 那是换行的自然结果，可接受。唯一例外是「语言 ↔ 首页」那一条（见下面），它跟着语言走、
   * 只在桌面出现。
   */
  return (
    <div className="flex w-full flex-col items-stretch gap-y-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-x-3">
      {/*
        第一行：左边那颗（窄屏专供）+ 语言。
        `mr-auto` 把语言顶到最右；`sm:hidden` 让桌面版继续用宿主页自己那份
        （`/` 的品牌标、内容页下面那一行的「返回」）。
      */}
      <div className="flex items-center gap-x-3">
        {left && <div className="mr-auto min-w-0 sm:hidden">{left}</div>}
        <div className="ml-auto shrink-0">
          <LocaleSwitcher />
        </div>
        {/*
          语言和「首页」之间那条竖线：**桌面才有**。窄屏下这一行到语言就结束了，
          留它会变成行尾一截孤零零的短竖杠（第一版就踩了这个，用户截图上明摆着）。
          所以它挂在这一组的末尾（跟着语言走），而不是 `<nav>` 的开头 ——
          挂在 nav 开头的话，桌面下它前面会多出一段组间距，左右不对称。
        */}
        <span aria-hidden className="hidden h-[10px] w-px shrink-0 bg-ink-500 sm:block" />
      </div>

      <nav
        aria-label={t('topLinks.label')}
        className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2"
      >
        {/* 首页（2026-10-13 加）。用户要求「除首页外，每个页面都有一颗回首页的入口」——
            顶栏是内容页唯一常驻的导航，放这一处就覆盖了 `/games*`、`/developers*`、
            `/privacy`、`/terms`（首页自己不需要）。

            排在语言之后：语言切换和它都是「站点级」的东西，再往后才是游戏库 / 账号。
        */}
        <Link
          href={localeHref('/')}
          className="whitespace-nowrap text-[12px] text-ink-300 transition-colors hover:text-accent"
        >
          {t('common.home')}
        </Link>

        <span aria-hidden className="h-[10px] w-px shrink-0 bg-ink-500" />
        {/*
          游戏库。文案借 `topLinks.games`（法务页页脚用的是同一个键）——
          同一个落点（`/games`）在站里只该有一个名字。

          ⚠️ **文字前面那颗手柄图标 2026-11-10 已去掉**（用户要求「游戏列表前面的图标
          去掉吧」）。它是 2026-10-14 用户自己要求加的（「游戏列表文字前面加一个游戏
          手柄的图标」），当时的做法是只加在这个顶栏、法务页页脚不加；现在整颗撤掉，
          这一行退回纯文字，与旁边的「首页」「登录」同一套基线和字重。

          ⚠️ **别再加回来，也别换别的图标**：这一排是纯文字导航，单独一颗图标会让它
          的垂直基线和邻居对不上 —— 当初为了对齐还得套一层 inline-flex。真要做视觉
          标识，应该动整排的样式，不是给其中一个链接戴个帽子。

          `GamepadIcon` 本身没删：`ConsoleScene` 的抽屉 / 帮助还用着。
        */}
        <Link
          href={localeHref('/games')}
          className="whitespace-nowrap text-[12px] text-ink-300 transition-colors hover:text-accent"
        >
          {t('topLinks.games')}
        </Link>

        <span aria-hidden className="h-[10px] w-px shrink-0 bg-ink-500" />
        {/*
          H5 小游戏（2026-11-12 加）。排在「游戏库」后面：两者都是「去哪玩游戏」，
          但这里放的是**本站原创的网页游戏**，不是库里的复古 ROM，所以是并列的第二格，
          不是游戏库的子项。

          2026-11-12 晚曾把入口注释掉；2026-11-13 用户要求「开放 H5 游戏的入口」，
          恢复成正常链接。分隔线和链接是一对，别只解开其中一个。
        */}
        <Link
          href={localeHref('/h5')}
          className="whitespace-nowrap text-[12px] text-ink-300 transition-colors hover:text-accent"
        >
          {t('h5.title')}
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
            <span aria-hidden className="h-[10px] w-px shrink-0 bg-ink-500" />
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
                className="max-w-[9rem] shrink-0 truncate text-[12px] text-ink-300 transition-colors hover:text-accent"
              >
                {user.username}
              </Link>
            ) : (
              <Link
                href={signInHref}
                prefetch={false}
                className="whitespace-nowrap text-[12px] text-ink-300 transition-colors hover:text-accent"
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
            <span aria-hidden className="h-[10px] w-px shrink-0 bg-ink-500" />
            {/*
              ⚠️ **方钮 + 圆润月牙**（2026-11-10，用户定的形态：「还是底座加图标，
              图标使用 play 页面的那个」）。这一格当天来回试过三版，别再自己发挥：

              ① 裸图标（只有 `p-1`，无边框无底色）：丑。旁边五项全是文字，只有它一颗
                 没有边的 16px 图形，看着像页面上残留的符号。
              ② 方钮 + 像素 `MoonIcon`：更丑（用户：「可以说是丑麻了」）。放大看是
                 「一个 C 加一个小句点」，16px 里那颗星只会贴着 C 的缺口，像 © 的变形。
              ③ 纯文字（`Night` / `Day`）：「文字不好」。

              现在：② 的底座 + `/play` 那颗 `PlayMoonIcon`（圆润 path 版月牙），
              并按用户要求「整体小点，只有背景，不要边框」收成下面这样。

              ⚠️ **只有背景色，没有描边**（`pixel-edge` 已摘）。色块本身就是形状，
              所以盒子必须小 —— `p-0.5`(2px) + 16px 图标 = **20px 见方**，
              只比旁边 12px 文字高一点。想再大就加 `p`，但 24px 配无边框会重新变成
              「一行字里贴了块砖」；再小则图标贴边（2px 是下限）。

              ⚠️ **两颗图标都渲染，由 CSS 按 `<html data-theme>` 挑**（globals.css 的
              `.theme-toggle`），别写成 `theme === 'light' ? … : …`：`theme` 首帧只能
              给 'dark'，那样浅色用户会先看见太阳再「啪」地翻成月亮。

              `rounded-[2px]` 是用户 2026-11-10 要的「加点圆角，一点点」。**只有 2px** ——
              20px 的盒子上，3px 起就开始像胶囊，和整站直角像素块不搭；2px 只是把四个尖
              磨掉，远看仍是方块。别顺手往 `rounded-sm`/`rounded` 上跳。
            */}
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'light' ? t('theme.toDark') : t('theme.toLight')}
              aria-label={theme === 'light' ? t('theme.toDark') : t('theme.toLight')}
              className="theme-toggle shrink-0 rounded-[2px] bg-ink-800 p-0.5 text-ink-300 transition-colors hover:bg-ink-700 hover:text-accent"
            >
              {/* 图标画的是**切过去之后**的那一颗，和 title 同方向 */}
              <span className="theme-icon-light">
                <SunIcon size={16} />
              </span>
              <span className="theme-icon-dark">
                <PlayMoonIcon size={16} />
              </span>
            </button>
          </>
        )}
      </nav>
    </div>
  );
}

export default function TopBar({
  showTheme = true,
  left,
}: {
  showTheme?: boolean;
  left?: ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <TopBarContent showTheme={showTheme} left={left} />
    </Suspense>
  );
}
