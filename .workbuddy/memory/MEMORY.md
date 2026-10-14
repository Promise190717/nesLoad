# nesLoad — 项目长期记忆

> 只留**动手前必须知道的硬约束**；细节/来龙去脉见 `.workbuddy/memory/YYYY-MM-DD.md`。
> **动手前先 `git status`**（工作区常有未提交的活；另有进程并发改同一批文件）。
> ⚠️⚠️ **不要主动实测**（用户明确要求）：改完只做 typecheck + lint 基线，讲清楚交给用户看。

## 铁律 / 命名

- 站名**复古游戏屋**唯一来源 `lib/i18n.ts` 的 `SITE_NAME`，文案写 `{site}`。
- **别动**：`package.json` name、`nesload:*` 存储键、`nesload_locale`/`nesload_admin` cookie、`netplay.ts` 的 `APP_ID`。
- 基调：玩复古游戏 + 在线库 + 自己的 ROM 拖进来跑，别说成「卡带加载器」。
- **全站唯一键盘操作是 `Esc`**（P/R/F5/F8 已撤，别再往 ConsoleScene keydown 加快捷键）。
- 法务文案（`lib/legal.ts`，中英各一份，改一节两份都动）**书面、尽量短、不口语化**，**别用破折号 / 括号做补充说明**，逐项罗列要概括（用户 2026-10-13/10-14 连着两次提）；内容必须与本站实际行为一致（账号系统 2026-10-14 已上线）。
- 注释写「为什么这么做」**包括否掉的方案**；临时探针验完必须删。

## 两台机器 / 尺寸链

- 桌面 = 像素房间 + `RetroTv`；移动端 = 竖掌机 `HandheldConsole`；**必须二选一**（各一个 canvas）。
- 移动端判据是**设备**：`<html data-mobile>` 由 BOOT_INIT 写，逻辑在 `lib/device.ts`（**内联脚本手抄一份，改一处必须同步另一处**）。
- 尺寸链唯一出口 = globals.css `--tv-*`：**档位只写上限**（`--tv-screen-max` 720/840/960、`--tv-base-max` 450/520/600），实际值 = `min(上限, 100vw − 360px)`；`--desk-w` = 机身 + 左右各 140，**不能收窄**；`--tv-base-w` 按 5/8 从屏幕推。**≥1068px 时三档值一个没变**。
- ⚠️ 「请用桌面端」提示（`.pc-notice`）2026-10-13 全删 —— 别加回来。
- ⚠️ 屏幕尺寸**必须写死在 `.screen` 的 class**（不能删/改内联/让 canvas 撑）；emulator launch size 用 `SCREEN_WIDTH/HEIGHT` 常量，**别读 `canvas.width`**。
- 掌机顶沿**只剩 PWR 灯且在左边**（机名已删）；⚠️ **灯在左 ⇔ 菜单钮在右**（一对一起改）。**音量整块删了**别再补。
- ⚠️⚠️ 掌机屏幕两侧「白边」是内圈身份证，**只能收细不能收没**（`.room` 左右 6、内圈内衬 4）。面键间距 `FACE_GAP = 14` 别调小（可见缝 = gap − 4）。

## 路由 / 缓存 / SEO

