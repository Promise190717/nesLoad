'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchDeveloperOptions,
  importGame,
  variantTitle,
  type ImportOutcome,
  type ImportStatus,
} from '@/lib/admin-import';
import { FIELD_CLASS } from './adminStyles';

/** 一条结果的行色：成功 / 跳过（库里已有）/ 失败。 */
const STATUS_CLASS: Record<ImportStatus, string> = {
  ok: 'text-ok',
  duplicate: 'text-ink-500',
  failed: 'text-danger',
};

/** 结局 → 文案（`status` 没给也算失败，宁可报错也不要静默）。 */
function statusText(status: ImportStatus | undefined): string {
  if (status === 'ok') return '已添加';
  if (status === 'duplicate') return '跳过';
  return '失败';
}

/**
 * 后台 · 「添加」—— 粘贴一个**游戏下载页链接**，一路抓到底直接入库。
 *
 * 走的是和「从列表导入」「自动爬取」**同一条管道**（`lib/admin-import.ts` 的
 * `importGame`），所以抓取 / 取封面 / 取 ROM / 判重的行为与那两条入口完全一致：
 *   scrape-game → fetch-image / fetch-rom → POST /api/admin/games。
 *
 * 与它们唯一的区别是**不用先给列表页**：直接给一款游戏的地址（或干脆只给 slug）。
 *
 * 支持的上游链接形态（同一款游戏，slug 相同，服务端 `parseTarget` 都认）：
 *   · https://retrogamesnexus.com/zh/download-rom/<slug>
 *   · https://retrogamesnexus.com/zh/games/<slug>
 *   · 只给 <slug>
 *
 * ⚠️ **一款游戏可能入库好几条**：上游 `fileName` 是「一份语言一个地址」，最多
 *    中 / 英 / 日 / 韩 四份，每种语言各导一条（判重是「同名 + 同机种 + 同语言」，
 *    互不冲突）。不想一次灌四条就勾「只导中文版」。
 *
 * ⚠️ **原来的手动填表没有删**：它退成了这个弹框底部的「手动添加」入口 ——
 *    链接这条路只覆盖 retrogamesnexus 上的游戏，站外的 ROM 仍得自己填。
 */
