'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { PlayersIcon } from './icons';

/**
 * 详情页第一层动作区（开始游戏 / 联机游戏 / 收藏 / 下载）+ **语言版本选择弹框**。
 *
 * 为什么要做成客户端组件（2026-10-19）：
 *
 * 数据库那条路里「同一款的不同语言版本」是**各自一行**（`games.language` 那一列），
 * id 已经决定了玩哪一份，不需要选。但源站模式（`CATALOG_SOURCE=upstream`，默认）下，
 * 上游把四份 ROM 挂在同一个游戏对象的 `fileName` 里（详情页上也确实有「选择语言」），
 * 那就必须让用户在这一页选，选完把 `?lang=` 带进播放页 / 下载页。
 *
 * 为什么不用 `?lang=` 做服务端渲染：详情页现在是 30 天 ISR 的静态页，
 * 一读 `searchParams` 就变成逐请求动态渲染 —— 一千多款游戏每被爬一次都打一趟 D1。
 * 用客户端 state 改链接的 query 字符串，页面本身的缓存形态一点没动。
 *
 * ⚠️ 2026-10-19 第二轮（用户要求）：语言**不再常驻一排按钮**，改成点「开始游戏」/
 *    「联机游戏」时才弹框选。理由是那一排会一直占着动作区第一行，而绝大多数游戏
 *    只有一份 ROM、根本不需要看它；有多个版本时让人在「真要开玩」的瞬间选一次更顺。
 *    只有一份语言时不弹框、直接进 —— 弹一个只有一个选项的框纯属添乱。
 *    下载钮**不弹框**：它先按默认版本进下载页，那一页自己有一排语言钮
 *    （见 `components/RomDownloadGate.tsx`），在那儿换不会丢掉已经填好的选择。
 *
 * ⚠️ 2026-10-19 第三轮（用户要求，两处行为都反了）：
 *    ① **多语言时这两颗钮不再是 `<a>`，改成 `<button>`**。以前是 `<Link>` 挂
 *       `preventDefault`，可 `<Link>` 的 hover 预取 / 点击前的路由事件会先把顶栏
 *       （`TopBar` 的导航进度条）点亮一次，而这次点击**根本不该导航**（只是开弹框）
 *       ⇒ 顶栏闪一下又被后面的 `router.push` 点亮第二次。换成按钮就没有这层副作用。
 *       代价是这两个钮不能中键新标签打开了 —— 只有在「确实要选语言」时才这样，
 *       单语言游戏仍然是 `<Link>`，正常导航。
 *    ② 弹框**不再预选**任何一项，且选完不立刻跳：底部「取消 / 确认」两颗，
 *       点「确认」才进。选语言是「挑一份要玩的东西」，选完就开跑等于没有反悔机会
 *       （点错一个语言就直接换了一份 ROM 开打，尤其手机上很容易误触）。
 *
 * ⚠️ 视觉必须和原来**逐像素一致**：这就是原来那四颗钮，只是从页面里挪进来了
 *    （描边 / 字号 / 图标字号那些注释留在调用处，别在这儿重新设计）。
 *
 * ⚠️ 2026-10-23：**这三颗 `<Link>` 全部 `prefetch={false}`**（开始游戏 / 联机游戏 /
 *    下载 ROM）。它们是详情页首屏唯一可见的三个站内链接，Next 生产模式会把
 *    **进入视口的 `<Link>`** 全部预取 —— 于是每访问一个详情页，浏览器就额外渲染
 *    `/play?id=…&mode=solo`、`/play?id=…&mode=host`、`/games/<id>/download` **三个页面**
 *    （下载页 40 KB、`/play` 是模拟器外壳，都不比详情页轻）。
 *
 *    实测这一页只有 169 个 body 元素、55 KB，本身很轻；**贵的是它顺带拖出来的这三页**。
 *    列表页的卡片早就关了预取（见 `GameCardGrid`），这里当初漏了。
 *
 *    为什么可以关：预取的价值是「点下去立刻有」，但这三颗是**动作**不是浏览路径的
 *    下一步 —— 一次访问里最多点其中一颗，而预取是 100% 触发的。关掉之后点击
 *    由顶栏那条进度条兜住（`TopBar` 本来就是为导航准备的）。
 *    ⚠️ 别再给「开始游戏」单独加回预取：它带 `?id=` 和 `?lang=`，是动态路由，
 *    预取拿不到完整结果，只会白渲染一遍。
 * ⚠️ 收藏钮走 `children` 插进来：它自己是客户端组件、还要拿服务端算好的初值，
 *    在这一层重新实现一遍只会多一条要同步的逻辑。
 */

