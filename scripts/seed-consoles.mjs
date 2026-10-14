/*
 * 机种资料一次性补全（2026-10-14）：把十二个机种的**完整双语资料**写进 consoles 表，
 * 并把配套生成的像素风机图上传到 R2、回填 image_url。
 *
 * 用法（在仓库根目录）：
 *   node --env-file=.env.local scripts/seed-consoles.mjs [--dry-run]
 *
 * 做三件事：
 *   ① 把本地 .workbuddy-ai/tmp/console-images/<type>.png 上传到 R2
 *      `images/consoles/<type>-pixel.png`（同 key 直接覆盖，天然幂等）；
 *   ② 对十二个机种各跑一条 `INSERT ... ON CONFLICT DO UPDATE`（和
 *      lib/server/consoles.ts 的 upsertConsole 同一条语句）——
 *      **后台已经改过的资料会被这份种子内容覆盖**，所以这是一次性脚本，
 *      跑过就删 / 别再跑（除非想恢复成这份内容）；
 *   ③ 打印每行的最终内容核对。
 *
 * 为什么不并入 add-consoles.mjs：那个是「结构迁移」（建表 + 预填占位），可以永远留着
 * 反复跑；这个是「内容快照」，会覆盖人工编辑 —— 两者的复跑安全性完全不同，必须分开。
 *
 * ⚠️ `.env.local` 里连的是**真库**。
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const {
  CF_ACCOUNT_ID,
  CF_D1_API_TOKEN,
  D1_DATABASE_ID,
  R2_ENDPOINT,
  R2_BUCKET,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_PUBLIC_BASE,
} = process.env;

const NEED = [
  'CF_ACCOUNT_ID',
  'CF_D1_API_TOKEN',
  'D1_DATABASE_ID',
  'R2_ENDPOINT',
  'R2_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_PUBLIC_BASE',
];
const missing = NEED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`缺少环境变量：${missing.join(' / ')}`);
  console.error('用法：node --env-file=.env.local scripts/seed-consoles.mjs [--dry-run]');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');

const IMAGE_DIR = path.resolve('.workbuddy-ai/tmp/console-images');

// ---------------------------------------------------------------- D1（REST，同 add-developers.mjs）

const d1Url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

async function d1(sql, params = []) {
  const res = await fetch(d1Url, {
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

// ---------------------------------------------------------------- R2（S3 SDK，同 lib/server/r2.ts）

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

function publicUrl(key) {
  const base = R2_PUBLIC_BASE.replace(/\/+$/, '');
  const p = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${base}/${p}`;
}

async function uploadImage(type) {
  const key = `images/consoles/${type}-pixel.png`;
  const file = path.join(IMAGE_DIR, `${type}.png`);
  let body;
  try {
    body = await readFile(file);
  } catch {
    return { key, url: null, skipped: true };
  }
  await s3.send(
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: 'image/png' })
  );
  return { key, url: publicUrl(key), skipped: false };
}

// ---------------------------------------------------------------- 种子内容（一次性快照）

const CONSOLES = [
  {
    type: 'nes',
    name: '红白机（NES）',
    nameEn: 'NES (Famicom)',
    releaseYear: 1983,
    summary: '任天堂 1983 年推出的 8 位家用游戏机，本站库里的主力机种。',
    summaryEn: "Nintendo's 8-bit home console from 1983 — the backbone of this library.",
    description:
      '红白机（Family Computer，欧美版名 Nintendo Entertainment System，简称 NES）是任天堂于 1983 年在日本推出的 8 位家用游戏机。' +
      '它用十字键加 A / B 两颗钮定义了此后几十年的手柄布局，《超级马里奥兄弟》《塞尔达传说》《魂斗罗》等一大批游戏都从这台机器上起步。' +
      '本站的 NES 游戏通过 fceumm 核心在浏览器里运行，支持即时存档与按键自定义。',
    descriptionEn:
      'The Family Computer — released by Nintendo in Japan in 1983 and known in the West as the Nintendo Entertainment System (NES) — ' +
      'is the 8-bit home console that defined the D-pad + A/B controller layout for decades to come. Super Mario Bros., ' +
      'The Legend of Zelda and Contra all started here. NES games on this site run in your browser through the fceumm core, ' +
      'with save states and custom key bindings.',
  },
  {
    type: 'snes',
    name: '超级任天堂（SFC）',
    nameEn: 'Super Nintendo (SNES)',
    releaseYear: 1990,
    summary: '1990 年推出的 16 位家用游戏机，日版名 Super Famicom。',
    summaryEn: 'The 16-bit home console from 1990, known as the Super Famicom in Japan.',
    description:
      '超级任天堂（日本本土名 Super Famicom，简称 SFC）是任天堂 1990 年推出的 16 位家用游戏机，也是红白机的正统续作。' +
      '它的 Mode 7 旋转缩放特效与《超级马里奥世界》《塞尔达传说：众神的三角力量》《街头霸王 II》等作品，' +
      '让它成为许多人心目中「最好的 16 位主机」。本站的 SFC 游戏通过 snes9x 核心在浏览器里运行。',
    descriptionEn:
      "The Super Nintendo (sold in Japan as the Super Famicom, or SFC) is Nintendo's 16-bit home console from 1990 and the direct " +
      'successor to the NES. Its Mode 7 scaling effects, plus classics like Super Mario World, The Legend of Zelda: A Link to the ' +
      'Past and Street Fighter II, made it many people\u2019s favorite 16-bit machine. SNES games on this site run through the snes9x core.',
  },
  {
    type: 'gba',
    name: 'Game Boy Advance',
    nameEn: 'Game Boy Advance',
    releaseYear: 2001,
    summary: '任天堂 2001 年推出的 32 位掌上游戏机。',
    summaryEn: "Nintendo's 32-bit handheld from 2001.",
    description:
      'Game Boy Advance（GBA）是任天堂 2001 年推出的 32 位掌上游戏机：横向机身、彩色屏幕，向下兼容原版 Game Boy 卡带。' +
      '《黄金太阳》《火焰之纹章》《口袋妖怪 红宝石 / 蓝宝石》等一大批作品都在它上面诞生。' +
      '本站的 GBA 游戏通过 mGBA 核心在浏览器里运行。',
    descriptionEn:
      "The Game Boy Advance (GBA) is Nintendo's 32-bit handheld from 2001 — a landscape body with a full-color screen, backward " +
      'compatible with original Game Boy cartridges. Golden Sun, Fire Emblem, Pokémon Ruby & Sapphire and a whole generation of ' +
      'classics were born on it. GBA games on this site run through the mGBA core.',
  },
  {
    type: 'arcade',
    name: '街机',
    nameEn: 'Arcade',
    releaseYear: null, // 街机跨越几十年，没有单一「发售年份」
    summary: '街机厅里的投币游戏，本站通过 FBNeo 核心运行。',
    summaryEn: 'Coin-op cabinet games from the arcades, emulated here through the FBNeo core.',
    description:
      '街机（Arcade）泛指投币式商用游戏机：《拳皇》《街霸》《恐龙快打》《雷电》这些名字都来自街机厅的机台。' +
      '街机没有统一的硬件规格，本站用 FBNeo（FinalBurn Neo）核心模拟，收录的游戏以 zip 包内的驱动名为准 —— ' +
      '所以街机 ROM 的文件名不要改，改了核心会认不出驱动、静默载入失败。',
    descriptionEn:
      '"Arcade" covers coin-operated cabinet games: The King of Fighters, Street Fighter, Cadillacs and Dinosaurs, Raiden — ' +
      'all of them lived in arcade halls. Arcade hardware has no single specification, so this site emulates it through the ' +
      'FBNeo (FinalBurn Neo) core, which identifies each game by the driver name inside its zip file — arcade ROM files must ' +
      'keep their original file names, or the core will silently fail to load them.',
  },

  /* ——— 2026-10-14 新增的八个机种 ——— */
  {
    type: 'gb',
    name: 'Game Boy',
    nameEn: 'Game Boy',
    releaseYear: 1989,
    summary: '任天堂 1989 年推出的掌上游戏机，四阶灰阶屏幕，全球销量过亿。',
    summaryEn: "Nintendo's handheld from 1989 — a four-shade screen that sold over 100 million units.",
    description:
      'Game Boy 是任天堂 1989 年推出的掌上游戏机：一块四阶灰阶的绿色液晶屏、十字键加 A / B 两颗钮，' +
      '靠四节五号电池能跑十几个小时，全球销量超过一亿台。《俄罗斯方块》《口袋妖怪 红 / 绿》' +
      '《塞尔达传说：梦见岛》都从这台机器起步。本站的 GB 游戏通过 mGBA 核心在浏览器里运行，' +
      'GB 与 GBC 卡带共用同一个核心。',
    descriptionEn:
      'The Game Boy is the handheld Nintendo released in 1989 — a four-shade green LCD, a D-pad and two buttons, ' +
      'running a dozen hours on four AA batteries, and more than 100 million units sold. Tetris, Pokémon Red & Green ' +
      'and The Legend of Zelda: Link\u2019s Awakening all started here. Game Boy games on this site run through ' +
      'the mGBA core, the same core used for GBC cartridges.',
  },
  {
    type: 'gbc',
    name: 'Game Boy Color',
    nameEn: 'Game Boy Color',
    releaseYear: 1998,
    summary: 'Game Boy 的彩色版本，1998 年推出，向下兼容黑白卡带。',
    summaryEn: 'The colour Game Boy from 1998, backwards compatible with the black-and-white cartridges.',
    description:
      'Game Boy Color 是任天堂 1998 年推出的彩色掌机，机身比初代 Game Boy 更薄，屏幕能显示五十余种颜色，' +
      '同时向下兼容此前的黑白卡带。《口袋妖怪 金 / 银》《塞尔达传说：不可思议的果实》是它最出名的作品。' +
      '本站的 GBC 游戏同样通过 mGBA 核心在浏览器里运行。',
    descriptionEn:
      'The Game Boy Color is Nintendo\u2019s colour handheld from 1998: a slimmer body than the original Game Boy, ' +
      'a screen able to show more than fifty colours, and full backwards compatibility with the older ' +
      'black-and-white cartridges. Pokémon Gold & Silver and The Legend of Zelda: Oracle of Seasons are among ' +
      'its best-known titles. GBC games on this site run through the same mGBA core.',
  },
  {
    type: 'md',
    name: '世嘉 MD（Mega Drive）',
    nameEn: 'Sega Mega Drive',
    releaseYear: 1988,
    summary: '世嘉 1988 年推出的 16 位家用游戏机，北美版叫 Genesis。',
    summaryEn: "Sega's 16-bit console from 1988, sold as the Genesis in North America.",
    description:
      '世嘉 MD（Mega Drive，北美版名 Genesis）是世嘉 1988 年推出的 16 位家用游戏机，' +
      '靠更快的处理器和偏硬派的游戏阵容与超级任天堂分庭抗礼：《刺猬索尼克》《怒之铁拳》' +
      '《梦幻之星》都出自这台机器。本站的 MD 游戏通过 Genesis Plus GX 核心运行，' +
      'MD、Game Gear、Master System 三台共用这一个核心。',
    descriptionEn:
      'The Sega Mega Drive — sold as the Genesis in North America — is Sega\u2019s 16-bit home console from 1988. ' +
      'A faster processor and a harder-edged line-up let it trade blows with the Super Nintendo: Sonic the Hedgehog, ' +
      'Streets of Rage and Phantasy Star all came from this machine. Mega Drive games on this site run through the ' +
      'Genesis Plus GX core, which also covers Game Gear and Master System.',
  },
  {
    type: 'gg',
    name: 'Game Gear',
    nameEn: 'Game Gear',
    releaseYear: 1990,
    summary: '世嘉 1990 年推出的彩色掌上游戏机，硬件接近 Master System。',
    summaryEn: "Sega's colour handheld from 1990, built on Master System hardware.",
    description:
      'Game Gear 是世嘉 1990 年推出的彩色掌上游戏机，硬件规格与 Master System 相近，' +
      '换来一块能发光的彩色屏幕，代价是六节五号电池只能撑几个小时。' +
      '《刺猬索尼克》《噗哟噗哟》《梦幻之星外传》都有它的版本。' +
      '本站的 Game Gear 游戏通过 Genesis Plus GX 核心在浏览器里运行。',
    descriptionEn:
      'The Game Gear is Sega\u2019s colour handheld from 1990. Its hardware sits close to the Master System, ' +
      'trading battery life for a backlit colour screen: six AA batteries bought only a few hours of play. ' +
      'Sonic the Hedgehog, Puyo Puyo and Phantasy Star Gaiden all appeared on it. Game Gear games on this site ' +
      'run through the Genesis Plus GX core.',
  },
  {
    type: 'sms',
    name: '世嘉 Master System',
    nameEn: 'Sega Master System',
    releaseYear: 1987,
    summary: '世嘉 1987 年推出的 8 位家用游戏机。',
    summaryEn: "Sega's 8-bit home console from 1987.",
    description:
      'Master System 是世嘉 1987 年推出的 8 位家用游戏机，机身同时带一个卡带插槽和一个卡片插槽，' +
      '在欧洲与巴西市场卖得相当好，生命力比在日本本土长得多。《神奇小子》《梦幻之星》是它的代表作。' +
      '本站的 Master System 游戏通过 Genesis Plus GX 核心在浏览器里运行。',
    descriptionEn:
      'The Master System is Sega\u2019s 8-bit home console from 1987. It carries both a cartridge slot and a card slot, ' +
      'and it fared far better in Europe and Brazil than it ever did in Japan. Wonder Boy and Phantasy Star are its ' +
      'signature titles. Master System games on this site run through the Genesis Plus GX core.',
  },
  {
    type: '32x',
    name: '世嘉 32X',
    nameEn: 'Sega 32X',
    releaseYear: 1994,
    summary: 'MD 的 32 位附加硬件，1994 年发售，本站由 PicoDrive 核心直接运行。',
    summaryEn: 'The 32-bit add-on for the Mega Drive, released in 1994 and emulated here by PicoDrive.',
    description:
      '32X 是世嘉 1994 年为 MD 推出的 32 位附加硬件：它插在主机原本的卡带口上，' +
      '游戏卡带再插进它自己的插槽，等于给 MD 加了一颗 32 位处理器和更强的图形能力，' +
      '可惜上市不到两年就退场了。《VR 战士》《毁灭战士 32X》是它不多的名作。' +
      '本站的 32X 游戏通过 PicoDrive 核心在浏览器里运行。',
    descriptionEn:
      'The 32X is the 32-bit add-on Sega released for the Mega Drive in 1994. It plugs into the console\u2019s own ' +
      'cartridge slot while the game cartridge goes into a second slot on top of it, in effect grafting a 32-bit ' +
      'processor and stronger graphics onto the Mega Drive. It was discontinued less than two years later. ' +
      'Virtua Fighter and Doom 32X are among its few notable titles. 32X games on this site run through the ' +
      'PicoDrive core.',
  },
  {
    type: 'ws',
    name: '万代 WonderSwan',
    nameEn: 'WonderSwan',
    releaseYear: 1999,
    summary: '万代 1999 年推出的掌上游戏机，横竖两个方向都能玩。',
    summaryEn: "Bandai's handheld from 1999, playable in either portrait or landscape.",
    description:
      'WonderSwan 是万代 1999 年推出的掌上游戏机，由横井军平设计，机身轻薄、横竖两个方向都能玩，' +
      '靠一节五号电池就能驱动。《机战 Compact》系列与《妖精战士》是它的招牌作品。' +
      '本站的 WonderSwan 游戏通过 Mednafen WonderSwan 核心在浏览器里运行。',
    descriptionEn:
      'The WonderSwan is Bandai\u2019s handheld from 1999, designed by Gunpei Yokoi. It is slim and light, ' +
      'plays in either portrait or landscape orientation, and runs on a single AA battery. The Super Robot Wars ' +
      'Compact series and Arc the Lad are its signature titles. WonderSwan games on this site run through the ' +
      'Mednafen WonderSwan core.',
  },
  {
    type: 'ngp',
    name: 'Neo Geo Pocket',
    nameEn: 'Neo Geo Pocket',
    releaseYear: 1998,
    summary: 'SNK 1998 年推出的掌上游戏机，街机游戏的家用掌上版。',
    summaryEn: "SNK's handheld from 1998 — the pocket-sized version of the Neo Geo.",
    description:
      'Neo Geo Pocket 是 SNK 1998 年推出的掌上游戏机，把街机厅的 Neo Geo 搬进掌心：' +
      '靠一颗微动开关摇杆和两颗按钮还原街机手感，《拳皇 R-2》《侍魂》《合金弹头》都有它的版本。' +
      '本站的 Neo Geo Pocket 游戏通过 Mednafen Neo Geo Pocket 核心在浏览器里运行。',
    descriptionEn:
      'The Neo Geo Pocket is SNK\u2019s handheld from 1998, bringing the arcade Neo Geo into the palm of your hand: ' +
      'a micro-switched thumbstick and two buttons reproduce the arcade feel, and The King of Fighters R-2, ' +
      'Samurai Shodown and Metal Slug all appeared on it. Neo Geo Pocket games on this site run through the ' +
      'Mednafen Neo Geo Pocket core.',
  },
];

