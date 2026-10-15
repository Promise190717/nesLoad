'use client';

import { openDb, run, STORE_SAVES } from './db';

/** 每个 ROM 保留一份存档，主键为 ROM 文件名；put 覆盖旧档。新存档为压缩快照。 */

/** 读出来的一份存档：字节 + 落盘时间（列表上要显示「什么时候存的」）。 */
export interface SaveInfo {
  data: Blob;
  createdAt: number;
}

/** 新记录的 id 恒等于 romName；老槽位记录可能使用 UUID。 */
interface StoredSave {
  id: string;
  romName: string;
  createdAt: number;
  /** 存档字节。存 Blob 而不是 base64：后者要膨胀 33%，而 IndexedDB 本来就支持 Blob。 */
  data?: Blob;
  /** 兼容早期快照槽位的字段名。 */
  state?: Blob;
}

/**
 * 更早的存法：整份快照塞在 localStorage 的 `nesload:state:<ROM 文件名>` 里。
 * 显式删除该游戏存档时同时清理这个旧键。
 */
const LEGACY_PREFIX = 'nesload:state:';

async function readRecords(db: IDBDatabase, romName: string): Promise<StoredSave[]> {
  const records = await run<StoredSave[]>(db, STORE_SAVES, 'readonly', (store) =>
    store.index('romName').getAll(romName)
  );
  return records ?? [];
}

/**
 * 取这个游戏的那一份存档，没有就返回 `null`。
 *
 * 兼容槽位制的快照字段；旧记录只在成功写入新存档后清理。
 */
export async function readSave(romName: string): Promise<SaveInfo | null> {
  const db = await openDb();
  if (!db) return null;

  const records = await readRecords(db, romName);
  let found: SaveInfo | null = null;
  for (const record of byNewest(records)) {
    const data = record.data ?? record.state;
    if (data) {
      found = { data, createdAt: record.createdAt };
      break;
    }
  }

  return found;
}

/**
 * 写入这一款游戏的存档，覆盖上一份。返回是否落盘成功 ——
 * 拿不到 IndexedDB（隐私模式等）时是 `false`，调用方据此退化成「下载成文件」。
 */
export async function writeSave(romName: string, data: Blob): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;

  const record: StoredSave = { id: romName, romName, createdAt: Date.now(), data };
  const written = await run<IDBValidKey>(db, STORE_SAVES, 'readwrite', (store) =>
    store.put(record)
  );
  if (written === null) return false;

  /*
   * 主键已经保证只有一条，这里清的是**槽位制时代的老记录**：它们 id 是 UUID，
   * 按 romName 索引照样查得到，不清掉下次读时又会被翻出来。
   */
  for (const stale of await readRecords(db, romName)) {
    if (stale.id !== romName) {
      await run<undefined>(db, STORE_SAVES, 'readwrite', (store) => store.delete(stale.id));
    }
  }
  return true;
}

/**
 * 删掉这一款的本机存档（连同老记录一起）。拿不到 IndexedDB 时返回 `false`。
 *
 * 云端那份的删除走 `/api/user/saves/<id>` DELETE，两套存储互不知晓 ——
 * 和写入时「本机为主、云端补充」是同一条分界线。
 */
export async function deleteSave(romName: string): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;

  for (const stale of await readRecords(db, romName)) {
    await run<undefined>(db, STORE_SAVES, 'readwrite', (store) => store.delete(stale.id));
  }
  try {
    localStorage.removeItem(LEGACY_PREFIX + romName);
  } catch {
    // 同上，删不掉也无害
  }
  return true;
}

/** 新的在前。老记录混在新记录里时，靠它挑出真正该留下的那一条。 */
function byNewest(records: StoredSave[]): StoredSave[] {
  return [...records].sort((a, b) => b.createdAt - a.createdAt);
}
