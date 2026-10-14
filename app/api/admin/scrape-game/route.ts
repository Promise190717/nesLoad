/*
 * 后台「从链接自动填充」—— 给一个游戏页链接，抓回元数据交给表单预填。
 *
 * 解析两处：
 *   · 页面里的 JSON-LD（schema.org 的 VideoGame 节点）—— 标题 / 简介 / 机种 / 年份 / 封面；
 *   · Next 的 RSC 数据块（`self.__next_f.push`）—— ROM 下载地址（对象里的 `fileName`）；
 * 再加上开发商 / 系列那两条链接的文字。
 *
 * ⚠️ **只回传地址，不代取字节、不碰 R2。** 封面与 ROM 的字节由前端再走
 *    /api/admin/fetch-image 与 /api/admin/fetch-rom 两个代理取回来（上游是别的域名，
 *    浏览器直接 fetch 会被 CORS 挡）。真正上传仍走后台表单那一条路。
 *
 * 支持的链接形态（同一款游戏，slug 相同）：
 *   · https://retrogamesnexus.com/zh/games/<slug>
 *   · https://retrogamesnexus.com/zh/download-rom/<slug>
 *   · 干脆只给一个 <slug>
 * 无论哪种，一律去取 `/<locale>/games/<slug>` —— 那一页同时带完整 JSON-LD 与 RSC 数据
 * （ROM 地址只在 RSC 里；两页都带 `fileName`，2026-10-14 核过下载页也有）。
 *
 * 双语：抓完主语言那一份，再**尽力**抓一次另一语言（失败就留空，前台会自动回退中文）。
 *
 * 鉴权自查（本目录的接口都不挂 middleware，原因见 admin-guard.ts）。
 */

import { NextResponse } from 'next/server';
import type { ConsoleType } from '@/lib/emulator';
import { romLangToFormValue } from '@/lib/rom-lang';
import { assertAdmin } from '@/lib/server/admin-guard';
import { findGameDuplicate } from '@/lib/server/games';
import { UPSTREAM_LOCALES, UPSTREAM_SITE, fetchUpstreamHtml, toConsoleType } from '@/lib/server/upstream';
import { failJson } from '@/lib/server/url-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 上游站点的路径里，这两段后面跟的都是同一个 slug。 */
const SLUG_KINDS = ['games', 'download-rom'];

/** 从任意形态的输入里拆出 `{ locale, slug }`；认不出返回 null。 */
function parseTarget(raw: string): { locale: string; slug: string } | null {
  const text = raw.trim();
  if (!text) return null;

  // 只给了 slug
  if (/^[a-z0-9][a-z0-9-]*$/i.test(text)) return { locale: UPSTREAM_LOCALES[0], slug: text };

  let url: URL;
  try {
    url = new URL(text.startsWith('http') ? text : `https://${text}`);
  } catch {
    return null;
  }
  // 只认本站域名，别让它变成一个任意 URL 的抓取器
  if (!/(^|\.)retrogamesnexus\.com$/i.test(url.hostname)) return null;

  const parts = url.pathname.split('/').filter(Boolean);
  const slug = parts.at(-1);
  const kind = parts.at(-2);
  if (!slug || !kind || !SLUG_KINDS.includes(kind)) return null;

  const locale = (UPSTREAM_LOCALES as readonly string[]).includes(parts[0])
    ? parts[0]
    : UPSTREAM_LOCALES[0];
  return { locale, slug };
}

/** 取出页面里所有 JSON-LD 块，拍平成一维节点数组。 */
function jsonLdNodes(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(re)) {
    try {
      const parsed = JSON.parse(match[1]) as Record<string, unknown>;
      const graph = parsed['@graph'];
      if (Array.isArray(graph)) out.push(...(graph as Record<string, unknown>[]));
      else out.push(parsed);
    } catch {
      // 坏块跳过，别让一块坏 JSON 毁掉整页解析
    }
  }
  return out;
}

