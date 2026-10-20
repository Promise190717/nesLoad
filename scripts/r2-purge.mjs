/*
 * 清空 R2 桶（2026-10-20）。
 *
 * 用法（仓库根目录）：
 *   node --env-file=.env.local scripts/r2-purge.mjs                 # 只盘点，不删（默认）
 *   node --env-file=.env.local scripts/r2-purge.mjs --yes           # 真的全删
 *   node --env-file=.env.local scripts/r2-purge.mjs --yes --keep=avatars,saves
 *
 * 为什么默认只盘点：R2 **没有版本控制**，删了就是删了。这个桶里除了封面图，还躺着
 * `roms/`（本站自持的 ROM）、`avatars/`（用户头像）、`saves/`（存档快照）——
 * 后两个是**用户数据**，删掉没法从上游补回来。所以：
 *   · 不带 `--yes` 一律只打印「按前缀分组」的盘点表；
 *   · 想保住某几个前缀（例如用户数据）就 `--keep=`，按**第一段目录名**匹配。
 *
 * 删除用 DeleteObjects（一次 1000 个），按批推进；每批打一行进度。
 */

import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const REQUIRED = [
  'R2_ENDPOINT',
  'R2_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`缺少 ${key}，请用 --env-file=.env.local`);
    process.exit(1);
  }
}

const CONFIRM = process.argv.includes('--yes');
const keepArg = process.argv.find((arg) => arg.startsWith('--keep='));
/** `--keep=avatars,saves` → ['avatars','saves']；空 = 不保任何前缀 */
const KEEP = new Set(
  (keepArg?.slice('--keep='.length) ?? '')
    .split(',')
    .map((item) => item.trim().replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
);

const client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const Bucket = process.env.R2_BUCKET;

/** 第一段目录名（`images/games/x.webp` → `images`）；没有斜杠的算 `(根目录)`。 */
function prefixOf(key) {
  const at = key.indexOf('/');
  return at === -1 ? '(根目录)' : key.slice(0, at);
}

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/** 全量列出（分页）。 */
async function listAll() {
  const objects = [];
  let token;
  for (;;) {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket, ContinuationToken: token, MaxKeys: 1000 })
    );
    for (const item of res.Contents ?? []) {
      if (item.Key) objects.push({ key: item.Key, size: item.Size ?? 0 });
    }
    if (!res.IsTruncated) break;
    token = res.NextContinuationToken;
  }
  return objects;
}

function report(objects) {
  const groups = new Map();
  for (const item of objects) {
    const prefix = prefixOf(item.key);
    const row = groups.get(prefix) ?? { count: 0, bytes: 0 };
    row.count += 1;
    row.bytes += item.size;
    groups.set(prefix, row);
  }

  console.log(`桶 ${Bucket}：${objects.length} 个对象，共 ${human(objects.reduce((n, o) => n + o.size, 0))}`);
  console.log('');
  console.log('前缀'.padEnd(16) + '对象数'.padStart(8) + '体积'.padStart(14));
  for (const [prefix, row] of [...groups.entries()].sort((a, b) => b[1].bytes - a[1].bytes)) {
    const mark = KEEP.has(prefix) ? '  ← 保留' : '';
    console.log(prefix.padEnd(16) + String(row.count).padStart(8) + human(row.bytes).padStart(14) + mark);
  }
}

async function main() {
  const objects = await listAll();
  report(objects);

  if (!CONFIRM) {
    console.log('');
    console.log('这是盘点（没有删任何东西）。确认要删就加 --yes；想保住用户数据加 --keep=avatars,saves');
    return;
  }

  const doomed = objects.filter((item) => !KEEP.has(prefixOf(item.key)));
  if (doomed.length === 0) {
    console.log('\n没有需要删除的对象。');
    return;
  }

  console.log(`\n开始删除 ${doomed.length} 个对象${KEEP.size ? `（保留 ${[...KEEP].join(', ')}）` : ''}…`);
  let done = 0;
  for (let i = 0; i < doomed.length; i += 1000) {
    const batch = doomed.slice(i, i + 1000);
    await client.send(
      new DeleteObjectsCommand({
        Bucket,
        Delete: { Objects: batch.map((item) => ({ Key: item.key })), Quiet: true },
      })
    );
    done += batch.length;
    console.log(`  已删除 ${done}/${doomed.length}`);
  }

  const left = await listAll();
  console.log(`\n完成。桶里还剩 ${left.length} 个对象（${human(left.reduce((n, o) => n + o.size, 0))}）。`);
}

main().catch((error) => {
  console.error('清空失败：', error);
  process.exit(1);
});
