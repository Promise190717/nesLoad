/*
 * 游戏元数据（games 表）的读写。
 *
 * DB 里存的是 R2 对象 key（rom_url）与图片公网 URL（image_url）；对外的 Game
 * 结构把列名转成前端友好的 camelCase，且**不**把 rom_url 暴露出去（前台按 id 走代理取 ROM）。
 *
 * ## 双语（2026-10-13 加）
 *
 * 库里的文案字段成对出现：**无后缀 = 中文原文，`_en` = 英文**。`title` / `series` /
 * `developer` / `description` 各有一份 `_en`。
 *
 * ⚠️ **`Game` 把两种语言都带出来**（`title` + `titleEn`…），而不是只给一种。
 *    决定用哪一份是**渲染时**的事，由 `localizeGame(game, locale)` 做。理由：
 *    列表读取走 `unstable_cache`，而**缓存键里没有语言这一维**（见下面那段注释）——
 *    如果数据层按 locale 只返回一种，中英文访客就会共用一份「只有中文」的缓存。
 *    两份都带出来，缓存与语言无关，取值下放到页面。
 *
 * ⚠️ `localizeGame` 的**回退规则**：英文站优先 `xxxEn`，**空了回退中文原值**（不是空串）。
 *    这样后台只补了一部分英文时，没补的那些仍显示中文，而不是一页空白。
 *    中文站反过来不做回退（原文是必填的 `title`，其余按原样）。
 */

import { unstable_cache } from 'next/cache';
import type { ConsoleType } from '@/lib/emulator';
import type { Locale } from '@/lib/i18n';
import { query } from './d1';
import { getDeveloperRow } from './developers';

/** DB 行（snake_case）。 */
export interface GameRow {
  id: string;
  title: string;
  /** 游戏名英文（可空）。空 = 英文站回退 `title`。2026-10-13 加。 */
  title_en: string | null;
  image_url: string;
  rom_url: string;
  rom_name: string;
  console_type: ConsoleType;
  language: string | null;
  series: string | null;
  /** 系列英文（可空）。2026-10-13 加。 */
  series_en: string | null;
  year: number | null;
  developer: string | null;
  /** 开发商名英文快照（可空）。2026-10-13 加，随 developers.name_en 走。 */
  developer_en: string | null;
  /** 开发商外键（可空）。空 = 没接上开发商库，只有 `developer` 那列文字。 */
  developer_id: string | null;
  description: string | null;
  /** 说明英文（可空）。2026-10-13 加。 */
  description_en: string | null;
  created_at: number;
}

/**
 * 对外结构（camelCase，供 API / 前端）。
 *
 * ⚠️ 中英两份**同时**带出来（见文件头那段）。前端要显示哪一份由 `localizeGame` 决定，
 *    接口（`/api/games`）吐的是**完整两份**，因为客户端拿到之后还要跟着界面语言切换
 *    （房间那侧的语言是运行时切的，不是每次请求都重取数据）。
 */
export interface Game {
  id: string;
  title: string;
  /** 空 = 英文站回退 `title` */
  titleEn: string | null;
  imageUrl: string;
  romName: string;
  consoleType: ConsoleType;
  language: string | null;
  series: string | null;
  seriesEn: string | null;
  year: number | null;
  developer: string | null;
  developerEn: string | null;
  /** 开发商页的地址片段（`/developers/<id>`）。为 null 时详情页那个名字就不做链接。 */
  developerId: string | null;
  /** 说明 / 简介（可空）。前台只拿它当卡片上的悬停提示，不进列表正文。 */
  description: string | null;
  descriptionEn: string | null;
  createdAt: number;
}

/** 已按语言选定的游戏文案（`localizeGame` 的产物）—— 四种文案字段都变成**单个值**。 */
export interface LocalizedGameText {
  title: string;
  series: string | null;
  developer: string | null;
  description: string | null;
}

function toGame(row: GameRow): Game {
  return {
    id: row.id,
    title: row.title,
    titleEn: row.title_en,
    imageUrl: row.image_url,
    romName: row.rom_name,
    consoleType: row.console_type,
    language: row.language,
    series: row.series,
    seriesEn: row.series_en,
    year: row.year,
    developer: row.developer,
    developerEn: row.developer_en,
    developerId: row.developer_id,
    description: row.description,
    descriptionEn: row.description_en,
    createdAt: row.created_at,
  };
}

/**
 * 按语言取一条游戏的文案。**英文站空值回退中文**（见文件头那条规则）。
 *
 * 纯函数、不碰数据库 —— 页面 / 组件拿到完整 `Game` 之后调它。
 * 中文站直接返回原值（不走 `??`，因为原文就是「这一份」）。
 */
