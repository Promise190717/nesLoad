/*
 * 去掉机种介绍里的「本站的 X 游戏通过 Y 核心在浏览器里运行」这类实现说明（2026-10-23）。
 *
 *   node --env-file=.env.local scripts/strip-console-core-notes.mjs --dry   # 只看前后对比
 *   node --env-file=.env.local scripts/strip-console-core-notes.mjs         # 真写
 *
 * 文案本身在 `scripts/console-texts.data.mjs`，这里只负责写库 —— 这个脚本已经把库改完了，
 * 留着是为了记录「当时改了什么」，以及万一有人把旧值从备份恢复回来时能再清一遍。
 * 再跑一次是幂等的（库里已是新文案就什么都不写）。
 *
 * ## 为什么删
 *
 * 访客打开 `/consoles/ps1` 想看的是「这是一台什么机器」，不是「本站用 pcsx_rearmed 跑的」。
 * 核心名（pcsx_rearmed / mGBA / Genesis Plus GX / melonDS …）是站内实现细节：普通访客
 * 读不懂也不需要，技术向的用户更关心手感和兼容性，而不是这一行字。它只是占掉了
 * 介绍最后一句的位置 —— 每台机器都挂同一句模板，读起来像凑字数。
 *
 * 所以**整句删除，不换成「可以直接在浏览器里玩」之类**：那还是同一句模板，只是把内核名
 * 抠掉了。介绍结尾一律停在代表作 / 评价那一句。
 *
 * 一并处理的两处 summary（模板里也塞了核心名）：
 *   · 32x：「1994 年发售，本站由 PicoDrive 核心直接运行」→「1994 年发售。」
 *   · arcade：「本站通过 FBNeo 核心运行」→「各机台的硬件规格都不一样。」
 *
 * arcade 正文的第二句除了核心还夹着「ROM 文件名不要改，改了核心会认不出驱动」的运维提示 ——
 * 那是给维护者的，不是给访客的，整句去掉，只留「街机没有统一的硬件规格」这半句常识。
 *
 * ## 覆盖式写入
 *
 * 这里直接写最终文案（不是正则抠句子）：中英两份就是 `console-texts.data.mjs` 的那份，
 * 跑之前已核对过库里每一行都和它一致，没有被后台人工改过。其余 16 种语言没有独立文案，
 * 读取时回退到 zh / en（`lib/entity-text.ts`），所以只写这两份。
 *
 * ⚠️ 跑完记得把 `lib/server/pages/console.tsx` 的 `static-console` 键尾 +1。
 */

import postgres from 'postgres';
import { CONSOLE_TEXTS } from './console-texts.data.mjs';

const DRY = process.argv.includes('--dry');

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('缺少 SUPABASE_DB_URL（.env.local 里那份）。');
  console.error('用法：node --env-file=.env.local scripts/strip-console-core-notes.mjs [--dry]');
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });

const READ = 'select summary, description from console_texts where console_type = $1 and locale = $2';

const WRITE = 'update console_texts set summary = $1, description = $2, updated_at = now() where console_type = $3 and locale = $4';

/** 把核心名点出来，回读时用它判断「还剩几行没清干净」。 */
export const CORE_HINT = /(fceumm|snes9x|mGBA|Genesis Plus GX|melonDS|PicoDrive|Mednafen|pcsx_rearmed|FBNeo|FinalBurn)/;

console.log(DRY ? '== 空跑（不会写入任何东西）==' : '== 去掉机种介绍里的核心说明 ==');

try {
  let changed = 0;
  for (const item of CONSOLE_TEXTS) {
    for (const [locale, summary, description] of [
      ['zh', item.summary, item.description],
      ['en', item.summaryEn, item.descriptionEn],
    ]) {
      const [cur] = await sql.unsafe(READ, [item.type, locale]);
      if (!cur) {
        console.log(`· ${item.type} [${locale}] 库里没有这一行，跳过`);
        continue;
      }
      const beforeS = cur.summary ?? '';
      const beforeD = cur.description ?? '';
      if (beforeS === summary && beforeD === description) continue;
      changed += 1;
      console.log(`\n· ${item.type} [${locale}]`);
      if (beforeS !== summary) {
        console.log(`  S - ${beforeS}`);
        console.log(`  S + ${summary}`);
      }
      console.log(`  D - …${beforeD.slice(-80)}`);
      console.log(`  D + …${description.slice(-80)}`);
      if (!DRY) await sql.unsafe(WRITE, [summary, description, item.type, locale]);
    }
  }

  /* 回读：数字说话，别只信写入没报错 */
  const rows = await sql.unsafe(
    `select console_type, locale, summary, description from console_texts
      where locale in ('zh','en') and (summary is not null or description is not null)`
  );
  const dirty = rows.filter((r) => CORE_HINT.test((r.summary ?? '') + (r.description ?? '')));
  console.log(
    `\n== 回读 ==\n` +
      `本次${DRY ? '将改' : '已改'} ${changed} 行；zh + en 共 ${rows.length} 行，` +
      `仍提到核心名的 ${dirty.length} 行` +
      (dirty.length ? `：${dirty.map((r) => r.console_type + '/' + r.locale).join('、')}` : '')
  );
} finally {
  await sql.end();
}

console.log(DRY ? '== 空跑结束（什么都没写）==' : '== 完成 ==');
console.log('⚠️ 前台要换缓存键才立刻生效：lib/server/pages/console.tsx 的 static-console 键尾 +1。');
