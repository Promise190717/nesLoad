# nesLoad — 项目长期记忆

> 只留**动手前必须知道的硬约束**；根因与历史见 `DETAILS.md`，来龙去脉见 `2026-*.md`。
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

- 读库唯一出口 `lib/server/pg.ts` `query()`，**走 HTTPS**（PostgREST→`public.exec_sql`）；游戏主键 = 上游 slug。🔴 **绝不在 Worker 直连 Postgres**；只有 `scripts/*.mjs` 可直连。`SUPABASE_URL`+`SUPABASE_SECRET_KEY` 缺一全站 500。
- 文案侧表四张（game/developer/series/console_texts），主键 (slug, locale)；developer/series 名按 locale JOIN 现取。
- 🔴 前台读文案一律按语言裁：`textLocalesFor(locale)`（≤3 种），列表再加 `content:false`/`roms:false`；**不传 locale 就是全 18 种**，免费版 10ms 必爆。动过文案/图片必须升缓存键尾号；R2 换图传新键（-v2）。

## H5 专栏（FPS `transport-ship`）

- `/h5` + `/h5/transport-ship`：写实军事风 FPS（CF 视觉：直角 + 橙金 `#f0a020` + 近黑 `#0f1318`），联机 + 人机。**与模拟器完全隔离**（不碰 Supabase / R2 / `emulator.ts` / `netplay.ts`），独立 `appId: 'nesload-fps'`。代码以 `lib/h5/engine.ts` 为中枢；`level.ts` 地图、`weapons.ts` 数值+枪模、`viewmodel.ts` 第一人称层、`player.ts`/`bot.ts`/`combat.ts` 玩法、`effects.ts`、`actor-view.ts`、`dropped.ts`。**旧文件名 render3d/world/game/map/character/net.ts 已失效**。
- 🔴 入口 = 模式页，也是唯一准备页 `ShipModeSelect`：单人卡（人机强度）/ 联机卡（名字 / 房间码 / 附近房间 + `ship-scan`）。点「开始战斗 / 创建房间 / 加入房间」即意图 `enterMode(mode, NetIntent)`；单人/建房 → `ShipLoading` → 开局；**加房不载入**（先连会话选阵营 → 房主回执 → `acceptJoin()` → `runLoad` → `finishJoin()`）。**没有第二道选择页**（`ShipStartScreen` 已删）。phase = `mode|loading|lobby|playing|menu|result`。`leaveNet()`/Esc 都回模式页。载入取消靠 `loadSeq` 批次号。加房那一下必须 `gameAudio.unlock()`。
- 对局规则唯一入口是模式页四行 `Segmented` → `engine.setRules`；`teamSize` 决定席位数（2×teamSize），**换档必须在非对局非联机时 `rebuildTeams()`**；`SPAWN_X` 6 位、第 0 位留给本机玩家。🔴 `endMode` 互斥单选：`kills` 只判人头、`time` 只递减 `timeLeft`；联机由房主定（`Snapshot.m` 0 时长 / 1 人头，`NET_VERSION=2`，`Snapshot.k` 目标，`Snapshot.t` 语义随 `m` 变）。计分板读 `hud.killTarget`/`hud.endMode`。结算「返回」= 回模式页。
- 🔴 出生/复活唯一出口 `pickHomeSpawn(team, self)`（玩家 / 联机对端 / 人机共用，只在 `level.spawns[team]` 6 格里挑）：**带权随机**，权重 `1/(1+0.5×被看见人数)`，**刚站过那格 ×0.3**（软惩罚，不是硬排除）。`SPAWN_X = ±7.6 / ±5.2 / ±1.8`（2026-11-13 从 ±9 收窄，用户「不要总在复活点的角落」）；**x=0 与 ±4.2 必须空着**（出生区掩体在正前方）。玩家叠 ±0.8、人机叠 ±0.5 横向偏移。`pickMapSpawn` 全图撒点已整条删除。朝向 `spawnFacingYaw` 固定朝敌方出生线中点。🔴 **复活没有镜头过渡**（别加回插值，会白送透视）。
- 枪模 = three 几何体拼装 + 共享材质；**独立 scene + FOV 50**，主场景画完 `clearDepth()`；`rotation.y` 恒 0（别给 yaw 修）。只有 AWM 能开镜。`disposeWeaponModel` 只释放几何体。
- 🔴 远端/人机武器跟 `actor.weapon` 自动换（`ActorView.sync` 每帧比对，变了 dispose + `buildGun`）；**AK 与 M4 必须两套几何**，共用一个 `else` = 换枪在别人眼里没换。加入者看房主换枪走快照 `ACTOR_WEAPON` → `ReplicaActor.apply`，和房主看加入者是两条路。
- 🔴 枪口火光：`depthTest` 默认 true（会被掩体挡），只有本机传 false；`light` 只给本机。整池共用 `depthTest=false` = 隔箱看火光找人。
- 🔴 联机输入纪律：远端动作 Set 是**换出**（`link.actions = new Set()`）不是 clear。音频 `unlock()` 挂 `schedulePrewarm`（逐宏任务烘枪声）；构造期 `renderer.compile` 两个 scene 全量预编 shader。
- 🔴 房主权威模拟不能只挂 rAF：`engine.step(now, render)` 是唯一帧入口，`stepWhileHidden()` 用加入者输入帧当心跳补帧（`HIDDEN_STEP_GAP_MS=80`），`rawDt>1` 的停顿要补进 `link.lastInputAt`。
- 🔴 加入者没有投掷物模拟：只从 `Snapshot.g`（`GrenadeWire=[id,x,y,z]`）拿位置 damp 跟随，别加本地弹道。加入者近战是纯画面（`playMeleeView` + `meleeVisual` 跳过 `meleeStrike`），切枪闸吞掉的单击用 `pendingMelee` 补。
- 🔴 已删功能（用户明确要求，别再恢复）：**脚步声**（audio 的 step/bakeStep/STEP_*）、**蹲下**（Ctrl 蹲 + W = Ctrl+W 关标签页；`InputFrame` 无 crouch，身高恒 1.8）；网络位图 `F_*` 的 `1<<4`、`IN_*` 的 `1<<0` 是空位不许复用。
- 渲染 `NeutralToneMapping` + exposure 1.15（不是 ACES）；高金属度必须有环境贴图。音效全 WebAudio 合成、无音频文件；枪声 = 预烘焙 `AudioBuffer`（`GUN_RECIPE` 六层 + tanh + 归一化），调听感只动 `GUN_RECIPE`，别再换采样 / 加回实时 biquad。
- 🔴 地图 22 × 44（`HALF_W=11`/`HALF_L=22`），改图只动 `level.ts` 写死坐标、**别引入缩放系数**。结构：两座狙击台（`cx=±8.7`、楼梯 `±10.05`）＋中路散货（中央横箱、攀爬链 1.0→1.9→2.6、moss/slate/sand 三对）＋船头吊臂（底座 (-9.7,-20.9)）。配色五色冷调（bone/olive/moss/slate/sand），甲板蓝灰 `#7f8d98`，**锈橙已删**。改完核：① 六个出生位不被压 ② `z=0` 只有 x=±6 一格能过 ③ 中段散货外沿 ≤5.3 ④ 攀爬链三件面贴面（4.15/3.05）⑤ `textureDeck` repeat 11×22、阴影相机 ±30。
- 换枪资格唯一出口 `player.canChangeLoadout`（存活 + 复活 ≤5s + 本次生命未耗弹）；HUD 字段是 `canChangeLoadout`。

