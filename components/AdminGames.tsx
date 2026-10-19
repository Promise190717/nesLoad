'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { detectConsole, type ConsoleType } from '@/lib/emulator';
import { CONTENT_LOCALES, EMPTY_GAME_TEXT, type ContentLocale, type GameText, type GameTexts } from '@/lib/game-text';
import { GAME_LANGUAGES, GAME_LANGUAGE_LABEL, romLangToFormValue } from '@/lib/rom-lang';
import { unwrapRom } from '@/lib/unwrap';
import AdminAddGame from './AdminAddGame';
import AdminAutoCrawl from './AdminAutoCrawl';
import AdminBulkImport from './AdminBulkImport';
import AdminLoading from './AdminLoading';
import { FIELD_CLASS } from './adminStyles';
import { CONSOLE_LABEL, CONSOLE_TYPES } from './CartridgeSprite';

/**
 * `/api/admin/games` 返回的条目（= lib/server/games.ts 的 `AdminGame`，也就是
 * `Game` 再多一个 `groupSize`）。
 */
interface AdminGame {
  id: string;
  /**
   * 文案按语言索引（`game_texts` 侧表，见 lib/game-text.ts）。
   * 表单读写**四个语言**（zh / en / ja / ko —— 日韩两栏 2026-10-16 加）；
   * 列表那一行显示的仍是**中文原文**（见下面 `zhText`）—— 那一栏是「原始资料」，
   * 不跟着界面语言变。
   *
   * ⚠️ 这份文案挂的是**同款**（`games.group_key`）不是这一盘 ROM ⇒ 同款几个语言版本
   *    读的是同一份，改一次 = 改整款（见编辑弹窗里那句提醒）。
   */
  texts: GameTexts;
  imageUrl: string;
  consoleType: ConsoleType;
  language: string | null;
  year: number | null;
  /**
   * 开发商外键（2026-10-12 加）。表单里那个下拉框选的就是它 —— 名字由服务端反查，
   * 所以这里编辑时只认 id；厂名文字在 `texts.*.developer` 里，只在列表上显示用。
   */
  developerId: string | null;
  createdAt: number;
  /** 与这一行共用同一份文案的 ROM 条数（含自己，2026-10-16 加）。1 = 库里只有这一盘。 */
  groupSize: number;
}

/**
 * 后台列表 / 编辑表单读的**中文原文**那一份。
 *
 * 改动前这里直接读 `games.title` / `games.series` / `games.developer` / `games.description`
 * 那几列（都是中文原文），行为保持一致 —— 后台界面虽然会跟着 cookie 切中英，
 * 但「游戏资料」这一栏一直只显示原文。
 *
 * 兜一层 `EMPTY_GAME_TEXT`：真出现一条没有中文行的脏数据时显示空白，而不是把
 * `undefined` 塞进 JSX（那会直接崩）。
 */
function zhText(game: AdminGame): GameText {
  return game.texts.zh ?? EMPTY_GAME_TEXT;
}

/** `/api/admin/developers/options` 返回的下拉项。 */
interface DeveloperOption {
  id: string;
  name: string;
}

/** `/api/admin/games` 分页响应（游标翻页，2026-10-14 起）。没有 total —— 后台用不到。 */
interface GamePage {
  games: AdminGame[];
  /** 往后翻的游标；null = 后面没有了。回传给下一次请求的 `cursor` 参数。 */
  nextCursor: string | null;
  hasMore: boolean;
}

type Notice = { tone: 'ok' | 'error'; text: string };

/**
 * 表单里那排机种选项。**直接用登记表**，不再手抄一份 ——
 * 2026-10-14 加机种时这里曾是「漏了不报错」的四处之一
 * （`ConsoleType` 联合类型管不到一个手写的字符串数组）。
 */
const CONSOLE_OPTIONS: readonly ConsoleType[] = CONSOLE_TYPES;

/** 列表每页条数。 */
const PAGE_SIZE = 10;

/**
 * 语言字段落到 DB 里存的是短码，选项与可读标签**都从 `lib/rom-lang.ts` 派生**。
 *
 * ⚠️ 2026-10-15 起不再在本文件手抄一份（原来是两个常量各写一遍）——
 *    加韩语时正是要同时改「下拉选项」和「列表标签」两处，漏一处就是
 *    「能存进去但列表上显示成 `ko`」。语言清单的唯一出处是 `GAME_LANGUAGES`。
 */
const LANGUAGE_OPTIONS = GAME_LANGUAGES;

/**
 * 新增游戏时「语言」下拉的默认值。
 *
 * 站内库以英文 ROM 为主（后台列表里绝大多条都是 `en`），默认空着等于每加一条都要手动选一次。
 * ⚠️ **只作新增的默认值**：打开编辑时仍按记录原值填（空就是空）——
 * 否则编辑一条没标语言的老记录、只改个年份保存，语言会被悄悄写成 `en`。
 */
const DEFAULT_LANGUAGE = 'en';

const LANGUAGE_LABEL = GAME_LANGUAGE_LABEL;

/** 语言短码转可读名字；老数据若是自由文本则原样返回。 */
function languageLabel(value: string | null): string | null {
  if (!value) return null;
  return LANGUAGE_LABEL[value] ?? value;
}

/** 每个字段外层那个 label（纵向排列 + 小字标签）。`FIELD_CLASS` 在 ./adminStyles（两个组件共用）。 */
const LABEL_CLASS = 'flex flex-col gap-1 text-[12px] text-ink-400';

/**
 * 表单里**一份语言**的三个可编辑字段。全是字符串（空串 = 没填）—— 直接绑在 input 上，
 * 提交时才收敛成 `null`（和后台其它选填字段同一套写法）。
 */
interface FormText {
  title: string;
  series: string;
  description: string;
}

/** 四个语言的表单值，按语言索引。 */
type FormTexts = Record<ContentLocale, FormText>;

/**
 * 一份全新的空表单。
 *
 * ⚠️ 写成**工厂函数**而不是共享常量：`patchText` 是浅拷贝改写，共享一个对象的话
 *    「重置表单」拿到的是上一轮改过的那份，等于没重置。
 *
 * ⚠️ 循环 `CONTENT_LOCALES` 生成：加语言只改 `lib/game-text.ts` 一处 —— 这正是这次
 *    重构的目的（原来 12 个 `useState` + 12 段 JSX 都是四个语言各抄一遍）。
 */
function emptyFormTexts(): FormTexts {
  return Object.fromEntries(
    CONTENT_LOCALES.map((locale) => [locale, { title: '', series: '', description: '' }])
  ) as FormTexts;
}

