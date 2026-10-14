/*
 * 上游 ROM 的语言标记 ↔ 站内 `language` 短码。
 *
 * 上游 `fileName` 的 key 与站内字段**不同名**：中文上游写 `cn`，站内存 `zh`
 * （见 components/AdminGames 的 LANGUAGE_OPTIONS）；日文偶尔写 `jp`。
 *
 * 两处在用：「从链接自动填充」（AdminGames）与「从列表导入」（AdminBulkImport）——
 * 两条路都要拿 ROM 的语言去填表单那一栏，所以只留一份映射。
 */

const ROM_LANG_TO_FORM: Record<string, string> = {
  en: 'en',
  cn: 'zh',
  zh: 'zh',
  ja: 'ja',
  jp: 'ja',
};

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
