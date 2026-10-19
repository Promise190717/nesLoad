-- NES / SFC / 街机游戏元数据（文件本体在 R2，这里只存指针与元信息）
--
-- ⚠️ **_en 那几列是 2026-10-13 加的**（站点双语，游戏内容原来只有中文）。
--    命名规则：**没有后缀 = 中文原文，`_en` = 英文**。
--    取值规则（见 lib/server/games.ts 的 localizeGame）：
--      · 中文站读原文列
--      · 英文站读 `_en`，**空了回退中文原文**（不显示空白）
--    所以 `_en` 全部可空 —— 后台可以只补英文、不必重填中文。
--    老库要单独跑一次（只增不删）：
--      node --env-file=.env.local scripts/add-i18n-fields.mjs
--
-- ⚠️⚠️ **2026-10-16：下面那 8 个文案列已经退化成「只写不读的投影」** ——
--    真正被读取的是 `game_texts` 侧表（见本文件后面那张表的说明）。
--    这里原样留着它们是为了：① `title` 是 NOT NULL，本来就必须写；
--    ② 回滚退路（侧表那条路真要退回去时，旧列里是完整的中英两份）。
--    **别在这里加新列了** —— 加语言要改的是数据，不是表结构。
--
-- ⚠️ **`source_url` 是 2026-10-16 加的**（后台爬取可以选「不保存 ROM」）：只留一个来源地址，
--    前台按它回源取，本站一个字节都不存。形态是 `<host 角色>:<路径>`、**不含域名**：
--      files:/games/roms/kirby-squeak-squad.nds
--      site:/games/roms/Contra.nes
--    域名整个抽到 lib/server/upstream.ts 的 UPSTREAM_ROOT —— 换域名只改那一处。
--    ⚠️ **host 角色不能省**：上游两个 host 不可互换（实测 files 上的 NDS 是 206、主站同路径 404；
--       主站的 Contra.nes 是 206、files 同路径 404），只留 path 会有一半文件取不到。
--    ⚠️ 与 `rom_url` **互斥**：不存 ROM 时 `rom_url` 写空串（那列是 NOT NULL）。
--       前台优先读 `source_url`，没有才读 R2（见 app/api/games/[id]/rom）。
-- ⚠️ **`group_key` 是 2026-10-16 加的**（同款聚合键，见 game_texts 那段）。
--    一行 = 一盘 ROM；**同一款游戏的不同语言版本是好几行**（`language` 各不同），
--    这几行共用一个 `group_key` —— 文案（`game_texts`）挂在 group_key 上，一款一份。
--    老库要单独跑一次（只增不删，可反复执行）：
--      node --env-file=.env.local scripts/add-game-group-key.mjs
CREATE TABLE IF NOT EXISTS games (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,            -- 游戏名（必填，中文原文）
  title_en      TEXT,                     -- 游戏名英文（可空，2026-10-13 加）
  image_url     TEXT NOT NULL,            -- 封面图公网 URL（必填）
  rom_url       TEXT NOT NULL,            -- ROM 在 R2 的对象 key；不存 ROM 时是空串（见 source_url）
  source_url    TEXT,                     -- 源站 ROM 地址（`site:/…` / `files:/…`，不含域名，2026-10-16 加）
  rom_name      TEXT NOT NULL,            -- ROM 原始文件名（FBNeo 靠 zip 文件名认驱动）
  console_type  TEXT NOT NULL,            -- nes / snes / gba / arcade（必填）
  language      TEXT,                     -- 这盘 ROM 自己的语言（可选）
  group_key     TEXT,                     -- 同款聚合键（2026-10-16 加）→ 决定读哪一份 game_texts
  series        TEXT,                     -- 系列（可选，中文原文）
  series_en     TEXT,                     -- 系列英文（可空，2026-10-13 加）
  year          INTEGER,                  -- 年份（可选）
  developer     TEXT,                     -- 开发商名（可选）—— 这是**快照**，真身在 developers 表
  developer_en  TEXT,                     -- 开发商名英文快照（可空，2026-10-13 加；随 developers.name_en 走）
  developer_id  TEXT,                     -- 开发商外键（可选，2026-10-12 加）→ developers.id
  description   TEXT,                     -- 说明 / 简介（可选，2026-10-12 加，中文原文）
  description_en TEXT,                    -- 说明英文（可空，2026-10-13 加）
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_games_created_at ON games (created_at DESC);
-- 「点开发商 → 出他名下所有游戏」这条查询走它
CREATE INDEX IF NOT EXISTS idx_games_developer_id ON games (developer_id);
-- 每条列表读取都要拿它去 JOIN game_texts（`ON t.group_key = COALESCE(g.group_key, g.id)`），
-- 是同款聚合（`DELETE … WHERE NOT EXISTS`）与后台按款找记录走的路
CREATE INDEX IF NOT EXISTS idx_games_group_key ON games (group_key);

-- ⚠️ **表达式索引**（2026-10-16 加）—— 上面那条 `idx_games_group_key` 服务不了
--    `COALESCE(group_key, id) = ?` 这种写法：`COALESCE` 包着**列**，普通列索引用不上，
--    于是判重那条 JOIN 回表 games 时**每一行都要全表扫一遍**。实测 findGameDuplicate
--    单次约 1640 行、占线上 D1 rows_read 的 39.86%，其中有一半就是这次回表。
--    表达式索引要求查询里的表达式与这里**一致**（列名带不带表别名都行，SQLite 自己规范化）。
--    ⚠️ 别把它「化简」成 `(group_key, id)` —— 那样 `COALESCE(...) = ?` 依旧用不上。
CREATE INDEX IF NOT EXISTS idx_games_group_key_coalesce ON games (COALESCE(group_key, id));

-- ⚠️ 上面那两列 `description`（2026-10-12）与 `source_url`（2026-10-16）都是后补的。
--    **这个文件只对「还没建过表」的库有效**：
--    `CREATE TABLE IF NOT EXISTS` 见表已存在就整句跳过，不会往老表里补列。
--    已经上线的库要单独补一次（只增不删，全程没有 DELETE / UPDATE / DROP）：
--      node --env-file=.env.local scripts/add-games-description.mjs
--      node --env-file=.env.local scripts/add-games-source-url.mjs
--    为什么不把 `ALTER TABLE ... ADD COLUMN` 直接写进本文件：这个文件里每条语句都是
--    `IF NOT EXISTS`、可以反复执行；ALTER 跑第二遍会报 `duplicate column name`，
--    掺进来就把「重复执行无害」这个性质破坏了。

-- 游戏文案的**多语言侧表**（2026-10-16 加）
--
-- 为什么从 games 的宽表搬出来：文案字段原来成对出现（`title` + `title_en`），
-- 加一个语言就要给每张表加 4 列，并且要改 8+ 处代码（schema / GameRow / Game /
-- toGame / localizeGame / INSERT / UPDATE / SEARCH_CONDITION / 后台表单）。
-- 搬到侧表后**加语言 = 插数据**，表结构不动。
--
-- 一行 = 「**一款游戏**在某个语言下的文案」。字段可空，空了**逐字段回退**到中文原文
-- （见 lib/game-text.ts 的 localizeTexts）—— 所以「只翻了标题、说明还没翻」是合法状态。
--
-- ⚠️⚠️ **主键是 `group_key`、不是 `game_id`（2026-10-16 改）** —— 这是这张表唯一反直觉
--    的地方，动它之前先读完这段。
--
--    背景：一行 `games` 是**一盘 ROM**，不是「一款游戏」。同一款游戏的中 / 英 / 日 / 韩
--    四个语言版本就是四条 games 记录（判重是「标题 + 机种 + 语言」三维，语言不同放行）。
--    而文案（标题怎么翻、系列叫什么）**四个版本是同一份** —— 上游抓一次就只返回一份，
--    后台也是照一份填的。挂 `game_id` 就等于把同一份文案复制四遍：
--
--        games        Kirby·en   Kirby·zh   Kirby·ja   Kirby·ko          4 行
--        game_texts      4 行       4 行       4 行       4 行     =    16 行
--
--    改挂 `group_key`（同款那几条记录共用一个值）之后只要 4 行，而且后台改一次标题
--    就是改整款 —— 不会出现「改了英文版那条、中文版那条还挂着旧名字」。
--
--    ⚠️ `group_key` 的**唯一出口是 lib/server/games.ts 的 `resolveGroupKey()`**：
--       新增记录时一律由数据层算（先按「中文标题 + 机种 + 开发商」反查同款，查到就复用、
--       查不到才新开一个），**接口层和后台表单都不用传、也传不了**。
--       刻意没拿上游 slug 当这个键：手动添加那条路根本没有 slug，而「同款」的判据
--       本来就和判重同一套（改一处两边一起变才对）。
--
-- ⚠️ `locale` 的取值比**界面语言**（`Locale` = zh | en，见 lib/i18n.ts）**宽**：
--    界面暂时只有中英，但日韩的内容可以先把数据录进来，等界面开了直接用。
--    取值清单见 lib/game-text.ts 的 CONTENT_LOCALES（唯一出处）。
--
-- ⚠️ 老库要单独跑一次（给 games 补 `group_key` 列 → 归组回填 → 重建本表 →
--    同款去重合并成一份；幂等、只增不删，旧表**改名成 `game_texts_old` 留底、不 DROP**）：
--   node --env-file=.env.local scripts/add-game-group-key.mjs
--   ⚠️ 那个脚本**取代**了旧的 scripts/add-game-texts.mjs（后者建的是 game_id 主键的旧表，
--      在新库上跑会建出一张形状不对的表 —— 别跑它，文件头有警告）。
--
-- ⚠️ games 表里那 8 个旧文案列（title / series / developer / description 与各自的 `_en`）
--    **保留、但只写不读**（用户 2026-10-16 决定）：写入路径照旧把中英两份投影过去
--    （`title` 那列是 NOT NULL，本来也必须写），**读取一律走这张表**。
--    留着的意义是回滚退路 —— 万一侧表这条路要退回去，旧列里是完整的中英两份。
--    代价是同一份数据存了两处，所以**绝不要直接改旧列**：改了不会显示出来。
--    等侧表稳定运行一段时间再单独清理（清理前先确认没有代码在读它们）。
CREATE TABLE IF NOT EXISTS game_texts (
  group_key   TEXT NOT NULL,             -- → games.group_key（同款共用一份文案）
  locale      TEXT NOT NULL,             -- zh / en / ja / ko …（比界面语言宽）
  title       TEXT,                      -- 游戏名；空 = 没翻，回退中文
  series      TEXT,                      -- 系列
  developer   TEXT,                      -- 开发商名（快照，随 developers.name / name_en 走）
  description TEXT,                      -- 说明 / 简介
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (group_key, locale)
);

-- 判重 / 归组那条查询走它（2026-10-16 加）。
--
-- ⚠️ **必须带 `COLLATE NOCASE`**：`lib/server/games.ts` 的 findGameDuplicate /
--    findGameGroup 里写的是 `t.title COLLATE NOCASE = ?`，而默认索引是 BINARY 排序
--    —— 不带 COLLATE 的索引**匹配不上**，SQLite 会照旧全表扫。这是这条索引唯一的坑。
--
-- 为什么需要它（不是「几百行无所谓」）：这两条查询原来都在全表扫（`title` 没索引，
-- 而 `locale` 又不是主键 `(group_key, locale)` 的前缀）。实测单次约 1640 行，而
-- 批量导入 / 抓取会**逐语言版本**各查一次 —— 2026-10-16 线上 D1 Insights 里，
-- findGameDuplicate 一个人就吃掉 **39.86%** 的 rows_read（4.71M 行），
-- findGameGroup 再吃 7.64%。
--
-- 列顺序 `(locale, title)`：判重固定只比中文那份（`locale = 'zh'`），两个都是等值条件，
-- 一起放进索引让规划器一步定位到那 0~1 行。games 上那条 idx_games_group_key 服务的是
-- 反方向（按 group 找记录，如 deleteGame 里的 `NOT EXISTS`）。
--
-- ⚠️ 老库要单独跑一次（`CREATE INDEX IF NOT EXISTS` 本身幂等，但本项目惯例是走脚本）：
--      node --env-file=.env.local scripts/add-game-texts-title-index.mjs
CREATE INDEX IF NOT EXISTS idx_game_texts_locale_title
  ON game_texts (locale, title COLLATE NOCASE);

-- 读取那条 JOIN 走 `ON t.group_key = COALESCE(g.group_key, g.id)`（见 lib/server/games.ts
-- 的 loadGameTexts）—— `WHERE g.id IN (…)` 先筛出 games 行、再用本表主键前缀取文案，
-- 那个方向靠主键就够，不需要额外索引。
--
-- ⚠️ **没有外键约束**（D1 底下 SQLite 默认不开，同下面那几张表）：
--    所以后台删游戏时数据层要**自己顺手清一遍**，而且必须**晚一步**清 ——
--    **只有这个 group 下最后一盘 ROM 也没了，文案行才跟着删**（见 deleteGame 里那条
--    `NOT EXISTS`）。删早了会让还在库里的另外几个语言版本突然没文案。
--    写入走 upsert（`ON CONFLICT(group_key, locale) DO UPDATE`），读取走批量 JOIN。
--
-- ⚠️ `COALESCE(g.group_key, g.id)` 只是**防御**：迁移脚本会把老行的 group_key 全部回填，
--    之后不该再有 NULL。留着它是为了「万一漏了一条」时文案还读得出来（读不到比读错更糟）。

-- 开发商库（2026-10-12 加，用户要的「游戏厂商库」，口径统一叫**开发商**）
--
-- 为什么单独一张表而不是继续在 games.developer 里写字：用户要「点开发商就出他名下的所有游戏」，
-- 那就得有个**能被引用**的实体 —— 名字是自由文本时，改一个字所有游戏就全断链了。
-- 于是 games.developer_id 指向这里，名字 / 图片 / 简介 / 介绍都挂在这一行上。
--
-- ⚠️ `games.developer`（那列自由文本）**没有删**，它退化成「名字快照」：
--   排序、搜索（SEARCH_CONDITION 直接 LIKE 它）、详情页资料表、JSON-LD 的 author 全还在读它。
--   所以改名时数据层会级联把它一起改掉（见 lib/server/developers.ts 的 updateDeveloper）——
--   两边不同步的话，开发者页上写着「卡普空」、游戏卡片上还是老名字。
--   D1 底下是 SQLite，删列要重建整表，得不偿失；留着一列冗余文本比冒险重建安全。
--
-- image_url / summary / description / founded_year / website 全部可空 ——
-- 迁移进来的 20 个老名字只有名字，别的都要靠后台慢慢补。
CREATE TABLE IF NOT EXISTS developers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,     -- 开发商名（必填、唯一，中文原文）
  name_en       TEXT,                     -- 开发商名英文（可空，2026-10-13 加）
  image_url     TEXT,                     -- 厂标 / 图片公网 URL（可选）
  summary       TEXT,                     -- 简介（一句话，可选，中文原文）
  summary_en    TEXT,                     -- 简介英文（可空，2026-10-13 加）
  description   TEXT,                     -- 介绍（整段，可选，中文原文）
  description_en TEXT,                    -- 介绍英文（可空，2026-10-13 加）
  founded_year  INTEGER,                  -- 成立年份（可选）
  website       TEXT,                     -- 官网地址（可选）
  source_slug   TEXT,                     -- 上游 slug（回填日韩用，见上方注释）
  created_at    INTEGER NOT NULL
);

