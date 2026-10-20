/*
 * 清掉 Next 增量缓存桶里**旧 buildId** 的目录（2026-10-20）。
 *
 * ## 为什么需要它
 *
 * `open-next.config.ts` 用的是 `r2IncrementalCache`，缓存 key 是
 *   `incremental-cache/<OPEN_NEXT_BUILD_ID>/<sha256(key)>.cache`
 * 而 `OPEN_NEXT_BUILD_ID = NextConfig.deploymentId ?? BuildId`（见
 * `@opennextjs/aws/dist/adapters/config/index.js`）。本项目 `next.config.js` 里
 * **两个都没配**，所以每次 `pnpm cf:build` 都是一个新 nanoid ⇒ 旧目录再也没人读、
 * 也不会被删，桶只增不减。
 *
 * 这个脚本**只删「不是当前 buildId」的目录**：当前那一个永远保留，所以
 * **不会造成冷启动** —— 旧目录里的对象本来就再也命中不到了，删掉不影响任何在线请求。
 *
 * ## 为什么挂在 `cf:deploy` 之后，而不是 build 之后
 *
 * `opennextjs-cloudflare deploy` 会先把 `.open-next/cache` 里的预渲染条目
 * `populateCache` 上传到同一个桶（写进当前 buildId 目录）。如果在 build 阶段清，
 * ① 那时候线上还在跑旧版本，它会立刻把旧 buildId 目录重新写回来，等于白清；
 * ② 紧接着的 populateCache 又要重新上传一遍。所以时机必须是**部署成功之后**。
 *
 * ## 用法（仓库根目录）
 *
 *   node --env-file-if-exists=.env.local scripts/next-cache-purge.mjs         # 只盘点
 *   node --env-file-if-exists=.env.local scripts/next-cache-purge.mjs --yes   # 真的删
 *
 *   ... --keep=<buildId>   手动指定保留哪个（默认读 .next/BUILD_ID）
 *
 * ⚠️ 桶名与缓存前缀**写死**，不接受任何覆盖（2026-10-20 加固）。
 *    以前这里能 `--bucket=xxx` / `--prefix=roms`，而那两处一旦写错，`cf:deploy`
 *    尾巴上那句 `--yes` 就会照着 `games` 桶的目录结构删东西 —— 那里是用户头像、
 *    存档和自持 ROM，补不回来。现在只认 `nesload-next-cache` + `incremental-cache/`。
 *    （要**整桶清空**缓存用 `scripts/r2-purge.mjs`；这个脚本只清「旧 buildId 目录」。）
 *
 * ⚠️ **当前 buildId 取不到时直接退出、不删任何东西** —— 宁可不清，也不能猜。
 * ⚠️ 环境变量不全时**以退出码 0 结束**并打印警告：这个脚本是 `pnpm cf:deploy` 的
 *    尾巴，部署本身已经成功了，不该因为清理没跑成而让整条命令显示失败。
 */

import { readFileSync } from 'node:fs';

import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

/** 仓库根（脚本在 `scripts/` 下）。按脚本位置解析，不依赖 cwd —— 从任何目录调都能读到产物。 */
const ROOT = new URL('../', import.meta.url);

const REQUIRED = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];

const argOf = (name) => {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).trim() : '';
};

const CONFIRM = process.argv.includes('--yes');

/** 唯一允许的操作对象（见 wrangler.jsonc 的 NEXT_INC_CACHE_R2_BUCKET）。 */
const CACHE_BUCKET = 'nesload-next-cache';
/** 唯一允许的前缀（对应 open-next 的 `NEXT_INC_CACHE_R2_PREFIX` 默认值）；改配置要同步改这里。 */
const CACHE_PREFIX = 'incremental-cache/';

/*
 * 桶/前缀一旦被命令行或环境改成别的，直接失败退出。
 * 不静默忽略：`cf:deploy` 那头若有人加了 `--bucket=games`，应该立刻看见报错，
 * 而不是以为“清理跑了”继续往下走。
 */
const askedBucket = argOf('bucket') || process.env.NEXT_CACHE_BUCKET || '';
const askedPrefix = argOf('prefix') || process.env.NEXT_INC_CACHE_R2_PREFIX || '';
if ((askedBucket && askedBucket !== CACHE_BUCKET) || (askedPrefix && `${askedPrefix.replace(/^\/+|\/+$/g, '')}/` !== CACHE_PREFIX)) {
  console.error(`✗ 拒绝执行：本脚本只清 ${CACHE_BUCKET} 的 ${CACHE_PREFIX}，不接受自定义桶/前缀。`);
  console.error(`  收到 bucket=${askedBucket || '(默认)'} prefix=${askedPrefix || '(默认)'}`);
  process.exit(1);
}

const Bucket = CACHE_BUCKET;
const Prefix = CACHE_PREFIX;

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

