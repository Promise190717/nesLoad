/*
 * 改密码（`/api/user/password`）。
 *
 *   POST  PATCH 都收（body: `{ oldPassword, newPassword }`）
 *
 * **必须验旧密码** —— 这是这条路由存在的唯一理由。会话令牌只有 7 天有效期，
 * 但在这 7 天里任何拿到 cookie 的人（共用电脑、被偷的笔记本）都能改密码、
 * 把真正的号主锁在外面。验一次旧口令把这个窗口堵上。
 *
 * 为什么不并进 `/api/user/profile`：那条只改性别（一个字段、无需凭据），
 * 这条要验旧口令 + 走 scrypt 哈希，是一套独立的校验与错误码。一条 route 只干一件事。
 *
 * ⚠️ 前端那一侧对应的是个人中心（`/account`）的**「密码」tab** —— 2026-10-13 从「资料」
 *    tab 里拆出来的独立一页（三个输入框的表单比头像和性别加起来还长）。
 *
 * ⚠️ 改密码**不吊销当前会话**（令牌是无状态的，改不了里面的东西）——
 *    不主动登出是**有意**的：用户刚证明了自己知道旧口令，把他踢出去只是添麻烦。
 *    真要踢，得引入会话版本号那一套（表里加一列、每次验令牌查一次），
 *    代价和收益不成比例，当前不做。
 *
 * 鉴权用 `assertUser`（**写接口，必须查库复核封禁**）。
 */

import { NextResponse } from 'next/server';
import { assertUser } from '@/lib/server/app-guard';
import { changeAppUserPassword, validatePassword } from '@/lib/server/app-users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request) {
  const guard = await assertUser();
  if (!guard.ok) return guard.response;

  let body: { oldPassword?: unknown; newPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }

  const oldPassword = typeof body.oldPassword === 'string' ? body.oldPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (!oldPassword) {
    return NextResponse.json({ error: 'missing-old-password' }, { status: 400 });
  }

  /*
   * 新口令的规则和注册**共用同一个函数**（`validatePassword`）：长度 6–72，且不许有空白字符。
   * 校验错误码原样给前端（`password-too-short` / `password-too-long` / `password-has-space`），
   * 前端那份 keys 表认得出 —— 和注册页同一批码，不新造。
   *
   * ⚠️ **旧口令不校验** —— 老账号里可能存着带空格的口令（禁空格之前建的号），
   *    拦掉就等于号主自己都改不了密码。详见 lib/server/app-users.ts 里 validatePassword 的说明。
   */
  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    return NextResponse.json({ error: `password-${passwordError}` }, { status: 400 });
  }

  /*
   * ⚠️ **新旧口令相同也放行**（不特意拦）。
   *    拦它得先比一次明文 —— 而用户完全可能就是想「把密码改成和原来一样的」，
   *    这没有危害。多一条规则只多一处要维护、要翻译的错误码。
   */

  try {
    const result = await changeAppUserPassword(guard.user.uid, oldPassword, newPassword);
    if (result === 'not-found') {
      // 令牌没过期但号被删了。守卫刚查过库，走到这儿基本不可能 —— 兜个底
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (result === 'wrong-password') {
      return NextResponse.json({ error: 'wrong-password' }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[user] 改密码失败', error);
    return NextResponse.json({ error: 'password-failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function PATCH(request: Request) {
  return handle(request);
}
