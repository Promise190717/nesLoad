import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import GameCardGrid from '@/components/GameCardGrid';
import GamesShell from '@/components/GamesShell';
import { SITE_NAME, translate, type Locale, type MessageKey } from '@/lib/i18n';
import { pageCountOf, pageHref, parsePageParam } from '@/lib/pager';
import { getDeveloper, type Developer } from '@/lib/server/developers';
import { listGamesByDeveloperCached } from '@/lib/server/games';
import { readLocale } from '@/lib/server/locale';
import { resolveSiteOrigin } from '@/lib/site';

/**
 * `/developers/[id]` —— 一家开发商的资料页 + **他名下的全部游戏**（2026-10-12 用户要的）。
 *
 * 这就是「点厂商 → 出现这个厂商下所有游戏列表」那条需求的终点：游戏详情页里
 * 开发商那一栏是链接，点过来就是这里；这里每张卡片又能点回 `/games/<id>`，
 * 两个方向都通，爬虫顺着走也不会掉进死胡同。
 *
 * ⚠️ **用 id 不用名字做地址**：名字是后台能改的（改完 URL 就断了、外链全失效），
 * 而 id 一旦生成就固定。代价是地址不好看（一串 uuid），换来的是「改名不动链接」。
 *
 * ⚠️ **不写 `export const dynamic`**：读 D1 + cookie，本来就是动态渲染。
 *
 * 名下那段游戏列表走 `listGamesByDeveloperCached`（30 分钟 TTL，和 `/games` 列表页一致）；
 * 开发商自己的资料（名字 / 简介 / 介绍）**不缓存** —— 后台改完刷新就能看到。
 */
type SearchParams = Record<string, string | string[] | undefined>;

/** 每页几款游戏。和 `/games` 列表页一致（同一套 5 列网格）。 */
const PAGE_SIZE = 15;

const loadDeveloper = cache(async (id: string) => getDeveloper(id));

/**
 * 名下的游戏。包 `cache()` 是为了让 `generateMetadata` 与正文共用同一次查询 ——
 * 不过两处要的其实是不同的 `page`，所以真正的作用是同一页里别查两遍。
 */
const loadGames = cache(
  async (id: string, page: number) =>
    listGamesByDeveloperCached(id, (page - 1) * PAGE_SIZE, PAGE_SIZE)
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [locale, developer] = await Promise.all([readLocale(), loadDeveloper(id)]);

  /*
   * 开发商没了就 `notFound()` —— 404 由 `app/developers/[id]/not-found.tsx` 出。
   * 在 metadata 里就抛掉，是为了让 404 的响应**连 head 一起**是对的。
   */
  if (!developer) notFound();

  const title = translate(locale, 'seo.developer.title', { name: developer.name });
  // 条数用开发商行上顺带算出来的 gameCount，不再为了一句 description 多查一次
  const description = translate(locale, 'seo.developer.description', {
    name: developer.name,
    count: developer.gameCount,
  });
  const canonical = `/developers/${id}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: SITE_NAME[locale],
      title,
      description,
      // 没厂标就不给 images（别塞一张不存在的图）
      ...(developer.imageUrl ? { images: [{ url: developer.imageUrl, alt: developer.name }] } : {}),
      locale: locale === 'zh' ? 'zh_CN' : 'en_US',
    },
  };
}

/**
 * 结构化数据：这家公司本身 + 一条面包屑。
 *
 * 为什么值得写：`Organization` 让搜索引擎知道「这串 uuid 背后是一家有名字的公司」，
 * 而不是一个页面的临时分组；`BreadcrumbList` 让结果里能出现
 * 「房间 › 全部开发商 › CAPCOM」那条路径。
 *
 * ⚠️ **只写库里真实存在的字段**：没填成立年份就不写 `foundingDate`，
 * 没厂标就不写 `logo` —— 结构化数据与页面内容不一致是要被判作弊的。
 */
function buildJsonLd(origin: string, locale: Locale, developer: Developer, t: (key: MessageKey, vars?: Record<string, string | number>) => string) {
  const url = `${origin}/developers/${developer.id}`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${url}#organization`,
        name: developer.name,
        url,
        ...(developer.description || developer.summary
          ? { description: developer.description ?? developer.summary ?? undefined }
          : {}),
        ...(developer.imageUrl ? { logo: developer.imageUrl } : {}),
        ...(developer.website ? { sameAs: developer.website } : {}),
        ...(developer.foundedYear ? { foundingDate: String(developer.foundedYear) } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: t('gamesPage.backHome'), item: origin },
          {
            '@type': 'ListItem',
            position: 2,
            name: t('developersPage.backToDevelopers'),
            item: `${origin}/developers`,
          },
          { '@type': 'ListItem', position: 3, name: developer.name, item: url },
        ],
      },
    ],
  };
}

