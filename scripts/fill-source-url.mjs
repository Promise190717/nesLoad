/*
 * 「有 ROM 在 R2、却没有来源地址」的那批记录 → 去上游爬取 source_url → 再删 R2 包、清 rom_url。
 *
 * 用法：
 *   node --env-file=.env.local scripts/fill-source-url.mjs --dry-run    # 只读预览，不写库、不删 R2
 *   node --env-file=.env.local scripts/fill-source-url.mjs              # 只填 source_url（可回退，安全）
 *   node --env-file=.env.local scripts/fill-source-url.mjs --purge-r2   # 删 R2 对象 + 把 rom_url 清成空串
 *   node --env-file=.env.local scripts/fill-source-url.mjs --all        # 上面两步连着跑（一把梭）
 *
 * ⚠️⚠️ **--purge-r2 不可逆**：R2 没有版本控制，对象删了就永久没了。
 *    所以它在动手前会对每一条**再探一次上游**（Range: bytes=0-0），
 *    确认此刻真的取得到才删本站那份；探不通的一律跳过（保留 R2 与 rom_url）。
 *
 * ⚠️ 与 lib/server/*.ts 的关系：**不 import**（那边是 TS + `@/` 别名 + 顶层副作用）。
 *    D1 走 REST、R2 走 S3 SDK，都在这里自己来 —— 照 add-game-group-key.mjs 那套抄。
 *
 * 为什么爬取要「按文件名精确匹配」而不是「按语言挑」：
 *   同款不同机种是两个 slug（`chrono-trigger` 是 SFC、`chrono-trigger-nds` 是 NDS），
 *   页面里的 fileName 表按语言给地址 —— 只按语言挑会把 SFC 那份填给 NDS 那条。
 *   而 rom_name 就是上游 fileName 里的文件名（实测一一对应），拿它当唯一判据最稳。
 *
 * 两条路，先页面后直取：
 *   ① 由 rom_name 推 slug → 抓 `/<locale>/games/<slug>` → 在 fileName 表里找同名文件；
 *   ② ①失败就按 `/games/roms/<rom_name>` 直接探上游两个 host（files 优先）。
 *   ⚠️ files / site 两个 host **不可互换**（见 lib/server/upstream.ts 的 UPSTREAM_ROOT），
 *      所以存进 source_url 的一律带 host 角色前缀。
 */
import { writeFile } from 'node:fs/promises';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

const {
  CF_ACCOUNT_ID,
  CF_D1_API_TOKEN,
  D1_DATABASE_ID,
  R2_ENDPOINT,
  R2_BUCKET,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
} = process.env;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const PURGE = args.includes('--purge-r2') || args.includes('--all');
const FILL = !args.includes('--purge-r2') || args.includes('--all');

for (const [name, value] of Object.entries({ CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID })) {
  if (!value) {
    console.error(`缺少环境变量：${name}`);
    process.exit(1);
  }
}

const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

/* ── 上游 ────────────────────────────────────────────────────────────── */

const UPSTREAM_ROOT = 'retrogamesnexus.com';
const UPSTREAM_SITE = `https://${UPSTREAM_ROOT}`;
const UPSTREAM_FILES = `https://files.${UPSTREAM_ROOT}`;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** 抓页面用的语言前缀。fileName 表在任一语言页面上都带全部语言，抓一种就够。 */
const UPSTREAM_LOCALE = 'zh';

/** 页面抓取的并发上限 —— 对上游客气一点，被风控了整批都得重来。 */
const PAGE_CONCURRENCY = 4;
/**
 * 兜底探测 / 删 R2 的并发。
 * ⚠️ D1 的 UPDATE 是**串在同一个 worker 里**的（抓到一条就写一条），没有单独一档 ——
 *    节奏跟着这一档走，不会比它更密。
 */
const PROBE_CONCURRENCY = 6;

/* ── D1 ─────────────────────────────────────────────────────────────── */

