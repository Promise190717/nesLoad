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
 * 多语言（2026-10-16 起四份）：**四个语言各抓一次**（zh / en / ja / ko，实测上游
 * `/ja/…` `/ko/…` 是真日韩文），抓回来的四份进响应体的 `texts`，由调用方写进
 * `game_texts` 侧表。中文那份是「站内主名字」（判重与 `games.title` 用它）；
 * 某个语言抓不到就留空 —— 前台读取时逐字段回退中文。
 *
 * ⚠️ **2026-10-15：`fileName` 是「一份语言一个地址」，不是只给一个。**
 *    所以除了一直有的 `romUrl` / `romName` / `romLang`（挑出来的那一份，手动添加那条路在用），
 *    响应里多带一个 `roms` —— **整张语言表**，并且逐份查过重。「从列表导入」靠它把
 *    一款游戏的中 / 英 / 日 / 韩 四个版本各导一条（见 components/AdminBulkImport）。
 *
 * 鉴权自查（本目录的接口都不挂 middleware，原因见 admin-guard.ts）。
 */

import { NextResponse } from 'next/server';
import type { ConsoleType } from '@/lib/emulator';
import { romLangToFormValue } from '@/lib/rom-lang';
import { assertAdmin } from '@/lib/server/admin-guard';
import { findGameDuplicate } from '@/lib/server/games-admin';
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
 * 简介：取「关于 <标题>」那个小标题下面的**第一段**。
 *
 * 为什么只取一段：这个字段在前台是**游戏库卡片上的悬停提示**（见 lib/i18n.ts 的
 * `admin.description.placeholder`），整段铺开太长；首段一般是自包含的引言，够用。
 * 取不到就返回 null，由调用方回退到 JSON-LD 那句短描述（见 bestDescription）。
 *
 * ⚠️ **小标题是四语言的**（2026-10-16 实测，四个都要认，少一个那份简介就抓不到）：
 *    · 中文 —— `关于 星之卡比 参上！多洛奇团`
 *    · 英文 —— `About …`
 *    · 日文 —— `星のカービィ 参上！ ドロッチェ団について`
 *    · 韩文 —— `별의 커비 도트 투어 소개`
 *    ⚠️ `소개` 比另外三个泛（韩文里「介绍」用得很广），但现在只有**第一个**匹配
 *    才会被取走，而实测那一页里只有「关于」那块含它。真出现误命中，把判据收成
 *    「标题以 `소개` 结尾」即可。
 *
 * ⚠️ 要改回「整段」的话，把下面换成收集 `body` 里所有 `<p>` 再 `join('\n\n')` 即可
 *    （2026-10-13 之前就是那么写的）。
 */
