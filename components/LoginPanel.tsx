'use client';

import { useRouter } from 'next/navigation';
import AuthForm from './AuthForm';
import { useI18n } from './I18nProvider';

/**
 * 独立登录页（`/login`）里那张表单的**客户端壳**（2026-10-13 加）。
 *
 * 为什么需要这一层：`app/[locale]/login/page.tsx` 是服务端组件，而「登录成功后去哪儿」
 * 要在浏览器里做（`router.push`）—— 服务端组件没法把一个函数传给客户端表单。
 * 所以这一层只干一件事：**接住 `onAuthed`，然后导航**。
 *
 * **去哪儿**：
 *   · 有 `?next=` → 回那一页（顶栏那颗「登录」会自动带上当前页，见 `components/TopBar.tsx`）
 *   · 没有 → 回房间（`/room`）。登录本来就是为了玩，这是最合理的默认。
 *
 * ⚠️ `next` 是**不带语言前缀**的站内路径（`/games?q=mario` 这种），这里用
 *    `useI18n()` 的 `href()` 现拼当前语言的前缀 —— 直接 push 一个带 `/zh` 的值
 *    会在中文页上拼出 `/zh/zh/...`。合法性由服务端那一层校验过
 *    （见 `app/[locale]/login/page.tsx` 的 `parseNext`）。
 *
 * 表单本体是 `AuthForm` —— **和屋里那个账号浮层共用同一个**，两处各写一份迟早会漂。
 */
export default function LoginPanel({ next }: { next: string | null }) {
  const { href: localeHref } = useI18n();
  const router = useRouter();

  /* hideCloudLead：`/login` 页头的 lead（`login.lead`）已经说过「存到云端…即刻开玩」，
     表单里不再重复那一句（见 AuthForm 的 prop 注释） */
  return (
    <AuthForm
      hideCloudLead
      onAuthed={() => router.push(next ? localeHref(next) : localeHref('/room'))}
    />
  );
}
