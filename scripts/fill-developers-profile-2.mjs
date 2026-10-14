/**
 * 给 2026-10-14 新增的一批开发商（28 家）补「厂标 / 简介 / 介绍 / 成立年份 / 官网」。
 * 前一批（18 家）见 fill-developer-logos.mjs / fill-developers-profile.mjs。
 *
 * - 厂标：Wikipedia / Commons 各公司词条信息框用的官方 logo（2026-10-14 抓取，
 *   文件名 = slug）。Taito / Irem / EA 刻意选了老标（词条里标着 old / historical / early），
 *   与站点收录的红白机年代一致。维基上查不到可靠 logo 的（Virgin、Ape、Falcom、
 *   Mindscape、Quintet、Realtime、Opus、Shiny、Crea-Tech、Probe、TGL、Gray Matter、
 *   The Software Toolworks 共 13 家）不进 LOGOS —— 别顺手编一个塞进来，先人工确认。
 * - 文案：以 en/ja/zh 维基 + GDRI 为据写成，风格对齐 fill-developers-profile.mjs。
 * - 亿电游戏的 name_en 库里是「Electornic Arts」，拼写错误，本脚本顺手修正为
 *   「Electronic Arts」（仅当仍是错值时才写）。
 *
 * 幂等：image_url / summary 已有内容就跳过（后台手动填过的不覆盖）。
 * 每家最多一条 UPDATE（图片和文案合并写），逐行执行，不做批量替换。
 * 用法：`node --env-file=.env.local scripts/fill-developers-profile-2.mjs [--dry-run]`
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const DRY_RUN = process.argv.includes('--dry-run');

const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID, R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE } = process.env;
for (const key of ['CF_ACCOUNT_ID', 'CF_D1_API_TOKEN', 'D1_DATABASE_ID', 'R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_BASE']) {
  if (!process.env[key]) {
    console.error(`缺少 ${key}，请用 --env-file=.env.local`);
    process.exit(1);
  }
}

const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

async function d1(sql, params = []) {
  const res = await fetch(D1_URL, {
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

const r2 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

function publicUrl(key) {
  return `${R2_PUBLIC_BASE.replace(/\/+$/, '')}/${key}`;
}

const CONTENT_TYPE = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const LOGOS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'developer-logos');

/** 开发商名（developers.name，唯一）→ scripts/developer-logos/ 里的文件名。 */
const LOGOS = {
  '太东': 'taito.svg',
  '亿电游戏': 'electronic-arts.svg',
  '万代': 'bandai.svg',
  'Irem': 'irem.png',
  '光荣': 'koei.svg',
  'Atlus': 'atlus.svg',
  'HAL研究所': 'hal-laboratory.svg',
  '特库摩': 'tecmo.svg',
  'Sir-Tech': 'sir-tech.png',
  '万普（Banpresto）': 'banpresto.svg',
  'Compile': 'compile.png',
  'Sunsoft': 'sunsoft.png',
  'tri-Ace': 'tri-ace.png',
  'Red Entertainment': 'red-entertainment.png',
};

/**
 * 28 家的文案。以 name 为键。
 * - summary：一句话；description：一段介绍；foundedYear 拿不准写 null；
 * - website 已关停 / 已合并 / 拿不准的写 null（与第一批口径一致，别塞错链接）。
 */
