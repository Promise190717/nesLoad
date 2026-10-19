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
 * 网格粒度：**所有分片都对齐到它**，档位只能按「格数」升降。
 *
 * 2026-10-19 从「固定 8 MiB 片 + 失败就对半切」改成这一套。原因在浏览器 Network 面板里
 * 看得最清楚：线上实测**一半的 8 MiB 都在断**（`206` 却只回 169 KB / 283 KB），
 * 而每一片都要先失败 4 次（1 次 + 3 次重试 + 退避）才肯切半 —— 一张 300 MiB 的盘
 * 能发出 128 个请求，总量却只够 40 片，白付了一倍的时间和带宽。
 *
 * 所以片大小改成**自适应**：某一段切过，接下来就从 4 MiB 起要；再切就 2 MiB。
 * 干净六次再升回去。2 MiB 是格子，也是最小档 —— 再往下只增加请求数，没有收益。
 */
const ROM_GRID_BYTES = 2 * 1024 * 1024;

/** 一次最多要几格（4 格 = 8 MiB）。健康时就用它，吞吐最好。 */
const ROM_MAX_RUN = 4;

/** 同时在飞几批。3 路实测比单路快 2 倍左右，再多对上游不礼貌。 */
const ROM_CHUNK_CONCURRENCY = 3;

/**
 * 一段最多试几次（不含第一次）。
 *
 * ⚠️ 这个数**不是按「偶发一次」拍的**：线上实测同一条 8 MiB 的 Range 连打 15 次，
 * 6 次是坏的（`503 error code: 1102` 只回 17 字节，或者 206 却只给 100 KB / 7 KB）。
 * 也就是说失败率四成上下，靠「试一次」撑不住。
 *
 * ⚠️ 但**只给小块用满**：段越大越容易在搬到一半时断，这时候再试一次不如直接切半
 *    （切半的成功率提升是立竿见影的）。所以 4 MiB 以上的段只试一次，见 `retriesFor`。
 */
const ROM_SPAN_RETRIES = 3;

/** 超过这个大小的段不恋战：失败一次就切半，别把 3 次退避都耗在「注定要切」的段上。 */
const ROM_RETRY_FULL_BELOW = 4 * 1024 * 1024;

/**
 * 对半切的**下限**。
 *
 * 降档解决的是「这一批整体搬不动」，但单格（2 MiB）偶尔还是会断 —— 那时继续硬试
 * 同一段没用，切成两半分别要才过得去（截断的本质是「搬到一半就断」）。
 * 512 KiB 是底线：再碎下去只有请求开销，没有收益。
 */
const ROM_SPLIT_MIN_BYTES = 512 * 1024;

/** 最多切几层：8 MiB → 4 → 2 → 1 → 512 KiB。**档位降到 2 MiB 时也留够余量**。 */
const ROM_SPLIT_DEPTH = 4;

/** 连续几次「切过」就把档位降一档。**一次就降**：每多等一轮，就多付一整段的重试。 */
const ROM_DOWNGRADE_AFTER = 1;

/** 连续几次「一次拿到」才升回一档。比降档保守得多：来回抖比一直用小块更糟。 */
const ROM_UPGRADE_AFTER = 8;

/** `bytes 0-1048575/94371840` → `{ start, end, total }`。 */
function parseContentRange(value: string | null): { start: number; end: number; total: number } | null {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value ?? '');
  if (!match) return null;
  const [start, end, total] = match.slice(1).map(Number);
  if (![start, end, total].every(Number.isSafeInteger)) return null;
  return { start, end, total };
}

/**
 * 重试前歇多久。指数退避，封顶 5 秒。
 *
 * ⚠️ 封顶从 2 秒提到 5 秒（2026-10-19 实测）：线上的 503 是**成片**来的 ——
 * 一张 300 MiB 的盘能连续好几段一起挂（`41943040-50331647` 和 `50331648-58720255`
 * 这种相邻段一起 503），说明是 Worker 被限流一段时间，不是单个段有问题。
 * 歇 300ms 就又撞进窗口里，只会把失败率抬高。
 */
