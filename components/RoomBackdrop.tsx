/*
 * 房间背景：墙 + 电视机后面墙上的一扇窗（窗外是春夏秋冬，每季又分昼夜，点一下换一季）
 * + 右侧墙上的日历
 * + 电视机底下那张桌子 + 桌前面地板上摊着的杂物（红白机 / 两只手柄 / 几盘黄卡带
 * / 一本压着笔的留言本） + 顶上那盏吊灯。
 *
 * 几块**故意拆开**，因为它们要插在**不同的层**上：
 *
 *   - `RoomWall` 铺满整个房间，必须渲染在 `main` 里、**暗角（.vignette）之前** ——
 *     暗角是 `absolute inset-0` 且排在 stage 前面，靠 DOM 顺序压在背景上；
 *     墙要是跟着 stage 一起渲染，就会盖到暗角上面，四角那圈压暗全没了。
 *   - `RoomWindow` / `RoomCalendar` / `RoomDesk` / `RoomFloorItems` 挂在**电视机那层
 *     relative 容器**上（ConsoleScene 里 `items-end gap-4` 那个 div），并且都排在 RetroTv
 *     **之前** —— 于是窗户贴着机身左上角、日历贴着右上角、桌子从机身下沿往下长，
 *     都被机身挡住一部分。
 *     `RoomFloorItems` 是唯一往**下**长的（锚在墙地交界线），它得排在 `RoomDesk` **之后**
 *     才能压在桌腿上 —— 那摊东西在桌子前面。
 *   - `RoomLamp` 挂在**电视机外面**那一层（stage 容器），同样排在 RetroTv **之前** ——
 *     整盏灯（灯具 + 光晕）都要落在机身**背后**：光晕糊在屏幕画面上就毁了，
 *     而矮窗口下天花板会贴到机身顶边，灯也必须让机身压住它，**不能反过来挡着电视机**。
 *
 * 除吊灯、窗户玻璃、地上那本留言本、地板右下角那张纸片外都是纯装饰：一律
 * `pointer-events-none` + `aria-hidden`，不能吃掉 RetroTv 的拖拽落点。
 * 全屋能点的只有**四处** —— 吊灯（灯罩 + 灯泡是 <button>）、
 * 窗户玻璃（点一下换下一季，见 `RoomWindow`）、地上那本留言本（点开是留言列表）、
 * 和那张纸片（点开弹出「一张纸」）—— 后两处都在 `RoomFloorItems` 里。
 *
 * 配色分两套：墙走 `--wall-*`（globals.css），窗框和桌子走 `wood-*` 令牌，
 * 都跟着主题翻转；桌上的小物、地板杂物、吊灯、日历都是**固定色** ——
 * 物件是物件，不该跟着室内灯开关变色。
 * **只有窗外那扇窗是特例**：它分春夏秋冬（跟 `data-season`）、每季又分昼夜
 * （跟 `data-theme`）—— 见 `RoomWindow`。但昼夜跟的是**主题**，不是吊灯：
 * 屋里白天手动开灯，窗外也不会变成晚上。
 *
 * 2026-10-10 起，四个「可选的」部件根节点各挂了一个稳定类名 ——
 * `room-lamp` / `room-window` / `room-calendar` / `room-floor-items` ——
 * 给**简洁模式**用：`<html data-simple="on">` 时这几块整体 `display: none`
 * （见 globals.css）。剩下的是背景墙 / 电视机 / 桌子 / 地面。
 * 类名只做钩子，样式一条都不写在这里 —— 别把它们挪进 Tailwind 的类串里。
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
 * 窗户。锚在电视机左上角：左移 160、上移 100 ——
 * 于是**左侧 160px 一条**（整窗高度）露在机身外，顶上还露出 100px 一条。
 * 左移量刻意不超过 160：断点 900px 时场景两侧余量最小，再往左就会被 main 的 overflow 切掉。
 *
 * 2026-10-10 放大过一次：玻璃 248 → 310、外框 280 → 342。
 * **放大的是窗户和景色本身，不是左探 / 上探的量** —— 那两个受「场景两侧余量」和
 * 「竖向尺寸链」（窗上探 100 + 机身 + 桌子 + py-4 ≈ 990px）约束，所以多长出来的那截
 * 全落在机身背后。格子仍取**整数 5px**（viewBox 62 不变 → 62 × 5 = 310）：
 * 像素格子必须是正方形且整除，否则 `crispEdges` 会糊出半像素的边。
 *
 * 窗外是**春夏秋冬四套**，靠 `.scene-*` + `:root[data-season]` 用 CSS 切
 * （季节不在 React 里，见 globals.css 那段注释）。
 * **每季的 `<svg>` 里再分昼夜两组 `<g>`**：`.sky-day` / `.sky-night` /
 * `.land-day` / `.land-night`，昼夜跟 `<html data-theme>` 走
 * （深色主题 = 夜晚，浅色主题 = 白天）—— 和放大前那版「昼夜跟主题」的规则一致，
 * 只是现在四季各自都有一套夜景。**昼夜跟主题、不跟吊灯**：屋里白天开灯，窗外照样是白天。
 * 四个 `<g>` 的先后顺序是「天-日 / 天-夜 / 地-日 / 地-夜」——
 * 两个地组排在两个天组之后，所以不管亮的是哪一组，地都在天的上面。
 *
 * **整块玻璃是个 `<button>`：点一下换下一季。** 它是全屋第三个能点的东西
 * （前两个是吊灯、地板上的纸片）。外面那层仍是 `pointer-events-none`，
 * 窗棂 / 窗台 / 盆栽排在它后面且不吃指针 —— 点在窗棂上会穿透到玻璃。
 *
 * ⚠️ **可见范围只有「左侧约 28 格 × 全高 62 格」这一条竖带**
 * （144px ÷ 5px = 28.8 格；顶上那条横带更窄，被竖带完全覆盖）。
 * **四季的景物一律排在 x ≤ 28 格以内** —— 再往右是白画，永远在机身背后。
 * （放大前是 4px/格、能看到 36 格，所以旧版的云 / 灌木排在 30 格开外也看得见。）
 */
