import type { ButtonHTMLAttributes, DragEvent, ReactNode, RefObject } from 'react';
import packageJson from '@/package.json';
import { VOLUME_MAX, type LoadedRom } from '@/lib/emulator';
import ConsoleScreen, { deriveScreenState } from './ConsoleScreen';
import { useI18n } from './I18nProvider';

/*
 * 机身尺寸。
 *
 * 屏幕是 4:3（NES 画面的比例），**尺寸写在屏幕那个 div 的 class 上**
 * （`h-[var(--tv-screen-h)] w-[var(--tv-screen-w)]`，见下面那段注释 —— 别删、
 * 别改成让 canvas 撑，也别改成内联 style）。机身宽度 = 屏幕 + 内圈左右外边距 10×2，
 * 2026-10-13 起**钉死**在机身那个 div 上（`w-[var(--tv-w)]`，见那段注释）——
 * 不能再让它靠内容撑：前面板那一排固定尺寸的控件比屏幕宽时会把机身撑宽，
 * 而屏幕在机身里是左对齐的，右边就空出一条（用户报的「小档右侧大片空白」）。
 *
 * ⚠️ 2026-10-12 起这些数字**不再是常量**：屏幕 / 机身 / 底座 / 桌面的尺寸都由
 * `<html data-tv>` 那组 CSS 变量给（三档：小 / 中 / 大）。
 * ⚠️ 2026-10-13 起三档也**不再是写死的 px**（原来是 720 / 840 / 960）：现在先按窗口
 * 算出「屋子最多塞得下多大的屏幕」，三档各取它的 80% / 90% / 100% —— 所以同一档在
 * 不同窗口上量出来不一样，大屏上「大」能到一千多像素。算法在 globals.css 顶部
 * 「档位是占比」那段，档位的类型和循环顺序在 lib/tv-size.ts。
 * 顶沿、内圈外边距、像素描边、前面板、底座**高**这些刻意不随档位变
 * （理由见 globals.css 那段注释），所以下面这些是「不随档位动的那一套」：
 *
 *   顶沿 30 · 内圈外边距 m-[8px] mx-2.5 · 内圈描边 pxw-4 · 机身描边 pxw-6
 *   前面板（py-2.5 撑出来）· 底座高 18（宽跟 --tv-base-w）
 *
 * 底部那个 68px 的**插卡舱已经撤掉**（2026-10-09，用户要求）：拖拽落点本来就是整机，
 * 卡槽只是个多余的入口，留着还白占 70px 高度。现在「怎么开始玩」由屏幕里的提示负责。
 *
 * 场景原先 = 屏幕 766 那版 + 间距 16 + 卡带架 220 ≈ 1002，加 main 的 px-6 是 1050px，
 * 断点 1100px。卡带架 2026-10-09 撤掉、屏幕外边距同期从 15 收到 10 之后只剩
 * 740 + px-6 = **788px**（那是 1080p 窗口上「小档」的量法，别的窗口上会不一样）。
 *
 * ⚠️ 2026-10-13 起**那个 900px 断点不再管尺寸**了：窄窗口原先会整页换成一块
 * 「请用桌面端」的提示（`notice.desktopOnly`，已删），现在改成**整条尺寸链跟着窗口收**
 * —— `--tv-screen-w` = 「屋子塞得下的最大屏幕」× 档位占比，房子小到装得下为止。
 * 所以「900px 以下会把机身切掉」这个老问题没有了：任何宽度下它都自动缩到合适。
 * 尺寸链在 globals.css 顶部，那一段「窗口收窄 / 变矮」里写了算法。
 * ⚠️ 但屏幕**有个下限**（`--tv-screen-min`，2026-10-13 补，理由见 globals.css）：
 * 触底之后就不再跟着窗口缩了，屋子会被 main 的 overflow-hidden 裁掉一点 —— 这是
 * 「机身永远 = 屏幕 + 20」的代价，也保证前面板那排钮不会被压到读不出来。
 *
 * ⚠️ globals.css / README 里写的「机身 766 / 屏幕外边距 15」是屏幕还自己带
 * 15px 外边距时的数字，2026-10-10 起实际是 **740 / 10** —— 那几处文案没跟着改。
 */

