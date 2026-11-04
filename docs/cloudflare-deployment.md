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

仍然 `force-dynamic`（刻意保留）：搜索页与机种搜索（读 `searchParams`，键空间无界）、
`/account` `/login`（读 cookie）、`/catalog` 影子路由（旧地址兼容）。
2026-11-03 起 `/play` 与 `/privacy` `/terms` `/about` `/contact` 已改回按需 ISR ——
它们既没有登录态也没有查询参数，逐请求渲染等于白烧 CPU。

### 第 0 层：Workers Caching（在 Worker **外面**）

`wrangler.jsonc` 里 `"cache": { "enabled": true }`（2026-11-03 开）。这是 Cloudflare 的两层
缓存，放在 Worker **前面**：命中时 Worker 完全不执行，**连 isolate 都不启动**。

为什么它是主力：免费版 10ms CPU 连「加载 OpenNext 的 bundle + 初始化 18 张 i18n 表」都
装不进去，所以 Worker 里那层 Cache API 即使命中也要先付一次冷启动的钱，照样 1102。
只有在 Worker 外面命中，才真正绕开这个上限。

它按 RFC 9111 读响应头，所以控制手段全在 `worker.ts`：

- 整页 HTML / XML / 纯文本 / 公开 JSON → `withCdnHeaders()`：`s-maxage=<TTL>`
  + **`Vary: RSC`**（只留这一个维度，甩掉每次导航都不同的 `Next-Router-State-Tree`）。
- 其他一律 `noStore()`：私有页面、RSC flight、重定向、5xx。**必须显式写** ——
  9111 的启发式新鲜度会把「没有缓存头」也当成可缓存。
- `Vary` **不能像 Cache API 那份一样删干净**：它的键是 URL，HTML 和 flight 同一个 URL
  靠 `RSC` 头区分，删了会把整页 HTML 喂给软导航。Cache API 那份能删是因为键里塞了
  `__nesload_rsc` 变体标记。

默认不跨版本（`cross_version_cache` 没开），发版即清空 —— 部署后跑 `pnpm warm:edge`
把热门地址灌一遍。命中不看 `x-nesload-edge`，看 `cf-cache-status`。

### 第 2 层：worker.ts 的 Cache API 边缘缓存

`wrangler.jsonc` 的 `main` 指向根目录 `worker.ts`（OpenNext 自定义 Worker 入口，
官方 howto：opennext.js.org/cloudflare/howtos/custom-worker），在 OpenNext handler 外包一层
`caches.default`。**2026-11-03 起它是第 0 层的兜底**：命中也要先进 Worker，救不了冷 isolate。

- **缓存** `GET` 的 **200 / 404** 响应，内容为 HTML / XML / 纯文本 / RSC flight；
  TTL：页面 **24 小时**、404 **1 小时**、`/api/games*` **30 秒**。
  （2026-11-03 从 30 分钟 / 5 分钟拉长：过期就是一次重渲染，而重渲染在免费版大概率
  超时、也就存不回缓存 —— 长尾地址会永远停在冷状态。详见 `worker.ts` 文件头。）
- **HTML 和软导航（`RSC` 头）都缓存**，两者用不同的缓存键前缀 —— 2026-11-03 之前
  RSC 一律放行，等于这层缓存对真实浏览行为（点卡片）完全不存在。
- **不再因为 session cookie 放行**：公共页面的 HTML 里没有任何登录态（收藏钮 / 评论框 /
  顶栏账号都是客户端组件自己问接口），登录用户吃的和匿名用户是同一份字节。
  真正私有的 `/account` `/login` `/admin*` 按路径排除。
- **一律放行**：`/admin*`、`/account*`、`/login*`（含语言前缀）、`/_next/*`、
  除 `/api/games` 之外的所有 `/api/*`、`next-router-segment-prefetch` 请求、
  307/301 重定向（语言跳转依赖 cookie）、5xx。
- 缓存键剥掉 `utm_*` / `fbclid` / `gclid` / `msclkid` / **`_rsc`**；
  `/play` 和 `/games/<id>/download` **整个查询串都剥掉** —— 这两页的 HTML 与参数无关：
  `/play` 的 `id` / `room` / `lang` 全由客户端读，下载页只读 `params`、`?lang=` 它根本不看
  （2026-11-03 起详情页的下载钮也不再拼这个参数，它纯粹是把缓存键翻倍）。
- **写入前删掉 `Vary`**：OpenNext 给页面带的是
  `vary: RSC, Next-Router-State-Tree, …`，`Cache.match()` 会按存储时的 `Vary` 逐个头比对，
  而路由树每次导航都不同 —— 不处理的话「存得进、永远读不到」。
  ⚠️ 别指望 `match(key, { ignoreVary: true })`：Workers 的 `CacheQueryOptions` 没实现这个
  字段，传了直接抛异常（2026-11-03 全站 1101 事故）。
- 命中的请求**完全不消耗 CPU**；第 1 层命中还要进 Worker 读一次 R2，这一层连那次都省掉。
- 静态资产（`assets` 绑定）不进 Worker、不受影响。

