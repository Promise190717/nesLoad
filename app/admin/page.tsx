import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AdminConsole from '@/components/AdminConsole';
import { SESSION_COOKIE, verifySession } from '@/lib/server/session';

// 要读 cookie 判登录态，天然动态
export const dynamic = 'force-dynamic';

/**
 * 后台管理页。
 * middleware 已经拦过一道，这里再校验一次是「纵深防御」：
 * 会话过期、或将来 matcher 被改动时，页面自己也不会漏出去。
 */
export default async function AdminPage() {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) redirect('/admin/login');

  return <AdminConsole username={session.username} />;
}