export function RoomWindow({
  onCycleSeason,
  label,
}: {
  /** 点窗户 —— 由 ConsoleScene 切到下一季 */
  onCycleSeason: () => void;
  /** 玻璃按钮的 title / aria-label，走 i18n 的 `window.cycle` */
  label: string;
}) {
  return (
    <div className="room-window pointer-events-none absolute left-[-160px] top-[-100px] h-[342px] w-[342px] bg-wood-700 pixel-edge pxw-4 pxc-500">
      {/*
        玻璃：整块可点。四套景色**都留在 DOM 里**，由 CSS 按 <html data-season> 显隐 ——
        不能改成条件渲染，季节状态不在 React 里。

        每季的 `<svg>` 里再分**昼夜两组 `<g>`**（`.sky-day` / `.sky-night` /
        `.land-day` / `.land-night`），昼夜跟 `<html data-theme>` 走：
        深色主题 = 夜晚（默认）、浅色主题 = 白天。季节和昼夜是两个互不干扰的维度。
      */}
      <button
        type="button"
        onClick={onCycleSeason}
        aria-label={label}
        title={label}
        className="pointer-events-auto absolute inset-[16px] block cursor-pointer overflow-hidden"
      >
        {/* ---------------- 春 ---------------- */}
        <svg
          className="scene-spring absolute inset-0 block h-full w-full"
          viewBox="0 0 62 62"
          preserveAspectRatio="none"
          shapeRendering="crispEdges"
        >
          {/* 白天：天 + 太阳 + 云 + 鸟 */}
          <g className="sky-day">
            {/* 天：四段阶梯，像素风的「渐变」 */}
            <rect x="0" y="0" width="62" height="16" fill="#7aa6cc" />
            <rect x="0" y="16" width="62" height="14" fill="#93b8d8" />
            <rect x="0" y="30" width="62" height="12" fill="#aacce2" />
            <rect x="0" y="42" width="62" height="11" fill="#c2dcea" />

            {/* 太阳 */}
            <rect x="3" y="3" width="11" height="11" fill="#ffeaa8" />
            <rect x="5" y="5" width="7" height="7" fill="#ffd86b" />

            {/* 云 */}
            <rect x="6" y="15" width="16" height="4" fill="#ffffff" />
            <rect x="9" y="12" width="9" height="3" fill="#ffffff" />
            <rect x="4" y="18" width="20" height="2" fill="#eef5fb" />

            {/* 鸟 */}
            <rect x="15" y="7" width="2" height="1" fill="#33405a" />
            <rect x="17" y="8" width="2" height="1" fill="#33405a" />
            <rect x="19" y="7" width="2" height="1" fill="#33405a" />
          </g>

          {/* 夜晚：春夜偏蓝紫，地上有萤火虫 */}
          <g className="sky-night">
            <rect x="0" y="0" width="62" height="16" fill="#151d38" />
            <rect x="0" y="16" width="62" height="14" fill="#1c2542" />
            <rect x="0" y="30" width="62" height="12" fill="#232e4e" />
            <rect x="0" y="42" width="62" height="11" fill="#2b375a" />

            {/* 星 */}
            <rect x="4" y="8" width="1" height="1" fill="#e8edf8" />
            <rect x="11" y="4" width="1" height="1" fill="#cfd6e6" />
            <rect x="19" y="10" width="1" height="1" fill="#e8edf8" />
            <rect x="24" y="5" width="1" height="1" fill="#cfd6e6" />
            <rect x="8" y="18" width="1" height="1" fill="#cfd6e6" />
            <rect x="22" y="20" width="1" height="1" fill="#e8edf8" />
            <rect x="14" y="27" width="1" height="1" fill="#cfd6e6" />
            <rect x="26" y="31" width="1" height="1" fill="#e8edf8" />

            {/* 月牙（外圈柔光 → 月面 → 挖掉一块成弯月） */}
            <rect x="4" y="4" width="12" height="12" fill="#3a4360" />
            <rect x="5" y="5" width="10" height="10" fill="#f4f1d6" />
            <rect x="10" y="4" width="6" height="12" fill="#151d38" />
          </g>

          {/* 白天：地 + 树 + 灌木 + 花 */}
          <g className="land-day">
            {/* 草地 */}
            <rect x="0" y="53" width="62" height="9" fill="#57a04f" />
            <rect x="0" y="53" width="62" height="2" fill="#6bb862" />

            {/* 树：嫩绿、树冠还稀 */}
            <rect x="9" y="34" width="4" height="22" fill="#6b4a2f" />
            <rect x="6" y="22" width="10" height="4" fill="#7cc46f" />
            <rect x="4" y="26" width="14" height="5" fill="#63b158" />
            <rect x="6" y="31" width="10" height="4" fill="#52a04a" />

            {/* 灌木 */}
            <rect x="17" y="46" width="11" height="8" fill="#63b158" />
            <rect x="19" y="43" width="7" height="4" fill="#7cc46f" />

            {/* 花：春天开得最多 */}
            <rect x="3" y="49" width="1" height="4" fill="#3d6f3a" />
            <rect x="2" y="48" width="3" height="2" fill="#e8b339" />
            <rect x="13" y="50" width="1" height="3" fill="#3d6f3a" />
            <rect x="12" y="49" width="3" height="2" fill="#e07a8a" />
            <rect x="25" y="50" width="1" height="3" fill="#3d6f3a" />
            <rect x="24" y="49" width="3" height="2" fill="#d878c0" />

            {/* 草丛 */}
            <rect x="1" y="51" width="1" height="3" fill="#3d6f3a" />
            <rect x="21" y="52" width="1" height="3" fill="#3d6f3a" />
          </g>

          {/* 夜晚：草地压暗成剪影，花看不见了，改由萤火虫点缀 */}
          <g className="land-night">
            <rect x="0" y="53" width="62" height="9" fill="#1e3a24" />
            <rect x="0" y="53" width="62" height="2" fill="#26482c" />

            <rect x="9" y="34" width="4" height="22" fill="#2a2018" />
            <rect x="6" y="22" width="10" height="4" fill="#22452a" />
            <rect x="4" y="26" width="14" height="5" fill="#1c3b23" />
            <rect x="6" y="31" width="10" height="4" fill="#17331e" />

            <rect x="17" y="46" width="11" height="8" fill="#1c3b23" />
            <rect x="19" y="43" width="7" height="4" fill="#22452a" />

            {/* 萤火虫：一团微光 + 中间那个亮点 */}
            <rect x="3" y="48" width="3" height="3" fill="#3a4a22" />
            <rect x="4" y="49" width="1" height="1" fill="#d8e878" />
            <rect x="15" y="45" width="3" height="3" fill="#3a4a22" />
            <rect x="16" y="46" width="1" height="1" fill="#d8e878" />
            <rect x="24" y="51" width="3" height="3" fill="#3a4a22" />
            <rect x="25" y="52" width="1" height="1" fill="#d8e878" />
          </g>
        </svg>

        {/* ---------------- 夏 ---------------- */}
        <svg
          className="scene-summer absolute inset-0 block h-full w-full"
          viewBox="0 0 62 62"
          preserveAspectRatio="none"
          shapeRendering="crispEdges"
        >
          {/* 白天：最深最蓝，云也少 */}
          <g className="sky-day">
            <rect x="0" y="0" width="62" height="18" fill="#3f7fb0" />
            <rect x="0" y="18" width="62" height="14" fill="#5b96c4" />
            <rect x="0" y="32" width="62" height="12" fill="#78aed4" />
            <rect x="0" y="44" width="62" height="9" fill="#96c2e0" />

            {/* 太阳：又大又烈 */}
            <rect x="2" y="2" width="14" height="14" fill="#fff0b8" />
            <rect x="4" y="4" width="10" height="10" fill="#ffd23f" />

            {/* 云：只有一小朵 */}
            <rect x="14" y="13" width="12" height="4" fill="#ffffff" />
            <rect x="16" y="10" width="7" height="3" fill="#ffffff" />

            {/* 鸟 */}
            <rect x="21" y="6" width="2" height="1" fill="#2b3550" />
            <rect x="23" y="7" width="2" height="1" fill="#2b3550" />
          </g>

          {/* 夜晚：夏夜最深、星最多，还有一条银河 */}
          <g className="sky-night">
            <rect x="0" y="0" width="62" height="18" fill="#0b1229" />
            <rect x="0" y="18" width="62" height="14" fill="#111a34" />
            <rect x="0" y="32" width="62" height="12" fill="#182342" />
            <rect x="0" y="44" width="62" height="9" fill="#1f2c4e" />

            {/* 银河：一条斜着铺过去的小点带 */}
            <rect x="2" y="26" width="2" height="1" fill="#33406a" />
            <rect x="5" y="24" width="2" height="1" fill="#33406a" />
            <rect x="8" y="22" width="2" height="1" fill="#3d4c7c" />
            <rect x="11" y="20" width="2" height="1" fill="#3d4c7c" />
            <rect x="14" y="18" width="2" height="1" fill="#33406a" />
            <rect x="17" y="16" width="2" height="1" fill="#3d4c7c" />
            <rect x="20" y="14" width="2" height="1" fill="#33406a" />
            <rect x="23" y="12" width="2" height="1" fill="#3d4c7c" />
            <rect x="26" y="10" width="2" height="1" fill="#33406a" />

            {/* 星：夏夜最密 */}
            <rect x="3" y="4" width="1" height="1" fill="#ffffff" />
            <rect x="9" y="8" width="1" height="1" fill="#e8edf8" />
            <rect x="15" y="3" width="1" height="1" fill="#ffffff" />
            <rect x="21" y="7" width="1" height="1" fill="#cfd6e6" />
            <rect x="27" y="4" width="1" height="1" fill="#e8edf8" />
            <rect x="6" y="14" width="1" height="1" fill="#cfd6e6" />
            <rect x="13" y="11" width="1" height="1" fill="#ffffff" />
            <rect x="25" y="17" width="1" height="1" fill="#e8edf8" />
            <rect x="4" y="22" width="1" height="1" fill="#cfd6e6" />
            <rect x="18" y="25" width="1" height="1" fill="#e8edf8" />

            {/* 月牙 */}
            <rect x="20" y="5" width="10" height="10" fill="#3a4360" />
            <rect x="21" y="6" width="8" height="8" fill="#f4f1d6" />
            <rect x="25" y="5" width="5" height="10" fill="#0b1229" />
          </g>

          {/* 白天：深绿的草地和树 */}
          <g className="land-day">
            <rect x="0" y="53" width="62" height="9" fill="#3f8a3a" />
            <rect x="0" y="53" width="62" height="2" fill="#4f9c46" />

            {/* 树：浓绿、树冠最大 */}
            <rect x="9" y="34" width="5" height="22" fill="#5a3f28" />
            <rect x="5" y="19" width="13" height="4" fill="#4a9c46" />
            <rect x="2" y="23" width="19" height="7" fill="#3d8439" />
            <rect x="4" y="30" width="15" height="6" fill="#2f6b2d" />

            {/* 灌木 */}
            <rect x="16" y="45" width="13" height="9" fill="#3d8439" />
            <rect x="18" y="42" width="9" height="4" fill="#4a9c46" />

            {/* 花 */}
            <rect x="3" y="49" width="1" height="4" fill="#2f6b2d" />
            <rect x="2" y="48" width="3" height="2" fill="#e04a3a" />
            <rect x="26" y="50" width="1" height="3" fill="#2f6b2d" />
            <rect x="25" y="49" width="3" height="2" fill="#e8b339" />

            {/* 草丛 */}
            <rect x="1" y="51" width="1" height="3" fill="#2f6b2d" />
            <rect x="12" y="52" width="1" height="3" fill="#2f6b2d" />
          </g>

          {/* 夜晚：全压成最深的剪影 */}
          <g className="land-night">
            <rect x="0" y="53" width="62" height="9" fill="#16301c" />
            <rect x="0" y="53" width="62" height="2" fill="#1b3a22" />

            <rect x="9" y="34" width="5" height="22" fill="#241a12" />
            <rect x="5" y="19" width="13" height="4" fill="#1a3a20" />
            <rect x="2" y="23" width="19" height="7" fill="#152f1a" />
            <rect x="4" y="30" width="15" height="6" fill="#112714" />

            <rect x="16" y="45" width="13" height="9" fill="#152f1a" />
            <rect x="18" y="42" width="9" height="4" fill="#1a3a20" />
          </g>
        </svg>

        {/* ---------------- 秋 ---------------- */}
        <svg
          className="scene-autumn absolute inset-0 block h-full w-full"
          viewBox="0 0 62 62"
          preserveAspectRatio="none"
          shapeRendering="crispEdges"
        >
          {/* 白天：蓝里透暖（秋高气爽） */}
          <g className="sky-day">
            <rect x="0" y="0" width="62" height="16" fill="#6b90b8" />
            <rect x="0" y="16" width="62" height="14" fill="#8aa8c4" />
            <rect x="0" y="30" width="62" height="12" fill="#b8a888" />
            <rect x="0" y="42" width="62" height="11" fill="#d8bc94" />

            {/* 太阳：偏暖 */}
            <rect x="3" y="3" width="12" height="12" fill="#ffe4a0" />
            <rect x="5" y="5" width="8" height="8" fill="#ffb84a" />

            {/* 云 */}
            <rect x="7" y="14" width="15" height="4" fill="#f0e0c8" />
            <rect x="10" y="11" width="8" height="3" fill="#f0e0c8" />

            {/* 雁：南飞，排成人字 */}
            <rect x="14" y="6" width="2" height="1" fill="#4a3a30" />
            <rect x="16" y="7" width="2" height="1" fill="#4a3a30" />
            <rect x="18" y="6" width="2" height="1" fill="#4a3a30" />
            <rect x="20" y="9" width="2" height="1" fill="#4a3a30" />
            <rect x="22" y="10" width="2" height="1" fill="#4a3a30" />
          </g>

          {/* 夜晚：靛蓝夜空 + 一轮暖色满月（中秋那轮） */}
          <g className="sky-night">
            <rect x="0" y="0" width="62" height="16" fill="#101828" />
            <rect x="0" y="16" width="62" height="14" fill="#182036" />
            <rect x="0" y="30" width="62" height="12" fill="#2a2a34" />
            <rect x="0" y="42" width="62" height="11" fill="#3a3028" />

            {/* 星：秋夜疏朗 */}
            <rect x="20" y="6" width="1" height="1" fill="#e8edf8" />
            <rect x="26" y="12" width="1" height="1" fill="#cfd6e6" />
            <rect x="18" y="20" width="1" height="1" fill="#e8edf8" />
            <rect x="27" y="26" width="1" height="1" fill="#cfd6e6" />
            <rect x="22" y="33" width="1" height="1" fill="#e8edf8" />

            {/* 满月：外圈柔光 → 月面 → 两块环形山 */}
            <rect x="3" y="3" width="14" height="14" fill="#4a4636" />
            <rect x="4" y="4" width="12" height="12" fill="#ffeec2" />
            <rect x="9" y="6" width="4" height="4" fill="#e8d8a8" />
            <rect x="5" y="10" width="3" height="3" fill="#e8d8a8" />
          </g>

          {/* 白天：枯黄的草，橙红一片的树 */}
          <g className="land-day">
            <rect x="0" y="53" width="62" height="9" fill="#8a8a3a" />
            <rect x="0" y="53" width="62" height="2" fill="#a09a46" />

            {/* 树：橙黄红，混一片红 */}
            <rect x="9" y="34" width="4" height="22" fill="#6b4a2f" />
            <rect x="6" y="21" width="11" height="4" fill="#e8a838" />
            <rect x="3" y="25" width="16" height="6" fill="#d88a2a" />
            <rect x="5" y="31" width="12" height="5" fill="#c4701f" />
            <rect x="8" y="27" width="5" height="4" fill="#c05030" />

            {/* 落叶 */}
            <rect x="2" y="52" width="2" height="1" fill="#e8a838" />
            <rect x="14" y="54" width="2" height="1" fill="#d88a2a" />
            <rect x="24" y="52" width="2" height="1" fill="#c4701f" />
            <rect x="18" y="57" width="2" height="1" fill="#e8a838" />

            {/* 灌木：也黄了 */}
            <rect x="17" y="46" width="11" height="8" fill="#c4781f" />
            <rect x="19" y="43" width="7" height="4" fill="#d88a2a" />

            {/* 草丛 */}
            <rect x="1" y="51" width="1" height="3" fill="#7a7a34" />
            <rect x="22" y="52" width="1" height="3" fill="#7a7a34" />
          </g>

          {/* 夜晚：树影里仍留一点橙（秋天不该全黑），地上落叶还在 */}
          <g className="land-night">
            <rect x="0" y="53" width="62" height="9" fill="#3a3220" />
            <rect x="0" y="53" width="62" height="2" fill="#46402a" />

            <rect x="9" y="34" width="4" height="22" fill="#2a2018" />
            <rect x="6" y="21" width="11" height="4" fill="#6a4a1e" />
            <rect x="3" y="25" width="16" height="6" fill="#5a3e18" />
            <rect x="5" y="31" width="12" height="5" fill="#4a3214" />
            <rect x="8" y="27" width="5" height="4" fill="#5a2e1c" />

            <rect x="2" y="52" width="2" height="1" fill="#6a4a1e" />
            <rect x="14" y="54" width="2" height="1" fill="#5a3e18" />
            <rect x="24" y="52" width="2" height="1" fill="#4a3214" />

            <rect x="17" y="46" width="11" height="8" fill="#4a3214" />
            <rect x="19" y="43" width="7" height="4" fill="#5a3e18" />
          </g>
        </svg>

        {/* ---------------- 冬 ---------------- */}
        <svg
          className="scene-winter absolute inset-0 block h-full w-full"
          viewBox="0 0 62 62"
          preserveAspectRatio="none"
          shapeRendering="crispEdges"
        >
          {/* 白天：灰白的天，雪飘着 */}
          <g className="sky-day">
            <rect x="0" y="0" width="62" height="18" fill="#8a95a8" />
            <rect x="0" y="18" width="62" height="14" fill="#9aa5b8" />
            <rect x="0" y="32" width="62" height="12" fill="#aab5c4" />
            <rect x="0" y="44" width="62" height="9" fill="#bcc6d2" />

            {/* 太阳：冬日里淡得几乎看不见 */}
            <rect x="3" y="3" width="12" height="12" fill="#e8e4d8" />
            <rect x="5" y="5" width="8" height="8" fill="#f6f2e4" />

            {/* 云：厚 */}
            <rect x="4" y="14" width="18" height="4" fill="#dfe4ea" />
            <rect x="7" y="11" width="10" height="3" fill="#dfe4ea" />
            <rect x="2" y="17" width="22" height="2" fill="#eef1f4" />

            {/* 雪：飘着 */}
            <rect x="10" y="22" width="1" height="1" fill="#ffffff" />
            <rect x="17" y="26" width="1" height="1" fill="#ffffff" />
            <rect x="5" y="30" width="1" height="1" fill="#ffffff" />
            <rect x="21" y="33" width="1" height="1" fill="#ffffff" />
            <rect x="13" y="38" width="1" height="1" fill="#ffffff" />
            <rect x="24" y="41" width="1" height="1" fill="#ffffff" />
            <rect x="8" y="44" width="1" height="1" fill="#ffffff" />
          </g>

          {/* 夜晚：冷灰蓝的天，月亮很小很淡，雪也稀了 */}
          <g className="sky-night">
            <rect x="0" y="0" width="62" height="18" fill="#101826" />
            <rect x="0" y="18" width="62" height="14" fill="#18202e" />
            <rect x="0" y="32" width="62" height="12" fill="#202a3a" />
            <rect x="0" y="44" width="62" height="9" fill="#283444" />

            {/* 星：冬夜清冷，少 */}
            <rect x="13" y="6" width="1" height="1" fill="#e8edf8" />
            <rect x="21" y="11" width="1" height="1" fill="#cfd6e6" />
            <rect x="17" y="19" width="1" height="1" fill="#e8edf8" />
            <rect x="26" y="27" width="1" height="1" fill="#cfd6e6" />
            <rect x="19" y="35" width="1" height="1" fill="#e8edf8" />

            {/* 月：小、冷、淡 */}
            <rect x="4" y="4" width="11" height="11" fill="#333c4a" />
            <rect x="5" y="5" width="9" height="9" fill="#d8dce4" />
            <rect x="9" y="7" width="3" height="3" fill="#b8bcc8" />

            {/* 雪：夜里更稀、更暗 */}
            <rect x="11" y="24" width="1" height="1" fill="#c8d2dc" />
            <rect x="20" y="31" width="1" height="1" fill="#c8d2dc" />
            <rect x="7" y="38" width="1" height="1" fill="#c8d2dc" />
            <rect x="23" y="44" width="1" height="1" fill="#c8d2dc" />
          </g>

          {/* 白天：雪地、光秃的枝干、盖雪的灌木 */}
          <g className="land-day">
            <rect x="0" y="53" width="62" height="9" fill="#e8eef2" />
            <rect x="0" y="53" width="62" height="2" fill="#f6f9fb" />

            {/* 树：叶落光了，只剩枝干 */}
            <rect x="9" y="30" width="4" height="26" fill="#5a4638" />
            <rect x="4" y="34" width="5" height="3" fill="#5a4638" />
            <rect x="13" y="28" width="5" height="3" fill="#5a4638" />
            <rect x="2" y="40" width="5" height="2" fill="#5a4638" />
            <rect x="14" y="38" width="5" height="2" fill="#5a4638" />
            <rect x="6" y="24" width="3" height="4" fill="#5a4638" />

            {/* 灌木：盖着雪 */}
            <rect x="17" y="46" width="11" height="8" fill="#8a9aa6" />
            <rect x="17" y="44" width="11" height="3" fill="#e8eef2" />
            <rect x="19" y="42" width="7" height="3" fill="#e8eef2" />
          </g>

          {/* 夜晚：雪地反着月光（不是全黑），枝干成剪影 */}
          <g className="land-night">
            <rect x="0" y="53" width="62" height="9" fill="#3e4c60" />
            <rect x="0" y="53" width="62" height="2" fill="#4a5a70" />

            <rect x="9" y="30" width="4" height="26" fill="#1e222a" />
            <rect x="4" y="34" width="5" height="3" fill="#1e222a" />
            <rect x="13" y="28" width="5" height="3" fill="#1e222a" />
            <rect x="2" y="40" width="5" height="2" fill="#1e222a" />
            <rect x="14" y="38" width="5" height="2" fill="#1e222a" />
            <rect x="6" y="24" width="3" height="4" fill="#1e222a" />

            <rect x="17" y="46" width="11" height="8" fill="#2a3340" />
            <rect x="17" y="44" width="11" height="3" fill="#55647a" />
            <rect x="19" y="42" width="7" height="3" fill="#55647a" />
          </g>
        </svg>
      </button>

      {/*
        窗棂 / 窗台 / 盆栽：装饰，压在玻璃之上，**整组 aria-hidden**。
        玻璃那个 <button> 是这一组的**兄弟**、不在组内 —— 所以不会踩到
        「能聚焦却对读屏隐身」那个坑（地板纸片那次踩过）。
        整组 `pointer-events-none`（继承自最外层），点在窗棂上会穿透到玻璃。
      */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* 窗棂：十字 */}
        <div className="absolute bottom-[16px] left-1/2 top-[16px] w-[6px] -translate-x-1/2 bg-wood-800" />
        <div className="absolute left-[16px] right-[16px] top-1/2 h-[6px] -translate-y-1/2 bg-wood-800" />

        {/* 窗台：向左右各探出 10px，读起来才是「台面」而不是一根横杠 */}
        <div className="absolute -bottom-[10px] -left-[10px] -right-[10px] h-[12px] bg-wood-800 pixel-edge pxw-2 pxc-500" />

        {/*
          窗台上的一盆植物。它和窗台都在窗户下半截 —— 而那一段整个在机身背后，
          所以**现在实际是看不见的**。留着是因为窗户的位置 / 尺寸以后再动时它们会重新露出来。
        */}
        <div className="absolute bottom-[2px] left-[22px] h-[26px] w-[22px]">
          <div className="absolute bottom-0 left-0 h-[10px] w-[22px] bg-[#a8613f]" />
          <div className="absolute bottom-[10px] left-0 h-[3px] w-[22px] bg-[#c47a52]" />
          <div className="absolute bottom-[13px] left-[4px] h-[6px] w-[3px] bg-[#4a8c46]" />
          <div className="absolute bottom-[16px] left-[8px] h-[6px] w-[3px] bg-[#55a04f]" />
          <div className="absolute bottom-[13px] left-[12px] h-[6px] w-[3px] bg-[#4a8c46]" />
          <div className="absolute bottom-[17px] left-[15px] h-[5px] w-[3px] bg-[#3f7a3f]" />
        </div>
      </div>
    </div>
  );
}