第 1 层的陈旧窗口由 `revalidateTag` 即时清掉；第 2 层固定 24 小时，发版后条目**跨版本存活**，
不可接受就在仪表盘（Caching → Purge Everything）刷一次，可接受就不用管。
边缘 TTL 只在 `worker.ts` 顶部三个常量（`TTL_PAGE` / `TTL_NOT_FOUND` / `TTL_API`）里。
第 2 层命中看响应头 `x-nesload-edge: HIT`，第 0 层命中看 `cf-cache-status`。

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
- 游戏详情：**构建期零预渲染**（`generateStaticParams() { return [] }` + `dynamicParams = true`），首次访问生成并写进 R2，之后走 `enableCacheInterception`。2026-10-24 起就没有 `STATIC_GAME_LIMIT` 这个构建变量了，别再去配。
- 下载页（`/games/<id>/download`，2026-11-04 改）：页面 HTML **与 id 无关**（正文由客户端组件 `GameDownloadPanel` 从 `/api/games/<id>` 取），`worker.ts` 把整族 URL 的边缘缓存键折叠成**每语言一条**（`/<locale>/__nesload_download`）。2110 款 × 18 语言 ≈ 3.8 万条地址共用 18 份副本，冷渲染从「每个 URL 一次」降到「每种语言一次」。代价：这一页没有逐页 `<title>` / OG，因此挂 `noindex, follow`（它本来就不进 sitemap）。⚠️ 别把任何 id 相关字段加回服务端渲染，否则折叠缓存会把 A 游戏的页面发给 B。
  - **整条下载链路可一键关掉**：`lib/features.ts` 的 `ROM_DOWNLOAD_ENABLED`（2026-11-04 起为 `false`，AdSense 送审期间）。关掉后详情页不画下载钮、这条路由 `notFound()`、首页 FAQ 里那条一起收起。编译期常量，改完必须重新构建部署。
- 分页、搜索和语言筛选：公开 URL 不变；middleware 将有意义的查询参数编码为内部路径，使 Next 的页面缓存按查询隔离。未知追踪参数不会制造新的缓存副本。重复参数交给原有规范化逻辑，超过 2KB 的目录查询返回 414。
- `/room`、`/play`：静态游戏外壳，游戏 ID、单人/建房/加入参数由客户端处理；游戏资料从公开 API 获取（2026-10-20 起该 API 不缓存，实时读库）。运行前先检查 NDS 单人限制。游戏专属 SEO 和分享图保留在游戏详情页，运行页使用通用 metadata。
- 公开单款游戏 API `/api/games/[id]`：**不缓存**（2026-10-20 起，此前是预生成 + 30 天缓存），每次请求实时读库，保证与详情页看到的数据一致；列表 API `/api/games` 同样实时。登录、账户、后台和其他业务 API 继续动态鉴权。游戏评论的登录态来自 `private, no-store` API，公共 HTML 不含个人状态。收藏数为缓存快照，点击收藏仍乐观更新。
- `SITE_URL` 不再从请求 Host 猜测。未设置时使用正式域名，预览环境如需独立 canonical 应显式设置。
- 全局 404 使用 Next 的 `globalNotFound`（实验特性），配合语言与后台两个独立根布局，避免全站为了读取语言 Cookie 而动态渲染。

## 验收与限制

`pnpm build` 中公共路由及单款游戏 API 应为 `●`/`○`，账户和其他业务 API 为 `ƒ`。运行生产服务器后可设置 `TEST_BASE_URL=http://localhost:3100` 并运行 `pnpm test:static`，检查语言、分页、搜索、HTML/RSC、缓存命中和登录跳转。

部署后按这个顺序看：

1. **Workers Logs 的 `exceededCpu`（1102）** —— 还剩多少、集中在哪些路径。
2. **`cf-cache-status`** —— 同一地址第二次请求应该是 `HIT`。一直 `MISS` 说明响应头没配对
   （多半是 `Vary` 没收窄，或者被 `noStore` 了），先查 `worker.ts` 的 `withCdnHeaders`。
3. **`pnpm warm:edge`** —— 发版后 Workers Caching 全清，跑一遍把热门地址灌上；
   失败的那批重跑一次，成功率高很多（第一次往往已经把 isolate 焐热了）。

OpenNext 的缓存拦截让命中的 HTML/RSC 在初始化渲染器前返回，但它仍在 Worker **里面**，
冷 isolate 下照样要付 bundle 初始化的 CPU —— 这正是第 0 层存在的理由。
**首次生成**（从没被访问过、也不在预热名单里的长尾地址）依然会 1102，这是免费版 10ms 的硬账，
除升级套餐没有别的解法；能做的只是让「第一次」尽量少发生。查询组合无法全部预生成，
必要时进一步把搜索结果改为客户端数据加载。

参考：[OpenNext 缓存配置](https://opennext.js.org/cloudflare/caching)、[Cloudflare 资源限制](https://developers.cloudflare.com/workers/platform/limits/)。