function when(ms) {
  if (!ms) return '-';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 当前这一版要保留的 buildId。
 *
 * 优先 `--keep=`，否则读 `.next/BUILD_ID`（`next build` 的产物）。
 * ⚠️ 读的必须是 **Next 的 BuildId** 而不是 `.open-next` 里的什么中间文件：本项目
 *    没配 `deploymentId`，`OPEN_NEXT_BUILD_ID` 就等于它；哪天配了 `deploymentId`，
 *    这里的默认值就要跟着改（`--keep=` 永远可以手动兜底）。
 */
function resolveKeep() {
  const explicit = argOf('keep');
  if (explicit) return { id: explicit, from: '--keep' };
  for (const candidate of ['.next/BUILD_ID', '.open-next/.next/BUILD_ID']) {
    try {
      const id = readFileSync(new URL(candidate, ROOT), 'utf8').trim();
      if (id) return { id, from: candidate };
    } catch {
      /* 换下一个候选 */
    }
  }
  return { id: '', from: '' };
}

/** 全量列一次，按 `<buildId>/` 分组统计。一次扫描就能拿到目录名、对象数、体积、最近修改。 */
async function scan(client) {
  const byBuild = new Map();
  let token;
  for (;;) {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken: token, MaxKeys: 1000 })
    );
    for (const item of res.Contents ?? []) {
      if (!item.Key) continue;
      const rest = item.Key.slice(Prefix.length);
      const cut = rest.indexOf('/');
      // 前缀下直接挂着的对象（没有 buildId 那一段）不属于任何一版，留着不动
      if (cut <= 0) continue;
      const buildId = rest.slice(0, cut);
      const row = byBuild.get(buildId) ?? { count: 0, bytes: 0, lastModified: 0 };
      row.count += 1;
      row.bytes += item.Size ?? 0;
      const at = item.LastModified?.getTime() ?? 0;
      if (at > row.lastModified) row.lastModified = at;
      byBuild.set(buildId, row);
    }
    if (!res.IsTruncated) break;
    token = res.NextContinuationToken;
  }
  return byBuild;
}

/** 列出某个前缀下的**全部** key。先列完再删：边列边删会让 ContinuationToken 失效。 */
async function listKeys(client, prefix) {
  const keys = [];
  let token;
  for (;;) {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 })
    );
    for (const item of res.Contents ?? []) {
      if (item.Key) keys.push(item.Key);
    }
    if (!res.IsTruncated) break;
    token = res.NextContinuationToken;
  }
  return keys;
}

async function main() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.warn(`⚠️ 缺少 ${missing.join(', ')}，跳过缓存清理（部署本身不受影响）。`);
    console.warn('   要用这个脚本就补上 R2 凭据，例如 --env-file-if-exists=.env.local。');
    return;
  }

  const { id: keep, from } = resolveKeep();
  if (!keep) {
    console.error('✗ 拿不到当前 buildId（没有 --keep=，也没有 .next/BUILD_ID）。');
    console.error('  为避免误删正在用的缓存，这次什么都没删。');
    process.exitCode = 1;
    return;
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  const byBuild = await scan(client);
  const total = [...byBuild.values()].reduce((n, row) => n + row.count, 0);
  const bytes = [...byBuild.values()].reduce((n, row) => n + row.bytes, 0);

  console.log(`桶 ${Bucket} 的前缀 ${Prefix}：${byBuild.size} 个 buildId 目录，${total} 个对象，共 ${human(bytes)}`);
  console.log(`当前 buildId：${keep}（来自 ${from}）`);
  console.log('');
  console.log(
    'buildId'.padEnd(24) + '对象数'.padStart(8) + '体积'.padStart(12) + '  最近修改'.padStart(20)
  );

  // 最新的排前面，方便肉眼确认「保留的那个是不是真在活跃」
  const rows = [...byBuild.entries()].sort((a, b) => b[1].lastModified - a[1].lastModified);
  const doomed = [];
  for (const [buildId, row] of rows) {
    const isKeep = buildId === keep;
    if (!isKeep) doomed.push({ buildId, ...row });
    console.log(
      buildId.padEnd(24) +
        String(row.count).padStart(8) +
        human(row.bytes).padStart(12) +
        ('  ' + when(row.lastModified)).padStart(20) +
        (isKeep ? '  ← 保留' : '')
    );
  }

  if (!byBuild.has(keep)) {
    console.warn('');
    console.warn(`⚠️ 桶里没有 ${keep} 这个目录 —— 可能刚部署、缓存还没写第一条。`);
    console.warn('   其余目录仍按「旧版」处理（它们确实不该留着）。');
  }

  if (doomed.length === 0) {
    console.log('\n没有需要删除的目录。');
    return;
  }

  if (!CONFIRM) {
    console.log('');
    console.log(`这是盘点（没有删任何东西）。要删这 ${doomed.length} 个旧目录就加 --yes。`);
    return;
  }

  let done = 0;
  for (const row of doomed) {
    const prefix = `${Prefix}${row.buildId}/`;
    const keys = await listKeys(client, prefix);
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      await client.send(
        new DeleteObjectsCommand({
          Bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        })
      );
      done += batch.length;
    }
    console.log(`  已删除 ${row.buildId}（${row.count} 个对象，${human(row.bytes)}）`);
  }

  const after = await scan(client);
  const left = [...after.values()].reduce((n, row) => n + row.count, 0);
  console.log(
    `\n完成：删了 ${done} 个对象。前缀下还剩 ${after.size} 个目录 / ${left} 个对象` +
      (after.has(keep) ? `（含当前 ${keep}）` : '')
  );
}

main().catch((error) => {
  // 同样不把退出码打上去：它是 `cf:deploy` 的尾巴，部署已经成功了。
  console.error('⚠️ 缓存清理失败（不影响已完成的部署）：', error);
});
