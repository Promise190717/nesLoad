/** Shared media policy for /play. Bitrates are ceilings, not targets. */
export type StreamQuality = 'smooth' | 'balanced' | 'sharp';

export const DEFAULT_STREAM_QUALITY: StreamQuality = 'balanced';

/**
 * 出画档位表。
 *
 * `maxHeight` 是**编码侧**的缩放上限，不是采集分辨率。
 *
 * ⚠️ 2026-11-12 实测：这两档以前写 720，是建立在一个错误前提上的 ——「画布大概就是
 * 720 高」。实际画布尺寸跟着布局走，1600 宽的窗口下是 956×717，1920 宽是 1172×879。
 * 一旦画布高过 720，编码端就会先缩小再让加入者放大，那一步是纯粹的清晰度损失，
 * 而加入者的屏幕并不会因此变好看。像素画尤其吃亏：非整数倍缩小再放大，格子宽度
 * 会变得忽宽忽窄。
 *
 * 所以 `balanced` / `sharp` 现在**不缩**，编码尺寸 = 画布后备尺寸 = 加入者看到的尺寸。
 * 真正要防的是「超宽屏把画布撑到 4K」这种极端情况，那由 `maxPixels` 兜（按总像素
 * 数等比缩，不是按高），`smooth` 仍保留 540 的高度上限 —— 它存在的意义就是慢网。
 *
 * `bitsPerPixel` 是**每像素每帧**给的 bit 数，真正的码率在 `tuneVideoSender` 里按
 * 编码后的像素数乘出来。以前三档共用 0.11，快速横卷时背景会糊成一片，用户反馈过
 * 「均衡太糊」，所以按档位分开给。
 *
 * `maxBitrate` 是**天花板**，挡住「超大画布 × 高 bpp」算出天文数字。实际发送量由
 * Chrome 的带宽估计决定，写高一点不会真的把上行打满，但写低了会变成硬顶 ——
 * 2026-11-12 之前 `balanced` 就卡在 4.67 Mbps，而它同时还在编码 1172×879 的画面。
 */
const QUALITY_SPEC = {
  smooth: { captureFps: 30, maxHeight: 540, maxPixels: 0, maxBitrate: 1_200_000, bitsPerPixel: 0.12 },
  balanced: { captureFps: 60, maxHeight: 0, maxPixels: 2_100_000, maxBitrate: 12_000_000, bitsPerPixel: 0.2 },
  sharp: { captureFps: 60, maxHeight: 0, maxPixels: 3_200_000, maxBitrate: 20_000_000, bitsPerPixel: 0.26 },
};

const MIN_BITRATE = 1_000_000;

/** 音频的目标码率。游戏音效（方波、短促的打击声）在 32 kbps 单声道上听不出区别。 */
const AUDIO_MAX_BITRATE = 32_000;

export function captureFpsFor(quality: StreamQuality): number {
  return QUALITY_SPEC[quality].captureFps;
}

export function configureStreamContent(stream: MediaStream, quality: StreamQuality): void {
  for (const track of stream.getVideoTracks()) {
    /*
     * 三档分别告诉编码器「这是什么内容」，它据此决定把算力和码率花在哪里：
     *
     *   · `motion` —— 保动作连贯。`smooth` 本来就是给慢网用的，先保帧。
     *   · `detail` —— 保静态细节，默认档。对游戏画面是安全值。
     *   · `text` —— Chrome 会把编码器切到硬边优先的调优（屏幕内容取向），
     *     在像素画上就是「格子边缘不糊」。只在 `sharp` 用：那档不缩放、码率也够，
     *     换成 `text` 不会因为码率不足而出振铃；`balanced` 缩过分辨率，用 `text`
     *     反而可能把缩放留下的软边放大成噪点。
     */
    const hint: MediaStreamTrack['contentHint'] =
      quality === 'smooth' ? 'motion' : quality === 'sharp' ? 'text' : 'detail';
    try { track.contentHint = hint; }
    catch { /* Older engines may not expose a writable contentHint. */ }
  }
}