-- ⚠️ `name_en` / `summary_en` / `description_en` 与 games 那几个 `_en` 同一次加的
--    （2026-10-13，见 games 表上方的总说明与 scripts/add-i18n-fields.mjs）。
--    `name_en` 改了要**级联**到 `games.developer_en`（见 lib/server/developers.ts 的
--    updateDeveloper），否则开发商页写着 Capcom、游戏卡片上还是老名字。
--
-- ⚠️⚠️ **2026-10-16：下面那 6 个文案列已经退化成「只写不读的投影」** ——
--    真正被读取的是 `developer_texts` 侧表（见本文件后面那张表的说明）。
--    这里原样留着它们是为了回滚退路。别在这里加新列了 —— 加语言要改的是数据。

-- 列表默认按创建时间倒序（和 games 一致：新加的排在前面）
CREATE INDEX IF NOT EXISTS idx_developers_created_at ON developers (created_at DESC);

-- ⚠️ `games.developer_id` 与下面这张表同样是 2026-10-12 补的，老库要单独跑一次：
--      node --env-file=.env.local scripts/add-developers.mjs
--    那个脚本做三件事（幂等、只增不删）：建这张表 → 给 games 补 developer_id 列 →
--    把 games 里现存的 developer 取值去重写进 developers，再回填每条游戏的 developer_id。

