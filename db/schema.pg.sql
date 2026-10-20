-- ============================================================================
-- nesLoad · Supabase (Postgres) 全量结构
--
-- 用途：替代 db/schema.sql（那份是 Cloudflare D1 / SQLite 方言）。
-- 本文件**只对全新的 Supabase 库**有效，可反复执行（全部 IF NOT EXISTS / ON CONFLICT）。
--
-- 与 D1 那份的三处**刻意不同**（不是翻译，是重新设计）：
--
--   ① 主键用**上游 slug**（text），不用 UUID。
--      站内详情页地址本来就是 `/games/<slug>`（CATALOG_SOURCE=upstream 时），
--      拿 slug 当主键 ⇒ 爬取天然幂等（`on conflict do update`）、地址不用二次映射、
--      sitemap 直接对得上。UUID 在这里只会多一层「slug → uuid」的查询。
--
--   ② **一行 = 一款游戏**，多语言 ROM 拆到 `game_roms`。
--      D1 那份是「一行 = 一盘 ROM」，同款四个语言版本就是四行，靠 `group_key` 再聚回去，
--      于是每次列表都要 `COALESCE(group_key, id)` 这种回表、还要维护聚合键。
--      这里 1 款 : N 个 ROM : 4 份文案，三张表各管一件事，列表查询不用回表。
--
--   ③ 类型用**原生类型**：时间 `timestamptz`、布尔 `boolean`、短枚举 `smallint`/`text`、
--      多值 `text[]`（GIN 索引直接可筛）。D1 那边全是 INTEGER 0/1 和毫秒时间戳，
--      是 SQLite 没有布尔/时间类型逼出来的，这边不必跟着。
--
-- ⚠️ **所有表都开 RLS 且不建 policy**（文件末尾）。服务端用 secret key（绕过 RLS），
--    浏览器端的 publishable key 则一行都读不到 —— 本站没有「客户端直连数据库」的需求，
--    开 RLS 纯粹是给公开 key 上一把锁。
-- ============================================================================

create extension if not exists pg_trgm;   -- 模糊搜索（`ilike '%关键词%'` 走 GIN）

-- ---------------------------------------------------------------------------
-- 机种（14 台，清单唯一出处是代码里的 lib/consoles.ts 的 CONSOLE_TYPES）
--
-- 主键是**机种短码本身**（'nes' / 'snes' / … / 'arcade'），不是自增 id：
-- 机种是代码里定死的枚举，地址 `/consoles/nes` 要稳定好看，而且 games.console_type
-- 天生就是它的外键。
-- ---------------------------------------------------------------------------
create table if not exists consoles (
  console_type  text primary key,
  image_url     text,
  release_year  integer,
  sort_order    smallint not null default 100,   -- 展示顺序（小的在前）
  created_at    timestamptz not null default now()
);

-- 机种文案（一行 = 一个机种在一个语言下的文案）
create table if not exists console_texts (
  console_type  text not null references consoles(console_type) on delete cascade,
  locale        text not null,
  name          text,
  summary       text,
  description   text,
  updated_at    timestamptz not null default now(),
  primary key (console_type, locale)
);

-- ---------------------------------------------------------------------------
-- 开发商
--
-- 上游详情里带了开发商的 slug / 成立年份 / 厂标 / 简介，全部落下来 ——
-- 站内的「开发商专题页」就是靠这些，不需要再回头去抓。
-- ---------------------------------------------------------------------------
create table if not exists developers (
  slug          text primary key,            -- 上游 slug（如 nintendo）
  image_url     text,                        -- 厂标
  founded_year  integer,
  website       text,
  created_at    timestamptz not null default now()
);

create table if not exists developer_texts (
  developer_slug text not null references developers(slug) on delete cascade,
  locale         text not null,
  name           text,
  summary        text,
  description    text,
  updated_at     timestamptz not null default now(),
  primary key (developer_slug, locale)
);

-- ---------------------------------------------------------------------------
-- 系列（上游同样给了 slug / 厂标 / 简介）
-- ---------------------------------------------------------------------------
create table if not exists series (
  slug          text primary key,
  image_url     text,
  created_at    timestamptz not null default now()
);

