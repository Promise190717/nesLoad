import { cached } from '@/lib/server/cache';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { CONSOLE_LABEL } from '@/components/CartridgeSprite';
import { isConsoleType } from '@/lib/consoles';
import GameCardGrid from '@/components/GameCardGrid';
import GamesShell from '@/components/GamesShell';
import GamesSearchForm from '@/components/GamesSearchForm';
import {
  SITE_NAME,
  alternatesFor,
  localePath,
  ogLocale,
  otherLocales,
  translate,
  type Locale,
  type MessageKey,
} from '@/lib/i18n';
import { pageCountOf, parsePageParam } from '@/lib/pager';
import { GAME_LANGUAGE_LABEL, GAME_LANGUAGE_VALUES } from '@/lib/rom-lang';
import { getConsole, localizeConsole, type Console, type LocalizedConsoleText } from '@/lib/server/consoles';
import {
  countConsoleGamesByLanguageCached,
  listGamesByConsoleCached,
  listGamesPageCached,
} from '@/lib/server/games';
import { readLocaleParam } from '@/lib/server/locale';
import { resolveSiteOrigin } from '@/lib/site';

/**
 * `/consoles/[id]` —— 一个机种的专题页 + **这个机种下的全部游戏**（2026-10-14 用户要的）。
 *
 * 结构照抄 `/developers/[id]`：机种资料在上（图 / 介绍 / 资料表），名下游戏列表在下，
 * 分页用真 URL（`?page=N`）、非规范地址 307 收敛。
 *
 * ⚠️ **地址里这段 id 是机种标识本身**（`/consoles/nes`），不是 uuid —— 机种是代码里
 *    定死的枚举（`CONSOLE_TYPES`），天生稳定，比 uuid 好看得多。不在枚举里的一律
 *    `notFound()`（404 由同目录的 not-found.tsx 出）。
 *
 * ⚠️ **机种没在后台填过资料时这一页照常渲染**：`getConsole` 返回 null 就用
 *    `CONSOLE_LABEL` 的默认名字（NES / SFC / GBA / ARC）顶上，资料段里只有
 *    「游戏数」一项。首页与 `/consoles` 的卡片永远指得到这里 —— 绝不 404。
 *
 * ⚠️ 机种自己的资料**不缓存**（后台改完刷新就看到）；名下游戏列表走
 *    `listGamesByConsoleCached`（24 小时 TTL，和 `/games`、开发商详情页一致）。
 *    「x款游戏」也取自那次的 total（countGamesCached）—— 2026-10-14 起不再用
 *    资料行上的 gameCount，那个子查询是每请求全表 COUNT（详见 generateMetadata）。
 *
 * ---------------------------------------------------------------------------
 * 语种筛选（2026-10-16 加）：`?lang=<zh|en|ja|ko|all>`
 *
 * 这一页原来是「这个机种下的全部游戏」，一个机种下面往往同时躺着中日英韩四份 ROM，
 * 用户要的是「只看中文版」。于是加了一条筛选条（一排链接，和 `/games` 的机种筛选同款），
 * **筛的是 `games.language`，也就是游戏自己的语种**（不是界面语言）。
 *
 * ⚠️ **不写 `?lang=` 时默认 = 全部**（2026-10-16 用户要求：原来是「按界面语言挑一份」，
 *    改成「先给全部」）：在中文站打开 `/zh/consoles/nes` 看到的是这个机种下的全部游戏，
 *    想只看中文版再点那一颗。
 *    ⇒ 于是「默认那一份」的地址**就是裸路径**，点「全部」那颗也不会在地址里留下 `?lang=`
 *    （`?lang=all` 会被 307 收敛回裸地址 —— 同一份内容不能有两个 URL，
 *    和 `/games` 的 `?console=xxx`、`?page=01` 同一条规矩）。这也是「刷新不丢」的做法：
 *    地址栏里写着的就是用户选的那一份，界面语言在路径里，两者都是可复制、可收藏的。
 *
 * ⚠️ **认不出的 `?lang=xxx` 与重复参数一律当没给**（于是 307 收敛回裸地址），
 *    和 `/games?console=xxx` 一个字不差。
 *
 * ⚠️ 收录策略：**带 `?lang=` 的那几份 `noindex, follow`**（`?q=` 同款，见 generateMetadata）。
 *    它们只是同一份列表的子集，语种只有四个，全收进去就是四份重复内容。默认那一份
 *    （裸地址）照常收录 —— 它就是「这个机种下的全部游戏」，和加筛选之前一模一样。
 *
 * ⚠️ 切语种 / 搜索 / 翻页**必须互相带上彼此**（`consoleHref` 一次拼全）：否则搜一下就
 *    掉回默认那份、筛了语种一翻页就变回全部。第 1 页不写 `page`，规范顺序是
 *    `q` → `lang` → `page`。
 */
