/*
 * 把线上机种资料里 nes 那行的中文名从「红白机（NES）」改成「红白机（FC）」（2026-10-19）。
 *
 * 为什么要改：那台机器日版叫 Famicom（FC，1983），美版叫 NES（1985）。中国大陆流行的是
 * FC 兼容机，玩家嘴里只有「FC / 红白机」。站内标签已按语言切（中文 FC、英文 NES，见
 * `lib/consoles.ts` 的 `consoleLabel`），机种资料的中文名是最后一处还写着 NES 的地方。
 *
 * 用法：
 *   node --env-file=.env.local scripts/fix-nes-console-name.mjs --dry-run
 *   node --env-file=.env.local scripts/fix-nes-console-name.mjs
 *
 * ⚠️ **只动名字，别的列一律不碰**（简介 / 介绍 / 图 / 年份都是后台填的，脚本无权覆盖）。
 * ⚠️ 幂等：条件是「当前值仍然等于旧名」，改过之后再跑一下就是 0 行（不会把后台
 *    后来手改的名字又冲掉）。这也是**不敢写成无条件 UPDATE** 的原因。
 * ⚠️ 两张表都要看：`consoles.name`（中文原文）与 `console_texts` 里 locale='zh' 的
 *    `name`（机种资料的侧表，后台表单存的是这一份）。哪个有旧名就改哪个。
 * ⚠️ 干跑只读，不写库。
 */

const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID } = process.env;

if (!CF_ACCOUNT_ID || !CF_D1_API_TOKEN || !D1_DATABASE_ID) {
  console.error('缺少环境变量：需要 CF_ACCOUNT_ID / CF_D1_API_TOKEN / D1_DATABASE_ID');
  console.error('用法：node --env-file=.env.local scripts/fix-nes-console-name.mjs [--dry-run]');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');

const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

/** 跑一条 SQL。D1 的 /query 单次只吃一条语句，参数用 `?` 占位（服务端绑定）。 */
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
    throw new Error(`${detail || `HTTP ${res.status}`}（语句：${sql}）`);
  }
  return data.result[0].results ?? [];
}

/** 写语句：要的是 `meta.changes`（改了几行），不是结果行。 */
async function runWrite(sql, params = []) {
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
    throw new Error(`${detail || `HTTP ${res.status}`}（语句：${sql}）`);
  }
  return data.result[0].meta?.changes ?? 0;
}

/** 侧表可能还没建（老库）—— 读不到就当没有，别让整条流程挂掉。 */
async function safeRun(sql, params = []) {
  try {
    return await run(sql, params);
  } catch (error) {
    if (/no such table/i.test(error.message)) return [];
    throw error;
  }
}

const OLD_NAME = '红白机（NES）';
const NEW_NAME = '红白机（FC）';

console.log(DRY_RUN ? '== 干跑（不写库）==' : '== 开始 ==');

// ---------------------------------------------------------------- ① 现状

const rows = await run("SELECT name, name_en FROM consoles WHERE console_type = 'nes'");
if (!rows.length) {
  console.log('consoles 里没有 nes 这一行（资料被删 = 前台会退回默认名 FC）。没有可改的，结束。');
  process.exit(0);
}
console.log(`consoles.name    = ${rows[0].name}`);
console.log(`consoles.name_en = ${rows[0].name_en ?? '(空)'}`);

const textRows = await safeRun(
  "SELECT name FROM console_texts WHERE console_type = 'nes' AND locale = 'zh'"
);
console.log(
  `console_texts.zh = ${textRows.length ? textRows[0].name : '(没有这行，前台回退 consoles.name)'}`
);

// ---------------------------------------------------------------- ② 改名

const targets = [
  {
    table: 'consoles',
    sql: 'UPDATE consoles SET name = ? WHERE console_type = ? AND name = ?',
    params: [NEW_NAME, 'nes', OLD_NAME],
    current: rows[0].name,
  },
  {
    table: 'console_texts',
    sql: "UPDATE console_texts SET name = ?, updated_at = ? WHERE console_type = ? AND locale = 'zh' AND name = ?",
    params: textRows.length
      ? [NEW_NAME, Date.now(), 'nes', OLD_NAME]
      : null,
    current: textRows.length ? textRows[0].name : null,
  },
];

for (const target of targets) {
  if (!target.params) {
    console.log(`- ${target.table}：没有这行，跳过。`);
    continue;
  }
  if (target.current !== OLD_NAME) {
    console.log(`- ${target.table}：当前名不是「${OLD_NAME}」（是「${target.current}」），跳过。`);
    continue;
  }
  if (DRY_RUN) {
    console.log(`- ${target.table}：「${OLD_NAME}」→「${NEW_NAME}」（干跑，未执行）`);
    continue;
  }
  const changes = await runWrite(target.sql, target.params);
  console.log(`- ${target.table}：改了 ${changes} 行。`);
}

// ---------------------------------------------------------------- ③ 复查

if (!DRY_RUN) {
  const after = await run("SELECT name FROM consoles WHERE console_type = 'nes'");
  const afterText = await safeRun(
    "SELECT name FROM console_texts WHERE console_type = 'nes' AND locale = 'zh'"
  );
  console.log(`复查 consoles.name    = ${after[0]?.name}`);
  console.log(
    `复查 console_texts.zh = ${afterText.length ? afterText[0].name : '(没有这行)'}`
  );
  console.log('⚠️ 机种资料不缓存（`getConsole` 直读），刷一下 /zh/consoles/nes 就是新名字。');
}