/** 日历上「有安排的日子」的格子序号（7 列 × 6 行，从 0 数）。纯装饰，随手挑的几个。 */
const CALENDAR_MARKED = new Set([8, 16, 29]);

/**
 * 墙上的日历。挂在电视机**右侧**那片空墙上（窗户占了左边，右边一直是空的）。
 *
 * 位置和窗户同一套路：挂在这一层（= 电视机的盒子）上，用负的 `right` 把日历推到
 * 机身右边去，于是不管机身怎么改尺寸、窗口多宽，它都贴着机身右上角。
 * 竖着挂在**比窗户低一档**的地方 —— 和窗户齐平会像第二扇窗，压低一点才像「挂着的纸」。
 *
 * 高度刻意停在右侧开关列（`right-6`、上下居中）之上：那排按钮是浮层，
 * 压到它上面就会互相打架。
 *
 * **纯装饰**（`aria-hidden` + `pointer-events-none`）：日历没有能点的地方 ——
 * 留言本已经挪到地上了（见 `RoomFloorItems`）。`pointer-events-none` 还有个用处：
 * 拖进来的 ROM 能穿过去落到 `.stage` 的落点上。
 *
 * 窄窗口（接近 900px 断点）时右侧只剩几十像素墙，它会和窗户一样被 main 的
 * overflow 切掉一截。这是既有的取舍，不为它单独做自适应。
 */
