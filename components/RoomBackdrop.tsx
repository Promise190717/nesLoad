/*
 * 房间背景：墙 + 电视机后面墙上的一扇窗（窗外有植物，昼夜两套） + 电视机底下那张桌子
 * + 桌前面地板上摊着的杂物（红白机 / 两只手柄 / 几盘黄卡带） + 顶上那盏吊灯。
 *
 * 几块**故意拆开**，因为它们要插在**不同的层**上：
 *
 *   - `RoomWall` 铺满整个房间，必须渲染在 `main` 里、**暗角（.vignette）之前** ——
 *     暗角是 `absolute inset-0` 且排在 stage 前面，靠 DOM 顺序压在背景上；
 *     墙要是跟着 stage 一起渲染，就会盖到暗角上面，四角那圈压暗全没了。
 *   - `RoomWindow` / `RoomDesk` / `RoomFloorItems` 挂在**电视机那层 relative 容器**上
 *     （ConsoleScene 里 `items-end gap-4` 那个 div），并且都排在 RetroTv **之前** ——
 *     于是窗户贴着机身左上角、桌子从机身下沿往下长，都被机身挡住一部分。
 *     `RoomFloorItems` 是唯一往**下**长的（锚在墙地交界线），它得排在 `RoomDesk` **之后**
 *     才能压在桌腿上 —— 那摊东西在桌子前面。
 *   - `RoomLamp` 挂在**电视机外面**那一层（stage 容器），同样排在 RetroTv **之前** ——
 *     整盏灯（灯具 + 光晕）都要落在机身**背后**：光晕糊在屏幕画面上就毁了，
 *     而矮窗口下天花板会贴到机身顶边，灯也必须让机身压住它，**不能反过来挡着电视机**。
 *
 * 除吊灯外都是纯装饰：一律 `pointer-events-none` + `aria-hidden`，
 * 不能吃掉 RetroTv 的拖拽落点。吊灯是**全屋唯一能点的家具** —— 灯罩和灯泡是 <button>。
 *
 * 配色分两套：墙走 `--wall-*`（globals.css），窗框和桌子走 `wood-*` 令牌，
 * 都跟着主题翻转；窗外的天空和植物、桌上小物、地板杂物、吊灯都是**固定色** ——
 * 物件是物件，不该跟着室内灯开关变色（窗外的昼夜是另一回事，见下）。
 */

/**
 * 墙。铺满房间，压在暗角之下。
 *
 * 底色和板缝都在 globals.css 的 `.wall` 里（两个主题各一套 `--wall-*`）。
 * 这里只管铺满 —— `inset-0` 覆盖 main 的 padding box。
 */
export function RoomWall() {
  return <div aria-hidden className="wall pointer-events-none absolute inset-0" />;
}

/**
 * 窗户。锚在电视机左上角：窗宽 280、左移 160、上移 100 ——
 * 于是**左侧 160px 一条**整窗高度都露在机身外，顶上还露出 100px 一条。
 * 左移量刻意不超过 160：断点 1100px 时场景两侧各留 ~167px，
 * 再往左就会被 main 的 overflow 切掉。
 *
 * 玻璃 248×248，SVG viewBox 取 62×62 正好 **4px 一格** ——
 * 所有 rect 坐标都是整数格，配 `shapeRendering="crispEdges"` 出来是硬边像素。
 * 景色按「左 36 格 / 上 23 格」构图：只有这块能露出来，树和花都排在左边。
 *
 * 昼夜两套 `<svg>` 都留在 DOM 里，靠 `.scene-day` / `.scene-night` 用 CSS 切
 * （夜间模式 → 夜景）。**不能**改成 `useState` 条件渲染：主题状态不在 React 里。
 */
