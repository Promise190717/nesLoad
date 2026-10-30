# Cloudflare 免费 Workers：静态页面与 ISR

> ⚠️ **2026-10-24 起缓存策略调整为两层（见下面「缓存策略」一节）**：页面级缓存
> 恢复的是**运行时按需生成**那份（`revalidate`，构建期预渲染仍然不做——
> 不再有 `generateStaticParams`），外面叠一层 worker.ts 的 Cache API 边缘缓存。
> 下文关于「预生成 18 种语言」「`populateCache` 预热」的说法只用于回溯旧部署。

Worker 名称为 `nesload`。`wrangler.jsonc` 已包含 OpenNext 的静态资源、R2 缓存、缓存失效记录及重建队列绑定。

## 缓存策略（2026-10-24，两层）

背景：2026-10-22 迁 Vercel 后全站 `force-dynamic`，而实际部署走 CF 免费版 Workers ——
每个请求现场渲染，免费版 10ms CPU（按中位数执行）装不下，实测 2117 成功 / 4298 超限（1102）。
修复分两层，**构建期预渲染（`generateStaticParams`）两样都没有**：

### 第 1 层：页面级按需缓存（Next 增量缓存）

目录类页面恢复 `export const revalidate = <7 天常量>`（首页 / `/games` 及分页与机种筛选 /
详情 / 下载 / 机种 / 开发商，共 16 个页面，常量见 `lib/server/sb-games.ts` 等）。
首次访问现场渲染并写入 R2 增量缓存，之后 `enableCacheInterception` 在初始化渲染器之前
直接返回；后台改动靠既有的 `revalidateTag('games')` 立即失效。

⚠️ **动态段路由（`/games/[id]` 这类）光有 `revalidate` 不够**：App Router 只有挂了
`generateStaticParams` 的动态段才进 ISR，否则永远逐请求渲染、响应头
`private, no-cache, no-store`（2026-10-24 踩过）。这些页面加了
`generateStaticParams() { return [] }` + `dynamicParams = true` ——
返回空数组 = 构建期零预渲染，未知参数运行时首次访问生成并缓存（`fallback: 'blocking'`
的等价物），正好满足「构建期预渲染不做」的口径。

仍然 `force-dynamic`（刻意保留）：搜索页（`searchParams`）、`/play` 与 `/room`
（空壳渲染只要几毫秒，不值得把 HTML 钉住——见 play 页注释里 chunk 死循环那段）、
`/privacy` `/terms`（同上）、`/account` `/login`、`/catalog` 影子路由（旧地址兼容）。

### 第 2 层：worker.ts 的 Cache API 边缘缓存

`wrangler.jsonc` 的 `main` 指向根目录 `worker.ts`（OpenNext 自定义 Worker 入口，
官方 howto：opennext.js.org/cloudflare/howtos/custom-worker），在 OpenNext handler 外包一层
`caches.default`：

- **只缓存**匿名（无 `nesload_user` / `nesload_admin` cookie）`GET` 的 **200 / 404** 响应，
  内容为 HTML / XML / 纯文本；TTL 200 存 **10 分钟**、404 存 2 分钟。
- **一律放行**：`/api/*`、`/admin/*`、`/_next/*`、带 `RSC` 头的软导航请求、
  带 session cookie 的请求、307/301 重定向（语言跳转依赖 cookie，不能缓存）、5xx。
- 缓存键剥掉 `utm_*` / `fbclid` / `gclid` 追踪参数。
- 命中的请求**完全不消耗 CPU**；第 1 层命中还要进 Worker 读一次 R2，这一层连那次都省掉。
- 静态资产（`assets` 绑定）不进 Worker、不受影响；所以没用 wrangler 的
  `"cache": { "enabled": true }` —— 那会把资产请求也变成计入额度的请求。

第 1 层的陈旧窗口由 `revalidateTag` 即时清掉；第 2 层固定 10 分钟，发版后条目**跨版本存活**，
不可接受就在仪表盘（Caching → Purge Everything）刷一次，可接受就不用管。
边缘 TTL 只在 `worker.ts` 顶部两个常量里。

sitemap 同步瘦身：**下载页（`/games/<id>/download`）不再进 sitemap**（每语言省约 2100 条，
抓取邀请面减半）。页面照常可收录 —— 每个详情页都有指过去的链接，只是不再主动推荐。

## 首次配置

1. 在 R2 创建一个**私有缓存桶** `nesload-next-cache`，不要复用公开的 ROM 桶。可在控制台创建，或运行 `pnpm exec wrangler r2 bucket create nesload-next-cache`。
2. 保留现有 Worker 的域名和运行时 secrets。构建环境也需要 `CF_ACCOUNT_ID`、`CF_D1_API_TOKEN`、`D1_DATABASE_ID`，以及应用原有的 R2 公共地址配置，因为现在构建时会读取公共游戏资料。只授予构建令牌所需权限，不要把 secrets 写进仓库。
3. 构建环境设置 `SITE_URL=https://www.retrogamesbox.com`，使静态 canonical 和分享地址与线上一致。
4. Cloudflare Git 构建命令使用 `pnpm cf:build`，部署命令使用 `pnpm cf:deploy`。部署命令会填充构建期缓存；不要直接用裸 `wrangler deploy` 跳过这一步。
5. 本地验证：`pnpm cf:build` 后运行 `pnpm cf:preview`，它使用本地存储，不会发布到线上。OpenNext 推荐在 Linux/WSL 或 Cloudflare 的 Linux 构建环境打包。

### 构建变量与运行时变量必须分别配置

