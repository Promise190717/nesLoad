/*
 * 后台：游戏问题反馈列表。
 *
 * 和公开那份（app/api/game-reports/route.ts）**不是同一件事** —— 那边只有 POST，
 * 这张表只有后台读得到（报的可能是「打不开」这类没营养但能刷屏的内容，
 * 不该开公读入口）。
 *
 * 鉴权由本文件的 assertAdmin 自查（接口不挂 middleware，原因见 lib/server/admin-guard.ts）。
 */

import { NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/server/admin-guard';
import { listReports } from '@/lib/server/reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const limitText = params.get('limit');

  try {
    const page = await listReports({
      cursor: params.get('cursor'),
      limit: limitText ? Number(limitText) : undefined,
    });
    return NextResponse.json(page);
  } catch (error) {
    console.error('[admin] 游戏反馈列表读取失败', error);
    return NextResponse.json(
      { error: 'list-failed', detail: (error as Error).message },
      { status: 500 }
    );
  }
}
