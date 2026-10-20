/*
 * 给 `game_texts`（以及 developer / series / console 的文案侧表）补齐
 * 2026-10-20 新开的 14 种内容语言 —— 文案从上游站抓（Supabase 版）。
 *
 *   node --env-file=.env.local scripts/fill-game-texts-locales.mjs --dry          # 只抓不写
 *   node --env-file=.env.local scripts/fill-game-texts-locales.mjs --pages=2      # 每语言只抓 2 页试水
 *   node --env-file=.es.local scripts/fill-game-texts-locales.mjs                 # 全量
 *
 * ## 为什么走**列表页**而不是逐款抓详情页
 *
 * 与 `migrate-to-supabase.mjs` 同一套结论：上游列表页的 RSC 载荷里，每款游戏已带齐
 * title / description / controls / developer / series / console 等全部字段，
 * 一页 18 款、全站 ~2110 款 = 118 页 × 14 语言 ≈ **1650 个请求**；
 * 逐款抓详情页是 2110 × 14 ≈ 3 万个请求，慢 18 倍，数据一模一样。
 *
 * ## 只写**文案侧表**，不碰 games / game_roms
 *
 * 主表数据那次迁移已经写好了；这里只给 14 种新语言各插一行文案
 * （`on conflict do update`，重跑幂等 —— 这几种语言此前没有行，
 *  覆盖的只会是上次脚本自己写的）。
 * zh / en / ja / ko 四种**不在目标里**，已有行一概不碰。
 *
 * ## 外键护栏
 *
 * `game_texts.game_slug → games(slug)` 等外键都在，上游比本站多出的款
 * （跑不了的机种）直接写会撞 FK —— 先从库里的父表把 slug 全集捞出来，
 * 只写本站有的那部分。
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

/**
 * 要补的语言。**刻意不含 zh / en / ja / ko** —— 那四种已有全量行，
 * 误收进来会把 `on conflict do update` 变成「用抓取数据覆盖已有文案」。
 * 清单必须与 lib/game-text.ts 的 `CONTENT_LOCALES` 里新增的那 14 个一致。
 */
const LOCALES = (
  flag('locales', 'zh-TW,es,hi,pt,fr,de,it,ru,fil,nl,vi,th,ms,id')
).split(',').map((s) => s.trim()).filter(Boolean);

/* ── 上游常量（与 migrate-to-supabase.mjs 一致） ───────────────────────── */

const UPSTREAM_SITE = 'https://retrogamesnexus.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const PAGE_SIZE = 18;

/* ── RSC 载荷解析（照抄 migrate-to-supabase.mjs） ──────────────────────── */

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

/* ── 并发池（照抄 migrate-to-supabase.mjs） ────────────────────────────── */

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

/* ── 机种判定（照抄 migrate-to-supabase.mjs 的移植版） ─────────────────── */

