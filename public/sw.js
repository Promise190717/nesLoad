/* global self, caches, clients, fetch, Response, URL */
/*
 * Service Worker —— PWA 的另一半（清单在 app/manifest.ts）。
 *
 * ⚠️ 这个文件**不经打包、不经类型检查**：它就是 `public/` 下的一个静态文件，
 * 浏览器按原样取回去跑。所以它只能用浏览器里真实存在的全局（上面那行 `global` 注释
 * 是给 ESLint 看的，不然 `self` / `caches` 会被判成未定义）。
 * 改完**必须改下面的 VERSION**，否则老用户那边跑的还是旧逻辑（见 activate 那段）。
 *
 * ---------------------------------------------------------------------------
 * 缓存策略：**只缓存不会过期的东西，页面永远走网络**
 *
 * 这个站的页面（`/`、`/privacy`、`/terms`）是**动态渲染**的 —— 语言由 cookie /
 * Accept-Language 决定，canonical 由请求的 Host 决定。对这类响应做 cache-first，
 * 等于让用户切了语言还看到上一门语言、换了域名还指着老域名。所以：
 *
 *   · **导航请求（mode === 'navigate'）** → network-first。在线时永远拿新页面，
 *     网络失败（真离线）才回退到上次存下的那一份。**只缓存 navigate**，不碰
 *     Next 的客户端路由请求（那些是 fetch 出来的 RSC payload，存下来再当 HTML 吐出去
 *     会让页面直接崩 —— 这也是这里用 `request.mode` 而不是「看 URL 长得像不像页面」
 *     来判定的原因）。
 *   · **带内容 hash 的静态资源**（`/_next/static/`）→ cache-first。文件名里那串 hash
 *     就是版本号，内容变了文件名就变了，**永远不存在「拿到旧副本」这回事**。
 *   · **`/cores/`（街机 WASM 核心）→ 刻意不碰。** 那个 36 MB 的文件已经有两条缓存路径：
 *     next.config.js 给它钉了 7 天的 HTTP 缓存（过期后 `stale-while-revalidate` 后台刷新），
 *     Nostalgist 自己还会往 CacheStorage 里存一份。SW 再插一手**只会破坏更新语义** ——
 *     CacheStorage 里的副本没有过期时间，而核心是**同名覆盖**的（换版本不改文件名），
 *     存下来就再也刷不新了。让 HTTP 缓存管它，那个本来就是为它设计的。
 *   · **图标（`/icon.svg`、`/icons/*.png`、favicon）→ 也不碰。** 它们的文件名不带 hash，
 *     而 CacheStorage 里的副本**没有过期时间**，存下来就再也刷不新了 —— 换图标只能靠
 *     改 VERSION。体积小到不值得冒这个险。
 *   · **`/api/*`** → **完全不碰**。那里有游戏库、留言本、后台接口，
 *     响应是活的、有的还带鉴权，缓存它们只会制造「看到别人数据」或「改完不生效」这类事故。
 *   · **第三方**（Google Fonts、jsdelivr、联机中继）→ **完全不碰**。
 *     跨域响应要么是不透明的（存下来也判断不了成败），要么有自己的缓存策略，
 *     轮不到我们插手。代价是离线时字体退回等宽、NES / SFC 核心拉不到 —— 这两件事
 *     本来就有兜底（字体优雅退化、屏幕里没有提示）。
 *
 * **不在 install 里预缓存任何东西**：安装 PWA 的前提是用户已经访问过首页，
 * 运行时缓存那时就已经有一份了；预缓存只会白白多打一次请求，还会把「安装那一刻的
 * 语言」钉死（运行时那份至少会在用户下次在线访问时被刷新）。
 */

/** 改这个值 = 作废所有旧缓存（activate 里会把名字对不上的缓存全删掉）。 */
const VERSION = 'v1';

const STATIC_CACHE = `nesload-static-${VERSION}`;
const PAGE_CACHE = `nesload-page-${VERSION}`;

/**
 * 只有一种资源可以安全地 cache-first：**Next 的构建产物**（`/_next/static/`）。
 *
 * 它的文件名里带内容 hash（`chunk-a1b2c3d4.js`），内容一变名字就变 ——
 * 所以「命中缓存就返回」永远不会返回过期的东西。
 *
 * 其余全都**不缓存**，包括图标（`/icon.svg`、`/icons/*.png`、favicon）：
 * 那些文件名**不带 hash**，存进 CacheStorage 就再也刷不新了（CacheStorage 里的副本
 * 没有过期时间，只有换 VERSION 才会清），而它们的体积小到根本不值得冒这个险。
 * `/cores/` 同理，理由见文件顶部。
 */
function isImmutableAsset(pathname) {
  return pathname.startsWith('/_next/static/');
}

self.addEventListener('install', (event) => {
  // 不等旧 SW 下班，直接接班 —— 静态资源带 hash，不存在「新 SW 配旧资源」的问题
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      /*
       * 把名字对不上的缓存全删掉。两个作用：
       *   1. 换 VERSION 时作废旧副本（这是 CacheStorage 里唯一能「清」的手段）；
       *   2. 顺带清掉**以前版本留下的**缓存 —— 策略改窄之后（比如不再缓存 /cores/），
       *      老用户机器上那份几十 MB 的旧缓存得有人负责删。
       */

      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE)
          .map((key) => caches.delete(key))
      );
      // 立刻接管已经打开的页面，否则用户要关掉标签页再进来才用得上新 SW
      await clients.claim();
    })()
  );
});

/** 导航请求：在线拿新的，离线回退到缓存。 */
async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    /*
     * 只存成功的响应。`response.ok` 会把 404 / 500 挡在外面 ——
     * 把错误页存成「离线时的首页」比什么都不存更糟。
     */
    if (response.ok) {
      const cache = await caches.open(PAGE_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    /*
     * `ignoreSearch`：导航 URL 可能带查询串（联机邀请的 `?room=XXXX`）。
     * 精确匹配会一条都命中不了，而这些参数在离线时本来也没有意义。
     */
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;

    // 退一步：给首页那份（用户在 /privacy 上离线刷新时，回首页总比看错误页强）
    const home = await caches.match('/', { ignoreSearch: true });
    if (home) return home;

    // 真的什么都没有（比如装完 PWA 就再没联网过）—— 交给浏览器自己的离线页
    return Response.error();
  }
}

/** 不可变资源：有缓存就直接用，没有再回网络。 */
async function handleImmutableAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 只处理 GET：POST 是留言本提交、后台录入这些，一律直连
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 第三方（字体 / CDN / 中继）不插手
  if (url.origin !== self.location.origin) return;

  // 接口一律直连（理由见顶部）
  if (url.pathname.startsWith('/api/')) return;

  /*
   * 老坑：Chrome 在 `only-if-cached` 且 mode 不是 same-origin 时会直接抛错。
   * 这类请求本来就该由浏览器自己处理，放行。
   */
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isImmutableAsset(url.pathname)) {
    event.respondWith(handleImmutableAsset(request));
  }
});
