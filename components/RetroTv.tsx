import type { ButtonHTMLAttributes, DragEvent, RefObject } from 'react';
import packageJson from '@/package.json';
import { VOLUME_MAX, type LoadedRom } from '@/lib/emulator';
import ConsoleScreen, { deriveScreenState } from './ConsoleScreen';
import { useI18n } from './I18nProvider';

/*
 * 机身尺寸。
 *
 * 屏幕是 720×540（NES 画面的 4:3），**尺寸写在屏幕那个 div 的 class 上**
 * （`h-[var(--tv-screen-h)] w-[var(--tv-screen-w)]`，见下面那段注释 —— 别删、
 * 别改成让 canvas 撑，也别改成内联 style）。机身宽度 = 屏幕 + 内圈左右外边距 10×2。
 *
 * ⚠️ 2026-10-12 起这些数字**不再是常量**：屏幕 / 机身 / 底座 / 桌面的尺寸都由
 * `<html data-tv>` 那组 CSS 变量给（三档：小 / 中 / 大，默认「小」= 原来的 720×540）。
 * 变量写在 globals.css，档位的类型和循环顺序在 lib/tv-size.ts。
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
 * 740 + px-6 = **788px**，断点仍是 **900px**（当初按 814 定的，余量还在，不用动）。
 * **那个 900px 不随尺寸档位走**（媒体查询读不到 data-tv）：中 / 大档在 900~1000px
 * 宽的窗口里会被 main 的 overflow 从两侧切掉一点 —— 机身是居中的，所以左右对称地切。
 * 这是已知取舍，不为它加自适应。
 * 改这里要同步 globals.css 的断点与上方那段注释，以及 i18n.ts 的 notice.desktopOnly。
 *
 * ⚠️ globals.css / i18n.ts / README 里写的「机身 766 / 屏幕外边距 15」是屏幕还自己带
 * 15px 外边距时的数字，2026-10-10 起实际是 **740 / 10** —— 那几处文案没跟着改。
 */

/**
 * 「小档」（默认档）的机身宽度 = 屏幕 720 + 内圈左右外边距 10×2 = 740。
 *
 * 2026-10-12 起机身宽度跟着尺寸档位变，**真正的出处是 globals.css 的 `--tv-w`**
 * （= `--tv-screen-w` + 20px），这个常量只是「小档那个值」的一份副本 ——
 * 组件里**没有**写死 width（宽度是尺寸那套自己撑出来的），它也不被任何地方引用，
 * 留着是给「改屏幕尺寸 / 那两道外边距」时留个对照物。
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
      <div
        className={`relative bg-ink-700 pixel-edge pxw-6 ${hot ? 'pxc-accent' : 'pxc-500'}`}
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
          那样几个按钮会宽窄不齐。面板是定宽机身（屏幕 720 + 边距）里的一行，
          不存在窄屏挤压，所以写死尺寸是安全的。

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

          <div className="ml-auto grid grid-cols-[repeat(5,52px)] gap-1.5">
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
        </div>
      </div>

      {/*
        底座。宽跟尺寸档位（`--tv-base-w`：450 / 520 / 600），高固定 18 ——
        高跟着放大的话底座会变成一堵墙，而它在机身最下面，本来只是给机身一个落脚点。
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

/**
 * 前面板上那排功能钮（暂停 / 存档 / 读档 / 重载 / 弹出）。
 *
 * 尺寸走「窄 + 矮」：宽度由父级格子的写死列宽（52px）定，高度只由这里的
 * `py-1 text-[10px]` 撑出来。2026-10-10 从 `py-1.5 text-[11px]` 收下来过 ——
 * 用户要求这一排整体小一点，5 个钮一起占的宽度/高度都跟着降。
 * 字号不能再往下了：10px 的中文「弹出 / 重载」已经贴着实心笔画，再小就糊。
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