export function localizeGame(game: Game, locale: Locale): LocalizedGameText {
  if (locale !== 'zh') {
    return {
      title: game.titleEn || game.title,
      series: game.seriesEn || game.series,
      developer: game.developerEn || game.developer,
      description: game.descriptionEn || game.description,
    };
  }
  return {
    title: game.title,
    series: game.series,
    developer: game.developer,
    description: game.description,
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
 * ⚠️ 2026-10-13 起**中英两份都搜**（加了 `_en` 三列）。为什么不按当前语言只搜一份：
 *    ① 搜索是发生在服务端的、按页取的，把语言传进来会让 `unstable_cache` 的键多一维、
 *       缓存直接劈成两份（见下面 listGamesPageCached 的说明）；
 *    ② 中文站搜「Contra」能命中、英文站搜「魂斗罗」也能命中，对用户是**纯收益**
 *       —— 没有谁会因为「搜到了本不该出现的另一种语言」而不满。
 *
 * `json_each` 那条 OR 是历史写法（和上面几条等价，属于冗余），保留不动 —— 删它要动
 * 绑定值编号（?1），收益为零、风险不小。
 *
 * ⚠️ **它内部把绑定值写死成 `?1`**（同一条件里出现多次，复用同一个值）。
 * 所以调用方必须保证「关键词」是**第 1 个**绑定参数 —— 见 `listGamesPage` 里拼条件的顺序。
 */
const SEARCH_CONDITION = `(
  title LIKE ?1 OR
  developer LIKE ?1 OR
  series LIKE ?1 OR
  title_en LIKE ?1 OR
  developer_en LIKE ?1 OR
  series_en LIKE ?1 OR
  EXISTS (
    SELECT 1 FROM json_each(json_array(
      COALESCE(title, ''), COALESCE(developer, ''), COALESCE(series, ''),
      COALESCE(title_en, ''), COALESCE(developer_en, ''), COALESCE(series_en, '')
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
 * 首页那几个「由 D1 拼出来的区块」的缓存时长（秒）= 24 小时（2026-10-13 用户定）。
 *
 * ⚠️ 和 `GAMES_PAGE_REVALIDATE_SECONDS`（30 分钟）**刻意不是同一个数**，也别拿哪边去
 *    统一：两者服务的是两种页面。`/games` 是「来找游戏」的货架，后台传完一款就该尽快
 *    看到；首页是**落地页** —— 它那三个区块（机种计数 / 最新 12 款 / 主力厂商）只是
 *    「这个站里有什么」的招牌，晚一天更新没有任何代价，而每个访客都打三趟 D1 有代价。
 *    共用的是底层那次查询（`listGamesPage`），缓存在页-侧各存各的（键前缀不同）。
 *
 * 这个数只写在这里，首页读常量；`lib/server/developers.ts` 里另有一份**等值的手抄**
 * （那个文件不许 import 本文件，见它的文件头那条单向依赖）。
 */
export const HOME_REVALIDATE_SECONDS = 86400;

/**
 * 带缓存的列表读取 —— **只给 `/games` 列表页用**，别处的调用方继续用 `listGamesPage`。
 *
 * ⚠️ 为什么不直接在 `listGamesPage` 里加缓存：那个函数被三个地方共用 ——
 * 前台在线库弹窗（`/api/games`）、后台列表（`/api/admin/games`）、以及列表页。
 * 后两个**必须立刻看到刚上传的数据**（后台传完一款游戏，列表里却要等半小时才出现，
 * 那是 bug 不是缓存）。所以缓存是**页面这一侧的策略**，不该下沉到数据层。
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
 * 缓存键里**不含语言**，这是对的：返回的 `Game` **两种语言都带**（`title` + `titleEn`…），
 * 跟 cookie 无关；选哪一份由页面调 `localizeGame(game, locale)` 决定。
 * 也就是说中英文访客共用同一份缓存是**有意**的 —— 这也是「数据层不按语言裁剪」的原因
 * （见文件头那段）：数据层一裁剪，这份共用的缓存就只对一种语言正确了。
 */
export const listGamesPageCached = unstable_cache(
  async (offset: number, limit: number, keyword: string, consoleType: ConsoleType | null) =>
    listGamesPage(offset, limit, { keyword, consoleType }),
  ['games:list'],
  { revalidate: GAMES_PAGE_REVALIDATE_SECONDS }
);

/**
 * 首页「最新收录」区块要的那几款 —— 首页专用，**别拿 `listGamesPageCached` 顶替**。
 *
 * 两者查的是同一张表、都从第 0 条开始，差别只在 TTL（24 小时 vs 30 分钟）：首页是招牌，
 * `/games` 是货架。各自一份缓存条目（键前缀 `games:latest` vs `games:list`），互不影响 ——
 * 后台传一款新游戏，半小时后在 `/games` 上出现，首页则要等第二天。
 *
 * 参数收成一个 `limit`：首页永远是**第一页、无关键词、不筛机种**，把 offset / keyword
 * 那几维摆出来只会让人以为首页也能翻页。将来首页真要能翻页，再照着 `listGamesPageCached`
 * 的形状加参数，并且**必须同步改缓存键** —— 键不变而语义变了，旧缓存会串味。
 */
export const listLatestGamesCached = unstable_cache(
  async (limit: number) => listGamesPage(0, limit, {}),
  ['games:latest'],
  { revalidate: HOME_REVALIDATE_SECONDS }
);

/**
 * 各机种各有几款游戏 —— 首页那个「按机种浏览」区块的四张卡片用。
 *
 * 一条 `GROUP BY` 就够（库里机种只有四种，行数恒等于「有游戏的机种数」）。
 *
 * ⚠️ **`GROUP BY` 只返回「库里出现过」的机种** —— 某一档一款都没有时那一行压根不存在，
 *    调用方拿到 `undefined` 就会在界面上渲染出一个空洞。所以下面先铺满四个 0 再填。
 *    加机种要同步这个初始化对象（`ConsoleType` 联合类型会在编译期提醒你）。
 *
 * 排序不在这里定：**展示顺序是界面的事**（`components/CartridgeSprite.tsx` 的
 * `CONSOLE_TYPES`），这里只回答「各有多少」。
 */
export async function countGamesByConsole(): Promise<Record<ConsoleType, number>> {
  const rows = await query<{ console_type: ConsoleType; total: number }>(
    'SELECT console_type, COUNT(*) AS total FROM games GROUP BY console_type'
  );

  const counts: Record<ConsoleType, number> = { nes: 0, snes: 0, gba: 0, arcade: 0 };
  for (const row of rows) counts[row.console_type] = Number(row.total);
  return counts;
}

/**
 * `countGamesByConsole` 的缓存版 —— **只给首页用**，理由和 `listLatestGamesCached` 一样：
 * 首页是给爬虫和过路访客看的招牌，内容变得很慢（只有后台上传游戏时才变），
 * 而每个访客都要打一次 D1 不划算。TTL 走首页的 24 小时（`HOME_REVALIDATE_SECONDS`）。
 *
 * ⚠️ 后台自己那张列表**不读它**（那边要立刻看到刚传的游戏），所以缓存留在这一层，
 *    别下沉到 `countGamesByConsole` 里 —— 和 `listLatestGamesCached` 同一条规矩。
 */
export const countGamesByConsoleCached = unstable_cache(
  async () => countGamesByConsole(),
  ['games:console-counts'],
  { revalidate: HOME_REVALIDATE_SECONDS }
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
 * 找「同名**且语言相同**」的那一条 —— 给后台「添加 / 修改游戏」判重用。
 *
 * 为什么判重必须落在服务端：列表是**分页**的，前端手里只有当前页，
 * 在浏览器里比名字一定会漏（同名的那条很可能在别的页上）。
 *
 * 比较规则：
 *  - `title` 精确匹配、但**忽略 ASCII 大小写**（`COLLATE NOCASE`）——
 *    英文名 `Castlevania` 与 `castlevania` 该算同名；中文不受影响（NOCASE 只作用于 ASCII）。
 *    传进来的名字先 trim 一次，别让首尾空格绕过去。
 *  - `language` **也必须相同**才算重复（2026-10-13 加）：同一款游戏的「日版 / 美版 /
 *    中文版」是几条合法记录，只按名字拦会把这些全挡在门外。
 *    两边都为空（老数据、没标语言的）算**相同** —— 都没标语言又同名，那就是重复。
 *  - **只比 `title`，不比 `title_en`** —— 「同名」按站内主名字（中文原文）算。
 *
 * `excludeId` 是给**修改**（PATCH）用的：那条记录当然和自己的名字 / 语言一致，
 * 不排掉自己，改个年份都会被自己拦住。也正因为排掉了自己，**库里已经存在的重复行**
 * 不会把「把重复那条改名改掉」这条路堵死 —— 新名字查不到别人才放行。
 *
 * ⚠️ 没建索引：这张表就几百上千行，全表扫一遍可以忽略；真要加也是后话。
 */
export async function findGameDuplicate(
  title: string,
  language: string | null,
  excludeId: string | null = null
): Promise<{ id: string; title: string; language: string | null } | null> {
  /*
   * COLLATE 显式挂在**左边**那个 title 上：SQLite 的规则是「哪边显式指定就听哪边」，
   * 挂左边最不容易被将来的改写弄丢。
   *
   * 空语言不写成 `language IS ?`：`IS` 虽然 NULL 安全，但管不到**空串**这种历史脏数据
   * （插入路径会把空串收敛成 NULL，但迁移前的老行未必）。
   */
  const conditions = ['title COLLATE NOCASE = ?'];
  const params: unknown[] = [title.trim()];

  if (language) {
    conditions.push('language = ?');
    params.push(language);
  } else {
    conditions.push("(language IS NULL OR language = '')");
  }

  if (excludeId) {
    conditions.push('id <> ?');
    params.push(excludeId);
  }

  const rows = await query<{ id: string; title: string; language: string | null }>(
    `SELECT id, title, language FROM games WHERE ${conditions.join(' AND ')} LIMIT 1`,
    params
  );
  return rows[0] ?? null;
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
 * 由开发商 id 反查名字（中英两份）—— `games.developer` / `games.developer_en`
 * 两个快照列要跟着一起写。
 *
 * 为什么放在这里、而不是让接口层各传一份名字：四个值（`developer` / `developer_en` 与
 * `developer_id`）**必须同进同出**（搜索、列表卡片、详情页资料表读的是名字，开发商页读的是 id）。
 * 让调用方自己保证它们一致，早晚会有人只传一个。
 *
 * 认不出的 id 当作「没选」处理（全部置空），不给库里留一条指向空气的关联。
 */
async function resolveDeveloper(
  developerId: string | null
): Promise<{ id: string | null; name: string | null; nameEn: string | null }> {
  if (!developerId) return { id: null, name: null, nameEn: null };
  const row = await getDeveloperRow(developerId);
  return row
    ? { id: row.id, name: row.name, nameEn: row.name_en }
    : { id: null, name: null, nameEn: null };
}

export interface NewGame {
  /** 由调用方生成：上传前要先拿它拼 R2 对象 key，所以 id 不能在插入时才产生。 */
  id: string;
  title: string;
  /** 英文名（可空）。后台「英文字段」那一栏。 */
  titleEn: string | null;
  imageUrl: string;
  romKey: string;
  romName: string;
  consoleType: ConsoleType;
  language: string | null;
  series: string | null;
  seriesEn: string | null;
  year: number | null;
  /** 开发商外键（`/api/admin/developers` 那个下拉框选出来的 id）。名字由本模块反查。 */
  developerId: string | null;
  description: string | null;
  descriptionEn: string | null;
}

export async function insertGame(input: NewGame): Promise<Game> {
  const { id } = input;
  const createdAt = Date.now();
  const developer = await resolveDeveloper(input.developerId);

  await query(
    `INSERT INTO games
       (id, title, title_en, image_url, rom_url, rom_name, console_type, language, series, series_en,
        year, developer, developer_en, developer_id, description, description_en, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.title,
      input.titleEn,
      input.imageUrl,
      input.romKey,
      input.romName,
      input.consoleType,
      input.language,
      input.series,
      input.seriesEn,
      input.year,
      developer.name,
      developer.nameEn,
      developer.id,
      input.description,
      input.descriptionEn,
      createdAt,
    ]
  );
  return {
    id,
    title: input.title,
    titleEn: input.titleEn,
    imageUrl: input.imageUrl,
    romName: input.romName,
    consoleType: input.consoleType,
    language: input.language,
    series: input.series,
    seriesEn: input.seriesEn,
    year: input.year,
    developer: developer.name,
    developerEn: developer.nameEn,
    developerId: developer.id,
    description: input.description,
    descriptionEn: input.descriptionEn,
    createdAt,
  };
}

