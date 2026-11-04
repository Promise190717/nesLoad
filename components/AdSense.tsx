/**
 * Google AdSense（adsbygoogle.js）。
 *
 * **刻意用裸 `<script>`，不用 `next/script`。** 2026-11-04 第一次接入时用的是
 * `<Script strategy="beforeInteractive">`，结果 AdSense 后台报「找不到代码」——
 * 原因是 `beforeInteractive` 要求脚本**直接**写在 root layout 里，被包进
 * 自定义组件（SiteDocument）之后 Next 拿不到静态信息，就退化成客户端插入：
 * 渲染后的 DOM 里有，**初始 HTML 源码里没有**，爬虫（Mediapartners-Google）
 * 看到的是一份没有这段脚本的页面。
 *
 * 裸标签由 React 19 原样 SSR 进 `<head>`，`view-source` 就能看到，这也是
 * AdSense 后台给的那段代码的原始形状（`async` + `crossorigin`）。
 *
 * ⚠️ 别改回 `<Script>`：除了上面那条，ESLint 还有 `@next/next/no-script-component-in-head`
 *    专门禁止在 `<head>` 里用 `next/script`。
 *
 * 默认 `enabled = true`，只有 /admin 传 false —— 后台是自己的操作台，
 * 不该投放广告，也不该被 AdSense 算成流量。
 */
const ADSENSE_CLIENT = 'ca-pub-7558103610777312';

export default function AdSense({ enabled = true }: { enabled?: boolean }) {
  if (!enabled) return null;

  return (
    <script
      async
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
    />
  );
}
