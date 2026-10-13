/**
 * 像素图标。
 * 全部用整数坐标的 <rect> 拼，配 shapeRendering="crispEdges"，
 * 放大后是硬边方块而不是抗锯齿曲线 —— 和整体像素风一致。
 *
 * ⚠️⚠️ 渲染尺寸（`size`）**必须 = viewBox 的 16**（或者它的整数倍 32）—— 别传 13 / 14
 * 这种数。原因（2026-10-13 踩过）：viewBox 里的每根线都是 **1 单位宽**，一旦 `size` 不是
 * 16 的整数倍，缩放比就成了小数（13/16 = 0.8125），在 **DPR = 1** 的显示器上
 * （2K / 1080p 桌面屏基本都是 100% 缩放）每根线只剩 0.8125 物理像素，
 * 配上 `crispEdges` 会被吸附、甚至整条丢掉 —— 表现就是用户说的
 * 「右侧按钮组的图标很多细线都看不到」。DPR ≥ 1.5 的屏（4K 高缩放）物理像素够多，
 * 所以只在 2K 及以下才露馅。传 16 时 1 单位 = 1 物理像素，线条干净实心。
 *
 * 也就是说：**改 `size` 之前先想清楚缩放比是不是整数**，否则线条粗细会随屏而变。
 *
 * ⚠️ **最小线宽 2px**（2026-10-13 统一）：除了 `PlayersIcon` 头顶那三道信号，viewBox 里
 * 所有细线都画在 **2px 以上**。1px 在 1x 屏上就是一根「若有若无」的线，用户会直接反馈
 * 「细线看不到」—— 空心框一律四条边各 2px，别图省事写 1px。
 */

interface IconProps {
  size?: number;
}

