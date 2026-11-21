import type { Metadata } from 'next';
import Link from 'next/link';
import BackLink from '@/components/BackLink';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import LoginBackdrop from '@/components/LoginBackdrop';
import LoginPanel from '@/components/LoginPanel';
import {
  SITE_NAME,
  alternatesFor,
  localePath,
  ogLocale,
  otherLocales,
  translate,
  type MessageKey,
} from '@/lib/i18n';
import { readLocaleParam } from '@/lib/server/locale';

/**
 * `/login` —— 前台**独立登录页**（2026-10-13 加）。
 *
 * **为什么要有它**：2026-10-13 之前前台没有登录页 —— 登录是屋里那颗账号钮弹出来的
 * 浮层（`components/UserPanel.tsx`）。同日给内容页加了顶栏（`components/TopBar.tsx`），
 * 顶栏那颗「登录」需要一个**能落地的地址**（顶栏是普通页面，弹不了屋里的浮层），
 * 所以补了这一页。
 *
 * **和屋里那个浮层的关系**：表单本体是**同一个组件**（`components/AuthForm.tsx`），
 * 这里只是换个壳。两处各写一份表单，改一处（加一条口令规则、多一个错误码）另一处
 * 就会不知不觉地不跟。
 *
 * ⚠️ **顶栏不挂在这一页上**（用户明确要求）：这一页自己就是账号相关的页面，
 *    再铺一排「语言 / 账号 / 游戏库」是重复的。
 *
 * ⚠️ **这一页是 `noindex, follow`**：它是一张表单，没有可索引的正文 —— 收录进去
 *    只会是「一页和首页抢同一个词的空壳」。`follow` 留着，页脚 / 返回那些链接照旧能爬。
 *
 * 🔴 **2026-11-21：整页静态化（服务端不再读 cookie）**。
 *
 * 之前这里 `await cookies()` + `verifyUserSession()` 判「已登录就跳走」，代价是
 * **每个请求都要现场跑一次 SSR**：CF 日志里 45 次 1102 有 10 次是 `/login`，
 * 而且全带 `?next=`（每个取值都是一条新 URL，谁都暖不到别人），一次 SSR 要
 * 100–500ms CPU，冷的那次直接被砍。
 *
 * 现在这一页对所有人是同一份 HTML（登录态由 `LoginPanel` 挂载后问一次
 * `/api/user/login` 再决定跳不跳），于是：
 *   · Next 在构建期就把 18 个语言版本预渲染好，运行时**根本不用渲染**；
 *   · `worker.ts` 把 `?next=` 整个剥掉、缓存键折叠成 `/<locale>/__nesload_login`
 *     （见 `loginKeyPath`），这一族从 10/45 次超时归零。
 * 代价只有一个：已登录的人打开 `/login` 会**闪一帧表单**再被送去目标页
 * （原来服务端那一跳是连一帧都没有的）。这是明知的取舍，别为了躲那一帧把
 * `cookies()` 加回来 —— 加回来就等于把这一页重新钉死在现场渲染上。
 */
