'use client';

import Link from 'next/link';
import { useState } from 'react';
import AuthForm, { type AuthUser } from './AuthForm';
import { useI18n } from './I18nProvider';

/**
 * 用户面板（2026-10-13 加）：**账号 + 我的云端数据**。
 *
 * 三种态由父级（ConsoleScene）的 `user` 决定：
 *   · 没登录 → 登录 / 注册表单（`components/AuthForm.tsx`，**和 `/login` 那一页共用同一张表单**）
 *   · 登录了 → 用户名 + 三块数据的入口（历史 / 存档 / 收藏的总览）+ 退出
 *
 * ⚠️ **和后台账号毫无关系** —— 这里的账号住 `app_users` 表、cookie 是 `nesload_user`，
 *    和 `/admin` 那套（`users` 表 + `nesload_admin`）完全隔离。界面文案里也不要暗示
 *    两者有关联（比如别写「同一个账号也能登后台」）。
 *
 * 历史 / 存档 / 收藏的**管理**都在它们各自的地方：收藏在游戏库面板的 tab 里、
 * 历史在游戏库面板的 tab 里、存档在插着卡带时屏幕上那个存档列表里。
 * 这个面板只做三件事：登录、看总数、退出 —— 刻意**不做**第四套列表 UI
 * （同一份数据在两个地方各画一遍，迟早会漂）。
 *
 * 表单本体 2026-10-13 抽去了 `AuthForm`（独立登录页 `/login` 也要用它），
 * 这里只剩外壳 + 「已登录」那一屏 + 退出。
 */

export interface UserPanelProps {
  /** 当前登录用户；null = 未登录 */
  user: AuthUser | null;
  /** 登录状态还在确认中（首屏那一次 `/api/user/login` GET）。这时不画表单，画「载入中」。 */
  loading: boolean;
  /** 登录 / 注册成功。父级据此刷新全局的 user 与收藏集合。 */
  onAuthed: (user: AuthUser) => void;
  /** 退出成功。 */
  onSignedOut: () => void;
  onClose: () => void;
}

export default function UserPanel({ user, loading, onAuthed, onSignedOut, onClose }: UserPanelProps) {
  const { t, href: localeHref } = useI18n();

  const [busy, setBusy] = useState(false);
  /**
   * 退出失败的提示。**只有错误** —— 表单那侧的成功 / 失败提示跟着表单走（在 `AuthForm` 里），
   * 这一屏能出的事只有「退出没退掉」。
   */
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fetch('/api/user/login', { method: 'DELETE' });
      onSignedOut();
    } catch {
      setError(t('user.error.failed'));
    } finally {
      setBusy(false);
    }
  };

  /*
   * ⚠️ **这个面板只能靠右上角那颗 ✕ 关掉**（2026-10-13 用户要求）——
   *    不挂 Esc、点背板也不关。所以上面没有那段「Esc 关面板」的 effect（别的面板都有）。
   *
   * 为什么这么定：登录 / 注册是一个**有输入内容**的表单，点歪一下就把填了一半的
   * 用户名口令丢掉，代价比「多走一步去点叉」大得多。和留言本（FeedbackPanel）那条
   * 「输入框里按 Esc 不算关面板」是同一个考虑，这里索性把整条路都堵上。
   *
   * 外层那个 wrapper 因此也**不挂 onClick** —— 挂了就变成「点背板关掉」了。
   */

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      {/* 这层遮罩**不挂 onClick** —— 点它不关面板（见上面那段注释） */}
      <div className="absolute inset-0 bg-ink-950/80" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('user.title')}
        className="relative flex w-[min(420px,92vw)] flex-col bg-ink-800 pixel-edge pxw-4 pxc-600"
      >
        <div className="flex items-center gap-3 border-b-2 border-ink-900 bg-ink-850 px-4 py-3">
          <span className="text-[12px] text-ink-200">{t('user.title')}</span>
          <button
            type="button"
            aria-label={t('user.close')}
            onClick={onClose}
            className="pixel-edge pxw-2 pxc-500 ml-auto flex h-[18px] w-[18px] items-center justify-center bg-ink-700 text-[10px] leading-none text-ink-100 hover:bg-danger hover:text-ink-950"
          >
            ×
          </button>
        </div>

        {/*
          载入中：首屏那一次「我是谁」还没回来。这时**不画表单** ——
          画了的话，已经是登录状态的人会看见一瞬登录框、再被换掉，
          比多等那几十毫秒难看得多。
        */}
        {loading ? (
          <p className="p-4 text-[12px] text-ink-400">{t('games.loading')}</p>
        ) : user ? (
          /* ---------------- 已登录 ---------------- */
          <div className="flex flex-col gap-3 p-4">
            <p className="text-[12px] text-ink-200">
              {t('user.signedInAs', { name: user.username })}
            </p>
            {/*
              三块数据的说明。**不给列表入口** —— 那些都在各自的地方（见文件头注释）。
              写这几句是为了让用户知道「登录之后多了什么」，而不是让他在这里点。
            */}
            <p className="text-[11px] leading-relaxed text-ink-400">{t('user.cloudHint')}</p>

            {error && <span className="text-[11px] text-danger">{error}</span>}

            {/*
              个人中心入口（2026-10-13 加）。**只能是链接**（不是按钮）——
              它要跳去 /account 那个真路由，而这里是个浮层。
              走 `next/link` 的 <Link>：客户端导航，不改「新标签/中键」的原生行为。

              为什么这颗钮值得摆在退出旁边：这个面板本身**不做管理**
              （见文件头注释：同一份数据不在两个地方各画一遍），
              管理全在个人中心。不摆入口，用户根本不知道那个页面存在。
            */}
            <Link
              href={localeHref('/account')}
              className="pixel-edge pxw-2 pxc-500 self-start bg-ink-700 px-3 py-1.5 text-[11px] text-ink-200 transition-colors hover:text-accent"
            >
              {t('account.title')}
            </Link>

            <button
              type="button"
              disabled={busy}
              onClick={() => void signOut()}
              className="pixel-edge pxw-2 pxc-500 self-start bg-ink-700 px-3 py-1.5 text-[11px] text-ink-200 transition-colors enabled:hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('user.signOut')}
            </button>
          </div>
        ) : (
          /* ---------------- 未登录：登录 / 注册（表单本体在 AuthForm 里） ---------------- */
          <div className="p-4">
            <AuthForm onAuthed={onAuthed} />
          </div>
        )}
      </div>
    </div>
  );
}
