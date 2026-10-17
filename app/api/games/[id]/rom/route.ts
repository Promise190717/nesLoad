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
import { sourceFileUrl, UPSTREAM_SITE, UPSTREAM_USER_AGENT } from '@/lib/server/upstream';
import { fetchRomUpstream, isCompleteByteRange, isSingleByteRange, parseContentRange } from '@/lib/server/rom-upstream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ⚠️ **函数时长上限，必须显式声明**（2026-10-16 加）。
 *
 * 这个接口要**流式转发整个 ROM**，而 Vercel 的默认 `maxDuration` 很短
 * （Hobby 计划 10 秒）—— 大文件（NDS 卡带常见 128 / 256 MB）根本跑不完。
 * 表现就是线上 502 / 524，而本地 `next dev` 没有这个限制，**永远复现不出来**。
 *
 * 60 是 **Vercel Hobby 计划的上限**；Pro 可以往上调（最高 300s）。
 * 部署计划变了就把这个数一起改。
 *
 * ⚠️ 这**只是把天花板抬高**，不是根治 —— 真要稳，得让函数别中转大文件
 *    （ROM 落到自己的 R2 + 给 R2 配 CORS，让浏览器直连），见文件头。
 */
export const maxDuration = 60;

/**
 * 回源**首字节**的等待上限（毫秒）。
 *
 * ⚠️ **没有它的时候线上就是这么坏的**（2026-10-16）：上游一慢，`fetch` 就无限期挂着，
 *    函数跟着挂，一直挂到前面那层（Cloudflare）等满 100 秒、吐一个 **Error 524** ——
 *    用户只看到一个说不清原因的网关错误，服务端日志里干干净净。
 *    **快速失败永远好过挂着**：超时后我们自己回一个带原因的 504。
 *
 * 只约束「响应头到达」的时间（TTFB），**不约束后续下载** —— 上游正常时 TTFB 是毫秒级，
 * 给 25 秒非常宽松，不会误杀。
 */
const UPSTREAM_TIMEOUT_MS = 25_000;

