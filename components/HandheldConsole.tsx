'use client';

import { useEffect, useRef, type ButtonHTMLAttributes, type RefObject } from 'react';
import { type ConsoleType, type LoadedRom } from '@/lib/emulator';
import type { ButtonName } from '@/lib/keybindings';
import ConsoleScreen, { deriveScreenState } from './ConsoleScreen';
import { useI18n } from './I18nProvider';

/*
 * 掌机（移动端那一套 UI）。
 *
 * 2026-10-12 加：手机 / 平板上**不再画那间屋子**（房间、电视机、桌子、吊灯全是桌面端
 * 才有的东西），换成一竖台掌机 —— **上面一块屏幕、下面按键**。
 *
 * 为什么整体换掉而不是把屋子缩小：屋子那套是横向铺开的（机身 740 + 桌面 + 窗户 + 挂画），
 * 缩到手机上每样东西都只剩几十像素；而竖着的掌机本来就是为窄屏长的。
 *
 * 屏幕和桌面端**是同一块**（`ConsoleScreen`，只是 `variant="mobile"`）——
 * canvas / 房主推来的画面 / 暂停层 / 载入进度 / 关机白线 / 联机小灯全都在，一行没少。
 * 差别只有两处：待机提示改成「从游戏库载入」（手机上**只能**从在线游戏库载入，
 * 没有拖拽、也没有选本地文件那条路），以及不画全屏那个退出口（移动端没有全屏入口）。
 *
 * **判断是不是移动端不看窗口宽度，看设备** —— 见 lib/device.ts 和
 * `<html data-mobile>`（首屏由 layout.tsx 的内联脚本写）。
 *
 * 2026-10-12 版式调整（用户要求，**从上到下重新排过一次**）：
 *   1. 机身**撑满剩下的整块区域**（根节点 `flex-1`、机身再 `flex-1`）；
 *   2. 屏幕在机身里居中、**尽量大**（宽度按视口算，见 globals.css 的 `--tv-screen-w`）；
 *   3. 原来在屏幕下面的功能排挪到**紧贴屏幕下沿**（屏幕一出来就是它），并且做小了；
 *   4. 十字键 / 面键 / SELECT / START 这一整块**沉到机身底部**（`mt-auto` 吃掉所有余量）
 *      —— 手机是两只手从下面端着、拇指往上够的，「往下一段」比「贴着屏幕」好按；
 *   5. 十字键和面键 **`items-center` 对齐，不再 `items-start`**：默认（NES / 认不出机种）
 *      面键只有一行，顶部对齐会让两颗钮孤零零悬在十字键最上面那格的高度上，够不着；
 *   6. **音量那一条整块删掉**（用户明确要求）—— 移动端没有别的音量入口了，
 *      房主本机的模拟器音量就停在默认档；加入者那条 `<video>` 仍按 props 里的 `volume` 走。
 *
 * 按键这块刻意做成「真手柄」的样子：十字键 + 面键 + SELECT / START，按下去直接把钮名
 * 打进模拟器（`onButton` → `controller.pressButton`）；联机时加入者那边则转发给房主
 * （和键盘那条路合流，见 ConsoleScene 的 `handleVirtualButton`）。
 * 面键**按机种长**（见下面 FACE_ROWS）：默认只有 B / A 两颗，载入 SFC 或街机再长出其余的。
 *
 * 2026-10-12 再调：十字键 / 面键的**尺寸跟着视口走**（`--pad-btn`，36→54 分五档，
 * 见 globals.css 第 5 条）—— 用户原话「判断屏幕的大小，可以适当加大，现在太小了」。
 */