-- 机种库（2026-10-14 加，用户要的「机种专题页」——和 developers 同一套做法）
--
-- ⚠️ **主键是 `console_type` 本身**（'nes' / 'snes' / 'gba' / 'arcade' 等十四个），不是 UUID：
--   机种是代码里定死的枚举（`ConsoleType`，见 lib/emulator.ts），加机种要改核心 / 卡带
--   好几处，不是后台能随手加的东西。拿类型当主键换来两样好处：
--   · 地址好看且稳定 —— 专题页是 `/consoles/nes` 而不是一串 uuid；
--   · games.console_type 本来就存着这些值，**天生就是外键**，不需要回填。
--
-- ⚠️ 这张表是机种**资料的扩展**，不是机种的**清单**：某一行被删了，那个机种的
--   游戏一根毫毛都不少（games.console_type 还在），前台页面对照 `CONSOLE_TYPES`
--   会退回代码里的默认名字（NES / SFC / GBA / ARC）照常渲染。所以后台删除 =
--   「清掉资料恢复默认」，不做「名下有游戏不许删」那套拦截。
--
-- ⚠️ 2026-10-14 加了八个机种（gb / gbc / md / gg / sms / 32x / ws / ngp），2026-10-15 加
--   nds，2026-10-16 加 ps1（第一台光盘机种）——老库都靠 `scripts/add-consoles.mjs`
--   补行（幂等、只增不删），加机种后跑一遍即可。
--
-- name / name_en / summary / … 的双语规则与 developers 完全一致：
-- 没有后缀 = 中文原文，`_en` = 英文（空了回退中文）。
CREATE TABLE IF NOT EXISTS consoles (
  console_type  TEXT PRIMARY KEY,       -- ConsoleType 十四个之一（nes / snes / gb / … / arcade）
  name          TEXT NOT NULL,          -- 展示名（必填，中文原文）
  name_en       TEXT,                   -- 展示名英文（可空）
  image_url     TEXT,                   -- 机图 / 图片公网 URL（可选）
  summary       TEXT,                   -- 简介（一句话，可选，中文原文）
  summary_en    TEXT,                   -- 简介英文（可空）
  description   TEXT,                   -- 介绍（整段，可选，中文原文）
  description_en TEXT,                  -- 介绍英文（可空）
  release_year  INTEGER,                -- 发售年份（可选）
  created_at    INTEGER NOT NULL
);

