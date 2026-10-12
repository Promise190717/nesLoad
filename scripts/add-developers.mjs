/*
 * 建「开发商库」并把 games 里现存的开发商接上去（2026-10-12 用户要求）。
 *
 * 用法：
 *   node --env-file=.env.local scripts/add-developers.mjs [--dry-run]
 *
 * 干三件事，**全部幂等、只增不删**（没有 DELETE / DROP / TRUNCATE）：
 *   ① 建 `developers` 表（`CREATE TABLE IF NOT EXISTS`，已有就跳过）；
 *   ② 给 `games` 补 `developer_id` 列（先 PRAGMA 读列，缺了才 ALTER）；
 *   ③ 把 `games.developer` 里现存的**去重取值**写进 `developers`（同名只建一次），
 *      再回填每条游戏的 `developer_id`（只填还空着的，已经填过的不动）。
 *
 * 为什么非要单独跑一个脚本：
 *   setup-db.mjs 跑的是 `CREATE TABLE IF NOT EXISTS games (...)` —— 表已存在就整句跳过，
 *   新列不会补进去；而且 `CREATE TABLE IF NOT EXISTS developers` 也只在**没建过**时才有效。
 *   SQLite 又没有 `ADD COLUMN IF NOT EXISTS`。所以老库必须走这里补一次。
 *
 * 为什么⑤步用「名字查一次、没有才插」而不是 `INSERT OR IGNORE`：
 *   插入前要拿 id 去回填 games，而 `INSERT OR IGNORE` 撞唯一索引时不会告诉我们那行的 id，
 *   还得再查一次。直接「先查后插」少一次往返，也让 --dry-run 能准确报出「会新建几个」。
 *
 * ⚠️ `.env.local` 里连的是**真库**。这个脚本不删不改既有数据（只往空位上写 developer_id），
 *    但仍然建议先 `--dry-run` 看一眼它打算做什么。
 */
import { randomUUID } from 'node:crypto';

const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID } = process.env;

