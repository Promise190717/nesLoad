import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import GamesShell from '@/components/GamesShell';
import { CONSOLE_LABEL } from '@/components/CartridgeSprite';
import { cardDelayMs } from '@/lib/card-stagger';
import { SITE_NAME, translate, type MessageKey } from '@/lib/i18n';
import { listGamesPageCached } from '@/lib/server/games';
import { readLocale } from '@/lib/server/locale';

/**
 * `/games` —— 公开的游戏列表页（2026-10-12 用户要的「游戏列表」）。
 *
 * **为什么做成真路由**：和 /privacy、/terms 同一个理由 —— 它要能被搜索引擎收录、
 * 能被直接分享。房间里的那个「游戏库」弹窗没有 URL，爬虫点不进去，整库的游戏
 * 就只有一堆谁也发现不了的封面。
 *
 * 这一页同时是**详情页的入口**：每条卡片的链接都是 `/games/<id>`，
 * 于是「列表 → 详情 → 下载」这条链对爬虫是完整的（另外 sitemap 里也会全列一遍，
 * 见 app/sitemap.ts）。
 *
 * 分页用**真的 URL**（`?page=2`）而不是「一次全列出来」：库会一直长，
 * 一页几百个封面既拖慢首屏又没人翻得到底。分页链接是普通的 `<Link>`，
 * 爬虫顺着「下一页」能走到最后一页。
 *
 * ⚠️ `?page=1` / `?page=0` / `?page=abc` 这类**非规范写法一律 307 到规范地址**：
 * 同一个列表被 `?page=1` 和 `/games` 两份 URL 收录，是标准的重复内容。
 * 越界（`?page=99`）也退到最后一页，理由同上。
 *
 * **不写 `export const dynamic`**：它要读 D1 和语言（cookie），本来就是动态渲染，
 * 再声明一次是多余的（和 app/privacy/page.tsx 同一个理由）。
 *
 * ---------------------------------------------------------------------------
 * 缓存（2026-10-12 加）
 *
 * 这一页**每次请求都要打两次 D1**（COUNT + SELECT），而它的内容变得很慢
 * （只有后台上传 / 编辑游戏时才变）。所以取数那一步套了 `unstable_cache`：
 * **30 分钟内同一批数据只查一次数据库**，之后由 Next 的缓存直接返回，
 * 页面照旧按请求动态渲染（语言还是跟着 cookie 走，不受缓存影响）。
 *
 * ⚠️ 缓存的作用范围**只是这一页的数据读取**，不在 `listGamesPage` 里 ——
 * 房间的在线库弹窗（`/api/games`）和后台列表（`/api/admin/games`）共用那个函数，
 * 它们必须立刻看到刚上传的游戏。细节与 TTL 常量见 lib/server/games.ts。
 *
 * ⚠️ 副作用：**后台新传 / 改过的游戏，最多要等 30 分钟才出现在这一页**（后台自己那张
 * 列表不受影响，它走 force-dynamic 的接口）。这是「不每次打数据库」必然的代价，
 * 想立刻生效就重启服务，或者把 TTL 调小（常量就一个）。
 *
 * ---------------------------------------------------------------------------
 * 搜索（2026-10-12 加）：`?q=<关键词>`
 *
 * 做成**服务端搜索**（关键词进 URL、跟着 D1 一起查）而不是像房间弹窗那样在客户端
 * 过滤一份已拉回来的列表 —— 因为这里一页只有 24 条，客户端过滤只能筛当页那几条，
 * 翻页就换一批结果，等于没搜。搜索本身走 `listGamesPage` 的 `keyword`，
 * 匹配 title / developer / series（**刻意不含 language / description**，理由见
 * lib/server/games.ts 的 SEARCH_CONDITION 注释）。
 *
 * 搜索框是一个**真正的 GET 表单**（`<form action="/games" method="get">`）：
 * 提交后浏览器自己跳到 `?q=…`，所以搜索有真地址 —— 能被分享、能被收藏、能被爬虫
 * 顺着走，**且完全不需要 JS**。`method="get"` 提交时天然丢掉原来的 `page`
 * ⇒ 换关键词必然回到第 1 页（这是对的：上一页的第 3 页对新关键词毫无意义）。
 *
 * ⚠️ **搜索结果页是 `noindex, follow`**（见 generateMetadata）。站内搜索会产出无限多的
 * `?q=…` 组合，而每一条都是「列表页的一个子集」—— 全收进去就是一堆重复内容，还会把
 * 真正的游戏详情页的权重稀释掉。`follow` **必须留着**：爬虫仍然要顺着结果卡片走到详情页。
 * 想让某个词能被搜到，正确的做法是给那个词做一个真实的内容页（详情页本来就能被搜到），
 * 而不是指望搜索结果的 URL 被收录。
 */
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * 每页条数。故意和房间那个弹窗（15）不一样：这里是**给人慢慢挑**的网格，一行 5 个正好 5 行。
 *
 * ⚠️ 别往上调到 100 以上 —— 服务端 `listGamesPage` 有个 `MAX_PAGE_SIZE = 100`，
 * 超过它会被静默压到 100，于是「下一页」永远翻不到头。
 */
