/*
 * 建「前台用户」那四张表（2026-10-13 用户要求）。
 *
 * 用法：
 *   node --env-file=.env.local scripts/add-app-users.mjs [--dry-run]
 *
 * 干一件事：把下面四张表建出来，**全部幂等、只增不删**（没有 DELETE / DROP / TRUNCATE）：
 *   · app_users       —— 前台注册用户（**和后台管理员 users 表是两回事**）
 *   · user_history    —— 云端游戏历史
 *   · user_saves      —— 云端存档槽（本体在 R2）
 *   · user_favorites  —— 收藏
 *
 * 为什么非要单独跑一个脚本：
 *   db/schema.sql 里每条都是 `CREATE TABLE IF NOT EXISTS` —— 老库上那几张表本来就不存在，
 *   补跑一遍这个脚本即可；但**新库**是靠 schema.sql 一次建出来的，所以两份建表语句
 *   **必须逐字一致**（漂了就会出现「新库有列、老库没有」这种最难查的问题）。
 *
 * ⚠️ 这个脚本**不碰 `users` 表**（那是后台管理员表）。它也不会往任何一张表里写业务数据 ——
 *    只建结构。用户数据是运行时由接口写进去的。
 *
 * ⚠️ `.env.local` 里连的是**真库**。这个脚本只执行 CREATE TABLE / CREATE INDEX，
 *    既有的表和数据一律不动。仍然建议先 `--dry-run` 看一眼。
 */

const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID } = process.env;

if (!CF_ACCOUNT_ID || !CF_D1_API_TOKEN || !D1_DATABASE_ID) {
  console.error('缺少环境变量：需要 CF_ACCOUNT_ID / CF_D1_API_TOKEN / D1_DATABASE_ID');
  console.error('用法：node --env-file=.env.local scripts/add-app-users.mjs [--dry-run]');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');

const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

/**
 * 跑一条 SQL，返回结果行。D1 的 /query 单次只吃一条语句，参数用 `?` 占位（服务端绑定）。
 */
async function run(sql, params = []) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_D1_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  const data = await res.json();
  if (!res.ok || !data.success || !data.result?.[0]?.success) {
    const detail = (data.errors ?? []).map((e) => e.message).filter(Boolean).join('; ');
    throw new Error(`${detail || `HTTP ${res.status}`}（语句：${sql.replace(/\s+/g, ' ')}）`);
  }
  return data.result[0].results ?? [];
}

/** 「读不到就当空」：空跑 / 首次执行时表还不存在，计数拿不到不是错误。 */
async function safeCount(sql) {
  try {
    const rows = await run(sql);
    return Number(rows[0]?.n ?? 0);
  } catch (error) {
    if (/no such table/i.test(error.message)) return 0;
    throw error;
  }
}

/*
 * 建表语句 —— **必须和 db/schema.sql 里那几份逐字一致**（改一处要同步另一处）。
 * 顺序也有讲究：先 app_users，其余三张都指向它。
 */
const STATEMENTS = [
  [
    'app_users',
    `CREATE TABLE IF NOT EXISTS app_users (
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  status         INTEGER NOT NULL DEFAULT 1,
  created_at     INTEGER NOT NULL,
  last_login_at  INTEGER
)`,
  ],
  [
    'idx_app_users_created_at',
    'CREATE INDEX IF NOT EXISTS idx_app_users_created_at ON app_users (created_at DESC)',
  ],
  [
    'user_history',
    `CREATE TABLE IF NOT EXISTS user_history (
  user_id       TEXT NOT NULL,
  game_id       TEXT NOT NULL,
  title         TEXT NOT NULL,
  image_url     TEXT NOT NULL,
  rom_name      TEXT NOT NULL,
  console_type  TEXT NOT NULL,
  played_at     INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (user_id, game_id)
)`,
  ],
  [
    'idx_user_history_recent',
    'CREATE INDEX IF NOT EXISTS idx_user_history_recent ON user_history (user_id, played_at DESC)',
  ],
  [
    'user_saves',
    `CREATE TABLE IF NOT EXISTS user_saves (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  game_id     TEXT NOT NULL,
  rom_name    TEXT NOT NULL,
  title       TEXT NOT NULL,
  state_key   TEXT NOT NULL,
  size        INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
)`,
  ],
  [
    'idx_user_saves_rom',
    'CREATE INDEX IF NOT EXISTS idx_user_saves_rom ON user_saves (user_id, rom_name, created_at DESC)',
  ],
  [
    'idx_user_saves_user',
    'CREATE INDEX IF NOT EXISTS idx_user_saves_user ON user_saves (user_id, created_at DESC)',
  ],
  [
    'user_favorites',
    `CREATE TABLE IF NOT EXISTS user_favorites (
  user_id     TEXT NOT NULL,
  game_id     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, game_id)
)`,
  ],
  [
    'idx_user_favorites_recent',
    'CREATE INDEX IF NOT EXISTS idx_user_favorites_recent ON user_favorites (user_id, created_at DESC)',
  ],
];

const TABLE_NAMES = ['app_users', 'user_history', 'user_saves', 'user_favorites'];

console.log(DRY_RUN ? '== 空跑（不会写入任何东西）==' : '== 开始 ==');

const before = {};
for (const name of TABLE_NAMES) before[name] = await safeCount(`SELECT COUNT(*) AS n FROM ${name}`);
console.log(
  `开始前：${TABLE_NAMES.map((n) => `${n} ${before[n]} 条`).join('、')}` +
    `${TABLE_NAMES.every((n) => before[n] === 0) ? '（表可能还不存在）' : ''}。`
);

/*
 * 逐步执行而不是拼一条多语句 —— 这样某一条失败时能准确指出是哪张表，
 * 而且各条都是 IF NOT EXISTS，重复跑一遍完全无害。
 */
for (const [label, sql] of STATEMENTS) {
  if (DRY_RUN) {
    console.log(`· ${label}：会执行（空跑，未写入）`);
    continue;
  }
  try {
    await run(sql);
    console.log(`· ${label}：就绪（已存在则原样保留）`);
  } catch (error) {
    console.error(`✗ ${label} 失败：${error.message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------- 收尾核对

const after = {};
for (const name of TABLE_NAMES) after[name] = await safeCount(`SELECT COUNT(*) AS n FROM ${name}`);

// 管理员表要原样 —— 这个脚本绝不该动到它
const admins = await safeCount('SELECT COUNT(*) AS n FROM users');

console.log(DRY_RUN ? '== 空跑结束（什么都没写）==' : '== 完成 ==');
console.log(
  `建表结果：${TABLE_NAMES.map((n) => `${n} ${after[n]} 条`).join('、')}` +
    `${DRY_RUN ? '（空跑，未写入）' : ''}`
);
for (const name of TABLE_NAMES) {
  if (before[name] !== 0 && before[name] !== after[name]) {
    console.log(`⚠️ ${name} 条数变了：${before[name]} → ${after[name]}，请核对！`);
  }
}
console.log(`后台管理员 users 表：${admins} 条（本脚本不动它 —— 前台用户是另一张表）。`);
console.log(
  DRY_RUN
    ? '空跑模式下什么都没写。去掉 --dry-run 再跑一次即可真建表。'
    : '四张表就绪。前台注册 / 登录 / 历史 / 存档 / 收藏都可以用了。'
);
