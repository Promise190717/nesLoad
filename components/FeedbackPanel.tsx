'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent
} from 'react';
import { formatTime } from '@/lib/i18n';
import { useI18n } from './I18nProvider';

/** `/api/feedback` 返回的条目（字段与 lib/server/feedback.ts 的 Feedback 对齐）。 */
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

/** 正文上限，和后端 FEEDBACK_MAX_LENGTH 保持一致（后端才是真正的关口，这里只是别让用户白打）。 */
const MAX_LENGTH = 500;

/** 每页多少条。与后端默认页大小一致。 */
const PAGE_SIZE = 12;

/**
 * 页缓存存活时间。留言列表变得慢，5 分钟足够省下大量重复请求；再长就会让
 * 「别人刚留的言」迟迟不出现。
 *
 * 顺带一提：**除了第一页，游标页的内容其实是不变的** —— 游标指向固定的
 * `(created_at, id)`，新留言只会插到最前面，不会挤进第二页。所以这个 TTL 对
 * 第二页往后的页是纯浪费，但它换来「一套规则管所有页」，值。
 */
const PAGE_TTL = 5 * 60 * 1000;

/**
 * 页缓存，**挂在模块上而不是 useState**。
 *
 * 面板每次打开都是一次全新挂载，缓存跟着组件走的话「关掉再打开」就白费了；
 * 而 D1 的请求次数是有限额的（每查一次就是一次 REST 调用 + 配额），
 * 留言列表又恰恰是「反复打开、内容几乎不变」的东西。
 *
 * 键是**游标**（第一页用空串 `''`），所以「上一页」也是零请求 —— 游标天然可复现。
 */
const pageCache = new Map<string, { at: number; page: FeedbackPage }>();

function readCache(cursor: string): FeedbackPage | null {
  const hit = pageCache.get(cursor);
  if (!hit) return null;
  if (Date.now() - hit.at > PAGE_TTL) {
    pageCache.delete(cursor);
    return null;
  }
  return hit.page;
}

function writeCache(cursor: string, page: FeedbackPage): void {
  pageCache.set(cursor, { at: Date.now(), page });
}

const FIELD_CLASS =
  'pixel-edge pxw-2 pxc-500 w-full resize-none bg-ink-900 px-2 py-2 text-[11px] leading-relaxed text-ink-100 placeholder:text-ink-600 focus:outline-none';

async function fetchPage(cursor: string | null): Promise<FeedbackPage> {
  const query = cursor
    ? `?cursor=${encodeURIComponent(cursor)}&limit=${PAGE_SIZE}`
    : `?limit=${PAGE_SIZE}`;
  const res = await fetch(`/api/feedback${query}`);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as FeedbackPage;
}

/**
 * 正在路上的请求。**同一次挂载里 StrictMode 会把 effect 跑两遍**，没有这层去重
 * 就会白发一次请求 —— 而「少发请求」正是这个缓存存在的理由。
 * 失败的不留在里面，所以「重试」仍然会真的重发。
 */
const inflight = new Map<string, Promise<FeedbackPage>>();

/** 取一页，**优先走缓存**。只负责读 / 写缓存，不碰 React state —— 状态由调用方决定。 */
function getPage(cursor: string): Promise<FeedbackPage> {
  const cached = readCache(cursor);
  if (cached) return Promise.resolve(cached);

  const pending = inflight.get(cursor);
  if (pending) return pending;

  const request = fetchPage(cursor || null)
    .then((page) => {
      writeCache(cursor, page);
      return page;
    })
    .finally(() => {
      inflight.delete(cursor);
    });

  inflight.set(cursor, request);
  return request;
}

/** 从失败响应里挖出服务端给的 detail —— 和后台那份同一套。 */
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: string };
    return data.detail ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * 留言本。点房间地板上那本（亮青封面 + 斜搁着的笔）打开。
 *
 * 三块：**列表**（新的在前，带「已解决 / 未解决」标识）、**底部翻页条**、
 * **底部提交框**。提交成功不重拉列表，直接把新条目插到最前面 —— 列表本来就是
 * 新的在前，重拉一遍只会闪一下。
 *
 * **列表区是一页作业本纸，每条只占一行**（2026-10-10 改）：超出一行的截断成 `…`，
 * **点那一条就地展开看全文**（再点收起，同时只展开一条）。这样一页能扫完十几条，
 * 而不是被一两条长留言撑满。展开后占 N 行 = N×30，仍在同一个行网格上。
 *
 * **翻页是「上一页 / 下一页」按钮，不是滚动加载**（2026-10-10 改）。
 * 滚动加载要一路滚到底才知道有多少内容，也说不清「我看到第几屏了」；
 * 分页把边界摆到明面上，代价是每次翻页一次请求 —— 所以下面那套缓存是必须的。
 *
 * **没有总页数**：游标分页拿不到总数（要拿就得再发一条 COUNT，正好和「省 D1 请求」
 * 反着来）。所以这里只显示「第 N 页」，`nextCursor` 为 null 就是最后一页。
 *
 * 列表是**公开的**：谁写的、写了什么，所有来访者都看得到。这是「打开就是一张
 * 留言列表」的直接后果，不是疏漏。
 */