/**
 * 旧的「小档」（默认档）机身宽度 = 屏幕 720 + 内圈左右外边距 10×2 = 740。
 *
 * 2026-10-12 起机身宽度跟着尺寸档位变，**真正的出处是 globals.css 的 `--tv-w`**
 * （= `--tv-screen-w` + 20px），这个常量只是「小档那个值」的一份副本 ——
 * 组件里**没有**写死 width（宽度是尺寸那套自己撑出来的），它也不被任何地方引用，
 * 留着是给「改屏幕尺寸 / 那两道外边距」时留个对照物。
 *
 * ⚠️ 2026-10-13 起 740 **不再对应任何真实窗口**：小档 = 屋子塞得下的最大屏幕 × 75%，
 * 1080 高的窗口上算出来是屏幕 733 / 机身 753。这个常量本身仍然只是「对照物」，
 * 没有任何地方读它 —— 留着是因为下面那几行「740 / 10」的旧文案还拿它当尺子。
 */
export const TV_WIDTH = 740;

interface RetroTvProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** 全屏目标就是这个屏幕，不是整页 */
  screenRef: RefObject<HTMLDivElement | null>;
  rom: LoadedRom | null;
  /**
   * 「显像管关机」那一下正在放 —— 弹出卡带之后的约 0.4 秒。
   *
   * 由 ConsoleScene 的 `eject` 点亮（**不是**从 `rom` 变 null 反推的：从游戏库载入失败
   * 也会把 rom 清成 null，那不是「关机」；加入者被自动弹卡带时屏幕马上就有房主的画面，
   * 更不该闪这一下）。所以这里收的是一个明确的信号，不是猜出来的状态。
   */
  crtOff: boolean;
  /** 房主推过来的画面。联机时加入者靠它出画面（本机不跑模拟器） */
  remoteStream: MediaStream | null;
  /**
   * 房主那边正在玩（= `netplayState.remotePlaying`）。
   *
   * 加入者收到画面之前有一段「房主说在玩、流还在路上」的空窗，那时屏幕还是一片雪花。
   * 靠它把这段时间和「什么都没在玩」区分开：前者不该提示「拖 ROM 进来」——
   * 本机插卡带是没意义的，画面是房主推来的。
   */
  remotePlaying: boolean;
  /**
   * **本机**模拟器暂停着（房主自己按的那颗钮）。
   *
   * 两个用处：机身那颗 PWR 灯多出第三个颜色（accent），以及屏幕里那句
   * `PAUSED / PRESS RESUME ON THE PANEL`。
   *
   * 加入者永远拿到 false，他那边的暂停走 `remotePaused`。
   */
  paused: boolean;
  /**
   * 房主那边暂停着（= `netplayState.remotePaused`）。
   *
   * 加入者本机没有模拟器，`paused` 对他永远是 false —— 房主按下的那次暂停，
   * 只能从这条 prop 进来。
   */
  remotePaused: boolean;
  /**
   * 联机已经连上（`netplayState.status === 'connected'`）—— 屏幕左上角那颗小灯。
   *
   * 两侧都亮（房主、加入者），因为它回答的是「对面还在不在」这个问题，而**房主同样会忘**
   * ——「刚连上」那枚提示只活 4 秒，之后房间里唯一还写着「已连接」的地方是右侧那颗联机钮
   * 和联机面板，两个都不是盯着游戏看的人会留意的东西。
   */
  netplayLive: boolean;
  /**
   * **房主**开着房、还没有人进来（`status === 'waiting' && role === 'host'`）—— PWR 灯变黄。
   *
   * 为什么只认房主：加入者那边的 `'waiting'` 只是「正在对上」的一瞬（对上就进 connected），
   * 而房主是真的可以**无限期**等下去 —— 那正是需要一个灯来回答的状态。
   * 它排在 PWR 灯颜色表的最前面，所以房主没插卡带（没画面）时也是黄的，不是暗的。
   */
  netplayWaiting: boolean;
  busy: boolean;
  /**
   * 正在插卡带。null = 没在载入。
   *
   * `ratio` 是核心包的下载进度（0..1），null 表示拿不到字节数（核心已在
   * CacheStorage 里、或响应没有 Content-Length）。
   */
  loading: { ratio: number | null } | null;
  /** 有存档可读 —— 一个槽都没有时「读档」按钮是灰的 */
  canLoad: boolean;
  /** 音量档位：0 = 静音，VOLUME_MAX = 原音量（0 dB） */
  volume: number;
  /** 系统文件正悬停在电视机上方 */
  fileOver: boolean;
  onPickFile: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDropFile: (e: DragEvent<HTMLDivElement>) => void;
  onTogglePause: () => void;
  onSave: () => void;
  onLoad: () => void;
  /** 重载：重启核心，游戏从头开始（机身面板上那颗 RESET 钮） */
  onReload: () => void;
  onEject: () => void;
  onVolume: (level: number) => void;
  onExitFullscreen: () => void;
}

