# nesLoad — 项目长期记忆

> 只留**动手前必须知道的硬约束**；细节见 `DETAILS.md`，来龙去脉见 `2026-10-*.md` 日志。
> 动手前先 `git status`；**不主动实测**：改完只做 typecheck + lint，讲清交给用户看。
> 碰「抽屉/入口、加载条、联机/手柄/街机、NDS-EJS 核、彩蛋、详情页动作区、评论/收藏、多语言侧表、`/play` 外壳与右栏」前**先读 `DETAILS.md`**。

## 铁律

- 站名唯一来源 `lib/i18n.ts` `SITE_NAME`，文案写 `{site}`；**全站唯一键盘操作是 `Esc`**。
- 别动：`package.json` name、`nesload:*` 存储键、`nesload_locale`/`nesload_admin` cookie、`netplay.ts` `APP_ID`。
- 🔴 **UI 别自作主张大改**（2026-10-22 教训）：用户说「太丑/重构」→ 先把方案讲成几句话（或只改一处最刺眼的），**等他点头再铺开**。当天 `/play` 右栏整体重做被「丑爆了 你撤回」全撤。视觉口味只有他能定。
- 法务文案 `lib/legal.ts` 中英各一份；书面短句、不用破折号/括号补充。注释写「为什么」含否掉的方案；临时探针验完必删。

## 语言（界面与内容都是 18 种）

- 界面 18（`LOCALES` 顺序照上游 hreflang；`LOCALE_OPTIONS` English 第一）＝内容 18（`lib/game-text.ts` `CONTENT_LOCALES`）。后台表单只编 4 种（`ADMIN_FORM_LOCALES`=zh/en/ja/ko），其余 14 种靠脚本回填。
- 加界面语言：`LOCALES`/`Locale`、新 `lib/i18n.<code>.ts`（558 键逐键对齐）、`LOCALE_OPTIONS`/`LOCALE_PREFIX`/`SITE_NAME`/`HTML_LANG`/`OG_LOCALE`/`DATE_LOCALE`/`resolveLocale`、legal 两份、`CONTENT_LOCALES`+回填脚本。
- 前台短标签一律 `consoleLabel(type, locale)`；URL/枚举永远 `nes`。

## 机种 / 核心

- `ConsoleType` 14 台；清单唯一出口 `lib/consoles.ts`（别手抄）；服务端组件不能 import `lib/emulator.ts`。14 台全走 `public/cores/`（部署一起传，否则 404）；arcade 按 romset 挑 `fbneo`/`fbalpha2012_cps1`（`EXTRA_DRIVERS` 只盖 CPS1）；NDS melonds 是 EJS 核（详见 DETAILS）。
- CD 机种（PS1/Sega CD/PCE CD）架构未通；`SCREEN_WIDTH/HEIGHT=720×540` 只是启动基准，显示尺寸在 globals.css。
- 包内层不在 `lib/unwrap.ts` 白名单 ⇒ 包不拆 ⇒ 判街机错；世嘉裸 `.bin` 按文件头兜；指纹在 unwrap.ts/emulator.ts **手抄两份，改一处必须同步**。
- 机种优先级：`unwrapped.console` → `loadRom` 第 6 参 hint → `detectConsole`；**别在 /play 路上为嗅探把 7z 字节包成 File**（整盘一次复制）。
- `UnwrappedEntry.file`/`bytes` 二选一：7z 只给 `Uint8Array`（canOwn 零拷贝）；需要 File 的地方不许先包一层；大文件分流看 `entry.size`。
- 7z 走 wasm（`public/compression/`）：主线程 `postMessage(Blob)`；读回直接 transfer、下游按 `.length` 用（别 slice/别拿 buffer 当整体）。
- 🔴 退出先 `dropContentFiles()` 再 `exit()`（MEMFS 的 ROM 不回收，+129MB/轮）；载入途中离开靠 `launching`/`exitRequested` 落地后补 exit。

## 数据库 = Supabase（2026-10-20 起）

