/*
 * 取数与响应体读取的几个小工具。
 *
 * 原来都写在 `ConsoleScene` 里（private），2026-10-14 加 `/play` 那页时抽出来 ——
 * 两边都要「带进度的下载」和「认不认得出这是用户自己取消的」，抄一份迟早会漂。
 *
 * ===== ROM 下载：探针 + 并发分片（2026-11-04 二次改）=====
 *
 * 当天先改成整包直下，实测速度不可接受（单流 0.25–0.5 MB/s，83 MiB 要几分钟），
 * 所以分片又加回来了 —— 但这次**修掉「拼出来的文件不完整」那个根**：
 *
 *   1. 探针只要 **1 字节**（`bytes=0-0`），只为问出总长度和支持不支持 Range。
 *      旧版探针一开口就是 8 MiB，小文件等于白下一次。
 *   2. 每一片都**同时核对三件事**：状态 206、`Content-Range` 的 start/end/total
 *      与请求完全一致、`blob.size` 等于区间长度。少一样就重试，重试不过就对半切。
 *      只核字节数是旧版最大的漏洞：同长度但起点错位的响应能拼出一个
 *      **字节数完全正确、内容全错**的文件，核心只会静默失败。
 *   3. 拼完再核对一次总长度（`parts` 一个不缺 + `blob.size === total`）。
 *   4. 服务器不认 Range（回 200 整包）时，**直接用这一个响应**，不再发第二次请求 ——
 *      上游那批 PS1 / NDS / GBA 盘都是这种。但**必须先能核对长度**：200 且没有
 *      `Content-Length` 的一律拒收（`UnverifiableBodyError`）。
 *
 *      ⚠️ 这条是 2026-11-06 补的，补的原因很具体：线上开着 Workers Caching
 *      （`wrangler.jsonc` 的 `cache.enabled`），它在缓存未命中时会**摘掉 `Range`**
 *      再回源，于是探针收到的是一个 200 + 整个几百 MB 的响应；那一层还会把它存成
 *      **截断副本**（实测 261 MB 的对象只剩 44.8 MB）。以前这里只判 `size === 0`，
 *      于是 44.8 MB 的残包被当成整张光盘交给核心，现象只是「游戏打不开」。
 *      现在没有 `Content-Length` 就直接报「文件不完整，请重试」，至少是句准话。
 *
 *   5. **区间同时编进查询串**（`?span=0-4194303`，2026-11-06 晚些补）。
 *      第 4 条只是把「收到残包」变成一句准话，没治病：那一层仍是每次未命中就摘
 *      `Range`，探针照旧要拉整包，Worker 照旧被掐。那一层在 Worker **外面**，
 *      既没有 per-path 开关、也不想为它单配一条 Cache Rule，所以让请求**不依赖
 *      请求头**：`?span=` 会原样进缓存键，谁也不会改它。`Range` 头一起发，
 *      只为兼容出口跳板（`ROM_EGRESS_ORIGIN`）与旧版本部署；路由以 `?span=` 为准。
 *      见 `romSpanUrl`。
 *
 *   6. **分片走边缘缓存 + 版本号**（2026-11-07）。
 *      一次分片就是一次 Worker 调用，427 MB 的光盘 100 多次，免费版 10 万次/天
 *      只够约 970 次完整载入。所以分片必须能被第 0 层存住：
 *
 *        · 服务端对 span 分片回 **200**（Cloudflare 默认不缓存 206）+ `X-Rom-Span`
 *          / `X-Rom-Total`，前端两种形态都认（见 `fetchSpan` 的校验）；
 *        · 探针回 `X-Rom-Version`，前端把它挂成后续分片的 `?v=` —— **缓存键随
 *          「这份文件」变化**，换 ROM 后旧分片永远不会被发出来；
 *        · 探针自己 `no-store`，所以它永远是版本号的可靠来源。
 *
 *      分片大小同时从 4 MiB 调到 8 MiB，首次下载的请求数再砍半（见 `ROM_CHUNK_BYTES`）。
 */

