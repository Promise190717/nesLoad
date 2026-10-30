/*
 * 给 `games.players` 补数据：**只填能落到确切人数的那些**（2026-10-30）。
 *
 * 数据源为什么是 DBpedia 而不是维基百科正文：
 *   · 上游（retrogamesnexus）页面里没有人数；
 *   · 维基数据的 P1872 / P1873（最少 / 最多人数）在电子游戏上基本是空的（实测
 *     《超级马里奥兄弟》《街霸2》《马力欧卡丁车DS》一个都没填）；
 *   · 维基百科 entry 的 `|modes=` 有，但要逐条抓 —— 匿名出口被限到 429，一次
 *     Retry-After 就 50 秒起跳，两千条根本跑不完（实测 40 分钟只爬了 12 行）。
 *   · DBpedia 把同样的 `|modes=` 落成了三元组：**每个机种一条 SPARQL 查询**
 *     就能把这一代机器的几千款全取回来，15 条请求跑完整个库。
 *
 * 只认三种能落到具体数字的写法，其余一律留 null（用户 2026-10-30：
 * 「只填写明确知道支持玩家数量的」）：
 *   · 只写单人的                          → 1（`players === 1` 就是详情页藏联机钮的判据）
 *   · 写了 N 人 / up to N players / 两人   → N，只收 2 和 4；3 和 ≥5 不在后台选项里，
 *                                          也不该被凑成 2 或 4，直接跳过
 *   · 只写 "Single-player, multiplayer"   → 跳过。知道 ≥2 但不知道几人，填 2 是替它编数据；
 *                                          详情页那边 null 本来就当多人处理，不填不影响功能
 *
 * 用法（仓库根目录）：
 *   node --env-file=.env.local scripts/fill-players-dbpedia.mjs            # dry-run，只打印
 *   node --env-file=.env.local scripts/fill-players-dbpedia.mjs --apply    # 写库
 *   node --env-file=.env.local scripts/fill-players-dbpedia.mjs --console=nes,snes
 *
 * ⚠️ DBpedia 国内直连不通 —— 默认走本机代理（Clash 混合端口 7897），`--proxy=` 可换。
 *    **不读 `HTTPS_PROXY`**：沙箱会把它指向自己的中转口（实测 502）。
 * ⚠️ 幂等：只处理 `players is null` 的行，跑一半断了直接重跑。
 */

import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const proxyArg = process.argv.find((arg) => arg.startsWith('--proxy='));
const PROXY_URL = proxyArg ? proxyArg.slice('--proxy='.length) : 'http://127.0.0.1:7897';
const consoleArg = process.argv.find((arg) => arg.startsWith('--console='));
const ONLY = consoleArg
  ? consoleArg.slice('--console='.length).split(',').map((s) => s.trim()).filter(Boolean)
  : null;

if (!process.env.SUPABASE_DB_URL) {
  console.error('缺少 SUPABASE_DB_URL，请用 --env-file=.env.local');
  process.exit(1);
}

/**
 * 站内机种 → DBpedia 的 `dbp:platforms` 资源名。
 * 括号可以直接写（SPARQL 的 `<…>` 里合法），别手贱做百分号编码。
 */
const PLATFORMS = {
  nes: 'Nintendo_Entertainment_System',
  snes: 'Super_Nintendo_Entertainment_System',
  gba: 'Game_Boy_Advance',
  nds: 'Nintendo_DS',
  ps1: 'PlayStation_(console)',
  arcade: 'Arcade_video_game',
  md: 'Sega_Genesis',
  gbc: 'Game_Boy_Color',
  gb: 'Game_Boy',
  gg: 'Game_Gear',
  sms: 'Master_System',
  ws: 'WonderSwan',
  ngp: 'Neo_Geo_Pocket',
  '32x': '32X',
  pce: 'TurboGrafx-16',
};