/** 两颗主钮共用的样式（`<Link>` 与 `<button>` 两种形态必须长得一模一样） */
const PLAY_CLASS =
  'pixel-edge pxw-3 pxc-600 inline-flex items-center gap-1.5 bg-accent px-5 py-2 text-[12px] text-ink-950 transition-colors hover:bg-accent/80';
/**
 * 联机钮 = **绿色实心**（2026-10-30 用户要求「改成绿色」）。
 *
 * 只换色料，写法跟「开始游戏」那颗一模一样（实心底 + `text-ink-950` 反白字，
 * hover 用 `/80` 压暗一档）—— 这样它在明暗两套主题下都自动成立：深色主题是
 * 亮绿底深字，浅色主题是深绿底浅字，不用手写 `dark:` 变体。
 * `bg-ok` 是主题令牌（深色 #4ade80 / 浅色 #1f9d55），别写死十六进制。
 */
const HOST_CLASS =
  'pixel-edge pxw-2 pxc-600 inline-flex items-center gap-1.5 bg-ok px-3.5 py-2 text-[12px] text-ink-950 transition-colors hover:bg-ok/80';
/** 下载钮保持中性灰（**别跟着联机变绿**：它是次要动作，不该和主钮抢眼） */
const DOWNLOAD_CLASS =
  'pixel-edge pxw-2 pxc-600 inline-flex items-center gap-1.5 bg-ink-800 px-3.5 py-2 text-[12px] text-ink-200 transition-colors hover:bg-ink-700 hover:text-accent';

