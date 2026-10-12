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

/** 每页条数的上限。前台在线库与后台列表共用，顺手把「一次全捞」的口子堵死。 */
export const MAX_PAGE_SIZE = 100;

/** 分页筛选条件。`consoleType` 为 null / 省略 = 不限机种。 */
export interface GamePageQuery {
  /** 模糊匹配 title / developer / series（不区分大小写） */
  keyword?: string;
  consoleType?: ConsoleType | null;
}

/**
 * 「搜索」用的模糊匹配：跨 title / developer / series 的**不区分大小写**
 * 子串包含（`LIKE` 默认就对 ASCII 不区分大小写）。
 *
 * 为什么不在 JS 里 filter：一旦按页取数，本地 filter 就只能筛当页那几条 ——
 * 翻页会换一批结果，等于没搜。所以关键词随查询一起下发。
 *
 * ⚠️ **刻意不匹配 `language`**。那一列存的是短码（`zh` / `en`），实测 58 条里 53 条是
 * `en` —— 一旦纳入，任何含这两个字母的词（英文标题、`en`、`nes`…）都会命中大半数库，
 * 搜索框等于失灵。语言筛选该做成独立的下拉/标签，而不是塞进关键词里。
 *
 * `json_each` 那条 OR 是为了可读性：等价于把几个 COALESCE 串起来，但增删字段更不容易写错。
 *
 * ⚠️ **它内部把绑定值写死成 `?1`**（同一条件里出现多次，复用同一个值）。
 * 所以调用方必须保证「关键词」是**第 1 个**绑定参数 —— 见 `listGamesPage` 里拼条件的顺序。
 */
const SEARCH_CONDITION = `(
  title LIKE ?1 OR
  developer LIKE ?1 OR
  series LIKE ?1 OR
  EXISTS (
    SELECT 1 FROM json_each(json_array(
      COALESCE(title, ''), COALESCE(developer, ''), COALESCE(series, '')
    )) WHERE json_each.value LIKE ?1
  )
)`;

/**
 * 分页读取。前台在线库（`/api/games`）与后台列表（`/api/admin/games`）共用这一个入口。
 *
 * 排序键**不能只是 `created_at DESC`**：它是毫秒时间戳，批量 / 并发上传时很容易撞上
 * 同值，而 SQLite 对并列行不保证跨查询的顺序稳定 —— 那会出现「某条在第 1 页和第 2 页
 * 各出现一次，另一条谁也见不着」。用 `id` 做第二排序键兜底。
 *
 * `total` 与数据一起返回：让调用方能算出总页数，不必再为分页单开一个接口。
 *
 * 越界时（最后一页被删空了）**夹回最后一页**，并把夹过的 `offset` 一并返回 ——
 * 调用方以返回值为准，别拿自己请求时那个去算页码。
 *
 * ⚠️ **`total` 与数据用同一个 `safeOffset`，不能各算各的**。调用方拿 `total` 算页数、
 * 拿 `offset` 算页码，两者必须描述**同一批数据**，否则页码会与实际显示的条目错位。
 * 踩过的坑：`total` 取的是**全局**条数，而 `offset` 被夹到全局最后一页 —— 删干净某一页时
 * 全局最后一页可能仍算得出来（只差 deflection 一条），于是那一页是空的，而调用方按
 * `total` 算出的页码还指着它 ⇒ 界面停在**永远空的一页**上，再删也出不来。
 * 只有这一页确实空了（`rows.length === 0`）才回退到上一页，一次退到位。
 */
export async function listGamesPage(
  offset: number,
  limit: number,
  { keyword = '', consoleType = null }: GamePageQuery = {}
): Promise<{ games: Game[]; total: number; offset: number; limit: number }> {
  const needle = keyword.trim();

  const conditions: string[] = [];
  /** 绑定值，按占位符编号顺序排。 */
  const params: unknown[] = [];

  if (needle) {
    // SEARCH_CONDITION 内部写死 ?1，所以它必须排在第一个（见那边的注释）
    conditions.push(SEARCH_CONDITION);
    params.push(`%${needle}%`);
  }
  if (consoleType) {
    conditions.push(`console_type = ?${params.length + 1}`);
    params.push(consoleType);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = Number(
    (
      await query<{ total: number }>(`SELECT COUNT(*) AS total FROM games ${where}`, params)
    )[0]?.total ?? 0
  );

  const lastOffset = Math.max(0, Math.ceil(total / limit) - 1) * limit;
  let safeOffset = Math.min(offset, lastOffset);

  const select = (at: number) =>
    query<GameRow>(
      `SELECT * FROM games ${where}
        ORDER BY created_at DESC, id DESC LIMIT ?${params.length + 1} OFFSET ?${params.length + 2}`,
      [...params, limit, at]
    );

  let rows = await select(safeOffset);

  // 夹到的「最后一页」竟然还是空的 —— 说明上一次夹取落在的那一页被删空过，
  // 一次退到真正的上一页。只可能发生在「末页刚被删空」这一瞬间，最多退一页。
  if (rows.length === 0 && safeOffset > 0) {
    safeOffset = Math.max(0, safeOffset - limit);
    rows = await select(safeOffset);
  }

  return { games: rows.map(toGame), total, offset: safeOffset, limit };
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