export function RoomWindow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-[-160px] top-[-100px] h-[280px] w-[280px] bg-wood-700 pixel-edge pxw-4 pxc-500"
    >
      {/* 玻璃：窗外景色 */}
      <div className="absolute inset-[16px] overflow-hidden">
        {/* 白天 */}
        <svg
          className="scene-day absolute inset-0 block h-full w-full"
          viewBox="0 0 62 62"
          preserveAspectRatio="none"
          shapeRendering="crispEdges"
        >
          {/* 天：四段阶梯，像素风的「渐变」 */}
          <rect x="0" y="0" width="62" height="18" fill="#6f9ac4" />
          <rect x="0" y="18" width="62" height="14" fill="#86aed0" />
          <rect x="0" y="32" width="62" height="14" fill="#9dc0dc" />
          <rect x="0" y="46" width="62" height="16" fill="#b6d2e6" />

          {/* 太阳 */}
          <rect x="5" y="4" width="11" height="11" fill="#ffe9a8" />
          <rect x="7" y="6" width="7" height="7" fill="#ffd86b" />

          {/* 云 */}
          <rect x="20" y="13" width="17" height="5" fill="#ffffff" />
          <rect x="23" y="10" width="10" height="4" fill="#ffffff" />
          <rect x="18" y="16" width="21" height="3" fill="#eef5fb" />

          {/* 鸟 */}
          <rect x="24" y="7" width="2" height="1" fill="#33405a" />
          <rect x="26" y="8" width="2" height="1" fill="#33405a" />
          <rect x="28" y="7" width="2" height="1" fill="#33405a" />

          {/* 草地 */}
          <rect x="0" y="53" width="62" height="9" fill="#4f8f4a" />
          <rect x="0" y="53" width="62" height="2" fill="#63a95c" />

          {/* 树 */}
          <rect x="12" y="34" width="4" height="22" fill="#6b4a2f" />
          <rect x="9" y="21" width="10" height="4" fill="#5aa855" />
          <rect x="6" y="25" width="16" height="6" fill="#4a8c46" />
          <rect x="8" y="31" width="12" height="5" fill="#3f7a3f" />

          {/* 灌木 */}
          <rect x="25" y="45" width="15" height="9" fill="#4a8c46" />
          <rect x="28" y="42" width="9" height="4" fill="#5aa855" />

          {/* 花 */}
          <rect x="5" y="49" width="1" height="4" fill="#3d6f3a" />
          <rect x="4" y="48" width="3" height="2" fill="#e8b339" />
          <rect x="19" y="50" width="1" height="3" fill="#3d6f3a" />
          <rect x="18" y="49" width="3" height="2" fill="#e07a8a" />

          {/* 草丛 */}
          <rect x="2" y="51" width="1" height="3" fill="#3d6f3a" />
          <rect x="44" y="51" width="1" height="3" fill="#3d6f3a" />
        </svg>

        {/* 夜晚：同一套构图，换成夜空 + 月亮 + 剪影 */}
        <svg
          className="scene-night absolute inset-0 block h-full w-full"
          viewBox="0 0 62 62"
          preserveAspectRatio="none"
          shapeRendering="crispEdges"
        >
          {/* 夜空 */}
          <rect x="0" y="0" width="62" height="20" fill="#0e1730" />
          <rect x="0" y="20" width="62" height="14" fill="#141f3c" />
          <rect x="0" y="34" width="62" height="12" fill="#1b2948" />
          <rect x="0" y="46" width="62" height="16" fill="#223054" />

          {/* 星星 */}
          <rect x="4" y="9" width="1" height="1" fill="#e8edf8" />
          <rect x="18" y="5" width="1" height="1" fill="#e8edf8" />
          <rect x="30" y="11" width="1" height="1" fill="#cfd6e6" />
          <rect x="27" y="17" width="1" height="1" fill="#e8edf8" />
          <rect x="12" y="17" width="1" height="1" fill="#cfd6e6" />
          <rect x="40" y="7" width="1" height="1" fill="#e8edf8" />
          <rect x="52" y="14" width="1" height="1" fill="#cfd6e6" />
          <rect x="22" y="2" width="1" height="1" fill="#cfd6e6" />

          {/* 月亮：外圈柔光 → 月面 → 两块环形山 */}
          <rect x="6" y="5" width="12" height="12" fill="#3a4360" />
          <rect x="7" y="6" width="10" height="10" fill="#f4f1d6" />
          <rect x="12" y="8" width="3" height="3" fill="#ded9b8" />
          <rect x="9" y="11" width="2" height="2" fill="#ded9b8" />

          {/* 地面 */}
          <rect x="0" y="53" width="62" height="9" fill="#24402a" />
          <rect x="0" y="53" width="62" height="2" fill="#2f5236" />

          {/* 树（夜里只剩剪影） */}
          <rect x="12" y="34" width="4" height="22" fill="#2a2018" />
          <rect x="9" y="21" width="10" height="4" fill="#27482c" />
          <rect x="6" y="25" width="16" height="6" fill="#203c26" />
          <rect x="8" y="31" width="12" height="5" fill="#1b3420" />

          {/* 灌木 */}
          <rect x="25" y="45" width="15" height="9" fill="#203c26" />
          <rect x="28" y="42" width="9" height="4" fill="#27482c" />
        </svg>
      </div>

      {/* 窗棂：十字。压在玻璃之上 */}
      <div className="absolute bottom-[16px] left-1/2 top-[16px] w-[6px] -translate-x-1/2 bg-wood-800" />
      <div className="absolute left-[16px] right-[16px] top-1/2 h-[6px] -translate-y-1/2 bg-wood-800" />

      {/* 窗台：向左右各探出 10px，读起来才是「台面」而不是一根横杠 */}
      <div className="absolute -bottom-[10px] -left-[10px] -right-[10px] h-[12px] bg-wood-800 pixel-edge pxw-2 pxc-500" />

      {/* 窗台上的一盆植物（在室内，压在玻璃之上） */}
      <div className="absolute bottom-[2px] left-[22px] h-[26px] w-[22px]">
        <div className="absolute bottom-0 left-0 h-[10px] w-[22px] bg-[#a8613f]" />
        <div className="absolute bottom-[10px] left-0 h-[3px] w-[22px] bg-[#c47a52]" />
        <div className="absolute bottom-[13px] left-[4px] h-[6px] w-[3px] bg-[#4a8c46]" />
        <div className="absolute bottom-[16px] left-[8px] h-[6px] w-[3px] bg-[#55a04f]" />
        <div className="absolute bottom-[13px] left-[12px] h-[6px] w-[3px] bg-[#4a8c46]" />
        <div className="absolute bottom-[17px] left-[15px] h-[5px] w-[3px] bg-[#3f7a3f]" />
      </div>
    </div>
  );
}

