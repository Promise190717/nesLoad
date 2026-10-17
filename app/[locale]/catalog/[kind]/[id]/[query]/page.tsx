import { notFound } from 'next/navigation';
import Games, { generateMetadata as gamesMetadata } from '@/lib/server/pages/games';
import Developers, { generateMetadata as developersMetadata } from '@/lib/server/pages/developers';
import Developer, { generateMetadata as developerMetadata } from '@/lib/server/pages/developer';
import Console, { generateMetadata as consoleMetadata } from '@/lib/server/pages/console';
import { decodeCatalogQuery } from '@/lib/catalog-route';

export const revalidate = 86400;
export function generateStaticParams() { return []; }
type Props = { params: Promise<{ locale: string; kind: string; id: string; query: string }> };
const views = { games: Games, developers: Developers, developer: Developer, console: Console };
const metadata = { games: gamesMetadata, developers: developersMetadata, developer: developerMetadata, console: consoleMetadata };
async function argumentsFor({ params }: Props) {
  const p = await params;
  if (!Object.prototype.hasOwnProperty.call(views, p.kind) || p.query.length > 2048) notFound();
  return { kind: p.kind as keyof typeof views, props: { params, searchParams: Promise.resolve(decodeCatalogQuery(p.query)) } };
}
export async function generateMetadata(input: Props) {
  const { kind, props } = await argumentsFor(input);
  return metadata[kind](props);
}
export default async function Page(input: Props) {
  const { kind, props } = await argumentsFor(input);
  return views[kind](props);
}
