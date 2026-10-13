/*
 * 后台「从链接取图」—— 把外链图片的字节取回来，交给前端拼成 File 塞进封面那一栏。
 *
 * 为什么要有它：从**浏览器里**拖一张图片过来时，`DataTransfer` 里只有 URL、没有文件，
 * 而浏览器直接 fetch 那个跨域地址会被 CORS 挡下。走服务端取就没有这个问题。
 * （从资源管理器拖文件过来是有 File 的，那条路不经过这里。）
 *
 * ⚠️ 这是个**服务端代理**，必须自己挡 SSRF：只放行 http / https、挡掉内网与环回主机、
 *    限制响应体大小、只接受 `image/*`。鉴权照旧（assertAdmin）。
 *
 * 响应体就是图片原始字节，`content-type` 沿用上游的 —— 前端拿到后 `res.blob()`
 * 再 `new File([blob], name, { type: blob.type })` 即可。
 */

import { NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/server/admin-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 单张图上限 8MB —— 和后台上传封面能接受的大小对齐。 */
const MAX_BYTES = 8 * 1024 * 1024;

/** 明显指向本机 / 内网的名字，一律不放行。 */
const BLOCKED_HOST = /^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i;

function fail(error: string, detail: string, status = 400) {
  return NextResponse.json({ error, detail }, { status });
}

/** 主机名是不是内网 / 环回地址（挡最朴素的那类 SSRF）。 */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, ''); // 去掉 IPv6 字面量的方括号
  if (BLOCKED_HOST.test(host)) return true;
  if (host === '::1' || host === '0.0.0.0') return true;

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 10 || a === 127) return true; // 10/8、127/8
  if (a === 169 && b === 254) return true; // 链路本地
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16-31/12
  return false;
}

/** 解析并校验一个 http(s) 地址；不合法返回 null。 */
function parseHttpUrl(value: unknown): URL | null {
  let url: URL;
  try {
    url = new URL(String(value ?? ''));
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (isPrivateHost(url.hostname)) return null;
  return url;
}

export async function POST(request: Request) {
  const denied = await assertAdmin();
  if (denied) return denied;

  let body: { url?: unknown };
  try {
    body = (await request.json()) as { url?: unknown };
  } catch {
    return fail('bad-request', '请求体不是合法 JSON');
  }

  const url = parseHttpUrl(body.url);
  if (!url) return fail('bad-url', '不是合法的图片地址（只支持公网 http / https）');

  try {
    const upstream = await fetch(url, {
      headers: { accept: 'image/*', 'user-agent': 'nesLoad-admin/1.0' },
      cache: 'no-store',
    });
    if (!upstream.ok) return fail('fetch-failed', `上游返回 HTTP ${upstream.status}`, 502);

    // 跟着跳转走完后再核一次最终地址，别让一次 302 绕开上面那道内网检查
    const finalUrl = parseHttpUrl(upstream.url);
    if (!finalUrl) return fail('bad-url', '跳转后的地址不被接受');

    const contentType = (upstream.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!contentType.startsWith('image/')) {
      return fail('not-image', `那个地址不是图片（content-type: ${contentType || '未知'}）`);
    }

    const declared = Number(upstream.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) return fail('too-large', '图片太大了（上限 8MB）', 413);

    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) return fail('too-large', '图片太大了（上限 8MB）', 413);

    return new NextResponse(buffer, {
      headers: { 'content-type': contentType, 'cache-control': 'no-store' },
    });
  } catch (error) {
    console.error('[admin] 取图失败', error);
    return fail('fetch-failed', (error as Error).message, 502);
  }
}
