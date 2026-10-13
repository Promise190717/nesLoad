'use client';

import { useEffect, useState } from 'react';
import { formatTime } from '@/lib/i18n';
import AdminLoading from './AdminLoading';
import { useI18n } from './I18nProvider';

/** `/api/admin/game-reports` 返回的条目。 */
interface ReportItem {
  id: string;
  gameId: string;
  /** 提交那一刻的游戏名（快照）—— 游戏后来改了名或下架了，这里仍是当时那个 */
  gameTitle: string;
  content: string;
  resolved: boolean;
  createdAt: number;
}

interface ReportPage {
  items: ReportItem[];
  nextCursor: string | null;
}

type Notice = { tone: 'ok' | 'error'; text: string };

const PAGE_SIZE = 12;

async function fetchPage(cursor: string | null): Promise<ReportPage> {
  const query = cursor
    ? `?cursor=${encodeURIComponent(cursor)}&limit=${PAGE_SIZE}`
    : `?limit=${PAGE_SIZE}`;
  const res = await fetch(`/api/admin/game-reports${query}`);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as ReportPage;
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
 * 后台 · 游戏反馈 tab（2026-10-13 加，配合详情页那颗「反馈问题」）。
 *
 * 和「留言本」那个 tab 长得几乎一样，但**是两张表、两件事**（见 db/schema.sql 里
 * `game_reports` 的注释）：留言本是公开留言板，这里是**只给后台看的**问题单。
 * 所以别把两个组件合并 —— 合并了就得再长一个「要不要显示游戏名」的开关。
 *
 * 唯一的动作还是切「已解决」（正文不给改，理由同 app/api/admin/game-reports/[id]/route.ts）。
 * 翻页同样是**按钮触发**而不是滚动加载：后台列表短、操作是「一条条处理」。
 *
 * 每行开头那个**游戏名是个链接**（新标签页打开 `/games/<id>`）—— 处理一条反馈总得
 * 先去看看那一款，比让人回列表页再搜一遍省事。游戏已下架时链接会落到 404，
 * 这是对的：那时候确实没得看了，但名字（快照）还在，仍能判断这条反馈说的是什么。
 */
export default function AdminReports() {
  const { t, locale } = useI18n();

  const [items, setItems] = useState<ReportItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [moreState, setMoreState] = useState<'idle' | 'loading' | 'error'>('idle');
  /** 正在改的那条 id；非 null 时其余按钮一并置灰，避免连点 */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // 首屏。setState 一律放 .then/.catch —— 直接在 effect 体里同步 setState
  // 会被 react-hooks/set-state-in-effect 拦下（同 AdminFeedback）。
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

  const toggle = async (item: ReportItem) => {
    if (busyId) return;
    const next = !item.resolved;
    setBusyId(item.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/game-reports/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: next }),
      });
      if (!res.ok) throw new Error(await readError(res, t('admin.reports.failed')));
      // 就地翻标记，不重拉列表 —— 重拉会把已经翻过的页数打回第一页
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, resolved: next } : row)));
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : t('admin.reports.failed'),
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="bg-ink-800 pixel-edge pxw-3 pxc-600 p-4">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="shrink-0 text-[12px] text-ink-200">{t('admin.reports.title')}</h2>
        {notice && (
          <span className={`text-[11px] ${notice.tone === 'ok' ? 'text-ok' : 'text-danger'}`}>
            {notice.text}
          </span>
        )}
      </div>

      {state === 'loading' && <AdminLoading label={t('feedback.loading')} />}
      {state === 'error' && <p className="text-[11px] text-danger">{t('admin.reports.failed')}</p>}
      {state === 'ready' && items.length === 0 && (
        <p className="text-[11px] text-ink-500">{t('admin.reports.empty')}</p>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col divide-y-2 divide-ink-900">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-2">
              <div className="min-w-0 flex-1">
                {/*
                  游戏名走系统字体、不套 font-pixel：它可能含中文（像素字模没有 CJK）。
                  新标签页打开 —— 处理反馈时不想丢掉这一页翻到第几屏了。
                */}
                <a
                  href={`/games/${item.gameId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-accent hover:underline"
                >
                  {item.gameTitle}
                </a>
                {/* 正文可能多行 —— 系统字体 + 换行，不做 truncate */}
                <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-ink-200">
                  {item.content}
                </p>
              </div>
              <span
                className={`pixel-edge pxw-2 pxc-500 shrink-0 px-1.5 py-0.5 text-[10px] ${
                  item.resolved ? 'bg-ok/20 text-ok' : 'bg-ink-700 text-ink-400'
                }`}
              >
                {t(item.resolved ? 'admin.reports.resolved' : 'admin.reports.unresolved')}
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
                {t(item.resolved ? 'admin.reports.markUnresolved' : 'admin.reports.markResolved')}
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
          {moreState === 'loading' ? t('feedback.loading') : t('admin.reports.loadMore')}
        </button>
      )}
    </section>
  );
}
