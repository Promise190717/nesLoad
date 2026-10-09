/*
 * 创建 / 重置一个后台管理员账号。
 *
 * 用法：
 *   node --env-file=.env.local scripts/create-user.mjs <用户名> <口令>
 *
 * 口令用 scrypt 加盐哈希后写入 D1（users 表），明文不落库。
 * 同名用户会**覆盖口令**，方便忘记口令时重来。
 */
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';

const [username, password] = process.argv.slice(2);
const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID } = process.env;

if (!username || !password) {
  console.error('用法：node --env-file=.env.local scripts/create-user.mjs <用户名> <口令>');
  process.exit(1);
}
if (!CF_ACCOUNT_ID || !CF_D1_API_TOKEN || !D1_DATABASE_ID) {
  console.error('缺少环境变量：需要 CF_ACCOUNT_ID / CF_D1_API_TOKEN / D1_DATABASE_ID');
  process.exit(1);
}

const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, salt, 64).toString('hex');

const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;
const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${CF_D1_API_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    sql:
      'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash',
    params: [randomUUID(), username, `${salt}:${hash}`, Date.now()],
  }),
});

const data = await res.json();
if (!res.ok || !data.success) {
  console.error('写入失败：', JSON.stringify(data.errors ?? data));
  process.exit(1);
}

console.log(`管理员「${username}」已写入（同名会覆盖口令）。`);