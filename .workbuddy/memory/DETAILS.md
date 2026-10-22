# nesLoad — 功能细节（`MEMORY.md` 的附表）

> 只放「改这块之前必须知道」的细节；总纲与硬约束见 `MEMORY.md`。

## Supabase / R2 / 部署补充细节（2026-10-20~22，自 MEMORY.md 移入）

- 全量爬取/回填模板 = `scripts/migrate-to-supabase.mjs`（上游**列表页** RSC 载荷一页 18 款带全部字段）；14 语种回填 = `scripts/fill-game-texts-locales.mjs`（postgres.js 连 `SUPABASE_DB_URL`：连接池跑完全程再 end、developer/series 行按 slug:locale 去重，两个坑都踩过）。机种文案回填 = `scripts/fill-console-intros.mjs`（只补 zh/en 空值、`COALESCE` 不覆盖人工编辑；切库时 console_texts 只搬了 name）。
- `writeTexts`/`writeDeveloperTexts`（games-admin.ts / developers.ts）只动传进来的语言，别的行一概不碰。
- 缓存键版本（2026-10-22 时点）：`sb:games:page|latest|by-console|by-developer|by-id` v2、`sb:developers:list` v4、`sb:developers:top` v3、`consoles:list` v8、机种页单条 `static-console` v2。ISR 撤销后数据缓存统一 604800（`GAMES_PAGE_`/`GAME_DETAIL_`/`HOME_`/`CONSOLES_PAGE_`/`DEVELOPERS_PAGE_`/`TOP_DEVELOPERS_`；`listGameStubsCached` 仍 86400）；构建期预渲染已删（三处 `generateStaticParams` + `PRERENDER_LOCALES`）。
- 开发商厂标只有 133/269 家有，其余库内 `NULL`，前台走名字首字占位。
- ROM 自持：脚本 `scripts/migrate-roms-to-r2.mjs`（幂等、HeadObject 断点续跑、`--console=` 非空时完全取代默认排除表、写 `size_bytes`；判据分层：`HTML_LIKE` 拦 html/json/xml，`text/*` 再看首字节是不是 `<`/`{`——`.md` 是真卡带）。`route.ts` 取片先按语言、再优先 `r2:`。已知上游两边都 404 的 8 个：`arcade/sexy-parodius`、`snes/art-of-fighting-snes`、`contra-iii-the-alien-wars-snes`、`dragon-ball-z-super-butoden-3-snes`(fr/ja/ko)、`fushigi-no-dungeon-2-fuurai-no-shiren`(en/ja)。
- 7z wasm 实测：同一 PS1 包（265 MB→692 MB）旧 asm.js 42.6 s → 新 wasm 19.0 s，2.2 倍（别再引用「5–10 倍」）。别改「精确扩容」——7-Zip 边写边扩会退化 O(n²)（16.2 s→74.1 s、3.8 GB）。`unwrapRom` 收 `AbortSignal`，取消要 `terminate()` worker 且不吞 abort（「解不开」才吞）；worker 内失败走 `{t:9}`。内存判据口诀：离开时能进 `exit()` 且 instance 非 null 才清得掉；残留 ~70 MB/次是核心 wasm 堆，量级小一个数量级，未追。


## 机种专题页的语种筛选（`/consoles/[type]` 的 `?lang=`，2026-10-16）

- 只挂在这**一页**上（`/games` 没有语种筛选，那一路永远传 `null`）。筛的是 `games.language` = **游戏自己的语种**，不是界面语言。
- **两态写法（2026-10-16 用户要求改：默认从「按界面语言挑一份」变成「先给全部」）**：「全部」⇒ 地址里**不写** `lang`（默认那份就是裸路径）、其余 ⇒ 短码本身。归一化只有一处 = 页面里的 `languageParamOf()`（改成只收一个参数了），**判「地址规不规范」和「拼链接」共用它**，别在两处各写一份。⚠️ 原来那个「不写 = 跟着界面语言走」的 `defaultLanguage()` **已删**，别再往回加。
- ⚠️ `?lang=all`、`?lang=`（空）、认不出的 `?lang=xxx`、重复参数 ⇒ 一律 307 回**裸地址**。判据是「**参数在不在**」而不是「是不是空串」（`lib/pager.ts` 的 `parsePageParam` 同款，重复参数会被 `typeof raw === 'string'` 筛掉）。
- ⚠️ 数据层加了第四/第五维：`GamePageQuery.language` → `buildGamesWhere` 里 `language = ?N`（**精确匹配、排在最后**）；`listGamesByConsoleCached(...)` 第 4 参数、`listGamesPageCached(...)` 第 5 参数、`countGamesCached(...)` 第 4 参数。**加维会让线上旧缓存整体失效一轮**（键形状变了），属预期。
- ⚠️ 条数：`countConsoleGamesByLanguageCached(consoleType)`，键 `games:lang-counts` + `v1`，一条 `GROUP BY language`。**不跟关键词走**（和资料表里「共 N 款」同口径）；返回值**只有 `GAME_LANGUAGE_VALUES` 四个键**（`jp` / `ZH` 这类脏数据丢掉 —— 它们既不参与筛选、也不该出现在标签上）。
- ⚠️ 资料表里「N 款游戏」= 这个机种的**总数**（`loadGames(id, 1, '', null)`），和「全部」那颗同一个数。**别改成跟着语种走**，否则「全部」那颗会显示成当前语种的条数。
- ⚠️ **三处都要带上 `lang`**：筛选条链接、翻页链接（`consoleHref` 一次拼全）、搜索表单。搜索表单靠 `GamesSearchForm` 的**可选** `languageParam`（收的是「写进地址那一串」，不是语种短码；`/games` 不传 = 行为与以前一字不差）。少了任何一处，筛着「日本語」搜一下 / 翻一页就掉回全部。
- 收录：**带 `?lang=` 的那几份 `noindex, follow`**（子集，四个语种全收就是四份重复内容）；**hreflang 与 canonical 一律指裸地址那一份**，不看 `lang`（和 `/games?console=` 那条「带自己的筛选参数」刻意相反）。
- 文案键：`consolesPage.filterLangLabel`（筛选条 aria-label）、`consolesPage.gamesEmptyLang`（`{lang}` 填的是 `lib/rom-lang.ts` 的语言全称）。语言名本身**不进文案表**（用各自的语言写）。

## NDS / EJS 核（melonds）

