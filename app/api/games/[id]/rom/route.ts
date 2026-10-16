/*
 * ROM 代理：按游戏 id 把 ROM 流式回传给浏览器。
 *
 * 为什么要代理而不是让前端直接拉公网域名：
 *   1. 绕开 R2 桶的 CORS 配置问题（上游那边更硬 —— 响应头里有 `vary: Origin` 却**不给**
 *      `access-control-allow-origin`，浏览器直连必被挡）；
 *   2. 不让前端感知真实对象 key / 域名；
 *   3. 顺便把 rom_name 放进 Content-Disposition，前端可据此还原成带原名的 File
 *      （街机 FBNeo 依赖这个文件名）。
 *
 * ⚠️ **两条来源，来源地址优先**（2026-10-16 用户要求）：
 *   · `source_url` 有值 → 回源上游（后台爬取勾了「不保存 ROM」的那批）；
 *   · 否则读本站 R2（`rom_url`）。
 *   两条都是**流式转发**：`upstream.body` 直接交给 `Response`，字节来一坨转一坨，
 *   不落盘、不攒整包 —— 服务端内存只占一个 chunk（不是整个 128 MiB）。
 *   ⚠️ 别在这条路上写 `await res.arrayBuffer()` / `.blob()`，那会把流式打回全量落地。
 */

import { getGameRowCached, type GameRow } from '@/lib/server/games';
import { publicUrl } from '@/lib/server/r2';
import { sourceFileUrl } from '@/lib/server/upstream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 明显是网页 / 报错的 content-type，一律当成「没拿到文件」。
 *
 * ⚠️ **回源上游这条路必须过这道闸**：上游前置了 Cloudflare，地址失效或触发风控时
 * 回的是一张 **HTML 挑战页（HTTP 200）**。不挡的话，前端会把这张网页当成 ROM 存下来
 * —— 体积不大、也不报错，一直到插卡带跑不起来才发现，那时候已经查不出是哪一步坏的。
 * 判据与 /api/admin/fetch-rom 完全一致（那边也有同一段，改一处记得改两处）。
 *
 * ℹ️ 本站 R2 那条路不会命中它（上传时写死了 `application/octet-stream`），
 *    所以这段对老数据无害。
 */
const HTML_LIKE = /^text\/|application\/xhtml|application\/json/i;

/** 非 ASCII 文件名要用 RFC 5987 的 filename*，同时给一个 ASCII 回退。 */
function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  let row: GameRow | null;
  try {
    /*
     * 缓存版（24 小时 / 后台写入失效 tag）：ROM 代理是全站请求量最大的单条查询，
     * 每次开局都打一遍 D1 不值当。元数据在缓存窗口里不变（换 ROM 走删除重传，会失效 tag）。
     */
    row = await getGameRowCached(id);
  } catch (error) {
    console.error('[games] ROM 查询失败', error);
    return new Response('lookup failed', { status: 500 });
  }
  if (!row) return new Response('not found', { status: 404 });

  /*
   * 回源目标：**有来源地址就优先走上游**，否则读本站 R2（见文件头那段）。
   * 两者都没有（不存 ROM 的行 `rom_url` 是空串、来源地址又认不出）→ 当作没有。
   */
  const target = sourceFileUrl(row.source_url) ?? (row.rom_url ? publicUrl(row.rom_url) : null);
  if (!target) {
    console.error('[games] 这一行既没有可用的来源地址，也没有 R2 对象', id);
    return new Response('not found', { status: 404 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      cache: 'no-store',
      // 上游前置了 Cloudflare，给个明确 UA 比默认的 node UA 稳
      headers: { accept: '*/*', 'user-agent': 'nesLoad/1.0' },
    });
  } catch (error) {
    console.error('[games] ROM 回源失败', error);
    return new Response('upstream error', { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response('upstream error', { status: 502 });
  }

  /*
   * 挑战页检测（见 HTML_LIKE）。**只看响应头，不读 body** ——
   * 读一下就把流式变成全量落地了。
   */
  const contentType = (upstream.headers.get('content-type') ?? '').split(';')[0].trim();
  if (HTML_LIKE.test(contentType)) {
    console.error('[games] 回源拿到的不是文件，已拦下', id, contentType, target);
    return new Response('upstream error', { status: 502 });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': contentDisposition(row.rom_name),
    'Cache-Control': 'public, max-age=3600',
  };
  const length = upstream.headers.get('content-length');
  if (length) headers['Content-Length'] = length;

  return new Response(upstream.body, { headers });
}