/**
 * 把编码格式排成 H.264 → VP8 → 其余。
 *
 * 理由是这条链路的两端都不是「摄像头」：
 *
 *   · **编码**在房主机器上，而房主同时还在跑 wasm 模拟器。VP8 是纯软编，和核心抢
 *     同几个核；H.264 在 Windows / macOS 上基本都走硬件编码器。720×540@60 这种
 *     小画面上，软编那几毫秒本身不致命，**抢 CPU 导致核心掉帧才是**（房主掉一帧，
 *     两个人一起卡）。
 *   · **解码**在加入者那台机器上，手机居多。同样的码率，H.264 硬解的功耗和延迟都
 *     比 VP8 软解低一个档。
 *   · AV1 / VP9 的编码延迟明显更高，而且 1 对 1 没有码率压力，排到最后。
 *
 * `setCodecPreferences` 必须在**第一次协商之前**落到 transceiver 上：我们是在
 * `addStream` 刚把 sender 建出来、`negotiationneeded` 还没被处理的那个微任务里调的
 * （见 `NetplayController.tuneStream`），所以赶得上。已经是 stable 之后再调，要等
 * 下一次重协商才生效 —— 因此每个 transceiver 只钉一次，钉不上就算了。
 */
const codecPinned = new WeakSet<RTCRtpTransceiver>();

export function preferLowLatencyCodecs(
  connection: RTCPeerConnection,
  track: MediaStreamTrack
): void {
  if (typeof RTCRtpSender.getCapabilities !== 'function') return;

  let codecs: RTCRtpCodec[];
  try {
    codecs = RTCRtpSender.getCapabilities('video')?.codecs ?? [];
  } catch {
    return;
  }
  if (codecs.length === 0) return;

  const h264 = codecs.filter((codec) => /^video\/H264$/i.test(codec.mimeType));
  const vp8 = codecs.filter((codec) => /^video\/VP8$/i.test(codec.mimeType));
  // 一个都没有（极少数 Linux 构建）就别动，保持浏览器默认
  if (h264.length === 0 && vp8.length === 0) return;

  // 其余（VP9 / AV1 / RTX / red / ulpfec）原样留在后面：漏掉 RTX 会丢掉重传能力
  const ordered = [
    ...h264,
    ...vp8,
    ...codecs.filter((codec) => !h264.includes(codec) && !vp8.includes(codec)),
  ];

  for (const transceiver of connection.getTransceivers()) {
    // 只认自己的那条视频 sender —— 音频 transceiver 和以后可能加的别的轨不要碰
    if (transceiver.sender.track !== track) continue;
    if (codecPinned.has(transceiver)) continue;
    codecPinned.add(transceiver);
    try {
      transceiver.setCodecPreferences(ordered);
    } catch (error) {
      console.warn('[netplay] Could not reorder video codecs:', error);
    }
  }
}

