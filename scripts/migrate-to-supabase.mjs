/*
 * 把源站（retrogamesnexus.com）的全量目录爬进 Supabase。
 *
 *   node --env-file=.env.local scripts/migrate-to-supabase.mjs
 *   node --env-file=.env.local scripts/migrate-to-supabase.mjs --pages=2 --dry   # 先看两页
 *
 * ---------------------------------------------------------------------------
 * 为什么爬**列表页**而不是详情页
 *
 * 上游列表页的 RSC 载荷里，每款游戏已经带齐了详情页要的全部字段
 * （title / description / consoleType / releaseDate / thumbnail / developer / series /
 *  fileName / controls）—— 和详情页是同一份对象。一页 18 款，
 * 全站 2110 款 = 118 页；四个语言各取一遍 = **472 个请求**。
 * 换成逐款抓详情页是 2110 × 4 = 8440 个请求，慢 18 倍，拿到的数据一模一样。
 *
 * ---------------------------------------------------------------------------
 * 只存链接，不下载任何文件（用户 2026-10-20 明确要求）
 *
 * ROM 地址收敛成站内形态 `<host 角色>:<路径>`，**去掉域名**：
 *   https://files.retrogamesnexus.com/games/roms/x.zip  →  files:/games/roms/x.zip
 *   /games/roms/y.nes                                   →  site:/games/roms/y.nes
 * host 角色不能省（两个 host 不可互换，见 lib/server/upstream.ts 的说明）。
 * 封面同理只存地址，不抓图。
 *
 * ---------------------------------------------------------------------------
 * 幂等
 *
 * 全部 upsert（`on conflict ... do update`），跑多少遍结果都一样，中断了直接重跑。
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
const LOCALES = ['zh', 'en', 'ja', 'ko'];

/* ── 上游常量（与 lib/server/upstream.ts 保持一致） ────────────────────── */

const UPSTREAM_SITE = 'https://retrogamesnexus.com';
const UPSTREAM_FILES = 'https://files.retrogamesnexus.com';
const UPSTREAM_ROOT = 'retrogamesnexus.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const PAGE_SIZE = 18;

/** 上游 slug → 站内机种。移植自 lib/server/upstream.ts 的 CONSOLE_SLUGS（反查）。 */
const SLUG_TO_CONSOLE = {
  'nes-games': 'nes',
  'snes-games': 'snes',
  'gameboy-games': 'gb',
  'gbc-games': 'gbc',
  'gba-games': 'gba',
  'nds-games': 'nds',
  'genesis-games': 'md',
  'sega-game-gear-games': 'gg',
  'sega-master-system-games': 'sms',
  'sega-32x-games': '32x',
  'bandai-wonderswan-games': 'ws',
  'neogeo-pocket-games': 'ngp',
  'playstation-games': 'ps1',
  'arcade-games': 'arcade',
};

/** 上游 fileName 的语言键 → 站内短码（移植自 lib/rom-lang.ts）。 */
const ROM_LANG = { en: 'en', cn: 'zh', zh: 'zh', ja: 'ja', jp: 'ja', ko: 'ko' };

/** 站内语言顺序（决定默认 ROM 取哪一份，与 lib/rom-lang.ts 的 GAME_LANGUAGES 一致）。 */
const LANG_ORDER = ['zh', 'en', 'ja', 'ko'];

/**
 * 机种展示顺序 —— 与 `lib/consoles.ts` 的 `CONSOLE_TYPES` 一致。
 * 写在数据里（`consoles.sort_order`）而不是靠页面排序：后台加机种时不用改页面代码。
 */
const CONSOLE_ORDER = {
  nes: 1, snes: 2, gb: 3, gbc: 4, gba: 5, nds: 6, md: 7,
  gg: 8, sms: 9, '32x': 10, ws: 11, ngp: 12, ps1: 13, arcade: 14,
};

/* ── 机种判定（逐条移植 lib/server/upstream.ts 的 toConsoleType） ────────
 *
 * ⚠️ 这段是**抄**过来的，不是 import —— 脚本是 .mjs，引不了 TS + `@/` 别名。
 *    上游的机种写法一改，两边都要改。判断顺序有讲究（长名在前、短代号在后），
 *    别按字母重排，理由见原函数上方那一大段。
 */