type SearchParams = Record<string, string | string[] | undefined>;

/** 每页几款游戏。和 `/games` 列表页、开发商详情页一致（同一套 5 列网格）。 */
const PAGE_SIZE = 15;

const loadConsole = cached(async (type: string) => getConsole(type), ['static-console'], { revalidate: 86400, tags: ['consoles'] });

/**
 * 名下的游戏。包 `cache()` 是为了让 `generateMetadata` 与正文共用同一次查询 ——
 * 两处要的其实是不同的 `page`，所以真正的作用是同一页里别查两遍。
 */
const loadGames = cache(
  async (type: string, page: number, keyword = '', language: string | null = null) => {
    if (!isConsoleType(type)) return { games: [], total: 0, offset: 0, limit: PAGE_SIZE };
    return keyword
      ? listGamesPageCached((page - 1) * PAGE_SIZE, PAGE_SIZE, keyword, type, language)
      : listGamesByConsoleCached(type, (page - 1) * PAGE_SIZE, PAGE_SIZE, language);
  }
);

/*
 * 这段地址是不是一个真机种，判据是 `lib/consoles.ts` 的 `isConsoleType` 那份登记表
 * （枚举之外的 `/consoles/foo` 交给 notFound）。2026-10-14 之前这里手写过一个同款函数，
 * 和后台接口那份是两处 —— 加机种时漏掉任何一处都会让专题页 404。
 */

/** 这个短码是不是站内认得的游戏语种。白名单来自 lib/rom-lang.ts，别在这儿另抄一张。 */
const FILTER_ALL = 'all';

function isGameLanguage(value: string): boolean {
  return (GAME_LANGUAGE_VALUES as readonly string[]).includes(value);
}

/**
 * 「筛的是哪个语种」→「写进地址里的那一串」。
 *
 * 两态：**「全部」（null）⇒ 空串**（整段不写，默认那份地址就是裸路径）；其余 ⇒ 短码本身。
 * **判断「这个地址规范不规范」和「拼链接」用的是同一个函数**，两处各写一份迟早会漂。
 * （2026-10-16 之前这里还有第三态「等于界面语言 ⇒ 空串」；默认改成全部之后，
 * 界面语言只是一门普通的语种，没有特殊写法了。）
 */
function languageParamOf(language: string | null): string {
  return language ?? '';
}

/**
 * 解析 `?lang=`。返回的 `language` 是**实际要筛的语种**（null = 全部），`param` 是它
 * 写进地址的形态，`canonical` 表示这个地址本身是不是规范形式（不是的话调用方 307）。
 *
 * ⚠️ `canonical` 的判据是「**参数在不在**」而不是「参数是不是空串」：重复参数
 *    （`?lang=a&lang=b`）在 `typeof raw === 'string'` 上就落空了，用「在不在」才能把它们
 *    一起收敛掉（`lib/pager.ts` 的 `parsePageParam` 同一条规矩）。
 * ⚠️ 认不出的值、`all`（＝默认那份的写法）**一律当没给**（都返回 null = 全部），于是
 *    `?lang=xxx` / `?lang=all` 会被判为非规范 ⇒ 307 回裸地址 —— 少了这一步，一个拼错的
 *    语种会静默渲染出一整页「全部」，同一份内容凭空多一个 URL
 *    （和 `/games` 的 `?console=xxx` 同一个理由）。
 */
