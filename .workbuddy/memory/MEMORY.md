# nesLoad — 项目长期记忆

> 只留**动手前必须知道的硬约束**。细节见 `.workbuddy/memory/DETAILS.md`，来龙去脉见 `2026-10-*.md`。
> ⚠️ 碰「抽屉/入口、加载条、联机/手柄/街机 romset、NDS-EJS 核、彩蛋、详情页动作区、评论/收藏、实体多语言侧表与 `group_key`、后台表单、`/consoles/[type]?lang=`」之前**先读 `DETAILS.md`**。
> ⚠️ 动手前先 `git status`；⚠️ **不要主动实测**：改完只做 typecheck + lint 基线，讲清交给用户看。

## 铁律 / 命名

- 站名唯一来源 `lib/i18n.ts` 的 `SITE_NAME`，文案写 `{site}`。**全站唯一键盘操作是 `Esc`**。
- 别动：`package.json` name、`nesload:*` 存储键、`nesload_locale`/`nesload_admin` cookie、`netplay.ts` 的 `APP_ID`。
- 基调：玩复古游戏 + 在线库 + 自己的 ROM 拖进来跑，别说成「卡带加载器」。
- 法务文案（`lib/legal.ts` 中英各一份，改一节两份都动）书面、短、不口语化，别用破折号/括号补充。
- 注释写「为什么」**包括否掉的方案**；临时探针验完必须删。

## 机种 / 核心

- `ConsoleType` **14 台** = nes|snes|gb|gbc|gba|nds|md|gg|sms|32x|ws|ngp|**ps1**|arcade（`lib/emulator.ts`）。
- ⭐ 机种清单唯一出口 = `lib/consoles.ts`（`CONSOLE_TYPES`/`CONSOLE_LABEL` ≤3 字/`CONSOLE_TINT`/`isConsoleType`），`CartridgeSprite.tsx` 只 re-export。**别再手抄数组**；放 lib 不放组件：服务端组件不能 import `lib/emulator.ts`（顶层跑 `installAudioTap()`）。
- ⭐ 前台短标签一律 `consoleLabel(type, locale)`（`CONSOLE_LABEL` 只是英文档）：中日韩 `nes` 显示 `FC`、英文 `NES`。标签位 ≤3 字符 + 纯 ASCII（font-pixel 无 CJK）⇒ 韩文也是 FC，패미컴 只在文案句里。后台 Admin 与 admin API 仍读 `CONSOLE_LABEL`。URL/枚举仍是 `nes`，永远不改。
- `CORE_MAP`：**14 台全走本站 `public/cores/`**（2026-10-19 起 NES/SFC 也从 jsdelivr 搬来，无 CDN 分支、`LOCAL_CORE_CONSOLES` 已删）；arcade 按 romset 在 `fbneo`/`fbalpha2012_cps1` 里挑（`lib/arcade-core.ts`）；核名严格 `<core>_libretro.js|.wasm`，`fbneo` 只存 `.wasm.gz`（`GZIP_CORES`，启动解压）。
- ⚠️⚠️ **NDS 的 melonds 是 EJS 核**，控制面 + 输入面都和其余核不是一套 —— 见 `DETAILS.md`。再引 EJS 核照那三条走，别只在 `CORE_MAP` 加名字。
- 加机种：照 `lib/consoles.ts` 头部九处 + 两件数据逐项过（`EXTENSION_MAP` 不含 `.bin`；`detectConsole` 文件头优先、**SNES 压最后**；`toConsoleType()` 有词界/顺序坑）。
- `SCREEN_WIDTH/HEIGHT = 720×540` 只是**启动基准**（NDS 例外 256×384），显示尺寸全在 globals.css，别读 `canvas.width`。
- ⚠️ CD 机种（PS1/Sega CD/PCE CD）架构未通：`lib/bios.ts` 只存一份 BIOS（id 写死 `neogeo`），多文件光盘镜像不合单文件加载流。

### `/consoles` 专题页与机种资料

- ⚠️ 表主键 = `console_type`，是**资料的扩展不是清单** ⇒ 行删了前台退回 `CONSOLE_LABEL`，**专题页永不 404**，DELETE = 重置资料。
- ⚠️ 首页「按机种浏览」只取游戏数前 8（全量在 `/consoles` 与 `/games` 筛选条）；单条 `getConsole` 不缓存、列表走 `listConsolesCached`；`lib/server/consoles.ts` **不许 import `./games.ts`**。脚本与补图规矩见 `DETAILS.md`。
- ⚠️ 动资料就升缓存键版本尾：`consoles:list` **v7**、`developers:list`/`developers:top` v4。

## 实体多语言侧表（⚠️ 动手前先读 `DETAILS.md`）

