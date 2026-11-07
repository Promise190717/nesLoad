/*
 * OpenNext 的**自定义 Worker 入口**（`wrangler.jsonc` 的 `main` 指向这里），
 * 在 OpenNext 生成的 handler 外面包一层 **Cache API 边缘缓存**。
 *
 * 为什么需要它（2026-10-24）：
 *
 *   10-22 迁 Vercel 后全站页面都是 `force-dynamic`（撤销了页面级 ISR），而实际部署
 *   仍走 Cloudflare 免费版 Workers —— 每个请求都要现场跑一遍 React SSR，免费版
 *   10ms CPU（按中位数执行）根本装不下，线上 2/3 的请求 1102
 *   （Worker exceeded CPU time limit）。`enableCacheInterception` 只能拦截
 *   Next 自己缓存过的路由，对 `force-dynamic` 完全无效，所以缓存在这里、
 *   在 Next 外面做。
 *
 *   这**不是 ISR**：没有 R2 存 HTML、没有 DO/tag cache、没有再验证机制，
 *   就是边缘上一份按 TTL 过期的响应副本，TTL 到了自然淘汰；发版想立刻生效就在
 *   仪表盘（Caching → Purge Everything）刷一次，或者等 TTL 自然过期。
 *
 *   ⚠️ 2026-11-03 补：**本文件这层已经退成兜底**。真正止血的是 Worker **外面**的
 *   Workers Caching（`wrangler.jsonc` 的 `cache.enabled`）—— 它命中时本文件根本
 *   不执行。理由见下面「两层缓存」那段，改这里的任何返回头之前先读它。
 *
 * ---------------------------------------------------------------------------
 * 2026-11-03 的重做：把「命中率」和「命中成本」两件事一起修
 *
 * 上一版只缓存**匿名 GET 的 HTML**，另外三类请求全部放行给 Next handler：
 *
 *   ① **软导航（RSC）**——全站 `prefetch={false}`，点任何一张卡片都是一次
 *      `RSC: 1` 请求，命中下面这段判断就直穿 handler。人的浏览行为里这类请求
 *      占大头，等于这层缓存对真实用户几乎不存在。
 *   ② **登录用户的任何页面**——只要 cookie 里有 `nesload_user` 就整站放行。
 *      而详情页/列表页的 HTML 里**一个字节都不依赖登录态**（收藏钮、评论框、
 *      顶栏的账号状态全是客户端组件自己问接口，见 `components/FavoriteButton.tsx`
 *      与 `components/GameComments.tsx` 的文件头），登录用户吃的是一份完全相同的
 *      公共 HTML。为了一个不存在的差异让所有登录用户都去现场渲染，是纯亏。
 *   ③ **`/api/games*`**——在线游戏库弹窗每翻一页打一次，每次都查库。
 *
 * 现在三类都进来了，另外还有两个必须做对的细节（上一版没有，会导致「存进去
 * 但永远读不到」）：
 *
 *   · **缓存键要剥掉 `_rsc`**。Next 客户端会给每条 RSC 请求的地址追加
 *     `?_rsc=<随机>` 来打掉中间层缓存 —— 原样当键用的话，每条 RSC 都是新键，
 *     命中率恒为 0。
 *   · **写入前必须把 `Vary` 从副本上删掉**。OpenNext 给页面响应带的是
 *     `vary: RSC, Next-Router-State-Tree, Next-Router-Prefetch, …`，
 *     而 `Cache.match()` 会按存储时的 `Vary` 逐个头比对 —— `Next-Router-State-Tree`
 *     每次导航都不同，于是同样一条 URL 永远匹配不上。存之前删掉 `Vary` 是**唯一**
 *     可行的办法。
 *
 *     🔴 **绝不能改写成 `match(key, { ignoreVary: true })`**：Cloudflare 的
 *     `CacheQueryOptions` **没有实现**这个字段，传进去不是被忽略，而是直接抛
 *     `The 'ignoreVary' field on 'CacheQueryOptions' is not implemented.`
 *     ——2026-11-03 线上事故：这一行让**每一个**请求都在包裹层抛异常，全站 1101。
 *     同理别传 `ignoreSearch` 之外的任何「Web 标准里有、Workers 里没有」的选项。
 *
 * ---------------------------------------------------------------------------
 * 为什么 RSC 可以按 URL 直接复用（而不是必须按路由树分键）
 *
 * 这是抄 OpenNext 自己的做法，不是猜的：`cacheInterceptor` 命中 R2 时，
 * 对**任何** RSC 请求都直接吐 `cachedValue.rsc`（整页 flight），完全不看
 * `Next-Router-State-Tree`（见 `@opennextjs/aws/dist/core/routing/cacheInterceptor.js`
 * 的 `getBodyForAppRouter`）。既然框架认为同一份整页 payload 能服务任何路由树，
 * 我们提前一层按 URL 缓存它，语义完全一致，只是省掉了「读 R2 + 解压 + JSON.parse」。
 *
 * 例外是 **segment prefetch**（`next-router-segment-prefetch`）：那个要的是某一段
 * 单独的 payload，拿整页塞过去会让客户端永远认为没预取成功、无限重试。
 * 这类请求照旧放行。
 *
 * ---------------------------------------------------------------------------
 * 两层缓存，别搞混（2026-11-03）
 *
 *   ① **Workers Caching**（`wrangler.jsonc` 的 `cache.enabled`）——在 Worker **外面**，
 *      按 RFC 9111 读响应头。命中时本文件一行代码都不执行，**连 isolate 都不启动**。
 *      这是唯一能绕开「免费版 10ms 连 bundle 初始化都装不下」的办法。
 *      它只有两个控制手段，都在下面：`withCdnHeaders()`（该存）和 `noStore()`（不该存）。
 *
 *   ② **Cache API**（本文件）——在 Worker **里面**。命中也要先付一次冷启动 + 模块
 *      初始化的 CPU，所以它救不了冷 isolate，只能救「同一数据中心、isolate 还热着」
 *      的重复请求。它是第一层的兜底，**不是主力** —— 别指望它单独压住 1102。
 *
 *   由此得出一条判断标准：新增路由时先问「它该不该进 ①」。该进就走文件末尾那个
 *   统一的 `withCdnHeaders` 出口（整页 HTML 都走它）；不该进就在放行分支里 `noStore`。
 *
 * ---------------------------------------------------------------------------
 * 规则（宁可少缓存也不缓存错）
 *
 *   · 只处理 **GET**；`HEAD` / POST（含 server action）一律放行并显式 `no-store`；
 *   · **不进缓存**的路径：`/admin*`、`/account*`、`/login*`（任何语言前缀下）、
 *     `/_next/*`、以及除 `/api/games` 之外的**所有** `/api/*`（私有接口和评论
 *     都在这条线上，评论晚 60 秒出现是不能接受的）；
 *   · Cache API 只存 **200 / 404** 且没有 `Set-Cookie` 的 HTML / XML / 纯文本 / flight；
 *     Workers Caching 只接同一个判断下的 **整页 HTML / XML / 纯文本 / 公开 JSON**
 *     ——flight 一律 `no-store`（理由见 `withCdnHeaders` 的注释）。
 *     重定向（语言 307 / 301）与 5xx 两边都不缓存 —— 语言跳转依赖 cookie，
 *     缓存了会把没设过语言的人跳去错误的语言；
 *   · 缓存键剥掉 `utm_*` / `fbclid` / `gclid` / `msclkid` / `_rsc`；
 *     `/play` 更进一步**整个查询串都不要** —— 那一页的 HTML 是一个空壳，
 *     `id` / `room` / `lang` 三个参数全由客户端读（见 `components/StaticPlay.tsx`），
 *     服务端渲染结果逐字节相同，按参数分键只是把同一份副本存几十遍。
 *
 * TTL：页面 200 存 **24 小时**、404 存 1 小时、`/api/games*` 存 30 秒。
 * 页面内容只有后台上传游戏时才变（数据层还有 7 天缓存），24 小时的陈旧窗口
 * 对用户和爬虫都无感；想立刻生效就仪表盘 purge 一次。404 也存，是为了挡扫描器对
 * 不存在地址的反复试探 —— 每次试探都是一次会超限的渲染。
 *
 * ⚠️ **为什么长尾 URL 会「永远冷」（2026-11-03 查明的死循环）**
 *
 *   命中路径是「缓存没有 → 交给 Next 渲染 → 渲染成功才 `cache.put`」。免费版 10ms CPU
 *   下，一次完整的 App Router SSR 装不进去 → Worker 被杀 → **没有响应，也就没有副本**
 *   → 下一个人来还是冷 → 还是超时。被反复访问的页面能靠运气好的一次暖起来，而
 *   **只被访问一次的长尾**（爬虫顺着详情页的下载钮抓到的那 3.8 万个下载页就是典型）
 *   永远停在冷状态，每被访问一次就贡献一条 1102。
 *
 *   所以这里的 TTL 越长越好：一次成功就能顶一天。真正的病根不在这层缓存，
 *   而在「免费版 10ms 装不下一次 SSR」—— 解法只有一个：让请求**不要进 Worker**，
 *   也就是 `wrangler.jsonc` 里的 Workers Caching（见上面「两层缓存」那段）。
 *
 *   ✅ **2026-11-04 补：下载页那一族已经从死循环里摘出来了**。那一族 3.8 万条 URL
 *   是这毛病的重灾区（线上 1102 日志清一色 `/games/<slug>/download`），做法是把它
 *   的服务端输出改成**与 id 无关**，缓存键按语言折叠成一条（`downloadKeyPath`）——
 *   冷的只剩 18 条，`pnpm warm:edge` 一把就能焐热。详情页那一族**没有**这么处理
 *   （它的 HTML 里全是这一款的内容，折叠不了），仍靠「热门 + 预热 + 重复访问」慢慢暖。
 *
 * ⚠️ **静态资产不走这里**：`assets` 绑定的文件（`/_next/static`、`/cores`、
 *    `/sprites`…）由 Cloudflare 直接服务、不进 Worker，免费额度也不计入请求。
 *
 *    ⚠️ 2026-11-03 起 `wrangler.jsonc` **确实开了** `"cache": { "enabled": true }`
 *    （Workers Caching，见上面「两层缓存」那段）。原先的顾虑是「会把资产请求也变成
 *    计费请求」——按 Cloudflare 的模型，`assets` 绑定的文件仍然在 Worker 之前就被
 *    处理掉，不该走到这里；上线后如果仪表盘的请求数出现异常跳变，第一件事是去核对
 *    它，而不是回滚缓存。真正的作用是：**HTML 命中时连这个 Worker 都不启动**，
 *    这是本文件做不出来的效果，值得为它承担这个待验证项。
 *
 * ⚠️ 缓存条目**跨发版存活**：发版后最多 24 小时内可能混着旧版 HTML。
 *    不可接受就在仪表盘 purge 一次；可接受（默认）就不用管。Workers Caching 那份
 *    默认**不跨版本**（`cross_version_cache` 没开），发版即清空，靠
 *    `scripts/warm-edge.mjs` 重新灌一遍热门地址。
 *
 * 🔴 **2026-11-03 之前这个文件一直没生效**：`wrangler.jsonc` 里同时存在两个 `main`，
 *    JSONC 重复键取最后一个，入口实际是 `.open-next/worker.js`。那时候的症状是
 *    「R2 明明 HIT，刷新同一页仍然 1102」—— R2 命中省掉的只是查库，整个 Next
 *    handler 照跑。改 `main` 时先 grep 一遍有没有第二个。
 *
 * 参照 https://opennext.js.org/cloudflare/howtos/custom-worker 的官方写法：
 * `DOQueueHandler` / `DOShardedTagCache` 必须从这个入口再导出，否则
 * wrangler.jsonc 里那两个 DO 的迁移会因为「类不在入口 worker 上」而失败。
 */

