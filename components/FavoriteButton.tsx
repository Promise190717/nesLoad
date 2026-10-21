'use client';

import { useEffect, useState } from 'react';
import { fetchCurrentUser } from '@/lib/current-user';
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
 *    「去场景里登录」的提示 —— 那就干脆**不点亮**，点一下直接把话说明白。
 *
 * 状态的三态：
 *   · `null` —— 还没问出来 / 未登录。按钮显示「收藏」，**禁用**（不骗人）。
 *   · `false` / `true` —— 已知收藏与否，按钮可点。
 *
 * ⚠️ **首屏只问一次「我是谁」**（2026-10-19 改）。原先这里自己打 `/api/user/profile`
 *    判登录态，而同一页的顶栏（`components/TopBar.tsx`）也在问 `/api/user/login` ——
 *    未登录的人每进一次详情页就是两条白跑的请求。现在两边共用
 *    `lib/current-user.ts` 那一次带缓存的探测（并发还会合并成一个）。
 *    登着的话第二步照旧拉收藏集合；没登录这一步都省了。
 *    登录态变了按下一次探测为准（缓存 5 分钟），和顶栏那颗钮同一套口径。
 *
 * 2026-10-13 用户要求「详情页显示游戏收藏数量」：这个数就挂在**这颗钮上**
 * （`★ 收藏 12`），而不是另起一行资料 ——
 *   · 它属于「收藏」这件事，紧挨着才对得上；
 *   · 而且它在**同一处**才能跟着乐观更新一起走：点一下收藏，数字立刻 +1，
 *     不需要刷新页面。另放一行的话，那颗数字要么滞后、要么得再拆一层状态。
 * 初值由详情页服务端取好传进来（`count`），所以首屏 / 爬虫都能看见真实数字。
 */
export default function FavoriteButton({ gameId, count }: { gameId: string; count: number }) {
  const { t } = useI18n();
  const /** null = 未登录 / 未知；true / false = 已收 / 未收 */
    [favorited, setFavorited] = useState<boolean | null>(null);
  /**
   * 收藏数。**乐观更新**（和 `favorited` 一起翻），失败的 catch 里翻回来 ——
   * 用函数式 setState，别在闭包里读 `total`：那个值是渲染那一刻的旧值。
   */
  const [total, setTotal] = useState(count);
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
    fetchCurrentUser()
      .then((me) => {
        if (cancelled) return;
        if (!me) return; // 未登录 —— 保持 null
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
        // 探测失败 = 当未登录处理（fetchCurrentUser 自己就回 null，这条只是兜底）
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
    setTotal((n) => Math.max(0, n + (owned ? -1 : 1)));
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
      setTotal((n) => Math.max(0, n + (owned ? 1 : -1)));
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
        /*
         * 尺寸 = 站内紧凑钮那一档（`py-2` + `12px` + `px-3.5`），
         * 2026-10-13 跟详情页那排钮一起降下来的（用户说「上面三个按钮的尺寸缩小点」）——
         * 这三颗必须**同档**，谁大一点都会把那排拆成「一颗主钮 + 两颗陪衬」。
         * 口径同 AdminGames / GameLibraryPanel 里那批钮。
         */
        className={`pixel-edge pxw-2 pxc-600 flex items-center gap-1.5 px-3.5 py-2 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          active
            ? 'bg-accent text-ink-950 hover:bg-accent/80'
            : 'bg-ink-800 text-ink-200 hover:bg-ink-700 hover:text-accent'
        }`}
      >
        {/*
          ★ 实心 / ☆ 空心 —— 用同一个字符集里的两颗星，比画 SVG 更像素风。
          字号 15px（钮里的字只有 12px）—— 和「开始游戏」的 `▸`、「下载 ROM」的 `↓`
          同一个尺寸：三颗钮的图标得一样大，不然一行里三个符号三种重量。
          配 `leading-none` 是为了**不撑高钮**（15px < 文字的 18px 行高），
          和字号本身是两件事。
        */}
        <span aria-hidden="true" className="text-[15px] leading-none">
          {active ? '★' : '☆'}
        </span>
        {label}
        {/*
          收藏数。夹在钮里而不是另起一行：**同一个 state 才能一起乐观更新**（见上面）。
          数字本身不上读屏 —— 钮的 `aria-label` 说的是「点了会发生什么」（那个才是
          按钮的名字），数量放在 `title` 里给鼠标用户看。
        */}
        <span
          aria-hidden="true"
          title={t('gamesPage.favoriteCount', { n: total })}
          className="text-[12px] opacity-70"
        >
          {total}
        </span>
      </button>

      {/*
        提示气泡。**绝对定位**挂在按钮底下，不挤动旁边那两颗钮 ——
        否则一提示「去登录」，整排按钮会横跳一下。
      */}
      {notice && (
        <span
          role="status"
          className="absolute left-0 top-full z-10 mt-2 w-max max-w-[260px] bg-ink-950/95 px-2 py-1 text-[12px] leading-relaxed text-ink-200 pixel-edge pxw-2 pxc-600"
        >
          {notice}
        </span>
      )}
    </span>
  );
}
