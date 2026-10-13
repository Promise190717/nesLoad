/*
 * 删一条评论（`/api/comments/<id>`）。
 *
 * 这是评论这一版**唯一的「管理」手段**：站方没有后台评论 tab，能删的只有**作者本人**
 * （`deleteComment` 的 WHERE 里带着 user_id，见 lib/server/comments.ts）。
 * 所以「自己写错字了 / 说错话了」不用求人，点一下就撤。
 *
 * 只做 DELETE，一条 path 一个动作：
 *   · **不给 PATCH**（改评论）—— 公开内容被作者悄悄改过之后，底下别人的回复
 *     （将来真有回复的话）就对不上了；要改就删了重发，宁可留一道痕。
 *   · 也不给 GET（单条）—— 没有哪个界面需要单独读一条评论。
 *
 * 鉴权走 `assertUser`（写接口要查库复核封禁）；非作者 / 不存在 **一律 404**，
 * 不回 403 —— 别把「这条评论存在，但不是你的」这个信息透出去。
 */

import { NextResponse } from 'next/server';
import { assertUser } from '@/lib/server/app-guard';
import { deleteComment } from '@/lib/server/comments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await assertUser();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;

  try {
    const deleted = await deleteComment(id, guard.user.uid);
    if (!deleted) {
      return NextResponse.json({ error: 'not-found', detail: '找不到这条评论' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error('[comments] 删除失败', error);
    return NextResponse.json(
      { error: 'delete-failed', detail: (error as Error).message },
      { status: 500 }
    );
  }
}
