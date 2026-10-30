/*
 * 一次性排查脚本：按 lib/http.ts 的 fetchRomWithProgress 同参数（2MiB 格、4 格一批、
 * 3 路并发、重试/降档/切半）对线上 ROM 端点跑一遍完整下载，记录每片成败与总耗时，
 * 末尾按 lib/chd.ts 的判据做结构自检。用完即删。
 */
const url = process.argv[2];
const GRID = 2 * 1024 * 1024;
const MAX_RUN = 4;
const CONC = 3;
const RETRIES = 3;
const RETRY_FULL_BELOW = 4 * 1024 * 1024;
const SPLIT_MIN = 512 * 1024;
const SPLIT_DEPTH = 4;

function parseCR(v) {
  const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(v ?? '');
  if (!m) return null;
  return { start: +m[1], end: +m[2], total: +m[3] };
}

const t0 = Date.now();
const log = (...a) =>
  console.log(new Date().toISOString().slice(11, 19), `+${((Date.now() - t0) / 1000) | 0}s`, ...a);

async function main() {
  const first = await fetch(url, { headers: { Range: `bytes=0-${MAX_RUN * GRID - 1}` } });
  log('probe:', first.status, first.headers.get('content-range'), 'etag', first.headers.get('etag'));
  const probe = parseCR(first.headers.get('content-range'));
  if (first.status !== 206 || !probe) {
    log('走了整包分支（status!=206 或没有 content-range）——退出');
    process.exit(0);
  }
  const total = probe.total;
  const firstBuf = Buffer.from(await first.arrayBuffer());
  log('probe bytes:', firstBuf.length);

  const gridCount = Math.ceil(total / GRID);
  const parts = new Array(gridCount);
  let loaded = 0;
  let failures = 0;
  const gridStart = (g) => g * GRID;
  const gridEnd = (g) => Math.min((g + 1) * GRID, total) - 1;

  async function fetchSpan(start, end, depth = 0) {
    const expected = end - start + 1;
    const retries = expected > RETRY_FULL_BELOW ? 1 : RETRIES;
    let failure = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
        if (!res.ok) {
          const body = (await res.text()).slice(0, 120).replace(/\s+/g, ' ');
          log(`FAIL HTTP ${res.status} span ${start}-${end} 尝试${attempt}: ${body}`);
          failures++;
          throw new Error(`HTTP ${res.status}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length !== expected) {
          log(`SHORT span ${start}-${end} 要${expected} 得${buf.length} 尝试${attempt}`);
          failures++;
          throw new Error('short read');
        }
        return buf;
      } catch (e) {
        failure = e;
        if (attempt < retries) await new Promise((r) => setTimeout(r, Math.min(750 * 2 ** attempt, 5000)));
      }
    }
    if (expected > SPLIT_MIN && depth < SPLIT_DEPTH) {
      const mid = start + Math.floor(expected / 2);
      const l = await fetchSpan(start, mid - 1, depth + 1);
      const r = await fetchSpan(mid, end, depth + 1);
      return Buffer.concat([l, r]);
    }
    throw failure;
  }

  let cursor = 0;
  let run = MAX_RUN;
  let splitStreak = 0;
  let cleanStreak = 0;
  function adapt(split) {
    if (split) {
      cleanStreak = 0; splitStreak++;
      if (splitStreak >= 1 && run > 1) { run = Math.max(1, run >> 1); splitStreak = 0; log('降档 run ->', run); }
    } else {
      splitStreak = 0; cleanStreak++;
      if (cleanStreak >= 8 && run < MAX_RUN) { run = Math.min(MAX_RUN, run * 2); cleanStreak = 0; log('升档 run ->', run); }
    }
  }

  async function takeRun(g0, count) {
    const start = gridStart(g0);
    const end = gridEnd(g0 + count - 1);
    let buf = await fetchSpan(start, end);
    if (buf.length !== end - start + 1) throw new Error(`merged ${buf.length} != ${end - start + 1}`);
    for (let k = 0; k < count; k++) {
      const g = g0 + k;
      const size = gridEnd(g) - gridStart(g) + 1;
      parts[g] = buf.subarray(0, size);
      buf = buf.subarray(size);
    }
    loaded += end - start + 1;
    const pct = ((loaded / total) * 100).toFixed(1);
    if (Number(pct) % 5 < 0.1) log(`进度 ${pct}%`);
  }

  async function worker() {
    for (;;) {
      const g0 = cursor;
      if (g0 >= gridCount) return;
      const count = Math.min(run, gridCount - g0);
      cursor = g0 + count;
      try {
        await takeRun(g0, count);
      } catch (e) {
        log(`批失败一次（${e.message}），3 秒后重试整批`);
        await new Promise((r) => setTimeout(r, 3000));
        await takeRun(g0, count);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONC, gridCount) }, () => worker()));
  const full = Buffer.concat(parts);
  log('下载完成:', full.length, '/', total, `耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s，片内失败次数 ${failures}`);

  const mo = Number(full.readBigUInt64BE(40));
  const mapBytes = full.readUInt32BE(mo);
  const endMap = mo + 16 + mapBytes;
  log(`CHD 自检: mapOffset=${mo} mapBytes=${mapBytes} 末尾=${endMap} 文件=${full.length}`, endMap > full.length ? 'TRUNCATED' : 'OK');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
