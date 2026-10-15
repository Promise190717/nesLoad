/*
 * 给 `consoles` 表补机种图：把 `scripts/console-images/` 里预备好的图上传到 R2，
 * 再把公网地址写进 `image_url`。
 *
 * 用法（仓库根目录）：
 *   node --env-file=.env.local scripts/fill-console-images.mjs [--dry-run] [--force]
 *
 * 文件名即约定：`<机种>-pixel.png` → 机种 `<机种>`（和 `lib/consoles.ts` 的
 * `ConsoleType` 同名），R2 key 也照这个来 —— `images/consoles/<文件名>`。
 * 这和后台手动传图存的路径是同一套规则，前台不需要区分图是从哪来的。
 *
 * 图片规格（对齐库里已有的 12 张）：正方形 PNG、**透明底**、像素风机器正面/斜视图。
 * ⚠️ 一定是透明底 —— 机种卡片是画在深色底（`bg-ink-950`）上的，白底图会显出一个白方块。
 * ⚠️ 这些图是 AI 生成后手工抠底的（不是厂商素材）：白底生成图不能直接按颜色阈值抠，
 *    机身本身就是近白色，会被一起抠掉 —— 得从四边泛洪找连通底色，见 `nds-pixel.png` 的做法。
 *
 * 幂等：默认只更新 `image_url IS NULL` 的行（后台手动传过的不覆盖）；
 * 确实要重传加 `--force`。
 *
 * ⚠️ `.env.local` 连的是真库、真 R2。先 `--dry-run` 看一眼。
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

const REQUIRED = [
  'CF_ACCOUNT_ID',
  'CF_D1_API_TOKEN',
  'D1_DATABASE_ID',
  'R2_ENDPOINT',
  'R2_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_PUBLIC_BASE',
];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`缺少 ${key}，请用 --env-file=.env.local`);
    process.exit(1);
  }
}

const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/d1/database/${process.env.D1_DATABASE_ID}/query`;

async function d1(sql, params = []) {
  const res = await fetch(D1_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CF_D1_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  const data = await res.json();
  if (!data.success || !data.result?.[0]?.success) {
    throw new Error(JSON.stringify(data.errors || data.result));
  }
  return data.result[0].results ?? [];
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

function publicUrlFor(key) {
  return `${process.env.R2_PUBLIC_BASE.replace(/\/+$/, '')}/${key}`;
}

/* ------------------------------------------------------------------ */

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'console-images');

/** 只认 `<机种>-pixel.png`，其它文件（比如以后放的源图 / 说明）一律不碰。 */
const FILE_PATTERN = /^([a-z0-9]+)-pixel\.png$/;

const files = readdirSync(DIR)
  .map((file) => ({ file, match: FILE_PATTERN.exec(file) }))
  .filter((item) => item.match)
  .map((item) => ({ file: item.file, type: item.match[1] }));

if (files.length === 0) {
  console.log(`${DIR} 里没有 <机种>-pixel.png，没什么可做的。`);
  process.exit(0);
}

console.log(DRY_RUN ? '== 空跑（不会上传、不会写库）==' : '== 开始 ==');

let uploaded = 0;
let skipped = 0;

for (const { file, type } of files) {
  const rows = await d1('SELECT console_type, name, image_url FROM consoles WHERE console_type = ?', [type]);

  if (rows.length === 0) {
    console.log(`  ⚠️ 库里没有机种「${type}」（${file}），跳过 —— 先跑 add-consoles.mjs 补行`);
    skipped += 1;
    continue;
  }

  const { name, image_url: current } = rows[0];
  if (current && !FORCE) {
    console.log(`  ↷ 「${name}」已有图，跳过（要重传加 --force）`);
    skipped += 1;
    continue;
  }

  const body = readFileSync(join(DIR, file));
  const key = `images/consoles/${file}`;
  const url = publicUrlFor(key);

  if (DRY_RUN) {
    console.log(`   · 「${name}」→ ${key}（${(body.length / 1024).toFixed(0)} KB）`);
    continue;
  }

  await r2.send(
    new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, Body: body, ContentType: 'image/png' })
  );
  await d1('UPDATE consoles SET image_url = ? WHERE console_type = ?', [url, type]);
  uploaded += 1;
  console.log(`  ✓ 「${name}」已上传并写入：${url}`);
}

console.log(
  DRY_RUN
    ? `\n空跑完成：${files.length} 个文件待处理，${skipped} 个跳过。未上传、未写库。`
    : `\n完成：写入 ${uploaded} 个，跳过 ${skipped} 个。`
);
