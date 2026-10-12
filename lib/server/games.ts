/*
 * 游戏元数据（games 表）的读写。
 *
 * DB 里存的是 R2 对象 key（rom_url）与图片公网 URL（image_url）；对外的 Game
 * 结构把列名转成前端友好的 camelCase，且**不**把 rom_url 暴露出去（前台按 id 走代理取 ROM）。
 */

import { unstable_cache } from 'next/cache';
import type { ConsoleType } from '@/lib/emulator';
import { query } from './d1';
import { getDeveloperRow } from './developers';

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
  /** 开发商外键（可空）。空 = 没接上开发商库，只有 `developer` 那列文字。 */
  developer_id: string | null;
  description: string | null;
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
  /** 开发商页的地址片段（`/developers/<id>`）。为 null 时详情页那个名字就不做链接。 */
  developerId: string | null;
  /** 说明 / 简介（可空）。前台只拿它当卡片上的悬停提示，不进列表正文。 */
  description: string | null;
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
    developerId: row.developer_id,
    description: row.description,
    createdAt: row.created_at,
  };
}

export async function listGames(): Promise<Game[]> {
  const rows = await query<GameRow>('SELECT * FROM games ORDER BY created_at DESC');
  return rows.map(toGame);
}

/** 每页条数的上限。前台在线库与后台列表共用，顺手把「一次全捞」的口子堵死。 */
export const MAX_PAGE_SIZE = 100;