/** 去掉标签与常见实体，压掉多余空白。 */
function stripTags(html: string): string {
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
 * 简介：取「关于 <标题>」（英文站是「About ...」）那个小标题下面的**第一段**。
 *
 * 为什么只取一段：这个字段在前台是**游戏库卡片上的悬停提示**（见 lib/i18n.ts 的
 * `admin.description.placeholder`），整段铺开太长；首段一般是自包含的引言，够用。
 * 取不到就返回 null，由调用方回退到 JSON-LD 那句短描述。
 *
 * ⚠️ 要改回「整段」的话，把下面换成收集 `body` 里所有 `<p>` 再 `join('\n\n')` 即可
 *    （2026-10-13 之前就是那么写的）。
 */
function aboutText(html: string): string | null {
  const heading = html.match(/<h[1-6][^>]*>[^<]*(?:关于|About)[^<]*<\/h[1-6]>/i);
  if (!heading || heading.index === undefined) return null;

  const rest = html.slice(heading.index + heading[0].length);
  const stop = rest.search(/<h[1-6][^>]*>/i);
  const body = stop === -1 ? rest : rest.slice(0, stop);

  const first = body.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const text = first ? stripTags(first[1]) : '';
  return text || null;
}

/** 取第一个指向 `/<kind>/<slug>` 的链接文字（开发商 / 系列就挂在这种链接上）。 */
function linkText(html: string, kind: 'game-developer' | 'game-series'): string | null {
  const match = html.match(new RegExp(`<a[^>]*/${kind}/[^>]*>([\\s\\S]*?)</a>`, 'i'));
  const text = match ? stripTags(match[1]) : '';
  return text || null;
}

/**
 * ROM 多语言版本时挑选的先后：**英文 → 中文 → 日文**，都没有就退到第一个。
 * `cn` / `zh` 都算中文（上游两种写法都用过，比较前统一转小写）。
 */
const ROM_LANG_PRIORITY = ['en', 'cn', 'zh', 'ja'] as const;

/**
 * 从 RSC 数据块里抠出 ROM 下载地址。
 *
 * 页面是 Next App Router 渲染的，`self.__next_f.push([1,"…"])` 里带着**完整游戏对象**，
 * 其中 `fileName` 就是 ROM 的地址表（JSON-LD 里没有这个字段）：
 *   "fileName":{"ja":"https://files.retrogamesnexus.com/games/roms/ultra-seven-ja.zip"}
 * key 是 ROM 的语言版本（ja / en / cn…），value 是绝对地址。
 *
 * 顺手把选中那条的**语言 key** 也带出去 —— 表单的「语言」下拉就靠它填
 * （那个字段是判重的一环：同名 + 同语言才算重复）。
 *
 * ⚠️ 这一段在 HTML 里是**转义过的**（`\"` 而不是 `"`），所以按转义形态匹配。
 * ⚠️ 先拿 slug 定个锚点再往后找 —— 同一份数据里还有 `relatedGames`，
 *    直接全局搜第一处 `fileName` 将来未必还是主游戏那条。
 * ⚠️ 值是**两种形态**，同一页里会混着出现（2026-10-14 踩过）：
 *    · 绝对地址 `https://files.retrogamesnexus.com/games/roms/x.zip`
 *    · 站内相对路径 `/games/roms/Contra.nes`
 *    只认 http(s) 会把后一批全漏掉 —— 表现就是 NES 那些游戏一律报「该页面没有游戏文件」。
 *    相对路径的 base 是**主站**（`retrogamesnexus.com`），不是 `files.` 那个子域：
 *    实测 `files.…/games/roms/Contra.nes` 是 404，主站那个才是 200。
 */
function romFromHtml(
  html: string,
  slug: string
): { url: string; name: string; lang: string } | null {
  const anchor = html.indexOf(`\\"slug\\":\\"${slug}\\"`);
  const from = anchor === -1 ? 0 : anchor;
  const segment = html.slice(from, from + 4000);

  const block = segment.match(/\\"fileName\\":\{([^}]*)\}/);
  if (!block) return null;

  const entries: { lang: string; url: string }[] = [];
  for (const match of block[1].matchAll(/\\"([\w-]+)\\":\\"(https?:\/\/[^\\"]+|\/[^\\"]+)\\"/g)) {
    // 统一转小写再比 —— 上游的 key 大小写不一定稳；
    // 相对路径补上主站域名（后面取文件名、交给 fetch-rom 抓都用得上）
    entries.push({
      lang: match[1].toLowerCase(),
      url: match[2].startsWith('/') ? `${UPSTREAM_SITE}${match[2]}` : match[2],
    });
  }
  if (!entries.length) return null;

  // 按语言优先级挑一个；都没有就退到第一个（上游只给一个版本时就是这种情形）
  const picked =
    ROM_LANG_PRIORITY.map((lang) => entries.find((entry) => entry.lang === lang)).find(Boolean) ??
    entries[0];

  const name = decodeURIComponent(picked.url.split('/').pop() ?? '');
  return name ? { url: picked.url, name, lang: picked.lang } : null;
}

interface ScrapedPage {
  title: string | null;
  /** 简介（「关于」首段），拿不到就是 null */
  description: string | null;
  /** JSON-LD 里那句短描述，首段简介缺失时兜底 */
  summary: string | null;
  consoleType: ConsoleType | null;
  year: number | null;
  developer: string | null;
  series: string | null;
  imageUrl: string | null;
  /** ROM 下载地址（RSC 数据里的 `fileName`），页面没挂文件时是 null */
  romUrl: string | null;
  /** ROM 原始文件名 —— FBNeo 认它当驱动名，改不得（2026-10-14 加） */
  romName: string | null;
  /** 选中那个 ROM 的语言 key（en / cn / zh / ja…）—— 表单「语言」下拉照它填 */
  romLang: string | null;
}

