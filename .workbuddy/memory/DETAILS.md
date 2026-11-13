# nesLoad — 功能细节（`MEMORY.md` 的附表）

> 只放「改这块之前必须知道」的细节；总纲与硬约束见 `MEMORY.md`。

## Supabase / R2 / 部署补充细节（2026-10-20~22，自 MEMORY.md 移入）

- 全量爬取/回填模板 = `scripts/migrate-to-supabase.mjs`（上游**列表页** RSC 载荷一页 18 款带全部字段）；14 语种回填 = `scripts/fill-game-texts-locales.mjs`（postgres.js 连 `SUPABASE_DB_URL`：连接池跑完全程再 end、developer/series 行按 slug:locale 去重，两个坑都踩过）。机种文案回填 = `scripts/fill-console-intros.mjs`（只补 zh/en 空值、`COALESCE` 不覆盖人工编辑；切库时 console_texts 只搬了 name）。**机种介绍的文案本体只在 `scripts/console-texts.data.mjs` 一份**（2026-10-23 抽出来：之前 `fill-console-intros` 和 D1 时代的 `seed-consoles` 各抄一份，删内容时删一漏一）。介绍口径 = 全称 → 特色 → 代表作，**不写本站用什么核心跑**（用户 2026-10-23 要求全部删掉，`scripts/strip-console-core-notes.mjs` 是那次清库的记录，幂等）。
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
- ⚠️ **四处手动喊 `useTopLoader()`**（全站搜 `topLoader`）：① ConsoleScene 被 `leaveOpen` 拦下的那次点击 `done()`；② 屋里语言下拉 `router.push` 前 `start()`；③ 内容页顶栏 `LocaleSwitcher` 语言下拉同（2026-11-06 补，之前漏了 ⇒ 切语言条子不动）；④ AccountCenter 退出登录 push 同。**`router.refresh()` 不能喊 start**。
- ⚠️ ①必须写在 **`leaveOpen` 的 effect 里**（包的监听也在 document，顺序不定）。⚠️ `useTopLoader()` 每渲染返回新对象 ⇒ 用 `useState(() => topLoader.done)` 冻结。
- ⚠️ **下载不能起条**：包把任何同源 `<a>` 点击当换页 ⇒ 条挂 99%。**下载一律走 `lib/download.ts` 的 `downloadFile(source, filename)`**（造链时 `stopPropagation`）；**别手写 `<a download>`**。调用点：`RomDownloadGate`、`lib/emulator.ts` 的 `downloadState`。

## 联机 / 手柄 / 街机

- **联机（1v1）**：输入 wire 有两条 —— 老的钮名 `{b,d}`（兼容老客户端）和位图 `i` 里的 `{m}`（14 位，`BUTTON_BITS` **顺序即协议**；房主在会话包里带 `i:1`，加入者见到才切）；位图 250ms 心跳兜丢包，房主按上一帧 diff 注入；HOL 仍在（Trystero 只建一条有序可靠通道，库没有通道选项）。加入者按 1P 键组；toast 判据必须互斥，断开时 `onState` 连发两次 ⇒ `lastRole` 只在 role 非空时更新；房主暂停经 `z` 广播；`onPeerLeave` 必须带 `peerId !== state.peerId`；质量三档唯一出口 `QUALITY_SPEC`，码率按编码后像素数重算（`bitsPerPixel` **分档** 0.12 / 0.20 / 0.26，2026-11-12 从三档共用 0.11 拆开 —— 用户反馈「均衡太糊」，720p 上只有 2.5 Mbps），H.264 由 `preferLowLatencyCodecs` 钉在**首次协商前**。**首页不写「仅局域网/需配 TURN」**。
- **联机降延迟的三层（2026-11-12）**：① **降级策略分档（2026-11-12 实测推翻「三档统一 `maintain-framerate`」）** —— `maintain-framerate` 会让 Chrome quality scaler 一直缩分辨率去追 QP：源 744×557@60、BWE 还有 5.4 Mbps，编码输出只剩 **279×207**（`qualityLimitationReason: bandwidth`），加入者拉到 743px 显示就是 2.7 倍插值放大 = 糊。同一时刻换 `maintain-resolution` 立刻回到 744×557@57fps 且 reason=none，换 `balanced` 是 744×557@61fps。**抬 `maxBitrate` 到 25 Mbps 无效**，瓶颈不是上限。现在：`sharp`=maintain-resolution / `balanced`=balanced / `smooth`=maintain-framerate。验证口径：两端 `getStats()` 的 `outbound-rtp.frameWidth` 与加入者 `video.videoWidth` 必须等于房主画布宽度，**不是** `getParameters().encodings[0].scaleResolutionDownBy`（那个一直是 1，看不出 Chrome 内部缩放）；码率上限按像素算，**每档一个 bpp**（0.12 / 0.20 / 0.26，见 `QUALITY_SPEC`）；`contentHint` 分档（smooth=motion / balanced=detail / sharp=text）。② **音频别抢带宽** —— `tuneAudioSender` 压 32 kbps + `dtx=false`；`preferLowLatencyAudio` 包 `pc.setLocalDescription` 改 Opus fmtp 加 `stereo=0;usedtx=0;maxaveragebitrate=32000`（**Chrome 默认已给 `minptime=10;useinbandfec=1`，不用重复写**）。必须在 `onPeerJoin` 里装 —— `onActivate` 先写 `activePeerMap` 再回调，那时 pc 一定在，且视频那次是**第二次协商**（第一次只有 DataChannel），赶得上。③ **可观测** —— `lib/netplay-telemetry.ts` 只在 dev 打 `console.table`（`qualityLimitationReason` / `jitterBufferDelay÷jitterBufferEmittedCount` / `candidate-pair` 的 rtt 与 candidateType），生产第一行返回。**接收端 `jitterBufferTarget=0` 音频也要设**（音画共用一个时钟）。
- **码率上限必须跟画布尺寸走（2026-11-12，用户第二次反馈「还是太糊」的根因）**：`tuneVideoSender` 用 `track.getSettings()` 的宽高算 bpp，但建流那一刻画布还是 JSX 上的初始 **720×540**，RetroArch 要等核心起完、布局落定才把它改成实际尺寸。实测 1920 宽的窗口下画布 **1172×879**，而 `maxBitrate` 一直是 `720×540×60×0.2 = 4665 kbps`（`getStats().targetBitrate` 精确等于这个数），等于每像素只有 0.057 bit —— 这才是「糊」的真身，跟 `degradationPreference`（那轮已修好，`reason: none`、编码尺寸=画布尺寸）不是同一件事。修法：`NetplayController.watchVideoSize()` 每 500ms 比一次 `getSettings()`，尺寸一变就 `tuneStream()` 重压；`publishStream` 建流时先记一次当前尺寸，`unpublishStream` / `leave` 停表。**另：`balanced` / `sharp` 的 `maxHeight` 已改成 0（不再缩），`maxPixels` 兜超宽屏（2.1MP / 3.2MP），上限 12M / 20M** —— 以前写 720 是假设「画布大概 720 高」，画布一旦更高，编码端先缩小、加入者再放大，白丢清晰度。验收口径：`getParameters().encodings[0].maxBitrate` 必须约等于 `画布宽×高×fps×bpp`（截到档位上限），且 `scaleResolutionDownBy` 为 1。
- **逐帧推进（2026-11-12，结论：这条路走不通，rollback 搁置）**：入口确实在 `Module.Browser.mainLoop`（`Module["Browser"]` 是导出的；`func` = C 侧 `main_loop`，`runIter(func)` = 一次调用推一帧），但**能推帧 ≠ 能做出确定性重放**，三条实测把门关上了。① `mainLoop.pause()` 不能用：它只是 `scheduler=null`，`runner()` 末尾那句 `scheduler()` 直接抛异常、rAF 链断掉；`resume()` 走 `setMainLoop(..., noSetTiming=true)` 不会重新排 rAF，实测解冻后一帧都不走。② 档帧只剩字节码层的 `_cmd_pause`，而它是**排队命令**、落地时机跟着主循环走 ⇒ 同一段帧数用不同切分（1×6 / 2+2+2 / 6）跑出三份不同状态，`stepFrames` 追不平。③ 存档是唯一的状态通道（没有 `retro_serialize` 导出），`_cmd_save_state` **只在核心处于暂停态时才写文件**，写出来还是 RZIP 压缩的（每次大小差几个字节、无法按偏移比对），而且要再推一轮主循环才落盘；连拍十几次 `_cmd_load_state` 之后还会彻底写不出来（本会话实测过）。⇒ 双端模拟器的地基不成立，联机继续走「房主渲染 + 推流」。
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
- 表 `game_comments` **有作者**（`userId` **不许出网**，路由层换 `mine`）；`DELETE` **只认作者**，否则一律 404。**没有 status 位**。
- **后台 tab「评论」2026-11-06 加**：`app/admin/(panel)/comments` + `components/AdminComments.tsx` + `/api/admin/comments`（GET 全站列表 / DELETE 任意一条）。数据层是 `listAllComments`（全站、无 gameId 条件，**现查 `game_texts` 补 `gameTitle`**：中文优先→英文→其余 locale，无标题回 null 由前端退 slug）与 `adminDeleteComment(id)`（**不判 user_id**）。⚠️ 和作者删分成两个函数，**别给 `deleteComment` 的 `userId` 加可空口子**（那函数的全部价值就是「作者才能删」）。后台**显示真名**（认得出是谁），公开接口才走 `maskUserName`；后台仍然不吐 `userId`。删除走两次确认（同 AdminUsers 删号）。
- `rating` 与正文同条记录、**老库 ALTER 补的** ⇒ **刻意不写 CHECK**，1..5 只在 `POST /api/games/[id]/comments` 校验。
- **星默认满星 5**；字号 24/14/13px（只动字号与 `px-0.5`）；⚠️ 星是字符 `★`/`☆`，**处处带 `.star-glyph`**（否则按 `<html lang>` 挑兜底字体，中英大小不一），⚠️⚠️ **别再改成画出来的图形**（试过像素星，用户嫌马赛克）。
- 均分必须全量（`getGameRatingSummary` 单独 AVG/COUNT，**不许拿当前页 items 算**），显示数字不画半星。
- 🔴 **用户名出网前必须脱敏**（2026-11-06 用户：「不能显示用户的邮箱，截取 @ 前面的，中间改星号」）：站上的用户名**就是注册邮箱**（注册接口 `const username = email`），所以 `lib/mask.ts` `maskUserName()` 是唯一出口，目前只挂在 `app/api/games/[id]/comments/route.ts` 的 `publicItem()`（列表 + 发表都从这儿出去）。数据层 `lib/server/comments.ts` 刻意留真名（后台要看真的）。规则：只认含 `@` 的、丢域名、首尾各留 1 字、中间等长换 `*`（`alice@x.com` → `a***e`）。顶栏/账号中心显示的是**自己的**名字，仍未脱敏。

## 账号中心（`/account`）的 tab 与头像

