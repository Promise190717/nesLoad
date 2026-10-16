'use client';

import type { ConsoleType } from './emulator';
import { openDb, run as runOn, STORE_BIOS } from './db';
import { baseName, readZipEntries } from './zip';

/*
 * 需要 BIOS 的机种 —— **按机种分 key**。
 *
 * ## 两台机器、两种性质完全不同的依赖
 *
 *   · **街机（Neo Geo）**：FBNeo 跑合金弹头 / 拳皇 / 侍魂时要往 system 目录里找
 *     `neogeo.zip`，**拿不到就完全不加载** —— 表现和「romset 版本对不上」一模一样：
 *     静默，屏幕继续出雪花。所以这条是**硬依赖**，站点自带一份（`public/bios/neogeo.zip`）。
 *   · **PS1**：`pcsx_rearmed` 的核心选项原文是
 *     *"Auto will attempt to load a real bios file from the frontend 'system' directory,
 *     falling back to high level emulation if unavailable"* —— 也就是**没有真 BIOS 会回落
 *     HLE**，游戏照跑（兼容性差一点，个别游戏不行）。所以这条是**软依赖**：
 *     站点**不带**这份文件（SCPH1001.BIN 是索尼的版权物，`public/bios/` 里只留 neogeo.zip
 *     是用户明确拍板的边界），只在用户自己拖一份进来时装上、并用上。
 *
 * 核心认的四个文件名（wasm 里扫出来的）：`SCPH1001` / `SCPH5501` / `SCPH7001` / `SCPH101`。
 *
 * ## 两个来源（两台机器共用同一套规则）
 *
 * 1. **站点自带一份**（`siteUrl`）—— 用户什么都不用做：第一次要跑这个机种的游戏时
 *    `ensureBios()` 把它取回来存进 IndexedDB，之后一直走本地那份。
 * 2. **用户自己拖进来**（和拖卡带完全一样）—— 认出来就存起来，**覆盖**自带那份。
 *    这条路留着是为了：自建部署没放站点副本、或者用户想换版本（UniBIOS / 别的 SCPH）。
 *
 * 存取规则和卡带 / 存档一致：**引擎层不碰存储**，这里只负责「存下来 / 取出来」，
 * 由 ConsoleScene 在启动时取出来交给 EmulatorController。
 */

/** 需要 BIOS 的机种。加一个就在下面 `BIOS_SPECS` 里补一行。 */
export type BiosType = 'arcade' | 'ps1';

interface BiosSpec {
  type: BiosType;
  /**
   * IndexedDB 里的 key。
   *
   * ⚠️ 街机那一档**刻意还是老值 `'neogeo'`**，不是 `'arcade'` —— 改了的话
   * 已经装过 BIOS 的用户那份会变成孤儿（白白重新下一次站点副本）。
   */
  id: string;
  /**
   * 写进 system 目录时用的名字。核心是按名字找文件的，所以这一项决定成败。
   *
   * ⚠️ 传进来的是用户拖的那个文件的原始名，**不是每种机种都该钉死**：
   *   · 街机要钉死 —— 用户那份可能叫 `NeoGeo(1).zip`，而 FBNeo 只认 `neogeo.zip`；
   *   · PS1 **不能钉死** —— 核心认 SCPH1001 / 5501 / 7001 / 101 四个名字，
   *     把 `scph5501.bin` 改名成 `SCPH1001.BIN` 只会让日志和实际用的 BIOS 对不上。
   */
  nameFor: (original: string) => string;
  /** 站点自带那份的地址。**null = 站点不带**（只认用户自己拖的那份）。 */
  siteUrl: string | null;
  /**
   * 认「拖进来的这个是本机种 BIOS」用的文件名前缀（小写，已去掉扩展名）。
   *
   * 只看文件名、**不翻内容**。翻内容（街机那份找 `sfix.sfix` 这类特征成员）看着更聪明，
   * 但会把「把 BIOS 合进包里的整合版 romset」整盘认成 BIOS —— 文件被存进 `bios` store、
   * 游戏却没启动，界面上就是「拖进去毫无反应」。**误判比漏判难查得多**：
   * 漏判只是走回原来的失败路径，误判是把一盘本来能玩的卡带藏起来。
   */
  namePrefixes: readonly string[];
  /** 打日志用的短名。 */
  label: string;
}