export async function tuneVideoSender(
  sender: RTCRtpSender,
  stream: MediaStream,
  quality: StreamQuality
): Promise<void> {
  const track = sender.track;
  if (!track || track.kind !== 'video' || !stream.getVideoTracks().includes(track)) return;
  try {
    const spec = QUALITY_SPEC[quality];
    const { width = 0, height = 0 } = track.getSettings();
    const params = sender.getParameters();
    // Encodings are created by negotiation; inventing one can reject setParameters.
    if (!params.encodings?.length) return;

    /*
     * 缩放倍数按**采集到的高度**算，而不是写死 720：画布尺寸跟着布局走，同一份配置
     * 在不同窗口宽度下不是同一个意思。用真实尺寸除，才能真正兑现「不超高」这件事。
     *
     * ⚠️ 这里的 width/height 来自**调用此刻**的 `getSettings()`。画布在核心启动、
     * 布局稳定之前只有 JSX 上那个初始尺寸，之后 RetroArch 才会把它改成实际大小 ——
     * 所以调用方必须在尺寸变化后重新压一次（见 `NetplayController` 的尺寸观察）。
     */
    const targetHeight =
      spec.maxHeight > 0 && height > 0 ? Math.min(height, spec.maxHeight) : height;
    const byHeight = height > 0 && targetHeight > 0 ? Math.max(1, height / targetHeight) : 1;
    // 总像素兜底：超宽屏不该按「高」一刀切，等比缩到预算之内即可
    const byPixels =
      spec.maxPixels > 0 && width * height > spec.maxPixels
        ? Math.sqrt((width * height) / spec.maxPixels)
        : 1;
    const scale = Math.max(byHeight, byPixels);

    // 码率跟着**编码后**的像素数走：缩过的画面不该继续占着缩之前那份额度
    const encodedPixels = width > 0 && height > 0 ? (width / scale) * (height / scale) : 0;
    const byPixelBudget = encodedPixels * spec.captureFps * spec.bitsPerPixel;
    const maxBitrate = Math.min(
      spec.maxBitrate,
      Math.max(MIN_BITRATE, Math.round(byPixelBudget > 0 ? byPixelBudget : spec.maxBitrate))
    );

    for (const encoding of params.encodings) {
      encoding.scaleResolutionDownBy = scale;
      encoding.maxBitrate = maxBitrate;
      encoding.maxFramerate = spec.captureFps;
      /*
       * 这两项不是所有实现都认。先看 getParameters 回来的编码里有没有这个键 ——
       * 没有就不写，否则 setParameters 会整包被拒，连码率都一起丢掉。
       */
      const tagged = encoding as RTCRtpEncodingParameters & {
        priority?: RTCPriorityType;
        networkPriority?: RTCPriorityType;
      };
      if ('priority' in tagged) tagged.priority = 'high';
      if ('networkPriority' in tagged) tagged.networkPriority = 'high';
    }

    /*
     * 降级策略**分档**。2026-11-12 实测推翻了「三档统一保帧率」那条判断。
     *
     * 当时理由是「像素画降一档分辨率几乎看不出来，帧率掉一档立刻能感觉到」。实测下来
     * 前半句是错的，而且错得很彻底：`maintain-framerate` 下 Chrome 的 quality scaler
     * 会一直缩分辨率去追它的 QP 目标，**缩到画面只剩 279×207 也不停手**（源是
     * 744×557、60 fps 一帧没掉、BWE 还有 5.4 Mbps）。加入者那边再把 279 拉到 743
     * 显示，就是 2.7 倍插值放大 —— 用户看到的「糊」全是这一步造成的。
     * 同一时刻把策略换成 `maintain-resolution`：立刻回到 744×557 @ 57 fps、
     * `qualityLimitationReason: none`；换成 `balanced`：744×557 @ 61 fps。
     * 把 `maxBitrate` 抬到 25 Mbps 毫无作用，因为瓶颈根本不是码率上限。
     *
     * 所以：
     *   · `sharp`  = maintain-resolution —— 这档卖的就是「一格一格都清楚」，宁可掉帧。
     *   · `balanced` = balanced —— Chrome 自己权衡，实测带宽够时它保分辨率、也保帧率。
     *   · `smooth`  = maintain-framerate —— 这档存在的意义就是慢网还能动，掉分辨率可接受。
     */
    params.degradationPreference =
      quality === 'sharp' ? 'maintain-resolution' : quality === 'smooth' ? 'maintain-framerate' : 'balanced';
    await sender.setParameters(params);
  } catch (error) {
    console.warn('[netplay] Could not apply video encoding preferences:', error);
  }
}

/**
 * 压住音频那一路的码率。
 *
 * 目的不是省流量，是**别和视频抢**：音频和视频走同一条候选对、同一个拥塞窗口，
 * 音频默认会按带宽自己往上爬（Opus 能到 64~128 kbps，立体声更甚）。它多占的
 * 那几十 kbps 正是视频发送队列里排队的时间。32 kbps 单声道对游戏音效完全够用 ——
 * 这类声音是方波和短促的打击声，不是音乐。
 *
 * `dtx` 明确关掉：不连续传输会在静音时停发，重新出声要等一个包周期，
 * 那点「先安静再冒出来」的延迟在游戏里比省下的带宽更明显。
 */
export async function tuneAudioSender(sender: RTCRtpSender): Promise<void> {
  if (sender.track?.kind !== 'audio') return;
  try {
    const params = sender.getParameters();
    if (!params.encodings?.length) return;
    for (const encoding of params.encodings) {
      encoding.maxBitrate = AUDIO_MAX_BITRATE;
      const tagged = encoding as RTCRtpEncodingParameters & {
        priority?: RTCPriorityType;
        dtx?: boolean;
      };
      if ('priority' in tagged) tagged.priority = 'high';
      if ('dtx' in tagged) tagged.dtx = false;
    }
    await sender.setParameters(params);
  } catch (error) {
    console.warn('[netplay] Could not apply audio encoding preferences:', error);
  }
}

