/**
 * 联机链路体检（只在开发态跑）。
 *
 * 调完码率 / 编码格式 / 抖动缓冲之后，需要一个地方能看出「这次到底动了哪个数」。
 * `room.ping` 给的是应用层 RTT，分不清是网络慢、编码排队、还是接收端攒住了 ——
 * 这三件事在 getStats 里是三个不同的字段：`qualityLimitationReason` 说编码器被什么卡住，
 * `jitterBufferDelay / jitterBufferEmittedCount` 说接收端攒了多少毫秒，
 * `candidate-pair.currentRoundTripTime` 才是网络本身。
 *
 * 只在 `NODE_ENV !== 'production'` 下挂定时器，生产构建里第一行就返回。
 * 不写界面、不加查询参数 —— 浏览器控制台里一张表，刷新就没了。
 */

type Row = Record<string, string | number>;

function ms(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 1000) : -1;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : -1;
}

function kbps(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value / 1000) : -1;
}

export function startNetplayTelemetry(
  role: 'host' | 'guest',
  peers: () => RTCPeerConnection[]
): () => void {
  if (process.env.NODE_ENV === 'production') return () => undefined;

  let stopped = false;
  let ticking = false;

  const tick = async () => {
    if (stopped || ticking) return;
    ticking = true;
    const rows: Row[] = [];
    try {
      for (const connection of peers()) {
        const stats = await connection.getStats().catch(() => null);
        if (!stats) continue;

        const byId = new Map<string, Record<string, unknown>>();
        for (const report of stats.values()) {
          byId.set(report.id, report as unknown as Record<string, unknown>);
        }

        for (const report of stats.values()) {
          const item = report as unknown as Record<string, unknown>;
          const type = String(item.type);

          if (type === 'outbound-rtp' && item.kind === 'video') {
            const codec = byId.get(String(item.codecId ?? ''));
            rows.push({
              role,
              dir: 'send',
              codec: String(codec?.mimeType ?? '?').replace('video/', ''),
              fps: num(item.framesPerSecond),
              kbps: kbps(item.targetBitrate),
              // 编码器被什么卡着：none / cpu / bandwidth / other
              limit: String(item.qualityLimitationReason ?? '-'),
            });
            continue;
          }

          if (type === 'remote-inbound-rtp' && item.kind === 'video') {
            rows.push({
              role,
              dir: 'send-rtt',
              codec: '-',
              fps: -1,
              kbps: -1,
              limit: `rtt ${ms(item.roundTripTime)}ms · lost ${num(item.packetsLost)}`,
            });
            continue;
          }

          if (type === 'inbound-rtp' && item.kind === 'video') {
            const emitted = num(item.jitterBufferEmittedCount);
            const delay = typeof item.jitterBufferDelay === 'number' ? item.jitterBufferDelay : 0;
            rows.push({
              role,
              dir: 'recv',
              codec: '-',
              fps: num(item.framesPerSecond),
              // 平均抖动缓冲毫秒 = 累计延迟 / 已播出帧数。这一项直接叠在端到端延迟上
              kbps: emitted > 0 ? Math.round((delay / emitted) * 1000) : -1,
              limit: `freeze ${num(item.freezeCount)} · lost ${num(item.packetsLost)}`,
            });
            continue;
          }

          if (type === 'candidate-pair' && item.state === 'succeeded' && item.nominated) {
            rows.push({
              role,
              dir: 'path',
              codec: `${String(item.localCandidateType ?? '?')}->${String(item.remoteCandidateType ?? '?')}`,
              fps: -1,
              kbps: kbps(item.availableOutgoingBitrate),
              limit: `rtt ${ms(item.currentRoundTripTime)}ms`,
            });
          }
        }
      }
    } finally {
      ticking = false;
    }
    if (!stopped && rows.length > 0) console.table(rows);
  };

  const timer = setInterval(() => void tick(), 2000);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
