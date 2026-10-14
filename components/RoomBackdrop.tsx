/*
 * 房间背景：墙 + 电视机后面墙上的一扇窗（窗外是春夏秋冬，每季又分昼夜，点一下换一季）
 * + 右侧墙上挂着的一幅画（七幅像素画里随机抽一幅，见 `RoomPainting`）
 * + 电视机底下那张桌子 + 桌前面地板上摊着的杂物（红白机 / 两只手柄 / 几盘黄卡带
 * / 一本压着笔的留言本 / 一根逗猫棒） + 顶上那盏吊灯
 * + 点了那根逗猫棒才会从桌上那摞书后面探出来的猫头（`TvCat`）。
 *
 * 几块**故意拆开**，因为它们要插在**不同的层**上：
 *
 *   - `RoomWall` 铺满整个房间，必须渲染在 `main` 里、**暗角（.vignette）之前** ——
 *     暗角是 `absolute inset-0` 且排在 stage 前面，靠 DOM 顺序压在背景上；
 *     墙要是跟着 stage 一起渲染，就会盖到暗角上面，四角那圈压暗全没了。
 *   - `RoomWindow` / `RoomPainting` / `RoomDesk` / `RoomFloorItems` 挂在**电视机那层
 *     relative 容器**上（ConsoleScene 里 `items-end gap-4` 那个 div），并且都排在 RetroTv
 *     **之前** —— 于是窗户贴着机身左上角、挂画贴着右上角、桌子从机身下沿往下长，
 *     都被机身挡住一部分。
 *     `RoomFloorItems` 是唯一往**下**长的（锚在墙地交界线），它得排在 `RoomDesk` **之后**
 *     才能压在桌腿上 —— 那摊东西在桌子前面。
 *   - `RoomLamp` 挂在**电视机外面**那一层（stage 容器），同样排在 RetroTv **之前** ——
 *     整盏灯（灯具 + 光晕）都要落在机身**背后**：光晕糊在屏幕画面上就毁了，
 *     而矮窗口下天花板会贴到机身顶边，灯也必须让机身压住它，**不能反过来挡着电视机**。
 *   - `TvCat`（逗猫棒点出来的那只猫）挂在电视机那层、排在 **`RoomDesk` 和 RetroTv
 *     之前** —— 它要从桌子左边那摞书后面探出头，挡住它下巴的正是那摞书
 *     （`RoomDesk` 里画），排到桌子后面就变成「浮在书上的一张猫脸」了。
 *
 * 除吊灯、窗户玻璃、地上那本留言本、地板右下角那张纸片、地板上的 MP4、
 * 以及地板上那根逗猫棒外，其余都是纯装饰：
 * 一律 `pointer-events-none` + `aria-hidden`，不能吃掉 RetroTv 的拖拽落点。
 * 全屋能点的只有**六处** —— 吊灯（灯罩 + 灯泡是 <button>）、
 * 窗户玻璃（点一下换下一季，见 `RoomWindow`）、地上那本留言本（点开是留言列表）、
 * 那张纸片（点开弹出「一张纸」）、那台 MP4（点一下播放 / 暂停）、
 * 和地板上那根**逗猫棒**（点一下，桌上那摞书后面探出一个猫头，见 `TvCat`）——
 * 后四处都在 `RoomFloorItems` 里。
 *
 * 其中**留言本已经退成彩蛋**（2026-10-10）：它打开了留言本面板的正经入口是右侧那排
 * 开关里的一颗，地板上这本留着，只是「顺手点到了也会开」的隐藏彩蛋。
 *
 * 配色分两套：墙走 `--wall-*`（globals.css），窗框和桌子走 `wood-*` 令牌，
 * 都跟着主题翻转；桌上的小物、地板杂物、吊灯、墙上那幅画都是**固定色** ——
 * 物件是物件，不该跟着室内灯开关变色。
 * **只有窗外那扇窗是特例**：它分春夏秋冬（跟 `data-season`）、每季又分昼夜
 * （跟 `data-theme`）—— 见 `RoomWindow`。但昼夜跟的是**主题**，不是吊灯：
 * 屋里白天手动开灯，窗外也不会变成晚上。
 *
 * 2026-10-10 起，几个「可选的」部件根节点各挂了一个稳定类名 ——
 * `room-lamp` / `room-window` / `room-painting` / `room-floor-items` / `room-cat` ——
 * 给**简洁模式**用：`<html data-simple="on">` 时这几块整体 `display: none`
 * （见 globals.css）。剩下的是背景墙 / 电视机 / 桌子 / 地面。
 * 类名只做钩子，样式一条都不写在这里 —— 别把它们挪进 Tailwind 的类串里。
 */

/*
 * ⚠️ 这个文件**一个 hook 都不引**，只借一个类型名。
 *
 * 「刷新时随机抽一幅画」的抽签原本来在这里（`useState` + `useEffect`），2026-10-12 加了
 * 「点开看大图」之后挪去了 ConsoleScene —— 面板要摆出来的必须是**墙上正挂着的那一幅**，
 * 「抽到的是哪一幅」因此成了 ConsoleScene 的状态，只此一份；这里改成纯收 prop。
 * **别把 `useState` 引回来**：引回来就等于这里又出现了第二份「抽到哪一幅」，两边会各说各话。
 *
 * 整个文件仍由 'use client' 的 ConsoleScene 带进客户端，所以这里用不上 'use client'。
 */
import type { MessageKey } from '@/lib/i18n';

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
 * 锚的是机身的**左上角**（这一层是电视机那个盒子），所以 2026-10-12 加尺寸档位之后
 * **这里一个字都不用改**：机身变大时窗户跟着往外挪，露出来的那两条（左 160 / 上 100）
 * 宽度不变，和机身的相对位置也就不变（用户当时的要求就是「相对位置不变」）。
 * 代价是窗口越窄、机身越大，左探的那 160px 被 main 的 overflow 切得越多。
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
 *
 * 2026-10-12 起**星星和云会动**（其余景物照旧钉着）：夜里 `.sky-stars` 整组慢闪
 * （逐颗错开周期，靠 nth-child）、白天 `.sky-clouds` 整组往右飘。
 * 两处都是把**本来就在画里的东西**归成一个 `<g>` 再让那组动，没有新增景物 ——
 * 只有云**补了第二朵**，摆在第一朵左边 62 格（= viewBox 宽）：
 * 飘满一个周期后画面与起点逐像素相同，循环无缝。
 * 动画全在 globals.css（那两段注释里写清了「改坐标要两朵一起改」），这里只管分组和坐标。
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

            {/*
              云。外面这层 `.sky-clouds` 负责**慢慢往右飘**（动画在 globals.css）。
              第二朵是**照第一朵往左挪 62 格**复制的 —— 62 正好是 viewBox 的宽，
              所以飘满一个周期之后画面和起点逐像素相同，循环无缝。
              ⚠️ 改一朵就得改另一朵，间距必须保持 62，否则接缝会露出来。
            */}
            <g className="sky-clouds">
              <rect x="6" y="15" width="16" height="4" fill="#ffffff" />
              <rect x="9" y="12" width="9" height="3" fill="#ffffff" />
              <rect x="4" y="18" width="20" height="2" fill="#eef5fb" />

              <rect x="-56" y="15" width="16" height="4" fill="#ffffff" />
              <rect x="-53" y="12" width="9" height="3" fill="#ffffff" />
              <rect x="-58" y="18" width="20" height="2" fill="#eef5fb" />
            </g>

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

            {/* 星（整组慢闪，见 globals.css 的 .sky-stars） */}
            <g className="sky-stars">
              <rect x="4" y="8" width="1" height="1" fill="#e8edf8" />
              <rect x="11" y="4" width="1" height="1" fill="#cfd6e6" />
              <rect x="19" y="10" width="1" height="1" fill="#e8edf8" />
              <rect x="24" y="5" width="1" height="1" fill="#cfd6e6" />
              <rect x="8" y="18" width="1" height="1" fill="#cfd6e6" />
              <rect x="22" y="20" width="1" height="1" fill="#e8edf8" />
              <rect x="14" y="27" width="1" height="1" fill="#cfd6e6" />
              <rect x="26" y="31" width="1" height="1" fill="#e8edf8" />
            </g>

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
            <rect x="2" y="48" width="3" height="2" fill="#d16c70" />
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

            {/* 云：一小朵 + 一朵（第二朵按第一朵左移 62 格，见 globals.css 的 .sky-clouds） */}
            <g className="sky-clouds">
              <rect x="14" y="13" width="12" height="4" fill="#ffffff" />
              <rect x="16" y="10" width="7" height="3" fill="#ffffff" />

              <rect x="-48" y="13" width="12" height="4" fill="#ffffff" />
              <rect x="-46" y="10" width="7" height="3" fill="#ffffff" />
            </g>

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

            {/* 星：夏夜最密（整组慢闪，见 globals.css 的 .sky-stars） */}
            <g className="sky-stars">
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
            </g>

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
            <rect x="25" y="49" width="3" height="2" fill="#d16c70" />

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

            {/* 云（第二朵按第一朵左移 62 格，见 globals.css 的 .sky-clouds） */}
            <g className="sky-clouds">
              <rect x="7" y="14" width="15" height="4" fill="#f0e0c8" />
              <rect x="10" y="11" width="8" height="3" fill="#f0e0c8" />

              <rect x="-55" y="14" width="15" height="4" fill="#f0e0c8" />
              <rect x="-52" y="11" width="8" height="3" fill="#f0e0c8" />
            </g>

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

            {/* 星：秋夜疏朗（整组慢闪，见 globals.css 的 .sky-stars） */}
            <g className="sky-stars">
              <rect x="20" y="6" width="1" height="1" fill="#e8edf8" />
              <rect x="26" y="12" width="1" height="1" fill="#cfd6e6" />
              <rect x="18" y="20" width="1" height="1" fill="#e8edf8" />
              <rect x="27" y="26" width="1" height="1" fill="#cfd6e6" />
              <rect x="22" y="33" width="1" height="1" fill="#e8edf8" />
            </g>

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

            {/* 云：厚（第二朵按第一朵左移 62 格，见 globals.css 的 .sky-clouds） */}
            <g className="sky-clouds">
              <rect x="4" y="14" width="18" height="4" fill="#dfe4ea" />
              <rect x="7" y="11" width="10" height="3" fill="#dfe4ea" />
              <rect x="2" y="17" width="22" height="2" fill="#eef1f4" />

              <rect x="-58" y="14" width="18" height="4" fill="#dfe4ea" />
              <rect x="-55" y="11" width="10" height="3" fill="#dfe4ea" />
              <rect x="-60" y="17" width="22" height="2" fill="#eef1f4" />
            </g>

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

            {/* 星：冬夜清冷，少（整组慢闪，见 globals.css 的 .sky-stars） */}
            <g className="sky-stars">
              <rect x="13" y="6" width="1" height="1" fill="#e8edf8" />
              <rect x="21" y="11" width="1" height="1" fill="#cfd6e6" />
              <rect x="17" y="19" width="1" height="1" fill="#e8edf8" />
              <rect x="26" y="27" width="1" height="1" fill="#cfd6e6" />
              <rect x="19" y="35" width="1" height="1" fill="#e8edf8" />
            </g>

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