export function SunIcon({ size = 16 }: IconProps) {
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
export function MoonIcon({ size = 16 }: IconProps) {
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
export function ExpandIcon({ size = 16 }: IconProps) {
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
 *
 * ⚠️ 这是全文件**唯一保留 1px 线**的地方（2026-10-13 统一到 2px 时的例外）：
 * 三道信号是隔行画的，1px 线改 2px 就会互相压上、糊成一个实心三角 —— 加粗这条路走不通。
 * 想让它更清楚只能**减少条数**（两道更宽的弧），但那样就没了「由宽到窄」的层次，所以保持。
 */
export function PlayersIcon({ size = 16 }: IconProps) {
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
      <rect x="0" y="11" width="5" height="2" />
      <rect x="1" y="13" width="3" height="3" />
      {/* 右玩家 */}
      <rect x="12" y="8" width="3" height="3" />
      <rect x="11" y="11" width="5" height="2" />
      <rect x="12" y="13" width="3" height="3" />
    </svg>
  );
}

/**
 * 游戏手柄：一块**空心外壳** + 左侧一个十字键 + 右侧两颗面键。表示「自定义按键」那颗钮。
 *
 * 2026-10-13 换掉了原来的键盘图标（外框 + 一排键帽）。理由：
 *   · 这颗钮管的是**按键**，而这屋子里的按键**本来就分手柄和键盘两条路** ——
 *     键位面板里「手柄钮名（B / A / Y / X…）」和「键盘键名」是并列的两套（见 lib/keybindings.ts）。
 *     画个键盘等于只说了其中一半，还容易让人以为「这里只能改键盘」。
 *   · 手柄才是这台机器的主角（地板、掌机、掌机功能排都用它），一眼就知道是「管按键的」。
 *   · 键盘那套造型（外框 + 键帽 + 空格）和 StoreIcon / ShieldIcon 的方框也太像，一排钮挨着放容易混。
 *
 * 为什么是**空心外壳**：实心块在这个尺寸会糊成一坨（和下面那几个方框图标同一个理由）。
 * 四条边各 **2px**，内区正好 10×6px 放下十字键和两颗钮（线宽规矩见文件头）。
 * 十字键四周留 1px 不贴边框，两颗面键斜排（右下那颗离右边框留 1px）。
 */
export function GamepadIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* 外壳：四条边拼空心框（各 2px） */}
      <rect x="1" y="3" width="14" height="2" />
      <rect x="1" y="11" width="14" height="2" />
      <rect x="1" y="3" width="2" height="10" />
      <rect x="13" y="3" width="2" height="10" />
      {/* 十字键（左）：一竖一横拼十字，上下左右各留 1px 缝 */}
      <rect x="4" y="6" width="2" height="4" />
      <rect x="3" y="7" width="4" height="2" />
      {/* 两颗面键（右）：斜排 2×2 */}
      <rect x="8" y="6" width="2" height="2" />
      <rect x="10" y="8" width="2" height="2" />
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
 * 现在这版走的是**轮廓**、不是毛的细节：柄占 8 格（细长、是主体）→ 扎带 4 格 →
 * 刷头是一整块（6 格宽收到 8 格宽，**实心、不分股、底边平直**）。
 * 扫帚在图标尺寸下靠「长柄 + 矮胖扇形头」说话 —— 底边平直正是扫帚毛被地面压平的样子。
 * 谁要再改：**别加竖缝**（一细就成叉子），**别让刷头再长**（一长就成拖把）。
 */
export function BroomIcon({ size = 16 }: IconProps) {
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
      <rect x="7" y="0" width="2" height="8" />
      {/* 扎带：柄和刷头的交接处，比柄宽一档（2px，原来是 1px 太细） */}
      <rect x="6" y="8" width="4" height="2" />
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
export function MinimalIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* 外壳：四条边拼一个空心框（2px），实心块会糊成一坨 */}
      <rect x="1" y="3" width="14" height="2" />
      <rect x="1" y="10" width="14" height="2" />
      <rect x="1" y="3" width="2" height="9" />
      <rect x="13" y="3" width="2" height="9" />
      {/* 屏幕 */}
      <rect x="3" y="5" width="10" height="5" />
      {/* 底座：一根细颈 + 一块底板 */}
      <rect x="7" y="12" width="2" height="2" />
      <rect x="4" y="14" width="8" height="2" />
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
 *
 * 2026-10-13：外壳四边 + 底板的 1px 线加粗到 **2px**（1px 在 1x 屏上太细）。
 * 外壳一粗，内区只剩 10px 宽，原来 3px 宽的柱子会顶到右沿 —— 所以柱子收到 **2px**、
 * 间距拉开到 3px，排出来反而更像柱状图（三根 3px 柱会连成一片）。
 */
export function TvSizeIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* 外壳：四条边拼空心框（2px），实心块在这个尺寸会糊成一坨 */}
      <rect x="1" y="1" width="14" height="2" />
      <rect x="1" y="10" width="14" height="2" />
      <rect x="1" y="1" width="2" height="11" />
      <rect x="13" y="1" width="2" height="11" />
      {/* 屏幕里的三格阶梯：矮 / 中 / 高，底边都落在外壳下沿上 */}
      <rect x="3" y="8" width="2" height="2" />
      <rect x="7" y="6" width="2" height="4" />
      <rect x="11" y="4" width="2" height="6" />
      {/* 底座：一根细颈 + 一块底板 */}
      <rect x="7" y="12" width="2" height="2" />
      <rect x="4" y="14" width="8" height="2" />
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
 * 店面画成**空心框**（实心块在这个尺寸会糊成一坨，和 GamepadIcon / NoteIcon 同一个理由）；
 * 门是实心块，因为它是「门板」而不是外壳。
 *
 * 2026-10-13：扇贝下沿、左右墙、下沿的 1px 线全部加粗到 **2px**（1px 在 1x 屏上太细）。
 * 扇贝因此从「3 片各 4 格宽、隔 2 格」保持原样 —— 4 格宽 2 格高还是看得清的三片，
 * 别再加宽（再宽就接上、变成第二条实心雨棚）。
 */
export function StoreIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* 雨棚：横贯整幅的实心带，3 格厚 */}
      <rect x="0" y="0" width="16" height="3" />
      {/* 扇贝下沿：三片，各 4 格宽、隔 2 格垂下一格（2 格厚） */}
      <rect x="0" y="3" width="4" height="2" />
      <rect x="6" y="3" width="4" height="2" />
      <rect x="12" y="3" width="4" height="2" />
      {/* 店面：只有左右两墙 + 下沿，上沿由雨棚承担（别再加第二条横杠） */}
      <rect x="1" y="5" width="2" height="9" />
      <rect x="13" y="5" width="2" height="9" />
      <rect x="1" y="14" width="14" height="2" />
      {/* 门：居中，落在下沿上。两侧刻意留空墙，不加橱窗 */}
      <rect x="6" y="8" width="4" height="6" />
    </svg>
  );
}