/** 语言块的标题。`satisfies` 保证「`CONTENT_LOCALES` 加了语言却漏了标签」编译期就报错。 */
const CONTENT_LOCALE_LABEL = {
  zh: '中文',
  en: 'English (EN)',
  ja: '日本語 (JA)',
  ko: '한국어 (KO)',
} satisfies Record<ContentLocale, string>;

/**
 * 提交时文案字段的**键名后缀**。两条路的命名规则不一样，所以是两张表：
 *   · POST（multipart）—— 蛇形：`title` / `title_en` / `series_en` / `description_en`；
 *   · PATCH（JSON）    —— 驼峰：`title` / `titleEn` / `seriesEn` / `descriptionEn`。
 *
 * ⚠️ 这是**接口契约的一部分**，改名要连着接口一起改 —— 两边分别是
 *    `app/api/admin/games/route.ts` 的 `flatTexts()` 与 `[id]/route.ts` 的 `patch`。
 *    刻意不写成「`_${locale}` / 首字母大写」那种推导：显式列出来，改动才看得见
 *    （同时 `satisfies` 保证加语言时这里漏了会编译报错）。
 */
const FORM_SUFFIX = { zh: '', en: '_en', ja: '_ja', ko: '_ko' } satisfies Record<ContentLocale, string>;
const PATCH_SUFFIX = { zh: '', en: 'En', ja: 'Ja', ko: 'Ko' } satisfies Record<ContentLocale, string>;

/**
 * 拉取**一页**列表。抽成模块级函数，便于 effect 与增删改后共用。
 *
 * 游标翻页：`cursor` 是上一页响应里的 `nextCursor`（null = 第一页）。服务端按
 * `created_at DESC, id DESC` 取「这个位置之后的 limit 条」，不发 COUNT。
 *
 * 搜索词一起带给接口：分页之后本地就没有全量数据了，过滤只能落在服务端
 * （否则搜出来的东西会随翻页变，等于没搜）。
 */
async function fetchGames(cursor: string | null, keyword: string): Promise<GamePage> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) params.set('cursor', cursor);
  if (keyword) params.set('q', keyword);

  const res = await fetch(`/api/admin/games?${params}`);
  if (!res.ok) throw new Error(String(res.status));

  const data = (await res.json()) as Partial<GamePage>;
  return {
    games: data.games ?? [],
    nextCursor: data.nextCursor ?? null,
    hasMore: data.hasMore ?? false,
  };
}

/**
 * 从失败响应里挖出服务端给的 detail。
 * 后端把底层原因（校验失败、R2 未配置…）放在 detail 里，直接展示比一句
 * 「请求失败」有用得多。
 */
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: string };
    return data.detail ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * 从一次拖拽里抠出「图片地址」。
 *
 * 从资源管理器拖文件时有 `files`，走不到这里；**从网页里拖一张图**过来时
 * DataTransfer 里只有文本，而且各家浏览器写法不一，于是按可靠度依次试：
 * `text/uri-list`（标准）→ `text/html` 里的 `<img src>` → 纯文本里的裸链接。
 *
 * ⚠️ `getData` 只在 drop 事件里读得到（事件结束数据就没了），别挪到异步里。
 */
function imageUrlFromDrop(data: DataTransfer): string | null {
  const fromList = data
    .getData('text/uri-list')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#'));
  if (fromList) return fromList;

  const html = data.getData('text/html');
  const src = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (src) return src[1];

  const text = data.getData('text/plain').trim();
  return /^https?:\/\//i.test(text) ? text : null;
}

/**
 * 后台 · 游戏列表 tab：列表（**服务端分页** + 搜索）+ 添加 / 编辑弹窗 + 删除。
 * 鉴权由各接口自查（见 lib/server/admin-guard.ts），这里只负责界面与调接口。
 *
 * 顶栏、退出登录、左侧 tab 栏都在 `AdminShell` 里（由服务端 layout 包着），
 * 这个组件只画**这一页的内容** —— 原先它俩（列表 + 留言本）挤在一个页面里，
 * 2026-10-10 拆成了两个 tab，各自一个路由。
 */
/**
 * 2026-10-14 起改为游标翻页，`useListQuery`（offset = (page-1)*PAGE_SIZE）没了：
 * 每页的入口是上一页存下的游标，见组件里 `cursorHistory` 那段。
 */

