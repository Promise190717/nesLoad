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
import { gamesBucket, publicUrl } from '@/lib/server/r2';
import type { R2ObjectLike } from '@/lib/server/r2';
import { sourceFileUrl, UPSTREAM_SITE, UPSTREAM_USER_AGENT } from '@/lib/server/upstream';
import { fetchRomUpstream, isCompleteByteRange, isSingleByteRange, parseContentRange } from '@/lib/server/rom-upstream';
import type { RomFetchOptions } from '@/lib/server/rom-upstream';

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

/**
 * 「上游把 Range 忽略了」时值得去等它预热的体积门槛（8 MiB）。
 *
 * 为什么要有门槛：小 ROM 一次整包反而更快 —— 前端 `lib/http.ts` 的探针拿到 200
 * 就直接把它当整包读，刻意省掉第二次往返（`ROM_DIRECT_MAX_BYTES` 也是 8 MiB）。
 * 这个门槛以上才值得在服务端等一轮缓存填充。
 */
const RANGE_RETRY_MIN_BYTES = 8 * 1024 * 1024;

/**
 * 等冷对象预热的时间预算（2026-11-05 加）。
 *
 * ## 为什么需要「等」
 *
 * 上游那个域名前面也是一层 Cloudflare。对象在某台边缘节点上是冷的时候，它会
 * **忽略 `Range`、回 200 + 整个文件**；几百 MB 的东西转发给浏览器，免费版 Worker
 * 必然半路被掐（要么 503 空 body，要么 HTTP 仍是 200 但字节被截断，后者更毒）。
 *
 * 但实测发现一件关键的事：**只要请求打到上游，它就会在后台把对象填进缓存**。
 * 对一个 314 MB 的冷对象，让客户端 3 秒就断开、一个字节都不收，10 秒后再要同一段
 * 已经是 `206`。所以正确做法不是把整包转出去，而是**放掉它、等它暖**。
 *
 * ## 为什么探针等 12 秒、分片只等 6 秒
 *
 * 探针（`bytes=0-0`）是整条下载路的入口，它多等一会儿能省掉后面几十片的集体失败；
 * 分片有自己的 3 次重试 + 二分（见 `lib/http.ts` 的 `fetchSpan`），服务端再压 12 秒
 * 只会让用户多盯 12 秒无意义的载入条。
 */
const WARMUP_PROBE_WAIT_MS = 12_000;
const WARMUP_CHUNK_WAIT_MS = 6_000;
/** 轮询间隔。比上游填缓存的速度快没意义，慢了又浪费预算。 */
const WARMUP_POLL_MS = 2_000;
/** 分片等不到时回给前端的 `Retry-After`（秒）。 */
const WARMUP_RETRY_AFTER = '4';

/*
 * ⚠️ **ROM 一律不进边缘缓存**（2026-11-06 改，之前「整份」那份是 7 天）。
 *
 * 2026-11-05 给 `wrangler.jsonc` 打开 Workers Caching（第 0 层）之后，这一层在
 * **缓存未命中**时会先摘掉 `Range` 再回源整包（它要拿一整份来填缓存）。于是：
 *
 *   1. 播放器发的是 `bytes=0-0` 探针，落到这里已经**没有 Range**；
 *   2. 本函数按「无 Range」处理，回 200 + 整个几百 MB 的文件，旧版还盖 `s-maxage=7d`；
 *   3. 边缘把这一整份存下来 —— 大文件还会**存成截断的副本**
 *      （2026-11-06 实测：`martian-gothic-unification` 261,479,549 字节的对象，
 *      缓存里只有 44,875,456 字节，而且没有 `Content-Length`）；
 *   4. 之后所有探针 / 分片请求拿到的都是 `200` + 那份残包，没有 `Content-Range`，
 *      前端只能按「服务器忽略 Range = 这是整包」处理，把残包交给核心静默失败。
 *
 * 线上「同一个游戏返回 200、只发一个请求、游戏打不开，本地却是 206 分片」就是它。
 * 所以这里永远回 `private, no-store`：宁可每次请求都回源（分片本来就是几十个请求），
 * 也不要把 ROM 交给第 0 层 —— 它一旦存错，坏副本会挂到过期或下次发版为止。
 *
 * ## `no-store` 只解决「别再存坏副本」，区间还得绕开请求头
 *
 * 摘 `Range` 发生在看响应之前，光靠响应头治不了：下一个新键的第一次请求，探针照样
 * 变成「无区间 ⇒ 200 + 整包 ⇒ Worker 被掐」。
 *
 * 所以区间改成**查询串主、请求头辅**（`?span=0-4194303`，见 `parseSpanParam`）：
 * 查询串会原样进缓存键，第 0 层改不到它。前端 `lib/http.ts` 的 `romSpanUrl` 两个
 * 都发，`Range` 只为兼容出口跳板与旧部署。**不需要在 Cloudflare 上配任何 Cache Rule。**
 */

