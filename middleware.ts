/*
 * 后台页面守卫。
 *
 * 只管 /admin/*：校验 Cookie 里的签名令牌（Edge runtime，用 Web Crypto），
 * 未登录就重定向到 /admin/login。登录页放行。
 *
 * 后台接口（/api/admin/*）**故意不挂在这里**：Next 会把命中 middleware 的请求体
 * 整个缓冲并默认截断到 10MB，上传大 ROM 会因此解析失败。接口鉴权改由各自的
 * route handler 调用 lib/server/admin-guard.ts 的 assertAdmin 自查。
 */

import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/server/session';

const PUBLIC_PATHS = new Set(['/admin/login', '/api/admin/login']);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/admin/login';
  loginUrl.search = '';
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin/:path*'],
};