- 来源：`melonds_libretro.{js,wasm}` 从 EmulatorJS 的 `melonds-wasm.data`（7z 壳）解出，不是 `retroarch-emscripten-build` 那个 tag（它没有 NDS）。
- ① **js 里有 `nost-compat` 补丁，不能换成 CDN 原样那份**：让 Nostalgist 走 `isEsmScript` 分支 + 暴露 `libretro_melonds`/`melonds` 工厂名 + `findEventTarget` 认 `!canvas`/`!parent` 哨兵。
- ② **运行时控制面和其余本地核不是一套**：它没有 `_cmd_toggle_pause`/`_cmd_load_state`/`_cmd_reset` ⇒ Nostalgist 的 `pause()`/`loadState()`/`restart()` 在 NDS 上全打不到核心，`saveState()` 等的是核心永远不会写的 `.state` 文件。已在 `lib/emulator.ts` 的 `createEjsControl()` 按**能力探测**分路：暂停→`toggleMainLoop(0/1)`、重置→`system_restart()`、开局带存档→`_refresh_save_files()`。⚠️ **2026-10-15 下午起快照那套整体停用**（存档换成电池存档，见下面「云存档」一节），`save_state_info()`/`load_state()` **不再被调用** —— `save_state_info` 只留着当 EJS 身份标记（它才是 EJS 构建独有的导出）。
- ③ **输入面也换了一套**：EJS 那支输入驱动（`input/drivers/emulatorjs_input.c`）把上游 `rwebinput_input.c` 的 `rwebinput_is_pressed()` 掏成了 `return 0;` ⇒ 写进 `retroarch.cfg` 的 `input_playerN_*` **一个钮也点不动**（别去开 `ejs_set_keyboard_enabled`，那是喂核心键盘设备的）。它认 `simulate_input(user, id, value)`：**user 0 基**；id = RetroPad 编号 `0b 1y 2select 3start 4up 5down 6left 7right 8a 9x 10l 11r 12l2 13r2`（见 `EJS_JOYPAD_ID`，**顺序和 `ALL_BUTTONS` 不一样**）。已在 `attachEjsKeyboard()` 里自接 `window` 的 keydown/keyup/blur → `simulate_input`（**只在 `this.ejs?.simulate` 非 null 时挂**，探测别并进 ② 那三样）；`pressButton()` 加了 EJS 分支（**它收 1 基 player，要减一**）⇒ 联机注入 + 掌机虚拟钮一起通。
- ⚠️ **以后再引 EJS 核就照这三条走，别只在 `CORE_MAP` 里加个名字。**

## 云存档（电池存档 / 平台上限）

- ⭐⭐ **2026-10-15 起：存档 = 电池存档（`.srm`，游戏自己那份卡带记忆），一款只有一份。**
  之前是 save state（整机快照），换掉的原因是体积 —— 快照**绑死核心版本**且跟机种强相关，
  NDS 的 melonds 快照 **>100MB**，撞上下面那条平台硬限直接 413。量级对照（换制式前的实测 /
  官方数，留作背景）：NES 解压 13,800 B → RZIP 压缩 1,697 B；snes9x 官方 421KB；
  melonDS standalone 约 18MB。电池存档反过来是 **8KB（NES/SFC）~ 1MB（NDS）** 量级。
- ⚠️⚠️ **平台那条硬限仍在**：Cloudflare（Pages Functions）**请求体硬限 100MB**（Free/Pro），
  超了在**边缘**回 `413 Request Entity Too Large`，请求**根本进不到** `POST /api/user/saves`
  ⇒ D1 无行、R2 无对象、日志也没有。自定的 `MAX_SAVE_BYTES`（20MB，唯一来源 `lib/save-limit.ts`）
  现在只是一道纯保险（客户端发送前也用它预检 `blob.size`），正常流程永远碰不到。
- **读写机制（13 个机种统一，EJS 核不再例外）**：
  - **取** `EmulatorController.saveBattery()`：`callCommand('_cmd_savefiles')`（核心把内存里的 SRAM
    刷成虚拟文件系统里的 `<ROM 名>.srm`）→ 读那个文件 → Blob。
    ⚠️ **刻意不用 Nostalgist 的 `saveSRAM()`**：它先 `unlink` 再 `waitForFile`（最多退避重试 120 次），
    玩家还没在游戏里存过盘时那个文件永远不出现 ⇒ 界面要干等近一分钟。自己读文件是「没有就立刻回 null」。
  - **放** `stageBatterySave(bytes)`：下一个 `loadRom` 通过 Nostalgist 的 `sram` 启动项写进 FS
    （EJS 核额外补一刀 `_refresh_save_files()`）。**消费一次就清空**，别粘到下一局。
  - ⚠️⚠️ **读档 = 带着存档重新插一次卡带**（核心只在启动时读卡带记忆，运行中换文件它不回头再看）
    ⇒ `/room` 走 `ConsoleScene` 的 `remountRom()` 重跑 `loadFile`，`/play` 走 `PlayScene` 的
    `applySave` 重跑 `load()`。⚠️ **stage 之前要先确认「手里攥着 ROM 文件」**，否则那份存档会漏到下一局。
- 路径：Nostalgist 算出来的是 `…/retroarch/userdata/saves/<coreFullName>/<romBaseName>.srm`
  （`sramType` 默认 `srm`，`userdataDirectory = /home/web_user/retroarch/userdata`）。
  `saveBattery()` 先认这条路，认不到再扫 `SRAM_SEARCH_ROOTS`（虚拟文件系统很小，扫一遍很便宜）。
- 存储：本机 `lib/saves.ts`（IndexedDB，**主键就是 ROM 文件名** ⇒ 结构上不可能有第二份）；
  云端 `user_saves` 行 + R2 对象，淘汰规则 `SAVES_PER_GAME = 1`（`lib/server/user-data.ts`，
  写入方负责连 R2 一起删，顺带清掉换制式前的老快照行）。
- ⚠️ **老数据不迁移**：槽位制时代的快照记录（id 是 UUID、字节是快照）读到就**清掉**，
  localStorage 的 `nesload:state:*` 也清 —— 快照字节当成 `.srm` 注入**会毁掉游戏内存档**，比丢掉更糟。
- 报错口径（2026-10-15 修的）：`PlaySaveControls` 以前**不看 `res.ok`** ⇒ 413 也显示「保存成功」
  （房间侧有检查但只 `console.warn`）。现在两边都在发送前看 `blob.size`、发送后看 `res.ok`；
  ⚠️ `saveBattery()` 回 `null` = **还没在游戏里存过盘**，不是失败（文案 `play.noSave`）。
- 排查口径：`/account?tab=saves` 看不到 ≠ 页坏了。先查 D1 `user_saves` 有没有行（个人中心那条
  `listUserSaveOverview` 还会 `JOIN games` 过滤掉游戏已删的孤儿行），再看 R2 `saves/` 有没有对象。