/**
 * Opus 的 fmtp 里补三项，压掉音频路径的带宽和抖动。
 *
 * Chrome 默认给的已经是 `minptime=10;useinbandfec=1`（10ms 打包 + 带内 FEC），
 * 所以这里不重复写那两项，只补它不写的：
 *
 *   · `stereo=0` —— canvas 那边旁路出来的音轨本来就是单声道，双声道白占一倍带宽；
 *   · `usedtx=0` —— 见 `tuneAudioSender`，静音时停发会在重新出声时补一个包周期；
 *   · `maxaveragebitrate=32000` —— 和 sender 侧的 `maxBitrate` 双保险，
 *     SDP 这一层也要写，否则某些实现对 sender 参数的裁剪会让它回弹。
 */
const LOW_LATENCY_OPUS: Record<string, string> = {
  stereo: '0',
  usedtx: '0',
  maxaveragebitrate: String(AUDIO_MAX_BITRATE),
};

function mungeOpus(sdp: string): string {
  const payload = /a=rtpmap:(\d+)\s+opus\/48000\/2/i.exec(sdp)?.[1];
  if (!payload) return sdp;

  const fmtpLine = new RegExp(`a=fmtp:${payload} ([^\\r\\n]*)`);
  const found = fmtpLine.exec(sdp);
  // Chrome 一定会写这一行；别的实现没写就不硬加，免得拼出非法 SDP
  if (!found) return sdp;

  const params = new Map<string, string>();
  for (const pair of found[1].split(';')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    params.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  for (const [key, value] of Object.entries(LOW_LATENCY_OPUS)) params.set(key, value);

  const merged = [...params].map(([key, value]) => `${key}=${value}`).join(';');
  return sdp.replace(fmtpLine, `a=fmtp:${payload} ${merged}`);
}

const audioMunged = new WeakSet<RTCPeerConnection>();

/**
 * 把上面那三项写进 SDP。
 *
 * Trystero 不暴露 SDP，唯一能改的地方是 `setLocalDescription` 的入口 —— 在这里
 * 包一层，把浏览器生成（或被调用方直接传入）的描述改写一遍再交出去。
 *
 * 两个必须守住的东西：
 *
 *   1. **失败要能原样落地**。改写后的 SDP 一旦被拒，最初那份已经生效了，协商照走；
 *      绝不能让「压低音频码率」这种优化把整场联机弄断。
 *   2. **两条路径都要覆盖**。Trystero 既会 `setLocalDescription(void 0)`（让浏览器
 *      自己生成），也会传入 `createOffer()` 的结果，两条都得改到。
 */
export function preferLowLatencyAudio(connection: RTCPeerConnection): void {
  if (audioMunged.has(connection)) return;
  audioMunged.add(connection);

  const original = connection.setLocalDescription.bind(connection);

  connection.setLocalDescription = async function patched(
    description?: RTCLocalSessionDescriptionInit
  ): Promise<void> {
    if (
      description?.sdp &&
      (description.type === 'offer' || description.type === 'answer')
    ) {
      try {
        return await original({ ...description, sdp: mungeOpus(description.sdp) });
      } catch {
        return original(description);
      }
    }

    await original(description);
    const current = connection.localDescription;
    if (!current?.sdp || current.type === 'rollback') return;
    const munged = mungeOpus(current.sdp);
    if (munged === current.sdp) return;
    try {
      await original({ type: current.type, sdp: munged });
    } catch {
      /* 改写版被拒：最初那份已经生效，协商照常走 */
    }
  };
}

export function tuneMediaReceiver(receiver: RTCRtpReceiver): void {
  /*
   * 这是**偏好**，不是强制：浏览器仍然握着拥塞控制和丢包恢复。设 0 的意思是
   * 「不要额外攒缓冲」，让 NetEq 用它能给出的最小延迟。
   *
   * 音频也设 0 —— 它和视频共用同一个 A/V 时钟，音频被攒住的每一毫秒都会变成
   * 视频对齐时往后拖的每一毫秒。这条链路上没有别的东西需要靠缓冲去抹平抖动：
   * 画面是 60fps 连续的，抹平一帧抖动没有意义，掉一帧就是掉一帧。
   */
  try {
    if ('jitterBufferTarget' in receiver) {
      (receiver as RTCRtpReceiver & { jitterBufferTarget: number | null }).jitterBufferTarget = 0;
    } else if ('playoutDelayHint' in receiver) {
      (receiver as RTCRtpReceiver & { playoutDelayHint: number }).playoutDelayHint = 0;
    }
  } catch { /* Unsupported preferences must never prevent playback. */ }
}