export default function FeedbackPanel({ onClose }: { onClose: () => void }) {
  const { t, locale } = useI18n();

  /*
   * 已访问过每一页用的游标。`cursors[0]` 恒为空串（第一页不带游标），
   * 第 n+1 页的游标来自第 n 页返回的 `nextCursor`。
   *
   * 为什么要存成数组：游标只能单向往后推，没有总数也算不出任意页码，所以
   * 「上一页」只能**原路退回去** —— 把这些游标记下来就退得回去了。
   */
  const [cursors, setCursors] = useState<string[]>(['']);
  const [pageIndex, setPageIndex] = useState(0);
  /*
   * 首屏的两个 state 都用惰性初始值直接读缓存 —— 命中时**第一帧就是内容**。
   * 若改成「先 loading、再由 effect 里读缓存」，缓存命中也会闪一帧「载入中…」，
   * 那缓存就白做了（effect 在首次绘制之后才跑）。
   */
  const [page, setPage] = useState<FeedbackPage | null>(() => readCache(''));
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(() =>
    readCache('') ? 'ready' : 'loading'
  );

  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  /*
   * 正在展开看全文的那一条（同一时刻只留一条）。
   * 收起时每条只占一行、超出的截断成 `…`；点一下就地把这一条摊开成多行。
   * 只存在组件里，翻页不清空 —— 翻回来还是展开的，符合预期。
   */
  const [openId, setOpenId] = useState<string | null>(null);

  /** 竞态令牌：连点两下翻页时只认最后一次的结果，别让先到的旧响应盖上去。 */
  const loadToken = useRef(0);

  // 首屏。**缓存命中时这里不会发请求**（getPage 先查缓存），setState 也因此
  // 被 React 直接 bail out，不会多渲染一次。
  // setState 一律放 .then/.catch —— 直接在 effect 体里同步 setState 会被
  // react-hooks/set-state-in-effect 拦下。
  useEffect(() => {
    let cancelled = false;
    getPage('')
      .then((p) => {
        if (cancelled) return;
        setPage(p);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Esc 关面板（面板自持，不必依赖外层）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /**
   * 跳到 `nextCursors[index]` 那一页。命中缓存就完全不发请求。
   *
   * **只在事件处理里调**（不在 effect 里），所以这里同步 setState 是安全的 ——
   * effect 里同步 setState 会被 react-hooks/set-state-in-effect 拦下。
   */
  const goto = useCallback((nextCursors: string[], index: number) => {
    const cursor = nextCursors[index];
    const cached = readCache(cursor);

    setCursors(nextCursors);
    setPageIndex(index);

    if (cached) {
      setPage(cached);
      setState('ready');
      return;
    }

    const token = ++loadToken.current;
    setPage(null);
    setState('loading');
    getPage(cursor)
      .then((p) => {
        if (loadToken.current !== token) return;
        setPage(p);
        setState('ready');
      })
      .catch(() => {
        if (loadToken.current === token) setState('error');
      });
  }, []);

  const goPrev = () => {
    if (pageIndex === 0) return;
    // 原路退回：游标数组不动，只把下标往前挪
    goto(cursors, pageIndex - 1);
  };

  const goNext = () => {
    const next = page?.nextCursor;
    if (!next) return;
    // 砍掉「下一页」之后可能残留的游标（先退再进时它们已经过期了），再追加新的
    goto([...cursors.slice(0, pageIndex + 1), next], pageIndex + 1);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const content = draft.trim();
    if (!content) {
      setNotice({ tone: 'error', text: t('feedback.required') });
      return;
    }

    setSubmitting(true);
    setNotice(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (!res.ok) throw new Error(await readError(res, t('feedback.failed')));

      const data = (await res.json()) as { item: FeedbackItem };

      /*
       * 提交成功不重拉列表。但要照顾缓存，否则「关掉再打开」会把刚写的那条弄丢。
       *
       * 停在第一页：直接插到最前面，**不动 `nextCursor`** —— 游标指的是原来第 12 条，
       * 第一页多出一条（13 条）也不会和第二页重叠，第二页还是从第 13 条开始。
       * 停在后面的页：第一页的内容整体后移了一位，缓存直接作废，下次回到第一页
       * 会重新拉一次 —— 就这一次请求，换的是「刚写的必定出现在第一页」。
       */
      if (pageIndex === 0) {
        const base = page ?? readCache('');
        if (base) {
          const updated = { ...base, items: [data.item, ...base.items] };
          setPage(updated);
          writeCache('', updated);
        }
      } else {
        pageCache.delete('');
      }

      setDraft('');
      setNotice({ tone: 'ok', text: t('feedback.ok') });
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : t('feedback.failed')
      });
    } finally {
      setSubmitting(false);
    }
  };

  // 翻页条的两个按钮。列表还在路上（或出错）时一律置灰，避免翻到一半的页上再翻。
  const canPrev = state === 'ready' && pageIndex > 0;
  const canNext = state === 'ready' && Boolean(page?.nextCursor);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-ink-950/80" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('feedback.title')}
        className="relative flex h-[min(660px,86vh)] w-[min(680px,92vw)] flex-col bg-ink-800 pixel-edge pxw-4 pxc-600"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b-2 border-ink-900 bg-ink-850 px-4 py-3">
          <span className="text-[12px] text-ink-200">
            {t('feedback.title')}
          </span>
          <button
            type="button"
            aria-label={t('feedback.close')}
            onClick={onClose}
            className="pixel-edge pxw-2 pxc-500 ml-auto flex h-[18px] w-[18px] items-center justify-center bg-ink-700 text-[10px] leading-none text-ink-100 hover:bg-danger hover:text-ink-950"
          >
            ×
          </button>
        </div>

        {/*
          列表区 = **一页米黄的纸**（2026-10-10：去掉作业本横线、纸色调淡）。
          道具只剩纸色 `#f2ecdc` + 描边 `pxc-paper`。

          **正文仍然 `leading-[30px]`**：纸面虽不再画线，但整页按 30px 的行网格排 ——
          纸的上内边距 `pt-[30px]`、每条之间 `pb-[30px]`（空一行，读起来才不连成一段）、
          时间戳和「已解决」标记套 `h-[30px] flex items-center` 对齐到同一格。
          改字号或行高要连着这几处 30 一起改，否则各行的格线会对不齐。

          **每条收起时只占一行**（`truncate` + `…`），点那一条就地展开成多行 ——
          展开占 N 行 = N×30，网格一样不断。

          描边（`pixel-edge pxw-2 pxc-paper`）就画在纸上、跟着纸一起滚 —— 那本来就是
          **这张纸自己的边**，往下翻时纸的上沿滚出视野是对的。
          外面那层 `p-3` 的暗色底是「壳」：纸是「页」，壳不动、页在滚。
          颜色全写死：纸是物件，不跟主题翻。
        */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-ink-900 p-3">
          <div className="min-h-full bg-[#f2ecdc] pixel-edge pxw-2 pxc-paper py-4 px-3">
            {state === 'loading' && (
              <p className="text-[12px] leading-[30px] text-[#8a7a5c]">
                {t('feedback.loading')}
              </p>
            )}

            {state === 'error' && (
              <div className="flex h-[30px] items-center gap-3">
                <p className="text-[12px] leading-[30px] text-[#a3302a]">
                  {t('feedback.failed')}
                </p>
                {/*
                  重试 = 原地再跳一次当前页。失败的那页没进缓存，所以 goto 会真的重发；
                  已经拿到过的页不会走到这里（它们不会进 error 分支）。
                */}
                <button
                  type="button"
                  onClick={() => goto(cursors, pageIndex)}
                  className="pixel-edge pxw-2 pxc-paper bg-[#e2d3ae] px-2.5 py-1 text-[10px] text-[#5a4a30] transition-colors hover:bg-[#d8c69c]"
                >
                  {t('feedback.retry')}
                </button>
              </div>
            )}

            {state === 'ready' && page && page.items.length === 0 && (
              <p className="text-[12px] leading-[30px] text-[#8a7a5c]">
                {t('feedback.empty')}
              </p>
            )}

            {page && page.items.length > 0 && (
              <ul>
                {page.items.map((item) => {
                  const expanded = openId === item.id;
                  return (
                    <li key={item.id} className="pb-[30px] last:pb-0">
                      {/* 悬停给一道**半透明**的墨色 —— 只是提示可点，别喧宾夺主 */}
                      <button
                        type="button"
                        onClick={() => setOpenId(expanded ? null : item.id)}
                        aria-expanded={expanded}
                        className="flex w-full cursor-pointer items-start gap-3 text-left transition-colors hover:bg-[#3b3327]/10"
                      >
                        {/*
                          **收起时 `truncate`（一行 + `…`），展开时换行** —— 两种状态都走
                          `leading-[30px]`，所以正文永远落在格子里；展开占 N 行 = N×30，
                          整页的网格不会断。

                          用 `<span>` 而不是 `<p>`：`<p>` 是流内容，**不能放进 `<button>`**
                          （内容模型不允许），而这一整行就是个按钮（点开看全文）。
                          正文可能是中文，所以走系统字体，不用 `font-pixel`。
                        */}
                        <span
                          className={`min-w-0 flex-1 text-[12px] leading-[30px] text-[#3b3327] ${
                            expanded
                              ? 'whitespace-pre-wrap break-words'
                              : 'truncate'
                          }`}
                        >
                          {item.content}
                        </span>
                        {/* 标记用「印章」的配色（固定色，压在纸上读得出来），外层 30px 只负责对齐 */}
                        <span className="flex h-[30px] shrink-0 items-center">
                          <span
                            className={`pixel-edge pxw-2 pxc-paper px-1.5 py-0.5 text-[10px] ${
                              item.resolved
                                ? 'bg-[#cbdcc0] text-[#2f5a2b]'
                                : 'bg-[#e2d3ae] text-[#6b5a3a]'
                            }`}
                          >
                            {t(
                              item.resolved
                                ? 'feedback.resolved'
                                : 'feedback.unresolved'
                            )}
                          </span>
                        </span>
                        <span className="flex h-[30px] w-[92px] shrink-0 items-center justify-end text-[10px] text-[#8a7a5c]">
                          {formatTime(item.createdAt, locale)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/*
          翻页条。**常驻**（不按 state 条件渲染）：一来按钮置灰比整条消失好懂，
          二来列表区高度不会因为状态切换而抖一下。
          `nextCursor` 为 null 就是到底了，所以「下一页」禁用即可，不需要总页数。
        */}
        <div className="flex items-center justify-end gap-3 border-t-2 border-ink-900 bg-ink-850 px-4 py-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={!canPrev}
            className="pixel-edge pxw-2 pxc-500 bg-ink-700 px-3 py-1 text-[10px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('feedback.prev')}
          </button>
          <span className="text-[10px] text-ink-400">
            {t('feedback.page', { n: pageIndex + 1 })}
          </span>
          <button
            type="button"
            onClick={goNext}
            disabled={!canNext}
            className="pixel-edge pxw-2 pxc-500 bg-ink-700 px-3 py-1 text-[10px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('feedback.next')}
          </button>
        </div>

        {/*
          提交框。textarea 而不是 input：留言通常不止一行。
          **Enter 在这里是换行**（浏览器不会从 textarea 提交表单），要提交就点按钮 ——
          这也正好对上「一个提交按钮」的说法。
        */}
        <form
          onSubmit={(e) => void submit(e)}
          className="flex flex-col gap-2 border-t-2 border-ink-900 bg-ink-850 p-4"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_LENGTH}
            rows={3}
            placeholder={t('feedback.placeholder')}
            className={FIELD_CLASS}
          />
          <div className="flex items-center gap-3">
            {/* 计数走系统字体：`font-pixel` 里没有斜杠以外的排版符号，也不值得为它换字体 */}
            <span className="text-[10px] text-ink-500">
              {draft.length}/{MAX_LENGTH}
            </span>
            {notice && (
              <span
                className={`text-[11px] ${notice.tone === 'ok' ? 'text-ok' : 'text-danger'}`}
              >
                {notice.text}
              </span>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="pixel-edge pxw-3 pxc-600 ml-auto bg-accent px-5 py-2 text-[12px] text-ink-950 transition-colors enabled:hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? t('feedback.submitting') : t('feedback.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