const PAGE_SIZE = 15;

/**
 * 关键词长度上限（**按码点算**，不是按 UTF-16 长度）。
 *
 * 有上限的两个理由：① 一个几百字的 `q` 会让 D1 那个 `LIKE` 白扫一遍库；
 * ② URL 本身有长度上限，太长会被中间设备截断，反而变成一个谁也认不出的地址。
 * 超长的地址会被规范成**截断后**的那一份（于是触发一次 307）。
 */
const MAX_KEYWORD_LENGTH = 64;

/** 只认「一个字符串」。数组（`?q=a&q=b` 这种重复参数）一律当没给。 */
function single(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

/**
 * 按**码点**截断。直接 `slice` 会把 emoji / 生僻字劈成半个代理对，
 * 于是 URL 里出现一个 U+FFFD 替换字符，哈希与匹配都对不上。
 */
function clampKeyword(text: string): string {
  const points = Array.from(text);
  return points.length > MAX_KEYWORD_LENGTH
    ? points.slice(0, MAX_KEYWORD_LENGTH).join('')
    : text;
}

/**
 * 这一页的**规范地址**。搜索与分页共用同一套拼法，保证「同一份列表只有一个 URL」。
 *
 * 顺序固定成 `q` 在前、`page` 在后；第 1 页不写 `page`、没有关键词不写 `q`。
 * 于是 `?page=2&q=a` 会被 307 到 `?q=a&page=2` —— 参数顺序不同也是两个 URL，
 * 得收敛成一个。
 */
function gamesHref(page: number, keyword: string): string {
  const params = new URLSearchParams();
  if (keyword) params.set('q', keyword);
  if (page > 1) params.set('page', String(page));

  const query = params.toString();
  return query ? `/games?${query}` : '/games';
}

/** 从查询串里解析出「第几页、搜什么」，并判断这个地址本身是不是规范形式。 */
function parseQuery(raw: SearchParams): {
  page: number;
  keyword: string;
  canonical: boolean;
} {
  // 页码：认不出的（0 / 负数 / 字母 / 空）当第 1 页
  const pageGiven = raw.page !== undefined;
  const rawPage = single(raw.page).trim();
  const parsed = /^\d+$/.test(rawPage) ? Number.parseInt(rawPage, 10) : NaN;
  const page = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;

  const keywordGiven = raw.q !== undefined;
  const rawKeyword = single(raw.q);
  const keyword = clampKeyword(rawKeyword.trim());

  /*
   * 规范形式：第 1 页不带参数（就是 /games）；没有关键词时 `q` **完全不出现**
   * —— 是「没有这个参数」，不是 `?q=`。
   * 于是 `?page=1`、`?page=01`、`?q=`、`?q=%20%20`（只有空白）、`?q=a&q=b`、
   * 超长被截断的、以及前后带空格的，统统踢回规范地址。
   *
   * 判据写成「参数在不在」而不是「参数等于空串」：`single()` 对**重复参数**
   * （`?page=2&page=3` / `?q=a&q=b`）也返回空串，用「在不在」才把它们一起收敛掉。
   */
  const pageCanonical = page > 1 ? rawPage === String(page) : !pageGiven;
  const keywordCanonical = keyword ? rawKeyword === keyword : !keywordGiven;

  return { page, keyword, canonical: pageCanonical && keywordCanonical };
}

/**
 * 本页要的数据。
 *
 * **两层缓存，各管一件事**：
 *   ① 内层 `listGamesPageCached`（`unstable_cache`，跨请求，TTL 30 分钟）——
 *      请求根本没打到 D1。TTL 与理由见 lib/server/games.ts 那边。
 *   ② 外层 `cache()`（React，只在**同一次请求**内有效）—— 让 `generateMetadata`
 *      与页面正文共用同一次查询：两处都要 `total`（一个拼 description 里的条数，
 *      一个算总页数），少了它同一份 COUNT 会被打两遍。
 *
 * ⚠️ 缓存键 = `['games:list', offset, limit, keyword]`（`unstable_cache` 自动把入参
 * 拼进键里）。所以**翻页 / 换关键词各是一份缓存**，不会串味；命中不了的键照常回源。
 * 关键词也进键意味着 `?q=xxx` 会被缓存 —— 这一页本来就被 `noindex` 挡在收录之外，
 * 键的基数由真实搜索词决定，且每条都有 30 分钟 TTL、超量时由 Next 自己的缓存
 * LRU 淘汰，不会无限膨胀。
 */
const loadPage = cache(async (page: number, keyword: string) => {
  const data = await listGamesPageCached((page - 1) * PAGE_SIZE, PAGE_SIZE, keyword);
  return { ...data, page, keyword };
});

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const [locale, params] = await Promise.all([readLocale(), searchParams]);
  const { page, keyword } = parseQuery(params);
  const { total } = await loadPage(page, keyword);

  /*
   * 描述里的条数是**现读的**：写死会在增减游戏之后变成假话，
   * 而「共 N 款」恰恰是这一页最值钱的一句（用户搜「在线玩 NES 游戏」时想看到规模）。
   * 搜索页同理 —— 「『魂斗罗』共 N 个结果」比一句空话有用。
   */
  const title = keyword
    ? translate(locale, 'seo.games.search.title', { keyword })
    : translate(locale, 'seo.games.title');
  const description = keyword
    ? translate(locale, 'seo.games.search.description', {
        keyword,
        count: total
      })
    : translate(locale, 'seo.games.description', { count: total });
  // 第 2 页往后把页码写进标题，否则十几个页面标题一模一样
  const pageSuffix = page > 1 ? ` (${page})` : '';
  const canonical = gamesHref(page, keyword);

  return {
    title: `${title}${pageSuffix}`,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: SITE_NAME[locale],
      title: `${title}${pageSuffix}`,
      description,
      locale: locale === 'zh' ? 'zh_CN' : 'en_US'
    },
    /*
     * 只有搜索页 noindex，不带关键词的列表页照常收录（理由见文件顶部那段）。
     * 这里不是按 `keyword` 加条件字段而是整体 spread：`robots` 不写时由根布局
     * 那份 `index: true` 兜底，**别在这里显式写 `index: true`** —— 那是重复声明，
     * 将来根布局改了这边就成了唯一没跟上的地方。
     */
    ...(keyword ? { robots: { index: false, follow: true } } : {})
  };
}

