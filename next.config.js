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
};

module.exports = nextConfig;
