/** Query variants get distinct route-cache keys without changing public URLs.
 * Only public catalog routes enter this cache; account/admin/API never do.
 */
export function catalogRewrite(path: string, query: URLSearchParams): string | null {
  const match = /^\/(games|developers|consoles)(?:\/([^/]+))?$/.exec(path);
  if (!match || (match[1] === 'games' && match[2]) || (match[1] === 'consoles' && !match[2])) return null;
  const kind = match[1] === 'developers' && match[2] ? 'developer' : match[1] === 'consoles' ? 'console' : match[1];
  const keys = kind === 'games' ? ['q', 'console', 'page'] : kind === 'console' ? ['q', 'lang', 'page'] : ['page'];
  const selected = new URLSearchParams();
  for (const key of keys) for (const value of query.getAll(key)) selected.append(key, value);
  if (!selected.size) return null;
  // Do not store arbitrary tracking parameters or unbounded query strings.
  const value = selected.toString();
  if (value.length > 2048) throw new RangeError('Catalog query is too long');
  return `/catalog/${kind}/${match[2] ?? '_'}/${encodeURIComponent(value)}`;
}

export function decodeCatalogQuery(query: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = Object.create(null);
  // Next may pass the encoded path segment to the page, but the decoded
  // segment to metadata. A serialized query always has a literal '=';
  // only unwrap the path encoding when that separator is still encoded.
  // Decoding an already-unwrapped query would corrupt escaped '&' and '+'.
  const values = new URLSearchParams(query.includes('=') ? query : decodeURIComponent(query));
  for (const key of values.keys()) {
    const all = values.getAll(key);
    result[key] = all.length === 1 ? all[0] : all;
  }
  return result;
}
