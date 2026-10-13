'use client';

import { useEffect, useState } from 'react';
import { useI18n } from './I18nProvider';

/**
 * 详情页那颗「收藏」（2026-10-13 用户要的，挨着「开始游戏」放）。
 *
 * 和「分享游戏」一样是**独立的小客户端组件**：`/games/[id]` 是服务端组件
 * （正文要能被整段读走，见那边注释），收藏要有事件处理，塞不进去。拆出来之后
 * 只有这一颗按钮进客户端 bundle。
 *
 * ⚠️ **不做「未登录也能看见星标」那一套**。游戏库面板里那颗星是**匿名可见的**，
 *    因为用户得先看见它才知道有收藏这个功能（见 ConsoleScene 的 toggleFavorite）。
 *    这一页不一样：它没有登录入口（登录面板住在屋里），所以未登录时点它只能给一句
 *    「去房间里登录」的提示 —— 那就干脆**不点亮**，点一下直接把话说明白。
 *
 * 状态的三态：
 *   · `null` —— 还没问出来 / 未登录。按钮显示「收藏」，**禁用**（不骗人）。
 *   · `false` / `true` —— 已知收藏与否，按钮可点。
 *
 * ⚠️ **首屏问两次**（`/api/user/profile` 判登录态，再 `?ids=1` 取收藏集合）。
 *    为什么不合成一次：收藏接口未登录直接 401，拿不到「我是谁」。所以先问 profile，
 *    401 就当未登录 —— 这也是**唯一的登录态判据**（同 ConsoleScene 的 fetchCurrentUser）。
 */
export default function FavoriteButton({ gameId }: { gameId: string }) {
  const { t } = useI18n();
  const /** null = 未登录 / 未知；true / false = 已收 / 未收 */
    [favorited, setFavorited] = useState<boolean | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  /** 提示（未登录 or 请求失败），2 秒后自己收回 */
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    /*
     * 两步串起来（而不是两个 effect）：第二步依赖第一步的结果 —— 没登录就没必要
     * 去拉收藏（打了也是 401）。setState 一律放 .then/.catch，不在 effect 体里同步写
     * （react-hooks/set-state-in-effect，同 AccountCenter 那几个 tab）。
     */
    fetch('/api/user/profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: { id: string } } | null) => {
        if (cancelled) return;
        if (!data?.user) return; // 未登录 —— 保持 null
        setSignedIn(true);
        return fetch('/api/user/favorites?ids=1')
          .then((res) => (res.ok ? res.json() : null))
          .then((ids: { ids?: string[] } | null) => {
            if (!cancelled) setFavorited(ids?.ids?.includes(gameId) ?? false);
          })
          .catch(() => {
            // 收藏拉不到：按钮仍可点（按「未收藏」起步），别整颗钮消失
            if (!cancelled) setFavorited(false);
          });
      })
      .catch(() => {
        // profile 失败 = 当未登录处理，和 401 同路
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  // 提示过一会儿自己收回去（同 ShareGameButton 那颗复制钮的节奏）
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2000);
    return () => clearTimeout(timer);
  }, [notice]);

  const toggle = async () => {
    if (busy) return;
    if (!signedIn) {
      // 没登录：不发请求，只提示。这一页没有登录面板，得让用户回屋
      setNotice(t('gamesPage.favoriteSignIn'));
      return;
    }
    if (favorited === null) return; // 状态还没问出来，按钮本来就是禁用的，兜底

    const owned = favorited;
    setBusy(true);
    /*
     * 乐观更新：先翻本地，再打接口；失败翻回来。收藏是**幂等**的
     * （数据层 ON CONFLICT DO NOTHING / 先查后删），所以连点也不会坏。
     * 理由同 ConsoleScene 的 toggleFavorite —— 等接口回来才动会像「点了没反应」。
     */
    setFavorited(!owned);
    try {
      const res = await fetch(
        owned ? `/api/user/favorites?gameId=${encodeURIComponent(gameId)}` : '/api/user/favorites',
        {
          method: owned ? 'DELETE' : 'POST',
          headers: owned ? undefined : { 'Content-Type': 'application/json' },
          body: owned ? undefined : JSON.stringify({ gameId }),
        }
      );
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setFavorited(owned); // 翻回去，别停在假的收藏态上
      setNotice(t('gamesPage.favoriteFailed'));
    } finally {
      setBusy(false);
    }
  };

  /*
   * 三态映射到一颗钮：
   *   未登录（!signedIn）→ 可点，点了给提示（所以不 disabled —— 禁用的话用户
   *                        点都点不动，也就不知道为什么不能收藏）
   *   已收藏 → 实心星 + 强调色
   *   未收藏 → 空心星 + 灰底
   */
  const active = favorited === true;
  const label = active ? t('gamesPage.unfavorite') : t('gamesPage.favorite');

  return (
    <span className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={() => void toggle()}
        aria-pressed={active}
        aria-label={label}
        title={label}
        className={`pixel-edge pxw-2 pxc-500 flex items-center gap-2 px-4 py-2 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          active
            ? 'bg-accent text-ink-950 hover:bg-accent/80'
            : 'bg-ink-800 text-ink-200 hover:text-accent'
        }`}
      >
        {/* ★ 实心 / ☆ 空心 —— 用同一个字符集里的两颗星，比画 SVG 更像素风 */}
        <span aria-hidden="true">{active ? '★' : '☆'}</span>
        {label}
      </button>

      {/*
        提示气泡。**绝对定位**挂在按钮底下，不挤动旁边那两颗钮 ——
        否则一提示「去房间里登录」，整排按钮会横跳一下。
      */}
      {notice && (
        <span
          role="status"
          className="absolute left-0 top-full z-10 mt-2 w-max max-w-[260px] bg-ink-950/95 px-2 py-1 text-[10px] leading-relaxed text-ink-200 pixel-edge pxw-2 pxc-600"
        >
          {notice}
        </span>
      )}
    </span>
  );
}
