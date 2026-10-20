/*
 * 把库里引用的游戏图片搬进本站 R2，并把 `image_url` 统一成**不含域名的路径**（2026-10-20）。
 *
 * 背景：`games / consoles / developers / series` 四张表的 `image_url` 里存的全是
 * **上游绝对地址**（`https://retrogamesnexus.com/images/...`），前台等于全部回源站取图。
 * 现在约定「库里只存路径、域名渲染时现拼」（见 `lib/server/media.ts`），字节要落在
 * 本站 R2 上 —— 这个脚本就是那次搬迁（以后上游换域名 / 挂了都不影响本站）。
 *
 * 键与路径**逐字对齐**：库里路径 `/images/games/cover/nes/contra.webp`
 * → R2 键 `images/games/cover/nes/contra.webp`，`mediaUrl()` 现拼 `R2_PUBLIC_BASE` 后
 * 正好是这张图 —— 所以搬迁只做两件事：
 *   ① 把上游那张图按同路径传进 R2（已存在就跳过，`--force` 才重传）；
 *   ② 把 `image_url` 改成路径（已经是不是域名的路径就不动）。
 *
 * 用法（仓库根目录）：
 *   node --env-file=.env.local scripts/sync-images-to-r2.mjs --dry-run          # 只看不动
 *   node --env-file=.env.local scripts/sync-images-to-r2.mjs                    # 全量搬
 *   node --env-file=.env.local scripts/sync-images-to-r2.mjs --only=games       # 只搬某几张表
 *   node --env-file=.env.local scripts/sync-images-to-r2.mjs --force            # 对象已存在也重传
 *   node --env-file=.env.local scripts/sync-images-to-r2.mjs --limit=20         # 先小批量试
 *
 * 幂等：对象存在（HeadObject 命中）就不下载；库里已是路径就不更新 —— 跑几遍结果一样。
 */

import postgres from 'postgres';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.slice('--limit='.length)) : Infinity;
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
/** `--only=games,consoles` → ['games','consoles']；空 = 四张表都搬 */
const ONLY = new Set(
  (onlyArg?.slice('--only='.length) ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
);

const REQUIRED = [
  'SUPABASE_DB_URL',
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

const UPSTREAM_SITE = 'https://retrogamesnexus.com';
const UPSTREAM_FILES = 'https://files.retrogamesnexus.com';
const PUBLIC_BASE = process.env.R2_PUBLIC_BASE.replace(/\/+$/, '');

/** 并发数。下载是 I/O 等待，串行 2682 张要一个多小时；6 路并发十分钟级。 */
const CONCURRENCY = 6;

/** 认得这些 host 的绝对地址才敢剥成路径（别的域名剥了就 404，宁可留着报警）。 */
function knownHosts() {
  const hosts = ['retrogamesnexus.com', 'files.retrogamesnexus.com'];
  try {
    hosts.push(new URL(PUBLIC_BASE).hostname.toLowerCase());
  } catch {
    /* 配错就只认上游两个 */
  }
  return hosts;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const CONTENT_TYPES = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
};

function contentTypeFor(key, fallback) {
  const type = (fallback ?? '').split(';')[0].trim();
  if (type.startsWith('image/')) return type;
  const ext = key.split('.').pop()?.toLowerCase();
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', prepare: false, max: 1 });

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const Bucket = process.env.R2_BUCKET;

const stats = { scanned: 0, uploaded: 0, exists: 0, dbUpdated: 0, skipped: 0, failed: 0 };
const failures = [];

/** 库里那格值 → { path, sourceUrl }；搬不动的返回 null（reason 说明为什么）。 */
function normalize(value) {
  const text = (value ?? '').trim();
  if (!text) return null;

  if (/^https?:\/\//i.test(text)) {
    let url;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    if (!knownHosts().includes(url.hostname.toLowerCase())) return null;
    // 上游 path 是百分号编码形态；库里统一存**解码后**的路径（mediaUrl 渲染时再编码）
    const path = safeDecode(url.pathname);
    return { path, sourceUrl: `${url.origin}${url.pathname}${url.search}` };
  }

  // 已经是路径 / 裸键：源地址按上游目录结构现拼（键与上游逐字对齐，见文件头）
  const path = text.startsWith('/') ? text : `/${text}`;
  const origin = path.startsWith('/images/roms/') ? UPSTREAM_FILES : UPSTREAM_SITE;
  return { path, sourceUrl: `${origin}${encodeURI(path)}` };
}

async function objectExists(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket, Key: key }));
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return false;
    throw error;
  }
}

