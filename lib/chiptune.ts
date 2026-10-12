'use client';

/**
 * 现场合成的 8-bit 小段 —— 地板上那台 MP4 的**兜底音源**。
 *
 * 为什么需要它：`/audio/i-miss-you.mp3` 是一首有版权的录音制品，仓库里不带
 * （要用户自己放进 `public/audio/`）。文件不在时那个 `<audio>` 直接加载失败，
 * 那台 MP4 就成了个哑巴摆件 —— 点下去没声音、屏幕上的歌词也不动，看着像坏了。
 * 这里**手搓一段 WAV**（不引音频库、不引任何素材文件），播放失败时拿它顶上：
 * 至少点下去有声音、播放态和歌词滚动都对得上。
 *
 * **每次调用都是新摇的一段**（2026-10-12 用户要求「每次点击都不一样」）：
 * 主音、调式、速度、音色（占空比）、旋律走向、长度全在 `compose()` 里现摇。
 * 所以这里**不缓存** —— 缓存就等于每次都一样。代价是调用方每换一段都要把上一次
 * 那个 `blob:` 地址 `revokeObjectURL()` 掉（一段约 60..170 KB，点几十次不还就是几 MB）。
 *
 * 这一段**只放一遍**（调用方会撤掉 `loop`）。不过旋律是按「收尾干净」写的 ——
 * 尾巴安静，放完那一下不会「咔」。
 *
 * ⚠️ **旋律必须是原创的**。它和那首歌没有任何关系 —— 别把「I MISS YOU」的调子抄进来，
 * 那是版权问题，不是风格问题。摇的时候刻意只走**五声音阶**：那个音阶里怎么跳都不难听，
 * 所以「随机」摇不出跑调的东西，一句乐理校验都不用写。
 */

/** 22050Hz 足够：方波的谐波本来就堆在高频，采样率再高只是白占内存。 */
const SAMPLE_RATE = 22050;

/** 主旋律的目标响度（RMS）。占空比不同的脉冲波响度差得很多，所以按 RMS 配平，见 `peakFor`。 */
const MELODY_RMS = 0.2;

/** 贝斯的目标响度 —— 比主旋律低约 4 dB。它是垫底的，不能跟主旋律抢。 */
const BASS_RMS = 0.13;

/** 起音 / 收音的斜坡。**必须有**：方波硬起硬收，每个音的头尾都是一声「咔」。 */
const ATTACK_SECONDS = 0.004;
const RELEASE_SECONDS = 0.035;

/** 音阶表：大调五声 / 小调五声，各铺两个八度 —— 旋律随机游走的活动范围。 */
const SCALES: readonly number[][] = [
  [0, 2, 4, 7, 9, 12, 14, 16, 19, 21], // 大调五声
  [0, 3, 5, 7, 10, 12, 15, 17, 19, 22], // 小调五声
];

/** 主音的候选（MIDI）。G3..E4 这一带方波最饱满，再往上就发尖了。 */
const ROOTS: readonly number[] = [55, 57, 60, 62, 64];

/** 三种脉冲波音色：12.5% 最单薄、50% 最厚实 —— 换一个像换了台机器。 */
const DUTIES: readonly number[] = [0.125, 0.25, 0.5];

/** 一步（八分音符）的时长范围，约等于 125..187 BPM。 */
const STEP_MIN = 0.16;
const STEP_MAX = 0.24;

/** 一段的步数候选：八步是「一小句」，十六步是「一长句」。**必须是 4 的倍数**（见贝斯）。 */
const STEP_COUNTS: readonly number[] = [8, 16];

/** 贝斯每四步换一个根音。 */
const BASS_EVERY = 4;

/** 贝斯比主旋律低两个八度。 */
const BASS_OCTAVE = 24;

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick<T>(items: readonly T[]): T {
  return items[randomInt(0, items.length - 1)];
}

/** 一段小段的「配料」—— 每次点击现摇一套。 */
interface Recipe {
  /** 主音（MIDI）。旋律和贝斯都相对它算。 */
  root: number;
  /** 一步多长（秒） */
  step: number;
  /** 脉冲波占空比 */
  duty: number;
  /** 一共几步 */
  steps: number;
  /** 主旋律：相对主音的半音数，一步一个音 */
  melody: number[];
  /** 贝斯：相对主音的半音数，每四步一个 */
  bass: number[];
}

/**
 * 摇一套配料。
 *
 * 旋律是**在音阶里随机游走**：每次挪 −2..+2 级，夹在音阶两端。走的是五声音阶，
 * 所以怎么跳都不会撞出难听的音程。`index` 从 0 起步，第一个音自然落在主音上。
 *
 * 收尾那一下特意摁回主音 —— 而且取**离前一个音最近的那个八度**（音阶里主音在
 * 0 和 12 两处），否则最后一步会从最高音硬砸回最低音，听着像摔了一跤。
 */
function compose(): Recipe {
  const scale = pick(SCALES);
  const steps = pick(STEP_COUNTS);

  const melody: number[] = [];
  let index = 0;
  for (let i = 0; i < steps; i++) {
    melody.push(scale[index]);
    index = Math.max(0, Math.min(scale.length - 1, index + randomInt(-2, 2)));
  }
  melody[steps - 1] = (melody[steps - 2] ?? 0) > 6 ? 12 : 0;

  /*
   * 贝斯也走同一条音阶（低两个八度），每个音盖四步。同音阶意味着它和主旋律
   * 天然合得上，不用管和声。第一个音摁在主音上，后面在音阶的头五个音里随便挪。
   */
  const bassCount = steps / BASS_EVERY;
  const bass: number[] = [-BASS_OCTAVE];
  let bassIndex = 0;
  for (let i = 1; i < bassCount; i++) {
    bassIndex = Math.max(0, Math.min(4, bassIndex + randomInt(-1, 1)));
    bass.push(scale[bassIndex] - BASS_OCTAVE);
  }

  return {
    root: pick(ROOTS),
    step: STEP_MIN + Math.random() * (STEP_MAX - STEP_MIN),
    duty: pick(DUTIES),
    steps,
    melody,
    bass,
  };
}

