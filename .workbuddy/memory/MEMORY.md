# nesLoad — 项目长期记忆

> 只留**动手前必须知道的硬约束**；功能细节见 `.workbuddy/memory/DETAILS.md`，来龙去脉见 `2026-10-*.md`。
> ⚠️ 碰「操作入口/抽屉、顶部加载条、联机/手柄/街机 romset、NDS-EJS 核、彩蛋挂画、详情页动作区、评论星级、反馈收藏、**实体多语言侧表与 `group_key`、后台添加/编辑表单**、`/consoles/[type]` 的 `?lang=`」之前**先读 `DETAILS.md`**。
> ⚠️ **动手前先 `git status`**（工作区常有未提交的活；可能另有进程并发改同一批文件）。
> ⚠️⚠️ **不要主动实测**（用户明确要求）：改完只做 typecheck + lint 基线，讲清楚交给用户看。

## 铁律 / 命名

- 站名**复古游戏屋**唯一来源 `lib/i18n.ts` 的 `SITE_NAME`，文案写 `{site}`。**全站唯一键盘操作是 `Esc`**。
- **别动**：`package.json` name、`nesload:*` 存储键、`nesload_locale`/`nesload_admin` cookie、`netplay.ts` 的 `APP_ID`。
- 基调：玩复古游戏 + 在线库 + 自己的 ROM 拖进来跑，别说成「卡带加载器」。
- 法务文案（`lib/legal.ts` 中英各一份，改一节两份都动）**书面、短、不口语化**，别用破折号 / 括号做补充说明。
- 注释写「为什么这么做」**包括否掉的方案**；临时探针验完必须删。

## 机种 / 核心

- `ConsoleType` = `nes|snes|gb|gbc|gba|nds|md|gg|sms|32x|ws|ngp|arcade`（`lib/emulator.ts`）。
- ⭐ **机种清单唯一出口 = `lib/consoles.ts`**（`CONSOLE_TYPES`/`CONSOLE_LABEL` ≤3 字/`CONSOLE_TINT`/`isConsoleType`），`CartridgeSprite.tsx` 只 re-export。**别再手抄数组**（放 lib 而非组件：服务端组件不能 import `lib/emulator.ts`，它顶层跑 `installAudioTap()`）。
- `CORE_MAP`：只有 nes→`fceumm`、snes→`snes9x` **走 jsdelivr CDN**，**其余 11 台全走本站 `public/cores/`**（判据 `LOCAL_CORE_CONSOLES`）；arcade 按 romset 在 `fbneo`/`fbalpha2012_cps1` 里挑（`lib/arcade-core.ts`）；本地核名严格 `<core>_libretro.js|.wasm`。
- ⚠️⚠️ **NDS 的 melonds 是「EJS 核」，控制面 + 输入面都与其余本地核不是一套** —— 见 `DETAILS.md` 的「NDS / EJS 核」。**以后再引 EJS 核就照那三条走，别只在 `CORE_MAP` 里加个名字。**
- **加机种**：照 README 那张表逐项过（`EXTENSION_MAP` 不含 `.bin`；`detectConsole` 9 步 **SNES 压最后**；`toConsoleType()` 有词界 / 顺序坑），外加 `lib/consoles.ts` 四件套、`public/cores/` 文件、`db/schema.sql` + `add-consoles.mjs`、透明底机种图、机种列举文案。
- `SCREEN_WIDTH/HEIGHT = 720×540` 只是**启动基准**，显示尺寸全在 globals.css（核心靠 ResizeObserver 跟），别读 `canvas.width`。
- ⚠️ CD 机种（PS1/Sega CD/PCE CD）**当前架构不通**：`lib/bios.ts` 只存一份 BIOS（id 写死 `neogeo`），多文件光盘镜像也不合单文件加载流。机种 **13 台**已扩完（`public/cores/` 16 文件，含 `melonds_libretro.{js,wasm}`）。

### `/consoles` 专题页与机种资料

