/*
 * 补齐 nds 那一行的 description / description_en（2026-10-15 加机种时漏了这两列）。
 *
 * 用法（仓库根目录）：
 *   node --env-file=.env.local scripts/fix-nds-console.mjs [--dry-run]
 *
 * ⚠️ 只 UPDATE `nds` 一行、只动 description / description_en 两列 —— 别的行、别的列一概不碰。
 *    这和 seed-consoles.mjs（一次性内容快照、会覆盖后台人工编辑）是两码事，可以放心单跑。
 *
 * ⚠️ `.env.local` 连的是真库。先 --dry-run 看一眼。
 */

const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID } = process.env;

if (!CF_ACCOUNT_ID || !CF_D1_API_TOKEN || !D1_DATABASE_ID) {
  console.error('缺少环境变量：需要 CF_ACCOUNT_ID / CF_D1_API_TOKEN / D1_DATABASE_ID');
  console.error('用法：node --env-file=.env.local scripts/fix-nds-console.mjs [--dry-run]');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');

const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

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

/*
 * 文案风格对齐 seed-consoles.mjs 里 GBA / GB 那几段：
 * 「全称（简称）是……的机器 + 一两个特色 + 代表作几个 + 本站走哪个核心」。
 * ⚠️ NDS 的核心是 melonds（不是 mGBA）—— 见 lib/emulator.ts 的 CORE_MAP。
 * ⚠️ GB / GBC / NDS 三个虽然都归「任天堂掌机」，核心不同，文案里别写混。
 */
const DESCRIPTION =
  '任天堂 DS（Nintendo DS，简称 NDS）是任天堂 2004 年推出的掌上游戏机，最大特征是上下两块屏幕：' +
  '上屏显示画面，下屏带触控笔操作，另外还内置麦克风与无线联机。《新超级马里奥兄弟》《口袋妖怪 钻石 / 珍珠》' +
  '《雷顿教授》系列都在它上面诞生，全球销量超过一亿五千万台，是史上最畅销的掌机之一。' +
  '本站的 NDS 游戏通过 melonDS 核心在浏览器里运行，上下双屏按原生竖版比例一并呈现。';

const DESCRIPTION_EN =
  "The Nintendo DS (NDS) is Nintendo's dual-screen handheld from 2004: the upper screen shows the action while " +
  'the lower one is touch-enabled and comes with a stylus, plus a built-in microphone and wireless multiplayer. ' +
  'New Super Mario Bros., Pokémon Diamond & Pearl and the Professor Layton series all began here — with over ' +
  '150 million units sold, it remains one of the best-selling handhelds ever. NDS games on this site run through ' +
  'the melonDS core, with both screens rendered together in their native portrait layout.';

console.log(DRY_RUN ? '== 空跑（不会写入任何东西）==' : '== 开始 ==');

const before = await run(
  'SELECT console_type, name, image_url, description, description_en FROM consoles WHERE console_type = ?',
  ['nds']
);

if (before.length === 0) {
  console.error('❌ consoles 表里没有 nds 行 —— 先跑 add-consoles.mjs 把行补上。');
  process.exit(1);
}

console.log(`改动前：${JSON.stringify(before[0], null, 2)}`);

if (DRY_RUN) {
  console.log('\n将写入：');
  console.log(`  description    = ${DESCRIPTION}`);
  console.log(`  description_en = ${DESCRIPTION_EN}`);
} else {
  await run(
    'UPDATE consoles SET description = ?, description_en = ? WHERE console_type = ?',
    [DESCRIPTION, DESCRIPTION_EN, 'nds']
  );

  const after = await run(
    'SELECT console_type, name, description, description_en FROM consoles WHERE console_type = ?',
    ['nds']
  );
  const row = after[0];
  console.log('\n== 写入后回读 ==');
  console.log(`  description    : ${(row.description ?? '(NULL)').slice(0, 40)}…  len=${(row.description ?? '').length}`);
  console.log(`  description_en : ${(row.description_en ?? '(NULL)').slice(0, 40)}…  len=${(row.description_en ?? '').length}`);

  // 顺手核对别的行没被波及（UPDATE 只带 WHERE console_type='nds'，理应如此）
  const total = await run('SELECT COUNT(*) AS n FROM consoles');
  const withDesc = await run('SELECT COUNT(*) AS n FROM consoles WHERE description IS NOT NULL');
  console.log(`  全表：${total[0].n} 行，其中有 description 的 ${withDesc[0].n} 行`);
}

console.log(DRY_RUN ? '== 空跑结束（什么都没写）==' : '== 完成 ==');
