'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { SCREEN_HEIGHT, SCREEN_WIDTH, VOLUME_MAX, type LoadedRom } from '@/lib/emulator';
import { useI18n } from './I18nProvider';

/*
 * 屏幕（显像管 + canvas + 屏幕上叠的那几层）。
 *
 * 2026-10-12 从 RetroTv 里**整块搬出来**的 —— 加移动端掌机时，桌面那台电视机和
 * 移动端那台掌机都要这块屏幕，而屏幕里的东西（canvas / 房主推来的画面 / 待机提示 /
 * 暂停层 / 载入进度 / 关机白线 / 联机小灯 / 全屏退出口）和**外面那层壳**毫无关系。
 * 一份实现两处用，免得两边慢慢漂成两种行为。
 *
 * **壳归壳**：电视机壳（顶沿散热缝 / 前面板 / 底座）留在 RetroTv，掌机壳在
 * HandheldConsole；尺寸也归壳 —— 屏幕自己的尺寸仍写在这行的 class 上
 * （`h-[var(--tv-screen-h)] w-[var(--tv-screen-w)]`），移动端由 globals.css 的
 * `:root[data-mobile='on'] .screen:not(:fullscreen)` 覆盖成「按视口宽算的 4:3」。
 * ⚠️ 别把尺寸改成内联 style —— 会顶掉 `.screen:fullscreen`（完整因果见 RetroTv 顶部注释）。
 *
 * 屏幕里的规矩（一条都没变，只是搬了个家）：**基本不放文案**，只放状态提示
 * （怎么开始玩 / RELEASE TO LOAD / WAITING FOR HOST / 载入进度 / PAUSED）＋联机那颗小灯；
 * 要读的说明一律走浮在房间上的弹窗。配色一律 `crt-*`（屏幕底永远是黑的，
 * `ink-*` 会随主题翻转，浅色主题下就成了黑底黑字）。叠在屏幕里的层**一律不写 z-index**
 * —— 要盖住 canvas，又必须落在 `.crt` 的两层伪元素（扫描线 z-5 / 暗角 z-6）之下。
 */

/** 屏幕里那层「暂停」要不要出现 —— 本机暂停、或房主的画面正被房主暂停着。 */
export interface ScreenState {
  /** 有画面 = 本机插着卡带，或房主推了画面过来。两者只会有一个成立。 */
  hasPicture: boolean;
  /** 房主在玩、画面还没到 —— 这时该说「等一下」，不该招呼用户去载入 */
  waitingForHost: boolean;
  /** 屏幕上要不要盖暂停层 */
  showPaused: boolean;
}

/**
 * 从几个输入推出屏幕那三个派生状态。
 *
 * 抽成函数是因为**两个壳都要用**：屏幕里画哪一层由 ConsoleScreen 自己判断，
 * 而机身那颗 PWR 灯（RetroTv 的面板 / 掌机的顶沿）要的颜色是同一套判断 ——
 * 各写一遍迟早会漂。见 RetroTv 里 `pwrClass` 那行。
 */
export function deriveScreenState({
  rom,
  remoteStream,
  remotePlaying,
  paused,
  remotePaused,
}: {
  rom: LoadedRom | null;
  remoteStream: MediaStream | null;
  remotePlaying: boolean;
  paused: boolean;
  remotePaused: boolean;
}): ScreenState {
  const hasPicture = Boolean(rom) || Boolean(remoteStream);
  const waitingForHost = !rom && remotePlaying && !remoteStream;
  /*
   * 暂停层：本机暂停（房主自己按的）或**房主的画面**正被房主暂停着。
   * 后者必须同时要求 `remoteStream` 到手 —— 只有画面真的在屏幕上、又停住了，
   * 才有「为什么不动」这回事。流还没到的那段空当由 `WAITING FOR HOST` 顶着，
   * 两层都画会在屏幕正中叠成一团（两层都是居中、pointer-events-none）。
   *
   * 判据用 `remoteStream` 而不是 `hasPicture`：加入者在切换的瞬间本机可能还插着
   * 自己的卡带（房主一出画面他才把它弹掉），那时 hasPicture 为真但屏幕上的画面是
   * 本机的、跟着本机跑 —— 拿它当判据会给本机画面凭空盖一层 PAUSED。
   */
  const showPaused = paused || (remotePaused && Boolean(remoteStream));
  return { hasPicture, waitingForHost, showPaused };
}

