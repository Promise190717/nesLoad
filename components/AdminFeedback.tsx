'use client';

import { useEffect, useState } from 'react';
import { formatTime } from '@/lib/i18n';
import { useI18n } from './I18nProvider';

/** `/api/admin/feedback` 返回的条目。 */
interface FeedbackItem {
  id: string;
  content: string;
  resolved: boolean;
  createdAt: number;
}

interface FeedbackPage {
  items: FeedbackItem[];
  nextCursor: string | null;
}

type Notice = { tone: 'ok' | 'error'; text: string };

const PAGE_SIZE = 12;

async function fetchPage(cursor: string | null): Promise<FeedbackPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=${PAGE_SIZE}` : `?limit=${PAGE_SIZE}`;
  const res = await fetch(`/api/admin/feedback${query}`);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as FeedbackPage;
}

/** 和 AdminConsole 里那份同一套：把服务端给的 detail 挖出来，比一句「请求失败」有用。 */
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: string };
    return data.detail ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * 后台的「留言本」区块。
 *
 * 刻意做成 AdminConsole 里的**一个 section**而不是又一个弹窗：后台的用法是
 * 「一边看游戏一边顺手处理留言」，弹窗会把游戏列表盖掉。
 *
 * 唯一的动作是切「已解决」—— 正文不给改（理由见 app/api/admin/feedback/[id]/route.ts）。
 * 翻页是**按钮触发**而不是滚动加载：后台列表短、操作是「一条条处理」，
 * 滚着滚着自动续一屏反而会让人分不清自己看到哪了。
 */
export default function AdminFeedback() {
  const { t, locale } = useI18n();

  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [moreState, setMoreState] = useState<'idle' | 'loading' | 'error'>('idle');
  /** 正在改的那条 id；非 null 时其余按钮一并置灰，避免连点 */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // 首屏。setState 一律放 .then/.catch —— 直接在 effect 体里同步 setState
  // 会被 react-hooks/set-state-in-effect 拦下。
  useEffect(() => {
    let cancelled = false;
    fetchPage(null)
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = () => {
    if (!nextCursor || moreState === 'loading') return;
    setMoreState('loading');
    fetchPage(nextCursor)
      .then((page) => {
        setItems((prev) => [...prev, ...page.items]);
        setNextCursor(page.nextCursor);
        setMoreState('idle');
      })
      .catch(() => setMoreState('error'));
  };

  const toggle = async (item: FeedbackItem) => {
    if (busyId) return;
    const next = !item.resolved;
    setBusyId(item.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/feedback/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: next }),
      });
      if (!res.ok) throw new Error(await readError(res, t('admin.feedback.failed')));
      // 就地翻标记，不重拉列表 —— 重拉会把已经翻过的页数打回第一页
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, resolved: next } : row)));
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : t('admin.feedback.failed'),
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="bg-ink-800 pixel-edge pxw-3 pxc-600 p-4">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="shrink-0 text-[12px] text-ink-200">{t('admin.feedback.title')}</h2>
        {notice && (
          <span className={`text-[11px] ${notice.tone === 'ok' ? 'text-ok' : 'text-danger'}`}>
            {notice.text}
          </span>
        )}
      </div>

      {state === 'loading' && <p className="text-[11px] text-ink-500">{t('feedback.loading')}</p>}
      {state === 'error' && <p className="text-[11px] text-danger">{t('admin.feedback.failed')}</p>}
      {state === 'ready' && items.length === 0 && (
        <p className="text-[11px] text-ink-500">{t('admin.feedback.empty')}</p>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col divide-y-2 divide-ink-900">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-2">
              {/* 正文可能带中文、可能多行 —— 系统字体 + 换行，不做 truncate */}
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-ink-200">
                {item.content}
              </p>
              <span
                className={`pixel-edge pxw-2 pxc-500 shrink-0 px-1.5 py-0.5 text-[10px] ${
                  item.resolved ? 'bg-ok/20 text-ok' : 'bg-ink-700 text-ink-400'
                }`}
              >
                {t(item.resolved ? 'admin.feedback.resolved' : 'admin.feedback.unresolved')}
              </span>
              <span className="w-[132px] shrink-0 text-right text-[10px] text-ink-500">
                {formatTime(item.createdAt, locale)}
              </span>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void toggle(item)}
                className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-2.5 py-1 text-[10px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t(item.resolved ? 'admin.feedback.markUnresolved' : 'admin.feedback.markResolved')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <button
          type="button"
          disabled={moreState === 'loading'}
          onClick={loadMore}
          className="pixel-edge pxw-2 pxc-500 mt-3 bg-ink-700 px-3 py-1 text-[10px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {moreState === 'loading' ? t('feedback.loading') : t('admin.feedback.loadMore')}
        </button>
      )}
    </section>
  );
}
