/*
 * 发版后清 Cloudflare 边缘缓存（Purge Everything）。
 *
 * ## 为什么需要它
 *
 * 整页 HTML 的响应头是 `Cache-Control: public, max-age=0, s-maxage=86400`
 * （见 `worker.ts` 的 `withCdnHeaders`）。那个 24 小时**不能缩短** —— 免费版
 * 10ms CPU 装不下一次 SSR，边缘命中是把 1102 压下去的唯一手段。
 *
 * 代价是**发版后旧 HTML 还会在边缘活最多 24 小时**，而它引用的
 * `/_next/static/chunks/*.js` 已经随新部署被替换掉了 ⇒ 客户端 `import()` 404
 * ⇒ `ChunkLoadError`，页面白屏或「This page couldn't load」。
 * 2026-11-04 用户撞到的就是这个；`components/ChunkReloadGuard.tsx` 是客户端兜底，
 * **这个脚本才是把根去掉**：发版完立刻让旧 HTML 从边缘消失。
 *
 * `scripts/next-cache-purge.mjs` 清的是 R2 里旧 buildId 的**增量缓存目录**，
 * 跟 CF 边缘缓存是两回事 —— 两个都要跑。
 *
 * ## 为什么用 purge_everything 而不是列 URL
 *
 * 需要清的是整页 HTML，而它的 URL 基数上万（18 语言 × 首页 / 列表 / 机种 / 详情），
 * `files` 列表根本列不完；`prefixes` 要 Enterprise。全清最省事。
 * 代价是 `/cores/*`、`/sprites/*` 这些大文件也要回源一次 —— 它们是 Workers Assets，
 * 同区域读取很快，而且浏览器端各自还有一天缓存，用户基本无感。
 *
 * ## 用法
 *
 *   node --env-file-if-exists=.env.local scripts/cf-purge.mjs          # 只检查配置
 *   node --env-file-if-exists=.env.local scripts/cf-purge.mjs --yes    # 真的清
 *
 * 环境变量（二选一，缺了就警告跳过 —— 它是 `cf:deploy` 的尾巴，不该让部署显示失败）：
 *
 *   · `CF_PURGE_API_TOKEN`（或 `CLOUDFLARE_API_TOKEN`）
 *     控制台 → My Profile → API Tokens → Create Token →
 *     模板选 **Purge Cache**（权限 `Zone → Cache Purge → Purge`，
 *     再加 `Zone → Zone → Read` 让它能自己查 zone id）。
 *   · `CF_ZONE_ID`（可选）：填了就不查 API；不填则用 `SITE_URL` 的域名反查。
 *
 * ⚠️ 别复用 `CF_D1_API_TOKEN`：那个是 D1 用的，权限不同，拿去 purge 会 403。
 */

const CONFIRM = process.argv.includes('--yes');

const TOKEN =
  process.env.CF_PURGE_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN || '';
/** 可选：不填就走下面的域名反查 */
const ZONE_ID = process.env.CF_ZONE_ID || process.env.CLOUDFLARE_ZONE_ID || '';

const API = 'https://api.cloudflare.com/client/v4';

/** 从 `SITE_URL` 取根域名（去掉 www.）。CF 的 zone 名不带 www。 */
function rootDomain() {
  const raw = process.env.SITE_URL || 'https://www.retrogamesbox.com';
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return 'retrogamesbox.com';
  }
}

async function cf(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  /* CF 的报错在 body 里比状态码有用得多，先读 JSON 再判 */
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    const detail =
      json?.errors?.map((e) => `${e.code} ${e.message}`).join('; ') ||
      `${res.status} ${res.statusText}`;
    throw new Error(detail);
  }
  return json.result;
}

async function resolveZone() {
  if (ZONE_ID) return { id: ZONE_ID, from: 'CF_ZONE_ID' };

  const name = rootDomain();
  const zones = await cf(`/zones?name=${encodeURIComponent(name)}&per_page=1`);
  if (!Array.isArray(zones) || zones.length === 0) {
    throw new Error(`token 能读 Zone，但账号下没有 ${name} 这个域名`);
  }
  return { id: zones[0].id, from: `按域名 ${name} 反查` };
}

async function main() {
  if (!TOKEN) {
    console.warn('');
    console.warn('⚠️ 没有配置 CF_PURGE_API_TOKEN，跳过边缘缓存清理。');
    console.warn('   后果：发版后旧 HTML 可能在边缘存活最多 24 小时，');
    console.warn('   这段时间里旧页面引用的 chunk 已经不存在，用户会看到 ChunkLoadError。');
    console.warn('   配法见 .env.example 的「Cloudflare 边缘缓存」一节，或本文件顶部注释。');
    return;
  }

  const zone = await resolveZone();
  const scope = rootDomain();

  if (!CONFIRM) {
    console.log('');
    console.log(`将清空 ${scope} 的**全部** Cloudflare 边缘缓存（zone ${zone.id}，来源：${zone.from}）。`);
    console.log('这是检查（没有清任何东西）。要真的清就加 --yes。');
    return;
  }

  const result = await cf(`/zones/${zone.id}/purge_cache`, {
    method: 'POST',
    body: JSON.stringify({ purge_everything: true }),
  });

  console.log(`\n✅ 已清空 ${scope} 的边缘缓存（zone ${zone.id}，来源：${zone.from}）`);
  if (result?.id) console.log(`   purge id: ${result.id}`);
  console.log('   接下来跑 pnpm warm:edge 回填热门地址（可选，但推荐）。');
}

main().catch((error) => {
  /*
   * 不把退出码打上去：这个脚本是 `pnpm cf:deploy` 的尾巴，
   * 部署本身已经成功了，清理没跑成不该让整条命令显示失败。
   */
  console.error('⚠️ 边缘缓存清理失败（不影响已完成的部署）：', error.message ?? error);
});
