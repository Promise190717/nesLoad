# nesLoad — 项目长期记忆

> 只留**动手前必须知道的硬约束**。详细来龙去脉见 `.workbuddy/memory/YYYY-MM-DD.md`（按日追加、只追加不覆盖）。
> **动手前先 `git status`**（工作区常有未提交的活；另有进程会并发改同一批文件）。

## 站名 / 定位

- 站名 **复古游戏屋** / Retro Game House —— 唯一来源 `lib/i18n.ts` 的 `SITE_NAME`，文案写 `{site}`。**别手写站名**。
- ⚠️ 这些**不是**站名，改了会让老用户数据 / 联机房间失联，**别动**：`package.json` 的 `name: nesload`、
  localStorage / IndexedDB 的 `nesload:*`、`nesload_locale` / `nesload_admin` cookie、`lib/netplay.ts` 的 `APP_ID`。
- 基调：**玩复古游戏**（NES / SFC / 街机）+ 在线游戏库 + 自己的 ROM 也能拖进来跑。别写成「卡带加载器」这种工具味说法。

## 两台机器与尺寸链

- 桌面 = 像素房间 + 电视机（`RetroTv`）；移动端 = 竖掌机（`HandheldConsole`）。**必须二选一** ——
  两台各有一个 canvas，Nostalgist 只认 `canvasRef` 指的那一个。
- 移动端判据是**设备**不是窗口宽度：`<html data-mobile>`，首屏由 `app/layout.tsx` 的内联 BOOT_INIT 写，
  判定逻辑在 `lib/device.ts`（**内联脚本里手抄了一份，改一处必须同步另一处**）。
  主题 / 灯 / 季节 / 简洁 / 电视档位 / 移动端六个 `data-*` 全在 BOOT_INIT 落地（`<html suppressHydrationWarning>`）。
- 尺寸链唯一出口 = globals.css 的 `--tv-*`：屏幕 720 / 840 / 960（`:root[data-tv]`）→ `--tv-w`（屏 + 20）→
  底座 `--tv-base-w` → 桌面 `--desk-w` = 机身 + 左右各 140（**不能收窄**，桌上的书 / 杯子 / 盆栽就摆在带子里）。
- ⚠️ 屏幕尺寸**必须写死在 `.screen` 的 class**（`h-[var(--tv-screen-h)] w-[var(--tv-screen-w)]`）：不能删、
  不能改内联（会顶掉未分层的 `.screen:fullscreen`）、不能让 canvas 撑尺寸 —— 核心会探 clientWidth 写回内联、
  再按 dpr 设后备存储 ⇒ **每换一盘游戏机身乘一次 dpr**（125% / 150% 缩放下必现「点第二款游戏整个区域变大」）。
- 同理 `lib/emulator.ts` 的 launch `size` 用 `SCREEN_WIDTH/HEIGHT` 常量，**不要读 `canvas.width`**。

## 移动端掌机（2026-10-12 版式定型）

- 自上而下：顶沿（**只剩右边 PWR 灯**，机名 NESLOAD 已被用户要求删掉，别补回）→
  屏幕（宽 `min(560px, calc(100vw - 28px))`，4:3）→ 功能排（暂停 / 存档 / 读档 / 重载 / 弹出，`py-1` + 10px）→
  弹性留白 → 控制区（十字键 + 面键 → SELECT / START，两排之间 `gap-8` = 32px，防误触别调小）。
- ⚠️ **音量整块删了**（用户要求），别再补回来；`volume` 仍传给屏幕（加入者那条 `<video>` 靠它，
  代价：移动端房主改不了本机模拟器音量）。
- `.screen-frame`（**只挂掌机内圈**）：`width: fit-content` + 左右 `auto` + `padding: 0 4px` ——
  掌机机身撑满一行，内圈不收就会被拉宽（实测 390×844 下屏幕缩在内圈左上、右边空 40px）。