async function download(sourceUrl, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(sourceUrl, {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
          accept: 'image/*,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get('content-type');
      return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: type };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw lastError;
}

/**
 * 四张表一张搬法。`pk` 是主键列名（更新 `image_url` 时用）。
 * 返回该表要搬的清单：{ table, pk, id, path, sourceUrl }[]。
 */
const TABLES = [
  { table: 'games', pk: 'slug' },
  { table: 'consoles', pk: 'console_type' },
  { table: 'developers', pk: 'slug' },
  { table: 'series', pk: 'slug' },
];

async function main() {
  if (!Number.isFinite(LIMIT) || LIMIT > 0) {
    console.log(
      `同步图片 → R2（${DRY_RUN ? 'dry-run' : '真跑'}，上限 ${Number.isFinite(LIMIT) ? LIMIT : '∞'}）`
    );
  }

  for (const { table, pk } of TABLES) {
    if (ONLY.size && !ONLY.has(table)) continue;

    const rows = await sql.unsafe(
      `SELECT ${pk} AS id, image_url FROM ${table} WHERE image_url IS NOT NULL ORDER BY ${pk}`
    );
    console.log(`\n== ${table}：${rows.length} 行有图 ==`);

    /*
     * 简单的 worker 池：CONCURRENCY 个工人从队列里领行，领完为止。
     * `stats.scanned >= LIMIT` 是全局闸（--limit 是「总共搬几行」，不是每张表几行）。
     */
    let cursor = 0;
    async function worker() {
      for (;;) {
        const index = cursor;
        if (index >= rows.length || stats.scanned >= LIMIT) return;
        cursor += 1;
        await syncRow(table, pk, rows[index]);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  }

  await finish();
}

async function syncRow(table, pk, row) {
  stats.scanned += 1;

  const target = normalize(row.image_url);
  if (!target) {
    stats.skipped += 1;
    failures.push({ table, id: row.id, reason: `认不出的地址：${row.image_url}` });
    return;
  }

  const key = target.path.replace(/^\/+/, '');
  const dbNeedsUpdate = row.image_url !== target.path;

  try {
    if (!FORCE && (await objectExists(key))) {
      stats.exists += 1;
    } else if (DRY_RUN) {
      console.log(`  [dry] 传 ${key}`);
    } else {
      const { bytes, contentType } = await download(target.sourceUrl);
      await r2.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: bytes,
          ContentType: contentTypeFor(key, contentType),
          CacheControl: 'public, max-age=2592000', // 图片基本不变，让 CDN / 浏览器缓存满 30 天
        })
      );
      stats.uploaded += 1;
      if (stats.uploaded % 50 === 0) {
        console.log(`  …已上传 ${stats.uploaded} 张`);
      }
    }
  } catch (error) {
    stats.failed += 1;
    failures.push({ table, id: row.id, reason: `R2/下载失败：${error.message}` });
    return;
  }

  if (dbNeedsUpdate) {
    if (DRY_RUN) {
      console.log(`  [dry] 改库 ${table}.${pk}=${row.id} → ${target.path}`);
    } else {
      // ⚠️ `sql.unsafe` 不会把 `?` 转成 `$n`（那是 lib/server/pg.ts 里 query() 干的事），
      //    这里必须写 `$1` / `$2`，否则 Postgres 直接语法错（42601）。
      await sql.unsafe(`UPDATE ${table} SET image_url = $1 WHERE ${pk} = $2`, [
        target.path,
        row.id,
      ]);
    }
    stats.dbUpdated += 1;
  }
}

async function finish() {
  console.log('\n==== 结果 ====');
  console.log(
    `扫描 ${stats.scanned} · 上传 ${stats.uploaded} · 已存在跳过 ${stats.exists} · ` +
      `改库 ${stats.dbUpdated} · 跳过 ${stats.skipped} · 失败 ${stats.failed}`
  );
  for (const failure of failures.slice(0, 50)) {
    console.log(`  ✗ ${failure.table}/${failure.id}: ${failure.reason}`);
  }
  if (failures.length > 50) console.log(`  …（还有 ${failures.length - 50} 条没列）`);
  await sql.end();
}

main().catch(async (error) => {
  console.error('同步失败：', error);
  await sql.end().catch(() => {});
  process.exit(1);
});
