/*
 * 探出压缩包里「该写进 m3u 的那一条」文件名（2026-10-22 加）。
 *
 * ## 为什么需要它
 *
 * 多碟游戏要用 `.m3u` 播放列表才能换碟，而 libretro 的规矩是：
 *
 * > ZIP support is provided by RetroArch and is done before passing the game to the core.
 * > So, when using a M3U file, the specified disk image must be uncompressed.
 *
 * 也就是说 **m3u 里一行只能写解压后的镜像（cue / chd / iso），不能写 zip**。
 * 而库里 70% 的碟片是 zip，里面才是 cue + bin —— 不下载整包就不知道那一行该写什么，
 * 「启动只下第一碟」的前提就破了。
 *
 * 这个脚本用 **HTTP Range 只读 zip 的两个小片段**（尾部 EOCD + 中央目录），
 * 就能拿到内层文件清单，把入口名写进 `game_roms.entry_name`。
 * **不下载整包**：一次探测通常几十 KB。
 *
 * ## 用法
 *
 *   node --env-file=.env.local scripts/fill-rom-entries.mjs           # 只出报告
 *   node --env-file=.env.local scripts/fill-rom-entries.mjs --apply   # 写库
 *   ... --limit=10        只探前 10 行
 *   ... --slug=xenogears  只探这一款
 *
 * ## 只探「多碟游戏」的行
 *
 * 单碟不需要 m3u，探了也用不上；而全库 zip 有几千行，逐个探是白花流量。
 * 多碟游戏的行（含它的 disc 1）加起来约 140 行。
 *
 * ⚠️ 只处理 `.zip`。`.7z` 的中央目录在文件末尾但格式完全不同（End Header 里是
 *    next-header-offset，压缩块结构不是目录树），本项目多碟里只有 6 行是 7z，
 *    不值得为它写一套 7z 解析 —— 那几行的 `entry_name` 留空，前端对它们走「全量解压」。
 * ⚠️ `.chd` / `.pbp` 是单文件，天然就是 m3u 的那一行，不需要探（前端直接取 `rom_name`）。
 */
import postgres from 'postgres';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
/** 尾部探测窗口：EOCD 在最末尾 22 字节 + 最多 64 KiB 注释，取 64 KiB 足够宽松。 */
const TAIL_WINDOW = 64 * 1024;
/** m3u 里最该写哪种入口：cue 描述碟片布局，被它引用的 bin 由核心自己找。 */
const ENTRY_PRIORITY = ['.cue', '.mds', '.ccd', '.iso', '.chd', '.bin', '.img'];

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const limitArg = args.find((a) => a.startsWith('--limit='))?.slice('--limit='.length);
const limit = limitArg ? Number(limitArg) : Infinity;
const onlySlug = args.find((a) => a.startsWith('--slug='))?.slice('--slug='.length);

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) {
  console.error('缺少环境变量 SUPABASE_DB_URL');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 取一段字节（闭区间），返回 Buffer + 该段在文件里的起点。 */
async function fetchRange(url, start, end) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, range: `bytes=${start}-${end}` },
    signal: AbortSignal.timeout(45_000),
  });
  if (res.status !== 206) {
    await res.body?.cancel();
    throw new Error(`Range 未生效（HTTP ${res.status}）`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer;
}

/** 文件总长度：拿一个字节，从 `Content-Range: bytes 0-0/12345` 里读。 */
async function contentLength(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, range: 'bytes=0-0' },
    signal: AbortSignal.timeout(30_000),
  });
  const range = res.headers.get('content-range') ?? '';
  await res.body?.cancel();
  const total = Number(range.split('/')[1]);
  return Number.isFinite(total) && total > 0 ? total : null;
}

/**
 * 读 zip 中央目录，返回内层文件名列表。
 *
 * 只看两个片段：
 *   ① 尾部窗口里的 EOCD（签名 `PK\x05\x06`），从中读中央目录的偏移与大小；
 *   ② 精确 Range 取那一段中央目录，逐条读 `PK\x01\x02` 记录里的文件名。
 * 所以 600 MiB 的包也只花几十 KB 流量。
 *
 * zip64（偏移/大小是 0xFFFFFFFF）这里**直接放弃**：PS1 单碟镜像远到不了 4 GiB，
 * 真遇到了交给调用方留空、前端走全量。
 */
