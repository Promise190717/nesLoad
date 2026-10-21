# nesLoad — 项目长期记忆

> 只留**动手前必须知道的硬约束**。超细节见 `DETAILS.md`，来龙去脉见 `2026-10-*.md` 日志。
> ⚠️ 动手前先 `git status`；**不主动实测**：改完只做 typecheck + lint 基线，讲清交给用户看。
> ⚠️ 碰「抽屉/入口、加载条、联机/手柄/街机 romset、NDS-EJS 核、彩蛋、详情页动作区、评论/收藏、实体多语言侧表、`?lang=`、`CATALOG_SOURCE`、`/play` 外壳与右栏」前**先读 `DETAILS.md`**。

## 铁律

- 站名唯一来源 `lib/i18n.ts` 的 `SITE_NAME`，文案写 `{site}`。**全站唯一键盘操作是 `Esc`**。
- 别动：`package.json` name、`nesload:*` 存储键、`nesload_locale`/`nesload_admin` cookie、`netplay.ts` 的 `APP_ID`。
- 基调：复古游戏 + 在线库 + 本地 ROM 拖进来跑。法务文案 `lib/legal.ts` 中英各一份都要动，书面短句、不用破折号/括号补充。注释写「为什么」含否掉的方案；临时探针验完必删。

## 界面语言 ≠ 内容语言（2026-10-20 起同为 18 种）

- 界面 18 种（`LOCALES`，顺序照上游 hreflang 别重排；`LOCALE_OPTIONS` 里 English 第一位是用户指定的）。**内容语言也是 18 种**（唯一出处 `lib/game-text.ts` 的 `CONTENT_LOCALES`），与上游 hreflang 逐项对齐；2026-10-20 用 `scripts/fill-game-texts-locales.mjs` 从上游列表页回填了 14 种新语言进 Supabase（game/developer/series/console 四张文案侧表，18 语言 × ~1995 款）。
- **后台表单只编辑 4 种**（`game-text.ts` 的 `ADMIN_FORM_LOCALES` = zh/en/ja/ko，AdminGames + flatTexts 在用）；其余 14 种由脚本/爬取写入，`writeTexts` 只动传进来的语言所以安全。
- 加界面语言：`LOCALES`+`Locale`、新 `lib/i18n.<code>.ts`（558 键逐键对齐）、`LOCALE_OPTIONS`/`LOCALE_PREFIX`/`SITE_NAME`/`HTML_LANG`/`OG_LOCALE`/`DATE_LOCALE`/`resolveLocale`、legal 两份、`CONTENT_LOCALES` + 回填脚本。
- 前台短标签一律 `consoleLabel(type, locale)`：英文站美版名 NES/SNES、中日韩日版名 FC/SFC；≤4 字纯 ASCII。后台仍读 `CONSOLE_LABEL`。URL/枚举永远 `nes`。

## 机种 / 核心

- `ConsoleType` 14 台 = nes|snes|gb|gbc|gba|nds|md|gg|sms|32x|ws|ngp|ps1|arcade。机种清单唯一出口 `lib/consoles.ts`（别手抄数组）；服务端组件不能 import `lib/emulator.ts`（顶层 installAudioTap）。
- 14 台全走本站 `public/cores/`（部署必须一起传，否则 404）；arcade 按 romset 挑 `fbneo`/`fbalpha2012_cps1`，驱动纠正进 `lib/arcade-core.ts` 的 `EXTRA_DRIVERS`（别写 `arcade-romsets.json`，只盖 CPS1）。NDS 的 melonds 是 EJS 核，控制/输入面另套（见 DETAILS）。
- CD 机种（PS1/Sega CD/PCE CD）架构未通。`SCREEN_WIDTH/HEIGHT=720×540` 只是启动基准（NDS 256×384），显示尺寸在 globals.css。
- 压缩包里内层不是 `lib/unwrap.ts` 的 `ROM_EXTENSIONS` 白名单 ⇒ 包不被拆 ⇒ `detectConsole` 见 `PK` 判街机 ⇒ FBNeo 报错（7z 改名 `.zip`、世嘉裸卡带叫 `.bin` 都栽在这条）。世嘉 `.bin` 由 `pickSegaCartEntry` 按文件头（0x100 `SEGA` / 0x7FF0 `TMR SEGA`）单独兜；这两条指纹在 `unwrap.ts` 与 `emulator.ts` 里**手抄两份、改一处必须同步**（反向 import 成环）。
- 🔴 **退出必须先 `dropContentFiles()` 再 `exit()`**（2026-10-21 实测后加）：MEMFS 里那盘 ROM（`canOwn=true` 的那块 `Uint8Array`）在 Emscripten 实例退出后**几轮 GC 都不回收**，每进出一次钉住一盘（125.7 MiB 的 bin ⇒ +129 MB/轮，三轮 136→265→394 MB 线性叠加）。`EmulatorController.exit()` 现在两个分支都会先 unlink `CONTENT_DIRECTORY`。看到「返回后内存不降」先查这条；残留 ~70 MB/次是核心 wasm 堆，量级小一个数量级，未追。

