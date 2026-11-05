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
 *      上游那批 PS1 / NDS / GBA 盘都是这种，它们的整包路仍然靠 `Content-Length`
 *      和空响应兜底，这是已知缺口，见 `readBodyWithProgress`。
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
 * 4 MiB 一片：线上实测 8 MiB 的段在并发时更容易断，2 MiB 又让请求数翻倍。
 * 4 路并发：单流实测 0.25–0.5 MB/s，4 路大约能把 83 MiB 压到一分钟以内。
 */
const ROM_CHUNK_BYTES = 4 * 1024 * 1024;
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
 * 这个尺寸以下的包一次就要得完，多发几个请求只是多几次 RTT；
 * 而且整份响应会被服务端归一成 200（可缓存），对回访也友好。
 */
const ROM_DIRECT_MAX_BYTES = 8 * 1024 * 1024;

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

/**
 * 下一个 ROM，返回整包 Blob。
 *
 * 三部曲：
 *   1. 探针 `bytes=0-0`，问出总长度；
 *   2. 总长 ≤ 8 MiB → 一次 Range 拿整份；
 *   3. 否则 4 MiB 一片、4 路并发，每片核对状态 / Content-Range / 字节数。
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
  const probe = await fetch(url, { signal, headers: { Range: 'bytes=0-0' } });
  if (!probe.ok) throw new Error(`HTTP ${probe.status}`);

  /*
   * 服务器忽略了 Range（回 200 就是整个文件）：直接把这个响应读完。
   * ⚠️ 不要 cancel 了再发一次 —— 字节已经在流里了，重发等于白下一遍。
   */
  if (probe.status === 200) {
    const blob = await readBodyWithProgress(probe, onProgress);
    if (blob.size === 0) throw new EmptyBodyError();
    onProgress(1);
    return blob;
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
  // 这 1 字节用不上，早点把连接还回去；cancel 失败不影响后面（响应已经拿到了）
  await probe.body?.cancel().catch(() => {});
  onProgress(0);

  // ---------- 2. 小文件：一次拿整份 ----------
  if (total <= ROM_DIRECT_MAX_BYTES) {
    const blob = await fetchWholeRange(url, total, signal);
    onProgress(1);
    return blob;
  }

  // ---------- 3. 大文件：并发分片 ----------
  return fetchInChunks(url, total, signal, onProgress);
}

/**
 * 用一次 Range 拿 `0..total-1`，核对长度。
 *
 * 服务端会把「覆盖整份的 206」改写成 200（为了能进缓存），所以这里**不要求 206**，
 * 只要求字节数对得上 —— 200 和 206 都接受。
 */
async function fetchWholeRange(
  url: string,
  total: number,
  signal: AbortSignal | undefined
): Promise<Blob> {
  const res = await fetch(url, { signal, headers: { Range: `bytes=0-${total - 1}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
   *   · `status === 206` —— 200 说明服务器把整份塞回来了，长度对不上；
   *   · `start/end` 与请求一致 —— 防「同长度、不同起点」的错位响应被拼进去；
   *   · `total` 与探针一致 —— 防下载途中对象被换掉；
   *   · `blob.size === expected` —— 防短读。
   */
  async function fetchSpan(start: number, end: number, depth = 0): Promise<Blob[]> {
    const expected = end - start + 1;
    let failure: unknown = null;

    for (let attempt = 0; attempt <= ROM_CHUNK_RETRIES; attempt += 1) {
      if (outerSignal?.aborted) throw abortError();
      // 兄弟片已经失败了，别再白搬
      if (aborter.signal.aborted) throw failure ?? abortError();
      try {
        const res = await fetch(url, {
          signal: aborter.signal,
          headers: { Range: `bytes=${start}-${end}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const range = parseContentRange(res.headers.get('content-range'));
        const matches =
          res.status === 206 &&
          range !== null &&
          range.start === start &&
          range.end === end &&
          range.total === total &&
          blob.size === expected;
        // 逐条见函数头：少判一条就可能拼进错位或缺失的字节
        if (!matches) throw new IncompleteBodyError(expected, blob.size);
        return [blob];
      } catch (error) {
        // 只有**用户取消**才当 abort 报；兄弟片失败也会抛 AbortError，那不是取消
        if (outerSignal?.aborted) throw abortError();
        if (aborter.signal.aborted) throw error;
        failure = error;
        if (attempt < ROM_CHUNK_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
        }
      }
    }

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