/**
 * 面键布局，按机种给。**默认（没插卡带 / 认不出机种）只有 B / A 两颗** ——
 * 这是用户 2026-10-12 的要求：先给最小的那套，载入哪盘再按机种长出其余的键。
 *
 * 每一行是一个数组，`null` 是**占位空格**（SFC 那个十字摆法要用）。
 * 每格是 `[显示名, 按钮名]`，按钮名是 retropad 那套（见 lib/keybindings.ts 的 ButtonName）：
 *
 *   · NES / SFC 的字母**直接对应**（B→`b`、A→`a`、Y→`y`、X→`x`）；
 *   · 街机走本项目的**街机叫法**（A B C / X Y Z → `b a y x l r`），
 *     和 KeyBindingsPanel 面板上那一列完全一致 —— 那是唯一权威。
 *
 * ⚠️ SFC 的 Y / X 用 `y` / `x`，**不是**面板里街机叫法的 Y→`l`：街机的 Y 是第 5 个钮
 * （落在 `l`，肩键位），而 SFC 的 Y 是四个面键之一（`y`）。两者同名不同键，
 * 只能按机种分开写，否则按 SFC 的 Y 会去按肩键。
 */
const FACE_ROWS: Record<ConsoleType, ([string, ButtonName] | null)[][]> = {
  // B 在左、A 在右（红白机手柄的样子）
  nes: [[['B', 'b'], ['A', 'a']]],
  // 十字摆法（上 X / 左 Y / 右 A / 下 B），和 SFC 手柄一致；空位用 null 占住
  snes: [
    [null, ['X', 'x'], null],
    [['Y', 'y'], null, ['A', 'a']],
    [null, ['B', 'b'], null],
  ],
  // GBA：面键只有 B / A（B 左 A 右，和 GBA 机身一致），
  // 肩键 L / R 单独摆一行 —— 机身顶部那两颗，掌机上只能和面键并列呈现
  gba: [
    [['B', 'b'], ['A', 'a']],
    [['L', 'l'], ['R', 'r']],
  ],
  // 街机六键：上排 A B C、下排 X Y Z
  arcade: [
    [['A', 'b'], ['B', 'a'], ['C', 'y']],
    [['X', 'x'], ['Y', 'l'], ['Z', 'r']],
  ],
};

/** 认不出机种时用哪一套 —— 就是 NES 那两颗，也是「默认只有 b / a」那条要求 */
const DEFAULT_FACE: ConsoleType = 'nes';

interface HandheldConsoleProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  screenRef: RefObject<HTMLDivElement | null>;
  rom: LoadedRom | null;
  crtOff: boolean;
  remoteStream: MediaStream | null;
  remotePlaying: boolean;
  remotePaused: boolean;
  netplayLive: boolean;
  /** 同 RetroTv：房主开着房、还没人进来 —— PWR 灯变黄（那边写了为什么只认房主） */
  netplayWaiting: boolean;
  paused: boolean;
  busy: boolean;
  loading: { ratio: number | null } | null;
  /** 有存档可读 —— 一个槽都没有时「读档」是灰的 */
  canLoad: boolean;
  volume: number;
  /**
   * 加入者那边**房主插着的那盘卡带**（`netplayState.remoteGame`）。
   *
   * 加入者本机 `rom` 是 null（他没跑模拟器），可虚拟面键得知道他该长几个 ——
   * 只有这个字段能回答。房主那盘是街机就长六键。
   */
  remoteGameConsole: ConsoleType | null;
  /** 点屏幕 —— 移动端就是打开在线游戏库 */
  onOpenLibrary: () => void;
  /** 虚拟键按下 / 松开。玩家号、联机转发都在父级决定 */
  onButton: (button: ButtonName, down: boolean) => void;
  onTogglePause: () => void;
  onSave: () => void;
  onLoad: () => void;
  onReload: () => void;
  onEject: () => void;
}

