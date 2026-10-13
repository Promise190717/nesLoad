/*
 * 给 `app_users` 补两列（2026-10-13 用户要求「个人中心可以改资料」）。
 *
 * 用法：
 *   node --env-file=.env.local scripts/add-user-profile.mjs [--dry-run]
 *
 * 干两件事，**只增不删**（全程没有 DELETE / DROP / UPDATE 既有数据）：
 *   · 加 gender     列 —— 'male' / 'female' / 'other' / NULL
 *   · 加 avatar_key 列 —— R2 对象 key（头像本体在 R2）
 *
 * ⚠️ 为什么不能只改 db/schema.sql：`CREATE TABLE IF NOT EXISTS` 见表已存在就**整句跳过**，
 *    不会往老表里补列。所以线上库必须单独跑一次这个脚本。
 *
 * ⚠️ **`ALTER TABLE ... ADD COLUMN` 跑第二遍会报 `duplicate column name`** ——
 *    所以这里不像 add-app-users.mjs 那样无脑执行，而是**先 PRAGMA table_info 看一眼**，
 *    已经有这一列就跳过。这样重复跑完全无害（幂等）。
 *
 * ⚠️ 这个脚本**不碰 `users` 表**（那是后台管理员表）。收尾会核对它条数没变。
 */

const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID } = process.env;

if (!CF_ACCOUNT_ID || !CF_D1_API_TOKEN || !D1_DATABASE_ID) {
  console.error('缺少环境变量：需要 CF_ACCOUNT_ID / CF_D1_API_TOKEN / D1_DATABASE_ID');
  console.error('用法：node --env-file=.env.local scripts/add-user-profile.mjs [--dry-run]');
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

/** 「读不到就当空」：空跑 / 表还不存在时计数拿不到不是错误。 */
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
 * 要补的两列 —— 必须和 db/schema.sql 里 app_users 那两行**语义一致**
 * （类型 / 可空性；DDL 文本不完全相同是正常的，ALTER 只能一列一列加）。
 */
const COLUMNS = [
  ['gender', `ALTER TABLE app_users ADD COLUMN gender TEXT`],
  ['avatar_key', `ALTER TABLE app_users ADD COLUMN avatar_key TEXT`],
];

console.log(DRY_RUN ? '== 空跑（不会写入任何东西）==' : '== 开始 ==');

// 先看一下表现有哪些列
const before = await run(`PRAGMA table_info(app_users)`);
const existing = new Set(before.map((c) => c.name));
console.log(`app_users 现有 ${before.length} 列：${before.map((c) => c.name).join('、')}`);

const usersBefore = await safeCount('SELECT COUNT(*) AS n FROM users');

for (const [name, sql] of COLUMNS) {
  if (existing.has(name)) {
    console.log(`· ${name}：已存在，跳过（幂等）`);
    continue;
  }
  if (DRY_RUN) {
    console.log(`· ${name}：会添加（空跑，未写入）`);
    continue;
  }
  try {
    await run(sql);
    console.log(`· ${name}：已添加`);
  } catch (error) {
    console.error(`✗ ${name} 添加失败：${error.message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------- 收尾核对

console.log(DRY_RUN ? '== 空跑结束（什么都没写）==' : '== 完成 ==');

if (!DRY_RUN) {
  // 重新读一次，确认两列真的在了
  const after = await run(`PRAGMA table_info(app_users)`);
  const names = after.map((c) => c.name);
  const missing = COLUMNS.map(([n]) => n).filter((n) => !names.includes(n));
  if (missing.length > 0) {
    console.error(`⚠️ 这两列没加上：${missing.join('、')}，请核对！`);
    process.exit(1);
  }
  console.log(`核对通过：app_users 现在 ${after.length} 列 —— ${names.join('、')}`);
  // 数据一条没动
  const rows = await safeCount('SELECT COUNT(*) AS n FROM app_users');
  console.log(`app_users 数据 ${rows} 条（只加了列，一行数据都没动）。`);
}

const usersAfter = await safeCount('SELECT COUNT(*) AS n FROM users');
if (usersBefore !== usersAfter) {
  console.log(`⚠️ 后台管理员 users 表条数变了：${usersBefore} → ${usersAfter}，请核对！`);
} else {
  console.log(`后台管理员 users 表：${usersAfter} 条（本脚本不动它）。`);
}

console.log(
  DRY_RUN
    ? '空跑模式下什么都没写。去掉 --dry-run 再跑一次即可真补列。'
    : 'app_users 两列就绪。个人中心的「性别 / 头像」可以用了。'
);