- ⚠️⚠️ **屏幕两侧那点「白边」是内衬，也是内圈的身份证 —— 只能收细、不能收没**。
  收到 0（连带 `main` 左右内边距归零）想让屏幕铺满，结果机身那两条**竖向像素描边**（画在盒子外）
  被 `overflow-x: hidden` 整条裁掉，用户当场问「你怎么把游戏机的边框 UI 都给干没了」。
  现在 `.room` 左右内边距 10→6（让 pxw-6 描边顶到视口边、不裁）、内圈内衬 10→4。**改这几个数先想清楚边框露不露得出来**。
- 控制区**不贴底也不贴屏幕**：上下各垫一段空 div（`flex-[2]` : `flex-1`）按 2:1 分掉余量
  （贴底后 390×844 上离视口底只剩 43px，手指压在返回手势带上）。要调就改那两个 flex 值。
- 十字键与面键 `items-center`（原 `items-start`）—— 默认面键只有一行，顶对齐会悬在十字键最上面那格。
- 面键按机种长（`FACE_ROWS`）：默认（没插卡 / 认不出机种）**只有 B / A**；SFC 十字四键（`y` / `x`，
  **不是**街机叫法的 `l`）；街机六键（A B C / X Y Z → `b a y x l r`，叫法以 KeyBindingsPanel 为准）。
- ⚠️ **面键间距 `FACE_GAP = 14`（行内横向 + 行间纵向同一个值），别往小调**：`pixel-edge pxw-2` 的描边是
  四向 `box-shadow` **画在盒子外** ⇒ 两颗钮之间看得见的缝 = gap − 4；原 6px 只剩 2px，用户说「b a 按钮之间太近」。
  纵向也用 14 是为了 SFC 那四颗的菱形不被拉扁（代价：SFC / 街机控制区高 8~16px）。
- 竖屏实测**不溢出**：320×568 / 360×640 / 390×844 / 428×926 / 768×1024；横屏手机（844×390）会滚 ——
  掌机版式本来就是竖的，未处理。320 上余量只剩十几 px ⇒ SFC / 街机（多两行面键）**会轻微滚动**。

## 内容页 / SEO 层

- 真路由：`/games`（列表，`PAGE_SIZE = 15`，真 URL 分页 `?page=N` **+ 搜索 `?q=`**；非规范写法一律 **307 到规范地址**）·
  `/games/[id]`（详情）· `/games/[id]/download`（+ `RomDownloadGate`）· `/privacy` · `/terms` ·
  `app/games/[id]/not-found.tsx`（**一页盖详情 + 下载两条路由**，带 noindex）。
  后几页共用外壳 `components/GamesShell.tsx`（**服务端组件，不画房间**：这几页要能被整段读走）。
- ⚠️ **`/games` 列表页有 30 分钟数据缓存**（2026-10-12 加，用户要的）：取数走
  `lib/server/games.ts` 的 **`listGamesPageCached`**（`unstable_cache`，TTL = `GAMES_PAGE_REVALIDATE_SECONDS` = 1800），
  键 = `['games:list', offset, limit, keyword]`；外层再套 React `cache()` 让 `generateMetadata`
  与正文共用同一次查询。⚠️ **缓存只给这一页**，**别下沉进 `listGamesPage`** —— 那个函数被
  `/api/games`（房间弹窗）与 `/api/admin/games`（后台）共用，那两个必须立刻看到刚上传的游戏。
  键里**不含语言**是对的（`Game` 全是库里原文，语言只影响界面文案）。副作用：后台新传 / 改过的
  游戏**最多晚 30 分钟**才出现在列表页。