export default function HandheldConsole({
  canvasRef,
  screenRef,
  rom,
  crtOff,
  remoteStream,
  remotePlaying,
  remotePaused,
  netplayLive,
  netplayWaiting,
  paused,
  busy,
  loading,
  canLoad,
  volume,
  remoteGameConsole,
  onOpenLibrary,
  onButton,
  onTogglePause,
  onSave,
  onLoad,
  onReload,
  onEject,
}: HandheldConsoleProps) {
  const { t } = useI18n();
  /**
   * 同 RetroTv：借 ConsoleScreen 的判断算 PWR 灯的颜色，免得两处漂开。
   * 五档取值也**必须**和那边一字不差
   * （房主等人 warn / 没画面暗 / 暂停 accent / 单人 ok / 联机 info）——
   * 改颜色两边一起改，改完搜 `pwrClass` 核一遍。
   */
  const { hasPicture, showPaused } = deriveScreenState({
    rom,
    remoteStream,
    remotePlaying,
    paused,
    remotePaused,
  });
  const pwrClass = netplayWaiting
    ? 'bg-warn'
    : !hasPicture
      ? 'bg-ink-600'
      : showPaused
        ? 'bg-accent'
        : netplayLive
          ? 'bg-info'
          : 'bg-ok';

  /*
   * 面键长几个：本机插着的那盘说了算；本机没有（加入者）就看房主那盘；
   * 两个都没有（还没载入任何东西）就用默认那两颗。
   */
  const faceConsole = rom?.console ?? remoteGameConsole ?? DEFAULT_FACE;
  const faceRows = FACE_ROWS[faceConsole];

  /**
   * 按下去的那几个钮。松手 / 切走时要按名单补上 keyup —— 虚拟键和物理键盘不一样：
   * 手指按住时页面不会给任何「还按着」的信号，**只能自己记账**。
   */
  const pressed = useRef<Set<ButtonName>>(new Set());

  /*
   * `onButton` 每次都可能是新函数（父级的依赖里有联机角色），而这个 effect 只挂一次。
   * 用 ref 转一手，免得 effect 里攥着一个过期的闭包 —— 也免得依赖一变就重挂监听
   * （重挂本身会触发一次 releaseAll，手指还按着的话那一下就丢了）。
   */
  const onButtonRef = useRef(onButton);
  useEffect(() => {
    onButtonRef.current = onButton;
  }, [onButton]);

  /** 按 / 松。重复的按下（手指抖一下连发两次 pointerdown）不重复发。 */
  const press = (button: ButtonName, down: boolean) => {
    const set = pressed.current;
    if (down) {
      if (set.has(button)) return;
      set.add(button);
    } else {
      if (!set.has(button)) return;
      set.delete(button);
    }
    onButtonRef.current(button, down);
  };

  /**
   * 切走标签页 / 切走窗口 / 卸载时，把手里的钮一次性松开。
   *
   * 浏览器**不会补发** pointerup，不补的话房主那边会一直以为你按着那个方向，
   * 角色自己往边上走（和联机那条键盘转发里的 releaseAll 是同一个理由）。
   *
   * 这段只在 effect 里用，所以直接写在 effect 里 —— 定义在外面会被
   * `react-hooks/exhaustive-deps` 要求进依赖，而它每次渲染都是新函数。
   */
  useEffect(() => {
    const releaseAll = () => {
      for (const button of pressed.current) onButtonRef.current(button, false);
      pressed.current.clear();
    };
    const onVisibility = () => {
      if (document.hidden) releaseAll();
    };
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', onVisibility);
      releaseAll();
    };
  }, []);

  return (
    /*
     * 根节点：**撑满父容器**（`.room` 是竖排 flex，这里 `flex-1` 吃掉开关栏之外的全部高度）。
     * 机身再 `flex-1` 吃掉除底座之外的全部 —— 机身里屏幕那几样是固定高的，多出来的高度
     * 由控制区的 `mt-auto` 收走（见下面那段）。于是「机身沾满剩下的区域」和
     * 「操作键沉到底部」是同一件事的两面。
     */
    <div className="relative flex w-full flex-1 flex-col">
      <div className="flex flex-1 flex-col bg-ink-700 pixel-edge pxw-6 pxc-500">
        {/*
          顶沿。桌面那台电视机这里是一条散热缝 + 版本铭牌；掌机上收成一行：
          **左边 PWR 灯**（2026-10-13 起；再早是左边机名、右边灯）——
          灯和电视机上那颗是同一个意思（房主等人黄、没画面暗、暂停 accent、单人绿、
          联机蓝），只是位置挪到了顶沿左端。

          ⚠️ **为什么从右边挪到左边**（2026-10-13 用户要求）：菜单钮在移动端也挪到了
          页面右上角，而它是一颗 `position: fixed` 的浮钮，压住的正是这条顶沿的右端 ——
          灯留在右边就会被钮盖住。灯和钮一个占左、一个占右，互不挡。
          两处的改动是一件事，**改一边要看另一边**（菜单钮那边见 globals.css 的
          `.menu-btn` 与 ConsoleScene 那颗钮的注释）。

          2026-10-12 后半段用户要求「去除左上角的 nesload」：机名那块 `<span>` 整块删了。
          ⚠️ 别再补回机名 —— 站名要出现的地方走 `lib/i18n.ts` 的 `SITE_NAME`，
          而且用户明确说这儿不要。
        */}
        <div className="relative flex h-[26px] items-center border-b-2 border-ink-800 bg-ink-850 px-4">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-ink-950/45" />
          {/* `mr-auto` 把灯顶到最左；右边空着留给页面右上角那颗菜单钮 */}
          <span className="relative mr-auto flex items-center gap-2">
            <span className={`h-2.5 w-2.5 ${pwrClass}`} />
            <span className="font-pixel text-[8px] text-ink-500">PWR</span>
          </span>
        </div>

        {/*
          机身内圈 + 屏幕（和电视机同款；尺寸由 globals.css 按 data-mobile 覆盖）。

          `screen-frame` 这个类**只有掌机上挂**（电视机那份不挂）：掌机上内圈要收成
          「屏幕宽 + 左右各 4px 内衬」并居中（`fit-content` + 左右 `auto` + `padding: 0 4px`）
          —— 内衬从 10 收到 4，屏幕才比桌面那套宽出一大截；**内圈本身留着**，
          机身的边框（两级像素描边）一点没动。所以这里只写上下外边距 `my-[8px]`，
          左右全部交给那条规则（详见 globals.css 第 3、4 条）。
        */}
        <div className="screen-frame relative my-[8px] bg-ink-900 pixel-edge pxw-4 pxc-700">
          <ConsoleScreen
            canvasRef={canvasRef}
            screenRef={screenRef}
            rom={rom}
            crtOff={crtOff}
            remoteStream={remoteStream}
            remotePlaying={remotePlaying}
            remotePaused={remotePaused}
            netplayLive={netplayLive}
            paused={paused}
            loading={loading}
            volume={volume}
            /* 掌机上没有拖拽，这一路恒为 false */
            fileOver={false}
            variant="mobile"
            onTap={onOpenLibrary}
          />
        </div>

        {/*
          机身功能排：暂停 / 存档 / 读档 / 重载 / 弹出。
          和电视机前面板那五颗是**同一批动作**（文案也共用 `panel.*`），
          只是掌机上地方小，排成一行五格、钮也做小一档（`py-1` / 10px 字）。

          **贴在屏幕下沿**（用户 2026-10-12 要求，原来在按键那一段的最下面）——
          这几颗是「换卡带 / 停一下」这类**整机操作**，和屏幕是一回事；
          而十字键 / 面键是「游戏里怎么动」，那一段沉到机身底部。
          两件事分开之后，手不用在同一个地方又操作机器又操作游戏。

          这几个在移动端是**唯一**的入口 —— 键盘快捷键 2026-10-10 全撤了，
          手机上更没有键盘。所以 disabled 只在没卡带 / 载入中时成立。

          宽度**跟着屏幕走**（`mx-auto` + `w-[var(--tv-screen-w)]`）：五颗钮正好压在内圈
          那条描边之内、和屏幕左右对齐。那个变量桌面端也有定义（值随窗口和档位变），
          但这一排只在掌机上渲染，所以不会串到电视机上去。
        */}
        <div className="mx-auto grid w-[var(--tv-screen-w)] grid-cols-5 gap-1 px-1.5">
          <PanelBtn onClick={onTogglePause} disabled={!rom || busy}>
            {paused ? t('panel.resume') : t('panel.pause')}
          </PanelBtn>
          <PanelBtn onClick={onSave} disabled={!rom || busy}>
            {t('panel.save')}
          </PanelBtn>
          <PanelBtn onClick={onLoad} disabled={!rom || busy || !canLoad}>
            {t('panel.load')}
          </PanelBtn>
          <PanelBtn onClick={onReload} disabled={!rom || busy}>
            {t('panel.reset')}
          </PanelBtn>
          <PanelBtn onClick={onEject} disabled={!rom || busy} danger>
            {t('panel.eject')}
          </PanelBtn>
        </div>

        {/*
          ---------------- 控制区 ----------------

          上下各垫一段**弹性留白**（`flex-[2]` : `flex-1`），把机身里多出来的高度
          按 2:1 分掉 —— 于是控制区既不贴着屏幕（那样手要够到屏幕边上），
          也不再死死贴在机身最下沿。

          2026-10-12 用户先要求「操作按钮往下移」，改完又说「操作按钮太下了」：
          贴底那一版在 390×844 上离屏幕下沿 43px、离视口底只剩 43px，手指正好压在
          手机的返回手势带上。现在改成偏下 2/3 处（同一台机上是离屏幕 155px、
          离底 104px）。**上下比例就是这两个 flex 值**：想再高一点就把上面调大
          （`flex-[3]` / `flex-[4]`），想更贴底就调小。
          留白没有内容、`flex-basis: 0`，屏幕挤不下时先缩到 0，不会把按键顶出机身。
        */}
        <div aria-hidden className="flex-[2]" />
        <div className="flex flex-col gap-8 px-4 pb-4">
          {/*
            十字键 + 面键。两边都靠 `justify-between` 贴到最左 / 最右 ——
            真手柄就是这么摆的（左手拇指在左、右手拇指在右），中间那块空出来的地方
            正好是两只手掌。

            `items-center`（原来 `items-start`）：默认（NES / 认不出机种）面键只有一行，
            顶对齐会让那两颗钮悬在十字键最上面那一格的高度 —— 右手拇指得专门往上够
            （用户 2026-10-12 原话「不要顶部对齐，更适合双手拿手机按」）。
            居中对齐后它落在十字键的中间高度上，和真手柄一致。
          */}
          <div className="flex items-center justify-between gap-3">
            <DPad onPress={press} />
            <FacePad rows={faceRows} onPress={press} />
          </div>

          {/*
            SELECT / START。放十字键下面、两键居中 —— 真机上也是这两个在中间
            （FC 手柄在中间偏下、SFC 在中间，都居中）。
            名字走 font-pixel（只有 ASCII，没有掉字形的问题），和机身上那些铭牌同一套。

            ⚠️ 和上面那排的**上下间距**（`gap-8` = 32px，原来是 `gap-3` = 12px，
            中间试过 `gap-5` = 20px，用户看完还是要求「再增大点 防止误触」）：
            这个值就是外面那个 `flex-col` 的 `gap`（这段里只有这两个孩子，所以
            gap 全用在这一处）。**别再偷偷调小** —— 那 32px 减掉两侧 pxw-2 描边
            伸出来的 4px，看着是 **28px**，拇指从十字键往下滑才不会蹭到 SELECT。

            ⚠️ 音量那一条 2026-10-12 **整块删了**（用户要求），别再补回来。
          */}
          <div className="flex items-center justify-center gap-8">
            <PillBtn label="SELECT" button="select" onPress={press} />
            <PillBtn label="START" button="start" onPress={press} />
          </div>
        </div>
        {/* 下面那段留白（比例见上），就是机身的「下巴」 */}
        <div aria-hidden className="flex-1" />
      </div>

      {/* 底座：和电视机那条同一个意思，只是掌机上收窄一些 */}
      <div className="mx-auto mt-[3px] h-[14px] w-[76%] bg-ink-700 pixel-edge pxw-4 pxc-500" />
    </div>
  );
}

