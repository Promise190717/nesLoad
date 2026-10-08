'use client';

import { openDb, run, STORE_SAVES } from './db';

/**
 * 每个游戏最多留这么多份存档。再存一份就顶掉最早的那份 ——
 * 淘汰规则就是「写入后按时间倒序只保留前 MAX_SAVES 条」，
 * 所以「覆盖最早的一个」是这条规则的推论，不需要另外判重。
 */
export const MAX_SAVES = 5;

/** 槽位元信息。列表只读这个，快照本体不跟着进内存。 */
export interface SaveSlot {
  id: string;
  romName: string;
  createdAt: number;
}

interface SaveRecord extends SaveSlot {
  /**
   * 快照本体。存 Blob 而不是 base64：后者要膨胀 33%，
   * 而 IndexedDB 本来就支持 Blob，没必要绕一圈。
   */
  state: Blob;
}

/**
 * 早期版本把存档按 `nesload:state:<ROM 文件名>` 存在 localStorage 里，每个游戏只有一份。
 * 升级成槽位制之后读列表时顺手把它搬进来，免得旧存档凭空消失。
 * 只在「这个游戏一个槽都没有」时搬，搬完就删掉旧键（已经没有读者了）。
 */
const LEGACY_PREFIX = 'nesload:state:';

/** crypto.randomUUID 需要安全上下文（localhost 也算）；没有就退回时间戳 + 随机数。 */
function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function base64ToBytes(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function toSlot(record: SaveRecord): SaveSlot {
  return { id: record.id, romName: record.romName, createdAt: record.createdAt };
}

async function readRecords(db: IDBDatabase, romName: string): Promise<SaveRecord[]> {
  const records = await run<SaveRecord[]>(db, STORE_SAVES, 'readonly', (store) =>
    store.index('romName').getAll(romName)
  );
  return records ?? [];
}

/** 新的在前 —— 列表和淘汰都用这个顺序。 */
function byNewest(records: SaveRecord[]): SaveRecord[] {
  return [...records].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * 某个游戏的全部存档槽，新的在前。
 * 第一次读某个游戏时若发现它一个槽都没有，会先尝试把旧格式的存档搬过来。
 */
export async function listSaves(romName: string): Promise<SaveSlot[]> {
  const db = await openDb();
  if (!db) return [];

  let records = await readRecords(db, romName);
  if (records.length === 0) {
    await migrateLegacy(romName);
    records = await readRecords(db, romName);
  }
  return byNewest(records).map(toSlot);
}

async function migrateLegacy(romName: string): Promise<void> {
  let legacy: string | null = null;
  try {
    legacy = localStorage.getItem(LEGACY_PREFIX + romName);
  } catch {
    return; // 隐私模式下连读都读不了，当作没有旧存档
  }
  if (!legacy) return;

  try {
    const bytes = base64ToBytes(legacy);
    const saved = await saveSlot(romName, new Blob([bytes], { type: 'application/octet-stream' }));
    // 存不下就把旧键留着 —— 下次还有机会，总比直接丢掉强
    if (saved) localStorage.removeItem(LEGACY_PREFIX + romName);
  } catch (e) {
    console.warn('旧存档迁移失败', e);
  }
}

/**
 * 写一份新存档，并把超出上限的最旧几份淘汰掉。
 * 每次存档都开一个新槽（时间是唯一的区分方式），不做同名覆盖。
 */
export async function saveSlot(romName: string, state: Blob): Promise<SaveSlot | null> {
  const db = await openDb();
  if (!db) return null;

  const record: SaveRecord = { id: newId(), romName, createdAt: Date.now(), state };
  const written = await run<IDBValidKey>(db, STORE_SAVES, 'readwrite', (store) => store.put(record));
  if (written === null) return null;

  // 淘汰：byNewest 之后 slice(MAX_SAVES) 拿到的就是最早的那几份
  for (const stale of byNewest(await readRecords(db, romName)).slice(MAX_SAVES)) {
    await run<undefined>(db, STORE_SAVES, 'readwrite', (store) => store.delete(stale.id));
  }

  return toSlot(record);
}

/** 取出某一份快照，交给模拟器载入。 */
export async function readSave(id: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  const record = await run<SaveRecord>(db, STORE_SAVES, 'readonly', (store) => store.get(id));
  return record?.state ?? null;
}