/** 桌子总高（桌面 28 + 腿 70）。地板层靠它定位 —— 见 ConsoleScene 的地板那一段。 */
export const DESK_HEIGHT = 98;

/**
 * 桌子。电视机是**摆在它上面**的，桌子自己**站在地板上** ——
 * 桌腿底端正好落在墙地交界线上（ConsoleScene 的地板层按 `DESK_HEIGHT` 往下让出这一段）。
 *
 * 用 `top-full` 挂：这一层的顶边正好落在电视机的盒子下沿（= 底座着地的那条线），
 * 于是不管机身以后怎么改尺寸，桌子都会跟着走。
 *
 * 宽 1020，比机身（766）左右各宽出 ~127px —— 那两条就是**桌面能露出来的地方**，
 * 桌上小东西也只能摆在那一带（机身挡住的中间部分是看不见的）。
 * 断点 1100px 时场景内容宽 1052，1020 塞得下。
 *
 * 高度刻意压得比较矮 —— 机身本来就 ~757 高，桌子再往下长，窗口一矮就会把腿裁掉
 * （桌子是 `absolute`，不参与 main 的高度计算，超出的部分会被 main 的 overflow 切掉）。
 * 所以腿只给了 70，够读出「桌子」就行。
 */
export function RoomDesk() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-full w-[1020px] -translate-x-1/2"
    >
      {/* 桌面：顶边一条受光边、底边一条厚度边 */}
      <div className="relative h-[28px] bg-wood-900 pixel-edge pxw-3 pxc-500">
        <div className="absolute inset-x-0 top-0 h-[5px] bg-wood-800" />
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-wood-950" />
      </div>

      {/* 两条腿。中间空着 —— 透出后面的地板，桌子才立得住 */}
      <div className="absolute left-[38px] top-[28px] h-[70px] w-[46px] bg-wood-950 pixel-edge pxw-3 pxc-500" />
      <div className="absolute right-[38px] top-[28px] h-[70px] w-[46px] bg-wood-950 pixel-edge pxw-3 pxc-500" />

      {/*
        桌上的小东西。一律 `bottom-full` —— 底边贴在桌面顶边上，也就是「坐在桌上」。
        只摆在左右两条露出来的窄带里（局部 x 0..127 / 893..1020），
        中间那段会被机身完全挡掉。颜色全写死：物件是物件，不该跟着主题换色。
      */}

      {/* 书：三本叠着，越上面越窄 */}
      <div className="absolute bottom-full left-[20px] flex w-[56px] flex-col-reverse">
        <div className="h-[10px] w-[56px] border-b-2 border-[#6b5138] bg-[#8a6a4a]" />
        <div className="h-[10px] w-[52px] border-b-2 border-[#3f5f6d] bg-[#4f7a8a]" />
        <div className="h-[10px] w-[48px] border-b-2 border-[#6b4444] bg-[#8a5560]" />
      </div>

      {/* 马克杯：杯体 + 杯口 + 一个 C 形把手（把手中间的空隙直接透出桌面） */}
      <div className="absolute bottom-full left-[88px] h-[26px] w-[26px]">
        <div className="absolute bottom-[13px] left-[17px] h-[3px] w-[7px] bg-[#b8705a]" />
        <div className="absolute bottom-[6px] left-[21px] h-[11px] w-[3px] bg-[#b8705a]" />
        <div className="absolute bottom-[4px] left-[17px] h-[3px] w-[7px] bg-[#b8705a]" />
        <div className="absolute bottom-0 left-0 h-[22px] w-[18px] bg-[#b8705a]" />
        <div className="absolute bottom-[19px] left-0 h-[3px] w-[18px] bg-[#d08a70]" />
      </div>

      {/* 小盆栽 */}
      <div className="absolute bottom-full left-[900px] h-[44px] w-[40px]">
        <div className="absolute bottom-[18px] left-[8px] h-[14px] w-[24px] bg-[#4a8c46]" />
        <div className="absolute bottom-[26px] left-[12px] h-[10px] w-[16px] bg-[#55a04f]" />
        <div className="absolute bottom-[32px] left-[16px] h-[8px] w-[8px] bg-[#5aa855]" />
        <div className="absolute bottom-0 left-[6px] h-[16px] w-[28px] bg-[#a8613f]" />
        <div className="absolute bottom-[16px] left-[4px] h-[4px] w-[32px] bg-[#c47a52]" />
      </div>

      {/* 一盘平放着的卡带（贴着桌面看过去就是一条） */}
      <div className="absolute bottom-full left-[952px] h-[16px] w-[56px] bg-[#3a3a44] pixel-edge pxw-2 pxc-500">
        <div className="absolute inset-x-[5px] top-[3px] h-[6px] bg-[#c8c8d2]" />
      </div>
    </div>
  );
}

