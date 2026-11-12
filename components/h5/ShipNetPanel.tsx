'use client';

import { useState } from 'react';
import type { Locale } from '@/lib/i18n';
import type { Team } from '@/lib/h5/types';
import { CODE_LENGTH, normalizeRoomCode, type NetErrorCode, type RosterWire } from '@/lib/h5/net/protocol';
import type { LobbyEntry } from '@/lib/h5/net/session';
import { h5Text, teamLabel, type H5TextKey } from '@/lib/h5/ui-text';
import { GameButton, GamePanel, PanelTitle } from './ui';
import { TEAM_COLOR } from './weapon-label';

/**
 * 联机面板 —— **纯展示**，所有网络副作用都在 `ShipGameShell` 里。
 *
 * 为什么不做成「面板自己开会话」：会话活到对局里（要一直推快照），而面板只在
 * 开局前存在。让面板持有会话，就得在它卸载时把会话交接给宿主，中间任何一次
 * 提前卸载都会把房间悄悄关掉。宿主本来就是唯一活过整局的东西，会话归它管。
 *
 * 屏幕状态（`screen`）由宿主算，面板只按它画：
 *
 *   menu ──建房──▶ connecting ──就绪──▶（宿主直接开局，面板消失）
 *     │                └──失败──▶ error
 *     └──加入──▶ team ──选阵营──▶ connecting ──就绪──▶（开局）
 *                    └──房主拒绝──▶ error / ended
 *   对局中房主离开 ──▶ left
 */

export type NetScreen = 'menu' | 'connecting' | 'team' | 'error' | 'left' | 'ended';

export interface ShipNetPanelProps {
  locale: Locale;
  screen: NetScreen;
  /** `screen === 'error'` 时的稳定码 */
  error: NetErrorCode | null;
  /** 加入者：房主推来的名单。还没收到时是 null */
  roster: RosterWire | null;
  /** 正在加入的房间码（阵营界面标题上显示） */
  code: string;
  /** 本机玩家名（受控） */
  name: string;
  onName: (next: string) => void;
  /** 附近的房间（大厅广播） */
  rooms: readonly LobbyEntry[];
  /** 正在等房主回执 —— 阵营卡片全部禁用 */
  joining: boolean;
  onCreate: () => void;
  onJoin: (code: string) => void;
  onPickTeam: (team: Team) => void;
  /** 回开始界面（会顺带退出联机） */
  onBack: () => void;
  /** 取消等待，回到 menu */
  onCancel: () => void;
}

export default function ShipNetPanel({
  locale,
  screen,
  error,
  roster,
  code,
  name,
  onName,
  rooms,
  joining,
  onCreate,
  onJoin,
  onPickTeam,
  onBack,
  onCancel,
}: ShipNetPanelProps) {
  const text = (key: H5TextKey, vars?: Record<string, string | number>) => h5Text(locale, key, vars);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-[#070a0e]/84 px-5 py-8 backdrop-blur-[3px]">
      <GamePanel className="w-[min(560px,100%)]">
        {screen === 'menu' ? (
          <MenuScreen
            locale={locale}
            name={name}
            onName={onName}
            initialCode={code}
            rooms={rooms}
            onCreate={onCreate}
            onJoin={onJoin}
            onBack={onBack}
          />
        ) : null}

        {screen === 'team' ? (
          <TeamScreen
            locale={locale}
            code={code}
            roster={roster}
            joining={joining}
            onPick={onPickTeam}
            onCancel={onCancel}
          />
        ) : null}

        {screen === 'connecting' ? (
          <>
            <PanelTitle title={text('net.title')} subtitle={text('net.connecting')} />
            <p className="text-[12px] leading-5 text-white/45">{text('net.waitingHost')}</p>
            <div className="mt-5 flex justify-end">
              <GameButton variant="ghost" onClick={onCancel}>
                {text('net.back')}
              </GameButton>
            </div>
          </>
        ) : null}

        {screen === 'error' ? (
          <>
            <PanelTitle title={text('net.title')} subtitle={error ? text(`net.err.${error}`) : text('net.err.join-failed')} />
            <div className="mt-5 flex justify-end gap-2">
              <GameButton variant="ghost" onClick={onBack}>
                {text('net.single')}
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
              <GameButton onClick={onBack}>{text('net.single')}</GameButton>
            </div>
          </>
        ) : null}
      </GamePanel>
    </div>
  );
}