- 真路由：`/games`（15/页，`?page=N`+`?q=`，非规范 307）· `/games/[id]` · `/games/[id]/download` · `/privacy` · `/terms` · `/developers` · `/developers/[id]`；404 一页盖详情+下载。
- ⚠️ `/games` 30 分钟缓存只走 `listGamesPageCached`，**别下沉进 `listGamesPage`**（房间弹窗/后台要即时）。
- 首页三区块 = **24 小时**缓存，和 `/games` 的 30 分钟**分开两份**：`listLatestGamesCached`（键 `games:latest`，别拿 `listGamesPageCached` 顶替）/ `countGamesByConsoleCached` / `listTopDevelopersCached`；TTL 常量 `HOME_REVALIDATE_SECONDS`（`developers.ts` 有等值手抄，改一处要改两处）。
- 首页**不该有** `export const revalidate`（根布局读 cookie/请求头 ⇒ 全站动态，加了是死代码）。缓存一律留在「页-侧」`unstable_cache`，不下沉数据层。
- 搜索：规范拼法 `?q=…&page=N`；翻页必带关键词（`gamesHref`）；搜索页 `noindex, follow`；关键词上限 64 码点。
- 首屏 SSR 已定型（async 服务端组件、无骨架无 fetch），**别加 loading/Suspense**；`GamesShell` 的 `label` 必须全 ASCII（font-pixel 无 CJK）。
- 详情页正文只有一段（第二段已删别补）；下载页只有「开始下载」一颗钮（兜底直链已删别加回）。
- ⚠️ 左上「返回」：**只有开发商列表页 + 两个 404 页**是普通 `<Link>`；**游戏列表/详情/下载/开发商详情四页全是浏览器回退**（`BackLink`，`mode:'history'`，文案 `common.back`）。兜底依次：列表→`/play`、详情→`/games`、下载→`/games/<id>`。**别把列表页改回 `link`**。
- 单条数据走 `getGame(id)`，只有首页深链走 HTTP；sitemap 从 `listGameStubs()` 现读。
- 深链开窗判据是 `deepLinkOpen` 不是 `deepLinkGame`；`setDeepLinkOpen(true)` 必须包 `Promise.resolve().then()`。
- 列表唯一入口 `listGamesPage(offset, limit, {keyword, consoleType, developerId})`，排序 `created_at DESC, id DESC`；搜索只匹配 title/developer/series（**刻意不含 language/description**），关键词是第 1 个绑定参数。
- `GameLibraryPanel` 的 tab/筛选/页码/滚动在模块级单例 `libraryMemory`；`settledKey === queryKey` 守卫别改成 useRef；卡片错峰唯一出口 `lib/card-stagger.ts`。

## 操作入口 / 抽屉

- **两处入口 = 一份 DOM、两套布局**：`.top-links`（语言/账号/游戏列表/隐私/条款）+ 右侧 `.rail` 都包在 `.entries`；大屏 `.entries` 是 `display: contents`，小屏变右侧滑出抽屉。
- **小屏判据唯一出口** = globals.css 的 `@media (max-width: 899px), (max-height: 949px)`（原 770/860/950 三档已删）。抽屉开合 = `menuOpen`；`.menu-btn` 大小屏都在右上角。z 序：遮罩 44 < 抽屉 45 < 菜单钮 46 < 面板 50；toploader zIndex 70。
- ⚠️ 抽屉里是**一份清单不是两摞**：compact 时两个容器都 `display: contents`，靠 `.entries .X { order: N }` 交错；「行」那条规则特异性比 `display:none` 高 ⇒ 排除项必须写进 `:not()`。
- ⚠️ 每行 = 图标 + 文案：`span.row-label` 只加 rail 按钮、`span.row-icon` 只加 top-links，大屏都 `display:none`（`.theme-toggle > span` 只能冲两个图标类）。
- ⚠️ 抽屉藏三类：`.rail-desktop`、`.rail-account`、`.top-games`。
- ⚠️ 菜单钮图标是 **`MenuGlyph`**（ConsoleScene 内，三横↔叉），不在 `icons.tsx`（`MenuIcon` 已删）；阴影走 **`filter: drop-shadow`**（**不能用 box-shadow**，会顶掉 `.pixel-edge` 描边）。
- ⚠️ 语言是**自绘下拉**（`.locale-menu` 等），不是原生 `<select>`；点选项 `rememberLocale()` **先写 cookie 再** `router.push(altHref)`；抽屉里 `.locale-options` 改 `position: static`。⚠️ **盾牌钮那套已全删**别加回。
- ⚠️ 隐私/条款 `target="_blank"`；**「游戏列表」是当前页跳转**（同份 DOM 不用两处维护）。点它时若房间有活（`roomBusy`）先弹 `leaveOpen` 确认框；「离开」是 `<Link href="/games">`（**没引 `useRouter`**）。Esc / 焦点收尾 / guest 键盘转发三处 effect 都带 `leaveOpen`。
- 抽屉点条目会收起（`.entries` 的 onClick 捕获），**只放过** `.locale-menu` 和 `.theme-toggle`。
- 「电视机大小」弹层和语言下拉共用一条 pointerdown 收法；Esc effect 里也要带 `localeMenuOpen`。
- ⚠️ `.rail` 图标 `size` **必须 = 16**（非整数缩放会在 DPR=1 屏吃没细线）；按钮 16+6×2 = **28px**，对齐 `RailDivider` 的 `w-7`。
- ⚠️ `icons.tsx` 最小线宽 = **2px**；**唯一例外** `PlayersIcon` 头顶 4 条信号线（1px）。改完自查：`<rect>` 筛 `width<2||height<2`、筛 `x+w>16||y+h>16`。
- ⚠️ 「自定义按键」钮图标是 **`GamepadIcon`（手柄）**不是键盘（`KeyboardIcon` 已删）；tooltip `keybind.open` =「按键设置」≠ 面板标题 `keybind.title`「自定义按键」，**故意不同名**。
- ⚠️ `WarningIcon` 是唯一不纯 `currentColor` 的图标：三角走 currentColor，感叹号**写死 `#08080a`**。别改空心/继承色。