- ⚠️ **NDS 那条路还没实测**：`_cmd_savefiles` / `_refresh_save_files` 在 melonds 的 js 里**确有导出**
  （`Module["_cmd_savefiles"]=wasmExports["gi"]`，grep 确认，**未运行时验证**），但**它把存档落在哪个
  目录没验证过**（EJS 构建的目录约定可能和正经 RetroArch 不同）—— 那层 `SRAM_SEARCH_ROOTS` 兜底就是
  为它准备的。**带存档开局**同理，靠 `_refresh_save_files()` 补刀。

## 操作入口 / 抽屉

- **两处入口 = 一份 DOM、两套布局**：`.top-links` + 右侧 `.rail` 都包在 `.entries`；大屏 `.entries` 是 `display: contents`，小屏变右侧滑出抽屉。
- **小屏判据唯一出口** = globals.css 的 `@media (max-width: 899px), (max-height: 949px)`。抽屉开合 = `menuOpen`；`.menu-btn` 大小屏都在右上角。z 序：遮罩 44 < 抽屉 45 < 菜单钮 46 < 面板 50；toploader zIndex 70。
- ⚠️ 抽屉里是**一份清单不是两摞**：compact 时两容器都 `display: contents`，靠 `.entries .X { order: N }` 交错；「行」那条规则特异性比 `display:none` 高 ⇒ 排除项必须写进 `:not()`。藏三类：`.rail-desktop`、`.rail-account`、`.top-games`。
- ⚠️ 每行 = 图标 + 文案：`span.row-label` 只加 rail、`span.row-icon` 只加 top-links，大屏都 `display:none`（`.theme-toggle > span` 只能冲两个图标类）。
- ⚠️ 菜单钮图标是 **`MenuGlyph`**（ConsoleScene 内，三横↔叉），不在 `icons.tsx`；阴影走 **`filter: drop-shadow`**（**不能用 box-shadow**，会顶掉 `.pixel-edge` 描边）。
- ⚠️ 语言是**自绘下拉**（`.locale-menu`），非原生 `<select>`；点选项 `rememberLocale()` **先写 cookie 再** `router.push(altHref)`；抽屉里 `.locale-options` 改 `position: static`。⚠️ **盾牌钮那套已全删**别加回。
- ⚠️ 隐私/条款 `target="_blank"`；**「游戏列表」是当前页跳转**。点它时若房间有活（`roomBusy`）先弹 `leaveOpen` 确认框；「离开」是 `<Link href="/games">`（**没引 `useRouter`**）。Esc / 焦点收尾 / guest 键盘转发三处 effect 都带 `leaveOpen`。
- 抽屉点条目会收起（`.entries` 的 onClick 捕获），**只放过** `.locale-menu` 和 `.theme-toggle`。「电视机大小」弹层和语言下拉共用一条 pointerdown 收法；Esc effect 里也要带 `localeMenuOpen`。
- ⚠️ `.rail` 图标 `size` **必须 = 16**（非整数缩放会在 DPR=1 屏吃没细线）；按钮 16+6×2 = **28px**，对齐 `RailDivider` 的 `w-7`。
- ⚠️ `icons.tsx` 最小线宽 = **2px**；**唯一例外** `PlayersIcon` 头顶 4 条信号线（1px）。改完自查：`<rect>` 筛 `width<2||height<2`、筛 `x+w>16||y+h>16`。
- ⚠️ 「自定义按键」钮图标是 **`GamepadIcon`**不是键盘（`KeyboardIcon` 已删）；`keybind.open`「按键设置」≠ 面板标题 `keybind.title`「自定义按键」，**故意不同名**。⚠️ `WarningIcon` 感叹号**写死 `#08080a`**。

## 顶部加载条（nextjs-toploader 3.9.17）

- 参数固定：`color="var(--color-accent)"`（**能吃 CSS 变量** → 跟主题）、`showSpinner={false}`、`zIndex={70}`、`height={3}`。挂在 `app/layout.tsx` 的 `<body>`。
- 它只**听** document click + history 补丁 + popstate。`router.back()` 只有 done 不画条。
- ⚠️ **三处手动喊 `useTopLoader()`**（全站搜 `topLoader`）：① ConsoleScene 被 `leaveOpen` 拦下的那次点击 `done()`；② 语言下拉 `router.push` 前 `start()`；③ AccountCenter 退出登录 push 同。**`router.refresh()` 不能喊 start**。
- ⚠️ ①必须写在 **`leaveOpen` 的 effect 里**（包的监听也在 document，顺序不定）。⚠️ `useTopLoader()` 每渲染返回新对象 ⇒ 用 `useState(() => topLoader.done)` 冻结。
- ⚠️ **下载不能起条**：包把任何同源 `<a>` 点击当换页 ⇒ 条挂 99%。**下载一律走 `lib/download.ts` 的 `downloadFile(source, filename)`**（造链时 `stopPropagation`）；**别手写 `<a download>`**。调用点：`RomDownloadGate`、`lib/emulator.ts` 的 `downloadState`。

## 联机 / 手柄 / 街机

- **联机（1v1）**：wire 只传钮名 `{b,d}`；加入者按 1P 键组；toast 判据必须互斥，断开时 `onState` 连发两次 ⇒ `lastRole` 只在 role 非空时更新；房主暂停经 `z` 广播；`onPeerLeave` 必须带 `peerId !== state.peerId`；质量三档唯一出口 `QUALITY_SPEC`。**首页不写「仅局域网/需配 TURN」**。
- **手柄**：引擎 autoconfig 到 1P；两手柄按枚举顺序分 1P/2P；**单手柄永远落 1P**；映射表 `lib/gamepad.ts` 必须和引擎一致；切后台 `visibilitychange` 补 keyup。
- **街机 romset**：`fbneo` **按 CRC** 取 rom、名字不参与 ⇒ 「补名字」那步**只对老核心 `fbalpha2012_cps1` 有用**。缺 `neogeo.zip` / 版本对不上**界面不提示**（判据 `lib/bios.ts` 的 `looksLikeNeoGeoRomset`）。

## 彩蛋 / 挂画

- 逗猫棒 → `TvCat` 探头 2.9s（DOM 排在 `RoomDesk` 前）；挂画列表 `RoomBackdrop.tsx` 的 `PAINTINGS`，画名只在 i18n `painting.*`；「抽到哪幅」是 ConsoleScene 的 `wallPainting`。

## 详情页动作区

