/** Stream ROM downloads without forwarding a visitor's cookies or credentials. */
export interface RomFetchOptions {
  timeoutMs?: number;
  compatibility?: { userAgent: string; referer: string };
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

  // One compatibility retry for servers that reject a service UA or expect a
  // download range. Do not retry explicit rate limits or browser challenges.
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
