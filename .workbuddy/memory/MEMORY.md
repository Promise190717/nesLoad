# nesLoad — 项目长期记忆

> 只留**动手前必须知道的硬约束**；各功能细节见 `.workbuddy/memory/DETAILS.md`，来龙去脉见 `.workbuddy/memory/2026-10-*.md`。
> ⚠️ **碰「操作入口/抽屉、顶部加载条、联机、手柄、街机 romset、彩蛋挂画、详情页动作区、评论星级、反馈收藏」之前，先读 `DETAILS.md`。**
> **动手前先 `git status`**（工作区常有未提交的活；另有进程并发改同一批文件）。
> ⚠️⚠️ **不要主动实测**（用户明确要求）：改完只做 typecheck + lint 基线，讲清楚交给用户看。

## 铁律 / 命名

- 站名**复古游戏屋**唯一来源 `lib/i18n.ts` 的 `SITE_NAME`，文案写 `{site}`。
- **别动**：`package.json` name、`nesload:*` 存储键、`nesload_locale`/`nesload_admin` cookie、`netplay.ts` 的 `APP_ID`。
- 基调：玩复古游戏 + 在线库 + 自己的 ROM 拖进来跑，别说成「卡带加载器」。
- **全站唯一键盘操作是 `Esc`**。
- 法务文案（`lib/legal.ts`，中英各一份，改一节两份都动）**书面、短、不口语化**，**别用破折号 / 括号做补充说明**。
- 注释写「为什么这么做」**包括否掉的方案**；临时探针验完必须删。

## 机种 / 核心

- `ConsoleType` = `nes|snes|gb|gbc|gba|md|gg|sms|32x|ws|ngp|arcade`（`lib/emulator.ts`）。
- ⭐ **机种清单唯一出口 = `lib/consoles.ts`**（`CONSOLE_TYPES`/`CONSOLE_LABEL` ≤3 字/`CONSOLE_TINT`/`isConsoleType`），`CartridgeSprite.tsx` 只 re-export。**别再各处手抄数组**（放 lib 而非组件：服务端组件不能 import `lib/emulator.ts`，它顶层跑 `installAudioTap()`）。
- `CORE_MAP`：nes→`fceumm`、snes→`snes9x`（**只这两台走 jsdelivr CDN**）；gba/gb/gbc→`mgba`、md/gg/sms→`genesis_plus_gx`、32x→`picodrive`、ws→`mednafen_wswan`、ngp→`mednafen_ngp`、arcade→`fbneo`（兜底）/`fbalpha2012_cps1`（`lib/arcade-core.ts` 按 romset 挑）。**其余 10 台全走本站 `public/cores/`**（jsdelivr 国内不可靠），判据 = `LOCAL_CORE_CONSOLES`。
- 本地核心名严格 `<core>_libretro.js`/`.wasm`，取自 `arianrhodsandlot/retroarch-emscripten-build@v1.22.2`（共 90 核；**NDS/N64/Saturn/Jaguar 核不存在**）。
- **加机种要动**（README 有同名表）：`ConsoleType`/`CORE_MAP`/`EXTENSION_MAP`（**刻意不含 `.bin`**）/`detectConsole`（9 步顺序，**SNES 刻意压最后**）；`lib/consoles.ts` 四件套；`countGamesByConsole` 初始化对象；`lib/unwrap.ts` 内层扩展名表；`HandheldConsole.tsx` 的 `FACE_ROWS`；`lib/server/upstream.ts` 的 `toConsoleType()`（`hasToken()` 词界；gba 先于 game boy、32x 先于 genesis、neo geo pocket 先于 neo geo；躲 `nes`/`genesis` 子串坑）；`public/cores/` 放文件；`db/schema.sql` + `scripts/add-consoles.mjs`；机种列举文案（对齐 `home.hero.lead`/`home.faq.a6`/`netplay.open`）。
- ⚠️ **4 处硬编码机种数组已消灭**（`app/api/games/route.ts`、`app/api/admin/games/route.ts`、`app/api/admin/games/[id]/route.ts`、`AdminGames.tsx` 的 `CONSOLE_OPTIONS`），现都 `import { CONSOLE_TYPES }`。
- `SCREEN_WIDTH/HEIGHT = 720×540` 只是**启动基准**；显示尺寸全在 globals.css，核心靠 ResizeObserver 跟。别读 `canvas.width` 算 launch size。
- ⚠️ CD 机种（PS1 / Sega CD / PCE CD）**当前架构不通**：`lib/bios.ts` 只存一份 BIOS（id 写死 `neogeo`），多文件光盘镜像也不合单文件加载流。
- `/consoles` 专题页：⚠️ **表主键就是 `console_type`**，它是**资料的扩展不是清单**。表里某行被删 ⇒ 前台退回 `CONSOLE_LABEL` 默认渲染，**专题页永不 404** ⇒ 后台**没有「名下有游戏不许删」拦截**（DELETE = 重置资料）。⚠️ **首页「按机种浏览」= 按游戏数取前 8（不过滤空机种）**；`/consoles` 列表页与 `/games` 筛选条才是全量。`/consoles/[type]` = 资料 + 名下游戏（30 分钟）。资料 `listConsolesCached`（12h，键 `consoles:list` + `v2`）／单条 `getConsole` **不缓存**；双语回退 `localizeConsole`。`lib/server/consoles.ts` **不许 import `./games.ts`**。后台 `/api/admin/consoles`（GET 合并固定项+资料行，**没有 POST**）+ `/[id]` PATCH(upsert)/DELETE。
- 预填脚本：`scripts/add-consoles.mjs`（建表+占位，幂等）+ `scripts/seed-consoles.mjs`（一次性快照，**会覆盖后台人工编辑，跑过别再跑**）。sitemap 只列**有资料行**的机种。

