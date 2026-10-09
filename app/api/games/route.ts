/*
 * 前台游戏库列表（公开）。
 *
 * 只返回前端展示与载入需要的信息：注意**不含** rom_url（真实对象 key），
 * ROM 由 /api/games/[id]/rom 代理下发，避免把存储结构暴露出去。
 */

import { NextResponse } from 'next/server';
import { listGames } from '@/lib/server/games';

export const runtime = 'nodejs';
// 走 D1 实时读，别让构建期把它静态化了（构建时并没有数据库凭据）
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ games: await listGames() });
  } catch (error) {
    console.error('[games] 列表读取失败', error);
    return NextResponse.json({ error: 'list-failed' }, { status: 500 });
  }
}