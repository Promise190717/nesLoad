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
 * 判断拖进来的是不是 Neo Geo BIOS。
 *
 * **只看文件名，不翻内容。** 这条规则是刻意收窄的。
 *
 * 翻内容（找 `sfix.sfix` / `sm1.sm1` 这类特征成员）看着更聪明，但会把「把 BIOS 合进
 * 包里的整合版 romset」整盘认成 BIOS —— 文件被存进 `bios` store、游戏却没启动，
 * 界面上就是「拖进去毫无反应」。**误判比漏判难查得多**：漏判只是走回原来的失败路径
 * （页脚会提示需要 neogeo.zip），误判是把一盘本来能玩的卡带藏起来。
 *
 * `startsWith` 而不是全等：`neogeo.zip` / `neogeo-bios.zip` / `neogeo(1).zip` 都算。
 * 游戏 romset 不会用 neogeo 开头命名，所以不会误伤。
 */
export function isNeoGeoBios(file: File): boolean {
  return file.name.toLowerCase().replace(/\.[^.]+$/, '').startsWith('neogeo');
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
