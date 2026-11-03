/*
 * 部署后给 **Workers Caching** 铺路（2026-11-03）。
 *
 * ## 为什么需要它
 *
 * `wrangler.jsonc` 里开了 `"cache": { "enabled": true }`（Workers Caching），
 * 命中时 Worker 连 isolate 都不启动 —— 这是免费版 10ms CPU 下唯一能真正压住 1102 的
 * 一层（理由见 `worker.ts` 文件头「两层缓存」那段）。
 *
 * 但它默认**不跨版本**（`cross_version_cache` 没开）：每次 `cf:deploy` 都是一个新的
 * 缓存命名空间，全站从零开始。而免费版下一次「冷渲染」大概率超时就拿不到响应、
 * 也就存不进缓存 —— 于是发版后那几十分钟里，每个被访问的地址都在撞 1102。
 *
 * 这个脚本就是发版后手动补一刀：把「肯定会被访问」的那批地址按正常 GET 走一遍，
 * 成功的那些当场进缓存（而且两层缓存的上层是全网的，一个地方填上，全球都能命中）。
 *
 * ## 为什么是「跑几遍」而不是「一次跑完」
 *
 * 预热请求和真实用户走同一条路：第一次多半也超时。所以每个地址都会重试
 * `--retries` 次 —— 第一次的失败往往已经把 isolate 焐热了，第二次成功的概率高得多。
 * 仍然失败的那批不用管：它们就是长尾，等真实的重复访问慢慢暖。
 *
 * ## 用法（仓库根目录）
 *
 *   node scripts/warm-edge.mjs --dry-run          # 只列地址，不发请求
 *   node scripts/warm-edge.mjs                    # 默认 en/zh/ja/ko 各 120 款
 *   node scripts/warm-edge.mjs --locales=en,zh --limit=300
 *   node scripts/warm-edge.mjs --no-download      # 不预热下载页（下载页量大）
 *
 *   --base=          站点地址，默认 https://www.retrogamesbox.com
 *   --limit=         每个语言取前多少款游戏，默认 120
 *   --concurrency=   并发数，默认 6（别再往上加，这是在打自己的站）
 *   --retries=       每个地址最多重试几次，默认 2
 *   --locales=       逗号分隔，默认 en,zh,ja,ko
 *
 * ⚠️ **只发普通 GET，不带 `RSC` 头** —— 整页 HTML 才会进 Workers Caching 的
 *    可缓存范围，flight 是 `no-store`（见 worker.ts）。
 * ⚠️ 免费版每天 10 万请求：默认参数约 1000 次，占比 1%，可以放心跑。
 * ⚠️ 游戏清单从 `/sitemap/en.xml` 现取，不查库、不读环境变量 —— 所以不需要 `.env.local`。
 */

const argOf = (name) => {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).trim() : '';
};

const BASE = (argOf('base') || 'https://www.retrogamesbox.com').replace(/\/+$/, '');
const LIMIT = Math.max(1, Number(argOf('limit') || 120));
const CONCURRENCY = Math.max(1, Math.min(16, Number(argOf('concurrency') || 6)));
const RETRIES = Math.max(0, Number(argOf('retries') || 2));
const LOCALES = (argOf('locales') || 'en,zh,ja,ko')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const WITH_DOWNLOAD = !process.argv.includes('--no-download');
const DRY_RUN = process.argv.includes('--dry-run');

/** 每种语言都要走的固定页（`/`、列表、若干入口页）。 */
const STATIC_PATHS = ['/', '/games', '/play', '/consoles', '/developers', '/about', '/contact'];

/** 预热请求的 UA：日志里一眼能认出这是脚本打的，不是真人也不是爬虫。 */
const USER_AGENT = 'RetroGameBox-Warmup/1.0 (+https://www.retrogamesbox.com)';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 站内地址规则：英文不占前缀，其余语言是 `/<locale>`（和 `lib/i18n.ts` 的 `localePath` 一致）。
 *
 * ⚠️ 根路径**不要拼出尾斜杠**：`/zh/` 会被 Next 308 到 `/zh`，预热就打在一个跳转上了。
 */
function joinPath(locale, path) {
  const prefix = locale === 'en' ? '' : `/${locale}`;
  if (path === '/') return `${BASE}${prefix}`;
  return `${BASE}${prefix}${path}`;
}