export async function generateMetadata({
  params: routeParams,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = await readLocaleParam(routeParams);
  /* 标题里没有站名 —— 根布局的 `title.template` 会补上「· 站名」，见 lib/i18n.ts 那条注释 */
  const title = translate(locale, 'seo.login.title');
  const description = translate(locale, 'seo.login.description');

  return {
    title,
    description,
    /* 表单页不收录，但链接照旧可以被顺着爬（`follow`） */
    robots: { index: false, follow: true },
    /*
     * canonical 仍然要写：`alternates` 是**整体覆盖**不是深合并（见 lib/i18n.ts 的
     * `alternatesFor`），不写的话它会顶着根布局那份 `/` 的 canonical。
     */
    alternates: alternatesFor(locale, '/login'),
    openGraph: {
      type: 'website',
      url: localePath(locale, '/login'),
      siteName: SITE_NAME[locale],
      title,
      description,
      locale: ogLocale(locale),
      alternateLocale: otherLocales(locale).map(ogLocale),
    },
  };
}

/**
 * `?next=` 的白名单校验**搬去 `components/LoginPanel.tsx` 了**（2026-11-21）。
 *
 * 搬家原因：这一页静态化之后不能再有 `searchParams`（读到它就等于声明动态渲染），
 * `?next=` 只能由客户端读。校验规则本身**一个字没改** —— 只接受站内绝对路径，
 * 挡 `//evil.com` 与 `/\evil.com`，不能指回 `/login` 自己。
 *
 * ⚠️ 别为了「服务端也校验一次更安全」把它加回来：那需要 `searchParams`，
 *    代价是把整页重新钉在动态渲染上。这个值只用于客户端 `router.replace`，
 *    服务端从来不信它，没有第二道防线的必要。
 */

export default async function LoginPage({
  params: routeParams,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = await readLocaleParam(routeParams);

  /*
   * 🔴 这里**故意什么都不判**：登录态、`?next=` 全在客户端（`components/LoginPanel.tsx`）。
   * 往这里加一次 `cookies()` 就会把整页打回动态渲染，10 次/样本的 1102 就是这么来的。
   */

  const t = (key: MessageKey) => translate(locale, key);

  return (
    <main className="wall relative flex min-h-screen flex-col justify-center px-6 py-6 sm:py-12">
      {/*
        背景装饰（2026-10-13 加）：canvas 画的像素小人在底下慢慢飘。
        ⚠️ 它是 `fixed` + `z-0` 的一层，**压在这张 `main` 的底色之上、正文之下** ——
        所以下面那层内容要 `relative z-10` 才压得住它（见 `components/LoginBackdrop.tsx`）。
      */}
      <LoginBackdrop />
      {/*
        语言切换 + 首页（2026-10-14）。这一页**仍然不挂顶栏**（用户明确要求，见文件头
        那段），但语言切换是站点级的东西，不该因为登录页没顶栏就切不了。
        外层 `absolute` 钉在页面顶部（不参与下面 `justify-center` 的垂直居中），
        **内层套一个和正文列同宽的 `max-w-md` 右对齐** —— 右缘和表单对齐，
        和首页顶栏「对齐内容容器」是同一个口径（2026-10-14 用户反馈：直接
        `right-6` 钉视口边缘太靠边了）。顺序和 TopBar 一致（语言在首页之前）。
        落点是当前页在所选语言下的地址（`LocaleSwitcher` 内部走 `useI18n()` 的
        `hrefIn()`，含 `?next=`，和内容页同一套）。上下偏移对齐 `main` 自己的
        `py-6`（sm:py-12）。
      */}
      <div className="absolute inset-x-6 top-6 z-10 sm:top-12">
        <div className="mx-auto flex w-full max-w-md items-center justify-end gap-3">
          <LocaleSwitcher />
          <span aria-hidden className="h-[10px] w-px bg-ink-500" />
          <Link
            href={localePath(locale, '/')}
            className="text-[12px] text-ink-300 transition-colors hover:text-accent"
          >
            {t('common.home')}
          </Link>
        </div>
      </div>
      {/*
        内容列垂直居中（2026-10-13）：`main` 改成 flex 列 + `justify-center`。
        `py` 保留，矮窗口时当最小留白。
      */}
      <div className="relative z-10 mx-auto w-full max-w-md">
        {/*
          返回走**浏览器回退**（`BackLink`）：从 `/games?q=…` 点顶栏那颗登录过来的，
          返回该回到那个带参数的地址，而不是一个写死的落点。
          兜底（直开 / 爬虫）是首页 —— 把人送回落地页最合适。
        */}
        <div className="flex items-center">
          <BackLink
            href={localePath(locale, '/')}
            className="inline-flex items-center gap-2 text-[12px] text-ink-400 transition-colors hover:text-accent"
          >
            <span aria-hidden="true">←</span>
            <span>{t('common.back')}</span>
          </BackLink>
        </div>

        <header className="mt-4 text-center sm:mt-8">
          {/* 标题借 `user.title`（屋里那个账号浮层的标题）—— 同一个东西只该有一个名字 */}
          <h1 className="text-[22px] leading-snug font-semibold text-ink-100">{t('user.title')}</h1>
          <p className="mx-auto mt-3 max-w-sm text-[12px] leading-6 text-ink-400">
            {t('login.lead')}
          </p>
        </header>

        {/* 卡片壳和屋里那个浮层同一套（bg-ink-800 + pixel-edge），里面是共用的 AuthForm。
            内衬 2026-10-13 从 `p-4` 提到 `p-5` —— 用户要求表单整体高一点，输入框不动、靠留白撑。 */}
        <div className="mt-6 bg-ink-800 pixel-edge pxw-4 pxc-600 p-5">
          <LoginPanel />
        </div>
      </div>
    </main>
  );
}
