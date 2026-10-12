-- NES / SFC / 街机游戏元数据（文件本体在 R2，这里只存指针与元信息）
CREATE TABLE IF NOT EXISTS games (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,            -- 游戏名（必填）
  image_url     TEXT NOT NULL,            -- 封面图公网 URL（必填）
  rom_url       TEXT NOT NULL,            -- ROM 在 R2 的对象 key（必填）
  rom_name      TEXT NOT NULL,            -- ROM 原始文件名（FBNeo 靠 zip 文件名认驱动）
  console_type  TEXT NOT NULL,            -- nes / snes / arcade（必填）
  language      TEXT,                     -- 语言（可选）
  series        TEXT,                     -- 系列（可选）
  year          INTEGER,                  -- 年份（可选）
  developer     TEXT,                     -- 开发商名（可选）—— 这是**快照**，真身在 developers 表
  developer_id  TEXT,                     -- 开发商外键（可选，2026-10-12 加）→ developers.id
  description   TEXT,                     -- 说明 / 简介（可选，2026-10-12 加）
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
  name          TEXT NOT NULL UNIQUE,     -- 开发商名（必填、唯一）
  image_url     TEXT,                     -- 厂标 / 图片公网 URL（可选）
  summary       TEXT,                     -- 简介（一句话，可选）
  description   TEXT,                     -- 介绍（整段，可选）
  founded_year  INTEGER,                  -- 成立年份（可选）
  website       TEXT,                     -- 官网地址（可选）
  created_at    INTEGER NOT NULL
);

-- 列表默认按创建时间倒序（和 games 一致：新加的排在前面）
CREATE INDEX IF NOT EXISTS idx_developers_created_at ON developers (created_at DESC);

-- ⚠️ `games.developer_id` 与下面这张表同样是 2026-10-12 补的，老库要单独跑一次：
--      node --env-file=.env.local scripts/add-developers.mjs
--    那个脚本做三件事（幂等、只增不删）：建这张表 → 给 games 补 developer_id 列 →
--    把 games 里现存的 developer 取值去重写进 developers，再回填每条游戏的 developer_id。

-- 后台管理员账号
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,          -- 格式：salt:hash（scrypt）
  created_at     INTEGER NOT NULL
);

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