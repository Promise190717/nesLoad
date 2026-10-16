/*
 * 游戏元数据（games 表 + game_texts 侧表）的读写。
 *
 * DB 里存的是 R2 对象 key（rom_url）与图片公网 URL（image_url）；对外的 Game
 * 结构把列名转成前端友好的 camelCase，且**不**把 rom_url 暴露出去（前台按 id 走代理取 ROM）。
 *
 * ## 文案搬进侧表（2026-10-16）
 *
 * 游戏文案（标题 / 系列 / 开发商 / 说明）原来和 games 挤在一张宽表里、**一个语言一对列**
 * （`title` + `title_en`）。那样每加一个语言就要给 games 加 4 列、并且同步改 8 处代码，
 * 于是搬进了 `game_texts`（`group_key + locale` 复合主键，见 db/schema.sql）。
 *
 * ## 为什么主键是 `group_key` 而不是 `game_id`（2026-10-16 同日再改）
 *
 * 一行 `games` 是**一盘 ROM**，不是「一款游戏」：同一款游戏的中 / 英 / 日 / 韩四个语言版本
 * 就是四行（判重是「标题 + 机种 + 语言」三维，语言不同放行）。而文案**四行共享同一份**——
 * 上游抓一次只返回一份，后台也是照一份填的。所以：
 *
 *   · 挂 `game_id`  ⇒ 同一份文案复制四遍（4 行游戏 × 4 个语言 = 16 行），
 *                     后台改一次标题要进四条记录各改一遍；
 *   · 挂 `group_key` ⇒ 一款一份（4 行），改一次就是改整款。
 *
 * `group_key` 由本模块的 `resolveGroupKey()` **独家决定**，接口层与后台表单都不感知：
 * 先按「中文标题 + 机种 + 开发商」反查同款，查到就复用、查不到才新开一个 ——
 * 于是「批量导入四个语言版本」和「过两天手动补一个语言版本」都会自动归到同一款上。
 * 判重（`findGameDuplicate`）与归组（`resolveGroupKey`）刻意用同一套维度，改一处必须改两处。
 *
 * ⚠️ 代价：**改文案等于改整款**。后台在那四个语言版本里随便点开哪一条改标题，
 *    另外三条读到的也是新标题（它们本来就该一样）。这是想要的效果，不是 bug。
 *
 * ⚠️ **`Game` 把库里有的语言全都带出来**（`texts` 那个字典），而不是只给一种。
 *    决定用哪一份是**渲染时**的事，由 `localizeGame(game, locale)` 做。理由：
 *    列表读取走 `unstable_cache`，而**缓存键里没有语言这一维**（见下面那段注释）——
 *    如果数据层按 locale 只返回一种，中英文访客就会共用一份「只有中文」的缓存。
 *    全带出来，缓存与语言无关，取值下放到页面。
 *
 * ⚠️ `localizeGame` 的**回退规则**（实现搬到 lib/game-text.ts，客户端组件也要用同一份）：
 *    **逐字段**回退 —— 目标语言缺哪个字段就用中文原文那一个，不是整份回退。
 *    这样后台只补了一部分英文时，没补的那些仍显示中文，而不是一页空白。
 *    中文站反过来不做回退（原文就是「这一份」）。
 *
 * ⚠️ **games 上那 8 个旧文案列还在，但只写不读**（`title` / `series` / `developer` /
 *    `description` 与各自的 `_en`）：写入路径照旧把它们当**中文 + 英文的投影**一起写
 *    （`title` 那列是 NOT NULL，本来也必须写），读取一律走 `game_texts`。
 *    留着的意义是**回滚退路** —— 万一侧表这条路要退回去，旧列里是完整的中英两份。
 *    代价是同一份数据存了两处，所以**绝不要直接改旧列**：改了不会显示出来。
 */

import { randomUUID } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { cached } from './cache';
import { CONSOLE_TYPES } from '@/lib/consoles';
import type { ConsoleType } from '@/lib/emulator';
import { rawEntityName, type EntityTexts } from '@/lib/entity-text';
import {
  CONTENT_LOCALES,
  EMPTY_GAME_TEXT,
  isBlankGameText,
  localizeTexts,
  type ContentLocale,
  type GameText,
  type GameTexts,
  type LocalizedGameText,
} from '@/lib/game-text';
import type { Locale } from '@/lib/i18n';
import { GAME_LANGUAGE_VALUES } from '@/lib/rom-lang';
import { query } from './d1';
import { getDeveloper } from './developers';

/*
 * 结构和纯函数都在 lib/game-text.ts（客户端组件也要用，不能从服务端模块引）。
 * 这里原样转出去，调用方（页面 / 组件）不必知道它住在哪个文件。
 */
export {
  CONTENT_LOCALES,
  EMPTY_GAME_TEXT,
  localizeTexts,
  type ContentLocale,
  type GameText,
  type GameTexts,
  type LocalizedGameText,
};

/**
 * DB 行（snake_case）。
 *
 * ⚠️ 那 8 个文案列（`title` / `title_en` / `series` / `series_en` / `developer` /
 *    `developer_en` / `description` / `description_en`）**只写不读** —— 它们是
 *    `game_texts` 里中英两份的投影（见文件头那段）。渲染一律走 `Game.texts`。
 */
export interface GameRow {
  id: string;
  title: string;
  title_en: string | null;
  image_url: string;
  /** R2 对象 key。**不存 ROM 时是空串** —— 那时看下面的 `source_url`。 */
  rom_url: string;
  /**
   * 源站 ROM 地址（`site:/…` / `files:/…`，**不含域名**，2026-10-16 加）。
   * 空 = 没挂来源、走 R2；有值时前台**优先**读它（见 app/api/games/[id]/rom）。
   */
  source_url: string | null;
  rom_name: string;
  console_type: ConsoleType;
  language: string | null;
  /**
   * 同款聚合键（2026-10-16 加）—— **决定这一行去读哪一份文案**（`game_texts`）。
   * 同一款游戏的几条语言版本记录共用同一个值；可空只是留给「迁移前的老行」，
   * 读取一律 `COALESCE(g.group_key, g.id)`（见 loadGameTexts），写入永远是算好的非空值。
   */
  group_key: string | null;
  series: string | null;
  series_en: string | null;
  year: number | null;
  developer: string | null;
  developer_en: string | null;
  /** 开发商外键（可空）。空 = 没接上开发商库，只有 `developer` 那列文字。 */
  developer_id: string | null;
  description: string | null;
  description_en: string | null;
  created_at: number;
}

/** `game_texts` 的一行（snake_case）。字段可空 = 没翻，读取时逐字段回退（见 lib/game-text.ts）。 */
export interface GameTextRow {
  /**
   * ⚠️ 这是 **JOIN 出来的**游戏 id，本表实际存的是 `group_key`（见 loadGameTexts）——
   *    批量读取要按「游戏 id」索引成字典，所以这里维持 id 这个名字与形状。
   */
  game_id: string;
  /** zh / en / ja / ko …（**比界面语言宽**，见 lib/game-text.ts） */
  locale: string;
  title: string | null;
  series: string | null;
  developer: string | null;
  description: string | null;
  updated_at: number;
}

/**
 * 对外结构（camelCase，供 API / 前端）。
 *
 * ⚠️ 文案在 `texts` 里**按语言索引**（见文件头那段）：前端要显示哪一份由
 *    `localizeGame(game, locale)` 决定，接口（`/api/games`）吐的是**库里有的全量**，
 *    因为客户端拿到之后还要跟着界面语言切换（房间那侧的语言是运行时切的，
 *    不是每次请求都重取数据）。
 */
export interface Game {
  id: string;
  /** 库里有的语言全都在这儿。中文那份一定在；英文 / 日韩可能整份缺席。 */
  texts: GameTexts;
  imageUrl: string;
  romName: string;
  consoleType: ConsoleType;
  language: string | null;
  year: number | null;
  /** 开发商页的地址片段（`/developers/<id>`）。为 null 时详情页那个名字就不做链接。 */
  developerId: string | null;
  createdAt: number;
}

function toGame(row: GameRow, texts: GameTexts): Game {
  return {
    id: row.id,
    texts,
    imageUrl: row.image_url,
    romName: row.rom_name,
    consoleType: row.console_type,
    language: row.language,
    year: row.year,
    developerId: row.developer_id,
    createdAt: row.created_at,
  };
}

/**
 * 按语言取一条游戏的文案 —— **逐字段回退**，规则与实现在 lib/game-text.ts 的 `localizeTexts`
 * （那边是纯函数，客户端组件也要用同一份）。
 *
 * 纯函数、不碰数据库 —— 页面 / 组件拿到完整 `Game` 之后调它。
 */