function parseLanguage(
  raw: string | string[] | undefined
): { language: string | null; param: string; canonical: boolean } {
  const value = typeof raw === 'string' ? raw : '';
  const language = isGameLanguage(value) ? value : null;
  const param = languageParamOf(language);

  return { language, param, canonical: param ? value === param : raw === undefined };
}

/**
 * 第几页的地址。**语言前缀在这里加**（`lib/pager.ts` 的 `pageHref` 只认裸路径）。
 *
 * `langParam` 收的是**已经归一化过的那一串**（`parseLanguage` 的 `param` /
 * `languageParamOf` 的结果），不是「哪个语种」—— 归一化只有一处，见那个函数的注释。
 * 参数顺序固定成 `q` → `lang` → `page`（服务端按地址字符串比对是否规范，顺序不同也是两个 URL）。
 */
function consoleHref(
  locale: Locale,
  type: string,
  page: number,
  keyword = '',
  langParam = ''
): string {
  const query = new URLSearchParams();
  if (keyword) query.set('q', keyword);
  if (langParam) query.set('lang', langParam);
  if (page > 1) query.set('page', String(page));
  return localePath(locale, `/consoles/${type}`) + (query.size ? `?${query}` : '');
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const [{ id }, rawQuery] = await Promise.all([params, searchParams]);
  const locale = await readLocaleParam(params);

  /* 不在枚举里 → 404。在 metadata 里就抛掉，是为了让 404 的响应连 head 一起是对的 */
  if (!isConsoleType(id)) notFound();

  const lang = parseLanguage(rawQuery.lang);

  const [row, games] = await Promise.all([loadConsole(id), loadGames(id, 1, '', lang.language)]);

  /*
   * 没资料行就用默认名字（NES / SFC / GBA / ARC）—— 两种语言下它本来就不变，
   * 所以这里不经过 localizeConsole（那条路要一个完整的 Console 对象）。
   */
  const text: LocalizedConsoleText = row
    ? localizeConsole(row, locale)
    : { name: CONSOLE_LABEL[id], summary: null, description: null };
  /*
   * 条数：**一律用游戏列表那次查询的 total**（`countGamesCached`，24 小时缓存）。
   * 2026-10-14 之前这里优先用资料行上「顺带」算出来的 gameCount —— 但那个子查询
   * 没有 console_type 索引、getConsole 又不缓存，等于每个请求全表 COUNT 一遍
   * （见 lib/server/consoles.ts）。改用 total 后这条全表扫描消失，
   * 代价是后台加/删游戏后这个数字最多晚 24 小时更新 —— 和列表本身同一口径。
   * ⚠️ 传了 `lang.language`，所以这个数是**当前语种那份**的条数 —— 和页面上真正列出来的
   *    条目对得上（描述里那句「共 N 款」不该比用户看到的列表多）。
   */
  const count = games.total;

  const title = translate(locale, 'seo.console.title', { name: text.name });
  const description = translate(locale, 'seo.console.description', {
    name: text.name,
    count,
  });
  const canonical = consoleHref(locale, id, 1, '', lang.param);

  return {
    title,
    description,
    /*
     * hreflang 只指**不带筛选项的那一份**（`/consoles/nes`）：语种那几份是 `noindex`
     * 的子集（见下面 robots），让它们互指只会把「两份不同内容声明成同一页」，
     * Google 会直接判这一组标注无效。和 `/games?console=` 那边「hreflang 带上自己的
     * 筛选参数」不同 —— 那里 `?console=` 是可收录的真实分类，这里不是。
     */
    alternates: alternatesFor(locale, `/consoles/${id}`),
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: SITE_NAME[locale],
      title,
      description,
      // 没机图就不给 images（别塞一张不存在的图）
      ...(row?.imageUrl ? { images: [{ url: row.imageUrl, alt: text.name }] } : {}),
      locale: ogLocale(locale),
      alternateLocale: otherLocales(locale).map(ogLocale),
    },
    /*
     * **带 `?lang=` 的那几份不收录**（`lang.param !== ''`，也就是地址里真带了 `?lang=`）：
     * 它们是同一份列表的子集，语种只有四个，全收进去就是四份重复内容
     * （和 `/games` 的 `?q=` 同一个处理）。`follow` 必须留着 —— 爬虫仍要顺着卡片
     * 走到详情页。⚠️ 默认那一份（裸地址，现在是「全部」）**照常收录**；
     * 这里不写 `index: true`，由根布局那份兜底（同 `/games` 的注释）。
     */
    ...(lang.param ? { robots: { index: false, follow: true } } : {}),
  };
}

