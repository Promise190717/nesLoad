/*
 * 创建 / 重置一个后台管理员账号。
 *
 * 用法（在仓库根目录）：
 *   node --env-file=.env.local scripts/create-user.mjs <用户名>            # 自动生成口令并打印
 *   node --env-file=.env.local scripts/create-user.mjs <用户名> <口令>     # 指定口令
 *
 * 同名用户会**覆盖口令**，方便忘记口令时重来。
 *
 * ⚠️ **2026-10-22 从 D1 改成 Supabase**：原来这里打的是 Cloudflare D1 的 REST API
 *    （CF_ACCOUNT_ID / CF_D1_API_TOKEN / D1_DATABASE_ID），而数据层 2026-10-20 已经
 *    整体切到 Supabase，那三个变量现在一个都不在 `.env.local` 里 —— 脚本早就跑不起来了。
 *    现在和 `scripts/migrate-to-supabase.mjs` 那些一样，用 `SUPABASE_DB_URL` 直连
 *    （Worker 里绝不能这么干，见 lib/server/pg.ts 文件头；这只给本地脚本用）。
 *
 * 口令用 scrypt 加盐哈希后写入 `users` 表，明文不落库。哈希格式必须和
 * `lib/server/users.ts` 的 `hashPassword` 一字不差（`salt:hash`，salt 16 字节 hex、
 * scrypt 输出 64 字节 hex）—— 改这里之前先对一下那边，否则登录永远对不上。
 *
 * **后台没有单独的 role / is_admin 字段**：`users` 表里有这一行就是管理员
 * （`lib/server/admin-guard.ts` 只验签名令牌，登录接口只查这张表）。所以「建一个
 * 管理员」= 往这张表插一行，别去找权限位。
 */
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import postgres from 'postgres';

const [username, givenPassword] = process.argv.slice(2);
const databaseUrl = process.env.SUPABASE_DB_URL;

if (!username) {
  console.error('用法：node --env-file=.env.local scripts/create-user.mjs <用户名> [口令]');
  process.exit(1);
}
if (!databaseUrl) {
  console.error('缺少环境变量 SUPABASE_DB_URL（本地脚本直连用，Worker 不读它）');
  process.exit(1);
}

/** 没给口令就现造一个：16 字节 base64url，够长且不含 shell 需要转义的字符。 */
const password = givenPassword ?? randomBytes(12).toString('base64url');

const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, salt, 64).toString('hex');

const sql = postgres(databaseUrl, { max: 1 });
try {
  const rows = await sql`
    insert into users (id, username, password_hash)
    values (${randomUUID()}, ${username}, ${`${salt}:${hash}`})
    on conflict (username) do update set password_hash = excluded.password_hash
    returning username
  `;
  console.log(`管理员「${rows[0].username}」已写入（同名覆盖了口令）。`);
  if (!givenPassword) console.log(`口令：${password}`);
  console.log('现在就可以去 /admin/login 登录。');
} finally {
  // 连接池跑完全程再 end —— 提前 end 会让最后一条语句被掐掉。
  await sql.end({ timeout: 5 });
}
