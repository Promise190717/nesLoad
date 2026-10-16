#!/usr/bin/env node
/*
 * 实体文案侧表迁移脚本（2026-10-16）。
 *
 * 做的事（幂等、只增不删，可反复执行）：
 *   1. 建 console_texts / developer_texts 两张侧表（IF NOT EXISTS）；
 *   2. 给 developers 补 source_slug 列；
 *   3. 从 consoles / developers 的旧列（name / name_en / summary / summary_en /
 *      description / description_en）搬数据到侧表；
 *   4. 统计写入量。
 *
 * 用法：
 *   node --env-file=.env.local scripts/add-entity-texts.mjs            # 真跑
 *   node --env-file=.env.local scripts/add-entity-texts.mjs --dry-run  # 只看会写什么，不落库
 *
 * 为什么不能只改 db/schema.sql：
 *   同 add-game-group-key.mjs —— schema.sql 全是 DDL，管不了**数据搬迁**（那是 DML）；
 *   而 `CREATE TABLE IF NOT EXISTS` 对 SQLite 的「补列」也无能为力（没有 ADD COLUMN IF NOT EXISTS）。
 *
 * ⚠️ **为什么这里自带 run()、不去 import lib/server/d1.ts**：
 *    d1.ts 是 TypeScript 且只导出 `query`（服务端专用，读运行时环境变量）。
 *    脚本是普通 .mjs、由 node 直接跑，本仓库既定写法就是**各自内联这段 REST 调用**
 *    （见 add-game-group-key.mjs / add-games-source-url.mjs）。
 *    ⚠️ 2026-10-16 本脚本第一版写了
 *      `import { createRemoteDatabase } from '../lib/server/d1.js'`
 *      —— 那个导出**根本不存在**（d1.ts 只有 `query`），路径还指向一个 .ts 文件。
 *      于是脚本一跑就 ERR_MODULE_NOT_FOUND，**表从来没建出来过**，
 *      直到线上报 `no such table: console_texts` 才发现。别再走 import 那条路。
 *
 * ⚠️ **幂等靠 `INSERT OR IGNORE`，不是 DO UPDATE**：
 *    侧表建好之后后台就可能改过里面的文案；重跑本脚本**不该把人工编辑覆盖回旧快照**。
 *    （代价：迁移之后旧列若又被改过，重跑不会同步 —— 但迁移之后旧列本来就不再写入。）
 *    同 add-game-group-key.mjs 的理由。
 *
 * ⚠️ **只增不删**：只 CREATE TABLE / ADD COLUMN / INSERT，没有 DROP/DELETE/UPDATE。
 *    consoles / developers 上那 6 个旧文案列**原样保留**（只写不读，留作回滚退路）。
 */

const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID } = process.env;

