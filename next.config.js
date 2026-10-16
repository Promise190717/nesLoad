/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 说明：这里无需为 Nostalgist 配置 images.remotePatterns。
  // next.config 的 images 字段只作用于 next/image 组件，而 Nostalgist 是自行
  // 通过 fetch 拉取 RetroArch 的 WASM 核心与资源，不经过 Next 的图片管线，
  // 因此那条配置既无效也容易让人误以为 CDN 访问已受控。
  //
  // 另外：街机（fbneo）的核心已改走本站 `public/cores/`，只有 NES / SFC 还从
  // jsdelivr 拉。原因见 lib/emulator.ts 的 LOCAL_CORE_DIR 注释。

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
   * ⚠️ NES / SFC 的核心来自 jsdelivr，不经过这份配置，那边有自己的缓存策略。
   */
  async headers() {
    return [
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
       * 7z 解压 worker（2026-10-15 加，配合 `lib/unwrap.ts` 的 7z 支持）。
       *
       * 280 KB 的一份 asm.js，**文件名不带内容 hash**（永远叫 `extract7z.js`），
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
    ];
  },
};

module.exports = nextConfig;
