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
 * ⚠️ **2026-10-14 起走 `listGamesPageCached`（2026-10-16 起 24 小时缓存）** —— 用户拍板
 *    「前台的列表都加缓存」。代价是「后台刚传的游戏最多晚 24 小时才出现在这里」。在那之前这里是
 *    实时查库（每次翻页 / 改筛选 = 2 次 D1：COUNT + SELECT，见 lib/server/games.ts）。
 *    现在 COUNT 走独立缓存（键里没有 offset，翻多少页都只数一次），SELECT 按页缓存。
 *    **后台列表（`/api/admin/games`）不受影响，仍然实时 —— 2026-10-14 起还改成了
 *    游标翻页（`listAdminGamesPage`），每次只取一页、连 COUNT 都省了。**
 *
 * 前端因此刻意保留「搜索是提交式」的写法（点「搜索」或回车才发请求）——
 * 缓存键含关键词，打字过程中每敲一个字都会多产生一个缓存条目，没必要。
 */

import { NextResponse } from 'next/server';
import { CONSOLE_TYPES } from '@/lib/consoles';
import { listGamesPageCached, MAX_PAGE_SIZE } from '@/lib/server/games';

export const runtime = 'nodejs';
// 数据虽然走了缓存，路由本身仍要按请求读 searchParams —— 别让构建期把它静态化了
// （构建时并没有数据库凭据）。
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
    /*
     * 末尾那个 `null` 是**语种**那一维（2026-10-16 加的，机种专题页的 `?lang=` 在用）——
     * 在线库弹窗没有语种筛选，永远传 null = 不限。签名里留着它是为了让两处共用同一份
     * 缓存实现（键形状统一），见 lib/server/games.ts 的 listGamesPageCached。
     */
    return NextResponse.json(
      await listGamesPageCached(offset, limit, keyword, consoleType, null)
    );
  } catch (error) {
    console.error('[games] 列表读取失败', error);
    return NextResponse.json({ error: 'list-failed' }, { status: 500 });
  }
}