if (!CF_ACCOUNT_ID || !CF_D1_API_TOKEN || !D1_DATABASE_ID) {
  console.error('缺少环境变量：需要 CF_ACCOUNT_ID / CF_D1_API_TOKEN / D1_DATABASE_ID');
  console.error('用法：node --env-file=.env.local scripts/add-entity-texts.mjs [--dry-run]');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

/** 跑一条 SQL，返回结果行。D1 的 /query 单次只吃一条语句（但可以带参数）。 */
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

/** NULL / 空串 / 纯空白都算「没有」。 */
function text(value) {
  const s = value == null ? '' : String(value).trim();
  return s === '' ? null : s;
}

/** 和 db/schema.sql 里那两份定义**必须一致**（改一处记得改两处）。 */
const CREATE_CONSOLE_TEXTS = `
CREATE TABLE IF NOT EXISTS console_texts (
  console_type  TEXT NOT NULL,
  locale        TEXT NOT NULL,
  name          TEXT,
  summary       TEXT,
  description   TEXT,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (console_type, locale)
)`;

const CREATE_DEVELOPER_TEXTS = `
CREATE TABLE IF NOT EXISTS developer_texts (
  developer_id  TEXT NOT NULL,
  locale        TEXT NOT NULL,
  name          TEXT,
  summary       TEXT,
  description   TEXT,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (developer_id, locale)
)`;

/** 一行 zh / en 的写入 —— 6 个参数，安全落在 D1 的 100 参数上限内。 */
async function insertText(table, keyColumn, key, locale, row, now) {
  await run(
    `INSERT OR IGNORE INTO ${table} (${keyColumn}, locale, name, summary, description, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [key, locale, text(row.name), text(row.summary), text(row.description), now]
  );
}

async function main() {
  const now = Date.now();
  console.log(DRY_RUN ? '== 干跑（不写库）==' : '== 真跑 ==');

  /* ================================================================ */
  /* 1. 建表 + 补列                                                   */
  /* ================================================================ */

  if (DRY_RUN) {
    console.log('· [dry-run] 会建 console_texts / developer_texts（已存在则跳过）。');
    console.log('· [dry-run] 会给 developers 补 source_slug 列（已存在则跳过）。');
  } else {
    await run(CREATE_CONSOLE_TEXTS);
    await run(CREATE_DEVELOPER_TEXTS);
    console.log('· console_texts / developer_texts 表已就绪。');

    try {
      await run('ALTER TABLE developers ADD COLUMN source_slug TEXT');
      console.log('· developers.source_slug 已添加。');
    } catch (error) {
      // 重复执行 / 并发会撞上「列已存在」，那不是错误
      if (/duplicate column name/i.test(error.message)) {
        console.log('· developers.source_slug 已存在，跳过。');
      } else {
        throw error;
      }
    }
  }

  /* ================================================================ */
  /* 2. 搬 consoles                                                   */
  /* ================================================================ */

  const consoleRows = await run(`
    SELECT console_type, name, name_en, summary, summary_en, description, description_en
    FROM consoles
  `);

  let consoleWrites = 0;
  for (const r of consoleRows) {
    const hasEn = Boolean(r.name_en || r.summary_en || r.description_en);
    if (!DRY_RUN) {
      await insertText('console_texts', 'console_type', r.console_type, 'zh', r, now);
      // 英文：任一 `_en` 字段有值才建（全空的英文行没意义）
      if (hasEn) {
        await insertText(
          'console_texts',
          'console_type',
          r.console_type,
          'en',
          { name: r.name_en, summary: r.summary_en, description: r.description_en },
          now
        );
      }
    }
    consoleWrites += 1 + (hasEn ? 1 : 0);
  }
  console.log(`· consoles ${consoleRows.length} 个机种 → 待写 console_texts ${consoleWrites} 行。`);

  /* ================================================================ */
  /* 3. 搬 developers                                                 */
  /* ================================================================ */

  const devRows = await run(`
    SELECT id, name, name_en, summary, summary_en, description, description_en
    FROM developers
  `);

  let devWrites = 0;
  for (const r of devRows) {
    const hasEn = Boolean(r.name_en || r.summary_en || r.description_en);
    if (!DRY_RUN) {
      await insertText('developer_texts', 'developer_id', r.id, 'zh', r, now);
      if (hasEn) {
        await insertText(
          'developer_texts',
          'developer_id',
          r.id,
          'en',
          { name: r.name_en, summary: r.summary_en, description: r.description_en },
          now
        );
      }
    }
    devWrites += 1 + (hasEn ? 1 : 0);
  }
  console.log(`· developers ${devRows.length} 家 → 待写 developer_texts ${devWrites} 行。`);

  /* ================================================================ */
  /* 4. 收尾                                                          */
  /* ================================================================ */

  if (DRY_RUN) {
    console.log(
      `\n[dry-run] 会写 console_texts ${consoleWrites} 行 · developer_texts ${devWrites} 行；什么都没落库。`
    );
    console.log('          去掉 --dry-run 再跑一次才写。');
    return;
  }

  // 核对落库结果（重跑时这几行会因为 OR IGNORE 而不涨）
  const [c] = await run('SELECT COUNT(*) AS n FROM console_texts');
  const [d] = await run('SELECT COUNT(*) AS n FROM developer_texts');
  console.log(`\n[done] console_texts 现有 ${c.n} 行 · developer_texts 现有 ${d.n} 行。`);
  console.log('       ⚠️ 数字比「待写」小的话 = 那些行已存在被 OR IGNORE 跳过（正常，幂等）。');
  console.log('       脚本幂等，可反复执行。');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
