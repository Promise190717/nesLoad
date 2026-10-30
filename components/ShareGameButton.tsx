'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from './I18nProvider';
import { ShareIcon } from './icons';

/**
 * 详情页那颗「分享游戏」：点开是一个**分享弹窗**（2026-10-30 改的）。
 *
 * 原来是「点一下就把地址写进剪贴板」（2026-10-12 那版）。现在弹窗里三件事：
 *   · 一排三方平台 —— X / Facebook / Reddit / Telegram / WhatsApp，点了走各自的分享
 *     意图地址（新标签打开）；
 *   · 邮件 —— `mailto:`，正文里预置「游戏名 + 地址」；
 *   · 复制链接 —— 地址摆在一个只读框里（看得见、能自己选），旁边一颗复制钮。
 *
 * 为什么要弹窗而不是继续「一键复制」：复制这件事**没有下文**，用户还得自己去找地方粘贴；
 * 而分享到哪去是个选择题，把选项摆出来才算真把这件事做完。地址仍然露在框里，
 * 原来的「复制走人」这条路一点没丢。
 *
 * 和「反馈问题」「收藏」一样是**独立的小客户端组件** —— `/games/[id]` 是服务端组件
 * （正文要能被整段读走，见那边注释），弹窗要有事件处理，塞不进去。
 *
 * 分享的是**服务端算好的绝对地址**（`resolveSiteOrigin() + /games/<id>`，和 canonical 同一个），
 * **不用 `window.location`**：这一页的地址还可能带着 `?id=` 之类的参数从别处进来，
 * 而分享出去的应该是那条规范地址 —— 别人打开就是干干净净的详情页。
 */

/**
 * 品牌标志只服务这个弹窗，所以**留在本文件**，不搬进 `icons.tsx`。
 * 那边是「整数网格 + crispEdges」的像素图标库（见它的文件头），而这几枚是
 * 各家自己的标志，硬套像素网格只会画出认不出的东西 —— 用普通矢量路径反而更像。
 */
function XIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M3 3l10 10M13 3L3 13" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M10.8 2H8.9C7.3 2 6.1 3.2 6.1 4.8V7H4v2.6h2.1V14h2.7V9.6h2.1l.4-2.6H8.8V5.2c0-.4.2-.6.6-.6h1.4V2Z" />
    </svg>
  );
}

function RedditIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      {/* 头 + 两根天线 + 两只眼，认得出是那个外星人 */}
      <ellipse cx="8" cy="9.2" rx="5.2" ry="3.9" />
      <path d="M8 5.3V4.2M8 4.2 10.4 3M8 4.2 5.6 3" />
      <circle cx="6.2" cy="8.6" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="9.8" cy="8.6" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M14.2 2.2 1.9 6.9c-.7.3-.7.7 0 .9l3 1 1.2 3.6c.1.4.3.5.6.2l1.7-1.6 3 2.2c.5.3.9.1 1-.5l1.8-8.5c.1-.7-.2-1-.9-.7ZM6.1 9.2l5.4-3.4c.2-.1.3 0 .2.2L7.2 9.7l-.2 2.1L6.1 9.2Z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      {/* 气泡轮廓（左上角留个口当小尾巴）+ 筒子 */}
      <path
        d="M8 2.2a5.6 5.6 0 0 0-4.8 8.5L2.4 13.8l3.2-.8A5.6 5.6 0 1 0 8 2.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M6.2 5.4c.2-.2.4-.2.5-.2h.4c.1 0 .3 0 .4.3l.5 1.1c.1.2 0 .4-.1.5l-.5.5c.4.8 1 1.4 1.8 1.8l.5-.5c.1-.1.3-.2.5-.1l1.1.5c.2.1.3.3.3.4v.4c0 .2 0 .4-.3.6-.4.2-.9.3-1.4.1-1.9-.5-3.3-1.9-3.8-3.8-.1-.5 0-1 .2-1.6Z"
        fill="currentColor"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="12" height="9" />
      <path d="M3 5l5 4 5-4" />
    </svg>
  );
}

/**
 * 分享意图地址。**只有 URL 和文案**，没有别的参数 ——
 * 各家的 intent 页面自己会带出标题 / 缩略图（`og:` 那套，见 lib/og-image.tsx），
 * 这里多塞字段反而容易踩到某家的长度限制。
 *
 * WhatsApp / Bluesky 这类没有独立的 `url` 参数，地址得并进正文；
 * 邮件同理（`mailto:` 的 body 换行要留给 `encodeURIComponent` 去转 `%0A`）。
 */
function buildTargets(url: string, text: string) {
  const enc = encodeURIComponent;
  return [
    {
      key: 'x',
      label: 'X',
      href: `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(text)}`,
      icon: <XIcon />,
    },
    {
      key: 'facebook',
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
      icon: <FacebookIcon />,
    },
    {
      key: 'reddit',
      label: 'Reddit',
      href: `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(text)}`,
      icon: <RedditIcon />,
    },
    {
      key: 'telegram',
      label: 'Telegram',
      href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`,
      icon: <TelegramIcon />,
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      href: `https://wa.me/?text=${enc(`${text} ${url}`)}`,
      icon: <WhatsAppIcon />,
    },
  ];
}

