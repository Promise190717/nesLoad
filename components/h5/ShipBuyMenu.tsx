'use client';

import type { Locale } from '@/lib/i18n';
import type { HudSnapshot, PrimaryId } from '@/lib/h5/types';
import { h5Text } from '@/lib/h5/ui-text';
import { PRIMARY_ORDER, WEAPONS } from '@/lib/h5/weapons';
import { GameButton, GamePanel, PanelTitle } from './ui';

/**
 * 换枪菜单（B 键 / 复活提示按钮）。
 *
 * **只在复活窗口内可用** —— 资格规则（存活 + 复活 ≤5s + 本次生命未耗弹）由引擎
 * 判定（`canChangeLoadout`），菜单只负责显示；引擎在 `selectPrimary` 的最终执行
 * 逻辑上还有一道，绕过 UI 也换不了。
 *
 * 数值直接读 `WEAPONS`，不在这里另写一份 —— 换枪菜单上的数字必须和实际手感一致，
 * 两处维护必然分叉。
 */
export default function ShipBuyMenu({
  hud,
  locale,
  onSelect,
  onClose,
}: {
  hud: HudSnapshot;
  locale: Locale;
  onSelect: (id: PrimaryId) => void;
  onClose: () => void;
}) {
  const locked = !hud.canChangeLoadout;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/62 backdrop-blur-[2px]">
      <GamePanel className="w-[min(680px,calc(100vw-32px))]">
        <PanelTitle title={h5Text(locale, 'buy.title')} subtitle={locked ? h5Text(locale, 'buy.locked') : h5Text(locale, 'buy.hint')} />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PRIMARY_ORDER.map((id, index) => {
            const spec = WEAPONS[id];
            const active = hud.primary === id;
            return (
              <button
                key={id}
                type="button"
                disabled={locked}
                onClick={() => onSelect(id)}
                className={`group flex flex-col gap-1 border p-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  active
                    ? 'border-[#f0a020] bg-[#f0a020]/12'
                    : 'border-[#343a42] bg-black/35 hover:border-[#f0a020]/55 hover:bg-[#f0a020]/6'
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] font-bold text-white">{spec.name}</span>
                  <span className="font-mono text-[10px] text-white/30">{index + 1}</span>
                </div>

                <div className="mt-0.5 flex flex-col gap-[3px] font-mono text-[10px] text-white/45">
                  <span>
                    {spec.damage}
                    {spec.pellets > 1 ? ` × ${spec.pellets}` : ''} DMG
                  </span>
                  <span>{Math.round(60 / spec.interval)} RPM</span>
                  <span>
                    {spec.magazine} / ∞
                  </span>
                </div>

                {active ? (
                  <span className="mt-1 text-[10px] font-bold tracking-wide text-[#f0a020]">
                    {h5Text(locale, 'buy.current')}
                  </span>
                ) : (
                  <span className="mt-1 text-[10px] text-transparent group-hover:text-white/25">
                    {h5Text(locale, 'buy.current')}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end">
          <GameButton variant="ghost" onClick={onClose}>
            {h5Text(locale, 'buy.close')}
          </GameButton>
        </div>
      </GamePanel>
    </div>
  );
}
