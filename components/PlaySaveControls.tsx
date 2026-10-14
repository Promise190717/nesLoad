'use client';

import { useEffect, useRef, useState } from 'react';
import type { EmulatorController, LoadedRom } from '@/lib/emulator';
import { listSaves, readSave, saveSlot, MAX_SAVES, type SaveSlot } from '@/lib/saves';
import { useI18n } from './I18nProvider';

type CloudSlot = { id: string; createdAt: number };

async function cloudSlots(romName: string): Promise<CloudSlot[]> {
  try {
    const response = await fetch(`/api/user/saves?romName=${encodeURIComponent(romName)}`);
    return response.ok ? ((await response.json()) as { items?: CloudSlot[] }).items ?? [] : [];
  } catch { return []; }
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
  const [message, setMessage] = useState<'saved' | 'saveFailed' | 'loadFailed' | null>(null);
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
      const blob = await controller.saveState();
      if (!blob || !rom) throw new Error('No snapshot');
      if (!(await saveSlot(rom.name, blob))) await controller.downloadState(blob);
      setMessage('saved');
      // Cloud is supplementary: anonymous or offline users retain the local snapshot.
      if (gameId) {
        const form = new FormData();
        form.append('gameId', gameId); form.append('romName', rom.name);
        form.append('title', rom.name); form.append('state', blob, `${rom.name}.state`);
        try { await fetch('/api/user/saves', { method: 'POST', body: form }); }
        catch { /* Local save already succeeded. */ }
      }
    } catch { setMessage('saveFailed'); }
  });
  const showList = () => run(async () => {
    setOpen(true); onOpen(true);
    try {
      const [localSlots, remoteSlots] = await Promise.all([listSaves(rom!.name), cloudSlots(rom!.name)]);
      setLocal(localSlots); setCloud(remoteSlots);
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
  const buttonClass = 'border border-ink-600 bg-ink-800 px-3 py-1 text-[12px] text-ink-200 hover:text-accent disabled:opacity-40';
  const iconButtonClass = 'play-icon-button pixel-edge pxw-2 pxc-500 flex shrink-0 items-center justify-center bg-ink-800 text-ink-300 transition-colors hover:bg-ink-700 hover:text-accent disabled:cursor-not-allowed disabled:opacity-35';
  return (
    <li className="col-span-2 flex flex-col gap-2 py-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-ink-300">{t('panel.save')}</span>
          <button type="button" title={t('panel.save')} aria-label={t('panel.save')} className={iconButtonClass} disabled={disabled || pending || !rom} onClick={() => void save()}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true"><path d="M2 1h10l3 3v11H1V1h1Zm1 2v4h8V3H3Zm1 7v3h8v-3H4Z" /><rect x="8" y="3" width="2" height="3" /></svg>
          </button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-ink-300">{t('panel.load')}</span>
          <button type="button" title={t('panel.load')} aria-label={t('panel.load')} className={iconButtonClass} disabled={disabled || pending || !rom} onClick={() => void showList()}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true"><path d="M1 3h6v2h8v9H1V3Zm2 4v5h10V7H3Z" /></svg>
          </button>
        </div>
      </div>
      {message && !open && <p role="status" className={`text-[12px] ${message === 'saved' ? 'text-ok' : 'text-danger'}`}>{t(`play.${message}`)}</p>}
      {open && (
        <dialog ref={dialogRef} aria-labelledby="play-saves-title" onCancel={(event) => { event.preventDefault(); close(); }} className="play-quality-dialog">
          <div className="flex items-center justify-between gap-3">
            <h2 id="play-saves-title" className="text-[16px] font-semibold">{t('saves.title')}</h2>
            <button type="button" onClick={close} className={buttonClass}>{t('saves.close')}</button>
          </div>
          {message && <p role="alert" className="mt-3 text-[12px] text-danger">{t(`play.${message}`)}</p>}
          {pending ? <p role="status" className="py-6 text-[12px]">{t('saves.loading')}</p> : (
            <div className="mt-4 space-y-4">
              {!local.length && !cloud.length && <p className="text-[12px] text-ink-300">{t('saves.empty')}</p>}
              {([{ slots: local, remote: false }, { slots: cloud, remote: true }]).map(({ slots, remote }) => slots.length > 0 && (
                <section key={String(remote)}>
                  <h3 className="mb-2 text-[12px] text-ink-300">{t(remote ? 'saves.groupCloud' : 'saves.groupLocal')}{!remote && ` · ${local.length}/${MAX_SAVES}`}</h3>
                  {slots.map((slot) => <button key={slot.id} type="button" className="flex w-full justify-between gap-3 border-b border-ink-700 py-3 text-left text-[12px] hover:text-accent" onClick={() => void load(slot.id, remote)}><span>{new Date(slot.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}</span><span>{t('saves.load')}</span></button>)}
                </section>
              ))}
            </div>
          )}
        </dialog>
      )}
    </li>
  );
}