const PROFILES = {
  // ---------- 日本 ----------
  '太东': {
    summary: '《太空侵略者》《泡泡龙》的故乡，日本最老牌的街机厂商之一。',
    description:
      '太东（Taito）1953 年由乌克兰裔商人米海尔·柯根创立，最初做进口贸易，1973 年起进入电子游戏行业。《太空侵略者》《泡泡龙》《彩虹岛》《四狂神战记》等街机名作都出自它手。2005 年被史克威尔艾尼克斯收购成为全资子公司，街机业务延续至今。本站的《泡泡龙》《彩虹岛》《四狂神战记》系列都是它的作品。',
    foundedYear: 1953,
    website: 'https://www.taito.co.jp/',
  },
  'Compile': {
    summary: '《噗哟噗哟》《魔法气泡》的缔造者，日本老牌开发公司。',
    description:
      'Compile 1982 年创立，最早做 PC 游戏开发，凭《魔导物语》衍生的《噗哟噗哟》红遍街机与家用机，也是《加纳战机》等硬派射击的名厂。2003 年 11 月公司破产倒闭，主要成员分别流向 Compile Heart 与 MileStone。本站的《噗哟噗哟》《超级魔法气泡》《加纳战机》都出自它手。',
    foundedYear: 1982,
    website: null,
  },
  'Arika': {
    summary: '《街头霸王 EX》的开发商，由卡普空前员工创立。',
    description:
      'Arika 1995 年由前卡普空员工创立，公司名是创始人西谷亮（《街头霸王 II》制作人之一）名字的变位词。处女作《街头霸王 EX》大获成功，之后又推出 EX2、EX3 与精神续作《格斗领域 EX Layer》。本站的《街头霸王 EX》就是它的作品。',
    foundedYear: 1995,
    website: 'https://www.arika.co.jp/',
  },
  'Falcom': {
    summary: '日式动作 RPG 的开创者，《伊苏》《英雄传说》系列的日本老厂。',
    description:
      '日本ファルコム（Nihon Falcom）1981 年创立，被公认为动作角色扮演游戏的奠基者之一，《伊苏》《轨迹》《英雄传说》系列至今仍在延续。它早年深耕日本 PC 平台，SFC 时代的《伊苏》系列移植版也多有参与。本站的《伊苏 3》《伊苏 4》都出自它手。',
    foundedYear: 1981,
    website: 'https://www.falcom.co.jp/',
  },
  'Ape Inc.': {
    summary: '糸井重里创立的日本厂商，《地球冒险》系列的诞生地。',
    description:
      'Ape Inc.（エイプ）1987 年由文案作家糸井重里等人创立，《MOTHER（地球冒险）》两作均出自它手，《MOTHER2》的开发还得到了时任 HAL 社长岩田聪的鼎力相助。公司 1995 年改组为 Creatures Inc.，继续参与宝可梦系列的开发。本站的《Mother（地球冒险）》《地球冒险 2》就是它的作品。',
    foundedYear: 1987,
    website: null,
  },
  'Irem': {
    summary: '《R-TYPE》《功夫》的开发商，日本老牌街机厂商。',
    description:
      'Irem 1974 年以 IPM 之名成立，是街机黄金年代的重要厂商，《月球巡航》《功夫》《R-TYPE》等名作影响了整整一代动作与射击游戏。原公司 1994 年退出游戏行业，现存的 Irem Software Engineering 转做柏青哥机台。本站的《10 码搏斗》《快杰洋枪》《铁钩船长》都出自它手。',
    foundedYear: 1974,
    website: null,
  },
  'Red Entertainment': {
    summary: '《天外魔境》系列的出品方，日本老牌游戏公司。',
    description:
      'Red Entertainment 前身是 1976 年成立的 Red Company（1985 年起正式营业），Hudson 发行的《天外魔境》系列即由它策划制作，2000 年改组为现名，2011 年曾被中国游戏企业收购。本站的《天外魔境 ZERO》就出自它手。',
    foundedYear: 1976,
    website: null,
  },
  'tri-Ace': {
    summary: '《星之海洋》《北欧女神》的开发者，日式 RPG 名厂。',
    description:
      'tri-Ace 1995 年由离开 TGL 的五反田义治等人创立，以动作性强烈的日式 RPG 著称，代表作《星之海洋》《北欧女神》系列均由史克威尔/艾尼克斯发行。本站的《星之海洋》就是它在 SFC 上的处女作。',
    foundedYear: 1995,
    website: 'https://www.tri-ace.co.jp/',
  },
  'Crea-Tech': {
    summary: '《重装机兵》系列的开发者，日本老牌 RPG 工作室。',
    description:
      'Crea-Tech 1988 年由宫冈宏创立于东京，以末世题材 RPG《重装机兵（METAL MAX）》系列闻名，也开发过多种桌上游戏。本站的《重装机兵》系列三部作品都出自它手。',
    foundedYear: 1988,
    website: null,
  },
  'Atlus': {
    summary: '《女神转生》《女神异闻录》的缔造者，日本人气 RPG 厂商。',
    description:
      'Atlus 1986 年创立，以《女神转生》系列起家，衍生出的《女神异闻录（Persona）》如今是全球级 IP，《世界树迷宫》《凯瑟琳》等也广受好评，现归世嘉旗下。本站的《真·女神转生》三部曲就是它的作品。',
    foundedYear: 1986,
    website: 'https://atlus.co.jp/',
  },
  '光荣': {
    summary: '历史模拟游戏的代名词，《三国志》《信长之野望》的缔造者。',
    description:
      '光荣（Koei）1978 年由襟川阳一夫妇创立，以历史模拟游戏立身，《三国志》《信长之野望》系列在华语圈影响深远，《大航海时代》同样是它的招牌。2009 年与特库摩合并为光荣特库摩。本站的《三国志》系列与《大航海时代》都出自它手。',
    foundedYear: 1978,
    website: null,
  },
  '万代': {
    summary: '日本玩具巨头，也深度参与游戏与主机业务。',
    description:
      '万代 1950 年创立，是全球最大的玩具公司之一，高达、奥特曼、龙珠等 IP 的模型与玩具都出自它手。1980 到 2000 年代它同时是重要的游戏厂商，在 FC/SFC 上推出过大量动漫改编游戏，还发售过几台自有主机。2005 年与南梦宫合并为万代南梦宫。本站的《龙珠 Z》系列、《幽游白书》等改编游戏都出自它手。',
    foundedYear: 1950,
    website: 'https://www.bandai.co.jp/',
  },
  '万普（Banpresto）': {
    summary: '《超级机器人大战》系列的缔造者，万代系游戏公司。',
    description:
      'Banpresto（万普）1977 年创立，前身先后叫宝绘国际与 Coreland Technology，1989 年起成为万代旗下街机与家用机开发主力，原创招牌是跨越无数动漫 IP 的《超级机器人大战》系列，2008 年被万代南梦宫吸收合并。本站的《第二次/第三次/第四次超级机器人大战》等就是它的作品。',
    foundedYear: 1977,
    website: null,
  },
  'HAL研究所': {
    summary: '星之卡比的家，任天堂最亲密的合作开发商之一。',
    description:
      'HAL 研究所 1980 年创立，1984 年起与任天堂深度合作，是《星之卡比》系列的开发者，《大乱斗》与《Mother》系列的开发中也有它的重要身影——岩田聪正是从这里走向任天堂社长之位。本站的《星之卡比 梦之泉豪华版》《卡比的雪崩》《洛洛大冒险》系列都出自它手。',
    foundedYear: 1980,
    website: 'https://www.hallab.co.jp/',
  },
  '特库摩': {
    summary: '《忍者龙剑传》《死或生》的开发者，日本动作游戏名厂。',
    description:
      '特库摩（Tecmo）1967 年创立，前身叫 Tehkan，1986 年改名。《忍者龙剑传》把它「高难度硬派动作」的名声推向顶峰，《死或生》《零》系列延续至今。本站的《忍者龙剑传》三部曲、《赤影战士》《足球小将》系列都是它的作品。',
    foundedYear: 1967,
    website: null,
  },
  'Sunsoft': {
    summary: '太阳电子旗下的游戏品牌，《蝙蝠侠》《西游世界》的出品方。',
    description:
      'Sunsoft 是日本电子厂商 Sun Corporation（サン電子）旗下的游戏品牌，FC/SFC 时代以高完成度著称，《蝙蝠侠》《西游世界》《超惑星战记》等在玩家中口碑极佳。本站的《西游世界》《超惑星战记》《菲利克斯猫》等都是它的作品。',
    foundedYear: null,
    website: null,
  },
  'Quintet': {
    summary: '《天地创造》《雷莎出击》的开发者，SFC 时代创世主题 RPG 名厂。',
    description:
      'Quintet 1989 年 4 月创立，社名取自音乐的五重奏，代表「策划、美术、音响、程序、制作」五个环节。它与艾尼克斯长期合作，推出《雷莎出击》《盖亚幻想记》《天地创造》三部以「创世与守护」为主题的 RPG，2000 年代起不再活动。本站的《雷莎出击》《天地创造》系列都出自它手。',
    foundedYear: 1989,
    website: null,
  },
  '奥普斯': {
    summary: '日本承包开发公司，参与过《光神话 帕露蒂娜之镜》等作品的开发。',
    description:
      'Opus（株式会社オーパス）1990 年 3 月创立，是一家以承包开发为主的日本公司，参与过《光神话 帕露蒂娜之镜》《古鲁明 3D》《超级真实麻雀》等作品的策划与编程，也承担音效、美术等环节。据 GDRI 记载，公司已于 2024 年 4 月申请破产。',
    foundedYear: 1990,
    website: null,
  },

  // ---------- 欧美 ----------
  'The Software Toolworks': {
    summary: '美国老牌软件公司，《马力欧失踪记》与「Mavis Beacon 教打字」的发行商。',
    description:
      'The Software Toolworks 1980 年由 Walt Bilofsky 创立于加州，最早做国际象棋等家用电脑软件，代表作品包括《Chessmaster 2000》与《Mavis Beacon Teaches Typing》。它 1990 年收购了 Mindscape，1994 年整体被英国培生集团收购。本站的《马力欧失踪记》就是它发行的任天堂授权作品。',
    foundedYear: 1980,
    website: null,
  },
  '亿电游戏': {
    summary: '全球发行巨头艺电，美国第二大游戏公司。',
    description:
      '艺电（Electronic Arts）1982 年由前苹果员工特里普·霍金斯创立，早年以「软件艺术家」的口号推崇游戏设计师，后来通过收购不断扩张，旗下有 EA Sports、《模拟人生》《战地》等众多品牌。本站收录的《麦登橄榄球》系列就是其长青体育品牌。',
    foundedYear: 1982,
    website: 'https://www.ea.com/',
    fixNameEn: 'Electronic Arts', // 库里是「Electornic Arts」，拼写错误
  },
  'Sir-Tech': {
    summary: '《巫术》系列的开发者，美式 CRPG 的开山厂商。',
    description:
      'Sir-Tech 1979 年以 Sirotech 之名创立于美国，1981 年正式定名，1981 年推出的《巫术》与《创世纪》《魔法门》并称美式三大 RPG，对后来的日式 RPG（包括《勇者斗恶龙》）影响深远。美国本部 1998 年关闭，加拿大分部撑到 2003 年。本站收录了《巫术》系列的多部早期作品。',
    foundedYear: 1979,
    website: null,
  },
  '维珍游戏': {
    summary: '维珍集团旗下的游戏发行商，欧洲发行巨头。',
    description:
      '维珍游戏 1983 年以 Virgin Games 之名创立，是维珍集团旗下的游戏发行与开发公司，后更名 Virgin Interactive、Avalon Interactive。它在欧洲发行过大量名作，Westwood 与《蚯蚓吉姆》主创都出自其麾下，Windows 附带的「纸牌」也是它开发的。本站的《机械战警大战终结者》与它有关。',
    foundedYear: 1983,
    website: null,
  },
  'Probe Entertainment': {
    summary: '英国老牌开发商，以主机移植与授权改编游戏著称。',
    description:
      'Probe Software 1987 年由弗格斯·麦克格文创立于伦敦，后以 Probe Entertainment 名义活动，擅长把街机名作移植到家用机，也为漫威等 IP 制作改编游戏，2000 年被 Acclaim 收购后随其一同退场。本站的《绿巨人》就是它的作品。',
    foundedYear: 1987,
    website: null,
  },
  'Technical Group Laboratory': {
    summary: '日本老牌软件公司，企业系统与游戏开发兼营。',
    description:
      'Technical Group Laboratory（TGL）是日本老牌软件公司，既承接企业系统开发，也长期涉足游戏领域，推出过《超级姬武神传说》等家用机作品，tri-Ace 的创始人正是从这里走出。',
    foundedYear: null,
    website: null,
  },
  'Gray Matter': {
    summary: '加拿大安大略省的开发商，1997 年解散。',
    description:
      'Gray Matter Inc. 由 Chris Gray 于 1985 年在加拿大安大略省奥克维尔创立，1997 年解散，其间为各大厂商制作过一批体育与授权游戏。本站的《超级 R.B.I. 棒球》就是它的作品。',
    foundedYear: 1985,
    website: null,
  },
  'Mindscape': {
    summary: '美国老牌发行商，1990 年被 The Software Toolworks 收购。',
    description:
      'Mindscape 1983 年创立于伊利诺伊州，发行过教育、模拟与授权改编类的大量软件，1990 年被 The Software Toolworks 收购（看中的正是它的任天堂授权），此后几经转手，名号最终在 2000 年代淡出。本站的《终结者》《送报童 2》等都是它的作品。',
    foundedYear: 1983,
    website: null,
  },
  'Software Creations': {
    summary: '曼彻斯特老牌开发商，漫威授权游戏与《Plok!》的开发者。',
    description:
      'Software Creations 1985 年由 Richard Kay 创立于英国曼彻斯特，擅长电影与漫画授权改编（蜘蛛侠等漫威题材尤多），原创的《Plok!》《Solstice》也颇受好评，后随 Acclaim 收购改组为 Acclaim Studios Manchester。本站的《蜘蛛侠》《猫和老鼠》《美女与野兽》都出自它手。',
    foundedYear: 1985,
    website: null,
  },
  '实时联合（Realtime Associates）': {
    summary: '美国老牌开发商，前美泰电子员工创立，作品遍及近百款。',
    description:
      'Realtime Associates 1986 年由 David Warhol 与一批前美泰电子（Mattel Electronics）员工创立，最初做 Intellivision 游戏，此后为各世代主机开发、发行了 90 多款作品，也长期承接儿童与教育向的授权游戏。',
    foundedYear: 1986,
    website: null,
  },
  '闪亮娱乐': {
    summary: '《蚯蚓吉姆》的开发者，美国个性派工作室。',
    description:
      'Shiny Entertainment 1993 年 10 月由 David Perry 创立于加州，处女作《蚯蚓吉姆》以无厘头风格和顶级手绘动画一炮而红，《MDK》《进入矩阵》也是它的作品，2007 年与 The Collective 合并为 Double Helix Games。本站的《蚯蚓吉姆》两部曲就是它的作品。',
    foundedYear: 1993,
    website: null,
  },
};