async function q(sql, params = []) {
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

/* ── 打散成小池子的并发执行 ──────────────────────────────────────────── */

async function pool(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

/* ── 上游抓取 ────────────────────────────────────────────────────────── */

/** rom_name → slug 候选：去扩展名、再去尾部的语言后缀。 */
function slugOf(romName) {
  const base = romName.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  return base.replace(/-(cn|zh|ja|jp|ko|kr|en|us|eu|de|es|pt|fr|it|nl|ru|br)$/i, '');
}

/** 站内形态的来源地址：`<host 角色>:<路径>`（不含域名，见 lib/server/upstream.ts）。 */
function toStored(absUrl) {
  let url;
  try {
    url = new URL(absUrl);
  } catch {
    return null;
  }
  const path = `${url.pathname}${url.search}`;
  const host = url.hostname.toLowerCase();
  if (host === UPSTREAM_ROOT) return `site:${path}`;
  if (host === `files.${UPSTREAM_ROOT}`) return `files:${path}`;
  return null;
}

/** slug → 页面 HTML（并发去重 + 缓存；抓不到缓存成 null，别反复重试）。 */
const pageCache = new Map();
function pageOf(slug) {
  if (!pageCache.has(slug)) {
    pageCache.set(
      slug,
      (async () => {
        try {
          const res = await fetch(`${UPSTREAM_SITE}/${UPSTREAM_LOCALE}/games/${encodeURIComponent(slug)}`, {
            headers: { 'user-agent': UA, accept: 'text/html' },
            signal: AbortSignal.timeout(30000),
          });
          return res.ok ? await res.text() : null;
        } catch {
          return null;
        }
      })()
    );
  }
  return pageCache.get(slug);
}

/**
 * 在页面里找**文件名与 rom_name 完全相同**的那一项。
 *
 * 移植自 app/api/admin/scrape-game/route.ts 的 romsFromHtml，两处判据要一致：
 * 先用 `"slug":"<slug>"` 定锚点（同一页里还有 relatedGames 的 fileName，全局搜会摸到别的游戏），
 * 再往后 4000 字符找 fileName 表。⚠️ 值可能带转义的 `\"`，也可能只是普通 `"`，两种都认。
 */
function matchInPage(html, slug, romName) {
  for (const anchor of [`\\"slug\\":\\"${slug}\\"`, `"slug":"${slug}"`]) {
    const at = html.indexOf(anchor);
    if (at === -1) continue;
    const segment = html.slice(at, at + 4000);
    const block = segment.match(/\\?"fileName\\?":\s*\{([^}]*)\}/);
    if (!block) continue;
    for (const m of block[1].matchAll(/\\?"([\w-]+)\\?":\s*\\?"((?:https?:\/\/|\/)[^"\\]+)\\?"/g)) {
      const raw = m[2];
      const abs = raw.startsWith('/') ? `${UPSTREAM_SITE}${raw}` : raw;
      let name = '';
      try {
        name = decodeURIComponent(abs.split('/').pop() ?? '');
      } catch {
        name = abs.split('/').pop() ?? '';
      }
      if (name === romName) return { url: abs, lang: m[1] };
    }
  }
  return null;
}

/** 兜底：按文件名直接探上游两个 host（files 优先 —— 库里 NDS 那批全在 files 上）。 */
async function probeByFileName(romName) {
  const path = `/games/roms/${encodeURIComponent(romName)}`;
  for (const [role, base] of [
    ['files', UPSTREAM_FILES],
    ['site', UPSTREAM_SITE],
  ]) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'GET',
        headers: { Range: 'bytes=0-0', 'user-agent': UA },
        signal: AbortSignal.timeout(25000),
      });
      const ok = res.ok; // 200 / 206 才算
      await res.body?.cancel();
      if (ok) return { stored: `${role}:/games/roms/${romName}`, role };
    } catch {
      // 探不通就试下一个 host
    }
  }
  return null;
}

/**
 * 复探一条**已存好的**来源地址能不能取到（`sourceFileUrl` 的等价实现）。
 * 删 R2 前用它 —— 判据是「这条自己写的那个地址此刻能不能下」，不是「按文件名重新推一个」，
 * 免得页面命中过、路径却不是 `/games/roms/<文件名>` 的那几条被误判成健康。
 */
async function probeStored(stored) {
  const at = (stored ?? '').indexOf(':');
  if (at === -1) return false;
  const role = stored.slice(0, at);
  const path = stored.slice(at + 1);
  const base = role === 'files' ? UPSTREAM_FILES : role === 'site' ? UPSTREAM_SITE : null;
  if (!base || !path.startsWith('/')) return false;
  try {
    const res = await fetch(`${base}${encodeURI(path)}`, {
      method: 'GET',
      headers: { Range: 'bytes=0-0', 'user-agent': UA },
      signal: AbortSignal.timeout(25000),
    });
    const ok = res.ok;
    await res.body?.cancel();
    return ok;
  } catch {
    return false;
  }
}

/**
 * 上游给的文件名得能原样拼进 URL（前台 sourceFileUrl() 是直接拼字符串、不做转义），
 * 所以含这些以外字符的一律不自动填。
 */
const SAFE_NAME = /^[A-Za-z0-9._\-]+$/;

/* ── 主流程 ──────────────────────────────────────────────────────────── */

const rows = await q(
  `SELECT id, title, console_type, language, rom_name, rom_url FROM games
    WHERE rom_url IS NOT NULL AND rom_url != ''
      AND (source_url IS NULL OR source_url = '')
    ORDER BY created_at, id`
);

console.log(`目标记录 ${rows.length} 条。模式：${DRY_RUN ? '只读预览' : FILL ? '写入' : '跳过填充'}${PURGE ? ' + 删 R2' : ''}`);
if (!rows.length) process.exit(0);

const filled = [];
const failed = [];

