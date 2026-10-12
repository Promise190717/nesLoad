# nesLoad — 项目长期记忆

> 只留**动手前必须知道的硬约束**；来龙去脉见 `.workbuddy/memory/YYYY-MM-DD.md`。
> **动手前先 `git status`**（工作区常有未提交的活；另有进程并发改同一批文件）。

## 站名 / 定位

- 站名**复古游戏屋**唯一来源 `lib/i18n.ts` 的 `SITE_NAME`，文案写 `{site}`，别手写。
- **别动**：`package.json` name、`nesload:*` 存储键、`nesload_locale`/`nesload_admin` cookie、`netplay.ts` 的 `APP_ID`。
- 基调：玩复古游戏 + 在线库 + 自己的 ROM 拖进来跑，别说成「卡带加载器」。

## 两台机器 / 尺寸链

- 桌面 = 像素房间 + `RetroTv`；移动端 = 竖掌机 `HandheldConsole`；**必须二选一**（各一个 canvas）。
- 移动端判据是**设备**：`<html data-mobile>` 由 BOOT_INIT 写，逻辑在 `lib/device.ts`（**内联脚本手抄一份，改一处必须同步另一处**）。
- 尺寸链唯一出口 = globals.css `--tv-*`（720/840/960 → `--tv-w` → `--tv-base-w` → `--desk-w` = 机身 + 左右各 140，**不能收窄**）。
- ⚠️ 屏幕尺寸**必须写死在 `.screen` 的 class**：不能删、不能改内联、不能让 canvas 撑尺寸（否则每换一盘游戏机身乘一次 dpr）；emulator launch size 用 `SCREEN_WIDTH/HEIGHT` 常量，**别读 `canvas.width`**。

## 移动端掌机

- 顺序：顶沿（**只剩右边 PWR 灯**，机名已删别补回）→ 屏幕（`min(560px, calc(100vw - 28px))`，4:3）→ 功能排 → 弹性留白 → 控制区（两排间 `gap-8` 防误触）。
- ⚠️ **音量整块删了**别再补（`volume` 仍传给屏幕）。
- `.screen-frame` 只挂掌机内圈：`fit-content` + 左右 `auto` + `padding: 0 4px`。
- ⚠️⚠️ 屏幕两侧「白边」是内圈身份证，**只能收细不能收没**（收了竖向像素描边被 `overflow-x:hidden` 裁掉）。现 `.room` 左右 6、内圈内衬 4。
- 控制区上下垫空 div（`flex-[2]`:`flex-[1]`）不贴底不贴屏幕。
- ⚠️ 面键间距 `FACE_GAP = 14`（横纵同值）别调小：描边画在盒子外，可见缝 = gap − 4。
- 面键按机种长：默认 B/A；SFC 四键 `y`/`x`；街机 `b a y x l r`。竖屏 320~768 不溢出；横屏会滚（未处理）。

## 内容页 / SEO

- 真路由：`/games`（15/页，`?page=N` + `?q=`，非规范一律 307）· `/games/[id]` · `/games/[id]/download` · `/privacy` · `/terms` · `/developers` · `/developers/[id]`；404 一页盖详情+下载。
- ⚠️ `/games` 30 分钟缓存只走 `listGamesPageCached`，**别下沉进 `listGamesPage`**（房间弹窗/后台要即时）。
- 搜索：规范拼法 `?q=…&page=N`；翻页必带关键词（`gamesHref`）；搜索页 `noindex, follow`；关键词上限 64 码点。
- 首屏 SSR 已定型（async 服务端组件、无骨架无 fetch），**别加 loading/Suspense**；`GamesShell` 的 `label` 必须全 ASCII（font-pixel 无 CJK）。
- ⚠️ 下载页只有「开始下载」一颗钮（兜底直链被用户删了，别加回）；详情页正文只有一段（第二段被删，别补回）。
- 详情页三钮：开始游戏（`/?id=`）· 下载 ROM · 分享（`ShareGameButton` 是唯一客户端组件，用 `resolveSiteOrigin()`）。

## 操作入口

- **全站唯一键盘操作是 `Esc`**；P/R/F5/F8 已撤，别再往 ConsoleScene keydown 里加快捷键。
- `.top-links`（列表+隐私+条款）与移动端盾牌弹层**互补、任意时刻恰好一个入口**，改一条必须看另一条；媒体查询都带 `min-width: 900px`。
- 窗口矮于 770/860/950（= 屏幕高 + 230）换回盾牌钮，「游戏列表」跟着藏。

