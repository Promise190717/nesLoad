'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { detectConsole, type ConsoleType } from '@/lib/emulator';
import { unwrapRom } from '@/lib/unwrap';
import { CONSOLE_LABEL } from './CartridgeSprite';
import { useI18n } from './I18nProvider';

/** `/api/admin/games` 返回的条目。 */
interface AdminGame {
  id: string;
  title: string;
  imageUrl: string;
  consoleType: ConsoleType;
  language: string | null;
  series: string | null;
  year: number | null;
  developer: string | null;
  createdAt: number;
}

/** `/api/admin/games` 分页响应。 */
interface GamePage {
  games: AdminGame[];
  /** 匹配当前关键词的总条数（不是本页条数），用来算总页数。 */
  total: number;
  /** 服务端夹回有效范围后的 offset —— 以它为准，别用请求时那个。 */
  offset: number;
  limit: number;
}

type Notice = { tone: 'ok' | 'error'; text: string };

const CONSOLE_OPTIONS: readonly ConsoleType[] = ['nes', 'snes', 'arcade'];

/** 列表每页条数。 */
const PAGE_SIZE = 10;

/** 语言字段落到 DB 里存的是短码，这里给出可读标签。 */
const LANGUAGE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
];

const LANGUAGE_LABEL: Record<string, string> = { zh: '中文', en: 'English' };

/** 语言短码转可读名字；老数据若是自由文本则原样返回。 */
function languageLabel(value: string | null): string | null {
  if (!value) return null;
  return LANGUAGE_LABEL[value] ?? value;
}

/** 输入框统一样式，省得每个字段重复一长串 class。 */
const FIELD_CLASS =
  'pixel-edge pxw-2 pxc-500 w-full bg-ink-900 px-2 py-2 text-[12px] text-ink-100 placeholder:text-ink-600 focus:outline-none';

const LABEL_CLASS = 'flex flex-col gap-1 text-[10px] text-ink-400';

/**
 * 拉取**一页**列表。抽成模块级函数，便于 effect 与增删改后共用。
 *
 * 搜索词一起带给接口：分页之后本地就没有全量数据了，过滤只能落在服务端
 * （否则搜出来的东西会随翻页变，等于没搜）。
 */
