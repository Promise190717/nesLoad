import Link from 'next/link';
import { cardDelayMs } from '@/lib/card-stagger';
import { localePath, type Locale } from '@/lib/i18n';
import { localizeGame, type Game } from '@/lib/server/games';
import { CONSOLE_LABEL } from './CartridgeSprite';

/**
 * 游戏卡片的网格 —— `/games` 列表页和开发商页（`/developers/<id>` 里那段
 * 「他名下的游戏」）**共用同一套版式与入场动效**。
 *
 * 为什么做成组件：两边只有「卡片下面那行元信息」差一点点（开发商页那边要不要再报一次
 * 开发商名字），其余从网格列数到动效参数完全一样。各写一份的话，改了 /games 的列数
 * 另一页就会不知不觉地跟它不一样。
 *
 * **服务端组件**（没有 'use client'）：卡片是纯文本 + 链接 + 一个内联 style，
 * 没有任何交互 —— 那两颗真正需要交互的按钮（下载 / 分享）在详情页，各自带 'use client'。
 *
 * ⚠️ 爬虫拿到的是**同样的 HTML**（动画纯 CSS，不影响正文与链接），所以动效可以放心加。
 *
 * ⚠️ `locale` 是**必填**的：卡片上的标题 / 开发商要按当前语言取一份
 *    （`localizeGame`，英文站空值回退中文，见 lib/server/games.ts）。
 *    这个组件是服务端组件，语言从页面传进来，没有别的来源。
 */
export default function GameCardGrid({
  games,
  locale,
  showDeveloper = true,
}: {
  games: readonly Game[];
  /** 当前语言。卡片文案按它取一份 —— 见文件头那条 ⚠️。 */
  locale: Locale;
  /**
   * 卡片下面那行要不要带上开发商名。
   * 开发商详情页里满屏都是同一个开发商，再报一遍是噪音 ⇒ 那边传 false。
   */
  showDeveloper?: boolean;
}) {
  return (
    <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {games.map((game, index) => {
        /* 卡片的文案（标题 / 开发商）按当前语言取一份 —— 见文件头那条 ⚠️ */
        const text = localizeGame(game, locale);
        /*
         * 卡片下面那行：年份 · 开发商 · 机种。
         * 把机种放在**文字里**而不是封面角标上：角标是给「已经知道自己在看什么」的人认的，
         * 而从搜索进来的读者需要文字告诉他这是什么机种。
         */
        const meta = [
          game.year,
          showDeveloper ? text.developer : null,
          CONSOLE_LABEL[game.consoleType],
        ]
          .filter(Boolean)
          .join(' · ');

        return (
          /*
           * 入场动效：`.card-in` 负责「一张卡片长什么样」（从下面 10px 浮上来 + 淡入），
           * 错峰延迟按序号算好写进内联 `animation-delay`（参数在 lib/card-stagger.ts，
           * 和房间那个游戏库弹窗共用同一套节奏）。
           *
           * 延迟只是个内联 style，**服务端算好渲染进 HTML 就行**，不需要客户端组件。
           *
           * **不用给 <ul> 做「换一批就重播」的机关**：翻页 / 搜索之后装的是另一批 id，
           * `key` 全变 ⇒ React 换掉整个 <li>，新元素上的 CSS 动画自然重播；
           * 同一张卡片还在原位时就不该再动。
           */
          <li
            key={game.id}
            className="card-in"
            style={{ animationDelay: `${cardDelayMs(index)}ms` }}
          >
            <Link
              href={localePath(locale, `/games/${game.id}`)}
              className="pixel-edge pxw-2 pxc-700 block h-full bg-ink-900 transition-colors hover:bg-ink-800"
            >
              <span className="relative block aspect-[3/4] w-full overflow-hidden bg-ink-950">
                {/* R2 公网域名，不走 next/image（那需要在 next.config 里登记 remotePatterns） */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={game.imageUrl}
                  /*
                   * `alt=""` 是**刻意**的：这张图在同一个链接里，紧挨着下面那行标题文字，
                   * 而链接名对读屏就是「标题」。再给图配一次标题 = 同一句话念两遍。
                   * 详情页那张大封面不一样，那里它是页面的主图、不在链接里，配了 alt。
                   */
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </span>
              <span className="mt-2 block px-1">
                <span className="block truncate text-[12px] text-ink-100">{text.title}</span>
                <span className="mt-0.5 block truncate text-[11px] text-ink-500">{meta}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
