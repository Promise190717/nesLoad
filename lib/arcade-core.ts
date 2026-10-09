/**
 * 街机 romset 的**核心选择 + 修复**。
 *
 * 为什么需要它：FBNeo 和 FBA 0.2.97.42（`fbalpha2012_cps1`）认的 CPS1 驱动**不一样**。
 * FBNeo 是从 FBA fork 出来的，老 CPS1 驱动绝大多数同名同 rom，但 FBA 多出 9 个驱动
 * （`wof3js` / `wof3jsa` / `wof3sj` / `wof3sja` / `wofb` / `wofh` / `wofha` / `forgottnu1` /
 * `willowo`），FBNeo 多出 209 个。只挂一个核心，必然有一批 romset 静默失败。
 *
 * 更常见的一类失败是**名字不对**：FBNeo / FBA 拿 zip 里的文件名去查驱动表，它自己
 * **不校验 CRC** —— 内容一模一样、名字差一个下划线（`tke17.12b` vs `tke_17.12b`）
 * 就整个加载不了。网上流通的 romset 大量是「合并集命名」（`tk2_gfx1.rom` 这种），
 * 名字和任何一个核心都对不上，但内容是对的。
 *
 * 所以这里在 launch **之前**做三件事：
 *
 *   1. **认驱动**：读 zip 中央目录（文件名 + CRC32），去查两张表
 *      （`public/arcade-romsets.json`，由 FBNeo / FBA 的 `d_cps1.cpp` 解析生成）。
 *      判据是「驱动要的 rom **CRC 全都在**」—— 因为核心只按名字取、不校验 CRC，
 *      CRC 全在就等于内容齐了，剩下的只是名字问题。
 *   2. **补名字**：挑中驱动后，如果 zip 里的名字和驱动期望的对不上，就把 zip
 *      **重打包一遍**（`lib/zip.ts`，压缩数据原样搬，只重写名字字段）。
 *   3. **挖一层**：顶层认不出来时，往「整合包」里找内层 zip（站点合集常见形态：
 *      站内横幅 + `artwork/` + `roms/<驱动名>.zip`），拿内层再认一次。
 *
 * 挑驱动的优先级（见 `rank`）：驱动名 == 文件名 > 名字全对的条数 > 名字对上的条数 > FBNeo。
 * 三个都拿不到就原样返回，让核心照旧报错 —— 不能因为这里出错反而把原本能跑的弄挂。
 */

import { baseName, inflateEntry, readZipEntries, rebuildZip, type ZipEntry } from './zip';

/** 街机可用的核心名（都放在 `public/cores/<core>_libretro.{js,wasm}`）。 */
export type ArcadeCoreName = 'fbneo' | 'fbalpha2012_cps1';

/** `[rom 文件名, CRC32]` */
type RomRow = [string, number];

/** 驱动名 → 必需 rom 列表（`BRF_OPT` 的可选 rom 已排除） */
type CoreTable = Record<string, RomRow[]>;

type Tables = Record<ArcadeCoreName, CoreTable>;

/** 优先顺序：FBNeo 更新，能跑就别降到 FBA。 */
const CORE_ORDER: ArcadeCoreName[] = ['fbneo', 'fbalpha2012_cps1'];

/** 往整合包里挖一层时，最多试几个内层 zip —— 合集动辄几十个，全试一遍太慢。 */
const MAX_NESTED_ZIPS = 6;

/** 内层 zip 解压后的体积上限：超过就不挖了（防止拖进来一个几百 MB 的合集）。 */
const MAX_NESTED_BYTES = 64 * 1024 * 1024;

/** 表是静态资源，只拉一次。拉失败也不抛 —— 退回「不做选择」。 */
let tablesPromise: Promise<Tables | null> | null = null;

function loadTables(): Promise<Tables | null> {
  tablesPromise ??= fetch('/arcade-romsets.json')
    .then((res) => (res.ok ? (res.json() as Promise<Tables>) : null))
    .catch(() => null);
  return tablesPromise;
}

export interface ArcadeResolution {
  core: ArcadeCoreName;
  /** 传给 Nostalgist 的文件名 —— FBNeo / FBA 都拿它当驱动名 */
  fileName: string;
  /** 实际交给核心的字节：可能是重打包过的，也可能来自整合包内层 */
  content: Blob;
  /** 判定依据，只用来打日志 */
  reason: 'name' | 'content' | 'rewritten' | 'fallback';
  /** 命中的是整合包内层时，内层条目在原始 zip 里的名字 */
  container?: string;
}