-- 列表按创建时间（预填的四个机种同一批写入，顺序无意义；展示顺序是界面的事）
CREATE INDEX IF NOT EXISTS idx_consoles_created_at ON consoles (created_at DESC);

-- 后台管理员账号
--
-- ⚠️ **这张表是「管理员」表，不是前台用户表**（2026-10-13 起两者彻底分开）。
--    前台注册用户住在下面 `app_users` 里 —— 两套账号、两套会话、两只 cookie，
--    没有任何交集。别把前台登录写进这张表，也别复用它的会话令牌
--    （那样前台用户会直接拿到后台权限）。
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,          -- 格式：salt:hash（scrypt）
  created_at     INTEGER NOT NULL
);

-- ===================================================================
-- 前台用户（2026-10-13 加）
--
-- 和上面 `users` 的区别：那张是**后台管理员**，这张是**站内注册用户**。
-- 分开的理由不只是语义 —— 混在一起的话，任何一个注册用户都能拿到后台权限。
-- 所以：表分开、会话令牌分开（见 lib/server/app-session.ts）、cookie 名分开
-- （`nesload_user` vs `nesload_admin`）、守卫分开（assertUser vs assertAdmin）。
--
-- 口令哈希沿用 `users` 那套 scrypt `salt:hash`（复用 lib/server/users.ts 的两个函数），
-- 不另发明一种 —— 两套哈希算法除了多一份代码没有任何好处。
--
-- status：1 = 正常，0 = 封禁。用整数不用布尔，理由同 feedback.resolved（SQLite 没有 BOOLEAN）。
-- 封禁后**登录直接拒**，已签发的会话也由 assertUser 每次查库复核（见 app-guard.ts）——
-- 否则封了人他还拿着旧 cookie 玩到过期为止。
--
-- gender / avatar_key 是 2026-10-13 补的（个人中心要「改资料」）。**老库要单独跑一次**
--   node --env-file=.env.local scripts/add-user-profile.mjs
-- 理由同下面那条通用说明：`CREATE TABLE IF NOT EXISTS` 不会往已存在的表里补列。
--
-- vip_expires_at 是 2026-10-13 加的（VIP 会员，admin 里设置）。**老库同样要单独跑一次**
--   node --env-file=.env.local scripts/add-user-vip.mjs
--   · 存**毫秒时间戳**：会员有效期至。null = 从来不是会员 / 已被取消；
--     过去的时间 = 自然过期（读取时判 `> now`，不用后台手动清）。
--   · 刻意**不另存一个「是不是 VIP」的布尔** —— 一个到期时间就能表达三态
--     （没开过 / 有效 / 过期），两个布尔迟早漂。判定逻辑在 lib/server/app-users.ts。
--   · 只有 admin 能写（/api/admin/users/<id> 的 PATCH）；用户自己不能给自己开。
--
--   · gender       —— 'male' / 'female' / 'other' / NULL（未填）。存字符串而不是 1/2/3，
--                     因为**没人拿它做数值运算**，而字符串在 SELECT 出来时自解释、
--                     后台也一眼看得懂（将来真要用数字也随时能加）。
--   · avatar_key   —— R2 对象 key（`avatars/<user_id>/<随机>`），不是公网地址 ——
--                     地址由服务端的 publicUrl() 现拼，换域名时不必回表改数据。
--                     换头像时**旧对象一定要删**（见 lib/server/user-data.ts）。
CREATE TABLE IF NOT EXISTS app_users (
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE,   -- 登录名（必填、唯一）
  password_hash  TEXT NOT NULL,          -- 格式：salt:hash（scrypt）
  status         INTEGER NOT NULL DEFAULT 1, -- 1 = 正常，0 = 已封禁
  created_at     INTEGER NOT NULL,
  last_login_at  INTEGER,                -- 最近一次登录时间（可空，从没登录过就是 null）
  gender         TEXT,                   -- 'male' / 'female' / 'other' / NULL
  avatar_key     TEXT,                   -- R2 对象 key：avatars/<user_id>/<file>（可空）
  vip_expires_at INTEGER                 -- VIP 有效期至（毫秒时间戳，可空；过去 = 已过期）
);

