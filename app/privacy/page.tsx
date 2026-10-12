import type { Metadata } from 'next';
import LegalPage from '@/components/LegalPage';
import { SITE_NAME } from '@/lib/i18n';
import { legalDoc } from '@/lib/legal';
import { readLocale } from '@/lib/server/locale';

/**
 * /privacy —— 隐私政策。
 *
 * **为什么是独立路由，而不是房间里的一个浮层**：房间界面里那些面板（游戏库 / 联机 /
 * 存档）全都没有自己的 URL，因为它们只在那个房间里才有意义。隐私政策和条款不一样 ——
 * 它们要能被**直接分享**、被搜索引擎收录（见 app/sitemap.ts）、被第三方（广告平台 /
 * 应用商店审核之类）当作一个固定地址来检查。所以它们和 /admin 一样是真正的页面。
 *
 * 版式与文案都不在这里，在 components/LegalPage.tsx 和 lib/legal.ts。
 *
 * 这个文件**不写 `export const dynamic`**：根布局已经在读 cookie 决定语言，
 * 整棵树本来就是动态渲染（构建输出里的 ƒ），这里再声明一次是多余的。
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await readLocale();
  const doc = legalDoc('privacy', locale);

  return {
    // 站名后缀由根布局的 title.template 补上（`%s · 游戏小屋`）
    title: doc.title,
    description: doc.summary,
    alternates: { canonical: '/privacy' },
    openGraph: {
      type: 'website',
      url: '/privacy',
      siteName: SITE_NAME[locale],
      title: doc.title,
      description: doc.summary,
      locale: locale === 'zh' ? 'zh_CN' : 'en_US',
    },
  };
}

export default async function PrivacyPolicyPage() {
  const locale = await readLocale();
  return <LegalPage kind="privacy" locale={locale} />;
}