## 主题 / 首屏

- `<html data-theme>` 写入者只有 SiteDocument 的 `BOOT_INIT` 与 `saveTheme()`；导航丢属性由 BootAttributes 只补缺不落盘。
- 🔴 深色灰阶是**冷调蓝灰**：ink-950 #181c26、900 #1e222e、850 #242936、800 #2c3241、700 #3d4457、600 #4a5061、500 #6a7080；400 以上中性灰。`--color-floor`/`--wall-top`/`--wall-bottom` 手抄值必须同步。`--color-crt-*` 与 `.screen` 永远黑。
- 桌面 RetroTv / 移动 HandheldConsole 判据 `<html data-mobile>`（device.ts + 内联脚本两份同步）；尺寸唯一出口 globals.css `--tv-*`。

## 路由 / 缓存 / SEO

- 目录页维度全是路径段（`/page/N`、机种、语种嵌套；搜索 `?q=`）；地址构造唯一出口 `gamesHref`/`consoleHref`/`pageHref`；**别加新查询参数**。
- 🔴 **无前缀地址永远是英文**，不按 cookie 307；cookie 只让 `LocalePrompt` 别重复问。
- 🔴 三层缓存：⓪ Workers Caching（整页 HTML 走 `withCdnHeaders`，`Vary: RSC`；其余 `noStore`）→ ① R2 增量（`cached()` 7 天 + ISR 604800）→ ② `worker.ts` Cache API（24h）。发版后跑 `pnpm warm:edge`。
- 🔴 ROM 取字节：区间 `?span=start-end`；分片回 200 + `X-Rom-Span`/`X-Rom-Total` + 准确 `Content-Length` + `?v=`，其余分支 `private, no-store`；**第 2 次重试必须换缓存键**（`&nc=`）。
- 🔴 `/api/games/[id]` 必须读 `getGameFullCached`（实时查库必 503）。
- 🔴 下载页 HTML 与 id 无关（缓存键折叠成 `/<locale>/__nesload_download`）：别把 id/逐页 title/canonical 加回服务端；下载钮必须裸 `<a>`；`noindex, follow`。
- 🔴 `<Link>` 预取：列表型与首屏动作型一律 `prefetch={false}`（全站没有 `loading.tsx`）。
- 「我是谁」唯一出口 `lib/current-user.ts` `fetchCurrentUser()`。长文档页共用 `DocPage.tsx`；免责声明唯一出处 `disclaimer()`。
- `/play` 唯一开局页；`/embed/games/<id>` 纯播放页 `noindex`。触屏手柄只有 `:root[data-mobile='on']` 一条判据。
- 存档 = 电池 `.srm` 一款一份。🔴 房间页永久下线，别加入口、别读它。
- 🔴 功能开关唯一出口 `lib/features.ts`；`ROM_DOWNLOAD_ENABLED=false` 时下载钮不画、下载页 `notFound()`，`/api/games/[id]/rom` 不归它管。编译期常量，改完必须重新构建。

## 部署 / 校验

- `/_next/static/*` 绝不 immutable；`public/sw.js` 对 static 必须 network-first（改策略 `VERSION` +1）；发版后 purge CF。
- 🔴 `open-next.cache.ts` 的 `name` 必须逐字等于 `cf-r2-incremental-cache`。
- 大 ROM 唯一下载路 `lib/http.ts` `fetchRomWithProgress`；R2 无版本控制，删 ROM 永久丢；键 `roms/<机种>/<slug>-<lang><ext>`。
- 展示地址一律 `publicUrlOrNull()`；`next-cache-purge.mjs` / `r2-purge.mjs` 都不收 --bucket/--prefix。
- `pnpm dev` 别在沙箱起；typecheck 用 `npx tsc --noEmit --incremental false`；`pnpm build` 交给用户。
