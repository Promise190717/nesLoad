'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cardDelayMs } from '@/lib/card-stagger';
import type { ConsoleType } from '@/lib/emulator';
import { formatTime, type Locale, type MessageKey } from '@/lib/i18n';
import { localizeGame, type LocalizedGameText } from '@/lib/server/games';
import type { Cartridge } from '@/lib/library';
import { CONSOLE_LABEL } from './CartridgeSprite';
import { useI18n } from './I18nProvider';

/**
 * `/api/games` 返回的条目（字段与 lib/server/games.ts 的 Game 对齐）。
 * 这里刻意只留展示 + 载入需要的字段：真实 ROM 地址不在响应里。
 *
 * ⚠️ 中英两份文案**都在**（`title` + `titleEn` 那种）—— 房间里的语言是运行时切的，
 *    不是每次请求都重取数据，所以两份都得拿到手上，由 `localizeGame` 现挑一份。
 */
export interface LibraryGame {
  id: string;
  title: string;
  /** 英文名（可空）。空 = 英文站回退 `title`。2026-10-13 加。 */
  titleEn: string | null;
  imageUrl: string;
  romName: string;
  consoleType: ConsoleType;
  language: string | null;
  series: string | null;
  seriesEn: string | null;
  year: number | null;
  developer: string | null;
  developerEn: string | null;
  /** 说明 / 简介（可空，后台那个「说明」字段）。卡片太小放不下正文，只当悬停提示用。 */
  description: string | null;
  descriptionEn: string | null;
  createdAt: number;
}

type LoadState = 'loading' | 'ready' | 'error';

/**
 * `/api/user/favorites` 返回的条目（字段与 lib/server/user-data.ts 的 `UserFavoriteItem` 对齐）。
 *
 * 和 `LibraryGame` 是两份形状：收藏那份多一个 `favoritedAt`（收藏时间，列表按它倒序），
 * 但结构上就是「游戏的字段 + 一个时间戳」。所以要转一次 —— 见下面的 `favoriteToGame`。
 */
interface UserFavoriteItem {
  id: string;
  title: string;
  titleEn: string | null;
  imageUrl: string;
  romName: string;
  consoleType: ConsoleType;
  language: string | null;
  series: string | null;
  seriesEn: string | null;
  year: number | null;
  developer: string | null;
  developerEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  favoritedAt: number;
}

/**
 * 收藏条目 → 卡片要的 `LibraryGame`。
 *
 * 转的理由：收藏 tab 里那些卡片点下去走的是**和在线库完全同一条路**（`onPick(game)`，
 * 父级 `loadRemoteGame`）—— 那边收的就是 `LibraryGame`。为了少转这一次而给 `onPick`
 * 加一个联合类型，会让 ConsoleScene 那边多一层分支，划不来。
 *
 * `createdAt` 补 0：它只在详情页那些地方被用到，卡片上不显示。
 * 而**收藏时间单独留着**（下面列表里那行小字用它），所以不能直接丢掉。
 */
function favoriteToGame(item: UserFavoriteItem): LibraryGame & { favoritedAt: number } {
  return {
    id: item.id,
    title: item.title,
    titleEn: item.titleEn,
    imageUrl: item.imageUrl,
    romName: item.romName,
    consoleType: item.consoleType,
    language: item.language,
    series: item.series,
    seriesEn: item.seriesEn,
    year: item.year,
    developer: item.developer,
    developerEn: item.developerEn,
    description: item.description,
    descriptionEn: item.descriptionEn,
    createdAt: 0,
    favoritedAt: item.favoritedAt,
  };
}

/**
 * 按语言取一条游戏在本面板里要显示的那几样文字。
 *
 * 为什么不直接用 `lib/server/games.ts` 的 `localizeGame`：那个收的是服务端那份 `Game`
 * （字段一模一样，但 `Game` 是「服务端结构」的语义）。这里拿到的是接口 JSON 的形状
 * （`LibraryGame`），两者字段虽然对齐，跨层直接喂进去容易在将来某一侧加字段时悄悄错开。
 * 所以这里做一次显式的字段搬运 —— 出错时是类型错误，而不是渲染出一个空标题。
 */
