import { cached } from '@/lib/server/cache';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache, type ReactNode } from 'react';
import { consoleLabel } from '@/lib/consoles';
import FavoriteButton from '@/components/FavoriteButton';
import GameComments from '@/components/GameComments';
import GamesShell from '@/components/GamesShell';
import { PlayersIcon } from '@/components/icons';
import ReportGameButton from '@/components/ReportGameButton';
import ShareGameButton from '@/components/ShareGameButton';
import {
  SITE_NAME,
  alternatesFor,
  htmlLang,
  localePath,
  ogLocale,
  otherLocales,
  translate,
  type Locale,
  type MessageKey,
} from '@/lib/i18n';
import { gameLanguageLabel } from '@/lib/rom-lang';
import { getGameCached, localizeGame, type Game, type LocalizedGameText } from '@/lib/server/games';
import { readLocaleParam } from '@/lib/server/locale';
import { countGameFavorites } from '@/lib/server/user-data';
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
 * 常用游戏构建期预生成，剩余详情按需生成；公共 HTML 缓存 24 小时。
 */
const loadGame = cache(async (id: string) => getGameCached(id));

/**
 * 当前浏览者是谁（没登录就是 null）。
 *
 * 只有一件事要用它：**评论模块**（登录了才画输入框，未登录画「去登录」那颗链接）。
 *
 * ⚠️ 只验签名、**不查库** —— 和登录页 / 账号页同一个取舍（见 `app/[locale]/login/page.tsx`
 *    里那段）：把一次 D1 查询拖进详情页的首屏渲染路径不值当，封禁那道闸在真正写数据的
 *    那条接口上（`POST /api/games/<id>/comments` 的 `assertUser`）。所以这里给出的是
 *    「有没有一张签名有效的票」，**不是**「这个人现在能不能说话」。
 *
 * 用 `cache()` 包一层（同 `loadGame`）：一次渲染里它只会被读一遍。
 */


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
    console: consoleLabel(game.consoleType, locale),
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
    console: consoleLabel(game.consoleType, locale),
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
      alternateLocale: otherLocales(locale).map(ogLocale),
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
 * 这里的 `text.title` / `text.developer` 是**后台可控**的字符串，比 layout 那份更需要这一行。
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
        gamePlatform: consoleLabel(game.consoleType, locale),
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
  /*
   * 这几件事**并行取**（串行就是白等一个来回）：
   *   · 游戏资料 / 语言 / 站点域名 —— 页面本身；
   *   · `countGameFavorites` —— 收藏钮上那个数字的**初值**（之后前端乐观更新，
   *     见 FavoriteButton）；
   *   · `readViewer` —— 评论模块要的登录态（**不查库**，见上面那个函数的注释）。
   * 代价是 404 时那几句查询白跑一次 —— 404 是少数，不值得为它让每个正常页面多等一程。
   */
  const [locale, game, origin, favoriteCount] = await Promise.all([
    readLocaleParam(params),
    loadGame(id),
    resolveSiteOrigin(),
    countFavorites(id),
  ]);
  if (!game) notFound();

  const t: Transl = (key, vars) => translate(locale, key, vars);

  /*
   * 未登录时评论模块里那颗「去登录」的落点。
   *
   * `?next=` 里放的是**不带语言前缀**的站内路径（`/games/<id>`）—— 拼前缀是登录页
   * 自己的事（见 `components/LoginPanel.tsx`），在这儿先拼上 `/zh` 会拼出 `/zh/zh/...`。
   * 合法性由登录页的 `parseNext` 白名单把关（只收站内绝对路径）。
   */
  const signInHref = `${localePath(locale, '/login')}?next=${encodeURIComponent(`/games/${game.id}`)}`;

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
    { label: t('gamesPage.field.console'), value: consoleLabel(game.consoleType, locale) },
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
    /*
     * 「语言」那一行走**全称**（`简体中文` / `English` / `日本語` / `한국어`），
     * 和列表卡片上的角标共用同一份文案 —— 2026-10-15 之前这里显示的是 `ZH` / `EN` 短码。
     */
    ...(game.language
      ? [
          {
            label: t('gamesPage.field.language'),
            value: gameLanguageLabel(game.language) ?? game.language,
          },
        ]
      : []),
  ];

  /*
   * 标题下那句摘要（机种之外那几个值用「 · 」串起来）。
   * 它要的是**纯文本** —— 不能拿上面那份 `facts` 去 join（值里有 `<Link>`，
   * join 出来会是 `[object Object]`），所以另拼一份。
   */
  /* 语言那截同样走全称（见上面 facts 里那条注释）—— `null` 会被 filter 掉 */
  const introLine = [game.year ? String(game.year) : null, text.developer, text.series, gameLanguageLabel(game.language)]
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
            动作区**分两层**（2026-10-13 用户反馈「这五个按钮放在一排 真的丑」之后重排）。

            旧版是五颗一模一样的灰砖头并排（只有第一颗带强调色），丑的根源**不是数量、
            是没有主次** —— 五颗等大等重，眼睛没有落点；而且它们干的是五件不同量级的事，
            却被画成了同一种东西。

            第一层 · **主行动**（2026-10-14 起四颗，有描边的实体钮，同一档高度）
              第四颗「联机游戏」是当天加的（去 `/play`，见那颗钮自己的注释）。
              原来的备注是「别再塞第 4 颗」，作废 —— 但**顺序**仍然有意：
              先「开始游戏」（唯一带强调色的），紧跟「联机游戏」（同样是「玩」这件事，
              只是换个地方），再是收藏、下载这两颗「把这盘带子怎么处置」的。
              ⚠️ 2026-10-15：NDS 那一款只有**三颗** —— 它不支持双人，第二颗整颗不画
                 （判据就在那颗钮自己的渲染处，别在这儿再写一遍）。
              尺寸 = 站内**紧凑钮**那一档：`py-2` + `12px` 字（同 AdminGames /
              GameLibraryPanel 里那批钮）。2026-10-13 用户说「上面三个按钮的尺寸缩小点」，
              从原来的 `py-2.5` + `13px` 降下来 —— 原来那档比全站任何一颗钮都大一号，
              摆在这一页反倒显得笨。
              · 「开始游戏」—— **唯一**用强调色的，也是三颗里最宽的一颗（`px-5`），
                前面带一个 `▸`。这一页存在的全部意义就是让人按它，所以只有它配这么亮。
              · 「收藏」—— 紧跟在它后面（用户 2026-10-13 原话「开始游戏旁边」），
                收藏数就挂在这颗钮里（`★ 收藏 12`）—— 同一个 state 才能跟着乐观更新
                一起走，见 FavoriteButton 的注释。
              · 「下载 ROM」—— 也留在这层：它是「把这盘带子拿走」，和上面两颗同属
                **主要动作**，只是不需要强调色来撑。
              三颗宽度不一样（字数不同），但基线齐、重心齐，看着是**一组**而不是一排砖。
              三颗之间 `gap-2`（8px）—— 比原来的 10px 再收紧一点，小尺寸下 10px 会显得散。

            第二层 · **次要动作**（两颗，**去掉描边和底色的文字链接**，带 16px 像素图标）
              · 「分享游戏」「反馈问题」—— 一个往剪贴板写地址、一个开弹窗写问题，
                都不是「玩这款游戏」本身。所以压到下一行、去掉钮身，
                只剩「图标 + 字」，字色 = `accent`（2026-10-13 用户要「增加图标 +
                修改文字颜色」改的，原来是暗灰 `ink-400`）——
                这一页的**文字链接**口径本来就是强调色（同一页资料表里那个「开发商」
                链接用的也是它），比暗灰一眼看得出是能点的东西。
                悬停不换色、改**加下划线**（颜色已经用了强调色，没有更亮的一档可去）。
                它们**不是不重要**，只是不该跟主行动抢视线。
              跟上一层拉开 `mt-6`（24px，2026-10-13 用户要求「距离上面三个按钮距离大点」，
              原来只有 `mt-3` = 12px）。12px 时这行看着像**黏在上面那排的尾巴**；
              24px 之后才读得出「这是另一组东西」—— 而且 24px 正是这一页的**段落间距**
              （下面正文、资料表都是 `mt-6`），拉开之后整页的纵向节奏才对得上。

            ⚠️ 试过但否掉的方案：把五颗塞进**一个分段控件**（一条描边里切五格）。
              像素风里它当然成立，但 5 段摊在右栏 ~700px 里每段只剩 130px，
              「反馈问题」四个字会贴边；而且分段控件讲的是「同一件事的几种模式」，
              这五颗却是五件不同的事，语义也不对。

            前两颗**都是 `<Link>` 不是 `<button>`** —— 它们去的是两个真地址
            （`/room?id=` 和 `/games/<id>/download`），用链接才能：新标签打开、被复制、
            被爬虫顺着走。按钮语义在这里是错的。
            「分享游戏」不一样：它不跳转，只是把**这一页的地址**写进剪贴板，
            所以是 `<button>`，而且必须是客户端组件（见 ShareGameButton）。
            复制的是 `origin` 现算的规范地址，不是 `window.location` —— 免得把
            `?id=` 之类的来源参数一起分享出去。
            `FavoriteButton` / `ReportGameButton` 同样得是客户端组件
            （一个要读登录态 + 打接口，一个要开关弹窗 + 提交）。
          */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={localePath(locale, `/play?id=${game.id}&mode=solo`)}
              className="pixel-edge pxw-3 pxc-600 inline-flex items-center gap-1.5 bg-accent px-5 py-2 text-[12px] text-ink-950 transition-colors hover:bg-accent/80"
            >
              {/*
                `▸` 而不是 `▶`：后者在部分平台带 emoji 呈现，`▸` 没有 emoji 映射，稳。
                字号 `15px`（钮里的字只有 12px）：钮变小之后（2026-10-13 用户要求缩小）
                这两个符号跟着降到 10px，用户随即反馈「这仨个按钮前面的图标都太小了」——
                所以说**钮缩小 ≠ 图标跟着缩**。15px 是照着站内那套 svg 图标定的
                （`icons.tsx` 一律 `size=16`，配的也是 12px 字，见同页第二层那两枚）；
                再配 `leading-none`，符号本身的行高只有 15px < 文字的 18px，
                所以**钮的总高不会因为这个变大**，只是符号在钮里变显眼。
              */}
              <span aria-hidden="true" className="text-[15px] leading-none">
                ▸
              </span>
              {t('gamesPage.play')}
            </Link>
            {/*
              「联机游戏」—— 去的是 `/play?id=`（2026-10-14 用户要求加的第二颗）。

              为什么不是把联机塞进「开始游戏」里面：那一页要的是一块**干净的黑屏**
              （左边画面、右边控件），而房间那边是满屏像素屋 —— 两种意图不该猜。
              两颗都是 `<Link>`（真地址，能新标签打开 / 被复制），不是 `<button>`。

              它刻意**不带 accent**：这一页只有「开始游戏」配强调色（它才是主行动），
              联机走的是和「下载 ROM」同一档的灰钮。图标用 `PlayersIcon`（16px svg，
              和下面第二层那两枚同一个尺寸档）——这一颗是「两个人一起玩」，
              用文字符号表不出来。

              ⚠️ **NDS 不画这一颗**（2026-10-15 用户要求「nds 不支持双人了，
                 在游戏详情隐藏入口」）：它没有第二个手柄口，站里的联机也推不动它。
                 不画是**唯一**正确处置 —— 灰着还留着，用户只会当成「坏了」。

                 这一颗只管「正常入口」。**手打地址栏照样能带上 `?mode=host` /
                 `?room=`**，那两条由 `/play` 自己忽略（见 `play/page.tsx` 的门禁
                 和 `PlayScene` 里派生的 `mode`）—— 所以这里藏钮不是唯一防线。
            */}
            {game.consoleType !== 'nds' && (
              <Link
                href={localePath(locale, `/play?id=${game.id}&mode=host`)}
                className="pixel-edge pxw-2 pxc-600 inline-flex items-center gap-1.5 bg-ink-800 px-3.5 py-2 text-[12px] text-ink-200 transition-colors hover:bg-ink-700 hover:text-accent"
              >
                <PlayersIcon size={16} />
                {t('gamesPage.playOnline')}
              </Link>
            )}
            <FavoriteButton gameId={game.id} count={favoriteCount} />
            <Link
              href={localePath(locale, `/games/${game.id}/download`)}
              className="pixel-edge pxw-2 pxc-600 inline-flex items-center gap-1.5 bg-ink-800 px-3.5 py-2 text-[12px] text-ink-200 transition-colors hover:bg-ink-700 hover:text-accent"
            >
              <span aria-hidden="true" className="text-[15px] leading-none">
                ↓
              </span>
              {t('gamesPage.download')}
            </Link>
          </div>

          {/* 第二层：图标 + 文字链接（口径见上面那段注释，字色 = accent） */}
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
            <ShareGameButton url={`${origin}${localePath(locale, `/games/${game.id}`)}`} />
            <ReportGameButton gameId={game.id} gameName={text.title} />
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
                console: consoleLabel(game.consoleType, locale),
              })}
          </p>

          {/* 资料表。`dl` 而不是一排 `<span>`：这一页的语义就是「字段名 : 值」 */}
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

      {/*
        评论模块（2026-10-13 加，用户要求「详情页面详情模块下方再增加一个评论模块」）。

        位置就是上面那一大块「详情」的**正下方**（封面 + 动作 + 正文 + 资料表都在那一块里），
        整页的层级于是是：标题摘要 → 这盘游戏是什么 → **大家怎么说**。

        ⚠️ 它**自己是一个客户端组件**（`'use client'`），而这一页是服务端组件 ——
        和 `FavoriteButton` / `ReportGameButton` 同一个拆法：正文要能被搜索引擎整段读走，
        评论要有事件处理（发表 / 加载更多 / 删自己的），塞不进服务端组件。
        传下去的两样东西都在这儿现算：`signedIn` 来自 `readViewer()`（服务端读 cookie，
        **所以首屏就是对的**，不会先画输入框再跳成「去登录」），`signInHref` 见上面那段注释。
      */}
      <GameComments gameId={game.id} signInHref={signInHref} />
    </GamesShell>
  );
}

export const revalidate = 86400;
const countFavorites = cached(countGameFavorites, ['game-favorite-count'], { revalidate: 86400 });

export { gameStaticParams as generateStaticParams } from '@/lib/server/static-params';
