'use client';

import { useEffect, useRef, useState } from 'react';
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
 * 封面右侧那个**语言角标**（排在机种角标下面）。
 *
 * 库里 `language` 存的是短码（`zh` / `en`，见后台 AdminGames 的 `LANGUAGE_OPTIONS`），
 * 但 DB 那列没有约束，老数据可能是自由文本 —— 所以这里**不做映射**，直接把值转大写当标识：
 * `ZH` / `EN`。全大写 ASCII 正好能走 `font-pixel`，和机种角标同一套字模。
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
 * 两个 tab：在线库（R2 + D1 上传的那批）和本机历史（**从游戏库点开过的那批**）。
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
 * 在线库列表每页条数。
 *
 * 网格是**响应式**的：宽屏一行 5 个（`md:grid-cols-5`）、中等一行 4 个、窄屏一行 3 个
 * （见下面 `<ul>` 的类名）。所以 15 这个数只保证**宽屏**下正好是三整行。
 *
 * **和后台那份（AdminGames 的 `PAGE_SIZE = 10`）是两套数**，别一起改：
 * 后台是一行一条的表格，前台是一行几张封面。两边唯一的共同点是分页条的样子。
 *
 * 服务端 `/api/games` 的默认 limit 也是 15（那边的 `DEFAULT_LIMIT`），两处对齐 ——
 * 但**刻意不共享常量**：一个在客户端当切片尺寸，一个在服务端当兜底值。
 */
const PAGE_SIZE = 15;

/** `/api/games` 的分页响应。 */
interface GamePage {
  games: LibraryGame[];
  /** 命中当前筛选条件的**总条数**（不是本页条数），用来算总页数。 */
  total: number;
  /** 服务端夹回有效范围后的 offset —— 以它为准，别用请求时那个去算页码。 */
  offset: number;
  limit: number;
}

/**
 * 把「一次查询」压成一个字符串。用来判断当前这一页数据是不是已经落定了
 * （见组件里的 `listLoading`）—— 换了页码 / 关键词 / 机种就是另一次查询。
 *
 * 放在模块级而不是组件里，是为了让 effect 里也能直接调用它：
 * 模块级函数引用稳定，不会被 `react-hooks/exhaustive-deps` 要求塞进依赖数组。
 */
function queryKeyOf(page: number, keyword: string, consoleType: ConsoleFilter): string {
  return `${page}|${keyword}|${consoleType}`;
}

/**
 * 拉取**一页**在线库。
 *
 * 2026-10-12 起是**真正的服务端分页**：翻页 / 换机种 / 提交搜索都会重新打这个接口。
 * 原先那套「整库一次拉回、缓存在模块级、之后每次打开零请求」的写法已经删掉 ——
 * 需求就是「不要一次全部加载」。
 *
 * 代价是每次翻页 / 改筛选 = 2 次 D1 查询（COUNT + SELECT，见 lib/server/games.ts）。
 * 所以**搜索刻意保持提交式**（点「搜索」或回车才发），不边打字边请求。
 *
 * 抽成模块级函数（不碰组件 state），effect 直接调用即可。
 */
async function fetchGames(
  offset: number,
  keyword: string,
  consoleType: ConsoleFilter
): Promise<GamePage> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) });
  if (keyword) params.set('q', keyword);
  if (consoleType !== 'all') params.set('console', consoleType);

  const res = await fetch(`/api/games?${params}`);
  if (!res.ok) throw new Error(String(res.status));

  const data = (await res.json()) as Partial<GamePage>;
  return {
    games: data.games ?? [],
    total: data.total ?? 0,
    // 老响应（没走分页的那版）不给 offset / limit，退回请求值即可
    offset: data.offset ?? offset,
    limit: data.limit ?? PAGE_SIZE,
  };
}

