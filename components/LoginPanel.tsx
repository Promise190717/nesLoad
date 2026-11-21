'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthForm from './AuthForm';
import { useI18n } from './I18nProvider';
import { fetchCurrentUser } from '@/lib/current-user';

/**
 * 独立登录页（`/login`）里那张表单的**客户端壳**（2026-10-13 加）。
 *
 * 为什么需要这一层：`app/[locale]/login/page.tsx` 是服务端组件，而「登录成功后去哪儿」
 * 要在浏览器里做（`router.push`）—— 服务端组件没法把一个函数传给客户端表单。
 * 所以这一层只干一件事：**接住 `onAuthed`，然后导航**。
 *
 * 🔴 **2026-11-21：两件原本在服务端做的事搬到这里了，别搬回去。**
 *
 * 那一页整页静态化（理由见 `app/[locale]/login/page.tsx` 文件头：CF 日志里 45 次
 * 1102 有 10 次是 `/login`，全是爬虫顺着 `?next=` 造出来的冷地址在跑完整 SSR）。
 * 静态页面不能读 cookie、不能读 `searchParams` —— 于是：
 *
 *   · **已登录就跳走**：挂载后问一次 `fetchCurrentUser()`（模块级缓存，5 分钟内
 *     不发第二次），有用户就 `router.replace` 到目标页。代价是已登录的人会先看到
 *     一帧表单，这是明知并接受的取舍。
 *   · **`?next=`**：只能由客户端读。这里**故意用 `window.location.search`
 *     而不是 `useSearchParams()`** —— 后者会要求外面套一层 `<Suspense>`，
 *     于是这张表单在服务端就不再渲染，登录页会先白一屏再出内容。
 *     `?next=` 只在这两个时机用到（挂载后跳转、登录成功后 push），都在浏览器里，
 *     没必要为它牺牲首屏。
 *
 * **去哪儿**：
 *   · 有 `?next=` → 回那一页（顶栏那颗「登录」会自动带上当前页，见 `components/TopBar.tsx`）
 *   · 没有 → 回首页（`/`）。
 *
 * ⚠️ `next` 是**不带语言前缀**的站内路径（`/games?q=mario` 这种），这里用
 *    `useI18n()` 的 `href()` 现拼当前语言的前缀 —— 直接 push 一个带 `/zh` 的值
 *    会在中文页上拼出 `/zh/zh/...`。
 *
 * 表单本体是 `AuthForm` —— **和屋里那个账号浮层共用同一个**，两处各写一份迟早会漂。
 */

/**
 * `?next=` 的**白名单校验**（2026-11-21 从 `app/[locale]/login/page.tsx` 搬来，
 * 逻辑一个字没改）。
 *
 * 这是登录流程里唯一一处「用户可控的跳转目标」，不校验就是一个开放重定向
 * （`?next=https://evil.example` 能把人从我们的域名带走）。
 *
 * 规则：只接受**站内绝对路径** ——
 *   · 必须以单个 `/` 开头（`//evil.com` 是协议相对地址，等于外站，挡掉）
 *   · `/\evil.com` 也挡（有些浏览器把反斜杠当 `/`）
 *   · 不能指回 `/login` 自己（否则登录成功原地打转）
 * 不合法一律返回 `null`，调用方走默认落点 `/`。
 *
 * 约定：**`next` 不带语言前缀**（`/account`，不是 `/zh/account`）——
 * 顶栏和 `/account` 的守卫都按这个约定生成，拼前缀是这一层的事（`localeHref`）。
 */
function parseNext(value: string | null): string | null {
  if (typeof value !== 'string') return null;

  const next = value.trim();
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;

  /* 去掉 query / hash 之后只看路径，用来挡「指回登录页自己」 */
  const path = next.split(/[?#]/)[0];
  if (path === '/login' || path.endsWith('/login')) return null;

  return next;
}

/** 从地址栏取一次 `?next=`（已在上面校验过）。**只能在浏览器里调用。** */
function readNextFromLocation(): string | null {
  return parseNext(new URLSearchParams(window.location.search).get('next'));
}

export default function LoginPanel() {
  const { href: localeHref } = useI18n();
  const router = useRouter();

  useEffect(() => {
    /*
     * 目标地址**每次现读**，不存在 state 里：它只在两个时机用到（挂载后跳转、
     * 登录成功后 push），都在浏览器里，而地址栏在登录成功前不会变。
     * 存 state 反而要「effect 里 setState」，React 的 lint 也不让。
     */
    const parsed = readNextFromLocation();

    let cancelled = false;
    /* 已经登录的人不该看见登录表单 —— 直接送去他本来要去的地方（服务端那一跳的替代）。 */
    void fetchCurrentUser().then((user) => {
      if (cancelled || !user) return;
      router.replace(localeHref(parsed ?? '/'));
    });
    return () => {
      cancelled = true;
    };
  }, [localeHref, router]);

  /* hideCloudLead：`/login` 页头的 lead（`login.lead`）已经说过「存到云端…即刻开玩」，
     表单里不再重复那一句（见 AuthForm 的 prop 注释） */
  return (
    <AuthForm
      hideCloudLead
      onAuthed={() => {
        const next = readNextFromLocation();
        router.push(next ? localeHref(next) : localeHref('/'));
      }}
    />
  );
}
