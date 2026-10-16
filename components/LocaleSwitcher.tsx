'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LOCALE_OPTIONS } from '@/lib/i18n';
import { useI18n } from './I18nProvider';

/**
 * 语言选择器（自绘下拉）—— **内容页顶栏**用的那一版（2026-10-13 加）。
 *
 * 和房间右上角那一个（`ConsoleScene` 里内联的那段 JSX）**长得一模一样、类名也同一套**
 * （`.locale-menu` / `.locale-trigger` / `.locale-options` / `.locale-option`，
 * 样式在 `app/globals.css`），但**代码是两份**，这一点是刻意的：
 *   · 房间那一个和「电视机大小」那个弹层**共用一个「点外面收起来」的 effect**、
 *     还要参与 Esc 那套「房间里开着的东西」的收尾，并且带 `.row-icon`
 *     好在小屏抽屉里跟别的行排成一样（见 ConsoleScene 里那两段注释）。
 *   · 这一份是**自给自足**的：自己管开合、自己收，不带抽屉那套。
 * 硬合成一个组件就得把「抽屉 / 房间面板」这些房间专属的东西塞进公共件的 props 里，
 * 代价比省下的这二十行大。**样式与选项列表仍然是同一份**（CSS 类 + `LOCALE_OPTIONS`），
 * 所以「加第三种语言」只会改到 `lib/i18n.ts` 一处。
 *
 * **为什么是下拉而不是一颗「切过去」的钮**：两种语言时那颗钮也够用，但下拉显示的是
 * **当前**语言（用户一眼知道自己在哪一版），而且加第三种语言时不用改交互。
 *
 * ⚠️ **代价（用下拉就必然如此）**：下拉不是可抓取的链接 —— 中键 / 右键新标签、
 *    复制地址、爬虫顺着 `href` 发现另一种语言那一版，这几条都没有了。
 *    要它们就得退回 `<Link>`（房间那边改之前权衡过一次，结论写在那段注释里）。
 *
 * ⚠️ **点选项时两步的顺序不能反**：`rememberLocale` **先**写 cookie、**再**导航。
 *    middleware 正是靠这个 cookie 决定「无前缀地址要不要把你送去带前缀那份」——
 *    反过来的话，从 `/zh` 切到英文、落到 `/games`，下一个请求又会被 cookie 里那个
 *    「中文」送回 `/zh`，表现为**切了没反应**。
 *
 * 目标地址用 `useI18n()` 的 **`hrefIn(option.value)`** —— 每个选项各自现算，
 * 因为「当前页面在日文下的地址」和「在韩文下的地址」是两个不同的地址。
 * ⚠️ 2026-10-16 之前这里用的是 `altHref`（「另一种语言」的地址），那**只在两种语言时
 *    成立**（选中的不是当前 ⇔ 就是那另一种）；四种语言下它会变成「不管点哪个都去
 *    同一个地方」。加语言时这里是必须改的一处。
 */
export default function LocaleSwitcher() {
  const { t, locale, hrefIn, rememberLocale } = useI18n();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  /** 选择器 + 它那个下拉的包裹层（判「点的是不是它自己」）。 */
  const ref = useRef<HTMLDivElement>(null);

  /*
   * 点外面 / 按 Esc 收起来。
   *
   * 用 `pointerdown` 而不是 `click`：后者要等抬起，而且如果抬起时指针已经在别的元素上
   * （拖拽过），`click` 根本不派发。
   *
   * 必须把钮和弹层放在**同一个**包裹层里判（`ref`），否则点钮本身也会被当成「点外面」
   * —— 那样弹层刚开就被这一条关掉（`pointerdown` 早于 `click`），钮看着像失灵。
   *
   * Esc 只认「下拉开着」，不抢别的：内容页上没有别的浮层需要它让路。
   */
  useEffect(() => {
    if (!open) return;

    const onDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = LOCALE_OPTIONS.find((option) => option.value === locale)?.label ?? locale;

  return (
    <div ref={ref} className="locale-menu" data-open={open ? 'on' : 'off'}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={t('locale.label')}
        aria-label={t('locale.label')}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="locale-trigger"
      >
        <span className="locale-current">{current}</span>
        {/* 下拉箭头。不留的话它看起来就是一段普通文字，没人知道能点开 */}
        <span className="locale-caret" aria-hidden="true" />
      </button>

      {open && (
        <ul role="listbox" aria-label={t('locale.label')} className="locale-options">
          {LOCALE_OPTIONS.map((option) => (
            <li key={option.value} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={option.value === locale}
                className={`locale-option${option.value === locale ? ' is-current' : ''}`}
                onClick={() => {
                  setOpen(false);
                  // 点的是当前语言：只是收起来，不必白跑一趟导航
                  if (option.value === locale) return;
                  rememberLocale(option.value);
                  router.push(hrefIn(option.value));
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