/**
 * 十字键。做成**真的十字**：3×3 的格子里四角空着、正中间是个装饰块 ——
 * 四个方向键连着读起来才像一支十字键，摆成一排四个箭头就只是个方向按钮组。
 */
function DPad({ onPress }: { onPress: (button: ButtonName, down: boolean) => void }) {
  /**
   * 3×3 的格子，`null` 是空格（四角 + 正中间那块装饰）。
   * 类型收成方向那四个（而不是 ButtonName）—— 这样 `ARROW_LABEL[button]` 才查得动，
   * 十字键本来也只长这四个。
   */
  const cells: (DirButton | null)[] = [null, 'up', null, 'left', null, 'right', null, 'down', null];
  return (
    <div className="grid grid-cols-3 gap-[2px]">
      {cells.map((button, i) =>
        button ? (
          <PadBtn key={button} button={button} label={ARROW_LABEL[button]} onPress={onPress} />
        ) : (
          <span
            key={`gap-${i}`}
            aria-hidden
            className={i === 4 ? 'bg-ink-600' : ''}
          />
        )
      )}
    </div>
  );
}

/** 十字键那四个方向钮（`ButtonName` 里的方向子集） */
type DirButton = 'up' | 'down' | 'left' | 'right';

/**
 * 十字键那四个箭头。
 *
 * **刻意不用 font-pixel**（Press Start 2P）：那套字模没有箭头字形，用了会掉回系统字体，
 * 和旁边的字母混排出两种字形 —— 和「按键说明」弹窗里 ↑↓←→ 那处是同一个坑
 * （见 ConsoleScene 里那个弹窗的注释）。这里是纯字符，走系统字体最稳。
 */
