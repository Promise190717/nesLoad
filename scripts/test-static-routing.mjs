import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/catalog-route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2020 } }).outputText;
const { catalogRewrite, decodeCatalogQuery } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const route = (path, query) => catalogRewrite(path, new URLSearchParams(query));
assert.equal(route('/games', 'utm_source=test'), null);
assert.equal(route('/games', 'page=2&utm_source=test'), route('/games', 'page=2'));
assert.notEqual(route('/games', 'page=2'), route('/games', 'page=3'));
assert.notEqual(route('/games', 'q=mario'), route('/games', 'q=sonic'));
assert.notEqual(route('/consoles/nes', 'page=2'), route('/consoles/snes', 'page=2'));
for (const path of ['/admin', '/account', '/login', '/api/games', '/games/id', '/games/id/download']) {
  assert.equal(route(path, 'page=2'), null);
}
const encoded = route('/games', 'q=超级马里奥&page=2&page=3').split('/').at(-1);
const decoded = decodeCatalogQuery(decodeURIComponent(encoded));
assert.equal(decoded.q, '超级马里奥');
assert.deepEqual(decoded.page, ['2', '3']);
for (const query of ['lang=zh', 'lang=ja&page=2', 'q=A%26B%2BC%3D%25&lang=zh', 'lang=zh&lang=en']) {
  const segment = route('/consoles/arcade', query).split('/').at(-1);
  const expected = decodeCatalogQuery(decodeURIComponent(segment));
  assert.deepEqual(decodeCatalogQuery(segment), expected);
}
assert.equal(decodeCatalogQuery('lang%3Dzh').lang, 'zh');
assert.equal(decodeCatalogQuery('q%3DA%2526B%252BC%253D%2525').q, 'A&B+C=%');
assert.throws(() => route('/games', `q=${'x'.repeat(2049)}`), RangeError);
console.log('Catalog cache keys: language-independent payload, query isolation, Unicode, duplicate params and private-route exclusion passed.');

// Optional production-server checks: TEST_BASE_URL=http://localhost:3100 pnpm test:static
if (process.env.TEST_BASE_URL) {
  const base = process.env.TEST_BASE_URL;
  async function get(path, headers) {
    const response = await fetch(base + path, { redirect: 'manual', headers });
    return { response, html: await response.text() };
  }
  for (const [path, lang] of [['/', 'en'], ['/zh', 'zh-CN'], ['/ja/games', 'ja-JP'], ['/ko/games', 'ko-KR']]) {
    const { response, html } = await get(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('cache-control'), /s-maxage=86400/);
    assert.ok(html.includes(`lang="${lang}"`), path);
    assert.ok(!html.includes('http://localhost:3000'), path);
  }
  for (const path of ['/games?page=2', '/zh/games?page=2', '/games?q=mario', '/consoles/nes?page=2']) {
    const first = await get(path);
    assert.equal(first.response.status, 200, path);
    const again = await get(path);
    assert.equal(again.response.headers.get('x-nextjs-cache'), 'HIT', path);
    assert.match(again.response.headers.get('cache-control'), /s-maxage=86400/);
  }
  const second = await get('/games?page=2');
  const filtered = await get('/zh/consoles/arcade?lang=zh');
  assert.equal(filtered.response.status, 200);
  const selectedLanguage = filtered.html.match(/<a\b[^>]*aria-current="true"[^>]*>[\s\S]*?<\/a>/g) ?? [];
  assert.equal(selectedLanguage.length, 1);
  assert.match(selectedLanguage[0], /href="\/zh\/consoles\/arcade\?lang=zh"/);
  assert.match(selectedLanguage[0], /简体中文/);
  assert.match(second.html, /<title>[^<]*\(2\)/);
  const search = await get('/games?q=mario');
  assert.match(search.html, /<title>[^<]*mario/);
  // Next 16 requires the RSC query marker as well as the RSC request header.
  const rsc = await get('/games?page=2&_rsc', { RSC: '1' });
  assert.match(rsc.response.headers.get('content-type'), /text\/x-component/);
  assert.ok(!rsc.html.startsWith('<!DOCTYPE html>'));
  const redirect = await get('/?id=test');
  assert.equal(redirect.response.status, 307);
  assert.equal(redirect.response.headers.get('location'), '/room?id=test');
  const chineseRedirect = await get('/zh?room=ABC');
  assert.equal(chineseRedirect.response.headers.get('location'), '/zh/room?room=ABC');
  // Cookie name is asserted against the source so this cannot silently test the wrong cookie.
  const i18n = readFileSync(new URL('../lib/i18n.ts', import.meta.url), 'utf8');
  const cookieName = i18n.match(/LOCALE_COOKIE\s*=\s*['"]([^'"]+)/)?.[1];
  assert.ok(cookieName);
  const saved = await get('/', { Cookie: `${cookieName}=zh` });
  assert.equal(saved.response.headers.get('location'), '/zh');
  const explicit = await get('/ja', { Cookie: `${cookieName}=zh` });
  assert.equal(explicit.response.status, 200);
  assert.ok(explicit.html.includes('lang="ja-JP"'));
  const admin = await get('/admin');
  assert.equal(admin.response.headers.get('location'), '/admin/login');
  const account = await get('/account');
  assert.match(account.response.headers.get('cache-control'), /private/);
  const manifest = JSON.parse(readFileSync(new URL('../.next/prerender-manifest.json', import.meta.url), 'utf8'));
  const gamePage = Object.keys(manifest.routes).find(path => /^\/en\/games\/[^/]+$/.test(path));
  assert.ok(gamePage, 'Expected a prebuilt game detail');
  const gameId = gamePage.split('/').at(-1);
  const game = await get(`/api/games/${gameId}`);
  assert.equal(game.response.status, 200);
  assert.equal(game.response.headers.get('x-nextjs-cache'), 'HIT');
  assert.match(game.response.headers.get('cache-control'), /s-maxage=86400/);
  const payload = JSON.parse(game.html);
  assert.equal(payload.game.id, gameId);
  assert.ok(!Object.hasOwn(payload.game, 'rom_url'));
  for (const path of ['/opengraph-image', '/twitter-image']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /image\/png/);
    await response.arrayBuffer();
  }
  console.log('Production HTTP: static HTML, four locales, query cache HITs, RSC isolation, room redirects and auth guards passed.');
}
