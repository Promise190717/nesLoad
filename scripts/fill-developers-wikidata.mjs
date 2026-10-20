/*
 * 从维基数据 / 维基百科补开发商的**厂标**与**多语言介绍**（2026-10-20，v2）。
 *
 * 背景：developers.image_url 存的上游地址（/images/developers/*.png）是**死链**（上游 404），
 * 且上游没有开发商详情页；四语言介绍里 71 家全语言缺 description。这两样都从维基找：
 *
 *   ① 维基数据按英文厂名搜实体（wbsearchentities）→ P154（logo）/ P18（图片）→
 *      imageinfo 换直链（Commons 优先，非自由文件回 en.wikipedia）→ 字节传 R2
 *      （键 `images/developers/<slug>.<ext>`，库 `image_url` 写路径，与 media.ts 约定一致）；
 *   ② 实体的各语言维基站点链接 → REST summary 的首段 extract → 只填**空着**的 description。
 *      2026-10-20 起覆盖**全部 18 种内容语言**（原先把 zh/en/ja/ko 写死在 `WIKI_SITES` 里，
 *      长尾语言永远补不上，前端回退链只能一路掉到中文 —— 见 `WIKI_SITES` 那段注释）。
 *
 * v2 与 v1 的差别（v1 被维基 429 掐到跑不完）：
 *   · **实体信息批量取**：wbgetentities 一次 50 个 id（269 家 ≈ 6 个请求）；
 *   · **全局限速**：所有外网请求过同一道闸，默认 2 次/秒，`--rate=0.5` 放慢；
 *   · **429 看重试头**：Retry-After 是多少就睡多少，不再瞎猜；
 *   · 阶段化：先全部搜索 → 批量实体 → 逐家厂标 → 逐家介绍，中断重跑幂等续上。
 *
 * 用法（仓库根目录）：
 *   node --env-file=.env.local scripts/fill-developers-wikidata.mjs --dry-run
 *   node --env-file=.env.local scripts/fill-developers-wikidata.mjs
 *   node --env-file=.env.local scripts/fill-developers-wikidata.mjs --limit=10
 *   node --env-file=.env.local scripts/fill-developers-wikidata.mjs --no-proxy
 *   node --env-file=.env.local scripts/fill-developers-wikidata.mjs --slug=igs,ape,g-craft
 *
 * `--slug=` 只跑点名的几家（逗号分隔）。补某个语言的缺口时用它：全量 269 家 × 18 种语言
 * 在 2 次/秒的闸下要跑一小时，而缺口往往只有十几家。
 *
 * ⚠️ 维基在国内直连不通 —— 默认走本机代理（Clash 混合端口 7897），undici ProxyAgent
 *    从 node_modules/.pnpm 现找（项目根没装这个包）。
 * ⚠️ 搜索是「英文名 → 实体」自动匹配，个别小厂可能认错实体 —— dry-run 先过一眼。
 */

import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const DRY_RUN = process.argv.includes('--dry-run');
const NO_PROXY = process.argv.includes('--no-proxy');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.slice('--limit='.length)) : Infinity;
/** 只跑点名的 slug（逗号分隔）；空 = 全量 */
const slugArg = process.argv.find((arg) => arg.startsWith('--slug='));
const ONLY = slugArg
  ? slugArg.slice('--slug='.length).split(',').map((s) => s.trim()).filter(Boolean)
  : null;
const rateArg = process.argv.find((arg) => arg.startsWith('--rate='));
/** 每秒最多几个外网请求（维基对突发很敏感，2/s 实测稳） */
const RATE = rateArg ? Number(rateArg.slice('--rate='.length)) : 2;

const REQUIRED = ['SUPABASE_DB_URL', 'R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`缺少 ${key}，请用 --env-file=.env.local`);
    process.exit(1);
  }
}

/* ── 代理 + 全局限速 ─────────────────────────────────────────────────── */

const PROXY_URL = NO_PROXY ? null : process.env.WIKI_PROXY?.trim() || 'http://127.0.0.1:7897';

