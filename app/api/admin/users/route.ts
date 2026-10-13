/*
 * 后台：前台用户列表。
 *
 * 鉴权由本文件的 assertAdmin 自查（接口不挂 middleware，原因见 lib/server/admin-guard.ts）。
 *
 * ⚠️ **这里管的是前台用户（app_users），不是管理员（users）**。后台自己那批账号
 *    没有管理界面 —— 它们是用 `scripts/create-user.mjs` 手工建的，一共就那么一两个，
 *    不需要一个 CRUD 页面（而且给管理员做一个能封禁管理员的页面，本身就是个风险面）。
 *
 * 列表带三个统计数（历史 / 存档 / 收藏各几条），后台扫一眼就知道哪个号是真在用。
 */

import { NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/server/admin-guard';
import { listAppUsersPage } from '@/lib/server/app-users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const limitText = params.get('limit');

  try {
    const page = await listAppUsersPage({
      cursor: params.get('cursor'),
      limit: limitText ? Number(limitText) : undefined,
    });
    return NextResponse.json(page);
  } catch (error) {
    console.error('[admin] 用户列表读取失败', error);
    return NextResponse.json(
      { error: 'list-failed', detail: (error as Error).message },
      { status: 500 }
    );
  }
}