/** 像素问号，表示「按键说明」。
 *
 * ⚠️ 这个问号**本来就画在 2px 上**（和 `ExpandIcon` 一样，没有 1px 细线）—— 2026-10-13
 * 用户反馈「说明图标还有很细的线条」，实际是 2px 笔画在 1x 屏上观感仍偏单薄，
 * 于是**又加粗一档到 3px**。别把它当成「和其它图标一样的加粗」改回去：
 * 16px 里 3px 已经是问号能认出来的上限，再粗就成一个实心钩了。
 */
export function HelpIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x="3" y="1" width="10" height="3" />
      <rect x="10" y="4" width="3" height="4" />
      <rect x="6" y="8" width="7" height="3" />
      <rect x="7" y="11" width="3" height="2" />
      <rect x="7" y="14" width="3" height="2" />
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
 * 封面是四条边拼的空心框（实心块在这个尺寸会糊成一坨，和 GamepadIcon 同一个理由）。
 *
 * 2026-10-13：封面框、三道线圈、三行字的 1px 线全部加粗到 **2px**（1px 在 1x 屏上太细）。
 * 线圈因此从「探出一格」变成 2 格高，三行字也各占 2 行 —— 内区还剩 9 行，排得下。
 */
export function NoteIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* 封面：四条边拼空心框（2px） */}
      <rect x="4" y="2" width="10" height="2" />
      <rect x="4" y="13" width="10" height="2" />
      <rect x="4" y="2" width="2" height="13" />
      <rect x="12" y="2" width="2" height="13" />
      {/* 左侧线圈：三道，往封面外探出（2px） */}
      <rect x="2" y="4" width="2" height="2" />
      <rect x="2" y="7" width="2" height="2" />
      <rect x="2" y="10" width="2" height="2" />
      {/* 里面三行字（写过的痕迹，2px） */}
      <rect x="7" y="5" width="5" height="2" />
      <rect x="7" y="8" width="5" height="2" />
      <rect x="7" y="11" width="3" height="2" />
    </svg>
  );
}

/**
 * 盾牌里放着一页条款，表示「隐私政策」——菜单里那一行的图标
 * （见 ConsoleScene 的小屏抽屉；它右侧的「服务条款」是 `ScrollIcon`）。
 *
 * 为什么是盾牌：这两页是**法务文档**，而 16px 里能表达「条款 / 政策」的现成符号只有两个
 * ——盾牌和纸。纸这条路走不通：地板上那张纸（`pxc-paper` 那套）和 `NoteIcon`（线圈本）
 * 已经把「纸」这个形状占掉了，再画一张只会和它们撞脸（扫帚换掉 MinimalIcon 就是踩过这个坑）。
 *
 * 盾牌**刻意画成空心轮廓**：实心块在这个尺寸会糊成一坨（和 GamepadIcon / StoreIcon 的
 * 店面同一个理由）。下半段靠**阶梯收窄**收成一个尖 —— 用 1px 的斜线画不出「盾」，
 * 像素画里斜边只能用台阶。
 *
 * 里面那三条横线是「有内容的文档」，而不是一个空壳：
 * 横线**水平对齐像素行**，是 16px 里唯一不会糊的填充方式（竖线看着像一道裂缝，
 * 对勾要用 4 块 2×2 斜着拼、13px 下会连成一团，都试过）。第三条短一截，像一段没写满的正文。
 *
 * 2026-10-13：轮廓 / 台阶 / 三行字的 1px 线全部加粗到 **2px**。台阶因此变成「每级 2 格宽、
 * 只错 1 格」—— 相邻两级重叠 1 格，斜边才连得上（错 2 格会露出断开的一格）。
 * 盾里三行也涨到 2 行高，第三行往右缩 1 格躲开台阶。
 */
