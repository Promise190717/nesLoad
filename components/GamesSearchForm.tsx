'use client';

import { useState, type FormEvent } from 'react';
import CatalogLink from '@/components/CatalogLink';
import { localePath, translate, type Locale, type MessageKey } from '@/lib/i18n';
import type { ConsoleType } from '@/lib/emulator';

/**
 * `/games` 与机种专题页共用的搜索框。
 *
 * **为什么是一个客户端组件**：要有「搜索中…」这个状态 —— D1 查询那一两秒里按钮得动一下，
 * 不然用户会以为点了没反应（2026-10-13 加）。
 *
 * ⚠️ **提交走的是原生 GET 表单（整页跳转），不是 `router.push`**（2026-10-19 改）：
 *    在上一版里提交走客户端路由，线上会**只改地址栏、不换内容** —— 搜索和「清除」全都
 *    失灵。原因见 `components/CatalogLink.tsx` 那段：带查询参数的目录地址会被
 *    `middleware.ts` 改写成一棵对不上的路由树，软导航拿回来的 RSC 载荷没法应用。
 *    所以 `onSubmit` **只负责把按钮切成「搜索中…」，不再拦这次导航**。
 *    `useState` 而不是 `useTransition`：整页跳转没有「过渡结束」这回事，
 *    页面卸载时这个状态自然消失（bfcache 回来时按钮是灰的，刷一下即恢复，概率极低）。
 *
 * ⚠️ **`action` + `method="get"` 是这个组件的本体**，不是无 JS 的回退：现在它就是
 *    唯一的提交路径 —— 「搜索有真地址、零 JS 也成立」这条底线反而成了默认行为。
 */