interface GameLibraryPanelProps {
  /** 正在载入的那盘游戏 id；非 null 时所有卡片都置灰，避免连点。 */
  loadingId: string | null;
  /**
   * 正在下载的那盘游戏**标题**，底部那条状态栏用；null = 没有下载在跑，整条不渲染。
   * 由父级给而不是在这里 `games.find(...)`：分页之后它可能不在当前这一页上，
   * 那时候就找不着了，状态栏会变成一句没有主语的「正在载入…」。
   */
  downloadingTitle: string | null;
  /** ROM 下载进度（0..1）；null = 拿不到总字节数，画不确定进度条 */
  progress: number | null;
  /** 取消这一笔 ROM 下载（只覆盖整包下载那一段，见 ConsoleScene 的注释） */
  onCancelLoad: () => void;
  /** 从游戏库点开过的那批游戏，「历史」tab 用。**只存字符串**（名字 / 封面 / 下载地址） */
  cartridges: Cartridge[];
  /** 当前插着的那盘游戏的 id，历史里给它上高亮 */
  activeId: string | null;
  onPick: (game: LibraryGame) => void;
  /** 从「历史」里挑一盘。传整条记录而不是 id：记录里就带着下载地址，父级不必再查一遍 */
  onPickCartridge: (cartridge: Cartridge) => void;
  /** 从「历史」里移除一条 */
  onRemoveCartridge: (id: string) => void;
  onClose: () => void;
}

/**
 * 在线游戏库：全屏弹窗，列出后台上传到 R2/D1 的游戏，点一个直接载入。
 * 和存档 / 联机 / 按键三块面板同一套视觉 —— 浮在房间上、**不进屏幕**。
 *
 * 「历史」tab 列出**从游戏库点开过**的那批（`cartridges` —— 只存名字 / 封面地址 /
 * 下载地址几个字符串，见 lib/library.ts），数据由父级从 IndexedDB 现取 ——
 * 面板自己不去读库：载入完那一盘要刷新历史，而父级本来就持有这份 state，
 * 两处各拉一次迟早会不同步。
 * 点一行 = 照存下来的地址重新下一遍，所以下载期间那套置灰 / 进度也是同一套。
 */
