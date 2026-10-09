import { useEffect, useRef, type ButtonHTMLAttributes, type DragEvent, type RefObject } from 'react';
import packageJson from '@/package.json';
import { VOLUME_MAX, type LoadedRom } from '@/lib/emulator';
import { useI18n } from './I18nProvider';

/*
 * 机身尺寸（2026-10-08 整体放大到 1.25 倍；2026-10-09 去掉插卡舱，高度减 70px）。
 *
 * 屏幕是 720×540（NES 画面的 4:3），机身宽度 = 720 + 屏幕外边距 15×2 +
 * 内圈外边距 8×2 = **766px**。顶沿、前面板、底座都是跟着屏幕走的固定值，
 * 只改屏幕会让比例散掉 —— 下面这些是**一套**，要动就一起动：
 *
 *   屏幕 720×540 · 屏幕外边距 15 · 内圈外边距 8 · 内圈描边 pxw-4 · 机身描边 pxw-6
 *   顶沿 30 · 前面板（py-3 撑出来）· 底座 450×18
 *
 * 底部那个 68px 的**插卡舱已经撤掉**（2026-10-09，用户要求）：拖拽落点本来就是整机，
 * 卡槽只是个多余的入口，留着还白占 70px 高度。现在「怎么开始玩」由屏幕里的提示负责。
 *
 * 场景原先 = 766 + 间距 16 + 卡带架 220 = 1002，加 main 的 px-6 是 1050px，断点 1100px。
 * 卡带架 2026-10-09 撤掉后只剩 766 + px-6 = **814px**，断点跟着降到 **900px**。
 * 改这里要同步 globals.css 的断点与上方那段注释，
 * 以及 i18n.ts 的 notice.desktopOnly（中英各一处）。
 */

/**
 * 机身宽度 = 屏幕 720 + 屏幕外边距 15×2 + 内圈外边距 8×2 = 766。
 *
 * 组件里**没有**写死 width（宽度是上面那套尺寸自己撑出来的），这里只是把它导出去。
 * 早先 ConsoleScene 的键位表要按**机身**对中（而不是按「机身 + 卡带架」整排对中）时
 * 用过它；键位表 2026-10-09 挪到右上角之后已无人引用，保留是为了让机身宽度有个
 * 唯一出处 —— 改屏幕尺寸或那两道外边距时，对着这个值核一遍。
 */
export const TV_WIDTH = 766;

interface RetroTvProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** 全屏目标就是这个屏幕，不是整页 */
  screenRef: RefObject<HTMLDivElement | null>;
  rom: LoadedRom | null;
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
  paused: boolean;
  busy: boolean;
  /**
   * 正在插卡带。null = 没在载入。
   *
   * `ratio` 是核心包的下载进度（0..1），null 表示拿不到字节数（核心已在
   * CacheStorage 里、或响应没有 Content-Length）—— 这时**屏幕上**画一条来回滑的
   * 「不确定」进度条，总之必须让用户看到「在动」。
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
  onEject: () => void;
  onVolume: (level: number) => void;
  onExitFullscreen: () => void;
}

/**
 * 电视机（游戏机已并进来：顶沿有一条散热缝）。机身下沿原来有个插卡舱，2026-10-09 撤了。
 * canvas 必须始终留在 DOM 里（未插卡带时也一样），否则 Nostalgist 找不到渲染目标。
 *
 * **没插卡带时屏幕里放的是「怎么开始玩」的提示**（拖进来 / 点屏幕选文件 / 点游戏库），
 * 叠在那片雪花之上 —— 插卡舱撤掉之后没有别的地方能说清这件事，
 * 新用户对着一片雪花只会以为坏了。
 *
 * 屏幕里**只放状态提示**：这一句、`RELEASE TO LOAD`、`WAITING FOR HOST`、载入进度条。
 * 要读的说明（存档列表 / 联机 / 键位 / 按键说明）一律走浮在房间上的弹窗。
 * 提示文字走 font-pixel，那套字模**没有汉字**，所以只能是英文（和 PWR / VOL /
 * EXIT FULLSCREEN 同一套做法，也因此不进 i18n 文案表）。
 * 屏幕内部的配色一律用 crt-* 令牌而不是 ink-*：屏幕底永远是黑的，
 * 而 ink-* 会随主题翻转，浅色主题下就成了黑底黑字。
 *
 * 联机时加入者这边**没有模拟器**：屏幕上放的是一条 `<video>`（房主推来的画面），
 * 四个面板按钮因为没有本地卡带而全部变灰。
 * 这些都由 remoteStream / remotePlaying 两个 prop 表达。
 */