- 三张侧表 `game_texts`/`console_texts`/`developer_texts`。
- ⚠️⚠️ **`game_texts` 挂 `group_key` 不挂 `game_id`**：一行 `games` = 一盘 ROM，同款四版四行、文案只有一份。键由 `lib/server/games.ts` 的 `resolveGroupKey()` 独家决定，**接口层/后台都不传**；判重与归组刻意同一套维度、只差 `language`，改一处必须改两处。
- 读取一律 `JOIN games g ON t.group_key = COALESCE(g.group_key, g.id)`；`deleteGame` 清文案**必须晚一步**。动过就升 `games:count|list|latest|by-developer|by-console`（现全 **v2**）。
- ⚠️ 后台接口把 `texts` 摊成四语言扁平字段（唯一出处 `lib/entity-text.ts` 的 `flatEntityTexts()`；`/api/admin/games` 例外、回 `texts`）；前台走 `localizeGame`/`localizeConsole`/`localizeDeveloper`。表单与迁移脚本细节见 `DETAILS.md`。

## 主题 / 首屏属性

- 真身在 `<html data-theme>`（`:root` 默认 dark，light 靠 `:root[data-theme='light']`）。写入者**两个**：`SiteDocument.tsx` 的 `BOOT_INIT`（**只在整页加载时跑**，软导航不跑）与 `lib/theme.ts` 的 `saveTheme()`。
- ⚠️ 2026-10-19 起 `BOOT_INIT` 在「没存过值」时把现算结果**落盘**到 `nesload:theme`（否则没点过钮的人整页加载会重按系统算，表现为「切路由突然变黑」）。**别改成跟随系统实时变化** —— 软导航没有重算时机。
- ⚠️ `BOOT_INIT` **禁止外面包大 try**：旧 catch 硬编码 `data-theme='dark'`，一步抛错把已存 light 一起丢。读写走局部 `read()/write()`。
- 主题钮三处：房间右沿（ConsoleScene，带 `.row-label`）、`/play` 右栏「显示」行、内容页 `TopBar` 最右那颗（`GamesShell` 的 `showTheme` 透传，**只有 `StaticPlay` 传 false**）。图标由 CSS 按 `data-theme` 挑，React 只管 title/aria。
- `data-tv` 的 `/play` 判据是 `/\/play(?:\/|$)/`（**别写死语种**，旧版漏了 ja/ko）。

## 两台机器 / 尺寸链

- 桌面 = 像素房间 + `RetroTv`；移动端 = 竖掌机 `HandheldConsole`；必须二选一。判据是**设备**：`<html data-mobile>` 由 BOOT_INIT 写，逻辑在 `lib/device.ts`（内联脚本手抄一份，改一处必须同步另一处）。
- 尺寸链唯一出口 = globals.css `--tv-*`：档位只写上限（`--tv-screen-max` 720/840/960、`--tv-base-max` 450/520/600），实际值 = `min(上限, 100vw − 360px)`；`--desk-w` = 机身 + 左右各 140，不能收窄；`--tv-base-w` 按 5/8 从屏幕推。**≥1068px 三档值一个没变**。
- ⚠️ `.pc-notice` 已全删别加回；屏幕尺寸必须写死在 `.screen` 的 class。
- 掌机顶沿只剩 PWR 灯且在左边；⚠️ 灯在左 ⇔ 菜单钮在右（一起改）。音量整块删了别再补。
- ⚠️⚠️ 掌机屏幕两侧白边是内圈身份证，只能收细不能收没（`.room` 左右 6、内衬 4）。`FACE_GAP = 14` 别调小。

## 路由 / 缓存 / SEO

