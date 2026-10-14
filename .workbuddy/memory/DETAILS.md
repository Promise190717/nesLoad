# nesLoad — 功能细节（`MEMORY.md` 的附表）

> 只放「改这块之前必须知道」的细节；总纲与硬约束见 `MEMORY.md`。

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

- **分两层**。第一层三颗实体钮 = 站内紧凑钮那档（`py-2` + 12px 字，**三颗必须同档**），`gap-2`：开始游戏（唯一 accent + `▸`）/ 收藏 / 下载 ROM。⚠️ 钮内符号一律 **`text-[15px] leading-none`**（**钮缩小 ≠ 图标跟着缩**）。
- 第二层无描边「图标 + 文字」链接：分享（`ShareIcon`）/ 反馈（`ReportIcon`），常态 `text-accent`，hover 只划字。两层间 **`mt-6` 不能收回**。**别再塞第 4 颗、别给第二层加回描边**。
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