export const BIOS_SPECS: Record<BiosType, BiosSpec> = {
  arcade: {
    type: 'arcade',
    id: 'neogeo',
    nameFor: () => NEOGEO_BIOS_NAME,
    siteUrl: '/bios/neogeo.zip',
    // `startsWith` 而不是全等：`neogeo.zip` / `neogeo-bios.zip` / `neogeo(1).zip` 都算。
    // 游戏 romset 不会用 neogeo 开头命名，所以不会误伤。
    namePrefixes: ['neogeo'],
    label: '街机（Neo Geo）',
  },
  ps1: {
    type: 'ps1',
    id: 'ps1',
    nameFor: (original) => original,
    // 站点**不带**这份 —— 理由见文件头。用户拖一份进来照样能用。
    siteUrl: null,
    // 四个官方 BIOS 名字都以 scph 开头（`scph1001.bin` / `SCPH5501.BIN`…），
    // 大小写不敏感地比前缀就够。别放宽成 `.bin` —— 那会把「随便一个 bin」当 BIOS 收走。
    namePrefixes: ['scph'],
    label: 'PS1',
  },
};

/**
 * 这个机种要不要 BIOS、要哪一份。不需要的（NES / SFC / GBA / MD…）返回 null。
 *
 * 加机种时**只在这一处登记** —— `emulator.ts` 和 `ConsoleScene` 都问这个函数，
 * 不各写一份 `=== 'arcade'`。
 */
export function biosTypeFor(consoleType: ConsoleType | null | undefined): BiosType | null {
  if (consoleType === 'arcade') return 'arcade';
  if (consoleType === 'ps1') return 'ps1';
  return null;
}

/**
 * FBNeo 认的固定文件名。
 *
 * 存进来的原始名字可能五花八门（`neogeo(1).zip`、`NeoGeo.zip`…），但写进 system 目录时
 * 必须是这个名字，否则核心找不到。
 */
export const NEOGEO_BIOS_NAME = 'neogeo.zip';

interface BiosRecord {
  id: string;
  name: string;
  size: number;
  addedAt: number;
  blob: Blob;
}

export interface BiosInfo {
  name: string;
  size: number;
  addedAt: number;
}

const run = <T,>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest
): Promise<T | null> => runOn<T>(db, STORE_BIOS, mode, action);

/**
 * 这个文件看着像哪一台的 BIOS？认不出返回 null。
 *
 * 就是「只看文件名」那条规矩的落点，理由写在 `BiosSpec.namePrefixes` 上。
 * 两台的前缀不重叠（`neogeo` / `scph`），所以顺序无所谓。
 */
export function matchBiosFile(file: File): BiosType | null {
  const stem = baseName(file.name).toLowerCase().replace(/\.[^.]+$/, '');
  for (const spec of Object.values(BIOS_SPECS)) {
    if (spec.namePrefixes.some((prefix) => stem.startsWith(prefix))) return spec.type;
  }
  return null;
}

/** Neo Geo 的图形 rom：`232-c1.bin` / `232-c1.c1` 都算。 */
const NEOGEO_GFX_ROM = /-c[1-8]\.[a-z0-9]+$/;

/** Neo Geo 的程序 / Z80 / 文字层 / 音效 rom：`-p1` `-p2` `-m1` `-s1` `-v1`… */
const NEOGEO_OTHER_ROM = /-(p[1-4]|m1|s1|v[1-4])\.[a-z0-9]+$/;

/**
 * `neogeo.zip` 里的成员名。
 *
 * 这几个名字是那盘 BIOS **独有**的，游戏 romset 不会这么起名，所以拿它们判断
 * 「这个 zip 是不是把 BIOS 也塞进来了」很安全。
 * （和 `matchBiosFile` 不同：那边判的是「拖进来的就是 BIOS」，看内容会误伤整合包；
 * 这边判的是「包里有没有 BIOS」，目的正相反，翻内容才是对的。）
 */
