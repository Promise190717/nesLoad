/*
 * 前台「按 id 取一条游戏」（公开）—— 首页 `?id=` 深链、以及任何需要单条数据的客户端用。
 *
 * 为什么要有它：`/api/games` 是**分页列表**，前端手里没有全量数据（2026-10-12 起），
 * 想按 id 找一条就只能翻页找 —— 那是碰运气。详情页 / 下载页是服务端组件、直接查库，
 * 不需要这个接口；需要它的是**首页那个 `?id=` 深链**（客户端组件，只能走 HTTP）。
 *
 * 返回的是和列表里**同一种**形状（`lib/server/games.ts` 的 `Game`）：
 * **不含 `rom_url`** —— 真实对象 key 只走 /api/games/[id]/rom 代理，别在这儿漏出去。
 *
 * 找不到就 404 + 一个稳定的机器码（前端据此弹「找不到这个游戏」）。
 *
 * ⚠️ 这个路由和 `./rom/` 是**同一个 id 命名空间**下的两条路：Next 会先把 `[id]`
 * 那一段吃掉再匹配静态的 `rom`，所以 `/api/games/xxx/rom` 走的是 rom 那条，
 * 不会落到这里（静态段优先于动态段）。
 */

import { NextResponse } from 'next/server';
import { getGame } from '@/lib/server/games';

export const runtime = 'nodejs';
// 走 D1 实时读，别让构建期把它静态化（构建时并没有数据库凭据）
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const game = await getGame(id);
    if (!game) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    return NextResponse.json({ game });
  } catch (error) {
    console.error('[games] 单条读取失败', error);
    return NextResponse.json({ error: 'lookup-failed' }, { status: 500 });
  }
}
