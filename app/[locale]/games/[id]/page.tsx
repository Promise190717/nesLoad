import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache, type ReactNode } from 'react';
import { CONSOLE_LABEL } from '@/components/CartridgeSprite';
import FavoriteButton from '@/components/FavoriteButton';
import GamesShell from '@/components/GamesShell';
import ShareGameButton from '@/components/ShareGameButton';
import {
  SITE_NAME,
  alternatesFor,
  htmlLang,
  localePath,
  ogLocale,
  otherLocale,
  translate,
  type Locale,
  type MessageKey,
} from '@/lib/i18n';
import { getGame, localizeGame, type Game, type LocalizedGameText } from '@/lib/server/games';
import { readLocaleParam } from '@/lib/server/locale';
import { resolveSiteOrigin } from '@/lib/site';

/**
 * `/games/[id]` —— 单款游戏的**资料页**（2026-10-12 用户要的「游戏详情页面」）。
 *
 * 三件事：
 *   ① 给搜索引擎一页**有正文**的 URL（标题、机种、年份、开发者、说明），
 *      而不是只看得见「一个跑游戏的房间」；
 *   ② 三个动作入口 —— 「开始游戏」带着 id 回房间（`/room?id=<id>`，房间会自动取数据载入），
 *      「收藏」就地收 / 取（`FavoriteButton`，客户端组件），「下载 ROM」进
 *      `/games/<id>/download`（另加一颗「分享游戏」）；
 *   ③ 结构化数据（VideoGame + BreadcrumbList），让搜索结果能带上封面和面包屑。
 *
 * ⚠️ **`?id=` 是给房间页（`/room`）用的，不是给这一页用的** —— 这一页的地址永远是
 * `/games/<id>`，canonical 也只指自己。房间那边读到这个参数会自动开玩，两个地址各司其职。
 *
 * ⚠️ 2026-10-13 之前那颗钮指向 `/?id=`（那时 `/` 就是那间屋子）。拆首页之后落点是
 * `/room?id=` —— 而**首页也认这两个参数**（`?id=` / `?room=` 一律 307 透传到 `/room`），
 * 所以老链接照样能用。见 `app/[locale]/page.tsx` 里那段重定向。
 *
 * **不用 `generateStaticParams` 预渲染**：游戏是后台上传的、库随时在变，构建期
 * 并不知道有哪些 id；而且语言要先读 cookie。所以这条路由是**按需动态渲染**的
 * （本来也不会被静态化：读 cookie + 读 D1）。
 */
const loadGame = cache(async (id: string) => getGame(id));

/**
 * 说明文字的长度上限。
 *
 * meta description 超过约 155 个字符就会被 Google 截断，而「说明」是后台自由填的
 * （可能是一整段）。所以拼进 meta 之前先砍一刀 —— 砍在**页面上不砍**：
 * 页面正文该显示多少显示多少，被截断的只是给爬虫那一份。
 */
const DESC_LIMIT = 100;

/** 把 `translate` 收成「已经定好语言」的那个函数，省得每个调用点都带一遍 locale。 */
type Transl = (key: MessageKey, vars?: Record<string, string | number>) => string;

function clamp(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > DESC_LIMIT ? `${trimmed.slice(0, DESC_LIMIT)}…` : trimmed;
}

/** 机种标签（NES / SFC / ARC）—— 丝印那三个英文词，不进文案表，见 README「多语言」那条。 */
function consoleLabel(game: Game): string {
  return CONSOLE_LABEL[game.consoleType];
}

/**
 * 拼这一页的 meta description。
 *
 * 后台填了「说明」就用它打头（那是这一款最独特的一句话，对「搜具体游戏名」最有用），
 * 后面接一句通用的「能玩、能下载」；没填就只用通用那句 ——
 * **不留空、也不编造**（编造剧情 / 发行商那类信息是 SEO 作弊）。
 *
 * ⚠️ 2026-10-13 起收 `LocalizedGameText`（已按语言选好的那一份）而不是整个 `Game` ——
 *    搜索结果的标题 / 描述必须跟页面语言一致，英文站不能吐中文。
 */