## 彩蛋 / 挂画

- 逗猫棒 → `TvCat` 从书堆后探头 2.9s；`TvCat` 坐标从书堆几何倒推，DOM 必须排在 `RoomDesk` 前。
- 挂画在 `RoomBackdrop.tsx` 的 `PAINTINGS`；画名/作者只在 i18n `painting.*`；第七幅说法固定「不知从哪来的不知名画作 / 佚名」。
- ⚠️ 「抽到哪一幅」是 ConsoleScene 的 `wallPainting` 状态，不在 `RoomPainting`；抽签 effect 挂载后 + `setTimeout(…,0)`；`PaintingPanel` 背板固定暗色。

## 联机（1 对 1）

- wire 只传钮名 `{b,d}`；加入者按 1P 键组（游戏里是 2P）；文案不列键位，走 `playerLegend()`。
- toast 判据必须互斥；断开时 `onState` 连发两次 ⇒ `lastRole` 只在 role 非空时更新。
- 房主暂停经 `z` 标志广播；暂停层用 `remoteStream` 不用 `hasPicture`。
- 三人三层拦截；`onPeerLeave` 必须带 `peerId !== state.peerId`；`room-full` 重开面板摆红字。
- 质量三档唯一出口 `lib/netplay.ts` 的 `QUALITY_SPEC`；换档重建整条流；只有帧率能减轻主线程。

## 手柄

- 引擎 autoconfig 到 1P；两手柄按枚举顺序分 1P/2P；**单手柄永远落 1P**。
- 映射表 `lib/gamepad.ts` 必须和引擎一致（下键→B、右键→A；l2/r2/l3/r3 → null）；键盘/手柄各自记账取并集；切后台 `visibilitychange` 补 keyup。

## 游戏库列表

- 唯一入口 `lib/server/games.ts` 的 `listGamesPage(offset, limit, {keyword, consoleType, developerId})`；排序必须 `created_at DESC, id DESC`。
- 搜索只匹配 title/developer/series，**刻意不含 language/description**；关键词是第 1 个绑定参数。
- `GameLibraryPanel` 的 tab/筛选/页码/滚动/整页 `snapshot` 在模块级单例 `libraryMemory`；`settledKey === queryKey` 守卫别改成 useRef；卡片错峰唯一出口 `lib/card-stagger.ts`。

## 公开内容页

- ⚠️ 左上返回：游戏详情「← 全部游戏」与**开发商详情「返回」**都是浏览器回退（`BackLink`，`mode:'history'`，兜底 push 列表页）；下载页回详情、列表页回房间、开发商 404 页仍是普通 `<Link>`，别跟着改。
- 单条数据走 `getGame(id)`，只有首页深链走 HTTP；sitemap 从 `listGameStubs()` 现读，读库失败退化成静态地址。
- 深链开窗判据是 `deepLinkOpen` 不是 `deepLinkGame`；取消走 `cancelDeepLink()` 两段都 abort；`setDeepLinkOpen(true)` 必须包 `Promise.resolve().then()`。

## 开发商库（2026-10-12 加）

- 统一叫**开发商**（复用 `games.developer` 含义）；`developers` 表 + `games.developer_id` 外键；老文本列保留（列表页 meta 行还读它）。
- 迁移 `scripts/add-developers.mjs` 幂等只补空；老数据填反的（「西游释厄传」等）原样照搬没清洗；表现存 18 个正常厂商。
- 数据层 `lib/server/developers.ts`；后台 `/api/admin/developers`（+`/[id]`、`/options`）；前台 `/developers` + `/developers/[id]`（名下游戏 30 分钟缓存，资料不缓存）；网格共用 `GameCardGrid`、分页共用 `lib/pager.ts`。

## 部署 / 协作

- 线上配服务端变量 `SITE_URL`；不做 `output: 'export'`。
- 注释写「为什么这么做」**包括否掉的方案**；临时探针验完必须删。
- ⚠️ 别拿生产数据做删除类测试（D1/R2 是真库）；R2 无版本控制，删 ROM 永久丢，删游戏必须走后台。
- 改完跑 `pnpm typecheck`；lint 基线 = 364 problems / 15 errors / 349 warnings，别再多；`pnpm build` 本机跑不了（沙箱拦 `.next` 清理），交给用户。
- ⚠️⚠️ **不要主动实测**（用户明确要求）：改完只做 typecheck + lint 基线，讲清楚交给用户自己看；用户说要测再测（手法见 2026-10-12.md）。
