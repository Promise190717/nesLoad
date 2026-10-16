/*
 * 建 `game_texts`（游戏文案的多语言侧表）并把 games 里现存的文案搬进去（2026-10-16）。
 *
 * ⚠️⚠️ **已被 scripts/add-game-group-key.mjs 取代，别再跑这个脚本了（2026-10-16 同日）。**
 *
 *    原因：`game_texts` 的主键从 `(game_id, locale)` 改成了 `(group_key, locale)` ——
 *    一行 games 是**一盘 ROM**，同一款游戏的中英日韩四个语言版本是四行，而文案四行共享
 *    同一份。挂 game_id 会把同一份文案复制四遍（4 × 4 = 16 行），挂 group_key 只要 4 行。
 *    详见 db/schema.sql 里 game_texts 那段注释。
 *
 *    **这个文件建的是旧形状的表**（game_id 主键），在新库上跑会建出一张形状不对的表，
 *    之后 `loadGameTexts` 的 JOIN 会全部落空 —— 表现是「所有游戏都没了名字」。
 *    保留它只是为了留个记录（以及万一要考古旧的建表语句）；迁移一律走：
 *
 *        node --env-file=.env.local scripts/add-game-group-key.mjs
 *
 * 以下是它当年（game_id 主键时代）的原始说明，已不再有效：
 *
 * 用法：
 *   node --env-file=.env.local scripts/add-game-texts.mjs            # 真跑
 *   node --env-file=.env.local scripts/add-game-texts.mjs --dry-run  # 只看会写什么，不落库
 *
 * 为什么不能只改 db/schema.sql：
 *   `CREATE TABLE IF NOT EXISTS` 能建表，但**数据搬迁**这件事 schema.sql 根本管不了
 *   （那文件里全是 DDL，没有一行 DML）。
 *
 * ⚠️ **幂等**：插入一律走 `INSERT OR IGNORE` —— 已经有行的一律不动。
 *    这条不只是为了「重复跑无害」，更重要的是**保护人工翻译**：
 *    迁移之后后台可能已经改过 game_texts 里的文案，重跑这个脚本不该把它覆盖回旧快照。
 *    （代价：旧列后来又被改过的话，重跑不会同步 —— 但迁移之后旧列本来就不再写入。）
 *
 * ⚠️ **只增不删**：不动 games 表一行一列（那 8 个旧文案列原样保留，见 db/schema.sql
 *    里那段说明），也不删 game_texts 里已有的行。
 *
 * 搬什么：
 *   · 每条游戏一行 `zh`（原文那 4 个列）；
 *   · 任一 `_en` 字段有值时再补一行 `en` —— 全空的英文行没有意义，不建。
 *   · `ja` / `ko` 这次**不生成**：没有内容可搬（2026-10-16 用户确认只扩数据结构）。
 *
 * 走的是 Cloudflare D1 的 REST API，和 setup-db.mjs 同一套，本地就能跑。
 */
const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID } = process.env;

