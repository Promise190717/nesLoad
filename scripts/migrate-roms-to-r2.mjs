/*
 * 把上游的 ROM 搬进本站 R2，并把 `game_roms.source_url` 改成 `r2:` 形态（2026-10-20）。
 *
 * ## 为什么要搬
 *
 * 现在库里 4047 份 ROM **一份都不在自己手上**（`files:` 3676 / `site:` 371），
 * 前台每次开局都是 Worker 回源上游、穿过别人家的 Cloudflare WAF —— 被 challenge 时
 * 用户只看到「上游要求浏览器验证」（见 `lib/server/rom-upstream.ts`），而且这条路的
 * 可用性完全由上游的脸色决定（换接入点 / 换国家就可能被挡）。
 * 落进本站 R2 之后：`app/api/games/[id]/rom` 走 `selfHosted` 分支，不碰上游、没有
 * challenge、没有兼容重试，出口只有 `files.retrogamesbox.com`。
 *
 * ## 范围
 *
 * 默认**排除 `gba` / `nds` / `ps1`**：NDS 常见 128/256 MB、PS1 光盘镜像更大，
 * GBA 一千多款平均 3~4 MB（合计 4 GiB 上下），这三台先不搬。要搬就显式
 * `--console=gba`（会覆盖默认排除表）。
 *
 * 2026-10-20 先搬完 arcade / nes / snes；2026-10-21 按用户要求补上
 * md / gbc / gb / gg / sms / ws / 32x / ngp（323 行，合计 ~330 MiB）。
 *
 * ⚠️ md 的卡带扩展名是 `.md`，上游按 `text/markdown` 回（不带 content-length），
 *    见 `downloadRom` 上面那段注释 —— 判据不能写成「一律拒 text/*」。
 *
 * ## 键怎么定
 *
 *   `roms/<机种>/<game_slug>-<language><扩展名>`   例：`roms/gba/pokemon-fire-red-zh.gba`
 *
 * 确定性键（不含 uuid / 时间戳）是为了**可断点续跑**：第二次跑先 `HeadObject`，
 * 对象在就只补数据库，不重新下载。
 * ⚠️ 也正因为键不含内容 hash，**同一个 (game, language) 换了 ROM 不能覆盖同名键**
 *    —— R2 公网域按 `max-age=2592000` 缓存 30 天，边缘会继续发旧字节（见
 *    `.workbuddy/memory/MEMORY.md` 的那条规矩）。换文件请改键名（后缀 `-v2`）。
 *
 * ## 用法（仓库根目录）
 *
 *   node --env-file=.env.local scripts/migrate-roms-to-r2.mjs --dry-run
 *   node --env-file=.env.local scripts/migrate-roms-to-r2.mjs --console=nes --limit=3
 *   node --env-file=.env.local scripts/migrate-roms-to-r2.mjs                 # 全量（默认排除 gba/nds/ps1）
 *   node --env-file=.env.local scripts/migrate-roms-to-r2.mjs --concurrency=4
 *   node --env-file=.env.local scripts/migrate-roms-to-r2.mjs --force         # 对象在也重传
 *
 * 幂等：对象已存在 → 跳过上传；`source_url` 已是 `r2:` → 整行跳过。跑几遍结果一致。
 * 中断直接重跑即可（已完成的行不会重做）。
 */