function aboutText(html: string): string | null {
  const heading = html.match(/<h[1-6][^>]*>[^<]*(?:关于|About|について|소개)[^<]*<\/h[1-6]>/i);
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
 *
 * ⚠️ 这一套只服务**手动添加那条路**（表单一次只能填一份 ROM）。「从列表导入」不挑 ——
 *    它把 `roms` 里每一份都导一遍（2026-10-15）。
 */
const ROM_LANG_PRIORITY = ['en', 'cn', 'zh', 'ja'] as const;

/** `fileName` 里的一份语言版本。 */
interface RomVariant {
  /** 上游那个 key（en / zh / cn / ja / ko…） */
  lang: string;
  /** 站内短码（zh / en / ja / ko）；上游给了我们不认的语言就是 null */
  language: string | null;
  /** 绝对地址（相对路径已补上主站域名） */
  url: string;
  /** 原始文件名 —— FBNeo 认它当驱动名，改不得 */
  name: string;
}

/**
 * 从 RSC 数据块里抠出**所有** ROM 下载地址（一份语言一条）。
 *
 * 页面是 Next App Router 渲染的，`self.__next_f.push([1,"…"])` 里带着**完整游戏对象**，
 * 其中 `fileName` 就是 ROM 的地址表（JSON-LD 里没有这个字段）：
 *   "fileName":{"en":"https://files.retrogamesnexus.com/games/roms/kirby-squeak-squad.nds",
 *               "zh":"…-cn.nds","ja":"…-ja.nds","ko":"…-ko.nds"}
 * key 是 ROM 的语言版本，value 是地址。**顺序保持上游给的顺序**，这里不重排。
 *
 * ⚠️ 这一段在 HTML 里是**转义过的**（`\"` 而不是 `"`），所以按转义形态匹配。
 * ⚠️ 先拿 slug 定个锚点再往后找 —— 同一份数据里还有 `relatedGames`，
 *    全局搜第一处 `fileName` 会摸到**别的游戏**（实测 kirby-squeak-squad 那一页
 *    后面还跟着十几个相关游戏的 `fileName`）。锚点窗口 4000 字符够用：
 *    实测主游戏那一份落在锚点后第 3000 字符上下。
 * ⚠️ 值是**两种形态**，同一页里会混着出现（2026-10-14 踩过）：
 *    · 绝对地址 `https://files.retrogamesnexus.com/games/roms/x.zip`
 *    · 站内相对路径 `/games/roms/Contra.nes`
 *    只认 http(s) 会把后一批全漏掉 —— 表现就是 NES 那些游戏一律报「该页面没有游戏文件」。
 *    相对路径的 base 是**主站**（`retrogamesnexus.com`），不是 `files.` 那个子域：
 *    实测 `files.…/games/roms/Contra.nes` 是 404，主站那个才是 200。
 * ⚠️ `cn` / `zh` 都算中文，所以按**站内短码**去重 —— 上游两种写法都挂着时只留先出现的那个
 *    （不然会往库里灌两条一模一样的「中文版」）。
 */
function romsFromHtml(html: string, slug: string): RomVariant[] {
  const anchor = html.indexOf(`\\"slug\\":\\"${slug}\\"`);
  const from = anchor === -1 ? 0 : anchor;
  const segment = html.slice(from, from + 4000);

  const block = segment.match(/\\"fileName\\":\{([^}]*)\}/);
  if (!block) return [];

  const out: RomVariant[] = [];
  const seen = new Set<string>();

  for (const match of block[1].matchAll(/\\"([\w-]+)\\":\\"(https?:\/\/[^\\"]+|\/[^\\"]+)\\"/g)) {
    // 统一转小写再比 —— 上游的 key 大小写不一定稳；
    // 相对路径补上主站域名（后面取文件名、交给 fetch-rom 抓都用得上）
    const lang = match[1].toLowerCase();
    const url = match[2].startsWith('/') ? `${UPSTREAM_SITE}${match[2]}` : match[2];
    const name = decodeURIComponent(url.split('/').pop() ?? '');
    if (!name) continue;

    const language = romLangToFormValue(lang);
    // 认不出的语言拿它自己的 key 去重 —— 那是它唯一的身份
    const key = language ?? lang;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ lang, language, url, name });
  }
  return out;
}

/** 按语言优先级从整张表里挑一份（手动添加那条路用）；表空就是 null。 */
function pickRom(roms: readonly RomVariant[]): RomVariant | null {
  if (!roms.length) return null;
  return (
    ROM_LANG_PRIORITY.map((lang) => roms.find((rom) => rom.lang === lang)).find(Boolean) ?? roms[0]
  );
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
  /**
   * `fileName` 里**每一个**语言版本（2026-10-15 加）。
   * 「从列表导入」照它逐语言入库；手动添加那条路只用下面挑好的那一份。
   */
  roms: RomVariant[];
  /** 从 `roms` 里按优先级挑出来的那一份的下载地址，页面没挂文件时是 null */
  romUrl: string | null;
  /** ROM 原始文件名 —— FBNeo 认它当驱动名，改不得（2026-10-14 加） */
  romName: string | null;
  /** 挑中那一份的语言 key（en / cn / zh / ja…）—— 表单「语言」下拉照它填 */
  romLang: string | null;
}

