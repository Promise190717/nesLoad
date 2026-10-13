/*
 * 建「游戏评论」表（2026-10-13 用户要求：详情页详情模块下方加一个评论模块）。
 *
 * 用法：
 *   node --env-file=.env.local scripts/add-game-comments.mjs [--dry-run]
 *
 * 干一件事：把 game_comments 表和它的两个索引建出来，**全部幂等、只增不删**
 * （没有 DELETE / DROP / TRUNCATE，也不碰任何既有表）。
 *
 * 为什么非要单独跑一个脚本：db/schema.sql 里每条都是 `CREATE TABLE IF NOT EXISTS`，
 * 那句在**老库**上会看到表已存在就整句跳过 —— 但老库里本来就没有这张表，
 * 所以补跑一次即可；而**新库**是靠 schema.sql 一次建出来的。于是两份建表语句
 * **必须逐字一致**（漂了就会出现「新库有列、老库没有」这种最难查的问题）。
 *
 * ⚠️ 这个脚本只管**建表**。表是 2026-10-13 上午建的，那会儿还没有 `rating` 列 ——
 *    **今天之前建过表的库补列要另外跑**：scripts/add-game-comments-rating.mjs
 *    （这里 `IF NOT EXISTS` 见表已存在就整句跳过，补不出新列来）。
 *
 * ⚠️ `.env.local` 里连的是**真库**。这个脚本只执行 CREATE TABLE / CREATE INDEX，
 *    既有的表和数据一律不动。仍然建议先 `--dry-run` 看一眼。
 */

const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID } = process.env;

if (!CF_ACCOUNT_ID || !CF_D1_API_TOKEN || !D1_DATABASE_ID) {
  console.error('缺少环境变量：需要 CF_ACCOUNT_ID / CF_D1_API_TOKEN / D1_DATABASE_ID');
  console.error('用法：node --env-file=.env.local scripts/add-game-comments.mjs [--dry-run]');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');

const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

/** 跑一条 SQL，返回结果行。D1 的 /query 单次只吃一条语句，参数用 `?` 占位。 */
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

/** 「读不到就当空」：首次执行时表还不存在，计数拿不到不是错误。 */
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
 * 建表语句 —— **必须和 db/schema.sql 里那份逐字一致**（改一处要同步另一处）。
 */
const STATEMENTS = [
  [
    'game_comments',
    `CREATE TABLE IF NOT EXISTS game_comments (
  id          TEXT PRIMARY KEY,
  game_id     TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  username    TEXT NOT NULL,
  content     TEXT NOT NULL,
  rating      INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
)`,
  ],
  [
    'idx_game_comments_game',
    'CREATE INDEX IF NOT EXISTS idx_game_comments_game ON game_comments (game_id, created_at DESC, id DESC)',
  ],
  [
    'idx_game_comments_user',
    'CREATE INDEX IF NOT EXISTS idx_game_comments_user ON game_comments (user_id, created_at DESC, id DESC)',
  ],
];

console.log(DRY_RUN ? '== 空跑（不会写入任何东西）==' : '== 开始 ==');

const before = await safeCount('SELECT COUNT(*) AS n FROM game_comments');
console.log(`开始前：game_comments ${before} 条${before === 0 ? '（表可能还不存在）' : ''}。`);

/*
 * 逐步执行而不是拼一条多语句 —— 这样某一条失败时能准确指出是哪条，
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

const after = await safeCount('SELECT COUNT(*) AS n FROM game_comments');
if (before !== after) {
  console.log(`⚠️ game_comments 条数变了：${before} → ${after}，请核对！`);
}

console.log(DRY_RUN ? '== 空跑结束（什么都没写）==' : '== 完成 ==');
console.log(
  DRY_RUN
    ? '空跑模式下什么都没写。去掉 --dry-run 再跑一次即可真建表。'
    : 'game_comments 就绪。详情页那个评论模块可以用了。'
);
