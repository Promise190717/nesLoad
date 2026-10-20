'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { localePath, translate, type Locale, type MessageKey } from '@/lib/i18n';
import type { ConsoleType } from '@/lib/emulator';

/**
 * `/games` 与机种专题页共用的搜索框。
 *
 * **为什么是一个客户端组件**：要有「搜索中…」这个状态 —— 查询那一两秒里按钮得动一下，
 * 不然用户会以为点了没反应（2026-10-13 加）。
 *
 * ⚠️ **提交走原生 GET 表单**：`action` + `method="get"` 就是这个组件的本体，不是无 JS 的
 *    回退 —— 「搜索有真地址、零 JS 也成立」是底线。`onSubmit` **只负责把按钮切成
 *    「搜索中…」，不拦这次导航**：拦下来就得自己 `router.push`，而搜索地址一旦还是
 *    `/games?q=`（被 `catalogRewrite` 改写成 `/catalog/...` 影子路由）就会「地址变了内容
 *    不动」（2026-10-19 线上事故）。
 *
 * ⚠️ **落点 2026-10-20 起是 `/games/search`（机种页是 `/consoles/<id>/search`）**，
 *    不再是 `/games?q=`。这是一条**动态路由**（它本来就按 query 渲染），同一路由上改
 *    query 是软导航 ⇒ 搜完再翻页 / 换机种都不再整页刷新。老地址仍能打开
 *    （`catalogRewrite` 那条兼容分支还在），只是不推荐再往外发。
 */

/** 搜索路由 = 浏览页路径 + `/search`（`/games` → `/games/search`）。 */
function searchPathOf(actionPath: string): string {
  return `${actionPath}/search`;
}

export default function GamesSearchForm({
  locale,
  keyword,
  consoleType,
  languageParam = '',
  actionPath = '/games',
  clearHref,
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
  /** 浏览页的路径（不含 `/search`）：`/games` 或 `/consoles/<id>`。 */
  actionPath?: string;
  /**
   * 「清除搜索」的落点 = 当前筛选条件下的**浏览态**地址（机种走路径段那份，
   * 由页面用 `gamesHref` / `consoleHref` 拼好）。
   *
   * 为什么不在这里自己拼：浏览态和搜索态是两套地址形态（路径段 vs `?console=`），
   * 拼法各有唯一出处（页面的那两个 href 构造器）。在这里再抄一遍必然漂。
   */
  clearHref: string;
}) {
  const [pending, setPending] = useState(false);

  /*
   * 受控输入，初值 = URL 里的关键词。`keyword` prop 变了就回写一次 ——
   * 提交是整页跳转（见文件头），正常情况下用不上这条；留着是为了「同一份组件实例上
   * 关键词被换掉」的任何情形（比如在搜索页里点「清除」走的是软导航）。
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
       * ⚠️ `action` 必须带语言前缀 —— 写死 `/games/search` 的话，中文用户在 `/zh/games`
       * 搜一下就被送到英文列表页。这个表单**就是靠它提交的**，`method="get"` 不是装饰。
       */
      action={localePath(locale, searchPathOf(actionPath))}
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
        ⚠️ 排在 `console` 后面，与 `gamesHref` / `consoleHref` 的拼法一致。
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
        「清除」是一条**链接**而不是清空按钮：没有关键词时它压根不画（指向空列表的死链
        比少一个链接更糟，和翻页那对「上一页」同一个道理），而且它就该是一个能直接点走的地址。

        落点由页面给（`clearHref`，只剥关键词、保留机种 / 语种），
        2026-10-20 起它是**路径段那份浏览地址**，所以用 `next/link` 走软导航。
      */}
      {keyword && (
        <Link href={clearHref} className="text-[12px] text-ink-400 transition-colors hover:text-accent">
          {t('gamesPage.searchClear')}
        </Link>
      )}
    </form>
  );
}
