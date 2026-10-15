import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

async function load(path, globals = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  });
  const loaded = { exports: {} };
  runInNewContext(outputText, { module: loaded, exports: loaded.exports, EventTarget, clearInterval, ...globals });
  return loaded.exports;
}

test('repeated core exits clear OpenAL timers, audio contexts, workers and canvas backreferences', async () => {
  const intervals = new Set();
  const { releaseEmulatorRuntime } = await load('../lib/emulator-runtime.ts', {
    clearInterval: id => intervals.delete(id),
  });
  for (let cycle = 0; cycle < 20; cycle++) {
    let paused = 0;
    let stopped = 0;
    let terminated = 0;
    const ctx = { state: 'running', async close() { this.state = 'closed'; } };
    const interval = cycle + 1;
    intervals.add(interval);
    const canvas = { GLctxObject: { runtime: 'old core' } };
    const runtime = {
      Browser: {
        mainLoop: { pause() { paused++; }, func: () => {}, queue: [() => {}] },
        workers: [{ terminate() { terminated++; } }],
      },
      AL: { contexts: { 1: { interval, audioCtx: ctx } }, currentCtx: ctx },
      Module: { canvas, ctx: {}, _toggleMainLoop: value => { assert.equal(value, 0); stopped++; } },
    };
    await releaseEmulatorRuntime(runtime);
    assert.equal(intervals.size, 0);
    assert.equal(ctx.state, 'closed');
    assert.equal(Object.keys(runtime.AL.contexts).length, 0);
    assert.equal(runtime.AL.currentCtx, null);
    assert.equal(runtime.Browser.mainLoop.func, null);
    assert.equal(runtime.Browser.mainLoop.queue.length, 0);
    assert.equal(canvas.GLctxObject, undefined);
    assert.equal(runtime.Module.ctx, null);
    assert.equal(paused, 1);
    assert.equal(stopped, 1);
    assert.equal(terminated, 1);
  }
});

test('all listeners of the same type are removed while unrelated page listeners survive', async () => {
  const { trackRuntimeListeners } = await load('../lib/emulator-runtime.ts');
  const canvas = new EventTarget();
  let pageEvents = 0;
  let coreEvents = 0;
  canvas.addEventListener('input', () => pageEvents++);
  for (let cycle = 0; cycle < 20; cycle++) {
    const original = EventTarget.prototype.addEventListener;
    const tracking = trackRuntimeListeners([canvas]);
    canvas.addEventListener('input', () => coreEvents++);
    canvas.addEventListener('input', () => coreEvents++);
    tracking.stop();
    assert.equal(EventTarget.prototype.addEventListener, original);
    canvas.dispatchEvent(new Event('input'));
    tracking.dispose();
    canvas.dispatchEvent(new Event('input'));
    assert.equal(coreEvents, (cycle + 1) * 2);
  }
  assert.equal(pageEvents, 40);
});

test('canvas cleanup removes core closures and restores pre-existing methods', async () => {
  const { trackCanvasRuntime } = await load('../lib/emulator-runtime.ts');
  const original = () => 'app context';
  const canvas = { getContext: original };
  const release = trackCanvasRuntime(canvas);
  canvas.getContext = () => 'core context';
  canvas.exitFullscreen = () => 'retained core';
  canvas.GLctxObject = { runtime: {} };
  release();
  assert.equal(canvas.getContext, original);
  assert.equal(Object.hasOwn(canvas, 'exitFullscreen'), false);
  assert.equal(Object.hasOwn(canvas, 'GLctxObject'), false);
});

test('audio sessions stop tracks, close late audio contexts and release the latest tap', async () => {
  let stopped = 0;
  let disconnected = 0;
  class AudioNode {
    connect(destination) { return destination; }
  }
  class AudioDestinationNode extends AudioNode {
    constructor(context) { super(); this.context = context; }
  }
  class AudioContext {
    state = 'running';
    destination = new AudioDestinationNode(this);
    createMediaStreamDestination() {
      const track = { readyState: 'live', stop() { this.readyState = 'ended'; stopped++; } };
      return {
        stream: { getTracks: () => [track], getAudioTracks: () => [track] },
        disconnect() { disconnected++; },
      };
    }
    async close() { this.state = 'closed'; }
  }
  const { installAudioTap, trackEmulatorAudio, getAudioTrack } = await load('../lib/audio-tap.ts', {
    AudioNode, AudioDestinationNode, AudioContext,
  });
  installAudioTap();
  for (let cycle = 0; cycle < 20; cycle++) {
    const session = trackEmulatorAudio();
    const ctx = new AudioContext();
    new AudioNode().connect(ctx.destination);
    assert.equal(getAudioTrack()?.readyState, 'live');
    await session.dispose();
    assert.equal(ctx.state, 'closed');
    assert.equal(getAudioTrack(), null);
    await session.dispose(); // Failure cleanup and normal exit may both run.
  }
  assert.equal(stopped, 20);
  assert.equal(disconnected, 20);
});
