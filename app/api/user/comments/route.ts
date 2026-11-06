/*
 * 我的评论（`/api/user/comments`）—— 个人中心「评论」tab 用（2026-11-06 加）。
 *
 * 只有 GET：列表。**删除不在这里** —— 作者删自己的评论走 `DELETE /api/comments/<id>`
 * （`deleteComment` 的 WHERE 里带 user_id），个人中心直接复用那一条，
 * 不另开一个「自己的删除」入口（同一条规则只该有一个出口）。
 *
 * 和公开列表（`/api/games/[id]/comments`）的区别：
 *   · 只返回**当前登录用户**写的（数据层 `WHERE c.user_id = ?`，见 listUserComments）；
 *   · 多带 `gameTitle`（这一页不在游戏详情页上，光有 slug 不知道说的是哪款）；
 *   · 不回 `username` / `avatarUrl` —— 看的是自己的评论，头像名字页头已经有了。
 *
 * 鉴权走 `assertUser`（读接口不查库复核封禁，同其它 `/api/user/*`）。
 */

import { NextResponse } from 'next/server';
import { assertUser } from '@/lib/server/app-guard';
import { listUserComments } from '@/lib/server/comments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const guard = await assertUser();
  if (!guard.ok) return guard.response;

  const params = new URL(request.url).searchParams;
  const limitText = params.get('limit');

  try {
    const page = await listUserComments(guard.user.uid, {
      cursor: params.get('cursor'),
      limit: limitText ? Number(limitText) : undefined,
    });
    return NextResponse.json({
      items: page.items.map((item) => ({
        id: item.id,
        gameId: item.gameId,
        gameTitle: item.gameTitle,
        content: item.content,
        rating: item.rating,
        createdAt: item.createdAt,
      })),
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    /*
     * 把原始 message 带出去（同 `/api/games/<id>/comments` 那份）：这条只在登录后
     * 自己看，错误信息不涉密，出问题时光看 Network 面板就能定位。
     */
    console.error('[user] 我的评论读取失败', error);
    return NextResponse.json(
      { error: 'list-failed', detail: (error as Error).message },
      { status: 500 }
    );
  }
}
