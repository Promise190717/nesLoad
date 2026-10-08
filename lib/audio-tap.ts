'use client';

/**
 * 把模拟器的声音旁路一份出来，供联机时推给加入者。
 *
 * 为什么需要这个：RetroArch 的 WASM 构建把声音交给 SDL2 → Emscripten 的 WebAudio，
 * 整条链路都在核心自己的 JS 胶水里，Nostalgist 既没有暴露音频节点、也没有提供
 * 「拿到输出流」的 API（翻过 dist，全库只有 `input_audio_mute` 这种配置项，
 * 零个 AudioContext 引用）。所以只能从浏览器的 WebAudio 接口上截：
 *
 *   拦 `AudioNode.prototype.connect`，凡是「往 destination 连」的节点，
 *   顺手也连一份到我们自己建的 `MediaStreamAudioDestinationNode`。
 *
 * 好处是不用关心核心用的是 ScriptProcessorNode 还是 AudioWorkletNode、也不管它
 * 中间串了多少增益节点 —— 最后一定要连到 `ctx.destination`，那一步跑不掉。
 * 而且只是**多接一路**，本机的声音一点不受影响（本机那份照旧走 ctx.destination）。
 *
 * 唯一的前提是必须在核心建 AudioContext 之前把原型改好 —— 所以 `installAudioTap()`
 * 在 `lib/emulator.ts` 的**模块顶层**调用（不是 loadRom 里），早于任何一次 launch。
 */

/** 全局只需要改一次原型；改两次会把上一次的补丁套在里面 */
let installed = false;
/** 最近一次被旁路的那个 destination 节点。核心重建 AudioContext 时会被换掉 */
let latest: MediaStreamAudioDestinationNode | null = null;
/**
 * 一个 AudioContext 只能有一个旁路节点，重复建会让声音变成两路叠着。
 *
 * key 收窄到 `AudioContext` 而不是 `BaseAudioContext`：`createMediaStreamDestination`
 * 只声明在 `AudioContext` 上 —— `OfflineAudioContext` 同样继承 `BaseAudioContext`，
 * 但它没有真实输出设备，也就没有这个方法。
 */
const taps = new WeakMap<AudioContext, MediaStreamAudioDestinationNode>();

/**
 * 取（或建）某个 context 的旁路节点。
 * 不是 `AudioContext`（比如离线渲染的 OfflineAudioContext）就返回 null —— 那种上下文
 * 没有输出设备，截它没有意义，调用方跳过即可。
 */
function ensureTap(context: BaseAudioContext): MediaStreamAudioDestinationNode | null {
  if (typeof AudioContext === 'undefined' || !(context instanceof AudioContext)) {
    return null;
  }

  let tap = taps.get(context);
  if (!tap) {
    tap = context.createMediaStreamDestination();
    taps.set(context, tap);
  }
  latest = tap;
  return tap;
}

/**
 * 装上音频旁路。幂等，重复调用没有副作用。
 * 必须在 `Nostalgist.launch` 之前调 —— 核心启动时就会建 AudioContext 并接线。
 */
export function installAudioTap(): void {
  if (installed) return;
  // 服务端渲染阶段没有 AudioNode；用 typeof 而不是 window 判断，两边都稳
  if (typeof AudioNode === 'undefined') return;
  installed = true;

  const proto = AudioNode.prototype;
  const original = proto.connect as unknown as (
    this: AudioNode,
    ...args: unknown[]
  ) => unknown;

  /*
   * connect 有两套签名：连节点（可带 output/input 下标，返回目标节点）和连 AudioParam
   * （返回 void）。所以这里不重写语义，只是原样转发一次、再补一路。
   *
   * 补的那一路必须调 `original` 而不是 `proto.connect`（即改过的这个），否则会自己
   * 递归自己；旁路节点本身也不是 AudioDestinationNode，不会再触发一次补丁。
   */
  proto.connect = function patched(
    this: AudioNode,
    destination: AudioNode | AudioParam,
    ...rest: number[]
  ): unknown {
    const result = original.apply(this, [destination, ...rest]);

    if (
      typeof AudioDestinationNode !== 'undefined' &&
      destination instanceof AudioDestinationNode
    ) {
      const tap = ensureTap(destination.context);
      if (tap) {
        try {
          original.call(this, tap);
        } catch {
          // 同一个节点重复连同一路会抛，忽略即可 —— 该接的已经接上了
        }
      }
    }

    return result;
  } as unknown as typeof proto.connect;
}

/**
 * 取当前能用的音频轨。核心还没建 AudioContext、或者那个 context 已经关掉时返回 null。
 * 调用方拿到 null 也不该报错 —— 最坏情况就是加入者只看得到画面、听不到声音。
 */
export function getAudioTrack(): MediaStreamTrack | null {
  const track = latest?.stream.getAudioTracks()[0] ?? null;
  return track && track.readyState === 'live' ? track : null;
}
