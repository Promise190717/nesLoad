/*
 * 取数与响应体读取的两个小工具。
 *
 * 原来都写在 `ConsoleScene` 里（private），2026-10-14 加 `/play` 那页时抽出来 ——
 * 两边都要「带进度的下载」和「认不认得出这是用户自己取消的」，抄一份迟早会漂。
 */

/**
 * 流式读一个响应体，边读边报下载进度。
 *
 * 从游戏库载入时 ROM 是整包拉下来的，几 MB 的街机 romset 不给进度就像卡死了 ——
 * `res.blob()` 要等全部下完才 resolve，中途什么都看不到，所以这里手动读流。
 *
 * 拿不到 Content-Length（响应被压缩 / 分块传输）时进度一律报 null，
 * 界面据此退回一条来回滑的「不确定」进度条 —— 总比原地不动强。
 * 按 1% 节流，避免几百个 chunk 把场景重渲染几百次。
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
    // 拷一份再进 chunk 数组：读出来的 Uint8Array 底层是 ArrayBufferLike，直接塞给
    // Blob 过不了类型（BlobPart 要求 ArrayBuffer 支撑），复制一次最省事。
    chunks.push(new Uint8Array(value));
    loaded += value.byteLength;

    if (total <= 0) continue;
    const pct = Math.floor((loaded / total) * 100);
    if (pct === lastPct) continue;
    lastPct = pct;
    onProgress(Math.min(loaded / total, 1));
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
