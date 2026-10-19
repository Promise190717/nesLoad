'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import GamesShell from './GamesShell';
import PlayBackLink from './PlayBackLink';
import PlayScene from './PlayScene';
import { useI18n } from './I18nProvider';
import type { LibraryGame } from './GameLibraryPanel';

function PlaySession({ id, room, host }: { id: string; room: string; host: boolean }) {
  const { t } = useI18n();
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

  // Determine NDS restrictions before PlayScene starts joining a room. A shared
  // static document cannot decide this from per-request query parameters.
  if (id && game === undefined) return <p role="status" className="p-8 text-center text-[12px] text-ink-400">{t('games.loading')}</p>;
  const soloOnly = game?.consoleType === 'nds';
  const effectiveRoom = soloOnly ? '' : room;
  const effectiveHost = host && !soloOnly;
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
  return (
    <GamesShell locale={locale} label="PLAY" title={t('gamesPage.playOnline')}
      back={{ href: back, label: 'common.back', mode: 'history' }}
      backNode={<PlayBackLink href={back} />} showHeader={false} fill wide showTheme={false}>
      <PlaySession key={`${id}:${room}:${host}`} id={id} room={room} host={host} />
    </GamesShell>
  );
}