- **分两层**。第一层**四颗**实体钮 = 站内紧凑钮那档（`py-2` + 12px 字，**四颗必须同档**），`gap-2`：开始游戏（唯一 accent + `▸`）/ **联机游戏**（2026-10-14 加，→ `/play?id=`，灰钮 + `PlayersIcon` 16px）/ 收藏 / 下载 ROM。⚠️ 钮内文字符号一律 **`text-[15px] leading-none`**（**钮缩小 ≠ 图标跟着缩**）；`PlayersIcon` 走 svg 自带 16px，不加那层 span。
- 第二层无描边「图标 + 文字」链接：分享（`ShareIcon`）/ 反馈（`ReportIcon`），常态 `text-accent`，hover 只划字。两层间 **`mt-6` 不能收回**。⚠️ 「第一层别再塞第 4 颗」这条 2026-10-14 作废（联机游戏就是第 4 颗）；但**第二层仍然只有两枚、别加回描边**。
- ⚠️ `ShareIcon` 托盘上口**留开**（封上就成了「下载箱」）；16px 里**别画斜线**。`ReportIcon` = 空心气泡 + `!`。

## 评论 / 星级

- `components/GameComments.tsx`。**发评论必须先登录**（`readViewer()` 只验签名不查库，首屏就对）；列表公开可读，翻页只有「加载更多」。
- 表 `game_comments` **有作者**（`userId` **不许出网**，路由层换 `mine`）；`DELETE` **只认作者**，否则一律 404。**没有后台 tab、没有 status 位**。
- `rating` 与正文同条记录、**老库 ALTER 补的** ⇒ **刻意不写 CHECK**，1..5 只在 `POST /api/games/[id]/comments` 校验。
- **星默认满星 5**；字号 24/14/13px（只动字号与 `px-0.5`）；⚠️ 星是字符 `★`/`☆`，**处处带 `.star-glyph`**（否则按 `<html lang>` 挑兜底字体，中英大小不一），⚠️⚠️ **别再改成画出来的图形**（试过像素星，用户嫌马赛克）。
- 均分必须全量（`getGameRatingSummary` 单独 AVG/COUNT，**不许拿当前页 items 算**），显示数字不画半星。

## 反馈 / 收藏 / 开发商

- `ReportGameButton` **匿名提交**（`MAX_LENGTH=500`）；收藏数挂 `FavoriteButton`（`countGameFavorites` 刻意不缓存）。表 `game_reports`（**和留言本 `feedback` 别合并**：那个公开可读，这个只给后台）。
- **DDL 双份逐字一致**（`db/schema.sql` + 对应 `scripts/add-*.mjs`）已对真库跑过：consoles / game_reports / game_comments / comments-rating。
- **开发商库**：统一叫「开发商」；`developers` 表 + `games.developer_id` 外键；`lib/server/developers.ts`；后台 `/api/admin/developers`；前台 `/developers`；网格共用 `GameCardGrid`、分页共用 `lib/pager.ts`。

### 实体多语言（2026-10-16 侧表化）—— 两头各是什么形状

- 侧表三张：`game_texts` / `console_texts` / `developer_texts`（**`group_key`**|`console_type`|`developer_id` + `locale` 复合主键）。建表 + 搬数据 + `developers.source_slug` 补列 = `scripts/add-entity-texts.mjs`（games 的 `source_url` 同理走 `scripts/add-games-source-url.mjs`）。
  - ⚠️⚠️⚠️ **`game_texts` 的主键是 `group_key`、不是 `game_id`**（2026-10-16 同日再改；三张侧表里唯一不一样的那张）。一行 `games` 是**一盘 ROM**，同一款游戏的中英日韩四个版本就是四行、而文案只有一份 ⇒ 挂 `game_id` 等于把同一份文案存 4 遍（4 行游戏 × 4 语言 = 16 行），后台改一次标题要进四条记录各改一遍；挂 `group_key` 一款一份，改一次 = 改整款。
    - `group_key` 的**唯一出口 = `lib/server/games.ts` 的 `resolveGroupKey()`**（`insertGame` 内部调，接口层与后台表单**都不传**）：按「中文标题 `COLLATE NOCASE` + 机种 + 开发商」反查同款（`findGameGroup`），查到就复用、查不到才 `randomUUID()`。于是「批量导入四个语言版本」和「过两天手动补一个」自动归到同一款。**判重（`findGameDuplicate`）与归组刻意用同一套维度，改一处必须改两处。**
    - 读取**永远** `JOIN games g ON t.group_key = COALESCE(g.group_key, g.id)`（`COALESCE` 只是给迁移前老行兜底）；`loadGameTexts(ids)` 签名不变、返回字典仍**按游戏 id** 索引（同款几条拿到同一个引用）。搜索的 `EXISTS` 子查询同理 ⇒ 同款几条一起命中。
    - ⚠️ **改文案 = 改整款**（同款几条读同一份，是想要的效果）；⚠️ `deleteGame` 清文案**必须晚一步** —— 先删 games 行、再 `DELETE … WHERE group_key = ? AND NOT EXISTS (SELECT 1 FROM games WHERE group_key = ?)`，删早了会让还在库里的另外几个语言版本突然没名字。
    - ⚠️ **PATCH 不改 `group_key`**（改机种 / 换开发商会让签名变，但不重算 —— 重算的后果是「改一次机种，这一款散成两个组」）。
    - 迁移 = `scripts/add-game-group-key.mjs`（加列 + 归组回填 + 重建表 + 同款去重 + **旧表改名成 `game_texts_old` 留底、不 DROP**）；**旧脚本 `add-game-texts.mjs` 已作废**（文件头有警告，它建的是 `game_id` 主键的旧表 → 在新库上跑会让所有游戏都没名字）。
    - ⚠️ **动这块记得升缓存键版本**：`games:count` / `games:list` / `games:latest` / `games:by-developer` / `games:by-console` 全部已升到 **`v2`**（查询形态变了）。
    - 连带改过的脚本（都按 `group_key` 读写 + 同款去重）：`add-game.mjs`、`fill-games-description.mjs`、`fill-game-texts-ja-ko.mjs`、`fill-i18n-content.mjs`。
  - ⚠️⚠️ **这些迁移脚本一律「自带 `run()` 直连 D1 REST + `node --env-file=.env.local` 读 env」，绝不 import `lib/server/*.ts`**。`add-entity-texts.mjs` 第一版就是 `import { createRemoteDatabase } from '../lib/server/d1.js'` —— 那个导出**不存在**，脚本一跑就 `ERR_MODULE_NOT_FOUND`，**表从来没建出来过**，直到线上报 `no such table: console_texts` 才发现。照 `add-game-group-key.mjs` / `add-games-source-url.mjs` 抄。
  - ✅ **三张侧表 2026-10-16 已对线上 D1 建好并跑过迁移**：`game_texts` / `console_texts` / `developer_texts`。幂等靠 `INSERT OR IGNORE`（保护后台人工编辑），只 CREATE/ADD COLUMN/INSERT，不 DELETE/UPDATE/DROP。
    - ✅ **`add-game-group-key.mjs` 2026-10-16 已在线上跑完**：`games` 1258 行 → **1138 款**（`group_key` 零 NULL）；`game_texts` **5021 → 4541 行**（zh 1138 / en 1138 / ja 1134 / ko 1131），旧表在 **`game_texts_old`（5021 行）** 留底，确认后可清。核对结论：无一行丢失、每款都有中文文案。
    - ⚠️ 这个迁移**跑一次约 12 分钟**（上千次 D1 REST 往返），**必须后台跑**；中途 SIGTERM 无害（②只补 `group_key IS NULL`）。跑的时候**别并发跑改 `game_texts` 的脚本**（`fill-game-texts-ja-ko.mjs` 等）。
