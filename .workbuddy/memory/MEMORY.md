# nesLoad — 项目长期记忆

> 这里只留**动手前必须知道的硬约束**。来龙去脉在 `.workbuddy/memory/YYYY-MM-DD.md`（按日追加，
> 只追加不覆盖）和更早的 `.workbuddy-ai/memory/REFERENCE.md`。**动手前先 `git status`**。

## 站名 / 定位

- 站名 **复古游戏屋** / Retro Game House —— 唯一来源 `lib/i18n.ts` 的 `SITE_NAME`，文案写 `{site}`。**别手写站名**。
- ⚠️ 这些**不是**站名、改了会让老用户数据 / 联机房间失联，**别动**：`package.json` 的 `name: nesload`、
  localStorage/IndexedDB 的 `nesload:*`、`nesload_locale` / `nesload_admin` cookie、`lib/netplay.ts` 的 `APP_ID`。
- 定位（写文案的基调）：**玩复古游戏**（NES / SFC / 街机）＋在线游戏库＋自己的 ROM 也能拖进来跑。
  **别**写成「卡带加载器」这种工具味说法。

## 两台机器：桌面 / 移动端二选一渲染

- 桌面 = 像素房间 + 电视机（`RetroTv`）；移动端 = 竖掌机（`HandheldConsole`）。
  **必须二选一**：两台各有一个 canvas，Nostalgist 只认 `canvasRef` 指的那一个。
- 移动端判据是**设备**，不是窗口宽度：`<html data-mobile>`，首屏由 `app/layout.tsx` 的内联 BOOT_INIT 写，
  判定逻辑在 `lib/device.ts`（**内联脚本里手抄了一份，改一处必须同步另一处**）。
- 主题 / 灯 / 季节 / 简洁 / 电视档位 / 移动端 六个 `data-*` 全在 BOOT_INIT 落地（`<html suppressHydrationWarning>`）。

## 尺寸链（唯一出口：globals.css 的 `--tv-*`）

- 屏幕 720 / 840 / 960（4:3，`:root[data-tv]`）→ `--tv-w` = 屏 + 20 → 底座 `--tv-base-w` →
  桌面 `--desk-w` = 机身 + 左右各 140（**不能收窄**，桌上的书 / 杯子 / 盆栽就摆在带子里）。
- ⚠️ 屏幕尺寸**必须写死在 `.screen` 的 class 上**（`h-[var(--tv-screen-h)] w-[var(--tv-screen-w)]`）：不能删、
  不能改内联（会顶掉未分层的 `.screen:fullscreen`）、不能让 canvas 撑尺寸 —— 核心会探 clientWidth 写回内联、
  再按 dpr 设后备存储 ⇒ **每换一盘游戏机身乘一次 dpr**（125%/150% 缩放下必现「点第二款游戏整个区域变大」）。
- 同理 `lib/emulator.ts` 的 launch `size` 用 `SCREEN_WIDTH/HEIGHT` 常量，**不要读 `canvas.width`**。

## 移动端掌机（2026-10-12 版式定型）

- 自上而下：顶沿（**只剩右边 PWR 灯**，机名 NESLOAD 已被用户要求删掉、别补回）→
  屏幕（宽 = `min(560px, calc(100vw - 28px))`，4:3）→
  **功能排**（暂停 / 存档 / 读档 / 重载 / 弹出，`py-1` + 10px 字，宽跟 `--tv-screen-w`）→
  弹性留白 → 控制区（十字键 + 面键 → SELECT / START，两排之间 `gap-8` = 32px（防误触，别调小））。
- ⚠️ **音量整块删了**（用户要求），别再补回来；`volume` 仍传给屏幕（加入者那条 `<video>` 靠它，
  代价：移动端房主改不了本机模拟器音量）。
- `.screen-frame`（**只挂掌机内圈**）：`width: fit-content` + 左右 `auto` + `padding: 0 4px`。
  掌机机身是撑满一行的，内圈不收就会被拉宽 ⇒ 屏幕缩在内圈左上角、右边空一条
  （实测 390×844 下空 40px、边框左右不对称）。
- ⚠️⚠️ **屏幕两侧那点「白边」是内衬，也是内圈的身份证 —— 只能收细、不能收没**。
  2026-10-12 我把它收到 0（连带 `main` 左右内边距也归零）想让屏幕铺满，结果机身那两条
  **竖向像素描边**（画在盒子外）被 `overflow-x: hidden` 整条裁掉，用户当场说
  「你怎么把游戏机的边框 UI 都给干没了」。现在 `.room` 左右内边距 10→6（正好让 pxw-6 描边
  顶到视口边、不裁）、内圈内衬 10→4，边框全在。**改这几个数之前先想清楚边框露不露得出来。**
