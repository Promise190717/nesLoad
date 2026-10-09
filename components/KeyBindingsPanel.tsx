'use client';

import { useEffect, useState } from 'react';
import {
  BUTTONS,
  buttonHolding,
  buttonLabel,
  cloneDefaultBindings,
  codeLabel,
  codeToRetroArch,
  conflictInOtherPlayer,
  conflictInPlayer,
  type ButtonName,
  type KeyBindings,
} from '@/lib/keybindings';
import type { NetplayRole } from '@/lib/netplay';
import type { MessageKey } from '@/lib/i18n';
import { useI18n } from './I18nProvider';

/**
 * 面板底部的提示条。
 *
 * 只有「没绑上」一种 —— 跨玩家撞键改成拒绝之后，就没有「绑上了但要注意」这档了。
 */
interface Notice {
  key: MessageKey;
  button?: ButtonName;
  player?: string;
  /**
   * 用户按下、但已被占用的那个键的显示标签。
   *
   * 必须带上：`button` 是**手柄上的钮名**（B / A / Y / X …），可它长得和键名一模一样 ——
   * 只说「已经绑给「X」了」，用户会读成「X 键被占用」，然后问「我明明按的是 S」。
   * 把「你按的键」也写进去，两个名字才分得开。
   */
  pressed?: string;
}

interface KeyBindingsPanelProps {
  open: boolean;
  bindings: KeyBindings;
  /** 当前联机角色。加入者只用 2P 键位，提示文案也不一样。 */
  role: NetplayRole | null;
  /**
   * 本机是否跑着一盘自己的卡带。
   *
   * 房主天然是 true（他就是在本机跑模拟器的那个人），所以只对**加入者**有意义：
   * 加入者在房主出画面之前可以自己先插一盘玩，那时本机跑着模拟器、按 P1 键位读键盘，
   * 改完要重载卡带 —— 和「加入者改完立刻生效」是两回事，提示必须分开说。
   *
   * 顺带也是「重载卡带」按钮的可用条件：没有本地卡带就没有可重载的东西。
   */
  localPlaying: boolean;
  onChange: (next: KeyBindings) => void;
  /**
   * 重载当前卡带，让新键位生效。
   *
   * 返回 Promise 是为了让面板知道什么时候能收工关掉自己 —— 重新 launch 要几秒，
   * 面板留在屏幕上只会挡着游戏。
   */
  onReload: () => Promise<void>;
  onClose: () => void;
}

/**
 * 自定义按键面板。和存档列表 / 联机面板同一套视觉：浮在房间上、**不进屏幕**
 * ——「屏幕里不放任何文案」是这个项目的硬规矩（见 RetroTv）。
 *
 * 1P / 2P 分两组标签页，不是一次铺 24 行：单机双人时两组都要配，但一次只看一组
 * 才看得清「哪个钮 = 哪个键」。加入者进来默认落在 2P（他用的就是那组）。
 */