- **机种 / 厂商的日韩文案 = 写死的官方译名**（`scripts/fill-entity-texts-ja-ko.mjs`）。⚠️ 与爬上游的 `fill-game-texts-ja-ko.mjs` **不是一回事**，别混名字：
  · 机种名与厂商名是**专有名词、有官方译名**（ファミリーコンピュータ / 패밀리 컴퓨터、カプコン / 캡콤），**不该爬第三方站的机翻**；上游 `retrogamesnexus.com` 也**没有** `/ja/consoles`、`/ja/developers` 这类页面（实测全 404）。
  · 数据写死在脚本顶部两张表（`CONSOLES` / `DEVELOPERS`）；厂商键是 **`developers.id`（UUID）**。
  · 默认 `DO NOTHING`（只补缺、不冲后台人工编辑），`--force` 才 `DO UPDATE`；支持 `--dry-run` / `--only ja|ko`。
  · 已跑：`console_texts` 13×4 语言 · `developer_texts` 47×4 语言（四语言齐全，无缺行）。
- ⚠️⚠️ **补完侧表数据记得把缓存键版本 +1**（缓存条目不随部署失效）：`consoles:list` **v5** · `developers:list` **v4** · `developers:top` **v4**（2026-10-16 补日韩时升的）。`consoles:stubs` / `developers:stubs` / `developers:count` 不带文案，不用动。
- ⚠️ **数据层一律 `texts: EntityTexts`**（`Developer` / `Console` / `Game` 都是），**不按语言裁剪**（缓存键里没有语言）。前台取值走 `localizeDeveloper` / `localizeConsole` / `localizeGame`（= `lib/entity-text.ts` / `lib/game-text.ts` 的纯函数，**逐字段回退中文**）。
- ⚠️⚠️ **后台接口必须把 `texts` 摊成四语言扁平字段**（`name` / `nameEn` / `nameJa` / `nameKo` / `summary`… / `description`…）：后台表单一栏一个输入框。唯一出处 = `lib/entity-text.ts` 的 **`flatEntityTexts()` + `FlatEntityText`**，两个路由（`/api/admin/consoles`、`/api/admin/developers`）都 extends 它。**别再直接回 `Developer` / `Console`**（2026-10-16 开发商那条漏了摊平 ⇒ 后台列表整片空白：组件读 `developer.name` 拿到 `undefined`）。
  - 例外：**`/api/admin/games` 回的是 `texts`**（`AdminGames.tsx` 的表单自己拆四语言，另有 `zhText()` 取列表显示用的中文）—— 改 games 那条别照抄 consoles/developers。
  - ⭐ **后台「单独添加 / 编辑」表单 = 按语言分块**（2026-10-16 重构，`components/AdminGames.tsx`）：**公共区**（类型 / 年份 / 语言 / 开发商 / 封面图片）在上，下面 **`CONTENT_LOCALES.map` 出四个语言块**（每块 **名字 / 系列 / 说明**），ROM 在最底。文案 state 从原来的 12 个 `useState` 收成 **`texts: Record<ContentLocale, FormText>`**（用工厂 `emptyFormTexts()`，**不是共享常量**——`patchText` 是浅拷贝改写），`patchText(locale, key, value)` 改一格 ⇒ **加语言只改 `lib/game-text.ts` 一处**（以前是四个语言各手抄一遍、要动十几处）。中文那份**必填**（主名字 + 反查/判重的判据）。
    - ⚠️ 提交时两条路的键名不一样，唯一出处 = 同文件的 **`FORM_SUFFIX`**（POST 蛇形 `''`/`_en`/`_ja`/`_ko`）/ **`PATCH_SUFFIX`**（JSON 驼峰 `''`/`En`/`Ja`/`Ko`），都是 `satisfies Record<ContentLocale, string>`（加语言漏了会编译报错）。**改名要连着接口一起改**：`/api/admin/games` 的 `flatTexts()` 与 `[id]/route.ts` 里的 `patch`。**参数本身没变过**——`group_key` 是服务端算的，前端加什么字段都传不进去。
    - ⚠️ 「语言」下拉（= **这盘 ROM 是哪个语言版本**，进 `games.language`，判重的一维）与四个语言文案块（= 名字/说明**用哪种语言写**）**是两回事**，别合并成一栏。
    - ⭐ **保存后提示「已归入《XXX》」**：`insertGame` 的返回值多带 **`group: GameGroupInfo`**（`{ key, reusedTitle }`；`reusedTitle === null` = 这次新开了一款，不是出错），POST 回 `{ ok, game, group }`，后台拿它提示。配套改的还有 `findGameGroup` —— 现在回 **`{ key, title } | null`**（多带库里那个中文名，用于提示里的**已有写法**）。这是「中文名打错一个字（繁简 / 错别字）就另开一款、同一款文案从此存两份」**唯一能在当时看出来**的地方。
    - ⚠️ 客户端读 POST 响应体时 `res.json()` 要 `.catch(() => ({}))` 兜住：上传**已经成功**了，不能因为读不出 body 就让用户看到「上传失败」（会诱使他重传、撞上判重更困惑）。
    - ⭐ **同款盘数可见**（2026-10-16 加）：`listAdminGamesPage` 返回的 `AdminGamePage.games` 是 **`AdminGame`**（= `Game` + `groupSize`）—— 列表 SQL 里多带一列
      ```sql
      (SELECT COUNT(*) FROM games g2
        WHERE COALESCE(g2.group_key, g2.id) = COALESCE(games.group_key, games.id)) AS group_size
      ```
      相关子查询（**不是** GROUP BY / 窗口函数：那会把「多取一条判 hasMore」的分页形状搅乱；一页最多 100 行、子查询吃 `group_key` 索引，代价可忽略）。`attachTexts` 保序 ⇒ 按下标贴回每一行。后台拿它做两件事：编辑弹窗顶部提示「下面写的文案是这一款共用的 —— 库里还有同款 N 盘 ROM，保存后它们的显示一起变」（`N = groupSize - 1`，`N === 0` 时退化成「之后补其他语言版本时读的也是这一份」）；编辑保存成功后 `setPageNotice` 说「已保存 —— 这一款共 N 盘 ROM，文案已一起更新」。⚠️ 客户端**没有再发请求**：`editingGroupSize` 从当前页的 `games` 里 `find` 出来（每次保存后都 `reloadList()`，所以一直是最新的）。
    - ⚠️ `groupSize` **只在后台这条列表路径上算**（前台那几条列表不需要，别顺手加进 `Game`）。
