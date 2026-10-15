import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { CONSOLE_TYPES } from '@/components/CartridgeSprite';
import ConsoleCard from '@/components/ConsoleCard';
import GameHouseLogo from '@/components/GameHouseLogo';
import PixelHeroes from '@/components/PixelHeroes';
import { PlayersIcon } from '@/components/icons';
import TopBar from '@/components/TopBar';
import { cardDelayMs } from '@/lib/card-stagger';
import { SITE_NAME, localePath, translate, type MessageKey } from '@/lib/i18n';
import { listTopDevelopersCached, localizeDeveloper } from '@/lib/server/developers';
import { countGamesByConsoleCached } from '@/lib/server/games';
import { listConsolesCached } from '@/lib/server/consoles';
import { readLocaleParam } from '@/lib/server/locale';

/**
 * `/` —— 首页**落地页**（2026-10-13 加）。
 *
 * 参考 retrogamesnexus.com 那种「内容型首页」的骨架做的：Hero（标题 + 搜索 + 两个入口）
 * → 按机种浏览 → 按开发商浏览 → 折叠问答 → 页脚。
 *
 * **为什么要它**：2026-10-13 之前 `/` 就是那间像素小屋（现在挪到了 `/room`）。
 * 那间屋子整页只有 canvas 和 CSS 画的家具，**没有一个字是能索引的正文**
 * （只有 `seo.heading` 那三句 sr-only）—— 一个没有正文的站在搜索结果里等于不存在。
 * 拆开之后，`/` 负责「让人找到并看懂」，`/room` 负责「真的开玩」。
 *
 * ---------------------------------------------------------------------------
 * 几件刻意的事，别照着「常规首页」改回去：
 *
 * - **不导出 `generateMetadata`**。`/` 的标题 / 说明 / canonical 就是根布局那三样
 *   （`meta.title` / `meta.description` / `alternatesFor(locale, '/')`）—— 首页的
 *   `title.default` 只在页面自己不写标题时生效，正好是为它准备的。再写一份只是把
 *   同一句话写两遍，而且两份迟早会漂。
 *
 * - **数据全部走带缓存的那几个函数**（`listConsolesCached` / `countGamesByConsoleCached`
 *   / `listTopDevelopersCached`，TTL 都是 12 小时）：这一页是给爬虫和过路访客看的，
 *   内容变得很慢（只有后台上传游戏时才变），每次渲染打三趟 D1 不划算。
 *   副作用和后台上传游戏那条一样：新传的游戏最多晚 12 小时出现在首页
 *   （`/games` 那边 2026-10-14 起也是 12 小时，见 `HOME_REVALIDATE_SECONDS` 那段注释）。
 *
 * - ⚠️ **这里没有、也不该有 `export const revalidate`**：写它不会让这一页的 HTML 被缓存。
 *   根布局 `app/layout.tsx` 要读 cookie / 请求头决定语言（`readLocale()`），
 *   整个应用因此都走动态渲染，页面级 `revalidate` 对路由缓存不起作用。
 *   首页真正在用的 Next 缓存是**数据层**那三个 `unstable_cache`（见上一条），
 *   这也正是本项目一贯的做法：缓存留在「页-侧」，不要下沉到数据层。
 *
 * - **区块顺序是「广度优先」**：先按机种（四个，一眼看完），
 *   最后按开发商（八家）。参考站还有「类型 / 系列」两个维度，本站没有那两张表
 *   （系列只是 `games.series` 这一列自由文本），所以不做 —— 宁可少一个区块，
 *   也不要做一个点进去什么都没筛出来的入口。
 *
 * - **`?id=` / `?room=` 要透传到 `/room`**：详情页那颗「开始游戏」（`/room?id=<游戏>`）
 *   和联机分享出去的房间链接（`?room=<码>`）在 2026-10-13 之前都是挂在 `/` 上的，
 *   已经分享出去的地址不该因为这次拆分失效。见下面那段重定向。
 */
type SearchParams = Record<string, string | string[] | undefined>;

/** 「按开发商浏览」取 8：两行正好排满（sm 起一行 4 个）。 */
const DEVELOPER_COUNT = 8;
/** 「按机种浏览」最多几张卡：8 是这个网格的两整行（`grid-cols-2 sm:grid-cols-4`）。 */
const HOME_CONSOLE_COUNT = 8;

/**
 * 房间页那三个参数（`?id=` 深链、`?room=` 邀请码）—— 它们从前挂在 `/` 上。
 *
 * ⚠️ 顺序不重要（透传时按这里的顺序重排一遍），但**只认这三个**：别的参数
 * （比如广告投放带进来的 `utm_*`）跟着透传只会把 `/room` 的地址弄脏。
 */
