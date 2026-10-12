'use client';

import { useI18n } from './I18nProvider';
import type { PixelPainting } from './RoomBackdrop';

/**
 * 墙上那幅画点开之后的大图：**画框 + 画面 + 一块说明牌（画名 / 作者）**。
 *
 * 2026-10-12 用户要求：「点击可以查看当前画的大图，配上作者和画名字」。
 *
 * 两件事值得写下来：
 *
 * ① **画面直接放大同一份笔画数据**（`painting.strokes`），不是另画一张大的 ——
 *    画布就那十几格宽，`<svg viewBox>` 不管放多大都是同一张矢量，配 `crispEdges`
 *    放大后依旧是硬边方块。墙上那幅和这里这一幅，数据同源、**不可能对不上**。
 *
 *    **例外**：第七幅（用户自己那张照片）另配了一张更细的位图（`painting.detail`），
 *    大图换它、墙上不动 —— 为什么这么干见 `RoomBackdrop.tsx` 的 `PixelPainting.detail` 注释。
 *
 * ② **高度卡在 `50vh`**，宽度吃满卡片：于是竖构图那几幅会被高度先卡住、左右两侧
 *    留出卡纸的白边，横构图那几幅则顶满宽度。`preserveAspectRatio` 走默认的
 *    `xMidYMid meet`（等比 + 居中），**不会把画拉变形** —— 那圈白边正好就是画框的卡纸。
 *
 * 说明牌用**米黄纸 + 深棕字**（和地上那张纸片同一套色，`pxc-paper` 的描边也是）：
 * 画框那边已经是深色木框了，牌子再深就看不清字。两行都走 `font-pixel` ——
 * 英文是真像素字，中文没有像素字模、掉回系统字体（和屋里别的文案同一个取舍）。
 *
 * ⚠️ 背板用**固定暗色**，不走 `bg-ink-950/70`（别的面板那套）：ink-950 会随主题翻，
 * 浅色主题下它是近白，45% 叠上去整屏是一片白雾。看画本来就该把屋子压暗。
 */
export default function PaintingPanel({
  painting,
  onClose,
}: {
  /** 墙上正挂着的那一幅 —— 由 ConsoleScene 从 `PAINTINGS` 里取，和墙上那份是同一个对象 */
  painting: PixelPainting;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const title = t(painting.titleKey);
  const artist = t(painting.artistKey);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6 py-8"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-[#0b0b10]/60 backdrop-blur-[3px]" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-full w-[420px] max-w-full flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 画框：和墙上那幅同一个色号（木框 → 更暗的卡槽 → 米色卡纸） */}
        <div className="pixel-edge pxw-4 pxc-500 w-full bg-[#3a2f26] p-[10px]">
          <div className="bg-[#f4f1e8] p-[12px]">
            {/*
              画面有两条来源，二选一：

              ① 默认 —— 直接放大墙上那份笔画数据（`painting.strokes`），`crispEdges` 放大后
                 仍是硬边方块。墙上那几幅都走这条，数据同源、不可能对不上。
              ② 这幅画另配了一张**更细的**位图（`painting.detail`，见 PixelPainting 那段注释）：
                 用户对自己那张照片提过「点开看大图时高清一点」—— 十几格的粗颗粒放大后认不出人，
                 所以换一张 90×96 的同款像素图（墙上那版的整 6 倍）。**只换大图，墙上仍是粗的那版。**

              两条路的定尺寸方式一样：宽度吃满、高度卡 `50vh`，`object-contain` / 
              `preserveAspectRatio` 负责等比 —— 竖构图那几幅左右多出来的就是卡纸。
              `[image-rendering:pixelated]` 是位图那条的关键：不加的话浏览器会双线性插值，
              细颗粒被糊回一团模糊，白瞎了这张细图。
            */}
            {painting.detail ? (
              // 画本身是装饰，可读的名字在下面那块说明牌上；这里走 <img> 不走 next/image
              // （静态图没必要过优化管线，而且它会把小图重新编码、毁掉像素颗粒）。
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={painting.detail}
                alt=""
                className="block h-auto max-h-[50vh] w-full object-contain [image-rendering:pixelated]"
              />
            ) : (
              <svg
                viewBox={`0 0 ${painting.w} ${painting.h}`}
                className="block h-auto max-h-[50vh] w-full"
                shapeRendering="crispEdges"
              >
                {painting.strokes.map(([x, y, w, h, fill], i) => (
                  <rect key={i} x={x} y={y} width={w} height={h} fill={fill} />
                ))}
              </svg>
            )}
          </div>
        </div>

        {/*
          说明牌：画名一行、作者一行。右侧那颗 × 用 `absolute` 钉在中间高度上 ——
          画名可能折成两行，牌子高度不固定，所以不能用 flex 行内对齐。
          `px-12` 两侧留一样的宽度，文字才真的居中（只留右边会被 × 推歪）。
        */}
        <div className="pixel-edge pxw-2 pxc-paper relative w-full bg-[#e8dcbd] px-12 py-3 text-center">
          <p className="font-pixel text-[12px] leading-[1.8] break-words text-[#3b3327]">
            {title}
          </p>
          <p className="font-pixel mt-2 text-[10px] leading-[1.7] break-words text-[#6b5c3c]">
            {artist}
          </p>

          <button
            type="button"
            aria-label={t('painting.close')}
            onClick={onClose}
            className="absolute right-[10px] top-1/2 flex h-[22px] w-[22px] -translate-y-1/2 items-center justify-center bg-[#d6c69e] text-[13px] leading-none text-[#6b5c3c] transition-colors hover:bg-[#3b3327] hover:text-[#e8dcbd]"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
