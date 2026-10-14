/*
 * 后台「从链接取 ROM」—— 自动填充时把上游给的游戏文件字节取回来。
 *
 * 为什么要有它：ROM 挂在**另一个域名**（如 files.retrogamesnexus.com），
 * 浏览器直接 fetch 会被 CORS 挡下；上游还可能先给一次跳转。走服务端取就没这两个问题。
 *
 * ⚠️ 和 fetch-image 是**同一套 SSRF 防线**（见 lib/server/url-guard.ts），
 *    区别只在接受的内容类型与体积上限：ROM 是 zip / 裸二进制，比封面大得多。
 *
 * ⚠️ 文件名从地址尾部取，回在响应头 `x-file-name` 里（URL 编码过）。
 *    **必须保留原始文件名** —— FBNeo 是拿 zip 文件名认驱动的，改名会让街机静默起不来
 *    （见 app/api/admin/games/route.ts 的 romName）。
 *
 * 响应体就是文件原始字节，`content-type` 沿用上游的 —— 前端拿到后 `res.blob()`
 * 再 `new File([blob], name, { type })` 塞进「游戏文件」那一栏即可。
 */

import { NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/server/admin-guard';
import { failJson, parsePublicHttpUrl } from '@/lib/server/url-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 单个 ROM 上限 64MB。
 *
 * 给得比封面（8MB）宽得多：SFC / GBA 卡带常见几 MB 到十几 MB，街机 romset 更大。
 * 再往上（比如 CD 镜像）就该手动传了 —— 代理下载既占服务端内存也占出口带宽。
 */
const MAX_BYTES = 64 * 1024 * 1024;

/**
 * 明显是网页 / 报错的 content-type，一律当成「没拿到文件」。
 *
 * 上游前置了 Cloudflare：地址失效或触发风控时，回的是一张 **HTML 挑战页**（HTTP 200）。
 * 不挡的话，前端会把这张网页当成 ROM 存下来 —— 体积不大、也不报错，
 * 一直到插卡带跑不起来才发现，那时候已经查不出是哪一步坏的。
 * 反过来不写白名单（只认 zip / octet-stream）是因为 ROM 的裸扩展名五花八门
 * （.nes / .smc / .gba / .fds…），上游给的 type 也不统一，挡太死会误伤。
 */
const HTML_LIKE = /^text\/|application\/xhtml|application\/json/i;

/** 从地址尾部取文件名（解码后）。取不到返回空串。 */
function fileNameFromUrl(url: string): string {
  try {
    const tail = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    return decodeURIComponent(tail);
  } catch {
    return '';
  }
}

export async function POST(request: Request) {
  const denied = await assertAdmin();
  if (denied) return denied;

  let body: { url?: unknown };
  try {
    body = (await request.json()) as { url?: unknown };
  } catch {
    return failJson('bad-request', '请求体不是合法 JSON');
  }

  const url = parsePublicHttpUrl(body.url);
  if (!url) return failJson('bad-url', '不是合法的文件地址（只支持公网 http / https）');

  try {
    const upstream = await fetch(url, {
      headers: { accept: '*/*', 'user-agent': 'nesLoad-admin/1.0' },
      cache: 'no-store',
    });
    if (!upstream.ok) return failJson('fetch-failed', `上游返回 HTTP ${upstream.status}`, 502);

    // 跟着跳转走完后再核一次最终地址，别让一次 302 绕开上面那道内网检查
    const finalUrl = parsePublicHttpUrl(upstream.url);
    if (!finalUrl) return failJson('bad-url', '跳转后的地址不被接受');

    const contentType = (upstream.headers.get('content-type') ?? '').split(';')[0].trim();
    if (HTML_LIKE.test(contentType)) {
      return failJson('not-file', `那个地址回的不是文件（content-type: ${contentType}）`);
    }

    const declared = Number(upstream.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) return failJson('too-large', '文件太大了（上限 64MB）', 413);

    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) return failJson('too-large', '文件太大了（上限 64MB）', 413);

    return new NextResponse(buffer, {
      headers: {
        'content-type': contentType || 'application/octet-stream',
        'cache-control': 'no-store',
        // 文件名回给前端（URL 编码，避免非 ASCII 头值被拒）—— FBNeo 认它当驱动名
        'x-file-name': encodeURIComponent(fileNameFromUrl(finalUrl.href)),
      },
    });
  } catch (error) {
    console.error('[admin] 取 ROM 失败', error);
    return failJson('fetch-failed', (error as Error).message, 502);
  }
}