function metaDescription(locale: Locale, game: Game, text: LocalizedGameText): string {
  const boilerplate = translate(locale, 'seo.game.description', {
    title: text.title,
    console: consoleLabel(game),
  });
  const own = text.description?.trim();
  return own ? `${clamp(own)} · ${boilerplate}` : boilerplate;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [locale, game] = await Promise.all([readLocaleParam(params), loadGame(id)]);

  /*
   * 游戏没了就 `notFound()` —— 由 `app/games/[id]/not-found.tsx` 渲染那个 404 页
   * （它同时盖住 `/games/<id>` 和 `/games/<id>/download` 两条路由）。
   * 在 metadata 里就抛掉，是为了让 404 的响应**连 meta 一起**是对的，
   * 而不是先吐一份「正常页面」的 head 再换 body。
   */
  if (!game) notFound();

  const text = localizeGame(game, locale);
  const title = translate(locale, 'seo.game.title', {
    title: text.title,
    console: consoleLabel(game),
  });
  const description = metaDescription(locale, game, text);

  return {
    title,
    description,
    alternates: alternatesFor(locale, `/games/${id}`),
    openGraph: {
      type: 'website',
      url: localePath(locale, `/games/${id}`),
      siteName: SITE_NAME[locale],
      title,
      description,
      /* 直接用 R2 上那张封面当分享图（绝对地址，本来就公网可读） */
      images: [{ url: game.imageUrl, alt: text.title }],
      locale: ogLocale(locale),
      alternateLocale: ogLocale(otherLocale(locale)),
    },
  };
}

/**
 * 结构化数据：这款游戏本身 + 一条面包屑。
 *
 * 为什么值得写：`VideoGame` 让搜索引擎知道这是一个**具体的游戏条目**（而不是一篇文章），
 * 能带上封面、平台、免费与否；`BreadcrumbList` 则让结果里出现
 * 「房间 › 全部游戏 › 超级马里奥兄弟」那条路径。
 *
 * 只写**库里真实存在**的字段：没有年份就不写 `datePublished`，没有开发者就不写 `author`。
 * 结构化数据与页面内容不一致（写了页面上没有的年份）是会被判作弊的。
 *
 * 序列化后把 `<` 换成 `\u003c` —— 内联 `<script>` 里出现 `</script>` 就能提前闭合标签。
 * 这里的 game.title / developer 是**后台可控**的字符串，比 layout 那份更需要这一行。
 *
 * ⚠️ 结构化数据的名字 / 描述 / 作者**一律用当前语言那一份**（`LocalizedGameText`）——
 *    和页面上显示的内容必须一致（不一致是会被判作弊的）。
 */
