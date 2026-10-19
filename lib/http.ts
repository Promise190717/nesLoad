/*
 * 取数与响应体读取的几个小工具。
 *
 * 原来都写在 `ConsoleScene` 里（private），2026-10-14 加 `/play` 那页时抽出来 ——
 * 两边都要「带进度的下载」和「认不认得出这是用户自己取消的」，抄一份迟早会漂。
 *
 * 现在有两套下法：**整包流式**（`readBodyWithProgress`，存档这类小文件用）
 * 和**分片 Range**（`fetchRomWithProgress`，ROM 走这条，原因见它上面那段）。
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
 * 流式读一个响应体，边读边报下载进度。
 *
 * 从游戏库载入时 ROM 是整包拉下来的，几 MB 的街机 romset 不给进度就像卡死了 ——
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
 * ===== 大 ROM：分片 Range 下载 =====
 *
 * 背景（2026-10-19，线上 PS1 几乎全部打不开）：**一个请求搬不动几百 MB**。
 * `/api/games/<id>/rom` 是本站 Worker 的流式代理，而 Cloudflare 对**单次调用**有资源上限：
 * 实测同一个 383 MiB 的 `.chd`，整包 GET 反复只回 **1–3 MB** 就被截断
 * （`Transfer-Encoding: chunked`、没有 `Content-Length`，客户端看不出是截断）；
 * 请求 5 MB 那一段直接 **503 `error code: 1102`**（Worker 超限）。
 * 上游直连同一个文件是 296 MiB / 383 MiB 全量正常的（2.5–4 MB/s），
 * 所以问题不在源站、不在格式、不在核心 —— 就是「一次性搬太多」。
 *
 * 判据很干净：**同一段字节，拆成 8 MiB 一片逐片要，每片都完整；4 片并行 19 秒走完 32 MiB。**
 * 于是这里把整包 GET 换成分片 Range：
 *   · 切片小 ⇒ 每次 Worker 调用都很轻，撞不到那个上限；
 *   · 并行几路 ⇒ 吞吐补回来（单路只有 0.7–1.5 MB/s）；
 *   · 每片都核对字节数 ⇒ 短读能当场发现并重试，不再静默拿到一个截断的文件。
 *
 * ⚠️ 代价是**慢**：PS1 一张 300 MiB 的盘大约 1–3 分钟。这是兜底，不是终局 ——
 *    真正的解法是把 ROM 放到 R2、让浏览器直连（不经过 Worker 就没有这个上限）。
 *
 * ⚠️ 为什么不直接 `fetch` + `arrayBuffer` 一把梭：那是「一个请求搬整包」的另一半问题，
 *    而且会把整个文件压进 JS 堆（见 `readBodyWithProgress` 的注释）。
 */

/**
 * 一次要多大。
 *
 * ⚠️ 这个数**不是「越小越保险」**：每片都是一次完整的 Worker 调用（路由、查库、回源），
 * 片越小开销占比越高，而且线上那个上限跟「搬了多久」有关，切得太碎只是把同样的活
 * 拆成几百次。8 MiB 是实测口径下「一片正常能完整回来」的量级；真搬不动时靠下面的
 * **对半再切**兜底（见 `fetchSpan`）。
 */
const ROM_CHUNK_BYTES = 8 * 1024 * 1024;

/** 同时几路。4 路实测比单路快 2 倍左右，再多对上游不礼貌。 */
const ROM_CHUNK_CONCURRENCY = 3;

/**
 * 一段最多试几次（不含第一次）。
 *
 * ⚠️ 这个数**不是按「偶发一次」拍的**：线上实测同一条 8 MiB 的 Range 连打 15 次，
 * 6 次是坏的（`503 error code: 1102` 只回 17 字节，或者 206 却只给 100 KB / 7 KB）。
 * 也就是说失败率四成上下，靠「试一次」撑不住。
 */
const ROM_SPAN_RETRIES = 3;

/**
 * 对半切的**下限**。
 *
 * 反复失败时不是继续硬试同一段，而是把它切成两半分别要 —— 截断的本质是「搬到一半就断」，
 * 段短了就过得去。切到 512 KiB 还不行就是真不行了（再碎下去只有请求开销，没有收益）。
 */
const ROM_SPLIT_MIN_BYTES = 512 * 1024;

/** 最多切几层：8 MiB → 4 → 2 → 1 → 512 KiB。 */
const ROM_SPLIT_DEPTH = 4;

/** `bytes 0-1048575/94371840` → `{ start, end, total }`。 */
function parseContentRange(value: string | null): { start: number; end: number; total: number } | null {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value ?? '');
  if (!match) return null;
  const [start, end, total] = match.slice(1).map(Number);
  if (![start, end, total].every(Number.isSafeInteger)) return null;
  return { start, end, total };
}

/** 重试前歇多久。指数退避，封顶 2 秒 —— 撞限流时连着打只会更糟。 */
function spanBackoffMs(attempt: number): number {
  return Math.min(250 * 2 ** attempt, 2000);
}

/** 用户取消要立刻停：抛一个和浏览器一致的 AbortError，调用方按 `isAbortError` 认。 */
function abortError(): Error {
  return new DOMException('aborted', 'AbortError');
}

