/*
 * **源站数据层** —— 直接把上游站点（retrogamesnexus.com）的列表页 / 详情页
 * 解析成站内的 `Game` 形状（2026-10-19 加）。
 *
 * 什么时候走这里：**由 `CATALOG_SOURCE` 环境变量说了算**（默认 `upstream`，
 * 见 `./catalog-source.ts`）。最初那一版是「D1 报额度用尽就自动切」，被用户否掉了 ——
 * 自动切换会让两套 id（UUID / slug）在页面之间错位，理由写在那份文件头。
 *
 * 这里只负责「去上游拿一份」，不做任何判断：谁调用、什么时候调用是 data 层（`games.ts`
 * / `consoles.ts` / `developers.ts` 的 cached 包装）决定的。
 *
 * ---------------------------------------------------------------------------
 * 为什么读 **RSC 载荷**而不是抠 DOM
 *
 * 上游也是一套 Next.js App Router 应用，整页数据都在 `self.__next_f.push([1,"…"])`
 * 这些流式片段里，形状和我们库里的几乎一一对应：
 *   · 列表页：18 个 `"game":{…}`，带 fileName（多语言 ROM）、封面、年份、机种、说明；
 *   · 详情页：一个 `"game":{…}`，同样的字段。
 * 抠 HTML 只能拿到卡片上露出来的那几样（连开发商都没有），而这条流式载荷是
 * **同一个页面同时在用的数据**，改版时要么两边一起坏、要么都还在 —— 比 DOM 稳。
 *
 * 解析方式刻意很土：找到 `"game":` 之后做一次**括号配对**（带字符串/转义状态机），
 * 把那个对象整段切下来 `JSON.parse`。不做整份 flight 的协议解析 ——
 * 我们只取数据，不需要认得 `$` 引用 / lazy 组件那一套。
 *
 * ---------------------------------------------------------------------------
 * 多语言
 *
 * 上游的 `/zh/games` `/ja/games` `/ko/games` `/games` 是**四份真翻译过的页面**
 * （不是只翻界面）。列表页与详情页都按四个语言各取一份、按 slug 合并成
 * `Game.texts`，这样站内的中英日韩站看到的标题/说明和数据库那条路一致。
 *
 * ⚠️ 带关键词搜索时**只取中文那份**：上游的 `search` 匹配的是**那个语言页面自己的**
 *    标题，拿中文关键词去 `/ja/games?search=` 会得到 0 条。搜索结果只保证中文文案。
 *
 * ⚠️ 带机种筛选时，非中文页走**机种专题页**（`/ja/nes-games`）而不是
 *    `?console=` —— 那个参数吃的是**该语言的机种名**（中文页是「红白机FC」），
 *    跨语言传过去会筛出 0 条。
 *
 * ---------------------------------------------------------------------------
 * 缓存
 *
 * 每份数据都过 `./cache.ts` 的 `cached`（线上 24 小时 / 开发 5 分钟）：
 * 上游一页 300 KB 上下，不缓存的话一次列表翻页就是四趟外网请求。
 * 键里没有「界面语言」—— 返回的 `texts` 本来就是四语言齐全的一份，由页面挑。
 */

import type { ConsoleType } from '@/lib/emulator';
import type { GameControls, GameTexts } from '@/lib/game-text';
import { CONTENT_LOCALES, type ContentLocale } from '@/lib/game-text';
import { consoleLabel } from '@/lib/consoles';
import { GAME_LANGUAGES, romLangToFormValue } from '@/lib/rom-lang';
import { cached } from './cache';
import { toConsoleType, UPSTREAM_SITE, UPSTREAM_USER_AGENT } from './upstream';

/* ── 上游页面的一页有几款 ─────────────────────────────────────────────── */

