/*
 * ROM 代理：按游戏 id 把 R2 里的 ROM 流式回传给浏览器。
 *
 * 为什么要代理而不是让前端直接拉公网域名：
 *   1. 绕开 R2 桶的 CORS 配置问题；
 *   2. 不让前端感知真实对象 key / 域名；
 *   3. 顺便把 rom_name 放进 Content-Disposition，前端可据此还原成带原名的 File
 *      （街机 FBNeo 依赖这个文件名）。
 */

import { getGameRow, type GameRow } from '@/lib/server/games';
import { publicUrl } from '@/lib/server/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 非 ASCII 文件名要用 RFC 5987 的 filename*，同时给一个 ASCII 回退。 */
function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  let row: GameRow | null;
  try {
    row = await getGameRow(id);
  } catch (error) {
    console.error('[games] ROM 查询失败', error);
    return new Response('lookup failed', { status: 500 });
  }
  if (!row) return new Response('not found', { status: 404 });

  let upstream: Response;
  try {
    upstream = await fetch(publicUrl(row.rom_url), { cache: 'no-store' });
  } catch (error) {
    console.error('[games] ROM 回源失败', error);
    return new Response('upstream error', { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response('upstream error', { status: 502 });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': contentDisposition(row.rom_name),
    'Cache-Control': 'public, max-age=3600',
  };
  const length = upstream.headers.get('content-length');
  if (length) headers['Content-Length'] = length;

  return new Response(upstream.body, { headers });
}