- tab 有五个：收藏 / 历史 / 存档 / 评论 / 密码。id 与 `?tab=` 白名单唯一出口是 `lib/account-tabs.ts`（`AccountCenter` 里那份 `TABS` 只管 label，两处要一起改）。
- **「评论」tab 2026-11-06 加**（用户要求「看自己的评论」）：数据源 `/api/user/comments`（GET，`listUserComments` → `WHERE c.user_id = ?`，带 `gameTitle` 现查 game_texts），新的在前、加载更多；删除**复用作者那条 `DELETE /api/comments/<id>`**，不另开「我的删除」接口。空状态文案 `account.commentsEmpty`（18 份表都加了）；tab 标签借 `comments.heading`，没新增键。
- ⚠️ **这些 tab 的 GET 一律走 `AccountCenter.tsx` 里的 `getJsonOnce()`**（2026-11-06）：开发模式 `reactStrictMode: true` 会把 effect 故意跑两遍（挂载→卸载→再挂载），切 tab 时同一个接口**同时飞两条**、服务端多查一次库（生产构建本来只有一条）。`getJsonOnce` 按 URL 复用**还在飞**的 Promise，落地即删，不缓存结果。页头 `/api/user/profile` + 四个 tab 共用；别在组件里退回裸 `fetch` + `res.json()`。
- 🔴 **「资料」tab 2026-11-06 撤掉**（用户要求「隐藏资料 tab，点击顶部的头像可以上传图片」）：换头像 = **点页头那颗头像**（`<button>` + 隐藏的 file input，选完立刻 `POST /api/user/avatar`，结果报在名字下面那一行）。性别入口按用户原话「暂时不展示」——`PATCH /api/user/profile` 的 `gender` 仍在，只是没有 UI。`?tab=profile` 现在按白名单回落到收藏；**要恢复性别别把 tab 加回清单**，挂在页头或另起一屏。
- 「移除头像」那颗按钮随资料页一起没了：`DELETE /api/user/avatar` 接口还在、暂无入口。
- ⚠️ 头像那颗 `<button>` **不能加 `overflow-hidden`**：`.pixel-edge` 的四向描边是画在元素**外面**的 box-shadow，会一起被裁掉。要裁只裁叠在头像上面的那一层。
- 资料拉取失败现在报在页头第二行（原来那句在 ProfileTab 里；tab 撤了不移过来，页头会永远停在「载入中…」）。

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
- ⚠️ **键位表字号只许往上，别压回去**：动作名（`.play-key dt`）12px / `--side-text`；键值（`.play-kbd`）**12px / @600 / 边框 `--color-ink-600`**（2026-11-06，用户「文字太细了 不明显」——键帽底与面板底只差一档，边框用 `--side-line` 时几乎看不见，单笔画字母 @400 在 125% 下被抗锯齿洗成中灰）。颜色已是最深的 `--side-text`（浅色 #202020），**再想「更明显」只能动字重/字号**。
- ⚠️ lg 档 `.play-display` 的 `max-width` 是 `min(100%, var(--play-stage-width))`，别改回 `none`（否则 4:3 会顶穿视口）。
- 控制段行序**用户定过**（2026-11-06）：全屏 → 模式 → 暂停 → 重载 → 存档/读档 → 音量 → 屏幕尺寸。窄屏两列正好排成「全屏|模式」「暂停|重载」；DOM 顺序就是桌面右栏的单列顺序，**别按「暂停最常用」把后两行换回第一行**。
- ⚠️ **`.play-save-grid` 的 `column-gap` 必须等于 `.play-controls` 的 `column-gap`（≤1023 那档 24px）**：存档/读档内部也是两格、且横跨整行，gap 不一致时左格右缘会偏 (24−14)/2 = 5px ⇒ 磁盘图标比上面第一列那颗（全屏）多凸出来一点（2026-11-06 修）。lg 右栏那档没有外层两列，仍用 14px。
- ⚠️ **单列档（≤1023px）`.play-screen-area` 不带 `aspect-ratio`、自己铺满颜色**（2026-11-06）：屏幕被 `--play-display-max-width`（按视口高算）卡窄，按容器宽推的 4:3 比屏幕高，`align-items: flex-start` 把多出来的那截全丢在屏幕下方 ⇒ PC 小屏上「屏幕和游戏控制面板隔一大截」。用户定的终态：**画面尺寸不动，黑边铺满整列**（左右多出来的两截是屏幕黑边的延长）。底色分主题：**浅色 `#000`**（与 `.screen` 的 `bg-black` 同色）、**深色 `ink-950`**（同一天「黑暗模式背景不要纯黑」定的，纯黑矩形在深底上边界更刺眼）。高度交给 `.play-game-screen` 自己的 `aspect-ratio: 4/3`。
- 联机时右侧按键表锁 1P：`keysLocked = soloOnly || mode !== 'solo'` 一起管「不画 P1/P2 切换」+「取值锁 `bindings.p1`」；`KeyBindingsPanel` 可选 `online`。判据用派生的 `mode`，**不是 `netplayState.role`**。
- 房间卡 `inRoom` 时出现在右栏最上：房主才画「二维码 / 复制 / 分享」三颗（加入者的码是别人的，1 对 1 再发一遍只会把第三人请出去，见 `room-full`）。二维码（2026-11-10）编的是 `shareLink()` **同一条链接**，`qrcode.react` 收在 `components/RoomQr.tsx` 里走 `next/dynamic` 的 `ssr:false`（链接由 `window.location` 拼、服务端是空串；也只有点开才加载）。展开状态 `qrRoomCode` 存的是**房间码**不是 boolean ⇒ 换房自动收起。白纸底写死白、不跟主题翻。

## H5 游戏专栏 / FPS `toy-gunfight`（2026-11-12）

- 三个入口：`/h5`（专栏列表，ISR 604800）、`/h5/toy-gunfight`（游玩页，`generateStaticParams` 只有一条）、顶栏「游戏库」后面的 `H5`。`app/sitemap.ts` 两处。
- **和模拟器那套完全隔离**：不碰 Supabase / R2 / `lib/emulator.ts` / `lib/netplay.ts`。只复用 `generateRoomCode` 等三个纯函数 + `@trystero-p2p/mqtt`，**独立 `appId: 'nesload-fps'`**（改成 `nesload` 会和模拟器房间撞名）。
- 分层：`lib/h5/` 15 个引擎文件（除 `net.ts` 标 `'use client'`，其余无 React/DOM 依赖，服务端 import 安全）；`components/h5/` 8 个只管 React；页面只做取数与外壳。
- **零静态资源**：墙/船体/集装箱贴图运行时 Canvas 2D 画（`textures.ts`），人物与三把枪是 three 几何体（`character.ts` / `viewmodel.ts`），音效全 WebAudio 合成。`sprites.ts` 已删 —— 2D 帧画法别复活。

### 入口 / 载入（2026-11-13）

- 进游戏只有一条路：`ShipModeSelect` →（单人「开始战斗」/ 联机「创建房间」「加入房间」）→ **单人/建房** `ShipLoading` 载完直接开局；**加房**则是：点「加入房间」→ 阵营选择（此时还没载入，会话已连上所以人数实时）→ 选完 → 房主回执 → `acceptJoin()` 跑 `runLoad` → `finishJoin()` 用回执里的快照 `attachNet` 再 `startMatch()`。`ShipGameShell` 的 phase 是 `mode|loading|lobby|playing|menu|result`，初始 `mode`。
- 2026-11-13 的三次收口，主题都是**去掉「点完还有一页要选」**：①人机强度搬进单人卡（`Segmented`）；②建房/加房/名字/房间码/附近房间整块搬进联机卡（`ShipNetPanel` 的 menu 屏已删，只剩 connecting/team/error/left/ended）；③`ShipStartScreen.tsx` 已删，别再补任何中间准备页。设置挂模式页右上角（`mode.settings`）。Esc 菜单的「退出对局」= 回模式页（`switchMode`）。
- 联机意图走 `NetIntent = {kind:'create'} | {kind:'join', code}`：`enterMode(mode, intent)` 里 **create 走载入后 `startHosting()`**（prewarmAudio + phase→lobby + createRoom），**join 直接 `joinRoom()` 不载入**（`setPhase('lobby')` → 阵营面板）。所以**模式页上点的那一下就是最终决定**，中间没有面板。
- 🔴 **加房顺序：选阵营 → 载入 → 开局**（2026-11-13 用户要求）。`runLoad(canvas, seq, then)` 现在只负责「把引擎和枪模准备好」，跑完调 `then`，不再是写死的 `next: GameMode` 分支。回执比引擎早到：`pendingJoinRef` 暂存 `{id, snap}`，`finishJoin()` 建好引擎后立刻 `attachNet(session, id, snap)` + `startMatch()`；面板 z-20 在载入页 z-40 之下，所以 `acceptJoin` 先 `setNetScreen(null)`。房主撤了 / 被拒时 `handleNetStatus` 会 `loadSeq += 1` 作废流水线并回 `lobby` 露出错误面板，`finishJoin` 见 pending 为空也不再开局。
- 🔴 **加房的音频解锁点在 `pickTeam`**：载入被挪到回执之后，选阵营那一下是整条路里唯一还在手势窗口内的点击，所以那里直接调 `gameAudio.unlock()`（引擎可能还没建）。否则 Chrome 把 ctx 停在 suspended，开局没枪声。
- 阵营屏在**引擎还没建**时出现，背后没有场景 —— `ShipNetPanel` 加 `cover` prop（`!controller` 时为真）铺模式和页同款的甲板图 + 渐变。有引擎的对局中状态（left/ended/error）不铺，免得挡住冻结的战况。
- 大厅（房间列表）连接时机改成「联机页签一露头」：`useEffect([phase, mode, netRooms.length])` 里 `ensureLobby()` + 微任务点灯（`startRoomScan`），不再挂在面板出现上。
- 🔴 **载入取消用批次号 `loadSeq`**，不是布尔：载入页「返回」只改 phase，流水线还在 await 里；用布尔会在下次点按钮时被重置、旧流水线复活并建出第二个 WebGL 上下文。`switchMode()` 里 `loadSeq += 1` + `loadingRef = false`。
- 🔴 **引擎不在挂载时构造**：`enterMode()` → `runLoad()` 里才 `new ShipGame`。所以「返回专栏」离开页面不会白建一个 WebGL 上下文；切回模式页再进来也**不重建、不出进度条**（`engineRef.current` 判断）。
- 进度四段都是真节点：5%（先 rAF 两次让加载页画出来，否则同步建引擎把它顶住）→ 14%（建引擎，同步，进度会停在这一格）→ 52→86%（`preloadWeaponGlbs` 五个 GLB 逐个回调）→ 94%（等两帧，shader 编译落屏）→ 100%（停 `LOAD_TAIL_MS` 240ms 再切）。🔴 GLB 回调用 `prev.stage === 'weapons'` 守着 —— 8s 超时（`GLB_WAIT_MS`）之后迟到的回调不许把进度条拽回去。
- `preloadWeaponGlbs(onProgress?)`：计数器**每次调用独立**（任务由 `glbJobs` 共享），共用计数器会出现「第二次调用一上来 5/5」。超时后用程序化枪模开打，后台下完由 viewmodel 自己的 `then` 热替换。
- `leaveNet()` 现在回**模式页**（以前回开始界面），联机面板里的返回用 `mode.back`。`net.single` / `start.switchMode` / `start.eyebrow` / `start.settings` 这些键已删，`start.begin` 现在挂在模式页单人的主按钮上。
- 模式页 `z-30`、载入页 `z-40`；模式页要 `touch-auto`（父层 `touch-none` 会一路继承，矮屏滚不动）。
- 模式页整列 `max-w-[720px]`（原 980），页签 / 正文 / 开始按钮**合成一张卡片**（橙金顶条 + 1px `#3a4149` 外框 + 外层 1px 纯黑描边 + 大阴影）。以前三段各缩各的，窄屏下轮廓断成三截、跟甲板图分不开。页头（eyebrow / 标题 / 副标题）留在卡片外。
- 🔴 模式页背景**不压插画**：以前右下角放 `H5Cover` 打 25%，但那个 SVG 第一笔是铺满 320×180 的**不透明天空矩形**，缩到角落就是一块硬边补丁（用户直接问「为什么右下角有一小块背景图」）。现在只有 `repeating-linear-gradient` 细网格 + 74%/14% 的暖色辉光，铺满整屏、无边界，和 `ShipLoading` 同一套质感。要给这张页加画面感就加「铺满且渐变淡出」的东西，别再往角落贴带矩形底的插画。

