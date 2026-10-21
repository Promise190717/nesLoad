'use client';

import { useEffect, useState } from 'react';
import { ROOM_QUERY_PARAM, TURN_CONFIGURED } from '@/lib/netplay';
import type { NetplayError, NetplayMode, NetplayState, StreamQuality } from '@/lib/netplay';
import type { MessageKey } from '@/lib/i18n';
import { useI18n } from './I18nProvider';

interface NetplayPanelProps {
  open: boolean;
  /**
   * 输入框的初始值 —— 从分享链接确认加入时带进来的房间码。
   * 只在**挂载时**读一次（走 useState 的初始值）：父级会同时换掉本面板的 `key`，
   * 所以码一变就是一次重挂载，不需要在这里写「prop 变了同步进 state」的 effect。
   */
  initialCode?: string;
  state: NetplayState;
  busy: boolean;
  /** 当前选的链路。`lan` = 只 STUN；`wan` = 额外带 TURN 兜底（仍是直连优先） */
  mode: NetplayMode;
  onModeChange: (mode: NetplayMode) => void;
  /** 当前出画档位。房主用得上；加入者不推流，选了也不生效 */
  quality: StreamQuality;
  onQualityChange: (quality: StreamQuality) => void;
  onClose: () => void;
  onCreate: () => void;
  onJoin: (code: string) => void;
  onLeave: () => void;
}

/**
 * 错误码 → 文案。
 *
 * 写成 `Record<NetplayError, MessageKey>` 是为了拿穷尽性检查：以后在 `netplay.ts`
 * 里加了新的错误码，这里漏一条就直接编译不过，不会退化成一句含糊的兜底。
 */
const ERROR_MESSAGE: Record<NetplayError, MessageKey> = {
  'bad-code': 'netplay.badCode',
  'insecure-context': 'netplay.errInsecure',
  'no-direct-connection': 'netplay.errNoDirect',
  'room-password': 'netplay.errPassword',
  handshake: 'netplay.errHandshake',
  'host-left': 'netplay.errHostLeft',
  'room-full': 'netplay.errRoomFull',
  'join-failed': 'netplay.errUnknown',
};

/**
 * 档位 → 文案。和上面同样是穷尽性检查，加档位时漏一条编译不过。
 * 刻意只用两个字 / 一个词：三个按钮要并排塞进 420px 的面板。
 */
const QUALITY_MESSAGE: Record<StreamQuality, MessageKey> = {
  smooth: 'netplay.qualitySmooth',
  balanced: 'netplay.qualityBalanced',
  sharp: 'netplay.qualitySharp',
};

/** 三档的顺序：由省到费。数组顺序 = 界面顺序，别改成对象遍历（顺序不可靠）。 */
const QUALITY_ORDER: StreamQuality[] = ['smooth', 'balanced', 'sharp'];

/**
 * 联机面板。和存档列表一样浮在画面上、**不进屏幕** ——
 * 屏幕里跑的是游戏画面，这张面板要写字、还要输入房间码。
 *
 * 三个状态各自成屏：
 *   idle      → 创建 / 输入码加入（`error` 有值时在底部补一句原因）
 *   waiting   → 亮出房间码 + 状态行（房主：「等待对方」/ 加入者：「正在加入房间」）
 *   connected → 亮出房间码 + 延迟
 *
 * idle 那一屏上有两个选择器，都只在**没进房间**时出现：
 *   - 链路（`lan` / `wan`）—— 连上了再换档没有意义；
 *   - 出画档位（流畅 / 均衡 / 清晰）—— 换档要重建整条流，玩到一半换会闪一下。
 * 档位那个是给房主用的（编码压在他机器上），理见 lib/netplay.ts 的 `StreamQuality`。
 *
 * ⚠️ `waiting` 这一档**两种角色的含义不同**，状态行文案必须按 role 分开 ——
 * 房主是「房间开好了、等对方来」，加入者是「我正在连过去」。给加入者显示
 * 「等待对方加入」会让他以为自己是房主（明明是他输码投奔别人）。
 * 另外加入者只要房主一走，房间就被销毁、直接落回 idle 并报 `host-left`
 * （见 lib/netplay.ts 的 onPeerLeave），所以加入者的 `waiting` 只会出现在
 * 「刚点完加入、还没握上手」这一段。
 *
 * 加入者这边还多两条只有它才看得到的信息：房主在玩哪盘、以及「连上了但房主还没插卡」。
 * 后者必须有 —— 加入者本机没有卡带，房主不出画面时他的屏幕就是一片雪花，
 * 没有这句话就只能干等着猜。
 */
