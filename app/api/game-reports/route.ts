/*
 * 游戏问题反馈（公开提交）。
 *
 * POST：提交一条。body `{ gameId, content }`。**不需要登录** —— 详情页
 *       `/games/<id>` 上没有登录入口，要求登录等于把这条路堵死；代价是查不出作者，
 *       只能靠长度上限 + 后台人工处理挡刷屏（同留言本 app/api/feedback/route.ts）。
 *
 * ⚠️ **没有 GET**。和留言本**故意不同**：那条留言是「所有人可读」的公开留言板，
 *    这条是**只给后台看的问题单** —— 报的可能是「这一款一打开就黑屏」这种
 *    对玩家没意义、却能被拿来刷屏的内容。要读列表去 /api/admin/game-reports。
 *
 * 提交前**先确认这款游戏还在库里**（`getGame`）：
 *   · 不在就直接 404 —— 免得把垃圾数据写进表；
 *   · 顺便把**游戏名**带下去当快照（数据层不再回查 games）。
 */

import { NextResponse } from 'next/server';
import { getGame } from '@/lib/server/games';
import { REPORT_MAX_LENGTH, insertReport } from '@/lib/server/reports';

export const runtime = 'nodejs';
// 实时读 D1，别让构建期把它静态化了（构建时并没有数据库凭据）
export const dynamic = 'force-dynamic';

function fail(error: string, detail: string, status = 400) {
  return NextResponse.json({ error, detail }, { status });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('bad-request', '无法解析请求数据');
  }

  const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
  if (!gameId) return fail('game-required', '缺少游戏 id');

  // 前端也会拦一道（空串 / 纯空白不让提交），这里是**服务端那道**，不能省
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) return fail('content-required', '写点什么再提交吧');
  if (content.length > REPORT_MAX_LENGTH) {
    return fail('content-too-long', `最多 ${REPORT_MAX_LENGTH} 个字`);
  }

  try {
    const game = await getGame(gameId);
    if (!game) return fail('not-found', '找不到这款游戏', 404);

    const item = await insertReport({ gameId, gameTitle: game.title, content });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    console.error('[game-reports] 提交失败', error);
    return fail('insert-failed', (error as Error).message, 500);
  }
}
