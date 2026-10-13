/*
 * 单条云端历史（`/api/user/history/<gameId>`）。
 *
 *   DELETE 删掉这一款在历史里的那一条（个人中心历史 tab 的「删除」按钮）。
 *
 * 为什么路径段是 gameId 而不是别的 id：`user_history` 的主键是复合的
 * `(user_id, game_id)`，本来就没有独立主键 —— 「删这一条」= 「删这个人 + 这一款的交集」。
 * 归属校验靠 `user_id`（见 lib/server/user-data.ts 的 removeUserHistory，两条 WHERE 都带上），
 * 所以猜到别人的 gameId 也删不掉别人的东西。
 *
 * ⚠️ 只删历史，**不碰 `user_saves` / `user_favorites`** —— 用户删历史是「列表太长清一清」，
 * 不是「我不再玩这款了」。收藏和存档各有各的删除入口，别顺手一起清。
 *
 * ⚠️ 和 `/api/user/history`（集合）的那条 DELETE 分工不同：那条是**清空全部**，
 * 这条是**删单条**。两者都会调 assertUser。
 */

import { NextResponse } from 'next/server';
import { assertUser } from '@/lib/server/app-guard';
import { removeUserHistory } from '@/lib/server/user-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 删单条。删不到（不存在 / 不是你的）回 404 —— 不区分这两种，别泄露别人的历史。 */
export async function DELETE(_request: Request, context: { params: Promise<{ gameId: string }> }) {
  const guard = await assertUser();
  if (!guard.ok) return guard.response;

  // ⚠️ Next.js 的 `params` **已经是解码过的**，别再 `decodeURIComponent`
  // （id 里本来就含 `%` 时会二次解码抛 URIError）。项目里其它 `[id]` 路由也都直接用。
  const { gameId } = await context.params;

  try {
    const removed = await removeUserHistory(guard.user.uid, gameId);
    if (!removed) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[user] 删历史失败', error);
    return NextResponse.json({ error: 'delete-failed' }, { status: 500 });
  }
}
