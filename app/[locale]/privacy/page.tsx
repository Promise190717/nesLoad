import type { Metadata } from 'next';
import LegalPage from '@/components/LegalPage';
import { SITE_NAME, alternatesFor, localePath, ogLocale, otherLocales } from '@/lib/i18n';
import { legalDoc } from '@/lib/legal';
import { readLocaleParam } from '@/lib/server/locale';

/**
 * /privacy —— 隐私政策。
 *
 * **为什么是独立路由，而不是房间里的一个浮层**：房间界面里那些面板（游戏库 / 联机 /
 * 存档）全都没有自己的 URL，因为它们只在那个房间里才有意义。隐私政策和条款不一样 ——
 * 它们要能被**直接分享**、被搜索引擎收录（见 app/sitemap.ts）、被第三方（广告平台 /
 * 应用商店审核之类）当作一个固定地址来检查。所以它们和 /admin 一样是真正的页面。
 *
 * 2026-10-13 起它住在 `app/[locale]/` 下：语言从 `params` 来（`/privacy` 英文、
 * `/zh/privacy` 中文），不再是「读 cookie 猜」。`alternates` 两条互指，
 * 收口在 `alternatesFor()`。
 *
 * 版式与文案都不在这里，在 components/LegalPage.tsx 和 lib/legal.ts。
 *
 * 这个文件**不写 `export const dynamic`**：根布局已经在读请求头决定语言，
 * 整棵树本来就是动态渲染（构建输出里的 ƒ），这里再声明一次是多余的。
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = await readLocaleParam(params);
  const doc = legalDoc('privacy', locale);

  return {
    // 站名后缀由根布局的 title.template 补上（`%s · 游戏小屋`）
    title: doc.title,
    description: doc.summary,
    alternates: alternatesFor(locale, '/privacy'),
    openGraph: {
      type: 'website',
      url: localePath(locale, '/privacy'),
      siteName: SITE_NAME[locale],
      title: doc.title,
      description: doc.summary,
      locale: ogLocale(locale),
      alternateLocale: otherLocales(locale).map(ogLocale),
    },
  };
}

export default async function PrivacyPolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = await readLocaleParam(params);
  return <LegalPage kind="privacy" locale={locale} />;
}
