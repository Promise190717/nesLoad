export type Theme = 'dark' | 'light';

/** Shared by /play, /room and the first-paint script in SiteDocument. */
export function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

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
