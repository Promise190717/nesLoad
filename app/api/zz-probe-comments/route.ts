// 临时探针（验完即删）：确认新导出在**新编译的路由**里能不能拿到。
import { NextResponse } from 'next/server';
import * as comments from '@/lib/server/comments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    keys: Object.keys(comments).sort(),
    typeOfListUserComments: typeof (comments as Record<string, unknown>).listUserComments,
  });
}
