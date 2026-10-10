'use client';

import {
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
import AdminFeedback from './AdminFeedback';
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

/** 拉取已上传列表。抽成模块级函数，便于 effect 与增删改后共用。 */
async function fetchGames(): Promise<AdminGame[]> {
  const res = await fetch('/api/admin/games');
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()) as { games?: AdminGame[] };
  return data.games ?? [];
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
 * 后台管理台：游戏列表（默认视图，分页 + 搜索）+ 添加 / 编辑弹窗 + 删除 + 登出。
 * 鉴权由各接口自查（见 lib/server/admin-guard.ts），这里只负责界面与调接口。
 */
export default function AdminConsole({ username }: { username: string }) {
  const { t } = useI18n();
  const router = useRouter();

  const [games, setGames] = useState<AdminGame[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  // 真正生效的搜索词：点「搜索」或回车才从 draft 提交过来，避免边打字边过滤
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageNotice, setPageNotice] = useState<Notice | null>(null);

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

  // 首屏加载列表。setState 走 .then/.catch 回调 —— 直接在 effect 体里同步
  // setState 会被 react-hooks/set-state-in-effect 拦下。
  useEffect(() => {
    let cancelled = false;
    fetchGames()
      .then((list) => {
        if (!cancelled) setGames(list);
      })
      .catch(() => {
        if (!cancelled) setGames([]);
      })
      .finally(() => {
        if (!cancelled) setListLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  /** 搜索结果：游戏名 / 开发者 / 系列 / 语言任一命中即可。 */
  const matchedGames = useMemo(() => {
    const needle = keyword.toLowerCase();
    if (!needle) return games;
    return games.filter((game) =>
      [game.title, game.developer, game.series, languageLabel(game.language)].some((field) =>
        field?.toLowerCase().includes(needle)
      )
    );
  }, [games, keyword]);

  /*
   * 页码夹回有效范围（纯计算，不靠 effect）：在最后一页删掉几条后，page 可能
   * 已经越界，直接 slice 会得到空列表 —— 夹一下就行，省掉一次 setState。
   */
  const pageCount = Math.max(1, Math.ceil(matchedGames.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pagedGames = matchedGames.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
    const detected = await detectConsole(file);
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
        // 列表按 created_at 倒序，新条目在第一页 —— 跳回去才看得到刚传的那条
        setPage(1);
      }

      // 列表刷新失败不影响「这次保存成功了」这个结论，静默忽略
      await fetchGames()
        .then(setGames)
        .catch(() => undefined);
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
      setGames(await fetchGames());
      setPageNotice(null);
      router.refresh();
    } catch (error) {
      setPageNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : t('admin.request.failed'),
      });
    }
  };

  const logout = async () => {
    await fetch('/api/admin/login', { method: 'DELETE' }).catch(() => undefined);
    router.replace('/admin/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-ink-950 px-6 py-8 text-ink-100">
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
        <header className="flex items-center gap-3">
          <h1 className="text-[14px] text-ink-200">{t('admin.title')}</h1>
          <span className="text-[11px] text-ink-500">{username}</span>
          <button
            type="button"
            onClick={() => void logout()}
            className="pixel-edge pxw-2 pxc-500 ml-auto bg-ink-800 px-3 py-1.5 text-[11px] text-ink-300 transition-colors hover:text-danger"
          >
            {t('admin.logout')}
          </button>
        </header>

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

          {listLoaded && games.length === 0 && (
            <p className="text-[11px] text-ink-500">{t('admin.list.empty')}</p>
          )}

          {games.length > 0 && matchedGames.length === 0 && (
            <p className="text-[11px] text-ink-500">{t('admin.noMatch')}</p>
          )}

          {pagedGames.length > 0 && (
            <ul className="flex flex-col divide-y-2 divide-ink-900">
              {pagedGames.map((game) => (
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

        {/*
          留言本。放在游戏列表**之后** —— 后台的主线是录游戏，
          处理留言是顺手的活儿，不该一进来就顶在最上面。
        */}
        <AdminFeedback />
      </div>

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