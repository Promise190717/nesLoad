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
  developer     TEXT,                     -- 开发者（可选）
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_games_created_at ON games (created_at DESC);

-- 后台管理员账号
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,          -- 格式：salt:hash（scrypt）
  created_at     INTEGER NOT NULL
);