/*
 * 一次大 ROM 下载会发几十个 4 MiB 分片请求。每个分片都查一遍 Supabase 不只是慢，
 * 还要重复做 SQL 参数绑定与 JSON 解码；四个首发分片甚至会同时发出四条相同查询。
 * 在当前 isolate 里短存 60 秒并复用进行中的 Promise，既合并冷启动查询，也避免热分片
 * 反复查库。失败立即剔除，不会把一次数据库故障缓存一分钟；后台换来源最多晚 60 秒。
 */
const ROM_LOOKUP_TTL_MS = 60_000;
const ROM_LOOKUP_MAX_ENTRIES = 128;
type RomLookupEntry = {
  expiresAt: number;
  value: Promise<Awaited<ReturnType<typeof getGameRoms>>>;
};
const romLookups = new Map<string, RomLookupEntry>();

function lookupGameRoms(id: string): Promise<Awaited<ReturnType<typeof getGameRoms>>> {
  const now = Date.now();
  const hit = romLookups.get(id);
  if (hit && hit.expiresAt > now) return hit.value;

  if (romLookups.size >= ROM_LOOKUP_MAX_ENTRIES) {
    const oldest = romLookups.keys().next().value;
    if (typeof oldest === 'string') romLookups.delete(oldest);
  }
  const entry: RomLookupEntry = { expiresAt: now + ROM_LOOKUP_TTL_MS, value: getGameRoms(id) };
  romLookups.set(id, entry);
  return entry.value.catch((error) => {
    if (romLookups.get(id) === entry) romLookups.delete(id);
    throw error;
  });
}

/** 非 ASCII 文件名要用 RFC 5987 的 filename*，同时给一个 ASCII 回退。 */
function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * `bytes=4194304-8388607` → `{ start, end }`；`bytes=0-`（开放式）→ `end: null`。
 *
 * 只处理「有起点」的写法：`bytes=-500`（后缀范围）拿不到 start，调用方按「认不出」
 * 处理 —— 前端 `lib/http.ts` 从来不发那种，用不上。
 */
function parseRangeHeader(value: string): { start: number; end: number | null } | null {
  const match = /^bytes=(\d+)-(\d*)$/.exec(value);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : null;
  if (!Number.isSafeInteger(start)) return null;
  if (end !== null && !Number.isSafeInteger(end)) return null;
  return { start, end };
}

/**
 * `?span=4194304-8388607` → `bytes=4194304-8388607`；`?span=0-` → `bytes=0-`。
 *
 * ## 为什么区间要有第二份表达（2026-11-06）
 *
 * 站点前面那层 Workers Caching（`wrangler.jsonc` 的 `cache.enabled`）在**缓存未命中**
 * 时会先摘掉 `Range` 再回源。于是前端的 `bytes=0-0` 探针落到这里已经「没有区间」，
 * 本函数按无 Range 回 200 + 整个几百 MB，那一层再把大文件存成**截断副本**，
 * 之后所有分片都命中这个坏副本 —— 线上整款游戏打不开就是这么来的。
 *
 * 那一层在 Worker 外面，代码改不动它，也不想为它单独配 Cache Rule。能让请求不受
 * 影响的办法只有一个：**别把区间放在请求头里**。查询串会原样进缓存键，谁也不会改。
 *
 * 认不出就返回 `null`，回落到 `Range` 头那条老路 —— 外链、curl、老前端都还能用。
 */
function parseSpanParam(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d+)-(\d*)$/.exec(value.trim());
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : null;
  if (!Number.isSafeInteger(start)) return null;
  if (end !== null && (!Number.isSafeInteger(end) || end < start)) return null;
  return `bytes=${start}-${end === null ? '' : end}`;
}

