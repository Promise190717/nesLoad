'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from './I18nProvider';
import { ReportIcon } from './icons';

/**
 * 详情页那颗「反馈问题」（2026-10-13 用户要的）：点开是一个弹窗，写下问题再提交。
 *
 * 和「分享游戏」「收藏」一样是**独立的小客户端组件** —— `/games/[id]` 是服务端组件
 * （正文要能被整段读走，见那边注释），弹窗要有事件处理，塞不进去。
 *
 * ⚠️ **提交不需要登录**。这一页没有登录入口（登录面板住在屋里），要求登录等于把
 *    这条路堵死 —— 和 `FavoriteButton` 撞的是同一堵墙，但那边还能「提示去登录」，
 *    反馈这件事本身对匿名用户也是合理的。所以走的是留言本那条路：
 *    匿名提交 + 长度上限 + 后台人工处理（见 lib/server/reports.ts 的注释）。
 *
 * **非空校验做两道**：这里（敲空白不让提交，按钮置灰 + 提交时说一句）和服务端
 * （`/api/game-reports` 的 `content-required`）—— 前端那道是体验，服务端那道才算数。
 *
 * 关闭只有一条路（`close()`）：Esc、点背板、点取消、提交成功后自动收起，全走它 ——
 * 焦点回位只写一处，不会漏。
 */
export default function ReportGameButton({
  gameId,
  gameName,
}: {
  gameId: string;
  /** 游戏名，只用来在弹窗里点明「反馈的是哪一款」 */
  gameName: string;
}) {
  const { t } = useI18n();

  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  /** idle = 还没提交；sending = 请求在飞；ok = 成功了（弹窗即将自动收起） */
  const [state, setState] = useState<'idle' | 'sending' | 'ok'>('idle');
  const [error, setError] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  /*
   * 长度上限。**必须和 lib/server/reports.ts 的 REPORT_MAX_LENGTH 一致** ——
   * 不从那边 import：那个模块引了 `node:crypto` 和 D1 客户端，是纯服务端的，
   * 拉进客户端 bundle 会把一堆东西一起带进来（留言本 FeedbackPanel 也是这么处理的）。
   */
  const MAX_LENGTH = 500;

  /** 唯一的关闭路径：收起弹窗 + 把焦点还给触发那颗钮。 */
  const close = () => {
    setOpen(false);
    setState('idle');
    setError(null);
    triggerRef.current?.focus();
  };

  // 打开时把光标送进输入框（弹窗的常规做法：省一次点击）
  useEffect(() => {
    if (open) areaRef.current?.focus();
  }, [open]);

  /*
   * Esc 关闭 —— 全站唯一认的键盘操作就是 Esc（见 MEMORY 里那条铁律），
   * 弹窗按惯例也该认它。监听挂在 document 而不是弹窗上：焦点可能落在背板上。
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // 提交成功后停一下让用户看见那句「谢谢」，再自己收起来
  useEffect(() => {
    if (state !== 'ok') return;
    const timer = setTimeout(close, 1600);
    return () => clearTimeout(timer);
  }, [state]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (state === 'sending') return;

    const text = content.trim();
    if (!text) {
      setError(t('gamesPage.reportRequired'));
      return;
    }

    setState('sending');
    setError(null);
    try {
      const res = await fetch('/api/game-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, content: text }),
      });
      if (!res.ok) {
        /*
         * 服务端的 detail 更具体（「最多 500 个字」这种），有就用它；
         * 解析不出来（比如 502 返回的 HTML）退回那句通用的。
         */
        const data = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(data?.detail ?? t('gamesPage.reportFailed'));
      }
      setContent('');
      setState('ok');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('gamesPage.reportFailed'));
      setState('idle');
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        /*
         * 2026-10-13 起因详情页动作区分了两层而改成**无描边的文字链接**
         * （见 app/[locale]/games/[id]/page.tsx 那段注释）：
         * 「反馈问题」是兜底动作，不该和「开始游戏」抢同一档视觉重量。
         *
         * 同一天用户又要「增加图标 + 修改文字颜色」：头像换 `ReportIcon`（气泡 + 感叹号），
         * 字色从暗灰改成 `accent` —— 和「分享游戏」那颗、以及这一页资料表里的
         * 「开发商」链接是同一个口径（文字链接 = 强调色）。
         * 钮身没有描边可依托，悬停就靠**文字加下划线**给反馈（`group-hover`，
         * 只划字不划图标，理由同 ShareGameButton）。
         */
        className="group inline-flex items-center gap-1.5 text-[12px] text-accent transition-colors"
      >
        {/* 尺寸**必须传 16**（非整数倍会吃掉 1 单位的线，见 icons.tsx 文件头） */}
        <ReportIcon size={16} />
        <span className="group-hover:underline">{t('gamesPage.report')}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6 py-8"
          onClick={close}
        >
          {/*
            背板用**固定暗色**、不走 `bg-ink-950/70`（别的面板那套）：ink-950 会随主题翻，
            浅色主题下它是近白，叠上去是一片白雾。理由同 PaintingPanel。
          */}
          <div className="absolute inset-0 bg-[#0b0b10]/60 backdrop-blur-[3px]" />

          <form
            role="dialog"
            aria-modal="true"
            aria-label={t('gamesPage.report')}
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void submit(event)}
            className="pixel-edge pxw-3 pxc-600 relative flex w-[440px] max-w-full flex-col gap-3 bg-ink-800 p-4"
          >
            <div className="flex flex-col gap-1">
              <h3 className="text-[12px] text-ink-200">{t('gamesPage.reportTitle')}</h3>
              {/* 报的是哪一款，写清楚 —— 免得用户是在别的游戏上遇到问题，报错了地方 */}
              <p className="text-[12px] text-ink-500">{t('gamesPage.reportSubject', { name: gameName })}</p>
            </div>

            <textarea
              ref={areaRef}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              maxLength={MAX_LENGTH}
              rows={5}
              disabled={state === 'sending'}
              placeholder={t('gamesPage.reportPlaceholder')}
              className="pixel-edge pxw-2 pxc-500 w-full resize-none bg-ink-900 px-2 py-2 text-[12px] leading-relaxed text-ink-100 placeholder:text-ink-600 focus:outline-none disabled:opacity-60"
            />

            <div className="flex items-center gap-3">
              {/* 计数走系统字体（同 FeedbackPanel）：font-pixel 里没有斜杠以外的排版符号 */}
              <span className="text-[12px] text-ink-500">
                {content.length}/{MAX_LENGTH}
              </span>
              {error && <span className="text-[12px] text-danger">{error}</span>}
              {state === 'ok' && <span className="text-[12px] text-ok">{t('gamesPage.reportOk')}</span>}
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={state === 'sending'}
                onClick={close}
                className="pixel-edge pxw-2 pxc-500 bg-ink-800 px-4 py-2 text-[12px] text-ink-300 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('gamesPage.reportClose')}
              </button>
              <button
                type="submit"
                disabled={state === 'sending'}
                className="pixel-edge pxw-2 pxc-500 bg-accent px-4 py-2 text-[12px] text-ink-950 transition-colors enabled:hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {state === 'sending' ? t('gamesPage.reportSubmitting') : t('gamesPage.reportSubmit')}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
