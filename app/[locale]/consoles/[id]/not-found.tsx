'use client';
import Link from 'next/link';
import GamesShell from '@/components/GamesShell';
import { localePath, translate } from '@/lib/i18n';
import { useI18n } from '@/components/I18nProvider';

/**
 * `/consoles/<type>` 的 404。
 *
 * 和 `app/developers/[id]/not-found.tsx` 同一个理由：外面飘着的旧链接、手输错的地址
 * （`/consoles/xxx`）不该落在 Next 默认那句英文上。注意正常的机种专题页**永远不会
 * 404**（没填资料退回默认渲染）—— 能走到这里的只有「不在枚举里」的地址。
 *
 * ⚠️ 这一页只盖机种详情 —— 它挂在 `/consoles/[id]` 这一段上，别和游戏 / 开发商那份混。
 *
 * `robots: noindex` 显式写死：404 本来就不该被收录，写出来更稳。
 */

export default function ConsoleNotFound() {
  const { locale } = useI18n();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const allConsoles = localePath(locale, '/consoles');

  return (
    <GamesShell
      locale={locale}
      label="404"
      title={t('consolesPage.notFoundTitle')}
      back={{ href: allConsoles, label: 'consolesPage.backToConsoles' }}
      showTopBar={false}
      /* 不挂顶栏，所以左上角那行右边补一颗「首页」（和开发商 404 同一套） */
      showHomeLink
    >
      <p className="mt-8 text-[13px] leading-7 text-ink-400">{t('consolesPage.notFound')}</p>
      <p className="mt-4">
        <Link
          href={allConsoles}
          className="pixel-edge pxw-2 pxc-500 inline-block bg-ink-800 px-4 py-2 text-[12px] text-ink-200 transition-colors hover:text-accent"
        >
          {t('consolesPage.backToConsoles')}
        </Link>
      </p>
    </GamesShell>
  );
}
