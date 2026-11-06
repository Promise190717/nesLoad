/*
 * 后台：全站评论列表（2026-11-06 加「评论」tab）。
 *
 * 和公开那份（app/api/games/[id]/comments/route.ts）**不是同一件事**：
 * 那边按游戏分页、给所有访客看；这边是全站最新评论、只给后台。
 *
 * 两处刻意不同：
 *  · **用户名给真名**。公开接口出网前要过 `maskUserName`（`lib/mask.ts`）；
 *    后台要处理刷屏的号，遮成 `a***e` 就认不出是谁了 —— 所以在这里**不遮**。
 *  · **`userId` 仍然不出现**（同公开接口的口径，见 lib/server/comments.ts 里
 *    `Comment.userId` 的注释）。后台也不需要它：删评论认的是评论 id。
 *
 * 鉴权由本文件的 assertAdmin 自查（接口不挂 middleware，原因见 lib/server/admin-guard.ts）。
 */

import { NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/server/admin-guard';
import { listAllComments } from '@/lib/server/comments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const limitText = params.get('limit');

  try {
    const page = await listAllComments({
      cursor: params.get('cursor'),
      limit: limitText ? Number(limitText) : undefined,
    });
    return NextResponse.json({
      items: page.items.map((item) => ({
        id: item.id,
        gameId: item.gameId,
        gameTitle: item.gameTitle,
        username: item.username,
        content: item.content,
        rating: item.rating,
        createdAt: item.createdAt,
      })),
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    console.error('[admin] 评论列表读取失败', error);
    return NextResponse.json(
      { error: 'list-failed', detail: (error as Error).message },
      { status: 500 }
    );
  }
}