- ⚠️ **表主键就是 `console_type`**，它是**资料的扩展不是清单** ⇒ 行被删 ⇒ 前台退回 `CONSOLE_LABEL` 默认渲染，**专题页永不 404**，后台**没有「名下有游戏不许删」拦截**（DELETE = 重置资料）。
- ⚠️ **首页「按机种浏览」= 按游戏数取前 8**；`/consoles` 列表页与 `/games` 筛选条才是全量。单条 `getConsole` **不缓存**、列表走 `listConsolesCached`；双语回退 `localizeConsole`；`lib/server/consoles.ts` **不许 import `./games.ts`**。sitemap 只列**有资料行**的机种。
- 脚本：`add-consoles.mjs`（建表+占位，幂等）；`seed-consoles.mjs` 是一次性快照、**会覆盖后台人工编辑，跑过别再跑**；`fill-console-images.mjs` + 源图 `console-images/` 补图（**只填 NULL 行**，`--force` 才覆盖）。
- 机种图 = R2 `images/consoles/<机种>-pixel.png`，公网地址写进 `consoles.image_url`。规格 = **正方形 PNG、必须透明底**（卡片画在 `bg-ink-950` 上，白底显白方块）。
- ⚠️ **动资料就要升缓存键版本尾**：`consoles:list` 现 **v5**、`developers:list`/`developers:top` 现 **v4**。

## 实体多语言侧表（⚠️ 动手前先读 `DETAILS.md`）

- 三张侧表 `game_texts` / `console_texts` / `developer_texts`。
- ⚠️⚠️ **`game_texts` 挂 `group_key` 不挂 `game_id`**：一行 `games` = **一盘 ROM**，同款中英日韩四版是四行、**文案只有一份**。键由 `lib/server/games.ts` 的 `resolveGroupKey()` 独家决定（「中文标题 COLLATE NOCASE + 机种 + 开发商」反查，查不到才新开），**接口层/后台都不传**；**判重与归组刻意同一套维度、只差 `language`，改一处必须改两处**。
- 读取**一律** `JOIN games g ON t.group_key = COALESCE(g.group_key, g.id)`；`loadGameTexts(ids)` 签名不变、字典仍按**游戏 id** 索引；搜索 `EXISTS` 同理（同款几条一起命中）。
- ⚠️ **改文案 = 改整款**（这就是想要的）；PATCH **不重算** `group_key`；`deleteGame` 清文案**必须晚一步**（同款还有别的 ROM 就得留着）。
- ⚠️ **动过它就升缓存键版本**：`games:count`/`list`/`latest`/`by-developer`/`by-console` 现全 **v2**。
- ⚠️ 迁移脚本**自带 `run()` 直连 D1 REST、绝不 import `lib/server/*.ts`**；旧脚本 `add-game-texts.mjs` **已作废**。✅ 线上 2026-10-16 已跑完 `add-game-group-key.mjs`：games 1258 行 → **1138 款**、`game_texts` **5021 → 4541 行**、旧表留底 **`game_texts_old`（5021 行）**。⚠️ 约 **12 分钟**、**必须后台跑**、中断无害、**那几分钟别并发跑改 `game_texts` 的脚本**。
- ⚠️ **后台接口必须把 `texts` 摊成四语言扁平字段**（唯一出处 `lib/entity-text.ts` 的 `flatEntityTexts()`，consoles/developers 两路由 extends 它；**别直接回 `Developer`/`Console`**）。**例外 `/api/admin/games` 回的是 `texts`**。前台取值走 `localizeGame`/`localizeConsole`/`localizeDeveloper`（**逐字段回退中文**）；数据层**不按语言裁剪**、**写入不做回退**。日韩文案两个脚本别混：机种/厂商 = `fill-entity-texts-ja-ko.mjs`（**写死官方译名，不爬上游**）；游戏 = `fill-game-texts-ja-ko.mjs`（爬上游）。
- 后台「添加/编辑」表单 `components/AdminGames.tsx` = **按语言分块**（公共区 + `CONTENT_LOCALES.map` 四个语言块 + ROM）；state = `texts: Record<ContentLocale, FormText>` ⇒ **加语言只改 `lib/game-text.ts` 一处**。后缀表 `FORM_SUFFIX`/`PATCH_SUFFIX` 是**接口契约**。`insertGame` 多回 `group: GameGroupInfo` ⇒ 提示「已归入《XXX》」；列表行 `AdminGame` 多带 `groupSize` ⇒ 编辑弹窗提示「文案是整款共用的、共 N 盘」。