export default function GamesSearchForm({
  locale,
  keyword,
  consoleType,
  languageParam = '',
  actionPath = '/games',
}: {
  locale: Locale;
  /** URL 里的当前关键词（服务端渲染时传入，是「真相」）。 */
  keyword: string;
  /** 当前筛着的机种 —— 提交时要跟着表单一起带回去，别把筛选条件搜丢了。 */
  consoleType: ConsoleType | null;
  /**
   * 当前筛着的**语种**，而且要是**「写进地址的那个形态」**：不筛语种（「全部」，也就是
   * 页面默认那份）是空串（整段不写）、其余是 `zh` / `en` / `ja` / `ko`。
   *
   * 为什么不传「筛的是哪个语种」让本组件自己算：归一化只有页面里那一处
   * （机种专题页的 `languageParamOf`），组件只管把拿到的这一串原样带回去。
   *
   * ⚠️ **不传 = 空串**（`/games` 那边就是），于是 hidden input 与「清除」链接都不带它 ——
   *    和加这个 prop 之前一字不差。
   */
  languageParam?: string;
  actionPath?: string;
}) {
  const [pending, setPending] = useState(false);

  /*
   * 受控输入，初值 = URL 里的关键词。`keyword` prop 变了就回写一次 ——
   * 提交与「清除」现在都走整页跳转（见文件头），正常情况下用不上这条；
   * 留着是为了「同一份组件实例上关键词被换掉」的任何情形（比如将来又改回软导航）。
   * 用户正在打字时 prop 不变，那段分支不跑，打字不受干扰。
   */
  const [value, setValue] = useState(keyword);
  const [previousKeyword, setPreviousKeyword] = useState(keyword);
  if (previousKeyword !== keyword) {
    setPreviousKeyword(keyword);
    setValue(keyword);
  }

  const t = (key: MessageKey) => translate(locale, key);

  /**
   * 搜索之外还要原样带回去的筛选条件（只给下面那条「清除」链接用 —— 表单提交时
   * 顺带的条件由那几个 hidden input 自己带着走）。**顺序就是规范顺序**（服务端按地址
   * 字符串比对是否规范，顺序不对就等于多一跳 307）：`console` 在前、`lang` 在后 ——
   * 和 `gamesHref` / 机种专题页那个 `consoleHref` 拼法一致（`q` 永远排头）。
   */
  const keepParams: [string, string][] = [];
  if (consoleType) keepParams.push(['console', consoleType]);
  if (languageParam) keepParams.push(['lang', languageParam]);

  /**
   * ⚠️ **这里刻意不 `preventDefault`**：整页提交是唯一的路径（理由见文件头）。
   * 拦一下只是因为上一次提交还没走掉（连点两下），别让它把按钮状态来回切。
   */
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (pending) {
      event.preventDefault();
      return;
    }
    setPending(true);
  };

  return (
    <form
      /*
       * ⚠️ `action` 必须带语言前缀 —— 写死 `/games` 的话，中文用户在 `/zh/games`
       * 搜一下就被送到英文列表页。
       * 这个表单**就是靠它提交的**（整页跳转，见文件头），所以 `method="get"` 不是装饰。
       */
      action={localePath(locale, actionPath)}
      method="get"
      role="search"
      onSubmit={onSubmit}
      aria-busy={pending || undefined}
      className="mt-8 flex flex-wrap items-center gap-2"
    >
      <label htmlFor="games-search" className="sr-only">
        {t('gamesPage.searchLabel')}
      </label>
      <input
        id="games-search"
        type="search"
        /* 空的搜索框不挂 `name` ⇒ 地址里不会出现 `?q=`（那一跳会被服务端 307 收敛，白跑一趟） */
        name={value.trim() ? 'q' : undefined}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t('gamesPage.searchPlaceholder')}
        autoComplete="off"
        className="pixel-edge pxw-2 pxc-500 h-[34px] min-w-[180px] flex-1 bg-ink-900 px-3 text-[12px] text-ink-100 placeholder:text-ink-600 focus:outline-none"
      />
      {/*
        筛着机种搜的时候，把机种**跟着表单一起提交**：不然在「NES」里搜一下，
        提交后 `console` 就丢了，结果又变回全库。
        ⚠️ 它必须排在 `q` **后面**：规范顺序是 `q` → `console` → `page`（见 `gamesHref`）
        —— 排在前面白多一跳 307。
      */}
      {consoleType && <input type="hidden" name="console" value={consoleType} />}
      {/*
        语种同理（机种专题页在用）：筛着「日本語」搜一下，提交后不能被踢回全部。
        ⚠️ 排在 `console` 后面，与 `keepParams` 的顺序一致。
      */}
      {languageParam && <input type="hidden" name="lang" value={languageParam} />}
      <button
        type="submit"
        disabled={pending}
        className="pixel-edge pxw-2 pxc-500 flex h-[34px] shrink-0 items-center bg-ink-700 px-4 text-[12px] text-ink-200 transition-colors hover:text-accent disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? t('gamesPage.searchLoading') : t('gamesPage.searchSubmit')}
      </button>
      {/*
        「清除」是一条**链接**而不是清空按钮：没有关键词时它压根不画（指向 /games
        的死链比少一个链接更糟，和翻页那对「上一页」同一个道理），
        而且它就该是一个能直接点走的地址。

        ⚠️ 落点用 `gamesHref(locale, 1, '', consoleType)` 而不是裸 `/games`：
        清掉的只是**关键词**，用户当前筛着的机种该留着（他在 NES 里搜了一轮，
        点「清除搜索」想看的是全部 NES，不是全库）。语种同理。
        ⚠️ 它带查询参数（`console` / `lang`）⇒ 必须整页跳转，用 `CatalogLink`
        而不是 `next/link`，理由同文件头。
      */}
      {keyword && (
        <CatalogLink
          /* 只剥关键词、其余筛选保留；page=1 不写参数，与 gamesHref / consoleHref 的形态一致 */
          href={
            localePath(locale, actionPath) +
            (keepParams.length ? `?${new URLSearchParams(keepParams)}` : '')
          }
          className="text-[12px] text-ink-400 transition-colors hover:text-accent"
        >
          {t('gamesPage.searchClear')}
        </CatalogLink>
      )}
    </form>
  );
}
