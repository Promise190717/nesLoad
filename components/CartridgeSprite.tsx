import type { ConsoleType } from '@/lib/emulator';

export const CONSOLE_LABEL: Record<ConsoleType, string> = {
  nes: 'NES',
  snes: 'SFC',
  arcade: 'ARC',
};

/** 端头色块：一眼区分机种，同时不破坏整体灰阶 */
const CONSOLE_TINT: Record<ConsoleType, string> = {
  nes: '#e8b339',
  snes: '#6fa8c9',
  arcade: '#c96f6f',
};

/** 标贴高度。名字印在这一条上。 */
const LABEL_HEIGHT = 20;
/** 塑料前缘的厚度。卡带是立体的，露出来的这一面必须看得见它的厚度。 */
const EDGE_HEIGHT = 10;

/** 标贴右端的留白：名字和机种字都排在它左边，整块标贴右侧因此不贴边。 */
const LABEL_PAD_RIGHT = 20;

interface CartridgeSpriteProps {
  name: string;
  consoleType: ConsoleType;
  /** 当前正在运行的这盘 */
  active?: boolean;
}

/**
 * 一盘卡带露出来的那一面。
 *
 * 卡带平放时，正面看到的就是这两条：上面是标贴的前缘（名字在这），
 * 下面是塑料前缘的厚度。所以卡带不是「一条色块」，而是「标贴 + 厚度」两段，
 * 两段之间不留缝 —— 卡带是贴着的。
 *
 * 宽度交给父容器（w-full）自己定。
 * 注意父容器必须**显式**给宽度 —— sprite 是 w-full，父容器要是 flex-col + items-center
 * 就不会横向拉伸子项，w-full 会一路算到机身宽度上。
 *
 * **2026-10-09 起默认导出已经没人引用了**：插卡舱撤掉之后，机身上不再有卡带可见物
 * （现在「插着哪盘」由屏幕里的画面表达）。还在被用的是上面的 `CONSOLE_LABEL`
 * （`AdminGames` / `GameLibraryPanel` 拿它当机种标签），所以文件留着。
 * 要彻底清掉的话，把默认导出和 `CONSOLE_TINT` / `LABEL_*` / props 一起删。
 */
export default function CartridgeSprite({
  name,
  consoleType,
  active = false,
}: CartridgeSpriteProps) {
  return (
    <div className="w-full">
      {/*
        标贴。右端留出 LABEL_PAD_RIGHT 的空白，名字和机种字都排在它左边。
      */}
      <div
        className={`relative flex items-center bg-ink-200 pixel-edge pxw-2 ${
          active ? 'pxc-accent' : 'pxc-600'
        }`}
        style={{ height: LABEL_HEIGHT, paddingRight: LABEL_PAD_RIGHT }}
      >
        <span
          className="h-full w-[5px] shrink-0"
          style={{ backgroundColor: CONSOLE_TINT[consoleType] }}
        />
        <span className="min-w-0 flex-1 truncate px-2 text-[10px] text-ink-950">{name}</span>
        <span className="shrink-0 pr-1 font-pixel text-[6px] text-ink-800">
          {CONSOLE_LABEL[consoleType]}
        </span>
      </div>

      {/*
        塑料前缘：卡带的厚度。
        本体用 ink-600 而不是更深的灰：下半截要跟机身的深灰（ink-850 / ink-950 一档）
        拉开，再深下去就只剩上面那条标贴了。
      */}
      <div className="relative bg-ink-600" style={{ height: EDGE_HEIGHT }}>
        <span className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-ink-400/60" />
        <span className="pointer-events-none absolute inset-x-0 top-1/2 h-[1px] bg-ink-950/35" />
        <span className="pointer-events-none absolute right-[12px] top-1/2 h-[4px] w-[18px] -translate-y-1/2 bg-ink-950/45" />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[1px] bg-ink-950/50" />
      </div>
    </div>
  );
}