export default function GameLibraryPanel({
  loadingId,
  downloadingTitle,
  progress,
  cartridges,
  activeId,
  onPick,
  onPickCartridge,
  onRemoveCartridge,
  onCancelLoad,
  onClose,
}: GameLibraryPanelProps) {
  const { t, locale } = useI18n();
  /*
   * 在线库的加载速度提示。**只有中文版有内容**，英文那份是空串 ——
   * 下面按「空串就不渲染」处理。见 i18n 里 games.remoteSlow 的说明。
   */
  const slowHint = t('games.remoteSlow');
  const [tab, setTab] = useState<Tab>('library');

  /* ---------------- 在线库：服务端分页 + 服务端筛选 ---------------- */

  const [consoleFilter, setConsoleFilter] = useState<ConsoleFilter>('all');
  const [searchDraft, setSearchDraft] = useState('');
  /*
   * 真正生效的搜索词：点「搜索」或回车才从 draft 提交过来。
   * 和后台那份是同一个理由，但这里的代价更硬 —— 过滤已经挪到服务端，
   * 边打字边过滤就是每敲一个字打一次接口 = 两次 D1 查询。
   */
  const [keyword, setKeyword] = useState('');

  /** 当前页码。翻页 = 重新打接口，见下面那个 effect。 */
  const [page, setPage] = useState(1);

  /** 本页数据。**只有这一页** —— 全量那份已经不存在了。 */
  const [games, setGames] = useState<LibraryGame[]>([]);
  /** 命中当前筛选条件的总条数（不是本页条数），用来算总页数。 */
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<LoadState>('loading');

  /*
   * 请求序号：翻页快了会撞上乱序响应，慢的旧响应不许覆盖新的。
   * 放在 ref 里而不是用闭包里的 cancelled 标记 —— 后者的清理跑在 effect 重新执行时，
   * 两轮请求的清理都等于「本轮被取消」，分不开谁是谁。（和后台那份同一套。）
   */
  const listRequestId = useRef(0);

  /** 列表滚动容器。翻页后要把它拨回顶部，否则第 2 页一进来就停在半截上。 */
  const listRef = useRef<HTMLDivElement>(null);

  /*
   * `listLoading` 是**派生**出来的，不是一个 state：
   *
   *   settledKey !== queryKey  →  这次查询还在飞
   *
   * 为什么不直接存一个 `loading` state：那样得在 effect 体里同步 `setLoading(true)`，
   * 会被 `react-hooks/set-state-in-effect` 拦下（下面 effect 前那段注释记过这条规则）。
   * 派生值天然没这个问题，也少一次重渲染。
   *
   * 只有「首次打开」和「翻页 / 改筛选」时才是 true —— 后者用来给网格压一点透明度，
   * 否则点了「下一页」列表纹丝不动，会以为按钮坏了。
   */
  const queryKey = queryKeyOf(page, keyword, consoleFilter);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const listLoading = settledKey !== queryKey;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  /*
   * 页码一律按 `safePage` 走（渲染、按钮禁用态都是）：服务端会把越界的 offset
   * 夹回最后一页、下面的 effect 再 `setPage` 跟上，但在那一帧之前 `page` 可能
   * 还停在旧页码上。夹一下，文字就不会闪出「3 / 2」。
   */
  const safePage = Math.min(page, pageCount);

  const applySearch = () => {
    setKeyword(searchDraft.trim());
    // 结果集换了，旧页码没有意义 —— 回到第一页
    setPage(1);
  };

  /** 翻页 + 把列表拨回顶部。 */
  const goToPage = (next: number) => {
    setPage(next);
    listRef.current?.scrollTo({ top: 0 });
  };

  /*
   * 每次翻页 / 换机种 / 提交搜索都重新拉**当前这一页**（服务端分页，不再一次全捞）。
   * setState 一律放在 .then/.catch 回调里 —— 直接在 effect 体里同步 setState
   * 会被 react-hooks/set-state-in-effect 拦下。
   *
   * **依赖里刻意没有 `tab`**：切到「历史」时不该多发一次请求（那是父级给的本地数据），
   * 切回来也不该重拉 —— 依赖不变，effect 就不重跑，列表还是原来那份。
   * 面板每次打开都是全新挂载，所以「每次打开刷新一次」依然成立。
   */
  useEffect(() => {
    const requestId = ++listRequestId.current;
    const offset = (page - 1) * PAGE_SIZE;

    fetchGames(offset, keyword, consoleFilter)
      .then((data) => {
        if (listRequestId.current !== requestId) return;
        setGames(data.games);
        setTotal(data.total);
        setState('ready');
        // 服务端会把越界的 offset 夹回最后一页（例如筛选后结果变少了），跟着它走
        setPage(Math.floor(data.offset / PAGE_SIZE) + 1);
      })
      .catch(() => {
        if (listRequestId.current !== requestId) return;
        setGames([]);
        setTotal(0);
        setState('error');
      })
      .finally(() => {
        if (listRequestId.current !== requestId) return;
        // 失败也算「落定」：否则会一直卡在 loading 上
        setSettledKey(queryKeyOf(page, keyword, consoleFilter));
      });
  }, [page, keyword, consoleFilter]);

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
          两者筛的都是在线列表；「历史」是从游戏库点开过的那批、最多 10 条，不值得再压一排控件。

          2026-10-12 起这两个筛选都**下发到服务端**（跟着分页查询一起走）：
          按页取数之后本地就没有全量数据了，再在本地 filter 只能筛当页那几条，
          翻页会换一批结果，等于没筛。
        */}
        {tab === 'library' && (
          <div className="flex flex-wrap items-center gap-2 border-b-2 border-ink-900 bg-ink-800 px-4 py-2">
            <div className="flex items-center gap-2">
              {CONSOLE_FILTERS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={consoleFilter === value}
                  onClick={() => {
                    setConsoleFilter(value);
                    // 换了机种就是换了一份结果集，回到第一页（同 applySearch）
                    setPage(1);
                  }}
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

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'library' ? (
            <>
              {state === 'loading' && (
                <p className="text-[12px] text-ink-400">{t('games.loading')}</p>
              )}
              {state === 'error' && <p className="text-[12px] text-danger">{t('games.failed')}</p>}
              {/* 库是空的 —— 没带任何筛选，就是真的一条都没有 */}
              {state === 'ready' && total === 0 && !keyword && consoleFilter === 'all' && (
                <p className="text-[12px] text-ink-400">{t('games.empty')}</p>
              )}
              {/* 库里有东西、只是被筛掉了 —— 和「库是空的」分开说，否则会以为库坏了 */}
              {state === 'ready' && total === 0 && (keyword || consoleFilter !== 'all') && (
                <p className="text-[12px] text-ink-400">{t('games.noMatch')}</p>
              )}

              {state === 'ready' && games.length > 0 && (
                /*
                 * 一行最多五个，屏幕变窄依次降到 4 个、最少 3 个
                 * （`md` = 768px、`sm` = 640px）。**不用 auto-fill**：那种写法列数
                 * 随宽度浮动，同一页在不同窗口下会挤成不同的行数，「一页 15 条」就没了准头。
                 *
                 * 翻页期间压一点透明度（`listLoading`）—— 新旧数据占的是同一批位置，
                 * 不给点反馈会以为「下一页」没反应。这是相对后台那份**多做的一点**：
                 * 后台是整页列表，刷新的感觉本来就明显。
                 */
                <ul
                  aria-busy={listLoading}
                  className={`grid grid-cols-3 gap-3 transition-opacity sm:grid-cols-4 md:grid-cols-5 ${
                    listLoading ? 'opacity-60' : ''
                  }`}
                >
                  {games.map((game) => {
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
                            {/*
                              两个角标都贴**右侧**，竖排右对齐：机种在上、语言在下。
                              语言没有数据时只留机种那一个 —— 不留空框。
                            */}
                            <div className="absolute right-0 top-0 flex flex-col items-end gap-[2px]">
                              <span className="bg-ink-950/85 px-1 py-0.5 font-pixel text-[8px] text-accent">
                                {CONSOLE_LABEL[game.consoleType]}
                              </span>
                              {tag && (
                                <span
                                  className={`bg-ink-950/85 px-1 py-0.5 text-accent ${
                                    tag.pixel ? 'font-pixel text-[8px]' : 'text-[9px]'
                                  }`}
                                >
                                  {tag.text}
                                </span>
                              )}
                            </div>
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
              历史用**行**而不是卡片：一行装得下的信息比卡片多（标题可能很长），
              而且正好和存档列表同一套读法 —— 左边是谁、右边是时间，点哪条载入哪条。
              左边那张缩略图是这次改造才有的：历史里存了封面地址（`imageUrl`），
              点进去之前能认一眼是哪盘。
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
                    onClick={() => onPickCartridge(cartridge)}
                    title={t('games.historyLoad', { name: cartridge.name })}
                    className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2.5 text-left text-[12px] text-ink-200 transition-colors enabled:hover:bg-ink-700 enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    {/*
                      封面缩略图。同样走 <img> 不走 next/image（R2 公网域名没在
                      next.config 里登记 remotePatterns）；没有封面地址时整块不渲染 ——
                      `src=""` 在部分浏览器里是个裂图图标，比空着难看。
                    */}
                    {cartridge.imageUrl && (
                      <span className="block h-[30px] w-[22px] shrink-0 overflow-hidden bg-ink-900">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={cartridge.imageUrl}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </span>
                    )}
                    {/* 机种标签全是 ASCII（NES / SFC / ARC），走 font-pixel 不掉字形 */}
                    <span className="shrink-0 font-pixel text-[8px] text-ink-500">
                      {CONSOLE_LABEL[cartridge.console]}
                    </span>
                    {/* 游戏标题可能很长（含中文），系统字体 + truncate */}
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
        {/*
          翻页条固定在滚动区**外面**（面板底边），不跟着列表一起滚 ——
          后台那份是整页滚动、翻页条自然跟在列表后面；这里列表是一个定高弹窗里的
          滚动区，跟在后面就意味着「想翻页得先滚到底」。只有一页时整条不渲染。

          请求飞行期间两个按钮都禁用：现在翻页是真的要等一次接口（两次 D1 查询），
          不禁用的话连点会把页码堆成队列，最后停在哪一页全看响应回来的顺序。
        */}
        {tab === 'library' && state === 'ready' && pageCount > 1 && (
          <div className="flex items-center justify-end gap-3 border-t-2 border-ink-900 bg-ink-850 px-4 py-2">
            {/*
              翻页中的标识。**必须有**：翻页现在是真的要等一次接口（两次 D1 查询），
              而列表里新旧数据占的是同一批位置，只靠网格变淡太含蓄，看着像没反应。
              样式用项目里既有的「来回滑的亮条」（load-slide，核心包 / ROM 下载都是它），
              这样「在动」这件事全站是同一套语言。
            */}
            {listLoading && (
              <span className="mr-auto flex items-center gap-2 text-[10px] text-ink-400">
                <span className="relative h-[6px] w-14 shrink-0 overflow-hidden bg-ink-900">
                  <span className="load-slide absolute inset-y-0 left-0 w-1/3 bg-accent/70" />
                </span>
                {t('games.loading')}
              </span>
            )}
            <button
              type="button"
              disabled={listLoading || safePage <= 1}
              onClick={() => goToPage(safePage - 1)}
              className="pixel-edge pxw-2 pxc-500 flex h-[24px] items-center bg-ink-700 px-3 text-[10px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('games.prev')}
            </button>
            {/* 纯数字，和后台那份一样不进文案表 */}
            <span className="text-[10px] text-ink-500">
              {safePage} / {pageCount}
            </span>
            <button
              type="button"
              disabled={listLoading || safePage >= pageCount}
              onClick={() => goToPage(safePage + 1)}
              className="pixel-edge pxw-2 pxc-500 flex h-[24px] items-center bg-ink-700 px-3 text-[10px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('games.next')}
            </button>
          </div>
        )}
        {/*
          正在从在线库拉 ROM 时，面板底部这条状态栏：进度 + 取消。
          条件用 `downloadingTitle`（= 父级的「整包下载中」）而**不是** `loadingId` ——
          后者在下载完之后还活着（要挡到 `loadFile` 跑完），拿它当条件会在
          「面板被重新打开、核心还在启动」的那几秒里显示一条停在 100% 的假进度。

          为什么值得单独占一条（卡片封面上本来就叠了一条 6px 的进度）：
          ① 得说清**是哪一张**在载入 —— 面板里十几张封面，只有一条细进度不够读；
          ② 「取消」需要一个落脚点 —— 卡片本身是个 <button>，里面塞不下第二个按钮
             （HTML 不允许按钮嵌套），而这条栏是面板级的，天然能放。

          取消的**边界**：只覆盖 ROM 整包下载这一段。下载完面板就关了、交给 `loadFile`
          启动模拟器，那之后的进度在电视机屏幕上，这里管不到 —— Nostalgist 没有公开的
          取消接口。
        */}
        {downloadingTitle !== null && (
          <div className="flex items-center gap-3 border-t-2 border-ink-900 bg-ink-850 px-4 py-2">
            <span className="min-w-0 flex-1 truncate text-[11px] text-ink-200">
              {t('games.loadingRom', { name: downloadingTitle })}
            </span>
            <span className="relative h-[6px] w-32 shrink-0 overflow-hidden bg-ink-900">
              {progress === null ? (
                <span className="load-slide absolute inset-y-0 left-0 w-1/3 bg-accent/70" />
              ) : (
                <span
                  className="absolute inset-y-0 left-0 bg-accent"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              )}
            </span>
            {/* 固定宽度：百分数从 9% 跳到 100% 时后面的按钮不许跟着挪 */}
            {progress !== null && (
              <span className="w-[34px] shrink-0 text-right text-[10px] text-ink-500">
                {Math.round(progress * 100)}%
              </span>
            )}
            <button
              type="button"
              onClick={onCancelLoad}
              className="pixel-edge pxw-2 pxc-500 flex h-[24px] shrink-0 items-center bg-ink-700 px-3 text-[10px] text-ink-200 transition-colors hover:bg-danger hover:text-ink-950"
            >
              {t('games.cancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
