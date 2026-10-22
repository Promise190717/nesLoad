'use client';

import { useEffect, useRef, useState } from 'react';
import type { EmulatorController, LoadedRom } from '@/lib/emulator';
import { deleteSave, readSave, writeSave, type SaveInfo } from '@/lib/saves';
import { MAX_SAVE_BYTES } from '@/lib/save-limit';
import { packState } from '@/lib/state-file';
import { readBodyWithProgress } from '@/lib/http';
import { dateLocale, localePath, type Locale } from '@/lib/i18n';
import { useI18n } from './I18nProvider';

/** 每个游戏只保留最新一份即时存档。 */
type CloudSave = { id: string; createdAt: number };

/**
 * 拉云端那一份存档，顺带探一次登录态：`assertUser` 挡下时回 401 ——
 * 借这个状态位区分「登录了但没有云端存档」和「压根没登录」，后者要画登录引导。
 */
async function fetchCloudSave(
  romName: string
): Promise<{ save: CloudSave | null; authed: boolean }> {
  try {
    const response = await fetch(`/api/user/saves?romName=${encodeURIComponent(romName)}`);
    if (response.status === 401) return { save: null, authed: false };
    const items = response.ok
      ? ((await response.json()) as { items?: CloudSave[] }).items ?? []
      : [];
    return { save: items[0] ?? null, authed: true };
  } catch {
    return { save: null, authed: true };
  }
}

/** 云端条目时间后面那朵小云（2026-10-15 加）：一眼区分这行是不是跟着账号走的。 */
function CloudIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
      className="shrink-0 text-info"
    >
      <rect x="3" y="4" width="3" height="1" />
      <rect x="2" y="5" width="5" height="1" />
      <rect x="1" y="6" width="9" height="2" />
    </svg>
  );
}

/**
 * `/play` 的存档控件。
 *
 * 保存当前模拟器状态，不依赖游戏内的存盘功能。
 * 本机和云端各保留一份，重复保存覆盖旧档。
 */
