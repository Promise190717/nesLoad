/*
 * 补开发商厂标（严格版，2026-10-20）。
 *
 * 起因：`developers.image_url` 里还有 136 行存着
 * `https://retrogamesnexus.com/images/developers/<slug>.png` —— 那批地址**上游根本没有**
 * （连 `nintendo.svg` 都是 404），前台全是破图。已有的 133 行是
 * `fill-developers-wikidata.mjs` 跑成功的：字节进 R2、库里存路径。
 * 这个脚本只干「把剩下那 136 行也补上或清掉」这一件事，判据更严：
 *
 *   · 维基搜到候选后**必须**命中 GOOD_DESC（游戏/软件/电子厂商），否则整家跳过 ——
 *     绝不回退 `list[0]`。`APE` 的第一条命中是荷兰 Apeldoorn 市，回退就会把市政府
 *     市徽当厂标传上去，比没图糟得多；
 *   · 标签与厂名至少共用一个 ≥4 字符的词（`Acclaim Studios London` ↔ 同名实体）；
 *   · 有 P154（logo）用 P154，没有用 P18（公司照片），都没有就跳过。
 *
 * 补不上的留空由上层处理（`--null-dead` 把剩余死链置 NULL，前台显示名字首字占位）。
 *
 * 用法（仓库根目录）：
 *   node --env-file=.env.local scripts/fill-developer-logos-strict.mjs --dry-run
 *   node --env-file=.env.local scripts/fill-developer-logos-strict.mjs
 *   node --env-file=.env.local scripts/fill-developer-logos-strict.mjs --null-dead
 *
 * ⚠️ 维基在国内直连不通，默认走本机代理 7897（同 fill-developers-wikidata.mjs）。
 * ⚠️ 连接池跑完全程再 end —— 中途 end 会让续跑报 closed（2026-10-20 踩过）。
 */

import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const DRY_RUN = process.argv.includes('--dry-run');
const NULL_DEAD = process.argv.includes('--null-dead');
const FIX_SVG = process.argv.includes('--fix-svg');
const NO_PROXY = process.argv.includes('--no-proxy');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.slice('--limit='.length)) : Infinity;
const rateArg = process.argv.find((arg) => arg.startsWith('--rate='));
const RATE = rateArg ? Number(rateArg.slice('--rate='.length)) : 2;

const REQUIRED = ['SUPABASE_DB_URL', 'R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_BASE'];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`缺少 ${key}，请用 --env-file=.env.local`);
    process.exit(1);
  }
}

const PROXY_URL = NO_PROXY ? null : process.env.WIKI_PROXY?.trim() || 'http://127.0.0.1:7897';
let dispatcher;
if (PROXY_URL) {
  const require = createRequire(import.meta.url);
  const pnpmDir = join(process.cwd(), 'node_modules', '.pnpm');
  const found = readdirSync(pnpmDir).filter((name) => /^undici@\d+\.\d+\.\d+/.test(name)).sort();
  const undiciDir = found.at(-1);
  if (!undiciDir) {
    console.error('node_modules/.pnpm 里找不到 undici，用 --no-proxy 或先 pnpm install');
    process.exit(1);
  }
  const { ProxyAgent } = require(join(pnpmDir, undiciDir, 'node_modules', 'undici'));
  dispatcher = new ProxyAgent(PROXY_URL);
  console.log(`HTTP 走代理 ${PROXY_URL}（限速 ${RATE}/s）`);
}

const MIN_INTERVAL = 1000 / Math.max(0.1, RATE);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let nextSlot = 0;

async function reserveSlot() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_INTERVAL;
  if (at > now) await sleep(at - now);
}