- 控制区**不贴底也不贴屏幕**：上下各垫一段空 div（`flex-[2]` : `flex-1`）按 2:1 分掉余量 ——
  用户先说「操作按钮往下移」、贴底之后又说「太下了」（390×844 上离视口底只剩 43px，
  手指压在返回手势带上）。比例就是那两个 flex 值，要调直接改。
- 十字键与面键 `items-center`（原 `items-start`）—— 默认面键只有一行，顶对齐会悬在十字键最上面那格。
- 面键按机种长（`FACE_ROWS`）：默认（没插卡 / 认不出机种）**只有 B / A**；SFC 十字四键
  （Y / X 用 `y` / `x`，**不是**街机叫法的 `l`）；街机六键（A B C / X Y Z → `b a y x l r`，
  叫法以 KeyBindingsPanel 为准）。
- ⚠️ **面键间距 `FACE_GAP = 14`（行内横向 + 行间纵向同一个值），别往小调**：
  `pixel-edge pxw-2` 的描边是四向 `box-shadow` **画在盒子外**的 ⇒ 两颗钮之间看得见的缝
  = gap − 4。原来 6px ⇒ 只剩 **2px**，用户 2026-10-12 说「b a按钮之间太近」。
  纵向也用 14 是为了 SFC 那四颗的菱形不被拉扁（代价：SFC / 街机控制区高 8~16px）。
- 实测竖屏**不溢出**：320×568 / 360×640 / 390×844 / 428×926 / 768×1024；横屏手机（844×390）会滚 ——
  掌机版式本来就是竖的，未处理。320 上余量只剩十几 px ⇒ SFC / 街机（多两行面键）**会轻微滚动**。

## SEO 层（别改回去）

`lib/site.ts`（`SITE_NAME` + `resolveSiteOrigin()`，站点源唯一出口）· `app/layout.tsx`（metadata / viewport /
JSON-LD）· `app/robots.ts` + `app/sitemap.ts`（**必须 `force-dynamic`**）· `opengraph-image` / `twitter-image`
→ `lib/og-image.tsx`（1200×630 现画）· `app/admin/layout.tsx`（整棵子树 noindex）·
`ConsoleScene` 的 `sr-only` 段（**页面唯一可索引正文**）· `lib/i18n.ts` 的 `meta.*` / `seo.*`。

- ① `lib/site.ts` 的 `await headers()` **不包 try/catch**（会吞 DynamicServerError ⇒ robots/sitemap 被预渲染并烤上 localhost）；
  ② **没有 hreflang**（本站无分语言 URL，语言靠 cookie）；③ og:image **不写进 metadata**（交给文件约定）；
  ④ 分享图**不用像素字体、只有英文**（Satori 拿不到页面 CSS 字体）；⑤ **不做** manifest / apple-touch-icon；
  ⑥ `sr-only` 段**别改成可见、也别堆关键词**。

## 操作入口

- 只有机身按钮。**全站唯一键盘操作是 `Esc`（关面板）**；P 暂停 / R 重置 / F5 存档 / F8 读档 已撤，
  **别再往 ConsoleScene 的 keydown effect 里加操作类快捷键**（i18n 的 `legend.shortcut` 已删，别补回来）。
- 暂停提示在屏幕里：`PAUSED` + `PRESS RESUME ON THE PANEL`，**不能**写「按 P」。

## 彩蛋：地上的逗猫棒 → 书堆后面的猫（2026-10-12）

- 开关是地板上那根**逗猫棒**（`RoomFloorItems` 里，地板坐标 `left-[796px]`）；点了之后
  `TvCat` 从**桌子上那摞书后面**探出头，2.9s 后缩回去（`.cat-peek` / `.cat-sway`，见 globals.css）。
  七种花色走**洗牌袋**（`nextCatBreed`）而不是独立随机 —— 卖点就是「每次都不一样」。
- ⚠️ `TvCat` 的 `left-[-128px]` / `bottom-[23px]` 是从**书堆几何**倒推的（堆顶比桌面高 30px、
  贴顶那本 48 宽，脸的 48 格正好和它对齐）；**改书堆或改猫要一起重算**，且 DOM 上
  **必须排在 `RoomDesk` 之前**（书要挡住下巴，否则成了「浮在书上的一张猫脸」）。
- ⚠️ 它探出的位置在机身左侧 100 多像素：窗口 < ~1050px 会被 main 的 overflow 切掉
  （和挂画 / 窗户同一个门槛，属已知取舍）。

