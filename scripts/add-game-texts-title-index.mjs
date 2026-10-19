/*
 * 给「判重 / 归组」那条查询补索引（2026-10-16）。
 *
 * 用法：
 *   node --env-file=.env.local scripts/add-game-texts-title-index.mjs            # 真跑
 *   node --env-file=.env.local scripts/add-game-texts-title-index.mjs --dry-run  # 只跑 EXPLAIN，不建索引
 *
 * ## 为什么加
 *
 * 2026-10-16 线上 D1 Insights 的 rows_read 前三名里，**两条都出在**
 * `lib/server/games.ts` 的判重 / 归组路径上：
 *
 *     findGameDuplicate   39.86%   2873 次   4.71M 行   ≈ 1640 行/次
 *     findGameGroup        7.64%    596 次    622k 行   ≈ 1044 行/次
 *
 * 两条都是**全表扫**，原因各有两处，各对应一条索引：
 *
 *   ① `WHERE t.title COLLATE NOCASE = ?`
 *      —— `game_texts.title` 没有任何索引；而 `locale` 又不是主键
 *         `(group_key, locale)` 的前缀 ⇒ 扫全表。
 *      ⇒ `idx_game_texts_locale_title (locale, title COLLATE NOCASE)`
 *         ⚠️ **`COLLATE NOCASE` 不能省**：默认索引是 BINARY 排序，和那句条件匹配不上，
 *            SQLite 会照旧全表扫 —— 建了个「看起来对」的索引却一点用没有。
 *
 *   ② `JOIN … ON t.group_key = COALESCE(g.group_key, g.id)`
 *      —— `COALESCE` 包着**列**，`idx_games_group_key` 用不上 ⇒ 回表 games 时再全表扫一遍。
 *      ⇒ `idx_games_group_key_coalesce (COALESCE(group_key, id))` 表达式索引。
 *         表达式索引要求查询里的表达式与索引定义**一致**（列名不带表别名，SQLite 自己会
 *         规范化），所以 `COALESCE(g.group_key, g.id)` 和 `COALESCE(group_key, id)` 能对上。
 *
 * ⚠️ 第二条是**表达式索引**（SQLite 3.9+），不是普通列索引 —— 别照着「普通索引」的
 *    直觉去改它（比如改成 `(group_key, id)`，那样 `COALESCE(...) = ?` 依旧用不上）。
 *
 * ## ⚠️ 2026-10-19：索引建了，但一直没被用上
 *
 * 10-17 两条索引就建好了（回读 ✔ / ✔），可 10-19 再跑 EXPLAIN，计划仍是
 * `SCAN g` + `SEARCH t USING INDEX sqlite_autoindex_game_texts_1` —— 和建之前逐字相同。
 *
 * 原因不在索引，在 SQL 形状：`JOIN game_texts t ON t.group_key = COALESCE(g.group_key, g.id)`
 * 让规划器选了「扫 games 全表 → 每行查 t 主键」的方向，`t.title` 那个选择性最高的条件
 * 落在被驱动的一侧，`idx_game_texts_locale_title` 完全没机会上场。
 *
 * 修法在 `lib/server/games.ts`：把 `game_texts` 放到左边 + `CROSS JOIN`（SQLite 保证
 * CROSS JOIN 不重排），外层用标题索引定位 0~1 行。
 *
 * ⚠️ 内层**不能**写 `COALESCE(g.group_key, g.id) = t.group_key` —— 实测那种形式吃不到
 *    表达式索引（同一个表达式在单表等值查询里能用，挪进 JOIN 约束就不被采用），
 *    games 照旧 `SCAN`。最终用列对列 `g.group_key = t.group_key`，走普通索引
 *    `idx_games_group_key`；`group_key` 为 NULL 的老行 2026-10-19 实测 0 行，兜底可以不要。
 * 本脚本的 EXPLAIN 探针已同步成新形状 —— 建索引本身不用重跑，要验证的是计划。
 *
 * ## 幂等
 *
 * 两条都是 `CREATE INDEX IF NOT EXISTS`，重复跑无副作用。脚本末尾会把
 * `EXPLAIN QUERY PLAN` 的结果打出来 —— **人工核对有没有出现 `USING INDEX`**，
 * 那是这次改动到底生不生效的唯一凭据（本地/CI 都跑不了真库，只能靠这一步）。
 *
 * ⚠️ 建索引本身**不删不改任何数据**。但表越大耗时越长（这一步是全表扫一遍建 B+ 树），
 *    当前量级（games 约 1258 行）是毫秒级，不必担心。
 *
 * 走的是 Cloudflare D1 的 REST API，和 setup-db.mjs / add-game-group-key.mjs 同一套。
 */
