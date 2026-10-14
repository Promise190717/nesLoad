'use client';

import { useCallback, useEffect, useState } from 'react';
import { downloadFile } from '@/lib/download';
import { useI18n } from './I18nProvider';

/**
 * 下载页上那颗按钮：**点一下，等 6 秒，才开始下载**。
 *
 * 「等 6 秒」是用户 2026-10-12 明确要求的（理由是要给下载入口做一个缓冲，
 * 而不是点一下立刻把文件甩出去）。这个数字只在这一个常量里，别在别处再写一遍。
 *
 * ⚠️ **不要改成「进页面就自动开始倒计时」**：必须是**用户点过**才开始 ——
 * 没点就开始下载，等于进页面就触发文件保存，比多等 6 秒讨厌得多。
 *
 * 下载本身**不走 fetch**：ROM 是几十 MB 的二进制，走 fetch 就得先在内存里攒完
 * 再转成 Blob，白占一份内存、还丢掉了浏览器原生的下载管理（进度、暂停、续传）。
 * 实际的甩文件动作交给 `lib/download.ts` 的 `downloadFile()`（造个 `<a download>`
 * 点一下），`download` 属性对同源地址才生效，而 `/api/games/<id>/rom` 就是同源代理
 * （顺带把文件名也从 Content-Disposition 带回来了）。
 *
 * ⚠️ **别再在这里手写 `<a>`**（2026-10-13 之前就是手写的）：少了那句
 * `stopPropagation`，这一下点击会惊动挂在 `document` 上的**顶部路线进度条** ——
 * 它当成「要换页了」起条，而下载不换页、没有 `pushState` 来收尾，条子会一直挂着。
 * 完整的来龙去脉写在 lib/download.ts 的文件头。
 *
 * 倒计时用 `setInterval` 而不是 `setTimeout` 链：只需要一个定时器，值放在 state 里，
 * 用户能看见还剩几秒。1 秒一次而不是每 100ms 一次 —— 文案只显示整秒，
 * 刷得再快也只是白重渲染。
 */
const DELAY_SECONDS = 6;

export default function RomDownloadGate({
  romUrl,
  romName,
}: {
  /** 同源的 ROM 代理地址（`/api/games/<id>/rom`） */
  romUrl: string;
  /** 存进下载目录的文件名。用库里存的原始文件名算 R2 对象名（见下载页注释） */
  romName: string;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'done'>('idle');
  const [seconds, setSeconds] = useState(DELAY_SECONDS);

  /** 真的把文件甩出去。造链、点一下、掐掉冒泡这些细节都在 lib/download.ts。 */
  const triggerDownload = useCallback(() => {
    downloadFile(romUrl, romName);
  }, [romUrl, romName]);

  useEffect(() => {
    if (phase !== 'waiting') return;

    /*
     * 本地变量 `left` 而不是每次读 state：interval 的回调闭包捕获的是**开始那一刻**
     * 的 state，拿它自减会永远停在 6。`left` 是这次倒计时的唯一真相，
     * state 只负责把它显示出来。
     */
    let left = DELAY_SECONDS;
    const timer = window.setInterval(() => {
      left -= 1;
      if (left <= 0) {
        window.clearInterval(timer);
        triggerDownload();
        setPhase('done');
        return;
      }
      setSeconds(left);
    }, 1000);

    // 倒计时没走完就离开页面：清掉定时器，别让它在卸载后触发一次下载
    return () => window.clearInterval(timer);
  }, [phase, triggerDownload]);

  return (
    <div className="mt-8">
      <p className="text-[13px] leading-7 text-ink-400">{t('download.hint')}</p>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        {phase === 'idle' && (
          <button
            type="button"
            onClick={() => {
              setSeconds(DELAY_SECONDS);
              setPhase('waiting');
            }}
            className="pixel-edge pxw-3 pxc-600 bg-accent px-6 py-3 text-[13px] text-ink-950 transition-colors hover:bg-accent/80"
          >
            {t('download.button')}
          </button>
        )}

        {phase === 'waiting' && (
          <>
            <button
              type="button"
              disabled
              className="pixel-edge pxw-3 pxc-600 cursor-not-allowed bg-ink-800 px-6 py-3 text-[13px] text-ink-400"
            >
              {t('download.waiting', { seconds })}
            </button>
            {/*
              跟着倒计时走的进度条。用项目里既有的「来回滑的亮条」（`.load-slide`，
              核心包 / ROM 下载都走它）—— 「在动」这件事全站同一套语言。
              这里没有真实进度可读（下载还没开始），所以是**不确定**那条。
            */}
            <span className="relative h-[6px] w-32 overflow-hidden bg-ink-900">
              <span className="load-slide absolute inset-y-0 left-0 w-1/3 bg-accent/70" />
            </span>
          </>
        )}

        {phase === 'done' && (
          <p role="status" className="text-[13px] text-ink-200">
            {t('download.started')}
          </p>
        )}
      </div>

      {/*
        ⚠️ 2026-10-12 用户要求**去掉**这里原先那条兜底链接（「没有反应？直接下载」）：
        它点一下就把文件甩出去、**绕开了上面那 6 秒缓冲** —— 留着它等于把「下载入口要有个缓冲」
        这条需求作废。（原先留它的理由：① 浏览器可能拦掉自动下载，那时得有个能点的地方；
        ② 它是一条**真链接**，右键另存为走得通。）
        要恢复的话就是这一段：`<p>{t('download.manual')} <a href={romUrl} download={romName}>…</a></p>`
        —— 文案 `download.manual` / `download.manualLink` 是随它一起从 i18n 删掉的，得一并加回来。
      */}

      <p className="mt-6 text-[12px] leading-6 text-ink-600">{t('download.rights')}</p>
    </div>
  );
}
