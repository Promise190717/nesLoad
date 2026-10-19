/*
 * 游戏文案的多语言结构 + 「按语言取一份」的纯函数（2026-10-16）。
 *
 * ## 为什么单独一个文件、而不是留在 lib/server/games.ts
 *
 * 因为**两边都要用**：服务端（页面 / 接口）和**客户端组件**（房间那个游戏库弹窗
 * `GameLibraryPanel`、个人中心 `AccountCenter`）都要把一份文案按当前界面语言挑出来。
 *
 * ⚠️ 客户端组件**不能** import `lib/server/games.ts` —— 那个模块一进去就拉起
 *    `next/cache` / `./d1` / `./developers` 一整套服务端依赖。所以这份「纯结构 + 纯函数」
 *    单独放，`lib/server/games.ts` 反过来从这里 import（数据层只负责**取**，
 *    「取哪一份」是渲染时的事）。
 *
 * ## 数据结构
 *
 * 一行 `game_texts` = 「一款游戏在某个语言下的文案」。字段可空 ——
 * 空了**逐字段回退**（见 `localizeTexts`），所以「只翻了标题、说明还没翻」是合法状态。
 *
 * ⚠️ **`ContentLocale` 比界面语言宽**：界面现在只有中英（`Locale`，见 lib/i18n.ts），
 *    但日韩的内容可以先把数据录进来，等界面开了直接用。加语言的成本是
 *    「往 `CONTENT_LOCALES` 加一个值 + 插数据」，**不动任何表结构**。
 *    界面语言要跟着加时，改的是 lib/i18n.ts 的 `LOCALES`，两件事分开。
 *
 * ⚠️ `LocalizedGameText` 是**取完之后**的形状：各个字段都变成单个值，
 *    可以直接往页面上印。`title` 是 `string`（不是 `string | null`）——
 *    它是这张卡片的身份，页面上任何地方都不该出现空标题（见下面 `anyTitle` 的兜底）。
 */

/** 内容语言清单。**唯一出处** —— 加语言只改这里（表结构不动）。 */
export const CONTENT_LOCALES = ['zh', 'en', 'ja', 'ko'] as const;

/** 内容语言的短码。比界面语言 `Locale`（zh | en）宽。 */
export type ContentLocale = (typeof CONTENT_LOCALES)[number];

/**
 * 一款游戏的**操作说明**（2026-10-19 加）。
 *
 * 只有**源站数据**里有（上游详情页的 `controls` 字段，四语言各一份真翻译）；
 * 数据库那张 `game_texts` 表没有这一列，所以 D1 模式下永远是 `null`，
 * 详情页据此整块不渲染 —— 见 `app/[locale]/games/[id]/page.tsx`。
 *
 * ⚠️ 上游给的是 `keys` 对象（`{"方向键":"移动","A":"跳跃"}`），这里转成**数组**：
 *    JS 对象保序，转数组后顺序与上游页面一致；`Record` 直接往下传会让渲染端
 *    自己 `Object.entries` 一遍，还容易被误当成「需要排序的字典」。
 */
export interface GameControls {
  /** 一句话说明（上游已按语言翻译，可能为空）。 */
  description: string | null;
  /** 按键 → 动作。顺序 = 上游给的顺序。 */
  keys: { label: string; action: string }[];
}

/** 一款游戏在**某个语言**下的文案。四个字段都可空 —— 空 = 没翻，逐字段回退。 */
export interface GameText {
  title: string | null;
  series: string | null;
  developer: string | null;
  description: string | null;
  /**
   * 操作说明。**可选** —— 后台表单 / `game_texts` 表都没有这一栏，
   * 只有源站那条路（`lib/server/upstream-catalog.ts`）会填。
   */
  controls?: GameControls | null;
}

/**
 * 一款游戏的全部文案，按语言索引。
 *
 * ⚠️ **只有库里真有行的语言才会出现**（`Partial`）—— 中文那份一定在（原文必填），
 *    英文那份只在至少一个字段有值时才建行（迁移脚本与写入路径都是这个口径）。
 *    所以取值时一律 `texts.en?.title ?? …`，别假设某个 key 一定存在。
 */
