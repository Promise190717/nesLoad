/*
 * 后台：单个前台用户（`/api/admin/users/<id>`）。
 *
 *   PATCH  封禁 / 解封（body: `{ banned: boolean }`）
 *          设置 / 取消 VIP（body: `{ vipExpiresAt: number | null }`）
 *          —— 两个字段**可以同时带**，也可以只带一个；只处理给出来的那个
 *   DELETE 删号 —— **连同他的历史 / 存档 / 收藏一起清**（存档还要清 R2 对象）
 *
 * 鉴权由本文件的 assertAdmin 自查（接口不挂 middleware，原因见 lib/server/admin-guard.ts）。
 *
 * 不给改名 / 改密码（理由见下）。VIP 的到期时间**只有这条路能写**：
 * 用户自己没有任何开会员的入口 —— 这站上 VIP 就是后台手工发的。
 */

import { NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/server/admin-guard';
import { getAppUser, setAppUserBanned, setAppUserVip } from '@/lib/server/app-users';
import { purgeUserData } from '@/lib/server/user-data';
import { query } from '@/lib/server/d1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fail(error: string, detail: string, status = 400) {
  return NextResponse.json({ error, detail }, { status });
}

/** 封禁 / 解封 + 设置 VIP。 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('bad-request', '无法解析请求数据');
  }

  /*
   * 两个动作都**按需执行**：body 里带了才动那个字段，两个都没带是空请求（400 挡下）。
   * `vipExpiresAt` 用 `'vipExpiresAt' in body` 判存在而不是看真值 —— null（取消会员）
   * 是合法值，`body.vipExpiresAt ?? …` 那种写法会把「取消」和「没给」混成一团。
   */
  const hasBanned = typeof body.banned === 'boolean';
  const hasVip = 'vipExpiresAt' in body;
  if (!hasBanned && !hasVip) {
    return fail('bad-request', '需要 banned（布尔）或 vipExpiresAt（毫秒时间戳或 null）');
  }

  // vipExpiresAt 只收 null 或正整数毫秒。挡掉字符串 / 负数 / 小数 —— 前端传错早死在这里比写进库强
  if (hasVip) {
    const value = body.vipExpiresAt;
    if (
      value !== null &&
      (typeof value !== 'number' || !Number.isInteger(value) || value <= 0)
    ) {
      return fail('bad-vip', 'vipExpiresAt 必须是毫秒时间戳（正整数）或 null');
    }
  }

  try {
    if (hasBanned) {
      const found = await setAppUserBanned(id, body.banned as boolean);
      if (!found) return fail('not-found', '找不到这个用户', 404);
    }
    if (hasVip) {
      const found = await setAppUserVip(id, body.vipExpiresAt as number | null);
      if (!found) return fail('not-found', '找不到这个用户', 404);
    }
    /*
     * ⚠️ 封禁**立刻生效**，不需要等令牌过期：前台守卫（assertUser）每次请求都会
     *    查一次库并复核 status（见 lib/server/app-guard.ts）。这也是那边宁可多查
     *    一次库的原因 —— 否则被封的人能拿着旧 cookie 一直玩到 7 天后。
     *
     * 回包带**改完之后的完整用户**（含现算的 vip / vipExpiresAt）：前端就地翻
     * 这一行的标记，不用自己拼「传过去的时间是不是真写上了」。多一次读，
     * 换前端逻辑简单一截，值。
     */
    const user = await getAppUser(id);
    if (!user) return fail('not-found', '找不到这个用户', 404);
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    console.error('[admin] 用户更新失败', error);
    return fail('update-failed', (error as Error).message, 500);
  }
}

/**
 * 删号。
 *
 * 顺序：**先清数据（含 R2 对象），再删账号行**。反过来的话，`purgeUserData` 里
 * 那个按 user_id 查存档的查询就一条也找不到了 —— R2 那些对象会永远留在桶里
 * （行没了，key 也就没人知道了）。
 *
 * 返回清掉了几条，后台给个准确的回执。
 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await context.params;

  try {
    // 先确认这个人在（否则 purge 会静默返回全 0，看着像成功）
    const rows = await query<{ id: string }>('SELECT id FROM app_users WHERE id = ?', [id]);
    if (!rows[0]) return fail('not-found', '找不到这个用户', 404);

    const purged = await purgeUserData(id);
    await query('DELETE FROM app_users WHERE id = ?', [id]);

    return NextResponse.json({ ok: true, id, purged });
  } catch (error) {
    console.error('[admin] 删号失败', error);
    return fail('delete-failed', (error as Error).message, 500);
  }
}
