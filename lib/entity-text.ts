/*
 * 实体（机种 / 开发商）文案的多语言结构 + 「按语言取一份」的纯函数（2026-10-16）。
 *
 * 与 lib/game-text.ts 同一套设计：
 *   · 侧表存储、逐字段回退、加语言 = 插数据；
 *   · 纯函数不碰数据库，页面 / 组件拿到完整 Entity 之后调它；
 *   · 语言清单从 game-text.ts import，不另抄一份。
 */

import { CONTENT_LOCALES, type ContentLocale } from './game-text';

/** 一个实体在**某个语言**下的文案。三个字段都可空 —— 空 = 没翻，逐字段回退。 */
export interface EntityText {
  name: string | null;
  summary: string | null;
  description: string | null;
}

/**
 * 一个实体的全部文案，按语言索引。
 *
 * ⚠️ **只有库里真有行的语言才会出现**（`Partial`）—— 中文那份一定在（原文必填），
 *    其他语言只在至少一个字段有值时才建行。
 */
export type EntityTexts = Partial<Record<ContentLocale, EntityText>>;

/** 已按语言选定的实体文案（`localizeEntityTexts` 的产物）。 */
export interface LocalizedEntityText {
  name: string;
  summary: string | null;
  description: string | null;
}

/** 全空文案 —— 把 `undefined` 收敛成一份完整的空值。 */
export const EMPTY_ENTITY_TEXT: EntityText = {
  name: null,
  summary: null,
  description: null,
};

/** 一份文案里**有没有任何内容**。 */
export function isBlankEntityText(text: EntityText): boolean {
  return !text.name && !text.summary && !text.description;
}

/**
 * 「按语言摊平」之后的形状 —— **后台表单读写的那一套**（见 `flatEntityTexts`）。
 *
 * 开发商的 `/api/admin/developers` 与机种的 `/api/admin/consoles` 共用这一个结构。
 * 「加语言」= 在这里补两行（`nameXx` / `summaryXx` / `descriptionXx` 各一条），
 * **唯一一处** —— 别在两个路由里各写一份，漏一处就是「某语言的资料存得进、读不出」。
 */
export interface FlatEntityText {
  /** 中文名（原文，非空 —— 它是表格里那一行的身份） */
  name: string;
  nameEn: string | null;
  nameJa: string | null;
  nameKo: string | null;
  summary: string | null;
  summaryEn: string | null;
  summaryJa: string | null;
  summaryKo: string | null;
  description: string | null;
  descriptionEn: string | null;
  descriptionJa: string | null;
  descriptionKo: string | null;
}

/** 全空的扁平文案（机种那种「表里还没这一行」的占位）。 */
export const EMPTY_FLAT_ENTITY_TEXT: FlatEntityText = {
  name: '',
  nameEn: null,
  nameJa: null,
  nameKo: null,
  summary: null,
  summaryEn: null,
  summaryJa: null,
  summaryKo: null,
  description: null,
  descriptionEn: null,
  descriptionJa: null,
  descriptionKo: null,
};

/**
 * 把侧表读出来的 `EntityTexts` **摊成四个语言的扁平字段**。
 *
 * 为什么后台接口要摊平、而不是照原样回一个 `texts` 字典：后台那两个表单（开发商 / 机种）
 * 每一栏就是一个独立输入框（中文名 / 英文名 / 日文名 / 韩文名…），扁平字段与表单一一对应；
 * `texts` 那层字典留给**前台**——那边要的是「按当前语言取一份」（`localizeEntityTexts`）。
 *
 * ⚠️ 这里**不做任何回退**（英文名空就是 `null`，不抄中文）：后台编辑框里显示中文名会让人
 *    以为英文名已经填过了，一存就把假数据写进库。回退只发生在渲染时。
 */
export function flatEntityTexts(texts: EntityTexts): FlatEntityText {
  return {
    name: texts.zh?.name ?? '',
    nameEn: texts.en?.name ?? null,
    nameJa: texts.ja?.name ?? null,
    nameKo: texts.ko?.name ?? null,
    summary: texts.zh?.summary ?? null,
    summaryEn: texts.en?.summary ?? null,
    summaryJa: texts.ja?.summary ?? null,
    summaryKo: texts.ko?.summary ?? null,
    description: texts.zh?.description ?? null,
    descriptionEn: texts.en?.description ?? null,
    descriptionJa: texts.ja?.description ?? null,
    descriptionKo: texts.ko?.description ?? null,
  };
}

/**
 * 「这个实体在某个语言下的名字」，**不回退**（那一份没写就是 `null`）。
 *
 * 用途只有一处：**写快照字段** —— `game_texts.developer`（见 games.ts 的 `withDeveloper`
 * 与 developers.ts 改名时的级联）。两边必须走同一条规则，否则改一次开发商名，两份数据就漂开。
 *
 * ⚠️ **写入时不要先把中文抄进日韩行**：那会让库里再也看不出「这一份到底翻没翻」，
 *    而读取那条路（`localizeEntityTexts` / `localizeTexts`）本来就逐字段回退中文，
 *    显示效果一模一样。回退是**读取**的事，不是写入的事。
 */
export function rawEntityName(texts: EntityTexts, locale: ContentLocale): string | null {
  return texts[locale]?.name ?? null;
}

/** 兜底名字：目标语言和中文都没有时，按语言顺序找第一个有的。 */
function anyName(texts: EntityTexts): string | null {
  for (const locale of CONTENT_LOCALES) {
    const name = texts[locale]?.name;
    if (name) return name;
  }
  return null;
}

/**
 * 按语言取一个实体的文案。**目标语言缺哪个字段，就回退中文的那一个**（逐字段）。
 *
 * 规则：
 *   · 中文站 —— 直接返回中文原文（不做回退）；
 *   · 其他语言 —— 优先该语言，空了回退中文，中文也空就是 `null`；
 *   · `name` 再兜一层（见 `anyName`）—— 它必须是个字符串。
 */
export function localizeEntityTexts(
  texts: EntityTexts,
  locale: string
): LocalizedEntityText {
  const wanted = texts[locale as ContentLocale] ?? null;
  const fallback = locale === 'zh' ? null : (texts.zh ?? null);

  const pick = (key: keyof EntityText): string | null =>
    wanted?.[key] || fallback?.[key] || null;

  return {
    name: pick('name') ?? anyName(texts) ?? '',
    summary: pick('summary'),
    description: pick('description'),
  };
}
