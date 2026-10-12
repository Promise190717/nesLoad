/**
 * 给 `developers` 表补「简介 / 介绍 / 成立年份 / 官网」。
 *
 * 为什么单独一个脚本、而不是在 add-developers.mjs 里一起做：那张表是迁移脚本（只建表 + 回填关联），
 * 这里是「内容补全」—— 文案会随认知修正，二者生命周期不一样，分开跑更清晰。
 *
 * 幂等：只更新 `summary IS NULL`（或空白）的记录，后台手填过的不覆盖。
 * 用法：`node --env-file=.env.local scripts/fill-developers-profile.mjs [--dry-run]`
 */

const DRY_RUN = process.argv.includes('--dry-run');

const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID } = process.env;
if (!CF_ACCOUNT_ID || !CF_D1_API_TOKEN || !D1_DATABASE_ID) {
  console.error('缺少 CF_ACCOUNT_ID / CF_D1_API_TOKEN / D1_DATABASE_ID，请用 --env-file=.env.local');
  process.exit(1);
}

const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

async function run(sql, params = []) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_D1_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const data = await res.json();
  if (!data.success || !data.result?.[0]?.success) {
    throw new Error(JSON.stringify(data.errors || data.result));
  }
  return data.result[0];
}

/**
 * 18 家厂商的文案。以 name 为键（名字唯一）。
 *
 * - summary：一句话（出现在开发商详情页标题下、列表页卡片上）。
 * - description：一段介绍（开发商详情页正文）。
 * - foundedYear：成立年份（资料表），拿不准的写 null。
 * - website：官网（「官网」按钮），已关停 / 拿不准的写 null —— 别塞一个错的链接。
 */
