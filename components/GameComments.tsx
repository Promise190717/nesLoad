'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { formatTime } from '@/lib/i18n';
import { useI18n } from './I18nProvider';

/**
 * 详情页的**评论模块**（2026-10-13 加，用户要求「详情页面详情模块下方再增加一个评论模块」）。
 *
 * 版式：**发表框在上、列表在下**。
 *   · 和留言本（`FeedbackPanel`，列表在上、提交框在下）**故意反着** —— 那本子是一张纸，
 *     写完就翻走了；这里新评论会**插到列表最前面**，框在最上面才看得见自己刚发的那条。
 *   · 也正因为这个方向，评论列表是「新的在前」（翻页游标也按这个序走）。
 *
 * 登录态随私有评论 API 返回，不再由详情页读取 Cookie，公共 HTML 可以安全缓存。
 * 真正的写入鉴权仍由 POST 接口的 assertUser 执行。
 *
 * 未登录那颗链接把 `?next=` 带上（`/games/<id>`，**不带语言前缀**，
 * 拼前缀是登录页的事，见 `components/LoginPanel.tsx`），登录完直接回这一页。
 *
 * 评论列表每次从私有 API 获取最新结果。
 *    只留一层 **in-flight 去重**：StrictMode 会把 effect 跑两遍，没有它就白发一次请求。
 *
 * 删评论是**两步**（先「删除」再「确认」）：这是一条不可撤销的公开内容，
 * 误点一下就没了比多点一下更糟。只有 `mine` 的那几条才画这组钮（服务端判的）。
 *
 * **星级（1..5）**：2026-10-13 用户要求「评论有星星 1-5」。打分和正文是**同一次提交** ——
 *   · 发表框里先选星，**默认满星 5**（用户后一条要求「默认五星」）。原先那版是**默认 0、
 *     必须自己点才亮**，理由写在当时：默认满星会让「忘了改」和「真的给 5 星」分不开 ——
 *     这个风险现在是被明确接受掉的，别再自作主张改回去。
 *   · 守卫仍然在：星数不在 1..5 就吃一句「先给个星数吧」，和「写点什么再发表吧」同一条路
 *     （都是提示而不是把按钮变灰，两处口径一致）—— 界面上够不着，接口那道是真的。
 *   · 发表框里那排星 **24px + `star-glyph`**、整行**下留 4px**
 *     （2026-10-13 用户两次要求放大：「星星大一点 / 加点下间距」→「保持现在的样式、增大大小」；
 *     字号 14 → 18 → 24，**只动字号**，字符与字体栈从没换过）。
 *   · 列表里每条的星挂在**用户名后面**（挨着时间）：`'★'.repeat()` 打头、空心 `☆` 补位，
 *     **14px**（同一次放大里从 10px 提上来的）。标题那颗均分星 **13px**（原本跟父级 10px）。
 *   · 星是**字符**（★ / ☆），所以**处处都要带 `.star-glyph`**（app/globals.css 那个类）：
 *     主字体没有这两个字形，浏览器会**按文档语言**挑兜底字体 —— `zh` 落到中文字体
 *     （全角、大），`en` 落到西文/符号字体（同字号只画一小团）。用户报过
 *     「英文下星星还是小的」，把 CJK 字体排在栈首，两种语言就一致了。
 *     ⚠️ **别再改成画出来的图形**：试过一版像素星（`StarIcon`），尺寸是两边一致了，
 *     但用户嫌那是「马赛克」，当天就撤了。要动星形先问一声。
 *   · 标题旁边那个 **均分** 来自接口的全量汇总（`summary`），**不是**这一页 items 算的 ——
 *     列表是分页的，拿当前页算会随「加载更多」一路往下掉（见 lib/server/comments.ts）。
 *     它显示成数字（`4.3 / 5`）而不是一排星：4.3 颗星画不出来，半颗星在像素风里是糊的。
 *   · 发表 / 删除后**顺手把汇总也乐观挪一下**（`shiftSummary`）—— 列表都乐观更新了，
 *     标题那个数不跟着动就露馅了。
 */