if (!CF_ACCOUNT_ID || !CF_D1_API_TOKEN || !D1_DATABASE_ID) {
  console.error('缺少环境变量：需要 CF_ACCOUNT_ID / CF_D1_API_TOKEN / D1_DATABASE_ID');
  console.error('用法：node --env-file=.env.local scripts/add-developers.mjs [--dry-run]');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');

const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

/**
 * 跑一条 SQL，返回结果行。D1 的 /query 单次只吃一条语句，参数用 `?` 占位（服务端绑定）。
 * 占位符按**出现顺序**编号 —— `params` 的顺序要和 SQL 里的 `?` 一一对应。
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

/** `PRAGMA table_info` 在 D1 上是允许的；万一某天不允许，返回空数组让它走 ALTER 那条路。 */
async function gameColumns() {
  try {
    const rows = await run('PRAGMA table_info(games)');
    return Array.isArray(rows) ? rows.map((row) => row.name) : [];
  } catch (error) {
    console.warn('读列信息失败（继续尝试 ADD COLUMN）：', error.message);
    return [];
  }
}

/** 前后各打一次总条数，用来证明「一条都没少」。 */
const countGames = async () => Number((await run('SELECT COUNT(*) AS n FROM games'))[0]?.n ?? 0);

/**
 * 「读不到就当空」的查询。两种正常情况要让调用方自己兜底，不能直接崩：
 *   · 空跑时 developers 表还没建（我们刻意不写）→ no such table
 *   · 空跑时 games.developer_id 还没补 → no such column
 */
async function safeRun(sql, params = []) {
  try {
    return await run(sql, params);
  } catch (error) {
    if (/no such (table|column)/i.test(error.message)) return [];
    throw error;
  }
}

const countDevelopers = async () =>
  Number((await safeRun('SELECT COUNT(*) AS n FROM developers'))[0]?.n ?? 0);

/** 统计「没接上开发商」的条数。developer_id 列还没补上时，等于全部都没接。 */
async function unlinkedGames() {
  const rows = await safeRun(
    "SELECT COUNT(*) AS n FROM games WHERE developer_id IS NULL OR TRIM(developer_id) = ''"
  );
  return rows.length === 0 ? countGames() : Number(rows[0]?.n ?? 0);
}

// ---------------------------------------------------------------- ① 建表

console.log(DRY_RUN ? '== 空跑（不会写入任何东西）==' : '== 开始 ==');

const gamesBefore = await countGames();
const devsBefore = await countDevelopers();
const unlinkedBefore = await unlinkedGames();
console.log(`开始前：games ${gamesBefore} 条（其中 ${unlinkedBefore} 条没接开发商）、developers ${devsBefore} 条。`);

/*
 * 建表语句和 db/schema.sql 里那份**必须一模一样** —— 这里是为了让老库也能补上，
 * schema.sql 是为了让新库一次建对。两处漂了就会出现「新库有列、老库没有」。
 */
const CREATE_DEVELOPERS = `
CREATE TABLE IF NOT EXISTS developers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  image_url     TEXT,
  summary       TEXT,
  description   TEXT,
  founded_year  INTEGER,
  website       TEXT,
  created_at    INTEGER NOT NULL
)`;

const CREATE_DEVELOPERS_INDEX =
  'CREATE INDEX IF NOT EXISTS idx_developers_created_at ON developers (created_at DESC)';

if (!DRY_RUN) {
  await run(CREATE_DEVELOPERS);
  await run(CREATE_DEVELOPERS_INDEX);
}
console.log('① developers 表：就绪（已存在则原样保留）。');

// ---------------------------------------------------------------- ② 补列

let cols = await gameColumns();
if (cols.includes('developer_id')) {
  console.log('② games.developer_id 已存在 —— 什么都没做。');
} else if (DRY_RUN) {
  console.log('② 会给 games 添加列：developer_id TEXT（可空，老记录保持 NULL）。');
} else {
  try {
    await run('ALTER TABLE games ADD COLUMN developer_id TEXT');
    await run('CREATE INDEX IF NOT EXISTS idx_games_developer_id ON games (developer_id)');
    console.log('② 已添加列：games.developer_id TEXT，并建了索引。');
  } catch (error) {
    // 并发 / 重复执行时会撞上「列已存在」，那不是错误
    if (/duplicate column name/i.test(error.message)) {
      console.log('② 列 developer_id 已存在（并发 / 重复执行）—— 什么都没做。');
    } else {
      console.error('失败：', error.message);
      process.exit(1);
    }
  }
  cols = await gameColumns();
}

// ---------------------------------------------------------------- ③ 回填

const names = (
  await run(
    "SELECT DISTINCT developer FROM games WHERE developer IS NOT NULL AND TRIM(developer) <> '' ORDER BY developer"
  )
).map((row) => row.developer);

console.log(`③ games 里现有 ${names.length} 个不同的开发商名字。`);

/** 统计待回填条数的那条判据，和 UPDATE 的 WHERE 必须一致（不然报出来的数会对不上）。 */
const PENDING_CONDITION = "developer = ? AND (developer_id IS NULL OR TRIM(developer_id) = '')";

/**
 * 某个名字下「还没接上开发商」的条数。
 * developer_id 列还没补上时（空跑会经过这一步）退化成「这个名字下的全部游戏」。
 */
async function pendingCount(name) {
  const rows = await safeRun(`SELECT COUNT(*) AS n FROM games WHERE ${PENDING_CONDITION}`, [name]);
  if (rows.length > 0) return Number(rows[0]?.n ?? 0);
  const all = await run('SELECT COUNT(*) AS n FROM games WHERE developer = ?', [name]);
  return Number(all[0]?.n ?? 0);
}

let created = 0;
let reused = 0;
let linked = 0;

for (const name of names) {
  const found = await safeRun('SELECT id FROM developers WHERE name = ?', [name]);

  // 只回填还空着的：后台手动改过的关联不许被覆盖
  const pending = await pendingCount(name);

  let id = found[0]?.id ?? null;
  const isNew = !id;

  if (isNew) {
    created += 1;
    if (!DRY_RUN) {
      id = randomUUID();
      await run(
        'INSERT INTO developers (id, name, image_url, summary, description, founded_year, website, created_at) VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, ?)',
        [id, name, Date.now()]
      );
    }
  } else {
    reused += 1;
  }

  // 空跑时没有 id（新建的那些），跳过写入
  if (!DRY_RUN && id && pending > 0) {
    await run(`UPDATE games SET developer_id = ? WHERE ${PENDING_CONDITION}`, [id, name]);
  }

  linked += pending;
  console.log(
    `   · 「${name}」（${isNew ? '新建开发商' : '已有开发商'}）→ ${pending} 条游戏` +
      `${DRY_RUN ? '待接上（空跑，未写入）' : ' 已接上'}`
  );
}

// ---------------------------------------------------------------- 收尾核对

const gamesAfter = await countGames();
const devsAfter = await countDevelopers();
const unlinkedAfter = await unlinkedGames();

console.log(DRY_RUN ? '== 空跑结束（什么都没写）==' : '== 完成 ==');
console.log(
  `developers：${devsBefore} → ${devsAfter}（新建 ${created}、复用 ${reused}）` +
    `${DRY_RUN ? '（空跑，未写入）' : ''}`
);
console.log(
  `games：${gamesBefore} → ${gamesAfter} 条` +
    `${gamesAfter === gamesBefore ? ' ✅ 一条没多、一条没少。' : ' ⚠️ 条数变了，请核对！'}`
);
console.log(
  `还没接上开发商的游戏：${unlinkedBefore} → ${unlinkedAfter}` +
    `${unlinkedAfter === 0 ? ' ✅ 全部接上了。' : '（这些是 developer 为空 / 名字异常的，属正常）'}`
);
console.log(`games 现有列：${cols.join(', ') || '(读不到)'}`);
console.log(`本次处理 ${linked} 条游戏的关联${DRY_RUN ? '（空跑，一条都没写）' : ''}。`);