export function ShieldIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* 轮廓：顶部平边 + 两侧竖边（上半段是直的），2px */}
      <rect x="2" y="1" width="12" height="2" />
      <rect x="2" y="1" width="2" height="6" />
      <rect x="12" y="1" width="2" height="6" />
      {/* 下半段左右各三级台阶，收到中间成一个尖（2px） */}
      <rect x="3" y="7" width="2" height="2" />
      <rect x="4" y="9" width="2" height="2" />
      <rect x="5" y="11" width="2" height="2" />
      <rect x="11" y="7" width="2" height="2" />
      <rect x="10" y="9" width="2" height="2" />
      <rect x="9" y="11" width="2" height="2" />
      <rect x="6" y="13" width="4" height="2" />
      {/* 盾里的三行「条款」 */}
      <rect x="5" y="3" width="6" height="2" />
      <rect x="5" y="6" width="6" height="2" />
      <rect x="6" y="9" width="4" height="2" />
    </svg>
  );
}

/**
 * 一个人头，表示「账号」—— 点它开用户面板（登录 / 注册 / 退出）。
 *
 * 为什么是一个头肩剪影而不是别的：16px 里能表达「账号」的形状就那么几个，
 * 而这个是最经得住缩放的 —— 一个圆（头）+ 一段肩（梯形台阶），
 * 没有字母也没有细节，糊不掉。
 *
 * ⚠️ 头**画成空心环**（上下各一条 2px 横线 + 左右各一条 2px 竖线，四角留空）。
 * 实心圆在这个尺寸就是一个方疙瘩，和 `StoreIcon` / `GamepadIcon` 那边同理。
 *
 * 肩用**两级台阶**收边（像素画里斜边只能这么画），和 `ShieldIcon` 下半段同一套做法。
 * 整块**不封口**（左右两侧不收边）—— 封上就成了一个盒子，看不出是肩膀。
 */
export function UserIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* 头：空心方环（四角留空，看着更圆一点） */}
      <rect x="5" y="2" width="6" height="2" />
      <rect x="4" y="4" width="2" height="4" />
      <rect x="10" y="4" width="2" height="4" />
      <rect x="5" y="8" width="6" height="2" />
      {/* 颈：一小段，把头和肩连起来 */}
      <rect x="6" y="10" width="4" height="2" />
      {/* 肩：两级台阶往两侧张开 */}
      <rect x="4" y="12" width="8" height="2" />
      <rect x="2" y="14" width="12" height="2" />
    </svg>
  );
}

/**
 * 警告三角：**实心**三角 + 中间一个反色的感叹号。用在「这一步会丢东西」的提示上
 * （目前唯一用处是「离开房间」确认框）。
 *
 * 颜色由调用处给 —— 图标本身只吃 `currentColor`，警告场合套一层 `text-warn` 即可。
 *
 * ⚠️ 两处和别的图标不一样，别顺手统一：
 *   · 感叹号是**写死的近黑** `#08080a`（就是深色主题的 ink-950 那个值），**不走 currentColor**。
 *     黄底上必须是反色才读得出；而 `ink-950` 是会跟主题翻的，浅色主题下它接近白，
 *     白压黄几乎看不见 —— 所以只能写死。「三角一色 + 记号反色」本来也是这个符号的惯例。
 *   · 三角是**实心**的（别的图标以空心轮廓为主）。它就该是一块实心警示牌，
 *     而且实心才撑得住中间那根反色感叹号 —— 这里没有「实心会糊成一坨」的问题。
 *
 * 几何：底边 14 格、每级 2 格高、每级两侧各外扩 1 格 → 45° 斜边正好落在像素格上，
 * 配 crispEdges 是干净的台阶。感叹号走**竖直**的 2 格宽（16px 里唯一不会糊的填充方式），
 * 竖条与点之间留 1 格缝 —— 那是留白不是线，不受文件头那条「最小线宽 2px」约束。
 */
