/*
 * 后台表单的共享样式串。
 *
 * `AdminGames`（单条增改）与 `AdminBulkImport`（从列表导入）用的是同一套输入框外观 ——
 * 放这里只留一份：改内边距或配色时不用去两个文件里对着改。
 *
 * ⚠️ `pixel-edge` / `pxw-*` / `pxc-*` 是 globals.css 里定义的自定义工具类，不是 Tailwind 内置的。
 */

/** 输入框统一样式，省得每个字段重复一长串 class。 */
export const FIELD_CLASS =
  'pixel-edge pxw-2 pxc-500 w-full bg-ink-900 px-2 py-2 text-[12px] text-ink-100 placeholder:text-ink-600 focus:outline-none';