- 读库唯一出口 `lib/server/pg.ts` `query()`，**走 HTTPS**（PostgREST→`public.exec_sql`，定义在 `db/schema.pg.sql` 末尾）。游戏主键 = 上游 slug。
- 🔴 **绝不在 Worker 直连 Postgres**（node:tls 断连，线上 500 事故）；只有 `scripts/*.mjs` 可直连（`SUPABASE_DB_URL`）。`SUPABASE_URL`+`SUPABASE_SECRET_KEY` 缺一全站 500。
- 文案侧表四张（game/developer/series/console_texts），主键 (slug, locale)；developer/series 名**不在 game_texts**，按 locale JOIN 现取（`sb-games.ts`）。
- 🔴 前台读文案一律按语言裁：`textLocalesFor(locale)`（自身+回退链 ≤3 种），列表再加 `content:false` / `roms:false`；**不传 locale 就是全 18 种**（列表一页 245KB、首页 197KB，免费版 10ms 必爆）。新增读路径先想清楚要哪几种，缓存键尾已因此全 +1。
- 动过文案/图片数据必须升缓存键尾号（见 DETAILS 版本表）。
- R2 公网域缓存 30 天：**换图传新键（-v2）再改库，不覆盖同名**。

## 主题 / 首屏 / 两台机器

- `<html data-theme>` 写入者只有 SiteDocument 的 `BOOT_INIT` 与 `saveTheme()`；导航丢属性由 BootAttributes 只补缺、不落盘。
- 🔴 深色灰阶 **2026-11-10 起是冷调蓝灰，不是中性灰**（用户「不要黑色 换个其他色值」）：`ink-950` **#181c26**、900 #1e222e、850 #242936、800 #2c3241、700 #3d4457、600 #4a5061、500 #6a7080；**400 及以上仍是中性灰**（文字不许发蓝）。只给底六档上色相，改时**整段平移**、各档间距 6/6/8/16/14 不能变（单独提 950 会让页面底和面板底贴合）；`--color-floor`(#2c3241) / `--wall-top`(#242936) / `--wall-bottom`(#1a1e28) 是手抄值必须同步。`--color-crt-*` 与 `.screen` 永远是黑，不跟着翻。
- 桌面 RetroTv / 移动 HandheldConsole 判据 `<html data-mobile>`（device.ts + 内联脚本两份同步）；尺寸唯一出口 globals.css `--tv-*`（档位只写上限）；掌机白边只能收细；PWR 灯左 ⇔ 菜单钮右（一起改）。

## 路由 / 缓存 / SEO