### 手雷动作（2026-11-13）

- 两段动画，全部由 `player.ts` 的进度驱动、`viewmodel.ts` 只认 0..1：
  `grenadeCook`（按住左键前 0.22s 抬手，`GRENADE_COOK_LIFT`）、`grenadeThrow`（松手后 0.42s，`GRENADE_THROW_TIME`）。
  投掷曲线四段：起手（只有 G 有，从右下画外拔上来）→ 蓄力后拉（0.36 最满）→ 甩出（0.40~0.62 前下方砸出画外）→ 收手（0.66 之后整体乘系数抹回 0）。整段 `snap`（不走 damp）。
- 🔴 **根因**：`quickGrenade` 以前在同一个帧里 `switchTo('grenade', instant)` → 抛 → `switchTo(back, instant)`，手雷模型根本没机会上屏，玩家只看到原枪沉一下 —— 这就是「拉手雷缺动画」。现在改成 `throwReturn` + `advanceThrow()`：演满 0.42s 再切回，且切回那一下不覆盖 `previousWeapon`（Q 应回到拿雷之前那把）。
- `advanceThrow` 放在 `handleFire` 里、**早于切枪闸**（`switchTimer` 只管能不能开火，收尾本身要发起一次切枪）。
- 两条防呆：`throwGrenade` 里必须清 `cooking`/`cookTimer`（G 绕过松手分支，不清会在 0.42s 后凭空再扔一颗）；`throwTimer > 0` 时 `handleGrenadeCook` 直接 return；`switchTo` 里清 `throwReturn`（玩家自己换枪不该被抢回去）。
- 加入者：`mirrorSelf` 看到快照雷数下降就 `playThrowView()` 补演，`advanceVisual` 只推进计时器、**不发起切枪**（换枪仍由快照驱动）。捏雷抬手加入者没有（wire 里没有 cooking 位，没加标志位）。
- `viewmodel.ts` 的 `cookView` damp 22：松手那一帧 `grenadeCook` 从 1 跳回 0，直接用会让手闪一下。
- 没做：拉保险销的独立动作（雷模型的销/环不是独立 group）、投掷音效。

### 手雷的联机可见性（2026-11-13 下午）

- 症状：**加入者**扔雷，自己屏幕上看不见那颗雷飞出去，只有 1.4 秒后落地一声爆炸。房主那边一直正常（房主本地有完整投掷物模拟）。
- 根因：加入者**没有任何投掷物模拟**（谁的雷、飞哪儿、炸到谁全在房主算），而快照里从来没有「投掷物」这一行，`detonate` 只推了一条 `boom`。所以加入者只能看到爆炸，看不到球。
- 修法：`Snapshot.g`（**可选**字段，没人扔就不带）+ `GrenadeWire = [id, x, y, z]`（`encodeGrenade`）。房主 `buildSnapshot` 里按 `this.grenades` 铺；`Grenade.id` 由 `grenadeSeq` 发号（只增不减），加入者靠它认出「同一颗」。
- 加入者侧：`syncGrenadeViews()` 只在出现/消失时建删 mesh、位置只写 `target`；`updateGrenadeViews(dt)` 每帧 `damp(..., 30)` 追过去（60Hz 快照下一帧位移 <30cm，33ms 收敛就够顺）+ 装饰性翻滚（两端各转各的，不一致）。`syncGrenadeViews` 放在 `applySnapshot` 的**事件之前** —— 爆炸那一帧先撤球再演火球。
- 生命周期：`start()` / `stop()` / `detachNet()` / `dispose()` 统一走 `clearGrenades()`。不清的后果两条：房主在飞的那颗会跨局继续飞、继续炸；加入者的球会作为一团冻在空中的球留在回模式页的背景里。
- 为什么不发速度/引信：加入者不模拟弹道，两端各自积分只会越跑越偏，60Hz 的位置流本身就是最准的轨迹。加的是可选字段，老加入者不读它，**不升 `NET_VERSION`**。

### 菜单只认 Esc（2026-11-13）

- 🔴 暂停菜单的唯一入口 = 玩家按 Esc。浏览器在**标签页隐藏 / 窗口失焦时会强制退出指针锁定**，走的是同一个 `pointerlockchange` —— 以前不看来源，切个 tab 回来菜单就开着。
- 判据在 `input.ts` `onPointerLockChange`：解锁时算 `lostFocus = document.hidden || !document.hasFocus() || performance.now() - lastFocusLostAt < 500`（`lastFocusLostAt` 在 `blur` 里写），作为 `onLockChange(locked, lostFocus)` 的第二个参数；`engine.ts` 里 `lostFocus` 为真就**不弹菜单**。三条判据同时看是因为事件顺序在浏览器之间不一致，`document.hasFocus()` 可能晚于 `pointerlockchange` 才翻转。
- 失焦回来：不弹菜单，但 `locked` 是 false，`ShipGameShell` 照旧画「点击画面继续」提示（phase 仍是 `playing`），点画布由 `onMouseDown` 重新 `requestLock`。
- 菜单里的**房间号行**（2026-11-13）：`ShipGameMenu` 收 `net?: NetHud | null`（`hud.net` 原样传），联机局才画「房间号 + 复制」。复制的是**码本体**，`?shiproom=` 邀请链接仍归 HUD 左上角那个角标；因为这是主动点的入口，多了 `execCommand` 兜底（写法抄 `ShareGameButton`），复制失败静默（码还印在画面上）。文案键 `gamemenu.roomCode` / `gamemenu.copyCode`（`net.copied` 复用）。

### 击杀确认音（2026-11-13：采样 → 合成，别再加人声）

- 历史：合成人声六版全被否（滴滴/破锣/短叮/低频重击/哨声 formant）→ 2026-11-12 换 CC0 惨叫采样（`public/h5/audio/scream-*.mp3`）→ 2026-11-13 用户要求「改成自己合成的一个短暂的提示音」，**采样路径与两个 mp3 一并删除**，`public/h5/audio/` 目录也不存在了。
- 现行 `audio.ts` `bakeKill()`：0.22s、峰值归一化 0.9、出口 gain 0.8（feedback 总线 1.15）。结构 = 4ms 高通噪声「咔」+ 40ms 0.72f→f 上滑音（**相位分段积分**，直接写 `sin(2π·f(t)·t)` 会双倍频移）+ 非谐分音群 1 / 2.01 / 3.41 / 5.13（爆头多 7.1），越高的分音 τ 越小。爆头版基频高一个纯五度（A5 → E6）。
- **刻意不用「递进双音」**：等距两音听着像普通界面提示（旧史里被否的「滴滴」）。金属非谐分音 + 上滑音才像「叮↗」的确认。
- 两版都在 `schedulePrewarm()` 里提前烘好（枪声之后排），`killConfirm` 只做 `BufferSource + playbackRate`；连杀每杀抬半个音（封顶 4 个半音），每次 ±3% 变速。

### 渲染层（2026-11-12 当天大改：光线投射 → three.js）

> 起因：用户截图《穿越火线》「运输船」，要求真 3D。手写 WebGL2 版（`render3d.ts` 700 行 + `math3d.ts`）写到一半被「我记得有一些现成的库吧」问停，评估后**换 three.js 并删掉手写那版**。结论：这类场景的性能上限在 draw call 和填充率，不在引擎；three 的合批/裁剪/状态排序是现成的正确做法。

- `three@0.187` + `@types/three`（three 本体**不自带类型**，少装 `-D @types/three` 会报 TS7016）。只在游戏页的 client chunk 里，静态 import 即可（three 模块顶层不碰 DOM）。
- **坐标只在一处换算**：世界 `(x 东, y 南, z 上)` → three `(x, z, y)`。出现位置只有 `SurfaceBuilder.push()` 与 `updateCamera()`，别的文件不用知道。
- 关卡烘焙：40×26 格，按 **8×8 格分块 + 贴图分桶**合并成 BufferGeometry。每格贡献 ① 地面四边形（四角各算高度 ⇒ 楼梯是真斜面）② 实心体外露面（**邻居更高就跳过这一面**）③ 落差处的**裙边**（`TILE.skirt`），平台外沿再长一圈黄黑栏杆（`TILE.hazard`）。没有裙边，2.6 米的平台看起来就是一块悬空的布。
- 材质 `MeshLambertMaterial` + `DoubleSide`，光照 `HemisphereLight 0.82` + `DirectionalLight 0.52`（调出来的值，不是物理值；给到 1.5 就过曝）。**不开 shadowMap**，人物脚下用径向渐变圆片糊住浮空感。
- 像素比 `min(dpr, 1.75) × 画质 × 自适应系数`，帧时 45 帧采样一次（>19.5ms 降档 / <12.5ms 升档），**采样间隔内绝不 setPixelRatio**（会重建帧缓冲，抖着改比不降档还慢）。
- 旧的手写管线文件 `lib/h5/render.ts` / `math3d.ts` 已删。`math.ts` 补了 `clampPitch`。

### 枪（`viewmodel.ts`，2026-11-12 第二轮）

