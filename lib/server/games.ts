/*
 * 游戏元数据（games 表）的读写。
 *
 * DB 里存的是 R2 对象 key（rom_url）与图片公网 URL（image_url）；对外的 Game
 * 结构把列名转成前端友好的 camelCase，且**不**把 rom_url 暴露出去（前台按 id 走代理取 ROM）。
 */

import type { ConsoleType } from '@/lib/emulator';
import { query } from './d1';

/** DB 行（snake_case）。 */
export interface GameRow {
  id: string;
  title: string;
  image_url: string;
  rom_url: string;
  rom_name: string;
  console_type: ConsoleType;
  language: string | null;
  series: string | null;
  year: number | null;
  developer: string | null;
  created_at: number;
}

/** 对外结构（camelCase，供 API / 前端）。 */
export interface Game {
  id: string;
  title: string;
  imageUrl: string;
  romName: string;
  consoleType: ConsoleType;
  language: string | null;
  series: string | null;
  year: number | null;
  developer: string | null;
  createdAt: number;
}

function toGame(row: GameRow): Game {
  return {
    id: row.id,
    title: row.title,
    imageUrl: row.image_url,
    romName: row.rom_name,
    consoleType: row.console_type,
    language: row.language,
    series: row.series,
    year: row.year,
    developer: row.developer,
    createdAt: row.created_at,
  };
}

export async function listGames(): Promise<Game[]> {
  const rows = await query<GameRow>('SELECT * FROM games ORDER BY created_at DESC');
  return rows.map(toGame);
}

export async function getGameRow(id: string): Promise<GameRow | null> {
  const rows = await query<GameRow>('SELECT * FROM games WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export interface NewGame {
  /** 由调用方生成：上传前要先拿它拼 R2 对象 key，所以 id 不能在插入时才产生。 */
  id: string;
  title: string;
  imageUrl: string;
  romKey: string;
  romName: string;
  consoleType: ConsoleType;
  language: string | null;
  series: string | null;
  year: number | null;
  developer: string | null;
}

export async function insertGame(input: NewGame): Promise<Game> {
  const { id } = input;
  const createdAt = Date.now();
  await query(
    `INSERT INTO games
       (id, title, image_url, rom_url, rom_name, console_type, language, series, year, developer, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.title,
      input.imageUrl,
      input.romKey,
      input.romName,
      input.consoleType,
      input.language,
      input.series,
      input.year,
      input.developer,
      createdAt,
    ]
  );
  return {
    id,
    title: input.title,
    imageUrl: input.imageUrl,
    romName: input.romName,
    consoleType: input.consoleType,
    language: input.language,
    series: input.series,
    year: input.year,
    developer: input.developer,
    createdAt,
  };
}

/** 单条游戏的元数据修改。封面与 ROM 不在可改范围内（要换只能删了重加）。 */
export interface GamePatch {
  title: string;
  consoleType: ConsoleType;
  language: string | null;
  series: string | null;
  year: number | null;
  developer: string | null;
}

export async function updateGame(id: string, patch: GamePatch): Promise<void> {
  await query(
    `UPDATE games
        SET title = ?, console_type = ?, language = ?, series = ?, year = ?, developer = ?
      WHERE id = ?`,
    [
      patch.title,
      patch.consoleType,
      patch.language,
      patch.series,
      patch.year,
      patch.developer,
      id,
    ]
  );
}

export async function deleteGame(id: string): Promise<void> {
  await query('DELETE FROM games WHERE id = ?', [id]);
}