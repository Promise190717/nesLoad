# nesLoad — 项目长期记忆

> 只留**动手前必须知道的硬约束**；细节见 `DETAILS.md`，来龙去脉见 `2026-10-*.md` 日志。
> 动手前先 `git status`；**不主动实测**：改完只做 typecheck + lint，讲清交给用户看。
> 碰「抽屉/入口、加载条、联机/手柄/街机、NDS-EJS 核、彩蛋、详情页动作区、评论/收藏、多语言侧表、`/play` 外壳与右栏」前**先读 `DETAILS.md`**。

## 铁律

- 站名唯一来源 `lib/i18n.ts` `SITE_NAME`，文案写 `{site}`；**全站唯一键盘操作是 `Esc`**。
- 别动：`package.json` name、`nesload:*` 存储键、`nesload_locale`/`nesload_admin` cookie、`netplay.ts` `APP_ID`。
- 🔴 **UI 别自作主张大改**（2026-10-22 教训）：用户说「太丑/重构」→ 先把方案讲成几句话（或只改一处最刺眼的），**等他点头再铺开**。当天 `/play` 右栏整体重做被「丑爆了 你撤回」全撤。视觉口味只有他能定。
- 法务文案 `lib/legal.ts` 中英各一份；书面短句、不用破折号/括号补充。注释写「为什么」含否掉的方案；临时探针验完必删。

## 语言（界面与内容都是 18 种）

- 界面 18（`LOCALES` 顺序照上游 hreflang；`LOCALE_OPTIONS` English 第一）＝内容 18（`lib/game-text.ts` `CONTENT_LOCALES`）。后台表单只编 4 种（`ADMIN_FORM_LOCALES`=zh/en/ja/ko），其余 14 种靠脚本回填。
- 加界面语言：`LOCALES`/`Locale`、新 `lib/i18n.<code>.ts`（558 键逐键对齐）、`LOCALE_OPTIONS`/`LOCALE_PREFIX`/`SITE_NAME`/`HTML_LANG`/`OG_LOCALE`/`DATE_LOCALE`/`resolveLocale`、legal 两份、`CONTENT_LOCALES`+回填脚本。
- 前台短标签一律 `consoleLabel(type, locale)`；URL/枚举永远 `nes`。

## 机种 / 核心

- `ConsoleType` 14 台；清单唯一出口 `lib/consoles.ts`（别手抄）；服务端组件不能 import `lib/emulator.ts`。14 台全走 `public/cores/`（部署一起传，否则 404）；arcade 按 romset 挑 `fbneo`/`fbalpha2012_cps1`（`EXTRA_DRIVERS` 只盖 CPS1）；NDS melonds 是 EJS 核（详见 DETAILS）。
- CD 机种（PS1/Sega CD/PCE CD）架构未通；`SCREEN_WIDTH/HEIGHT=720×540` 只是启动基准，显示尺寸在 globals.css。
- 包内层不在 `lib/unwrap.ts` 白名单 ⇒ 包不拆 ⇒ 判街机错；世嘉裸 `.bin` 按文件头兜；指纹在 unwrap.ts/emulator.ts **手抄两份，改一处必须同步**。
- 机种优先级：`unwrapped.console` → `loadRom` 第 6 参 hint → `detectConsole`；**别在 /play 路上为嗅探把 7z 字节包成 File**（整盘一次复制）。
- `UnwrappedEntry.file`/`bytes` 二选一：7z 只给 `Uint8Array`（canOwn 零拷贝）；需要 File 的地方不许先包一层；大文件分流看 `entry.size`。
- 7z 走 wasm（`public/compression/`）：主线程 `postMessage(Blob)`；读回直接 transfer、下游按 `.length` 用（别 slice/别拿 buffer 当整体）。
- 🔴 退出先 `dropContentFiles()` 再 `exit()`（MEMFS 的 ROM 不回收，+129MB/轮）；载入途中离开靠 `launching`/`exitRequested` 落地后补 exit。

## 数据库 = Supabase（2026-10-20 起）