/**
 * 响应体没有读满（`Content-Length` 说有 N 字节，实际只收到 M 字节）。
 *
 * ⚠️ **这不是理论上的边角情况**：PS1 的盘动辄 200–500 MiB，走的是
 * `/api/games/[id]/rom` 这条流式代理，中间任何一跳断开（浏览器、CDN、上游）都会
 * 让流提前 `done`。以前这里直接 `new Blob(chunks)` 返回，调用方拿到的就是一个
 * **静默截断**的文件 —— 核心侧 `chd_open()` 读不到尾部的 map 表，
 * `retro_load_game()` 返回 false，RetroArch 于是退回主菜单（屏幕上只有
 * 「Select which core to use.」），从头到尾没有一行报错。
 *
 * 所以短读必须在这里抛出来：宁可让用户看到「下载不完整，请重试」，
 * 也不要让一个坏文件悄悄进到核心里去。
 */
export class IncompleteBodyError extends Error {
  readonly expected: number;
  readonly received: number;

  constructor(expected: number, received: number) {
    super(`incomplete body: expected ${expected} bytes, received ${received}`);
    this.name = 'IncompleteBodyError';
    this.expected = expected;
    this.received = received;
  }
}

/**
 * 响应体一个字节都没有。
 *
 * 线上代理偶尔会回 `200` + 空 body（R2 那一段被提前关掉），这种响应连
 * `Content-Length` 都没有，`readBodyWithProgress` 无从核对。继承
 * `IncompleteBodyError` 是为了让调用方那句「文件不完整，请重试」照常生效 ——
 * 它确实是同一类失败，只是判定依据不同（空 vs 少）。
 */
class EmptyBodyError extends IncompleteBodyError {
  constructor() {
    super(1, 0);
    this.name = 'EmptyBodyError';
    this.message = 'empty body: no bytes received';
  }
}

/**
 * 服务器回了 `200`（=「这就是整个文件」）却**没有 `Content-Length`**。
 *
 * 继承 `IncompleteBodyError` 是因为调用方的处理完全一样：宁可让用户看到
 * 「文件不完整，请重试」，也不要把一份**没法核对长度**的字节交给核心。
 *
 * 为什么会走到这里（2026-11-06 实测）：Cloudflare 的 Workers Caching 在缓存未命中时
 * 会把 `Range` 摘掉再回源，探针于是拿到 200 + 整个几百 MB 的响应；它还会把这份响应
 * 存成**截断副本**（261 MB 的对象只剩 44.8 MB，且没有 `Content-Length`）。
 * 只判 `size === 0` 的话，残包会被当成整张光盘，核心侧静默失败、界面上只有「打不开」。
 */
class UnverifiableBodyError extends IncompleteBodyError {
  constructor() {
    super(1, 0);
    this.name = 'UnverifiableBodyError';
    this.message = 'unverifiable body: 200 without content-length';
  }
}

/**
 * 流式读一个响应体，边读边报下载进度。
 *
 * 从游戏库载入时 ROM 是整包拉下来的，几 MB 的 romset 不给进度就像卡死了 ——
 * `res.blob()` 要等全部下完才 resolve，中途什么都看不到，所以这里手动读流。
 *
 * 拿不到 Content-Length（响应被压缩 / 分块传输）时进度一律报 null，
 * 界面据此退回一条来回滑的「不确定」进度条 —— 总比原地不动强。
 * 按 1% 节流，避免几百个 chunk 把场景重渲染几百次。
 *
 * 流读完时**核对字节数**：`Content-Length` 已知却没读满就抛 `IncompleteBodyError`。
 * 只判「少了」不判「多了」—— 服务器若对 body 做了压缩，`loaded` 可能大于
 * `total`（那是解压后的字节数），那种情况不该报错。
 */