- 用户第二轮要求「枪也是要 3D 的啊 换弹动作呢」。此前枪是第一人称贴图（`sprites.ts` 的 `gunAk/gunM4/gunAwm`，400×300 画好再 `drawImage`），近看就是一张卡片。
- 现在是**独立 scene + 独立相机**（FOV 固定 55，不跟主相机的 ADS 变焦走）：主场景画完 `clearDepth()` 再画，所以贴墙时枪管不会插进铁皮。`renderer.autoClear = false`，每帧显式 `clear()`。
- 一把枪 = 二三十个 `BoxGeometry` / `CylinderGeometry` 零件，材质 `MeshPhongMaterial`（金属必须有高光，这是「真 3D」和「贴图」最直观的差别）。`frustumCulled = false` 全部关掉 —— 枪永远在视野里，算包围盒是白花钱。
- **枢轴放在机匣尾部**（握把上方）。后坐、换弹翻转都绕它转；绕枪身中心转会让枪口在屏幕上横移，像甩鞭子。
- 动画全部**按 `reload` 进度切**，不自己计时：0.16~0.34 旧弹匣落下 → 0.44~0.62 新弹匣升起 → 0.58~0.74 拍一下 → 0.68~0.92 拉栓。进度来自 `world.ts` 的 `reloadUntil`，所以改 `weapons.ts` 的 `reloadTime` 动画自动变长变短，联机两边时长也一致。
- 开镜到 86% 直接 `visible = false`（2D 遮罩接管）。真做镜片折射要一整套后处理，CF 里开镜也看不到枪。
- ⚠️ 枪口朝向靠 `WEAPON_OFFSET.yaw ≈ 0.19`（`atan(0.168/0.85)`）：枪在右侧 0.168 米、枪口在 0.85 米外，不转这一点枪口会一直指着画面右侧外面。
- ⚠️ `dispose()` 必须 traverse 释放每个零件的 geometry **并清空模块级材质 Map**。不清的话重新进游戏页会从缓存里拿到已 dispose 的材质，枪变成一片黑。

### 人物（`actor-view.ts`，2026-11-12 晚第三轮定稿：自建程序化士兵 —— 现行版）

- **GLB 路线已彻底删除**（`actor-model.ts` / `public/h5/soldier.glb` 均已删）。两轮外部模型先后被用户否掉：shanebrumback 士兵（太丑、敌我不清）、Quaternius Toon Shooter（卡通风与写实地图不搭，且引入「人机看不见 / 尸体站着走路」bug）。**SkeletonUtils.clone + AnimationMixer 方案在本项目里不 work，别再提议外部 GLB 人物。**
- 现行 = `actor-view.ts` 纯几何体拼装的士兵，**形体参考 CF（第五轮，2026-11-12 晚）**：四肢 CapsuleGeometry + 髋/膝/肩/肘球形关节；躯干 = 上粗下细变径圆柱（0.155/0.115）压 z 0.68 ⇒ 收腰倒三角；背心包胸腔 + 胸前三联弹匣袋 + 压扁球肩垫（宽肩）；球头 r0.11 + 球壳头盔（半球 0.55π + 外扩裙边）；髋 0.98（长腿比例）。真人肤色脸+眼条、人机戴面罩（clothDark 球头）。双手持枪固定姿势，**枪挂 body 不挂手臂**（双手 IK 太贵）。helper：`blob`/`capsule`/`part`。
- 🔴 **机械感被用户否掉（2026-11-12 第四轮）**：人机旧造型 = 金属头+单眼传感器+天线+琥珀自发光目镜，用户「太有机械感」。现行全部士兵外观一致（只露脸/面罩差异），trim 材质改哑光深色不发光，cloth/vest/gear metalness 压到 0~0.05。**别再加发光件/天线/金属头。**
- 枪按 `Actor.weapon` 换形（createActorView 第三参）：awm 长管+镜、shotgun 粗管、usp 手枪、默认步枪。
- 动画：走路摆腿+屈膝+body 起伏+站立呼吸；蹲姿 = damp 的 crouchT（`Actor.height<1.45`）压身+屈膝+前倾；开火 = `playFire()`（引擎 `onShot` 早退后 + `replayShot` 非自己分支，`actorViewOf(id)` 三张表找视图）→ recoil=1 指数衰减（枪身后顶+枪口上跳）；死亡 = 弹道倒地+余震+淡出（整组 quaternion 旋转，pivot 在脚底）。
- 配色（第五轮按 CF 做旧军服调过）：cloth 0 队 0x35597e 钢蓝 / 1 队 0x9c4530 锈红、clothDark 各自深化；vest 深橄榄 0x3a4034；全材质 metalness 0。色相保留敌我识别、饱和度压低（用户嫌高饱和「不搭」）。
- 🔴 **头顶标记已整体删除（2026-11-13）**：先是在 2026-11-12 把敌方（1 队）的红三角去掉（等于透视挂），2026-11-13 用户要求**连蓝方队友的也去掉**（「蓝色方人物上方的指示箭头去除了」）。`markerTextureFor` / `MARKER_COLOR` / Sprite 创建 / 死亡熄灭 / 淡出联动 / dispose 全部移除。**敌我识别只剩阵营色布料这一层，别按「只给队友挂」加回来。**
- `TeamMaterials` 有 7 个槽位（cloth/clothDark/vest/gear/skin/gun/trim），模板按「阵营+造型」缓存、逐视图 clone（transparent 预开，防淡出瞬间 shader 重编译）。

### 人物（历史：shanebrumback soldier_rigged 第一轮 / 旧 Box 造型 —— 均已弃用）

- 演进：Y 轴 billboard 广告牌 →（第二轮）球头 + 胶囊四肢的 Q 版小人 →（第三轮）**6.4 头身写实士兵**。第三轮起因：用户「不要 q 版画风」。
- 现在：`HEAD_R 0.108` 的头 + 半球头盔（带帽檐）+ 护目镜 + 战术背心（三个弹匣袋）+ 背包 + 护膝 + 军靴 + 两段式四肢（髋→膝→靴 / 肩→肘→手），一把简化步枪挂在**右肘末端**（不是肩上，挂肩会在抬枪时飘到脸前）。总高对齐 `ACTOR_HEIGHT 1.72`。
- 配色：敌人深橄榄绿 `0x4a5344`（`BOT_PALETTE`），队友沙漠沙 `0x8b7f66`（`PEER_PALETTE`）。敌人头顶有红色倒三角 `THREE.Sprite`（`markerAssets()`），死亡时 `marker.visible = false`。
- 🔴 **改比例必须同步 `HEAD_Z`**：Q 版大头时头占 1.12 米以上的全部体积，写实比例下 `HEAD_Z` 还留 1.12 就会把**胸口**算成爆头（`world.ts` 按 `z - 脚下 >= HEAD_Z` 判头）。本轮一并把 `EYE_HEIGHT` 提到 1.58、`HEAD_Z` 提到 1.45。**这三处 + `character.ts` 顶部注释里的数字是同一组，改一处必须全改**。
- **几何体与材质全场共享**（模块级 `geometry()` / `material()` 缓存）。5 个角色 × 十几个 mesh ≈ 60 draw call，创建成本只是 `new Mesh()`。
- 上半身包在 `upper` 节点里：走路起伏必须**整体**抬（`upper.position.y`），只挪躯干会看到脑袋浮在身体上方。
- ⚠️ 四肢 `rotation.x` 用**正值**才是往前抬。肢体沿 -y 下垂，绕 x 正转把 `(0,-1,0)` 转到 `(0,-cosθ,-sinθ)`，z 为负 = 朝模型正面（-z）。写成负值双臂会向后抡。
- ⚠️ 靴子挂在腿关节上时**只能偏移 z**：关节已经在髋部的 x 上，再写一次 x 就跑到 -0.23 去了。
- ⚠️ 朝向 `rotation.y = -yaw - π/2`。模型正面做成 three 的 -z，绕 y 转 θ 后前向是 `(-sinθ,-cosθ)`，代入 `(cos yaw, sin yaw)` 解得 θ。yaw=0 时 θ=-π/2，前向变 (1,0) ✓。
- 扫地式判断速度：**用逐帧位移**（`moved / (dt*4)`）再 10/s 平滑，不用 `phase`。快照 20Hz 是跳着走的，直接拿瞬时值腿会抽；而 `phase` 在静止时也累加，分不出走没走。
- 影子挂在 `root` 上但每帧把 y 算回**地面**，并按离地高度缩小。材质全场共用，不能单独改透明度。

### 跳跃（2026-11-12 第二轮）

- 用户：「现在还不支持跳跃」。`InputCommand.jump`（按住 = 连续跳，不是一次性动作）、`ActorState.vz`（只在本地模拟里存在，**不进协议**）。
- `JUMP_SPEED 5.0` / `GRAVITY 13` ⇒ 跳高 0.96 米、滞空 0.77 秒。平台 2.6 米，跳不上去，必须走楼梯。
- 🔴 **`blocked` 只挡「向上」的落差**（`levelAt - z > MAX_STEP`）。以前用 `Math.abs`，人一离地脚就比地面高，绝对值立刻超限 ⇒「跳起来之后不能前后移动」。
- 🔴 **`onGround` 必须在水平移动之前算**。移动之后再算，从平台边缘走出去时脚下地面已变成 0，「站在地上」仍成立，`z` 会被瞬间贴到 0 —— 人是一帧掉下来的，不是掉下去的。
- 走出平台边缘会真的掉下去（以前 `Math.abs` 让边缘变成隐形的墙）。栏杆只是视觉，不再挡人。
- 🔴 加入者本地**只推进自己**（`if (!authority && id !== selfId) continue`）。远端实体全由快照驱动；本地再跑一次 `moveActor`，远端刚跳到 0.6 米就被本地重力拽回地面，看起来像原地抽搐。
- 触屏跳跃钮在右下，`onJump(down)` 按住才算。单击会因为「按键只活一帧」在低帧率下漏掉。

### 真 3D 的判定（比渲染更容易踩）

- 🔴 **`solidAt` 与 `bulletBoxAt` 不是一回事**：平台把 `FLOOR` 抬到 2.6 但 `HEIGHT=0`，`solidAt` 认为「没有实心体」（走路/渲染要用这个）；`bulletBoxAt` 返回 `[0, FLOOR+HEIGHT]`（弹道要用这个），否则子弹从平台侧面穿进去、地上的人能隔着台面打死楼上的人。
- 走路只认**落差**：`levelAt(目标) - 当前 z <= MAX_STEP(0.55)`（单向，见「跳跃」一节）。楼梯格 `RAMP` 存**格内低端**高度、`floorAt(gx,gy,fx,fy)` 按格内比例插值，所以脚下连续、能走上去；平台落差 2.6 直接成墙。
- ⚠️ `pushStairs` 的下降段 base 要减一格：`(h-step-1)*RISE`。写成 `(h-step)*RISE` 会让整段楼梯凭空高一级（当天就是这么错的）。
- 命中判定：眼睛出发的 3D 射线，先 `castRay` 拿墙的 3D 距离当 `maxDist`，敌人用「2D 圆求交 ÷ cos(pitch)」换算成沿射线的距离，再按 `z - 目标脚下` 判 `FOOT_Z..ACTOR_HEIGHT`，`>= HEAD_Z` 算头（**真的按命中高度算**，不再是概率近似）。
- 散布只抖 yaw/pitch，**后坐不改弹道**（视角踢上去是纯表现 `shakePitch`）；否则「准星指着人却打在地上」。
- 平台边缘的栏杆判定要比**同一条边**的高度，且 `isRamp` 的邻居直接跳过 —— 拿邻居的 `FLOOR`（低端）去比，会在楼梯口给平台围一圈栏杆把入口挡住。
- 机器人寻路用 `pathBlocked`（查 `solidAt` + `levelAt`），不要用射线探测：射线只看得见墙，看不见平台边缘，机器人会一路顶着边缘磨。

