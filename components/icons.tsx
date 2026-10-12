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

/**
 * 两个并肩站着的半身玩家 + 头顶一道信号，表示「联机对战」。
 *
 * 为什么是这两块拼一起：光画两个人只会读成「好友 / 群组」（试过，看不出是联机），
 * 光画两个方块加根线又读成「设备/网络」（也试过，没有人的感觉）。所以一块负责「多人」
 * ——两个小人（头 / 肩 / 上身，肩比身宽一档才有肩膀）、一块负责「在线」——头顶三道
 * 由宽到窄的横杠加一个点，是各路像素 UI 里通用的信号写法。
 *
 * 信号三条**隔行画**（留 1px 空档），不然会糊成一个实心三角。两人各 5 格宽、中间空
 * 5 格，头顶的信号正好落在空档上方，谁也不压谁。
 */
export function PlayersIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* 头顶信号：由宽到窄的三道弧 + 一个信号点 */}
      <rect x="4" y="0" width="8" height="1" />
      <rect x="5" y="2" width="6" height="1" />
      <rect x="6" y="4" width="4" height="1" />
      <rect x="7" y="6" width="2" height="1" />
      {/* 左玩家 */}
      <rect x="1" y="8" width="3" height="3" />
      <rect x="0" y="12" width="5" height="1" />
      <rect x="1" y="13" width="3" height="3" />
      {/* 右玩家 */}
      <rect x="12" y="8" width="3" height="3" />
      <rect x="11" y="12" width="5" height="1" />
      <rect x="12" y="13" width="3" height="3" />
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
 * 一把扫帚（细长柄 + 一块矮胖的扇形刷头），表示「简洁模式」——
 * 点下去等于把屋里的杂物「扫掉」，只留背景墙、电视机、桌子和地面。
 *
 * 2026-10-12 换掉了原来的 `MinimalIcon`（一台孤零零的电视机）：那台读出来是
 * 「这儿有台电视」，而紧挨着的下一颗「电视机大小」画的**也是一台电视**（只是尺寸不同），
 * 两颗钮挨着放，谁也说不清哪个是哪个。扫帚讲的是**动作**（清扫），正好对上这颗钮干的事。
 *
 * ⚠️ 这个形状连改两版都被否，两版踩的是**两个相反的坑**，别再往任何一边偏：
 *   · 一版「像个拖把」—— 刷毛又宽又长、从上往下越散越开、毛尖参差。
 *     那是**一坨向下散开的软布条**。教训：刷毛不能抢成主体，底边不能参差。
 *   · 二版「像个叉子」—— 刷毛改成等宽的一片、末端分三根 2px 的细股。
 *     那是**三根细齿**。教训：16px 里「分股」这条路根本走不通。
 *
 * 现在这版走的是**轮廓**、不是毛的细节：柄占 9 格（细长、是主体）→ 扎带 4 格 →
 * 刷头是一整块（6 格宽收到 8 格宽，**实心、不分股、底边平直**）。
 * 扫帚在图标尺寸下靠「长柄 + 矮胖扇形头」说话 —— 底边平直正是扫帚毛被地面压平的样子。
 * 谁要再改：**别加竖缝**（一细就成叉子），**别让刷头再长**（一长就成拖把）。
 */
export function BroomIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* 柄：细长一根，占掉上半部分 */}
      <rect x="7" y="0" width="2" height="9" />
      {/* 扎带：柄和刷头的交接处，比柄宽一档 */}
      <rect x="6" y="9" width="4" height="1" />
      {/* 刷头：一整块，从上往下只加宽一档，不分股 */}
      <rect x="5" y="10" width="6" height="2" />
      <rect x="4" y="12" width="8" height="4" />
    </svg>
  );
}