CREATE INDEX IF NOT EXISTS idx_app_users_created_at ON app_users (created_at DESC);

-- 云端历史（本地 `cartridges` 的云端版）
--
-- ⚠️ **只记在线游戏库里的游戏**（用户 2026-10-13 明确要求）：`game_id` 指向 games.id，
--    本机拖进来的文件没有 id、也没有可重新下载的地址，不进这张表。
--
-- 字段是本地那份的**超集**：`game_id` 是重新载入的必要条件，另外几个是**快照** ——
-- 用户的历史列表要能直接画出来（封面 / 名字 / 机种），不该为了渲一行再回查 games；
-- 而且后台把游戏删了之后，历史里那一行仍然显示得出来（只是点不动了）。
-- 快照和 games 不同步是**可接受**的：这是一份「当时玩的是什么」的记录。
--
-- rom_name 必须留着：FBNeo 靠 zip 文件名认驱动（和本地历史同一个理由）。
--
-- 主键是 (user_id, game_id)：同一款游戏玩两次是**更新**那行的时间戳，不是插两条 ——
-- 于是历史天然是「最近玩过的 N 款」，不会重复。这和本地 putCartridge 的覆盖写一致。
CREATE TABLE IF NOT EXISTS user_history (
  user_id       TEXT NOT NULL,           -- → app_users.id
  game_id       TEXT NOT NULL,           -- → games.id（只可能是在线库的游戏）
  title         TEXT NOT NULL,           -- 快照：游戏名（⚠️ 读取时改用 game_texts，见下方注释）
  image_url     TEXT NOT NULL,           -- 快照：封面地址
  rom_name      TEXT NOT NULL,           -- 快照：ROM 原始文件名（FBNeo 认它）
  console_type  TEXT NOT NULL,           -- 快照：nes / snes / gba / arcade
  played_at     INTEGER NOT NULL,        -- 最近一次玩的时间（列表按它倒序）
  created_at    INTEGER NOT NULL,        -- 第一次玩的时间
  PRIMARY KEY (user_id, game_id)
);

