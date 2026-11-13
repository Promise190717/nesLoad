'use client';

import type { Locale } from '@/lib/i18n';
import { ADS_SENSITIVITY_RANGE, DEFAULT_SETTINGS, FOV_RANGE, SENSITIVITY_RANGE, type GameSettings, type Quality } from '@/lib/h5/types';
import { h5Text } from '@/lib/h5/ui-text';
import { Divider, Field, GameButton, GamePanel, PanelTitle, Segmented, Slider } from './ui';

/**
 * 设置面板。
 *
 * 四项全部**即时生效**：`onChange` 直接写回宿主 state，宿主再 `applySettings`
 * 给引擎。没有「确定 / 取消」—— 灵敏度和 FOV 是那种「必须边调边看」的参数，
 * 逼玩家先确认再试会让他反复进出面板。
 */
export default function ShipSettingsPanel({
  settings,
  locale,
  onChange,
  onClose,
}: {
  settings: GameSettings;
  locale: Locale;
  onChange: (settings: GameSettings) => void;
  onClose: () => void;
}) {
  const patch = (part: Partial<GameSettings>) => onChange({ ...settings, ...part });

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#070a0e]/80 px-4 backdrop-blur-[2px]">
      <GamePanel className="w-[min(440px,100%)]">
        <PanelTitle title={h5Text(locale, 'settings.title')} />

        <div className="flex flex-col gap-3">
          <Slider
            label={h5Text(locale, 'settings.sensitivity')}
            value={settings.sensitivity}
            min={SENSITIVITY_RANGE.min}
            max={SENSITIVITY_RANGE.max}
            step={0.05}
            display={`${settings.sensitivity.toFixed(2)}×`}
            onChange={(value) => patch({ sensitivity: value })}
          />
          <Slider
            label={h5Text(locale, 'settings.adsSensitivity')}
            value={settings.adsSensitivity}
            min={ADS_SENSITIVITY_RANGE.min}
            max={ADS_SENSITIVITY_RANGE.max}
            step={0.05}
            display={`${settings.adsSensitivity.toFixed(2)}×`}
            onChange={(value) => patch({ adsSensitivity: value })}
          />
          <Slider
            label={h5Text(locale, 'settings.fov')}
            value={settings.fov}
            min={FOV_RANGE.min}
            max={FOV_RANGE.max}
            step={1}
            display={`${settings.fov}°`}
            onChange={(value) => patch({ fov: value })}
          />
          <Slider
            label={h5Text(locale, 'settings.volume')}
            value={settings.volume}
            min={0}
            max={1}
            step={0.05}
            display={`${Math.round(settings.volume * 100)}%`}
            onChange={(value) => patch({ volume: value })}
          />
        </div>

        <Divider />

        <Field label={h5Text(locale, 'settings.quality')}>
          <Segmented<Quality>
            value={settings.quality}
            onChange={(value) => patch({ quality: value })}
            options={[
              { value: 'low', label: h5Text(locale, 'settings.quality.low') },
              { value: 'mid', label: h5Text(locale, 'settings.quality.mid') },
              { value: 'high', label: h5Text(locale, 'settings.quality.high') },
            ]}
          />
        </Field>

        <Divider />

        <div className="flex flex-col gap-1.5 text-[11px] leading-5 text-white/40">
          <span className="text-[10px] tracking-[0.2em] text-white/28 uppercase">
            {h5Text(locale, 'settings.controls')}
          </span>
          <span>{h5Text(locale, 'settings.controls.move')}</span>
          <span>{h5Text(locale, 'settings.controls.fire')}</span>
          <span>{h5Text(locale, 'settings.controls.reload')}</span>
          <span>{h5Text(locale, 'settings.controls.jump')}</span>
          <span>{h5Text(locale, 'settings.controls.weapon')}</span>
          <span>{h5Text(locale, 'settings.controls.grenade')}</span>
          <span>{h5Text(locale, 'settings.controls.pause')}</span>
          <span className="text-white/28">{h5Text(locale, 'settings.touch')}</span>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <GameButton variant="ghost" onClick={() => onChange({ ...DEFAULT_SETTINGS })}>
            {h5Text(locale, 'settings.reset')}
          </GameButton>
          <GameButton onClick={onClose}>{h5Text(locale, 'settings.close')}</GameButton>
        </div>
      </GamePanel>
    </div>
  );
}
