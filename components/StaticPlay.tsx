'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import GamesShell from './GamesShell';
import PlayBackLink from './PlayBackLink';
import PlayScene from './PlayScene';
import { useI18n } from './I18nProvider';
import { localizeLibraryGame, type LibraryGame } from './GameLibraryPanel';
import { consoleLabel } from '@/lib/consoles';
import type { Locale } from '@/lib/i18n';

/**
 * 顶栏里那条**这一款是什么**的小横条（2026-10-19 加）：封面 + 名字 + `机种 · 年份`。
 *
 * 原来它是右栏最上面那张大卡片（`.play-game`，92×~120 的封面 + 三行文字）。
 * 用户要求挪到「返回」右边、尺寸再压一号 —— 于是右栏直接从「按键设置」开始，
 * 屏幕上那块空白（返回和右上入口之间整整一行）也被填上了。
 *
 * ⚠️ 为什么放在**这里**而不是 `PlayScene` 的右栏里：顶栏那一行是 `GamesShell`
 *    （服务端组件）画的，在 `PlayScene` 外面上方；而游戏数据是这一层的
 *    `useEffect` 从 `/api/games/<id>` 取的（`PlayScene` 拿的是 `serverGame`）。
 *    顺手把这份数据喂给外壳的 `navExtra`，比在 `PlayScene` 里对着外壳用 portal
 *    或者再取一次接口都干净。
 *
 * ⚠️ 封面 `alt=""`：名字就贴在右边，读屏会把同一件事念两遍（`PlayScene` 原来那张
 *    大卡片因为封面是主图才配了 alt，这里不是主图了）。
 */
function PlayGameInfo({ game, locale }: { game: LibraryGame; locale: Locale }) {
  const text = localizeLibraryGame(game, locale);
  const meta = [consoleLabel(game.consoleType, locale), game.year ? String(game.year) : '', text.developer ?? '']
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="play-game-info pixel-edge pxw-1 pxc-600 flex min-w-0 items-center gap-2 bg-ink-900 px-2 py-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={game.imageUrl} alt="" className="h-8 w-6 shrink-0 object-cover" />
      <div className="min-w-0">
        <p className="truncate text-[12px] leading-tight text-ink-100">{text.title}</p>
        <p className="mt-0.5 truncate text-[11px] leading-tight text-ink-500">{meta}</p>
      </div>
    </div>
  );
}

function PlaySession({ id, game, room, host }: {
  id: string;
  game: LibraryGame | null | undefined;
  room: string;
  host: boolean;
}) {
  // Determine NDS restrictions before PlayScene starts joining a room. A shared
  // static document cannot decide this from per-request query parameters.
  const soloOnly = game?.consoleType === 'nds';
  const effectiveRoom = soloOnly ? '' : room;
  const effectiveHost = host && !soloOnly;
  /* ⚠️ `serverGame` 的三态用 `id ? game : undefined` 传，别写成 `game ?? undefined`：
     后者会把「有 id 但库里没有」（`null`）压成「没有 id」，`PlayScene` 于是又去打一遍接口。 */
  return <PlayScene serverGame={id ? game : undefined} initialMode={effectiveHost ? 'host' : 'solo'}
    initialRoomCode={effectiveRoom} autoStart={Boolean(id) && !effectiveRoom && !effectiveHost} />;
}

/** Query parameters belong to the browser; the document is shared by all players. */
export default function StaticPlay() {
  const query = useSearchParams();
  const { locale, href, t } = useI18n();
  const single = (key: string) => query.getAll(key).length === 1 ? query.get(key)!.trim() : '';
  const id = single('id');
  const room = single('room');
  const host = single('mode') === 'host';
  const back = id ? href(`/games/${encodeURIComponent(id)}`) : href('/games');

  /*
   * 取这一款的资料。**三态**和 `PlayScene` 的 `serverGame` 完全一致：
   * `undefined` = 还在取 / 地址上没有 `?id=`，`null` = 查无此款。
   *
   * 2026-10-19 从 `PlaySession` 挪上来一层：顶栏那条小横条（`PlayGameInfo`）
   * 也要用这份数据，而它在 `PlaySession` 外面。
   */
  const [game, setGame] = useState<LibraryGame | null | undefined>(id ? undefined : null);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    void fetch(`/api/games/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async response => response.ok ? (await response.json()).game as LibraryGame : null)
      .then(found => { if (!controller.signal.aborted) setGame(found ?? null); })
      .catch(() => { if (!controller.signal.aborted) setGame(null); });
    return () => controller.abort();
  }, [id]);

  return (
    <GamesShell locale={locale} label="PLAY" title={t('gamesPage.playOnline')}
      back={{ href: back, label: 'common.back', mode: 'history' }}
      backNode={<PlayBackLink href={back} />}
      navExtra={game ? <PlayGameInfo game={game} locale={locale} /> : undefined}
      showHeader={false} fill wide showTheme={false}>
      {id && game === undefined
        ? <p role="status" className="p-8 text-center text-[12px] text-ink-400">{t('games.loading')}</p>
        : <PlaySession key={`${id}:${room}:${host}`} id={id} game={game} room={room} host={host} />}
    </GamesShell>
  );
}
