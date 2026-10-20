/*
 * 机种库（consoles 表 + console_texts 侧表）的读写。
 *
 * 和 developers.ts 同一套做法，但有一个本质区别（见 db/schema.sql 那段说明）：
 * **主键是 `console_type` 本身**（'nes' / 'snes' / 'gba' / 'arcade' 等十二个，代码里的
 * `ConsoleType` 枚举），不是 UUID。这张表是机种**资料的扩展**，不是机种的**清单** ——
 * 机种的清单住在 `lib/consoles.ts` 的 `CONSOLE_TYPES` 里（加机种是改代码的事）。
 * 某一行被删了，前台页面对照 `CONSOLE_TYPES` 退回默认渲染，游戏一根毫毛都不少
 * （`games.console_type` 存的本来就是这些枚举值，天生就是关联）。
 *
 * ⚠️ **本文件不许 import `./games.ts`**（单向依赖：games → consoles，和 developers 同一条规矩）。
 * 「某个机种有几款游戏」用一条相关子查询现算。
 *
 * ## 多语言侧表（2026-10-16 加）
 *
 * 文案（name / summary / description）不再平铺在 consoles 表里，而是搬到
 * `console_texts` 侧表 —— 加语言 = 插数据，不动表结构。
 * `consoles` 表里那 6 个旧列（name / name_en / summary / summary_en /
 * description / description_en）保留、但只写不读，作为回滚退路。
 */

import { cached } from './cache';
import { mediaUrl } from './media';
import { query } from './pg';
import {
  EMPTY_ENTITY_TEXT,
  isBlankEntityText,
  localizeEntityTexts,
  type EntityTexts,
  type LocalizedEntityText,
} from '@/lib/entity-text';

/** DB 行（snake_case，只含 consoles 表本身的列）。 */
export interface ConsoleRow {
  console_type: string;
  image_url: string | null;
  release_year: number | null;
  created_at: number;
}

/** 对外结构（camelCase，供 API / 前端）。 */
export interface Console {
  /** 机种标识 = `ConsoleType`（十二个之一），同时也是 URL 里那段 */
  type: string;
  /** 多语言文案（从 console_texts 侧表读取） */
  texts: EntityTexts;
  imageUrl: string | null;
  releaseYear: number | null;
  createdAt: number;
  /**
   * 名下游戏数（相关子查询，和 developers.gameCount 同一套）。
   * ⚠️ 只有 `listConsoles`（带缓存）会真算；`getConsole` 恒为 0 —— 专题页的
   *    数字走 `countGamesCached`，别再读这里（见 getConsole 注释）。
   */
  gameCount: number;
}

/** 按语言取一个机种的文案。纯函数，不碰数据库。 */
export function localizeConsole(consoleObj: Console, locale: string): LocalizedEntityText {
  return localizeEntityTexts(consoleObj.texts, locale);
}

/** 兼容旧名 —— 前台页面仍在 import 它。 */
export type LocalizedConsoleText = LocalizedEntityText;

/** 「名下有几款游戏」那条相关子查询 —— 列表和单条都要它，别两处各写一份。 */
const GAME_COUNT = '(SELECT COUNT(*) FROM games g WHERE g.console_type = consoles.console_type) AS game_count';

function toConsole(row: ConsoleRow & { game_count?: number }, texts: EntityTexts = {}): Console {
  return {
    type: row.console_type,
    texts,
    // 库里存路径，域名现拼（见 lib/server/media.ts）
    imageUrl: mediaUrl(row.image_url),
    releaseYear: row.release_year,
    createdAt: row.created_at,
    gameCount: Number(row.game_count ?? 0),
  };
}

/** 批量加载机种文案。 */
async function loadConsoleTexts(types: string[]): Promise<Map<string, EntityTexts>> {
  if (types.length === 0) return new Map();
  const placeholders = types.map(() => '?').join(',');
  const rows = await query<{
    console_type: string;
    locale: string;
    name: string | null;
    summary: string | null;
    description: string | null;
  }>(
    `SELECT console_type, locale, name, summary, description
       FROM console_texts WHERE console_type IN (${placeholders})`,
    types
  );

  const map = new Map<string, EntityTexts>();
  for (const r of rows) {
    if (!map.has(r.console_type)) map.set(r.console_type, {});
    map.get(r.console_type)![r.locale as import('@/lib/game-text').ContentLocale] = {
      name: r.name,
      summary: r.summary,
      description: r.description,
    };
  }
  return map;
}