// 本文件不参与 tsc typecheck（tsconfig exclude），`.open-next/worker.js` 由
// `pnpm cf:build` 生成，运行时由 wrangler/esbuild 打包解析。
// @ts-expect-error `.open-next/worker.js` is generated by `pnpm cf:build`
import { default as handler } from './.open-next/worker.js';

/** 页面副本的 TTL（秒）。
 *
 * 2026-11-03 从 30 分钟拉到 24 小时：这层缓存是免费版 10ms CPU 下唯一能救命的东西，
 * 而 30 分钟意味着**每天每页要重渲染 48 次**，每一次都是一次赌 —— 渲染没跑完就拿不到
 * 响应、`cache.put` 也就不执行，那一页从此永远冷（见下面「为什么长尾永远冷」那段）。
 * 页面内容只有后台上传游戏时才变，数据层本来就有 7 天缓存，24 小时的陈旧窗口
 * 对用户和爬虫都无感；要立刻生效就仪表盘 purge 一次。
 */
const TTL_PAGE = 86400;
/** 404 副本的 TTL（秒）。2026-11-03 从 5 分钟拉到 1 小时 —— 它挡的是扫描器，
 *  而扫描器的特征是「同一个不存在的地址反复来」，5 分钟刚好让它每次都穿透。 */