/**
 * 一笔：`[x, y, 宽, 高, 颜色]`。坐标是**画布格**（整数），不是像素 ——
 * 真正的像素尺寸由外面那层 `<svg>` 的 viewBox 缩放决定。
 */
type PixelStroke = [number, number, number, number, string];

export type PixelPainting = {
  /** 画布格数（宽 × 高）= 这幅画的纵横比。窗口是见方的，差的那些边由卡纸补上。 */
  w: number;
  h: number;
  /**
   * 画名 / 作者。**只存 i18n 的键**（`lib/i18n.ts` 的 `painting.*` 那一组），
   * 由 PaintingPanel 在展示时翻成当前语言的文字 —— 屋里别的文案都走这条路，
   * 而且画名要跟着语言变（中文用户看到的该是「向日葵」而不是「Sunflowers」）。
   */
  titleKey: MessageKey;
  artistKey: MessageKey;
  strokes: PixelStroke[];
  /**
   * **只给大图用**的一版更细的画面（`public/` 下的静态图，可选）。
   *
   * 墙上这七幅都是十几格的粗颗粒 —— 挂在墙上正好，可点开放大之后每一格有二十多像素，
   * 细节全糊成方块。用户 2026-10-12 单独对第七幅（他自己那张滩涂照片）提了
   * 「点开查看大图时高清一点」，于是这一幅多备了一张 90×96 的细粒度版本：
   * **由原照片降采样 + 64 色中位切分量化**得到，仍然是硬边像素（配 `image-rendering: pixelated`
   * 放大不带插值），只是格子密了六倍，放大后认得出人。
   *
   * ⚠️ **倍率就定在 6**（= 15×16 的整倍数）：再密就看不见方块、成了马赛克照片，
   * 用户 2026-10-12 看到 120×128 那版就说「像素稍微再调低点」——
   * 比例得是墙上那版的整数倍，放大后每一格的边界才落在整像素上、不会一半亮一半暗。
   *
   * ⚠️ 为什么不直接放原照片：屋里所有画都是像素画，独独大图里蹦出一张照片，
   * 那一瞬间就「不是这个屋子里的东西」了。所以给的仍是**同一张画更细的一版**，风格不破。
   *
   * ⚠️ 为什么不把细的那版也写成 `strokes` 数组（和别的画同源）：90×96 按横条拆是几百笔，
   * 塞进源码既没法读、又白让首屏的包变大。一张 5 KB 的 PNG 等点开时才拉，更划算。
   * **墙上那幅照旧走 `strokes`**（粗颗粒那版），所以首屏不多一个请求、墙上也不变样。
   *
   * 留空 = 大图就放大 `strokes`，和以前一样。新加的几幅不用管这个字段。
   */
  detail?: string;
};

/**
 * 挂在墙上的七幅像素画 —— 前六幅是用户 2026-10-12 点名的「梵高的向日葵、蒙娜丽莎等等」，
 * 第七幅是他当天拿自己的照片（退潮的滩涂上、大人带小孩玩水）定制的。
 * 再加新的就往这个数组里 push 一个对象，别的地方一个字都不用动。
 *
 * **一律手工摆整数格**：不画斜线、不做渐变、不写旋转 —— 和屋里别的物件
 * （吊灯、逗猫棒、窗户）一个规矩，像素风里没有斜边，梯形也是拿方块堆出来的。
 * 每幅的**第一笔都是铺满整块画布的底色**，所以画布上没有透明的地方会漏出卡纸。
 *
 * 纵横比按各自的画来（向日葵横向、蒙娜丽莎 / 星月夜竖向、呐喊横向…），
 * 不是硬凑成同一个 —— 七幅画挂在墙上本来就该高一幅矮一幅。
 * 颜色全写死：画是物件，不跟主题 / 室内灯翻。
 */
