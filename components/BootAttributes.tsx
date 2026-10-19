'use client';

import { useEffect, useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isMobileDevice } from '@/lib/device';
import { isSeason, seasonOf } from '@/lib/season';
import { isTvSize } from '@/lib/tv-size';

/**
 * 把六个首屏属性「补齐」到 `<html>` 上（2026-10-19 加）。
 *
 * **它修的是什么**：用户报「切换语言之后整站变成黑夜模式，刷新又恢复」。原因是那六个
 * 属性**只有 `SiteDocument` 的内联脚本（`BOOT_INIT`）会写**，而内联脚本只在**整页加载**
 * 时跑一次。切语言（`/zh` ⇄ 无前缀）是**客户端导航** —— 不是「整页加载」，只是根布局
 * 的参数变了、React 重渲染了一遍 `<html>`，于是脚本没重跑、属性却没了。
 * 属性一没，CSS 就退回 `:root` 的默认（深色），刷新时才重新由脚本算回浅色。
 *
 * ⚠️ **别再指望 `BOOT_INIT` 落盘能盖住这种情况**：那段「没存过值就把算出来的结果写回
 * localStorage」解决的是「软导航不重跑脚本、下次整页加载重算不一致」，前提是**脚本确实
 * 重跑了**。这里是脚本压根没跑，落盘再正确也没人读。
 *
 * **同一类修补站里已经有一处**：`I18nProvider` 那个 effect 在语言变化时手动写
 * `<html lang>` / `data-locale`（客户端导航改不了服务端渲染的属性）。这边是同一件事
 * 的另外一半 —— 那三个属性（`lang` / `data-locale`）有人管，这六个（`data-theme` /
 * `data-lamp` / `data-simple` / `data-tv` / `data-season` / `data-mobile`）以前没人管。
 *
 * ---------------------------------------------------------------------------
 * 两条刻意的做法：
 *
 * 1. **只补「丢了 / 认不出」的，已经有合法值的一个都不碰。**
 *    属性还在（绝大多数软导航都是这样）时这一段是**纯空转**：不写属性、不写
 *    localStorage，用户的任何手动选择都不受影响。所以它不会把「点窗户换的季节」
 *    这种**只活在 DOM 里**的临时覆盖冲掉 —— 那种覆盖一旦丢了我们也没法复原，
 *    补回按农历算的那一季是唯一合理的结果。
 *
 * 2. **不落盘**。这里算出来的兜底值只用来画这一帧，写 localStorage 是 `BOOT_INIT`
 *    和用户点击（`saveTheme` / `saveLamp` …）的事 —— 一个「修属性」的路径顺手改掉
 *    用户存好的偏好，是最难查的那类 bug。
 *
 * **为什么是 `useLayoutEffect`**：属性是在 React 提交 `<html>` 的那一次里被抹掉的，
 * layout effect 在同一批 DOM 变更之后、浏览器绘制之前同步跑 —— 用户看不到「先黑一下
 * 再变白」。用 `useEffect` 就会闪一帧深色，那正是我们要修的那个观感。
 * 服务端没有 `window`，所以要退成 `useEffect`（不然 SSR 会报 useLayoutEffect 的警告）。
 *
 * **两道路径，刻意都留着**：
 *   · layout effect 挂 `pathname`（属性丢失只发生在导航时）—— 它跑在绘制之前，不闪；
 *   · 外加一个 MutationObserver 盯着这六个属性（`useEffect` 里装）—— 万一哪次抹属性
 *     不是发生在导航提交里、或者发生在 layout effect 之后，它也会在下一个微任务里补回去。
 *     责任链上多这一层是因为**抹属性的具体时机是框架内部行为**（每次升级都可能变），
 *     我们只能保证「不管谁抹的、什么时候抹的，下一个微任务里它回来」。
 *     观察者自己写属性会再触发一次回调，但那时值已经合法 ⇒ 一次空转就停，不会打转。
 *
 * ⚠️ 这里的兜底规则是**手抄** `BOOT_INIT` 的（内联脚本没法 import），
 * 改那边必须同步这里：主题/吊灯/简洁模式的键名、`data-tv` 的合法值（`lib/tv-size.ts`）、
 * `data-mobile` 的判定（`lib/device.ts`）、季节的算法（`lib/season.ts`）。
 * 唯一允许比那边「更聪明」的是直接 import 这几个 lib 函数 —— 那三份本来就是唯一出处。
 */
function repairBootAttributes(): void {
  const root = document.documentElement;
  const data = root.dataset;

  /** 读 localStorage。隐私模式下会抛，读不到就当没存过。 */
  const stored = (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  /* ---- 主题 / 吊灯 / 简洁模式 ---- */

  let theme = data.theme;
  if (theme !== 'light' && theme !== 'dark') {
    const saved = stored('nesload:theme');
    if (saved === 'light' || saved === 'dark') {
      theme = saved;
    } else {
      theme =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark';
    }
    data.theme = theme;
  }

  /* 灯：默认跟主题走（白天关、夜晚开），手动点过的那次优先 */
  if (data.lamp !== 'on' && data.lamp !== 'off') {
    const saved = stored('nesload:lamp');
    data.lamp = saved === 'on' || saved === 'off' ? saved : theme === 'light' ? 'off' : 'on';
  }

  if (data.simple !== 'on' && data.simple !== 'off') {
    data.simple = stored('nesload:simple') === 'on' ? 'on' : 'off';
  }

  /* ---- 电视机尺寸：兜底分页面（`/play` 中档，其余小档，和 BOOT_INIT 一致） ---- */
  if (!isTvSize(data.tv)) {
    const saved = stored('nesload:tv');
    data.tv = isTvSize(saved) ? saved : /\/play(?:\/|$)/.test(window.location.pathname) ? 'medium' : 'small';
  }

  /* ---- 设备：不是偏好，是设备的属性，现判 ---- */
  if (data.mobile !== 'on' && data.mobile !== 'off') {
    data.mobile = isMobileDevice() ? 'on' : 'off';
  }

  /* ---- 季节：按农历算（手动切的那一季不落盘，丢了就只能回到这里） ---- */
  if (!isSeason(data.season)) data.season = seasonOf();
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** 观察者只盯这六个 —— 别的属性我们一概不管（`lang` / `data-locale` 归 I18nProvider）。 */
const BOOT_ATTRIBUTES = ['data-theme', 'data-lamp', 'data-simple', 'data-tv', 'data-mobile', 'data-season'];

/**
 * 不渲染任何东西，只负责在导航后把 `<html>` 上的那六个属性补回来。
 *
 * 挂在根布局（`SiteDocument` 的 `<body>` 里）—— 它要在**每一页**都生效，
 * 而不是只在注册了主题钮的那几页。
 */
export default function BootAttributes() {
  const pathname = usePathname();

  /* 导航这一下：绘制之前补齐，用户看不到深色那一帧 */
  useIsomorphicLayoutEffect(() => {
    repairBootAttributes();
  }, [pathname]);

  /* 兜底网：不管谁在什么时候抹掉的，下一个微任务里补回去 */
  useEffect(() => {
    const observer = new MutationObserver(repairBootAttributes);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: BOOT_ATTRIBUTES });
    return () => observer.disconnect();
  }, []);

  return null;
}
