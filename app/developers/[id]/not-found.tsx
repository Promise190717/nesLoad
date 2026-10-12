import type { Metadata } from 'next';
import Link from 'next/link';
import GamesShell from '@/components/GamesShell';
import { translate } from '@/lib/i18n';
import { readLocale } from '@/lib/server/locale';

/**
 * `/developers/<id>` 的 404。
 *
 * 和 `app/games/[id]/not-found.tsx` 同一个理由：开发商是后台可以删的，删掉之后
 * 那个地址还在外面飘着（索引、别人复制走的链接），得给一页说得清、有回去的路的 404，
 * 而不是 Next 默认那句英文。
 *
 * ⚠️ 这一页**只盖开发商详情** —— 它挂在 `/developers/[id]` 这一段上，
 * 别把它和游戏那份混起来（两处的返回目标不同：那边回 `/games`，这边回 `/developers`）。
 *
 * `robots: noindex` 显式写死：404 本来就不该被收录，写出来更稳。
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await readLocale();
  return {
    title: translate(locale, 'developersPage.notFoundTitle'),
    robots: { index: false, follow: true },
  };
}

export default async function DeveloperNotFound() {
  const locale = await readLocale();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  return (
    <GamesShell
      locale={locale}
      label="404"
      title={t('developersPage.notFoundTitle')}
      back={{ href: '/developers', label: 'developersPage.backToDevelopers' }}
    >
      <p className="mt-8 text-[13px] leading-7 text-ink-400">{t('developersPage.notFound')}</p>
      <p className="mt-4">
        <Link
          href="/developers"
          className="pixel-edge pxw-2 pxc-500 inline-block bg-ink-800 px-4 py-2 text-[12px] text-ink-200 transition-colors hover:text-accent"
        >
          {t('developersPage.backToDevelopers')}
        </Link>
      </p>
    </GamesShell>
  );
}
