'use client';

import { useEffect, useState } from 'react';
import { formatTime } from '@/lib/i18n';
import AdminLoading from './AdminLoading';

/** `/api/admin/comments` 返回的条目。`userId` 不在里面（后台也不需要，见接口注释）。 */
interface CommentItem {
  id: string;
  gameId: string;
  /** 游戏名；游戏已下架 / 没有文案时是 null，退回显示 slug */
  gameTitle: string | null;
  /** **真名**（注册邮箱）。公开页面走脱敏，后台不脱 —— 要认得出是谁 */
  username: string;
  content: string;
  rating: number;
  createdAt: number;
}

interface CommentPage {
  items: CommentItem[];
  nextCursor: string | null;
}

type Notice = { tone: 'ok' | 'error'; text: string };

const PAGE_SIZE = 12;

/**
 * 星级上限。和 `lib/server/comments.ts` 的 `RATING_MAX` **手抄一致**
 * （客户端不能 import 那个模块：里面引了 node:crypto 和数据库客户端）。
 */
const RATING_MAX = 5;

async function fetchPage(cursor: string | null): Promise<CommentPage> {
  const query = cursor
    ? `?cursor=${encodeURIComponent(cursor)}&limit=${PAGE_SIZE}`
    : `?limit=${PAGE_SIZE}`;
  const res = await fetch(`/api/admin/comments${query}`);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as CommentPage;
}

/** 和 AdminGames / AdminFeedback 里那份同一套：把服务端给的 detail 挖出来。 */
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: string; error?: string };
    return data.detail ?? data.error ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * 后台 · 评论 tab（2026-11-06 加）。
 *
 * 留言本 / 游戏反馈是**匿名**提交的，处理方式是「打个勾」；评论不一样：它带作者、
 * 带星级，而且只能删（正文不允许后台改，理由同另外两个 tab）。所以这一页的动作是
 * **删除**，不是切标记。
 *
 * 三件事和别的 tab 不一样，都是刻意的：
 *  · **游戏名是链接**（新标签页打开 `/games/<id>`）—— 判断一条评论是否过分，
 *    常常得看看这款游戏是什么。用 `<a>` 而不是 `<Link>`：后台整块不吃前台那套
 *    预取/缓存策略，开新标签也不该把前台页面拉进当前这棵 RSC 树。
 *  · **用户名显示真名**（= 注册邮箱）。后台的用途就是「认出这个号」，
 *    遮成 `a***e` 就白搭了；公开页面那边才遮（`lib/mask.ts`）。
 *  · **删除走两次确认**（同 AdminUsers 的删号）：第一次点变成「确认删除」，
 *    第二次才发请求。评论删了回不来，而且这里没有回收站。
 *
 * 翻页仍然是**按钮触发**而不是滚动加载：后台列表短、操作是「一条条处理」。
 */
export default function AdminComments() {
  const [items, setItems] = useState<CommentItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [moreState, setMoreState] = useState<'idle' | 'loading' | 'error'>('idle');
  /** 正在删的那条 id；非 null 时其余按钮一并置灰，避免连点 */
  const [busyId, setBusyId] = useState<string | null>(null);
  /**
   * 正处于「等待第二次确认」的那条 id。点别处 / 点别的行会自动清掉 ——
   * 免得点了一次、过一会儿回来手滑点第二下，删掉一条早已不记得的评论。
   */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
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

  /** 第一次点只是把它标成「待确认」。 */
  const requestDelete = (item: CommentItem) => {
    if (busyId) return;
    setNotice(null);
    setConfirmingId(item.id);
  };

  /** 第二次点才真删。 */
  const confirmDelete = async (item: CommentItem) => {
    if (busyId) return;
    setBusyId(item.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/comments/${item.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res, '请求失败。'));
      // 删掉了就把它从列表里拿掉 —— 这条之后再也不会出现
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      setNotice({ tone: 'ok', text: `已删除 ${item.username} 的这条评论。` });
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : '请求失败。',
      });
    } finally {
      setBusyId(null);
      setConfirmingId(null);
    }
  };

  return (
    <section className="bg-ink-800 pixel-edge pxw-3 pxc-600 p-4">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="shrink-0 text-[12px] text-ink-200">{'评论'}</h2>
        {notice && (
          <span className={`text-[12px] ${notice.tone === 'ok' ? 'text-ok' : 'text-danger'}`}>
            {notice.text}
          </span>
        )}
      </div>

      {/*
        说明必须写：公开页面上用户名是打星号的，后台这里是真名。
        不写一句，看到邮箱的人会以为是漏遮了。
      */}
      <p className="mb-3 text-[12px] leading-relaxed text-ink-500">{'全站评论，新的在前。这里显示用户真名（注册邮箱），公开页面是打码的。删除不可恢复，正文不提供后台编辑。'}</p>

      {state === 'loading' && <AdminLoading label="载入中…" />}
      {state === 'error' && <p className="text-[12px] text-danger">{'请求失败。'}</p>}
      {state === 'ready' && items.length === 0 && (
        <p className="text-[12px] text-ink-500">{'还没有评论。'}</p>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col divide-y-2 divide-ink-900">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {/*
                    游戏名走系统字体、不套 font-pixel：它可能含中文（像素字模没有 CJK）。
                    没有标题时退回 slug —— 链接仍然指得对，只是难看一点。
                  */}
                  <a
                    href={`/games/${item.gameId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[12px] text-accent hover:underline"
                  >
                    {item.gameTitle ?? item.gameId}
                  </a>
                  {/* 星星同前台：实心走强调色、空心走灰，图形本身 aria-hidden，分数由 title 念 */}
                  <span
                    className="star-glyph text-[13px] leading-none text-accent"
                    aria-hidden="true"
                    title={`${item.rating} / ${RATING_MAX}`}
                  >
                    {'★'.repeat(Math.min(item.rating, RATING_MAX))}
                    <span className="text-ink-600">
                      {'☆'.repeat(Math.max(0, RATING_MAX - item.rating))}
                    </span>
                  </span>
                  <span className="text-[12px] text-ink-400">{item.username}</span>
                </div>
                {/* 正文可能多行 —— 系统字体 + 换行，不做 truncate */}
                <p className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-ink-200">
                  {item.content}
                </p>
              </div>
              <span className="w-[132px] shrink-0 text-right text-[12px] text-ink-500">
                {formatTime(item.createdAt, 'zh')}
              </span>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => (confirmingId === item.id ? void confirmDelete(item) : requestDelete(item))}
                className={`pixel-edge pxw-2 pxc-500 shrink-0 px-2.5 py-1 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  confirmingId === item.id
                    ? 'bg-danger/20 text-danger'
                    : 'bg-ink-700 text-ink-200 enabled:hover:text-danger'
                }`}
              >
                {confirmingId === item.id ? '确认删除' : '删除'}
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
          className="pixel-edge pxw-2 pxc-500 mt-3 bg-ink-700 px-3 py-1 text-[12px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {moreState === 'loading' ? '载入中…' : '加载更多'}
        </button>
      )}
    </section>
  );
}
