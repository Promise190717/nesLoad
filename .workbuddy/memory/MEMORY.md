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

## H5 游戏专栏（FPS `toy-gunfight`）

- `/h5` + `/h5/toy-gunfight`：写实军事风 FPS（CF 视觉：直角 + 橙金 `#f0a020` + 近黑 `#0f1318`），局域网 1v1 + 人机。**与模拟器完全隔离**（不碰 Supabase / R2 / `emulator.ts` / `netplay.ts`），独立 `appId: 'nesload-fps'`。
- 🔴 **2026-11-12 当天多次重构，旧记忆里的 `render3d/world/game/map/character/net.ts` 等文件名已失效**。现行：`lib/h5/` 以 `engine.ts` 为中枢（renderer/scene/主循环），`level.ts` 地图+关卡材质，`weapons.ts` 数值表+程序化枪模，`viewmodel.ts` 第一人称层，`player.ts`/`bot.ts`/`combat.ts` 玩法，`effects.ts` 特效，`actor-view.ts` 人物，`dropped.ts` 掉落枪（**复用 `buildWeaponModel` 与共享材质**）。改之前以代码为准。
- 枪模 = three 几何体拼装 + 共享 `MeshStandardMaterial`；**独立 scene + FOV 50**，主场景画完 `clearDepth()` 再画；`rotation.y` 恒为 0（枪管平行视线，靠透视对准星，别再给 yaw 修）。只有 AWM 能开镜（`WeaponSpec.scoped` 唯一开关）。`disposeWeaponModel` 只释放几何体，材质共享不能 dispose。
- 渲染 `NeutralToneMapping` + exposure 1.15（**不是 ACES**，ACES 压暗中间调被否掉）；高金属度材质必须有环境贴图，否则死黑。音效：**全 WebAudio 合成，无音频文件**；枪声 = **预烘焙 AudioBuffer**（2026-11-12 晚：`audio.ts` `bakeGun()` 逐样本 DSP，`GUN_RECIPE` 表六层 crack/blast/boom/sizzle/tail/mech + tanh 软削波 + 归一化；每发仅 1 个 BufferSource。历史：采样被用户否掉「枪声源都是不对的」→ 实时七层 biquad 仍嫌闷 → 烘焙版。**别再提议换采样、别把实时 biquad 版加回来**；调听感只动 `GUN_RECIPE`）。
- 坑与历史全在 `DETAILS.md` H5 各节（其中第三轮~第五轮的坐标/光影描述部分已被后续重构推翻，读时注意甄别）。
- 换枪资格唯一出口 `player.canChangeLoadout`（存活 + 复活 ≤ `LOADOUT_WINDOW`=5s + 本次生命未耗弹；只在 `handleFire` 扣弹匣处置 `ammoSpent`）；引擎在 openBuyMenu/selectPrimary/每帧菜单自检三处强制，HUD 字段是 `canChangeLoadout`（不是旧的 nearSpawn）。玩家复活点走 `pickPlayerSpawn`（敌人视线遮挡评分 + 随机并列），**无 ±0.8 偏移**；朝向 `spawnFacingYaw` 一次设齐。

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