- 真路由：`/games`（15/页，`?page`+`?q`+`?console`，非规范 307）· `/games/[id]` · `/games/[id]/download` · `/consoles` · `/consoles/[type]`（另带 `?lang=`）· `/privacy` · `/terms` · `/developers` · `/developers/[id]` · `/play`；404 一页盖详情+下载。
- ⚠️ `?lang=<zh|en|ja|ko|all>` 只挂 `/consoles/[type]`：不写 = 全部；空值/认不出/重复参数 307 回裸地址；标签挂该语种条数（`countConsoleGamesByLanguageCached`）；数据层多一维 `GamePageQuery.language`（`buildGamesWhere` 排最后）。带 `?lang=` 的 noindex, follow，canonical/hreflang 指裸地址。
- ⭐ **`/play` = `/room` 的另一个壳**（`PlayScene.tsx` + `app/[locale]/play/page.tsx`）：引擎侧只有一份（`EmulatorController`/`NetplayController`/`lib/http.ts`/`lib/bios.ts` + `ConsoleScreen`），功能是房间子集（无彩蛋/抽屉/拖本地文件；存档与云端历史都有）；外壳 = `GamesShell`（`showHeader={false}` + `fill`，只有它用）。
  - ⚠️⚠️ 视觉必须和网站一致：描边 `pixel-edge pxw-* pxc-*`、屏里那层 `crt-*`（底永远黑）。「不要 room 的样式」= 别搬布景/电视机/抽屉/键帽。别给 `.screen` 挂 max-h。
  - ✅ 云端历史：`load()` 成功且 `!file && game?.id` 时 `POST /api/user/history`（2026-10-19 补）。
  - ✅ **`?id=` 会自动载入开玩**（`StaticPlay` 传 `autoStart={Boolean(id) && !room && !host}` ⇒ `directSolo` ⇒ 自动 `start()`）。⚠️ `PlayScene` 头部注释仍写「不会自动载入」，那是旧行为、**以代码为准**。
  - ⚠️ 联机时右侧按键表一律锁 1P（`keysLocked = soloOnly || mode !== 'solo'` 一起管「不画 P1/P2 切换」+「取值锁 `bindings.p1`」；`KeyBindingsPanel` 可选 `online`）。判据用派生的 `mode`，**不是 `netplayState.role`**。
  - ⭐ 这一款的资料条（封面 + 名字 + 机种/年份/开发商）**在顶栏水平居中**（`StaticPlay` 的 `PlayGameInfo` → `GamesShell` 的 `navExtra`）；右栏从按键设置开始。数据在 `StaticPlay` 这一层取（`useEffect` 已从 `PlaySession` 挪上去），别再在 `PlaySession` 里取第二遍。
- ⚠️ 缓存：唯一出口 `lib/server/cache.ts` 的 `cached()`（开发模式透传查库，线上才 `unstable_cache`）。**条目不随部署失效** ⇒ 改数据/查询形态必须键尾版本 +1；返回 `Record<ConsoleType, X>` 必须运行时补键。首页三区块 12 小时（`HOME_REVALIDATE_SECONDS`）与 `/games` 30 分钟分开；首页不该有 `export const revalidate`；缓存留在页侧、不下沉数据层。⚠️ `games:row-by-id` 现 **v2**（代理目标 `source_url` 优先、回退 `rom_url`）。
- `ConsoleScreen` 三个可选 prop（`frameClassName`/`hideHint`/`onTap`）默认值 = 原行为。
- ⚠️ **「我是谁」唯一出口 = `lib/current-user.ts` 的 `fetchCurrentUser()`**（5 分钟缓存 + 并发合并 + 失败不缓存，`AuthUser` 也在这）。登录成功 / 退出必须调 `rememberCurrentUser()` / `forgetCurrentUser()`（三处：`AuthForm`、`UserPanel`、`AccountCenter`）。**别再自己 fetch `/api/user/login|profile` 判登录态**。
- ⚠️ `/login`、`/account` 是读 cookie 的动态页 ⇒ 指向它们的 `<Link>` 一律 `prefetch={false}`（预取只拿回 ~400 字节空壳，且每次切页重发）。
- 搜索 `?q=&page=`（翻页必带关键词 `gamesHref`；搜索页 noindex, follow；关键词上限 64 码点）；首屏 SSR 已定型，别加 loading/Suspense；`GamesShell` 的 `label` 必须全 ASCII（font-pixel 无 CJK）。
- ⚠️⚠️ **目录页带查询参数的链接一律用 `CatalogLink.tsx`（普通 `<a>`、整页跳转），绝不能 `next/link`**：`middleware.ts` 的 `catalogRewrite()` 把 `q|console|lang|page` 改写到 `/catalog/...`（另一棵路由树），软导航的 flight 载荷对不上 ⇒ **只改地址栏、不换内容**（2026-10-19 线上事故，dev 看不出来）。`GamesSearchForm` 同理走原生 GET 表单。**别改成「页面直接读 searchParams」来绕**（会废掉整页 ISR）。- 详情页正文只有一段；下载页只有一颗钮。左上「返回」：只有开发商列表页 + 两个 404 页是普通 `<Link>`；游戏列表/详情/下载/开发商详情四页都是浏览器回退（`BackLink`，`mode:'history'`），兜底 列表→`/play`、详情→`/games`、下载→`/games/<id>`。
- 单条走 `getGame(id)`，只有首页深链走 HTTP；sitemap 从 `listGameStubs()` 现读。深链开窗判据 `deepLinkOpen`；`setDeepLinkOpen(true)` 必须包 `Promise.resolve().then()`。
- 列表唯一入口 `listGamesPage(offset, limit, {keyword, consoleType, developerId, language})`，排序 `created_at DESC, id DESC`；搜索只匹配 title/developer/series（刻意不含 language/description），关键词是第 1 个绑定参数。后台走 `listAdminGamesPage`（游标式、无缓存、无 total），两套别搅一起。
- `GameLibraryPanel` 的 tab/筛选/页码/滚动在模块级单例 `libraryMemory`；卡片错峰唯一出口 `lib/card-stagger.ts`。