## 墙上的挂画（2026-10-12 由日历改来，同日加了「点开看大图」）

- 七幅像素画在 `RoomBackdrop.tsx` 的 `PAINTINGS`（`[x,y,w,h,颜色]` 整数格）；每幅带
  `titleKey` / `artistKey`，**画名与作者只在 `lib/i18n.ts` 的 `painting.*` 里出现**。
  第七幅是用户自己的照片（滩涂玩水），说法由他指定：**「不知从哪来的不知名画作 / 佚名」，别改**。
- ⚠️ **「抽到哪一幅」现在是 ConsoleScene 的状态（`wallPainting`），不在 `RoomPainting` 里**：
  点开的大图面板要摆出**墙上正挂着的那一幅**，两处各存一份会各说各话。`RoomPainting`
  因此是纯展示组件（收 `painting` / `onOpen` / `label`），**别再往它里面引 hook**。
  抽签那条 effect 必须在挂载后（SSR 也会渲一遍）+ `setTimeout(…, 0)`（避开
  React Compiler 的 `set-state-in-effect` error）。
- 大图面板 `components/PaintingPanel.tsx`：画面直接放大同一份 strokes（`viewBox` + `crispEdges`），
  高度卡 `50vh`、宽度吃满，`preserveAspectRatio` 默认 meet 所以**不变形**、多余的地方是卡纸。
  背板用**固定暗色**（`ink-950` 会随主题翻，浅色主题下会糊成白雾）。
- 大图可以另配一张更细的位图：`PixelPainting.detail`（`public/` 下路径，可选）——
  第七幅填了 `/paintings/beach.png`（**90×96** = 墙上 15×16 的整 6 倍，由他那张原照片降采样
  + 64 色量化，5.5 KB）。⚠️ **别往 120×128 以上调**：他看过那版说「像素稍微再调低点」。
  ⚠️ 三件事：① `<img>` **必须带 `[image-rendering:pixelated]`**（否则被插值糊掉）；
  ② 尺寸同 SVG 那套 `h-auto max-h-[50vh] w-full object-contain`（少了 `object-contain` 会被
  max-h 压扁）；③ **墙上那幅仍是 `strokes` 的粗颗粒版**，只有大图换 —— 首屏不多一个请求。
  ⚠️ 原照片**不在仓库里**（在 WorkBuddy 附件缓存 `~/.workbuddy/blobs/`），要重做只能重新量化，
  生成脚本是一次性的、验完已删。
- ⚠️ 画框那 100×96 的热区**会吃掉这一块的拖拽落点**（钉子那一条仍透过去）；新增面板要把
  `paintingOpen` 加进 Esc 那条 effect、`guest 转发输入` 与 `blur 焦点` 两处 guard 及其 deps。

## 联机（1 对 1，不支持三人）

- wire 上**只传钮名**（`ButtonMessage {b,d}`）。**加入者按的是 1P 那组键**（他在游戏里是 2P）；
  键位面板房间里两种角色都锁 1P 那组、标签 `keybind.mine`。房主 P1/P2 不许撞键的校验**必须留着**。
- 链路：`物理 key → codeToButton(bindings.p1) → 钮名 → netplay.sendButton → 房主 controller.pressButton(button, 2, down) → 合成键盘事件`。
- 文案里**不要列键位**，一律 `playerLegend()` 现算。
- 提示通道 `netplayToast = {key, kind:'ok'|'danger'}`：连上绿、**离开红**（`toastGuestLeft` / `toastHostLeft`）。
  判据必须互斥：房主看 `status === 'waiting'`，加入者看 `error === 'host-left'` 且**比「原因码从无到有」**；
  ⚠️ 断开时控制器**连发两次 `onState`**（第二次 `role` 已是 null）⇒ `lastRole` **只在 role 非 null 时更新**。
- 房主暂停要明说给加入者：`SessionMessage.z?: 0 | 1`（只信 `playing && z === 1`），状态存 `localPaused`、整包发。
  屏幕暂停层判据 `paused || (remotePaused && Boolean(remoteStream))` —— **必须用 `remoteStream` 而非 `hasPicture`**。
  暂停权**只在房主**。
- 三人必须挡在门外（传输层能多人，卡在玩家位 / 注入键位 / 房间状态三层）：房主对多余 peer 定向发
  `{t:'full'}`，被拒方自己 `leave()` + `fail('room-full')`；⚠️ `onPeerLeave(peerId)` 必须加
  `peerId !== state.peerId` 判据。`room-full` **不走 toast**，改**重开联机面板**摆红字。
