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
import { romLangToFormValue } from '@/lib/rom-lang';
import { unwrapRom } from '@/lib/unwrap';
import AdminBulkImport from './AdminBulkImport';
import AdminLoading from './AdminLoading';
import { FIELD_CLASS } from './adminStyles';
import { CONSOLE_LABEL, CONSOLE_TYPES } from './CartridgeSprite';
import { useI18n } from './I18nProvider';

/** `/api/admin/games` 返回的条目。 */
interface AdminGame {
  id: string;
  title: string;
  /** 英文名（可空）。2026-10-13 加，英文站取它、空了回退 `title`。 */
  titleEn: string | null;
  imageUrl: string;
  consoleType: ConsoleType;
  language: string | null;
  series: string | null;
  seriesEn: string | null;
  year: number | null;
  developer: string | null;
  developerEn: string | null;
  /**
   * 开发商外键（2026-10-12 加）。表单里那个下拉框选的就是它 —— 名字由服务端反查，
   * 所以这里编辑时只认 id；`developer` 那列文字只在列表上显示用。
   */
  developerId: string | null;
  description: string | null;
  descriptionEn: string | null;
  createdAt: number;
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

/** 语言字段落到 DB 里存的是短码，这里给出可读标签。 */
const LANGUAGE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
];

/**
 * 新增游戏时「语言」下拉的默认值。
 *
 * 站内库以英文 ROM 为主（后台列表里绝大多条都是 `en`），默认空着等于每加一条都要手动选一次。
 * ⚠️ **只作新增的默认值**：打开编辑时仍按记录原值填（空就是空）——
 * 否则编辑一条没标语言的老记录、只改个年份保存，语言会被悄悄写成 `en`。
 */
const DEFAULT_LANGUAGE = 'en';

const LANGUAGE_LABEL: Record<string, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
};

/** 语言短码转可读名字；老数据若是自由文本则原样返回。 */
function languageLabel(value: string | null): string | null {
  if (!value) return null;
  return LANGUAGE_LABEL[value] ?? value;
}