export function localizeLibraryGame(game: LibraryGame, locale: Locale): LocalizedGameText {
  if (locale !== 'zh') {
    return {
      title: game.titleEn || game.title,
      series: game.seriesEn || game.series,
      developer: game.developerEn || game.developer,
      description: game.descriptionEn || game.description,
    };
  }
  return {
    title: game.title,
    series: game.series,
    developer: game.developer,
    description: game.description,
  };
}

/**
 * 封面右侧那个**语言角标**（排在机种角标下面）。
 *
 * 库里 `language` 存的是短码（`zh` / `en` / `ja`，见后台 AdminGames 的 `LANGUAGE_OPTIONS`），
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
 * 三个 tab：在线库（R2 + D1 上传的那批）、本机历史（**从游戏库点开过的那批**）、
 * 收藏（云端，需要登录）。
 * 默认落在「游戏库」——弹窗的主要用途还是去挑一盘没玩过的。
 *
 * ⚠️ 「收藏」那个 tab **没登录时也会显示**，点进去是一句「登录后才能收藏」——
 * 而不是把整个 tab 藏掉。理由：藏掉的话，没登录的用户根本不知道有收藏这回事，
 * 而收藏恰恰是「值得注册」的第一理由。少一个 tab 换不来任何好处。
 */
type Tab = 'library' | 'history' | 'favorites';

const TABS: { value: Tab; label: MessageKey }[] = [
  { value: 'library', label: 'games.tabLibrary' },
  { value: 'history', label: 'games.tabHistory' },
  { value: 'favorites', label: 'games.tabFavorites' },
];

/**
 * 在线库列表的机种筛选。`'all'` 单独列一档而不是用 null —— 渲染时不用再绕一层判断。
 * 标签：`'all'` 走 i18n，其余三个用 `CONSOLE_LABEL`（NES / SFC / ARC，丝印，不进文案表）。
 */
type ConsoleFilter = ConsoleType | 'all';

const CONSOLE_FILTERS: readonly ConsoleFilter[] = ['all', 'nes', 'snes', 'gba', 'arcade'];

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

/**
 * 面板关掉时要留住的**那一页数据**。
 *
 * `key` 是它属于哪一次查询（`queryKeyOf` 的格式：`页码|关键词|机种`）——
 * 复原的时候必须和当前条件**完全对上**才敢用，对不上宁可重新拉。
 */
interface LibrarySnapshot {
  key: string;
  games: LibraryGame[];
  total: number;
}

/**
 * 面板关掉之后要接着用的那一份「面板状态」。
 *
 * 为什么放在**模块级**而不是父级的 state：面板挂载条件是 `libraryOpen && <GameLibraryPanel/>`，
 * 关一次就真的卸载了，组件内的 state 全没了 —— 而 2026-10-12 用户要的是
 * 「关闭时什么样、进来还是什么样」：翻到第几页、筛了哪个机种、搜了什么、
 * **列表里那 15 张**、滚到哪儿，全都不许变，也不想每次重开都白打一次列表接口。
 *
 * 参照物是同一个弹窗里的「历史」那条线：历史落在 IndexedDB 里，重开还在；
 * 在线库这边理应享受同等待遇。机制上像是在手搓一个 Vue `<keep-alive>` ——
 * ⚠️ 但**不是**把组件留在树上：面板是真的卸载（DOM、effect、监听器全清掉），
 * 留下来的只是这一个普通对象，跟着**这页文档**一起活（F5 就没了）。
 *
 * ⚠️ 代价必须知道：数据也一起缓存了 ⇒ 期间后台改了库（新传 / 删了游戏），
 * 面板里还是旧的那一批，要**换页 / 改筛选 / 提交搜索**才会重拉。
 * 觉得这个代价划不来就把它去掉 —— 见下面那个 effect 里「settledKey === key 就跳过」那段。
 */
interface LibraryMemory {
  tab: Tab;
  consoleFilter: ConsoleFilter;
  /** 已提交（真正生效）的搜索词 */
  keyword: string;
  /** 搜索框里**还没提交**的草稿也得留着：不然重开时搜索框是空的、列表却还是筛过的结果 */
  searchDraft: string;
  page: number;
  /** 列表的滚动位置，见组件里那对「记录 / 恢复」的 effect */
  scrollTop: number;
  /** 上次真正拉回来的那一页（失败过、或还没拉过就是 null） */
  snapshot: LibrarySnapshot | null;
}

