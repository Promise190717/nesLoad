/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { globalNotFound: true },

  // 说明：这里无需为 Nostalgist 配置 images.remotePatterns。
  // next.config 的 images 字段只作用于 next/image 组件，而 Nostalgist 是自行
  // 通过 fetch 拉取 RetroArch 的 WASM 核心与资源，不经过 Next 的图片管线，
  // 因此那条配置既无效也容易让人误以为 CDN 访问已受控。
  //
  // 另外：所有机种的核心（含 NES / SFC）都已走本站 `public/cores/`，运行时不再
  // 从 jsdelivr 拉任何东西。原因见 lib/emulator.ts 的 LOCAL_CORE_DIR 注释。

  /**
   * 大文件的缓存策略 —— 自托管的 WASM 核心（`/cores/`）和站点自带的街机 BIOS（`/bios/`）。
   *
   * 背景：这两个目录里是 `fbneo_libretro.wasm.gz`（9.7 MB；解开的 wasm 是 34 MB，
   * 见 `lib/emulator.ts` 的 `GZIP_CORES`）那种大文件，`public/` 的默认策略
   * （Next 给 `max-age=0`）意味着**每次换卡带都要回服务器验一次**。虽然 304 不带 body，
   * 但国内网络下这个往返还是一直要等，能给 CDN 缓存就该给。
   *
   * ⚠️ 但**不能把浏览器和 CDN 混成一个 `max-age`**（2026-10-15 踩到过）：
   *
   * 这些文件名**不带内容 hash**（永远叫 `picodrive_libretro.wasm`），URL 不变，缓存就分不出
   * 两个版本。原来写的是 `max-age=604800`，它对**浏览器和 CDN 同时生效** —— 于是换了核心
   * 文件之后，浏览器 7 天内根本不会回服务器问一句（第 1 层直接命中，走不到 CDN），
   * **继续吃旧核心**，现象和「补丁没生效」一模一样。实际踩到：32X 的 picodrive 从
   * v1.22.2 换成 v1.22.2-1 后，本地浏览器一直报 RetroArch 的 "Failed to load content."。
   *
   * 关键区别：**CDN 那层可以主动 purge（发版后刷一次，几秒生效），用户浏览器那层不行。**
   * 所以两层要分开定（用户定的是**一天**）：
   *   · `max-age=86400` → 只对**浏览器**生效，1 天。换核心/BIOS 后，用户最坏等一天
   *                       自动拿到新的，不需要手动清缓存。
   *   · `s-maxage=86400` → 只对**CDN / 反向代理**生效，1 天。CDN 该分摊流量照分摊；
   *                       想立刻生效就发版后调一次 purge（Cloudflare / Vercel 都有一键刷新）。
   *   · `stale-while-revalidate=86400` → 过期后用旧副本先顶上、后台悄悄刷新，
   *                       避免正好卡在过期那一刻的用户等太久。
   *
   * 也就是说：**换核心/BIOS 文件后，最干净的做法是发版时顺手 purge 一次 CDN**；
   * 忘了也没事，最多一天后两层都自己过期。**浏览器那层永远不用指望用户手动清。**
   *
   * ⚠️ 现在**所有核心都在这份配置的覆盖范围内**（2026-10-19 把 NES / SFC 的
   *    fceumm / snes9x 也搬进了 `public/cores/`），换核心后记得 purge 一次 CDN。
   */
  async headers() {
    return [
      /*
       * Service Worker 本体（2026-10-21 加）。
       *
       * 浏览器查更新时会绕过 HTTP 缓存直接取 `sw.js`，但**托管层那一层还在**：
       * 只要 CDN 把 `sw.js` 缓存住，新策略就传不下去。`no-cache` 是明示「每次都问」，
       * 成本是一次 304，换来 `VERSION` / 策略改动立刻生效。
       */
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, must-revalidate' }],
      },
      /*
       * ⚠️ **Next 构建产物的默认 `immutable` 在这个站上不成立（2026-10-19 事故）**。
       *
       * Next 给 `/_next/static/*` 发的是 `public, max-age=31536000, immutable`，
       * 前提是「文件名带内容 hash，内容一变 URL 就变」。但线上实测这个前提不成立：
       * 4f8263a 那次发版加了 `localCoreWasmUrl`，chunk 名字没变（页面里引用的还是
       * `0fe0plnjka4ry.js` / `0y0l5iwj4xp9f.js` 那一批），于是**缓存里躺着的旧 JS
       * 被继续使用**，新页面调用旧 chunk 里不存在的导出，报
       * `(0, h.v) is not a function` / `Right-hand side of 'instanceof' is not an object`；
       * 再叠上被缓存一年的旧 HTML 指向已被替换的 chunk，客户端就陷进
       * `加载失败 → 自动刷新 → 还是旧 HTML` 的死循环（街机 `/play` 上踩到的就是这个）。
       *
       * 修法：**浏览器和 CDN 都必须先问一句再决定用不用缓存**。
       * `max-age=0, must-revalidate` 让每次都带 `If-None-Match` 回源，内容没变就是
       * 一个 304（Workers Assets 直接服务，几乎零成本），变了立刻拿到新的。
       * 代价是首屏多一个往返（十几个 chunk 是并行的，不是串行）。
       *
       * 真正的解法是把 chunk 名改成内容 hash（Turbopack 侧的事），在那之前这条不能删。
       * 与之配套的另一半在 `app/[locale]/play/page.tsx`（HTML 不许长缓存）。
       */
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
      {
        source: '/cores/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/bios/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400',
          },
        ],
      },
      /*
       * 7z 解压 worker（2026-10-15 加，配合 `lib/unwrap.ts` 的 7z 支持；
       * 2026-10-21 从 asm.js 换成 wasm，目录里有 `extract7z-wasm.js` +
       * `7zz.umd.js` + `7zz.wasm` 三份）。
       *
       * 它们的文件名都**不带内容 hash**（`7zz.wasm` 换版本还是叫这个），
       * 所以和上面两个目录同一条规矩：浏览器与 CDN 各一天，换文件后 purge CDN。
       * 理由和坑都写在 `lib/unwrap.ts` 的 `EXTRACT_7Z_WORKER` 注释里。
       */
      {
        source: '/compression/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400',
          },
        ],
      },
      /*
       * `7zz.wasm` 必须报 `application/wasm`，否则 `instantiateStreaming` 会被拒
       * （emscripten 有 `instantiate(arrayBuffer)` 的兜底，但那是白读一遍）。
       * 静态文件的 MIME 由托管层按扩展名猜，多这一条是给猜错的部署环境兜底 ——
       * 精确匹配一条，不碰 `/compression/` 下别的东西。
       */
      {
        source: '/compression/7zz.wasm',
        headers: [
          { key: 'Content-Type', value: 'application/wasm' },
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
