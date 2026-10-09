'use client';

import { openDb, run as runOn, STORE_BIOS } from './db';

/*
 * 街机 BIOS。
 *
 * FBNeo 跑 Neo Geo 游戏（合金弹头、拳皇、侍魂…）时要去 system 目录里找 `neogeo.zip`，
 * 拿不到就**直接不加载** —— 表现和「romset 版本对不上」一模一样：静默，屏幕继续出雪花。
 * CPS1 / CPS2 那类（三国志、街霸、名将）不需要 BIOS，所以「有的街机能跑有的不能」
 * 不是玄学，是这两类的区别。
 *
 * 这盘 BIOS 必须由用户自己提供：它是有版权的 ROM，仓库里不能放，也不从任何地方自动下载。
 * 装上它的方式和拖卡带完全一样 —— 把 neogeo.zip 拖进页面就行，认出来就存起来。
 *
 * 存取规则和卡带 / 存档一致：**引擎层不碰存储**，这里只负责「存下来 / 取出来」，
 * 由 ConsoleScene 在启动街机时取出来交给 EmulatorController。
 */

/** 全项目只存一份 BIOS。将来要支持别的机种（PGM 之类）再改成按机种分 key。 */
const BIOS_ID = 'neogeo';

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
 * neogeo.zip 里必有的几个文件名。
 *
 * `sfix.sfix`（图形 ROM）和 `sm1.sm1`（Z80 程序）是每一份 neogeo.zip 都有的，
 * 拿它们判断足够，也不会误伤普通 romset —— 游戏自己的 zip 里不会出现这两个名字。
 */
const BIOS_MEMBERS = [
  'sfix.sfix',
  'sm1.sm1',
  '000-lo.lo',
  'sp-s2.sp1',
  'sp-s.sp1',
  'sp-u2.sp1',
];

/** 在字节里找一段 ASCII（zip 的文件名是明文存的，不压缩）。 */
function containsAscii(bytes: Uint8Array, needle: string): boolean {
  const first = needle.charCodeAt(0);
  const limit = bytes.length - needle.length;

  outer: for (let i = 0; i <= limit; i += 1) {
    if (bytes[i] !== first) continue;
    for (let j = 1; j < needle.length; j += 1) {
      if (bytes[i + j] !== needle.charCodeAt(j)) continue outer;
    }
    return true;
  }

  return false;
}

/**
 * 判断拖进来的是不是 Neo Geo BIOS。
 *
 * 先看文件名（`neogeo.zip` 是最常见的拿法），认不出再翻内容 —— zip 的本地文件头在开头、
 * 中央目录在结尾，两段各取 128 KB 就够覆盖到那些特征文件名了，不必把整个文件读进来。
 */
export async function isNeoGeoBios(file: File): Promise<boolean> {
  const base = file.name.toLowerCase().replace(/\.[^.]+$/, '');
  if (base === 'neogeo' || base === 'neogeo-bios' || base === 'neogeo_bios') return true;

  const chunk = 0x20000;
  const head = new Uint8Array(await file.slice(0, chunk).arrayBuffer());
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - chunk)).arrayBuffer());

  return BIOS_MEMBERS.some(
    (member) => containsAscii(head, member) || containsAscii(tail, member)
  );
}

export async function putBios(file: File): Promise<BiosInfo | null> {
  const db = await openDb();
  if (!db) return null;

  const record: BiosRecord = {
    id: BIOS_ID,
    name: file.name,
    size: file.size,
    addedAt: Date.now(),
    blob: file,
  };

  const written = await run<IDBValidKey>(db, 'readwrite', (store) => store.put(record));
  if (written === null) return null;

  return { name: record.name, size: record.size, addedAt: record.addedAt };
}

export async function getBiosInfo(): Promise<BiosInfo | null> {
  const db = await openDb();
  if (!db) return null;

  const record = await run<BiosRecord>(db, 'readonly', (store) => store.get(BIOS_ID));
  if (!record) return null;

  return { name: record.name, size: record.size, addedAt: record.addedAt };
}

/** 取出 BIOS 交给模拟器。文件名由调用方钉死（见 NEOGEO_BIOS_NAME）。 */
export async function getBios(): Promise<File | null> {
  const db = await openDb();
  if (!db) return null;

  const record = await run<BiosRecord>(db, 'readonly', (store) => store.get(BIOS_ID));
  if (!record || !record.blob) return null;

  return new File([record.blob], NEOGEO_BIOS_NAME, { type: 'application/zip' });
}

export async function removeBios(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await run<undefined>(db, 'readwrite', (store) => store.delete(BIOS_ID));
}