/** 写机种文案侧表。 */
async function writeConsoleTexts(type: string, texts: EntityTexts): Promise<void> {
  for (const locale of ['zh', 'en', 'ja', 'ko'] as const) {
    const t = texts[locale] ?? EMPTY_ENTITY_TEXT;
    if (isBlankEntityText(t) && locale !== 'zh') continue;
    await query(
      `INSERT INTO console_texts (console_type, locale, name, summary, description, updated_at)
       VALUES (?, ?, ?, ?, ?, now())
       ON CONFLICT(console_type, locale) DO UPDATE SET
         name = excluded.name,
         summary = excluded.summary,
         description = excluded.description,
         updated_at = now()`,
      [type, locale, t.name, t.summary, t.description]
    );
  }
}

/**
 * 全部机种资料行（带名下游戏数 + 侧表文案）。**只返回库里有的行** —— 某个机种还没在后台填过资料时
 * 它就不在结果里，调用方（前台页面 / 后台列表）负责对照 `CONSOLE_TYPES` 补默认值，
 * 本函数不知道枚举的存在（数据层不该反过来依赖组件）。
 */
export async function listConsoles(): Promise<Console[]> {
  const rows = await query<ConsoleRow & { game_count: number }>(
    `SELECT console_type, image_url, release_year,
            (EXTRACT(EPOCH FROM created_at) * 1000)::float8 AS created_at,
            ${GAME_COUNT}
       FROM consoles ORDER BY sort_order ASC, console_type ASC`
  );
  const textsMap = await loadConsoleTexts(rows.map((r) => r.console_type));
  return rows.map((r) => toConsole(r, textsMap.get(r.console_type) ?? {}));
}

/**
 * 机种列表页（`/consoles`）那份缓存的时长（秒）= 30 天。
 *
 * ⚠️ 2026-10-16 从 12 小时提到 24 小时（用户要求「所有列表页统一 24 小时」）；
 *    2026-10-20 用户又要求首页 / 列表页 / 详情页统一 30 天，于是 24 小时 → 30 天。
 *    代价：后台改完机种资料，这一页最多晚 30 天才更新（机种专题页上机种自己的资料
 *    **不缓存**，那边改完是立刻的）。
 *
 * 缓存键里没有语言（`Console` 的 `texts` 带了所有语言），用哪份由页面调 `localizeConsole` 决定。
 */
export const CONSOLES_PAGE_REVALIDATE_SECONDS = 2592000;

/**
 * `listConsoles` 的缓存版 —— **只给前台用**；后台必须走未缓存的那份。
 *
 * ⚠️ 改完机种资料要把键尾的版本号 +1：缓存条目不随部署失效，不换键前台要等一个 TTL
 *    才看得到新图新简介（2026-10-14 补机图时从 v1 升到了 v2，2026-10-15 补 nds 图升到 v3，
 *    2026-10-16 加多语言侧表升到 v4，同日补日韩文案升到 v5，同日加 ps1 机种升到 v6，
 *    2026-10-19 nes 中文名改「红白机（FC）」升到 v7）。
 */
const listConsolesCachedRaw = cached(
  async () => listConsoles(),
  ['consoles:list', 'v8'],
  { revalidate: CONSOLES_PAGE_REVALIDATE_SECONDS }
);

/** 全部机种资料 —— 直接读库（源站模式已随 2026-10-20 的迁移一起删掉）。 */
export async function listConsolesCached(): Promise<Console[]> {
  return listConsolesCachedRaw();
}

/**
 * 按机种标识取一条资料。机种专题页在用。
 *
 * ⚠️ **不缓存** —— 和 developers 的 getDeveloper 同一条理由：后台改完资料刷新就该看到。
 * 查不到（这个机种还没填过资料）返回 null，调用方自己退回默认渲染。
 *
 * ⚠️ **2026-10-14 起不再顺带算 game_count**：那个相关子查询要按 `games.console_type`
 *    过滤，而这一列**没有索引**、本函数又不缓存 —— 专题页每个请求都得全表 COUNT 一遍
 *    （本函数曾以「行上顺带算」为卖点，实际是全站最贵的一次 COUNT）。页面已改用
 *    `countGamesCached` 那份缓存总数（见专题页 generateMetadata），调用方不要再读
 *    返回值里的 `gameCount`（恒为 0）。`listConsoles` 那边带缓存，子查询照留。
 */
