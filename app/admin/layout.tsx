import SiteDocument, { siteMetadata } from '@/components/SiteDocument';
export { viewport } from '@/components/SiteDocument';
import type { Metadata } from 'next';

/*
 * /admin 整个子树的 metadata。
 *
 * 这个独立根布局提供固定中文的 SiteDocument，同时
 * **给后台挂一道 noindex**，而 metadata 只能在 layout / page 里导出。
 *
 * 为什么放在 `app/admin/layout.tsx` 而不是 `(panel)/layout.tsx`：
 * `/admin/login` 也在这棵子树下，它同样不该被收录（登录页进搜索结果是纯噪音）。
 * 挂在 admin 这一层，登录页和后台面板一次性全覆盖。
 *
 * 三道防线各管一段，缺一不可：
 *   app/robots.ts        —— 请求别来（只对守规矩的爬虫有效）
 *   这里的 noindex        —— 来了也别收（页面级，最硬的一道）
 *   middleware.ts        —— 未登录直接重定向走，压根读不到内容
 *
 * 标题是写死的中文（⚠️ 2026-10-15 起后台整体不走 i18n，见 AdminShell 顶上那条注释）。
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    ...await siteMetadata('zh'),
    title: '后台',
    robots: {
      index: false,
      follow: false,
      /* 连缓存快照也别留 —— 后台页面没有任何值得被归档的内容 */
      nocache: true,
    },
  };
}

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <SiteDocument locale="zh">{children}</SiteDocument>;
}