/**
 * 上游列表页固定 18 款一页（`/zh/games` 实测：2110 款 / 118 页）。
 *
 * ⚠️ 站内 `/games` 是 **15** 一款页。回退数据把 `limit` 原样报成 18，
 *    页面据此算总页数（`lib/server/pages/games.tsx` / `console.tsx` 都读 `data.limit`），
 *    而页码到上游页码的映射用的是**站内** offset / limit（`?page=N` → 第 N 个上游页）。
 *    两边只要都按「站内 limit」算，页码就是一致的；写死成 15 反而会在第 118 页之后
 *    出现一串空页。
 */
export const UPSTREAM_PAGE_SIZE = 18;

/** 上游机种列表页的 slug（sitemap 实测，2026-10-19）。认不出的机种不参与回退。 */
const CONSOLE_SLUGS: Record<ConsoleType, string> = {
  nes: 'nes-games',
  snes: 'snes-games',
  gb: 'gameboy-games',
  gbc: 'gbc-games',
  gba: 'gba-games',
  nds: 'nds-games',
  md: 'genesis-games',
  gg: 'sega-game-gear-games',
  sms: 'sega-master-system-games',
  '32x': 'sega-32x-games',
  ws: 'bandai-wonderswan-games',
  ngp: 'neogeo-pocket-games',
  ps1: 'playstation-games',
  arcade: 'arcade-games',
};

/**
 * 上游 `/games?console=` 的取值 —— **中文页上的机种名**。
 *
 * 见文件头：这个参数按「该语言页面的机种名」匹配，所以只有在**中文页**上用它
 * （带关键词搜索时固定取中文页）；其它语言走 `CONSOLE_SLUGS` 的专题页。
 */
const CONSOLE_FILTER_LABEL: Record<ConsoleType, string> = {
  nes: '红白机FC',
  snes: '超任SFC',
  gb: 'Game Boy',
  gbc: 'Game Boy Color',
  gba: 'GBA掌机',
  nds: 'NDS掌机',
  md: '世嘉MD',
  gg: 'Sega Game Gear',
  sms: 'Sega Master System',
  '32x': 'Sega 32X',
  ws: '万代WonderSwan',
  ngp: 'NeoGeo掌机',
  ps1: 'PlayStation',
  arcade: '街机',
};

const SLUG_TO_CONSOLE: Record<string, ConsoleType> = Object.fromEntries(
  Object.entries(CONSOLE_SLUGS).map(([type, slug]) => [slug, type as ConsoleType])
);

/** 站内语言 → 上游页面的前缀（英文不占前缀，`/en/x` 会 301 回 `/x`）。 */
function localePrefix(locale: ContentLocale): string {
  return locale === 'en' ? '' : `/${locale}`;
}

/* ── 抓页面 / 读 RSC 载荷 ─────────────────────────────────────────────── */

/** 单次请求的超时。上游被 CF 挡的时候会一直挂着，不设上限会把整页拖死。 */
const FETCH_TIMEOUT_MS = 10_000;

/**
 * @param accept 覆盖 accept 头。默认要 HTML —— 只有 `sitemap.xml` 那一条明确要 XML
 *   （不是所有 CDN 都无视 accept 后缀差异，宁可写对）。
 */
