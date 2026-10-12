'use client';

import { useEffect } from 'react';

/**
 * 注册 Service Worker（`public/sw.js`）。**不渲染任何东西**。
 *
 * 为什么要单独一个组件、而不是塞进 ConsoleScene：它是**页面级**的事，
 * 和房间 / 掌机那套界面没有关系 —— 挂在根布局里，`/privacy` `/terms` 也一样生效。
 * 而且它是纯副作用（返回 null），放在布局里不影响任何布局计算。
 *
 * ---------------------------------------------------------------------------
 * 三条刻意的约束
 *
 * **1. 只在生产环境注册。** 开发时 SW 会把 `/_next/static/` 的响应缓存下来，
 * 而 dev 的 chunk 是**边改边变**的 —— 结果是改了代码页面不更新，得手动清 CacheStorage，
 * 排查起来极其费劲（而且会让人怀疑是 Next 的 HMR 坏了）。所以 dev 下直接不注册。
 *
 * **2. 等 `load` 之后再注册。** SW 的安装会去下载脚本、解析、跑 install ——
 * 挤在首屏那几个关键请求里只会拖慢可交互时间。PWA 的可安装性不差这一两秒。
 *
 * **3. 失败一律静默。** 浏览器不支持、被隐私设置拦下、脚本 404 —— 都只当作「这次没装上」，
 * 不影响玩（`sw.js` 只做加速，不做任何页面运行必需的事）。这和站里其他「载入失败静默」
 * 的处理是同一个口径。
 *
 * 注意这里**没有**处理「有新版本可用，是否刷新」那套提示：`sw.js` 在 install 里直接
 * `skipWaiting()`，新版本会自己接班，不需要用户点。代价是新 SW 生效时页面可能还在跑
 * 旧代码 —— 但静态资源带 hash、页面走网络，实际不会串版本。
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = () => {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    };

    /*
     * 已经加载完（脚本在 load 之后才跑到）就直接注册；否则等 load。
     * `once: true` 顺手把监听器摘掉，省得在卸载时还要对着一份已经跑过的 handler 解绑。
     */
    if (document.readyState === 'complete') {
      register();
      return;
    }

    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
