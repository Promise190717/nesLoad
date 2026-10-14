import Link from 'next/link';
import { CONSOLE_LABEL } from '@/lib/consoles';
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
  const name = text?.name ?? CONSOLE_LABEL[type];

  return (
    <Link
      href={localePath(locale, `/consoles/${type}`)}
      className="pixel-edge pxw-2 pxc-700 flex h-full flex-col items-center gap-2 bg-ink-900 p-4 text-center transition-colors hover:bg-ink-800"
    >
      {row?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={row.imageUrl} alt="" loading="lazy" className="pixel-edge pxw-2 pxc-700 h-[72px] w-[72px] shrink-0 bg-ink-950 object-contain" />
      ) : (
        <span aria-hidden="true" className="pixel-edge pxw-2 pxc-700 flex h-[72px] w-[72px] shrink-0 items-center justify-center bg-ink-950 font-pixel text-[16px] text-ink-600">
          {CONSOLE_LABEL[type]}
        </span>
      )}
      <span className="w-full text-[12px] leading-5 text-ink-100">{name}</span>
      <span className="font-pixel text-[12px] text-ink-400">{CONSOLE_LABEL[type]}</span>
      <span className="font-pixel text-[12px] text-accent">
        {translate(locale, 'consolesPage.gameCount', { count })}
      </span>
      {text?.summary && (
        <span className="line-clamp-2 text-[12px] leading-4 text-ink-500">{text.summary}</span>
      )}
    </Link>
  );
}
