/*
 * 前台注册用户（app_users 表）的读写。
 *
 * ⚠️ **和 lib/server/users.ts 是两回事** —— 那个是**后台管理员**（`users` 表），
 *    这个是**站内注册用户**（`app_users` 表）。两套账号、两套 cookie、两套守卫，
 *    刻意不共用任何一行查询。唯一共用的是口令哈希算法：这里 import 它的
 *    `hashPassword` / `verifyPassword` 两个纯函数 —— 那两段只是「salt:hash 的
 *    scrypt」，和「是谁」无关，重写一遍只会多一份可能漂的代码。
 *
 * 本文件依赖 node:crypto（经由 users.ts），只能在 Node runtime 的路由里用。
 */

import { randomUUID } from 'node:crypto';
import { query } from './d1';
import { publicUrl } from './r2';
import { hashPassword, verifyPassword } from './users';

/** 用户名长度下限 / 上限。太短容易撞、太长列表里摆不下。 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/** 口令长度下限 / 上限。上限是挡「拿一个 100KB 的串去算 scrypt」这种白费算力的请求。 */
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72;

/** 一页多少条（后台用户管理列表用）。 */
export const USERS_PAGE_SIZE = 12;

/** 用户名允许的字符：中英数字 + 下划线连字符点。**不含空格**（前后空格是校验的坑）。 */
const USERNAME_PATTERN = /^[A-Za-z0-9_\-.]+$/;

/** DB 行（snake_case）。 */
export interface AppUserRow {
  id: string;
  username: string;
  password_hash: string;
  status: number;
  created_at: number;
  last_login_at: number | null;
  gender: string | null;
  avatar_key: string | null;
  vip_expires_at: number | null;
}

/**
 * 性别取值。`null` = **未知**（默认态）—— 刻意允许，注册时不强制选。
 *
 * ⚠️ 2026-10-13 收紧了：原先还有一档 `'other'`（界面写「其他」），现已取消。
 *    理由：「其他」和「未知」在界面上就是同一件事（都是「没正经选一个」），
 *    而库里 NULL 已经承担了「未知」。留两档只会让用户纠结选哪个。
 *
 * ⚠️ 类型里**保留** `'other'`：老数据可能存过它，`toAppUser` 会原样读出来。
 *    前端拿到 `'other'` 时画不出对应的高亮按钮（四档变三档了），
 *    但**不会崩** —— `current === value` 都不成立，等于没有选中项。
 *    真要兼容就把那一行数据改成 NULL，不值得为它写迁移。
 */
export type Gender = 'male' | 'female' | 'other';

/** 合法性别值集合（校验用）。⚠️ 不含 `'other'` —— 已废弃，见 Gender 的说明。 */
const GENDERS: readonly string[] = ['male', 'female'];

/**
 * 校验性别取值。
 *
 * 返回归一化后的值：`null` 表示「未填」（**合法** —— 用户可以不选），
 * `'invalid'` 表示传了个不认识的串。调用方据此区分「清空」和「非法」。
 *
 * ⚠️ **`'other'` 已经不在合法集里了**（2026-10-13 收紧）—— 那一档的界面叫「其他」，
 *    但库里的 NULL 本来就表示「未知」，两个说法指的是同一件事，平白多一档。
 *    现在只留 male / female / null（未知）。老数据里若真存过 `'other'`，
 *    `toAppUser` 仍能读出来（它只做 as Gender 转换，不过校验），但前端四档
 *    已经画不出来那一档 —— 见下面 `AppUser.gender` 的说明。
 */
export function normalizeGender(raw: unknown): Gender | null | 'invalid' {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') return 'invalid';
  return GENDERS.includes(raw) ? (raw as Gender) : 'invalid';
}

