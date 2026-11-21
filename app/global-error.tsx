'use client';

import { useSyncExternalStore } from 'react';
import { isLocale, localePath, SITE_NAME, translate, type Locale } from '@/lib/i18n';

/**
 * 根错误边界 —— 只在**根布局自己崩了**的时候出现。
 *
 * 和 `app/[locale]/error.tsx` 的分工：
 *   · 页面/数据抛错 → `[locale]/error.tsx`（外壳、顶栏、页脚都还在，只是正文被替换）
 *   · 根布局（`app/[locale]/layout.tsx`）抛错 → 这里，整棵 HTML 都得自己搭
 *
 * ## 为什么这一页不 import 任何站点组件
 *
 * 它触发的前提就是「上层已经不可靠」。`GamesShell` / `I18nProvider` / `SiteDocument`
 * 任何一个还在等 provider 或服务端数据，这里就会二次崩溃 —— 那才是真正的白屏。
 * 所以整页只有：内联 style、`translate()`（纯数据）、两个落点。
 *
 * ## 为什么用 `<a>` 不用 `<Link>`
 *
 * 根布局都崩了，客户端 router 的状态不可信。整页跳转最稳，慢一点无所谓。
 *
 * ## 没有自动刷新（2026-11-21 用户要求）
 *
 * 和段级错误页同一条规矩：只提示「服务器请求量较高，等几秒再刷新」，刷新动作由用户点。
 * **这一页没有任何定时器。**
 *
 * ⚠️ 这一页**不知道用户选的主题**，所以按 `prefers-color-scheme` 跟随系统，
 *    不读 localStorage（读取本身可能就在崩溃路径上）。
 */

/**
 * 地址第一段就是语言（`/zh/...`）。
 *
 * 用 `useSyncExternalStore` 而不是 `useState` + `useEffect`：后者会被 React 编译器
 * 判定成「effect 内同步 setState → 级联渲染」（eslint 直接报 error），而且首屏会
 * 先按 en 画一遍再翻字。这里的 server snapshot 给空串（服务端没有地址），
 * hydrate 之后 React 自己切到真实 pathname —— hydration mismatch 由它内部兜住。
 */
function usePathLocale(): Locale {
  const pathname = useSyncExternalStore(
    /* 地址变了整页会重新加载，不需要订阅 */
    () => () => {},
    () => window.location.pathname,
    () => ''
  );
  const first = pathname.split('/')[1] ?? '';
  return isLocale(first) ? first : 'en';
}

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  /* 语言从地址推断：根级拿不到 params，pathname 是唯一线索。 */
  const locale = usePathLocale();

  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
    translate(locale, key, { site: SITE_NAME[locale], ...vars });

  const home = localePath(locale, '/');

  return (
    <html lang={locale}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${t('error.title')} — ${SITE_NAME[locale]}`}</title>
        <style>{`
          :root {
            --ge-bg: #181c26; --ge-text: #edeef2; --ge-dim: #99a0b0;
            --ge-line: #3d4457; --ge-btn: #242936; --ge-accent: #d16c70;
            color-scheme: dark;
          }
          @media (prefers-color-scheme: light) {
            :root {
              --ge-bg: #f7f7f7; --ge-text: #26292f; --ge-dim: #6a7080;
              --ge-line: #d9dbe3; --ge-btn: #eceef2; --ge-accent: #a83e46;
              color-scheme: light;
            }
          }
          html, body { margin: 0; padding: 0; background: var(--ge-bg); }
          body {
            min-height: 100dvh; display: flex; align-items: center; justify-content: center;
            padding: 24px; box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: var(--ge-text); -webkit-font-smoothing: antialiased;
          }
          .ge-main { width: min(560px, 100%); }
          .ge-label {
            margin: 0; font-size: 11px; letter-spacing: .18em; text-transform: uppercase;
            color: var(--ge-accent); font-weight: 500;
          }
          .ge-title { margin: 12px 0 0; font-size: 22px; line-height: 1.35; font-weight: 500; }
          .ge-desc { margin: 16px 0 0; font-size: 13px; line-height: 1.9; color: var(--ge-dim); }
          .ge-actions { margin: 20px 0 0; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
          .ge-btn {
            display: inline-block; padding: 8px 16px; font-size: 12px; line-height: 1.4;
            color: var(--ge-text); background: var(--ge-btn);
            border: 1px solid var(--ge-line); border-radius: 2px;
            cursor: pointer; text-decoration: none;
          }
          .ge-btn:hover { color: var(--ge-accent); border-color: var(--ge-accent); }
          .ge-link { font-size: 12px; color: var(--ge-dim); text-decoration: none; }
          .ge-link:hover { color: var(--ge-accent); }
          .ge-ref { margin: 40px 0 0; font-size: 11px; color: var(--ge-dim); font-family: ui-monospace, Menlo, monospace; }
        `}</style>
      </head>
      <body>
        <main className="ge-main">
          <p className="ge-label">ERROR</p>
          <h1 className="ge-title">{t('error.title')}</h1>
          <p className="ge-desc">{t('error.description')}</p>
          <div className="ge-actions">
            <button type="button" className="ge-btn" onClick={() => window.location.reload()}>
              {t('error.refresh')}
            </button>
            <a className="ge-link" href={home}>
              {t('gamesPage.backHome')}
            </a>
          </div>
          {error.digest ? <p className="ge-ref">ref: {error.digest}</p> : null}
        </main>
      </body>
    </html>
  );
}