export default function ShareGameButton({ url, gameName }: { url: string; gameName: string }) {
  const { t } = useI18n();

  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<'idle' | 'ok' | 'fail'>('idle');

  const triggerRef = useRef<HTMLButtonElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);

  /** 唯一的关闭路径：收起弹窗 + 把焦点还给触发那颗钮。 */
  const close = () => {
    setOpen(false);
    setResult('idle');
    triggerRef.current?.focus();
  };

  /*
   * 提示过一会儿自己收回去（和 NetplayPanel 那颗复制钮同一个节奏）
   */
  useEffect(() => {
    if (result === 'idle') return;
    const timer = setTimeout(() => setResult('idle'), 1600);
    return () => clearTimeout(timer);
  }, [result]);

  // 打开时把焦点送进弹窗（弹窗的常规做法），落在复制钮上 —— 它是这里唯一有「结果」的动作
  useEffect(() => {
    if (open) copyRef.current?.focus();
  }, [open]);

  /*
   * Esc 关闭 —— 全站唯一认的键盘操作就是 Esc（见 MEMORY 里那条铁律）。
   * 监听挂在 document 而不是弹窗上：焦点可能落在背板上。
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        /*
         * 兜底：非安全上下文（http 部署、老浏览器）里没有 clipboard API。
         * 老办法是插一个离屏 textarea、选中、`execCommand('copy')` 再摘掉。
         * 它已标废弃，但正因为它「还活着」，才值得留在这里当退路。
         */
        const area = document.createElement('textarea');
        area.value = url;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.top = '-1000px';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(area);
        if (!ok) throw new Error('execCommand copy returned false');
      }
      setResult('ok');
    } catch {
      setResult('fail');
    }
  };

  /** 分享文案：游戏名 + 站名（`{site}` 由 I18nProvider 统一注入，见它的注释） */
  const shareText = t('gamesPage.shareText', { name: gameName });
  const targets = buildTargets(url, shareText);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        /*
         * 常态字色 = `accent`（2026-10-13 用户要「修改文字颜色」）：这一页的「文字链接」口径
         * 就是强调色（同一页资料表里那个「开发商」链接用的也是它），比原来那档暗灰一眼看得出
         * 是**能点的东西**。钮身上没有描边可依托，悬停就换下划线 —— 只划字不划图标，
         * 理由同 icons.tsx 文件头那条（图标是图形，不是文本）。
         */
        className="group inline-flex items-center gap-1.5 text-[12px] text-accent transition-colors"
      >
        {/* 尺寸**必须传 16**（非整数倍会吃掉 1 单位的线，见 icons.tsx 文件头） */}
        <ShareIcon size={16} />
        <span className="group-hover:underline">{t('gamesPage.share')}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6 py-8"
          onClick={close}
        >
          {/*
            背板用**固定暗色**、不走 `bg-ink-950/70`（别的面板那套）：ink-950 会随主题翻，
            浅色主题下它是近白，叠上去是一片白雾。理由同 ReportGameButton。
          */}
          <div className="absolute inset-0 bg-[#0b0b10]/60 backdrop-blur-[3px]" />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('gamesPage.share')}
            onClick={(event) => event.stopPropagation()}
            className="pixel-edge pxw-3 pxc-600 relative flex w-[420px] max-w-full flex-col gap-3 bg-ink-800 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="text-[12px] text-ink-200">{t('gamesPage.share')}</h3>
                {/* 分享的是哪一款，写清楚 —— 同一页还有「反馈问题」，别让人复制错了东西 */}
                <p className="truncate text-[12px] text-ink-500">{gameName}</p>
              </div>
              {/*
                「关闭」用**文字**而不是 ✕ 图标：一是像素字体里没有那颗字（见 i18n 那边
                关于字形的话），二是 X 平台那枚标志本身就是个叉，两个叉摆在一屏里会认混。
              */}
              <button
                type="button"
                onClick={close}
                className="shrink-0 text-[12px] text-ink-500 transition-colors hover:text-accent"
              >
                {t('gamesPage.shareClose')}
              </button>
            </div>

            {/*
              平台两列 —— 六个格子（5 家 + 邮件）正好三整行，不会剩一格空着。
              用 `<a>` 不用 `<button>`：它去的是**别家的真地址**，该能中键打开、
              该能右键复制、该被浏览器当成导航（也就不用自己操心 window.open 被拦）。
            */}
            <div className="grid grid-cols-2 gap-2">
              {targets.map((target) => (
                <a
                  key={target.key}
                  href={target.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pixel-edge pxw-2 pxc-500 flex items-center gap-2 bg-ink-900 px-2 py-2 text-[12px] text-ink-300 transition-colors hover:text-accent"
                >
                  {target.icon}
                  <span>{target.label}</span>
                </a>
              ))}
              <a
                href={`mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(
                  `${shareText}\n\n${url}`
                )}`}
                className="pixel-edge pxw-2 pxc-500 flex items-center gap-2 bg-ink-900 px-2 py-2 text-[12px] text-ink-300 transition-colors hover:text-accent"
              >
                <MailIcon />
                <span>{t('gamesPage.shareEmail')}</span>
              </a>
            </div>

            {/* 地址露在外面：复制失败时（剪贴板被拒）至少还能自己选中抄走 */}
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={url}
                onFocus={(event) => event.currentTarget.select()}
                aria-label="URL"
                className="pixel-edge pxw-2 pxc-500 min-w-0 flex-1 bg-ink-900 px-2 py-2 text-[12px] text-ink-300 focus:outline-none"
              />
              <button
                ref={copyRef}
                type="button"
                onClick={() => void copy()}
                className="pixel-edge pxw-2 pxc-500 shrink-0 bg-accent px-3 py-2 text-[12px] text-ink-950 transition-colors hover:bg-accent/80"
              >
                {result === 'ok' ? t('gamesPage.shareCopied') : t('gamesPage.shareCopy')}
              </button>
            </div>

            {/* 失败只在下面说一句，不改按钮文字 —— 「复制失败」挂在按钮上像按钮坏了 */}
            {result === 'fail' && (
              <p className="text-[12px] text-danger">{t('gamesPage.shareFailed')}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