if (!CF_ACCOUNT_ID || !CF_D1_API_TOKEN || !D1_DATABASE_ID) {
  console.error('缺少环境变量：需要 CF_ACCOUNT_ID / CF_D1_API_TOKEN / D1_DATABASE_ID');
  console.error('用法：node --env-file=.env.local scripts/add-game-texts.mjs [--dry-run]');
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

/** 和 db/schema.sql 里那份定义**必须一致**（改一处记得改两处）。 */
const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS game_texts (
  game_id     TEXT NOT NULL,
  locale      TEXT NOT NULL,
  title       TEXT,
  series      TEXT,
  developer   TEXT,
  description TEXT,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (game_id, locale)
)`;

/** NULL / 空串 / 纯空白都算「没有」。 */
function text(value) {
  const s = value == null ? '' : String(value).trim();
  return s === '' ? null : s;
}

/**
 * 一次插多少行 —— D1 REST 每次只吃一条语句，靠多值 VALUES 批量写。
 *
 * ⚠️ **D1 的绑定参数上限是 100 个 / 查询**（**不是** SQLite 默认的 999）：
 *    每行 7 个参数 ⇒ 一次最多 `floor(100 / 7) = 14` 行。
 *    原来写 50（= 350 个参数）会直接报
 *    `too many SQL variables at offset 450` —— 表建好了、**一行都没进去**
 *    （2026-10-16 实测踩到；offset 450 是 SQL 文本的字符位置，不是参数序号，别被它带偏）。
 *    ⚠️ 以后给这张表加列，这个数要跟着重算。
 */
const BATCH = 14;

console.log(DRY_RUN ? '== 干跑（不写库）==' : '== 真跑 ==');

// 1) 建表
if (DRY_RUN) {
  console.log('· [dry-run] 会执行 CREATE TABLE IF NOT EXISTS game_texts（表已存在则跳过）。');
} else {
  await run(CREATE_TABLE);
  console.log('· game_texts 表已就绪。');
}

// 2) 读源数据
const games = await run(
  `SELECT id, title, series, developer, description,
          title_en, series_en, developer_en, description_en
     FROM games`
);
console.log(`· games 共 ${games.length} 条。`);

// 3) 拼出要写的行
const rows = [];
for (const g of games) {
  // 中文原文行 —— 一定建（title 是必填的原文）
  rows.push({
    game_id: g.id,
    locale: 'zh',
    title: text(g.title),
    series: text(g.series),
    developer: text(g.developer),
    description: text(g.description),
  });

  // 英文行 —— 只在至少一个 `_en` 字段有值时建
  const en = {
    title: text(g.title_en),
    series: text(g.series_en),
    developer: text(g.developer_en),
    description: text(g.description_en),
  };
  if (en.title || en.series || en.developer || en.description) {
    rows.push({ game_id: g.id, locale: 'en', ...en });
  }
}

const zhCount = rows.filter((r) => r.locale === 'zh').length;
const enCount = rows.filter((r) => r.locale === 'en').length;
console.log(`· 待写入：zh ${zhCount} 行 · en ${enCount} 行（合计 ${rows.length}）。`);
console.log(`  （en 少的那 ${zhCount - enCount} 条 = 没有任何英文内容，不建空行。）`);

if (DRY_RUN) {
  console.log('\n抽样前 5 行：');
  for (const r of rows.slice(0, 5)) {
    console.log(`  ${r.game_id.slice(0, 8)}… [${r.locale}] ${r.title ?? '(无标题)'} / ${r.developer ?? '-'}`);
  }
  console.log('\n[dry-run] 什么都没写。去掉 --dry-run 再跑一次才落库。');
  process.exit(0);
}

// 4) 批量写（INSERT OR IGNORE：已有行一律不动，见文件头那段）
const before = Number((await run('SELECT COUNT(*) AS n FROM game_texts'))[0]?.n ?? 0);

const now = Date.now();
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
  const params = chunk.flatMap((r) => [
    r.game_id,
    r.locale,
    r.title,
    r.series,
    r.developer,
    r.description,
    now,
  ]);
  await run(
    `INSERT OR IGNORE INTO game_texts
       (game_id, locale, title, series, developer, description, updated_at)
     VALUES ${placeholders}`,
    params
  );
  process.stdout.write(`\r· 已处理 ${Math.min(i + BATCH, rows.length)} / ${rows.length} 行`);
}
process.stdout.write('\n');

// 5) 回读
const after = Number((await run('SELECT COUNT(*) AS n FROM game_texts'))[0]?.n ?? 0);
const byLocale = await run(
  'SELECT locale, COUNT(*) AS n FROM game_texts GROUP BY locale ORDER BY locale'
);

console.log(`\ngame_texts：${before} 行 → ${after} 行（本次新增 ${after - before}）。`);
console.log(`按语言：${byLocale.map((r) => `${r.locale}=${r.n}`).join(' · ')}`);
if (after - before < rows.length) {
  console.log('（新增数少于待写入数是正常的 —— 已存在的行被 INSERT OR IGNORE 跳过了。）');
}