### 联机

- 主机权威（机器人只在主机跑、`checkMatchEnd` 只在主机）+ **各端本地判定命中**（`castShots(dryRun)` 发 `hitReport`，主机 `applyReportedHit()` 扣血）+ **加入者权威自己的位置**（`applyRemotePlayer()` 不二次校验）。主机 20Hz 快照、加入者 10Hz 输入，`JOIN_WAIT_MS 20_000`，严格 1v1（第三人收 `full`）。
- ⚠️ 快照必须走 `WireSnapshot` 短字段（`packSnapshot`/`unpackSnapshot`）：Trystero 的 `makeAction<T>` 要求 T 带隐式索引签名，直接传内部 `Snapshot` 编译不过；顺带把协议钉死。3D 之后 `WireActor` 多了 `zz`（脚下高度）和 `pt`（俯仰），`WireInput` 多了 `z` 和 `p`。
- ⚠️ `applySnapshot` 的实体列表以快照为准：**多删缺补**。`MatchRules` 也必须进快照，否则两边显示的目标人头数不一致。
- ⚠️ **换弹发的是状态不是按键**：`reload: self.reloadUntil > world.time`（10Hz 发包，按键只活一帧）。
- ⚠️ `net.ts` 里 `@trystero-p2p/mqtt` 必须 `await import()` 动态引入（顶层 import 会在 SSR 炸）；`open()` 开头先探 `crypto.subtle` ⇒ `insecure-context`（局域网 http 直连会命中）。
- ⚠️ 指针锁定：`InputController.onPointerDown` **只认 `event.target instanceof HTMLCanvasElement`**，否则点菜单按钮会被抢走指针。全站唯一 `Esc` 语义不变（这里开游戏菜单）。🔴 H5 **没有暂停状态**（2026-11-12 用户定案：联机不能暂停、单机也取消）：Esc 放锁只弹菜单（ShipGameMenu），世界照常跑，只有本机输入走 `frozen` 归零；引擎里是 `menuOpen` + `onMenuChange`，别把冻结世界的 pause() 加回来。
- 🔴 **加入者不跑 `Player.update` ⇒ `onWeaponChange` 钩子不走**（2026-11-12 晚修）：`mirrorSelf()` 必须检测武器变化并 `viewModel.setWeapon()`、主武器写回 `player.primary`（守卫 `isPrimaryId()` 在 types.ts），否则买枪/切刀/切雷后第一人称还是旧枪模型。加入者侧尸体淡出同理要自己在 `updateGuest` 补（时间轴同房主 `updateBotViews` 的 BOT_CORPSE_LIFE/CORPSE_FADE）。已知残留：加入者自己的 AWM 拉栓/近战挥刀动画、第三者打肉声不同步（协议无此事件，刻意不动）。
- 🔴 **加入者「巨卡」根因 = 自己的移动零预测**（2026-11-12 深夜修）：输入上行→房主模拟→快照回来→阻尼，端到端 150~250ms。修复三件套：`SNAPSHOT_HZ` 20→30（protocol.ts，约 0.7Mbps）；`mirrorSelf` 阻尼目标沿快照速度外推 `SELF_POS_LEAD=0.08s`（抵消管线延迟，残余 ~25ms；输入断流时速度位归零自动收敛）；复活帧位置直接就位。`updateGuest` 给 `applySnapshot` 传真实 dt（原固定 1/60）。**电流声没有代码级声源**：audio.ts 全部节流（枪 30ms / 脚步 45ms / 弹着 30ms）且枪声预烘焙，单声源不可能连成蜂鸣；复现时先查环境（蓝牙耳机、机器负载、quality 档位），别往合成器里找。
- 🔴 **加入者「连续一卡一卡」根因 = 死区对账骑边界**（2026-11-13 两轮修，演进史全文在 engine.ts 文件头 `SELF_*` 注释）：初版死区 0.25 与「跑速×管线 ≈0.28m」同量级 + 只在快照帧拽 → 60Hz 锯齿直上相机；第二版改「快照沿速度外推 + 差分估 vy」结果在台阶上**自激**（跨级快照 y 瞬跳 0.3m → 假 vy 18m/s 夹 ±7 → 外推目标抬高 0.6m 踩破就位阈值 → 上下瞬移循环，且就位挪基准让差分反号 —— 用户实测上楼梯狂抖、靠船体停稳即恢复）。🔴 **教训：快照 y 差分 vy 对离散跳变不可信，绝不进外推/就位判定。** 现行版：无外推，目标 = 裸快照位置；死区 = 0.15 + 0.08×快照速度（盖管线漂移）；垂直只有硬就位（裸 y 差 1.6m）无轻拉；estVy 超 12 估 0 不夹幅；就位不挪基准；`applySnapshot`/`mirrorSelf` 无 dt 参数。复活时基准复位（死亡期差分野 vy）。

### 打击感 / 真实感（2026-11-13，参考 CSGO）

用户：「增加真实感和打击感（增加感官刺激），比如连发开枪抖动，等等，参考 CSGO」。**这一批全部在表现层**，`aimYaw/aimPitch`（后坐、散布、伤害）一个数没动 —— 改的全是「看起来/听起来有多狠」。

- **连发累积 `Player.recoilBurst`**（0..1，`BURST_WINDOW 0.34s` 窗口、`BURST_PEAK 7` 发封顶）。唯一写入口 `registerBurstShot()`：单人/房主走 `handleFire`，**加入者不跑 handleFire**（`playLocalShotFeedback` 里直接调同一个方法）—— 两条路必须是同一份曲线，否则联机时自己和队友看到的抖动量不一致。
  `viewmodel.triggerKick(kick, burst)`：幅度 ×(1+0.45·burst)，**硬顶 2.6**（kick 直接乘 0.055m 后退量，再大枪托穿近平面）；连发再叠 27/19 rad/s 双频横摆 + 40 rad/s 前后 4mm 的枪机往复。
- **枪模回位改欠阻尼弹簧**（`advanceKick`，ζ=0.86，积分步长夹 1/30s）：一阶 `damp` 永远从正面逼近 0，像枪被一只手按回去；弹簧会过冲 ~4% 再落定。`triggerKick` 每次把 `kickVel` 归零，否则连发会把速度累加成越甩越远。
- **震屏从白噪声改成阻尼振荡**（`Player.shakeWave` = `sin(ωt+φ)·e^(-9t)`）：旧版每帧 `Math.random()`，帧率高时抖成噪点、帧率低时抖成抽帧。新波形帧率无关、有方向、可叠。
  `addShake` 只有在**新幅度 ≥ 当前**时才重置 `shakeTime` 与相位；更弱只取 max（否则连发每发重开，波形卡在第一个四分之一周期）。
  三个通道：yaw/pitch（0.03 rad）、`bobOffset` 位置（12/8mm）、roll（0.02）；频率 52/37/29/41/31 全错开。寿命 `SHAKE_LIFE 1.1s`（衰减在波函数里，不再 damp 套 damp）。
- **命中反馈**：命中别人 `addShake(爆头 0.2 / 普通 0.11)`，**60ms 限流**（`lastHitShakeAt`）；加入者侧 `hit` 事件同规则。`flushFeedback` 击杀再补 `KILL_CONFIRM_SHAKE 0.12`（这个常量以前定义了没用）。
- **敌人受击顿挫 `ActorView.playHit(head)`**：0.17s、平方曲线，身体后仰 + 头前点 + 持枪臂下沉，爆头幅度约 2 倍。本地 `onActorHit`、远端 `hit` 事件都接线。**只动姿态，不动位置/朝向**。
- **受击方向进镜头 `applyHitDirection`**：弹道在玩家右向量上的投影 → `addPunch(0, -side×1.2°)`。roll 不改变前向量，零瞄准代价。
- **弹头擦身声 `gameAudio.whiz`**：把玩家眼睛投影到弹道线段，最近点距离 <2.6m（`WHIZ_RADIUS`）才播，越近越响。房主在 `onShot`、加入者在 `replayShot`，两端同一套。合成 = 2.8k→620Hz 带通扫频 + 420→180Hz 低频，节流 50ms。
- **落地沉坠 `landDip`**：落速 >6m/s 起算，1.8cm→5cm 封顶，damp 9 回位，和 `stepLift` 一起进 `bobOffset`。原来只有 `addShake(0.14)`，只有「晃」没有「坠」。
- **横向移动侧倾 `strafeRoll`**：右向量点乘速度 ×0.014 rad（0.8°），只进 `viewRoll`。
- **枪模枪口补光**：`ViewModelLayer` 自己 scene 里一盏常驻 `PointLight(0xffb066, 0, 2.4, 2)`，强度 = `max(0,kick)×0.9`。主场景那盏 `muzzleLight` 照不到独立 scene；系数按主场景标定，再高枪身过曝。
- ⚠️ 既有遗留：`engine.ts` 的 `randInt` / `ACTOR_PITCH` / `ACTOR_YAW` 是未使用导入（3 条 lint warning），与本次无关。

### 改动入口

- 手感：`weapons.ts` 一张表（damage/interval/spread/kick/moveSpread/range/adsZoom/pierce/tone）。
- 地图：`map.ts` 的 `WALLS` / `PLATFORMS` / `STAIRS` / `BOXES` / `BARRIERS` / `CRATES` 矩形清单。**加删完必须核一遍出生点有没有被箱子压住**（`PLAYER_SPAWNS` + `BOT_SPAWNS` 八个点）。
- 加枪：`weapons.ts` 一行（含 `scoped`）+ `viewmodel.ts` 一个枪模 + `WEAPON_ORDER` + `ui-text.ts` 的名字键。加 H5 游戏：`catalog.ts` push 一条 + `FpsGameShell` 外挂分支。
- 文案两套：页面级 18 语言在 `lib/i18n.ts` 的 9 个 `h5.*` 键；**游戏内文案独立**在 `lib/h5/ui-text.ts`（zh / zh-TW / en，其余回退英文）。加键要同时改 `H5TextKey`。
- 设置存 `localStorage` 的 `nesload:h5-fps:settings`。UI 面板是**写死的近黑深色**（`#0f1318`），不跟站点 `data-theme` 翻。

## 只有 AWM 能开镜（2026-11-12 第三轮）

- 用户：「只有 awm 才支持开镜」。做成**单点开关** `WeaponSpec.scoped`（`weapons.ts`），ak / m4 为 `false`、awm 为 `true`。四个消费点全部跟着它走，**别在任何一处另写「是不是狙击枪」的判断**：
  - `world.ts` 移动：`if (input.ads && actor.spec.scoped) speed *= ADS_MULT`。
  - `world.ts` 散布：`const base = actor.input.ads && spec.scoped ? spec.adsSpread : spec.spread`。
  - `world.ts` 机器人：`input.ads = actor.spec.scoped && targetDist > 16`（拿步枪的机器人不会端枪减速）。
  - `game.ts` 相机：`camera.ads = spec.scoped ? this.adsValue : 0`；`adsTarget` 也先过 `spec.scoped`。
