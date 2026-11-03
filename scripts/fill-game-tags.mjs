/*
 * 给 `game_texts.tags` 补上**这个语言**的游戏标签（2026-11-03 加）。
 *
 *   node --env-file=.env.local scripts/fill-game-tags.mjs --dry             # 只抓不写
 *   node --env-file=.env.local scripts/fill-game-tags.mjs --pages=1 --locales=en,ja
 *   node --env-file=.env.local scripts/fill-game-tags.mjs                  # 全量 18 语言
 *
 * ## 为什么需要这一列
 *
 * `games.tags` 只有**中文**那一份 —— 迁移脚本以 `perLocale.zh` 为骨架
 * （`scripts/migrate-to-supabase.mjs` 的 `primary = perLocale.zh`），
 * 于是英文站详情页直接印出来是「动作 / 射击 / 街机」。
 * 上游每种语言的列表载荷里都带着翻好的标签：
 *
 *     zh: "tags":["动作","射击","跑轰","街机","经典"]
 *     en: "tags":["Action","Shooter","Run and Gun","Arcade","Classic"]
 *
 * 所以按 `(game_slug, locale)` 存一份，详情页优先读它、缺失再退回 `games.tags`。
 *
 * ## 数据源：同样是列表页 RSC，不是逐款详情页
 *
 * 和 `fill-game-about.mjs` 一模一样 —— 每页 18 款、每款对象自带 `tags`。
 * 118 页 × 18 语言 ≈ 2100 个请求；逐款抓详情页是 3.8 万。
 *
 * ## 写入口径
 *
 *   · **只写 `tags` 这一列**，其它字段一概不碰（insert 新行时只给三列）。
 *   · 默认**只补空**（`tags is null or cardinality(tags) = 0`），重跑幂等；
 *     `--overwrite` 才整批重写。
 *   · 只写本站 `games` 里存在的 slug（外键护栏，理由见 fill-game-about.mjs）。
 */

import postgres from 'postgres';

/* ── 参数 ─────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const PAGES = Number(flag('pages', '0')); // 0 = 全部
const CONCURRENCY = Number(flag('concurrency', '8'));
const DRY = has('dry');
const OVERWRITE = has('overwrite');

/** 与 `lib/game-text.ts` 的 `CONTENT_LOCALES` 逐项一致。 */
const LOCALES = (
  flag('locales', 'zh,en,ja,ko,zh-TW,es,hi,pt,fr,de,it,ru,fil,nl,vi,th,ms,id')
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/* ── 上游常量（与 migrate-to-supabase.mjs / fill-game-about.mjs 一致） ── */

const UPSTREAM_SITE = 'https://retrogamesnexus.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const PAGE_SIZE = 18;

/* ── RSC 载荷解析（照抄 fill-game-about.mjs） ──────────────────────────── */

function flightText(html) {
  const chunk = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let out = '';
  let match;
  while ((match = chunk.exec(html)) !== null) {
    try {
      out += JSON.parse(match[1]);
    } catch {
      /* 坏片段跳过 */
    }
  }
  return out;
}

function sliceJsonObject(text, start) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function gameObjects(flight) {
  const out = [];
  const seen = new Set();
  let from = 0;
  for (;;) {
    const at = flight.indexOf('"game":', from);
    if (at < 0) break;
    let start = at + '"game":'.length;
    while (start < flight.length && /\s/.test(flight[start])) start += 1;
    if (flight[start] !== '{') {
      from = start + 1;
      continue;
    }
    const json = sliceJsonObject(flight, start);
    if (!json) break;
    try {
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed.slug === 'string' && !seen.has(parsed.slug)) {
        seen.add(parsed.slug);
        out.push(parsed);
      }
    } catch {
      /* 单个对象坏了不影响其它 */
    }
    from = start + json.length;
  }
  return out;
}

async function fetchFlight(url, { retries = 2 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          'user-agent': UA,
          accept: 'text/html',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return flightText(await res.text());
    } catch (error) {
      if (attempt >= retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
}

/* ── 并发池（照抄 fill-game-about.mjs） ────────────────────────────────── */

async function pool(items, limit, worker, onProgress) {
  const results = new Array(items.length);
  let cursor = 0;
  let done = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
      done += 1;
      if (onProgress && done % 50 === 0) onProgress(done, items.length);
    }
  });
  await Promise.all(runners);
  if (onProgress) onProgress(done, items.length);
  return results;
}

/** 上游 `tags` 是 `["动作", …]`；去空、去重、保持原顺序。 */
function cleanTags(raw) {
  if (!Array.isArray(raw)) return null;
  const seen = new Set();
  const tags = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const tag = item.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags.length > 0 ? tags : null;
}

/* ── 主流程 ───────────────────────────────────────────────────────────── */

