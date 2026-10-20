/*
 * ROM 回源代理 —— Cloudflare Worker（2026-10-16）
 *
 * ## 为什么要有它
 *
 * 原来 ROM 由 `/api/games/<id>/rom`（Next.js route handler）在 **Vercel 函数**里中转。
 * 那个函数要**流式转发整个 ROM**，而 Vercel 对函数时长有硬上限（Hobby 默认 10 秒），
 * 大文件（NDS 卡带常见 128 / 256 MB）根本跑不完 —— 表现就是线上 502 / Cloudflare 524，
 * 而本地 `next dev` 没有这个限制，**永远复现不出来**。
 *
 * Worker 没有这个问题：它的 CPU 时间限制**不含 I/O 等待**，流式转发几百 MB 的响应
 * 完全在能力范围内。
 *
 * ## 它解决什么、不解决什么（别搞混）
 *
 * ✅ 解决：Vercel 的函数时长上限 —— 大文件不再被掐断。
 * ❌ **不解决**：上游对「单个出口 IP 高频回源」的限流。Worker 的出口仍然是
 *    Cloudflare 的 IP 段，只是换了一层壳。真要把这个也解决掉，得让 ROM 落进
 *    自己的 R2（见 `.workbuddy-ai/memory/REFERENCE.md` 的「回源上游被 Cloudflare
 *    限流」那一节）。
 *
 * ## 部署（三步）
 *
 * 1. `cd workers/rom-proxy && npx wrangler deploy`
 *    （首次会要你 `wrangler login`；`wrangler.toml` 里的 `database_id` 要和
 *     Vercel 那边环境变量 `D1_DATABASE_ID` 是同一个。）
 *
 * 2. Cloudflare 控制台 → 你的域名 → **Workers Routes** 加一条：
 *        路由：  `<你的域名>/rom/*`
 *        Worker： `nesload-rom-proxy`
 *    ⚠️ **路由要写成 `/rom/*` 这个独立前缀**，不要去拦 `/api/games/*`：
 *       · 中间带通配符的 pattern 不保险（Routes 的 `*` 习惯上放在末尾）；
 *       · 拦了整段就得把别的接口再转发回源站，而 Worker 内 fetch 同 zone 有额外限制，
 *         徒增风险。
 *
 * 3. 前端把 ROM 地址从 `/api/games/<id>/rom` 换成 `/rom/<id>`（4 处）。
 *    ⚠️ **Vercel 那个 route handler 保留**：它是 `/rom/*` 出问题时的退路
 *       （把地址换回去即可），不是死代码。
 *
 * ## 同源，所以不需要 CORS
 *
 * `/rom/*` 和页面同域，浏览器根本不跨域 ⇒ **不用配任何 CORS 头**。
 * （这和「让浏览器直连上游 / 直连 R2」是两回事 —— 那两条都要 CORS，
 *   而上游**明确不给**：OPTIONS 预检回 403，2026-10-16 实测过。）
 */

/* ── 最小类型声明 ──────────────────────────────────────────────────────
 * 只声明用到的部分，免得为了两个接口去引 `@cloudflare/workers-types`
 * （那是另一套依赖；而且这个目录已经被 tsconfig 排除在 `tsc` 之外）。
 */
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}
interface CacheStorage {
  default: {
    match(request: Request): Promise<Response | undefined>;
    put(request: Request, response: Response): Promise<void>;
  };
}
declare const caches: CacheStorage;

interface Env {
  DB: D1Database;
  /** R2 公网读取域名 —— 与 Vercel 那边的 `R2_PUBLIC_BASE` 保持一致。 */
  R2_PUBLIC_BASE: string;
}

/**
 * 上游域名根 —— 与 `lib/server/upstream.ts` 的 `UPSTREAM_ROOT` 一致
 * （跨运行时只能手抄，那边是 TS + `@/` 别名，这里 import 不了）。
 */
const UPSTREAM_ROOT = 'retrogamesnexus.com';

/**
 * 明显是网页 / 报错的 content-type，一律当成「没拿到文件」。
 * 判据与 Vercel 那两个 route（`/api/games/[id]/rom`、`/api/admin/fetch-rom`）完全一致。
 */
const HTML_LIKE = /^text\/|application\/xhtml|application\/json/i;

/**
 * `site:/x` → 主站；`files:/x` → 文件子域。
 *
 * ⚠️ **和 `lib/server/upstream.ts` 的 `sourceFileUrl()` 逐条一致**（同样是手抄）。
 *    两个 host **不可互换**：上游一半文件只在主站、另一半只在 files 子域（实测），
 *    所以改那边必须同步这里。
 */
function sourceFileUrl(stored: string | null): string | null {
  if (!stored) return null;
  const at = stored.indexOf(':');
  if (at === -1) return null;
  const host = stored.slice(0, at);
  const path = stored.slice(at + 1);
  if (!path.startsWith('/')) return null;
  if (host === 'site') return `https://${UPSTREAM_ROOT}${path}`;
  if (host === 'files') return `https://files.${UPSTREAM_ROOT}${path}`;
  return null;
}

