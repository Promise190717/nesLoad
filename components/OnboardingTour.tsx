'use client';

import { useEffect, useState } from 'react';
import type { MessageKey } from '@/lib/i18n';
import { useI18n } from './I18nProvider';

/** 一步。`target` 是 CSS 选择器（指向带 `data-tour` 的元素）；null = 不圈，卡片居中。 */
interface Step {
  target: string | null;
  title: MessageKey;
  body: MessageKey;
}

/**
 * 两步，只说**第一次来必须知道**的两件事：怎么把游戏弄进去、右边那一列按钮是干嘛的。
 *
 * 刻意不铺开讲：机身上的按钮（暂停 / 存档 / 读档 / 弹出、音量）不用插卡带就已经
 * 摆在那儿、看一眼就懂；吊灯和那张纸片是彩蛋，**不在这里剧透**。
 */
const STEPS: Step[] = [
  { target: '[data-tour="screen"]', title: 'tour.screen.title', body: 'tour.screen.body' },
  { target: '[data-tour="rail"]', title: 'tour.rail.title', body: 'tour.rail.body' },
];

/** 光圈比目标往外放这么多，描边才不贴着目标本身 */
const PAD = 8;
/** 卡片和光圈之间留的空 */
const GAP = 16;
/** 卡片离窗口边的余量 */
const EDGE = 24;
/**
 * 判断「洞的下方放不放得下」用的最小高度估计。
 * 只用来选上 / 下，不参与真实布局 —— 估小了没关系（真放不下也只是卡片贴着光圈）。
 */
const CARD_MIN_H = 210;
/** 压暗遮罩。浓度和别处那几块面板的背板对齐（`bg-ink-950/70`）。 */
const DIM = 'rgba(0, 0, 0, 0.74)';

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 初次打开时的操作指引：两步，各把一块东西圈出来讲。
 *
 * **目标靠 `data-tour` 属性找，不接 ref**：要圈的两块东西分在 RetroTv / ConsoleScene
 * 两棵树里，为了一个引导给它们接 ref，会把组件的 props 撑开。属性是零耦合的，
 * `querySelector` 找不到就退化成「不圈、卡片居中」，不会崩。
 *
 * 遮罩 + 挖洞用一个透明盒子配一圈 9999px 的实心外阴影 —— box-shadow 画在元素**背后**，
 * 所以洞里的目标原样透出来。比铺四块遮罩好维护得多（也不用管洞在哪个角）。
 *
 * 引导期间**把点击全吃掉**（底下那层全屏 div）：要走下去只能点「下一步 / 跳过」。
 * 不这样的话，用户随手一点就点到了机身（= 弹出选文件框）或某个开关，后面的步骤全对不上。
 *
 * 纯展示层，**自己不记「看过了」** —— 落盘是调用方（ConsoleScene）的事，这个组件只认
 * `open` 和 `onClose`。也正因如此「重看指引」只要把 `open` 再置 true 就行。
 *
 * 窄屏整块隐藏（globals.css 的 `.tour`）：`.stage` 在 900px 以下是 display:none，
 * 机身根本不在，圈出来只会是一个空框，还会盖住那句「请用桌面端」。
 * 隐藏时**不写**「看过了」的标记，所以之后在宽窗口打开还会补上这一遍。
 */
export default function OnboardingTour({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [vh, setVh] = useState(0);

  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  // 每次打开都从第一步开始 —— 「重看操作指引」要能从头走一遍
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  /*
   * 量目标的位置。除了换步要量，窗口 resize 也得重量 —— 机身的尺寸链跟窗口高度有关
   * （吊灯的灯线长度、地板露出多少都随窗口变），只量一次会在缩放之后指偏。
   * 首帧再补量一次：字体还没加载完时排出来的位置和最终的不一样。
   */
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      setVh(window.innerHeight);
      const el = step.target ? document.querySelector(step.target) : null;
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, [open, step]);

  // Esc 关掉，和别的面板一致
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  // 洞的下方放得下就放下方，否则放上方（矮窗口下前面板会贴到窗口底，下面就没地方了）
  const below = !rect || rect.top + rect.height + PAD + GAP + CARD_MIN_H <= vh - EDGE;

  return (
    <div className="tour fixed inset-0 z-[60]">
      {/* 吃点击的那层。刻意不挂 onClick：引导是「一路下一步」，点背板不该把它关掉 */}
      <div className="absolute inset-0" />

      {rect ? (
        <div
          className="pointer-events-none absolute"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: `0 0 0 9999px ${DIM}`,
          }}
        >
          <span className="absolute inset-0 border-2 border-accent" />
        </div>
      ) : (
        <div className="absolute inset-0" style={{ background: DIM }} />
      )}

      {/*
        卡片。用 `top` + `bottom` 一起把「空闲的那一段」框出来，再让卡片贴到靠洞的那一头
        （`items-start` / `items-end`）—— 这样不用去量卡片自身的高度，文案长短都落在空段里。
      */}
      <div
        className={`absolute inset-x-0 flex justify-center px-6 ${
          !rect ? 'items-center' : below ? 'items-start' : 'items-end'
        }`}
        style={
          rect
            ? below
              ? { top: rect.top + rect.height + PAD + GAP, bottom: EDGE }
              : { top: EDGE, bottom: vh - rect.top + PAD + GAP }
            : { top: 0, bottom: 0 }
        }
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('tour.title')}
          className="w-[420px] max-w-full bg-ink-800 pixel-edge pxw-4 pxc-600"
        >
          <div className="flex items-center gap-3 border-b-2 border-ink-900 bg-ink-850 px-4 py-3">
            <span className="text-[12px] text-ink-200">{t(step.title)}</span>
            {/* 纯数字，font-pixel 不会掉字形 */}
            <span className="ml-auto font-pixel text-[8px] text-ink-500">
              {index + 1}/{STEPS.length}
            </span>
          </div>

          {/*
            正文走系统字体 11px，**不用 font-pixel**：Press Start 2P 没有中日韩字形，
            而且正文里会出现 `.nes` / `W A S D` 这类混排 —— 和按键说明、存档列表同一套做法。
          */}
          <div className="flex flex-col gap-3 p-4">
            <p className="text-[11px] leading-relaxed text-ink-300">{t(step.body)}</p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="text-[11px] text-ink-500 transition-colors hover:text-ink-200"
              >
                {t('tour.skip')}
              </button>

              <div className="ml-auto flex gap-2">
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => setIndex((i) => i - 1)}
                    className="pixel-edge pxw-2 pxc-500 bg-ink-700 px-3 py-1.5 text-[11px] text-ink-100 transition-colors hover:bg-ink-600 hover:text-accent"
                  >
                    {t('tour.back')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (last ? onClose() : setIndex((i) => i + 1))}
                  className="pixel-edge pxw-2 pxc-600 bg-accent px-3 py-1.5 text-[11px] text-ink-950 transition-colors hover:bg-accent/80"
                >
                  {last ? t('tour.done') : t('tour.next')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
