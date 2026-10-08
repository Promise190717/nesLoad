'use client';

import { openDb, run as runOn, STORE_CARTRIDGES } from './db';
import type { ConsoleType } from './emulator';

/** 卡带架里的一盘卡带。 */
export interface Cartridge {
  id: string;
  name: string;
  console: ConsoleType;
  size: number;
  addedAt: number;
  lastPlayedAt: number;
}

/** 落库时多带一个 blob，读出来给模拟器用时再还原成 File。 */
interface CartridgeRecord extends Cartridge {
  blob: Blob;
}

/** 历史只留最近这么多盘，超出的按「最后游玩时间」从旧到新淘汰。 */
export const MAX_CARTRIDGES = 10;

/**
 * 卡带本体是 ROM 文件，动辄几百 KB 到 8 MB，localStorage 塞不下，
 * 所以放 IndexedDB（Blob 原样存，不做 base64 膨胀）。
 *
 * 库的打开逻辑与事务包装都在 lib/db.ts —— 存档槽和卡带共用同一个数据库，
 * 而一个数据库只有一个版本号：两处各自 open 的话，版本对不上的那次会直接抛
 * VersionError。这里只把 store 名绑进来，下面所有调用点都不用改。
 *
 * 拿不到 IndexedDB（隐私模式等）时全程降级为「没有卡带架」，不影响玩游戏。
 */
const run = <T,>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest
): Promise<T | null> => runOn<T>(db, STORE_CARTRIDGES, mode, action);

function toMeta(record: CartridgeRecord): Cartridge {
  return {
    id: record.id,
    name: record.name,
    console: record.console,
    size: record.size,
    addedAt: record.addedAt,
    lastPlayedAt: record.lastPlayedAt,
  };
}

/** 同名同大小同机种视为同一盘卡带，重复载入只刷新时间戳，不产生副本。 */
export function cartridgeId(name: string, size: number, consoleType: ConsoleType): string {
  return `${consoleType}:${size}:${name}`;
}

export async function listCartridges(): Promise<Cartridge[]> {
  const db = await openDb();
  if (!db) return [];
  const records = await run<CartridgeRecord[]>(db, 'readonly', (store) => store.getAll());
  if (!records) return [];
  return records.map(toMeta).sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
}

export async function putCartridge(file: File, consoleType: ConsoleType): Promise<Cartridge | null> {
  const db = await openDb();
  if (!db) return null;

  const id = cartridgeId(file.name, file.size, consoleType);
  const existing = await run<CartridgeRecord>(db, 'readonly', (store) => store.get(id));
  const now = Date.now();

  const record: CartridgeRecord = {
    id,
    name: file.name,
    console: consoleType,
    size: file.size,
    addedAt: existing ? existing.addedAt : now,
    lastPlayedAt: now,
    blob: file,
  };

  const written = await run<IDBValidKey>(db, 'readwrite', (store) => store.put(record));
  return written === null ? null : toMeta(record);
}

/** 取出卡带并还原成 File —— EmulatorController.loadRom 只吃 File。 */
export async function readCartridge(id: string): Promise<File | null> {
  const db = await openDb();
  if (!db) return null;

  const record = await run<CartridgeRecord>(db, 'readonly', (store) => store.get(id));
  if (!record || !record.blob) return null;

  return new File([record.blob], record.name, { type: 'application/octet-stream' });
}

export async function removeCartridge(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await run<undefined>(db, 'readwrite', (store) => store.delete(id));
}

/**
 * 超出上限的卡带直接删掉。
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
