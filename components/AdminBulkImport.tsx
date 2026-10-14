'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConsoleType } from '@/lib/emulator';
import { romLangToFormValue } from '@/lib/rom-lang';
import { FIELD_CLASS } from './adminStyles';
import { CONSOLE_LABEL } from './CartridgeSprite';
import { useI18n } from './I18nProvider';

/** `/api/admin/scrape-list` 回的一条。 */
interface ListGame {
  slug: string;
  title: string | null;
}

/** `/api/admin/scrape-list` 的响应。 */
interface ListResult {
  path: string;
  page: number;
  consoleType: ConsoleType | null;
  total: number;
  games: ListGame[];
}

/** `/api/admin/developers/options` 回的一项。 */
interface DeveloperOption {
  id: string;
  name: string;
}

/** 一条的结局：成功 / 跳过（库里已有同名同语言）/ 失败。 */
interface Outcome {
  title: string;
  status: 'ok' | 'duplicate' | 'failed';
  /** 跳过或失败时的说明，直接来自服务端的 detail */
  reason?: string;
}

/**
 * 从失败响应里挖出**机器码**与说明。
 *
 * 和 AdminGames 那个 readError 不同：那边只关心给人看的 detail，这里还要靠 `error`
 * 分辨「同名同语言，已经导过了」（跳过，不算失败）与「真失败」（要报出来）。
 */
async function readFailure(
  res: Response,
  fallback: string
): Promise<{ code: string; detail: string }> {
  try {
    const data = (await res.json()) as { error?: string; detail?: string };
    return { code: data.error ?? 'unknown', detail: data.detail ?? fallback };
  } catch {
    return { code: 'unknown', detail: fallback };
  }
}

/**
 * 经服务端代理把一个外链资源取回来（跨域 + CORS，见 /api/admin/fetch-image 与 fetch-rom）。
 * `fallbackName` 是拿不到响应头 `x-file-name` 时的兜底文件名。
 */
async function fetchAsset(endpoint: string, url: string, fallbackName: string): Promise<File> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error((await readFailure(res, endpoint)).detail);

  const blob = await res.blob();
  // ROM 的原始文件名在响应头里 —— FBNeo 认 zip 文件名当驱动名，改不得
  const header = res.headers.get('x-file-name');
  const fromUrl = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
  const name = (header ? decodeURIComponent(header) : '') || fallbackName || fromUrl || 'file';
  return new File([blob], name, { type: blob.type || 'application/octet-stream' });
}

/**
 * 后台 · 「从列表导入」—— 把一个机种列表页上的游戏**整页**导进来。
 *
 * 三段式：读列表（只拿 slug）→ 逐条抓详情 + 取封面 / ROM → 上传入库。
 * 每一条走的都是和手动添加**完全相同**的那条链路（scrape-game → fetch-image /
 * fetch-rom → POST /api/admin/games），所以这里不重写解析，也不碰 R2 / D1。
 *
 * ⚠️ **逐条串行，不并发**：单条里已经有一次封面 + 一次 ROM 下载，并发几个就是
 *    十几 MB 同时在跑 —— 既容易招上游限流，也让「第几条了」这个进度失去意义。
 *
 * 按钮与弹框都在这一个组件里（弹框是 fixed，挂在列表头部不影响它定位）。
 */
