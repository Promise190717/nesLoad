'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTopLoader } from 'nextjs-toploader';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import { getAudioTrack } from '@/lib/audio-tap';
import {
  biosTypeFor,
  ensureBios,
  getBiosInfo,
  looksLikeNeoGeoRomset,
  matchBiosFile,
  putBios,
  type BiosInfo,
  type BiosType,
} from '@/lib/bios';
import { chiptuneUrl } from '@/lib/chiptune';
import { saveTheme } from '@/lib/theme';
import { readMobileFlag } from '@/lib/device';
import {
  EmulatorController,
  IncompleteRomError,
  VOLUME_MAX,
  detectConsole,
  unsupportedArchive,
  type ConsoleType,
  type LoadedRom,
} from '@/lib/emulator';
import { unwrapRom } from '@/lib/unwrap';
import { LOCALE_OPTIONS, formatTime, type Locale, type MessageKey } from '@/lib/i18n';
import { FlagIcon } from './FlagIcon';
import {
  captureFpsFor,
  CODE_LENGTH,
  DEFAULT_STREAM_QUALITY,
  IDLE_NETPLAY_STATE,
  NetplayController,
  remotePlayer,
  ROOM_QUERY_PARAM,
  type NetplayMode,
  type NetplayRole,
  type NetplayState,
  type NetplayStatus,
  type StreamQuality,
} from '@/lib/netplay';
import {
  codeToButton,
  DEFAULT_BINDINGS,
  loadBindings,
  playerLegend,
  saveBindings,
  type ButtonName,
  type KeyBindings,
} from '@/lib/keybindings';
import { readGamepads } from '@/lib/gamepad';
import { IncompleteBodyError, fetchRomWithProgress, isAbortError } from '@/lib/http';
import {
  listCartridges,
  pruneCartridges,
  putCartridge,
  removeCartridge,
  type Cartridge,
  type RemoteRom,
} from '@/lib/library';
import { readSave, writeSave, type SaveInfo } from '@/lib/saves';
import { MAX_SAVE_BYTES } from '@/lib/save-limit';
import { isSeason, nextSeason } from '@/lib/season';
import type { Game } from '@/lib/server/sb-games';
import { DEFAULT_TV_SIZE, isTvSize, TV_SIZES, type TvSize } from '@/lib/tv-size';
import { consoleLabel } from '@/lib/consoles';
import { fetchCurrentUser } from '@/lib/current-user';
import FeedbackPanel from './FeedbackPanel';
import GameLibraryPanel, { localizeLibraryGame, type LibraryGame } from './GameLibraryPanel';
import HandheldConsole from './HandheldConsole';
import { useI18n } from './I18nProvider';
import JoinRoomPrompt from './JoinRoomPrompt';
import KeyBindingsPanel from './KeyBindingsPanel';
import NetplayPanel from './NetplayPanel';
import OnboardingTour, { TOUR_DONE_EVENT, TOUR_OPEN_EVENT } from './OnboardingTour';
import { renderPadGlyphs } from './PadGlyph';
import PaintingPanel from './PaintingPanel';
import RetroTv from './RetroTv';
import UserPanel from './UserPanel';
import {
  type CatBreed,
  type PixelPainting,
  DESK_HEIGHT,
  PAINTINGS,
  RoomPainting,
  RoomDesk,
  RoomFloorItems,
  RoomLamp,
  RoomWall,
  RoomWindow,
  TvCat,
  nextCatBreed,
} from './RoomBackdrop';
import {
  BroomIcon,
  ExpandIcon,
  GamepadIcon,
  GlobeIcon,
  HelpIcon,
  HomeIcon,
  MoonIcon,
  NoteIcon,
  PlayersIcon,
  ScrollIcon,
  ShieldIcon,
  StoreIcon,
  SunIcon,
  TvSizeIcon,
  UserIcon,
  WarningIcon,
} from './icons';


/**
 * 主题切换时挂 `theme-fading` 的时长，**必须 ≥ globals.css 里那几条 transition 的时长**。
 *
 * 挂多久就过渡多久：早了会在颜色还没走完时把过渡属性摘掉，后半程直接跳；
 * 晚了则白白让所有 hover 都慢半拍。见下面 applyTheme。
 */
const THEME_FADE_MS = 400;
/**
 * 吊灯开关。值只有 'on' / 'off'，首屏由 layout 的内联脚本读进 <html data-lamp>。
 * 它**跟着主题走**（白天关、夜晚开，见下面的 applyTheme），手动点灯只是临时覆盖。
 */
const LAMP_KEY = 'nesload:lamp';

/**
 * 简洁模式开关。值只有 'on' / 'off'（'on' 才是开），首屏由 layout 的内联脚本读进
 * <html data-simple>。真正藏东西的是 CSS，见 globals.css 里 `:root[data-simple='on']`。
 */
const SIMPLE_KEY = 'nesload:simple';

/**
 * 电视机尺寸档位（`small` / `medium` / `large`）。首屏由 layout 的内联脚本读进
 * `<html data-tv>`。真正定尺寸的是 CSS，见 globals.css 里那组 `--tv-*` 变量 ——
 * 尺寸**不进 React**（内联 style 会顶掉全屏规则，完整理由见 lib/tv-size.ts 顶部注释）。
 */
const TV_KEY = 'nesload:tv';

/**
 * 档位 → 选择器里那一格的文案（大 / 中 / 小，英文是 Large / Medium / Small）。
 * 显示顺序不在这里，在 `TV_SIZES`（lib/tv-size.ts）—— 那份是唯一出处。
 */
const TV_OPT_KEY: Record<TvSize, MessageKey> = {
  large: 'tvSize.opt.large',
  medium: 'tvSize.opt.medium',
  small: 'tvSize.opt.small',
};

/**
 * 操作指引「看过了没有」的标记。
 *
 * **只有两种状态**：写过（看过）和没写过（没看过）。判断一律用 `!== null`，
 * 所以以后想重置只要删掉这个键即可 —— 见下面那个 effect。
 */
const TOUR_KEY = 'nesload:tour-done';
/**
 * 联机出画档位。**要记住**（和主题 / 吊灯同类）—— 它是按机器性能选的，
 * 每开一局都要重选一遍太烦。值的类型是 `StreamQuality`，存在 `lib/netplay.ts`。
 */
const QUALITY_KEY = 'nesload:netplay-quality';

/**
 * 注意：抓流请求的帧率**不再是这里的常量**，由出画档位给出（`captureFpsFor`）。
 *
 * 为什么帧率必须在建流那一刻定死：`captureStream(fps)` 的帧率是建流参数，事后改不了
 * （`applyConstraints` 对画布来的轨并不可靠），所以「换档」等于「重建整条流」。
 * 档位为什么能换到帧数、以及「房主掉帧 = 整局变慢」的完整因果，
 * 写在 lib/netplay.ts 的 `StreamQuality` 那一段。
 */
/** 等音频轨的最长尝试次数（每次 500ms，共 5 秒）—— 见下面的「声音迟到」注释 */
const AUDIO_RETRY_LIMIT = 10;

/**
 * 房间顶上那枚提示挂多久。
 *
 * 4 秒：中文那一句是 16 个字、英文更长一点，够读完；再长就开始碍事了
 * （它飘在房间顶上，正对着吊灯）。比面板里「已复制」那枚（1.6s）
 * 长得多，因为那句只是确认一个动作，这句要读完一整个状态。
 *
 * 原本只服务联机（连上 / 对方离开），2026-10-12 起 `?id=` 深链也走同一个位置
 * （找不到那款游戏时弹一句），所以名字从 `NETPLAY_*` 收了回来。
 */
const TOAST_MS = 4000;

/**
 * 「显像管关机」那一下挂多久（弹出卡带之后）。
 *
 * **必须 ≥ globals.css 里那两段动画的总时长**：画面压扁 0.24s，白线延后 0.2s 再走 0.22s，
 * 合起来 0.42s。给早了会在白线还没收完时把 `crt-off-picture` 那个 class 摘掉 ——
 * canvas 会立刻从「一条线」弹回整屏，动画的尾巴直接被切掉。多出来的那 20ms 是余量。
 */
const CRT_OFF_MS = 440;

/**
 * 书堆后面探出来的那只猫停多久（点了地板上那根逗猫棒之后）。
 *
 * **必须 ≥ globals.css 里 `.cat-peek` 那段的时长（2.9s）**：动画自己会把猫滑出来
 * 再滑回去，这个定时器只负责把组件从 DOM 上摘掉。给早了，最后那截「缩回机身后面」
 * 会被切掉 —— 猫会当场消失在半路。多出来的 100ms 是余量。
 */
const POKE_CAT_MS = 3000;

type Theme = 'dark' | 'light';

/*
 * 语言下拉的选项 2026-10-13 挪去了 `lib/i18n.ts`（`LOCALE_OPTIONS`）——
 * 同日加的独立登录页顶栏（`components/LocaleSwitcher.tsx`）也要用同一份列表，
 * 留在这里就会变成「加第三种语言只改到一处」。那条注释也跟着搬过去了。
 */

/**
 * 抓一条「画面 + 声音」的流，给联机时的加入者看。
 *
 * 画面来自 canvas.captureStream；声音是从 WebAudio 上旁路出来的（见 lib/audio-tap.ts），
 * 核心还没建 AudioContext 时拿不到 —— 那就先推画面，声音由调用方重试补上。
 *
 * `contentHint = 'motion'`：告诉编码器这是一路**动的东西**（游戏画面），
 * 让它按「保住动作连贯」的口径去分配码率，而不是按「保住静态细节」——
 * 后者会把码率堆在单帧画质上，既费编码算力又对游戏没意义。
 */
function createCaptureStream(canvas: HTMLCanvasElement | null, fps: number): MediaStream | null {
  if (!canvas || typeof canvas.captureStream !== 'function') return null;
  const stream = canvas.captureStream(fps);
  const [video] = stream.getVideoTracks();
  if (video) video.contentHint = 'motion';
  const audio = getAudioTrack();
  if (audio) stream.addTrack(audio);
  return stream;
}

/**
 * 右侧开关栏里「组与组之间」的那道分隔线。
 *
 * 用户 2026-10-10 要求把这一列按功能分组、组间拉开：
 * 组内的间距是容器的 `gap-2`（8px），组间额外插一道 1px 短线，
 * 再叠上它自己的上下外边距（`my-1.5`），合起来约 29px —— 和组内的 8px 一眼分得开。
 * 纯装饰，`aria-hidden`（分组信息对读屏没有意义，逐个按钮本来就能读）。
 *
 * ⚠️ 2026-10-13 起它**在抽屉里换了岗位**：那两份入口合并成一份清单之后，两道线不再
 * 卡在原来的组间位置，而是「房间自己的操作」和「按键说明 / 留言本」、
 * 「法务两页」之间的两条隔断（靠小屏那段 CSS 里的 `order` 摆位，DOM 没动）。
 */
function RailDivider() {
  return <span aria-hidden className="rail-divider my-1.5 h-px w-7 bg-ink-600" />;
}

/**
 * 菜单钮里那个「三横 → 叉号」的图标（2026-10-13 加）。
 *
 * **为什么不放进 icons.tsx**：那里面全都是**一张静止的图形**（一串整数坐标的 `<rect>`，
 * 由 CSS 决定长什么样）；这一个得**逐条动起来** —— 收着时是三条横线，点开之后
 * 上下两条滑到中间转成斜杠、中间那条淡出，合起来是个叉。
 * 那是「一个控件」而不是「一张图」，所以留在这里，结构（三条 `<span>`）和动画（globals.css
 * 的 `.menu-glyph`）两边都归它自己。
 *
 * 三条用**绝对定位的 `<span>`**而不是 `<rect>`：`<rect>` 的 CSS transform 在部分浏览器上
 * 要额外配 `transform-box` / `transform-origin` 才对齐，而这里的动画恰恰全靠 transform 的
 * 旋转与位移，用普通盒子最不容易出岔子。
 *
 * 尺寸和图标对齐：16×16 的方格里三条 12×2 的横线（左右各让 2 格），
 * 行距 4 格 —— 和原来那个 `MenuIcon` 一模一样，所以按钮的 `p-1.5` 不用动，
 * 28px 的方形和右边那列开关严丝合缝。
 */
