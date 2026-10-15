interface AudioRuntimeContext {
  interval?: ReturnType<typeof setInterval> | null;
  audioCtx?: AudioContext;
}

export interface EmulatorRuntime {
  Browser?: {
    mainLoop?: { pause(): void; func?: unknown; queue?: unknown[] };
    workers?: { terminate(): void }[];
  } | null;
  AL?: {
    contexts?: Record<string, AudioRuntimeContext>;
    currentCtx?: unknown;
  } | null;
  Module?: {
    canvas?: HTMLCanvasElement & { GLctxObject?: unknown };
    ctx?: unknown;
    _toggleMainLoop?: (running: number) => void;
  };
}

/** Stop browser resources even when a core's force-exit skips its C destructors. */
export async function releaseEmulatorRuntime(runtime: EmulatorRuntime): Promise<void> {
  const safely = (operation: () => void) => {
    try { operation(); } catch { /* Keep releasing the other resources. */ }
  };
  safely(() => runtime.Browser?.mainLoop?.pause());
  safely(() => runtime.Module?._toggleMainLoop?.(0));
  const mainLoop = runtime.Browser?.mainLoop;
  if (mainLoop) {
    mainLoop.func = null;
    mainLoop.queue = [];
  }
  for (const worker of runtime.Browser?.workers ?? []) safely(() => worker.terminate());

  const closing: Promise<void>[] = [];
  const audio = runtime.AL;
  if (audio) {
    for (const [id, context] of Object.entries(audio.contexts ?? {})) {
      if (context.interval != null) clearInterval(context.interval);
      context.interval = null;
      const ctx = context.audioCtx;
      if (ctx && ctx.state !== 'closed') {
        safely(() => { closing.push(ctx.close().catch(() => undefined)); });
      }
      delete audio.contexts?.[id];
    }
    audio.currentCtx = null;
  }

  // React keeps the canvas across games. This Emscripten property points back to
  // the previous GL runtime, so it must not survive its owner.
  const canvas = runtime.Module?.canvas;
  if (canvas) delete canvas.GLctxObject;
  if (runtime.Module) runtime.Module.ctx = null;
  await Promise.all(closing);
}

/** Emscripten also assigns JS closures directly to the shared canvas. */
export function trackCanvasRuntime(canvas: HTMLCanvasElement) {
  const names = ['GLctxObject', 'getContext', 'getContextSafariWebGL2Fixed', 'requestPointerLock', 'exitPointerLock', 'exitFullscreen'];
  const properties = names.map(name => ({ name, descriptor: Object.getOwnPropertyDescriptor(canvas, name) }));
  return () => {
    for (const { name, descriptor } of properties) {
      if (descriptor) Object.defineProperty(canvas, name, descriptor);
      else Reflect.deleteProperty(canvas, name);
    }
  };
}

/** Nostalgist tracks only the last listener of each type; retain every core listener. */
export function trackRuntimeListeners(targets: EventTarget[]) {
  const original = EventTarget.prototype.addEventListener;
  const listeners: { target: EventTarget; type: string; listener: EventListenerOrEventListenerObject; capture: boolean }[] = [];
  const watched = new Set(targets);
  const patched: typeof original = function (this: EventTarget, type, listener, options) {
    if (listener && watched.has(this)) {
      listeners.push({ target: this, type, listener, capture: typeof options === 'boolean' ? options : options?.capture ?? false });
    }
    return original.call(this, type, listener, options);
  };
  EventTarget.prototype.addEventListener = patched;
  const stop = () => {
    if (EventTarget.prototype.addEventListener === patched) EventTarget.prototype.addEventListener = original;
  };
  return {
    stop,
    dispose() {
      stop();
      for (const { target, type, listener, capture } of listeners) target.removeEventListener(type, listener, capture);
      listeners.length = 0;
      watched.clear();
    },
  };
}