let dispatcher;
if (PROXY_URL) {
  const require = createRequire(import.meta.url);
  const pnpmDir = join(process.cwd(), 'node_modules', '.pnpm');
  let undiciDir;
  try {
    const found = readdirSync(pnpmDir).filter((name) => /^undici@\d+\.\d+\.\d+/.test(name)).sort();
    undiciDir = found.at(-1);
    if (!undiciDir) throw new Error('没找到');
  } catch {
    console.error(`node_modules/.pnpm 里找不到 undici（${pnpmDir}）。要么 pnpm install 一遍，要么 --no-proxy 直连。`);
    process.exit(1);
  }
  const { ProxyAgent } = require(join(pnpmDir, undiciDir, 'node_modules', 'undici'));
  dispatcher = new ProxyAgent(PROXY_URL);
  console.log(`HTTP 走代理 ${PROXY_URL}（undici ${undiciDir}，限速 ${RATE}/s）`);
}

const MIN_INTERVAL = 1000 / Math.max(0.1, RATE);
let nextSlot = 0;

/** 全局限速：拿一个不早于 nextSlot 的时刻，睡到点再把 nextSlot 往后推。 */
function reserveSlot() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_INTERVAL;
  return sleep(at - now);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 限速 + 重试的 fetch。429 优先看 Retry-After；网络错 1s/2s/4s 退避。 */
async function request(url, { binary = false } = {}) {
  let lastError;
  for (let i = 0; i < 4; i += 1) {
    await reserveSlot();
    try {
      const res = await fetch(url, {
        dispatcher,
        headers: { 'user-agent': 'nesLoad-fill-developers/2.0 (contact: admin@retrogamesonline.fun)' },
        signal: AbortSignal.timeout(40_000),
      });
      if (res.ok) return binary ? new Uint8Array(await res.arrayBuffer()) : await res.json();
      if (res.status === 429) {
        const after = Number(res.headers.get('retry-after') ?? 0);
        const wait = Number.isFinite(after) && after > 0 ? after * 1000 : 10_000 * (i + 1);
        console.log(`    …429 限流，等 ${Math.round(wait / 1000)}s`);
        await sleep(wait);
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
      if (String(error?.message).startsWith('HTTP 4')) throw error; // 4xx 别硬撞
      await sleep(1000 * 2 ** i);
    }
  }
  throw lastError;
}

/* ── 数据库 / R2 ─────────────────────────────────────────────────────── */

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

/* ── 维基数据 ────────────────────────────────────────────────────────── */

/**
 * 补哪些语言 × 对应的维基站点：`本站 locale → [维基数据的 sitelink 键, 站点子域名]`。
 *
 * ⚠️ 两件事**必须分开写**，不能拿 locale 直接拼域名：
 *    · `fil`（本站）在维基上叫 `tl`（Tagalog），`tl.wikipedia.org`；`fil.wikipedia.org` 不存在；
 *    · `zh-TW` 没有独立维基，直接取 `zh` 的正文（要的是同一段文字，只是站点语言标记不同）。
 *
 * 2026-10-20 从 4 种扩到 18 种。起因：开发商介绍漏中文 —— 回退链是
 * 「目标语言 → en → zh」，13 家在 en 也缺，于是印地语页面正文掉出中文原文。
 * 只补 4 种时这些长尾语言永远补不上，回退必然踩到中文。
 */
const WIKI_SITES = {
  zh: ['zhwiki', 'zh'],
  'zh-TW': ['zhwiki', 'zh'],
  en: ['enwiki', 'en'],
  ja: ['jawiki', 'ja'],
  ko: ['kowiki', 'ko'],
  de: ['dewiki', 'de'],
  es: ['eswiki', 'es'],
  fr: ['frwiki', 'fr'],
  hi: ['hiwiki', 'hi'],
  id: ['idwiki', 'id'],
  it: ['itwiki', 'it'],
  ms: ['mswiki', 'ms'],
  nl: ['nlwiki', 'nl'],
  fil: ['tlwiki', 'tl'],
  pt: ['ptwiki', 'pt'],
  ru: ['ruwiki', 'ru'],
  th: ['thwiki', 'th'],
  vi: ['viwiki', 'vi'],
};
/** 顺序即补的顺序（短语言先跑，先让 4 种主力语言落库） */
const WIKI_LOCALES = Object.keys(WIKI_SITES);
/** 实体描述含这些词才算「游戏/电子厂商」——重名时兜着点 */
const GOOD_DESC = /game|software|entertainment|electronic|video|console|arcade|amusement|interactive/i;

async function findEntityId(name) {
  const data = await request(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&limit=5&search=${encodeURIComponent(name)}`
  );
  const list = data.search ?? [];
  if (list.length === 0) return null;
  const good = list.find((item) => GOOD_DESC.test(item.description ?? ''));
  return { id: (good ?? list[0]).id, desc: (good ?? list[0]).description ?? '' };
}

/** 批量取实体（50 个一次），回 `Map<QID, entity>`。 */
async function loadEntities(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const data = await request(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks|claims&ids=${chunk.join('|')}`
    );
    for (const [id, entity] of Object.entries(data.entities ?? {})) out.set(id, entity);
  }
  return out;
}