export default function NetplayPanel({
  open,
  initialCode = '',
  state,
  busy,
  mode,
  onModeChange,
  quality,
  onQualityChange,
  onClose,
  onCreate,
  onJoin,
  onLeave,
}: NetplayPanelProps) {
  const { t } = useI18n();
  const [code, setCode] = useState(initialCode);
  /**
   * 刚复制了哪一样东西 —— 房间码还是分享链接。
   *
   * 两者共用一个计时器而不是各存一个 boolean：同一时刻只可能有一个「刚复制」，
   * 分开存反而会出现两个按钮同时显示「已复制」的假象。
   */
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  // 复制成功的小提示过一会儿自己收回去
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!open) return null;

  const inRoom = state.status !== 'idle';
  /**
   * 「公网」这一档要靠 TURN 才跑得起来。构建期没配 `NEXT_PUBLIC_TURN_URL` 时
   * `wan` 和 `lan` 实际等价（`turnConfig()` 返回空），那就不放进创建/加入流程，
   * 只给一句说明 —— 否则用户会对着「等待对方加入」干等，还以为是对方没进来。
   *
   * 配好那三个环境变量重新构建之后，这里自动变成 false，「公网」就正常可用了。
   */
  const wanLocked = mode === 'wan' && !TURN_CONFIGURED;
  const errorText = state.error ? t(ERROR_MESSAGE[state.error]) : null;

  const copyCode = async () => {
    if (!state.code) return;
    try {
      await navigator.clipboard.writeText(state.code);
      setCopied('code');
    } catch {
      // 剪贴板被拒（非安全上下文 / 用户拒绝）时静默：码就在屏幕上，手抄也行
    }
  };

  /**
   * 分享 = 把**整条链接**复制走，`?room=XXXX`。
   *
   * 拼的是 `window.location` 现址（协议 / 域名 / 端口 / 部署路径全带上），
   * 而不是自己拼一个 origin —— 这样本地 `localhost:3000` 和线上域名都不用分支判断。
   * 顺手把已有的 hash 抹掉：`#` 后面那段是页面自己的状态，跟邀请无关，
   * 留着只会让链接更长、还可能把 `?room` 挡在「人眼能看到的部分」之外。
   */
  const copyShareLink = async () => {
    if (!state.code) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set(ROOM_QUERY_PARAM, state.code);
      url.hash = '';
      await navigator.clipboard.writeText(url.toString());
      setCopied('link');
    } catch {
      // 同上：剪贴板不可用时静默，码还在屏幕上
    }
  };

  const submitJoin = () => {
    if (!code.trim()) return;
    onJoin(code);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-ink-950/70" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('netplay.title')}
        className="relative w-[420px] max-w-full bg-ink-800 pixel-edge pxw-4 pxc-600"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b-2 border-ink-900 bg-ink-850 px-4 py-3">
          <span className="text-[12px] text-ink-200">{t('netplay.title')}</span>
          <button
            type="button"
            aria-label={t('netplay.close')}
            onClick={onClose}
            className="pixel-edge pxw-2 pxc-500 ml-auto flex h-[18px] w-[18px] items-center justify-center bg-ink-700 text-[12px] leading-none text-ink-100 hover:bg-danger hover:text-ink-950"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          {/* 链路选择器。只在没进房间时给 —— 连上了再换档没有意义 */}
          {!inRoom && (
            <div className="flex gap-1">
              {(['lan', 'wan'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={busy}
                  aria-pressed={mode === value}
                  onClick={() => onModeChange(value)}
                  className={`pixel-edge pxw-2 pxc-500 block flex-1 py-1.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                    mode === value
                      ? 'bg-accent text-ink-950'
                      : 'bg-ink-700 text-ink-200 enabled:hover:bg-ink-600 enabled:hover:text-accent'
                  }`}
                >
                  {t(value === 'lan' ? 'netplay.modeLan' : 'netplay.modeWan')}
                </button>
              ))}
            </div>
          )}

          {/* 公网档还没配 TURN —— 只说明，不放创建/加入的入口 */}
          {!inRoom && wanLocked && (
            <p className="text-[12px] text-ink-200">{t('netplay.wanDev')}</p>
          )}

          {/*
            出画档位。

            为什么放在「没进房间」这一段（和链路选择器同规矩）：换档要连**帧率**一起换，
            而帧率是 `captureStream(fps)` 的建流参数、事后改不了 —— 换档等于重建整条流，
            玩到一半换会闪一下还要重新协商。退房再选是几秒钟的事。

            为什么加入者也看得到：进房间之前谁都还不知道自己是房主还是加入者
            （角色是开了/进了房间才定的）。这一项确实只对房主生效，所以文案里讲明白，
            而不是藏起来 —— 藏起来的话，卡的那个人会以为这事儿跟他无关。
          */}
          {!inRoom && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] text-ink-500">{t('netplay.quality')}</span>
              <div className="flex gap-1">
                {QUALITY_ORDER.map((value) => (
                  <button
                    key={value}
                    type="button"
                    disabled={busy}
                    aria-pressed={quality === value}
                    onClick={() => onQualityChange(value)}
                    className={`pixel-edge pxw-2 pxc-500 block flex-1 py-1.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                      quality === value
                        ? 'bg-accent text-ink-950'
                        : 'bg-ink-700 text-ink-200 enabled:hover:bg-ink-600 enabled:hover:text-accent'
                    }`}
                  >
                    {t(QUALITY_MESSAGE[value])}
                  </button>
                ))}
              </div>
              <p className="text-[12px] leading-relaxed text-ink-500">
                {t('netplay.qualityHint')}
              </p>
            </div>
          )}

          {!inRoom && !wanLocked && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onCreate}
                className="pixel-edge pxw-3 pxc-600 block w-full bg-accent py-2 text-[12px] text-ink-950 transition-colors enabled:hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {t('netplay.create')}
              </button>

              <div className="flex items-center gap-2">
                <span className="h-[2px] flex-1 bg-ink-900" />
                <span className="text-[12px] text-ink-500">{t('netplay.or')}</span>
                <span className="h-[2px] flex-1 bg-ink-900" />
              </div>

              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitJoin();
                  }}
                  maxLength={4}
                  placeholder={t('netplay.codePlaceholder')}
                  aria-label={t('netplay.codePlaceholder')}
                  className="pixel-edge pxw-2 pxc-500 min-w-0 flex-1 bg-ink-900 px-2 py-2 font-pixel text-[14px] uppercase tracking-[0.25em] text-ink-100 placeholder:text-ink-600 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={busy || !code.trim()}
                  onClick={submitJoin}
                  className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-3 py-2 text-[12px] text-ink-100 transition-colors enabled:hover:bg-ink-600 enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {t('netplay.join')}
                </button>
              </div>

              <p className="text-[12px] leading-relaxed text-ink-500">{t('netplay.hint')}</p>
            </>
          )}

          {inRoom && (
            <>
              <div className="flex flex-col items-center gap-1 border-b-2 border-ink-900 pb-4">
                <span className="text-[12px] text-ink-500">{t('netplay.roomCode')}</span>
                <span className="font-pixel text-[22px] tracking-[0.3em] text-accent">
                  {state.code}
                </span>
                {/*
                  两个按钮挪到码下面单独一行（原先「复制」挤在码右边）：
                  分享那条的「链接已复制」比「分享」长一截，横排会把房间码顶得左右晃。
                  竖着排之后两个按钮的宽度变化只影响自己那一行，码一直居中不动。
                */}
                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void copyCode()}
                    className="pixel-edge pxw-2 pxc-500 bg-ink-700 px-2 py-1 text-[12px] text-ink-200 transition-colors hover:bg-ink-600 hover:text-accent"
                  >
                    {copied === 'code' ? t('netplay.copied') : t('netplay.copy')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyShareLink()}
                    className="pixel-edge pxw-2 pxc-500 bg-ink-700 px-2 py-1 text-[12px] text-ink-200 transition-colors hover:bg-ink-600 hover:text-accent"
                  >
                    {copied === 'link' ? t('netplay.shareCopied') : t('netplay.share')}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[12px]">
                <span
                  className={`h-[7px] w-[7px] shrink-0 ${
                    state.status === 'connected' ? 'bg-ok' : 'bg-accent'
                  }`}
                />
                <span className="text-ink-200">
                  {state.status === 'connected'
                    ? t('netplay.connected')
                    : // `waiting` 对两种角色是两件事：房主是「房间开好了、等对方来」，
                      // 加入者是「我正在连过去」。所以文案分开 —— 给加入者看
                      // 「等待对方加入」会让他以为自己成了房主（见 i18n 那两句的注释）。
                      state.role === 'guest'
                      ? t('netplay.joining')
                      : t('netplay.waiting')}
                </span>
                {state.status === 'connected' && state.rtt !== null && (
                  <span className="ml-auto font-pixel text-[12px] text-ink-400">
                    {Math.round(state.rtt)}ms
                  </span>
                )}
              </div>

              {/*
                只有加入者看得到这一段：房主出画面之前他的屏幕一直是雪花，
                所以「连上了，在等房主插卡」这件事必须在面板上说清楚。
              */}
              {state.role === 'guest' && state.status === 'connected' && (
                <div className="flex items-center gap-2 text-[12px]">
                  {state.remotePlaying && state.remoteGame ? (
                    <>
                      <span className="text-[12px] text-ink-500">{t('netplay.hostPlaying')}</span>
                      <span className="min-w-0 flex-1 truncate text-ink-200">
                        {state.remoteGame.name}
                      </span>
                      {/*
                        房主暂停了就在这行尾巴上挂一枚小标。
                        屏幕里已经有一层 PAUSED 了，但**面板浮起来时屏幕是被盖住的** ——
                        用户打开面板想看「连上没有 / 在玩什么」的时候，也该看到这件事。
                      */}
                      {state.remotePaused && (
                        <span className="shrink-0 border border-ink-500 px-1.5 py-[1px] text-[12px] text-accent">
                          {t('netplay.paused')}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-ink-500">{t('netplay.waitingGame')}</span>
                  )}
                </div>
              )}

              <p className="text-[12px] leading-relaxed text-ink-500">
                {state.role === 'host' ? t('netplay.youAreHost') : t('netplay.youAreGuest')}
              </p>

              <button
                type="button"
                disabled={busy}
                onClick={onLeave}
                className="pixel-edge pxw-2 pxc-500 block w-full bg-ink-700 py-2 text-[12px] text-ink-100 transition-colors enabled:hover:bg-danger enabled:hover:text-ink-950 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {t('netplay.leave')}
              </button>
            </>
          )}

          {errorText && <p className="text-[12px] text-danger">{errorText}</p>}
        </div>
      </div>
    </div>
  );
}
