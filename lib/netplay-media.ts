/** Shared media policy for /play and /room. Bitrates are ceilings, not targets. */
export type StreamQuality = 'smooth' | 'balanced' | 'sharp';

export const DEFAULT_STREAM_QUALITY: StreamQuality = 'balanced';

const QUALITY_SPEC = {
  smooth: { captureFps: 30, maxHeight: 540, maxBitrate: 1_200_000 },
  balanced: { captureFps: 60, maxHeight: 720, maxBitrate: 6_000_000 },
  sharp: { captureFps: 60, maxHeight: 0, maxBitrate: 16_000_000 },
};

export function captureFpsFor(quality: StreamQuality): number {
  return QUALITY_SPEC[quality].captureFps;
}

export function configureStreamContent(stream: MediaStream, quality: StreamQuality): void {
  for (const track of stream.getVideoTracks()) {
    // Pixel edges and text matter more than camera-like motion at the sharp tier.
    try { track.contentHint = quality === 'smooth' ? 'motion' : 'detail'; }
    catch { /* Older engines may not expose a writable contentHint. */ }
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
    const { height = 0 } = track.getSettings();
    const params = sender.getParameters();
    // Encodings are created by negotiation; inventing one can reject setParameters.
    if (!params.encodings?.length) return;
    for (const encoding of params.encodings) {
      encoding.scaleResolutionDownBy = spec.maxHeight > 0 ? Math.max(1, height / spec.maxHeight) : 1;
      encoding.maxBitrate = spec.maxBitrate;
      encoding.maxFramerate = spec.captureFps;
    }
    // Dropping encoded frames does not slow the emulator's own frame clock.
    params.degradationPreference = quality === 'sharp' ? 'maintain-resolution' : 'maintain-framerate';
    await sender.setParameters(params);
  } catch (error) {
    console.warn('[netplay] Could not apply video encoding preferences:', error);
  }
}

export function tuneMediaReceiver(receiver: RTCRtpReceiver): void {
  // This is a preference: the browser retains congestion/loss recovery control.
  // Apply to audio too, otherwise A/V synchronization can hold video back.
  try {
    if ('jitterBufferTarget' in receiver) {
      (receiver as RTCRtpReceiver & { jitterBufferTarget: number | null }).jitterBufferTarget = 0;
    } else if ('playoutDelayHint' in receiver) {
      (receiver as RTCRtpReceiver & { playoutDelayHint: number }).playoutDelayHint = 0;
    }
  } catch { /* Unsupported preferences must never prevent playback. */ }
}
