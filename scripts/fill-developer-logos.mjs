/**
 * 给 `developers` 表补厂标：上传 `scripts/developer-logos/` 里预备好的图片到 R2，
 * 再把公网地址写进 `image_url`。
 *
 * 图片来源：Wikipedia / Commons 上各公司词条用的官方 logo（2026-10-13 抓取，
 * 文件名 = slug）。Heartbeat / Mega Enterprise 两家的文件在维基上查不到引用、
 * 无法确认是本公司 logo，刻意不进 MAP —— 别顺手加回来，先人工确认。
 *
 * 幂等：只更新 `image_url IS NULL` 的记录（后台手动传过的不覆盖）。
 * 用法：`node --env-file=.env.local scripts/fill-developer-logos.mjs [--dry-run]`
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const DRY_RUN = process.argv.includes('--dry-run');

const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID, R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE } = process.env;
for (const key of ['CF_ACCOUNT_ID', 'CF_D1_API_TOKEN', 'D1_DATABASE_ID', 'R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_BASE']) {
  if (!process.env[key]) {
    console.error(`缺少 ${key}，请用 --env-file=.env.local`);
    process.exit(1);
  }
}

const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

/** 开发商名（developers.name，唯一）→ 暂存目录里的文件名。 */
const MAP = {
  '任天堂': 'nintendo.svg',
  '科乐美': 'konami.svg',
  '卡普空（Capcom）': 'capcom.svg',
  '史克威尔': 'square.svg',
  'Hudson Soft': 'hudson-soft.png',
  'SNK': 'snk.svg',
  'Nazca': 'nazca.webp',
  'Namco': 'namco.svg',
  'Technōs Japan': 'technos.png',
  'Winkysoft': 'winkysoft.png',
  '东亚企划': 'toaplan.png',
  'Rare': 'rare.svg',
  'Iguana Entertainment': 'iguana.png',
  'Midway': 'midway.svg',
  '派克兄弟': 'parker-brothers.svg',
  '鈊象电子': 'igs.png',
};

const CONTENT_TYPE = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const LOGOS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'developer-logos');

async function d1(sql, params = []) {
  const res = await fetch(D1_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_D1_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const data = await res.json();
  if (!data.success || !data.result?.[0]?.success) {
    throw new Error(JSON.stringify(data.errors || data.result));
  }
  return data.result[0];
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

function publicUrl(key) {
  return `${R2_PUBLIC_BASE.replace(/\/+$/, '')}/${key}`;
}

let updated = 0;
let skipped = 0;

for (const [name, file] of Object.entries(MAP)) {
  const rows = await d1('SELECT id, image_url FROM developers WHERE name = ?', [name]);
  if (rows.results.length === 0) {
    console.log(`  ⚠️ 库里没有「${name}」，跳过`);
    skipped += 1;
    continue;
  }
  const { id, image_url } = rows.results[0];

  // 幂等：已有厂标就跳过（后台可能手动传过）
  if (image_url) {
    console.log(`  ↷ 「${name}」已有厂标，跳过（不覆盖）`);
    skipped += 1;
    continue;
  }

  const body = readFileSync(join(LOGOS_DIR, file));
  const ext = file.slice(file.lastIndexOf('.'));
  const contentType = CONTENT_TYPE[ext] ?? 'application/octet-stream';
  // key 与后台手动上传同一套规则：images/developers/<id>-<文件名>
  const key = `images/developers/${id}-logo${ext}`;
  const url = publicUrl(key);

  if (DRY_RUN) {
    console.log(`   · 「${name}」→ ${key}（${body.length} bytes, ${contentType}）`);
    continue;
  }

  await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: contentType }));
  await d1('UPDATE developers SET image_url = ? WHERE id = ?', [url, id]);
  updated += 1;
  console.log(`  ✓ 「${name}」已上传并写入：${url}`);
}

console.log(
  DRY_RUN
    ? `\n空跑完成：${Object.keys(MAP).length} 家待写，${skipped} 家跳过。未上传、未写库。`
    : `\n完成：写入 ${updated} 家，跳过 ${skipped} 家。`
);
