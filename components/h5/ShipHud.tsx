'use client';

import { useState } from 'react';
import type { Locale } from '@/lib/i18n';
import type { HudSnapshot, NetHud } from '@/lib/h5/types';
import { roomShareUrl } from '@/lib/h5/net/protocol';
import { h5Text, teamLabel } from '@/lib/h5/ui-text';
import { TEAM_COLOR, weaponLabel } from './weapon-label';
import { formatClock } from './ShipScoreboard';

/**
 * 战斗 HUD。
 *
 * 布局照 CF 的常规摆位，**四角各管一件事**：
 *
 *   左上 / 右上  双方比分 + 目标人头
 *   正上        剩余时间
 *   左下        生命 / 护甲
 *   右下        武器 / 弹药 / 手雷
 *
 * 刻意不做的：小地图（这张图是「一条船、两个出生点」，小地图的信息量接近于零）、
 * 弹药百分比环（数字更准）、动态准星（散布变化已经在后坐里体现）。
 */
export default function ShipHud({
  hud,
  locale,
  touch,
  onOpenBuy,
}: {
  hud: HudSnapshot;
  locale: Locale;
  touch: boolean;
  onOpenBuy: () => void;
}) {
  const weaponName = weaponLabel(locale, hud.weapon);
  const isMelee = hud.weapon === 'knife';
  const isGrenade = hud.weapon === 'grenade';
  const lowHp = hud.hp <= 30;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 font-[system-ui]">
      {/* ── 顶部：比分 + 计时 ───────────────────────────────────── */}
      <div className="absolute inset-x-0 top-0 flex justify-center">
        <div className="flex items-stretch border-x border-b border-white/10 bg-black/45 backdrop-blur-[2px]">
          <ScoreCell label={teamLabel(locale, 0)} score={hud.scoreA} color={TEAM_COLOR[0]} />
          <div className="flex min-w-[86px] flex-col items-center justify-center border-x border-white/10 px-3 py-1">
            <span className="font-mono text-[16px] leading-none font-bold tabular-nums text-white">
              {formatClock(hud.timeLeft)}
            </span>
            <span className="mt-0.5 text-[9px] tracking-[0.18em] text-white/35 uppercase">
              {h5Text(locale, 'hud.time')}
            </span>
          </div>
          <ScoreCell label={teamLabel(locale, 1)} score={hud.scoreB} color={TEAM_COLOR[1]} align="right" />
        </div>
      </div>

      {/* ── 左上：房间码 ─────────────────────────────────────────────
          房主念码、加入者核对码，都靠这一小块。**只在联机时出现** —— 单人局
          里它整块不渲染，`hud.net === null` 就是那个开关。 */}
      {hud.net ? <NetBadge net={hud.net} locale={locale} /> : null}

      {/* ── 左下：生命 / 护甲 ───────────────────────────────────── */}
      <div className="absolute bottom-4 left-4 flex items-end gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-1.5">
            <span
              className={`font-mono text-[30px] leading-none font-bold tabular-nums ${
                lowHp ? 'text-[#ff5252]' : 'text-white'
              }`}
            >
              {hud.hp}
            </span>
            <span className="text-[10px] tracking-wide text-white/40">{h5Text(locale, 'hud.hp')}</span>
          </div>
          {/* 血条：只有一条，用宽度表达血量 —— 数字已经给了精确值 */}
          <div className="h-[3px] w-[124px] bg-white/12">
            <div
              className={`h-full transition-[width] duration-150 ${lowHp ? 'bg-[#ff5252]' : 'bg-[#f0a020]'}`}
              style={{ width: `${Math.max(0, Math.min(100, hud.hp))}%` }}
            />
          </div>
          {hud.armor > 0 ? (
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[12px] leading-none tabular-nums text-[#5c9fd6]">{hud.armor}</span>
              <span className="text-[9px] tracking-wide text-white/35">{h5Text(locale, 'hud.armor')}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── 右下：武器 / 弹药 ───────────────────────────────────── */}
      {/* 死了就不显示弹药：枪已经掉在甲板上了，还挂着「30 / ∞」很出戏。
          死亡期间屏幕上只有击杀信息卡和重生倒计时（见 `ShipDeathOverlay`） */}
      {hud.dead ? null : (
        <div className="absolute right-4 bottom-4 flex flex-col items-end gap-1">
          <span className="text-[11px] tracking-wide text-white/45">{weaponName}</span>
          <div className="flex items-baseline gap-1.5">
            {isMelee ? (
              <span className="font-mono text-[26px] leading-none font-bold text-white/85">—</span>
            ) : isGrenade ? (
              <span className="font-mono text-[26px] leading-none font-bold tabular-nums text-white">
                {hud.grenades}
              </span>
            ) : (
              <>
                <span
                  className={`font-mono text-[26px] leading-none font-bold tabular-nums ${
                    hud.ammo === 0 ? 'text-[#ff5252]' : 'text-white'
                  }`}
                >
                  {hud.ammo}
                </span>
                {/* 备弹无限：`reserve < 0` 是引擎给的哨兵值，画成 ∞ 而不是 "-1" */}
                <span className="font-mono text-[13px] leading-none tabular-nums text-white/35">
                  / {hud.reserve < 0 ? '∞' : hud.reserve}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {hud.reloading ? (
              <span className="animate-pulse text-[10px] tracking-wide text-[#f0a020]">
                {h5Text(locale, 'hud.reloading')}
              </span>
            ) : null}
            {/* 手雷数一直显示：切到枪上也要知道还剩几颗 */}
            {!isGrenade ? (
              <span className="flex items-center gap-1 text-[10px] text-white/40">
                <span className="text-[#7f9a6b]">◆</span>
                <span className="font-mono tabular-nums">{hud.grenades}</span>
              </span>
            ) : null}
          </div>
        </div>
      )}

      {/* ── 底部中央：出生点换枪提示 ─────────────────────────────── */}
      {/* 触屏不显示这一颗：`ShipTouchControls` 右下角已经有换枪键，
          而且转视角层铺满右半屏，压在它上面 —— 留着只会是个点不到的按钮 */}
      {hud.canChangeLoadout && !hud.dead && !hud.buyOpen && !touch ? (
        <div className="pointer-events-auto absolute bottom-[16%] left-1/2 -translate-x-1/2">
          <button
            type="button"
            onClick={onOpenBuy}
            className="border border-[#f0a020]/45 bg-black/55 px-3 py-1 text-[11px] font-semibold tracking-wide text-[#f0a020] backdrop-blur-[2px] hover:bg-[#f0a020]/15"
          >
            {h5Text(locale, 'hud.spawnHint')}
          </button>
        </div>
      ) : null}

      {/* ── 死亡界面 ─────────────────────────────────────────────────
          这里**刻意什么都不画**。死亡的全部表现（倒地镜头、贴地凝视、观战、
          去饱和、击杀信息卡、重生倒计时）都在 `ShipDeathOverlay` 和引擎里。
          曾经这里盖过一块 `bg-black/45` 的全屏遮罩，那是这一轮改版要删掉的东西。 */}

      {/* ── FPS（只在非触屏显示，触屏上它纯属噪音） ───────────────── */}
      {!touch ? (
        <span className="absolute bottom-1 left-1 font-mono text-[9px] text-white/22">
          {h5Text(locale, 'hud.fps', { fps: hud.fps })}
        </span>
      ) : null}
    </div>
  );
}

/**
 * 左上角的房间码。
 *
 * 需求要「房主能把码念给旁边的人」—— 所以码必须是**画面上一直看得见**的，
 * 不能藏在暂停菜单里。点一下复制邀请链接（`?shiproom=XXXXX`），复制不了
 * （非安全上下文 / 没给剪贴板权限）就什么都不做，码本身还在。
 */
function NetBadge({ net, locale }: { net: NetHud; locale: Locale }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    const url = roomShareUrl(net.code);
    if (!url) return;
    void navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => undefined);
  };

  return (
    <div className="pointer-events-auto absolute top-2 left-2 flex items-stretch border border-white/10 bg-black/45 backdrop-blur-[2px]">
      <div className="flex flex-col justify-center px-2.5 py-1">
        <span className="font-mono text-[13px] leading-none font-bold tracking-[0.2em] text-[#f0a020]">
          {net.code}
        </span>
        <span className="mt-1 text-[9px] leading-none tracking-[0.12em] text-white/38 uppercase">
          {h5Text(locale, net.role === 'host' ? 'net.hostBadge' : 'net.guestBadge')} ·{' '}
          {h5Text(locale, 'net.humans', { count: net.peers })}
        </span>
        {net.pending > 0 ? (
          <span className="mt-1 text-[9px] leading-none text-[#7f9a6b]">
            {h5Text(locale, 'net.pending', { count: net.pending })}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={copy}
        className="border-l border-white/10 px-2 text-[9px] leading-tight font-bold text-white/45 transition-colors hover:bg-white/8 hover:text-white/85"
      >
        {copied ? h5Text(locale, 'net.copied') : h5Text(locale, 'net.copyLink')}
      </button>
    </div>
  );
}

function ScoreCell({
  label,
  score,
  color,
  align = 'left',
}: {
  label: string;
  score: number;
  color: string;
  align?: 'left' | 'right';
}) {
  return (
    <div className={`flex min-w-[86px] flex-col px-3 py-1 ${align === 'right' ? 'items-end' : 'items-start'}`}>
      <span className="font-mono text-[16px] leading-none font-bold tabular-nums" style={{ color }}>
        {score}
      </span>
      <span className="mt-0.5 text-[9px] tracking-[0.14em] text-white/35 uppercase">{label}</span>
    </div>
  );
}