const ENDPOINT = 'https://dbpedia.org/sparql';
const UA = 'nesLoad-players-fill/1.0';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 跑一条 SPARQL，返回 bindings 数组。DBpedia 偶尔 5xx / 超时，退避重试三次。 */
async function sparql(query, attempt = 0) {
  const qs = new URLSearchParams({ query, format: 'application/sparql-results+json' });
  let res;
  try {
    res = await fetch(`${ENDPOINT}?${qs}`, {
      headers: { 'user-agent': UA, accept: 'application/sparql-results+json' },
      dispatcher: globalThis.__dbpediaAgent,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    if (attempt >= 3) throw err;
    console.warn(`  [warn] 请求失败（${err.message}），15s 后重试`);
    await sleep(15_000);
    return sparql(query, attempt + 1);
  }
  if (!res.ok) {
    if (attempt >= 3) throw new Error(`HTTP ${res.status}`);
    console.warn(`  [warn] HTTP ${res.status}，15s 后重试`);
    await sleep(15_000);
    return sparql(query, attempt + 1);
  }
  const data = await res.json();
  return data?.results?.bindings ?? [];
}

/*
 * 代理。undici 的 ProxyAgent 从 node_modules/.pnpm 现找 —— 项目根没直接装这个包。
 * 用 `--no-proxy` 可以直连（在能上外网的环境里用）。
 */
if (!process.argv.includes('--no-proxy')) {
  const { createRequire } = await import('node:module');
  const { readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const pnpmDir = join(process.cwd(), 'node_modules', '.pnpm');
  const undiciDir = readdirSync(pnpmDir)
    .filter((name) => /^undici@\d+\.\d+\.\d+/.test(name))
    .sort()
    .at(-1);
  if (!undiciDir) {
    console.error('node_modules/.pnpm 里找不到 undici，加 --no-proxy 或先 pnpm install');
    process.exit(1);
  }
  const require = createRequire(import.meta.url);
  const { ProxyAgent } = require(join(pnpmDir, undiciDir, 'node_modules', 'undici'));
  globalThis.__dbpediaAgent = new ProxyAgent(PROXY_URL);
  console.log(`SPARQL 走代理 ${PROXY_URL}`);
}

/** 标题归一：大小写、标点、副标题、`&` vs `and` 都揉平，只留下词。 */
function normTitle(title) {
  return title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

/**
 * DBpedia 的 modes 值 → players。
 *
 * 回来的值有三种形态：被抽成资源的（`Single-player_video_game` /
 * `Multiplayer_video_game`）、原样保留的短串（`Up to 2 players simultaneously`）、
 * 以及少量脏值（`Adventure`、`NES: Single-player`）。只认前面两类里能落到数字的。
 */
function playersFromModes(values) {
  const raw = values.map((v) => v.replace('http://dbpedia.org/resource/', '').toLowerCase());
  // `Single-player_video_game` 这种下划线形态先摊成空格，后面的判断只写一种
  const text = raw.join(' | ').replace(/_/g, ' ');

  if (!text.trim()) return { players: null, reason: 'empty' };

  // 1) 明确的数字优先：「up to 4 players」「two-player」「2」
  const digit = /(\d+)\s*-?\s*players?\b/.exec(text) ?? /^(\d+)$/.exec(text.trim());
  let explicit = digit ? Number(digit[1]) : null;
  if (explicit === null) {
    const word = /\b(one|two|three|four|five|six|seven|eight)[\s-]*players?\b/.exec(text);
    if (word) explicit = WORD_NUMBERS[word[1]];
  }
  if (explicit !== null) {
    // 只收 2 和 4：后台下拉就这两档，3 / 8 之类不能凑成 2 或 4
    if (explicit === 2 || explicit === 4) return { players: explicit, reason: `explicit-${explicit}` };
    return { players: null, reason: `explicit-${explicit}-unsupported` };
  }

  // 2) 只写单人（且没有任何多人字样）→ 1
  // ⚠️ 连字符也要认：DBpedia 里是 `Single-player_video_game`，写成 `single ?player` 匹配不到
  const mentionsMulti = /multi[- ]?player|co[- ]?op|cooperative|two[- ]player|2[- ]player/.test(text);
  const mentionsSingle = /single[- ]?player/.test(text);
  if (mentionsSingle && !mentionsMulti) return { players: 1, reason: 'single-only' };

  // 3) 其余一律跳过 —— 尤其是「single-player, multiplayer」这种不知道人数的
  return { players: null, reason: mentionsMulti ? 'multi-without-count' : 'unparsed' };
}

const sql = postgres(process.env.SUPABASE_DB_URL, { prepare: false, max: 4 });

const consoles = ONLY ?? Object.keys(PLATFORMS);
const byConsole = new Map(); // consoleType → Map<normTitle, { players, reason, name, modes }>

for (const consoleType of consoles) {
  const resource = PLATFORMS[consoleType];
  if (!resource) {
    console.warn(`跳过未知机种 ${consoleType}`);
    continue;
  }
  console.log(`拉取 ${consoleType}（${resource}）…`);
  /*
   * 一个游戏一行（按 ?name ?m 展开，一台机器几千行）。**不用 GROUP_CONCAT**：
   * Virtuoso 的分隔符必须写成 `SEPARATOR=" | "`，写位置参数直接 400，
   * 在本地分组反而更省事。
   */
  const rows = await sparql(`
    SELECT ?name ?m WHERE {
      ?g a dbo:VideoGame ;
         rdfs:label ?name ;
         dbp:platforms <http://dbpedia.org/resource/${resource}> ;
         dbp:modes ?m .
      FILTER(lang(?name) = "en")
    }
  `);

  const grouped = new Map(); // normTitle → { name, modes:Set }
  for (const row of rows) {
    const name = row.name.value;
    const key = normTitle(name);
    if (!key) continue;
    const entry = grouped.get(key) ?? { name, modes: new Set() };
    entry.modes.add(row.m.value);
    grouped.set(key, entry);
  }

  const index = new Map();
  let conflicts = 0;
  for (const [key, entry] of grouped) {
    const modes = [...entry.modes];
    const verdict = playersFromModes(modes);
    index.set(key, { ...verdict, name: entry.name, modes });
  }
  console.log(`  ${rows.length} 行 → ${index.size} 款不重名${conflicts ? `（冲突 ${conflicts}）` : ''}`);
  byConsole.set(consoleType, index);
}

const games = await sql`
  select g.slug, g.console_type, g.year,
         coalesce(t.title, g.slug) as title
    from games g
    left join game_texts t on t.game_slug = g.slug and t.locale = 'en'
   where g.players is null
   order by g.slug`;

const results = [];
const skipped = [];

/** 库里的英文名 + slug 还原名，两种都拿去对。 */
function titleCandidates(title, slug) {
  const list = [];
  for (const part of title.split(/\s+\/\s+|\s+—\s+/)) {
    if (part.trim()) list.push(part.trim());
  }
  const fromSlug = slug.replace(/-(nes|snes|gba|nds|ps1|arcade|genesis|md|gb|gbc|game)$/i, '').replace(/-/g, ' ');
  if (fromSlug) list.push(fromSlug);
  return [...new Set(list)];
}

for (const game of games) {
  const index = byConsole.get(game.console_type);
  if (!index) continue;

  const hit = titleCandidates(game.title, game.slug)
    .map((candidate) => index.get(normTitle(candidate)))
    .find(Boolean);

  if (!hit) {
    skipped.push({ ...game, reason: 'no-match' });
    continue;
  }
  if (hit.players === null) {
    skipped.push({ ...game, reason: hit.reason, dbpedia: hit.name });
    continue;
  }
  results.push({ ...game, players: hit.players, reason: hit.reason, dbpedia: hit.name });
}

const tally = new Map();
for (const r of results) tally.set(r.players, (tally.get(r.players) ?? 0) + 1);
const consoleTally = new Map();
for (const r of results) consoleTally.set(r.console_type, (consoleTally.get(r.console_type) ?? 0) + 1);

console.log(`\n=== 命中判定 ===（待处理 ${games.length} 款）`);
console.log([...tally.entries()].map(([p, n]) => `${p} 人：${n} 款`).join('　') || '（无）');
console.table([...consoleTally.entries()].map(([console_type, n]) => ({ console_type, n })));

const reasonTally = new Map();
for (const s of skipped) reasonTally.set(s.reason, (reasonTally.get(s.reason) ?? 0) + 1);
console.log('=== 跳过原因 ===');
console.table([...reasonTally.entries()].map(([reason, n]) => ({ reason, n })));

console.log('\n=== 抽样（前 25 条 1 人）===');
console.table(
  results
    .filter((r) => r.players === 1)
    .slice(0, 25)
    .map((r) => ({ slug: r.slug, console: r.console_type, dbpedia: r.dbpedia }))
);
console.log('=== 抽样（前 25 条 2 / 4 人）===');
console.table(
  results
    .filter((r) => r.players > 1)
    .slice(0, 25)
    .map((r) => ({ slug: r.slug, console: r.console_type, players: r.players, dbpedia: r.dbpedia }))
);

if (APPLY) {
  let done = 0;
  for (const r of results) {
    await sql`update games set players = ${r.players}, updated_at = now()
               where slug = ${r.slug} and players is null`;
    done += 1;
  }
  console.log(`\n已写库 ${done} 行`);
} else {
  console.log('\n（dry-run，没写库；加 --apply 落库）');
}

await sql.end();
