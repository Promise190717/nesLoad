import type { Metadata } from 'next';
import Link from 'next/link';
import GamesShell from '@/components/GamesShell';
import H5Cover from '@/components/h5/H5Cover';
import { H5_GAMES, gameCopy, type H5Badge } from '@/lib/h5/catalog';
import {
  SITE_NAME,
  alternatesFor,
  localePath,
  ogLocale,
  otherLocales,
  translate,
  type MessageKey,
} from '@/lib/i18n';
import { readLocaleParam } from '@/lib/server/locale';

/**
 * H5 小游戏专栏（`/h5`）。
 *
 * 和 `/consoles`、`/developers` 一样是**目录页**：一个游戏一张卡，点进去是纯前端
 * 跑起来的游戏本体。整页只有静态文案 + 内联 SVG，跟着 ISR 一起被 CDN 缓存。
 *
 * 卡片的 `prefetch` 一律关掉 —— 理由和 `ConsoleCard` / `GameCardGrid` 那两条一样：
 * 这一页将来可能挂十几款游戏，开着预取等于每个访客多渲染十几份游戏页。
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await readLocaleParam(params);
  const title = translate(locale, 'h5.seo.title');
  const description = translate(locale, 'h5.seo.description');
  return {
    title,
    description,
    alternates: alternatesFor(locale, '/h5'),
    openGraph: {
      type: 'website',
      url: localePath(locale, '/h5'),
      siteName: SITE_NAME[locale],
      title,
      description,
      locale: ogLocale(locale),
      alternateLocale: otherLocales(locale).map(ogLocale),
    },
  };
}

/** 纯静态内容，跟着全站的按需 ISR 走。 */
export const revalidate = 604800;

/** 能力标记 → 文案键。写成映射而不是模板字符串：`translate` 的 key 是字面量联合类型。 */
const BADGE_KEY: Record<H5Badge, MessageKey> = {
  online: 'h5.badge.online',
  bots: 'h5.badge.bots',
  touch: 'h5.badge.touch',
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await readLocaleParam(params);

  return (
    <GamesShell
      locale={locale}
      label="H5 ZONE"
      title={translate(locale, 'h5.title')}
      intro={translate(locale, 'h5.intro', { count: H5_GAMES.length })}
      back={{ href: localePath(locale, '/'), label: 'common.home', mode: 'link' }}
    >
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {H5_GAMES.map((game) => {
          const copy = gameCopy(locale, game);
          return (
            <Link
              key={game.id}
              href={localePath(locale, `/h5/${game.id}`)}
              prefetch={false}
              className="pixel-edge pxw-2 pxc-700 group flex flex-col bg-ink-900 transition-colors hover:bg-ink-800"
            >
              <div className="relative aspect-[16/9] overflow-hidden border-b border-ink-800">
                <H5Cover accent={game.accent} />
              </div>

              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-[15px] leading-snug font-semibold text-ink-100">{copy.title}</h2>
                  <span className="mt-0.5 shrink-0 font-pixel text-[11px] text-accent">
                    {translate(locale, 'h5.play')}
                  </span>
                </div>
                <p className="text-[12px] leading-5 text-ink-400">{copy.tagline}</p>
                <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  {game.badges.map((badge) => (
                    <span
                      key={badge}
                      className="border border-ink-700 bg-ink-950 px-1.5 py-0.5 text-[10px] tracking-wide text-ink-400"
                    >
                      {translate(locale, BADGE_KEY[badge])}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="mt-8 border-t border-ink-800 pt-5 text-[12px] leading-6 text-ink-500">
        {translate(locale, 'h5.note')}
      </p>
    </GamesShell>
  );
}
