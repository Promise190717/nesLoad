/*
 * 给 `game_texts.about` 补上「关于 <游戏名>」的整段介绍（2026-11-03 加）。
 *
 *   node --env-file=.env.local scripts/fill-game-about.mjs --dry          # 只抓不写
 *   node --env-file=.env.local scripts/fill-game-about.mjs --pages=2      # 每语言只抓 2 页试水
 *   node --env-file=.env.local scripts/fill-game-about.mjs --locales=zh,en
 *   node --env-file=.env.local scripts/fill-game-about.mjs                # 全量 18 语言
 *
 * ## 数据源：上游**列表页的 RSC 载荷**，不是逐款抓详情页
 *
 * 详情页「关于 XXX」那一块的内容，在列表页的 RSC 载荷里**一字符不差地带着**：
 * 每款游戏对象都有 `about: { title: '关于魂斗罗', description: ['第一段', '第二段', …] }`。
 * 抽检过 `魂斗罗`（中文）、`超级马里奥兄弟`（中文 / 日文）三份，段落数与文字与详情页一致。
 *
 * 为什么要绕这一道：全站约 2100 款 × 18 语言，逐款抓详情页是 **3.8 万** 个请求；
 * 列表页一页 18 款、共 118 页 × 18 语言 ≈ **2100** 个，快 18 倍，数据同源
 * （与 `fill-game-texts-locales.mjs` / `migrate-to-supabase.mjs` 同一个结论）。
 *
 * ## 写入口径
 *
 *   · **只写 `about` 这一列**。title / description / controls 一概不碰 ——
 *     insert 新行时只给 (game_slug, locale, about)，已有的行也只 update about。
 *   · 默认**只补空**（`about is null or about = ''`），重跑是幂等的、
 *     后台手改过的长文不会被覆盖；真要重写整批加 `--overwrite`。
 *   · 只写**本站 games 里存在**的 slug（外键护栏）：上游比本站多出的款
 *     （跑不了的机种）写进去会撞 `game_texts_game_slug_fkey`。
 *   · 段落之间存 `\n\n`（详情页按空行切开逐段渲染，见 app/[locale]/games/[id]/page.tsx）。
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

/**
 * 要补的语言。与 `lib/game-text.ts` 的 `CONTENT_LOCALES` 逐项一致 ——
 * 上游语言切换器正好也是这 18 种，每种都有真翻译的 about。
 */
const LOCALES = (
  flag(
    'locales',
    'zh,en,ja,ko,zh-TW,es,hi,pt,fr,de,it,ru,fil,nl,vi,th,ms,id'
  )
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/* ── 上游常量（与 migrate-to-supabase.mjs / fill-game-texts-locales.mjs 一致） ── */

const UPSTREAM_SITE = 'https://retrogamesnexus.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const PAGE_SIZE = 18;

/* ── RSC 载荷解析（照抄 fill-game-texts-locales.mjs） ──────────────────── */

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

/* ── 并发池（照抄 fill-game-texts-locales.mjs） ────────────────────────── */

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

/** `about.description` 是字符串数组（每项一段），拼成「段落之间空一行」的一列文本。 */
function aboutText(raw) {
  const paragraphs = Array.isArray(raw?.about?.description)
    ? raw.about.description.map((item) => String(item).trim()).filter(Boolean)
    : [];
  return paragraphs.length ? paragraphs.join('\n\n') : null;
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
  let noAbout = 0;
  for (const { locale, games } of pages) {
    for (const raw of games ?? []) {
      const about = aboutText(raw);
      if (!about) {
        noAbout += 1;
        continue;
      }
      rows.set(`${raw.slug}:${locale}`, { game_slug: raw.slug, locale, about });
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
  console.log(`本站 games ${gameSlugs.size} 款 · 抓到 about ${rows.size} 条（上游没有 about 的 ${noAbout} 条）`);

  const writable = [...rows.values()].filter((row) => gameSlugs.has(row.game_slug));
  console.log(
    `可写 ${writable.length} 条（上游有、本站没有的 ${rows.size - writable.length} 条已跳过）`
  );

  if (DRY) {
    console.log('--dry 模式，不写库。样例：');
    for (const row of writable.slice(0, 3)) {
      console.log(`  ${row.game_slug} [${row.locale}] ${row.about.slice(0, 90)}…`);
    }
    await sql.end({ timeout: 5 });
    return;
  }

  /* ⑤ 分块 upsert（只动 about；默认只补空） */
  const CHUNK = 200;
  let written = 0;
  try {
    for (let offset = 0; offset < writable.length; offset += CHUNK) {
      const chunk = writable.slice(offset, offset + CHUNK);
      const params = [];
      const tuples = chunk.map((row) => {
        params.push(row.game_slug, row.locale, row.about);
        return `($${params.length - 2}, $${params.length - 1}, $${params.length})`;
      });
      const text =
        `insert into game_texts (game_slug, locale, about) values ${tuples.join(',')} ` +
        `on conflict (game_slug, locale) do update set about = excluded.about, updated_at = now()` +
        /* 只补空：`--overwrite` 时去掉这个 where，整批重写 */
        (OVERWRITE ? '' : ` where game_texts.about is null or game_texts.about = ''`);
      await sql.unsafe(text, params);
      written += chunk.length;
    }
    console.log(`game_texts.about：提交 ${written} 条`);
  } finally {
    await sql.end({ timeout: 5 });
  }

  /* ⑥ 回读核对 */
  const sql2 = postgres(url, { ssl: 'require', prepare: false, max: 1 });
  try {
    const stats = await sql2`
      select count(*) filter (where about is not null and about <> '')::int as filled,
             count(*)::int as total
        from game_texts
    `;
    console.log(
      `game_texts 现状：${stats[0].filled}/${stats[0].total} 行有 about（其余语言行没有这一列的内容）`
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