export default function PlaySaveControls({ controller, rom, gameId, disabled, onBusy, onOpen, onApplySave }: {
  controller: EmulatorController;
  rom: LoadedRom | null;
  gameId?: string;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onOpen: (open: boolean) => void;
  /** 恢复即时存档；父组件同时兼容旧的电池存档。 */
  onApplySave: (bytes: Uint8Array) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [download, setDownload] = useState<{ ratio: number | null; restoring: boolean } | null>(null);
  const [local, setLocal] = useState<SaveInfo | null>(null);
  const [cloud, setCloud] = useState<CloudSave | null>(null);
  const [cloudAuthed, setCloudAuthed] = useState(true);
  /*
   * 行内提示的几种状态（2026-10-15 用户要求三段式：本地保存 → 上传云端 → 保存成功）：
   *   localSaving 存档落本机中 —— 进行中
   *   uploading   往云端传 —— 进行中
   *   saved       本机 + 云端都完成 —— 终态
   *   cloudFailed 本机存好了但云端没传上 —— 终态（warn 色，不算失败）
   *   saveNoLogin 本机存好了但没登录 / 会话过期 —— 终态（warn 色，登录后就正常）
   *   tooLarge    存档超过云端上限，压根没发 —— 终态（warn 色，本机那份是好的）
   *   saveFailed  本机都没存上 —— 终态（danger）
   *   loadFailed  只在弹窗里说
   * 文案刻意都压在四五个字：标签那格是半栏宽，长了就被 truncate 成「…」。
   */
  const [message, setMessage] = useState<
    | 'localSaving'
    | 'uploading'
    | 'saved'
    | 'cloudFailed'
    | 'saveNoLogin'
    | 'tooLarge'
    | 'saveFailed'
    | 'loadFailed'
    | null
  >(null);
  /** 正在删的云端那份：删除钮转「…」并禁用 */
  const [deletingCloud, setDeletingCloud] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lockRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    const block = (event: KeyboardEvent) => event.stopPropagation();
    window.addEventListener('keydown', block, true);
    return () => { dialog?.close(); window.removeEventListener('keydown', block, true); };
  }, [open]);

  /*
   * 存档结果提示：**替换行内标签**（见下面「panel.save」那格），不新增高度，
   * 2.8 秒后自己落回。两个进行中状态不计时 —— 传完自然被终态顶掉。
   */
  useEffect(() => {
    if (!message || open || message === 'localSaving' || message === 'uploading') return;
    const timer = setTimeout(() => setMessage(null), 2800);
    return () => clearTimeout(timer);
  }, [message, open]);

  const close = () => { setOpen(false); onOpen(false); };
  const run = async (operation: () => Promise<void>) => {
    if (lockRef.current || disabled || !rom || !controller.isRunning) return;
    lockRef.current = true;
    setPending(true); onBusy(true); setMessage(null);
    try { await operation(); }
    finally { lockRef.current = false; setPending(false); onBusy(false); }
  };

  const save = () => run(async () => {
    if (!rom) return;
    try {
      setMessage('localSaving');
      const blob = await packState(await controller.saveState());

      /*
       * 先落本机；IndexedDB 用不了（隐私模式等）时退回下载 `.state` 文件，
       * 否则这一下存档就白按了。本机那份不设体积限制。
       */
      if (!(await writeSave(rom.name, blob))) await controller.downloadState(blob);
      setLocal(await readSave(rom.name));

      /*
       * 云端那段（登录了才传）。**发送前先量体积**（2026-10-15 加）：Cloudflare 的
       * 请求体硬限是 100MB，超了在边缘就回 413、请求根本进不到函数 ——
       * 与其白传一趟再报个含糊的失败，不如当场告诉用户「这份只存在本机」。
       * 限制按压缩后的大小计算，本机仍会保留完整存档。
       */
      if (gameId) {
        if (blob.size > MAX_SAVE_BYTES) { setMessage('tooLarge'); return; }
        setMessage('uploading');
        const form = new FormData();
        form.append('gameId', gameId); form.append('romName', rom.name);
        form.append('title', rom.name); form.append('state', blob, `${rom.name}.state`);
        try {
          const response = await fetch('/api/user/saves', { method: 'POST', body: form });
          /*
           * ⚠️ **必须看 `res.ok`**（2026-10-15 修）：以前只 try/catch fetch 的 reject，
           * 而 4xx / 5xx **不是** reject ⇒ 413 也照样显示「保存成功」，云端其实空空如也。
           *
           * 2026-10-19 起按状态码分岔：401（没登录 / 会话过期）本来会被说成
           * 「云端同步失败」，可登录之后它自己就好了 —— 那是两件事，别糊在一起。
           * 其余失败把状态码和响应体前 200 字打到控制台，别再靠猜。
           */
          if (!response.ok) {
            const detail = await response.text().catch(() => '');
            console.warn('[nesload] 云端存档上传失败', response.status, detail.slice(0, 200));
            if (response.status === 401) {
              setCloudAuthed(false);
              setMessage('saveNoLogin');
              return;
            }
            setMessage('cloudFailed');
          } else {
            setMessage('saved');
            setCloud((await fetchCloudSave(rom.name)).save);
          }
        } catch { setMessage('cloudFailed'); }
      } else {
        setMessage('saved');
      }
    } catch { setMessage('saveFailed'); }
  });

  /** 打开存档列表。**先把面板弹出来、再取数** —— 点了没存档时按钮看着像坏的。 */
  const showList = () => run(async () => {
    setOpen(true); onOpen(true);
    try {
      const [localSave, remote] = await Promise.all([
        readSave(rom!.name),
        fetchCloudSave(rom!.name),
      ]);
      setLocal(localSave); setCloud(remote.save); setCloudAuthed(remote.authed);
    } catch { setLocal(null); setCloud(null); setMessage('loadFailed'); }
  });

  const load = (remote: boolean) => run(async () => {
    try {
      let data: Blob | null;
      if (remote) {
        const id = cloud?.id;
        if (!id) return;
        setDownload({ ratio: 0, restoring: false });
        const response = await fetch(`/api/user/saves/${encodeURIComponent(id)}`);
        if (!response.ok) throw new Error('Cloud save unavailable');
        data = await readBodyWithProgress(response, (ratio) => {
          setDownload({ ratio, restoring: false });
        });
        setDownload({ ratio: 1, restoring: true });
      } else {
        data = local?.data ?? null;
      }
      if (!data) throw new Error('No save');

      // 本机和云端经过相同的解压与恢复流程。
      await onApplySave(new Uint8Array(await data.arrayBuffer()));
      close();
    } catch { setMessage('loadFailed'); }
    finally { setDownload(null); }
  });

  /*
   * 删本机存档。不走 run()：不碰模拟器，也不该让两颗存 / 读钮跟着忙。
   */
  const removeLocal = async () => {
    if (!rom) return;
    if (await deleteSave(rom.name)) setLocal(null);
  };
  /*
   * 删云端存档：`/api/user/saves/<id>` DELETE（行 + R2 对象一起删），这里只是接上。
   * 同样不碰 run()。删除中那颗钮变「…」并禁用；失败就把列表留着，可以再点。
   */
  const removeCloud = async () => {
    const id = cloud?.id;
    if (!id || deletingCloud) return;
    setDeletingCloud(true);
    try {
      const response = await fetch(`/api/user/saves/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (response.ok) setCloud(null);
    } catch { /* 留着，用户可以再点 */ }
    finally { setDeletingCloud(false); }
  };

  const buttonClass = 'border border-ink-600 bg-ink-800 px-3 py-1 text-[12px] text-ink-200 hover:text-accent disabled:opacity-40';
  const iconButtonClass = 'play-icon-button';
  /* 关着的时候才在行内露结果；loadFailed 只在弹窗里说（它本来就开着） */
  const inlineNotice = message && !open && message !== 'loadFailed' ? message : null;
  /* 每种提示一档颜色：成功绿、两个进行中 info / 中性、三种「本机其实没事」是 warn、本机失败 danger */
  const noticeTone =
    inlineNotice === 'saved' ? 'text-ok'
      : inlineNotice === 'uploading' ? 'text-info'
        : inlineNotice === 'localSaving' ? 'play-dim'
          : inlineNotice === 'cloudFailed' || inlineNotice === 'tooLarge' || inlineNotice === 'saveNoLogin'
            ? 'text-warn'
            : inlineNotice ? 'text-danger' : 'play-dim';
  return (
    <li className="play-row play-row-wide play-save">
      <div className="play-save-grid">
        <div className="play-save-cell">
          <span
            role={inlineNotice ? 'status' : undefined}
            className={`play-save-label ${noticeTone}`}
          >
            {inlineNotice ? t(`play.${inlineNotice}`) : t('panel.save')}
          </span>
          <button type="button" title={t('panel.save')} aria-label={t('panel.save')} className={iconButtonClass} disabled={disabled || pending || !rom} onClick={() => void save()}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true"><path d="M2 1h10l3 3v11H1V1h1Zm1 2v4h8V3H3Zm1 7v3h8v-3H4Z" /><rect x="8" y="3" width="2" height="3" /></svg>
          </button>
        </div>
        <div className="play-save-cell">
          <span className="play-save-label play-dim">{t('panel.load')}</span>
          <button type="button" title={t('panel.load')} aria-label={t('panel.load')} className={iconButtonClass} disabled={disabled || pending || !rom} onClick={() => void showList()}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true"><path d="M1 3h6v2h8v9H1V3Zm2 4v5h10V7H3Z" /></svg>
          </button>
        </div>
      </div>
      {open && (
        <dialog ref={dialogRef} aria-labelledby="play-saves-title" onCancel={(event) => { event.preventDefault(); if (!lockRef.current) close(); }} className="play-quality-dialog">
          <div className="flex items-center justify-between gap-3">
            <h2 id="play-saves-title" className="text-[14px] font-semibold">{t('saves.title')}</h2>
            <button type="button" disabled={pending} onClick={close} className={buttonClass}>{t('saves.close')}</button>
          </div>
          {message && <p role="alert" className="mt-3 text-[12px] text-danger">{t(`play.${message}`)}</p>}
          {pending ? download ? (
            <div className="space-y-3 py-4">
              <div role="status" className="flex items-center justify-between gap-3 text-[12px] text-ink-200">
                <span>{t(download.restoring ? 'saves.restoring' : 'saves.downloading')}</span>
                {download.ratio !== null && <span>{Math.round(download.ratio * 100)}%</span>}
              </div>
              <div
                role="progressbar"
                aria-label={t('saves.downloading')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={download.ratio === null ? undefined : Math.round(download.ratio * 100)}
                className="relative h-2 overflow-hidden border border-ink-500 bg-ink-950"
              >
                {download.ratio === null ? (
                  <span className="load-slide absolute inset-y-0 left-0 w-1/3 bg-accent" />
                ) : (
                  <span className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-150" style={{ width: `${download.ratio * 100}%` }} />
                )}
              </div>
            </div>
          ) : <p role="status" className="py-4 text-[12px]">{t('saves.loading')}</p> : (
            <div className="mt-3 space-y-3">
              {!local && !cloud && cloudAuthed && <p className="text-[12px] text-ink-300">{t('saves.empty')}</p>}
              {local && (
                <section>
                  <h3 className="mb-1 text-[12px] text-ink-300">{t('saves.groupLocal')}</h3>
                  <SaveRow
                    createdAt={local.createdAt}
                    locale={locale}
                    onLoad={() => void load(false)}
                    onDelete={() => void removeLocal()}
                    deleting={false}
                    remote={false}
                  />
                </section>
              )}
              {cloud && (
                <section>
                  <h3 className="mb-1 text-[12px] text-ink-300">{t('saves.groupCloud')}</h3>
                  <SaveRow
                    createdAt={cloud.createdAt}
                    locale={locale}
                    onLoad={() => void load(true)}
                    onDelete={() => void removeCloud()}
                    deleting={deletingCloud}
                    remote
                  />
                </section>
              )}
              {!cloudAuthed && (
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-300">
                  <span>{t('saves.loginHint')}</span>
                  <a
                    href={`${localePath(locale, '/login')}?next=${encodeURIComponent('/play')}`}
                    className="shrink-0 text-accent underline underline-offset-2 hover:opacity-80"
                  >
                    {t('saves.login')}
                  </a>
                </p>
              )}
            </div>
          )}
        </dialog>
      )}
    </li>
  );
}

/** 列表里的一行：时间 + 加载 + 删除。本机 / 云端只差那朵小云和删除中的小圈圈。 */
function SaveRow({ createdAt, locale, onLoad, onDelete, deleting, remote }: {
  createdAt: number;
  /* 窄成 `Locale`（不是 `string`）：下面要喂 `dateLocale()`，而它只认登记表里那四个 */
  locale: Locale;
  onLoad: () => void;
  onDelete: () => void;
  deleting: boolean;
  remote: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 border-b border-ink-800 py-1.5">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left text-[12px] transition-colors hover:text-accent"
        onClick={onLoad}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {/* 语言标签走 dateLocale()（lib/i18n.ts 唯一那份映射），别在这儿写三元表达式 */}
          <span className="truncate">{new Date(createdAt).toLocaleString(dateLocale(locale))}</span>
          {remote && <CloudIcon />}
        </span>
        <span className="shrink-0">{t('saves.load')}</span>
      </button>
      <button
        type="button"
        title={t('saves.delete')}
        aria-label={t('saves.delete')}
        disabled={deleting}
        className="shrink-0 px-2 py-0.5 text-[12px] text-ink-300 transition-colors hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onDelete}
      >
        {deleting ? (
          /* 删除中：小圈圈（和联机等待那颗同一画法，尺寸缩到 10px） */
          <span
            aria-hidden="true"
            className="mx-1.5 block h-[10px] w-[10px] animate-spin rounded-full border-[1.5px] border-ink-600 border-t-ink-200 motion-reduce:animate-none"
          />
        ) : (
          t('saves.delete')
        )}
      </button>
    </div>
  );
}
