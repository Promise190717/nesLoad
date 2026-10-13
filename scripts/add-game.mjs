/*
 * 用命令行把**一款**游戏录进在线库（前台游戏库 + 房间的「在线游戏」都读它）。
 *
 * 为什么要有这个脚本：
 *   后台录入是 `POST /api/admin/games`（multipart 表单，浏览器里手动选封面 + ROM）。
 *   从外部站点扒了一批元数据想批量补进来时，手动一条条填表单太慢，于是留一个
 *   命令行入口。**流程和后台那条完全一致**：先把封面 / ROM 传到 R2，成功后再写 D1
 *   （顺序不能反 —— 反过来会留下「有记录却没文件」的坏数据）。
 *
 * 用法：
 *   node --env-file=.env.local scripts/add-game.mjs --rom <ROM路径> --cover <封面路径>
 *   node --env-file=.env.local scripts/add-game.mjs --rom <ROM路径> --cover-url <封面URL>
 *
 * 可选参数：
 *   --cover-url <url>     封面走外链（脚本自己去取），和 --cover 二选一
 *   --developer-id <id>   直接指定 developers.id（给了就不按名字查了）
 *   --developer <名字>     按 developers.name 反查 id（默认用脚本里内联的 科乐美）
 *   --create-developer    名字查不到时**自动新建**该开发商（默认只警告、留空）
 *   --dry-run             只打印将要执行的 SQL / 上传的 key，不碰 R2 / D1
 *
 * ⚠️ 只增不删：全程只有 INSERT，没有任何 UPDATE / DELETE / DROP。
 * ⚠️ 需要 R2_* 与 CF_* 环境变量（同 .env.example）。没配就直接报错退出。
 *
 * 当前内联的元数据是从 https://retrogamesnexus.com/zh/games/castlevania-aria-of-sorrow
 * 爬下来的（英文页 /en/games/... 用来补 *_en）。要录别的游戏，改下面 GAME 这个常量即可。
 */

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

// ---------------------------------------------------------------------------
// 待录入的游戏（改这里就能录别的）
// ---------------------------------------------------------------------------
const GAME = {
  title: '恶魔城：晓月圆舞曲',
  titleEn: 'Castlevania: Aria of Sorrow',
  consoleType: 'gba',
  year: 2003,
  language: 'English / 简体中文 / 日本語 / Deutsch / Français',
  series: '恶魔城',
  seriesEn: 'Castlevania',
  developer: '科乐美',
  developerEn: 'Konami',
  description:
    '恶魔城：晓月圆舞曲是 Game Boy Advance 上银河战士恶魔城类型的巅峰之作，让玩家沉浸在 2035 年日食期间的黑暗、氛围浓厚的冒险中。' +
    '玩家扮演来须苍真，一个看似普通的高中生，他和青梅竹马的白马弥那一起，莫名其妙地被卷入德古拉的城堡。' +
    '这座传奇堡垒的突然神秘出现预示着一场充满哥特式恐怖、挑战性敌人和引人入胜的叙事之旅。\n\n' +
    '本作最显著的特点是创新的战术魂系统：苍真可以吸收被击败敌人的灵魂，从而获得他们独特的力量。' +
    '灵魂分为红（攻击）、蓝（辅助）、黄（能力）、银（被动）四种，提供了前所未有的自定义空间。\n\n' +
    '城堡本身是一个精心设计的环境，充满隐藏通道、秘密房间与相互连接的区域，鼓励彻底探索。' +
    '由山根美智留创作的配乐完美补充了氛围，其令人难忘的旋律增强了恐惧与兴奋感。',
  descriptionEn:
    "Castlevania: Aria of Sorrow stands as a pinnacle of the Metroidvania genre on the Game Boy Advance, " +
    "immersing players in a dark, atmospheric adventure set in the year 2035 during a solar eclipse. " +
    "Players assume the role of Soma Cruz, a seemingly ordinary high school student who, along with his " +
    "childhood friend Mina Hakuba, finds himself inexplicably drawn into Dracula's Castle.\n\n" +
    "A defining feature of the game is its innovative Tactical Soul system: Soma can absorb the souls of " +
    "defeated enemies, granting him their unique powers. These souls are categorized into four types: " +
    "Red (Attack), Blue (Support), Yellow (Ability), and Silver (Passive), offering an unprecedented " +
    "level of customization.\n\n" +
    "The castle is a meticulously designed environment, rife with hidden passages, secret rooms, and " +
    "interconnected areas that encourage thorough exploration. The soundtrack, composed by Michiru Yamane, " +
    "complements the atmosphere beautifully, featuring memorable tunes that enhance the sense of dread " +
    "and excitement.",
};

