/*
 * 命令行「确保某个开发商存在」—— 有就什么都不做，没有才插一条。
 *
 * 和 scripts/add-developers.mjs（复数）的区别：
 *   · add-developers.mjs 是一次性**迁移**（建表 + 给 games 补 developer_id 列 + 回填），跑完就该退休；
 *   · 本脚本是**日常 CLI**，用来补一个新开发商（比如从外部站点爬游戏时发现开发商库里没有）。
 *
 * 用法：
 *   node --env-file=.env.local scripts/add-developer.mjs --name 科乐美 \
 *     [--name-en Konami] [--founded 1969] [--website https://www.konami.com/] \
 *     [--summary "..."] [--summary-en "..."] [--dry-run]
 *
 * ⚠️ **只增不删**：只有一次 SELECT（判重）+ 一次 INSERT。没有 UPDATE / DELETE / DROP。
 * ⚠️ `name` 在库里是 UNIQUE —— 按名字判重，已存在就直接跳过，不会插出重复行。
 * ⚠️ 走 Cloudflare D1 的 REST API，和其它 scripts/*.mjs 同一套，本地就能跑。
 */

import { randomUUID } from 'node:crypto';

const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID } = process.env;

const argv = process.argv.slice(2);

/** 取 `--name value` 形式的值；没有就返回 null。 */
function arg(name) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
}

const name = arg('name');
const nameEn = arg('name-en');
const founded = arg('founded');
const website = arg('website');
const summary = arg('summary');
const summaryEn = arg('summary-en');
const dryRun = argv.includes('--dry-run');

if (!name) {
  console.error('用法：node --env-file=.env.local scripts/add-developer.mjs --name <开发商名> [--name-en ...] [--founded 1969] [--website ...] [--summary ...] [--summary-en ...]');
  process.exit(1);
}

const missing = [
  ['CF_ACCOUNT_ID', CF_ACCOUNT_ID],
  ['CF_D1_API_TOKEN', CF_D1_API_TOKEN],
  ['D1_DATABASE_ID', D1_DATABASE_ID],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error(`缺少环境变量：${missing.join(' / ')}`);
  console.error('用法：node --env-file=.env.local scripts/add-developer.mjs --name <开发商名>');
  process.exit(1);
}

const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

/** 跑一条 SQL，返回结果行。D1 的 /query 单次只吃一条语句。 */
async function d1(sql, params = []) {
  const res = await fetch(D1_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_D1_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  const data = await res.json();
  if (!res.ok || !data.success || !data.result?.[0]?.success) {
    const detail = (data.errors ?? []).map((e) => e.message).filter(Boolean).join('; ');
    throw new Error(`${detail || `HTTP ${res.status}`}（语句：${sql.replace(/\s+/g, ' ')}）`);
  }
  return data.result[0].results ?? [];
}

const foundedYear = founded ? Number(founded) : null;
if (foundedYear !== null && !Number.isInteger(foundedYear)) {
  console.error('--founded 必须是整数年份');
  process.exit(1);
}

// 判重：`name` 是 UNIQUE，已存在就跳过（幂等）。
// 顺带按 `name_en` 也查一遍 —— 库里可能是「Konami」当 name 存的，别插出两条。
const existing = await d1(
  'SELECT id, name, name_en FROM developers WHERE name = ? OR (name_en IS NOT NULL AND name_en = ?)',
  [name, nameEn]
);
if (existing[0]) {
  console.log(
    `已存在：${existing[0].name}（${existing[0].name_en ?? '-'}）id=${existing[0].id} —— 什么都没做。`
  );
  process.exit(0);
}

const id = randomUUID();
console.log(`将新建开发商：${name}${nameEn ? `（${nameEn}）` : ''} id=${id}`);

if (dryRun) {
  console.log('--dry-run：不会真的写入。');
  process.exit(0);
}

await d1(
  `INSERT INTO developers
     (id, name, name_en, image_url, summary, summary_en, description, description_en,
      founded_year, website, created_at)
   VALUES (?, ?, ?, NULL, ?, ?, NULL, NULL, ?, ?, ?)`,
  [id, name, nameEn, summary, summaryEn, foundedYear, website, Date.now()]
);

console.log(`✅ 已新建开发商：${name}（id=${id}）`);
