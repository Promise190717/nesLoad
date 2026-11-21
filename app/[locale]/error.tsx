'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import GamesShell from '@/components/GamesShell';
import {
  isLocale,
  localePath,
  SITE_NAME,
  translate,
  type Locale,
  type MessageKey
} from '@/lib/i18n';

/**
 * `app/[locale]/` 下的错误边界 —— 这一层之下任何页面抛错都落到这里。
 * 根布局自己抛错走 `app/global-error.tsx`（那个必须自带 `<html>`）。
 *
 * ## 为什么要自己写，不留给 Next 的默认错误页
 *
 * 这站在 Cloudflare 免费版上跑，最常见的失败不是代码 bug，而是**瞬时**的：
 * 请求量一高峰，10ms CPU 就打满（1102），Supabase 某一跳超时、R2 读抖动也是同类。
 * 这类错误等几秒刷新一次大概率就好了，但 Next 默认页只会冷冰冰地报
 * 「Application error」，访客唯一的反应是关掉页面。所以这一页的任务只有两个：
 * **告诉他不是自己的问题**，**告诉他等几秒再刷新**。
 *
 * ## 为什么不自动刷新（2026-11-21 用户明确要求）
 *
 * 自动刷新在确定性错误（代码 bug / 数据坏了）下会变成每隔几秒闪一次的循环，
 * 而且这类错误刷新本来就不会好 —— 把决定权交给用户更诚实。
 * 所以这一页**没有任何定时器**，只有一颗手动的「刷新一下」。
 *
 * ## 文案口径
 *
 * 说「服务器请求量较高」，不写 1102 / CPU 超限 / 缓存 / R2 这些内部词：
 * 访客不需要知道，知道了也不会让他多等一秒。
 *
 * ⚠️ 语言走 `useParams()` 而不是 `useI18n()`：`useI18n` 在没有 Provider 时会**抛错**
 *    （见 components/I18nProvider.tsx），而错误页是最不该再因为取文案崩一次的地方。
 *    路径段本来就是语言的唯一来源，和 Provider 的取值一致。
 */
export default function LocaleError({
  error
}: {
  error: Error & { digest?: string };
}) {
  const params = useParams<{ locale?: string }>();
  const locale: Locale = isLocale(params?.locale) ? params.locale : 'en';
  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(locale, key, { site: SITE_NAME[locale], ...vars });
  const home = localePath(locale, '/');

  return (
    <GamesShell
      locale={locale}
      label="ERROR"
      title={t('error.title')}
      back={{ href: home, label: 'gamesPage.backHome' }}
      showAllGamesLink={false}
      showTopBar={false}
      /* 不挂顶栏，所以左上角那行右边补一颗「首页」——和三个 404 页同一条规矩 */
      showHomeLink
    >
      <p className="mt-8 text-[13px] leading-7 text-ink-400">
        {t('error.description')}
      </p>
      <p className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="pixel-edge pxw-2 pxc-500 inline-block cursor-pointer bg-ink-800 px-4 py-1 text-[12px] text-ink-200 transition-colors hover:text-accent"
        >
          {t('error.refresh')}
        </button>
        <Link
          href={home}
          className="text-[12px] text-ink-400 transition-colors underline hover:text-accent"
        >
          {t('gamesPage.backHome')}
        </Link>
      </p>
      {/* 生产环境的 digest 是排查用的唯一抓手（服务端只往日志写堆栈），给用户抄一句就能定位 */}
      {error.digest ? (
        <p className="mt-8 font-mono text-[11px] text-ink-500">
          ref: {error.digest}
        </p>
      ) : null}
    </GamesShell>
  );
}
