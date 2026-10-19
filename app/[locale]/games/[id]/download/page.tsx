import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { consoleLabel as consoleLabelOf } from '@/lib/consoles';
import GamesShell from '@/components/GamesShell';
import RomDownloadGate from '@/components/RomDownloadGate';
import {
  SITE_NAME,
  alternatesFor,
  localePath,
  ogLocale,
  otherLocales,
  translate,
  type MessageKey,
} from '@/lib/i18n';
import { getGameCached, localizeGame } from '@/lib/server/games';
import { readLocaleParam } from '@/lib/server/locale';

/**
 * `/games/[id]/download` —— ROM 下载页（2026-10-12 用户要的「下载页面」）。
 *
 * 为什么要**单独一页**、而不是在详情页上直接挂个下载链接：用户要的是
 * 「下载 ROM 点击进入下载页面，点击下载 6 秒后开始下载」——
 * 也就是说下载这件事本身要有一个**自己的地址**，能被单独收录、单独分享。
 * 详情页那两个按钮因此是并列的：一个是「现在就在浏览器里玩」，一个是「把文件拿走」。
 *
 * ⚠️ 真正把字节吐出去的是 `/api/games/<id>/rom`（同源代理，见那个文件的注释）。
 * 这一页只负责「说清楚要下什么、给一个按下去要等 6 秒的按钮」。
 *
 * **不写 `export const dynamic`**：读 D1 + 读 cookie 语言，本来就是动态渲染
 * （和 app/privacy/page.tsx 同一个理由）。
 */
const loadGame = cache(async (id: string) => getGameCached(id));

/*
 * 这里**不重复 getGame 的查询**：`generateMetadata` 和页面正文都用 `loadGame`，
 * `cache()` 保证同一次请求里只查一遍（和列表页 / 详情页同一个写法）。
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [locale, game] = await Promise.all([readLocaleParam(params), loadGame(id)]);
  if (!game) notFound();

  /* 机种标签按语言取（中文站 FC、英文站 NES），见 lib/consoles.ts 的 `consoleLabel` */
  const tag = consoleLabelOf(game.consoleType, locale);
  /* 按语言选定的那一份文案（中英都从库里取出来了，这里挑一份）—— 见 lib/server/games.ts */
  const text = localizeGame(game, locale);
  const title = translate(locale, 'seo.gameDownload.title', {
    title: text.title,
    console: tag,
  });
  const description = translate(locale, 'seo.gameDownload.description', {
    title: text.title,
    console: tag,
  });

  return {
    title,
    description,
    alternates: alternatesFor(locale, `/games/${id}/download`),
    openGraph: {
      type: 'website',
      url: localePath(locale, `/games/${id}/download`),
      siteName: SITE_NAME[locale],
      title,
      description,
      images: [{ url: game.imageUrl, alt: text.title }],
      locale: ogLocale(locale),
      alternateLocale: otherLocales(locale).map(ogLocale),
    },
  };
}

export default async function GameDownloadPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const [locale, game] = await Promise.all([readLocaleParam(params), loadGame(id)]);
  if (!game) notFound();

  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
  const tag = consoleLabelOf(game.consoleType, locale);
  /* 页面正文用同一份按语言选定的文案（和 generateMetadata 里那份同源） */
  const text = localizeGame(game, locale);

  return (
    <GamesShell
      locale={locale}
      label="DOWNLOAD"
      title={t('download.heading')}
      /* 副标题写清「下的是哪一款」—— 从搜索结果直接落到这一页的人得马上确认没走错 */
      intro={`${text.title} · ${tag}`}
      back={{ href: localePath(locale, `/games/${id}`), label: 'common.back', mode: 'history' }}
      showAllGamesLink
    >
      <div className="mt-6 flex items-center gap-4">
        <span className="pixel-edge pxw-2 pxc-700 w-[64px] shrink-0 bg-ink-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={game.imageUrl}
            alt={text.title}
            className="block aspect-[3/4] w-full object-cover"
          />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14px] text-ink-100">{text.title}</span>
          {/*
            文件名直接写出来：街机的 ROM 是 romset（名字必须和驱动一致），
            下载前让人确认一下拿到的是什么，比下完再发现对不上强。
          */}
          <span className="mt-1 block truncate font-mono text-[12px] text-ink-500">
            {game.romName}
          </span>
        </span>
      </div>

      <RomDownloadGate romUrl={`/api/games/${id}/rom`} romName={game.romName} />
    </GamesShell>
  );
}

export { gameStaticParams as generateStaticParams } from '@/lib/server/static-params';
export const revalidate = 86400;
