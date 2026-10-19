export type Theme = 'dark' | 'light';

/** Shared by /play, /room and the first-paint script in SiteDocument. */
export function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/**
 * 落主题：先写 `<html data-theme>`（唯一真相），再记 localStorage。
 *
 * ⚠️ **不是唯一的写入者**：`components/SiteDocument.tsx` 的 `BOOT_INIT` 在
 * 「localStorage 里还没有合法值」时也会写一次（把现算出来的结果落盘，2026-10-19）。
 * 那条路径不能在这里复用 —— 首屏脚本是内联的，没法 import。改键名要两处一起改。
 */
export function saveTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.lamp = theme === 'dark' ? 'on' : 'off';
  try {
    localStorage.setItem('nesload:theme', theme);
  } catch {
    // Keep the choice for this page even when storage is unavailable.
  }
}