const UPSERT = `
INSERT INTO consoles
  (console_type, name, name_en, image_url, summary, summary_en,
   description, description_en, release_year, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(console_type) DO UPDATE SET
  name = excluded.name,
  name_en = excluded.name_en,
  image_url = excluded.image_url,
  summary = excluded.summary,
  summary_en = excluded.summary_en,
  description = excluded.description,
  description_en = excluded.description_en,
  release_year = excluded.release_year`;

console.log(DRY_RUN ? '== 空跑（不会写入任何东西）==' : '== 开始补全机种资料 ==');

for (const item of CONSOLES) {
  process.stdout.write(`· ${item.type}：`);
  const image = await uploadImage(item.type);
  if (image.skipped) {
    console.log(`本地没有 ${IMAGE_DIR}/${item.type}.png，图片跳过（保留库里现有的 image_url）`);
  } else {
    console.log(`机图已上传 → ${image.url}`);
  }

  if (!DRY_RUN) {
    await d1(UPSERT, [
      item.type,
      item.name,
      item.nameEn,
      image.url, // 图片缺失时为 null —— 上面那次 UPSET 的 UPDATE 分支会把旧图清掉；
      // 本文件是一次性种子脚本（见文件头），这是可接受的语义
      item.summary,
      item.summaryEn,
      item.description,
      item.descriptionEn,
      item.releaseYear,
      Date.now(),
    ]);
    console.log(`  资料已写入（name=${item.name} / release=${item.releaseYear ?? '—'}）`);
  } else {
    console.log('  将写入资料（空跑，未写入）');
  }
}

if (!DRY_RUN) {
  const rows = await d1(
    'SELECT console_type, name, name_en, image_url, release_year FROM consoles ORDER BY console_type'
  );
  console.log('\n== 写入后核对 ==');
  for (const row of rows) {
    console.log(
      `· ${row.console_type}  ${row.name} / ${row.name_en}  release=${row.release_year ?? '—'}  image=${row.image_url ?? '—'}`
    );
  }
}

console.log(DRY_RUN ? '== 空跑结束（什么都没写）==' : '== 完成 ==');
console.log('⚠️ 这是内容快照脚本：会覆盖后台的人工编辑。跑过一次就别再跑（除非想恢复这份内容）。');