const ROOM_PARAMS = ['id', 'room'] as const;

/**
 * 折叠问答。写成「键名的两两配对」而不是在 JSX 里拼字符串：
 * `t(\`home.faq.q${n}\`)` 拼出来的键在类型上是 `string`，得强转，而强转之后
 * 「文案表里少一条」这件事就没人拦了 —— 这里用 `satisfies` 让它在编译期就报错。
 */
const FAQS = [
  { q: 'home.faq.q1', a: 'home.faq.a1' },
  { q: 'home.faq.q2', a: 'home.faq.a2' },
  { q: 'home.faq.q3', a: 'home.faq.a3' },
  { q: 'home.faq.q4', a: 'home.faq.a4' },
  { q: 'home.faq.q5', a: 'home.faq.a5' },
  { q: 'home.faq.q6', a: 'home.faq.a6' },
] as const satisfies readonly { q: MessageKey; a: MessageKey }[];

/**
 * 首页每个区块的外壳：一条分隔线 + 标题 + 一行说明 + 右上角那个「看全部」。
 *
 * 抽出来是因为三个区块（机种 / 开发商 / 问答）的版式完全一样，
 * 各写一遍迟早会有块高度不一样。**问答那个不传 `href`**（它没有「全部」可去），
 * 所以链接是可选的。
 */
function Section({
  title,
  lead,
  href,
  linkLabel,
  children,
}: {
  title: string;
  lead?: string;
  href?: string;
  linkLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="home-section mt-12 sm:mt-16">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-[21px] font-semibold text-ink-100">{title}</h2>
        {href && linkLabel && (
          <Link
            href={href}
            className="text-[12px] text-ink-400 transition-colors hover:text-accent"
          >
            {linkLabel} →
          </Link>
        )}
      </div>
      {lead && <p className="mt-3 text-[13px] leading-6 text-ink-300">{lead}</p>}
      {children}
    </section>
  );
}

