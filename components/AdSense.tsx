import Script from 'next/script';

/**
 * Google AdSense（adsbygoogle.js）。
 *
 * 用 `next/script` 而不是往 `<head>` 塞裸标签，理由同 components/Analytics.tsx：
 * 裸标签在 App Router 下只要根布局换个写法就会漏；`Script` 由 Next 统一管插入时机。
 *
 * 与 GA 不同，这里**不能**用 `afterInteractive` —— AdSense 官方要求在页面尽可能早、
 * 用 `async` 加载这个库，这样后续渲染的广告位（`<ins class="adsbygoogle">`）才会被
 * 它自动初始化。用 `beforeInteractive`（App Router 里等价于官方推荐的
 * `<head>` 内 async 脚本）保证它在广告位水合前就位。
 *
 * ⚠️ 与 Analytics 一致，默认 `enabled = true`，只有 /admin 传 false —— 后台不该投放广告。
 */
const ADSENSE_CLIENT = 'ca-pub-7558103610777312';

export default function AdSense({ enabled = true }: { enabled?: boolean }) {
  if (!enabled) return null;

  return (
    <Script
      id="adsense-loader"
      async
      crossOrigin="anonymous"
      strategy="beforeInteractive"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
    />
  );
}
