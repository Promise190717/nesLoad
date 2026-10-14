import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import GamesShell from '@/components/GamesShell';
import { cardDelayMs } from '@/lib/card-stagger';
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
import { listDevelopersCached, localizeDeveloper } from '@/lib/server/developers';
import { readLocaleParam } from '@/lib/server/locale';

/**
 * `/developers` —— 公开的开发商列表（2026-10-12 用户要的「点开发商看他名下的游戏」的入口之一）。
 *
 * 和 `/games` 同一套做法，理由也一模一样：真路由、服务端组件、数据在服务端取、
 * 分页用真 URL（`?page=N`）、非规范地址 307 收敛 —— 这一页要能被搜索引擎收录，
 * 也要能被直接分享。
 *
 * ⚠️ **不写 `export const dynamic`**：要读 D1 和语言（cookie），本来就是动态渲染。
 *
 * 数据走 `listDevelopersCached`（**24 小时**，2026-10-13 用户要求）。原来是不缓存的
 * （理由：「几十条、一条 SELECT 带个 COUNT 子查询就完了，改完名字刷新就该看到」），
 * 但这一页每次渲染要打**两次 D1**（COUNT + SELECT，见 listDevelopers），所以改成缓存。
 *
 * ⚠️ 代价是**后台改完开发商的名字 / 简介，这一页最多要等一天才更新**。和首页那几个区块
 *    同一个取舍：这一页是给爬虫和过路访客的入口，内容变得慢，而每个访客都查两趟不划算。
 *    （开发商详情页上开发商自己的资料**不缓存**，那边改完是立刻的；名下游戏列表 30 分钟。）
 */
type SearchParams = Record<string, string | string[] | undefined>;

/** 每页几个。开发商卡比游戏封面矮，一行放 4 个、一页 24 个（6 行）刚好。 */
const PAGE_SIZE = 24;

/**
 * 本页要的数据。包 `cache()` 让 `generateMetadata` 与正文共用同一次查询 ——
 * 两处都要 `total`（一个拼 description 里的条数，一个算总页数）。
 */
const loadPage = cache(async (page: number) => {
  const data = await listDevelopersCached((page - 1) * PAGE_SIZE, PAGE_SIZE, '');
  return { ...data, page };
});

/**
 * 第几页的地址。**语言前缀在这里加**（`lib/pager.ts` 的 `pageHref` 只认裸路径）——
 * 三处用它：`<Link>`、`redirect()`、canonical。少了这一层，中文列表页的
 * 「下一页」会把用户送回英文。
 */
function developersHref(locale: Locale, page: number): string {
  return localePath(locale, pageHref('/developers', page));
}

export async function generateMetadata({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const [locale, params] = await Promise.all([readLocaleParam(routeParams), searchParams]);
  const { page } = parsePageParam(params.page);
  const { total } = await loadPage(page);

  // 条数现读：写死会在增减开发商之后变成假话
  const title = translate(locale, 'seo.developers.title');
  const description = translate(locale, 'seo.developers.description', { count: total });
  // 第 2 页往后把页码写进标题，否则几页标题一模一样
  const pageSuffix = page > 1 ? ` (${page})` : '';
  const canonical = developersHref(locale, page);

  return {
    title: `${title}${pageSuffix}`,
    description,
    /* 同 /games：hreflang 只指列表第一页，不带 `?page=` */
    alternates: alternatesFor(locale, '/developers'),
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: SITE_NAME[locale],
      title: `${title}${pageSuffix}`,
      description,
      locale: ogLocale(locale),
      alternateLocale: ogLocale(otherLocale(locale)),
    },
  };
}

export default async function DevelopersPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [locale, params] = await Promise.all([readLocaleParam(routeParams), searchParams]);
  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  const { page, canonical } = parsePageParam(params.page);
  // 非规范写法（`?page=1` / `?page=01` / 重复参数…）一律收敛，别让同一份列表有两个 URL
  if (!canonical) redirect(developersHref(locale, page));

  const data = await loadPage(page);
  const pageCount = pageCountOf(data.total, PAGE_SIZE);

  // 越界（收藏了一个后来被删空的页码）退到最后一页，地址栏也一起纠正
  if (page > pageCount) redirect(developersHref(locale, pageCount));

  return (
    <GamesShell
      locale={locale}
      label="DEVELOPERS"
      title={t('developersPage.heading')}
      intro={t('developersPage.intro', { count: data.total })}
      back={{ href: localePath(locale, '/room'), label: 'common.back', mode: 'history' }}
    >
      {data.developers.length === 0 ? (
        <p className="mt-8 text-[13px] text-ink-400">{t('developersPage.empty')}</p>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {data.developers.map((developer, index) => {
            /* 卡片上的名字 / 简介按当前语言取一份（见 localizeDeveloper） */
            const text = localizeDeveloper(developer, locale);
            return (
            /*
             * 入场动效和游戏卡片共用一套（`.card-in` + lib/card-stagger.ts 的错峰参数）——
             * 同一个站里两处列表的出场节奏不该不一样。
             */
            <li
              key={developer.id}
              className="card-in"
              style={{ animationDelay: `${cardDelayMs(index)}ms` }}
            >
              <Link
                href={localePath(locale, `/developers/${developer.id}`)}
                className="pixel-edge pxw-2 pxc-700 flex h-full flex-col items-center gap-2 bg-ink-900 p-4 text-center transition-colors hover:bg-ink-800"
              >
                {developer.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={developer.imageUrl}
                    /* 同一条链接里下面紧跟着名字，读屏靠链接名就够了（和游戏卡片同一个理由） */
                    alt=""
                    loading="lazy"
                    className="pixel-edge pxw-2 pxc-700 h-[72px] w-[72px] shrink-0 bg-ink-950 object-contain"
                  />
                ) : (
                  /* 没厂标的（迁移进来的老名字全都没图）用名字首字占位，不留一个灰洞 */
                  <span
                    aria-hidden="true"
                    className="pixel-edge pxw-2 pxc-700 flex h-[72px] w-[72px] shrink-0 items-center justify-center bg-ink-950 font-pixel text-[22px] text-ink-600"
                  >
                    {Array.from(text.name)[0] ?? '?'}
                  </span>
                )}

                <span className="w-full truncate text-[12px] text-ink-100">{text.name}</span>

                <span className="font-pixel text-[12px] text-accent">
                  {developer.gameCount}
                </span>

                {text.summary && (
                  <span className="line-clamp-2 text-[12px] leading-4 text-ink-500">
                    {text.summary}
                  </span>
                )}
              </Link>
            </li>
            );
          })}
        </ul>
      )}

      {pageCount > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-4">
          {page > 1 ? (
            <Link
              href={developersHref(locale, page - 1)}
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
              href={developersHref(locale, page + 1)}
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
    </GamesShell>
  );
}
