/*
 * 给 games 补 `group_key`（同款聚合键），并把 `game_texts` 从「按 game_id」改成「按 group_key」
 * 存（2026-10-16）。
 *
 * 用法：
 *   node --env-file=.env.local scripts/add-game-group-key.mjs            # 真跑
 *   node --env-file=.env.local scripts/add-game-group-key.mjs --dry-run  # 只看会写什么，不落库
 *
 * ## 为什么改（详见 db/schema.sql 里 game_texts 那段长注释）
 *
 * 一行 `games` 是**一盘 ROM**，不是「一款游戏」：同一款游戏的中 / 英 / 日 / 韩四个语言版本
 * 就是四行（判重是「标题 + 机种 + 语言」三维，语言不同放行）。而文案**四行共享同一份**——
 * 上游抓一次只返回一份，后台也是照一份填的。所以挂 `game_id` 等于把同一份文案复制四遍：
 *
 *     games        Kirby·en   Kirby·zh   Kirby·ja   Kirby·ko          4 行
 *     game_texts      4 行       4 行       4 行       4 行     =    16 行
 *
 * 改挂 `group_key` 之后只要 4 行，而且后台改一次标题就是改整款。
 *
 * ## 这个脚本做四件事（按顺序）
 *
 *   ① `games` 补 `group_key` 列 + 建索引（列已存在就跳过）；
 *   ② 归组：按「中文标题（忽略 ASCII 大小写）+ 机种 + 开发商」把记录分组，
 *      每组一个 group_key（沿用已有的值，没有才新生成 UUID）→ 回填 `games.group_key`；
 *   ③ 建 `game_texts` 的新形状（主键 `(group_key, locale)`）；
 *   ④ 把文案按 group 去重后搬过去（同一个 group 的同一个 locale 只留一份，取 `updated_at`
 *      最新的那条），旧表**改名成 `game_texts_old` 留底 —— 不 DROP**。
 *
 * ## 归组的判据为什么是这三个
 *
 * 与运行时 `lib/server/games.ts` 的 `findGameGroup()` **刻意用同一套**（去掉 language 那一维）：
 * 同一款游戏的中英日韩四个版本，「中文标题 + 机种 + 开发商」必然相同，只有 `language` 不同。
 * 两处判据必须一致 —— 迁移归好的组和以后新增记录归的组才对得上。
 *
 * ⚠️ 判断标题时用的是 **`games.title`**（那列一直存着中文原文，写入路径始终维护它），
 *    不是侧表 —— 因为这一步可能在「侧表刚建、还是空的」的库上跑。
 *
 * ## 幂等 / 安全性
 *
 * ⚠️ **可以放心重跑**：① 看列在不在；② 只处理 `group_key` 还是 NULL 的行（已归好的组不重排）；
 *    ③④ 看到 `game_texts` 已经是新形状就整体跳过。中间那张临时表叫 `game_texts_new`，
 *    重跑时会先清掉它（只删这张临时表，不碰任何真实数据）。
 *
 * ⚠️ **不删任何真实数据**：
 *   · `games` 一行不删，只多写 `group_key` 一列；
 *   · `game_texts` 的行会被**合并去重** —— 那正是这次迁移的目的本身，合并后
 *     「同一 group 每个 locale 只剩一份」，内容取最新的那一份；
 *   · 旧表原样改名成 `game_texts_old` 保留。确认新表没问题之后自行清理。
 *
 * ⚠️ 这个脚本**取代**了 scripts/add-game-texts.mjs（那个建的是 `game_id` 主键的旧表）。
 *
 * 走的是 Cloudflare D1 的 REST API，和 setup-db.mjs 同一套，本地就能跑。
 */
import { randomUUID } from 'node:crypto';

const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID } = process.env;

