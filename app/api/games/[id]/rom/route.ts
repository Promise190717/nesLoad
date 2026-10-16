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
      // 见 UPSTREAM_TIMEOUT_MS —— 没有它，上游一慢就把函数挂死到 Cloudflare 524
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
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
  if (!upstream.ok || !upstream.body) {
    /*
     * ⚠️ **这条日志是 2026-10-16 补的**：线上报 502 时，这一分支原本只回一句
     *    'upstream error' 就完了，服务端日志干干净净 —— 分不出是「网络不通」
     *    （上面那个 catch）还是「上游把请求拒了」（这里）。现在把上游的状态码和
     *    几个判据一起打出来，一眼能看出是不是被 Cloudflare 限流。
     *
     * 📌 实测（2026-10-16）结论，别照着「加 Referer 就好了」的直觉改回去：
     *    · 上游**不校验 Referer** —— 本机用 `nesLoad/1.0`、不带任何 Referer 直取，
     *      两个 host 都回 `206`（`site:` 主站与 `files:` 子域各试一条）。
     *    · 线上拿到的是 **Cloudflare 的限流页**（`content-type: text/html` +
     *      `retry-after: 60` + `cf-ray`，即 Error 1015 那类速率限制）。
     *    ⇒ 所以「模拟源站自己发起的请求」解决不了这个：它不是防盗链，是**限流**。
     *      根因是**所有访客的开局请求都从本站这一个出口 IP 回源** —— 本地只有你一个人
     *      访问，频率低，所以本地永远复现不出来。
     *      真正的解法是让回源**只发生一次**（取回后落到自己的 R2），见文件头。
     */
    const upstreamType = upstream.headers.get('content-type') ?? '-';
    const retryAfter = upstream.headers.get('retry-after');
    const cfRay = upstream.headers.get('cf-ray') ?? '-';
    console.error(
      '[games] ROM 回源被上游拒绝',
      id,
      `status=${upstream.status}`,
      `type=${upstreamType}`,
      `retry-after=${retryAfter ?? '-'}`,
      `cf-ray=${cfRay}`,
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
    return new Response(`upstream error: ${detail}`, {
      status: 502,
      headers: retryAfter ? { 'Retry-After': retryAfter } : undefined,
    });
  }

  /*
   * 挑战页检测（见 HTML_LIKE）。**只看响应头，不读 body** ——
   * 读一下就把流式变成全量落地了。
   */
  const contentType = (upstream.headers.get('content-type') ?? '').split(';')[0].trim();
  if (HTML_LIKE.test(contentType)) {
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

  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': contentDisposition(row.rom_name),
    'Cache-Control': 'public, max-age=3600',
  };
  const length = upstream.headers.get('content-length');
  if (length) headers['Content-Length'] = length;

  return new Response(upstream.body, { headers });
}
