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
- ⭐ 机种清单唯一出口 = `lib/consoles.ts`（`CONSOLE_TYPES`/`CONSOLE_LABEL` ≤3 字/`CONSOLE_TINT`/`isConsoleType`），`CartridgeSprite.tsx` 只 re-export。**别再手抄数组**（放 lib 而非组件：服务端组件不能 import `lib/emulator.ts`，它顶层跑 `installAudioTap()`）。
- ⭐ 机种短标签**前台一律走 `consoleLabel(type, locale)`**（`CONSOLE_LABEL` 只是英文档）：中文/日/韩 `nes` 显示 `FC`，英文 `NES`。标签位必须 ≤3 字符 + 纯 ASCII（font-pixel 无 CJK），所以韩文标签也是 FC、패미컴 只在文案句里；后台 Admin 与 admin API 仍读 `CONSOLE_LABEL`（看的是机种代码）。URL/枚举仍是 `nes`，永远不改。
- `CORE_MAP`：**14 台全走本站 `public/cores/`**（2026-10-19 起 NES/SFC 的 `fceumm`/`snes9x` 也从 jsdelivr 搬来，`coreSource` 已无 CDN 分支，`LOCAL_CORE_CONSOLES` 已删）；arcade 按 romset 在 `fbneo`/`fbalpha2012_cps1` 里挑（`lib/arcade-core.ts`）；本地核名严格 `<core>_libretro.js|.wasm`，`fbneo` 只存 `.wasm.gz`（`GZIP_CORES`，启动时解压）。
- ⚠️⚠️ **NDS 的 melonds 是 EJS 核**（取自 EmulatorJS 构建），控制面 + 输入面都与其余核不是一套 —— 见 `DETAILS.md`。以后再引 EJS 核照那三条走，别只在 `CORE_MAP` 加名字。
- 加机种：照 `lib/consoles.ts` 头部那九处代码 + 两件数据逐项过（`EXTENSION_MAP` 不含 `.bin`；`detectConsole` 文件头优先、**SNES 压最后**；`toConsoleType()` 有词界/顺序坑）。
- `SCREEN_WIDTH/HEIGHT = 720×540` 只是**启动基准**（NDS 例外 256×384），显示尺寸全在 globals.css，别读 `canvas.width`。
- ⚠️ CD 机种（PS1/Sega CD/PCE CD）架构未通：`lib/bios.ts` 只存一份 BIOS（id 写死 `neogeo`），多文件光盘镜像不合单文件加载流。

### `/consoles` 专题页与机种资料

- ⚠️ 表主键就是 `console_type`，它是**资料的扩展不是清单** ⇒ 行被删 ⇒ 前台退回 `CONSOLE_LABEL` 默认渲染，**专题页永不 404**，后台无「名下有游戏不许删」拦截（DELETE = 重置资料）。
- ⚠️ 首页「按机种浏览」= 按游戏数取前 8；`/consoles` 与 `/games` 筛选条才是全量。单条 `getConsole` 不缓存、列表走 `listConsolesCached`；双语回退 `localizeConsole`；`lib/server/consoles.ts` **不许 import `./games.ts`**。sitemap 只列有资料行的机种。
- 脚本：`add-consoles.mjs`（建表+占位，幂等）；`seed-consoles.mjs` 是一次性快照、**跑过别再跑**；`fill-console-images.mjs` + 源图补图（只填 NULL，`--force` 才覆盖）。
- 机种图 = R2 `images/consoles/<机种>-pixel.png`，写进 `consoles.image_url`；**正方形 PNG、必须透明底**。
- ⚠️ 动资料就升缓存键版本尾：`consoles:list` **v7**、`developers:list`/`developers:top` v4。

## 实体多语言侧表（⚠️ 动手前先读 `DETAILS.md`）