## 两台机器 / 尺寸链

- 桌面 = 像素房间 + `RetroTv`；移动端 = 竖掌机 `HandheldConsole`；**必须二选一**（各一个 canvas）。移动端判据是**设备**：`<html data-mobile>` 由 BOOT_INIT 写，逻辑在 `lib/device.ts`（**内联脚本手抄一份，改一处必须同步另一处**）。
- 尺寸链唯一出口 = globals.css `--tv-*`：**档位只写上限**（`--tv-screen-max` 720/840/960、`--tv-base-max` 450/520/600），实际值 = `min(上限, 100vw − 360px)`；`--desk-w` = 机身 + 左右各 140，**不能收窄**；`--tv-base-w` 按 5/8 从屏幕推。**≥1068px 时三档值一个没变**。
- ⚠️ `.pc-notice`（请用桌面端）已全删 —— 别加回来。⚠️ 屏幕尺寸**必须写死在 `.screen` 的 class**（不能删/改内联/让 canvas 撑）。
- 掌机顶沿**只剩 PWR 灯且在左边**；⚠️ **灯在左 ⇔ 菜单钮在右**（一对一起改）。**音量整块删了**别再补。
- ⚠️⚠️ 掌机屏幕两侧「白边」是内圈身份证，**只能收细不能收没**（`.room` 左右 6、内圈内衬 4）。面键间距 `FACE_GAP = 14` 别调小（可见缝 = gap − 4）。

## 路由 / 缓存 / SEO

- 真路由：`/games`（15/页，`?page=N`+`?q=`+`?console=`，非规范 307）· `/games/[id]` · `/games/[id]/download` · `/consoles` · `/consoles/[type]`（另带 `?lang=`）· `/privacy` · `/terms` · `/developers` · `/developers/[id]` · **`/play`**；404 一页盖详情+下载。
- ⚠️ **`?lang=<zh|en|ja|ko|all>` 只挂在 `/consoles/[type]`**（`/games` 没有）：**不写 = 全部**（默认那份地址 = 裸路径），空值 / 认不出的值 / 重复参数一律 307 回裸地址；每颗标签挂该语种条数（`countConsoleGamesByLanguageCached`）；数据层多一维 `GamePageQuery.language`（`buildGamesWhere` 里排最后）。收录：**带 `?lang=` 的那几份 `noindex, follow`**，canonical/hreflang 指裸地址。**改这块前先读 `DETAILS.md`。**
- ⭐ **`/play` = `/room` 的另一个壳**（`components/PlayScene.tsx` + `app/[locale]/play/page.tsx`）：**引擎侧只有一份**（共用 `EmulatorController`/`NetplayController`/`lib/http.ts`/`lib/bios.ts` + `ConsoleScreen`），功能面是房间的子集（无彩蛋/抽屉/拖本地文件；云端存档本来就有，云端历史 2026-10-19 才补上）；外壳 = `GamesShell`（`showHeader={false}` + `fill`，**只有它用**）。⚠️⚠️ **视觉必须和网站整体一致**：描边 `pixel-edge pxw-* pxc-*`、屏里那层 `crt-*`（底永远黑）；「不要 room 的样式」= **别搬布景/电视机/抽屉/键帽**，不是另搞一套 1px 细边；⚠️ **别给 `.screen` 挂 max-h**（和 aspect-ratio 打架）。
  - ⚠️ **云端历史已补**（2026-10-19）：`load()` 成功且 `!file && game?.id` 时 `POST /api/user/history`。**详情页「开始游戏」走的就是 `/play`**，所以这里不写 = 用户玩多少都不进历史（曾经漏了 5 天，被误当成「历史丢了」）。存档这一页本来就有（`PlaySaveControls`），别以为「历史有存档就该有」。
