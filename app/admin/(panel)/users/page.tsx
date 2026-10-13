import AdminUsers from '@/components/AdminUsers';

/**
 * 后台 · 用户管理（2026-10-13 加）。
 *
 * ⚠️ **必须放在 `(panel)` 这个路由组里** —— 组里的 layout.tsx 做鉴权（读会话 cookie，
 *    没登录就 redirect 到 /admin/login）。放到组外就等于绕开了鉴权。
 *    外壳在 `app/admin/(panel)/layout.tsx`。
 *
 * 这里管的是**前台注册用户**（app_users 表），不是后台管理员（users 表）——
 * 管理员账号是 `scripts/create-user.mjs` 建的，没有界面，理由见 AdminUsers 顶部注释。
 */
export default function AdminUsersPage() {
  return <AdminUsers />;
}
