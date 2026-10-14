'use client';

/**
 * 后台列表共用的加载行：像素风跳帧方点 × 3 + 一行文字。
 *
 * 复用 `globals.css` 的 `.loading-dots` 动画（账号中心 `AccountCenter` 里的
 * `LoadingDot` 同源）—— 像素风里不画圆形 spinner（圆弧是反像素的），
 * 要的是方点硬开硬关的跳帧闪烁。三颗只靠内联 `animationDelay` 错峰
 * （内联样式级联高于 class 里的 `animation` 简写，delay 能生效；
 * globals.css 那条注释「要多颗错峰闪烁时再给 animation-delay」说的就是这个）。
 *
 * `role="status"` + `aria-live="polite"`：读屏用户能听到「载入中」；
 * 方点本身对读屏是噪音，`aria-hidden` 掉，信息由文字承担。
 * 减少动态效果开启时 `.loading-dots` 会被全局停帧（停在全亮），照样可见。
 */
export default function AdminLoading({ label }: { label: string }) {
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-[12px] text-ink-500">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className="loading-dots inline-block h-[6px] w-[6px] bg-accent"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
      <span className="ml-1">{label}</span>
    </p>
  );
}
