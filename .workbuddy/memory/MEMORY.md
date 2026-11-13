# nesLoad — 项目长期记忆

> 只留**动手前必须知道的硬约束**；根因与历史见 `DETAILS.md`，来龙去脉见 `2026-*.md` 日志。
> 动手前先 `git status`；**不主动实测**：改完只做 typecheck + lint，讲清交给用户看。
> 碰「抽屉/入口、加载条、联机/手柄/街机、NDS-EJS 核、彩蛋、详情页动作区、评论/收藏、多语言侧表、`/play` 外壳与右栏、H5 引擎」前**先读 `DETAILS.md`**。

## 铁律

- 站名唯一来源 `lib/i18n.ts` `SITE_NAME`，文案写 `{site}`；**全站唯一键盘操作是 `Esc`**。
- 别动：`package.json` name、`nesload:*` 存储键、`nesload_locale`/`nesload_admin` cookie、`netplay.ts` `APP_ID`。
- 🔴 **UI 别自作主张大改**：用户说「太丑/重构」→ 先讲方案或只改最刺眼的一处，**等他点头再铺开**。
- 注释写「为什么」并含否掉的方案；临时探针验完必删。法务 `lib/legal.ts` 中英各一份，书面短句。

## 语言（18 种 × 界面与内容）

- 界面 18（`LOCALES` 照上游 hreflang，`LOCALE_OPTIONS` English 第一）＝内容 18（`CONTENT_LOCALES`）；后台表单只编 4 种（`ADMIN_FORM_LOCALES`），其余脚本回填。
- 加语言一次改完：`LOCALES`/`Locale`、新 `lib/i18n.<code>.ts`（逐键对齐）、`LOCALE_OPTIONS`/`LOCALE_PREFIX`/`SITE_NAME`/`HTML_LANG`/`OG_LOCALE`/`DATE_LOCALE`/`resolveLocale`、legal 两份、`CONTENT_LOCALES` + 回填脚本。短标签一律 `consoleLabel()`，URL/枚举永远 `nes`。

## 机种 / 核心

- `ConsoleType` 14 台，清单唯一出口 `lib/consoles.ts`；**服务端组件不能 import `lib/emulator.ts`**；14 台全走 `public/cores/`。CD 机种（PS1/Sega CD/PCE CD）架构未通。
- 包内层不在 `lib/unwrap.ts` 白名单 ⇒ 不拆 ⇒ 判街机错；世嘉裸 `.bin` 按文件头兜；指纹在 unwrap.ts/emulator.ts **手抄两份必须同步**。
- 机种优先级：`unwrapped.console` → `loadRom` hint → `detectConsole`；**别在 /play 路上为嗅探把 7z 字节包成 File**。
- 🔴 退出先 `dropContentFiles()` 再 `exit()`（MEMFS 的 ROM 不回收）；载入途中离开靠 `launching`/`exitRequested` 落地后补 exit。

## 数据库 = Supabase

- 读库唯一出口 `lib/server/pg.ts` `query()`，**走 HTTPS**（PostgREST→`public.exec_sql`）；游戏主键 = 上游 slug。🔴 **绝不在 Worker 直连 Postgres**（node:tls 断连）；只有 `scripts/*.mjs` 可直连。`SUPABASE_URL`+`SUPABASE_SECRET_KEY` 缺一全站 500。
- 文案侧表四张（game/developer/series/console_texts），主键 (slug, locale)；developer/series 名按 locale JOIN 现取。
- 🔴 前台读文案一律按语言裁：`textLocalesFor(locale)`（≤3 种），列表再加 `content:false`/`roms:false`；**不传 locale 就是全 18 种**，免费版 10ms 必爆。动过文案/图片必须升缓存键尾号；R2 换图传新键（-v2）。

## H5 游戏专栏（FPS `transport-ship`）