/**
 * 分片下完一个 ROM，返回**拼好的 Blob**。
 *
 * 和 `readBodyWithProgress` 的接口长得一样（给进度、认 abort、短读抛错），
 * 调用方换个函数名就行。
 *
 * 服务器不认 `Range`（回 200 或者没有 `Content-Range`）时**原样退回**整包流式读法
 * —— 那条路对小文件本来是好的，别为了大文件把正常路径也改坏。
 */
export async function fetchRomWithProgress(
  url: string,
  options: { signal?: AbortSignal; onProgress: (ratio: number | null) => void }
): Promise<Blob> {
  const { signal, onProgress } = options;

  // 第一片兼当探针：既拿到了开头 8 MiB，也问出了总长度
  const first = await fetch(url, {
    signal,
    headers: { Range: `bytes=0-${ROM_CHUNK_BYTES - 1}` },
  });
  if (!first.ok) throw new Error(`HTTP ${first.status}`);

  const probe = parseContentRange(first.headers.get('content-range'));
  if (first.status !== 206 || !probe) {
    return readBodyWithProgress(first, onProgress);
  }

  const { total } = probe;
  onProgress(0);

  // 一片就装下了（小 ROM 的常态）：不用再发第二次请求
  const firstBlob = await first.blob();
  if (firstBlob.size >= total) {
    onProgress(1);
    return firstBlob;
  }

  const chunkCount = Math.ceil(total / ROM_CHUNK_BYTES);
  const parts: Blob[][] = new Array(chunkCount);
  let loaded = 0;
  let lastPct = 0;

  /** 读完一段就报一次进度，按 1% 节流（和 `readBodyWithProgress` 同一套口径）。 */
  const report = (size: number) => {
    loaded += size;
    const pct = Math.floor((loaded / total) * 100);
    if (pct === lastPct) return;
    lastPct = pct;
    onProgress(Math.min(loaded / total, 1));
  };

  /**
   * 要 `[start, end]` 这段，返回按顺序排好的若干 Blob。
   *
   * 先带重试地整段要；**整段反复失败就一刀切两半**分别要（见 `ROM_SPLIT_MIN_BYTES`），
   * 递归到下限为止 —— 截断是「搬到一半就断」，段越短越容易过。
   * 返回数组而不是单个 Blob：切过的段会变回好几块，拼装时下标仍然只有一个。
   */
  async function fetchSpan(start: number, end: number, depth = 0): Promise<Blob[]> {
    const expected = end - start + 1;
    let failure: unknown = null;

    for (let attempt = 0; attempt <= ROM_SPAN_RETRIES; attempt += 1) {
      if (signal?.aborted) throw abortError();
      try {
        const res = await fetch(url, { signal, headers: { Range: `bytes=${start}-${end}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        // 短读在这里就掐掉：绝不能把缺角的字节拼进 ROM（核心侧只会静默退回主菜单）
        if (blob.size !== expected) throw new IncompleteBodyError(expected, blob.size);
        return [blob];
      } catch (error) {
        // 用户取消要立刻停，重试没意义
        if (signal?.aborted || isAbortError(error)) throw error;
        failure = error;
        // 最后一次失败就别再等了，直接走「对半切」
        if (attempt < ROM_SPAN_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, spanBackoffMs(attempt)));
        }
      }
    }

    if (expected > ROM_SPLIT_MIN_BYTES && depth < ROM_SPLIT_DEPTH) {
      const mid = start + Math.floor(expected / 2);
      const left = await fetchSpan(start, mid - 1, depth + 1);
      const right = await fetchSpan(mid, end, depth + 1);
      return [...left, ...right];
    }
    throw failure ?? new Error(`span ${start}-${end} failed`);
  }

  /** 取第 `index` 片（整片装不下时会自动再切）。 */
  async function fetchChunk(index: number): Promise<Blob[]> {
    const start = index * ROM_CHUNK_BYTES;
    const end = Math.min(start + ROM_CHUNK_BYTES, total) - 1;
    return fetchSpan(start, end);
  }

  // 第一片的字节已经在手上了（探针那条），完整就直接用，别白下一次
  if (firstBlob.size === probe.end + 1) {
    parts[0] = [firstBlob];
    loaded += firstBlob.size;
  }

  // 固定几个「工人」从同一个游标取下一片 —— 比「按 index 取模预先分组」更均匀
  // （每一片的耗时本来就不一样，谁先空出来谁接着拿）。
  let cursor = parts[0] ? 1 : 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= chunkCount) return;
      const blobs = await fetchChunk(index);
      parts[index] = blobs;
      report(blobs.reduce((sum, blob) => sum + blob.size, 0));
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(ROM_CHUNK_CONCURRENCY, chunkCount) }, () => worker())
    );
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw error;
    // 有片彻底失败了：报「下载不完整」而不是一句笼统的网络错误 —— 前者能让人重试
    throw new IncompleteBodyError(total, loaded);
  }

  /*
   * 按分片顺序摊平再拼。`new Blob([...])` 只**串引用**，不复制字节 —— 所以这一步
   * 不会把几百 MB 再拷一遍（和 `readBodyWithProgress` 末尾那句同一个道理）。
   */
  onProgress(1);
  return new Blob(parts.flat(), { type: 'application/octet-stream' });
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
