'use client';

import type { Locale } from '@/lib/i18n';
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
  onResume,
  onRestart,
  onSettings,
  onQuit,
}: {
  locale: Locale;
  onResume: () => void;
  /** 联机局里不传：重开一局会清掉比分，而比分是全场共用的（需求六.4） */
  onRestart?: () => void;
  onSettings: () => void;
  onQuit: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#070a0e]/60 backdrop-blur-[3px]">
      <GamePanel className="w-[min(300px,calc(100vw-32px))]">
        <PanelTitle title={h5Text(locale, 'gamemenu.title')} subtitle={h5Text(locale, 'hint.lock')} />

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
