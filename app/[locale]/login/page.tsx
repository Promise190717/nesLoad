import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import BackLink from '@/components/BackLink';
import LoginBackdrop from '@/components/LoginBackdrop';
import LoginPanel from '@/components/LoginPanel';
import {
  SITE_NAME,
  alternatesFor,
  localePath,
  ogLocale,
  otherLocale,
  translate,
  type MessageKey,
} from '@/lib/i18n';
import { USER_SESSION_COOKIE, verifyUserSession } from '@/lib/server/app-session';
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
 * ⚠️ **不写 `export const dynamic`**：下面读了 cookie（判登录态），本来就是动态渲染，
 *    再声明一次是多余的（和 GamesShell 那三页同一个理由）。
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
      alternateLocale: ogLocale(otherLocale(locale)),
    },
  };
}

/**
 * `?next=` 的**白名单校验**。
 *
 * 这是登录页上唯一一处「用户可控的跳转目标」，不校验就是一个开放重定向
 * （`?next=https://evil.example` 能把人从我们的域名带走）。
 *
 * 规则：只接受**站内绝对路径** ——
 *   · 必须以单个 `/` 开头（`//evil.com` 是协议相对地址，等于外站，挡掉）
 *   · `/\evil.com` 也挡（有些浏览器把反斜杠当 `/`）
 *   · 不能指回 `/login` 自己（否则登录成功原地打转）
 * 不合法一律返回 `null`，调用方走默认落点 `/room`。
 *
 * 约定：**`next` 不带语言前缀**（`/account`，不是 `/zh/account`）——
 * 顶栏和 `/account` 的守卫都按这个约定生成，拼前缀是登录页自己的事
 * （见 `components/LoginPanel.tsx`）。
 */
function parseNext(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null;

  const next = value.trim();
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;

  /* 去掉 query / hash 之后只看路径，用来挡「指回登录页自己」 */
  const path = next.split(/[?#]/)[0];
  if (path === '/login' || path.endsWith('/login')) return null;

  return next;
}

export default async function LoginPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [locale, params] = await Promise.all([readLocaleParam(routeParams), searchParams]);
  const next = parseNext(params.next);

  /*
   * 已经登录的人不该看见登录表单 —— 直接送去他本来要去的地方。
   *
   * 放在**服务端**判（而不是客户端拉一次 `/api/user/login`）：
   * 客户端判会先画一帧表单再「啪」地跳走，服务端判连那一帧都没有。
   * 手法和 `/account` 的守卫一样（见 app/[locale]/account/layout.tsx）。
   *
   * ⚠️ 这里只验签名、**不查库复核封禁** —— 和 account layout 同一个取舍：
   *    把 D1 查询拖进首屏渲染路径不值当，封禁那道闸在各 API 的 `assertUser` 里。
   */
  const store = await cookies();
  const session = await verifyUserSession(store.get(USER_SESSION_COOKIE)?.value);
  if (session) redirect(localePath(locale, next ?? '/room'));

  const t = (key: MessageKey) => translate(locale, key);

  return (
    <main className="min-h-screen bg-ink-950 px-6 py-6 sm:py-12">
      {/*
        背景装饰（2026-10-13 加）：canvas 画的像素小人在底下慢慢飘。
        ⚠️ 它是 `fixed` + `z-0` 的一层，**压在这张 `main` 的底色之上、正文之下** ——
        所以下面那层内容要 `relative z-10` 才压得住它（见 `components/LoginBackdrop.tsx`）。
      */}
      <LoginBackdrop />
      <div className="relative z-10 mx-auto w-full max-w-md">
        {/*
          中间实、两侧透的遮罩（`.login-scrim`，样式在 globals.css）：
          小人是往两侧过的，但窄屏 / 矮屏上难免压到正文 —— 垫这一层保证读得清。
        */}
        <div className="login-scrim pointer-events-none absolute inset-y-0 -z-10" />
        {/*
          返回走**浏览器回退**（`BackLink`）：从 `/games?q=…` 点顶栏那颗登录过来的，
          返回该回到那个带参数的地址，而不是一个写死的落点。
          兜底（直开 / 爬虫）是首页 —— 这一页不是房间，把人送回落地页最合适。
        */}
        {/*
          左上返回 + 右上首页（2026-10-13 加）。这一页**刻意不挂顶栏**（用户明确要求，
          见文件头那段），所以没有内容页那排入口 —— 回首页那颗单独放在这儿，
          和别的页面「右上角有一颗首页」保持一致。
        */}
        <div className="flex items-center justify-between gap-4">
          <BackLink
            href={localePath(locale, '/')}
            className="inline-flex items-center gap-2 text-[11px] text-ink-400 transition-colors hover:text-accent"
          >
            <span aria-hidden="true">←</span>
            <span>{t('common.back')}</span>
          </BackLink>
          <Link
            href={localePath(locale, '/')}
            className="text-[11px] text-ink-400 transition-colors hover:text-accent"
          >
            {t('common.home')}
          </Link>
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
          <LoginPanel next={next} />
        </div>
      </div>
    </main>
  );
}