const PROFILES = {
  // ---------- 日本 ----------
  '任天堂': {
    summary: '从扑克牌起家、定义了现代家用游戏机的京都老厂。',
    description:
      '任天堂创立于 1889 年，最初做花札扑克牌，后来一步步成为电子游戏行业的代名词。它推出了红白机（NES）、超级任天堂、Game Boy 等一系列改写历史的主机，并创造了马力欧、塞尔达、宝可梦、星之卡比等家喻户晓的系列。本站收录的《超级马里奥兄弟》《塞尔达传说》《星之卡比》等，都是它的作品。',
    foundedYear: 1889,
    website: 'https://www.nintendo.com/',
  },
  '科乐美': {
    summary: '横跨街机与家用机的日本大厂，动作、射击、音乐游戏皆有代表作。',
    description:
      '科乐美（Konami）1969 年创立于大阪，早年以街机成名，后在家用机时代推出《魂斗罗》《恶魔城》《合金装备》《实况足球》等经典。它尤其擅长横版动作与射击，本站的《魂斗罗》系列和《忍者神龟》街机版就出自它手。',
    foundedYear: 1969,
    website: 'https://www.konami.com/',
  },
  '卡普空（Capcom）': {
    summary: '以格斗与动作游戏闻名的日本厂商，街霸、洛克人皆出自它手。',
    description:
      '卡普空（Capcom）1979 年创立于大阪，是日本最具影响力的游戏公司之一。它一手缔造了《街头霸王》《洛克人》《鬼泣》《生化危机》《怪物猎人》等划时代系列，尤其以街机格斗和横版动作见长。本站的《街头霸王 II Turbo》《洛克人 2》《快打旋风》《松鼠大作战》等都是它的作品。',
    foundedYear: 1979,
    website: 'https://www.capcom.com/',
  },
  '史克威尔': {
    summary: '以日式角色扮演见长的日本厂商，《最终幻想》《时空之轮》的缔造者。',
    description:
      '史克威尔（Square）1986 年成立，以日式角色扮演游戏（JRPG）闻名。它推出的《最终幻想》系列开创了一个时代，《时空之轮》《圣剑传说》等同样影响深远。2003 年与艾尼克斯合并成为史克威尔艾尼克斯。本站收录的《时空之轮》就是它黄金年代的代表作。',
    foundedYear: 1986,
    website: null,
  },
  'Hudson Soft': {
    summary: '红白机时代的高产厂商，《炸弹人》《冒险岛》系列皆出自它手。',
    description:
      'Hudson Soft 1973 年创立于札幌，是红白机（FC）时代最活跃的第三方厂商之一，最早以养蜂机起家，后来成为任天堂的亲密合作伙伴。它创造的《炸弹人》《高桥名人之冒险岛》都是那个年代的国民级游戏。2012 年并入科乐美。',
    foundedYear: 1973,
    website: null,
  },
  'SNK': {
    summary: '以格斗游戏与 Neo Geo 硬件闻名的日本厂商，拳皇、合金弹头的母公司。',
    description:
      'SNK 1978 年创立于大阪，是街机黄金年代的重要角色。它推出 Neo Geo 基板，并以《拳皇》《饿狼传说》《侍魂》等格斗游戏声名大噪，合金弹头系列后期也收归其名下。本站的《拳皇 97 / 98 / 99》和《合金弹头 2 / 3》都出自它。',
    foundedYear: 1978,
    website: 'https://www.snk-corp.co.jp/',
  },
  'Nazca': {
    summary: '合金弹头初代的开发商，后被 SNK 收购。',
    description:
      'Nazca（拿斯卡）是一家日本游戏开发公司，最著名的作品就是 1996 年的街机横版射击游戏《合金弹头》。它精于像素美术与爽快的射击手感，合金弹头初代至今仍是该类型的高峰。公司后来被 SNK 吸收，团队成员也继续参与后续合金弹头的开发。',
    foundedYear: null,
    website: null,
  },
  'Namco': {
    summary: '吃豆人等街机经典的日本厂商，与万代合并前的老牌大厂。',
    description:
      'Namco（南梦宫）1955 年创立于东京，是日本最老牌的街机与家用机厂商之一。它创作的《吃豆人》是史上最成功的街机游戏之一，此外《铁拳》《皇牌空战》《传说》系列也都出自它手。2005 年与万代合并为万代南梦宫。',
    foundedYear: 1955,
    website: null,
  },
  'Technōs Japan': {
    summary: '热血系列与双截龙的日本厂商，横版清版动作的开拓者。',
    description:
      'Technōs Japan（泰克诺斯）1981 年创立，是《热血硬派》系列和《双截龙》系列的开发商。它开创的「热血」世界观与爽快的清版动作影响了整整一代横版动作游戏。公司 1996 年倒闭，IP 后被 Arc System Works 接手。',
    foundedYear: 1981,
    website: null,
  },
  'Winkysoft': {
    summary: '日本老牌承包开发商，参与多部超级机器人大战系列。',
    description:
      'Winkysoft 1983 年创立于大阪，是一家以承包开发为主的日本游戏公司，最知名的是参与《超级机器人大战》系列的早期开发。它还制作过《魔法骑士》等作品，2015 年倒闭。',
    foundedYear: 1983,
    website: null,
  },
  'Heartbeat': {
    summary: '曾为任天堂开发多款 SFC 时期作品的日本厂商。',
    description:
      'Heartbeat 是一家日本游戏开发公司，活跃于超级任天堂（SFC）时期，为任天堂等厂商开发过多款作品。它的知名度虽不及一线大厂，但也是那个时代日本游戏产业众多承包工作室中的一员。',
    foundedYear: null,
    website: null,
  },
  '东亚企划': {
    summary: '以弹幕射击游戏闻名的日本街机厂商。',
    description:
      '东亚企划（Toaplan）是 1980 年代末日本街机射击游戏的代表厂商之一，代表作品有《Tiger-Heli》《究极虎》《达人王》等，以高难度弹幕与硬派手感著称。公司 1994 年倒闭，但其成员后来组建了 Cave 等著名弹幕厂商，影响延续至今。',
    foundedYear: 1984,
    website: null,
  },
  'Mega Enterprise': {
    summary: '韩国游戏厂商，制作过合金弹头系列部分作品。',
    description:
      'Mega Enterprise 是一家韩国游戏开发公司，在街机时代参与过合金弹头系列的部分开发，是韩国游戏产业早期走向国际的代表之一。',
    foundedYear: null,
    website: null,
  },

  // ---------- 欧美 ----------
  'Rare': {
    summary: '英国传奇工作室，大金刚国度、班卓熊等系列的开创者。',
    description:
      'Rare 是英国最负盛名的游戏工作室之一，1985 年由 Ultimate Play the Game 团队改组而来。它与任天堂合作，在 SFC 和 N64 时代推出《大金刚国度》《黄金眼 007》《班卓熊》等经典，后被微软收购。本站的《大金刚国度 2》就是它的代表作。',
    foundedYear: 1985,
    website: 'https://www.rare.co.uk/',
  },
  'Iguana Entertainment': {
    summary: '美国游戏开发商，以 Turok 系列与体育游戏闻名。',
    description:
      'Iguana Entertainment 是美国游戏开发商，1991 年创立于德州奥斯汀，后并入 Acclaim。它以 N64 上的《Turok》系列和一批体育游戏闻名，也承接过多款跨平台作品的移植。',
    foundedYear: 1991,
    website: null,
  },
  'Midway': {
    summary: '美国街机巨头，真人快打系列的开发商。',
    description:
      'Midway 是美国街机与家用机时代的大厂，1958 年创立，代表作包括《真人快打》系列、NBA Jam 等。它以高强度的街机动作与格斗游戏闻名，2009 年破产后其资产被华纳兄弟游戏接管。本站的《终极真人快打 3》就是它的作品。',
    foundedYear: 1958,
    website: null,
  },
  '派克兄弟': {
    summary: '美国老牌玩具与游戏公司，早年发行过多款红白机游戏。',
    description:
      '派克兄弟（Parker Brothers）是美国历史悠久的玩具与桌游公司，1883 年创立，出品过《大富翁》等经典桌游。在红白机时代它也进入电子游戏市场，发行过《Q*bert》等多款游戏。',
    foundedYear: 1883,
    website: null,
  },

  // ---------- 中国台湾 ----------
  '鈊象电子': {
    summary: '中国台湾街机大厂，西游释厄传、三国战纪等清版动作的开发者。',
    description:
      '鈊象电子（IGS，International Games System）是中国台湾的街机游戏大厂，1989 年创立。它以《西游释厄传》《三国战纪》等横版清版动作游戏在华语区广为人知，是华语街机游戏的旗帜之一。',
    foundedYear: 1989,
    website: null,
  },
};