/**
 * 一台孤零零的电视机（外壳 + 屏幕 + 底座），**原来是「简洁模式」的图标**。
 *
 * 2026-10-12 起右侧那颗钮换成了 `BroomIcon`（理由见那边：和「电视机大小」撞脸），
 * 所以这个图标目前**没有调用方** —— 留着待定，别当成死代码删掉：
 * 「点下去只剩一台电视」这个说法本身是准的，哪天需要「回到客厅 / 恢复默认场景」
 * 之类的钮，它还能直接用。
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

/**
 * 一台**屏幕里带着三格尺寸阶梯**的电视机，表示「电视机大小」——
 * 点它会在左边弹出「大 / 中 / 小」的选择器（见 ConsoleScene 那颗钮）。
 *
 * 为什么是「阶梯」：三档尺寸在 16px 里没有别的好画法。
 * 第一版画的是**三台大小不同的电视机**（同一形状按档位缩放），用户当场否掉
 * （原话「电视机这个控制大小的图标换一下」）—— 三台空心电视叠在 13px 上糊成一团，
 * 而且图标**跟着档位变形**，看着像坏了。
 * 现在**外壳固定、屏幕里画三根递增的实心柱**：一眼就是「有三个档位」，
 * 也不再随当前档位变形（当前是哪一档由选择器里那条高亮说）。
 *
 * 柱子**底边对齐**（都收在外壳下沿上），像一张柱状图 —— 竖着看就是「一档比一档大」。
 * 屏幕里画实心柱、而不是「实心屏幕 + 柱」：单色图标里，实心屏幕上的柱子是同色的，看不见。
 *
 * 和 `MinimalIcon`（一台孤零零的电视）刻意画得不一样：那台屏幕是整块实心、没有别的东西。
 * 也别画成一排高矮不齐的竖条 + 一条底板（原来是 `LibraryIcon` 的卡带架，2026-10-12 已换成
 * `StoreIcon`）—— 那种形状外面没有外壳，和这台一眼就分得开。
 */
export function TvSizeIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* 外壳：四条边拼空心框，实心块在这个尺寸会糊成一坨 */}
      <rect x="1" y="2" width="14" height="1" />
      <rect x="1" y="11" width="14" height="1" />
      <rect x="1" y="2" width="1" height="10" />
      <rect x="14" y="2" width="1" height="10" />
      {/* 屏幕里的三格阶梯：矮 / 中 / 高，底边都落在外壳下沿上 */}
      <rect x="3" y="9" width="3" height="2" />
      <rect x="7" y="7" width="3" height="4" />
      <rect x="11" y="5" width="3" height="6" />
      {/* 底座：一根细颈 + 一块底板 */}
      <rect x="7" y="12" width="2" height="2" />
      <rect x="4" y="14" width="8" height="1" />
    </svg>
  );
}

/**
 * 一家小店（雨棚 + 店面 + 门），表示「在线游戏库」。
 *
 * 2026-10-12 换掉了原来的 `LibraryIcon`（一排立在架子上的卡带）：这颗钮点开的是
 * **在线商店式的游戏库**，店面比卡带架更直白。
 *
 * 为什么是「雨棚」而不是「三角屋顶」：三角屋顶会读成「房子 / 家」，而商店的标志是
 * **雨棚那条扇贝形的下沿** —— 这也是 16px 里唯一能把二者分开的特征。
 *
 * ⚠️ 这一版是**被用户连否两轮**之后定下来的，两个坑都别再踩：
 *   · **顶上两条横杠**（第一版）：雨棚（2 格）+ 店面自己的上沿（1 格），中间只隔一排
 *     细碎的扇贝 —— 13px 下糊成一条粗黑带。现在**店面不画上沿**，雨棚就是屋顶；
 *     雨棚加厚到 3 格，扇贝从「4 片 2 格」改成「3 片 4 格」（片少而宽，
 *     缩到 13px 才不会退化成梳齿）。
 *   · **两侧的橱窗**（第二版）：门 4×7 + 左右对称两扇 3×4 的窗，13px 下底部挤成
 *     一排三个黑块。用户原话「雨棚加门就行 不要两侧的小窗」→ **只留门**，
 *     店面回归「一块空墙 + 一扇门」。
 *
 * 店面画成**空心框**（实心块在这个尺寸会糊成一坨，和 KeyboardIcon / NoteIcon 同一个理由）；
 * 门是实心块，因为它是「门板」而不是外壳。
 */
