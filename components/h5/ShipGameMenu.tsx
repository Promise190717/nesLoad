'use client';

import { useEffect, useRef, useState } from 'react';
import type { Locale } from '@/lib/i18n';
import type { NetHud } from '@/lib/h5/types';
import { h5Text } from '@/lib/h5/ui-text';
import { GameButton, GamePanel, PanelTitle } from './ui';

/**
 * 游戏菜单（Esc 放掉指针锁定时弹出）。
 *
 * **不冻结游戏** —— 世界照常跑（联机不能暂停，单机也统一不暂停），
 * 这里只是把设置 / 重开 / 退出的入口挂在画面上。「返回战斗」会关掉菜单
 * 并重新申请指针锁定。
 */
export default function ShipGameMenu({
  locale,
  net,
  onResume,
  onRestart,
  onSettings,
  onQuit,
}: {
  locale: Locale;
  /** 联机局才有：菜单里给一个「复制房间号」的入口。单人局传 null */
  net?: NetHud | null;
  onResume: () => void;
  /** 联机局里不传：重开一局会清掉比分，而比分是全场共用的（需求六.4） */
  onRestart?: () => void;
  onSettings: () => void;
  onQuit: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  /**
   * 复制房间号本体（不是邀请链接 —— 链接由左上角 HUD 那个角标负责）。
   * 菜单是「玩家主动点」的入口，所以比 HUD 角标多一层兜底：非安全上下文
   * （http 部署 / 老浏览器）里没有 clipboard API，退回离屏 textarea +
   * `execCommand('copy')`。它已标废弃，但正因为它「还活着」才值得留作退路
   * （站内 `ShareGameButton` 同一套写法）。
   */
  const copyCode = async () => {
    const text = net?.code;
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.top = '-1000px';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(area);
        if (!ok) return;
      }
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // 复制不了就什么都不做：码还印在画面上，照样能念给别人
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#070a0e]/60 backdrop-blur-[3px]">
      <GamePanel className="w-[min(300px,calc(100vw-32px))]">
        <PanelTitle title={h5Text(locale, 'gamemenu.title')} subtitle={h5Text(locale, 'hint.lock')} />

        {net ? (
          <div className="mb-2 flex items-stretch border border-[#343a42] bg-black/40">
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-2.5 py-1.5">
              <span className="text-[9px] leading-none tracking-[0.14em] text-white/35 uppercase">
                {h5Text(locale, 'gamemenu.roomCode')}
              </span>
              <span className="truncate font-mono text-[15px] leading-none font-bold tracking-[0.22em] text-[#f0a020]">
                {net.code}
              </span>
            </div>
            <button
              type="button"
              onClick={copyCode}
              className="shrink-0 border-l border-[#343a42] px-2.5 text-[11px] font-bold text-white/55 transition-colors hover:bg-[#f0a020]/12 hover:text-[#f0a020]"
            >
              {copied ? h5Text(locale, 'net.copied') : h5Text(locale, 'gamemenu.copyCode')}
            </button>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <GameButton onClick={onResume}>{h5Text(locale, 'gamemenu.resume')}</GameButton>
          <GameButton variant="ghost" onClick={onSettings}>
            {h5Text(locale, 'gamemenu.settings')}
          </GameButton>
          {onRestart ? (
            <GameButton variant="ghost" onClick={onRestart}>
              {h5Text(locale, 'gamemenu.restart')}
            </GameButton>
          ) : null}
          <GameButton variant="danger" onClick={onQuit}>
            {h5Text(locale, 'gamemenu.quit')}
          </GameButton>
        </div>
      </GamePanel>
    </div>
  );
}