function spanBackoffMs(attempt: number): number {
  return Math.min(750 * 2 ** attempt, 5000);
}

/** 用户取消要立刻停：抛一个和浏览器一致的 AbortError，调用方按 `isAbortError` 认。 */
function abortError(): Error {
  return new DOMException('aborted', 'AbortError');
}

/** `fetchSpan` 的结果。`split` 说明这一段没能一次拿到，是切过之后拼起来的。 */
interface SpanResult {
  blobs: Blob[];
  split: boolean;
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
    headers: { Range: `bytes=0-${ROM_MAX_RUN * ROM_GRID_BYTES - 1}` },
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

  /** 第 `g` 格的起始字节。 */
  const gridStart = (g: number) => g * ROM_GRID_BYTES;
  /** 第 `g` 格的结束字节（含）；最后一格可能不满。 */
  const gridEnd = (g: number) => Math.min((g + 1) * ROM_GRID_BYTES, total) - 1;

  const gridCount = Math.ceil(total / ROM_GRID_BYTES);
  /** 每格一个 Blob。切片的合并在最后那次 `new Blob(parts)` 里一次做完。 */
  const parts: Blob[] = new Array(gridCount);
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
   *
   * `split` 是给外面调档位用的信号：这一段要是切过，说明当前档位在这一带不健康。
   */
  async function fetchSpan(start: number, end: number, depth = 0): Promise<SpanResult> {
    const expected = end - start + 1;
    // 大段失败一次就切（见 `ROM_RETRY_FULL_BELOW`），小块才值得多试几次
    const retries = expected > ROM_RETRY_FULL_BELOW ? 1 : ROM_SPAN_RETRIES;
    let failure: unknown = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (signal?.aborted) throw abortError();
      try {
        const res = await fetch(url, { signal, headers: { Range: `bytes=${start}-${end}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        // 短读在这里就掐掉：绝不能把缺角的字节拼进 ROM（核心侧只会静默退回主菜单）
        if (blob.size !== expected) throw new IncompleteBodyError(expected, blob.size);
        return { blobs: [blob], split: false };
      } catch (error) {
        // 用户取消要立刻停，重试没意义
        if (signal?.aborted || isAbortError(error)) throw error;
        failure = error;
        // 最后一次失败就别再等了，直接走「对半切」
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, spanBackoffMs(attempt)));
        }
      }
    }

    if (expected > ROM_SPLIT_MIN_BYTES && depth < ROM_SPLIT_DEPTH) {
      const mid = start + Math.floor(expected / 2);
      const left = await fetchSpan(start, mid - 1, depth + 1);
      const right = await fetchSpan(mid, end, depth + 1);
      return { blobs: [...left.blobs, ...right.blobs], split: true };
    }
    throw failure ?? new Error(`span ${start}-${end} failed`);
  }

  /**
   * 当前档位：一次要几格。
   *
   * 起始 4 格（8 MiB）。一批切过就降一档（`ROM_DOWNGRADE_AFTER = 1`），
   * 干净 8 批再升回去 —— 详见 `ROM_GRID_BYTES` 的注释
   * （线上失败率一半，每片都从 8 MiB 重试纯属白付）。
   *
   * ⚠️ 不要改成「每次失败就地降档并重试」：`fetchSpan` 内部已经保证最后能拼出整段
   *    （重试 + 对半切），这里只负责**下一批**从哪一档起手，改得越多越容易让游标乱掉。
   */
  let run = ROM_MAX_RUN;
  let splitStreak = 0;
  let cleanStreak = 0;

  function adapt(split: boolean) {
    if (split) {
      cleanStreak = 0;
      splitStreak += 1;
      if (splitStreak >= ROM_DOWNGRADE_AFTER && run > 1) {
        run = Math.max(1, run >> 1);
        splitStreak = 0;
      }
      return;
    }
    splitStreak = 0;
    cleanStreak += 1;
    if (cleanStreak >= ROM_UPGRADE_AFTER && run < ROM_MAX_RUN) {
      run = Math.min(ROM_MAX_RUN, run * 2);
      cleanStreak = 0;
    }
  }

  /** 把一段连续字节按格填进 `parts`。`gridEnd` 保证最后一格不会越界。 */
  function fill(blob: Blob, startGrid: number, count: number) {
    let offset = 0;
    for (let k = 0; k < count; k += 1) {
      const g = startGrid + k;
      const size = gridEnd(g) - gridStart(g) + 1;
      // `Blob.slice` 只建视图不复制字节，所以这里切开是零成本的
      parts[g] = blob.slice(offset, offset + size);
      offset += size;
    }
  }

  /** 要 `[startGrid, startGrid + count)` 这几格，填进 `parts`。 */
  async function takeRun(startGrid: number, count: number): Promise<void> {
    const start = gridStart(startGrid);
    const end = gridEnd(startGrid + count - 1);
    const result = await fetchSpan(start, end);
    const merged = result.blobs.length === 1 ? result.blobs[0] : new Blob(result.blobs);
    if (merged.size !== end - start + 1) {
      throw new IncompleteBodyError(end - start + 1, merged.size);
    }
    fill(merged, startGrid, count);
    report(merged.size);
    adapt(result.split);
  }

  /*
   * 探针那 8 MiB 已经到手：只要字节齐、且它确实覆盖满 4 格，就按格切开直接用。
   *
   * ⚠️ 两个条件缺一不可：
   *   · `firstBlob.size === probeBytes` —— 没短读，字节是完整的；
   *   · `probeBytes >= 4 格` —— 服务器真按我们要的 8 MiB 回了（万一它只回了 3 MiB，
   *     直接 `fill(..., 4)` 会切出空的 Blob，还会把 3–4 MiB 那一段跳过）。
   * 不满足就退回 `nextGrid = 0`，让 worker 重新要 —— 多一次请求，但不会错位。
   */
  const probeBytes = probe.end + 1;
  let nextGrid = 0;
  if (firstBlob.size === probeBytes && probeBytes >= ROM_MAX_RUN * ROM_GRID_BYTES) {
    nextGrid = Math.min(ROM_MAX_RUN, gridCount);
    fill(firstBlob, 0, nextGrid);
    loaded += firstBlob.size;
  }

  // 固定几个「工人」从同一个游标取下一批 —— 比「按 index 取模预先分组」更均匀
  // （每一批的耗时本来就不一样，谁先空出来谁接着拿）。
  let cursor = nextGrid;
  async function worker(): Promise<void> {
    for (;;) {
      const startGrid = cursor;
      if (startGrid >= gridCount) return;
      const count = Math.min(run, gridCount - startGrid);
      // 先占位再要：`run` 随时可能被别的 worker 改小，占位保证没人抢同一段
      cursor = startGrid + count;
      try {
        await takeRun(startGrid, count);
      } catch (error) {
        if (signal?.aborted || isAbortError(error)) throw error;
        /*
         * 一段彻底失败**不立刻判死**：先歇三秒，再把这一段原样走一遍。
         * 线上代理的 503 有一半是瞬时的（同一段隔几秒再要往往就过），而一次
         * 失败就丢掉整张 300 MiB 的盘，代价太大 —— 用户得从零重下。
         * 第二遍内部照样会重试、降档、切半，所以这里只加一次，不无限循环。
         */
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (signal?.aborted) throw abortError();
        await takeRun(startGrid, count);
      }
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(ROM_CHUNK_CONCURRENCY, gridCount) }, () => worker())
    );
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw error;
    // 有片彻底失败了：报「下载不完整」而不是一句笼统的网络错误 —— 前者能让人重试
    throw new IncompleteBodyError(total, loaded);
  }

  /*
   * 按格顺序拼。`new Blob([...])` 只**串引用**，不复制字节 —— 所以这一步
   * 不会把几百 MB 再拷一遍（和 `readBodyWithProgress` 末尾那句同一个道理）。
   */
  onProgress(1);
  return new Blob(parts, { type: 'application/octet-stream' });
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
