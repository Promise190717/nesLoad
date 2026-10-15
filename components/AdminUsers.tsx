'use client';

import { useEffect, useState } from 'react';
import { formatTime } from '@/lib/i18n';
import AdminLoading from './AdminLoading';

/**
 * `/api/admin/users` 返回的行。字段对齐 lib/server/app-users.ts 的 AppUserWithStats。
 */
interface AppUserRow {
  id: string;
  username: string;
  /** true = 已封禁 */
  banned: boolean;
  createdAt: number;
  lastLoginAt: number | null;
  /** **现在**是不是 VIP（服务端现算：vip_expires_at > now）。 */
  vip: boolean;
  /** VIP 有效期至（毫秒时间戳）。null = 没开过；过去了的 = 已过期（vip 为 false 但这值还在）。 */
  vipExpiresAt: number | null;
  historyCount: number;
  saveCount: number;
  favoriteCount: number;
}

interface UserPage {
  items: AppUserRow[];
  nextCursor: string | null;
}

type Notice = { tone: 'ok' | 'error'; text: string };

const PAGE_SIZE = 12;

/** 毫秒时间戳 → `<input type="date">` 要的 `YYYY-MM-DD`（本地时区）。 */
function toDateInputValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function fetchPage(cursor: string | null): Promise<UserPage> {
  const query = cursor
    ? `?cursor=${encodeURIComponent(cursor)}&limit=${PAGE_SIZE}`
    : `?limit=${PAGE_SIZE}`;
  const res = await fetch(`/api/admin/users${query}`);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as UserPage;
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
 * 后台 · 用户 tab（2026-10-13 加）。
 *
 * ⚠️ **这里管的是前台注册用户（app_users），不是管理员（users 表）。**
 *    管理员账号是用 `scripts/create-user.mjs` 手工建的，一共就那么一两个，
 *    刻意不做界面 —— 一个能封禁管理员的页面本身就是个风险面。
 *
 * 两个动作，都是**危险操作**，所以每一步都要用户确认：
 *   · 封禁 / 解封 —— 反过来随时可撤销，确认框只是防误点
 *   · 删号 —— **不可逆**（连历史 / 存档 / 收藏一起清，存档还会删 R2 对象），
 *     所以走两次确认（`confirm()` + 按钮变成「确认删除」），而不是直接删
 *
 * 翻页是**按钮触发**而不是滚动加载（同 AdminFeedback）：后台列表短、操作是
 * 「一条条处理」，滚着滚着自动续一屏反而让人分不清自己看到哪了。
 */
export default function AdminUsers() {
  const [items, setItems] = useState<AppUserRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [moreState, setMoreState] = useState<'idle' | 'loading' | 'error'>('idle');
  /** 正在操作的那条 id；非 null 时其余按钮一并置灰，避免连点 */
  const [busyId, setBusyId] = useState<string | null>(null);
  /**
   * 正处于「等待第二次确认删除」的那条 id。
   *
   * 删号不可逆，所以要两步：第一次点把它设进来（按钮变成「确认删除」），
   * 第二次点才真删。点别处 / 点别的行会自动清掉 —— 免得用户点了一次、
   * 过了五分钟回来手滑点第二下，删掉一个他早就不记得要删的号。
   */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

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

  /** 封禁 / 解封。就地翻标记，不重拉列表（重拉会把已经翻过的页数打回第一页）。 */
  const toggleBanned = async (row: AppUserRow) => {
    if (busyId) return;
    const next = !row.banned;
    setBusyId(row.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banned: next }),
      });
      if (!res.ok) throw new Error(await readError(res, '请求失败。'));
      /*
       * PATCH 回的是**改完之后的完整用户** —— 从回包里拿 banned，别用本地算的 next
       * （两边今天是一致的，但以后服务端要是加了别的联动，本地这份就成了谎言）。
       */
      const data = (await res.json()) as { user?: { banned?: boolean } };
      setItems((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, banned: data.user?.banned ?? next } : r))
      );
      setNotice({ tone: 'ok', text: next ? `已封禁 ${row.username}。` : `已解封 ${row.username}。` });
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : '请求失败。',
      });
    } finally {
      setBusyId(null);
    }
  };

  /*
   * VIP 设置（2026-10-13 加）。点「设置 VIP」进入行内编辑态：一条 date 输入 +
   * 保存 / 取消会员 / 收起。**不弹模态** —— 这一页别的操作都是行内完成的，
   * 为一个小时间输入弹层反而重。
   * 只选到「哪天」，保存时自动补成**所选日期**的 23:59:59（当天最后一秒），
   * 省得管理员去想「几点几分」——填 12-31 就是 12-31 整天有效。
   */
  const [vipEditingId, setVipEditingId] = useState<string | null>(null);
  /** 编辑态里 date 的当前值。空串 = 保存时当「取消会员」处理。 */
  const [vipDraft, setVipDraft] = useState('');

  const openVipEditor = (row: AppUserRow) => {
    if (busyId) return;
    setNotice(null);
    setVipDraft(row.vipExpiresAt !== null ? toDateInputValue(row.vipExpiresAt) : '');
    setVipEditingId(row.id);
  };

  /**
   * 保存 VIP。输入框空着 = 取消会员（vipExpiresAt 传 null）。
   * 有值时补 `T23:59:59` 再 parse —— 直接 `new Date('2026-12-31')` 会被当成
   * **UTC** 零点，东八区差 8 小时；带时间部分才按本地时区解析。
   */
  const saveVip = async (row: AppUserRow) => {
    if (busyId) return;
    setBusyId(row.id);
    setNotice(null);
    try {
      const expiresAt = vipDraft ? new Date(`${vipDraft}T23:59:59`).getTime() : null;
      const res = await fetch(`/api/admin/users/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vipExpiresAt: expiresAt }),
      });
      if (!res.ok) throw new Error(await readError(res, '请求失败。'));
      const data = (await res.json()) as {
        user?: { vip?: boolean; vipExpiresAt?: number | null };
      };
      setItems((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                vip: data.user?.vip ?? (expiresAt !== null && expiresAt > Date.now()),
                vipExpiresAt: data.user?.vipExpiresAt ?? expiresAt,
              }
            : r
        )
      );
      setVipEditingId(null);
      setNotice({
        tone: 'ok',
        text: expiresAt === null ? `已取消 ${row.username} 的会员。` : `已更新 ${row.username} 的会员。`,
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : '请求失败。',
      });
    } finally {
      setBusyId(null);
    }
  };

  /** 取消会员（编辑态里那颗，直接置 null，不看输入框）。 */
  const clearVip = async (row: AppUserRow) => {
    if (busyId) return;
    setBusyId(row.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vipExpiresAt: null }),
      });
      if (!res.ok) throw new Error(await readError(res, '请求失败。'));
      const data = (await res.json()) as {
        user?: { vip?: boolean; vipExpiresAt?: number | null };
      };
      setItems((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, vip: data.user?.vip ?? false, vipExpiresAt: data.user?.vipExpiresAt ?? null }
            : r
        )
      );
      setVipEditingId(null);
      setNotice({ tone: 'ok', text: `已取消 ${row.username} 的会员。` });
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : '请求失败。',
      });
    } finally {
      setBusyId(null);
    }
  };

  /** 删号。第一次点只是把它标成「待确认」。 */
  const requestDelete = (row: AppUserRow) => {
    if (busyId) return;
    setNotice(null);
    setConfirmingId(row.id);
  };

  /** 第二次点才真删。 */
  const confirmDelete = async (row: AppUserRow) => {
    if (busyId) return;
    setBusyId(row.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${row.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res, '请求失败。'));
      // 删掉了就把它从列表里拿掉 —— 这条之后再也不会出现
      setItems((prev) => prev.filter((r) => r.id !== row.id));
      setNotice({ tone: 'ok', text: `已删除 ${row.username} 及其全部数据。` });
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
        <h2 className="shrink-0 text-[12px] text-ink-200">{'用户'}</h2>
        {notice && (
          <span className={`text-[12px] ${notice.tone === 'ok' ? 'text-ok' : 'text-danger'}`}>
            {notice.text}
          </span>
        )}
      </div>

      {/*
        这一行说明是**必须的**：光看「用户」两个字，谁都会以为这是后台账号。
        写清楚「前台的、和后台账号无关」，省得有人在这里找自己的管理员账号在哪。
      */}
      <p className="mb-3 text-[12px] leading-relaxed text-ink-500">{'这里是前台注册用户，不是后台管理员账号（管理员用 scripts/create-user.mjs 手工建，没有界面）。'}</p>

      {state === 'loading' && <AdminLoading label="载入中…" />}
      {state === 'error' && <p className="text-[12px] text-danger">{'请求失败。'}</p>}
      {state === 'ready' && items.length === 0 && (
        <p className="text-[12px] text-ink-500">{'还没有注册用户。'}</p>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col divide-y-2 divide-ink-900">
          {items.map((row) => {
            const confirming = confirmingId === row.id;
            return (
              <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                {/* 名字。带 `min-w-0` 才能被 truncate（它可能很长） */}
                <span className="min-w-0 max-w-[200px] truncate text-[12px] text-ink-100">
                  {row.username}
                </span>

                {/* 封禁标记。正常的不显示 —— 一排绿标签只会让「谁被封了」更难扫出来 */}
                {row.banned && (
                  <span className="pixel-edge pxw-2 pxc-danger shrink-0 bg-danger/20 px-1.5 py-0.5 text-[12px] text-danger">
                    {'已封禁'}
                  </span>
                )}

                {/* VIP 徽章：金色（accent）+ 到期时间。过期 / 没开的不显示 ——
                    非会员不用一颗灰章占地方（和个人中心那颗不一样：那是本人的页面，
                    要让「普通用户」也是个明确的说法） */}
                {row.vip && (
                  <span className="pixel-edge pxw-2 pxc-accent shrink-0 bg-accent/15 px-1.5 py-0.5 text-[12px] text-accent">
                    {`VIP · 有效期至 ${formatTime(row.vipExpiresAt ?? 0, 'zh')}`}
                  </span>
                )}

                {/* 三块数据的条数 —— 扫一眼就知道这个号是空注册还是真在用 */}
                <span className="shrink-0 font-pixel text-[12px] text-ink-400">
                  {`历史 ${row.historyCount} · 存档 ${row.saveCount} · 收藏 ${row.favoriteCount}`}
                </span>

                {/* 注册时间 / 最近登录。两个都摆，一列文字最长也就 130px */}
                <span className="shrink-0 text-[12px] text-ink-500">
                  {`注册于 ${formatTime(row.createdAt, 'zh')}`}
                </span>
                <span className="shrink-0 text-[12px] text-ink-500">
                  {row.lastLoginAt === null
                    ? '从未登录'
                    : `最近登录 ${formatTime(row.lastLoginAt, 'zh')}`}
                </span>

                <span className="ml-auto flex shrink-0 items-center gap-2">
                  {/*
                    VIP 钮。点开下方那条行内编辑器（vipEditingId）。
                    已是 VIP 时钮上保持同一文案 —— 到期时间就在徽章里，不用重复。
                  */}
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() =>
                      vipEditingId === row.id ? setVipEditingId(null) : openVipEditor(row)
                    }
                    className="pixel-edge pxw-2 pxc-500 bg-ink-700 px-2.5 py-1 text-[12px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {vipEditingId === row.id ? '收起' : '设置 VIP'}
                  </button>

                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void toggleBanned(row)}
                    className="pixel-edge pxw-2 pxc-500 bg-ink-700 px-2.5 py-1 text-[12px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {row.banned ? '解封' : '封禁'}
                  </button>

                  {/*
                    删号按钮两态：默认「删除」，点一下变「确认删除」（红色 + 更明确）。
                    点别处会把 confirmingId 清掉（见下面每个按钮的 onClick 里那行），
                    所以不会出现「挂了半天还亮着确认」的情况。
                  */}
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => {
                      if (confirming) void confirmDelete(row);
                      else requestDelete(row);
                    }}
                    className={`pixel-edge pxw-2 pxc-500 px-2.5 py-1 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      confirming
                        ? 'bg-danger text-ink-950 hover:bg-danger/80'
                        : 'bg-ink-700 text-ink-200 enabled:hover:text-danger'
                    }`}
                  >
                    {confirming ? '确认删除' : '删除'}
                  </button>
                </span>

                {/*
                  VIP 行内编辑器（vipEditingId 命中这一行时出现）。
                  外层 li 是 flex-wrap，这条 `w-full` 自己独占一行。
                  输入框空着点「保存」= 取消会员；已是会员时另有「取消会员」一键直达。
                */}
                {vipEditingId === row.id && (
                  <div className="flex w-full flex-wrap items-center gap-2 bg-ink-900/60 px-2 py-2">
                    <label className="flex items-center gap-2">
                      <span className="text-[12px] text-ink-400">
                        {'会员有效期至'}
                      </span>
                      <input
                        type="date"
                        value={vipDraft}
                        onChange={(e) => setVipDraft(e.target.value)}
                        className="pixel-edge pxw-2 pxc-500 bg-ink-800 px-2 py-1 text-[12px] text-ink-100 focus:outline-none"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void saveVip(row)}
                      className="pixel-edge pxw-2 pxc-500 bg-accent px-2.5 py-1 text-[12px] text-ink-950 transition-colors enabled:hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {'保存'}
                    </button>
                    {row.vip && (
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void clearVip(row)}
                        className="pixel-edge pxw-2 pxc-500 bg-ink-700 px-2.5 py-1 text-[12px] text-ink-200 transition-colors enabled:hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {'取消会员'}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
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
