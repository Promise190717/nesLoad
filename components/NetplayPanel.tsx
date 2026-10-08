'use client';

import { useEffect, useState } from 'react';
import type { NetplayState } from '@/lib/netplay';
import { useI18n } from './I18nProvider';

interface NetplayPanelProps {
  open: boolean;
  state: NetplayState;
  busy: boolean;
  onClose: () => void;
  onCreate: () => void;
  onJoin: (code: string) => void;
  onLeave: () => void;
}

/**
 * 联机面板。和存档列表一样浮在房间上、**不进屏幕** ——
 * 「屏幕里不放任何文案」是这个项目的硬规矩（见 RetroTv）。
 *
 * 三个状态各自成屏：
 *   idle      → 创建 / 输入码加入
 *   waiting   → 亮出房间码 + 「等待对方」
 *   connected → 亮出房间码 + 延迟
 *
 * 加入者这边还多两条只有它才看得到的信息：房主在玩哪盘、以及「连上了但房主还没插卡」。
 * 后者必须有 —— 加入者本机没有卡带，房主不出画面时他的屏幕就是一片雪花，
 * 没有这句话就只能干等着猜。
 */
export default function NetplayPanel({
  open,
  state,
  busy,
  onClose,
  onCreate,
  onJoin,
  onLeave,
}: NetplayPanelProps) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  // 复制成功的小提示过一会儿自己收回去
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!open) return null;

  const inRoom = state.status !== 'idle';
  const errorText = state.error
    ? state.error === 'bad-code'
      ? t('netplay.badCode')
      : t('netplay.failed')
    : null;

  const copyCode = async () => {
    if (!state.code) return;
    try {
      await navigator.clipboard.writeText(state.code);
      setCopied(true);
    } catch {
      // 剪贴板被拒（非安全上下文 / 用户拒绝）时静默：码就在屏幕上，手抄也行
    }
  };

  const submitJoin = () => {
    if (!code.trim()) return;
    onJoin(code);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-ink-950/70" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('netplay.title')}
        className="relative w-[420px] max-w-full bg-ink-800 pixel-edge pxw-4 pxc-600"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b-2 border-ink-900 bg-ink-850 px-4 py-3">
          <span className="text-[12px] text-ink-200">{t('netplay.title')}</span>
          <button
            type="button"
            aria-label={t('netplay.close')}
            onClick={onClose}
            className="pixel-edge pxw-2 pxc-500 ml-auto flex h-[18px] w-[18px] items-center justify-center bg-ink-700 text-[10px] leading-none text-ink-100 hover:bg-danger hover:text-ink-950"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          {!inRoom ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onCreate}
                className="pixel-edge pxw-3 pxc-600 block w-full bg-accent py-2 text-[12px] text-ink-950 transition-colors enabled:hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {t('netplay.create')}
              </button>

              <div className="flex items-center gap-2">
                <span className="h-[2px] flex-1 bg-ink-900" />
                <span className="text-[10px] text-ink-500">{t('netplay.or')}</span>
                <span className="h-[2px] flex-1 bg-ink-900" />
              </div>

              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitJoin();
                  }}
                  maxLength={4}
                  placeholder={t('netplay.codePlaceholder')}
                  aria-label={t('netplay.codePlaceholder')}
                  className="pixel-edge pxw-2 pxc-500 min-w-0 flex-1 bg-ink-900 px-2 py-2 font-pixel text-[14px] uppercase tracking-[0.25em] text-ink-100 placeholder:text-ink-600 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={busy || !code.trim()}
                  onClick={submitJoin}
                  className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-3 py-2 text-[12px] text-ink-100 transition-colors enabled:hover:bg-ink-600 enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {t('netplay.join')}
                </button>
              </div>

              <p className="text-[11px] leading-relaxed text-ink-500">{t('netplay.hint')}</p>
            </>
          ) : (
            <>
              <div className="flex flex-col items-center gap-1 border-b-2 border-ink-900 pb-4">
                <span className="text-[10px] text-ink-500">{t('netplay.roomCode')}</span>
                <div className="flex items-center gap-3">
                  <span className="font-pixel text-[22px] tracking-[0.3em] text-accent">
                    {state.code}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyCode()}
                    className="pixel-edge pxw-2 pxc-500 bg-ink-700 px-2 py-1 text-[10px] text-ink-200 transition-colors hover:bg-ink-600 hover:text-accent"
                  >
                    {copied ? t('netplay.copied') : t('netplay.copy')}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[12px]">
                <span
                  className={`h-[7px] w-[7px] shrink-0 ${
                    state.status === 'connected' ? 'bg-ok' : 'bg-accent'
                  }`}
                />
                <span className="text-ink-200">
                  {state.status === 'connected' ? t('netplay.connected') : t('netplay.waiting')}
                </span>
                {state.status === 'connected' && state.rtt !== null && (
                  <span className="ml-auto font-pixel text-[9px] text-ink-400">
                    {Math.round(state.rtt)}ms
                  </span>
                )}
              </div>

              {/*
                只有加入者看得到这一段：房主出画面之前他的屏幕一直是雪花，
                所以「连上了，在等房主插卡」这件事必须在面板上说清楚。
              */}
              {state.role === 'guest' && state.status === 'connected' && (
                <div className="flex items-center gap-2 text-[12px]">
                  {state.remotePlaying && state.remoteGame ? (
                    <>
                      <span className="text-[10px] text-ink-500">{t('netplay.hostPlaying')}</span>
                      <span className="min-w-0 flex-1 truncate text-ink-200">
                        {state.remoteGame.name}
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-500">{t('netplay.waitingGame')}</span>
                  )}
                </div>
              )}

              <p className="text-[11px] leading-relaxed text-ink-500">
                {state.role === 'host' ? t('netplay.youAreHost') : t('netplay.youAreGuest')}
              </p>

              <button
                type="button"
                disabled={busy}
                onClick={onLeave}
                className="pixel-edge pxw-2 pxc-500 block w-full bg-ink-700 py-2 text-[12px] text-ink-100 transition-colors enabled:hover:bg-danger enabled:hover:text-ink-950 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {t('netplay.leave')}
              </button>
            </>
          )}

          {errorText && <p className="text-[11px] text-danger">{errorText}</p>}
        </div>
      </div>
    </div>
  );
}