export async function getConsole(type: string): Promise<Console | null> {
  const rows = await query<ConsoleRow>(
    `SELECT console_type, image_url, release_year,
            (EXTRACT(EPOCH FROM created_at) * 1000)::float8 AS created_at
       FROM consoles WHERE console_type = ?`,
    [type]
  );
  if (!rows[0]) return null;
  const texts = (await loadConsoleTexts([type])).get(type) ?? {};
  return toConsole(rows[0], texts);
}

/**
 * 前台机种专题页用的单条资料 —— 比 `getConsole` 多一层「数据从哪儿取」的判断。
 *
 * ⚠️ **为什么不在 `getConsole` 里判断**：那个函数后台也在用
 *    （`/api/admin/consoles/[id]` 的 GET / PATCH），后台必须永远读库 ——
 *    否则源站模式下后台点开一条机种资料会变成 404，再也改不了。
 *    同样的坑还有一个：`games.ts` 的写入路径用 `getDeveloper` 反查厂名，
 *    那边也不能跟着切（见 `developers.ts` 的 `getDeveloper`）。
 */
export async function getConsolePageData(type: string): Promise<Console | null> {
  return getConsole(type);
}

export interface ConsoleInput {
  texts: EntityTexts;
  /** 已经解析好的最终图片地址（没换图就是原来那张），不是上传上来的 File */
  imageUrl: string | null;
  releaseYear: number | null;
}

/**
 * 写入一个机种的资料。**存在就整行更新，不存在就插入**（upsert）——
 * 预填过的四个机种走 UPDATE 分支，所以后台「第一次保存」不会撞主键报错。
 *
 * 同时写：
 *   1. consoles 表（旧列投影，只写不读，回滚退路）；
 *   2. console_texts 侧表（真正被读取的来源）。
 */
export async function upsertConsole(type: string, input: ConsoleInput): Promise<void> {
  /* 新表没有 name / summary / description 那些列了 —— 文案一律进 console_texts */
  await query(
    `INSERT INTO consoles (console_type, image_url, release_year)
     VALUES (?, ?, ?)
     ON CONFLICT (console_type) DO UPDATE SET
       image_url = excluded.image_url,
       release_year = excluded.release_year`,
    [type, input.imageUrl, input.releaseYear]
  );

  await writeConsoleTexts(type, input.texts);
}

/**
 * 删一个机种的资料行（后台的「重置」）。
 *
 * ⚠️ **不做「名下有游戏不许删」的拦截** —— games.console_type 存的是枚举值，
 * 不依赖这一行；删掉之后前台页面对照 `CONSOLE_TYPES` 退回默认渲染，链接照常可达。
 * R2 上那张机图的清理由接口层负责（见 api/admin/consoles/[id] 的 DELETE）。
 */
export async function deleteConsole(type: string): Promise<void> {
  await query('DELETE FROM consoles WHERE console_type = ?', [type]);
  await query('DELETE FROM console_texts WHERE console_type = ?', [type]);
}

/**
 * 全部机种的「骨架」（标识与创建时间），给 sitemap 用 —— 理由和
 * `listGameStubs` / `listDeveloperStubs` 一样：sitemap 要一条不漏，
 * 而 `listConsoles` 带了一圈用不上的列。
 */
export async function listConsoleStubs(): Promise<{ type: string; createdAt: number }[]> {
  const rows = await query<{ console_type: string; created_at: number }>(
    `SELECT console_type, (EXTRACT(EPOCH FROM created_at) * 1000)::float8 AS created_at
       FROM consoles ORDER BY created_at DESC`
  );
  return rows.map((row) => ({ type: row.console_type, createdAt: row.created_at }));
}

/**
 * sitemap 用的 stub 读取 —— 缓存 24 小时（理由同 games.ts 的 listGameStubsCached）。
 *
 * ⚠️ 源站模式下**不查库**：那十四台机种的专题页永远可访问（资料行删了也会退回默认渲染，
 *    见本文件头部），所以照 `CONSOLE_TYPES` 直接给全量、`createdAt` 记 0（= 不知道收录时间）。
 */
export async function listConsoleStubsCached(): Promise<{ type: string; createdAt: number }[]> {
  return listConsoleStubsRaw();
}

const listConsoleStubsRaw = cached(
  async () => listConsoleStubs(),
  ['consoles:stubs'],
  { revalidate: 86400 }
);
