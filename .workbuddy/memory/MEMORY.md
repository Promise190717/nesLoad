# nesLoad — 项目长期记忆

> 只留**动手前必须知道的硬约束**；根因与历史见 `DETAILS.md`，来龙去脉见 `2026-*.md`。
> 动手前先 `git status`；**不主动实测**：改完只做 typecheck + lint，讲清交给用户看。
> 碰「抽屉/入口、加载条、联机/手柄/街机、NDS-EJS 核、彩蛋、详情页动作区、评论/收藏、多语言侧表、`/play` 外壳与右栏」前**先读 `DETAILS.md`**。

## 铁律

- 站名唯一来源 `lib/i18n.ts` `SITE_NAME`，文案写 `{site}`；**全站唯一键盘操作是 `Esc`**。
- 别动：`package.json` name、`nesload:*` 存储键、`nesload_locale`/`nesload_admin` cookie、`netplay.ts` `APP_ID`。
- 🔴 **UI 别自作主张大改**：用户说「太丑/重构」→ 先讲方案或只改最刺眼的一处，**等他点头再铺开**。
- 注释写「为什么」并含否掉的方案；临时探针验完必删。法务 `lib/legal.ts` 中英各一份，书面短句。

- H5 专栏 2026-11-21 整体移除：`/h5` 路由、`components/h5`、`lib/h5`、`public/h5`、`public/models`、`scripts/h5-surfaces.py`、`h5.*` 文案键、`/h5/*`+`/models/*` 响应头、`three`/`@types/three` 依赖全删。**别再恢复**。

## 语言（18 种 × 界面与内容）

- 界面 18（`LOCALES` 照上游 hreflang，`LOCALE_OPTIONS` English 第一）＝内容 18（`CONTENT_LOCALES`）；后台表单只编 4 种（`ADMIN_FORM_LOCALES`），其余脚本回填。
- 加语言一次改完：`LOCALES`/`Locale`、新 `lib/i18n.<code>.ts`（逐键对齐）、`LOCALE_OPTIONS`/`LOCALE_PREFIX`/`SITE_NAME`/`HTML_LANG`/`OG_LOCALE`/`DATE_LOCALE`/`resolveLocale`、legal 两份、`CONTENT_LOCALES` + 回填脚本。短标签一律 `consoleLabel()`，URL/枚举永远 `nes`。

## 机种 / 核心

- `ConsoleType` 14 台，清单唯一出口 `lib/consoles.ts`；**服务端组件不能 import `lib/emulator.ts`**；14 台全走 `public/cores/`。CD 机种（PS1/Sega CD/PCE CD）架构未通。
- 包内层不在 `lib/unwrap.ts` 白名单 ⇒ 不拆 ⇒ 判街机错；世嘉裸 `.bin` 按文件头兜；指纹在 unwrap.ts/emulator.ts **手抄两份必须同步**。
- 机种优先级：`unwrapped.console` → `loadRom` hint → `detectConsole`；**别在 /play 路上为嗅探把 7z 字节包成 File**。
- 🔴 退出先 `dropContentFiles()` 再 `exit()`（MEMFS 的 ROM 不回收）；载入途中离开靠 `launching`/`exitRequested` 落地后补 exit。

## 数据库 = Supabase

- 读库唯一出口 `lib/server/pg.ts` `query()`，**走 HTTPS**（PostgREST→`public.exec_sql`）；游戏主键 = 上游 slug。🔴 **绝不在 Worker 直连 Postgres**；只有 `scripts/*.mjs` 可直连。`SUPABASE_URL`+`SUPABASE_SECRET_KEY` 缺一全站 500。
- 文案侧表四张（game/developer/series/console_texts），主键 (slug, locale)；developer/series 名按 locale JOIN 现取。
- 🔴 前台读文案一律按语言裁：`textLocalesFor(locale)`（≤3 种），列表再加 `content:false`/`roms:false`；**不传 locale 就是全 18 种**，免费版 10ms 必爆。动过文案/图片必须升缓存键尾号；R2 换图传新键（-v2）。

## 主题 / 首屏

- `<html data-theme>` 写入者只有 SiteDocument 的 `BOOT_INIT` 与 `saveTheme()`；导航丢属性由 BootAttributes 只补缺不落盘。
- 🔴 深色灰阶是**冷调蓝灰**：ink-950 #181c26、900 #1e222e、850 #242936、800 #2c3241、700 #3d4457、600 #4a5061、500 #6a7080；400 以上中性灰。`--color-floor`/`--wall-top`/`--wall-bottom` 手抄值必须同步。`--color-crt-*` 与 `.screen` 永远黑。
- 桌面 RetroTv / 移动 HandheldConsole 判据 `<html data-mobile>`（device.ts + 内联脚本两份同步）；尺寸唯一出口 globals.css `--tv-*`。
- 🔴 **错误页不做自动刷新**（2026-11-21 用户明确要求）：`app/[locale]/error.tsx` + `app/global-error.tsx` 只提示「服务器请求量较高，等几秒再刷新」，刷新由用户点。别再往回加倒计时/定时器。

