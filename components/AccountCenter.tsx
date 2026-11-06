'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTopLoader } from 'nextjs-toploader';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { cardDelayMs } from '@/lib/card-stagger';
import type { AccountTab } from '@/lib/account-tabs';
import { forgetCurrentUser } from '@/lib/current-user';
import type { ConsoleType } from '@/lib/emulator';
import { localizeTexts, type GameTexts } from '@/lib/game-text';
import { formatTime, type Locale, type MessageKey } from '@/lib/i18n';
import { MAX_CARTRIDGES } from '@/lib/library';
import BackLink from './BackLink';
import { consoleLabel } from '@/lib/consoles';
import { useI18n } from './I18nProvider';

/**
 * 个人中心（`/account`）—— 2026-10-13 加。
 *
 * 五个 tab：
 *   · 收藏 —— 复用游戏库那份卡片网格（认封面），点卡片开**游戏详情页**（不是直接开玩）
 *   · 历史 —— 云端游戏历史（最近玩过的 N 款），可逐条删、可一键清空
 *   · 存档 —— 树视图（2026-10-14 从平铺改过来）：一层游戏、点开才见该游戏下的具体存档，
 *            可逐份删、可一键清空
 *   · 评论 —— 自己写过的评论（2026-11-06 加），新的在前，可逐条删
 *   · 密码 —— 改密码（原先是「资料」里最长的一段，2026-10-13 拆成单独一页）
 *
 * ⚠️ **「资料」tab 2026-11-06 撤掉**（用户要求「隐藏资料 tab，点击顶部的头像可以上传图片」）：
 *    换头像改由**页头那颗头像**直接点 —— 它现在是一颗 `<button>`，点开就是选文件对话框，
 *    选完立刻上传。原来那一屏里的「性别」按用户的原话「暂时不展示」一起收了
 *    （接口还在：`PATCH /api/user/profile` 的 `gender`，数据层照旧），
 *    **要恢复就把那块表单放回页头或另起一屏，别把 tab 加回清单**。
 *
 * ⚠️ **tab 走 URL**（2026-10-14 加，用户要求「刷新别永远回到收藏」）：当前 tab 写在
 *    `?tab=` 上（`/account?tab=saves`），服务端解析后当 `initialTab` 传进来；
 *    切换用 `history.replaceState` 同步地址 —— 不触发导航、不重拉数据。
 *
 * ⚠️ **为什么点收藏卡片是跳详情页而不是在屋里开玩**：这一页是「管理」，用户正在做的事
 *    是「整理我的收藏」。而开玩那套载入需要屏幕、控制器、进度条这些上下文，这一页没有。
 *    跳 `/games/<id>` 让用户从详情页自己「开始游戏」—— 那条路是现成的。
 *    **历史 tab 同理**（也跳详情页）。
 *
 * ⚠️ 五个 tab 的数据**各自惰性拉取**（切到那个 tab 才拉），不是首屏全拉。
 *    理由和游戏库面板的收藏 tab 一致：用户可能只想改个密码就走。
 *    例外是**用户资料**（页头要用它画头像和名字），那个首屏必拉。
 *
 * 历史 tab 是 2026-10-13 补的（用户明确要求）。**原先刻意不放**，理由是「历史没有管理可言、
 * 清空入口在游戏库面板已经有了」—— 但用户要的是**在个人中心里也能管**，而且加了**单条删除**
 * （靠 `/api/user/history/<gameId>`），所以它现在确实是一块独立的管理界面，不再和游戏库面板重复。
 * 游戏库面板那个历史 tab 仍在（那是「边玩边翻」的场景），两处并存、不互相替代。
 */

/** `/api/user/profile` 返回的用户。字段对齐 lib/server/app-users.ts 的 AppUser。 */
interface AccountUser {
  id: string;
  username: string;
  gender: 'male' | 'female' | 'other' | null;
  avatarUrl: string | null;
  createdAt: number;
  lastLoginAt: number | null;
  /** **现在**是不是 VIP（服务端读时判定：vip_expires_at > now）。 */
  vip: boolean;
  /** VIP 有效期至（毫秒时间戳）。null = 没开过；过去了的 = 已过期（此时 vip 为 false 但值还在，页头用它提示「已过期」）。 */
  vipExpiresAt: number | null;
}

/** `/api/user/favorites` 的条目（对齐 lib/server/user-data.ts 的 UserFavoriteItem）。 */
interface FavoriteItem {
  id: string;
  /** 文案按语言索引（和 `/api/games` 的 `Game.texts` 同一形状），由 `localizeTexts` 现挑一份。 */
  texts: GameTexts;
  imageUrl: string;
  romName: string;
  consoleType: ConsoleType;
  language: string | null;
  year: number | null;
  developerId: string | null;
  favoritedAt: number;
}

/**
 * 按当前界面语言取收藏那一条要显示的文字。
 *
 * 直接转发 `lib/game-text.ts` 的 `localizeTexts`（纯函数，服务端与客户端共用同一份）——
 * 这里只用到标题和开发商，就把其余两样丢掉。原来是手抄的「英文站空值回退中文」，
 * 2026-10-16 撤掉（抄一份的代价是加语言时只改一处）。
 */
function localizeFavoriteItem(
  item: FavoriteItem,
  locale: Locale
): { title: string; developer: string | null } {
  const text = localizeTexts(item.texts, locale);
  return { title: text.title, developer: text.developer };
}

/**
 * `/api/user/history` 的条目（对齐 lib/server/user-data.ts 的 `UserHistoryItem`）。
 *
 * 注意字段名和 `FavoriteItem` / `SaveOverviewItem` **不一样** —— 这份是照
 * `lib/library.ts` 的 `Cartridge` 形状来的（`id` = gameId、`texts` 是标题、
 * `playedAt` 是时间），因为它本来就要能直接喂给屋里那套 `loadRemote`。
 * 这里只做展示和删除，所以只用得上 `id` / `texts` / `imageUrl` / `console` / `playedAt`。
 */
interface HistoryItem {
  /** = game_id。删单条时拿它拼 `/api/user/history/<id>`。 */
  id: string;
  /** 文案按语言索引，由 `localizeTexts` 现挑一份（原来平铺的 `name` + `nameEn` 已撤）。 */
  texts: GameTexts;
  imageUrl: string;
  romName: string;
  console: ConsoleType;
  /** 最近一次玩的时间（服务端按它倒序） */
  playedAt: number;
}

/** `/api/user/saves/all` 的条目（对齐 listUserSaveOverview 的返回）。 */
interface SaveOverviewItem {
  id: string;
  gameId: string;
  romName: string;
  title: string;
  size: number;
  createdAt: number;
  imageUrl: string;
  /** 游戏文案（JOIN 现取，比槽位上那个 `title` 快照新），由 `localizeTexts` 现挑一份。 */
  texts: GameTexts;
  consoleType: ConsoleType;
}