export function StoreIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* 雨棚：横贯整幅的实心带，3 格厚 —— 缩到 13px 也就 2.4px，再薄就成一条线了 */}
      <rect x="0" y="0" width="16" height="3" />
      {/* 扇贝下沿：三片，各 4 格宽、隔 2 格垂下一格 */}
      <rect x="0" y="3" width="4" height="1" />
      <rect x="6" y="3" width="4" height="1" />
      <rect x="12" y="3" width="4" height="1" />
      {/* 店面：只有左右两墙 + 下沿，上沿由雨棚承担（别再加第二条横杠） */}
      <rect x="1" y="4" width="1" height="12" />
      <rect x="14" y="4" width="1" height="12" />
      <rect x="1" y="15" width="14" height="1" />
      {/* 门：居中，落在下沿上。两侧刻意留空墙，不加橱窗 */}
      <rect x="6" y="8" width="4" height="7" />
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

/**
 * 线圈本，表示「留言本」。
 *
 * 和地板上那本（`RoomFloorItems`：亮青封面 + 左侧线圈 + 白色标签）是同一个东西，
 * 但图标是单色的、16px 里也铺不下封面配色，所以**抓的是它的形状特征**：
 * 左侧三道探出封面的线圈 —— 「本子」和「书 / 列表」就靠这个分。
 * 这也是当初把地板那本从「古书」改成「本子」时用的同一个特征（见 RoomBackdrop）。
 *
 * 封面是四条边拼的空心框（实心块在这个尺寸会糊成一坨，和 KeyboardIcon 同一个理由）。
 */
export function NoteIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* 封面：四条边拼空心框 */}
      <rect x="4" y="2" width="10" height="1" />
      <rect x="4" y="13" width="10" height="1" />
      <rect x="4" y="2" width="1" height="12" />
      <rect x="13" y="2" width="1" height="12" />
      {/* 左侧线圈：三道，往封面外探出一格 */}
      <rect x="2" y="4" width="2" height="1" />
      <rect x="2" y="7" width="2" height="1" />
      <rect x="2" y="10" width="2" height="1" />
      {/* 里面三行字（写过的痕迹） */}
      <rect x="6" y="5" width="5" height="1" />
      <rect x="6" y="8" width="5" height="1" />
      <rect x="6" y="11" width="3" height="1" />
    </svg>
  );
}

/**
 * 盾牌里放着一页条款，表示「隐私政策与服务条款」——
 * 点它会在左边弹出那两页的入口（见 ConsoleScene 组③那颗钮）。
 *
 * 为什么是盾牌：这两页是**法务文档**，而 16px 里能表达「条款 / 政策」的现成符号只有两个
 * ——盾牌和纸。纸这条路走不通：地板上那张纸（`pxc-paper` 那套）和 `NoteIcon`（线圈本）
 * 已经把「纸」这个形状占掉了，再画一张只会和它们撞脸（扫帚换掉 MinimalIcon 就是踩过这个坑）。
 *
 * 盾牌**刻意画成空心轮廓**：实心块在这个尺寸会糊成一坨（和 KeyboardIcon / StoreIcon 的
 * 店面同一个理由）。下半段靠**阶梯收窄**收成一个尖 —— 用 1px 的斜线画不出「盾」，
 * 像素画里斜边只能用台阶。
 *
 * 里面那三条横线是「有内容的文档」，而不是一个空壳：
 * 横线**水平对齐像素行**，是 16px 里唯一不会糊的填充方式（竖线看着像一道裂缝，
 * 对勾要用 4 块 2×2 斜着拼、13px 下会连成一团，都试过）。第三条短一截，像一段没写满的正文。
 */
export function ShieldIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* 轮廓：顶部平边 + 两侧竖边（上半段是直的） */}
      <rect x="2" y="1" width="12" height="1" />
      <rect x="2" y="2" width="1" height="5" />
      <rect x="13" y="2" width="1" height="5" />
      {/* 下半段左右各三级台阶，收到中间成一个尖 */}
      <rect x="3" y="7" width="1" height="2" />
      <rect x="4" y="9" width="1" height="2" />
      <rect x="5" y="11" width="1" height="2" />
      <rect x="12" y="7" width="1" height="2" />
      <rect x="11" y="9" width="1" height="2" />
      <rect x="10" y="11" width="1" height="2" />
      <rect x="6" y="13" width="4" height="1" />
      {/* 盾里的三行「条款」 */}
      <rect x="5" y="4" width="6" height="1" />
      <rect x="5" y="7" width="6" height="1" />
      <rect x="5" y="10" width="4" height="1" />
    </svg>
  );
}