/**
 * 电视机（游戏机已并进来：顶沿有一条散热缝）。机身下沿原来有个插卡舱，2026-10-09 撤了。
 *
 * **这里只剩壳**：顶沿（散热缝 + 版本铭牌）、机身内圈、前面板（PWR / VOL / 五个功能钮）、
 * 底座。屏幕整块（canvas / 房主推来的画面 / 待机提示 / 暂停层 / 载入进度 / 关机白线 /
 * 联机小灯 / 全屏退出口）2026-10-12 抽进了 `components/ConsoleScreen.tsx` ——
 * 移动端那台掌机用的是同一块屏幕，一份实现两处用，免得两边慢慢漂成两种行为。
 * 屏幕里的那些规矩（基本不放文案、配色走 crt-*、叠层不写 z-index）都记在那边。
 *
 * canvas 必须始终留在 DOM 里（未插卡带时也一样），否则 Nostalgist 找不到渲染目标。
 *
 * 前面板那五颗钮一律看 `rom`（本机有没有插卡带），不看有没有画面：
 * 加入者屏幕上是房主的画面，但这些按钮管的是本机的模拟器，本机没有模拟器，
 * 所以它们该是灰的。PWR 灯则相反 —— 有画面就亮。
 */
export default function RetroTv({
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
  fileOver,
  onPickFile,
  onDragOver,
  onDragLeave,
  onDropFile,
  onTogglePause,
  onSave,
  onLoad,
  onReload,
  onEject,
  onVolume,
  onExitFullscreen
}: RetroTvProps) {
  const { t } = useI18n();
  const hot = fileOver;
  /*
   * 屏幕那三个派生状态（有没有画面 / 在等房主 / 要不要盖暂停层）**不在这里算** ——
   * 判断只有一份，在 ConsoleScreen 的 `deriveScreenState` 里；这里借它算一下 PWR 灯的颜色，
   * 免得机身那颗灯和屏幕里那层提示对不上。
   */
  const { hasPicture, showPaused } = deriveScreenState({
    rom,
    remoteStream,
    remotePlaying,
    paused,
    remotePaused,
  });
  /**
   * PWR 灯。颜色回答的是「这台机器现在在干什么」（**按优先级从上往下**）：
   *   房主等人进房 → warn（黄）；没画面 → 暗（ink-600）；暂停 → accent（琥珀）；
   *   **单人**跑着 → ok（绿）；**联机**跑着 → info（蓝）。
   * 灯是机身上离屏幕最近的状态读数，两种暂停它都该跟着变 ——
   * 加入者那台虽然没插卡带，屏幕上确实是房主停住的画面。
   *
   * 「等人进房」为什么排最前：房主开着房、还没插卡带时是**没有画面**的，若按
   * 「没画面就暗」处理，他就完全看不出自己还开着房 —— 而那正是他最需要被提醒的事。
   *
   * 「联机中」判的是 `netplayLive`（房间已连上），不是「对面在推流」：房主自己开着房、
   * 玩本机那盘卡带时本机并没有 remoteStream，可那恰恰是**更**需要提醒的一侧
   * （他最容易忘了自己还开着房）。所以两侧都是蓝的 —— 判据和屏幕左上角那颗联机小灯一样，
   * 只是那颗仍是绿的（那颗管「对面还在不在」，这颗管「这台机器在联机模式」）。
   * 暂停优先于联机 —— 用户说了「默认不变」，暂停那一档照旧是 accent。
   *
   * ⚠️ 掌机（HandheldConsole）里有一颗**同款** PWR 灯，取值必须和这里一字不差。
   */
  const pwrClass = netplayWaiting
    ? 'bg-warn'
    : !hasPicture
      ? 'bg-ink-600'
      : showPaused
        ? 'bg-accent'
        : netplayLive
          ? 'bg-info'
          : 'bg-ok';

  return (
    <div
      className="relative"
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDragLeave={(e) => {
        // dragover 会在子元素之间反复触发 dragleave，靠 relatedTarget 判断是否真的离开了整机
        const next = e.relatedTarget as Node | null;
        if (next && e.currentTarget.contains(next)) return;
        onDragLeave();
      }}
      onDrop={onDropFile}
    >
      {/*
        ⚠️ 机身宽度**钉死在 `--tv-w`**（= 屏幕 + 内圈左右外边距 10×2），别删这个
        `w-[var(--tv-w)]`、也别改成让内容撑宽。

        原来这里没有宽度类，靠内容撑：屏幕是固定宽的，面板那一排固定尺寸的控件加起来
        也差不多宽，两者谁大听谁的。屏幕缩到比面板窄时（2026-10-13 改成按窗口算尺寸之后，
        小档在偏矮的窗口上就是这样），机身就被**面板**撑住、比屏幕宽 —— 机身是块级、
        屏幕在它里面是**左对齐**的，于是屏幕右边空出一条。用户报的「小档游戏区域没填满
        电视机、右侧大片空白」就是这条。
        钉死之后机身永远 = 屏幕 + 20；面板要宽于机身时改成自己压（见下面那排钮的注释）。
        桌面 / 底座 / 墙上那两件（窗户、画）都挂在这一层的盒子上，所以它们跟着一起对齐。
      */}
      <div
        className={`relative w-[var(--tv-w)] bg-ink-700 pixel-edge pxw-6 ${hot ? 'pxc-accent' : 'pxc-500'}`}
      >
        {/*
          机身顶沿：一条凹进去的散热缝。
          原本顶沿是一条光边，机身读起来「只有屏幕没有壳」，加这一条才立得住。
          缝用 ink-950 并配一道顶沿亮边 —— 和机身下沿那条面板分界线同一个方向。
          右端原来有一块 NESLOAD 铭牌（去掉过），现在换成**版本号铭牌** ——
          用 ml-auto 推到右端，和左边的散热缝各占一头。
        */}
        <div className="relative flex h-[30px] items-center border-b-2 border-ink-800 bg-ink-850 px-5">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-ink-950/45" />
          <span className="relative flex items-center gap-[6px]">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className="h-[5px] w-[9px] bg-ink-950/70" />
            ))}
          </span>
          {/*
            版本号铭牌（机身右上角）。版本取自 package.json，不手写 —— 免得两处各存一份、
            改了一处忘了另一处。
            走 font-pixel：机身上所有铭牌（PWR / VOL / BETA）都是这套字，
            且内容只有 ASCII，没有掉字形的问题，所以不进 i18n 文案表。
            pointer-events-none：纯装饰，别让它成为拖拽的落点 / relatedTarget。
          */}
          <span className="pointer-events-none relative ml-auto font-pixel text-[9px] tracking-[0.1em] text-ink-500">
            BETA v{packageJson.version}
          </span>
        </div>

        {/* 机身内圈 + 屏幕 */}
        <div className="relative m-[8px] mx-2.5 bg-ink-900 pixel-edge pxw-4 pxc-700">
          {/*
            屏幕整块（canvas + 屏幕上叠的那几层）2026-10-12 抽进了 ConsoleScreen ——
            移动端那台掌机用的是同一块屏幕，一份实现两处用，免得两边慢慢漂成两种行为。
            尺寸仍由屏幕自己的 class 决定（见 ConsoleScreen 顶部那段注释），
            全屏那条未分层的 `.screen:fullscreen` 也照旧有效。
          */}
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
            fileOver={fileOver}
            variant="desktop"
            onTap={onPickFile}
            onExitFullscreen={onExitFullscreen}
          />
        </div>

        {/*
          前面板。纵向留白压到 py-2.5 —— 一排小按钮 + 20px 的音量键，
          面板高度就由它们撑出来，多余的空只会让机身显得虚胖。
          （2026-10-10 按钮整体收小之后，这里跟着从 py-3 收到 py-2.5，否则
          按钮瘦了、面板没瘦，四周那圈空反而更显眼。）

          按钮宽度**写死 52px**、整排用 `ml-auto` 贴右边：之前是 `flex-1` 撑满，
          4 个格子分掉整条面板，每个按钮宽到 110px，太大也太散；中间试过 64px，
          2026-10-10 添了「重载」凑成 5 个，整排一下又变宽，索性统一收到 52px。
          不用 `px-*` 让文字自己撑宽度是因为中英文字数不一样（`Pause` vs `暂停`），
          那样几个按钮会宽窄不齐。

          ⚠️ 2026-10-13：那排格子从 `52px` 改成 `minmax(0,52px)` —— **52 现在是上限，
          不是下限**。原来的理由是「面板是定宽机身（屏幕 720 + 边距）里的一行，不存在
          窄屏挤压，所以写死尺寸是安全的」，那个前提当天就塌了：电视机尺寸改成按窗口算
          之后，小档在偏矮的窗口上屏幕只有 500 出头，机身跟着变窄，而这一排固定宽度加起来
          要 ~520px —— 它会把机身**撑宽**（机身是块级、屏幕在它里面左对齐 ⇒ 屏幕右边空出
          一条，就是用户报的「小档游戏区域没填满电视机、右侧大片空白」；窗口越矮越明显，
          因为屏幕连高一起缩、机身却被这排钮钉着不动，机身就成了「长条形」）。
          现在机身写死 `w-[var(--tv-w)]`（见下面那段），这一排改成**可以被压**：
          PWR / VOL 那两块仍然 `shrink-0`，压缩全落在五颗钮上（最窄 ~37px 还能读）；
          再往下那一段由 globals.css 的 `--tv-screen-min` 兜住。

          顺序把「重载」放在「弹出」前面：重载是留在卡带上的操作，弹出是把它撤下来，
          撤下来那个永远排最后。重载＝重启核心（游戏从头开始），原先只有快捷键（R）、
          没有钮，屏幕里的提示也从不提它，等于藏起来了。

          2026-10-10 起这五颗钮是暂停 / 存档 / 读档 / 重载**唯一**的入口 ——
          键盘快捷键全撤了（为什么撤见 ConsoleScene 里那个 Esc effect 的注释）。
          所以它们不能变灰之后没有出路：`disabled` 只在没卡带 / 载入中时成立。
        */}
        <div className="flex items-center gap-5 border-t-2 border-ink-800 bg-ink-700 px-5 py-2.5">
          <div className="flex shrink-0 items-center gap-2">
            <span className={`h-3 w-3 ${pwrClass}`} />
            <span className="font-pixel text-[9px] text-ink-500">PWR</span>
          </div>

          {/*
            音量。第 1 档最小、第 VOLUME_MAX 档最大，没有第 0 档的格子 ——
            0 档（静音）由「按 − 按到底」进入，此时六格全暗。
            格子可以直接点（点第 n 格 = 第 n 档），两端的 − / + 用来微调。
            没插卡带时调它也不会丢：档位记在 controller 里，插上时作为初值生效。

            档位间距和最大档都调过：原来是每档 4 dB、最大档 0 dB（RetroArch 的满音量），
            用户反馈「音量控制不明显、最大和倒数第二大都很响」。现在每档 6 dB、
            最大档 -6 dB —— 每一格都听得出差别，最大档也不炸耳。详见 lib/emulator.ts。

            VOL 标签比 PWR 亮一档（ink-300 / ink-500）：它上面那个控件是要人去点的，
            而用户说过音量「不明显」，所以这里主动提高对比。
          */}
          <div className="flex shrink-0 items-center gap-2">
            <span className="font-pixel text-[9px] text-ink-300">VOL</span>
            <div className="flex items-center gap-[8px]">
              <VolBtn
                label="−"
                title={t('volume.down')}
                aria-label={t('volume.down')}
                disabled={volume <= 0}
                onClick={() => onVolume(volume - 1)}
              />
              <span className="flex gap-[5px]">
                {Array.from({ length: VOLUME_MAX }, (_, i) => i + 1).map(
                  (level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => onVolume(level)}
                      title={t('volume.set', { level, max: VOLUME_MAX })}
                      aria-label={t('volume.set', { level, max: VOLUME_MAX })}
                      className={`h-[14px] w-[11px] transition-colors ${
                        level <= volume ? 'bg-accent' : 'bg-ink-900'
                      }`}
                    />
                  )
                )}
              </span>
              <VolBtn
                label="+"
                title={t('volume.up')}
                aria-label={t('volume.up')}
                disabled={volume >= VOLUME_MAX}
                onClick={() => onVolume(volume + 1)}
              />
            </div>
          </div>

          {/* 列宽是 `minmax(0,52px)`：52 是**上限**，机身被钉窄时可以往下压 —— 理由见上面那段 */}
          <div className="ml-auto grid grid-cols-[repeat(5,minmax(0,52px))] gap-1.5">
            <PanelBtn onClick={onTogglePause} disabled={!rom || busy} active={paused} aria-pressed={paused}>
              {paused ? <PlayGlyph /> : <PauseGlyph />}
              {paused ? t('panel.resume') : t('panel.pause')}
            </PanelBtn>
            <PanelBtn onClick={onSave} disabled={!rom || busy}>
              <SaveGlyph />
              {t('panel.save')}
            </PanelBtn>
            <PanelBtn onClick={onLoad} disabled={!rom || busy || !canLoad}>
              <LoadGlyph />
              {t('panel.load')}
            </PanelBtn>
            <PanelBtn onClick={onReload} disabled={!rom || busy}>
              <RefreshGlyph />
              {t('panel.reset')}
            </PanelBtn>
            <PanelBtn onClick={onEject} disabled={!rom || busy} danger>
              <EjectGlyph />
              {t('panel.eject')}
            </PanelBtn>
          </div>
        </div>
      </div>

      {/*
        底座。宽跟尺寸档位（`--tv-base-w` = 屏幕 × 5/8，屏幕又由窗口和档位算出来），
        高固定 18 —— 高跟着放大的话底座会变成一堵墙，而它在机身最下面，本来只是给机身
        一个落脚点。
      */}
      <div className="mx-auto mt-[3px] h-[18px] w-[var(--tv-base-w)] bg-ink-700 pixel-edge pxw-4 pxc-500" />

      <div className="ground-shadow absolute inset-x-12 -bottom-[8px] h-[8px]" />
    </div>
  );
}

