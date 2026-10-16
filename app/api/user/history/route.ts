/*
 * 云端游戏历史（`/api/user/history`）。
 *
 * 只记**在线游戏库里的游戏**（用户 2026-10-13 明确要求）——
 * `POST` 会先确认 `game_id` 真的在 games 表里，不在就 404。
 * 本机拖进来的文件走不到这里（本地历史是另一套，见 lib/library.ts）。
 *
 * 和本地那份的时机一致：**载入成功之后才写**（由前端在 `loadRemote` 成功那段调）。
 * 失败的不进历史 —— 免得列表里堆一批点不动的死条目。
 */

import { NextResponse } from 'next/server';
import { assertUser } from '@/lib/server/app-guard';
import { getGame, localizeTexts } from '@/lib/server/games';
import { clearUserHistory, listUserHistory, recordHistory } from '@/lib/server/user-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 取当前用户的历史（最近玩的在前）。 */
export async function GET() {
  const guard = await assertUser();
  if (!guard.ok) return guard.response;

  try {
    return NextResponse.json({ items: await listUserHistory(guard.user.uid) });
  } catch (error) {
    console.error('[user] 历史读取失败', error);
    return NextResponse.json({ error: 'list-failed' }, { status: 500 });
  }
}

/**
 * 记一次游玩。
 *
 * body: `{ gameId }` —— **其余字段一律从 games 表现取**，不接受前端传名字 / 封面。
 * 理由：那些是快照字段，让前端传就等于让前端往库里写任意文本（有人能把历史列表
 * 改成自己想要的任何样子）。而且游戏改名之后，下次玩自然会写上新的那份。
 */
export async function POST(request: Request) {
  const guard = await assertUser();
  if (!guard.ok) return guard.response;

  let body: { gameId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }

  const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : '';
  if (!gameId) return NextResponse.json({ error: 'missing-game' }, { status: 400 });

  try {
    const game = await getGame(gameId);
    // 不在库里的（已下架、或者本机文件随便编的 id）一律不记
    if (!game) return NextResponse.json({ error: 'not-found' }, { status: 404 });

    await recordHistory(guard.user.uid, {
      gameId: game.id,
      /*
       * 快照字段：`user_history.title` 只是「当时叫什么」的留档 ——
       * 列表读取时走 JOIN `game_texts` 现取（见 lib/server/user-data.ts），
       * 所以这里取**中文原文**（站内主名字），取不到就退到别的语言那一份。
       */
      title: localizeTexts(game.texts, 'zh').title,
      imageUrl: game.imageUrl,
      romName: game.romName,
      consoleType: game.consoleType,
    });

    return NextResponse.json({ ok: true, items: await listUserHistory(guard.user.uid) });
  } catch (error) {
    console.error('[user] 写历史失败', error);
    return NextResponse.json({ error: 'record-failed' }, { status: 500 });
  }
}

/**
 * 清空历史。
 *
 * ⚠️ 用 DELETE 而不是 POST —— 它删的就是「这个人的全部历史」，
 * 语义上就是一次集合级的删除。前台那颗「清空」按钮调它。
 */
export async function DELETE() {
  const guard = await assertUser();
  if (!guard.ok) return guard.response;

  try {
    await clearUserHistory(guard.user.uid);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[user] 清空历史失败', error);
    return NextResponse.json({ error: 'clear-failed' }, { status: 500 });
  }
}
