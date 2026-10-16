'use client';

import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { SITE_NAME, dateLocale, localePath, translate, type Locale, type MessageKey } from '@/lib/i18n';
import { SUPPORT_EMAIL, legalDoc, otherLegalKind, type LegalKind } from '@/lib/legal';
import BackLink from './BackLink';
import TopBar from './TopBar';

/**
 * 隐私政策 / 服务条款两页的**同一个壳**。
 *
 * 为什么做成组件而不是各写一页：两页只有文案不同，版式（标题、章节、列表、页脚）
 * 完全一样；复制一份迟早会漂成两种版式。
 *
 * ⚠️ 2026-10-14 起它是**客户端组件**（`'use client'`）。原先这里是服务端组件，
 * 因为整页没有 state、没有事件处理器 —— 但左上角那颗钮改成了**浏览器回退**
 * （用户要求：「返回」就是返回上一页），回退只有 `useRouter` 做得到。
 * 语言仍是服务端决定的（`locale` 由页面当 prop 传进来），所以加这一行**不会**
 * 让语言闪一下；真正被推进客户端的只是这一页的静态文本。
 *
 * 和房间那一页的关系：这里**不画房间**。那间屋子是给游戏用的（满屏 CSS 场景 + canvas），
 * 把长文塞进去既难读又拖慢首屏。这两页只共用同一套设计令牌（`ink-*` 会跟着主题翻转、
 * `accent` 同理、`font-pixel` 是同一款字体），所以深浅两色都不违和，
 * 但它就是一张**文档**。
 *
 * ⚠️ `font-pixel` 那行小标签（`doc.label`）**两语言都是英文** ——
 * Press Start 2P 没有中日韩字形，写中文只会掉到系统字体上，那就白用了。
 * 真正的标题（h1）和正文一律走系统字体，这是给人读的东西（和键位说明同一个理由）。
 */