/**
 * 音量条两端的小方钮。20px 见方，和面板按钮同一套描边与配色。
 *
 * `export` 是为了让移动端那台掌机（`HandheldConsole`）复用 —— 它下面也有一排音量，
 * 和这里是同一个控件，没必要抄一份（抄了就会慢慢漂成两种手感）。
 */
export function VolBtn({
  label,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      className={`pixel-edge pxw-2 flex h-[20px] w-[20px] items-center justify-center bg-ink-600 text-[13px] leading-none text-ink-100 transition-colors disabled:cursor-not-allowed disabled:opacity-35 enabled:hover:bg-ink-500 enabled:hover:text-accent ${className}`}
      {...props}
    >
      {label}
    </button>
  );
}

/* ================================================================== *
 * 前面板功能键（暂停 / 存档 / 读档 / 重载 / 弹出）
 * ================================================================== */

/**
 * 功能键上的小图标（10px 像素块，currentColor）。
 *
 * 一排**老录像机 / 卡带座**式的功能符号：暂停两道杠、继续三角、存档软盘、
 * 读档「从盘里读出」（托盘 + 上箭头）、重载旋转箭头 ↻、弹出三角 + 底杠。
 * 全部 `shapeRendering="crispEdges"` 硬边渲染，跟满屋子的像素边一个脾气；
 * `fill` 走 currentColor —— hover 变 accent / 弹出那颗变 danger 时图标跟着走，
 * 不用再维护一份彩色版本。
 */