export function WarningIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* 三角：实心，顶点在上，每级 2 格高、两侧各外扩 1 格 */}
      <rect x="7" y="1" width="2" height="2" />
      <rect x="6" y="3" width="4" height="2" />
      <rect x="5" y="5" width="6" height="2" />
      <rect x="4" y="7" width="8" height="2" />
      <rect x="3" y="9" width="10" height="2" />
      <rect x="2" y="11" width="12" height="2" />
      <rect x="1" y="13" width="14" height="2" />
      {/* 感叹号：一竖 + 一点，写死反色 */}
      <rect x="7" y="6" width="2" height="4" fill="#08080a" />
      <rect x="7" y="11" width="2" height="2" fill="#08080a" />
    </svg>
  );
}

/**
 * 地球：一个像素圆 + 赤道 + 一条经线。菜单里「语言」那一行用它（2026-10-13 加）。
 *
 * ⚠️ 这里原来画的是**汉堡三条横线**（`MenuIcon`），2026-10-13 那颗钮改成
 * 「开着时变成叉号」之后删了 —— 三横要能变叉、得能**逐条动起来**，
 * 那已是「一个会动的控件」而不是一张静态图形，所以搬去了 ConsoleScene（`MenuGlyph`）。
 * 别在图标文件里再补一个只画三横的静态版本。
 *
 * 圆的画法就是像素画唯一可行的那套：上下两条横杆 + 左右两根竖杆 + 四个角上的台阶方块。
 * 四条边**故意不连成闭环**，四个斜角各留一个缺口 —— 补齐了就成了方块，看不出是球。
 * 线一律 2px（文件头那条规矩）。
 */
export function GlobeIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* 外圈：上下横杆 + 左右竖杆 */}
      <rect x="4" y="1" width="8" height="2" />
      <rect x="4" y="13" width="8" height="2" />
      <rect x="1" y="4" width="2" height="8" />
      <rect x="13" y="4" width="2" height="8" />
      {/* 四个角上的台阶，把方角收成圆的 */}
      <rect x="2" y="2" width="2" height="2" />
      <rect x="12" y="2" width="2" height="2" />
      <rect x="2" y="12" width="2" height="2" />
      <rect x="12" y="12" width="2" height="2" />
      {/* 赤道 + 经线：球面上那两条最认得出的线 */}
      <rect x="3" y="7" width="10" height="2" />
      <rect x="7" y="2" width="2" height="12" />
    </svg>
  );
}

/**
 * 卷轴：上下两条通栏的卷轴杆、中间一块窄一些的纸身，纸上两行字。
 * 菜单里「服务条款」那一行用它（2026-10-13 加）。
 *
 * 为什么用卷轴而不是再画一张纸：`ShieldIcon`（隐私那一行）本身就是
 * 「盾牌 + 三行字」的文档造型，同一个菜单里再放一页普通的纸，两张图会一眼看着一样；
 * 卷轴那两条横杆是别的图标里没有的形状，隔着一行也分得开。
 * （`NoteIcon` 那个线圈本是给「留言本」的，更不能借。）
 *
 * ⚠️ 和 `ShieldIcon` 同一个坑：两行字是**水平对齐像素行**的横条，
 * 别改成一竖一横或者一条长一条短 —— 16px 里那样会糊成一团。
 */
export function ScrollIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* 上下的卷轴杆 */}
      <rect x="1" y="2" width="14" height="3" />
      <rect x="1" y="11" width="14" height="3" />
      {/* 纸身的左右两条边 */}
      <rect x="3" y="5" width="2" height="6" />
      <rect x="11" y="5" width="2" height="6" />
      {/* 纸上的两行字 */}
      <rect x="6" y="6" width="4" height="2" />
      <rect x="6" y="9" width="4" height="2" />
    </svg>
  );
}

/**
 * 一栋房子，表示「首页」—— 回落地页（`/`）。
 *
 * 和别的图标同一个坑：16px 里要同时放下「屋顶 / 墙 / 门」三样，屋顶只能用
 * **三级阶梯**（4 → 8 → 12 宽）画，画成真斜线会糊成一团。
 * 门画成 4×4 的实心块 —— 2px 宽的门在这个尺寸里像一根柱子，不像门。
 */