- ⚠️ **列表页搜索（2026-10-12 加）**：搜索框是**真 GET 表单**（`action="/games" method="get"`，零 JS、
  有真地址）；后端复用 `listGamesPage` 的 `keyword`（只匹配 title / developer / series）；
  **规范拼法固定 `?q=…&page=N`**，第 1 页不写 `page`、无关键词不写 `q` —— 空 `q` / 只有空白 / 重复参数 /
  前后空格 / 超长截断 / 参数顺序不对，全部 307 收敛。两处别踩：① **翻页链接必须带关键词**
  （统一走 `gamesHref(page, keyword)`），否则搜完翻页掉回全部；② **搜索页 `noindex, follow`**
  （无限 `?q=` 组合都是列表子集 = 重复内容，但 `follow` 不能删，爬虫要靠结果卡片走到详情页）。
  关键词上限 **64 个码点**（`Array.from` 按码点截，`slice` 会劈开 emoji 的代理对）。
- 基础设施：`lib/site.ts`（`SITE_NAME` + `resolveSiteOrigin()`，站点源唯一出口）· `app/layout.tsx`（metadata / viewport / JSON-LD）·
  `app/robots.ts` + `app/sitemap.ts`（**必须 `force-dynamic`**）· og / twitter 图 → `lib/og-image.tsx`（1200×630 现画）·
  `app/admin/layout.tsx`（整棵子树 noindex）· `ConsoleScene` 的 `sr-only` 段（**首页唯一可索引正文**）· `lib/i18n.ts` 的 `meta.*` / `seo.*`。
- **首屏 SSR（2026-10-12 用户确认过）**：三页 + 404 都是 `async` 服务端组件、数据在服务端取；
  根布局的 `I18nProvider` 是透传（无 mounted 门禁）；`RomDownloadGate` 连兜底 `<a download>` 都在首屏 HTML 里。
  没有 `loading.tsx` / `Suspense` 骨架，无 `fetch` 取数。⇒ **爬虫不执行 JS 也拿得到正文**，这一层不用再改。
- ① `lib/site.ts` 的 `await headers()` **不包 try/catch**（会吞 DynamicServerError ⇒ robots / sitemap 被预渲染并烤上 localhost）；
  ② **没有 hreflang**（本站无分语言 URL，语言靠 cookie）；③ og:image **不写进 metadata**（交给文件约定）；
  ④ 分享图**不用像素字体、只有英文**（Satori 拿不到页面 CSS 字体）；⑤ **不做** manifest / apple-touch-icon；
  ⑥ `sr-only` 段**别改成可见、也别堆关键词**。
- ⚠️ `GamesShell` 的 `label`（"GAME LIST" 那行）**必须全 ASCII** —— `font-pixel`（Press Start 2P）没有 CJK 字形。
- ⚠️ 下载页（`/games/[id]/download`）上**只有** `RomDownloadGate` 里那颗「开始下载」（点一下等 6 秒）：
  原先那条「没有反应？直接下载」的兜底链接 2026-10-12 被用户要求**删掉**了（它点一下就把文件甩出去、
  绕开那 6 秒缓冲），别当「漏掉的细节」加回来 —— i18n 的 `download.manual` / `download.manualLink`
  也是随它一起删的。代价：浏览器拦自动下载 / 用户没开 JS 时没有别的出口（想补就套 `<noscript>`）。
- ⚠️ **详情页正文只有一段**（`/games/[id]`）：后台填的说明，没填退一句 `fallbackDescription`。
  原先紧跟的第二段「它跑在浏览器里…也可以把 ROM 下载回去」（i18n `gamesPage.playHint`）
  2026-10-12 被用户要求**删掉**，别再补回来 —— 那两颗按钮已经把这两条信息说清了。
  ⚠️ 别和 `seo.*` 里那段站级介绍（同样提到 WebAssembly RetroArch）搞混，那个是给爬虫/分享卡用的，**留着**。
- 详情页三颗动作钮：开始游戏（`<Link>` → `/?id=`）· 下载 ROM（`<Link>`）· **分享游戏**
  （`components/ShareGameButton.tsx`，**唯一的客户端组件** —— 其余整页留在服务端渲染）。
  它复制 `${origin}/games/<id>`（`resolveSiteOrigin()`，与 canonical 同源），**不用 `window.location`**，
  免得把来源处带的 `?id=` 分享出去；剪贴板失败要出声（和 NetplayPanel 那两颗静默复制的钮不同）。