export function RoomCalendar() {
  return (
    <div
      aria-hidden
      className="room-calendar pointer-events-none absolute right-[-150px] top-[10px] w-[98px] bg-[#f4f1e8] pixel-edge pxw-2 pxc-500"
    >
      {/* 线圈装订：纸上方一排小环 */}
      <span className="absolute inset-x-[12px] top-[-5px] flex justify-between">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="h-[6px] w-[4px] bg-[#8e8e9c]" />
        ))}
      </span>

      {/* 月份条：左边一块「月份」、右边一小块「年份」，都只是色块不是字 */}
      <div className="relative h-[20px] bg-[#c0392b]">
        <span className="absolute left-[10px] top-[7px] h-[6px] w-[34px] bg-[#f4f1e8]" />
        <span className="absolute right-[10px] top-[7px] h-[6px] w-[14px] bg-[#e8a3a3]" />
      </div>

      {/* 日期格：7 列 × 6 行，尺寸写死（10×9 + 2 的缝）好让整块都是整数像素 */}
      <div className="grid grid-cols-7 gap-[2px] p-[8px]">
        {Array.from({ length: 42 }, (_, i) => (
          <span
            key={i}
            className={`h-[9px] w-[10px] ${
              CALENDAR_MARKED.has(i) ? 'bg-[#c0392b]' : 'bg-[#dcd7c8]'
            }`}
          />
        ))}
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
 * 地板上随手摊着的一摊东西：一台红白机、两只连着手柄线的游戏手柄、几盘黄卡带，
 * 中间偏右压着一本**能点开的留言本**（本子上斜搁着一支笔），
 * 右下侧还躺着一张**能点开的纸片**。
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
 * 容器 `pointer-events-none`，不吃机身的拖拽落点（`pointer-events` 会继承，小件不用再写）——
 * **只有留言本和那张纸片自己写了 `pointer-events-auto`**，它们是全屋里除了吊灯
 * （见 `RoomLamp`）之外唯一能点的两样东西。
 *
 * 也正因为它们是真控件，容器**不能**再挂 `aria-hidden` —— 那会变成
 * 「能聚焦却对读屏隐身」，不合规（axe 的 aria-hidden-focus）。所以纯装饰件单独
 * 裹进一层 `aria-hidden` 的 div；这两个 `<button>` 排在那层之外。
 *
 * 颜色**全部写死**（和桌上小物、吊灯一个规矩）：物件是物件，不跟着主题换色。
 * 描边走 `pxc-500` —— 地板两套主题一深一浅（#211b16 / #ddd5c6），
 * 只有中间调的灰在两边都读得出来，和桌子、桌上那盘卡带是同一套做法。
 */