const BIOS_MEMBER = new RegExp(
  '^(' +
    [
      '000-lo\\.lo',
      'sfix\\.sfix',
      'sm1\\.sm1',
      'vs-bios\\.rom',
      'uni-bios.*\\.rom',
      'sp-.*\\.sp1',
      'sp1\\..*',
      'asia-s3\\.rom',
      'japan-j3\\.bin',
      'usa_2slt\\.bin',
      '\\d+-bios.*\\.sp1',
    ].join('|') +
    ')$'
);

/**
 * 这盘卡带看起来是不是 **Neo Geo 游戏** —— 也就是「机器上没装 neogeo.zip 就跑不了」的那一类。
 *
 * ## 为什么需要它
 *
 * Neo Geo 缺 BIOS 的失败是**完全静默**的：核心不抛异常（`Nostalgist.launch` 正常返回）、
 * 屏幕照常出雪花，`loadFile` 的 catch 分支根本走不到。所以这件事没有任何运行时信号可用，
 * 只能在**拖入的那一刻**按 romset 的内容猜。
 *
 * `lib/emulator.ts` 里本来就有一句 `console.warn` 说明要装 BIOS，但那是给开发者看的；
 * 用户看到的只有「拖进去没反应」。这个函数就是给界面侧提供一个判据，
 * 好在「按键说明」弹窗里亮出那句提示（和 7z / rar 的 `legend.needZip` 走同一个通道）。
 *
 * ## 判据：看 rom 名，不看内容
 *
 * Neo Geo 的 rom 命名是**独一套**的（MAME 风格和 FBNeo 风格都一样）：
 * 图形 rom 一律 `xxx-c1` … `xxx-c8`，配上一组 `-p*` / `-m1` / `-s1` / `-v*`。
 * 而 CPS1 / CPS2 的 rom 名是 `tke_17.12b`、`tk2_gfx1.rom` 这种，撞不上。
 *
 * 所以判据要求**两组同时命中**（至少两个 `-cN` **且** 至少一个 `-pN`/`-m1`/`-s1`/`-vN`）——
 * 单看 `-c1` 太弱，某些 CPS 游戏的 rom 名里也可能出现。
 *
 * ## 自带 BIOS 的整合包不算
 *
 * 网上有一类包把整套 neogeo BIOS 和游戏塞在同一个 zip 里（本站 Downloads 里那盘
 * `kof97.zip` 就是）。对那种包提示「去装 neogeo.zip」是误导 —— 他手里那份里明明有。
 * 所以一旦认出 `BIOS_MEMBER`，直接返回 `false`。
 *
 * 读不动（不是 zip、中央目录坏了）一律返回 `false` —— 和 `lib/unwrap.ts` 一样，
 * **这里出错不能把原本能跑的弄挂**，最差就是没有提示。
 */
export async function looksLikeNeoGeoRomset(file: File): Promise<boolean> {
  if (!/\.zip$/i.test(file.name)) return false;

  try {
    const entries = await readZipEntries(file);
    if (!entries) return false;

    let gfx = 0;
    let other = 0;

    for (const entry of entries) {
      if (entry.name.endsWith('/')) continue; // 目录条目
      const base = baseName(entry.name).toLowerCase();
      if (!base || base.startsWith('.')) continue; // `.DS_Store` / `__MACOSX` 里那些

      if (BIOS_MEMBER.test(base)) return false; // 自带 BIOS 的整合包 —— 不该提示

      if (NEOGEO_GFX_ROM.test(base)) gfx += 1;
      else if (NEOGEO_OTHER_ROM.test(base)) other += 1;
    }

    return gfx >= 2 && other >= 1;
  } catch {
    return false;
  }
}

export async function putBios(type: BiosType, file: File): Promise<BiosInfo | null> {
  const db = await openDb();
  if (!db) return null;

  const spec = BIOS_SPECS[type];
  const record: BiosRecord = {
    id: spec.id,
    name: spec.nameFor(file.name),
    size: file.size,
    addedAt: Date.now(),
    blob: file,
  };

  const written = await run<IDBValidKey>(db, 'readwrite', (store) => store.put(record));
  if (written === null) return null;

  return { name: record.name, size: record.size, addedAt: record.addedAt };
}