interface ConsoleScreenProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** 全屏目标就是这个屏幕，不是整页 */
  screenRef: RefObject<HTMLDivElement | null>;
  rom: LoadedRom | null;
  /**
   * 「显像管关机」那一下正在放 —— 弹出卡带之后的约 0.4 秒。
   * 由 ConsoleScene 的 `eject` 点亮（不是从 `rom` 变 null 反推的，理由见那边）。
   */
  crtOff: boolean;
  /** 房主推过来的画面。联机时加入者靠它出画面（本机不跑模拟器） */
  remoteStream: MediaStream | null;
  /** 房主那边正在玩（= `netplayState.remotePlaying`） */
  remotePlaying: boolean;
  /** 房主那边暂停着（= `netplayState.remotePaused`） */
  remotePaused: boolean;
  /** 联机已经连上 —— 屏幕左上角那颗小灯 */
  netplayLive: boolean;
  /** **本机**模拟器暂停着 */
  paused: boolean;
  /**
   * 正在插卡带。null = 没在载入。`ratio` 是核心包的下载进度（0..1），
   * null 表示拿不到字节数 —— 这时画一条来回滑的「不确定」进度条。
   */
  loading: { ratio: number | null } | null;
  /** 音量档位：0 = 静音，VOLUME_MAX = 原音量（只给房主推来的那条 `<video>` 用） */
  volume: number;
  /** 系统文件正悬停在机身上（桌面端才有；移动端恒为 false） */
  fileOver: boolean;
  /**
   * 待机提示用哪一套。两端都是两行：桌面端「点本地 / 从在线库启动」，移动端「只从库」——
   * 移动端没有拖拽、也没有「选本地文件」那条路，见 lib/i18n.ts 的 `screen.mobile*`。
   */
  variant: 'desktop' | 'mobile';
  /** 点屏幕。桌面端 = 选本地 ROM 文件；移动端 = 打开在线游戏库 */
  onTap: () => void;
  /**
   * 退出全屏。**不传就不画那个退出口** —— 移动端没有全屏入口（右侧那颗钮在移动端隐藏），
   * 屏幕上也就没有退出的必要。
   */
  onExitFullscreen?: () => void;
}