- 三张侧表 `game_texts`/`console_texts`/`developer_texts`。
- ⚠️⚠️ **`game_texts` 挂 `group_key` 不挂 `game_id`**：一行 `games` = 一盘 ROM，同款四版是四行、文案只有一份。键由 `lib/server/games.ts` 的 `resolveGroupKey()` 独家决定（中文标题 COLLATE NOCASE + 机种 + 开发商反查，查不到才新开），**接口层/后台都不传**；判重与归组刻意同一套维度、只差 `language`，改一处必须改两处。
- 读取一律 `JOIN games g ON t.group_key = COALESCE(g.group_key, g.id)`；`loadGameTexts(ids)` 签名不变、字典仍按游戏 id 索引；搜索 `EXISTS` 同理。
- 改文案 = 改整款（就是要的）；PATCH 不重算 `group_key`；`deleteGame` 清文案**必须晚一步**。
- 动过就升 `games:count|list|latest|by-developer|by-console`，现全 **v2**。
- 迁移脚本自带 `run()` 直连 D1 REST、绝不 import `lib/server/*.ts`；`add-game-texts.mjs` 已作废。✅ 线上 2026-10-16 已跑完 `add-game-group-key.mjs`（1258 盘 → 1138 款），旧表留底 `game_texts_old`。
- ⚠️ 后台接口必须把 `texts` 摊成四语言扁平字段（唯一出处 `lib/entity-text.ts` 的 `flatEntityTexts()`，consoles/developers 两路由 extends；别直接回 `Developer`/`Console`）。例外 `/api/admin/games` 回 `texts`。前台取值走 `localizeGame`/`localizeConsole`/`localizeDeveloper`（逐字段回退中文）；数据层不按语言裁剪、写入不做回退。
- 后台表单 `components/AdminGames.tsx` = 公共区 + `CONTENT_LOCALES.map` 四个语言块 + ROM；state `texts: Record<ContentLocale, FormText>` ⇒ 加语言只改 `lib/game-text.ts`。`FORM_SUFFIX`/`PATCH_SUFFIX` 是接口契约。`insertGame` 多回 `group`、列表行多带 `groupSize`。

## 主题 / 首屏属性

- 真身在 `<html data-theme>`（`:root` 默认 dark，light 靠 `:root[data-theme='light']`）。写入者**两个**：`components/SiteDocument.tsx` 的 `BOOT_INIT`（**只在整页加载时跑**，软导航不跑）与 `lib/theme.ts` 的 `saveTheme()`。
- ⚠️ 2026-10-19 起 `BOOT_INIT` 在「没存过值」时把现算结果**落盘**到 `nesload:theme`（之前只有点钮才写 ⇒ 没点过的人整页加载会重按系统算，表现为「切路由突然变黑」）。**别再改成跟随系统实时变化** —— 软导航没有重算时机，只会把不一致换个方向再演一遍。
- ⚠️ `BOOT_INIT` **禁止在外面包一个大 try**：以前那个 catch 硬编码 `data-theme='dark'`，一步抛错就把已存的 light 一起丢掉。读写走局部 `read()/write()`，失败只影响那一条。
- 主题钮三处：房间右沿（ConsoleScene，带 `.row-label`）、`/play` 右栏「显示」行、**内容页 `TopBar` 最右那颗**（2026-10-19 加；`GamesShell` 的 `showTheme` 透传，**只有 `StaticPlay` 传 false**，防 `/play` 出现两颗）。图标一律由 CSS 按 `data-theme` 挑，React 只管 title/aria。
- `data-tv` 的 `/play` 判据是 `/\/play(?:\/|$)/`（**别写死语种**，旧版 `/^\/(zh\/)?play/` 漏了 ja/ko）。

## 两台机器 / 尺寸链

- 桌面 = 像素房间 + `RetroTv`；移动端 = 竖掌机 `HandheldConsole`；必须二选一。移动端判据是**设备**：`<html data-mobile>` 由 BOOT_INIT 写，逻辑在 `lib/device.ts`（内联脚本手抄一份，改一处必须同步另一处）。
- 尺寸链唯一出口 = globals.css `--tv-*`：档位只写上限（`--tv-screen-max` 720/840/960、`--tv-base-max` 450/520/600），实际值 = `min(上限, 100vw − 360px)`；`--desk-w` = 机身 + 左右各 140，不能收窄；`--tv-base-w` 按 5/8 从屏幕推。**≥1068px 时三档值一个没变**。
- ⚠️ `.pc-notice` 已全删别加回；屏幕尺寸必须写死在 `.screen` 的 class。
- 掌机顶沿只剩 PWR 灯且在左边；⚠️ 灯在左 ⇔ 菜单钮在右（一对一起改）。音量整块删了别再补。
- ⚠️⚠️ 掌机屏幕两侧白边是内圈身份证，只能收细不能收没（`.room` 左右 6、内衬 4）。`FACE_GAP = 14` 别调小。

