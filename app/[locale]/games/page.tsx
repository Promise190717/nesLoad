import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { CONSOLE_LABEL, CONSOLE_TYPES } from '@/components/CartridgeSprite';
import GamesShell from '@/components/GamesShell';
import GameCardGrid from '@/components/GameCardGrid';
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
import type { ConsoleType } from '@/lib/emulator';
import { parsePageParam } from '@/lib/pager';
import { listGamesPageCached } from '@/lib/server/games';
import { readLocaleParam } from '@/lib/server/locale';

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
 *
 * ---------------------------------------------------------------------------
 * 机种筛选（2026-10-13 加）：`?console=<nes|snes|gba|arcade>`
 *
 * 首页那个「按机种浏览」区块点进来的落点。做成**这一页的一个参数**、而不是四个
 * `/nes-games` 之类的独立路由：机种只有四个、版式完全一样，四个路由就是四份同样的
 * 代码（参考站那种 `/nes-games` 是它的路由约定，不是这里的）。
 *
 * ⚠️ **它和搜索的收录策略正好相反**：`?q=` 是 `noindex, follow`（无限多个组合），
 * 而 `?console=` **照常收录** —— 机种只有四个，每个都是一份真实分类，正是「用户搜
 * `nes games` 时该被搜到」的那类页面。所以 canonical 与 hreflang 都指**自己那一份**
 * （带 `?console=`），而不是指裸列表页。
 *
 * 认不出的 `?console=xxx` 与重复参数一律**当没给**（于是 307 收敛到不带该参数的地址）：
 * 否则 `?console=xxx` 会渲染出一整页「全部游戏」，同一份内容凭空多一个 URL。
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
 * 解析 `?console=`。**认不出的一律当没给**（返回 null）—— 调用方拿到 null 就渲染全部游戏，
 * 而 `parseQuery` 那一步会因为「参数给了、但没认出来」把这个地址 307 收敛掉。
 *
 * 白名单用 `CONSOLE_TYPES`（`components/CartridgeSprite.tsx`）而不是自己再列四个字符串：
 * 首页那个「按机种浏览」区块用的是同一份顺序，两处一份，加机种时不会只改到一边。
 */
function parseConsole(value: string | string[] | undefined): ConsoleType | null {
  const raw = single(value);
  return (CONSOLE_TYPES as readonly string[]).includes(raw) ? (raw as ConsoleType) : null;
}

/**
 * 这一页的**规范地址**。搜索、机种筛选、分页共用同一套拼法，保证「同一份列表只有一个 URL」。
 *
 * 顺序固定成 `q` → `console` → `page`；第 1 页不写 `page`、没有关键词不写 `q`、
 * 没筛机种不写 `console`。于是 `?page=2&console=nes&q=a` 会被 307 到
 * `?q=a&console=nes&page=2` —— 参数顺序不同也是两个 URL，得收敛成一个。
 *
 * ⚠️ **语言前缀在这里加**（`localePath`），调用方拿到的就是可以直接用的地址。
 * 2026-10-13 前它返回的是无前缀的 `/games?...`，直接塞给 `<Link>` /
 * `<form action>` / `redirect()`；现在那三处都会把中文用户送进英文列表页。
 */
function gamesHref(
  locale: Locale,
  page: number,
  keyword: string,
  consoleType: ConsoleType | null
): string {
  const params = new URLSearchParams();
  if (keyword) params.set('q', keyword);
  if (consoleType) params.set('console', consoleType);
  if (page > 1) params.set('page', String(page));

  const query = params.toString();
  return localePath(locale, query ? `/games?${query}` : '/games');
}