/* ============================================================
   菜单
   ============================================================ */

function MenuScreen({
  locale,
  name,
  onName,
  initialCode,
  rooms,
  onCreate,
  onJoin,
  onBack,
}: {
  locale: Locale;
  name: string;
  onName: (next: string) => void;
  /** 邀请链接带来的码（`?shiproom=`）。没有就是空串 */
  initialCode: string;
  rooms: readonly LobbyEntry[];
  onCreate: () => void;
  onJoin: (code: string) => void;
  onBack: () => void;
}) {
  // 只在挂载时取初值：这个屏幕切走就卸载，回来时重新读一遍 `initialCode`
  const [draft, setDraft] = useState(initialCode);
  const code = normalizeRoomCode(draft);
  const ready = code !== null;

  return (
    <>
      <PanelTitle title={h5Text(locale, 'net.title')} subtitle={h5Text(locale, 'net.subtitle')} />

      <label className="block">
        <span className="mb-1 text-[11px] tracking-wide text-white/45">{h5Text(locale, 'net.name')}</span>
        <input
          value={name}
          onChange={(event) => onName(event.target.value.slice(0, 16))}
          placeholder={h5Text(locale, 'net.namePlaceholder')}
          maxLength={16}
          className="w-full border border-[#343a42] bg-black/45 px-3 py-2 text-[13px] text-white outline-none focus:border-[#f0a020]/70"
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <GameButton onClick={onCreate} className="px-5 py-2.5 text-[13px]">
          {h5Text(locale, 'net.create')}
        </GameButton>
        <span className="text-[11px] text-white/32">{h5Text(locale, 'net.startHint')}</span>
      </div>

      <div className="my-4 h-px w-full bg-white/8" />

      <div className="flex items-end gap-2">
        <label className="flex-1">
          <span className="mb-1 block text-[11px] tracking-wide text-white/45">{h5Text(locale, 'net.code')}</span>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && ready) onJoin(code);
            }}
            placeholder={h5Text(locale, 'net.codePlaceholder')}
            maxLength={CODE_LENGTH + 2}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="w-full border border-[#343a42] bg-black/45 px-3 py-2 font-mono text-[15px] tracking-[0.3em] text-white uppercase outline-none focus:border-[#f0a020]/70"
          />
        </label>
        <GameButton variant="ghost" disabled={!ready} onClick={() => ready && onJoin(code)}>
          {h5Text(locale, 'net.join')}
        </GameButton>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[11px] tracking-wide text-white/45">{h5Text(locale, 'net.rooms')}</span>
          <span className="font-mono text-[10px] text-white/25">{rooms.length}</span>
        </div>

        {rooms.length === 0 ? (
          <p className="border border-dashed border-white/12 px-3 py-3 text-[11px] leading-5 text-white/30">
            {h5Text(locale, 'net.roomsEmpty')}
          </p>
        ) : (
          <div className="max-h-[168px] overflow-y-auto border border-[#343a42]">
            {rooms.map((room) => (
              <button
                key={room.code}
                type="button"
                onClick={() => onJoin(room.code)}
                className="flex w-full items-center gap-2 border-b border-white/6 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-white/6"
              >
                <span className="font-mono text-[13px] font-bold tracking-[0.18em] text-[#f0a020]">{room.code}</span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-white/50">{room.host}</span>
                <span className="font-mono text-[10px] tabular-nums text-white/35">
                  {h5Text(locale, 'net.humans', { count: room.humans })} · {h5Text(locale, 'net.bots', { count: room.bots })}
                </span>
                <span
                  className={`shrink-0 text-[10px] font-bold ${room.open ? 'text-[#7f9a6b]' : 'text-white/25'}`}
                >
                  {room.open ? h5Text(locale, 'net.canJoin') : h5Text(locale, 'net.full')}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-white/8 pt-3">
        <GameButton variant="ghost" onClick={onBack}>
          {h5Text(locale, 'net.single')}
        </GameButton>
        <span className="text-[10px] text-white/22">{h5Text(locale, 'net.entry')}</span>
      </div>
    </>
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
                    <span
                      className={`text-[10px] font-bold ${canJoin ? 'text-[#7f9a6b]' : 'text-white/30'}`}
                    >
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