export default function ConsoleScreen({
  canvasRef,
  screenRef,
  rom,
  crtOff,
  remoteStream,
  remotePlaying,
  remotePaused,
  netplayLive,
  paused,
  loading,
  volume,
  fileOver,
  variant,
  onTap,
  onExitFullscreen,
}: ConsoleScreenProps) {
  const { t } = useI18n();
  const { hasPicture, waitingForHost, showPaused } = deriveScreenState({
    rom,
    remoteStream,
    remotePlaying,
    paused,
    remotePaused,
  });
  /** 载入进度（整数百分比）。null = 拿不到字节数，屏幕上画一条不确定进度条 */
  const loadPct = loading && loading.ratio !== null ? Math.round(loading.ratio * 100) : null;
  /** 桌面端：拖拽悬停时那句 `RELEASE TO LOAD`（移动端没有拖拽，恒不出现） */
  const hot = fileOver && variant === 'desktop';

  /*
   * 待机时「点屏幕」那颗钮的名字。两端的动作完全不同，所以两套：
   * 桌面端是选本地文件，移动端是打开在线游戏库（`games.open` 就是「游戏库」三个字，
   * 正好是这个按钮最准的名字，不必再起一个同义键）。
   */
  const tapTitle = variant === 'desktop' ? t('screen.pick') : t('games.open');
  const tapLabel = variant === 'desktop' ? t('screen.srLabel') : t('games.open');

  return (
    /*
      屏幕尺寸**必须写在这行 class 上**（`h-[var(--tv-screen-h)]` `w-[var(--tv-screen-w)]`，
      两个变量按 `<html data-tv>` 取小 / 中 / 大三档，移动端另有一层覆盖 —— 见文件头）。

      不能省、也不能改成「让 canvas 撑出尺寸」—— 那正是 2026-10-10 用户报的
      「点第二款游戏后整个游戏区域变大」：尺寸类被删过一次，屏幕就变成由 canvas
      的**固有尺寸**决定（canvas 是屏幕里唯一在流里的孩子），而 canvas 的尺寸会被
      三方轮番改（核心探尺寸时写死 clientWidth、按 devicePixelRatio 设后备存储、
      Nostalgist 每次 launch 又写 width/height:100%）。于是缩放比被一次一次乘进机身：
      100% 缩放的机器上看不出来，125% / 150% 上每换一盘游戏整台机器就大一圈。
      写死尺寸之后，canvas 怎么改都只动它自己（它仍是 h-full w-full，照样填满屏幕）。

      另外：全屏规则 `.screen:fullscreen` 写在 globals.css 里、是**未分层**的样式，
      优先级高于 Tailwind 的 utilities 层，所以这两个尺寸类不会顶掉全屏尺寸。
      **也别改成内联 style** —— 内联比任何选择器都硬，全屏会被顶掉。
    */
    <div
      ref={screenRef}
      data-tour="screen"
      className="screen crt relative h-[var(--tv-screen-h)] w-[var(--tv-screen-w)] overflow-hidden bg-black"
    >
      {/*
        canvas 必须始终留在 DOM 里，但没画面时要把它藏起来：
        模拟器退出后 canvas 会保留最后一帧画面（浏览器不会主动清空），雪花只有 0.72
        不透明度，那一帧会透出来，看着像游戏还在跑。visibility: hidden 不改变布局，
        也不影响 Nostalgist 量尺寸。联机时房主那边 canvas 是画面源头，当然要留着。

        例外是 `crtOff` 那 0.4 秒（弹出卡带的关机收缩）：**那最后一帧正是要用的东西**，
        所以这段时间里把它亮着，并套上 `.crt-off-picture` 让它纵向压成一条线。
        （`transform` 不参与布局，所以压扁不会惊动核心那个 ResizeObserver。）
      */}
      <canvas
        ref={canvasRef}
        width={SCREEN_WIDTH}
        height={SCREEN_HEIGHT}
        className={`pixelated block h-full w-full ${
          (rom && !remoteStream) || crtOff ? '' : 'invisible'
        } ${crtOff ? 'crt-off-picture' : ''}`}
      />

      {/*
        房主推来的画面。定位到绝对层是为了压住 canvas —— canvas 在正常流里，
        定位元素天然画在它上面。刻意**不给 z-index**：它要盖住 canvas，
        但必须落在 .crt 的两层伪元素（扫描线 z-5 / 边角暗角 z-6）之下。
      */}
      {remoteStream && <RemoteScreen stream={remoteStream} volume={volume} />}

      {/*
        待机态 = **纯黑**，屏幕上什么都不铺（2026-10-12 用户选的「方案 B」）。
        这里原先铺的是一层 `opacity-[0.72]` 的雪花噪点，视觉上是整屏 720×540、高频、
        而且在动的一块中灰（合成出来约 #5c5c5c），必然是全屋最亮也最吵的东西 ——
        用户原话「有点扎眼了」。待机就该是安静的。雪花本身没删
        （globals.css 的 `.noise` 还在、参数也是调好的），留着给「刚弹出卡带 /
        载入失败」那一下的闪现用；那个过渡用户还没点头，目前没接。
      */}

      {/*
        没有画面时的提示。三种「空屏」分开说：

          · 房主在玩、画面还没到 → WAITING FOR HOST，等一下就行；
          · 桌面端 + 文件正悬停在机身上 → RELEASE TO LOAD（拖拽落点本来就是整机，
            机身描边这时也变成了 accent 色）；
          · 其余 → 怎么开始玩。

        整块屏幕就是按钮，点它 = `onTap`（桌面端选 ROM 文件 / 移动端开游戏库）；
        拖拽由外壳根元素的 onDrop 接，事件从这一层冒泡上去，这里不用管。
        载入中不显示 —— 那时屏幕里是进度条，两样东西叠在一起会打架。

        配色走 crt-*；两行的层次**只靠字号**（11 / 10），颜色是同一档 `crt-ink-200`
        （`crt-ink-200` 是屏幕上文案的亮度下限：屏幕底不是纯黑就是 0.72 的雪花 ——
        后者合成出来约 #5c5c5c，比它暗的灰压上去等于看不见。2026-10-12 用户原话
        「后两句字号太小且颜色和电视背景接近 难以读」）。这几句都在 i18n 文案表里
        （`screen.*`）；中文靠字体回退显示，所以两档在中文下各抬 1px
        （见 globals.css 的 .screen-hint-*）。

        `!crtOff`：关机收缩那 0.4 秒里**让位** —— 否则待机提示会在画面往中间收缩的
        同时正中间跳出来，动画就白做了。
      */}
      {!hasPicture &&
        !loading &&
        !crtOff &&
        (waitingForHost ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="screen-hint-xs font-pixel text-[12px] text-crt-ink-200 drop-shadow-[0_2px_0_rgba(0,0,0,0.9)]">
              {t('screen.waitingHost')}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onTap}
            title={tapTitle}
            aria-label={tapLabel}
            className="absolute inset-0 flex items-center justify-center"
          >
            <span className="flex flex-col items-center gap-[8px] drop-shadow-[0_2px_0_rgba(0,0,0,0.9)]">
              {hot ? (
                <span className="font-pixel text-[13px] text-crt-accent">
                  {t('screen.release')}
                </span>
              ) : (
                <>
                  <span className="flex flex-col items-center gap-[14px]">
                    {variant === 'desktop' ? (
                      <>
                        <span className="screen-hint-sm font-pixel text-[12px] text-crt-ink-200">
                          {t('screen.tapLoad')}
                        </span>
                        <span className="screen-hint-xs font-pixel text-[12px] text-crt-ink-200">
                          {t('screen.orLibrary')}
                        </span>
                      </>
                    ) : (
                      /*
                        移动端只有两行 —— 这里**只能从在线游戏库载入**：手机上没有拖拽，
                        点屏幕打开的就是游戏库本身，所以不再提「选文件」。
                      */
                      <>
                        <span className="screen-hint-sm font-pixel text-[12px] text-crt-ink-200">
                          {t('screen.mobileLibrary')}
                        </span>
                        <span className="screen-hint-xs font-pixel text-[12px] text-crt-ink-200">
                          {t('screen.mobileTap')}
                        </span>
                      </>
                    )}
                  </span>
                  {/*
                    待机光标。**方案 B 里「这台电视通着电、在等你」全靠它** ——
                    少了它，一块黑屏 + 两行字读起来像「关机了但屏幕上还留着残影」。
                    硬开硬关（`.cursor-blink`，1.06s 全灭），不是 PAUSED 那种
                    1↔0.45 的呼吸 —— 光标要的是「在等输入」，不是「在呼吸」。
                    画成**方块**（7×11）而不是 1px 竖线：像素风里一条 1px 的线太细。
                    aria-hidden：纯装饰，读屏不用念它。
                  */}
                  <span
                    aria-hidden="true"
                    className="cursor-blink block h-[11px] w-[7px] bg-crt-accent"
                  />
                </>
              )}
            </span>
          </button>
        ))}

      {/*
        暂停提示。**必须在屏幕里**，光靠机身那颗 PWR 灯不够 —— 暂停之后画面是
        **冻住的最后一帧**，和「卡死了」长得一模一样，不写这一句，用户看到的就是
        一台「坏了」的电视。

        键盘快捷键（P / R / F5 / F8）2026-10-10 全撤了，暂停只剩机身面板那颗钮
        这一个入口，所以下面那句提示必须指到**面板上**，不能再写「按 P」。

        **联机时这一层对加入者同样要出**，只是话不一样：他屏幕上是房主推来的画面，
        房主一暂停那条 `<video>` 就冻在最后一帧，而他本机没有模拟器、也没有那颗暂停钮
        （面板那排全是灰的）—— 不告诉他，他只会以为游戏卡死或者掉线了。

        那层半透明底是拿来压住冻结画面的。文字走 font-pixel，中文靠字体回退。
        刻意**不写 z-index**（要盖住 canvas，又要落在扫描线 / 暗角之下）。
        pointer-events-none：它只是一句话，不该变成点击 / 拖拽的落点。
      */}
      {showPaused && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-[12px] bg-crt-950/60">
          <span className="blink font-pixel text-[20px] text-crt-accent drop-shadow-[0_2px_0_rgba(0,0,0,0.9)]">
            {t('screen.paused')}
          </span>
          {/* 两句话分的是「谁按的」：本机暂停指到面板上，房主暂停只说明在等谁 */}
          <span className="screen-hint-xs font-pixel text-[12px] text-crt-ink-200 drop-shadow-[0_2px_0_rgba(0,0,0,0.9)]">
            {paused ? t('screen.resumeOnPanel') : t('screen.waitHostResume')}
          </span>
        </div>
      )}

      {/*
        载入进度。**从机身下沿挪到屏幕里**的 —— 用户要求进度条出现在电视上。
        刻意**不写 z-index**（要盖住画面，又要落在扫描线 / 暗角之下）。
        进度条宽度写 `min(300px, 72%)`：桌面那三档屏幕（最窄的一档也有 700 多 px 宽）
        算下来都是 300px 封顶；移动端屏幕只有两三百 px 宽，靠那个 72% 缩下去。
        百分数是**读数**、不是文案。
      */}
      {loading && (
        <div className="absolute inset-x-0 bottom-[52px] flex items-center justify-center gap-3">
          <div className="relative h-[10px] w-[min(300px,72%)] overflow-hidden border-2 border-crt-ink-500 bg-crt-950/90">
            {loadPct === null ? (
              <span className="load-slide absolute inset-y-0 left-0 w-1/3 bg-crt-accent/70" />
            ) : (
              <span
                className="absolute inset-y-0 left-0 bg-crt-accent"
                style={{ width: `${loadPct}%` }}
              />
            )}
          </div>
          {/* 百分数全是数字，font-pixel 没有掉字形的问题；宽度写死，位数变化时不抖 */}
          <span className="w-[34px] shrink-0 font-pixel text-[12px] text-crt-ink-300">
            {loadPct === null ? '' : `${loadPct}%`}
          </span>
        </div>
      )}

      {/*
        关机收缩的第二段：屏幕正中那条白线横向收成一个点。
        第一段（画面纵向压扁）挂在 canvas 上，这一段是**独立的**一层 ——
        最后一帧偏暗时压扁了也看不见，这条线才是保底的那一下。

        `h-[4px]` + `-mt-[2px]` 而不是 `-translate-y-1/2`：这条线的动画自己就在写
        `transform`（scaleX），同一个元素上再挂一个 Tailwind 的 translate 会被动画
        整个顶掉，线就贴到屏幕顶边去了。用 margin 把它压正中间。
        屏幕高是偶数，所以 50% - 2px 永远落在整像素上。

        刻意**不写 z-index**：要盖住画面，又必须落在 .crt 的扫描线 / 暗角之下。
      */}
      {crtOff && (
        <span
          aria-hidden
          className="crt-off-line absolute inset-x-0 top-1/2 -mt-[2px] block h-[4px] bg-white"
        />
      )}

      {/*
        联机「已连接」小灯。常驻在屏幕**左上角**（右上角是全屏那个退出口，两者不能撞）。
        一颗 6×6 的绿点，垫一块半透明黑 + ok 描边：游戏画面亮起来的时候，
        光秃秃一个绿点在浅色背景上会糊掉，垫一层才保证任何画面上都读得出来。
        缓慢 blink（`.link-blink`，2.4s 里只暗一下）—— 常亮像一颗死灯。

        屏幕里**不放文案**，所以它没有字，只有 title / aria-label。
        `role="img"`：它是个纯视觉的状态指示，没有文字节点可读。
        pointer-events-none：它只是读数，不能挡着屏幕那块「点一下」的按钮。
      */}
      {netplayLive && (
        <span
          role="img"
          aria-label={t('netplay.connected')}
          title={t('netplay.connected')}
          className="pixel-edge pxw-2 pxc-ok pointer-events-none absolute left-5 top-5 flex h-[14px] w-[14px] items-center justify-center bg-crt-950/75"
        >
          <span className="link-blink block h-[6px] w-[6px] bg-ok" />
        </span>
      )}

      {/*
        全屏时唯一的退出口。它是功能件不是文案 —— 平时（非全屏）不显示。
        z-40 压在屏幕里那层提示之上：全屏 + 没插卡带时两样会同时出现，
        提示是铺满整屏的按钮，不抬起来就点不到这个退出口。
        `onExitFullscreen` 不传（移动端）就整个不画。
      */}
      {onExitFullscreen && (
        <button
          type="button"
          onClick={onExitFullscreen}
          className="fs-exit pixel-edge pxw-2 absolute right-6 top-6 z-40 items-center bg-crt-950/85 px-4 py-3 font-pixel text-[12px] text-crt-ink-200 hover:text-crt-accent"
        >
          EXIT FULLSCREEN
        </button>
      )}
    </div>
  );
}

