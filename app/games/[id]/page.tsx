import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { CONSOLE_LABEL } from '@/components/CartridgeSprite';
import GamesShell from '@/components/GamesShell';
import ShareGameButton from '@/components/ShareGameButton';
import { SITE_NAME, translate, type Locale, type MessageKey } from '@/lib/i18n';
import { getGame, type Game } from '@/lib/server/games';
import { readLocale } from '@/lib/server/locale';
import { resolveSiteOrigin } from '@/lib/site';

/**
 * `/games/[id]` —— 单款游戏的**资料页**（2026-10-12 用户要的「游戏详情页面」）。
 *
 * 三件事：
 *   ① 给搜索引擎一页**有正文**的 URL（标题、机种、年份、开发者、说明），
 *      而不是只看得见「一个跑游戏的房间」；
 *   ② 两个动作入口 —— 「开始游戏」带着 id 回首页（`/?id=<id>`，首页会自动取数据载入），
 *      「下载 ROM」进 `/games/<id>/download`；
 *   ③ 结构化数据（VideoGame + BreadcrumbList），让搜索结果能带上封面和面包屑。
 *
 * ⚠️ **`?id=` 是给首页用的，不是给这一页用的** —— 这一页的地址永远是 `/games/<id>`，
 * canonical 也只指自己。首页那边读到这个参数会自动开玩，两个地址各司其职。
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
 */
function metaDescription(locale: Locale, game: Game): string {
  const boilerplate = translate(locale, 'seo.game.description', {
    title: game.title,
    console: consoleLabel(game),
  });
  const own = game.description?.trim();
  return own ? `${clamp(own)} · ${boilerplate}` : boilerplate;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [locale, game] = await Promise.all([readLocale(), loadGame(id)]);

  /*
   * 游戏没了就 `notFound()` —— 由 `app/games/[id]/not-found.tsx` 渲染那个 404 页
   * （它同时盖住 `/games/<id>` 和 `/games/<id>/download` 两条路由）。
   * 在 metadata 里就抛掉，是为了让 404 的响应**连 meta 一起**是对的，
   * 而不是先吐一份「正常页面」的 head 再换 body。
   */
  if (!game) notFound();

  const title = translate(locale, 'seo.game.title', {
    title: game.title,
    console: consoleLabel(game),
  });
  const description = metaDescription(locale, game);

  return {
    title,
    description,
    alternates: { canonical: `/games/${id}` },
    openGraph: {
      type: 'website',
      url: `/games/${id}`,
      siteName: SITE_NAME[locale],
      title,
      description,
      /* 直接用 R2 上那张封面当分享图（绝对地址，本来就公网可读） */
      images: [{ url: game.imageUrl, alt: game.title }],
      locale: locale === 'zh' ? 'zh_CN' : 'en_US',
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
 */
function buildJsonLd(origin: string, locale: Locale, game: Game, t: Transl) {
  const url = `${origin}/games/${game.id}`;
  const language = locale === 'zh' ? 'zh-CN' : 'en';

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'VideoGame',
        '@id': `${url}#game`,
        name: game.title,
        url,
        description: metaDescription(locale, game),
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
        ...(game.developer
          ? { author: { '@type': 'Organization', name: game.developer } }
          : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: t('gamesPage.backHome'), item: origin },
          {
            '@type': 'ListItem',
            position: 2,
            name: t('gamesPage.backToGames'),
            item: `${origin}/games`,
          },
          { '@type': 'ListItem', position: 3, name: game.title, item: url },
        ],
      },
    ],
  };
}

export default async function GameDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [locale, game, origin] = await Promise.all([readLocale(), loadGame(id), resolveSiteOrigin()]);
  if (!game) notFound();

  const t: Transl = (key, vars) => translate(locale, key, vars);
  const jsonLd = buildJsonLd(origin, locale, game, t);

  /*
   * 资料那一行行。**空的不占位**（后台所有字段都是选填）——
   * 一排「系列：—」比少一行更难看，对爬虫也毫无信息。
   * 机种永远有（它是必填列），排在第一个。
   */
  const facts: { label: string; value: string }[] = [
    { label: t('gamesPage.field.console'), value: consoleLabel(game) },
    ...(game.year ? [{ label: t('gamesPage.field.year'), value: String(game.year) }] : []),
    ...(game.developer
      ? [{ label: t('gamesPage.field.developer'), value: game.developer }]
      : []),
    ...(game.series ? [{ label: t('gamesPage.field.series'), value: game.series }] : []),
    ...(game.language
      ? [{ label: t('gamesPage.field.language'), value: game.language.toUpperCase() }]
      : []),
  ];

  return (
    <GamesShell
      locale={locale}
      label="GAME"
      title={game.title}
      intro={facts
        .filter((fact) => fact.label !== t('gamesPage.field.console'))
        .map((fact) => fact.value)
        .join(' · ')}
      back={{ href: '/games', label: 'gamesPage.backToGames' }}
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
            alt={game.title}
            className="block aspect-[3/4] w-full object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          {/*
            三个动作。前两个**都是 `<Link>` 不是 `<button>`** —— 它们去的是两个真地址
            （`/?id=` 和 `/games/<id>/download`），用链接才能：新标签打开、被复制、
            被爬虫顺着走。按钮语义在这里是错的。
            第三颗「分享游戏」不一样：它不跳转，只是把**这一页的地址**写进剪贴板，
            所以是 `<button>`，而且必须是客户端组件（见 ShareGameButton）。
            复制的是 `origin` 现算的规范地址，不是 `window.location` —— 免得把
            `?id=` 之类的来源参数一起分享出去。
          */}
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/?id=${game.id}`}
              className="pixel-edge pxw-3 pxc-600 bg-accent px-5 py-2 text-[12px] text-ink-950 transition-colors hover:bg-accent/80"
            >
              {t('gamesPage.play')}
            </Link>
            <Link
              href={`/games/${game.id}/download`}
              className="pixel-edge pxw-2 pxc-500 bg-ink-800 px-4 py-2 text-[12px] text-ink-200 transition-colors hover:text-accent"
            >
              {t('gamesPage.download')}
            </Link>
            <ShareGameButton url={`${origin}/games/${game.id}`} />
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
            {game.description?.trim() ||
              t('gamesPage.fallbackDescription', {
                title: game.title,
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