- ⚠️ **写入时不做语言回退**：`game_texts.developer` 由 `games.ts` 的 `withDeveloper` 写、`developers.ts` 改名时级联，两边**同用 `rawEntityName(texts, locale)`**（只取该语言自己那份名）。回退是**读取**的事，写进去就看不出「这份到底翻没翻」。
- ⭐⭐ **游戏文案补日韩 = `scripts/fill-game-texts-ja-ko.mjs`（第二版）**：**先抓上游 `sitemap.xml` 拿 slug 全集**（2107 条）→ 候选**离线比对**，只对存在的 slug 发请求。候选三路 = `title_en` 规范化（**街机唯一的路**，`rom_name` 是 MAME 短名推不出来）+ `rom_name` 推导 + 词元模糊召回（前缀 / 差一字母，兜上游自己的拼写出入）。另外三个必备变形：**罗马↔阿拉伯双向**、`Alpha`→`Alpha Zero`、尾部 `-v5.7` 版本号。⚠️ 候选要**跨同款的多盘 ROM 合并**（哈希文件名那盘推不出 slug）。⚠️⚠️ 该脚本**运行时探测 `game_texts` 的主键列**（`game_id` / `group_key` 双形状）—— 迁移落地前后都能跑。结尾打印**没补上的清单**，那才是结论。
  - 2026-10-16 实测：`ja` 1012 → **1254**、`ko` 1011 → **1251**。残留 **7 款 = 上游确实没有**：4 款上游压根没收（`dynwar` 吞食天地 / `kof97pls` 拳皇97风云再起 / NES 松鼠大作战2 / 三国志街机中文改版）+ 3 款上游 **ko 页自己 500**（`touhou-puppet-play-enhanced`、`pokemon-amethyst`、`pokemon-evolved`，ja 已补）。
  - ⚠️ 已知遗留：`game_texts` 里 **HTML 实体残留**（`&#x27;`，`aboutText()` 的实体表不收数字实体），en 464 / ko 93 / ja 21 / zh 15 行 —— 首轮就存在，没动。
- ⚠️⚠️ **改开发商名要级联两处**：`game_texts.developer`（**前台真读的那份**，漏了 = 改名后卡片一张都不变）+ `games.developer/developer_en`（只写不读的旧快照）。⚠️ 2026-10-16 起侧表那条 SQL 要按 **`group_key`** 命中：`WHERE locale = ? AND group_key IN (SELECT COALESCE(g.group_key, g.id) FROM games g WHERE g.developer_id = ?)` —— 原来写的 `game_id IN (SELECT id FROM games …)` 已经不成立（那列没了）。⚠️ `writeDeveloperTexts` 必须「传进来的语言全空 ⇒ 删行（中文除外）」，`undefined` = 这次不管这个语言 —— 这两条原来混在一起，导致后台**清不掉**英文名。

## ROM 来源地址（`source_url`）与那批存量迁移（2026-10-16）

- **两列互斥**：`rom_url` = R2 对象 key（本站存字节）；`source_url` = 上游地址（`site:/…` / `files:/…`，**不含域名**，域名在 `lib/server/upstream.ts` 的 `UPSTREAM_ROOT`）。不存 ROM 时 `rom_url` 写**空串**（那列 NOT NULL），字节也**不在**本站。前台判据唯一一处：`app/api/games/[id]/rom` 的 `sourceFileUrl(row.source_url) ?? (row.rom_url ? publicUrl(row.rom_url) : null)` —— **来源优先**，所以两列同时有值也安全（这正是迁移可以分两步做的原因）。
- ⚠️⚠️ **`files` / `site` 两个 host 不可互换**（上游给相对路径的挂主站、给绝对路径的挂 files 子域，实测同路径一个 206 一个 404）⇒ 存 source_url **必须带 host 角色前缀**，只留 path 会有一半文件取不到。
- **迁移脚本 `scripts/fill-source-url.mjs`**（2026-10-16 跑过，一次性）：`--dry-run` 只读预览 / 默认只填 `source_url` / `--purge-r2` 删 R2 包 + 清 `rom_url` / `--all` 一把梭。台账 `source-url-migration-log.json`。
  - ⭐ **匹配判据是「文件名」不是「语言」**：`rom_name` 与上游 `fileName` 里的文件名一一对应；同款不同机种是**两个 slug**（`chrono-trigger` = SFC、`chrono-trigger-nds` = NDS），按语言挑会把 SFC 那份填给 NDS 那条。
  - 两条路：① `rom_name` 去扩展名 + 去尾部语言后缀推 slug → 抓 `/zh/games/<slug>` → 在 `fileName` 表里找同名（判据/锚点抄 `scrape-game` 的 `romsFromHtml`，改一处要改两处）；② 直探 `/games/roms/<rom_name>`（files → site）。
  - ⚠️ **删包前逐条复探已写入的 source_url**，探不通就跳过保留 R2；顺序**先删对象、后清列**。⚠️ R2 无版本控制，删了无法恢复 —— 以后写这类脚本照这个来。
  - 首次跑完：填 1238 · 删 1238（0 跳过）· 20 条找不到（文件名被改过的老上传 / 上游确实没收录）原样保留。
- ⚠️ **重跑时不用再动缓存**：`games:row-by-id` 已经在这次升到 **`v2`**（理由见 `lib/server/games.ts` 那段注释 —— 缓存不随部署失效，不换键旧条目会回源已删对象）。以后再改这两列的语义，**继续升尾号**。

## 实体多语言侧表与 `group_key`（2026-10-16，从 MEMORY.md 移入细节）