-- 取某人的历史、按最近玩过倒序 —— 这条查询走它
CREATE INDEX IF NOT EXISTS idx_user_history_recent ON user_history (user_id, played_at DESC);

-- ⚠️ 2026-10-13（双语）/ 2026-10-16（文案搬进侧表）：这张表**不加任何语言列** ——
--    列表读取时 `JOIN games` 把下架的滤掉，再按 game_id 批量捞 `game_texts`
--    （见 lib/server/user-data.ts 的 listUserHistory 与 lib/server/games.ts 的 loadGameTexts）。
--    快照列 `title` 仍然写（写入路径不变），只是读取不用它。
--    这样加语言既不用给这张表加列、也不用回头补历史数据。

-- 云端存档槽
--
-- ⚠️ **存档本体放在 R2**（`state_key` 是对象 key），D1 只存元信息。
--    理由：一块 save state 是几百 KB 到几 MB 的二进制，D1 单值有大小限制、
--    而且把二进制塞进关系库对每次列表查询都是负担（SELECT * 会把整块拖出来）。
--    R2 那套封装（lib/server/r2.ts 的 uploadObject / deleteObject / publicUrl）直接用。
--
-- state_key 形如 `saves/<user_id>/<id>`；**要删存档必须同时删 R2 那个对象** ——
-- 只删行会留下一堆没人认领的对象（见 lib/server/user-data.ts 的 removeUserSave）。
--
-- 槽位上限（MAX_SAVES = 5，和本地一致）由写入方淘汰，和本地 lib/saves.ts 同规则：
-- 新槽写进去、把超出的最旧那条连 R2 对象一起清掉。
--
-- game_id 同样是 games.id —— 只给在线库的游戏存档。rom_name 是槽位的分组键
-- （本地那份就是按 romName 分的），必须留着。
CREATE TABLE IF NOT EXISTS user_saves (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,             -- → app_users.id
  game_id     TEXT NOT NULL,             -- → games.id（只可能是在线库的游戏）
  rom_name    TEXT NOT NULL,             -- 分组键：按 ROM 文件名分槽
  title       TEXT NOT NULL,             -- 快照：游戏名（存档列表上要显示）
  state_key   TEXT NOT NULL,             -- R2 对象 key：saves/<user_id>/<id>
  size        INTEGER NOT NULL,          -- 存档字节数（列表上给个大小，也方便排查）
  created_at  INTEGER NOT NULL
);

-- 列出「某一款游戏」的存档槽（新槽在前）—— 打开存档列表走它
CREATE INDEX IF NOT EXISTS idx_user_saves_rom ON user_saves (user_id, rom_name, created_at DESC);
-- 淘汰最早那槽时按 (user_id, rom_name) 找最旧的一条
CREATE INDEX IF NOT EXISTS idx_user_saves_user ON user_saves (user_id, created_at DESC);

