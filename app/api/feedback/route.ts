/*
 * 留言本（公开）。
 *
 * GET ：按游标翻页拉列表，新的在前。`?cursor=<上一页返回的 nextCursor>`，不传就是第一页。
 * POST：提交一条留言。**不需要登录** —— 房间里没有账号体系，留言本本来就是给
 *       随便哪个来访者写的。代价是没有作者可追、只能靠长度上限 + 后台人工处理
 *       挡刷屏（见下面 MAX_LENGTH 那段）。
 *
 * 注意 GET 是公开的：留言内容对所有人可见。这是「打开就是一张留言列表」的直接后果。
 *
 * GET 的结果在 `lib/server/feedback.ts` 里带一层 30 秒的**进程内缓存**（D1 走 REST，
 * 每次查询都要花配额）。写入会把那份缓存整份清掉，所以自己提交完立刻就能看到。
 */

import { NextResponse } from 'next/server';
import {
  FEEDBACK_MAX_LENGTH,
  insertFeedback,
  listFeedback,
} from '@/lib/server/feedback';

export const runtime = 'nodejs';
// 实时读 D1，别让构建期把它静态化了（构建时并没有数据库凭据）
export const dynamic = 'force-dynamic';

function fail(error: string, detail: string, status = 400) {
  return NextResponse.json({ error, detail }, { status });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const limitText = params.get('limit');

  try {
    const page = await listFeedback({
      cursor: params.get('cursor'),
      limit: limitText ? Number(limitText) : undefined,
    });
    return NextResponse.json(page);
  } catch (error) {
    console.error('[feedback] 列表读取失败', error);
    return fail('list-failed', (error as Error).message, 500);
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('bad-request', '无法解析请求数据');
  }

  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) return fail('content-required', '写点什么再提交吧');
  if (content.length > FEEDBACK_MAX_LENGTH) {
    return fail('content-too-long', `最多 ${FEEDBACK_MAX_LENGTH} 个字`);
  }

  try {
    const item = await insertFeedback(content);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    console.error('[feedback] 提交失败', error);
    return fail('insert-failed', (error as Error).message, 500);
  }
}
