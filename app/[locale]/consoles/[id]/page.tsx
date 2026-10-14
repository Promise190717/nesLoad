import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { CONSOLE_LABEL } from '@/components/CartridgeSprite';
import { isConsoleType } from '@/lib/consoles';
import GameCardGrid from '@/components/GameCardGrid';
import GamesShell from '@/components/GamesShell';
import {
  SITE_NAME,
  alternatesFor,
  localePath,
  ogLocale,
  otherLocale,
  translate,
  type Locale,
  type MessageKey,
} from '@/lib/i18n';
import { pageCountOf, pageHref, parsePageParam } from '@/lib/pager';
import { getConsole, localizeConsole, type Console, type LocalizedConsoleText } from '@/lib/server/consoles';
import { listGamesByConsoleCached } from '@/lib/server/games';
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
 *    `listGamesByConsoleCached`（12 小时 TTL，和 `/games`、开发商详情页一致）。
 */
type SearchParams = Record<string, string | string[] | undefined>;

/** 每页几款游戏。和 `/games` 列表页、开发商详情页一致（同一套 5 列网格）。 */
const PAGE_SIZE = 15;

const loadConsole = cache(async (type: string) => getConsole(type));

/**
 * 名下的游戏。包 `cache()` 是为了让 `generateMetadata` 与正文共用同一次查询 ——
 * 两处要的其实是不同的 `page`，所以真正的作用是同一页里别查两遍。
 */
const loadGames = cache(
  async (type: string, page: number) => {
    if (!isConsoleType(type)) return { games: [], total: 0, offset: 0, limit: PAGE_SIZE };
    return listGamesByConsoleCached(type, (page - 1) * PAGE_SIZE, PAGE_SIZE);
  }
);

/*
 * 这段地址是不是一个真机种，判据是 `lib/consoles.ts` 的 `isConsoleType` 那份登记表
 * （枚举之外的 `/consoles/foo` 交给 notFound）。2026-10-14 之前这里手写过一个同款函数，
 * 和后台接口那份是两处 —— 加机种时漏掉任何一处都会让专题页 404。
 */

/**
 * 第几页的地址。**语言前缀在这里加**（`lib/pager.ts` 的 `pageHref` 只认裸路径）。
 */
function consoleHref(locale: Locale, type: string, page: number): string {
  return localePath(locale, pageHref(`/consoles/${type}`, page));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const locale = await readLocaleParam(params);

  /* 不在枚举里 → 404。在 metadata 里就抛掉，是为了让 404 的响应连 head 一起是对的 */
  if (!isConsoleType(id)) notFound();

  const [row, games] = await Promise.all([loadConsole(id), loadGames(id, 1)]);

  /*
   * 没资料行就用默认名字（NES / SFC / GBA / ARC）—— 两种语言下它本来就不变，
   * 所以这里不经过 localizeConsole（那条路要一个完整的 Console 对象）。
   */
  const text: LocalizedConsoleText = row
    ? localizeConsole(row, locale)
    : { name: CONSOLE_LABEL[id], summary: null, description: null };
  // 条数：有资料行走行上顺带算出来的 gameCount，没有就用游戏列表那次查询的 total
  const count = row ? row.gameCount : games.total;

  const title = translate(locale, 'seo.console.title', { name: text.name });
  const description = translate(locale, 'seo.console.description', {
    name: text.name,
    count,
  });
  const canonical = localePath(locale, `/consoles/${id}`);

  return {
    title,
    description,
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
      alternateLocale: ogLocale(otherLocale(locale)),
    },
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
    name: CONSOLE_LABEL[id],
    nameEn: CONSOLE_LABEL[id],
    imageUrl: null,
    summary: null,
    summaryEn: null,
    description: null,
    descriptionEn: null,
    releaseYear: null,
    createdAt: 0,
    gameCount: 0,
  };
  const text = localizeConsole(consoleRow, locale);

  const { page, canonical } = parsePageParam(rawQuery.page);
  // 和 /games 同一套：`?page=1` / `?page=01` / 重复参数都收敛到规范地址
  if (!canonical) redirect(consoleHref(locale, id, page));

  const data = await loadGames(id, page);
  const pageCount = pageCountOf(data.total, PAGE_SIZE);

  // 越界（这个机种的游戏被删到不够这么多页）退到最后一页，地址栏一起纠正
  if (page > pageCount) redirect(consoleHref(locale, id, pageCount));

  // 游戏数：资料行上顺带算出来的（和列表那次查询一致），壳上没有就用列表的 total
  const gameCount = row ? row.gameCount : data.total;

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

        {data.games.length === 0 ? (
          <p className="mt-8 text-[13px] text-ink-400">{t('consolesPage.gamesEmpty')}</p>
        ) : (
          /* 满屏都是同一个机种，游戏卡片下面那行依然照常报开发商 / 年份 —— 只有机种那截是重复的 */
          <GameCardGrid games={data.games} locale={locale} />
        )}

        {pageCount > 1 && (
          <nav className="mt-10 flex items-center justify-center gap-4">
            {page > 1 ? (
              <Link
                href={consoleHref(locale, id, page - 1)}
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
                href={consoleHref(locale, id, page + 1)}
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
