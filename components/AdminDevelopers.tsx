'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminLoading from './AdminLoading';
import { useI18n } from './I18nProvider';

/** `/api/admin/developers` 返回的条目。 */
interface AdminDeveloper {
  id: string;
  name: string;
  /** 英文名（可空）。2026-10-13 加，英文站取它、空了回退 `name`。 */
  nameEn: string | null;
  imageUrl: string | null;
  summary: string | null;
  summaryEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  foundedYear: number | null;
  website: string | null;
  createdAt: number;
  /** 名下游戏数。名下有游戏时**不许删**（接口会回 409）。 */
  gameCount: number;
}

interface DeveloperPage {
  developers: AdminDeveloper[];
  total: number;
  offset: number;
  limit: number;
}

type Notice = { tone: 'ok' | 'error'; text: string };

/** 列表每页条数。和游戏列表那边取同一个值，翻页手感一致。 */
const PAGE_SIZE = 10;

const FIELD_CLASS =
  'pixel-edge pxw-2 pxc-500 w-full bg-ink-900 px-2 py-2 text-[12px] text-ink-100 placeholder:text-ink-600 focus:outline-none';

const LABEL_CLASS = 'flex flex-col gap-1 text-[10px] text-ink-400';

async function fetchDevelopers(offset: number, keyword: string): Promise<DeveloperPage> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) });
  if (keyword) params.set('q', keyword);

  const res = await fetch(`/api/admin/developers?${params}`);
  if (!res.ok) throw new Error(String(res.status));

  const data = (await res.json()) as Partial<DeveloperPage>;
  return {
    developers: data.developers ?? [],
    total: data.total ?? 0,
    offset: data.offset ?? offset,
    limit: data.limit ?? PAGE_SIZE,
  };
}

/** 和 AdminGames 里那份同一套：把服务端给的 detail 挖出来，比一句「请求失败」有用。 */
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: string };
    return data.detail ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * 后台 · 开发商 tab：列表（服务端分页 + 搜索）+ 新建 / 编辑弹窗 + 删除。
 *
 * 这张表是 2026-10-12 用户要的「厂商库」。口径统一叫**开发商** —— 它接的就是
 * 游戏表单里原来那个手填的 developer 字段（见 db/schema.sql 的 developers 表注释）。
 *
 * 「添加游戏」那边的开发商下拉框读的是同一个库（`/api/admin/developers/options`），
 * 所以这里新建一个、那边立刻就能选到 —— 两个 tab 之间靠这一张表串起来。
 */