export async function readBodyWithProgress(
  res: Response,
  onProgress: (ratio: number | null) => void
): Promise<Blob> {
  const total = Number(res.headers.get('content-length')) || 0;
  const body = res.body;
  if (!body) return res.blob();

  const reader = body.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;
  let lastPct = -1;

  // 先给一帧「开始下载」：总字节数未知时是 null（不确定进度条），已知时从 0 起步
  onProgress(total > 0 ? 0 : null);

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    /*
     * 每块**立刻包成 Blob**，不要攒 `Uint8Array`。
     *
     * 攒字节的话，最后那句 `new Blob(chunks)` 会把整个文件**再拷一遍** ——
     * 790 MiB 的 PS1 bin 就是 1.6 GiB 的瞬时峰值，标签页直接被打死
     * （和 `lib/emulator.ts` 的 `writeRomIntoFs` 是同一类问题的另一半）。
     * 包成 Blob 之后，最后那次 `new Blob(chunks)` 只是把若干个 Blob **拼引用**，不复制；
     * 浏览器还能把 Blob 存储换到磁盘上。
     *
     * 这里不用 `new Uint8Array(value)` 转一道：`BlobPart` 收 `ArrayBufferView`，
     * `value` 本身就是，只是 TS 的泛型（`Uint8Array<ArrayBufferLike>`）不让直接过。
     */
    chunks.push(new Blob([value as unknown as BlobPart]));
    loaded += value.byteLength;

    if (total <= 0) continue;
    const pct = Math.floor((loaded / total) * 100);
    if (pct === lastPct) continue;
    lastPct = pct;
    onProgress(Math.min(loaded / total, 1));
  }

  // 见 `IncompleteBodyError` 的注释：短读是「文件已经坏了」的信号，不能静默放行。
  if (total > 0 && loaded < total) {
    throw new IncompleteBodyError(total, loaded);
  }

  return new Blob(chunks, { type: 'application/octet-stream' });
}

/*
 * ===== 分片参数 =====
 *
 * 8 MiB 一片（2026-11-07 从 4 MiB 调上来）。
 *
 * 为什么要调大：**一次分片 = 一次 Worker 调用**。4 MiB 时一张 427 MB 的光盘要
 * 103 次（1 次探针 + 102 片），免费版每天 10 万次，等于只够约 970 次完整载入。
 * 8 MiB 把请求数直接砍半。再往上（16 MiB）单片下载时间太长，网络差的时候容易被
 * Worker 的响应时长上限掐掉，断流后的重试成本也更高 —— 8 是两头之间比较稳的一档。
 *
 * 4 路并发：单流实测 0.25–0.5 MB/s，4 路大约能把 83 MiB 压到一分钟以内。
 */
const ROM_CHUNK_BYTES = 8 * 1024 * 1024;
const ROM_CHUNK_CONCURRENCY = 4;
/** 一段失败重试几次（不含首次）。 */
const ROM_CHUNK_RETRIES = 2;
/** 对半切的下限，再小只剩请求开销。 */
const ROM_CHUNK_MIN_BYTES = 1024 * 1024;
/** 最多切几层：4 MiB → 2 → 1 MiB。 */
const ROM_CHUNK_SPLIT_DEPTH = 2;
/**
 * 小文件走「一次 Range 拿整份」的阈值。
 *
 * 这个尺寸以下的包一次就要得完，多发几个请求只是多几次 RTT。
 * （ROM 从 2026-11-06 起一律 `no-store`，所以「整份能进缓存」这条早就不是理由了；
 * 阈值留着是因为它对**请求数**仍然成立。）
 */
const ROM_DIRECT_MAX_BYTES = 8 * 1024 * 1024;

/**
 * 往 URL 上挂一个查询参数（保留原有的）。
 *
 * 只在已有查询串后面追加，不解析重建 —— 传进来的是相对路径（`/api/games/x/rom`），
 * 用 `new URL()` 得先补 base，稍不注意就把绝对地址带进 `fetch`。
 */