## 路由 / 缓存 / SEO

- 真路由：`/games`（15/页，`?page`+`?q`+`?console`，非规范 307）· `/games/[id]` · `/games/[id]/download` · `/consoles` · `/consoles/[type]`（另带 `?lang=`）· `/privacy` · `/terms` · `/developers` · `/developers/[id]` · `/play`；404 一页盖详情+下载。
- ⚠️ `?lang=<zh|en|ja|ko|all>` 只挂 `/consoles/[type]`：不写 = 全部；空值/认不出/重复参数 307 回裸地址；标签挂该语种条数（`countConsoleGamesByLanguageCached`）；数据层多一维 `GamePageQuery.language`（`buildGamesWhere` 排最后）。带 `?lang=` 的 noindex, follow，canonical/hreflang 指裸地址。
- ⭐ **`/play` = `/room` 的另一个壳**（`components/PlayScene.tsx` + `app/[locale]/play/page.tsx`）：引擎侧只有一份（`EmulatorController`/`NetplayController`/`lib/http.ts`/`lib/bios.ts` + `ConsoleScreen`），功能面是房间子集（无彩蛋/抽屉/拖本地文件；存档与云端历史都有）；外壳 = `GamesShell`（`showHeader={false}` + `fill`，只有它用）。
  - ⚠️⚠️ 视觉必须和网站一致：描边 `pixel-edge pxw-* pxc-*`、屏里那层 `crt-*`（底永远黑）。「不要 room 的样式」= 别搬布景/电视机/抽屉/键帽。别给 `.screen` 挂 max-h。
  - ✅ 云端历史：`load()` 成功且 `!file && game?.id` 时 `POST /api/user/history`（2026-10-19 补；详情页「开始游戏」走的就是 `/play`）。
  - ✅ **`?id=` 会自动载入开玩**（`StaticPlay` 传 `autoStart={Boolean(id) && !room && !host}` ⇒ `directSolo` ⇒ 自动 `start()`）。⚠️ `PlayScene` 头部注释仍写着「不会自动载入」，那是旧行为、**以代码为准**。
  - ⚠️ 联机时右侧按键表一律锁 1P（`keysLocked = soloOnly || mode !== 'solo'` 一个判据管「不画 P1/P2 切换」+「取值锁 `bindings.p1`」；`KeyBindingsPanel` 可选 `online` 让进页面就锁页签）。判据用派生的 `mode`，**不是 `netplayState.role`**。
- ⚠️ 缓存：唯一出口 `lib/server/cache.ts` 的 `cached()`（开发模式直接透传查库，线上才吃 `unstable_cache`）。**条目不随部署失效** ⇒ 改数据/查询形态必须键尾版本 +1；返回 `Record<ConsoleType, X>` 必须运行时补键。首页三区块 12 小时（`HOME_REVALIDATE_SECONDS`）与 `/games` 30 分钟分开；首页不该有 `export const revalidate`；缓存留在页-侧，不下沉数据层。⚠️ `games:row-by-id` 现 **v2**（代理目标 `source_url` 优先、回退 `rom_url`）。
- `ConsoleScreen` 三个可选 prop（`frameClassName`/`hideHint`/`onTap`）默认值 = 原行为。
- 搜索 `?q=&page=`（翻页必带关键词 `gamesHref`；搜索页 noindex, follow；关键词上限 64 码点）；首屏 SSR 已定型，别加 loading/Suspense；`GamesShell` 的 `label` 必须全 ASCII（font-pixel 无 CJK）。
- 详情页正文只有一段；下载页只有一颗钮。左上「返回」：只有开发商列表页 + 两个 404 页是普通 `<Link>`；游戏列表/详情/下载/开发商详情四页都是浏览器回退（`BackLink`，`mode:'history'`），兜底 列表→`/play`、详情→`/games`、下载→`/games/<id>`。
- 单条走 `getGame(id)`，只有首页深链走 HTTP；sitemap 从 `listGameStubs()` 现读。深链开窗判据 `deepLinkOpen`；`setDeepLinkOpen(true)` 必须包 `Promise.resolve().then()`。
- 列表唯一入口 `listGamesPage(offset, limit, {keyword, consoleType, developerId, language})`，排序 `created_at DESC, id DESC`；搜索只匹配 title/developer/series（刻意不含 language/description），关键词是第 1 个绑定参数。后台走 `listAdminGamesPage`（游标式、无缓存、无 total），两套别搅一起。
- `GameLibraryPanel` 的 tab/筛选/页码/滚动在模块级单例 `libraryMemory`；卡片错峰唯一出口 `lib/card-stagger.ts`。