- 切枪回步枪时 `adsValue` 以 16/s 归零，不需要另写「强制退出开镜」。
- `viewmodel.ts` 读的是同一个 `camera.ads`，所以步枪自动不抬枪；`FpsHud.tsx` 的触屏镜按钮**只在 `spec.scoped` 时渲染**。

## CF 视觉规范（2026-11-12 第三轮）

- 识别点三件事：**直角无圆角**、**单一橙金强调色**、**面板顶部一道橙条**。
- 色值：近黑底 `#0f1318` / `#0e1114`、边框 `#343a42`、橙金 `#f0a020`（主）/ `#d29428`（比分条底）。`catalog.ts` 的 `accent` 也是 `#f0a020`。**面板底色写死不跟主题**。
- HUD 布局照 CF：顶部中段三块比分条（KILL / 目标 / DEATH，中间橙金实底）、右上击杀播报、**左下大号血量 + HP 条 + AP 条**（数字最大的是血量）、右下 40px 弹药 + 弹匣格（`flex-1` 自适应宽度，固定 px 会在 30 发的 AK 上拉出 150px 压到屏幕中间）、左上雷达、绿色四段准星带黑描边、CF 式狙击镜（圆外全黑 + 14px 镜筒 + 十字线 + 密位刻度 + 中心红点）、命中标记是准星四周四道斜线（击杀转红）。
- 组件：`components/h5/ui.tsx` 的 `GamePanel` / `PanelTitle` / `GameButton` / `Segmented` / `Divider` 是唯一样式出口，`FpsSetup` / `FpsRoomPanel` / `FpsSettingsPanel` / `FpsResult` / `FpsHud` 全部复用它们。改视觉只改这一个文件。
- `H5Cover.tsx` 是列表封面，重画成「运输船甲板一角」（阴天海面 + 四组集装箱 + 钢板透视网格 + 黄线 + 绿准星 + 底部压暗）。**不放人物**：缩略图尺寸下人形剪影比例必崩。

## 地图：CF 运输船（2026-11-12 第三轮 —— ⚠️ 布局已被第四轮重做，坐标失效，只留思路）

- `36×26` → **`40×26`**。长条形货轮，布局注释块里有一张 ASCII 平面图，改之前先看它。
- 三条进攻线：两条内通道（x 12..14 / 25..27，正对出生舱门洞）+ 两侧船帮走道（x 1..4 / 35..38，舱壁**故意不封**）。中央高台 `PLATFORMS = [{x:18, y:12, w:4, h:2}]`，南北各一段 `STAIRS`（3 格）。
- 集装箱**必须纵向摆**（六列，x 5/10/15/23/28/33）。横着放会把货场切成一条条横沟，三条线全断。`BARRIERS` 四组水泥墩补内通道掩体，`CRATES` 在出生舱与内通道中段。
- 出生点：`PLAYER_SPAWNS` `(13.5,3.5)` yaw π/2、`(26.5,22.5)` yaw -π/2；`BOT_SPAWNS` 六点（两端 x 7.5/32.5，船帮 x 2.5/37.5）。**挪完箱子必须回来看这八个点有没有被压住**。
- `textures.ts` 新增 `TILE.hull = 14`（船体钢板：深灰蓝 + 竖缝 + 横向加强筋 + 铆钉 + 锈迹流痕），`TILE_LAYERS` 随之 15。旧地图用的 `TILE.wallPanel` / `containerDoor` / `roof` 现在没人引用。
- 配色整体压成工业冷调（甲板 `#5b676c`、集装箱绿 `#4d5f47` / 蓝 `#3b5265` / 红 `#8f4438` / 橙 `#9a6432`）。天空 `#5e7c92`→`#c2d1db`、雾 `0xa8b8c4` + `Fog(42, 128)`（**地图加长后雾太近会让远端舱壁糊掉**）。

## 护甲（AP，2026-11-12 第三轮）

- `MAX_ARMOR = 100`（`weapons.ts`），`ActorState.armor`，出生与复活都满。HUD 左下 AP 条 + `HudSnapshot.armor`；联机走 `WireActor.ar`。
- 规则：步枪吃 **25%** 吸收，`amount < 60` 才吸 ⇒ **狙击穿透**（否则 AWM 一枪 100 会被拆成两枪，和 CF 里巴雷特一枪带走的手感不符）。
- `damage()` 里先扣 `armor` 再扣 `hp`；`toHp` 才是真正掉的血。改伤害表时注意这条会吃走四分之一。

## 地图：CF 运输船（2026-11-12 第四轮 —— ⚠️ 尺寸与坐标已被第五轮推翻，只留「为什么这么想」）

用户原话「不是cf运输船的地图」，第三轮那版被判不像。这轮先查了 CF 官方攻略，拿到三个结构特征再动手，不是凭感觉重排：

1. **两端是出生「舱」，不是露天出生点** —— 三面围合、只留门洞。玩家从舱里走出来才能看见货场，这一下就把「开局就被远处架枪」的体验改掉了。
2. **中央高台是「视野最好、身位最差」** —— 能俯看全场，但站在上面全身暴露、只有南北两个楼梯口可退。所以高台不能小，小了就成了一个纯送人头的台子。
3. **两翼贴船舷的窄走道能绕后** —— 让中路打不动的人有第三条路。

`40×26`，`map.ts` 文件头注释块里保留了 ASCII 平面图 + 三条进攻线的文字说明。

- **`WALLS` 12 条**：四周船体（`hull` 贴图）+ 两道舱壁各开三个口。北舱壁 `y=5` 拆成 `x0..3` / `x6..17` / `x23..34` / `x37..40`，中间留的是**大门 `x17..22`**（正对中央高台）与**两侧小门 `x3..5` / `x34..36`**；`y=20` 镜像。改门宽时**必须一起看 `BARRIERS`**：`y=6` / `y=19` 那两组水泥墩是正对大门放的，再往内挪一格就堵住楼梯口。
- **`PLATFORMS = [{ x:17, y:11, w:6, h:3 }]`**：6×3 的中央高台（第三轮只有 4×2）。南北各一段 `STAIRS`（`x18..21`，`y8..10` / `y14..16`，`rising` 一真一假）。高台面积决定了「上面能站几个人」，`4×2` 只够一个人来回挪。
- **`BOXES` 八条**：只贴船舷摆（`x4` / `x33`，`y7..10` 与 `y15..18`），加上内侧 `x9` / `x29` 两条中箱。**集装箱绝不摆到地图中线上** —— 摆中间会把 40 米长的货场切成一段段横沟，三条进攻线全断（第三轮就是栽在这）。
- **`CRATES` 带 `low?: boolean`**：新增 8 个矮箱（0.88 米，`pushSolid(x,y,w,h,tex,height)` 的高度形参）。矮箱是**踏板**不是掩体——跳上去能越过 1.25 米水泥墩的视线。`pushSolid` 第五个参数不给就是默认高箱，别在别处再手写高度。
- **`PATROL_POINTS` 九个点**：中路两个楼梯口、两翼走道、内线箱后、高台、两个出生舱。`roam()` 只认这张表。**别拿出生点当巡逻点**——机器人走过去会在舱里对着墙发呆。
- **出生点**：`PLAYER_SPAWNS` `(19.5,3)` yaw π/2 / `(20.5,22)` yaw -π/2（舱内正中，面朝大门）；`BOT_SPAWNS` 六点全在舱里或走道上（`x9.5` / `x30.5` / `x2.5` / `x37.5`）。**挪任何矩形之后必须回来看这八个点有没有被压住**。
- **没做地下船舱**：CF 运输船下层舱是真的，但 `HEIGHT` 只有一列、只能表达「这一格比地面高多少」，做不了负高度。真要做得把整张网格改成多层结构（`FLOOR`/`HEIGHT`/`solidAt`/`bulletBoxAt`/渲染分桶全要动），风险远大于收益，所以这轮明确放弃。这个判断写在 `map.ts` 注释里，免得下次又有人想加。
- 校验手段：写一次性脚本把矩形清单还原成 2D 网格，打印 ASCII 平面图 + BFS 连通性 + 八个出生点的遮挡检查。**按格中心取高度会把 3 格楼梯（每级 0.87 米）误判成墙**，必须按跨格边界取高度并复现 `floorAt` 的格内插值。结果：高台 18/18 格可达、两翼走道贯通、八点全空。脚本验完即删。

## 地图：CF 运输船（2026-11-12 第五轮 —— **现行版，坐标以此为准**）

用户嫌「不是 CF 运输船」，并且给了一个参考站点。参考站点是别人 one-shot 复刻的 CF 运输船，README 里写了它自己考据出来的结构：**长条甲板、两端船舱出生、中部 V 形斜放集装箱、两侧 L 形箱堆、左右各一条只能从己方出生点进入的集装箱管道、管道顶是可以架枪的二楼**。这五条就是这张图的识别点，照着排。

- 🔴 **尺寸 26×44**（原 40×26 完全错了）。`x` 是**船宽**（26 米）、`y` 是**船长**（44 米）。40×26 等于一块横着的方板，怎么摆都不像船；26:44 ≈ 真实比例的 1:1.8。改尺寸只影响 `map.ts` 与 `render3d.ts`（`MAP_*` 只有这两处引用），但阴影相机、雾、天空都要跟着复核。
- **两端船舱**：北 y 1..5、南 y 38..42，舱壁在 y=6 / y=37，各开**两扇门**（x 9..12、x 14..17），中间留 2 米实墙。CF 就是两扇门，不是三扇。
- **中路 V 形箱**（`V_BOXES`）：网格做不了真斜角，用**三块 2×2 沿对角线错位**拼一条斜带，左臂 (11,24)→(9,20)、右臂 (14,24)→(16,20)。尖端在 y=24..26，两臂之间留 **1 格缝**（x 13..14）—— 中间能钻过去，但只容一个人，蹲着最稳，这就是 CF 里被堵在 V 中间的死亡位。**尖端朝南、开口朝北**：从两个门出来看到的东西不一样。
- **两侧 L 形箱堆**（`L_BOXES`）：四个角各一组，5×2 的横箱 + 2×5 的纵箱在角上接起来。横箱切断中路直线视野，纵箱贴着二楼裙边造拐角。
- **沿舷二楼**（`PLATFORMS`）：x 1..3 / x 22..24，y 10..34，`FLOOR = 2.6`。南北各一段 3 格楼梯（y 7..9 rising / y 34..36 下降）。这是全图唯一制高点，对应 CF 里「管道顶那层」。**中间不能下来**：上去就得决定往前压还是绕回去，视野好但退路只有两个口 —— 和管道顶的代价一模一样。
- 🔴 **楼梯口那一格绝对不能放箱子**：第四轮我在 x=4,y=7 和 x=21,y=36 各放了一个木箱，结果两个楼梯全被 1.5 米的箱子堵死，二楼成了纯装饰。俯视图上完全看不出来，是连通性脚本报 `左舷二楼 0/3` 才发现的。
- **没做管道内部**（还是要写下来，免得下次又试）：`FLOOR` 每格只有一个高度，表达不了「地面能走人、头顶 2.5 米还有一层板」。硬做得把 `solidAt`/`bulletBoxAt`/渲染分桶/弹道全改成多层结构，风险远大于收益。二楼已经给了等价的玩法。
- **出生点**：玩家 `(12.5,3)` yaw π/2、`(12.5,40)` yaw -π/2；机器人四个在舱内 `(7.5|17.5, 3|40)`。**巡逻点全部落在地面层**：机器人是直线走向目标的，不会找楼梯，巡逻点放到二楼会让它们撞在 2.6 米裙边上原地抽搐。
- **校验脚本**（一次性，跑完即删）：把矩形清单还原成二维网格，打印 ASCII 俯视图 + BFS 连通性 + 出生点占用 + 各关键点可达。🔴 BFS **必须比较跨格那条边的高度**，不是格中心高度 —— 3 格楼梯每级 0.87 米，按中心算会把整段楼梯判成墙，得出「二楼不可达」的假结论。这坑第四轮踩过一次，这次又踩了一次。
- 结果：866 格可达、六个出生点全空且互通、八个巡逻点全可达、左右二楼各 3/3、V 中间缝可达、四扇门全通。

