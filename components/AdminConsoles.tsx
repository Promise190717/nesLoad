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

/**
 * 后台 · 机种库 tab（2026-10-14 加）。
 *
 * 和 AdminDevelopers（同一套版式的「兄弟」组件）的**本质区别**：机种清单是代码里
 * 定死的（`CONSOLE_TYPES`），所以这里**没有「添加」、没有搜索、没有翻页** ——
 * 列表恒 N 行，每行只有「编辑」与「重置资料」两个动作：
 *   · 编辑 → PATCH `/api/admin/consoles/<type>`（资料行不存在时服务端顺带创建，upsert）；
 *   · 重置 → DELETE（删掉资料行，前台退回内置默认信息；**游戏不受影响**，
 *     所以没有开发商那套「名下有游戏不许删」的拦截）。
 */

/** `/api/admin/consoles` 返回的条目（见那条接口的注释）。 */
interface AdminConsole {
  type: string;
  name: string;
  nameEn: string | null;
  nameJa: string | null;
  nameKo: string | null;
  imageUrl: string | null;
  summary: string | null;
  summaryEn: string | null;
  summaryJa: string | null;
  summaryKo: string | null;
  description: string | null;
  descriptionEn: string | null;
  descriptionJa: string | null;
  descriptionKo: string | null;
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

