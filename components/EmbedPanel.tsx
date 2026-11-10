'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@/lib/i18n';

/**
 * 详情页底部的「嵌入此游戏」（2026-11-10 加）。
 *
 * 一块卡片：标题 + 一句说明 + 一条只读地址 + 复制钮（复制的是完整 `<iframe>` 标签）
 * + 使用提示。地址里的 `/embed/games/<id>` 是真正被 iframe 的那一页（只有屏幕，
 * 见 `app/[locale]/embed/games/[id]`）。
 *
 * ⚠️ 复制的东西是**完整标签**，不是裸地址（2026-11-10 用户要求：「复制应该是复制一个
 * iframe 标签」）。只给地址的话，嵌的人还得自己拼标签，最容易漏的恰恰是 `allowfullscreen`
 * 和各种样式属性 —— 那不是访问者该踩的坑。高度 600 是个保守默认（4:3 屏幕 + 屏幕下
 * 那条说明条，桌面端不会出现内部滚动），提示文案里明说了可以自己调。
 *
 * ⚠️ 但**页面上显示的仍然只有地址**（同一天的第二条要求：「页面显示的话还是只显示链接」）。
 * 显示与复制故意不同源，理由写在下面那个 `<input>` 上方，别顺手统一成同一个值。
 *
 * ## 为什么文案不走 18 张语言表
 *
 * 这一块只有七句话，而且全是**说明性的短句**，和 `lib/site-doc.ts` 里那几段
 * （隐私 / 条款 / 关于）是同一类：四语言手写 + 其余回退英文，比往 18 份
 * `i18n.<code>.ts` 里各加七个键划算得多，也不会因为漏翻一个键导致整页 typecheck
 * 报错。以后要正经加语言，按 `site-doc.ts` 的办法扩这张表即可。
 *
 * ## 为什么是客户端组件
 *
 * 只有一个交互：复制。把它拆出来是为了让详情页（服务端组件）保持纯正文，
 * 和 `FavoriteButton` / `ReportGameButton` 同一个拆法。
 */
type Copy = {
  title: string;
  lead: string;
  codeLabel: string;
  copy: string;
  copied: string;
  hintTitle: string;
  hint: string;
};

/** 四语言，其余语言回退英文（见文件头）。 */
const TEXT: Partial<Record<Locale, Copy>> = {
  zh: {
    title: '嵌入此游戏',
    lead: '将此游戏嵌入到您的网站中，让访客直接在您的页面上畅玩。',
    codeLabel: '嵌入代码',
    copy: '复制代码',
    copied: '已复制',
    hintTitle: '使用提示',
    hint: '复制上面的代码并粘贴到您网站的 HTML 中，游戏会自动显示在您的页面上。宽度和高度可以在代码里按需要调整。支持所有现代浏览器和移动设备。',
  },
  en: {
    title: 'Embed this game',
    lead: 'Put this game on your own site so visitors can play it without leaving your page.',
    codeLabel: 'Embed code',
    copy: 'Copy code',
    copied: 'Copied',
    hintTitle: 'How to use',
    hint: 'Copy the code above and paste it into the HTML of your site. The game appears on your page automatically. Change the width and height in the code to fit your layout. Works in every modern browser and on mobile.',
  },
  ja: {
    title: 'このゲームを埋め込む',
    lead: 'このゲームをあなたのサイトに埋め込むと、訪問者がそのままのページで遊べます。',
    codeLabel: '埋め込みコード',
    copy: 'コードをコピー',
    copied: 'コピーしました',
    hintTitle: '使い方',
    hint: '上のコードをコピーして、あなたのサイトの HTML に貼り付けてください。ゲームが自動的にページに表示されます。幅と高さはコード内で自由に調整できます。最新のブラウザとモバイル端末に対応しています。',
  },
  ko: {
    title: '이 게임 임베드',
    lead: '이 게임을 웹사이트에 임베드하면 방문자가 페이지에서 바로 플레이할 수 있습니다.',
    codeLabel: '임베드 코드',
    copy: '코드 복사',
    copied: '복사됨',
    hintTitle: '사용 방법',
    hint: '위 코드를 복사해 웹사이트 HTML에 붙여 넣으세요. 게임이 페이지에 자동으로 표시됩니다. 코드에서 너비와 높이를 원하는 대로 조정할 수 있습니다. 모든 최신 브라우저와 모바일 기기를 지원합니다.',
  },
};