function hasToken(text, token) {
  return new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`).test(text);
}

function toConsoleType(value) {
  const raw = String(value ?? '')
    .toLowerCase()
    .trim();
  if (!raw) return null;

  const text = raw.replace(/[-_]+/g, ' ');
  const compact = text.replace(/\s+/g, '');

  if (text.includes('sega cd') || text.includes('sega saturn')) return null;
  if (text.includes('3ds') || text.includes('2ds')) return null;

  if (compact.includes('nds') || text.includes('nintendo ds') || hasToken(text, 'ds')) return 'nds';

  if (compact.includes('gba') || compact.includes('gameboyadvance')) return 'gba';
  if (compact.includes('gbc') || compact.includes('gameboycolor')) return 'gbc';
  if (compact.includes('gameboy') || text.includes('game boy')) return 'gb';

  if (text.includes('snes') || text.includes('super nintendo') || text.includes('super famicom'))
    return 'snes';
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
  if (text.includes('master system') || text.includes('mark iii') || hasToken(text, 'sms'))
    return 'sms';
  if (hasToken(text, 'sega')) return 'md';

  if (
    text.includes('neo geo pocket') ||
    text.includes('neogeo pocket') ||
    hasToken(text, 'ngpc') ||
    hasToken(text, 'ngp')
  ) {
    return 'ngp';
  }
  if (text.includes('wonderswan') || text.includes('wonder swan') || hasToken(text, 'ws'))
    return 'ws';

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

/* ── 来源地址（移植自 lib/server/upstream.ts 的 toStoredSource / sourceFileName） ── */

function toStoredSource(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  if (text.startsWith('/')) return `site:${text}`;

  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase();
  const rest = `${url.pathname}${url.search}`;
  if (host === UPSTREAM_ROOT) return `site:${rest}`;
  if (host === `files.${UPSTREAM_ROOT}`) return `files:${rest}`;
  return null;
}

function fileNameOf(raw) {
  const tail = String(raw ?? '')
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .pop();
  if (!tail) return 'rom';
  try {
    return decodeURIComponent(tail) || 'rom';
  } catch {
    return tail;
  }
}

function absoluteUrl(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (value.startsWith('/')) return `${UPSTREAM_SITE}${encodeURI(value)}`;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/* ── 抓页面 + 解析 RSC 载荷（移植自 lib/server/upstream-catalog.ts） ───── */

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

/* ── 并发池 ───────────────────────────────────────────────────────────── */

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
      if (onProgress && done % 20 === 0) onProgress(done, items.length);
    }
  });

  await Promise.all(runners);
  if (onProgress) onProgress(done, items.length);
  return results;
}

/* ── 主流程 ───────────────────────────────────────────────────────────── */

function listPath(locale, page) {
  const prefix = locale === 'en' ? '' : `/${locale}`;
  return `${UPSTREAM_SITE}${prefix}/games${page > 1 ? `?page=${page}` : ''}`;
}

async function main() {
  const started = Date.now();

  /* ① 先拿中文第一页，确认总条数 → 推算页数 */
  const first = await fetchFlight(listPath('zh', 1));
  const totalMatch = /"className":"font-semibold","children":(\d+)/.exec(first);
  const total = totalMatch ? Number(totalMatch[1]) : 0;
  const pageCount = Math.min(PAGES > 0 ? PAGES : Number.POSITIVE_INFINITY, Math.ceil(total / PAGE_SIZE) || 1);
  console.log(`源站共 ${total} 款，按 ${PAGE_SIZE} 款一页 → ${pageCount} 页 × ${LOCALES.length} 语言 = ${pageCount * LOCALES.length} 个请求`);

  /* ② 并发抓全部列表页 */
  const tasks = [];
  for (const locale of LOCALES) {
    for (let page = 1; page <= pageCount; page += 1) tasks.push({ locale, page });
  }

  const pages = await pool(
    tasks,
    CONCURRENCY,
    async ({ locale, page }) => {
      /* 第一页已经抓过（中文），复用，省一趟 */
      if (locale === 'zh' && page === 1) return { locale, page, games: gameObjects(first) };
      const flight = await fetchFlight(listPath(locale, page));
      return { locale, page, games: gameObjects(flight) };
    },
    (done, all) => console.log(`  抓取 ${done}/${all} 页（${((Date.now() - started) / 1000).toFixed(0)}s）`)
  );

  /* ③ 按 slug 合并四个语言 */
  const bySlug = new Map();
  for (const { locale, games } of pages) {
    for (const raw of games ?? []) {
      if (!bySlug.has(raw.slug)) bySlug.set(raw.slug, {});
      bySlug.get(raw.slug)[locale] = raw;
    }
  }
  console.log(`合并后 ${bySlug.size} 款游戏（原始 ${[...bySlug.values()].reduce((n, item) => n + Object.keys(item).length, 0)} 条语言记录）`);

  /* ④ 组装各表的行 */
  const consoleRows = new Map(); // console_type → { console_type, image_url }
  const consoleText = new Map(); // `${type}:${locale}` → row
  const developerRows = new Map();
  const developerText = new Map();
  const seriesRows = new Map();
  const seriesText = new Map();
  const gameRows = [];
  const textRows = [];
  const romRows = [];

  let skippedNoConsole = 0;
  let skippedNoImage = 0;
  /* 认不出机种的都是**本站跑不了**的那几台（N64 / PS2 / 土星…），记下来方便核对 */
  const skippedConsoleTypes = new Map();

  for (const [slug, perLocale] of bySlug) {
    /* 以中文那份为骨架，缺了就用第一个有数据的语言 */
    const primary = perLocale.zh ?? Object.values(perLocale)[0];
    const consoleType = toConsoleType(primary.consoleType ?? primary.console);
    if (!consoleType) {
      skippedNoConsole += 1;
      const label = String(primary.consoleType ?? primary.console ?? '?');
      skippedConsoleTypes.set(label, (skippedConsoleTypes.get(label) ?? 0) + 1);
      continue;
    }

    const imageUrl = absoluteUrl(primary.thumbnail);
    if (!imageUrl) {
      skippedNoImage += 1;
      continue;
    }

    const developer = primary.developer && typeof primary.developer === 'object' ? primary.developer : null;
    const seriesObj = primary.series && typeof primary.series === 'object' ? primary.series : null;

    /* 机种：名字取每个语言页上的 `console` 字段 */
    if (!consoleRows.has(consoleType)) {
      consoleRows.set(consoleType, {
        console_type: consoleType,
        image_url: null,
        sort_order: CONSOLE_ORDER[consoleType] ?? 100,
      });
    }
    for (const locale of LOCALES) {
      const name = perLocale[locale]?.console;
      if (!name) continue;
      consoleText.set(`${consoleType}:${locale}`, { console_type: consoleType, locale, name: String(name).trim() });
    }

    /* 开发商 / 系列 */
    if (developer?.slug) {
      const dslug = String(developer.slug);
      if (!developerRows.has(dslug)) {
        developerRows.set(dslug, {
          slug: dslug,
          image_url: absoluteUrl(developer.logo),
          founded_year: Number.isFinite(Number(developer.founded)) ? Number(developer.founded) : null,
          website: null,
        });
      }
      for (const locale of LOCALES) {
        const raw = perLocale[locale]?.developer;
        if (!raw || typeof raw !== 'object') continue;
        developerText.set(`${dslug}:${locale}`, {
          developer_slug: dslug,
          locale,
          name: raw.name ? String(raw.name).trim() : null,
          summary: raw.description ? String(raw.description).trim() : null,
          description: Array.isArray(raw.about?.description)
            ? raw.about.description.join('\n\n')
            : null,
        });
      }
    }

    if (seriesObj?.slug) {
      const sslug = String(seriesObj.slug);
      if (!seriesRows.has(sslug)) {
        seriesRows.set(sslug, { slug: sslug, image_url: absoluteUrl(seriesObj.logo) });
      }
      for (const locale of LOCALES) {
        const raw = perLocale[locale]?.series;
        if (!raw || typeof raw !== 'object') continue;
        seriesText.set(`${sslug}:${locale}`, {
          series_slug: sslug,
          locale,
          name: raw.name ? String(raw.name).trim() : null,
          description: Array.isArray(raw.about?.description)
            ? raw.about.description.join('\n\n')
            : null,
        });
      }
    }

    const releaseDate = typeof primary.releaseDate === 'string' ? primary.releaseDate.slice(0, 10) : null;
    const yearMatch = /(\d{4})/.exec(primary.releaseDate ?? '');

    gameRows.push({
      slug,
      console_type: consoleType,
      image_url: imageUrl,
      year: yearMatch ? Number(yearMatch[1]) : null,
      release_date: /^\d{4}-\d{2}-\d{2}$/.test(releaseDate ?? '') ? releaseDate : null,
      developer_slug: developer?.slug ? String(developer.slug) : null,
      series_slug: seriesObj?.slug ? String(seriesObj.slug) : null,
      genres: Array.isArray(primary.genre) ? primary.genre.filter((x) => typeof x === 'string') : [],
      tags: Array.isArray(primary.tags) ? primary.tags.filter((x) => typeof x === 'string') : [],
      is_featured: Boolean(primary.isFeatured),
      is_popular: Boolean(primary.isPopular),
    });

    /* 文案：四个语言各一行（全空的不写） */
    for (const locale of LOCALES) {
      const raw = perLocale[locale];
      if (!raw) continue;
      const title = raw.title ? String(raw.title).trim() : null;
      const description = raw.description ? String(raw.description).trim() : null;
      const controls =
        raw.controls && typeof raw.controls === 'object'
          ? {
              description: raw.controls.description ? String(raw.controls.description).trim() : null,
              keys: Object.entries(raw.controls.keys ?? {})
                .map(([label, action]) => ({
                  label: String(label).trim(),
                  action: typeof action === 'string' ? action.trim() : '',
                }))
                .filter((item) => item.label && item.action),
            }
          : null;
      if (!title && !description && !(controls?.keys.length ?? 0)) continue;
      textRows.push({
        game_slug: slug,
        locale,
        title,
        description,
        controls: controls && (controls.description || controls.keys.length) ? controls : null,
      });
    }

    /* ROM：fileName 可能是对象（多语言）也可能是单个字符串 */
    const entries = [];
    const fileName = primary.fileName;
    if (typeof fileName === 'string') entries.push(['en', fileName]);
    else if (fileName && typeof fileName === 'object') {
      for (const [key, value] of Object.entries(fileName)) {
        if (typeof value === 'string' && value.trim()) entries.push([key, value]);
      }
    }

    const seenLang = new Set();
    for (const [key, raw] of entries) {
      const language = ROM_LANG[key.toLowerCase()] ?? key.toLowerCase();
      if (seenLang.has(language)) continue;
      const stored = toStoredSource(raw);
      if (!stored) continue;
      seenLang.add(language);
      romRows.push({
        game_slug: slug,
        language,
        rom_name: fileNameOf(raw),
        source_url: stored,
      });
    }
  }

  console.log(
    `组装完成：游戏 ${gameRows.length} / 文案 ${textRows.length} / ROM ${romRows.length} / ` +
      `开发商 ${developerRows.size} / 系列 ${seriesRows.size} / 机种 ${consoleRows.size}` +
      (skippedNoConsole ? `（跳过认不出机种 ${skippedNoConsole}）` : '') +
      (skippedNoImage ? `（跳过无封面 ${skippedNoImage}）` : '')
  );

  /* 机图：源站首页那条机种条里带 logo，一趟请求补齐 */
  try {
    const home = await fetchFlight(`${UPSTREAM_SITE}/zh`);
    const pattern =
      /"href":"\/zh\/([a-z0-9-]+-games)".{0,500}?"src":"(\/images\/consoles\/logo\/[^"]+)"/gs;
    for (const match of home.matchAll(pattern)) {
      const type = SLUG_TO_CONSOLE[match[1]];
      if (!type || !consoleRows.has(type)) continue;
      consoleRows.get(type).image_url = absoluteUrl(match[2]);
    }
    console.log(`机图补齐 ${[...consoleRows.values()].filter((row) => row.image_url).length}/${consoleRows.size}`);
  } catch (error) {
    console.warn('机图抓取失败（不影响其它数据）:', error.message);
  }

  if (DRY) {
    if (skippedConsoleTypes.size) {
      console.log('被跳过的机种取值：', [...skippedConsoleTypes.entries()].map(([k, v]) => `${k}×${v}`).join('  '));
    }
    console.log('--dry 模式，不写库。样例：');
    console.log('  game :', JSON.stringify(gameRows[0]));
    console.log('  text :', JSON.stringify(textRows[0]));
    console.log('  rom  :', JSON.stringify(romRows[0]));
    return;
  }

  /* ⑤ 写库 */
  const url = process.env.SUPABASE_DB_URL?.trim();
  if (!url) throw new Error('缺少 SUPABASE_DB_URL（.env.local）');
  const sql = postgres(url, { ssl: 'require', prepare: false, max: 3, idle_timeout: 10, connect_timeout: 20 });

  try {
    await upsert(sql, 'consoles', consoleRows.size ? [...consoleRows.values()] : [], {
      columns: ['console_type', 'image_url', 'sort_order'],
      conflict: ['console_type'],
      update: ['image_url', 'sort_order'],
    });

    await upsert(sql, 'console_texts', [...consoleText.values()], {
      columns: ['console_type', 'locale', 'name'],
      conflict: ['console_type', 'locale'],
      update: ['name'],
    });

    await upsert(sql, 'developers', [...developerRows.values()], {
      columns: ['slug', 'image_url', 'founded_year', 'website'],
      conflict: ['slug'],
      update: ['image_url', 'founded_year', 'website'],
    });

    await upsert(sql, 'developer_texts', [...developerText.values()], {
      columns: ['developer_slug', 'locale', 'name', 'summary', 'description'],
      conflict: ['developer_slug', 'locale'],
      update: ['name', 'summary', 'description'],
    });

    await upsert(sql, 'series', [...seriesRows.values()], {
      columns: ['slug', 'image_url'],
      conflict: ['slug'],
      update: ['image_url'],
    });

    await upsert(sql, 'series_texts', [...seriesText.values()], {
      columns: ['series_slug', 'locale', 'name', 'description'],
      conflict: ['series_slug', 'locale'],
      update: ['name', 'description'],
    });

    await upsert(sql, 'games', gameRows, {
      columns: [
        'slug',
        'console_type',
        'image_url',
        'year',
        'release_date',
        'developer_slug',
        'series_slug',
        'genres',
        'tags',
        'is_featured',
        'is_popular',
      ],
      conflict: ['slug'],
      update: [
        'console_type',
        'image_url',
        'year',
        'release_date',
        'developer_slug',
        'series_slug',
        'genres',
        'tags',
        'is_featured',
        'is_popular',
      ],
      casts: { release_date: 'date', genres: 'text[]', tags: 'text[]' },
    });

    await upsert(sql, 'game_texts', textRows, {
      columns: ['game_slug', 'locale', 'title', 'description', 'controls'],
      conflict: ['game_slug', 'locale'],
      update: ['title', 'description', 'controls'],
      casts: { controls: 'jsonb' },
      serialize: { controls: (value) => (value == null ? null : JSON.stringify(value)) },
    });

    await upsert(sql, 'game_roms', romRows, {
      columns: ['game_slug', 'language', 'rom_name', 'source_url'],
      conflict: ['game_slug', 'language'],
      update: ['rom_name', 'source_url'],
    });

    /* ⑥ 回读核对 */
    const counts = await sql`
      select
        (select count(*) from games)::int as games,
        (select count(*) from game_roms)::int as roms,
        (select count(*) from game_texts)::int as texts,
        (select count(*) from developers)::int as developers,
        (select count(*) from series)::int as series,
        (select count(*) from consoles)::int as consoles
    `;
    console.log('库里现在：', JSON.stringify(counts[0]));
    const perLocale = await sql`select locale, count(*)::int n from game_texts group by locale order by locale`;
    console.log('文案分语言：', perLocale.map((row) => `${row.locale}=${row.n}`).join(' '));
    const perConsole = await sql`select console_type, count(*)::int n from games group by console_type order by n desc`;
    console.log('分机种：', perConsole.map((row) => `${row.console_type}=${row.n}`).join(' '));
    console.log(`耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/* ── 批量 upsert ──────────────────────────────────────────────────────── */

const CHUNK = 200;

async function upsert(sql, table, rows, { columns, conflict, update, casts = {}, serialize = {} }) {
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

main().catch((error) => {
  console.error('迁移失败：', error);
  process.exit(1);
});
