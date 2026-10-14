import type { Metadata } from 'next';
import ConsoleCard from '@/components/ConsoleCard';
import { CONSOLE_TYPES } from '@/components/CartridgeSprite';
import GamesShell from '@/components/GamesShell';
import { cardDelayMs } from '@/lib/card-stagger';
import {
  SITE_NAME,
  alternatesFor,
  localePath,
  ogLocale,
  otherLocale,
  translate,
  type MessageKey,
} from '@/lib/i18n';
import { listConsolesCached } from '@/lib/server/consoles';
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
        {CONSOLE_TYPES.map((type, index) => (
          <li key={type} className="card-in" style={{ animationDelay: `${cardDelayMs(index)}ms` }}>
            <ConsoleCard type={type} row={rows.find((row) => row.type === type) ?? null} count={counts[type]} locale={locale} />
          </li>
        ))}
      </ul>
    </GamesShell>
  );
}