export default function AdminAddGame({
  onImported,
  onManualAdd,
}: {
  /** 导完（哪怕一条都没成）通知外面重拉列表 —— 新条目按 created_at 倒序排在第一页 */
  onImported: () => void;
  /** 切到「手动添加」那条老路（AdminGames 里的表单弹窗） */
  onManualAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  /**
   * 要不要把 ROM 存进本站 R2。**默认勾上** —— 单条添加是「我就要这一款」，
   * 存下来前台不必回源取；批量那条路默认不勾是为了省存储（见 AdminAutoCrawl）。
   */
  const [saveRom, setSaveRom] = useState(true);
  /** 只导中文版（默认导全部语言版本） */
  const [zhOnly, setZhOnly] = useState(false);

  const [running, setRunning] = useState(false);
  /** 已经出结果的那些语言版本（跑的过程中逐条追加，收尾用返回的 outcomes 覆盖） */
  const [rows, setRows] = useState<ImportOutcome[]>([]);
  /** 正在跑的那一条（`… 游戏名 · 日本語`） */
  const [current, setCurrent] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const close = useCallback(() => {
    // 跑着的时候不许关：关了结果就丢了，用户也不知道到底成了几条
    if (running) return;
    setOpen(false);
    setUrl('');
    setRows([]);
    setCurrent(null);
    setNotice(null);
  }, [running]);

  // 弹窗打开时支持 Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // 打开就聚焦输入框 —— 这个弹框只干一件事，没必要再点一下
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /**
   * 开抓。
   *
   * ⚠️ `importGame` **不抛错**（失败也回一条 `failed` 结局），所以 catch 里只可能是
   *    意料之外的错；正常失败走 `rows` 那几条红字。
   */
  const run = async () => {
    const target = url.trim();
    if (!target || running) return;

    setRunning(true);
    setRows([]);
    setCurrent(null);
    setNotice(null);

    // 开发商映射：一款游戏只拉一次（拉失败就当没有，不拦住这次添加）
    const developerIds = await fetchDeveloperOptions();

    try {
      const outcomes = await importGame(
        // `importGame` 只认 slug 字段，但服务端的 parseTarget 也收整条 URL —— 原样递过去
        { slug: target, title: null },
        {
          // 没有列表页可以退，机种只认详情页 JSON-LD 给的那一档
          fallbackConsole: null,
          developerIds,
          saveRom,
          // 只导中文版时由管道筛（见 lib/admin-import.ts 的 onlyLanguage）
          onlyLanguage: zhOnly ? 'zh' : null,
          onEvent: (event) => {
            if (event.phase === 'start') {
              setCurrent(variantTitle(event.title, event.language));
              return;
            }
            setCurrent(null);
            setRows((prev) => [
              ...prev,
              {
                title: variantTitle(event.title, event.language),
                language: event.language,
                status: event.status ?? 'failed',
                reason: event.reason,
              },
            ]);
          },
        }
      );

      // 以返回的结局为准（事件里那几条是跑的过程中攒的，可能被中途停止截断）
      setRows(outcomes);
      const ok = outcomes.filter((row) => row.status === 'ok').length;
      const skip = outcomes.filter((row) => row.status === 'duplicate').length;
      const failed = outcomes.length - ok - skip;

      setNotice({
        // 「库里已经有了」不算错，别用红字吓人（只有真的没进去才红）
        tone: ok > 0 || (skip > 0 && failed === 0) ? 'ok' : 'error',
        text:
          ok > 0
            ? `已添加 ${ok} 条${skip ? `，跳过 ${skip} 条` : ''}${failed ? `，失败 ${failed} 条` : ''}。`
            : skip > 0 && failed === 0
              ? `库里已经有了（跳过 ${skip} 条）。`
              : `没能添加：${outcomes[0]?.reason ?? '未知原因'}`,
      });
      // 成了就清空输入框，方便接着粘下一条
      if (ok > 0) setUrl('');
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : '添加失败。',
      });
    } finally {
      setRunning(false);
      onImported();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pixel-edge pxw-3 pxc-600 shrink-0 bg-accent px-4 py-2 text-[12px] text-ink-950 transition-colors hover:bg-accent/80"
      >
        {'添加'}
      </button>

      {open && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink-950/80 p-6"
        >
          <div className="bg-ink-800 pixel-edge pxw-3 pxc-600 max-h-[85vh] w-full max-w-[560px] overflow-y-auto p-4">
            <h2 className="mb-3 text-[12px] text-ink-200">{'添加游戏'}</h2>

            <p className="mb-3 text-[12px] leading-[1.7] text-ink-500">
              {'粘贴一个游戏的下载页链接，会自动抓取中 / 英 / 日 / 韩四份文案、封面与游戏文件，抓完直接入库。一款有几种语言版本就导几条。'}
            </p>

            {/* 输入框与按钮**不进 form** —— 在里头按回车不该顺手把别的提交了 */}
            <input
              ref={inputRef}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void run();
                }
              }}
              placeholder={'例如 https://retrogamesnexus.com/zh/download-rom/rival-schools-united-by-fate'}
              disabled={running}
              className={`${FIELD_CLASS} w-full`}
            />

            <label className="mt-3 flex cursor-pointer items-start gap-2 text-[12px] text-ink-200">
              <input
                type="checkbox"
                checked={saveRom}
                onChange={(e) => setSaveRom(e.target.checked)}
                disabled={running}
                className="mt-[2px] h-[13px] w-[13px] shrink-0 accent-accent disabled:cursor-not-allowed"
              />
              <span className="min-w-0">
                <span className="block">{'保存 ROM 到本站'}</span>
                <span className="mt-0.5 block text-[11px] leading-[1.5] text-ink-500">
                  {'不勾 = 只存源站下载地址，前台回源取（不占本站存储，也不下载）'}
                </span>
              </span>
            </label>

            <label className="mt-2 flex cursor-pointer items-start gap-2 text-[12px] text-ink-200">
              <input
                type="checkbox"
                checked={zhOnly}
                onChange={(e) => setZhOnly(e.target.checked)}
                disabled={running}
                className="mt-[2px] h-[13px] w-[13px] shrink-0 accent-accent disabled:cursor-not-allowed"
              />
              <span className="min-w-0">
                <span className="block">{'只导中文版'}</span>
                <span className="mt-0.5 block text-[11px] leading-[1.5] text-ink-500">
                  {'不勾 = 上游挂了几种语言版本就各导一条（中 / 英 / 日 / 韩）'}
                </span>
              </span>
            </label>

            {running && (
              <p className="mt-3 truncate text-[12px] text-accent">
                {current ? `正在处理：${current}` : '正在抓取页面…'}
              </p>
            )}

            {rows.length > 0 && (
              <div className="mt-3 flex flex-col gap-1 border border-ink-700 bg-ink-900 p-2">
                {rows.map((row, index) => (
                  <p
                    key={`${row.title}-${index}`}
                    className={`text-[12px] leading-[1.6] ${STATUS_CLASS[row.status]}`}
                  >
                    {`${row.title} — ${statusText(row.status)}${row.reason ? `：${row.reason}` : ''}`}
                  </p>
                ))}
              </div>
            )}

            {notice && (
              <p
                className={`mt-2 text-[12px] ${
                  notice.tone === 'ok' ? 'text-ok' : 'text-danger'
                }`}
              >
                {notice.text}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void run()}
                disabled={!url.trim() || running}
                className="pixel-edge pxw-3 pxc-600 bg-accent px-5 py-2 text-[12px] text-ink-950 transition-colors enabled:hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {running ? '抓取中…' : '爬取并添加'}
              </button>
              <button
                type="button"
                onClick={close}
                disabled={running}
                className="pixel-edge pxw-2 pxc-500 bg-ink-700 px-4 py-2 text-[12px] text-ink-300 transition-colors enabled:hover:text-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {'关闭'}
              </button>
              {/* 站外的 ROM 走这条路 —— 链接导入只覆盖 retrogamesnexus 上的游戏 */}
              <button
                type="button"
                onClick={() => {
                  close();
                  onManualAdd();
                }}
                disabled={running}
                className="ml-auto text-[12px] text-ink-500 underline transition-colors enabled:hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                {'手动添加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
