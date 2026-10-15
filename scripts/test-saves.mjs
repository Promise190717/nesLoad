import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute production TS with storage/runtime adapters; no ROM or cloud account needed.
async function loadModule(path, dependencies, globals = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  });
  const loaded = { exports: {} };
  runInNewContext(outputText, {
    module: loaded, exports: loaded.exports, Blob, Uint8Array, console,
    Response, TextEncoder, TextDecoder, CompressionStream, DecompressionStream,
    require: name => dependencies[name] ?? {},
    ...globals,
  });
  return loaded.exports;
}

const { EmulatorController } = await loadModule('../lib/emulator.ts', {
  './audio-tap': { installAudioTap() {} },
});

const { captureEjsState, restoreEjsState } = await loadModule('../lib/emulator-state.ts', {});
const { packState, unpackSave } = await loadModule('../lib/state-file.ts', {});

test('instant saving and loading use snapshot APIs without cartridge SRAM', async () => {
  const controller = new EmulatorController();
  let restored;
  controller.instance = {
    saveState: async () => ({ state: new Blob(['current frame']) }),
    loadState: async blob => { restored = await blob.text(); },
  };
  const file = await packState(await controller.saveState());
  const save = await unpackSave(new Uint8Array(await file.arrayBuffer()));
  assert.equal(save.kind, 'state');
  await controller.loadState(save.bytes);
  assert.equal(restored, 'current frame');
});

test('EJS snapshots copy the current heap and restore through load_state', async () => {
  const files = new Map();
  const wasm = {
    HEAPU8: new Uint8Array(2),
    cwrap(name) {
      if (name === 'save_state_info') return () => {
        // Serialization grows WASM memory; capture must use the new heap.
        wasm.HEAPU8 = new Uint8Array([0, 4, 5, 6]);
        return '3|1|1';
      };
      assert.equal(name, 'load_state');
      return (path, slot) => {
        assert.equal(path, 'game.state');
        assert.equal(slot, 0);
        assert.deepEqual(files.get('/game.state'), new Uint8Array([4, 5, 6]));
        return 1;
      };
    },
    FS: { writeFile: (path, bytes) => files.set(path, bytes), unlink: path => files.delete(path) },
  };
  const state = captureEjsState(wasm);
  wasm.HEAPU8.fill(0);
  const bytes = new Uint8Array(await state.arrayBuffer());
  assert.deepEqual(bytes, new Uint8Array([4, 5, 6]));
  restoreEjsState(wasm, bytes);
  assert.equal(files.size, 1); // The core may read the file in a queued task.
  wasm.cwrap = () => () => '100|1|0';
  assert.throws(() => captureEjsState(wasm), /Unable to capture/);
});

test('large snapshots compress for upload and decompress without changing bytes', async () => {
  const bytes = new Uint8Array(110 * 1024 * 1024);
  bytes[0] = 42;
  bytes[bytes.length - 1] = 19;
  const packed = await packState(new Blob([bytes]));
  assert.ok(packed.size < 20 * 1024 * 1024);
  const restored = await unpackSave(new Uint8Array(await packed.arrayBuffer()));
  assert.equal(restored.kind, 'state');
  assert.deepEqual(restored.bytes, bytes);
});

test('old battery saves keep their format and corrupt snapshots reject', async () => {
  const old = new Uint8Array([1, 2, 3]);
  assert.equal((await unpackSave(old)).kind, 'battery');
  const corrupt = new TextEncoder().encode('NESLOAD-STATE-1\ncorrupt');
  await assert.rejects(unpackSave(corrupt));
});