const TTL_NOT_FOUND = 3600;
/** 公开接口副本的 TTL（秒）。 */
const TTL_API = 30;

/** 只缓存这些内容类型（HTML / 站点文件 / RSC flight / 公开接口的 JSON）。 */
const CACHEABLE_CONTENT_TYPES =
  /^(text\/html|text\/plain|application\/xml|text\/xml|text\/x-component|application\/json)\b/i;

/** 缓存键里要剥掉的追踪参数。 */
const TRACKING_PARAM = /^(utm_|fbclid|gclid|msclkid)/i;

/** 需要逐字节新鲜 / 带登录态的路径：`/account`、`/login`，允许带一层语言前缀。 */
const PRIVATE_PATH = /^\/(?:[a-z]{2,5}(?:-[A-Za-z]{2,4})?\/)?(?:account|login)(?:\/|$)/;

/** 可以短缓存一次的公开接口：在线游戏库弹窗（列表 / 单款）。评论接口不在此列。 */
const PUBLIC_API = /^\/api\/games(?:\/[^/]+)?$/;

/** ROM 只能走外层 Workers Caching，不能进 Cache API（后者会缓冲整份大文件）。 */
const ROM_API = /^\/api\/games\/[^/]+\/rom$/;

/** `/play` 的 HTML 与查询串无关（见文件头那段）。允许带一层语言前缀：`/play`、`/zh/play`。 */
const PLAY_PATH = /^\/(?:[a-z]{2,5}(?:-[A-Za-z]{2,4})?\/)?play$/;