  // 表单字段
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameJa, setNameJa] = useState('');
  const [nameKo, setNameKo] = useState('');
  const [releaseYear, setReleaseYear] = useState('');
  const [summary, setSummary] = useState('');
  const [summaryEn, setSummaryEn] = useState('');
  const [summaryJa, setSummaryJa] = useState('');
  const [summaryKo, setSummaryKo] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [descriptionJa, setDescriptionJa] = useState('');
  const [descriptionKo, setDescriptionKo] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imageLabel, setImageLabel] = useState('');
  const imageRef = useRef<HTMLInputElement>(null);

  const reloadList = useCallback(() => setListVersion((n) => n + 1), []);

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
    setNameJa('');
    setNameKo('');
    setReleaseYear('');
    setSummary('');
    setSummaryEn('');
    setSummaryJa('');
    setSummaryKo('');
    setDescription('');
    setDescriptionEn('');
    setDescriptionJa('');
    setDescriptionKo('');
    setImage(null);
    setImageLabel('');
    if (imageRef.current) imageRef.current.value = '';
  };

  const openEdit = (console: AdminConsole) => {
    setEditingType(console.type);
    setName(console.name);
    setNameEn(console.nameEn ?? '');
    setNameJa(console.nameJa ?? '');
    setNameKo(console.nameKo ?? '');
    setReleaseYear(console.releaseYear === null ? '' : String(console.releaseYear));
    setSummary(console.summary ?? '');
    setSummaryEn(console.summaryEn ?? '');
    setSummaryJa(console.summaryJa ?? '');
    setSummaryKo(console.summaryKo ?? '');
    setDescription(console.description ?? '');
    setDescriptionEn(console.descriptionEn ?? '');
    setDescriptionJa(console.descriptionJa ?? '');
    setDescriptionKo(console.descriptionKo ?? '');
    setImage(null);
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
      setModalNotice({ tone: 'error', text: '请填写机种名字。' });
      return;
    }

    const releasedText = releaseYear.trim();
    const parsedReleased = releasedText ? Number(releasedText) : null;
    if (parsedReleased !== null && !Number.isInteger(parsedReleased)) {
      setModalNotice({ tone: 'error', text: '发售年份必须是整数。' });
      return;
    }

    setBusy(true);
    setModalNotice(null);

    const form = new FormData();
    form.set('name', trimmedName);
    form.set('name_en', nameEn.trim());
    form.set('name_ja', nameJa.trim());
    form.set('name_ko', nameKo.trim());
    form.set('release_year', releasedText);
    form.set('summary', summary.trim());
    form.set('summary_en', summaryEn.trim());
    form.set('summary_ja', summaryJa.trim());
    form.set('summary_ko', summaryKo.trim());
    form.set('description', description.trim());
    form.set('description_en', descriptionEn.trim());
    form.set('description_ja', descriptionJa.trim());
    form.set('description_ko', descriptionKo.trim());
    if (image) form.set('image', image);

    try {
      const res = await fetch(`/api/admin/consoles/${editingType}`, {
        method: 'PATCH',
        body: form,
      });
      if (!res.ok) throw new Error(await readError(res, '请求失败。'));

      setPageNotice({ tone: 'ok', text: '已保存。' });
      reloadList();
      resetForm();
      setModalOpen(false);
      setEditingType(null);
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

  const resetConsole = async (console: AdminConsole) => {
    if (!window.confirm(`重置「${console.name}」？它的资料（名字 / 图片 / 介绍）会被清掉，前台退回内置默认信息。游戏本身不受影响。`)) return;
    try {
      const res = await fetch(`/api/admin/consoles/${console.type}`, { method: 'DELETE' });
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
          <h2 className="shrink-0 text-[12px] text-ink-200">{'机种库'}</h2>
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

        {listPending && <AdminLoading label="载入中…" />}

        {listLoaded && list.length === 0 && (
          <p className="text-[12px] text-ink-500">{'请求失败。'}</p>
        )}

        <ul className="flex flex-col divide-y-2 divide-ink-900">
          {list.map((console) => (
            <li key={console.type} className="flex items-center gap-3 py-2">
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
                      {'还没填资料 —— 前台先用内置默认信息。'}
                    </span>
                  )
                )}
              </span>

              <span className="shrink-0 text-[12px] text-ink-500">
                {`${console.gameCount} 款游戏`}
              </span>

              <Link
                href={`/consoles/${console.type}`}
                target="_blank"
                rel="noreferrer"
                className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-2.5 py-1 text-[12px] text-ink-200 transition-colors hover:text-accent"
              >
                {'查看'}
              </Link>
              <button
                type="button"
                onClick={() => openEdit(console)}
                className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-2.5 py-1 text-[12px] text-ink-200 transition-colors hover:text-accent"
              >
                {'编辑'}
              </button>
              {console.filled && (
                <button
                  type="button"
                  onClick={() => void resetConsole(console)}
                  className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-2.5 py-1 text-[12px] text-ink-200 transition-colors hover:text-danger"
                >
                  {'重置资料'}
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
          <div className="bg-ink-800 pixel-edge pxw-3 pxc-600 w-full max-w-[680px] p-4">
            <h2 className="mb-3 text-[12px] text-ink-200">
              {'编辑机种'}
              <span className="ml-2 font-pixel text-[10px] text-ink-500">{editingType}</span>
            </h2>

            <form onSubmit={(e) => void submit(e)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {'名字'}
                <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD_CLASS} />
              </label>

              <label className={LABEL_CLASS}>
                {'名字 (EN)'}
                <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={FIELD_CLASS} />
              </label>
              <label className={LABEL_CLASS}>
                {'名字 (JA)'}
                <input value={nameJa} onChange={(e) => setNameJa(e.target.value)} className={FIELD_CLASS} />
              </label>
              <label className={LABEL_CLASS}>
                {'名字 (KO)'}
                <input value={nameKo} onChange={(e) => setNameKo(e.target.value)} className={FIELD_CLASS} />
              </label>

              <label className={LABEL_CLASS}>
                {'发售年份'}
                <input
                  value={releaseYear}
                  onChange={(e) => setReleaseYear(e.target.value)}
                  inputMode="numeric"
                  className={FIELD_CLASS}
                />
              </label>

              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {'机图 / 图片'}
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
                    : '选填。没有图时前台用机种短标签（中文站 FC / SFC、英文站 NES / SNES，其余如 GBA / ARC）占位。'}
                </span>
              </label>

              <label className={`${LABEL_CLASS} sm:col-span-2`}>
                {'简介'}
                <input value={summary} onChange={(e) => setSummary(e.target.value)} className={FIELD_CLASS} />
              </label>

              <label className={LABEL_CLASS}>
                {'简介 (EN)'}
                <input value={summaryEn} onChange={(e) => setSummaryEn(e.target.value)} className={FIELD_CLASS} />
              </label>
              <label className={LABEL_CLASS}>
                {'简介 (JA)'}
                <input value={summaryJa} onChange={(e) => setSummaryJa(e.target.value)} className={FIELD_CLASS} />
              </label>
              <label className={LABEL_CLASS}>
                {'简介 (KO)'}
                <input value={summaryKo} onChange={(e) => setSummaryKo(e.target.value)} className={FIELD_CLASS} />
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

              <label className={LABEL_CLASS}>
                {'介绍 (EN)'}
                <textarea
                  value={descriptionEn}
                  onChange={(e) => setDescriptionEn(e.target.value)}
                  rows={4}
                  className={`${FIELD_CLASS} resize-y`}
                />
              </label>
              <label className={LABEL_CLASS}>
                {'介绍 (JA)'}
                <textarea
                  value={descriptionJa}
                  onChange={(e) => setDescriptionJa(e.target.value)}
                  rows={4}
                  className={`${FIELD_CLASS} resize-y`}
                />
              </label>
              <label className={LABEL_CLASS}>
                {'介绍 (KO)'}
                <textarea
                  value={descriptionKo}
                  onChange={(e) => setDescriptionKo(e.target.value)}
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
