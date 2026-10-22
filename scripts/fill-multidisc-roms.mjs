/*
 * 给「多碟 CD 游戏」补 `game_roms` 的碟片行（2026-10-22 加）。
 *
 * ## 为什么需要它
 *
 * `scripts/migrate-to-supabase.mjs` 的 ROM 段只读上游的 `primary.fileName`
 * （一个字符串，或「语言 → 文件名」的映射）。多碟游戏在上游不走这个字段
 * （碟片是列表），于是 `fileName` 为空、整批被 `continue` 掉 —— 那 42 款
 * PS1 大作（FF7/FF8/FF9、合金装备、生化危机 2、穿越时空…）从来没进过 `game_roms`，
 * 前台一点「开始游戏」就是 ROM 代理 404。
 *
 * ## 它做什么
 *
 * 对**库里没有 ROM 行的 ps1 游戏**逐个抓源站详情页，从页面里出现的
 * `files.retrogamesnexus.com/games/roms/…` 链接中筛出属于本作的碟片文件：
 *
 *   <slug>-disc1.zip      ← 第 1 碟（英文）
 *   <slug>-ja-disc2.chd   ← 第 2 碟（日文）
 *
 * 同一个「语言 + 碟号」有多个扩展名时**优先 `.chd`**：它是单文件，
 * 而 zip 里是 cue + bin，多碟解到同一个虚拟目录容易撞名。
 *
 * ## 用法
 *
 *   node --env-file=.env.local scripts/fill-multidisc-roms.mjs            # 只出报告
 *   node --env-file=.env.local scripts/fill-multidisc-roms.mjs --apply    # 真的写库
 *
 *   ... --slug=final-fantasy-vii   只处理一款（调试用）
 *   ... --limit=5                  只处理前 5 款
 *
 * 可重复运行：写入走 `on conflict (game_slug, language, disc)`，只覆盖来源地址。
 *
 * ⚠️ 只收站内认识的四种语言（zh / en / ja / ko，唯一出处 `lib/rom-lang.ts`）——
 *    上游还有 de / fr / es / it 的碟片（都是 chd），但前台的 ROM 语言选择条不展示它们，
 *    收进来只是给库里添噪音。
 * ⚠️ 只补 `disc >= 1` 的多碟；单碟游戏本来就不缺（缺的那批全是多碟）。
 */
import postgres from 'postgres';

const UPSTREAM_SITE = 'https://retrogamesnexus.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const STATION_LANGS = new Set(['zh', 'en', 'ja', 'ko']);
/** 上游的语言标记 → 站内短码。cn/zh 都是中文，jp 是日文，enja 是英日合版（算英文）。 */
const LANG_ALIAS = { cn: 'zh', zh: 'zh', ja: 'ja', jp: 'ja', ko: 'ko', en: 'en', enja: 'en' };
/** 同一 (语言, 碟) 有多个候选时的优先级，数字越小越优先。 */
const EXT_RANK = { chd: 0, pbp: 1, zip: 2, '7z': 3 };
/**
 * slug 与文件名前缀对不上的例外（实测就这一款）。
 *
 * 上游把 Final Fantasy IX 的文件名缩写成 `ff9-disc1.chd`，和 slug `final-fantasy-ix`
 * 没有任何公共前缀 —— 除了硬映射没有别的可靠办法。别试图用「页面上唯一那组 disc 序列」
 * 去猜：详情页底部还有「相关游戏」的碟片，猜错就是把别人的盘写进这一款。
 */
