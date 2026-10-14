/*
 * 后台「从列表导入」—— 给一个机种列表页链接，回这一页有哪些游戏。
 *
 * ⚠️ **只回 slug 列表，不抓每个游戏的详情。** 每条的数据仍走 scrape-game
 *    （那一份同时有 JSON-LD 与双语），这里只负责回答「这一页有谁」。
 *
 * 为什么不直接从列表页把十几个游戏对象一次抠完：列表页的 RSC 数据里**只有当前语言**
 * 一份（英文站取不到中文名），而且对象之间用 `$17:props:...` 这种**引用**互相去重，
 * 不是合法 JSON —— 解析比逐个抓详情页更脆。列表页真正可靠的产物就是「这一页有哪几个 slug」。
 *
 * 支持的链接形态（`#games-grid` 之类的 hash 会被忽略）：
 *   · https://retrogamesnexus.com/zh/snes-games?page=14
 *   · https://retrogamesnexus.com/zh/sega-game-gear-games   （多段拼的机种也认）
 *   · https://retrogamesnexus.com/zh/games           （全部游戏）
 *   · 干脆只给 /zh/snes-games
 * 认得出机种段、但那台站内跑不了的（`nds-games` / `playstation-games`…）回
 * `unsupported-console` —— 见 POST 里那段注释。
 *
 * 鉴权自查（本目录的接口都不挂 middleware，原因见 admin-guard.ts）。
 */

import { NextResponse } from 'next/server';
import type { ConsoleType } from '@/lib/emulator';
import { assertAdmin } from '@/lib/server/admin-guard';
import { UPSTREAM_LOCALES, fetchUpstreamHtml, toConsoleType } from '@/lib/server/upstream';
import { failJson } from '@/lib/server/url-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 列表页路径里的机种段。
 *
 * ⚠️ **必须允许连字符**：上游不是只有 `snes-games` 这种短段 —— 世嘉三台与万代 /
 * SNK 的掌机都是多段拼的（2026-10-14 实测）：`sega-game-gear-games` /
 * `sega-master-system-games` / `sega-32x-games` / `bandai-wonderswan-games` /
 * `neogeo-pocket-games`。只收 `[a-z0-9]+` 会把这几页**整个拒掉**
 * （表现是「认不出这个列表页地址」，可这几台站内明明是支持的）。
 */
const CONSOLE_SEGMENT = /^([a-z0-9-]+)-games$/;

/** 列表页里一款游戏的最小信息 —— 够弹框显示进度就行。 */
interface ListGame {
  slug: string;
  /** 标题只用于弹框显示；抠不到就是 null（详情页那一趟还会再给一次） */
  title: string | null;
}

interface ListTarget {
  /** 抓取路径（带上 page 查询） */
  path: string;
  /** 路径里那个机种段（`snes` / `sega-game-gear`）；`/games`（全部游戏）没有就是 null */
  consoleSegment: string | null;
  /** 这一页的机种；认不出、或认得出但我们跑不了（`nds` / `playstation`…）就是 null */
  consoleType: ConsoleType | null;
  page: number;
}

/** 从任意形态的输入里拆出列表页目标；认不出返回 null。 */
function parseListTarget(raw: string): ListTarget | null {
  const text = raw.trim();
  if (!text) return null;

  let url: URL;
  try {
    url = new URL(text.startsWith('http') ? text : `https://${text}`);
  } catch {
    return null;
  }
  // 只认本站域名，别让它变成一个任意 URL 的抓取器
  if (!/(^|\.)retrogamesnexus\.com$/i.test(url.hostname)) return null;

  const parts = url.pathname.split('/').filter(Boolean);
  // 允许带语言前缀（`/zh/...`），也允许不带（英文站无前缀）
  const hasLocale = (UPSTREAM_LOCALES as readonly string[]).includes(parts[0]);
  const locale = hasLocale ? parts[0] : UPSTREAM_LOCALES[0];
  const segment = hasLocale ? parts[1] : parts[0];
  if (!segment) return null;

  const consoleMatch = segment.match(CONSOLE_SEGMENT);
  if (!consoleMatch && segment !== 'games') return null;

  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '', 10) || 1);

  return {
    path: `/${locale}/${segment}${page > 1 ? `?page=${page}` : ''}`,
    consoleSegment: consoleMatch ? consoleMatch[1] : null,
    consoleType: consoleMatch ? toConsoleType(consoleMatch[1]) : null,
    page,
  };
}