- 这几页都**不写 `export const dynamic`**：本来就要读 D1 / cookie（动态渲染），再声明一次是多余的。

## 操作入口 / 右上角那行

- 只有机身按钮。**全站唯一键盘操作是 `Esc`（关面板）**；P 暂停 / R 重置 / F5 存档 / F8 读档 已撤，
  **别再往 ConsoleScene 的 keydown effect 里加操作类快捷键**（i18n 的 `legend.shortcut` 已删，别补回来）。
- 暂停提示在屏幕里：`PAUSED` + `PRESS RESUME ON THE PANEL`，**不能**写「按 P」。
- 右上角 `.top-links`（**游戏列表 + 隐私政策 + 服务条款**，`right-6 top-5`；三条都 `target=_blank`）和移动端那颗
  盾牌钮 + 往左弹的弹层（包裹层 `.rail-mobile`）**互补 —— 任意时刻恰好一个入口**，改一条必须看另一条：
  漏掉 `.rail-mobile` ⇒ 桌面两个入口；漏掉 `.top-links` ⇒ 手机上三条压着掌机。
  ⚠️ 类名 2026-10-12 从 `.legal-links` 改成 `.top-links`，**globals.css 里四个规则块一起改**，别只改一处。
- ⚠️ **桌面端窗口一矮就换回那颗盾牌钮**（三档：小 770 / 中 860 / 大 950 = 屏幕高 + 230）。
  因为**机身竖向居中**，窗口矮下来它的顶边（`50vh - 机身高/2`）就顶到右上角那几行上 ⇒「屏幕拖小会遮挡电视机」。
  **撞不撞只跟高度有关**，宽度不用判（那颗钮在右侧上下居中）。门槛是算出来的，别凭感觉调 `top-5`。
  顺带：「游戏列表」**跟着这一行一起藏**（不单独留常驻链接），矮窗口下房间右侧开关列里本来就有「游戏库」。
- ⚠️ 那三条媒体查询都带 `min-width: 900px`：再窄整排开关 `display: none`，收掉链接 = 一个入口都不剩。

## 彩蛋与挂画

- 逗猫棒（`RoomFloorItems` 里，地板坐标 `left-[796px]`）→ 点了之后 `TvCat` 从**桌上那摞书后面**探出头、2.9s 后缩回
  （`.cat-peek` / `.cat-sway`）；七种花色走**洗牌袋**（`nextCatBreed`）而不是独立随机。
  ⚠️ `TvCat` 的 `left-[-128px]` / `bottom-[23px]` 是从**书堆几何**倒推的（改书堆或改猫要一起重算），
  DOM 上**必须排在 `RoomDesk` 之前**（书要挡住下巴）。它探出的位置在机身左侧 100 多像素：窗口 < ~1050px 被切掉（已知取舍）。
- 七幅像素挂画在 `RoomBackdrop.tsx` 的 `PAINTINGS`（`[x,y,w,h,颜色]` 整数格）；每幅带 `titleKey` / `artistKey`，
  **画名与作者只在 `lib/i18n.ts` 的 `painting.*` 里**。第七幅是用户自己的照片（滩涂玩水），
  说法由他指定：**「不知从哪来的不知名画作 / 佚名」，别改**。
- ⚠️ **「抽到哪一幅」是 ConsoleScene 的状态（`wallPainting`），不在 `RoomPainting` 里**：点开的大图面板要摆
  **墙上正挂着的那一幅**。`RoomPainting` 因此是纯展示组件（收 `painting` / `onOpen` / `label`），**别再往它里面引 hook**。
  抽签那条 effect 必须在挂载后（SSR 也会渲一遍）+ `setTimeout(…, 0)`（避开 React Compiler 的 `set-state-in-effect` error）。
- 大图面板 `components/PaintingPanel.tsx`：放大同一份 strokes（`viewBox` + `crispEdges`），高卡 `50vh`、宽吃满，
  `preserveAspectRatio` 默认 meet 所以**不变形**；背板用**固定暗色**（`ink-950` 会随主题翻，浅色下糊成白雾）。
