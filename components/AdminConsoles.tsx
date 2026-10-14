'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminLoading from './AdminLoading';
import { CONSOLE_LABEL } from './CartridgeSprite';
import { useI18n } from './I18nProvider';

/**
 * 后台 · 机种库 tab（2026-10-14 加）。
 *
 * 和 AdminDevelopers（同一套版式的「兄弟」组件）的**本质区别**：机种清单是代码里
 * 定死的四个（`CONSOLE_TYPES`），所以这里**没有「添加」、没有搜索、没有翻页** ——
 * 列表恒定四行，每行只有「编辑」与「重置资料」两个动作：
 *   · 编辑 → PATCH `/api/admin/consoles/<type>`（资料行不存在时服务端顺带创建，upsert）；
 *   · 重置 → DELETE（删掉资料行，前台退回内置默认信息；**游戏不受影响**，
 *     所以没有开发商那套「名下有游戏不许删」的拦截）。
 */

/** `/api/admin/consoles` 返回的条目（见那条接口的注释）。 */
interface AdminConsole {
  type: string;
  name: string;
  nameEn: string | null;
  imageUrl: string | null;
  summary: string | null;
  summaryEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  releaseYear: number | null;
  gameCount: number;
  /** consoles 表里有没有这一行。false = 前台在用内置默认信息。 */
  filled: boolean;
}

type Notice = { tone: 'ok' | 'error'; text: string };

const FIELD_CLASS =
  'pixel-edge pxw-2 pxc-500 w-full bg-ink-900 px-2 py-2 text-[12px] text-ink-100 placeholder:text-ink-600 focus:outline-none';

const LABEL_CLASS = 'flex flex-col gap-1 text-[12px] text-ink-400';

/** 和 AdminGames / AdminDevelopers 里那份同一套：把服务端给的 detail 挖出来。 */
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: string };
    return data.detail ?? fallback;
  } catch {
    return fallback;
  }
}

