'use client';

import type { Locale } from '@/lib/i18n';
import { h5Text } from '@/lib/h5/ui-text';
import { GameButton, GamePanel, PanelTitle } from './ui';

/**
 * 暂停菜单。
 *
 * 触发来源有两个：玩家按 Esc（浏览器强制放掉指针锁定）和切到后台。
 * 两个都走引擎的 `onPauseChange`，所以这里不需要知道是哪种。
 */
export default function ShipPauseMenu({
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
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#070a0e]/76 backdrop-blur-[3px]">
      <GamePanel className="w-[min(300px,calc(100vw-32px))]">
        <PanelTitle title={h5Text(locale, 'pause.title')} subtitle={h5Text(locale, 'hint.lock')} />

        <div className="flex flex-col gap-2">
          <GameButton onClick={onResume}>{h5Text(locale, 'pause.resume')}</GameButton>
          <GameButton variant="ghost" onClick={onSettings}>
            {h5Text(locale, 'pause.settings')}
          </GameButton>
          {onRestart ? (
            <GameButton variant="ghost" onClick={onRestart}>
              {h5Text(locale, 'pause.restart')}
            </GameButton>
          ) : null}
          <GameButton variant="danger" onClick={onQuit}>
            {h5Text(locale, 'pause.quit')}
          </GameButton>
        </div>
      </GamePanel>
    </div>
  );
}
