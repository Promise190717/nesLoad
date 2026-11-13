'use client';

import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import type { Locale } from '@/lib/i18n';
import type { InputController } from '@/lib/h5/input';
import { h5Text } from '@/lib/h5/ui-text';

/**
 * 触屏操作层：左下虚拟摇杆 + 右下开火键 + 右侧全屏转视角区。
 *
 * ## 为什么不是「左半屏拖 = 移动、右半屏拖 = 转视角」
 *
 * 那种方案在手机上很难用：手指没有参照物，推着推着就跑到屏幕边缘，得抬手重按。
 * 摇杆有固定的圆心，手指推出去多远就是多快的速度，松手自动回中 —— 这才是手机
 * 上能瞄准的形态。
 *
 * ## 转视角区为什么要铺满右半屏
 *
 * 因为玩家的拇指落点每次都不一样。给一个固定大小的「视角盘」会让人不断去够它；
 * 铺满右半屏之后，**按在哪里都能拖**，按键浮在最上层单独接管自己的点击。
 *
 * ## 所有事件都走 `pointerdown/move/up`
 *
 * 不写 `touchstart` + `mousedown` 两套 —— `PointerEvent` 在手机上就是触摸、
 * 在桌面上就是鼠标，一套代码两边都对，而且自带 `setPointerCapture`（手指滑出
 * 元素范围也不会丢事件，这是摇杆不「粘住」的关键）。
 */

/** 摇杆半径（像素）。手指最多推到这么远。 */
const STICK_RADIUS = 46;

