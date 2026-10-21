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
 * 这几页要能被搜索引擎整段读走 —— 一页可索引的正文比一块跑得起来但读不出字的 canvas
 * 有用得多。设计令牌（`ink-*` 跟着主题翻转、`accent` 同理、`font-pixel` 同一款字体）
 * 和开玩那几页共用，所以深浅两色都不违和。
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
  showHeader = true,
  fill = false,
  wide = false,
  showAllGamesLink = true,
  showTopBar = true,
  showHomeLink = false,
  showTheme = true,
  backNode,
  navExtra,
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
   * **整颗替换**左上角返回的节点（2026-10-15 加）。
   *
   * 为什么：`back` 两种模式都满足不了 `/play` —— 那一页要在「游戏运行中」时
   * 拦一下返回（提示进度不会保存），而拦截逻辑在客户端组件 `PlayBackLink`
   * 里（状态借 `lib/play-leave-guard.ts` 从 `PlayScene` 桥过来）。本组件是
   * 服务端组件接不了 handler，但**可以接一个客户端组件元素**当节点传进来。
   *
   * ⚠️ 目前**只有 `/play` 传**（见 `app/[locale]/play/page.tsx`）。传了之后
   * `back.href` / `back.label` / `back.mode` 只剩兜底语义（backNode 自带落点），
   * 调用方仍要按类型传全。
   */
  backNode?: ReactNode;
  /**
   * 塞在**返回右边、和返回同一行**的一小块（2026-10-19 加）。
   *
   * ⚠️ 目前**只有 `/play` 传**：那一页的「这一款是什么」原本是右栏最上面那张大卡片，
   * 用户要求挪成顶栏里的一条小横条（封面 + 名字 + 机种 / 年份），右栏直接从按键设置开始。
   * 传进来的是一个客户端组件元素（数据在 `StaticPlay` 里，见那边的 `PlayGameInfo`）。
   *
   * 位置：`lg` 以上**按整行水平居中**（脱离流，见下面那行 div 的类）；更窄的窗口里
   * 它和返回挤在同一组、必要时换行。别的页面不传 ⇒ 版式一个字都不变。
   */
  navExtra?: ReactNode;
  /**
   * 「全部游戏」那颗**页脚**链接的落点，默认 `/games` 本体。
   * 只给页脚用 —— 左上角返回走的是 `back`，两者是两码事（见返回链接那段注释）。
   */
  backToAllHref?: string;
  /** 页脚那一行是否出现「全部游戏」。列表页自己就是，不必自指 */
  showAllGamesLink?: boolean;
  /**
   * 中间那块**页头**（`label` 小标签 + `<h1>` 标题 + `intro`）出不出现，默认出。
   *
   * ⚠️ 目前**只有 `/play` 传 `false`**（2026-10-14）：那一页的名字 / 资料摆在右侧
   * 那一列里（封面 + 名字），顶上再来一个大标题就是同一句话说两遍。它自己的
   * `<h1>` 在 `PlayScene` 里（sr-only）—— **所以那一页仍然有 h1**，不是漏写。
   * 传 `false` 时 `label` / `title` / `intro` 都不渲染（调用方仍要按类型传）。
   */
  showHeader?: boolean;
  /**
   * 内容是否要**撑满剩余高度**（默认不要，内容多高就是多高）。
   *
   * ⚠️ 目前**只有 `/play` 传 `true`**（2026-10-14）：那一页中间是固定 4:3 的屏幕，
   * 要「游戏区域吃满剩下的纵向空间、屏幕在里头上下居中、页脚压到视口最底部」——
   * 普通内容页没这个需求，别顺手打开（短页面会把页脚顶到视口底部，观感就变了）。
   *
   * 打开之后：外层 `max-w-5xl` 那一栏变成 `flex-col` + `min-h-[100vh - 上下页边距]`，
   * `children` 套一层 `flex-1`，于是页脚自然落到最底；`children` 自己拿 `flex-1` 撑高。
   */
  fill?: boolean;
  /** 播放页使用更宽的内容区域，让屏幕随浏览器宽度展开。 */
  wide?: boolean;
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
   * （见 `showTopBar`），于是整页只有「返回」一个去处 —— 迷路的人该有一条回首页的路。
   * 别的内容页**不要传**：它们的顶栏里已经有一颗「首页」了，再来一颗就是重复。
   */
  showHomeLink?: boolean;
  /**
   * 顶栏那颗**主题钮**出不出现，默认出（2026-10-19 加）。
   *
   * ⚠️ **只有 `/play` 传 `false`**（见 `StaticPlay`）：那一页右栏的「显示」那一行
   * 已经有一颗同一功能的钮，顶栏再放一颗就是同一件事说两遍。别顺手给别的页面关掉。
   */
  showTheme?: boolean;
  children: ReactNode;
}) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  /*
   * 页脚那几个落点都得**现算**：语言是路径的一部分，写死 `/games` 会把中文用户
   * 送回落成英文的地址。
   *
   * ⚠️ `backToAllHref` 的默认值**不能写在参数解构里** —— 解构默认值在函数体之前
   * 求值，那一刻拿不到 `locale`。所以 `??` 只能挪到这儿。
   */
  const home = localePath(locale, '/');
  const allGames = backToAllHref ?? localePath(locale, '/games');

  /* 左上那颗「返回」：两种模式只差一个组件（回退 / 真链接），样式是同一套 */
  const backClass = wide
    ? 'pixel-edge pxw-1 pxc-600 inline-flex shrink-0 items-center gap-1.5 bg-ink-900 px-2.5 py-1.5 text-[11px] text-ink-200 transition-colors hover:text-accent'
    : 'inline-flex items-center gap-2 text-[12px] text-ink-400 transition-colors hover:text-accent';
  const backLink = backNode ?? (back.mode === 'history' ? (
    <BackLink href={back.href} className={backClass}>
      <span aria-hidden="true">←</span>
      <span>{t(back.label)}</span>
    </BackLink>
  ) : (
    <Link href={back.href} className={backClass}>
      <span aria-hidden="true">←</span>
      <span>{t(back.label)}</span>
    </Link>
  ));

  return (
    <main className={wide ? 'play-page wall min-h-screen px-4 py-5' : 'wall min-h-screen px-6 py-6 sm:py-12'}>
      {/*
        `fill` 打开时这一栏自己也要是个「至少撑满一屏」的 flex 列：
        `min-h` 那两个值就是扣掉 `<main>` 的上下页边距（`py-6` = 3rem、
        `sm:py-12` = 6rem），否则页脚到不了视口最底。
      */}
      <div
        className={`mx-auto w-full ${wide ? 'max-w-none' : 'max-w-5xl'} ${
          fill ? 'flex min-h-[calc(100vh-3rem)] flex-col sm:min-h-[calc(100vh-6rem)]' : ''
        }`}
      >
        {/*
          顶栏（2026-10-13 加）：语言切换 / 账号 / 游戏库。它自己占一行、靠右；
          下面那颗返回链接紧跟着，所以这里给它一个下边距
          （不这么写的话返回会贴到顶栏上，看着像一行里的两块）。
        */}
        {showTopBar && !wide && (
          <div className="mb-6">
            <TopBar showTheme={showTheme} />
          </div>
        )}

        {/*
          返回链接**不用 target="_blank"**：这里是内容页，点回去就是页面之间正常跳转，
          当前标签页往前走一步最自然。

          两种「返回」由 `back.mode` 区分：
          - `history`：走**浏览器回退**（`BackLink`）—— 游戏列表页、游戏详情页、下载页、
            开发商列表页、开发商详情页左上那颗都用它。于是从 `/games?q=…&page=…`
            或从 `/developers` 点进来的人，返回的是**来时的那个地址**，
            而不是一个写死的落点（2026-10-12 用户要求「简单的 back 就行」，
            2026-10-13 两个列表页也并了进来）。`href` 在 history 模式里仍是兜底 / 爬虫 /
            中键新标签的落点，通常是「这一页的家」（列表页 → 首页，详情页 → 列表页）。
          - `link`（默认）：真跳转到 `back.href`。**三个 404 页**用它 —— 404 给一个确定
            去处比回退稳妥（来路本身可能就是个坏地址）。

          ⚠️ 文案上，**`history` 那几处一律用 `common.back`（「返回」）**（2026-10-13 用户
            要求统一）—— 既然行为是回退，就不能写「全部游戏」那种承诺落点的话。
            而 `link` 模式落点是**写死的固定地址**，那里才继续用 `backToGames` /
            `backToDevelopers` / `backHome` 这类具体名字。`back.label` 由调用方传。
        */}
        {/*
          左上角那一行：**返回**在左，可选的**首页**在右（`showHomeLink`，见 props 注释）。
          用 `justify-between` 而不是 `gap`：不传 `showHomeLink` 时只有一个孩子，
          它照样贴左 —— 别的内容页版式一个字都不变。

          `navExtra`（`/play` 那条资料横条）在**窄屏**下和返回挤在同一组里（宽度不够时
          这一行本来就要换行）；到 `lg` 以上它**脱离流、按整行水平居中**（用户要求
          「顶部居中显示」）—— 用绝对定位而不是 `justify-between` 或三栏网格：
          前者只有在左右两块一样宽时才看着居中，后者在窄窗口会把右上那排入口挤烂。
          盖住的余地留了 `max-w-[42%]`，超长名字自己截断。
          不传 `navExtra` 时仍然直接渲染返回本身，DOM 结构一层都不多。
        */}
        <div className={wide ? 'play-navigation relative mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-ink-700 pb-4' : 'flex items-center justify-between gap-4'}>
          {navExtra ? (
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              {backLink}
              <div className="flex min-w-0 items-center lg:absolute lg:top-0 lg:bottom-4 lg:left-1/2 lg:w-fit lg:max-w-[42%] lg:-translate-x-1/2">
                {navExtra}
              </div>
            </div>
          ) : (
            backLink
          )}

          {showHomeLink && (
            <Link href={home} className="text-[12px] text-ink-400 transition-colors hover:text-accent">
              {t('common.home')}
            </Link>
          )}
          {wide && showTopBar && <TopBar showTheme={showTheme} />}
        </div>

        {showHeader && (
          <header className="mt-4 border-b border-ink-800 pb-6 sm:mt-8">
            <span className="font-pixel text-[12px] tracking-wider text-accent">{label}</span>
            <h1 className="mt-3 text-[22px] leading-snug font-semibold text-ink-100">{title}</h1>
            {intro && <p className="mt-2 text-[13px] leading-6 text-ink-400">{intro}</p>}
          </header>
        )}

        {/* `fill` 时套一层 `flex-1`：页脚被顶到最底，内容自己吃满剩下的高度 */}
        {fill ? <div className="flex flex-1 flex-col">{children}</div> : children}

        {/*
          页脚互链。**对爬虫比对人有用**：这几页是靠 sitemap 之外的内链互相发现的，
          一页都不孤立。`/privacy` / `/terms` 也在这里，是因为顶栏那行链接
          在窄窗口下会整块藏掉 —— 内容页得有一条不依赖顶栏的路径通到法务两页。
        */}
        <footer className="mt-12 border-t border-ink-800 pt-6">
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
            <Link href={home} className="text-ink-400 transition-colors hover:text-accent">
              {t('common.home')}
            </Link>
            {showAllGamesLink && (
              <Link href={allGames} className="text-ink-400 transition-colors hover:text-accent">
                {t('gamesPage.backToGames')}
              </Link>
            )}
            {/*
              「全部开发商」（2026-10-12 加）。放在这里而不是顶栏那行 `.top-links`：
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