## 枪口对准准星（2026-11-12 第五轮 —— 上一轮的修法是错的）

- 🔴 **上一轮加的 `yaw = asin(hipX / muzzle)` 是错的，已删。** 它把枪口那个**点**拉回屏幕中轴，代价是整根枪管歪了 9.3°。玩家看的不是枪口那一个像素，是枪管的延长线 —— 而它现在指向准星左边一大片空白。翻遍 CS / CF / COD 的腰射构图，没有一个是把枪口拧到中线上的。
- 🔴 **正解是 `rotation.y = 0`：枪管平行于视线。** 枪管延长线的消失点自然落在屏幕正中，也就是准星；枪口因为位置偏右下而投影在准星下方，但它「指着」准星。这就是所有 FPS 的做法，靠透视而不是靠旋转。
- 于是只剩三个平移量要调：`HIP = { x: 0.15, y: -0.15, z: -0.52 }`。枪口落在准星右下约 8% 屏宽 / 12% 屏高，机匣压住右下角三分之一。`WEAPON_FIT` 里只有 `x/y/z`，**不再有 `muzzle`**，也不再接受任何角度参数。
- `HIP.z` 从 -0.40 推到 -0.52：AK 枪托在局部 z=+0.43，-0.40 时只剩 3 厘米余量，开火后坐再往后一推就穿过近平面（0.04），枪托会凭空消失一帧。连带的 `recoil` 的 z 分量也从 0.072 压到 **0.038**。

## 场景提亮（2026-11-12 第四轮）

用户：「地图太暗」。

- 🔴 **顺序不能反：先动贴图基色，再动灯。** 没开 tone mapping，只推灯会把甲板亮面直接烧到纯白（`MeshLambertMaterial` 没有 rolloff）。这轮贴图整体上一档：deck `#5b676c→#7d878d`、hull `#4a5765→#6a7684`、skirt `#3d4756→#586372`、barrier `#a8adb5→#bcc1c8`、crate `#b9853f→#c9964f`、concrete `#b6bac1→#cdd2d8`；四色集装箱同步（红 `#a85347` / 蓝 `#4a6a84` / 绿 `#5f7557` / 橙 `#b4783c`）。贴图提完灯只需小幅补。
- 天空与雾：`SKY_ZENITH '#6d8ca6'` / `SKY_HORIZON '#cfdce6'` / `FOG_COLOR 0xb9c8d4` / `Fog(48, 142)`（地图加长后雾的起雾距离也要跟着推远，否则远端舱壁糊掉）/ 背景渐变底 `#e0e9ef`。
- 光照三层：半球光 1.02 → **1.3**（提环境）、主平行光 1.05（带投影，见下）、反向补光 0.35（压死黑）。

## 实时阴影（2026-11-12 第四轮）

用户：「增加光影」。只给**一盏**平行光开投影，不是全场景开——合批之后阴影 pass 只剩几十个 draw call。

```ts
this.renderer.shadowMap.enabled = true;
this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sun.position.set(47, 32, 50);      // 仰角约 36°，不是顶光
sun.target.position.set(13, 0, 22); // 地图中心（three 坐标）
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
const half = 32;                    // 覆盖整张 26×44 地图
sun.shadow.camera.left = -half;     // right/top/bottom 同理
sun.shadow.bias = -0.0012;
sun.shadow.normalBias = 0.035;
sun.shadow.camera.updateProjectionMatrix();
```

🔴 **太阳压在 36°，不是顶光。** 顶光的影子缩在箱子脚下，等于没有；36° 时一串 2.7 米的集装箱在甲板上拉出 3.7 米的斜影，这才是「这张图有太阳」最直接的证据。改地图尺寸后 `sun.position` / `target` 必须一起挪 —— 光挪一个，方向就歪了。

🔴 两个坑：

1. **双面材质在阴影 pass 里会画背面** ⇒ 薄片（栏杆、裙边、黄线）投出正反两片、边缘发黑。必须对关卡材质设 `material.shadowSide = THREE.FrontSide`。
2. **改完 `shadow.camera` 的正交范围要手动 `updateProjectionMatrix()`**。three 的 `LightShadow.updateMatrices()` 只更新视图/投影矩阵的**内容**，不会重新算投影矩阵。

- 枪口光：`PointLight(0xffd9a0, 0, 12, 2)` 常驻（**不要每次开火新建**），`updateMuzzleLight()` 把强度设成 `recoil * 2`、位置取视线前方 0.9 米。常驻一盏 `PointLight` 会让所有材质多算一次衰减，但比每次 `new` + `dispose` 便宜得多。
- 低画质自动关：`settings.resolution < 0.99` 时 `shadowMap.enabled = false`，只在初始化判一次（`shadowReady`），不要在每帧里改 —— 运行中切 `enabled` 会让 three 重建 shadow map 纹理。
- 角色：`rig.root.traverse(o => o.castShadow = true)`，`receiveShadow` 不开（自阴影在这种低模上只会出噪点）。
- **集装箱顶面单独换贴图**（`CONTAINER_TEX` + `TILE.roof`）：四个立面是竖瓦楞，同一张图平铺到顶面，俯视就是一片竖条纹。站在沿舷二楼往下俯射时这个角度是常态，箱子会立刻显得像贴纸；换成 `roof` 的横向加强筋，俯视才有「一摞铁皮箱」的实感。木箱、水泥墩、船壳不走这条，它们顶面本来就没花纹。

## 蹲姿（2026-11-12 第四轮）

用户：「无法下顿」。**只降相机是不够的**，一共六处联动，全部收敛到两个唯一出口，别处不许自己乘系数：

- `types.ts`：`CROUCH_HEIGHT = 0.68`、`CROUCH_SPEED = 0.58`；`eyeHeight(crouch)` 与 `bodyMetrics(crouch)` 是唯一出口。`ActorState.crouch` 是 0..1 的插值量（既当表现状态也当判定参数），`InputCommand.crouch` 是布尔。
- **插值在 `moveActor()` 最前面**（12/s，差 0.002 就贴到目标值），这样物理和渲染读到的永远是同一个数。
- ① 相机：`game.ts` `camera.z = state.z + eyeHeight(state.crouch)`；② 射线起点：`world.ts` 同样用 `eyeHeight()`；③ 命中框：`bodyMetrics()` 给身高与头高，`candidates.push({ ..., head: body.head })`；④ 机器人视线与瞄高；⑤ 速度 `speed *= 1 - (1 - CROUCH_SPEED) * crouch`，**蹲着不给冲刺**（`crouch < 0.2` 才乘 `SPRINT_MULT`）；⑥ 散布 `stance = 1 - 0.35 * crouch` 乘进 `spread`。
- 联机：`WireActor.cr`（百分位整数），缺省当站着。
- 模型：`character.ts` 蹲姿叠加在摆腿之上，`stride = 1 - crouch * 0.75` 收步幅；髋 `-0.30 * crouch`、上半身**同一个数**（差 4 厘米就会看出上下半身脱节）、大腿 `0.96 * crouch`、膝 `-1.75 * crouch`。头顶红三角 `ACTOR_HEIGHT + 0.12 - 0.4 * crouch`。
- 输入：`C` / `Ctrl` / 触屏「蹲」钮（按住）。🔴 **`Ctrl` 必须在「带修饰键就放行」之前判**，否则 `event.ctrlKey` 会把它一起放过去：
  ```ts
  if (event.code === 'ControlLeft' || event.code === 'ControlRight') {
    this.keys.add('Crouch');
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  ```
- 🔴 **`CROUCH_HEIGHT 0.68` 反推出的 1.17 米身高，刚好低于 1.25 米水泥墩** —— 「蹲在墩后完全藏住」这个掩体价值是算出来的，改 `CROUCH_HEIGHT` 或 `BARRIER` 高度时两者要一起看。

## 枪口对准准星（2026-11-12 第四轮）

用户：「枪口和准星不太一条线」。

- **根因**：旧 `WEAPON_OFFSET.yaw = 0.17` 是照着「枪口 0.85 米」手填的常量，而 AK 枪口实际在 0.62 米、AWM 在 0.84 米。同一个角度套在三把枪上，短的必然偏右半个准星。
- **修法**：`WEAPON_FIT[weaponId].muzzle` 记下每把枪的枪口距离，`yaw = asin(pivotX / muzzle)` 反算修正角，再按 `(1 - ads)` 淡出（开镜时枪本来就回到中轴，不需要修正）。`HIP.x` 从 0.168 收到 0.1 —— 偏得越小需要的修正角越小，视觉上枪管越不歪。
- 加新枪只填 `WEAPON_FIT` 的 `muzzle` 一个数，不要再手调 yaw。

## 武器质感（2026-11-12 武器精细度轮 —— 现行版，以代码为准）

> 需求文档「武器模型精细度提升」：先做路线 A（材质渲染）再做路线 B（模型细节）。
> ⚠️ 本轮时代码已是 `engine.ts` 中枢的重构版（NeutralToneMapping 1.15，无 composer），
> 上面各节里的 ACES / SSAO / `map.ts` / `render3d.ts` 等描述均已失效。