## 路由 / 缓存 / SEO

- 目录页维度全是路径段（`/page/N`、机种、语种嵌套；搜索 `?q=`）；地址构造唯一出口 `gamesHref`/`consoleHref`/`pageHref`；**别加新查询参数**。
- 🔴 **无前缀地址永远是英文**，不按 cookie 307；cookie 只让 `LocalePrompt` 别重复问。
- 🔴 三层缓存：⓪ Workers Caching（整页 HTML 走 `withCdnHeaders`，`Vary: RSC`；其余 `noStore`）→ ① R2 增量（`cached()` 30 天 + ISR 2592000）→ ② `worker.ts` Cache API（24h）。发版后跑 `pnpm warm:edge`。
- 🔴 整页 HTML 必须带 `stale-while-revalidate=7d` + `stale-if-error=1d`（404 只给 SWR 1 天）；缓存头**只从 `worker.ts` `pagePolicy()` 出**，Cache API 命中与现场渲染两条出口不许各写一份（2026-11-21）。一次完整 SSR 就是 100–500ms CPU，免费版 10ms 装不下 ⇒ 只能靠「别让它发生」，微优化没用。
- 🔴 ROM 取字节：区间 `?span=start-end`；分片回 200 + `X-Rom-Span`/`X-Rom-Total` + 准确 `Content-Length` + `?v=`，其余分支 `private, no-store`；**第 2 次重试必须换缓存键**（`&nc=`）。
- 🔴 `/api/games/[id]` 必须读 `getGameFullCached`（实时查库必 503）。
- 🔴 下载页 HTML 与 id 无关（缓存键折叠成 `/<locale>/__nesload_download`）：别把 id/逐页 title/canonical 加回服务端；下载钮必须裸 `<a>`；`noindex, follow`。
- 🔴 `<Link>` 预取：列表型与首屏动作型一律 `prefetch={false}`（全站没有 `loading.tsx`）。
- 「我是谁」唯一出口 `lib/current-user.ts` `fetchCurrentUser()`。长文档页共用 `DocPage.tsx`；免责声明唯一出处 `disclaimer()`。
- 🔴 开局页路径化（2026-11-17）：开库内游戏 = `/games/<id>/play`（`StaticPlay` 复用，room/mode/lang 仍 query）；**裸 `/play` 保留**（首页加入房间表单 + 本机文件，无游戏上下文）；带 id 旧深链 middleware `publicRoute` 301 搬 id 进路径段。`/embed/games/<id>` 纯播放页 `noindex`。触屏手柄只有 `:root[data-mobile='on']` 一条判据。
- 🔴 **开局页 / 登录页与 id、参数解耦（2026-11-21）**：`/games/<id>/play` 服务端**不许再认 id**（`StaticPlay` 不接 props，客户端从 `usePathname()` 剥 id、写 title；页面子树必须留在 `<Suspense fallback={null}>` 里）；`/login` **不许再读 cookie**（登录态与 `?next=` 全在 `LoginPanel` 客户端判）。两页的 HTML 因此逐语言相同，`worker.ts` 才能折叠缓存键：`playKeyPath`/`loginKeyPath`/`downloadKeyPath` 三族各每语言一份（`isFolded` 那族非 200 一律不存）。往这两页加回 `params`/`cookies()`/`searchParams` 就等于把 3.8 万条冷 URL 和 10/45 次 1102 加回来。
- 存档 = 电池 `.srm` 一款一份。🔴 房间页永久下线，别加入口、别读它。
- 🔴 功能开关唯一出口 `lib/features.ts`；`ROM_DOWNLOAD_ENABLED=false` 时下载钮不画、下载页 `notFound()`，`/api/games/[id]/rom` 不归它管。编译期常量，改完必须重新构建。

## 部署 / 校验

- `/_next/static/*` 绝不 immutable；`public/sw.js` 对 static 必须 network-first（改策略 `VERSION` +1）；发版后 purge CF。
- 🔴 `open-next.cache.ts` 的 `name` 必须逐字等于 `cf-r2-incremental-cache`。
- 大 ROM 唯一下载路 `lib/http.ts` `fetchRomWithProgress`；R2 无版本控制，删 ROM 永久丢；键 `roms/<机种>/<slug>-<lang><ext>`。
- 展示地址一律 `publicUrlOrNull()`；`next-cache-purge.mjs` / `r2-purge.mjs` 都不收 --bucket/--prefix。
- `pnpm dev` 别在沙箱起；typecheck 用 `npx tsc --noEmit --incremental false`；`pnpm build` 交给用户。
- 🔴 **push 必须走代理且拆包**：直连 github `000`；`git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=... -c http.version=HTTP/1.1 -c http.postBuffer=104857600 push`。**单次 >~10MB 会被代理掐成 HTTP 408**（改 postBuffer / --no-thin / HTTP2 都无效），大二进制要按目录拆成多个提交逐个推。
