import Link from 'next/link';
import type { ReactNode } from 'react';
import { SITE_NAME, translate, type Locale, type MessageKey } from '@/lib/i18n';
import BackLink from './BackLink';

/**
 * 游戏列表 / 详情 / 下载三页共用的**外壳**（页头、返回链接、页脚）。
 *
 * 为什么做成组件：和 `LegalPage` 一模一样的理由 —— 三页只有正文不同，
 * 版式（标题、说明、页脚那一行互链）完全一样，各写一遍迟早漂成三种版式。
 *
 * 这是**服务端组件**（没有 'use client'）：语言在服务端就读好了（见 lib/server/locale.ts），
 * 页面是纯文本 + 链接，不需要任何交互 —— 唯一的客户端交互在下载页那个
 * `RomDownloadGate` 里，它自己带 'use client'。
 *
 * 和房间那一页的关系：这里**不画房间**。那间屋子是给游戏用的（满屏 CSS 场景 + canvas），
 * 而这几页要能被搜索引擎整段读走 —— 一页可索引的正文比一个跑得起来但读不出字的房间
 * 有用得多。共用的是同一套设计令牌（`ink-*` 跟着主题翻转、`accent` 同理、
 * `font-pixel` 同一款字体），所以深浅两色都不违和。
 *
 * ⚠️ 三页都**不写 `export const dynamic`**：它们要读 D1 和语言（cookie），
 * 本来就是动态渲染，再声明一次是多余的（和 app/privacy/page.tsx 同一个理由）。
 */
export default function GamesShell({
  locale,
  label,
  title,
  intro,
  back,
  backToAllHref = '/games',
  showAllGamesLink = true,
  children,
}: {
  locale: Locale;
  /**
   * 左上角那行小标签。**必须全 ASCII** —— `font-pixel`（Press Start 2P）没有中日韩字形，
   * 写中文只会掉到系统字体上，白用这个字体（和 LegalPage 的 `doc.label` 同一条规矩）。
   */
  label: string;
  title: string;
  /** 标题下面那句说明。列表页放「共 N 款」，详情页放机种 / 年份那一行摘要 */
  intro?: string;
  /** 左上角返回。列表页回房间，游戏详情 / 开发商详情页回上一页（history），下载页回详情页 */
  back: { href: string; label: MessageKey; mode?: 'link' | 'history' };
  /**
   * 「全部游戏」那颗**页脚**链接的落点，默认 `/games` 本体。
   * 只给页脚用 —— 左上角返回走的是 `back`，两者是两码事（见返回链接那段注释）。
   */
  backToAllHref?: string;
  /** 页脚那一行是否出现「全部游戏」。列表页自己就是，不必自指 */
  showAllGamesLink?: boolean;
  children: ReactNode;
}) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  return (
    <main className="min-h-screen bg-ink-950 px-6 py-12">
      <div className="mx-auto w-full max-w-5xl">
        {/*
          返回链接**不用 target="_blank"**：这里是内容页，点回去就是页面之间正常跳转，
          当前标签页往前走一步最自然（房间那侧才是新标签 —— 从房间点过来时，
          正在跑的游戏不该被顶掉，见 ConsoleScene 右上角那行链接的注释）。

          两种「返回」由 `back.mode` 区分：
          - `link`（默认）：真跳转到 `back.href`。列表页回房间、下载页回详情页都用它。
          - `history`：走**浏览器回退**（`BackLink`）—— 游戏详情页左上那条「← 全部游戏」与
            开发商详情页左上那颗「返回」用它，于是从 `/games?q=…&page=…` 或 `/developers`
            点进来的人，返回的是**来时的那个地址**，而不是裸列表页
            （2026-10-12 用户要求「简单的 back 就行」）。
            `href` 在 history 模式里仍是兜底 / 爬虫 / 中键新标签的落点，通常就是对应列表页。
        */}
        {back.mode === 'history' ? (
          <BackLink
            href={back.href}
            className="inline-flex items-center gap-2 text-[11px] text-ink-400 transition-colors hover:text-accent"
          >
            <span aria-hidden="true">←</span>
            <span>{t(back.label)}</span>
          </BackLink>
        ) : (
          <Link
            href={back.href}
            className="inline-flex items-center gap-2 text-[11px] text-ink-400 transition-colors hover:text-accent"
          >
            <span aria-hidden="true">←</span>
            <span>{t(back.label)}</span>
          </Link>
        )}

        <header className="mt-8 border-b border-ink-800 pb-6">
          <span className="font-pixel text-[10px] tracking-wider text-accent">{label}</span>
          <h1 className="mt-3 text-[22px] leading-snug font-semibold text-ink-100">{title}</h1>
          {intro && <p className="mt-2 text-[13px] leading-6 text-ink-400">{intro}</p>}
        </header>

        {children}

        {/*
          页脚互链。**对爬虫比对人有用**：这几页是靠 sitemap 之外的内链互相发现的，
          一页都不孤立。`/privacy` / `/terms` 也在这里，是因为房间右上角那行链接
          在窄窗口下会整块藏掉 —— 内容页得有一条不依赖房间的路径通到法务两页。
        */}
        <footer className="mt-12 border-t border-ink-800 pt-6">
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px]">
            <Link href="/" className="text-ink-400 transition-colors hover:text-accent">
              {t('gamesPage.backHome')}
            </Link>
            {showAllGamesLink && (
              <Link href={backToAllHref} className="text-ink-400 transition-colors hover:text-accent">
                {t('gamesPage.backToGames')}
              </Link>
            )}
            {/*
              「全部开发商」（2026-10-12 加）。放在这里而不是房间右上角那行 `.top-links`：
              那边是「和移动端那颗盾牌钮互补、任意时刻恰好一个入口」的窄平衡，动它容易碰坏；
              而内容页之间的互相发现本来就靠这个页脚（爬虫也是顺着它走的）。
            */}
            <Link href="/developers" className="text-ink-400 transition-colors hover:text-accent">
              {t('developersPage.backToDevelopers')}
            </Link>
            <Link href="/privacy" className="text-ink-400 transition-colors hover:text-accent">
              {t('legal.privacy')}
            </Link>
            <Link href="/terms" className="text-ink-400 transition-colors hover:text-accent">
              {t('legal.terms')}
            </Link>
          </nav>

          <p className="mt-4 text-[11px] text-ink-600">{SITE_NAME[locale]}</p>
        </footer>
      </div>
    </main>
  );
}
