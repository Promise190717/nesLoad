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
   * 大文件的缓存策略 —— 目前两类：自托管的 WASM 核心（`/cores/`）和站点自带的
   * 街机 BIOS（`/bios/`）。
   *
   * `public/` 下的文件 Next 默认给的是 `Cache-Control: public, max-age=0` —— 意思是
   * **每次都要回服务器验一次**（拿到 304 才用本地副本）。对普通小资源无所谓，但
   * `fbneo_libretro.wasm` 是 **36 MB**：哪怕只发一次「没变」的往返，用户也要等一个 RTT，
   * 而且每次换卡带都会再来一遍。
   *
   * 为什么敢给 7 天：这两个文件**几乎不会变**（核心的 romset 版本是锁死的，见
   * lib/emulator.ts 的 CORE_MAP 注释；BIOS 更是十几年没动过），文件名又**不带内容 hash**，
   * 所以不能用 `immutable` + 一年 —— 那样万一换了文件，用户会一直吃旧副本。
   * 7 天 + `stale-while-revalidate` 是折中：过期后先用本地副本把游戏跑起来，后台悄悄刷新。
   *
   * BIOS 那条其实还多一层兜底：`lib/bios.ts` 的 `ensureBios()` 拿到之后会**存进
   * IndexedDB**，之后连这个 HTTP 缓存都不会再碰。钉在这里是给「IndexedDB 存不进去」
   * 的场景兜底（Safari 无痕、配额满），免得那种情况下每次拖卡带都要重下 1.35 MB。
   *
   * 只作用于本站自托管的文件；NES / SFC 的核心来自 jsdelivr，那边有自己的缓存策略。
   */
  async headers() {
    return [
      {
        source: '/cores/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/bios/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800, stale-while-revalidate=86400',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
