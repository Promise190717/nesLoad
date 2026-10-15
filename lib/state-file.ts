const STATE_HEADER = new TextEncoder().encode('NESLOAD-STATE-1\n');

/** Compress large snapshots before local storage and cloud upload. */
export async function packState(state: Blob): Promise<Blob> {
  if (!state.size) throw new Error('Empty emulator state');
  const compressed = await new Response(state.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  return new Blob([STATE_HEADER, compressed], { type: 'application/octet-stream' });
}

/** Older battery saves remain readable; they must never be passed to loadState. */
export async function unpackSave(bytes: Uint8Array): Promise<{ kind: 'state' | 'battery'; bytes: Uint8Array }> {
  if (STATE_HEADER.every((value, index) => bytes[index] === value)) {
    const compressed = new Blob([new Uint8Array(bytes.slice(STATE_HEADER.length))]);
    const state = await new Response(compressed.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    return { kind: 'state', bytes: new Uint8Array(state) };
  }
  // RetroArch snapshots from the former slot UI start with RASTATE or gzip magic.
  const signature = new TextDecoder().decode(bytes.subarray(0, 7));
  const rawState = signature === 'RASTATE' || signature.startsWith('#RZIPv') ||
    (bytes[0] === 0x1f && bytes[1] === 0x8b);
  return { kind: rawState ? 'state' : 'battery', bytes };
}