export default function AdminConsoles() {
  const { t, href: localeHref } = useI18n();
  const router = useRouter();

  const [list, setList] = useState<AdminConsole[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [listPending, setListPending] = useState(true);
  const [pageNotice, setPageNotice] = useState<Notice | null>(null);
  const [listVersion, setListVersion] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<string | null>(null);
  const [modalNotice, setModalNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  // 表单字段：机种只有一份资料，没有「中英双份 + 年份 + 图」之外的任何东西
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [releaseYear, setReleaseYear] = useState('');
  const [summary, setSummary] = useState('');
  const [summaryEn, setSummaryEn] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imageLabel, setImageLabel] = useState('');
  const imageRef = useRef<HTMLInputElement>(null);

  const reloadList = useCallback(() => setListVersion((n) => n + 1), []);

  // 四行固定数据，一次拉全（接口本身就只返回四个机种）。setState 走 .then/.catch
  // —— 直接在 effect 体里同步 setState 会被 react-hooks/set-state-in-effect 拦下。
  useEffect(() => {
    let alive = true;

    void Promise.resolve().then(() => {
      if (alive) setListPending(true);
    });

    fetch('/api/admin/consoles')
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { consoles?: AdminConsole[] };
        if (alive) setList(data.consoles ?? []);
      })
      .catch(() => {
        if (alive) setList([]);
      })
      .finally(() => {
        if (alive) {
          setListLoaded(true);
          setListPending(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [listVersion]);

  // 弹窗打开时支持 Esc 关闭
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModalOpen(false);
        setEditingType(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  const resetForm = () => {
    setName('');
    setNameEn('');
    setReleaseYear('');
    setSummary('');
    setSummaryEn('');
    setDescription('');
    setDescriptionEn('');
    setImage(null);
    setImageLabel('');
    if (imageRef.current) imageRef.current.value = '';
  };

  const openEdit = (console: AdminConsole) => {
    setEditingType(console.type);
    setName(console.name);
    setNameEn(console.nameEn ?? '');
    setReleaseYear(console.releaseYear === null ? '' : String(console.releaseYear));
    setSummary(console.summary ?? '');
    setSummaryEn(console.summaryEn ?? '');
    setDescription(console.description ?? '');
    setDescriptionEn(console.descriptionEn ?? '');
    setImage(null);
    // 编辑时输入框默认是空的（浏览器不许我们往里塞值）；把现有文件名写在旁边，
    // 用户才知道「不选就是保持原图」而不是「图没了」（和 AdminDevelopers 同一条注释）
    setImageLabel(console.imageUrl ? console.imageUrl.split('/').pop() ?? '' : '');
    setModalNotice(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (busy) return;
    setModalOpen(false);
    setEditingType(null);
    setModalNotice(null);
  };

  const onBackdrop = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) closeModal();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !editingType) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setModalNotice({ tone: 'error', text: t('admin.consoles.nameRequired') });
      return;
    }

    const releasedText = releaseYear.trim();
    const parsedReleased = releasedText ? Number(releasedText) : null;
    if (parsedReleased !== null && !Number.isInteger(parsedReleased)) {
      setModalNotice({ tone: 'error', text: t('admin.consoles.badReleased') });
      return;
    }

    setBusy(true);
    setModalNotice(null);

    const form = new FormData();
    form.set('name', trimmedName);
    form.set('name_en', nameEn.trim());
    form.set('release_year', releasedText);
    form.set('summary', summary.trim());
    form.set('summary_en', summaryEn.trim());
    form.set('description', description.trim());
    form.set('description_en', descriptionEn.trim());
    if (image) form.set('image', image);

    try {
      const res = await fetch(`/api/admin/consoles/${editingType}`, {
        method: 'PATCH',
        body: form,
      });
      if (!res.ok) throw new Error(await readError(res, t('admin.consoles.failed')));

      setPageNotice({ tone: 'ok', text: t('admin.consoles.saved') });
      reloadList();
      resetForm();
      setModalOpen(false);
      setEditingType(null);
      router.refresh();
    } catch (error) {
      setModalNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : t('admin.consoles.failed'),
      });
    } finally {
      setBusy(false);
    }
  };

  const resetConsole = async (console: AdminConsole) => {
    // 重置 = 删资料行（前台退回默认名字），游戏不受影响 —— 接口的 404 说明「本来就没资料」
    if (!window.confirm(t('admin.consoles.deleteConfirm', { name: console.name }))) return;
    try {
      const res = await fetch(`/api/admin/consoles/${console.type}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res, t('admin.consoles.failed')));
      reloadList();
      setPageNotice(null);
      router.refresh();
    } catch (error) {
      setPageNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : t('admin.consoles.failed'),
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="bg-ink-800 pixel-edge pxw-3 pxc-600 p-4">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="shrink-0 text-[12px] text-ink-200">{t('admin.consoles.title')}</h2>
          {/* 机种清单是代码定死的四个：这里没有「添加」钮，也没有搜索框 */}
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

        {listPending && <AdminLoading label={t('feedback.loading')} />}

        {listLoaded && list.length === 0 && (
          <p className="text-[12px] text-ink-500">{t('admin.consoles.failed')}</p>
        )}

        <ul className="flex flex-col divide-y-2 divide-ink-900">
          {list.map((console) => (
            <li key={console.type} className="flex items-center gap-3 py-2">
              {/* 没机图的不画破图，用卡带丝印词占位（和前台同一套兜底） */}
              {console.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={console.imageUrl}
                  alt=""
                  className="pixel-edge pxw-2 pxc-700 h-[36px] w-[36px] shrink-0 bg-ink-900 object-contain"
                />
              ) : (
                <span className="pixel-edge pxw-2 pxc-700 flex h-[36px] w-[36px] shrink-0 items-center justify-center bg-ink-900 font-pixel text-[9px] text-ink-500">
                  {CONSOLE_LABEL[console.type as keyof typeof CONSOLE_LABEL] ?? '?'}
                </span>
              )}

              {/* 名字 + 简介 / 未填提示两行，和开发商列表那条同一个版式 */}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[12px] text-ink-100">
                  {console.name}
                  <span className="ml-2 font-pixel text-[10px] text-ink-600">{console.type}</span>
                </span>
                {console.summary ? (
                  <span className="truncate text-[12px] text-ink-500">{console.summary}</span>
                ) : (
                  !console.filled && (
                    <span className="truncate text-[12px] text-ink-600">
                      {t('admin.consoles.unfilled')}
                    </span>
                  )
                )}
              </span>

              <span className="shrink-0 text-[12px] text-ink-500">
                {t('admin.consoles.gameCount', { count: console.gameCount })}
              </span>

              <Link
                href={localeHref(`/consoles/${console.type}`)}
                target="_blank"
                rel="noreferrer"
                className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-2.5 py-1 text-[12px] text-ink-200 transition-colors hover:text-accent"
              >
                {t('admin.consoles.view')}
              </Link>
              <button
                type="button"
                onClick={() => openEdit(console)}
                className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-2.5 py-1 text-[12px] text-ink-200 transition-colors hover:text-accent"
              >
                {t('admin.edit')}
              </button>
              {/* 只重置「已经填过资料」的行 —— 没资料时重置是个空操作，按钮就不画 */}
              {console.filled && (
                <button
                  type="button"
                  onClick={() => void resetConsole(console)}
                  className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-2.5 py-1 text-[12px] text-ink-200 transition-colors hover:text-danger"
                >
                  {t('admin.consoles.reset')}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {modalOpen && editingType && (
        <div
          onMouseDown={onBackdrop}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink-950/80 p-6"
        >
          <div className="bg-ink-800 pixel-edge pxw-3 pxc-600 w-full max-w-[620px] p-4">
            <h2 className="mb-3 text-[12px] text-ink-200">
              {t('admin.consoles.editTitle')}
              <span className="ml-2 font-pixel text-[10px] text-ink-500">{editingType}</span>
            </h2>

            <form onSubmit={(e) => void submit(e)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {t('admin.consoles.field.name')}
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>

              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {t('admin.consoles.field.nameEn')}
                <input
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>

              <label className={LABEL_CLASS}>
                {t('admin.consoles.field.released')}
                <input
                  value={releaseYear}
                  onChange={(e) => setReleaseYear(e.target.value)}
                  inputMode="numeric"
                  className={FIELD_CLASS}
                />
              </label>

              {/*
                机图。**编辑时不强制重选**：留空 = 保持原图（接口那边也是这么处理的），
                旁边那行小字把「当前这张叫什么」写出来。
              */}
              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {t('admin.consoles.field.image')}
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
                    ? t('admin.consoles.imageCurrent', { name: imageLabel })
                    : t('admin.consoles.imageHint')}
                </span>
              </label>

              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {t('admin.consoles.field.summary')}
                <input
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>

              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {t('admin.consoles.field.summaryEn')}
                <input
                  value={summaryEn}
                  onChange={(e) => setSummaryEn(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>

              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {t('admin.consoles.field.description')}
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className={`${FIELD_CLASS} resize-y`}
                />
              </label>

              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {t('admin.consoles.field.descriptionEn')}
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
