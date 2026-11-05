'use client';

import { useRouter } from 'next/navigation';
import { useTransition, type MouseEvent } from 'react';
import { translate, type Locale } from '@/lib/i18n';

/**
 * 列表页的翻页条（2026-11-05 从 `/games` 与 `/consoles/[id]` 里各抄一份的版本合并出来）。
 *
 * ## 为什么是客户端组件
 *
 * 用户要求「翻页不要再整页刷新」。原来那两颗是 `next/link`：**理论上**就是软导航，
 * 但这些页面全是 ISR，一次软导航要等服务端吐 flight，中间**界面上什么都不会变** ——
 * 点下去像是没反应，然后整块内容突然换掉，观感上就是「刷新了一次」。
 *
 * 所以这里做两件事：
 *   1. 用 `router.push` 显式走客户端路由（不依赖 `<Link>` 的预取/回退行为）；
 *   2. **用 `useTransition` 把等待期显示出来**（`aria-busy` + 整条变暗 + 禁止连点）。
 *      这是「看起来没反应」的唯一解法 —— 快慢取决于服务端，但至少点下去立刻有反馈。
 *
 * ## 为什么是 `<a>` 而不是 `<Link>`
 *
 * `router.push` 在客户端路由失败时（比如 flight 拿不到）**不会**像 `<Link>` 那样退回
 * 整页加载，用户就卡在原地。所以保留 `<a href>`：
 *   · 普通左键 → 拦下来走 `router.push`（SPA）；
 *   · 中键 / Ctrl 点 / 右键新标签 → 浏览器自己处理，仍是真链接；
 *   · 关掉 JS → 真链接，整页加载也能用；
 *   · 爬虫 → 顺着 `href` 走，`rel=prev/next` 也还在。
 *
 * ⚠️ **首页那颗「上一页」整块不画**（渲染成灰字），不是渲染成灰按钮：指向自己的死链
 *    比少一个链接更糟（和改这个组件之前的行为一致）。
 * ⚠️ 页码 `/` 里那对数字**不进文案表**（全站规矩，见 README 的多语言那条）。
 */
export default function Pager({
  locale,
  page,
  pageCount,
  prevHref,
  nextHref,
}: {
  locale: Locale;
  page: number;
  pageCount: number;
  /** 上一页地址；`null` = 已经是第一页（那颗不画成链接） */
  prevHref: string | null;
  /** 下一页地址；`null` = 已经是最后一页 */
  nextHref: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const go = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    /*
     * 只拦「普通左键点链接」。别的组合（Ctrl / Cmd / Shift / Alt、中键、右键菜单）
     * 是用户明确想在新标签打开，交给浏览器 —— 拦下来等于把人家的习惯弄坏。
     */
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    startTransition(() => router.push(href));
  };

  const buttonClass =
    'pixel-edge pxw-2 pxc-500 bg-ink-800 px-3 py-1.5 text-[12px] text-ink-200 transition-colors hover:text-accent';

  /*
   * 到头的那个方向画成**灰字**而不是灰按钮（见文件头那条）。
   * 颜色用 `ink-500` 而不是 `ink-700`（2026-11-05）：后者在浅色下是 #cacaca 压 #f7f7f7
   * （约 1.4:1）、深色下 #3b3b3b 压 #121212（1.9:1），读起来像「这里缺了一块」，
   * 而不是「这颗暂时不能用」。500 仍然明显弱于可点的那颗（ink-200）。
   */
  return (
    <nav
      aria-busy={pending || undefined}
      /* 等 flight 期间整条变暗并挡住连点：连点两下会排两次导航，第二下通常还落在同一页 */
      className={`mt-10 flex items-center justify-center gap-4 transition-opacity ${
        pending ? 'pointer-events-none opacity-60' : ''
      }`}
    >
      {prevHref ? (
        <a href={prevHref} rel="prev" onClick={(event) => go(event, prevHref)} className={buttonClass}>
          {translate(locale, 'gamesPage.prev')}
        </a>
      ) : (
        <span className="px-3 py-1.5 text-[12px] text-ink-500">
          {translate(locale, 'gamesPage.prev')}
        </span>
      )}

      <span className="font-pixel text-[12px] text-ink-500">
        {page} / {pageCount}
      </span>

      {nextHref ? (
        <a href={nextHref} rel="next" onClick={(event) => go(event, nextHref)} className={buttonClass}>
          {translate(locale, 'gamesPage.next')}
        </a>
      ) : (
        <span className="px-3 py-1.5 text-[12px] text-ink-500">
          {translate(locale, 'gamesPage.next')}
        </span>
      )}
    </nav>
  );
}
