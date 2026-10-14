const PREVIOUS_URL = '__nesloadPreviousUrl';

/** Remember actual history entries, including Next.js client-side navigation. */
export function trackSiteHistory(): () => void {
  const history = window.history;
  const push = history.pushState;
  const replace = history.replaceState;
  if (!(PREVIOUS_URL in (history.state ?? {}))) {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    // A referrer on reload/back-forward can describe a much older navigation.
    const previous = navigation?.type === 'navigate' ? document.referrer : null;
    replace.call(history, { ...history.state, [PREVIOUS_URL]: previous }, '');
  }
  const trackedPush: History['pushState'] = function (data, title, url) {
    push.call(history, { ...data, [PREVIOUS_URL]: window.location.href }, title, url);
  };
  const trackedReplace: History['replaceState'] = function (data, title, url) {
    replace.call(history, { ...data, [PREVIOUS_URL]: history.state?.[PREVIOUS_URL] ?? null }, title, url);
  };
  history.pushState = trackedPush;
  history.replaceState = trackedReplace;
  return () => {
    if (history.pushState === trackedPush) history.pushState = push;
    if (history.replaceState === trackedReplace) history.replaceState = replace;
  };
}

export function canReturnWithinSite(): boolean {
  if (window.history.length <= 1) return false;
  // The Navigation API exposes the real preceding entry when supported.
  const navigation = (window as Window & {
    navigation?: {
      currentEntry?: { index: number };
      entries: () => { index: number; url: string | null }[];
    };
  }).navigation;
  let previous = window.history.state?.[PREVIOUS_URL];
  if (navigation?.currentEntry) {
    const index = navigation.currentEntry.index;
    previous = navigation.entries().find(entry => entry.index === index - 1)?.url;
  }
  if (typeof previous !== 'string' || !previous) return false;
  try { return new URL(previous).origin === window.location.origin; }
  catch { return false; }
}
