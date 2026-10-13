/*
 * 收藏（`/api/user/favorites`）。
 *
 *   GET    我的收藏列表（游戏资料现查 games，已下架的自动过滤掉）
 *   POST   加一款收藏（body: `{ gameId }`）
 *   DELETE 取消一款收藏（`?gameId=`）
 *
 * 「收藏了哪几款」这个概念在前端有**两个用途**，接口刻意分开：
 *   · 画星标 → 只要 id 集合，走 `GET /api/user/favorites?ids=1`（轻）
 *   · 我的收藏 tab → 要完整游戏资料，走不带参数的 GET
 * 两者共用一条 route，靠 `ids` 参数分流。
 *
 * 时机上的约定：**载入成功之后才写收藏** —— 不对，收藏和载入没关系。
 * 用户点星标就收藏，不管有没有玩过。这条和「历史只在载入成功后写」不一样，
 * 别把两者混起来。
 *
 * ⚠️ 收藏 / 取消都是**幂等**的（数据层用 ON CONFLICT DO NOTHING + 先查后删），
 *    所以前端连点两下不会出问题。
 */

import { NextResponse } from 'next/server';
import { assertUser } from '@/lib/server/app-guard';
import { getGame } from '@/lib/server/games';
import {
  addUserFavorite,
  listUserFavoriteIds,
  listUserFavorites,
  removeUserFavorite,
} from '@/lib/server/user-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const guard = await assertUser();
  if (!guard.ok) return guard.response;

  const params = new URL(request.url).searchParams;
  try {
    /*
     * `?ids=1` —— 只要 id 数组。
     *
     * 这条是给「卡片上的星标」用的：游戏库列表里一张卡片要不要点亮星星，
     * 只认「我收过这款没有」。走完整列表接口的话，前端得拿十几条游戏资料
     * 去和自己那份列表比对，纯属浪费。
     */
    if (params.get('ids') === '1') {
      return NextResponse.json({ ids: await listUserFavoriteIds(guard.user.uid) });
    }
    return NextResponse.json({ items: await listUserFavorites(guard.user.uid) });
  } catch (error) {
    console.error('[user] 收藏读取失败', error);
    return NextResponse.json({ error: 'list-failed' }, { status: 500 });
  }
}

/** 加收藏。已收藏时返回 `{ ok: true, added: false }` —— 不是错误。 */
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
    // 只让在库的游戏进收藏 —— 和写历史同一个闸
    const game = await getGame(gameId);
    if (!game) return NextResponse.json({ error: 'not-found' }, { status: 404 });

    const added = await addUserFavorite(guard.user.uid, gameId);
    return NextResponse.json({ ok: true, added });
  } catch (error) {
    console.error('[user] 加收藏失败', error);
    return NextResponse.json({ error: 'favorite-failed' }, { status: 500 });
  }
}

/** 取消收藏。没收藏过时返回 `{ ok: true, removed: false }` —— 同样不是错误。 */
export async function DELETE(request: Request) {
  const guard = await assertUser();
  if (!guard.ok) return guard.response;

  const gameId = new URL(request.url).searchParams.get('gameId')?.trim() ?? '';
  if (!gameId) return NextResponse.json({ error: 'missing-game' }, { status: 400 });

  try {
    const removed = await removeUserFavorite(guard.user.uid, gameId);
    return NextResponse.json({ ok: true, removed });
  } catch (error) {
    console.error('[user] 取消收藏失败', error);
    return NextResponse.json({ error: 'favorite-failed' }, { status: 500 });
  }
}
