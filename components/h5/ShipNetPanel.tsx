'use client';

import type { Locale } from '@/lib/i18n';
import type { Team } from '@/lib/h5/types';
import type { NetErrorCode, RosterWire } from '@/lib/h5/net/protocol';
import { h5Text, teamLabel, type H5TextKey } from '@/lib/h5/ui-text';
import H5Cover from './H5Cover';
import { GameButton, GamePanel, PanelTitle } from './ui';
import { TEAM_COLOR } from './weapon-label';

/**
 * 联机面板 —— **纯展示**，所有网络副作用都在 `ShipGameShell` 里。
 *
 * 2026-11-13 起它只剩「过程页」：建房 / 加房 / 名字 / 房间码 / 附近房间全搬到了
 * 模式页（`ShipModeSelect`），点完即意图，不再有「先点继续、再选建房还是加房」
 * 这一层。所以这里只有四个状态：
 *
 *   连接中（房主握手）──就绪──▶（宿主直接开局，面板消失）
 *   选阵营（加入者）──选好──▶ 等待回执 ──就绪──▶ 载入页 ──▶（开局）
 *   出错 / 房主走了 / 对局结束 ──▶ 回模式页
 *
 * 注意「选阵营」现在排在**载入之前**：点「加入房间」就落这一屏（会话先连上，
 * 人数才是实时的），选完才去拉资源。所以这一屏常常是引擎还没建的状态 ——
 * `cover` 就是为它准备的背景图。
 *
 * 为什么不做成「面板自己开会话」：会话活到对局里（要一直推快照），而面板只在
 * 开局前存在。让面板持有会话，就得在它卸载时把会话交接给宿主，中间任何一次
 * 提前卸载都会把房间悄悄关掉。宿主本来就是唯一活过整局的东西，会话归它管。
 */

/** 联机面板能出现的四个「过程」状态。没有 menu —— 那一页已经并进模式页了 */
export type NetScreen = 'connecting' | 'team' | 'error' | 'left' | 'ended';

export interface ShipNetPanelProps {
  locale: Locale;
  screen: NetScreen;
  /** `screen === 'error'` 时的稳定码 */
  error: NetErrorCode | null;
  /** 加入者：房主推来的名单。还没收到时是 null */
  roster: RosterWire | null;
  /** 正在加入的房间码（阵营界面标题上显示） */
  code: string;
  /** 正在等房主回执 —— 阵营卡片全部禁用 */
  joining: boolean;
  /**
   * 引擎还没建（加入者选阵营时就是这样）：面板背后什么都没有，铺一张运输船封面。
   * 有引擎时不开 —— 那时画布上是真实场景，盖图反而把战况挡住。
   */
  cover: boolean;
  onPickTeam: (team: Team) => void;
  /** 回模式页（会顺带退出联机）。连接中、选阵营、出错、房主走了，全走这一条 */
  onBack: () => void;
}

export default function ShipNetPanel({
  locale,
  screen,
  error,
  roster,
  code,
  joining,
  cover,
  onPickTeam,
  onBack,
}: ShipNetPanelProps) {
  const text = (key: H5TextKey, vars?: Record<string, string | number>) => h5Text(locale, key, vars);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-[#070a0e]/84 px-5 py-8 backdrop-blur-[3px]">
      {/* 没有引擎时背后是纯黑：铺一张和模式页同一套的甲板图，进来出去像同一屏 */}
      {cover ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute right-[-10%] bottom-[-14%] w-[min(1100px,150%)] opacity-25">
            <H5Cover accent="#f0a020" />
          </div>
          <div className="absolute inset-0 bg-[linear-gradient(100deg,#080b0f_0%,rgba(8,11,15,.94)_32%,rgba(8,11,15,.56)_68%,rgba(8,11,15,.9)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_74%_14%,rgba(240,160,32,.13),transparent_62%)]" />
        </div>
      ) : null}

      <GamePanel className="relative w-[min(560px,100%)]">
        {screen === 'team' ? (
          <TeamScreen
            locale={locale}
            code={code}
            roster={roster}
            joining={joining}
            onPick={onPickTeam}
            onCancel={onBack}
          />
        ) : null}

        {screen === 'connecting' ? (
          <>
            <PanelTitle title={text('net.title')} subtitle={text('net.connecting')} />
            <p className="text-[12px] leading-5 text-white/45">{text('net.waitingHost')}</p>
            <div className="mt-5 flex justify-end">
              <GameButton variant="ghost" onClick={onBack}>
                {text('mode.back')}
              </GameButton>
            </div>
          </>
        ) : null}

        {screen === 'error' ? (
          <>
            <PanelTitle title={text('net.title')} subtitle={error ? text(`net.err.${error}`) : text('net.err.join-failed')} />
            <div className="mt-5 flex justify-end gap-2">
              <GameButton variant="ghost" onClick={onBack}>
                {text('mode.back')}
              </GameButton>
            </div>
          </>
        ) : null}

        {screen === 'left' || screen === 'ended' ? (
          <>
            <PanelTitle
              title={screen === 'left' ? text('net.leftTitle') : text('net.endedTitle')}
              subtitle={screen === 'left' ? text('net.leftHint') : text('net.endedHint')}
            />
            <div className="mt-5 flex justify-end">
              <GameButton onClick={onBack}>{text('mode.back')}</GameButton>
            </div>
          </>
        ) : null}
      </GamePanel>
    </div>
  );
}