const ARROW_LABEL: Record<DirButton, string> = {
  up: '▲',
  down: '▼',
  left: '◀',
  right: '▶',
};

/**
 * 面键。按行摆（`FACE_ROWS` 给什么摆什么），整组贴右边 —— 右手拇指的位置。
 * 行里的 `null` 会画成一个空格子，SFC 那个十字才摆得正。
 *
 * `FACE_GAP` = **格与格之间的间距**（行内横向、行与行纵向共用同一个值）。
 *
 * ⚠️ 14 不是随手写的：每颗钮是 `pixel-edge pxw-2` —— 描边是四向 `box-shadow`
 * **画在盒子外面**的（见 globals.css 的 `.pixel-edge`），所以两颗钮之间**看得见**的
 * 缝 = gap − 2 − 2。原来 gap 是 6px ⇒ 实际只剩 **2px**，B / A 像粘在一起
 * （用户 2026-10-12 后半段原话「nes模式 b a按钮之间增加间距 现在太近」）。
 * 14 减掉描边那 4px = **10px 可见缝**，两只拇指不会误触。
 *
 * 纵向也用同一个值：SFC 那四颗是**菱形**摆法（X 上 / Y 左 / A 右 / B 下），
 * 横向和纵向的缝不一样宽的话菱形就拉扁了。代价是 SFC / 街机的控制区比原来高
 * 8~16px（NES 只有一行，不受影响）—— 小屏上那一档本来就靠滚动兜底，没有回退。
 *
 * ⚠️ **不跟 `--pad-btn` 一起长**（钮 36→54 了，缝隙仍是 14）：globals.css 里那个尺寸台阶的
 * 上限就是按 FACE_GAP=14 算的（三列面键 = 3b + 2×14），缝隙一动那个式子就作废。
 * 真嫌缝窄，改这里的同时必须回去重算 `--pad-btn` 那几档。
 */