function PanelGlyph({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 10 10"
      width={10}
      height={10}
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

function PauseGlyph() {
  return (
    <PanelGlyph>
      <rect x="2" y="1" width="2" height="8" />
      <rect x="6" y="1" width="2" height="8" />
    </PanelGlyph>
  );
}

function PlayGlyph() {
  return (
    <PanelGlyph>
      <path d="M2 1 L9 5 L2 9 Z" />
    </PanelGlyph>
  );
}

/** 软盘：右上切角 + evenodd 挖出快门孔和标签孔（孔里透出钮底色）。 */
function SaveGlyph() {
  return (
    <PanelGlyph>
      <path
        fillRule="evenodd"
        d="M1 1 H7 L9 3 V9 H1 Z M4 1 H7 V3 H4 Z M3 6 H7 V9 H3 Z"
      />
    </PanelGlyph>
  );
}

/** 读档：托盘 + 上箭头 —— 数据「从盘里读出来」。 */
function LoadGlyph() {
  return (
    <PanelGlyph>
      <path d="M5 0 L8 3 H6 V5 H4 V3 H2 Z" />
      <path d="M1 6 H2 V8 H8 V6 H9 V9 H1 Z" />
    </PanelGlyph>
  );
}

/**
 * 重载 = 旋转箭头 ↻：3/4 圆环（顺时针留出右上缺口）+ 指向右的箭头。
 *
 * 圆环是 1px 描边的 8×8 像素圆，缺口开在右上 —— 顺时针转到那里「甩出」箭头，
 * 箭头接着圆环右侧往下走，读起来就是「转回去重来」。10px 里画不了平滑圆弧，
 * 靠 crispEdges 把这条折线圆糊成像素圆，和其它几枚符号同一脾气。
 */
function RefreshGlyph() {
  return (
    <PanelGlyph>
      {/* 圆环（右上留缺口）：上弧 → 左侧 → 下弧 → 右侧 */}
      <rect x="3" y="1" width="2" height="1" />
      <rect x="2" y="2" width="1" height="1" />
      <rect x="1" y="3" width="1" height="4" />
      <rect x="2" y="7" width="1" height="1" />
      <rect x="3" y="8" width="4" height="1" />
      <rect x="7" y="7" width="1" height="1" />
      <rect x="8" y="3" width="1" height="4" />
      {/* 缺口里的连接短杠 + 顺时针的箭头（指向右） */}
      <rect x="5" y="1" width="2" height="1" />
      <path d="M7 0 L10 2 L7 4 Z" />
    </PanelGlyph>
  );
}

/** 弹出：上三角 + 底杠，卡带座上那个标准的 ⏏。 */
function EjectGlyph() {
  return (
    <PanelGlyph>
      <path d="M5 1 L9 5 H1 Z" />
      <rect x="1" y="7" width="8" height="2" />
    </PanelGlyph>
  );
}

/**
 * 前面板上那排功能钮（暂停 / 存档 / 读档 / 重载 / 弹出）。
 *
 * 2026-10-13 重画（用户要求「好看点」）：
 *   · 立体键帽 —— 一圈 2px 描边 + 按下整体下沉（`.panel-key`，
 *     globals.css；⚠️ 描边全在这条 box-shadow 里，**别再叠 pixel-edge**，
 *     两个类都设 box-shadow 会互相顶掉。原先是描边 + 底部键唇，
 *     2026-10-13 用户嫌那道底部投影发白，已去掉 —— 别加回来）。
 *   · 每颗键前面一枚 10px 像素功能符（上面那组 Glyph），文字仍是 10px 中文。
 *   · 「暂停中」那颗亮 accent（`.panel-key-on` 描边换 accent），一眼看出
 *     现在是暂停态而不是没按下去 —— 和右侧那列开关钮（accent 底）同一个语义。
 *   · 「弹出」默认文字就带一档 danger（danger/70），hover 才全红 ——
 *     危险动作不靠 hover 才看得出来。
 *
 * 尺寸走「窄 + 矮」：宽度由父级格子的写死列宽（52px）定，高度只由这里的
 * `py-1 text-[10px]` 撑出来。2026-10-10 从 `py-1.5 text-[11px]` 收下来过 ——
 * 用户要求这一排整体小一点，5 个钮一起占的宽度/高度都跟着降。
 * 字号不能再往下了：10px 的中文「弹出 / 重载」已经贴着实心笔画，再小就糊。
 * ⚠️ 图标 + 文字同排，`whitespace-nowrap` 挡住中文在格子被压窄时折行。
 */
function PanelBtn({
  danger = false,
  active = false,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      className={`panel-key flex items-center justify-center gap-1 whitespace-nowrap bg-ink-600 py-1 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        active
          ? 'panel-key-on bg-accent/15 text-accent'
          : danger
            ? 'text-danger/70 enabled:hover:bg-ink-500 enabled:hover:text-danger'
            : 'text-ink-100 enabled:hover:bg-ink-500 enabled:hover:text-accent'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