/** 对外结构（camelCase）—— **不带 password_hash**，那份东西不允许出这个文件。 */
export interface AppUser {
  id: string;
  username: string;
  /** true = 已封禁。SQLite 存 0/1，这里转成布尔（同 feedback.resolved 的套路）。 */
  banned: boolean;
  createdAt: number;
  lastLoginAt: number | null;
  /** `null` = 未知（默认）；`'other'` 是历史遗留值，新数据不会再产生，见 Gender 的说明。 */
  gender: Gender | null;
  /** 头像的**公网地址**（由 avatar_key 现拼）；没设过头像就是 null。 */
  avatarUrl: string | null;
  /**
   * **现在是不是 VIP**。由 vip_expires_at 现算（`> now`），库里不存这个布尔 ——
   * 到期的会员在这里自动变 false，不需要任何人手动清。
   */
  vip: boolean;
  /** VIP 有效期至（毫秒时间戳）。null = 从来没开过 / 已被取消；**过去了的也原样给出** —— 个人中心可以拿它说明「会员已过期」。 */
  vipExpiresAt: number | null;
}

/** 后台列表用的行：多带三个统计数（历史 / 存档 / 收藏各几条）。 */
export interface AppUserWithStats extends AppUser {
  historyCount: number;
  saveCount: number;
  favoriteCount: number;
}

/** 一页结果。用游标翻页（同 feedback），游标 = `created_at:id`。 */
export interface AppUserPage {
  items: AppUserWithStats[];
  nextCursor: string | null;
}

function toAppUser(row: AppUserRow): AppUser {
  return {
    id: row.id,
    username: row.username,
    banned: row.status === 0,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    gender: (row.gender as Gender | null) ?? null,
    /*
     * 头像地址**现拼**：库里只存 key（`avatars/<uid>/<file>`），公网域名由
     * publicUrl() 拼出来。这样换 R2 公网域名 / 加 CDN 前缀时不必回表改数据。
     * 没设过头像（key 是 null）就给 null，前端据此画默认头像。
     */
    avatarUrl: row.avatar_key ? publicUrl(row.avatar_key) : null,
    /*
     * VIP 是**读时判定**：到期时间 > 现在才算。过期的人不用谁去清数据，
     * 下一次读出来自然就是非会员（vipExpiresAt 仍带着过期的那一天，
     * 界面想提示「会员已过期」有据可查）。
     */
    vip: row.vip_expires_at !== null && row.vip_expires_at > Date.now(),
    vipExpiresAt: row.vip_expires_at,
  };
}

/**
 * 校验用户名。
 *
 * 返回错误键（给前端查 i18n），**通过返回 null**。不抛异常 —— 调用方（route handler）
 * 要把这个键原样回给前端，抛了还得 catch 一次。
 */
export function validateUsername(raw: unknown): 'invalid' | 'too-short' | 'too-long' | null {
  if (typeof raw !== 'string') return 'invalid';
  const value = raw.trim();
  if (!value || !USERNAME_PATTERN.test(value)) return 'invalid';
  if (value.length < USERNAME_MIN) return 'too-short';
  if (value.length > USERNAME_MAX) return 'too-long';
  return null;
}

/**
 * 校验口令。
 *
 * ⚠️ **口令仍然不做 trim**（前后空格不悄悄削掉）—— 但**任何空白字符整体被禁**
 *    （2026-10-13 用户要求「移除空格输入」）。两条并不矛盾：trim 是「背地里改掉用户
 *    输入」，禁空格是「明着告诉用户这个字符不能用」，后者更诚实，也不会造出
 *    「我明明输对了登不上」那种冤案。
 *
 * ⚠️ **只管注册和改密码这两条路**（`/api/user/register` 和 `/api/user/password`）——
 *    **登录刻意不校验**：老账号里可能存着带空格的口令（禁空格之前建的号），
 *    登录时拦掉等于把人锁在门外。`authenticateAppUser` 只比哈希，不调这个函数。
 *
 * 判序：**先空格后长度** —— 用户输了个带空格的短口令时，「不能有空格」比「太短」
 * 更接近他真正要改的地方。
 */
export function validatePassword(
  raw: unknown
): 'invalid' | 'has-space' | 'too-short' | 'too-long' | null {
  if (typeof raw !== 'string') return 'invalid';
  if (/\s/.test(raw)) return 'has-space';
  if (raw.length < PASSWORD_MIN) return 'too-short';
  if (raw.length > PASSWORD_MAX) return 'too-long';
  return null;
}

