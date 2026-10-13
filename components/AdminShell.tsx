'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useI18n } from './I18nProvider';

/**
 * 左侧那几个 tab。`href` 同时是**路由**和**高亮依据** —— 加了新页就往这里加一条。
 *
 * 四条的顺序＝日常使用频率：游戏列表（默认页）→ 开发商库 → 留言本 → 用户。
 * 开发商（2026-10-12 加的「厂商库」）排在留言本前面，因为它和游戏列表是**同一件事的两半**：
 * 添加游戏时那个开发商下拉框，读的就是这个库里新建的条目。
 * 用户（2026-10-13 加）排最后 —— 它是**低频**的运营页（看一眼有没有刷屏的号），
 * 和上面三条「日常维护内容」不是一路。
 */
const TABS = [
  { href: '/admin/games', key: 'admin.nav.games' },
  { href: '/admin/developers', key: 'admin.nav.developers' },
  { href: '/admin/feedback', key: 'admin.nav.feedback' },
  { href: '/admin/users', key: 'admin.nav.users' },
] as const;

/**
 * 后台外壳：顶栏（标题 / 当前用户 / 退出登录）+ 左侧 tab 栏 + 右侧内容。
 *
 * **鉴权不在这里**，在 `app/admin/(panel)/layout.tsx`（服务端，读 cookie）。
 * 这一层只负责长相与跳转，所以能安心当客户端组件用 `usePathname` 点高亮。
 *
 * 为什么要拆成「外壳 + 页面」而不是一个组件里切 tab：分成真路由之后，
 * **每个 tab 只拉自己那份数据** —— 进后台默认是游戏列表，留言本那张表要点了才请求。
 * 留言走的是 D1 REST，一次列表 = 一次 API 调用，能少拉一次就少拉一次。
 *
 * 切 tab 走 `<Link>`（客户端导航，不整页刷新），所以两个页面之间切换是即时的。
 */
export default function AdminShell({
  username,
  children,
}: {
  /** 当前登录用户，由服务端 layout 从会话里取出来传下来 */
  username: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch('/api/admin/login', { method: 'DELETE' }).catch(() => undefined);
    router.replace('/admin/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-ink-950 px-6 py-8 text-ink-100">
      {/*
        比原后台（960）宽了一截：左边多出一列 tab，内容区要还回去，
        不然游戏列表那行「年份 · 开发者 · 语言 · 系列」会被挤掉。
      */}
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6">
        <header className="flex items-center gap-3">
          <h1 className="text-[14px] text-ink-200">{t('admin.title')}</h1>
          <span className="text-[11px] text-ink-500">{username}</span>
          <button
            type="button"
            onClick={() => void logout()}
            className="pixel-edge pxw-2 pxc-500 ml-auto bg-ink-800 px-3 py-1.5 text-[11px] text-ink-300 transition-colors hover:text-danger"
          >
            {t('admin.logout')}
          </button>
        </header>

        {/* 窄屏就上下堆着（tab 变成一条横排），宽屏才是左栏 + 内容 */}
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <nav className="flex shrink-0 flex-col gap-2 md:w-[132px]">
            {TABS.map((tab) => {
              const active = pathname.startsWith(tab.href);
              return (
                /*
                  高亮靠 `pathname` 现算，不存 state —— 前进 / 后退、直接敲 URL 进来
                  都能对上。`<Link>` 是行内元素，**必须加 `block`** 才能撑满这一列
                  （和项目里 `<button>` 放进普通 div 要加 `block` 是同一个坑）。
                */
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={`pixel-edge pxw-2 pxc-600 block px-3 py-2 text-[11px] transition-colors ${
                    active ? 'bg-accent text-ink-950' : 'bg-ink-800 text-ink-300 hover:text-accent'
                  }`}
                >
                  {t(tab.key)}
                </Link>
              );
            })}
          </nav>

          {/* `min-w-0` 是硬要求：不加的话里面的长标题会把这一列撑破、挤掉左侧 tab */}
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