function buildJsonLd(
  origin: string,
  locale: Locale,
  game: Game,
  text: LocalizedGameText,
  t: Transl
) {
  /* URL 也按语言分路径 —— 结构化数据里的地址必须跟 canonical 一致，否则等于自己指错了 */
  const url = `${origin}${localePath(locale, `/games/${game.id}`)}`;
  const language = htmlLang(locale);

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'VideoGame',
        '@id': `${url}#game`,
        name: text.title,
        url,
        description: metaDescription(locale, game, text),
        image: game.imageUrl,
        gamePlatform: consoleLabel(game),
        applicationCategory: 'Game',
        operatingSystem: 'Any (runs in a web browser)',
        isAccessibleForFree: true,
        inLanguage: language,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        /* 站级那两个节点的 id 在根布局里，这里指回去 —— 三页共用一个「站」实体 */
        publisher: { '@id': `${origin}/#website` },
        ...(game.year ? { datePublished: String(game.year) } : {}),
        ...(text.developer
          ? {
              author: {
                '@type': 'Organization',
                name: text.developer,
                /* 接上了开发商库就指过去 —— 让搜索引擎把「这家公司」串成同一个实体 */
                ...(game.developerId
                  ? { url: `${origin}${localePath(locale, `/developers/${game.developerId}`)}` }
                  : {}),
              },
            }
          : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            /*
             * 面包屑第一项是**首页**（`/`），不是那间屋子 —— 2026-10-13 拆开之后
             * `/` 是落地页、屋子在 `/room`，而面包屑讲的是「这一页在站里的位置」，
             * 所以用 `common.home` 那颗（名字与落点都得是首页）。
             */
            name: t('common.home'),
            item: `${origin}${localePath(locale, '/')}`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: t('gamesPage.backToGames'),
            item: `${origin}${localePath(locale, '/games')}`,
          },
          { '@type': 'ListItem', position: 3, name: text.title, item: url },
        ],
      },
    ],
  };
}

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const [locale, game, origin] = await Promise.all([
    readLocaleParam(params),
    loadGame(id),
    resolveSiteOrigin(),
  ]);
  if (!game) notFound();

  const t: Transl = (key, vars) => translate(locale, key, vars);

  /*
   * 按语言选定文案（中英各一份都从库里取出来了，这里挑一份）。
   * 文件里**所有**要显示的文案都从 `text` 读，别再直接用 `game.title` 那种 —— 那会绕过语言。
   */
  const text = localizeGame(game, locale);
  const jsonLd = buildJsonLd(origin, locale, game, text, t);

  /*
   * 资料那一行行。**空的不占位**（后台所有字段都是选填）——
   * 一排「系列：—」比少一行更难看，对爬虫也毫无信息。
   * 机种永远有（它是必填列），排在第一个。
   *
   * ⚠️ 值故意收成 `ReactNode` 而不是 `string`：**开发商那一行现在是个链接**
   * （2026-10-12 用户要的「点厂商看他名下的游戏」的入口就在这儿，见下面）。
   * 所以标题下面那句摘要不能再从 `facts` 里拼 —— 见 `introLine`。
   */
  const facts: { label: string; value: ReactNode }[] = [
    { label: t('gamesPage.field.console'), value: consoleLabel(game) },
    ...(game.year ? [{ label: t('gamesPage.field.year'), value: String(game.year) }] : []),
    ...(text.developer
      ? [
          {
            label: t('gamesPage.field.developer'),
            /*
             * 接上了开发商库（`developerId` 非空）才是链接；没接上的老记录
             * 保持纯文字 —— 那时候没有页面可去，画一个点不动的链接更糟。
             */
            value: game.developerId ? (
              <Link
                href={localePath(locale, `/developers/${game.developerId}`)}
                className="text-accent transition-colors hover:underline"
              >
                {text.developer}
              </Link>
            ) : (
              text.developer
            ),
          },
        ]
      : []),
    ...(text.series ? [{ label: t('gamesPage.field.series'), value: text.series }] : []),
    ...(game.language
      ? [{ label: t('gamesPage.field.language'), value: game.language.toUpperCase() }]
      : []),
  ];

  /*
   * 标题下那句摘要（机种之外那几个值用「 · 」串起来）。
   * 它要的是**纯文本** —— 不能拿上面那份 `facts` 去 join（值里有 `<Link>`，
   * join 出来会是 `[object Object]`），所以另拼一份。
   */
  const introLine = [game.year ? String(game.year) : null, text.developer, text.series, game.language ? game.language.toUpperCase() : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <GamesShell
      locale={locale}
      label="GAME"
      title={text.title}
      intro={introLine}
      back={{ href: localePath(locale, '/games'), label: 'common.back', mode: 'history' }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <div className="mt-8 flex flex-col gap-8 sm:flex-row sm:items-start">
        {/* 封面。这是页面的主图、又不在链接里，所以给 alt（和列表页那些刻意留空的不一样） */}
        <div className="pixel-edge pxw-2 pxc-700 w-[180px] shrink-0 bg-ink-900 sm:w-[220px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={game.imageUrl}
            alt={text.title}
            className="block aspect-[3/4] w-full object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          {/*
            四个动作。前两个**都是 `<Link>` 不是 `<button>`** —— 它们去的是两个真地址
            （`/room?id=` 和 `/games/<id>/download`），用链接才能：新标签打开、被复制、
            被爬虫顺着走。按钮语义在这里是错的。
            「分享游戏」不一样：它不跳转，只是把**这一页的地址**写进剪贴板，
            所以是 `<button>`，而且必须是客户端组件（见 ShareGameButton）。
            复制的是 `origin` 现算的规范地址，不是 `window.location` —— 免得把
            `?id=` 之类的来源参数一起分享出去。

            2026-10-13 用户要的「收藏」也在这排里，**紧跟在「开始游戏」后面**（他原话
            「开始游戏旁边」）。这两颗是这一页最主要的两个动作 —— 玩，或者先存起来，
            所以挨着放；「下载 ROM」往后挪一位。`FavoriteButton` 同样是客户端组件
            （要读登录态 + 打接口）。
          */}
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={localePath(locale, `/room?id=${game.id}`)}
              className="pixel-edge pxw-3 pxc-600 bg-accent px-5 py-2 text-[12px] text-ink-950 transition-colors hover:bg-accent/80"
            >
              {t('gamesPage.play')}
            </Link>
            <FavoriteButton gameId={game.id} />
            <Link
              href={localePath(locale, `/games/${game.id}/download`)}
              className="pixel-edge pxw-2 pxc-500 bg-ink-800 px-4 py-2 text-[12px] text-ink-200 transition-colors hover:text-accent"
            >
              {t('gamesPage.download')}
            </Link>
            <ShareGameButton url={`${origin}${localePath(locale, `/games/${game.id}`)}`} />
          </div>

          {/*
            正文。就一段：「这一款是什么」—— 后台填的说明，没填就退一句
            「《X》是一款 NES 游戏」（只用库里真实的字段，不编）。
            ⚠️ 原先紧跟其后还有一段固定的「它跑在浏览器里…也可以下载 ROM」，
            2026-10-12 用户要求**删掉**（`gamesPage.playHint` 一起删了）。
            别再当「漏掉的细节」加回来 —— 页面上那两颗按钮（开始游戏 / 下载 ROM）
            已经把这两条信息表达清楚了。
          */}
          <p className="mt-6 text-[13px] leading-7 text-ink-300">
            {text.description?.trim() ||
              t('gamesPage.fallbackDescription', {
                title: text.title,
                console: consoleLabel(game),
              })}
          </p>

          {/* 资料表。`dl` 而不是一排 `<span>`：这一页的语义就是「字段名 : 值」 */}
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
    </GamesShell>
  );
}