/**
 * 地板上随手摊着的一摊东西：一台红白机、两只连着手柄线的游戏手柄、几盘黄卡带。
 *
 * 锚在**墙地交界线**上：`top: calc(100% + DESK_HEIGHT px)`，和地板层同一个起点，
 * 所以不管机身以后怎么改尺寸，它们都跟着落在地板上。容器宽也取 1020（和桌子一样），
 * children 的 `left` 就直接是「地板坐标」（0..1020，正中是 510 = 机身中线）。
 *
 * **必须排在 `RoomDesk` 之后**：这摊东西是摆在**桌子前面**的（离镜头比桌子近），
 * 要压在桌腿和桌沿上；反过来就会被桌子挡住，看着像嵌进桌子里。
 * 又因为锚点在交界线、机身底边离交界线还有一整个 `DESK_HEIGHT`，它们顶不到电视机。
 *
 * 容器高 120px 只是给 SVG 一个坐标系（viewBox 要跟它一致），东西实际只铺到
 * 交界线往下 ~48px。**刻意让每件东西都「底边在交界线以下、顶边在以上」**：
 * 地板在窗口里的可见高度 = `(100vh - 机身高)/2 - DESK_HEIGHT`，1080 的屏上约 98px、
 * 900 的窗口上只剩 8px —— 全压在交界线以下的话，矮窗口里整摊东西一个都看不见
 * （桌腿被下沿裁掉是同一笔账）。现在这样，越矮的窗口露出的越少、但总能看见一截。
 *
 * 纯装饰：`pointer-events-none` + `aria-hidden`，不吃机身的拖拽落点
 * （`pointer-events` 会继承，里面的小件不用再写一遍）。
 * 颜色**全部写死**（和桌上小物、吊灯一个规矩）：物件是物件，不跟着主题换色。
 * 描边走 `pxc-500` —— 地板两套主题一深一浅（#211b16 / #ddd5c6），
 * 只有中间调的灰在两边都读得出来，和桌子、桌上那盘卡带是同一套做法。
 */
