/*
 * 机种库（consoles 表）的读写。
 *
 * 和 developers.ts 同一套做法，但有一个本质区别（见 db/schema.sql 那段说明）：
 * **主键是 `console_type` 本身**（'nes' / 'snes' / 'gba' / 'arcade'，代码里的 `ConsoleType`
 * 枚举），不是 UUID。这张表是机种**资料的扩展**，不是机种的**清单** ——
 * 机种的清单住在 `components/CartridgeSprite.tsx` 的 `CONSOLE_TYPES` 里（加机种是改代码的事）。
 * 某一行被删了，前台页面对照 `CONSOLE_TYPES` 退回默认渲染，游戏一根毫毛都不少
 * （`games.console_type` 存的本来就是这些枚举值，天生就是关联）。
 *
 * ⚠️ **本文件不许 import `./games.ts`**（单向依赖：games → consoles，和 developers 同一条规矩）。
 * 「某个机种有几款游戏」用一条相关子查询现算。
 *
 * ## 双语
 *
 * `name` / `summary` / `description` 各有一份 `_en`（后缀 = 英文，无后缀 = 中文原文），
 * 取值规则和 developers 一致：`localizeConsole` 在渲染时选，英文空值回退中文。
 */

import { unstable_cache } from 'next/cache';
import { query } from './d1';
import type { Locale } from '@/lib/i18n';

/** DB 行（snake_case）。 */
export interface ConsoleRow {
  console_type: string;
  name: string;
  /** 名字英文（可空）。空 = 英文站回退 `name`。 */
  name_en: string | null;
  image_url: string | null;
  summary: string | null;
  summary_en: string | null;
  description: string | null;
  description_en: string | null;
  release_year: number | null;
  created_at: number;
}

/** 对外结构（camelCase，供 API / 前端）。 */
export interface Console {
  /** 机种标识 = `ConsoleType`（'nes' / 'snes' / 'gba' / 'arcade'），同时也是 URL 里那段 */
  type: string;
  name: string;
  nameEn: string | null;
  imageUrl: string | null;
  /** 简介：一句话，列表卡片上用 */
  summary: string | null;
  summaryEn: string | null;
  /** 介绍：整段，机种专题页正文用 */
  description: string | null;
  descriptionEn: string | null;
  releaseYear: number | null;
  createdAt: number;
  /** 名下游戏数（相关子查询，和 developers.gameCount 同一套）。 */
  gameCount: number;
}

/** `localizeConsole` 的产物：三条文案字段各选定一份语言。 */
export interface LocalizedConsoleText {
  name: string;
  summary: string | null;
  description: string | null;
}

/**
 * 按语言取一个机种的文案。**英文站空值回退中文**（和 `localizeDeveloper` 同一规则）。
 * 纯函数，不碰数据库。
 */
export function localizeConsole(console: Console, locale: Locale): LocalizedConsoleText {
  if (locale !== 'zh') {
    return {
      name: console.nameEn || console.name,
      summary: console.summaryEn || console.summary,
      description: console.descriptionEn || console.description,
    };
  }
  return {
    name: console.name,
    summary: console.summary,
    description: console.description,
  };
}

/** 「名下有几款游戏」那条相关子查询 —— 列表和单条都要它，别两处各写一份。 */
const GAME_COUNT = '(SELECT COUNT(*) FROM games g WHERE g.console_type = consoles.console_type) AS game_count';

function toConsole(row: ConsoleRow & { game_count?: number }): Console {
  return {
    type: row.console_type,
    name: row.name,
    nameEn: row.name_en,
    imageUrl: row.image_url,
    summary: row.summary,
    summaryEn: row.summary_en,
    description: row.description,
    descriptionEn: row.description_en,
    releaseYear: row.release_year,
    createdAt: row.created_at,
    gameCount: Number(row.game_count ?? 0),
  };
}