- **房主掉帧 = 整局变慢**（RetroArch rAF 主循环不跳帧）。出画质量三档唯一出口 `lib/netplay.ts` 的
  `QUALITY_SPEC`；**换档 = 重建整条流**；编码参数只能靠 `room.getPeers()` → `getSenders()` → `setParameters`；
  **只有帧率**能减轻主线程，改不动先降帧率。

## 手柄

- 引擎层白送（rwebpad autoconfig 到 1P），本站无手柄代码。两个手柄按 `getGamepads()` 枚举顺序自动分 1P/2P。
  ⚠️ **单手柄永远落 1P** ⇒「键盘 1P + 手柄 2P」做不到，跟用户解释双人方案时要主动说这条。
- 联机时加入者的手柄也生效：转发 effect 里 rAF 轮询，映射表 `lib/gamepad.ts`（**必须和引擎一致**；
  0/1 反：手柄下键 → RetroPad B、右键 → A；l2/r2/l3/r3 映射 `null` 丢掉）。
  键盘 / 手柄**各自记账再取并集**（两边各发各的会误发 keyup，角色突然停住）；切后台用 `visibilitychange` 补 keyup。

## 游戏库列表：服务端分页（前后台共用）

- **唯一入口 `lib/server/games.ts` 的 `listGamesPage(offset, limit, {keyword, consoleType})`**
  （前台 `/api/games` 15/页；后台 `/api/admin/games` 10/页 + 鉴权），返回 `{games,total,offset,limit}`。
- 排序必须 `created_at DESC, id DESC`（毫秒时间戳撞同值、SQLite 并列行顺序不稳 ⇒ 会「出现两次 / 消失一条」）。
- 分页后搜索 / 筛选**只能落服务端**（代价：COUNT + SELECT 两次 D1 往返）⇒ 前台搜索是**提交式**，不边打字边发。
- ⚠️ `SEARCH_CONDITION` 只匹配 title / developer / series，**刻意不含 `language`**（实测 58 条里 53 条 `en`，
  纳进去搜索框直接失灵）；绑定值写死 `?1`，**关键词必须是第 1 个绑定参数**。
- ⚠️ `total` 与 `offset` 必须描述同一批数据 ——「夹到的那页真为空才回退一页」**别删**。
- 遗留：`safeOffset` 只 `Math.min`、不吸附页边界（调用方都传 10 的倍数，先挂着）。

## 部署 / 协作习惯

- 线上建议配服务端变量 `SITE_URL`（无 `NEXT_PUBLIC_`）；**不做 `output: 'export'`**；部署平台见
  `.workbuddy-ai/memory/REFERENCE.md`。
- 注释一律写「为什么这么做」，**包括否掉的方案** —— 本仓库既有风格。
- 临时探针（`TEMP-PROBE`、`__PAD_LOG__`、`tmp-*` 脚手架）验完**必须删**。
- ⚠️ **别拿生产数据做删除类测试**：`.env.local` 里的 D1 / R2 是**真库**（2026-10-12 误删过 4 条游戏）。
- ⚠️ **删掉的 ROM 找不回来**：R2 桶**没开版本控制**（`GetBucketVersioning` 空、`ListObjectVersions` 直接
  `NotImplemented`）⇒ 对象一删就是永久。删游戏必须走后台，别用脚本直接打 R2。
  D1 那边仍有 **Time Travel**（`/d1/database/{id}/time_travel/bookmark` 取书签，30 天窗口），
  但只支持**整库原地回滚**（`time_travel/restore`），**没有**「只读查历史」的接口
  （`wrangler d1 execute` 也没有 `--bookmark`）⇒ 想核对历史数据只能先回滚、看完再回滚回来，
  **必须用户点头**再做；而且 R2 文件既已丢，恢复记录只会造出断链条目。
- 改完提醒用户跑 `pnpm typecheck`，lint 保持基线（6 条 React Compiler 抱怨，在 ConsoleScene /
  KeyBindingsPanel / OnboardingTour）。
- 屏幕内文案纯英文、不进 i18n；要读的说明一律走浮层面板。
- ⚠️⚠️ **不要主动实测**（用户 2026-10-12 明确要求：「我每明说需要测试的功能你就不要测试」）：
  改完代码**默认只做** typecheck + lint 保持基线，然后讲清楚改动交给用户自己看；
  **不要**自作主张起浏览器 / 探针 / 截图验证。用户说要测再测 —— 下面这些手法只在那种时候用。

## 实测手法速查

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