export default async function DeveloperDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, rawQuery] = await Promise.all([params, searchParams]);
  const [locale, developer, origin] = await Promise.all([
    readLocale(),
    loadDeveloper(id),
    resolveSiteOrigin(),
  ]);
  if (!developer) notFound();

  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  const { page, canonical } = parsePageParam(rawQuery.page);
  // 和 /games 同一套：`?page=1` / `?page=01` / 重复参数都收敛到规范地址
  if (!canonical) redirect(pageHref(`/developers/${id}`, page));

  const data = await loadGames(id, page);
  const pageCount = pageCountOf(data.total, PAGE_SIZE);

  // 越界（这家公司的游戏被删到不够这么多页）退到最后一页，地址栏一起纠正
  if (page > pageCount) redirect(pageHref(`/developers/${id}`, pageCount));

  const facts: { label: string; value: string }[] = [
    ...(developer.foundedYear
      ? [{ label: t('developersPage.field.founded'), value: String(developer.foundedYear) }]
      : []),
    {
      label: t('developersPage.gamesHeading', { name: developer.name }),
      value: t('developersPage.gameCount', { count: data.total }),
    },
  ];

  return (
    <GamesShell
      locale={locale}
      label="DEVELOPER"
      title={developer.name}
      intro={developer.summary ?? undefined}
      /*
       * 左上那颗是「返回」而不是「全部开发商」：走**浏览器回退**（`mode: 'history'`）——
       * 用户可能是从 `/developers` 列表或某款游戏详情页点进来的，回上一页比写死回
       * `/developers` 准（和游戏详情页左上「← 全部游戏」同一条规矩）。
       * `href` 只是直接打开这一页时的兜底 / 爬虫 / 中键新标签的落点。
       * 页脚与面包屑里那条「全部开发商」仍是 `backToDevelopers`，不随这里改。
       */
      back={{ href: '/developers', label: 'developersPage.back', mode: 'history' }}
    >
      <script
        type="application/ld+json"
        /* 内联 <script> 里出现 `</script>` 就能提前闭合标签 —— 这里的名字是后台可控的，必须转义 */
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildJsonLd(origin, locale, developer, t)).replace(/</g, '\\u003c'),
        }}
      />

      <div className="mt-8 flex flex-col gap-8 sm:flex-row sm:items-start">
        {/* 厂标。没图时用名字首字占位，不留一个空框 */}
        {developer.imageUrl ? (
          <div className="pixel-edge pxw-2 pxc-700 w-[140px] shrink-0 bg-ink-900 sm:w-[180px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={developer.imageUrl}
              alt={developer.name}
              className="block aspect-square w-full object-contain"
            />
          </div>
        ) : (
          <div
            aria-hidden="true"
            className="pixel-edge pxw-2 pxc-700 flex aspect-square w-[140px] shrink-0 items-center justify-center bg-ink-900 font-pixel text-[44px] text-ink-600 sm:w-[180px]"
          >
            {Array.from(developer.name)[0] ?? '?'}
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/*
            正文就是后台填的「介绍」。没填就一个字都不画 ——
            这一页不像游戏详情页有「《X》是一款 NES 游戏」那种能兜住的话，
            与其编一句废话，不如让版式干净点（下面的资料表和游戏列表已经说明了一切）。
          */}
          {developer.description && (
            <p className="text-[13px] leading-7 whitespace-pre-wrap text-ink-300">
              {developer.description}
            </p>
          )}

          {/* 资料表。和游戏详情页同一套 `dl` 写法（这一页的语义也是「字段名 : 值」） */}
          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-ink-800 pt-5">
            {facts.map((fact) => (
              <div key={fact.label} className="contents">
                <dt className="text-[11px] text-ink-500">{fact.label}</dt>
                <dd className="text-[12px] text-ink-200">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* ------------------------------------------------- 他名下的游戏 */}

      <section className="mt-12">
        <h2 className="border-b border-ink-800 pb-3 text-[14px] text-ink-200">
          {t('developersPage.gamesHeading', { name: developer.name })}
        </h2>

        {data.games.length === 0 ? (
          <p className="mt-8 text-[13px] text-ink-400">{t('developersPage.gamesEmpty')}</p>
        ) : (
          /* 满屏都是同一个开发商，卡片下面那行就不用再报一次名字了 */
          <GameCardGrid games={data.games} showDeveloper={false} />
        )}

        {pageCount > 1 && (
          <nav className="mt-10 flex items-center justify-center gap-4">
            {page > 1 ? (
              <Link
                href={pageHref(`/developers/${id}`, page - 1)}
                rel="prev"
                className="pixel-edge pxw-2 pxc-500 bg-ink-800 px-3 py-1.5 text-[11px] text-ink-200 transition-colors hover:text-accent"
              >
                {t('gamesPage.prev')}
              </Link>
            ) : (
              <span className="px-3 py-1.5 text-[11px] text-ink-700">{t('gamesPage.prev')}</span>
            )}

            <span className="font-pixel text-[10px] text-ink-500">
              {page} / {pageCount}
            </span>

            {page < pageCount ? (
              <Link
                href={pageHref(`/developers/${id}`, page + 1)}
                rel="next"
                className="pixel-edge pxw-2 pxc-500 bg-ink-800 px-3 py-1.5 text-[11px] text-ink-200 transition-colors hover:text-accent"
              >
                {t('gamesPage.next')}
              </Link>
            ) : (
              <span className="px-3 py-1.5 text-[11px] text-ink-700">{t('gamesPage.next')}</span>
            )}
          </nav>
        )}
      </section>
    </GamesShell>
  );
}