/** `/api/games/<id>/comments` 返回的一条（字段与路由里的 `publicItem` 对齐，**没有 user_id**）。 */
interface CommentItem {
  id: string;
  username: string;
  avatarUrl: string | null;
  content: string;
  /** 星级 1..5 */
  rating: number;
  createdAt: number;
  /** 是不是当前登录者写的 —— 决定要不要画「删除」 */
  mine: boolean;
}

/** 一款游戏的评分汇总（字段与 `GET /api/games/<id>/comments` 的 `summary` 对齐）。 */
interface RatingSummary {
  /** 均分（原始精度，展示时 `toFixed(1)`）；没人评过是 0 */
  average: number;
  count: number;
}

interface CommentPage {
  signedIn: boolean;
  items: CommentItem[];
  nextCursor: string | null;
  summary: RatingSummary;
}

type Notice = { tone: 'ok' | 'error'; text: string };

/**
 * 每页多少条 / 正文上限 / 星级区间。
 *
 * ⚠️ 都要**和后端保持一致**（`COMMENT_PAGE_SIZE` / `COMMENT_MAX_LENGTH` / `RATING_MIN` /
 *    `RATING_MAX`，见 lib/server/comments.ts），但**不能从那边 import**：那个模块引了
 *    `node:crypto` 和 D1 客户端，是纯服务端的，拉进客户端 bundle 会把一堆东西一起带进来
 *    （同 ReportGameButton / FeedbackPanel 的处理）。
 */
const PAGE_SIZE = 10;
const MAX_LENGTH = 500;
const RATING_MIN = 1;
const RATING_MAX = 5;

/** 5 颗星的刻度（1..5）。由区间推出来，改区间不用动这里。 */
const STARS: number[] = Array.from(
  { length: RATING_MAX - RATING_MIN + 1 },
  (_, index) => RATING_MIN + index
);

/**
 * 汇总的乐观增减：发一条 `delta = +1`、删一条 `delta = -1`。
 *
 * 均分要按**总分**回推（`平均 × 人数 ± 这条的分`），只挪 count 会让均分对不上。
 * `count` 归零时连同均分一起清零 —— AVG 在 0 行上的语义就是「没有」，别留个假数字。
 */
function shiftSummary(
  summary: RatingSummary,
  rating: number,
  delta: 1 | -1
): RatingSummary {
  const count = Math.max(0, summary.count + delta);
  if (count === 0) return { average: 0, count: 0 };
  const total = summary.average * summary.count + delta * rating;
  return { average: total / count, count };
}

/**
 * 正在路上的请求。**同一次挂载里 StrictMode 会把 effect 跑两遍**，靠它去重。
 * 按完整 URL 作键；失败的不留在里面，所以「重试」仍然会真的重发。
 */
const inflight = new Map<string, Promise<CommentPage>>();

