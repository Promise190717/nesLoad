'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ConsoleType } from '@/lib/emulator';
import { formatTime, type MessageKey } from '@/lib/i18n';
import type { Cartridge } from '@/lib/library';
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
 * 封面右上角那个**语言角标**。
 *
 * 库里 `language` 存的是短码（`zh` / `en`，见后台 AdminGames 的 `LANGUAGE_OPTIONS`），
 * 但 DB 那列没有约束，老数据可能是自由文本 —— 所以这里**不做映射**，直接把值转大写当标识：
 * `ZH` / `EN`。全大写 ASCII 正好能走 `font-pixel`，和左上的机种角标同一套字模。
 *
 * `pixel` 是给非 ASCII 老数据留的后路：`font-pixel`（Press Start 2P）没有 CJK 字形，
 * 直接上会糊成方框，那一条就退回系统字体 —— 只影响这一张卡片，不连累别的。
 */
function languageTag(value: string | null): { text: string; pixel: boolean } | null {
  const text = value?.trim().toUpperCase();
  if (!text) return null;
  return { text, pixel: /^[\x20-\x7e]+$/.test(text) };
}

/**
 * 两个 tab：在线库（R2 + D1 上传的那批）和本机历史（载入过的卡带）。
 * 默认落在「游戏库」——弹窗的主要用途还是去挑一盘没玩过的。
 */
type Tab = 'library' | 'history';

const TABS: { value: Tab; label: MessageKey }[] = [
  { value: 'library', label: 'games.tabLibrary' },
  { value: 'history', label: 'games.tabHistory' },
];

/**
 * 在线库列表的机种筛选。`'all'` 单独列一档而不是用 null —— 渲染时不用再绕一层判断。
 * 标签：`'all'` 走 i18n，其余三个用 `CONSOLE_LABEL`（NES / SFC / ARC，丝印，不进文案表）。
 */
type ConsoleFilter = ConsoleType | 'all';

const CONSOLE_FILTERS: readonly ConsoleFilter[] = ['all', 'nes', 'snes', 'arcade'];

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
  /** 本机载入过的卡带，「历史」tab 用 */
  cartridges: Cartridge[];
  /** 当前插着的那盘卡带的 id，历史里给它上高亮 */
  activeId: string | null;
  onPick: (game: LibraryGame) => void;
  /** 从「历史」里挑一盘本机卡带（走 IndexedDB，不用下载） */
  onPickCartridge: (id: string) => void;
  /** 从「历史」里移除一盘。原先这个 × 只在卡带架上，架子撤掉后挪到这儿 */
  onRemoveCartridge: (id: string) => void;
  onClose: () => void;
}

/**
 * 在线游戏库：全屏弹窗，列出后台上传到 R2/D1 的游戏，点一个直接载入。
 * 和存档 / 联机 / 按键三块面板同一套视觉 —— 浮在房间上、**不进屏幕**。
 *
 * 「历史」tab 列出本机载入过的卡带（`cartridges`），数据由父级从 IndexedDB 现取 ——
 * 面板自己不去读库：载入完那一盘要刷新历史，而父级本来就持有这份 state
 * （卡带历史那份就是它），两处各拉一次迟早会不同步。
 */