/**
 * 明显是网页 / 报错的 content-type，一律当成「没拿到文件」。
 *
 * ⚠️ **回源上游这条路必须过这道闸**：上游前置了 Cloudflare，地址失效或触发风控时
 * 回的是一张 **HTML 挑战页（HTTP 200）**。不挡的话，前端会把这张网页当成 ROM 存下来
 * —— 体积不大、也不报错，一直到插卡带跑不起来才发现，那时候已经查不出是哪一步坏的。
 * 后台的 /api/admin/fetch-rom 也保留相同的内容类型检查。
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

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const range = request.headers.get('range');
  if (range && !isSingleByteRange(range)) {
    return new Response('Only a single valid byte range is supported', { status: 416, headers: { 'Cache-Control': 'no-store' } });
  }

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
  const source = sourceFileUrl(row.source_url);
  const target = source ?? (row.rom_url ? publicUrl(row.rom_url) : null);
  if (!target) {
    console.error('[games] 这一行既没有可用的来源地址，也没有 R2 对象', id);
    return new Response('not found', { status: 404 });
  }

  let upstream: Response;
  try {
    upstream = await fetchRomUpstream(target, request, {
      timeoutMs: UPSTREAM_TIMEOUT_MS,
      compatibility: source ? { userAgent: UPSTREAM_USER_AGENT, referer: `${UPSTREAM_SITE}/` } : undefined,
    });
  } catch (error) {
    /*
     * 超时和「连不上」分开报：前者是上游慢（多半是被限流 / 源站过载），
     * 后者才是真正的网络问题 —— 两者的修法完全不同，日志里必须分得开。
     */
    const timedOut = (error as Error)?.name === 'TimeoutError';
    console.error('[games] ROM 回源失败', id, timedOut ? '超时' : '连接失败', error, target);
    return new Response(
      timedOut
        ? `upstream error: 上游 ${UPSTREAM_TIMEOUT_MS / 1000} 秒内没有响应（多半是被限流或源站过慢）`
        : 'upstream error: 连接上游失败',
      { status: 504 }
    );
  }
  if (range && upstream.status === 416) {
    const contentRange = upstream.headers.get('content-range');
    await upstream.body?.cancel();
    return new Response(null, { status: 416, headers: {
      'Cache-Control': 'no-store', ...(contentRange ? { 'Content-Range': contentRange } : {}),
    } });
  }
  if (!upstream.ok || !upstream.body) {
    // Log the upstream response without assuming every 403 has the same cause.
    const upstreamType = upstream.headers.get('content-type') ?? '-';
    const retryAfter = upstream.headers.get('retry-after');
    const cfRay = upstream.headers.get('cf-ray') ?? '-';
    const challenge = upstream.headers.get('cf-mitigated') === 'challenge';
    console.error(
      '[games] ROM 回源被上游拒绝',
      id,
      `status=${upstream.status}`,
      `type=${upstreamType}`,
      `retry-after=${retryAfter ?? '-'}`,
      `cf-ray=${cfRay}`,
      `challenge=${challenge}`,
      target
    );
    /*
     * ⚠️ **错误正文里带上原因**（2026-10-16 改）：原来无论哪种失败都只回一句
     *    'upstream error'，在浏览器里打开这个接口看不出任何东西 —— 文件没了、
     *    被限流了、还是拿到一张挑战页，全得靠猜（线上 502 排查就卡死在这里）。
     *    现在把上游的状态码 / content-type / retry-after 写进正文，直接看得见。
     */
    const detail = upstream.body
      ? `HTTP ${upstream.status}, content-type: ${upstreamType}${
          retryAfter ? `, retry-after: ${retryAfter}s` : ''
        }`
      : `HTTP ${upstream.status}（响应没有 body）`;
    await upstream.body?.cancel();
    return new Response(`upstream error: ${detail}${challenge ? '（上游要求浏览器验证）' : ''}`, {
      status: 502,
      headers: { 'Cache-Control': 'no-store', ...(retryAfter ? { 'Retry-After': retryAfter } : {}) },
    });
  }

  /*
   * 挑战页检测（见 HTML_LIKE）。**只看响应头，不读 body** ——
   * 读一下就把流式变成全量落地了。
   */
  const contentType = (upstream.headers.get('content-type') ?? '').split(';')[0].trim();
  if (HTML_LIKE.test(contentType)) {
    await upstream.body?.cancel();
    /*
     * 上游回的是网页 —— 大概率是 Cloudflare 的挑战 / 限流页（HTTP 200 + text/html）。
     * 正文里带上它，用户直接在浏览器打开这个接口就能看出是哪一类。
     */
    console.error(
      '[games] 回源拿到的不是文件，已拦下',
      id,
      contentType,
      `cf-ray=${upstream.headers.get('cf-ray') ?? '-'}`,
      target
    );
    return new Response(
      `upstream error: 上游返回的是网页而不是文件（content-type: ${contentType}）`,
      { status: 502 }
    );
  }

  // A compatibility bytes=0- request may return 206. It can become a normal
  // download only if the range spans the entire file; never pass a truncated ROM.
  if (upstream.status === 206 && (!parseContentRange(upstream.headers.get('content-range')) ||
      (!range && !isCompleteByteRange(upstream.headers.get('content-range'))))) {
    await upstream.body?.cancel();
    return new Response('upstream error: 上游只返回了部分文件，已停止下载以避免损坏 ROM', {
      status: 502, headers: { 'Cache-Control': 'no-store' },
    });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': contentDisposition(row.rom_name),
    'Cache-Control': range ? 'private, no-store' : 'public, max-age=3600',
  };
  for (const name of ['accept-ranges', 'etag', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  if (range && upstream.status === 206) {
    const value = upstream.headers.get('content-range');
    if (value) headers['Content-Range'] = value;
  }
  const length = upstream.headers.get('content-length');
  if (length) headers['Content-Length'] = length;

  return new Response(upstream.body, { status: range && upstream.status === 206 ? 206 : 200, headers });
}