/** 按用户名查（登录用）。返回的**带 password_hash**，只在登录流程里用。 */
export async function findAppUser(username: string): Promise<AppUserRow | null> {
  const rows = await query<AppUserRow>(
    'SELECT id, username, password_hash, status, created_at, last_login_at, gender, avatar_key, vip_expires_at FROM app_users WHERE username = ?',
    [username]
  );
  return rows[0] ?? null;
}

/** 按 id 查。守卫要用它复核「这个账号还在不在、有没有被封」。 */
export async function getAppUser(id: string): Promise<AppUser | null> {
  const rows = await query<AppUserRow>(
    'SELECT id, username, password_hash, status, created_at, last_login_at, gender, avatar_key, vip_expires_at FROM app_users WHERE id = ?',
    [id]
  );
  const row = rows[0];
  return row ? toAppUser(row) : null;
}

export interface RegisterInput {
  username: string;
  password: string;
}

/**
 * 注册。用户名撞车时返回 null（由调用方回 `username-taken`）。
 *
 * ⚠️ **不写成 `INSERT OR IGNORE`**：那样撞车也是「成功」，分不出是新建还是重名。
 *    直接 INSERT，让 `username` 的 UNIQUE 约束去抛 —— 捕获到唯一约束错误返回 null。
 *    这样只在真正建号成功时才返回用户对象。
 *
 * 建号之后**不自动登录**（调用方决定）：注册接口会顺带签发会话，那是路由层的选择，
 * 数据层只管建号。
 */
