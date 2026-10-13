/*
 * 前台接口的鉴权守卫。
 *
 * 和后台那份（admin-guard.ts）同一套路：不在 middleware 里统一把关，由各 route handler
 * 自己调这里的 `assertUser`。理由也一样 —— middleware 会把请求体截断到 10MB，
 * 而前台的存档上传（`POST /api/user/saves`，一块 save state 几 MB）正好在那个尺码上。
 *
 * 本文件用到 next/headers，只能在 Node runtime 的 route handler 里 import。
 */

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { USER_SESSION_COOKIE, verifyUserSession, type UserSessionPayload } from './app-session';
import { getAppUser } from './app-users';

/** 已登录且状态正常的用户。 */
export interface AuthedUser {
  uid: string;
  username: string;
  createdAt: number;
}

export type GuardResult =
  | { ok: true; user: AuthedUser }
  | { ok: false; response: NextResponse };

/**
 * 守卫：验签名 → **再查一次库复核账号**。
 *
 * 为什么要多这一次查询（而不是只信令牌里的字段）：
 *   ① **封禁要立刻生效** —— 令牌是自签的，签发之后改不了内容，不查库的话被封的人
 *      还能拿着旧 cookie 一直玩到 7 天后过期。
 *   ② **删号也一样** —— 号没了令牌还在，查库才知道。
 * 代价是每个前台请求多一次 D1 查询。可以接受：前台接口本来就是低频的
 * （登一次、存一次档、收一次藏），不像游戏列表那样被人反复拉。
 *
 * 查不到 / 已封禁 → 401 并**顺手把 cookie 清掉**：留着它前端会以为「还登着」，
 * 每次进页面都白打一轮请求才发现要重新登录。
 *
 * 返回值刻意用「判别联合」而不是 `NextResponse | null`：调用方拿到 ok 分支时
 * `user` 是非空的，不需要再断言一次。
 */
export async function assertUser(): Promise<GuardResult> {
  const response = (error: string, status: number) => {
    const res = NextResponse.json({ error }, { status });
    // 令牌无效就把 cookie 抹掉（清 key 用空值 + maxAge 0）
    if (status === 401) res.cookies.set(USER_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  };

  const store = await cookies();
  const payload = await verifyUserSession(store.get(USER_SESSION_COOKIE)?.value);
  if (!payload) return { ok: false, response: response('unauthorized', 401) };

  const account = await getAppUser(payload.uid);
  // 账号没了 / 被封了：令牌作废
  if (!account) return { ok: false, response: response('unauthorized', 401) };
  if (account.banned) return { ok: false, response: response('banned', 403) };

  return {
    ok: true,
    user: { uid: account.id, username: account.username, createdAt: account.createdAt },
  };
}

/**
 * 只要「已登录」的轻量版 —— **不查库**。
 *
 * 只给「读自己那份数据」的接口用（历史 / 收藏列表）。理由：这些接口本来就要按 uid
 * 查自己的表，查不到就是空列表，封禁与否不影响它们能返回什么危害。
 *
 * ⚠️ **写接口一律用 assertUser**（存 / 删 / 改都要过封禁那道闸）。
 */
export async function assertSession(): Promise<
  { ok: true; session: UserSessionPayload } | { ok: false; response: NextResponse }
> {
  const store = await cookies();
  const session = await verifyUserSession(store.get(USER_SESSION_COOKIE)?.value);
  if (!session) {
    const res = NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    res.cookies.set(USER_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
    return { ok: false, response: res };
  }
  return { ok: true, session };
}

/** 签发会话时统一用它，免得各处把 TTL 算错。 */
export { USER_SESSION_COOKIE, USER_SESSION_TTL_MS } from './app-session';
