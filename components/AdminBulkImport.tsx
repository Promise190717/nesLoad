'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDeveloperOptions, fetchList, importGame, type ImportOutcome, type ListResult } from '@/lib/admin-import';
import { FIELD_CLASS } from './adminStyles';
import { CONSOLE_LABEL } from './CartridgeSprite';

/*
 * 抓取 / 取字节 / 上传那一条链路的**公共管道在 `lib/admin-import.ts`** ——
 * 本组件与「自动爬取」（AdminAutoCrawl）共用同一份，字段名漏一个就是静默丢数据，
 * 所以这里只放「从列表导入」这个入口自己的东西（读列表、串行跑、进度与失败清单）。
 */

/**
 * 后台 · 「从列表导入」—— 把一个机种列表页上的游戏**整页**导进来。
 *
 * 三段式：读列表（只拿 slug）→ 逐条抓详情 + 取封面 / ROM → 上传入库。
 * 后两段走的是 `lib/admin-import.ts` 的公共管道（和「自动爬取」、和手动添加**同一条**），
 * 这里只管这个入口自己的东西：读列表、串行跑、进度条与失败清单。
 *
 * ⚠️ **一款游戏可能入库好几条**（2026-10-15 用户要求「有多语言都要导入」）：
 *    一款有几个语言版本就导几条，所以「条数」与「款数」是两回事 ——
 *    **进度条的分母是款数**，统计与失败清单按条算（否则一款四条会把进度顶到 400%）。
 *
 * ⚠️ **逐条串行，不并发**（要并发的那个入口是「自动爬取」，它自己开 5 个 worker）：
 *    单条里已经有一次封面 + 一次 ROM 下载，并发几个就是十几 MB 同时在跑 ——
 *    既容易招上游限流，也让「第几条了」这个进度失去意义。
 *
 * 按钮与弹框都在这一个组件里（弹框是 fixed，挂在列表头部不影响它定位）。
 */