- `/h5` + `/h5/transport-ship`：写实军事风 FPS（CF 视觉：直角 + 橙金 `#f0a020` + 近黑 `#0f1318`），局域网联机 + 人机。**与模拟器完全隔离**（不碰 Supabase / R2 / `emulator.ts` / `netplay.ts`），独立 `appId: 'nesload-fps'`。
- 🔴 **入口 = 模式页，也是唯一的准备页**（2026-11-13）：`ShipModeSelect` 一张卡里放完所有选择 —— 单人卡（人机强度）、联机卡（名字 / 房间码 / 附近房间 + `ship-scan` 搜索标识），设置挂右上角。**点「开始战斗 / 创建房间 / 加入房间」即意图**（`enterMode(mode, NetIntent)`）→ 单人/建房 `ShipLoading` → 直接开局；**加房不载入**，直接进阵营选择（会话先连上，人数才实时），选完阵营 → 房主回执 → `acceptJoin()` 才跑 `runLoad` → `finishJoin()` 挂快照开局（`pendingJoinRef` 存 ack）。**没有第二道选择页**：`ShipStartScreen` 已删，`ShipNetPanel` 只剩 connecting/team/error/left/ended。phase = `mode|loading|lobby|playing|menu|result`。引擎不在挂载时构造；切回模式页再进来不重建。`leaveNet()` / Esc「退出对局」都回模式页。载入取消靠 `loadSeq` 批次号（不是布尔），否则旧流水线复活会建两个上下文。加房那一下的音频必须 `gameAudio.unlock()`（`pickTeam` 是唯一还在手势窗口里的点击）。
- 对局规则（模式 1v1/3v3/6v6、**结束方式 时长/人头二选一**、时长 5/10/15 分钟、人头 20/40/60）：唯一入口是模式页那四行 `Segmented`（两张卡共用）→ `engine.setRules`，`startMatch`/`restart` 在 `start()` 前同步。`MatchRules.teamSize` 决定席位数（`2×teamSize`，最多 12），**换档必须在非对局、非联机时 `rebuildTeams()`**；`SPAWN_X` 6 个位、第 0 位留给本机玩家。🔴 `MatchRules.endMode` 是**互斥单选**：模式页只渲染选中那一档的数值行，引擎 `checkMatchEnd` 只在 `kills` 判人头、主循环只在 `time` 递减 `timeLeft`（`kills` 走 `elapsed` 正计时），别再写成「先到先算」。联机由房主定，`Snapshot.m`（0 时长 / 1 人头，`NET_VERSION=2`）+ `Snapshot.k` 下发，且 `Snapshot.t` 语义随 `m` 变（剩余 / 已用）；计分板读 `hud.killTarget`/`hud.endMode`，**别读 React 的 rules**。结算页「返回」= 回模式页（`switchMode`）。
- 🔴 **2026-11-12 当天多次重构，旧记忆里的 `render3d/world/game/map/character/net.ts` 等文件名已失效**。现行：`lib/h5/` 以 `engine.ts` 为中枢（renderer/scene/主循环），`level.ts` 地图+关卡材质，`weapons.ts` 数值表+程序化枪模，`viewmodel.ts` 第一人称层，`player.ts`/`bot.ts`/`combat.ts` 玩法，`effects.ts` 特效，`actor-view.ts` 人物，`dropped.ts` 掉落枪（**复用 `buildWeaponModel` 与共享材质**）。改之前以代码为准。
- 枪模 = three 几何体拼装 + 共享 `MeshStandardMaterial`；**独立 scene + FOV 50**，主场景画完 `clearDepth()` 再画；`rotation.y` 恒为 0（枪管平行视线，靠透视对准星，别再给 yaw 修）。只有 AWM 能开镜（`WeaponSpec.scoped` 唯一开关）。`disposeWeaponModel` 只释放几何体，材质共享不能 dispose。
- 🔴 **联机输入纪律**（2026-11-13）：远端动作集合是**换出**不是 clear——`updateRemotePlayers` 里 `const actions = link.actions; link.actions = new Set();`，frame 持旧 Set 走到 `handleActions`；同一引用先 clear 再 update 会让跳跃/换弹/切枪全灭（真踩过）。音频预热：`unlock()` 挂 `schedulePrewarm`（枪声逐个宏任务烘）；构造期 `renderer.compile` 两个 scene 全量预编 shader（漏了的话加入者首帧撞特效编译 → WebAudio underrun 咔哒杂声）。
- 🔴 **房主的权威模拟不能只挂 rAF**（2026-11-13）：隐藏标签页 rAF 被浏览器彻底停掉，加入者会变成「能走、换枪没反应、打不死人」（切枪/换弹/命中/比分全要房主落账）。`engine.step(now, render)` 是唯一帧入口，`loop` 只负责 `step(now, true)`；房主后台靠 `stepWhileHidden()` 用**加入者的输入帧**当心跳补帧（DataChannel 不受计时器节流），`HIDDEN_STEP_GAP_MS=80` 保证 rAF 活着时这道门不开。同一处还把 `rawDt>1` 的停顿整体补进 `link.lastInputAt`，否则房主切回来第一帧会把一屋子人全判掉线。
- 🔴 **脚步声已整体移除**（2026-11-13 用户要求「不要这个功能了」）：audio.ts 的 `step()`/`bakeStep()`/`stepBuffers`/`STEP_*`、engine.ts 的 `updateActorFootsteps`/`stepTracker`、player.ts 的 `stepDistance` 全删；`schedulePrewarm` 只烘枪声。`Surface` 类型仍被弹着点/贴花/物理用，别误删。别再把脚步声加回来。
- 渲染 `NeutralToneMapping` + exposure 1.15（**不是 ACES**，ACES 压暗中间调被否掉）；高金属度材质必须有环境贴图，否则死黑。音效：**全 WebAudio 合成，无音频文件**；枪声 = **预烘焙 AudioBuffer**（2026-11-12 晚：`audio.ts` `bakeGun()` 逐样本 DSP，`GUN_RECIPE` 表六层 crack/blast/boom/sizzle/tail/mech + tanh 软削波 + 归一化；每发仅 1 个 BufferSource。历史：采样被用户否掉「枪声源都是不对的」→ 实时七层 biquad 仍嫌闷 → 烘焙版。**别再提议换采样、别把实时 biquad 版加回来**；调听感只动 `GUN_RECIPE`）。
- 🔴 **加入者没有投掷物模拟**（2026-11-13）：手雷的弹道/反弹/爆炸全在房主算，加入者只从快照 `Snapshot.g`（`GrenadeWire=[id,x,y,z]`，可选字段，不升 `NET_VERSION`）拿位置画球，`syncGrenadeViews` 只在出现/消失时建删 mesh、`updateGrenadeViews` 每帧 damp 跟随。**别给加入者加一份本地弹道**（两端各自积分必偏），也别把 `g` 换成「只发 spawn 事件让加入者自己算」。
- 坑与历史全在 `DETAILS.md` H5 各节（其中第三轮~第五轮的坐标/光影描述部分已被后续重构推翻，读时注意甄别）。
- 换枪资格唯一出口 `player.canChangeLoadout`（存活 + 复活 ≤ `LOADOUT_WINDOW`=5s + 本次生命未耗弹；只在 `handleFire` 扣弹匣处置 `ammoSpent`）；引擎在 openBuyMenu/selectPrimary/每帧菜单自检三处强制，HUD 字段是 `canChangeLoadout`（不是旧的 nearSpawn）。复活点唯一出口 `pickHomeSpawn(team, self)`（**所有人**—— 玩家 / 联机对端 / **人机** —— 只在 `level.spawns[team]` 己方最后面那 6 个位里挑，遮挡分层评分：先比被几个敌人看见、再比距离；玩家无偏移，Bot 叠 ±0.5 防重叠）。**全图撒点 `pickMapSpawn` 已整条删除**（2026-11-13 用户：人机也必须在自己家复活）；朝向 `spawnFacingYaw` 一次设齐。🔴 **复活没有镜头过渡**（`deathCam.end()` 当帧硬切回第一人称）：原来那段 0.45s 插值的起点是击杀者身后的观战位，途中会把交火区和敌人位置拖进画面，等于白送透视 —— 别再加回来。

