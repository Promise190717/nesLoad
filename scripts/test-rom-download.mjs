import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/http.ts', import.meta.url), 'utf8');
function client(fetcher) {
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  runInNewContext(compiled, { module: loaded, exports: loaded.exports, fetch: fetcher, Blob, DOMException,
    AbortController, setTimeout, clearTimeout });
  return loaded.exports;
}
const options = { onProgress() {} };

test('probe retries a transient gateway failure and returns the complete ROM', async () => {
  let calls = 0;
  const api = client(async () => ++calls === 1
    ? new Response('gateway', { status: 503 })
    : new Response('ROM', { headers: { 'Content-Length': '3' } }));
  assert.equal(await (await api.fetchRomWithProgress('/rom', options)).text(), 'ROM');
  assert.equal(calls, 2);
});

test('a truncated full response is retried before returning bytes', async () => {
  let calls = 0;
  const api = client(async () => new Response(++calls === 1 ? 'R' : 'ROM', { headers: { 'Content-Length': '3' } }));
  assert.equal(await (await api.fetchRomWithProgress('/rom', options)).text(), 'ROM');
  assert.equal(calls, 2);
});

test('small-file body failures retry without accepting a partial file', async () => {
  let calls = 0;
  const api = client(async () => {
    calls++;
    if (calls === 1) return new Response('R', { status: 206, headers: { 'Content-Range': 'bytes 0-0/3' } });
    return new Response(calls === 2 ? 'R' : 'ROM');
  });
  assert.equal(await (await api.fetchRomWithProgress('/rom', options)).text(), 'ROM');
  assert.equal(calls, 3);
});

test('permanent rejection does not retry or split into more requests', async () => {
  let calls = 0;
  const api = client(async () => { calls++; return new Response('missing', { status: 404 }); });
  await assert.rejects(api.fetchRomWithProgress('/rom', options), /HTTP 404/);
  assert.equal(calls, 1);
});

test('cancellation interrupts Retry-After backoff immediately', async () => {
  const controller = new AbortController();
  let calls = 0;
  const api = client(async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '30' } }); });
  const pending = api.fetchRomWithProgress('/rom', { ...options, signal: controller.signal });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(calls, 1);
});