if (FILL) {
  let done = 0;
  await pool(rows, PAGE_CONCURRENCY, async (row) => {
    let hit = null;
    let via = '';

    if (!SAFE_NAME.test(row.rom_name)) {
      failed.push({ ...row, reason: `文件名含特殊字符，前台无法安全拼接：${row.rom_name}` });
      return;
    }

    const slug = slugOf(row.rom_name);
    const html = await pageOf(slug);
    if (html) {
      const found = matchInPage(html, slug, row.rom_name);
      if (found) {
        hit = toStored(found.url);
        via = `页面/${found.lang}`;
      }
    }
    if (!hit) {
      const probe = await probeByFileName(row.rom_name);
      if (probe) {
        hit = probe.stored;
        via = `直取/${probe.role}`;
      }
    }

    if (hit) {
      filled.push({ ...row, sourceUrl: hit, via });
      if (!DRY_RUN) await q('UPDATE games SET source_url = ? WHERE id = ?', [hit, row.id]);
    } else {
      failed.push({ ...row, reason: html ? '页面上没有同名文件，且直取两个 host 都探不通' : '上游没有这个 slug 的页面，且直取两个 host 都探不通' });
    }

    if (++done % 100 === 0) console.log(`  进度 ${done}/${rows.length}（命中 ${filled.length}）`);
  });

  console.log(`\n✅ 填上来源地址：${filled.length} 条`);
  console.log(`❌ 没找到：${failed.length} 条（R2 与 rom_url 原样保留）`);
  const byVia = {};
  for (const item of filled) byVia[item.via] = (byVia[item.via] ?? 0) + 1;
  console.log('   命中来源：', byVia);
}

if (PURGE) {
  for (const [name, value] of Object.entries({ R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY })) {
    if (!value) {
      console.error(`\n⚠️ 缺少 ${name} —— 跳过删 R2 这一步。`);
      process.exit(1);
    }
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });

  // 只处理「来源地址已就位」的行：拿填充结果（跑 --all 时）或重新查库（单独跑 --purge-r2 时）
  const targets = FILL
    ? filled.map((row) => ({ id: row.id, rom_name: row.rom_name, rom_url: row.rom_url, source_url: row.sourceUrl }))
    : await q(
        `SELECT id, title, console_type, language, rom_name, rom_url, source_url FROM games
          WHERE rom_url IS NOT NULL AND rom_url != ''
            AND source_url IS NOT NULL AND source_url != ''
          ORDER BY created_at, id`
      );

  console.log(`\n—— 第二阶段：删 R2 包 + 清 rom_url（${targets.length} 条）——`);
  if (DRY_RUN) {
    for (const row of targets.slice(0, 10)) console.log(`  [预览] 会删 ${row.rom_url}`);
    console.log(`  …共 ${targets.length} 条`);
  } else {
    let done = 0;
    let removed = 0;
    const skipped = [];
    const purged = [];
    await pool(targets, PROBE_CONCURRENCY, async (row) => {
      /*
       * 删之前**再探一次上游**。R2 没有版本控制，删错了没有退路 ——
       * 上游此刻取不到就说明现在删会留下死链，那就别删（保留 R2，前台仍能玩）。
       */
      const alive = await probeStored(row.source_url);
      if (!alive) {
        skipped.push({ ...row, reason: '删前复探上游失败' });
      } else {
        try {
          await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: row.rom_url }));
          // 先删对象、后清列：中途断了也只是「列还指着已删对象」，重跑一次即可
          await q("UPDATE games SET rom_url = '' WHERE id = ?", [row.id]);
          removed++;
          purged.push({ id: row.id, romName: row.rom_name, deletedKey: row.rom_url, sourceUrl: row.source_url });
        } catch (error) {
          skipped.push({ ...row, reason: `删 R2 或写库失败：${error.message}` });
        }
      }
      if (++done % 100 === 0) console.log(`  进度 ${done}/${targets.length}（已删 ${removed}）`);
    });
    console.log(`\n🗑  删掉 R2 对象并清空 rom_url：${removed} 条`);
    if (skipped.length) {
      console.log(`⏭  跳过：${skipped.length} 条（保留 R2）`);
      for (const row of skipped) console.log(`     ${row.rom_name} —— ${row.reason}`);
    }

    /*
     * 操作台账。删掉的对象没有版本控制、也没有回收站 —— 落一份明细，
     * 事后要核对「哪个包被删了、从哪个地址回源」只能靠它。
     */
    const logPath = 'source-url-migration-log.json';
    await writeFile(
      logPath,
      JSON.stringify(
        {
          at: new Date().toISOString(),
          purged,
          skipped,
          notFound: failed.map((row) => ({ id: row.id, romName: row.rom_name, reason: row.reason })),
        },
        null,
        2
      )
    );
    console.log(`📄 台账已写入 ${logPath}`);
  }
}

if (failed.length) {
  console.log('\n—— 没找到上游地址的清单 ——');
  for (const row of failed) console.log(`  [${row.console_type}/${row.language ?? '-'}] ${row.title} | ${row.rom_name}`);
}

if (DRY_RUN) console.log('\n（--dry-run：什么都没有写。）');