export type GameTexts = Partial<Record<ContentLocale, GameText>>;

/** 已按语言选定的游戏文案（`localizeTexts` 的产物）—— 四种文案字段都变成**单个值**。 */
export interface LocalizedGameText {
  title: string;
  series: string | null;
  developer: string | null;
  description: string | null;
  /** 操作说明（见 `GameControls`）。没有就是 `null` —— 详情页整块不画。 */
  controls: GameControls | null;
}

/**
 * 全空文案 —— 「这个语言什么都没录」。写入路径用它把 `undefined` 收敛成一份完整的空值，
 * 免得每处都写 `?? { title: null, series: null, … }`。
 */
export const EMPTY_GAME_TEXT: GameText = {
  title: null,
  series: null,
  developer: null,
  description: null,
  controls: null,
};

/** 一份文案里**有没有任何内容** —— 全空的行不建、不写（见 `GameTexts` 那段）。 */
export function isBlankGameText(text: GameText): boolean {
  return (
    !text.title &&
    !text.series &&
    !text.developer &&
    !text.description &&
    !text.controls?.description &&
    !(text.controls?.keys.length ?? 0)
  );
}

/**
 * 兜底标题：目标语言和中文都没有标题时，按 `CONTENT_LOCALES` 的顺序找第一个有标题的。
 *
 * 为什么值得写：`title` 是卡片的身份，`localizeTexts` 承诺回 `string`。
 * 正常数据下永远走不到这里（中文原文是必填的），但**万一某条老数据只有一份日文**，
 * 回一个空串会让整个列表出现一张没有名字的卡片 —— 那比显示一个「不是当前语言」的
 * 标题难查得多。
 */
function anyTitle(texts: GameTexts): string | null {
  for (const locale of CONTENT_LOCALES) {
    const title = texts[locale]?.title;
    if (title) return title;
  }
  return null;
}

/**
 * 按语言取一条游戏的文案。**目标语言缺哪个字段，就回退中文的那一个**（逐字段，不是整份）。
 *
 * 规则：
 *   · 中文站 —— 直接返回中文原文（**不做回退**，原文就是「这一份」）；
 *   · 其他语言 —— 优先该语言，空了回退中文，中文也空就是 `null`；
 *   · `title` 再兜一层（见 `anyTitle`）—— 它必须是个字符串。
 *
 * 逐字段回退而不是整份回退，是为了让「后台只补了标题、说明还没翻」这种半成品
 * 也能正常显示：标题用英文的、说明用中文的，而不是整张卡片退回中文、
 * 或者说明那一段变成空白。
 *
 * 纯函数、不碰数据库 —— 页面 / 组件拿到完整 `Game` 之后调它。
 */
export function localizeTexts(texts: GameTexts, locale: string): LocalizedGameText {
  const wanted = texts[locale as ContentLocale] ?? null;
  /* 中文站不回退（原文就是这一份）；其他语言回退到中文原文 */
  const fallback = locale === 'zh' ? null : (texts.zh ?? null);

  /*
   * 只有**字符串**那几个字段走逐字段回退。
   * ⚠️ 不能写成 `keyof GameText` —— 那会把 `controls`（对象）也算进来，
   *    返回类型 `string | null` 当场报 TS2322（2026-10-19 加 controls 时踩过）。
   */
  const pick = (key: 'title' | 'series' | 'developer' | 'description'): string | null =>
    wanted?.[key] || fallback?.[key] || null;

  return {
    title: pick('title') ?? anyTitle(texts) ?? '',
    series: pick('series'),
    developer: pick('developer'),
    description: pick('description'),
    /*
     * 控制说明**整份回退**（不逐字段）：它是「一段话 + 一张键位表」的组合，
     * 拿英文的描述配中文的键位比整份退回中文更糟。上游四语言都翻过，
     * 真缺的时候退回中文原文即可。
     */
    controls: wanted?.controls ?? fallback?.controls ?? null,
  };
}
