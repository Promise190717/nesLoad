/**
 * 个人中心的 tab id 清单 + URL `?tab=` 的白名单解析。
 *
 * ⚠️ **为什么单独放 lib 而不是写在 AccountCenter（客户端组件）里**：
 * `app/[locale]/account/page.tsx`（服务端）也要调 `parseAccountTab` ——
 * 从 `'use client'` 模块导出的普通函数在服务端只是个「客户端引用」，
 * 直接当函数调会抛「Attempted to call parseAccountTab() from the server」
 * （2026-10-14 实际踩过）。放 lib 里两侧共用，AccountCenter 只留渲染用的
 * label 清单。
 */

export type AccountTab = 'favorites' | 'history' | 'saves' | 'profile' | 'password';

/** 与 AccountCenter 里 TABS 的 value 一一对应（那边多带 label，用于渲染）。 */
export const ACCOUNT_TAB_IDS: readonly AccountTab[] = [
  'favorites',
  'history',
  'saves',
  'profile',
  'password',
];

/** 不认识的值一律回落到收藏（首个 tab）—— 手敲个 `?tab=xxx` 不该把页面敲炸。 */
export function parseAccountTab(value: string | string[] | undefined): AccountTab {
  const id = Array.isArray(value) ? value[0] : value;
  return ACCOUNT_TAB_IDS.includes(id as AccountTab) ? (id as AccountTab) : 'favorites';
}
