/*
 * 后台：删一条评论（2026-11-06 加「评论」tab）。
 *
 * 只有这一个动作 —— **正文不给后台改**（同留言本 / 游戏反馈那两份：
 * 被后台悄悄编辑过的评论就不可信了，要改只能是作者自己删了重发）。
 *
 * 和作者自己删（app/api/comments/[id]/route.ts）的区别：
 * 那条路按 `id + user_id` 删，这条不认作者。两条路分开写而不是给同一个函数
 * 加开关，理由见 lib/server/comments.ts 的 `adminDeleteComment`。
 *
 * 鉴权由本文件的 assertAdmin 自查（接口不挂 middleware，原因见 lib/server/admin-guard.ts）。
 */

import { NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/server/admin-guard';
import { adminDeleteComment } from '@/lib/server/comments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await context.params;

  try {
    const found = await adminDeleteComment(id);
    if (!found) {
      return NextResponse.json({ error: 'not-found', detail: '找不到这条评论' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error('[admin] 评论删除失败', error);
    return NextResponse.json(
      { error: 'delete-failed', detail: (error as Error).message },
      { status: 500 }
    );
  }
}
