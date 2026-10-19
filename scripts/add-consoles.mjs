/*
 * 建「机种库」并预填机种的默认资料行。
 *
 * 用法：
 *   node --env-file=.env.local scripts/add-consoles.mjs [--dry-run]
 *
 * 干两件事，**全部幂等、只增不删**（没有 DELETE / DROP / TRUNCATE）：
 *   ① 建 `consoles` 表（`CREATE TABLE IF NOT EXISTS`，已有就跳过）；
 *   ② 给登记表里的每个机种各补一行默认资料（`INSERT OR IGNORE` 撞主键就跳过
 *      —— 后台已经填过的名字 / 简介绝不会被覆盖）。
 *
 * 为什么要单独跑一个脚本：schema.sql 只对「还没建过表」的库有效（同 developers 那条），
 * 已经上线的库要靠这里补一次。
 *
 * ⚠️ **加机种之后再跑一遍这个脚本**就是「数据库那边也补上」的全部动作 ——
 *    它只会给新机种插行，老机种那几行原样保留（`INSERT OR IGNORE`）。
 *
 * ⚠️ 预填的名字只是**占位默认值**（中文「红白机（FC）」这类），后台机种库里随时可改；
 *    图片 / 详细介绍全部留空，等后台自己补。脚本重复跑多少遍都只会补缺的行、不动已有的列。
 *
 * ⚠️ `.env.local` 里连的是**真库**。先 `--dry-run` 看一眼它打算做什么。
 */

const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID } = process.env;

