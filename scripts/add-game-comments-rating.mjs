/*
 * 给 `game_comments` 补 `rating` 列（2026-10-13 用户要求「评论有星星 1-5」）。
 *
 * 用法：
 *   node --env-file=.env.local scripts/add-game-comments-rating.mjs [--dry-run]
 *
 * 干一件事：把 1..5 的星级列加到已有表上 ——
 *   ALTER TABLE game_comments ADD COLUMN rating INTEGER NOT NULL DEFAULT 5
 * **只增不删**：不碰任何既有列、不 UPDATE / DELETE 一行数据（收尾会核对条数没变）。
 *
 * ⚠️ 为什么非要单独来一趟：`CREATE TABLE IF NOT EXISTS` 见表已存在就**整句跳过**，
 *    补不出新列（这个坑和 add-user-profile.mjs 一模一样）。新库靠 db/schema.sql 一次
 *    建全（那份 DDL 里已经有 rating），老库只能靠这个脚本补。
 *
 * ⚠️ **老行怎么办**：没有历史评分可补，只能给默认 **5**。今天上午建的表，里面多半
 *    只有几条自己试发的评论 —— 脚本会把「几条老评论吃到了默认分」明说出来，
 *    真嫌不准，那几条自己删掉重发即可（评论的删除入口只有作者本人，见 /api/comments/<id>）。
 *
 * ⚠️ `ALTER TABLE ... ADD COLUMN` 跑第二遍会报 `duplicate column name` ——
 *    所以先 `PRAGMA table_info` 看一眼，已经有这一列就跳过（幂等，重复跑无害）。
 *
 * ⚠️ **不带 CHECK (rating BETWEEN 1 AND 5)**：SQLite 的 ALTER 加不了约束，只给新库
 *    （schema.sql）带就会出现「新库拦得住、老库拦不住」——正是 IF NOT EXISTS 最怕的漂。
 *    1..5 的校验一律留在唯一写入通道上：`POST /api/games/<id>/comments`。
 */

const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID } = process.env;

if (!CF_ACCOUNT_ID || !CF_D1_API_TOKEN || !D1_DATABASE_ID) {
  console.error('缺少环境变量：需要 CF_ACCOUNT_ID / CF_D1_API_TOKEN / D1_DATABASE_ID');
  console.error(
    '用法：node --env-file=.env.local scripts/add-game-comments-rating.mjs [--dry-run]'
  );
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

/** 「读不到就当 0」：表还不存在时计数拿不到不是错误。 */
async function safeCount(sql) {
  try {
    const rows = await run(sql);
    return Number(rows[0]?.n ?? 0);
  } catch (error) {
    if (/no such table/i.test(error.message)) return 0;
    throw error;
  }
}

/** 和 db/schema.sql 里 game_comments 的 `rating` 列**语义一致**（DDL 文本必然不同 —— ALTER 只能一列一列加）。 */
const COLUMN = 'rating';
const ALTER = `ALTER TABLE game_comments ADD COLUMN ${COLUMN} INTEGER NOT NULL DEFAULT 5`;

console.log(DRY_RUN ? '== 空跑（不会写入任何东西）==' : '== 开始 ==');

// 先看一下表现有哪些列（表不存在时这个 PRAGMA 返回空行，不报错）
const before = await run('PRAGMA table_info(game_comments)');
if (before.length === 0) {
  console.error('✗ 没有 game_comments 表 —— 先跑 scripts/add-game-comments.mjs 建表，再回来补列。');
  process.exit(1);
}
const existing = new Set(before.map((c) => c.name));
console.log(`game_comments 现有 ${before.length} 列：${before.map((c) => c.name).join('、')}`);

const rowsBefore = await safeCount('SELECT COUNT(*) AS n FROM game_comments');

if (existing.has(COLUMN)) {
  console.log(`· ${COLUMN}：已存在，跳过（幂等）`);
} else if (DRY_RUN) {
  console.log(`· ${COLUMN}：会添加（空跑，未写入）`);
  console.log(
    rowsBefore > 0
      ? `  ⚠️ 现有 ${rowsBefore} 行老数据会一并拿到默认值 5（空跑，未写入）`
      : '  表里还没有数据，补列不会碰到任何老行。'
  );
} else {
  try {
    await run(ALTER);
    console.log(`· ${COLUMN}：已添加（既有行拿到默认值 5）`);
    if (rowsBefore > 0) {
      console.log(`  ⚠️ ${rowsBefore} 行老评论被记为 5 星 —— 觉得不准就自己删掉重发。`);
    }
  } catch (error) {
    console.error(`✗ ${COLUMN} 添加失败：${error.message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------- 收尾核对

console.log(DRY_RUN ? '== 空跑结束（什么都没写）==' : '== 完成 ==');

if (!DRY_RUN) {
  const after = await run('PRAGMA table_info(game_comments)');
  const names = after.map((c) => c.name);
  if (!names.includes(COLUMN)) {
    console.error(`⚠️ ${COLUMN} 列没加上，请核对！`);
    process.exit(1);
  }
  console.log(`核对通过：game_comments 现在 ${after.length} 列 —— ${names.join('、')}`);

  const rowsAfter = await safeCount('SELECT COUNT(*) AS n FROM game_comments');
  if (rowsBefore !== rowsAfter) {
    console.error(`⚠️ 条数变了：${rowsBefore} → ${rowsAfter}，请核对！`);
    process.exit(1);
  }
  console.log(`数据 ${rowsAfter} 条（只加了列，一行都没动）。`);
}

console.log(
  DRY_RUN
    ? '空跑模式下什么都没写。去掉 --dry-run 再跑一次即可真补列。'
    : 'rating 列就绪。评论模块的星星可以用了（前端 / 接口那边也要跟着改）。'
);