/**
 * 结构化数据：一条面包屑（「首页 › 全部机种 › NES」那条路径）。
 *
 * 和开发商详情页比少了 `Organization`：机种不是一家公司，硬套类型不如只写
 * 有把握的部分 —— 结构化数据与页面内容不一致是要被判作弊的。
 */
function buildJsonLd(origin: string, locale: Locale, type: string, name: string) {
  const url = `${origin}${localePath(locale, `/consoles/${type}`)}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        /* 面包屑第一项是**首页**（`/`），不是那间屋子 —— 见游戏详情页同一段的注释 */
        name: translate(locale, 'common.home'),
        item: `${origin}${localePath(locale, '/')}`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: translate(locale, 'consolesPage.backToConsoles'),
        item: `${origin}${localePath(locale, '/consoles')}`,
      },
      { '@type': 'ListItem', position: 3, name, item: url },
    ],
  };
}

export default async function ConsoleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, rawQuery] = await Promise.all([params, searchParams]);
  const [locale, row, origin] = await Promise.all([
    readLocaleParam(params),
    loadConsole(id),
    resolveSiteOrigin(),
  ]);

  if (!isConsoleType(id)) notFound();

  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  /*
   * 按语言选定文案。没资料行时整个 `row` 就是个只带默认名字的壳 ——
   * 渲染逻辑按「字段可能没有」写，和有资料行走同一条路。
   * （变量名刻意不叫 `console`：遮蔽全局 console 对象，将来在里面 log 一句就出不来了。）
   */
  const consoleRow: Console = row ?? {
    type: id,
    texts: {
      zh: { name: CONSOLE_LABEL[id], summary: null, description: null },
      en: { name: CONSOLE_LABEL[id], summary: null, description: null },
    },
    imageUrl: null,
    releaseYear: null,
    createdAt: 0,
    gameCount: 0,
  };
  const text = localizeConsole(consoleRow, locale);

  const { page, canonical } = parsePageParam(rawQuery.page);
  const keyword = typeof rawQuery.q === 'string' ? rawQuery.q.trim() : '';
  const lang = parseLanguage(rawQuery.lang);
  /*
   * 和 /games 同一套：`?page=1` / `?page=01` / 重复参数、认不出的 `?lang=`、
   * 「写了但等于默认」的 `?lang=all`，统统收敛到规范地址。
   */
  if (
    !canonical ||
    (rawQuery.q !== undefined && rawQuery.q !== keyword) ||
    rawQuery.q === '' ||
    !lang.canonical
  ) {
    redirect(consoleHref(locale, id, page, keyword, lang.param));
  }

  const [data, allGames, langCounts] = await Promise.all([
    loadGames(id, page, keyword, lang.language),
    /*
     * `allGames` 一律**不筛语种**（最后那个 null）：它是「这个机种一共有几款游戏」，
     * 资料表里那一行和筛选条上「全部」那颗数字都用它。⛔ 别看它筛掉语种就改成跟着
     * `lang.language` 走 —— 那样「全部」那颗会显示成当前语种的条数，一页两个假数字。
     */
    loadGames(id, 1, '', null),
    countConsoleGamesByLanguageCached(id),
  ]);
  const pageCount = pageCountOf(data.total, PAGE_SIZE);

  // 越界（这个机种 / 这个语种的游戏被删到不够这么多页）退到最后一页，地址栏一起纠正
  if (page > pageCount) redirect(consoleHref(locale, id, pageCount, keyword, lang.param));

  // 游戏数：走列表那次查询的 total（countGamesCached，24 小时缓存），理由见 generateMetadata
  const gameCount = allGames.total;

  const facts: { label: string; value: string }[] = [
    ...(consoleRow.releaseYear
      ? [{ label: t('consolesPage.field.released'), value: String(consoleRow.releaseYear) }]
      : []),
    {
      label: t('consolesPage.gamesHeading', { name: text.name }),
      value: t('consolesPage.gameCount', { count: gameCount }),
    },
  ];

  return (
    <GamesShell
      locale={locale}
      label="CONSOLE"
      title={text.name}
      intro={text.summary ?? undefined}
      /*
       * 左上那颗是「返回」而不是「全部机种」：走**浏览器回退**（`mode: 'history'`）——
       * 用户可能是从 `/consoles` 列表或某款游戏详情页点进来的，回上一页比写死回
       * `/consoles` 准（和游戏 / 开发商详情页左上那条同一条规矩）。
       * `href` 只是直接打开这一页时的兜底 / 爬虫 / 中键新标签的落点。
       */
      back={{ href: localePath(locale, '/consoles'), label: 'common.back', mode: 'history' }}
    >
      <script
        type="application/ld+json"
        /* 内联 <script> 里出现 `</script>` 就能提前闭合标签 —— 这里的名字是后台可控的，必须转义 */
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildJsonLd(origin, locale, id, text.name)).replace(/</g, '\\u003c'),
        }}
      />

      <div className="mt-8 flex flex-col gap-8 sm:flex-row sm:items-start">
        {/* 机图。没图时用卡带丝印词占位，不留一个空框 */}
        {consoleRow.imageUrl ? (
          <div className="pixel-edge pxw-2 pxc-700 w-[140px] shrink-0 bg-ink-900 sm:w-[180px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={consoleRow.imageUrl}
              alt={text.name}
              className="block aspect-square w-full object-contain"
            />
          </div>
        ) : (
          <div
            aria-hidden="true"
            className="pixel-edge pxw-2 pxc-700 flex aspect-square w-[140px] shrink-0 items-center justify-center bg-ink-900 font-pixel text-[34px] text-ink-600 sm:w-[180px]"
          >
            {CONSOLE_LABEL[id]}
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/*
            正文就是后台填的「介绍」。没填就一个字都不画 ——
            机种没填过资料时这一栏整个不存在（下面的资料表和游戏列表已经说明了一切），
            与开发商详情页「没介绍就不画」是同一条规矩。
          */}
          {text.description && (
            <p className="text-[13px] leading-7 whitespace-pre-wrap text-ink-300">
              {text.description}
            </p>
          )}

          {/* 资料表。和游戏 / 开发商详情页同一套 `dl` 写法（这一页的语义也是「字段名 : 值」） */}
          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-ink-800 pt-5">
            {facts.map((fact) => (
              <div key={fact.label} className="contents">
                <dt className="text-[12px] text-ink-500">{fact.label}</dt>
                <dd className="text-[12px] text-ink-200">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* ------------------------------------------------- 这个机种下的游戏 */}

      <section className="mt-12">
        <h2 className="border-b border-ink-800 pb-3 text-[14px] text-ink-200">
          {t('consolesPage.gamesHeading', { name: text.name })}
        </h2>

        <GamesSearchForm
          locale={locale}
          keyword={keyword}
          consoleType={null}
          /* 带上当前语种：不然在「日本語」里搜一下就掉回默认那份（见组件那段注释） */
          languageParam={lang.param}
          actionPath={`/consoles/${id}`}
        />

        {/*
          语种筛选条（2026-10-16 加）。版式与行为照抄 `/games` 那条机种筛选：
          **一排链接**（每个语种一个真地址，能中键新标签、能复制、爬虫也顺得下去），
          当前那颗 accent 高亮 + `aria-current`，「全部」那颗对应「不筛语种」。

          ⚠️ 每颗后面挂**这个机种下该语种的条数**（用户要求「每个语种还是显示数量」）：
          数字来自 `countConsoleGamesByLanguageCached`（一条 GROUP BY，24 小时缓存、
          **不跟关键词走**，和资料表里那个总数同口径）；「全部」那颗用 `gameCount`，
          也就是这个机种的总数 —— 两者出自同一份数据，不会打架。
          ⚠️ **不筛掉 0 款的那几颗**：一个机种下没有韩语版是事实，比少一颗按钮更该让用户看到。
          ⚠️ 切语种时**把关键词带上**、页码一律回第 1 页（换了筛选条件，第 3 页毫无意义）。
        */}
        <nav
          aria-label={t('consolesPage.filterLangLabel')}
          className="mt-4 flex flex-wrap items-center gap-2"
        >
          {[null, ...GAME_LANGUAGE_VALUES].map((code) => {
            const active = code === lang.language;
            const count = code ? (langCounts[code] ?? 0) : gameCount;
            return (
              <Link
                key={code ?? FILTER_ALL}
                /* 「全部」那颗给空串 ⇒ 指回裸地址（唯一的那一份，也是默认那份） */
                href={consoleHref(locale, id, 1, keyword, languageParamOf(code))}
                aria-current={active ? 'true' : undefined}
                className={`pixel-edge pxw-2 pxc-500 px-3 py-1.5 text-[12px] transition-colors ${
                  active ? 'bg-accent text-ink-950' : 'bg-ink-800 text-ink-200 hover:text-accent'
                }`}
              >
                {/* 语言名用它自己的语言写（简体中文 / English / 日本語 / 한국어），不进文案表 */}
                {code ? GAME_LANGUAGE_LABEL[code] : t('gamesPage.filterAll')}
                {/* 条数：不写 `font-pixel`（那一列字形里没有 CJK），跟着标签同一套字体 */}
                <span className="ml-1.5 opacity-70">{count}</span>
              </Link>
            );
          })}
        </nav>

        {keyword && (
          <p className="mt-4 text-[12px] text-ink-300">
            {t('gamesPage.searchResults', { keyword, count: data.total })}
          </p>
        )}

        {data.games.length === 0 ? (
          /*
           * 三种「空」分开说（和 /games 同一个路数）：搜了词没搜到 > 筛了语种但这个机种
           * 一款都没有 > 这个机种整个是空的。搜索优先 —— 同时有词和语种时说「没搜到这个词」
           * 比说「没有这个语种的游戏」准确。
           */
          <p className="mt-8 text-[13px] text-ink-400">
            {keyword
              ? t('gamesPage.searchEmpty', { keyword })
              : lang.language
                ? t('consolesPage.gamesEmptyLang', { lang: GAME_LANGUAGE_LABEL[lang.language] })
                : t('consolesPage.gamesEmpty')}
          </p>
        ) : (
          /* 满屏都是同一个机种，游戏卡片下面那行依然照常报开发商 / 年份 —— 只有机种那截是重复的 */
          <GameCardGrid games={data.games} locale={locale} />
        )}

        {pageCount > 1 && (
          <nav className="mt-10 flex items-center justify-center gap-4">
            {/*
              ⚠️ 翻页链接必须带上**关键词和语种**（`consoleHref` 一起拼）：
              少了语种，筛着「日本語」翻一页就变回全部了 —— 用户会以为筛选坏了。
            */}
            {page > 1 ? (
              <Link
                href={consoleHref(locale, id, page - 1, keyword, lang.param)}
                rel="prev"
                className="pixel-edge pxw-2 pxc-500 bg-ink-800 px-3 py-1.5 text-[12px] text-ink-200 transition-colors hover:text-accent"
              >
                {t('gamesPage.prev')}
              </Link>
            ) : (
              // 首页那个「上一页」整块不画而不是渲染成灰按钮：指向自己的死链比少一个链接更糟
              <span className="px-3 py-1.5 text-[12px] text-ink-700">{t('gamesPage.prev')}</span>
            )}

            <span className="font-pixel text-[12px] text-ink-500">
              {page} / {pageCount}
            </span>

            {page < pageCount ? (
              <Link
                href={consoleHref(locale, id, page + 1, keyword, lang.param)}
                rel="next"
                className="pixel-edge pxw-2 pxc-500 bg-ink-800 px-3 py-1.5 text-[12px] text-ink-200 transition-colors hover:text-accent"
              >
                {t('gamesPage.next')}
              </Link>
            ) : (
              <span className="px-3 py-1.5 text-[12px] text-ink-700">{t('gamesPage.next')}</span>
            )}
          </nav>
        )}
      </section>
    </GamesShell>
  );
}
