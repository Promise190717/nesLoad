/**
 * 像素图标。
 * 全部用整数坐标的 <rect> 拼，配 shapeRendering="crispEdges"，
 * 放大后是硬边方块而不是抗锯齿曲线 —— 和整体像素风一致。
 */

interface IconProps {
  size?: number;
}

export function SunIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x="6" y="6" width="4" height="4" />
      <rect x="7" y="1" width="2" height="3" />
      <rect x="7" y="12" width="2" height="3" />
      <rect x="1" y="7" width="3" height="2" />
      <rect x="12" y="7" width="3" height="2" />
      <rect x="3" y="3" width="2" height="2" />
      <rect x="11" y="3" width="2" height="2" />
      <rect x="3" y="11" width="2" height="2" />
      <rect x="11" y="11" width="2" height="2" />
    </svg>
  );
}

/** 弯月：一个开口朝右的粗 C 形 */
export function MoonIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x="5" y="1" width="4" height="3" />
      <rect x="3" y="3" width="3" height="3" />
      <rect x="2" y="5" width="3" height="6" />
      <rect x="3" y="10" width="3" height="3" />
      <rect x="5" y="12" width="4" height="3" />
    </svg>
  );
}

/** 四角外扩框，表示进入全屏 */
export function ExpandIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="6" height="2" />
      <rect x="2" y="2" width="2" height="6" />
      <rect x="8" y="2" width="6" height="2" />
      <rect x="12" y="2" width="2" height="6" />
      <rect x="2" y="12" width="6" height="2" />
      <rect x="2" y="8" width="2" height="6" />
      <rect x="8" y="12" width="6" height="2" />
      <rect x="12" y="8" width="2" height="6" />
    </svg>
  );
}

/** 两个方块中间一条横杠，表示两台机器连起来 */
export function LinkIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x="1" y="5" width="5" height="6" />
      <rect x="10" y="5" width="5" height="6" />
      <rect x="6" y="7" width="4" height="2" />
    </svg>
  );
}