- 目录页维度全是路径段（分页 `/page/N`、机种、语种，按 console→page / lang→page 嵌套；搜索是动态路由 `?q=`）；链接一律 `next/link`。地址构造唯一出口 `gamesHref`/`consoleHref`/`pageHref`；**别加新查询参数**（middleware 只兜旧外链）。
- 🔴 **无前缀地址永远是英文**（2026-11-10 起）：`/` `/games` 对谁都是英文，**不再按 `nesload_locale` cookie 307 到 `/zh`**。根因：第 0 层 Workers Caching 按 URL 存、`Vary` 只有 `RSC`（不含 Cookie），无前缀响应一旦依赖 cookie 就是「热门页吃缓存英语、长尾页 307 中文」。无前缀 `no-store` 会 1102，`Vary: Cookie` CF 不支持，所以只能选「地址即语言」。cookie 现在只让 `LocalePrompt` 别重复问，别再把它加回 middleware。
- 缓存唯一出口 `lib/server/cache.ts` `cached()`；改数据/查询形态键尾版本 +1；缓存留页侧不下沉。
- 🔴 **三层缓存**（2026-11-03 起）：⓪ **Workers Caching**（`wrangler.jsonc` 的 `cache.enabled`，在 Worker **外面**，命中不启动 isolate，是免费版 10ms 下唯一真能压住 1102 的一层）→ ① R2 增量缓存（`cached()` 7 天 + 页面级 ISR）→ ② `worker.ts` 的 Cache API（24h，兜底）。第 0 层只认响应头：整页 HTML 走 `withCdnHeaders`（`s-maxage` + **`Vary: RSC`**），其余 `noStore`；`Vary` **不能**像 Cache API 那份删干净（HTML 与 flight 同 URL 靠 `RSC` 头区分）。发版后它自动清空，跑 `pnpm warm:edge` 回填。
- 🔴 **ROM 取字节的五条硬约束（2026-11-10 补第五条）**：① **区间走查询串 `?span=start-end`**（`lib/http.ts` `romSpanUrl` 同时发 `Range` 头，路由 `parseSpanParam` 以 span 优先）—— 第 0 层 Workers Caching 未命中时会摘 `Range`，查询串它改不到；② **分片可缓存、整包不可**：span 分片回 **200** + `X-Rom-Span`/`X-Rom-Total`（CF 默认不缓存 206）+ 准确 `Content-Length`（缺长度就不缓存，2026-11-06 截断副本事故的根因）+ `?v=` 版本号（探针给 `X-Rom-Version`，`romCacheVersion` = 文件名+来源+总大小哈希，防换盘后新旧混片）；整包下载、探针 `span=0-0`、所有错误分支一律 `private, no-store`；③ `worker.ts` 的 ROM 分支**原样放行**，别再套 `noStore`（会盖掉路由的 `s-maxage`）；④ **命中仍算一次请求**（官方口径：不记 CPU、按标准请求率计），压请求数只能靠分片大小 —— `ROM_CHUNK_BYTES` 已 4→8 MiB。自持 R2 的 `serveFromBinding` 是提前 return，缓存头/版本头要在那里**另写一份**。`lib/http.ts` 探针另拒收「200 且无 `Content-Length`」；⑤ **第 2 次重试必须换缓存键**：`fetchSpan`/`fetchWholeRange` 走 `romRetryUrl` 加 `&nc=<attempt>`，坏分片才绕得开 7 天坏键（2026-11-10）；别删，也别改成「整单重来」（键没变，无用）。
- 🔴 **`/api/games/[id]` 必须读数据层缓存**（2026-11-07）：走 `getGameFullCached`（全 18 语言版，R2 7 天 + `games` tag），**别改回 `getGame()` 实时查库**。那条路要 4~6 次 Supabase 往返（2~5 秒），免费版 10ms CPU 下冷 isolate 被打穿 → CF 直接回 **503 空体**（1102 关联错误），表现为「某个 colo 一直 503、换节点就好」。`force-dynamic` 保留（响应仍每次生成，只是数据来自缓存）。边缘：`TTL_API` 1 小时 + `TTL_API_BROWSER` 60 秒 + `TTL_API_SWR` 1 天；页面 HTML 仍 `max-age=0`，别混。
- 🔴 2026-10-22 数据层 ISR 全撤：`cached()` 统一 7 天；但**页面级 ISR 还在**（2026-11-02 核实：详情 `/games/[id]`、首页、列表页都是 `export const revalidate = 604800` 的整页 app 缓存，桶里 100KB+ 对象就是它们）。只剩 search / account / catalog 搜索是 `force-dynamic`（`/play` 与四个文档页 2026-11-03 起已改回按需 ISR）。robots/sitemap/llms.txt/ai.txt 路由缓存 86400 保留。后台改数据靠 `revalidateTag('games',{expire:0})`；机种/开发商缓存没挂 tag，改完硬等 7 天。
- 🔴 **下载页 HTML 与 id 无关**（2026-11-04）：正文在 `components/GameDownloadPanel.tsx` 客户端从 `/api/games/<id>` 取，`worker.ts` 把整族 URL 的边缘缓存键折叠成 `/<locale>/__nesload_download`（只折 HTML，flight 不折）⇒ 3.8 万条下载地址共用 18 份副本，这是把这一族从「永远冷 = 每次 1102」里救出来的唯一办法。**别把 id / 逐页 title / canonical 加回服务端渲染**；详情页那颗下载钮**必须是裸 `<a>`**（`<Link>` 走 flight，吃不到折叠）。代价：该页 `noindex, follow`、无逐页 OG。
- 🔴 **列表型 `<Link>` 一律 `prefetch={false}`**：卡片网格 / 机种卡 / 开发商卡一页几十个，开着预取等于每来一个人就额外渲染几十次详情页 RSC（2026-10-23 错误率 54% 的主因）。只有顶栏 / 返回 / 翻页这类每页一两个的链接保留预取。
- 🔴 **首屏可见的「动作型」`<Link>` 也要 `prefetch={false}`**（详情页三颗主钮 play/联机/下载 + 开发商链接，2026-10-23 补）。全站**没有 `loading.tsx`**，所以 Next 的预取没有边界可停、只能整页渲染 ⇒ 一次详情页访问会拖出 4 个额外整页渲染。判断口径：这是「动作」还是「浏览路径的下一步」；动作一次访问最多点一个，预取却是 100% 触发。页脚（`footer`，首屏视口外）不用管，IntersectionObserver 不触发。
- 「我是谁」唯一出口 `lib/current-user.ts` `fetchCurrentUser()`；`/login`、`/account` Link `prefetch={false}`。
- 长文档页（`/privacy` `/terms` `/about` `/contact`）共用壳 `components/DocPage.tsx`（原 LegalPage，2026-11-03 改名）；文案在 `lib/legal.ts` / `lib/site-doc.ts`（四语言 + 其余回退英文，短文导航词别往 18 张表里加）；页脚免责声明唯一出处 `lib/site-doc.ts` `disclaimer()`，三处页脚都挂。
- `/play` 唯一开局页（PlayScene + GamesShell）；`?id=` 自动载入、`?room=` 加入者、`?lang=` 选 ROM 版本。`/embed/games/<id>` 是详情页「嵌入此游戏」给的纯播放页（`PlayScene` 的 `embed` 模式：无右栏 + `data-embed` 单列 + 屏幕下一条 `.play-embed-bar` 放键位表和回站链接），`noindex` 且 robots 挡 `/embed`。
- 🔴 触屏手柄**两条判据**：`:root[data-mobile='on']`（全站设备判据，`/play` 只认这条）＋ `.play-workspace[data-pad='on']`（**只有嵌入页写**：`pointer: coarse || 视口≤1023px`，因为 iframe 里「设备」是宿主页面）。那组 `.play-touch*` 尺寸规则（`--pad-btn`/`--pad-font`）两个选择器必须一起改，组件里没有兜底值。嵌入页的底是写死的黑，说明条只能用 `--color-crt-*`，别用 ink / `.play-kbd`（会随主题反相）。
- 存档 = 电池 `.srm` 一款一份（快照别加回）；读档 = 带存档重插卡（applySave）。
- 🔴 房间页永久下线（代码在 `app/[locale]/_room`），别加入口、别写 sitemap；**看/评整体页面风格、盘点页面时也别读它、别算进去**（2026-11-05 用户：「不要看 room 页面」）。
- 🔴 功能开关唯一出口 `lib/features.ts`。`ROM_DOWNLOAD_ENABLED`（2026-11-04 起 `false`，AdSense 送审）关掉时：详情页下载钮不画（`downloadHref` 传 `null`）、`/games/[id]/download` 直接 `notFound()`、首页 FAQ q4 收起。**`/api/games/[id]/rom` 不归它管**（关掉等于关站）。编译期常量，改完必须重新构建部署。