- 大图可另配更细的位图：`PixelPainting.detail` —— 第七幅填了 `/paintings/beach.png`（**90×96** = 墙上 15×16 的整 6 倍）。
  ⚠️ 别往 120×128 以上调。三件事：① `<img>` **必须带 `[image-rendering:pixelated]`**；
  ② 尺寸同 SVG 那套 `h-auto max-h-[50vh] w-full object-contain`（少了 `object-contain` 会被 max-h 压扁）；
  ③ **墙上那幅仍是 strokes 的粗颗粒版**，只有大图换。原照片**不在仓库里**（在 `~/.workbuddy/blobs/` 附件缓存）。
- ⚠️ 画框那 100×96 的热区**会吃掉这一块的拖拽落点**（钉子那条仍透过去）；新增面板要把 `paintingOpen` 加进
  Esc 那条 effect、`guest 转发输入` 与 `blur 焦点` 两处 guard 及其 deps。

## 联机（1 对 1，不支持三人）

- wire 上**只传钮名**（`ButtonMessage {b,d}`）。**加入者按的是 1P 那组键**（他在游戏里是 2P）；房间里两种角色
  都锁 1P 那组、标签 `keybind.mine`。房主 P1/P2 不许撞键的校验**必须留着**。
- 链路：`物理 key → codeToButton(bindings.p1) → 钮名 → netplay.sendButton → 房主 controller.pressButton(button, 2, down) → 合成键盘事件`。
- 文案里**不要列键位**，一律 `playerLegend()` 现算。
- 提示通道 `toast = {key, kind:'ok'|'danger'}`（连上绿、**离开红**）：判据必须互斥 —— 房主看 `status === 'waiting'`，
  加入者看 `error === 'host-left'` 且**比「原因码从无到有」**；⚠️ 断开时控制器**连发两次 `onState`**（第二次 `role` 已是 null）
  ⇒ `lastRole` **只在 role 非 null 时更新**。
- 房主暂停要明说给加入者：`SessionMessage.z?: 0 | 1`（只信 `playing && z === 1`），状态存 `localPaused`、整包发。
  屏幕暂停层判据 `paused || (remotePaused && Boolean(remoteStream))` —— **必须用 `remoteStream` 而非 `hasPicture`**。暂停权只在房主。
- 三人必须挡在门外（卡在玩家位 / 注入键位 / 房间状态三层）：房主对多余 peer 定向发 `{t:'full'}`，
  被拒方自己 `leave()` + `fail('room-full')`；⚠️ `onPeerLeave(peerId)` 必须加 `peerId !== state.peerId` 判据。
  `room-full` **不走 toast**，改**重开联机面板**摆红字。
- **房主掉帧 = 整局变慢**（RetroArch rAF 主循环不跳帧）。出画质量三档唯一出口 `lib/netplay.ts` 的 `QUALITY_SPEC`；
  **换档 = 重建整条流**；编码参数只能靠 `room.getPeers()` → `getSenders()` → `setParameters`；**只有帧率**能减轻主线程。

## 手柄

- 引擎层白送（rwebpad autoconfig 到 1P），本站无手柄代码。两个手柄按 `getGamepads()` 枚举顺序自动分 1P/2P。
  ⚠️ **单手柄永远落 1P** ⇒「键盘 1P + 手柄 2P」做不到，跟用户解释双人方案时要主动说这条。
- 联机时加入者的手柄也生效：转发 effect 里 rAF 轮询，映射表 `lib/gamepad.ts`（**必须和引擎一致**；
  0/1 反：手柄下键 → RetroPad B、右键 → A；l2/r2/l3/r3 映射 `null` 丢掉）。
  键盘 / 手柄**各自记账再取并集**（两边各发各的会误发 keyup，角色突然停住）；切后台用 `visibilitychange` 补 keyup。

## 游戏库列表（前后台共用服务端分页）

