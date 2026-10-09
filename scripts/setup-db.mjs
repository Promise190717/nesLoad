/*
 * 初始化 D1 表结构（games / users）。
 *
 * 用法：
 *   node --env-file=.env.local scripts/setup-db.mjs
 *
 * 走的是 Cloudflare D1 的 REST API，所以本地就能建表，不需要 wrangler 或部署。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID } = process.env;
if (!CF_ACCOUNT_ID || !CF_D1_API_TOKEN || !D1_DATABASE_ID) {
  console.error('缺少环境变量：需要 CF_ACCOUNT_ID / CF_D1_API_TOKEN / D1_DATABASE_ID');
  console.error('用法：node --env-file=.env.local scripts/setup-db.mjs');
  process.exit(1);
}

const schema = readFileSync(join(here, '..', 'db', 'schema.sql'), 'utf8');
const statements = schema
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((sql) => sql.trim())
  .filter(Boolean);

const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

for (const sql of statements) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_D1_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    console.error('执行失败：', sql.replace(/\s+/g, ' '));
    console.error(JSON.stringify(data.errors ?? data));
    process.exit(1);
  }
  console.log('ok:', sql.replace(/\s+/g, ' ').slice(0, 72));
}

console.log('\n建表完成：games / users 已就绪。');