const FACE_GAP = 14;

function FacePad({
  rows,
  onPress,
}: {
  rows: ([string, ButtonName] | null)[][];
  onPress: (button: ButtonName, down: boolean) => void;
}) {
  return (
    <div className="flex flex-col items-end" style={{ gap: FACE_GAP }}>
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex items-center" style={{ gap: FACE_GAP }}>
          {row.map((cell, cellIndex) =>
            cell ? (
              <PadBtn key={cell[1]} button={cell[1]} label={cell[0]} onPress={onPress} />
            ) : (
              <span
                key={`gap-${cellIndex}`}
                aria-hidden
                className="h-[var(--pad-btn)] w-[var(--pad-btn)]"
              />
            )
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * 手柄上的一个方钮（十字键 / 面键共用）。
 *
 * 尺寸走 `--pad-btn` / `--pad-font`（globals.css 里那组按视口宽度分档的变量）——
 * 2026-10-12 用户要求「判断屏幕的大小，适当加大」，原来写死 36px 在手机上偏小。
 * 台阶（而不是 `clamp`）的理由和上下限见 globals.css 第 5 条。
 *
 * 三件事都必须在：
 *   · `touch-none`（`touch-action: none`）—— 手指按在钮上滑动时不要滚页面 / 缩放，
 *     不然按方向键时整个页面会跟着晃；
 *   · `select-none` + `onContextMenu` 拦掉 —— 手机上长按会选中文字、弹出「复制」菜单；
 *   · `onPointerLeave` / `onPointerCancel` 都要松手 —— 手指滑出钮外还按着不放
 *     会让角色一直往那个方向走（浏览器不会补发 pointerup）。
 */
function PadBtn({
  button,
  label,
  onPress,
}: {
  button: ButtonName;
  label: string;
  onPress: (button: ButtonName, down: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        // 拦掉默认行为：不然按住时会被当成拖拽 / 长按选择
        e.preventDefault();
        onPress(button, true);
      }}
      onPointerUp={() => onPress(button, false)}
      onPointerCancel={() => onPress(button, false)}
      onPointerLeave={() => onPress(button, false)}
      onContextMenu={(e) => e.preventDefault()}
      /*
       * `text-[length:var(--pad-font)]` 那个 `length:` 前缀不能省：`text-[…]` 既能吃字号
       * 也能吃颜色，塞一个 `var()` 进去 Tailwind 判不出类型 —— 带上类型提示才是字号。
       */
      className="pixel-edge pxw-2 flex h-[var(--pad-btn)] w-[var(--pad-btn)] touch-none select-none items-center justify-center bg-ink-600 font-pixel text-[length:var(--pad-font)] leading-none text-ink-100 transition-colors active:bg-ink-500 active:text-accent"
    >
      {label}
    </button>
  );
}

/** SELECT / START。窄长条，和真手柄上那两个一样是「扁的」。 */
function PillBtn({
  label,
  button,
  onPress,
}: {
  label: string;
  button: ButtonName;
  onPress: (button: ButtonName, down: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress(button, true);
      }}
      onPointerUp={() => onPress(button, false)}
      onPointerCancel={() => onPress(button, false)}
      onPointerLeave={() => onPress(button, false)}
      onContextMenu={(e) => e.preventDefault()}
      className="pixel-edge pxw-2 touch-none select-none bg-ink-600 px-3 py-1.5 font-pixel text-[9px] leading-none text-ink-100 transition-colors active:bg-ink-500 active:text-accent"
    >
      {label}
    </button>
  );
}

/**
 * 功能钮（暂停 / 存档 / 读档 / 重载 / 弹出）。
 *
 * 和电视机前面板那排（RetroTv 里的 `PanelBtn`）是同一套视觉，只是**这里不复用**：
 * 那边是定宽 52px 的格子、字号写死 10px，靠父级的写死列宽撑；掌机上宽度是跟着屏幕
 * 流出来的，得自己撑。两边的尺寸来源完全不同，硬凑成一个组件反而要多传一堆参数。
 *
 * `py-1` / 10px 字（电视机那边是 `py-2.5`）—— 用户 2026-10-12 要求「按钮小一点」：
 * 这一排紧挨着屏幕下沿，做高了屏幕就被推下去一截，手机上每一像素都金贵。
 */
function PanelBtn({
  danger = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      type="button"
      className={`pixel-edge pxw-2 bg-ink-600 py-1 text-[10px] text-ink-100 transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        danger
          ? 'pxc-500 enabled:hover:bg-ink-500 enabled:hover:text-danger'
          : 'pxc-500 enabled:hover:bg-ink-500 enabled:hover:text-accent'
      } ${className}`}
      {...props}
    />
  );
}
