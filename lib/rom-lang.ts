/*
 * 站内游戏语言（`games.language` 的短码）与上游 ROM 语言标记之间的那点事。
 *
 * 四处（前三处是「后台写入」，最后一处是「前台显示」）：
 *   · 「从链接自动填充」（components/AdminGames）—— 拿上游 ROM 的语言去填表单那一栏；
 *   · 「从列表导入」（components/AdminBulkImport）—— 逐语言入库时用它筛 / 起标签；
 *   · /api/admin/scrape-game —— 给 `fileName` 里每一份语言版本标站内短码。
 *   · 前台显示（`gameLanguageLabel`）—— 游戏详情页资料表里「语言」那一行
 *     （列表 / 房间卡片封面上的语言角标已于 2026-10-19 去掉）。
 * 所以**语言清单与映射都只留这一份**，别在组件里再抄一张表。
 *
 * ⚠️ 上游 `fileName` 的 key 与站内字段**不同名**：中文上游写 `cn`（偶尔也写 `zh`），
 *    日文偶尔写 `jp`。
 * ⚠️ **2026-10-15 加韩语（`ko`）**：上游的 `fileName` 里确实有第四种
 *    （实测 kirby-squeak-squad 是 en / zh / ja / ko 四份），站内原来只认到 `ja`。
 */

const ROM_LANG_TO_FORM: Record<string, string> = {
  en: 'en',
  cn: 'zh',
  zh: 'zh',
  ja: 'ja',
  jp: 'ja',
  ko: 'ko',
};

/**
 * 站内支持的游戏语言 —— 短码 + **全称**，**这一份是唯一出处**。
 *
 * 后台「语言」下拉（AdminGames）、批量导入的逐语言循环与那一行的标签
 * （`Kirby · 简体中文`）都照它走；加语言只改这里一处。
 *
 * ⚠️ **2026-10-15 起 label 一律用全称、不许用缩写**（用户要求）：中文那条原本写
 *    「中文」，改成「简体中文」。前台封面上的语言角标（`GameCardGrid` 的列表卡片、
 *    `GameLibraryPanel` 的弹窗卡片）也直接取这一份 —— 别再在组件里另抄一张角标
 *    文案表，也别退回 `language.toUpperCase()` 那种 `ZH` / `EN` 短码写法。
 *
 * 顺序就是界面上 / 导入时的顺序（不参与排序，只求稳定）。
 */
export const GAME_LANGUAGES: readonly { value: string; label: string }[] = [
  { value: 'zh', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
];

/** 语言短码的清单（只取值），给「这个短码站内认不认」这类判断用。 */
export const GAME_LANGUAGE_VALUES: readonly string[] = GAME_LANGUAGES.map(
  (item) => item.value
);

/**
 * 短码 → 展示名。
 *
 * ⚠️ DB 那列**没有约束**，老数据里可能是自由文本（`jp` / `Chinese`…）——
 * 取不到时由调用方**原样返回**，别显示成空白。
 */
export const GAME_LANGUAGE_LABEL: Record<string, string> = Object.fromEntries(
  GAME_LANGUAGES.map((item) => [item.value, item.label])
);

/**
 * 语言短码 → 界面上显示用的**全称**（封面角标 / 详情页那一行）。
 *
 * ⚠️ DB 那列**没有约束**，老数据可能是自由文本（`jp` / `Chinese` / 大写 `ZH`）——
 *    查不到时**原样返回**（只去掉首尾空格），别显示成空白，也别硬塞一个猜的名字。
 * ⚠️ 查表前统一转小写：库里存的是 `zh`，但历史数据里出现过 `ZH`。
 */
export function gameLanguageLabel(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  return GAME_LANGUAGE_LABEL[raw.toLowerCase()] ?? raw;
}

/**
 * 把上游的 ROM 语言 key 转成表单「语言」下拉的值。
 *
 * ⚠️ 认不出来返回 null，调用方**宁可不动那个下拉** —— 往 `select` 里塞一个选项表里
 * 没有的值会显示成空白，比保持原样更糟。
 */
export function romLangToFormValue(lang: string | null | undefined): string | null {
  if (!lang) return null;
  return ROM_LANG_TO_FORM[lang.toLowerCase()] ?? null;
}

/**
 * 源站数据里那串语言短码 → 界面上那排按钮要的 `{code,label}`（2026-10-19）。
 *
 * 顺序跟着 `GAME_LANGUAGES`（中 → 英 → 日 → 韩），和详情页「语言」资料行、
 * 下载页选择条用的是同一份全称，别在组件里另抄。
 */
export function romLanguageOptions(
  languages: readonly string[]
): { code: string; label: string }[] {
  return GAME_LANGUAGES.filter((item) => languages.includes(item.value)).map((item) => ({
    code: item.value,
    label: item.label,
  }));
}

/**
 * 进详情页 / 下载页时默认选中哪一份语言。
 *
 * 规则：**界面语言那一份** → 英文 → 第一份；只有一份或没有就返回空串
 * （空串 = 链接不带 `?lang=`，行为和没有这个功能时完全一样）。
 */
export function defaultRomLanguage(languages: readonly string[], locale: string): string {
  if (languages.length <= 1) return '';
  if (languages.includes(locale)) return locale;
  if (languages.includes('en')) return 'en';
  return languages[0];
}
