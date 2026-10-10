import { OG_ALT, OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from '@/lib/og-image';

/*
 * og:image —— 由 Next 的文件约定生成，不用往仓库里塞一张 PNG。
 *
 * 为什么不用静态图：静态图改了界面也不会跟着变，时间一长就成了一张和站点不符的旧图。
 * 这张是把房间 / 机身 / 屏幕的成分用 Satori 现场画出来的，配色直接对着主题令牌写。
 *
 * 生成结果 Next 会自动接进 metadata（绝对地址、尺寸、alt），所以 layout 的
 * `openGraph` 里**不要**再手写 images，否则两处打架。挂到哪个 URL 上由构建期决定，
 * 换域名不用动这里的代码 —— 它依赖 metadataBase（见 lib/site.ts）。
 *
 * 画法与那几条取舍（为什么不用像素字体、为什么只写英文）都在 lib/og-image.tsx 里。
 */
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage();
}