export default function GameLanguageActions({
  playHref,
  hostHref,
  downloadHref,
  languages,
  defaultCode,
  languageTitle,
  languageConfirm,
  languageCancel,
  playLabel,
  playOnlineLabel,
  downloadLabel,
  children,
}: {
  /** 开始游戏（solo）的地址，**已经带好 `?id=` 与 `mode=solo`** */
  playHref: string;
  /** 联机游戏的地址；null = 这一款不支持联机（`players === 1` 的单人游戏），整颗不画 */
  hostHref: string | null;
  /** 下载页地址 */
  downloadHref: string;
  /** 可选的 ROM 语言版本；空 / 只有一个时**不弹框**（数据库那条路永远是空） */
  languages: { code: string; label: string }[];
  /** 只有一个版本时用哪一份（下载钮 / 单语言直达都用它） */
  defaultCode: string;
  /** 弹框标题（i18n） */
  languageTitle: string;
  /** 弹框里那颗确认（i18n） */
  languageConfirm: string;
  /** 弹框里那颗取消（i18n） */
  languageCancel: string;
  playLabel: string;
  playOnlineLabel: string;
  downloadLabel: string;
  /** 收藏钮 */
  children?: ReactNode;
}) {
  const router = useRouter();
  /* 空 = 还没选。刻意不给默认值：弹框一打开就把某项染成高亮，人会以为「已经定了」 */
  const [code, setCode] = useState('');
  /* 待确认的地址：非 null 就是弹框开着，URL 里带着「选完要往哪去」 */
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const close = () => setPendingHref(null);

  /* Esc = 取消（和存档 / 联机 / 游戏库那几块面板同一个约定，全站唯一的键盘操作） */
  useEffect(() => {
    if (!pendingHref) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPendingHref(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingHref]);

  /* `lang` 显式传：`defaultCode` / 用户选的码都可能不是 state 当下的值 */
  const withLang = (href: string, lang: string) => {
    if (!lang) return href;
    const param = `lang=${encodeURIComponent(lang)}`;
    return `${href}${href.includes('?') ? '&' : '?'}${param}`;
  };

  const needsChoice = languages.length > 1;

  /**
   * 多语言时才用按钮：点击只是**开弹框**，不该触发任何导航。
   *
   * `<Link>` 就算 `preventDefault` 也已经走了一遍路由的点击 / 预取流程
   * （顶栏那条进度条会亮），所以这里换成纯按钮。每次打开都把选择清空。
   */
  const openDialog = (href: string) => () => {
    setCode('');
    setPendingHref(href);
  };

  /** 点「确认」才真的走：把选好的语言拼进地址 */
  const confirm = () => {
    const target = pendingHref;
    if (!target || !code) return;
    setPendingHref(null);
    router.push(withLang(target, code));
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {needsChoice ? (
          <button type="button" onClick={openDialog(playHref)} className={`${PLAY_CLASS} cursor-pointer`}>
            <span aria-hidden="true" className="text-[15px] leading-none">
              ▸
            </span>
            {playLabel}
          </button>
        ) : (
          <Link href={withLang(playHref, defaultCode)} className={PLAY_CLASS} prefetch={false}>
            <span aria-hidden="true" className="text-[15px] leading-none">
              ▸
            </span>
            {playLabel}
          </Link>
        )}

        {hostHref &&
          (needsChoice ? (
            <button
              type="button"
              onClick={openDialog(hostHref)}
              className={`${HOST_CLASS} cursor-pointer`}
            >
              <PlayersIcon size={16} />
              {playOnlineLabel}
            </button>
          ) : (
            <Link href={withLang(hostHref, defaultCode)} className={HOST_CLASS} prefetch={false}>
              <PlayersIcon size={16} />
              {playOnlineLabel}
            </Link>
          ))}

        {children}

        {/* 下载钮**不弹框**（见文件头）：直接按默认版本进下载页，那一页自己有一排语言钮 */}
        <Link href={withLang(downloadHref, defaultCode)} className={DOWNLOAD_CLASS} prefetch={false}>
          <span aria-hidden="true" className="text-[15px] leading-none">
            ↓
          </span>
          {downloadLabel}
        </Link>
      </div>

      {pendingHref && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center px-6"
          onClick={close}
        >
          <div className="absolute inset-0 bg-ink-950/70" />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={languageTitle}
            className="relative w-[360px] max-w-full bg-ink-800 pixel-edge pxw-4 pxc-600"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center border-b-2 border-ink-900 bg-ink-850 px-4 py-3">
              <span className="text-[12px] text-ink-200">{languageTitle}</span>
            </div>

            <div className="flex flex-col gap-2 p-4">
              {languages.map((item) => {
                const active = item.code === code;
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => setCode(item.code)}
                    aria-pressed={active}
                    className={`pixel-edge pxw-2 pxc-500 flex cursor-pointer items-center justify-between px-3 py-2 text-[12px] transition-colors ${
                      active
                        ? 'bg-accent text-ink-950'
                        : 'bg-ink-700 text-ink-200 hover:bg-ink-600 hover:text-accent'
                    }`}
                  >
                    <span>{item.label}</span>
                    {active && (
                      <span aria-hidden="true" className="text-[13px] leading-none">
                        ▸
                      </span>
                    )}
                  </button>
                );
              })}

              {/* 取消在左、确认在右；没选语言时确认不可点（没东西可确认） */}
              <div className="mt-1 flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="pixel-edge pxw-2 pxc-500 flex-1 cursor-pointer bg-ink-850 py-2 text-[12px] text-ink-400 transition-colors hover:bg-ink-700 hover:text-ink-200"
                >
                  {languageCancel}
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={!code}
                  className="pixel-edge pxw-2 pxc-500 flex-1 bg-accent py-2 text-[12px] text-ink-950 transition-colors enabled:cursor-pointer enabled:hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {languageConfirm}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