/**
 * 等上游把「刚被要过的这一段」放进边缘缓存（见 `WARMUP_PROBE_WAIT_MS` 顶上那段）。
 *
 * 返回 `null` 表示预算内没等到，由调用方决定回什么。
 *
 * ⚠️ 调用前必须先把手里那个 200 整包 `cancel()` 掉。不取消的话，上游会继续把几十
 *    上百 MB 往这条连接里塞，白占带宽不说，Worker 还是会在半路被杀 —— 等于什么
 *    都没解决。
 */
async function waitForRange(
  target: string,
  request: Request,
  options: RomFetchOptions,
  budgetMs: number
): Promise<Response | null> {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    if (request.signal.aborted) return null;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    // 先等一轮再问：刚才那次请求已经触发了回源，立刻重发只会再触发一次
    await new Promise((resolve) => setTimeout(resolve, Math.min(WARMUP_POLL_MS, remaining)));
    if (request.signal.aborted) return null;
    try {
      // 单次轮询不能比剩余预算还久，否则这个函数就不再是「等 12 秒」了
      const perCall = Math.max(1_000, Math.min(options.timeoutMs ?? 25_000, deadline - Date.now()));
      const response = await fetchRomUpstream(target, request, { ...options, timeoutMs: perCall });
      if (response.status === 206) return response;
      await response.body?.cancel();
      // 200 = 还在回源，继续等；403 / 404 / 5xx 等下去也不会变，早点交回去
      if (response.status !== 200) return null;
    } catch {
      // 单次连接失败不改变结论（下一个轮次上游可能就暖了），继续等
    }
  }
}

/** 走「上行出口」时盖的标记头，防止两份部署互相指来指去转成死循环。 */
const EGRESS_HEADER = 'x-nl-rom-egress';

/**
 * 从自己的 R2 桶里取一段字节 —— **binding 通道**（2026-11-05 加，见 `lib/server/r2.ts`
 * 的 `gamesBucket()` 顶上那段）。
 *
 * 返回 `null` 只有一个含义：**这条通道不可用**（本地 dev、没配 binding、binding 调用抛错）。
 * 调用方据此回落到公网域名，行为与加这个函数之前一致。
 * 对象确实不在桶里（404）或区间越界（416）**不返回 null** —— 那不是「通道坏了」，
 * 回落到公网只会把同一个错误再犯一遍。
 *
 * ⚠️ 这条路径是「本站自持的 ROM 永远 206」的全部保证：binding 没有边缘缓存那一层，
 *    `range` 要多少给多少，不会出现「冷对象回 200 + 整个文件」。
 */