export function localizeGame(game: Game, locale: Locale): LocalizedGameText {
  return localizeTexts(game.texts, locale);
}

/**
 * 一次把一批游戏的文案捞回来（按游戏 id 批量），拼成 `game_id → GameTexts`。
 *
 * 为什么是**批量**：列表一页最多 100 条，逐条查就是 100 次 D1 往返（N+1）。
 * 分块是因为 SQLite 的绑定参数有上限 —— 50 是个安全的块大小（页面大小也正好是 100 的两块）。
 *
 * 只取四个文案列，不 `SELECT *`：`updated_at` 用不上，而这是列表路径上最热的查询。
 *
 * ⚠️ **中间多一层 JOIN**（2026-10-16 起）：`game_texts` 的主键是 `group_key`，
 *    而同款几条记录共用一份文案 ⇒ 必须先从 games 拿到每一行的 group_key 再去取文案。
 *    写成 JOIN 而不是「先查 group_key、再 IN 查文案」两趟：一趟就够，而且驱动表是
 *    games（`WHERE g.id IN (…)` 走主键），本表这边吃自己的主键前缀，代价极小。
 *    `COALESCE(g.group_key, g.id)` 只是给迁移前的老行兜底（见 db/schema.sql 末尾那段）。
 *
 * ⚠️ 返回的字典**按游戏 id**索引（不是 group_key）—— 调用方手里拿的是 `Game[]`，
 *    同款几条记录各自拿到**同一份**文案对象（是共享引用，别去改它）。
 *
 * ⚠️ 导出给 `user-data.ts` 用（收藏 / 历史 / 存档总览那几条 JOIN 也要文案）——
 *    那边**不重复实现**这一份，免得「按语言索引的字典」被拼成两种形状。
 */
const TEXT_CHUNK = 50;

export async function loadGameTexts(ids: string[]): Promise<Map<string, GameTexts>> {
  const map = new Map<string, GameTexts>();
  if (ids.length === 0) return map;

  for (let i = 0; i < ids.length; i += TEXT_CHUNK) {
    const chunk = ids.slice(i, i + TEXT_CHUNK);
    const placeholders = chunk.map((_, index) => `?${index + 1}`).join(', ');
    const rows = await query<GameTextRow>(
      `SELECT g.id AS game_id, t.locale, t.title, t.series, t.developer, t.description
         FROM games g
         JOIN game_texts t ON t.group_key = COALESCE(g.group_key, g.id)
        WHERE g.id IN (${placeholders})`,
      chunk
    );

    for (const row of rows) {
      /*
       * `locale` 是自由文本（将来可能存进我们不认识的码）。索引时按 `ContentLocale` 断言 ——
       * 认不出的那个 key 只是没人会去取，不影响已知语言。
       */
      const bucket: GameTexts = map.get(row.game_id) ?? {};
      bucket[row.locale as ContentLocale] = {
        title: row.title,
        series: row.series,
        developer: row.developer,
        description: row.description,
      };
      map.set(row.game_id, bucket);
    }
  }

  return map;
}

/** 把一批 `GameRow` 连同它们的文案一起转成 `Game[]`。 */
async function attachTexts(rows: GameRow[]): Promise<Game[]> {
  if (rows.length === 0) return [];
  const texts = await loadGameTexts(rows.map((row) => row.id));
  return rows.map((row) => toGame(row, texts.get(row.id) ?? {}));
}

