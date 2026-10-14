import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

// Load the dependency-free TS policy without introducing another test runtime.
const source = await readFile(new URL('../lib/netplay-media.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2022 },
});
const { tuneVideoSender, tuneMediaReceiver, configureStreamContent, captureFpsFor } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function fixture(height = 1440) {
  const track = { kind: 'video', contentHint: '', getSettings: () => ({ height }) };
  const stream = { getVideoTracks: () => [track] };
  let applied;
  const sender = {
    track,
    getParameters: () => ({ transactionId: 'negotiated', encodings: [{ rid: 'main' }] }),
    setParameters: async params => { applied = params; },
  };
  return { track, stream, sender, applied: () => applied };
}

test('sharp keeps native pixels and negotiated identifiers, with 60 fps ceiling', async () => {
  const f = fixture();
  configureStreamContent(f.stream, 'sharp');
  await tuneVideoSender(f.sender, f.stream, 'sharp');
  assert.equal(f.track.contentHint, 'detail');
  assert.equal(f.applied().transactionId, 'negotiated');
  assert.deepEqual(f.applied().encodings, [{ rid: 'main', scaleResolutionDownBy: 1, maxBitrate: 16_000_000, maxFramerate: 60 }]);
  assert.equal(f.applied().degradationPreference, 'maintain-resolution');
});

test('balanced scales high-resolution sources proportionally, never upscales small sources', async () => {
  for (const [height, ratio] of [[1440, 2], [720, 1], [240, 1], [0, 1]]) {
    const f = fixture(height);
    await tuneVideoSender(f.sender, f.stream, 'balanced');
    assert.equal(f.applied().encodings[0].scaleResolutionDownBy, ratio);
    assert.equal(f.applied().encodings[0].maxBitrate, 6_000_000);
    assert.equal(f.applied().degradationPreference, 'maintain-framerate');
  }
});

test('smooth retains low-bandwidth 30 fps mode', async () => {
  const f = fixture(1080);
  configureStreamContent(f.stream, 'smooth');
  await tuneVideoSender(f.sender, f.stream, 'smooth');
  assert.equal(f.track.contentHint, 'motion');
  assert.equal(f.applied().encodings[0].maxBitrate, 1_200_000);
  assert.equal(f.applied().encodings[0].scaleResolutionDownBy, 2);
  assert.equal(f.applied().encodings[0].maxFramerate, captureFpsFor('smooth'));
  assert.equal(captureFpsFor('smooth'), 30);
});

test('unrelated tracks and unnegotiated senders are untouched', async () => {
  const f = fixture();
  await tuneVideoSender(f.sender, { getVideoTracks: () => [] }, 'sharp');
  assert.equal(f.applied(), undefined);
  f.sender.getParameters = () => ({ encodings: [] });
  await tuneVideoSender(f.sender, f.stream, 'sharp');
  assert.equal(f.applied(), undefined);
});

test('rejected browser encoding preference does not interrupt publishing', async () => {
  const f = fixture();
  f.sender.setParameters = async () => { throw new Error('Unsupported parameter'); };
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    await assert.doesNotReject(tuneVideoSender(f.sender, f.stream, 'sharp'));
    assert.equal(warnings.length, 1);
  } finally { console.warn = warn; }
});

test('low-delay preferences cover audio and video with legacy fallback', () => {
  for (const kind of ['audio', 'video']) {
    const receiver = { track: { kind }, jitterBufferTarget: null, playoutDelayHint: 1 };
    tuneMediaReceiver(receiver);
    assert.equal(receiver.jitterBufferTarget, 0);
    assert.equal(receiver.playoutDelayHint, 1);
  }
  const legacy = { playoutDelayHint: 1 };
  tuneMediaReceiver(legacy);
  assert.equal(legacy.playoutDelayHint, 0);
  const unsupported = {};
  tuneMediaReceiver(unsupported);
  assert.deepEqual(unsupported, {});
  assert.doesNotThrow(() => tuneMediaReceiver({ set jitterBufferTarget(_) { throw new Error('Unsupported'); } }));
});