- ⚠️ **`/play` 两个坑**：① `?id=` **不自动载入**（`/room?id=` 才自动下载开玩），入口 = 详情页动作区「联机游戏」+ 首页 Hero 房间号表单（`name="room"`/`maxLength=4` 写死）；② 联机时右侧按键表**一律锁 1P**（`keysLocked = soloOnly || mode !== 'solo'` 一个判据管「不画 P1/P2 切换」+「取值锁 `bindings.p1`」；`KeyBindingsPanel` 可选 `online` 让进页面就锁页签）——判据用**派生的 `mode`**，**不是 `netplayState.role`**。
- ⚠️ **缓存**：唯一出口 = `lib/server/cache.ts` 的 `cached()`（开发模式 `NODE_ENV !== 'production'` **直接透传查库**，线上才吃 `unstable_cache`；「同请求内只查一次」用 React 的 `cache()` 自己包，不是一回事）。**条目不随部署失效**（落在 `.next/cache`）⇒ 改数据 / 改查询形态 **必须把键尾版本 +1**；返回 `Record<ConsoleType, X>` 的地方**必须运行时补键**。首页三区块 = **12 小时**（`HOME_REVALIDATE_SECONDS`），和 `/games` 的 30 分钟分开两份（`listLatestGamesCached` 键 `games:latest`，别拿 `listGamesPageCached` 顶替）；首页**不该有** `export const revalidate`；缓存一律留在「页-侧」，**不下沉进数据层**。⚠️ **`games:row-by-id` 现 `v2`**（2026-10-16 存量记录改走来源地址时升的）—— 代理选目标是 `source_url` 优先、回退 `rom_url`，旧形态的行会去取**已删掉的 R2 对象**；条目不随部署失效 + TTL 24h ⇒ 只有换键能让旧条目立刻失效。来源地址那整套（`rom_url`/`source_url` 互斥、`scripts/fill-source-url.mjs`）见 `DETAILS.md`。
- ⚠️ `ConsoleScreen` 三个**可选** prop（`frameClassName`/`hideHint`/`onTap`）默认值 = 原行为。
- 搜索 `?q=…&page=N`（翻页必带关键词 `gamesHref`；搜索页 `noindex, follow`；关键词上限 64 码点）；首屏 SSR 已定型，**别加 loading/Suspense**；`GamesShell` 的 `label` 必须全 ASCII（font-pixel 无 CJK）。
- 详情页正文只有一段；下载页只有「开始下载」一颗钮。⚠️ 左上「返回」：**只有开发商列表页 + 两个 404 页**是普通 `<Link>`；**游戏列表/详情/下载/开发商详情四页全是浏览器回退**（`BackLink`，`mode:'history'`）；兜底 列表→`/play`、详情→`/games`、下载→`/games/<id>`。
- 单条走 `getGame(id)`，只有首页深链走 HTTP；sitemap 从 `listGameStubs()` 现读。深链开窗判据 `deepLinkOpen`；`setDeepLinkOpen(true)` 必须包 `Promise.resolve().then()`。
- 列表唯一入口 `listGamesPage(offset, limit, {keyword, consoleType, developerId, language})`，排序 `created_at DESC, id DESC`；搜索只匹配 title/developer/series（**刻意不含 language/description**），关键词是第 1 个绑定参数。后台列表走 `listAdminGamesPage`（游标式、无缓存、无 total），两套别搅一起。
- `GameLibraryPanel` 的 tab/筛选/页码/滚动在模块级单例 `libraryMemory`；卡片错峰唯一出口 `lib/card-stagger.ts`。

## 存档（2026-10-15 换制式，细节见 `DETAILS.md` 的「云存档」）