export default async function GamesPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [locale, params] = await Promise.all([readLocale(), searchParams]);
  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  const { page, keyword, canonical } = parseQuery(params);
  if (!canonical) redirect(gamesHref(page, keyword));

  const data = await loadPage(page, keyword);
  const pageCount = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  /*
   * 越界（收藏了一个后来被删空的页码，或关键词把结果筛到不够这么多页）退到最后一页。
   * `listGamesPage` 内部已经把 offset 夹回来了，这里只是把**地址栏**也纠正过来 ——
   * 否则 `?page=99` 会显示最后一页的内容，等于同一批游戏有两个 URL。
   * ⚠️ 退页时**必须把关键词带上**，否则会被踢回「全部游戏」。
   */
  if (page > pageCount) redirect(gamesHref(pageCount, keyword));

  const intro = keyword
    ? t('gamesPage.searchResults', { keyword, count: data.total })
    : t('gamesPage.intro', { count: data.total });

  return (
    <GamesShell
      locale={locale}
      label="GAME LIST"
      title={t('gamesPage.heading')}
      intro={intro}
      back={{ href: '/', label: 'gamesPage.backHome' }}
      showAllGamesLink={false}
    >
      {/*
        搜索框。**真正的 GET 表单**，不是客户端 state —— 提交后浏览器自己跳到
        `/games?q=…`，于是搜索有真地址（可分享 / 可收藏 / 爬虫走得通），而且零 JS。
        用 `defaultValue`（非受控）而不是 `value`：这一页是服务端组件，
        输入框的内容由 **URL** 决定 —— 那才是一切的真相。
      */}
      <form
        action="/games"
        method="get"
        role="search"
        className="mt-8 flex flex-wrap items-center gap-2"
      >
        <label htmlFor="games-search" className="sr-only">
          {t('gamesPage.searchLabel')}
        </label>
        <input
          id="games-search"
          type="search"
          name="q"
          defaultValue={keyword}
          placeholder={t('gamesPage.searchPlaceholder')}
          autoComplete="off"
          className="pixel-edge pxw-2 pxc-500 h-[34px] min-w-[180px] flex-1 bg-ink-900 px-3 text-[12px] text-ink-100 placeholder:text-ink-600 focus:outline-none"
        />
        <button
          type="submit"
          className="pixel-edge pxw-2 pxc-500 flex h-[34px] shrink-0 items-center bg-ink-700 px-4 text-[11px] text-ink-200 transition-colors hover:text-accent"
        >
          {t('gamesPage.searchSubmit')}
        </button>
        {/*
          「清除」是一条**链接**而不是清空按钮：没有关键词时它压根不画（指向 /games
          的死链比少一个链接更糟，和下面那个「上一页」同一个道理），
          而且它就该是一个能直接点走的地址 —— 无 JS 也成立。
        */}
        {keyword && (
          <Link
            href="/games"
            className="text-[11px] text-ink-400 transition-colors hover:text-accent"
          >
            {t('gamesPage.searchClear')}
          </Link>
        )}
      </form>

      {data.games.length === 0 ? (
        /*
         * 两种「空」不是一回事：库里真没游戏 vs. 这个词什么都没搜到。
         * 后者要把搜的词原样写回去（从别人发的链接点进来的人，得知道在搜什么）。
         */
        <p className="mt-8 text-[13px] text-ink-400">
          {keyword
            ? t('gamesPage.searchEmpty', { keyword })
            : t('gamesPage.empty')}
        </p>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {data.games.map((game, index) => {
            /*
             * 卡片下面那行：年份 · 开发者 · 机种。和房间那个弹窗里的写法不同 ——
             * 这里把机种放在**文字里**而不是封面角标上：角标是给「已经知道自己在看什么」
             * 的人认的，而这一页的读者很多是从搜索进来的，需要文字告诉他这是什么机种。
             */
            const meta = [
              game.year,
              game.developer,
              CONSOLE_LABEL[game.consoleType]
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              /*
               * 入场动效：`.card-in` 负责「一张卡片长什么样」（从下面 10px 浮上来 + 淡入），
               * 错峰延迟按序号算好写进内联 `animation-delay`（参数在 lib/card-stagger.ts，
               * 和房间那个游戏库弹窗共用同一套节奏）。
               *
               * 这一页是**服务端组件**，但动效一点不费事：延迟只是个内联 style，
               * 服务端算好渲染进 HTML 就行，**不需要为它加客户端组件**。
               *
               * **不用给 <ul> 做「换一批就重播」的机关**：翻页 / 搜索之后装的是另一批 id，
               * `key` 全变 ⇒ React 换掉整个 <li>，新元素上的 CSS 动画自然重播；
               * 同一张卡片还在原位时就不该再动。
               *
               * ⚠️ 爬虫拿到的是**同样的 HTML**（动画纯 CSS，不影响正文与链接），
               * 所以这一层可以放心加。
               */
              <li
                key={game.id}
                className="card-in"
                style={{ animationDelay: `${cardDelayMs(index)}ms` }}
              >
                <Link
                  href={`/games/${game.id}`}
                  className="pixel-edge pxw-2 pxc-700 block h-full bg-ink-900 transition-colors hover:bg-ink-800"
                >
                  <span className="relative block aspect-[3/4] w-full overflow-hidden bg-ink-950">
                    {/* R2 公网域名，不走 next/image（那需要在 next.config 里登记 remotePatterns） */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={game.imageUrl}
                      /*
                       * `alt=""` 是**刻意**的：这张图在同一个链接里，紧挨着下面那行标题文字，
                       * 而链接名对读屏就是「标题」。再给图配一次标题 = 同一句话念两遍。
                       * 详情页那张大封面不一样，那里它是页面的主图、不在链接里，配了 alt。
                       */
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </span>
                  <span className="mt-2 block">
                    <span className="block truncate text-[12px] text-ink-100">
                      {game.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-ink-500">
                      {meta}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pageCount > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-4">
          {/*
            ⚠️ 翻页链接**必须带上关键词**（`gamesHref` 一起拼），否则搜完再翻页
            就掉回「全部游戏」了 —— 用户会以为搜索坏了。
          */}
          {page > 1 ? (
            <Link
              href={gamesHref(page - 1, keyword)}
              rel="prev"
              className="pixel-edge pxw-2 pxc-500 bg-ink-800 px-3 py-1.5 text-[11px] text-ink-200 transition-colors hover:text-accent"
            >
              {t('gamesPage.prev')}
            </Link>
          ) : (
            // 首页那个「上一页」不渲染成灰按钮而是**整块不画**：爬虫顺着链接走，
            // 一个指向自己的死链比少一个链接更糟
            <span className="px-3 py-1.5 text-[11px] text-ink-700">
              {t('gamesPage.prev')}
            </span>
          )}

          {/* 纯数字，和别处一样不进文案表（见 README「多语言」那条） */}
          <span className="font-pixel text-[10px] text-ink-500">
            {page} / {pageCount}
          </span>

          {page < pageCount ? (
            <Link
              href={gamesHref(page + 1, keyword)}
              rel="next"
              className="pixel-edge pxw-2 pxc-500 bg-ink-800 px-3 py-1.5 text-[11px] text-ink-200 transition-colors hover:text-accent"
            >
              {t('gamesPage.next')}
            </Link>
          ) : (
            <span className="px-3 py-1.5 text-[11px] text-ink-700">
              {t('gamesPage.next')}
            </span>
          )}
        </nav>
      )}
    </GamesShell>
  );
}