## 顶部路由加载条（nextjs-toploader 3.9.17）

- 参数固定：`color="var(--color-accent)"`（包把 color 拼进 CSS，**能吃 CSS 变量** → 跟主题）、`showSpinner={false}`、`zIndex={70}`、`height={3}`。挂在 `app/layout.tsx` 的 `<body>`。
- 它只**听** document click + history 补丁 + popstate。`router.back()` 只有 done 不画条。
- ⚠️ **三处手动喊 `useTopLoader()`**（全站搜 `topLoader`）：① ConsoleScene 被 `leaveOpen` 拦下的那次点击 `done()`；② 语言下拉 `router.push` 前 `start()`；③ AccountCenter 退出登录 push 同。**`router.refresh()` 不能喊 start**。
- ⚠️ ①必须写在 **`leaveOpen` 的 effect 里**（包的监听也在 document，顺序不定）。⚠️ `useTopLoader()` 每渲染返回新对象 ⇒ 用 `useState(() => topLoader.done)` 冻结（**不能** `useRef(...).current`）。
- ⚠️ **下载不能起条**：包把任何同源 `<a>` 点击当换页（不看 `download`）⇒ 条挂 99%。**下载一律走 `lib/download.ts` 的 `downloadFile(source, filename)`**（造链时 `stopPropagation`）；**别手写 `<a download>`**。调用点：`RomDownloadGate`、`lib/emulator.ts` 的 `downloadState`。

## 各功能要点