create table if not exists series_texts (
  series_slug   text not null references series(slug) on delete cascade,
  locale        text not null,
  name          text,
  description   text,
  updated_at    timestamptz not null default now(),
  primary key (series_slug, locale)
);

-- ---------------------------------------------------------------------------
-- 游戏（一行 = 一款游戏，**不是一盘 ROM**）
-- ---------------------------------------------------------------------------
create table if not exists games (
  slug            text primary key,          -- 上游 slug，站内详情页地址就用它
  console_type    text not null references consoles(console_type),
  image_url       text not null,             -- 封面（源站绝对地址，去掉了域名？没有 —— 见下）
  year            integer,                   -- 发售年份（releaseDate 取前四位）
  release_date    date,
  developer_slug  text references developers(slug) on delete set null,
  series_slug     text references series(slug) on delete set null,
  genres          text[] not null default '{}',
  tags            text[] not null default '{}',
  is_featured     boolean not null default false,
  is_popular      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 列表主查询：`where console_type = ? order by created_at desc`
create index if not exists idx_games_console_created on games (console_type, created_at desc);
create index if not exists idx_games_created on games (created_at desc);
-- 「点开发商 / 点系列 → 出名下所有游戏」
create index if not exists idx_games_developer on games (developer_slug);
create index if not exists idx_games_series on games (series_slug);
-- 多值筛选（`genres @> '{platformer}'` / `tags && '{经典}'`）
create index if not exists idx_games_genres on games using gin (genres);
create index if not exists idx_games_tags on games using gin (tags);

-- 游戏文案（一行 = 一款游戏在一个语言下的文案；字段可空，读取时逐字段回退中文）
--
-- ⚠️ `controls` 是 jsonb（`{description, keys:[{label,action}]}`）——
--    D1 那份没有这一列（源站独有），这里补上，详情页那块「操作说明」才有数据。
create table if not exists game_texts (
  game_slug     text not null references games(slug) on delete cascade,
  locale        text not null,
  title         text,
  description   text,
  controls      jsonb,
  updated_at    timestamptz not null default now(),
  primary key (game_slug, locale)
);

-- 搜索：`where locale='zh' and title ilike '%马里奥%'`
-- 用表达式索引 + trgm，前缀/中缀都能走；不加表达式就只能全表扫。
create index if not exists idx_game_texts_title_trgm
  on game_texts using gin (title gin_trgm_ops);
create index if not exists idx_game_texts_locale on game_texts (locale);

-- ROM（一行 = 一款游戏的一个语言版本）
--
-- ⚠️ `source_url` 是**站内形态**：`site:/games/roms/x.nes` / `files:/games/roms/x.zip`，
--    **不含域名**（域名在 lib/server/upstream.ts 的 UPSTREAM_ROOT，换域名不用改数据）。
--    两个 host 不可互换，所以角色前缀必须留着 —— 只存 path 会有一半文件 404。
-- ⚠️ 按需求**只存链接、不下载 ROM**，所以这张表没有字节数 / 校验和之类的列。
create table if not exists game_roms (
  game_slug     text not null references games(slug) on delete cascade,
  language      text not null,               -- zh / en / ja / ko
  rom_name      text not null,               -- 原始文件名（FBNeo 靠它认驱动）
  source_url    text not null,               -- `site:/…` / `files:/…`
  size_bytes    bigint,
  created_at    timestamptz not null default now(),
  primary key (game_slug, language)
);

-- 详情页「默认 ROM」= 按 GAME_LANGUAGES 的顺序取第一份，走主键前缀即可，无需额外索引。

-- ---------------------------------------------------------------------------
-- 后台管理员（与前台用户**彻底隔离**：两套表 / 两套会话 / 两只 cookie）
-- ---------------------------------------------------------------------------
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  password_hash text not null,               -- salt:hash（scrypt）
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 前台注册用户
-- ---------------------------------------------------------------------------
create table if not exists app_users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  password_hash text not null,               -- salt:hash（scrypt）
  status        smallint not null default 1, -- 1 正常 / 0 封禁
  gender        text,                        -- male / female / other
  avatar_key    text,                        -- R2 对象 key（地址由服务端现拼）
  vip_expires_at timestamptz,                -- null = 从来不是会员；过去 = 已过期
  last_login_at timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_app_users_created on app_users (created_at desc);

-- 云端历史（只记在线库里的游戏；快照列让列表不用回表）
create table if not exists user_history (
  user_id       uuid not null references app_users(id) on delete cascade,
  game_slug     text not null,               -- 不加外键：游戏下架后历史仍要显示（读取时 join 过滤）
  title         text not null,               -- 快照
  image_url     text not null,               -- 快照
  rom_name      text not null,               -- 快照（FBNeo 认它）
  console_type  text not null,               -- 快照
  played_at     timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  primary key (user_id, game_slug)
);

create index if not exists idx_user_history_recent on user_history (user_id, played_at desc);

-- 云端存档槽（本体在 R2，这里只存指针）
create table if not exists user_saves (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app_users(id) on delete cascade,
  game_slug     text not null,
  rom_name      text not null,               -- 分组键：按 ROM 文件名分槽
  title         text not null,               -- 快照
  state_key     text not null,               -- R2 对象 key
  size          bigint not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists idx_user_saves_rom on user_saves (user_id, rom_name, created_at desc);
create index if not exists idx_user_saves_user on user_saves (user_id, created_at desc);

-- 收藏（主键天然去重：重复收藏是空操作）
create table if not exists user_favorites (
  user_id       uuid not null references app_users(id) on delete cascade,
  game_slug     text not null,
  created_at    timestamptz not null default now(),
  primary key (user_id, game_slug)
);

create index if not exists idx_user_favorites_recent on user_favorites (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 留言本（匿名、公开可读）—— 与 game_reports 刻意分开，理由见 D1 那份 schema
-- ---------------------------------------------------------------------------
create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  content     text not null,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_feedback_created on feedback (created_at desc, id desc);

-- 游戏问题反馈（只对后台可见）
create table if not exists game_reports (
  id          uuid primary key default gen_random_uuid(),
  game_slug   text not null,
  game_title  text not null,                 -- 快照（游戏下架后仍读得懂）
  content     text not null,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_game_reports_created on game_reports (created_at desc, id desc);
create index if not exists idx_game_reports_game on game_reports (game_slug);

-- ---------------------------------------------------------------------------
-- 游戏评论（**必须登录**，所以每条都有作者；打分 1..5 与评论是同一条记录）
-- ---------------------------------------------------------------------------
create table if not exists game_comments (
  id          uuid primary key default gen_random_uuid(),
  game_slug   text not null,
  user_id     uuid not null references app_users(id) on delete cascade,
  username    text not null,                 -- 快照（账号删了仍读得懂）
  content     text not null,
  rating      smallint not null check (rating between 1 and 5),
  created_at  timestamptz not null default now()
);

create index if not exists idx_game_comments_game on game_comments (game_slug, created_at desc, id desc);
create index if not exists idx_game_comments_user on game_comments (user_id, created_at desc, id desc);

-- ============================================================================
-- RLS：全部开启、**一条 policy 都不建**
--
-- 服务端走 secret key（`sb_secret_...` / service_role），RLS 对它无效；
-- 浏览器端只有 publishable key，开了 RLS 又没有 policy ⇒ 读 0 行、写被拒。
-- 这正是我们要的：本站没有任何「客户端直连数据库」的路径，数据一律经 API 路由。
--
-- ⚠️ 将来真要给某个表开公开读（比如评论），**必须同时**写 policy，
--    否则开了 RLS 之后前台会突然读不到 —— 而且表现为「列表空了」而不是报错。
-- ============================================================================
alter table consoles        enable row level security;
alter table console_texts   enable row level security;
alter table developers      enable row level security;
alter table developer_texts enable row level security;
alter table series          enable row level security;
alter table series_texts    enable row level security;
alter table games           enable row level security;
alter table game_texts      enable row level security;
alter table game_roms       enable row level security;
alter table users           enable row level security;
alter table app_users       enable row level security;
alter table user_history    enable row level security;
alter table user_saves      enable row level security;
alter table user_favorites  enable row level security;
alter table feedback        enable row level security;
alter table game_reports    enable row level security;
alter table game_comments   enable row level security;
