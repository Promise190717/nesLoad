import { useEffect, useRef, type ButtonHTMLAttributes, type DragEvent, type RefObject } from 'react';
import { VOLUME_MAX, type LoadedRom } from '@/lib/emulator';
import CartridgeSprite from './CartridgeSprite';
import { useI18n } from './I18nProvider';

/*
 * 机身尺寸（2026-10-08 整体放大到 1.25 倍）。
 *
 * 屏幕是 720×540（NES 画面的 4:3），机身宽度 = 720 + 屏幕外边距 15×2 +
 * 内圈外边距 8×2 = **766px**。顶沿、前面板、插卡舱、底座都是跟着屏幕走的固定值，
 * 只改屏幕会让比例散掉 —— 下面这些是**一套**，要动就一起动：
 *
 *   屏幕 720×540 · 屏幕外边距 15 · 内圈外边距 8 · 内圈描边 pxw-4 · 机身描边 pxw-6
 *   顶沿 30 · 插卡舱 68 · 卡槽 375 · 舱内卡带 375-8×2 = 359 · 底座 450×18
 *
 * 场景宽度 = 766 + 间距 16 + 卡带架 220 = 1002，加 main 的 px-6 是 1050px，
 * 所以 globals.css 的桌面端断点落在 **1100px**。改这里就要同步那个断点、
 * globals.css 上方那段注释，以及 i18n.ts 的 notice.desktopOnly（中英各一处）。
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
   * 房主插着的那盘卡带。加入者拿它在机身上显示「现在玩的是哪盘」。
   * 刻意不要求 size —— 加入者只需要名字和机种（卡带 sprite 就吃这两个），
   * 没必要为了凑成 LoadedRom 在线上多传一个数字。
   */
  remoteRom: { name: string; console: LoadedRom['console'] } | null;
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
  /** 拎着的卡带正悬停在底部插卡口上 */
  slotHot: boolean;
  slotRef: RefObject<HTMLButtonElement | null>;
  onPickFile: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDropFile: (e: DragEvent<HTMLDivElement>) => void;
  onTogglePause: () => void;
  onSave: () => void;
  onLoad: () => void;
  onImport: () => void;
  onExport: () => void;
  onEject: () => void;
  onVolume: (level: number) => void;
  onExitFullscreen: () => void;
}

/**
 * 电视机（游戏机已并进来：插卡口就在机身下沿，顶沿有一条散热缝）。
 * 卡带推进去以后只露出侧面那一条，名字沿长边走 —— 和卡带架里的一盘露的是同一个面。
 * canvas 必须始终留在 DOM 里（未插卡带时也一样），否则 Nostalgist 找不到渲染目标。
 *
 * 屏幕内部不放任何文案：没插卡带就是一片雪花，插上就直接出画面。
 * 状态一律由机身上的东西表达 —— 电源灯的颜色、面板按钮的可用状态、插卡舱那句提示。
 * 屏幕内部的配色一律用 crt-* 令牌而不是 ink-*：屏幕底永远是黑的，
 * 而 ink-* 会随主题翻转，浅色主题下就成了黑底黑字。
 *
 * 联机时加入者这边**没有模拟器**：屏幕上放的是一条 `<video>`（房主推来的画面），
 * 插卡舱里躺着的是**房主**插的那盘卡带，六个面板按钮因为没有本地卡带而全部变灰。
 * 这些都由 remoteStream / remoteRom 两个 prop 表达。
 */