/** 一个音自己的包络：4ms 淡入、尾部 35ms 淡出，中间满幅。 */
function envelope(index: number, length: number): number {
  const attack = ATTACK_SECONDS * SAMPLE_RATE;
  if (index < attack) return index / attack;

  const release = RELEASE_SECONDS * SAMPLE_RATE;
  const left = length - index;
  if (left < release) return Math.max(left, 0) / release;

  return 1;
}

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * 把这个占空比的「峰值」算出来，让它的 **RMS 恒定**。
 *
 * 三种占空比听起来响度差得远：50% 的方波 RMS = 1，25% 是 0.577，12.5% 只剩 0.378 ——
 * 差 8.5 dB。固定峰值的话，连点几下会一次比一次小声。
 * 直流平衡之后 RMS = `√(duty / (1 − duty))`（推导见 `addSquare`），拿它除一下即可配平。
 *
 * 配平是**往小的一头靠**（峰值不会超过给定的 RMS 本身），所以不会削顶：
 * 12.5% 那一档主旋律峰值 0.53、贝斯 0.34，加起来 0.87，仍在 1 以内。
 */
function peakFor(rms: number, duty: number): number {
  return rms / Math.sqrt(duty / (1 - duty));
}

/**
 * 往 `out` 上**叠**一个方波音。
 *
 * 用 `+=` 而不是赋值：主旋律和贝斯会落在同一段时间上，得混在一起。
 * 相位直接用 `(i % period) / period` 算 —— 周期不是整数个采样点时会有极小的频率误差，
 * 对一段几秒的彩蛋来说完全听不出来，不值得为此引一套相位累加器。
 */
function addSquare(
  out: Float32Array,
  startSample: number,
  seconds: number,
  frequency: number,
  amplitude: number,
  duty: number
): void {
  const length = Math.floor(seconds * SAMPLE_RATE);
  const period = SAMPLE_RATE / frequency;

  /*
   * 两个电平必须**直流平衡**（一个周期均值 = 0）：直接写 `phase < duty ? 1 : -1`
   * 的话均值是 `2 × duty − 1`，而每个音又都带包络 —— 等于每弹一个音都往下「压」一下，
   * 听感上是一层跟拍子的低频隆隆声，还白吃掉一半动态余量。
   * 高电平归一化到 1，低电平按占空比补回来：`duty × 1 + (1 − duty) × low = 0`。
   */
  const low = -duty / (1 - duty);

  for (let i = 0; i < length; i++) {
    const index = startSample + i;
    if (index >= out.length) break;

    const phase = (i % period) / period;
    out[index] += (phase < duty ? 1 : low) * amplitude * envelope(i, length);
  }
}

/**
 * 把主旋律 + 贝斯铺成一条浮点采样。
 *
 * 总长度正好是「步数 × 步长」，而且每个音的包络都在自己的尾巴上收干净 —— 所以
 * **收尾是安静的**：这一小段放完不会「咔」一声（音源最容易翻车的地方就是尾巴）。
 */
function renderLoop(recipe: Recipe): Float32Array {
  const step = recipe.step * SAMPLE_RATE;
  const out = new Float32Array(Math.round(recipe.steps * step));
  const melodyPeak = peakFor(MELODY_RMS, recipe.duty);
  const bassPeak = peakFor(BASS_RMS, recipe.duty);

  for (let i = 0; i < recipe.melody.length; i++) {
    addSquare(
      out,
      Math.round(i * step),
      recipe.step,
      midiToFrequency(recipe.root + recipe.melody[i]),
      melodyPeak,
      recipe.duty
    );
  }
  for (let i = 0; i < recipe.bass.length; i++) {
    addSquare(
      out,
      Math.round(i * BASS_EVERY * step),
      recipe.step * BASS_EVERY,
      midiToFrequency(recipe.root + recipe.bass[i]),
      bassPeak,
      recipe.duty
    );
  }

  return out;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

/** 浮点采样 → 16bit 单声道 WAV。手写那 44 字节头，不引任何依赖。 */
function toWavBlob(samples: Float32Array): Blob {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true); // 本 chunk 之后还剩多少字节
  writeAscii(view, 8, 'WAVE');

  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM 的 fmt 块固定 16 字节
  view.setUint16(20, 1, true); // 1 = 线性 PCM
  view.setUint16(22, 1, true); // 单声道
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // 每秒字节数 = 采样率 × 声道数 × 2
  view.setUint16(32, 2, true); // 每帧字节数
  view.setUint16(34, 16, true); // 位深

  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < samples.length; i++) {
    // 先夹再转：叠出来的峰值可能超过 1，不夹就是整数溢出（听感上是爆音）
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * 现摇一段、合成好、返回 `blob:` 地址。
 *
 * **每次调用都是一段新的**，不缓存 —— 缓存就等于每次都一样，而用户要的正是
 * 「每次点击都不一样」。所以调用方必须负责把上一次那个地址 `revokeObjectURL()` 掉。
 *
 * 合成不出来（环境太老、没有 `URL.createObjectURL`）时返回 null ——
 * 调用方据此退回「没声音」，而不是把一个坏地址塞给 `<audio>`。
 */
export function chiptuneUrl(): string | null {
  try {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
    return URL.createObjectURL(toWavBlob(renderLoop(compose())));
  } catch (error) {
    console.warn('[mp4] 兜底音源合成失败：', error);
    return null;
  }
}
