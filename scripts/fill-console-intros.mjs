/*
 * 回填机种的「一句话简介 + 详细介绍」（2026-10-20）。
 *
 *   node --env-file=.env.local scripts/fill-console-intros.mjs --dry   # 只看要写什么
 *   node --env-file=.env.local scripts/fill-console-intros.mjs         # 真写
 *
 * ## 为什么需要这个脚本
 *
 * 2026-10-20 切到 Supabase 时，`console_texts` 侧表只搬了 `name` 一列 ——
 * `summary`（机种页标题下那句话）和 `description`（右栏正文）全是 NULL，
 * 于是 `/consoles/<type>` 上原本的介绍整段消失（用户 2026-10-20 报的就是这个）。
 * `consoles.release_year` 同样是空的（资料表里「发售年份」那行不显示）。
 *
 * ## 文案在哪
 *
 * 在 `scripts/console-texts.data.mjs` —— **只有那一份**。
 * 2026-10-23 从介绍里删掉「本站的 X 游戏通过 Y 核心在浏览器里运行」时才发现文案被抄成了
 * 两个副本（这里 + 一次性种子脚本），删一漏一，所以抽成了共享数据。要改介绍就改那个文件。
 *
 * `release_year` 是机种资料不是文案，留在这里。
 *
 * ## 只补空值，不覆盖人工编辑
 *
 * 每条 UPDATE 都写成 `COALESCE(现有值, 新值)`：后台已经改过的字段原样保留。
 * 想把某台机器恢复成这份快照，先把那一行的 summary / description 清成 NULL 再跑。
 * 重跑幂等 —— 第二次跑什么都没变。
 *
 * ## 语言
 *
 * 只写 zh / en 两份。其余 16 种走读取时的逐字段回退（见 `lib/entity-text.ts` 的
 * `localizeEntityTexts`）：先英文、再中文。不往那 16 种里抄中文 ——
 * 抄进去库里就再也看不出「这一份到底翻没翻」。
 *
 * ## 连接
 *
 * 直连 Postgres（`SUPABASE_DB_URL`），**只允许在 scripts 里这么做**：
 * Worker 里跑直连会 500，见 `lib/server/pg.ts` 的文件头。
 */

import postgres from 'postgres';
import { CONSOLE_TEXTS } from './console-texts.data.mjs';

const DRY = process.argv.includes('--dry');

/** 发售年份（`consoles.release_year`）。街机跨越几十年，没有单一发售年份，留 null。 */
const RELEASE_YEARS = {
  nes: 1983,
  snes: 1990,
  gb: 1989,
  gbc: 1998,
  gba: 2001,
  nds: 2004,
  md: 1988,
  gg: 1990,
  sms: 1987,
  '32x': 1994,
  ws: 1999,
  ngp: 1998,
  ps1: 1994,
  arcade: null,
};

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('缺少 SUPABASE_DB_URL（.env.local 里那份）。');
  console.error('用法：node --env-file=.env.local scripts/fill-console-intros.mjs [--dry]');
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });

/** 只补空值：现值为 NULL 才写，后台人工改过的一律保留。 */
const WRITE_TEXT = `
update console_texts set
  summary     = coalesce(summary, $1),
  description = coalesce(description, $2),
  updated_at  = case when summary is null or description is null then now() else updated_at end
where console_type = $3 and locale = $4`;

const WRITE_YEAR = 'update consoles set release_year = coalesce(release_year, $1) where console_type = $2';

console.log(DRY ? '== 空跑（不会写入任何东西）==' : '== 回填机种简介 / 介绍 ==');

try {
  for (const item of CONSOLE_TEXTS) {
    const releaseYear = RELEASE_YEARS[item.type] ?? null;
    if (!DRY) {
      if (releaseYear != null) await sql.unsafe(WRITE_YEAR, [releaseYear, item.type]);
      await sql.unsafe(WRITE_TEXT, [item.summary, item.description, item.type, 'zh']);
      await sql.unsafe(WRITE_TEXT, [item.summaryEn, item.descriptionEn, item.type, 'en']);
    }
    console.log(
      `· ${item.type}：${DRY ? '将回填 zh / en 简介与介绍' : '已回填 zh / en 简介与介绍'}` +
        `（release=${releaseYear ?? '—'}）`
    );
  }

  /* 回读核对：数字说话，别只信写入没报错 */
  const [stats] = await sql.unsafe(
    `select count(*)::int as rows,
            count(*) filter (where summary is not null)::int as with_summary,
            count(*) filter (where description is not null)::int as with_description
       from console_texts where locale in ('zh', 'en')`
  );
  const [years] = await sql.unsafe(
    'select count(*) filter (where release_year is not null)::int as n from consoles'
  );
  console.log(
    `\n== 回读 ==\n` +
      `console_texts（zh + en）：${stats.rows} 行，` +
      `有简介 ${stats.with_summary} 行，有介绍 ${stats.with_description} 行\n` +
      `consoles：有发售年份的 ${years.n} / ${CONSOLE_TEXTS.length} 行`
  );
} finally {
  await sql.end();
}

console.log(DRY ? '== 空跑结束（什么都没写）==' : '== 完成 ==');
console.log('⚠️ 改完文案记得把 lib/server/pages/console.tsx 的 static-console 键尾 +1，否则要等 7 天。');
