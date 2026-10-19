import { listGameStubsCached } from './games';
import { listDeveloperStubsCached } from './developers';

// Four locales plus download pages multiply the asset count. Prebuild a bounded
// hot set; the rest use ISR. Set STATIC_GAME_LIMIT explicitly for larger builds.
export async function gameStaticParams() {
  const limit = Number(process.env.STATIC_GAME_LIMIT ?? 24);
  if (!Number.isInteger(limit) || limit < 0) throw new Error('STATIC_GAME_LIMIT must be a nonnegative integer');
  const games = await listGameStubsCached();
  return games.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map(({ id }) => ({ id }));
}
export async function developerStaticParams() {
  return (await listDeveloperStubsCached()).map(({ id }) => ({ id }));
}
