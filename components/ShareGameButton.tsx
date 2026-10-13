'use client';

import { useEffect, useState } from 'react';
import { useI18n } from './I18nProvider';
import { ShareIcon } from './icons';

/**
 * 详情页那颗「分享游戏」：点一下把**这一页的地址**复制进剪贴板，1.6 秒后自己变回原样
 * （用户 2026-10-12 要的，挨着「下载 ROM」放）。
 *
 * 为什么是**独立的小客户端组件**而不是就地写在详情页里：`/games/[id]` 是服务端组件
 * （要能被整段读走、首屏就有正文，见那边注释），复制这件事必须有事件处理，塞不进去。
 * 拆出来还有个附带好处 —— 只有这一颗按钮进客户端 bundle，正文与资料表仍是纯服务端渲染。
 *
 * 复制的是**服务端算好的绝对地址**（`resolveSiteOrigin() + /games/<id>`，和 canonical 同一个），
 * **不用 `window.location`**：这一页的地址还可能带着 `?id=` 之类的参数从别处进来，
 * 而分享出去的应该是那条规范地址 —— 别人打开就是干干净净的详情页。
 *
 * 成功 / 失败都给反馈：剪贴板是**经常被拒**的能力（非安全上下文、浏览器权限、
 * 有的浏览器只在用户手势的第一跳里放行）。静默失败的话用户会以为点了个寂寞，
 * 所以至少把「复制失败」说清楚，让他退回地址栏手抄。
 */
export default function ShareGameButton({ url }: { url: string }) {
  const { t } = useI18n();
  const [result, setResult] = useState<'idle' | 'ok' | 'fail'>('idle');

  // 提示过一会儿自己收回去（和 NetplayPanel 那颗复制钮同一个节奏）
  useEffect(() => {
    if (result === 'idle') return;
    const timer = setTimeout(() => setResult('idle'), 1600);
    return () => clearTimeout(timer);
  }, [result]);

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        /*
         * 兜底：非安全上下文（http 部署、老浏览器）里没有 clipboard API。
         * 老办法是插一个离屏 textarea、选中、`execCommand('copy')` 再摘掉。
         * 它已标废弃，但正因为它「还活着」，才值得留在这里当退路。
         */
        const area = document.createElement('textarea');
        area.value = url;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.top = '-1000px';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(area);
        if (!ok) throw new Error('execCommand copy returned false');
      }
      setResult('ok');
    } catch {
      setResult('fail');
    }
  };

  const label =
    result === 'ok'
      ? t('gamesPage.shareCopied')
      : result === 'fail'
        ? t('gamesPage.shareFailed')
        : t('gamesPage.share');

  /*
   * 常态字色 = `accent`（2026-10-13 用户要「修改文字颜色」）：这一页的「文字链接」口径
   * 就是强调色（同一页资料表里那个「开发商」链接用的也是它），比原来那档暗灰一眼看得出
   * 是**能点的东西**。钮身上没有描边可依托，反馈就全压在字上 ——
   *   · 常态 / 悬停：换**颜色**（accent → 下划线）；
   *   · 成 / 败：换色（`text-ok` / `text-danger`，1.6 秒后褪回）。
   * 只换文案在安静的一行里太容易被眼角漏掉。
   */
  const tone =
    result === 'ok' ? 'text-ok' : result === 'fail' ? 'text-danger' : 'text-accent';

  return (
    <button
      type="button"
      onClick={copy}
      /*
       * 成功 / 失败都只在按钮文字上体现，不动 aria-label —— 名字变来变去反而让人迷惑
       */
      aria-label={t('gamesPage.share')}
      className={`group inline-flex items-center gap-1.5 text-[12px] transition-colors ${tone}`}
    >
      {/*
        头像走 `ShareIcon`（`aria-hidden` 在图标里），尺寸**必须传 16** ——
        非整数倍会在 DPR=1 的屏上把 1 单位的线吃掉（见 icons.tsx 文件头那条）。
      */}
      <ShareIcon size={16} />
      {/*
        ⚠️ 下划线只加在**文字**上（`group-hover`），不是整颗钮：钮是 `inline-flex`，
        直接 `hover:underline` 能不能落到字上取决于浏览器对原子内联盒装饰传播的实现，
        写在文字这一层是确定的。图标也不该被划线（它是图形，不是文本）。
      */}
      <span className="group-hover:underline">{label}</span>
    </button>
  );
}