/**
 * 从 RSC 数据块里抠出这一页的游戏。
 *
 * 游戏对象以 `"title":"…","slug":"…"` 开头，所以按这对字段配对抠即可 ——
 * 不必解析整个对象：RSC 流里重复的对象用 `$17:props:…` 这种**引用**去重，
 * 不是合法 JSON，`JSON.parse` 会直接失败。
 *
 * 为什么这对字段只命中游戏：系列 / 开发商对象用的是 `name`（不是 `title`），
 * 而 `about` 那个 `title` 后面跟的是 `description` 不是 `slug`。
 */
function gamesFromPayload(html: string): ListGame[] {
  const out: ListGame[] = [];
  const seen = new Set<string>();
  const re = /\\"title\\":\\"([^\\]{0,200}?)\\",\\"slug\\":\\"([a-z0-9][a-z0-9-]*)\\"/g;

  for (const match of html.matchAll(re)) {
    const slug = match[2];
    if (seen.has(slug)) continue; // 同一款可能在推荐位里再出现一次
    seen.add(slug);
    out.push({ slug, title: match[1] || null });
  }
  return out;
}

/**
 * 兜底：直接从页面上的游戏链接抠 slug（标题拿不到就留空）。
 * 只在上面那套字段配对失效时用（上游改了 RSC 结构的话）。
 */
function gamesFromLinks(html: string): ListGame[] {
  const out: ListGame[] = [];
  const seen = new Set<string>();
  // ⚠️ 不写死语言前缀：上游英文站是**无前缀**的（`/games/x`），只有中文站是 `/zh/games/x`
  const re = /href="[^"]*\/games\/([a-z0-9][a-z0-9-]*)"/g;

  for (const match of html.matchAll(re)) {
    const slug = match[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, title: null });
  }
  return out;
}

export async function POST(request: Request) {
  // 鉴权要在读 body 之前
  const denied = await assertAdmin();
  if (denied) return denied;

  let body: { url?: unknown };
  try {
    body = (await request.json()) as { url?: unknown };
  } catch {
    return failJson('bad-request', '请求体不是合法 JSON');
  }

  const target = parseListTarget(typeof body.url === 'string' ? body.url : '');
  if (!target) return failJson('bad-url', '认不出这个列表页地址（形如 /zh/snes-games?page=1）');

  /*
   * 机种段认得出来、但我们没有对应核心的，**直接拒**，别放进来。
   *
   * 放进来会怎样：列表页这一趟拿不到机种（consoleType = null），逐条抓详情也拿不到，
   * 最后落到 `form.set('console_type', … ?? 'nes')` —— 一整页 NDS / PS1 / 土星的游戏
   * 会被静默记成红白机。宁可在这儿报错，也不要往库里灌错机种。
   * `/games`（全部游戏）没有机种段，仍按原样放行（那种页面本来就是混着的）。
   */
  if (target.consoleSegment && !target.consoleType) {
    return failJson(
      'unsupported-console',
      `这个机种站内暂时跑不了（${target.consoleSegment}），换个机种的列表页吧`
    );
  }

  try {
    const html = await fetchUpstreamHtml(target.path);
    const games = gamesFromPayload(html);
    // 主用字段配对；一条都没抠到才退回链接（那种情况下标题是空的）
    const list = games.length > 0 ? games : gamesFromLinks(html);

    return NextResponse.json({
      path: target.path,
      page: target.page,
      consoleType: target.consoleType,
      /** 本页游戏条数 —— 弹框上那个「共 N 款」 */
      total: list.length,
      games: list,
    });
  } catch (error) {
    console.error('[admin] 抓取列表页失败', error);
    return failJson('scrape-failed', (error as Error).message, 502);
  }
}
