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
 * ⚠️ **`ContentLocale` 与界面语言一一对应**（2026-10-20 起同为 18 种）：
 *    界面 `Locale`（lib/i18n.ts）扩到 18 种时内容语言跟着补齐 —— 上游站的
 *    语言切换器正好也是这 18 种，每款游戏在哪个语言下都有真翻译可抓。
 *    加语言的成本是「往 `CONTENT_LOCALES` 加一个值 + 往库里插数据」，**不动任何表结构**。
 *
 * ⚠️ `LocalizedGameText` 是**取完之后**的形状：各个字段都变成单个值，
 *    可以直接往页面上印。`title` 是 `string`（不是 `string | null`）——
 *    它是这张卡片的身份，页面上任何地方都不该出现空标题（见下面 `anyTitle` 的兜底）。
 */

/**
 * 内容语言清单。**唯一出处** —— 加语言只改这里（表结构不动）。
 *
 * ⚠️ **2026-10-20 从 4 种扩到 18 种**，与界面 `LOCALES`（lib/i18n.ts）逐项对齐，
 *    也与上游站的 hreflang 逐项对齐（实测 `https://retrogamesnexus.com/` 的
 *    alternate 链接就是这 18 个前缀）。顺序：中文第一（原文必填、anyTitle 兜底
 *    从它起），其余按界面语言的顺序排。每补一种语言 = 往库里插对应行，见
 *    `scripts/fill-game-texts-locales.mjs`。
 */
export const CONTENT_LOCALES = [
  'zh',
  'en',
  'ja',
  'ko',
  'zh-TW',
  'es',
  'hi',
  'pt',
  'fr',
  'de',
  'it',
  'ru',
  'fil',
  'nl',
  'vi',
  'th',
  'ms',
  'id',
] as const;

export type ContentLocale = (typeof CONTENT_LOCALES)[number];

/**
 * 后台**表单**编辑的语言子集（仍是中英日韩）。
 *
 * 为什么不是全量 18 种：后台那两个表单的文案块 / 字段后缀
 * （`AdminGames.tsx` 的 `FORM_SUFFIX` / `PATCH_SUFFIX`、`[id]/route.ts` 的扁平字段）
 * 是**接口契约**，18 块语言表单既没法用也改不起；其余 14 种的文案由
 * 回填脚本（`fill-game-texts-locales.mjs`）与爬取写入，后台不提供编辑入口。
 *
 * ⚠️ 服务端的 `parseTextsField`（texts JSON）与 `writeTexts` 仍走全量
 *    `CONTENT_LOCALES` —— `writeTexts` 只动传进来的语言，表单只带四种
 *    不会碰掉其余 14 种的行（这正是它注释里预留的场景）。
 */
export const ADMIN_FORM_LOCALES = ['zh', 'en', 'ja', 'ko'] as const;

export type AdminFormLocale = (typeof ADMIN_FORM_LOCALES)[number];

/**
 * 一款游戏的**操作说明**（2026-10-19 加）。
 *
 * 源站数据与 `game_texts.controls`（jsonb）里都有 —— 上游详情页/列表载荷的
 * `controls` 字段四语言（现在是 18 语言）各一份真翻译；
 * 后台表单没有这一栏（见 `writeTexts` 的 `COALESCE`：表单没带不清库）。
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

/**
 * 把**来路不明**的 `controls` 收敛成 `GameControls | null`（2026-10-20 加）。
 *
 * 为什么必须有这一道：`controls` 有三种来路，**每一种都没法保证 `keys` 是数组**——
 *   · Supabase 里是 `jsonb`（`db/schema.pg.sql`），驱动解析出来是什么全看列的真实类型
 *     （列建成了 `text` 就回来一个**字符串**）；
 *   · 源站那条路是上游对象（`{keys: {"方向键":"移动"}}`，键位是**对象**不是数组）；
 *   · 缓存（`unstable_cache`）里是 JSON 往返之后的值。
 *
 * 实测踩过：详情页 `text.controls.keys.length` 直接
 * `TypeError: Cannot read properties of undefined (reading 'length')` —— 某行
 * `controls` 是个只有 `description` 的对象（或整列回来是字符串），
 * 类型上写着 `keys: [...]`，运行时根本没有。
 *
 * 认三种形态：标准 `{description, keys:[{label,action}]}`、上游对象形态、
 * JSON 字符串；描述与键位**都空**时返回 `null`（详情页据此整块不渲染）。
 * 键位里缺 label / action 的条目会被丢掉（画出来会是一行空白）。
 */
