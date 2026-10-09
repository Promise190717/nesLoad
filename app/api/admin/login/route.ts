/*
 * 后台登录 / 登出。
 *
 * 登录成功后在 HttpOnly Cookie 里下发一个签名令牌（见 lib/server/session.ts）。
 * 这里跑 Node runtime：口令校验要用 node:crypto 的 scrypt。
 */

import { NextResponse } from 'next/server';
import { findUser, verifyPassword } from '@/lib/server/users';
import { SESSION_COOKIE, SESSION_TTL_MS, signSession } from '@/lib/server/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) {
    return NextResponse.json({ error: 'missing-credentials' }, { status: 400 });
  }

  try {
    const user = await findUser(username);
    // 用户不存在与口令错误返回同一个结果，避免暴露用户名是否存在
    if (!user || !verifyPassword(user.password_hash, password)) {
      return NextResponse.json({ error: 'invalid-credentials' }, { status: 401 });
    }

    const token = await signSession({
      uid: user.id,
      username: user.username,
      exp: Date.now() + SESSION_TTL_MS,
    });

    const res = NextResponse.json({ ok: true, username: user.username });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_MS / 1000,
      secure: process.env.NODE_ENV === 'production',
    });
    return res;
  } catch (error) {
    console.error('[admin] 登录失败', error);
    return NextResponse.json({ error: 'login-failed' }, { status: 500 });
  }
}

/** 登出：把 Cookie 清掉即可（签名令牌无状态，服务端不留会话）。 */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}