- 读库唯一出口 `lib/server/pg.ts` `query()`，**走 HTTPS**（PostgREST→`public.exec_sql`，定义在 `db/schema.pg.sql` 末尾）。游戏主键 = 上游 slug。
- 🔴 **绝不在 Worker 直连 Postgres**（node:tls 断连，线上 500 事故）；只有 `scripts/*.mjs` 可直连（`SUPABASE_DB_URL`）。`SUPABASE_URL`+`SUPABASE_SECRET_KEY` 缺一全站 500。
- 文案侧表四张（game/developer/series/console_texts），主键 (slug, locale)；developer/series 名**不在 game_texts**，按 locale JOIN 现取（`sb-games.ts`）。
- 动过文案/图片数据必须升缓存键尾号（见 DETAILS 版本表）。
- R2 公网域缓存 30 天：**换图传新键（-v2）再改库，不覆盖同名**。

## 主题 / 首屏 / 两台机器

- `<html data-theme>` 写入者只有 SiteDocument 的 `BOOT_INIT` 与 `saveTheme()`；导航丢属性由 BootAttributes 只补缺、不落盘。
- 桌面 RetroTv / 移动 HandheldConsole 判据 `<html data-mobile>`（device.ts + 内联脚本两份同步）；尺寸唯一出口 globals.css `--tv-*`（档位只写上限）；掌机白边只能收细；PWR 灯左 ⇔ 菜单钮右（一起改）。

## 路由 / 缓存 / SEO

- 目录页维度全是路径段（分页 `/page/N`、机种、语种，按 console→page / lang→page 嵌套；搜索是动态路由 `?q=`）；链接一律 `next/link`。地址构造唯一出口 `gamesHref`/`consoleHref`/`pageHref`；**别加新查询参数**（middleware 只兜旧外链）。
- 缓存唯一出口 `lib/server/cache.ts` `cached()`；改数据/查询形态键尾版本 +1；缓存留页侧不下沉。
- 🔴 2026-10-22 起所有前台页 `dynamic='force-dynamic'`（ISR 全撤），数据缓存统一 7 天；robots/sitemap/llms.txt/ai.txt 路由缓存 86400 保留。后台改数据靠 `revalidateTag('games',{expire:0})`；机种/开发商缓存没挂 tag，改完硬等 7 天。**迁 Vercel 完成前别往 Cloudflare 发这版**（force-dynamic + 免费 10ms = 1102）。
- 「我是谁」唯一出口 `lib/current-user.ts` `fetchCurrentUser()`；`/login`、`/account` Link `prefetch={false}`。
- `/play` 唯一开局页（PlayScene + GamesShell）；`?id=` 自动载入、`?room=` 加入者、`?lang=` 选 ROM 版本。
- 存档 = 电池 `.srm` 一款一份（快照别加回）；读档 = 带存档重插卡（applySave）。
- 🔴 房间页永久下线（代码在 `app/[locale]/_room`），别加入口、别写 sitemap。

## 部署 / 校验

- `/_next/static/*` 绝不 immutable（next.config.js 已 max-age=0）；`public/sw.js` 对 static 必须 network-first（`VERSION` 改策略要 +1）；发版后 purge CF。
- 大 ROM 唯一下载路 `lib/http.ts` `fetchRomWithProgress`；R2 无版本控制，删 ROM 永久丢。
- ROM 自持 = 除 gba/nds/ps1 外全部（R2 ~4.2 GiB）；键 `roms/<机种>/<slug>-<lang><ext>`，脚本 `migrate-roms-to-r2.mjs`（判据分层，`.md` 是真卡带不拒）；上游两 host 不可互换。
- 展示地址一律 `publicUrlOrNull()`；严格版 `publicUrl()` 只给上传/ROM 代理/存档下载。
- 缓存桶脚本：`next-cache-purge.mjs`=常规（只删旧 buildId）；`r2-purge.mjs`=整桶清空；**都不收 --bucket/--prefix**。
- `pnpm dev` 别在沙箱起；typecheck `npx tsc --noEmit --incremental false` 才真；`pnpm build` 交给用户。