async function serveFromBinding(
  key: string,
  rangeHeader: string | null,
  fileName: string
): Promise<Response | null> {
  const bucket = gamesBucket();
  if (!bucket) return null;

  const span = rangeHeader ? parseRangeHeader(rangeHeader) : null;
  // 认不出的 Range 写法交给下面原有的整条链路（它会回 416 / 走常规分支）
  if (rangeHeader && !span) return null;

  let object: R2ObjectLike | null;
  try {
    object = await bucket.get(
      key,
      span
        ? {
            range: {
              offset: span.start,
              // 开放式 `bytes=N-` 不给 length，让 R2 一直取到结尾
              ...(span.end === null ? {} : { length: span.end - span.start + 1 }),
            },
          }
        : undefined
    );
  } catch (error) {
    // 读自家桶失败（极少见）不该让整个接口挂掉：退回公网域名，至少还能出内容
    console.error('[games] R2 binding 读取失败，退回公网域名', key, error);
    return null;
  }

  if (!object) {
    return new Response('not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const total = object.size;
  const start = span?.start ?? 0;
  if (span && start >= total) {
    await object.body?.cancel();
    return new Response(null, {
      status: 416,
      headers: { 'Cache-Control': 'no-store', 'Content-Range': `bytes */${total}` },
    });
  }

  /*
   * 本次真正拿到多少：`range.length` 是 R2 实际返回的那一段（请求越界时会被截短），
   * 没带 range 时就是整个对象。**Content-Length 必须按这个数写**，写错前端拼出来的
   * Blob 就少字节，而且不会报错。
   */
  const length = object.range?.length ?? Math.max(0, total - start);
  if (!object.body || length <= 0) {
    await object.body?.cancel();
    return new Response('empty object', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  const end = start + length - 1;

  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': contentDisposition(fileName),
    'Content-Length': String(length),
    'Accept-Ranges': 'bytes',
    /* 一律 no-store，理由见上面那段「ROM 一律不进边缘缓存」。 */
    'Cache-Control': 'private, no-store',
  };
  if (span) headers['Content-Range'] = `bytes ${start}-${end}/${total}`;

  return new Response(object.body, { status: span ? 206 : 200, headers });
}

/**
 * 把响应原样转给浏览器：只留这几个头，别把 `age` / `cf-*` / `server` 也抄过来
 * （那会让上游 / 出口那一跳的缓存状态渗透进这一跳的响应头）。
 */
function relayEgress(response: Response, fileName: string): Response {
  if (!response.body) return response;
  const headers = new Headers();
  for (const name of [
    'content-type',
    'content-length',
    'content-disposition',
    'cache-control',
    'content-range',
    'accept-ranges',
    'etag',
    'last-modified',
    'retry-after'
  ]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has('content-disposition')) {
    headers.set('content-disposition', contentDisposition(fileName));
  }
  return new Response(response.body, { status: response.status, headers });
}

/**
 * 经 `ROM_EGRESS_ORIGIN` 那一跳去取同一份 ROM，失败回 `null`（调用方退回直连）。
 *
 * ## 为什么需要这一跳（2026-10-22）
 *
 * 实测：同一份上游 ROM，**Cloudflare Workers 上取得到，Vercel 上取不到**。
 * 跟本仓库的代码无关 —— 上游前面挂着 Cloudflare，风控是按**出口**判的：
 * Worker 的出口就是 Cloudflare 自己的网段，等于同一张网里的下一跳；
 * Vercel 函数跑在 AWS 上，机房 IP + 非浏览器的 TLS 指纹，直接被挑战 / 403。
 *
 * 所以配了这个变量之后，**上游那批 ROM 不从 Vercel 出网**，改让 Cloudflare 上那份
 * 站点代取（同一个接口、同一条 Range），本函数只做转发。R2 自持的那批不走这一跳 ——
 * 公网域名从哪儿都能取。
 *
 * ⚠️ 2026-11-06 起出口那一跳回的也是 `private, no-store`（ROM 不再进边缘缓存，
 * 见文件上方那段），所以别指望「转发一次就把整份留在 CF 缓存里」——分片就是分片，
 * 每片都得真回源。
 */
async function fetchThroughEgress(
  request: Request,
  origin: string,
  id: string,
  timeoutMs: number,
  range: string | null
): Promise<Response | null> {
  let hop: URL;
  try {
    hop = new URL(`/api/games/${encodeURIComponent(id)}/rom`, origin);
  } catch {
    console.error('[games] ROM_EGRESS_ORIGIN 不是合法地址，已忽略', origin);
    return null;
  }
  // 自己就是出口那一跳 / 已经在出口侧 → 直连，别绕回自己
  if (hop.host === new URL(request.url).host) return null;
  if (request.headers.get(EGRESS_HEADER)) return null;
  hop.search = new URL(request.url).search; // ?lang= / ?disc= / ?span= 原样带过去

  const headers = new Headers({ accept: '*/*', [EGRESS_HEADER]: '1' });
  /*
   * 区间**显式传进来**，不要从 `request.headers` 读（2026-11-06）：站内那层
   * Workers Caching 可能已经把 `Range` 摘掉了，而 `?span=` 还在查询串里。
   * 出口那一跳可能是旧版本部署，它只认 `Range`，所以这里必须把它补回去。
   */
  if (range) headers.set('range', range);
  const validator = request.headers.get('if-range');
  if (validator) headers.set('if-range', validator);

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('Egress headers timed out', 'TimeoutError')),
    Math.max(0, timeoutMs)
  );
  try {
    return await fetch(hop, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.any([request.signal, controller.signal])
    });
  } catch (error) {
    // 出口那一跳挂了不该让整个接口跟着挂：记一笔，退回直连（Vercel 上大概还是 403，
    // 但那是上游的问题，不是这里的问题）。
    console.error('[games] 上行出口失败，退回直连', id, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;

  /*
   * 要哪一段：**`?span=` 优先，`Range` 头兜底**（2026-11-06）。
   *
   * 顺序不能反：站内那层 Workers Caching 在缓存未命中时会摘掉 `Range`，请求头里的
   * 区间根本到不了这里；查询串则原样保留。反过来不存在（没人会改查询串）。
   * 理由见 `parseSpanParam` 顶上那段。
   */
  const range = parseSpanParam(searchParams.get('span')) ?? request.headers.get('range');
  if (range && !isSingleByteRange(range)) {
    return new Response('Only a single valid byte range is supported', { status: 416, headers: { 'Cache-Control': 'no-store' } });
  }

  /*
   * `?lang=` = 这一款要哪个语言版本的 ROM（2026-10-20 起由 `game_roms` 直接支持）。
   * 不传就按站内语言顺序取默认那一份（`zh` → `en` → `ja` → `ko`）。
   *
   * `?disc=` = 多碟 CD 游戏要第几张碟（2026-10-22 加，默认 1）。
   * 换碟时前端拿 `?disc=2` 再要一次字节；单碟游戏永远只有 disc 1，传别的号会 404。
   */
  const lang = searchParams.get('lang')?.trim() || null;
  const requestedDisc = Number(searchParams.get('disc') ?? '1');
  const disc = Number.isInteger(requestedDisc) && requestedDisc >= 1 ? requestedDisc : 1;

  /*
   * 回源目标：按 `source_url` 的前缀分派（见文件头）。
   *   `r2:` 那批是本站自持的对象，地址由 `publicUrl()` 现拼（换域名不用改数据）。
   */
  let roms: Awaited<ReturnType<typeof getGameRoms>>;
  try {
    roms = await lookupGameRoms(id);
  } catch (error) {
    console.error('[games] ROM 查询失败', error);
    return new Response('lookup failed', { status: 500 });
  }
  if (roms.length === 0) return new Response('not found', { status: 404 });

  /*
   * 取哪一份（2026-10-20 起「自有 R2 优先」）：
   *   ① 先按 `?disc=` 锁死碟号（2026-10-22 加）—— 多碟游戏不同碟是不同文件，
   *      这一维必须在语言之前，否则 `?disc=2` 会被别的碟的行抢走；
   *   ② 再按 `?lang=` 挑语言，其中优先 `r2:`，没有才回上游；
   *   ③ 语言没给 → 任意语言里优先 `r2:`，一份都没有才用第一份。
   * 顺序不能反：先挑语言再挑来源，否则 `?lang=ja` 会被「别的语言的 r2」抢走。
   * 自有对象不经过上游 WAF（没有 challenge、没有兼容重试），能挑就挑它。
   */
  const candidates = roms.filter((rom) => rom.disc === disc && (!lang || rom.language === lang));
  const picked =
    candidates.find((rom) => rom.sourceUrl?.startsWith('r2:')) ??
    candidates[0] ??
    /*
     * 兜底**只允许发生在默认碟**。`?disc=3` 这种超出碟数的请求必须 404 ——
     * 静默回第一碟会让前端拿到一份和碟号对不上的文件，现象比报错难查得多。
     */
    (disc === 1 ? roms[0] : undefined);
  if (!picked) return new Response('disc not found', { status: 404 });
  const fileName = picked.romName || 'rom';
  const selfHosted = picked.sourceUrl?.startsWith('r2:') ?? false;
  const selfHostedKey = selfHosted ? (picked.sourceUrl as string).slice(3) : null;

  /*
   * 本站自持的那批：**先走 R2 binding**（2026-11-05 加）。
   *
   * 走通就完全不经公网域名 ⇒ 没有 `files.retrogamesbox.com` 前面那层缓存，
   * 也就没有「冷对象忽略 Range、回 200 + 整个文件」。探针拿到的一定是
   * `206 + Content-Range: bytes 0-0/<total>`，前端因此永远走 4 MiB 分片。
   *
   * 返回 null 只表示这条通道不可用（本地 `next dev` 没有 binding），
   * 此时照旧走下面的公网地址 —— 与加这段之前一字不差。
   *
   * ⚠️ 这一支**排在 `publicUrl()` 之前**：binding 通了就不需要那个环境变量，
   *    而 `publicUrl()` 缺配置是会抛的（它只适合当兜底）。
   */
  if (selfHostedKey) {
    const served = await serveFromBinding(selfHostedKey, range, fileName);
    if (served) return served;
  }

  const target = selfHostedKey
    ? publicUrl(selfHostedKey)
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

  /*
   * 上游那批先看有没有配「上行出口」（见 `fetchThroughEgress` 顶上那段）。
   * 配了就整段交给它，本函数只转发；没配 / 出口挂了 / 已经是出口那一侧 ⇒ 照旧直连。
   *
   * ⚠️ 只有上游那批才绕：R2 对象是我们自己的公网域名，从哪儿取都一样，
   *    多绕一跳只会多一次往返。
   */
  const egressOrigin = process.env.ROM_EGRESS_ORIGIN?.trim().replace(/\/+$/, '');
  if (fromUpstream && egressOrigin) {
    const viaEgress = await fetchThroughEgress(
      request,
      egressOrigin,
      id,
      UPSTREAM_TIMEOUT_MS + 10_000,
      range
    );
    if (viaEgress) return relayEgress(viaEgress, fileName);
  }

  /*
   * 回源参数抽成变量，是为了下面「Range 被忽略时补要一次」能原样复用 ——
   * 两跳必须完全同构，否则补要那一跳可能又走成另一个分支。
   */
  const upstreamOptions = {
    timeoutMs: UPSTREAM_TIMEOUT_MS,
    /*
     * 区间**显式传**，别让 `rom-upstream.ts` 去读 `request.headers`（2026-11-06）：
     * 走到这里时 `Range` 可能已经被站内那层 Workers Caching 摘掉了，而 `?span=` 还在。
     * `range` 为 null 时字段省略，那边仍按请求头兜底（curl / 外链）。
     */
    ...(range ? { range } : {}),
    /*
     * 回源上游时带上访客那组「像浏览器」的头（白名单在 `rom-upstream.ts` 的
     * `CLIENT_HINT_HEADERS`）—— 目的只是别让每片请求都顶着同一个 `nesLoad/1.0`。
     *
     * ⚠️ R2 那条**不带**：对象是我们自己的，不需要伪装；而 UA 一多样，
     *    同一个 key 在边缘就会被缓存成好几份，命中率白掉。
     */
    clientHints: fromUpstream,
    compatibility: fromUpstream ? { userAgent: UPSTREAM_USER_AGENT, referer: `${UPSTREAM_SITE}/` } : undefined,
  };

  let upstream: Response;
  try {
    upstream = await fetchRomUpstream(target, request, upstreamOptions);
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
  /*
   * ⚠️ **上游会把 `Range` 整个忽略掉，回 200 + 整个文件**（2026-11-05 实测确认）。
   *
   * 触发条件是「这个对象在那台边缘节点上还是冷的」：上游那一跳前面也有 Cloudflare，
   * 冷对象 + Range 请求走的是「全量回源」，回 200 而不是 206。R2 公网域名同样如此。
   *
   * ## 不处理会怎样
   *
   * 下面 `servesWholeFile` 会因为 `status === 200` 判成「整份」，于是**客户端只要
   * 1 个字节（前端的 `bytes=0-0` 探针），Worker 也要把几十上百 MB 原样流一遍**。
   * 免费版 Worker 在第 100 秒左右会被掐：
   *   · 还没吐出响应头就被杀 → `503` + 空 body；
   *   · 已经开始转、中途断掉但 HTTP 仍是 `200` 且干净收尾 → **静默截断**。
   * 后者最毒：`200` 没有 `Content-Range`、没有总长可校验，前端会把 572 KB 的残包
   * 当成 265 MB 的完整 ROM 交给 7z（实测就是 `rival-schools-united-by-fate`）。
   *
   * ## 现在怎么处理
   *
   * 放掉这份整包 —— **请求已经打到上游，它会在后台把对象填进边缘缓存**（实测：
   * 客户端 3 秒就断、一个字节都不收，10 秒后再要同一段已经是 206）。然后轮询等它
   * 暖（见 `waitForRange`）：
   *   · 暖了就换成那份 206 继续走；
   *   · 探针还没暖 → 用 `content-length` 造一个 `206 bytes 0-0/T` 回给前端，
   *     至少让前端拿到总长，不至于把残包当整包；
   *   · 分片还没暖 → `503 + Retry-After`，让前端按自己的重试节奏再来。
   *
   * ⚠️ 三种情况的共同点是「绝不把带 Range 的请求接到一个 200 整包上」。
   *    `wholeFileRequest` 那一支是例外：请求区间本来就覆盖整个文件（前端对小 ROM
   *    的 `bytes=0-<total-1>`），200 正是它要的东西。
   */
  if (range && upstream.status === 200) {
    const declared = Number(upstream.headers.get('content-length') ?? 0);
    const span = parseRangeHeader(range);
    const wholeFileRequest =
      span !== null && span.start === 0 && declared > 0 && (span.end === null || span.end >= declared - 1);

    /*
     * `declared === 0` 也要进：那是「200 但没有 Content-Length」（分块传输）。
     * 这种响应连总长都拿不到，转发出去前端同样校验不了，只能按冷对象处理。
     */
    if (!wholeFileRequest && (declared === 0 || declared >= RANGE_RETRY_MIN_BYTES)) {
      const probeOnly = span !== null && span.start === 0 && span.end === 0;

      // 先放掉这份整包，让上游把带宽用在「填缓存」上，而不是往这条必死的连接里塞
      await upstream.body?.cancel();

      const warmed = await waitForRange(
        target,
        request,
        upstreamOptions,
        probeOnly ? WARMUP_PROBE_WAIT_MS : WARMUP_CHUNK_WAIT_MS
      );

      if (warmed) {
        upstream = warmed;
      } else if (probeOnly && declared > 0) {
        /*
         * 探针等不到了，但它只需要「总长」这一件事 —— 刚拿到的 `content-length`
         * 就是整个文件的大小，据此造一个单字节 206。
         * 前端 `lib/http.ts` 只校验 `start === 0 && end === 0 && total > 0`，够用。
         */
        return new Response(new Uint8Array(1), {
          status: 206,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Range': `bytes 0-0/${declared}`,
            'Content-Length': '1',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-store',
            'Content-Disposition': contentDisposition(fileName),
          },
        });
      } else {
        /*
         * 分片没等到暖：明确说「等一下再要」。
         * 回 200 是重复上面的灾难，回一个空 206 会让前端拼进缺字节的块 —— 都不行。
         */
        return new Response('upstream warming', {
          status: 503,
          headers: { 'Cache-Control': 'no-store', 'Retry-After': WARMUP_RETRY_AFTER },
        });
      }
    }
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

  /*
   * 响应体到底是不是**整个文件** —— 只用来决定状态码和要不要带 `Content-Range`。
   *
   * 两种情况都算：
   *   · 上游忽略了 `Range`，直接回 200（完整表示）；
   *   · 回了 206，但范围正好覆盖 `0..total-1` —— **小 ROM 的常态**：
   *     前端小文件那条一次要整份（`lib/http.ts` 的 `fetchWholeRange`），而文件只有
   *     256 KB，上游于是回 `bytes 0-262143/262144`。
   *
   * ⚠️ 它**不再影响缓存头**：ROM 一律 `no-store`，理由见文件上方那段
   *    「ROM 一律不进边缘缓存」（边缘会把整包存成截断副本，再发给所有分片请求）。
   */
  const upstreamRange = upstream.headers.get('content-range');
  const servesWholeFile =
    upstream.status === 200 || (upstream.status === 206 && isCompleteByteRange(upstreamRange));

  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': contentDisposition(fileName),
    'Cache-Control': 'private, no-store',
  };
  for (const name of ['accept-ranges', 'etag', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  /*
   * `Content-Range` 只在**真分片**时带：`200` 配 `Content-Range` 是自相矛盾的响应，
   * 有些代理会因此把整份当成部分对象处理（反过来又是一次「缓存了半截」）。
   */
  if (!servesWholeFile && upstreamRange) headers['Content-Range'] = upstreamRange;
  const length = upstream.headers.get('content-length');
  if (length) headers['Content-Length'] = length;

  /*
   * 整份一律回 **200**（哪怕上游是 206）：前端小文件那条要的就是「一次拿整份」，
   * 200 正好对应这个语义；真分片（`servesWholeFile === false`）仍旧 206。
   *
   * ⚠️ 200 / 206 都带 `no-store`（见上面的缓存段）。**别**再为了「回访快一点」
   *    给 200 盖上 `s-maxage` —— 第 0 层收到可缓存的 200 就会把几百 MB 存成截断副本，
   *    再以 200 发给之后所有分片请求，线上整款游戏直接打不开。
   */
  return new Response(upstream.body, { status: servesWholeFile ? 200 : upstream.status, headers });
}
