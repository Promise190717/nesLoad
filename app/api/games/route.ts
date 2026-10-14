/*
 * 前台游戏库列表（公开）—— **服务端分页**。
 *
 * 只返回前端展示与载入需要的信息：注意**不含** rom_url（真实对象 key），
 * ROM 由 /api/games/[id]/rom 代理下发，避免把存储结构暴露出去。
 *
 * 参数：`offset`（跳过几条）、`limit`（本页条数，默认 15）、`q`（可选关键词）、
 * `console`（可选机种，`nes` / `snes` / `gba` / `arcade`）。
 *
 * 过滤与分页**都在服务端**：前台早先是把整库一次拉回来、在浏览器里 filter + slice，
 * 2026-10-12 改成按页取数（「不要一次全部加载」）。一旦按页取数，本地 filter 就只能
 * 筛当页那几条 —— 翻页会换一批结果，等于没搜；分页也一样，本地 slice 的前提是
 * 手里有全量数据。所以关键词和机种都随查询一起下发。
 *
 * 代价是**每次翻页 / 改筛选 = 2 次 D1 查询**（COUNT + SELECT，见 lib/server/games.ts）。
 * 前端因此刻意保留「搜索是提交式」的写法（点「搜索」或回车才发请求），
 * 不让打字过程中每敲一个字就敲一次 D1。
 */

import { NextResponse } from 'next/server';
import { CONSOLE_TYPES } from '@/lib/consoles';
import { listGamesPage, MAX_PAGE_SIZE } from '@/lib/server/games';

export const runtime = 'nodejs';
// 走 D1 实时读，别让构建期把它静态化了（构建时并没有数据库凭据）
export const dynamic = 'force-dynamic';

/** 不传 limit 时的每页条数，和前台 GameLibraryPanel 的 `PAGE_SIZE` 对齐。 */
const DEFAULT_LIMIT = 15;

/** 从查询串里取一个非负整数，去掉小数与负号（别让 -1 / NaN 传到 SQL 里）。 */
function intParam(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const offset = intParam(params.get('offset'), 0);
  // `|| DEFAULT_LIMIT` 兜住 limit=0（那会让分页算不出页数）
  const limit = Math.min(intParam(params.get('limit'), DEFAULT_LIMIT) || DEFAULT_LIMIT, MAX_PAGE_SIZE);
  const keyword = params.get('q')?.trim() ?? '';

  // 认不出的机种一律当「不限」，别把非法值塞进 SQL。
  // 用 find 而不是 includes + 断言：这样 consoleType 天然就是 ConsoleType | null。
  const consoleParam = params.get('console');
  const consoleType = CONSOLE_TYPES.find((value) => value === consoleParam) ?? null;

  try {
    return NextResponse.json(await listGamesPage(offset, limit, { keyword, consoleType }));
  } catch (error) {
    console.error('[games] 列表读取失败', error);
    return NextResponse.json({ error: 'list-failed' }, { status: 500 });
  }
}
