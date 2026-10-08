import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Cartridge } from '@/lib/library';
import { MAX_CARTRIDGES } from '@/lib/library';
import CartridgeSprite, { CART_HEIGHT, REMOVE_ZONE } from './CartridgeSprite';
import { useI18n } from './I18nProvider';

/**
 * 卡带宽度。也是被拎在手上那份的宽度 —— 两边必须一致，
 * 否则按下指针的一瞬间卡带会突然变宽。
 */
export const CART_WIDTH = 200;

/** 左右两根立柱的宽度。卡带就卡在这两根柱子中间。 */
const POST_WIDTH = 8;
/** 每一格下面那根横档的高度。 */
const RAIL_HEIGHT = 6;
/** 顶板 / 底板比架身宽出来的量 —— 上沿和下沿各压出一道边，架子才立得住。 */
const CAP_OVERHANG = 2;
const TOP_CAP_HEIGHT = 18;
const BOTTOM_CAP_HEIGHT = 12;

const RACK_WIDTH = CART_WIDTH + POST_WIDTH * 2;
const CAP_WIDTH = RACK_WIDTH + CAP_OVERHANG * 2;

interface CartridgeRackProps {
  cartridges: Cartridge[];
  activeId: string | null;
  /** 按住卡带可以把它拎起来拖到卡槽里 */
  onPickUp: (cartridge: Cartridge, e: ReactPointerEvent<HTMLDivElement>) => void;
  onLaunch: (id: string) => void;
  onRemove: (id: string) => void;
}

/**
 * 卡带架：立在电视机右侧的一格架子，最近载入的排在最上面。
 *
 * 关键在「架子」两个字 —— 它是**开放式**的：两根立柱从顶到底都在，每一格下面
 * 一根横档横穿整架，卡带躺在横档上、两端各露出一截横档。结构全露在外面，
 * 所以它读起来是一件器物，而不是一块开了几道槽的面板（盒子式的做法栽过两次）。
 *
 * 架子本身不刷底色：横档之间、立柱以内透过去就是墙和地板 —— 真的架子是能看穿的。
 *
 * 卡带、横档、立柱三者用不同的明度分层（标贴最亮 → 横档 → 卡带塑料前缘 → 立柱），
 * 深度就靠这个层次读出来，而不是靠描边。
 */
export default function CartridgeRack({
  cartridges,
  activeId,
  onPickUp,
  onLaunch,
  onRemove,
}: CartridgeRackProps) {
  const { t } = useI18n();
  const empty = cartridges.length === 0;

  return (
    <div
      className="relative flex shrink-0 flex-col items-center"
      style={{ width: CAP_WIDTH }}
    >
      {/* 顶板：架子的上沿，兼作铭牌（名字 + 计数） */}
      <div
        className="relative flex w-full items-center gap-2 bg-ink-800 px-2"
        style={{ height: TOP_CAP_HEIGHT }}
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-ink-500/35" />
        {/* 和机身前面板的 PWR 同一个意思：架子里有一盘正在跑，灯就亮 */}
        <span
          className={`relative h-[5px] w-[5px] shrink-0 ${activeId ? 'bg-accent' : 'bg-ink-600'}`}
        />
        <span className="relative truncate text-[10px] text-ink-300">{t('library.recent')}</span>
        <span className="relative ml-auto shrink-0 pl-2 font-pixel text-[6px] text-ink-400">
          {String(cartridges.length).padStart(2, '0')}/{MAX_CARTRIDGES}
        </span>
      </div>

      {/* 架身：不刷底色，两根立柱 + 一根根横档把结构撑起来 */}
      <div className="relative" style={{ width: RACK_WIDTH }}>
        {/* 立柱：垫在整架最后面，横档从它们前面穿过去 */}
        <span className="absolute inset-y-0 left-0 bg-ink-700" style={{ width: POST_WIDTH }}>
          <span className="pointer-events-none absolute inset-y-0 left-0 w-[1px] bg-ink-500/30" />
        </span>
        <span className="absolute inset-y-0 right-0 bg-ink-700" style={{ width: POST_WIDTH }}>
          <span className="pointer-events-none absolute inset-y-0 right-0 w-[1px] bg-ink-500/30" />
        </span>

        {empty ? (
          <p className="relative px-4 py-3 text-[10px] leading-relaxed text-ink-400">
            {t('library.empty')}
          </p>
        ) : (
          <div className="relative flex flex-col">
            {cartridges.map((cartridge) => (
              <div
                key={cartridge.id}
                className="relative w-full"
                style={{ height: CART_HEIGHT + RAIL_HEIGHT }}
              >
                {/* 横档：整架宽，卡带压在它上面，两端各露一截 */}
                <span
                  className="pointer-events-none absolute inset-x-0 bottom-0 bg-ink-500"
                  style={{ height: RAIL_HEIGHT }}
                >
                  <span className="absolute inset-x-0 top-0 h-[1px] bg-ink-400/45" />
                  <span className="absolute inset-x-0 bottom-0 h-[1px] bg-ink-950/55" />
                </span>

                {/* 卡带正好卡在两根立柱中间 */}
                <div
                  className="group relative z-10 mx-auto cursor-grab active:cursor-grabbing"
                  style={{ width: CART_WIDTH }}
                >
                  <button
                    type="button"
                    onClick={() => onLaunch(cartridge.id)}
                    title={t('library.launchTitle', { name: cartridge.name })}
                    className="block w-full cursor-pointer"
                  >
                    <CartridgeSprite
                      name={cartridge.name}
                      consoleType={cartridge.console}
                      active={cartridge.id === activeId}
                    />
                  </button>
                  {/*
                    移除键落在标贴右端那块永久留白里（REMOVE_ZONE，见 CartridgeSprite）——
                    名字和机种字都排在它左边，所以它压不到任何字上。
                  */}
                  <button
                    type="button"
                    aria-label={t('library.removeLabel', { name: cartridge.name })}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(cartridge.id);
                    }}
                    className="pixel-edge pxw-2 pxc-500 absolute right-[2px] top-[2px] hidden h-[16px] items-center justify-center bg-ink-800 text-[9px] leading-none text-ink-100 group-hover:flex group-focus-within:flex hover:bg-danger hover:text-ink-950"
                    style={{ width: REMOVE_ZONE - 2 }}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底板 */}
      <div className="relative w-full bg-ink-800" style={{ height: BOTTOM_CAP_HEIGHT }}>
        <span className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-ink-500/30" />
      </div>

      {/* 落地阴影：和电视机同一条地平线，架子才是放在地上的 */}
      <span className="ground-shadow pointer-events-none absolute inset-x-3 -bottom-[6px] h-[6px]" />
    </div>
  );
}
