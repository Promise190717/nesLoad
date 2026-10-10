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

/**
 * 键盘：一圈 1px 外壳 + 一排键帽 + 一条空格。
 * 用「空心」表达，所以外壳是四条边而不是一个实心块 —— 实心块会糊成一个黑方块。
 */
export function KeyboardIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x="1" y="4" width="14" height="1" />
      <rect x="1" y="11" width="14" height="1" />
      <rect x="1" y="4" width="1" height="8" />
      <rect x="14" y="4" width="1" height="8" />
      <rect x="3" y="6" width="1" height="1" />
      <rect x="5" y="6" width="1" height="1" />
      <rect x="7" y="6" width="1" height="1" />
      <rect x="9" y="6" width="1" height="1" />
      <rect x="11" y="6" width="1" height="1" />
      <rect x="3" y="8" width="1" height="1" />
      <rect x="5" y="8" width="6" height="1" />
      <rect x="12" y="8" width="1" height="1" />
    </svg>
  );
}

/**
 * 一台孤零零的电视机（外壳 + 屏幕 + 底座），表示「简洁模式」——
 * 点下去整间屋子只剩背景墙、电视机、桌子和地面，所以图标就是**那个剩下来的主体**。
 *
 * 和 ExpandIcon（四角外扩）刻意画得不一样：那个是空心四角，这个是实心一台机器。
 */
export function MinimalIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* 外壳：四条边拼一个空心框，实心块会糊成一坨 */}
      <rect x="1" y="3" width="14" height="1" />
      <rect x="1" y="11" width="14" height="1" />
      <rect x="1" y="3" width="1" height="9" />
      <rect x="14" y="3" width="1" height="9" />
      {/* 屏幕 */}
      <rect x="3" y="5" width="10" height="5" />
      {/* 底座：一根细颈 + 一块底板 */}
      <rect x="7" y="12" width="2" height="2" />
      <rect x="4" y="14" width="8" height="1" />
    </svg>
  );
}

/** 一排立在架子上的卡带，表示「游戏库」 */
export function LibraryIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x="1" y="13" width="14" height="1" />
      <rect x="2" y="4" width="3" height="9" />
      <rect x="6" y="2" width="3" height="11" />
      <rect x="10" y="5" width="3" height="8" />
    </svg>
  );
}

/** 像素问号，表示「按键说明」 */
export function HelpIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x="4" y="2" width="8" height="2" />
      <rect x="10" y="4" width="2" height="4" />
      <rect x="6" y="8" width="6" height="2" />
      <rect x="7" y="10" width="2" height="2" />
      <rect x="7" y="13" width="2" height="2" />
    </svg>
  );
}
