import type { Metadata } from 'next';
import { cache } from 'react';
import GamesShell from '@/components/GamesShell';
import PlayBackLink from '@/components/PlayBackLink';
import PlayScene from '@/components/PlayScene';
import { CONSOLE_LABEL } from '@/components/CartridgeSprite';
import {
  SITE_NAME,
  alternatesFor,
  localePath,
  ogLocale,
  otherLocale,
  translate,
  type Locale,
} from '@/lib/i18n';
import { getGameCached, localizeGame, type Game, type LocalizedGameText } from '@/lib/server/games';
import { readLocaleParam } from '@/lib/server/locale';

/**
 * `/play` —— 从游戏详情那颗「联机游戏」进来的那一页（2026-10-14 加，用户要求）。
 *
 * 和 `/room` 的关系：**同一套引擎、两种壳**。`/room` 是满屏像素屋（布景 / 电视机 /
 * 抽屉 / 一堆弹窗），这一页只有「左边一块屏幕 + 右边一列（资料块 + 操作表）」，
 * 一页把「怎么开这一局」摆清楚。载入、联机、键盘转发这些实现两边共用
 * （见 `components/PlayScene.tsx` 的文件头）。
 *
 * 外壳走 `GamesShell`（2026-10-14 用户要求「背景和 layout 和 `/consoles/<机种>` 像」）——
 * 于是 `.wall` 背景、右上一排入口（`TopBar`）、左上「返回」、页脚都和内容页一致，
 * 只是把中间那块页头关掉了（`showHeader={false}`，名字与资料在右列顶上，见下面注释）。
 *
 * 详情入口单机直接载入；联机先选择画质并确认，再建房和载入。
 * 只有 `?id=` 时保留手动设置；邀请链接带 `?room=` 时只预填加入，不自动载入 ROM。
 *
 * meta 的口径和 `/room` **完全一样**（带 id 就用这一款的标题 / 说明 / 封面，
 * 查不到退回通用那份、页面照常渲染），只是通用那两句换成 `seo.play.*` ——
 * 同一个游戏在两个地址上说同样的话，不编造、不各写各的。
 *
 * ⚠️ **不写 `export const dynamic`**：它要读语言（cookie / 请求头）+ searchParams，
 * 本来就是动态渲染。
 */
const loadGame = cache((id: string) => getGameCached(id));

/**
 * meta description 的截断上限 —— 详情页和 `/room` 同一个数（Google 约 155 字符就截）。
 * 三处各写一份小函数，但**数字和口径必须一致**，改一处记得看另外两处。
 */
const DESC_LIMIT = 100;

function clamp(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > DESC_LIMIT ? `${trimmed.slice(0, DESC_LIMIT)}…` : trimmed;
}

/** 按语言拼这一款游戏的标题 / 说明（口径 = 详情页那套）。 */
function gameMeta(
  locale: Locale,
  game: Game,
  text: LocalizedGameText
): { title: string; description: string } {
  const consoleLabel = CONSOLE_LABEL[game.consoleType];
  const boilerplate = translate(locale, 'seo.game.description', {
    title: text.title,
    console: consoleLabel,
  });
  const own = text.description?.trim();
  return {
    title: translate(locale, 'seo.game.title', { title: text.title, console: consoleLabel }),
    description: own ? `${clamp(own)} · ${boilerplate}` : boilerplate,
  };
}