## 主题 / 首屏 / 两台机器

- `<html data-theme>` 写入者只有 SiteDocument 的 `BOOT_INIT` 与 `saveTheme()`；导航丢属性由 BootAttributes 只补缺、不落盘。
- 🔴 深色灰阶是**冷调蓝灰**：ink-950 #181c26、900 #1e222e、850 #242936、800 #2c3241、700 #3d4457、600 #4a5061、500 #6a7080；400 及以上仍中性灰。改时整段平移、间距 6/6/8/16/14 不变；`--color-floor`/`--wall-top`/`--wall-bottom` 手抄值必须同步。`--color-crt-*` 与 `.screen` 永远黑。
- 桌面 RetroTv / 移动 HandheldConsole 判据 `<html data-mobile>`（device.ts + 内联脚本两份同步）；尺寸唯一出口 globals.css `--tv-*`。

## 路由 / 缓存 / SEO

- 目录页维度全是路径段（`/page/N`、机种、语种嵌套；搜索 `?q=`）；地址构造唯一出口 `gamesHref`/`consoleHref`/`pageHref`；**别加新查询参数**。
- 🔴 **无前缀地址永远是英文**，不按 cookie 307；cookie 只让 `LocalePrompt` 别重复问。
- 🔴 **三层缓存**：⓪ Workers Caching（`wrangler.jsonc`，只认响应头：整页 HTML 走 `withCdnHeaders`（`s-maxage` + **`Vary: RSC`**），其余 `noStore`）→ ① R2 增量（`cached()` 7 天 + 页面级 ISR `revalidate = 604800`）→ ② `worker.ts` Cache API（24h 兜底）。发版后自动清空，跑 `pnpm warm:edge` 回填。
- 🔴 **ROM 取字节**：区间走 `?span=start-end`；分片回 **200** + `X-Rom-Span`/`X-Rom-Total` + 准确 `Content-Length` + `?v=`，整包/探针/错误分支 `private, no-store`；`worker.ts` ROM 分支原样放行；**第 2 次重试必须换缓存键**（`&nc=`）。
- 🔴 **`/api/games/[id]` 必须读 `getGameFullCached`**，别改回实时查库（10ms CPU 被打穿 ⇒ CF 503）。
- 🔴 **下载页 HTML 与 id 无关**（`GameDownloadPanel` 客户端取，边缘缓存键折叠成 `/<locale>/__nesload_download`）：别把 id/逐页 title/canonical 加回服务端；下载钮必须是裸 `<a>`；代价 `noindex, follow`。
- 🔴 **`<Link>` 预取**：列表型与首屏动作型一律 `prefetch={false}`；全站没有 `loading.tsx`，预取只能整页渲染。
- 「我是谁」唯一出口 `lib/current-user.ts` `fetchCurrentUser()`。长文档页共用 `components/DocPage.tsx`；页脚免责声明唯一出处 `disclaimer()`。
- `/play` 唯一开局页；`/embed/games/<id>` 纯播放页 `noindex`。触屏手柄只有一条判据 `:root[data-mobile='on']`，**不按屏幕宽度判**。
- 存档 = 电池 `.srm` 一款一份。🔴 房间页永久下线（`app/[locale]/_room`）：别加入口、别读它。
- 🔴 功能开关唯一出口 `lib/features.ts`；`ROM_DOWNLOAD_ENABLED=false` 时下载钮不画、下载页 `notFound()`，**`/api/games/[id]/rom` 不归它管**。编译期常量，改完必须重新构建。

## 部署 / 校验

- `/_next/static/*` 绝不 immutable；`public/sw.js` 对 static 必须 network-first（改策略 `VERSION` +1）；发版后 purge CF。
- 🔴 `open-next.cache.ts` 的 `name` 必须逐字等于 `cf-r2-incremental-cache`（不等就静默跳过 ⇒ 全站冷启动）。
- 大 ROM 唯一下载路 `lib/http.ts` `fetchRomWithProgress`；R2 无版本控制，删 ROM 永久丢；键 `roms/<机种>/<slug>-<lang><ext>`。
- 展示地址一律 `publicUrlOrNull()`；缓存桶脚本 `next-cache-purge.mjs` / `r2-purge.mjs` 都不收 --bucket/--prefix。
- `pnpm dev` 别在沙箱起；typecheck 用 `npx tsc --noEmit --incremental false`；`pnpm build` 交给用户。