let updated = 0;
let skipped = 0;

for (const [name, profile] of Object.entries(PROFILES)) {
  const existing = await run('SELECT id, summary FROM developers WHERE name = ?', [name]);
  if (existing.results.length === 0) {
    console.log(`  ⚠️ 库里没有「${name}」，跳过`);
    skipped += 1;
    continue;
  }
  const row = existing.results[0];

  // 幂等：summary 已经有内容就跳过（后台可能手填过）
  if (row.summary && String(row.summary).trim() !== '') {
    console.log(`  ↷ 「${name}」已有简介，跳过（不覆盖）`);
    skipped += 1;
    continue;
  }

  if (DRY_RUN) {
    console.log(`   · 「${name}」将写入：`);
    console.log(`       summary: ${profile.summary}`);
    console.log(`       description: ${profile.description.slice(0, 40)}…`);
    console.log(`       foundedYear: ${profile.foundedYear ?? '(空)'}  website: ${profile.website ?? '(空)'}`);
    continue;
  }

  await run(
    'UPDATE developers SET summary = ?, description = ?, founded_year = ?, website = ? WHERE id = ?',
    [profile.summary, profile.description, profile.foundedYear, profile.website, row.id]
  );
  updated += 1;
  console.log(`  ✓ 「${name}」已写入`);
}

console.log(
  DRY_RUN
    ? `\n空跑完成：${Object.keys(PROFILES).length} 家待写，${skipped} 家跳过（已有简介或库里没有）。未写库。`
    : `\n完成：写入 ${updated} 家，跳过 ${skipped} 家。`
);