function loadPage(gameId: string, cursor: string | null): Promise<CommentPage> {
  const query = `limit=${PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  const url = `/api/games/${encodeURIComponent(gameId)}/comments?${query}`;

  const pending = inflight.get(url);
  if (pending) return pending;

  const request = fetch(url)
    .then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as CommentPage;
    })
    .finally(() => {
      inflight.delete(url);
    });

  inflight.set(url, request);
  return request;
}

export default function GameComments({
  gameId,
  signInHref,
}: {
  gameId: string;
  /** 服务端读 cookie 判出来的登录态（只验签名，不查库） */
  /** 未登录时那颗「去登录」的落点，**已经带好 `?next=`**（由详情页拼） */
  signInHref: string;
}) {
  const { t, locale } = useI18n();

  const [signedIn, setSignedIn] = useState(false);
  const [items, setItems] = useState<CommentItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  /**
   * 均分 / 评分数。初值给 `{ average: 0, count: 0 }`（「还没读到」和「没人评过」
   * 在这一页画出来是一样的 —— 都不显示那个数，所以不另设 null 态）。
   */
  const [summary, setSummary] = useState<RatingSummary>({ average: 0, count: 0 });
  /** 首屏三态：loading / ready / error。「加载更多」另有 `loadingMore`，别混用。 */
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const [draft, setDraft] = useState('');
  /**
   * 选中的星数。**初值 = 满星 5**（2026-10-13 用户要求「默认五星」，改掉了原先那版
   * 「不预设、必须自己点」的取舍）—— 好处是永远有一个明确的值，代价是「懒得改」
   * 会把分数往上抬，这个风险是明知故犯的。
   */
  const [rating, setRating] = useState(RATING_MAX);
  /** 鼠标悬停时的高亮预览（0 = 没悬停）。只影响画出来的星星，不影响 `rating` */
  const [hoverRating, setHoverRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  /** 正在等你按「确认删除」的那一条（同一时刻只留一条） */
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [notice, setNotice] = useState<Notice | null>(null);

  // 首屏。setState 一律放 .then/.catch —— 直接在 effect 体里同步 setState 会被
  // react-hooks/set-state-in-effect 拦下（同 FeedbackPanel）。
  useEffect(() => {
    let cancelled = false;
    loadPage(gameId, null)
      .then((page) => {
        if (cancelled) return;
        setSignedIn(page.signedIn);
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setSummary(page.summary);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  // 提示过一会儿自己收回去（同 FavoriteButton 那颗收藏钮的节奏）
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const content = draft.trim();
    if (!content) {
      setNotice({ tone: 'error', text: t('comments.required') });
      return;
    }
    // 星级必填。和正文那条一样是**提示**而不是把按钮变灰（口径统一，见文件头）
    if (rating < RATING_MIN || rating > RATING_MAX) {
      setNotice({ tone: 'error', text: t('comments.ratingRequired') });
      return;
    }

    setSubmitting(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(gameId)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, rating }),
      });
      if (!res.ok) {
        /*
         * 服务端的 `detail` 更具体（「最多 500 个字」这种），有就用它；
         * 401/403（会话过期 / 账号被封）没有 detail，给一句「请重新登录」——
         * 那是这两档唯一能做的动作。
         */
        const data = (await res.json().catch(() => null)) as { detail?: string } | null;
        const needsSignIn = res.status === 401 || res.status === 403;
        throw new Error(data?.detail ?? (needsSignIn ? t('comments.signInRequired') : t('comments.failed')));
      }

      const data = (await res.json()) as { item: CommentItem };
      /*
       * 成功不重拉列表，**直接插到最前面** —— 列表本来就是新的在前，重拉只会闪一下。
       * `nextCursor` 不动：它指着原来那页的最后一条，新条比它新，翻下一页不会重复。
       * 汇总同步挪一格（标题那个均分 / 人数立刻跟上），这也是不重拉的原因之一。
       */
      setItems((prev) => [data.item, ...prev]);
      setSummary((prev) => shiftSummary(prev, data.item.rating, 1));
      setDraft('');
      // 星回到默认满星（下一条重新从 5 起，用户想降自己点）
      setRating(RATING_MAX);
      setHoverRating(0);
      setNotice({ tone: 'ok', text: t('comments.ok') });
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : t('comments.failed'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await loadPage(gameId, nextCursor);
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
      // 汇总跟着刷新（翻页时它其实没变，但接口给了就收下 —— 别让它有机会变旧）
      setSummary(page.summary);
    } catch {
      setNotice({ tone: 'error', text: t('comments.loadFailed') });
    } finally {
      setLoadingMore(false);
    }
  };

  const remove = async (id: string) => {
    if (deletingId) return;
    /*
     * 乐观更新：先把这一行拿掉，失败再整份放回去（同 FavoriteButton 的乐观口径）。
     * 存的是「点下去那一刻」的整份列表 —— 失败回滚之后不会丢别的行。
     * 汇总也要存一份：删掉的那条带着一个星级，回滚时得原样还回去。
     */
    const backup = items;
    const backupSummary = summary;
    const victim = items.find((comment) => comment.id === id);
    setPendingDelete(null);
    setDeletingId(id);
    setItems((prev) => prev.filter((comment) => comment.id !== id));
    if (victim) setSummary((prev) => shiftSummary(prev, victim.rating, -1));
    try {
      const res = await fetch(`/api/comments/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(String(res.status));
      setNotice({ tone: 'ok', text: t('comments.deleted') });
    } catch {
      setItems(backup);
      setSummary(backupSummary);
      setNotice({ tone: 'error', text: t('comments.deleteFailed') });
    } finally {
      setDeletingId(null);
    }
  };

  /*
   * 标题旁边那个数：**接口给的全量评分数**（`summary.count`），和列表载入了几条无关 ——
   * 以前那个「只在全部载完才敢报」的写法是为了不误导，现在有全量汇总了就不需要那个限制了。
   */
  const total = summary.count;

  return (
    <section className="mt-10 border-t border-ink-800 pt-6" aria-labelledby="game-comments-heading">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {/*
          标题：**14px + `font-semibold`**（2026-10-13 用户要求「字号大点 加粗」）。
          粗度走 `font-semibold` 而不是 `font-bold` —— 全站没有一处 `font-bold`，
          连页面 h1（GamesShell，22px）都是 semibold，这里跟同一个口径。
          字色不动（还是 ink-200）：放大 + 加粗已经够压住旁边那行小字了，别一次动三样。
        */}
        <h2 id="game-comments-heading" className="text-[14px] font-semibold text-ink-200">
          {t('comments.heading')}
        </h2>
        {/*
          均分 + 人数。**均分在前、颜色压过标题**（它是这一块最想让人一眼看到的数），
          星只有**一颗**（不做「4.3 颗星」那种半星画法，像素风里半颗星是糊的 —— 见文件头）。
          没人评过（count = 0）时整块不出现，只留标题。
        */}
        {total > 0 && (
          <span className="flex items-baseline gap-1.5 text-[12px] text-ink-500">
            {/*
              这一颗单独给了 **13px**（原来是跟着父级 10px）：2026-10-13 用户要求
              「增大星星的大小」，它是「均分」的标记物、和发表框/列表那两处是一套，
              只放大那两处会让这一颗显得是掉队的。13px 略小于标题的 14px，
              不至于盖过标题；`items-baseline` 下不同字号仍按基线对齐，不会顶歪。
            */}
            <span aria-hidden="true" className="star-glyph text-[13px] text-accent">
              ★
            </span>
            <span className="text-ink-200">
              {t('comments.ratingAverage', { avg: summary.average.toFixed(1) })}
            </span>
            <span aria-hidden="true">·</span>
            <span>{t('comments.count', { n: total })}</span>
          </span>
        )}
      </div>

      {/* 任何动作的反馈都落这一行（发表成功 / 删除 / 载入更多失败）—— 公开内容不该悄悄变化 */}
      {notice && (
        <p
          role="status"
          className={`mt-3 text-[12px] ${notice.tone === 'ok' ? 'text-ok' : 'text-danger'}`}
        >
          {notice.text}
        </p>
      )}

      {/*
        发表区。**登录才有框** —— 未登录就只给一句话加一颗链接，不画一个点不动 /
        点了才报错的输入框（那是在骗人）。已登录但会话在这里过期的情况由 POST 兜住。
      */}
      {signedIn ? (
        <form onSubmit={(event) => void submit(event)} className="mt-4 flex flex-col gap-2">
          {/*
            打分排在正文**前面**：先说「给几分」再说「为什么」—— 这也让它在视觉上
            和下面那行「计数 + 发表钮」分开，不会被当成正文的一部分。
            `role="group"` + 每颗一个 `aria-pressed`：读屏会念「打 3 星，已按下」。
            悬停 / 键盘聚焦都给预览高亮（`hoverRating`），离开就回到已选值。
          */}
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[12px] text-ink-500">{t('comments.ratingLabel')}</span>
            <span
              role="group"
              aria-label={t('comments.ratingLabel')}
              className="flex items-center"
              onMouseLeave={() => setHoverRating(0)}
            >
              {STARS.map((star) => {
                const filled = star <= (hoverRating || rating);
                return (
                  <button
                    key={star}
                    type="button"
                    disabled={submitting}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onFocus={() => setHoverRating(star)}
                    onBlur={() => setHoverRating(0)}
                    aria-pressed={rating === star}
                    aria-label={t('comments.ratingStar', { n: star })}
                    title={t('comments.ratingStar', { n: star })}
                    /*
                     * 尺寸：**24px**（2026-10-13 用户第二次要求放大：「保持现在这个星星的样式
                     * 增大星星的大小」；14 → 18 → 24，一路只动字号，字符和字体栈从没变过）。
                     * 左右内边距 **`px-0.5`（2px）**：字号提到 24 之后，原先 `px-1.5` 的
                     * 12px 缝隙看着像散开的（同一行 5 颗星连不成一排），跟着放大一起收到
                     * **4px**（2026-10-13 的搭配微调，不是单独一条需求 —— 觉得太挤就说一声）。
                     * 现在两颗之间 4px、每颗点击区 ~28×32 —— `★` 在 CJK 字体里是全角、
                     * 本来就占满 24px 宽，上下 `py-1` 留着不缩（那 4px 是给悬停高亮留的气口）。
                     * `star-glyph` 是必须的：星是**字符**，不锁字体栈的话中英文会一大一小
                     * （用户报过「英文下星星还是小的」，根因写在 app/globals.css 那个类上）。
                     */
                    className={`star-glyph px-0.5 py-1 text-[24px] leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      filled ? 'text-accent' : 'text-ink-600 hover:text-accent/70'
                    }`}
                  >
                    {filled ? '★' : '☆'}
                  </button>
                );
              })}
            </span>
            {rating > 0 && (
              <span className="text-[12px] text-ink-500">
                {t('comments.ratingValue', { n: rating })}
              </span>
            )}
          </div>

          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={MAX_LENGTH}
            rows={3}
            disabled={submitting}
            placeholder={t('comments.placeholder')}
            className="pixel-edge pxw-2 pxc-500 w-full resize-none bg-ink-900 px-2 py-2 text-[12px] leading-relaxed text-ink-100 placeholder:text-ink-600 focus:outline-none disabled:opacity-60"
          />
          <div className="flex items-center gap-3">
            {/* 计数走系统字体（同 FeedbackPanel）：font-pixel 里没有斜杠以外的排版符号 */}
            <span className="text-[12px] text-ink-500">
              {draft.length}/{MAX_LENGTH}
            </span>
            <button
              type="submit"
              disabled={submitting}
              className="pixel-edge pxw-2 pxc-600 ml-auto bg-accent px-4 py-1.5 text-[12px] text-ink-950 transition-colors enabled:hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? t('comments.submitting') : t('comments.submit')}
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-400">
          {t('comments.signInLead')}
          {/*
            ⚠️ **关掉预取**（2026-10-19，理由同 `components/TopBar.tsx` 那两颗）：
            登录页读 cookie（动态渲染），预取只能拿回一份空的布局壳，而每个进详情页的人
            都会白发两条（带 `?next=` 的一条 + 不带 query 的壳）。点下去多等的那一个往返
            本来就躲不掉。
          */}
          <Link
            href={signInHref}
            prefetch={false}
            className="text-accent transition-colors hover:underline"
          >
            {t('comments.signIn')} →
          </Link>
        </p>
      )}

      {/* 列表 */}
      <div className="mt-6">
        {state === 'loading' && <p className="text-[12px] text-ink-500">{t('comments.loading')}</p>}

        {state === 'error' && (
          <div className="flex items-center gap-3">
            <p className="text-[12px] text-danger">{t('comments.loadFailed')}</p>
            {/* 重试 = 原地重来一次。失败的那次没进 in-flight 表，所以会真的重发 */}
            <button
              type="button"
              onClick={() => {
                setState('loading');
                loadPage(gameId, null)
                  .then((page) => {
                    setItems(page.items);
                    setNextCursor(page.nextCursor);
                    setState('ready');
                  })
                  .catch(() => setState('error'));
              }}
              className="pixel-edge pxw-2 pxc-500 bg-ink-800 px-2.5 py-1 text-[12px] text-ink-300 transition-colors hover:text-accent"
            >
              {t('comments.retry')}
            </button>
          </div>
        )}

        {state === 'ready' && items.length === 0 && (
          <p className="text-[12px] text-ink-500">{t('comments.empty')}</p>
        )}

        {items.length > 0 && (
          <ul className="flex flex-col gap-5">
            {items.map((comment) => (
              <li key={comment.id} className="flex gap-3">
                <CommentAvatar url={comment.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-[12px] text-ink-200">{comment.username}</span>
                    {/*
                      这一条的星。`repeat` 夹一下上下界，脏数据（理论上进不来）也不会
                      把那一行撑破。实心走强调色、空心走灰 —— 两端分开画所以是两层。
                      `star-glyph` 同上：不给它锁字体栈，英文下这一排会缩水。
                      图形本身 `aria-hidden`，真正的分数由后面那句 `sr-only` 念出来。
                    */}
                    <span className="star-glyph text-[14px] leading-none text-accent" aria-hidden="true">
                      {'★'.repeat(Math.min(comment.rating, RATING_MAX))}
                      <span className="text-ink-600">
                        {'☆'.repeat(Math.max(0, RATING_MAX - comment.rating))}
                      </span>
                    </span>
                    <span className="sr-only">{t('comments.ratingValue', { n: comment.rating })}</span>
                    <span className="text-[12px] text-ink-500">
                      {formatTime(comment.createdAt, locale)}
                    </span>
                    {/*
                      删自己的那条：**两步**（先「删除」再「确认」）。这是不可撤销的公开内容，
                      误点一下就没了比多点一下更糟。只有 `mine` 的才画（服务端判的）。
                    */}
                    {comment.mine &&
                      (pendingDelete === comment.id ? (
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={deletingId === comment.id}
                            onClick={() => void remove(comment.id)}
                            className="text-[12px] text-danger transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {t('comments.deleteConfirm')}
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === comment.id}
                            onClick={() => setPendingDelete(null)}
                            className="text-[12px] text-ink-500 transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {t('comments.cancel')}
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPendingDelete(comment.id)}
                          className="text-[12px] text-ink-500 transition-colors hover:text-danger"
                        >
                          {t('comments.delete')}
                        </button>
                      ))}
                  </div>
                  {/*
                    正文：系统字体、`whitespace-pre-wrap`（留言里换的行要留着）
                    + `break-words`（一串长英文/URL 不许把版心撑破）。
                  */}
                  <p className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-6 text-ink-300">
                    {comment.content}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* 翻页只有一个方向（新的在前，只能往后翻），所以是「加载更多」而不是上一页/下一页 */}
        {nextCursor && (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void loadMore()}
            className="pixel-edge pxw-2 pxc-500 mt-5 bg-ink-800 px-4 py-1.5 text-[12px] text-ink-300 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loadingMore ? t('comments.loading') : t('comments.loadMore')}
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * 评论头像：有头像图就用图，没有就画一个**像素小人剪影**（默认头像）。
 *
 * ⚠️ 那个人形和 `components/AccountCenter.tsx` 里的 `UserGlyph` **是同一个形状**，
 *    但这里抄了一份 —— 那个组件没有导出，为了十行矩形把整个 AccountCenter
 *    （一千多行的大客户端组件）拉进详情页的 bundle 不划算。
 *    真要统一时，正确做法是把它抽成一个独立的小组件、两边都 import。
 *
 * ⚠️ 渲染尺寸取 **32**（16 的整数倍）—— `icons.tsx` 文件头那条规矩：viewBox 里每根线
 *    1 单位宽，渲染尺寸必须是 16 的整数倍，否则 DPR = 1 的屏上细线会被 `crispEdges`
 *    吸附甚至丢掉。
 */
function CommentAvatar({ url }: { url: string | null }) {
  return (
    <span className="pixel-edge pxw-2 pxc-600 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden bg-ink-800 text-ink-500">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <svg
          width={32}
          height={32}
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
      )}
    </span>
  );
}
