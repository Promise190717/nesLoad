/*
 * 前台用户注册。
 *
 * 和后台登录那套完全独立：写的是 `app_users` 表、下发的是 `nesload_user` cookie
 * （见 lib/server/app-session.ts）。**注册成功即登录** —— 让用户注册完再登一次是纯多余的一步。
 *
 * 带 Cloudflare Turnstile 人机验证（2026-10-13 加，见 lib/server/turnstile.ts）。
 * 没配 `TURNSTILE_SECRET_KEY` 时自动跳过 —— 本地开发不用管。
 *
 * 跑 Node runtime：口令哈希要用 node:crypto 的 scrypt。
 */

import { NextResponse } from 'next/server';
import {
  registerAppUser,
  validatePassword,
  validateUsername,
} from '@/lib/server/app-users';
import { USER_SESSION_COOKIE, USER_SESSION_TTL_MS, signUserSession } from '@/lib/server/app-session';
import { clientIp, verifyTurnstile } from '@/lib/server/turnstile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: { username?: unknown; password?: unknown; turnstileToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }

  /*
   * 人机验证放在**字段校验之前** —— 注册是被脚本盯得最紧的一条（批量建号），
   * 别让它们先拿一轮「用户名太短」的便宜响应去试探规则。
   * 没配 `TURNSTILE_SECRET_KEY` 时 verifyTurnstile 返回 'skipped'，这里直接放行。
   */
  const captcha = await verifyTurnstile(body.turnstileToken, clientIp(request));
  if (captcha === 'missing') {
    return NextResponse.json({ error: 'captcha-required' }, { status: 400 });
  }
  if (captcha === 'failed') {
    return NextResponse.json({ error: 'captcha-failed' }, { status: 403 });
  }

  const usernameError = validateUsername(body.username);
  if (usernameError) {
    // 校验错误码原样给前端，由它查 i18n（`user.error.username-<code>`）
    return NextResponse.json({ error: `username-${usernameError}` }, { status: 400 });
  }
  const passwordError = validatePassword(body.password);
  if (passwordError) {
    return NextResponse.json({ error: `password-${passwordError}` }, { status: 400 });
  }

  const username = (body.username as string).trim();
  const password = body.password as string;

  try {
    const user = await registerAppUser({ username, password });
    // null = 用户名撞了（UNIQUE 约束，见 registerAppUser 的注释）
    if (!user) {
      return NextResponse.json({ error: 'username-taken' }, { status: 409 });
    }

    /*
     * 注册完直接签发会话。这里**不走 authenticateAppUser**（那会多做一次
     * scrypt 校验）—— 我们刚刚亲手写下这个口令，它当然是对的。
     */
    const token = await signUserSession({
      uid: user.id,
      username: user.username,
      exp: Date.now() + USER_SESSION_TTL_MS,
    });

    const res = NextResponse.json({ ok: true, user: { id: user.id, username: user.username } });
    res.cookies.set(USER_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: USER_SESSION_TTL_MS / 1000,
      secure: process.env.NODE_ENV === 'production',
    });
    return res;
  } catch (error) {
    console.error('[user] 注册失败', error);
    return NextResponse.json({ error: 'register-failed' }, { status: 500 });
  }
}