/**
 * 下载页：`/<locale>/games/<id>/download`，语言前缀可省。
 *
 * 只用来识别路径；**它带一个捕获组**，因为缓存键要把中间那段 `<id>` 整个吃掉
 * （见 `cacheKey` 与 2026-11-04 那段说明）。
 */
const DOWNLOAD_PATH = /^(\/(?:[a-z]{2,5}(?:-[A-Za-z]{2,4})?))?\/games\/[^/]+\/download$/;

/**
 * 下载页折叠后的缓存键路径（每语言一份）。
 *
 * 2026-11-04：下载页的服务端输出**故意与 id 无关**（正文在
 * `components/GameDownloadPanel.tsx` 里客户端取数，理由见下载页 page.tsx 的文件头）。
 * 于是 2110 款 × 18 语言 ≈ 3.8 万条 URL 可以共用 18 份副本 —— 这是唯一能在
 * 免费版 10ms CPU 下把这一族从「永远冷」里救出来的办法。
 *
 * ⚠️ 只对**整页 HTML** 折叠（`variant === 'html'`）。flight 是逐 URL 的
 * （载荷里带着这次导航的路由树），把 A 游戏的 flight 喂给 B 游戏属于拿不准的事，
 * 而软导航这条缝已经被详情页改硬导航（`<a>`）堵住了。
 */