Cloudflare 的「设置 → 构建 → 构建变量和机密」只供构建使用；线上接口需要在「设置 → 变量和机密」另行配置。预生成页面可以正常展示，并不代表动态接口已经有数据库凭据。

| 变量 | 构建环境 | 运行时环境 |
| --- | --- | --- |
| `CF_ACCOUNT_ID` | 必需 | 必需 |
| `D1_DATABASE_ID` | 必需 | 必需 |
| `CF_D1_API_TOKEN` | 必需，设为机密 | 必需，设为机密 |
| `R2_PUBLIC_BASE` | 必需 | 必需 |
| `SITE_URL` | 建议显式配置 | 已在 Wrangler 的 vars 中配置 |
| `SUPABASE_URL` | 建议显式配置（预渲染会读库） | 已在 Wrangler 的 vars 中配置 |
| `SUPABASE_SECRET_KEY` | 建议配置，设为机密（预渲染会读库；只在本地构建时可由 `.env.local` 顶上） | **必需，设为机密**；缺失时所有读库的接口和页面都会 500 |
| `SESSION_SECRET` | 不需要 | 登录和账户功能必需，设为机密 |
| `CATALOG_SOURCE` | 不需要 | 前台目录来源：`upstream`（默认，读源站）/ `d1`（读数据库），已在 Wrangler 的 vars 中配置 |
| `SUPABASE_DB_URL` | 不需要 | 不需要（只有本地脚本直连 pooler 时用） |

⚠️ 数据库只走 HTTPS（PostgREST + `public.exec_sql`，见 `lib/server/pg.ts`）。**不要**在 Worker 里配 pooler 直连 —— 2026-10-20 试过，Workers 的 TCP + TLS 撑不住，上线后所有动态接口一起 500。

运行时的 R2 上传凭据、Turnstile 等其他配置也应保留原值，不要因补数据库变量而重置。保存控制台变量时点击「部署」使它们应用到正式 Worker。

`wrangler.jsonc` 已设置 `keep_vars: true`，以保留控制台中的普通运行时变量。这个选项只能防止后续部署覆盖变量，无法恢复此前已删除的值。机密值不应写入仓库；可从本地 `.env.local` 复制相应值到控制台。

DO 使用 SQLite 类，配置未要求升级 Workers Paid；R2、DO 和 Workers 各有自己的免费额度，仍需在控制台查看实际用量。此次修改没有创建远程资源、修改套餐或发布 Worker。

## 页面策略

- 首页、游戏列表首页、机种页、开发商页：按 18 种语言预生成（2026-10-20 从 4 种扩上来），公共内容缓存 30 天。
- 游戏详情与下载页：默认预生成最新 24 款游戏的 18 种语言，其余首次访问时生成并缓存 30 天。构建变量 `STATIC_GAME_LIMIT` 可提高预生成数量；设为 0 表示全部按需生成，不表示无限数量。⚠️ 语言从 4 种扩到 18 种之后这个乘数是 4.5 倍（24 款 × 18 语言 × 详情/下载两页 = 864 页），游戏数量较多时需权衡构建时间和缓存存储量。
- 分页、搜索和语言筛选：公开 URL 不变；middleware 将有意义的查询参数编码为内部路径，使 Next 的页面缓存按查询隔离。未知追踪参数不会制造新的缓存副本。重复参数交给原有规范化逻辑，超过 2KB 的目录查询返回 414。
- `/room`、`/play`：静态游戏外壳，游戏 ID、单人/建房/加入参数由客户端处理；游戏资料从公开 API 获取（2026-10-20 起该 API 不缓存，实时读库）。运行前先检查 NDS 单人限制。游戏专属 SEO 和分享图保留在游戏详情页，运行页使用通用 metadata。
- 公开单款游戏 API `/api/games/[id]`：**不缓存**（2026-10-20 起，此前是预生成 + 30 天缓存），每次请求实时读库，保证与详情页看到的数据一致；列表 API `/api/games` 同样实时。登录、账户、后台和其他业务 API 继续动态鉴权。游戏评论的登录态来自 `private, no-store` API，公共 HTML 不含个人状态。收藏数为缓存快照，点击收藏仍乐观更新。
- `SITE_URL` 不再从请求 Host 猜测。未设置时使用正式域名，预览环境如需独立 canonical 应显式设置。
- 全局 404 使用 Next 的 `globalNotFound`（实验特性），配合语言与后台两个独立根布局，避免全站为了读取语言 Cookie 而动态渲染。

## 验收与限制

`pnpm build` 中公共路由及单款游戏 API 应为 `●`/`○`，账户和其他业务 API 为 `ƒ`。运行生产服务器后可设置 `TEST_BASE_URL=http://localhost:3100` 并运行 `pnpm test:static`，检查语言、分页、搜索、HTML/RSC、缓存命中和登录跳转。

部署后在 Workers Logs 比较普通刷新时的 CPU time 和 `exceededCpu`。OpenNext 的缓存拦截让命中的 HTML/RSC 在初始化 Next 渲染器前返回，但**首次生成、过期重建、动态接口仍受免费版 10ms CPU 限制**；这不是绕过套餐限制，也不能保证所有请求永远不出现 1102。若冷门详情仍超限，优先增大 `STATIC_GAME_LIMIT` 并重新构建。查询组合无法全部预生成，必要时进一步将搜索结果改为客户端数据加载。

参考：[OpenNext 缓存配置](https://opennext.js.org/cloudflare/caching)、[Cloudflare 资源限制](https://developers.cloudflare.com/workers/platform/limits/)。