async function main() {
  const started = Date.now();

  /* ① 中文第一页确认总数 → 页数（列表是全机种混排的，各语言同一页数） */
  const first = await fetchFlight(`${UPSTREAM_SITE}/zh/games`);
  const totalMatch = /"className":"font-semibold","children":(\d+)/.exec(first);
  const total = totalMatch ? Number(totalMatch[1]) : 0;
  const pageCount = Math.min(
    PAGES > 0 ? PAGES : Number.POSITIVE_INFINITY,
    Math.ceil(total / PAGE_SIZE) || 1
  );
  console.log(
    `上游共 ${total} 款 → ${pageCount} 页 × ${LOCALES.length} 语言 = ` +
      `${pageCount * LOCALES.length} 个请求（并发 ${CONCURRENCY}）`
  );

  /* ② 并发抓全部列表页 */
  const listPath = (locale, page) => {
    /* 英文是**无前缀**的（`/en/...` 会 307 到 `/...`） */
    const prefix = locale === 'en' ? '' : `/${locale}`;
    return `${UPSTREAM_SITE}${prefix}/games${page > 1 ? `?page=${page}` : ''}`;
  };
  const tasks = [];
  for (const locale of LOCALES) {
    for (let page = 1; page <= pageCount; page += 1) tasks.push({ locale, page });
  }

  const pages = await pool(
    tasks,
    CONCURRENCY,
    async ({ locale, page }) => {
      const flight = await fetchFlight(listPath(locale, page));
      return { locale, page, games: gameObjects(flight) };
    },
    (done, all) =>
      console.log(`  抓取 ${done}/${all} 页（${((Date.now() - started) / 1000).toFixed(0)}s）`)
  );

  /* ③ 组装行并去重（同一款可能在多页 / 多语言的 related 里重复出现） */
  const rows = new Map(); // `${slug}:${locale}` → row
  let noTags = 0;
  for (const { locale, games } of pages) {
    for (const raw of games ?? []) {
      const tags = cleanTags(raw.tags);
      if (!tags) {
        noTags += 1;
        continue;
      }
      rows.set(`${raw.slug}:${locale}`, { game_slug: raw.slug, locale, tags });
    }
  }

  /* ④ 父表 slug 全集 —— 外键护栏 */
  const url = process.env.SUPABASE_DB_URL?.trim();
  if (!url) throw new Error('缺少 SUPABASE_DB_URL（.env.local）');
  const sql = postgres(url, {
    ssl: 'require',
    prepare: false,
    max: 3,
    idle_timeout: 10,
    connect_timeout: 20,
  });

  let gameSlugs;
  try {
    gameSlugs = new Set((await sql`select slug from games`).map((row) => row.slug));
  } catch (error) {
    await sql.end({ timeout: 5 });
    throw error;
  }
  console.log(
    `本站 games ${gameSlugs.size} 款 · 抓到 tags ${rows.size} 条（上游没有标签的 ${noTags} 条）`
  );

  const writable = [...rows.values()].filter((row) => gameSlugs.has(row.game_slug));
  console.log(
    `可写 ${writable.length} 条（上游有、本站没有的 ${rows.size - writable.length} 条已跳过）`
  );

  if (DRY) {
    console.log('--dry 模式，不写库。样例：');
    for (const row of writable.slice(0, 3)) {
      console.log(`  ${row.game_slug} [${row.locale}] ${row.tags.join(' / ')}`);
    }
    await sql.end({ timeout: 5 });
    return;
  }

  /* ⑤ 分块 upsert（只动 tags；默认只补空） */
  const CHUNK = 200;
  let written = 0;
  try {
    for (let offset = 0; offset < writable.length; offset += CHUNK) {
      const chunk = writable.slice(offset, offset + CHUNK);
      const params = [];
      const tuples = chunk.map((row) => {
        params.push(row.game_slug, row.locale, row.tags);
        return `($${params.length - 2}, $${params.length - 1}, $${params.length}::text[])`;
      });
      const text =
        `insert into game_texts (game_slug, locale, tags) values ${tuples.join(',')} ` +
        `on conflict (game_slug, locale) do update set tags = excluded.tags, updated_at = now()` +
        /* 只补空：`--overwrite` 时去掉这个 where，整批重写 */
        (OVERWRITE ? '' : ` where game_texts.tags is null or cardinality(game_texts.tags) = 0`);
      await sql.unsafe(text, params);
      written += chunk.length;
    }
    console.log(`game_texts.tags：提交 ${written} 条`);
  } finally {
    await sql.end({ timeout: 5 });
  }

  /* ⑥ 回读核对 */
  const sql2 = postgres(url, { ssl: 'require', prepare: false, max: 1 });
  try {
    const stats = await sql2`
      select count(*) filter (where tags is not null and cardinality(tags) > 0)::int as filled,
             count(*)::int as total
        from game_texts
    `;
    console.log(`game_texts 现状：${stats[0].filled}/${stats[0].total} 行有 tags`);
  } finally {
    await sql2.end({ timeout: 5 });
  }
  console.log(`耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((error) => {
  console.error('回填失败：', error);
  process.exit(1);
});