/** imageinfo：文件名 → 直链 + mime。Commons 没有（非自由文件挂 enwp）就换英文维基。 */
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

/** `host` 是**站点子域名**（tl / zh / en…），不是本站 locale —— 见 `WIKI_SITES`。 */
async function summaryOf(host, title) {
  const data = await request(
    `https://${host}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  );
  return (data.extract ?? '').trim();
}

/* ── 单家 ────────────────────────────────────────────────────────────── */

const EXT_BY_MIME = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const stats = { logoUploaded: 0, logoSkipped: 0, descFilled: 0, noEntity: 0, noLogo: 0, failed: 0 };
const failures = [];

async function fillLogo(row, entity) {
  if (row.imagePath) return;
  const file =
    entity.claims?.P154?.[0]?.mainsnak?.datavalue?.value ??
    entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!file || typeof file !== 'string') {
    stats.noLogo += 1;
    return;
  }
  try {
    const info = await fileUrlOf(file);
    const ext = info ? (EXT_BY_MIME[info.mime] ?? info.url.split('.').pop()?.split('?')[0] ?? 'png') : null;
    if (!info || !ext) {
      stats.noLogo += 1;
      return;
    }
    const key = `images/developers/${row.slug}.${ext}`;
    if (DRY_RUN) {
      console.log(`  [dry] ${row.slug} ← ${file} → /${key}`);
    } else {
      if (await objectExists(key)) {
        stats.logoSkipped += 1;
      } else {
        const bytes = await request(info.url, { binary: true });
        await r2.send(
          new PutObjectCommand({
            Bucket,
            Key: key,
            Body: bytes,
            ContentType: info.mime || 'image/png',
            CacheControl: 'public, max-age=2592000',
          })
        );
        stats.logoUploaded += 1;
      }
      // 对象已在 R2（之前跑过）也要把库里那条死链刷成本站路径
      await sql.unsafe('UPDATE developers SET image_url = $1 WHERE slug = $2', [`/${key}`, row.slug]);
    }
  } catch (error) {
    stats.failed += 1;
    failures.push(`${row.slug}: 厂标失败 ${error.message}`);
  }
}

async function fillTexts(row, entity) {
  const sitelinks = entity.sitelinks ?? {};
  for (const locale of WIKI_LOCALES) {
    if (!row.missingLocales.includes(locale)) continue;
    const [site, host] = WIKI_SITES[locale];
    const title = sitelinks[site]?.title;
    if (!title) continue;
    try {
      const extract = await summaryOf(host, title);
      if (!extract) continue;
      if (DRY_RUN) {
        console.log(`  [dry] ${row.slug} ← ${locale}（${site}:${title}）${extract.slice(0, 40)}…`);
      } else {
        await sql.unsafe(
          `INSERT INTO developer_texts (developer_slug, locale, name, summary, description, updated_at)
           VALUES ($1, $2, NULL, NULL, $3, now())
           ON CONFLICT (developer_slug, locale) DO UPDATE SET
             description = COALESCE(NULLIF(developer_texts.description, ''), excluded.description),
             updated_at = now()`,
          [row.slug, locale, extract]
        );
      }
      stats.descFilled += 1;
    } catch (error) {
      failures.push(`${row.slug}: ${locale} 介绍失败 ${error.message}`);
    }
  }
}

/* ── 主流程 ──────────────────────────────────────────────────────────── */

async function main() {
  console.log(`补开发商厂标 + 介绍 v2（${DRY_RUN ? 'dry-run' : '真跑'}，上限 ${Number.isFinite(LIMIT) ? LIMIT : '∞'}）`);

  const rows = await sql.unsafe(`
    SELECT d.slug,
           d.image_url,
           COALESCE(t_en.name, t_zh.name) AS search_name
      FROM developers d
      LEFT JOIN developer_texts t_en ON t_en.developer_slug = d.slug AND t_en.locale = 'en'
      LEFT JOIN developer_texts t_zh ON t_zh.developer_slug = d.slug AND t_zh.locale = 'zh'
     ORDER BY d.slug
  `);

  /*
   * 哪些家已经有哪个语言的介绍 —— 一次全表捞，别按家查 18 次。
   *
   * 2026-10-20 从「只看 zh/en/ja/ko 四列」改成这个：语言扩到 18 种之后，
   * 「这家还缺哪几段」只能靠集合差算，写死四列会让长尾语言每跑一次都重补一遍。
   */
  const descRows = await sql.unsafe(
    `SELECT developer_slug, locale FROM developer_texts
      WHERE description IS NOT NULL AND description <> ''`
  );
  const filledBySlug = new Map();
  for (const r of descRows) {
    if (!filledBySlug.has(r.developer_slug)) filledBySlug.set(r.developer_slug, new Set());
    filledBySlug.get(r.developer_slug).add(r.locale);
  }

  const jobs = rows
    .filter((row) => !ONLY || ONLY.includes(row.slug))
    .map((row) => {
      const filled = filledBySlug.get(row.slug) ?? new Set();
      return {
        slug: row.slug,
        searchName: row.search_name ?? row.slug,
        imagePath: row.image_url?.startsWith('/') ?? false,
        filled,
        missingLocales: WIKI_LOCALES.filter((locale) => !filled.has(locale)),
      };
    });

  /** 图与介绍都齐的没必要跑（幂等重跑省时间） */
  const pending = jobs.filter(
    (job) => (!job.imagePath || job.missingLocales.length > 0) && stats.scannedGuard()
  );
  console.log(
    `共 ${jobs.length} 家${ONLY ? `（--slug 指定 ${ONLY.length} 个）` : ''}，待补 ${pending.length} 家`
  );

  /* ① 搜索（每家一个请求，认不出的记下来跳过） */
  const resolved = new Map();
  let done = 0;
  for (const job of pending.slice(0, Number.isFinite(LIMIT) ? LIMIT : pending.length)) {
    try {
      const hit = await findEntityId(job.searchName);
      if (hit) resolved.set(job.slug, hit);
      else stats.noEntity += 1;
    } catch (error) {
      stats.failed += 1;
      failures.push(`${job.slug}: 搜索失败 ${error.message}`);
    }
    done += 1;
    if (done % 50 === 0) console.log(`  …搜索 ${done}/${Math.min(pending.length, LIMIT)}`);
  }

  /* ② 批量取实体 */
  const ids = [...new Set([...resolved.values()].map((hit) => hit.id))];
  console.log(`搜到 ${resolved.size} 家，批量取 ${ids.length} 个实体…`);
  const entities = await loadEntities(ids);

  /* ③④ 厂标 + 介绍（逐家串行 —— 有全局限速，并行没意义只会招 429） */
  let processed = 0;
  for (const job of pending.slice(0, Number.isFinite(LIMIT) ? LIMIT : pending.length)) {
    const hit = resolved.get(job.slug);
    const entity = hit ? entities.get(hit.id) : null;
    if (!entity) continue;
    await fillLogo(job, entity);
    await fillTexts(job, entity);
    processed += 1;
    if (processed % 20 === 0) {
      console.log(
        `  …进度 ${processed}/${pending.length}（厂标 +${stats.logoUploaded}，介绍 +${stats.descFilled}）`
      );
    }
  }

  console.log('\n==== 结果 ====');
  console.log(
    `待补 ${pending.length}（处理 ${processed}）· 厂标上传 ${stats.logoUploaded}（已存在跳过 ${stats.logoSkipped}）· ` +
      `介绍补 ${stats.descFilled} 段 · 没找到实体 ${stats.noEntity} · 没有厂标图 ${stats.noLogo} · 失败 ${stats.failed}`
  );
  for (const failure of failures.slice(0, 40)) console.log(`  ✗ ${failure}`);
  if (failures.length > 40) console.log(`  …（还有 ${failures.length - 40} 条）`);

  await sql.end();
}

/* 占位守卫（LIMIT 截断用，读着别误会 —— pending 切片已经在 main 里做了） */
stats.scannedGuard = () => true;

main().catch(async (error) => {
  console.error('失败：', error);
  await sql.end().catch(() => {});
  process.exit(1);
});
