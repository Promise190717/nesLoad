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
CREATE TABLE IF NOT EXISTS games (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,            -- 游戏名（必填，中文原文）
  title_en      TEXT,                     -- 游戏名英文（可空，2026-10-13 加）
  image_url     TEXT NOT NULL,            -- 封面图公网 URL（必填）
  rom_url       TEXT NOT NULL,            -- ROM 在 R2 的对象 key（必填）
  rom_name      TEXT NOT NULL,            -- ROM 原始文件名（FBNeo 靠 zip 文件名认驱动）
  console_type  TEXT NOT NULL,            -- nes / snes / gba / arcade（必填）
  language      TEXT,                     -- 语言（可选）
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

-- ⚠️ 上面那列 `description` 是 2026-10-12 补的。**这个文件只对「还没建过表」的库有效**：
--    `CREATE TABLE IF NOT EXISTS` 见表已存在就整句跳过，不会往老表里补列。
--    已经上线的库要单独补一次（只增不删，全程没有 DELETE / UPDATE / DROP）：
--      node --env-file=.env.local scripts/add-games-description.mjs
--    为什么不把 `ALTER TABLE ... ADD COLUMN` 直接写进本文件：这个文件里每条语句都是
--    `IF NOT EXISTS`、可以反复执行；ALTER 跑第二遍会报 `duplicate column name`，
--    掺进来就把「重复执行无害」这个性质破坏了。

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
  created_at    INTEGER NOT NULL
);

-- ⚠️ `name_en` / `summary_en` / `description_en` 与 games 那几个 `_en` 同一次加的
--    （2026-10-13，见 games 表上方的总说明与 scripts/add-i18n-fields.mjs）。
--    `name_en` 改了要**级联**到 `games.developer_en`（见 lib/server/developers.ts 的
--    updateDeveloper），否则开发商页写着 Capcom、游戏卡片上还是老名字。

-- 列表默认按创建时间倒序（和 games 一致：新加的排在前面）
CREATE INDEX IF NOT EXISTS idx_developers_created_at ON developers (created_at DESC);

-- ⚠️ `games.developer_id` 与下面这张表同样是 2026-10-12 补的，老库要单独跑一次：
--      node --env-file=.env.local scripts/add-developers.mjs
--    那个脚本做三件事（幂等、只增不删）：建这张表 → 给 games 补 developer_id 列 →
--    把 games 里现存的 developer 取值去重写进 developers，再回填每条游戏的 developer_id。

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
  title         TEXT NOT NULL,           -- 快照：游戏名（⚠️ 读取时改用 games 的两份，见下方注释）
  image_url     TEXT NOT NULL,           -- 快照：封面地址
  rom_name      TEXT NOT NULL,           -- 快照：ROM 原始文件名（FBNeo 认它）
  console_type  TEXT NOT NULL,           -- 快照：nes / snes / gba / arcade
  played_at     INTEGER NOT NULL,        -- 最近一次玩的时间（列表按它倒序）
  created_at    INTEGER NOT NULL,        -- 第一次玩的时间
  PRIMARY KEY (user_id, game_id)
);

-- 取某人的历史、按最近玩过倒序 —— 这条查询走它
CREATE INDEX IF NOT EXISTS idx_user_history_recent ON user_history (user_id, played_at DESC);

-- ⚠️ 2026-10-13（双语）：这张表**不加 `title_en`** —— 列表读取时 `JOIN games` 现取
--    `g.title` / `g.title_en` 两份（见 lib/server/user-data.ts 的 listUserHistory）。
--    快照列 `title` 仍然写（写入路径不变，它也帮不上双语），只是读取不用它。
--    这样既不用加列、也不用回头补历史数据的英文名。

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