export function HomeIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* 屋顶：三级阶梯（顶点 → 檐） */}
      <rect x="6" y="1" width="4" height="2" />
      <rect x="4" y="3" width="8" height="2" />
      <rect x="2" y="5" width="12" height="2" />
      {/* 左右两面墙 */}
      <rect x="2" y="7" width="2" height="8" />
      <rect x="12" y="7" width="2" height="8" />
      {/* 地面 */}
      <rect x="4" y="13" width="8" height="2" />
      {/* 门 */}
      <rect x="6" y="9" width="4" height="4" />
    </svg>
  );
}

/**
 * 一支**从开口的托盘里升出来的箭头**，表示「分享」——详情页那条安静文字链接的头像
 * （2026-10-13 加，用户要「增加图标」）。
 *
 * 为什么不是那套「三个圆点用斜线连起来」的经典分享图：16px 里那两根连线**全是斜的**，
 * 像素画只能拿台阶凑；每个点又要 4×4 才认得出是「点」——最后整张图是一团斜方块
 * （和 `ShieldIcon` 下半段、`HomeIcon` 屋顶踩的是同一个坑）。
 * 而「一竖箭头 + 一个托盘」**每一根线都对齐像素格**，缩到 16px 一个格都不会糊，
 * 这正是本文件一贯的取舍（见文件头那条最小线宽）。
 *
 * 几何：箭尖 4 格 → 底座 8 格 → 2 格宽的杆；托盘是左右两墙 + 一块底。
 * ⚠️ 托盘**上口必须留开**（两墙从箭杆两侧才起头），封上就成了一个「往箱子里收」的
 * 下载箱，语义正好反了 —— 它要讲的是「从这儿发出去」。
 * 箭杆与托盘内沿各留 2 格缝（杆在 x=7..8，两墙在 x=2..3 / 12..13），不贴边。
 */
export function ShareIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* 箭尖：4 格 → 8 格两级，杆 2 格 */}
      <rect x="6" y="1" width="4" height="2" />
      <rect x="4" y="3" width="8" height="2" />
      <rect x="7" y="5" width="2" height="5" />
      {/* 托盘：左右两墙 + 底，上口留开给箭头 */}
      <rect x="2" y="8" width="2" height="6" />
      <rect x="12" y="8" width="2" height="6" />
      <rect x="2" y="12" width="12" height="2" />
    </svg>
  );
}

/**
 * 一个**对话气泡，里头一个感叹号**，表示「反馈问题」——详情页另一条安静文字链接的头像
 * （2026-10-13 加）。
 *
 * 这一格要同时说清两件事：「这是给人留言」和「是个问题」。
 *   · 光画 `WarningIcon` 那个三角 —— 只剩「警告」，跟「反馈」没关系，而且两颗钮挨着放
 *     会直接撞脸（`GamepadIcon` 换掉 `KeyboardIcon` 就是踩过这个坑）。
 *   · 光画一个气泡 —— 那只是个「留言」，说不出「出问题了」。
 * 于是**气泡负责「反馈」、里头的感叹号负责「有问题」**，两件事一块说完。
 *
 * `!` 走**竖条 + 一点**（16px 里唯一不会糊的填充方式，同 `WarningIcon` 那个）：
 * 竖条 3 行、空 1 行、点 2 行，上下各留 1 行喘气（别贴着气泡内壁）。
 * 气泡本身是**空心方框**（实心块在这个尺寸会糊成一坨，同 `StoreIcon` / `GamepadIcon`）；
 * 左下角拖一条**两级台阶**的尾巴 —— 斜尾巴画不出来，只能一格格收（同 `ShieldIcon` 下半段）。
 */
export function ReportIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* 气泡：四条边拼空心框（各 2px） */}
      <rect x="2" y="0" width="12" height="2" />
      <rect x="2" y="0" width="2" height="12" />
      <rect x="12" y="0" width="2" height="12" />
      <rect x="2" y="10" width="12" height="2" />
      {/* 左下拖出来的尾巴：两级台阶 */}
      <rect x="4" y="12" width="4" height="2" />
      <rect x="4" y="14" width="2" height="2" />
      {/* 里头的感叹号：竖条 + 一点（上下各留 1 行，别贴着内壁） */}
      <rect x="7" y="3" width="2" height="3" />
      <rect x="7" y="7" width="2" height="2" />
    </svg>
  );
}

