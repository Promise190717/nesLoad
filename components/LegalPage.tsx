import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { SITE_NAME, localePath, translate, type Locale, type MessageKey } from '@/lib/i18n';
import { SUPPORT_EMAIL, legalDoc, otherLegalKind, type LegalKind } from '@/lib/legal';
import TopBar from './TopBar';

/**
 * 隐私政策 / 服务条款两页的**同一个壳**。
 *
 * 为什么做成组件而不是各写一页：两页只有文案不同，版式（标题、章节、列表、页脚）
 * 完全一样；复制一份迟早会漂成两种版式。
 *
 * 这是**服务端组件**（没有 'use client'）：语言在服务端就读好了，页面是纯静态文本，
 * 不需要任何交互 —— 整个组件里没有一个 state、一个事件处理器。
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
   */
  const updated = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(doc.updated));

  /*
   * 页脚与左上角那几个落点都要带语言前缀，不然中文页点一下就掉回英文。
   *
   * 2026-10-13 起它指的是**那间屋子**（`/room`，原来就是 `/`）—— 这一页左上角那颗和
   * 页脚那颗都是 `legal.back`（「返回游戏屋」），落点得跟着屋子走，所以变量名从
   * `home` 改成了 `room`。首页（`/`）是另一件事，这一页不需要它。
   */
  const room = localePath(locale, '/room');

  return (
    <main className="min-h-screen bg-ink-950 px-6 py-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        {/* 顶栏（2026-10-13 加）：语言切换 / 账号 / 游戏库。版式同 GamesShell，给它一个下边距 */}
        <div className="mb-6">
          <TopBar />
        </div>

        {/*
          左上角回房间。**不用 target="_blank"**：这里是文档页，点回去就是回到游戏，
          当前标签页往前走一步最自然（房间那侧才是新标签 —— 从房间点过来时，
          正在跑的游戏不该被顶掉，见 ConsoleScene 那颗钮的注释）。
        */}
        <Link
          href={room}
          className="inline-flex items-center gap-2 text-[11px] text-ink-400 transition-colors hover:text-accent"
        >
          <span aria-hidden="true">←</span>
          <span>{t('legal.back')}</span>
        </Link>

        <header className="mt-4 border-b border-ink-800 pb-6 sm:mt-8">
          <span className="font-pixel text-[10px] tracking-wider text-accent">{doc.label}</span>
          <h1 className="mt-3 text-[22px] leading-snug font-semibold text-ink-100">{doc.title}</h1>
          <p className="mt-2 text-[13px] leading-6 text-ink-400">{doc.intro}</p>
          <p className="mt-3 text-[11px] text-ink-500">{t('legal.updated', { date: updated })}</p>
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
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px]">
            {/* 两页互链：读完隐私政策顺手就能翻到条款 */}
            <Link
              href={localePath(locale, `/${other}`)}
              className="text-ink-400 transition-colors hover:text-accent"
            >
              {t(other === 'privacy' ? 'legal.privacy' : 'legal.terms')}
            </Link>
            <Link href={room} className="text-ink-400 transition-colors hover:text-accent">
              {t('legal.back')}
            </Link>
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

          <p className="mt-4 text-[11px] text-ink-500">
            {t('legal.contact')}{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-ink-400 transition-colors hover:text-accent">
              {SUPPORT_EMAIL}
            </a>
          </p>

          {/* 站名放最后一行，和页眉那行小标签一起把这两页锚回品牌上 */}
          <p className="mt-2 text-[11px] text-ink-600">{SITE_NAME[locale]}</p>
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