/** 分页筛选条件。`consoleType` 为 null / 省略 = 不限机种；`developerId` 同理。 */
export interface GamePageQuery {
  /** 模糊匹配 title / developer / series（不区分大小写） */
  keyword?: string;
  consoleType?: ConsoleType | null;
  /**
   * 只取某个开发商名下的游戏（开发商页在用）。
   *
   * 用**外键**筛而不是拿名字去 `LIKE`：名字是快照列，改一个字就全断，
   * 而外键是稳定的 —— 用户要的「点开发商出他名下所有游戏」正是靠这一条。
   */
  developerId?: string | null;
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
  { keyword = '', consoleType = null, developerId = null }: GamePageQuery = {}
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
  if (developerId) {
    conditions.push(`developer_id = ?${params.length + 1}`);
    params.push(developerId);
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

/**
 * `/games` 列表页的数据缓存时长（秒）。**这个数只写在这里**，页面那边读常量。
 *
 * 30 分钟是用户 2026-10-12 定的。这一页的味道偏向「静态页」：给搜索引擎和过路访客看，
 * 内容变一次要等后台传新游戏，而每次渲染却要打**两次 D1**（COUNT + SELECT，见上）。
 * 半小时的代价是「后台上传的新游戏最多晚半小时才出现在列表页上」——
 * 对一个自助收录的站点，这个交换是划算的。
 */
export const GAMES_PAGE_REVALIDATE_SECONDS = 1800;

/**
 * 带缓存的列表读取 —— **只给 `/games` 列表页用**，别处的调用方继续用 `listGamesPage`。
 *
 * ⚠️ 为什么不直接在 `listGamesPage` 里加缓存：那个函数被三个地方共用 ——
 * 前台在线库弹窗（`/api/games`）、后台列表（`/api/admin/games`）、以及列表页。
 * 后两个**必须立刻看到刚上传的数据**（后台传完一款游戏，列表里却要等半小时才出现，
 * 那是 bug 不是缓存）。所以缓存是**页面这一侧的策略**，不该下沉到数据层。
 *
 * 参数刻意都是**扁平的基本类型**（offset / limit / keyword），而不是收一个
 * `GamePageQuery` 对象：`unstable_cache` 把入参当作缓存键的一部分，扁平参数拼出来的键
 * 稳定可读，传对象则依赖属性的序列化顺序，将来加个字段可能悄悄改变键、把缓存打散。
 * 列表页没有机种筛选（`consoleType` 只有房间那个弹窗在用），所以这里不收它。
 *
 * 缓存键里**不含语言**，这是对的：返回的 `Game` 全部是库里的原文（标题、说明、
 * 开发者……库本身就只存一份），跟 cookie 无关；语言只决定界面文案，那部分照常每次渲染。
 * 也就是说中英文访客共用同一份缓存是**有意**的，不是漏了一个维度。
 */
export const listGamesPageCached = unstable_cache(
  async (offset: number, limit: number, keyword: string) =>
    listGamesPage(offset, limit, { keyword }),
  ['games:list'],
  { revalidate: GAMES_PAGE_REVALIDATE_SECONDS }
);

/**
 * 开发商详情页那段「他名下的游戏」—— 和列表页同一个 TTL、同一个理由（见上）。
 *
 * 单独一个函数、单独一套键前缀（`games:by-developer`），而不是给
 * `listGamesPageCached` 加第四个参数：那个函数是 `/games` 列表页在用，
 * 键的形状不该为了另一个页面而变（改了会让线上那份缓存白失效一轮，
 * 也让「缓存键有哪几维」这件事更难一眼看清）。
 *
 * ⚠️ 开发商**本身**（名字 / 简介 / 介绍）**没有缓存** —— 它只是一次单行查询，
 * 而且后台改完名字应当立刻在页面上看到。有缓存的是「这个开发商名下有哪些游戏」。
 */
export const listGamesByDeveloperCached = unstable_cache(
  async (developerId: string, offset: number, limit: number) =>
    listGamesPage(offset, limit, { developerId }),
  ['games:by-developer'],
  { revalidate: GAMES_PAGE_REVALIDATE_SECONDS }
);

export async function getGameRow(id: string): Promise<GameRow | null> {
  const rows = await query<GameRow>('SELECT * FROM games WHERE id = ?', [id]);
  return rows[0] ?? null;
}

/**
 * 按 id 取一条**对外结构**的游戏。
 *
 * 和 `getGameRow` 的分工：那个返回数据库原始行（带 `rom_url`，只有服务端自己用），
 * 这个返回 `Game` —— 也就是 `/api/games` 列表里每一条的形状，**不含** rom_url。
 *
 * 给两条路用：① 公开的单条接口 `/api/games/[id]`（首页的 `?id=` 深链靠它取数据）；
 * ② 游戏详情页 / 下载页（那两个是服务端组件，直接调这个，不走 HTTP 绕一圈）。
 *
 * 详情页那条也刻意走这里而不是 getGameRow：换来的是「详情页看到的字段」
 * 和「接口吐出来的字段」天然一致 —— 多一个字段少一个字段不会只在一边生效。
 */
export async function getGame(id: string): Promise<Game | null> {
  const row = await getGameRow(id);
  return row ? toGame(row) : null;
}

/**
 * 全部游戏的「骨架」（只有 id 与创建时间），给 sitemap 用。
 *
 * 为什么不复用 `listGamesPage`：那个会 `SELECT *`（带上封面 URL / ROM key 一堆用不上的列）
 * 而且被 `MAX_PAGE_SIZE` 卡在 100 条 —— sitemap 恰恰是要**一条不漏**地列全。
 * 这里只取两列，几百上千条也就几十 KB。
 *
 * 排序和列表一致（`created_at DESC, id DESC`），这样 sitemap 里的顺序和站点上的顺序对得上。
 *
 * `LIMIT` 上界是防呆：真到几十万条时 sitemap 本身也该拆索引了（`sitemap.xml` 单文件
 * 有 5 万条 / 50 MB 的硬上限）。现在的量级离它很远，先按一个宽松的上界兜住。
 */
export async function listGameStubs(): Promise<{ id: string; createdAt: number }[]> {
  const rows = await query<{ id: string; created_at: number }>(
    'SELECT id, created_at FROM games ORDER BY created_at DESC, id DESC LIMIT 20000'
  );
  return rows.map((row) => ({ id: row.id, createdAt: row.created_at }));
}

/**
 * 由开发商 id 反查名字 —— `games.developer`（快照列）要跟着一起写。
 *
 * 为什么放在这里、而不是让接口层各传一份名字：`developer` 与 `developer_id`
 * **必须同进同出**（搜索、列表卡片、详情页资料表读的是名字，开发商页读的是 id）。
 * 让调用方自己保证两者一致，早晚会有人只传一个。
 *
 * 认不出的 id 当作「没选」处理（两个都置空），不给库里留一条指向空气的关联。
 */
async function resolveDeveloper(
  developerId: string | null
): Promise<{ id: string | null; name: string | null }> {
  if (!developerId) return { id: null, name: null };
  const row = await getDeveloperRow(developerId);
  return row ? { id: row.id, name: row.name } : { id: null, name: null };
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
  /** 开发商外键（`/api/admin/developers` 那个下拉框选出来的 id）。名字由本模块反查。 */
  developerId: string | null;
  description: string | null;
}

export async function insertGame(input: NewGame): Promise<Game> {
  const { id } = input;
  const createdAt = Date.now();
  const developer = await resolveDeveloper(input.developerId);

  await query(
    `INSERT INTO games
       (id, title, image_url, rom_url, rom_name, console_type, language, series, year, developer, developer_id, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      developer.name,
      developer.id,
      input.description,
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
    developer: developer.name,
    developerId: developer.id,
    description: input.description,
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
  /** 同 `NewGame.developerId`：名字由本模块反查，调用方只给 id。 */
  developerId: string | null;
  description: string | null;
}

export async function updateGame(id: string, patch: GamePatch): Promise<void> {
  const developer = await resolveDeveloper(patch.developerId);

  await query(
    `UPDATE games
        SET title = ?, console_type = ?, language = ?, series = ?, year = ?, developer = ?,
            developer_id = ?, description = ?
      WHERE id = ?`,
    [
      patch.title,
      patch.consoleType,
      patch.language,
      patch.series,
      patch.year,
      developer.name,
      developer.id,
      patch.description,
      id,
    ]
  );
}

export async function deleteGame(id: string): Promise<void> {
  await query('DELETE FROM games WHERE id = ?', [id]);
}