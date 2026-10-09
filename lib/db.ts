'use client';

/**
 * 卡带库与存档槽共用同一个 IndexedDB。
 *
 * 打开逻辑必须集中在这里：一个数据库只有一个版本号，若两个模块各自
 * `indexedDB.open('nesload', 1)` 和 `('nesload', 2)`，版本对不上的那一次会直接抛
 * VersionError —— 而且抛在 open() 的同步阶段，外面那句 try/catch 拦不住，
 * 会变成一个没人处理的异常。所以全项目只留这一个 openDb()。
 *
 * 拿不到 IndexedDB（隐私模式等）时全程返回 null，调用方各自降级，
 * 最差的情况是「没有卡带架、存档存不下」，但游戏本身照常能玩。
 */

const DB_NAME = 'nesload';

/** 版本 1 只有 cartridges；版本 2 加了 saves（存档槽）；版本 3 加了 bios（街机 BIOS）。 */
const DB_VERSION = 3;

export const STORE_CARTRIDGES = 'cartridges';
export const STORE_SAVES = 'saves';
export const STORE_BIOS = 'bios';

let dbPromise: Promise<IDBDatabase | null> | null = null;

export function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      // 只补缺的，不动已有的：从版本 1 升上来的库里 cartridges 还在，
      // 只是多一个 saves 而已。
      if (!db.objectStoreNames.contains(STORE_CARTRIDGES)) {
        db.createObjectStore(STORE_CARTRIDGES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SAVES)) {
        const store = db.createObjectStore(STORE_SAVES, { keyPath: 'id' });
        // 存档是按 ROM 文件名分组的，列表要靠这个索引按游戏取。
        store.createIndex('romName', 'romName');
      }
      if (!db.objectStoreNames.contains(STORE_BIOS)) {
        // BIOS 全项目只存一份，key 固定（见 lib/bios.ts），不需要索引。
        db.createObjectStore(STORE_BIOS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

/**
 * 在指定 store 上跑一次请求。
 * 任何失败都收敛成 null —— 调用方只需要知道「有没有拿到」，不需要区分是
 * 没装库、还是事务被 abort 了。
 */
export function run<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest
): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    try {
      const transaction = db.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => resolve(null);
      transaction.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