if (!CF_ACCOUNT_ID || !CF_D1_API_TOKEN || !D1_DATABASE_ID) {
  console.error('缺少环境变量：需要 CF_ACCOUNT_ID / CF_D1_API_TOKEN / D1_DATABASE_ID');
  console.error('用法：node --env-file=.env.local scripts/add-game-group-key.mjs [--dry-run]');
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

/** 表里现有的列名。表不存在时返回空数组。 */
async function columnsOf(table) {
  const rows = await run(`SELECT name FROM pragma_table_info('${table}')`);
  return rows.map((r) => r.name);
}

/** 库里现有的表名。 */
async function tableNames() {
  const rows = await run("SELECT name FROM sqlite_master WHERE type = 'table'");
  return rows.map((r) => r.name);
}

/** 和 db/schema.sql 里那份定义**必须一致**（改一处记得改两处）。 */
const CREATE_TEXTS_TABLE = (name) => `
CREATE TABLE ${name} (
  group_key   TEXT NOT NULL,
  locale      TEXT NOT NULL,
  title       TEXT,
  series      TEXT,
  developer   TEXT,
  description TEXT,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (group_key, locale)
)`;

/**
 * 一次插多少行 —— D1 REST 每次只吃一条语句，靠多值 VALUES 批量写。
 *
 * ⚠️ **D1 的绑定参数上限是 100 个 / 查询**（**不是** SQLite 默认的 999）：
 *    每行 7 个参数 ⇒ 一次最多 `floor(100 / 7) = 14` 行。
 *    （旧脚本 add-game-texts.mjs 踩过这个坑，报错文本里的 `offset 450` 是 SQL 字符位置、
 *     不是参数序号，别被它带偏。）以后给这张表加列，这个数要跟着重算。
 */
const TEXT_BATCH = 14;

/** NULL / 空串 / 纯空白都算「没有」。 */
function text(value) {
  const s = value == null ? '' : String(value).trim();
  return s === '' ? null : s;
}

/** 同款签名 —— 必须与 lib/server/games.ts 的 findGameGroup() 用同一套维度（去掉 language）。 */
function signature(game) {
  return [
    (game.title ?? '').trim().toLowerCase(),
    game.console_type,
    game.developer_id ?? '',
  ].join('\u0000');
}

console.log(DRY_RUN ? '== 干跑（不写库）==' : '== 真跑 ==');

/* ---------------------------------------------------------------- */
/* ① games 补 group_key 列 + 索引                                    */
/* ---------------------------------------------------------------- */

const gameColumns = await columnsOf('games');
if (gameColumns.length === 0) {
  console.error('❌ 库里没有 games 表 —— 先跑一次 db/schema.sql（scripts/setup-db.mjs）。');
  process.exit(1);
}

/** 列在不在 —— 后面几处 SELECT 都靠它决定要不要用 `NULL AS group_key` 顶替。 */
const hasGroupKey = gameColumns.includes('group_key');

if (hasGroupKey) {
  console.log('· games.group_key 已存在，跳过加列。');
} else if (DRY_RUN) {
  console.log('· [dry-run] 会给 games 加一列 group_key（TEXT，可空）。');
} else {
  await run('ALTER TABLE games ADD COLUMN group_key TEXT');
  console.log('· games 已加 group_key 列。');
}

if (!DRY_RUN) await run('CREATE INDEX IF NOT EXISTS idx_games_group_key ON games (group_key)');

/* ---------------------------------------------------------------- */
/* ② 归组：同款共用一个 group_key                                     */
/* ---------------------------------------------------------------- */

/** 归组只看这四列就够（title 是中文原文，写入路径一直在维护）。 */
const games = await run(
  hasGroupKey
    ? 'SELECT id, group_key, title, console_type, developer_id FROM games'
    : // 干跑时列还没加上 —— 拿 NULL 占位，语义等于「一条都还没归组」
      'SELECT id, NULL AS group_key, title, console_type, developer_id FROM games'
);
console.log(`· games 共 ${games.length} 条。`);

/** 签名 → group_key。已有的值先登记，保证重跑不重排已经归好的组。 */
const bySignature = new Map();
for (const game of games) {
  if (!game.group_key) continue;
  const sig = signature(game);
  if (!bySignature.has(sig)) bySignature.set(sig, game.group_key);
}

/** 需要回填的：id → group_key。 */
const assignments = [];
for (const game of games) {
  if (game.group_key) continue;
  const sig = signature(game);
  let key = bySignature.get(sig);
  if (!key) {
    key = randomUUID();
    bySignature.set(sig, key);
  }
  assignments.push({ id: game.id, groupKey: key });
}

const groupCount = new Set(games.map((g) => g.group_key ?? bySignature.get(signature(g)))).size;
console.log(
  `· 归组：${games.length} 条记录 → ${groupCount} 款（其中 ${assignments.length} 条需要回填 group_key）。`
);

if (assignments.length === 0) {
  console.log('  （没有需要回填的 —— 上面 ② 这一节什么都不做。）');
} else if (DRY_RUN) {
  console.log('· [dry-run] 会逐条 UPDATE games SET group_key = ? WHERE id = ?。');
} else {
  for (let i = 0; i < assignments.length; i += 1) {
    const { id, groupKey } = assignments[i];
    await run('UPDATE games SET group_key = ? WHERE id = ?', [groupKey, id]);
    if ((i + 1) % 50 === 0) process.stdout.write(`\r· 已回填 ${i + 1} / ${assignments.length}`);
  }
  process.stdout.write(`\r· 已回填 ${assignments.length} / ${assignments.length}\n`);
}

/* ---------------------------------------------------------------- */
/* ③④ game_texts 换主键 + 文案并到 group 上                          */
/* ---------------------------------------------------------------- */

const tables = await tableNames();
const textColumns = tables.includes('game_texts') ? await columnsOf('game_texts') : [];
const needsRebuild = textColumns.length > 0 && !textColumns.includes('group_key');

if (textColumns.includes('group_key')) {
  console.log('\n· game_texts 已经是新形状（主键 group_key），③④ 整节跳过。');
  console.log('\n完成。');
  process.exit(0);
}

/* 归组之后重新读一遍 —— 下面要用**回填后**的 group_key 去搬数据 */
const idToGroup = new Map();
if (hasGroupKey) {
  for (const row of await run('SELECT id, group_key FROM games')) {
    idToGroup.set(row.id, row.group_key ?? row.id);
  }
} else {
  /*
   * 干跑：列还没加上，读不到回填结果 —— 用 ② 刚算出来的那份映射顶替。
   * 语义与「回填后重读」完全等价（② 已经保证同款共用一个 key），所以干跑报的行数
   * 就是真跑会写进去的行数。
   */
  for (const game of games) {
    idToGroup.set(game.id, bySignature.get(signature(game)) ?? game.id);
  }
}

/** 要写进新表的行：`{ group_key, locale, title, series, developer, description, updated_at }` */
let rows = [];

if (needsRebuild) {
  /* 旧表有数据 —— 按 group 去重（同 group 同 locale 取 updated_at 最新的那条） */
  const old = await run(
    `SELECT game_id, locale, title, series, developer, description, updated_at
       FROM game_texts`
  );
  console.log(`\n· 旧 game_texts 共 ${old.length} 行，按 group 去重…`);

  const merged = new Map();
  for (const row of old) {
    const groupKey = idToGroup.get(row.game_id);
    // 找不到对应游戏 = 孤儿行（游戏被删过、或者这段历史里没清干净）—— 丢弃，别搬
    if (!groupKey) continue;
    const key = `${groupKey}\u0000${row.locale}`;
    const prev = merged.get(key);
    if (!prev || Number(row.updated_at ?? 0) > Number(prev.updated_at ?? 0)) {
      merged.set(key, {
        group_key: groupKey,
        locale: row.locale,
        title: row.title,
        series: row.series,
        developer: row.developer,
        description: row.description,
        updated_at: row.updated_at,
      });
    }
  }
  rows = [...merged.values()];
  console.log(`  → ${rows.length} 行（合并掉 ${old.length - rows.length} 行重复文案）。`);
} else {
  /*
   * 库上还没有 game_texts（全新库先跑了 schema.sql 但没跑过文案迁移）——
   * 从 games 的旧文案列现造：每条游戏一行 zh，任一 `_en` 字段有值再补一行 en。
   * 这一段与旧的 add-game-texts.mjs 行为一致。
   */
  const source = await run(
    `SELECT id, title, series, developer, description,
            title_en, series_en, developer_en, description_en
       FROM games`
  );
  const now = Date.now();
  for (const g of source) {
    const groupKey = idToGroup.get(g.id) ?? g.id;
    // 同款可能有好几条记录 —— 只造一份（后出现的同 group 直接跳过）
    if (rows.some((r) => r.group_key === groupKey && r.locale === 'zh')) continue;

    rows.push({
      group_key: groupKey,
      locale: 'zh',
      title: text(g.title),
      series: text(g.series),
      developer: text(g.developer),
      description: text(g.description),
      updated_at: now,
    });

    const en = {
      title: text(g.title_en),
      series: text(g.series_en),
      developer: text(g.developer_en),
      description: text(g.description_en),
    };
    if (en.title || en.series || en.developer || en.description) {
      rows.push({ group_key: groupKey, locale: 'en', ...en, updated_at: now });
    }
  }
  console.log(`\n· 库上没有 game_texts —— 从 games 的旧列现造 ${rows.length} 行。`);
}

const byLocale = {};
for (const r of rows) byLocale[r.locale] = (byLocale[r.locale] ?? 0) + 1;
console.log(`  按语言：${Object.entries(byLocale).map(([k, v]) => `${k}=${v}`).join(' · ') || '（无）'}`);

if (DRY_RUN) {
  console.log('\n抽样前 5 行：');
  for (const r of rows.slice(0, 5)) {
    console.log(`  group ${r.group_key.slice(0, 8)}… [${r.locale}] ${r.title ?? '(无标题)'}`);
  }
  console.log('\n[dry-run] 什么都没写。去掉 --dry-run 再跑一次才落库。');
  process.exit(0);
}

/* 先清掉可能残留的临时表（只删这一张，重跑时才可能撞上） */
if (tables.includes('game_texts_new')) {
  await run('DROP TABLE game_texts_new');
  console.log('\n· 清掉了上次跑剩的临时表 game_texts_new。');
}

await run(CREATE_TEXTS_TABLE('game_texts_new'));

for (let i = 0; i < rows.length; i += TEXT_BATCH) {
  const chunk = rows.slice(i, i + TEXT_BATCH);
  const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
  const params = chunk.flatMap((r) => [
    r.group_key,
    r.locale,
    r.title,
    r.series,
    r.developer,
    r.description,
    r.updated_at,
  ]);
  await run(
    `INSERT INTO game_texts_new
       (group_key, locale, title, series, developer, description, updated_at)
     VALUES ${placeholders}`,
    params
  );
  process.stdout.write(`\r· 已写入 ${Math.min(i + TEXT_BATCH, rows.length)} / ${rows.length} 行`);
}
process.stdout.write('\n');

/*
 * 换名。⚠️ 顺序：先把旧表挪开，再让新表顶上 —— 中间任何一步失败，
 * `game_texts` 要么还是旧的、要么是新表已就位，不会出现「两个都不叫 game_texts」。
 */
if (tables.includes('game_texts_old')) {
  console.error('❌ 已经存在 game_texts_old（上一次迁移留的底）。');
  console.error('   为避免把留底覆盖掉，本次不改名。请先人工确认 game_texts 与 game_texts_old 哪个是准的，');
  console.error('   把该留的那份改名走（或删掉不需要的那份）之后重跑。');
  process.exit(1);
}

await run('ALTER TABLE game_texts RENAME TO game_texts_old');
await run('ALTER TABLE game_texts_new RENAME TO game_texts');

const after = Number((await run('SELECT COUNT(*) AS n FROM game_texts'))[0]?.n ?? 0);
console.log(`\ngame_texts：${rows.length} 行已就位（迁移前是 4 行/款，现在 1 份/款）。`);
console.log(`旧表留底为 game_texts_old，确认没问题后自行清理。`);
if (after !== rows.length) {
  console.log(`（⚠️ 回读计数是 ${after}，与预期 ${rows.length} 不一致 —— 请手动核对。）`);
}
console.log('\n完成。');