## 两台机器 / 尺寸链

- 桌面 = 像素房间 + `RetroTv`；移动端 = 竖掌机 `HandheldConsole`；**必须二选一**（各一个 canvas）。
- 移动端判据是**设备**：`<html data-mobile>` 由 BOOT_INIT 写，逻辑在 `lib/device.ts`（**内联脚本手抄一份，改一处必须同步另一处**）。
- 尺寸链唯一出口 = globals.css `--tv-*`：**档位只写上限**（`--tv-screen-max` 720/840/960、`--tv-base-max` 450/520/600），实际值 = `min(上限, 100vw − 360px)`；`--desk-w` = 机身 + 左右各 140，**不能收窄**；`--tv-base-w` 按 5/8 从屏幕推。**≥1068px 时三档值一个没变**。
- ⚠️ 「请用桌面端」提示（`.pc-notice`）已全删 —— 别加回来。⚠️ 屏幕尺寸**必须写死在 `.screen` 的 class**（不能删/改内联/让 canvas 撑）。
- 掌机顶沿**只剩 PWR 灯且在左边**；⚠️ **灯在左 ⇔ 菜单钮在右**（一对一起改）。**音量整块删了**别再补。
- ⚠️⚠️ 掌机屏幕两侧「白边」是内圈身份证，**只能收细不能收没**（`.room` 左右 6、内圈内衬 4）。面键间距 `FACE_GAP = 14` 别调小（可见缝 = gap − 4）。

## 路由 / 缓存 / SEO

