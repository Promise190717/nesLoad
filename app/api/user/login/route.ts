/*
 * 前台用户登录 / 登出 / 当前身份。
 *
 * ⚠️ **和 /api/admin/login 是两条完全独立的链路**：这张表是 `app_users`、
 *    cookie 是 `nesload_user`、令牌里带 `scope: 'user'`。两者的令牌互相不认
 *    （见 lib/server/app-session.ts 开头那段）。
 *
 * GET 顺便当「我是谁」用：前端首屏拿它判断登没登、要不要显示用户名 ——
 * 不必单独再开一个 /api/user/me。
 *
 * POST（登录）带 Cloudflare Turnstile 人机验证（2026-10-13 加，见 lib/server/turnstile.ts）。
 * 没配 `TURNSTILE_SECRET_KEY` 时自动跳过 —— 本地开发不用管。
 * ⚠️ **只有 POST 验**：GET（我是谁）和 DELETE（登出）不验，它们不是攻击面。
 */

import { NextResponse } from 'next/server';
import { authenticateAppUser, touchLastLogin } from '@/lib/server/app-users';
import {
  USER_SESSION_COOKIE,
  USER_SESSION_TTL_MS,
  signUserSession,
  verifyUserSession,
} from '@/lib/server/app-session';
import { clientIp, verifyTurnstile } from '@/lib/server/turnstile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 当前登录状态。没登也算 200（`{ user: null }`），不用 401 —— 它不是「未授权」，是「未登录」。 */
export async function GET(request: Request) {
  // 直接读 request 的 Cookie 头，不走 next/headers：这条路不需要「设置 cookie」的能力
  const token = readCookie(request.headers.get('cookie'), USER_SESSION_COOKIE);
  const payload = await verifyUserSession(token);
  if (!payload) return NextResponse.json({ user: null });
  return NextResponse.json({ user: { id: payload.uid, username: payload.username } });
}

export async function POST(request: Request) {
  let body: { username?: unknown; password?: unknown; turnstileToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }

  /*
   * 人机验证放在**凭据校验之前** —— 挡撞库要在最前面，别让脚本先拿一轮
   * 「用户名或密码不对」的便宜响应去试口令。没配 `TURNSTILE_SECRET_KEY` 时
   * verifyTurnstile 返回 'skipped'，这里直接放行。
   */
  const captcha = await verifyTurnstile(body.turnstileToken, clientIp(request));
  if (captcha === 'missing') {
    return NextResponse.json({ error: 'captcha-required' }, { status: 400 });
  }
  if (captcha === 'failed') {
    return NextResponse.json({ error: 'captcha-failed' }, { status: 403 });
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) {
    return NextResponse.json({ error: 'missing-credentials' }, { status: 400 });
  }

  try {
    const result = await authenticateAppUser({ username, password });
    if ('error' in result) {
      // 用户名不存在 / 口令错误统一一个码（不暴露用户名存不存在）；
      // 封禁是另一回事 —— 用户得知道「不是我输错了」，所以单独回。
      const status = result.error === 'banned' ? 403 : 401;
      return NextResponse.json({ error: result.error }, { status });
    }

    // 记一次登录时间。失败不抛（见 touchLastLogin），所以这里不 await 它的错误路径
    await touchLastLogin(result.user.id);

    const token = await signUserSession({
      uid: result.user.id,
      username: result.user.username,
      exp: Date.now() + USER_SESSION_TTL_MS,
    });

    const res = NextResponse.json({
      ok: true,
      user: { id: result.user.id, username: result.user.username },
    });
    res.cookies.set(USER_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: USER_SESSION_TTL_MS / 1000,
      secure: process.env.NODE_ENV === 'production',
    });
    return res;
  } catch (error) {
    console.error('[user] 登录失败', error);
    return NextResponse.json({ error: 'login-failed' }, { status: 500 });
  }
}

/** 登出：清 cookie 即可（令牌无状态，服务端不留会话）。 */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(USER_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}

/**
 * 从 Cookie 头里抠一个键。
 *
 * 不用 `next/headers` 的 `cookies()`：那是一个 async 的请求上下文 API，
 * 而这里只是**读**一个值（GET 不需要回写 cookie）。直接解析字符串更轻，
 * 也让这个 GET 不依赖任何请求作用域。
 *
 * 取值按 `; ` 切、只认第一段等号 —— cookie 的 value 理论上不能含分号，
 * 所以 `indexOf('=')` 取第一段就够（不像 session 令牌那样需要更细的处理）。
 */
function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at <= 0) continue;
    if (part.slice(0, at).trim() !== name) continue;
    return decodeURIComponent(part.slice(at + 1).trim());
  }
  return null;
}