/**
 * `/api/user/comments` 的条目（对齐 `listUserComments` 出网后的形状）。
 *
 * 没有 `username` / `avatarUrl` —— 看的是自己的评论，头像名字页头已经有了。
 * `gameTitle` 是服务端现查的；游戏下架 / 没文案时为 null，前端退回显示 slug。
 */
interface MyCommentItem {
  id: string;
  gameId: string;
  gameTitle: string | null;
  content: string;
  rating: number;
  createdAt: number;
}

/**
 * 星级上限。和 `lib/server/comments.ts` 的 `RATING_MAX` **手抄一致**
 * —— 客户端不能 import 那个模块（里面引了 node:crypto 和数据库客户端）。
 * 组件里改区间时**两处一起改**（同 GameComments 那份的注释）。
 */
const RATING_MAX = 5;

/** 个人中心「评论」tab 的页大小。和服务端 `COMMENT_PAGE_SIZE` 一致（10）。 */
const MY_COMMENTS_PAGE_SIZE = 10;

/** tab id 的出处 / `?tab=` 解析在 lib/account-tabs.ts（page.tsx 服务端也要用）。 */
type Tab = AccountTab;
type LoadState = 'loading' | 'ready' | 'error';
type Notice = { tone: 'ok' | 'error'; text: string };

/**
 * 同一时刻只发一次**相同 URL** 的 GET（2026-11-06 加）。
 *
 * 起因：开发模式开着 `reactStrictMode`，React 会把 effect 故意跑两遍
 * （挂载 → 卸载 → 再挂载）来暴露漏写的清理。切 tab 时那一对 effect 几乎同毫秒
 * 触发，于是网络面板里同一个接口**同时飞两条**、服务端也多跑一次库查询。
 * 生产构建只跑一遍，本来就只有一条 —— 这不是接口写重了。
 *
 * 只复用**还在飞**的那个 Promise：一落地就从表里删掉，所以重新进这一屏照样拿最新一份，
 * 不会引入过期数据。页头资料和四个 tab 共用它，别在各自 effect 里再各写一份。
 */
const inFlightJson = new Map<string, Promise<unknown>>();

function getJsonOnce<T>(url: string): Promise<T> {
  const running = inFlightJson.get(url);
  if (running) return running as Promise<T>;

  const request = fetch(url).then((res) => {
    if (!res.ok) throw new Error(String(res.status));
    return res.json() as Promise<T>;
  });

  // 成功失败都要把位子腾出来，否则下一次进来会永远拿到这个旧结果
  request.then(
    () => inFlightJson.delete(url),
    () => inFlightJson.delete(url)
  );
  inFlightJson.set(url, request);
  return request;
}

const TABS: { value: Tab; label: MessageKey }[] = [
  { value: 'favorites', label: 'account.tabFavorites' },
  { value: 'history', label: 'account.tabHistory' },
  { value: 'saves', label: 'account.tabSaves' },
  /* 标签借 `comments.heading`（「评论」/「Comments」）—— 那 18 份文案里本来就有，
     不必为一个 tab 名新增一条键。 */
  { value: 'comments', label: 'comments.heading' },
  { value: 'password', label: 'account.tabPassword' },
];

const FIELD_CLASS =
  'pixel-edge pxw-2 pxc-500 w-full bg-ink-900 px-2 py-2 text-[12px] text-ink-100 placeholder:text-ink-600 focus:outline-none';

