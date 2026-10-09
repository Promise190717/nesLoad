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

/** 一盘卡带露出来的那一面有多高。卡带架按这个高度分格。 */
export const CART_HEIGHT = LABEL_HEIGHT + EDGE_HEIGHT;

/**
 * 标贴右端留给移除键的空白宽度（架子里悬停时才出现的那一键）。
 * 之所以要**永久**留出来而不是悬停时才腾：后者会让名字在悬停瞬间重排、看起来像抖了一下。
 */
export const REMOVE_ZONE = 20;

interface CartridgeSpriteProps {
  name: string;
  consoleType: ConsoleType;
  /** 当前正在运行的这盘 */
  active?: boolean;
  /** 被鼠标拎起来时的那份克隆 */
  floating?: boolean;
}

/**
 * 一盘卡带露出来的那一面。
 *
 * 卡带平放时，正面看到的就是这两条：上面是标贴的前缘（名字在这），
 * 下面是塑料前缘的厚度。所以卡带不是「一条色块」，而是「标贴 + 厚度」两段，
 * 两段之间不留缝 —— 卡带是贴着的。
 *
 * 宽度交给父容器（w-full），两个父容器各定各的：机身卡槽里那盘 288px，
 * 卡带架里那盘和拎在手上的那份 CART_WIDTH（见 CartridgeRack）。
 * 注意拎在手上那份是 fixed 定位，父容器必须显式给宽度 —— 否则 w-full
 * 会以「收缩到内容」的宽度为基准，直接算成 0。
 */
export default function CartridgeSprite({
  name,
  consoleType,
  active = false,
  floating = false,
}: CartridgeSpriteProps) {
  return (
    <div className={`w-full ${floating ? 'opacity-95' : ''}`}>
      {/*
        标贴。右端永久留出 REMOVE_ZONE 的空白：架子里悬停会在这里出现移除键，
        名字和机种字都排在它左边 —— 那一键因此压不到任何字上，
        也不用靠「让卡带挪位」或「把机种字藏起来」来腾地方。
      */}
      <div
        className={`relative flex items-center bg-ink-200 pixel-edge pxw-2 ${
          active ? 'pxc-accent' : 'pxc-600'
        }`}
        style={{ height: LABEL_HEIGHT, paddingRight: REMOVE_ZONE }}
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
        本体用 ink-600 而不是更深的灰 —— 架子是不刷底色的，卡带后面透过去就是
        墙和地板（ink-950 一档），用深灰的话卡带下半截会直接消失在背景里，
        整架只剩十条悬空的标贴。
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