let updated = 0;
let skipped = 0;

for (const [name, profile] of Object.entries(PROFILES)) {
  const existing = await d1('SELECT id, name_en, image_url, summary FROM developers WHERE name = ?', [name]);
  if (existing.results.length === 0) {
    console.log(`  ⚠️ 库里没有「${name}」，跳过`);
    skipped += 1;
    continue;
  }
  const row = existing.results[0];

  const needImage = Boolean(LOGOS[name]) && !row.image_url;
  const needText = !(row.summary && String(row.summary).trim() !== '');
  const needNameEnFix = profile.fixNameEn && row.name_en !== profile.fixNameEn;

  if (!needImage && !needText && !needNameEnFix) {
    console.log(`  ↷ 「${name}」资料已齐，跳过（不覆盖）`);
    skipped += 1;
    continue;
  }

  // 先传厂标（和后台手动上传同一套 key 规则：images/developers/<id>-logo<ext>）
  let imageUrl = row.image_url;
  if (needImage) {
    const file = LOGOS[name];
    const body = readFileSync(join(LOGOS_DIR, file));
    const ext = file.slice(file.lastIndexOf('.'));
    const key = `images/developers/${row.id}-logo${ext}`;
    imageUrl = publicUrl(key);
    if (DRY_RUN) {
      console.log(`   · 「${name}」将上传 ${file} → ${key}（${body.length} bytes）`);
    } else {
      await r2.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: body,
        ContentType: CONTENT_TYPE[ext] ?? 'application/octet-stream',
      }));
    }
  }

  if (DRY_RUN) {
    console.log(`   · 「${name}」将写入：image=${imageUrl ? '有' : '无'} summary/description/foundedYear=${profile.foundedYear ?? '(空)'} website=${profile.website ?? '(空)'}${needNameEnFix ? ` name_en→${profile.fixNameEn}` : ''}`);
    continue;
  }

  // 每家一条 UPDATE：图片、文案、name_en 修正合并写
  await d1(
    'UPDATE developers SET image_url = ?, summary = ?, description = ?, founded_year = ?, website = ?, name_en = COALESCE(?, name_en) WHERE id = ?',
    [imageUrl, profile.summary, profile.description, profile.foundedYear, profile.website, needNameEnFix ? profile.fixNameEn : null, row.id]
  );
  updated += 1;
  console.log(`  ✓ 「${name}」已写入${needImage ? '（含厂标上传）' : ''}${needNameEnFix ? '（含 name_en 修正）' : ''}`);
}

console.log(
  DRY_RUN
    ? `\n空跑完成：${Object.keys(PROFILES).length} 家待写，${skipped} 家跳过。未上传、未写库。`
    : `\n完成：写入 ${updated} 家，跳过 ${skipped} 家。`
);