- 三张侧表：`game_texts` / `console_texts` / `developer_texts`。
- ⚠️⚠️ `game_texts` 挂 `group_key` 不挂 `game_id`：一行 `games` = 一盘 ROM，同款四版是四行、文案只有一份。
  - 键由 `lib/server/games.ts` 的 `resolveGroupKey()` 独家决定：中文标题（COLLATE NOCASE）+ 机种 + 开发商反查，查不到才新开 `group_key`。
  - **接口层 / 后台都不传 group_key**；判重与归组刻意用同一套维度、只差 `language`，**改一处必须改两处**。
- 读取一律 `JOIN games g ON t.group_key = COALESCE(g.group_key, g.id)`；`loadGameTexts(ids)` 签名不变、字典仍按游戏 id 索引；搜索里的 `EXISTS` 同理。
- 改文案 = 改整款（就是要的）；PATCH 不重算 `group_key`；`deleteGame` 清文案**必须晚一步**（先删游戏行再删文案，否则 join 找不到 group）。
- 动过就升缓存键：`games:count|list|latest|by-developer|by-console`，现全 v2。
- 迁移脚本自带 `run()` 直连 D1 REST、绝不 import `lib/server/*.ts`；`add-game-texts.mjs` 已作废。
  - ✅ 线上 2026-10-16 跑完 `add-game-group-key.mjs`（1258 盘 → 1138 款），旧表留底 `game_texts_old`。
- 后台接口：`texts` 必须摊成四语言扁平字段，唯一出处 `lib/entity-text.ts` 的 `flatEntityTexts()`（consoles / developers 两路由 extends 它）。**别直接回 `Developer` / `Console`**。例外：`/api/admin/games` 回 `texts`。
- 前台取值走 `localizeGame` / `localizeConsole` / `localizeDeveloper`（逐字段回退中文）；数据层不按语言裁剪、写入不做回退。
- 后台表单 `components/AdminGames.tsx` = 公共区 + `CONTENT_LOCALES.map` 四个语言块 + ROM；state 是 `texts: Record<ContentLocale, FormText>` ⇒ 加语言只改 `lib/game-text.ts`。
  - `FORM_SUFFIX` / `PATCH_SUFFIX` 是接口契约；`insertGame` 多回 `group`、列表行多带 `groupSize`。

## 机种资料（`/consoles` 与 `/consoles/[type]`）的来龙去脉

- 表主键就是 `console_type`：它是**资料的扩展不是清单**。行被删 ⇒ 前台退回 `CONSOLE_LABEL` 默认渲染，**专题页永不 404**；后台**没有**「名下有游戏不许删」的拦截，DELETE 的语义就是「重置成默认资料」。
- 首页「按机种浏览」只取**游戏数前 8**；`/consoles` 与 `/games` 的筛选条才是全量。
- 单条 `getConsole` 不缓存、列表走 `listConsolesCached`；双语回退 `localizeConsole`；`lib/server/consoles.ts` **不许 import `./games.ts`**（会绕成循环依赖）。sitemap 只列有资料行的机种。
- 脚本：`add-consoles.mjs`（建表 + 占位，幂等）；`seed-consoles.mjs` 是一次性快照、**跑过别再跑**；`fill-console-images.mjs` + 源图补图（只填 NULL，`--force` 才覆盖）。
- 机种图 = R2 `images/consoles/<机种>-pixel.png`，写进 `consoles.image_url`；**正方形 PNG、必须透明底**。
- ⚠️ 动资料就升缓存键版本尾：`consoles:list` 现 v7、`developers:list` / `developers:top` v4。

## R2 存储的几个操作事实

- 控制台 Storage 是**日采样**（`r2StorageAdaptiveGroups`）、账单按每日峰值均摊 ⇒ 删了对象数字只会慢慢衰减。核「删没删」直接 `ListObjectsV2` 跟 D1 对账。
- 桶 `games` ~255 MiB，大头是封面 `images/`（1702 张 154 MiB）。
- 无版本控制，删 ROM 永久丢 ⇒ 别拿生产数据做删除类测试。

## 目录来源开关 `CATALOG_SOURCE` 与上游数据层（2026-10-19）

- 需求演进：最初是「D1 没额度时前台改吃上游」（自动判断），用户随后否掉 —— **改成环境变量说了算**，并且**默认就是源站**。
- 开关：`lib/server/catalog-source.ts` 的 `catalogSource()` / `usesUpstreamCatalog()`。`CATALOG_SOURCE=upstream`（默认）/ `d1`；大小写不敏感、认不出按默认、不报错。已写进 `wrangler.jsonc` 的 `vars`（`keep_vars: true`，仪表盘里改也认）与 `.env.example`。
- ⚠️ **为什么不做自动切换**（写进那个文件头的三条）：① 两套 id 不是一回事（D1 是 UUID、上游是 slug），中途切换会让评论/收藏/历史对不上；② 额度用没用完、何时恢复，代码只能猜；③ 自动切换只在出问题那天发生，本地和 CI 复现不出来。
- `lib/server/d1.ts` 仍保留 `D1UnavailableError` / `isD1Unavailable()` / 60 秒熔断，但**没有调用方拿它分支**了 —— 只用于「日志里分得清是 D1 挂了还是 SQL 写错」，以及 D1 挂着时别再反复重试。
- ⚠️ 只影响**前台读**：评论、收藏、历史、存档、账号、后台、所有写入路径照旧走 D1。
- ⚠️⚠️ **两个不能加判断的函数**：`getConsole()`（`/api/admin/consoles/[id]` 的 GET/PATCH 在用）与 `getDeveloper()`（`games.ts` 的 `resolveDeveloper` 在存游戏时反查厂名）。把来源判断写进去 = 源站模式下后台改不了机种资料、存游戏丢开发商。前台单条改走 `getConsolePageData()` / `getDeveloperPageData()`，并在 `lib/server/pages/console.tsx` / `developer.tsx` 的 `cached` 包里调用。
- 前台读路径的改法：每个缓存函数保留 `xRaw = cached(...)`，导出的 `x()` 先判 `usesUpstreamCatalog()` 再决定走 Raw 还是上游 —— **没有 try/catch 兜底了**（D1 出错就报错，这是刻意的）。`viaUpstream()` 只做「每个 label 在进程里打一次日志」，默认模式不该刷屏。
- 各函数在源站模式下的行为：`countGamesCached` 取上游总数（带 `developerId` 时 0）、`listGamesPageCached` / `listLatestGamesCached` / `listGamesByConsoleCached` 走上游、`listGamesByDeveloperCached` 恒空、`countConsoleGamesByLanguageCached` 恒 0（专题页据此藏掉语种条）、`getGameCached` 走 `getUpstreamGame(id)`（**id 就是上游 slug**）、`listConsolesCached` 走 `upstreamConsoles()`、`countDevelopersCached` 0、`listDevelopersCached`/`listTopDevelopersCached` 空、开发商/机种单条走上面那两个 PageData 函数。
- sitemap / 预渲染：`listGameStubsCached` 源站模式下读**上游 `sitemap.xml`**（`upstreamGameSlugs()`，24h 缓存，正则 `/games/<slug>`，少于 100 条视为结构变化直接丢弃），`createdAt: 0` = 不知道时间 ⇒ `app/sitemap.ts` 见到 0 就不写 `lastModified`；`listConsoleStubsCached` 按 `CONSOLE_TYPES` 枚举（专题页永不 404）；`listDeveloperStubsCached` 空（详情页会 404）。`gameStaticParams()` 源站模式返回 `[]`（每个 slug 要抓四份上游页，24 款 × 四语言 × 两个页面会把构建拖垮，改成按需 ISR）。
- `lib/server/upstream-catalog.ts` 解析细节（不变）：
  - 上游也是 App Router ⇒ 数据在 `self.__next_f.push([1,"…"])` flight 流里；解析 = 拼接片段 → 找 `"game":` → 括号配对切片 → `JSON.parse`。**别用正则整段抠 JSON**（转义引号会断）。
  - 列表/详情**按四语言各抓一份**拼 `texts`（`/zh` `/games` `/ja` `/ko` 都是真翻译，标题如「スーパーマリオブラザーズ」）。
  - ⚠️ `?console=` 吃的是**该语言页面的机种名**（`红白机FC`），不是 `nes` ⇒ 用 `CONSOLE_FILTER_LABEL`；带机种且无关键词时直接走机种专题页 `/zh/nes-games`。
  - ⚠️ `?search=` 只匹配本语言标题 ⇒ **有关键词时只取中文页**。
  - ⚠️ 上游 `numberOfItems` 搜索时恒 2110（不变）⇒ 优先取 flight 里 `"className":"font-semibold","children":N`（「共 N 款」），`numberOfItems` 只兜底。
  - `UPSTREAM_PAGE_SIZE = 18`（上游一页 18 款）⇒ 分页页数必须用 `data.limit`（`lib/server/pages/games.tsx` / `console.tsx`），写死 15 会算出 141 页、后 23 页全空。
  - 缓存 `['upstream:games-page'|'game'|'rom'|'consoles'|'slugs','v1']`，24 小时。⚠️ `fetch` 用 `next: { revalidate: 86400 }`，**不能用 `cache:'no-store'`**（会把详情页 ISR 拖成动态渲染）。