import { Readable } from 'node:stream';
import postgres from 'postgres';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/* ── 参数 ─────────────────────────────────────────────────────────────── */

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const flag = (name, fallback) => {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const LIMIT = Number(flag('limit', '0')) || Infinity;
const CONCURRENCY = Math.max(1, Number(flag('concurrency', '3')) || 3);
const ONLY = new Set(
  flag('console', '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
);
/** 默认不搬的机种；`--console=` 给了就以它为准。 */
const DEFAULT_EXCLUDE = new Set(['gba', 'nds', 'ps1']);

const UPSTREAM_SITE = 'https://retrogamesnexus.com';
const UPSTREAM_FILES = 'https://files.retrogamesnexus.com';
/** 回源用的 UA / Referer —— 与后台爬取一致，上游对这套放行。 */
const UPSTREAM_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * 「一眼就是网页」的类型：挑战页 / 限流页 / 接口报错。语义与
 * `app/api/games/[id]/rom/route.ts` 的 `HTML_LIKE` 一致（那边刻意宽一点，因为只是
 * 拦个响应头；这边要按字节判断，所以 `text/*` 单独留给下面那道兜底）。
 */
const HTML_LIKE = /^text\/html|application\/xhtml|application\/json|application\/xml|text\/xml/i;
/** `text/*` 整体：可能是网页，也可能只是 mime 表把扩展名认错了（`.md` 卡带），要看字节。 */
const TEXT_LIKE = /^text\//i;

for (const key of ['SUPABASE_DB_URL', 'R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) {
  if (!process.env[key]) {
    console.error(`缺少 ${key}，请用 --env-file=.env.local`);
    process.exit(1);
  }
}

const sql = postgres(process.env.SUPABASE_DB_URL, {
  ssl: 'require', prepare: false, max: 3, idle_timeout: 10, connect_timeout: 20,
});
const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const Bucket = process.env.R2_BUCKET;

/* ── 小工具 ───────────────────────────────────────────────────────────── */

function human(bytes) {
  if (!bytes) return '0 B';
  const units = ['KiB', 'MiB', 'GiB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/** `site:/x` → 主站；`files:/x` → 文件子域（与 lib/server/upstream.ts 逐条一致）。 */
function sourceFileUrl(stored) {
  const text = (stored ?? '').trim();
  const at = text.indexOf(':');
  if (at === -1) return null;
  const host = text.slice(0, at);
  const path = text.slice(at + 1);
  if (!path.startsWith('/')) return null;
  if (host === 'site') return `${UPSTREAM_SITE}${path}`;
  if (host === 'files') return `${UPSTREAM_FILES}${path}`;
  return null;
}

/** 原始文件名的扩展名（.zip / .nes / .gba …），认不出给空串。 */
function extensionOf(romName) {
  const match = /\.[a-z0-9]{1,5}$/i.exec(romName ?? '');
  return match ? match[0].toLowerCase() : '';
}

/** 键名里的 slug / 语言只留安全字符（slug 本来就干净，这里只是兜底）。 */
function safeSegment(text) {
  return String(text).replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** `roms/<机种>/<slug>-<lang><ext>` */
function romKey(row) {
  return `roms/${safeSegment(row.console_type)}/${safeSegment(row.game_slug)}-${safeSegment(row.language)}${extensionOf(row.rom_name)}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 从上游取一份 ROM 的完整字节。
 *
 * ⚠️ **不能一律拒 `text/*`**（2026-10-21 改）：Mega Drive 卡带扩展名就是 `.md`，
 * 上游的 mime 表把 `.md` 认成 Markdown，回 `text/markdown` 且**不带 content-length**
 * —— 字节却是真卡带（`00 ff fe …`）。按老判据 md 的 63 条会全部被判「返回网页」而
 * 失败。现在只拦真像网页的那几种类型（与 `app/api/games/[id]/rom/route.ts` 的
 * `HTML_LIKE` 同一套语义），再用响应体第一字节兜一道。
 *
 * 三次机会：上游偶尔回 403（普通驳回，不是 challenge），换一次就过了；
 * **challenge 也算在内**——脚本是本机直连（不是 Worker 出口），被挡多半是瞬时的，
 * 拉长等待再试比直接放弃划算。三次都不行就记失败、继续下一行（不让整批停住）。
 */
async function downloadRom(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          accept: '*/*',
          'accept-encoding': 'identity',
          'user-agent': UPSTREAM_UA,
          referer: `${UPSTREAM_SITE}/`,
        },
        cache: 'no-store',
      });
      if (!res.ok) {
        const challenge = res.headers.get('cf-mitigated') === 'challenge';
        await res.body?.cancel();
        lastError = new Error(`HTTP ${res.status}${challenge ? '（challenge）' : ''}`);
        await sleep(attempt * 2000);
        continue;
      }
      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
      if (HTML_LIKE.test(type)) {
        await res.body?.cancel();
        lastError = new Error(`上游返回网页而不是文件（${type}）`);
        await sleep(attempt * 2000);
        continue;
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      const declared = Number(res.headers.get('content-length') ?? 0);
      if (declared && bytes.length !== declared) {
        lastError = new Error(`长度不符：收到 ${bytes.length}，声明 ${declared}`);
        await sleep(attempt * 2000);
        continue;
      }
      if (bytes.length < 1024) {
        lastError = new Error(`文件过小（${bytes.length} B），多半不是 ROM`);
        continue;
      }
      // 兜底：声明成 text/ 又真的以 `<` / `{` 开头 ⇒ 就是页面（挑战页有时不带 html 类型）。
      if (TEXT_LIKE.test(type) && /^\s*[<{]/.test(bytes.subarray(0, 64).toString('latin1'))) {
        lastError = new Error(`响应体是文本页面（${type}）`);
        await sleep(attempt * 2000);
        continue;
      }
      return bytes;
    } catch (error) {
      lastError = error;
      await sleep(attempt * 2000);
    }
  }
  throw lastError ?? new Error('下载失败');
}

/* ── 取待处理行 ───────────────────────────────────────────────────────── */

async function loadRows() {
  const rows = await sql`
    select g.console_type, r.game_slug, r.language, r.rom_name, r.source_url, r.size_bytes
      from game_roms r
      join games g on g.slug = r.game_slug
     order by g.console_type, r.game_slug, r.language`;
  return rows.filter((row) => {
    if (ONLY.size > 0) return ONLY.has(row.console_type);
    return !DEFAULT_EXCLUDE.has(row.console_type);
  });
}

/* ── 单行处理 ─────────────────────────────────────────────────────────── */

async function objectExists(key) {
  try {
    const head = await r2.send(new HeadObjectCommand({ Bucket, Key: key }));
    return head.ContentLength ?? 0;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return 0;
    throw error;
  }
}

async function migrateRow(row, stats) {
  const label = `${row.console_type}/${row.game_slug}/${row.language}`;

  if ((row.source_url ?? '').startsWith('r2:')) {
    stats.skipped += 1;
    return;
  }

  const key = romKey(row);
  const existing = FORCE ? 0 : await objectExists(key);

  if (existing) {
    // 上一轮已经传上去了，只是库没改到 —— 直接补库
    await sql`
      update game_roms set source_url = ${`r2:${key}`}, size_bytes = ${existing}
       where game_slug = ${row.game_slug} and language = ${row.language}`;
    stats.linked += 1;
    stats.bytes += existing;
    console.log(`  链接 ${label} → r2:${key}（${human(existing)}，已存在）`);
    return;
  }

  const target = sourceFileUrl(row.source_url);
  if (!target) {
    stats.failed.push({ label, reason: `认不出来源 ${row.source_url}` });
    return;
  }

  const bytes = await downloadRom(target);

  if (DRY_RUN) {
    stats.uploaded += 1;
    stats.bytes += bytes.length;
    console.log(`  [dry] ${label} ${human(bytes.length)} → r2:${key}`);
    return;
  }

  await r2.send(
    new PutObjectCommand({
      Bucket,
      Key: key,
      Body: Readable.from(bytes),
      ContentLength: bytes.length,
      ContentType: 'application/octet-stream',
      // 与图片同一条规矩：30 天；换文件必须换键（见文件头）。
      CacheControl: 'public, max-age=2592000',
    })
  );

  await sql`
    update game_roms set source_url = ${`r2:${key}`}, size_bytes = ${bytes.length}
     where game_slug = ${row.game_slug} and language = ${row.language}`;

  stats.uploaded += 1;
  stats.bytes += bytes.length;
  console.log(`  上传 ${label} ${human(bytes.length)} → r2:${key}`);
}

/* ── 主流程 ───────────────────────────────────────────────────────────── */

const all = await loadRows();
const todo = all.filter((row) => !(row.source_url ?? '').startsWith('r2:')).slice(0, LIMIT);

console.log(
  `待处理 ${todo.length} 行（全库 ${all.length} 行；` +
    `${ONLY.size ? `只做 ${[...ONLY].join(',')}` : `排除 ${[...DEFAULT_EXCLUDE].join(',')}`}；` +
    `并发 ${CONCURRENCY}${DRY_RUN ? '；dry-run 不写' : ''}）`
);

const stats = { uploaded: 0, linked: 0, skipped: 0, bytes: 0, failed: [] };
let cursor = 0;

async function worker(index) {
  for (;;) {
    const at = cursor;
    cursor += 1;
    if (at >= todo.length) return;
    const row = todo[at];
    try {
      await migrateRow(row, stats);
    } catch (error) {
      const label = `${row.console_type}/${row.game_slug}/${row.language}`;
      stats.failed.push({ label, reason: String(error?.message ?? error) });
      console.error(`  失败 ${label}：${error?.message ?? error}`);
    }
    const done = stats.uploaded + stats.linked + stats.failed.length;
    if (done % 25 === 0) {
      console.log(`…进度 ${done}/${todo.length}（累计 ${human(stats.bytes)}）`);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length || 1) }, (_, i) => worker(i)));

console.log('');
console.log(
  `完成：新上传 ${stats.uploaded}，已存在补库 ${stats.linked}，失败 ${stats.failed.length}，` +
    `本次涉及 ${human(stats.bytes)}`
);
if (stats.failed.length) {
  console.log('失败清单：');
  for (const item of stats.failed) console.log(`  · ${item.label} — ${item.reason}`);
  console.log('（重跑同一条命令即可续传，已成功的行会跳过）');
}

await sql.end();