/** 把字节数写成人能读的大小。B / KB / MB，一位小数（够用，不引单位换算库）。 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function AccountCenter({ initialTab }: { initialTab?: Tab }) {
  const { t, locale, href: localeHref } = useI18n();
  /** 初始 tab 来自 URL（服务端解析好传进来），刷新后停在原 tab 而不是永远回到收藏。 */
  const [tab, setTab] = useState<Tab>(initialTab ?? 'favorites');

  /*
   * 切 tab 时把状态写进地址栏（`?tab=saves` 这类）。用 `history.replaceState`
   * 而不是 `router.replace` —— 后者是一次真导航，服务端组件会重渲染、页头资料重拉，
   * 换个 tab 没必要付这个代价；replaceState 只改地址，React 状态照旧，可分享可刷新。
   * 也不进历史栈：浏览器后退 = 离开这一页，而不是在 tab 之间倒带。
   */
  const switchTab = (value: Tab) => {
    setTab(value);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', value);
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  };

  /**
   * 资料（首屏就拉 —— 它也要用来画页头那个用户名 / 头像）。
   * 用 `AccountUser | null` 而不是把它塞进三个 tab 的惰性逻辑：
   * 页头在三个 tab 下都要显示头像和名字。
   */
  const [user, setUser] = useState<AccountUser | null>(null);
  const [userState, setUserState] = useState<LoadState>('loading');

  useEffect(() => {
    let cancelled = false;
    getJsonOnce<{ user: AccountUser }>('/api/user/profile')
      .then((data) => {
        if (cancelled) return;
        setUser(data.user);
        setUserState('ready');
      })
      .catch(() => {
        if (!cancelled) setUserState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 换头像（2026-11-06 从「资料」tab 搬到页头）。
   *
   * 页头那颗头像现在是一颗 `<button>`，点它 = 点下面那个隐藏的 file input ——
   * 原生 input 在像素风里突兀且不可控，所以照原来的做法藏起来，
   * 但**仍然是真 input**：键盘可达性和无障碍都还在（按钮本身可 Tab 到）。
   *
   * 成功时换的是 `user`（`/api/user/avatar` 回完整用户），页头头像立刻变；
   * 失败按服务端给的错误码翻文案，认不出的退回通用那句。
   *
   * ⚠️ 原来「资料」里那颗「移除头像」随着那一屏一起撤了。`DELETE /api/user/avatar`
   *    还在（接口没动），只是这一版没有入口 —— 要恢复就挂在页头（比如头像右上角
   *    一颗 `×`），别再为它把 tab 加回来。
   */
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarNotice, setAvatarNotice] = useState<Notice | null>(null);

  /** 服务端回来的错误码 → 文案键。认不出的退回通用那句（同原来资料页里那份）。 */
  const avatarMessageOf = (code: string) => {
    const keys: Record<string, MessageKey> = {
      'avatar-too-large': 'account.error.avatarTooLarge',
      'unsupported-type': 'account.error.avatarType',
      'missing-avatar': 'account.error.avatarMissing',
    };
    const key = keys[code];
    return key ? t(key) : t('account.failed');
  };

  const uploadAvatar = async (file: File) => {
    if (avatarBusy) return;
    setAvatarBusy(true);
    setAvatarNotice(null);
    try {
      const form = new FormData();
      form.append('avatar', file);
      const res = await fetch('/api/user/avatar', { method: 'POST', body: form });
      const data = (await res.json().catch(() => ({}))) as { user?: AccountUser; error?: string };
      if (!res.ok || !data.user) throw new Error(data.error ?? '');
      setUser(data.user);
      setAvatarNotice({ tone: 'ok', text: t('account.avatarSaved') });
    } catch (error) {
      setAvatarNotice({
        tone: 'error',
        text: avatarMessageOf(error instanceof Error ? error.message : ''),
      });
    } finally {
      setAvatarBusy(false);
      // 清掉 input 的 value —— 不然连选同一个文件不会触发 change
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  /**
   * 页头那颗「退出登录」（2026-10-13 加）。
   *
   * 和屋里 `UserPanel` 的 `signOut` 是同一个接口（`DELETE /api/user/login` 清掉
   * `nesload_user` 那个 cookie），只是这一页没有「面板开关」要收。
   * 2026-10-15 改：退出后回**首页**（用户要求）。
   * 失败时**不静默**：留在原地并提示，让用户知道那颗钮点过了、只是没成功
   * （cookie 没被清掉，这时跳走会显得「明明点了退出却还登着」）。
   */
  const router = useRouter();
  /**
   * 顶部加载条的接口（组件挂在 `app/layout.tsx`）。这里只有一处要用：
   * 退出登录后的那次 `router.push` —— 它不是 `<a>`，那个包听不见，
   * 只能自己 `start()`（不喊的话这次导航就没有加载条，而不是「多一条」）。
   */
  const topLoader = useTopLoader();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(false);
    try {
      const res = await fetch('/api/user/login', { method: 'DELETE' });
      if (!res.ok) throw new Error(String(res.status));
      /* 「我是谁」的缓存也要清（`lib/current-user.ts`）—— 否则切一次页面顶栏还画着用户名 */
      forgetCurrentUser();
      // 回**当前语言**的首页（`/zh/account` 上退出不该把人扔进英文首页）
      topLoader.start();
      router.push(localeHref('/'));
      // 首页没有守卫，push 之后本组件会被卸载，不必再复位 busy
    } catch {
      setSigningOut(false);
      setSignOutError(true);
    }
  };

  return (
    <main className="wall min-h-screen px-6 py-6 sm:py-12">
      <div className="mx-auto w-full max-w-4xl">
        {/*
          左上「返回」（浏览器回退，兜底去 `/`，与内容页那颗 BackLink 同一套）+
          右上「首页」（2026-10-13 加）。这一页没有内容页那排顶栏（它自己就是账号页），
          所以回首页那颗单独放在右上角 —— 和别的页面保持一致。
        */}
        <div className="flex items-center justify-between gap-4">
          <BackLink
            href={localeHref('/')}
            className="inline-flex items-center gap-2 text-[12px] text-ink-400 transition-colors hover:text-accent"
          >
            <span aria-hidden="true">←</span>
            <span>{t('common.back')}</span>
          </BackLink>
          <Link
            href={localeHref('/')}
            className="text-[12px] text-ink-400 transition-colors hover:text-accent"
          >
            {t('common.home')}
          </Link>
        </div>

        {/* ---------------- 页头：头像 + 名字 + 注册时间 + 退出 ---------------- */}
        <header className="mt-4 flex items-center gap-4 border-b border-ink-800 pb-6 sm:mt-8">
          {/*
            头像即上传入口（2026-11-06 用户要求「点击顶部的头像可以上传图片」）。
            整颗头像是 `<button>`：点开就是选文件对话框，选完立刻传。
            悬停 / 键盘聚焦时压一层半透明黑 + 一句「选择图片」，否则没人知道它能点
            （`pointer-events-none` 是必须的，不然那层会吃掉这次点击）。
            资料还没拉到时禁用 —— 那时候连自己有没有头像都不知道，点它没有意义。
          */}
          <div className="relative shrink-0">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadAvatar(file);
              }}
            />
            <button
              type="button"
              disabled={!user || avatarBusy}
              onClick={() => avatarInputRef.current?.click()}
              aria-label={t('account.chooseImage')}
              title={user ? t('account.chooseImage') : undefined}
              className="group relative block disabled:cursor-not-allowed"
            >
              <AccountAvatar size={56} url={user?.avatarUrl ?? null} />
              {/*
                `overflow-hidden` 挂在这层而不是按钮上：`.pixel-edge` 的四向描边是
                **画在元素外面的** box-shadow，按钮自己一裁就把那圈框裁掉了。
              */}
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden bg-ink-950/70 p-1 text-center text-[10px] leading-tight text-ink-100 transition-opacity ${
                  avatarBusy
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
                }`}
              >
                {avatarBusy ? t('account.uploading') : t('account.chooseImage')}
              </span>
            </button>
          </div>
          <div className="min-w-0">
            {/*
              名字 + VIP 徽章（2026-10-13 加）。**两种徽章都画**：VIP 是金色（accent），
              非 VIP 是灰色 —— 让「普通用户」也是一个明确的说法，而不是「没显示」。
              徽章跟着资料走（/api/user/profile 现拉的），后台改完 VIP、刷新这页就变。
              `leading-none` 压掉继承行高 —— 不加的话 10px 字号也撑出一条高徽章（同日改）。
            */}
            <div className="flex items-center gap-3">
              <h1 className="min-w-0 truncate text-[20px] leading-snug font-semibold text-ink-100">
                {user ? user.username : t('account.title')}
              </h1>
              {user &&
                (user.vip ? (
                  <span className="vip-shine pixel-edge pxw-2 pxc-accent shrink-0 bg-accent/15 px-1.5 py-0.5 text-[12px] leading-none text-accent">
                    {t('account.vipBadge')}
                  </span>
                ) : (
                  <span className="pixel-edge pxw-2 pxc-700 shrink-0 bg-ink-800 px-1.5 py-0.5 text-[12px] leading-none text-ink-400">
                    {t('account.nonVipBadge')}
                  </span>
                ))}
            </div>
            {/* 名字本身是「我现在登的是哪个号」的确认。
                VIP 在第二行补一句有效期 / 过期时间 —— 没开过会员的只写注册时间 */}
            {/*
              名字下面这一行原本只讲「注册时间 / VIP」。**资料 tab 撤掉之后**它还要
              兜住「资料拉取失败」—— 原来那句错误提示长在 ProfileTab 里，现在那一屏
              没了，不说的话页头会永远停在「载入中…」，看起来像卡死。
            */}
            <p className="mt-1 text-[12px] text-ink-400">
              {user
                ? t('account.since', { time: formatTime(user.createdAt, locale) }) +
                  (user.vip
                    ? ' · ' +
                      t('account.vipUntil', {
                        time: formatTime(user.vipExpiresAt ?? 0, locale),
                      })
                    : user.vipExpiresAt !== null
                      ? ' · ' +
                        t('account.vipExpired', { time: formatTime(user.vipExpiresAt, locale) })
                      : '')
                : userState === 'error'
                  ? t('account.failed')
                  : t('account.loading')}
            </p>
            {/* 换头像的结果就报在名字下面 —— 头像本身没有地方放文案 */}
            {avatarNotice && (
              <p
                className={`mt-1 text-[12px] ${
                  avatarNotice.tone === 'ok' ? 'text-ok' : 'text-danger'
                }`}
              >
                {avatarNotice.text}
              </p>
            )}
          </div>

          {/*
            退出登录（2026-10-13 用户要求加在用户名旁边）。

            为什么这一页要有它：`UserPanel` 里那颗退出的位置在屋里（浮层上），
            而用户进到个人中心以后多半就在这里待着 —— 想退出还得先回屋子、再开面板。
            这颗钮把「退出」放到他正在看的这一页，少一次折返。

            `ml-auto` 推到这一行最右：页头是 `items-center` 的横排，
            名字那块 `min-w-0` 会随长用户名伸缩，靠右固定才不会跟着漂。

            退出后**回首页**（`router.push('/')`，2026-10-15 用户要求）：
            这一页是登录态专属，退出去留在原地会立刻被
            `app/[locale]/account/layout.tsx` 的守卫重定向
            （`/login?next=/account`，2026-10-13 有独立登录页之后是这样）——
            那是「被弹走」的观感。自己主动导航回首页，落点干净，也不会莫名其妙
            被弹到登录页。

            按钮文案借 `user.signOut`（屋里那颗退出用的是同一个键）——
            同一个动作在站里只该有一个名字。

            `signingOut` 期间禁用：退出是一次真请求（`DELETE /api/user/login` 清 cookie），
            连点两下会发出两次，disable 掉更稳妥。
          */}
          {user && (
            <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
              <button
                type="button"
                disabled={signingOut}
                onClick={() => void signOut()}
                className="pixel-edge pxw-1 pxc-500 bg-ink-800 px-1.5 py-0.5 text-[10px] text-ink-300 transition-colors enabled:hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('user.signOut')}
              </button>
              {/* 退出失败**必须说出来**：cookie 没清掉，用户还以为退出成功了 */}
              {signOutError && <span className="text-[12px] text-danger">{t('account.failed')}</span>}
            </div>
          )}
        </header>

        {/* ---------------- tab 条 ---------------- */}
        <div className="mt-6 flex items-center gap-3 border-b border-ink-800 pb-3">
          {TABS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={tab === value}
              onClick={() => switchTab(value)}
              className={`pixel-edge pxw-2 pxc-500 flex h-[26px] items-center px-3 text-[12px] transition-colors ${
                tab === value
                  ? 'bg-accent text-ink-950'
                  : 'bg-ink-800 text-ink-300 hover:bg-ink-700 hover:text-ink-100'
              }`}
            >
              {t(label)}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === 'favorites' ? (
            <FavoritesTab />
          ) : tab === 'history' ? (
            <HistoryTab />
          ) : tab === 'saves' ? (
            <SavesTab />
          ) : tab === 'comments' ? (
            <CommentsTab />
          ) : (
            <PasswordTab />
          )}
        </div>
      </div>
    </main>
  );
}

/* ================================================================== *
 * 头像
 * ================================================================== */

/**
 * 一个头像块。有 `avatarUrl` 就显示图，没有就画一个**像素小人剪影**（默认头像）。
 *
 * ⚠️ 走 `<img>` 不走 `next/image`：R2 公网域名没在 next.config 里登记 remotePatterns
 *    （同 GameLibraryPanel 那份封面）。
 *
 * 默认头像用 `UserIcon`（`components/icons.tsx`）—— 它就是「账号」那个符号，
 * 拿它当占位再合适不过，也不必再画一个新的。
 */
function AccountAvatar({ size, url }: { size: number; url: string | null }) {
  return (
    <span
      className="pixel-edge pxw-2 pxc-600 flex shrink-0 items-center justify-center overflow-hidden bg-ink-800 text-ink-500"
      style={{ width: size, height: size }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <UserGlyph size={size} />
      )}
    </span>
  );
}

/**
 * 默认头像里的人形剪影。
 *
 * ⚠️ **尺寸只取 16 或 32**（取 32 及以上时）—— 这是 `icons.tsx` 文件头那条规矩：
 *    viewBox 里每根线都是 1 单位宽，渲染尺寸必须是 16 的**整数倍**，否则在 DPR = 1
 *    的屏上细线会被 `crispEdges` 吸附、甚至整条丢掉（1 单位只剩 0.81 物理像素）。
 *    头像框是 56 / 64 这种数，所以这里按需退到 32（整数倍里最大的那个），
 *    再靠 `items-center` 居中 —— 不会撑满框，但那本来就是「剪影居中」该有的样子。
 */
function UserGlyph({ size }: { size: number }) {
  const rendered = size >= 32 ? 32 : 16;
  return (
    <svg
      width={rendered}
      height={rendered}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* 形状与 icons.tsx 的 UserIcon 一致（头 / 颈 / 两级台阶的肩） */}
      <rect x="5" y="2" width="6" height="2" />
      <rect x="4" y="4" width="2" height="4" />
      <rect x="10" y="4" width="2" height="4" />
      <rect x="5" y="8" width="6" height="2" />
      <rect x="6" y="10" width="4" height="2" />
      <rect x="4" y="12" width="8" height="2" />
      <rect x="2" y="14" width="12" height="2" />
    </svg>
  );
}

/* ================================================================== *
 * 列表骨架屏（收藏 / 存档共用）
 * ================================================================== */

/**
 * 一个跳动的方点。像素风里不用 spinner（圆弧是反像素的），用一颗闪烁的方块。
 *
 * ⚠️ 动画类 `.loading-dots` 定义在 `globals.css` 里（`@theme` 外面那一段），
 *    按 `steps()` 跳帧 —— 平滑渐变的呼吸效果和像素风不搭。
 */
function LoadingDot() {
  return <span className="loading-dots inline-block h-[6px] w-[6px] bg-accent" aria-hidden="true" />;
}

/**
 * 收藏列表的骨架：占位的封面格子 + 两行文字条。
 *
 * ⚠️ **占位格子数和真实布局对齐**（`grid-cols-3 sm:4 md:5`），这样首屏数据到了之后
 *    不会「跳一下」。摆 10 个（大屏两行）就够，再多只是浪费 DOM。
 *
 * ⚠️ `aria-live="polite"` + 内部 `role="status"`：读屏用户听到「正在取收藏」，
 *    而不是一片沉默的空白。`aria-busy` 标在容器上。
 */
function FavoritesSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
      <p role="status" className="flex items-center gap-2 text-[12px] text-ink-400">
        <LoadingDot />
        {label}
      </p>
      {/* 骨架本身对读屏是噪音，整个 aria-hidden 掉，信息由上面那行文字承担 */}
      <ul aria-hidden="true" className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <li key={i} className="pixel-edge pxw-2 pxc-700 bg-ink-850">
            <div className="aspect-[3/4] w-full animate-pulse bg-ink-800" />
            <div className="flex flex-col gap-1 px-1.5 py-1.5">
              <span className="h-[10px] w-4/5 animate-pulse bg-ink-800" />
              <span className="h-[8px] w-3/5 animate-pulse bg-ink-800" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 列表式（缩略图 + 两行字 + 一颗钮）tab 的骨架：几行灰条。
 *
 * ⚠️ **历史和存档共用这一个** —— 两边的行布局完全一样，各自写一份必然会漂。
 * （2026-10-13 加历史 tab 时从 `SavesSkeleton` 改名过来，不再是存档专用。）
 */
function ListRowSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
      <p role="status" className="flex items-center gap-2 text-[12px] text-ink-400">
        <LoadingDot />
        {label}
      </p>
      <ul aria-hidden="true" className="flex flex-col divide-y-2 divide-ink-800">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="flex items-center gap-3 py-2.5">
            <span className="h-[52px] w-[38px] shrink-0 animate-pulse bg-ink-800" />
            <span className="min-w-0 flex-1">
              <span className="block h-[10px] w-2/5 animate-pulse bg-ink-800" />
              <span className="mt-1 block h-[8px] w-3/5 animate-pulse bg-ink-800" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ================================================================== *
 * tab 1：收藏
 * ================================================================== */

function FavoritesTab() {
  const { t, locale, href: localeHref } = useI18n();
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  /** 正在取消收藏的那条 id；非 null 时其余星标置灰，避免连点 */
  const [busyId, setBusyId] = useState<string | null>(null);
  /** 请求序号：慢的旧响应不许覆盖新的 */
  const requestId = useRef(0);

  /*
   * 首屏拉一次。setState 一律放 .then/.catch —— 直接在 effect 体里同步 setState
   * 会被 react-hooks/set-state-in-effect 拦下（同 AdminFeedback 那个 effect）。
   */
  useEffect(() => {
    const id = ++requestId.current;
    getJsonOnce<{ items: FavoriteItem[] }>('/api/user/favorites')
      .then((data) => {
        if (requestId.current !== id) return;
        setItems(data.items);
        setState('ready');
      })
      .catch(() => {
        if (requestId.current !== id) return;
        setState('error');
      });
  }, []);

  /**
   * 取消收藏。**乐观更新**：先从列表里拿掉，再打接口；失败就把它塞回去
   * （同 ConsoleScene 的 toggleFavorite，理由一致 —— 等接口回来才动会像「点了没反应」）。
   */
  const unfavorite = async (item: FavoriteItem) => {
    if (busyId) return;
    setBusyId(item.id);
    const snapshot = items;
    setItems((prev) => prev.filter((it) => it.id !== item.id));
    try {
      const res = await fetch(`/api/user/favorites?gameId=${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      // 失败就恢复原样（用进这一份快照，比手动插回原位可靠）
      setItems(snapshot);
    } finally {
      setBusyId(null);
    }
  };

  if (state === 'loading') {
    /* 骨架屏而不是一行「载入中…」—— 列表页的占位骨架能减少布局跳动（见 FavoritesSkeleton） */
    return <FavoritesSkeleton label={t('account.favoritesLoading')} />;
  }
  if (state === 'error') {
    return <p className="text-[12px] text-danger">{t('account.failed')}</p>;
  }
  if (items.length === 0) {
    return <p className="text-[12px] text-ink-400">{t('account.favoritesEmpty')}</p>;
  }

  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
      {items.map((item, index) => {
        /* 卡片上的标题 / 开发商按当前界面语言取一份 */
        const text = localizeFavoriteItem(item, locale);
        return (
        <li
          key={item.id}
          className="card-in"
          style={{ animationDelay: `${cardDelayMs(index)}ms` }}
        >
          <div className="relative">
            {/*
              卡片本身是一条**到游戏详情页的链接**（不是「直接开玩」，见文件头注释）。
              用 <Link> 而不是 onClick + router：中键 / ctrl+click 能在新标签打开 ——
              用户可能想一边玩一边继续整理收藏。
            */}
            <Link
              href={localeHref(`/games/${item.id}`)}
              title={
                text.developer
                  ? `${text.title}\n${text.developer}`
                  : text.title
              }
              className="pixel-edge pxw-2 pxc-700 block w-full bg-ink-850 text-left transition-colors hover:bg-ink-700"
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden bg-ink-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                <span className="absolute right-0 top-0 bg-ink-950/85 px-1 py-0.5 font-pixel text-[12px] text-accent">
                  {consoleLabel(item.consoleType, locale)}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 px-1.5 py-1.5">
                <span className="truncate text-[12px] text-ink-100">{text.title}</span>
                {/* 第二格放收藏时间（服务端按它倒序），和游戏库面板的收藏 tab 一致 */}
                <span className="truncate text-[12px] text-ink-500">
                  {formatTime(item.favoritedAt, locale)}
                </span>
              </div>
            </Link>

            {/*
              取消收藏的星标。**贴在卡片按钮左上角、且是它的兄弟** —— 理由同
              GameLibraryPanel：`<button>` 里不能套 `<button>`，而这里外层是 <Link>
              （渲染成 <a>），`<a>` 里同样不能套 `<a>`，但可以套 `<button>`……
              不过那个按钮的点击会连带触发 <a> 的导航，所以仍必须 stopPropagation。
            */}
            <button
              type="button"
              disabled={busyId !== null}
              aria-label={t('account.unfavorite', { name: text.title })}
              title={t('account.unfavorite', { name: text.title })}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void unfavorite(item);
              }}
              className="absolute left-0 top-0 z-10 flex h-[20px] w-[20px] items-center justify-center bg-ink-950/85 leading-none text-accent transition-colors hover:bg-ink-950 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="text-[12px]">★</span>
            </button>
          </div>
        </li>
        );
      })}
    </ul>
  );
}

