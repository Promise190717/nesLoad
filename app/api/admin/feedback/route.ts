/*
 * 后台的留言列表。
 *
 * 和公开那份走同一个 listFeedback（同一套游标翻页），差别只在**要过鉴权**：
 * 留言内容本身是公开的，但「谁在处理」不该让外部拿到批量拉取的入口。
 *
 * 鉴权由本文件的 assertAdmin 自查（接口不挂 middleware，原因见 lib/server/admin-guard.ts）。
 */

import { NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/server/admin-guard';
import { listFeedback } from '@/lib/server/feedback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const limitText = params.get('limit');

  try {
    const page = await listFeedback({
      cursor: params.get('cursor'),
      limit: limitText ? Number(limitText) : undefined,
    });
    return NextResponse.json(page);
  } catch (error) {
    console.error('[admin] 留言列表读取失败', error);
    return NextResponse.json({ error: 'list-failed', detail: (error as Error).message }, { status: 500 });
  }
}
