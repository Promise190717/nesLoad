/*
 * 个人资料（`/api/user/profile`）。
 *
 *   GET   取当前登录用户的资料（个人中心首屏、以及前台别处要显示头像时用）
 *   PATCH 改性别（body: `{ gender: 'male' | 'female' | null }`）
 *         ⚠️ 2026-10-13 起**只有 male / female / null（未知）三态** —— 原先那档
 *            `'other'` 已取消（它和「未知」在界面上是一回事）。见 lib/server/app-users.ts。
 *
 * 刻意**不给改名** —— 用户名是登录名，改了用户自己都记不住该拿什么登。
 * 管理员那套（/api/admin/users/<id>）也不给改。想换名就重新注册。
 *
 * ⚠️ 改密码**不在这条**，走 `/api/user/password`（那个要验旧密码，是一套独立的校验）。
 * ⚠️ 换头像也**不在这条**，走 `/api/user/avatar`（那个是 multipart 上传）。
 *    一条 route 只干一件事，前端拼起来用。
 *
 * 鉴权用 `assertUser`（**写接口，必须查库复核封禁**）。
 */

import { NextResponse } from 'next/server';
import { assertUser } from '@/lib/server/app-guard';
import { getAppUser, normalizeGender, setAppUserGender } from '@/lib/server/app-users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const guard = await assertUser();
  if (!guard.ok) return guard.response;

  try {
    /*
     * 从库里现取一份（而不是拿守卫里那份）—— 守卫的 AuthedUser 只有
     * uid / username / createdAt 三个字段，**没有**性别和头像。
     */
    const user = await getAppUser(guard.user.uid);
    if (!user) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    return NextResponse.json({ user });
  } catch (error) {
    console.error('[user] 读个人资料失败', error);
    return NextResponse.json({ error: 'profile-failed' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const guard = await assertUser();
  if (!guard.ok) return guard.response;

  let body: { gender?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }

  /*
   * `normalizeGender` 的三态：
   *   · 合法性别 → 写进去
   *   · null（省略 / 空串 / 显式 null）→ **清空**，这是合法的「不想填」
   *   · 'invalid' → 400
   * 注意「body 里没这个字段」也会走到 null 那一支，等于清空 —— 这符合预期：
   * 这个接口就是「把性别设成你给的值」，不给就是清掉。
   */
  const gender = normalizeGender(body.gender);
  if (gender === 'invalid') {
    return NextResponse.json({ error: 'invalid-gender' }, { status: 400 });
  }

  try {
    const user = await setAppUserGender(guard.user.uid, gender);
    if (!user) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    console.error('[user] 改性别失败', error);
    return NextResponse.json({ error: 'profile-failed' }, { status: 500 });
  }
}