export default function KeyBindingsPanel({
  open,
  bindings,
  role,
  localPlaying,
  onChange,
  onReload,
  onClose,
}: KeyBindingsPanelProps) {
  const { t } = useI18n();
  const [player, setPlayer] = useState<'p1' | 'p2'>('p1');
  /** 正在等新键的那个钮。null 表示不在捕获态。 */
  const [capturing, setCapturing] = useState<ButtonName | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  /** 正在重载卡带。重新 launch 要几秒，这期间别让按钮再被按一次。 */
  const [reloading, setReloading] = useState(false);

  // 每次打开都重置：默认落在「你自己那组」，捕获态和上一条提示都清掉
  useEffect(() => {
    if (!open) return;
    setPlayer(role === 'guest' ? 'p2' : 'p1');
    setCapturing(null);
    setNotice(null);
    setReloading(false);
  }, [open, role]);

  /**
   * 键盘收口：**面板一开就挂**，不只是捕获态。
   *
   * 用 window 的**捕获阶段** + `stopPropagation()`：Nostalgist 的键盘监听挂在
   * `document` 的冒泡阶段（见 `nostalgist.js` 的 `updateKeyboardEventHandlers`），
   * 事件在 window 捕获阶段就被截住，根本走不到 document —— 模拟器读不到、
   * 我们自己的快捷键（P / R / F5 / F8）不触发、联机也不转发。
   * （`stopPropagation()` 会连同 window 上冒泡阶段的监听一起挡掉，所以 ConsoleScene
   * 那几条不用再加 `keybindOpen` 判断也能拦住；Escape 因此只能在这里处理。）
   *
   * 两个层次：
   *   - 面板开着：吞掉按键，但**不**吞 keyup。开面板前就按着的键要能正常松开，
   *     否则模拟器会一直以为你按着那个方向。
   *   - 正在捕获某个钮：连默认行为一起吞（不然空格滚页面、Tab 跑焦点），
   *     并且把新键绑上去。Esc 在捕获态是「取消这次改键」，不是关面板。
   *
   * 不靠焦点躲模拟器（把捕获控件做成 `<button>` 让 `isInteractable` 跳过它）：
   * 那条路要跟「点完按钮就 blur」的全局收口打架，远不如在捕获阶段拦干净。
   */
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();

      if (!capturing) {
        // 面板开着但没在改键：只处理 Esc。keyup 本来就没挂监听，自然放行（见上）
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
        return;
      }

      e.preventDefault();

      if (e.key === 'Escape') {
        setCapturing(null);
        setNotice(null);
        return;
      }

      const code = e.code;
      // Nostalgist 认不出的键不接受 —— 绑上去只会在联机注入时静默失效
      if (!codeToRetroArch(code)) {
        setNotice({ key: 'keybind.unsupported' });
        return;
      }

      const table = player === 'p1' ? bindings.p1 : bindings.p2;
      // 同一位玩家内部撞键 = 一个键同时是两个钮，没有意义，直接拒绝
      const same = conflictInPlayer(table, capturing, code);
      if (same) {
        setNotice({ key: 'keybind.conflictSame', button: same, pressed: codeLabel(code) });
        return;
      }

      /*
       * 跨玩家撞键也拒绝。
       *
       * 单机双人时两人共用一块键盘，重叠就是互相抢键；联机时房主的 P2 一旦和自己的
       * P1 撞上，注入会连带驱动他自己的 P1 —— 注入合成的事件由**核心启动时读的那张表**
       * 解析（`fireKeyboardEvent` 直接调 emscripten 的处理函数，不派发真 DOM 事件），
       * 同一个 code 会同时算给两个玩家。
       *
       * 与其留一个「能用但会出怪事」的状态，不如当场说不行。默认那两套本来就不重叠，
       * 真撞上了多半是配错。
       */
      const other = conflictInOtherPlayer(bindings, player, code);
      if (other) {
        setNotice({
          key: 'keybind.conflictOther',
          button: buttonHolding(bindings[other], code) ?? undefined,
          player: other === 'p1' ? '1' : '2',
          pressed: codeLabel(code),
        });
        return;
      }

      onChange({ ...bindings, [player]: { ...table, [capturing]: code } });
      setCapturing(null);
      setNotice(null);
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, capturing, player, bindings, onChange, onClose]);

  if (!open) return null;

  const table = player === 'p1' ? bindings.p1 : bindings.p2;
  /*
   * 提示按「改完什么时候生效」分四种，不能只按角色分：
   * 加入者本机没模拟器时是立刻生效，可他要是自己在房主出画面之前插了一盘，
   * 那盘走的是本机 RetroArch 读 P1 的老路 —— 一样要重载卡带。
   */
  let hint: MessageKey;
  if (role === 'guest') hint = localPlaying ? 'keybind.guestLocalHint' : 'keybind.guestHint';
  else if (role === 'host') hint = 'keybind.hostHint';
  else hint = 'keybind.hint';

  /**
   * 重载卡带，让新键位生效。
   *
   * 做完就把面板关掉：重新 launch 要几秒，而面板只要还开着就会吞掉所有键盘事件
   * （见上面那个捕获阶段监听），留着它只会挡着游戏。
   */
  const reload = async () => {
    setCapturing(null);
    setReloading(true);
    try {
      await onReload();
      onClose();
    } catch (e) {
      // onReload 自己会吞，这里是兜底 —— 真抛出来也不能让面板卡在「重载中」
      console.warn('重载卡带失败', e);
    } finally {
      setReloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6" onClick={onClose}>
      <div className="absolute inset-0 bg-ink-950/70" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('keybind.title')}
        className="relative w-[480px] max-w-full bg-ink-800 pixel-edge pxw-4 pxc-600"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b-2 border-ink-900 bg-ink-850 px-4 py-3">
          <span className="text-[12px] text-ink-200">{t('keybind.title')}</span>
          <button
            type="button"
            aria-label={t('keybind.close')}
            onClick={onClose}
            className="pixel-edge pxw-2 pxc-500 ml-auto flex h-[18px] w-[18px] items-center justify-center bg-ink-700 text-[10px] leading-none text-ink-100 hover:bg-danger hover:text-ink-950"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <div className="flex gap-2">
            {(['p1', 'p2'] as const).map((which) => (
              <button
                key={which}
                type="button"
                aria-pressed={player === which}
                onClick={() => {
                  setPlayer(which);
                  setCapturing(null);
                  setNotice(null);
                }}
                className={`pixel-edge pxw-2 pxc-500 flex-1 py-1.5 text-[11px] transition-colors ${
                  player === which
                    ? 'bg-accent text-ink-950'
                    : 'bg-ink-700 text-ink-300 hover:bg-ink-600 hover:text-ink-100'
                }`}
              >
                {t(which === 'p1' ? 'keybind.p1' : 'keybind.p2')}
              </button>
            ))}
          </div>

          {/*
            12 个钮分两列：正好配成 上/下、左/右、A/B、C/X、Y/Z、投币/开始。

            键值走系统字体、11px，**不用 font-pixel**：值里会出现 ↑↓←→ 和小键盘名，
            而 Press Start 2P 没有箭头字形 —— 那几个会掉回系统字体，和旁边的
            `J`、`Enter` 混排出两种字形。和页脚（legend.*）同一个理由。
          */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {BUTTONS.map((button) => {
              const active = capturing === button;
              const name = buttonLabel(button, t);
              const label = codeLabel(table[button]);
              return (
                <div key={button} className="flex items-center gap-2">
                  <span className="w-[54px] shrink-0 text-[11px] text-ink-400">
                    {name}
                  </span>
                  <button
                    type="button"
                    aria-label={`${name} — ${label}`}
                    onClick={() => {
                      setCapturing(button);
                      setNotice(null);
                    }}
                    className={`pixel-edge pxw-2 pxc-500 min-w-0 flex-1 truncate px-2 py-1 text-[11px] transition-colors ${
                      active
                        ? 'blink bg-accent/20 text-accent'
                        : 'bg-ink-900 text-ink-100 hover:bg-ink-700 hover:text-accent'
                    }`}
                  >
                    {active ? t('keybind.pressKey') : label}
                  </button>
                </div>
              );
            })}
          </div>

          {notice && (
            <p className="text-[11px] text-danger">
              {t(notice.key, {
                button: notice.button ? buttonLabel(notice.button, t) : '',
                player: notice.player ?? '',
                pressed: notice.pressed ?? '',
              })}
            </p>
          )}

          <p className="text-[11px] leading-relaxed text-ink-500">{t(hint)}</p>

          {/*
            重载卡带 = 「改完键位要重新插一次卡带」这件事的一键版。
            没有本地卡带时（加入者、或还没插卡）没什么可重载的，所以禁用而不是藏起来
            —— 按钮在、灰着，配上上面那句提示，能说清「为什么现在用不了」。

            恢复默认是**两组一起**回到默认，不是只复位当前这一栏 —— 标签没写「本组」，
            而且「把键位弄回一个已知状态」本来就是这个按钮的用途。
          */}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!localPlaying || reloading}
              onClick={() => void reload()}
              className="pixel-edge pxw-2 pxc-600 flex-1 bg-accent py-2 text-[12px] text-ink-950 transition-colors enabled:hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {reloading ? t('keybind.reloading') : t('keybind.reload')}
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(cloneDefaultBindings());
                setCapturing(null);
                setNotice(null);
              }}
              className="pixel-edge pxw-2 pxc-500 flex-1 bg-ink-700 py-2 text-[12px] text-ink-100 transition-colors hover:bg-ink-600 hover:text-accent"
            >
              {t('keybind.reset')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
