'use client';

import { useEffect } from 'react';
import { useI18n } from './I18nProvider';

interface JoinRoomPromptProps {
  /** 链接里带进来的房间码（已归一大写）。 */
  code: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 「有人邀请你进房间」的确认框。
 *
 * 为什么不当成「打开链接就直接进房间」：一条链接可能是很久以前发的（房主早走了），
 * 也可能是在群里被转了好几手 —— 光点一下就自动连上别人的房间太突然，
 * 而且**房间码本身要让用户看一眼**，他才对得上「朋友说的那个房间」。
 * 所以这里只做一件事：把码亮出来，等一个明确的「加入」。
 *
 * z 轴比别的面板高一层（`z-[60]`）：它可能和操作指引、联机面板同时在场 ——
 * 从分享链接进来的新用户身上就会同时撞上「初次访问的指引」，邀请得压在上面。
 */
export default function JoinRoomPrompt({ code, onConfirm, onCancel }: JoinRoomPromptProps) {
  const { t } = useI18n();

  // Esc = 取消（和存档 / 联机 / 游戏库那几块面板同一个约定）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6" onClick={onCancel}>
      <div className="absolute inset-0 bg-ink-950/70" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('netplay.inviteTitle')}
        className="relative w-[360px] max-w-full bg-ink-800 pixel-edge pxw-4 pxc-600"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b-2 border-ink-900 bg-ink-850 px-4 py-3">
          <span className="text-[12px] text-ink-200">{t('netplay.inviteTitle')}</span>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <p className="text-[12px] text-ink-100">{t('netplay.inviteBody', { code })}</p>

          {/*
            码再单独亮一遍。问句里已经带了它，但那是系统字体、混在一句话里 ——
            这一段是「核对用」的，和联机面板里那个房间码同一套字模（font-pixel）。
          */}
          <span className="self-center font-pixel text-[22px] tracking-[0.3em] text-accent">
            {code}
          </span>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onConfirm}
              className="pixel-edge pxw-3 pxc-600 block flex-1 bg-accent py-2 text-[12px] text-ink-950 transition-colors hover:bg-accent/80"
            >
              {t('netplay.inviteJoin')}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="pixel-edge pxw-2 pxc-500 block flex-1 bg-ink-700 py-2 text-[12px] text-ink-200 transition-colors hover:bg-ink-600 hover:text-ink-100"
            >
              {t('netplay.inviteCancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
