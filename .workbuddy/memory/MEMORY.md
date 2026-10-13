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
- 尺寸链唯一出口 = globals.css `--tv-*`。2026-10-13 起分两层：**档位只写上限**（`--tv-screen-max` 720/840/960、`--tv-base-max` 450/520/600），实际值 = `min(上限, 100vw − 360px)`（360 = 20 + 280 + px-6 48 + 12 余量；`--desk-w` = 机身 + 左右各 140，**不能收窄**），`--tv-base-w` 按 5/8 从屏幕推。**≥1068px 宽时三档的值一个都没变**；窄窗口屋子自动缩，不再切边。
- ⚠️ **「请用桌面端」那块提示（`.pc-notice` / `notice.desktopOnly*`）2026-10-13 全删了**（用户要求取消）—— 窄窗口照画屋子（靠上面那条 min() 收）。别再加回来。
- ⚠️ 屏幕尺寸**必须写死在 `.screen` 的 class**：不能删、不能改内联、不能让 canvas 撑尺寸（否则每换一盘游戏机身乘一次 dpr）；emulator launch size 用 `SCREEN_WIDTH/HEIGHT` 常量，**别读 `canvas.width`**。

## 移动端掌机

- 顺序：顶沿（**只剩 PWR 灯，2026-10-13 起在左边**「`mr-auto`」；机名已删别补回）→ 屏幕（`min(560px, calc(100vw - 28px))`，4:3）→ 功能排 → 弹性留白 → 控制区（两排间 `gap-8` 防误触）。
- ⚠️ **灯在左 ⇔ 菜单钮在右**（2026-10-13 用户要求）：掌机顶沿的灯和页面右上角那颗 `.menu-btn` 是一对，两边一起改；globals.css 里**不再有** `:root[data-mobile='on'] .menu-btn` 的位置覆盖。
- ⚠️ **音量整块删了**别再补（`volume` 仍传给屏幕）。
- `.screen-frame` 只挂掌机内圈：`fit-content` + 左右 `auto` + `padding: 0 4px`。
- ⚠️⚠️ 屏幕两侧「白边」是内圈身份证，**只能收细不能收没**（收了竖向像素描边被 `overflow-x:hidden` 裁掉）。现 `.room` 左右 6、内圈内衬 4。
- 控制区上下垫空 div（`flex-[2]`:`flex-[1]`）不贴底不贴屏幕。
- ⚠️ 面键间距 `FACE_GAP = 14`（横纵同值）别调小：描边画在盒子外，可见缝 = gap − 4。
- 面键按机种长：默认 B/A；SFC 四键 `y`/`x`；街机 `b a y x l r`。竖屏 320~768 不溢出；横屏会滚（未处理）。

## 内容页 / SEO

- 真路由：`/games`（15/页，`?page=N` + `?q=`，非规范一律 307）· `/games/[id]` · `/games/[id]/download` · `/privacy` · `/terms` · `/developers` · `/developers/[id]`；404 一页盖详情+下载。
- ⚠️ `/games` 30 分钟缓存只走 `listGamesPageCached`，**别下沉进 `listGamesPage`**（房间弹窗/后台要即时）。
- 首页（`/` 落地页）三个区块的缓存 = **24 小时**，和 `/games` 的 30 分钟**分开两份缓存**：最新收录走 `listLatestGamesCached`（键 `games:latest`，**别拿 `listGamesPageCached` 顶替**）；另两个是 `countGamesByConsoleCached` / `listTopDevelopersCached`。TTL 常量 = `HOME_REVALIDATE_SECONDS`（`developers.ts` 里有一份等值手抄，改一处要改两处）。
- 首页**不该有** `export const revalidate`：根布局读 cookie/请求头 ⇒ 全站动态渲染，页面级 revalidate 对路由缓存无效，加了也是死代码。首页（乃至本项目）的缓存一律留在「页-侧」的 `unstable_cache`，不下沉数据层。
- 搜索：规范拼法 `?q=…&page=N`；翻页必带关键词（`gamesHref`）；搜索页 `noindex, follow`；关键词上限 64 码点。
- 首屏 SSR 已定型（async 服务端组件、无骨架无 fetch），**别加 loading/Suspense**；`GamesShell` 的 `label` 必须全 ASCII（font-pixel 无 CJK）。
- ⚠️ 下载页只有「开始下载」一颗钮（兜底直链被用户删了，别加回）；详情页正文只有一段（第二段被删，别补回）。
- 详情页三钮：开始游戏（`/?id=`）· 下载 ROM · 分享（`ShareGameButton` 是唯一客户端组件，用 `resolveSiteOrigin()`）。

