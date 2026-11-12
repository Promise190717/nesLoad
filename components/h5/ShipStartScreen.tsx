'use client';

import Link from 'next/link';
import type { Locale } from '@/lib/i18n';
import type { Difficulty } from '@/lib/h5/types';
import { h5Text } from '@/lib/h5/ui-text';
import { GameButton, Segmented } from './ui';

/**
 * 开始界面。
 *
 * 只有一个可选参数（人机强度），其余全是说明文字 —— 这张图、这套规则是固定的，
 * 让玩家在开局前调一堆东西只会推迟他开枪的时间。
 *
 * 背景是**真实场景的静止画面**（引擎在构造时已经画了一帧），所以这里只压一层
 * 半透明黑，不用纯色盖住 —— 让人先看见「我要进的是这条船」。
 */
export default function ShipStartScreen({
  locale,
  difficulty,
  onDifficulty,
  onStart,
  onNet,
  onSettings,
  backHref,
}: {
  locale: Locale;
  difficulty: Difficulty;
  onDifficulty: (value: Difficulty) => void;
  onStart: () => void;
  onNet: () => void;
  onSettings: () => void;
  backHref: string;
}) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#070a0e]/74 px-6 backdrop-blur-[2px]">
      <div className="w-[min(520px,100%)]">
        <p className="text-[11px] tracking-[0.36em] text-[#f0a020] uppercase">{h5Text(locale, 'start.eyebrow')}</p>

        <h1 className="mt-2 text-[34px] leading-none font-black tracking-tight text-white sm:text-[44px]">
          {h5Text(locale, 'title')}
        </h1>

        <p className="mt-3 text-[12px] leading-5 text-white/45">{h5Text(locale, 'tagline')}</p>

        <div className="mt-6 flex items-center gap-3 border-y border-white/10 py-3">
          <span className="text-[11px] tracking-wide text-white/40">{h5Text(locale, 'start.difficulty')}</span>
          <Segmented<Difficulty>
            value={difficulty}
            onChange={onDifficulty}
            options={[
              { value: 'easy', label: h5Text(locale, 'setup.difficulty.easy') },
              { value: 'normal', label: h5Text(locale, 'setup.difficulty.normal') },
              { value: 'hard', label: h5Text(locale, 'setup.difficulty.hard') },
            ]}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <GameButton onClick={onStart} className="px-6 py-2.5 text-[14px]">
            {h5Text(locale, 'start.begin')}
          </GameButton>
          {/* 联机入口和「开始战斗」并排：单人局的路径一点没变（还是那颗橙色主按钮），
              联机是它的兄弟而不是前置步骤 —— 需求七.8「单人玩法不受影响」 */}
          <GameButton variant="ghost" onClick={onNet}>
            {h5Text(locale, 'net.entry')}
          </GameButton>
          <GameButton variant="ghost" onClick={onSettings}>
            {h5Text(locale, 'start.settings')}
          </GameButton>
          <Link
            href={backHref}
            className="ml-auto text-[11px] text-white/35 transition-colors hover:text-white/70"
          >
            {h5Text(locale, 'menu.back')}
          </Link>
        </div>

        <p className="mt-5 border-t border-white/8 pt-3 text-[11px] leading-5 text-white/28">
          {h5Text(locale, 'start.hint')}
        </p>
      </div>
    </div>
  );
}