export default async function HomePage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [locale, params] = await Promise.all([readLocaleParam(routeParams), searchParams]);

  /*
   * 旧地址透传。**必须排在任何取数之前** —— 这一步是纯地址纠正，不该先白打三趟 D1
   * 再把人踢走。
   *
   * 用 `redirect()`（307，非永久）而不是 301：目标地址**依赖 query**（`?id=` 的值要跟着走），
   * 永久重定向会被浏览器和 CDN 缓存成「`/` 永远是 `/room`」，把首页自己弄没了。
   */
  const passthrough = new URLSearchParams();
  for (const key of ROOM_PARAMS) {
    const value = params[key];
    /* 重复参数（`?id=a&id=b`）不是字符串 —— 一律当没给，和列表页 `single()` 同一套规矩 */
    if (typeof value === 'string' && value.trim()) passthrough.set(key, value.trim());
  }
  if ([...passthrough.keys()].length > 0) {
    redirect(localePath(locale, `/room?${passthrough.toString()}`));
  }

  /*
   * 三份数据互不依赖，并行取。
   *
   * ⚠️ 不用 `cache()` 包一层（`/games` 那边包了）：那是为了让 `generateMetadata`
   * 与正文共用同一次查询，而**首页不写 metadata**（见文件头），一次请求只会走一次这里。
   */
  const [consoles, counts, developers] = await Promise.all([
    listConsolesCached(),
    countGamesByConsoleCached(),
    listTopDevelopersCached(DEVELOPER_COUNT),
  ]);

  /*
   * ⚠️ `{site}` 要在这里注入（和 I18nProvider 里那层 t 同一个口径）：文案表里的站名
   * 只写占位符（见 lib/i18n.ts 那条规矩），`translate()` 本身不认识 `{site}` ——
   * 不传就原样把「{site}」印在页面上（2026-10-13 用户报的就是这个）。
   */
  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(locale, key, { site: SITE_NAME[locale], ...vars });

  /*
   * 首页这块按游戏数从多到少取前 8 个。
   *
   * ⚠️ 不按「有没有游戏」过滤 —— 空机种也照列（2026-10-14 按 `count > 0` 滤过一次，
   *    结果只剩 4 张卡）。想看全部机种走「全部机种」→ `/consoles`。
   * ⚠️ 先摊成新数组再 `sort`：`CONSOLE_TYPES` 是 readonly，原地排会污染其它页面的顺序。
   */
  const homeConsoles = [...CONSOLE_TYPES]
    .sort((a, b) => counts[b] - counts[a])
    .slice(0, HOME_CONSOLE_COUNT);

  const chip =
    'pixel-edge pxw-2 pxc-700 flex h-full flex-col items-center justify-center gap-2 bg-ink-900 p-4 text-center transition-colors hover:bg-ink-800';

  return (
    <main className="home-page min-h-screen px-4 pb-8 pt-4 sm:px-8 sm:pt-6">
      <div className="mx-auto w-full max-w-5xl">
        {/*
          顶栏（2026-10-13 加）：语言切换 / 账号 / 游戏库，靠右。
          首页的 Hero 是居中的，所以它不跟 Hero 抢中间那条竖线 —— 单独占顶上一行。
          和 `/games` 那几个内容页共用同一个 `TopBar`（口径一致）。
        */}
        <div className="home-nav flex flex-wrap items-center justify-between gap-4 border-b border-ink-700/70 pb-5"><Link href={localePath(locale, "/")} className="flex items-center gap-3 text-[16px] font-semibold text-ink-100"><GameHouseLogo />{SITE_NAME[locale]}</Link><TopBar /></div>

        {/*
          Hero。居中的大字 + 一句说明 + 两个入口 + 搜索框 —— 参考站的骨架。
          最上面那行小标签**刻意全 ASCII**（`font-pixel` 没有汉字，写中文只会掉到
          系统字体上，和 `GamesShell` 的 `label` 同一条规矩）。
        */}
        <header className="home-hero"><div className="home-hero-intro">
          <span className="inline-flex border border-accent/25 bg-accent/10 px-3 py-2 font-pixel text-[9px] leading-5 tracking-wider text-accent">
            RETRO GAMES ONLINE
          </span>
          <h1 className="mt-5 max-w-2xl text-[28px] leading-[1.3] font-semibold tracking-tight text-ink-100 sm:text-[40px]">
            {t('home.hero.title')}
          </h1>
          <p className="mt-5 max-w-xl text-[14px] leading-7 text-ink-300">
            {t('home.hero.lead')}
          </p>

          {/*
            Hero 的两颗钮（2026-10-15 用户要求加第二颗）。

            左边进列表挑一盘（accent 实底 = 主按钮），右边进屋**加载自己的 ROM**
            （描边、悬停才点亮 = 次按钮）——「从库里挑」和「带自己的文件来」是两条路，
            摆在首屏一眼能分。

            ⚠️ 右边那颗落点是 **`/room` 而不是 `/play`**：拖拽 / 选本地文件那条路只在
               房间里（`/play` 是「一盘具体的游戏」的开局页，没有拖入，见 PlayScene 的注释）。
          */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href={localePath(locale, '/games')}
              className="inline-flex min-h-11 items-center justify-center bg-accent px-6 text-[13px] font-semibold text-ink-950 transition-colors hover:bg-accent/80"
            >
              {t('home.hero.browse')}
            </Link>
            <Link
              href={localePath(locale, '/room')}
              className="inline-flex min-h-11 items-center justify-center border border-ink-600 bg-ink-900 px-6 text-[13px] font-semibold text-ink-100 transition-colors hover:border-accent hover:bg-ink-800 hover:text-accent"
            >
              {t('home.hero.play')}
            </Link>
          </div>

          </div>

          {/*
            加入房间（2026-10-14 用户要求）：房间号 + 一颗钮 → `/play?room=<码>`。

            首屏右侧为联机入口，搜索区域放在下方铺满整行。

            **零 JS**：就是一个 GET 表单，提交后浏览器自己跳到 `/play?room=<码>`，
            和上面那个搜索框同一个套路（可分享、可被爬、无 JS 也能用）。
            `/play` 那边读到 `?room=` 只**预填 + 自动选「加入」**、不自动连
            （见 PlayScene 里那段注释），所以从这里提交不会「一进去就默默进错房」。

            ⚠️ `name="room"` 是**写死的**：那个参数名在 `lib/netplay.ts` 里叫
            `ROOM_QUERY_PARAM`，但那是个 `'use client'` 模块 —— 服务端组件 import 它
            拿到的是客户端引用而不是字符串，写进属性只会得到一坨垃圾。同理 `maxLength`
            对齐那边的 `CODE_LENGTH`（4）。改那边记得同步这一处。
            ⚠️ 大小写只靠 CSS 的 `uppercase` 显示，提交出去的值保持原样 —— 不用 JS 转，
            因为两边（PlayScene 读 `?room=`、netplay.join）本来就会再 normalize 一次。
          */}
          <form
            action={localePath(locale, '/play')}
            method="get"
            className="home-join w-full border border-ink-600 bg-ink-900 p-5 text-left sm:p-6"
          >
            <div className="mb-4 flex items-start gap-3">
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center border border-accent/25 bg-accent/10 text-accent">
                <PlayersIcon size={16} />
              </span>
              <div>
                <label htmlFor="home-room" className="block text-[13px] font-semibold text-ink-100">
                  {t('home.join.title')}
                </label>
                <p id="home-room-hint" className="mt-1 text-[12px] leading-5 text-ink-400">
                  {t('home.join.hint')}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="home-room"
              name="room"
              type="text"
              required
              maxLength={4}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-label={t('netplay.roomCode')}
              aria-describedby="home-room-hint"
              placeholder={t('netplay.codePlaceholder')}
              className="h-11 w-full min-w-0 border border-ink-600 bg-ink-950 px-4 text-center font-pixel text-[14px] tracking-[0.3em] text-ink-100 uppercase placeholder:text-ink-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 sm:flex-1"
            />
            <button
              type="submit"
              className="flex h-11 shrink-0 items-center justify-center gap-2 bg-accent px-5 text-[13px] font-semibold text-ink-950 transition-colors hover:bg-accent/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              {t('home.join.submit')}
              <span aria-hidden="true">→</span>
            </button>
            </div>
          </form>

          <div className="home-search-area">

          {/*
            搜索框上那排像素小人（2026-10-13 用户加的）：马里奥 / 林克 / 萨姆斯 /
            洛克人 / 隆 / 魂斗罗 / 吃豆人 / 幽灵 / 炸弹人 / 卡比，一排 16×16 手绘点阵。
            纯装饰（aria-hidden）、零 JS，名字只活在悬停的原生 title 里 —— 见组件头注释。
            ⚠️ 和搜索框贴得近是刻意留的（`PixelHeroes` 自己只压 mt-4，这里 form 的 mt-6
            也跟着收到 mt-4）—— 小人就是站在搜索框头顶上的。
          */}
          <PixelHeroes locale={locale} />

          {/*
            搜索框：和 `/games` 上那个**是同一个东西**（真正的 GET 表单，提交后浏览器
            自己跳到 `/games?q=…`），只是这里没有 `?q=` 可回填 —— 首页永远是干净的地址。
            零 JS，可分享，爬虫也走得通。

            ⚠️ **宽度铺满 100%**（2026-10-13 用户定），不再是原来的 `max-w-md` 居中窄条：
            这样它的左右边界和下面三个区块的网格**对齐**，Hero 收在一条直线上 ——
            居中窄条会在这一页中间切出一个只有它自己宽度的孤岛。
            宽度取的是外层 `max-w-5xl` 的 100%，窄屏下自然回落，不需要再设断点。
          */}
          <form
            action={localePath(locale, '/games')}
            method="get"
            role="search"
            className="mt-2 flex w-full flex-wrap items-center justify-center gap-2"
          >
            <label htmlFor="home-search" className="sr-only">
              {t('home.search.label')}
            </label>
            <input
              id="home-search"
              type="search"
              name="q"
              placeholder={t('home.search.placeholder')}
              autoComplete="off"
              className="h-12 min-w-0 flex-1 border border-ink-600 bg-ink-900 px-4 text-[14px] text-ink-100 placeholder:text-ink-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="submit"
              className="flex h-12 shrink-0 items-center border border-ink-600 bg-ink-800 px-6 text-[13px] font-semibold text-ink-100 transition-colors hover:border-accent hover:text-accent"
            >
              {t('home.search.submit')}
            </button>
          </form>
          </div>
        </header>

        {/*
          按机种浏览（2026-10-14 起每张卡片指向**机种专题页** `/consoles/<机种>`，
          右上角那条「全部机种」去 `/consoles` —— 机种有了自己的资料表和列表页，
          不再借用 `/games?console=` 那个筛选地址；列表页的机种筛选**留着没动**，
          `/games` 那边照常能用）。
          ⚠️ 张数现读（`countGamesByConsoleCached`）；列哪几个由上面 `homeConsoles` 定。
        */}
        <Section
          title={t('home.consoles.title')}
          lead={t('home.consoles.lead')}
          href={localePath(locale, '/consoles')}
          linkLabel={t('home.consoles.all')}
        >
          <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {homeConsoles.map((type, index) => (
              <li key={type} className="card-in" style={{ animationDelay: `${cardDelayMs(index)}ms` }}>
                <ConsoleCard type={type} row={consoles.find((row) => row.type === type) ?? null} count={counts[type]} locale={locale} />
              </li>
            ))}
          </ul>
        </Section>

        {/*
          按开发商浏览（按**游戏数**排序，见 lib/server/developers.ts 的 listTopDevelopers）。
          一家游戏都没有的开发商不会出现在这里 —— 一张写着 0 的卡片占位置却不指向内容。
        */}
        {developers.length > 0 && (
          <Section
            title={t('home.developers.title')}
            lead={t('home.developers.lead')}
            href={localePath(locale, '/developers')}
            linkLabel={t('home.developers.viewAll')}
          >
            <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {developers.map((developer, index) => {
                /* 名字按当前语言取一份（英文站空值回退中文，见 localizeDeveloper） */
                const text = localizeDeveloper(developer, locale);
                return (
                  <li
                    key={developer.id}
                    className="card-in"
                    style={{ animationDelay: `${cardDelayMs(index)}ms` }}
                  >
                    <Link href={localePath(locale, `/developers/${developer.id}`)} className={chip}>
                      {developer.imageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={developer.imageUrl}
                          /* 同一条链接里下面紧跟着名字，读屏靠链接名就够了（和游戏卡片同一个理由） */
                          alt=""
                          loading="lazy"
                          className="pixel-edge pxw-2 pxc-700 h-[56px] w-[56px] shrink-0 bg-ink-950 object-contain"
                        />
                      ) : (
                        /* 没厂标的用名字首字占位，不留一个灰洞（和 `/developers` 一致） */
                        <span
                          aria-hidden="true"
                          className="pixel-edge pxw-2 pxc-700 flex h-[56px] w-[56px] shrink-0 items-center justify-center bg-ink-950 font-pixel text-[18px] text-ink-600"
                        >
                          {Array.from(text.name)[0] ?? '?'}
                        </span>
                      )}
                      <span className="w-full truncate text-[12px] text-ink-100">{text.name}</span>
                      <span className="font-pixel text-[12px] text-accent">
                        {t('developersPage.gameCount', { count: developer.gameCount })}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {/*
          折叠问答。用原生 `<details>` / `<summary>`：可折叠、**零 JS**、无 JS 也读得全
          （爬虫看到的是完整的正文，折叠状态不影响它）。每条的答案只讲真的实现了的事，
          见 lib/i18n.ts 里那组文案的注释。
        */}
        <Section title={t('home.faq.title')}>
          <div className="mt-6 flex flex-col gap-3">
            {FAQS.map((item) => (
              <details
                key={item.q}
                className="home-faq border border-ink-700 bg-ink-900 px-5 py-4"
              >
                <summary className="cursor-pointer text-[13px] text-ink-100">
                  {t(item.q)}
                </summary>
                <p className="mt-3 text-[12px] leading-6 text-ink-400">{t(item.a)}</p>
              </details>
            ))}
          </div>
        </Section>

        {/*
          页脚。**对爬虫比对人有用**：内容页之间靠它互相发现（和 `GamesShell` 那个页脚
          同一套落点）。这里**不放「首页」** —— 首页自己就是。

          ⚠️ 2026-10-15：**原先打头的「回到房间」那条删了**（用户要求）。首屏 Hero 右侧
          已经有「加载本地 ROM」直达 `/room` —— 同一个落点不必在首屏出现两遍。
          同一天 `GamesShell` / `LegalPage` 两个页脚里那颗「回到房间」也一并删了（用户
          要求），所以现在全站只剩 404 页正文下那颗钮还在用 `gamesPage.backHome`。
        */}
        <footer className="mt-14 border-t border-ink-800 pt-6">
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
            <Link
              href={localePath(locale, '/games')}
              className="text-ink-400 transition-colors hover:text-accent"
            >
              {t('gamesPage.backToGames')}
            </Link>
            <Link
              href={localePath(locale, '/developers')}
              className="text-ink-400 transition-colors hover:text-accent"
            >
              {t('developersPage.backToDevelopers')}
            </Link>
            <Link
              href={localePath(locale, '/consoles')}
              className="text-ink-400 transition-colors hover:text-accent"
            >
              {t('consolesPage.backToConsoles')}
            </Link>
            <Link
              href={localePath(locale, '/privacy')}
              className="text-ink-400 transition-colors hover:text-accent"
            >
              {t('legal.privacy')}
            </Link>
            <Link
              href={localePath(locale, '/terms')}
              className="text-ink-400 transition-colors hover:text-accent"
            >
              {t('legal.terms')}
            </Link>
          </nav>
          <p className="mt-4 text-[12px] text-ink-600">{SITE_NAME[locale]}</p>
        </footer>
      </div>
    </main>
  );
}