- 多语言 ROM（上游一支游戏带 `fileName` 四份 en/zh/ja/ko）：
  - `Game.romLanguages?: {code,name}[]` **只在回退数据里有值**；`fromUpstream()` 填。存 `{code,name}` 不存裸 string：**文件名必须用选中版本那份**，选中文 `.nes` 却拿英文 `.zip` 的名字会让 `unwrapRom` 误解包。
  - `lib/rom-lang.ts` 加 `romLanguageOptions(languages)` / `defaultRomLanguage(languages, locale)`（界面语言 → en → 第一份；≤1 份返空串）。
  - 详情页第一层四颗钮整体换成客户端组件 `components/GameLanguageActions.tsx`（`withLang()` 把 `?lang=` 拼进开始游戏/联机/下载），原因：**`?lang=` 若走 searchParams 服务端渲染会废掉详情页 24 小时 ISR**。同理下载页由 `RomDownloadGate` 收 `languages`/`defaultCode`。
  - `StaticPlay` 读 `?lang=`（只认 `GAME_LANGUAGE_VALUES` 短码）→ `PlayScene romLang`：ROM 地址拼 `?lang=`、`File` 名换成选中版本的 `name`、`load` 依赖补 `romLang`、`key` 加 `${lang}`。
  - `/api/games/[id]/rom?lang=` **只服务回退路径**（D1 正常时忽略）；`upstreamRomTarget(id, lang)` 里 `files:` / `site:` 两个 host **不可互换**（`absoluteUrl()` 保留原样，别擅自换 host）。
  - 回退来的游戏没有评论/收藏/举报（无 D1 行）⇒ 详情页 `upstreamGame` 时那几块不画，`countFavorites` 包一层 try/catch 回 0。

## `/play` 外壳与右栏（细节）

- 外壳 = `GamesShell`（`showHeader={false}` + `fill`，只有它用）；视觉与网站一致：描边 `pixel-edge pxw-* pxc-*`、屏里那层 `crt-*`（底永远黑）。「不要 room 的样式」= 别搬布景/电视机/抽屉/键帽。别给 `.screen` 挂 max-h。
- 资料条（封面 + 名字 + 机种/年份/开发商）**在顶栏水平居中**（`StaticPlay` 的 `PlayGameInfo` → `GamesShell` 的 `navExtra`）；右栏从按键设置开始。数据只在 `StaticPlay` 这一层取，别再在 `PlaySession` 里取第二遍。
- 右栏整栏收起（`PlayScene` 的 `sidebarOpen`，不落盘）：收起 = 面板 `display:none` + 40px 窄轨；`[data-sidebar='closed']` 那条网格规则**只能写在 `@media(min-width:1024px)` 里**。
- 收起钮两颗（靠 CSS 分工，都得留 `.play-sidebar-toggle` 类名）：展开时那颗在**面板标题条右端**、和「编辑」并排（`.play-panel-collapse`）；收起后 `aside` 的直接孩子那颗（窄轨）接班，否则没有任何东西能把面板叫回来。旧的骑缝钮 `.play-sidebar-seam` 已删，别加回。
- 右栏宽度唯一出口 `--play-sidebar-w`（240px，2026-10-22 从 280 收窄），工作区 / 顶栏线 / 网格三处都读它；`+ 18px` 是间距。
- 右栏只有**一块**面板（2026-10-22：按键设置 + 游戏控制合成一张，用户说「不要做两块」）：通栏标题条 + 键位段 + 通栏发丝线 + 控制段；内边距下在段上、不下在 `.play-panel` 上（否则标题条贴不满边）。键位表仍包在 `.play-keys` 里，触屏只藏这一段、控制行要留。
- ⚠️ lg 档 `.play-display` 的 `max-width` 是 `min(100%, var(--play-stage-width))`，别改回 `none`（否则 4:3 会顶穿视口）。
- 联机时右侧按键表锁 1P：`keysLocked = soloOnly || mode !== 'solo'` 一起管「不画 P1/P2 切换」+「取值锁 `bindings.p1`」；`KeyBindingsPanel` 可选 `online`。判据用派生的 `mode`，**不是 `netplayState.role`**。