/* ================================================================== *
 * tab 2：历史
 * ================================================================== */

/**
 * 云端游戏历史（最近玩过的 N 款，N = `MAX_HISTORY`）。
 *
 * 结构和「存档」那个 tab 几乎一样（行内缩略图 + 机种 + 标题 + 时间 + 删除钮），
 * 差别只在：数据源是 `/api/user/history`、行内第二格显示的是**最近游玩时间**而不是大小。
 *
 * ⚠️ **为什么这里没有「大小」那半格**：历史只是个「玩过什么」的索引（存的是字符串快照），
 *    不像存档那样有实体文件。硬塞一个大小反而要后端多查一次。
 *
 * ⚠️ 点标题 / 缩略图跳 `/games/<id>`（理由同收藏 tab：这一页没有开玩需要的上下文）。
 */
function HistoryTab() {
  const { t, locale, href: localeHref } = useI18n();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [busyId, setBusyId] = useState<string | null>(null);
  /** 正处于「等待第二次确认」的那条 id。同 SavesTab 的两步删除。 */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  /** 「清空全部」是否已进入待确认态 */
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const requestId = useRef(0);

  /* 首屏拉一次。setState 一律放 .then/.catch（理由同 FavoritesTab 那个 effect）。 */
  useEffect(() => {
    const id = ++requestId.current;
    getJsonOnce<{ items: HistoryItem[] }>('/api/user/history')
      .then((data) => {
        if (requestId.current !== id) return;
        setItems(data.items);
        setState('ready');
      })
      .catch(() => {
        if (requestId.current !== id) return;
        setState('error');
      });
  }, []);

  /** 删单条。第一次点只是标成待确认。 */
  const requestDelete = (item: HistoryItem) => {
    if (busyId) return;
    setNotice(null);
    setConfirmingId(item.id);
  };

  /** 第二下才真删。 */
  const confirmDelete = async (item: HistoryItem) => {
    if (busyId) return;
    setBusyId(item.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/user/history/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(String(res.status));
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      setNotice({ tone: 'ok', text: t('account.historyDeleted') });
    } catch {
      setNotice({ tone: 'error', text: t('account.failed') });
    } finally {
      setBusyId(null);
      setConfirmingId(null);
    }
  };

  /** 清空全部。两下确认 —— 删完没法撤。 */
  const clearAll = async () => {
    if (busyId) return;
    setBusyId('__all__');
    setNotice(null);
    try {
      const res = await fetch('/api/user/history', { method: 'DELETE' });
      if (!res.ok) throw new Error(String(res.status));
      setItems([]);
      setNotice({ tone: 'ok', text: t('account.historyCleared') });
    } catch {
      setNotice({ tone: 'error', text: t('account.failed') });
    } finally {
      setBusyId(null);
      setConfirmingClear(false);
    }
  };

  if (state === 'loading') {
    return <ListRowSkeleton label={t('account.historyLoading')} />;
  }
  if (state === 'error') {
    return <p className="text-[12px] text-danger">{t('account.failed')}</p>;
  }
  if (items.length === 0) {
    return (
      <>
        {notice && (
          <p className={`mb-3 text-[12px] ${notice.tone === 'ok' ? 'text-ok' : 'text-danger'}`}>
            {notice.text}
          </p>
        )}
        <p className="text-[12px] text-ink-400">{t('account.historyEmpty')}</p>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-[12px] text-ink-400">
          {t('account.historyCount', { count: items.length })}
        </span>
        {notice && (
          <span className={`text-[12px] ${notice.tone === 'ok' ? 'text-ok' : 'text-danger'}`}>
            {notice.text}
          </span>
        )}
        <button
          type="button"
          disabled={busyId !== null}
          onClick={() => {
            setNotice(null);
            if (confirmingClear) void clearAll();
            else setConfirmingClear(true);
          }}
          className={`pixel-edge pxw-1 pxc-500 ml-auto shrink-0 px-1.5 py-0.5 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            confirmingClear
              ? 'bg-danger text-ink-950 hover:bg-danger/80'
              : 'bg-ink-700 text-ink-200 enabled:hover:text-danger'
          }`}
        >
          {t(confirmingClear ? 'account.confirmClearHistory' : 'account.clearHistory')}
        </button>
      </div>

      <ul className="flex flex-col divide-y-2 divide-ink-800">
        {items.map((item) => {
          const confirming = confirmingId === item.id;
          return (
            <li
              key={item.id}
              className="-mx-2 flex items-center gap-3 px-2 py-2.5 transition-colors hover:bg-ink-850"
            >
              {/* 封面缩略图（同存档那行），点它 / 点标题去详情页 */}
              <Link href={localeHref(`/games/${item.id}`)} className="shrink-0">
                <span className="block h-[52px] w-[38px] overflow-hidden bg-ink-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.imageUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </span>
              </Link>

              <span className="shrink-0 font-pixel text-[12px] text-ink-500">
                {consoleLabel(item.console, locale)}
              </span>

              <span className="min-w-0 flex-1">
                <Link
                  href={localeHref(`/games/${item.id}`)}
                  className="block truncate text-[12px] text-ink-100 transition-colors hover:text-accent"
                >
                  {localizeTexts(item.texts, locale).title}
                </Link>
                <span className="block truncate text-[12px] text-ink-500">
                  {formatTime(item.playedAt, locale)}
                </span>
              </span>

              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => (confirming ? void confirmDelete(item) : requestDelete(item))}
                className={`pixel-edge pxw-1 pxc-500 shrink-0 px-1.5 py-0.5 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  confirming
                    ? 'bg-danger text-ink-950 hover:bg-danger/80'
                    : 'bg-ink-700 text-ink-200 enabled:hover:text-danger'
                }`}
              >
                {t(confirming ? 'account.confirmDelete' : 'account.delete')}
              </button>
            </li>
          );
        })}
      </ul>

      {/*
        上限说明：和本地那份同口径（最近 N 款，不是全量流水）。
        ⚠️ 这里用前台可导的 `MAX_CARTRIDGES`（lib/library.ts），**不是**服务端的 `MAX_HISTORY`
        （在 lib/server/user-data.ts，客户端不能 import 它）。两者数值一致、注释里互相点名。
      */}
      <p className="text-[12px] leading-relaxed text-ink-500">
        {t('account.historyHint', { max: MAX_CARTRIDGES })}
      </p>
    </div>
  );
}