export default function RetroTv({
  canvasRef,
  screenRef,
  rom,
  remoteStream,
  remoteRom,
  paused,
  busy,
  loading,
  canLoad,
  volume,
  fileOver,
  slotHot,
  slotRef,
  onPickFile,
  onDragOver,
  onDragLeave,
  onDropFile,
  onTogglePause,
  onSave,
  onLoad,
  onImport,
  onExport,
  onEject,
  onVolume,
  onExitFullscreen,
}: RetroTvProps) {
  const { t } = useI18n();
  const hot = fileOver || slotHot;
  /** 载入进度（整数百分比）。null = 拿不到字节数，插卡舱画不确定进度条 */
  const loadPct = loading && loading.ratio !== null ? Math.round(loading.ratio * 100) : null;

  /*
   * 有画面 = 本机插着卡带，或者房主推了画面过来。两者只会有一个成立：
   * 加入者一收到画面就会把自己本地的卡带弹掉（见 ConsoleScene）。
   */
  const hasPicture = Boolean(rom) || Boolean(remoteStream);
  /** 机身上显示的那盘：本机插的优先，其次才是房主插的 */
  const shownRom = rom ?? remoteRom;
  /** 只看着房主的画面（本机没插卡带）—— 这时插卡口不该还能点出文件选择框 */
  const remoteOnly = !rom && Boolean(remoteRom);

  /**
   * 插卡口。必须始终挂在 DOM 上 —— 拎着卡带拖过来时靠它的矩形做命中判定，
   * 插着卡带的时候若把它摘掉，slotRef.current 就成了 null，想换卡带就拖不动了。
   * 所以这里是「按钮常驻、提示文案随状态增减」，而不是整块条件渲染。
   *
   * `block` 不能省：button 默认是 inline-block，一旦被放进普通 div（插卡态的包裹层），
   * 行内格式化上下文的 strut 会把这个 div 撑高几个像素、按钮被顶到顶部，
   * 于是相对它居中的卡带就偏了。改成块级就没有行框了。
   */
  const slotButton = (
    <button
      type="button"
      ref={slotRef}
      onClick={onPickFile}
      disabled={loading !== null}
      title={t('slot.pick')}
      className={`block relative h-[16px] w-[375px] pixel-edge pxw-2 transition-colors ${
        hot ? 'bg-accent/30 pxc-accent' : 'bg-ink-950 pxc-700'
      }`}
    >
      <span className="sr-only">{t('slot.srLabel')}</span>
    </button>
  );

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
          缝用 ink-950 并配一道顶沿亮边 —— 和下面插卡舱的凹影同一个方向。
          右端原来有一块 NESLOAD 铭牌，已按用户要求去掉；这里只剩散热缝，
          所以也不再需要 ml-auto 把东西推到右边。
        */}
        <div className="relative flex h-[30px] items-center border-b-2 border-ink-800 bg-ink-850 px-5">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-ink-950/45" />
          <span className="relative flex items-center gap-[6px]">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className="h-[5px] w-[9px] bg-ink-950/70" />
            ))}
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
              载入进度。**从插卡舱挪到屏幕里**的 —— 用户要求进度条出现在电视上，
              机身下沿那一格不再画它。屏幕里没画面时本来是一片雪花，进度条叠在雪花之上，
              让「正在读卡带」这件事看得见。

              刻意**不写 z-index**：要盖住雪花，又必须落在 .crt 的扫描线（z-5）/ 暗角（z-6）
              之下，否则会把显像管质感糊掉。配色走 crt-* 而不是 ink-*（屏幕底永远是黑的，
              ink-* 会随主题翻转，浅色主题下就成了黑底黑字）。
              百分数是**读数**、不是文案 —— 和 EXIT FULLSCREEN 同性质，是屏幕里唯一的例外。
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
              全屏时唯一的退出口。它是功能件不是文案 —— 平时（非全屏）不显示，
              屏幕里就真的什么都没有。
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

          六个按钮一律看 `rom`（本机有没有插卡带），不看有没有画面：
          加入者屏幕上是房主的画面，但这些按钮管的是本机的模拟器，本机没有模拟器，
          所以它们该是灰的。PWR 灯则相反 —— 有画面就亮。
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

          <div className="grid flex-1 grid-cols-6 gap-1.5">
            <PanelBtn onClick={onTogglePause} disabled={!rom || busy}>
              {paused ? t('panel.resume') : t('panel.pause')}
            </PanelBtn>
            <PanelBtn onClick={onSave} disabled={!rom || busy}>
              {t('panel.save')}
            </PanelBtn>
            <PanelBtn onClick={onLoad} disabled={!rom || busy || !canLoad}>
              {t('panel.load')}
            </PanelBtn>
            <PanelBtn onClick={onImport} disabled={!rom || busy}>
              {t('panel.import')}
            </PanelBtn>
            <PanelBtn onClick={onExport} disabled={!rom || busy}>
              {t('panel.export')}
            </PanelBtn>
            <PanelBtn onClick={onEject} disabled={!rom || busy} danger>
              {t('panel.eject')}
            </PanelBtn>
          </div>
        </div>

        {/*
          底部插卡舱：卡带从机身下沿推进去，露在外面的只有侧面那一条。
          这是唯一的入口，所以空着的时候必须把「插卡」这件事说清楚。
          INSERT CARTRIDGE / RELEASE TO LOAD 刻意留英文：它们是 font-pixel（Press Start 2P）
          渲染的，那套字模没有汉字，混排会掉到等宽字体上、和机身上其他铭牌不一致。

          联机时加入者这边躺的是**房主**那盘（remoteRom）：插卡口整块
          pointer-events-none —— 本机没插卡带，点它只会弹出文件选择框，
          而这时候载入本地卡带是没意义的（画面是房主推来的）。
        */}
        <div className="relative flex h-[68px] flex-col items-center justify-center gap-[8px] border-t-2 border-ink-800 bg-ink-850">
          {/* 舱口的暗影，让它读起来是凹进去的一格而不是又一块面板 */}
          <span className="pointer-events-none absolute inset-x-0 top-0 h-[4px] bg-ink-950/55" />

          {loading ? (
            /*
              正在插卡带。**进度条不在这里** —— 用户要求它挪进屏幕（见上面 `.screen` 里那段），
              机身下沿这一格只留状态标签和槽本身。
              槽按钮必须留着：拎着卡带拖过来时靠它的矩形做命中判定，摘掉就没法换卡带了。
            */
            <>
              <span className="font-pixel text-[9px] text-accent">LOADING</span>
              {slotButton}
            </>
          ) : shownRom ? (
            /*
              卡带就插在卡槽的位置上，和槽重叠 —— 不是排在槽下面。
              槽 375 宽、卡带 359 宽，所以槽在左右各露出 8px；卡带 30px 比槽 16px 高，
              垂直居中于槽之后上下各探出 7px，读起来才像「插进去了」。
              卡带必须 pointer-events-none：它压在槽按钮上，否则点槽换卡带就点不到。
              宽度必须在这里定死：sprite 是 w-full，而插卡舱是 flex-col + items-center，
              不会把子项横向拉伸，w-full 会一路算到机身宽度上。
            */
            <div className={`relative w-[375px] ${remoteOnly ? 'pointer-events-none' : ''}`}>
              {slotButton}
              <div className="pointer-events-none absolute inset-x-[8px] top-1/2 -translate-y-1/2">
                <CartridgeSprite name={shownRom.name} consoleType={shownRom.console} active />
              </div>
            </div>
          ) : (
            <>
              <span className={`font-pixel text-[9px] ${hot ? 'text-accent' : 'text-ink-400'}`}>
                {hot ? 'RELEASE TO LOAD' : 'INSERT CARTRIDGE'}
              </span>
              {slotButton}
              {/* 箭头朝上：卡带是从下往上推进这个槽里的 */}
              <span className="blink font-pixel text-[10px] text-ink-500">▲</span>
            </>
          )}
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
