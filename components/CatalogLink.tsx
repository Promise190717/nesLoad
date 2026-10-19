import type { AnchorHTMLAttributes, ReactNode } from 'react';

/**
 * 目录页里那些**带查询参数**的链接 —— 一律用普通 `<a>`，走**整页跳转**。
 *
 * ---------------------------------------------------------------------------
 * 为什么不能给它们用 `<Link>`（2026-10-19 线上事故）
 *
 * 本站的目录页（`/games`、`/consoles/<type>`、`/developers/<id>`）是**静态渲染 + ISR**：
 * 页面自己不读 `searchParams`，`?page=` / `?lang=` / `?q=` / `?console=` 这些维度是
 * `middleware.ts` 的 `catalogRewrite()` 改写出来的 —— 浏览器请求
 * `/zh/consoles/nds?lang=zh`，服务端实际渲染的是 `/zh/catalog/console/nds/lang%3Dzh`。
 * 这样每种查询组合都有一份独立的路由缓存条目，**而公开地址保持不变**。
 *
 * 这个做法对「整页文档请求」完全成立（服务端渲染出来的 HTML 一直是对的），
 * 但对 `<Link>` 的**软导航**不成立：客户端仍然请求 `/zh/consoles/nds?lang=zh`，
 * 拿回来的 flight 载荷却是 `/catalog/...` 那棵路由树的（segment 名字都对不上），
 * 客户端无法把它对到当前树上 ⇒ **只把地址栏改了，页面内容一动不动**。
 * 线上表现：点语种 tab / 翻页 / 机种筛选，URL 变了、列表和红色高亮纹丝不动。
 * 本地 `next dev` 每条请求都真渲染、且不走那套预渲染产物，所以看不出来。
 *
 * 试过的替代方案（都否掉了）：
 *   · 让页面直接读 `searchParams` ⇒ 路由变动态、ISR 与「静态缓存」整个作废；
 *     而且 Cloudflare Workers 每次浏览都要付一份渲染 CPU（数据层缓存兜不住这一层）。
 *   · 联机/中间件里把 RSC 请求也改写成 `/catalog/...` ⇒ 客户端拿到的树仍然不是它要的，
 *     症状只会换个方向再演一遍。
 * 所以答案是：**凡是被 `catalogRewrite` 改写的地址，都别走软导航**。整页跳转拿到的是
 * 服务端那份已经验证过的 HTML，代价只是一次文档请求（命中路由缓存，很快）。
 *
 * ⚠️ 判据是「地址里有没有那四个查询参数」，不是「链接长什么样」。以后再加新的
 *    catalog 查询维度（见 `lib/catalog-route.ts` 的 keys），链接也要换成这个组件。
 * ⚠️ 不带查询参数的链接（机种卡片、开发商卡片、返回）继续用 `next/link` —— 那些
 *    软导航是好的，也值得保留那份体感。
 */
export default function CatalogLink({
  href,
  children,
  ...rest
}: { href: string; children: ReactNode } & Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'href'
>) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
