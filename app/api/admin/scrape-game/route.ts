/*
 * 后台「从链接自动填充」—— 给一个游戏页链接，抓回元数据交给表单预填。
 *
 * ⚠️ **只读网页文本，不碰任何 ROM 文件。** 解析的是页面里的 JSON-LD
 *    （schema.org 的 VideoGame 节点）加上开发商 / 系列那两条链接的文字；
 *    封面也只**回传图片地址**、不上传 R2 —— 封面与 ROM 仍然由后台手动选文件上传。
 *
 * 支持的链接形态（同一款游戏，slug 相同）：
 *   · https://retrogamesnexus.com/zh/games/<slug>
 *   · https://retrogamesnexus.com/zh/download-rom/<slug>
 *   · 干脆只给一个 <slug>
 * 无论哪种，一律去取 `/<locale>/games/<slug>` —— 只有那一页带完整的 JSON-LD。
 *
 * 双语：抓完主语言那一份，再**尽力**抓一次另一语言（失败就留空，前台会自动回退中文）。
 *
 * 鉴权自查（本目录的接口都不挂 middleware，原因见 admin-guard.ts）。
 */

import { NextResponse } from 'next/server';
import type { ConsoleType } from '@/lib/emulator';
import { assertAdmin } from '@/lib/server/admin-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE = 'https://retrogamesnexus.com';
/** 站点认得的语言前缀；第一个是缺省。 */
const LOCALES = ['zh', 'en'] as const;

/** 上游站点的路径里，这两段后面跟的都是同一个 slug。 */
const SLUG_KINDS = ['games', 'download-rom'];

/** 抓页面时用的 UA —— 拿默认的 node UA 有些站点会直接拒。 */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function fail(error: string, detail: string, status = 400) {
  return NextResponse.json({ error, detail }, { status });
}

/** 从任意形态的输入里拆出 `{ locale, slug }`；认不出返回 null。 */
function parseTarget(raw: string): { locale: string; slug: string } | null {
  const text = raw.trim();
  if (!text) return null;

  // 只给了 slug
  if (/^[a-z0-9][a-z0-9-]*$/i.test(text)) return { locale: LOCALES[0], slug: text };

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

  const locale = (LOCALES as readonly string[]).includes(parts[0]) ? parts[0] : LOCALES[0];
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

/** 把 JSON-LD 的 `gamePlatform` 收敛成站内的 ConsoleType。 */
function toConsoleType(value: unknown): ConsoleType | null {
  const text = String(value ?? '').toLowerCase();
  if (!text) return null;
  if (text.includes('gba') || text.includes('game boy advance')) return 'gba';
  if (text.includes('snes') || text.includes('super nintendo') || text.includes('super famicom'))
    return 'snes';
  if (text.includes('nes') || text.includes('famicom')) return 'nes';
  if (text.includes('arcade') || text.includes('mame') || text.includes('fbneo')) return 'arcade';
  return null;
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
}

/** 抓 `/<locale>/games/<slug>` 并解析出元数据。 */
async function scrapeGamePage(locale: string, slug: string): Promise<ScrapedPage> {
  const res = await fetch(`${SITE}/${locale}/games/${slug}`, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const node = jsonLdNodes(html).find((n) => n['@type'] === 'VideoGame') ?? {};
  const image = node.image as { url?: string } | undefined;
  const published = typeof node.datePublished === 'string' ? node.datePublished : '';
  const year = published ? Number.parseInt(published.slice(0, 4), 10) : Number.NaN;

  return {
    title: typeof node.name === 'string' ? node.name : null,
    description: aboutText(html),
    summary: typeof node.description === 'string' ? node.description : null,
    consoleType: toConsoleType(node.gamePlatform),
    year: Number.isFinite(year) ? year : null,
    developer: linkText(html, 'game-developer'),
    series: linkText(html, 'game-series'),
    imageUrl: typeof image?.url === 'string' ? image.url : null,
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
    return fail('bad-request', '请求体不是合法 JSON');
  }

  const target = parseTarget(typeof body.url === 'string' ? body.url : '');
  if (!target) return fail('bad-url', '认不出这个链接，请粘贴游戏页地址');

  try {
    const primary = await scrapeGamePage(target.locale, target.slug);

    /*
     * 另一语言那份**尽力而为**：抓不到就让那几个 `_en` 字段留空 ——
     * 前台对空的 `_en` 会自动回退中文（见 lib/server/games.ts 的 localizeGame），
     * 所以这里失败不该让整个请求失败。
     */
    const other = LOCALES.find((l) => l !== target.locale) ?? LOCALES[0];
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

    return NextResponse.json({
      title: zh?.title ?? primary.title,
      titleEn: en?.title ?? null,
      consoleType: primary.consoleType ?? secondary?.consoleType ?? null,
      year: primary.year ?? secondary?.year ?? null,
      developer: zh?.developer ?? primary.developer,
      series: zh?.series ?? primary.series,
      seriesEn: en?.series ?? null,
      description: bestDescription(zh ?? primary),
      descriptionEn: bestDescription(en),
      imageUrl: primary.imageUrl ?? secondary?.imageUrl ?? null,
    });
  } catch (error) {
    console.error('[admin] 抓取游戏页失败', error);
    return fail('scrape-failed', (error as Error).message, 502);
  }
}