/** 每个字段外层那个 label（纵向排列 + 小字标签）。`FIELD_CLASS` 在 ./adminStyles（两个组件共用）。 */
const LABEL_CLASS = 'flex flex-col gap-1 text-[12px] text-ink-400';

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
  const { t } = useI18n();
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

  // 表单字段：新增与编辑共用一套
  const [title, setTitle] = useState('');
  /*
   * 英文字段（2026-10-13 加）。库里文案字段成对出现（无后缀 = 中文，`_en` = 英文），
   * 英文站取 `_en`、空了回退中文 —— 所以这几栏都是**选填**。
   */
  const [titleEn, setTitleEn] = useState('');
  const [consoleType, setConsoleType] = useState<ConsoleType>('nes');
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [series, setSeries] = useState('');
  const [seriesEn, setSeriesEn] = useState('');
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
  /*
   * 说明 / 简介。**唯一一个多行字段**（其余全是单行 input）—— 用 textarea 而不是
   * `input`：它是给用户看的一两句介绍，会写整句中文，单行框里往回拖着看很难受。
   * 可空：老记录补列之后都是 NULL，留空就存 NULL（后台所有选填字段同一套写法）。
   */
  const [description, setDescription] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
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

  const resetForm = () => {
    setTitle('');
    setTitleEn('');
    setConsoleType('nes');
    setLanguage(DEFAULT_LANGUAGE);
    setSeries('');
    setSeriesEn('');
    setYear('');
    setDeveloperId('');
    setUnlinkedDeveloper('');
    setDescription('');
    setDescriptionEn('');
    setImage(null);
    setRom(null);
    setScrapeUrl('');
    setScrapeNotice(null);
    if (imageRef.current) imageRef.current.value = '';
    if (romRef.current) romRef.current.value = '';
  };

  const openAdd = () => {
    resetForm();
    setEditingId(null);
    setModalNotice(null);
    setModalOpen(true);
  };

  const openEdit = (game: AdminGame) => {
    setEditingId(game.id);
    setTitle(game.title);
    setTitleEn(game.titleEn ?? '');
    setConsoleType(game.consoleType);
    setLanguage(game.language ?? '');
    setSeries(game.series ?? '');
    setSeriesEn(game.seriesEn ?? '');
    setYear(game.year === null ? '' : String(game.year));
    // 老记录（迁移前上传、或开发商那列是自由文本的）可能没有 id，那就退成「未指定」
    setDeveloperId(game.developerId ?? '');
    setUnlinkedDeveloper(game.developerId ? '' : game.developer ?? '');
    setDescription(game.description ?? '');
    setDescriptionEn(game.descriptionEn ?? '');
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
    const detected = await detectConsole(unwrapped?.file ?? file);
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
    if (!res.ok) throw new Error(await readError(res, t('admin.drop.imageFailed')));
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
      setModalNotice({ tone: 'error', text: t('admin.drop.imageFailed') });
      return;
    }

    try {
      await applyImageUrl(url);
    } catch (error) {
      setModalNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : t('admin.drop.imageFailed'),
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
    if (!res.ok) throw new Error(await readError(res, t('admin.scrape.romFailed')));
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
      if (!res.ok) throw new Error(await readError(res, t('admin.scrape.failed')));

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

      if (data.title) setTitle(data.title);
      if (data.titleEn) setTitleEn(data.titleEn);
      if (data.consoleType) setConsoleType(data.consoleType);
      if (data.year) setYear(String(data.year));
      if (data.series) setSeries(data.series);
      if (data.seriesEn) setSeriesEn(data.seriesEn);
      if (data.description) setDescription(data.description);
      if (data.descriptionEn) setDescriptionEn(data.descriptionEn);

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
        else notes.push(t('admin.scrape.developerMissing', { name: data.developer }));
      }

      // 取字节前先挂一条提示：ROM 有几 MB，不会瞬回，不给字就像卡住了
      if (data.imageUrl || data.romUrl) {
        setScrapeNotice({ tone: 'ok', text: t('admin.scrape.assets') });
      }

      const [cover, romFile] = await Promise.allSettled([
        data.imageUrl ? applyImageUrl(data.imageUrl) : Promise.resolve(),
        data.romUrl ? applyRomUrl(data.romUrl, data.romName ?? '') : Promise.resolve(),
      ]);

      let failed = false;
      if (data.imageUrl && cover.status === 'rejected') {
        notes.push(t('admin.scrape.coverFailed'));
        failed = true;
      }
      if (data.romUrl && romFile.status === 'rejected') {
        notes.push(t('admin.scrape.romFailed'));
        failed = true;
      }
      // 页面根本没挂文件时明说一句 —— 否则用户会以为「抓到了但没填上」
      if (!data.romUrl) notes.push(t('admin.scrape.noRom'));
      else if (!failed && notes.length === 0) notes.push(t('admin.scrape.assetsOk'));

      setScrapeNotice({
        tone: failed ? 'error' : 'ok',
        text: [failed ? '' : t('admin.scrape.ok'), ...notes].filter(Boolean).join(' '),
      });
    } catch (error) {
      setScrapeNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : t('admin.scrape.failed'),
      });
    } finally {
      setScraping(false);
    }
  };

  /** 新增 / 编辑共用一个提交入口，靠 isEditing 分流。 */
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setModalNotice({ tone: 'error', text: t('admin.title.required') });
      return;
    }

    const yearText = year.trim();
    const parsedYear = yearText ? Number(yearText) : null;
    if (parsedYear !== null && !Number.isInteger(parsedYear)) {
      setModalNotice({ tone: 'error', text: t('admin.badYear') });
      return;
    }

    if (!isEditing && (!image || !rom)) {
      setModalNotice({ tone: 'error', text: t('admin.upload.required') });
      return;
    }

    setBusy(true);
    setModalNotice(null);

    try {
      if (isEditing) {
        const res = await fetch(`/api/admin/games/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: trimmedTitle,
            titleEn: titleEn.trim() || null,
            consoleType,
            language: language || null,
            series: series.trim() || null,
            seriesEn: seriesEn.trim() || null,
            year: parsedYear,
            // 下拉框给的是 developers.id；名字由服务端反查后写进 developer 那列
            developerId: developerId || null,
            description: description.trim() || null,
            descriptionEn: descriptionEn.trim() || null,
          }),
        });
        if (!res.ok) throw new Error(await readError(res, t('admin.request.failed')));
      } else {
        const form = new FormData();
        form.set('title', trimmedTitle);
        form.set('title_en', titleEn.trim());
        form.set('console_type', consoleType);
        form.set('language', language);
        form.set('series', series.trim());
        form.set('series_en', seriesEn.trim());
        form.set('year', yearText);
        form.set('developer_id', developerId);
        form.set('description', description.trim());
        form.set('description_en', descriptionEn.trim());
        form.set('image', image as File);
        form.set('rom', rom as File);

        const res = await fetch('/api/admin/games', { method: 'POST', body: form });
        // 失败时把服务端细节原样抛出来，交给 catch 显示
        if (!res.ok) throw new Error(await readError(res, t('admin.upload.failed')));
        setPageNotice({ tone: 'ok', text: t('admin.upload.ok') });
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
        text: error instanceof Error ? error.message : t('admin.request.failed'),
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (game: AdminGame) => {
    if (!window.confirm(t('admin.deleteConfirm', { name: game.title }))) return;
    try {
      const res = await fetch(`/api/admin/games/${game.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res, t('admin.request.failed')));
      // 行消失就是最好的反馈，不必再弹成功提示
      reloadList();
      setPageNotice(null);
      router.refresh();
    } catch (error) {
      setPageNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : t('admin.request.failed'),
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="bg-ink-800 pixel-edge pxw-3 pxc-600 p-4">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="shrink-0 text-[12px] text-ink-200">{t('admin.list.title')}</h2>
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
              placeholder={t('admin.searchPlaceholder')}
              className={`${FIELD_CLASS} min-w-0 flex-1`}
            />
            <button
              type="submit"
              className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-3 py-2 text-[12px] text-ink-200 transition-colors hover:text-accent"
            >
              {t('admin.search')}
            </button>
          </form>
          <button
            type="button"
            onClick={openAdd}
            className="pixel-edge pxw-3 pxc-600 shrink-0 bg-accent px-4 py-2 text-[12px] text-ink-950 transition-colors hover:bg-accent/80"
          >
            {t('admin.add')}
          </button>
          {/* 「添加」旁边那个批量入口 —— 按钮和弹框都在它自己的组件里 */}
          <AdminBulkImport onImported={handleBulkImported} />
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
        {listPending && <AdminLoading label={t('feedback.loading')} />}

        {listLoaded && games.length === 0 && !keyword && (
          <p className="text-[12px] text-ink-500">{t('admin.list.empty')}</p>
        )}

        {/* 库里有东西、只是没搜到 —— 和「库是空的」分开说，否则会以为库坏了 */}
        {listLoaded && games.length === 0 && keyword && (
          <p className="text-[12px] text-ink-500">{t('admin.noMatch')}</p>
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
                  <span className="truncate text-[12px] text-ink-100">{game.title}</span>
                  {game.description && (
                    <span className="truncate text-[12px] text-ink-500">{game.description}</span>
                  )}
                </span>
                <span className="shrink-0 font-pixel text-[12px] text-accent">
                  {CONSOLE_LABEL[game.consoleType]}
                </span>
                <span className="w-[150px] shrink-0 truncate text-right text-[12px] text-ink-500">
                  {[game.year, game.developer, languageLabel(game.language), game.series]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <button
                  type="button"
                  onClick={() => openEdit(game)}
                  className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-2.5 py-1 text-[12px] text-ink-200 transition-colors hover:text-accent"
                >
                  {t('admin.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(game)}
                  className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-2.5 py-1 text-[12px] text-ink-200 transition-colors hover:text-danger"
                >
                  {t('admin.delete')}
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
              {t('admin.prev')}
            </button>
            <span className="text-[12px] text-ink-500">{t('admin.currentPage', { page })}</span>
            <button
              type="button"
              disabled={!hasMore || !nextCursor}
              onClick={goNext}
              className="pixel-edge pxw-2 pxc-500 bg-ink-700 px-3 py-1 text-[12px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('admin.next')}
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
              {isEditing ? t('admin.edit.title') : t('admin.upload.title')}
            </h2>

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
                    placeholder={t('admin.scrape.placeholder')}
                    className={`${FIELD_CLASS} min-w-0 flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => void autofill()}
                    disabled={scraping}
                    className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-3 py-2 text-[12px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {scraping ? t('admin.scrape.loading') : t('admin.scrape.button')}
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

            <form
              onSubmit={(e) => void submit(e)}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
              {/*
                中英两栏**并排一行**（2026-10-13 用户要求「游戏名中英合并成一行」）——
                填的时候一眼能对上；下面那行小字统一说明「留空回退中文」这条规则。
              */}
              <label className={LABEL_CLASS}>
                {t('admin.field.title')}
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>

              <label className={LABEL_CLASS}>
                {t('admin.field.titleEn')}
                <input
                  value={titleEn}
                  onChange={(e) => setTitleEn(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>

              <label className={LABEL_CLASS}>
                {t('admin.field.console')}
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
                {t('admin.field.year')}
                <input
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  inputMode="numeric"
                  className={FIELD_CLASS}
                />
              </label>

              <label className={LABEL_CLASS}>
                {t('admin.field.language')}
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className={FIELD_CLASS}
                >
                  <option value="">{t('admin.language.none')}</option>
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
                （2026-10-13 起与「语言」并排一行。）
              */}
              <label className={LABEL_CLASS}>
                {t('admin.field.developer')}
                <select
                  value={developerId}
                  onChange={(e) => setDeveloperId(e.target.value)}
                  className={FIELD_CLASS}
                >
                  <option value="">{t('admin.developers.none')}</option>
                  {developerOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <span className="text-[12px] text-ink-600">
                  {t('admin.developers.addHint')}{' '}
                  <Link
                    href="/admin/developers"
                    className="text-ink-400 underline transition-colors hover:text-accent"
                  >
                    {t('admin.nav.developers')}
                  </Link>
                </span>
                {unlinkedDeveloper && (
                  <span className="text-[12px] text-danger">
                    {t('admin.developers.unlinked', { name: unlinkedDeveloper })}
                  </span>
                )}
              </label>

              <label className={LABEL_CLASS}>
                {t('admin.field.series')}
                <input
                  value={series}
                  onChange={(e) => setSeries(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>

              <label className={LABEL_CLASS}>
                {t('admin.field.seriesEn')}
                <input
                  value={seriesEn}
                  onChange={(e) => setSeriesEn(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>

              {/* 英文字段的统一说明，横跨整行，压在几组中英并排字段的下面 */}
              <p className={`${LABEL_CLASS} text-ink-600 sm:col-span-2`}>
                {t('admin.i18n.hint')}
              </p>

              {/* 说明：本表唯一一个多行字段，`resize-y` 让它可以往下拉高一点写长句 */}
              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {t('admin.field.description')}
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder={t('admin.description.placeholder')}
                  className={`${FIELD_CLASS} resize-y`}
                />
              </label>

              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {t('admin.field.descriptionEn')}
                <textarea
                  value={descriptionEn}
                  onChange={(e) => setDescriptionEn(e.target.value)}
                  rows={3}
                  className={`${FIELD_CLASS} resize-y`}
                />
              </label>

              {isEditing ? (
                <p className="text-[12px] text-ink-500 sm:col-span-2">
                  {t('admin.files.locked')}
                </p>
              ) : (
                <>
                  <label className={LABEL_CLASS}>
                    {t('admin.field.image')}
                    {/*
                      整块都是落点：从资源管理器拖文件、或从网页里拖一张图过来。
                      高亮挂在包裹层上 —— 挂在 input 上没意义（它本身不是落点）。
                    */}
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
                      <span className="text-[12px] text-ink-600">{t('admin.drop.image')}</span>
                      {image && (
                        <span className="truncate text-[12px] text-ink-400">{image.name}</span>
                      )}
                    </div>
                  </label>

                  <label className={LABEL_CLASS}>
                    {t('admin.field.rom')}
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
                      <span className="text-[12px] text-ink-600">{t('admin.drop.rom')}</span>
                      {rom && <span className="truncate text-[12px] text-ink-400">{rom.name}</span>}
                    </div>
                  </label>
                </>
              )}

              <div className="flex items-center gap-3 sm:col-span-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="pixel-edge pxw-3 pxc-600 bg-accent px-5 py-2 text-[12px] text-ink-950 transition-colors enabled:hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isEditing
                    ? busy
                      ? t('admin.saving')
                      : t('admin.save')
                    : busy
                      ? t('admin.upload.submitting')
                      : t('admin.upload.submit')}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={busy}
                  className="pixel-edge pxw-2 pxc-500 bg-ink-700 px-4 py-2 text-[12px] text-ink-300 transition-colors enabled:hover:text-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('admin.cancel')}
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