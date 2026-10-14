import type { Metadata } from 'next';
import { cache } from 'react';
import ConsoleScene from '@/components/ConsoleScene';
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
import { getGame, localizeGame, type Game, type LocalizedGameText } from '@/lib/server/games';
import { readLocaleParam } from '@/lib/server/locale';

/**
 * `/room` —— 那间像素小屋（2026-10-13 从 `/` 挪过来的；路由名先是 `/play`，同日改成 `/room`）。
 *
 * **为什么挪**：`/` 换成了落地页（`app/[locale]/page.tsx`：Hero + 按机种 / 开发商浏览 +
 * FAQ）。原来 `/` 既是「站点的门面」又是「玩游戏的屋子」，两个身份各自要的东西是冲突的 ——
 * 门面要一页能被搜索引擎整段读走的正文，屋子要满屏 CSS 场景 + canvas。
 * 拆开之后各归各位：`/` 负责「让人找到并看懂」，`/room` 负责「真的开玩」。
 *
 * ⚠️ **旧地址 `/` 上的 `?id=` / `?room=` 深链会落到首页**（详情页那颗「开始游戏」、
 * 联机分享出去的房间链接都是这个形态）。所以首页那边有一条**参数透传的重定向**：
 * 带这两个参数访问 `/` 会被 307 到 `/room?...` —— 分享出去的链接不该因为这次拆分失效。
 * 那条重定向在 `app/[locale]/page.tsx` 里，改这里时别把它忘了。
 *
 * **`?id=<游戏 id>` 的 meta 是**游戏相关**的（2026-10-14 加，用户要求「游戏数据在服务端
 * 就给他获取了，为了 SEO 做好标题和说明」）**：带 id 时服务端现查这一款（`getGame`，
 * 和详情页同一个 `cache()` 套路），标题 / 说明 / OG 封面都换成这一款的 ——
 * 分享 `/room?id=x` 出去，卡片上就是游戏的名字和封面，而不是一句通用的「像素小屋」。
 * 规则和详情页同一套（`seo.game.title` / `seo.game.description` + 截断）—— 同一个游戏
 * 在两个地址上说同样的话，不编造、不各写各的。查不到（后台删了 / id 是编的）就退回
 * 通用那份，**页面照常渲染** —— `?id=` 对不对由客户端那条深链流程去弹「找不到」，
 * meta 层不该把整间屋子 404 掉。
 *
 * **正文只做一件事**：渲染 `ConsoleScene`（客户端组件，`?id=` / `?room=` 的解析、
 * 联机、存档、键位全在它自己里）。服务端这一侧除了语言与 meta，还会把**带 `?id=` 时
 * 查到的那款游戏**当 props 递下去（2026-10-14，用户要求「服务端已经获取过游戏数据了，
 * 弹窗里面应该能直接拿到，不用客户端再调一次」）—— meta 那一趟 `loadGame` 是
 * `cache()` 包着的，页面正文再调一次**不会多打数据库**，深链弹窗因此第一帧就有
 * 封面和名字，客户端那条 `GET /api/games/<id>` 只剩「服务端查询抛异常」时的兜底用途。
 *
 * ⚠️ **canonical 刻意仍指 `/room`（不带 id）**：同一款游戏已经有 `/games/<id>` 那页
 * 正经正文了，房间深链再各自抢一篇只会内耗。标题 / 说明跟着游戏走是为了**分享卡片**
 * 和「带 id 的地址被直接收录时别顶着一页废话」—— 不是要它和详情页抢排名。
 *
 * ⚠️ **不写 `export const dynamic`**：它要读语言（cookie / 请求头）+ searchParams，
 * 本来就是动态渲染。
 */
const loadGame = cache((id: string) => getGame(id));

/**
 * meta description 的截断上限 —— 详情页同一个数（Google 约 155 字符就截）。
 * 两处各写一份小函数，但**数字和口径必须一致**，改一处记得看另一处。
 */
const DESC_LIMIT = 100;

function clamp(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > DESC_LIMIT ? `${trimmed.slice(0, DESC_LIMIT)}…` : trimmed;
}

/** 按语言拼这一款游戏的标题 / 说明（口径 = 详情页那套，见上）。 */
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

  /* 没带 id（纯房间 / `?room=` 联机链接）或查无此游戏 → 退回通用的那份 */
  const game = id ? await loadGame(id) : null;
  const text = game ? localizeGame(game, locale) : null;

  /* 标题里没有站名 —— 根布局的 `title.template` 会补上「· 站名」，见 lib/i18n.ts 那条注释 */
  const title = text && game ? gameMeta(locale, game, text).title : translate(locale, 'seo.room.title');
  const description =
    text && game ? gameMeta(locale, game, text).description : translate(locale, 'seo.room.description');

  return {
    title,
    description,
    /*
     * 屋子有自己的 canonical（`/room` / `/zh/room`，**不带 id**，理由见文件头）——
     * 少了这一行，它会顶着根布局那份 `/` 的 canonical，在搜索引擎眼里就成了
     * 首页的重复内容（`alternates` 是整体覆盖，见 lib/i18n.ts 的 `alternatesFor`）。
     */
    alternates: alternatesFor(locale, '/room'),
    openGraph: {
      type: 'website',
      url: localePath(locale, '/room'),
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
 * `serverGame` 的三态（`ConsoleScene` 那边照这个语义消费）：
 * - `undefined` —— 地址上没有 `?id=`（没有深链），或者 `loadGame` 本身抛了异常
 *   （DB 抖了之类）—— 客户端保留打 `/api/games/<id>` 兜底的能力，别把一次抖动
 *   直接升级成「找不到」；
 * - `null` —— 有 id 但库里查无此游戏，客户端直接弹「找不到」，不用再打一次接口
 *   去确认同一件事（meta 那边同样拿它退回通用标题，两边读的是同一份结果）；
 * - `Game` —— 查到了，弹窗第一帧就有数据。
 */
export default async function RoomPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const id = typeof sp.id === 'string' ? sp.id.trim() : '';

  /* 和 generateMetadata 同一个 `cache()` 包装 —— 同一请求内只打一次 D1。 */
  let serverGame: Game | null | undefined;
  if (id) {
    try {
      serverGame = await loadGame(id);
    } catch (error) {
      // 查询本身炸了：留给客户端走接口兜底，这里不把页面掀翻
      console.error('[room] 深链游戏的服务端预取失败，交由客户端兜底：', error);
      serverGame = undefined;
    }
  }

  return <ConsoleScene serverGame={serverGame} />;
}