/** R2 对象 key → 公网地址（`lib/server/r2.ts` 的 `publicUrl()` 的移植，同样只能手抄）。 */
function r2Url(key: string, base: string): string {
  const root = base.replace(/\/+$/, '');
  const path = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${root}/${path}`;
}

/** 非 ASCII 文件名用 RFC 5987 的 `filename*`，同时给 ASCII 回退（FBNeo 认文件名当驱动名）。 */
function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

interface GameRow {
  rom_url: string | null;
  source_url: string | null;
  rom_name: string;
}

/**
 * 「id → 回源地址」的小缓存。
 *
 * 为什么需要：这个 Worker 每个开局请求都要知道「该去哪个地址取」。查 D1 单行很便宜，
 * 但开局是全站频率最高的动作，能省就省（Vercel 那边正是靠 `getGameCached` 的 30 天
 * 缓存把这条路归零的）。
 *
 * 用 **Cache API** 而不是 KV：零配置，而且这里只需要一个短命的映射缓存，
 * 不涉及「后台改完立刻生效」那种一致性要求 —— 所以 TTL 只给 1 小时。
 */
async function resolveTarget(
  id: string,
  env: Env,
  ctx: ExecutionContext
): Promise<{ target: string; romName: string } | null> {
  const cache = caches.default;
  const key = new Request(`https://rom-proxy.internal/target/${encodeURIComponent(id)}`);

  const hit = await cache.match(key);
  if (hit) {
    const target = hit.headers.get('x-target');
    const romName = hit.headers.get('x-rom-name');
    if (target && romName) return { target, romName: decodeURIComponent(romName) };
  }

  const row = await env.DB.prepare(
    'SELECT rom_url, source_url, rom_name FROM games WHERE id = ?'
  )
    .bind(id)
    .first<GameRow>();
  if (!row) return null;

  /*
   * 来源地址优先，其次才是本站 R2 —— 与 `/api/games/[id]/rom` 的取舍完全一致。
   * 两者都没有（「不保存 ROM」的行 `rom_url` 是空串、来源地址又认不出）→ 当作没有。
   */
  const target =
    sourceFileUrl(row.source_url) ?? (row.rom_url ? r2Url(row.rom_url, env.R2_PUBLIC_BASE) : null);
  if (!target) return null;

  ctx.waitUntil(
    cache.put(
      key,
      new Response('', {
        headers: {
          'x-target': target,
          'x-rom-name': encodeURIComponent(row.rom_name),
          'cache-control': 'max-age=3600',
        },
      })
    )
  );

  return { target, romName: row.rom_name };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const id = url.pathname.slice('/rom/'.length).replace(/\/+$/, '');

    if (!id || id.includes('/')) return new Response('bad request', { status: 400 });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('method not allowed', { status: 405 });
    }

    let resolved: { target: string; romName: string } | null;
    try {
      resolved = await resolveTarget(id, env, ctx);
    } catch (error) {
      console.error('[rom-proxy] D1 查询失败', id, error);
      return new Response('lookup failed', { status: 500 });
    }
    if (!resolved) return new Response('not found', { status: 404 });

    let upstream: Response;
    try {
      upstream = await fetch(resolved.target, {
        headers: { accept: '*/*', 'user-agent': 'nesLoad/1.0' },
      });
    } catch (error) {
      console.error('[rom-proxy] 回源失败', id, resolved.target, error);
      return new Response('upstream error: 连接失败', { status: 504 });
    }

    /*
     * ⚠️ 回源被拒时**必须留全判据**（状态码 / content-type / retry-after / cf-ray）：
     *    上游前置了 Cloudflare，被限流时回的是 HTML 页 + `retry-after: 60`，
     *    光看状态码分不出「文件没了」和「被限流了」。这段和 Vercel 那边同款。
     */
    if (!upstream.ok || !upstream.body) {
      console.error(
        '[rom-proxy] 回源被拒',
        id,
        `status=${upstream.status}`,
        `type=${upstream.headers.get('content-type') ?? '-'}`,
        `retry-after=${upstream.headers.get('retry-after') ?? '-'}`,
        `cf-ray=${upstream.headers.get('cf-ray') ?? '-'}`,
        resolved.target
      );
      return new Response(`upstream error: HTTP ${upstream.status}`, { status: 502 });
    }

    const contentType = (upstream.headers.get('content-type') ?? '').split(';')[0].trim();
    if (HTML_LIKE.test(contentType)) {
      console.error('[rom-proxy] 回源拿到网页而不是文件', id, contentType, resolved.target);
      return new Response(`upstream error: 上游返回的是网页（content-type: ${contentType}）`, {
        status: 502,
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': contentDisposition(resolved.romName),
      'Cache-Control': 'public, max-age=3600',
    };
    const length = upstream.headers.get('content-length');
    if (length) headers['Content-Length'] = length;

    // HEAD 不该带 body（规范如此）
    if (request.method === 'HEAD') return new Response(null, { headers });

    /*
     * **流式转发**：`upstream.body` 直接交给 `Response`，字节来一坨转一坨，
     * 不落盘、不攒整包 —— 服务端只占一个 chunk 的内存（不是整个 128 MiB）。
     * ⚠️ 别在这条路上写 `await upstream.arrayBuffer()` / `.blob()`，那会把流式打回全量落地。
     */
    return new Response(upstream.body, { headers });
  },
};