- **唯一入口 `lib/server/games.ts` 的 `listGamesPage(offset, limit, {keyword, consoleType})`**
  （前台弹窗 `/api/games` 15/页；后台 `/api/admin/games` 10/页 + 鉴权），返回 `{games,total,offset,limit}`。
- 排序必须 `created_at DESC, id DESC`（毫秒时间戳撞同值、SQLite 并列行顺序不稳 ⇒ 会「出现两次 / 消失一条」）。
- 分页后搜索 / 筛选**只能落服务端**（代价：COUNT + SELECT 两次 D1 往返）⇒ 前台搜索是**提交式**，不边打字边发。
- ⚠️ `SEARCH_CONDITION` 只匹配 title / developer / series，**刻意不含 `language`（也不含 `description`）**：
  实测 58 条里 53 条 `en`，纳进去搜索框直接失灵；绑定值写死 `?1`，**关键词必须是第 1 个绑定参数**。
- ⚠️ `total` 与 `offset` 必须描述同一批数据 ——「夹到的那页真为空才回退一页」**别删**。
  遗留：`safeOffset` 只 `Math.min`、不吸附页边界（调用方都传 10 的倍数，先挂着）。
- ⚠️ **加 games 表的列有固定套路**：`CREATE TABLE IF NOT EXISTS` **不会给老表补列** ⇒ `db/schema.sql` 改完还要
  新写并跑一个 `scripts/add-<列名>.mjs`（PRAGMA 读列 → 缺了才 `ALTER TABLE ... ADD COLUMN` → 前后各打一次
  `COUNT(*)` 自证没删东西；**已有列就跳过**，可重复执行）。⚠️ **别把 ALTER 写进 schema.sql** —— 那文件里每条
  语句都带 `IF NOT EXISTS`、要能反复跑，ALTER 第二遍会报 `duplicate column name`。
  补**内容**（不是列）另写 `scripts/fill-<列名>.mjs`，模板照 `fill-games-description.mjs`：
  文案表以 **id**（不是 title）为键，`UPDATE ... WHERE id = ? AND (列 IS NULL OR TRIM(列) = '')` ——
  **只填空白行** ⇒ 后台手填过的不会被覆盖、可反复执行；带 `--dry-run`，前后各打一次 `COUNT(*)`。
- 说明文案口径：只写「这是什么游戏」（类型 + 玩法 + 为什么值得一提），
  **不复述年份 / 开发者 / 系列**（详情页那张 `dl` 资料表已经列了）。详情页 meta 只吃前 `DESC_LIMIT`(100) 字。
- 新字段的完整链路 5 处：`lib/server/games.ts`（GameRow / Game / toGame / NewGame+insertGame / GamePatch+updateGame）、
  `app/api/admin/games/route.ts`（POST 表单）、`[id]/route.ts`（PATCH body）、`components/AdminGames.tsx`
  （接口类型 + state + resetForm/openEdit + 提交两处 + 表单控件）、`components/GameLibraryPanel.tsx`（`LibraryGame`）。
- 房间那个弹窗 `GameLibraryPanel`：两个 tab —— 在线库（服务端分页）＋ 历史（父级给的 `cartridges`，
  面板**不自己读 IndexedDB**）。
  ⚠️ `tab` / `consoleFilter` / `keyword` / `searchDraft` / `page` / 滚动位置 + **整页数据 `snapshot`**
  都存在**模块级单例 `libraryMemory`**：面板是 `libraryOpen && <…/>`，关一次就真卸载、state 全没，
  而用户要的是「关闭时什么样、进来还是什么样」**且不想每次重开都白打一次列表接口**。
  于是复原成功时 `settledKey === queryKey` 那条守卫直接 return、不发请求 ——
  **别把它改成 `useRef` 记「第一次别拉」**：React 开发模式 effect 会跑两遍，ref 那套第二次就漏，
  而「key 比较」天然幂等（翻页 / 改筛选时 key 必然对不上，该请求照样请求）。
  ⚠️ 代价：期间后台新传 / 删的游戏要换页 / 改筛选 / 提交搜索（或刷新页面）才看得到。
  恢复滚动用 `useLayoutEffect` + **不写依赖数组**每帧试一次（内容够长后才拨得动）。