/** 模块级单例。这里的初始值就是「从没打开过」时该有的样子。 */
const libraryMemory: LibraryMemory = {
  tab: 'library',
  consoleFilter: 'all',
  keyword: '',
  searchDraft: '',
  page: 1,
  scrollTop: 0,
  snapshot: null,
};

/**
 * 重开时能直接顶上来的那批数据；条件对不上（或压根没拉过）就给 null。
 *
 * 为什么还要比一次 key：正常路径下记忆里的页码和 snapshot 一定是配套的，
 * 但服务端**夹回页码**那条路径会让 `page` 和「数据实际是哪一页」短暂错位
 * （见拉数据那个 effect 的 `.then`）。宁可比一下、少一次请求也不给，也别摆错一页。
 */
function restoreSnapshot(): LibrarySnapshot | null {
  const snapshot = libraryMemory.snapshot;
  if (!snapshot) return null;
  const key = queryKeyOf(libraryMemory.page, libraryMemory.keyword, libraryMemory.consoleFilter);
  return snapshot.key === key ? snapshot : null;
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
  /**
   * 收藏（云端，需要登录）。
   *
   * `favoriteIds` 是**完整集合**（不是当前页那几条）—— 星标要在任何一页、任何时候
   * 都画得对，而列表是服务端分页的，每页只知道 15 条。
   *
   * 未登录时父级传 `null`：那时星标一律不亮、点它也不发请求（面板会提示去登录）。
   * 用 `null` 而不是空数组，是为了把「没登录」和「登录了但一个都没收藏」分开 ——
   * 后者是一位真实用户的正常状态，不该被当成未登录。
   */
  favoriteIds: string[] | null;
  /** 加 / 取消收藏。父级负责打接口、更新 `favoriteIds`。 */
  onToggleFavorite: (game: LibraryGame) => void;
  /**
   * 点「收藏」tab 里那句提示上的「登录」两个字。
   *
   * 父级拿到就把账号面板打开（顺带**把本面板关掉** —— 两个模态叠在一起，
   * 上面那个一关，下面这个还留着的观感很怪）。
   */
  onSignIn: () => void;
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
  favoriteIds,
  onToggleFavorite,
  onSignIn,
  onClose,
}: GameLibraryPanelProps) {
  const { t, locale } = useI18n();
  /*
   * 在线库的加载速度提示。**只有中文版有内容**，英文那份是空串 ——
   * 下面按「空串就不渲染」处理。见 i18n 里 games.remoteSlow 的说明。
   */
  const slowHint = t('games.remoteSlow');
  /*
   * 重开时能直接顶上的那批数据（条件对不上就是 null）。**只在挂载那一次被读到** ——
   * 下面几个 state 的初始值都用它。
   */
  const restored = restoreSnapshot();
  /*
   * `tab` / 筛选 / 页码 / 搜索框这几项的初始值全部取自 `libraryMemory`（惰性初始化，
   * 只在挂载那一次读）—— 「关闭时什么样、进来还是什么样」就落在这里，加上下面那批数据。
   *
   * 不能用「挂载后 useEffect 里补一次 setState」那种写法：那是 `set-state-in-effect`
   * 拦的路子（见下面拉数据那个 effect 的注释），而且会先渲染一帧第一页再跳走。
   */
  const [tab, setTab] = useState<Tab>(() => libraryMemory.tab);

  /* ---------------- 在线库：服务端分页 + 服务端筛选 ---------------- */

  const [consoleFilter, setConsoleFilter] = useState<ConsoleFilter>(() => libraryMemory.consoleFilter);
  const [searchDraft, setSearchDraft] = useState(() => libraryMemory.searchDraft);
  /*
   * 真正生效的搜索词：点「搜索」或回车才从 draft 提交过来。
   * 和后台那份是同一个理由，但这里的代价更硬 —— 过滤已经挪到服务端，
   * 边打字边过滤就是每敲一个字打一次接口 = 两次 D1 查询。
   */
  const [keyword, setKeyword] = useState(() => libraryMemory.keyword);

  /** 当前页码。翻页 = 重新打接口，见下面那个 effect。 */
  const [page, setPage] = useState(() => libraryMemory.page);

  /** 本页数据。**只有这一页** —— 全量那份已经不存在了。 */
  const [games, setGames] = useState<LibraryGame[]>(() => restored?.games ?? []);
  /** 命中当前筛选条件的总条数（不是本页条数），用来算总页数。 */
  const [total, setTotal] = useState(() => restored?.total ?? 0);
  /* 有复原数据就是「已经就绪」—— 因此重开那一帧画的就是完整的列表，不是「载入中…」 */
  const [state, setState] = useState<LoadState>(restored ? 'ready' : 'loading');

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
  /*
   * 「哪一次查询的数据已经在手上了」。重开时若复原上了上次那批，它一开始就等于当时那个 key
   * ⇒ `listLoading` 直接是 false（列表不压透明度），下面那个 effect 也因此**不发请求**。
   */
  const [settledKey, setSettledKey] = useState<string | null>(() => restored?.key ?? null);
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

  /* ---------------- 收藏（云端） ---------------- */

  /**
   * 收藏集合的 O(1) 判据。
   *
   * 父级给的是数组（接口返回的形状），但卡片要一个个查，每张卡都 `includes()` 一遍
   * 就是 O(页大小 × 收藏数)。这里转成 Set 一次。
   *
   * `favoriteIds === null`（未登录）时给一个空 Set —— 星标一律不亮。
   */
  const favoriteSet = new Set(favoriteIds ?? []);
  const signedIn = favoriteIds !== null;

  /**
   * 「收藏」tab 的完整列表。**自己拉，不由父级持有**。
   *
   * 为什么和 `library`（历史，父级给）不一样：历史是父级本来就持有的 state
   * （每次载入完都要刷新它、屏幕上还有别处用它），而收藏列表只在切到那个 tab 时才要 ——
   * 让父级为一个可能永远不被打开的 tab 长期持有一份数据不划算。
   *
   * 惰性拉取：`favorites` 为 null 表示还没拉过，切到那个 tab 的 effect 去拉。
   */
  const [favorites, setFavorites] = useState<(LibraryGame & { favoritedAt: number })[] | null>(null);
  const [favoritesState, setFavoritesState] = useState<LoadState>('loading');
  const favoritesRequestId = useRef(0);

  /*
   * 切到「收藏」tab 时拉一次。
   *
   * **依赖里带 `favoriteIds`**：在别处收藏 / 取消之后再切回来，列表要是新的 ——
   * 否则会看到「星标变了但这张卡片还在这里」的错位。父级每次改收藏都会换一个新的
   * 数组引用，所以这个 effect 会跟着重跑。
   *
   * 未登录（`favoriteIds === null`）直接不发请求 —— 那个 tab 里画的是一句去登录，
   * 打了也是 401。
   */
  useEffect(() => {
    if (tab !== 'favorites' || !signedIn) return;

    const requestId = ++favoritesRequestId.current;
    fetch('/api/user/favorites')
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<{ items: UserFavoriteItem[] }>;
      })
      .then((data) => {
        if (favoritesRequestId.current !== requestId) return;
        setFavorites(data.items.map(favoriteToGame));
        setFavoritesState('ready');
      })
      .catch(() => {
        if (favoritesRequestId.current !== requestId) return;
        setFavoritesState('error');
      });
  }, [tab, signedIn, favoriteIds]);

  /*
   * 每次翻页 / 换机种 / 提交搜索都重新拉**当前这一页**（服务端分页，不再一次全捞）。
   * setState 一律放在 .then/.catch 回调里 —— 直接在 effect 体里同步 setState
   * 会被 react-hooks/set-state-in-effect 拦下。
   *
   * **依赖里刻意没有 `tab`**：切到「历史」时不该多发一次请求（那是父级给的本地数据），
   * 切回来也不该重拉 —— 依赖不变，effect 就不重跑，列表还是原来那份。
   *
   * ⚠️ `settledKey === queryKey` 就直接返回，这一条是给「重开」用的：
   * 复原判断（`restoreSnapshot`）过了的话，面板**挂载时数据就已经在手上了** ——
   * 用户 2026-10-12 要的是「关闭时什么样、进来还是什么样」，不想每次重开都白打一次
   * 列表接口（服务端分页那一发背后是 COUNT + SELECT 两次 D1）。
   *
   * 为什么拿 `settledKey` 比、而不是用一个 `useRef` 记住「第一次别拉」：
   * ① React 开发模式会把 effect 跑两遍（挂载 → 清理 → 再跑），ref 那套第二次就漏了，
   *    开着 `pnpm dev` 调的时候会白拉一次、还很难看出为什么；
   * ② 「手上这份数据属于哪次查询」本来就是 `settledKey` 的语义，比一次就够了 ——
   *    翻页 / 改筛选时 key 必然对不上，该请求照样请求。
   *
   * ⚠️ 代价（用户知情）：数据也缓存了 ⇒ 期间后台新传 / 删掉的游戏要**换页 / 改筛选 /
   * 提交搜索**（或刷新页面）才会反映出来。要改成「先摆旧的、后台静默再校对一次」，
   * 把这一行判断删掉即可（其余都不用动）。
   */
  useEffect(() => {
    if (settledKey === queryKeyOf(page, keyword, consoleFilter)) return;

    const requestId = ++listRequestId.current;
    const offset = (page - 1) * PAGE_SIZE;

    fetchGames(offset, keyword, consoleFilter)
      .then((data) => {
        if (listRequestId.current !== requestId) return;
        // 服务端会把越界的 offset 夹回最后一页（例如筛选后结果变少了），跟着它走
        const settledPage = Math.floor(data.offset / PAGE_SIZE) + 1;
        setGames(data.games);
        setTotal(data.total);
        setState('ready');
        setPage(settledPage);
        /* 这一页连同它的条件留在内存里，下次重开面板直接摆出来（见 LibraryMemory 的注释） */
        libraryMemory.snapshot = {
          key: queryKeyOf(settledPage, keyword, consoleFilter),
          games: data.games,
          total: data.total,
        };
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
    /*
     * `settledKey` 也在依赖里：它是「手上这份数据属于哪次查询」的判据，上面那行守卫靠它。
     * 多出来的那一次重跑会被守卫挡掉（刚落定的 key 一定等于当前 key），不会白请求。
     */
  }, [page, keyword, consoleFilter, settledKey]);

  /*
   * 把上面那五个值同步回模块级记忆。
   *
   * 写在 effect 里而不是塞进每个 setter：能改这几个状态的入口有六七处
   * （切 tab / 点机种 / 提交搜索 / 翻页 / 服务端夹回页码），逐个改迟早漏掉一条路径。
   *
   * 这里只写一个普通对象，**不 setState** ⇒ 不受 `set-state-in-effect` 约束。
   */
  useEffect(() => {
    libraryMemory.tab = tab;
    libraryMemory.consoleFilter = consoleFilter;
    libraryMemory.keyword = keyword;
    libraryMemory.searchDraft = searchDraft;
    libraryMemory.page = page;
  }, [tab, consoleFilter, keyword, searchDraft, page]);

  /*
   * 滚动位置：记录在**卸载时**读 DOM，恢复在布局阶段拨回去。
   *
   * 一页 15 张封面在 720px 高的弹窗里是真要滚的（三行卡片），所以「回到上次那一页」
   * 还得回到上次那个位置 —— 否则重开时停在列表顶上，翻过的页等于白翻。
   *
   * 记录为什么在卸载时读 DOM 而不是跟着上面那个 effect 走：`goToPage` 翻页时是把
   * scrollTop 直接拨回 0 的（那是 DOM 操作，不经过 state），从 DOM 读一次就自动跟上了，
   * 不必在每条改页码的路径上再同步一遍。
   */
  useEffect(() => {
    const el = listRef.current;
    return () => {
      if (el) libraryMemory.scrollTop = el.scrollTop;
    };
  }, []);

  /*
   * 恢复滚动。三条讲究：
   * ① 用 `useLayoutEffect`（不是 useEffect）—— 拨位置要在**浏览器绘制之前**做完，
   *    否则重开时会先看见列表顶部闪一帧、再跳到上次的位置；
   * ② 没有依赖数组，每次渲染后都试一次：重开时前几帧还是「载入中」，容器里没内容、
   *    `scrollTop` 拨不动，得等这一页真渲染出来 —— 与其去猜哪一帧，不如每帧试一下，
   *    拨成功就清掉 `pendingScroll`（一次性）；
   * ③ 判据用 `scrollHeight > clientHeight` 而不是「有没有拿到元素」：内容不够长时
   *    写 `scrollTop` 会被浏览器夹回 0，那就成了「已经恢复过了」的假信号。
   */
  const pendingScroll = useRef(libraryMemory.scrollTop);
  useLayoutEffect(() => {
    const el = listRef.current;
    const top = pendingScroll.current;
    if (!el || top <= 0) return;
    if (el.scrollHeight <= el.clientHeight) return;
    pendingScroll.current = 0;
    el.scrollTop = top;
  });

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
                className={`pixel-edge pxw-2 pxc-500 flex h-[24px] items-center px-3 text-[12px] transition-colors ${
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
            className="pixel-edge pxw-2 pxc-500 ml-auto flex h-[18px] w-[18px] items-center justify-center bg-ink-700 text-[12px] leading-none text-ink-100 hover:bg-danger hover:text-ink-950"
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
                  className={`pixel-edge pxw-2 pxc-500 flex h-[24px] items-center px-2 text-[12px] transition-colors ${
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
                className="pixel-edge pxw-2 pxc-500 h-[24px] min-w-0 flex-1 bg-ink-900 px-2 text-[12px] text-ink-100 placeholder:text-ink-600 focus:outline-none"
              />
              <button
                type="submit"
                className="pixel-edge pxw-2 pxc-500 flex h-[24px] shrink-0 items-center bg-ink-700 px-2.5 text-[12px] text-ink-200 transition-colors hover:text-accent"
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
              <p className="w-full text-[12px] leading-relaxed text-ink-400">{slowHint}</p>
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
                  {games.map((game, index) => {
                    const busy = loadingId === game.id;
                    /* 卡片上的标题 / 元数据按当前界面语言取一份 —— 房间里的语言是运行时切的 */
                    const text = localizeLibraryGame(game, locale);
                    const meta = [game.year, text.developer].filter(Boolean).join(' · ');
                    const tag = languageTag(game.language);
                    return (
                      /*
                       * 入场动效（`.card-in` + 错峰延迟）挂在 <li> 上。
                       *
                       * **不需要给 <ul> 做任何「换一批就重播」的机关**：翻页 / 改筛选 /
                       * 提交搜索之后里面装的是另一批 id，`key` 全变了 ⇒ React 会把 <li>
                       * 整个换掉，新元素上的 CSS 动画自然重播一遍；反过来，同一张卡片
                       * 还在原来位置上时不该再动 —— 这正好也是 `key` 的语义。
                       */
                      <li
                        key={game.id}
                        className="card-in"
                        style={{
                          animationDelay: `${cardDelayMs(index)}ms`,
                        }}
                      >
                        {/*
                          `relative` 这一层是**为了星标**：它得和卡片按钮平级
                          （`<button>` 里不能套 `<button>`），又要绝对定位在卡片左上角。
                          原本 `relative` 挂在内层那个封面 div 上，现在提一层上来 ——
                          封面里那几个角标（机种 / 语言 / 进度条）仍然相对封面定位，
                          位置一点没变。

                          悬停提示：有说明就把说明换行接在标题后面（原生 tooltip 的 `\n`
                          在 Chrome / Firefox 里就是换行）。为什么不做成卡片上的第二行 ——
                          卡片是一行五个的小格子，说明是整句中文，塞进去要么把卡片撑高、
                          要么只剩半截，而且只有填了说明的那几张会变高。
                        */}
                        <div className="relative">
                        <button
                          type="button"
                          disabled={loadingId !== null}
                          onClick={() => onPick(game)}
                          title={
                            text.description ? `${text.title}\n${text.description}` : text.title
                          }
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
                              <span className="bg-ink-950/85 px-1 py-0.5 font-pixel text-[12px] text-accent">
                                {CONSOLE_LABEL[game.consoleType]}
                              </span>
                              {tag && (
                                <span
                                  className={`bg-ink-950/85 px-1 py-0.5 text-accent ${
                                    tag.pixel ? 'font-pixel text-[12px]' : 'text-[12px]'
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
                            <span className="truncate text-[12px] text-ink-100">{text.title}</span>
                            {/* 元数据行**始终显示 meta**：不能用「正在载入…」把它换掉 ——
                                文字换来换去会让卡片高度/内容跳动，进度全部交给封面里那条进度条 */}
                            <span className="truncate text-[12px] text-ink-500">{meta}</span>
                          </div>
                        </button>

                        {/*
                          星标。**贴左上角**，压在卡片按钮上方（`z-10`）。

                          ⚠️ 它是**卡片按钮的兄弟**、不是子节点 —— `<button>` 里套 `<button>`
                          是非法 HTML：React 会警告，浏览器也会把内层那个踢出去、位置全乱。
                          所以上面多套了一层 `relative` 的壳。

                          点它必须 `stopPropagation`：不然会连带触发卡片那下
                          「载入这一款」—— 用户想收藏，结果游戏开始下了，
                          这是最坏的一种误操作。

                          未登录（`favoriteIds === null`）时**照样显示**（暗的）：
                          藏起来的话用户根本不知道有这个功能。点它由父级弹一句「去登录」。
                        */}
                        <button
                          type="button"
                          aria-label={t(
                            favoriteSet.has(game.id) ? 'games.unfavorite' : 'games.favorite',
                            { name: text.title }
                          )}
                          aria-pressed={favoriteSet.has(game.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(game);
                          }}
                          className={`absolute left-0 top-0 z-10 flex h-[20px] w-[20px] items-center justify-center leading-none transition-colors ${
                            favoriteSet.has(game.id)
                              ? 'bg-ink-950/85 text-accent'
                              : signedIn
                                ? 'bg-ink-950/70 text-ink-300 hover:bg-ink-950/85 hover:text-accent'
                                : 'bg-ink-950/50 text-ink-500'
                          }`}
                        >
                          {/*
                            ★ / ☆（U+2605 / U+2606）**不在 Press Start 2P 的字模里**，
                            所以这一颗星不走 `font-pixel` —— 让系统字体去画。
                            和「纸上那句祝福」是同一个取舍：单个非 ASCII 字形落回系统字体，
                            比换成 `*` 这样的 ASCII 替身看得懂。
                          */}
                          <span className="text-[12px]">
                            {favoriteSet.has(game.id) ? '★' : '☆'}
                          </span>
                        </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : tab === 'favorites' ? (
            /*
              收藏 tab。三种状态：没登录 / 加载中 / 有数据（或空）。
              没登录那条**必须说清楚怎么才能用** —— 只写「请登录」用户不知道去哪儿登。

              「登录」那两个字是**按钮**（点开账号面板），不是装饰文本 —— 用户读到这句
              的第一反应就是「那我点哪儿登」，把入口直接摆在这儿比让他自己去找右上角那颗钮强。
              句子拆成「前 / 链接 / 后」三段拼起来，是为了让这个可点的词落在任意语言里
              都对的位置上（中文是「点这里·登录·，或在右上角…」，英文是「…— ·Sign in· right here, …」）。
            */
            !signedIn ? (
              <p className="text-[12px] leading-relaxed text-ink-400">
                {t('games.favoritesSignInBefore')}
                <button
                  type="button"
                  onClick={onSignIn}
                  className="text-accent underline-offset-2 transition-colors hover:underline"
                >
                  {t('games.favoritesSignInLink')}
                </button>
                {t('games.favoritesSignInAfter')}
              </p>
            ) : favoritesState === 'loading' ? (
              <p className="text-[12px] text-ink-400">{t('games.loading')}</p>
            ) : favoritesState === 'error' ? (
              <p className="text-[12px] text-danger">{t('games.failed')}</p>
            ) : !favorites || favorites.length === 0 ? (
              <p className="text-[12px] text-ink-400">{t('games.favoritesEmpty')}</p>
            ) : (
              /*
                收藏用**和在线库一样的网格**（不是历史那种行）：收藏本质就是「我挑出来的
                那几款」，用户看它的方式和看游戏库一样 —— 认封面。历史是「刚玩过什么」，
                时间和名字更重要，所以那份用行。两处刻意不同。
              */
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {favorites.map((game, index) => {
                  const busy = loadingId === game.id;
                  /* 同在线库：按当前界面语言取一份标题 */
                  const text = localizeLibraryGame(game, locale);
                  const tag = languageTag(game.language);
                  return (
                    <li
                      key={game.id}
                      className="card-in"
                      style={{ animationDelay: `${cardDelayMs(index)}ms` }}
                    >
                      <div className="relative">
                        <button
                          type="button"
                          disabled={loadingId !== null}
                          onClick={() => onPick(game)}
                          title={
                            text.description ? `${text.title}\n${text.description}` : text.title
                          }
                          className={`pixel-edge pxw-2 pxc-700 block w-full bg-ink-850 text-left transition-colors enabled:hover:bg-ink-700 disabled:cursor-not-allowed ${
                            busy ? '' : 'disabled:opacity-50'
                          }`}
                        >
                          <div className="relative aspect-[3/4] w-full overflow-hidden bg-ink-900">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={game.imageUrl}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                            <div className="absolute right-0 top-0 flex flex-col items-end gap-[2px]">
                              <span className="bg-ink-950/85 px-1 py-0.5 font-pixel text-[12px] text-accent">
                                {CONSOLE_LABEL[game.consoleType]}
                              </span>
                              {tag && (
                                <span
                                  className={`bg-ink-950/85 px-1 py-0.5 text-accent ${
                                    tag.pixel ? 'font-pixel text-[12px]' : 'text-[12px]'
                                  }`}
                                >
                                  {tag.text}
                                </span>
                              )}
                            </div>
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
                            <span className="truncate text-[12px] text-ink-100">{text.title}</span>
                            {/*
                              收藏 tab 这一行的第二格放**收藏时间**而不是 `meta`：
                              这个列表是按收藏时间排的（服务端 ORDER BY created_at DESC），
                              用户在这里想看的也是「什么时候收的」。想认机种看右上角角标。
                            */}
                            <span className="truncate text-[12px] text-ink-500">
                              {formatTime(game.favoritedAt, locale)}
                            </span>
                          </div>
                        </button>
                        {/* 这里星标先是「取消收藏」的入口 —— 已经在收藏里，所以画实心 */}
                        <button
                          type="button"
                          aria-label={t('games.unfavorite', { name: text.title })}
                          aria-pressed
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(game);
                          }}
                          className="absolute left-0 top-0 z-10 flex h-[20px] w-[20px] items-center justify-center bg-ink-950/85 leading-none text-accent transition-colors hover:bg-ink-950 hover:text-danger"
                        >
                          <span className="text-[12px]">★</span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
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
                    <span className="shrink-0 font-pixel text-[12px] text-ink-500">
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
                    <span className="shrink-0 text-[12px] text-ink-500">
                      {formatTime(cartridge.lastPlayedAt, locale)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={t('library.removeLabel', { name: cartridge.name })}
                    onClick={() => onRemoveCartridge(cartridge.id)}
                    className="pixel-edge pxw-2 pxc-500 flex h-[16px] w-[18px] shrink-0 items-center justify-center bg-ink-800 text-[12px] leading-none text-ink-100 hover:bg-danger hover:text-ink-950"
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
              <span className="mr-auto flex items-center gap-2 text-[12px] text-ink-400">
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
              className="pixel-edge pxw-2 pxc-500 flex h-[24px] items-center bg-ink-700 px-3 text-[12px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('games.prev')}
            </button>
            {/* 纯数字，和后台那份一样不进文案表 */}
            <span className="text-[12px] text-ink-500">
              {safePage} / {pageCount}
            </span>
            <button
              type="button"
              disabled={listLoading || safePage >= pageCount}
              onClick={() => goToPage(safePage + 1)}
              className="pixel-edge pxw-2 pxc-500 flex h-[24px] items-center bg-ink-700 px-3 text-[12px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
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
            <span className="min-w-0 flex-1 truncate text-[12px] text-ink-200">
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
              <span className="w-[34px] shrink-0 text-right text-[12px] text-ink-500">
                {Math.round(progress * 100)}%
              </span>
            )}
            <button
              type="button"
              onClick={onCancelLoad}
              className="pixel-edge pxw-2 pxc-500 flex h-[24px] shrink-0 items-center bg-ink-700 px-3 text-[12px] text-ink-200 transition-colors hover:bg-danger hover:text-ink-950"
            >
              {t('games.cancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