export default function AdminGames() {
  const router = useRouter();

  const [games, setGames] = useState<AdminGame[]>([]);
  /** 「下一页还有没有」。游标翻页没有总数，下一页按钮的禁用态全看它。 */
  const [hasMore, setHasMore] = useState(false);
  const [listLoaded, setListLoaded] = useState(false);
  /** 当前是否有一条列表请求在飞：翻页 / 搜索 / 增删改后的重拉都点亮加载行。 */
  const [listPending, setListPending] = useState(true);
  const [searchDraft, setSearchDraft] = useState('');
  // 真正生效的搜索词：点「搜索」或回车才从 draft 提交过来，避免边打字边过滤
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  /*
   * 游标栈（2026-10-14 从 offset 翻页改过来）。下标 = 页码-1：`cursorHistory[0]`
   * 恒为 null（第一页没有入口游标），第 n 页的入口是第 n-1 页响应里的 `nextCursor`。
   *
   * 「上一页」不用做反向游标查询 —— 前端是客户端组件，翻过的游标存栈里，
   * 往回走直接 pop 出来重新请求就行（服务器仍然按同方向取「这个位置之后」）。
   * 每次某页被（重新）拉取，它存下的 `nextCursor` 都会被覆盖 —— 删除、上传之后
   * 栈里过期的入口会在下一次路过时自动修正。
   */
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
  const [pageNotice, setPageNotice] = useState<Notice | null>(null);
  /** 增删改之后 +1，用来触发重新拉当前页（effect 的唯一刷新开关）。 */
  const [listVersion, setListVersion] = useState(0);
  /** 请求序号：翻页快了会撞上乱序响应，慢的旧响应不许覆盖新的。 */
  const listRequestId = useRef(0);

  // 初值必须在这里给，effect 里改会让「打开即编辑」闪一下空表单。
  const [modalOpen, setModalOpen] = useState(false);
  // 非 null 表示在编辑既有条目，null 表示新增
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalNotice, setModalNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  /*
   * 表单字段：新增与编辑共用一套。
   *
   * 文案部分**按语言分组**存一份 `texts`（2026-10-16 重构）—— 顶替掉原来 12 个
   * `useState`（`title` / `titleEn` / `titleJa` / `titleKo`，系列与说明同理）。
   * 原来那套是**按字段**分组、四个语言各抄一遍，加语言要动十几处；现在循环
   * `CONTENT_LOCALES` 生成，加语言只改 `lib/game-text.ts` 一处。
   *
   * 中文那三个字段必填（`title` 是这一款的主名字，也是 `games.title` 那列的值，
   * 反查同款与判重都拿它当判据）；其余三个语言选填、留空**逐字段**回退中文。
   */
  const [texts, setTexts] = useState<FormTexts>(emptyFormTexts);
  const [consoleType, setConsoleType] = useState<ConsoleType>('nes');
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [year, setYear] = useState('');
  /*
   * 开发商：从 2026-10-12 起是**下拉框**（值 = developers.id），不再手填文字。
   * 空串 = 未指定。取值列表由下面那条 effect 从后台接口拉。
   */
  const [developerId, setDeveloperId] = useState('');
  const [developerOptions, setDeveloperOptions] = useState<DeveloperOption[]>([]);
  /**
   * 编辑一条「开发商那列有文字、却没接上开发商库」的老记录时，把那段文字记下来。
   * 下拉框里没有它（选项只有 id），保存就会把它清掉 —— 这种时候得**明说**，
   * 否则用户看不见数据没了。迁移之后理论上不该再有这种行，留着是防意外。
   */
  const [unlinkedDeveloper, setUnlinkedDeveloper] = useState('');
  /* 说明 / 简介也在 `texts` 里（每个语言一个多行字段，见下面语言块那个 textarea）。 */
  const [image, setImage] = useState<File | null>(null);
  const [rom, setRom] = useState<File | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const romRef = useRef<HTMLInputElement>(null);

  /*
   * 「从链接自动填充」（2026-10-13 加；2026-10-14 起连封面和 ROM 一起抓）：
   * 粘贴一个游戏页链接 → 抓元数据预填表单，再把页面挂的封面与游戏文件一并取回来。
   * 接口只回**地址**，字节由这里再走两个服务端代理取（上游是别的域名，
   * 浏览器直接 fetch 会被 CORS 挡）—— 见 app/api/admin/fetch-image 与 fetch-rom。
   */
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  /** 单独一条提示：它贴着上面那个输入框，和表单底部那条 `modalNotice` 不是一回事。 */
  const [scrapeNotice, setScrapeNotice] = useState<Notice | null>(null);

  /** 拖拽悬停高亮：封面与游戏文件各一个。 */
  const [imageDrag, setImageDrag] = useState(false);
  const [romDrag, setRomDrag] = useState(false);

  const isEditing = editingId !== null;

  /**
   * 正在编辑那一条的**同款盘数**（含它自己）。从当前页的列表里现取，不再发请求 ——
   * `editingId` 只可能来自这一页的行，而每次保存后都 `reloadList()`，所以它一直是最新的。
   * 取不到（理论上不会）时按 1 算，提示那句退化成不带数字的版本。
   */
  const editingGroupSize = isEditing
    ? (games.find((item) => item.id === editingId)?.groupSize ?? 1)
    : 1;

  /** 本页的入口游标（从栈里取；第一页恒为 null）。effect 的唯一翻页开关。 */
  const cursor = cursorHistory[page - 1] ?? null;
  /** 本页响应里的「下一页入口」。翻下一页前先看它还在不在。 */
  const nextCursor = cursorHistory[page] ?? null;

  /** 增删改后重新拉一遍当前页（同一条路径给「上传完跳回第一页」用）。 */
  const reloadList = useCallback(() => setListVersion((n) => n + 1), []);

  /** 翻下一页。`nextCursor` 在就一定存在栈里（写入发生在上一页响应到达时）。 */
  const goNext = useCallback(() => {
    if (!hasMore || !nextCursor) return;
    setPage((p) => p + 1);
  }, [hasMore, nextCursor]);

  /** 翻上一页：从栈里拿回上一页当时用的入口游标，重新请求。 */
  const goPrev = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);

  /**
   * 「从列表导入」跑完之后叫这里：新条目按 created_at 倒序排在最前面，
   * 所以跳回第 1 页再重拉（和单条上传收尾同一套动作）。
   */
  const handleBulkImported = useCallback(() => {
    setPage(1);
    reloadList();
    router.refresh();
  }, [reloadList, router]);

  /*
   * 每次翻页 / 搜索 / 增删改都重新拉**当前这一页**，不再一次性把全库拉回来。
   * setState 走 .then/.catch 回调 —— 直接在 effect 体里同步 setState 会被
   * react-hooks/set-state-in-effect 拦下。
   *
   * `cursor` 变 = 翻页（或跳回第一页）；`listVersion` 只在增删改时递增。
   * effect 依赖里有 `page`：成功回调要往 `cursorHistory[page]` 写下一页的入口。
   */
  useEffect(() => {
    /*
     * 请求序号：翻页快了会撞上乱序响应，慢的旧响应不许覆盖新的。
     * 放在 ref 里而不是用闭包里的 cancelled 标记 —— 后者的清理跑在
     * effect 重新执行时，两个请求的清理都等于「本轮请求被取消」，分不开谁是谁。
     */
    const requestId = ++listRequestId.current;

    /*
     * 先点亮「载入中」。effect 体内同步 setState 会被 react-hooks/set-state-in-effect
     * 拦下，所以放微任务里（执行序仍先于 fetch 响应，不会漏帧）；
     * 同样受 requestId 把守：请求被换掉时，旧请求不许点亮新一轮。
     */
    void Promise.resolve().then(() => {
      if (listRequestId.current !== requestId) return;
      setListPending(true);
    });

    fetchGames(cursor, keyword)
      .then((data) => {
        if (listRequestId.current !== requestId) return;
        setGames(data.games);
        setHasMore(data.hasMore);
        // 把「下一页的入口」存进栈里（下标 = 当前页码）。已有同值就不动，省一次渲染
        setCursorHistory((prev) => {
          if (prev[page] === data.nextCursor) return prev;
          const copy = [...prev];
          copy[page] = data.nextCursor;
          return copy;
        });
      })
      .catch(() => {
        if (listRequestId.current !== requestId) return;
        setGames([]);
        setHasMore(false);
      })
      .finally(() => {
        if (listRequestId.current !== requestId) return;
        setListLoaded(true);
        setListPending(false);
      });
  }, [cursor, page, keyword, listVersion]);

  // 弹窗打开时支持 Esc 关闭
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModalOpen(false);
        setEditingId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  /*
   * 开发商下拉框的选项。**挂载时拉一次**就够 —— 这是「在开发商 tab 里新建完、
   * 切回游戏列表要能选到它」这个场景的边界：tab 之间是客户端导航，
   * 这个组件会整个重新挂载，所以每次进这一页拿到的都是新的一份。
   *
   * 拉失败就当空列表（下拉里只剩「未指定」）**不弹错**：它不该拦住整个上传流程，
   * 而且那种情况下界面上还留着一句「去开发商库新建」的提示，用户知道该去哪儿。
   */
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/developers/options')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { developers?: DeveloperOption[] }) => {
        if (!cancelled) setDeveloperOptions(data.developers ?? []);
      })
      .catch(() => {
        if (!cancelled) setDeveloperOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * 游标翻页没有 total，「共 Y 页」算不出来（2026-10-14 用户拍板选 A）——
   * 分页条只显示「第 X 页」，下一页按钮的禁用态由 `hasMore` 决定，越界无从谈起。
   */
  const applySearch = () => {
    setKeyword(searchDraft.trim());
    // 关键词变了，旧关键词翻过的游标全部作废 —— 清栈，从第一页重来
    setCursorHistory([null]);
    setPage(1);
  };

  /** 改某个语言里的某个字段。整份换新对象 —— React 靠引用比，别就地改 `texts[locale]`。 */
  const patchText = (locale: ContentLocale, key: keyof FormText, value: string) =>
    setTexts((prev) => ({ ...prev, [locale]: { ...prev[locale], [key]: value } }));

  const resetForm = () => {
    setTexts(emptyFormTexts());
    setConsoleType('nes');
    setLanguage(DEFAULT_LANGUAGE);
    setYear('');
    setDeveloperId('');
    setUnlinkedDeveloper('');
    setImage(null);
    setRom(null);
    setScrapeUrl('');
    setScrapeNotice(null);
    if (imageRef.current) imageRef.current.value = '';
    if (romRef.current) romRef.current.value = '';
  };

  /**
   * 打开**手动填表**的弹窗（新增那一侧）。
   *
   * ⚠️ 2026-10-19 起它不再挂在列表上那颗「添加」按钮上 —— 那颗按钮改成了
   *    「粘贴下载链接一步入库」（AdminAddGame），表单这条路由那个弹框底部的
   *    「手动添加」进。编辑（`openEdit`）仍走同一个弹窗。
   */
  const openAdd = () => {
    resetForm();
    setEditingId(null);
    setModalNotice(null);
    setModalOpen(true);
  };

  const openEdit = (game: AdminGame) => {
    /*
     * 四个语言都读出来回填。
     *
     * ⚠️ **缺的那几份要给空串**：只填了中文的游戏没有 `en` / `ja` / `ko` 行，读成空串
     *    提交回去正好等于「这几栏还是空的」，不会把已有文案弄丢
     *    （`writeTexts` 对「传进来的空的一份」是删行，不是写空行）。
     * ⚠️ 语言清单走 `CONTENT_LOCALES`，别在这儿手抄四个 key。
     */
    const zh = game.texts.zh ?? EMPTY_GAME_TEXT;
    setEditingId(game.id);
    setTexts(
      Object.fromEntries(
        CONTENT_LOCALES.map((locale) => {
          const text = game.texts[locale] ?? EMPTY_GAME_TEXT;
          return [
            locale,
            {
              title: text.title ?? '',
              series: text.series ?? '',
              description: text.description ?? '',
            },
          ];
        })
      ) as FormTexts
    );
    setConsoleType(game.consoleType);
    setLanguage(game.language ?? '');
    setYear(game.year === null ? '' : String(game.year));
    // 老记录（迁移前上传、或开发商那列是自由文本的）可能没有 id，那就退成「未指定」
    setDeveloperId(game.developerId ?? '');
    setUnlinkedDeveloper(game.developerId ? '' : zh.developer ?? '');
    setImage(null);
    setRom(null);
    setModalNotice(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (busy) return;
    setModalOpen(false);
    setEditingId(null);
    setModalNotice(null);
  };

  const onBackdrop = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) closeModal();
  };

  /**
   * 选中 / 拖入一个 ROM 之后的统一处理：存下来，并顺手认机种预填（用户仍可手动改）。
   *
   * 先拆一层压缩包再认机种：有些 ROM 是**压缩包伪装成 ROM 扩展名**（`.smc` / `.nes`
   * 里其实是 zip），直接 `detectConsole` 会把它们一律判成街机 —— 预填错之后，
   * 游戏库里那条「机种筛选」也跟着错（用户按 SNES 筛，这盘却不出现）。规则见 `lib/unwrap.ts`。
   * 这里只是**预填**；真正载入时 `loadRom` 会自己再拆一次。
   */
  const applyRomFile = async (file: File) => {
    setRom(file);
    const unwrapped = await unwrapRom(file);
    /*
     * 光盘套装（`.cue` + `.bin`）的机种由拆包那一层直接给 —— 主文件是 `.cue`，
     * 而 `EXTENSION_MAP` 刻意不收 `cue`（直接拖一个 cue 进来该报「认不出」）。
     * 见 `lib/unwrap.ts` 的 `UnwrappedRom.console`。
     */
    const detected = unwrapped?.console ?? (await detectConsole(unwrapped?.file ?? file));
    if (detected) setConsoleType(detected);
  };

  /** 选 ROM（点选文件）时走这里。 */
  const onRomChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setRom(null);
      return;
    }
    await applyRomFile(file);
  };

  /**
   * 经服务端代理把一个**外链封面**取回来，塞进「封面」那一栏。
   *
   * 浏览器直接 fetch 那个跨域地址会被 CORS 挡下，所以绕服务端一趟
   * （见 /api/admin/fetch-image）。「自动填充」与「从网页拖图」两条路都走它。
   */
  const applyImageUrl = async (url: string) => {
    const res = await fetch('/api/admin/fetch-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) throw new Error(await readError(res, '取不到那张图片。'));
    const blob = await res.blob();
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'cover');
    setImage(new File([blob], name, { type: blob.type || 'image/png' }));
  };

  /**
   * 封面拖拽落点。两种来源：
   *   · 从资源管理器拖文件 —— `dataTransfer.files` 里就有 File，直接用；
   *   · 从**网页**里拖一张图 —— 只有 URL，交给 applyImageUrl 让服务端把字节取回来。
   */
  const onImageDrop = async (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setImageDrag(false);
    if (busy) return;

    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setImage(dropped);
      return;
    }

    const url = imageUrlFromDrop(e.dataTransfer);
    if (!url) {
      setModalNotice({ tone: 'error', text: '取不到那张图片。' });
      return;
    }

    try {
      await applyImageUrl(url);
    } catch (error) {
      setModalNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : '取不到那张图片。',
      });
    }
  };

  /** 游戏文件拖拽落点：只认真的文件（ROM 不是网页上能拖的东西）。 */
  const onRomDrop = async (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setRomDrag(false);
    if (busy) return;
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) await applyRomFile(dropped);
  };

  /**
   * 经服务端代理把一个**外链 ROM** 取回来，塞进「游戏文件」那一栏。
   *
   * ⚠️ **文件名必须保住原样** —— FBNeo 是拿 zip 文件名认驱动的，改名会让街机静默
   * 起不来（见 app/api/admin/games/route.ts 的 romName）。优先用代理回的响应头
   * `x-file-name`（它取自最终地址，跳转后也准），拿不到再退到抓取接口给的名字。
   *
   * 最后仍走 `applyRomFile` —— 好让机种也跟着认一遍（拆包 + detectConsole）。
   */
  const applyRomUrl = async (url: string, fallbackName: string) => {
    const res = await fetch('/api/admin/fetch-rom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) throw new Error(await readError(res, '游戏文件获取失败。'));
    const blob = await res.blob();
    const header = res.headers.get('x-file-name');
    const name = (header ? decodeURIComponent(header) : '') || fallbackName || 'rom.zip';
    await applyRomFile(new File([blob], name, { type: blob.type || 'application/zip' }));
  };

  /**
   * 从链接抓元数据填进表单，**连封面和 ROM 一起**。
   *
   * 两段式：先问 /api/admin/scrape-game 要元数据 + 封面 / ROM 的**地址**，
   * 再让封面与 ROM 各走一趟服务端代理把字节取回来（见上面两个 applyXxxUrl）。
   * 两者并行、各自独立 —— 一个失败不该把另一个、以及已经填好的文本字段一起作废。
   *
   * 开发商那一栏特殊：下拉框认的是 `developers.id`，而接口回的是**名字**，
   * 所以在这里拿名字去选项里匹配一次；匹配不上就提示去开发商库建一个，不硬塞。
   */
  const autofill = async () => {
    const url = scrapeUrl.trim();
    if (!url || scraping) return;

    setScraping(true);
    setScrapeNotice(null);
    try {
      const res = await fetch('/api/admin/scrape-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error(await readError(res, '读取该页面失败。'));

      const data = (await res.json()) as {
        title?: string | null;
        titleEn?: string | null;
        consoleType?: ConsoleType | null;
        year?: number | null;
        developer?: string | null;
        series?: string | null;
        seriesEn?: string | null;
        description?: string | null;
        descriptionEn?: string | null;
        imageUrl?: string | null;
        romUrl?: string | null;
        romName?: string | null;
        romLang?: string | null;
      };

      /*
       * 文案：接口只回**中英**两份（字段是 `title` / `titleEn` / `seriesEn` / `descriptionEn`），
       * 日韩两份上游不给 —— 留空即可，读取时逐字段回退中文，不影响显示。
       *
       * ⚠️ 一律走 `patchText`（函数式 setState）：连着调六次，每次都基于上一次的结果，
       *    直接 `setTexts({...})` 会让后写的把先写的整个盖掉。
       */
      if (data.title) patchText('zh', 'title', data.title);
      if (data.series) patchText('zh', 'series', data.series);
      if (data.description) patchText('zh', 'description', data.description);
      if (data.titleEn) patchText('en', 'title', data.titleEn);
      if (data.seriesEn) patchText('en', 'series', data.seriesEn);
      if (data.descriptionEn) patchText('en', 'description', data.descriptionEn);
      if (data.consoleType) setConsoleType(data.consoleType);
      if (data.year) setYear(String(data.year));

      /*
       * 语言：跟着**选中那个 ROM 的版本**填（上游 `fileName` 的 key）。
       * 这个字段是判重的一环 —— 同名 + 同语言才算重复（见 lib/server/games.ts），
       * 填错了要么被误拦、要么漏掉重复项。认不出的 key 不动它，保持默认。
       */
      const formLang = romLangToFormValue(data.romLang);
      if (formLang) setLanguage(formLang);

      /** 收尾拼成一句提示：元数据 + 开发商 + 封面 / ROM 各自的结论。 */
      const notes: string[] = [];

      // 开发商：名字 → id
      if (data.developer) {
        const match = developerOptions.find((option) => option.name === data.developer);
        if (match) setDeveloperId(match.id);
        else notes.push(`开发商「${data.developer}」还不在库里 —— 先去建一个再选。`);
      }

      // 取字节前先挂一条提示：ROM 有几 MB，不会瞬回，不给字就像卡住了
      if (data.imageUrl || data.romUrl) {
        setScrapeNotice({ tone: 'ok', text: '正在获取封面与游戏文件…' });
      }

      const [cover, romFile] = await Promise.allSettled([
        data.imageUrl ? applyImageUrl(data.imageUrl) : Promise.resolve(),
        data.romUrl ? applyRomUrl(data.romUrl, data.romName ?? '') : Promise.resolve(),
      ]);

      let failed = false;
      if (data.imageUrl && cover.status === 'rejected') {
        notes.push('封面获取失败。');
        failed = true;
      }
      if (data.romUrl && romFile.status === 'rejected') {
        notes.push('游戏文件获取失败。');
        failed = true;
      }
      // 页面根本没挂文件时明说一句 —— 否则用户会以为「抓到了但没填上」
      if (!data.romUrl) notes.push('该页面没有找到可下载的游戏文件。');
      else if (!failed && notes.length === 0) notes.push('封面与游戏文件已获取。');

      setScrapeNotice({
        tone: failed ? 'error' : 'ok',
        text: [failed ? '' : '已从页面填充。', ...notes].filter(Boolean).join(' '),
      });
    } catch (error) {
      setScrapeNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : '读取该页面失败。',
      });
    } finally {
      setScraping(false);
    }
  };

  /** 新增 / 编辑共用一个提交入口，靠 isEditing 分流。 */
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;

    /*
     * 中文名必填 —— 它既是这一款的**主名字**（也是 `games.title` 那列 NOT NULL 的值），
     * 又是 `resolveGroupKey` 反查同款、`findGameDuplicate` 判重时用的那一份。
     * 所以校验的是 `texts.zh.title`，不是「四个语言里随便有一个」。
     */
    const trimmedTitle = texts.zh.title.trim();
    if (!trimmedTitle) {
      setModalNotice({ tone: 'error', text: '请填写中文游戏名。' });
      return;
    }

    const yearText = year.trim();
    const parsedYear = yearText ? Number(yearText) : null;
    if (parsedYear !== null && !Number.isInteger(parsedYear)) {
      setModalNotice({ tone: 'error', text: '年份必须是整数。' });
      return;
    }

    if (!isEditing && (!image || !rom)) {
      setModalNotice({ tone: 'error', text: '游戏名、封面图片、游戏文件为必传项。' });
      return;
    }

    setBusy(true);
    setModalNotice(null);

    try {
      if (isEditing) {
        /*
         * 文案字段按 `PATCH_SUFFIX` 拼（驼峰）。**四个语言一律带上** ——
         * `updateGame` 的语义是「只动传进来的语言」，漏掉 `ja` 就等于「日文那几行
         * 原样不动」，那样用户把日文清空之后旧文案还在（接口那边也是同一口径）。
         */
        const body: Record<string, unknown> = {
          consoleType,
          language: language || null,
          year: parsedYear,
          // 下拉框给的是 developers.id；名字由服务端反查后写进 developer 那列
          developerId: developerId || null,
        };
        for (const locale of CONTENT_LOCALES) {
          const text = texts[locale];
          const suffix = PATCH_SUFFIX[locale];
          // 中文名用 trim 过的那份（上面刚校验过非空）
          body[`title${suffix}`] = (locale === 'zh' ? trimmedTitle : text.title.trim()) || null;
          body[`series${suffix}`] = text.series.trim() || null;
          body[`description${suffix}`] = text.description.trim() || null;
        }

        const res = await fetch(`/api/admin/games/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await readError(res, '请求失败。'));
        /*
         * 与 POST 那条路的「已归入《XXX》」对称：编辑没有归组动作（PATCH 刻意不重算
         * `group_key`），但「改的是整款、几条 ROM 一起更新」这个事实要讲出来 ——
         * 否则用户会以为只动了当前这一盘。盘数用编辑前那个值（保存不影响它）。
         */
        setPageNotice({
          tone: 'ok',
          text:
            editingGroupSize > 1
              ? `已保存 —— 这一款共 ${editingGroupSize} 盘 ROM，文案已一起更新。`
              : '已保存。',
        });
      } else {
        // 文案字段按 `FORM_SUFFIX` 拼（蛇形）—— 与接口的 `flatTexts()` 一一对应
        const form = new FormData();
        for (const locale of CONTENT_LOCALES) {
          const text = texts[locale];
          const suffix = FORM_SUFFIX[locale];
          form.set(`title${suffix}`, locale === 'zh' ? trimmedTitle : text.title.trim());
          form.set(`series${suffix}`, text.series.trim());
          form.set(`description${suffix}`, text.description.trim());
        }
        form.set('console_type', consoleType);
        form.set('language', language);
        form.set('year', yearText);
        form.set('developer_id', developerId);
        form.set('image', image as File);
        form.set('rom', rom as File);

        const res = await fetch('/api/admin/games', { method: 'POST', body: form });
        // 失败时把服务端细节原样抛出来，交给 catch 显示
        if (!res.ok) throw new Error(await readError(res, '上传失败。'));
        /*
         * ⚠️ 解析失败要兜住：上传**已经成功**了，不能因为读不出响应体就让用户看到
         *    「上传失败」（那会诱使他重传一遍，撞上判重更困惑）。
         */
        const data = (await res.json().catch(() => ({}))) as {
          group?: { reusedTitle: string | null };
        };
        /*
         * 归到**已有的一款**上时明说是哪一款，而不是只回一句「已上传」。
         * 这是「中文名打错一个字就另开一款、文案从此存两份」唯一能在当时看出来的地方
         * —— `group_key` 由服务端自动算，录制的人本来完全看不见归组结果。
         */
        setPageNotice({
          tone: 'ok',
          text: data.group?.reusedTitle
            ? `已上传，并归入已有的一款《${data.group.reusedTitle}》—— 这盘 ROM 与它共用同一份文案。`
            : '已上传。',
        });
        // 列表按 created_at 倒序，新条目在第一页 —— 跳回去才看得到刚传的那条。
        // 本来就在第一页时 setPage 不改值、effect 也不会重跑，所以另加一次版本号。
        setPage(1);
      }

      // 重拉当前页。失败不影响「这次保存成功了」这个结论，effect 里已经吞掉错误。
      reloadList();
      resetForm();
      setModalOpen(false);
      setEditingId(null);
      router.refresh();
    } catch (error) {
      setModalNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : '请求失败。',
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (game: AdminGame) => {
    if (!window.confirm(`删除「${zhText(game).title ?? ''}」？此操作不可撤销。`)) return;
    try {
      const res = await fetch(`/api/admin/games/${game.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res, '请求失败。'));
      // 行消失就是最好的反馈，不必再弹成功提示
      reloadList();
      setPageNotice(null);
      router.refresh();
    } catch (error) {
      setPageNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : '请求失败。',
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="bg-ink-800 pixel-edge pxw-3 pxc-600 p-4">
        {/* ⚠️ `flex-wrap` 不能省：这一行现在有搜索框 + 添加 + 从列表导入 + 自动爬取，
            窄屏下不折行就会横向溢出（四个钮都是 shrink-0） */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="shrink-0 text-[12px] text-ink-200">{'已上传的游戏'}</h2>
          {/* 搜索框与按钮同属一个 form，回车等同点击「搜索」 */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              applySearch();
            }}
            className="ml-auto flex min-w-0 max-w-[380px] flex-1 items-center gap-2"
          >
            <input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder={'搜索游戏名 / 开发者 / 系列'}
              className={`${FIELD_CLASS} min-w-0 flex-1`}
            />
            <button
              type="submit"
              className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-3 py-2 text-[12px] text-ink-200 transition-colors hover:text-accent"
            >
              {'搜索'}
            </button>
          </form>
          {/*
            「添加」= **粘贴下载链接一步入库**（2026-10-19 改）—— 按钮与弹框都在
            AdminAddGame 里；原来的手动填表退成那个弹框底部的「手动添加」入口
            （`openAdd` 仍然只负责开表单，不再挂在这颗按钮上）。
          */}
          <AdminAddGame onImported={handleBulkImported} onManualAdd={openAdd} />
          {/* 「添加」旁边那两个批量入口 —— 按钮和弹框都在它们各自的组件里 */}
          <AdminBulkImport onImported={handleBulkImported} />
          {/* 「自动爬取」：给一个分类页，一页页爬到最后一页（2026-10-15 加） */}
          <AdminAutoCrawl onImported={handleBulkImported} />
        </div>

        {pageNotice && (
          <p
            className={`mb-2 text-[12px] ${
              pageNotice.tone === 'ok' ? 'text-ok' : 'text-danger'
            }`}
          >
            {pageNotice.text}
          </p>
        )}

        {/* 列表请求在飞（首屏 / 翻页 / 搜索 / 增删改后重拉）就亮加载行 —— 之前这几段是纯空白 */}
        {listPending && <AdminLoading label="载入中…" />}

        {listLoaded && games.length === 0 && !keyword && (
          <p className="text-[12px] text-ink-500">{'还没有上传任何游戏。'}</p>
        )}

        {/* 库里有东西、只是没搜到 —— 和「库是空的」分开说，否则会以为库坏了 */}
        {listLoaded && games.length === 0 && keyword && (
          <p className="text-[12px] text-ink-500">{'没有匹配的游戏。'}</p>
        )}

        {games.length > 0 && (
          <ul className="flex flex-col divide-y-2 divide-ink-900">
            {games.map((game) => (
              <li key={game.id} className="flex items-center gap-3 py-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={game.imageUrl}
                  alt=""
                  className="pixel-edge pxw-2 pxc-700 h-[46px] w-[34px] shrink-0 bg-ink-900 object-cover"
                />
                {/*
                  标题下面挂一行说明（只有填了的条目才有）。用**两行的一个 flex 列**
                  而不是「标题 + 说明两个并列 span」：说明比标题长得多，并列会把右边的
                  年份 / 开发者 / 按钮挤走。各自 truncate，行高由内容撑 —— 同一页里
                  填了说明的那几条会比别的高一点，列表本来就不是等高的表格。
                */}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[12px] text-ink-100">{zhText(game).title}</span>
                  {zhText(game).description && (
                    <span className="truncate text-[12px] text-ink-500">
                      {zhText(game).description}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-pixel text-[12px] text-accent">
                  {CONSOLE_LABEL[game.consoleType]}
                </span>
                <span className="w-[150px] shrink-0 truncate text-right text-[12px] text-ink-500">
                  {[
                    game.year,
                    zhText(game).developer,
                    languageLabel(game.language),
                    zhText(game).series,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <button
                  type="button"
                  onClick={() => openEdit(game)}
                  className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-2.5 py-1 text-[12px] text-ink-200 transition-colors hover:text-accent"
                >
                  {'编辑'}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(game)}
                  className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-2.5 py-1 text-[12px] text-ink-200 transition-colors hover:text-danger"
                >
                  {'删除'}
                </button>
              </li>
            ))}
          </ul>
        )}

        {(page > 1 || hasMore) && (
          <div className="mt-3 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={page <= 1}
              onClick={goPrev}
              className="pixel-edge pxw-2 pxc-500 bg-ink-700 px-3 py-1 text-[12px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {'上一页'}
            </button>
            <span className="text-[12px] text-ink-500">{`第 ${page} 页`}</span>
            <button
              type="button"
              disabled={!hasMore || !nextCursor}
              onClick={goNext}
              className="pixel-edge pxw-2 pxc-500 bg-ink-700 px-3 py-1 text-[12px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {'下一页'}
            </button>
          </div>
        )}
      </section>

      {modalOpen && (
        /*
         * 整个遮罩也吃掉拖拽事件：拖歪了（没落在封面 / 游戏文件那两个落点上）时，
         * 别让浏览器直接打开那个文件、把当前页面顶掉。
         */
        <div
          onMouseDown={onBackdrop}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink-950/80 p-6"
        >
          {/*
            限高 + 内部滚动（2026-10-13）：字段多了之后，小屏幕下弹窗会顶出视口，
            底部的「上传 / 取消」就够不着了。让面板自己限高并滚动 ——
            遮罩那层的 `items-center` 才能真的把整块居中（否则 flex 居中会把顶部切掉）。
          */}
          <div className="bg-ink-800 pixel-edge pxw-3 pxc-600 max-h-[85vh] w-full max-w-[620px] overflow-y-auto p-4">
            <h2 className="mb-3 text-[12px] text-ink-200">
              {isEditing ? '编辑游戏' : '手动添加游戏'}
            </h2>

            {/*
              编辑态的一句提醒：文案挂的是**同款**（`games.group_key`），不是这一盘 ROM
              —— 所以改的是整款、同款那几个语言版本会一起变。盘数取自列表里现成的
              `groupSize`（后台列表为此多带了一列），不必再请求一次。
              只在编辑态出现：新增那条路本来就是新开一款，没有「改了会波及别人」这回事。
            */}
            {isEditing && (
              <p className="mb-3 text-[12px] text-ink-500">
                {editingGroupSize > 1
                  ? `下面写的文案是这一款共用的 —— 库里还有同款 ${editingGroupSize - 1} 盘 ROM，保存后它们的显示一起变。`
                  : '下面写的文案是这一款共用的 —— 之后给这一款补其他语言版本时，它们读的也是这一份。'}
              </p>
            )}

            {/*
              从链接自动填充：只在**新增**时出现 —— 编辑时封面 / ROM 都锁着，
              这条也帮不上忙（接口只回元数据）。输入框与按钮**不进主表单**，
              否则在里面按回车会直接把游戏提交了。
            */}
            {!isEditing && (
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <input
                    value={scrapeUrl}
                    onChange={(e) => setScrapeUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void autofill();
                      }
                    }}
                    placeholder={'粘贴游戏页链接，自动填充'}
                    className={`${FIELD_CLASS} min-w-0 flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => void autofill()}
                    disabled={scraping}
                    className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-3 py-2 text-[12px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {scraping ? '读取中…' : '自动填充'}
                  </button>
                </div>
                {scrapeNotice && (
                  <p
                    className={`mt-1 text-[12px] ${
                      scrapeNotice.tone === 'ok' ? 'text-ok' : 'text-danger'
                    }`}
                  >
                    {scrapeNotice.text}
                  </p>
                )}
              </div>
            )}

            <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
              {/*
                公共区：与语言无关的那几栏（类型 / 年份 / 语言 / 开发商）。
                文案**不在这儿** —— 它们按语言分块排在下面（见 `CONTENT_LOCALES.map`）。

                ⚠️ 2026-10-16 重构前这里和下面是**按字段**分组的（四个「游戏名」挨在一起、
                四个「说明」挨在一起），等于把「文案属于整款、四个语言各存一份」这件事
                藏起来了；而且四个语言的 12 个字段全是手抄的，加语言要动十几处。
              */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className={LABEL_CLASS}>
                  {'类型'}
                  <select
                    value={consoleType}
                    onChange={(e) => setConsoleType(e.target.value as ConsoleType)}
                    className={FIELD_CLASS}
                  >
                    {CONSOLE_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {CONSOLE_LABEL[value]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={LABEL_CLASS}>
                  {'年份'}
                  <input
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    inputMode="numeric"
                    className={FIELD_CLASS}
                  />
                </label>

                <label className={LABEL_CLASS}>
                  {'语言'}
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className={FIELD_CLASS}
                  >
                    <option value="">{'未指定'}</option>
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {/*
                  开发商：**下拉框**（2026-10-12 用户要求「添加游戏时发行商改成下拉形式」）。
                  选项来自开发商库（`/api/admin/developers/options`），选中值就是
                  `developers.id` —— 服务端拿到 id 再反查名字写进 `games.developer`，
                  所以「点开发商看他名下所有游戏」这条链是稳的（名字改了也断不了）。
                  下面那行小字指路：选项里没有想要的，就去开发商库新建一个。
                */}
                <label className={LABEL_CLASS}>
                  {'开发商'}
                  <select
                    value={developerId}
                    onChange={(e) => setDeveloperId(e.target.value)}
                    className={FIELD_CLASS}
                  >
                    <option value="">{'未指定'}</option>
                    {developerOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-[12px] text-ink-600">
                    {'列表里没有？先去'}{' '}
                    <Link
                      href="/admin/developers"
                      className="text-ink-400 underline transition-colors hover:text-accent"
                    >
                      {'开发商'}
                    </Link>
                  </span>
                  {unlinkedDeveloper && (
                    <span className="text-[12px] text-danger">
                      {`这条游戏现在写着「${unlinkedDeveloper}」，但它没接上开发商。请在下面选一个，否则保存后这行字会被清掉。`}
                    </span>
                  )}
                </label>
              </div>

              {/*
                封面图片：只有**新增**时可设 —— 换封面等于换一份内容，删了重加更干净。
                整块都是落点（从资源管理器拖文件、或从网页里拖一张图过来），高亮挂在
                包裹层上 —— 挂在 input 上没意义（它本身不是落点）。
              */}
              {!isEditing && (
                <label className={LABEL_CLASS}>
                  {'封面图片'}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setImageDrag(true);
                    }}
                    onDragLeave={() => setImageDrag(false)}
                    onDrop={(e) => void onImageDrop(e)}
                    className={`flex flex-col gap-1 p-1 transition-colors ${
                      imageDrag ? 'bg-accent/15' : ''
                    }`}
                  >
                    <input
                      ref={imageRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => setImage(e.target.files?.[0] ?? null)}
                      className={FIELD_CLASS}
                    />
                    <span className="text-[12px] text-ink-600">{'把图片拖到这里，或点选文件 —— 也可以从网页里直接拖一张过来。'}</span>
                    {image && (
                      <span className="truncate text-[12px] text-ink-400">{image.name}</span>
                    )}
                  </div>
                </label>
              )}

              {/*
                文案区：**按语言分块**（2026-10-16 重构）—— 和 `game_texts` 的结构对齐
                （一行 = 这一款在某个语言下的文案）。四个块由 `CONTENT_LOCALES` 生成，
                加语言只改 `lib/game-text.ts` 一处。

                中文那份**必填**：它是这一款的主名字，也是 `resolveGroupKey` 反查同款、
                `findGameDuplicate` 判重时用的那一份。其余三份选填、留空**逐字段**回退中文。
              */}
              {CONTENT_LOCALES.map((locale) => {
                const isZh = locale === 'zh';
                return (
                  <div
                    key={locale}
                    className="bg-ink-900 pixel-edge pxw-2 pxc-700 flex flex-col gap-3 p-3"
                  >
                    <h3 className="flex flex-wrap items-baseline gap-2 text-[12px] text-ink-300">
                      {CONTENT_LOCALE_LABEL[locale]}
                      <span className="text-[12px] text-ink-600">
                        {isZh ? '必填 —— 这一款的主名字' : '选填，留空回退中文'}
                      </span>
                    </h3>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className={LABEL_CLASS}>
                        {'名字'}
                        <input
                          value={texts[locale].title}
                          onChange={(e) => patchText(locale, 'title', e.target.value)}
                          className={FIELD_CLASS}
                        />
                      </label>

                      <label className={LABEL_CLASS}>
                        {'系列'}
                        <input
                          value={texts[locale].series}
                          onChange={(e) => patchText(locale, 'series', e.target.value)}
                          className={FIELD_CLASS}
                        />
                      </label>

                      {/*
                        说明是本表**唯一的多行字段**（其余都是单行 input）：它是给人看的
                        一两句介绍，会写整句中文，单行框里往回拖着看很难受。
                        可空 —— 留空就存 NULL（后台所有选填字段同一套写法）。
                      */}
                      <label className={`${LABEL_CLASS} sm:col-span-2`}>
                        {'说明'}
                        <textarea
                          value={texts[locale].description}
                          onChange={(e) => patchText(locale, 'description', e.target.value)}
                          rows={2}
                          placeholder={
                            isZh ? '选填。鼠标停在游戏库那张卡片上时会显示这行字。' : undefined
                          }
                          className={`${FIELD_CLASS} resize-y`}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}

              {isEditing ? (
                <p className="text-[12px] text-ink-500">
                  {'封面与游戏文件仅在添加时设置 —— 如需更换请删除后重新添加。'}
                </p>
              ) : (
                <label className={LABEL_CLASS}>
                  {'游戏文件'}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setRomDrag(true);
                    }}
                    onDragLeave={() => setRomDrag(false)}
                    onDrop={(e) => void onRomDrop(e)}
                    className={`flex flex-col gap-1 p-1 transition-colors ${
                      romDrag ? 'bg-accent/15' : ''
                    }`}
                  >
                    <input
                      ref={romRef}
                      type="file"
                      accept=".nes,.fds,.unf,.unif,.sfc,.smc,.swc,.fig,.bs,.gba,.agb,.zip"
                      onChange={(e) => void onRomChange(e)}
                      className={FIELD_CLASS}
                    />
                    <span className="text-[12px] text-ink-600">{'把游戏文件拖到这里，或点选文件。'}</span>
                    {rom && <span className="truncate text-[12px] text-ink-400">{rom.name}</span>}
                  </div>
                </label>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={busy}
                  className="pixel-edge pxw-3 pxc-600 bg-accent px-5 py-2 text-[12px] text-ink-950 transition-colors enabled:hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isEditing
                    ? busy
                      ? '保存中…'
                      : '保存'
                    : busy
                      ? '上传中…'
                      : '上传'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={busy}
                  className="pixel-edge pxw-2 pxc-500 bg-ink-700 px-4 py-2 text-[12px] text-ink-300 transition-colors enabled:hover:text-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {'取消'}
                </button>
                {modalNotice && (
                  <span
                    className={`text-[12px] ${
                      modalNotice.tone === 'ok' ? 'text-ok' : 'text-danger'
                    }`}
                  >
                    {modalNotice.text}
                  </span>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}