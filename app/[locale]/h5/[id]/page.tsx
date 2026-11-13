import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ShipGameShell from '@/components/h5/ShipGameShell';
import { findGame, gameCopy, type H5GameId } from '@/lib/h5/catalog';
import { alternatesFor, localePath } from '@/lib/i18n';
import { readLocaleParam } from '@/lib/server/locale';

/**
 * 单个 H5 游戏的**游玩页**。
 *
 * 整页只有一个客户端组件（`ShipGameShell`）。它首屏渲染的是**模式选择**（单人 /
 * 多人两张页签），那部分是真 HTML —— 也是这一页唯一对搜索 / 首屏有意义的内容。
 * 后面的东西都要等用户选完模式、点下「继续」才开始加载（进度条在 `ShipLoading`），
 * 所以这一页：
 *
 *   · **按需 ISR**（和 `/play` 同一个理由）：HTML 对同一个 id + 语言逐字节相同，
 *     没有理由每次请求都现场渲染一遍；
 *   · 不做逐 id 的 OG 图（要现画一张 canvas 快照，成本远大于收益）；
 *   · 卡片墙 / 游戏列表里链到这里的 `<Link>` **必须 `prefetch={false}`** ——
 *     预取一个纯客户端页等于白渲染一份空壳（见 `/h5` 列表页）。
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const locale = await readLocaleParam(params);
  const game = findGame(id);
  if (!game) return { title: 'H5', robots: { index: false, follow: false } };
  const copy = gameCopy(locale, game);
  return {
    title: copy.title,
    description: copy.tagline,
    alternates: alternatesFor(locale, `/h5/${game.id}`),
    openGraph: {
      type: 'article',
      url: localePath(locale, `/h5/${game.id}`),
      title: copy.title,
      description: copy.tagline,
    },
  };
}

/** 和 `[locale]` 段的 params 组合成 `/{locale}/h5/{id}` 的完整静态路径。 */
export function generateStaticParams() {
  return [{ id: 'transport-ship' satisfies H5GameId }];
}

export const revalidate = 604800;

export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { id } = await params;
  const locale = await readLocaleParam(params);
  const game = findGame(id);
  if (!game || !game.live) notFound();

  return <ShipGameShell locale={locale} backHref={localePath(locale, '/h5')} />;
}