- 真路由：`/games`（15/页，`?page=N`+`?q=`+`?console=`，非规范 307）· `/games/[id]` · `/games/[id]/download` · `/consoles` · `/consoles/[type]` · `/privacy` · `/terms` · `/developers` · `/developers/[id]` · **`/play`**（2026-10-14 加的联机开局页，见下）；404 一页盖详情+下载。
- ⭐ **`/play` = `/room` 的另一个壳**（2026-10-14）：`components/PlayScene.tsx` + `app/[locale]/play/page.tsx`。**引擎侧只有一份**：两边共用 `EmulatorController` / `NetplayController` / `lib/http.ts`（`readBodyWithProgress`+`isAbortError`，从 ConsoleScene 抽出来的）/ `lib/bios.ts`，屏幕直接复用 `ConsoleScreen`（为它加了 `frameClassName` / `hideHint` / `onTap` 可选 prop）。功能面只有房间的子集（无存档/历史/云端/拖本地文件/彩蛋/抽屉）。
- `/play` 布局（2026-10-14 二稿）：**左一块屏幕 + 右一列**。右边顶上 = 这一款的封面+名字/机种/年份/开发商（照抄 `/consoles/<机种>` 的资料块），中间 = 平铺的「说明+控件」操作表（暂停/重载/弹出/音量/显示/全屏，`ul.divide-y`），底下单一颗「编辑」开 `KeyBindingsPanel`。**开局要做的选择（单人/创建/加入 + 链路 + 画质）摆在屏幕里那层叠层上**，进房换房间码/分享/状态/离开，载入中换进度条+取消。
- ⚠️⚠️ **`/play` 视觉必须和网站整体一致**（用户在 2026-10-14 明确纠正过一次）：描边就用 `pixel-edge pxw-* pxc-*`，屏幕里那层用 `crt-*`（底永远黑）。「不要 room 的样式」指的是**别搬房间的布景/电视机/抽屉/键帽**，不是另搞一套 1px 细边 —— 我第一版那么写被退了。
- `/play` 外壳 = `GamesShell`（`showHeader={false}` + `fill`，**这两个 prop 只有它用**）。`showHeader=false` 时 h1 由 PlayScene 出 sr-only 的那颗；`fill` 让内容 `flex-1` 吃满，页脚压到视口最底。屏宽上限 `min(100%, calc((100vh - 320px) * 4/3))`，⚠️ **别给 `.screen` 挂 max-h**（和 aspect-ratio 打架，canvas 被压扁）。
- ⚠️ **`?id=` 语义两页不同**：`/room?id=` 自动下载开玩；**`/play?id=` 不自动载入**（用户要求「先进房间设置，点开始才加载」）。入口 = 详情页动作区那颗「联机游戏」（`gamesPage.playOnline`）+ **首页 Hero 的房间号表单**（`<form action=/play method=get name=room>`，零 JS，2026-10-14 加；⚠️ `name="room"`/`maxLength=4` 是写死的，`ROOM_QUERY_PARAM`/`CODE_LENGTH` 在 `'use client'` 的 netplay.ts 里取不到）。sitemap 给 0.6。
- ⚠️ `ConsoleScreen` 2026-10-14 多了三个**可选** prop（默认值 = 原行为，room/掌机不受影响）：`frameClassName`（尺寸类，play 页传 `aspect-[4/3] w-full`）、`hideHint`（不画待机提示）、`onTap` 改为可选。
- ⚠️ **缓存唯一出口 = `lib/server/cache.ts` 的 `cached()`**：开发模式（`NODE_ENV !== 'production'`）**直接透传查库**，只有线上才吃 `unstable_cache`。要「同请求内只查一次」用 React 的 `cache()` 自己包，不是一回事。
- ⚠️⚠️ **缓存条目不随部署失效**（落在 `.next/cache`）。改数据 / 改查询形态 **必须把键尾版本号 +1**；返回 `Record<ConsoleType, X>` 的地方**必须运行时补键**（老条目少键 ⇒ 页面印 `undefined`）。
- 首页三区块 = **12 小时**（`HOME_REVALIDATE_SECONDS`），和 `/games` 的 30 分钟**分开两份**：`listLatestGamesCached`（键 `games:latest`，别拿 `listGamesPageCached` 顶替）/ `countGamesByConsoleCached` / `listTopDevelopersCached`（`developers.ts` 有等值手抄）。
- 首页**不该有** `export const revalidate`（根布局读 cookie/请求头 ⇒ 全站动态，加了是死代码）。缓存一律留在「页-侧」，**不下沉进数据层**（后台 / 房间弹窗要即时）。
- 搜索：`?q=…&page=N`；翻页必带关键词（`gamesHref`）；搜索页 `noindex, follow`；关键词上限 64 码点。首屏 SSR 已定型，**别加 loading/Suspense**；`GamesShell` 的 `label` 必须全 ASCII（font-pixel 无 CJK）。
- 详情页正文只有一段（第二段已删别补）；下载页只有「开始下载」一颗钮（兜底直链已删别加回）。
- ⚠️ 左上「返回」：**只有开发商列表页 + 两个 404 页**是普通 `<Link>`；**游戏列表/详情/下载/开发商详情四页全是浏览器回退**（`BackLink`，`mode:'history'`，文案 `common.back`）。兜底依次：列表→`/play`、详情→`/games`、下载→`/games/<id>`。
- 单条数据走 `getGame(id)`，只有首页深链走 HTTP；sitemap 从 `listGameStubs()` 现读。深链开窗判据是 `deepLinkOpen`；`setDeepLinkOpen(true)` 必须包 `Promise.resolve().then()`。
- 列表唯一入口 `listGamesPage(offset, limit, {keyword, consoleType, developerId})`，排序 `created_at DESC, id DESC`；搜索只匹配 title/developer/series（**刻意不含 language/description**），关键词是第 1 个绑定参数。
- `GameLibraryPanel` 的 tab/筛选/页码/滚动在模块级单例 `libraryMemory`；`settledKey === queryKey` 守卫别改成 useRef；卡片错峰唯一出口 `lib/card-stagger.ts`。

## 进行中（未提交，2026-10-14）

- 上游批量导入：`app/api/admin/scrape-list`、`app/api/admin/fetch-rom`、`components/AdminBulkImport.tsx`、`lib/server/upstream.ts`、`lib/server/url-guard.ts`、`lib/rom-lang.ts`；`AdminGames.tsx`、`lib/i18n.ts`、`lib/zip.ts` 随之在改。
- 机种扩容（本日完成）：12 台 + `public/cores/` 新增 4 核 8 文件（genesis_plus_gx / picodrive / mednafen_wswan / mednafen_ngp；目录现 14 文件 56 MB）；D1 `consoles` 表 12 行资料齐全（image_url + 双语简介，已核）。

## 部署 / 校验

- 线上配服务端变量 `SITE_URL`；不做 `output: 'export'`。
- ⚠️ 别拿生产数据做删除类测试（D1/R2 是真库）；R2 无版本控制，删 ROM 永久丢。
- ⚠️ `public/cores/` 是新核心的**唯一来源** ⇒ 部署必须一起上传，否则 `/cores/*.js|.wasm` 404。`next.config.js` 已给 `/cores/:path*` 配长缓存。
- 改完跑 `pnpm typecheck`（⚠️ `incremental: true` 会**假报** `lib/i18n.ts` 缺 key；全量 `npx tsc --noEmit --incremental false` 才真）。lint 基线以前一天实测值为准，**报数时说清「我改的文件 0 条」**。`pnpm build` 本机跑不了（沙箱拦 `.next` 清理），交给用户。