export async function getBiosInfo(type: BiosType): Promise<BiosInfo | null> {
  const db = await openDb();
  if (!db) return null;

  const record = await run<BiosRecord>(db, 'readonly', (store) =>
    store.get(BIOS_SPECS[type].id)
  );
  if (!record) return null;

  return { name: record.name, size: record.size, addedAt: record.addedAt };
}

/** 取出 BIOS 交给模拟器。文件名由 `BiosSpec.nameFor` 钉死（见那张表的注释）。 */
export async function getBios(type: BiosType): Promise<File | null> {
  const db = await openDb();
  if (!db) return null;

  const spec = BIOS_SPECS[type];
  const record = await run<BiosRecord>(db, 'readonly', (store) => store.get(spec.id));
  if (!record || !record.blob) return null;

  return new File([record.blob], spec.nameFor(record.name), { type: 'application/zip' });
}

/**
 * 站点那份**这次会话里已经确认拿不到了**（404 / 断网 / 回来的是 HTML）。
 *
 * 只记内存、不落盘，刷新页面就重来。作用只有一个：**别每次拖卡带都白打一次 404** ——
 * 自建部署（或者用户手动删了文件）时，那个请求会一直失败。
 *
 * 按机种分开记：PS1 那一档 `siteUrl` 是 null（站点本来就不带），压根不会进这里。
 */
const siteBiosMissing = new Set<BiosType>();

/**
 * 把站点自带的那份取回来。拿不到返回 null，调用方退回「没有 BIOS」的老路。
 *
 * 两道校验，和 `app/api/admin/fetch-rom` 同口径：
 *   1. `response.ok` —— 挡住 404（Next 对 `public/` 里不存在的文件就是 404）；
 *   2. content-type 不是 `text/*` —— 挡住「用 200 吐错误页」的部署
 *      （Cloudflare 的挑战页就是这么干的），那种 HTML 喂给核心只会更莫名其妙。
 *
 * 还有一道 size === 0 的兜底 —— 空文件存进 IndexedDB 会让页脚显示「已装 BIOS」
 * 而实际跑不起来，比干脆没有更难查。
 */
async function fetchSiteBios(type: BiosType): Promise<File | null> {
  const spec = BIOS_SPECS[type];
  if (!spec.siteUrl || siteBiosMissing.has(type)) return null;

  try {
    const response = await fetch(spec.siteUrl, { cache: 'force-cache' });
    if (!response.ok) {
      siteBiosMissing.add(type);
      return null;
    }
    if (response.headers.get('content-type')?.startsWith('text/')) {
      siteBiosMissing.add(type);
      return null;
    }

    const blob = await response.blob();
    if (blob.size === 0) {
      siteBiosMissing.add(type);
      return null;
    }

    return new File([blob], spec.nameFor(spec.siteUrl), { type: 'application/zip' });
  } catch {
    // 断网 / 请求被掐。同样记成「这次拿不到」，刷新页面后还会再试一次。
    siteBiosMissing.add(type);
    return null;
  }
}

/**
 * 确保手里有一份 BIOS：本地存过就用本地那份，没存过就去站点自带的那份拿，
 * **拿到顺手存下来**（下次直接走本地，不再打网络）。
 *
 * 这是 `getBios()` 的「带兜底」版本，给 ConsoleScene 在**拖入那一刻**用。
 * 它同时承担「装上」和「取出来」两件事，所以拿到东西时调用方还得把页脚那个
 * `bios` state 同步一下（见 ConsoleScene 的 loadFile）。
 *
 * ⚠️ **PS1 那一档正常情况恒为 null**（站点不带、用户也没拖过）—— 那是**预期行为**，
 * 不是故障：pcsx_rearmed 找不到真 BIOS 会回落 HLE，游戏照跑。
 *
 * 拿不到就返回 null —— 表现和以前「没装 BIOS」完全一样，绝不把原本能跑的弄挂。
 */
export async function ensureBios(type: BiosType): Promise<File | null> {
  const local = await getBios(type);
  if (local) return local;

  const site = await fetchSiteBios(type);
  if (!site) return null;

  await putBios(type, site);
  return site;
}

export async function removeBios(type: BiosType): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await run<undefined>(db, 'readwrite', (store) => store.delete(BIOS_SPECS[type].id));
}
