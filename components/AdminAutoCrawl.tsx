'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchDeveloperOptions,
  fetchList,
  importGame,
  variantTitle,
  type ImportStatus,
  type ListResult,
} from '@/lib/admin-import';
import { FIELD_CLASS } from './adminStyles';

/** 同时最多爬几款 —— 用户定的上限（每个 worker 内部仍是一款一语言串行跑）。 */
const CONCURRENCY = 5;

/**
 * 控制台最多渲染多少行。一个机种整类爬下来是上千行，全渲染会让弹框发卡。
 * ⚠️ 超出的**只从画面上丢** —— 每一行都同时 `console.log` 出去了，完整记录在浏览器控制台。
 */
const MAX_LOG_LINES = 600;

/** 攒一批日志再刷进 state 的间隔（毫秒）。见 bufferRef 的注释。 */
const FLUSH_MS = 150;

type LogTone = 'info' | 'ok' | 'skip' | 'fail' | 'page' | 'head';

interface LogLine {
  /** 自增行号 —— 兼作 React key（截断后数组下标会错位，不能拿它当 key） */
  id: number;
  text: string;
  tone: LogTone;
}

/** 行色 —— 全用主题令牌，两套主题都跟着翻。 */
const TONE_CLASS: Record<LogTone, string> = {
  /** 正在跑的那一条（`… 游戏名 · 日本語`） */
  info: 'text-ink-400',
  ok: 'text-ok',
  skip: 'text-ink-500',
  fail: 'text-danger',
  /** 「── 第 N 页 ──」这种分节 */
  page: 'text-accent',
  /** 收尾与汇总 */
  head: 'text-ink-100',
};

/**
 * 后台 · 「自动爬取」—— 给一个**分类页**地址，从第一页爬到最后一页，全程不用管。
 *
 * 与「从列表导入」（AdminBulkImport）的关系：**共用 `lib/admin-import.ts` 那条管道**，
 * 区别只在外层怎么调度 ——
 *   · 从列表导入：用户给一个**具体的列表页**，串行跑完就停；
 *   · 自动爬取：用户给**分类页**，一页页往下翻，每页 5 款并发，跑到「这一页 0 条」为止。
 *
 * ⚠️ **并发上限 5 是用户定的**（2026-10-15）。并发粒度是**款**：5 款同时在跑，
 *    每款内部仍是「一种语言跑完再下一种」—— 一款四条语言同时开就是 20 条下载，
 *    上游会限流，进度也没法看。
 *
 * ⚠️ **翻页的终止判据是「这一页 0 条」**，不是 404：实测上游每页固定 18 条，
 *    页码超出范围仍回 HTTP 200 + 0 条（NDS 分类 21 页 / 372 款，第 22 页起 0 条）。
 *    读列表**报错**也算终止 —— 不能把错误当末页一直往下撞。
 *
 * ⚠️ **规模警告**：一个机种整类就是几百款 × 最多 4 种语言 = 上千条记录、上千次 ROM 下载。
 *    所以给了「最多页数」（留空 = 全部）和「停止」，别一上来就整类跑。
 */