- 卡片入场动效 `.card-in`（globals.css）**房间弹窗 + `/games` 列表页共用**：**错峰不在 CSS 里**，
  组件按 `index` 写内联 `animation-delay`。⚠️ 那三个参数（24ms/张、封顶 14、`cardDelayMs()`）
  **唯一出口是 `lib/card-stagger.ts`**，别再往组件里抄一份。
  ⚠️ `animation-fill-mode: backwards` **不是 `both`**：延迟期间要透明，结束后不许留常驻 transform。
  **没给 `<ul>` 加「换一批就重播」的 key** —— 翻页 / 筛选后 id 全变、`<li>` 本来就会被换掉，动画自然重播。
  ⚠️ 列表页是**服务端组件**，动效只是内联 style、服务端算好即可，**别为此加客户端组件**。

## 公开内容页

- 详情页 meta description = **后台那句 `description`（截 100 字）+ 一句通用「能玩能下载」**，
  没填说明就只用通用那句、**不编造**；带 `VideoGame` + `BreadcrumbList` JSON-LD；找不到 → `notFound()`。
- 单条数据入口 **`lib/server/games.ts` 的 `getGame(id)`**（对外形状，不含 rom_url）：页面直接调它，
  **只有首页深链走 HTTP**（`GET /api/games/[id]`，找不到 404）。
- sitemap **函数形式**从 `listGameStubs()` 现读全部 id，游戏页带真实 `lastModified`(created_at)；
  ⚠️ 读库失败要**退化成只剩静态地址**，不能让整个 sitemap 挂掉。
- 深链：详情页「开始游戏」→ `/?id=<id>`，首页 `ConsoleScene` 挂载时读 → **有 id 就立刻开弹窗**
  （`deepLinkOpen`）→ 打接口 → 数据到了填进 `deepLinkGame` → `loadRemoteGame`；没有就收弹窗 + toast。
  ⚠️ 开窗判据是 **`deepLinkOpen` 而不是 `deepLinkGame`**（两个 state）：用户明确要求「有 id 弹窗就出现、
  里面转 loading 动画」，不能先空着等一次网络往返。所以弹窗里每处用 `deepLinkGame` 的地方都要过空值。
  ⚠️ 之前开的是**整个游戏库面板**（`setLibraryOpen(true)`）—— 用户点「开始游戏」会先看见十几张封面摊开
  再被捞走，**别改回去**。
- 深链那几处坑：① `?id=` **读到先留着、这一轮结束再抹**（`clearGameId()` 包在 `closeDeepLink()` 里，
  幂等、多处调用；⚠️ 别改成 `?room=` 那种「读到就抹」—— 载入中按 F5 必须还能重开同一款）；
  ② 有 `?id=` 时**首次操作指引让位**（z-[60] 那层会盖住载入进度，且不写「看过了」的标记）；
  ③ 用 `loadRemoteGameRef` 拿最新一份 loader —— 闭包捕获第一帧那份会让防重入闸形同虚设；
  ④ 深链有**两段请求**（`GET /api/games/<id>` + ROM 整包），**取消 / Esc 走 `cancelDeepLink()`，
  两段都 abort**（只掐 ROM 那段 ⇒ loading 期间点取消，数据回来后游戏自己开始下）；
  ⑤ `closeDeepLink()` 的调用点：取数失败、取消、整包到手、`loadRemote` 的 `finally`、防重入早退
  （**找不到那一款也必须收**，否则弹窗永远停在 loading）；
  ⑥ **不给点背景关闭**（关掉窗口请求还在跑比关不掉更糟）；它同时进 Esc 的 `anyPanelOpen`
  与两处输入 guard 的 deps。
