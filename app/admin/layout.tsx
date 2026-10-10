import type { Metadata } from 'next';
import { translate } from '@/lib/i18n';
import { readLocale } from '@/lib/server/locale';

/*
 * /admin 整个子树的 metadata。
 *
 * 这个 layout 自己不渲染任何东西（`children` 原样返回）—— 它存在的唯一理由是
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
 * 标题走 i18n：后台是双语界面（AdminShell 里那句 t('admin.title')），
 * 浏览器标签页不该是另一种语言。根 layout 的 title 模板会补上站名后缀，
 * 结果就是「后台 · 复古游戏屋」/「Admin · Retro Game House」。
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await readLocale();

  return {
    title: translate(locale, 'admin.title'),
    robots: {
      index: false,
      follow: false,
      /* 连缓存快照也别留 —— 后台页面没有任何值得被归档的内容 */
      nocache: true,
    },
  };
}

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
