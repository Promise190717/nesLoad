'use client';

import { useEffect, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { localePath, translate, type Locale, type MessageKey } from '@/lib/i18n';
import type { ConsoleType } from '@/lib/emulator';

/**
 * `/games` 的搜索框（2026-10-13 加 loading）。
 *
 * **为什么从页面里拆出来**：原来是服务端页面里一个原生 GET 表单，提交是一次
 * **整页文档导航** —— D1 查询那一两秒里页面毫无反馈，用户会以为点了没反应。
 * 拆成客户端组件后，提交改走 `router.push` + `useTransition`：旧页面原地不动，
 * 按钮变成「搜索中…」直到服务端渲染完新结果。
 *
 * ⚠️ **`action` + `method="get"` 必须留着**：JS 不可用时回落成原生表单提交，
 * 搜索有真地址、零 JS 也成立的这条底线不变（见下面 form 上的注释）。
 * `onSubmit` 里的 `preventDefault` 只在 JS 可用时拦下这次导航。
 */
export default function GamesSearchForm({
  locale,
  keyword,
  consoleType,
}: {
  locale: Locale;
  /** URL 里的当前关键词（服务端渲染时传入，是「真相」）。 */
  keyword: string;
  /** 当前筛着的机种 —— 提交时要跟着表单一起带回去，别把筛选条件搜丢了。 */
  consoleType: ConsoleType | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  /*
   * 受控输入，初值 = URL 里的关键词。**effect 只在 `keyword` prop 变化时回写**：
   * 客户端导航（点机种筛选 / 清除搜索 / 提交）会让服务端重新渲染并把新 keyword
   * 传下来 —— 那一刻输入框必须跟上 URL。用户正在打字时 prop 不变，effect 不跑，
   * 打字不受干扰（和原来 uncontrolled `defaultValue` 的体感一致）。
   */
  const [value, setValue] = useState(keyword);
  useEffect(() => {
    setValue(keyword);
  }, [keyword]);

  const t = (key: MessageKey) => translate(locale, key);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    /*
     * 落点与 `gamesHref` 同一条规范顺序：`q` → `console`（`page` 永远从第 1 页搜起，
     * 空的参数直接省略 —— 别拼出 `?q=` 这种会让服务端多走一跳 307 的形态）。
     * `trim` 和服务端 `parseQuery` 的口径对齐：全是空格 = 没搜。
     */
    const trimmed = value.trim();
    const params = new URLSearchParams();
    if (trimmed) params.set('q', trimmed);
    if (consoleType) params.set('console', consoleType);
    const query = params.toString();

    startTransition(() => {
      router.push(localePath(locale, '/games') + (query ? `?${query}` : ''));
    });
  };

  return (
    <form
      /*
       * ⚠️ `action` 必须带语言前缀 —— 写死 `/games` 的话，中文用户在 `/zh/games`
       * 搜一下就被送到英文列表页。JS 可用时它只是无 JS 回退的落点。
       */
      action={localePath(locale, '/games')}
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
        name="q"
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
        点「清除搜索」想看的是全部 NES，不是全库）。
      */}
      {keyword && (
        <Link
          /* 只剥关键词、机种保留；page=1 不写参数，与 gamesHref 的形态一致 */
          href={localePath(locale, '/games') + (consoleType ? `?console=${consoleType}` : '')}
          className="text-[12px] text-ink-400 transition-colors hover:text-accent"
        >
          {t('gamesPage.searchClear')}
        </Link>
      )}
    </form>
  );
}