export default function ShipTouchControls({
  controller,
  locale,
  onOpenBuy,
}: {
  controller: InputController | null;
  locale: Locale;
  onOpenBuy: () => void;
}) {
  const stickRef = useRef<HTMLDivElement | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });

  const lookPointer = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });
  /**
   * 摇杆当前归属的触点 id。
   *
   * 🔴 没有它就是「移动瞬移」的来源：pointermove 对任何落在摇杆上的触点都会触发，
   * 第二根手指（掌缘、重新握持）一碰摇杆，移动轴就被猛拉到那根手指的位置 ——
   * 奔跑中的角色瞬间变向；而先按下的手指抬起时又会把轴清零，明明还按着却不走了。
   * 一根手指从按下到抬起独占摇杆，其余触点一律忽略。
   */
  const stickPointer = useRef<number | null>(null);

  // 控制层卸载（死亡 / 换枪菜单 / 暂停都会整块摘掉）时，按住的虚拟输入必须清掉，
  // 否则摇杆轴会一直卡在「按下」，重生后角色自己往前跑
  useEffect(() => {
    return () => {
      controller?.setMoveAxis(0, 0);
      controller?.setAim(false);
      controller?.setFire(false);
    };
  }, [controller]);

  /* ---------- 摇杆 ---------- */

  const moveStick = (clientX: number, clientY: number) => {
    const element = stickRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const distance = Math.hypot(dx, dy);
    if (distance > STICK_RADIUS) {
      dx = (dx / distance) * STICK_RADIUS;
      dy = (dy / distance) * STICK_RADIUS;
    }

    setKnob({ x: dx, y: dy, active: true });
    // 屏幕 y 向下为正，但「前进」应该是 y 向上，所以取负
    controller?.setMoveAxis(dx / STICK_RADIUS, -dy / STICK_RADIUS);
  };

  const releaseStick = () => {
    setKnob({ x: 0, y: 0, active: false });
    controller?.setMoveAxis(0, 0);
  };

  /* ---------- 转视角 ---------- */

  const onLookDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (lookPointer.current !== null) return;
    lookPointer.current = event.pointerId;
    lookLast.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onLookMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (lookPointer.current !== event.pointerId) return;
    const dx = event.clientX - lookLast.current.x;
    const dy = event.clientY - lookLast.current.y;
    lookLast.current = { x: event.clientX, y: event.clientY };
    controller?.addLookDelta(dx, dy);
  };

  const onLookUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (lookPointer.current !== event.pointerId) return;
    lookPointer.current = null;
    // pointercancel 时浏览器已经隐式放掉了 capture，直接 release 会抛
    // NotFoundError —— 先问一次再放
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  /* ---------- 按键 ---------- */

  const tap = (action: Parameters<InputController['setVirtual']>[0]) => () => {
    controller?.setVirtual(action, true);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* 转视角区：右半屏。放在按键**下面**（z 更低），按键才点得到 */}
      <div
        className="pointer-events-auto absolute top-0 right-0 bottom-0 left-[38%] touch-none"
        onPointerDown={onLookDown}
        onPointerMove={onLookMove}
        onPointerUp={onLookUp}
        onPointerCancel={onLookUp}
      />

      {/* 摇杆 */}
      <div
        ref={stickRef}
        className="pointer-events-auto absolute bottom-5 left-5 h-[104px] w-[104px] touch-none rounded-full border border-white/18 bg-black/28"
        onPointerDown={(event) => {
          // 已有手指占着摇杆时，第二根手指不接管（防止移动轴被猛拉到新触点）
          if (stickPointer.current !== null) return;
          stickPointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          moveStick(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          // 只认占用者的移动：其余触点（含悬停的鼠标）一律忽略
          if (event.pointerId !== stickPointer.current) return;
          moveStick(event.clientX, event.clientY);
        }}
        onPointerUp={(event) => {
          if (event.pointerId !== stickPointer.current) return;
          stickPointer.current = null;
          releaseStick();
        }}
        onPointerCancel={(event) => {
          if (event.pointerId !== stickPointer.current) return;
          stickPointer.current = null;
          releaseStick();
        }}
      >
        <span
          className="absolute top-1/2 left-1/2 h-11 w-11 rounded-full border border-[#f0a020]/55 bg-[#f0a020]/25"
          style={{
            transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
            transition: knob.active ? 'none' : 'transform 120ms ease-out',
          }}
        />
      </div>

      {/* 右下功能键 */}
      <div className="pointer-events-auto absolute right-4 bottom-4 flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          <TouchButton label={h5Text(locale, 'touch.grenade')} onTap={tap('quickGrenade')} />
          <TouchButton label={h5Text(locale, 'touch.reload')} onTap={tap('reload')} />
          <TouchButton label={h5Text(locale, 'touch.jump')} onTap={tap('jump')} />
        </div>

        <div className="flex items-center gap-2">
          {/* 换枪：触屏上没有 B 键，所以用 `touch.buy` 而不是 `hud.spawnHint`
              （后者写的是「按 B 换枪」，在手机上不成立） */}
          <TouchButton label={h5Text(locale, 'touch.buy')} onTap={onOpenBuy} small />
          <TouchButton
            label={h5Text(locale, 'touch.aim')}
            onDown={() => controller?.setAim(true)}
            onUp={() => controller?.setAim(false)}
          />
          {/* 开火键做得最大：它是唯一一个「按住不放」的键 */}
          <button
            type="button"
            className="flex h-[72px] w-[72px] touch-none items-center justify-center rounded-full border border-[#f0a020]/60 bg-[#f0a020]/22 text-[12px] font-bold text-[#ffd9a0] active:bg-[#f0a020]/45"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              controller?.setFire(true);
            }}
            onPointerUp={() => controller?.setFire(false)}
            onPointerCancel={() => controller?.setFire(false)}
          >
            {h5Text(locale, 'touch.fire')}
          </button>
        </div>
      </div>
    </div>
  );
}

function TouchButton({
  label,
  onTap,
  onDown,
  onUp,
  small = false,
}: {
  label: string;
  onTap?: () => void;
  onDown?: () => void;
  onUp?: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      className={`touch-none rounded-full border border-white/22 bg-black/32 font-semibold text-white/72 active:bg-white/16 ${
        small ? 'h-9 px-2.5 text-[10px]' : 'h-[52px] w-[52px] text-[11px]'
      }`}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        onDown?.();
        onTap?.();
      }}
      onPointerUp={() => onUp?.()}
      onPointerCancel={() => onUp?.()}
    >
      {label}
    </button>
  );
}