## 数据库 = Supabase（2026-10-20 切换，D1/双源逻辑废弃）

- 全站读 **Supabase Postgres**：`lib/server/pg.ts` 的 `query()` 是唯一出口，**走 HTTPS**（PostgREST → `public.exec_sql`，函数定义在 `db/schema.pg.sql` 末尾），占位符仍是 `?`、由 `bindParams()` 就地转成字面量。旧 `catalog-source.ts`/`upstream-catalog.ts` 的双源开关（`CATALOG_SOURCE`）已删（wrangler.jsonc 里那行是死配置）。游戏主键 = **上游 slug**（`games.slug`）。`supabase.ts` 无调用方，别拿它当入口。
- 🔴 **绝不要在 Worker 里直连 Postgres**（`postgres`/`pg` + pooler）：2026-10-20 线上事故——本地 `next dev` 全通，发版后 `/api/games`、`/api/user/*` 和所有未缓存页面一起 500。Workers 的 `node:tls` 连上后写第一条 PG 报文就断（`Network connection lost.`），且 `rejectUnauthorized` 选项直接抛未实现。只有 `scripts/*.mjs` 可以直连（`SUPABASE_DB_URL`，用户只需在本地配）。
- 新增 API/页面读库前：确认 `SUPABASE_URL`（wrangler vars）+ `SUPABASE_SECRET_KEY`（secret）都在，缺了就是全站 500；`exec_sql` 已 revoke anon/authenticated，只有 service_role 能调。
- 文案侧表四张：`game_texts`/`developer_texts`/`series_texts`/`console_texts`，主键 (slug, locale)，`game_texts.controls` 是 jsonb；developer/series 名字**不在 game_texts 里**，读取时按 locale JOIN 现取（`sb-games.ts` 的 `loadGameTexts`）。
- 全量爬取/回填模板 = `scripts/migrate-to-supabase.mjs`（上游**列表页** RSC 载荷一页 18 款带全部字段，比逐款抓详情页省 18 倍）；14 语种回填 = `scripts/fill-game-texts-locales.mjs`（postgres.js 连 `SUPABASE_DB_URL`，⚠️ 连接池跑完全程再 end、developer/series 行要按 slug:locale 去重，两个坑都踩过）。
- `writeTexts`/`writeDeveloperTexts`（games-admin.ts / developers.ts）只动传进来的语言，别的行一概不碰——后台表单只带四种不会冲掉回填的 14 种。
- 动过文案/图片数据必须升缓存键版本（条目不随部署失效）：`sb:games:page|latest|by-console|by-developer|by-id` 现 **v2**、`sb:developers:list` **v4**、`sb:developers:top` **v3**、`consoles:list` **v8**、机种页单条 `static-console` **v2**。
- 机种文案（`console_texts`）切库时只搬了 name，summary/description/release_year 全空过一轮；回填脚本 `scripts/fill-console-intros.mjs`（只补 zh/en 空值、`COALESCE` 不覆盖人工编辑）。
- ⚠️ R2 公网域按 `max-age=2592000` 缓存 30 天，**换图不能覆盖同名键**（边缘仍发旧字节，且 token 没有 purge 权限）——新图传新键（`-v2`）再改库。开发商厂标只有 133/269 有，其余 136 家上游/维基都没有 logo，库里是 `NULL`，前台走名字首字占位。

## 主题 / 首屏属性 / 两台机器

- `<html data-theme>` 真身；写入者只有 `SiteDocument.tsx` 的 `BOOT_INIT`（整页加载才跑，没存过值要落盘；**禁止外包大 try**）与 `saveTheme()`。客户端导航丢属性由 `BootAttributes.tsx` 只补缺、不落盘。
- 桌面 RetroTv / 移动 HandheldConsole 二选一，判据 `<html data-mobile>`（`lib/device.ts` + 内联脚本手抄一份，改一处必须同步）。尺寸链唯一出口 globals.css `--tv-*`（档位只写上限）。掌机屏幕两侧白边只能收细不能收没；PWR 灯在左 ⇔ 菜单钮在右（一起改）。

## 路由 / 缓存 / SEO

