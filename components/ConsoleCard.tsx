import Link from 'next/link';
import { consoleLabel } from '@/lib/consoles';
import type { ConsoleType } from '@/lib/emulator';
import { localePath, translate, type Locale } from '@/lib/i18n';
import { localizeConsole, type Console } from '@/lib/server/consoles';

export default function ConsoleCard({ type, row, count, locale }: {
  type: ConsoleType;
  row: Console | null;
  count: number;
  locale: Locale;
}) {
  const text = row ? localizeConsole(row, locale) : null;
  const name = text?.name ?? consoleLabel(type, locale);

  return (
    <Link
      href={localePath(locale, `/consoles/${type}`)}
      /*
       * ⚠️ **必须关预取**（2026-10-23）：首页一次画 14 张机种卡，开着预取就是每来一个
       *    访客额外渲染 14 次机种专题页。免费版 Workers 每请求只有 10ms CPU，这批
       *    预取请求是「错误率 54%」的主力之一。理由同 `GameCardGrid` 那条。
       */
      prefetch={false}
      className="pixel-edge pxw-2 pxc-700 flex h-full flex-col items-center gap-2 bg-ink-900 p-4 text-center transition-colors hover:bg-ink-800"
    >
      {row?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={row.imageUrl} alt="" loading="lazy" className="pixel-edge pxw-2 pxc-700 h-[72px] w-[72px] shrink-0 bg-ink-950 object-contain" />
      ) : (
        <span aria-hidden="true" className="pixel-edge pxw-2 pxc-700 flex h-[72px] w-[72px] shrink-0 items-center justify-center bg-ink-950 font-pixel text-[16px] text-ink-600">
          {consoleLabel(type, locale)}
        </span>
      )}
      <span className="w-full text-[12px] leading-5 text-ink-100">{name}</span>
      <span className="font-pixel text-[12px] text-ink-400">{consoleLabel(type, locale)}</span>
      <span className="font-pixel text-[12px] text-accent">
        {translate(locale, 'consolesPage.gameCount', { count })}
      </span>
      {text?.summary && (
        <span className="line-clamp-2 text-[12px] leading-4 text-ink-500">{text.summary}</span>
      )}
    </Link>
  );
}