/** 限速 + 重试的请求。429 看 Retry-After；连接被掐按 1/2/4/8s 退避（代理经常 ECONNRESET）。 */
async function request(url, { binary = false, attempts = 5 } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    await reserveSlot();
    try {
      const res = await fetch(url, {
        dispatcher,
        headers: { 'user-agent': 'nesLoad-fill-logos/1.0 (contact: admin@retrogamesonline.fun)' },
        signal: AbortSignal.timeout(40_000),
      });
      if (res.ok) return binary ? new Uint8Array(await res.arrayBuffer()) : await res.json();
      if (res.status === 429) {
        const after = Number(res.headers.get('retry-after') ?? 0);
        const wait = Number.isFinite(after) && after > 0 ? after * 1000 : 10_000 * (i + 1);
        console.log(`    …429，等 ${Math.round(wait / 1000)}s`);
        await res.body?.cancel?.();
        await sleep(wait);
        continue;
      }
      if (res.status === 404) {
        await res.body?.cancel?.();
        throw new Error('HTTP 404');
      }
      await res.body?.cancel?.();
      lastError = new Error(`HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
      if (String(error?.message) === 'HTTP 404') throw error;
    }
    await sleep(1000 * 2 ** i);
  }
  throw lastError;
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

async function objectExists(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket, Key: key }));
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return false;
    throw error;
  }
}

/* ── 维基 ────────────────────────────────────────────────────────────── */

const GOOD_DESC = /game|software|entertainment|electronic|video|console|arcade|amusement|interactive/i;

const STOP = new Set(['inc', 'ltd', 'co', 'corp', 'corporation', 'company', 'the', 'and', 'of']);

function tokens(text) {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t));
}

/** 厂名与实体标签至少共用一个 ≥4 字符的词，避免「同名不同行」。 */
function labelMatches(name, label) {
  const a = tokens(name);
  const b = new Set(tokens(label));
  if (a.length === 0 || b.size === 0) return false;
  return a.some((t) => t.length >= 4 && b.has(t));
}

async function searchEntity(name) {
  const data = await request(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&limit=8&search=${encodeURIComponent(name)}`
  );
  for (const item of data.search ?? []) {
    if (!GOOD_DESC.test(item.description ?? '')) continue;
    if (!labelMatches(name, item.label ?? '')) continue;
    return { id: item.id, label: item.label ?? '', desc: item.description ?? '' };
  }
  return null;
}

async function entityClaims(id) {
  const data = await request(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims|labels&ids=${id}`
  );
  return data.entities?.[id] ?? null;
}

async function fileUrlOf(fileTitle) {
  const title = `File:${fileTitle}`;
  for (const host of ['commons.wikimedia.org', 'en.wikipedia.org']) {
    try {
      const data = await request(
        `https://${host}/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|mime&titles=${encodeURIComponent(title)}`
      );
      const page = Object.values(data.query?.pages ?? {})[0];
      const info = page?.imageinfo?.[0];
      if (info?.url) return { url: info.url, mime: info.mime ?? '' };
    } catch {
      /* 换下一个 host */
    }
  }
  return null;
}

const EXT_BY_MIME = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/**
 * 把 svg 里的内部 DTD 实体展开掉，再删 `<!DOCTYPE …>`。
 *
 * 为什么必须动：Adobe Illustrator 导出的 svg 会写 `xmlns="&ns_svg;"`
 * 加一段 `<!ENTITY ns_svg "http://www.w3.org/2000/svg">`，Chromium 渲染 svg 图片时
 * **不处理 DTD 实体**，整张图直接变破图（2026-10-20 的 ea-games.svg 就是这样）。
 * 栅格图原样返回。
 */
function normalizeSvg(bytes) {
  const text = new TextDecoder().decode(bytes);
  if (!/<!ENTITY/i.test(text)) return bytes;

  const entities = new Map();
  for (const m of text.matchAll(/<!ENTITY\s+([\w.-]+)\s+(?:"([^"]*)"|'([^']*)')\s*>/g)) {
    entities.set(m[1], m[2] ?? m[3] ?? '');
  }
  let out = text.replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/g, '');
  out = out.replace(/&([\w.-]+);/g, (whole, name) =>
    entities.has(name) ? entities.get(name) : whole
  );
  return new TextEncoder().encode(out);
}

/* ── 主流程 ──────────────────────────────────────────────────────────── */

const stats = { scanned: 0, uploaded: 0, exists: 0, noMatch: 0, noLogo: 0, failed: 0, nulled: 0 };
const failures = [];
const leftovers = [];

async function main() {
  if (FIX_SVG) return fixSvgs();

  const rows = await sql.unsafe(`
    SELECT d.slug,
           d.image_url,
           COALESCE(t_en.name, t_zh.name, d.slug) AS search_name
      FROM developers d
      LEFT JOIN developer_texts t_en ON t_en.developer_slug = d.slug AND t_en.locale = 'en'
      LEFT JOIN developer_texts t_zh ON t_zh.developer_slug = d.slug AND t_zh.locale = 'zh'
     WHERE d.image_url IS NOT NULL AND d.image_url NOT LIKE '/%'
     ORDER BY d.slug
  `);

  console.log(
    `待处理 ${rows.length} 行死链（${DRY_RUN ? 'dry-run' : '真跑'}，上限 ${Number.isFinite(LIMIT) ? LIMIT : '∞'}）`
  );

  const slice = NULL_DEAD ? [] : rows.slice(0, Number.isFinite(LIMIT) ? LIMIT : rows.length);

  for (const row of slice) {
    stats.scanned += 1;
    const kept = await fillOne(row);
    if (!kept) leftovers.push(row.slug);
    if (stats.scanned % 20 === 0) {
      console.log(
        `  …${stats.scanned}/${slice.length}（上传 ${stats.uploaded}，跳过 ${stats.noMatch + stats.noLogo}，失败 ${stats.failed}）`
      );
    }
  }

  if (NULL_DEAD) {
    const res = await sql.unsafe(
      `UPDATE developers SET image_url = NULL WHERE image_url IS NOT NULL AND image_url NOT LIKE '/%' RETURNING slug`
    );
    stats.nulled = res.length;
    console.log(`\n清空剩余死链 ${stats.nulled} 行（前台改用名字首字占位）`);
  }

  console.log('\n==== 结果 ====');
  console.log(
    `扫描 ${stats.scanned} · 上传 ${stats.uploaded} · 已有对象 ${stats.exists} · 搜不到实体 ${stats.noMatch} · ` +
      `没有图 ${stats.noLogo} · 失败 ${stats.failed}${NULL_DEAD ? ` · 置空 ${stats.nulled}` : ''}`
  );
  for (const failure of failures.slice(0, 30)) console.log(`  ✗ ${failure}`);
  if (failures.length > 30) console.log(`  …（还有 ${failures.length - 30} 条）`);
  await sql.end();
}