// ---------------------------------------------------------------------------
// 环境 / 参数
// ---------------------------------------------------------------------------
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

const argv = process.argv.slice(2);

/** 取 `--name value` 形式的值；没有就返回 null。 */
function arg(name) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
}

const romPath = arg('rom');
const coverPath = arg('cover');
const coverUrl = arg('cover-url');
const developerIdArg = arg('developer-id');
const developerName = arg('developer') ?? GAME.developer;
const createDeveloper = argv.includes('--create-developer');
const dryRun = argv.includes('--dry-run');

// 封面二选一：`--cover` 给本地文件，`--cover-url` 给外链（脚本自己去取）。
if (!romPath || (!coverPath && !coverUrl)) {
  console.error(
    '用法：node --env-file=.env.local scripts/add-game.mjs --rom <ROM路径> (--cover <封面路径> | --cover-url <封面URL>)'
  );
  console.error(
    '      [--developer-id <id>] [--developer <名字>] [--create-developer] [--dry-run]'
  );
  process.exit(1);
}
if (coverPath && coverUrl) {
  console.error('--cover 与 --cover-url 只能给一个');
  process.exit(1);
}

const missing = [
  ['CF_ACCOUNT_ID', CF_ACCOUNT_ID],
  ['CF_D1_API_TOKEN', CF_D1_API_TOKEN],
  ['D1_DATABASE_ID', D1_DATABASE_ID],
  ['R2_ENDPOINT', R2_ENDPOINT],
  ['R2_BUCKET', R2_BUCKET],
  ['R2_ACCESS_KEY_ID', R2_ACCESS_KEY_ID],
  ['R2_SECRET_ACCESS_KEY', R2_SECRET_ACCESS_KEY],
  ['R2_PUBLIC_BASE', R2_PUBLIC_BASE],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error(`缺少环境变量：${missing.join(' / ')}`);
  console.error('用法：node --env-file=.env.local scripts/add-game.mjs --rom <ROM路径> --cover <封面路径>');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// D1（REST）
// ---------------------------------------------------------------------------
const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

/** 跑一条 SQL，返回结果行。D1 的 /query 单次只吃一条语句。 */
async function d1(sql, params = []) {
  const res = await fetch(D1_URL, {
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

// ---------------------------------------------------------------------------
// R2（S3 兼容）
// ---------------------------------------------------------------------------
const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

async function uploadObject(key, body, contentType) {
  await s3.send(
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: contentType })
  );
}

/** 从外链取封面字节（`--cover-url` 用）。 */
async function fetchCover(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`封面下载失败：HTTP ${res.status}（${url}）`);
  return new Uint8Array(await res.arrayBuffer());
}

/** 由对象 key 拼公网读取地址（和 lib/server/r2.ts 的 publicUrl 同规则）。 */
function publicUrl(key) {
  const base = R2_PUBLIC_BASE.replace(/\/+$/, '');
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

/** 把任意文件名收敛成安全的 key 片段，保留扩展名（同后台 route 的 safeName）。 */
function safeName(name) {
  return name.replace(/[^\w.-]+/g, '_').replace(/^_+/, '').slice(-80) || 'file';
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
const id = randomUUID();
// 封面的「原始文件名」：本地文件取 basename；外链取 URL 最后一段（忽略 query）。
const coverName = coverPath
  ? basename(coverPath)
  : decodeURIComponent(new URL(coverUrl).pathname.split('/').pop() || 'cover.webp');
const imageKey = `images/${id}-${safeName(coverName)}`;
const romKey = `roms/${id}-${safeName(basename(romPath))}`;
// ⚠️ 存**原始文件名**：FBNeo 拿 zip 文件名认驱动（GBA 不走这条，但保持一致）
const romName = basename(romPath);

console.log(`准备录入：${GAME.title}（${GAME.titleEn}） · ${GAME.consoleType} · ${GAME.year}`);
console.log(`  id        = ${id}`);
console.log(`  image key = ${imageKey}`);
console.log(`  rom   key = ${romKey}`);
console.log(`  rom_name  = ${romName}`);

// 1) 开发商：给了 --developer-id 就用它，否则按名字反查 developers 表。
//    查不到时**只有显式带 --create-developer 才自动建一条** —— 默认只警告，
//    免得名字打错就顺手往库里塞个垃圾开发商。
let developer = { id: null, name: null, nameEn: null };
let developerIsNew = false;
if (developerIdArg) {
  const rows = await d1('SELECT id, name, name_en FROM developers WHERE id = ?', [developerIdArg]);
  if (rows[0]) developer = { id: rows[0].id, name: rows[0].name, nameEn: rows[0].name_en };
  else console.warn(`⚠️ 找不到 developers.id = ${developerIdArg}，开发商字段留空。`);
} else if (developerName) {
  const rows = await d1('SELECT id, name, name_en FROM developers WHERE name = ?', [developerName]);
  if (rows[0]) {
    developer = { id: rows[0].id, name: rows[0].name, nameEn: rows[0].name_en };
  } else if (createDeveloper) {
    developer = { id: randomUUID(), name: developerName, nameEn: GAME.developerEn ?? null };
    developerIsNew = true;
  } else {
    console.warn(
      `⚠️ developers 表里没有「${developerName}」——开发商字段留空（加 --create-developer 可自动新建）。`
    );
  }
}

console.log(
  `  开发商    = ${developer.id ? `${developer.name}（${developer.nameEn ?? '-'}）id=${developer.id}` : '(空)'}`
);

if (dryRun) {
  console.log('\n--dry-run：以下操作不会真的执行。');
  if (developerIsNew) console.log(`  INSERT INTO developers (${developer.name})`);
  console.log(`  PUT ${R2_BUCKET}/${imageKey}`);
  console.log(`  PUT ${R2_BUCKET}/${romKey}`);
  console.log('  INSERT INTO games (...) VALUES (...)');
  process.exit(0);
}

// 2) 需要的话先建开发商（games.developer_id 要指向它）
if (developerIsNew) {
  await d1(
    `INSERT INTO developers
       (id, name, name_en, image_url, summary, summary_en, description, description_en,
        founded_year, website, created_at)
     VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?)`,
    [developer.id, developer.name, developer.nameEn, Date.now()]
  );
  console.log(`已新建开发商：${developer.name}（id=${developer.id}）。`);
}

// 3) 再传文件（顺序很重要：反过来会出现「有记录却没文件」）
const coverBuf = coverPath ? await readFile(coverPath) : await fetchCover(coverUrl);
const romBuf = await readFile(romPath);
await uploadObject(imageKey, coverBuf, 'image/webp');
await uploadObject(romKey, romBuf, 'application/octet-stream');
console.log('已上传封面与 ROM 到 R2。');

// 4) 最后写 D1
await d1(
  `INSERT INTO games
     (id, title, title_en, image_url, rom_url, rom_name, console_type, language, series, series_en,
      year, developer, developer_en, developer_id, description, description_en, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    id,
    GAME.title,
    GAME.titleEn,
    publicUrl(imageKey),
    romKey,
    romName,
    GAME.consoleType,
    GAME.language,
    GAME.series,
    GAME.seriesEn,
    GAME.year,
    developer.name,
    developer.nameEn,
    developer.id,
    GAME.description,
    GAME.descriptionEn,
    Date.now(),
  ]
);

console.log(`✅ 已录入：${GAME.title}`);
console.log(`   封面：${publicUrl(imageKey)}`);
