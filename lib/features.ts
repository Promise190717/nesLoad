/**
 * 站点功能开关。
 *
 * 这里每一条都要能一句话说清「关掉之后线上是什么样」。**改这里 = 改线上行为**，
 * 而且它是**编译期常量**：改完必须重新构建部署（`pnpm cf:deploy`）才生效。
 *
 * 为什么不做成环境变量：这些开关客户端组件也要读（按钮画不画），而 `NEXT_PUBLIC_*`
 * 本来就是构建期内联 —— 绕一圈只会多出一个「后台配了但没生效」的坑。
 */

/**
 * 「把 ROM 存到本地」这条链路：详情页那颗「下载 ROM」钮 + `/games/<id>/download` 那一页。
 *
 * `false` 时它从站点上整体消失：
 *   · 详情页动作区不画那颗钮（`downloadHref` 传 `null`，见 `GameLanguageActions`）；
 *   · 下载页直接 `notFound()`，旧外链和已收录地址一律 404，不吐任何字节；
 *   · 首页 FAQ 里「能不能下载 ROM」那条一起收起（`app/[locale]/page.tsx` 的 FAQS）。
 *
 * 🔴 **在线游玩不受影响**：模拟器照样从 `/api/games/<id>/rom` 取字节。那条接口
 *    不属于这个开关管 —— 关掉它等于把整个站关掉（详见 `app/api/games/[id]/rom/route.ts`）。
 *
 * 2026-11-04 关掉，用途是 Google AdSense 送审期间把「下载 ROM」从站点上摘干净。
 */
export const ROM_DOWNLOAD_ENABLED = false;