- ⭐⭐ **存档 = 电池存档（`.srm`），一款一份**；快照（save state）那套**已整体停用**（绑死核心版本 + NDS 快照 >100MB 撞 CF 的 100MB 请求体硬限）。
- 引擎唯一出口 `EmulatorController.saveBattery()` 与 `stageBatterySave(bytes)`；**`saveState`/`loadStateFrom`/`downloadState` 已删**别加回。存储 `lib/saves.ts`（**主键就是 ROM 文件名**）；云端淘汰 `SAVES_PER_GAME = 1`；上限唯一来源 `lib/save-limit.ts` 的 `MAX_SAVE_BYTES`。
- ⚠️⚠️ **读档 = 带着存档重新插一次卡带**（核心只在启动时读卡带记忆）⇒ `/room` 走 `remountRom()`，`/play` 走 `applySave`。**stage 之前必须先确认手里攥着 ROM 文件**。
- ⚠️ **老快照数据一律不迁移、读到就清**（快照字节当 `.srm` 注入会毁掉游戏内存档）；`saveBattery()` 回 `null` = **还没存过盘**，不是失败。⚠️ **NDS 落盘目录未实测**。

## `/room` 近况

- ⚠️ **`/room` 的「游戏库」入口是注释式隐藏**（用户要求，不是删）：**三样一套** —— `ConsoleScene` 的 `.rail-games` 钮 + 掌机 `onOpenLibrary` + `ConsoleScreen` 待机层（`onTap` 没传就整层不画）⇒ `libraryOpen` 恒 false。**恢复要把三样一起放回来。**
- ⚠️ 三处页脚的「回到房间」（`/room`）已全删（首页 / `GamesShell` / `LegalPage`），**只剩 404 页那两颗**（`gamesPage.backHome` 别删）；首页 Hero 第二颗钮「游玩本地 ROM」→ `/room`（键 `home.hero.play`）。

## 部署 / 校验

- 线上配服务端变量 `SITE_URL`；不做 `output: 'export'`。⚠️ 别拿生产数据做删除类测试（D1/R2 是真库）；R2 无版本控制，删 ROM 永久丢。
- ⚠️⚠️ **展示用地址一律走 `publicUrlOrNull()`，别用严格版 `publicUrl()`**（2026-10-19 事故：线上 Worker 掉了 `R2_PUBLIC_BASE`，`toAppUser` 里那一抛把 `assertUser` 带崩 ⇒ 带头像的账号**每个 `/api/user/*` 空 500**，个人中心四个 tab 全挂；同因打死 20 款 R2 直链游戏的 ROM 代理）。该变量现已写进 `wrangler.jsonc` 的 `vars` 跟发版走；严格版只留给「没它就没法工作」的路径（上传 / ROM 代理 / 存档下载）。
- ⚠️ **R2 删了对象，控制台数字不会立刻掉**（2026-10-16 用户问过一次）：桶页的 Storage 来自**日采样**（`r2StorageAdaptiveGroups`），账单侧是 **GB-month、按「每日峰值」在 30 天周期内平均** ⇒ 只会慢慢衰减。要核「到底删没删」直接 `ListObjectsV2` 列桶 + 跟 D1 对账，别信控制台。桶 `games` 目前 ~255 MiB，**大头是封面图 `images/`（1702 张 / 154 MiB）不是 roms/**；账号下另有桶 `nesload-opennext-cache`。
- ⚠️ `public/cores/` 是新核心的**唯一来源** ⇒ 部署必须一起上传，否则 `/cores/*.js|.wasm` 404（`next.config.js` 已给它配长缓存）。
- ⚠️ `incremental: true` 的 typecheck 会**假报** `lib/i18n.ts` 缺 key，全量 `npx tsc --noEmit --incremental false` 才真；`.next/types/` 是**过期产物**，单跑 `tsc` 会假报 `app/page.js` 找不到模块（删掉即可）。lint 报数时说清「我改的文件 0 条」。`pnpm build` 本机跑不了（沙箱拦 `.next` 清理），交给用户。
