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
  otherLocales,
  translate,
  type MessageKey,
} from '@/lib/i18n';
import { listConsolesCached } from '@/lib/server/consoles';
import { countGamesByConsoleCached } from '@/lib/server/sb-games';
import { readLocaleParam } from '@/lib/server/locale';

/**
 * `/consoles` —— 公开的机种列表（2026-10-14 用户要的「机种专题页」的入口，和
 * `/developers` 同一套做法：真路由、服务端组件、可收录、可分享）。
 *
 * ⚠️ **卡片是从代码里画出来的，不是从表里读出来的**：机种清单住在
 *    `components/CartridgeSprite.tsx` 的 `CONSOLE_TYPES`（加机种是改代码的事），
 *    `consoles` 表只提供**资料**（名字 / 图片 / 简介）。某个机种还没在后台填过资料时，
 *    卡片退回默认名字（`consoleLabel`，中文站 FC / 英文站 NES）照常渲染 ——
 *    绝不因为资料没填就让一个机种从这页上消失（首页的卡片也指着它呢）。
 *
 * 数据两份都走缓存：`listConsolesCached`（资料）+ `countGamesByConsoleCached`
 * （各机种游戏数，首页同一份），TTL 7 天。后台改完资料，这一页最多晚 7 天更新 ——
 * 和 `/developers` 同一个取舍（机种专题页上机种自己的资料**不缓存**，那边改完是立刻的）。
 *
 * ⚠️ 这一页原来**什么缓存声明都没有**，于是被 Next 当成构建期静态页（`[locale]` 有
 *    `generateStaticParams`），HTML 在 build 时就烤死了 —— 数据缓存只在构建那一次生效。
 *    2026-10-22 迁 Vercel、撤销全部页面级缓存时补上 `force-dynamic`，让它每请求渲染。
 */
export const dynamic = 'force-dynamic';
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
      alternateLocale: otherLocales(locale).map(ogLocale),
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

  // 两份数据互不依赖，并行取。理由见文件头：都带 30 天缓存。
  const [rows, counts] = await Promise.all([listConsolesCached(locale), countGamesByConsoleCached()]);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  /*
   * 按游戏数从多到少排（2026-10-15 用户要求），和首页「按机种浏览」同一套口径。
   *
   * ⚠️ **先摊成新数组再 `sort`**：`CONSOLE_TYPES` 是 readonly，原地排会污染其它页面
   *    （首页那一块、`/games` 的筛选条都读它）。
   * ⚠️ 数量并列时**不加 tie-break**：`Array#sort` 在 V8 上是稳定排序，并列的会保持
   *    `lib/consoles.ts` 里那份固定次序 —— 那份次序本身有意义（NES → SNES → GB…），
   *    再补一个二级比较键只会把两处口径写在两个地方。
   * ⚠️ 一款游戏都没有的机种排在最后，但**不过滤掉**：这一页是机种清单，「还没收录游戏」
   *    本身就是要展示的信息。首页那边取前 8、空机种自然排在后面，两者不冲突。
   */
  const ordered = [...CONSOLE_TYPES].sort((a, b) => counts[b] - counts[a]);

  return (
    <GamesShell
      locale={locale}
      label="CONSOLES"
      title={t('consolesPage.heading')}
      intro={t('consolesPage.intro', { count: total })}
      back={{ href: localePath(locale, '/'), label: 'common.back', mode: 'history' }}
    >
      <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {ordered.map((type, index) => (
          <li key={type} className="card-in" style={{ animationDelay: `${cardDelayMs(index)}ms` }}>
            <ConsoleCard type={type} row={rows.find((row) => row.type === type) ?? null} count={counts[type]} locale={locale} />
          </li>
        ))}
      </ul>
    </GamesShell>
  );
}
