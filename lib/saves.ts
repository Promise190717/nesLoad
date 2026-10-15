'use client';

import { openDb, run, STORE_SAVES } from './db';

/**
 * 一个游戏一份**电池存档**（`.srm`）—— 就是游戏自己在存盘菜单里写的那份卡带记忆。
 *
 * **为什么不再是「每 ROM 五份快照槽」**（2026-10-15 换）：快照是整机状态，体积从
 * KB 级（NES 13.8KB）一路到上百 MB（NDS 的 melonds 快照 >100MB，直接撞 Cloudflare
 * 的 100MB 请求体硬限，见 `.workbuddy/memory/DETAILS.md`），而且**绑死核心版本**。
 * 电池存档只有 KB~MB 级、跨核心版本跨设备都通用 —— 于是「一款一份、后面覆盖前面」
 * 既够用，也不用再看管淘汰规则。
 *
 * ⚠️ **主键就是 ROM 文件名**（`id = romName`）：所以「一款一份」不是靠淘汰规则维持的，
 *    而是结构上不可能有第二份 —— `put` 天生覆盖。这也是这里不再有 `MAX_SAVES` 的原因。
 */

/** 读出来的一份存档：字节 + 落盘时间（列表上要显示「什么时候存的」）。 */
export interface SaveInfo {
  data: Blob;
  createdAt: number;
}

/** 库里的一条记录。`id` 恒等于 `romName`，重复写一份只是为了索引读起来直观。 */interface StoredSave {
  id: string;
  romName: string;
  createdAt: number;
  /** 存档字节。存 Blob 而不是 base64：后者要膨胀 33%，而 IndexedDB 本来就支持 Blob。 */
  data?: Blob;
  /**
   * 槽位制时代的字段名，那时候一条记录是一份**快照**、id 是 UUID、一个 ROM 可以有几条。
   *
   * ⚠️ 它**不参与迁移**：快照的字节不是电池存档的字节，硬当成 `.srm` 注入回去会毁掉
   *    玩家游戏里的存档（比丢掉它更糟）。所以见到这种老记录一律清掉。
   */
  state?: Blob;
}

/**
 * 更早的存法：整份快照塞在 localStorage 的 `nesload:state:<ROM 文件名>` 里。
 * 同样**不迁移**（理由同上），读到某个游戏时顺手把这个键清掉。
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
 * 顺带做两件收尾：清掉槽位制时代留下的老记录、清掉 localStorage 里那个老键。
 * 放在读的时候做，是因为它只在玩家真的打开某个游戏的存档时才付这笔代价。
 */
export async function readSave(romName: string): Promise<SaveInfo | null> {
  const db = await openDb();
  if (!db) return null;

  const records = await readRecords(db, romName);
  let found: SaveInfo | null = null;
  for (const record of byNewest(records)) {
    if (!record.data) {
      // 老快照 —— 丢掉，别让它被当成电池存档注入（见 StoredSave.state 的注释）
      await run<undefined>(db, STORE_SAVES, 'readwrite', (store) => store.delete(record.id));
      continue;
    }
    if (!found) found = { data: record.data, createdAt: record.createdAt };
    else await run<undefined>(db, STORE_SAVES, 'readwrite', (store) => store.delete(record.id));
  }

  try {
    localStorage.removeItem(LEGACY_PREFIX + romName);
  } catch {
    // 隐私模式下连删都删不了，留着也无害
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
