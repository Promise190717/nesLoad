'use client';
import Link from 'next/link';
import GamesShell from '@/components/GamesShell';
import { localePath, translate } from '@/lib/i18n';
import { useI18n } from '@/components/I18nProvider';

/**
 * `/games/<id>` 与 `/games/<id>/download` 共用的一页 404。
 *
 * 为什么单独写：游戏是后台可以删的，删掉之后那个地址就还在外面飘着
 * （搜索引擎的索引、别人复制走的链接）。默认那页 404 是 Next 自己画的一句
 * `This page could not be found.`，和这个站的观感完全对不上，也没给回去的路。
 *
 * ⚠️ 它挂在 `[id]` 这一段上，所以**同时盖住详情页和下载页**两条路由 ——
 * 两处 `notFound()` 都落到这儿，不必各写一份。
 *
 * `robots: noindex` 是必须的：404 页面本来就不该被收录（虽然 Next 返回的状态码
 * 已经是 404、搜索引擎自己也不会收，但显式写死更稳）。
 */

export default function GameNotFound() {
  const { locale } = useI18n();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const allGames = localePath(locale, '/games');

  return (
    <GamesShell
      locale={locale}
      label="404"
      title={t('gamesPage.notFoundTitle')}
      back={{ href: allGames, label: 'gamesPage.backToGames' }}
      showTopBar={false}
      /* 不挂顶栏，所以左上角那行右边补一颗「首页」（2026-10-13 用户要求，见 GamesShell） */
      showHomeLink
    >
      <p className="mt-8 text-[13px] leading-7 text-ink-400">{t('gamesPage.notFound')}</p>
      <p className="mt-4">
        <Link
          href={allGames}
          className="pixel-edge pxw-2 pxc-500 inline-block bg-ink-800 px-4 py-2 text-[12px] text-ink-200 transition-colors hover:text-accent"
        >
          {t('gamesPage.backToGames')}
        </Link>
      </p>
    </GamesShell>
  );
}
