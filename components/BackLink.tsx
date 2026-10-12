'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * 一颗「长得像链接、点下去却是浏览器回退」的返回控件。
 *
 * 为什么不用普通 `<Link>`：详情页左上那条「← 全部游戏」要**回到用户来时的那个列表**。
 * 用户可能是从 `/games?q=马里奥&page=3` 点进来的 —— 这时「回列表」应该回**那个带参数的
 * 地址**，而不是裸的 `/games`。这只有 `router.back()` 做得到（普通链接不知道来路）。
 *
 * 为什么不用 `<button onClick={back}>`、偏要套一层 `<a href>`：保留**真链接**这个骨架。
 * 爬虫 / 中键 / 右键新标签 / 复制地址，都还当它是一颗到 `href` 的普通链接 —— 只有
 * 「普通左键点击」才被接管成回退。内容页要能被整段读走，返回也得是可达的链接。
 *
 * 兜底：**直接打开这一页**（从分享链接、或爬虫）时 history 里没有上一站，
 * `router.back()` 会跳出站点或没反应，所以 `history.length <= 1` 就退成 `router.push(href)`。
 */
export default function BackLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();

  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        // 只接管「普通左键、无修饰键」这一种：中键 / ctrl+click / 右键要的是原生新标签行为
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        ) {
          return;
        }
        e.preventDefault();
        if (window.history.length > 1) router.back();
        else router.push(href);
      }}
    >
      {children}
    </Link>
  );
}