## 存档（细节见 `DETAILS.md`）

- ⭐⭐ 存档 = 电池存档（`.srm`），一款一份；快照那套已停用（绑死核心版本 + NDS 快照 >100MB 撞 CF 100MB 请求体硬限）。
- 引擎唯一出口 `EmulatorController.saveBattery()` / `stageBatterySave(bytes)`；`saveState`/`loadStateFrom`/`downloadState` 已删别加回。存储 `lib/saves.ts`（**主键就是 ROM 文件名**）；云端淘汰 `SAVES_PER_GAME = 1`；上限唯一来源 `lib/save-limit.ts` 的 `MAX_SAVE_BYTES`。
- ⚠️⚠️ 读档 = 带着存档重新插一次卡带 ⇒ `/room` 走 `remountRom()`，`/play` 走 `applySave`。stage 之前必须先确认手里攥着 ROM 文件。
- ⚠️ 老快照数据不迁移、读到就清；`saveBattery()` 回 `null` = 还没存过盘，不是失败。⚠️ NDS 落盘目录未实测。

## `/room` 近况

- ⚠️ 「游戏库」入口是注释式隐藏：`ConsoleScene` 的 `.rail-games` 钮 + 掌机 `onOpenLibrary` + `ConsoleScreen` 待机层（不传 `onTap` 整层不画）⇒ `libraryOpen` 恒 false，恢复要三样一起放回。
- ⚠️ 三处页脚的「回到房间」已全删（首页/`GamesShell`/`LegalPage`），只剩 404 页那两颗（`gamesPage.backHome` 别删）；首页 Hero 第二颗钮「游玩本地 ROM」→ `/room`。

## 部署 / 校验

- ⚠️⚠️ **`/_next/static/*` 绝不能是 `immutable`**（2026-10-19 事故）：Turbopack chunk 名**不随内容变**，`max-age=31536000, immutable` 让老用户一直吃旧 JS ⇒ `(0,h.v) is not a function` / `Right-hand side of 'instanceof' is not an object`。`next.config.js` 已改 `max-age=0, must-revalidate`，**别改回默认**。
- ⚠️⚠️ **纯客户端壳的静态页必须 `export const dynamic = 'force-dynamic'`**（现 `/play`、`/room`、`/privacy`、`/terms`）：不加就是 `s-maxage=31536000`，HTML 在 CDN 钉一年 ⇒ 发版后无限刷新。新加这类页面照办；发版后 purge 一次 CF 缓存。
- ⚠️ **大 ROM 只有一条下载路 = `lib/http.ts` 的 `fetchRomWithProgress`**（`/play` 与 `/room` 都走）：2 MiB 网格 + 自适应档位（8/4/2 MiB，一批切过就降、干净 8 批才升回）+ 大段失败 1 次就切半 + 段级整批重试一次。`readBodyWithProgress` 只给存档这类小文件。背景：`/api/games/[id]/rom` 一个请求搬不动 100 MB+（整包只回 1–3 MB，5 MB 直接 503 `1102`）。
- 线上配 `SITE_URL`；不做 `output: 'export'`。⚠️ R2 无版本控制，删 ROM 永久丢（采样/账单的坑见 `DETAILS.md`）。
- ⚠️⚠️ **展示用地址一律 `publicUrlOrNull()`，别用严格版 `publicUrl()`**（2026-10-19 事故：Worker 掉 `R2_PUBLIC_BASE`，`toAppUser` 一抛带崩 `assertUser` ⇒ 带头像账号的 `/api/user/*` 全 500）。该变量已进 `wrangler.jsonc` 的 `vars`；严格版只给「没它没法工作」的路径（上传/ROM 代理/存档下载）。
- ⚠️ `public/cores/` 是新核心唯一来源 ⇒ 部署必须一起上传，否则 `/cores/*.js|.wasm` 404（`next.config.js` 已配长缓存）。
- ⚠️ `incremental: true` 的 typecheck 会假报 `lib/i18n.ts` 缺 key，全量 `npx tsc --noEmit --incremental false` 才真；`.next/types/` 是过期产物（假报 `app/page.js` 找不到，删掉即可）。lint 报数说清「我改的文件 0 条」。`pnpm build` 本机跑不了（沙箱拦 `.next` 清理），交给用户。