- **目录页维度全是路径段**（2026-10-20 改，`CatalogLink.tsx` 已删）：分页 `/xxx/page/N`、机种 `/games/console/<type>`、语种 `/consoles/<id>/lang/<code>`，组合按 `console→page` / `lang→page` 顺序嵌套；搜索单独一条**动态**路由 `/games/search?q=…`、`/consoles/<id>/search?q=…`（关键词是用户输入，不进路径）。这些链接一律 `next/link`（软导航），只有「十几颗一排」的 tab 加 `prefetch={false}`。
- ⚠️ 别再给目录页加**新的**查询参数：`middleware` 的 `catalogRewrite` 还在，但它现在**只兜旧外链**（`/games?page=2` 之类）—— 新参数走它就会退回「点一下整页刷新」。地址构造器唯一出口：`gamesHref` / `consoleHref`（页内）、`pageHref`（pager）。
- 缓存唯一出口 `lib/server/cache.ts` 的 `cached()`；条目不随部署失效 ⇒ 改数据/查询形态必须键尾版本 +1。缓存留在页侧不下沉数据层。
- 「我是谁」唯一出口 `lib/current-user.ts` 的 `fetchCurrentUser()`（登录/退出必须 remember/forget）；`/login`、`/account` 的 `<Link>` 一律 `prefetch={false}`。
- `/play` = `/room` 另一个壳（PlayScene + GamesShell，showHeader={false}），`?id=` 会自动载入开玩。`?lang=` 两处语义不同：机种页筛游戏、`/play` 选 ROM 版本。
- 真路由 `/games`(15/页) `/games/[id]`(+`/download`) `/consoles`(+`/[type]`) `/developers`(+`/[id]`) `/play` `/privacy` `/terms`；404 一页盖详情+下载。
- 存档 = 电池存档 `.srm` 一款一份（快照那套已删别加回）；唯一出口 `saveBattery()`/`stageBatterySave()`；读档 = 带存档重新插卡（`/room` remountRom、`/play` applySave）。
- `/room` 「游戏库」入口注释式隐藏（三处一起才能恢复）；首页第二颗钮「游玩本地 ROM」→ `/room`。

## 部署 / 校验

- ⚠️ `/_next/static/*` 绝不能 immutable（Turbopack chunk 名不随内容变；next.config.js 已 max-age=0 must-revalidate，别改回）。⚠️ 纯客户端壳静态页必须 `dynamic='force-dynamic'`（现 /play /room /privacy /terms）；发版后 purge CF。
- 大 ROM 唯一下载路 `lib/http.ts` 的 `fetchRomWithProgress`；`readBodyWithProgress` 只给存档类小文件。R2 无版本控制，删 ROM 永久丢。
- **ROM 自持范围 = 除 `gba` / `nds` / `ps1` 之外全部**（2026-10-21 用户扩围：arcade/nes/snes 之后又搬 md/gbc/gb/gg/sms/ws/32x/ngp 共 323 行 305 MiB，无一失败；全库现 1216/4047 行、R2 共约 **4.20 GiB**）。剩 gba(1154 行，估 4 GiB 上下)/nds(1107)/ps1(562) 仍回上游 `files:`/`site:`。脚本默认排除表已改成 `gba,nds,ps1`。键 `roms/<机种>/<game_slug>-<language><ext>`，脚本 `scripts/migrate-roms-to-r2.mjs`（幂等、HeadObject 断点续跑、`--console=` 非空时完全取代默认排除表、写 `size_bytes`）。`route.ts` 取片**先按语言、再优先 `r2:`**。键不含内容 hash ⇒ 换 ROM 必须换键。
- ⚠️ **md 的卡带扩展名就是 `.md`**，上游按 `text/markdown` 回、不带 content-length（字节是真卡带 `00 ff fe`）。`migrate-roms-to-r2.mjs` 的判据因此不能写成「一律拒 `text/*`」（2026-10-21 已改成分层：`HTML_LIKE` 拦 html/json/xml，`text/*` 再看响应体首字节是不是 `<`/`{`）。另注：`route.ts` 的 `HTML_LIKE` 仍是宽版 `^text/`，所以 `.md` 这类 ROM **只在本站 R2 上能放**，回上游那条路会 502。
- ⚠️ 上游两个 host **不可互换**：同一文件名常是一边 206 一边 404（如 `avsp.zip` 只在 files 子域）。搬不动时先换另一个 host 探一次，别急着判定「上游没有」。已知 8 个两边都 404：`arcade/sexy-parodius`、`snes/art-of-fighting-snes`、`contra-iii-the-alien-wars-snes`、`dragon-ball-z-super-butoden-3-snes`(fr/ja/ko)、`fushigi-no-dungeon-2-fuurai-no-shiren`(en/ja)。
- 展示地址一律 `publicUrlOrNull()`；严格版 `publicUrl()` 只给上传/ROM 代理/存档下载。
- 两个缓存桶脚本，**桶与 `incremental-cache/` 前缀都写死，不接受 `--bucket`/`--prefix` 覆盖**（2026-10-20 加固，此前 `r2-purge` 读 env 的 `R2_BUCKET`＝`games`、`next-cache-purge` 可 `--bucket=games`，裸跑 `--yes` 会连头像/存档/ROM 一起删）：`scripts/next-cache-purge.mjs` = **常规入口**（`pnpm cache:purge`，也是 `cf:deploy` 尾巴，只删旧 buildId 目录、当前那版永远保留，读 `.next/BUILD_ID` 取当前值，取不到就拒删）；`scripts/r2-purge.mjs` = 整桶清空（连当前 buildId 一起删，清完首次访问全现渲染）。改回「按参数选桶」前先想清楚这一点。
- `pnpm dev` 别在 agent 沙箱起（NODE_OPTIONS 坑，报 Jest worker 2 exceptions）；typecheck 全量 `npx tsc --noEmit --incremental false` 才真；`pnpm build` 交给用户。