- **路线 A = `lib/h5/weapon-textures.ts`（新增）**：金属/木纹/聚合物三类 PBR 贴图运行时 Canvas 画，零静态资源。底色**以灰度为主、上色靠材质 `color`**（一张金属图喂钢/铜/刀身）；法线由高度图中心差分生成；**ORM 三合一**（R=AO、G=roughness、B=metalness 恒 1，金属度仍由材质标量决定）。做旧 = 划痕（亮底+低粗糙+凹槽，三数组逐像素对齐）+ 污渍（高粗糙+AO 压暗）。🔴 三张图**统一 CanvasTexture**：DataTexture flipY=false 与 CanvasTexture 混用会让划痕与凹槽 V 向错位。🔴 模块级缓存**不要 dispose**：材质缓存不重建，清了重进游戏页枪全黑。
- **环境反射 = `engine.ts` PMREM + RoomEnvironment**（three 自带，无 HDRI 文件）：主场景 `environmentIntensity 0.3`（补反射不提亮）、枪模场景 `0.85`。🔴 **两个场景都必须给**：`dropped.ts` 与第一人称共享材质，只给枪模场景地上的枪会死黑 —— 金属度能从 0.35 提到 0.9 全靠它。枪模半球光 1.55→1.1（env 已补漫反射），另加暖色方向光 0.4 模拟手部反射。
- **路线 B = 程序化细节，不引外部 GLB**：AK 三段弯弹匣/机匣铆钉（小球）/准星护圈/斜切防跳器/导气管/拉机柄/托垫；M4 导轨横档/伸缩托三段/鸟笼消焰器开槽/抛壳窗；AWM 制退器侧孔/物镜+目镜镜片（glass 吃 env 反光）/调节旋钮/镜架/斜撑两脚架；M870 护木防滑肋/散热肋/弹仓帽；USP 套筒防滑纹/击锤/弹匣释放钮/扳机护圈；军刀缠绳四道 + **ExtrudeGeometry 双材质**（0=刀面 1=侧壁，侧壁用更亮 `edge` ⇒ 开刃高光线）；手雷保险环（Torus）+保险片+半壳接缝环。每把 ≤40 mesh，面数远低于 8k 预算。
- **换弹弹匣真拔插**：`ViewModel.magazine` 独立子组（ak/m4/awm/usp），`viewmodel.ts` 按 `reloadProgress` 驱动：0.06~0.32 easeInCubic 拔出下移 0.16m（到底隐藏=旧匣掉落）、0.52~0.8 easeOutCubic 新匣插入。进度来自 player，联机一致。
- **未做**（讲给用户听过）：外部 GLB 枪模（保持零静态资源+无版权风险）；第一人称手臂（程序化手容易丑，等用户定）；`ASSETS.md` 无需更新（无新外部资源）。
- **亮度风险**：主场景 IBL 0.3 会略提亮整体；用户嫌亮/暗先调两个 `environmentIntensity`，别动贴图。

## 武器模型 GLB 化（2026-11-12 晚 —— 现行版，以代码为准）

> 用户「枪模太粗糙，都是方块」→ 先提出三路线（几何升级 / 先改一把 / 外部 GLB），用户选「几何升级」后又追加「可以用三方或开源模型」→ 最终走 **CC0 外部 GLB + 程序化兜底**。

- **模型来源**：Quaternius「Ultimate Guns Pack」（poly.pizza 分发），**CC0 公有领域**可商用免署名。五把进 `public/h5/guns/{ak47,m4a1,awm,shotgun,usp}.glb`（各 50~130KB）。挑型实测（poly.pizza 缩略图逐把看过）：ak47=K2lXTYFSLC 木托弯匣 AK、m4a1=Bgvuu4CUMV 标准 M4、awm=ASOMZIErq3 绿托拇指孔狙击、shotgun=ZmPTnh7njL 木托泵动、usp=J3i9KDQ3kt 经典 USP。刀/手雷**仍程序化**（包里没有 kukri/手雷）。
- **itch.io 全站被沙箱代理 502**（styloo 的 CS 风格包拿不到）；poly.pizza / 3dassets.dev / opengameart 可达。直链规律：模型页 HTML 里有 `static.poly.pizza/<uuid>.glb`。
- **归一化三步**（`weapons.ts` GLB 一节）：GLB 原始朝向枪口 +x / 上 +y（五把逐顶点实测）→ `rotation.y=π/2` 转到枪口 -z → 按 `scale` 压到程序化包络长度 → `offset` 把枪管轴线对齐到 `MUZZLE_POS[id]`。枪口火光 / muzzleScreen / BASE_POSES 契约**零改动**，枪托落点偏差毫米级。配置表 `GLB_GUNS` 的数字来自顶点包围盒实测，别手调。
- 🔴 **`MUZZLE_POS` 是两条路共用的枪口表**（程序化分支 + GLB 归一化都对它），改任何数两条路都要验。
- 🔴 **`disposeWeaponModel` 见 `userData.shared === true` 必须跳过**：GLB 克隆与模块级模板共享几何/材质，dispose 会打穿模板（枪变黑），同 `materials()` 缓存铁律。
- **材质后处理** `tuneGlbMaterial`：Quaternius 全是无贴图顶点色材质 → 按材质名分派 wood/metal/polymer 的 Canvas PBR 贴图（法线+粗糙度+AO），底色保留 GLB 原色；🔴 **不挂 metalnessMap**（ORM 的 B 通道恒 1 会把聚合物变金属）。Glass 走低粗糙高金属高光。
- **UV**：4/5 的 GLB 无 TEXCOORD → `generateUv` 三平面投射（法线主导轴投影 ×8）运行时补，M4 自带的也统一覆盖。
- **已知妥协（用户知情）**：GLB 整块网格无独立弹匣/枪栓节点 → `magazine`/`bolt` 恒 null，换弹拔匣、AWM 拉栓零件动画退化为整体动作；USP 消音器由程序化 `attachSuppressor` 附加件补上（两条路共用）。
- **加载流**：`viewmodel.ts` 构造时 `preloadWeaponGlbs()`（幂等共享任务）→ 就绪前 `buildWeaponModel` 走程序化兜底 → 就绪后若手里还是程序化模型则 `swapModel` 热替换一次（phase==='ready' 才换）。加载失败**永久**回退程序化，不重试。
- 临时探针（GLB 解析/朝向分析）已删；`.tmp-glb/` 不存在了。

## 真实度轮：贴图 PBR 化（2026-11-13 晚 —— 现行版，以代码为准）

> 用户「h5游戏优化 增加游戏模型的真实度 现在的贴图看起来太假了」。根因不是面数、
> 也不是配色，是**整张图只有颜色**：板缝、波纹、木纹全是画在底色里的假阴影，光
> 的入射方向被烘死，跑动 / 抬头时表面毫无反应 —— 那就是「贴纸」的定义。

- **新文件 `lib/h5/surface-textures.ts`**：`Painter`（三并行数组：底色 / 高度 / 粗糙度，逐像素对齐）+ `TileNoise`（可平铺 fbm）+ 10 种表面。每种表面出三张图：`map` / `normalMap`（高度场中心差分）/ `roughnessMap`（灰度，three 取 G 通道）。
- 🔴 **不做 aoMap、不做 metalnessMap**：前者要 uv1（几何只有 uv0），后者 B 通道恒 1 只会把金属度顶满。做旧靠「颜色压暗 + 粗糙度拉高 + 高度压下去」三件一起改，这也正是旧版只画 canvas 做不到的。
- 🔴 **带 `roughnessMap` 的材质 `roughness` 必须给 1**：它是乘数，给 0.8 会把整张图的层次压平。
- 🔴 **UV 按真实米数铺**（这轮最大的结构性修复）：`level.ts` `fitBoxUv(geometry, w, h, d, tile)` 把每个盒子每面的 UV 乘成「面宽 / tile」，`tile` 来自材质 `userData.tileM`（surface-textures 的 `tileMeters`）。BoxGeometry 面序固定 `[+x,-x,+y,-y,+z,-z]`、每面 4 顶点。旧版所有盒子吃 0..1，同一张 128px 金属图既铺 1.1 米木箱又铺 10 米台面，纹素密度差十倍。
- 🔴 **端门三张贴图必须一起设 `repeat`**：几何 UV 按 2 米铺（2.6/2 = 1.3 个 tile），要用 `repeat = 2/2.6 = 0.769` 压回一面。three 每张贴图有独立 uvTransform，只压 `map` ⇒ 法线/粗糙度错开半根锁杆（这个坑已经踩过一次）。
- **集装箱六面材质数组**：`[side, side, roof, side, door, door]`（±x 是 6.1 米长边、±z 是 2.6 米端门）。端门是单独画的一整面：门框、中缝、四根锁杆 + 凸轮把手、三组铰链、四角角件、底部积灰。侧板是一个 tile 7 道波纹（间距 0.286 米），斜坡做窄（真实波深 36mm / 水平过渡 40mm），斜坡画宽只有二十几度、像瓦楞纸。
- **甲板**：2×2 米钢板错缝（左半列缝在 y=0/s，右半列错 1 米）+ 菱形防滑凸起（82mm 一颗、相邻排反向 45°）+ 焊缝 + 缝边长锈 + 油污（低粗糙）+ 掉漆。🔴 **旧的棋盘格已删**：`(x/64+y/64)%2` 那种 0.5 米明暗方格子是第一眼「假」的来源之一。
- **人物**：cloth 走**灰度四阶迷彩**（232/244/251/255）+ 织纹；vest 走 18 道 MOLLE 织带（每道 39mm）+ 压线；gear 走橡胶颗粒；skin 走极轻色斑 + 毛孔。色相仍由阵营色 `color` 染（一张图两队共用，敌我识别还是只靠色相）。🔴 迷彩平均亮度锚在 246，掉到 224 时阵营色会跟着暗一档。
- **天空**：512² 渐变 + 47 团云（两层：灰底 + 亮面，左右各画一份绕球面的副本）。🔴 **五个色标一个都没动** —— 天空球是 `MeshBasicMaterial`，它的亮度就是画面亮度上限，动它等于重调全局曝光。
- **亮度补偿**：钢系材质（hull/rail/steel/dark/crane/metal）的 `color` 各 +5~9%，因为贴图均值约 0.92 sRGB 会乘掉一档；集装箱五色 +4%（贴图底 246 而不是 255）。甲板 / 木板 / 钢板的颜色仍由贴图自己承担（`color: 0xffffff`）。
- **各向异性 8**（`finishTexture`）：甲板/船壳大量掠射角，旧值 4 在远处糊成一片灰。three 会按硬件上限 clamp。
- 🔴 **贴图是模块级缓存，永远不 dispose**（同 `weapon-textures.ts`）：材质每次 `buildLevel` 都重建，清了再进游戏一片黑。`Level.dispose()` 只 dispose 材质 + 天空图（天空是这份 level 自己生成的）。
- **去铁锈轮（2026-11-13 下午）**：用户圈了「墙上带铁锈的贴片、好几个颜色」。根因是同一份锈斑/锈水痕被染色多份（steel 染六色、集装箱染五色），墙上一看就是好几块颜色不一样的锈。🔴 **整图去铁锈，别再加回橙色锈**：steel 删锈斑 + 螺栓锈水，补漆面晒褪（大软斑）/ 漆面剥露裸钢 / 淡灰水痕；集装箱与端门的锈水痕全换中性灰污水痕（不带色相）。**甲板的缝边锈保留**（地板，用户点名好评）。
- 未做（讲给用户听过）：几何倒角 / 更多甲板杂物 / 海面波纹（舷墙挡住根本看不见，纯浪费）。

