/*
 * 给 `games` / `developers` 补**英文字段**（2026-10-13 用户要求：站点双语，内容原来只有中文）。
 *
 * 用法：
 *   node --env-file=.env.local scripts/add-i18n-fields.mjs [--dry-run]
 *
 * 干两件事，**只增不删**（全程没有 DELETE / DROP / UPDATE 既有数据）：
 *   · games      加 title_en / series_en / developer_en / description_en
 *   · developers 加 name_en  / summary_en / description_en
 *
 * 命名规则：**无后缀 = 中文原文，`_en` = 英文**。全部可空 ——
 * 英文站取不到就回退中文（见 lib/server/games.ts 的 localizeGame），所以后台
 * 可以只补英文、不必重填中文；一条没补也不会显示空白。
 *
 * ⚠️ 为什么不能只改 db/schema.sql：`CREATE TABLE IF NOT EXISTS` 见表已存在就**整句跳过**，
 *    不会往老表里补列。所以线上库必须单独跑一次这个脚本。
 *
 * ⚠️ **`ALTER TABLE ... ADD COLUMN` 跑第二遍会报 `duplicate column name`** ——
 *    所以这里不像 add-app-users.mjs 那样无脑执行，而是**先 PRAGMA table_info 看一眼**，
 *    已经有这一列就跳过。这样重复跑完全无害（幂等）。
 *
 * ⚠️ 本脚本**只加列、不填内容**。英文内容由另一个脚本（fill-i18n-content.mjs）灌 ——
 *    建表和填内容是两件事：表结构一次就位，文案会随认知修正，生命周期不同。
 */

const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID } = process.env;

if (!CF_ACCOUNT_ID || !CF_D1_API_TOKEN || !D1_DATABASE_ID) {
  console.error('缺少环境变量：需要 CF_ACCOUNT_ID / CF_D1_API_TOKEN / D1_DATABASE_ID');
  console.error('用法：node --env-file=.env.local scripts/add-i18n-fields.mjs [--dry-run]');
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
 * 要补的列 —— 必须和 db/schema.sql 里那两段**语义一致**
 * （类型 / 可空性；DDL 文本不完全相同是正常的，ALTER 只能一列一列加）。
 * 全部 TEXT、全部可空：英文缺了就回退中文，不强制。
 */
const PLAN = [
  {
    table: 'games',
    columns: [
      ['title_en', `ALTER TABLE games ADD COLUMN title_en TEXT`],
      ['series_en', `ALTER TABLE games ADD COLUMN series_en TEXT`],
      ['developer_en', `ALTER TABLE games ADD COLUMN developer_en TEXT`],
      ['description_en', `ALTER TABLE games ADD COLUMN description_en TEXT`],
    ],
  },
  {
    table: 'developers',
    columns: [
      ['name_en', `ALTER TABLE developers ADD COLUMN name_en TEXT`],
      ['summary_en', `ALTER TABLE developers ADD COLUMN summary_en TEXT`],
      ['description_en', `ALTER TABLE developers ADD COLUMN description_en TEXT`],
    ],
  },
];

console.log(DRY_RUN ? '== 空跑（不会写入任何东西）==' : '== 开始 ==');

for (const { table, columns } of PLAN) {
  const before = await run(`PRAGMA table_info(${table})`);
  const existing = new Set(before.map((c) => c.name));
  console.log(`\n${table} 现有 ${before.length} 列：${before.map((c) => c.name).join('、')}`);

  for (const [name, sql] of columns) {
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
      console.error(`✗ ${table}.${name} 添加失败：${error.message}`);
      process.exit(1);
    }
  }
}

// ---------------------------------------------------------------- 收尾核对

console.log(DRY_RUN ? '\n== 空跑结束（什么都没写）==' : '\n== 完成 ==');

if (!DRY_RUN) {
  for (const { table, columns } of PLAN) {
    const after = await run(`PRAGMA table_info(${table})`);
    const names = after.map((c) => c.name);
    const missing = columns.map(([n]) => n).filter((n) => !names.includes(n));
    if (missing.length > 0) {
      console.error(`⚠️ ${table} 这几列没加上：${missing.join('、')}，请核对！`);
      process.exit(1);
    }
    const rows = await safeCount(`SELECT COUNT(*) AS n FROM ${table}`);
    console.log(
      `核对通过：${table} 现在 ${after.length} 列（加了 ${columns.length} 列），数据 ${rows} 条一行未动。`
    );
  }
}

console.log(
  DRY_RUN
    ? '空跑模式下什么都没写。去掉 --dry-run 再跑一次即可真补列。'
    : '英文字段就绪。接着跑 fill-i18n-content.mjs 灌英文内容（或留空让前台回退中文）。'
);