export default function AdminBulkImport({ onImported }: { onImported: () => void }) {
  const { t } = useI18n();

  const [open, setOpen] = useState(false);
  const [listUrl, setListUrl] = useState('');
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [list, setList] = useState<ListResult | null>(null);

  const [running, setRunning] = useState(false);
  /** 已经处理完的条目（含跳过与失败）—— 条数就是进度，别另开一个 state 记。 */
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  /** 正在导入的那一条：标题读列表时就拿到了，不用等详情页。 */
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
      const res = await fetch('/api/admin/scrape-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error((await readFailure(res, t('admin.bulk.readFailed'))).detail);

      const data = (await res.json()) as ListResult;
      setList(data);
      if (data.total === 0) setReadError(t('admin.bulk.empty'));
    } catch (error) {
      setReadError(error instanceof Error ? error.message : t('admin.bulk.readFailed'));
    } finally {
      setReading(false);
    }
  };

  /**
   * 导入一条：抓详情 → 取封面 / ROM → 上传。
   * **返回结局而不是抛错** —— 循环里要接着跑下一条，不能一条失败就整批中断。
   */
  const importOne = async (
    game: ListGame,
    fallbackConsole: ConsoleType | null
  ): Promise<Outcome> => {
    const label = game.title ?? game.slug;
    try {
      const metaRes = await fetch('/api/admin/scrape-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: game.slug }),
      });
      if (!metaRes.ok) {
        throw new Error((await readFailure(metaRes, t('admin.scrape.failed'))).detail);
      }

      const meta = (await metaRes.json()) as {
        title?: string | null;
        titleEn?: string | null;
        consoleType?: ConsoleType | null;
        year?: number | null;
        developer?: string | null;
        series?: string | null;
        seriesEn?: string | null;
        description?: string | null;
        descriptionEn?: string | null;
        imageUrl?: string | null;
        romUrl?: string | null;
        romName?: string | null;
        romLang?: string | null;
        /** 库里已有同名同语言的一条 —— 服务端抓取时顺手预检的结果，用它跳过下载 */
        duplicate?: boolean;
      };

      const title = (meta.title ?? game.title ?? '').trim();
      if (!title) throw new Error(t('admin.bulk.noTitle'));

      // 语言先算出来：上传那一栏要用它（判重也是拿它算的，服务端那边同一套规则）
      const language = romLangToFormValue(meta.romLang) ?? '';

      /*
       * **先查重、再下载**：封面 + ROM 加起来几 MB，是整条链路里最慢的一段。
       * 库里已有同名同语言的直接跳过，不白下载一遍再被上传那一步拒掉。
       * 判据来自服务端（抓取时顺手做的，和上传那一步是同一个 findGameDuplicate）。
       */
      if (meta.duplicate) {
        return { title, status: 'duplicate', reason: t('admin.bulk.duplicate') };
      }

      if (!meta.imageUrl) throw new Error(t('admin.bulk.noCover'));
      if (!meta.romUrl) throw new Error(t('admin.bulk.noRom'));

      // 封面与 ROM 的字节：各自走服务端代理，并行取（互不依赖）
      const [cover, rom] = await Promise.all([
        fetchAsset('/api/admin/fetch-image', meta.imageUrl, ''),
        fetchAsset('/api/admin/fetch-rom', meta.romUrl, meta.romName ?? ''),
      ]);

      /*
       * 字段名与手动添加那条**必须一致**（见 app/api/admin/games 的 POST）。
       * 机种：详情页认不出来时退到列表页那一档（`/zh/snes-games` → snes）。
       */
      const form = new FormData();
      form.set('title', title);
      form.set('title_en', meta.titleEn ?? '');
      form.set('console_type', meta.consoleType ?? fallbackConsole ?? 'nes');
      form.set('language', language);
      form.set('series', meta.series ?? '');
      form.set('series_en', meta.seriesEn ?? '');
      form.set('year', meta.year == null ? '' : String(meta.year));
      // 下拉框认的是 developers.id，而接口回的是**名字** —— 查一次映射，查不到就留空
      form.set('developer_id', (meta.developer && developersRef.current.get(meta.developer)) || '');
      form.set('description', meta.description ?? '');
      form.set('description_en', meta.descriptionEn ?? '');
      form.set('image', cover);
      form.set('rom', rom);

      const res = await fetch('/api/admin/games', { method: 'POST', body: form });
      if (!res.ok) {
        const failure = await readFailure(res, t('admin.upload.failed'));
        // 同名 + 同语言 = 库里已经有了，算「跳过」不算失败（判重见 /api/admin/games）
        return {
          title,
          status: failure.code === 'duplicate-title' ? 'duplicate' : 'failed',
          reason: failure.detail,
        };
      }
      return { title, status: 'ok' };
    } catch (error) {
      return {
        title: label,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const start = async () => {
    if (!list || running) return;

    setRunning(true);
    setOutcomes([]);
    setCurrent('');
    stopRef.current = false;

    // 开发商映射：整批只拉一次。拉失败就当没有（那几栏留空），不拦住整批导入
    try {
      const res = await fetch('/api/admin/developers/options');
      const data = res.ok ? ((await res.json()) as { developers?: DeveloperOption[] }) : {};
      developersRef.current = new Map((data.developers ?? []).map((item) => [item.name, item.id]));
    } catch {
      developersRef.current = new Map();
    }

    const collected: Outcome[] = [];
    for (const game of list.games) {
      if (stopRef.current) break;
      setCurrent(game.title ?? game.slug);
      collected.push(await importOne(game, list.consoleType));
      // 每完成一条刷一次 —— 进度条与统计都是照着它算的
      setOutcomes([...collected]);
    }

    setCurrent('');
    setRunning(false);
    onImported();
  };

  const total = list?.total ?? 0;
  const processed = outcomes.length;
  const okCount = outcomes.filter((item) => item.status === 'ok').length;
  const skippedCount = outcomes.filter((item) => item.status === 'duplicate').length;
  const failedCount = outcomes.filter((item) => item.status === 'failed').length;
  /** 没进库的那些（跳过 + 失败），收尾时列出来 */
  const problems = outcomes.filter((item) => item.status !== 'ok');
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
  const done = !running && processed > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-3 py-2 text-[12px] text-ink-200 transition-colors hover:text-accent"
      >
        {t('admin.bulk.button')}
      </button>

      {open && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink-950/80 p-6"
        >
          <div className="bg-ink-800 pixel-edge pxw-3 pxc-600 max-h-[85vh] w-full max-w-[560px] overflow-y-auto p-4">
            <h2 className="mb-3 text-[12px] text-ink-200">{t('admin.bulk.title')}</h2>

            <p className="mb-2 text-[12px] text-ink-500">{t('admin.bulk.hint')}</p>

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
                placeholder={t('admin.bulk.placeholder')}
                disabled={reading || running}
                className={`${FIELD_CLASS} min-w-0 flex-1`}
              />
              <button
                type="button"
                onClick={() => void readList()}
                disabled={reading || running}
                className="pixel-edge pxw-2 pxc-500 shrink-0 bg-ink-700 px-3 py-2 text-[12px] text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                {reading ? t('admin.bulk.reading') : t('admin.bulk.read')}
              </button>
            </div>

            {readError && <p className="mt-1 text-[12px] text-danger">{readError}</p>}

            {list && list.total > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                <p className="text-[12px] text-ink-100">
                  {t('admin.bulk.total', { count: list.total })}
                  {list.consoleType ? ` · ${CONSOLE_LABEL[list.consoleType]}` : ''}
                  {` · P${list.page}`}
                </p>

                {/* 进度条：分母是本页条数，分子是已经处理完的（含跳过 / 失败） */}
                <div className="h-2 w-full bg-ink-900">
                  <div
                    className="h-full bg-accent transition-[width] duration-200"
                    style={{ width: `${percent}%` }}
                  />
                </div>

                <p className="text-[12px] text-ink-400">
                  {processed} / {total} ·{' '}
                  {t('admin.bulk.stat', {
                    ok: okCount,
                    skipped: skippedCount,
                    failed: failedCount,
                  })}
                </p>

                {running && current && (
                  <p className="truncate text-[12px] text-accent">
                    {t('admin.bulk.now', { title: current })}
                  </p>
                )}

                {done && (
                  <p className="text-[12px] text-ink-200">
                    {stopRef.current ? t('admin.bulk.stopped') : t('admin.bulk.done')}
                  </p>
                )}

                {problems.length > 0 && (
                  <div className="mt-1">
                    <p className="mb-1 text-[12px] text-ink-500">{t('admin.bulk.failures')}</p>
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
                  {t('admin.bulk.stop')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void start()}
                  disabled={!list || list.total === 0}
                  className="pixel-edge pxw-3 pxc-600 bg-accent px-5 py-2 text-[12px] text-ink-950 transition-colors enabled:hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('admin.bulk.start')}
                </button>
              )}
              <button
                type="button"
                onClick={close}
                disabled={running}
                className="pixel-edge pxw-2 pxc-500 bg-ink-700 px-4 py-2 text-[12px] text-ink-300 transition-colors enabled:hover:text-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('admin.bulk.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