-- 收藏
--
-- 只存「谁收藏了哪一款」，别的什么字段都不要 —— 游戏资料一律现查 games 表
-- （收藏列表要显示的就是游戏本身，快照没有意义，而且改了名字该跟着变）。
--
-- 主键 (user_id, game_id) 天然去重：重复收藏是空操作，不需要先查一次。
-- created_at 用来按收藏时间倒序排（最近收藏的在前面）。
CREATE TABLE IF NOT EXISTS user_favorites (
  user_id     TEXT NOT NULL,             -- → app_users.id
  game_id     TEXT NOT NULL,             -- → games.id（只可能是在线库的游戏）
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_recent ON user_favorites (user_id, created_at DESC);

-- ⚠️ 上面这四张表（app_users / user_history / user_saves / user_favorites）是
--    2026-10-13 加的。**本文件只对「还没建过表」的库有效**（同前面 developers 那段注释），
--    已经上线的库要单独补一次（只增不删，全程没有 DELETE / UPDATE / DROP）：
--      node --env-file=.env.local scripts/add-app-users.mjs
--    ⚠️ 前台**收藏 / 历史**都带 `game_id → games.id` 的外键语义，但**没有建 FOREIGN KEY 约束**：
--    D1 底下 SQLite 的外键默认不开（PRAGMA foreign_keys=OFF），写了也只是注释。
--    所以「用户收藏了某款游戏、后台把游戏删了」会留下一行孤儿 ——
--    读取时用 JOIN games 过滤掉即可（见 lib/server/user-data.ts），
--    后台删游戏时也顺手清一遍（deleteGame 之外由 /api/admin/users 的路由负责）。

-- 留言本（房间地板上那本，任何人可写、可看）
--
-- 前台是**匿名提交**：没有账号体系，所以不留作者、只留内容。要挡刷屏只能靠
-- 长度上限 + 后台人工处理（见 app/api/feedback/route.ts）。
-- resolved 用 0 / 1 而不是布尔：D1 底下是 SQLite，本来就没有 BOOLEAN 类型，
-- 存 0/1 才和 INTEGER 列对得上（映射在 lib/server/feedback.ts 里转成 boolean）。
CREATE TABLE IF NOT EXISTS feedback (
  id          TEXT PRIMARY KEY,
  content     TEXT NOT NULL,             -- 留言正文（必填）
  resolved    INTEGER NOT NULL DEFAULT 0,-- 0 = 未解决，1 = 已解决
  created_at  INTEGER NOT NULL
);

-- 列表一律「新的在前」，游标翻页也走这个序
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback (created_at DESC, id DESC);

-- 游戏问题反馈（2026-10-13 加，用户要的详情页那颗「反馈问题」）
--
-- ⚠️ 和上面那本**留言本刻意分成两张表**，别合并：
--   · `feedback`      —— 任何人可写、**所有人可读**（打开就是一张公开留言列表），
--                        说的是「这个站」；
--   · `game_reports`  —— **只对后台可见**，一条针对**某一款游戏**，
--                        处理完标记 resolved。说的是「这盘游戏有问题」。
--   合成一张的话，玩家随手报的一个 bug 会立刻出现在公开留言板上；
--   而且列表页的语义（游标翻页 + 字段）本来就不一样。
--
-- `game_title` 是**快照**：后台列表要能一眼看出报的是哪一款；而且游戏下架
-- （`game_id` 指向的行被删）之后这条记录仍然读得懂。读取时**不做 JOIN**
-- （理由同 user_saves —— 后台要看到「当时报的是什么」）。
--
-- **没有 user_id**：提交不需要登录（详情页本来就没有登录入口，见
-- components/ReportGameButton.tsx 的注释），所以不留作者、只留内容。
-- 挡刷屏只能靠长度上限 + 后台人工处理（见 app/api/game-reports/route.ts）。
--
-- ⚠️ 老库要单独跑一次（只增不删，全程没有 DELETE / UPDATE / DROP）：
--   node --env-file=.env.local scripts/add-game-reports.mjs
--   理由同上面几条：本文件只对「还没建过表」的库有效。
CREATE TABLE IF NOT EXISTS game_reports (
  id          TEXT PRIMARY KEY,
  game_id     TEXT NOT NULL,             -- → games.id
  game_title  TEXT NOT NULL,             -- 快照：提交时的游戏名
  content     TEXT NOT NULL,             -- 问题正文（必填）
  resolved    INTEGER NOT NULL DEFAULT 0,-- 0 = 未解决，1 = 已解决（同 feedback）
  created_at  INTEGER NOT NULL
);

-- 后台列表「新的在前」，游标翻页走它
CREATE INDEX IF NOT EXISTS idx_game_reports_created_at ON game_reports (created_at DESC, id DESC);
-- 「这一款被报了几次」—— 将来想按游戏汇总时走它
CREATE INDEX IF NOT EXISTS idx_game_reports_game ON game_reports (game_id);

-- 游戏评论（2026-10-13 加，用户要的详情页「评论模块」）
--
-- ⚠️ 和上面两张「只留内容、不留作者」的表（feedback / game_reports）**正好相反**：
--    评论**必须先登录**（用户明确要求），所以每条都有作者。这不是顺带的收获 ——
--    正因为署了名，这张表才敢**公开可读**（谁都能看这一款下面的评论）。
--
-- `username` 是**写评论那一刻的快照**。站内用户名**不能改**（没有改名功能，
-- 见 app/api/user/profile/route.ts 的注释），所以这个快照基本不会旧；留着它是为了
-- **账号被删之后这一行仍然读得懂** —— 读取时 LEFT JOIN app_users，名字以库里的为准、
-- 快照兜底（见 lib/server/comments.ts 的 listGameComments）。
-- 头像相反：库里现取（`avatar_key`），用户换了头像，他所有旧评论跟着换 —— 头像本来就是
-- 「现在长什么样」，不是「当时长什么样」。
--
-- **没有 status / 隐藏位**：这一版的「管理」就是**作者自己删**
-- （`DELETE /api/comments/<id>` 只认作者）。站方要删得等后台加一个「评论」tab
-- （还没做，理由见 lib/server/comments.ts 的收尾注释）。
--
-- `rating` 是 **1..5 的整数星级**（2026-10-13 用户要求「评论有星星 1-5」）——
-- 评论和打分**合成一件事**，不另开一张评分表：一趟提交、一条记录、一份时间戳，
-- 汇总（那一款的均分 / 评分数）现算 `AVG/COUNT`（见 lib/server/comments.ts）。
--   · **NOT NULL、没有默认值**：不打分的「评论」在这一版不存在，写入通道只有一条
--     （`POST /api/games/<id>/comments`，逐个校验 1..5），不会塞进空值。
--   · **不写 CHECK 约束**：老库那列是 `ALTER TABLE ADD COLUMN` 补的（SQLite 的
--     ALTER 加不了 CHECK），给新库写 CHECK 就会出现「新库拦得住、老库拦不住」——
--     正是 `IF NOT EXISTS` 最怕的那种漂。校验一律留在接口层（唯一入口，够用）。
--
-- ⚠️ 老库要单独跑一次（只增不删，全程没有 DELETE / UPDATE / DROP）：
--   node --env-file=.env.local scripts/add-game-comments.mjs         （建表）
--   node --env-file=.env.local scripts/add-game-comments-rating.mjs  （补 rating 列）
--   理由同上面几条：本文件只对「还没建过表」的库有效。
CREATE TABLE IF NOT EXISTS game_comments (
  id          TEXT PRIMARY KEY,
  game_id     TEXT NOT NULL,             -- → games.id
  user_id     TEXT NOT NULL,             -- → app_users.id（必填 —— 评论要登录）
  username    TEXT NOT NULL,             -- 快照：写评论时的用户名（账号没了时兜底）
  content     TEXT NOT NULL,             -- 正文（必填）
  rating      INTEGER NOT NULL,          -- 星级 1..5（必填 —— 打分就是这条评论的一部分）
  created_at  INTEGER NOT NULL
);

-- 某一款游戏的评论「新的在前」+ 游标翻页都走它（WHERE game_id = ? 之后按时间倒序取）
-- 均分那条 `AVG/COUNT ... WHERE game_id = ?` 也吃它的前缀，不用再加索引
CREATE INDEX IF NOT EXISTS idx_game_comments_game ON game_comments (game_id, created_at DESC, id DESC);
-- 「我发过哪些评论」/ 将来后台按人查，走它
CREATE INDEX IF NOT EXISTS idx_game_comments_user ON game_comments (user_id, created_at DESC, id DESC);

-- ===================================================================
-- 机种文案的多语言侧表（2026-10-16 加）
--
-- 为什么从 consoles 的宽表搬出来：同 game_texts 的理由 —— 加语言 = 插数据，不动表结构。
-- 一行 = 「某个机种在某个语言下的文案」。字段可空，空了逐字段回退中文原文。
--
-- ⚠️ `locale` 取值见 lib/entity-text.ts 的 CONTENT_LOCALES（与 game-text.ts 共用同一套）。
-- ⚠️ 老库要单独跑一次（建表 + 从 consoles 旧列搬数据；幂等、只增不删）：
--      node --env-file=.env.local scripts/add-entity-texts.mjs
-- ⚠️ consoles 表里那 6 个旧文案列保留、但只写不读 —— 读取一律走这张表。
CREATE TABLE IF NOT EXISTS console_texts (
  console_type  TEXT NOT NULL,           -- → consoles.console_type
  locale        TEXT NOT NULL,           -- zh / en / ja / ko …
  name          TEXT,                    -- 机种展示名
  summary       TEXT,                    -- 简介
  description   TEXT,                    -- 介绍
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (console_type, locale)
);

-- 开发商文案的多语言侧表（2026-10-16 加）
--
-- 同 consoles，一行 = 「某个开发商在某个语言下的文案」。
-- ⚠️ 老库靠同一个脚本补：scripts/add-entity-texts.mjs
-- ⚠️ developers 表里那 6 个旧文案列保留、但只写不读。
CREATE TABLE IF NOT EXISTS developer_texts (
  developer_id  TEXT NOT NULL,           -- → developers.id
  locale        TEXT NOT NULL,           -- zh / en / ja / ko …
  name          TEXT,                    -- 开发商名
  summary       TEXT,                    -- 简介
  description   TEXT,                    -- 介绍
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (developer_id, locale)
);