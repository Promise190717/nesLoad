'use client';

import type { Locale } from '@/lib/i18n';
import type { MatchResult } from '@/lib/h5/types';
import { actorLabel, h5Text, teamLabel } from '@/lib/h5/ui-text';
import { GameButton, GamePanel } from './ui';
import { TEAM_COLOR } from './weapon-label';

/**
 * 结算面板。
 *
 * 只显示三样东西：**输赢**、**比分**、**自己的战绩**，下面挂一张全表。
 * 不做「经验值 / 连杀 / 命中率」这类统计 —— 引擎没记这些数据，
 * 现编一个假的命中率只会让人不信服。
 */
export default function ShipResultPanel({
  result,
  locale,
  onAgain,
  onLeave,
  markBots = false,
}: {
  result: MatchResult;
  locale: Locale;
  /** 联机局里不传：这一局的比分是全场共用的，单方面「再来一局」会把它清掉 */
  onAgain?: () => void;
  onLeave: () => void;
  /** 联机局里给非真人行标「机」，和计分板保持一致 */
  markBots?: boolean;
}) {
  const headline = result.draw
    ? h5Text(locale, 'result.draw')
    : result.win
      ? h5Text(locale, 'result.win')
      : h5Text(locale, 'result.lose');
  const accent = result.draw ? '#c9cdd4' : result.win ? '#f0a020' : '#ff6b6b';

  const me = result.rows.find((row) => row.isPlayer);
  const mvp = result.mvp;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#070a0e]/82 px-4 backdrop-blur-[2px]">
      <GamePanel className="w-[min(560px,100%)]">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] tracking-[0.3em] text-white/30 uppercase">{h5Text(locale, 'title')}</p>
            <h2 className="mt-1 text-[26px] leading-none font-black" style={{ color: accent }}>
              {headline}
            </h2>
          </div>
          <div className="text-right">
            <div className="flex items-baseline gap-2 font-mono text-[22px] leading-none font-bold tabular-nums">
              <span style={{ color: TEAM_COLOR[0] }}>{result.scoreA}</span>
              <span className="text-[13px] text-white/25">:</span>
              <span style={{ color: TEAM_COLOR[1] }}>{result.scoreB}</span>
            </div>
            <div className="mt-1 flex gap-2 text-[10px] text-white/30">
              <span>{teamLabel(locale, 0)}</span>
              <span>·</span>
              <span>{teamLabel(locale, 1)}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <StatBox
            label={h5Text(locale, 'hud.kills')}
            value={me ? String(me.kills) : '0'}
            highlight
          />
          <StatBox label={h5Text(locale, 'hud.deaths')} value={me ? String(me.deaths) : '0'} />
        </div>

        {mvp ? (
          <div className="mt-2 flex items-center justify-between border border-[#f0a020]/30 bg-[#f0a020]/8 px-3 py-1.5">
            <span className="text-[10px] tracking-[0.2em] text-[#f0a020] uppercase">
              {h5Text(locale, 'result.mvp')}
            </span>
            <span className="text-[12px] font-bold text-white/85">
              {actorLabel(locale, mvp.name, mvp.isPlayer)} · {mvp.kills}
            </span>
          </div>
        ) : null}

        <div className="mt-3 max-h-[190px] overflow-y-auto border-t border-white/8">
          {result.rows.map((row) => (
            <div
              key={row.id}
              className={`flex items-center gap-2 border-b border-white/5 px-1 py-[5px] text-[11px] ${
                row.isPlayer ? 'bg-[#f0a020]/10' : ''
              }`}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: TEAM_COLOR[row.team] }}
              />
              <span className={`flex-1 truncate ${row.isPlayer ? 'font-bold text-[#f0a020]' : 'text-white/70'}`}>
                {actorLabel(locale, row.name, row.isPlayer)}
              </span>
              {markBots && !row.isHuman ? (
                <span className="shrink-0 border border-white/14 px-1 text-[9px] leading-[13px] font-bold text-white/32">
                  {h5Text(locale, 'hud.bot')}
                </span>
              ) : null}
              <span className="w-8 text-right font-mono tabular-nums text-white/60">{row.kills}</span>
              <span className="w-8 text-right font-mono tabular-nums text-white/35">{row.deaths}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          {onAgain ? (
            <GameButton onClick={onAgain} className="flex-1">
              {h5Text(locale, 'result.again')}
            </GameButton>
          ) : null}
          <GameButton variant="ghost" onClick={onLeave} className="flex-1">
            {h5Text(locale, 'result.leave')}
          </GameButton>
        </div>
      </GamePanel>
    </div>
  );
}

function StatBox({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="border border-white/8 bg-black/30 px-3 py-2">
      <div
        className={`font-mono text-[22px] leading-none font-bold tabular-nums ${
          highlight ? 'text-[#f0a020]' : 'text-white/85'
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] tracking-wide text-white/32">{label}</div>
    </div>
  );
}