export async function registerAppUser(input: RegisterInput): Promise<AppUser | null> {
  const id = randomUUID();
  const createdAt = Date.now();
  const username = input.username.trim();
  try {
    /*
     * 新列（gender / avatar_key / vip_expires_at）**显式写 NULL**，不靠「不写就是 NULL」——
     * 这里列清单写着更清楚，也和 toAppUser 的假设对得上。VIP 一律从「不是」开始，
     * 开 / 关只有 admin 那条路（setAppUserVip）。
     */
    await query(
      `INSERT INTO app_users
         (id, username, password_hash, status, created_at, last_login_at, gender, avatar_key, vip_expires_at)
       VALUES (?, ?, ?, 1, ?, NULL, NULL, NULL, NULL)`,
      [id, username, hashPassword(input.password), createdAt]
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // D1 走 REST，唯一约束错误会以 `UNIQUE constraint failed: app_users.username` 的形式回来
    if (/UNIQUE constraint failed/i.test(message)) return null;
    throw error;
  }
  return {
    id,
    username,
    banned: false,
    createdAt,
    lastLoginAt: null,
    gender: null,
    avatarUrl: null,
    vip: false,
    vipExpiresAt: null,
  };
}

/**
 * 校验登录凭据。**用户名不存在和口令不对都返回 null**（调用方统一回 `invalid-credentials`）。
 *
 * 被封禁的账号即使口令对也返回 null —— 但理由码由调用方从 `findAppUser` 的 status 判断，
 * 所以这里单独给一个 `banned` 分支：先把行拿出来，再分开判。
 */
export async function authenticateAppUser(input: {
  username: string;
  password: string;
}): Promise<{ user: AppUser } | { error: 'invalid-credentials' | 'banned' }> {
  const row = await findAppUser(input.username.trim());
  if (!row || !verifyPassword(row.password_hash, input.password)) {
    return { error: 'invalid-credentials' };
  }
  if (row.status === 0) return { error: 'banned' };
  return { user: toAppUser(row) };
}

/** 记一次登录时间。失败不抛 —— 登录已经成功了，时间戳写不上不该把登录搞挂。 */
export async function touchLastLogin(id: string): Promise<void> {
  try {
    await query('UPDATE app_users SET last_login_at = ? WHERE id = ?', [Date.now(), id]);
  } catch (error) {
    console.warn('[nesload] 写 last_login_at 失败（不影响本次登录）：', error);
  }
}

/**
 * 设置 VIP 有效期（**只有 admin 走这里** —— 用户自己不能给自己开会员）。
 *
 * `expiresAt` 传毫秒时间戳；传 `null` = 取消会员（清掉到期时间，回到非会员）。
 * 不在这里拦「过期时间」：admin 给个过去的日期等价于立刻取消，随他去。
 *
 * **先 SELECT 确认存在**再 UPDATE（D1 REST 不回影响行数，打空了看不出来 ——
 * 同 setAppUserBanned 的套路）。返回这个人在不在。
 */
export async function setAppUserVip(id: string, expiresAt: number | null): Promise<boolean> {
  const rows = await query<{ id: string }>('SELECT id FROM app_users WHERE id = ?', [id]);
  if (!rows[0]) return false;
  await query('UPDATE app_users SET vip_expires_at = ? WHERE id = ?', [expiresAt, id]);
  return true;
}

/**
 * 改封禁状态。**返回这个人在不在**（同 feedback.setFeedbackResolved：D1 REST 不回影响行数，
 * UPDATE 打空了看不出区别，所以先确认存在）。
 */
export async function setAppUserBanned(id: string, banned: boolean): Promise<boolean> {
  const rows = await query<{ id: string }>('SELECT id FROM app_users WHERE id = ?', [id]);
  if (!rows[0]) return false;
  await query('UPDATE app_users SET status = ? WHERE id = ?', [banned ? 0 : 1, id]);
  return true;
}

/* ================================================================== *
 * 个人资料（2026-10-13 个人中心）
 * ================================================================== */

/**
 * 改性别。`null` = 清空（用户选「不填」）。
 *
 * 返回改完之后的那个人（拿最新的头像地址 / 别的新字段一起回给前端，
 * 免得前端改一次资料还得再拉一遍）。
 * **先 SELECT 确认存在**再 UPDATE —— D1 REST 不回影响行数，打空了看不出来。
 * 不存在返回 null。
 */
export async function setAppUserGender(id: string, gender: Gender | null): Promise<AppUser | null> {
  const rows = await query<{ id: string }>('SELECT id FROM app_users WHERE id = ?', [id]);
  if (!rows[0]) return null;
  await query('UPDATE app_users SET gender = ? WHERE id = ?', [gender, id]);
  return getAppUser(id);
}

/**
 * 改密码。**必须自己先验旧密码**（由调用方传入 oldPassword）。
 *
 * 返回：
 *   · `'ok'`            改成功
 *   · `'wrong-password'` 旧密码不对
 *   · `'not-found'`      这个人不在了（令牌还没过期但号被删了）
 *
 * ⚠️ 旧密码的比对**在这一层做**（而不是在路由里先 findAppUser 再比）：
 *    这样 `password_hash` 不会离开这个文件 —— 它本来就只有这一个出口。
 *
 * 新密码的**长度校验在路由层**（validatePassword）—— 数据层只管写。
 */
export async function changeAppUserPassword(
  id: string,
  oldPassword: string,
  newPassword: string
): Promise<'ok' | 'wrong-password' | 'not-found'> {
  const rows = await query<{ password_hash: string }>(
    'SELECT password_hash FROM app_users WHERE id = ?',
    [id]
  );
  const row = rows[0];
  if (!row) return 'not-found';
  if (!verifyPassword(row.password_hash, oldPassword)) return 'wrong-password';

  await query('UPDATE app_users SET password_hash = ? WHERE id = ?', [
    hashPassword(newPassword),
    id,
  ]);
  return 'ok';
}

/**
 * 换头像：写新的 key，**返回旧 key**（调用方据此删 R2 上的旧对象）。
 *
 * 为什么要返回旧 key 而不是在这儿顺手删：删除是「尽力而为」的副作用，
 * 不该和数据写入耦合在同一个 try 里（删失败不能让「头像已换」变成报错）。
 * 调用方拿到旧 key 自己去 best-effort 删，失败只留日志。
 *
 * 传入 `null` 表示**清掉头像**（回到默认图），同样把旧 key 交出来删。
 */
export async function setAppUserAvatar(id: string, avatarKey: string | null): Promise<{
  user: AppUser;
  previousKey: string | null;
} | null> {
  const rows = await query<{ avatar_key: string | null }>(
    'SELECT avatar_key FROM app_users WHERE id = ?',
    [id]
  );
  const row = rows[0];
  if (!row) return null;

  await query('UPDATE app_users SET avatar_key = ? WHERE id = ?', [avatarKey, id]);
  const user = await getAppUser(id);
  if (!user) return null;
  return { user, previousKey: row.avatar_key };
}

/** 游标 = `created_at:id`（同 feedback 的编码，按第一个冒号切）。 */
function encodeCursor(user: AppUser): string {
  return `${user.createdAt}:${user.id}`;
}

function decodeCursor(raw: string | null | undefined): { createdAt: number; id: string } | null {
  if (!raw) return null;
  const at = raw.indexOf(':');
  if (at <= 0) return null;
  const createdAt = Number(raw.slice(0, at));
  const id = raw.slice(at + 1);
  if (!Number.isFinite(createdAt) || !id) return null;
  return { createdAt, id };
}

function clampLimit(value: number | undefined): number {
  if (!Number.isInteger(value) || !value || value < 1) return USERS_PAGE_SIZE;
  return Math.min(value, 50);
}

/*
 * 后台用户列表。
 *
 * 带三个统计数（历史 / 存档 / 收藏各几条）—— 后台看一眼就知道这个号是真的在用还是空注册。
 * 用**三条相关子查询**而不是 JOIN + GROUP BY：子查询各走各的索引，语义也更好读；
 * 一页最多 12 行，这点开销可以忽略（真要慢了再改成一次 GROUP BY 聚合）。
 *
 * ⚠️ 游标判据是 `(created_at, id)` 两级 —— created_at 是毫秒时间戳，同毫秒注册两个号
 *    并不罕见，只用 created_at 当游标会整段跳过（同 feedback 的注释）。
 */
export async function listAppUsersPage(options: {
  cursor?: string | null;
  limit?: number;
} = {}): Promise<AppUserPage> {
  const limit = clampLimit(options.limit);
  const cursor = decodeCursor(options.cursor);

  const SELECT = `
    SELECT
      u.id, u.username, u.password_hash, u.status, u.created_at, u.last_login_at,
      u.gender, u.avatar_key, u.vip_expires_at,
      (SELECT COUNT(*) FROM user_history   h WHERE h.user_id = u.id) AS history_count,
      (SELECT COUNT(*) FROM user_saves     s WHERE s.user_id = u.id) AS save_count,
      (SELECT COUNT(*) FROM user_favorites f WHERE f.user_id = u.id) AS favorite_count
    FROM app_users u`;

  // 多取一条用来推 nextCursor（同 feedback：比再发一次 COUNT 便宜）
  const rows = cursor
    ? await query<AppUserRow & { history_count: number; save_count: number; favorite_count: number }>(
        `${SELECT}
          WHERE (u.created_at < ?) OR (u.created_at = ? AND u.id < ?)
          ORDER BY u.created_at DESC, u.id DESC
          LIMIT ?`,
        [cursor.createdAt, cursor.createdAt, cursor.id, limit + 1]
      )
    : await query<AppUserRow & { history_count: number; save_count: number; favorite_count: number }>(
        `${SELECT}
          ORDER BY u.created_at DESC, u.id DESC
          LIMIT ?`,
        [limit + 1]
      );

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((row) => ({
    ...toAppUser(row),
    historyCount: Number(row.history_count ?? 0),
    saveCount: Number(row.save_count ?? 0),
    favoriteCount: Number(row.favorite_count ?? 0),
  }));
  const last = items[items.length - 1];

  return { items, nextCursor: hasMore && last ? encodeCursor(last) : null };
}

/** 用户总数（后台概览那一行）。 */
export async function countAppUsers(): Promise<number> {
  const rows = await query<{ n: number }>('SELECT COUNT(*) AS n FROM app_users');
  return Number(rows[0]?.n ?? 0);
}