const SLUG_FILE_ALIAS = { 'final-fantasy-ix': 'ff9' };

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const onlySlug = args.find((a) => a.startsWith('--slug='))?.slice('--slug='.length);
const limitArg = args.find((a) => a.startsWith('--limit='))?.slice('--limit='.length);
const limit = limitArg ? Number(limitArg) : Infinity;

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) {
  console.error('缺少环境变量 SUPABASE_DB_URL');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 抓一个详情页，返回页面上所有 ROM 文件地址（去重）。 */
async function romLinksOf(slug) {
  const res = await fetch(`${UPSTREAM_SITE}/games/${encodeURIComponent(slug)}`, {
    headers: { 'user-agent': UA, accept: 'text/html' },
    signal: AbortSignal.timeout(40_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const found = new Set();
  for (const match of html.matchAll(/https?:\/\/files\.retrogamesnexus\.com\/games\/roms\/[^"'\\\s]+/g)) {
    found.add(match[0].replace(/&amp;/g, '&'));
  }
  return [...found];
}

/**
 * 从页面所有文件里挑出**本作**的碟片。
 *
 * 必须按 slug 前缀锚定：详情页底部还有「相关游戏」的一大片链接，
 * 不过滤就会把别的游戏的碟片算进来（实测 metal-gear-solid-psx 的页面上
 * 全是 alundra / crash-bandicoot 的文件）。
 */
function pickDiscs(slug, links) {
  const anchor = SLUG_FILE_ALIAS[slug] ?? slug;
  const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /*
   * 文件名和 slug 之间可能夹几段标记，实测见过三种：
   *   `<slug>-disc1.zip`               没有标记（英文）
   *   `<slug>-ps-disc1.zip`            平台后缀（overblood-2）
   *   `<slug>-ja-disc1.chd`            语言
   * 所以中间那段按「任意 -token」收，再回头从 token 里认语言；认不出就算英文。
   * 但 token 里出现**纯数字**就跳过 —— 那是另一部作品的编号
   * （anchor `overblood` 会撞上 `overblood-2-ps-disc1`）。
   */
  const re = new RegExp(`^${escaped}((?:-[a-z0-9]+)*?)-disc(\\d+)\\.(chd|pbp|zip|7z)$`, 'i');
  const best = new Map();

  for (const link of links) {
    const raw = link.split('/').pop();
    if (!raw) continue;
    const name = decodeURIComponent(raw);
    const match = re.exec(name);
    if (!match) continue;

    const [, middle = '', discText, ext] = match;
    const tokens = middle.split('-').filter(Boolean);
    if (tokens.some((token) => /^\d+$/.test(token))) continue;

    const langMark = tokens.map((token) => token.toLowerCase()).find((token) => LANG_ALIAS[token]);
    const language = langMark ? LANG_ALIAS[langMark] : 'en';
    if (!STATION_LANGS.has(language)) continue;

    const disc = Number(discText);
    const key = `${language}:${disc}`;
    const candidate = { language, disc, name, url: link, rank: EXT_RANK[ext.toLowerCase()] ?? 9 };
    const current = best.get(key);
    if (!current || candidate.rank < current.rank) best.set(key, candidate);
  }

  return [...best.values()].sort((a, b) => a.language.localeCompare(b.language) || a.disc - b.disc);
}

/** 取前 1 KiB 确认文件真的在（200/206），别把失效地址写进库。 */
async function reachable(url) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, range: 'bytes=0-1023' },
      signal: AbortSignal.timeout(30_000),
    });
    await res.body?.cancel();
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}

const sql = postgres(databaseUrl, { max: 1 });
try {
  const games = await sql`
    select g.slug
      from games g
     where g.console_type = 'ps1'
       and not exists (select 1 from game_roms r where r.game_slug = g.slug)
     order by g.slug
  `;
  const targets = (onlySlug ? games.filter((g) => g.slug === onlySlug) : games).slice(0, limit);

  console.log(
    `${apply ? '写入模式' : '报告模式（加 --apply 才写库）'}：待处理 ${targets.length} 款` +
      `（库里共 ${games.length} 款 ps1 缺 ROM 行）`
  );

  let written = 0;
  const problems = [];

  for (const [index, game] of targets.entries()) {
    const tag = `[${index + 1}/${targets.length}] ${game.slug}`;
    let links;
    try {
      links = await romLinksOf(game.slug);
    } catch (error) {
      problems.push(`${game.slug}: 抓页面失败 ${error.message}`);
      console.log(`${tag} ✗ 抓页面失败：${error.message}`);
      await sleep(400);
      continue;
    }

    const discs = pickDiscs(game.slug, links);
    if (discs.length === 0) {
      problems.push(`${game.slug}: 页面里没有带 -discN 的本作文件`);
      console.log(`${tag} ✗ 没有匹配到碟片（页面文件 ${links.length} 个）`);
      await sleep(400);
      continue;
    }

    const verified = [];
    for (const disc of discs) {
      if (await reachable(disc.url)) verified.push(disc);
      else problems.push(`${game.slug}: disc${disc.disc} ${disc.language} 取不到（${disc.url}）`);
    }
    if (verified.length === 0) {
      console.log(`${tag} ✗ ${discs.length} 个候选全取不到`);
      await sleep(400);
      continue;
    }

    /* 按语言汇总成「en 2 碟 / ja 2 碟」，直接说行数会让人误以为这游戏有 4 张盘。 */
    const discsPerLanguage = new Map();
    for (const disc of verified) {
      discsPerLanguage.set(disc.language, Math.max(discsPerLanguage.get(disc.language) ?? 0, disc.disc));
    }
    const shape = [...discsPerLanguage].map(([language, count]) => `${language} ${count} 碟`).join(' / ');
    console.log(`${tag} ✓ ${shape}（${verified.length} 行）`);

    if (apply) {
      for (const disc of verified) {
        await sql`
          insert into game_roms (game_slug, language, disc, rom_name, source_url)
          values (${game.slug}, ${disc.language}, ${disc.disc}, ${disc.name},
                  ${`files:/games/roms/${disc.name}`})
          on conflict (game_slug, language, disc)
          do update set rom_name = excluded.rom_name, source_url = excluded.source_url
        `;
        written += 1;
      }
    }
    await sleep(400);
  }

  console.log(`\n完成：${apply ? `写入 ${written} 行` : '未写库'}，问题 ${problems.length} 条`);
  for (const problem of problems) console.log(`  · ${problem}`);
} finally {
  await sql.end({ timeout: 10 });
}
