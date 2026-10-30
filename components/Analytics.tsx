import Script from 'next/script';

/**
 * Google Analytics 4（gtag.js）。
 *
 * 用的就是 GA 后台给的那段原样代码，只做了两处适配：
 *
 * - **改成 `next/script`**，不是往 `<head>` 里塞两个裸 `<script>`。裸标签在 App Router 下
 *   只要根布局换个写法（或将来挪到 `template` 里）就会漏；`Script` 由 Next 统一管插入时机。
 * - **`strategy="afterInteractive"`**：水合之后再拉。本站首屏要抢的是 emulator 的
 *   WASM 核心，GA 那 60 多 KB 不该跟它挤同一条关键路径。代价只是会漏掉
 *   「打开就走了」那一小撮极短会话，这个取舍是刻意的。
 *
 * 顺序不用管：就算脚本比 `gtag.js` 先跑，`gtag()` 也只是往 `dataLayer` 队列里塞一条，
 * 等 gtag.js 到了自己会取 —— 这正是 GA 官方那段代码这么写的原因。
 *
 * **不挂 `<noscript>`（GA 官方的 iframe 版）**：那个 iframe 会往每个页面塞一个隐藏框，
 * 在像素风的房间里偶尔会露出边缘；GA4 也不建议混合两种方式计数。
 *
 * ⚠️ 别改成 `@next/third-parties/google` 的 `<GoogleAnalytics>`：为了这一个 ID 多装一个包
 * 不划算，而且那个组件不允许自定义策略。
 */
const GA_MEASUREMENT_ID = 'G-DYGMWH33L7';

const GTAG_INIT = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_MEASUREMENT_ID}');`;

export default function Analytics({ enabled = true }: { enabled?: boolean }) {
  if (!enabled) return null;

  return (
    <>
      <Script
        id="ga-loader"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script
        id="ga-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: GTAG_INIT }}
      />
    </>
  );
}