/** 抓 `/<locale>/games/<slug>` 并解析出元数据。 */
async function scrapeGamePage(locale: string, slug: string): Promise<ScrapedPage> {
  const html = await fetchUpstreamHtml(`/${locale}/games/${slug}`);

  const node = jsonLdNodes(html).find((n) => n['@type'] === 'VideoGame') ?? {};
  const image = node.image as { url?: string } | undefined;
  const published = typeof node.datePublished === 'string' ? node.datePublished : '';
  const year = published ? Number.parseInt(published.slice(0, 4), 10) : Number.NaN;
  // ROM 地址只在 RSC 数据里，JSON-LD 没有（见 romFromHtml 的注释）
  const rom = romFromHtml(html, slug);

  return {
    title: typeof node.name === 'string' ? node.name : null,
    description: aboutText(html),
    summary: typeof node.description === 'string' ? node.description : null,
    consoleType: toConsoleType(node.gamePlatform),
    year: Number.isFinite(year) ? year : null,
    developer: linkText(html, 'game-developer'),
    series: linkText(html, 'game-series'),
    imageUrl: typeof image?.url === 'string' ? image.url : null,
    romUrl: rom?.url ?? null,
    romName: rom?.name ?? null,
    romLang: rom?.lang ?? null,
  };
}

/** 首段简介优先，没有就退到 JSON-LD 那句短描述。 */
function bestDescription(page: ScrapedPage | null): string | null {
  return page?.description ?? page?.summary ?? null;
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

  const target = parseTarget(typeof body.url === 'string' ? body.url : '');
  if (!target) return failJson('bad-url', '认不出这个链接，请粘贴游戏页地址');

  try {
    const primary = await scrapeGamePage(target.locale, target.slug);

    /*
     * 另一语言那份**尽力而为**：抓不到就让那几个 `_en` 字段留空 ——
     * 前台对空的 `_en` 会自动回退中文（见 lib/server/games.ts 的 localizeGame），
     * 所以这里失败不该让整个请求失败。
     */
    const other = UPSTREAM_LOCALES.find((l) => l !== target.locale) ?? UPSTREAM_LOCALES[0];
    let secondary: ScrapedPage | null = null;
    try {
      secondary = await scrapeGamePage(other, target.slug);
    } catch (error) {
      console.warn('[admin] 另一语言抓取失败，_en 字段留空', error);
    }

    // 中文那份进无后缀字段，英文那份进 `_en`
    const primaryIsEn = target.locale === 'en';
    const zh = primaryIsEn ? secondary : primary;
    const en = primaryIsEn ? primary : secondary;

    const title = zh?.title ?? primary.title;
    // 语言 key 跟着选中的那份 ROM 走（它决定表单「语言」下拉填什么，也是判重的一半）
    const romLang = primary.romLang ?? secondary?.romLang ?? null;

    /*
     * 顺手查一次重：判据与 POST /api/admin/games 里那次**完全一致**（都走 findGameDuplicate），
     * 否则会出现「这里说不重复、下载完上传却被判重复」。
     *
     * 调用方（批量导入）靠它**先决定要不要去下载封面和 ROM** —— 那一步是几 MB，
     * 是整条链路里最慢的一段；库里已有的（同名 + 同语言）直接跳过，不白下载一遍。
     * ⚠️ 查重失败（D1 抖一下）**不该拦住抓取本身** —— 上传那一步还会再判一次，那才是兜底。
     */
    let duplicateOf: { id: string; title: string; language: string | null } | null = null;
    try {
      duplicateOf = title ? await findGameDuplicate(title, romLangToFormValue(romLang)) : null;
    } catch (error) {
      console.warn('[admin] 预检查重失败，交给上传那一步兜底', error);
    }

    return NextResponse.json({
      title,
      titleEn: en?.title ?? null,
      consoleType: primary.consoleType ?? secondary?.consoleType ?? null,
      year: primary.year ?? secondary?.year ?? null,
      developer: zh?.developer ?? primary.developer,
      series: zh?.series ?? primary.series,
      seriesEn: en?.series ?? null,
      description: bestDescription(zh ?? primary),
      descriptionEn: bestDescription(en),
      // 封面 / ROM 的**地址**（字节不在这里取）：主语言那份优先 ——
      // 不同语言页面挂的 ROM 版本可能不同（中文页给日版、英文页给美版）
      imageUrl: primary.imageUrl ?? secondary?.imageUrl ?? null,
      romUrl: primary.romUrl ?? secondary?.romUrl ?? null,
      romName: primary.romName ?? secondary?.romName ?? null,
      romLang,
      /** 库里已经有同名同语言的一条 —— 调用方据此**跳过下载**（那一步最慢） */
      duplicate: duplicateOf !== null,
      duplicateOf,
    });
  } catch (error) {
    console.error('[admin] 抓取游戏页失败', error);
    return failJson('scrape-failed', (error as Error).message, 502);
  }
}
