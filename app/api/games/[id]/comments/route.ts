/*
 * 某一款游戏的评论（`/api/games/<id>/comments`）。
 *
 *   GET   列表 —— **公开**：谁都能读这一款下面的评论（未登录照样读得到）
 *   POST  发一条 —— **必须登录**（用户明确要求：「评论之前必须登录」）
 *
 * 为什么评论要登录、而留言本（`/api/feedback`）和「反馈问题」（`/api/game-reports`）
 * 不用：那是三件不同的事 ——
 *   · 留言本说的是「这个站」，游戏反馈说的是「这一盘有问题」，都是一次性的话，
 *     匿名提交让门槛最低（那时候详情页上根本没有登录入口）；
 *   · 评论是**公开挂在某一款游戏下面的署名内容**。署了名才敢给所有人看，
 *     出了事也追得到人。这一页现在有登录入口了 —— 评论模块里那条「去登录」。
 *
 * ⚠️ 提交走 `assertUser`（会**查库复核封禁**），不是 `assertSession`：
 *    这是写接口，被封的人不该还能发评论（见 lib/server/app-guard.ts 那两条的说明）。
 *
 * GET 会在 cookie 里**顺手认一下人**（软凭据：只验签名、不查库），给每条打一个 `mine`
 * 标记（前端据此决定显不显示「删除」）。那**不是鉴权** —— 拿不到就是 null，列表照给。
 *
 * ⚠️ 响应里**不含 user_id**（理由见 lib/server/comments.ts 里 `Comment.userId` 的注释）。
 *
 * 星级（`rating`，1..5）和正文是**同一次提交、同一条记录**（2026-10-13 用户要求
 * 「评论有星星 1-5」）：这一版没有「只打分不写字」的通道，两个字段都必填，校验就写在这里
 * （唯一写入入口，数据库那层没有 CHECK —— 老库那列是 ALTER 补的，加不了约束，见 db/schema.sql）。
 *
 * GET 还会把这一款的**均分 / 评分数**（`summary`）跟列表一起给回来：它是**全量**算的，
 * 单独一条查询，别拿这一页的 `items` 现算（列表分页，均分必须全量 —— 见 lib/server/comments.ts）。
 */

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { assertUser } from '@/lib/server/app-guard';
import { USER_SESSION_COOKIE, verifyUserSession } from '@/lib/server/app-session';
import {
  COMMENT_MAX_LENGTH,
  RATING_MAX,
  RATING_MIN,
  getGameRatingSummary,
  insertComment,
  listGameComments,
  type Comment,
} from '@/lib/server/comments';
import { getGame } from '@/lib/server/games';

export const runtime = 'nodejs';
// 实时读 D1，别让构建期把它静态化了（构建时并没有数据库凭据）
export const dynamic = 'force-dynamic';

function fail(error: string, detail: string, status = 400) {
  return NextResponse.json({ error, detail }, { status });
}

/** 摘掉 user_id，换成前端能用的 `mine` 标记。 */
function publicItem(comment: Comment, viewerId: string | null) {
  return {
    id: comment.id,
    username: comment.username,
    avatarUrl: comment.avatarUrl,
    content: comment.content,
    rating: comment.rating,
    createdAt: comment.createdAt,
    /* 未登录一律 false */
    mine: viewerId !== null && comment.userId === viewerId,
  };
}

/**
 * 软读当前登录者：**只验签名、不查库**，返回 uid 或 null。
 *
 * 和 `app/[locale]/login/page.tsx` 同一个取舍 —— 列表是公开数据，为了打一个「是不是我写的」
 * 标记去查一次 D1 不值当；真要紧的那道闸在 POST 的 `assertUser` 里。
 * 封禁用户在这里仍然会看到自己旧评论上的「删除」，点下去 DELETE 会拿到 403 —— 可以接受。
 */
async function readViewer(): Promise<string | null> {
  const store = await cookies();
  const session = await verifyUserSession(store.get(USER_SESSION_COOKIE)?.value);
  return session?.uid ?? null;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const params = new URL(request.url).searchParams;
  /* 非法 / 缺省都落到 undefined，由数据层的 clampLimit 收敛（`Number('abc')` 是 NaN） */
  const limit = Number(params.get('limit')) || undefined;

  try {
    /*
     * 认人、取列表、算汇总**并行**（三个互不依赖的动作，串行就是白等两个来回）。
     * 均分单独一条查询：它要全量，不能拿当前这一页去算（见 lib/server/comments.ts）。
     * 数据层的 `game_id` 不存在的游戏会返回空列表而不是报错 —— GET 不校验游戏是否在库，
     * 页面那边本来就先 `getGame` 过一道（拿不到就 404 了）。
     */
    const [viewerId, page, summary] = await Promise.all([
      readViewer(),
      listGameComments(id, { cursor: params.get('cursor'), limit }),
      getGameRatingSummary(id),
    ]);

    return NextResponse.json({
      signedIn: viewerId !== null,
      items: page.items.map((comment) => publicItem(comment, viewerId)),
      nextCursor: page.nextCursor,
      /* 均分 / 评分数。跟着列表回来，首屏就不用为这一个数多发一次请求（翻页时它照给一遍，值不变）。 */
      summary,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[comments] 列表读取失败', error);
    return fail('list-failed', (error as Error).message, 500);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await assertUser();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('bad-request', '无法解析请求数据');
  }

  // 前端也会拦一道（空串 / 纯空白不让提交），这里是**服务端那道**，不能省
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) return fail('content-required', '写点什么再发表吧');
  if (content.length > COMMENT_MAX_LENGTH) {
    return fail('content-too-long', `最多 ${COMMENT_MAX_LENGTH} 个字`);
  }

  /*
   * 星级。**必填**，且只认 1..5 的整数 —— `Number.isInteger` 顺手把
   * "4" 这类字符串、4.5、NaN、undefined 全挡在外面（`Number(true)` 是 1，也认了，
   * 但那是既有行为、无害：真正要紧的是别让 0 / 6 / 99 这种值落库）。
   */
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < RATING_MIN || rating > RATING_MAX) {
    return fail('rating-invalid', `请给 ${RATING_MIN}-${RATING_MAX} 星的分`);
  }

  try {
    // 先确认这一款还在库里 —— 免得把评论挂到一条已经下架的 id 上
    const game = await getGame(id);
    if (!game) return fail('not-found', '找不到这款游戏', 404);

    const comment = await insertComment({
      gameId: id,
      userId: guard.user.uid,
      username: guard.user.username,
      content,
      rating,
    });
    // 刚发的这条当然是自己的
    return NextResponse.json({ ok: true, item: publicItem(comment, guard.user.uid) });
  } catch (error) {
    console.error('[comments] 发表失败', error);
    return fail('insert-failed', (error as Error).message, 500);
  }
}
