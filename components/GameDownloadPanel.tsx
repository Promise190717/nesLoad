'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { localizeTexts, type GameTexts } from '@/lib/game-text';
import { defaultRomLanguage, romLanguageOptions } from '@/lib/rom-lang';
import { useI18n } from './I18nProvider';
import RomDownloadGate from './RomDownloadGate';

/**
 * 下载页的**正文**（2026-11-04 从 `app/[locale]/games/[id]/download/page.tsx` 搬出来）。
 *
 * ## 为什么这一块必须搬到客户端
 *
 * 下载页在免费版 10ms CPU 下是**唯一撑不住的一族**：2110 款 × 18 语言 ≈ 3.8 万个独立 URL，
 * 每一个都要现场跑一次 React SSR，而冷渲染几十毫秒打不住。渲染超时就拿不到响应，
 * `cache.put` 也就不执行 ⇒ 那一页从此永远是冷的，每来一个人贡献一条 1102
 * （完整推导见 `worker.ts` 文件头「为什么长尾 URL 会永远冷」）。
 *
 * 解法只有一个方向：**让服务端输出的 HTML 与 `id` 无关**。这样 `worker.ts` 就能把
 * `/<locale>/games/<任意 id>/download` 全部折叠成 `/<locale>/__nesload_download`
 * 一个缓存键 —— 3.8 万条 URL 共用 18 份（每语言一份）副本，冷的只剩这 18 条，
 * 而它们用 `pnpm warm:edge` 一把就能焐热。
 *
 * 代价（明确接受过的）：这一页**没有逐页 `<title>` / OG**，因此页面自己挂了
 * `noindex, follow`（见 page.tsx）。它本来就和详情页内容重复、也不在 sitemap 里。
 *
 * ## 取数
 *
 * 只打公开接口 `/api/games/<id>`（返回的是列表里同一种 `Game` 形状，不含 `rom_url`）。
 * ⚠️ **取不到也不影响下载**：`romUrl` 由 slug 现拼，文件名在 `romName` 还空着时
 * 由 ROM 代理的 `Content-Disposition` 决定（见 `lib/download.ts` 的 `filename?`）。
 * 这条兜底是刻意的 —— 页面本体已经是缓存副本，唯一还可能冷的就是这个接口，
 * 它挂了也要让人能把文件拿走。
 *
 * ⚠️ `id` 从 **`usePathname()` 现解析**，不从 props 传，也**不要换成 `useParams()`**：
 *   · 从 props 传会把 id 带进服务端渲染结果，HTML 又变成逐 URL 不同、折叠缓存立刻失效；
 *   · `useParams()` 读的是 RSC 载荷里的 `params` —— 而这份载荷是**别人那一页**的
 *     （整族共用一份 HTML，里面内嵌的 flight 是当初渲染的那一条 URL 的）。
 *     `usePathname()` 永远来自 `location`，是唯一在这个方案下还对得上的信号。
 */

/** `/api/games/<id>` 回来的那一份里，这一页用得上的字段。 */
type ApiGame = {
  texts: GameTexts;
  imageUrl: string;
  romName: string;
  romLanguages?: { code: string; name: string }[];
};

export default function GameDownloadPanel() {
  const { locale, t, href } = useI18n();
  const pathname = usePathname();
  /* `/games/<id>/download`，允许一层语言前缀（middleware 内部 rewrite 会带出 `/en/…`） */
  const raw = /\/games\/([^/]+)\/download\/?$/.exec(pathname ?? '')?.[1] ?? '';
  /* 地址里的 id 可能是转义过的；`decodeURIComponent` 遇到坏序列会抛，别让它把整页带崩 */
  let id = raw;
  try {
    if (raw) id = decodeURIComponent(raw);
  } catch {
    /* 保持原样：接口那边会 404，页面走「找不到这个游戏」 */
  }

  const [game, setGame] = useState<ApiGame | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) return;
    /* 组件可能在请求回来之前卸载（返回上一页）：用这个开关别往已卸载的组件上写 state */
    let alive = true;

    (async () => {
      try {
        const res = await fetch(`/api/games/${encodeURIComponent(id)}`);
        if (!alive) return;
        /*
         * 服务端不再查库判存在性（那会让 HTML 重新与 id 相关），
         * 「这一款不存在」只能由这里变现：接口 404 ⇒ 画一句「找不到这个游戏」。
         * 状态码仍是 200（页面级 noindex，不怕被当成软 404 收进索引）。
         */
        if (res.status === 404) {
          setMissing(true);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as { game?: ApiGame } | null;
        if (alive && data?.game) setGame(data.game);
      } catch {
        /* 接口挂了就保持骨架：下面的下载闸门不依赖这份数据 */
      }
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  /*
   * 找不到这一款：只给两句话。去处由外壳左上角的「返回」兜（这一页不另造按钮，
   * 和三个 404 页「给一个确定去处」的口径一致）。
   */
  if (missing) {
    return (
      <div className="mt-6">
        <p className="text-[14px] text-ink-100">{t('gamesPage.notFoundTitle')}</p>
        <p className="mt-2 text-[13px] leading-7 text-ink-400">{t('gamesPage.notFound')}</p>
      </div>
    );
  }

  const text = game ? localizeTexts(game.texts, locale) : null;
  const codes = game?.romLanguages?.map((item) => item.code) ?? [];

  return (
    <>
      {/*
        封面 + 标题 + 文件名整片可点，回到详情页（2026-11-03 用户要的）。
        数据没回来之前画同尺寸的骨架 —— 这块从服务端挪到客户端之后，
        不占位的话正文会在数据到达时往下跳一格。
      */}
      {game && text ? (
        <Link
          href={href(`/games/${id}`)}
          prefetch={false}
          className="group mt-6 flex items-center gap-4"
        >
          <span className="pixel-edge pxw-2 pxc-700 w-[64px] shrink-0 bg-ink-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={game.imageUrl}
              alt={text.title}
              className="block aspect-[3/4] w-full object-cover transition-opacity group-hover:opacity-80"
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14px] text-ink-100 transition-colors group-hover:text-accent">
              {text.title}
            </span>
            {/*
              文件名直接写出来：街机的 ROM 是 romset（名字必须和驱动一致），
              下载前让人确认一下拿到的是什么，比下完再发现对不上强。
            */}
            <span className="mt-1 block truncate font-mono text-[12px] text-ink-500">
              {game.romName}
            </span>
          </span>
        </Link>
      ) : (
        <div className="mt-6 flex items-center gap-4" aria-hidden="true">
          <span className="pixel-edge pxw-2 pxc-700 w-[64px] shrink-0 bg-ink-900">
            <span className="block aspect-[3/4] w-full bg-ink-800" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block h-3.5 w-40 max-w-full bg-ink-800" />
            <span className="mt-2 block h-3 w-24 max-w-full bg-ink-800" />
          </span>
        </div>
      )}

      <RomDownloadGate
        romUrl={`/api/games/${encodeURIComponent(id)}/rom`}
        romName={game?.romName ?? ''}
        languages={romLanguageOptions(codes)}
        defaultCode={defaultRomLanguage(codes, locale)}
        languageLabel={t('gamesPage.field.language')}
      />
    </>
  );
}