export async function generateMetadata({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const locale = await readLocaleParam(routeParams);
  const sp = await searchParams;
  const id = typeof sp.id === 'string' ? sp.id.trim() : '';

  /* 没带 id（或查无此款）→ 退回这一页通用的那份 */
  const game = id ? await loadGame(id) : null;
  const text = game ? localizeGame(game, locale) : null;

  /* 标题里没有站名 —— 根布局的 `title.template` 会补上「· 站名」 */
  const title = text && game ? gameMeta(locale, game, text).title : translate(locale, 'seo.play.title');
  const description =
    text && game
      ? gameMeta(locale, game, text).description
      : translate(locale, 'seo.play.description');

  return {
    title,
    description,
    /* 这一页有自己的 canonical（`/play` / `/zh/play`，不带 id）—— 理由同 `/room` */
    alternates: alternatesFor(locale, '/play'),
    openGraph: {
      type: 'website',
      url: localePath(locale, '/play'),
      siteName: SITE_NAME[locale],
      title,
      description,
      /* 带游戏时直接用 R2 上那张封面当分享图（绝对地址，本来就公网可读） */
      ...(text && game ? { images: [{ url: game.imageUrl, alt: text.title }] } : {}),
      locale: ogLocale(locale),
      alternateLocale: ogLocale(otherLocale(locale)),
    },
  };
}

/**
 * `serverGame` 的三态（`PlayScene` 照这个语义消费，和 `/room` 完全一致）：
 * - `undefined` —— 地址上没有 `?id=`，或者 `loadGame` 本身抛了异常（DB 抖了之类）——
 *   客户端保留打 `/api/games/<id>` 兜底的能力，别把一次抖动升级成「找不到」；
 * - `null` —— 有 id 但库里查无此游戏，客户端直接报「找不到」，不用再打一次接口；
 * - `Game` —— 查到了，第一帧就有标题和机种。
 */
export default async function PlayPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [locale, sp] = await Promise.all([readLocaleParam(routeParams), searchParams]);
  const id = typeof sp.id === 'string' ? sp.id.trim() : '';

  /* 和 generateMetadata 同一个 `cache()` 包装 —— 同一请求内只打一次 D1 */
  let serverGame: Game | null | undefined;
  if (id) {
    try {
      serverGame = await loadGame(id);
    } catch (error) {
      console.error('[play] 游戏的服务端预取失败，交由客户端兜底：', error);
      serverGame = undefined;
    }
  }

  /*
   * 外壳用 `GamesShell`（和 `/consoles/<机种>`、游戏详情页同一个）—— 2026-10-14 用户要求
   * 这一页的「背景（`.wall`）+ 右上一排入口（`TopBar`）+ 返回 + layout」和机种专题页长得像。
   * 外壳负责 `<main>` / `<h1>` 之外的一切公共部分，`PlayScene` 只画「屏幕 + 右列」。
   *
   * ⚠️ `showHeader={false}`：这一页的名字与资料摆在右列顶上（封面 + 名字），
   * 顶上再来一个 `<h1>` 大标题就是同一句话说两遍。**h1 没丢** —— `PlayScene` 里有一颗
   * sr-only 的（游戏名，没有就退回页面名）。`label` / `title` 是必填 props，照样传，
   * 只是不渲染。
   *
   * 「返回」走**浏览器回退**（`mode: 'history'`）—— 来路可能是游戏详情、首页那个
   * 「加入房间」表单，或别人分享的房间链接，回上一页比写死一个落点准。
   * `href` 只是直接打开这一页（分享链接）时的兜底：带 `?id=` 就回那一款的详情页，
   * 否则回游戏列表。
   */
  return (
    <GamesShell
      locale={locale}
      label="PLAY"
      title={translate(locale, 'gamesPage.playOnline')}
      back={{
        href: id ? localePath(locale, `/games/${id}`) : localePath(locale, '/games'),
        label: 'common.back',
        mode: 'history',
      }}
      /*
        返回用 `PlayBackLink` 整颗替换（2026-10-15 用户要求）：游戏运行中点返回
        要先弹确认（进度不会保存）。落点和上面 `back.href` 同一个兜底地址 ——
        `PlayBackLink` 自己拿它当 history.length <= 1 时的 push 兜底。
      */
      backNode={<PlayBackLink href={id ? localePath(locale, `/games/${id}`) : localePath(locale, '/games')} />}
      showHeader={false}
      /*
        `fill`：这一页中间是固定 4:3 的屏幕，要「游戏区域吃满剩下的纵向空间、
        屏幕在里头上下居中、页脚压到视口最底部」—— 见 `GamesShell` 那个 prop 的注释。
      */
      fill
      wide
    >
      <PlayScene
        serverGame={serverGame}
        initialMode={sp.mode === 'host' ? 'host' : 'solo'}
        initialRoomCode={typeof sp.room === 'string' ? sp.room.trim() : ''}
        autoStart={Boolean(id) && !sp.room && sp.mode !== 'host'}
      />
    </GamesShell>
  );
}