export const PAINTINGS: PixelPainting[] = [
  {
    // 梵高《向日葵》：横构图，暖黄墙 + 深色桌面 + 花瓶。
    w: 16,
    h: 12,
    titleKey: 'painting.title.sunflowers',
    artistKey: 'painting.artist.sunflowers',
    strokes: [
      [0, 0, 16, 12, '#e8c95c'], // 底色：暖黄
      [0, 1, 16, 1, '#f2dd7d'], // 上方那道浅黄
      [0, 10, 16, 2, '#8a5f2a'], // 桌面
      [0, 10, 16, 1, '#a3762f'],
      [3, 5, 1, 3, '#6f7a34'], // 花茎
      [7, 5, 1, 3, '#6f7a34'],
      [12, 5, 1, 3, '#6f7a34'],
      [4, 6, 2, 1, '#7d8b3a'], // 叶
      [8, 6, 2, 1, '#7d8b3a'],
      [10, 7, 2, 1, '#7d8b3a'],
      [6, 6, 4, 1, '#b8873a'], // 瓶口
      [5, 7, 6, 3, '#a9762c'], // 瓶身
      [6, 7, 1, 3, '#c99a45'], // 瓶身的高光
      // 六朵花：4×4 花瓣 + 2×2 花心。上排三朵、中间三朵错开压在上面
      [1, 0, 4, 4, '#f4dd7a'],
      [2, 1, 2, 2, '#6b4a1c'],
      [6, 0, 4, 4, '#f4dd7a'],
      [7, 1, 2, 2, '#6b4a1c'],
      [11, 0, 4, 4, '#f4dd7a'],
      [12, 1, 2, 2, '#6b4a1c'],
      [3, 2, 4, 4, '#f4dd7a'],
      [4, 3, 2, 2, '#6b4a1c'],
      [8, 2, 4, 4, '#f4dd7a'],
      [9, 3, 2, 2, '#6b4a1c'],
      [12, 2, 4, 4, '#f4dd7a'],
      [13, 3, 2, 2, '#6b4a1c'],
    ],
  },
  {
    // 达·芬奇《蒙娜丽莎》：竖构图。雾蒙蒙的背景、长发、交叠的双手。
    w: 13,
    h: 16,
    titleKey: 'painting.title.monaLisa',
    artistKey: 'painting.artist.monaLisa',
    strokes: [
      [0, 0, 13, 8, '#6f7d5c'], // 远处的天
      [0, 8, 13, 8, '#4b3f28'], // 地面 / 远山
      [3, 2, 7, 8, '#2b2116'], // 头发（背后那一圈）
      [6, 9, 2, 2, '#d9bb96'], // 脖子
      [3, 10, 8, 1, '#2a2620'], // 肩线
      [2, 11, 9, 5, '#2a2620'], // 衣袍
      [6, 12, 1, 3, '#3a352c'], // 衣褶
      [3, 9, 1, 4, '#2b2116'], // 垂到肩上的长发（压在衣袍之上）
      [9, 9, 1, 4, '#2b2116'],
      [4, 4, 5, 4, '#e2c49e'], // 脸
      [5, 5, 1, 1, '#3a2a1c'], // 眼
      [7, 5, 1, 1, '#3a2a1c'],
      [6, 7, 1, 1, '#a8625a'], // 嘴
      [5, 13, 4, 2, '#e2c49e'], // 交叠的双手
    ],
  },
  {
    // 梵高《星月夜》：竖构图。三层夜空 + 一个漩涡 + 三颗星 + 一弯月，
    // 底下是山、村子（几扇亮着的窗）和左边那棵直插天际的柏树。
    w: 14,
    h: 16,
    titleKey: 'painting.title.starryNight',
    artistKey: 'painting.artist.starryNight',
    strokes: [
      [0, 0, 14, 16, '#1c2b62'], // 底色
      [0, 0, 14, 5, '#233579'], // 夜空三层，一层比一层亮
      [0, 5, 14, 5, '#2c4193'],
      [0, 10, 14, 2, '#3a4fa0'],
      [5, 3, 4, 1, '#7e9ae0'], // 中间那个漩涡（围成一圈）
      [9, 4, 1, 3, '#7e9ae0'],
      [6, 7, 3, 1, '#7e9ae0'],
      [4, 5, 1, 3, '#7e9ae0'],
      [2, 2, 3, 1, '#f2e08a'], // 星：十字
      [3, 1, 1, 3, '#f2e08a'],
      [6, 1, 3, 1, '#f2e08a'],
      [7, 0, 1, 3, '#f2e08a'],
      [10, 6, 3, 1, '#f2e08a'],
      [11, 5, 1, 3, '#f2e08a'],
      [11, 2, 3, 4, '#f6e79b'], // 月：整块再挖掉右边一块，剩下一个 C
      [12, 3, 2, 2, '#233579'],
      [0, 12, 14, 4, '#2e3b4e'], // 山
      [2, 12, 4, 1, '#3d4d64'],
      [9, 13, 4, 1, '#3d4d64'],
      [3, 13, 8, 3, '#2a2b35'], // 村子
      [4, 14, 1, 1, '#e8c45c'], // 亮着的窗
      [6, 14, 1, 1, '#e8c45c'],
      [8, 14, 1, 1, '#e8c45c'],
      [10, 14, 1, 1, '#e8c45c'],
      [1, 4, 1, 3, '#22301c'], // 柏树（左边那根火苗）
      [0, 7, 3, 9, '#22301c'],
      [1, 7, 1, 7, '#2f4426'],
    ],
  },
  {
    // 蒙克《呐喊》：横构图。火烧云三层、峡湾、桥栏杆和桥面，
    // 中间那个捂着耳朵的人（嘴是那一声喊），远处还有两个散步的人。
    w: 16,
    h: 13,
    titleKey: 'painting.title.scream',
    artistKey: 'painting.artist.scream',
    strokes: [
      [0, 0, 16, 3, '#ef9a44'], // 火烧云
      [0, 1, 16, 1, '#f7c46e'],
      [0, 3, 16, 2, '#e0642f'],
      [0, 5, 16, 2, '#bf4526'],
      [0, 7, 16, 3, '#2f4f70'], // 峡湾
      [0, 8, 7, 2, '#26425e'],
      [9, 7, 7, 3, '#3a5f84'],
      [0, 9, 16, 1, '#3b3629'], // 栏杆
      [0, 10, 16, 3, '#7a6440'], // 桥面
      [0, 10, 16, 1, '#8f7750'],
      [3, 9, 1, 2, '#1e1e26'], // 远处那两个散步的人
      [5, 9, 1, 2, '#1e1e26'],
      [8, 8, 4, 4, '#2b2a33'], // 人：黑斗篷
      [9, 5, 3, 3, '#d8b090'], // 脸（顶上一行留白才是额头，不然整张脸只剩眼和嘴）
      [9, 6, 1, 1, '#2b2a33'], // 眼
      [11, 6, 1, 1, '#2b2a33'],
      [10, 7, 1, 1, '#4a1f1f'], // 张着的嘴
    ],
  },
  {
    // 维米尔《戴珍珠耳环的少女》：接近方形。深背景 + 蓝头巾 + 那块黄布，
    // 左耳那颗 1 格的白珍珠是整幅画唯一的高光点。
    w: 14,
    h: 13,
    titleKey: 'painting.title.pearl',
    artistKey: 'painting.artist.pearl',
    strokes: [
      [0, 0, 14, 13, '#1c1a1e'], // 深背景
      [3, 0, 9, 3, '#3a6ec8'], // 头巾
      [9, 3, 3, 4, '#2a55a0'], // 头巾垂下来那截
      [4, 3, 6, 1, '#3a6ec8'], // 额前那圈
      [4, 4, 6, 6, '#f0d0a8'], // 脸
      [4, 4, 1, 6, '#d0a878'], // 脸的暗面
      [5, 5, 1, 1, '#2a2018'], // 眼
      [8, 5, 1, 1, '#2a2018'],
      [6, 6, 1, 2, '#d0a878'], // 鼻
      [5, 8, 3, 1, '#c0605a'], // 唇
      [6, 10, 3, 1, '#e8c9a0'], // 脖子
      [4, 11, 7, 1, '#e8e4d8'], // 白领
      [1, 12, 12, 1, '#26262c'], // 衣服
      [10, 8, 4, 5, '#d8b040'], // 肩上那块黄布
      [10, 9, 2, 2, '#e8c95c'],
      [3, 8, 1, 1, '#f6f4ec'], // 珍珠耳环
    ],
  },
  {
    // 葛饰北斋《神奈川冲浪里》：竖构图。左上那个白浪尖、卷下来的爪、
    // 浪后面那点富士山，底下一片深海里三条船。
    w: 14,
    h: 16,
    titleKey: 'painting.title.wave',
    artistKey: 'painting.artist.wave',
    strokes: [
      [0, 0, 14, 16, '#ece0c4'], // 天空
      [0, 3, 14, 5, '#2a5b8f'], // 浪头
      [0, 8, 14, 4, '#3a72a8'], // 浪下面那片中间色的海（不放的话富士山周围会漏出一圈天空色）
      [0, 8, 5, 5, '#2a5b8f'], // 浪从左往下卷
      [5, 8, 2, 2, '#2a5b8f'],
      [0, 2, 8, 2, '#f4f2e8'], // 浪尖的白沫
      [4, 1, 2, 1, '#f4f2e8'], // 溅起来的碎沫
      [7, 4, 2, 1, '#f4f2e8'],
      [9, 5, 1, 1, '#f4f2e8'],
      [8, 8, 2, 1, '#f4f2ea'], // 富士山：一级级宽下来的雪顶
      [7, 9, 4, 1, '#f0eee6'],
      [6, 10, 6, 1, '#eeece0'],
      [5, 11, 8, 1, '#eceada'],
      [8, 8, 2, 1, '#ffffff'], // 雪
      [7, 9, 2, 1, '#ffffff'],
      [0, 12, 14, 4, '#1c3f6b'], // 近处的深海
      [0, 12, 14, 1, '#2c5f92'],
      [2, 13, 4, 1, '#c8a060'], // 三条船
      [7, 13, 4, 1, '#c8a060'],
      [10, 14, 4, 1, '#c8a060'],
    ],
  },
  {
    // 用户 2026-10-12 拿照片定制的一幅：退潮后的滩涂上，一位大人（右）和一个小女孩（左）
    // 蹲在水洼边玩水。竖构图、15×16 —— 和照片一样站着看。
    //
    // 这幅的看点**全在光影**，不在人：太阳几乎在头顶，两个人往下各投出一大块**深褐色的影子**
    // （大人那块拖到脚底，女孩那块甩在左手边），两人中间那片湿沙被晒得发白。
    // 所以底色是「湿沙」而不是「沙滩」—— 黄褐色偏灰，影子用暖褐不用黑，
    // 不然和《呐喊》的黑斗篷重复了。
    w: 15,
    h: 16,
    titleKey: 'painting.title.unknown',
    artistKey: 'painting.artist.unknown',
    // 点开看大图时换成这张更细的（由用户那张原照片量化而来）—— 见 PixelPainting.detail 的注释
    detail: '/paintings/beach.png',
    strokes: [
      [0, 0, 15, 16, '#b0a07f'], // 底色：退潮后的湿沙
      [0, 0, 15, 3, '#c7bc9f'], // 远处那片浅浅的水
      [2, 1, 5, 1, '#d2c8ab'], // 水面上两道波纹
      [9, 0, 4, 1, '#bfb499'],
      [0, 2, 2, 1, '#8a7a5e'], // 水上漂着的一小块杂物
      [0, 3, 15, 1, '#dad0b2'], // 水与沙交界那条被晒亮的线
      [0, 12, 15, 4, '#a5906e'], // 近处的沙沉一档，画面才有前后
      [1, 13, 12, 2, '#b3a181'], // 近景沙上一块反光
      [3, 15, 9, 1, '#b8a684'], // 最底边那道还没干的水光
      // 影子先铺，人物再压上去
      [0, 8, 3, 4, '#5f5341'], // 女孩甩在左手边那道影子
      [0, 12, 4, 2, '#6d5f4a'], // 影子往左下拖出去、渐淡
      [7, 10, 8, 5, '#574c3b'], // 大人身下那一大块影子（一直铺到画面右边）
      [7, 10, 2, 4, '#6a5c47'], // 影子左缘淡一点，不然像块石头
      [9, 11, 4, 1, '#4c4232'], // 影子最深处
      [2, 14, 2, 1, '#94815f'], // 沙上的脚印
      [11, 14, 2, 1, '#94815f'],
      // 两人中间那片被晒得发白的水面 —— 照片里最亮的地方
      [5, 4, 6, 2, '#e8dcb6'],
      [8, 6, 2, 1, '#dbcea6'],
      // 大人（右）：白衬衫、深色短裤，头发扎起来，探身把手伸进水里
      [10, 4, 3, 2, '#e0c0a0'], // 脸
      [11, 3, 3, 1, '#241d18'], // 头顶的黑发
      [12, 4, 2, 2, '#241d18'], // 脑后扎起的那一束
      [13, 3, 1, 1, '#3a322a'], // 发束的高光
      [9, 6, 5, 3, '#f5f3ed'], // 白衬衫
      [11, 6, 1, 3, '#e3dfd4'], // 衣褶
      [8, 7, 2, 2, '#f0dcc6'], // 探下去的手臂
      [8, 9, 1, 1, '#e0c0a0'], // 手
      [9, 9, 4, 2, '#3a3630'], // 深色短裤（紧挨着衬衫下摆，中间不留缝）
      [9, 11, 3, 1, '#e8caa8'], // 蹲着的腿
      [10, 12, 1, 1, '#c8a882'], // 踩在沙上的脚
      // 女孩（左）：白衣花边领、头上别着白夹子，蹲着往水里伸手
      [4, 5, 4, 1, '#2a211b'], // 头顶的黑发
      [6, 5, 1, 1, '#f6f4ec'], // 别在头发上的白夹子
      [5, 6, 3, 2, '#e8c8a4'], // 脸（侧着，朝右边的大人）
      [4, 6, 1, 2, '#2a211b'], // 脑后的头发
      [5, 7, 1, 1, '#2a211b'], // 眼
      [3, 8, 5, 1, '#e9bcc4'], // 花边领
      [3, 9, 5, 3, '#f3f0e8'], // 白裙
      [6, 9, 1, 3, '#e0dad0'], // 裙褶
      [7, 8, 1, 2, '#eed9c0'], // 伸出去的手臂
      [4, 12, 2, 1, '#e6c8a8'], // 从裙子底下露出来的脚
    ],
  },
];

