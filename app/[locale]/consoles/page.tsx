import type { Metadata } from 'next';
import Link from 'next/link';
import { CONSOLE_LABEL, CONSOLE_TYPES } from '@/components/CartridgeSprite';
import GamesShell from '@/components/GamesShell';
import { cardDelayMs } from '@/lib/card-stagger';
import {
  SITE_NAME,
  alternatesFor,
  localePath,
  ogLocale,
  otherLocale,
  translate,
  type Locale,
  type MessageKey,
} from '@/lib/i18n';
import { localizeConsole, listConsolesCached } from '@/lib/server/consoles';
import { countGamesByConsoleCached } from '@/lib/server/games';
import { readLocaleParam } from '@/lib/server/locale';

/**
 * `/consoles` —— 公开的机种列表（2026-10-14 用户要的「机种专题页」的入口，和
 * `/developers` 同一套做法：真路由、服务端组件、可收录、可分享）。
 *
 * ⚠️ **四张卡是代码里画出来的，不是从表里读出来的**：机种清单住在
 *    `components/CartridgeSprite.tsx` 的 `CONSOLE_TYPES`（加机种是改代码的事），
 *    `consoles` 表只提供**资料**（名字 / 图片 / 简介）。某个机种还没在后台填过资料时，
 *    卡片退回默认名字（`CONSOLE_LABEL`，NES / SFC / GBA / ARC）照常渲染 ——
 *    绝不因为资料没填就让一个机种从这页上消失（首页的卡片也指着它呢）。
 *
 * 数据两份都走 12 小时缓存：`listConsolesCached`（资料）+ `countGamesByConsoleCached`
 * （各机种游戏数，首页同一份）。后台改完资料，这一页最多晚 12 小时更新 —— 和
 * `/developers` 同一个取舍（机种专题页上机种自己的资料**不缓存**，那边改完是立刻的）。
 */
export async function generateMetadata({
  params: routeParams,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = await readLocaleParam(routeParams);

  // 条数现读：写死会在增减游戏之后变成假话（四份机种计数加总）
  const counts = await countGamesByConsoleCached();
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  const title = translate(locale, 'seo.consoles.title');
  const description = translate(locale, 'seo.consoles.description', { count: total });
  const canonical = localePath(locale, '/consoles');

  return {
    title,
    description,
    alternates: alternatesFor(locale, '/consoles'),
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: SITE_NAME[locale],
      title,
      description,
      locale: ogLocale(locale),
      alternateLocale: ogLocale(otherLocale(locale)),
    },
  };
}

export default async function ConsolesPage({
  params: routeParams,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = await readLocaleParam(routeParams);
  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  // 两份数据互不依赖，并行取。理由见文件头：都带 12 小时缓存。
  const [rows, counts] = await Promise.all([listConsolesCached(), countGamesByConsoleCached()]);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <GamesShell
      locale={locale}
      label="CONSOLES"
      title={t('consolesPage.heading')}
      intro={t('consolesPage.intro', { count: total })}
      back={{ href: localePath(locale, '/room'), label: 'common.back', mode: 'history' }}
    >
      <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {CONSOLE_TYPES.map((type, index) => {
          /* 该机种的资料行（没填过就是 null —— 用默认名字渲染，见文件头那条 ⚠️） */
          const row = rows.find((console) => console.type === type) ?? null;
          const text = row ? localizeConsole(row, locale) : null;
          const name = text?.name ?? CONSOLE_LABEL[type];

          return (
            /*
             * 入场动效和游戏卡片 / 开发商卡片共用一套（`.card-in` +
             * lib/card-stagger.ts 的错峰参数）—— 同一个站里几处网格的出场节奏不该不一样。
             */
            <li key={type} className="card-in" style={{ animationDelay: `${cardDelayMs(index)}ms` }}>
              <Link
                href={localePath(locale, `/consoles/${type}`)}
                className="pixel-edge pxw-2 pxc-700 flex h-full flex-col items-center gap-2 bg-ink-900 p-4 text-center transition-colors hover:bg-ink-800"
              >
                {row?.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={row.imageUrl}
                    /* 同一条链接里下面紧跟着名字，读屏靠链接名就够了（和开发商卡片同一个理由） */
                    alt=""
                    loading="lazy"
                    className="pixel-edge pxw-2 pxc-700 h-[72px] w-[72px] shrink-0 bg-ink-950 object-contain"
                  />
                ) : (
                  /*
                   * 没机图的用卡带丝印词占位（NES / SFC / GBA / ARC），和开发商那边
                   * 「名字首字占位」是同一个思路 —— 不留一个灰洞。
                   */
                  <span
                    aria-hidden="true"
                    className="pixel-edge pxw-2 pxc-700 flex h-[72px] w-[72px] shrink-0 items-center justify-center bg-ink-950 font-pixel text-[16px] text-ink-600"
                  >
                    {CONSOLE_LABEL[type]}
                  </span>
                )}

                <span className="w-full truncate text-[12px] text-ink-100">{name}</span>

                <span className="font-pixel text-[12px] text-accent">
                  {t('consolesPage.gameCount', { count: counts[type] })}
                </span>

                {text?.summary && (
                  <span className="line-clamp-2 text-[12px] leading-4 text-ink-500">
                    {text.summary}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </GamesShell>
  );
}