/**
 * 决定这盘卡带该用哪个核心、该叫什么名字、该喂哪份字节。
 *
 * 任何一步读不动都走 `fallback`，行为和不加这个函数时完全一样。
 */
export async function resolveArcadeCore(file: File): Promise<ArcadeResolution> {
  const fallback: ArcadeResolution = {
    core: CORE_ORDER[0],
    fileName: file.name,
    content: file,
    reason: 'fallback',
  };
  if (!/\.zip$/i.test(file.name)) return fallback;

  try {
    const tables = await loadTables();
    if (!tables) return fallback;

    const entries = await readZipEntries(file);
    if (!entries) return fallback;

    const direct = await resolveWithin(file, entries, file.name, tables);
    if (direct) return direct;

    /*
     * 顶层认不出来 —— 大概率不是 romset 而是「整合包」（站点合集：横幅 + artwork/ + roms/）。
     * 往里挖一层。内层条目名本身就带驱动名（`roms/wof.zip`）的排在前面先试。
     */
    const nested = await resolveNested(file, entries, tables);
    if (nested) return nested;
  } catch {
    // 读失败一律退回原样，绝不让这里把原本能跑的弄挂
  }
  return fallback;
}

/* ------------------------------------------------------------------ *
 * 一张 zip 的索引
 * ------------------------------------------------------------------ */

interface ZipView {
  entries: ZipEntry[];
  /** 小写全名 → 条目下标（可能多条） */
  byFull: Map<string, number[]>;
  /** 小写 basename → 条目下标（可能多条） */
  byBase: Map<string, number[]>;
  /** CRC → 条目下标（可能多条：不同名字同内容） */
  byCrc: Map<number, number[]>;
}

function indexOf(list: ZipEntry[]): ZipView {
  const byFull = new Map<string, number[]>();
  const byBase = new Map<string, number[]>();
  const byCrc = new Map<number, number[]>();

  const push = <K,>(map: Map<K, number[]>, key: K, i: number) => {
    const list = map.get(key);
    if (list) list.push(i);
    else map.set(key, [i]);
  };

  list.forEach((entry, i) => {
    if (entry.name.endsWith('/')) return; // 目录条目不算 rom
    push(byFull, entry.name.toLowerCase(), i);
    push(byBase, baseName(entry.name).toLowerCase(), i);
    push(byCrc, entry.crc, i);
  });

  return { entries: list, byFull, byBase, byCrc };
}

/* ------------------------------------------------------------------ *
 * 匹配
 * ------------------------------------------------------------------ */

/** 驱动要的 rom，CRC 是不是**全都在**这个 zip 里（按重数算）。 */
function hasAllCrc(view: ZipView, need: RomRow[]): boolean {
  const want = new Map<number, number>();
  for (const [, crc] of need) want.set(crc, (want.get(crc) ?? 0) + 1);
  for (const [crc, n] of want) {
    if ((view.byCrc.get(crc)?.length ?? 0) < n) return false;
  }
  return true;
}

/** 按某张名字表（全名 / basename）数「名字和 CRC 都对上」的条数。 */
function countNameHits(view: ZipView, map: Map<string, number[]>, need: RomRow[]): number {
  let hits = 0;
  for (const [name, crc] of need) {
    const list = map.get(name.toLowerCase());
    if (list?.some((i) => view.entries[i].crc === crc)) hits += 1;
  }
  return hits;
}

interface Candidate {
  core: ArcadeCoreName;
  driver: string;
  need: RomRow[];
  /** 全名 + CRC 都对上的条数 */
  exact: number;
  /** basename + CRC 都对上的条数（`dir/` 前缀不影响） */
  base: number;
}

/** 排优先级。`driver === base` 是最强信号，直接压过其它一切。 */
function rank(c: Candidate, base: string): number {
  const nameBonus = c.driver === base ? 1e12 : 0;
  return nameBonus + c.exact * 1e6 + c.base * 1e3 + (c.core === 'fbneo' ? 1 : 0);
}