/**
 * 房主推来的画面。
 *
 * `srcObject` 只能通过属性赋值（没有 HTML 属性可以写），所以这里必须挂 ref + effect。
 * `autoPlay` 不能省 —— 不播的话就是一张静止的黑图；`playsInline` 是给 iOS 的，
 * 不加会强行全屏。刻意不加 `muted`：房主那边的声音也一起推过来了，静音等于白抓一路音频。
 *
 * `volume` 是**本机**的音量档位（机身上那颗 VOL）。加入者没有模拟器，房主推来的
 * 声音只在这条 `<video>` 上 —— 见下面那个 effect 的注释。
 */
function RemoteScreen({ stream, volume }: { stream: MediaStream; volume: number }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    /*
     * 自动播放有可能被拦下：带声音的媒体在没有用户手势时不许自己播。
     * 用户刚点过「加入房间」，多数情况下放得出来；万一被拦，退一步先静音播 ——
     * 至少把画面给出来，没声音总比黑屏强。
     */
    void video.play().catch(() => {
      video.muted = true;
      void video.play().catch(() => undefined);
    });
    return () => {
      // 换流 / 卸载时断开，否则旧的 MediaStream 会被 video 一直攥着
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [stream]);

  /*
   * 音量：第 n 档 = n / VOLUME_MAX，0 档静音。
   *
   * 为什么非接不可：机身那颗 VOL 原先只喂给 `controller.setVolume()`（模拟器音量），
   * 而加入者本机没有模拟器实例 —— 那个调用只是把档位记下来就返回了，一点声音都改不动。
   * 加入者听见的声音全来自这条 <video>，所以档位必须落到 `video.volume` 上。
   *
   * 0 档另外写一次 `muted`：单把 volume 归零也能静音，但「自动播放被拦」那条兜底
   * 走的就是 muted（见上），两边语义统一之后，用户把档位从 0 往上推时能确定地放出声音。
   */
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.volume = volume / VOLUME_MAX;
    video.muted = volume === 0;
  }, [volume]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      className="absolute inset-0 h-full w-full object-contain"
    />
  );
}