function downloadKeyPath(localePrefix: string | undefined): string {
  return `${localePrefix ?? ''}/__nesload_download`;
}

function isPrivatePath(pathname: string): boolean {
  return (
    PRIVATE_PATH.test(pathname) ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/_next/')
  );
}

/**
 * 当前部署的版本号，用来给 Cache API 的键加一个「只属于这次部署」的标记。
 *
 * ## 为什么必须有它（2026-11-04）
 *
 * `cacheKey()` 原本是**纯 URL**。而 Cache API 这一层（`caches.default`）不跟 Worker
 * 版本绑定，条目 **TTL 24 小时内跨发版存活** —— 于是发版后请求进来：
 *
 *   Workers Caching 已经清空（`cross_version_cache: false`）→ 进 Worker →
 *   `cache.match(纯 URL)` → **命中上一版 HTML** → 直接返回。
 *
 * 表现就是用户拿到一份引用着**已被删除的 chunk** 的旧页面，`import()` 全部 404、
 * 抛 `ChunkLoadError`。R2 那层的键里本来就有 buildId（会正确 MISS），但请求根本
 * 走不到那儿，在 Cache API 就被截胡了。
 *
 * 把部署 id 拼进键之后，这一层也获得了「发版即全部失效」的性质 ——
 * 三层（Workers Caching / Cache API / R2）就都对齐了，不再需要发版后手动 purge。
 *
 * `CF_VERSION_METADATA` 是 Cloudflare 的保留 binding（见 wrangler.jsonc），
 * 每次部署 id 都不同。**取不到就返回空串，键保持原样** —— 本地 `wrangler dev`
 * 或者有人把 binding 删了，行为退回改动之前，不会因为读不到就整站不缓存。
 */
function cacheVersion(env: unknown): string {
  const meta = (env as { CF_VERSION_METADATA?: { id?: unknown } } | null | undefined)
    ?.CF_VERSION_METADATA;
  return typeof meta?.id === 'string' ? meta.id : '';
}

/**
 * 缓存键。`variant` 区分三种副本：
 *   · `html`     —— 整页 HTML；
 *   · `rsc`      —— 软导航用的整页 flight；
 *   · `prefetch` —— 预取用的 flight（`Next-Router-Prefetch: 1`，载荷与上面那份
 *                   **不一定**逐字节相同，混用会把预取版本喂给真实导航）。
 *
 * 不直接用原 request：键要和「分享链接上带了追踪参数」「Next 给 RSC 地址
 * 追加了 `_rsc`」这两种情况对齐。
 *
 * `version` 见 `cacheVersion()`：**必须加在最后**，因为 `/play` 和下载页那两处会
 * 把整个查询串清空，早加就被一起清掉了。
 */
function cacheKey(
  request: Request,
  variant: 'html' | 'rsc' | 'prefetch',
  version: string
): Request {
  const url = new URL(request.url);
  for (const name of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(name) || name === '_rsc') url.searchParams.delete(name);
  }
  if (PLAY_PATH.test(url.pathname)) url.search = '';
  /*
   * 下载页：查询串整个不要（它是死参数，见 `GameLanguageActions` 里下载钮那段），
   * 整页 HTML 再把 `<id>` 那段折叠掉 —— 一套语言一份副本服务这一族的全部 URL。
   * flight 不折叠，理由见 `downloadKeyPath`。
   */
  const download = DOWNLOAD_PATH.exec(url.pathname);
  if (download) {
    url.search = '';
    if (variant === 'html') url.pathname = downloadKeyPath(download[1]);
  }
  if (variant !== 'html') url.searchParams.set('__nesload_rsc', variant === 'prefetch' ? '2' : '1');
  if (version) url.searchParams.set('__v', version);
  return new Request(url.toString(), { method: 'GET' });
}

