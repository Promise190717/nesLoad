/** EmulatorJS cores expose snapshots through memory rather than RetroArch state files. */
export interface EjsStateModule {
  HEAPU8: Uint8Array;
  cwrap(name: string, result: string, args: string[]): (...args: unknown[]) => unknown;
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    unlink(path: string): void;
  };
}

export function captureEjsState(wasm: EjsStateModule): Blob {
  const info = String(wasm.cwrap('save_state_info', 'string', [])());
  const [size, pointer, success] = info.split('|').map(Number);
  if (success !== 1 || !Number.isSafeInteger(size) || size <= 0 ||
      !Number.isSafeInteger(pointer) || pointer < 0 || pointer + size > wasm.HEAPU8.length) {
    throw new Error('Unable to capture emulator state');
  }
  // Read the current heap after serialization, which can grow WASM memory.
  return new Blob([new Uint8Array(wasm.HEAPU8.slice(pointer, pointer + size))]);
}

export function restoreEjsState(wasm: EjsStateModule, bytes: Uint8Array): void {
  const path = '/game.state';
  wasm.FS.writeFile(path, bytes);
  wasm.cwrap('load_state', 'number', ['string', 'number'])('game.state', 0);
  // Loading can queue a core task. Keep the file until the next restore overwrites it
  // or the emulator exits, so the task never races an immediate unlink.
}