/** 单条游戏的元数据修改。封面与 ROM 不在可改范围内（要换只能删了重加）。 */
export interface GamePatch {
  title: string;
  titleEn: string | null;
  consoleType: ConsoleType;
  language: string | null;
  series: string | null;
  seriesEn: string | null;
  year: number | null;
  /** 同 `NewGame.developerId`：名字由本模块反查，调用方只给 id。 */
  developerId: string | null;
  description: string | null;
  descriptionEn: string | null;
}

export async function updateGame(id: string, patch: GamePatch): Promise<void> {
  const developer = await resolveDeveloper(patch.developerId);

  /*
   * ⚠️ `developer_en` **也在这里写**（而不是等后台「开发商改名」那一步级联）：
   *    用户点「保存」时可能刚把开发商从 A 换成 B，此时必须用 B 的 `name_en` 覆盖。
   *    只写 id 不写名字快照的话，卡片上会留着 A 的英文名。
   */
  await query(
    `UPDATE games
        SET title = ?, title_en = ?, console_type = ?, language = ?, series = ?, series_en = ?,
            year = ?, developer = ?, developer_en = ?, developer_id = ?,
            description = ?, description_en = ?
      WHERE id = ?`,
    [
      patch.title,
      patch.titleEn,
      patch.consoleType,
      patch.language,
      patch.series,
      patch.seriesEn,
      patch.year,
      developer.name,
      developer.nameEn,
      developer.id,
      patch.description,
      patch.descriptionEn,
      id,
    ]
  );
}

export async function deleteGame(id: string): Promise<void> {
  await query('DELETE FROM games WHERE id = ?', [id]);
}