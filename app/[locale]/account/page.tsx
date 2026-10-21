import type { Metadata } from 'next';
import AccountCenter from '@/components/AccountCenter';
import { parseAccountTab } from '@/lib/account-tabs';
import { readLocaleParam } from '@/lib/server/locale';
import { translate } from '@/lib/i18n';

/*
 * `/account` —— 个人中心（2026-10-13 加）。
 *
 * 五个 tab：收藏 / 历史 / 存档 / 资料 / 密码（当前 tab 在 `?tab=` 上，见文件末尾）。
 * 页面的鉴权在 `app/[locale]/account/layout.tsx` 里（未登录重定向到登录页）。
 *
 * **为什么做成真路由而不是再弹一个面板**（用户 2026-10-13 明确要的「个人中心页面」）：
 * 这里是「管理」而不是「玩」—— 列表长、要滚动、要填表单，塞进一个弹层里只会挤成一团。而且它有独立地址，能被直接分享 / 收藏。
 *
 * ⚠️ **noindex**：个人中心是每个用户各自的一份私有视图，没有任何公共内容 ——
 *    被收录只会让搜索引擎抓到一个空的（未登录时是重定向）页面。
 *    这一页的可见性也不靠搜索，靠那颗账号钮。
 *
 * 语言由根布局的 `I18nProvider` 提供，页面本身不需要往下传 `locale`
 * （`AccountCenter` 是客户端组件，用 `useI18n()` 取）。
 *
 * 这一页**不写 `export const dynamic`** —— layout 里已经 `cookies()` 过（天然动态），
 * 再声明一次是多余的。
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = await readLocaleParam(params);
  return {
    title: translate(locale, 'account.title'),
    robots: { index: false, follow: false },
  };
}

/*
 * `?tab=` 上带着初始 tab（2026-10-14 加，用户要求刷新后停在原 tab，别永远回到收藏）。
 * 解析走 lib/account-tabs.ts 的 `parseAccountTab`（白名单 + 回落收藏）——
 * ⚠️ 不能从 AccountCenter（'use client'）导函数给服务端调，见 lib 里那条注释。
 * 服务端算好再传 prop —— 客户端组件内不再读 location，首屏 HTML 和水合结果天然一致。
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return <AccountCenter initialTab={parseAccountTab(tab)} />;
}
