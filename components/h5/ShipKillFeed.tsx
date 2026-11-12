'use client';

import type { Locale } from '@/lib/i18n';
import type { FeedEntry } from '@/lib/h5/types';
import { actorLabel, h5Text, type H5TextKey } from '@/lib/h5/ui-text';
import { TEAM_COLOR, weaponLabel } from './weapon-label';

/**
 * 击杀播报（右上角）。
 *
 * 引擎推过来的是**最近 6 条**（`HudSnapshot.feed`），这里只负责排版。
 * 条目带 `at` 时间戳，但**不做前端定时消失** —— 引擎在 6 秒后自己把它从数组里
 * 摘掉，下一次 10Hz 推送时自然就没了。前端再维护一套定时器，两套时钟一定会打架。
 *
 * 名字一律过 `actorLabel`：玩家自己显示「你」，没有凶手（摔死 / 自爆）显示「世界」。
 * 引擎传过来的是 `Actor.name` 和 `null`，不含任何界面文案。
 *
 * ## 排版规则
 *
 *   击杀者 [武器] 💀 被击杀者    💀 只在爆头时出现，且是金色（和金色击杀图标同色）
 *   自己的击杀：琥珀色底 + 左侧亮边
 *   别人的击杀：灰底
 *
 * 自己的条目高亮不是为了好看 —— 右上角同时在刷好几条时，玩家需要**一眼**找到
 * 「刚才那下是不是我打的」。
 */
export default function ShipKillFeed({ feed, locale }: { feed: FeedEntry[]; locale: Locale }) {
  if (feed.length === 0) return null;

  return (
    <div className="pointer-events-none absolute top-14 right-3 z-10 flex w-[260px] flex-col items-end gap-1">
      {feed.map((entry) => {
        const mine = entry.killerIsPlayer;
        return (
          <div
            key={entry.id}
            className={
              mine
                ? 'flex max-w-full items-center gap-1.5 border border-[#f0a020]/45 border-l-2 bg-[#f0a020]/18 px-2 py-[3px] text-[11px] leading-4 backdrop-blur-[2px]'
                : 'flex max-w-full items-center gap-1.5 border border-white/8 bg-black/55 px-2 py-[3px] text-[11px] leading-4 backdrop-blur-[2px]'
            }
          >
            <span
              className="max-w-[80px] truncate font-semibold"
              style={{ color: mine ? '#ffd88a' : TEAM_COLOR[entry.killerTeam] }}
            >
              {actorLabel(locale, entry.killer, entry.killerIsPlayer)}
            </span>
            <span className="text-white/35">[{weaponLabel(locale, entry.weapon)}]</span>
            {entry.head ? <SkullGlyph /> : null}
            <span className="max-w-[80px] truncate font-semibold" style={{ color: TEAM_COLOR[entry.victimTeam] }}>
              {actorLabel(locale, entry.victim, entry.victimIsPlayer)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 爆头角标：一个 10px 的金色骷髅。
 *
 * 用字形而不是 emoji（💀）：emoji 在 Windows / Android / iOS 上长得完全不一样，
 * 而且改不了颜色 —— 这里必须和金色击杀图标同色，emoji 做不到。
 */
function SkullGlyph() {
  return (
    <svg width={10} height={10} viewBox="0 0 12 12" aria-hidden className="shrink-0" style={{ color: '#ffc83d' }}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M6 0.6C8.9 0.6 11 2.6 11 5.2C11 6.7 10.4 7.8 9.5 8.5L9.5 9.9C9.5 10.5 9 11 8.4 11L3.6 11C3 11 2.5 10.5 2.5 9.9L2.5 8.5C1.6 7.8 1 6.7 1 5.2C1 2.6 3.1 0.6 6 0.6Z M3.2 5.1A1.2 1.2 0 1 1 5.6 5.1A1.2 1.2 0 1 1 3.2 5.1Z M6.4 5.1A1.2 1.2 0 1 1 8.8 5.1A1.2 1.2 0 1 1 6.4 5.1Z"
      />
    </svg>
  );
}

/**
 * 连杀播报。屏幕上方居中的一行大字，1.4 秒后自己淡掉。
 *
 * 只在**玩家自己**连续击杀 2 人以上时出现。别人的连杀不播报 —— 播报的价值是
 * 「肯定你打得好」，别人的战绩放右上角的播报条里就够了。
 *
 * `at` 是这次播报的时间戳，拿它当 React key 让同一个连杀数也能重新触发动画。
 */
export function ShipStreakBanner({ streak, at, locale }: { streak: number; at: number; locale: Locale }) {
  if (streak < 2 || at === 0) return null;

  const key: H5TextKey =
    streak === 2 ? 'streak.2' : streak === 3 ? 'streak.3' : streak === 4 ? 'streak.4' : 'streak.high';

  return (
    <div
      key={at}
      className="pointer-events-none absolute inset-x-0 top-[20%] z-20 flex justify-center"
      style={{ animation: 'ship-streak 1400ms ease-out both' }}
    >
      <span
        className="text-[26px] leading-none font-black tracking-[0.12em] text-[#f0a020]"
        style={{ textShadow: '0 2px 16px rgba(240,160,32,0.6), 0 0 2px rgba(0,0,0,0.9)' }}
      >
        {h5Text(locale, key)}
      </span>
    </div>
  );
}