export default function AdminBulkImport({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [listUrl, setListUrl] = useState('');
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [list, setList] = useState<ListResult | null>(null);

  const [running, setRunning] = useState(false);
  /**
   * 已经处理完的**条**（含跳过与失败）—— 一款多语言时就是好几条，
   * 失败清单与成功 / 跳过 / 失败三个计数都照着它算。
   */
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);
  /**
   * 已经**整款**处理完的款数 —— 进度条与「N / 总数」的分母是款数（见文件头 ⚠️）。
   * 单独开一个 state 而不是拿 `outcomes.length` 顶：一款四条时那个数会越过总数。
   */
  const [gamesDone, setGamesDone] = useState(0);
  /** 正在导入的那一款：标题读列表时就拿到了，不用等详情页。 */
  const [current, setCurrent] = useState('');

  /** 点了「停止」置位；循环每轮开头看一眼。用 ref 是因为循环闭包里读到的是快照。 */
  const stopRef = useRef(false);
  /** 开发商「名字 → id」映射，整批只拉一次。 */
  const developersRef = useRef<Map<string, string>>(new Map());

  const reset = useCallback(() => {
    setListUrl('');
    setReadError(null);
    setList(null);
    setOutcomes([]);
    setGamesDone(0);
    setCurrent('');
    stopRef.current = false;
  }, []);

  const close = useCallback(() => {
    // 跑着的时候不许关：关了进度就丢了，用户也不知道最后到底成了几条
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

  /** 读列表：只问「这一页有哪几个 slug」，每个游戏的详情稍后逐个抓。 */
  const readList = async () => {
    const url = listUrl.trim();
    if (!url || reading || running) return;

    setReading(true);
    setReadError(null);
    setList(null);
    setOutcomes([]);
    try {
      // 不传 page：地址里带 `?page=N` 就按那个来（见 lib/admin-import.ts 的 fetchList）
      const data = await fetchList(url, undefined);
      setList(data);
      if (data.total === 0) setReadError('那一页没有找到游戏。');
    } catch (error) {
      setReadError(error instanceof Error ? error.message : '读取该列表页失败。');
    } finally {
      setReading(false);
    }
  };

  const start = async () => {
    if (!list || running) return;

    setRunning(true);
    setOutcomes([]);
    setGamesDone(0);
    setCurrent('');
    stopRef.current = false;

    // 开发商映射：整批只拉一次。拉失败就当没有（那几栏留空），不拦住整批导入
    developersRef.current = await fetchDeveloperOptions();

    const collected: ImportOutcome[] = [];
    let done = 0;
    for (const game of list.games) {
      if (stopRef.current) break;
      setCurrent(game.title ?? game.slug);
      // 一款可能回好几条（一种语言一条）—— 条数进统计，款数进进度
      collected.push(
        ...(await importGame(game, {
          fallbackConsole: list.consoleType,
          developerIds: developersRef.current,
          // 「停止」要能在**一款的几种语言之间**也生效（见公共管道里的 shouldStop）
          shouldStop: () => stopRef.current,
        }))
      );
      done += 1;
      // 每完成一款刷一次 —— 进度条按款算，统计与失败清单按条算
      setGamesDone(done);
      setOutcomes([...collected]);
    }

    setCurrent('');
    setRunning(false);
    onImported();
  };

  const total = list?.total ?? 0;
  // ⚠️ 下面三个计数与失败清单都是按**条**算的（一款多语言时条数 > 款数），
  //    进度条却必须按**款**算 —— 见 percent 那行
  const okCount = outcomes.filter((item) => item.status === 'ok').length;
  const skippedCount = outcomes.filter((item) => item.status === 'duplicate').length;
  const failedCount = outcomes.filter((item) => item.status === 'failed').length;
  /** 没进库的那些（跳过 + 失败），收尾时列出来 */
  const problems = outcomes.filter((item) => item.status !== 'ok');
  // ⚠️ 分母是**款数**：一款四语言会回四条，拿条数算进度会冲到 400%
  const percent = total > 0 ? Math.round((gamesDone / total) * 100) : 0;
  const done = !running && gamesDone > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-3 py-2 text-[12px] text-ink-200 transition-colors hover:text-accent"
      >
        {'从列表导入'}
      </button>

      {open && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink-950/80 p-6"
        >
          <div className="bg-ink-800 pixel-edge pxw-3 pxc-600 max-h-[85vh] w-full max-w-[560px] overflow-y-auto p-4">
            <h2 className="mb-3 text-[12px] text-ink-200">{'从列表导入'}</h2>

            <p className="mb-2 text-[12px] text-ink-500">{'粘贴一个机种列表页 —— 那一页上的游戏会逐个导入。一款有中 / 英 / 日 / 韩 多个语言版本的，每种语言各导一条。'}</p>

            {/* 输入框与按钮**不进 form** —— 在里头按回车不该顺手把别的提交了 */}
            <div className="flex items-center gap-2">
              <input
                value={listUrl}
                onChange={(e) => setListUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void readList();
                  }
                }}
                placeholder={'例如 https://retrogamesnexus.com/zh/snes-games?page=1'}
                disabled={reading || running}
                className={`${FIELD_CLASS} min-w-0 flex-1`}
              />
              <button
                type="button"
                onClick={() => void readList()}
                disabled={reading || running}
                className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-3 py-2 text-[12px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                {reading ? '读取中…' : '读取列表'}
              </button>
            </div>

            {readError && <p className="mt-1 text-[12px] text-danger">{readError}</p>}

            {list && list.total > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                <p className="text-[12px] text-ink-100">
                  {`本页共 ${list.total} 款游戏`}
                  {list.consoleType ? ` · ${CONSOLE_LABEL[list.consoleType]}` : ''}
                  {` · P${list.page}`}
                </p>

                {/* 进度条：分母是**本页款数**，分子是已经处理完的款数（含跳过 / 失败） */}
                <div className="h-2 w-full bg-ink-900">
                  <div
                    className="h-full bg-accent transition-[width] duration-200"
                    style={{ width: `${percent}%` }}
                  />
                </div>

                <p className="text-[12px] text-ink-400">
                  {gamesDone} / {total} ·{' '}
                  {`成功 ${okCount} · 跳过 ${skippedCount} · 失败 ${failedCount}`}
                </p>

                {running && current && (
                  <p className="truncate text-[12px] text-accent">
                    {`正在导入：${current}`}
                  </p>
                )}

                {done && (
                  <p className="text-[12px] text-ink-200">
                    {stopRef.current ? '已提前停止。' : '导入完成。'}
                  </p>
                )}

                {problems.length > 0 && (
                  <div className="mt-1">
                    <p className="mb-1 text-[12px] text-ink-500">{'未导入'}</p>
                    <ul className="flex max-h-[160px] flex-col gap-0.5 overflow-y-auto">
                      {problems.map((item, index) => (
                        <li key={`${item.title}-${index}`} className="text-[12px] text-ink-400">
                          <span className="text-ink-300">{item.title}</span>
                          {item.reason ? ` —— ${item.reason}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

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
                  disabled={!list || list.total === 0}
                  className="pixel-edge pxw-3 pxc-600 bg-accent px-5 py-2 text-[12px] text-ink-950 transition-colors enabled:hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {'开始导入'}
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
