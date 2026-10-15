'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { isPlayActive, subscribePlayActive } from '@/lib/play-leave-guard';
import { useI18n } from './I18nProvider';

/**
 * `/play` 左上角那颗返回（2026-10-15 加）。
 *
 * 为什么不直接用 `BackLink`：`GamesShell` 是服务端组件，它画的那颗返回
 * （`back.mode: 'history'`）点下去就是回退，不知道游戏正在跑。而运行状态在
 * `PlayScene` 里 —— 两边隔着一层服务端渲染，接不了 props / context，
 * 所以借 `lib/play-leave-guard.ts` 这个模块级信号搭桥。
 *
 * 行为：外观和 `GamesShell` wide 模式那颗返回**一模一样**（同一串类名，改一边
 * 记得看另一边）；游戏运行中（ROM 已载入，或联机加入者已连上房主）点击时
 * 弹**自绘确认弹窗**（2026-10-15 用户要求：不用系统级 `window.confirm`），
 * 「继续游戏」留在原地、「离开并返回」才回退。
 */
export default function PlayBackLink({ href }: { href: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const active = useSyncExternalStore(
    subscribePlayActive,
    isPlayActive,
    () => false
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const stayRef = useRef<HTMLButtonElement>(null);

  /* 弹窗开着时：Esc = 继续游戏；进来自动聚焦「继续游戏」，回车默认留下。 */
  useEffect(() => {
    if (!confirmOpen) return;
    stayRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [confirmOpen]);

  const leave = () => {
    setConfirmOpen(false);
    if (window.history.length > 1) router.back();
    else router.push(href);
  };

  return (
    <>
      {/*
        用 `<button>` 不用 `<a>`（2026-10-15 用户要求）：TopBar 那边对 `<a>`
        有联动（悬停 / 焦点会顶到顶栏的样式），返回是纯行为不需要真链接。
        落点 `href` 只剩兜底语义：`history.length <= 1` 时 push 过去。
      */}
      <button
        type="button"
        className="pixel-edge pxw-1 pxc-600 inline-flex shrink-0 cursor-pointer items-center gap-1.5 bg-ink-900 px-2.5 py-1.5 text-[11px] text-ink-200 transition-colors hover:text-accent"
        onClick={() => {
          if (active) {
            setConfirmOpen(true);
            return;
          }
          if (window.history.length > 1) router.back();
          else router.push(href);
        }}
      >
        <span aria-hidden="true">←</span>
        <span>{t('common.back')}</span>
      </button>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4"
          onClick={() => setConfirmOpen(false)}
        >
          {/* 规格对齐游戏库那个弹窗（pixel-edge pxw-4 pxc-600 + bg-ink-800），两处是一家 */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('play.leaveTitle')}
            className="pixel-edge pxw-4 pxc-600 w-full max-w-sm bg-ink-800 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-pixel text-[11px] tracking-wider text-accent">
              {t('play.leaveTitle')}
            </p>
            <p className="mt-3 text-[13px] leading-6 text-ink-200">
              {t('play.leaveBody')}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                ref={stayRef}
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="pixel-edge pxw-2 pxc-500 flex h-[28px] items-center bg-ink-700 px-3 text-[12px] text-ink-200 transition-colors hover:text-accent"
              >
                {t('play.leaveStay')}
              </button>
              <button
                type="button"
                onClick={leave}
                className="pixel-edge pxw-2 pxc-500 flex h-[28px] items-center bg-accent px-3 text-[12px] text-ink-950 transition-opacity hover:opacity-90"
              >
                {t('play.leaveGo')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