export function RoomFloorItems() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 h-[120px] w-[1020px] -translate-x-1/2"
      style={{ top: `calc(100% + ${DESK_HEIGHT}px)` }}
    >
      {/*
        手柄线。用 SVG 而不是 div：线是**斜着甩在地上**的，拿 div 拼要拆成一堆片段；
        polyline 只走水平 / 垂直段 + crispEdges，出来还是硬边像素（真画斜线会糊）。
        viewBox 和容器**同尺寸**，所以 2px 就是 2px，1:1 映射 ——
        改容器高度要同步改 viewBox，否则 preserveAspectRatio="none" 会把线拉变形。
        颜色取中间调的灰：深色地板上它是亮的、浅色地板上它是暗的，两边都看得见。
      */}
      <svg
        className="absolute inset-0 block h-full w-full"
        viewBox="0 0 1020 120"
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
      >
        <polyline
          points="316,4 316,20 292,20 292,32 198,32 198,27 172,27"
          fill="none"
          stroke="#4a4a55"
          strokeWidth="2"
        />
        <polyline
          points="400,4 400,18 424,18 424,30 560,30 560,38 748,38"
          fill="none"
          stroke="#4a4a55"
          strokeWidth="2"
        />
      </svg>

      {/*
        红白机。奶白机身 + 深红顶盖（顶盖上一道黑卡带插槽）+ 深红前脸，
        前脸上两个手柄插口、中间一颗红色电源开关。
        底边落在交界线**以下** 24px、顶边探到**以上** 16px —— 这就是「站在地板上」
        在侧视图里的画法：底边越靠下 = 离墙越远、离镜头越近；
        整块都压在交界线以下反而像躺在地上，整块都在以上又像挂在墙上。
        （2026-10-09 用户说「往下来点」，从 -26 挪到 -16，更靠前一点。）

        两条手柄线的起点**不用跟着改**：它们在 SVG 里排在机身之前，
        本来就被机身盖住，露出来的那一截正好从机身左右下角钻出来。
      */}
      <div className="absolute left-[300px] top-[-16px] h-[40px] w-[116px] bg-[#d9d1bd] pixel-edge pxw-2 pxc-500">
        <div className="absolute inset-x-0 top-0 h-[13px] bg-[#8f2436]" />
        <div className="absolute left-[44px] top-[3px] h-[7px] w-[28px] bg-[#2a2026]" />
        <div className="absolute inset-x-0 bottom-0 h-[6px] bg-[#8f2436]" />
        <div className="absolute bottom-[10px] left-[12px] h-[7px] w-[14px] bg-[#3a3a44]" />
        <div className="absolute bottom-[10px] right-[12px] h-[7px] w-[14px] bg-[#3a3a44]" />
        <div className="absolute bottom-[9px] left-[52px] h-[8px] w-[12px] bg-[#c0392b]" />
      </div>

      {/* 两只手柄。左一右一，深度错开一点，别像摆拍 */}
      <FloorController className="left-[128px] top-[14px]" />
      <FloorController className="left-[748px] top-[22px]" />

      {/*
        黄卡带：两盘平放、一盘立着，**散在整条地板上**而不是堆成一摞 ——
        左边一盘（手柄 1 和机身之间）、中间一盘、右边立一盘（机身和手柄 2 之间）。
        平放那两盘的落点差 8px（-12 / -4），读起来是「随手丢的」而不是摆齐的。
        横向都留在容器中段：容器 1020 宽，但两头会被 main 的 overflow 切掉
        （窗口越窄切得越多），摆到外面就白摆了。
      */}
      <div className="absolute left-[210px] top-[-12px] h-[14px] w-[46px] bg-[#e2b93d] pixel-edge pxw-2 pxc-500">
        <div className="absolute inset-x-[5px] top-[3px] h-[6px] bg-[#2f2a3a]" />
      </div>
      <div className="absolute left-[468px] top-[-4px] h-[14px] w-[46px] bg-[#e2b93d] pixel-edge pxw-2 pxc-500">
        <div className="absolute inset-x-[5px] top-[3px] h-[6px] bg-[#2f2a3a]" />
      </div>
      <div className="absolute left-[664px] top-[-20px] h-[30px] w-[34px] bg-[#e2b93d] pixel-edge pxw-2 pxc-500">
        <div className="absolute inset-x-0 top-0 h-[5px] bg-[#b8912a]" />
        <div className="absolute left-[5px] top-[9px] h-[11px] w-[24px] bg-[#2f2a3a]" />
      </div>
    </div>
  );
}

/**
 * 红白机手柄（地板上的装饰件，`RoomFloorItems` 内部用）。
 * 深红壳 + 金色面板 + 十字键 + 两个红钮 —— 44×26，够读出「这是只手柄」。
 * 定位交给调用方（`className` 只带 left / top）。
 */
