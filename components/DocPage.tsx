'use client';

import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { SITE_NAME, dateLocale, localePath, translate, type Locale, type MessageKey } from '@/lib/i18n';
import { SUPPORT_EMAIL } from '@/lib/legal';
import { siteDoc } from '@/lib/site-doc';
import BackLink from './BackLink';
import Disclaimer from './Disclaimer';
import TopBar from './TopBar';

/**
 * 文档页的**同一个壳**：隐私政策 / 服务条款 / 关于我们 / 联系我们。
 *
 * 2026-11-03 由 `components/LegalPage.tsx` 改名而来 —— 加了关于与联系两页之后，
 * 这个壳服务的不再只是法务文档，名字跟着行为走。**版式一个字没动**，只把
 * 「取哪篇文案」从组件内部（`legalDoc(kind)`）提到了外面（`doc` prop）。
 * 四页只有文案不同，版式（标题、章节、列表、页脚）完全一样；
 * 复制一份迟早会漂成两种版式，那正是当初做成组件的原因。
 *
 * ⚠️ 它是**客户端组件**（`'use client'`）。原先这里是服务端组件，
 * 因为整页没有 state、没有事件处理器 —— 但左上角那颗钮改成了**浏览器回退**
 * （用户要求：「返回」就是返回上一页），回退只有 `useRouter` 做得到。
 * 语言仍是服务端决定的（`locale` 由页面当 prop 传进来），所以加这一行**不会**
 * 让语言闪一下；真正被推进客户端的只是这一页的静态文本。
 *
 * 这几页和开玩那两页的关系：这里**不画场景**，那套视觉是给游戏用的（满屏 CSS + canvas），
 * 把长文塞进去既难读又拖慢首屏。这几页只共用同一套设计令牌（`ink-*` 会跟着主题翻转、
 * `accent` 同理、`font-pixel` 是同一款字体），所以深浅两色都不违和，
 * 但它就是一张**文档**。
 *
 * ⚠️ `font-pixel` 那行小标签（`doc.label`）**全语言都是英文** ——
 * Press Start 2P 没有中日韩字形，写中文只会掉到系统字体上，那就白用了。
 * 真正的标题（h1）和正文一律走系统字体，这是给人读的东西（和键位说明同一个理由）。
 */
export interface DocContent {
  /** font-pixel 小标签，必须全 ASCII。 */
  label: string;
  title: string;
  summary: string;
  intro: string;
  /** ISO 日期。站务说明页没有这一行，法务两页有。 */
  updated?: string;
  sections: { heading: string; body?: string[]; bullets?: string[] }[];
}