function hasToken(text, token) {
  return new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`).test(text);
}

function toConsoleType(value) {
  const raw = String(value ?? '').toLowerCase().trim();
  if (!raw) return null;
  const text = raw.replace(/[-_]+/g, ' ');
  const compact = text.replace(/\s+/g, '');

  if (text.includes('sega cd') || text.includes('sega saturn')) return null;
  if (text.includes('3ds') || text.includes('2ds')) return null;
  if (compact.includes('nds') || text.includes('nintendo ds') || hasToken(text, 'ds')) return 'nds';
  if (compact.includes('gba') || compact.includes('gameboyadvance')) return 'gba';
  if (compact.includes('gbc') || compact.includes('gameboycolor')) return 'gbc';
  if (compact.includes('gameboy') || text.includes('game boy')) return 'gb';
  if (text.includes('snes') || text.includes('super nintendo') || text.includes('super famicom')) return 'snes';
  if (hasToken(text, 'nes') || text.includes('famicom')) return 'nes';
  if (
    /playstation\s*(2|3|4|5|portable|vita)/.test(text) ||
    ['ps2', 'ps3', 'ps4', 'ps5', 'psp', 'vita'].some((token) => hasToken(text, token))
  ) {
    return null;
  }
  if (text.includes('playstation') || hasToken(text, 'ps1') || hasToken(text, 'psx')) return 'ps1';
  if (hasToken(text, '32x')) return '32x';
  if (text.includes('genesis') || text.includes('mega drive') || hasToken(text, 'md')) return 'md';
  if (text.includes('game gear') || hasToken(text, 'gg')) return 'gg';
  if (text.includes('master system') || text.includes('mark iii') || hasToken(text, 'sms')) return 'sms';
  if (hasToken(text, 'sega')) return 'md';
  if (
    text.includes('neo geo pocket') ||
    text.includes('neogeo pocket') ||
    hasToken(text, 'ngpc') ||
    hasToken(text, 'ngp')
  ) {
    return 'ngp';
  }
  if (text.includes('wonderswan') || text.includes('wonder swan') || hasToken(text, 'ws')) return 'ws';
  if (
    text.includes('arcade') ||
    text.includes('mame') ||
    text.includes('fbneo') ||
    text.includes('neo geo') ||
    text.includes('neogeo') ||
    text.includes('cps')
  ) {
    return 'arcade';
  }
  return null;
}

/* ── 组装行 ───────────────────────────────────────────────────────────── */

/**
 * 一款游戏在一个语言下的 `game_texts` 行。**全空返回 null**（不建行）。
 * `controls` 收敛成 `{description, keys:[{label,action}]}` —— 与
 * migrate-to-supabase.mjs / normalizeControls 的形状一致。
 */
function textRow(slug, locale, raw) {
  if (!raw) return null;
  const title = raw.title ? String(raw.title).trim() : null;
  const description = raw.description ? String(raw.description).trim() : null;
  let controls = null;
  if (raw.controls && typeof raw.controls === 'object') {
    const keys = Object.entries(raw.controls.keys ?? {})
      .map(([label, action]) => ({
        label: String(label).trim(),
        action: typeof action === 'string' ? action.trim() : '',
      }))
      .filter((item) => item.label && item.action);
    const desc = raw.controls.description ? String(raw.controls.description).trim() : null;
    if (desc || keys.length) controls = { description: desc, keys };
  }
  if (!title && !description && !controls) return null;
  return { game_slug: slug, locale, title, description, controls };
}

/** about.description 是字符串数组（段落），拼成一段。 */
function aboutParagraph(raw) {
  return Array.isArray(raw?.about?.description)
    ? raw.about.description.map((s) => String(s).trim()).filter(Boolean).join('\n\n') || null
    : null;
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
    `上游共 ${total} 款 → ${pageCount} 页 × ${LOCALES.length} 语言 = ${pageCount * LOCALES.length} 个请求（并发 ${CONCURRENCY}）`
  );

  /* ② 并发抓全部列表页 */
  const listPath = (locale, page) => {
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

  /* ③ 按 slug 合并各语言 */
  const bySlug = new Map();
  for (const { locale, games } of pages) {
    for (const raw of games ?? []) {
      if (!bySlug.has(raw.slug)) bySlug.set(raw.slug, {});
      bySlug.get(raw.slug)[locale] = raw;
    }
  }
  console.log(
    `合并后 ${bySlug.size} 款（含上游有、本站没有的）· ` +
      `语言记录 ${[...bySlug.values()].reduce((n, item) => n + Object.keys(item).length, 0)} 条`
  );

  /* ④ 父表 slug 全集 —— 外键护栏：上游多出来的款/厂/系列/机种一律不写 */
  const url = process.env.SUPABASE_DB_URL?.trim();
  if (!url) throw new Error('缺少 SUPABASE_DB_URL（.env.local）');
  /*
   * ⚠️ 连接池**整个跑完才 end**：读完父表就把池关了、后面 upsert 再用同一个实例，
   *    会得到 `CONNECTION_ENDED`（第一轮全量实测踩到）。
   */
  const sql = postgres(url, { ssl: 'require', prepare: false, max: 3, idle_timeout: 10, connect_timeout: 20 });

  let gameSlugs;
  let developerSlugs;
  let seriesSlugs;
  let consoleTypes;
  try {
    [gameSlugs, developerSlugs, seriesSlugs, consoleTypes] = await Promise.all([
      sql`select slug from games`.then((rows) => new Set(rows.map((r) => r.slug))),
      sql`select slug from developers`.then((rows) => new Set(rows.map((r) => r.slug))),
      sql`select slug from series`.then((rows) => new Set(rows.map((r) => r.slug))),
      sql`select console_type from consoles`.then((rows) => new Set(rows.map((r) => r.console_type))),
    ]);
  } catch (error) {
    await sql.end({ timeout: 5 });
    throw error;
  }
  console.log(
    `本站：games ${gameSlugs.size} · developers ${developerSlugs.size} · ` +
      `series ${seriesSlugs.size} · consoles ${consoleTypes.size}`
  );

  /* ⑤ 组装四张文案侧表的行（只收本站有的 slug） */
  const gameText = [];
  /*
   * developer / series / console 的文案行都按 `${slug}:${locale}` 去重 ——
   * 同一个开发商/系列会挂在很多款游戏上，一份语言的文案只该有一行。
   * ⚠️ 不去重的话 upsert 会报 `ON CONFLICT DO UPDATE command cannot affect
   *    row a second time`（批内重复键，第二全量实测踩到）。
   */
  const developerTextMap = new Map();
  const seriesTextMap = new Map();
  const consoleTextMap = new Map(); // `${type}:${locale}` → row（同机种同语言撞很多款，去重）
  let notOurs = 0;

  for (const [slug, perLocale] of bySlug) {
    if (!gameSlugs.has(slug)) {
      notOurs += 1;
      continue;
    }
    for (const locale of LOCALES) {
      const raw = perLocale[locale];
      if (!raw) continue;

      const row = textRow(slug, locale, raw);
      if (row) gameText.push(row);

      const developer = raw.developer && typeof raw.developer === 'object' ? raw.developer : null;
      if (developer?.slug && developerSlugs.has(String(developer.slug))) {
        const name = developer.name ? String(developer.name).trim() : null;
        const summary = developer.description ? String(developer.description).trim() : null;
        const description = aboutParagraph(developer);
        if (name || summary || description) {
          developerTextMap.set(`${developer.slug}:${locale}`, {
            developer_slug: String(developer.slug),
            locale,
            name,
            summary,
            description,
          });
        }
      }

      const series = raw.series && typeof raw.series === 'object' ? raw.series : null;
      if (series?.slug && seriesSlugs.has(String(series.slug))) {
        const name = series.name ? String(series.name).trim() : null;
        const description = aboutParagraph(series);
        if (name || description) {
          seriesTextMap.set(`${series.slug}:${locale}`, {
            series_slug: String(series.slug),
            locale,
            name,
            description,
          });
        }
      }

      const consoleName = raw.console ? String(raw.console).trim() : null;
      const consoleType = toConsoleType(raw.consoleType ?? raw.console);
      /*
       * 机种名按**页面语言**收 —— 同一个 console_type 在每种语言下各一行。
       * 上游列表载荷里没有机种的 summary/description，只写 name（update 也只动
       * name，已有行的摘要不受影响）。
       */
      if (consoleName && consoleType && consoleTypes.has(consoleType)) {
        consoleTextMap.set(`${consoleType}:${locale}`, {
          console_type: consoleType,
          locale,
          name: consoleName,
        });
      }
    }
  }
  const developerText = [...developerTextMap.values()];
  const seriesText = [...seriesTextMap.values()];
  const consoleText = [...consoleTextMap.values()];

  console.log(
    `行数：game_texts ${gameText.length} · developer_texts ${developerText.length} · ` +
      `series_texts ${seriesText.length} · console_texts ${consoleText.length}` +
      `（上游有、本站没有的款 ${notOurs} 个已跳过）`
  );

  if (DRY) {
    console.log('--dry 模式，不写库。样例：');
    console.log('  game :', JSON.stringify(gameText[0]));
    const withCtl = gameText.find((r) => r.controls);
    console.log('  ctrl :', withCtl ? JSON.stringify(withCtl.controls).slice(0, 300) : '(无 controls 样例)');
    return;
  }

  /* ⑥ 写库（分块 upsert，照 migrate-to-supabase.mjs 的写法） */
  const CHUNK = 200;
  async function upsert(table, rows, { columns, conflict, update, casts = {}, serialize = {} }) {
    if (!rows.length) {
      console.log(`  ${table}: 0 行，跳过`);
      return;
    }
    let written = 0;
    for (let offset = 0; offset < rows.length; offset += CHUNK) {
      const chunk = rows.slice(offset, offset + CHUNK);
      const params = [];
      const tuples = [];
      for (const row of chunk) {
        const placeholders = columns.map((column) => {
          const value = serialize[column] ? serialize[column](row[column]) : row[column];
          params.push(value === undefined ? null : value);
          const cast = casts[column] ? `::${casts[column]}` : '';
          return `$${params.length}${cast}`;
        });
        tuples.push(`(${placeholders.join(',')})`);
      }
      const text =
        `insert into ${table} (${columns.join(',')}) values ${tuples.join(',')} ` +
        `on conflict (${conflict.join(',')}) do update set ${update
          .map((column) => `${column} = excluded.${column}`)
          .join(', ')}`;
      await sql.unsafe(text, params);
      written += chunk.length;
    }
    console.log(`  ${table}: ${written} 行`);
  }

  try {
    await upsert('game_texts', gameText, {
      columns: ['game_slug', 'locale', 'title', 'description', 'controls'],
      conflict: ['game_slug', 'locale'],
      update: ['title', 'description', 'controls'],
      casts: { controls: 'jsonb' },
      serialize: { controls: (value) => (value == null ? null : JSON.stringify(value)) },
    });

    await upsert('developer_texts', developerText, {
      columns: ['developer_slug', 'locale', 'name', 'summary', 'description'],
      conflict: ['developer_slug', 'locale'],
      update: ['name', 'summary', 'description'],
    });

    await upsert('series_texts', seriesText, {
      columns: ['series_slug', 'locale', 'name', 'description'],
      conflict: ['series_slug', 'locale'],
      update: ['name', 'description'],
    });

    await upsert('console_texts', consoleText, {
      columns: ['console_type', 'locale', 'name'],
      conflict: ['console_type', 'locale'],
      update: ['name'],
    });
  } finally {
    await sql.end({ timeout: 5 });
  }

  /* ⑦ 回读核对 */
  const sql2 = postgres(url, { ssl: 'require', prepare: false, max: 1 });
  try {
    const perLocale = await sql2`select locale, count(*)::int n from game_texts group by locale order by locale`;
    console.log(
      `game_texts 现在：${perLocale.map((row) => `${row.locale}=${row.n}`).join(' · ')}`
    );
  } finally {
    await sql2.end({ timeout: 5 });
  }
  console.log(`耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((error) => {
  console.error('回填失败：', error);
  process.exit(1);
});
