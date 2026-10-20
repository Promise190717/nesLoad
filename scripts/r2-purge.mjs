/*
 * 清空**增量缓存桶**（2026-10-20）。
 *
 * 用法（仓库根目录）：
 *   node --env-file=.env.local scripts/r2-purge.mjs           # 只盘点，不删（默认）
 *   node --env-file=.env.local scripts/r2-purge.mjs --yes     # 真的删
 *
 * ⚠️ **这个脚本只会动 `nesload-next-cache`，而且是其中的 `incremental-cache/` 前缀。**
 *    2026-10-20 之前它读 `.env.local` 的 `R2_BUCKET`（= `games` 桶），不带前缀直接跑
 *    `--yes` 就会把用户头像 / 存档 / 自持 ROM / 封面一起删掉 —— 而这些**补不回来**
 *    （R2 没有版本控制，上游也没有用户数据）。所以现在把桶名写死，`R2_BUCKET`
 *    只用来在报告里提示「已忽略」。
 *
 * 两道闸，缺一不可：
 *   ① 桶名必须等于 `CACHE_BUCKET`，别的桶直接拒绝运行；
 *   ② 只删 `incremental-cache/` 开头的键 —— 万一桶里出现别的东西（人工上传、别的项目
 *      的绑定），一律跳过并列出来，不进删除批次。
 *
 * 为什么不默认删：这个桶跑的是 Next 的 incremental cache（ISR 页面 + `cached()` 数据）。
 * 清空不会让站点挂，但接下来每个页面都要现渲染，CPU 和 Supabase 压力会短时冲高。
 */

import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const REQUIRED = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`缺少 ${key}，请用 --env-file=.env.local`);
    process.exit(1);
  }
}

/** 唯一允许清理的桶（OpenNext 的增量缓存，见 wrangler.jsonc 的 NEXT_INC_CACHE_R2_BUCKET）。 */
const CACHE_BUCKET = 'nesload-next-cache';
/** 桶里唯一该被删的键前缀。 */
const CACHE_PREFIX = 'incremental-cache/';

const CONFIRM = process.argv.includes('--yes');
const Bucket = CACHE_BUCKET;

if (process.env.R2_BUCKET && process.env.R2_BUCKET !== CACHE_BUCKET) {
  console.log(`（忽略环境里的 R2_BUCKET=${process.env.R2_BUCKET}；本脚本只清 ${CACHE_BUCKET}）`);
  console.log('');
}

const client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/** 第一段目录名（`incremental-cache/x/y.cache` → `incremental-cache`）。 */
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
  console.log('前缀'.padEnd(20) + '对象数'.padStart(8) + '体积'.padStart(14));
  for (const [prefix, row] of [...groups.entries()].sort((a, b) => b[1].bytes - a[1].bytes)) {
    const mark = prefix === CACHE_PREFIX.replace(/\/$/, '') ? '' : '  ← 不在清理范围，保留';
    console.log(prefix.padEnd(20) + String(row.count).padStart(8) + human(row.bytes).padStart(14) + mark);
  }
}

async function main() {
  if (Bucket !== CACHE_BUCKET) {
    console.error(`拒绝执行：本脚本只允许清 ${CACHE_BUCKET}，当前 ${Bucket}`);
    process.exit(1);
  }

  const objects = await listAll();
  report(objects);

  /** 只有缓存前缀算“可删”，其余一律留着（哪怕它就在这个桶里）。 */
  const doomed = objects.filter((item) => item.key.startsWith(CACHE_PREFIX));
  const spared = objects.length - doomed.length;

  if (!CONFIRM) {
    console.log('');
    console.log(`这是盘点（没有删任何东西）。可删 ${doomed.length} 个${spared ? `，另有 ${spared} 个不在清理范围` : ''}。`);
    console.log('确认要删就加 --yes。');
    return;
  }

  if (doomed.length === 0) {
    console.log('\n没有需要删除的对象。');
    return;
  }

  console.log(`\n开始删除 ${doomed.length} 个对象（${CACHE_PREFIX}*）…`);
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
