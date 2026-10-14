import Link from 'next/link';
import type { ReactNode } from 'react';
import { SITE_NAME, localePath, translate, type Locale, type MessageKey } from '@/lib/i18n';
import BackLink from './BackLink';
import TopBar from './TopBar';

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
  backToAllHref,
  showAllGamesLink = true,
  showTopBar = true,
  showHomeLink = false,
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
  /**
   * 左上角返回。
   *
   * `history` = 走浏览器回退，文案一律 `common.back`（「返回」）：**游戏列表 / 详情 /
   * 下载 / 开发商列表 / 开发商详情**（2026-10-13 开发商列表页也并了进来）。
   * `link` = 真跳到一个写死的地址，文案用具体名字：**三个 404 页**。
   */
  back: { href: string; label: MessageKey; mode?: 'link' | 'history' };
  /**
   * 「全部游戏」那颗**页脚**链接的落点，默认 `/games` 本体。
   * 只给页脚用 —— 左上角返回走的是 `back`，两者是两码事（见返回链接那段注释）。
   */
  backToAllHref?: string;
  /** 页脚那一行是否出现「全部游戏」。列表页自己就是，不必自指 */
  showAllGamesLink?: boolean;
  /**
   * 顶部那行**顶栏**（语言 / 账号 / 游戏库，2026-10-13 加）出不出现，默认出。
   *
   * ⚠️ **三个 404 页要显式传 `false`**（`app/not-found.tsx`、
   * `app/[locale]/games/[id]/not-found.tsx`、`app/[locale]/developers/[id]/not-found.tsx`）
   * —— 用户明确要求 404 不带顶栏：这一页的活是「给一个确定去处」，
   * 铺一排入口只会把人留在原地。加新调用方时先想清楚它是不是 404。
   */
  showTopBar?: boolean;
  /**
   * 左上角那一行**右边**要不要多一颗「首页」（`common.home` → `/`），默认不要。
   *
   * ⚠️ **只有三个 404 页传 `true`**（2026-10-13 用户要求）：那几页刻意不挂顶栏
   * （见 `showTopBar`），于是整页只有「回房间」一个去处 —— 迷路的人该有一条回首页的路。
   * 别的内容页**不要传**：它们的顶栏里已经有一颗「首页」了，再来一颗就是重复。
   */
  showHomeLink?: boolean;
  children: ReactNode;
}) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  /*
   * 页脚那几个落点都得**现算**：语言是路径的一部分，写死 `/games` 会把中文用户
   * 从页脚送回英文房。
   *
   * 2026-10-13 拆首页之后这里多了一层：`room` 是那间屋子（`/room` —— 2026-10-13
   * 之前它就是 `/`），`home` 才是落地页（`/`）。页脚两个都要有：一颗「首页」回落地页、
   * 一颗「回到房间」进屋，这是两件事。
   *
   * ⚠️ `backToAllHref` 的默认值**不能写在参数解构里** —— 解构默认值在函数体之前
   * 求值，那一刻拿不到 `locale`。所以 `??` 只能挪到这儿。
   */
  const home = localePath(locale, '/');
  const room = localePath(locale, '/room');
  const allGames = backToAllHref ?? localePath(locale, '/games');

  return (
    <main className="wall min-h-screen px-6 py-6 sm:py-12">
      <div className="mx-auto w-full max-w-5xl">
        {/*
          顶栏（2026-10-13 加）：语言切换 / 账号 / 游戏库，**和房间右上角那一行同一个口径**。
          它自己占一行、靠右；下面那颗返回链接紧跟着，所以这里给它一个下边距
          （不这么写的话返回会贴到顶栏上，看着像一行里的两块）。
        */}
        {showTopBar && (
          <div className="mb-6">
            <TopBar />
          </div>
        )}

        {/*
          返回链接**不用 target="_blank"**：这里是内容页，点回去就是页面之间正常跳转，
          当前标签页往前走一步最自然（房间那侧才是新标签 —— 从房间点过来时，
          正在跑的游戏不该被顶掉，见 ConsoleScene 右上角那行链接的注释）。

          两种「返回」由 `back.mode` 区分：
          - `history`：走**浏览器回退**（`BackLink`）—— 游戏列表页、游戏详情页、下载页、
            开发商列表页、开发商详情页左上那颗都用它。于是从房间那颗「游戏列表」、从
            `/games?q=…&page=…`、或从 `/developers` 点进来的人，返回的是**来时的那个地址**，
            而不是一个写死的落点（2026-10-12 用户要求「简单的 back 就行」，
            2026-10-13 两个列表页也并了进来）。`href` 在 history 模式里仍是兜底 / 爬虫 /
            中键新标签的落点，通常是「这一页的家」（列表页 → `/room` 那间屋子，详情页 → 列表页）。
          - `link`（默认）：真跳转到 `back.href`。**三个 404 页**用它 —— 404 给一个确定
            去处比回退稳妥（来路本身可能就是个坏地址）。

          ⚠️ 文案上，**`history` 那几处一律用 `common.back`（「返回」）**（2026-10-13 用户
            要求统一）—— 既然行为是回退，就不能写「全部游戏」「回到房间」那种承诺落点的话。
            而 `link` 模式落点是**写死的固定地址**，那里才继续用 `backToGames` /
            `backToDevelopers` / `backHome` 这类具体名字。`back.label` 由调用方传。
        */}
        {/*
          左上角那一行：**返回**在左，可选的**首页**在右（`showHomeLink`，见 props 注释）。
          用 `justify-between` 而不是 `gap`：不传 `showHomeLink` 时只有一个孩子，
          它照样贴左 —— 别的内容页版式一个字都不变。
        */}
        <div className="flex items-center justify-between gap-4">
          {back.mode === 'history' ? (
            <BackLink
              href={back.href}
              className="inline-flex items-center gap-2 text-[12px] text-ink-400 transition-colors hover:text-accent"
            >
              <span aria-hidden="true">←</span>
              <span>{t(back.label)}</span>
            </BackLink>
          ) : (
            <Link
              href={back.href}
              className="inline-flex items-center gap-2 text-[12px] text-ink-400 transition-colors hover:text-accent"
            >
              <span aria-hidden="true">←</span>
              <span>{t(back.label)}</span>
            </Link>
          )}

          {showHomeLink && (
            <Link href={home} className="text-[12px] text-ink-400 transition-colors hover:text-accent">
              {t('common.home')}
            </Link>
          )}
        </div>

        <header className="mt-4 border-b border-ink-800 pb-6 sm:mt-8">
          <span className="font-pixel text-[12px] tracking-wider text-accent">{label}</span>
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
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
            <Link href={home} className="text-ink-400 transition-colors hover:text-accent">
              {t('common.home')}
            </Link>
            <Link href={room} className="text-ink-400 transition-colors hover:text-accent">
              {t('gamesPage.backHome')}
            </Link>
            {showAllGamesLink && (
              <Link href={allGames} className="text-ink-400 transition-colors hover:text-accent">
                {t('gamesPage.backToGames')}
              </Link>
            )}
            {/*
              「全部开发商」（2026-10-12 加）。放在这里而不是房间右上角那行 `.top-links`：
              那边是「和移动端那颗盾牌钮互补、任意时刻恰好一个入口」的窄平衡，动它容易碰坏；
              而内容页之间的互相发现本来就靠这个页脚（爬虫也是顺着它走的）。
            */}
            <Link
              href={localePath(locale, '/developers')}
              className="text-ink-400 transition-colors hover:text-accent"
            >
              {t('developersPage.backToDevelopers')}
            </Link>
            {/*
              「全部机种」（2026-10-14 加）。和上面那条「全部开发商」同一个角色：
              机种专题页（`/consoles/<type>`）靠这条内链被爬虫从每个内容页上发现。
            */}
            <Link
              href={localePath(locale, '/consoles')}
              className="text-ink-400 transition-colors hover:text-accent"
            >
              {t('consolesPage.backToConsoles')}
            </Link>
            <Link
              href={localePath(locale, '/privacy')}
              className="text-ink-400 transition-colors hover:text-accent"
            >
              {t('legal.privacy')}
            </Link>
            <Link
              href={localePath(locale, '/terms')}
              className="text-ink-400 transition-colors hover:text-accent"
            >
              {t('legal.terms')}
            </Link>
          </nav>

          <p className="mt-4 text-[12px] text-ink-600">{SITE_NAME[locale]}</p>
        </footer>
      </div>
    </main>
  );
}