function copyFor(locale: Locale): Copy {
  return TEXT[locale] ?? (TEXT.en as Copy);
}

/**
 * 嵌出去的完整标签：宽度跟容器、高度固定、无边框、可全屏、懒加载。
 *
 * `loading="lazy"` 是给嵌入方省流量的：宿主页面把框放在折叠下方时，不必一打开
 * 页面就拉 ROM 和核。滚到跟前再加载，体感没有区别。
 */
function embedCode(url: string): string {
  return `<iframe src="${url}" width="100%" height="600" style="border:0" loading="lazy" allowfullscreen></iframe>`;
}

export default function EmbedPanel({ url, locale }: { url: string; locale: Locale }) {
  const text = copyFor(locale);
  const [copied, setCopied] = useState(false);
  const code = embedCode(url);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <section className="mt-6 border-t border-ink-800 pt-5">
      <h2 className="text-[13px] font-semibold text-ink-200">{text.title}</h2>
      <p className="mt-2 text-[13px] leading-7 text-ink-300">{text.lead}</p>

      {/*
        标签与复制钮同一行：按钮贴在右边，和下面那条地址框的左边缘对齐着读。
        ⚠️ 复制的是**完整 `<iframe>` 标签**，框里显示的只有地址（见文件头）。

        ⚠️ 这颗钮走**站内小钮那套**（`pxw-1` + `px-2.5 py-1` + 11px），跟 `GamesShell`
        的返回链、`PlayBackLink` 一模一样。2026-11-10 第一版用的是常规钮（`pxw-2` +
        `px-3 py-1.5` + 12px），用户当场说「复制的按钮太大了」—— 它旁边只是一行 12px
        的说明字，2px 描边加 12px 内边距叠出来的体积比那行字高出一截，视觉上抢戏。
        也别改成把按钮塞进地址框右侧（分享弹窗那种排法）：那一行是为了让地址占满宽度、
        长 URL 一屏读全，塞进去会把地址挤窄。
      */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[12px] text-ink-400">{text.codeLabel}</span>
        <button
          type="button"
          onClick={() => {
            /*
             * 剪贴板被拒（非安全上下文 / 用户拒绝）时**静默**。框里只有地址，
             * 手抄拿不到那段标签 —— 但弹一句「复制失败」只会让人更慌，
             * 地址本身也够他自己拼一个 `<iframe src="...">` 出来。
             */
            void navigator.clipboard
              .writeText(code)
              .then(() => setCopied(true), () => undefined);
          }}
          className="pixel-edge pxw-1 pxc-600 shrink-0 bg-ink-850 px-2.5 py-1 text-[11px] text-ink-200 transition-colors hover:text-accent"
        >
          {copied ? text.copied : text.copy}
        </button>
      </div>

      {/*
        ⚠️ **框里只显示地址，复制出去的却是完整标签**（用户 2026-11-10 第二条要求：
        「页面显示的话还是只显示链接」）。这是刻意的不对称：
          · 读的是人 —— 一行地址最好认，也能直接粘到浏览器里自己先看效果；
          · 复制的是机器要的 —— 粘进 HTML 就能跑，`allowfullscreen` / 懒加载
            这些容易漏的属性都替对方写好了。
        所以两者**不能**用同一个变量：`value` 是 `url`，clipboard 写的是 `code`。
        改这里之前先想清「给谁看」和「给谁用」不是同一件事。

        `<input readonly>` 而不是 `<code>`：只读输入框天然可选中、可整段复制，
        手机上也不会因为长按把链接当成普通文本来选。`onClick` / `onFocus` 顺手全选，
        是给「复制钮不灵」留的手动出路。
      */}
      <input
        readOnly
        value={url}
        aria-label={text.codeLabel}
        onFocus={(event) => event.currentTarget.select()}
        onClick={(event) => event.currentTarget.select()}
        className="mt-2 w-full border border-ink-700 bg-ink-850 px-3 py-2 font-mono text-[12px] text-ink-200"
      />

      <div className="mt-4 border-l-2 border-accent bg-ink-850 px-3 py-2.5">
        <p className="text-[12px] font-semibold text-ink-200">{text.hintTitle}</p>
        <p className="mt-1 text-[12px] leading-6 text-ink-400">{text.hint}</p>
      </div>
    </section>
  );
}