function withQueryParam(url: string, name: string, value: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}${name}=${encodeURIComponent(value)}`;
}

/**
 * 把 `[start, end]` 编成 ROM 接口的查询串，同时给出要一并发送的 `Range` 头。
 *
 * ## 为什么不只靠 `Range`（2026-11-06）
 *
 * 站点前面那层 Workers Caching（`wrangler.jsonc` 的 `cache.enabled`）在**缓存未命中**
 * 时会先摘掉 `Range` 再回源 —— 它要一整份来填缓存。于是探针 `bytes=0-0` 落到路由
 * 时已经「没有区间」，路由按无 Range 回 200 + 整个几百 MB；那一层再把大文件存成
 * **截断副本**，之后所有分片都命中这个坏副本，游戏静默打不开（线上事故）。
 *
 * 那一层在 Worker 外面，代码里改不动它，也没有 per-path 开关。能让请求不受影响的
 * 办法只有一个：**别把区间放在请求头里** —— 查询串会原样进缓存键，不会被谁摘掉。
 * 路由侧的优先级见 `app/api/games/[id]/rom/route.ts` 的 `?span=`。
 *
 * `Range` 头仍然一起发：出口那一跳（`ROM_EGRESS_ORIGIN`）与旧版本部署靠它工作，
 * 而且它本来就是这条接口的公开语义，删掉等于把一个能力丢掉。
 *
 * `end === null` 表示「一直到结尾」（`?span=N-`），和服务端的开放式 Range 对应。
 */
function romSpanUrl(url: string, start: number, end: number | null): string {
  return withQueryParam(url, 'span', end === null ? `${start}-` : `${start}-${end}`);
}

/** `[start, end]` → `bytes=start-end`；`end === null` → `bytes=start-`。 */
function romRangeHeader(start: number, end: number | null): string {
  return `bytes=${start}-${end === null ? '' : end}`;
}

/** `X-Rom-Span: 0-8388607` → `{ start, end }`；新后端用它表达「这一段」。 */
function parseSpanHeader(value: string | null): { start: number; end: number } | null {
  const match = /^(\d+)-(\d+)$/.exec(value ?? '');
  if (!match) return null;
  const [start, end] = match.slice(1).map(Number);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return null;
  return { start, end };
}

/** `bytes 0-1048575/94371840` → `{ start, end, total }`；`bytes * /N` 之类返回 null。 */
function parseContentRange(value: string | null): { start: number; end: number; total: number } | null {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value ?? '');
  if (!match) return null;
  const [start, end, total] = match.slice(1).map(Number);
  if (![start, end, total].every(Number.isSafeInteger)) return null;
  return { start, end, total };
}

/** 用户取消要立刻停：抛一个和浏览器一致的 AbortError，调用方按 `isAbortError` 认。 */
function abortError(): Error {
  return new DOMException('aborted', 'AbortError');
}

/** HTTP failures keep their status so permanent errors are not split and retried. */
class RomHttpError extends Error {
  readonly retryMs: number;
  constructor(readonly status: number, retryAfter: string | null) {
    super('HTTP ' + status);
    const seconds = Number(retryAfter);
    const date = Date.parse(retryAfter ?? '');
    this.retryMs = retryAfter ? Math.max(0,
      Number.isFinite(seconds) ? seconds * 1000 : Number.isFinite(date) ? date - Date.now() : 0) : 0;
  }
  get transient() { return [408, 429, 500, 502, 503, 504].includes(this.status); }
}

async function checkRomResponse(response: Response): Promise<Response> {
  if (response.ok) return response;
  const error = new RomHttpError(response.status, response.headers.get('retry-after'));
  await response.body?.cancel().catch(() => {});
  throw error;
}

function waitForRomRetry(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const abort = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function retryRom<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw abortError();
    try { return await operation(); }
    catch (error) {
      if (signal?.aborted) throw abortError();
      /* 重试解决不了：服务器每次都会回同一个「200 且无长度」，只会白拉三遍整包。 */
      if (error instanceof UnverifiableBodyError) throw error;
      if (attempt >= ROM_CHUNK_RETRIES || (error instanceof RomHttpError && (!error.transient || error.retryMs > 30_000))) throw error;
      await waitForRomRetry(Math.max(error instanceof RomHttpError ? error.retryMs : 0,
        500 * 2 ** attempt), signal);
    }
  }
}

/**
 * 下一个 ROM，返回整包 Blob。
 *
 * 三部曲：
 *   1. 探针 `bytes=0-0`，问出总长度；
 *   2. 总长 ≤ 8 MiB → 一次 Range 拿整份；
 *   3. 否则 4 MiB 一片、4 路并发，每片核对状态 / Content-Range / 字节数。
 *
 * ⚠️ 每个请求的区间都**同时**写进 `?span=` 和 `Range`（见 `romSpanUrl`）：
 *    请求头会被 Workers Caching 摘掉，查询串不会。
 *
 * 服务器不认 Range 时（探针直接回 200 整包），**就用探针那个响应体**当整包读 ——
 * 那批上游盘（PS1 / NDS / GBA）本来就只有这一条路，多打一次请求纯属浪费。
 *
 * 接口和调用方约定不变（给进度、认 abort、短读抛 `IncompleteBodyError`）。
 */
export async function fetchRomWithProgress(
  url: string,
  options: { signal?: AbortSignal; onProgress: (ratio: number | null) => void }
): Promise<Blob> {
  const { signal, onProgress } = options;

  // ---------- 1. 探针：只要 1 字节 ----------
  const initial = await retryRom(async () => {
    const response = await checkRomResponse(
      await fetch(romSpanUrl(url, 0, 0), { signal, headers: { Range: romRangeHeader(0, 0) } })
    );
    if (response.status !== 200) return { response, blob: null };
    /*
     * 200 = 服务器没理 Range，这份就是「整个文件」。但**没有 `Content-Length`
     * 就无从核对**，宁可报错也别收下（原因见 `UnverifiableBodyError`）。
     */
    if (!Number(response.headers.get('content-length'))) {
      await response.body?.cancel().catch(() => {});
      throw new UnverifiableBodyError();
    }
    // Include body reads in the retry: a 200 can still be truncated mid-stream.
    const blob = await readBodyWithProgress(response, onProgress);
    if (blob.size === 0) throw new EmptyBodyError();
    return { response, blob };
  }, signal);
  const probe = initial.response;
  if (initial.blob) {
    onProgress(1);
    return initial.blob;
  }

  const probeRange = parseContentRange(probe.headers.get('content-range'));
  const supported =
    probe.status === 206 &&
    probeRange !== null &&
    probeRange.start === 0 &&
    probeRange.end === 0 &&
    probeRange.total > 0;

  if (!supported) {
    // 206 但范围长得不对（代理改写 / 中间层塞了别的东西）：别拿这 1 字节当文件
    await probe.body?.cancel().catch(() => {});
    throw new Error(`unexpected range response: ${probe.status}`);
  }

  const total = probeRange.total;
  /*
   * 后面所有分片都挂上 ROM 版本（`?v=`），让边缘能把每一片一直缓存到「这份文件
   * 被换掉」为止。版本由服务端按「文件名 + 来源 + 总大小」算，探针本身永远
   * `no-store`，所以换盘后第一个探针就会给出新版本，分片自动落到新键上 ——
   * 不会出现「旧分片混进新文件」那种拼出来全是错字节的坏包。
   *
   * 旧后端不给这个头，那就退回不带版本的 URL（行为与加它之前一字不差）。
   */
  const version = probe.headers.get('x-rom-version');
  const chunkUrl = version ? withQueryParam(url, 'v', version) : url;

  // 这 1 字节用不上，早点把连接还回去；cancel 失败不影响后面（响应已经拿到了）
  await probe.body?.cancel().catch(() => {});
  onProgress(0);

  // ---------- 2. 小文件：一次拿整份 ----------
  if (total <= ROM_DIRECT_MAX_BYTES) {
    const blob = await retryRom(() => fetchWholeRange(chunkUrl, total, signal), signal);
    onProgress(1);
    return blob;
  }

  // ---------- 3. 大文件：并发分片 ----------
  return fetchInChunks(chunkUrl, total, signal, onProgress);
}

/**
 * 用一次 Range 拿 `0..total-1`，核对长度。
 *
 * 服务端可能把「覆盖整份的 206」改写成 200，所以这里**不要求 206**，
 * 只要求字节数对得上 —— 200 和 206 都接受。
 */
async function fetchWholeRange(
  url: string,
  total: number,
  signal: AbortSignal | undefined
): Promise<Blob> {
  const res = await fetch(romSpanUrl(url, 0, total - 1), {
    signal,
    headers: { Range: romRangeHeader(0, total - 1) },
  });
  await checkRomResponse(res);
  const blob = await res.blob();
  if (blob.size === 0) throw new EmptyBodyError();
  if (blob.size !== total) throw new IncompleteBodyError(total, blob.size);
  return blob;
}

/**
 * 按 4 MiB 切片、4 路并发下完，每片严格核对 `Content-Range` 与长度。
 *
 * 任何一片连续失败就二分重试（4 → 2 → 1 MiB），还不行就整单失败 ——
 * 绝不会把「少一段」或「错一段」的字节拼进结果里。
 */
async function fetchInChunks(
  url: string,
  total: number,
  outerSignal: AbortSignal | undefined,
  onProgress: (ratio: number | null) => void
): Promise<Blob> {
  const chunkCount = Math.ceil(total / ROM_CHUNK_BYTES);
  const parts: (Blob | undefined)[] = new Array(chunkCount);
  let loaded = 0;
  let lastPct = 0;

  /*
   * 内部 controller：用户取消、或者某一片彻底失败时，把**其余在飞的请求一起掐掉**。
   * 不然一片报错之后另外三路还在搬几十 MB，纯属浪费。
   */
  const aborter = new AbortController();
  const forwardAbort = () => aborter.abort();
  if (outerSignal) {
    if (outerSignal.aborted) throw abortError();
    outerSignal.addEventListener('abort', forwardAbort, { once: true });
  }

  const chunkStart = (index: number) => index * ROM_CHUNK_BYTES;
  const chunkEnd = (index: number) => Math.min((index + 1) * ROM_CHUNK_BYTES, total) - 1;

  const report = (size: number) => {
    loaded += size;
    const pct = Math.floor((loaded / total) * 100);
    if (pct === lastPct) return;
    lastPct = pct;
    onProgress(Math.min(loaded / total, 1));
  };

  /**
   * 要 `[start, end]` 这段，返回按顺序排好的若干 Blob（切过就是多块）。
   *
   * ⚠️ 这里的校验是「文件不完整」的正解，别为了省一次判断删掉任何一条：
   *   · 区间与请求一致 —— 防「同长度、不同起点」的错位响应被拼进去；
   *   · 总长与探针一致 —— 防下载途中对象被换掉；
   *   · `blob.size === expected` —— 防短读。
   *
   * ⚠️ **两种响应形态都要认**（2026-11-07）：
   *   · `206 + Content-Range` —— 旧后端，或者走 Range 老路的客户端；
   *   · `200 + X-Rom-Span / X-Rom-Total` —— 新后端。之所以回 200：Cloudflare
   *     **默认不缓存 206**，而分片能被边缘存住才是「一次之后不再占 Worker 额度」的
   *     全部前提。语义上也说得通 —— URL 里的 `?span=` 已经指名了这一段。
   *
   *   两条分支的校验强度一样，200 那条同样必须核对起点、终点和总长。
   */
  async function fetchSpan(start: number, end: number, depth = 0): Promise<Blob[]> {
    const expected = end - start + 1;
    let failure: unknown = null;

    for (let attempt = 0; attempt <= ROM_CHUNK_RETRIES; attempt += 1) {
      if (outerSignal?.aborted) throw abortError();
      // 兄弟片已经失败了，别再白搬
      if (aborter.signal.aborted) throw failure ?? abortError();
      try {
        const res = await fetch(romSpanUrl(url, start, end), {
          signal: aborter.signal,
          headers: { Range: romRangeHeader(start, end) },
        });
        await checkRomResponse(res);
        const blob = await res.blob();
        const legacy = parseContentRange(res.headers.get('content-range'));
        const cached = parseSpanHeader(res.headers.get('x-rom-span'));
        const cachedTotal = Number(res.headers.get('x-rom-total'));
        const matches =
          blob.size === expected &&
          (legacy
            ? res.status === 206 && legacy.start === start && legacy.end === end && legacy.total === total
            : res.status === 200 && cached !== null && cached.start === start && cached.end === end &&
              cachedTotal === total);
        // 逐条见函数头：少判一条就可能拼进错位或缺失的字节
        if (!matches) throw new IncompleteBodyError(expected, blob.size);
        return [blob];
      } catch (error) {
        // 只有**用户取消**才当 abort 报；兄弟片失败也会抛 AbortError，那不是取消
        if (outerSignal?.aborted) throw abortError();
        if (aborter.signal.aborted) throw error;
        if (error instanceof RomHttpError && (!error.transient || error.retryMs > 30_000)) throw error;
        failure = error;
        if (attempt < ROM_CHUNK_RETRIES) {
          await waitForRomRetry(Math.max(error instanceof RomHttpError ? error.retryMs : 0,
            500 * 2 ** attempt), aborter.signal);
        }
      }
    }

    if (failure instanceof RomHttpError) throw failure;
    if (expected > ROM_CHUNK_MIN_BYTES && depth < ROM_CHUNK_SPLIT_DEPTH) {
      const mid = start + Math.floor(expected / 2);
      const left = await fetchSpan(start, mid - 1, depth + 1);
      const right = await fetchSpan(mid, end, depth + 1);
      return [...left, ...right];
    }
    throw failure ?? new Error(`span ${start}-${end} failed`);
  }

  async function takeChunk(index: number): Promise<void> {
    const start = chunkStart(index);
    const end = chunkEnd(index);
    const pieces = await fetchSpan(start, end);
    // 切过就是多块；拼引用不复制字节
    const merged = pieces.length === 1 ? pieces[0] : new Blob(pieces);
    if (merged.size !== end - start + 1) {
      throw new IncompleteBodyError(end - start + 1, merged.size);
    }
    parts[index] = merged;
    report(merged.size);
  }

  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      if (index >= chunkCount) return;
      cursor = index + 1;
      try {
        await takeChunk(index);
      } catch (error) {
        // 一片倒了就把别的也掐掉，别让它们在后台继续搬
        aborter.abort();
        throw error;
      }
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(ROM_CHUNK_CONCURRENCY, chunkCount) }, () => worker())
    );
  } catch (error) {
    // 用户取消照实抛；一片失败连累出来的 AbortError 要按「没下完」报
    if (outerSignal?.aborted) throw abortError();
    // 具体是哪一片坏了不重要，调用方只需要知道「没拼成，重来」
    if (error instanceof IncompleteBodyError) throw error;
    throw new IncompleteBodyError(total, loaded);
  } finally {
    outerSignal?.removeEventListener('abort', forwardAbort);
  }

  /*
   * 最后一道闸：每一片都必须有，且总长必须对上。
   * 走到这里还能对不上，说明切片逻辑本身有 bug —— 宁可报错也不交出坏文件。
   */
  const missing = parts.findIndex((part) => !(part instanceof Blob));
  if (missing >= 0) throw new IncompleteBodyError(total, loaded);
  const blob = new Blob(parts as Blob[], { type: 'application/octet-stream' });
  if (blob.size !== total) throw new IncompleteBodyError(total, blob.size);

  onProgress(1);
  return blob;
}

/**
 * 这个错误是不是「用户主动取消」。
 *
 * 不写成 `error instanceof DOMException`：跨 realm（iframe / worker）或某些
 * polyfill 下，abort 抛出来的会退化成普通 Error，继承关系靠不住，按 `name` 认最稳。
 * 浏览器原生的 AbortError 本身就是这个名字（见 AbortController.abort()）。
 */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}