const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID } = process.env;

if (!CF_ACCOUNT_ID || !CF_D1_API_TOKEN || !D1_DATABASE_ID) {
  console.error('缺少环境变量：需要 CF_ACCOUNT_ID / CF_D1_DATABASE_ID / CF_D1_API_TOKEN');
  console.error('用法：node --env-file=.env.local scripts/add-game-texts-title-index.mjs [--dry-run]');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

/** 跑一条 SQL，返回结果行。D1 的 /query 单次只吃一条语句。 */
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

/** 库里现有的索引名。 */
async function indexNames() {
  const rows = await run("SELECT name FROM sqlite_master WHERE type = 'index'");
  return rows.map((r) => r.name);
}

/*
 * 两条索引。⚠️ 与 db/schema.sql 里的定义**必须一致**（改一处记得改两处）。
 * 第二条是表达式索引，见文件头 ②。
 */
const INDEXES = [
  {
    name: 'idx_game_texts_locale_title',
    sql: 'CREATE INDEX IF NOT EXISTS idx_game_texts_locale_title ON game_texts (locale, title COLLATE NOCASE)',
  },
  {
    name: 'idx_games_group_key_coalesce',
    sql: 'CREATE INDEX IF NOT EXISTS idx_games_group_key_coalesce ON games (COALESCE(group_key, id))',
  },
];

/*
 * 拿 findGameDuplicate 的真实形状去问规划器（`?` 换成字面量，EXPLAIN 不吃参数）。
 * 只看 `USING INDEX …` —— 出现 `SCAN` 就是还在全表扫。
 */
const EXPLAIN_DEDUPE = `
EXPLAIN QUERY PLAN
SELECT g.id AS id, t.title AS title, g.language AS language
  FROM game_texts t
 CROSS JOIN games g
 WHERE t.locale = 'zh'
   AND t.title COLLATE NOCASE = '__nesload_explain_probe__'
   AND g.group_key = t.group_key
   AND g.console_type = 'nes'
   AND g.language = 'zh'
 LIMIT 1`;

/** 打印一份 EXPLAIN QUERY PLAN。跑不了（D1 不认 EXPLAIN 之类）就跳过，不当作失败。 */
async function explain(label, sql) {
  try {
    const rows = await run(sql);
    console.log(`\n${label}`);
    for (const row of rows) console.log(`  · ${row.detail}`);
  } catch (error) {
    console.log(`\n${label}\n  （EXPLAIN 跑不了，跳过：${error.message}）`);
  }
}

console.log(DRY_RUN ? '模式：--dry-run（只跑 EXPLAIN，不建索引）' : '模式：真跑');

/* 建之前先留一份基线计划，好和建完对比 */
await explain('【建索引之前】', EXPLAIN_DEDUPE);

const existing = new Set(await indexNames());
for (const { name, sql } of INDEXES) {
  if (existing.has(name)) {
    console.log(`\n· ${name} 已存在，跳过。`);
    continue;
  }
  if (DRY_RUN) {
    console.log(`\n· ${name} 不存在 —— 真跑时会执行：\n    ${sql}`);
    continue;
  }
  console.log(`\n· 建 ${name} …`);
  await run(sql);
}

if (!DRY_RUN) {
  /* 回读确认真的建上了（不靠 CREATE 的返回值为准） */
  const after = new Set(await indexNames());
  for (const { name } of INDEXES) {
    console.log(after.has(name) ? `✔ ${name}` : `✘ ${name} —— 回读没找到，请手动核对`);
  }
}

await explain('【建索引之后】', EXPLAIN_DEDUPE);

console.log(
  [
    '',
    '完成。核对上面两份 EXPLAIN：',
    '  · 期望看到 `SEARCH t USING INDEX idx_game_texts_locale_title`',
    '    与 `SEARCH g USING INDEX idx_games_group_key_coalesce`；',
    '  · 若仍是 `SCAN g`，说明查询没按 2026-10-19 的写法走 ——',
    '    索引本身没问题，是 SQL 形状让它用不上（见 lib/server/games.ts 的 findGameDuplicate）。',
    '',
    '⚠️ 索引建了不等于用上：这两条 2026-10-17 就建好了，但旧写法（games 驱动）下',
    '   EXPLAIN 一直是 `SCAN g` —— 这次要验证的是「改写法之后」的计划。',
  ].join('\n')
);