/**
 * 准备一份「可以交给 Cache API」的副本：盖自己的 TTL，并**删掉 `Vary`**。
 *
 * ⚠️ **不改写 Cache-Control 就没用**：`Cache.put()` 只认响应头里的 `Cache-Control`
 *    （和 `Expires`），它**没有第三个参数** —— `{ cacheTtl }` 是 `fetch()` 的 `cf`
 *    选项，`Cache.put` 收到也会丢掉。而 Next 的页面响应带的是
 *    `s-maxage=<ISR revalidate>`，约 7 天。原样存进去，边缘就按 7 天陈旧。
 *
 * ⚠️ **`Vary` 必须删**：OpenNext 给页面响应带
 *    `vary: RSC, Next-Router-State-Tree, Next-Router-Prefetch, …`，
 *    `Cache.match()` 默认按它逐个头比对，而路由树每次导航都不一样 ——
 *    留着它等于给这条键上一个「几乎永不匹配」的条件。
 *
 * ⚠️ 只能改这条副本，不能改 `response` 本身：那是要返回给浏览器的。
 */
function withEdgeTtl(response: Response, ttl: number): Response {
  const headers = new Headers(response.headers);
  headers.delete('vary');
  headers.delete('set-cookie');
  headers.set('cache-control', `public, max-age=0, s-maxage=${ttl}`);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * 让 **Workers Caching**（`wrangler.jsonc` 的 `cache.enabled`）**不要**存这一份。
 *
 * 它按 RFC 9111 工作，而 9111 有「启发式新鲜度」：响应里**没有**缓存头也可能被它算成
 * 可缓存的。所以「不该缓存」必须明说，不能靠不写头 —— 私有页面、登录态、重定向、
 * 以及每条地址都带随机 `_rsc=` 的 flight，全都要走这里。
 *
 * 已经是 `no-store` 的直接原样返回：重建一次 `Response` 会白白多拷一层 header，
 * 也可能丢掉运行时附加的属性。
 */
function noStore(response: Response): Response {
  if ((response.headers.get('cache-control') ?? '').includes('no-store')) return response;
  /*
   * 204 / 304 是「空响应」状态码：`new Response(body, { status })` 对它们会直接抛
   * （规范不允许带 body），所以原样放行。它们本来也不会被当成可缓存的实体。
   */
  if (response.status === 204 || response.status === 304) return response;
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * 给「Workers Caching 应该存的那一份」盖头。
 *
 * 两件事都必须做对，否则等于没开：
 *
 *   · **`Cache-Control` 要写明 `s-maxage`**：它只认头，`s-maxage` 是给共享缓存看的
 *     那一份新鲜期（`max-age=0` 让浏览器别存，页面还是走每次请求）。
 *   · **`Vary` 必须收窄成 `RSC`**：Next 原始那串是
 *     `RSC, Next-Router-State-Tree, Next-Router-Prefetch, …`，而路由树每次导航都不同，
 *     原样保留的话同一页永远匹配不上（和 `withEdgeTtl` 注释里同一个坑）。
 *
 *     但**不能像 Cache API 那份一样直接删掉**：Cache API 的键里塞了 `__nesload_rsc`
 *     变体标记，删了也不会串；Workers Caching 的键是 URL，HTML 和 flight 是**同一个
 *     URL 靠 `RSC` 头区分的**，删干净就会把整页 HTML 喂给软导航，页面直接白屏。
 *     只留 `RSC` 一个维度，正好把两者分开，又甩掉了路由树。
 *
 * ⚠️ 只用于 `variant === 'html'` 的那一份。flight / prefetch 一律走 `noStore` ——
 *    它们的地址带随机 `_rsc=`，存进去就是几万条只读一次的垃圾，还会挤掉真正有用的页。
 */
function withCdnHeaders(response: Response, ttl: number): Response {
  const headers = new Headers(response.headers);
  headers.set('cache-control', `public, max-age=0, s-maxage=${ttl}`);
  headers.set('vary', 'RSC');
  /*
   * 把调试用的标记摘掉再交出去：这一份会被 Workers Caching 原样存起来，
   * 留着 `x-nesload-edge: HIT` 会让之后所有 CDN 命中都声称是「Cache API 命中」，
   * 排查时反而看不清到底哪一层在服务。
   */
  headers.delete('x-nesload-edge');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const edgeCacheWrapper = {
  async fetch(
    request: Request,
    env: unknown,
    ctx: { waitUntil(promise: Promise<unknown>): void }
  ): Promise<Response> {
    /*
     * 非 GET 一律放行，并且显式 `no-store`。HTTP 缓存本来就只存 GET，但 Workers
     * Caching 是我们自己开的，宁可让「存不存」只由下面这张表决定，别去赌实现细节。
     */
    if (request.method !== 'GET') return noStore(await handler.fetch(request, env, ctx));

    const url = new URL(request.url);
    const { pathname } = url;
    /** 下载页整族共用一份副本（见 `downloadKeyPath`）—— 下面存副本时要按它区别对待。 */
    const isDownload = DOWNLOAD_PATH.test(pathname);

    if (isPrivatePath(pathname)) return noStore(await handler.fetch(request, env, ctx));

    /*
     * flight（软导航）请求。segment prefetch 要的是「某一段」而不是整页，
     * 按 URL 缓存会给出形状不对的载荷，所以那一种直穿。
     */
    const isRsc = request.headers.has('rsc');
    if (isRsc && request.headers.has('next-router-segment-prefetch')) {
      return noStore(await handler.fetch(request, env, ctx));
    }

    const isApi = pathname.startsWith('/api/');
    /*
     * ROM 路由：**缓存策略交给路由自己决定**（2026-11-07 改）。
     *
     * 2026-11-06 这里曾经一律 `noStore`：第 0 层在缓存未命中时会先摘掉 `Range`
     * 再回源整包，路由于是回 200 + 整个几百 MB，这一层把它存成**截断副本**
     * （实测 261,479,549 字节的对象只剩 44,875,456），之后所有分片都命中那个坏副本，
     * 线上整款游戏打不开。
     *
     * 现在敢交回去，是因为路由已经完全换了形态：
     *   · 分片只走 `?span=`（查询串不会被摘掉），响应 ≤ 8 MiB 且带**准确的**
     *     `Content-Length` —— 边缘存不下残片，存错了前端也会当场校验失败；
     *   · 分片回 **200** 而不是 206（Cloudflare 默认不缓存 206），命中时 Worker
     *     一次都不启动、不计 CPU、不回源 —— 免费版 10ms 的坎就是这么过的；
     *   · URL 带 `?v=` 版本号，换 ROM 自动换键，不会新旧混片；
     *   · 整包下载、探针、以及所有错误分支，路由仍然显式 `private, no-store`。
     *
     * ⚠️ **命中照样算一次请求**（官方口径：cache hit 不记 CPU，但按标准请求率计一次）。
     *    压请求数靠分片大小（8 MiB）和浏览器缓存，不是靠这一层。
     * ⚠️ **别在这里再套 `noStore`**：那会把路由写好的 `s-maxage` 盖掉，每一片都退回
     *    「一次 Worker 调用 + 一次回源」，免费版的 CPU 额度立刻吃紧。
     */
    if (ROM_API.test(pathname)) {
      return handler.fetch(request, env, ctx);
    }
    if (isApi && !PUBLIC_API.test(pathname)) {
      return noStore(await handler.fetch(request, env, ctx));
    }

    const cache = (caches as unknown as { default: Cache }).default;
    const variant = isRsc
      ? request.headers.has('next-router-prefetch')
        ? 'prefetch'
        : 'rsc'
      : 'html';
    const key = cacheKey(request, variant, cacheVersion(env));

    /*
     * 这一段必须包 try/catch：边缘缓存是**附加**的一层，它的任何异常都不该把
     * 整站打成 1101。2026-11-03 的线上事故就是这里传了一个 Workers 没实现的
     * 查询选项（`ignoreVary`），`Cache.match()` 直接抛，结果每个请求都 1101。
     */
    try {
      const hit = await cache.match(key);
      if (hit) {
        const headers = new Headers(hit.headers);
        headers.set('x-nesload-edge', 'HIT');
        const copy = new Response(hit.body, {
          status: hit.status,
          statusText: hit.statusText,
          headers,
        });
        /*
         * 这条副本的 `Vary` 被 `withEdgeTtl` 删过（Cache API 靠键里的 `__nesload_rsc`
         * 变体标记区分，不需要它），但 **Workers Caching 只认 `Vary`** —— 原样返回
         * 会让它把 flight 和整页 HTML 当成同一份互相覆盖。所以出这扇门之前补回来。
         */
        const hitTtl = hit.status === 404 ? TTL_NOT_FOUND : isApi ? TTL_API : TTL_PAGE;
        return variant === 'html' ? withCdnHeaders(copy, hitTtl) : noStore(copy);
      }
    } catch (error) {
      console.error('[edge-cache] 命中路径失败，按未命中处理', pathname, error);
    }

    const response = await handler.fetch(request, env, ctx);

    /*
     * 下载页那一族的副本是**整族共用的**（`downloadKeyPath`）⇒ 非 200 一律不能存：
     * 一条 404 会被当成这一族所有游戏的结果发出去。这里连 Cache API 一起跳过后
     * 直接 `noStore`，别让 Workers Caching 按原 URL 再单独存一份坏的。
     * （正文已经不查库判存在性了，正常不该再出 404；这条守的是语言段非法之类的边界。）
     */
    if (isDownload && response.status !== 200) return noStore(response);

    const ttl =
      response.status === 200
        ? isApi
          ? TTL_API
          : TTL_PAGE
        : response.status === 404
          ? TTL_NOT_FOUND
          : 0;
    const contentType = response.headers.get('content-type') ?? '';
    const storable =
      ttl > 0 &&
      !response.headers.has('set-cookie') &&
      CACHEABLE_CONTENT_TYPES.test(contentType);

    /*
     * 不可缓存（重定向 / 5xx / 带 Set-Cookie / 二进制）——交给调用方之前必须写上
     * `no-store`，否则 Workers Caching 的启发式新鲜度可能替我们做主，
     * 把语言跳转或者带登录态的响应当成公共内容存下来。
     */
    if (!storable) return noStore(response);

    /*
     * ① Cache API 那一层（本次 isolate 内 / 本数据中心）。
     *    先 clone 再 put：`Cache.put()` 会接管 body，之后原响应就没法再改头了。
     */
    try {
      ctx.waitUntil(
        cache.put(key, withEdgeTtl(response.clone(), ttl)).catch((error) => {
          // 存不进去只是这次没缓存，别把已经渲染好的页面打成 500
          console.error('[edge-cache] 写入失败', pathname, error);
        })
      );
    } catch (error) {
      // `response.clone()` / `Cache.put()` 也可能同步抛（比如 body 已被消费）
      console.error('[edge-cache] 入队失败，跳过本次缓存', pathname, error);
    }

    /*
     * ② 返回给调用方的那一份。
     *
     *    整页 HTML（含 404）盖上 Workers Caching 认的头，让它在 Worker **外面**
     *    被命中 —— 那一步连 isolate 都不启动，是免费版 10ms 下唯一能真正止损的地方。
     *
     *    flight / prefetch 一律 `no-store`：它们每条地址都带随机的 `_rsc=`，
     *    进了缓存就是几万条只读一次的垃圾，还会按 `Next-Router-State-Tree` 分叉。
     */
    return variant === 'html' ? withCdnHeaders(response, ttl) : noStore(response);
  },
};

export default edgeCacheWrapper;

// @ts-expect-error `.open-next/worker.js` is generated by `pnpm cf:build`
export { DOQueueHandler, DOShardedTagCache } from './.open-next/worker.js';