export function normalizeControls(raw: unknown): GameControls | null {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;

  const source = value as { description?: unknown; keys?: unknown };
  const description =
    typeof source.description === 'string' && source.description.trim()
      ? source.description.trim()
      : null;

  const keys: { label: string; action: string }[] = [];
  const push = (label: unknown, action: unknown) => {
    const text = typeof label === 'string' ? label.trim() : '';
    const meaning = typeof action === 'string' ? action.trim() : '';
    if (text && meaning) keys.push({ label: text, action: meaning });
  };

  if (Array.isArray(source.keys)) {
    for (const item of source.keys) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as { label?: unknown; action?: unknown };
      push(entry.label, entry.action);
    }
  } else if (source.keys && typeof source.keys === 'object') {
    /* 上游原始形态：`{"方向键":"移动"}` —— `Object.entries` 对字符串键保序 */
    for (const [label, action] of Object.entries(source.keys as Record<string, unknown>)) {
      push(label, action);
    }
  }

  return description || keys.length > 0 ? { description, keys } : null;
}

/** 一款游戏在**某个语言**下的文案。四个字段都可空 —— 空 = 没翻，逐字段回退。 */
export interface GameText {
  title: string | null;
  series: string | null;
  developer: string | null;
  description: string | null;
  /**
   * 操作说明。**可选** —— 后台表单没有这一栏，由爬取 / 回填脚本从上游写入
   * （`game_texts.controls`，jsonb）。
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
  /*
   * `controls` 先过 `normalizeControls` 再判：直接读 `text.controls.keys.length`
   * 会在「只有 description、没有 keys」的行上抛 TypeError（2026-10-20 踩过）。
   */
  return (
    !text.title &&
    !text.series &&
    !text.developer &&
    !text.description &&
    !normalizeControls(text.controls)
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
 * 逐字段回退链（`localizeTexts` / `localizeEntityTexts` 共用，别再各抄一份）。
 *
 * 返回**除本语言以外**要依次尝试的语言清单：目标语言某字段空了，
 * 按这个顺序找第一个非空的。规则见 localizeTexts 上方那段注释。
 */
export function entityFallbackChain(locale: string): string[] {
  if (locale === 'zh') return [];
  if (locale === 'zh-TW') return ['zh', 'en'];
  if (locale === 'en') return ['zh'];
  return ['en', 'zh'];
}

/**
 * 按语言取一条游戏的文案。**目标语言缺哪个字段，就按回退链找第一个有的**（逐字段，不是整份）。
 *
 * 规则（2026-10-20 起**回退链**化）：
 *   · 中文站 —— 直接返回中文原文（**不做回退**，原文就是「这一份」）；
 *   · zh-TW —— 该语言空了回退简体中文，再空回退英文（同文种最省力）；
 *   · en —— 空了回退中文；
 *   · 其余 16 种（ja/ko/14 新语言）—— 空了**先回退英文、再回退中文**：
 *     这 16 种的内容行已基本齐全，回退只发生在长尾缺字段的时刻（开发商介绍、
 *     后补段落），那一刻英文几乎总比中文合适；
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
  /*
   * 逐字段回退链（2026-10-20 调整，规则见上面那条注释）：
   * 缺哪个字段就**按链找第一个非空的**，而不是只看中文一份 ——
   * 18 种语言里长尾总有个别字段缺失（开发商介绍、后补的段），那一刻
   * 对绝大多数语言来说英文都比中文合适；只有中文系（zh-TW）优先简体中文。
   */
  const chain = entityFallbackChain(locale).map((l) => texts[l as ContentLocale] ?? null);

  /*
   * 只有**字符串**那几个字段走逐字段回退。
   * ⚠️ 不能写成 `keyof GameText` —— 那会把 `controls`（对象）也算进来，
   *    返回类型 `string | null` 当场报 TS2322（2026-10-19 加 controls 时踩过）。
   */
  const pick = (key: 'title' | 'series' | 'developer' | 'description'): string | null =>
    wanted?.[key] || chain.map((text) => text?.[key]).find(Boolean) || null;

  return {
    title: pick('title') ?? anyTitle(texts) ?? '',
    series: pick('series'),
    developer: pick('developer'),
    description: pick('description'),
    /*
     * 控制说明**整份回退**（不逐字段）：它是「一段话 + 一张键位表」的组合，
     * 拿英文的描述配中文的键位比整份退回中文更糟。按上面的链整份找第一份有的。
     *
     * ⚠️ 出口**必须过 `normalizeControls`**：库里的 `jsonb`、上游的对象形态、
     *    缓存里的字符串都可能在运行时缺 `keys`，详情页那行 `controls.keys.length`
     *    不设防会直接 TypeError（2026-10-20 线上踩过）。这里是所有调用方的唯一出口。
     */
    controls: normalizeControls(wanted?.controls ?? chain.map((text) => text?.controls).find(Boolean) ?? null),
  };
}
