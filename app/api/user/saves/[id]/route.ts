/*
 * 单份云端存档（`/api/user/saves/<id>`）。
 *
 *   GET    把这一份的**字节**流回浏览器（服务端回源代理），
 *          前端直接 `res.blob()` 交给 `controller.loadStateFrom`
 *   DELETE 删掉这一份（行 + R2 对象）
 *
 * ⚠️ **GET 为什么是代理而不是回一个 R2 公网地址**（2026-10-13 改）：
 *    以前回的是 `{ slot, url }`，前端拿 url 再直连 R2。实测那条路走不通 ——
 *    浏览器跨域 `fetch` 会被 R2 桶的 CORS 挡掉，报 `TypeError: Failed to fetch`。
 *    ROM 那条路（`/api/games/[id]/rom`）当初就是为同一个理由走的服务端回源，
 *    存档这里补上。代价是这几 MB 要穿过一次 Node 进程，换取「一次请求拿到字节」。
 *    （原来那段「靠 key 不可猜、不靠鉴权」的取舍说明见 lib/server/user-data.ts
 *    的 `getUserSaveUrl`，仍然成立 —— 这里只是把最后的取字节挪到了服务端。）
 *
 * ⚠️ **没有「更新」**：本地那套也是「每次存档开一个新槽」（时间是唯一区分方式，
 *    见 lib/saves.ts 的 saveSlot），云端照抄同一个规则。槽位满了由写入方淘汰
 *    （createUserSave 里那份），这里不需要 PATCH。
 *
 * 归属校验全在 `lib/server/user-data.ts` 里（每个查询都带 `WHERE user_id = ?`）——
 * 猜到别人的 save id 也没用，那道 WHERE 过不去。
 */

import { NextResponse } from 'next/server';
import { assertUser } from '@/lib/server/app-guard';
import { getUserSaveUrl, removeUserSave } from '@/lib/server/user-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 取字节并流回浏览器。查不到（不存在 / 不是你的）回 404，回源失败回 502。 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await assertUser();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;

  // 第一步：按 (userId, saveId) 查出这一份 —— 顺带就是归属校验
  let found: { url: string } | null;
  try {
    found = await getUserSaveUrl(guard.user.uid, id);
  } catch (error) {
    console.error('[user] 取存档地址失败', error);
    return NextResponse.json({ error: 'lookup-failed' }, { status: 500 });
  }
  if (!found) return NextResponse.json({ error: 'not-found' }, { status: 404 });

  // 第二步：服务端回源 R2，把字节流转出去（不落内存，和 ROM 代理同一套）
  let upstream: Response;
  try {
    upstream = await fetch(found.url, { cache: 'no-store' });
  } catch (error) {
    console.error('[user] 存档回源失败', error);
    return NextResponse.json({ error: 'upstream-error' }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'upstream-error' }, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      // 存档是账号私有数据，别让中间层缓存（同 ROM 那条不同：ROM 是公开的）
      'Cache-Control': 'no-store',
    },
  });
}

/** 删掉这一份。删不到（不存在 / 不是你的）回 404 —— 不区分这两种，别泄露别人的 id 存不存在。 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await assertUser();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  try {
    const removed = await removeUserSave(guard.user.uid, id);
    if (!removed) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[user] 删存档失败', error);
    return NextResponse.json({ error: 'delete-failed' }, { status: 500 });
  }
}