async function readZipNames(url) {
  const size = await contentLength(url);
  if (!size) throw new Error('拿不到文件长度');

  const tailStart = Math.max(0, size - TAIL_WINDOW);
  const tail = await fetchRange(url, tailStart, size - 1);

  /* 从后往前找 EOCD：末尾可能跟着注释，所以不能只看最后 22 字节。 */
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('找不到 EOCD（不是 zip？）');

  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOffset = tail.readUInt32LE(eocd + 16);
  if (cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new Error('zip64，跳过');

  const directory = await fetchRange(url, cdOffset, cdOffset + cdSize - 1);

  const names = [];
  let cursor = 0;
  while (cursor + 46 <= directory.length) {
    if (directory.readUInt32LE(cursor) !== 0x02014b50) break;
    const nameLength = directory.readUInt16LE(cursor + 28);
    const extraLength = directory.readUInt16LE(cursor + 30);
    const commentLength = directory.readUInt16LE(cursor + 32);
    const raw = directory.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    names.push(raw);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

/** 从内层清单里挑 m3u 该写的那一条（丢掉目录项和 macOS 垃圾）。 */
function pickEntry(names) {
  const files = names
    .map((name) => name.replace(/\\/g, '/'))
    .filter((name) => name && !name.endsWith('/') && !name.startsWith('__MACOSX/'))
    .filter((name) => !/\/?\._/.test(name) && !name.endsWith('.DS_Store'));

  for (const ext of ENTRY_PRIORITY) {
    const hit = files.find((name) => name.toLowerCase().endsWith(ext));
    /* m3u 里写 basename：解包后是扁平落在同一个内容目录，写路径反而找不到。 */
    if (hit) return hit.split('/').pop();
  }
  return null;
}

const sql = postgres(databaseUrl, { max: 1 });
try {
  /*
   * 只取「这一款游戏有多张碟」的那些行 —— 用 `exists` 而不是 `count(remark) over`：
   * 数据量小，可读性优先。
   */
  const rows = await sql`
    select r.game_slug, r.language, r.disc, r.rom_name, r.source_url
      from game_roms r
     where r.source_url like 'files:%.zip'
       /* 默认只补还没探过的；加了 --force 才全部重探（换过源文件时用）。 */
       and (${args.includes('--force')}::boolean or r.entry_name is null)
       and exists (
         select 1 from game_roms x
          where x.game_slug = r.game_slug and x.disc > 1
       )
       and (${onlySlug ?? null}::text is null or r.game_slug = ${onlySlug ?? null})
     order by r.game_slug, r.language, r.disc
  `;
  const targets = rows.slice(0, limit);

  console.log(
    `${apply ? '写入模式' : '报告模式（加 --apply 才写库）'}：待探测 ${targets.length} 行 zip`
  );

  let written = 0;
  const problems = [];

  for (const [index, row] of targets.entries()) {
    const tag = `[${index + 1}/${targets.length}] ${row.game_slug} ${row.language} disc${row.disc}`;
    const url = `https://files.retrogamesnexus.com${row.source_url.slice('files:'.length)}`;
    try {
      const names = await readZipNames(url);
      const entry = pickEntry(names);
      if (!entry) {
        problems.push(`${tag}: 包内没有可作入口的镜像（${names.length} 个文件）`);
        console.log(`${tag} ✗ 没有镜像入口`);
        continue;
      }
      console.log(`${tag} ✓ ${entry}（包内 ${names.length} 个文件）`);
      if (apply) {
        await sql`update game_roms set entry_name = ${entry}
                   where game_slug = ${row.game_slug} and language = ${row.language} and disc = ${row.disc}`;
        written += 1;
      }
    } catch (error) {
      problems.push(`${tag}: ${error.message}`);
      console.log(`${tag} ✗ ${error.message}`);
    }
    await sleep(250);
  }

  console.log(`\n完成：${apply ? `写入 ${written} 行` : '未写库'}，问题 ${problems.length} 条`);
  for (const problem of problems) console.log(`  · ${problem}`);
} finally {
  await sql.end({ timeout: 10 });
}