export default function DocPage({
  doc,
  locale,
  current,
}: {
  doc: DocContent;
  locale: Locale;
  /**
   * 当前页的**无语言前缀路径**（`/privacy` `/terms` `/about` `/contact`）。
   *
   * 只用来把「本页自己」从页脚那排互链里滤掉 —— 文档页的页脚是这些页之间
   * 互相被发现的唯一通道（顶栏那行在窄窗口下整块藏掉），所以它要列全，
   * 唯独不该出现一条指向当前页的链接。
   */
  current: string;
}) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  /*
   * 日期按语言格式化。刻意**不复用 lib/i18n.ts 的 `formatTime`** —— 那个是存档 /
   * 历史列表用的，带小时分钟（「2026/10/08 16:21」），法务页只要年月日。
   * ⚠️ 但语言标签要走 `dateLocale()`（同一份映射），别在这里再写一个三元表达式 ——
   *    那种写法 2026-10-16 加日韩时就会漏掉新语言。
   */
  const updated = doc.updated
    ? new Intl.DateTimeFormat(dateLocale(locale), {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(new Date(doc.updated))
    : null;

  /*
   * 左上角那颗 `BackLink` 的兜底 `href`：直接打开这一页（分享链接 / 爬虫）时
   * history 里没有上一站，退到首页。页脚那几个落点仍要带语言前缀 ——
   * 不带的话中文页点一下就掉回英文。
   */
  const home = localePath(locale, '/');

  /*
   * 页脚那一排互链。**对爬虫比对人有用**：这几页在 sitemap 之外就是靠它互相发现的，
   * 顶栏那行链接在窄窗口下是 `display: none`（见 globals.css），而搜索引擎用移动优先索引。
   *
   * 「关于我们 / 联系我们」的文字直接取各自的 `doc.title`，不再往 `lib/i18n.ts` 里
   * 加两个键 —— 这两页的正文本身就按 18 种语言写好了（`lib/site-doc.ts`），
   * 链接文字跟着正文的语言走才对得上；而那 18 张文案表为了两个导航词各加一条，
   * 收益远小于维护成本。
   */
  const links = [
    { href: localePath(locale, '/games'), label: t('topLinks.games') },
    { href: localePath(locale, '/about'), label: siteDoc('about', locale).title },
    { href: localePath(locale, '/contact'), label: siteDoc('contact', locale).title },
    { href: localePath(locale, '/privacy'), label: t('legal.privacy') },
    { href: localePath(locale, '/terms'), label: t('legal.terms') },
  ].filter((link) => link.href !== localePath(locale, current));

  return (
    <main className="wall min-h-screen px-6 py-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        {/* 顶栏：语言切换 / 账号 / 游戏库。版式同 GamesShell，给它一个下边距 */}
        <div className="mb-6">
          <TopBar />
        </div>

        {/*
          左上角「返回」。**行为是浏览器回退**，不是跳固定地址 ——
          用户要的就是「返回上一页」：从哪一页进来就回哪一页。

          用的就是内容页左上那颗同一套 `BackLink`（`/games`、详情页、开发商页左边都是它）：
          外壳仍是 `<a href>` 的**真链接**骨架，只有普通左键点击被接管成 `router.back()`，
          中键 / ctrl+click / 爬虫照样当它是一条到首页的链接 —— 法务页要能被整段读走，
          返回也得是可达的。文案跟着行为走，用 `common.back`（「返回」）而不是
          写死某个落点：回退不承诺落点，别写一个承诺。

          **不用 target="_blank"**：这里是文档页，点回去就是回到上一站，当前标签页往前走一步
          最自然。
        */}
        <BackLink
          href={home}
          className="inline-flex items-center gap-2 text-[12px] text-ink-400 transition-colors hover:text-accent"
        >
          <span aria-hidden="true">←</span>
          <span>{t('common.back')}</span>
        </BackLink>

        <header className="mt-4 border-b border-ink-800 pb-6 sm:mt-8">
          <span className="font-pixel text-[12px] tracking-wider text-accent">{doc.label}</span>
          <h1 className="mt-3 text-[22px] leading-snug font-semibold text-ink-100">{doc.title}</h1>
          <p className="mt-2 text-[13px] leading-6 text-ink-400">{doc.intro}</p>
          {updated && <p className="mt-3 text-[12px] text-ink-500">{t('legal.updated', { date: updated })}</p>}
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
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-ink-400 transition-colors hover:text-accent"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/*
            「联系我们：邮箱」这一行。`/contact` 自己就是联系页，页脚再列一遍是重复，
            所以那一页跳过（页脚的其它落点照旧）。
          */}
          {current !== '/contact' && (
            <p className="mt-4 text-[12px] text-ink-500">
              {t('legal.contact')}{' '}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-ink-400 transition-colors hover:text-accent"
              >
                {SUPPORT_EMAIL}
              </a>
            </p>
          )}

          {/* 站名，把这页锚回品牌上 */}
          <p className="mt-2 text-[12px] text-ink-600">{SITE_NAME[locale]}</p>

          {/* 免责声明（2026-11-03 加）：全站页脚同一句，文案的唯一出处是 lib/site-doc.ts */}
          <Disclaimer locale={locale} />
        </footer>
      </div>
    </main>
  );
}

/**
 * 极简的行内标记：`**粗体**`、`` `代码` ``、`[文字](地址)`。
 *
 * 为什么不用 markdown 库：文案里只用到这三种标记（强调某个「不拥有 / 不收集」、
 * cookie 名这类代码标识，以及联系页那个 mailto），引一个解析器 + 消毒器不值当。
 *
 * 为什么用**元素**而不是 `dangerouslySetInnerHTML`：内容是自家写死的文案，
 * 本来就没有注入风险，但拼 HTML 串这件事一旦被后人复制到别处就会变成坑；
 * 拆成 React 元素则从头到尾没有字符串拼 HTML 这一步。
 *
 * 链接是 2026-11-03 加的（联系页要把邮箱做成可点的）：只认 `[文字](地址)` 这一种写法，
 * 地址直接进 `href`，不做协议白名单 —— 内容全是本仓库里的常量，没有外部输入。
 *
 * 段落里没有标记时返回的是原样的纯文本（切成一个 Fragment），渲染结果不变。
 */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];

  // 先切粗体，再在剩下的片段里切行内代码，最后切链接 —— 三种标记不嵌套，所以顺序无所谓
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

      piece.split(/(\[[^\]]+\]\([^)]+\))/g).forEach((part, partIndex) => {
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (link) {
          nodes.push(
            <a
              key={`a${chunkIndex}-${pieceIndex}-${partIndex}`}
              href={link[2]}
              className="text-accent underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent"
            >
              {link[1]}
            </a>
          );
          return;
        }
        if (part) nodes.push(<Fragment key={`t${chunkIndex}-${pieceIndex}-${partIndex}`}>{part}</Fragment>);
      });
    });
  });

  return nodes;
}