- ⚠️ 深链 effect 里那句 `setDeepLinkOpen(true)` **必须写成 `Promise.resolve().then(…)`**：
  直接同步调用会撞 `react-hooks/set-state-in-effect`（lint 基线 15 个 error 里已经有它，
  再加一条就破基线）。推到微任务不影响观感（跑在绘制之前）。
- ⚠️ `netplayToast` / `setNetplayToast` / `NETPLAY_TOAST_MS` 已改名
  **`toast` / `setToast` / `TOAST_MS`**（深链的「找不到」也用它，房间顶上那个位置是**共用**的）。

## 部署 / 协作习惯

- 线上配服务端变量 `SITE_URL`（无 `NEXT_PUBLIC_`）；**不做 `output: 'export'`**；部署见 `.workbuddy-ai/memory/REFERENCE.md`。
- 注释一律写「为什么这么做」，**包括否掉的方案** —— 本仓库既有风格。
- 临时探针（`TEMP-PROBE`、`__PAD_LOG__`、`tmp-*` 脚手架）验完**必须删**。
- ⚠️ **别拿生产数据做删除类测试**：`.env.local` 里的 D1 / R2 是**真库**（2026-10-12 误删过 4 条游戏）。
- ⚠️ **删掉的 ROM 找不回来**：R2 桶**没开版本控制** ⇒ 一删永久；删游戏必须走后台，别用脚本直接打 R2。
  D1 有 **Time Travel**（30 天窗口），但只支持**整库原地回滚**、**没有**「只读查历史」的接口
  ⇒ 想核对历史只能先回滚、看完再回滚回来，**必须用户点头**；且 R2 文件既已丢，恢复记录只会造出断链条目。
- 改完提醒用户跑 `pnpm typecheck`。lint 基线 = **364 problems / 15 errors / 349 warnings**，源码里有抱怨的只有
  ConsoleScene / KeyBindingsPanel / OnboardingTour（其余全在 `public/` 的第三方 js），**别再多出来**。
- ⚠️ `pnpm build` 在本机**跑不了**：Next 清理 `.next` 被沙箱 safe-delete 守卫拦下（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`），
  属环境限制不是代码问题 —— 交给用户自己跑。
- 屏幕内文案纯英文、不进 i18n；要读的说明一律走浮层面板。
- ⚠️⚠️ **不要主动实测**（用户 2026-10-12 明确要求：「我每明说需要测试的功能你就不要测试」）：
  改完代码**默认只做** typecheck + lint 保持基线，然后把改动讲清楚交给用户自己看；
  **不要**自作主张起浏览器 / 探针 / 截图验证。用户说要测再测 —— 下面的手法只在那种时候用。

## 实测手法速查（只有用户说要测时用）

- 无头 Chrome **看不到输入效果**（rAF 基本不跑、模拟器停摆）⇒ 用**离屏真窗口**
  （`--window-position=-3000,-3000 --disable-backgrounding-occluded-windows --disable-renderer-backgrounding
  --disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling`）+ `Page.bringToFront`。
  **纯量版式 / 看渲染**用 `--headless=new` + CDP 就够：`Emulation.setDeviceMetricsOverride`，
  再在页面脚本之前 `Object.defineProperty(navigator,'userAgentData',{value:{mobile:true}})` 骗过 BOOT_INIT。
- 多开 Chrome 抢渲染，只有前台满帧；测前杀自己起的实例（按 `remote-debugging-port=92` / 独立
  `--user-data-dir` 过滤，**别动用户自己的 Chrome**）。
- 判据别用颜色（`.crt` 叠加层 + 调色板映射反直觉）。**采样间隔要不等距**，否则与变色周期锁相出假冻结。
- 伪造手柄：`Page.addScriptToEvaluateOnNewDocument` 篡改 `navigator.getGamepads()` + 派发 `gamepadconnected`
  （`Object.defineProperty(ev,'gamepad',…)`，**不能用 `GamepadEvent` 构造器**）。
- 测转发链先设 `localStorage['nesload:tour-done']`（否则操作指引 `tourOpen` 拦截整段 effect）。
