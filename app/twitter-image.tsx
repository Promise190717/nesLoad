import { OG_ALT, OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from '@/lib/og-image';

/*
 * twitter:image。
 *
 * X / Twitter 在**没有** twitter:image 时其实会回落到 og:image，理论上这个文件可以不要；
 * 留着是因为回落行为没有进规范、各家抓取器实现也不一致（尤其是缓存旧的卡片）。
 * 与其赌它回落到位，不如显式给一份 —— 代价只是这一个 4 行的转发文件，
 * 画法仍然只有 lib/og-image.tsx 一处。
 */
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage();
}