export default function RetroTv({
  canvasRef,
  screenRef,
  rom,
  remoteStream,
  remotePlaying,
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
  onEject,
  onVolume,
  onExitFullscreen,
}: RetroTvProps) {
  const { t } = useI18n();
  const hot = fileOver;
  /** 载入进度（整数百分比）。null = 拿不到字节数，屏幕上画一条不确定进度条 */
  const loadPct = loading && loading.ratio !== null ? Math.round(loading.ratio * 100) : null;

  /*
   * 有画面 = 本机插着卡带，或者房主推了画面过来。两者只会有一个成立：
   * 加入者一收到画面就会把自己本地的卡带弹掉（见 ConsoleScene）。
   */
  const hasPicture = Boolean(rom) || Boolean(remoteStream);
  /** 房主在玩、画面还没到 —— 这时该说「等一下」，不该招呼用户拖 ROM 进来 */
  const waitingForHost = !rom && remotePlaying && !remoteStream;

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
      <div className={`relative bg-ink-700 pixel-edge pxw-6 ${hot ? 'pxc-accent' : 'pxc-500'}`}>
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
        <div className="relative m-[8px] bg-ink-900 pixel-edge pxw-4 pxc-700">
          {/*
            屏幕尺寸由容器定死，canvas 只负责填满。
            Nostalgist 启动时会往 canvas 上写 width/height: 100% 的内联样式，
            内联样式压过 class —— 若让 canvas 去撑容器就会塌成 0。
          */}
          <div
            ref={screenRef}
            className="screen crt relative m-[15px] h-[540px] w-[720px] overflow-hidden bg-black"
          >
            {/*
              canvas 必须始终留在 DOM 里，但没画面时要把它藏起来：
              模拟器退出后 canvas 会保留最后一帧画面（浏览器不会主动清空），
              雪花只有 0.72 不透明度，那一帧会透出来，看着像游戏还在跑。
              visibility: hidden 不改变布局，也不影响 Nostalgist 量尺寸。
              联机时房主那边 canvas 是画面源头，当然要留着 —— 只有加入者这边才藏。
            */}
            <canvas
              ref={canvasRef}
              width={720}
              height={540}
              className={`pixelated block h-full w-full ${
                rom && !remoteStream ? '' : 'invisible'
              }`}
            />

            {/*
              房主推来的画面。定位到绝对层是为了压住 canvas —— canvas 在正常流里，
              定位元素天然画在它上面。刻意**不给 z-index**：它要盖住 canvas，
              但必须落在 .crt 的两层伪元素（扫描线 z-5 / 边角暗角 z-6）之下，
              写成 z-10 会把显像管的质感一起糊掉。
            */}
            {remoteStream && <RemoteScreen stream={remoteStream} />}

            {/*
              没画面 = 没有信号，整块屏幕就是一片雪花。
              这一层刻意不给 z-index：它要盖住 canvas，但必须落在 .crt 的两层伪元素
              （扫描线 z-5 / 边角暗角 z-6）之下。若写成 z-10，不透明的噪点会把扫描线
              和暗角一起糊掉，显像管的质感就没了。
              亮度只由 opacity 控制，CSS 里那份噪点本身保持原样。
            */}
            {!hasPicture && <div className="noise absolute inset-0 opacity-[0.72]" />}

            {/*
              没有画面时的提示 —— 屏幕里**没插卡带时**那一处状态提示（见组件头注释）。
              三种「空屏」分开说：

                · 房主在玩、画面还没到 → WAITING FOR HOST，等一下就行；
                · 文件正悬停在机身上 → RELEASE TO LOAD（拖拽落点本来就是整机，
                  机身描边这时也变成了 accent 色）；
                · 其余 → 怎么开始玩的三行。

              整块屏幕就是按钮，点它 = 选 ROM 文件；拖拽由根元素的 onDrop 接，
              事件从这一层冒泡上去，这里不用管。载入中不显示 —— 那时屏幕里是进度条，
              两样东西叠在一起会打架。

              配色走 crt-*（屏幕底永远是黑的，ink-* 会随主题翻转）。
              那层 drop-shadow 是为了压住雪花：像素字直接叠在噪点上会糊掉。
            */}
            {!hasPicture &&
              !loading &&
              (waitingForHost ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="font-pixel text-[9px] text-crt-ink-400 drop-shadow-[0_2px_0_rgba(0,0,0,0.9)]">
                    WAITING FOR HOST
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onPickFile}
                  title={t('screen.pick')}
                  aria-label={t('screen.srLabel')}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <span className="flex flex-col items-center gap-[14px] drop-shadow-[0_2px_0_rgba(0,0,0,0.9)]">
                    {hot ? (
                      <span className="font-pixel text-[13px] text-crt-accent">
                        RELEASE TO LOAD
                      </span>
                    ) : (
                      <>
                        <span className="font-pixel text-[11px] text-crt-ink-200">
                          DRAG &amp; DROP A ROM
                        </span>
                        <span className="font-pixel text-[9px] text-crt-ink-400">
                          OR CLICK TO CHOOSE A FILE
                        </span>
                        <span className="font-pixel text-[9px] text-crt-ink-400">
                          OR LAUNCH FROM LIBRARY
                        </span>
                      </>
                    )}
                  </span>
                </button>
              ))}

            {/*
              载入进度。**从机身下沿挪到屏幕里**的 —— 用户要求进度条出现在电视上，
              而插卡舱 2026-10-09 整个撤掉了。屏幕里没画面时本来是一片雪花，
              进度条叠在雪花之上，让「正在读卡带」这件事看得见。

              刻意**不写 z-index**：要盖住雪花，又必须落在 .crt 的扫描线（z-5）/ 暗角（z-6）
              之下，否则会把显像管质感糊掉。配色走 crt-* 而不是 ink-*（屏幕底永远是黑的，
              ink-* 会随主题翻转，浅色主题下就成了黑底黑字）。
              百分数是**读数**、不是文案。
            */}
            {loading && (
              <div className="absolute inset-x-0 bottom-[52px] flex items-center justify-center gap-3">
                <div className="relative h-[10px] w-[300px] overflow-hidden border-2 border-crt-ink-500 bg-crt-950/90">
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
                <span className="w-[34px] shrink-0 font-pixel text-[9px] text-crt-ink-300">
                  {loadPct === null ? '' : `${loadPct}%`}
                </span>
              </div>
            )}

            {/*
              全屏时唯一的退出口。它是功能件不是文案 —— 平时（非全屏）不显示。
              z-40 压在屏幕里那层提示之上：全屏 + 没插卡带时两样会同时出现，
              提示是铺满整屏的按钮，不抬起来就点不到这个退出口。
            */}
            <button
              type="button"
              onClick={onExitFullscreen}
              className="fs-exit pixel-edge pxw-2 absolute right-6 top-6 z-40 items-center bg-crt-950/85 px-4 py-3 font-pixel text-[11px] text-crt-ink-200 hover:text-crt-accent"
            >
              EXIT FULLSCREEN
            </button>
          </div>
        </div>

        {/*
          前面板。纵向留白刻意压到 py-3 —— 一排小按钮 + 20px 的音量键，
          面板高度就由它们撑出来，多余的空只会让机身显得虚胖。

          四个按钮一律看 `rom`（本机有没有插卡带），不看有没有画面：
          加入者屏幕上是房主的画面，但这些按钮管的是本机的模拟器，本机没有模拟器，
          所以它们该是灰的。PWR 灯则相反 —— 有画面就亮。

          按钮宽度**写死 64px**、整排用 `ml-auto` 贴右边：之前是 `flex-1` 撑满，
          4 个格子分掉整条面板，每个按钮宽到 110px，太大也太散。
          不用 `px-*` 让文字自己撑宽度是因为中英文字数不一样（`Pause` vs `暂停`），
          那样 4 个按钮会宽窄不齐。面板是定宽机身（屏幕 720 + 边距）里的一行，
          不存在窄屏挤压，所以写死尺寸是安全的。
        */}
        <div className="flex items-center gap-5 border-t-2 border-ink-800 bg-ink-700 px-5 py-3">
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`h-3 w-3 ${
                rom ? (paused ? 'bg-accent' : 'bg-ok') : hasPicture ? 'bg-ok' : 'bg-ink-600'
              }`}
            />
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
                {Array.from({ length: VOLUME_MAX }, (_, i) => i + 1).map((level) => (
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
                ))}
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

          <div className="ml-auto grid grid-cols-[repeat(4,64px)] gap-1.5">
            <PanelBtn onClick={onTogglePause} disabled={!rom || busy}>
              {paused ? t('panel.resume') : t('panel.pause')}
            </PanelBtn>
            <PanelBtn onClick={onSave} disabled={!rom || busy}>
              {t('panel.save')}
            </PanelBtn>
            <PanelBtn onClick={onLoad} disabled={!rom || busy || !canLoad}>
              {t('panel.load')}
            </PanelBtn>
            <PanelBtn onClick={onEject} disabled={!rom || busy} danger>
              {t('panel.eject')}
            </PanelBtn>
          </div>
        </div>
      </div>

      {/* 底座 */}
      <div className="mx-auto mt-[3px] h-[18px] w-[450px] bg-ink-700 pixel-edge pxw-4 pxc-500" />

      <div className="ground-shadow absolute inset-x-12 -bottom-[8px] h-[8px]" />
    </div>
  );
}

/**
 * 房主推来的画面。
 *
 * `srcObject` 只能通过属性赋值（没有 HTML 属性可以写），所以这里必须挂 ref + effect。
 * `autoPlay` 不能省 —— 不播的话就是一张静止的黑图；`playsInline` 是给 iOS 的，
 * 不加会强行全屏。刻意不加 `muted`：房主那边的声音也一起推过来了，
 * 静音等于白抓一路音频。
 */
function RemoteScreen({ stream }: { stream: MediaStream }) {
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

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      className="absolute inset-0 h-full w-full object-contain"
    />
  );
}

/** 音量条两端的小方钮。20px 见方，和面板按钮同一套描边与配色。 */
function VolBtn({
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

function PanelBtn({
  danger = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      type="button"
      className={`pixel-edge pxw-2 bg-ink-600 py-1.5 text-[11px] text-ink-100 transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        danger
          ? 'pxc-500 enabled:hover:bg-ink-500 enabled:hover:text-danger'
          : 'pxc-500 enabled:hover:bg-ink-500 enabled:hover:text-accent'
      } ${className}`}
      {...props}
    />
  );
}
