/*
 * 后台：改一条留言的「已解决」标记。
 *
 * 只有这一个动作 —— 留言正文不给后台改。写下来的话被后台悄悄编辑过，
 * 那这本留言本就没有可信度了；要纠正就在前台另写一条回复。
 *
 * 鉴权由本文件的 assertAdmin 自查（接口不挂 middleware，原因见 lib/server/admin-guard.ts）。
 */

import { NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/server/admin-guard';
import { setFeedbackResolved } from '@/lib/server/feedback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fail(error: string, detail: string, status = 400) {
  return NextResponse.json({ error, detail }, { status });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('bad-request', '无法解析请求数据');
  }

  if (typeof body.resolved !== 'boolean') {
    return fail('bad-resolved', 'resolved 必须是布尔值');
  }

  try {
    const found = await setFeedbackResolved(id, body.resolved);
    if (!found) return fail('not-found', '找不到这条留言', 404);
    return NextResponse.json({ ok: true, id, resolved: body.resolved });
  } catch (error) {
    console.error('[admin] 留言标记失败', error);
    return fail('update-failed', (error as Error).message, 500);
  }
}
