'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { LOCALE_COOKIE, LOCALE_OPTIONS, LOCALE_SWITCH_LABEL, resolveLocale, type Locale } from '@/lib/i18n';
import { TOUR_DONE_EVENT, TOUR_OPEN_EVENT } from './OnboardingTour';
import { useI18n } from './I18nProvider';

/*
 * 「要不要换成你的语言」提示。
 *
 * 2026-10-13 用户定的规矩（见 middleware.ts 文件头）：
 *   · 没主动设置过语言 → **访问哪个就是哪个，服务端不跳转**；
 *   · 浏览器语言和页面语言不符 → 由**这里**弹一句问，切不切由用户定；
 *   · 主动设置过（cookie 在）→ 服务端直接按 cookie 跳，这里**不再问**。
 *
 * 所以这个组件只在一种情况下出现：**cookie 不在 且 浏览器想要的语言 ≠ 当前页面的语言**。
 *
 * 它挂在根布局里（每个页面都在），因为内容页同样需要 —— 从搜索点进 `/games` 的人
 * 也可能是个中文用户。后台除外（不做语言前缀，也没有切换入口）。
 *
 * **它是模态的**（全屏暗幕 + 居中，2026-10-20 用户改）：原来是底部一条、没有背板，
 * 结果在房间场景里既不在视口正中、也没有遮罩，看着像个贴错位置的浮条。
 * 现在和别的面板一样：整屏压暗、卡片居中，必须先答「切换 / 保持」才继续。
 * 代价是它会挡住拖 ROM 的手，但正因为要用户当场决定，挡一下才对。
 *
 * ⚠️ 和操作指引（OnboardingTour）**排队**：指引是 z-[60] 的全屏暗幕，两者同时在场
 * 会把这条压暗、还点不动。靠 `TOUR_OPEN_EVENT` / `TOUR_DONE_EVENT` 让路，
 * 详见 OnboardingTour 里那两个常量的注释。
 *
 * ⚠️ **目标语言是「浏览器想要的那一种」，不是「另一种」**（2026-10-16 改）。
 *    两种语言时那两个说法等价（另一种就是唯一剩下的那种）；四种语言下不等价了 ——
 *    一个日语浏览器访问英文页，该问的是「要不要切到日文」，而不是随便挑一种。
 *    所以这里自己算 `browserLocale()`（下面那个函数），不再从 context 里取。
 */

/**
 * 等一会儿再冒出来：首屏那一帧在挂 `<html>` 的属性、铺场景，这时候弹一个框很吵。
 * 顺带解决了和指引的**竞态** —— ConsoleScene 是在自己的 effect 里派发
 * `TOUR_OPEN_EVENT` 的，那个 effect 和这里的计时器同一次挂载触发，
 * 但事件几乎立刻就到，远早于这 1.2 秒。
 */
const DELAY_MS = 1200;

/** 用户**主动设置过**语言没有 —— 判据就是那个 cookie 在不在（和服务端同一枚）。 */
function hasSavedLocale(): boolean {
  return document.cookie.split('; ').some((part) => part.startsWith(`${LOCALE_COOKIE}=`));
}

/**
 * 浏览器想要哪种语言。**复用服务端那份收敛规则**（`resolveLocale`：
 * `zh-CN` → zh、`ja-JP` → ja、认不出的当英文），免得两边各写一套判断、迟早分叉。
 */
function browserLocale(): Locale {
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  return resolveLocale(tags);
}