/** 挂绳的台阶（钉子往左下四格、往右下四格）。像素风不画斜线，用阶梯凑出「V」字。 */
const PAINTING_WIRE: readonly [number, number][] = [
  [40, 5],
  [30, 8],
  [20, 11],
  [10, 14],
  [50, 5],
  [60, 8],
  [70, 11],
  [80, 14],
];

/**
 * 墙上的挂画。原来是本**日历**，2026-10-12 用户要求换成挂画：
 * 「加载或者刷新页面时随机出现梵高的向日葵、蒙娜丽莎等等像素画」。七幅，刷新抽一幅；
 * 当天又加了「点一下看大图」—— 点画框弹出 `PaintingPanel`，摆出画名和作者。
 *
 * **这是个纯展示组件**：抽到哪一幅、面板开没开，全是 ConsoleScene 的事。
 * 「随机抽一幅」最初在这里（`useState` + `useEffect`），挪走的原因见文件头那段注释 ——
 * 面板必须摆出**墙上正挂着的那一幅**，这份状态只能有一处。
 *
 * 位置沿用日历那一套：挂在这一层（= 电视机的盒子）上、用负的 `right` 推到机身右边，
 * 于是不管机身怎么改尺寸、窗口多宽，它都贴着机身右上角 —— 加尺寸档位之后也不用动。
 * 整幅 100×112，比日历（98 宽）略高一点点；右侧开关列是**上下居中**的浮层，
 * 离得还远，压不到（这是当年日历「高度刻意压住」的那条约束，现在松了也仍然守着）。
 *
 * 里面全画在一张 `<svg>` 里（钉子 / 挂绳 / 画框 / 卡纸 / 画面）：
 * 整数坐标 + `crispEdges`，缩到 100px 宽也不会糊出半像素边。
 *
 * ⚠️ 画布窗口是**固定见方**的 74×74，每幅画自己按 `preserveAspectRatio` 在里面等比留边 ——
 * 于是「换画」只换像素、**不动尺寸**，不会顶得整个房间跳一下。
 * （如果让窗口跟着每幅画的纵横比走，竖构图那几幅会把整块撑高、底下全跟着挪。）
 *
 * 点击热区**只盖画框那一块**（`top-[16px]` 往下）：机身恰好 100px 宽，所以盒子就是
 * 100×112，px 值和 viewBox 的格数一一对应。钉子那一条仍旧 `pointer-events-none`，
 * 拖进来的 ROM 从那儿照样落到 `.stage` 上；**画框本身会吃掉拖放**（拖到画上松手不再载入）——
 * 这是「能点」必然的代价，和窗户玻璃、地上那几件可点的小东西一个样。
 *
 * ⚠️ 外层的 `aria-hidden` 撤掉了 —— 里面有个真按钮了。画面本身没什么可读的，
 * 名字交给那颗按钮的 `label`（「凑近看看这幅画」），画名与作者等点开之后由面板报。
 *
 * 窄窗口（接近 900px 断点）时右侧只剩几十像素墙，它会和窗户一样被 main 的
 * overflow 切掉一截。这是既有的取舍，不为它单独做自适应。
 */
