/*
 * 后台接口的鉴权守卫。
 *
 * 为什么不在 middleware 里统一把关：Next 会把命中 middleware 的请求体整个缓冲，
 * 并默认截断到 10MB（middlewareClientMaxBodySize）。被截断的 multipart 已经不是
 * 合法的表单，解析必然失败 —— 这就是「上传稍大的 ROM 就报『无法解析上传的表单
 * 数据』」的原因。所以 /api/admin/* 不挂 middleware（见 middleware.ts 的 matcher），
 * 由各 route handler 调这里的 assertAdmin 自己把关。
 *
 * 注意：本文件用到 next/headers，只能在 Node runtime 的 route handler 里 import；
 * middleware 跑在 Edge runtime，不能引用它。
 */

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from './session';

/** 已登录返回 null；未登录返回一个可直接 return 的 401 响应。 */
export async function assertAdmin(): Promise<NextResponse | null> {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (session) return null;
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}