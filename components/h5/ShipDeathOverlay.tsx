'use client';

import type { Locale } from '@/lib/i18n';
import type { DeathInfo, DeathPhase } from '@/lib/h5/types';
import { actorLabel, h5Text } from '@/lib/h5/ui-text';
import { TEAM_COLOR, weaponLabel } from './weapon-label';

/**
 * 死亡界面 —— **刻意不是一块全屏遮罩**。
 *
 * 上一版是「半透明黑底 + 居中一个倒计时数字」，看起来像游戏卡住弹了个框。
 * 这一版把「我死了」这件事全部交给引擎去演（倒地、贴地凝视、观战），
 * UI 只负责两件**信息**：
 *
 *   ① 击杀信息卡 —— 谁、用什么武器、打中哪个部位、多远（中央偏下，一张小卡）
 *   ② 重生倒计时条 —— 最后 3 秒才出现（底部，一条进度条）
 *
 * 另外补一层很淡的暗角，`opacity` 最多 0.26。这是**辅助氛围**：
 * 需求明确写了「暗角和去饱和只能作为过渡效果的一小部分，不能是全部」。
 * 画面本身（甲板、天空、走过路过的敌人）始终是渲染出来的真实场景。
 */

/** 暗角最浓时的透明度。需求给的上限是 30%，这里留一点余量。 */
const VIGNETTE_MAX = 0.26;

export default function ShipDeathOverlay({
  info,
  phase,
  deathTime,
  respawnIn,
  locale,
}: {
  info: DeathInfo | null;
  phase: DeathPhase;
  /** 死亡后经过的秒数，用来做暗角渐入 */
  deathTime: number;
  /** 剩余重生秒数 */
  respawnIn: number;
  locale: Locale;
}) {
  // 活着的时候**不返回 null**：暗角靠 CSS `transition` 淡出，一旦组件被卸载，
  // 过渡就没了 —— 重生那一瞬间会看到一层 26% 的黑边「啪」地消失。
  // 卡片和进度条倒是应该硬切：重生之后它们不该再出现
  const alive = phase === 'alive';
  const strength = alive ? 0 : Math.min(1, Math.max(0, (deathTime - 0.35) / 1.1));
  // 倒地那 1 秒里除了暗角什么都不弹：先让人看清自己是怎么倒下的。
  // 信息卡在贴地之后（`gaze`）才出现，节奏上「先看，再读」
  const showCard = !alive && phase !== 'dying' && info !== null;
  const showBar = !alive && respawnIn > 0 && respawnIn <= 3;

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background: `radial-gradient(circle at center, transparent 38%, rgba(0,0,0,${VIGNETTE_MAX}) 100%)`,
          opacity: strength,
          transition: 'opacity 420ms linear',
        }}
      />

      {showCard && info ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[27%] z-10 flex justify-center px-4">
          <div
            className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border border-white/10 bg-black/55 px-3 py-1.5 backdrop-blur-[2px]"
            style={{ animation: 'ship-card-in 320ms ease-out both' }}
          >
            <span className="text-[9px] tracking-[0.18em] text-white/35 uppercase">
              {h5Text(locale, 'death.killer')}
            </span>
            <span className="text-[13px] leading-none font-semibold" style={{ color: TEAM_COLOR[info.killerTeam] }}>
              {actorLabel(locale, info.killer, info.killerIsPlayer)}
            </span>
            <span className="text-white/22">|</span>
            <span className="text-[12px] leading-none text-white/60">[{weaponLabel(locale, info.weapon)}]</span>
            <span className="text-white/22">·</span>
            <span
              className={`text-[12px] leading-none font-semibold ${info.head ? 'text-[#ff5c5c]' : 'text-white/70'}`}
            >
              {h5Text(locale, info.head ? 'death.head' : 'death.body')}
            </span>
            {info.distance > 0 ? (
              <>
                <span className="text-white/22">·</span>
                <span className="font-mono text-[12px] leading-none tabular-nums text-white/55">
                  {info.distance}m
                </span>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {showBar ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[15%] z-10 flex flex-col items-center gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] tracking-[0.14em] text-white/55">{h5Text(locale, 'hud.dead')}</span>
            <span className="font-mono text-[13px] leading-none font-bold tabular-nums text-white/80">
              {respawnIn.toFixed(1)}
            </span>
          </div>
          <div className="h-[3px] w-[220px] bg-white/12">
            {/* 进度条填的是「离重生还有多久走完了」，所以从 0 长到满 */}
            <div
              className="h-full bg-[#f0a020]"
              style={{ width: `${Math.min(100, Math.max(0, (1 - respawnIn / 3) * 100)).toFixed(1)}%` }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
