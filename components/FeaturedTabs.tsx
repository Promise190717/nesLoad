'use client';

import Link from 'next/link';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { consoleLabel } from '@/lib/consoles';
import { FEATURED_TAGS, featuredText } from '@/lib/featured';
import { localePath, type Locale } from '@/lib/i18n';
import { cardDelayMs } from '@/lib/card-stagger';

/**
 * 首页「精选」模块的 tab 面板（2026-11-05 加）。
 *
 * ## 为什么是客户端组件
 *
 * 只有一件事需要 JS：**切换 tab**。数据全是静态的（`lib/featured.ts`），
 * 卡片是普通链接 —— 也就是说这个组件关掉 JS 之后仍然可读、可点、可被爬虫顺着走。
 *
 * ## 几个刻意的做法
 *
 * ⚠️ **所有面板都渲染进 HTML，不激活的那几块挂 `hidden`**，而不是「只渲染当前这一块」。
 *    原因有两个：① 爬虫拿到的是完整的 33 条内链，不是只有默认那 6 条；
 *    ② 切 tab 不触发任何数据请求 —— 内容早就在 DOM 里了，切换是纯 CSS 显隐，
 *    点起来是瞬时的（这是「切个分类还要等接口」最容易让人烦的地方）。
 *    代价是首次渲染多几十个 `<img>` 标签；它们都是 `loading="lazy"` 且父级 `hidden`，
 *    浏览器不会去拉。
 *
 * ⚠️ **prefetch 一律关掉**：这里一屏最多 6 张卡片，但 33 个链接如果全预取，
 *    等于每来一个人就多渲染 33 次详情页 RSC（Cloudflare 免费版 10ms CPU 直接爆）。
 *    理由和 `GameCardGrid` 那条一字不差，别在这里打开。
 *
 * ⚠️ **tab 用 `role="tablist"` / `aria-selected`**：不这么做的话，屏幕阅读器只会读到
 *    一排普通按钮，看不出「这是分类切换」。
 *    键盘按 APG 的约定：左右方向键切、Home / End 跳首尾（见 `onKeyDown`）。
 */
export default function FeaturedTabs({
  locale,
  coverBase,
}: {
  locale: Locale;
  /**
   * R2 公网域名（`R2_PUBLIC_BASE`，末尾不带斜杠）。卡片封面是 `/images/...` 这种**相对路径**，
   * 拼上它才是能直接给 `<img>` 的地址 —— 全站只有 `lib/server/media.ts` 的 `mediaUrl()`
   * 知道这个基址，但那是服务端模块（客户端拿不到 `process.env`），所以由页面传进来。
   */
  coverBase: string;
}) {
  const [active, setActive] = useState(0);
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();

  /** 焦点 + 选中一起走（APG 的「自动激活」模式：焦点到哪，面板就切到哪）。 */
  const select = (index: number) => {
    const next = (index + FEATURED_TAGS.length) % FEATURED_TAGS.length;
    setActive(next);
    tabsRef.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      select(active + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      select(active - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      select(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      select(FEATURED_TAGS.length - 1);
    }
  };

  return (
    <>
      {/*
        tab 那排。`overflow-x-auto` 是给窄屏用的：六个标签在手机上排不下，
        横向滚动比换行好看（换行会把下面那排卡片推下去，切换时整页跳动）。

        🔴 **四个方向都要留出描边的位置**（2026-11-05 修）：`pixel-edge` 的描边是用
        box-shadow 往盒子**外面**画的，而 `overflow-x-auto` 一旦设上，`overflow-y` 就会
        被算成 `auto`（规范行为），容器会把所有超出内容框的东西裁掉。
        一开始只给了 `pb-1`，结果每颗 tab **只有下边框、没有上边框**，看起来像没画完。
        所以是 `p-1` 不是 `pb-1`；`-mx-1` 让它和左边那行文案对齐。
      */}
      <div
        role="tablist"
        aria-label={featuredText({ zh: '精选类型', en: 'Featured categories', ja: '特集ジャンル', ko: '추천 장르' }, locale)}
        className="-mx-1 mt-6 flex gap-2 overflow-x-auto p-1"
      >
        {FEATURED_TAGS.map((tag, index) => {
          const isActive = index === active;
          return (
            <button
              key={tag.id}
              ref={(node) => {
                tabsRef.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tag.id}`}
              aria-controls={`${baseId}-panel-${tag.id}`}
              aria-selected={isActive}
              /* 只有当前那颗在 tab 序列里，其余用方向键到达 —— APG 的标准做法 */
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={onKeyDown}
              /* 未选中压一档描边（理由见 games.tsx 那排机种 chip 的注释） */
              className={`pixel-edge pxw-2 shrink-0 px-3.5 py-1.5 text-[12px] transition-colors ${
                isActive
                  ? 'pxc-500 bg-accent text-ink-950'
                  : 'pxc-600 bg-ink-800 text-ink-200 hover:text-accent'
              }`}
            >
              {featuredText(tag.label, locale)}
            </button>
          );
        })}
      </div>

      {FEATURED_TAGS.map((tag, tagIndex) => (
        <div
          key={tag.id}
          role="tabpanel"
          id={`${baseId}-panel-${tag.id}`}
          aria-labelledby={`${baseId}-tab-${tag.id}`}
          hidden={tagIndex !== active}
        >
          {/*
            列数（2026-11-05 调密）：原来 `grid-cols-2 sm:grid-cols-3`，手机上两张、
            平板三张，封面是 3:4 的竖版，一块就占了半屏多 —— 一屏看不到第二行。
            精选只是「看封面挑一个」，不需要那么大的图，所以按「窄屏 3 / 平板 4 /
            桌面 6」排：桌面正好一行摆满，手机上也能一眼看到 6 款。
          */}
          <ul className="mt-5 grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3.5 lg:grid-cols-6">
            {tag.games.map((game, index) => (
              <li
                key={game.slug}
                className="card-in"
                style={{ animationDelay: `${cardDelayMs(index)}ms` }}
              >
                <Link
                  href={localePath(locale, `/games/${game.slug}`)}
                  /* 见文件头那条 ⚠️：33 个链接全预取 = 33 次详情页渲染 */
                  prefetch={false}
                  className="pixel-edge pxw-2 pxc-700 block h-full bg-ink-900 transition-colors hover:bg-ink-800"
                >
                  <span className="relative block aspect-[3/4] w-full overflow-hidden bg-ink-950">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${coverBase}${game.cover}`}
                      /* 同一链接里紧跟着标题文字，链接名对读屏已经够了 */
                      alt=""
                      /* 只有默认那一栏的前三张值得抢首屏带宽，其余全懒加载 */
                      loading={tagIndex === 0 && index < 3 ? 'eager' : 'lazy'}
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  </span>
                  <span className="mt-2 block px-1 pb-1">
                    <span className="block truncate text-[12px] text-ink-100">
                      {featuredText(game.title, locale)}
                    </span>
                    {/* 元信息用 ink-400：理由同 GameCardGrid 那条（11px 在 ink-500 上读不清） */}
                    <span className="mt-0.5 block truncate text-[11px] text-ink-400">
                      {[game.year, consoleLabel(game.console, locale)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