/* ================================================================== *
 * tab 3：存档
 * ================================================================== */

function SavesTab() {
  const { t, locale, href: localeHref } = useI18n();
  const [items, setItems] = useState<SaveOverviewItem[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [busyId, setBusyId] = useState<string | null>(null);
  /** 正处于「等待第二次确认」的那条 id（单份删除），同 AdminUsers 的两步删除 */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  /** 「清空全部」是否已进入待确认态 */
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const requestId = useRef(0);

  /* 首屏拉一次。setState 一律放 .then/.catch（理由同 FavoritesTab 那个 effect）。 */
  useEffect(() => {
    const id = ++requestId.current;
    getJsonOnce<{ items: SaveOverviewItem[] }>('/api/user/saves/all')
      .then((data) => {
        if (requestId.current !== id) return;
        setItems(data.items);
        setState('ready');
      })
      .catch(() => {
        if (requestId.current !== id) return;
        setState('error');
      });
  }, []);

  /** 删单份。第一次点只是标成待确认。 */
  const requestDelete = (item: SaveOverviewItem) => {
    if (busyId) return;
    setNotice(null);
    setConfirmingId(item.id);
  };

  /** 第二下才真删。 */
  const confirmDelete = async (item: SaveOverviewItem) => {
    if (busyId) return;
    setBusyId(item.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/user/saves/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(String(res.status));
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      setNotice({ tone: 'ok', text: t('account.saveDeleted') });
    } catch {
      setNotice({ tone: 'error', text: t('account.failed') });
    } finally {
      setBusyId(null);
      setConfirmingId(null);
    }
  };

  /** 清空全部。两下确认 —— 删的是 R2 上的对象，没法撤。 */
  const clearAll = async () => {
    if (busyId) return;
    setBusyId('__all__');
    setNotice(null);
    try {
      const res = await fetch('/api/user/saves/all', { method: 'DELETE' });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { removed?: number };
      setItems([]);
      setNotice({ tone: 'ok', text: t('account.savesCleared', { count: data.removed ?? 0 }) });
    } catch {
      setNotice({ tone: 'error', text: t('account.failed') });
    } finally {
      setBusyId(null);
      setConfirmingClear(false);
    }
  };

  if (state === 'loading') {
    return <ListRowSkeleton label={t('account.savesLoading')} />;
  }
  if (state === 'error') {
    return <p className="text-[12px] text-danger">{t('account.failed')}</p>;
  }
  if (items.length === 0) {
    return (
      <>
        {notice && (
          <p className={`mb-3 text-[12px] ${notice.tone === 'ok' ? 'text-ok' : 'text-danger'}`}>
            {notice.text}
          </p>
        )}
        <p className="text-[12px] text-ink-400">{t('account.savesEmpty')}</p>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-[12px] text-ink-400">
          {t('account.savesCount', { count: items.length })}
        </span>
        {notice && (
          <span className={`text-[12px] ${notice.tone === 'ok' ? 'text-ok' : 'text-danger'}`}>
            {notice.text}
          </span>
        )}
        <button
          type="button"
          disabled={busyId !== null}
          onClick={() => {
            setNotice(null);
            if (confirmingClear) void clearAll();
            else setConfirmingClear(true);
          }}
          className={`pixel-edge pxw-1 pxc-500 ml-auto shrink-0 px-1.5 py-0.5 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            confirmingClear
              ? 'bg-danger text-ink-950 hover:bg-danger/80'
              : 'bg-ink-700 text-ink-200 enabled:hover:text-danger'
          }`}
        >
          {t(confirmingClear ? 'account.confirmClearSaves' : 'account.clearSaves')}
        </button>
      </div>

      <ul className="flex flex-col divide-y-2 divide-ink-800">
        {items.map((item) => {
          const title = localizeTexts(item.texts, locale).title;
          const confirming = confirmingId === item.id;
          return (
            <li key={item.id} className="-mx-2 flex items-center gap-3 px-2 py-2.5 transition-colors hover:bg-ink-850">
              <Link
                href={localeHref(`/games/${item.gameId}`)}
                aria-label={t('account.viewGame', { name: title })}
                className="flex min-w-0 flex-1 items-center gap-3 text-left hover:text-accent"
              >
                <span className="block h-[52px] w-[38px] shrink-0 overflow-hidden bg-ink-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                </span>
                <span className="shrink-0 font-pixel text-[12px] text-ink-500">
                  {consoleLabel(item.consoleType, locale)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] text-ink-100">{title}</span>
                  <span className="block truncate text-[12px] text-ink-500">
                    {formatTime(item.createdAt, locale)} · {formatBytes(item.size)}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => (confirming ? void confirmDelete(item) : requestDelete(item))}
                className={`pixel-edge pxw-1 pxc-500 shrink-0 px-1.5 py-0.5 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  confirming
                    ? 'bg-danger text-ink-950 hover:bg-danger/80'
                    : 'bg-ink-700 text-ink-200 enabled:hover:text-danger'
                }`}
              >
                {t(confirming ? 'account.confirmDelete' : 'account.delete')}
              </button>
            </li>
          );
        })}
      </ul>

      {/*
        存档制式说明。这一页是**总览**，用户会好奇「为什么只剩一份了」——
        答案在 lib/saves.ts：每款游戏只保留最新一份即时存档，
        再存就是覆盖。文案里不写死「1」，免得哪天规则变了这里说谎。
      */}
      <p className="text-[12px] leading-relaxed text-ink-500">
        {t('account.savesHint')}
      </p>
    </div>
  );
}

/* ================================================================== *
 * tab 4：评论（自己写的）
 * ================================================================== */

/** 拉一页「我的评论」。游标口径和服务端一致（`created_at:id`，不透明地传回去就行）。 */
async function fetchMyComments(
  cursor: string | null
): Promise<{ items: MyCommentItem[]; nextCursor: string | null }> {
  const query = cursor
    ? `?cursor=${encodeURIComponent(cursor)}&limit=${MY_COMMENTS_PAGE_SIZE}`
    : `?limit=${MY_COMMENTS_PAGE_SIZE}`;
  return getJsonOnce<{ items: MyCommentItem[]; nextCursor: string | null }>(
    `/api/user/comments${query}`
  );
}

/**
 * 「我的评论」—— 2026-11-06 加（用户要求「个人中心也加一个评论 tab 看自己的评论」）。
 *
 * 数据源 `/api/user/comments`（只有 GET）。**删除直接复用作者那条路**
 * （`DELETE /api/comments/<id>`，数据层的 WHERE 带 `user_id`）—— 不另开一个
 * 「我的删除」接口：同一条规则只该有一个出口，两处判权迟早会漏一处。
 *
 * 版式照「历史」那套：一列行、`divide-y`、行右侧一颗两步删除钮。差别是这里没有
 * 封面缩略图（评论的重点是文字），游戏名本身是链接，点进去能看上下文。
 *
 * 翻页是**按钮触发**（同历史 / 存档）：这一屏的操作是「一条条回看、看不顺眼删掉」，
 * 滚着滚着自动续一屏反而让人分不清自己看到哪了。
 *
 * ⚠️ 列表里那条 `<Link>` 必须 `prefetch={false}`：一页十条，开着预取等于每次进这一屏
 *    都额外渲染十个详情页的 RSC（项目里列表型链接一律如此，见 MEMORY.md）。
 */
function CommentsTab() {
  const { t, locale, href: localeHref } = useI18n();
  const [items, setItems] = useState<MyCommentItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [moreState, setMoreState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [busyId, setBusyId] = useState<string | null>(null);
  /** 正处于「等待第二次确认」的那条 id。同历史 / 存档的两步删除。 */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const requestId = useRef(0);

  /* 首屏拉一次。setState 一律放 .then/.catch（理由同 FavoritesTab 那个 effect）。 */
  useEffect(() => {
    const id = ++requestId.current;
    fetchMyComments(null)
      .then((page) => {
        if (requestId.current !== id) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setState('ready');
      })
      .catch(() => {
        if (requestId.current !== id) return;
        setState('error');
      });
  }, []);

  const loadMore = () => {
    if (!nextCursor || moreState === 'loading') return;
    setMoreState('loading');
    fetchMyComments(nextCursor)
      .then((page) => {
        setItems((prev) => [...prev, ...page.items]);
        setNextCursor(page.nextCursor);
        setMoreState('idle');
      })
      .catch(() => setMoreState('error'));
  };

  /** 第一次点只是标成待确认。 */
  const requestDelete = (item: MyCommentItem) => {
    if (busyId) return;
    setNotice(null);
    setConfirmingId(item.id);
  };

  /** 第二下才真删。 */
  const confirmDelete = async (item: MyCommentItem) => {
    if (busyId) return;
    setBusyId(item.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/comments/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(String(res.status));
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      setNotice({ tone: 'ok', text: t('comments.deleted') });
    } catch {
      setNotice({ tone: 'error', text: t('comments.deleteFailed') });
    } finally {
      setBusyId(null);
      setConfirmingId(null);
    }
  };

  if (state === 'loading') {
    return <ListRowSkeleton label={t('comments.loading')} />;
  }
  if (state === 'error') {
    return <p className="text-[12px] text-danger">{t('account.failed')}</p>;
  }
  if (items.length === 0) {
    return (
      <>
        {notice && (
          <p className={`mb-3 text-[12px] ${notice.tone === 'ok' ? 'text-ok' : 'text-danger'}`}>
            {notice.text}
          </p>
        )}
        <p className="text-[12px] text-ink-400">{t('account.commentsEmpty')}</p>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {notice && (
        <p className={`text-[12px] ${notice.tone === 'ok' ? 'text-ok' : 'text-danger'}`}>
          {notice.text}
        </p>
      )}

      <ul className="flex flex-col divide-y-2 divide-ink-800">
        {items.map((item) => {
          const confirming = confirmingId === item.id;
          return (
            <li
              key={item.id}
              className="-mx-2 flex items-start gap-3 px-2 py-2.5 transition-colors hover:bg-ink-850"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {/* 游戏名可能是中文 —— 走系统字体，不套 font-pixel（像素字模没有 CJK） */}
                  <Link
                    href={localeHref(`/games/${item.gameId}`)}
                    prefetch={false}
                    className="block truncate text-[12px] text-ink-100 transition-colors hover:text-accent"
                  >
                    {item.gameTitle ?? item.gameId}
                  </Link>
                  {/*
                    这一条的星。`repeat` 夹一下上下界，脏数据（理论上进不来）也不会
                    把那一行撑破。实心走强调色、空心走灰 —— 两端分开画所以是两层。
                    图形本身 `aria-hidden`，真正的分数由后面那句 `sr-only` 念出来。
                  */}
                  <span
                    className="star-glyph text-[13px] leading-none text-accent"
                    aria-hidden="true"
                  >
                    {'★'.repeat(Math.min(item.rating, RATING_MAX))}
                    <span className="text-ink-600">
                      {'☆'.repeat(Math.max(0, RATING_MAX - item.rating))}
                    </span>
                  </span>
                  <span className="sr-only">
                    {t('comments.ratingValue', { n: item.rating })}
                  </span>
                </div>
                {/* 正文可能多行 —— 系统字体 + 换行，不做 truncate */}
                <p className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-ink-300">
                  {item.content}
                </p>
                <span className="mt-1 block text-[12px] text-ink-500">
                  {formatTime(item.createdAt, locale)}
                </span>
              </div>

              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => (confirming ? void confirmDelete(item) : requestDelete(item))}
                className={`pixel-edge pxw-1 pxc-500 shrink-0 px-1.5 py-0.5 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  confirming
                    ? 'bg-danger text-ink-950 hover:bg-danger/80'
                    : 'bg-ink-700 text-ink-200 enabled:hover:text-danger'
                }`}
              >
                {t(confirming ? 'comments.deleteConfirm' : 'comments.delete')}
              </button>
            </li>
          );
        })}
      </ul>

      {nextCursor && (
        <button
          type="button"
          disabled={moreState === 'loading'}
          onClick={loadMore}
          className="pixel-edge pxw-1 pxc-500 self-start px-2 py-1 text-[12px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {moreState === 'loading'
            ? t('account.loading')
            : moreState === 'error'
              ? t('account.failed')
              : t('comments.loadMore')}
        </button>
      )}
    </div>
  );
}

/* ================================================================== *
 * tab 5：密码
 * ================================================================== */

/**
 * 改密码：旧密码 + 新密码 + 确认新密码。
 *
 * ⚠️ 这一页**只干这一件事**，所以不再需要 `user`（改密码不依赖任何资料字段）。
 *    表单提交成功后清空三个输入框 —— 留着旧密码在框里没有意义，
 *    而新密码留在框里更是纯粹的隐患。
 *
 * ⚠️ 改完之后**这台设备仍然登着**（会话令牌是无状态的，服务端不吊销）——
 *    这一点必须写在 hint 里，否则用户会以为要重新登录。
 */
function PasswordTab() {
  const { t } = useI18n();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  /** 服务端错误码 → 文案键。 */
  const messageOf = (code: string) => {
    const keys: Record<string, MessageKey> = {
      'wrong-password': 'account.error.wrongPassword',
      'password-too-short': 'account.error.passwordTooShort',
      'password-too-long': 'account.error.passwordTooLong',
      'password-has-space': 'account.error.passwordHasSpace',
      'missing-old-password': 'account.error.missingOld',
    };
    const key = keys[code];
    return key ? t(key) : t('account.failed');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;

    /*
     * 两次输入是否一致**在客户端先判**（服务端只看 newPassword 一个值，
     * 它不知道「确认」这个字段的存在）。这一条是本地的表单校验，不是安全边界。
     */
    if (newPassword !== confirm) {
      setNotice({ tone: 'error', text: t('account.error.mismatch') });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/user/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? '');
      setOldPassword('');
      setNewPassword('');
      setConfirm('');
      setNotice({ tone: 'ok', text: t('account.passwordSaved') });
    } catch (error) {
      setNotice({
        tone: 'error',
        text: messageOf(error instanceof Error ? error.message : ''),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/*
        这一页整体不用 <section> 包标题 —— 标题就是 tab 本身（「密码」），
        再在外面写一遍「密码」纯属重复。表单自己带着三个字段标签就够清楚了。
      */}
      <form onSubmit={submit} className="flex max-w-[360px] flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-ink-400">{t('account.oldPassword')}</span>
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            autoComplete="current-password"
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-ink-400">{t('account.newPassword')}</span>
          {/*
            新口令**顺手吃掉空白字符**（2026-10-13 用户要求「移除空格输入」，与注册页一致）。
            服务端也会回 `password-has-space`（见 lib/server/app-users.ts），这里先过滤一道。
            ⚠️ **上面那个「当前密码」不要跟着过滤** —— 老账号的口令里可能真带空格
               （禁空格之前建的号），过滤掉就是「明明输对了改不了」。
          */}
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value.replace(/\s/g, ''))}
            placeholder={t('user.passwordHint')}
            autoComplete="new-password"
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-ink-400">{t('account.confirmPassword')}</span>
          {/* 确认框同样过滤 —— 否则这里多敲一个空格就和上面那个「永远对不上」 */}
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\s/g, ''))}
            autoComplete="new-password"
            className={FIELD_CLASS}
          />
        </label>

        {notice && (
          <span className={`text-[12px] ${notice.tone === 'ok' ? 'text-ok' : 'text-danger'}`}>
            {notice.text}
          </span>
        )}

        <button
          type="submit"
          disabled={busy}
          className="pixel-edge pxw-2 pxc-500 mt-1 self-start bg-accent px-3 py-1.5 text-[12px] text-ink-950 transition-colors enabled:hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? t('account.saving') : t('account.savePassword')}
        </button>
      </form>
      <p className="text-[12px] leading-relaxed text-ink-500">{t('account.passwordHint')}</p>
      <p className="text-[12px] leading-relaxed text-ink-500">{t('account.passwordTabHint')}</p>
    </div>
  );
}