/**
 * 全部机种资料行（带名下游戏数）。**只返回库里有的行** —— 某个机种还没在后台填过资料时
 * 它就不在结果里，调用方（前台页面 / 后台列表）负责对照 `CONSOLE_TYPES` 补默认值，
 * 本函数不知道枚举的存在（数据层不该反过来依赖组件）。
 */
export async function listConsoles(): Promise<Console[]> {
  const rows = await query<ConsoleRow & { game_count: number }>(
    `SELECT consoles.*, ${GAME_COUNT} FROM consoles ORDER BY consoles.created_at ASC, consoles.console_type ASC`
  );
  return rows.map(toConsole);
}

/**
 * 机种列表页（`/consoles`）那份缓存的时长（秒）= 24 小时。
 *
 * 和 developers 那边同一个理由：这一页给爬虫和过路访客看，内容只有后台改资料时才变，
 * 每个访客都打一趟 D1 不划算。缓存键里没有语言（`Console` 两种语言都带，
 * 选哪份由页面调 `localizeConsole`）。
 */
export const CONSOLES_PAGE_REVALIDATE_SECONDS = 86400;

/** `listConsoles` 的缓存版 —— **只给前台那几页用**；后台必须走未缓存的这份。 */
export const listConsolesCached = unstable_cache(
  async () => listConsoles(),
  ['consoles:list', 'v1'],
  { revalidate: CONSOLES_PAGE_REVALIDATE_SECONDS }
);

/**
 * 按机种标识取一条资料（带游戏数）。机种专题页在用。
 *
 * ⚠️ **不缓存** —— 和 developers 的 getDeveloper 同一条理由：后台改完资料刷新就该看到。
 * 查不到（这个机种还没填过资料）返回 null，调用方自己退回默认渲染。
 */
export async function getConsole(type: string): Promise<Console | null> {
  const rows = await query<ConsoleRow & { game_count: number }>(
    `SELECT consoles.*, ${GAME_COUNT} FROM consoles WHERE console_type = ?`,
    [type]
  );
  return rows[0] ? toConsole(rows[0]) : null;
}

export interface ConsoleInput {
  name: string;
  nameEn: string | null;
  /** 已经解析好的最终图片地址（没换图就是原来那张），不是上传上来的 File */
  imageUrl: string | null;
  summary: string | null;
  summaryEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  releaseYear: number | null;
}

/**
 * 写入一个机种的资料。**存在就整行更新，不存在就插入**（upsert）——
 * 预填过的四个机种走 UPDATE 分支，所以后台「第一次保存」不会撞主键报错。
 */
export async function upsertConsole(type: string, input: ConsoleInput): Promise<void> {
  await query(
    `INSERT INTO consoles
       (console_type, name, name_en, image_url, summary, summary_en,
        description, description_en, release_year, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(console_type) DO UPDATE SET
       name = excluded.name,
       name_en = excluded.name_en,
       image_url = excluded.image_url,
       summary = excluded.summary,
       summary_en = excluded.summary_en,
       description = excluded.description,
       description_en = excluded.description_en,
       release_year = excluded.release_year`,
    [
      type,
      input.name,
      input.nameEn,
      input.imageUrl,
      input.summary,
      input.summaryEn,
      input.description,
      input.descriptionEn,
      input.releaseYear,
      Date.now(),
    ]
  );
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
}

/**
 * 全部机种的「骨架」（标识与创建时间），给 sitemap 用 —— 理由和
 * `listGameStubs` / `listDeveloperStubs` 一样：sitemap 要一条不漏，
 * 而 `listConsoles` 带了一圈用不上的列。
 */
export async function listConsoleStubs(): Promise<{ type: string; createdAt: number }[]> {
  const rows = await query<{ console_type: string; created_at: number }>(
    'SELECT console_type, created_at FROM consoles ORDER BY created_at DESC'
  );
  return rows.map((row) => ({ type: row.console_type, createdAt: row.created_at }));
}