async function fetchGames(offset: number, keyword: string): Promise<GamePage> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) });
  if (keyword) params.set('q', keyword);

  const res = await fetch(`/api/admin/games?${params}`);
  if (!res.ok) throw new Error(String(res.status));

  const data = (await res.json()) as Partial<GamePage>;
  return {
    games: data.games ?? [],
    total: data.total ?? 0,
    // 老服务端（没走分页的那版）不会给 offset，退回请求值即可
    offset: data.offset ?? offset,
    limit: data.limit ?? PAGE_SIZE,
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
 * 后台 · 游戏列表 tab：列表（**服务端分页** + 搜索）+ 添加 / 编辑弹窗 + 删除。
 * 鉴权由各接口自查（见 lib/server/admin-guard.ts），这里只负责界面与调接口。
 *
 * 顶栏、退出登录、左侧 tab 栏都在 `AdminShell` 里（由服务端 layout 包着），
 * 这个组件只画**这一页的内容** —— 原先它俩（列表 + 留言本）挤在一个页面里，
 * 2026-10-10 拆成了两个 tab，各自一个路由。
 */
/**
 * 本页要拉取的 offset。抽成 memo 的「一个对象」而不是 effect 里现算 `(page-1)*PAGE_SIZE`，
 * 是为了让 effect 的依赖写得直白：它变 = 页码变。
 */
function useListQuery(page: number) {
  return useMemo(() => ({ offset: (page - 1) * PAGE_SIZE }), [page]);
}

export default function AdminGames() {
  const { t } = useI18n();
  const router = useRouter();

  const [games, setGames] = useState<AdminGame[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoaded, setListLoaded] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  // 真正生效的搜索词：点「搜索」或回车才从 draft 提交过来，避免边打字边过滤
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
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
  const [consoleType, setConsoleType] = useState<ConsoleType>('nes');
  const [language, setLanguage] = useState('');
  const [series, setSeries] = useState('');
  const [year, setYear] = useState('');
  const [developer, setDeveloper] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [rom, setRom] = useState<File | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const romRef = useRef<HTMLInputElement>(null);

  const isEditing = editingId !== null;

  /** 本页要拉的 offset（随页码变）。 */
  const listQuery = useListQuery(page);

  /** 增删改后重新拉一遍当前页（同一条路径给「上传完跳回第一页」用）。 */
  const reloadList = useCallback(() => setListVersion((n) => n + 1), []);

  /*
   * 每次翻页 / 搜索 / 增删改都重新拉**当前这一页**，不再一次性把全库拉回来。
   * setState 走 .then/.catch 回调 —— 直接在 effect 体里同步 setState 会被
   * react-hooks/set-state-in-effect 拦下。
   *
   * `listQuery` 是 memo 出来的，它变 = 页码变；`listVersion` 只在增删改时递增。
   */
  useEffect(() => {
    /*
     * 请求序号：翻页快了会撞上乱序响应，慢的旧响应不许覆盖新的。
     * 放在 ref 里而不是用闭包里的 cancelled 标记 —— 后者的清理跑在
     * effect 重新执行时，两个请求的清理都等于「本轮请求被取消」，分不开谁是谁。
     */
    const requestId = ++listRequestId.current;
    const { offset } = listQuery;

    fetchGames(offset, keyword)
      .then((data) => {
        if (listRequestId.current !== requestId) return;
        setGames(data.games);
        setTotal(data.total);
        // 服务端会把越界的 offset 夹回最后一页（例如刚把最后一页删空了），跟着它走
        setPage(Math.floor(data.offset / PAGE_SIZE) + 1);
      })
      .catch(() => {
        if (listRequestId.current !== requestId) return;
        setGames([]);
        setTotal(0);
      })
      .finally(() => {
        if (listRequestId.current !== requestId) return;
        setListLoaded(true);
      });
  }, [listQuery, keyword, listVersion]);

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
   * 总页数由 total 算。`safePage` 只用来画「第几页 / 共几页」和按钮禁用态 ——
   * 越界不用在这里夹：服务端会把 offset 夹回最后一页，上面 setPage 已经跟上了。
   * 保留 Math.min 是为了两种极端下文字也不至于显示「3 / 2」：刚好删空最后一页的那一帧。
   */
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  const applySearch = () => {
    setKeyword(searchDraft.trim());
    setPage(1);
  };

  const resetForm = () => {
    setTitle('');
    setConsoleType('nes');
    setLanguage('');
    setSeries('');
    setYear('');
    setDeveloper('');
    setImage(null);
    setRom(null);
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
    setConsoleType(game.consoleType);
    setLanguage(game.language ?? '');
    setSeries(game.series ?? '');
    setYear(game.year === null ? '' : String(game.year));
    setDeveloper(game.developer ?? '');
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

  /** 选 ROM 时顺手认机种并预填 —— 用户仍可手动改。 */
  const onRomChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setRom(file);
    if (!file) return;
    /*
     * 先拆一层压缩包再认机种。
     *
     * 有些 ROM 是**压缩包伪装成 ROM 扩展名**（`.smc` / `.nes` 里其实是 zip），
     * 直接 `detectConsole` 会把它们一律判成街机 —— 预填错之后，游戏库里那条
     * 「机种筛选」也跟着错（用户按 SNES 筛，这盘却不出现）。规则见 `lib/unwrap.ts`。
     *
     * 只是**预填**，用户仍可手动改；真正载入时 `loadRom` 会自己再拆一次。
     */
    const unwrapped = await unwrapRom(file);
    const detected = await detectConsole(unwrapped?.file ?? file);
    if (detected) setConsoleType(detected);
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
            consoleType,
            language: language || null,
            series: series.trim() || null,
            year: parsedYear,
            developer: developer.trim() || null,
          }),
        });
        if (!res.ok) throw new Error(await readError(res, t('admin.request.failed')));
      } else {
        const form = new FormData();
        form.set('title', trimmedTitle);
        form.set('console_type', consoleType);
        form.set('language', language);
        form.set('series', series.trim());
        form.set('year', yearText);
        form.set('developer', developer.trim());
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
              className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-3 py-2 text-[11px] text-ink-200 transition-colors hover:text-accent"
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
        </div>

        {pageNotice && (
          <p
            className={`mb-2 text-[11px] ${
              pageNotice.tone === 'ok' ? 'text-ok' : 'text-danger'
            }`}
          >
            {pageNotice.text}
          </p>
        )}

        {listLoaded && total === 0 && !keyword && (
          <p className="text-[11px] text-ink-500">{t('admin.list.empty')}</p>
        )}

        {/* 库里有东西、只是没搜到 —— 和「库是空的」分开说，否则会以为库坏了 */}
        {listLoaded && total === 0 && keyword && (
          <p className="text-[11px] text-ink-500">{t('admin.noMatch')}</p>
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
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-100">
                  {game.title}
                </span>
                <span className="shrink-0 font-pixel text-[9px] text-accent">
                  {CONSOLE_LABEL[game.consoleType]}
                </span>
                <span className="w-[150px] shrink-0 truncate text-right text-[10px] text-ink-500">
                  {[game.year, game.developer, languageLabel(game.language), game.series]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <button
                  type="button"
                  onClick={() => openEdit(game)}
                  className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-2.5 py-1 text-[10px] text-ink-200 transition-colors hover:text-accent"
                >
                  {t('admin.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(game)}
                  className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-2.5 py-1 text-[10px] text-ink-200 transition-colors hover:text-danger"
                >
                  {t('admin.delete')}
                </button>
              </li>
            ))}
          </ul>
        )}

        {pageCount > 1 && (
          <div className="mt-3 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
              className="pixel-edge pxw-2 pxc-500 bg-ink-700 px-3 py-1 text-[10px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('admin.prev')}
            </button>
            <span className="text-[10px] text-ink-500">
              {safePage} / {pageCount}
            </span>
            <button
              type="button"
              disabled={safePage >= pageCount}
              onClick={() => setPage(safePage + 1)}
              className="pixel-edge pxw-2 pxc-500 bg-ink-700 px-3 py-1 text-[10px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('admin.next')}
            </button>
          </div>
        )}
      </section>

      {modalOpen && (
        <div
          onMouseDown={onBackdrop}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink-950/80 p-6"
        >
          <div className="bg-ink-800 pixel-edge pxw-3 pxc-600 w-full max-w-[620px] p-4">
            <h2 className="mb-3 text-[12px] text-ink-200">
              {isEditing ? t('admin.edit.title') : t('admin.upload.title')}
            </h2>

            <form
              onSubmit={(e) => void submit(e)}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {t('admin.field.title')}
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
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

              <label className={LABEL_CLASS}>
                {t('admin.field.series')}
                <input
                  value={series}
                  onChange={(e) => setSeries(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>

              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {t('admin.field.developer')}
                <input
                  value={developer}
                  onChange={(e) => setDeveloper(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>

              {isEditing ? (
                <p className="text-[10px] text-ink-500 sm:col-span-2">
                  {t('admin.files.locked')}
                </p>
              ) : (
                <>
                  <label className={LABEL_CLASS}>
                    {t('admin.field.image')}
                    <input
                      ref={imageRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => setImage(e.target.files?.[0] ?? null)}
                      className={FIELD_CLASS}
                    />
                  </label>

                  <label className={LABEL_CLASS}>
                    {t('admin.field.rom')}
                    <input
                      ref={romRef}
                      type="file"
                      accept=".nes,.fds,.unf,.unif,.sfc,.smc,.swc,.fig,.bs,.zip"
                      onChange={(e) => void onRomChange(e)}
                      className={FIELD_CLASS}
                    />
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
                    className={`text-[11px] ${
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