- **彩蛋/挂画**：逗猫棒 → `TvCat` 探头 2.9s（DOM 排在 `RoomDesk` 前）；挂画列表 `RoomBackdrop.tsx` 的 `PAINTINGS`，画名只在 i18n `painting.*`；「抽到哪幅」是 ConsoleScene 的 `wallPainting`（不在 `RoomPainting`）。
- **联机（1v1）**：wire 只传钮名 `{b,d}`；加入者按 1P 键组；toast 判据必须互斥，断开时 `onState` 连发两次 ⇒ `lastRole` 只在 role 非空时更新；房主暂停经 `z` 广播；`onPeerLeave` 必须带 `peerId !== state.peerId`；质量三档唯一出口 `QUALITY_SPEC`。对外三处措辞对齐：`home.hero.lead`/`home.faq.a6`/`netplay.open`；**首页不写「仅局域网/需配 TURN」**（由 `netplay.wanDev` 兜）。
- **手柄**：引擎 autoconfig 到 1P；两手柄按枚举顺序分 1P/2P；**单手柄永远落 1P**；映射表 `lib/gamepad.ts` 必须和引擎一致；切后台 `visibilitychange` 补 keyup。
- **游戏反馈（2026-10-13 加）**：详情页那颗「反馈问题」（`ReportGameButton`，弹窗 + 非空两道校验，**匿名提交**，`MAX_LENGTH=500` 手抄自 `REPORT_MAX_LENGTH`）+ 收藏数（挂在 `FavoriteButton` 上，`★ 收藏 12`，服务端给初值、前端乐观更新；`countGameFavorites` 刻意不缓存）。表 `game_reports`（**和留言本 `feedback` 是两张表，别合并**：那个公开可读、这个只给后台）。DDL 在 `db/schema.sql` 与 `scripts/add-game-reports.mjs` **两份必须逐字一致**；已对真库跑过。接口 `POST /api/game-reports`（**刻意没有 GET**）、`GET|PATCH /api/admin/game-reports`。数据层 `lib/server/reports.ts`（游标翻页，**不带进程内缓存**——只有后台读）。后台 `/admin/reports` tab 排在留言本后。
- **详情页动作区（2026-10-13 重排，尺寸同日又降过一档）**：**分两层**。第一层实体钮 = 站内**紧凑钮**那档（`py-2`+`12px`，2026-10-13 用户「上面三个按钮的尺寸缩小点」从 `py-2.5`+`13px` 降下来，**这三颗必须同档**），行内 `gap-2`；开始游戏（唯一 accent + `▸`，`px-5` 最宽）/ 收藏（`px-3.5`，`★ 收藏 12`）/ 下载 ROM（`px-3.5`，`↓`）。⚠️ **钮内那三个符号一律 `text-[15px] leading-none`**（钮里的字才 12px）—— **钮缩小 ≠ 图标跟着缩**：当初把符号跟着降到 10px，用户立刻说「这仨个按钮前面的图标都太小了」。15px 是照 `icons.tsx` 那套 `size=16` 配 12px 字的比例定的；配 `leading-none` 才不会撑高钮（15px < 文字 18px 行高），**三颗必须同尺寸**。第二层**无描边的「图标 + 文字」链接**：分享（`ShareIcon`）/ 反馈（`ReportIcon`），**常态字色 = `text-accent`**、hover 只加下划线（`group-hover:underline`，只划字不划图标）—— 和同页资料表那个「开发商」链接同一个「文字链接 = 强调色」口径；两层之间 **`mt-6`（24px，= 全页段落间距）不能收回 `mt-3`**（用户 2026-10-13「距离上面三个按钮距离大点」，12px 时二层像黏在一层的尾巴上）。**别再往第一层塞第 4 颗、也别给第二层加回描边**（用户 2026-10-13 原话「这五个按钮放在一排 真的丑」，丑在没主次）。安静行里没有钮身可依托 ⇒ 分享钮靠**字色**给成败反馈（`text-ok` / `text-danger`，1.6s 后褪回）。
- ⚠️ `icons.tsx` 新增两个图标：`ShareIcon`（托盘 + 升出的箭头，**托盘上口留开**，封上就变成「下载箱」）/ `ReportIcon`（空心气泡 + ``!``，左下两级台阶尾巴）。16px 里**别画斜线**（分享那套「三点连线」就是因此否掉的）。
- **游戏评论（2026-10-13 加）**：详情页**详情模块正下方**那个评论模块（`components/GameComments.tsx`，客户端组件）。**发评论必须先登录**（用户要求）—— 登录态由详情页服务端 `readViewer()`（`cache()` 包着，**只验签名不查库**）当 `signedIn` 传进去，所以首屏就是对的；未登录只给「去登录」链接（`?next=/games/<id>`，**不带语言前缀**，拼前缀是登录页的事）。**列表公开可读**，翻页只有「加载更多」（新的在前）。表 `game_comments`：`user_id` + `username` 快照 + `content`，**和 `feedback`/`game_reports` 刻意相反 —— 这条有作者**；DDL 在 `db/schema.sql` 与 `scripts/add-game-comments.mjs` **两份逐字一致**，**已对真库跑过**。接口 `GET|POST /api/games/[id]/comments`（POST 走 `assertUser`）、`DELETE /api/comments/[id]`（**只认作者**，非作者/不存在一律 404，**不回 403**）。数据层 `lib/server/comments.ts`（游标翻页 + `LEFT JOIN app_users` 取头像与现名，账号没了退回快照）；⚠️ `Comment.userId` **不许出网**，路由层换成 `mine` 标记。**没有后台评论 tab、没有 status 位**：这一版唯一的管理手段就是作者自己两步确认删。`COMMENT_PAGE_SIZE=10` / `COMMENT_MAX_LENGTH=500` / `RATING_MIN=1` / `RATING_MAX=5` 在组件里手抄一份（客户端不许 import 那个含 node:crypto 的模块）。
- **评论星级（2026-10-13 加，用户要求「评论有星星 1-5」）**：`rating` 和正文**同一次提交、同一条记录**（没有「只打分不写字」的通道，D1 列 `INTEGER NOT NULL`）。列是**老库 ALTER 补的**（`scripts/add-game-comments-rating.mjs`，PRAGMA 判存在⇒幂等；已对真库跑过，当时 0 行）⇒ **刻意不写 CHECK**，1..5 只在 `POST /api/games/[id]/comments` 校验（写了 CHECK 会「新库拦得住老库拦不住」）。前端：**星默认满星 5**、字号**发表框 24px / 列表每条 14px / 标题那颗均分星 13px**（2026-10-13 用户连着两次「大一点」「增大」，字号一路 14→18→24、间距 `px-1.5`→`px-0.5`（间隔 4px），**只动这两样、字符与字体栈从没换过**；2026-10-13 用户改的口径 —— 原先默认 0、「忘改 vs 真给 5 星」分不开那套理由已被明确推翻，**别再改回去**）、不选只提示不灰按钮（同「写点什么」那条路，界面上够不着），发表/删除后 `shiftSummary()` 把标题的均分 / 人数**乐观挪一格**。评论标题 **14px + `font-semibold`**（全站无 `font-bold`，h1 也是 semibold —— 加粗一律走 semibold）。⚠️ **星是字符 `★`/`☆`，用它的地方处处都要带 `.star-glyph`**（`app/globals.css`）：主字体没有这两个字形 ⇒ 浏览器**按 `<html lang>` 挑兜底字体**，zh 落到中文字体（全角、大）、en 落到西文/符号字体（同字号只画一小团），用户报过「英文下星星还是小的」，把 CJK 字体排栈首才两边一致。⚠️⚠️ **别再改成画出来的图形**：试过像素星 `StarIcon`（尺寸确实一致），用户嫌「马赛克」，当天撤掉。**均分必须全量**（`getGameRatingSummary` 单独一条 `AVG/COUNT ... WHERE game_id=?`，吃 `idx_game_comments_game` 前缀），**不许拿当前页 items 算**（分页会让均分随「加载更多」掉）。标题那块显示**数字** `★ 4.3 / 5 · N 条评论`（不画半星，像素风里半颗星是糊的）。
- **开发商库**：统一叫「开发商」；`developers` 表 + `games.developer_id` 外键（老文本列保留）；数据层 `lib/server/developers.ts`；后台 `/api/admin/developers`；前台 `/developers`（名下游戏 30 分钟缓存，资料不缓存）；网格共用 `GameCardGrid`、分页共用 `lib/pager.ts`。

## 部署 / 校验

- 线上配服务端变量 `SITE_URL`；不做 `output: 'export'`。
- ⚠️ 别拿生产数据做删除类测试（D1/R2 是真库）；R2 无版本控制，删 ROM 永久丢。
- 改完跑 `pnpm typecheck`（⚠️ `incremental: true` 会**假报** `lib/i18n.ts` 缺 key；全量 `npx tsc --noEmit --incremental false` 才真）。lint 基线以前一天实测值为准，**报数时说清「我改的文件 0 条」**。`pnpm build` 本机跑不了（沙箱拦 `.next` 清理），交给用户。
