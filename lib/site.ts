/** Public metadata must not read headers(), which opts routes out of static rendering. */
export async function resolveSiteOrigin(): Promise<string> {
  const configured = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  const value = configured ?? 'https://www.retrogamesonline.fun';
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('SITE_URL must use http or https');
  return url.origin;
}