export function RoomPainting({
  painting,
  onOpen,
  label,
}: {
  /** 墙上挂着的那一幅。`null` = 抽签还没落地（首帧 / 服务端那一帧），画框里是块空画布 */
  painting: PixelPainting | null;
  /** 点画框 —— 由 ConsoleScene 打开大图面板 */
  onOpen: () => void;
  /** 画框按钮的 title / aria-label，走 i18n 的 `painting.open` */
  label: string;
}) {
  return (
    <div className="room-painting pointer-events-none absolute right-[-150px] top-[10px] w-[100px]">
      {/* 画本身是装饰：可读的名字在那颗按钮的 label 上，这里别让读屏再去念一遍「图形」 */}
      <svg
        aria-hidden
        viewBox="0 0 100 112"
        className="block h-auto w-full"
        shapeRendering="crispEdges"
      >
        <rect x="48" y="0" width="4" height="5" fill="#4a4038" />
        {PAINTING_WIRE.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={10} height={3} fill="#7a6a52" />
        ))}

        {/* 画框：外沿 + 里面那圈更暗的卡槽，左边再提亮一条 —— 光从左上来，框才有厚度 */}
        <rect x="0" y="16" width="100" height="96" fill="#3a2f26" />
        <rect x="3" y="19" width="94" height="90" fill="#241d17" />
        <rect x="0" y="16" width="10" height="96" fill="#463a2e" />

        {/* 卡纸 */}
        <rect x="10" y="26" width="80" height="76" fill="#f4f1e8" />

        {/* 画面窗口：74×74 见方。底色先铺上，画还没抽出来时就是一块空画布 */}
        <rect x="13" y="29" width="74" height="74" fill="#e6dfcb" />

        {painting && (
          <svg
            x="13"
            y="29"
            width="74"
            height="74"
            viewBox={`0 0 ${painting.w} ${painting.h}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {painting.strokes.map(([x, y, w, h, fill], i) => (
              <rect key={i} x={x} y={y} width={w} height={h} fill={fill} />
            ))}
          </svg>
        )}
      </svg>

      {/*
        画框上盖一层可点的热区。和窗户同一套路：外层 `pointer-events-none`，
        只有这一层接事件。`disabled` 兜住「画还没抽出来」那一帧 —— 这时点开只会是空画布。
        悬停 / 键盘聚焦时浮一圈 accent 描边（和地上那根逗猫棒同一手法），平时不画框，
        免得墙上那张画多出一圈本不存在的边。
      */}
      <button
        type="button"
        onClick={onOpen}
        disabled={!painting}
        aria-label={label}
        title={label}
        className="pixel-edge pxw-2 pxc-accent pointer-events-auto absolute bottom-0 left-0 right-0 top-[16px] cursor-pointer opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100"
      />
    </div>
  );
}

/** 桌子总高（桌面 28 + 腿 40）。地板层靠它定位 —— 见 ConsoleScene 的地板那一段。
 *  2026-10-13 用户要求「桌腿矮点，换电视面积」：腿 70 → 40，`--tv-below-body`
 *  （globals.css）同步 154 → 124，省下的 30px 高直接进了纵向预算。 */
export const DESK_HEIGHT = 68;

/**
 * 桌子。电视机是**摆在它上面**的，桌子自己**站在地板上** ——
 * 桌腿底端正好落在墙地交界线上（ConsoleScene 的地板层按 `DESK_HEIGHT` 往下让出这一段）。
 *
 * 用 `top-full` 挂：这一层的顶边正好落在电视机的盒子下沿（= 底座着地的那条线），
 * 于是不管机身以后怎么改尺寸，桌子都会跟着走。
 *
 * 宽跟尺寸档位：`w-[var(--desk-w)]` = 机身 + **左右各 140**。那两条 140 是
 * **桌面露在机身外的窄带**，桌上小东西就摆在带子里（机身挡住的中间部分是看不见的）。
 * 140 是硬下限 —— 收窄一点点，大档下的书 / 杯子（左边）和盆栽 / 卡带（右边）
 * 就会被机身吃掉（用户 2026-10-12 明确要求「不要遮挡」）。
 * 因此桌上小物分两种定位：左边两件按 `left-*`（贴桌面左沿）、右边两件按 `right-*`
 * （贴桌面右沿）—— 桌子变宽时两边各自跟着走，**右边那两件别写回 left**。
 *
 * 高度刻意压得比较矮 —— 机身本来就 ~757 高，桌子再往下长，窗口一矮就会把腿裁掉
 * （桌子是 `absolute`，不参与 main 的高度计算，超出的部分会被 main 的 overflow 切掉）。
 * 腿原来给 70（「够读出桌子就行」），2026-10-13 用户要求再矮点换屏幕面积 → 40。
 * 想再调：改 `DESK_HEIGHT`（跟着改腿的 h-[40px]×2 和 `--tv-below-body`），全屋
 * （地板层 / 地板杂物）都锚在它上面，一处改完处处跟。
 */
export function RoomDesk() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-full w-[var(--desk-w)] -translate-x-1/2"
    >
      {/* 桌面：顶边一条受光边、底边一条厚度边 */}
      <div className="relative h-[28px] bg-wood-900 pixel-edge pxw-3 pxc-500">
        <div className="absolute inset-x-0 top-0 h-[5px] bg-wood-800" />
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-wood-950" />
      </div>

      {/* 两条腿。中间空着 —— 透出后面的地板，桌子才立得住 */}
      <div className="absolute left-[38px] top-[28px] h-[40px] w-[46px] bg-wood-950 pixel-edge pxw-3 pxc-500" />
      <div className="absolute right-[38px] top-[28px] h-[40px] w-[46px] bg-wood-950 pixel-edge pxw-3 pxc-500" />

      {/*
        桌上的小东西。一律 `bottom-full` —— 底边贴在桌面顶边上，也就是「坐在桌上」。
        只摆在左右两条露出来的窄带里（左右各 140 宽），中间那段会被机身完全挡掉。
        **左边两件按 `left-*`、右边两件按 `right-*`**：桌子跟着尺寸档位变宽时，
        两边各自贴着桌面自己的那一沿走，不会挤到机身底下去（见上面那段注释）。
        颜色全写死：物件是物件，不该跟着主题换色。
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

      {/* 小盆栽。贴桌面**右**沿（离右沿 80 = 原 1020 宽时那件东西的位置） */}
      <div className="absolute bottom-full right-[80px] h-[44px] w-[40px]">
        <div className="absolute bottom-[18px] left-[8px] h-[14px] w-[24px] bg-[#4a8c46]" />
        <div className="absolute bottom-[26px] left-[12px] h-[10px] w-[16px] bg-[#55a04f]" />
        <div className="absolute bottom-[32px] left-[16px] h-[8px] w-[8px] bg-[#5aa855]" />
        <div className="absolute bottom-0 left-[6px] h-[16px] w-[28px] bg-[#a8613f]" />
        <div className="absolute bottom-[16px] left-[4px] h-[4px] w-[32px] bg-[#c47a52]" />
      </div>

      {/* 一盘平放着的卡带（贴着桌面看过去就是一条）。同样贴桌面**右**沿，离右沿 12 */}
      <div className="absolute bottom-full right-[12px] h-[16px] w-[56px] bg-[#3a3a44] pixel-edge pxw-2 pxc-500">
        <div className="absolute inset-x-[5px] top-[3px] h-[6px] bg-[#c8c8d2]" />
      </div>
    </div>
  );
}

/**
 * MP4 屏幕里那几行「歌词」的宽度（px）。**十行 = 五行两遍** —— 整组往上走半屏
 * （`translateY(-50%)`，见 globals.css 的 `.mp4-lyric`）时，第六行正好落在第一行
 * 原来的位置，循环才无缝。屏幕宽 38，所以宽度都落在 16..34，右边那点空当是「行尾」。
 *
 * 宽度刻意参差不齐：一样长会读成一摞表格线，而不是几句字数不同的歌词。
 */
const MP4_LYRIC = [30, 20, 34, 24, 16, 30, 20, 34, 24, 16];

/**
 * 地板上随手摊着的一摊东西：一台红白机、两只连着手柄线的游戏手柄、几盘黄卡带，
 * 中间偏右压着一本**能点开的留言本**（本子上斜搁着一支笔）—— 但它是**彩蛋**，
 * 留言本的正经入口在右侧那排开关里（2026-10-10 起，见 ConsoleScene 的开关栏注释）；
 * 右下侧躺着一张**能点开的纸片**，那是「一张纸」的唯一入口；
 * 最右边、**右侧桌腿之外**，是**能点开的 MP4 播放器**（插着一副有线耳机，
 * 点一下播放 / 暂停，播放时屏幕里滚歌词）—— 它是唯一一件坐标跟着桌子走的，
 * 见下面那段注释。
 *
 * 锚在**墙地交界线**上：`top: calc(100% + DESK_HEIGHT px)`，和地板层同一个起点，
 * 所以不管机身以后怎么改尺寸，它们都跟着落在地板上。容器宽固定 1020，
 * **不跟桌子走** —— 桌子 2026-10-12 起会随尺寸档位变宽（`--desk-w`），
 * 但这摊东西的坐标是围着机身中线手调的。children 的 `left` 就直接是「地板坐标」
 * （0..1020，正中是 510 = 机身中线）。
 * ⚠️ 2026-10-13 起桌面宽**按窗口算**，1080 高的窗口上是 925 / 1029 / 1133（小 / 中 / 大）
 * —— 也就是说**小档的桌子比容器还窄**，两条桌腿会滑进容器里（右侧那条 ≈ 888..934，
 * 正好压在那张纸片 880..922 底下）。这没问题：这摊东西本来就在**桌子前面**
 * （排在 `RoomDesk` 之后），压上去正是要的效果。
 *
 * **必须排在 `RoomDesk` 之后**：这摊东西是摆在**桌子前面**的（离镜头比桌子近），
 * 要压在桌腿和桌沿上；反过来就会被桌子挡住，看着像嵌进桌子里。
 * 又因为锚点在交界线、机身底边离交界线还有一整个 `DESK_HEIGHT`，它们顶不到电视机。
 *
 * 容器高 120px 只是给 SVG 一个坐标系（viewBox 要跟它一致），东西实际只铺到
 * 交界线往下 ~52px。**刻意让每件东西都「底边在交界线以下、顶边在以上」**：
 * 地板在窗口里的可见高度 = `(100vh - 机身高)/2 - DESK_HEIGHT` ——
 * ⚠️ 2026-10-13 起这个高度已经写进纵向预算（`--tv-below-body` = 桌子总高 68
 * （桌面 28 + 腿 40）+ **这里的 52** + 4px 余量 = 124），所以三档都保证留出 ≥56px、
 * 这摊东西**不会再被窗口下沿切**（见 globals.css 顶部）。
 * ⚠️ **往更下面加东西要同时把 `--tv-below-body` 加上去**，否则大档下照样被切。
 * 越矮的窗口三档一起收，总能看见整摊东西。
 *
 * 容器 `pointer-events-none`，不吃机身的拖拽落点（`pointer-events` 会继承，小件不用再写）——
 * **只有留言本、那张纸片和那台 MP4 自己写了 `pointer-events-auto`**，
 * 它们是全屋里除了吊灯（见 `RoomLamp`）之外唯一能点的三样东西。
 *
 * 也正因为它们是真控件，容器**不能**再挂 `aria-hidden` —— 那会变成
 * 「能聚焦却对读屏隐身」，不合规（axe 的 aria-hidden-focus）。所以纯装饰件单独
 * 裹进一层 `aria-hidden` 的 div；这三个 `<button>` 排在那层之外。
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
  mp4Playing,
  onToggleMp4,
  mp4Label,
  onPokeCat,
  catWandLabel,
}: {
  /** 点中那张纸片 —— 由 ConsoleScene 把「一张纸」弹出来 */
  onOpenNote: () => void;
  /** 纸片的 title / aria-label，走 i18n 的 `note.open` */
  noteLabel: string;
  /** 点中那本留言本 —— 由 ConsoleScene 把留言面板弹出来 */
  onOpenFeedback: () => void;
  /** 留言本的 title / aria-label，走 i18n 的 `feedback.open` */
  feedbackLabel: string;
  /** 那台 MP4 在不在放。只决定屏幕里画歌词还是暂停符 —— 声音由 ConsoleScene 管 */
  mp4Playing: boolean;
  /** 点中那台 MP4 —— 由 ConsoleScene 播放 / 暂停 */
  onToggleMp4: () => void;
  /** MP4 的 title / aria-label，走 i18n 的 `mp4.play` / `mp4.pause`（由父级按状态选） */
  mp4Label: string;
  /** 点中那根逗猫棒 —— 由 ConsoleScene 让桌上那摞书后面探出一个猫头（见 `TvCat`） */
  onPokeCat: () => void;
  /** 逗猫棒的 title / aria-label，走 i18n 的 `cat.wand` */
  catWandLabel: string;
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
          耳机线。**单独一个 SVG**，不跟上面那两条手柄线共用 viewBox ——
          因为它得**跟着那台 MP4 走**：机器是贴着右侧桌腿右边摆的，横坐标靠
          `--desk-w` 算出来（见 globals.css 的 `.mp4-anchor`），桌面一随电视机尺寸
          变宽，固定坐标的线下一秒就和机器错位了。

          坐标系：这个 SVG 的**右边沿就是机器左缘**（`left` 比机器再往左 300px），
          所以本地 x=300 就是「贴着机身左缘」。线从那里往左甩，末梢两个耳机塞子
          落在本地 x≈168..184、y≈38..52。
          和手柄线同一套折线（只走水平 / 垂直段 + `crispEdges`，真画斜线会糊）。

          它仍然排在**装饰层里**（= 在所有按钮之前）：线经过的地方会被那张纸片、
          右手柄压住 —— 这正是要的效果，线从它们底下绕过去。
          `pointer-events-none` 继承自容器，所以这块 300×120 的框不会变成隐形挡板。
        */}
        <svg
          aria-hidden
          className="mp4-cord-anchor pointer-events-none absolute top-0 h-[120px] w-[300px]"
          viewBox="0 0 300 120"
          preserveAspectRatio="none"
          shapeRendering="crispEdges"
        >
          <polyline
            points="297,6 240,6 240,18 164,18 164,32 214,32 214,44 176,44"
            fill="none"
            stroke="#4a4a55"
            strokeWidth="2"
          />
          {/* 两个耳机塞子：深色外壳 + 中间一块亮面（和机身同一个色系，但深一档） */}
          <rect x="168" y="38" width="8" height="8" fill="#3a3f4d" />
          <rect x="170" y="40" width="4" height="4" fill="#8f97a8" />
          <rect x="176" y="44" width="8" height="8" fill="#3a3f4d" />
          <rect x="178" y="46" width="4" height="4" fill="#8f97a8" />
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
        地板露出来的那条有多高、为什么必须骑着线 —— 见上面容器那段注释
        （2026-10-13 起纵向预算已经把这摊东西算进去了，大档也保证留出 56px）。

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
        逗猫棒。摆在**右手柄和那张纸片之间**那条缝里（地板坐标 796..854）：
        左边 748..792 是右手柄、右边 854 起是 MP4 那根耳机线（`.mp4-cord-anchor`，
        线头那两只耳机塞子落在 858 附近），正好夹出一段几十像素的空地。
        横向**不跟桌子走**，和左右两件一样是手调的死坐标 —— 中间这段地板
        本来就不随 `--desk-w` 变。

        纵向和其他地板物件一个规矩：**骑在墙地交界线上**（`top-[-8px]`）——
        理由和那笔账见上面容器那段注释（大档现在也保证留出 56px）。
        22px 高的杆子骑在线上 = 杆躺在地板上、羽毛那头微微翘起来。

        它是**这枚彩蛋的开关**：点一下，桌上那摞书后面探出一个猫头（见 `TvCat`）。
        所以它是真控件、`pointer-events-auto` 把容器的 none 顶回来，排在 `aria-hidden`
        那层之外 —— 和留言本、纸片、MP4 同级。

        平时**不画框**（地板杂物本来就该是一摊东西），只在悬停 / 键盘聚焦时浮出
        一圈 accent 描边把「这个能点」说明白；悬停时整根再抬 2px。
        杆 / 绳 / 羽毛 / 铃铛全拿矩形拼：像素风不画斜边、不 rotate（和本子上那支笔、
        吊灯那个梯形同一个道理）。viewBox 和盒子同尺寸（58×22），所以 1 格 = 1px。
        颜色全写死：它是物件，不跟主题翻。
      */}
      <button
        type="button"
        onClick={onPokeCat}
        aria-label={catWandLabel}
        title={catWandLabel}
        className="group pointer-events-auto absolute left-[796px] top-[-8px] h-[22px] w-[58px] cursor-pointer"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-[4px] hidden pixel-edge pxw-2 pxc-accent group-hover:block group-focus-visible:block"
        />
        <svg
          aria-hidden
          className="relative block h-full w-full transition-transform duration-150 group-hover:-translate-y-[2px]"
          viewBox="0 0 58 22"
          preserveAspectRatio="none"
          shapeRendering="crispEdges"
        >
          {/* 握把（深色那截） */}
          <rect x="1" y="16" width="6" height="4" fill="#3a2c22" />
          {/* 杆：两段，右段抬高一格 —— 斜着躺在地上 */}
          <rect x="7" y="15" width="9" height="4" fill="#8a6a4a" />
          <rect x="16" y="14" width="9" height="4" fill="#8a6a4a" />
          {/* 杆上沿的受光边 */}
          <rect x="7" y="15" width="9" height="1" fill="#a8825c" />
          <rect x="16" y="14" width="9" height="1" fill="#a8825c" />
          {/* 绳：从杆梢甩上去，一级一级接（斜线也走阶梯） */}
          <rect x="25" y="12" width="2" height="3" fill="#cfc9b8" />
          <rect x="27" y="9" width="2" height="4" fill="#cfc9b8" />
          <rect x="29" y="7" width="2" height="3" fill="#cfc9b8" />
          {/* 羽毛：主体 + 上下缘各一条亮边 + 中间一道高光，最左边接一小截羽轴 */}
          <rect x="31" y="5" width="17" height="9" fill="#e0577c" />
          <rect x="34" y="3" width="11" height="2" fill="#f08aa8" />
          <rect x="34" y="14" width="11" height="2" fill="#f08aa8" />
          <rect x="36" y="6" width="7" height="5" fill="#f5a8c0" />
          <rect x="29" y="9" width="3" height="2" fill="#b8a98c" />
          {/* 小铃铛（挂绳上，羽毛下面那点空地） */}
          <rect x="30" y="17" width="5" height="4" fill="#e2b93d" />
          <rect x="30" y="20" width="5" height="1" fill="#b8912a" />
        </svg>
      </button>

      {/*
        那张纸片。摆在**最右下角**：地板坐标 880..922 —— 右边立着那盘卡带在 664..698、
        右手柄在 748..792，所以它落在最右那段空地上。
        **左边界不能超过 892**：描边算进去，>892 时右边缘就越过 936，
        会被 main 的 overflow 切掉（936 = 900px 窗口下的可视右界，见上面容器注释里那笔账）。

        **纵向骑在交界线上（`top-[-16px]`，和红白机齐平），别再往下。**
        地板露出来的那条有多高 —— 见上面容器注释里那笔账
        （2026-10-13 起纵向预算按「这摊东西最深的一件 52」配的，大档保证留出 56px；
        纸片自己只探到线下 14px，所以它是安全的）。
        2026-10-09 试过 `top-[10px]`，用户当场报「小纸片不见了」，就是这个原因。
        **结论：「往右」随便挪，「往下」有硬上限（就是那个 52）。**

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

      {/*
        那台 MP4。摆在**右侧桌腿的右边**那片空地上 —— 桌腿是 `right-[38px] w-[46px]`
        挂在桌面右沿上的，机器左缘落在腿的右边缘再往外 8px（小档 ≈ 地板坐标 990..1044）。

        ⚠️ **横坐标不写死，走 `.mp4-anchor`（globals.css）**：桌面宽跟着电视机尺寸档位
        和窗口大小变（`--desk-w` = 机身 + 280，1080 高的窗口上小 925 / 中 1029 /
        大 1133），桌腿因此整体右移 —— 写死一个
        `left-[990px]`，切到中 / 大档机器就和桌腿叠在一起了。那根耳机线同理，走
        `.mp4-cord-anchor`。**两个值必须一起改**（见 globals.css 那段算式）。

        代价：中 / 大档下它会探出地板容器（1020 宽）的右边缘（容器没有 overflow，
        所以照样画得出来，只是不再受容器约束），而窄窗口上 `main` 又只露到容器坐标
        936 以内 —— 所以**窄窗口看不见它**（和右侧桌腿、右半张桌子
        一样，本来就是会被切掉的那一截）。要看见它，窗口得够宽。

        纵向和别的物件一样骑在交界线（`top-[-20px]`）—— 这台机器比卡带高，
        所以比红白机那件多往上探 4px、底边落到交界线以下 38px。

        整台机器就是一个 `<button>`：点一下**播放 / 暂停**（见 ConsoleScene 的 toggleMp4）。
        它自己写 `pointer-events-auto` 把容器的 none 顶回来，和留言本、纸片同级 ——
        也就是**排在 `aria-hidden` 那一层之外**（里面有真控件，不能再套一层 aria-hidden）。

        播放时屏幕里是**滚动的「歌词」**（一屏五行、匀速往上走，见 globals.css 的
        `.mp4-lyric`）+ 底部几条**跳变的电平条**（`.mp4-jump`，走 steps()，硬跳不插值）；
        暂停时屏幕中央两条竖杠。整块屏幕 `overflow-hidden` —— 歌词是靠往上移出边界
        来「消失」的，不裁掉会糊到机身外面。

        **耳机线不在这里**，画在装饰层那个独立的 SVG 里（排在按钮之前，会被纸片 / 手柄压住）。
        插头那一小截留在这里（`left-[-6px]` 探出机身左缘）—— 它是机器的一部分，
        而且正好把 SVG 那条线的起点盖住，接缝就看不出来了。

        颜色全写死：这台机器是物件，不跟主题翻（和手柄、卡带一个规矩）。
      */}
      <button
        type="button"
        onClick={onToggleMp4}
        aria-pressed={mp4Playing}
        aria-label={mp4Label}
        title={mp4Label}
        className="mp4-anchor pointer-events-auto absolute top-[-20px] h-[58px] w-[54px] cursor-pointer bg-[#3f4552] pixel-edge pxw-2 pxc-500 transition-colors hover:bg-[#4a5162]"
      >
        {/* 机身上下的受光 / 背光边，给一点塑料壳的厚度 */}
        <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-[#565d6d]" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-[#2b303a]" />

        {/* 耳机插头：从机身左缘探出去的那一小截，耳机线就接在它下面 */}
        <span aria-hidden className="absolute left-[-6px] top-[20px] h-[8px] w-[7px] bg-[#1c2029]" />

        {/*
          屏幕。停着的时候就是一块暗屏（中央两条竖杠 = 暂停），
          播起来才把歌词和电平条挂进去 —— 用**条件渲染**而不是 CSS 显隐：
          那些元素带 `animation`，留在 DOM 里会一直空转。
        */}
        <span
          aria-hidden
          className="absolute left-[8px] top-[7px] block h-[30px] w-[38px] overflow-hidden bg-[#0d1a22]"
        >
          {mp4Playing ? (
            <>
              {/* 歌词：十行 = 五行两遍，往上走半屏正好接回第一行（见 MP4_LYRIC） */}
              <span className="mp4-lyric absolute inset-x-0 top-0 block">
                {MP4_LYRIC.map((width, i) => (
                  <span key={i} className="flex h-[6px] items-center">
                    <span className="h-[3px] bg-[#7fd4c0]" style={{ width }} />
                  </span>
                ))}
              </span>

              {/* 屏幕底部一条实心底栏：让电平条有个干净的落点，也把歌词「切」在下面 */}
              <span className="absolute inset-x-0 bottom-0 block h-[12px] bg-[#0d1a22]" />

              {/* 电平条：四条，相位各自错开一点，跳起来才不像一排整齐的方阵。
                  `h-[3px]` 是**动画没接管时的兜底**（错开的相位在开头有一小段空转、
                  以及系统开了「减少动态效果」时动画整个关掉）——
                  不给的话那几种情况下条子是 0 高，等于看不见。 */}
              <span className="absolute inset-x-[4px] bottom-[3px] flex items-end justify-between">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className="mp4-jump h-[3px] w-[3px] bg-[#f0c060]"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
            </>
          ) : (
            /* 暂停：两条竖杠 */
            <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-[4px]">
              <span className="h-[12px] w-[3px] bg-[#41505e]" />
              <span className="h-[12px] w-[3px] bg-[#41505e]" />
            </span>
          )}
        </span>

        {/* 十字键：一竖一横两根条 */}
        <span aria-hidden className="absolute left-[12px] top-[42px] h-[12px] w-[4px] bg-[#262a33]" />
        <span aria-hidden className="absolute left-[8px] top-[46px] h-[4px] w-[12px] bg-[#262a33]" />

        {/* 播放键：和手柄上那两颗钮同一个红 */}
        <span aria-hidden className="absolute left-[32px] top-[43px] h-[12px] w-[12px] bg-[#c0392b]" />
        <span aria-hidden className="absolute left-[34px] top-[45px] h-[8px] w-[8px] bg-[#e05a4a]" />
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

/* ------------------------------------------------------------------ *
 * 桌上那摞书后面那只猫：点了地板上那根逗猫棒才会出来的彩蛋
 * ------------------------------------------------------------------ */

/** 猫的品种。这个数组就是「一轮」里各品种出现的候选池，见 `nextCatBreed`。 */
export const CAT_BREEDS = [
  'ragdoll',
  'siamese',
  'tabby',
  'orange',
  'american',
  'tuxedo',
  'calico',
] as const;

export type CatBreed = (typeof CAT_BREEDS)[number];

/**
 * 抽下一只猫 —— 从**洗牌袋**里拿，而不是每次独立随机。
 *
 * 独立随机会连着两次抽到同一只（7 只里大概每 7 次就撞一回），而这枚彩蛋的卖点
 * 恰恰是「每次都不一样」—— 连着两次同一个品种，看起来就像坏了或者根本没换。
 * 所以改成：把七个品种洗一遍，挨个发；发完了再洗下一轮。
 * `last` 是**上一只**（跨轮用）：新的一轮里第一个正好是它的话，和第二个换个位 ——
 * 光靠洗牌挡不住「上一轮最后一个 = 这一轮第一个」。
 *
 * `bag` 由调用方持有（是它的状态，不是这里的全局变量）：本函数只负责
 * 「袋子空了就补货」，方便在组件里用 ref 存着。
 */
export function nextCatBreed(bag: CatBreed[], last?: CatBreed): CatBreed {
  if (bag.length === 0) {
    const refill: CatBreed[] = [...CAT_BREEDS];
    for (let i = refill.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [refill[i], refill[j]] = [refill[j], refill[i]];
    }
    if (last && refill.length > 1 && refill[0] === last) {
      [refill[0], refill[1]] = [refill[1], refill[0]];
    }
    bag.push(...refill);
  }
  return bag.shift() as CatBreed;
}

/**
 * 猫的花色。**颜色一律写死**（和地板杂物、吊灯、桌上的小物一个规矩）——
 * 猫是物件，不跟主题翻。
 */
interface CatCoat {
  /** 头 / 脸的主色 */
  fur: string;
  /** 深色：脸罩、额纹、头顶的斑 */
  dark: string;
  /** 嘴套（鼻子两侧那两块） */
  light: string;
  /** 耳窝 */
  earIn: string;
  /** 虹膜 */
  eye: string;
  /** 胡须 */
  whisker: string;
  /** 耳朵外侧。不给就是 `fur`；**重点色**（布偶 / 暹罗）给 `dark` */
  ear?: string;
  /** 花色：脸罩 / 额纹 / 头顶色斑 / 纯色 */
  markings: 'mask' | 'stripes' | 'cap' | 'plain';
  /** 只在 `cap` 上用：第二块色斑（三花那只的橘块） */
  blotch?: string;
}

/**
 * 七只猫。认品种靠**三样**：毛色、花纹、耳朵深浅 ——
 *   · 布偶 / 暹罗：奶白身子 + 深色耳朵脸罩 + 蓝眼睛（两只的差别在罩子有多深）
 *   · 狸花 / 橘猫 / 美短：额头三道竖纹 —— 虎斑的标志
 *   · 奶牛 / 三花：头顶一块色斑、下半张脸留白（三花多一块橘）
 */
const CAT_COATS: Record<CatBreed, CatCoat> = {
  ragdoll: {
    fur: '#f2ece1',
    dark: '#6a5647',
    light: '#fbf7f1',
    earIn: '#dfa8a8',
    eye: '#5aa8dc',
    whisker: '#9a8a78',
    ear: '#6a5647',
    markings: 'mask',
  },
  siamese: {
    fur: '#ecdcbd',
    dark: '#40332c',
    light: '#f6ecd8',
    earIn: '#6b5548',
    eye: '#4a9ed4',
    whisker: '#8a7a68',
    ear: '#40332c',
    markings: 'mask',
  },
  tabby: {
    fur: '#a8844f',
    dark: '#6b4e2b',
    light: '#e6d6b4',
    earIn: '#c98a8a',
    eye: '#9cc24e',
    whisker: '#e6d6b4',
    markings: 'stripes',
  },
  orange: {
    fur: '#e29240',
    dark: '#b8641f',
    light: '#f6dcae',
    earIn: '#d98a86',
    eye: '#8fbf4a',
    whisker: '#f6dcae',
    markings: 'stripes',
  },
  american: {
    fur: '#bac0c8',
    dark: '#6f7681',
    light: '#e6eaf0',
    earIn: '#c99a9a',
    eye: '#7ec850',
    whisker: '#e6eaf0',
    markings: 'stripes',
  },
  tuxedo: {
    fur: '#f3f1eb',
    dark: '#2b2b33',
    light: '#ffffff',
    earIn: '#d98a8a',
    eye: '#e8b83c',
    whisker: '#9a9aa6',
    markings: 'cap',
  },
  calico: {
    fur: '#f5f2ea',
    dark: '#3a3a42',
    light: '#ffffff',
    earIn: '#e09a9a',
    eye: '#e8b83c',
    whisker: '#9a9aa6',
    markings: 'cap',
    blotch: '#e08a3c',
  },
};

/**
 * 一个猫头（像素画）。viewBox 62×44，一格 1px。
 *
 * 整张脸**左右对称**（对称轴在 x=32）：耳朵、眼睛、鼻子、嘴、两把胡须都成对儿，
 * 因为这只猫是从书堆后面**往上**探头的 —— 被挡住的是下半张脸（见 `TvCat`），
 * 横向是全须全尾露在外面的。中间这个数字 32 和 `TvCat` 里那个 `left: -128`
 * 是一对儿：脸宽 48（x8..56），盒子 62 宽，所以「让脸和书堆顶那本书对齐」
 * = 盒子左边落在机身左缘往左 128 处。
 *
 * 画法沿用屋里其它像素件的规矩：只用矩形、不 rotate、不画斜边 ——
 * 耳朵是三层递减的矩形堆出来的三角，头是四行阶梯堆出来的圆
 * （和吊灯那个「四层横条拼梯形」、本子上那支「错位横条拼斜笔」同一个道理）。
 */
function CatHead({ coat }: { coat: CatCoat }) {
  const earOuter = coat.ear ?? coat.fur;
  return (
    <svg
      aria-hidden
      viewBox="0 0 62 44"
      className="block h-[44px] w-[62px]"
      shapeRendering="crispEdges"
    >
      {/* 耳朵（外）：各三层，越往下越宽 */}
      <rect x="16" y="2" width="6" height="3" fill={earOuter} />
      <rect x="13" y="5" width="10" height="4" fill={earOuter} />
      <rect x="11" y="9" width="13" height="4" fill={earOuter} />
      <rect x="42" y="2" width="6" height="3" fill={earOuter} />
      <rect x="41" y="5" width="10" height="4" fill={earOuter} />
      <rect x="40" y="9" width="13" height="4" fill={earOuter} />

      {/* 耳窝 */}
      <rect x="17" y="5" width="4" height="3" fill={coat.earIn} />
      <rect x="15" y="8" width="7" height="3" fill={coat.earIn} />
      <rect x="43" y="5" width="4" height="3" fill={coat.earIn} />
      <rect x="42" y="8" width="7" height="3" fill={coat.earIn} />

      {/* 头：四行阶梯（下宽上窄），头盖骨把耳朵根部盖住 */}
      <rect x="14" y="12" width="36" height="5" fill={coat.fur} />
      <rect x="10" y="17" width="44" height="8" fill={coat.fur} />
      <rect x="8" y="25" width="48" height="12" fill={coat.fur} />
      <rect x="11" y="37" width="42" height="5" fill={coat.fur} />

      {/* 花色。一律画在「头」之后、「眼睛」之前 */}
      {coat.markings === 'mask' && (
        <>
          <rect x="20" y="20" width="24" height="5" fill={coat.dark} />
          <rect x="16" y="25" width="32" height="10" fill={coat.dark} />
          <rect x="20" y="35" width="24" height="4" fill={coat.dark} />
        </>
      )}
      {coat.markings === 'stripes' && (
        <>
          <rect x="25" y="12" width="3" height="8" fill={coat.dark} />
          <rect x="30" y="12" width="4" height="10" fill={coat.dark} />
          <rect x="36" y="12" width="3" height="8" fill={coat.dark} />
        </>
      )}
      {coat.markings === 'cap' && (
        <>
          <rect x="14" y="12" width={coat.blotch ? 18 : 36} height="5" fill={coat.dark} />
          <rect x="10" y="17" width={coat.blotch ? 12 : 44} height="5" fill={coat.dark} />
          {coat.blotch && <rect x="32" y="12" width="18" height="5" fill={coat.blotch} />}
          {coat.blotch && <rect x="42" y="17" width="12" height="5" fill={coat.blotch} />}
        </>
      )}

      {/* 嘴套：鼻子两侧那两块浅色 */}
      <rect x="25" y="29" width="6" height="6" fill={coat.light} />
      <rect x="33" y="29" width="6" height="6" fill={coat.light} />

      {/* 眼睛。眼框统一近黑 —— 七种毛色下都读得出来 */}
      <rect x="21" y="21" width="9" height="8" fill="#241f1c" />
      <rect x="22" y="22" width="7" height="6" fill={coat.eye} />
      <rect x="24" y="22" width="2" height="6" fill="#241f1c" />
      <rect x="22" y="22" width="1" height="1" fill="#ffffff" />
      <rect x="34" y="21" width="9" height="8" fill="#241f1c" />
      <rect x="35" y="22" width="7" height="6" fill={coat.eye} />
      <rect x="38" y="22" width="2" height="6" fill="#241f1c" />
      <rect x="41" y="22" width="1" height="1" fill="#ffffff" />

      {/* 鼻子 + 嘴（粉鼻头是猫的通用色，不跟毛色走） */}
      <rect x="29" y="29" width="6" height="3" fill="#e08a9a" />
      <rect x="30" y="32" width="4" height="2" fill="#c4707e" />
      <rect x="31" y="34" width="2" height="3" fill="#4a3f38" />
      <rect x="28" y="36" width="3" height="1" fill="#4a3f38" />
      <rect x="33" y="36" width="3" height="1" fill="#4a3f38" />

      {/* 胡须：左右各三根，往脸两侧甩出去一格 */}
      <rect x="46" y="24" width="13" height="1" fill={coat.whisker} />
      <rect x="47" y="28" width="12" height="1" fill={coat.whisker} />
      <rect x="46" y="32" width="13" height="1" fill={coat.whisker} />
      <rect x="5" y="24" width="13" height="1" fill={coat.whisker} />
      <rect x="5" y="28" width="12" height="1" fill={coat.whisker} />
      <rect x="5" y="32" width="13" height="1" fill={coat.whisker} />
    </svg>
  );
}

/**
 * 从桌子**左边那三本书后面**探出来的猫头。点地板上那根逗猫棒才出现，
 * 2.9 秒后自己缩回去（时间轴在 globals.css 的 `.cat-peek` 里，和那边是一份约定）。
 *
 * 摆位（`left-[-128px]` / `bottom-[23px]` / 62×44）—— 这几个数全是从**那摞书**
 * 的几何倒推出来的，改书或改猫都要一起重算：
 *   · 书是 `bottom-full left-[20px] w-[56px]` 挂在桌面上的三本（各 10px 高），
 *     堆顶比桌面高 **30px**；三本**左对齐、越上面越窄**（56 / 52 / 48），
 *     所以紧贴堆顶那本是 48 宽 —— 猫头要藏就得藏进这一本的宽度里。
 *   · 猫头的**脸**在 SVG 里正好是 x8..56（宽 48 = 最上面那本书）→ 盒子往左挪
 *     128，这 48 格就和那本书左右对齐；`bottom: 23` 让头最下面 5px 落到堆顶
 *     （30px）之下 —— 于是**下巴被最上面那本书挡住**，露出来的是耳朵、眼睛、
 *     鼻子、嘴和两把胡须，正是「扒着书往外看」那张脸。
 *     ⚠️ 这两个值是配套的：下巴藏进去的那几行只有 42px 宽（x11..53），才有左右
 *     各 3px 余量给 `.cat-sway` 那 ±2px 的晃动。把 `bottom` 调小（藏得更多）
 *     挡的就是 48 宽那几行了 —— 一晃就会从书边上漏出一角。
 *   · 纵向锚 `bottom` 而横向锚 `left`：书堆是**挂在桌面上的**（桌面又挂在电视机
 *     下沿），所以这一堆相对「容器底边」的位置是死的，不随电视机尺寸档位变。
 *
 * ⚠️ **必须排在 `RoomDesk` 之前**（见 ConsoleScene）：挡住下巴的正是桌子那摞书，
 * 排到桌子后面就成了「浮在书上的一张猫脸」。当然也要排在 RetroTv 之前。
 *
 * ⚠️ 它探出的地方在**机身左侧 100 多像素**，而窗口窄到 900px（断点）时
 * 场景两侧的余量只剩 ~56px —— 那摞书本身就会被 main 的 overflow 切掉，
 * 猫自然也跟着看不见。想看全这只猫，窗口得开到 **1050px** 以上
 * （和右上角那幅挂画同一个门槛，见 RoomPainting 那段注释）。
 *
 * 演出靠两段 CSS 动画（`.cat-peek` 纵向升起 / 落下 + 里层 `.cat-sway` 左右晃脑袋）；
 * 本组件只在「该出现的那 2.9 秒」里挂在 DOM 上，卸载由 ConsoleScene 的定时器管。
 * 系统开了「减少动态效果」时两段动画都关掉，它就直接出现 / 直接消失（见 globals.css）。
 *
 * `role="img"` + 品种名：猫本身是画出来的、挑不出文字，但品种可以告诉读屏用户。
 */
export function TvCat({ breed, label }: { breed: CatBreed; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="room-cat cat-peek pointer-events-none absolute bottom-[23px] left-[-128px] h-[44px] w-[62px]"
    >
      <div className="cat-sway">
        <CatHead coat={CAT_COATS[breed]} />
      </div>
    </div>
  );
}