async function fetchPage(path: string, accept = 'text/html'): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${UPSTREAM_SITE}${path}`, {
      headers: {
        'user-agent': UPSTREAM_USER_AGENT,
        accept,
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      /*
       * ⚠️ 用 `next.revalidate` 而**不是** `cache: 'no-store'`：外面已经套了
       *    `unstable_cache`，这里只需要「不把页面拖成动态渲染」。`no-store` 会让
       *    Next 把整条渲染路径判成动态（首页是 24 小时 ISR，混着用会在构建期报错）。
       */
      next: { revalidate: 86400 },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 把页面里那些 `self.__next_f.push([1,"…"])` 片段拼成完整的 flight 文本。
 *
 * 每个片段是一个 JSON 字符串字面量（转义过的），`JSON.parse` 之后就是原文。
 * 解析失败的片段直接跳过（Next 版本一换可能多出别的 push 形态）。
 */
function flightText(html: string): string {
  const chunk = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let out = '';
  let match: RegExpExecArray | null;
  while ((match = chunk.exec(html)) !== null) {
    try {
      out += JSON.parse(match[1]) as string;
    } catch {
      /* 跳过坏片段 */
    }
  }
  return out;
}

/** 从 `start`（必须是 `{`）开始做括号配对，返回整段 JSON 文本。 */
function sliceJsonObject(text: string, start: number): string | null {
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

/** 上游游戏对象里我们真正用得到的字段（其余原样忽略）。 */
interface UpstreamGameRaw {
  id?: string;
  slug?: string;
  title?: string;
  description?: string;
  console?: string;
  consoleType?: string;
  releaseDate?: string;
  thumbnail?: string;
  developer?: { name?: string };
  series?: { name?: string };
  fileName?: Record<string, string> | string;
  /**
   * 操作说明（2026-10-19 加）。上游详情页与列表页都带，四个语言各一份**真翻译**：
   *   `{"description":"使用方向键移动，A键跳跃…","keys":{"方向键":"移动","A":"跳跃"}}`
   * 解析方式与 `description` 那类字段一样，是同一个 game 对象里的键。
   */
  controls?: { description?: string; keys?: Record<string, string> } | null;
}

/**
 * 切出页面里所有 `"game":{…}` 对象。
 *
 * ⚠️ 同一款在一页里可能出现两次（卡片 + 其它区块），按 slug 去重、保留第一个。
 */
function gameObjects(flight: string): UpstreamGameRaw[] {
  const out: UpstreamGameRaw[] = [];
  const seen = new Set<string>();
  const marker = '"game":';

  let from = 0;
  for (;;) {
    const at = flight.indexOf(marker, from);
    if (at < 0) break;
    let start = at + marker.length;
    while (start < flight.length && /\s/.test(flight[start])) start += 1;
    if (flight[start] !== '{') {
      from = start + 1;
      continue;
    }
    const json = sliceJsonObject(flight, start);
    if (!json) break;
    try {
      const parsed = JSON.parse(json) as UpstreamGameRaw;
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

/**
 * 列表页的**总条数**（当前筛选条件下）。
 *
 * 两个来源，都是语言无关的结构：
 *   · `/games` 那一页的「共 N 款」—— 第二个 `font-semibold` 的 span；
 *   · 机种专题页 / 无筛选页的 JSON-LD `numberOfItems`（这个在搜索时**不跟着变**，
 *     所以只当兜底）。
 */
function listTotal(flight: string): number | null {
  const filtered = /"className":"font-semibold","children":(\d+)/.exec(flight);
  if (filtered) return Number(filtered[1]);
  const items = /"numberOfItems":(\d+)/.exec(flight);
  if (items) return Number(items[1]);
  return null;
}

/* ── 上游对象 → 站内形状 ──────────────────────────────────────────────── */

/** 站内对外的一份回退游戏数据。`lib/server/games.ts` 把它转成 `Game`。 */
export interface UpstreamGameData {
  slug: string;
  texts: GameTexts;
  imageUrl: string;
  romName: string;
  consoleType: ConsoleType;
  /**
   * 上游 `fileName` 里有哪些语言版本（站内短码 + **那一份的文件名**）。
   *
   * 文件名必须一起带出去：播放时 `PlayScene` 用它给 `File` 起名，
   * 而 `unwrapRom` / `detectConsole` 靠扩展名决定要不要解包。
   * 选中文版却顶着英文版那个 `.zip` 的名字，会去解一个根本不是压缩包的文件。
   */
  romLanguages: { code: string; name: string }[];
  /** 默认那份语言（详情页「语言」那一行 / 播放时没指定语言就用它）。 */
  language: string | null;
  year: number | null;
  createdAt: number;
}

/** 上游给的地址可能是相对路径（挂主站），也可能是绝对地址（files 子域）。 */
function absoluteUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  if (value.startsWith('/')) return `${UPSTREAM_SITE}${encodeURI(value)}`;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** 从 ROM 地址里取文件名（FBNeo 认它当驱动名，下载时也用它落盘）。 */
function fileNameOf(raw: string): string {
  const path = raw.split('?')[0];
  const tail = path.split('/').filter(Boolean).pop() ?? '';
  try {
    return decodeURIComponent(tail) || 'rom';
  } catch {
    return tail || 'rom';
  }
}

/** 上游的 fileName 有「对象」与「单个字符串」两种形态，统一成 `code → 地址`。 */
function romFiles(raw: UpstreamGameRaw['fileName']): { code: string; url: string }[] {
  const entries: [string, string][] = [];
  if (typeof raw === 'string') {
    entries.push(['en', raw]);
  } else if (raw && typeof raw === 'object') {
    for (const [code, url] of Object.entries(raw)) {
      if (typeof url === 'string' && url.trim()) entries.push([code, url]);
    }
  }

  const out: { code: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const [key, url] of entries) {
    const code = romLangToFormValue(key) ?? key.toLowerCase();
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({ code, url });
  }
  return out;
}

function yearOf(releaseDate: string | undefined): number | null {
  const match = /(\d{4})/.exec(releaseDate ?? '');
  return match ? Number(match[1]) : null;
}

/**
 * 上游 `controls` → 站内的 `GameControls`（2026-10-19 加）。
 *
 * 上游给的是 `{description, keys:{按键:动作}}`，这里做三件事：
 *   ① 把 `keys` 转成**数组**并保住顺序（`Object.entries` 对字符串键保序）；
 *   ② 丢掉空的键 / 值（上游偶尔给 `""`，画出来会是一行空白）；
 *   ③ 描述和键位都空 → 整个 `null`，详情页据此整块不渲染。
 *
 * ⚠️ 不做翻译 / 不拼默认文案：四个语言的上游页面本来就各有一份，直接取。
 */
function controlsOf(game: UpstreamGameRaw): GameControls | null {
  const raw = game.controls;
  if (!raw || typeof raw !== 'object') return null;

  const description = typeof raw.description === 'string' ? raw.description.trim() || null : null;

  const keys: { label: string; action: string }[] = [];
  if (raw.keys && typeof raw.keys === 'object') {
    for (const [label, action] of Object.entries(raw.keys)) {
      const key = label.trim();
      const value = typeof action === 'string' ? action.trim() : '';
      if (key && value) keys.push({ label: key, action: value });
    }
  }

  return description || keys.length > 0 ? { description, keys } : null;
}

/**
 * 一份（某个语言的）上游对象 → 半个站内文案。
 *
 * 卡片的「开发商 / 系列」是对象（`{name}`），拿名字；没有就留空（读取时回退中文）。
 */
function textOf(game: UpstreamGameRaw): GameTexts[ContentLocale] {
  return {
    title: game.title?.trim() || null,
    series: game.series?.name?.trim() || null,
    developer: game.developer?.name?.trim() || null,
    description: game.description?.trim() || null,
    controls: controlsOf(game),
  };
}

/** 把多语言的若干份上游对象合并成一条 `UpstreamGameData`（以中文那份为骨架）。 */
function toUpstreamGame(
  primary: UpstreamGameRaw,
  byLocale: Partial<Record<ContentLocale, UpstreamGameRaw>>
): UpstreamGameData | null {
  const consoleType = toConsoleType(primary.consoleType ?? primary.console);
  if (!consoleType) return null;

  const texts: GameTexts = {};
  for (const locale of CONTENT_LOCALES) {
    const raw = byLocale[locale];
    if (raw) texts[locale] = textOf(raw);
  }
  /* 中文是必填的那一份；只有其它语言时用第一份兜底，免得卡片没名字 */
  if (!texts.zh) {
    const first = CONTENT_LOCALES.map((locale) => texts[locale]).find(Boolean);
    if (first) texts.zh = first;
  }

  const files = romFiles(primary.fileName);
  const preferred =
    files.find((file) => file.code === 'en') ?? files.find((file) => file.code === 'zh') ?? files[0];

  const imageUrl = absoluteUrl(primary.thumbnail);
  if (!imageUrl || !preferred) return null;

  return {
    slug: primary.slug as string,
    texts,
    imageUrl,
    romName: fileNameOf(preferred.url),
    consoleType,
    romLanguages: GAME_LANGUAGES.map((item) => {
      const file = files.find((entry) => entry.code === item.value);
      return file ? { code: item.value, name: fileNameOf(file.url) } : null;
    }).filter((entry): entry is { code: string; name: string } => entry !== null),
    language: preferred.code,
    year: yearOf(primary.releaseDate),
    createdAt: 0,
  };
}

/* ── 列表 ─────────────────────────────────────────────────────────────── */

/** 某一语言、某一页的列表地址（理由见文件头两段 ⚠️）。 */
function listPath(
  locale: ContentLocale,
  page: number,
  keyword: string,
  consoleType: ConsoleType | null
): string {
  const prefix = localePrefix(locale);

  if (!keyword && consoleType) {
    const query = page > 1 ? `?page=${page}` : '';
    return `${prefix}/${CONSOLE_SLUGS[consoleType]}${query}`;
  }

  const params = new URLSearchParams();
  if (keyword) params.set('search', keyword);
  if (consoleType) params.set('console', CONSOLE_FILTER_LABEL[consoleType]);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return `${prefix}/games${query ? `?${query}` : ''}`;
}

/** 抓一个上游列表页并解析。 */
async function fetchListPage(
  locale: ContentLocale,
  page: number,
  keyword: string,
  consoleType: ConsoleType | null
): Promise<{ games: UpstreamGameRaw[]; total: number | null }> {
  const flight = flightText(await fetchPage(listPath(locale, page, keyword, consoleType)));
  return { games: gameObjects(flight), total: listTotal(flight) };
}

/**
 * 一页游戏（源站模式下的 `listGamesPage`）。
 *
 * `offset` / `limit` 沿用站内那套（15 一款页）：上游页码 = `offset / limit + 1`。
 * 返回的 `limit` 是**上游的一页条数**（18），页面据此算总页数 —— 见 `UPSTREAM_PAGE_SIZE`。
 */
export const listUpstreamGamesPage = cached(
  async (
    offset: number,
    limit: number,
    keyword: string,
    consoleType: ConsoleType | null
  ): Promise<{ games: UpstreamGameData[]; total: number; offset: number; limit: number }> => {
    const page = Math.max(1, Math.floor(offset / Math.max(1, limit)) + 1);
    const needle = keyword.trim();

    /* 关键词只在中文页搜（见文件头），否则四语言各来一份 */
    const locales: ContentLocale[] = needle ? ['zh'] : [...CONTENT_LOCALES];
    const settled = await Promise.allSettled(
      locales.map((locale) => fetchListPage(locale, page, needle, consoleType))
    );

    const byLocale = new Map<ContentLocale, UpstreamGameRaw[]>();
    let total = 0;
    settled.forEach((result, index) => {
      if (result.status !== 'fulfilled') return;
      byLocale.set(locales[index], result.value.games);
      total = Math.max(total, result.value.total ?? 0);
    });

    const primaryLocale = byLocale.has('zh')
      ? 'zh'
      : locales.find((locale) => byLocale.has(locale));
    if (!primaryLocale) throw new Error('上游列表页不可用');

    const primary = byLocale.get(primaryLocale) as UpstreamGameRaw[];
    if (!total) total = primary.length * page;

    const games: UpstreamGameData[] = [];
    for (const raw of primary) {
      const perLocale: Partial<Record<ContentLocale, UpstreamGameRaw>> = {};
      for (const [locale, list] of byLocale) {
        const hit = list.find((item) => item.slug === raw.slug);
        if (hit) perLocale[locale] = hit;
      }
      const game = toUpstreamGame(raw, perLocale);
      if (game) games.push(game);
    }

    return { games, total, offset, limit: UPSTREAM_PAGE_SIZE };
  },
  ['upstream:games-page', 'v1'],
  { revalidate: 86400 }
);

/* ── 详情 ─────────────────────────────────────────────────────────────── */

async function fetchGamePage(locale: ContentLocale, slug: string): Promise<UpstreamGameRaw | null> {
  const flight = flightText(await fetchPage(`${localePrefix(locale)}/games/${slug}`));
  return gameObjects(flight).find((item) => item.slug === slug) ?? null;
}

/**
 * 一款游戏的详情（源站模式下的 `getGame`）。
 *
 * 四个语言各取一份，合并成 `texts` —— 和后台爬取那条路（scrape-game）一样的口径。
 * 任何一份挂了都不影响其余：中文那份在就够渲染了。
 */
export const getUpstreamGame = cached(
  async (slug: string): Promise<UpstreamGameData | null> => {
    const settled = await Promise.allSettled(
      CONTENT_LOCALES.map((locale) => fetchGamePage(locale, slug))
    );

    const byLocale: Partial<Record<ContentLocale, UpstreamGameRaw>> = {};
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        byLocale[CONTENT_LOCALES[index]] = result.value;
      }
    });

    const primary = byLocale.zh ?? CONTENT_LOCALES.map((locale) => byLocale[locale]).find(Boolean);
    if (!primary) return null;
    return toUpstreamGame(primary, byLocale);
  },
  /*
   * ⚠️ 键尾的 `v2` 是 2026-10-19 加「操作说明」（`GameText.controls`）时升的：
   *    旧条目里没有这个字段，而这份缓存跨部署、TTL 24 小时 —— 不换键的话
   *    详情页会有一整天看不到新加的那块内容。
   */
  ['upstream:game', 'v2'],
  { revalidate: 86400 }
);

/**
 * 某一款、某一语言的 ROM 真实地址（ROM 代理回源用）。
 *
 * 语言认不出 / 那一份不存在就退回默认（en → zh → 第一份）—— 和详情页那张卡片
 * 上「语言」那一行显示的默认版本保持一致。
 */
export const upstreamRomTarget = cached(
  async (slug: string, lang: string | null): Promise<{ url: string; name: string } | null> => {
    const game = await fetchGamePage('zh', slug);
    if (!game) return null;

    const files = romFiles(game.fileName);
    if (files.length === 0) return null;

    const wanted = romLangToFormValue(lang);
    const picked =
      (wanted ? files.find((file) => file.code === wanted) : null) ??
      files.find((file) => file.code === 'en') ??
      files.find((file) => file.code === 'zh') ??
      files[0];

    const url = absoluteUrl(picked.url);
    return url ? { url, name: fileNameOf(picked.url) } : null;
  },
  ['upstream:rom', 'v1'],
  { revalidate: 86400 }
);

/* ── 机种（首页 / `/consoles` 用） ────────────────────────────────────── */

export interface UpstreamConsole {
  type: ConsoleType;
  name: string;
  imageUrl: string | null;
  gameCount: number;
}

/**
 * 上游首页那张「机种条」里的一行。
 *
 * 上游 `/zh` 的 flight 里每个机种都是
 *   `"href":"/zh/nes-games", …, "title":"免费在线畅玩红白机FC复古游戏，223款游戏可玩", …`
 * 后面紧跟着 logo 的 `"src":"/images/consoles/logo/…"`。
 * 一次请求就把 14 台的**名字 / 图 / 条数**全拿到了 —— 比逐台去抓专题页省 13 趟。
 */
export const upstreamConsoles = cached(
  async (): Promise<UpstreamConsole[]> => {
    const flight = flightText(await fetchPage('/zh'));

    const pattern =
      /"href":"\/zh\/([a-z0-9-]+-games)".{0,500}?"title":"([^"]*?)，(\d+)款游戏可玩"(.{0,700}?)"alt":"([^"]+)"/gs;

    const out = new Map<ConsoleType, UpstreamConsole>();
    for (const match of flight.matchAll(pattern)) {
      const type = SLUG_TO_CONSOLE[match[1]];
      if (!type || out.has(type)) continue;

      /* 「免费在线畅玩红白机FC复古游戏」→「红白机FC」 */
      const name = match[2].replace(/^免费在线畅玩/, '').replace(/复古游戏$/, '').trim();
      const src = /"src":"(\/images\/consoles\/logo\/[^"]+)"/.exec(match[4]);

      out.set(type, {
        type,
        name: name || consoleLabel(type, 'zh'),
        imageUrl: src ? absoluteUrl(src[1]) : null,
        gameCount: Number(match[3]),
      });
    }

    return [...out.values()];
  },
  ['upstream:consoles', 'v1'],
  { revalidate: 86400 }
);

/**
 * 各机种的游戏数（`countGamesByConsole` 的回退）。
 *
 * ⚠️ 上游没有的机种补 0 —— 调用方拿到的必须是**完整十四键**（和数据库那条路一致）。
 */
export async function upstreamConsoleCounts(): Promise<Record<ConsoleType, number>> {
  const counts = {
    nes: 0,
    snes: 0,
    gb: 0,
    gbc: 0,
    gba: 0,
    nds: 0,
    md: 0,
    gg: 0,
    sms: 0,
    '32x': 0,
    ws: 0,
    ngp: 0,
    ps1: 0,
    arcade: 0,
  } as Record<ConsoleType, number>;

  for (const row of await upstreamConsoles()) counts[row.type] = row.gameCount;
  return counts;
}

/* ── sitemap 用：源站收录了哪些 slug ─────────────────────────────────── */

/**
 * 上游 `sitemap.xml` 里的全部游戏 slug（`/games/<slug>`，约 2100 条）。
 *
 * 为什么要它：`CATALOG_SOURCE=upstream` 时站内的详情页地址就是上游 slug，
 * 而 sitemap / 构建期预渲染原本读的是**数据库里的 UUID** —— 不换这份的话，
 * 提交给搜索引擎的每条游戏地址都会 404。
 *
 * 上游 sitemap 是一份平铺的 XML（不是索引），slug 在
 * `https://retrogamesnexus.com/games/<slug>` 这段里，正则一把就够。
 *
 * ⚠️ 抓不到就返回**空数组**（sitemap 那边照旧只输出静态地址 + 机种 / 开发商），
 *    绝不因为上游抽风让整张 sitemap 挂掉。
 * ⚠️ 这些 slug **没有时间戳**：调用方拿到的 `createdAt` 是 0，意义是「不知道」，
 *    别把它当真实的收录时间用（`app/sitemap.ts` 会在 0 时省掉 `lastModified`）。
 */
export const upstreamGameSlugs = cached(
  async (): Promise<string[]> => {
    let xml: string;
    try {
      xml = await fetchPage('/sitemap.xml', 'application/xml,text/xml;q=0.9,*/*;q=0.8');
    } catch (error) {
      console.error('[catalog] 上游 sitemap 抓取失败，本次不列游戏地址', error);
      return [];
    }

    const slugs = new Set<string>();
    for (const match of xml.matchAll(/retrogamesnexus\.com\/games\/([a-z0-9-]+)</g)) {
      slugs.add(match[1]);
    }
    /* 少于 100 条基本可以断定上游改了结构 —— 宁可空着，也别把半张表当全量发出去 */
    if (slugs.size < 100) {
      console.error(`[catalog] 上游 sitemap 只解析出 ${slugs.size} 条，疑似结构变化，已丢弃`);
      return [];
    }
    return [...slugs];
  },
  ['upstream:slugs', 'v1'],
  { revalidate: 86400 }
);
