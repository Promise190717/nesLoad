/*
 * 前台「按 id 取一条游戏」（公开）—— `/play?id=` 那条深链的兜底、
 * 以及任何需要单条数据的客户端用。
 *
 * 为什么要有它：`/api/games` 是**分页列表**，前端手里没有全量数据（2026-10-12 起），
 * 想按 id 找一条就只能翻页找 —— 那是碰运气。详情页 / 下载页是服务端组件、直接查库，
 * 不需要这个接口。
 *
 * ⚠️ **`/play?id=` 2026-10-14 起不再走这里**：那一页的服务端为出 meta
 * 已经查过这一款（React `cache()` 那一份），直接当 props 递进场景组件了。
 * 这个接口只剩**兜底**用途 —— 服务端那趟查询抛异常时，客户端深链 effect 会退回
 * 这里重新取一次。别的调用方若要按 id 拿单条，它仍然公开可用。
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
import { getGameFullCached } from '@/lib/server/sb-games';

export const runtime = 'nodejs';
/*
 * 实时生成，但**数据层吃缓存**（2026-11-07 改）。
 *
 * 2026-10-20 那句「接口一律不缓存」的原意是「别把整条响应静态化，后台改了要能看到」，
 * 当时改成了每次实时查库。那是用错了手段：这条接口要跑 4~6 次 Supabase 往返
 * （实测 2~5 秒），而免费版 Workers 每条请求只有 10ms CPU —— 冷 isolate 打穿之后
 * Cloudflare 直接回 503 空体，线上表现是「某个边缘节点一直失败、换节点就好」。
 *
 * 现在把新鲜度交给 `games` tag（后台改数据 → `revalidateTag('games')` → 立刻失效），
 * 请求本身仍然每次现取，只是取的是 R2 里那份（几十毫秒）。`force-dynamic` 保留：
 * 这条路由有动态 id，静态化没有意义，也会让 `?` 之后的参数变成构建期常量。
 *
 * 关于 `unstable_cache` 能不能在 route handler 里用：能。它是 Next 的 Data Cache，
 * 和页面 ISR 是两套东西，挂在 R2 binding 上，不依赖页面的渲染模式。
 */
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const game = await getGameFullCached(id);
    if (!game) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    return NextResponse.json({ game });
  } catch (error) {
    console.error('[games] 单条读取失败', error);
    return NextResponse.json({ error: 'lookup-failed' }, { status: 500 });
  }
}