function batteryFixture({ path = '/saves/game.srm', fail = false } = {}) {
  const files = new Map();
  let flushes = 0;
  const emulator = {
    sramFilePath: path,
    callCommand(command) {
      assert.equal(command, '_cmd_savefiles');
      if (fail) throw new Error('flush failed');
      files.set(path, new Uint8Array([++flushes, 2, 3]));
    },
  };
  const fs = {
    stat(name) {
      const data = files.get(name);
      if (!data) throw new Error('not found');
      return { size: data.length, mode: 0 };
    },
    readFile: name => files.get(name),
    readdir() { return []; },
    isDir() { return false; },
  };
  const controller = new EmulatorController();
  // The outer Nostalgist wrapper deliberately has no callCommand or SRAM path.
  controller.instance = { getEmulator: () => emulator, getEmscriptenFS: () => fs };
  return { controller, emulator, files };
}

test('battery save flushes the underlying emulator and reads its exact path', async () => {
  const { controller } = batteryFixture();
  const first = await controller.saveBattery();
  assert.deepEqual(new Uint8Array(await first.arrayBuffer()), new Uint8Array([1, 2, 3]));
  const second = await controller.saveBattery();
  assert.deepEqual(new Uint8Array(await second.arrayBuffer()), new Uint8Array([2, 2, 3]));
  assert.deepEqual(new Uint8Array(await first.arrayBuffer()), new Uint8Array([1, 2, 3]));
});

test('no cartridge memory returns null, but a flush failure rejects', async () => {
  const { controller, emulator } = batteryFixture();
  emulator.callCommand = () => {};
  assert.equal(await controller.saveBattery(), null);
  const failing = batteryFixture({ fail: true });
  failing.files.set('/saves/game.srm', new Uint8Array([9]));
  await assert.rejects(failing.controller.saveBattery(), /flush failed/);
});

test('local saving replaces the previous bytes and removes old slots for that game only', async () => {
  const records = new Map([
    ['old-slot', { id: 'old-slot', romName: 'game.nes', createdAt: 1, data: new Blob(['old']) }],
    ['other.nes', { id: 'other.nes', romName: 'other.nes', createdAt: 1, data: new Blob(['other']) }],
  ]);
  const store = {
    index: () => ({ getAll: rom => [...records.values()].filter(item => item.romName === rom) }),
    put(record) { records.set(record.id, record); return record.id; },
    delete: id => records.delete(id),
  };
  const { writeSave, readSave } = await loadModule('../lib/saves.ts', {
    './db': { openDb: async () => ({}), run: async (_db, _name, _mode, action) => action(store) },
  }, { localStorage: { removeItem() {} } });
  assert.equal(await writeSave('game.nes', new Blob(['first'])), true);
  assert.equal(await writeSave('game.nes', new Blob(['latest'])), true);
  assert.equal(records.size, 2);
  assert.equal(await (await readSave('game.nes')).data.text(), 'latest');
  assert.equal(await (await readSave('other.nes')).data.text(), 'other');
});

test('cloud saving retains the latest write even when timestamps are identical', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE user_saves (
    id TEXT PRIMARY KEY, user_id TEXT, game_id TEXT, rom_name TEXT,
    title TEXT, state_key TEXT, size INTEGER, created_at INTEGER
  )`);
  const objects = new Map();
  const { createUserSave, listUserSaves } = await loadModule('../lib/server/user-data.ts', {
    'node:crypto': { randomUUID },
    './d1': { query: async (sql, params) => db.prepare(sql).all(...params) },
    './r2': {
      uploadObject: async (key, bytes) => { objects.set(key, bytes); },
      deleteObject: async key => { objects.delete(key); },
    },
  }, { Date: { now: () => 1000 } });
  try {
    const input = { gameId: 'game', romName: 'game.nes', title: 'Game', state: new Uint8Array([1]) };
    await createUserSave('user', input);
    const latest = await createUserSave('user', { ...input, state: new Uint8Array([2]) });
    const items = await listUserSaves('user', input.romName);
    assert.equal(items.length, 1);
    assert.equal(items[0].id, latest.id);
    assert.equal(objects.size, 1);
    assert.deepEqual(objects.get(`saves/user/${latest.id}`), new Uint8Array([2]));
  } finally {
    db.close();
  }
});
