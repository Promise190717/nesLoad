'use client';

import { useEffect, useRef, useState } from 'react';
import type { EmulatorController, LoadedRom } from '@/lib/emulator';
import { deleteSave, listSaves, readSave, saveSlot, MAX_SAVES, type SaveSlot } from '@/lib/saves';
import { localePath } from '@/lib/i18n';
import { useI18n } from './I18nProvider';

type CloudSlot = { id: string; createdAt: number };

/**
 * 拉云端存档列表，顺带探一次登录态：`assertUser` 挡下时回 401 ——
 * 借这个状态位区分「登录了但没有云端存档」和「压根没登录」，后者要画登录引导。
 */
async function cloudSlots(romName: string): Promise<{ slots: CloudSlot[]; authed: boolean }> {
  try {
    const response = await fetch(`/api/user/saves?romName=${encodeURIComponent(romName)}`);
    if (response.status === 401) return { slots: [], authed: false };
    return {
      slots: response.ok ? ((await response.json()) as { items?: CloudSlot[] }).items ?? [] : [],
      authed: true,
    };
  } catch { return { slots: [], authed: true }; }
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

export default function PlaySaveControls({ controller, rom, gameId, disabled, onBusy, onOpen }: {
  controller: EmulatorController;
  rom: LoadedRom | null;
  gameId?: string;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onOpen: (open: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [local, setLocal] = useState<SaveSlot[]>([]);
  const [cloud, setCloud] = useState<CloudSlot[]>([]);
  const [cloudAuthed, setCloudAuthed] = useState(true);
  /*
   * 行内提示的几种状态（2026-10-15 用户要求三段式：本地保存 → 上传云端 → 保存成功）：
   *   localSaving 快照落本机中 —— 进行中
   *   uploading   快照往云端传 —— 进行中
   *   saved       本机 + 云端都完成 —— 终态
   *   cloudFailed 本机存好了但云端没传上 —— 终态（warn 色，不算失败）
   *   saveFailed  本机都没存上 —— 终态（danger）
   *   loadFailed  只在弹窗里说
   * 文案刻意都压在四五个字：标签那格是半栏宽，长了就被 truncate 成「…」。
   */
  const [message, setMessage] = useState<
    'localSaving' | 'uploading' | 'saved' | 'cloudFailed' | 'saveFailed' | 'loadFailed' | null
  >(null);
  /** 正在删的云端槽 id：那行的删除钮转「…」并禁用，其它行照常 */
  const [deletingCloudId, setDeletingCloudId] = useState<string | null>(null);
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
   * 存档结果提示（2026-10-15 改）：原来是一行 <p> 塞在两颗钮下面 —— 一出现就把
   * 面板撑高一截（抖动），而且永不消失。现在改成**替换行内标签**（见下面
   * 「panel.save」那格），不新增高度，2.8 秒后自己落回。弹窗里那条报错照旧。
   */
  useEffect(() => {
    // 两个进行中状态都不计时 —— 传完自然被 saved / cloudFailed 顶掉
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
    try {
      setMessage('localSaving');
      const blob = await controller.saveState();
      if (!blob || !rom) throw new Error('No snapshot');
      if (!(await saveSlot(rom.name, blob))) await controller.downloadState(blob);
      /*
       * 三段式（2026-10-15 用户指定）：本地保存 → 上传云端 → 保存成功。
       * 云端传失败落「云端失败」（warn —— 本机那份是稳的，不算失败）。
       * 没登录（无 gameId）跳过上传段，直接 saved。
       */
      if (gameId) {
        setMessage('uploading');
        const form = new FormData();
        form.append('gameId', gameId); form.append('romName', rom.name);
        form.append('title', rom.name); form.append('state', blob, `${rom.name}.state`);
        try { await fetch('/api/user/saves', { method: 'POST', body: form }); setMessage('saved'); }
        catch { setMessage('cloudFailed'); }
      } else {
        setMessage('saved');
      }
    } catch { setMessage('saveFailed'); }
  });
  const showList = () => run(async () => {
    setOpen(true); onOpen(true);
    try {
      const [localSlots, remote] = await Promise.all([listSaves(rom!.name), cloudSlots(rom!.name)]);
      setLocal(localSlots); setCloud(remote.slots); setCloudAuthed(remote.authed);
    } catch { setLocal([]); setCloud([]); setMessage('loadFailed'); }
  });
  const load = (id: string, remote: boolean) => run(async () => {
    try {
      let blob: Blob | null;
      if (remote) {
        const response = await fetch(`/api/user/saves/${encodeURIComponent(id)}`);
        if (!response.ok) throw new Error('Cloud save unavailable');
        blob = await response.blob();
      } else blob = await readSave(id);
      if (!blob || !(await controller.loadStateFrom(blob))) throw new Error('Invalid snapshot');
      close();
    } catch { setMessage('loadFailed'); }
  });
  /*
   * 删本机存档（2026-10-15 加）。不走 run()：不碰模拟器，也不该让两颗存/读钮跟着忙。
   */
  const removeLocal = async (id: string) => {
    if (await deleteSave(id)) setLocal((slots) => slots.filter((slot) => slot.id !== id));
  };
  /*
   * 删云端存档（2026-10-15 加）：`/api/user/saves/<id>` DELETE 本来就有（行 + R2 对象
   * 一起删），这里只是接上。同样不碰 run()。带 per-row loading（deletingCloudId），
   * 那一行删除钮变「…」并禁用；失败列表留着，可以再点。
   */
  const removeCloud = async (id: string) => {
    if (deletingCloudId) return;
    setDeletingCloudId(id);
    try {
      const response = await fetch(`/api/user/saves/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (response.ok) setCloud((slots) => slots.filter((slot) => slot.id !== id));
    } catch { /* 列表留着，用户可以再点 */ }
    finally { setDeletingCloudId(null); }
  };
  const buttonClass = 'border border-ink-600 bg-ink-800 px-3 py-1 text-[12px] text-ink-200 hover:text-accent disabled:opacity-40';
  const iconButtonClass = 'play-icon-button pixel-edge pxw-2 pxc-500 flex shrink-0 items-center justify-center bg-ink-800 text-ink-300 transition-colors hover:bg-ink-700 hover:text-accent disabled:cursor-not-allowed disabled:opacity-35';
  /* 关着的时候才在行内露结果；loadFailed 只在弹窗里说（它本来就开着） */
  const inlineNotice = message && !open && message !== 'loadFailed' ? message : null;
  /* 每种提示一档颜色：成功绿、两个进行中 info / 中性、云端失败 warn、本机失败 danger */
  const noticeTone =
    inlineNotice === 'saved' ? 'text-ok'
      : inlineNotice === 'uploading' ? 'text-info'
        : inlineNotice === 'localSaving' ? 'text-ink-300'
          : inlineNotice === 'cloudFailed' ? 'text-warn'
            : inlineNotice ? 'text-danger' : 'text-ink-300';
  return (
    <li className="col-span-2 flex flex-col gap-2 py-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center justify-between gap-2">
          <span
            role={inlineNotice ? 'status' : undefined}
            className={`truncate text-[12px] ${noticeTone}`}
          >
            {inlineNotice ? t(`play.${inlineNotice}`) : t('panel.save')}
          </span>
          <button type="button" title={t('panel.save')} aria-label={t('panel.save')} className={iconButtonClass} disabled={disabled || pending || !rom} onClick={() => void save()}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true"><path d="M2 1h10l3 3v11H1V1h1Zm1 2v4h8V3H3Zm1 7v3h8v-3H4Z" /><rect x="8" y="3" width="2" height="3" /></svg>
          </button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[12px] text-ink-300">{t('panel.load')}</span>
          <button type="button" title={t('panel.load')} aria-label={t('panel.load')} className={iconButtonClass} disabled={disabled || pending || !rom} onClick={() => void showList()}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true"><path d="M1 3h6v2h8v9H1V3Zm2 4v5h10V7H3Z" /></svg>
          </button>
        </div>
      </div>
      {open && (
        <dialog ref={dialogRef} aria-labelledby="play-saves-title" onCancel={(event) => { event.preventDefault(); close(); }} className="play-quality-dialog">
          <div className="flex items-center justify-between gap-3">
            <h2 id="play-saves-title" className="text-[14px] font-semibold">{t('saves.title')}</h2>
            <button type="button" onClick={close} className={buttonClass}>{t('saves.close')}</button>
          </div>
          {message && <p role="alert" className="mt-3 text-[12px] text-danger">{t(`play.${message}`)}</p>}
          {pending ? <p role="status" className="py-4 text-[12px]">{t('saves.loading')}</p> : (
            <div className="mt-3 space-y-3">
              {!local.length && !cloud.length && cloudAuthed && <p className="text-[12px] text-ink-300">{t('saves.empty')}</p>}
              {([{ slots: local, remote: false }, { slots: cloud, remote: true }]).map(({ slots, remote }) => (slots.length > 0 || (remote && !cloudAuthed)) && (
                <section key={String(remote)}>
                  <h3 className="mb-1 text-[12px] text-ink-300">{t(remote ? 'saves.groupCloud' : 'saves.groupLocal')}{!remote && ` · ${local.length}/${MAX_SAVES}`}</h3>
                  {slots.map((slot) => (
                    <div key={slot.id} className="flex items-center gap-2 border-b border-ink-800 py-1.5">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left text-[12px] transition-colors hover:text-accent"
                        onClick={() => void load(slot.id, remote)}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate">{new Date(slot.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}</span>
                          {remote && <CloudIcon />}
                        </span>
                        <span className="shrink-0">{t('saves.load')}</span>
                      </button>
                      <button
                        type="button"
                        title={t('saves.delete')}
                        aria-label={t('saves.delete')}
                        disabled={remote && deletingCloudId === slot.id}
                        className="shrink-0 px-2 py-0.5 text-[12px] text-ink-300 transition-colors hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => void (remote ? removeCloud(slot.id) : removeLocal(slot.id))}
                      >
                        {remote && deletingCloudId === slot.id ? (
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
                  ))}
                  {remote && !cloudAuthed && (
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
                </section>
              ))}
            </div>
          )}
        </dialog>
      )}
    </li>
  );
}
