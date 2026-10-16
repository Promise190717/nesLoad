/*
 * 给**已有的**游戏补 `game_texts` 的 `ja` / `ko` 两行 —— 文案从上游站抓（2026-10-16）。
 *
 * 用法：
 *   node --env-file=.env.local scripts/fill-game-texts-ja-ko.mjs --dry-run      # 只抓不写，看命中率
 *   node --env-file=.env.local scripts/fill-game-texts-ja-ko.mjs --limit 20     # 先跑 20 款试水
 *   node --env-file=.env.local scripts/fill-game-texts-ja-ko.mjs --only ja      # 只补日文
 *   node --env-file=.env.local scripts/fill-game-texts-ja-ko.mjs                # 全量
 *
 * ## 为什么需要它
 *
 * 建表 + 搬运那一步（现在是 `scripts/add-game-group-key.mjs`）只把 `games` 里**已有**的
 * 中英文案搬进侧表 —— 它变不出日韩。
 * 新爬的游戏（AdminAutoCrawl）会自动带四语言，但**已有的那批**当时没有 ja / ko 行。
 * 这个脚本负责把历史数据补齐。
 *
 * ## 2026-10-16 第二轮：slug 解析换成「sitemap 全集 + 标题」两路（第一轮只补上了 1012/1258）
 *
 * 第一轮全量跑完还剩 **246 款**没有日韩。复盘下来丢的全是**两类**，都不是上游没有：
 *   · **街机**（154 / 246）—— `rom_name` 是 **MAME 短名**（`mslug` / `kof97` / `dino (1)`），
 *     从它推不出任何上游 slug；而上游的街机页用的是**完整英文标题**
 *     （`metal-slug` / `the-king-of-fighters-97` / `cadillacs-and-dinosaurs`）。
 *   · **上游挂了机种后缀的标题** —— 第一轮只在 NES / SNES 上试 `-<机种>`，
 *     实际 `-gba` / `-sega-32x` / `-game-gear` 也都存在（`mega-man-zero-2-gba`、
 *     `virtua-fighter-sega-32x`、`bishoujo-senshi-sailor-moon-s`）。
 *
 * 所以这一轮**不再靠猜 slug 再打 404**，改成：
 *   1. 先抓上游 `sitemap.xml`（一次请求）→ **slug 全集**（约 2100 条）；
 *   2. 候选 slug 由**两路**生成 —— `rom_name` 推导（老逻辑）+ **`title_en` 规范化**（新）；
 *   3. 只有**落在全集里**的候选才值得打上游；再加上**机种校验**才落库。
 *
 * ⚠️ `title_en` 这一路是**第一轮缺的那把钥匙**：实测 `games` 表 1258 条 **全部**有
 *    `title_en`（街机 162 条也是全的），而且它基本就是上游的英文标题。
 *    街机靠它从 `mslug` 一步跳到 `metal-slug`。
 *
 * ## ⚠️ sitemap 全集 ≠ 可以用标题直接写库
 *
 * 全集只回答「上游有没有这个 slug」，**不回答「这页是不是同一款游戏」**。
 * 同名跨机种在上游是两个不同 slug（`arkanoid` = NES、`arkanoid-arcade` = 街机，
 * 两页标题一模一样），所以**机种校验仍然是必须的**（见主循环）。
 * 候选顺序也照旧重要：先试裸名，机种不符再往下一个候选退。
 *
 * ## slug 从哪来（`rom_name` 这一路）
 *
 * ⚠️ `games` 表**没有存上游 slug**，也没有 `source_url`（实测 1258 条 `source_url` 全是
 *    NULL、全是自持 R2 —— 那个功能 2026-10-16 才加，还没实际用过）。
 *    所以 slug 只能从 `rom_name` 推：**去扩展名 + 去尾部语言后缀**。
 *    实测（2026-10-16）：
 *      chrono-trigger-nds-cn.zip                     → chrono-trigger-nds
 *      dragon-quest-vi-realms-of-revelation-cn.nds   → dragon-quest-vi-realms-of-revelation
 *      pokemon-ranger-guardian-signs.zip             → pokemon-ranger-guardian-signs
 *    都对得上。
 *
 * ⚠️ 但 `rom_name` 里除了语言码，还混着**机种名** / **区域码** / **整段带括号的标题**
 *    （`digimon-adventure-gba` / `crash-nitro-kart-eu` / `monopoly (usa)`），
 *    只推一个 slug 会整条跳过。所以推的是**一组候选**（见 `slugCandidates`），按顺序试。
 *
 * ⚠️ **还有一批是 GoodTools / No-Intro 命名**（`super bomberman 2 (usa)`、
 *    `super mario world 2 - yoshi's island (usa)`）—— 这类规范化后能推到一部分
 *    （见 `normalizeRomTitle`）。
 *
 * ## ⚠️ 必须校验机种，否则会写错数据
 *
 * 上游**同名跨机种是两个不同的 slug**（实测 `chrono-trigger` = SFC 版、
 * `chrono-trigger-nds` = NDS 版，而两页的日文标题**一模一样**）——
 * 只比标题分不出来，会把 SFC 版的日文名写到 NDS 版那一行上。
 * 判据用页面 JSON-LD 里的 `gamePlatform`，**且必须过 `toConsoleType()`**：
 *    上游给的长名与我们的短码**并不相等**（`gameboy` ≠ `gb`、
 *    `sega-32x` ≠ `32x`、`wonderswan` ≠ `ws`…），用 `===` 比会把那六台整段误拒
 *    （第一轮实测踩到，GB / WS / SMS / GG / 32X 段被整批挡掉）。
 *
 * ## ⚠️ 状态码没有用
 *
 * 上游对**不存在的 slug** 回的是 Next 的 not-found 页（实测 404）。
 * 判据一律是「页面里有没有 JSON-LD 的 `VideoGame` 节点」—— 真页面有，not-found 页没有。
 * （有了 sitemap 全集之后，这一步只是兜底：候选本来就已经过滤过一遍了。）
 *
 * ## 幂等与安全
 *
 * · 写入用 `ON CONFLICT DO NOTHING` —— **只补缺的行，绝不覆盖已存在的**。
 *   重复跑无害，也不会把人工改过的日韩文案冲掉。
 * · 一条失败不影响别的（每款独立 try）。
 * · 只读上游页面，**不下载任何 ROM 字节**。
 * · ⚠️ 全量是 1258 款 × 2 语言 ≈ **2500 次上游请求**（4 并发，大约十几分钟）。
 *   加上候选 slug 的**回退重试**（只有前一个候选没命中才会试下一个），
 *   实测约 1.5～2 倍 —— 按 3000～4500 次估。
 *   先 `--limit 20 --dry-run` 看命中率，再决定要不要全量。
 */
const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID } = process.env;

