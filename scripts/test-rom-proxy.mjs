import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const helperSource = readFileSync(new URL('../lib/server/rom-upstream.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(helperSource, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const helper = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const target = 'https://files.example.com/game.zip';
const compatibility = { userAgent: 'Browser test', referer: 'https://source.example.com/' };
const request = headers => new Request('https://site.example.com/api/games/id/rom', { headers });

test('one 403 compatibility retry releases the rejected body and requests all bytes', async () => {
  const calls = [];
  let cancelled = false;
  const fetcher = async (url, init) => {
    calls.push({ url, headers: new Headers(init.headers) });
    if (calls.length === 1) return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 403 });
    return new Response('PKfile', { status: 206, headers: { 'Content-Range': 'bytes 0-5/6' } });
  };
  const result = await helper.fetchRomUpstream(target, request({ cookie: 'private=yes', authorization: 'Bearer secret' }), { compatibility }, fetcher);
  assert.equal(calls.length, 2);
  assert.ok(cancelled);
  assert.equal(calls[0].headers.get('user-agent'), 'nesLoad/1.0');
  assert.equal(calls[1].headers.get('user-agent'), compatibility.userAgent);
  assert.equal(calls[1].headers.get('referer'), compatibility.referer);
  assert.equal(calls[1].headers.get('range'), 'bytes=0-');
  for (const call of calls) {
    assert.equal(call.headers.get('cookie'), null);
    assert.equal(call.headers.get('authorization'), null);
  }
  assert.equal(await result.text(), 'PKfile');
});

test('no retry for rate limits, explicit challenges, successful responses or R2-only requests', async () => {
  for (const sample of [
    { status: 429, headers: {} },
    { status: 403, headers: { 'Retry-After': '60' } },
    { status: 403, headers: { 'cf-mitigated': 'challenge' } },
    { status: 200, headers: {} },
    { status: 403, headers: {}, local: true },
  ]) {
    let count = 0;
    const response = await helper.fetchRomUpstream(target, request(), sample.local ? {} : { compatibility }, async () => {
      count++;
      return new Response('response', sample);
    });
    assert.equal(response.status, sample.status);
    assert.equal(count, 1);
    await response.body.cancel();
  }
});

test('preserves client ranges and validators across a bounded retry', async () => {
  const calls = [];
  await helper.fetchRomUpstream(target, request({ range: 'bytes=12-31', 'if-range': '"version1"' }), { compatibility }, async (_url, init) => {
    calls.push(new Headers(init.headers));
    return new Response('body', { status: 403 });
  });
  assert.equal(calls.length, 2);
  for (const headers of calls) {
    assert.equal(headers.get('range'), 'bytes=12-31');
    assert.equal(headers.get('if-range'), '"version1"');
  }
});

test('response header timeout does not abort a slow file stream', async () => {
  let signal;
  const response = await helper.fetchRomUpstream(target, request(), { timeoutMs: 10 }, async (_url, init) => {
    signal = init.signal;
    return new Response(new ReadableStream({ start(controller) {
      setTimeout(() => { controller.enqueue(new TextEncoder().encode('complete')); controller.close(); }, 25);
    } }));
  });
  assert.equal(await response.text(), 'complete');
  assert.equal(signal.aborted, false);
});

test('still aborts a request that never receives response headers', async () => {
  await assert.rejects(helper.fetchRomUpstream(target, request(), { timeoutMs: 5 }, async (_url, init) =>
    new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))
  ), { name: 'TimeoutError' });
});

test('validates byte ranges and recognizes complete files', () => {
  for (const range of ['bytes=0-', 'bytes=0-63', 'bytes=-64']) assert.ok(helper.isSingleByteRange(range));
  for (const range of ['bytes=', 'bytes=-', 'bytes=-0', 'bytes=9-2', 'bytes=0-1,4-5', 'bytes=99999999999999999999-', 'items=0-1']) {
    assert.equal(helper.isSingleByteRange(range), false, range);
  }
  assert.ok(helper.isCompleteByteRange('bytes 0-233/234'));
  for (const range of [null, 'bytes 0-63/234', 'bytes 1-233/234', 'bytes 0-233/*']) assert.equal(helper.isCompleteByteRange(range), false);
});

function routeWith(upstream) {
  const filename = new URL('../app/api/games/[id]/rom/route.ts', import.meta.url);
  const source = readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} };
  runInNewContext(output, {
    module: testModule, exports: testModule.exports, Request, Response, Headers, console: { error() {}, warn() {} },
    require(name) {
      if (name.endsWith('/games')) return { getGameRowCached: async () => ({ source_url: 'files:/game.zip', rom_url: '', rom_name: 'game.zip' }) };
      if (name.endsWith('/r2')) return { publicUrl: () => 'https://owned.example.com/game.zip' };
      if (name.endsWith('/upstream')) return { sourceFileUrl: () => target, UPSTREAM_SITE: compatibility.referer, UPSTREAM_USER_AGENT: compatibility.userAgent };
      if (name.endsWith('/rom-upstream')) return { ...helper, fetchRomUpstream: async () => upstream };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return headers => testModule.exports.GET(request(headers), { params: Promise.resolve({ id: 'id' }) });
}

test('proxy preserves a client partial response and does not cache it as the full ROM', async () => {
  const upstream = new Response('PK', { status: 206, headers: { 'Content-Type': 'application/zip', 'Content-Range': 'bytes 0-1/6', 'Content-Length': '2' } });
  const result = await routeWith(upstream)({ range: 'bytes=0-1' });
  assert.equal(result.status, 206);
  assert.equal(result.headers.get('content-range'), 'bytes 0-1/6');
  assert.match(result.headers.get('cache-control'), /no-store/);
  assert.equal(await result.text(), 'PK');
});

test('proxy converts only complete compatibility ranges into ordinary downloads', async () => {
  const full = await routeWith(new Response('PKfile', { status: 206, headers: { 'Content-Type': 'application/zip', 'Content-Range': 'bytes 0-5/6' } }))();
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-range'), null);
  assert.equal(await full.text(), 'PKfile');
  const partial = await routeWith(new Response('PK', { status: 206, headers: { 'Content-Type': 'application/zip', 'Content-Range': 'bytes 0-1/6' } }))();
  assert.equal(partial.status, 502);
});

test('proxy never sends an HTML challenge or an invalid range as a game file', async () => {
  const challenge = await routeWith(new Response('<html>challenge</html>', { headers: { 'Content-Type': 'text/html' } }))();
  assert.equal(challenge.status, 502);
  const invalid = await routeWith(new Response('unused'))({ range: 'bytes=0-1,4-5' });
  assert.equal(invalid.status, 416);
});

test('proxy rejects a 206 response without a valid Content-Range header', async () => {
  for (const contentRange of [null, 'bytes 0-99/10']) {
    const headers = { 'Content-Type': 'application/zip', ...(contentRange ? { 'Content-Range': contentRange } : {}) };
    const result = await routeWith(new Response('PK', { status: 206, headers }))({ range: 'bytes=0-1' });
    assert.equal(result.status, 502);
  }
});