## 部署 / 校验

- `/_next/static/*` 绝不 immutable（next.config.js 已 max-age=0）；`public/sw.js` 对 static 必须 network-first（`VERSION` 改策略要 +1）；发版后 purge CF。
- 🔴 `open-next.cache.ts` 的 `name` 必须**逐字**等于 `cf-r2-incremental-cache`（2026-11-03 已去掉 `+gzip` 后缀）：`populateCache` 拿它和常量做字符串相等比较，不等就静默跳过 ⇒ 构建期成品只躺在本地 `.open-next/cache`，每个新 buildId 全站从冷开始。别再加后缀。
- 大 ROM 唯一下载路 `lib/http.ts` `fetchRomWithProgress`；R2 无版本控制，删 ROM 永久丢。
- ROM 自持 = 除 gba/nds/ps1 外全部（R2 ~4.2 GiB）；键 `roms/<机种>/<slug>-<lang><ext>`，脚本 `migrate-roms-to-r2.mjs`（判据分层，`.md` 是真卡带不拒）；上游两 host 不可互换。
- 展示地址一律 `publicUrlOrNull()`；严格版 `publicUrl()` 只给上传/ROM 代理/存档下载。
- 缓存桶脚本：`next-cache-purge.mjs`=常规（只删旧 buildId）；`r2-purge.mjs`=整桶清空；**都不收 --bucket/--prefix**。
- `pnpm dev` 别在沙箱起；typecheck `npx tsc --noEmit --incremental false` 才真；`pnpm build` 交给用户。
