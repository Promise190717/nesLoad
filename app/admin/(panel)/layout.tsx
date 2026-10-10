import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import { SESSION_COOKIE, verifySession } from '@/lib/server/session';

// 要读 cookie 判登录态，天然动态
export const dynamic = 'force-dynamic';

/**
 * 后台两个 tab 页共用的外壳（顶栏 + 左侧 tab 栏）。
 *
 * **为什么套一层 `(panel)` 路由组**：`/admin/login` 也挂在 `/admin` 下面，
 * 直接把 layout 放在 `app/admin/` 会让登录页也被要求登录 —— 重定向到自己，死循环。
 * 路由组不影响 URL（`(panel)/games` 仍然是 `/admin/games`），只把「要登录的这几页」
 * 圈在一起。**往里加页面时记得加到这一组里**，加到 `app/admin/` 下面就绕过了这层壳。
 *
 * 鉴权放在这里而不是各页里：middleware 已经拦过一道（见 middleware.ts），
 * 这里再校验一次是「纵深防御」—— 会话过期、或将来 matcher 被改动时，页面自己也不会漏出去。
 * 放在 layout 里，两个页面共用这一次校验，不用各写一遍。
 * 校验是纯 HMAC（lib/server/session.ts），**不碰数据库**，所以重复校验没有配额代价。
 */
export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) redirect('/admin/login');

  return <AdminShell username={session.username}>{children}</AdminShell>;
}
