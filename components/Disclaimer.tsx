import { disclaimer } from '@/lib/disclaimer';
import type { Locale } from '@/lib/i18n';

/**
 * 页脚最底下那句免责声明。
 *
 * 2026-11-03 加，用户参考站（retrogamesnexus.com）的页脚就是这么收尾的：
 * 分隔线 → 一行小字，讲清「本站和权利人的关系 / 内容来源 / 权利人怎么找我们」。
 *
 * **做成组件而不是在三个页脚各写一遍**：本站有三处页脚（首页、
 * `GamesShell` 内容页外壳、`DocPage` 文档页外壳），文案改一次要记得改三处，
 * 漏一处就是同一站里出现两种说法 —— 而这是唯一一句会被当成法律表述来读的话。
 * 版式也一起收在这里，三处看起来才会是一样的。
 *
 * ⚠️ 它是**服务端组件**（没有 `'use client'`）：只吃一个 `locale`，没有状态。
 *    `DocPage` 是客户端组件，客户端 import 服务端组件在这里是合法的 ——
 *    它本来就没有任何服务端专属 API（不读 cookie、不碰数据库），
 *    所以打包器会直接把它跟进去。
 *
 * ⚠️ 文案的唯一出处是 `lib/disclaimer.ts` 的 `disclaimer()`（**18 种语言全覆盖**），
 *    别在这附近手写第二份。它单独一个文件而不是并进 `lib/site-doc.ts`，是因为
 *    这个组件会被客户端组件 import（`DocPage`、`RomDownloadGate`），那边不想连带
 *    把关于 / 联系两篇长文打进 bundle。
 *
 * ⚠️ 2026-11-03 之前下载页自己另写了一句（i18n 的 `download.disclaimer`），和这里
 *    两套说法，用户要求统一后已删除 —— 现在下载页也渲染这个组件，**别再分叉**。
 */
export default function Disclaimer({ locale, className = '' }: { locale: Locale; className?: string }) {
  const { label, text } = disclaimer(locale);

  /*
   * 两档颜色各提一层（2026-11-05）：原来是 11px 的 `ink-600` 压 `ink-500`，
   * 浅色主题下前者对页脚底约 1.8:1 —— 法律表述读不清就不是「低调」而是「没有」。
   * 提一档之后仍是页脚里最弱的一行（正文 500 / 标签 400），但两个主题都读得出来。
   */
  return (
    <div className={`mt-4 border-t border-ink-800 pt-4 ${className}`.trim()}>
      <p className="text-[11px] leading-6 text-ink-500">
        <span className="text-ink-400">{label}</span> {text}
      </p>
    </div>
  );
}
