/*
 * 后台 · 开发商下拉框用的「全量 id + 名字」。
 *
 * 为什么不让后台复用 `/api/admin/developers`（那个分页列表）：
 *   ① 分页有上限（`MAX_PAGE_SIZE = 100`），而下拉框缺一个名字就没法给游戏选它；
 *   ② 那个列表每行都带「名下游戏数」的相关子查询，只为了填个 `<select>` 白算一圈。
 * 这里只取两列、不分页，几百个开发商也就几 KB。
 *
 * 鉴权同样自查。数据是后台专用的（前台公开页面用的是服务端直读，不走这个接口）。
 */

import { NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/server/admin-guard';
import { listDeveloperOptions } from '@/lib/server/developers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await assertAdmin();
  if (denied) return denied;

  try {
    return NextResponse.json({ developers: await listDeveloperOptions() });
  } catch (error) {
    console.error('[admin] 开发商选项读取失败', error);
    return NextResponse.json(
      { error: 'list-failed', detail: (error as Error).message },
      { status: 500 }
    );
  }
}
