'use client';

import type { Locale } from '@/lib/i18n';
import type { HudSnapshot, ScoreRow } from '@/lib/h5/types';
import { actorLabel, h5Text, teamLabel } from '@/lib/h5/ui-text';
import { TEAM_COLOR } from './weapon-label';

/**
 * 计分板（Tab 按住显示）。
 *
 * 两列并排 —— 这是 CS/CF 的固定布局，玩家不用学。**不做成可排序表格**：
 * 一场 10 人、最多几分钟，排序没有意义，而每一行都要按 `kills` 重排会让
 * 玩家在「我刚打死一个」的瞬间失去自己的位置。
 */
export default function ShipScoreboard({
  hud,
  locale,
  killTarget,
}: {
  hud: HudSnapshot;
  locale: Locale;
  killTarget: number;
}) {
  const teamA = hud.rows.filter((row) => row.team === 0);
  const teamB = hud.rows.filter((row) => row.team === 1);
  /**
   * 要不要给每一行标「机」。
   *
   * **只在联机局里标**（`hud.net !== null`）。单人局里 9 个都是人机，标满一整列
   * 「机」既没有信息量，也违反了「单人玩法不受影响」那条验收 —— 联机才是唯一
   * 需要「一眼分清谁是人」的场景。
   */
  const markBots = hud.net !== null;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/62 backdrop-blur-[2px]">
      <div className="w-[min(720px,calc(100vw-32px))] border border-[#343a42] bg-[#0f1318]/96">
        <div className="flex items-center justify-between border-b border-[#343a42] px-4 py-2">
          <span className="text-[13px] font-bold tracking-[0.2em] text-[#f0a020] uppercase">
            {h5Text(locale, 'hud.scoreboard')}
          </span>
          <span className="font-mono text-[12px] text-white/45">
            {formatClock(hud.timeLeft)} · {h5Text(locale, 'hud.target', { count: killTarget })}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-0 sm:grid-cols-2">
          <TeamColumn
            label={teamLabel(locale, 0)}
            score={hud.scoreA}
            rows={teamA}
            color={TEAM_COLOR[0]}
            locale={locale}
            markBots={markBots}
          />
          <TeamColumn
            label={teamLabel(locale, 1)}
            score={hud.scoreB}
            rows={teamB}
            color={TEAM_COLOR[1]}
            locale={locale}
            markBots={markBots}
            bordered
          />
        </div>
      </div>
    </div>
  );
}

function TeamColumn({
  label,
  score,
  rows,
  color,
  locale,
  markBots,
  bordered = false,
}: {
  label: string;
  score: number;
  rows: ScoreRow[];
  color: string;
  locale: Locale;
  markBots: boolean;
  bordered?: boolean;
}) {
  return (
    <div className={bordered ? 'border-t border-[#343a42] sm:border-t-0 sm:border-l' : ''}>
      <div className="flex items-center justify-between px-3 py-2" style={{ background: `${color}14` }}>
        <span className="text-[12px] font-bold tracking-wide" style={{ color }}>
          {label}
        </span>
        <span className="font-mono text-[15px] font-bold tabular-nums" style={{ color }}>
          {score}
        </span>
      </div>

      <div className="flex items-center gap-2 px-3 py-1 text-[10px] tracking-wide text-white/30">
        <span className="flex-1">—</span>
        <span className="w-8 text-right">{h5Text(locale, 'hud.kills')}</span>
        <span className="w-8 text-right">{h5Text(locale, 'hud.deaths')}</span>
      </div>

      {rows.map((row) => (
        <div
          key={row.id}
          className={`flex items-center gap-2 border-t border-white/6 px-3 py-[5px] text-[12px] ${
            row.isPlayer ? 'bg-[#f0a020]/12' : ''
          }`}
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: row.alive ? color : '#4a4f57' }}
          />
          <span className={`flex-1 truncate ${row.isPlayer ? 'font-bold text-[#f0a020]' : 'text-white/78'}`}>
            {actorLabel(locale, row.name, row.isPlayer)}
          </span>
          {/* 「机」标记：需求五.1 的**文字那一半**。模型那一半在 `actor-view.ts`
              （人机是金属头 + 天线 + 单眼，真人是头盔 + 护甲 + 背包）。这里不写
              「BOT」全称：这一列窄，两个字母会把名字挤掉 */}
          {markBots && !row.isHuman ? (
            <span className="shrink-0 border border-white/14 px-1 text-[9px] leading-[13px] font-bold text-white/32">
              {h5Text(locale, 'hud.bot')}
            </span>
          ) : null}
          <span className="w-8 text-right font-mono tabular-nums text-white/70">{row.kills}</span>
          <span className="w-8 text-right font-mono tabular-nums text-white/40">{row.deaths}</span>
        </div>
      ))}
    </div>
  );
}

/** 秒 → `M:SS`。和 HUD 计时器同一套格式。 */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
