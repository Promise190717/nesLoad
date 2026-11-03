'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Paragraphs from './Paragraphs';

/**
 * 「关于 <游戏名>」长文的**视觉折叠**（2026-11-03 加，用户要求「文案太长的话做一个限制，
 * 文案还是全的，只是 DOM 上做个查看更多」）。
 *
 * 关键是「**文案还是全的**」：服务端把 `game_texts.about` 的整段文字全部渲染进 HTML
 * （爬虫和「查看源代码」都能读到完整内容），这里只是用 `max-height` 把它**裁短**，
 * 点按钮再展开。所以：
 *
 *   · 不截字符串（`text.slice(0, N) + '…'`）—— 那样被裁掉的句子是真的没了，
 *     SEO 与「复制全文」都会少一块；
 *   · 不用 `<details>` —— 它的展开按钮长得没法改，和这一页的像素风对不上；
 *   · 也不用「点开才去取」—— 服务端组件里根本没有第二次取数，数据本来就在手上。
 *
 * ## 折叠高度的判据
 *
 * 先按**字符数**粗判（`COLLAPSE_CHARS`）：够短就直接全展开、连按钮都不画 ——
 * 这一步在服务端渲染时就能定，短文案不会先闪一个「查看更多」再消失。
 * 挂载后再用**内层真实高度**校正一次（`overflowing`）：宽屏下 240 字可能只占 4 行，
 * 那时按钮也该收起来；窄屏下 200 字可能已经溢出 8 行，那时按钮要补上。
 *
 * ⚠️ 量的是**内层**（`innerRef`）的 `scrollHeight`，不是外层。外层在折叠态有
 *    `max-height` + `overflow-hidden`，它自己的 `scrollHeight` 虽然仍是内容全高，
 *    但一旦展开就恒等于 `clientHeight`，再测就永远是「不溢出」。
 *    内层没有高度约束，永远是内容的真实高度。
 *
 * ⚠️ 裁切口用 `mask-image` 做渐隐，**不要换成 `from-ink-950` 那种背景渐变** ——
 *    那要求遮罩色与本页背景色逐像素相同，主题/半透明背景下会露出一条色带。
 *    mask 只作用在透明度上，与背景无关。
 */

/** 折叠后露出的高度（px）。`leading-7` = 28px，这里约 6 行多一点。 */
const VISIBLE_HEIGHT = 176;

/** 粗判阈值（字符数）：短于这个长度基本不会溢出 6 行，服务端直接全展开。 */
const COLLAPSE_CHARS = 240;

export default function AboutText({
  text,
  moreLabel,
  lessLabel,
}: {
  /** 原始长文，段落之间是空行（交给 `Paragraphs` 切段）。 */
  text: string;
  /** 「查看更多」。 */
  moreLabel: string;
  /** 「收起」。 */
  lessLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(text.length > COLLAPSE_CHARS);
  const innerRef = useRef<HTMLDivElement>(null);
  const bodyId = useId();

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    setOverflowing(el.scrollHeight > VISIBLE_HEIGHT + 4);
  }, [text]);

  const clamped = overflowing && !expanded;

  return (
    <>
      <div
        id={bodyId}
        className={clamped ? 'about-clamp overflow-hidden' : undefined}
        style={clamped ? { maxHeight: VISIBLE_HEIGHT } : undefined}
      >
        <div ref={innerRef}>
          <Paragraphs text={text} className="text-[13px] leading-7 text-ink-300" />
        </div>
      </div>
      {overflowing ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={bodyId}
          className="mt-3 text-[12px] text-accent transition-colors hover:underline"
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      ) : null}
    </>
  );
}