function FloorController({ className }: { className: string }) {
  return (
    <div
      className={`absolute h-[26px] w-[44px] bg-[#8f2436] pixel-edge pxw-2 pxc-500 ${className}`}
    >
      <div className="absolute left-[4px] top-[4px] h-[18px] w-[36px] bg-[#c9a45c]" />
      {/* 十字键：一竖一横两根条 */}
      <div className="absolute left-[11px] top-[7px] h-[12px] w-[4px] bg-[#3a3a44]" />
      <div className="absolute left-[7px] top-[11px] h-[4px] w-[12px] bg-[#3a3a44]" />
      {/* 两个钮 */}
      <div className="absolute left-[27px] top-[9px] h-[6px] w-[6px] bg-[#c0392b]" />
      <div className="absolute left-[33px] top-[13px] h-[6px] w-[6px] bg-[#c0392b]" />
    </div>
  );
}

/**
 * 吊灯。挂在房间顶部正中 —— `main` 是 relative，而这一层（stage 容器）是 static，
 * 所以 `top-0` 就是天花板，`left-1/2` 就是房间中线（正好压在电视机上方）。
 *
 * **必须排在 RetroTv 之前**（整盏灯都在机身背后）：
 *   - 光晕糊在屏幕画面上就毁了；
 *   - 窗口一矮，天花板会贴到机身顶边，灯顶上去 —— 这时得让**机身压住灯**。
 *     反过来（灯在前）就是用户报的「灯挡着了电视机」。
 *
 * 灯线长度由 `.lamp-cord`（globals.css）按窗口高度缩：房间是竖向居中的，窗口越矮、
 * 天花板离机身越近，灯线缩到「灯罩 + 灯泡刚好留在机身顶边之上」。
 * 缩到 0 还不够高时，剩下的部分交给机身遮住 —— 反正不会再挡着电视机。
 *
 * 它是**全屋唯一能点的家具**：灯罩 + 灯泡包在一个 <button> 里。开关状态不放在 React 里 ——
 * 存在 `<html data-lamp>` 上（首屏由 layout 的内联脚本写入，键 `nesload:lamp`），
 * 亮不亮全交给 CSS 按属性切，理由和主题完全一样（见 ConsoleScene 的 applyTheme）：
 * 惰性初始化在服务端拿不到 localStorage，会让首帧和真实状态对不上。
 * 这个组件只负责「长什么样」和「点一下调 onToggle」。
 *
 * 挂在 stage 容器里而不是 main 上：`.stage` 在窄屏是 display:none，
 * 吊灯跟着整间屋子一起消失，不会孤零零挂在「请用桌面端」的提示上方。
 *
 * 固定色（不跟主题翻）：木色灯罩 + 暖黄灯泡，白天模式也还是这盏灯。
 */
export function RoomLamp({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    /*
      外壳只管定位与「光晕 + 灯具」这一组的对齐，本身不吃指针事件 ——
      否则灯罩左右那点余量会变成一块隐形挡板，压住机身的拖拽落点。
      点击只落在里面那个 <button> 上。
    */
    <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2">
      {/*
        光晕。以灯泡为中心 —— 灯泡中心在灯具底边往上 6px 处（灯泡 13 的一半）。
        它和灯具一起落在机身背后，所以只会照亮墙，不会糊到屏幕上。
      */}
      <div
        aria-hidden
        className="lamp-glow absolute bottom-[6px] left-1/2 -translate-x-1/2 translate-y-1/2"
      />

      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        aria-label={label}
        title={label}
        className="pointer-events-auto relative flex cursor-pointer flex-col items-center p-0"
      >
        {/* 天花板吸盘 */}
        <div className="h-[8px] w-[18px] bg-[#3a3a44]" />
        {/* 灯线：长度由 .lamp-cord 按窗口高度给 */}
        <div className="lamp-cord w-[4px] bg-[#2a2a30]" />
        {/* 灯罩：四层递增的横条拼出梯形 —— 像素风不画斜边 */}
        <div className="h-[7px] w-[22px] bg-[#c9a45c]" />
        <div className="h-[7px] w-[34px] bg-[#b98a44]" />
        <div className="h-[7px] w-[46px] bg-[#a87a34]" />
        {/* 灯罩下沿的内圈：亮着的时候是暖黄的 */}
        <div className="lamp-rim h-[5px] w-[58px]" />
        {/* 灯泡 */}
        <div className="lamp-bulb h-[13px] w-[13px]" />
      </button>
    </div>
  );
}
