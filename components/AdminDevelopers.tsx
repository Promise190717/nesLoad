'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminLoading from './AdminLoading';

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

/** `/api/admin/developers` 分页响应（游标翻页，2026-10-14 起）。没有 total —— 后台用不到。 */
interface DeveloperPage {
  developers: AdminDeveloper[];
  /** 往后翻的游标；null = 后面没有了。回传给下一次请求的 `cursor` 参数。 */
  nextCursor: string | null;
  hasMore: boolean;
}

type Notice = { tone: 'ok' | 'error'; text: string };

/** 列表每页条数。和游戏列表那边取同一个值，翻页手感一致。 */
const PAGE_SIZE = 10;

const FIELD_CLASS =
  'pixel-edge pxw-2 pxc-500 w-full bg-ink-900 px-2 py-2 text-[12px] text-ink-100 placeholder:text-ink-600 focus:outline-none';

const LABEL_CLASS = 'flex flex-col gap-1 text-[12px] text-ink-400';

/** 游标翻页，见 AdminGames 里 fetchGames 的说明（两边同一套形状）。 */
async function fetchDevelopers(cursor: string | null, keyword: string): Promise<DeveloperPage> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) params.set('cursor', cursor);
  if (keyword) params.set('q', keyword);

  const res = await fetch(`/api/admin/developers?${params}`);
  if (!res.ok) throw new Error(String(res.status));

  const data = (await res.json()) as Partial<DeveloperPage>;
  return {
    developers: data.developers ?? [],
    nextCursor: data.nextCursor ?? null,
    hasMore: data.hasMore ?? false,
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
  const router = useRouter();

  const [list, setList] = useState<AdminDeveloper[]>([]);
  /** 「下一页还有没有」。游标翻页没有总数，下一页按钮的禁用态全看它。 */
  const [hasMore, setHasMore] = useState(false);
  const [listLoaded, setListLoaded] = useState(false);
  /** 当前是否有一条列表请求在飞：翻页 / 搜索 / 增删改后的重拉都点亮加载行。 */
  const [listPending, setListPending] = useState(true);
  const [searchDraft, setSearchDraft] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  /*
   * 游标栈（2026-10-14 从 offset 翻页改过来），形状与 AdminGames 里那份同一套：
   * 下标 = 页码-1，`cursorHistory[0]` 恒为 null；「上一页」从栈里拿回入口重新请求，
   * 不做反向游标查询。每页被重新拉取时它存的 `nextCursor` 都会被覆盖。
   */
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
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
  /** 本页的入口游标（从栈里取；第一页恒为 null）。effect 的唯一翻页开关。 */
  const cursor = cursorHistory[page - 1] ?? null;
  /** 本页响应里的「下一页入口」。翻下一页前先看它还在不在。 */
  const nextCursor = cursorHistory[page] ?? null;
  const reloadList = useCallback(() => setListVersion((n) => n + 1), []);

  /** 翻下一页。`nextCursor` 在就一定存在栈里（写入发生在上一页响应到达时）。 */
  const goNext = useCallback(() => {
    if (!hasMore || !nextCursor) return;
    setPage((p) => p + 1);
  }, [hasMore, nextCursor]);

  /** 翻上一页：从栈里拿回上一页当时用的入口游标，重新请求。 */
  const goPrev = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);

  // 每次翻页 / 搜索 / 增删改都重拉当前页。setState 一律走 .then/.catch —— 直接在
  // effect 体里同步 setState 会被 react-hooks/set-state-in-effect 拦下。
  // effect 依赖里有 page：成功回调要往 cursorHistory[page] 写下一页的入口。
  useEffect(() => {
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

    fetchDevelopers(cursor, keyword)
      .then((data) => {
        if (listRequestId.current !== requestId) return;
        setList(data.developers);
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
        setList([]);
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
   * 游标翻页没有 total，「共 Y 页」算不出来（2026-10-14 用户拍板选 A）——
   * 分页条只显示「第 X 页」，下一页按钮的禁用态由 hasMore 决定，越界无从谈起。
   */
  const applySearch = () => {
    setKeyword(searchDraft.trim());
    // 关键词变了，旧关键词翻过的游标全部作废 —— 清栈，从第一页重来
    setCursorHistory([null]);
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
      setModalNotice({ tone: 'error', text: '请填写开发商名字。' });
      return;
    }

    const foundedText = foundedYear.trim();
    const parsedFounded = foundedText ? Number(foundedText) : null;
    if (parsedFounded !== null && !Number.isInteger(parsedFounded)) {
      setModalNotice({ tone: 'error', text: '成立年份必须是整数。' });
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
      if (!res.ok) throw new Error(await readError(res, '请求失败。'));

      setPageNotice({ tone: 'ok', text: '已保存。' });
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
        text: error instanceof Error ? error.message : '请求失败。',
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (developer: AdminDeveloper) => {
    // 名下有游戏时接口会回 409 和一整句说明 —— 先问一句是防手滑，真正的把关在服务端
    if (!window.confirm(`删除「${developer.name}」？此操作不可撤销。`)) return;
    try {
      const res = await fetch(`/api/admin/developers/${developer.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res, '请求失败。'));
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
        <div className="mb-3 flex items-center gap-3">
          <h2 className="shrink-0 text-[12px] text-ink-200">{'开发商'}</h2>
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
              placeholder={'搜索开发商名字 / 简介'}
              className={`${FIELD_CLASS} min-w-0 flex-1`}
            />
            <button
              type="submit"
              className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-3 py-2 text-[12px] text-ink-200 transition-colors hover:text-accent"
            >
              {'搜索'}
            </button>
          </form>
          <button
            type="button"
            onClick={openAdd}
            className="pixel-edge pxw-3 pxc-600 shrink-0 bg-accent px-4 py-2 text-[12px] text-ink-950 transition-colors hover:bg-accent/80"
          >
            {'添加'}
          </button>
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

        {listLoaded && list.length === 0 && !keyword && (
          <p className="text-[12px] text-ink-500">{'还没有开发商。'}</p>
        )}
        {listLoaded && list.length === 0 && keyword && (
          <p className="text-[12px] text-ink-500">{'没有匹配的游戏。'}</p>
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
                    <span className="truncate text-[12px] text-ink-500">{developer.summary}</span>
                  )}
                </span>

                <span className="shrink-0 text-[12px] text-ink-500">
                  {`${developer.gameCount} 款游戏`}
                </span>

                <Link
                  href={`/developers/${developer.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-2.5 py-1 text-[12px] text-ink-200 transition-colors hover:text-accent"
                >
                  {'查看'}
                </Link>
                <button
                  type="button"
                  onClick={() => openEdit(developer)}
                  className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-2.5 py-1 text-[12px] text-ink-200 transition-colors hover:text-accent"
                >
                  {'编辑'}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(developer)}
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
        <div
          onMouseDown={onBackdrop}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink-950/80 p-6"
        >
          <div className="bg-ink-800 pixel-edge pxw-3 pxc-600 w-full max-w-[620px] p-4">
            <h2 className="mb-3 text-[12px] text-ink-200">
              {isEditing ? '编辑开发商' : '添加开发商'}
            </h2>

            <form onSubmit={(e) => void submit(e)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {'名字'}
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>

              {/* 英文字段（2026-10-13 加），紧挨中文那栏 —— 见 AdminGames 里同一段注释 */}
              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {'名字 (EN)'}
                <input
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>

              <label className={LABEL_CLASS}>
                {'成立年份'}
                <input
                  value={foundedYear}
                  onChange={(e) => setFoundedYear(e.target.value)}
                  inputMode="numeric"
                  className={FIELD_CLASS}
                />
              </label>

              <label className={LABEL_CLASS}>
                {'官网'}
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
                {'厂标 / 图片'}
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
                <span className="text-[12px] text-ink-600">
                  {imageLabel
                    ? `当前：${imageLabel}。留空表示不换。`
                    : '选填。没有图时页面上用名字的第一个字占位。'}
                </span>
              </label>

              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {'简介'}
                <input
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>

              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {'简介 (EN)'}
                <input
                  value={summaryEn}
                  onChange={(e) => setSummaryEn(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>

              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {'介绍'}
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className={`${FIELD_CLASS} resize-y`}
                />
              </label>

              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {'介绍 (EN)'}
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
                  {busy ? '保存中…' : '保存'}
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
