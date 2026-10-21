import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { localePath } from '@/lib/i18n';
import { USER_SESSION_COOKIE, verifyUserSession } from '@/lib/server/app-session';
import { readLocaleParam } from '@/lib/server/locale';

/*
 * `/account` 的守卫。
 *
 * 未登录 / 令牌过期 → **重定向到登录页**（`/login?next=/account`）。
 *
 * ⚠️ 2026-10-13 改过一次：那天之前前台**没有登录页** —— 登录是弹出来的浮层
 * （`UserPanel`），守卫只能把人弹回首页让浮层替他开好登录框。
 * 现在有了独立登录页（`app/[locale]/login/page.tsx`），直接送去那儿更自然：
 * 少一次导航，登录完还能顺着 `?next=` 回到这一页。
 *
 * `next` 传的是**不带语言前缀**的站内路径（`/account`，不是 `/zh/account`）——
 * 拼前缀是登录页自己的事（见 `components/LoginPanel.tsx`）。
 *
 * ⚠️ 回**当前语言**的登录页。写死 `'/login'` 的话，从 `/zh/account` 被弹走的中文用户
 * 会落到英文登录页。
 *
 * 鉴权放在 layout 而不是 page 里：将来 `/account` 下面加子页（比如
 * `/account/saves`）时自动一起受保护，不用每页各写一遍。理由同 `(panel)/layout.tsx`。
 *
 * ⚠️ 这是**服务端组件**（要读 cookie），所以本文件不能有 'use client'。
 *    `verifyUserSession` 是纯 HMAC 校验（Edge 也能跑），**不碰数据库** ——
 *    所以这里不做「封禁复核」，那一层由各 API 的 `assertUser` 负责。
 *    代价：一个刚被封的人还进得来这一页（页面本身只是壳），但页里每个接口都会 401/403、
 *    页面显示成「载入失败」。可接受 —— 复核放这里就得把 D1 查询拖进首屏渲染路径。
 */
export const dynamic = 'force-dynamic';

export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const [store, locale] = await Promise.all([cookies(), readLocaleParam(params)]);
  const session = await verifyUserSession(store.get(USER_SESSION_COOKIE)?.value);
  if (!session) {
    redirect(`${localePath(locale, '/login')}?next=${encodeURIComponent('/account')}`);
  }

  return <>{children}</>;
}