/** 从查询串里解析出「第几页、搜什么、筛哪个机种」，并判断这个地址本身是不是规范形式。 */
function parseQuery(raw: SearchParams): {
  page: number;
  keyword: string;
  consoleType: ConsoleType | null;
  canonical: boolean;
} {
  /*
   * 页码那部分（认不出的当第 1 页、`?page=01` 判为非规范）交给了 `lib/pager.ts` ——
   * 2026-10-12 加的开发商列表 / 详情页也要同一套规矩，两边各写一份迟早会漂。
   */
  const { page, canonical: pageCanonical } = parsePageParam(raw.page);

  const keywordGiven = raw.q !== undefined;
  const rawKeyword = single(raw.q);
  const keyword = clampKeyword(rawKeyword.trim());

  /*
   * 关键词的规范形式：没有关键词时 `q` **完全不出现** —— 是「没有这个参数」，不是 `?q=`。
   * 于是 `?q=`、`?q=%20%20`（只有空白）、`?q=a&q=b`、超长被截断的、以及前后带空格的，
   * 统统踢回规范地址。
   *
   * 判据写成「参数在不在」而不是「参数等于空串」：`single()` 对**重复参数**
   * （`?q=a&q=b`）也返回空串，用「在不在」才把它们一起收敛掉。
   */
  const keywordCanonical = keyword ? rawKeyword === keyword : !keywordGiven;

  /*
   * 机种同理，**但多一层「认不认得出来」**：`?console=xxx` 与 `?console=nes&console=snes`
   * 都会解析成 null（`parseConsole` 对重复参数拿到的是空串），于是这份地址被判为非规范
   * ⇒ 307 到去掉 `console` 的那一份。少了这一步，一个拼错的机种会静默渲染出一整页
   * 「全部游戏」—— 那正是重复内容。
   */
  const rawConsole = single(raw.console);
  const consoleType = parseConsole(raw.console);
  const consoleCanonical = consoleType ? rawConsole === consoleType : raw.console === undefined;

  return {
    page,
    keyword,
    consoleType,
    canonical: pageCanonical && keywordCanonical && consoleCanonical,
  };
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
 * ⚠️ 缓存键 = `['games:list', offset, limit, keyword, consoleType]`（`unstable_cache`
 * 自动把入参拼进键里）。所以**翻页 / 换关键词 / 换机种各是一份缓存**，不会串味；
 * 命中不了的键照常回源。关键词也进键意味着 `?q=xxx` 会被缓存 —— 那一份本来就被
 * `noindex` 挡在收录之外，键的基数由真实搜索词决定，且每条都有 30 分钟 TTL、
 * 超量时由 Next 自己的缓存 LRU 淘汰，不会无限膨胀。机种只有四个取值 + null，
 * 基数更是定死的。
 */
const loadPage = cache(async (page: number, keyword: string, consoleType: ConsoleType | null) => {
  const data = await listGamesPageCached(
    (page - 1) * PAGE_SIZE,
    PAGE_SIZE,
    keyword,
    consoleType
  );
  return { ...data, page, keyword, consoleType };
});

export async function generateMetadata({
  params: routeParams,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const [locale, params] = await Promise.all([readLocaleParam(routeParams), searchParams]);
  const { page, keyword, consoleType } = parseQuery(params);
  const { total } = await loadPage(page, keyword, consoleType);

  /*
   * 描述里的条数是**现读的**：写死会在增减游戏之后变成假话，
   * 而「共 N 款」恰恰是这一页最值钱的一句（用户搜「在线玩 NES 游戏」时想看到规模）。
   * 搜索页同理 —— 「『魂斗罗』共 N 个结果」比一句空话有用。机种页也是同一回事。
   *
   * 三种形态的优先级：**搜索 > 机种 > 全部**。关键词和机种同时在场时（用户先搜了词、
   * 又点了一颗机种）用搜索那份 —— 它已经把「搜的是什么」和条数都说清了。
   */
  const title = keyword
    ? translate(locale, 'seo.games.search.title', { keyword })
    : consoleType
      ? translate(locale, 'seo.games.console.title', { console: CONSOLE_LABEL[consoleType] })
      : translate(locale, 'seo.games.title');
  const description = keyword
    ? translate(locale, 'seo.games.search.description', {
        keyword,
        count: total
      })
    : consoleType
      ? translate(locale, 'seo.games.console.description', {
          console: CONSOLE_LABEL[consoleType],
          count: total
        })
      : translate(locale, 'seo.games.description', { count: total });
  // 第 2 页往后把页码写进标题，否则十几个页面标题一模一样
  const pageSuffix = page > 1 ? ` (${page})` : '';
  const canonical = gamesHref(locale, page, keyword, consoleType);

  return {
    title: `${title}${pageSuffix}`,
    description,
    /*
     * hreflang 只指「这一份列表的第一页」——分页与搜索参数不进（前者是同一份列表的不同页，
     * 后者是 `noindex` 的无限组合）。
     *
     * ⚠️ **但机种那份要带着 `?console=`**（2026-10-13 加）：机种页是可收录的真实分类，
     * 它的 hreflang 必须指向**另一种语言的同一个机种页**。指到裸列表页就成了
     * 「两份不同内容互相声明是同一页」，Google 会直接判这一组标注无效。
     */
    alternates: alternatesFor(locale, consoleType ? `/games?console=${consoleType}` : '/games'),
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: SITE_NAME[locale],
      title: `${title}${pageSuffix}`,
      description,
      locale: ogLocale(locale),
      alternateLocale: ogLocale(otherLocale(locale))
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
  params: routeParams,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [locale, params] = await Promise.all([readLocaleParam(routeParams), searchParams]);
  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  const { page, keyword, consoleType, canonical } = parseQuery(params);
  if (!canonical) redirect(gamesHref(locale, page, keyword, consoleType));

  const data = await loadPage(page, keyword, consoleType);
  const pageCount = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  /*
   * 越界（收藏了一个后来被删空的页码，或关键词 / 机种把结果筛到不够这么多页）退到最后一页。
   * `listGamesPage` 内部已经把 offset 夹回来了，这里只是把**地址栏**也纠正过来 ——
   * 否则 `?page=99` 会显示最后一页的内容，等于同一批游戏有两个 URL。
   * ⚠️ 退页时**必须把关键词和机种都带上**，否则会被踢回「全部游戏」。
   */
  if (page > pageCount) redirect(gamesHref(locale, pageCount, keyword, consoleType));

  const intro = keyword
    ? t('gamesPage.searchResults', { keyword, count: data.total })
    : consoleType
      ? t('gamesPage.introConsole', {
          console: CONSOLE_LABEL[consoleType],
          count: data.total
        })
      : t('gamesPage.intro', { count: data.total });

  return (
    <GamesShell
      locale={locale}
      label="GAME LIST"
      title={t('gamesPage.heading')}
      intro={intro}
      /*
       * 左上角：**浏览器回退**（2026-10-13 用户要求「返回上一页」），不再是一颗写死回
       * `/room` 的链接。这一页最常见的来路是房间右上角那颗「游戏列表」（**当前页跳转**，
       * 不是新标签，见 ConsoleScene），回退正好把人送回刚离开的那间屋子；而从首页 / 页脚 /
       * 别的内容页点进来的人，回的是**他来时的那个地址**（可能是 `/?q=…&page=3`），
       * 比一脚踹回房间更贴合「返回」两个字。
       *
       * 文案跟着行为走：`common.back`（「返回」）而不是 `gamesPage.backHome`（「回到房间」）
       * —— 后者承诺的是一个固定落点，而这里回的是来路。**同理别再改回 `link` 模式。**
       *
       * `href` 仍留着 `/room`：没有上一站时（直开 / 爬虫 / 中键新标签）`BackLink` 兜底跳它，
       * 中键与右键也仍旧是「到 `/room` 的普通链接」。这一页的「家」就是那间屋子，别改成 `/`。
       */
      back={{ href: localePath(locale, '/room'), label: 'common.back', mode: 'history' }}
      showAllGamesLink={false}
    >
      {/*
        搜索框。**真正的 GET 表单**，不是客户端 state —— 提交后浏览器自己跳到
        `/games?q=…`，于是搜索有真地址（可分享 / 可收藏 / 爬虫走得通），而且零 JS。
        用 `defaultValue`（非受控）而不是 `value`：这一页是服务端组件，
        输入框的内容由 **URL** 决定 —— 那才是一切的真相。
      */}
      <form
        /*
         * ⚠️ `action` 必须带语言前缀 —— 写死 `/games` 的话，中文用户在 `/zh/games`
         * 搜一下就被送到英文列表页（`method="get"` 会丢掉 query，所以这里是裸列表地址）。
         */
        action={localePath(locale, '/games')}
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
        {/*
          筛着机种搜的时候，把机种**跟着表单一起提交**（2026-10-13 加）：不然在「NES」
          里搜一下，提交后 `console` 就丢了，结果又变回全库。
          ⚠️ 它必须排在 `q` **后面**：GET 表单按 DOM 顺序拼查询串，而规范顺序是
          `q` → `console` → `page`（见 `gamesHref`）—— 排在前面白多一跳 307。
        */}
        {consoleType && <input type="hidden" name="console" value={consoleType} />}
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

          ⚠️ 落点用 `gamesHref(locale, 1, '', consoleType)` 而不是裸 `/games`：
          清掉的只是**关键词**，用户当前筛着的机种该留着（他在 NES 里搜了一轮，
          点「清除搜索」想看的是全部 NES，不是全库）。
        */}
        {keyword && (
          <Link
            href={gamesHref(locale, 1, '', consoleType)}
            className="text-[11px] text-ink-400 transition-colors hover:text-accent"
          >
            {t('gamesPage.searchClear')}
          </Link>
        )}
      </form>

      {/*
        机种筛选条（2026-10-13 加）。**一排链接**而不是 `<select>` 或按钮组：每个机种都是
        一个真地址（`/games?console=nes`），能中键新标签打开、能被复制、能被爬虫顺着走 ——
        和上面那个搜索表单、下面那对翻页同一个道理。

        当前那一颗用 accent 高亮并带 `aria-current`；「全部」那颗对应「没筛机种」。
        ⚠️ 切机种时**把关键词带上**（`gamesHref` 一起拼），否则搜完再点机种就掉回全库了 ——
        用户会以为搜索坏了。页码则一律回到第 1 页：换了筛选条件，第 3 页毫无意义。
      */}
      <nav
        aria-label={t('gamesPage.filterLabel')}
        className="mt-4 flex flex-wrap items-center gap-2"
      >
        {[null, ...CONSOLE_TYPES].map((type) => {
          const active = type === consoleType;
          return (
            <Link
              key={type ?? 'all'}
              href={gamesHref(locale, 1, keyword, type)}
              aria-current={active ? 'true' : undefined}
              className={`pixel-edge pxw-2 pxc-500 px-3 py-1.5 text-[11px] transition-colors ${
                active ? 'bg-accent text-ink-950' : 'bg-ink-800 text-ink-200 hover:text-accent'
              }`}
            >
              {type ? CONSOLE_LABEL[type] : t('gamesPage.filterAll')}
            </Link>
          );
        })}
      </nav>

      {data.games.length === 0 ? (
        /*
         * 三种「空」不是一回事：库里真没游戏 / 这个词什么都没搜到 / 这个机种一款都没有。
         * 后两种都要把条件原样写回去（从别人发的链接点进来的人，得知道自己在筛什么）。
         * **搜索优先**：同时有词和机种时，说「没搜到这个词」比说「这个机种没游戏」准确。
         */
        <p className="mt-8 text-[13px] text-ink-400">
          {keyword
            ? t('gamesPage.searchEmpty', { keyword })
            : consoleType
              ? t('gamesPage.consoleEmpty', { console: CONSOLE_LABEL[consoleType] })
              : t('gamesPage.empty')}
        </p>
      ) : (
        /*
         * 卡片网格（含入场动效）挪进了 `GameCardGrid` —— 开发商详情页里那段
         * 「他名下的游戏」用的是同一个组件，两处版式与节奏由它统一。
         */
        <GameCardGrid games={data.games} locale={locale} />
      )}

      {pageCount > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-4">
          {/*
            ⚠️ 翻页链接**必须带上关键词**（`gamesHref` 一起拼），否则搜完再翻页
            就掉回「全部游戏」了 —— 用户会以为搜索坏了。
          */}
          {page > 1 ? (
            <Link
              href={gamesHref(locale, page - 1, keyword)}
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
              href={gamesHref(locale, page + 1, keyword)}
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