/* ============================================================
   阵营选择
   ============================================================ */

function TeamScreen({
  locale,
  code,
  roster,
  joining,
  onPick,
  onCancel,
}: {
  locale: Locale;
  code: string;
  roster: RosterWire | null;
  joining: boolean;
  onPick: (team: Team) => void;
  onCancel: () => void;
}) {
  const open = roster?.o !== false;

  return (
    <>
      <PanelTitle
        title={h5Text(locale, 'net.teamTitle')}
        subtitle={roster ? h5Text(locale, 'net.teamHint') : h5Text(locale, 'net.waitingHost')}
      />

      {roster ? (
        <>
          <div className="mb-3 flex items-center justify-between text-[11px] text-white/40">
            <span className="font-mono tracking-[0.18em] text-[#f0a020]">
              {h5Text(locale, 'net.room', { code })}
            </span>
            <span className="max-w-[55%] truncate pl-3 text-white/55">{roster.n}</span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {([0, 1] as const).map((team) => {
              const slot = roster.t[team];
              const canJoin = open && slot.b > 0;
              return (
                <button
                  key={team}
                  type="button"
                  disabled={!canJoin || joining}
                  onClick={() => onPick(team)}
                  className={`border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed ${
                    canJoin
                      ? 'border-[#343a42] hover:border-[#f0a020]/70 hover:bg-white/5'
                      : 'border-white/8 opacity-45'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold" style={{ color: TEAM_COLOR[team] }}>
                      {teamLabel(locale, team)}
                    </span>
                    <span className={`text-[10px] font-bold ${canJoin ? 'text-[#7f9a6b]' : 'text-white/30'}`}>
                      {canJoin ? h5Text(locale, 'net.canJoin') : h5Text(locale, 'net.full')}
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-3 font-mono text-[11px] tabular-nums">
                    <span className="text-white/70">{h5Text(locale, 'net.humans', { count: slot.h })}</span>
                    <span className="text-white/35">{h5Text(locale, 'net.bots', { count: slot.b })}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {!open ? (
            <p className="mt-3 border border-[#8a3030]/60 bg-[#8a3030]/12 px-3 py-2 text-[11px] leading-5 text-[#ff8a8a]">
              {h5Text(locale, 'net.endedHint')}
            </p>
          ) : null}
        </>
      ) : (
        <div className="flex items-center gap-2 border border-dashed border-white/12 px-3 py-4">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#f0a020]" />
          <span className="text-[11px] text-white/40">{h5Text(locale, 'net.connecting')}</span>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between border-t border-white/8 pt-3">
        <span className="text-[11px] text-white/30">
          {joining ? h5Text(locale, 'net.joining') : h5Text(locale, 'net.teamHint')}
        </span>
        <GameButton variant="ghost" onClick={onCancel} disabled={joining}>
          {h5Text(locale, 'net.back')}
        </GameButton>
      </div>
    </>
  );
}
