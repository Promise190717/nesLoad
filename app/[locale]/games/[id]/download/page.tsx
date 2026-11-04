import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import GameDownloadPanel from '@/components/GameDownloadPanel';
import GamesShell from '@/components/GamesShell';
import { ROM_DOWNLOAD_ENABLED } from '@/lib/features';
import { localePath, translate, type MessageKey } from '@/lib/i18n';
import { readLocaleParam } from '@/lib/server/locale';

/**
 * `/games/[id]/download` —— ROM 下载页（2026-10-12 用户要的「下载页面」）。
 *
 * 为什么要**单独一页**、而不是在详情页上直接挂个下载链接：用户要的是
 * 「下载 ROM 点击进入下载页面，点击下载 6 秒后开始下载」——
 * 也就是说下载这件事本身要有一个**自己的地址**，能被单独分享。
 *
 * ⚠️ 真正把字节吐出去的是 `/api/games/<id>/rom`（同源代理，见那个文件的注释）。
 * 这一页只负责「说清楚要下什么、给一个按下去要等 6 秒的按钮」。
 *
 * ---------------------------------------------------------------------------
 * 🔴 2026-11-04：**这一页的服务端输出刻意与 `id` 无关**
 *
 * 线上错误日志里 1102（`Worker exceeded CPU time limit`）清一色是
 * `GET /<locale>/games/<slug>/download`：2110 款 × 18 语言 ≈ 3.8 万个独立 URL，
 * 免费版 10ms CPU 装不下一次 React SSR，而冷渲染失败就拿不到响应、也就存不进缓存
 * ⇒ 每条 URL 永远停在冷状态，每被访问一次（爬虫顺着详情页的下载钮来）就一条 1102。
 *
 * 解法是把「逐 URL 渲染」变成「一份副本服务一族 URL」：
 *   · 页面不再查库、不再往服务端结果里放任何这一款的数据（封面 / 标题 / 文件名
 *     全在客户端组件 `GameDownloadPanel` 里从 `/api/games/<id>` 取）；
 *   · `worker.ts` 的缓存键把 `/<locale>/games/<任意 id>/download` 折叠成
 *     `/<locale>/__nesload_download` ⇒ 3.8 万条 URL 共用 18 份 HTML。
 *
 * ⚠️ **别在这里加回 `getGameCached` / 逐页 `generateMetadata`**：任何一个 id 相关字段
 *    进了 HTML，折叠缓存就会把 A 游戏的页面发给 B 游戏，只能再把键拆回逐 URL
 *    —— 那等于把 1102 原样请回来。
 *
 * 代价与取舍（已确认）：这一页失去逐页 `<title>` / OG，因此挂 **`noindex, follow`**。
 * 它和详情页内容重复、本来也不在 sitemap 里（见 app/sitemap.ts 顶部那段），
 * 收录价值近乎为零；分享链接照常可用，只是预览卡片是站点默认那张。
 *
 * ⚠️ 详情页的下载钮因此改成了**硬导航**（`<a>`，见 `GameLanguageActions.tsx`）：
 *    软导航走的是 RSC flight，那份载荷是逐 URL 的，折叠缓存接不住它。
 *
 * ---------------------------------------------------------------------------
 * 🔴 2026-11-04：**整页可以关掉**（`lib/features.ts` 的 `ROM_DOWNLOAD_ENABLED`）。
 *
 * 关着的时候这条路由 `notFound()` —— 详情页那颗钮已经不画了，这里是第二道闸：
 * 旧外链、搜索引擎里已经收录的地址、别人贴过的链接，一条都不许再吐页面。
 * 两道闸都留着，别只关其中一道（只关按钮 = 地址还能直接打开）。
 *
 * ⚠️ 开关是**编译期常量**，改完要重新构建部署才生效。
 * ⚠️ 关掉期间这条路由**不进 sitemap**（本来也不进，见 `app/sitemap.ts`），无需额外处理。
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  /* 关掉时这条路由根本不存在 —— 元数据也不该算（见文件头「整页可以关掉」那段） */
  if (!ROM_DOWNLOAD_ENABLED) notFound();

  const locale = await readLocaleParam(params);

  /*
   * 标题与说明只按语言取，**不读 id**（理由见文件头）。
   * 页面级 noindex 是必须的：3.8 万条同标题、正文靠客户端填的地址，
   * 收进索引只会是重复内容。
   *
   * ⚠️ 这里**不写 `alternates` / `openGraph`**：
   *   · canonical / hreflang 一旦按 id 现算，HTML 就又变回逐 URL 一份，折叠缓存立刻失效；
   *   · `openGraph` 整块写出来会**顶掉**布局里那份（Next 对这类对象是整体替换，
   *     不是深合并），把默认的 1200×630 分享图一起弄丢。
   *   于是这一页沿用布局给的站点级 canonical / OG —— 对 noindex 的页面没有副作用，
   *   分享出去仍是站点默认那张卡片。
   */
  return {
    title: translate(locale, 'download.heading'),
    description: translate(locale, 'download.hint'),
    robots: { index: false, follow: true },
  };
}

export default async function GameDownloadPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  if (!ROM_DOWNLOAD_ENABLED) notFound();

  const locale = await readLocaleParam(params);

  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  return (
    <GamesShell
      locale={locale}
      label="DOWNLOAD"
      title={t('download.heading')}
      /*
       * `back.href` 只是兜底：这一页走 `mode: 'history'`，返回键是浏览器回退
       * （人是从详情页点进来的，回退比「回某个写死的地址」更贴意图）。
       */
      back={{ href: localePath(locale, '/games'), label: 'common.back', mode: 'history' }}
      showAllGamesLink
    >
      <GameDownloadPanel />
    </GamesShell>
  );
}

/*
 * 页面级按需缓存（2026-10-24 恢复；构建期预渲染仍然不做，理由与详情页相同）。
 *
 * 历史：这里曾和详情页一起加过 `generateStaticParams` 做构建期预渲染，2026-10-22
 * 迁 Vercel 时一并撤掉、全站 `force-dynamic`；回到 CF 免费版后每个请求现场渲染
 * 会撞 10ms CPU，于是恢复「首次访问渲染、之后走增量缓存」的按需形态。
 * 现在正文是客户端组件，这一页的渲染成本只剩外壳，18 种语言各一份。
 */
export const revalidate = 604800; // = GAME_DETAIL_REVALIDATE_SECONDS(lib/server/sb-games.ts)；Next 的段配置只认字面量，别改回常量导入

/*
 * 动态段要进按需 ISR 必须有这个钩子：返回空数组 = 构建期一个参数组合都不预渲染，
 * 未知参数在运行时首次访问时生成并写入增量缓存（相当于 fallback: 'blocking'）。
 * 没有它，这条路由永远逐请求渲染（免费版 10ms CPU 必超限），Cache-Control 也是
 * private, no-cache（2026-10-24 踩过：只写 revalidate 时 /games/[id] 就是这个表现）。
 */
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}
