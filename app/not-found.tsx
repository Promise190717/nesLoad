import Link from 'next/link';
import GamesShell from '@/components/GamesShell';
import { localePath, SITE_NAME, translate } from '@/lib/i18n';
import { readLocale } from '@/lib/server/locale';

/**
 * 全站 404。
 *
 * 谁会用上它：`app/[locale]/` 里没有对应路径的任何地址
 * （`/zh/foo`、`/games/typo` 那种连段都没匹配上的），以及
 * `app/[locale]/layout.tsx` 里那个「locale 不合法」的 `notFound()`。
 *
 * 挂在 `app/` 根而不是 `app/[locale]/` 下，是因为后者的 404 得由
 * **上一层**提供 —— layout 自己调 `notFound()` 时，同层的 not-found 还没机会渲染。
 * 放这儿一处就够两种场景，且它照样拿得到语言（`readLocale()` 读的是 middleware
 * 按路径写进请求头的那个值，跟路由参数无关）。
 *
 * 用 `GamesShell` 而不是自己搭一页：404 也该有一模一样的页头 / 页脚，
 * 页脚那行互链还顺带把迷路的人和爬虫领回有内容的地方。
 *
 * ⚠️ **`/games/<id>` 与 `/developers/<id>` 有自己的 404**（在各自 `[id]` 段里），
 * 那两页文案更具体（「这个游戏不在游戏库里」），不会走到这里。
 *
 * ⚠️ **不带顶栏**（`showTopBar={false}`，2026-10-13）：404 的活是「给一个确定去处」，
 * 铺一排语言 / 账号 / 游戏库的入口只会把人留在原地。三个 404 页都是这个处理。
 */
export default async function NotFound() {
  const locale = await readLocale();
  /* `{site}` 在这里注入（`notFound.description` 里有站名占位，不传会原样印出来） */
  const t = (key: Parameters<typeof translate>[1]) =>
    translate(locale, key, { site: SITE_NAME[locale] });
  /*
   * 回**房间**（`/room`，2026-10-13 之前它是 `/`）。404 页两颗落点（左上角那颗与正文
   * 下面那颗）都是「回房间」，和 `notFound.description` 那句「回房间里看看」对得上。
   * 首页（`/`）是落地页，不是迷路的人该被送去的地方。
   */
  const room = localePath(locale, '/room');

  return (
    <GamesShell
      locale={locale}
      label="404"
      title={t('notFound.title')}
      back={{ href: room, label: 'gamesPage.backHome' }}
      showAllGamesLink={false}
      showTopBar={false}
      /* 不挂顶栏，所以左上角那行右边补一颗「首页」（2026-10-13 用户要求，见 GamesShell） */
      showHomeLink
    >
      <p className="mt-8 text-[13px] leading-7 text-ink-400">{t('notFound.description')}</p>
      <p className="mt-4">
        <Link
          href={room}
          className="pixel-edge pxw-2 pxc-500 inline-block bg-ink-800 px-4 py-2 text-[12px] text-ink-200 transition-colors hover:text-accent"
        >
          {t('gamesPage.backHome')}
        </Link>
      </p>
    </GamesShell>
  );
}
