/*
 * 给已经在用的 games 表补上 `source_url` 列（2026-10-16 用户要求「爬取时可以不保存 ROM，
 * 只在表里留一个源站的下载地址」）。
 *
 * 用法：
 *   node --env-file=.env.local scripts/add-games-source-url.mjs
 *
 * 为什么不能只改 db/schema.sql：
 *   setup-db.mjs 跑的是 `CREATE TABLE IF NOT EXISTS games (...)` —— 表已经在了，整句直接
 *   跳过，新列根本不会补进去。SQLite 又没有 `ADD COLUMN IF NOT EXISTS`。
 *
 * 为什么单独写一个脚本、而不是把 ALTER 塞进 schema.sql：
 *   schema.sql 里每条语句都带 `IF NOT EXISTS`、可以反复跑；ALTER 跑第二遍会报
 *   `duplicate column name: source_url`，掺进去就把「重复执行无害」这个性质破坏了。
 *
 * ⚠️ **这个脚本只增不删**：全程只有 PRAGMA 读列 + `ALTER TABLE ... ADD COLUMN`，
 *    没有 DELETE / UPDATE / DROP / TRUNCATE。列已经存在时直接跳过、什么都不做。
 *    执行前后各打一次总条数，方便自己核对「一条都没少」。
 *
 * ⚠️ 存量数据**不动**：老记录这一列留 NULL，前台照旧读 R2（见 app/api/games/[id]/rom）——
 *    这次只加列，没有回填（老记录本来也没有上游地址可填）。
 *
 * 走的是 Cloudflare D1 的 REST API，和 setup-db.mjs 同一套，本地就能跑。
 */
const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID } = process.env;

if (!CF_ACCOUNT_ID || !CF_D1_API_TOKEN || !D1_DATABASE_ID) {
  console.error('缺少环境变量：需要 CF_ACCOUNT_ID / CF_D1_API_TOKEN / D1_DATABASE_ID');
  console.error('用法：node --env-file=.env.local scripts/add-games-source-url.mjs');
  process.exit(1);
}

const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

/** 跑一条 SQL，返回结果行。D1 的 /query 单次只吃一条语句。 */
async function run(sql) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_D1_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
  });
  const data = await res.json();
  if (!res.ok || !data.success || !data.result?.[0]?.success) {
    const detail = (data.errors ?? []).map((e) => e.message).filter(Boolean).join('; ');
    throw new Error(`${detail || `HTTP ${res.status}`}（语句：${sql.replace(/\s+/g, ' ')}）`);
  }
  return data.result[0].results ?? [];
}

/** `PRAGMA table_info` 在 D1 上是允许的；万一某天不允许，返回空数组让它走 ALTER 那条路。 */
async function columns() {
  try {
    const rows = await run('PRAGMA table_info(games)');
    return Array.isArray(rows) ? rows.map((row) => row.name) : [];
  } catch (error) {
    console.warn('读列信息失败（继续尝试 ADD COLUMN）：', error.message);
    return [];
  }
}

const countRows = async () => Number((await run('SELECT COUNT(*) AS n FROM games'))[0]?.n ?? 0);

const before = await countRows();
console.log(`games 现有 ${before} 条记录。`);

let cols = await columns();

if (cols.includes('source_url')) {
  console.log('列 source_url 已存在 —— 什么都没做。');
} else {
  try {
    await run('ALTER TABLE games ADD COLUMN source_url TEXT');
    console.log('已添加列：source_url TEXT（可空，老记录保持 NULL = 照旧读 R2）。');
  } catch (error) {
    // 并发 / 重复执行时会撞上「列已存在」，那不是错误
    if (/duplicate column name/i.test(error.message)) {
      console.log('列 source_url 已存在（并发 / 重复执行）—— 什么都没做。');
    } else {
      console.error('失败：', error.message);
      process.exit(1);
    }
  }
  cols = await columns();
}

const after = await countRows();
console.log(`games 现有列：${cols.join(', ') || '(读不到)'}`);
console.log(`games 现在 ${after} 条记录。${after === before ? '✅ 一条没多、一条没少。' : '⚠️ 条数变了，请核对！'}`);