/** 从英文站的 sitemap 里按顺序取游戏 id（sitemap 里就是详情页地址）。 */
async function listGameIds(limit) {
  const res = await fetch(`${BASE}/sitemap/en.xml`, {
    headers: { 'user-agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`取 sitemap 失败：HTTP ${res.status}`);
  const xml = await res.text();

  const ids = [];
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const hit = match[1].match(/\/games\/([^/?#]+)$/);
    // 下载页也在 sitemap 之外，但万一将来加回来，这里顺手挡掉
    if (hit && hit[1] !== 'download') ids.push(hit[1]);
    if (ids.length >= limit) break;
  }
  return ids;
}

/** 单个地址：失败重试，`5xx` 也算失败（1102 就是 5xx）。 */
async function warmOne(url, attempt = 0) {
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'user-agent': USER_AGENT },
    });
    if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
    // 必须把 body 读完，否则连接不释放、缓存的写入也可能没落盘
    await res.arrayBuffer();
    return { ok: true, status: res.status };
  } catch (error) {
    if (attempt < RETRIES) {
      await sleep(300 * (attempt + 1));
      return warmOne(url, attempt + 1);
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** 固定并发池：不发完不结束，但最多同时 `CONCURRENCY` 个。 */
async function runPool(items, handler, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await handler(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  console.log(`[warm-edge] 站点 ${BASE}`);
  console.log(`[warm-edge] 语言 ${LOCALES.join(', ')} · 每语言 ${LIMIT} 款 · 下载页${WITH_DOWNLOAD ? '预热' : '跳过'}`);

  const ids = await listGameIds(LIMIT);
  if (ids.length === 0) throw new Error('sitemap 里一款游戏都没取到，先确认站点正常');
  console.log(`[warm-edge] 取到 ${ids.length} 款游戏`);

  const urls = [];
  for (const locale of LOCALES) {
    for (const path of STATIC_PATHS) urls.push(joinPath(locale, path));
    for (const id of ids) {
      urls.push(joinPath(locale, `/games/${id}`));
      if (WITH_DOWNLOAD) urls.push(joinPath(locale, `/games/${id}/download`));
    }
  }

  console.log(`[warm-edge] 共 ${urls.length} 个地址 · 并发 ${CONCURRENCY} · 每个最多重试 ${RETRIES} 次`);

  if (DRY_RUN) {
    for (const url of urls.slice(0, 30)) console.log(`  ${url}`);
    if (urls.length > 30) console.log(`  …其余 ${urls.length - 30} 个略`);
    return;
  }

  const startedAt = Date.now();
  let done = 0;
  const results = await runPool(
    urls,
    async (url) => {
      const result = await warmOne(url);
      done += 1;
      // 每 50 个打一行进度，别刷屏
      if (done % 50 === 0) console.log(`[warm-edge] ${done}/${urls.length}`);
      return { url, ...result };
    },
    CONCURRENCY
  );

  const ok = results.filter((item) => item.ok);
  const failed = results.filter((item) => !item.ok);
  const byStatus = new Map();
  for (const item of ok) byStatus.set(item.status, (byStatus.get(item.status) ?? 0) + 1);

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n[warm-edge] 完成，用时 ${seconds}s`);
  console.log(`  成功 ${ok.length} / ${results.length}`);
  for (const [status, count] of [...byStatus].sort((a, b) => a[0] - b[0])) {
    console.log(`    HTTP ${status}: ${count}`);
  }

  if (failed.length > 0) {
    console.log(`  失败 ${failed.length} 个（多半是 1102 / 522，重跑一遍通常会好一部分）:`);
    for (const item of failed.slice(0, 10)) console.log(`    ${item.url}  ${item.error}`);
    if (failed.length > 10) console.log(`    …其余 ${failed.length - 10} 个略`);
  }

  /*
   * 失败不返回非 0：这个脚本是运维辅助，跑一半失败不代表部署坏了。
   * 但明显异常（例如全站 0 成功）要让人一眼看出来。
   */
  if (ok.length === 0) {
    console.error('[warm-edge] 一个都没成功，先确认站点是否正常，别继续跑');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[warm-edge] 失败', error);
  process.exitCode = 1;
});