export default function LegalPage({ kind, locale }: { kind: LegalKind; locale: Locale }) {
  const doc = legalDoc(kind, locale);
  const other = otherLegalKind(kind);
  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  /*
   * 日期按语言格式化。刻意**不复用 lib/i18n.ts 的 `formatTime`** —— 那个是存档 /
   * 历史列表用的，带小时分钟（「2026/10/08 16:21」），法务页只要年月日。
   * ⚠️ 但语言标签要走 `dateLocale()`（同一份映射），别在这里再写一个三元表达式 ——
   *    那种写法 2026-10-16 加日韩时就会漏掉新语言。
   */
  const updated = new Intl.DateTimeFormat(dateLocale(locale), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(doc.updated));

  /*
   * 这个常量是 `/room`（那间屋子，2026-10-13 之前它就是 `/`），**不是**落地页 `/`。
   *
   * 历史：2026-10-13 页脚那颗「返回游戏屋」走的是它，所以变量名从 `home` 改成了
   * `room`；2026-10-14 左上角那颗钮改走 `BackLink`（浏览器回退）之后，它只剩兜底用途。
   *
   * ⚠️ 2026-10-15 页脚那颗也删了（用户要求「其他页面底部的回到房间也去除」），
   *    于是它现在**唯一的用途**就是下面那颗 `BackLink` 的兜底 `href`：直接打开这一页
   *    （分享链接 / 爬虫）时 history 里没有上一站，退到 `/room`。
   *    页脚那几个落点仍要带语言前缀 —— 不带的话中文页点一下就掉回英文。
   */
  const room = localePath(locale, '/room');

  return (
    <main className="wall min-h-screen px-6 py-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        {/* 顶栏（2026-10-13 加）：语言切换 / 账号 / 游戏库。版式同 GamesShell，给它一个下边距 */}
        <div className="mb-6">
          <TopBar />
        </div>

        {/*
          左上角「返回」（2026-10-14 改）。**行为是浏览器回退**，不是跳固定地址 ——
          用户要的就是「返回上一页」：从房间那行链接进来就回房间，从下一页进来就回下一页。

          用的就是内容页左上那颗同一套 `BackLink`（`/games`、详情页、开发商页左边都是它）：
          外壳仍是 `<a href>` 的**真链接**骨架，只有普通左键点击被接管成 `router.back()`，
          中键 / ctrl+click / 爬虫照样当它是一条到 `room` 的链接 —— 法务页要能被整段读走，
          返回也得是可达的。文案跟着行为走，用 `common.back`（「返回」）而不是
          「返回游戏屋」：回退不承诺落点，别写一个承诺。

          **不用 target="_blank"**：这里是文档页，点回去就是回到上一站，当前标签页往前走一步
          最自然（房间那侧才是新标签 —— 从房间点过来时，正在跑的游戏不该被顶掉，
          见 ConsoleScene 那颗钮的注释）。
        */}
        <BackLink
          href={room}
          className="inline-flex items-center gap-2 text-[12px] text-ink-400 transition-colors hover:text-accent"
        >
          <span aria-hidden="true">←</span>
          <span>{t('common.back')}</span>
        </BackLink>

        <header className="mt-4 border-b border-ink-800 pb-6 sm:mt-8">
          <span className="font-pixel text-[12px] tracking-wider text-accent">{doc.label}</span>
          <h1 className="mt-3 text-[22px] leading-snug font-semibold text-ink-100">{doc.title}</h1>
          <p className="mt-2 text-[13px] leading-6 text-ink-400">{doc.intro}</p>
          <p className="mt-3 text-[12px] text-ink-500">{t('legal.updated', { date: updated })}</p>
        </header>

        <article>
          {doc.sections.map((section) => (
            <section key={section.heading} className="mt-8">
              <h2 className="text-[13px] font-semibold text-accent">{section.heading}</h2>

              {section.body?.map((paragraph, index) => (
                <p key={index} className="mt-3 text-[13px] leading-7 text-ink-300">
                  {renderInline(paragraph)}
                </p>
              ))}

              {section.bullets && (
                <ul className="mt-3 space-y-2">
                  {section.bullets.map((item, index) => (
                    <li key={index} className="flex gap-2 text-[13px] leading-7 text-ink-300">
                      {/* 用方块而不是 `list-disc`：整站没有圆点，方点才是像素风的标点 */}
                      <span aria-hidden="true" className="mt-[9px] h-1 w-1 shrink-0 bg-ink-500" />
                      <span className="min-w-0">{renderInline(item)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>

        <footer className="mt-12 border-t border-ink-800 pt-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
            {/* 两页互链：读完隐私政策顺手就能翻到条款 */}
            <Link
              href={localePath(locale, `/${other}`)}
              className="text-ink-400 transition-colors hover:text-accent"
            >
              {t(other === 'privacy' ? 'legal.privacy' : 'legal.terms')}
            </Link>
            {/*
              ⚠️ 2026-10-15：**页脚这颗「返回游戏屋」删了**（用户要求「其他页面底部的
              回到房间也去除」）—— 内容页页脚那颗同一天也删了（见 GamesShell）。
              这一页现在页脚只剩「隐私 ↔ 条款」互链和「游戏列表」。

              `room` 这个常量**留着**：左上角那颗 `BackLink` 的兜底 `href` 还在用它
              （直接打开这一页时 history 里没有上一站，退到 `/room`，见上面那段注释）。
              `gamesPage.backHome` 这个键也留着 —— 404 页正文下那颗钮还在用。
            */}
            {/*
              游戏列表也放一条。**这一条主要是给爬虫的**：房间右上角那一行
              （游戏列表 / 隐私政策 / 服务条款）在移动端是 `display: none`
              （见 globals.css），而搜索引擎用的是**移动优先索引** ——
              光靠那一行，`/games` 在爬虫眼里可能一条内链都没有。
              法务两页本身在 sitemap 里，于是这里就成了一条「总会被爬到」的入口。
            */}
            <Link
              href={localePath(locale, '/games')}
              className="text-ink-400 transition-colors hover:text-accent"
            >
              {t('topLinks.games')}
            </Link>
          </div>

          <p className="mt-4 text-[12px] text-ink-500">
            {t('legal.contact')}{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-ink-400 transition-colors hover:text-accent">
              {SUPPORT_EMAIL}
            </a>
          </p>

          {/* 站名放最后一行，和页眉那行小标签一起把这两页锚回品牌上 */}
          <p className="mt-2 text-[12px] text-ink-600">{SITE_NAME[locale]}</p>
        </footer>
      </div>
    </main>
  );
}

/**
 * 极简的行内标记：`**粗体**` 和 `` `代码` ``。
 *
 * 为什么不用 markdown 库：文案里只用到这两种标记（强调某个「不拥有 / 不收集」，
 * 以及 cookie 名 / 域名这类代码标识），引一个解析器 + 消毒器不值当。
 *
 * 为什么用**元素**而不是 `dangerouslySetInnerHTML`：内容是自家写死的文案，
 * 本来就没有注入风险，但拼 HTML 串这件事一旦被后人复制到别处就会变成坑；
 * 拆成 React 元素则从头到尾没有字符串拼 HTML 这一步。
 *
 * 段落里没有标记时返回的是原样的纯文本（切成一个 Fragment），渲染结果不变。
 */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];

  // 先切粗体，再在剩下的片段里切行内代码 —— 两种标记不嵌套，所以顺序无所谓
  text.split(/(\*\*[^*]+\*\*)/g).forEach((chunk, chunkIndex) => {
    if (chunk.length > 4 && chunk.startsWith('**') && chunk.endsWith('**')) {
      nodes.push(
        <strong key={`b${chunkIndex}`} className="font-semibold text-ink-100">
          {chunk.slice(2, -2)}
        </strong>
      );
      return;
    }

    chunk.split(/(`[^`]+`)/g).forEach((piece, pieceIndex) => {
      if (piece.length > 2 && piece.startsWith('`') && piece.endsWith('`')) {
        nodes.push(
          <code
            key={`c${chunkIndex}-${pieceIndex}`}
            className="bg-ink-900 px-1 py-0.5 font-mono text-[12px] text-ink-200"
          >
            {piece.slice(1, -1)}
          </code>
        );
        return;
      }
      if (piece) nodes.push(<Fragment key={`t${chunkIndex}-${pieceIndex}`}>{piece}</Fragment>);
    });
  });

  return nodes;
}