export default function LocalePrompt() {
  const { locale, hrefIn, rememberLocale, t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  /** 计时器句柄。**不放在 effect 的清理里** —— 见下面那个单独的卸载 effect。 */
  const timer = useRef<number | null>(null);

  /**
   * 排队等一个「该弹了」的时机。三个条件全过才排：
   * 没设置过、浏览器要的不是当前语言、而且还没排上。
   *
   * 条件写在这里而不是调用方，是因为它会被**两个**地方调用（落地时、指引关掉时），
   * 而指引关掉那次必须重新判一遍 —— 用户可能在看指引之前就点过「保持英文」了。
   */
  const schedule = useCallback(() => {
    if (timer.current !== null) return;
    if (hasSavedLocale()) return;
    if (browserLocale() === locale) return;

    timer.current = window.setTimeout(() => {
      timer.current = null;
      setOpen(true);
    }, DELAY_MS);
  }, [locale]);

  useEffect(() => {
    // 后台不做语言前缀、也没有语言切换入口 —— 不打扰
    if (pathname === '/admin' || pathname.startsWith('/admin/')) return;
    schedule();
  }, [pathname, schedule]);

  useEffect(() => {
    const onTourOpen = () => {
      // 指引开着的这段时间先别冒出来
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      setOpen(false);
    };

    window.addEventListener(TOUR_OPEN_EVENT, onTourOpen);
    window.addEventListener(TOUR_DONE_EVENT, schedule);
    return () => {
      window.removeEventListener(TOUR_OPEN_EVENT, onTourOpen);
      window.removeEventListener(TOUR_DONE_EVENT, schedule);
    };
  }, [schedule]);

  /*
   * 计时器**只在卸载时收**。放进上面那个 effect 的清理里会坏掉：
   * 客户端导航会让依赖变化、跑一次清理，把还没到点的计时器清掉，之后再也不会重排。
   *
   * ⚠️ **清掉之后必须把 `timer.current` 置回 null**（2026-10-20 修）：
   * `reactStrictMode` 在**开发环境**会把 effect 跑成 mount → unmount → mount。
   * 第一轮 `schedule()` 设了计时器，unmount 时这里把它 clear 了，但句柄还留在
   * ref 里；第二轮挂载 `schedule()` 第一句就是 `if (timer.current !== null) return`，
   * 被这枚**已经失效的句柄**挡回去 —— 新的计时器永远不排，`open` 一直是 false。
   * 现象就是「dev 下这个提示死活不出来，生产构建（不双挂载）却正常」。
   */
  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    },
    []
  );

  /*
   * 目标语言 = **浏览器想要的那一种**。
   *
   * 在渲染时现取、不放进 state：它只跟浏览器设置有关，不会变。
   * `open` 一旦为真说明它和当前语言不同（见 `schedule` 的判据）—— 但**切换之后**
   * 两者可能变得相同（用户在下拉里自己切过去了，而这条还挂着），
   * 所以下面用 `target === locale` 一并收掉：那时候问「要不要切到你现在这种语言」
   * 是废话，直接不显示。
   */
  const target = browserLocale();
  if (!open || target === locale) return null;

  const targetLabel = LOCALE_OPTIONS.find((option) => option.value === target)?.label ?? target;

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center px-6">
      {/*
        z-[55]：夹在面板（z-50）和「邀请进房间」（z-[60]）之间。
        要在面板之上 —— 被面板背板压暗会像出了 bug；但别盖过那个真正需要用户
        当场决定的邀请框。遮罩同理，跟着外层这个层级走。
      */}
      <div aria-hidden className="absolute inset-0 bg-ink-950/70" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('localePrompt.title')}
        className="relative pixel-edge pxw-4 pxc-600 w-[380px] max-w-full bg-ink-800"
      >
        <div className="flex items-center border-b-2 border-ink-900 bg-ink-850 px-4 py-2.5">
          <span className="text-[12px] text-ink-200">{t('localePrompt.title')}</span>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <p className="text-[12px] leading-5 text-ink-100">{t('localePrompt.body')}</p>

          <div className="flex gap-2">
            {/*
              切换那颗是 `<Link>` 而不是「onClick 里 router.push」：它去的是一个**真地址**
              （当前页面的目标语言版本），该能被中键 / 新标签打开。
              `rememberLocale` 必须在导航前跑 —— 先写 cookie 再走，否则服务端下次
              还会按老 cookie 把人送回去（见 I18nProvider 的注释）。
            */}
            <Link
              href={hrefIn(target)}
              onClick={() => {
                rememberLocale(target);
                setOpen(false);
              }}
              className="pixel-edge pxw-3 pxc-600 block flex-1 bg-accent py-2 text-center text-[12px] text-ink-950 transition-colors hover:bg-accent/80"
            >
              {/*
                钮上写的是**目标语言自己的说法**（`LOCALE_SWITCH_LABEL`）：
                这颗钮的读者是想要那种语言的人，字必须是他看得懂的语言。
                `targetLabel` 只是给 `title` 用 —— 语言名本身各语言写法一样。
              */}
              <span title={targetLabel}>{LOCALE_SWITCH_LABEL[target]}</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                /*
                 * 「保持」= **也算主动设置过**（2026-10-13 用户定）：把当前语言写进 cookie。
                 * 不这么记的话，他每次刷新都会被问一遍，而语言状态永远停在「没设置过」。
                 */
                rememberLocale(locale);
                setOpen(false);
              }}
              className="pixel-edge pxw-2 pxc-500 block flex-1 bg-ink-700 py-2 text-[12px] text-ink-200 transition-colors hover:bg-ink-600 hover:text-ink-100"
            >
              {t('localePrompt.keep')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