export function RoomFloorItems({
  onOpenNote,
  noteLabel,
  onOpenFeedback,
  feedbackLabel,
}: {
  /** 点中那张纸片 —— 由 ConsoleScene 把「一张纸」弹出来 */
  onOpenNote: () => void;
  /** 纸片的 title / aria-label，走 i18n 的 `note.open` */
  noteLabel: string;
  /** 点中那本留言本 —— 由 ConsoleScene 把留言面板弹出来 */
  onOpenFeedback: () => void;
  /** 留言本的 title / aria-label，走 i18n 的 `feedback.open` */
  feedbackLabel: string;
}) {
  return (
    <div
      className="room-floor-items pointer-events-none absolute left-1/2 h-[120px] w-[1020px] -translate-x-1/2"
      style={{ top: `calc(100% + ${DESK_HEIGHT}px)` }}
    >
      {/* 纯装饰件整组。`inset-0` 和容器同盒，子元素那些 left / top 坐标一个都不用改 */}
      <div aria-hidden className="absolute inset-0">
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

      {/*
        留言本。摆在**中间偏右那片空地**上：地板坐标 546..630 ——
        左边到 514 是第二盘平放的卡带、右边 664 起是立着那盘，中间这段正好空着。
        纵向和别的物件一样**骑在交界线**上（`top-[-16px]`，和红白机齐平）：
        地板在窗口里露出的高度只有 `(100vh - 机身高)/2 - DESK_HEIGHT`
        （1080 屏约 98px、900 窗口只剩 8px），整块压到线以下的话矮窗口里一个像素都不剩。

        **封面刻意做成「现在的东西」**：亮青色 + 左侧一圈白线圈 + 白色标签。
        2026-10-10 之前是深蓝封面 + 书脊 + 右侧露出的书页切口 —— 那三样凑一块儿
        就是线装古籍的封面，用户当场否掉（原话「看着像古书的封面一样」）。
        所以**书脊和页缝一个都不留**；线圈是「本子」而不是「书」的关键道具。

        笔横跨在本子上：**白色笔杆 + 深色笔尖 + 珊瑚色笔帽环 + 银色笔夹**。
        2026-10-10 之前是五段 15×3 的横条、错位 7px/4px —— 纵向步进 4 **大于**条高 3，
        每两段之间留了 1px 的缝，整根笔看着像一条虚线（用户：「笔都看不出来是笔」）。
        现在**纵向步进 3 < 条高 4**，段段咬住，连成一根实心斜杆；再靠笔尖收窄两段、
        笔帽换暗一档、笔夹补一条线，把「这是笔」补齐。
        斜线仍然拿错位横条拼，**不用 `rotate`**：转出来的边是抗锯齿的，
        跟满屋子的硬边像素不是一回事（和吊灯「用四层横条拼梯形、不画斜边」同一个道理）。
        所以那些 left / top 走内联样式 —— 拿 Tailwind 写就是十几个一次性的 arbitrary 值，
        比算式还难读。

        `pointer-events-auto` 把容器的 none 顶回来 —— 它是能点的（点开留言面板）。
        颜色全写死：本子是物件，不跟主题翻。
      */}
      <button
        type="button"
        onClick={onOpenFeedback}
        aria-label={feedbackLabel}
        title={feedbackLabel}
        className="pointer-events-auto absolute left-[546px] top-[-16px] h-[34px] w-[84px] cursor-pointer bg-[#2fb8a0] pixel-edge pxw-2 pxc-500 transition-colors hover:bg-[#3ecdb4]"
      >
        {/* 封面上下两条受光 / 背光边，给一点塑料封面的厚度感 */}
        <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-[#5fd3bd]" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-[#239a86]" />

        {/* 左侧线圈：五环，各自往封面外探出 3px —— 「本子」和「书」就靠这个分 */}
        {[4, 10, 16, 22, 28].map((top) => (
          <span
            key={top}
            aria-hidden
            className="absolute left-[-3px] h-[4px] w-[6px] bg-[#e9eef5]"
            style={{ top }}
          />
        ))}

        {/* 左上角白色标签（写留言的地方，只是色块不是字） */}
        <span aria-hidden className="absolute left-[11px] top-[5px] h-[14px] w-[26px] bg-[#fdfcf7]" />
        <span aria-hidden className="absolute left-[15px] top-[9px] h-[2px] w-[18px] bg-[#b3bccb]" />
        <span aria-hidden className="absolute left-[15px] top-[14px] h-[2px] w-[11px] bg-[#b3bccb]" />

        {/* 笔。从本子左下斜到右上，每段的 top 步进 3、条高 4 —— 咬住不露缝 */}
        {/* 笔尖（左下端）：两段收窄 */}
        <span aria-hidden className="absolute left-[27px] top-[26px] h-[4px] w-[11px] bg-[#2b2f3a]" />
        <span aria-hidden className="absolute left-[22px] top-[29px] h-[3px] w-[7px] bg-[#2b2f3a]" />
        {/* 笔杆：四段白，left 步进 6 / top 步进 3 */}
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            aria-hidden
            className="absolute h-[4px] w-[12px] bg-[#eef2f8]"
            style={{ left: 33 + i * 6, top: 23 - i * 3 }}
          />
        ))}
        {/* 笔帽：比笔杆暗一档；交界处压一圈珊瑚色环 */}
        <span aria-hidden className="absolute left-[54px] top-[14px] h-[4px] w-[3px] bg-[#ff6b6b]" />
        <span aria-hidden className="absolute left-[57px] top-[11px] h-[4px] w-[13px] bg-[#e3e9f2]" />
        {/* 笔夹：笔帽上沿的一条细线 */}
        <span aria-hidden className="absolute left-[60px] top-[9px] h-[2px] w-[9px] bg-[#c3cad6]" />
      </button>

      {/*
        那张纸片。摆在**最右下角**：地板坐标 880..922 —— 右边立着那盘卡带在 664..698、
        右手柄在 748..792，所以它落在最右那段空地上。
        **左边界不能超过 892**：描边算进去，>892 时右边缘就越过 936，
        会被 main 的 overflow 切掉（936 = 900px 窗口下的可视右界，见上面容器注释里那笔账）。

        **纵向骑在交界线上（`top-[-16px]`，和红白机齐平），别再往下。**
        地板在窗口里露出的高度只有 `(100vh - 机身高)/2 - DESK_HEIGHT`
        （1080 屏约 98px、900 窗口只剩 8px，见上面容器注释里那笔账）——
        整块压到交界线以下的话，矮窗口里它**一个像素都不剩**。
        2026-10-09 试过 `top-[10px]`，用户当场报「小纸片不见了」，就是这个原因。
        **结论：「往右」随便挪，「往下」有硬上限。**

        （那一轮用户接着又报了「还是看不见 / 往上调调」，我一度准备让它按 `50vh`
        自动上移 —— 结果用户自己确认是**看错了**：纸片一直在右下角，位置合适。
        所以这里**保持固定值**，没有加自适应。真遇到矮窗口只露一条时再说。）

        `pointer-events-auto` 把容器的 none 顶回来 —— 它是能点的。
        纸色、折角、三行「写过的字」全写死：纸是物件，不跟主题翻。
      */}
      <button
        type="button"
        onClick={onOpenNote}
        aria-label={noteLabel}
        title={noteLabel}
        className="pointer-events-auto absolute left-[880px] top-[-16px] h-[30px] w-[42px] cursor-pointer bg-[#e8dcbd] pixel-edge pxw-2 pxc-500 transition-colors hover:bg-[#f2e8d0]"
      >
        {/* 折角：右下角一块暗一档的纸背，里面再压一小块更亮的折瓣 */}
        <span className="absolute bottom-0 right-0 h-[11px] w-[11px] bg-[#cdbb92]" />
        <span className="absolute bottom-[3px] right-[3px] h-[6px] w-[6px] bg-[#f0e7cf]" />
        {/* 三行「写过的字」，宽度不一 —— 读起来是手写的，不是排版的。
            它和弹窗里那张纸上的作业本横线是一回事，只是缩小到这个尺寸画不出线 */}
        <span className="absolute left-[6px] top-[7px] h-[2px] w-[26px] bg-[#b8a67e]" />
        <span className="absolute left-[6px] top-[13px] h-[2px] w-[30px] bg-[#b8a67e]" />
        <span className="absolute left-[6px] top-[19px] h-[2px] w-[18px] bg-[#b8a67e]" />
      </button>
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
 * 它是全屋唯一能点的**家具**：灯罩 + 灯泡包在一个 <button> 里。
 * （另两处能点的都不是家具 —— 地上那本留言本和地板右下角那张纸片，
 * 都在 `RoomFloorItems` 里。）
 * 开关状态不放在 React 里 ——
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
    <div className="room-lamp pointer-events-none absolute left-1/2 top-0 -translate-x-1/2">
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
