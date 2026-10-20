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
 * ⚠️ **来源现在全在 `game_roms.source_url` 里**（2026-10-20 换 Supabase 之后）：
 *   `site:/…` / `files:/…` → 上游源站（后台爬取勾了「不保存 ROM」的那批）；
 *   `r2:/…`                → 本站 R2 桶（后台手动上传的那批）。
 *   两条都是**流式转发**：`upstream.body` 直接交给 `Response`，字节来一坨转一坨，
 *   不落盘、不攒整包 —— 服务端内存只占一个 chunk（不是整个 128 MiB）。
 *   ⚠️ 别在这条路上写 `await res.arrayBuffer()` / `.blob()`，那会把流式打回全量落地。
 */

import { getGameRoms } from '@/lib/server/sb-games';
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

  /*
   * `?lang=` = 这一款要哪个语言版本的 ROM（2026-10-20 起由 `game_roms` 直接支持）。
   * 不传就按站内语言顺序取默认那一份（`zh` → `en` → `ja` → `ko`）。
   */
  const lang = new URL(request.url).searchParams.get('lang')?.trim() || null;

  /*
   * 回源目标：按 `source_url` 的前缀分派（见文件头）。
   *   `r2:` 那批是本站自持的对象，地址由 `publicUrl()` 现拼（换域名不用改数据）。
   */
  let roms: Awaited<ReturnType<typeof getGameRoms>>;
  try {
    roms = await getGameRoms(id);
  } catch (error) {
    console.error('[games] ROM 查询失败', error);
    return new Response('lookup failed', { status: 500 });
  }
  if (roms.length === 0) return new Response('not found', { status: 404 });

  /*
   * 取哪一份（2026-10-20 起「自有 R2 优先」）：
   *   ① `?lang=` 给了 → 先只看这个语言，其中优先 `r2:`，没有才回上游；
   *   ② 没给 → 任意语言里优先 `r2:`，一份都没有才用第一份。
   * 顺序不能反：先挑语言再挑来源，否则 `?lang=ja` 会被「别的语言的 r2」抢走。
   * 自有对象不经过上游 WAF（没有 challenge、没有兼容重试），能挑就挑它。
   */
  const candidates = lang ? roms.filter((rom) => rom.language === lang) : roms;
  const picked =
    candidates.find((rom) => rom.sourceUrl?.startsWith('r2:')) ?? candidates[0] ?? roms[0];
  const fileName = picked.romName || 'rom';
  const selfHosted = picked.sourceUrl?.startsWith('r2:') ?? false;
  const target = selfHosted
    ? publicUrl((picked.sourceUrl as string).slice(3))
    : sourceFileUrl(picked.sourceUrl);
  if (!target) {
    console.error('[games] 这一份 ROM 没有可用的来源地址', id, picked.language);
    return new Response('not found', { status: 404 });
  }
  /*
   * 只有回源上游时才带那套 UA / Referer：本站 R2 对象不需要，带了反而会让 R2 的
   * 缓存键分裂（同一个对象因请求头不同被缓存成多份）。
   */
  const fromUpstream = !selfHosted;

  let upstream: Response;
  try {
    upstream = await fetchRomUpstream(target, request, {
      timeoutMs: UPSTREAM_TIMEOUT_MS,
      /*
       * 回源上游时带上访客那组「像浏览器」的头（白名单在 `rom-upstream.ts` 的
       * `CLIENT_HINT_HEADERS`）—— 目的只是别让每片请求都顶着同一个 `nesLoad/1.0`。
       *
       * ⚠️ R2 那条**不带**：对象是我们自己的，不需要伪装；而 UA 一多样，
       *    同一个 key 在边缘就会被缓存成好几份，命中率白掉。
       */
      clientHints: fromUpstream,
      compatibility: fromUpstream ? { userAgent: UPSTREAM_USER_AGENT, referer: `${UPSTREAM_SITE}/` } : undefined,
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
    'Content-Disposition': contentDisposition(fileName),
    'Cache-Control': range ? 'private, no-store' : 'public, max-age=3600, s-maxage=2592000',
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