if (!CF_ACCOUNT_ID || !CF_D1_API_TOKEN || !D1_DATABASE_ID) {
  console.error('缺少环境变量：需要 CF_ACCOUNT_ID / CF_D1_API_TOKEN / D1_DATABASE_ID');
  console.error('用法：node --env-file=.env.local scripts/add-consoles.mjs [--dry-run]');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');

const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

/**
 * 跑一条 SQL，返回结果行。D1 的 /query 单次只吃一条语句，参数用 `?` 占位（服务端绑定）。
 * 占位符按**出现顺序**编号 —— `params` 的顺序要和 SQL 里的 `?` 一一对应。
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

/** 「读不到就当空」的查询：空跑时 consoles 表可能还没建（我们刻意不写）。 */
async function safeRun(sql, params = []) {
  try {
    return await run(sql, params);
  } catch (error) {
    if (/no such table/i.test(error.message)) return [];
    throw error;
  }
}

const countConsoles = async () =>
  Number((await safeRun('SELECT COUNT(*) AS n FROM consoles'))[0]?.n ?? 0);

// ---------------------------------------------------------------- ① 建表

console.log(DRY_RUN ? '== 空跑（不会写入任何东西）==' : '== 开始 ==');
console.log(`开始前：consoles ${await countConsoles()} 条。`);

/*
 * 建表语句和 db/schema.sql 里那份**必须一模一样** —— 这里是为了让老库也能补上，
 * schema.sql 是为了让新库一次建对。两处漂了就会出现「新库有列、老库没有」。
 */
const CREATE_CONSOLES = `
CREATE TABLE IF NOT EXISTS consoles (
  console_type  TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  name_en       TEXT,
  image_url     TEXT,
  summary       TEXT,
  summary_en    TEXT,
  description   TEXT,
  description_en TEXT,
  release_year  INTEGER,
  created_at    INTEGER NOT NULL
)`;

const CREATE_CONSOLES_INDEX =
  'CREATE INDEX IF NOT EXISTS idx_consoles_created_at ON consoles (created_at DESC)';

if (!DRY_RUN) {
  await run(CREATE_CONSOLES);
  await run(CREATE_CONSOLES_INDEX);
}
console.log('① consoles 表：就绪（已存在则原样保留）。');

// ---------------------------------------------------------------- ② 预填机种资料

/*
 * 默认资料。⚠️ 只是占位：后台机种库里随时能改。en 留空的机种英文站回退中文。
 * 展示名刻意写全称 + 括号简称 —— 和标签位上的短标签（中文站 FC / 英文站 NES，见
 * `lib/consoles.ts` 的 `consoleLabel`）是两码事。
 *
 * 顺序跟着 `lib/consoles.ts` 的 `CONSOLE_TYPES`（展示顺序）。前四个 2026-10-14 之前
 * 就在库里了，`INSERT OR IGNORE` 会跳过它们；后八个是当天随新机种补的，
 * nds 是 2026-10-15 补的，ps1 是 2026-10-16 补的（都插在末尾，跟着展示顺序排）。
 * ⚠️ 库里已有的行一律不动 —— 加机种时**这个脚本只负责把缺的那一行补上**。
 *
 * `releaseYear` 是可空的（街机那种没有单一年份的留 null）。它只在机种专题页的
 * 资料表里显示，填错不影响功能，后台随时改。
 */
const DEFAULT_CONSOLES = [
  {
    type: 'nes',
    name: '红白机（FC）',
    nameEn: 'NES (Famicom)',
    summary: '任天堂 1983 年推出的 8 位家用游戏机，本站库里的主力机种。',
    summaryEn: "Nintendo's 8-bit home console from 1983 — the backbone of this library.",
    releaseYear: 1983,
  },
  {
    type: 'snes',
    name: '超级任天堂（SFC）',
    nameEn: 'Super Nintendo (SNES)',
    summary: '1990 年推出的 16 位家用游戏机，日版名 SFC。',
    summaryEn: 'The 16-bit home console from 1990, known as the Super Famicom in Japan.',
    releaseYear: 1990,
  },
  {
    type: 'gba',
    name: 'Game Boy Advance',
    nameEn: 'Game Boy Advance',
    summary: '任天堂 2001 年推出的 32 位掌上游戏机。',
    summaryEn: "Nintendo's 32-bit handheld from 2001.",
    releaseYear: 2001,
  },
  {
    type: 'nds',
    name: '任天堂 DS（NDS）',
    nameEn: 'Nintendo DS',
    summary: '任天堂 2004 年推出的双屏掌上游戏机，上下两块屏幕、下屏带触控。',
    summaryEn: "Nintendo's dual-screen handheld from 2004 — two screens, the lower one touch-enabled.",
    releaseYear: 2004,
  },
  {
    type: 'arcade',
    name: '街机',
    nameEn: 'Arcade',
    summary: '街机厅里的投币游戏，本站通过 FBNeo 核心运行。',
    summaryEn: 'Coin-op cabinet games, emulated here through the FBNeo core.',
    releaseYear: null,
  },

  /* ——— 2026-10-14 新增的八个机种 ——— */
  {
    type: 'gb',
    name: 'Game Boy',
    nameEn: 'Game Boy',
    summary: '任天堂 1989 年推出的掌上游戏机，四阶灰阶屏幕，全球销量过亿。',
    summaryEn: "Nintendo's handheld from 1989 — a four-shade screen that sold over 100 million units.",
    releaseYear: 1989,
  },
  {
    type: 'gbc',
    name: 'Game Boy Color',
    nameEn: 'Game Boy Color',
    summary: 'Game Boy 的彩色版本，1998 年推出，向下兼容黑白卡带。',
    summaryEn: 'The colour Game Boy from 1998, backwards compatible with the black-and-white cartridges.',
    releaseYear: 1998,
  },
  {
    type: 'md',
    name: '世嘉 MD（Mega Drive）',
    nameEn: 'Sega Mega Drive',
    summary: '世嘉 1988 年推出的 16 位家用游戏机，北美版叫 Genesis。',
    summaryEn: "Sega's 16-bit console from 1988, sold as the Genesis in North America.",
    releaseYear: 1988,
  },
  {
    type: 'gg',
    name: 'Game Gear',
    nameEn: 'Game Gear',
    summary: '世嘉 1990 年推出的彩色掌上游戏机，硬件接近 Master System。',
    summaryEn: "Sega's colour handheld from 1990, built on Master System hardware.",
    releaseYear: 1990,
  },
  {
    type: 'sms',
    name: '世嘉 Master System',
    nameEn: 'Sega Master System',
    summary: '世嘉 1987 年推出的 8 位家用游戏机。',
    summaryEn: "Sega's 8-bit home console from 1987.",
    releaseYear: 1987,
  },
  {
    type: '32x',
    name: '世嘉 32X',
    nameEn: 'Sega 32X',
    summary: 'MD 的 32 位附加硬件，1994 年发售，本站由 PicoDrive 核心直接运行。',
    summaryEn: 'The 32-bit add-on for the Mega Drive, released in 1994 and emulated here by PicoDrive.',
    releaseYear: 1994,
  },
  {
    type: 'ws',
    name: '万代 WonderSwan',
    nameEn: 'WonderSwan',
    summary: '万代 1999 年推出的掌上游戏机，横竖两个方向都能玩。',
    summaryEn: "Bandai's handheld from 1999, playable in either portrait or landscape.",
    releaseYear: 1999,
  },
  {
    type: 'ngp',
    name: 'Neo Geo Pocket',
    nameEn: 'Neo Geo Pocket',
    summary: 'SNK 1998 年推出的掌上游戏机，街机游戏的家用掌上版。',
    summaryEn: "SNK's handheld from 1998 — the pocket-sized version of the Neo Geo.",
    releaseYear: 1998,
  },

  /* ——— 2026-10-16 新增：PS1（本站第一台光盘机种）——— */
  {
    type: 'ps1',
    name: '索尼 PlayStation（PS1）',
    nameEn: 'Sony PlayStation',
    summary: '索尼 1994 年推出的 32 位家用游戏机，第一台出货量破亿的家用机，也是 CD-ROM 成为主流的开端。',
    summaryEn: "Sony's 32-bit console from 1994 — the first home console to ship over 100 million units, and the one that made CD-ROM the standard.",
    releaseYear: 1994,
  },
];

const INSERT_DEFAULT =
  `INSERT OR IGNORE INTO consoles
     (console_type, name, name_en, image_url, summary, summary_en,
      description, description_en, release_year, created_at)
   VALUES (?, ?, ?, NULL, ?, ?, NULL, NULL, ?, ?)`;

let inserted = 0;
let kept = 0;

for (const item of DEFAULT_CONSOLES) {
  const existed = (await safeRun('SELECT console_type FROM consoles WHERE console_type = ?', [item.type])).length > 0;

  if (existed) {
    kept += 1;
    console.log(`   · ${item.type}：已有资料行 —— 什么都没做（后台填过的内容不会被覆盖）。`);
    continue;
  }

  inserted += 1;
  if (!DRY_RUN) {
    await run(INSERT_DEFAULT, [
      item.type,
      item.name,
      item.nameEn,
      item.summary,
      item.summaryEn,
      item.releaseYear ?? null,
      Date.now(),
    ]);
  }
  console.log(`   · ${item.type}：${DRY_RUN ? '将预填默认资料（空跑，未写入）' : '已预填默认资料'}`);
}

// ---------------------------------------------------------------- 收尾核对

console.log(DRY_RUN ? '== 空跑结束（什么都没写）==' : '== 完成 ==');
console.log(
  `consoles：${inserted + kept} 条（预填 ${inserted}、保留原样 ${kept}）` +
    `${DRY_RUN ? '（空跑，未写入）' : ''}`
);