export default function AdminAutoCrawl({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  /** 最多爬几页（留空 = 不限制，一直爬到最后一页）。 */
  const [maxPages, setMaxPages] = useState('');

  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  /** 已经吐出的**总**行数 —— `logs` 会被截到 `MAX_LOG_LINES`，不能拿它的长度当总数。 */
  const [lineCount, setLineCount] = useState(0);
  /** 当前第几页（0 = 还没开始） */
  const [page, setPage] = useState(0);
  /** 本页已处理完 / 本页共几款 */
  const [pageDone, setPageDone] = useState(0);
  const [pageTotal, setPageTotal] = useState(0);
  /** 累计爬了多少款（跨页去重后） */
  const [gamesSeen, setGamesSeen] = useState(0);
  const [stat, setStat] = useState({ ok: 0, skip: 0, fail: 0 });

  /** 点了「停止」置位；worker 每轮开头看一眼。用 ref 是因为循环闭包里读到的是快照。 */
  const stopRef = useRef(false);
  /**
   * 日志缓冲。5 个 worker 一秒能吐十几条，**每条都 setState** 会让上千行 DOM 反复重渲染，
   * 所以先攒在 ref 里、由那个 interval 批量刷进 state（见 flushLogs）。
   */
  const bufferRef = useRef<LogLine[]>([]);
  /** 行号自增用 —— 拿它当 React key，比数组下标稳（截断后下标会错位）。 */
  const seqRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const consoleRef = useRef<HTMLDivElement | null>(null);
  /**
   * 控制台是不是「贴在底部」。用户往上翻去看历史时**别再把他拽回底部** ——
   * 上千行滚起来，每一批都强制滚到底等于看不了。
   */
  const stickRef = useRef(true);

  /**
   * 打一行日志。**两处都写**：
   *   · 画面上的控制台（攒进 buffer，等 interval 刷）；
   *   · 浏览器控制台 —— 上千行时画面只留最近 `MAX_LOG_LINES` 行，完整记录在这儿。
   */
  const pushLog = useCallback((text: string, tone: LogTone = 'info') => {
    bufferRef.current.push({ id: (seqRef.current += 1), text, tone });
    console.log(`[crawl] ${text}`);
  }, []);

  /** 把缓冲里那批刷进 state，并且只保留最近 `MAX_LOG_LINES` 行。 */
  const flushLogs = useCallback(() => {
    if (!bufferRef.current.length) return;
    const batch = bufferRef.current;
    bufferRef.current = [];
    setLineCount((n) => n + batch.length);
    setLogs((prev) => [...prev, ...batch].slice(-MAX_LOG_LINES));
  }, []);

  /** 结局 → 文案（`status` 没给也算失败，宁可报错也不要静默）。 */
  const statusText = (status: ImportStatus | undefined) =>
    status === 'ok'
      ? '成功'
      : status === 'duplicate'
        ? '跳过'
        : '失败';

  /** 结局 → 行色。 */
  const statusTone = (status: ImportStatus | undefined): LogTone =>
    status === 'ok' ? 'ok' : status === 'duplicate' ? 'skip' : 'fail';

  // 卸载时收掉 interval（正常路径由 start 的 finally 收，这里兜底）
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    },
    []
  );

  // 有新行就滚到底（用户自己往上翻了就不动他，见 stickRef）
  useEffect(() => {
    const box = consoleRef.current;
    if (box && stickRef.current) box.scrollTop = box.scrollHeight;
  }, [logs]);

  const reset = useCallback(() => {
    setUrl('');
    setMaxPages('');
    setLogs([]);
    setLineCount(0);
    setPage(0);
    setPageDone(0);
    setPageTotal(0);
    setGamesSeen(0);
    setStat({ ok: 0, skip: 0, fail: 0 });
    bufferRef.current = [];
    seqRef.current = 0;
    stopRef.current = false;
  }, []);

  const close = useCallback(() => {
    // 跑着的时候不许关：关了日志就丢了，用户也不知道最后到底成了几条
    if (running) return;
    setOpen(false);
    reset();
  }, [running, reset]);

  // 弹窗打开时支持 Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  /**
   * 开爬：一页页往下翻，每页最多 5 款并发。
   *
   * 汇总（页数 / 款数 / 成功·跳过·失败 / 耗时）放在 `finally` 里 —— 不管是爬到底、
   * 读列表报错、还是用户点了停止，都要给一份收尾，别让控制台停在半截。
   */
  const start = async () => {
    const target = url.trim();
    if (!target || running) return;

    setRunning(true);
    stopRef.current = false;
    bufferRef.current = [];
    seqRef.current = 0;
    setLogs([]);
    setLineCount(0);
    setPage(0);
    setPageDone(0);
    setPageTotal(0);
    setGamesSeen(0);
    setStat({ ok: 0, skip: 0, fail: 0 });

    const parsedLimit = Number.parseInt(maxPages, 10);
    const pageLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : Infinity;

    timerRef.current = window.setInterval(flushLogs, FLUSH_MS);

    const startedAt = Date.now();
    // 开发商映射：整批只拉一次（拉失败就当没有，不拦住整批）
    const developerIds = await fetchDeveloperOptions();
    /** 跨页去重的 slug —— 同一款不该导两遍（上传那关会拦住，但没必要白跑一趟） */
    const seen = new Set<string>();
    const totals = { ok: 0, skip: 0, fail: 0 };
    let pages = 0;
    let games = 0;
    let hitPageLimit = false;

    try {
      for (let current = 1; ; current += 1) {
        if (stopRef.current) break;
        if (current > pageLimit) {
          hitPageLimit = true;
          break;
        }

        let list: ListResult;
        try {
          // 页码由我们递进去（用户粘的分类页地址通常不带 `?page=`）
          list = await fetchList(target, current);
        } catch (error) {
          pushLog(
            `第 ${current} 页读取失败：${error instanceof Error ? error.message : String(error)}`,
            'fail'
          );
          break;
        }

        // 0 条 = 到底了（见文件头 ⚠️：超出范围不是 404，是 200 + 0 条）
        if (list.total === 0) {
          pushLog(`第 ${current} 页没有游戏 —— 到底了。`, 'page');
          break;
        }

        const fresh = list.games.filter((game) => !seen.has(game.slug));
        for (const game of fresh) seen.add(game.slug);
        pages += 1;
        games += fresh.length;

        setPage(current);
        setPageTotal(fresh.length);
        setPageDone(0);
        setGamesSeen(games);
        pushLog(`── 第 ${current} 页 ── ${fresh.length} 款`, 'page');
        if (fresh.length < list.total) {
          pushLog(`   （其中 ${list.total - fresh.length} 款前面见过，跳过）`, 'info');
        }
        flushLogs();

        /*
         * 本页那 5 个 worker：共用一个游标抢活干（`cursor` 的读与自增之间没有 await，
         * 所以不会两个 worker 抢到同一条）。抢空就退出。
         */
        let cursor = 0;
        const workers = Array.from({ length: Math.min(CONCURRENCY, fresh.length) }, async () => {
          for (;;) {
            if (stopRef.current) return;
            const index = cursor;
            cursor += 1;
            if (index >= fresh.length) return;

            await importGame(fresh[index], {
              fallbackConsole: list.consoleType,
              developerIds,
              shouldStop: () => stopRef.current,
              // 每个语言版本开始 / 结束各一行 —— 「当前爬的是什么、结果如何」都在这儿
              onEvent: (event) => {
                const label = variantTitle(event.title, event.language);
                if (event.phase === 'start') {
                  pushLog(`… ${label}`, 'info');
                  return;
                }
                if (event.status === 'ok') totals.ok += 1;
                else if (event.status === 'duplicate') totals.skip += 1;
                else totals.fail += 1;
                pushLog(
                  `${label} — ${statusText(event.status)}${event.reason ? `：${event.reason}` : ''}`,
                  statusTone(event.status)
                );
                setStat({ ...totals });
              },
            });

            setPageDone((n) => n + 1);
          }
        });
        await Promise.all(workers);
        flushLogs();
      }
    } catch (error) {
      /*
       * 兜底：`importGame` / `fetchList` 自己都不抛（失败也回一条 failed），
       * 走到这儿只可能是意料之外的错。**照样报出来**，别让整个流程静默断在半截
       * —— 下面的 finally 还会照常给汇总。
       */
      pushLog(`⚠ ${error instanceof Error ? error.message : String(error)}`, 'fail');
    } finally {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // 收尾：状态 + 汇总（用户要的「输出完毕及汇总」）
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      pushLog(stopRef.current ? '已手动停止。' : '爬取结束。', 'head');
      pushLog(
        `共 ${pages} 页 · ${games} 款 → 成功 ${totals.ok} · 跳过 ${totals.skip} · 失败 ${totals.fail}`,
        'head'
      );
      pushLog(`耗时 ${seconds} 秒。`, 'head');
      if (hitPageLimit) pushLog(`到了页数上限（${pageLimit} 页），先停。`, 'info');
      flushLogs();

      setRunning(false);
      onImported();
    }
  };

  return (
    <>
      {/* 「从列表导入」右边那颗 —— 按钮与弹框都在这一个组件里 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-3 py-2 text-[12px] text-ink-200 transition-colors hover:text-accent"
      >
        {'自动爬取'}
      </button>

      {open && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink-950/80 p-6"
        >
          <div className="bg-ink-800 pixel-edge pxw-3 pxc-600 max-h-[85vh] w-full max-w-[720px] overflow-y-auto p-4">
            <h2 className="mb-3 text-[12px] text-ink-200">{'自动爬取分类页'}</h2>

            <p className="mb-2 text-[12px] text-ink-500">{'粘贴一个分类页地址。它会一页页爬到最后一页，每页 5 款并发；一款有几种语言版本就导几条（中 / 英 / 日 / 韩）。下面那个控制台每个语言版本打一行。'}</p>

            {/* 输入框与按钮**不进 form** —— 在里头按回车不该顺手把别的提交了 */}
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void start();
                }
              }}
              placeholder={'例如 https://retrogamesnexus.com/zh/nds-games'}
              disabled={running}
              className={`${FIELD_CLASS} w-full`}
            />

            <label className="mt-2 flex items-center gap-2 text-[12px] text-ink-400">
              {'最多页数'}
              <input
                value={maxPages}
                onChange={(e) => setMaxPages(e.target.value)}
                inputMode="numeric"
                disabled={running}
                className={`${FIELD_CLASS} w-[72px]`}
              />
              <span className="text-ink-500">{'留空 = 一直爬到最后一页。'}</span>
            </label>

            {(running || page > 0) && (
              <div className="mt-3 flex flex-col gap-1">
                <p className="text-[12px] text-ink-100">
                  {`第 ${page} 页 · 本页 ${pageDone}/${pageTotal} · 累计 ${gamesSeen} 款`}
                </p>
                <p className="text-[12px] text-ink-400">
                  {`成功 ${stat.ok} · 跳过 ${stat.skip} · 失败 ${stat.fail}`}
                </p>
              </div>
            )}

            <div className="mt-3">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px] text-ink-500">{'控制台'}</span>
                {lineCount > MAX_LOG_LINES && (
                  <span className="text-[11px] text-ink-600">
                    {`只显示最近 ${MAX_LOG_LINES} 行 —— 完整记录在浏览器控制台。`}
                  </span>
                )}
              </div>
              <div
                ref={consoleRef}
                onScroll={(e) => {
                  const box = e.currentTarget;
                  // 差 40px 以内就算「还贴在底部」，往上翻出去了就不再自动跟随
                  stickRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
                }}
                className="h-[260px] overflow-y-auto border border-ink-700 bg-ink-900 p-2 font-mono text-[11px] leading-[1.6]"
              >
                {logs.length === 0 ? (
                  <p className="text-ink-600">—</p>
                ) : (
                  logs.map((line) => (
                    <p
                      key={line.id}
                      className={`whitespace-pre-wrap break-all ${TONE_CLASS[line.tone]}`}
                    >
                      {line.text}
                    </p>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              {running ? (
                <button
                  type="button"
                  onClick={() => {
                    stopRef.current = true;
                  }}
                  className="pixel-edge pxw-2 pxc-500 bg-ink-700 px-4 py-2 text-[12px] text-ink-200 transition-colors hover:text-danger"
                >
                  {'停止'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void start()}
                  disabled={!url.trim()}
                  className="pixel-edge pxw-3 pxc-600 bg-accent px-5 py-2 text-[12px] text-ink-950 transition-colors enabled:hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {'开始爬取'}
                </button>
              )}
              <button
                type="button"
                onClick={close}
                disabled={running}
                className="pixel-edge pxw-2 pxc-500 bg-ink-700 px-4 py-2 text-[12px] text-ink-300 transition-colors enabled:hover:text-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {'关闭'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