/** 抓 `/<locale>/games/<slug>` 并解析出元数据。 */
async function scrapeGamePage(locale: string, slug: string): Promise<ScrapedPage> {
  const html = await fetchUpstreamHtml(`/${locale}/games/${slug}`);

  const node = jsonLdNodes(html).find((n) => n['@type'] === 'VideoGame') ?? {};
  const image = node.image as { url?: string } | undefined;
  const published = typeof node.datePublished === 'string' ? node.datePublished : '';
  const year = published ? Number.parseInt(published.slice(0, 4), 10) : Number.NaN;
  // ROM 地址只在 RSC 数据里，JSON-LD 没有（见 romsFromHtml 的注释）
  const roms = romsFromHtml(html, slug);
  // 手动添加那条路要的「一份」：按优先级挑（见 pickRom）
  const rom = pickRom(roms);

  return {
    title: typeof node.name === 'string' ? node.name : null,
    description: aboutText(html),
    summary: typeof node.description === 'string' ? node.description : null,
    consoleType: toConsoleType(node.gamePlatform),
    year: Number.isFinite(year) ? year : null,
    developer: linkText(html, 'game-developer'),
    series: linkText(html, 'game-series'),
    imageUrl: typeof image?.url === 'string' ? image.url : null,
    roms,
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
     * **四个语言各抓一份**（2026-10-16）：上游 `/ja/…` `/ko/…` 的文案是真日韩文，
     * 抓回来写进 `game_texts` 的 ja / ko 行 —— 这就是「自动爬取补齐日韩」。
     *
     * ⚠️ primary（用户给的那个 locale）**失败就整体失败**（封面 / ROM / 机种以它为主份）；
     *    其余三份**尽力而为** —— 抓不到就把那个语言的文案留空，写入时不会建空行
     *    （见 lib/server/games.ts 的 writeTexts），前台读取时逐字段回退中文。
     *    一份失败不该让整个请求失败，也不该带走别的语言。
     *
     * ⚠️ **并行发**：四个页面各几十 KB，串行就是四倍延迟。
     */
    const pages = new Map<string, ScrapedPage | null>([[target.locale, primary]]);
    await Promise.all(
      UPSTREAM_LOCALES.filter((locale) => locale !== target.locale).map(async (locale) => {
        try {
          pages.set(locale, await scrapeGamePage(locale, target.slug));
        } catch (error) {
          console.warn(`[admin] ${locale} 那份抓取失败，该语言文案留空`, error);
          pages.set(locale, null);
        }
      })
    );

    const pageOf = (locale: string): ScrapedPage | null => pages.get(locale) ?? null;

    /*
     * 四份文案（每份只带「要翻译的三个字段」）—— 调用方原样传给
     * POST /api/admin/games 的 `texts` 字段，那边写进 `game_texts`。
     *
     * ⚠️ **`developer` 不在里面**：厂名由数据层按 `developerId` 反查后写
     *    （见 lib/server/games.ts 的 withDeveloper）。上游的厂名是**按页面语言翻译的**
     *    （实测韩文页给「HAL 연구소」，与库里存的名字对不上），照搬会污染快照、
     *    还会让「名字 → developers.id」那张映射表失配。
     */
    const texts = Object.fromEntries(
      UPSTREAM_LOCALES.map((locale) => {
        const page = pageOf(locale);
        return [
          locale,
          {
            title: page?.title ?? null,
            series: page?.series ?? null,
            description: page ? bestDescription(page) : null,
          },
        ];
      })
    );

    /*
     * primary 之外的兜底页 —— 封面 / 机种 / ROM 表在 primary 上取不到时用它。
     * 按 `UPSTREAM_LOCALES` 的顺序取**第一个抓到的**（顺序固定，别依赖 Map 的插入序）。
     */
    const fallbackPage =
      UPSTREAM_LOCALES.filter((locale) => locale !== target.locale)
        .map((locale) => pageOf(locale))
        .find((page): page is ScrapedPage => page !== null) ?? null;

    /*
     * 中文那份是「站内主名字」（判重与 `games.title` 都用它），缺了才退到 primary。
     * ⚠️ 别改成 primary 优先：primary 是**用户贴的那个链接的语言**，可能正好是日文页。
     */
    const title = pageOf('zh')?.title ?? primary.title;
    // 语言 key 跟着选中的那份 ROM 走（它决定表单「语言」下拉填什么，也是判重的一半）
    const romLang = primary.romLang ?? fallbackPage?.romLang ?? null;

    /*
     * 顺手查一次重：判据与 POST /api/admin/games 里那次**完全一致**（都走 findGameDuplicate，
     * 同名 + 同机种 + 同语言），否则会出现「这里说不重复、下载完上传却被判重复」。
     *
     * ⚠️ 机种这一维取**先定的那个值**（primary 优先，再看 fallbackPage）—— 和下面响应体里
     *    `consoleType` 用的是同一个表达式，别再算一遍，否则两条路径会漂。
     *
     * 调用方（批量导入）靠它**先决定要不要去下载封面和 ROM** —— 那一步是几 MB，
     * 是整条链路里最慢的一段；库里已有的（同名 + 同机种 + 同语言）直接跳过，不白下载一遍。
     * ⚠️ 查重失败（D1 抖一下）**不该拦住抓取本身** —— 上传那一步还会再判一次，那才是兜底。
     */
    const consoleType = primary.consoleType ?? fallbackPage?.consoleType ?? null;
    /*
     * ⚠️ **语言认不出（`fr` / `es`…）就整段跳过判重**（2026-10-20 改）。
     *    新库的判重把语言那一维写成 `EXISTS (… r.language = ?)`，传 `null` 等于
     *    **这一维不参与**，会命中「同名同机种但只有英文版」的游戏 —— 那不是同一盘 ROM。
     *    跳过之后交给上传那一步兜底（那边语言是必填的）。
     */
    const formLanguage = romLangToFormValue(romLang);
    let duplicateOf: { id: string; title: string; language: string | null } | null = null;
    try {
      duplicateOf =
        title && formLanguage
          ? await findGameDuplicate(title, formLanguage, consoleType)
          : null;
    } catch (error) {
      console.warn('[admin] 预检查重失败，交给上传那一步兜底', error);
    }

    /*
     * 「从列表导入」要**一款多语言全导**（2026-10-15 用户要求）：上游 `fileName` 一份语言
     * 一个地址（实测 kirby-squeak-squad 是 en / zh / ja / ko 四份），所以整张表都带出去，
     * 并且**逐份查一次重** —— 判据与上传那一步、与上面那次完全一致（findGameDuplicate）。
     *
     * 为什么不让调用方自己判：它手里只有 slug，「标题 + 机种 + 语言」都得先解析出来。
     * 而下载封面 / ROM 是整条链路里最慢的一段（几 MB × 语言数），在服务端先判掉能省一大半流量。
     *
     * ⚠️ 只对**认得出站内短码**的那几份查重：认不出的语言（`fr` / `es`…）如果拿 `null`
     *    去查，会命中「没标语言」的老记录 —— 那不是同一盘 ROM，不能算重复。
     *    那几份一律 `duplicate: false`，由上传那一步兜底判。
     * ⚠️ 查重失败（D1 抖一下）同样不该拦住抓取 —— 置 false，交给上传那一步。
     */
    const variants = primary.roms.length ? primary.roms : fallbackPage?.roms ?? [];
    const roms = await Promise.all(
      variants.map(async (variant) => {
        let duplicate = false;
        if (title && variant.language) {
          try {
            duplicate = (await findGameDuplicate(title, variant.language, consoleType)) !== null;
          } catch (error) {
            console.warn('[admin] 逐语言预检查重失败，交给上传那一步兜底', error);
          }
        }
        return { ...variant, duplicate };
      })
    );

    return NextResponse.json({
      /**
       * **四个语言的文案**（2026-10-16 加）—— 爬取那条路原样传给
       * POST /api/admin/games 的 `texts` 字段，写进 `game_texts` 的 zh / en / ja / ko 行。
       * 某个语言那页没抓到就是那份全 `null`（写入时不建空行，见 writeTexts）。
       * ⚠️ 只有 title / series / description，**没有 developer**（见上面 texts 那段）。
       */
      texts,
      /*
       * 下面这六个扁平字段是 `texts` 里**中英两份的投影**，只为**手动添加**
       * （AdminGames 的「从链接自动填充」）留着 —— 那个表单目前只有中英两栏。
       * ⚠️ 爬取那条路别再用它们：那样会把日韩丢掉。
       */
      title,
      titleEn: texts.en?.title ?? null,
      consoleType,
      year: primary.year ?? fallbackPage?.year ?? null,
      /*
       * 开发商取**中文页**那份（缺了退 primary）—— 它是「名字 → developers.id」
       * 那张映射表的键，必须与库里存的名字是同一种语言（见上面 texts 那段）。
       */
      developer: pageOf('zh')?.developer ?? primary.developer,
      series: texts.zh?.series ?? primary.series,
      seriesEn: texts.en?.series ?? null,
      description: texts.zh?.description ?? bestDescription(primary),
      descriptionEn: texts.en?.description ?? null,
      // 封面 / ROM 的**地址**（字节不在这里取）：主语言那份优先 ——
      // 不同语言页面挂的 ROM 版本可能不同（中文页给日版、英文页给美版）
      imageUrl: primary.imageUrl ?? fallbackPage?.imageUrl ?? null,
      /**
       * `fileName` 里**每一个**语言版本（2026-10-15 加）—— 「从列表导入」照它逐份入库：
       * `language` 是站内短码（zh / en / ja / ko），认不出的语言是 null；
       * `duplicate` 只对认得的那几种算（见上面注释）。
       */
      roms,
      // 下面三个是「挑出来的那一份」，手动添加（AdminGames 自动填充）在用，别删
      romUrl: primary.romUrl ?? fallbackPage?.romUrl ?? null,
      romName: primary.romName ?? fallbackPage?.romName ?? null,
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
