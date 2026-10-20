/** Stream ROM downloads without forwarding a visitor's cookies or credentials. */
export interface RomFetchOptions {
  timeoutMs?: number;
  compatibility?: { userAgent: string; referer: string };
  /**
   * 把访客请求里「像浏览器、但不承担功能」的那部分头转给上游（2026-10-20 加）。
   *
   * 只对**回源上游**有意义：本站 R2 的对象是自己的，不需要伪装，而且 UA 一多样
   * 就会让同一个 key 在边缘缓存里分出多份。所以调用方一律传 `fromUpstream`。
   */
  clientHints?: boolean;
}

/**
 * 回源时可以照抄的访客请求头 —— **白名单，不是转发整个请求头**。
 *
 * ## 为什么是这几个
 *
 * 目的只有一个：让出站的这几十上百个 Range 请求更像浏览器发的，而不是一个统一的
 * `nesLoad/1.0`。真起作用的其实是「这一组头彼此自洽」—— 只抄 `User-Agent` 而漏掉
 * `sec-ch-ua` / `accept-language`，得到的是一组自相矛盾的指纹（声称自己是 Chrome 124
 * 却没有一条客户端提示），比老实报自定义 UA 更容易被判定成自动化流量。
 * 所以这些要抄就整组抄。
 *
 * ## 为什么 `accept-encoding` 不在这里
 *
 * 它是**功能性**的，不是装饰性的。分片下载要逐片核对字节数（见 `lib/http.ts` 的
 * `IncompleteBodyError`），上游一旦按访客的 `gzip, br` 压缩，`Content-Length` 和
 * Range 偏移就全部对不上，整条路会成片地失败。同一类还有 `range` / `if-range`：
 * 它们由调用方按分片计划精确构造，绝不能被访客的头覆盖。
 *
 * ## 为什么这些不转发
 *
 * · `cookie` / `authorization` —— 访客的凭据不能交给第三方源站，这是底线；
 * · `referer` —— 抄过来是本站地址，等于告诉上游「有人在替你导流」，比不带更假；
 *   兼容重试那条用的是上游自己的首页；
 * · `origin` —— 转发后语义变成「跨站请求声称自己来自本域」，直接是错的；
 * · `host` —— 目标是上游，抄成站内域名会让上游路由失败；
 * · `sec-fetch-*` —— 描述的是**访客页面里的上下文**（同源、no-cors 之类），
 *   而这一跳是服务端跨站请求，抄过来只会自相矛盾。
 */
const CLIENT_HINT_HEADERS = [
  'accept',
  'accept-language',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
] as const;

/**
 * 看起来像浏览器的 UA 才照抄。
 *
 * 访客可能是 curl / 脚本 / 某些下载器，把它们的 UA 转给上游只会更可疑 ——
 * 那种情况保留 `nesLoad/1.0`。判据故意宽（只看 `Mozilla/` 前缀）：各大浏览器和
 * Electron 都带，而真正的命令行工具不会伪造它。
 */
const BROWSER_UA = /Mozilla\//;

/**
 * 把访客那组「像浏览器」的头盖到 `headers` 上。
 *
 * 只**覆盖存在的那几项**：访客没发 `accept-language` 就不要伪造一个 —— 缺项本身是
 * 正常的（Safari 不发自家的 CH 头，一样自洽）。
 *
 * ⚠️ 这里刻意**不写日志**：一次载入要发几百个分片请求，每片打一行会把控制台刷满，
 *    排查时反而看不到 `[rom] compatibility retry` 那种真正有用的行。
 */
function applyClientHints(headers: Headers, request: Request): void {
  for (const name of CLIENT_HINT_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const agent = request.headers.get('user-agent');
  if (agent && BROWSER_UA.test(agent)) headers.set('user-agent', agent);
}

export function isSingleByteRange(value: string): boolean {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return false;
  const start = match[1] ? Number(match[1]) : null;
  const end = match[2] ? Number(match[2]) : null;
  if ((start !== null && !Number.isSafeInteger(start)) || (end !== null && !Number.isSafeInteger(end))) return false;
  return start === null ? end! > 0 : end === null || end >= start;
}

export function parseContentRange(value: string | null): { start: number; end: number; total: number } | null {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value ?? '');
  if (!match) return null;
  const [start, end, total] = match.slice(1).map(Number);
  if (![start, end, total].every(Number.isSafeInteger) || start > end || end >= total) return null;
  return { start, end, total };
}

/** An internally requested bytes=0- response must contain the entire file. */
export function isCompleteByteRange(value: string | null): boolean {
  const parsed = parseContentRange(value);
  return parsed !== null && parsed.start === 0 && parsed.end === parsed.total - 1;
}

export async function fetchRomUpstream(
  target: string,
  request: Request,
  options: RomFetchOptions = {},
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const deadline = Date.now() + (options.timeoutMs ?? 25_000);
  const headers = new Headers({ accept: '*/*', 'user-agent': 'nesLoad/1.0', 'accept-encoding': 'identity' });
  /*
   * 顺序要紧：先落默认值，再让访客那组头覆盖。
   * `accept-encoding` 不在白名单里，所以 `identity` 永远守得住 —— 原因见
   * `CLIENT_HINT_HEADERS` 的注释（分片要核字节数，压缩会让 Range 全错）。
   */
  if (options.clientHints) applyClientHints(headers, request);
  const range = request.headers.get('range');
  if (range) {
    if (!isSingleByteRange(range)) throw new TypeError('Invalid byte range');
    headers.set('range', range);
    const validator = request.headers.get('if-range');
    if (validator) headers.set('if-range', validator);
  }

  async function attempt(): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('Upstream headers timed out', 'TimeoutError')), Math.max(0, deadline - Date.now()));
    try {
      return await fetcher(target, {
        headers: new Headers(headers), cache: 'no-store',
        signal: AbortSignal.any([request.signal, controller.signal]),
      });
    } finally {
      // The timeout covers response headers only. Large ROM streams may take
      // longer than 25s and must continue until completion or client cancellation.
      clearTimeout(timer);
    }
  }

  let response = await attempt();
  if (response.status !== 403 || !options.compatibility || response.headers.has('retry-after') ||
      response.headers.get('cf-mitigated') === 'challenge' || request.signal.aborted) return response;

  /*
   * One compatibility retry after a rejection. Even when the first attempt already
   * carried the visitor's own hints (`clientHints`), the missing piece is usually the
   * referer or a full-file range — so the retry pins a known browser UA, adds the
   * upstream referer and asks for `bytes=0-`. Do not retry explicit rate limits or
   * browser challenges: those get worse, not better.
   */
  console.warn('[rom] compatibility retry', {
    host: new URL(target).hostname, status: response.status, ray: response.headers.get('cf-ray'),
  });
  await response.body?.cancel();
  headers.set('user-agent', options.compatibility.userAgent);
  headers.set('referer', options.compatibility.referer);
  if (!range) headers.set('range', 'bytes=0-');
  response = await attempt();
  return response;
}
