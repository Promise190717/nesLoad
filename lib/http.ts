/*
 * 取数与响应体读取的两个小工具。
 *
 * 原来都写在 `ConsoleScene` 里（private），2026-10-14 加 `/play` 那页时抽出来 ——
 * 两边都要「带进度的下载」和「认不认得出这是用户自己取消的」，抄一份迟早会漂。
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
