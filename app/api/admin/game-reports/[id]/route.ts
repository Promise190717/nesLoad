/*
 * 后台：改一条游戏反馈的「已解决」标记。
 *
 * 只有这一个动作 —— 正文不给后台改（同留言本 app/api/admin/feedback/[id]/route.ts：
 * 被后台悄悄编辑过的反馈就不可信了）。
 *
 * 鉴权由本文件的 assertAdmin 自查（接口不挂 middleware，原因见 lib/server/admin-guard.ts）。
 */

import { NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/server/admin-guard';
import { setReportResolved } from '@/lib/server/reports';

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
    const found = await setReportResolved(id, body.resolved);
    if (!found) return fail('not-found', '找不到这条反馈', 404);
    return NextResponse.json({ ok: true, id, resolved: body.resolved });
  } catch (error) {
    console.error('[admin] 反馈标记失败', error);
    return fail('update-failed', (error as Error).message, 500);
  }
}