function MenuGlyph({ open }: { open: boolean }) {
  return (
    <span className={`menu-glyph${open ? ' is-open' : ''}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

/**
 * 这个播放失败是不是**浏览器的自动播放策略**拦下的（而不是音源本身有问题）。
 *
 * 两种失败要分开处理：策略拦下时换什么音源都播不出来，而音源缺失时必须换。
 * 同样按 `name` 认而不写 `instanceof DOMException`（理由见上面 isAbortError）。
 * 点那台 MP4 本来就是一次用户手势，正常走不到这里 —— 留着是别让策略问题
 * 被当成「文件不在」，白合成一段兜底音。
 */
function isAutoplayBlocked(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'NotAllowedError'
  );
}

/**
 * 把在线库的一条游戏转成「载入一盘远程 ROM」需要的那份字符串描述。
 * 转换放在这儿而不是 `lib/library.ts` 里：那份描述（`RemoteRom`）是库层的类型，
 * 而 `LibraryGame` 是 `/api/games` 的响应形状 —— 让 lib 反向依赖组件的类型不合适。
 * 两边的字段名本来就不一样（`title` / `consoleType`），正好在这儿对齐一次。
 *
 * `romUrl` 在这儿拼出来（而不是让 `putCartridge` 自己拼）：历史记录里存的是**完整地址**，
 * 点历史那一行直接照着它重新下一遍，不依赖 `id` 的拼法。
 */
function romFromGame(game: LibraryGame, locale: Locale): RemoteRom {
  return {
    id: game.id,
    /*
     * 名字按当前界面语言取一份 —— 它是**存进历史记录**的（`Cartridge.name`），
     * 也就是「点开过的那批」在历史里显示的名字。房间里的语言是运行时切的，
     * 所以这里必须现取，不能指望接口那一份。
     */
    name: localizeLibraryGame(game, locale).title,
    romUrl: `/api/games/${game.id}/rom`,
    imageUrl: game.imageUrl,
    romName: game.romName,
    console: game.consoleType,
  };
}

/**
 * 一份**云端**存档的元信息（二进制本体在 R2，这里只有描述）。
 *
 * 字段和本机那份（`lib/saves.ts` 的 `SaveInfo`）刻意错开：那份只有 `data` / `createdAt`，
 * 这份多了 `title` 和 `size` —— 接口本来就这么回，而且 `id` 是 `user_saves.id`（UUID），
 * 读 / 删都拿它当路径参数。
 *
 * ⚠️ 存档换成电池存档之后一款只有一份，所以调用方只取 `items[0]`（见 `listCloudSaves`）。
 */
type CloudSaveSlot = {
  id: string;
  gameId: string;
  romName: string;
  title: string;
  size: number;
  createdAt: number;
};

/**
 * 拉这一款在云端的存档（没登录会 401，返回 null）。
 *
 * 模块级函数而不是组件内：它和 `romFromGame` 一样是纯取数，跟组件的 state 无关。
 * **永不抛错** —— 调用方在 `saveGame` / `openLoad` 里都只想拿到一份能用的东西，
 * 云端拉不到不该让「本机那份也读不出来」。失败一律退化成 null。
 *
 * ⚠️ 存档换成电池存档之后**一款只有一份**，所以这里取 `items[0]` —— 接口仍然回数组
 * （服务端不必为这个语义改动），但界面只认第一份。
 */
async function listCloudSaves(romName: string): Promise<CloudSaveSlot | null> {
  try {
    const res = await fetch(`/api/user/saves?romName=${encodeURIComponent(romName)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: CloudSaveSlot[] };
    return data.items?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * 从地址栏里抠出分享链接带进来的房间码（`?room=XXXX`），没有就返回 null。
 * **不用 next/navigation 的 `useSearchParams`**：它要求调用方外面套一层 `<Suspense>`，
 * 而这是根页面 —— 为读一个参数把整棵树包起来不划算。这个邀请也只在客户端有意义
 * （SSR 那会儿压根没有地址栏），直接读 `location` 更省事。
 *
 * 校验只做「4 位字母数字」这一层：格式不对就当没有，别弹一个注定连不上的确认框。
 * 大小写、以及 O/0、I/L/1 这些看错的字符都交给 `netplay.join` 归一化 —— 那边是唯一权威。
 */
function readInviteCode(): string | null {
  const raw = new URLSearchParams(window.location.search).get(ROOM_QUERY_PARAM)?.trim() ?? '';
  if (raw.length !== CODE_LENGTH || !/^[A-Za-z0-9]+$/.test(raw)) return null;
  return raw.toUpperCase();
}

/**
 * 把 `?room` 从地址栏抹掉（走 `replaceState`，不留历史记录）。
 *
 * 读到就抹：留着的话用户按 F5 会再弹一次确认框，从地址栏复制出去的链接也会带着
 * 一个已经处理过的房间码。抹掉不影响分享链接本身 —— 那条还在对方手里，
 * 他再点一次照样能进。
 */
function clearInviteCode() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(ROOM_QUERY_PARAM)) return;
  url.searchParams.delete(ROOM_QUERY_PARAM);
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

/**
 * 游戏详情页那颗「开始游戏」带过来的参数名（`/room?id=<游戏 id>`）。
 *
 * 放在地址栏而不是页面状态里，是为了让这条路能**被直接分享 / 收藏**：
 * 「在房间里打开这一款」本身就是一个值得分享的地址。
 */
const GAME_QUERY_PARAM = 'id';

/**
 * 从地址栏里抠出 `?id=`（游戏详情页「开始游戏」带过来的），没有就返回 null。
 *
 * 和 `readInviteCode` 同一套路（直接读 `location`，不用 `useSearchParams`：
 * 那是根页面，为读一个参数把整棵树包进 `<Suspense>` 不划算）。
 *
 * 校验只做「像个 id」这一层：库里是 `randomUUID()`，所以只接受字母数字和连字符、
 * 长度卡在 64 以内。不合规就当没有 —— 别拿一个明显不是 id 的串去打一次接口。
 *
 * ⚠️ **`?id=` 读到后一直留在地址上，不抹**（2026-10-14 用户要求「游戏加载后不要
 * 清除 url 上的 id 了」）—— 这个地址本来就该能分享 / 收藏 / F5 重开同一款。
 * 原来那版「这一轮结束就抹」是 2026-10-12 的要求（怕刷新重下），现在立场反过来
 * 了：重下同一款正是深链该有的行为（服务端 meta 也靠这个 id 出标题）。刷新会
 * 重新走一遍取数 + 下载，那是深链语义的一部分，不是 bug。
 */
function readGameId(): string | null {
  const raw = new URLSearchParams(window.location.search).get(GAME_QUERY_PARAM)?.trim() ?? '';
  return /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : null;
}

/**
 * `/room` 页面（服务端）递进来的**深链那一款的现成数据**。
 *
 * 三种取值的含义（刻意用 `undefined` / `null` / 对象三态，见 `app/[locale]/room/page.tsx`）：
 * - **`undefined`（没传）**：服务端没拿到 —— 地址上没有 `?id=`，或者服务端查询抛了异常。
 *   前者本来就没有深链；后者走下面保留的 `GET /api/games/<id>` 那条老路兜底。
 * - **`null`**：有 id 但库里查无此游戏（后台删了 / 链接是编的）—— 直接弹「找不到」，
 *   不用再打一次接口去确认同一件事。
 * - **`Game`**：服务端 meta 那一趟已经查出来了（页面用 React `cache()` 复用同一笔查询，
 *   数据库**没有**因此多打），弹窗第一帧就有封面和名字，深链取数那段请求整个省掉。
 *
 * 类型用服务端的 `Game` 而不是 `LibraryGame`：前者多一个 `developerId`，是后者的
 * 超集，赋给 `deepLinkGame` 那个 state 天然兼容（多出来的字段运行时被 `romFromGame`
 * 挑字段时忽略，不写脏任何东西）。
 */
export default function ConsoleScene({
  serverGame,
}: {
  serverGame?: Game | null;
}) {
  /*
   * `href` 解构成 `localeHref`：这个名字在站内链接里出现几十次，
   * 叫 `href` 会和每个 `<Link href=…>` 的属性撞在一起，读起来分不清谁是谁。
   */
  const {
    t,
    locale,
    href: localeHref,
    hrefIn,
    rememberLocale,
  } = useI18n();

  /**
   * 语言下拉用得上它 —— 那是个自绘下拉，不是 `<Link>`，切语言只能程序化导航
   * （见 `.top-links` 里那颗下拉的注释）。全文件唯一一处 `useRouter`。
   */
  const router = useRouter();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const romInputRef = useRef<HTMLInputElement>(null);
  /**
   * 「正在载入」的同步标记。
   *
   * `loading` 是异步 state，挡不住「载入还没完又拖一盘进来」—— 那会再走一遍 loadRom
   * （内部先 exit 再 launch），白等一次还容易把两边的状态搅在一起。
   * 用 ref 而不是把 `loading` 放进 useCallback 依赖：那样载入回调会每次换一次身份。
   */
  const loadingRef = useRef(false);

  /**
   * 当前这盘 ROM 的文件本身 —— 「改完键位重载」直接拿它重新插一次。
   *
   * 2026-10-12 之前重载是回 IndexedDB 取 `readCartridge(activeId)` 的，那条路已经
   * 不存在了：历史现在只存字符串（见 lib/library.ts），本机拖进来的文件更是从来没
   * 有对应的记录。攥着文件本体是唯一还能覆盖**两种来源**的办法。
   *
   * 代价是这盘文件（大到几十 MB 的街机 romset）在整局游戏期间不会被回收。可接受：
   * 这块 Blob 在下完那一刻本来就已经在内存里了（`new File([blob], …)`），
   * 浏览器对大 Blob 也多半是落到磁盘上；换来的是重载不必再下一遍、也不必联网。
   */
  const lastRomRef = useRef<File | null>(null);

  // 用 state 的惰性初始化持有实例：只会创建一次，
  // 同时避免在渲染期间读写 ref（react-hooks/refs 规则禁止）
  const [controller] = useState(() => new EmulatorController());

  const [rom, setRom] = useState<LoadedRom | null>(null);
  const [paused, setPaused] = useState(false);

  /**
   * 当前这盘卡带在**在线游戏库**里的 id，null = 这盘是本地拖进来的（或者没插卡）。
   *
   * 云端那三样（历史 / 存档 / 收藏）**只认在线库的游戏** —— 本地文件没有库里的
   * `game_id`，也就无所谓「换台机器还在」。所以这个 id 是「要不要走云端」的总开关。
   *
   * 为什么不从 `activeId` 派生：那是**历史记录**那行的 id（`putCartridge` 生成，
   * 和 `game.id` 不是一回事）。两者值可能相同、但来源和生命周期都不同，
   * 混着用迟早出事。这里单独记一份，在 `loadRemote` 里明确写上。
   *
   * 本地载入（`loadFile`）和弹出（`eject`）都要清掉 —— 换了盘卡带，云端存档
   * 就不该再往上一款里塞了。
   */
  const [gameId, setGameId] = useState<string | null>(null);

  /**
   * `gameId` 的别名 —— 给读起来顺一点的调用点用（`uploadCloudSave(game, …)` 这种）。
   * 就是个局部 const，不是 state，不会多一次渲染。
   */
  const game = gameId;

  /**
   * 「显像管关机」那一下正在放（弹出卡带之后的约 0.4 秒）。
   *
   * 屏幕收缩的动画**整个交给 CSS**（`.crt-off-picture` / `.crt-off-line`），
   * 这里只负责「什么时候挂上、什么时候摘掉」——和主题过渡那套
   * （`theme-fading` + 定时器）是同一个做法。
   *
   * 为什么不从 `rom` 变 null 反推：清空 `rom` 的路不止一条 —— 从游戏库载入失败
   * 也会走（见 loadFile 的 catch），那不是「关机」；加入者被自动弹卡带时屏幕马上
   * 就有房主的画面，更不该闪这一下。所以由 `eject` **明确点亮**。
   */
  const [crtOff, setCrtOff] = useState(false);
  /** 上面那 440ms 的定时器。用 ref 不用 state —— 它跟渲染没有任何关系。 */
  const crtOffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [busy, setBusy] = useState(false);
  /*
   * 正在插卡带。`ratio` 是核心包的下载进度（0..1），null 表示「拿不到字节数」——
   * 核心已经躺在 CacheStorage 里、或者响应没有 Content-Length 时就是 null，
   * 界面据此退回一条来回滑动的「不确定」进度条。
   *
   * 单独一个 state 而不是复用 busy：busy 是面板四个按钮共用的禁用开关，
   * 存档 / 读档也会把它置起来，而那些操作不该在屏幕上冒出进度条。
   */
  const [loading, setLoading] = useState<{ ratio: number | null } | null>(null);
  /*
   * 当前这盘卡带的本机存档 —— **一款一份**（`lib/saves.ts` 的主键就是 ROM 文件名）。
   * 「有没有存档可读」就是 `localSave !== null`，不再单独维护一个布尔 ——
   * 两份状态迟早会对不上。
   */
  const [localSave, setLocalSave] = useState<SaveInfo | null>(null);
  /**
   * **云端**那一份存档（登录了才有）。和 `localSave`（本地 IndexedDB）并列，不是替代。
   *
   * 两者刻意都留着：本地那份是「断网 / 不登录也能存」的保底，云端那份是
   * 「换个浏览器还在」。存档列表把两组一起画出来，用户不必知道区别。
   */
  const [cloudSave, setCloudSave] = useState<CloudSaveSlot | null>(null);
  /**
   * 正在读取**云端**那一份（读本机没有这个状态 —— IndexedDB 基本瞬回，
   * 云端要过本站代理再回源 R2，肉眼可感，值得转个圈）。
   */
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  /**
   * 存档面板正在拉列表（2026-10-13 加）。
   *
   * `openLoad` 现在**先把面板弹出来、再取数**（用户要求：点了立刻有反应），
   * 取数期间面板里显示的是一行「读取中」，而不是上一轮留下的旧列表 ——
   * 旧列表一闪会让人以为「列表是空的 / 内容不对」。
   */
  const [savesLoading, setSavesLoading] = useState(false);
  // 音量档位（0 = 静音，VOLUME_MAX = 原音量）。没插卡带时调它也不会丢 ——
  // controller 自己记着档位，下次载入 ROM 时作为 audio_volume 的初值。
  const [volume, setVolume] = useState(VOLUME_MAX);

  const [library, setLibrary] = useState<Cartridge[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  /**
   * 已装上的 BIOS，**按机种分槽**（`arcade` / `ps1` 各一份），空槽表示那一档没有。
   *
   * **只当状态用** —— 页脚那行本该拿它显示「BIOS 已装」（⚠️ 那行渲染今天**没有**，
   * 所以这个 state 目前只有「那一档装过没有」这一个读法，见 loadFile 里那句
   * `if (!bios[wanted])`）；真正递给模拟器的那份由 loadFile 现取（`ensureBios()`），
   * 免得把一个几 MB 的 File 长期挂在 React state 上。
   *
   * ⚠️ 它**不再**决定「要不要去翻一次 IndexedDB」：那份兜底已经挪进 `ensureBios()`
   * （本地没有就自动装站点自带的那份）。所以空槽只代表「本地和站点两份都没有」。
   */
  const [bios, setBios] = useState<Partial<Record<BiosType, BiosInfo>>>({});

  /**
   * 刚拖进来的文件是 `.7z` / `.rar` 这类吃不下的压缩格式，或者是一张**多文件光盘镜像**
   * 的描述文件（`.cue` / `.m3u` / `.toc` / `.ccd`）。
   *
   * 载入失败在屏幕上是完全静默的（刻意的），所以这一条是**唯一**还能告诉用户
   * 「为什么拖进去没反应」的通道 —— 它挂在「按键说明」那个弹窗里。存 null 表示没这回事。
   */
  const [archiveHint, setArchiveHint] = useState<'7z' | 'rar' | 'disc' | null>(null);

  /**
   * 刚拖进来的这盘街机卡带**看着像 Neo Geo 游戏**，而 BIOS 本地和站点两份都没拿到。
   *
   * ⚠️ 正常情况下这条**不会亮**：`ensureBios()` 会把站点自带的那份
   * （`public/bios/neogeo.zip`）自动装上。只有「自建部署没放文件」或「用户手动删过」
   * 才轮得到它 —— 那时它就是唯一还能告诉用户「为什么拖进去没反应」的东西。
   *
   * 为什么需要它：Neo Geo 缺 BIOS 的失败是**完全静默**的 —— 核心不抛异常
   * （`Nostalgist.launch` 正常返回）、`loadFile` 的 catch 分支走不到、屏幕照旧出雪花。
   * 所以「拖入那一刻按 romset 内容猜」是唯一能拿到信号的时机，判据见 `lib/bios.ts`。
   *
   * 和 `archiveHint` 共用同一个展示通道（「按键说明」弹窗），但两者可以同时成立
   * （拖进来一个 `.7z` 的 Neo Geo 包），所以是**两个独立的 state**，不是联合类型。
   *
   * ⚠️ **只有街机这一档有这条提示**，PS1 刻意没有：pcsx_rearmed 找不到真 BIOS 会
   * **回落 HLE**，游戏照跑 —— 弹一句「要 BIOS」反而是误导。PS1 那份 BIOS 的来路
   * 见 `lib/bios.ts` 的文件头。
   */
  const [biosHint, setBiosHint] = useState(false);

  const [fileOver, setFileOver] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  /**
   * 是不是移动设备（手机 / 平板）。
   *
   * **真身在 `<html data-mobile>` 上**（首屏由 layout.tsx 的内联脚本写入，见 lib/device.ts），
   * CSS 按它切（藏掉整间屋子、把右侧那排开关挪到顶上）。这里这份 state 只负责
   * **决定渲染哪一台** —— 房间（RetroTv）还是掌机（HandheldConsole）。
   *
   * 为什么非要有这一份、不能让 CSS 两家都渲染：两台机器里各有一个 canvas，而
   * Nostalgist 只认 `canvasRef` 指的那一个 —— 同时挂在 DOM 里，模拟器会被挂到
   * 后渲染的那台上。所以必须二选一。
   *
   * 默认 false（服务端没有 navigator，水合前后要一致），挂载后再从属性同步 ——
   * 和键位 / 吊灯 / 简洁模式 / 电视机尺寸同一套路。移动端首屏那一帧房间虽然会渲染，
   * 但 `:root[data-mobile='on'] .stage` 已经把它藏掉了，所以**不会闪**。
   */
  const [mobile, setMobile] = useState(false);

  /**
   * 主题（白天 / 夜晚）。
   *
   * **真身在 `<html data-theme>` 上**：首屏由 layout 的内联脚本按 localStorage /
   * 系统偏好写入，钮上露太阳还是月亮由 CSS 按那个属性切（见 globals.css 的
   * `.theme-toggle`）—— 所以这份 state **不负责挑图标**，那样会先按默认主题画一颗、
   * 挂载后再「啪」地换过来。它**只喂那两个 `title / aria-label`**：`title` 是属性
   * 驱动不了的，而 React 在首帧又无从得知主题（服务端没有 localStorage），
   * 只能是这份默认值，挂载后再从属性同步 —— 和那盏灯一样，纯文案的事。
   */
  const [theme, setTheme] = useState<Theme>('dark');

  /**
   * 吊灯开着没有。
   *
   * 真身其实在 `<html data-lamp>` 上（首屏由 layout 的内联脚本写入），CSS 按那个属性
   * 决定亮不亮 —— 和主题同一套路。这里这份 state **只为了 aria-pressed 和按钮文案**，
   * 挂载后再从属性同步（见下面那个 effect），所以不会影响首帧的观感。
   */
  const [lampOn, setLampOn] = useState(true);

  /**
   * 简洁模式开着没有。真身在 `<html data-simple>` 上（首屏由 layout 的内联脚本写入），
   * 这份 state **只为了 aria-pressed 和按钮文案**，挂载后再从属性同步 —— 和上面那盏灯一样。
   */
  const [simple, setSimple] = useState(false);

  /**
   * 电视机尺寸档位。真身在 `<html data-tv>` 上（首屏由 layout 的内联脚本写入），
   * 这份 state **只为了那颗钮的图标和 aria**，挂载后再从属性同步 —— 和上面那盏灯一样。
   * 尺寸本身不在这里：它是 globals.css 里一组跟着属性走的 CSS 变量
   * （为什么不能是 React 下发的内联尺寸，见 lib/tv-size.ts 顶部注释）。
   */
  const [tvSize, setTvSize] = useState<TvSize>(DEFAULT_TV_SIZE);
  /**
   * 「电视机大小」那颗钮左侧的档位选择器开着没有。
   *
   * 纯 UI 状态：不落盘、不进 `<html data-*>`（尺寸本身才需要持久化，那份在 data-tv 上）。
   * 为什么是弹出而不是常驻分段控件 —— 右侧这一列是**竖排**的，三档并排会多占两行，
   * 而调尺寸是低频动作，没必要一直露着（见那颗钮的注释）。
   */
  const [tvMenuOpen, setTvMenuOpen] = useState(false);
  /** 钮 + 弹层那个包裹层。只为了判断「点的是不是菜单自己」（点外面就收起来）。 */
  const tvMenuRef = useRef<HTMLDivElement>(null);

  /**
   * 页面右上角那颗「菜单」钮点开的右侧抽屉开着没有（2026-10-13 加）。
   *
   * 窗口放不下桌面那两处入口时 —— 右上角那一行文字链接（`.top-links`）和右边沿那一列
   * 开关（`.rail`）—— 它们整批收进这个抽屉，页面上只剩右上角一颗菜单钮。
   *
   * **判据全在 CSS**（`max-width: 899px` 或 `max-height: 949px`，见 globals.css），
   * 这里只管开合。大屏时抽屉容器 `.entries` 是 `display: contents`（不生成盒子），
   * 里面两个入口照旧按各自的绝对定位贴在房间里 —— 这个 state 落不到视觉上。
   *
   * ⚠️ 它**取代**了原来那套「窗口一矮就退回一颗盾牌钮 + 往左弹一层」的降级：
   * 盾牌钮、它那个 `legalMenuOpen`、以及 globals.css 里按 `data-tv` 分档的三条高度
   * 媒体查询，2026-10-13 一起删了 —— 现在只有「大屏常驻」和「小屏抽屉」两态。
   *
   * ⚠️ **移动端也在右侧**（2026-10-13 用户要求：原先它在左上角，是为了躲开右上角那颗
   * PWR 灯；现在灯挪去了顶沿左侧，钮就跟着回到右 —— 见 HandheldConsole 顶沿那段）。
   */
  const [menuOpen, setMenuOpen] = useState(false);

  /**
   * 右上角那个**语言选择器**（自绘下拉）开着没有。
   *
   * 2026-10-13 用户要求「不要用原生 `<select>`，自己写一个，样式统一」——
   * 原生下拉的选项列表由操作系统画，和这间屋子的像素风完全两回事（深色面板上会弹出一块
   * 系统白的列表），而且它没法像别的行那样带图标、进抽屉后也没法跟着排成一行一行。
   *
   * 代价（改之前想清楚）：自绘下拉**不是可抓取的链接**，中键 / 右键新标签、复制地址、
   * 爬虫顺着发现另一种语言 —— 这些原生 `<select>` 就已经没有了（它本来也不是链接），
   * 所以这次改动没有让 SEO 再退一步；真要那几条就得退回 `<Link>`（见那颗钮上的注释）。
   */
  const [localeMenuOpen, setLocaleMenuOpen] = useState(false);
  /** 语言选择器 + 它的下拉那个包裹层（判「点的是不是它自己」）。 */
  const localeMenuRef = useRef<HTMLDivElement>(null);

  /* ---------------- 联机 ---------------- */

  const [netplayOpen, setNetplayOpen] = useState(false);
  const [netplayState, setNetplayState] = useState<NetplayState>(IDLE_NETPLAY_STATE);
  const [netplayBusy, setNetplayBusy] = useState(false);

  /* ---------------- 离开房间确认 ---------------- */

  /**
   * 房间里「有活」没有：**插着卡带**（本机在跑或暂停着）或**开着联机房**（等对方 / 已连上）。
   *
   * 判据用 `rom !== null` 而不是 `controller.isRunning`：控制器那个值只有核心真的
   * 转起来才是 true，插着卡但暂停着时它是 false —— 可那时离开一样丢进度，
   * 该拦。这和 `KeyBindingsPanel` 的 `localPlaying` 用的是同一个判据。
   */
  const roomBusy = rom !== null || netplayState.status !== 'idle';

  /**
   * 「离开房间」确认框开着没有。
   *
   * 2026-10-13 用户要求：房间那两处「游戏列表」链接从 `_blank` 改成**当前页跳转**，
   * 但「正在运行游戏时提示一下，没有就直接跳」。
   *
   * 为什么要提示：同页跳转会把整个 ConsoleScene 卸载 —— 正在跑的游戏、联机房间
   * （对面会掉线）全没了，而用户点「游戏列表」多半只是想去逛一圈，未必知道这个代价。
   * 空房间（`roomBusy` 为假）不拦，点一下直接走。
   */
  const [leaveOpen, setLeaveOpen] = useState(false);
  /**
   * 顶部加载条（`app/layout.tsx` 里那颗 `<NextTopLoader>`）的手动接口。
   *
   * 那个包自己听得见两件事：「点了 `<a>`（含 `<Link>`）」和「history 被写了一次」。
   * 剩下两种情况它听不见，得我们喊一声 —— 两种都在这个组件里：
   *
   *   · **这次点击其实没跳**：屋里有活时点「游戏列表 / 账号 / 首页」，弹出来的只是
   *     下面那个「留下 / 离开」确认框，页面并没有换。见紧跟着的那条 effect。
   *   · **程序化导航**：语言那颗下拉不是 `<a>`，只能 `router.push`（见它自己的
   *     `onClick`）。那种地方要手动 `start()`。
   *
   * ⚠️ 该喊不喊的后果不是「少个动画」：nprogress 会一直往上爬（它不知道自己该停了），
   * 用户看到的是**一条永远走不完的进度条僵在顶上**，比没有它难受得多。
   *
   * `useTopLoader()` 每次渲染都返回**新对象**（里面是几个新箭头函数），直接丢进
   * effect 依赖会让那条 effect 每渲染跑一遍，所以用 `useState` 的惰性初值把**第一份**
   * 冻结下来（不能改用 `useRef(...).current`：现在这条规则禁止在渲染期读 `current`）。
   * 它那几个方法都是「直调模块级 nprogress」，跟这个对象本身无关，钉一份完全够。
   */
  const topLoader = useTopLoader();
  const [topLoaderDone] = useState(() => topLoader.done);
  useEffect(() => {
    /*
     * 确认框弹出的那一刻，把已经开始的加载条收掉 —— 上面说的第一种情况。
     *
     * 为什么放在**这条 effect** 里、而不是写进那两个 `onClick` 的 `preventDefault()`
     * 旁边：那里只是「标记这次点击作废」，而加载条那个包的监听器也挂在 `document`
     * 上、和 React 的监听器谁先跑**不确定**（取决于注册顺序）。写在 `onClick` 里可能
     * 变成「先 done 再 start」，条照样挂住。effect 跑在整轮事件派发**之后**，
     * 顺序是死的。
     *
     * `topLoaderDone()` 在没跑过加载条时是空转（nprogress 自己判 `status`），
     * 所以不必再判一次「这次是不是真有条」。
     */
    if (leaveOpen) topLoaderDone();
  }, [leaveOpen, topLoaderDone]);
  /**
   * 分享链接带进来的房间码，等用户确认。null = 没有待确认的邀请。
   *
   * 挂成 state（而不是每次渲染现读地址栏）：确认框要能被「加入 / 取消」清掉，
   * 而地址栏是外部状态，清不掉 —— 而且读完就抹（见下面那个 effect）。
   */
  const [pendingRoom, setPendingRoom] = useState<string | null>(null);
  /**
   * 联机面板输入框的初始值 —— 从分享链接确认加入时带进来的那个码。
   *
   * 它同时当 `<NetplayPanel>` 的 `key` 用：码一变就重挂载面板、输入框跟着重新初始化。
   * 不这么做就得在面板里写一个「prop 变了同步进 state」的 effect，而那条路会被
   * `react-hooks/set-state-in-effect` 拦下。
   */
  const [joinPrefill, setJoinPrefill] = useState<string | null>(null);
  /**
   * 选的链路。默认 `lan`（只 STUN）—— 这是不依赖任何外部配置就能跑的那一档，
   * `wan` 要构建期配了 TURN 才有意义（没配时面板会把它标成开发中）。
   * 不持久化：每次开面板都从局域网开始，省得用户上次选了公网、这次忘了切回去。
   */
  const [netplayMode, setNetplayMode] = useState<NetplayMode>('lan');
  /**
   * 出画档位（房主选）。默认值先给 `DEFAULT_STREAM_QUALITY`，真正存的份在挂载后读
   * （和键位同一套路：服务端没有 localStorage，惰性初始化会两边不一致）。
   */
  const [streamQuality, setStreamQuality] = useState<StreamQuality>(DEFAULT_STREAM_QUALITY);
  /** 房主推过来的画面流。只有加入者会拿到，房主那边永远是 null */
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  /**
   * 房间顶上那枚几秒后自己消失的提示。null = 不显示。
   *
   * 存**键**而不是翻译好的字符串：它跟着语言走就行 —— 虽然只活几秒，
   * 但没有理由让它停在旧语言上（切语言不需要重开一局联机）。
   *
   * 两种：`kind: 'ok'` 是「刚连上」（绿点 + 绿描边）、`kind: 'danger'` 是「对方离开了」
   * 或「深链那款游戏不在了」（红点 + 红描边，和面板里那行报错同一个色）。
   * **颜色分开**是有意的 —— 前者是好事、后者要人去处理（加入者得重新要一个码），
   * 长得一模一样会让人一眼扫过去以为还是「已连上」。
   *
   * ⚠️ 这个位置是**共用的**（2026-10-12 起 `?id=` 深链也用），所以它不叫
   * `netplayToast` 了。同一时刻只会有一条：深链那条读不到游戏就没了下文，
   * 而联机提示是「对方动作」触发的，两者撞上的概率可以忽略；
   * 真撞上也是后写的那条盖掉前一条，不会叠成两条。
   */
  const [toast, setToast] = useState<{
    key: MessageKey;
    kind: 'ok' | 'danger';
  } | null>(null);

  /**
   * 联机控制器，和 EmulatorController 一样用惰性初始化持有。
   *
   * 三个回调里要读 `controller`（房主把对方的输入打进本机），而 controller 在这个
   * useState 之前就建好了 —— 闭包捕获的是那个稳定引用，所以不需要 ref。
   * 本地角色由控制器回传，避免回调反过来引用 netplay 自己（那样是循环引用）。
   */
  const [netplay] = useState(() => {
    /*
     * 上一次的状态。只为认出「刚连上」这个**跳变** —— 控制器每两秒回来一次 ping，
     * 那也会走 onState（状态对象是新的，`status` 没变），不记上一次的话
     * 那枚提示会被反复重放。
     *
     * 为什么这件事写在 onState 里、而不是一个 useEffect：连上是个**控制器报上来的事件**
     * （对方什么时候进房间不由我们定），不是从渲染结果反推出来的状态。挂在 effect 里
     * 还得同步 setState，白引一条 cascading render 的 lint 报错。
     */
    let lastStatus: NetplayStatus = IDLE_NETPLAY_STATE.status;
    /*
     * 上一次的本地角色。断开那一刻要先知道「我是房主还是加入者」才能选对文案，
     * 而加入者那条路径上 `role` 会在报事件之前就被 `leave()` 清成 null
     * （见 lib/netplay.ts 的 onPeerLeave）—— 所以不能读 `next.role`，得读上一次的。
     */
    let lastRole: NetplayRole | null = IDLE_NETPLAY_STATE.role;
    /*
     * 上一次的原因码。加入者侧认「房主已离开」靠 `error === 'host-left'`，
     * 而那次报错会**紧随 `leave()` 之后的第二次 onState** 才到（中间隔着一次 error:null），
     * 所以还要记一次旧值，才能挡住同一次断开的重复上报（见下面分支里的注释）。
     */
    let lastError = IDLE_NETPLAY_STATE.error;
    /*
     * 只在**有角色时**更新它：断开时控制器报上来的两次状态里 `role` 都已经是 null
     * （`leave()` 先清空、`fail()` 再挂原因码），要是照着 `next.role` 覆盖，
     * 第二次带着 `host-left` 回来时 `lastRole` 早变 null 了，又选不出该弹哪句。
     * 所以它保住的是「**上一次还在房间里时我是什么角色**」。
     */
    const rememberRole = (role: NetplayRole | null) => {
      if (role) lastRole = role;
    };

    return new NetplayController({
      onState: (next) => {
        setNetplayState(next);

        /*
         * 刚连上：把联机面板收掉，换一枚几秒后自己消失的提示
         * （退场见下面那个 setTimeout，文案见 lib/i18n.ts 的 netplay.toast*）。
         *
         * 为什么非收面板不可：面板开着时它自己就是「已连接」的唯一显示处（那颗绿点
         * 加延迟读数），可它把整个房间盖住了 —— 连上的那一刻用户想看的是游戏。
         * 而且这是个异步到达的事件，停在那一屏上等十几秒很难受。
         */
        if (next.status === 'connected' && lastStatus !== 'connected') {
          setNetplayOpen(false);
          setToast({
            key: next.role === 'host' ? 'netplay.toastHost' : 'netplay.toastGuest',
            kind: 'ok',
          });
        } else if (next.status !== 'connected') {
          /*
           * 断开这一段要分清三件完全不同的事，不能笼统地「一断就报对方走了」：
           *
           *   ① **我自己点了「离开房间」** —— 谁也没走，是我退的房。
           *   ② **房主走了 / 对方走了** —— 这才该弹「对方离开了」。
           *   ③ 单纯掉线（网络抽风、握手失败）—— 不报。
           *
           * 用 `lastStatus === 'connected'` 只能认出「刚才还连着」，区分不了 ①②③ ——
           * 加入者自己退房时走的也是 `leave()` 这一条，表现和「房主走了」几乎一样
           * （都会落到 IDLE）。所以必须用各自的**可靠信号**，见下。
           */
          if (lastRole === 'host') {
            /*
             * 房主侧：房主**自己退房**会落到 `idle`（`leave()` 给的是 IDLE_NETPLAY_STATE）；
             * 而「加入者走了、房间还开着」是 `onPeerLeave` 把状态改成 `waiting`
             * （见 lib/netplay.ts，房主那条分支）—— 所以 `waiting` 是房主侧
             * 「对方离开」的**唯一**指征，退房不会被误判。
             */
            if (next.status === 'waiting' && lastStatus === 'connected') {
              setToast({ key: 'netplay.toastGuestLeft', kind: 'danger' });
            } else {
              setToast(null);
            }
          } else if (lastRole === 'guest') {
            /*
             * 加入者侧：房主走的那条 `onPeerLeave` 会**明确挂上** `error: 'host-left'`
             * （`leave()` → `fail('host-left')`）；而加入者自己点「离开房间」走的是
             * `leave()`，`error` 留在 null。两个状态长得几乎一样，**只有这个原因码能分开** ——
             * 用它才能避免「自己退房却提示房主离开」这种错报。
             *
             * ⚠️ 这里**不能**再要求 `lastStatus === 'connected'`：房主离开时控制器会**连发两次**
             * `onState` —— 先是 `leave()` 的 `{idle, error:null}`，紧接着 `fail('host-left')`
             * 的 `{idle, error:'host-left'}`。第一次就已经把 `lastStatus` 刷成 `idle` 了，
             * 等第二次带着 `host-left` 回来时再比对 `lastStatus` 一定不成立。
             * 改用「原因码**从无到有**」这个跳变：`fail()` 后它一直挂着，
             * 所以用 `lastError !== 'host-left'` 挡重复即可。
             */
            if (next.error === 'host-left' && lastError !== 'host-left') {
              setToast({ key: 'netplay.toastHostLeft', kind: 'danger' });
            } else if (next.error === 'room-full') {
              /*
               * 房间已满，被房主请出来了。
               *
               * 这枚提示**不能走 toast**：用户刚点了「加入」，正等着进屋，一句浮着几秒
               * 就消失的话不够 —— 得让他看清「为什么没进去」。所以反而要把联机面板
               * **重新打开**（它在「刚连上」那一刻被自动收掉了），让面板底部那行红字
               * `netplay.errRoomFull` 明明白白摆在那儿。
               * 顺带把「刚连上」的绿 toast 收掉：那是假象（我们其实没连成）。
               */
              setToast(null);
              setNetplayOpen(true);
            } else if (next.error === null) {
              // 没挂原因码 = 是我自己点的退房（或真掉线），不该说「房主已离开」，清掉
              setToast(null);
            }
            // next.error === 'host-left' 且 lastError 也是它：同一次断开的重复上报，
            // 提示已经在屏幕上，什么都不做（重开会把 4 秒计时器重置）
          } else {
            // 没进过房间（建房失败 / 校验不过）：没有「对方」可言，清掉就是了
            setToast(null);
          }
        }

        lastStatus = next.status;
        rememberRole(next.role);
        lastError = next.error;
      },
      onRemoteButton: (button, down, role) => {
        /*
         * 只有房主本机跑着模拟器。加入者屏幕上是房主推来的画面，
         * 本机连模拟器都没有，注入无处可去 —— 所以这里是单向的。
         */
        if (role !== 'host') return;
        controller.pressButton(button, remotePlayer(role), down);
      },
      onRemoteStream: (stream) => setRemoteStream(stream),
    });
  });

  /* ---------------- 按键 ---------------- */

  const [bindings, setBindings] = useState<KeyBindings>(DEFAULT_BINDINGS);
  const [keybindOpen, setKeybindOpen] = useState(false);
  /** 「按键说明」弹窗。内容原先是常驻在右上角的一块文字，现在收进按钮里 */
  const [legendOpen, setLegendOpen] = useState(false);
  /**
   * 「一张纸」。点地板右下角那张纸片弹出来 —— 不是面板，是一句祝福，
   * 所以它不做工具栏那套，只做「窗口糊掉 + 浮起一张纸」。
   */
  const [noteOpen, setNoteOpen] = useState(false);

  /**
   * 留言本。内容来自 `/api/feedback`，是**公开**的，面板自己也负责提交（见 FeedbackPanel）。
   *
   * 有**两个**入口，开的是同一个面板：
   *   - 右侧开关栏那颗（正经入口，2026-10-10 加）
   *   - 房间里地板上那本（亮青封面 + 斜搁着的笔）—— 从此退成**彩蛋**，点开照旧能用
   * 列表数据不放在这里：面板每次打开都是一次全新挂载，翻页 / 提交的状态没必要留在父级。
   */
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  /**
   * 地板上那台 MP4 在不在放（见 `RoomFloorItems`）。
   *
   * **全屋唯一一件「状态就留在 React 里」的可点物件。** 吊灯 / 简洁模式 / 电视机尺寸
   * 那几件之所以把真身挂到 `<html data-*>`，是因为它们要在**首屏之前**就生效
   * （CSS 直接按属性画），而这里没有这个问题 —— 刷新页面本来就该停（浏览器也不允许
   * 刷新后自己响起来），所以既不必落盘，也不必进 DOM 属性。
   */
  const [mp4Playing, setMp4Playing] = useState(false);
  /** 那台 MP4 的 `<audio>`。挂在 JSX 末尾（和 ROM 的 file input 并排），不参与布局。 */
  const mp4AudioRef = useRef<HTMLAudioElement>(null);
  /**
   * 已经退到兜底音源（现场摇的 8-bit 小段）了没有。
   *
   * 只退一次：一旦确认那个 mp3 放不出来，之后就一直走合成的，不再回头试文件 ——
   * 否则每点一次都要先失败一次（失败那一下还会在 console 里刷一行），点得越多越像坏了。
   */
  const mp4FallbackRef = useRef(false);
  /**
   * 当前这一段兜底音的 `blob:` 地址。
   *
   * **一次性资源**：`chiptuneUrl()` 现在每次都现摇一段新的（用户要「每次都不一样」），
   * 所以换下一段时必须把上一段 `revokeObjectURL()` 掉，否则每点一次就漏几十到一百多 KB。
   * 卸载时也要还回去（它不再是模块级缓存了）。
   */
  const mp4UrlRef = useRef<string | null>(null);

  /**
   * 书堆后面探出来的那只猫（点了地板上那根逗猫棒才出现，见 `TvCat`）。
   *
   * 和 MP4 一样，状态就留在 React 里：刷新页面本来就该没有猫，不必落盘。
   * `null` = 没猫；有值时渲染 `TvCat`，`POKE_CAT_MS` 之后自己收回去。
   * `seq` 只当 React 的 key 用：**再点一次要换一只、还要把动画从头放一遍** ——
   * 不给 key 的话同一个组件只会改 props，CSS 动画不会重跑，看起来像「点第二下没反应」。
   */
  const [cat, setCat] = useState<{ breed: CatBreed; seq: number } | null>(null);
  /** 上一只猫的品种（跨轮防重复用，理由见 `nextCatBreed`） */
  const catBreedRef = useRef<CatBreed | undefined>(undefined);
  /** 洗牌袋：连着点几次都能看到不同的品种 */
  const catBagRef = useRef<CatBreed[]>([]);
  /** 让猫缩回去的那个定时器 */
  const catTimerRef = useRef<number | null>(null);
  /** 猫的出场序号，只涨不减 —— 上面那个 key 就是它 */
  const catSeqRef = useRef(0);

  /**
   * 墙上挂着的那一幅画（`PAINTINGS` 里的一项）。**刷新随机抽一幅**；`null` = 还没抽出来。
   *
   * 为什么不留在 `RoomPainting` 里：**点开大图要看的就是墙上挂着的那一幅**，
   * 两处各存一份迟早会各说各话。挪上来之后 `RoomPainting` 成了纯展示组件 ——
   * 和窗户 `RoomWindow`、地板 `RoomFloorItems` 一样，只收 props + 一个 label。
   *
   * ⚠️ 抽签**只能放在挂载后的 effect 里，不能写成 `useState` 的初值**：这个组件在
   * 服务端也要渲一遍，初值会让 Node 和浏览器**各抽一次**、两边对不上就是 hydration
   * mismatch。所以首帧墙上画框里是一块空画布，挂载后（一帧内）才补上。
   */
  const [wallPainting, setWallPainting] = useState<PixelPainting | null>(null);
  /** 挂画的大图面板开着没有（点画框打开，见 `PaintingPanel`）。里面摆的就是墙上那一幅 */
  const [paintingOpen, setPaintingOpen] = useState(false);

  /**
   * 操作指引开着没有。**初次访问自动打开**（下面那个 effect），之后靠「重看操作指引」
   * 再打开（在按键说明弹窗里）。
   *
   * 默认 false、由 effect 打开而不是惰性初始化：客户端组件在服务端也会渲染一遍，
   * 那时没有 localStorage，惰性初始化会在两遍之间给出不同结果 → hydration 不一致。
   * 和键位那份用同一个理由（见下面 loadBindings 那段）。
   */
  const [tourOpen, setTourOpen] = useState(false);

  /* ---------------- 在线游戏库 ---------------- */

  const [libraryOpen, setLibraryOpen] = useState(false);
  /**
   * `/room?id=<游戏 id>` 那条深链的**独立弹窗**开着没有；`deepLinkGame` 是它的数据。
   *
   * 为什么拆成两个 state（2026-10-12 用户要求）：**弹窗要在「知道有 id」那一刻就立起来**，
   * 不能等数据回来。原先是有 id 就先打接口、数据到了才开窗 —— 于是从详情页点「开始游戏」
   * 过来的头几百毫秒是一间什么也没发生的房间，看着像没反应。现在 `deepLinkOpen` 先亮、
   * 里面转 loading 动画，`deepLinkGame` 到了再换成封面和名字。
   *
   * 和 `libraryOpen` 刻意分开：深链是「有人把一盘具体的游戏递到你手里」，
   * 不该先把整个游戏库摊开、再从十几张封面里挑出这一张来载入（用户点了「开始游戏」，
   * 眼前却闪过一整个游戏库）。这个弹窗只有封面、名字、进度和取消。
   *
   * 关闭时机和游戏库面板一致：ROM 整包到手就收掉（见 `loadRemote`），
   * 之后核心包的加载进度由电视机屏幕接着显示。两件事都由 `closeDeepLink` 一起关。
   */
  const [deepLinkOpen, setDeepLinkOpen] = useState(false);
  /** 深链那一款的数据；null = 还没到（弹窗里摆 loading 骨架） */
  const [deepLinkGame, setDeepLinkGame] = useState<LibraryGame | null>(null);
  /**
   * 正在飞的**深链取数**请求的取消把手（`GET /api/games/<id>` 那一小段）。
   *
   * 和 `romAbortRef` 分开：这是**两段不同的下载** —— 先要一条数据（毫秒级），
   * 再要 ROM 整包（几十 MB）。弹窗上那颗「取消」得把两段都掐掉，所以 `cancelDeepLink`
   * 两个都 abort；而「载入完成」只看第二段。
   */
  const deepLinkAbortRef = useRef<AbortController | null>(null);
  /** 正在从游戏库载入的那盘游戏 id；非 null 时弹窗里的卡片全部置灰 */
  const [libraryLoadingId, setLibraryLoadingId] = useState<string | null>(null);

  /* ---------------- 账号 / 云端数据（2026-10-13） ---------------- */

  /**
   * 当前登录的前台用户（`app_users`，**和后台管理员无关** —— 那套是 `nesload_admin`
   * cookie + `/admin`，两者完全隔离）。
   *
   * `null` 有两种含义：「没登录」和「还没问出来」。所以另有一个 `userLoading` 把它俩分开 ——
   * 混在一起的话首屏那几十毫秒会把「登录中」画成「未登录」，已经登录的用户会看见
   * 账号钮先亮一下未登录态、再切过去。
   */
  const [user, setUser] = useState<{ id: string; username: string } | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [userOpen, setUserOpen] = useState(false);

  /**
   * 收藏的 game_id 集合。
   *
   * **`null` 是「没登录」的哨兵**，和「登录了但一条都没收藏」（空数组）区分开 ——
   * 游戏库面板要用这个区分「星标不亮是因为没登录」还是「因为真的没收藏」，
   * 前者点一下要提示去登录、后者点一下才是加收藏。
   *
   * 放在父级而不是面板里：面板每次开关都是全新挂载，而星标的状态要跨开关保留
   * （用户收藏了、关掉面板、再打开，星标必须还亮着）。
   */
  const [favoriteIds, setFavoriteIds] = useState<string[] | null>(null);

  /**
   * 首屏问一次「我是谁」，登着的话顺带把收藏集合拉回来。
   *
   * 两步串在一起（而不是两个 effect）：第二步依赖第一步的结果 —— 没登录就不必去拉收藏
   * （打了也是 401）。放 .then 里自然串起来，也不会有「先拉的收藏、后到的登录态」这种错位。
   */
  useEffect(() => {
    let cancelled = false;
    void fetchCurrentUser()
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setUserLoading(false);
        if (!me) return;
        return fetch('/api/user/favorites?ids=1')
          .then((res) => (res.ok ? res.json() : null))
          .then((data: { ids?: string[] } | null) => {
            if (!cancelled && data?.ids) setFavoriteIds(data.ids);
          })
          .catch(() => {
            // 收藏拉不到不影响别的 —— 星标一律不亮就是了，登录态还在
            if (!cancelled) setFavoriteIds([]);
          });
      })
      .catch(() => {
        if (!cancelled) setUserLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 登录 / 注册成功。**必须把收藏集合重新拉一遍** —— 上一个账号（或者匿名）那份
   * 还挂在 state 上，不清掉就会「刚登录就发现自己收藏了一堆别人的游戏」。
   */
  const handleAuthed = useCallback((me: { id: string; username: string }) => {
    setUser(me);
    setUserOpen(false);
    void fetch('/api/user/favorites?ids=1')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { ids?: string[] } | null) => setFavoriteIds(data?.ids ?? []))
      .catch(() => setFavoriteIds([]));
  }, []);

  /**
   * `/room?from=account` —— 从个人中心的守卫那一步被弹回来的用户。
   *
   * **这个参数的来历**（2026-10-13 之前）：那时前台没有登录页，`/account` 的 layout
   * 发现未登录只能 `redirect('/room?from=account')`（见 app/account/layout.tsx）。
   * 到了屋里必须**把账号面板替他开好**，否则用户点「个人中心」→ 被弹回房间 →
   * 看见一间若无其事的屋子，只会以为那个入口坏了。
   *
   * ⚠️ **2026-10-13 之后站里已经没有地方生成这个参数了** —— 那天加了独立登录页，
   *    `/account` 的守卫改成 `redirect('/login?next=/account')`（不再绕回房间）。
   *    这段逻辑**留着**：老书签 / 别人复制走的 `/room?from=account` 仍然存在，
   *    对它来说「开好登录框」依然是对的行为。**别再照着它新增调用方。**
   *
   * ⚠️ **不能无条件开** —— 已经登录的人手动访问 `/room?from=account`（或者刷新）
   *    不该被强塞一个账号面板。所以等 `userLoading` 落定、确认 `user` 为 null 才开。
   *
   * 参数**不在这一轮抹掉**：和 `?room=` 的「读到就抹」不同 —— 这里抹不抹都不影响
   * 后续行为（effect 只在挂载时读一次），而留着它，用户按 F5 会被再弹一次登录框,
   * 这恰好是「他还没登上、还想登」时想要的。真登上之后 `user` 非 null，
   * 这个 effect 自然不再开面板。
   */
  useEffect(() => {
    if (userLoading || user) return;
    if (new URLSearchParams(window.location.search).get('from') !== 'account') return;
    // 微任务而不是同步 setState：绕开 react-hooks/set-state-in-effect（详见下面 deep-link 那段）
    void Promise.resolve().then(() => setUserOpen(true));
  }, [userLoading, user]);

  /** 退出。收藏集合**置回 null**（= 未登录），不是空数组 —— 那个哨兵不能丢。 */
  const handleSignedOut = useCallback(() => {
    setUser(null);
    setFavoriteIds(null);
    setUserOpen(false);
  }, []);

  /**
   * 点封面左上角那颗星：收藏 / 取消收藏。
   *
   * 未登录时**不发请求**，只弹一句提示并开登录面板 —— 这也是「星标未登录也显示」的理由：
   * 用户得先看见它，才知道有这么个功能、才可能去注册。
   *
   * 乐观更新：先改本地的 `favoriteIds` 再打接口。收藏是**幂等**的
   * （数据层 ON CONFLICT DO NOTHING / 先查后删），所以即使请求失败、状态短暂不一致，
   * 用户再点一下就能修正。反过来（等接口回来才亮星标）在慢网下会像「点了没反应」。
   */
  const toggleFavorite = useCallback(
    (game: LibraryGame) => {
      if (!user) {
        setUserOpen(true);
        return;
      }
      const owned = favoriteIds?.includes(game.id) ?? false;

      setFavoriteIds((prev) => {
        if (prev === null) return prev;
        return owned ? prev.filter((id) => id !== game.id) : [game.id, ...prev];
      });

      void fetch(owned ? `/api/user/favorites?gameId=${encodeURIComponent(game.id)}` : '/api/user/favorites', {
        method: owned ? 'DELETE' : 'POST',
        headers: owned ? undefined : { 'Content-Type': 'application/json' },
        body: owned ? undefined : JSON.stringify({ gameId: game.id }),
      })
        .then((res) => {
          if (res.ok) return;
          // 失败了就把本地那份翻回去，别让界面停在一个假的收藏态上
          throw new Error(String(res.status));
        })
        .catch((error) => {
          console.warn('[nesload] 收藏操作失败，已回滚：', error);
          setFavoriteIds((prev) => {
            if (prev === null) return prev;
            return owned ? [game.id, ...prev] : prev.filter((id) => id !== game.id);
          });
        });
    },
    [user, favoriteIds]
  );

  /**
   * 「ROM 整包正在下载」这一段的状态（面板底部那条栏 + 取消入口），非 null 就是下载中。
   *
   * 和 `libraryLoadingId` **刻意分开**：后者从点击一直活到 `loadFile` 结束（防重入、
   * 卡片置灰），而这一条只覆盖整包下载那一段。拿到 blob 就置回 null —— 后面
   * `loadFile` 还要跑一会儿（下载核心包），那段时间面板已经自动关了；若这时用户
   * 又打开面板，不该看见一条停在 100%、点了取消也没用的假进度条。
   */
  const [romDownload, setRomDownload] = useState<{ title: string } | null>(null);
  /** ROM 下载进度（0..1）；null = 拿不到总字节数，弹窗里画不确定进度条 */
  const [libraryProgress, setLibraryProgress] = useState<number | null>(null);
  /**
   * 正在飞的那笔 ROM 下载的取消把手。
   *
   * 用 ref 而不是 state：`cancelRemoteLoad` 得在**不重渲染**的前提下拿到它，
   * 而它是「当前这一笔」的标识、不是要画出来的东西。
   * 非 null 就等于「有下载在飞」，和 `romDownload !== null` 同步。
   */
  const romAbortRef = useRef<AbortController | null>(null);

  // 刷新页面后，已经装过的 BIOS 还得在页脚那行状态里体现出来 —— 两台机各查一次
  useEffect(() => {
    void Promise.all([getBiosInfo('arcade'), getBiosInfo('ps1')]).then(([arcade, ps1]) => {
      const next: Partial<Record<BiosType, BiosInfo>> = {};
      if (arcade) next.arcade = arcade;
      if (ps1) next.ps1 = ps1;
      setBios(next);
    });
  }, []);

  /**
   * 键位在挂载后读，不用 `useState(() => loadBindings())` 惰性初始化。
   *
   * 客户端组件在服务端也会渲染一遍，那时没有 localStorage，惰性初始化拿到的是默认值；
   * 客户端 hydration 再跑一次才拿到用户存的那份 —— 两次结果不同就是 hydration 不一致。
   * 放到 effect 里读，服务端和首帧客户端都从默认值出发，一致。
   */
  useEffect(() => {
    const stored = loadBindings();
    setBindings(stored);
    controller.setBindings(stored);
  }, [controller]);

  /**
   * 出画档位也是挂载后读（同上：服务端没有 localStorage）。
   * 读到的值不是合法档位（手改过、或旧版本留下的）就当没存过、退回默认 ——
   * 免得一个脏值被当成档位传下去。
   */
  useEffect(() => {
    const stored = localStorage.getItem(QUALITY_KEY);
    if (stored === 'smooth' || stored === 'balanced' || stored === 'sharp') {
      setStreamQuality(stored);
    }
  }, []);

  /**
   * 换档：状态 + 记住。写入失败（隐私模式）不影响本次生效，只是下次要重选。
   *
   * 这里**不碰流** —— 下面那个「房主推画面」的 effect 依赖里有 `streamQuality`，
   * 值一变它会自动收掉旧流、按新帧率重建一条。帧率是建流参数、事后改不了，
   * 所以「换档 = 重建整条流」这件事只有那一个地方该做。
   */
  const changeStreamQuality = useCallback((next: StreamQuality) => {
    setStreamQuality(next);
    try {
      localStorage.setItem(QUALITY_KEY, next);
    } catch {
      // 隐私模式下 localStorage 会抛，静默即可
    }
  }, []);

  /*
   * 初次访问自动弹操作指引。和上面键位同一套路：挂载后读，不在惰性初始化里读。
   *
   * 窄屏（< 900px）时指引整块是 display:none，用户根本看不到；**这里照样把它置开**，
   * 因为「标记」只在 onClose 里写（见 closeTour）—— 他看不到就没机会关，标记也就写不进去，
   * 之后换到宽窗口还会补上这一遍。这正是我们要的。
   *
   * **带 `?id=` 深链进来时让位**（下面那个 effect 会去载入那一款）：
   * 指引是 z-[60] 的一整层，会把「正在载入」的进度盖住，用户看完指引才发现游戏早开始了。
   * 指引本身没丢 —— 这次不写标记（`closeTour` 才会写），他下次正常进站照样会看到。
   *
   * ⚠️ 这里读地址栏，而**参数是不会被抹掉的**（见 `readGameId` 的注释），
   * 所以这个判断和下面那个 effect 谁先跑都成立，不依赖 effect 的声明顺序。
   */
  useEffect(() => {
    if (readGameId()) return;
    if (localStorage.getItem(TOUR_KEY) === null) {
      setTourOpen(true);
      /* 通知别的首次访问提示让路（语言提示弹窗，见 OnboardingTour 里那两个事件名） */
      window.dispatchEvent(new Event(TOUR_OPEN_EVENT));
    }
  }, []);

  /** 关掉指引（走完 / 跳过都走这里），顺手记下「看过了」。 */
  const closeTour = useCallback(() => {
    setTourOpen(false);
    /* 让路结束 —— 排在后面的首次访问提示可以出来了 */
    window.dispatchEvent(new Event(TOUR_DONE_EVENT));
    try {
      localStorage.setItem(TOUR_KEY, '1');
    } catch {
      // 隐私模式下写不进去也无所谓：下次还会再弹一遍，不影响功能
    }
  }, []);

  /**
   * 改键位的唯一出口：写回引擎（**下次插卡带**才生效）、存盘、更新界面。
   *
   * 加入者那边还会顺带改到转发映射 —— 他没有模拟器，所以那条路是立刻生效的。
   */
  const applyBindings = useCallback(
    (next: KeyBindings) => {
      setBindings(next);
      controller.setBindings(next);
      saveBindings(next);
    },
    [controller]
  );

  /* ---------------- 载入 ---------------- */

  const loadFile = useCallback(
    async (file: File) => {
      /*
       * 拖进来的第一件事就是留个痕。载入失败在屏幕上是静默的（这是刻意的），
       * 所以「拖了没反应」到底是没走到这儿、还是走到了又失败，只能靠这行日志区分
       * —— 连它都没有，问题就在拖拽事件那一层，不在载入流程。
       */
      console.info(
        `[nesload] 收到文件：${file.name}（${file.size} 字节，type=${file.type || '空'}）`
      );
      // 每次拖入都重置上一条格式提示 —— 它说的是「刚才那个文件」，不是历史状态
      setArchiveHint(null);
      setBiosHint(false);

      // 房主正在出画面时不接受本地载入：屏幕上已经有画面了，再插一盘只会打架。
      // 用 netplay.current 而不是 state，省得把 netplayState 拖进依赖、让这个
      // 回调每次状态变化都换一次身份（拖拽那套 effect 依赖它）。
      if (netplay.current.remotePlaying) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      // 载入中再丢一盘进来：直接忽略，别把正在跑的那次搅了
      if (loadingRef.current) return;

      /*
       * 拖进来的可能不是游戏，而是 BIOS。
       *
       * 两台机各有一份（见 `lib/bios.ts` 的 `BIOS_SPECS`）：
       *   · 街机的 neogeo.zip —— 它和 romset 一样是个 zip、文件头一模一样，只能靠文件名分；
       *   · PS1 的 SCPH1001.BIN（或 5501 / 7001 / 101）—— 靠 `scph` 前缀认。
       *
       * 认出来就存成系统文件 —— 不进历史、不启动模拟器。
       * 这条路刻意做得和拖卡带一样：用户不需要知道「BIOS」这个概念，拖进来就算装上了。
       */
      const droppedBios = matchBiosFile(file);
      if (droppedBios) {
        const info = await putBios(droppedBios, file);
        if (info) setBios((prev) => ({ ...prev, [droppedBios]: info }));
        console.info(
          droppedBios === 'arcade'
            ? `[nesload] 街机 BIOS 已装上：${file.name}。` +
                'Neo Geo 游戏（合金弹头、拳皇、侍魂…）现在能跑了 —— 重新拖一次那盘卡带即可。'
            : `[nesload] PS1 BIOS 已装上：${file.name}。` +
                '核心下次启动会用它（之前是回落 HLE）—— 重新拖一次那张盘即可。'
        );
        return;
      }

      loadingRef.current = true;
      setBusy(true);
      // 进度条立刻出现（此刻还是「不确定」态）—— 用户刚把文件丢进来，
      // 界面必须在同一帧给出反应，不能等他看到几秒雪花之后才动。
      setLoading({ ratio: null });

      // 载入失败时要靠它决定页脚给不给 BIOS 提示，所以在 try 里先认一次机种。
      // （loadRom 内部还会再认一次 —— 只读文件头，不值得为省这一次把签名搅乱。）
      let consoleType: ConsoleType | null = null;
      // 需要 BIOS 的机种要递给核心的那份。在上面那个 try 里备齐，loadRom 那一步只负责用。
      let biosFile: File | null = null;
      try {
        /*
         * **先拆包再认机种**（2026-10-19）。
         *
         * 原来这里是 `detectConsole(file)` 直接看原始文件 —— 对一个「zip 里装
         * `.cue` + `.bin`」的 PS1 盘，文件头是 `PK\x03\x04`，会被判成**街机**：
         * BIOS 走街机那档（还会去认 Neo Geo）、键位落回街机那套六键布局，
         * 而 `loadRom` 内部拆包后又按 PS1 起核心 —— 两边对不上。
         *
         * 拆出来的结果**必须传给 `loadRom`**（第 5 个参数）：否则它内部会再拆一遍，
         * 252 MB 的光盘包要解两次。
         *
         * 进度照旧接给屏幕：7z 那条路要在 Worker 里解十几秒，不报进度就是一块死屏
         * （zip 那条路不解 7z、一般很快，不触发回调）。
         */
        const prepared = await unwrapRom(file, (ratio) => setLoading({ ratio }));
        consoleType = prepared?.console ?? (await detectConsole(prepared?.file ?? file));

        /*
         * 需要 BIOS 的机种（街机 / PS1，见 `lib/bios.ts` 的 `biosTypeFor`）：
         * 先把 BIOS 备齐 —— 本地存过就用本地那份，没存过就自动把**站点自带**的那份
         * （`public/bios/neogeo.zip`）装进 IndexedDB。用户这边是零操作。
         *
         * ⚠️ **只有街机有站点副本**：PS1 那份（SCPH1001.BIN）是索尼的版权物，
         *    `public/bios/` 里只留 neogeo.zip 是用户拍板的边界 —— 所以 PS1 那一档
         *    `ensureBios('ps1')` 正常情况恒为 null，而那是**预期行为**，不是故障：
         *    核心找不到真 BIOS 会回落 HLE，游戏照跑。
         *
         * 这一步同时承担「装上」和「取出来」，所以从站点那份装成功时，`bios` 那个
         * state 也得跟着同步。
         *
         * 两条都拿不到时，**只有街机**再退一步去认这盘是不是 Neo Geo 游戏：认出来就把
         * 提示挂进「按键说明」弹窗，让「拖进去没反应」有个解释。PS1 不挂 —— 理由同上。
         *
         * **只能在这一刻认**：Neo Geo 缺 BIOS 的失败在运行时没有任何信号 ——
         * 核心不抛异常，下面的 catch 分支永远走不到（见 `biosHint` 的注释）。
         *
         * 其余机种整个跳过：NES / SFC / GBA 不需要 BIOS，也就不必白读一次存储。
         */
        const wantedBios = biosTypeFor(consoleType);
        if (wantedBios) {
          biosFile = await ensureBios(wantedBios);
          if (biosFile) {
            // 可能刚从站点那份装上 —— 本地已经有的那一档不必重设
            if (!bios[wantedBios]) {
              const info = await getBiosInfo(wantedBios);
              if (info) setBios((prev) => ({ ...prev, [wantedBios]: info }));
            }
          } else if (wantedBios === 'arcade') {
            setBiosHint(await looksLikeNeoGeoRomset(file));
          }
        }
        /*
         * 机种定了，键位也跟着定 —— 用户**没自定义过**的话，NDS 要换成它自己那套
         * （见 lib/keybindings.ts 的 `defaultBindingsFor`：十字键在方向键、A/B/X/Y
         * 在 Z X / A S、肩键在 Q E / R W，和全站那套街机布局完全不同）。
         *
         * ⚠️ 必须在**启动之前**做：`bindingsToRetroArch(this.bindings)` 是 `loadRom`
         * 里一次性写进 RetroArch 配置的，核心起来之后再改就得重载卡带。
         * 也不能靠 `rom.console` 那个 React state —— 它要等这次 `loadRom` 回来才设，
         * 那时候核心已经拿着旧键位起来了。
         *
         * `loadBindings(机种)` 的语义是「存过就用存的那份」，所以真改过键位的人
         * 一个字都不会被冲掉。
         */
        const resolved = loadBindings(consoleType);
        setBindings(resolved);
        controller.setBindings(resolved);

        /*
         * 每 1% 才更新一次 state：几 MB 的核心包会有几百个 chunk，
         * 每个都 setState 会把整个场景重渲染几百次。
         *
         * `total <= 0` 直接不更新，state 停在初值那条「不确定」进度上。
         * 下完（pct 到 100）也退回「不确定」—— 后面还有核心启动那一段，
         * 否则进度条会卡在 100% 一动不动。
         */
        let lastPct = -1;
        await controller.loadRom(
          file,
          canvas,
          (loaded, total) => {
            if (total <= 0) return;
            const pct = Math.floor((loaded / total) * 100);
            if (pct === lastPct) return;
            lastPct = pct;
            setLoading({ ratio: pct >= 100 ? null : loaded / total });
          },
          /*
           * 需要 BIOS 的机种要带上那一份 —— 上面 `ensureBios()` 已经备好了。
           * 没拿到就是 null，照常启动：
           *   · 街机：CPS1 / CPS2 那类本来就不需要，缺了只是 Neo Geo 游戏会静默失败
           *     （那种情况上面已经把 `biosHint` 挂上了）；
           *   · PS1：核心回落 HLE，多数游戏照跑（见 `lib/bios.ts` 的文件头）。
           *
           * 其余机种恒为 null —— `loadRom` 内部按机种自己判断要不要用，传了也会被忽略。
           */
          biosFile,
          /*
           * 上面已经拆过一次的包（含光盘套装的伴生 bin）。不传的话 `loadRom`
           * 会自己再拆一遍 —— 结果一样，但 252 MB 的盘要多解一次。
           */
          prepared
        );
        const loaded = controller.rom;
        setRom(loaded);
        setPaused(false);
        setSaveOpen(false);

        if (loaded) {
          // 换了一盘卡带，存档也要跟着换 —— 一份存档是按 ROM 文件名认的
          setLocalSave(await readSave(loaded.name));

          /*
           * 这盘文件攥在手上：「改完键位重载」靠它重新插一次，不必再回 IndexedDB 取。
           * 本地拖入和从游戏库下载都走这条路，两种来源的重载行为因此完全一致。
           */
          lastRomRef.current = file;

          /*
           * **本地拖入不进历史**（2026-10-12）：历史只记从游戏库点开的游戏 ——
           * 只有那些才带着 id / 封面地址 / 下载地址，本地文件没有可重新下载的地址，
           * 存进去也点不动。所以这里先把「当前是历史里哪一盘」清掉；
           * 从游戏库那条路（loadRemote）会在 loadFile 返回之后把它设回去。
           */
          setActiveId(null);
          /*
           * 当前这盘是不是在线库的哪一款 —— `loadFile` 不认识来源，一律清掉，
           * 由 `loadRemote` 在它返回之后补回来（和 `activeId` 同一套时序）。
           * 本地拖入的这盘因此永远是 null，云端那三样也就不会被写脏。
           */
          setGameId(null);
        }
      } catch (e) {
        /*
         * 屏幕里不显示任何文案，所以失败是「静默」的：
         * 表现为卡带没插上 —— 没画面，电视机继续出雪花。
         *
         * 但日志必须留一条：街机失败最常见的原因就两个 —— romset 版本和核心对不上、
         * 或者 Neo Geo 缺 neogeo.zip —— 少了这条连往哪儿查都不知道。
         */
        console.error('[nesload] 载入失败：', file.name, e);
        /*
         * 「文件不完整」是少数几类**有准话可给**的失败之一（判据见 `lib/chd.ts` /
         * `lib/http.ts`）：屏幕那边照旧出雪花，但至少弹一句「重新载入」，
         * 别让人以为是这盘卡带本身不支持。
         */
        if (e instanceof IncompleteBodyError || e instanceof IncompleteRomError) {
          setToast({ key: 'play.romIncomplete', kind: 'danger' });
        }
        /*
         * 机种认不出（`consoleType` 是 null）时给不出任何准话，只能单独认一次压缩格式 ——
         * 那是最常见的原因：街机 romset 大量以 7z / rar 流通，而 FBNeo 只吃 zip。
         */
        if (consoleType === null) setArchiveHint(await unsupportedArchive(file));
        setRom(null);
        setLocalSave(null);
        setActiveId(null);
        setGameId(null);
        // 没插上就不该留着上一盘的文件 —— 重载拿它去插只会再失败一次
        lastRomRef.current = null;
      } finally {
        loadingRef.current = false;
        setBusy(false);
        setLoading(null);
      }
    },
    [bios, controller, netplay]
  );

  /**
   * 重新插一次卡带。**「改完键位重载」和「读档」两条路共用**这一段。
   *
   * 为什么必须整个重来：RetroArch 的键盘映射只在核心启动时读一次，而 Nostalgist
   * **没有公开的「写配置」接口**（`getCurrentRetroarchConfig` 在 Emulator 上是 private，
   * `restart()` 只会拿旧配置重启核心），所以新键位只能靠重新 launch 带进去。
   *
   * 读档也走它，理由同类：核心只在启动时把卡带记忆读进内存，**换一份存档同样只能靠
   * 重插**（见 `EmulatorController.stageBatterySave`）。带上哪一份由调用方先 stage，
   * 这里只负责重插。
   *
   * 用的文件是 `lastRomRef` 里攥着的那盘，**不再回 IndexedDB 取**（2026-10-12）：
   * 历史现在只存字符串，本地拖入的文件更是没有记录 —— 只有攥着本体才能两种来源通吃。
   *
   * 走的是 loadFile，所以「加入者（房主正在出画面）不接受本地载入」那道闸照样生效：
   * 他本来就插不了卡带，也就无所谓重载。房主不受影响 —— `remotePlaying` 是加入者
   * 才有的状态（只有加入者会收到 `'s'` 消息）。
   */
  const remountRom = useCallback(async () => {
    const file = lastRomRef.current;
    if (!file) return;
    /*
     * loadFile 会把「当前是历史里哪一盘」清掉（它不认识来源，见那边注释），
     * 重载完补回来 —— 否则按一次重载，历史里那行的高亮就没了。
     */
    const keepId = activeId;
    await loadFile(file);
    if (keepId) setActiveId(keepId);
  }, [activeId, loadFile]);

  /**
   * 重载当前卡带 —— 「改完键位要重新插一次卡带」这件事的一键版。
   *
   * 重来之前先把**当前这份电池存档**交给引擎，重插之后核心会在开局读回内存 ——
   * 「改个键位就把进度打回标题画面」就是这么避免的。
   *
   * ⚠️ `saveBattery()` 必须在 `loadFile()` **之前**：实例一换就抓不到旧的那份了。
   *    拿不到（还没在游戏里存过盘）就裸重载 —— 最差回到标题画面，卡带还是插着的。
   */
  const reloadRom = useCallback(async () => {
    if (!controller.isRunning || !lastRomRef.current) return;
    setBusy(true);
    try {
      const sram = await controller.saveBattery();
      if (sram) controller.stageBatterySave(new Uint8Array(await sram.arrayBuffer()));
      await remountRom();
    } catch (e) {
      console.warn('重载卡带失败', e);
    } finally {
      setBusy(false);
    }
  }, [controller, remountRom]);

  /** 读档：把**指定的那一份**存档 stage 好再重插（本机 / 云端两条路共用）。 */
  const reloadWithSave = useCallback(
    async (data: Blob) => {
      /*
       * ⚠️ **先确认攥着文件，再 stage**。反过来写会漏：stage 完 `remountRom` 发现没文件
       *    直接返回，而 stage 进去的那份**还挂在引擎上** —— 下一局（用户换一盘游戏）
       *    就会莫名其妙带着这份存档开局。
       */
      if (!lastRomRef.current) return;
      controller.stageBatterySave(new Uint8Array(await data.arrayBuffer()));
      await remountRom();
    },
    [controller, remountRom]
  );

  /**
   * 收起深链那颗弹窗（`deepLinkOpen` + `deepLinkGame`）。
   *
   * ⚠️ **只收弹窗，地址栏的 `?id=` 不动**（2026-10-14 用户要求，原 2026-10-12 的
   * 「结束时抹参数」已撤）：这个地址要留着分享 / 刷新重开同一款。副作用是刷新
   * 会重新取数 + 重下 ROM —— 那是深链语义的一部分（见 `readGameId` 的注释）。
   *
   * 幂等，所以调用点可以有好几处（取数失败 / 取消 / 整包到手 / `finally` / 防重入早退），
   * 谁先到谁收，后来的都是空操作。从游戏库 / 历史那条路进来（没有深链弹窗）调它
   * 也是空操作。
   */
  const closeDeepLink = useCallback(() => {
    setDeepLinkOpen(false);
    setDeepLinkGame(null);
  }, []);

  /**
   * 从远程地址载入一盘 ROM —— **在线库点选**和**点历史里那一行**共用这一段。
   *
   * 两条路的差别只有「这份字符串描述从哪儿来」：在线库那条由 `romFromGame` 现拼，
   * 历史那条直接从 IndexedDB 里存的记录拿来（`Cartridge extends RemoteRom`，
   * 多带的两个时间戳被 `putCartridge` 逐字段挑掉，不会写脏）。
   * 所以下载、取消、写历史、置高亮这套逻辑只有一份。
   *
   * 走的是和本地拖入同一条 `loadFile`，所以 BIOS 装置、存档槽这些既有逻辑全都自动带上；
   * 文件名必须用库里存的 `romName` —— 街机 FBNeo 拿 zip 文件名认驱动。
   *
   * 下载这段**窗口一直开着**并显示进度条：ROM 整包拉下来之前关掉它，用户就只看到
   * 一片空荡荡的房间，不知道是在下载还是卡住了。拉完再关窗、交给 `loadFile`——
   * 后面核心包的下载进度由电视机屏幕里的进度条接着显示。
   * 从历史点进来也是这一套（历史里只存了地址，一样要下），所以窗口不会被提前关掉。
   *
   * 「窗口」是哪一颗由入口决定：从游戏库 / 历史进来的是**游戏库面板**（`libraryOpen`），
   * 从 `/room?id=` 深链进来的是那颗**只有这一款的独立弹窗**（`deepLinkOpen`）。
   * 两条路都要关，所以下面两处各关一次，多关一次是空操作（`closeDeepLink` 也是幂等的）。
   *
   * **可取消**（2026-10-12）：面板底部那条状态栏上的「取消」就是 abort 这一笔 fetch。
   * 整包几十 MB 的街机 romset 下到一半发现选错了，原先只能等它下完 —— 现在能掐掉。
   * 取消只覆盖**这一段**；`loadFile` 启动核心之后的进度在屏幕里，管不到（Nostalgist
   * 没有公开的取消接口）。
   */
  const loadRemote = useCallback(
    async (rom: RemoteRom) => {
      // 防重入：同一时刻只放一笔进去。真撞上了（深链那条几乎不可能）也顺手把
      // 深链弹窗收掉，免得它挂在那儿一直转
      if (libraryLoadingId !== null) {
        closeDeepLink();
        return;
      }
      setLibraryLoadingId(rom.id);
      setRomDownload({ title: rom.name });
      setLibraryProgress(null);

      /*
       * 一笔下载一个 controller。abort 它 = 同时掐掉所有在飞的请求和响应体流，
       * 分片下载里正在读的那几片随即抛 AbortError ——
       * 整条路径自然收场，不需要额外的「已取消」标志位。
       */
      const controller = new AbortController();
      romAbortRef.current = controller;

      try {
        /*
         * 分片下载（`lib/http.ts` 的 `fetchRomWithProgress`）：Worker 代理一个请求搬不动
         * 几百 MB，PS1 的盘会被截断在几 MB 上。abort 依然有效 —— 每一片的 fetch 都挂同一个
         * signal，取消时在飞的那几片立刻抛 AbortError，循环跟着收场。
         */
        const blob = await fetchRomWithProgress(rom.romUrl, {
          signal: controller.signal,
          onProgress: setLibraryProgress,
        });
        // 整包到手 = 可取消的那一段结束了，后面交给 loadFile（窗口关闭、进度转到屏幕上）
        setRomDownload(null);
        const file = new File([blob], rom.romName, { type: 'application/octet-stream' });
        setLibraryOpen(false);
        /*
         * 深链那颗独立弹窗一起收掉。⚠️ 地址栏的 `?id=` **故意留着**（2026-10-14
         * 用户要求不清了）—— 这个地址要能分享 / 收藏，刷新重开同一款是深链语义。
         * （不是从深链进来的话，弹窗本来就是 null，整个是空操作。）
         */
        closeDeepLink();
        await loadFile(file);

        /*
         * **载入成功才写历史** —— 失败的不进，免得历史里堆一批点不动的死条目。
         * 写的是字符串（名字 / 封面地址 / 下载地址 / 文件名），ROM 本体不落库。
         *
         * 从历史点进来时也走这里：同一盘覆盖写、只刷新 lastPlayedAt，于是它排到最前，
         * 超出 10 条的旧记录被淘汰 —— 历史因此是「最近玩过」而不是「第一次玩过」。
         */
        const meta = await putCartridge(rom);
        await pruneCartridges();
        setLibrary(await listCartridges());
        // loadFile 里先把标记清成了 null（它不认识来源），到这儿才算落定
        if (meta) setActiveId(meta.id);

        /*
         * 记下「当前这盘是库里哪一款」—— 云端历史 / 存档 / 收藏都挂在这个 id 上。
         * 和上面的 `activeId` 是两码事：那个是历史记录那行的 id，这个是 games 表的 id。
         * 在这条路径上它天然是有的（`loadRemote` 只从在线库 / 深链 / 历史进来）。
         */
        setGameId(rom.id);

        /*
         * 云端历史（登录了才写）。
         *
         * ⚠️ **只记在线库的游戏** —— 这里天然成立：这条路径（`loadRemote`）就是
         *    从在线库 / 深链 / 历史点进来的，`rom.id` 一定是个真 id。本地拖入走的是
         *    `loadFile`，根本不经过这儿。
         *
         * **不等它、也不管它成不成功**：历史是锦上添花的东西，写不上（没登录 / 断网）
         * 不该让「游戏已经跑起来了」这件事变成失败。所以 `void` 掉，失败只留一行日志。
         * 用 `.catch` 而不是 `void` 单纯为了消掉 unhandled rejection 警告。
         */
        if (user) {
          void fetch('/api/user/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: rom.id }),
          }).catch((error: unknown) => {
            console.warn('[nesload] 写云端历史失败（不影响本局）：', error);
          });
        }
      } catch (e) {
        // 用户自己掐的：不是故障，只留一行 info，别惊动 console.error
        if (isAbortError(e)) console.info('[nesload] 已取消载入：', rom.name);
        else {
          console.error('[nesload] 从游戏库载入失败：', rom.name, e);
          /*
           * 下载被截断（`IncompleteBodyError`，判据在 `lib/http.ts`）是这条路径上
           * 唯一「重下一遍就能好」的失败 —— 它以前是**完全静默**的：坏文件照样交给
           * 核心，`.chd` 读不到尾部的 map 表，RetroArch 退回主菜单，屏幕上什么都不说。
           */
          if (e instanceof IncompleteBodyError || e instanceof IncompleteRomError) {
            setToast({ key: 'play.romIncomplete', kind: 'danger' });
          }
        }
      } finally {
        /*
         * 只清自己那一笔的把手。正常时序下这里不会有别人（下一盘要等
         * `libraryLoadingId` 复位才点得动），但别留下「把新那笔的把手抹掉」的可能。
         */
        if (romAbortRef.current === controller) romAbortRef.current = null;
        setLibraryLoadingId(null);
        setRomDownload(null);
        setLibraryProgress(null);
        /*
         * 失败 / 被取消时**也得把深链那颗弹窗收掉、参数也摘掉** —— 上面 try 里那次
         * 只覆盖「整包下到手」这条顺路，取消 / 出错走的是这里：那一笔已经不是
         * 「在载入了」，弹窗留着只会一直转，参数留着刷新就会重来一遍。
         * （成功路径上这句是空操作，前面已经关过一次。）
         */
        closeDeepLink();
      }
    },
    [libraryLoadingId, loadFile, closeDeepLink, user]
  );

  /** 在线库那张卡片点下来 —— 把响应形状转成远程载入要的那份描述。 */
  const loadRemoteGame = useCallback(
    (game: LibraryGame) => loadRemote(romFromGame(game, locale)),
    [loadRemote, locale]
  );

  /**
   * 取消正在下载的 ROM（面板底部那条状态栏上的按钮）。
   * 空操作很安全：没有下载在飞时 `romAbortRef.current` 就是 null。
   */
  const cancelRemoteLoad = useCallback(() => {
    romAbortRef.current?.abort();
  }, []);

  /**
   * 取消深链这一整轮：**先把两段请求都真掐断，再收拾现场**。
   *
   * 弹窗上那颗「取消」和 `Esc` 都走这里。深链这条路上前后有两段下载，可能同时活着：
   * ① 「要一条数据」（`deepLinkAbortRef`，毫秒级 —— 弹窗刚立起来、还在转 loading 的那几帧
   * 用户就能点到取消）；② 「下 ROM 整包」（`cancelRemoteLoad`）。两个都 abort，
   * 只掐一个会留下另一段在后台跑（尤其 ①：不掐的话它回来还会 `loadRemoteGame`，
   * 于是**用户点了取消，游戏却自己开始下**）。
   *
   * 空操作很安全：两段都没在飞时两个 ref 都是 null。
   */
  const cancelDeepLink = useCallback(() => {
    deepLinkAbortRef.current?.abort();
    cancelRemoteLoad();
    closeDeepLink();
  }, [cancelRemoteLoad, closeDeepLink]);

  /* ---------------- 卡带列表 ---------------- */

  useEffect(() => {
    // 首屏把上次留下的卡带捞出来。异步读，所以不会触发 set-state-in-effect。
    let cancelled = false;
    void listCartridges().then((items) => {
      if (!cancelled) setLibrary(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const removeFromLibrary = useCallback(async (id: string) => {
    await removeCartridge(id);
    setLibrary(await listCartridges());
    setActiveId((current) => (current === id ? null : current));
  }, []);

  /* ---------------- 控制 ---------------- */

  const eject = useCallback(async () => {
    await controller.exit();
    setRom(null);
    setPaused(false);
    setLocalSave(null);
    setCloudSave(null);
    setSaveOpen(false);
    setActiveId(null);
    setGameId(null);
    // 卡带取出来了，攥着的那份文件也一起放掉（几十 MB 的街机 romset 别白占着）
    lastRomRef.current = null;

    /*
     * 屏幕上那一下「显像管关机」（画面收成一条线再灭掉，见 globals.css）。
     *
     * **只在屏幕真的会变黑时才放**：加入者那条路（房主的画面正推过来，本机这盘卡带
     * 是被上面那个 effect 自动弹掉的）屏幕上马上就有新画面，再闪一条亮线只会像故障。
     * 用 `netplay.current` 而不是 `netplayState`，省得把这个回调的依赖搅大
     * （和 loadFile 里那道「房主在出画面就不接受本地载入」的闸同一个理由）。
     *
     * 定时器连点也安全：清掉上一支再挂新的，不会出现「第二次弹出被第一次的定时器提前收掉」。
     */
    if (!netplay.current.remotePlaying) {
      setCrtOff(true);
      if (crtOffTimer.current !== null) clearTimeout(crtOffTimer.current);
      crtOffTimer.current = setTimeout(() => {
        setCrtOff(false);
        crtOffTimer.current = null;
      }, CRT_OFF_MS);
    }
  }, [controller, netplay]);

  /** 卸载时把那支定时器还掉（否则动画还没走完就换页，会在已卸载的组件上 setState）。 */
  useEffect(
    () => () => {
      if (crtOffTimer.current !== null) clearTimeout(crtOffTimer.current);
    },
    []
  );

  const togglePause = useCallback(async () => {
    if (!controller.isRunning) return;
    await controller.togglePause();
    setPaused(controller.isPaused);
    /*
     * 把暂停说给对方。加入者手上的是一条 `<video>`，房主一暂停它就冻在最后一帧 ——
     * 那个样子和「卡死 / 掉线」完全一样，而他本机没有模拟器、也没有那颗暂停钮
     * （面板那排因为没卡带全是灰的），不告诉他就只能对着镜头猜。
     *
     * 加入者调到这里是空操作：没卡带时上面那句已经 return 了，就算调到了，
     * 控制器也只在房主身份下广播（见 sendSession）。
     */
    netplay.announcePaused(controller.isPaused);
  }, [controller, netplay]);

  const reset = useCallback(async () => {
    if (!controller.isRunning) return;
    await controller.reset();
    setPaused(false);
    // 重载会把暂停一并解掉，对方屏幕上那层 PAUSED 也得跟着撤
    netplay.announcePaused(false);
  }, [controller, netplay]);

  /*
   * 存档 / 读档都必须把 setBusy(false) 放进 finally。
   * busy 是面板四个按钮共用的禁用开关 —— 只要有一条路径漏了复位，
   * 整排按钮（包括「弹出」）就会永久变灰，表现就是「点了弹出没反应，游戏还在跑」。
   */

  /**
   * 上传一份存档到云端。
   *
   * 单独抽出来是因为它有**几个早退条件**（没登录 / 没有 game / 超上限），
   * 塞在 saveGame 里会让那个函数变成一团。这里自己 catch 掉所有错误，
   * 调用方 `void` 它就完事。
   *
   * ⚠️ **声明位置在 saveGame 之前**：`saveGame` 的 useCallback 依赖里引用了它。
   *    `const` 有暂时性死区，虽然回调要等调用时才求值、运行期没问题，
   *    但 eslint 的 react-hooks/immutability 会在**编译期**判「访问了还没声明的变量」。
   */
  const uploadCloudSave = useCallback(
    async (gameId: string | null, romName: string, blob: Blob) => {
      if (!gameId) return;
      /*
       * ⚠️ **发送前先量体积**（2026-10-15 加）：Cloudflare 的请求体硬限是 100MB，
       * 超了**在边缘**就回 413、请求根本进不到函数 —— 白传一趟，而且界面上看不出原因
       * （这里本来就没有显示错误的位子）。电池存档正常只有 KB~MB 级，走到这一步
       * 基本意味着出了别的问题，量一下就能省掉一趟白传。
       */
      if (blob.size > MAX_SAVE_BYTES) {
        console.warn(
          `[nesload] 存档 ${blob.size} 字节超过云端上限 ${MAX_SAVE_BYTES}，只留在本机`
        );
        return;
      }
      try {
        const form = new FormData();
        form.append('gameId', gameId);
        form.append('romName', romName);
        form.append('title', rom?.name ?? romName);
        /*
         * 那个文件得有个名字 —— R2 那边不 care，但 FormData 的 `File` 需要一个名字。
         * 用 `.srm` 是为了和本机那份下载下来的文件同名（用户导出 / 导入时认得）。
         */
        form.append('state', blob, `${romName}.srm`);
        const res = await fetch('/api/user/saves', { method: 'POST', body: form });
        if (!res.ok) throw new Error(String(res.status));
      } catch (error) {
        console.warn('[nesload] 云端存档上传失败（本机那份还在）：', error);
      }
    },
    [rom]
  );

  /**
   * 存档 = 把游戏在存盘菜单里写的那份**卡带记忆**抓下来，本机存一份、云端再传一份。
   *
   * ⚠️ **一款只有一份**，后面覆盖前面（`lib/saves.ts` 的主键就是 ROM 文件名）——
   * 这也是整个存档从「快照槽位制」换成电池存档的直接结果。
   */
  const saveGame = useCallback(async () => {
    if (!controller.isRunning || !rom) return;
    setBusy(true);
    try {
      const blob = await controller.saveBattery();
      /*
       * `null` = 玩家还没在游戏里存过盘，核心那边根本没有卡带记忆可拿。
       * 这**不是错误**，而面板上也没有显示错误的位子（存档列表是离开游戏画面才打开的
       * 面板，弹提示会挡着游戏），所以只留一行日志。
       */
      if (!blob) {
        console.warn('[nesload] 还没有存档可拿：先在游戏里存一次盘');
        return;
      }

      // 先落本机；IndexedDB 用不了（隐私模式等）时退回下载 .srm 文件，
      // 否则这一下存档就白按了。
      if (await writeSave(rom.name, blob)) setLocalSave(await readSave(rom.name));
      else await controller.downloadBattery(blob);

      /*
       * 云端那份（登录了才传）。**和本机那份并存**，不是二选一 ——
       * 本机那份保证「断网 / 不登录也能存」，云端那份保证「换个浏览器还在」。
       *
       * ⚠️ **用同一块 blob**：`writeSave` 已经把它写进 IndexedDB 了，这里再读一次
       *    是白费（刚抓下来的这块钱就在手上）。所以云上传放在本机写完**之后**。
       *
       * ⚠️ **失败不打断**：云端传不上去（没登录 / 断网 / 超上限）时本机那份还在，
       *    用户的存档没有丢。`uploadCloudSave` 自己 catch。
       *
       * romName 必须带上：云端也按 ROM 文件名分组（和 lib/saves.ts 一致）。
       */
      if (user) void uploadCloudSave(game, rom.name, blob);

      // 状态要跟着刷新 —— 云端那份会立刻出现在「打开存档」里
      setCloudSave(await listCloudSaves(rom.name));
    } catch (e) {
      console.warn('存档失败', e);
    } finally {
      setBusy(false);
    }
  }, [controller, rom, user, game, uploadCloudSave]);

  /**
   * 打开存档列表。**先把面板弹出来、再取数**（2026-10-13 改）。
   *
   * 以前是「取完、有东西才开」—— 点了没存档时按钮看着像坏的。现在立刻开、
   * 里面转圈，两边都空就明说一句「还没有存档」。每次重拉一遍，免得时间是过期的。
   */
  const openLoad = useCallback(async () => {
    if (!controller.isRunning || !rom) return;
    setSaveOpen(true);
    setSavesLoading(true);
    try {
      // 本机 + 云端**并行**拉：两边互不依赖，串着等是白等
      const [local, cloud] = await Promise.all([
        readSave(rom.name),
        listCloudSaves(rom.name),
      ]);
      setLocalSave(local);
      setCloudSave(cloud);
    } catch (e) {
      // 拉不到不该把面板卡在转圈上 —— 退化成「空」也是一种可用的状态
      console.warn('读取存档失败', e);
    } finally {
      setSavesLoading(false);
    }
  }, [controller, rom]);

  /**
   * 读**本机**那一份存档。
   *
   * 读档 = 带着它重新插一次卡带（见 `reloadWithSave`）—— 不是在本局上打补丁。
   */
  const loadLocalSave = useCallback(async () => {
    if (!controller.isRunning || !localSave) return;
    setBusy(true);
    try {
      await reloadWithSave(localSave.data);
      setSaveOpen(false);
    } catch (e) {
      console.warn('读档失败', e);
    } finally {
      setBusy(false);
    }
  }, [controller, localSave, reloadWithSave]);

  /**
   * 读**云端**那一份存档：从本站接口取字节 → 带着它重插卡带。
   *
   * ⚠️ **字节必须经本站代理，不能让浏览器直连 R2**（2026-10-13 改）。
   * 以前这里拿服务端回的 R2 公网地址再 `fetch(url)`，实测报
   * `TypeError: Failed to fetch` —— 浏览器**跨域** `fetch` 会被桶的 CORS 挡掉。
   * ROM 那条路早就因为同一个理由走了服务端回源（见 `/api/games/[id]/rom` 的注释），
   * 存档这里当初漏了。现在 GET 直接把字节流回来，一次请求到底。
   */
  const loadCloudSave = useCallback(async () => {
    if (!controller.isRunning || !cloudSave) return;
    setBusy(true);
    setLoadingCloud(true);
    try {
      // 顺带做归属校验 —— 不是自己的那一份服务端会回 404
      const res = await fetch(`/api/user/saves/${encodeURIComponent(cloudSave.id)}`);
      if (!res.ok) throw new Error(String(res.status));

      await reloadWithSave(await res.blob());
      setSaveOpen(false);
    } catch (e) {
      console.warn('云端读档失败', e);
    } finally {
      setBusy(false);
      setLoadingCloud(false);
    }
  }, [controller, cloudSave, reloadWithSave]);

  /** 删云端那一份。行和 R2 对象一起清（服务端负责），这里只更新状态。 */
  const removeCloudSave = useCallback(async () => {
    if (!cloudSave) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/user/saves/${encodeURIComponent(cloudSave.id)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error(String(res.status));
      setCloudSave(await listCloudSaves(rom?.name ?? cloudSave.romName));
    } catch (e) {
      console.warn('删云端存档失败', e);
    } finally {
      setBusy(false);
    }
  }, [rom, cloudSave]);

  /** 档位由 controller 夹紧后返回，界面上显示的永远是真正生效的那一档 */
  const changeVolume = useCallback(
    (level: number) => {
      setVolume(controller.setVolume(level));
    },
    [controller]
  );

  /**
   * 掌机上虚拟键的落点（`HandheldConsole` 的 `onButton`）。
   *
   * 和键盘那条路**合流**：单机 / 房主 → 打进本机模拟器（玩家 1）；
   * 加入者 → 转发给房主（他本机没有模拟器 —— 见下面那段键盘转发的注释，
   * 两者是同一个约定：**加入者的输入由房主注入成 2P**）。
   *
   * 玩家号只可能是 1：虚拟键代表的是**手上这台机器的 1P**。加入者在游戏里其实是 2P，
   * 那个号位由房主按自己的表决定，和这里无关。
   *
   * 依赖里带 `netplayState.role`：角色一变，这个回调就换一份，
   * 虚拟键那边用 ref 转了一手（见 HandheldConsole），所以不会打断正按着的键。
   */
  const handleVirtualButton = useCallback(
    (button: ButtonName, down: boolean) => {
      if (netplayState.role === 'guest') {
        netplay.sendButton(button, down);
        return;
      }
      controller.pressButton(button, 1, down);
    },
    [controller, netplay, netplayState.role]
  );

  /* ---------------- 联机 ---------------- */

  /*
   * 三个操作都不往外抛：失败原因由 netplay 写进 state.error，界面自己读。
   * busy 一律放 finally —— 和存档那几处同一个理由，漏一条按钮就永久变灰。
   */

  const createRoom = useCallback(async () => {
    setNetplayBusy(true);
    try {
      await netplay.host(netplayMode);
    } catch (e) {
      console.warn('创建房间失败', e);
    } finally {
      setNetplayBusy(false);
    }
  }, [netplay, netplayMode]);

  const joinRoom = useCallback(
    async (code: string) => {
      setNetplayBusy(true);
      try {
        await netplay.join(code, netplayMode);
      } catch (e) {
        console.warn('加入房间失败', e);
      } finally {
        setNetplayBusy(false);
      }
    },
    [netplay, netplayMode]
  );

  const leaveRoom = useCallback(async () => {
    setNetplayBusy(true);
    try {
      await netplay.leave();
    } catch (e) {
      console.warn('离开房间失败', e);
    } finally {
      setNetplayBusy(false);
    }
  }, [netplay]);

  /* ---------------- 分享链接进来的房间邀请 ---------------- */

  /*
   * 首屏读一次地址栏里的 `?room=XXXX`。读到就**先把参数抹掉**再亮确认框：
   * 抹晚了用户一刷新就会再弹一遍（见 clearInviteCode 的注释）。
   *
   * setState 塞进微任务：直接在 effect 体里同步调用会被 `react-hooks/set-state-in-effect`
   * 拦下 —— 同文件里其他几处用 `.then/.catch` 是同一个理由。
   */
  useEffect(() => {
    const code = readInviteCode();
    if (!code) return;
    clearInviteCode();
    queueMicrotask(() => setPendingRoom(code));
  }, []);

  /**
   * 确认加入：开面板 + 预填码 + **直接连**。
   *
   * 点一次就够了 —— 确认框上那个「加入」已经是一次明确的表态，
   * 再让用户到面板里点一次「加入」是重复动作。预填的码留在输入框里是为了
   * **连不上时**（房主已经走了、握手超时）用户不用重新输一遍。
   */
  const acceptInvite = useCallback(() => {
    if (!pendingRoom) return;
    const code = pendingRoom;
    setPendingRoom(null);
    setJoinPrefill(code);
    setNetplayOpen(true);
    void joinRoom(code);
  }, [pendingRoom, joinRoom]);

  const dismissInvite = useCallback(() => setPendingRoom(null), []);

  /* ---------------- 游戏详情页「开始游戏」带过来的 `?id=` ---------------- */

  /*
   * `loadRemoteGame` 的**最新一份**。
   *
   * 下面那个深链 effect 只在挂载时跑一次（它不该因为别的原因重跑），而它要调用的
   * `loadRemoteGame` 会随 `libraryLoadingId` 变化换身份（见 `loadRemote` 的依赖数组）。
   * 直接在闭包里捕获的话，异步回来的那一刻用的还是**第一帧**那份 ——
   * 那份眼里的 `libraryLoadingId` 永远是 null，防重入的闸就形同虚设。
   * 用 ref 拿最新的一份，顺带让那个 effect 的依赖数组可以干干净净地空着。
   */
  const loadRemoteGameRef = useRef(loadRemoteGame);
  useEffect(() => {
    loadRemoteGameRef.current = loadRemoteGame;
  }, [loadRemoteGame]);

  /*
   * 服务端递进来的深链数据（`serverGame` prop）。照 `loadRemoteGameRef` 同一个理由走 ref：
   * 下面的深链 effect 依赖数组刻意只有 `closeDeepLink`（挂载时跑一次），而 props 每次
   * 渲染都可能是新对象 —— 直接进依赖会把「跑一次」变成「跑很多次」，深链就重复下载了。
   */
  const serverGameRef = useRef(serverGame);
  useEffect(() => {
    serverGameRef.current = serverGame;
  });

  /**
   * `/room?id=<游戏 id>` —— 游戏详情页那颗「开始游戏」点过来就是这个地址。
   *
   * 流程：读地址栏 → **立刻立起 `deepLinkOpen` 那颗独立弹窗**（里面先转 loading）
   * → 拿这一款的数据 → 到了就填进去（封面 + 名字 + 下载进度 + 取消）
   * 并照游戏库那套载入（`loadRemoteGame`：下载进度、取消、写历史全都自动带上），
   * 没有就在房间顶上弹一句「找不到这个游戏」、弹窗一并收掉。
   *
   * 「拿数据」有两条路（2026-10-14 起，用户要求「服务端已经获取过游戏数据了，
   * 弹窗里面应该能直接拿到，不用客户端再调一次」）：
   * ① **首选：服务端递进来的 `serverGame`**（`/room` 页面把 meta 那一趟查到的结果
   *    直接当 props 递下来，见 `serverGameRef` 那段）—— 数据在挂载那一刻就在手上，
   *    弹窗开起来就是封面和名字，取数请求整个省掉；
   * ② **兜底：`GET /api/games/<id>`** —— `serverGame` 是 `undefined`（服务端查询抛了
   *    异常）时才走，行为和 2026-10-12 原版完全一致。地址上没有 `?id=` 时整个 effect
   *    早退，两条路都不走。
   *
   * ⚠️ **弹窗不能等数据**（2026-10-12 用户要求，原话「判断有id弹窗就出现 加载中loading动画」）：
   * 一开始是先 fetch、数据回来才开窗，于是从详情页点「开始游戏」过来的头几百毫秒是
   * 一间什么也没发生的房间 —— 看着像点了没反应。现在「有 id」本身就立刻开窗。
   *
   * ⚠️ **参数读到就留着、永不抹**（2026-10-14 用户要求「加载后不要清除 url 上的 id」；
   * 原 2026-10-12 那版「这一轮结束再抹」已撤）：载入进行中按 F5 重开同一款、
   * 载入完成后按 F5 也重开同一款 —— 地址要能分享 / 收藏，服务端 meta 还靠它出标题。
   *
   * 库里没有这一款（后台删了、或者链接是从别处抄来的）时只弹一句提示、不载入 ——
   * 这是用户明确要求的那条「没有提示找不到」。⚠️ 这时**必须 `closeDeepLink()`**：
   * 弹窗已经先行立起来了，不收掉就会永远停在那条 loading 动画上。
   *
   * ⚠️ 2026-10-12 改：原先这里开的是**整个游戏库面板**（`setLibraryOpen(true)`），
   * 于是「开始游戏」会先把十几张封面摊开、再从里面把这一张捞出来载入 ——
   * 用户只想玩那一款，却先看见一整个库闪一下。现在只开这一款的小弹窗。
   */
  useEffect(() => {
    const gameId = readGameId();
    if (!gameId) return;

    const controller = new AbortController();
    deepLinkAbortRef.current = controller;
    let alive = true;

    /*
     * 有 id 就**立刻**把弹窗立起来，数据后面再填（这是这个 effect 存在的第一件事）。
     *
     * 为什么写成微任务而不是直接 `setDeepLinkOpen(true)`：effect 里同步 setState 会撞上
     * React 编译器那条 `react-hooks/set-state-in-effect`（本仓库既有的 error 里就有它）。
     * 推到微任务**不影响观感** —— 它跑在浏览器绘制之前，用户看到的仍然是「点进去弹窗就在」，
     * 而不是原先那样先空着等一次网络往返。
     */
    void Promise.resolve().then(() => {
      if (alive) setDeepLinkOpen(true);
    });

    /*
     * 路 ①：服务端已经把这一款查好了，直接用，不打接口（2026-10-14 用户要求
     * 「服务端已经获取过游戏数据了，弹窗里面应该能直接拿到，不用客户端再调一次」）。
     *
     * 一样推到微任务（理由同上，也让「弹窗先立起来」和「数据填进去」在同一次绘制前
     * 都落定）—— 于是从详情页点过来，弹窗出现的第一帧就是封面和名字，没有 loading 骨架。
     * `null` = 服务端确认库里没有，走下面 404 分支的等价物：收弹窗 + 弹「找不到」，
     * 不用再打一次接口去确认同一件事。这条路上没有取数请求，`deepLinkAbortRef`
     * 不用立 —— `cancelDeepLink` 里的 `cancelRemoteLoad()` 已覆盖 ROM 那段下载的取消。
     */
    const serverGame = serverGameRef.current;
    if (serverGame !== undefined) {
      void Promise.resolve().then(() => {
        if (!alive) return;
        if (!serverGame) {
          closeDeepLink();
          setToast({ key: 'deepLink.notFound', kind: 'danger' });
          return;
        }
        setDeepLinkGame(serverGame);
        void loadRemoteGameRef.current(serverGame);
      });
      return () => {
        alive = false;
      };
    }

    /* 路 ②：服务端没给（查询抛了异常）—— 打接口兜底，2026-10-12 的老路原样保留。
       用的还是 effect 顶部立好的那个 controller（path ① 早退，它空转无害）。 */

    void (async () => {
      try {
        const res = await fetch(`/api/games/${encodeURIComponent(gameId)}`, {
          signal: controller.signal,
        });
        const game = res.ok ? ((await res.json()) as { game?: LibraryGame }).game : undefined;
        /*
         * 卸载（换页 / 热更新）之后别再往下走，尤其别在卸载后 setState；
         * `signal.aborted` 是「用户在 loading 那几百毫秒里就点了取消」——
         * 这时**绝不能**再走到下面的 `loadRemoteGame`，否则用户刚取消，游戏自己开始下。
         */
        if (!alive || controller.signal.aborted) return;
        if (!game) {
          closeDeepLink();
          setToast({ key: 'deepLink.notFound', kind: 'danger' });
          return;
        }
        setDeepLinkGame(game);
        void loadRemoteGameRef.current(game);
      } catch (error) {
        // 用户自己掐的（abort）：不是故障，静悄悄收场就行
        if (isAbortError(error)) return;
        console.error('[nesload] 深链载入失败：', gameId, error);
        if (alive) {
          closeDeepLink();
          setToast({ key: 'deepLink.notFound', kind: 'danger' });
        }
      } finally {
        // 只清自己那一笔的把手（和 romAbortRef 那边同一个理由）
        if (deepLinkAbortRef.current === controller) deepLinkAbortRef.current = null;
      }
    })();

    return () => {
      alive = false;
      // 换页 / 热更新：还在飞的那一笔也掐掉，别让它回来往已卸载的组件上 setState
      controller.abort();
    };
  }, [closeDeepLink]);

  /**
   * 那枚提示自己退场。几秒后收掉 —— 它只回答「连上了没有」，
   * 看完就不该继续占着房间（要复查还有右侧那颗联机钮和面板）。
   *
   * 和 NetplayPanel 里「已复制」那枚同一套路：存的是内容本身，内容一变就重新计时。
   * 「重新连接」时上一条已经在掉线那一刻被清掉了（见 netplay 的 onState），
   * 所以这里不会出现「新提示刚冒出来就被上一个计时器收走」。
   */
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  /**
   * 房主：插上卡带就把画面推给对方。
   *
   * 依赖里带 `role` 是为了覆盖「先插卡带、后开房」——开房那一刻 role 才变成 host，
   * 这个 effect 会重跑一遍、把流建起来。反过来退房（role 变 null）时走清理。
   *
   * 依赖里带 `streamQuality` 是为了**换档**：帧率是 `captureStream(fps)` 的建流参数，
   * 事后改不了，所以换档必须重建整条流 —— 也就是「先按老样子收掉、再按新帧率建一条」。
   * 正常情况下换不了：档位选择器只在没进房间时显示（见 NetplayPanel）。
   */
  useEffect(() => {
    if (netplayState.role !== 'host' || !rom) return;

    const stream = createCaptureStream(canvasRef.current, captureFpsFor(streamQuality));
    if (!stream) return;

    netplay.publishStream(stream, streamQuality);
    netplay.announceGame({ name: rom.name, console: rom.console });

    /*
     * 声音可能迟到：RetroArch 的 AudioContext 是核心启动时才建的，抓流那一刻
     * 音频节点有可能还没接到 destination 上，流里就只有画面。这里补几次 ——
     * 拿到音频轨就塞进**同一条**流再 add 一遍（Trystero 会跳过已在连接里的轨道，
     * 画面不会被推两遍）。
     */
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const audio = getAudioTrack();
      if (audio) {
        stream.addTrack(audio);
        netplay.refreshStream();
      }
      if (audio || tries >= AUDIO_RETRY_LIMIT) clearInterval(timer);
    }, 500);

    return () => {
      clearInterval(timer);
      // 先报「没在玩」再收流：加入者收到就会把视频摘掉，不会冻在最后一帧上
      netplay.announceGame(null);
      netplay.unpublishStream();
    };
  }, [rom, netplayState.role, netplay, streamQuality]);

  /**
   * 加入者：房主一出画面，就把本机那盘卡带弹掉。
   *
   * 一台机器上不能同时有「本地模拟器」和「房主的画面」两个画面源；
   * 而且加入者此刻按的键是发给房主的，本地那个模拟器只会看到一半的输入。
   */
  useEffect(() => {
    if (!netplayState.remotePlaying || !controller.isRunning) return;
    void eject();
  }, [netplayState.remotePlaying, controller, eject]);

  const handleDropFile = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setFileOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile]
  );

  /* ---------------- 主题 / 全屏 ---------------- */

  /**
   * 写吊灯的开关。**DOM 属性是唯一真相**：先写 <html data-lamp>，再同步 React 那份
   * （只为 aria）。反过来的话，连续点两下可能因为 state 批处理丢掉一次翻转。
   */
  const applyLamp = useCallback((next: boolean) => {
    document.documentElement.dataset.lamp = next ? 'on' : 'off';
    setLampOn(next);
    try {
      localStorage.setItem(LAMP_KEY, next ? 'on' : 'off');
    } catch {
      // 隐私模式下写不进去，忽略即可
    }
  }, []);

  /**
   * 主题过渡类的摘除定时器。
   *
   * 用 ref 不用 state —— 它一变就要重渲染，而这个值跟渲染没有任何关系。
   */
  const themeFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 主题的**真相不在这里**：首屏由 layout 的内联脚本写到 `<html data-theme>`，
   * 钮上露太阳还是月亮交给 CSS 按属性切（见 globals.css 的 `.theme-toggle`）。
   * 下面那次 `setTheme` 只喂 title / aria-label，见上面那份 state 的注释。
   *
   * **吊灯跟着主题走**：切白天自动关灯、切夜晚自动开灯（用户要求）。
   * 手动点灯只是**临时覆盖** —— 下次切主题、或者刷新页面（首屏脚本按主题决定）
   * 就又回到主题说了算。
   *
   * **切换时有一层「天光」动画**（2026-10-10 加）：新的一帧从左上角用一个圆推开。
   * 走 View Transitions API，不支持才退回整屏颜色淡入 —— 见下面那两分支。
   */
  const applyTheme = useCallback(
    (next: Theme) => {
      const root = document.documentElement;

      /** 真正落主题。两条路径都走它 —— View Transition 那条要把它塞进回调里。 */
      const commit = () => {
        saveTheme(next);
        setTheme(next);
        applyLamp(next === 'dark');
      };

      /*
       * 首选 View Transitions：浏览器把旧的一帧冻成快照，新的一帧从左上角用一个圆
       * 推出去（`::view-transition-*` 那几条在 globals.css），观感就是「光从左上角
       * 漫过来」。这样**不用在动画中途改主题**，也不会出现一整屏纯色。
       *
       * 回调里只改 DOM 属性 + 两次**纯文案**的 setState（`setTheme` 喂 title、
       * `applyLamp` 喂 aria）：快照是在回调（及其返回的 promise）结束后立刻拍的，
       * 重渲染跑在快照之后也无所谓，画面和快照一模一样。
       */
      if (typeof document.startViewTransition === 'function') {
        document.startViewTransition(commit);
      } else {
        /*
         * 兜底（老 Firefox 等）：整屏颜色交叉淡入。
         *
         * 顺序是「加类 → 强制算一次样式 → 再改属性」：中间那步不能省。
         * 少了它，浏览器会把「加类」和「改 data-theme」并进同一次样式计算，
         * 于是过渡属性在**前一份**样式里根本不存在 —— 直接跳过去，看不到过渡。
         * 读一下 offsetHeight 就够，代价是一次同步布局，而这是点击触发的，无所谓。
         */
        root.classList.add('theme-fading');
        void root.offsetHeight;
        commit();

        /*
         * 连点（白天→夜晚→白天）时**重置**定时器而不是叠加：
         * 否则第一下那个定时器会在第二下过渡还没走完时把类摘掉，后半程直接跳。
         */
        if (themeFadeTimer.current !== null) clearTimeout(themeFadeTimer.current);
        themeFadeTimer.current = setTimeout(() => {
          root.classList.remove('theme-fading');
          themeFadeTimer.current = null;
        }, THEME_FADE_MS);
      }

    },
    [applyLamp]
  );

  /**
   * 主题钮：读 DOM 属性取当前值再翻过来（白天 ⇄ 夜晚）。
   *
   * 和 `toggleLamp` 同一个写法 —— `<html data-theme>` 是唯一真相（首屏脚本写的），
   * 所以不依赖 React 那份 state，连点两下也不会因为 state 批处理丢掉一次翻转。
   *
   * 属性缺失（理论上不会，首屏脚本必写）时按「当前是夜晚」处理 —— 和 state 的
   * 默认值一致，翻过去就是白天。
   */
  const toggleTheme = useCallback(() => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  }, [applyTheme]);

  /** 点灯：把当前状态翻过来（读的是 DOM 属性，和上面同一份真相） */
  const toggleLamp = useCallback(() => {
    applyLamp(document.documentElement.dataset.lamp !== 'on');
  }, [applyLamp]);

  /**
   * 写简洁模式。和 `applyLamp` 一模一样的顺序：**先写 DOM 属性再同步 React**
   * （反过来的话，连点两下可能因为 state 批处理丢掉一次翻转）。
   *
   * 真正藏东西的是 CSS（`globals.css` 里 `:root[data-simple='on']` 那几条），
   * 这里一个组件都不卸载 —— 和季节四套 `<svg>` 留在 DOM 里同一个理由：
   * 状态在属性上，React 不持有「藏了谁」。
   */
  const applySimple = useCallback((next: boolean) => {
    document.documentElement.dataset.simple = next ? 'on' : 'off';
    setSimple(next);
    try {
      localStorage.setItem(SIMPLE_KEY, next ? 'on' : 'off');
    } catch {
      // 隐私模式下写不进去，忽略即可
    }
  }, []);

  const toggleSimple = useCallback(() => {
    applySimple(document.documentElement.dataset.simple !== 'on');
  }, [applySimple]);

  /**
   * 把电视机尺寸设到某一档（大 / 中 / 小）。
   *
   * 和 `applySimple` 同一套路：**先写 DOM 属性、再同步 React** —— `<html data-tv>`
   * 是唯一真相，React 那份只为了那颗钮的 aria。属性是唯一真相，所以这里不必
   * 「读当前值再算下一档」，直接落目标档即可（选择器里三档各给一个**占比**，见 globals.css
   * 顶部「档位是占比」那段 —— 尺寸还要按窗口算，所以档位本身只能是个比例）。
   *
   * 尺寸本身一个字都不用在这里改：它是 globals.css 里一组跟着 `data-tv` 走的 CSS 变量
   * （屏幕 / 机身 / 底座 / 桌面宽 / 灯线长度）。窗户、挂画、桌子、地板都是**锚在机身
   * 上**的，跟着走即可 —— 换档只需要动这一处属性。**拉窗口也不用管**：那条链整个是 CSS
   * 算的（`--tv-fit-w`），React 和 JS 都不参与。
   *
   * **正在玩的时候换档也不用重插卡带**：核心用 ResizeObserver 盯着 canvas 元素，
   * 尺寸一变就按 `contentRect × devicePixelRatio` 重设后备存储
   * （`RPE.observer=new ResizeObserver(...)` + `observer.observe(Module.canvas)`，
   * 见 public/cores/*.js），所以画面会自己重新量一遍，不会停在旧尺寸上被拉伸。
   */
  const applyTvSize = useCallback((next: TvSize) => {
    document.documentElement.dataset.tv = next;
    setTvSize(next);
    try {
      localStorage.setItem(TV_KEY, next);
    } catch {
      // 隐私模式下写不进去，忽略即可
    }
  }, []);

  /**
   * 换窗外的季节：切到下一季（春→夏→秋→冬→春）。
   *
   * 和 `toggleLamp` 一样**读 DOM 属性取当前值** —— `<html data-season>` 是唯一真相，
   * React 不持有季节（首屏由 layout.tsx 的内联脚本按农历写，见 lib/season.ts）。
   * 所以这里连 state 都不需要：按钮的文案是固定的，界面别处也不显示季节。
   *
   * **只改当次会话，不落盘** —— 手动选的季节是临时看看，刷新要回到按农历算的那一季。
   * 所以这里**不写 localStorage**（和主题 / 吊灯不同，那两个是要记住的偏好）。
   *
   * 和主题**无关**：季节只看农历 + 手动，切主题不会把它重置掉
   * （雪夜、晴冬都能有，屋里开不开灯是另一回事）。
   */
  const cycleSeason = useCallback(() => {
    const current = document.documentElement.dataset.season;
    const next = nextSeason(isSeason(current) ? current : 'winter');
    document.documentElement.dataset.season = next;
  }, []);

  /**
   * 点中地板上那根逗猫棒：抽一只猫，让它从桌子左边那摞书后面探出来。
   *
   * 已经在演的时候再点一次 = **换一只重演**：`seq` 变 → `TvCat` 整个重挂 →
   * 两段 CSS 动画从头跑。所以要先把上一个定时器清掉再重新计时，否则第二只猫
   * 会被第一只那个到点的定时器提前收走。
   *
   * 品种在**事件处理函数里**抽、不写进 `setCat` 的更新函数：更新函数在严格模式下
   * 会被调两次，而洗牌袋是个 ref（有副作用的东西），重放一次就白吃掉两只猫。
   */
  const pokeCat = useCallback(() => {
    const breed = nextCatBreed(catBagRef.current, catBreedRef.current);
    catBreedRef.current = breed;
    catSeqRef.current += 1;
    setCat({ breed, seq: catSeqRef.current });

    if (catTimerRef.current !== null) window.clearTimeout(catTimerRef.current);
    catTimerRef.current = window.setTimeout(() => {
      catTimerRef.current = null;
      setCat(null);
    }, POKE_CAT_MS);
  }, []);

  /**
   * 摇一段新的兜底音、换上去、放起来。**每次点都会重摇** —— 用户要的就是
   * 「每次点击都不一样」，所以这里不重用上一段，也不缓存。
   *
   * 换 `src` 是直接改 DOM 不走 React：JSX 里那个 `src` 是**常量**，React 只在自己那份
   * props 变了才会重写属性，所以这次改写不会被下一次重渲染顶掉（包括 `onEnded` 那次）。
   * 哪天有人把它改成动态的，这里就会被打回原样 —— 到时候得改成 state。
   */
  const playFallback = useCallback((audio: HTMLAudioElement) => {
    const url = chiptuneUrl();
    if (!url) {
      console.warn('[mp4] 兜底音源没合成出来，这次就不放了');
      setMp4Playing(false);
      return;
    }

    const previous = mp4UrlRef.current;
    mp4UrlRef.current = url;
    audio.src = url;
    // 换掉 src 之后上一段就没人用了，还回去（不还就是每点一次漏一段）
    if (previous) URL.revokeObjectURL(previous);

    void audio.play().then(
      () => setMp4Playing(true),
      (error: unknown) => {
        console.warn('[mp4] 兜底音源也放不出来：', error);
        setMp4Playing(false);
      }
    );
  }, []);

  /**
   * 地板那台 MP4：点一下播放 / 暂停。
   *
   * 首选音源是 `/audio/i-miss-you.mp3`（下面那个 `<audio>` 的 `src`）—— 这个文件不在
   * 仓库里（有版权，要自己放进 `public/audio/`，见该目录的 README）。
   *
   * **放不出来就退到现场摇的 8-bit 小段**（`lib/chiptune.ts`）。那条路只在
   * 「音源本身有问题」时走：文件不在、格式解不了，`play()` 都会以 `NotSupportedError`
   * 拒掉；自动播放策略那种（`NotAllowedError`）换音源也没用，不换。
   *
   * 退过去之后**每次点都现摇一段新的**（`playFallback`），所以连点几下听到的都不一样；
   * 那一段也**不循环**，放一遍就停（`onEnded` 把播放态收回去）。真歌的 `loop` 不受影响。
   *
   * 播放状态**等 `play()` 真的 resolve 了才置起来**（而不是点下去就先亮）：
   * 放不出来时屏幕不该显示成「正在播」。
   */
  const toggleMp4 = useCallback(() => {
    const audio = mp4AudioRef.current;
    if (!audio) return;

    if (!audio.paused) {
      audio.pause();
      setMp4Playing(false);
      return;
    }

    /*
     * 已经是兜底模式了：每次点都摇一段新的，而不是把上一段重播一遍
     * （兜底那段是一遍过的，重播也只会从头再放同一段 —— 那就「每次都一样」了）。
     * 顺带一提：这里也意味着「暂停后接着放」在兜底模式下不成立，点了就是新的一段。
     */
    if (mp4FallbackRef.current) {
      playFallback(audio);
      return;
    }

    void audio.play().then(
      () => setMp4Playing(true),
      (error: unknown) => {
        if (isAutoplayBlocked(error)) {
          console.warn('[mp4] 放不出来：', error);
          setMp4Playing(false);
          return;
        }

        /*
         * 文件不在 / 格式解不了 —— 从此改用现场摇的兜底音。
         * `loop` 也一并撤掉：兜底那段是**一遍过**的，不是那首歌。
         */
        mp4FallbackRef.current = true;
        audio.loop = false;
        console.info(
          '[mp4] i-miss-you.mp3 放不出来，改用现场合成的 8-bit 小段' +
            '（每次点都不一样，放一遍就停）。' +
            '要听原曲就把文件放到 public/audio/i-miss-you.mp3（见该目录的 README）。',
          error
        );
        playFallback(audio);
      }
    );
  }, [playFallback]);

  /**
   * 卸载时把那台 MP4 停掉 —— 不然换了页面它还在响。
   *
   * 顺便把兜底音那个 `blob:` 地址还回去：它是**一次性资源**（每点一次摇一段新的），
   * 不是模块级缓存，卸载时不留着。真歌那条路没有 blob，`mp4UrlRef` 是 null，空操作。
   */
  useEffect(
    () => () => {
      mp4AudioRef.current?.pause();
      if (mp4UrlRef.current) URL.revokeObjectURL(mp4UrlRef.current);
      mp4UrlRef.current = null;
      // 猫那个定时器同理：卸载后再回调就是往一个已经没了的组件上 setState
      if (catTimerRef.current !== null) window.clearTimeout(catTimerRef.current);
      catTimerRef.current = null;
    },
    []
  );

  /**
   * 挂载后把 React 那份对齐到属性上（首屏是内联脚本写的，React 无从得知）。
   * 和键位一样是「挂载后再读」—— 服务端没有 localStorage，惰性初始化会两边不一致。
   */
  useEffect(() => {
    // 主题只认那两个合法值：属性还没写上 / 取值意外时，按 state 的默认「夜晚」走
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
    setLampOn(document.documentElement.dataset.lamp === 'on');
    setSimple(document.documentElement.dataset.simple === 'on');
    const tv = document.documentElement.dataset.tv;
    setTvSize(isTvSize(tv) ? tv : DEFAULT_TV_SIZE);
    // 移动端那台掌机 / 桌面端那间屋子，二选一（属性由首屏内联脚本写，见 lib/device.ts）
    setMobile(readMobileFlag());
  }, []);

  /**
   * 墙上那幅画：挂载后抽一幅。**为什么非得挂载后**（不能写进 state 初值）见
   * `wallPainting` 那段注释 —— 一句话是「服务端也会渲一遍，两边各抽一次就 mismatch」。
   *
   * 抽签再往后推一帧（`setTimeout(…, 0)`）而不是在 effect 里同步 `setState`：
   * 后者会多出一条 React Compiler 的 `set-state-in-effect` **error**
   * （基线那几条是按 effect 计的 —— 往已有报错的 effect 里加不涨条数，新开一个会涨）。
   */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setWallPainting(PAINTINGS[Math.floor(Math.random() * PAINTINGS.length)]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  /** 全屏的是屏幕本身，不是整页 —— 所以目标是 screenRef 而不是 documentElement */
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    const screen = screenRef.current;
    if (!screen) return;
    // 被拒时静默返回：屏幕里没有地方显示提示了
    void screen.requestFullscreen().catch(() => undefined);
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
  }, []);

  /**
   * 点别处收起房间里那两个**没有遮罩的小浮层**：「电视机大小」的档位选择器、
   * 右上角那个语言选择器的下拉。
   *
   * （2026-10-13 之前还共用一条 —— 另一个是右侧那颗盾牌钮的「隐私与服务条款」。
   * 那颗钮连同它的弹层一起并进了小屏抽屉，于是这里少了它。）
   *
   * 两条判据一模一样（都是「按下的位置不在**钮 + 弹层**那个包裹层里」），所以合在一条
   * effect 里：拆成两条只会慢慢漂成两种行为。哪一边开着就收哪一边 —— 点开另一个的钮时，
   * 前一个也顺手收掉，不会两个同时挂着。
   *
   * 用 `pointerdown` 而不是 `click`：后者要等抬起，而且如果抬起时指针已经在别的元素上
   * （拖拽过），`click` 根本不派发。
   *
   * 必须把钮和弹层放在**同一个**包裹层里判（`tvMenuRef` / `localeMenuRef`），
   * 否则点钮本身也会被当成「点外面」—— 那样弹层刚开就被这一条关掉
   * （`pointerdown` 早于 `click`），钮看着像失灵。
   */
  useEffect(() => {
    if (!tvMenuOpen && !localeMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (tvMenuRef.current?.contains(target)) return;
      if (localeMenuRef.current?.contains(target)) return;
      setTvMenuOpen(false);
      setLocaleMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [tvMenuOpen, localeMenuOpen]);

  /**
   * Esc 关面板。
   *
   * **键盘快捷键（P / R / F5 / F8）2026-10-10 全部取消了**（用户要求）。
   * 它们都是「看不见的操作」，而按错的代价不小：P 一按游戏就停住（画面冻在最后一帧，
   * 看着就是卡死），F5 会直接把存档槽覆盖掉。这四件事在机身前面板上一人一颗钮 ——
   * 看得见、点得到，键盘这条路没有存在的必要。
   *
   * 所以这个 effect 现在只剩一件事：面板开着时按 Esc 关掉它。
   *
   * 输入框里按 Esc 不算关面板（房间码打了一半、留言本写了一行，都不该被撤掉）——
   * 留言本尤其如此：它的输入框是 `<textarea>`，不在下面那道 `HTMLInputElement`
   * 过滤里，只能靠早退那一行挡住。
   */
  useEffect(() => {
    const anyPanelOpen =
      saveOpen ||
      netplayOpen ||
      keybindOpen ||
      libraryOpen ||
      // 账号面板（登录 / 注册 / 退出）也是一层浮在房间上的东西
      userOpen ||
      // 深链那颗「正在载入某一款」的弹窗也算「开着的东西」（它一起来就开着，
      // 不必等数据 —— 见 `deepLinkOpen`）
      deepLinkOpen ||
      legendOpen ||
      noteOpen ||
      feedbackOpen ||
      paintingOpen ||
      tourOpen ||
      // 「电视机大小」的弹层、语言选择器的下拉、小屏那扇抽屉，也算「开着的东西」——
      // 它们浮在房间上，Esc 该能收掉它们
      tvMenuOpen ||
      localeMenuOpen ||
      menuOpen ||
      // 离开确认框浮在房间上，Esc 该能收掉它（收掉 = 留下，不是跳转）
      leaveOpen;

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (!anyPanelOpen || e.key !== 'Escape') return;

      setSaveOpen(false);
      setNetplayOpen(false);
      setKeybindOpen(false);
      setLibraryOpen(false);
      /*
       * ⚠️ **账号面板故意不在这里**（2026-10-13 用户要求：它只能靠右上角那颗 ✕ 关掉）。
       *
       * 登录 / 注册是个有输入内容的表单，Esc / 点背板误关一下就把填了一半的用户名口令
       * 丢了 —— 代价比「必须去点那颗叉」大。所以 `userOpen` 仍在 `anyPanelOpen` 里
       * （上面那条：它开着时这里要能响应），但**这一句不许有**。
       *
       * 注意这是个反直觉的地方：别的面板都是一行 `setXxxOpen(false)`，这一个是
       * 唯独没有的。改动这段时别顺手补上。
       */
      /*
       * 深链那颗弹窗：Esc 不只是「收起来」，还要**把这一轮真掐掉**。
       * 只收不掐的话，用户以为关掉了，实际上请求还在后台飞、下完还会自己开始游戏
       * —— 那是个看不见的下载，比不关更糟。整个动作就是弹窗里那颗「取消」
       * （`cancelDeepLink`：取数那段 + ROM 那两段都 abort；地址上的 `?id=` 保留 ——
       * 用户要的就是刷新还能重开同一款）。
       */
      if (deepLinkOpen) cancelDeepLink();
      setLegendOpen(false);
      setNoteOpen(false);
      setFeedbackOpen(false);
      setPaintingOpen(false);
      setTvMenuOpen(false);
      setLocaleMenuOpen(false);
      setMenuOpen(false);
      // 离开确认框的 Esc = 「留下」（和框里那颗钮同一件事），绝不顺手把人送走
      setLeaveOpen(false);
      // 指引自己也挂了一个 Esc（见 OnboardingTour），这里再兜一次。
      // 两条路都通到 closeTour，重复调用只是多写一次标记，无副作用。
      if (tourOpen) closeTour();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    saveOpen,
    netplayOpen,
    keybindOpen,
    libraryOpen,
    userOpen,
    deepLinkOpen,
    cancelDeepLink,
    legendOpen,
    noteOpen,
    feedbackOpen,
    paintingOpen,
    tourOpen,
    tvMenuOpen,
    localeMenuOpen,
    menuOpen,
    leaveOpen,
    closeTour,
  ]);

  /**
   * 把本地输入转发给对方。**只有加入者转发。**
   *
   * 房主那边不用转发：他的输入由 RetroArch 自己读（键盘读 P1 键位，手柄由核心的
   * `rwebpad` 驱动读），加入者是从房主推来的画面里看到这一下动作的 —— 再转发一遍
   * 反而会让加入者去注入一个不存在的模拟器。加入者这边反过来：本机没有模拟器，
   * 键盘和手柄都得送过去，由房主注入成 2P。
   *
   * 两个来源都汇进这条链路：键盘是 `物理键 code → 钮名`（按他自己的 1P 键位反查），
   * 手柄是 `按钮下标 → 钮名`（标准布局，见 `lib/gamepad.ts`）。**wire 上只有钮名** ——
   * 房主分不出、也不需要分出这一下是键盘还是手柄按的。
   *
   * 刻意**不**阻止默认行为、也不接管输入：本地那一半（房主读 P1）完全不用我们插手。
   *
   * 也正因如此，这个方案要求**双人游戏**：加入者的输入落在 2P 位上，而单人游戏只认 P1。
   * 注意那是**游戏里的号位**，和他手上按哪几个键无关（见下面那张表）。
   *
   * 依赖 role：不在房间里就整段不生效，连监听都不挂。面板开着时也不挂 ——
   * 改键位的过程中按下的键不该被当成游戏输入送到对面去。
   */
  useEffect(() => {
    if (netplayState.role !== 'guest') return;
    if (
      saveOpen ||
      netplayOpen ||
      keybindOpen ||
      libraryOpen ||
      userOpen ||
      legendOpen ||
      noteOpen ||
      feedbackOpen ||
      paintingOpen ||
      tourOpen ||
      // 离开确认框开着时也别把键送到对面
      leaveOpen ||
      // 深链那颗载入弹窗也挡着键盘（它上面有一颗「取消」，输入不该漏到游戏里 / 对面去）
      deepLinkOpen
    )
      return;

    /*
     * 「物理键 → 钮」由**加入者自己的 1P 键位**反查得到。
     *
     * 为什么是 1P 那组、不是看起来更「对位」的 2P：联机时两人各在自己的键盘前，
     * **不存在抢键**，所以「游戏里的号位」和「手上按哪几个键」彻底解耦 —— 加入者
     * 在游戏里是 2P，键位却该用他自己的 1P 布局（那才是他配惯的那套）。这样一来
     * 1P 那组永远是「你自己的键」，2P 那组只服务单机双人共用一块键盘。
     *
     * 房主怎么配 P2 跟加入者无关：加入者只把钮名发过去，房主那边按自己的表
     * 合成一个按键事件喂给核心。所以加入者改完键位是**立刻生效**的 ——
     * 他没有模拟器，不需要重插卡带（房主那边才需要）。
     */
    const keys = codeToButton(bindings.p1);

    /*
     * 两个输入来源（键盘 / 手柄），最后合成一条「对面该看到的状态」。
     *
     * 必须**各自记账再取并集**，不能让它们各发各的：同一个钮被两边同时按着时
     * （左手键盘推着方向、右手顺手也推了摇杆），任何一边松手都不该让对面收到 keyup ——
     * 那会让角色在房主手里突然停住。所以只有并集变化了才发包。
     *
     * 类型是 `ButtonName` 而不是 string：手柄那边直接产出钮名（`lib/gamepad.ts`），
     * 让它和键盘那条路对得上同一个集合类型，写错名字时 tsc 会拦。
     */
    const fromKeyboard = new Set<ButtonName>();
    let fromPad = new Set<ButtonName>();
    /** 已经发出去的「按下」状态 —— 拿它和并集做差分 */
    const sent = new Set<ButtonName>();

    const sync = () => {
      const want = new Set<ButtonName>(fromKeyboard);
      for (const button of fromPad) want.add(button);

      for (const button of want) {
        if (sent.has(button)) continue;
        sent.add(button);
        netplay.sendButton(button, true);
      }
      for (const button of [...sent]) {
        if (want.has(button)) continue;
        sent.delete(button);
        netplay.sendButton(button, false);
      }
    };

    const forward = (e: KeyboardEvent, down: boolean) => {
      if (e.target instanceof HTMLInputElement) return;
      const button = keys[e.code];
      if (!button) return;
      // 按住不放会连发 keydown，重复转发没有意义
      if (down && e.repeat) return;
      if (down) fromKeyboard.add(button);
      else fromKeyboard.delete(button);
      sync();
    };

    const onDown = (e: KeyboardEvent) => forward(e, true);
    const onUp = (e: KeyboardEvent) => forward(e, false);

    /*
     * 手柄每帧读一次。
     *
     * 用 rAF 而不是 `gamepadconnected` 事件：那个事件只在**插上**时来一次，之后按钮状态
     * 全靠轮询（浏览器不会为「按下 A」派发任何事件）—— 引擎自己也是每帧轮询的。
     * 开销可以忽略（60Hz 下就是读十几个布尔值），而且这段只在「加入者 + 房间内」才挂。
     */
    let raf = 0;
    const pollPad = () => {
      fromPad = readGamepads();
      sync();
      raf = requestAnimationFrame(pollPad);
    };
    raf = requestAnimationFrame(pollPad);

    /*
     * 切走窗口 / 切走标签页时，把手里的钮一次性松开。
     *
     * 键盘那条是因为浏览器**不补发 keyup**；手柄那条是因为 rAF 会停 —— 两种情况都不主动
     * 松的话，房主会一直以为你按着那个方向，角色自己往边上走。
     */
    const releaseAll = () => {
      for (const button of sent) netplay.sendButton(button, false);
      sent.clear();
      fromKeyboard.clear();
      fromPad = new Set();
    };

    const onVisibility = () => {
      if (document.hidden) releaseAll();
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(raf);
      /*
       * 摘监听时把欠着的 keyup 补上。不只为了关页面：开面板 / 改键位都会让这段
       * effect 重跑（依赖里有 bindings 和面板开关），正按着方向键的那一刻打开面板，
       * 后面那个 keyup 就再也没人转发了 —— 房主那边会一直以为你按着。
       */
      releaseAll();
    };
  }, [netplayState.role, netplay, bindings, saveOpen, netplayOpen, keybindOpen, libraryOpen, userOpen, legendOpen, noteOpen, feedbackOpen, paintingOpen, tourOpen, leaveOpen, deepLinkOpen]);

  /**
   * 面板关掉之后，把焦点从按钮上摘掉。
   *
   * Nostalgist 默认 `respondToGlobalEvents: true`，但它的键盘回调有一道过滤：
   * 事件目标是 `<button>` / `<input>` / `<a>` 这类可交互元素时**直接不转给核心**
   * （Nostalgist 内部的 isInteractable）。而面板的开关、关闭键全是 `<button>` ——
   * 用角落那个联机图标打开面板、再按 Esc 关掉，焦点还留在那颗按钮上，
   * 之后按方向键 RetroArch 一声不吭，看着就像「联机没生效」。
   *
   * blur() 而不是 focus(canvas)：canvas 没有 tabindex，focus() 是空操作；
   * 摘掉焦点后事件目标落回 body，核心才会重新读键盘。
   */
  useEffect(() => {
    if (
      saveOpen ||
      netplayOpen ||
      keybindOpen ||
      libraryOpen ||
      userOpen ||
      legendOpen ||
      noteOpen ||
      feedbackOpen ||
      paintingOpen ||
      tourOpen ||
      // 离开确认框浮在房间上，也挡着键盘（它上面有两颗钮，属「开着的东西」）
      leaveOpen ||
      // 深链那颗载入弹窗也挡着键盘（它上面有一颗「取消」，输入不该漏到游戏里 / 对面去）
      deepLinkOpen
    )
      return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) active.blur();
  }, [
    saveOpen,
    netplayOpen,
    keybindOpen,
    libraryOpen,
    userOpen,
    legendOpen,
    noteOpen,
    feedbackOpen,
    paintingOpen,
    tourOpen,
    leaveOpen,
    deepLinkOpen,
  ]);

  /**
   * 点完按钮就把焦点摘掉。
   *
   * 上面那条只管「面板关闭」这一种收尾，而麻烦不限于面板：按「暂停」再按一次恢复、
   * 点一下角落那颗主题开关 —— 焦点都会留在那颗 `<button>` 上，之后核心就不读键盘了。
   * 这里统一收口：只要是按钮被点过，就把焦点放回 body。
   *
   * **`<a>` 也算**（2026-10-12 补）：那天右上角加了隐私 / 服务条款两条常驻文字链接，
   * 它们也是可聚焦元素（其中法务两页还带 `target="_blank"`）—— 点完新标签拿走焦点，
   * 用户切回这间屋子时焦点仍落在那条链接上，键盘照样是死的。路由类 `<a>` 被 blur
   * 不会取消它的跳转（`pointerup` 早于 `click`），所以照 blur 不误。
   *
   * 只对 `<button>` / `<a>` 生效：`<input>`（房间码输入框）点了不能 blur，
   * 否则刚点进去就失焦、一个字都打不进来。
   */
  useEffect(() => {
    const onPointerUp = (e: PointerEvent) => {
      if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) {
        e.target.blur();
      }
    };
    document.addEventListener('pointerup', onPointerUp);
    return () => document.removeEventListener('pointerup', onPointerUp);
  }, []);

  useEffect(() => {
    return () => {
      void controller.exit();
      // 关页面 / 热更新时把房间退掉，否则对面会一直等着一个已经走了的人
      void netplay.leave();
    };
  }, [controller, netplay]);

  return (
    <main className="room relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden px-6 py-4">
      {/*
        页面里唯一一段**真正的文字**，给搜索引擎和读屏软件看。
        视觉上完全不可见（sr-only = 定位到 1px 再裁掉），不占位、不吃点击。

        为什么非要有：屋子里的一切都是 CSS 画的，游戏跑在 canvas 里，
        整页没有一个可索引的词 —— 爬虫进来只看到空壳。正文、层级（h1）都在这里补齐。
        文案在 lib/i18n.ts 的 seo.* 里，跟着语言走。

        位置放在 <main> 最前面：读屏用户 tab 进来的第一个焦点之前就能听到
        「这是什么、怎么开始玩」，而不是直接从一片没有任何说明的按钮列表开始。

        ⚠️ 别把 sr-only 改成可见，也别往里面堆关键词 —— 前者会毁掉这间屋子的极简感，
        后者是会被判作弊的隐藏文本。这里只如实描述页面上真的有的功能。
      */}
      <div className="sr-only">
        <h1>{t('seo.heading')}</h1>
        <p>{t('seo.intro')}</p>
        <p>{t('seo.howTo')}</p>
      </div>

      {/*
        墙纸。**必须在 .vignette 之前** —— 两者都是 z-auto 的定位元素，谁先渲染谁在下，
        墙纸要是排在暗角后面，四角那圈压暗就被它盖掉了（见 RoomBackdrop 顶部注释）。
      */}
      <RoomWall />
      <div className="vignette pointer-events-none absolute inset-0" />

      {/*
        **小屏那颗「菜单」钮**（2026-10-13 加）。

        只在放不下的时候出现（判据是 globals.css 里 `.menu-btn` 那一条：宽 < 900 或
        高 < 950）—— 它替掉的是原来那套「窗口一矮就退回一颗盾牌钮」的降级，现在两种
        场景统一走这里。钮贴在**页面右上角**（移动端同样在右，见 `.menu-btn` 那段注释），
        点开右边那层抽屉，把下面 `<nav>` 和 `.rail` 里的入口整批搬进抽屉。

        图标是 `MenuGlyph`：收着时三条横线，点开之后**动成叉号**，所以这里只把
        `menuOpen` 传下去，不换图标（`aria-expanded` + `menu.open` / `menu.close`
        仍然跟着翻，读屏听到的是同一件事）。
        抽屉的 z-index 比它低，所以抽屉滑进来之后它仍然露在上面。
        ⚠️ 那颗钮自己带一圈落影（globals.css 的 `.menu-btn`）：它浮在屋子 / 掌机上，
        底色和房间同阶，不给影子在暗处会糊在一起（2026-10-13 用户要求）。
      */}
      <button
        type="button"
        onClick={() => setMenuOpen(v => !v)}
        title={t(menuOpen ? 'menu.close' : 'menu.open')}
        aria-label={t(menuOpen ? 'menu.close' : 'menu.open')}
        aria-expanded={menuOpen}
        aria-controls="room-entries"
        className={`menu-btn pixel-edge pxw-2 p-1.5 transition-colors ${
          menuOpen ? 'pxc-accent bg-accent/20 text-accent' : 'bg-ink-800 text-ink-300 hover:text-accent'
        }`}
      >
        <MenuGlyph open={menuOpen} />
      </button>

      {/*
        抽屉开着时压住屋子那一层。点它 = 收起抽屉，和上面那颗钮、以及 Esc 三条路
        通到同一个 `setMenuOpen(false)`。
        `aria-hidden`：它只是一块「点空白就关」的手势区，本身没有内容。
      */}
      {menuOpen && (
        <div className="menu-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}

      {/*
        **桌面两处入口的共用容器**（2026-10-13 加）。

        · 大屏 —— `.entries` 是 `display: contents`，**不生成盒子**，里面 `<nav>` / `.rail`
          照旧按自己的绝对定位贴在房间右上角与右边沿（`absolute right-6 top-5` /
          `right-6 top-1/2` 一个都不用改）。
        · 小屏 —— `.entries` 变成一扇从右侧滑出的抽屉（`position: fixed` + 整层底色），
          两个子元素改 `display: contents`（自己不生成盒子），里面的每一行直接排进抽屉。

        为什么要在外面套这一层：抽屉得把这两批入口装进**同一个盒子**，而 CSS 没办法把
        已经渲染好的兄弟节点搬进另一个盒子 —— 要么包一层，要么把整批按钮再抄一份进抽屉。
        2026-10-13 之前那颗盾牌钮的弹层就是抄的一份（账号 / 游戏列表 / 隐私 / 条款 /
        语言在里面重写了一遍），代价是改一处要同步两处。包一层之后**只有一份 DOM**。

        ⚠️ 下面两个子元素的缩进没有跟着多两级：这层容器在大屏根本不生成盒子，
        小屏才变成抽屉 —— 保持原缩进能看清它们本来挂在哪儿。

        ⚠️ **抽屉里是「一份清单」，不是两摞**（2026-10-13 用户要求「图标一行一个、
        旁边显示功能文案」，并把两处入口里重复的那几条合并掉）。做法在小屏那段 CSS 里：
        两个子元素都改 `display: contents`（自己不生成盒子），它们的每一行于是直接成为
        `.entries` 的 flex 子项，再用 `order` 排成一份列表 ——
        语言 / 账号 / 主题 / 游戏库 / 联机 / 按键设置 ── 按键说明 / 留言本 ── 隐私 / 条款。
        重复的两条各留一份：**账号**留右上角那条（写着「登录」/ 用户名，比一颗图标清楚），
        开关列那颗在抽屉里藏掉；**游戏列表 / 游戏库**留开关列那条（开的是房间里的游戏库面板），
        右上角那条在抽屉里藏掉。

        点抽屉里任意一项就收起抽屉，除了那两个「就地生效、不离开这一屏」的控件
        （语言选择器与主题钮），说明写在下面那行 `onClick` 里。
        大屏下这一条只是空转（`menuOpen` 本来就是 false）。
      */}
      <div
        id="room-entries"
        className="entries"
        data-open={menuOpen ? 'on' : 'off'}
        onClick={(e) => {
          /*
           * 语言选择器：选完还停在**这一页**（只是换成另一种语言的那一版），
           * 抽屉收掉反而像「没生效」；它还要能开合自己那份下拉，抽屉更不能跟着走
           * （放大片区域一起挡掉，钮和选项都算）。
           * 主题钮（`.theme-toggle`）翻的只是 `<html data-theme>`，同样不该把抽屉带走。
           * 其余各条都是「去别处」或「开一层面板」，抽屉得让位 —— 不然面板会被它压着。
           */
          const el = e.target as HTMLElement;
          if (el.closest('.locale-menu, .theme-toggle, .rail-tvsize')) return;
          setMenuOpen(false);
        }}
      >
      {/*
        **页面右上角那一行**：语言 + 账号 + 游戏列表 + 隐私政策 + 服务条款。
        （2026-10-12 用户要求：「隐私和服务条款全部放在网页右上角、文字形式」，
        之后又要「游戏列表放在右上角的政策旁边」—— 于是这一行收了三样东西。
        2026-10-13 再在「游戏列表」左侧补上**账号**（未登录写「登录」、已登录写用户名）。
        同日稍后用户又要求：把语言切换从这一行**最右**挪到**第一位**、并换成**下拉选择**
        （那颗 `<select>` 的取舍写在它自己的注释里），于是它现在打头，整行五样。）

        大屏它就常驻在右上角；小屏整行搬进上面那扇抽屉（条目之间那几条装饰小竖线由 CSS
        藏掉，见 globals.css「小屏抽屉」里的 `.entries .top-sep`）。
        **大小屏是同一份 DOM**，不再像 2026-10-13 之前那样在盾牌钮的弹层里重抄一遍。

        ⚠️ **每一条里都多了一层 `.row-icon`**（2026-10-13 加）：抽屉里这一份要和右边那列
        开关拼成**一份**清单、每行「左边图标、右边文案」，所以右上角这几条也得有个图标。
        大屏上 `.row-icon` 是 `display: none`（见 globals.css）—— 那时它仍然是纯文字链接，
        和以前一模一样。

        为什么法务入口要「常驻的文字」而不是收进一颗图标钮再点开：按惯例它就该一直露在
        页首 / 页脚，收起来才看得见反而不合规矩；游戏列表更是一条正经内容入口 ——
        它得能被点到、也被爬虫顺着走。整行只占右上角一小条，
        不压电视机、也不在那间屋子的视觉重心上（那一列开关才是要克制的地方）。

        **隐私 / 条款两页 `target="_blank"`**：它们是真正独立的路由，点过去整间屋子
        （正在跑的游戏、联机房间、屏幕上那盘卡带）就没了 —— 不值得为了看一页法务
        把用户从房间里拽出来。`rel="noopener noreferrer"` 配套。

        **「游戏列表」例外：在当前页跳转**（2026-10-13 用户要求，撤掉了 `_blank`）——
        它是站里的主入口，「去看看有什么」属于正常导航，不该动不动另开一个标签页。
        代价和上面两页一样（整间屋子会换掉），这一点接受。
        ⚠️ 但**它在抽屉里是藏起来的**（`.top-games`，见 globals.css）：抽屉那行
        「游戏库」（右边开关列里那颗）打开的是房间里的游戏库面板 —— 同一件事，
        人在房间里要的正是面板那一版。想逛 `/games` 走首页，那里也有入口。
        别把它当成「漏了一步」又放出来。

        几条竖线是纯装饰（`aria-hidden`）—— 不给它字面分隔符，
        读屏念出来就是几个干净的条目名，中间不该多一个「那个点」。
      */}
      <nav
        aria-label={t('topLinks.label')}
        className="top-links absolute right-6 top-5 z-40 flex items-center gap-3"
      >
        {/*
          语言切换（2026-10-13 用户要求：从这一行**最右**挪到**第一位**、换成下拉；
          同日稍后要求「不要用原生 `<select>`，自己写一个，样式统一」，
          于是又换成了下面这个**自绘下拉**）。

          **为什么要自己写**：原生 `<select>` 的选项列表由操作系统画 —— 深色屋子里会弹出
          一块系统白的列表，字体 / 边框 / 高亮全是另一套，和这间屋子完全两回事；
          而且它没法像别的行那样带图标、进抽屉后也没法跟右侧那列开关排成同一种
          「左边图标、右边文案」的样子。

          **为什么仍然不是 `<Link>`**：语言是路径维度（英文无前缀、中文 `/zh`、日文 `/ja`、
          韩文 `/ko`），切换的实质仍是「导航到另一个地址」；但用户要的是下拉，而下拉不是
          链接 —— 它没有 `href`，只能在点了选项之后程序化导航
          （`router.push(hrefIn(option.value))`，本文件唯一一处 `useRouter`）。

          ⚠️ **代价（用下拉就必然如此，自绘不比原生更差）**：原来那条 `<Link>` 能中键 /
          右键新标签打开、能复制地址、爬虫也能顺着 `href` 发现另一种语言那一版；
          换成下拉之后这些全没了（下拉不是可抓取的链接）。要这些就得退回 `<Link>`。

          ⚠️ **点选项时两步的顺序不能反**：`rememberLocale` **先**写 cookie、**再**导航。
          middleware 正是靠这个 cookie 决定「无前缀地址要不要把你送去 `/zh`」——
          反过来的话，从 `/zh` 切到英文、落到 `/games`，下一个请求又会被 cookie 里那个
          「中文」送回 `/zh`，表现为**切了没反应**。

          目标地址用 `hrefIn(option.value)`：**每个选项各自现算** —— 「当前页面在日文下的
          地址」和「在韩文下的地址」是两个不同的地址（含 query —— 房间那页的深链是
          `/room?id=<游戏>`，切语言不该把它弄丢）。
          ⚠️ 2026-10-16 之前这里用的是 `altHref`（「另一种语言」的地址），那只在两种
          语言时成立；四种语言下它会变成「不管点哪个都去同一个地方」。
          加语言时这里是必须改的一处。

          **不做 `roomBusy` 拦截**（和「游戏列表」那条不同）：切语言本来就要整页换掉，
          这条又在**第一位**、比「游戏列表」还靠外，拦一道只是挡路。它原先是 `<Link>`
          时也没拦 —— 行为不变。

          展开 / 收起是 `localeMenuOpen`，点外面（那条 pointerdown effect）、Esc、
          再点一次钮都能收 —— 和「电视机大小」那个弹层同一套收法。
          `aria-haspopup='listbox'` + 里面 `role='listbox' / 'option'`：这是一个
          「选一个值」的控件，不是菜单。
        */}
        <div
          ref={localeMenuRef}
          className="locale-menu"
          data-open={localeMenuOpen ? 'on' : 'off'}
        >
          <button
            type="button"
            onClick={() => setLocaleMenuOpen(v => !v)}
            title={t('locale.label')}
            aria-label={t('locale.label')}
            aria-haspopup="listbox"
            aria-expanded={localeMenuOpen}
            className="locale-trigger"
          >
            {/* 图标只在小屏抽屉里露（大屏这一行是纯文字，见上面那段注释） */}
            <span className="row-icon">
              <GlobeIcon size={16} />
            </span>
            {/* 当前语言的国旗（简繁共用一面中国国旗，靠文字区分） */}
            <FlagIcon locale={locale} />
            <span className="locale-current">
              {LOCALE_OPTIONS.find((option) => option.value === locale)?.label ?? locale}
            </span>
            {/* 下拉箭头。大屏也留着 —— 不留的话它看起来就是一段普通文字，没人知道能点开 */}
            <span className="locale-caret" aria-hidden="true" />
          </button>

          {localeMenuOpen && (
            <ul role="listbox" aria-label={t('locale.label')} className="locale-options">
              {LOCALE_OPTIONS.map((option) => (
                <li key={option.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.value === locale}
                    className={`locale-option${option.value === locale ? ' is-current' : ''}`}
                    onClick={() => {
                      setLocaleMenuOpen(false);
                      // 点的是当前语言：只是收起来，不必白跑一趟导航
                      if (option.value === locale) return;
                      rememberLocale(option.value);
                      // 这颗下拉不是 `<a>`，顶部加载条那个包听不见 —— 手动喊一声
                      topLoader.start();
                      router.push(hrefIn(option.value));
                    }}
                  >
                    <FlagIcon locale={option.value} />
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <span aria-hidden className="top-sep h-[10px] w-px bg-ink-500" />

        {/*
          首页（2026-10-13 加）。用户要求「除首页外，每个页面都有一颗回首页的入口」，
          房间这一页的入口就是右上角这行（内容页那排见 `components/TopBar.tsx`）。
          排在语言之后 —— 语言和首页都是「站点级」的东西，再往后才是游戏库 / 账号
          （账号 2026-10-14 移到「游戏列表」**后面**，见下面那段）。

          和「游戏列表」那条同样带 `roomBusy` 拦截：回首页是同页跳转，会把整间屋子
          （正在跑的游戏 / 联机房间）卸载掉 —— 屋里有活时先弹确认，空屋子直接走。

          `.top-home` 给小屏抽屉排顺序用（见 globals.css），别删；`.row-icon` 让它在
          抽屉里和别的行一样「左边图标、右边文案」。
        */}
        <Link
          href={localeHref('/')}
          onClick={(e) => {
            if (!roomBusy) return;
            e.preventDefault();
            setLeaveOpen(true);
          }}
          className="top-home text-[12px] text-ink-300 transition-colors hover:text-accent"
        >
          <span className="row-icon">
            <HomeIcon size={16} />
          </span>
          {t('common.home')}
        </Link>
        <span aria-hidden className="top-sep h-[10px] w-px bg-ink-500" />

        <Link
          href={localeHref('/games')}
          /* 房间里正有活（插着卡带 / 开着联机房）就先弹一层确认 —— 同页跳转会卸载整个房间。
             空房间不拦：不调 `preventDefault`，`<Link>` 自己就跳走了。 */
          onClick={(e) => {
            if (!roomBusy) return;
            e.preventDefault();
            setLeaveOpen(true);
          }}
          className="top-games text-[12px] text-ink-300 transition-colors hover:text-accent"
        >
          <span className="row-icon">
            <StoreIcon size={16} />
          </span>
          {t('topLinks.games')}
        </Link>

        {/*
          账号入口。**2026-10-14 用户要求挪到「游戏列表」后面**（原来它在「游戏列表」
          左侧、「首页」和「游戏列表」之间）—— 这一行现在的顺序是
          语言 → 首页 → 游戏列表 → 账号 → 隐私 → 条款；内容页顶栏（`TopBar`）
          同一天也调成了同一个组序。

          **两种形态**，按登录态切换：
            · 未登录 → `<button>`，点开屋里那个账号面板（`userOpen`），不导航；
            · 已登录 → `<Link href='/account'>`，点进个人中心**本页打开**。

          为什么未登录用 `<button>` 而不是 `<Link href='/login'>`：**屋里不该往外跳**。
          这颗钮在房间里，而登录面板本来就在屋里（浮层，零导航）；跳到 `/login` 那一页
          会先把整间屋子（正在跑的游戏 / 联机房间）卸载掉，只是为了填一张表单 ——
          在屋里开浮层少一次导航，也没有「游戏被打断」那一下。
          （内容页顶栏那颗「登录」走的才是 `/login` —— 那边没有屋子可保。）

          **房间里现在只剩这一条账号入口**：右侧开关列里原先也有一颗账号钮
          （同一个 `setUserOpen(true)`），2026-10-13 用户要求 PC 端去掉，已从 `.rail` 撤掉
          （见那一列的注释）。别以为「两处都一样、删哪处都行」又把那颗加回来。

          ⚠️ **`userLoading` 期间不渲染**：首屏还不知道「我是谁」，先画成未登录态的话，
             已登录用户会看见它先写「登录」再「啪」地换成自己的名字。那几十毫秒宁可空着
             （`nav` 的 `gap-3` 会先留出位置，不会跳）。

          已登录那条**沿用「游戏列表」那套 `roomBusy` 拦截**（用户明确要求「参考游戏列表按钮」）：
          去个人中心同样是同页跳转，会把整间屋子（正在跑的游戏 / 联机房间）卸载掉 ——
          房间里正有活时先弹确认，空房间直接跳。走 `next/link` 的 `<Link>`，
          中键 / ctrl+click 的原生行为不受影响（`onClick` 里 `preventDefault` 只拦左键默认导航）。

          `max-w-[9rem] truncate`：用户名最长 20 字，直接铺开会把这行链接撑宽、
          顶到电视机上；截断，`title` 里留全名。

          `.top-account` 是给小屏抽屉排顺序用的（`.entries .top-account` 的 `order`，
          见 globals.css），别删。`.row-icon` 是抽屉里要用的：那一行也得和别的行一样
          「左边图标、右边文案」（大屏这行是纯文字，图标 `display: none`）。 */}
        {!userLoading && <span aria-hidden className="top-sep h-[10px] w-px bg-ink-500" />}
        {!userLoading &&
          (user ? (
            <Link
              href={localeHref('/account')}
              title={t('user.openSignedIn', { name: user.username })}
              onClick={(e) => {
                if (!roomBusy) return;
                e.preventDefault();
                setLeaveOpen(true);
              }}
              className="top-account max-w-[9rem] truncate text-[12px] text-ink-300 transition-colors hover:text-accent"
            >
              <span className="row-icon">
                <UserIcon size={16} />
              </span>
              {user.username}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setUserOpen(true)}
              className="top-account text-[12px] text-ink-300 transition-colors hover:text-accent"
            >
              <span className="row-icon">
                <UserIcon size={16} />
              </span>
              {t('user.signIn')}
            </button>
          ))}
        <span aria-hidden className="top-sep h-[10px] w-px bg-ink-500" />
        <Link
          href={localeHref('/privacy')}
          target="_blank"
          rel="noopener noreferrer"
          className="top-privacy text-[12px] text-ink-300 transition-colors hover:text-accent"
        >
          <span className="row-icon">
            <ShieldIcon size={16} />
          </span>
          {t('legal.privacy')}
        </Link>
        <span aria-hidden className="top-sep h-[10px] w-px bg-ink-500" />
        <Link
          href={localeHref('/terms')}
          target="_blank"
          rel="noopener noreferrer"
          className="top-terms text-[12px] text-ink-300 transition-colors hover:text-accent"
        >
          <span className="row-icon">
            <ScrollIcon size={16} />
          </span>
          {t('legal.terms')}
        </Link>
      </nav>

      {/*
        右侧竖排开关：**上下居中贴右边**，并且**按功能分成三组**
        （用户 2026-10-10 要求：外观 / 游戏 / 帮助，组间拉开）。

        从上到下：
          ① 外观 —— 明暗、全屏、简洁、**电视机大小**
          ② 游戏 —— 游戏库、联机、自定义按键（**账号钮 2026-10-13 撤掉，见下面那段注释**）
          ③ 帮助与留言 —— 按键说明、留言本
        组内间距是容器的 `gap-2`，组间插一道 `RailDivider`（1px 短线 + 更大的外边距）。

        小屏时这一列整批搬进**右侧抽屉**，和右上角那一行拼成**一份**清单、
        每行「左边图标、右边文案」（2026-10-13 用户要求；做法见 globals.css 的小屏抽屉
        那段：两个子容器都改 `display: contents`，再按 `order` 排）。同时收掉两颗
        只有桌面大窗口才有意义的钮（全屏 / 电视机大小，都带 `.rail-desktop` 类）。
        ⚠️ **简洁模式例外**：它也在抽屉里露面（那一颗另带 `.rail-simple`，见它自己的注释）。

        ⚠️ **每颗钮里都多了一个 `.row-label`**（文案），大屏上是 `display: none`
        （这一列只有 28px 宽，塞不下字），只有进抽屉才露出来。文案直接用那颗钮本来就有的
        `title`（同一个 `t(...)` 调两次）—— 那颗钮的 tooltip 就是它最准的说法，
        再为抽屉另起一套词只会多一份要同步的东西。
        `.rail-theme` / `.rail-games` 这些类**只给抽屉排顺序用**（见 globals.css），别删。

        留言本原先**只能**点房间里地板上那本，现在给了它一个正经入口；
        地板上那本**留着**，成了彩蛋 —— 见 `RoomFloorItems` 的注释。

        原先是横着摆在右上角，整排压住了机身右上角（说明那块更是直接盖在电视机上）。
        竖过来之后宽度只有原来的一半不到，场景横向又空出来，不再和电视机抢地方。
        外观组打头那两颗（主题 / 语言）2026-10-12 从两格分段控件收成了单颗钮，
        各占一行，比原来还窄 —— 见下面各自的注释。

        ⚠️ 这一列原来最下面还有一颗**盾牌钮**（点开往左弹隐私 / 条款 / 游戏列表 /
        账号 / 语言）。2026-10-13 它并进了小屏抽屉 —— 抽屉里装的就是这一列和右上角
        那一行的**原件**，不再需要一颗图标钮当「另一个入口」。别把它加回来。
      */}
      <div
        data-tour="rail"
        className="rail absolute right-6 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-2"
      >
        {/* ==================== 组 ①：外观 ==================== */}

        {/*
          主题：**一颗钮**，点一下在白天 / 夜晚之间来回切（2026-10-12 用户要求，
          原本是「白天 / 夜晚」两格常驻的分段控件）。

          露太阳还是月亮**由 CSS 按 `<html data-theme>` 决定**（globals.css 的
          `.theme-toggle`），React 不参与挑图标 —— 那样首帧会先按默认主题画一颗、
          挂载后再「啪」地换过来。图标画的是**切过去之后**的那一颗，和 title 同方向。

          注意别把两颗图标写成条件渲染（`theme === 'light' ? … : …`）：那样又回到
          React 挑图标了，上面那个闪烁的问题会立刻回来。
        */}
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'light' ? t('theme.toDark') : t('theme.toLight')}
          aria-label={theme === 'light' ? t('theme.toDark') : t('theme.toLight')}
          className="rail-theme theme-toggle pixel-edge pxw-2 p-1.5 bg-ink-800 text-ink-300 transition-colors hover:text-accent"
        >
          <span className="theme-icon-light">
            <SunIcon size={16} />
          </span>
          <span className="theme-icon-dark">
            <MoonIcon size={16} />
          </span>
          {/*
            抽屉里那一行的文案只写「主题」（`menu.theme`），**不跟着翻成
            「切换到夜晚」** —— 它在这里是一条目录项（说明这一行管什么），
            不是一句动作描述；而且文案会跟着 `<html data-theme>` 翻，那又是 React 挑文案，
            首帧闪烁的老问题会回来。真正说明「下一步切到哪」的是上面那个 title / aria。
          */}
          <span className="row-label">{t('menu.theme')}</span>
        </button>

        {/*
          这里原先有一颗「语言」钮（来回切中英）。2026-10-13 **挪去了右上角那排**
          （`.top-links` 里那颗 `<select>`，小屏在菜单抽屉里）——
          语言现在分在路径上，切换是**导航**而不是就地换文案，一条链接比一颗钮诚实。
          别因为「这一列看着空了一格」又把它加回来。
        */}
        <button
          type="button"
          onClick={toggleFullscreen}
          title={t(fullscreen ? 'fullscreen.exit' : 'fullscreen.enter')}
          aria-label={t(fullscreen ? 'fullscreen.exit' : 'fullscreen.enter')}
          className={`rail-desktop pixel-edge pxw-2 p-1.5 transition-colors ${
            fullscreen ? 'pxc-accent bg-accent/20 text-accent' : 'bg-ink-800 text-ink-300 hover:text-accent'
          }`}
        >
          <ExpandIcon size={16} />
          <span className="row-label">{t(fullscreen ? 'fullscreen.exit' : 'fullscreen.enter')}</span>
        </button>

        {/*
          简洁模式：只留背景墙 / 电视机 / 桌子 / 地面。
          和全屏那颗一样是**有开关状态的按钮**，所以亮着的样式跟它同一套（accent 底）。
          真正藏东西的是 CSS，这里只负责翻 <html data-simple>。

          图标 2026-10-12 从「一台电视机」（MinimalIcon）换成了**扫帚**：
          原来那台和下面「电视机大小」那颗（也是一台电视，只是尺寸不同）挨着放，
          两颗钮长得太像。扫帚讲的是这个动作本身 —— 把杂物扫掉。

          ⚠️ 除了 `.rail-desktop`（移动端要藏），它**还带一个 `.rail-simple`**（2026-10-13 加）：
          抽屉里原本把整组 `.rail-desktop` 一起藏了，但那条理由是按「移动端掌机」写的 ——
          **桌面窄 / 矮窗口下屋子还在，简洁模式是有对象可调的**（用户就是在那儿发现它没了）。
          `.rail-simple` 让 globals.css 把这一颗从「抽屉里不收」的名单里摘出来；
          移动端仍旧藏 —— 那条兜底规则在 globals.css 里写成了
          `:root[data-mobile='on'] .rail-desktop, :root[data-mobile='on'] .rail > .rail-simple`，
          **后半截不能省**：抽屉里给这颗设的 `display: flex` 特异性比光 `.rail-desktop` 那条高，
          少了它手机上抽屉里会冒出一颗掌机用不上的「简洁模式」。
          **别把这个类删了**，删了它就又只剩大屏那一种入口。
        */}
        <button
          type="button"
          onClick={toggleSimple}
          title={t(simple ? 'simple.exit' : 'simple.enter')}
          aria-label={t(simple ? 'simple.exit' : 'simple.enter')}
          aria-pressed={simple}
          className={`rail-desktop rail-simple pixel-edge pxw-2 p-1.5 transition-colors ${
            simple ? 'pxc-accent bg-accent/20 text-accent' : 'bg-ink-800 text-ink-300 hover:text-accent'
          }`}
        >
          <BroomIcon size={16} />
          {/*
            抽屉里那一行的文案写死的「简洁模式」（`menu.simple`），**不跟着开关翻**
            「进入 / 退出简洁模式」—— 和上面「主题」那颗同一个道理：它是一条目录项
            （说明这一行管什么），不是动作描述；跟着 `simple` 翻还会变成 React 挑文案。
            真正说「按下去切到哪」的是上面那个 title / aria。
          */}
          <span className="row-label">{t('menu.simple')}</span>
        </button>

        {/*
          电视机大小（大 / 中 / 小）。点一下在**钮的左侧**弹出三档，点哪档切哪档，
          当前那档高亮。2026-10-12 用户要求加在右侧这排里，默认「小」= 原来的尺寸。

          为什么收进一颗钮、而不是像主题 / 语言那样三段常驻：这一列是**竖排**的，
          三段并排会多占两行；而调尺寸是低频动作，没必要一直露着。
          弹层往**左**开（`right-full`）—— 这一列本来就贴着屏幕右沿，往右没地方。

          高亮不吃 React：`.tv-size-seg` 里那几条规则按 `<html data-tv>` 命中对应的
          `.seg-large / .seg-medium / .seg-small`（见 globals.css），属性是唯一真相。
          这里传 `aria-pressed` 只是给读屏用的。

          尺寸和状态都不在 React 里：尺寸由 globals.css 那组 --tv-* 变量推出来
          （见 lib/tv-size.ts 顶部注释）。图标 `TvSizeIcon` 是三格阶梯，不再随档位变。
        */}
        <div ref={tvMenuRef} className="rail-desktop relative">
          <button
            type="button"
            onClick={() => setTvMenuOpen(v => !v)}
            title={t('tvSize.open')}
            aria-label={t('tvSize.open')}
            aria-expanded={tvMenuOpen}
            className={`pixel-edge pxw-2 p-1.5 transition-colors ${
              tvMenuOpen ? 'pxc-accent bg-accent/20 text-accent' : 'bg-ink-800 text-ink-300 hover:text-accent'
            }`}
          >
            <TvSizeIcon size={16} />
            <span className="row-label">{t('tvSize.open')}</span>
          </button>

          {tvMenuOpen && (
            <div className="rail-menu tv-size-seg pixel-edge pxw-2 absolute right-full top-1/2 mr-1.5 -translate-y-1/2 bg-ink-800">
              {TV_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`seg-${size}`}
                  onClick={() => {
                    applyTvSize(size);
                    setTvMenuOpen(false);
                  }}
                  aria-pressed={tvSize === size}
                  aria-label={t('tvSize.pick', { level: t(TV_OPT_KEY[size]) })}
                >
                  {t(TV_OPT_KEY[size])}
                </button>
              ))}
            </div>
          )}
        </div>

        {/*
          「电视机大小」**抽屉专用**的那一行（2026-10-13 加，用户要求
          「图标 文案 大 中 小 都在一行」）。上面那颗钮 + 左弹弹层只在大屏开关列里用 ——
          弹层 `right-full` 的定位进抽屉会被裁掉，抽屉里换成这行**常驻的三格分段**。

          ⚠️ 大屏开关列里这一行是藏着的（globals.css 的 `.rail .rail-tvsize`），只在抽屉里
          `display: flex`；手机上整行再藏掉（掌机没有「电视机大小」）。
          三格**直接复用** `.tv-size-seg` 的样式和高亮 —— 高亮照样是 CSS 按
          `<html data-tv>` 命中的，不吃 React；点哪格 `applyTvSize` 切哪档。
          ⚠️ 这一格**不收抽屉**（就地生效，和主题 / 语言同一待遇）——
          `.entries` 那个 onClick 白名单里加了 `.rail-tvsize`，别删。
        */}
        <div className="rail-tvsize pixel-edge pxw-2 bg-ink-800">
          <span className="row-icon">
            <TvSizeIcon size={16} />
          </span>
          <span className="row-label">{t('tvSize.open')}</span>
          <div className="tv-size-seg">
            {TV_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                className={`seg-${size}`}
                onClick={() => applyTvSize(size)}
                aria-pressed={tvSize === size}
                aria-label={t('tvSize.pick', { level: t(TV_OPT_KEY[size]) })}
              >
                {t(TV_OPT_KEY[size])}
              </button>
            ))}
          </div>
        </div>

        <RailDivider />

        {/* ==================== 组 ②：游戏 ==================== */}

        {/*
          ⚠️ 2026-10-15：**这颗钮注释掉了 —— 房间里的游戏库入口收掉**（用户要求
          「/room 隐藏游戏库入口」）。

          它点开的是那个全屏在线游戏库弹窗；小屏抽屉里那一行「游戏库」就是**同一个
          DOM**（`.rail-games` 那个类只负责在抽屉里排 order，见 globals.css），
          所以一处注释掉，大屏竖排和抽屉两处一起没了。
          同一套一共三样，恢复时一起往回放：这颗钮 + 下面掌机的 `onOpenLibrary` +
          ConsoleScreen 待机层里那两行「从游戏库载入」提示。

          弹窗组件（`GameLibraryPanel`）和 `libraryOpen` 这个 state **没动** ——
          `?id=` 深链走的是另一个弹窗（`deepLinkGame`，刻意分开，见那边的注释），
          而 `/play` 那页本来就没有游戏库。这次关掉的是「屋里这扇门」，不是那条路。
          用户要的是**隐藏**而不是删掉，所以代码整块留着。
        */}
        {/* <button
          type="button"
          onClick={() => setLibraryOpen(true)}
          title={t('games.open')}
          aria-label={t('games.open')}
          className="rail-games pixel-edge pxw-2 bg-ink-800 p-1.5 text-ink-300 transition-colors hover:text-accent"
        >
          <StoreIcon size={16} />
          抽屉那行「游戏库」就是右上角「游戏列表」那条的合并版，见 nav 顶上的注释
          <span className="row-label">{t('games.open')}</span>
        </button> */}

        {/*
          联机。在房间里（等待或已连上）就一直亮着，免得关掉面板后忘了自己还在房。

          外面这层 `relative` 只是为了**挂延迟读数**：竖排这一列每个按钮才 28px 宽，
          里面塞不下字，所以把读数绝对定位到按钮**左边**（`right-full` + 一点外边距）。
          读数本身在 <html data-*> 之外、跟着 React state 走 —— 它两秒一刷，
          走 DOM 属性反而要自己管生命周期。

          ⚠️ 进抽屉之后「按钮左边」就是抽屉外了，所以那条读数在小屏被改成
          **流式的、贴着那行右端**（`.entries .rail-rtt`，见 globals.css），
          靠 `order` 从按钮前面挪到后面 —— 这里别为了好看改 DOM 顺序，
          大屏那侧靠的正是「读数在前、按钮在后」+ `right-full`。

          ⚠️ **载入 NDS 卡带时整块不画**（2026-10-15 用户定的「nds 不支持双人」）：
          它没有第二个手柄口，站里的联机也推不动它 —— 和游戏详情页那颗「联机游戏」
          是同一个门禁。手打 `?room=` 进来的那条由 `PlayScene` / 这里各自忽略。

          判据里 `status === 'idle'` 那半句**不能省**：房主先开房、再拖一盘 NDS 卡带
          进来是完全可能的，那时候把入口收掉等于**把人关在房间里出不来** ——
          「离开房间」那颗钮就在这个面板里。所以只收「本来就没在房间里」这一种。
        */}
        {!(rom?.console === 'nds' && netplayState.status === 'idle') && (
          <div className="rail-netplay relative">
            {/*
              延迟。只在**真的连上**且**测出值**时出现：`rtt` 是 ping 的往返时间，
              连上到第一次 ping 回来之间有一小段空窗，那时不显示比显示个「--」干净。
              用 font-pixel 的英文/数字（`123ms`），和面板里那一处读数同一套。
            */}
            {netplayState.status === 'connected' && netplayState.rtt !== null && (
              <span className="rail-rtt absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap font-pixel text-[12px] text-accent">
                {Math.round(netplayState.rtt)}ms
              </span>
            )}
            <button
              type="button"
              onClick={() => setNetplayOpen(true)}
              title={t('netplay.open')}
              aria-label={t('netplay.open')}
              className={`pixel-edge pxw-2 p-1.5 transition-colors ${
                netplayState.status !== 'idle'
                  ? 'pxc-accent bg-accent/20 text-accent'
                  : 'bg-ink-800 text-ink-300 hover:text-accent'
              }`}
            >
              <PlayersIcon size={16} />
              <span className="row-label">{t('netplay.open')}</span>
            </button>
          </div>
        )}

        {/* 自定义按键。单机双人也用得上，所以不跟着联机状态走。
            图标用手柄而不是键盘：这屋子里的按键本来就分手柄 / 键盘两条路，
            手柄才是主角（见 icons.tsx 的 GamepadIcon）。

            ⚠️ **载入 NDS 卡带时这颗不画**（2026-10-15 用户要求「nds 游戏按钮编辑隐藏」）。
            它开的是自定义按键面板；NDS 的键位是固定那套，给一颗点不出结果的入口
            不如不给。和 `/play` 操作表里那颗「编辑」是同一个门禁（见 PlayScene）。

            ⚠️ **只藏入口，不藏「按键说明」** —— 那扇门是另一颗钮（`.rail-legend`），
            用户明确要它显示 NDS 那套 L / R 丝印，别跟着一起收。

            面板本体（`KeyBindingsPanel`）和 `keybindOpen` 这个 state 都没动，
            `soloOnly` 那套逻辑留着 —— 放回入口时不用重写。 */}
        {rom?.console !== 'nds' && (
          <button
            type="button"
            onClick={() => setKeybindOpen(true)}
            title={t('keybind.open')}
            aria-label={t('keybind.open')}
            className="rail-keybind pixel-edge pxw-2 bg-ink-800 p-1.5 text-ink-300 transition-colors hover:text-accent"
          >
            <GamepadIcon size={16} />
            <span className="row-label">{t('keybind.open')}</span>
          </button>
        )}

        {/*
          ⚠️ 这里原来还有一颗**账号钮**（`.rail-account`，`setUserOpen(true)`）——
          2026-10-13 用户要求 PC 端右侧这列不再留账号图标，已撤掉。

          为什么撤得掉：右上角那行（`.top-links`）里那条账号本来就是同一件事的
          **更好写法**（未登录写「登录」、已登录写用户名，比一颗图标门儿清），
          早先只是「大屏两处都露、抽屉里合并成一份」。现在大屏也合并成一份了。

          别再把它加回来。`userOpen` 那个浮层仍在用（右上角未登录那颗 `<button>`），
          `UserIcon` 也还在 `.top-links` 里用着 —— 两者都别跟着删。
        */}

        <RailDivider />

        {/* ==================== 组 ③：帮助与留言 ==================== */}

        {/*
          按键说明。内容从**当前**键位现算（`playerLegend`），收进弹窗也永远是准的 ——
          写死过一次，结果是说明描述默认值、面板显示 localStorage 里存的那份，
          两边说的不是一回事（老用户看到「说明说 W/A/S/D、面板里却是方向键」）。
        */}
        <button
          type="button"
          onClick={() => setLegendOpen(true)}
          title={t('legend.open')}
          aria-label={t('legend.open')}
          className="rail-legend pixel-edge pxw-2 relative bg-ink-800 p-1.5 text-ink-300 transition-colors hover:text-accent"
        >
          <HelpIcon size={16} />
          <span className="row-label">{t('legend.open')}</span>
          {/*
            有待看的提示时点一颗灯。
            载入失败是**静默**的（屏幕里什么都不说），提示又只写在弹窗里 ——
            不点这一下用户根本不会去翻。7z / rar / 光盘描述文件那条（`archiveHint`）
            本来也有这个毛病，这次一起受益。
            用 `accent` 而不是 `danger`：这不是错误状态，是「有事要说」。
          */}
          {(archiveHint || biosHint) && (
            <span
              aria-hidden
              className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-accent"
            />
          )}
        </button>

        {/*
          留言本。和地板上那本打开的是**同一个面板**（`FeedbackPanel`），
          只是这里才是正经入口 —— 地板上那本从此是彩蛋。

          按钮文案直接借面板的标题（`feedback.title` = 留言本 / Guestbook）：
          它就是这个按钮最准的两个字，没必要再起一个同义键。
          `feedback.open` 那句「翻一翻地上那本留言本」是**地板那本专属**的措辞，
          指路指向地板，用在这里会把人对到房间里去，所以不借。
        */}
        <button
          type="button"
          onClick={() => setFeedbackOpen(true)}
          title={t('feedback.title')}
          aria-label={t('feedback.title')}
          className="rail-feedback pixel-edge pxw-2 bg-ink-800 p-1.5 text-ink-300 transition-colors hover:text-accent"
        >
          <NoteIcon size={16} />
          <span className="row-label">{t('feedback.title')}</span>
        </button>

        {/*
          **这一列原先最下面还有一颗盾牌钮**（账号 + 游戏列表 + 隐私 / 条款 + 语言
          收进一颗，点开往左弹一层）。它服务的是「移动端」和「桌面端矮窗口」那两种
          放不下右上角那一行文字链接的情况。

          2026-10-13 起这套并进了**小屏抽屉**（见上面 `.entries` 那段注释）：抽屉里装的
          就是真正的 `<nav className="top-links">` 和这一列 `.rail`，同一条链接不再有
          第二份副本。于是那颗钮、它的弹层、`legalMenuOpen`、以及 globals.css 里按
          `data-tv` 分档的三条高度媒体查询一起删了 —— 别因为「这一列看着少了一颗」
          又把它加回来。
        */}
      </div>
      </div>

      {/*
        房间 / 掌机**二选一** —— 判据是**设备**，不是窗口宽度（见上面 `mobile` 那段）。
        移动端那台掌机自己就是一台完整的机器（屏幕 + 按键），不需要屋子那套背景；
        桌面端照旧是那间屋子。两台机器各有一个 canvas，Nostalgist 只认 `canvasRef`
        指的那一个，所以这里必须二选一、不能靠 CSS 藏。
      */}
      {mobile ? (
        <HandheldConsole
          canvasRef={canvasRef}
          screenRef={screenRef}
          rom={rom}
          crtOff={crtOff}
          /* 和 RetroTv 同一套：房主报「没在玩」之后流可能还在路上，由 remotePlaying 说了算 */
          remoteStream={netplayState.remotePlaying ? remoteStream : null}
          remotePlaying={netplayState.remotePlaying}
          remotePaused={netplayState.remotePaused}
          netplayLive={netplayState.status === 'connected'}
          /* 房主开着房、还没人进来 —— PWR 灯变黄（口径同 RetroTv） */
          netplayWaiting={netplayState.status === 'waiting' && netplayState.role === 'host'}
          paused={paused}
          busy={busy}
          loading={loading}
          /*
            登录了就得让「读档」点得动 —— 本机没有也可能有云端的（换了台机器）。
            `cloudSave` 这时多半还是 null（只在存档 / 开面板时才拉），所以判据是**登录态**
            而不是它；点下去 `openLoad` 会把本机和云端一起重新拉一遍。
          */
          canLoad={localSave !== null || user !== null}
          volume={volume}
          /* 加入者本机没有卡带，面键长几个得看房主那盘（见 HandheldConsole 的 FACE_ROWS） */
          remoteGameConsole={netplayState.remoteGame?.console ?? null}
          /*
            ⚠️ 2026-10-15：**掌机「点屏幕开游戏库」这个入口一并收掉**（同上排那颗钮，
            两处是一套）。不传 `onOpenLibrary` 之后，ConsoleScreen 那颗待机点击层
            自己就不渲染了（`onTap` 没传就整层不画，见那边的注释）——
            掌机没卡带时屏幕就是一块安静的黑屏，而不是一颗点了没反应的按钮。
            要恢复：把这行放回来，再把上面那颗钮和 ConsoleScreen 里那两行提示放回来。
          */
          /* onOpenLibrary={() => setLibraryOpen(true)} */
          onButton={handleVirtualButton}
          onTogglePause={() => void togglePause()}
          onSave={() => void saveGame()}
          onLoad={() => void openLoad()}
          onReload={() => void reset()}
          onEject={() => void eject()}
          /* 音量：掌机上一条都没留（用户 2026-10-12 要求整块删掉），所以不传 onVolume；
             传给屏幕的 `volume` 仍在（加入者那条 <video> 靠它定音量） */
        />
      ) : (
        <div
          className="stage flex flex-col items-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) void loadFile(file);
          }}
        >
          {/*
            吊灯。**排在电视机之前** —— 整盏灯（灯具 + 光晕）都在机身背后：
            光晕糊在屏幕画面上就毁了；而窗口一矮天花板会贴到机身顶边，灯顶上去时
            也必须让**机身压住灯**，不能反过来挡着电视机（灯线会跟着窗口高度缩，
            见 globals.css 的 .lamp-cord）。
          */}
          <RoomLamp
            on={lampOn}
            onToggle={toggleLamp}
            label={t(lampOn ? 'lamp.turnOff' : 'lamp.turnOn')}
          />
  
          {/* 电视机。右侧那个卡带架 2026-10-09 撤掉了（历史挪进游戏库弹窗） */}
          <div className="relative flex items-end gap-4">
            {/*
              墙上的窗户。挂在这一层（= 电视机的盒子）上，窗户就永远贴着机身左上角。
              排在 RetroTv 之前 → 被机身挡住，只从左侧和上方露出两条。
  
              窗外是**四季**（靠 `<html data-season>` 切），**点玻璃换下一季** ——
              `cycleSeason` 只写属性和 localStorage，不经过 React（和吊灯同一套路）。
            */}
            <RoomWindow onCycleSeason={cycleSeason} label={t('window.cycle')} />
  
            {/*
              墙上挂的画。和窗户同一层、同样排在 RetroTv 之前 —— 挂在机身右侧那片空墙上
              （窗户占了左边）。七幅像素画里**刷新时随机抽一幅**，**点画框能看大图**
              （画面 + 画名 + 作者，见 `PaintingPanel`）—— 这两条都是 2026-10-12 用户当天提的，
              这里原先挂的是本日历。

              「抽到的是哪一幅」是 ConsoleScene 的状态（`wallPainting`），这里只把那一幅传下去 ——
              面板要摆出的正是墙上这一幅，这份状态只能有一处。
              抽签落地之前 `painting` 是 `null`，画框里是一块空画布、按钮也是禁用的。
            */}
            <RoomPainting
              painting={wallPainting}
              onOpen={() => setPaintingOpen(true)}
              label={t('painting.open')}
            />
  
            {/*
              地板铺在场景内部而不是视口上：这样地板线永远贴着物件的落地线，
              不会随窗口高度切到家具身上。
              向下铺 200vh 并让 main 的 overflow 裁掉，避免物件下方又露出墙面。
  
              墙地交界线按 **DESK_HEIGHT 再往下让**一段（原来是 `-150px`）：
              电视机摆在桌子上，桌子站在地板上 —— 交界线要落在**桌腿底端**，
              桌子才不是陷在地里。桌子是 absolute、不占布局，所以这里只能手算这个偏移。
            */}
            <div
              className="floor pointer-events-none absolute -inset-x-[600px] h-[200vh] bg-floor"
              style={{ top: `calc(100% + ${DESK_HEIGHT}px)` }}
            >
              <div className="absolute inset-x-0 top-0 h-[2px] bg-ink-800" />
            </div>
  
            {/*
              电视机左边那摞书后面那只猫（点了地板上那根逗猫棒才出现）。
              **必须排在 `RoomDesk` 之前** —— 挡住它下巴的正是桌子上那三本书，
              排到桌子后面就成了「浮在书上的一张猫脸」。
              它锚在桌面上方 19px 处（见 `TvCat` 里那段倒推出来的算式），
              所以和书堆的相对位置不随电视机尺寸档位变。

              `key={cat.seq}`：再点一次逗猫棒时整个重挂，两段 CSS 动画才会从头放。
              `label` 是品种名，只给读屏用（屏幕上不写名字，认品种靠毛色和花纹）。
            */}
            {cat && <TvCat key={cat.seq} breed={cat.breed} label={t(`cat.${cat.breed}`)} />}

            {/* 桌子。`top-full` 挂在电视机下沿，腿向下伸到地板上 */}
            <RoomDesk />
  
            {/*
              地板上那摊杂物（红白机 / 手柄 / 黄卡带 / 一本留言本 / 右下角那张纸片 /
              一根逗猫棒 / 一台插着耳机的 MP4）。
              **必须排在桌子之后** —— 它在桌子前面，压在桌腿上；排前面就会被桌子挡住，
              像嵌进桌子里。它自己锚在墙地交界线（`top-full` + DESK_HEIGHT），
              不占布局、也不影响机身。
  
              这摊里能点的有四处：**留言本**、右下角那张**纸片**（点开「一张纸」，
              见文件末尾那个弹窗）、那台 **MP4**（播放 / 暂停，音源在下面那个
              `<audio>` 上）、和那根**逗猫棒**（点一下，书堆后面探出一个猫头 ——
              见 `RoomBackdrop` 的 `TvCat`，以及上面那个 `<TvCat>`）。

              其中**留言本已经退成彩蛋**：留言本的正经入口挪到了右侧开关栏那颗（同一面板），
              这里纯粹是「顺手在房间里点到了也会开」的隐藏彩蛋。纸片则是唯一的入口，照旧；
              逗猫棒也只有这一处 —— 它点开的那只猫纯粹是闹着玩。
            */}
            <RoomFloorItems
              onOpenNote={() => setNoteOpen(true)}
              noteLabel={t('note.open')}
              onOpenFeedback={() => setFeedbackOpen(true)}
              feedbackLabel={t('feedback.open')}
              mp4Playing={mp4Playing}
              onToggleMp4={toggleMp4}
              /* 标签按状态现选：按钮的名字要说清「点下去会发生什么」，和吊灯那两颗同一个规矩 */
              mp4Label={t(mp4Playing ? 'mp4.pause' : 'mp4.play')}
              /* 逗猫棒：点一下，桌子左边那摞书后面探出一个猫头（见上面那个 TvCat） */
              onPokeCat={pokeCat}
              catWandLabel={t('cat.wand')}
            />

            <RetroTv
              canvasRef={canvasRef}
              screenRef={screenRef}
              rom={rom}
              /* 弹出卡带那 0.4 秒的「显像管关机」—— 只在 eject 里点亮，见那边的注释 */
              crtOff={crtOff}
              /*
                房主报「没在玩」之后流可能还在路上，所以屏幕上放什么由 remotePlaying
                说了算 —— 光看流有没有到会有一小段「已经弹卡了但还显示旧画面」。
              */
              remoteStream={netplayState.remotePlaying ? remoteStream : null}
              remotePlaying={netplayState.remotePlaying}
              remotePaused={netplayState.remotePaused}
              /*
                屏幕左上角那颗「已连接」小灯。两侧都亮 —— 房主同样会忘掉自己还在房间里，
                而「刚连上」那枚提示只活 4 秒。见 RetroTv 里那个 prop 的注释。
              */
              netplayLive={netplayState.status === 'connected'}
              /*
                房主开着房、还没人进来 —— 机身 PWR 灯变黄。**只认房主**：加入者那边的
                'waiting' 只是「正在对上」的一瞬，而房主可能无限期等下去。见 RetroTv 的 prop 注释。
              */
              netplayWaiting={netplayState.status === 'waiting' && netplayState.role === 'host'}
              paused={paused}
              busy={busy}
              loading={loading}
              /* 同掌机那处：登录态也算「可读」——本机空不代表云端空 */
              canLoad={localSave !== null || user !== null}
              volume={volume}
              fileOver={fileOver}
              onPickFile={() => romInputRef.current?.click()}
              onDragOver={() => setFileOver(true)}
              onDragLeave={() => setFileOver(false)}
              onDropFile={handleDropFile}
              onTogglePause={() => void togglePause()}
              onSave={() => void saveGame()}
              onLoad={() => void openLoad()}
              onReload={() => void reset()}
              onEject={() => void eject()}
              onVolume={changeVolume}
              onExitFullscreen={exitFullscreen}
            />
          </div>
        </div>
      )}

      {/*
        离开房间的确认。**只有房间里正有活时才会打开**（`roomBusy`）——
        空房间点「游戏列表」是直接跳的，压根不经过这里，理由见 `leaveOpen` 那段注释。

        放在所有面板**前面**没有别的原因，只是它离「导航」这件事最近。
        样式照抄存档面板那套（同一块带像素描边的卡片 + 点背板 / Esc 关掉）。

        「离开」那颗钮是 `<Link href="/games">` 而不是「onClick 里 router.push」：
        这个项目里跳转一律走 `<Link>`，而且「离开」本来就是一次真导航 ——
        用链接语义更准，中键 / 长按右键也能用。
        （`useRouter` 全文件只在右上角那颗语言 `<select>` 里用过一次 —— 下拉没有
        `href`、只能程序化导航；别处照旧一律 `<Link>`。）

        联机时文案换一条（`leave.bodyNetplay`）：对面会掉线，是更重的后果，
        不该只说「游戏会中断」。
      */}
      {leaveOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => setLeaveOpen(false)}
        >
          <div className="absolute inset-0 bg-ink-950/70" />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('leave.title')}
            className="relative w-[360px] max-w-full bg-ink-800 pixel-edge pxw-4 pxc-600"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b-2 border-ink-900 bg-ink-850 px-4 py-3 text-[12px] text-ink-200">
              {/* 黄色警告三角。图标吃 `currentColor`，这里套一层 `text-warn` 上色 ——
                  浅色主题下会把 warn 调深，不用另配一份色。 */}
              <span className="flex text-warn">
                <WarningIcon size={16} />
              </span>
              <span>{t('leave.title')}</span>
            </div>

            <p className="px-4 py-4 text-[12px] leading-relaxed text-ink-300">
              {netplayState.status !== 'idle' ? t('leave.bodyNetplay') : t('leave.bodyGame')}
            </p>

            <div className="flex border-t-2 border-ink-900">
              <button
                type="button"
                onClick={() => setLeaveOpen(false)}
                className="flex-1 border-r-2 border-ink-900 px-4 py-3 text-[12px] text-ink-200 transition-colors hover:bg-ink-700 hover:text-ink-100"
              >
                {t('leave.stay')}
              </button>
              {/* flex 会把行内元素 block 化，所以这里不用再补 `block`。
                  「离开」走 danger 红：它才是那个**真会丢东西**的动作，
                  和「留下」拉开距离，别让人手一滑点错。 */}
              <Link
                href={localeHref('/games')}
                className="flex-1 px-4 py-3 text-center text-[12px] text-danger transition-colors hover:bg-danger/15"
              >
                {t('leave.confirm')}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/*
        存档列表。刻意浮在房间上、**不进屏幕** —— 屏幕里跑的是游戏画面，
        盖一张列表上去就把画面挡了；而且它是要点选的面板，不该占着显像管。
        屏幕里只放**状态提示**（怎么开始玩 / RELEASE TO LOAD / 载入进度 / PAUSED），
        要读的说明一律走这种弹窗。存档列表尤其如此 —— 它是要点选的东西，
        而且从 2026-10-10 起它也是读档**唯一**的入口（F8 那个快捷键撤了）。

        它自己不是物件，没必要做成拟物：一块带像素描边的面板 + 点背板或 Esc 关掉。

        **两组并列**（2026-10-13 加云端那组）：
        - 「本机」= IndexedDB，断网 / 不登录也能存，保底；
        - 「云端」= R2（登录了才有），换台机器还在。
        用户不必知道区别，两组都列出来、点哪条读哪条。任一为空就整组不画 ——
        空组画一个空标题比不画更让人困惑。

        **面板一开就是「读取中」**（2026-10-13）：`openLoad` 现在先弹面板再取数，
        取数期间只画一行 `saves.loading`，两边都空则画 `saves.empty`。
      */}
      {saveOpen && rom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => setSaveOpen(false)}
        >
          <div className="absolute inset-0 bg-ink-950/70" />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('saves.title')}
            className="relative w-[440px] max-w-full bg-ink-800 pixel-edge pxw-4 pxc-600"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b-2 border-ink-900 bg-ink-850 px-4 py-3">
              <span className="text-[12px] text-ink-200">{t('saves.title')}</span>
              {/*
                ⚠️ 这里原本有个 `00/05` 的槽位计数，**2026-10-15 撤掉**：存档换成电池存档
                之后一款只有一份（`lib/saves.ts` 的主键就是 ROM 文件名），没有「几份」
                这个维度了。留着反而在暗示「你还能再存 4 份」。
              */}
              <button
                type="button"
                aria-label={t('saves.close')}
                onClick={() => setSaveOpen(false)}
                className="pixel-edge pxw-2 pxc-500 flex h-[18px] w-[18px] items-center justify-center bg-ink-700 text-[12px] leading-none text-ink-100 hover:bg-danger hover:text-ink-950"
              >
                ×
              </button>
            </div>

            {/* 取数期间只画这一行 —— 旧列表一闪会让人以为列表不对（见 savesLoading 的注释） */}
            {savesLoading ? (
              <div className="px-4 py-6 text-center text-[12px] text-ink-400">
                {t('saves.loading')}
              </div>
            ) : !localSave && !cloudSave ? (
              /* 两边都空。面板既然已经弹出来了，就得说一句 —— 只剩一个标题会像坏了 */
              <div className="px-4 py-6 text-center text-[12px] text-ink-400">
                {t('saves.empty')}
              </div>
            ) : (
              <>
                {/* 本机那一份。没有就整组不画（第一次玩这一款时就是这种情况，
                    「没有本机存档」本身不值得占一行） */}
                {localSave && (
                  <>
                    <div className="border-b-2 border-ink-900 bg-ink-850/60 px-4 py-1.5 text-[12px] text-ink-400">
                      {t('saves.groupLocal')}
                    </div>
                    <div className="flex flex-col">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void loadLocalSave()}
                        className="flex items-center justify-between gap-4 border-b-2 border-ink-900 px-4 py-3 text-left text-[12px] text-ink-200 transition-colors last:border-b-0 enabled:hover:bg-ink-700 enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <span>{formatTime(localSave.createdAt, locale)}</span>
                        <span className="shrink-0 text-[12px] opacity-60">{t('saves.load')}</span>
                      </button>
                    </div>
                  </>
                )}

                {/* 云端那一组。登录了 + 有存档才画；删要两下（第二下是 ✕ 变红），
                    和后台「删用户」同一个防手滑思路 —— 这一下删的是 R2 上的对象，没法撤。
                    ⚠️ 这一行的 `gap-4` 是 2026-10-13 从 `gap-2` 调大的：原本「加载」
                    两个字紧贴着右边那个删除 ✕，想读档很容易点到删除 */}
                {cloudSave && (
                  <>
                    <div className="border-b-2 border-ink-900 bg-ink-850/60 px-4 py-1.5 text-[12px] text-ink-400">
                      {t('saves.groupCloud')}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-4 border-b-2 border-ink-900 py-3 pl-4 pr-3 last:border-b-0">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void loadCloudSave()}
                          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left text-[12px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate">{formatTime(cloudSave.createdAt, locale)}</span>
                            {/* 小云朵：区分这行是云端那份（和上面「本机」组的时间裸排对照） */}
                            <svg
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              aria-hidden="true"
                              className="h-3 w-3 shrink-0 text-ink-400 opacity-80"
                            >
                              <path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
                            </svg>
                          </span>
                          {/* 读取中这行的「加载」文字换成转圈 —— 外层 span 留着占位，布局不跳 */}
                          <span className="flex shrink-0 items-center text-[12px] opacity-60">
                            {loadingCloud ? (
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                aria-hidden="true"
                                className="h-3.5 w-3.5 animate-spin"
                              >
                                <circle
                                  cx="12"
                                  cy="12"
                                  r="9"
                                  stroke="currentColor"
                                  strokeOpacity="0.25"
                                  strokeWidth="3"
                                />
                                <path
                                  d="M21 12a9 9 0 0 0-9-9"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                />
                              </svg>
                            ) : (
                              t('saves.load')
                            )}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={t('saves.deleteCloud')}
                          title={t('saves.deleteCloud')}
                          onClick={() => void removeCloudSave()}
                          className="pixel-edge pxw-1 pxc-500 flex h-[16px] w-[16px] shrink-0 items-center justify-center bg-ink-700 text-[12px] leading-none text-ink-300 transition-colors enabled:hover:bg-danger enabled:hover:text-ink-950 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/*
        联机面板。和存档列表一样浮在房间上、**不进屏幕** ——
        屏幕里跑的是游戏画面，这张面板要写字、还要输入房间码。
      */}
      <NetplayPanel
        /*
         * `key` 挂的是预填码：从分享链接确认加入时 `joinPrefill` 一变，面板就重挂载、
         * 输入框用新码重新初始化。平时它一直是 `''`，面板不会无谓地重建。
         */
        key={joinPrefill ?? ''}
        open={netplayOpen}
        state={netplayState}
        busy={netplayBusy}
        initialCode={joinPrefill ?? ''}
        mode={netplayMode}
        onModeChange={setNetplayMode}
        quality={streamQuality}
        onQualityChange={changeStreamQuality}
        onClose={() => setNetplayOpen(false)}
        onCreate={() => void createRoom()}
        onJoin={(code) => void joinRoom(code)}
        onLeave={() => void leaveRoom()}
      />

      {/*
        自定义按键面板。和上面两块一样浮在房间上、不进屏幕。
        role + localPlaying 决定底部那句提示：加入者用的是他自己那套（1P 组）、改完立刻生效；
        但他要是自己在房主出画面之前插了一盘，那盘也按同一组读键盘，一样要重载卡带。
        `rom !== null` 就是「本机跑着一盘自己的卡带」，同时也是重载按钮的可用条件。

        `role` 还决定**页签锁在哪一组**：联机时只能改自己那组（两边都是 1P 那组），
        所以面板在房间里只画一个标签、不给切换。见 KeyBindingsPanel 的 lockedPlayer。

        `consoleType` 管另外两件事：面板画哪几个钮、钮叫什么（NDS 是 A/B/X/Y + L/R +
        L2/R2 + START/SELECT），以及**单人机也要收成一个页签**（NDS 不支持双人）。
      */}
      <KeyBindingsPanel
        open={keybindOpen}
        bindings={bindings}
        consoleType={rom?.console ?? null}
        role={netplayState.role}
        localPlaying={rom !== null}
        onChange={applyBindings}
        onReload={reloadRom}
        onClose={() => setKeybindOpen(false)}
      />

      {/*
        `/room?id=` 深链的这一款 —— **独立弹窗**（见 `deepLinkOpen` / `deepLinkGame`）。

        为什么不是把游戏库面板打开：用户点的是「开始游戏」，他要的就是这一款，
        把十几张封面摊开、再从里面挑出这一张来，纯属多闪一下。这里只有
        封面 + 名字 + 进度 + 取消，说的和面板底部那条状态栏是同一件事。

        ⚠️ **开窗的判据是 `deepLinkOpen` 而不是 `deepLinkGame`**：有 id 就立刻开窗、
        数据随后填进去 —— 走服务端预取（`serverGame`）这条路时两者在同一次绘制前就都
        落定了，弹窗第一帧就是封面和名字；只有接口兜底那条路才看得到 loading 骨架
        （`deepLinkGame` 还是 null 的那几百毫秒）。所以下面每一处用 `deepLinkGame`
        的地方都得先过一遍空值。

        ⚠️ **不给点背景关闭**：这一笔下载是有实体的（几十 MB 正在飞），
        点一下外面就关掉、下载却还在跑，比关不掉更糟。要退出只有两条路：
        等它下完（弹窗自己收掉、画面交给屏幕），或者点「取消」（= 把两段请求都 abort）。
        Esc 走的也是取消（见上面那条 effect）。

        两条路都会经 `closeDeepLink` —— 只收弹窗，**地址栏的 `?id=` 留着**
        （2026-10-14 用户要求不清了：地址要能分享 / 刷新重开同一款）。
      */}
      {deepLinkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-ink-950/70" />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('deepLink.title')}
            className="relative w-[400px] max-w-full bg-ink-800 pixel-edge pxw-4 pxc-600"
          >
            <div className="border-b-2 border-ink-900 bg-ink-850 px-4 py-3 text-[12px] text-ink-200">
              {t('deepLink.title')}
            </div>

            <div className="flex gap-4 px-4 py-4">
              {/*
                封面按 3:4 裁（和游戏库网格里那些一致）。数据还没到时它就是一块空的
                灰底 —— 占位骨架，不是「图挂了」：底下那句「载入中…」会说清在等什么。
              */}
              <div className="h-[96px] w-[72px] shrink-0 overflow-hidden bg-ink-900 pixel-edge pxw-2 pxc-500">
                {deepLinkGame && (
                  <>
                    {/* R2 公网域名，不走 next/image（理由同 GameLibraryPanel 里那张封面） */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={deepLinkGame.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </>
                )}
              </div>

              <div className="min-w-0 flex-1">
                {/* 名字那一行先拿一块灰条占住，免得数据一到弹窗就长高跳一下 */}
                {deepLinkGame ? (
                  <p className="truncate text-[13px] text-ink-100">
                    {localizeLibraryGame(deepLinkGame, locale).title}
                  </p>
                ) : (
                  <span className="block h-[15px] w-2/3 bg-ink-700" />
                )}
                <p className="mt-1 h-[10px] font-pixel text-[12px] text-ink-400">
                  {deepLinkGame ? consoleLabel(deepLinkGame.consoleType, locale) : null}
                </p>

                {/*
                  两段不一样的文案：数据还没到说「载入中…」（这时候还没开始下 ROM，
                  说「正在下载 ROM」是句假话），数据到了才是 `deepLink.loading`。
                */}
                <p className="mt-3 text-[12px] text-ink-300">
                  {deepLinkGame ? t('deepLink.loading') : t('games.loading')}
                </p>
                <span className="relative mt-2 block h-[6px] w-full overflow-hidden bg-ink-900">
                  {libraryProgress === null ? (
                    <span className="load-slide absolute inset-y-0 left-0 w-1/3 bg-accent/70" />
                  ) : (
                    <span
                      className="absolute inset-y-0 left-0 bg-accent"
                      style={{ width: `${Math.round(libraryProgress * 100)}%` }}
                    />
                  )}
                </span>

                <div className="mt-2 flex items-center gap-2">
                  {/* 固定宽度：百分数从 9% 跳到 100% 时右边那颗钮不许跟着挪 */}
                  <span className="w-[34px] shrink-0 text-[12px] text-ink-500">
                    {libraryProgress === null ? '' : `${Math.round(libraryProgress * 100)}%`}
                  </span>
                  <button
                    type="button"
                    onClick={cancelDeepLink}
                    className="pixel-edge pxw-2 pxc-500 ml-auto flex h-[24px] shrink-0 items-center bg-ink-700 px-3 text-[12px] text-ink-200 transition-colors hover:bg-danger hover:text-ink-950"
                  >
                    {t('games.cancel')}
                  </button>
                </div>
              </div>
            </div>

            <p className="border-t-2 border-ink-900 bg-ink-850 px-4 py-2 text-[12px] text-ink-400">
              {t('deepLink.hint')}
            </p>
          </div>
        </div>
      )}

      {/*
        在线游戏库。和上面三块一样浮在房间上、不进屏幕。
        弹窗里两个 tab：「游戏库」是在线列表（选中的那盘由父级记 loadingId，
        弹窗据此把卡片置灰、并显示下载进度），「历史」是**从游戏库点开过的那批**——
        数据直接用父级的 `library`，面板自己不再去翻一遍 IndexedDB。
        两个 tab 点下去走的是同一条载入路径（`loadRemote`），差别只在历史那条多带一层
        已存的字符串记录（见 ConsoleScene 里 `loadRemote` 的注释）。
      */}
      {libraryOpen && (
        <GameLibraryPanel
          loadingId={libraryLoadingId}
          downloadingTitle={romDownload?.title ?? null}
          progress={libraryProgress}
          cartridges={library}
          activeId={activeId}
          onPick={(game) => void loadRemoteGame(game)}
          /*
            从「历史」里挑一盘 —— 和上面在线库那张卡片走**完全同一条路**：
            面板先留着显示下载进度和「取消」（历史里只有地址，点下去还得下一遍），
            `loadRemote` 拿到整包自己会把面板关掉，再把画面交给屏幕里的核心进度条。
          */
          onPickCartridge={(cartridge) => void loadRemote(cartridge)}
          onRemoveCartridge={(id) => void removeFromLibrary(id)}
          onCancelLoad={cancelRemoteLoad}
          /*
            收藏：`favoriteIds` 传下去当星标的状态源，`onToggleFavorite` 是那颗星的回调。
            `null`（未登录）会原样传下去 —— 面板靠这个区分「星标不亮是因为没登录」
            还是「因为真的没收藏」，前者点一下要弹登录面板。
          */
          favoriteIds={favoriteIds}
          onToggleFavorite={toggleFavorite}
          /*
            收藏 tab 里那颗「登录」—— 开账号面板、**顺手把游戏库面板关掉**。
            两个模态叠着不好看（上面那个一关、下面这个又冒出来），而且用户点「登录」
            本来就是要离开这个 tab 去做另一件事。
          */
          onSignIn={() => {
            setLibraryOpen(false);
            setUserOpen(true);
          }}
          onClose={() => setLibraryOpen(false)}
        />
      )}

      {/*
        前台账号面板（登录 / 注册 / 退出）。和上面几块一样浮在房间上、**不进屏幕**。

        `user` / `userLoading` 传下去只是为了画对已登录态；真正的登录动作走
        `onAuthed` 回到父级（收藏集合要跟着重拉，见 handleAuthed 的注释）。
      */}
      {userOpen && (
        <UserPanel
          user={user}
          loading={userLoading}
          onAuthed={handleAuthed}
          onSignedOut={handleSignedOut}
          onClose={() => setUserOpen(false)}
        />
      )}

      {/*
        按键说明。原先是一块常驻在电视机右上角上方（`pointer-events-none`）的文字，
        现在收进右侧那排开关里的问号按钮 —— 它本来就只是给人读的，占着一块地方还压机身。

        和上面几块面板一样浮在房间上、**不进屏幕**。压缩格式那条提示也挂在这儿：
        载入失败在屏幕上是静默的，这是唯一还能说出「为什么没反应」的地方。
      */}
      {legendOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => setLegendOpen(false)}
        >
          <div className="absolute inset-0 bg-ink-950/70" />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('legend.title')}
            className="relative w-[420px] max-w-full bg-ink-800 pixel-edge pxw-4 pxc-600"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b-2 border-ink-900 bg-ink-850 px-4 py-3">
              <span className="text-[12px] text-ink-200">{t('legend.title')}</span>
              <button
                type="button"
                aria-label={t('legend.close')}
                onClick={() => setLegendOpen(false)}
                className="pixel-edge pxw-2 pxc-500 ml-auto flex h-[18px] w-[18px] items-center justify-center bg-ink-700 text-[12px] leading-none text-ink-100 hover:bg-danger hover:text-ink-950"
              >
                ×
              </button>
            </div>

            {/*
              系统字体 11px，**不用 font-pixel**：里面有 ↑↓←→ 和小键盘名，
              而 Press Start 2P 没有箭头字形，那几个会掉回系统字体、和旁边的
              `J`、`Enter` 混排出两种字形。
            */}
            <div className="flex flex-col gap-2 p-4 text-[12px] leading-relaxed text-ink-300">
              {/*
                `rom?.console` 一路传给 `playerLegend`：钮名要按机种给 —— NDS 那行得是
                `I=L · O=R`（肩键）而不是街机叫法的 `I=Y · O=Z`，否则说明里根本
                找不到 L / R 这两颗（2026-10-15 用户要求）。

                **玩家 2 那一行单人机不画**（NDS）：它没有第二个手柄口，列一行
                「2P …」等于告诉用户这台机器能双人。键位面板里的页签同理，见
                KeyBindingsPanel 的 soloOnly。

                两边都套 `renderPadGlyphs`：`playerLegend` 给的是**纯字符串**，
                里面 PS1 那四颗（△ ○ × □）在 Unicode 里跨两个区、同字号下大小对不齐，
                得当场换成图形（根因与画法见 components/PadGlyph.tsx）。
                别的机种那行（`A` / `Y` / `L`）原样是文字，套上去无副作用。
              */}
              <p>{renderPadGlyphs(playerLegend(bindings.p1, 1, t, rom?.console ?? null))}</p>
              {rom?.console !== 'nds' && (
                <p>{renderPadGlyphs(playerLegend(bindings.p2, 2, t, rom?.console ?? null))}</p>
              )}
              {/* 手柄不列键位 —— 它是固定的标准布局，改不了，见 lib/gamepad.ts */}
              <p>{t('legend.gamepad')}</p>
              {/*
                这里原来还有一行 `legend.shortcut`（P 暂停 / R 重置 / F5 存档 / F8 读档）。
                快捷键 2026-10-10 全撤了，那行文案跟着删掉 —— 留着就是教用户去做一件
                现在不会有任何反应的事。暂停 / 重置 / 存档 / 读档都在机身前面板上，
                按钮上写的字和这里原来那句一模一样，不需要再说明一遍。
              */}
              {/*
                格式那一行。三种来源共用一个通道：
                  · `7z` / `rar` —— 压缩格式吃不下的，要带 `{ext}` 参数；
                  · `disc` —— **多文件光盘镜像的描述文件**（`.cue` / `.m3u` / `.toc` / `.ccd`），
                    这条不用参数（它说的不是「哪种格式」而是「要单文件」）。
              */}
              {archiveHint &&
                (archiveHint === 'disc' ? (
                  <p>{t('legend.needDisc')}</p>
                ) : (
                  <p>{t('legend.needZip', { ext: archiveHint })}</p>
                ))}
              {/*
                Neo Geo 缺 BIOS。判据是**猜**的（`looksLikeNeoGeoRomset` 按 rom 名认），
                所以文案写的是「看着像…需要」，别改成断言。
                只有**本地和站点自带那两份都没拿到**时才会亮 —— 正常情况下 `ensureBios()`
                会自动把站点那份装上，这条根本不会出现（见 loadFile 里那段）。
              */}
              {biosHint && <p>{t('legend.needBios')}</p>}

              {/*
                重看操作指引。**先关自己再开指引** —— 两个弹窗的层级不一样
                （这里 z-50，指引 z-[60]），虽然指引会盖在上面，但留着这个面板
                会让底下那颗「按键说明」按钮一直保持按下态，收尾时不好看。
              */}
              <button
                type="button"
                onClick={() => {
                  setLegendOpen(false);
                  setTourOpen(true);
                  /* 和首次访问那条同一个道理：指引一开，别的提示得让路 */
                  window.dispatchEvent(new Event(TOUR_OPEN_EVENT));
                }}
                className="pixel-edge pxw-2 pxc-500 mt-1 self-start bg-ink-700 px-3 py-1.5 text-[12px] text-ink-100 transition-colors hover:bg-ink-600 hover:text-accent"
              >
                {t('tour.replay')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/*
        「一张纸」。点地板右下角那张纸片弹出来的。

        它和别的面板不是一路货：那些是工具，这张纸只是一句祝福。所以刻意做成
        **游戏里过场提示**的样子 —— 整个窗口糊掉（backdrop-blur），中间浮起一张纸。
        点背板或 Esc 关掉。

        **背板用固定暗色，不走 ink 令牌**（别的面板都是 `bg-ink-950/70`）：
        ink-950 会随主题翻，浅色主题下它是近白（#f1f1f4），45% 叠上去整屏变成一片白雾
        —— 用户报「纸片打开时不能纯白」就是指这个。过场提示本来就该把世界压暗。

        纸是**物件**，颜色全写死（和地板杂物、吊灯一个规矩），不跟主题翻 ——
        白天夜里它都是这张米黄的纸。**刻意用 `#e8dcbd` 而不是更浅的纸色**：
        用户明确要「不能纯白」，所以给足黄味。

        **纸上铺的是作业本那种横线**（`.note-rules`，globals.css）：
        一行 30px、线在行内 23px 处，正文 `leading-[30px]` 正好**坐在线上**。
        书写区高 240 = 30 × 8 行，顶底都收在整行边界上，不会切出半条线。

        正文走 `font-pixel`：英文是真像素字；**中文没有像素字模**，
        会掉回系统等宽字体（和屏幕里那句提示同一个取舍，见 RoomBackdrop 顶部那段）。
      */}
      {noteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => setNoteOpen(false)}
        >
          {/* 背板：模糊 + 压暗。固定暗色 —— 理由见上面那段 */}
          <div className="absolute inset-0 bg-[#0b0b10]/55 backdrop-blur-[3px]" />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('note.title')}
            className="relative w-[400px] max-w-full bg-[#e8dcbd] pixel-edge pxw-4 pxc-paper"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 折角：右上角折下去的那一块（外暗内亮，读起来是纸被翻起来一个角） */}
            <span aria-hidden className="absolute right-0 top-0 h-[18px] w-[18px] bg-[#cdbb92]" />
            <span aria-hidden className="absolute right-[5px] top-[5px] h-[8px] w-[8px] bg-[#f0e7cf]" />

            {/* 书写区：作业本横线 + 写在线上的字 */}
            <div className="note-rules mx-10 my-8 h-[240px]">
              <p className="font-pixel text-[12px] leading-[30px] text-[#3b3327]">
                {t('note.text')}
              </p>
            </div>

            {/* 关掉。压在纸的右下角，用纸色系做底、深棕做字 */}
            <button
              type="button"
              aria-label={t('note.close')}
              onClick={() => setNoteOpen(false)}
              className="absolute bottom-[12px] right-[12px] flex h-[24px] w-[24px] items-center justify-center bg-[#d6c69e] text-[13px] leading-none text-[#6b5c3c] transition-colors hover:bg-[#3b3327] hover:text-[#e8dcbd]"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/*
        挂画的大图。点墙上那个画框弹出来 —— 画面就是把同一份笔画数据放大
        （不另画一张大的），说明牌上摆画名和作者。点背板 / × / Esc 关掉。

        ⚠️ `wallPainting` 那道判据是必须的：抽签落地之前墙上还只是一块空画布，
        这时点开只会弹出一张空框。
      */}
      {paintingOpen && wallPainting && (
        <PaintingPanel
          painting={wallPainting}
          onClose={() => setPaintingOpen(false)}
        />
      )}

      {/*
        留言本。点地上那本弹出来 —— 和存档 / 联机 / 按键几块面板同一套视觉，
        但内容是从 `/api/feedback` 拉的（公开），并且自带提交框。
        列表状态全在面板内部：每次打开都是全新挂载；翻页进度和已拉过的页靠
        `FeedbackPanel` 文件里那份**模块级页缓存**跨挂载保留，父级一概不碰
        （缓存必须挂在模块上 —— 挂组件里的话「关掉再打开」就白费了，而 D1 请求有限额）。
      */}
      {feedbackOpen && <FeedbackPanel onClose={() => setFeedbackOpen(false)} />}

      {/*
        分享链接带进来的房间邀请。和操作指引同为 z-[60]，但挂在 DOM 更靠后 ——
        撞上时它画在上面（从链接进来的新用户正好会赶上「初次访问的指引」）。
      */}
      {pendingRoom !== null && (
        <JoinRoomPrompt code={pendingRoom} onConfirm={acceptInvite} onCancel={dismissInvite} />
      )}

      {/*
        操作指引。挂在所有弹窗**之后**、层级也最高（z-[60]，其余是 z-50）——
        它要能圈住右侧那排开关（z-40）和整台机身，还要把底下的点击全吃掉。
        初次访问由上面那个 effect 自动打开，之后从「按键说明」里的按钮重看。

        **有待确认的房间邀请时让位**（`!pendingRoom`）：先答「进不进这个房间」，
        进完再看指引 —— 反过来会变成「一张指引糊在邀请上面」，点都点不着。
        邀请处理完它会自己补上（`tourOpen` 没被清掉）。
      */}
      <OnboardingTour open={tourOpen && !pendingRoom} onClose={closeTour} />

      {/*
        房间顶上那枚提示。几秒后自己消失（见上面那个 setTimeout 的 effect）。
        两种内容：① 联机 —— 刚连上（ok）/ 对方离开（danger），由 netplay 的 onState
        写进来（它认的是「刚连上」和「已连接 → 断开」这两个跳变）；
        ② `?id=` 深链那款游戏在库里找不到（danger），由下面那个深链 effect 写进来。

        几个刻意的选择：
        - **层级压在面板之下**（z-40，面板是 z-50）：它不是面板，只是一句回执，
          用户在连上的同一瞬间顺手打开了别的弹窗，那一屏该盖住它。
        - `pointer-events-none`：它飘在房间顶上，绝不能替底下的按钮接走点击。
        - 绿点 / 琥珀点 + `pxc-ok` / `pxc-warn` 描边，分别和联机面板里那颗「已连接」
          的绿点、报错那行琥珀色是同一套视觉 —— 说的是同一件事，一眼就能对上。
        - 居中交给外层容器的 `-translate-x-1/2`，入场动效在内层（`.toast-pop`）——
          两个 transform 落在一个元素上会互相顶掉，见 globals.css 那段注释。
        - 房间是桌面端专用的（900px 起），不用考虑窄屏换行。
      */}
      {toast && (
        <div className="pointer-events-none fixed left-1/2 top-6 z-40 -translate-x-1/2">
          <div
            role="status"
            className={`toast-pop pixel-edge ${toast.kind === 'ok' ? 'pxc-ok' : 'pxc-danger'} pxw-3 flex items-center gap-2 bg-ink-800 px-3 py-2`}
          >
            <span
              className={`h-[7px] w-[7px] shrink-0 ${toast.kind === 'ok' ? 'bg-ok' : 'bg-danger'}`}
            />
            <span className="text-[12px] whitespace-nowrap text-ink-100">{t(toast.key)}</span>
          </div>
        </div>
      )}

      <input
        ref={romInputRef}
        type="file"
        accept=".nes,.fds,.unf,.unif,.sfc,.smc,.swc,.fig,.bs,.gba,.agb,.zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void loadFile(file);
          e.target.value = '';
        }}
      />

      {/*
        地板上那台 MP4 的音源。放在这儿（和 ROM 的 file input 并排）是因为它
        **不参与任何布局** —— 挂进房间那棵树里只会让「哪一层在管什么」更难读。

        `src` 是**首选**音源，不是唯一：文件不在时 `toggleMp4` 会把它换成现场摇的
        8-bit 小段（`lib/chiptune.ts`，每次点都摇一段新的），所以这里是个常量也没关系
        （React 只在 props 变化时重写属性，不会把改过的 `src` / `loop` 顶回去）。
        文件要自己放到 `public/audio/i-miss-you.mp3`，见该目录的 README。

        `preload="none"`：别在首屏就去拉一个几 MB 的音频。
        `loop`：一首歌循环放 —— 这是个彩蛋，不是播放器。
        （兜底那段不受它管：`toggleMp4` 换音源时会一并把 `loop` 撤掉，放一遍就停。）

        `onEnded`：只对**不循环**的兜底那段有意义 —— 放完了要把播放态收回去，
        否则屏幕会一直停在「正在播」的样子。真歌带 `loop`，这个事件永远不触发。
      */}
      <audio
        ref={mp4AudioRef}
        src="/audio/i-miss-you.mp3"
        loop
        preload="none"
        onEnded={() => setMp4Playing(false)}
      />
    </main>
  );
}