export default function GameLibraryPanel({
  loadingId,
  progress,
  cartridges,
  activeId,
  onPick,
  onPickCartridge,
  onRemoveCartridge,
  onClose,
}: GameLibraryPanelProps) {
  const { t, locale } = useI18n();
  /*
   * 在线库的加载速度提示。**只有中文版有内容**，英文那份是空串 ——
   * 下面按「空串就不渲染」处理。见 i18n 里 games.remoteSlow 的说明。
   */
  const slowHint = t('games.remoteSlow');
  const [tab, setTab] = useState<Tab>('library');
  // 有缓存时**首帧就是 ready** —— 惰性初始化直接吃缓存，连一次「载入中」都不闪。
  const [games, setGames] = useState<LibraryGame[]>(() => gamesCache ?? []);
  const [state, setState] = useState<LoadState>(() => (gamesCache ? 'ready' : 'loading'));

  /* ---------------- 在线库的筛选（纯本地，不再打接口） ---------------- */

  const [consoleFilter, setConsoleFilter] = useState<ConsoleFilter>('all');
  const [searchDraft, setSearchDraft] = useState('');
  /*
   * 真正生效的搜索词：点「搜索」或回车才从 draft 提交过来，不边打字边过滤 ——
   * 列表里全是封面图，每敲一个字就重排一遍网格太抖。和后台那份同一套写法。
   */
  const [keyword, setKeyword] = useState('');

  /** 机种 + 关键词过滤后的列表。数据源就是已经拉回来的 `games`。 */
  const matchedGames = useMemo(() => {
    const needle = keyword.toLowerCase();
    return games.filter((game) => {
      if (consoleFilter !== 'all' && game.consoleType !== consoleFilter) return false;
      if (!needle) return true;
      return [game.title, game.developer, game.series].some((field) =>
        field?.toLowerCase().includes(needle)
      );
    });
  }, [games, consoleFilter, keyword]);

  const applySearch = () => setKeyword(searchDraft.trim());

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
        {/*
          tab 直接占掉标题的位置：两个 tab 名（游戏库 / 历史）本身就是这块面板的标题，
          再单起一行写「游戏库」会和一个 tab 名重复。样式跟键位面板的 1P / 2P 同一套。
        */}
        <div className="flex items-center gap-2 border-b-2 border-ink-900 bg-ink-850 px-4 py-3">
          {/* 两个 tab 自己包一层：外面那层 gap 还要管到右边的关闭钮，这里只调 tab 之间的距离 */}
          <div className="flex items-center gap-3">
            {TABS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
                className={`pixel-edge pxw-2 pxc-500 flex h-[24px] items-center px-3 text-[11px] transition-colors ${
                  tab === value
                    ? 'bg-accent text-ink-950'
                    : 'bg-ink-700 text-ink-300 hover:bg-ink-600 hover:text-ink-100'
                }`}
              >
                {t(label)}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label={t('games.close')}
            onClick={onClose}
            className="pixel-edge pxw-2 pxc-500 ml-auto flex h-[18px] w-[18px] items-center justify-center bg-ink-700 text-[10px] leading-none text-ink-100 hover:bg-danger hover:text-ink-950"
          >
            ×
          </button>
        </div>

        {/*
          在线库的筛选条：机种 + 搜索。**只在「游戏库」tab 出现** ——
          两者筛的都是那份在线列表；「历史」是本机卡带、最多 10 盘，不值得再压一排控件。
          两处都**只过滤已经拉回来的 `games`**（数据本来就在本机），不会再打接口。
        */}
        {tab === 'library' && (
          <div className="flex flex-wrap items-center gap-2 border-b-2 border-ink-900 bg-ink-800 px-4 py-2">
            <div className="flex items-center gap-2">
              {CONSOLE_FILTERS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={consoleFilter === value}
                  onClick={() => setConsoleFilter(value)}
                  className={`pixel-edge pxw-2 pxc-500 flex h-[24px] items-center px-2 text-[10px] transition-colors ${
                    consoleFilter === value
                      ? 'bg-accent text-ink-950'
                      : 'bg-ink-700 text-ink-300 hover:bg-ink-600 hover:text-ink-100'
                  }`}
                >
                  {value === 'all' ? t('games.filterAll') : CONSOLE_LABEL[value]}
                </button>
              ))}
            </div>

            {/* 搜索框与按钮同属一个 form，回车等同点击「搜索」 */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                applySearch();
              }}
              className="ml-auto flex min-w-0 max-w-[230px] flex-1 items-center gap-2"
            >
              <input
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder={t('games.searchPlaceholder')}
                className="pixel-edge pxw-2 pxc-500 h-[24px] min-w-0 flex-1 bg-ink-900 px-2 text-[11px] text-ink-100 placeholder:text-ink-600 focus:outline-none"
              />
              <button
                type="submit"
                className="pixel-edge pxw-2 pxc-500 flex h-[24px] shrink-0 items-center bg-ink-700 px-2.5 text-[11px] text-ink-200 transition-colors hover:text-accent"
              >
                {t('games.search')}
              </button>
            </form>

            {/*
              加载速度提示，**只有中文下才有内容**（英文那份是空串，这里就不渲染）。
              `w-full` 把这条挤到筛选条的第二行 —— 外层是 flex-wrap，宽度撑满就自然换行，
              不用为它单起一块容器。
            */}
            {slowHint && (
              <p className="w-full text-[11px] leading-relaxed text-ink-400">{slowHint}</p>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'library' ? (
            <>
              {state === 'loading' && (
                <p className="text-[12px] text-ink-400">{t('games.loading')}</p>
              )}
              {state === 'error' && <p className="text-[12px] text-danger">{t('games.failed')}</p>}
              {state === 'ready' && games.length === 0 && (
                <p className="text-[12px] text-ink-400">{t('games.empty')}</p>
              )}
              {/* 库里有东西、只是被筛掉了 —— 和「库是空的」分开说，否则会以为库坏了 */}
              {state === 'ready' && games.length > 0 && matchedGames.length === 0 && (
                <p className="text-[12px] text-ink-400">{t('games.noMatch')}</p>
              )}

              {state === 'ready' && matchedGames.length > 0 && (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-3">
                  {matchedGames.map((game) => {
                    const busy = loadingId === game.id;
                    const meta = [game.year, game.developer].filter(Boolean).join(' · ');
                    const tag = languageTag(game.language);
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
                              语言角标贴在**右上角**，和左上的机种角标一左一右。
                              没有语言数据就整块不渲染 —— 不留一个空框。
                            */}
                            {tag && (
                              <span
                                className={`absolute right-0 top-0 bg-ink-950/85 px-1 py-0.5 text-accent ${
                                  tag.pixel ? 'font-pixel text-[8px]' : 'text-[9px]'
                                }`}
                              >
                                {tag.text}
                              </span>
                            )}
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
            </>
          ) : cartridges.length === 0 ? (
            <p className="text-[12px] text-ink-400">{t('games.historyEmpty')}</p>
          ) : (
            /*
              历史用**行**而不是卡片：本机卡带没有封面（封面是在线上传时才有的），
              硬凑成网格会是一排空框。行也正好和存档列表同一套读法 ——
              左边是谁、右边是时间，点哪条载入哪条。
            */
            <ul className="flex flex-col">
              {cartridges.map((cartridge) => (
                /* 分隔线挂在 <li> 上：挂在按钮上的话，每个按钮都是自己 li 的独子，
                   `last:` 会全部命中，整列的分隔线就都没了。 */
                <li
                  key={cartridge.id}
                  className="flex items-center gap-2 border-b-2 border-ink-900 pr-2 last:border-b-0"
                >
                  <button
                    type="button"
                    disabled={loadingId !== null}
                    aria-current={cartridge.id === activeId}
                    onClick={() => onPickCartridge(cartridge.id)}
                    title={t('games.historyLoad', { name: cartridge.name })}
                    className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2.5 text-left text-[12px] text-ink-200 transition-colors enabled:hover:bg-ink-700 enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    {/* 机种标签全是 ASCII（NES / SFC / ARC），走 font-pixel 不掉字形 */}
                    <span className="shrink-0 font-pixel text-[8px] text-ink-500">
                      {CONSOLE_LABEL[cartridge.console]}
                    </span>
                    {/* 文件名可能很长（含中文），系统字体 + truncate */}
                    <span
                      className={`min-w-0 flex-1 truncate ${
                        cartridge.id === activeId ? 'text-accent' : ''
                      }`}
                    >
                      {cartridge.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-500">
                      {formatTime(cartridge.lastPlayedAt, locale)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={t('library.removeLabel', { name: cartridge.name })}
                    onClick={() => onRemoveCartridge(cartridge.id)}
                    className="pixel-edge pxw-2 pxc-500 flex h-[16px] w-[18px] shrink-0 items-center justify-center bg-ink-800 text-[9px] leading-none text-ink-100 hover:bg-danger hover:text-ink-950"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