if (!CF_ACCOUNT_ID || !CF_D1_API_TOKEN || !D1_DATABASE_ID) {
  console.error('缺少环境变量：需要 CF_ACCOUNT_ID / CF_D1_API_TOKEN / D1_DATABASE_ID');
  console.error(
    '用法：node --env-file=.env.local scripts/fill-game-texts-ja-ko.mjs [--dry-run] [--limit N] [--only ja|ko]'
  );
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');

/** `--limit N`：只处理前 N 款（试水用）。不传 = 全量。 */
const LIMIT = (() => {
  const at = process.argv.indexOf('--limit');
  const n = at === -1 ? Number.NaN : Number.parseInt(process.argv[at + 1] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
})();

/** `--only ja|ko`：只补一个语言。不传 = 两个都补。 */
const ONLY = (() => {
  const at = process.argv.indexOf('--only');
  const value = at === -1 ? '' : String(process.argv[at + 1] ?? '').toLowerCase();
  return value === 'ja' || value === 'ko' ? value : null;
})();

/** 要补的语言。⚠️ 顺序固定 —— 日志与统计都按它。 */
const TARGET_LOCALES = ONLY ? [ONLY] : ['ja', 'ko'];

const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

/** 跑一条 SQL。D1 的 `/query` 单次只吃一条语句（但可以带参数）。 */
async function run(sql, params = []) {
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
    throw new Error(
      `${detail || `HTTP ${res.status}`}（语句：${sql.replace(/\s+/g, ' ').slice(0, 140)}）`
    );
  }
  return data.result[0].results ?? [];
}

/* ── 上游抓取 + 解析 ─────────────────────────────────────────────────────
 *
 * ⚠️ 下面这几段与 `app/api/admin/scrape-game/route.ts` 是**两套实现**：
 *    那边是 TS、跑在 Next 里（依赖 `@/lib/server/*`），这个脚本 import 不了。
 *    改那边的解析规则时**这里要跟着改** —— 两边漂开的表现是
 *    「爬取时填的日韩」与「回填出来的日韩」不一致。
 */

const UPSTREAM_SITE = 'https://retrogamesnexus.com';
const UPSTREAM_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** 抓一个上游页面（`path` 以 `/` 开头）。非 2xx 抛错。 */
async function fetchHtml(path) {
  const res = await fetch(`${UPSTREAM_SITE}${path}`, {
    headers: { 'user-agent': UPSTREAM_USER_AGENT, accept: 'text/html' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** 取出页面里所有 JSON-LD 块，拍平成一维节点数组。 */
function jsonLdNodes(html) {
  const out = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(re)) {
    try {
      const parsed = JSON.parse(match[1]);
      const graph = parsed['@graph'];
      if (Array.isArray(graph)) out.push(...graph);
      else out.push(parsed);
    } catch {
      // 坏块跳过，别让一块坏 JSON 毁掉整页解析
    }
  }
  return out;
}

/** 去掉标签与常见实体，压掉多余空白。 */
function stripTags(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 简介：取「关于」那个小标题下面的**第一段**。
 *
 * ⚠️ 小标题是**四语言的**（2026-10-16 实测，与 scrape-game 的 `aboutText` 同一套词表）：
 *    中文 `关于 …` / 英文 `About …` / 日文 `… について` / 韩文 `… 소개`。
 *    少认一个，那个语言的简介就抓不到、只剩 null。
 */
function aboutText(html) {
  const heading = html.match(/<h[1-6][^>]*>[^<]*(?:关于|About|について|소개)[^<]*<\/h[1-6]>/i);
  if (!heading || heading.index === undefined) return null;

  const rest = html.slice(heading.index + heading[0].length);
  const stop = rest.search(/<h[1-6][^>]*>/i);
  const body = stop === -1 ? rest : rest.slice(0, stop);

  const first = body.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const text = first ? stripTags(first[1]) : '';
  return text || null;
}

/** 第一个指向 `/<kind>/<slug>` 的链接文字（系列就挂在这种链接上）。 */
function linkText(html, kind) {
  const match = html.match(new RegExp(`<a[^>]*/${kind}/[^>]*>([\\s\\S]*?)</a>`, 'i'));
  const text = match ? stripTags(match[1]) : '';
  return text || null;
}

/**
 * 上游文字里出现某个**短标识**（`md` / `gg` / `ws` / `ngp`）时也算命中。
 *
 * 为什么不能直接用 `includes`：这几个只有两三个字母，子串匹配会误伤
 * （`md` 会命中 `cmd`、`ws` 会命中 `news`）。按整词边界匹配就没这个问题 ——
 * 上游的机种 slug 长这样：`/zh/sega-32x-games`，短横线（下面已被拍成空格）
 * 正好是边界。
 */
function hasToken(text, token) {
  return new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`).test(text);
}

/**
 * 上游机种写法 → 站内 ConsoleType。**认不出返回 null**。
 *
 * ⚠️ **这是 `lib/server/upstream.ts` 里 `toConsoleType()` 的移植** ——
 *    那份是 TS、带 `@/` 路径别名，这个脚本 import 不了。
 *    两边是**两套实现**，改一边必须改另一边；漂开的表现是
 *    「后台爬取判定的机种」与「回填脚本判定的机种」不一致。
 *    ⚠️ 唯一允许的差异：那边返回 `ConsoleType`，这边返回字符串。
 *
 * ⚠️ **上游给的是带连字符的 slug，不是可读名**（2026-10-14 实测）：
 *    `gameboy` / `sega` / `sega-game-gear` / `sega-master-system` / `sega-32x` /
 *    `neogeo-pocket` / `wonderswan` / `snes` / `nes` / `gbc` / `gba` / `arcade`。
 *    所以下面**先把 `-` / `_` 拍成空格**再匹配 —— 这样既认 slug，也照旧认
 *    "Super Nintendo" 那种可读名（同一套词表，不用维护两份）。
 *
 * ⚠️ **判断顺序是有讲究的，别按字母重排**（与 upstream.ts 逐条一致）：
 *    · `gba` / `gbc` 必须排在 `game boy` 之前（否则被笼统的 `game boy` 吞掉）；
 *    · `snes` 必须排在 `nes` 之前（同一个原因）；
 *    · `32x` 必须排在 `genesis` / `sega` 之前 —— 32X 的游戏页也写着世嘉；
 *    · `game gear` / `master system` 必须排在光秃秃的 `sega` 之前；
 *    · `neo geo pocket` 必须排在 `neo geo` 之前（口袋机是掌机，不是街机）。
 *
 * ℹ️ 上游还有一批**我们跑不了**的机种（N64 / 土星 / Jaguar / Sega CD / PC Engine CD /
 *    MSX2 / 3DS / PS2 及以后的 PlayStation）—— 一律返回 null，调用方当机种不符跳过。
 *    ⚠️ PS1 2026-10-16 起**不在这批里了**（本站能跑），别再把它当跑不了的机种。
 */
function toConsoleType(value) {
  const raw = String(value ?? '')
    .toLowerCase()
    .trim();
  if (!raw) return null;

  // slug → 可读名（`sega-game-gear` → `sega game gear`）；紧凑形用来兜 `gameboy` 这种连写
  const text = raw.replace(/[-_]+/g, ' ');
  const compact = text.replace(/\s+/g, '');

  // 我们跑不了的那几台：必须在 `sega` 兜底之前挡掉（见上面 ℹ️）
  if (text.includes('sega cd') || text.includes('sega saturn')) return null;
  // 3DS / 2DS 也跑不了 —— 必须在下面 `ds` 那条之前挡掉（`3ds` 里含 `ds`）
  if (text.includes('3ds') || text.includes('2ds')) return null;

  // NDS。⚠️ `ds` 按整词匹配；`nds` 三字母可以放心用 includes
  if (compact.includes('nds') || text.includes('nintendo ds') || hasToken(text, 'ds')) {
    return 'nds';
  }

  // 任天堂掌机（长名在前，短代号在后）
  if (compact.includes('gba') || compact.includes('gameboyadvance')) return 'gba';
  if (compact.includes('gbc') || compact.includes('gameboycolor')) return 'gbc';
  if (compact.includes('gameboy') || text.includes('game boy')) return 'gb';

  // 任天堂家用机
  if (text.includes('snes') || text.includes('super nintendo') || text.includes('super famicom')) {
    return 'snes';
  }
  /*
   * ⚠️ `nes` 必须**按整词**匹配，不能用 `includes`：`genesis` 里就藏着 `n-e-s`
   * （g-e-**n-e-s**-i-s），用子串匹配的话「sega-genesis-games」会被判成红白机。
   */
  if (hasToken(text, 'nes') || text.includes('famicom')) return 'nes';

  /*
   * 索尼（2026-10-16 起 PS1 能跑了）—— 与 upstream.ts 逐条一致。
   * ⚠️ 先把跑不了的挡掉，否则 `playstation 2` / `playstation portable` 会被吞成 PS1。
   */
  if (
    /playstation\s*(2|3|4|5|portable|vita)/.test(text) ||
    ['ps2', 'ps3', 'ps4', 'ps5', 'psp', 'vita'].some((token) => hasToken(text, token))
  ) {
    return null;
  }
  if (text.includes('playstation') || hasToken(text, 'ps1') || hasToken(text, 'psx')) {
    return 'ps1';
  }

  // 世嘉：32X 在 MD 之前；光秃秃的 `sega` 排最后（Game Gear / Master System 也带 sega）
  if (hasToken(text, '32x')) return '32x';
  if (text.includes('genesis') || text.includes('mega drive') || hasToken(text, 'md')) return 'md';
  if (text.includes('game gear') || hasToken(text, 'gg')) return 'gg';
  if (text.includes('master system') || text.includes('mark iii') || hasToken(text, 'sms')) {
    return 'sms';
  }
  if (hasToken(text, 'sega')) return 'md';

  // 其它掌机：口袋机在「一般 neo geo」之前
  if (
    text.includes('neo geo pocket') ||
    text.includes('neogeo pocket') ||
    hasToken(text, 'ngpc') ||
    hasToken(text, 'ngp')
  ) {
    return 'ngp';
  }
  if (text.includes('wonderswan') || text.includes('wonder swan') || hasToken(text, 'ws')) {
    return 'ws';
  }

  // 街机垫底：`neo geo` 这类落在这一档（FBNeo 跑的就是 MVS / AES 那套 romset）
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

/**
 * 从一个游戏页解析出要写进侧表的三个字段。
 *
 * 返回 `null` = **这页不是真游戏页**（假 slug / not-found 页）——
 * ⚠️ 这是唯一的真假判据，**别去看 HTTP 状态码**（上游的 not-found 页也带
 *    `application/ld+json`，但没有 `VideoGame` 节点）。
 */
function parseGamePage(html) {
  const node = jsonLdNodes(html).find((n) => n['@type'] === 'VideoGame');
  if (!node) return null;

  const rawPlatform =
    typeof node.gamePlatform === 'string' ? node.gamePlatform.trim().toLowerCase() || null : null;

  return {
    title: typeof node.name === 'string' ? node.name.trim() || null : null,
    /** 上游的**原始写法**（`gameboy` / `sega-32x`…）—— 只用来写日志，不参与比较 */
    platformRaw: rawPlatform,
    /** ⚠️ 收敛成站内机种 —— **比较用的是这个**（见 `toConsoleType` 那段） */
    platform: toConsoleType(rawPlatform),
    series: linkText(html, 'game-series'),
    description: aboutText(html),
  };
}

/* ── ① 上游 slug 全集（sitemap） ────────────────────────────────────────── */

/**
 * 上游 `sitemap.xml` 是**唯一一份把全部游戏 slug 说清楚的地方**。
 *
 * 为什么要它：`rom_name` / `title_en` 只能**猜** slug，猜完还得挨个打 404 才知道
 * 猜没猜中（第一轮就是这么把 154 款街机全丢掉的）。有了全集，「猜」这一步变成
 * **离线比对**，只有真存在的 slug 才值得发请求。
 *
 * ⚠️ 拿的是**不带语言前缀**的那份（`/games/<slug>`）—— 全集是跨语言共用的，
 *    语言只影响抓哪一页（`/{locale}/games/<slug>`）。
 * ⚠️ 抓不到（网络 / 上游改结构）**不致命**：返回 null，主循环退回「盲试候选」的老路。
 */
async function loadUpstreamSlugs() {
  try {
    const xml = await fetchHtml('/sitemap.xml');
    const slugs = new Set();
    for (const m of xml.matchAll(/https:\/\/retrogamesnexus\.com\/games\/([a-z0-9-]+)</g)) {
      slugs.add(m[1]);
    }
    if (slugs.size < 100) throw new Error(`只解析出 ${slugs.size} 条，结构可能变了`);
    return slugs;
  } catch (error) {
    console.warn(`⚠️ sitemap 抓取失败（${error.message}）—— 退回盲试候选。`);
    return null;
  }
}

/* ── ② 候选 slug 生成 ──────────────────────────────────────────────────── */

/**
 * ROM 文件名的扩展名。
 *
 * ⚠️ **2026-10-16 补了 `gg` / `sms` / `32x`**（顺带 `col` / `a26` 两个跑不了的）。
 *    原来那张表是照「我们支持的机种」抄的，漏了这三个 —— 于是 `sonic-blast.gg`
 *    剥完还剩 `sonic-blast.gg`，带着扩展名去抓，必然「无此页」。
 */
const ROM_EXT =
  /\.(zip|7z|rar|nes|unf|unif|sfc|smc|fig|gb|gbc|gba|nds|md|gen|bin|iso|ws|wsc|ngp|ngc|gg|sms|32x|col|a26)$/i;

/**
 * 尾部语言后缀。**只收明确的两字母语言码** ——
 * 单字母（`-j` / `-u` / `-e`）和 `world` 的误伤面太大
 * （`super-mario-world` 会被当成 `super-mario`）。
 *
 * ⚠️ 必须带 `\d*`：库里有些 `rom_name` 是**重复上传的副本**，后缀带序号 ——
 *    实测 `super-mario-64-ds-cn2.nds`，真实 slug 是 `super-mario-64-ds`。
 */
const LANG_SUFFIX = /-(cn|zh|ja|jp|ko|kr|en)\d*$/i;

/**
 * 尾部的**机种名**。和语言后缀一样是 ROM 命名习惯，不是标题的一部分。
 *
 * ⚠️ 2026-10-16 第二轮补了**可读长名**（`-game-gear` / `-sega-32x` / `-mega-drive`…）——
 *    只收短码的话 `bishoujo-senshi-sailor-moon-s-game-gear.gg` 剥不掉 `-game-gear`。
 * ⚠️ 刻意**不收 `ds`** —— `super-mario-64-ds` 是真实 slug（那个 `ds` 是标题的一部分）。
 */
const CONSOLE_SUFFIX =
  /-(nes|snes|sfc|gb|gbc|gba|nds|md|gen|gg|sms|32x|ws|wsc|ngp|ngpc|arcade|game-gear|game-boy|gameboy|game-boy-color|master-system|mark-iii|mega-drive|wonderswan|neogeo-pocket)$/i;

/**
 * 尾部的**区域码**（`-eu` / `-us` / `-japan` …）。
 *
 * ⚠️ **单字母的区域码（`-e` / `-u` / `-j`）不收** —— 误伤面太大
 *    （`super-mario-world` 那类会被削）。
 * ⚠️ **`world` 也刻意不收**：`super-mario-world` 会被削成 `super-mario`，
 *    而后者在上游**真的存在**（是另一款游戏）。
 */
const REGION_SUFFIX =
  /-(eu|us|jp|uk|au|br|de|fr|it|es|nl|kr|cn|zh|ja|ko|en|usa|europe|japan|asia|korea|china)$/i;

/**
 * 尾部的**版本号**（`-v1.3` / `-v5-7` —— ROM 站给改版打的构建号，不是标题的一部分）。
 *
 * ⚠️ 必须收：`pokemon-ultra-emerald-v5.7.zip` 剥完扩展名还剩 `-v5.7`，
 *    带点的形态过不了 `SLUG_SHAPE`，整条种子被丢 —— 而**真实 slug 就是
 *    `pokemon-ultra-emerald`**（实测）。
 * ⚠️ 只在 `rom_name` 这一路剥 —— `title_en` 里没有这种东西。
 */
const VERSION_SUFFIX = /-v\d+(\.\d+)*$/i;

/** 上游 slug 只由**小写字母 / 数字 / 连字符**组成 —— 带空格或括号的形态不可能是 slug。 */
const SLUG_SHAPE = /^[a-z0-9-]+$/;

/**
 * NES / SNES 之外，**其它机种在上游也挂后缀**（2026-10-16 第二轮照 sitemap 实测）：
 *   `mega-man-zero-2-gba` / `virtua-fighter-sega-32x` / `castlevania-double-pack-gba` /
 *   `breakfast`…
 * ⚠️ 同一个标题在上游**可能裸名、也可能带后缀**，两种都得试，不能只挑一种。
 * ⚠️ 后一种写法照 **sitemap 里真实出现过**的抄，别自由发挥（打不中就是白打上游）。
 */
const SUFFIX_BY_CONSOLE = {
  nes: ['-nes'],
  snes: ['-snes'],
  gba: ['-gba'],
  gb: ['-gb', '-gameboy'],
  gbc: ['-gbc'],
  nds: ['-nds'],
  md: ['-md', '-genesis', '-mega-drive'],
  gg: ['-gg', '-game-gear'],
  sms: ['-sms', '-master-system'],
  '32x': ['-32x', '-sega-32x'],
  ws: ['-ws', '-wonderswan'],
  ngp: ['-ngp', '-neogeo-pocket'],
  arcade: ['-arcade'],
};

/**
 * GoodTools / No-Intro 命名 → 上游 slug 形态。
 *
 * 库里有一批 `rom_name` 是**带括号区域段的完整标题**（不是 slug）：
 *   `monopoly (usa)` / `super bomberman 2 (usa)` / `side pocket (usa)`。
 * 规则：去括号段 → 去标点 → ` - ` 与空格拍成 `-`。
 *
 * ⚠️ `(1)` / `(2)` 这种**重名副本**的序号也在括号里，一并去掉是对的 ——
 *    实测 `dino (1)` / `wof (1)` 的 `(1)` 是站内自己的去重后缀。
 */
function normalizeRomTitle(stem) {
  return stem
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/['’.,:!?]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** 标题 → slug（去重音、去标点、`&` → ` and `、连续非字母数字拍成一个 `-`）。 */
function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bvs\.?\b/gi, 'vs')
    .replace(/&/g, ' and ')
    .replace(/[™®©]/g, ' ')
    .replace(/[‘’']/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/**
 * 罗马数字 ↔ 阿拉伯数字。
 *
 * ⚠️ 这条不是可选的：上游**同款游戏两种写法都用** ——
 *    我们的 `title_en` 是 `Final Fantasy I & II: Dawn of Souls`、上游 slug 是
 *    `final-fantasy-1-and-2-dawn-of-souls`；反过来 `Dragon Ball Z: The Legacy of Goku II`
 *    的上游 slug 又是 `dragon-ball-z-legacy-of-goku-ii`。
 *    所以**两个方向都要生成**，不能只挑一边。
 * ⚠️ 必须在 **slugify 之后**再换 —— 拿原来的标题换会被 `II:` 这种带标点的词元漏过去。
 */
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
function romanToArabic(slug) {
  return slug
    .split('-')
    .map((tok) => (ROMAN[tok] ? String(ROMAN[tok]) : tok))
    .join('-');
}
function arabicToRoman(slug) {
  const back = {};
  for (const [roman, n] of Object.entries(ROMAN)) back[n] = roman;
  return slug
    .split('-')
    .map((tok) => (back[tok] ? back[tok] : tok))
    .join('-');
}

/**
 * 英文名 ↔ 上游名之间的**别名**（上游两个名字混着用，我们的 `title_en` 只有一边）。
 *
 * ⚠️ 目前只有一条，但是硬需求：`Street Fighter Alpha 3` 在 MAME 里叫 `sfa3`、
 *    在我们库里叫 `Street Fighter Alpha 3`，而上游的**街机版** slug 是
 *    `street-fighter-alpha-zero-3` —— **`Alpha` 和 `Zero` 两个词都写上**。
 *    没有这条，那款游戏会被判成「机种不符」——因为标题推出的
 *    `street-fighter-alpha-3` 在上游**存在，但是 GBA 版**（实测：
 *    同一个标题上游有两个 slug，`gamePlatform` 一个 `arcade` 一个 `gba`）。
 * ⚠️ 是**追加候选**不是替换 —— 两个方向都生成，靠机种校验挑。
 */
const TITLE_ALIASES = [['alpha', 'alpha-zero']];

/** 把 slug 里某个词元整体换成别名（只换整词元；`to` 写成多段就是插词）。 */
function withAlias(slug, from, to) {
  return slug
    .split('-')
    .map((token) => (token === from ? to : token))
    .join('-');
}

/**
 * 人工兜底表：`rom_name` → 上游 slug。**只放有实测证据、别的规则推不出来的**。
 *
 * ⚠️ key 必须是库里真实的 `rom_name`（小写）。命中就直接当第一个候选试，
 *    照样过机种校验 —— 写错了也只会「认不出机种然后跳过」，不会写错数据。
 *
 * · `chou-nekketsu-koukou-kunio-kun-dodgeball-bu-cn.zip`（街机）
 *    —— 这款就是 Technos 的**街机版**熱血高校ドッジボール部，上游给街机版用的
 *    标题是 `super-dodge-ball-arcade`（欧美名），不是日文原名。
 *    而 `chou-nekketsu-koukou-kunio-kun-dodgeball-bu` 在上游是 **NDS 版**，
 *    所以按标题推出来的 slug 必然「机种不符」（实测）。
 *    库里同一款游戏另有一条 `sdodgeb.zip`（英文名 Super Dodge Ball）已经对上这页，
 *    两条同款、指向同一页是对的。
 */
const SLUG_OVERRIDES = {
  'chou-nekketsu-koukou-kunio-kun-dodgeball-bu-cn.zip': ['super-dodge-ball-arcade'],
};

/**
 * 一个种子 slug 衍生的全部形态：它自己，以及「再剥机种名 / 区域码 / 语言码」的收敛链，
 * 每个形态再拼一遍机种后缀。
 *
 * ⚠️ 用 while 收敛而不是写死两层组合：`xxx-gba-eu` 要先掉 `-eu` 再掉 `-gba`。
 */
function expandSeed(seed, consoleType, out) {
  if (!seed || !SLUG_SHAPE.test(seed)) return;
  const chain = [seed];
  let trimmed = seed;
  for (let i = 0; i < 4; i += 1) {
    const next = trimmed
      .replace(VERSION_SUFFIX, '')
      .replace(CONSOLE_SUFFIX, '')
      .replace(REGION_SUFFIX, '')
      .replace(LANG_SUFFIX, '');
    if (next === trimmed || !next) break;
    trimmed = next;
    chain.push(trimmed);
  }
  for (const entry of chain) {
    out.push(entry);
    for (const suffix of SUFFIX_BY_CONSOLE[consoleType] ?? []) out.push(`${entry}${suffix}`);
  }
}

/* 词元倒排索引 —— 给「标题对但 slug 写法不一样」的兜底召回（见 `fuzzyRecall`）。 */
const STOP_TOKENS = new Set(['the', 'a', 'an', 'of', 'on', 'in', 'and']);
/**
 * ⚠️ 长度 <3 的**非数字**词元本来想一律忽略（`Chip 'n Dale` 的 `n` 是缩写不是词），
 *    但**罗马数字不能忽略**：它只有 1～3 个字母，却常常是区分两款游戏的唯一线索 ——
 *    `The Goonies` 与 `The Goonies II`、`Raiden` 与 `Raiden II`。
 *    第一版把 `ii` 也过滤了，结果 `The Goonies II` 召回候选里 `goonies` 排在
 *    `goonies-ii` 前面，**差点把一代的日文名写到二代那一行**（实测踩到）。
 *    所以规则是：数字保留，**罗马数字也保留**，只丢 `n` / `of` 这种。
 */
const tokensOf = (slug) =>
  slug
    .split('-')
    .filter(
      (t) => t && !STOP_TOKENS.has(t) && !(t.length < 3 && !/^\d+$/.test(t) && !ROMAN[t])
    );

/** 词元相等 / 互为前缀 / 长词编辑距离 ≤1（上游自己有拼写出入：`ghostsn` / `nighmare`）。 */
function tokenMatch(a, b) {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  if (a.length < 6 || b.length < 6) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    diff += 1;
    if (diff > 1) return false;
    if (a.length > b.length) i += 1;
    else if (a.length < b.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

/**
 * 词元召回：标题的每个词元都要能在某个 slug 里找到（相等 / 前缀 / 差一个字母），
 * 且那个 slug **多出来的词元都是「无关紧要」的**（机种名 / `version` / 冠词…）。
 *
 * ⚠️ 为什么需要它：我们的 `title_en` 与上游 slug **不是同一套写法** ——
 *    `Pokémon Diamond` → `pokemon-diamond-version`（上游多一个 `version`）、
 *    `Guardians / Denjin Makai II` → `guardians`（上游只留主标题）。
 *    纯精确匹配会把这批全丢掉。
 * ⚠️ **多出来的词元必须落在白名单里**，否则会误召回「另一款游戏」：
 *    `The King of Fighters '97 Plus`（盗版改版）绝不能配上 `the-king-of-fighters-97`。
 */
const EXTRA_TOKEN_OK = new Set([
  'version', 'arcade', 'nes', 'snes', 'gb', 'gbc', 'gba', 'nds', 'md', 'genesis', 'mega', 'drive',
  'gg', 'game', 'gear', 'sms', 'master', 'system', 'sega', '32x', 'ws', 'wonderswan', 'ngp',
  'neogeo', 'pocket', 'gameboy', 'color', 'cd', 'special', 'edition', 'plus', 'turbo', 'super',
]);

function fuzzyRecall(seed, index) {
  const need = tokensOf(seed);
  if (!need.length) return [];
  let acc = null;
  for (const token of need) {
    const bucket = new Set();
    for (const [indexed, slugs] of index) {
      if (tokenMatch(token, indexed)) for (const slug of slugs) bucket.add(slug);
    }
    if (!bucket.size) return [];
    acc = acc ? new Set([...acc].filter((s) => bucket.has(s))) : bucket;
    if (!acc.size) return [];
  }
  const hits = [];
  for (const slug of acc) {
    const have = tokensOf(slug);
    if (have.every((h) => need.some((n) => tokenMatch(n, h)) || EXTRA_TOKEN_OK.has(h))) {
      hits.push(slug);
    }
  }
  return hits.slice(0, 4);
}

/**
 * 从**两路**推出候选 slug（有序，越靠前越可能是真的）。
 *
 * ① `title_en` 规范化（第二轮新增，**街机唯一能走的路**）
 * ② `rom_name` 推导（第一轮的老路，掌机 / 家用机基本都对）
 * ③ 词元模糊召回（兜上游与我们的写法出入）
 *
 * ⚠️ **`romNames` 是数组**：`group_key` 形状下同一款可能有好几盘 ROM
 *    （`zelda-link-to-the-past.smc` 和 `cdbe2a…c1064.sfc` 是同一款的两份拷贝，
 *    其中一份的文件名是 sha 哈希、推不出任何 slug）。**候选要跨这几盘一起推** ——
 *    只看被留下的那一条，哈希文件名那条会让整款失去候选（实测踩到）。
 *
 * ⚠️ **推错也不会写错数据**：捕不到真页面（或机种对不上）就跳过，只是没补上。
 *    真正的护栏是机种校验（见主循环）。
 */
function slugCandidates(game, index) {
  const out = [];
  const seeds = [];

  // ① title_en
  const en = String(game.title_en ?? '').trim();
  if (en) {
    // 整标题先来一份 —— `&` → ` and `、`/` → `-` 都在 slugify 里处理
    seeds.push(slugify(en));
    /*
     * 再拆 `A: B` / `A / B` 两态：上游有的只收主标题（`art-of-fighting-3`），
     * 有的把副标题也算进去（`dungeons-and-dragons-shadow-over-mystara`），
     * 还有的只收副标题。三种都生成，靠机种校验挑。
     */
    for (const part of en.split(/\s*[/／]\s*/)) {
      const colon = part.split(/[:：]/);
      for (const variant of [colon[0], colon.slice(1).join(' ')]) {
        if (variant && variant.trim()) seeds.push(slugify(variant));
      }
    }
  }

  // ② rom_name（可能有好几盘）
  for (const name of game.romNames ?? []) {
    const raw = String(name ?? '').trim().toLowerCase();
    if (!raw) continue;
    const stem = raw.replace(ROM_EXT, '');
    const noLang = stem.replace(LANG_SUFFIX, '').replace(LANG_SUFFIX, '');
    seeds.push(noLang);
    // ⚠️ 版本号要先剥掉再进 `expandSeed` —— 带点（`-v5.7`）的形态过不了 `SLUG_SHAPE`，
    // 会在函数第一行就被丢掉，根本没机会走到链式剥离那一步（实测踩到）。
    seeds.push(noLang.replace(VERSION_SUFFIX, '').replace(VERSION_SUFFIX, ''));
    if (/[ ()\[\]']/.test(stem)) seeds.push(normalizeRomTitle(stem));
  }

  // ④ 人工兜底表（见 `SLUG_OVERRIDES`）—— 放在最前面，因为它是有证据的确定值
  for (const name of game.romNames ?? []) {
    for (const override of SLUG_OVERRIDES[String(name ?? '').trim().toLowerCase()] ?? []) {
      out.push(override);
    }
  }

  for (const seed of seeds) {
    if (!seed || !SLUG_SHAPE.test(seed)) continue;
    // 罗马 ↔ 阿拉伯两个方向都展开一遍（两种写法上游都在用）
    const forms = [seed, romanToArabic(seed), arabicToRoman(seed)];
    // 别名两个方向各来一份（见 `TITLE_ALIASES`）
    for (const [from, to] of TITLE_ALIASES) {
      forms.push(withAlias(seed, from, to), withAlias(seed, to, from));
    }
    for (const form of forms) expandSeed(form, game.console_type, out);
  }

  // ③ 模糊召回（放在最后 —— 前面的都是更可信的精确形态）
  for (const seed of new Set(seeds)) out.push(...fuzzyRecall(seed, index));

  return [...new Set(out)].filter(Boolean);
}

/* ── 主流程 ───────────────────────────────────────────────────────────── */

/** 对上游的并发 —— 4 是保守值（那边是 Next SSR，别打太狠）。 */
const CONCURRENCY = 4;

console.log(DRY_RUN ? '== 干跑（不写库）==' : '== 真跑 ==');
console.log(`目标语言：${TARGET_LOCALES.join(' / ')}${ONLY ? '（--only）' : ''}`);

const upSlugs = await loadUpstreamSlugs();
console.log(
  upSlugs
    ? `· 上游 sitemap：${upSlugs.size} 条游戏 slug。`
    : '· 上游 sitemap 不可用，候选不做离线过滤。'
);

/** 词元倒排索引（`fuzzyRecall` 用）。sitemap 不可用时不建，模糊召回自然失效。 */
const tokenIndex = new Map();
if (upSlugs) {
  for (const slug of upSlugs) {
    for (const token of new Set(tokensOf(slug))) {
      if (!tokenIndex.has(token)) tokenIndex.set(token, []);
      tokenIndex.get(token).push(slug);
    }
  }
}

/*
 * ⚠️⚠️ 侧表的主键列**运行时探测**，别写死。
 *
 * 线上库 2026-10-16 正在从 `game_id` 迁到 `group_key`（`scripts/add-game-group-key.mjs`），
 * 迁移**落地之前** `game_texts` 还是 `game_id` 主键的旧形状 —— 写死 `group_key`
 * 会在旧库上直接 `no such column` 崩掉（实测），写死 `game_id` 又会在迁移后崩。
 * 两个形状只差这一列名，探测一次最省事：
 *   · `game_id`  —— 一行 games = 一款，同款的四个语言版本各自一份文案；
 *   · `group_key` —— 同款的几个语言版本**共用一个键**、只有一份文案（新形状）。
 * 探测到 `group_key` 时，主查询要把同款合并成一条（见下面 `seenGroups`）。
 */
const TEXT_KEY = (
  await run("SELECT name FROM pragma_table_info('game_texts')")
)
  .map((r) => r.name)
  .includes('group_key')
  ? 'group_key'
  : 'game_id';

/** 取「这款游戏的文案键」的 SQL 片段（`COALESCE` 是给迁移中途的老行兜底）。 */
const KEY_EXPR = TEXT_KEY === 'group_key' ? 'COALESCE(g.group_key, g.id)' : 'g.id';

console.log(
  `· game_texts 主键：${TEXT_KEY}` +
    (TEXT_KEY === 'game_id' ? '（旧形状，同款的语言版本各存一份）' : '（新形状，同款共用一份）')
);

/*
 * 要处理的游戏：**还没建目标语言行的**（已有的不碰 —— 这个脚本只补缺）。
 *
 * ⚠️ **`group_key` 形状下这里的一行 = 一款**：`games` 里同一款的中英日韩
 *    四个语言版本是四行，文案却只有一份 —— 所以下面按 `group_key` 去重之后再处理。
 *    不去重的话同一款会被抓四遍、往同一个键上写四遍（结果一样，纯浪费上游请求）。
 *    `game_id` 形状下每条 games 就是一款，去重是空操作。
 *
 * ⚠️ 顺带把 zh 行的 `developer` 捞出来：ja / ko 那份的厂名要**照抄中文厂名**
 *    （与 lib/server/games.ts 的 `withDeveloper` 规则一致：只有英文取 `name_en`，
 *    其余语言一律取 `name` —— 因为 `developers` 表没有日韩厂名列）。
 * ⚠️ `JOIN game_texts tz` 而不是 LEFT JOIN：**没有中文行的游戏跳过** ——
 *    那说明迁移没跑全，先修那个，别在这儿猜。
 * ⚠️ 第二轮补了 `g.title_en` —— 街机的候选只能从它推（`rom_name` 是 MAME 短名）。
 */
const gameRows = await run(
  `SELECT g.id, g.title, g.title_en, g.rom_name, g.console_type,
          ${KEY_EXPR} AS group_key,
          tz.developer AS zh_developer,
          (SELECT 1 FROM game_texts t WHERE t.${TEXT_KEY} = ${KEY_EXPR} AND t.locale = 'ja') AS has_ja,
          (SELECT 1 FROM game_texts t WHERE t.${TEXT_KEY} = ${KEY_EXPR} AND t.locale = 'ko') AS has_ko
     FROM games g
     JOIN game_texts tz ON tz.${TEXT_KEY} = ${KEY_EXPR} AND tz.locale = 'zh'
    ORDER BY g.created_at DESC`
);

/**
 * 归并成「一款一条」——
 *
 * ⚠️ `group_key` 形状下同一款有好几条 games 记录（中英日韩四个 ROM 版本），
 *    处理后要**合并 rom_name**：其中有的是正常文件名、有的是 sha 哈希
 *    （`cdbe2a45…c1064.sfc` 这种推不出任何 slug）。只留一条的话，
 *    恰好留下哈希那条就会让整款失去候选（实测 `zelda-link-to-the-past` 撞到过）。
 *    `game_id` 形状下每条记录自己就是一款，这个归并退化成一对一的复制。
 */
const byGroup = new Map();
for (const row of gameRows) {
  if (!byGroup.has(row.group_key)) byGroup.set(row.group_key, { ...row, romNames: [] });
  const entry = byGroup.get(row.group_key);
  if (row.rom_name && !entry.romNames.includes(row.rom_name)) entry.romNames.push(row.rom_name);
}

/*
 * 再按「`title_en` + 机种」合并一次 ROM 名（那一维是站点自己的判重维度去掉语言）。
 *
 * ⚠️ 这一层是为 **`game_id` 旧形状** 准备的：那时同款不是一组而是好几行，
 *    上面按 `group_key` 的归并退化成一比一，于是「同一款的两盘 ROM 各推各的候选」——
 *    哈希文件名那条（`cdbe2a…c1064.sfc`）推不出 slug、会整条落空，
 *    而换了个正常文件名的同款（`zelda-link-to-the-past.smc`）能推出来。
 *    并入之后两行都能对上同一页（本来就该是同一份文案）。
 *    `group_key` 新形状下这一步是空操作（上面已经并过了）。
 */
const signatureRoms = new Map();
const signatureOf = (entry) =>
  `${entry.console_type}\u0000${(entry.title_en ?? entry.title ?? '').trim().toLowerCase()}`;
for (const entry of byGroup.values()) {
  const sig = signatureOf(entry);
  if (!signatureRoms.has(sig)) signatureRoms.set(sig, []);
  const list = signatureRoms.get(sig);
  for (const name of entry.romNames) if (!list.includes(name)) list.push(name);
}
for (const entry of byGroup.values()) entry.romNames = signatureRoms.get(signatureOf(entry));

const rows = [...byGroup.values()];

console.log(
  `· games ${gameRows.length} 条 → **${rows.length} 款**` +
    (rows.length === gameRows.length ? '（都有中文行）。' : '（同款多语言版本已合并）。')
);
const todo = [];
let noSlug = 0;
/**
 * 这轮**一个 slug 候选都推不出来**的游戏（见文件头「候选」那段）。
 * ⚠️ 它们是「上游确实没有」的主要来源，所以单独留档、结尾统一打印。
 */
const noCandidate = [];
for (const row of rows) {
  const locales = TARGET_LOCALES.filter((locale) => !row[`has_${locale}`]);
  if (!locales.length) continue;

  const all = slugCandidates(row, tokenIndex);
  /*
   * ⚠️ **离线过滤**：只有 sitemap 里真有的 slug 才值得发请求。
   *    第一轮按「候选 1 打 404 → 试候选 2」走，候选一多就是成倍的 404 请求；
   *    这里直接把不存在的砍掉，剩下的每一个都是「上游确实有这个页面」。
   *    sitemap 不可用时（上一行打印了警告）退回盲试。
   */
  const candidates = upSlugs ? all.filter((slug) => upSlugs.has(slug)) : all;
  if (!candidates.length) {
    noSlug += 1;
    noCandidate.push({ ...row, locales });
    continue;
  }
  todo.push({ ...row, candidates, dropped: upSlugs ? all.length - candidates.length : 0, locales });
}

const queue = Number.isFinite(LIMIT) ? todo.slice(0, LIMIT) : todo;
console.log(
  `· 待补：${todo.length} 款${Number.isFinite(LIMIT) ? `（--limit 截到 ${queue.length} 款）` : ''}` +
    `${noSlug ? ` · 推不出候选跳过 ${noSlug} 款` : ''}`
);
if (!queue.length) {
  console.log('没有要补的 —— 收工。');
  process.exit(0);
}
console.log(
  `· 并发 ${CONCURRENCY}，至少 ${queue.reduce((n, item) => n + item.locales.length, 0)} 次上游请求` +
    `（机种不符要往下退候选，会再加一些）。\n`
);

const stats = {
  ok: 0,
  written: 0,
  noPage: 0,
  platform: 0,
  noTitle: 0,
  failed: 0,
  processed: 0,
  /** 真正打到上游的请求数（缓存命中不算）—— 用它看缓存省了多少 */
  fetches: 0,
};

/** 一行日志（并发下别用 process.stdout.write 的 \r，会串行错乱）。 */
function log(line) {
  console.log(line);
}

/*
 * 抓取缓存 —— **同一款游戏在库里有好几条记录**（站内把「同一款的不同语言版本」
 * 当成多条：判重是「同名 + 同机种 + 同语言」，跨语言是合法的）。
 * 它们的 `rom_name` 不同（`xxx-cn.nds` / `xxx-ja.nds` / `xxx.nds`）却**推出同一个 slug** ——
 * 没有缓存的话，同一个上游页面会被抓 N 遍。
 *
 * ⚠️ 缓存的是 **Promise** 而不是结果：并发下同一个 slug 只有第一个 worker 真去抓，
 *    其余的等它 —— 存结果的话它们会各自 miss 一次，还是抓 N 遍。
 * ⚠️ **失败也缓存**（`reason: 'failed'`）：不然同一个 slug 会白打上游 N 次。
 * key 是 `locale:slug` —— 两种语言的页面本来就是两次请求。
 */
const pageCache = new Map();

function loadPage(locale, slug) {
  const key = `${locale}:${slug}`;
  if (!pageCache.has(key)) {
    pageCache.set(
      key,
      (async () => {
        stats.fetches += 1;
        const page = parseGamePage(await fetchHtml(`/${locale}/games/${slug}`));
        return page ? { page } : { reason: 'no-page' };
      })().catch((error) => ({
        // ⚠️ 404 算「上游没有这一页」，不算失败 —— 那是 slug 推错时的正常结果，不是异常
        reason: /HTTP 404/.test(error.message) ? 'no-page' : 'failed',
        message: error.message,
      }))
    );
  }
  return pageCache.get(key);
}

/**
 * 每款游戏的结局 —— 只记**一行都没补上**的那些，结尾统一打印。
 *
 * 为什么要有它：这个脚本的一大结论是「**哪些游戏上游确实没有**」，
 * 而光看命中/失败计数看不出来是哪几款。补齐之后人工要处理的就是这些。
 */
const unresolvedGames = [];
for (const game of noCandidate) {
  unresolvedGames.push({
    ...game,
    reason: '推不出 slug 候选（rom_name / title_en 都不是上游的写法）',
    missing: game.locales.map((locale) => ({
      locale,
      reason: '推不出 slug 候选',
      detail: '上游没有能对上的 slug（不是机种不符，是压根找不到这一款）',
    })),
  });
}

/** 每款处理完打一行进度。 */
function progress() {
  stats.processed += 1;
  if (stats.processed % 25 === 0 || stats.processed === queue.length) {
    log(
      `  [${stats.processed}/${queue.length}] 命中 ${stats.ok} · 无此页 ${stats.noPage} · ` +
        `机种不符 ${stats.platform} · 无标题 ${stats.noTitle} · 失败 ${stats.failed} · ` +
        `上游 ${stats.fetches} 次`
    );
  }
}

let cursor = 0;

async function worker() {
  while (cursor < queue.length) {
    const item = queue[cursor++];

    /*
     * 这款游戏**已经验过的 slug**（第一个语言试出来的那个）。
     * ⚠️ 候选是按 slug 试的，而 slug 与语言无关 —— ja 试出来的那个 ko 直接用，
     *    不必让 ko 再走一遍「候选 1 没命中 → 候选 2」的冤枉路。
     */
    let resolved = null;

    /**
     * 这款**没补上的语言**（`{ locale, reason, detail }`）。
     * 全补上就是空数组 —— 结尾统一打印非空的那些，那份清单就是「上游确实没有」的答案。
     */
    const missing = [];

    for (const locale of item.locales) {
      try {
        const tried = resolved ? [resolved] : item.candidates;

        /** 命中的候选：`{ slug, page }` */
        let hit = null;
        /** 抓到真页面但**机种不符**的第一个候选 —— 一个都没命中时拿它报错 */
        let mismatch = null;
        /** 机种对上了、但页面没有标题的第一个候选（少见，拿来报错） */
        let titleless = null;
        /** 打过基础设施错误（网络 / 5xx）—— 这类已经单独报过，别再报一遍「无此页」 */
        let errored = false;

        for (const slug of tried) {
          const loaded = await loadPage(locale, slug);

          /*
           * 网络 / 5xx 这种是**基础设施出错**，不是 slug 推错 ——
           * 换下一个候选去试只会把错误盖掉。直接停下，记一条失败。
           */
          if (loaded.reason === 'failed') {
            stats.failed += 1;
            errored = true;
            log(`❌ ${slug} [${locale}]：${loaded.message}`);
            break;
          }
          if (loaded.reason === 'no-page') continue;

          const page = loaded.page;
          /*
           * 机种校验 —— **这一条是防写错数据的关键**。
           * 上游同名跨机种是两个不同 slug，标题还一模一样，只有机种能区分。
           * ⚠️ 比的是 `page.platform`（`toConsoleType` 收敛过的），**不是** `platformRaw`。
           */
          if (page.platform !== item.console_type) {
            mismatch = mismatch ?? { slug, page };
            continue;
          }
          if (!page.title) {
            titleless = titleless ?? { slug, page };
            continue;
          }

          hit = { slug, page };
          break;
        }

        if (hit) {
          resolved = hit.slug;
          const { page } = hit;

          if (DRY_RUN) {
            stats.ok += 1;
            log(`· [dry-run] ${hit.slug} [${locale}] → ${page.title}  ｜ 库：${item.title_en ?? item.title}`);
          } else {
            /*
             * `ON CONFLICT DO NOTHING` —— **只补缺的行，绝不覆盖已存在的**。
             * 重复跑无害，也不会把人工改过的日韩文案冲掉。
             *
             * ⚠️ 第一个参数是 **`item.group_key`**（不是游戏 id）：`group_key` 形状下
             *    同款的几个语言版本共用一份文案（2026-10-16），而上面已经按 group
             *    去过重了 —— 一款只写一次。`game_id` 形状下这个值就是游戏 id。
             * ⚠️ 列名走 `TEXT_KEY`（运行时探测，见上面那段）。
             */
            await run(
              `INSERT INTO game_texts (${TEXT_KEY}, locale, title, series, developer, description, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(${TEXT_KEY}, locale) DO NOTHING`,
              [
                item.group_key,
                locale,
                page.title,
                page.series,
                item.zh_developer,
                page.description,
                Date.now(),
              ]
            );
            stats.ok += 1;
            stats.written += 1;
          }
        } else if (errored) {
          // 上面已经报过 ❌ 了，这里不再重复计数
          missing.push({ locale, reason: '上游报错', detail: 'HTTP 5xx / 网络' });
        } else if (mismatch) {
          stats.platform += 1;
          log(
            `· 机种不符 ${mismatch.slug} [${locale}]  上游 ${mismatch.page.platformRaw ?? '(无)'}` +
              ` → ${mismatch.page.platform ?? '(认不出)'} vs 库 ${item.console_type}`
          );
          missing.push({
            locale,
            reason: '机种不符',
            detail: `上游只有 ${mismatch.page.platformRaw ?? '(认不出)'} 版（${mismatch.slug}），本站这条是 ${item.console_type}`,
          });
        } else if (titleless) {
          stats.noTitle += 1;
          log(`· 无标题  ${titleless.slug} [${locale}]`);
          missing.push({ locale, reason: '页面无标题', detail: titleless.slug });
        } else {
          stats.noPage += 1;
          log(`· 无此页  ${tried.join(' / ')} [${locale}]  （候选在上游都不存在）`);
          missing.push({ locale, reason: '上游无此页', detail: tried.join(' / ') });
        }
      } catch (error) {
        stats.failed += 1;
        log(`❌ ${item.candidates[0]} [${locale}]：${error.message}`);
        missing.push({ locale, reason: '抓取 / 写入异常', detail: error.message });
      }
    }

    if (missing.length) unresolvedGames.push({ ...item, missing, resolvedSlug: resolved });

    progress();
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log('\n---');
console.log(
  `${DRY_RUN ? '[dry-run] 命中' : '写入'} ${stats.ok} 行（实际落库 ${stats.written}）· ` +
    `无此页 ${stats.noPage} · 机种不符 ${stats.platform} · 无标题 ${stats.noTitle} · 失败 ${stats.failed}`
);
console.log(`上游请求 ${stats.fetches} 次（按 slug + 语言去重后的真实次数）。`);

/*
 * 没补上的清单 —— **这个脚本真正的结论**。
 *
 * 看完计数（命中 / 机种不符 / 上游报错）只能知道「补了多少」，看不出「剩下的是哪几款、
 * 为什么没补上」。而剩下的这些才是要人来判断的：是上游确实没有，还是 slug 推得不够巧。
 * 所以按「一条 games 记录一行、逐语言写原因」打出来。
 */
if (unresolvedGames.length) {
  console.log(`\n--- 没补上的 ${unresolvedGames.length} 款 ---`);
  for (const game of unresolvedGames) {
    const roms = (game.romNames ?? [game.rom_name]).filter(Boolean).join(' / ');
    console.log(`· ${game.title_en ?? game.title} ［${game.console_type} · ${roms}］`);
    console.log(`    库内中文名：${game.title}`);
    if (game.reason) console.log(`    ${game.reason}`);
    for (const m of game.missing ?? []) {
      console.log(`    [${m.locale}] ${m.reason} —— ${m.detail}`);
    }
  }
}

if (DRY_RUN) {
  console.log('[dry-run] 什么都没写。去掉 --dry-run 再跑一次才落库。');
  process.exit(0);
}

// 回读
const byLocale = await run(
  'SELECT locale, COUNT(*) AS n FROM game_texts GROUP BY locale ORDER BY locale'
);
console.log(`\ngame_texts 现在：${byLocale.map((r) => `${r.locale}=${r.n}`).join(' · ')}`);
