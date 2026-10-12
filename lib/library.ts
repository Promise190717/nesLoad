'use client';

import { openDb, run as runOn, STORE_CARTRIDGES } from './db';
import type { ConsoleType } from './emulator';

/**
 * 「从在线库载入一盘游戏」需要的全部信息 —— **全是字符串**。
 *
 * 2026-10-12 改造：卡带历史原先把 ROM 的 Blob 本体直接存进 IndexedDB（动辄几百 KB
 * 到几十 MB），而且只记本机拖进来的那批 —— 在线库点开的反而没进历史。
 * 现在反过来：**只有从游戏库点开的游戏才进历史**，存的就是这张表 ——
 * 名字、封面地址、ROM 下载地址、文件名。点历史里的一行 = 照着地址重新下一遍。
 *
 * `romName` 必须留着：街机的 FBNeo 拿 zip 文件名当驱动名，重新下载后要原样带上，
 * 不然会静默失败（console 里只有一句「Romset is unknown.」）。
 */
export interface RemoteRom {
  /** 在线库那条游戏的 id（`/api/games` 里的 `id`），同时也是历史记录的键 */
  id: string;
  /** 展示名 —— 用游戏标题，不是文件名（历史里那一行读的是它） */
  name: string;
  /** ROM 下载地址（本站代理 `/api/games/{id}/rom`） */
  romUrl: string;
  /** 封面地址；没有封面就是空串（历史行里那个缩略图据此不渲染） */
  imageUrl: string;
  /** ROM 文件名。街机靠它认驱动，重新下载必须原样带上 */
  romName: string;
  console: ConsoleType;
}

/**
 * 历史里的一行 = `RemoteRom` + 两个时间戳。
 *
 * **没有 blob 字段** —— 这正是这次改造的目的。历史是纯字符串记录，
 * 一条记录几百字节，IndexedDB 里不再躺着几 MB 的 ROM 本体。
 */
export interface Cartridge extends RemoteRom {
  /** 第一次载入的时间。同一盘再载入时保留原值，不刷新 */
  addedAt: number;
  /** 最后一次载入的时间。历史按它倒序，也是淘汰的依据 */
  lastPlayedAt: number;
}

/** 历史只留最近这么多条，超出的按「最后游玩时间」从旧到新淘汰。 */
export const MAX_CARTRIDGES = 10;

/**
 * 库的打开逻辑与事务包装都在 lib/db.ts —— 历史、存档槽和 BIOS 共用同一个数据库，
 * 而一个数据库只有一个版本号：两处各自 open 的话，版本对不上的那次会直接抛
 * VersionError。这里只把 store 名绑进来，下面所有调用点都不用改。
 *
 * 拿不到 IndexedDB（隐私模式等）时全程降级为「没有历史」，不影响玩游戏。
 */
const run = <T,>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest
): Promise<T | null> => runOn<T>(db, STORE_CARTRIDGES, mode, action);

/** 按「最后游玩时间」倒序 —— 列表显示和淘汰都吃这个顺序。 */
export async function listCartridges(): Promise<Cartridge[]> {
  const db = await openDb();
  if (!db) return [];
  const records = await run<Cartridge[]>(db, 'readonly', (store) => store.getAll());
  if (!records) return [];
  return records.sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
}

/**
 * 记一条历史。同一盘（同一个游戏 id）再载入 = 覆盖写，只刷新 `lastPlayedAt`，
 * 于是它自然排到最前面，超出 10 条的旧记录被 `pruneCartridges` 淘汰。
 *
 * 只写字符串，不碰 ROM 本体。写入成功才返回记录 —— 拿不到 IndexedDB 时返回 null，
 * 调用方（载入流程）照样把游戏跑起来，只是历史里不留痕。
 */
export async function putCartridge(rom: RemoteRom): Promise<Cartridge | null> {
  const db = await openDb();
  if (!db) return null;

  const existing = await run<Cartridge>(db, 'readonly', (store) => store.get(rom.id));
  const now = Date.now();

  /*
   * 逐字段挑着写，不用 `...rom` 展开：这样把一个完整的 `Cartridge`（历史行自己）
   * 传进来也不会把它旧的两个时间戳一起带进新记录。
   */
  const record: Cartridge = {
    id: rom.id,
    name: rom.name,
    romUrl: rom.romUrl,
    imageUrl: rom.imageUrl,
    romName: rom.romName,
    console: rom.console,
    addedAt: existing?.addedAt ?? now,
    lastPlayedAt: now,
  };

  const written = await run<IDBValidKey>(db, 'readwrite', (store) => store.put(record));
  return written === null ? null : record;
}

export async function removeCartridge(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await run<undefined>(db, 'readwrite', (store) => store.delete(id));
}

/**
 * 超出上限的记录直接删掉。
 * listCartridges 已按 lastPlayedAt 倒序，所以 slice(limit) 拿到的就是最旧的那批。
 */
export async function pruneCartridges(limit = MAX_CARTRIDGES): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const all = await listCartridges();
  for (const stale of all.slice(limit)) {
    await run<undefined>(db, 'readwrite', (store) => store.delete(stale.id));
  }
}