export async function listGames(): Promise<Game[]> {
  const rows = await query<GameRow>('SELECT * FROM games ORDER BY created_at DESC');
  return attachTexts(rows);
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
  /**
   * 只取某一语种的 ROM（机种专题页的语种筛选在用，2026-10-16 加）。
   *
   * 命中的是 `games.language` 那一列 —— 也就是**游戏自己的语言**（`zh` / `en` /
   * `ja` / `ko`，见 lib/rom-lang.ts），不是界面语言。
   *
   * ⚠️ **精确匹配，不是 `LIKE`**：这一列的值域就是那几个短码（上游导入时归一化过），
   *    而 `LIKE` 会让 `zh` 顺带命中 `zht` 之类，让标签上的数字和筛出来的条数对不上。
   *    代价是历史脏数据（`ZH` / `jp` 这种自由文本）筛不到任何一份 —— 那是**对的**：
   *    它们本来也不属于任何一个标签，硬塞进某一份反而会漏数。
   * ⚠️ 空值 / `null` 一律**当「不限」**：调用方要「全部」时传 null，别传空串
   *    （空串会被下面当成一个真条件，拼出 `language = ''`）。
   */
  language?: string | null;
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
 * （2026-10-16 机种专题页就是照这条做的：`?lang=` 是一个**独立参数**，见
 * `GamePageQuery.language`；关键词那一路一个字没动。）
 *
 * ⚠️ 2026-10-16 起**查侧表 `game_texts`**（原来直接 LIKE games 上那 6 个中英列）。
 *    写成 `EXISTS` 子查询而不是 JOIN：JOIN 会把一行游戏乘成「有几种语言就几行」，
 *    `LIMIT` 与游标就全错位了（同一条游戏在结果里出现好几次）。
 *    子查询的匹配范围与原来一致：**任何语言的** title / developer / series，
 *    所以中文站搜「Contra」能命中、英文站搜「魂斗罗」也能命中 —— 对用户是纯收益，
 *    没有谁会因为「搜到了本不该出现的另一种语言」而不满。
 *    ⚠️ 仍然**不含 `description`**（理由见上一条：说明是整段自由文本，纳进来噪音太大）。
 *
 * ⚠️ **它内部把绑定值写死成 `?1`**（同一条件里出现多次，复用同一个值）。
 * 所以调用方必须保证「关键词」是**第 1 个**绑定参数 —— 见 `buildGamesWhere` 里拼条件的顺序。
 *
 * ⚠️ 挂的是 `group_key`（2026-10-16 改）⇒ **同款的几个语言版本会一起命中或一起不命中**
 *    （它们读的是同一份文案）。这正是想要的：搜「星之卡比」应该把英文版 / 日文版那几条
 *    也搜出来 —— 它们本来就是这款游戏。
 */
const SEARCH_CONDITION = `EXISTS (
  SELECT 1 FROM game_texts t
   WHERE t.group_key = COALESCE(games.group_key, games.id)
     AND (t.title LIKE ?1 OR t.developer LIKE ?1 OR t.series LIKE ?1)
)`;

/**
 * 拼出 `WHERE` 子句与绑定值 —— `listGamesPage` 和 `countGames` 共用这一份。
 *
 * ⚠️ 条件拼装的顺序**不能动**：`SEARCH_CONDITION` 内部把绑定值写死成 `?1`，
 *    所以关键词必须是第 1 个绑定参数。两处各写一份迟早会漂，所以抽在这里。
 */
function buildGamesWhere(filter: GamePageQuery): { where: string; params: unknown[] } {
  const needle = filter.keyword?.trim() ?? '';
  const consoleType = filter.consoleType ?? null;
  const developerId = filter.developerId ?? null;
  const language = filter.language ?? null;

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
  /*
   * 语种排最后：占位符编号一律按 `params.length` 现算，所以顺序只要**稳定**就行 ——
   * 而这里必须稳定，因为 `countGamesCached` 的调用方要按同一个顺序传参（见那边）。
   */
  if (language) {
    conditions.push(`language = ?${params.length + 1}`);
    params.push(language);
  }

  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

/**
 * 只数总数，不取数据。
 *
 * 为什么从 `listGamesPage` 里拆出来（2026-10-14）：前台那份总数要走
 * `countGamesCached` —— 那个缓存的键里**没有 offset**，所以翻多少页都只数一次；
 * 而 `listGamesPageCached` 的键含 offset，每翻一页都是新条目。两者混在一起的话，
 * 每个页码都会各自重数一遍全表（1000+ 行），这正是要治的病。
 */
export async function countGames(filter: GamePageQuery = {}): Promise<number> {
  const { where, params } = buildGamesWhere(filter);
  const rows = await query<{ total: number }>(
    `SELECT COUNT(*) AS total FROM games ${where}`,
    params
  );
  return Number(rows[0]?.total ?? 0);
}

/** 游标 = `created_at:id`。id 是 UUID、不含冒号，按第一个冒号切就够（comments.ts 同款）。 */
function encodeGameCursor(game: Pick<Game, 'createdAt' | 'id'>): string {
  return `${game.createdAt}:${game.id}`;
}

function decodeGameCursor(raw: string | null | undefined): { createdAt: number; id: string } | null {
  if (!raw) return null;
  const at = raw.indexOf(':');
  if (at <= 0) return null;
  const createdAt = Number(raw.slice(0, at));
  const id = raw.slice(at + 1);
  if (!Number.isFinite(createdAt) || !id) return null;
  return { createdAt, id };
}

/**
 * 后台列表的一行 = `Game` 再加一个**同款盘数**（2026-10-16 加）。
 *
 * `groupSize` = 与这一行**共用同一份文案**的 ROM 条数（含自己）。后台编辑弹窗靠它
 * 说清「你改的是整款、几条 ROM 一起变」—— `group_key` 由服务端自动算，录制的人
 * 本来完全看不见它挂在哪几盘上。刻意只在**后台**这条列表路径上算，前台那几条
 * 列表不付这个代价（它们不需要）。
 */
export interface AdminGame extends Game {
  /**
   * 同款的 ROM 条数（含这一行自己）。1 = 库里只有这一盘，改文案只影响它。
   * 口径与 `loadGameTexts` 的兜底一致：`COALESCE(group_key, id)` 相同即同款。
   */
  groupSize: number;
}

/** `listAdminGamesPage` 的返回。没有 total —— 后台分页控件不需要它（2026-10-14 用户拍板）。 */
export interface AdminGamePage {
  games: AdminGame[];
  /** 往后翻的游标；null = 后面没有了。 */
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * 后台列表的**游标翻页** —— 没有 COUNT、没有 OFFSET。
 *
 * 为什么后台单独一套（2026-10-14 用户拍板）：后台**刻意不缓存**（传完要立刻看到），
 * offset 那套「每次都数一遍全表」的成本在这条路径上最疼；而后台的分页控件恰好是
 * 「上一页 / 下一页」式、不需要跳页 —— 正是游标的舒适区。排序键与 `listGamesPage`
 * 同一套（`created_at DESC, id DESC`），游标 = 上一页最后一行的位置，条件写成
 * `(created_at < ?) OR (created_at = ? AND id < ?)` —— 同毫秒的并列行靠 id 兜底，
 * 不会整组跳过。
 *
 * ⚠️ 游标对删除**免疫**：它描述的是「位置」不是「序号」，游标指向的那行被删了，
 * 查询照样从那之后取 —— `listGamesPage` 里那套「末页删空就夹回一页」的兜底
 * 在这条路上根本不需要。
 *
 * ⚠️ 多取一条（`limit + 1`）判断 hasMore，不发 COUNT（照 comments.ts 的路数）。
 */
export async function listAdminGamesPage(
  cursor: string | null,
  limit: number,
  { keyword = '' }: GamePageQuery = {}
): Promise<AdminGamePage> {
  const decoded = decodeGameCursor(cursor);
  const needle = keyword.trim();

  const conditions: string[] = [];
  /** 绑定值，按占位符编号顺序排（关键词必须第 1 个，理由同 buildGamesWhere）。 */
  const params: unknown[] = [];

  if (needle) {
    conditions.push(SEARCH_CONDITION);
    params.push(`%${needle}%`);
  }
  if (decoded) {
    conditions.push(
      `(created_at < ?${params.length + 1} OR (created_at = ?${params.length + 1} AND id < ?${params.length + 2}))`
    );
    params.push(decoded.createdAt, decoded.id);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  /*
   * 多带一列 `group_size`（2026-10-16）：同款有几盘 ROM，编辑弹窗的提醒要用。
   * 写成**相关子查询**而不是 GROUP BY / 窗口函数：这一页最多 100 行，子查询吃
   * `group_key` 索引、每行一次主键级计数，代价远小于把整表 GROUP 一遍；而
   * `LIMIT` 与游标的形状原样保留（GROUP BY 会把「多取一条判 hasMore」搅乱）。
   * 口径与 `loadGameTexts` 的兜底一致：`COALESCE(group_key, id)` 相同即同款。
   */
  const rows = await query<GameRow & { group_size: number }>(
    `SELECT *,
            (SELECT COUNT(*) FROM games g2
              WHERE COALESCE(g2.group_key, g2.id) = COALESCE(games.group_key, games.id))
              AS group_size
       FROM games ${where}
      ORDER BY created_at DESC, id DESC LIMIT ?${params.length + 1}`,
    [...params, limit + 1]
  );

  const hasMore = rows.length > limit;
  /* 文案要单独一批捞（`game_texts` 是另一张表），见 attachTexts */
  const page = rows.slice(0, limit);
  /* `attachTexts` 保序 ⇒ 按下标把子查询那一列贴回每一行 */
  const items: AdminGame[] = (await attachTexts(page)).map((game, index) => ({
    ...game,
    groupSize: Number(page[index].group_size ?? 1),
  }));
  const last = items[items.length - 1];

  return {
    games: items,
    hasMore,
    nextCursor: hasMore && last ? encodeGameCursor(last) : null,
  };
}

/**
 * 分页读取（offset 式）。**前台**那几条列表路径走 `listGamesPageCached` 那一族
 * （内部最终还是调这里）；后台列表 2026-10-14 起改走 `listAdminGamesPage`（游标式，
 * 不再经过这里）。
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
 *
 * `total` 是**可选入参**（2026-10-14 加）：前台那几条路径会传进来一份走
 * `countGamesCached` 的值，省掉这里再数一遍全表；不传就自己数。（后台列表同日起
 * 改走 `listAdminGamesPage` 游标式，现在已没有「必须实时」的调用方 —— 这个口子
 * 留作无缓存兜底。）
 */
export async function listGamesPage(
  offset: number,
  limit: number,
  filter: GamePageQuery = {},
  total?: number
): Promise<{ games: Game[]; total: number; offset: number; limit: number }> {
  const { where, params } = buildGamesWhere(filter);

  const resolvedTotal = total ?? (await countGames(filter));

  const lastOffset = Math.max(0, Math.ceil(resolvedTotal / limit) - 1) * limit;
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

  return { games: await attachTexts(rows), total: resolvedTotal, offset: safeOffset, limit };
}

/**
 * 前台「列表类」数据的缓存时长（秒）= 24 小时。**这个数只写在这里**，页面那边读常量。
 *
 * 演变：30 分钟（2026-10-12）→ 12 小时（2026-10-14，为压 D1 的 `rows_read` 额度拍板）
 *      → **24 小时（2026-10-16，用户要求「所有列表页统一 24 小时」）**。
 * 24 小时这一档的代价：后台上传的新游戏 / 改过的游戏，最多晚 24 小时才出现在
 * 列表页 / 在线库弹窗里 —— 用户明确接受。**别自作主张调回去。**
 *
 * 和 `HOME_REVALIDATE_SECONDS` 数值相同（都是 86400）但**刻意各留一个常量**：
 * 服务的是两类页面（货架 vs 落地页），将来谁想快一点不必牵动另一个。
 *
 * ⚠️ 开发模式走 `lib/server/cache.ts` 的 `cached`，那边把 TTL 压到 5 分钟（见该文件）。
 */
export const GAMES_PAGE_REVALIDATE_SECONDS = 86400;

/**
 * 前台「**按 id 的单条**」读取的缓存时长（秒）= 24 小时。
 *
 * ⚠️ **2026-10-16 从 12 小时调到 24 小时**（用户要求「网站端详情页面也增加 24 小时缓存，
 *    这样能减少查询」）。它服务的是详情页 / 下载页 / `/room` / `/play` 的深链、
 *    `/api/games/[id]` 那条兜底接口，以及 ROM 代理读原始行那一份。
 *
 * ⚠️ **和 `GAMES_PAGE_REVALIDATE_SECONDS` 是两个常量、各管一档**：
 *    2026-10-16 起**数值相同（都是 24 小时）** —— 用户当天先要求「详情页 24 小时」，
 *    同一天又把「所有列表页」也提到 24 小时，两档就此撞上。仍然各留一个常量：
 *    列表页改一次是一整页的观感，而单条详情页几乎不变，将来谁想调开不必牵动另一个。
 *
 * 代价：后台改完游戏**立刻**调 `revalidateTag('games')`（insertGame / updateGame /
 * deleteGame 里都有），所以正常路径下改完就是新的；TTL 只约束「谁都没动过库」的情形。
 */
export const GAME_DETAIL_REVALIDATE_SECONDS = 86400;

/**
 * 「总数」的独立缓存 —— **键里没有 offset**，这是它存在的全部理由。
 *
 * `listGamesPageCached` 那一族的键含 offset，每翻一页都是一个新条目、都要各自数一遍
 * 全表（1000+ 行）。把 COUNT 挪到这一层之后，24 小时内无论翻到第几页，
 * 总数只算一次，各页共用同一份。
 *
 * ⚠️ 代价：`total` 与某一页的数据来自**两个独立缓存**，TTL 起点可能错开 ⇒
 *    页码条的总数可能比实际内容旧一轮。有 `listGamesPage` 里「末页空了就回退一页」
 *    兜底，不会停在永远空的一页上。用户 2026-10-14 选了「总数和内容同一个 TTL」，
 *    2026-10-16 那一档跟着列表页一起提到 24 小时（两边仍然同进同出）。
 *
 * ⚠️ 参数顺序 = `buildGamesWhere` 拼条件的顺序（关键词 → 机种 → 开发商 → 语种）。
 *    四个都是「扁平基本类型」，理由同 `listGamesPageCached`（缓存键要稳定可读）。
 *    `language` 是 2026-10-16 加的第四维（机种专题页的语种筛选）—— 和 `consoleType`
 *    一样：**进键意味着每个语种各有一份计数**，这正是想要的（筛出来的条数本来就不同）。
 *    加这一维会让线上那份旧缓存（键里只有三维）整体失效一轮，最多多打几次 D1。
 *
 * ⚠️ **键尾 `v2`（2026-10-16）**：文案改挂 `group_key` ⇒ 搜索那条 `EXISTS` 子查询的
 *    条件变了（`t.game_id = games.id` → `t.group_key = COALESCE(…)`），命中集合在
 *    「同款几条记录文案不一致」的边界上会变。条目落在 `.next/cache`、**不随部署失效**，
 *    所以必须显式升版本把它作废一轮，否则新旧口径会混着用 24 小时。
 *    同一天升 `v2` 的还有下面 list / latest / by-developer / by-console 那四份
 *    （它们的 SQL 也经过 `buildGamesWhere` / `loadGameTexts`）—— 加索引维度和这次
 *    是两回事，别把 `v1`/`v2` 的来历搞混。
 */
export const countGamesCached = cached(
  async (
    keyword: string,
    consoleType: ConsoleType | null,
    developerId: string | null,
    language: string | null
  ) => countGames({ keyword, consoleType, developerId, language }),
  ['games:count', 'v2'],
  { revalidate: GAMES_PAGE_REVALIDATE_SECONDS }
);

/**
 * 首页那几个「由 D1 拼出来的区块」的缓存时长（秒）= 24 小时。
 *
 * ⚠️ 2026-10-14 起数值和 `GAMES_PAGE_REVALIDATE_SECONDS` **相同**（当时都是 12 小时，
 *    2026-10-16 又一起提到 24 小时）—— 前台列表统一之后两者一直撞着，
 *    「首页比列表页慢」那层区分早就不存在。
 *    仍然**各留一个常量**：服务的是两类页面，将来谁想快一点不必牵动另一个。
 *
 * ⚠️ **它不只服务首页**：`countGamesByConsoleCached`（各机种游戏数）也挂在它上面，
 *    而 `/consoles` 列表页同样在用那个函数 —— 两处**共用同一份缓存条目**，
 *    所以「列表页 24 小时、首页仍 12 小时」这种拆法做不到（一份缓存只能有一个时长，
 *    真拆就得复制一份键、让两处数字的过期起点错开）。2026-10-16 把列表页提到 24 小时时，
 *    首页因此跟着一起提 —— 这是刻意的，不是漏改。
 *
 * ⚠️ 开发模式走 `lib/server/cache.ts` 的 `cached`，那边把 TTL 压到 5 分钟（见该文件）。
 * ⚠️ `developers.ts` 里有一份等值手抄（两个文件不许互相 import），改这里要一起改。
 */
export const HOME_REVALIDATE_SECONDS = 86400;

/**
 * 带缓存的列表读取 —— 前台那两条列表路径共用：`/games` 列表页、在线库弹窗（`/api/games`）。
 *
 * ⚠️ **2026-10-14 起在线库弹窗也走这里**（用户拍板「前台的列表都加缓存」）。在那之前
 *    它调的是无缓存的 `listGamesPage`，立场是「传完游戏要立刻能在弹窗里看到」；现在这个
 *    代价变成「新传的游戏最多晚 24 小时才出现在弹窗里」，用户明确接受。
 *    **后台列表（`/api/admin/games`）2026-10-14 起改走 `listAdminGamesPage`（游标式）**，
 *    同样无缓存、必须实时 —— 而且连 COUNT 都不发（见那个函数的注释）。
 *
 * ⚠️ 为什么不直接在 `listGamesPage` 里加缓存：那个函数是前台那几条列表路径的底座，
 * 后台的列表另有 `listAdminGamesPage`（同样无缓存、必须实时），别把两套搅在一起。
 * 所以缓存是**页面这一侧的策略**，不该下沉到数据层。
 *
 * 参数刻意都是**扁平的基本类型**（offset / limit / keyword / consoleType），而不是收一个
 * `GamePageQuery` 对象：`unstable_cache` 把入参当作缓存键的一部分，扁平参数拼出来的键
 * 稳定可读，传对象则依赖属性的序列化顺序，将来加个字段可能悄悄改变键、把缓存打散。
 *
 * `consoleType` 是 2026-10-13 加进来的：列表页从那天起支持 `?console=<机种>` 筛选
 * （首页那个「按机种浏览」区块点进来的落点）。它进缓存键意味着**每个机种各有一份缓存**
 * —— 这正是想要的，筛选结果与全量结果本来就不是同一批数据。
 * ⚠️ 加这个参数会让线上那份旧缓存（键里只有 offset/limit/keyword）整体失效一轮，
 * 最多多打几次 D1，没有别的影响。
 *
 * ⚠️ `language` 是 2026-10-16 加的**第五维**，机种专题页的语种筛选在用（`?lang=`）：
 *    该页有关键词时走这个函数（没有关键词时走下面的 `listGamesByConsoleCached`）。
 *    同样会让旧条目失效一轮。不筛语种一律传 `null`。
 *
 * 缓存键里**不含「界面语言」**，这是对的：返回的 `Game` 把库里有的语言全都带
 * （`texts` 那个字典），跟 cookie 无关；选哪一份由页面调 `localizeGame(game, locale)` 决定。
 * 也就是说四种界面语言的访客共用同一份缓存是**有意**的 —— 这也是「数据层不按界面语言裁剪」
 * 的原因（见文件头那段）：数据层一裁剪，这份共用的缓存就只对一种语言正确了。
 * ⚠️ 别把这里的 `language` 和「界面语言」搞混：它筛的是**游戏自己的语种**
 *    （`games.language`），进键是对的 —— 筛出来的本来就是另一批数据。
 */
export const listGamesPageCached = cached(
  async (
    offset: number,
    limit: number,
    keyword: string,
    consoleType: ConsoleType | null,
    language: string | null
  ) =>
    listGamesPage(
      offset,
      limit,
      { keyword, consoleType, language },
      // 总数走独立缓存（键里没有 offset）—— 翻多少页都只数一次，见 countGamesCached。
      await countGamesCached(keyword, consoleType, null, language)
    ),
  ['games:list', 'v2'],
  { revalidate: GAMES_PAGE_REVALIDATE_SECONDS }
);

/**
 * 首页「最新收录」区块要的那几款 —— 首页专用，**别拿 `listGamesPageCached` 顶替**。
 *
 * 两者查的是同一张表、都从第 0 条开始，**2026-10-14 起 TTL 也一样（2026-10-16 起都是 24 小时）**：
 * 各自一份缓存条目（键前缀 `games:latest` vs `games:list`），互不影响。
 * （在那之前首页是 24 小时、`/games` 是 30 分钟 —— 前台列表统一之后两者就撞了。）
 *
 * 参数收成一个 `limit`：首页永远是**第一页、无关键词、不筛机种**，把 offset / keyword
 * 那几维摆出来只会让人以为首页也能翻页。将来首页真要能翻页，再照着 `listGamesPageCached`
 * 的形状加参数，并且**必须同步改缓存键** —— 键不变而语义变了，旧缓存会串味。
 */
export const listLatestGamesCached = cached(
  // 首页其实不用 `total`，但照样传进去 —— 和列表页共用同一份总数缓存（键相同），
  // 省掉这里再数一遍全表。
  async (limit: number) =>
    listGamesPage(0, limit, {}, await countGamesCached('', null, null, null)),
  ['games:latest', 'v2'],
  { revalidate: HOME_REVALIDATE_SECONDS }
);

/**
 * 各机种各有几款游戏 —— 首页那个「按机种浏览」区块的卡片、`/consoles` 列表页用。
 *
 * 一条 `GROUP BY` 就够（行数恒等于「库里有游戏的机种数」，最多十四行）。
 *
 * ⚠️ **`GROUP BY` 只返回「库里出现过」的机种** —— 某一档一款都没有时那一行压根不存在，
 *    调用方拿到 `undefined` 就会在界面上渲染出一个空洞。所以下面先铺满全部机种（十四个）
 *    的 0 再填。加机种要同步这个初始化对象（`ConsoleType` 联合类型会在编译期提醒你）。
 *
 * 排序不在这里定：**展示顺序是界面的事**（`lib/consoles.ts` 的 `CONSOLE_TYPES`），
 * 这里只回答「各有多少」。
 */
export async function countGamesByConsole(): Promise<Record<ConsoleType, number>> {
  const rows = await query<{ console_type: ConsoleType; total: number }>(
    'SELECT console_type, COUNT(*) AS total FROM games GROUP BY console_type'
  );

  const counts: Record<ConsoleType, number> = {
    nes: 0,
    snes: 0,
    gb: 0,
    gbc: 0,
    gba: 0,
    nds: 0,
    md: 0,
    gg: 0,
    sms: 0,
    '32x': 0,
    ws: 0,
    ngp: 0,
    ps1: 0,
    arcade: 0,
  };
  for (const row of rows) counts[row.console_type] = Number(row.total);
  return counts;
}

/**
 * `countGamesByConsole` 的缓存版。**只给首页 / 机种列表页用** —— 后台要立刻看到刚传的游戏，
 * 所以缓存留在这一层，别下沉进 `countGamesByConsole`。
 */
const countGamesByConsoleRaw = cached(
  async () => countGamesByConsole(),
  ['games:console-counts', 'v2'],
  { revalidate: HOME_REVALIDATE_SECONDS }
);

/**
 * 各机种游戏数。先读缓存，再**补齐成完整的十四个键**才返回。
 *
 * ⚠️ 必须补：缓存条目能活几小时、且不随部署失效（落在 `.next/cache`），形态可能比当前代码老。
 *    2026-10-14 加机种就是如此 —— 老条目只有四个键，`counts['gb']` 取到 `undefined`，
 *    页面直接印出「undefined 款游戏」。补 0 之后调用方拿到的永远是完整记录，
 *    `Record<ConsoleType, number>` 这个类型在运行时也才真的成立。以后加机种也不用改这里。
 */
export async function countGamesByConsoleCached(): Promise<Record<ConsoleType, number>> {
  const raw = await countGamesByConsoleRaw();
  const counts = {} as Record<ConsoleType, number>;
  for (const type of CONSOLE_TYPES) counts[type] = raw[type] ?? 0;
  return counts;
}

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
export const listGamesByDeveloperCached = cached(
  async (developerId: string, offset: number, limit: number) =>
    listGamesPage(
      offset,
      limit,
      { developerId },
      await countGamesCached('', null, developerId, null)
    ),
  ['games:by-developer', 'v2'],
  { revalidate: GAMES_PAGE_REVALIDATE_SECONDS }
);

/**
 * 机种专题页（`/consoles/<type>`）那段「这个机种下的游戏」—— 和开发商详情页那条
 * **完全同构**：同一个 TTL（24 小时）、同一套理由，只是缓存键换成自己的前缀
 * （`games:by-console`），不与 `games:by-developer` 串味。
 *
 * `consoleType` 进缓存键意味着**每个机种各有一份缓存** —— 和 `/games?console=` 那个
 * 筛选（`listGamesPageCached` 的第四维）各存各的：两边 TTL 相同（2026-10-16 起都是
 * 24 小时），但键形状不该为了另一个页面而变，见 listGamesByDeveloperCached
 * 那段「为什么不加第四个参数」的说明。
 *
 * ⚠️ `language`（第四维，2026-10-16 加）**只服务这一页的语种筛选**：机种专题页没有
 *    关键词时走这里、有关键词时走 `listGamesPageCached` 那条。两边的缓存键里都带
 *    这一维，所以「全部 / 只看中文 / 只看日文」各自一份，不会串味。
 *    不筛语种传 `null`（= 那一页的「全部」标签）。
 */
export const listGamesByConsoleCached = cached(
  async (consoleType: ConsoleType, offset: number, limit: number, language: string | null) =>
    listGamesPage(
      offset,
      limit,
      { consoleType, language },
      await countGamesCached('', consoleType, null, language)
    ),
  ['games:by-console', 'v2'],
  { revalidate: GAMES_PAGE_REVALIDATE_SECONDS }
);

/**
 * 一个机种下**各语种各有几款** —— 给机种专题页那条语种筛选条上的数字用
 * （2026-10-16 加，用户要求「每个语种还是显示数量」）。
 *
 * 一条 `GROUP BY` 就够（行数 ≤ 语种数 + 脏数据那几种自由文本）。**筛的是机种、
 * 不筛关键词** —— 和那一页资料表里「共 N 款游戏」同一个口径（那个也是不筛关键词的），
 * 两处数字对得上比「跟着搜索框实时变」更重要；搜索时列表本身会另报一行
 * 「『xxx』共 N 个结果」，用户看得出那是另一回事。
 *
 * ⚠️ **只返回已知的四个语种键**（`GAME_LANGUAGE_VALUES`，唯一出处）：
 *    `GROUP BY` 出来的键还可能是历史脏数据（`jp` / `Chinese` / 大写 `ZH`），
 *    它们既不在筛选条上、也不参与筛选，混进来只会让返回值的形状随机。
 *    调用方拿到的永远是「四个键齐全」的记录，`?? 0` 都省了。
 *
 * ⚠️ 和 `countGamesByConsoleCached` 一样**只给前台页面用**（后台要立刻看到刚传的
 *    游戏），所以缓存留在这一层、别下沉进这个函数体（那个函数体本身不缓存）。
 *
 * ⚠️ 缓存键带 `v1` 版本尾：加语种 / 改这条查询的形态时**记得 +1**（条目落在
 *    `.next/cache`，不随部署失效）。
 */
const countConsoleGamesByLanguageRaw = cached(
  async (consoleType: ConsoleType) => {
    const rows = await query<{ language: string | null; total: number }>(
      'SELECT language, COUNT(*) AS total FROM games WHERE console_type = ? GROUP BY language',
      [consoleType]
    );

    const counts: Record<string, number> = {};
    for (const value of GAME_LANGUAGE_VALUES) counts[value] = 0;
    for (const row of rows) {
      if (!row.language) continue;
      counts[row.language] = Number(row.total);
    }
    return counts;
  },
  ['games:lang-counts', 'v1'],
  { revalidate: GAMES_PAGE_REVALIDATE_SECONDS }
);

export async function countConsoleGamesByLanguageCached(
  consoleType: ConsoleType
): Promise<Record<string, number>> {
  const raw = await countConsoleGamesByLanguageRaw(consoleType);
  /* 老条目可能少键（见上），照样补齐一份完整记录再返回 */
  const counts: Record<string, number> = {};
  for (const value of GAME_LANGUAGE_VALUES) counts[value] = raw[value] ?? 0;
  return counts;
}

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
  if (!row) return null;
  /* 文案在侧表里，和主行分两次查（单条路径，不值得为它拼一个 JOIN） */
  const texts = await loadGameTexts([id]);
  return toGame(row, texts.get(id) ?? {});
}

/**
 * 按 id 取一条游戏的**缓存版**（2026-10-16 起 24 小时，后台写入时用
 * `revalidateTag('games')` 主动失效）。
 *
 * 为什么值得单独一份：按 id 的单条查询是**全站请求量最大、却完全没缓存的读路径** ——
 *   · `/api/games/<id>/rom` 代理：每次开局都要查一次（浏览器那份 max-age=3600 只挡
 *     同一个浏览器的重复下载，换个人 / 换天就打穿）；
 *   · 详情页 / 下载页 / `/room` / `/play`：每次渲染各查一次。
 * 单条虽然只读一行，但架不住次数多 —— 缓存之后这些全部归零。
 *
 * ⚠️ 后台改完游戏**立刻**调 `revalidateTag('games')`（insertGame / updateGame /
 *    deleteGame 里已经加了），所以「改了名字详情页还是旧的」最多只发生在缓存层
 *    出纰漏的时候，正常情况不存在。
 *
 * ⚠️ 写接口里「校验游戏还在不在」的调用方**继续用无缓存的 `getGame`**：
 *    那些路径要的是「此刻是否存在」，不差这一次单行查询。
 */
export const getGameCached = cached(
  async (id: string) => getGame(id),
  ['games:by-id'],
  { revalidate: GAME_DETAIL_REVALIDATE_SECONDS, tags: ['games'] }
);

/**
 * `getGameRow` 的缓存版 —— **只给 ROM 代理用**。
 *
 * 代理需要的是原始行（`rom_url` 拼公网地址、`rom_name` 进 Content-Disposition），
 * 这两样在缓存有效的这段时间里不会变（换了 ROM 走的是删除重传，那边会失效 tag）。
 *
 * TTL 与 `getGameCached` 同一档（24 小时，2026-10-16 起）：两者都是「按 id 的单条」，
 * 没有理由让代理那一份比详情页更短命。
 *
 * ⚠️⚠️ **键尾的 `v2` 是 2026-10-16 为「存量记录改走来源地址」升的，别顺手抹掉。**
 *    那一天脚本给 1258 条老记录填了 `source_url`、并删掉对应的 R2 包（`.srm` 之外的
 *    ROM 本体），行形态从「`rom_url` 有值 / `source_url` 为 NULL」变成反过来。
 *    代理选目标是 `sourceFileUrl(source_url) ?? publicUrl(rom_url)` —— **旧形态那一行**
 *    会去取一个**已经被删掉的 R2 对象**，当场 404。而这个缓存**不随部署失效**、
 *    TTL 又长达 24 小时，所以只有换键才能让旧条目立刻不再命中。
 *    以后再动 `source_url` / `rom_url` 这层语义（比如又搬回 R2），同样要升这个尾号。
 */
export const getGameRowCached = cached(
  async (id: string) => getGameRow(id),
  ['games:row-by-id:v2'],
  { revalidate: GAME_DETAIL_REVALIDATE_SECONDS, tags: ['games'] }
);

/**
 * 找「同名 **且同机种** 且语言相同」的那一条 —— 给后台「添加 / 修改游戏」判重用。
 *
 * 为什么判重必须落在服务端：列表是**分页**的，前端手里只有当前页，
 * 在浏览器里比名字一定会漏（同名的那条很可能在别的页上）。
 *
 * 比较规则：
 *  - `title` 精确匹配、但**忽略 ASCII 大小写**（`COLLATE NOCASE`）——
 *    英文名 `Castlevania` 与 `castlevania` 该算同名；中文不受影响（NOCASE 只作用于 ASCII）。
 *    传进来的名字先 trim 一次，别让首尾空格绕过去。
 *  - `console_type` **也必须相同**才算重复（2026-10-15 加）：同名跨机种是**合法**的
 *    —— 一堆游戏在 NES / SFC / GB / 街机上各有一版，而且那是真的几盘不同的 ROM。
 *    只按名字拦会把它们全挡在门外（表现是「明明是新机种却说我重复了」）。
 *  - `language` **也必须相同**才算重复（2026-10-13 加）：同一款游戏的「日版 / 美版 /
 *    中文版」是几条合法记录，只按名字拦会把这些全挡在门外。
 *    两边都为空（老数据、没标语言的）算**相同** —— 都没标语言又同名，那就是重复。
 *  - **只比中文那份标题**（`game_texts` 里 `locale = 'zh'` 的那一行）——
 *    「同名」按站内主名字（中文原文）算，英文 / 日韩的标题不参与判重。
 *    ⚠️ 2026-10-16 起文案挂 `group_key`（同款共用一份），所以这条 JOIN 取到的是**这一款**
 *       的中文标题，而不是「这一盘 ROM 的」—— 同款的几条记录给出的答案本来就一样。
 *
 * `consoleType` 传 `null` 时**这一维不参与比较**（老调用方 / 还不知道机种的场合，
 * 退回「同名 + 同语言」的旧口径，而不是把所有机种都算重复）。
 * ⚠️ 新增的那两个调用方（POST / PATCH 后台游戏接口）**都传真实机种** ——
 *    scrape-game 里那次预检也是（它此刻已经知道机种了）。
 *
 * `excludeId` 是给**修改**（PATCH）用的：那条记录当然和自己的名字 / 语言 / 机种一致，
 * 不排掉自己，改个年份都会被自己拦住。也正因为排掉了自己，**库里已经存在的重复行**
 * 不会把「把重复那条改名改掉」这条路堵死 —— 新名字查不到别人才放行。
 *
 * ⚠️ 用 `JOIN`（不是 LEFT JOIN）：**没有中文行的游戏不参与判重**。
 *    迁移之后每条游戏都有中文行（中文原文是必填的，见 scripts/add-game-texts.mjs），
 *    所以这条 JOIN 不会漏掉任何一条真实记录。
 *
 * ⚠️ 没建索引：这张表就几百上千行，全表扫一遍可以忽略；真要加也是后话。
 */
export async function findGameDuplicate(
  title: string,
  language: string | null,
  consoleType: ConsoleType | null = null,
  excludeId: string | null = null
): Promise<{ id: string; title: string; language: string | null } | null> {
  /*
   * COLLATE 显式挂在**左边**那个 title 上：SQLite 的规则是「哪边显式指定就听哪边」，
   * 挂左边最不容易被将来的改写弄丢。
   *
   * 空语言不写成 `language IS ?`：`IS` 虽然 NULL 安全，但管不到**空串**这种历史脏数据
   * （插入路径会把空串收敛成 NULL，但迁移前的老行未必）。
   *
   * ⚠️ 条件里的列**一律带表别名**：这条查询现在有两张表，不限定的话
   *    `title` / `developer` 这种同名列会直接报 ambiguous。
   */
  const conditions = ['t.title COLLATE NOCASE = ?'];
  const params: unknown[] = [title.trim()];

  // 机种：给了就参与比较；null 表示「这一维不管」（见上面那段）
  if (consoleType) {
    conditions.push('g.console_type = ?');
    params.push(consoleType);
  }

  if (language) {
    conditions.push('g.language = ?');
    params.push(language);
  } else {
    conditions.push("(g.language IS NULL OR g.language = '')");
  }

  if (excludeId) {
    conditions.push('g.id <> ?');
    params.push(excludeId);
  }

  const rows = await query<{ id: string; title: string; language: string | null }>(
    `SELECT g.id AS id, t.title AS title, g.language AS language
       FROM games g
       JOIN game_texts t ON t.group_key = COALESCE(g.group_key, g.id) AND t.locale = 'zh'
      WHERE ${conditions.join(' AND ')}
      LIMIT 1`,
    params
  );
  return rows[0] ?? null;
}

/**
 * 找「同一款游戏」已经用过的那条 `group_key` —— 新增记录时用它决定挂到哪一款上。
 *
 * 判据与 `findGameDuplicate` 用**同一套维度**、只是去掉 `language` 那一维：
 * **中文标题（忽略 ASCII 大小写）+ 机种 + 开发商**。去掉 language 正是「同款」的定义 ——
 * 同一款游戏的中英日韩四个版本，这三样必然相同，只有 `language` 不同。
 *
 * 为什么不是让调用方把 group_key 传进来：
 *   · 批量导入那条路（lib/admin-import.ts）是**顺序发 N 次 POST**，客户端手里只有
 *     「这次抓到的 slug」；而手动添加那条路连 slug 都没有 —— 让客户端定，两边的口径
 *     迟早会漂（还得给后台表单加一栏）。放在服务端算，两条路自动合一。
 *   · 于是「批量导入四个语言版本」和「过两天手动补一个语言版本」都会归到同一款上。
 *
 * ⚠️ 代价：**改名之后反查就认不出来了**（改标题 / 换机种 / 换开发商之后，再补一个语言版本
 *    会另开一款）。这是刻意接受的 —— 想稳就得让 group_key 跟着改，而「改哪几条」比
 *    「认不出来」更容易出错（同名同机种的记录本来就可能有几条）。
 *
 * ⚠️ 返回的 `key` 是 `COALESCE(g.group_key, g.id)`：迁移前的老行（group_key 还是 NULL）
 *    也能被复用，复用的值正好等于 `loadGameTexts` 那边兜底用的同一个值，不会错位。
 *    另一个字段 `title` 是命中的那款**库里的中文名**（后台拿来显示「已归入《XXX》」）。
 *
 * ⚠️ 用 `JOIN`（不是 LEFT JOIN）：**没有中文行的游戏不参与**。中文原文必填，
 *    所以正常数据下每条都有 —— 同 findGameDuplicate 的理由。
 */
export async function findGameGroup(
  title: string,
  consoleType: ConsoleType,
  developerId: string | null
): Promise<{ key: string; title: string } | null> {
  const conditions = ['t.title COLLATE NOCASE = ?', 'g.console_type = ?'];
  const params: unknown[] = [title.trim(), consoleType];

  /*
   * 开发商：有就给外键、没有就要求对方也「没有」。
   * 不写成 `g.developer_id IS ?`：空串（历史脏数据）也得算「没有」，理由同 findGameDuplicate。
   */
  if (developerId) {
    conditions.push('g.developer_id = ?');
    params.push(developerId);
  } else {
    conditions.push("(g.developer_id IS NULL OR g.developer_id = '')");
  }

  /*
   * 顺带把命中的那一条的**中文名**带回去：后台拿它显示「已归入《XXX》」。
   * 名字必然与传进来那个相等（条件里就是 `COLLATE NOCASE` 相等），
   * 取库里的那份是为了显示**已有的**写法（大小写照库里来）。
   */
  const rows = await query<{ group_key: string; title: string }>(
    `SELECT COALESCE(g.group_key, g.id) AS group_key, t.title AS title
       FROM games g
       JOIN game_texts t ON t.group_key = COALESCE(g.group_key, g.id) AND t.locale = 'zh'
      WHERE ${conditions.join(' AND ')}
      LIMIT 1`,
    params
  );
  const hit = rows[0];
  return hit ? { key: hit.group_key, title: hit.title } : null;
}

/**
 * 「这条新记录落在哪一款上」—— `insertGame` 随返回值一起给出去，**只给后台看**。
 *
 * 为什么要把它透出来：`group_key` 是服务端自动算的，录制的人看不见归组结果。
 * 中文名打错一个字（繁简差异、错别字）就会**另开一款**，表现是「同一款游戏的文案
 * 存了两份」—— 当时完全无感，以后才发现。所以保存成功后拿它提示一句
 * 「已归入《XXX》」，归错了当场就能看见（见 components/AdminGames.tsx）。
 */
export interface GameGroupInfo {
  /** 这一款共用的 key。 */
  key: string;
  /**
   * 命中的**已有**那一款的中文名；`null` = 这次新开了一款（没有同款）。
   * `null` 不等于出错 —— 第一次录这一款时本来就是 null。
   */
  reusedTitle: string | null;
}

/**
 * 决定一条**新记录**该挂到哪个同款上 —— 先反查（`findGameGroup`），查不到才新开一个。
 *
 * 这是 `group_key` 的**唯一出口**（接口层、后台表单都不传这个值）。刻意每次插入都查一遍：
 * 后台写入是低频操作，一次额外查询换「跨批次也能归对款」，非常划算。
 *
 * ⚠️ 靠不住的地方只在于调用**顺序**：如果同一款的几个语言版本被并发 POST，可能各开一款。
 *    现实里两条路都是顺序的（批量导入是 `for … await`，后台表单一次一条），
 *    真出现并发时最坏的后果也只是「这一款的文案存了两份」，不是数据损坏。
 */
async function resolveGroupKey(
  title: string,
  consoleType: ConsoleType,
  developerId: string | null
): Promise<GameGroupInfo> {
  const hit = await findGameGroup(title, consoleType, developerId);
  return hit
    ? { key: hit.key, reusedTitle: hit.title }
    : { key: randomUUID(), reusedTitle: null };
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
 * sitemap 用的 stub 读取 —— **缓存 24 小时**（2026-10-15 从 1 小时改过来，用户拍板）。
 *
 * 为什么值得缓存：sitemap 是 `force-dynamic` 的，**每次爬虫来抓都现读一遍全表**
 * （1000+ 行）。爬虫不会只来一次 —— Google / Bing 各自按自己的节奏反复拉，
 * 这一条是「单次请求 rows_read 最大」的查询。缓存之后一天最多算一轮全表读，
 * 「后台上传的游戏最多晚 24 小时进 sitemap」的代价用户明确接受。
 *
 * tag 挂 `games`：后台增删游戏时 `revalidateTag('games')` 会顺带把这份也刷掉，
 * 所以后台动过库的话新游戏基本是立刻进 sitemap 的（TTL 只约束「谁都没动过库」的情形）。
 */
export const listGameStubsCached = cached(
  async () => listGameStubs(),
  ['games:stubs'],
  { revalidate: 86400, tags: ['games'] }
);

/**
 * 由开发商 id 反查名字（中英日韩四份）—— 要跟着一起写的是**三处**：
 * `games.developer` / `games.developer_en` 两个快照列，以及 `game_texts` 里
 * 每一份文案的 `developer`（读取走的是后者，见 `withDeveloper`）。
 *
 * 为什么放在这里、而不是让接口层各传一份名字：这几个值（`developer` / `developer_en` /
 * `developer_id` 与侧表里的厂名）**必须同进同出**（搜索、列表卡片、详情页资料表读的是名字，
 * 开发商页读的是 id）。让调用方自己保证它们一致，早晚会有人只传一个。
 *
 * 认不出的 id 当作「没选」处理（全部置空），不给库里留一条指向空气的关联。
 */
async function resolveDeveloper(
  developerId: string | null
): Promise<{ id: string | null; name: string | null; nameEn: string | null; texts: EntityTexts }> {
  if (!developerId) return { id: null, name: null, nameEn: null, texts: {} };
  const dev = await getDeveloper(developerId);
  return dev
    ? {
        id: dev.id,
        name: rawEntityName(dev.texts, 'zh'),
        nameEn: rawEntityName(dev.texts, 'en'),
        texts: dev.texts,
      }
    : { id: null, name: null, nameEn: null, texts: {} };
}

export interface NewGame {
  /** 由调用方生成：上传前要先拿它拼 R2 对象 key，所以 id 不能在插入时才产生。 */
  id: string;
  /**
   * 各语言的文案。**中文那份必填**（`texts.zh.title` 是这张卡片的身份，也是
   * `games.title` 那一列 —— NOT NULL —— 的来源）；其余语言有就带、没有就不带。
   *
   * ⚠️ `developer` 那一栏**不用调用方填**：开发商名字由本模块按 `developerId` 反查后
   *    写进每一份文案（见下面的 `resolveDeveloper` / `withDeveloper`）。
   */
  texts: GameTexts;
  imageUrl: string;
  /** R2 对象 key。**不存 ROM 时传空串** —— 那时 `sourceUrl` 必须有值。 */
  romKey: string;
  /**
   * 源站 ROM 地址（`site:/…` / `files:/…`）。`null` = 本站自持（走 R2）。
   * 2026-10-16 加 —— 后台爬取可以选「不保存 ROM」，这时只留来源地址。
   */
  sourceUrl: string | null;
  romName: string;
  consoleType: ConsoleType;
  language: string | null;
  year: number | null;
  /** 开发商外键（`/api/admin/developers` 那个下拉框选出来的 id）。名字由本模块反查。 */
  developerId: string | null;
}

/**
 * 把开发商名字填进每一份文案 —— `developer` 那一栏是**快照**，由本模块按外键反查后写，
 * 调用方不用（也不该）自己传（同 `games.developer` 那两列的老规矩）。
 *
 * 规则：**只取该语言自己那份厂名**（`rawEntityName`），没有就写 `null`。
 * 也就是**写入时不做中文回退** —— 回退是读取那条路的事（`localizeTexts` 逐字段回退中文，
 * 效果一模一样），而`{ locale: 'en' }` 里塞一份中文厂名会让库里再也看不出「英文名到底翻没翻」。
 *
 * ⚠️ 这条规则**必须与 `developers.ts` 里「改名级联」算出来的值逐字一致**（那边同样的
 *    `rawEntityName` 按语言取）：两处不一致的话，改一次开发商名，两份数据就会漂开。
 */
function withDeveloper(texts: GameTexts, devTexts: EntityTexts): GameTexts {
  const result: GameTexts = {};
  for (const locale of CONTENT_LOCALES) {
    const text = texts[locale];
    if (!text) continue;
    result[locale] = {
      ...text,
      developer: rawEntityName(devTexts, locale),
    };
  }
  return result;
}

/**
 * 把一份 `GameTexts` 写进侧表（upsert）。
 *
 * ⚠️ 参数是 **`group_key`**（不是游戏 id，2026-10-16 改）：同款的几条语言版本记录
 *    共用这一份文案 —— 所以后台改一条 = 改整款。
 *
 * ⚠️ **只 upsert 传进来的那几个语言，别的行一概不动**：调用方（后台接口）现在四个语言
 *    都带，而库里可能还有将来才加的语言 —— 不能顺手删掉。（这也是「加语言 = 插数据」的
 *    前提：谁写谁的语言，互不干扰。）
 *
 * ⚠️ **全空的那一份会整行删掉**，而不是写一行全 NULL：后台把英文那几栏清空之后，
 *    留一行「什么都没写」的英文行没有意义，还会让 `Game.texts.en` 变成一个空壳。
 *    中文那份**永远不删**（它是原文，也是 `games.title` 的来源）。
 *
 * 一次写一条语句，最多四条（四种语言）—— 后台写入是低频操作，不值得为它拼多值 VALUES。
 */
async function writeTexts(groupKey: string, texts: GameTexts): Promise<void> {
  const now = Date.now();
  for (const locale of CONTENT_LOCALES) {
    const text = texts[locale];
    if (!text) continue;

    if (isBlankGameText(text)) {
      if (locale === 'zh') continue;
      await query('DELETE FROM game_texts WHERE group_key = ? AND locale = ?', [groupKey, locale]);
      continue;
    }

    await query(
      `INSERT INTO game_texts (group_key, locale, title, series, developer, description, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(group_key, locale) DO UPDATE SET
         title       = excluded.title,
         series      = excluded.series,
         developer   = excluded.developer,
         description = excluded.description,
         updated_at  = excluded.updated_at`,
      [groupKey, locale, text.title, text.series, text.developer, text.description, now]
    );
  }
}

export async function insertGame(input: NewGame): Promise<Game & { group: GameGroupInfo }> {
  const { id } = input;
  const createdAt = Date.now();
  const developer = await resolveDeveloper(input.developerId);

  const texts = withDeveloper(input.texts, developer.texts);
  const zh = texts.zh ?? EMPTY_GAME_TEXT;
  const en = texts.en ?? null;

  /*
   * `texts.zh.title` 是必填的：它既是这张卡片的身份，也是 `games.title`（NOT NULL）
   * 的值。缺了就是调用方的编程错误，直接抛比往库里写一条没有名字的游戏强。
   */
  if (!zh.title) throw new Error('insertGame：缺少中文标题（texts.zh.title 必填）');

  /*
   * 同款聚合键：先按「中文标题 + 机种 + 开发商」反查已有的一款，查到就挂上去、
   * 查不到才新开（见 resolveGroupKey）。**必须在 INSERT 之前算** —— 反查是按中文标题
   * 找的，这一行自己插进去之后再查会命中自己。
   *
   * ⚠️ 反查用的是 `zh.title`（**不是** `games.title` 那个投影列）：迁移后主名字的唯一
   *    出处是侧表，投影列将来可能被清理。
   *
   * ⚠️ `group` 会被原样带进返回值 —— 后台靠它显示「已归入《XXX》」（见 GameGroupInfo）。
   */
  const group = await resolveGroupKey(zh.title, input.consoleType, developer.id);
  const groupKey = group.key;

  /*
   * ⚠️ 那 8 个旧文案列**照旧一起写**（中英两份的投影，见文件头那段）：
   *    `title` 是 NOT NULL 本来就必须写，索性把中英两份都投影过去，
   *    万一要回滚到「读宽表」的老代码，旧列里是完整的中英文案。
   *    **读取一律走 `game_texts`** —— 这些列只写不读。
   */
  await query(
    `INSERT INTO games
       (id, title, title_en, image_url, rom_url, source_url, rom_name, console_type, language,
        group_key, series, series_en, year, developer, developer_en, developer_id,
        description, description_en, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      zh.title,
      en?.title ?? null,
      input.imageUrl,
      input.romKey,
      // 不存 ROM 时是 null；有值时前台**优先**读它（见 app/api/games/[id]/rom）
      input.sourceUrl,
      input.romName,
      input.consoleType,
      input.language,
      groupKey,
      zh.series,
      en?.series ?? null,
      input.year,
      developer.name,
      developer.nameEn,
      developer.id,
      zh.description,
      en?.description ?? null,
      createdAt,
    ]
  );

  // 文案进侧表（真正的读取来源）—— 挂 group_key，同款共用一份
  await writeTexts(groupKey, texts);

  // 新增的游戏让按 id 的缓存层立刻可命中（否则 24 小时内缓存层会回 null → 404）
  revalidateTag('games', { expire: 0 });

  return {
    id,
    texts,
    imageUrl: input.imageUrl,
    romName: input.romName,
    consoleType: input.consoleType,
    language: input.language,
    year: input.year,
    developerId: developer.id,
    createdAt,
    // 归组结果（只给后台提示用，别的地方不读它）
    group,
  };
}

/**
 * 单条游戏的元数据修改。封面与 ROM 不在可改范围内（要换只能删了重加）。
 *
 * ⚠️ `texts` 由调用方带齐**中英两份**（后台表单就是这两栏）：漏掉哪一份，哪一份的侧表行
 *    就不会被碰（既不会更新、也不会清空）—— 那是「部分更新」的语义，不是 bug。
 *    目前唯一的调用方（PATCH /api/admin/games/<id>）每次都带齐。
 */
export interface GamePatch {
  texts: GameTexts;
  consoleType: ConsoleType;
  language: string | null;
  year: number | null;
  /** 同 `NewGame.developerId`：名字由本模块反查，调用方只给 id。 */
  developerId: string | null;
}

export async function updateGame(id: string, patch: GamePatch): Promise<void> {
  const developer = await resolveDeveloper(patch.developerId);

  const texts = withDeveloper(patch.texts, developer.texts);
  const zh = texts.zh ?? EMPTY_GAME_TEXT;
  const en = texts.en ?? null;

  if (!zh.title) throw new Error('updateGame：缺少中文标题（texts.zh.title 必填）');

  /*
   * 文案挂在哪一款上（group_key）—— 这里**只读不改**：改机种 / 换开发商会让「同款签名」
   * 变了，但已经归好的组**不重新算**。重算的后果是「改一次机种，这一款就散成两个组」——
   * group_key 的稳定性比「签名永远最新」重要得多（真要合并 / 拆分同款，那是一件该单独
   * 做的事，不该是改个年份的副作用）。
   *
   * ⚠️ 迁移前的老行可能还没有 group_key —— 退回它自己的 id，正好等于
   *    `loadGameTexts` 那边 COALESCE 兜底出来的值，不会错位。
   */
  const row = await getGameRow(id);
  if (!row) throw new Error('updateGame：找不到这条记录');
  const groupKey = row.group_key ?? id;

  /*
   * ⚠️ `developer` / `developer_en` **也在这里写**（而不是等后台「开发商改名」那一步级联）：
   *    用户点「保存」时可能刚把开发商从 A 换成 B，此时必须用 B 的 `name_en` 覆盖。
   *    只写 id 不写名字快照的话，卡片上会留着 A 的英文名。
   *
   * ⚠️ 这几列和 `game_texts` 里的 `developer` 是**两处**，必须一起写 —— 后者才是读取来源。
   */
  await query(
    `UPDATE games
        SET title = ?, title_en = ?, console_type = ?, language = ?, series = ?, series_en = ?,
            year = ?, developer = ?, developer_en = ?, developer_id = ?,
            description = ?, description_en = ?
      WHERE id = ?`,
    [
      zh.title,
      en?.title ?? null,
      patch.consoleType,
      patch.language,
      zh.series,
      en?.series ?? null,
      patch.year,
      developer.name,
      developer.nameEn,
      developer.id,
      zh.description,
      en?.description ?? null,
      id,
    ]
  );

  /*
   * 文案进侧表 —— 挂 **group_key**：改一条 = 改整款（同款的几个语言版本共用这一份）。
   * 后台从哪一条点进来改都一样，改完那几条记录的卡片同时变。
   */
  await writeTexts(groupKey, texts);

  // 元数据变了，按 id 的缓存必须立刻失效（详情页 / ROM 代理读的是这份）
  revalidateTag('games', { expire: 0 });
}

export async function deleteGame(id: string): Promise<void> {
  /*
   * ⚠️ 文案行必须**晚一步**清（2026-10-16 改）：同款的几个语言版本共用一份文案，
   *    只有这个 group 下**最后一盘 ROM 也没了**，那几行文案才该跟着消失。
   *    顺序反了就会把还在库里的另外几个语言版本的文案一起清掉 ——
   *    它们的记录还在，但突然没了名字。
   *
   * ⚠️ 先读 group_key：删完 games 行之后就查不到它了。
   */
  const rows = await query<{ group_key: string | null }>(
    'SELECT group_key FROM games WHERE id = ?',
    [id]
  );
  const groupKey = rows[0]?.group_key ?? id;

  await query('DELETE FROM games WHERE id = ?', [id]);
  await query(
    `DELETE FROM game_texts
      WHERE group_key = ?
        AND NOT EXISTS (SELECT 1 FROM games WHERE group_key = ?)`,
    [groupKey, groupKey]
  );
  // 删掉的游戏不能再被按 id 的缓存当成「还在」（否则 ROM 代理 / 详情页 24 小时内不 404）
  revalidateTag('games', { expire: 0 });
}