export default function AdminDevelopers() {
  const { t, href: localeHref } = useI18n();
  const router = useRouter();

  const [list, setList] = useState<AdminDeveloper[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoaded, setListLoaded] = useState(false);
  /** 当前是否有一条列表请求在飞：翻页 / 搜索 / 增删改后的重拉都点亮加载行。 */
  const [listPending, setListPending] = useState(true);
  const [searchDraft, setSearchDraft] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageNotice, setPageNotice] = useState<Notice | null>(null);
  const [listVersion, setListVersion] = useState(0);
  /** 请求序号：翻页快了会撞上乱序响应，慢的旧响应不许覆盖新的。 */
  const listRequestId = useRef(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalNotice, setModalNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  // 表单字段：新建与编辑共用一套
  const [name, setName] = useState('');
  /* 英文字段（2026-10-13 加）：选填，英文站取 `_en`、空了回退中文 */
  const [nameEn, setNameEn] = useState('');
  const [summary, setSummary] = useState('');
  const [summaryEn, setSummaryEn] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [foundedYear, setFoundedYear] = useState('');
  const [website, setWebsite] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imageLabel, setImageLabel] = useState('');
  const imageRef = useRef<HTMLInputElement>(null);

  const isEditing = editingId !== null;
  const listQuery = useMemo(() => ({ offset: (page - 1) * PAGE_SIZE }), [page]);
  const reloadList = useCallback(() => setListVersion((n) => n + 1), []);

  // 每次翻页 / 搜索 / 增删改都重拉当前页。setState 一律走 .then/.catch —— 直接在
  // effect 体里同步 setState 会被 react-hooks/set-state-in-effect 拦下。
  useEffect(() => {
    const requestId = ++listRequestId.current;
    const { offset } = listQuery;

    /*
     * 先点亮「载入中」。effect 体内同步 setState 会被 react-hooks/set-state-in-effect
     * 拦下，所以放微任务里（执行序仍先于 fetch 响应，不会漏帧）；
     * 同样受 requestId 把守：请求被换掉时，旧请求不许点亮新一轮。
     */
    void Promise.resolve().then(() => {
      if (listRequestId.current !== requestId) return;
      setListPending(true);
    });

    fetchDevelopers(offset, keyword)
      .then((data) => {
        if (listRequestId.current !== requestId) return;
        setList(data.developers);
        setTotal(data.total);
        // 服务端会把越界的 offset 夹回最后一页（例如刚把最后一页删空），跟着它走
        setPage(Math.floor(data.offset / PAGE_SIZE) + 1);
      })
      .catch(() => {
        if (listRequestId.current !== requestId) return;
        setList([]);
        setTotal(0);
      })
      .finally(() => {
        if (listRequestId.current !== requestId) return;
        setListLoaded(true);
        setListPending(false);
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

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  const applySearch = () => {
    setKeyword(searchDraft.trim());
    setPage(1);
  };

  const resetForm = () => {
    setName('');
    setNameEn('');
    setSummary('');
    setSummaryEn('');
    setDescription('');
    setDescriptionEn('');
    setFoundedYear('');
    setWebsite('');
    setImage(null);
    setImageLabel('');
    if (imageRef.current) imageRef.current.value = '';
  };

  const openAdd = () => {
    resetForm();
    setEditingId(null);
    setModalNotice(null);
    setModalOpen(true);
  };

  const openEdit = (developer: AdminDeveloper) => {
    setEditingId(developer.id);
    setName(developer.name);
    setNameEn(developer.nameEn ?? '');
    setSummary(developer.summary ?? '');
    setSummaryEn(developer.summaryEn ?? '');
    setDescription(developer.description ?? '');
    setDescriptionEn(developer.descriptionEn ?? '');
    setFoundedYear(developer.foundedYear === null ? '' : String(developer.foundedYear));
    setWebsite(developer.website ?? '');
    setImage(null);
    // 编辑时输入框默认是空的（浏览器不许我们往里塞值）；把现有文件名写在旁边，
    // 用户才知道「不选就是保持原图」而不是「图没了」
    setImageLabel(developer.imageUrl ? developer.imageUrl.split('/').pop() ?? '' : '');
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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setModalNotice({ tone: 'error', text: t('admin.developers.nameRequired') });
      return;
    }

    const foundedText = foundedYear.trim();
    const parsedFounded = foundedText ? Number(foundedText) : null;
    if (parsedFounded !== null && !Number.isInteger(parsedFounded)) {
      setModalNotice({ tone: 'error', text: t('admin.developers.badFounded') });
      return;
    }

    setBusy(true);
    setModalNotice(null);

    // 改 / 增都是 multipart（换厂标要带文件），所以两边共用同一份 FormData 拼法
    const form = new FormData();
    form.set('name', trimmedName);
    form.set('name_en', nameEn.trim());
    form.set('summary', summary.trim());
    form.set('summary_en', summaryEn.trim());
    form.set('description', description.trim());
    form.set('description_en', descriptionEn.trim());
    form.set('founded_year', foundedText);
    form.set('website', website.trim());
    if (image) form.set('image', image);

    try {
      const res = await fetch(
        isEditing ? `/api/admin/developers/${editingId}` : '/api/admin/developers',
        { method: isEditing ? 'PATCH' : 'POST', body: form }
      );
      if (!res.ok) throw new Error(await readError(res, t('admin.developers.failed')));

      setPageNotice({ tone: 'ok', text: t('admin.developers.saved') });
      // 新建的排在最后一页（按创建时间倒序），但用户更可能立刻想给游戏选它 ——
      // 不跳页，留在原地，只在顶部提示一句就够了。
      reloadList();
      resetForm();
      setModalOpen(false);
      setEditingId(null);
      router.refresh();
    } catch (error) {
      setModalNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : t('admin.developers.failed'),
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (developer: AdminDeveloper) => {
    // 名下有游戏时接口会回 409 和一整句说明 —— 先问一句是防手滑，真正的把关在服务端
    if (!window.confirm(t('admin.developers.deleteConfirm', { name: developer.name }))) return;
    try {
      const res = await fetch(`/api/admin/developers/${developer.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res, t('admin.developers.failed')));
      reloadList();
      setPageNotice(null);
      router.refresh();
    } catch (error) {
      setPageNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : t('admin.developers.failed'),
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="bg-ink-800 pixel-edge pxw-3 pxc-600 p-4">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="shrink-0 text-[12px] text-ink-200">{t('admin.developers.title')}</h2>
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
              placeholder={t('admin.developers.searchPlaceholder')}
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

        {/* 列表请求在飞（首屏 / 翻页 / 搜索 / 增删改后重拉）就亮加载行 —— 之前这几段是纯空白 */}
        {listPending && <AdminLoading label={t('feedback.loading')} />}

        {listLoaded && total === 0 && !keyword && (
          <p className="text-[11px] text-ink-500">{t('admin.developers.empty')}</p>
        )}
        {listLoaded && total === 0 && keyword && (
          <p className="text-[11px] text-ink-500">{t('admin.noMatch')}</p>
        )}

        {list.length > 0 && (
          <ul className="flex flex-col divide-y-2 divide-ink-900">
            {list.map((developer) => (
              <li key={developer.id} className="flex items-center gap-3 py-2">
                {/* 没传厂标的不画破图，退成一个首字占位块 */}
                {developer.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={developer.imageUrl}
                    alt=""
                    className="pixel-edge pxw-2 pxc-700 h-[36px] w-[36px] shrink-0 bg-ink-900 object-cover"
                  />
                ) : (
                  <span className="pixel-edge pxw-2 pxc-700 flex h-[36px] w-[36px] shrink-0 items-center justify-center bg-ink-900 text-[13px] text-ink-500">
                    {Array.from(developer.name)[0] ?? '?'}
                  </span>
                )}

                {/* 名字 + 简介两行，和游戏列表那条同一个版式（长简介 truncate，不撑破这一行） */}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[12px] text-ink-100">{developer.name}</span>
                  {developer.summary && (
                    <span className="truncate text-[10px] text-ink-500">{developer.summary}</span>
                  )}
                </span>

                <span className="shrink-0 text-[10px] text-ink-500">
                  {t('admin.developers.gameCount', { count: developer.gameCount })}
                </span>

                <Link
                  href={localeHref(`/developers/${developer.id}`)}
                  target="_blank"
                  rel="noreferrer"
                  className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-2.5 py-1 text-[10px] text-ink-200 transition-colors hover:text-accent"
                >
                  {t('admin.developers.view')}
                </Link>
                <button
                  type="button"
                  onClick={() => openEdit(developer)}
                  className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-2.5 py-1 text-[10px] text-ink-200 transition-colors hover:text-accent"
                >
                  {t('admin.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(developer)}
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
              {isEditing ? t('admin.developers.editTitle') : t('admin.developers.addTitle')}
            </h2>

            <form onSubmit={(e) => void submit(e)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {t('admin.developers.field.name')}
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>

              {/* 英文字段（2026-10-13 加），紧挨中文那栏 —— 见 AdminGames 里同一段注释 */}
              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {t('admin.developers.field.nameEn')}
                <input
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>

              <label className={LABEL_CLASS}>
                {t('admin.developers.field.founded')}
                <input
                  value={foundedYear}
                  onChange={(e) => setFoundedYear(e.target.value)}
                  inputMode="numeric"
                  className={FIELD_CLASS}
                />
              </label>

              <label className={LABEL_CLASS}>
                {t('admin.developers.field.website')}
                <input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>

              {/*
                厂标。**编辑时不强制重选**：输入框在浏览器里没法预填一个已存在的 File，
                所以留空 = 保持原图（接口那边也是这么处理的），
                旁边那行小字把「当前这张叫什么」写出来，用户才知道自己没把它删掉。
              */}
              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {t('admin.developers.field.image')}
                <input
                  ref={imageRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    setImage(e.target.files?.[0] ?? null);
                    setImageLabel(e.target.files?.[0]?.name ?? '');
                  }}
                  className={FIELD_CLASS}
                />
                <span className="text-[10px] text-ink-600">
                  {imageLabel
                    ? t('admin.developers.imageCurrent', { name: imageLabel })
                    : t('admin.developers.imageHint')}
                </span>
              </label>

              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {t('admin.developers.field.summary')}
                <input
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>

              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {t('admin.developers.field.summaryEn')}
                <input
                  value={summaryEn}
                  onChange={(e) => setSummaryEn(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>

              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {t('admin.developers.field.description')}
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className={`${FIELD_CLASS} resize-y`}
                />
              </label>

              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {t('admin.developers.field.descriptionEn')}
                <textarea
                  value={descriptionEn}
                  onChange={(e) => setDescriptionEn(e.target.value)}
                  rows={4}
                  className={`${FIELD_CLASS} resize-y`}
                />
              </label>

              <div className="flex items-center gap-3 sm:col-span-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="pixel-edge pxw-3 pxc-600 bg-accent px-5 py-2 text-[12px] text-ink-950 transition-colors enabled:hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? t('admin.saving') : t('admin.save')}
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
