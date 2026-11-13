'use client';

import type { Locale } from '@/lib/i18n';
import { h5Text, type H5TextKey } from '@/lib/h5/ui-text';
import { GameButton } from './ui';
import type { GameMode } from './ShipModeSelect';

/**
 * 选完模式之后的**载入页**。
 *
 * 进度不是假动画：`pct` 由 `ShipGameShell` 按真实节点推进 ——
 * 引擎构造（建上下文 / 烘地图）→ 五个枪模（`preloadWeaponGlbs` 逐个回调）
 * → 首帧落屏（shader 编译）。只有引擎构造那一段是同步的，那期间进度条会停住，
 * 所以旁边留了一个会呼吸的小方块：主线程被占满时 CSS 的 opacity 动画仍在合成器
 * 上跑，看起来是「还在干活」而不是「卡死了」。
 *
 * 视觉照 CF 的载入界面：整屏近黑、左下角压着地图名、右下角一个大号百分比，
 * 底下一根细进度条。**不放转圈菊花** —— CF 没有，而且转圈说不出「到哪一步了」。
 */

export type LoadStage = 'boot' | 'engine' | 'weapons' | 'warmup' | 'done';

const STAGE_KEY: Record<LoadStage, H5TextKey> = {
  boot: 'load.stage.boot',
  engine: 'load.stage.engine',
  weapons: 'load.stage.weapons',
  warmup: 'load.stage.warmup',
  done: 'load.stage.done',
};

export default function ShipLoading({
  locale,
  mode,
  pct,
  stage,
  detail,
  failed,
  onBack,
}: {
  locale: Locale;
  mode: GameMode;
  /** 0..100，只增不减 */
  pct: number;
  stage: LoadStage;
  /** 进度条右侧的小字（枪模是 `3/5`，其它阶段为空） */
  detail?: string;
  /** 引擎构造抛错（多半是这台设备没有 WebGL）—— 不让人永远卡在这一页 */
  failed: boolean;
  onBack: () => void;
}) {
  const value = Math.min(100, Math.max(0, Math.round(pct)));
  const label = h5Text(locale, mode === 'net' ? 'mode.net' : 'mode.solo');

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[#070a0e]">
      {/* 背景：一层极淡的橙色辉光 + 细网格，避免整屏死黑 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_18%_88%,rgba(240,160,32,.10),transparent_58%)]" />
        <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.022)_0_1px,transparent_1px_56px)]" />
      </div>

      <div className="relative flex flex-1 items-center px-6 sm:px-12">
        <div className="w-[min(620px,100%)]">
          <div className="flex items-center gap-2">
            <span className="h-[3px] w-7 bg-[#f0a020]" />
            <p className="text-[10px] tracking-[0.36em] text-[#f0a020] uppercase">H5 ZONE</p>
          </div>

          <div className="mt-4 flex items-end justify-between gap-5">
            <div className="min-w-0">
              <h1 className="text-[26px] leading-none font-black tracking-tight text-white sm:text-[32px]">
                {h5Text(locale, 'title')}
              </h1>
              <p className="mt-2 truncate text-[11px] tracking-wide text-white/35">{label}</p>
            </div>
            <span className="shrink-0 font-mono text-[34px] leading-none font-bold tabular-nums text-[#f0a020] sm:text-[44px]">
              {value}
              <span className="ml-0.5 text-[13px] font-normal text-white/30">%</span>
            </span>
          </div>

          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
            className="mt-5 h-[6px] w-full border border-[#343a42] bg-[#11161c]"
          >
            {/* width 过渡只在每段进度之间补个缓动；主线程被占住时它会停住，这是事实，不装 */}
            <div
              className="h-full bg-gradient-to-r from-[#d98c12] via-[#f0a020] to-[#ffc45c]"
              style={{ width: `${value}%`, transition: 'width 380ms cubic-bezier(.22,.7,.2,1)' }}
            />
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-3 font-mono text-[10px] tracking-wide">
            <span className="flex min-w-0 items-center gap-2 text-white/30">
              {failed || value >= 100 ? null : <span className="h-1.5 w-1.5 shrink-0 animate-pulse bg-[#f0a020]" />}
              <span className={`truncate ${failed ? 'text-[#ff8a8a]' : ''}`}>
                {failed ? h5Text(locale, 'load.failed') : h5Text(locale, STAGE_KEY[stage])}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-white/25">{detail}</span>
          </div>
        </div>
      </div>

      <div className="relative border-t border-white/6 px-6 py-3.5 sm:px-12">
        {failed ? (
          <GameButton variant="ghost" onClick={onBack}>
            {h5Text(locale, 'mode.back')}
          </GameButton>
        ) : (
          <p className="text-[10px] leading-5 text-white/22 sm:text-[11px]">{h5Text(locale, 'start.hint')}</p>
        )}
      </div>
    </div>
  );
}
