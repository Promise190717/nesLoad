'use client';
import Link from 'next/link';
import GamesShell from '@/components/GamesShell';
import { localePath, SITE_NAME, translate } from '@/lib/i18n';
import { useI18n } from '@/components/I18nProvider';

/**
 * 全站 404。
 * 谁会用上它：`app/[locale]/` 里没有对应路径的任何地址
 * （`/zh/foo`、`/games/typo` 那种连段都没匹配上的），以及
 * `app/[locale]/layout.tsx` 里那个「locale 不合法」的 `notFound()`。
 *
 * 未匹配路由由 app/global-not-found.tsx 复用本组件。语言来自客户端上下文，
 * 不再读取请求头或 Cookie，404 也可以静态生成。
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
export default function NotFound() {
  const { locale } = useI18n();
  /* `{site}` 在这里注入（`notFound.description` 里有站名占位，不传会原样印出来） */
  const t = (key: Parameters<typeof translate>[1]) =>
    translate(locale, key, { site: SITE_NAME[locale] });
  /* 404 的两颗落点（左上角那颗与正文下面那颗）都回首页，和 `notFound.description` 对得上。 */
  const home = localePath(locale, '/');

  return (
    <GamesShell
      locale={locale}
      label="404"
      title={t('notFound.title')}
      back={{ href: home, label: 'gamesPage.backHome' }}
      showAllGamesLink={false}
      showTopBar={false}
      /* 不挂顶栏，所以左上角那行右边补一颗「首页」（2026-10-13 用户要求，见 GamesShell） */
      showHomeLink
    >
      <p className="mt-8 text-[13px] leading-7 text-ink-400">
        {t('notFound.description')}
      </p>
      <p className="mt-4">
        <Link
          href={home}
          className="pixel-edge pxw-2 pxc-500 inline-block bg-ink-800 px-4 py-2 text-[12px] text-ink-200 transition-colors hover:text-accent"
        >
          {t('gamesPage.backHome')}
        </Link>
      </p>
    </GamesShell>
  );
}