## 操作入口

- **全站唯一键盘操作是 `Esc`**；P/R/F5/F8 已撤，别再往 ConsoleScene keydown 里加快捷键。
- **两处入口 = 一份 DOM、两套布局**（2026-10-13 重构）：`.top-links`（语言/账号/游戏列表/隐私/条款）和右侧 `.rail` 都包在 `.entries` 里；大屏 `.entries` 是 `display: contents`（不生成盒子），小屏它变成从右侧滑出的抽屉。
- **小屏判据唯一出口 = globals.css 的「小屏抽屉」段**：`@media (max-width: 899px), (max-height: 949px)`；原来按 `data-tv` 分的 770/860/950 三档高度门槛**已删**、统一成 949（代价：中/小档在 860~949 会提前收抽屉）。抽屉开合 = ConsoleScene 的 `menuOpen`；菜单钮 `.menu-btn` **大屏/移动端都在右上角**（移动端原来挪左上角避 PWR 灯，灯挪到左边之后取消了）。z 序：遮罩 44 < 抽屉 45 < 菜单钮 46 < 面板 50。
- ⚠️ **抽屉里是「一份清单」，不是两摞**（2026-10-13）：compact 时 `.entries .top-links` 和 `.entries .rail` 都改 `display: contents`，两边的行直接成为抽屉的 flex 子项，靠 `.entries .X { order: N }` 交错排成 语言/账号/主题/游戏库/联机/按键设置 ── 按键说明/留言本 ── 隐私/条款；两道 `RailDivider` 是 `nth-of-type(1)/(2)` 摆位。⚠️ 「行」那条规则（`.entries .rail > button:not(…)` 等）**特异性比 `display:none` 高**，所以排除项必须写在 `:not()` 里。
- ⚠️ **每行 = 图标 + 文案**：文案 `span.row-label` 只加在 rail 的按钮里、图标 `span.row-icon` 只加在 top-links 那几条里，大屏两个都是 `display:none`（`.theme-toggle > span` 那条**只能冲两个图标类**，写成 `> span` 会让抽屉里的「主题」文案在大屏冒出来）。rail 的文案直接复用那颗钮的 `title`，只有主题另起了 `menu.theme`。
- ⚠️ **抽屉里藏掉三类**：`.rail-desktop`（全屏/简洁/电视机大小）、`.rail-account`（与右上角那条账号重复）、`.top-games`（与「游戏库」重复，留面板那条）。
- ⚠️ **菜单钮的图标是 `MenuGlyph`（ConsoleScene 内，三横 ↔ 叉 + 过渡）**，不在 `icons.tsx`（`MenuIcon` 已删）；样式 `.menu-glyph`。钮那圈阴影走 **`filter: drop-shadow`**（4 向 1px 硬影 + 一发柔影）——**不能用 `box-shadow`**，会顶掉 `.pixel-edge` 的四向描边。
- ⚠️ **语言是自绘下拉**（`.locale-menu` / `.locale-trigger` / `.locale-caret` / `.locale-options` / `.locale-option`），不是原生 `<select>`（2026-10-13 用户要求）；点选项仍走 `rememberLocale()` **先写 cookie 再** `router.push(altHref)`。抽屉里 `.locale-options` 改 `position: static`（就地展开，浮层会被抽屉的 `overflow-y:auto` 裁掉）。
- ⚠️ **盾牌钮那套已全删**（`.rail-mobile` / `legalMenuOpen` / shield 弹层 / i18n `legal.open` / 旧的互补规则）—— 别加回来。
- ⚠️ 隐私 / 条款是 `target="_blank"`，**「游戏列表」是当前页跳转**（2026-10-13 撤掉 `_blank` 与 `rel`）—— 大小屏是同一份 DOM，不用再两处分别维护。
- ⚠️ 点「游戏列表」时若房间**有活**（`roomBusy` = `rom !== null || netplayState.status !== 'idle'`）先弹 `leaveOpen` 确认框（留下 / 离开），空房间不拦直接跳；「离开」是一颗 `<Link href="/games">`（全站跳转一律走 `<Link>`，**没引 `useRouter`**）。Esc / 焦点收尾 / guest 键盘转发三处 effect 都已带 `leaveOpen`，改一处要看另两处。
- 抽屉里点条目会收起抽屉（`.entries` 的 `onClick` 捕获），**只放过** `.locale-menu`（语言）和 `.theme-toggle`（主题）这两个就地生效的控件。
- 「电视机大小」弹层和语言下拉**共用一条 pointerdown 收法**（`tvMenuOpen`/`localeMenuOpen` + `tvMenuRef`/`localeMenuRef`），Esc 那条 effect 里也要带 `localeMenuOpen`。
- ⚠️ 右侧开关列（`.rail`）图标 `size` **必须 = 16**（= `icons.tsx` 的 viewBox，别传 13/14）：非整数缩放（13/16=0.8125）在 DPR=1 屏（2K/1080p 桌面屏）上会把图标的 1px 细线吃没/变淡。按钮 = 16 + p-1.5(6×2) = **28px**，和 `RailDivider` 的 `w-7`(28) 对齐；`.locale-toggle` 的 `min-width/line-height`（28/16）跟着图标走。
- ⚠️ `icons.tsx` 的图标**最小线宽 = 2px**（2026-10-13 统一）；**唯一例外**是 `PlayersIcon` 头顶那 4 条信号线（1px，隔行画的，加粗会糊成实心三角）。改图标后自查：grep 所有 `<rect>` 筛 `width<2 || height<2` 找残留细线、筛 `x+w>16 || y+h>16` 查越界。
- ⚠️ 「自定义按键」那颗钮：图标是 **`GamepadIcon`（手柄）**不是键盘（键盘那套造型和 `StoreIcon`/`ShieldIcon` 方框撞脸，且按键本来就分手柄/键盘两条路，见 `lib/keybindings.ts`；`KeyboardIcon` 已删别改回）；tooltip/aria-label 走 `keybind.open` = **「按键设置 / Key settings」**，和面板标题 `keybind.title`（「自定义按键 / Key bindings」）**故意不同名**，别顺手统一。
- ⚠️ `WarningIcon`（警告三角）是全文件**唯一不纯 `currentColor`** 的图标：实心三角走 currentColor（调用处套 `text-warn`），中间感叹号**写死 `#08080a`** —— 黄底上要反色才读得出，而 `ink-950` 会跟主题翻（浅色下近白，白压黄看不见）。别把它改成空心 / 继承色。`--color-warn` 的用途因此从「只有 PWR 灯」变成两处。

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

- ⚠️ 左上「返回」只有**开发商列表页 + 两个 404 页**是普通 `<Link>`；**游戏列表 / 详情 / 下载 / 开发商详情四页全是浏览器回退**（`BackLink`，`mode:'history'`，文案一律 `common.back`）。兜底地址（直开/爬虫/中键才用）依次：列表页→`/play`、详情页→`/games`、下载页→`/games/<id>`。**别把列表页改回 `link`**（2026-10-13 用户要求「返回上一页」）。
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
- 改完跑 `pnpm typecheck`（⚠️ `incremental: true` 会**假报** `lib/i18n.ts` 缺 key / `[locale]` 页参数个数 —— 全量 `npx tsc --noEmit --incremental false` 才是真的）；lint 对齐上一次实测值（2026-10-13 收工 = **367 problems / 15 errors / 352 warnings**，其中 3 个 warning 来自工作区其他在途改动）。`pnpm build` 本机跑不了（沙箱拦 `.next` 清理），交给用户。
- ⚠️⚠️ **不要主动实测**（用户明确要求）：改完只做 typecheck + lint 基线，讲清楚交给用户自己看；用户说要测再测（手法见 2026-10-12.md）。
