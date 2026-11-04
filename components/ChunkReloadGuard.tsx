'use client';

import { useEffect } from 'react';

/**
 * 发版后的自愈：捕获 `ChunkLoadError` 并自动整页刷新一次。
 *
 * ## 为什么需要它
 *
 * 本站的 HTML 在 CF 边缘缓存 24 小时（`s-maxage=86400`，见 worker.ts 的
 * `withCdnHeaders`），这个 TTL 是免费版压住 1102 的唯一手段，不能缩短。
 * 代价是**发版后旧 HTML 还会存活一段时间**，而它引用的
 * `/_next/static/chunks/*.js` 已经随新部署被替换掉了 —— 于是客户端
 * `import()` 拿到 404，抛 `ChunkLoadError`，页面白屏 / 显示
 * 「This page couldn't load」（2026-11-04 用户在首页撞到的就是这个）。
 *
 * 光靠改响应头救不了：`public/sw.js` 对 `/_next/static/` 是 network-first，
 * 每次都会真的去问网络，服务器上已删的 chunk 照样 404。所以必须**在客户端兜住**：
 * 发现 chunk 拉不到就重新导航一次，让浏览器去取新 HTML —— 新 HTML 引用的
 * 是新 chunk，一步到位。
 *
 * ## 两个刻意的克制
 *
 * - **只认 `/_next/static/`**。第三方脚本（GA / AdSense / 字体）404 是常事，
 *   为它们刷新整页只会把用户从正在读的内容上踢走，不能管。
 * - **60 秒内只刷一次**（`sessionStorage`）。刷新完拿到的若还是旧 HTML，
 *   再失败时就安静地放弃 —— 绝不能变成无限刷新循环，那比白屏更糟：
 *   用户连「后退」都按不住。
 *
 * 刷新用 `location.reload()` 而不是 `router.refresh()`：后者只重取 RSC payload，
 * 拿不到新的 chunk 引用，解决不了问题。
 *
 * ⚠️ `error` 事件必须用**捕获阶段**（第三个参数 `true`）。资源加载失败不冒泡，
 *    只有捕获阶段的事件才带得到 `target`（那个 `<script>` / `<link>`）。
 */
const RELOAD_FLAG = 'nesload:chunk-reload-at';
/** 两次自愈之间的最小间隔。小于这个值就认为「刷了也没用」，不再重试。 */
const RELOAD_COOLDOWN_MS = 60_000;

/** `import()` 失败在不同浏览器里报的错长得不一样，四个都收。 */
function isChunkError(message: string): boolean {
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
    message
  );
}

function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) ?? 0);
    if (Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN_MS) return;
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    /* 隐私模式下 sessionStorage 会抛 SecurityError：那就不做防抖，宁可多刷一次也别卡死 */
  }
  window.location.reload();
}

export default function ChunkReloadGuard() {
  useEffect(() => {
    /** 资源加载失败：`target` 是那个加载失败的 `<script>` / `<link>`。 */
    function onResourceError(event: Event) {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (target.tagName === 'SCRIPT') {
        const src = (target as HTMLScriptElement).src;
        if (src.includes('/_next/static/')) reloadOnce();
        return;
      }

      /* CSS 掉了是整页没样式，同样值得刷一次；判据一样只认自己的产物目录 */
      if (target.tagName === 'LINK') {
        const link = target as HTMLLinkElement;
        if (link.rel !== 'stylesheet') return;
        if (link.href.includes('/_next/static/')) reloadOnce();
      }
    }

    /** 脚本已加载、执行时抛出的错（Turbopack 的 `ChunkLoadError` 走这里，不是 reject）。 */
    function onError(event: ErrorEvent) {
      if (event.message && isChunkError(event.message)) reloadOnce();
    }

    /** `import()` 的另一种失败形态：返回 rejected promise。 */
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason as { message?: unknown } | undefined;
      const message = typeof reason?.message === 'string' ? reason.message : String(event.reason ?? '');
      if (isChunkError(message)) reloadOnce();
    }

    window.addEventListener('error', onResourceError, true);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('error', onResourceError, true);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return null;
}