/**
 * `--fix-svg`：只修「已经在 R2 上、但浏览器渲染不出来」的 svg（DTD 实体那一类）。
 * 从 R2 取回字节 → `normalizeSvg()` 展开实体 → 覆盖同一个键。库里的值不用动。
 */
async function fixSvgs() {
  const base = process.env.R2_PUBLIC_BASE.replace(/\/+$/, '');
  const rows = await sql.unsafe(
    "SELECT slug, image_url FROM developers WHERE image_url LIKE '/%' AND image_url ILIKE '%.svg' ORDER BY slug"
  );
  let fixed = 0;
  for (const row of rows) {
    const res = await fetch(base + row.image_url, { signal: AbortSignal.timeout(25_000) });
    if (!res.ok) {
      console.log(`  ✗ ${row.slug} HTTP ${res.status}`);
      continue;
    }
    const text = await res.text();
    if (!/<!ENTITY/i.test(text)) continue;
    const bytes = normalizeSvg(new TextEncoder().encode(text));
    const key = row.image_url.replace(/^\/+/, '').split('/').map(decodeURIComponent).join('/');
    if (DRY_RUN) {
      console.log(`  [dry] ${row.slug} → 展开实体（${text.length}B → ${bytes.length}B）`);
      fixed += 1;
      continue;
    }
    await r2.send(
      new PutObjectCommand({
        Bucket,
        Key: key,
        Body: bytes,
        ContentType: 'image/svg+xml',
        CacheControl: 'public, max-age=2592000',
      })
    );
    fixed += 1;
    console.log(`  ✓ ${row.slug} 已就地修好（${text.length}B → ${bytes.length}B）`);
  }
  console.log(`\n检查 ${rows.length} 个 svg，修好 ${fixed} 个${DRY_RUN ? '（dry-run）' : ''}`);
  await sql.end();
}

/** 返回 true = 这家已经有可用图（上传成功 / 对象已在 R2）。 */
async function fillOne(row) {
  let hit;
  try {
    hit = await searchEntity(row.search_name);
  } catch (error) {
    stats.failed += 1;
    failures.push(`${row.slug}: 搜索失败 ${error.message}`);
    return false;
  }
  if (!hit) {
    stats.noMatch += 1;
    return false;
  }

  let entity;
  try {
    entity = await entityClaims(hit.id);
  } catch (error) {
    stats.failed += 1;
    failures.push(`${row.slug}: 取实体失败 ${error.message}`);
    return false;
  }
  const file =
    entity?.claims?.P154?.[0]?.mainsnak?.datavalue?.value ??
    entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!file || typeof file !== 'string') {
    stats.noLogo += 1;
    return false;
  }

  try {
    const info = await fileUrlOf(file);
    if (!info?.url) {
      stats.noLogo += 1;
      return false;
    }
    const ext = EXT_BY_MIME[info.mime] ?? info.url.split('.').pop()?.split('?')[0] ?? 'png';
    const key = `images/developers/${row.slug}.${ext}`;
    const path = `/${key}`;

    if (DRY_RUN) {
      console.log(`  [dry] ${row.slug} ← ${hit.label}（${hit.id}）${file}`);
      return true;
    }

    if (await objectExists(key)) {
      stats.exists += 1;
    } else {
      let bytes = await request(info.url, { binary: true });
      if (!bytes?.length) {
        stats.noLogo += 1;
        return false;
      }
      let contentType = info.mime || 'image/png';
      if (ext === 'svg') {
        bytes = normalizeSvg(bytes);
        contentType = 'image/svg+xml';
      }
      await r2.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
          CacheControl: 'public, max-age=2592000',
        })
      );
      stats.uploaded += 1;
    }

    await sql.unsafe('UPDATE developers SET image_url = $1 WHERE slug = $2', [path, row.slug]);
    console.log(`  ✓ ${row.slug} ← ${hit.label}（${file}）`);
    return true;
  } catch (error) {
    stats.failed += 1;
    failures.push(`${row.slug}: ${error.message}`);
    return false;
  }
}

main().catch(async (error) => {
  console.error('失败：', error);
  await sql.end().catch(() => {});
  process.exit(1);
});
