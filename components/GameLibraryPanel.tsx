'use client';

import { useEffect, useState } from 'react';
import type { ConsoleType } from '@/lib/emulator';
import { CONSOLE_LABEL } from './CartridgeSprite';
import { useI18n } from './I18nProvider';

/**
 * `/api/games` 返回的条目（字段与 lib/server/games.ts 的 Game 对齐）。
 * 这里刻意只留展示 + 载入需要的字段：真实 ROM 地址不在响应里。
 */
export interface LibraryGame {
  id: string;
  title: string;
  imageUrl: string;
  romName: string;
  consoleType: ConsoleType;
  language: string | null;
  series: string | null;
  year: number | null;
  developer: string | null;
  createdAt: number;
}

type LoadState = 'loading' | 'ready' | 'error';

/**
 * 游戏库列表的**进程内缓存**。
 *
 * 面板由父级「打开时才挂载」，每次打开都是一次全新挂载 —— 把缓存放在模块级
 * 而不是组件 state 里，才能做到「只有第一次打开才真的打接口」：之后每次打开直接命中，
 * 连一次请求都不发。
 *
 * 页面刷新会连同缓存一起清掉，那时再拉一次。列表是后台上传的、更新频率极低，
 * 没必要为它做跨会话的持久化（localStorage / sessionStorage）。
 */
let gamesCache: LibraryGame[] | null = null;
/** 正在飞的请求。挂在模块级是为了去重：连点两次不会打两遍接口。 */
let gamesRequest: Promise<LibraryGame[]> | null = null;

function fetchGames(): Promise<LibraryGame[]> {
  if (gamesCache) return Promise.resolve(gamesCache);
  if (gamesRequest) return gamesRequest;

  gamesRequest = fetch('/api/games')
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then((data: { games?: LibraryGame[] }) => {
      gamesCache = data.games ?? [];
      return gamesCache;
    })
    .catch((error) => {
      // 失败不留缓存，下次打开还有机会重试
      gamesRequest = null;
      throw error;
    });

  return gamesRequest;
}

interface GameLibraryPanelProps {
  /** 正在载入的那盘游戏 id；非 null 时所有卡片都置灰，避免连点。 */
  loadingId: string | null;
  /** ROM 下载进度（0..1）；null = 拿不到总字节数，画不确定进度条 */
  progress: number | null;
  onPick: (game: LibraryGame) => void;
  onClose: () => void;
}

/**
 * 在线游戏库：全屏弹窗，列出后台上传到 R2/D1 的游戏，点一个直接载入。
 * 和存档 / 联机 / 按键三块面板同一套视觉 —— 浮在房间上、**不进屏幕**。
 */
export default function GameLibraryPanel({
  loadingId,
  progress,
  onPick,
  onClose,
}: GameLibraryPanelProps) {
  const { t } = useI18n();
  // 有缓存时**首帧就是 ready** —— 惰性初始化直接吃缓存，连一次「载入中」都不闪。
  const [games, setGames] = useState<LibraryGame[]>(() => gamesCache ?? []);
  const [state, setState] = useState<LoadState>(() => (gamesCache ? 'ready' : 'loading'));

  // 只有第一次打开（缓存为空）才真的打接口；之后每次打开都命中缓存、这里直接返回。
  // setState 一律放在 .then/.catch 回调里 —— 直接在 effect 体里同步 setState
  // 会被 react-hooks/set-state-in-effect 拦下。
  useEffect(() => {
    if (gamesCache) return;
    let cancelled = false;
    fetchGames()
      .then((items) => {
        if (cancelled) return;
        setGames(items);
        setState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Esc 关面板（面板自持，不必依赖外层）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6" onClick={onClose}>
      <div className="absolute inset-0 bg-ink-950/80" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('games.title')}
        className="relative flex h-[min(720px,86vh)] w-[min(1000px,92vw)] flex-col bg-ink-800 pixel-edge pxw-4 pxc-600"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b-2 border-ink-900 bg-ink-850 px-4 py-3">
          <span className="text-[12px] text-ink-200">{t('games.title')}</span>
          <button
            type="button"
            aria-label={t('games.close')}
            onClick={onClose}
            className="pixel-edge pxw-2 pxc-500 ml-auto flex h-[18px] w-[18px] items-center justify-center bg-ink-700 text-[10px] leading-none text-ink-100 hover:bg-danger hover:text-ink-950"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {state === 'loading' && <p className="text-[12px] text-ink-400">{t('games.loading')}</p>}
          {state === 'error' && <p className="text-[12px] text-danger">{t('games.failed')}</p>}
          {state === 'ready' && games.length === 0 && (
            <p className="text-[12px] text-ink-400">{t('games.empty')}</p>
          )}

          {state === 'ready' && games.length > 0 && (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-3">
              {games.map((game) => {
                const busy = loadingId === game.id;
                const meta = [game.year, game.developer].filter(Boolean).join(' · ');
                return (
                  <li key={game.id}>
                    <button
                      type="button"
                      disabled={loadingId !== null}
                      onClick={() => onPick(game)}
                      title={game.title}
                      className={`pixel-edge pxw-2 pxc-700 block w-full bg-ink-850 text-left transition-colors enabled:hover:bg-ink-700 disabled:cursor-not-allowed ${
                        // 正在下的那张不置灰：进度条要看得清。其余卡片才跟着变暗
                        busy ? '' : 'disabled:opacity-50'
                      }`}
                    >
                      <div className="relative aspect-[3/4] w-full overflow-hidden bg-ink-900">
                        {/* R2 公网域名，不走 next/image（那需要在 next.config 里登记 remotePatterns） */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={game.imageUrl}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute left-0 top-0 bg-ink-950/85 px-1 py-0.5 font-pixel text-[8px] text-accent">
                          {CONSOLE_LABEL[game.consoleType]}
                        </span>
                        {/*
                          下载进度**叠在封面里**（底部一条），不占独立的行 ——
                          放在文字下面会把卡片撑高，网格里其余卡片跟着重排、跳动。
                          progress 为 null（拿不到 Content-Length）时退回来回滑的不确定条。
                        */}
                        {busy && (
                          <div className="absolute inset-x-0 bottom-0 h-[6px] overflow-hidden bg-ink-950/80">
                            {progress === null ? (
                              <span className="load-slide absolute inset-y-0 left-0 w-1/3 bg-accent/70" />
                            ) : (
                              <span
                                className="absolute inset-y-0 left-0 bg-accent"
                                style={{ width: `${Math.round(progress * 100)}%` }}
                              />
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5 px-1.5 py-1.5">
                        <span className="truncate text-[11px] text-ink-100">{game.title}</span>
                        {/* 元数据行**始终显示 meta**：不能用「正在载入…」把它换掉 ——
                            文字换来换去会让卡片高度/内容跳动，进度全部交给封面里那条进度条 */}
                        <span className="truncate text-[10px] text-ink-500">{meta}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}