function collect(view: ZipView, tables: Tables, base: string): Candidate | null {
  let best: Candidate | null = null;
  let bestRank = -1;

  for (const core of CORE_ORDER) {
    for (const [driver, need] of Object.entries(tables[core] ?? {})) {
      if (!hasAllCrc(view, need)) continue;
      const candidate: Candidate = {
        core,
        driver,
        need,
        exact: countNameHits(view, view.byFull, need),
        base: countNameHits(view, view.byBase, need),
      };
      const r = rank(candidate, base);
      if (r > bestRank) {
        best = candidate;
        bestRank = r;
      }
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * 重写名字
 * ------------------------------------------------------------------ */

/**
 * 算出每个条目该叫什么。
 *
 * 两遍：
 *   ① 全名 + CRC 已经对上的条目**先占位**，免得被别的期望 rom 按 CRC 抢走；
 *   ② 剩下的期望 rom 按 CRC 认领一个还没被占的条目，把名字改成驱动期望的那个。
 *
 * 没被认领的条目（合并集里的其它游戏、可选 PLD…）**保持原名，但削掉 `dir/` 前缀** ——
 * 核心只认 zip 根目录下的名字，多出来的文件它不看。刻意不删：删了省不了多少体积，
 * 却可能把某个驱动真的需要的可选 rom 一起删掉。
 */
function planRename(view: ZipView, need: RomRow[]): string[] | null {
  const names = view.entries.map((e) => e.name);
  const claimed = new Set<number>();
  const pending: RomRow[] = [];

  for (const row of need) {
    const [name, crc] = row;
    const hit = (view.byFull.get(name.toLowerCase()) ?? []).find(
      (i) => !claimed.has(i) && view.entries[i].crc === crc
    );
    if (hit === undefined) pending.push(row);
    else claimed.add(hit);
  }

  for (const [name, crc] of pending) {
    const hit = (view.byCrc.get(crc) ?? []).find((i) => !claimed.has(i));
    if (hit === undefined) return null; // 理论上到不了：hasAllCrc 已经过了
    claimed.add(hit);
    names[hit] = name;
  }

  for (let i = 0; i < names.length; i += 1) {
    if (claimed.has(i)) continue;
    // 目录条目（`foo/`）原样留着 —— `baseName` 会把它削成空串，zip 头里名字长度 0 是废条目
    if (names[i].endsWith('/')) continue;
    names[i] = baseName(names[i]);
  }
  return names;
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

/** 在一张（已经读好的）zip 里认驱动。认不出返回 `null`。 */
async function resolveWithin(
  blob: Blob,
  entries: ZipEntry[],
  sourceName: string,
  tables: Tables
): Promise<ArcadeResolution | null> {
  if (entries.length === 0) return null;

  const view = indexOf(entries);
  const base = sourceName.replace(/\.[^.]+$/, '').toLowerCase();
  const best = collect(view, tables, base);
  if (!best) return null;

  const fileName = `${best.driver}.zip`;
  const namedRight = best.exact === best.need.length;

  // 名字已经全对（或压根不需要改）→ 原字节直接用
  if (namedRight) {
    return {
      core: best.core,
      fileName,
      content: blob,
      reason: best.driver === base ? 'name' : 'content',
    };
  }

  const names = planRename(view, best.need);
  if (!names) return null;
  const rebuilt = await rebuildZip(blob, entries, (_entry, i) => names[i]);
  if (!rebuilt) return null;

  return { core: best.core, fileName, content: rebuilt, reason: 'rewritten' };
}

/** 往整合包里挖一层：找内层 zip，逐个试。 */
async function resolveNested(
  blob: Blob,
  entries: ZipEntry[],
  tables: Tables
): Promise<ArcadeResolution | null> {
  const known = (name: string) => {
    const d = baseName(name).replace(/\.[^.]+$/, '').toLowerCase();
    return Boolean(tables.fbneo[d] ?? tables.fbalpha2012_cps1[d]);
  };

  const inner = entries
    .filter(
      (entry) =>
        !entry.name.endsWith('/') &&
        /\.zip$/i.test(entry.name) &&
        entry.size > 0 &&
        entry.size <= MAX_NESTED_BYTES
    )
    // 条目名本身就带驱动名（`roms/wof.zip`）的先试 —— 最可能一次就中
    .sort((a, b) => Number(known(b.name)) - Number(known(a.name)))
    .slice(0, MAX_NESTED_ZIPS);
  if (inner.length === 0) return null;

  for (const entry of inner) {
    const data = await inflateEntry(blob, entry);
    if (!data) continue;
    const innerEntries = await readZipEntries(data);
    if (!innerEntries) continue;

    const hit = await resolveWithin(data, innerEntries, baseName(entry.name), tables);
    if (hit) return { ...hit, container: entry.name };
  }
  return null;
}