## 存档（细节见 `DETAILS.md`）

- ⭐⭐ 存档 = 电池存档（`.srm`），一款一份；快照那套已停用（绑死核心版本 + NDS 快照 >100MB 撞 CF 100MB 请求体硬限）。
- 引擎唯一出口 `EmulatorController.saveBattery()` / `stageBatterySave(bytes)`；`saveState`/`loadStateFrom`/`downloadState` 已删别加回。存储 `lib/saves.ts`（**主键就是 ROM 文件名**）；云端淘汰 `SAVES_PER_GAME = 1`；上限唯一来源 `lib/save-limit.ts` 的 `MAX_SAVE_BYTES`。
- ⚠️⚠️ 读档 = 带着存档重新插一次卡带 ⇒ `/room` 走 `remountRom()`，`/play` 走 `applySave`。stage 之前必须先确认手里攥着 ROM 文件。
- ⚠️ 老快照数据不迁移、读到就清；`saveBattery()` 回 `null` = 还没存过盘，不是失败。⚠️ NDS 落盘目录未实测。

## `/room` 近况

- ⚠️ `/room` 的「游戏库」入口是注释式隐藏：`ConsoleScene` 的 `.rail-games` 钮 + 掌机 `onOpenLibrary` + `ConsoleScreen` 待机层（不传 `onTap` 就整层不画）⇒ `libraryOpen` 恒 false，恢复要三样一起放回。
- ⚠️ 三处页脚的「回到房间」已全删（首页/`GamesShell`/`LegalPage`），只剩 404 页那两颗（`gamesPage.backHome` 别删）；首页 Hero 第二颗钮「游玩本地 ROM」→ `/room`。

## 部署 / 校验

- 线上配 `SITE_URL`；不做 `output: 'export'`。⚠️ 别拿生产数据做删除类测试；R2 无版本控制，删 ROM 永久丢。
- ⚠️⚠️ **展示用地址一律 `publicUrlOrNull()`，别用严格版 `publicUrl()`**（2026-10-19 事故：Worker 掉了 `R2_PUBLIC_BASE`，`toAppUser` 那一抛带崩 `assertUser` ⇒ 带头像账号的 `/api/user/*` 全 500）。该变量已写进 `wrangler.jsonc` 的 `vars`；严格版只留给「没它就没法工作」的路径（上传/ROM 代理/存档下载）。
- ⚠️ R2 控制台 Storage 是日采样（`r2StorageAdaptiveGroups`）、账单按每日峰值均摊 ⇒ 删了对象数字只会慢慢衰减。核「删没删」直接 `ListObjectsV2` 跟 D1 对账。桶 `games` ~255 MiB，大头是封面 `images/`（1702 张 154 MiB）。
- ⚠️ `public/cores/` 是新核心唯一来源 ⇒ 部署必须一起上传，否则 `/cores/*.js|.wasm` 404（`next.config.js` 已配长缓存）。
- ⚠️ `incremental: true` 的 typecheck 会假报 `lib/i18n.ts` 缺 key，全量 `npx tsc --noEmit --incremental false` 才真；`.next/types/` 是过期产物（单跑 `tsc` 会假报 `app/page.js` 找不到模块，删掉即可）。lint 报数说清「我改的文件 0 条」。`pnpm build` 本机跑不了（沙箱拦 `.next` 清理），交给用户。
