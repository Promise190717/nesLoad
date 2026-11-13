'use client';

import type { ReactNode } from 'react';

/**
 * 游戏覆盖层的共用控件 —— **CF（穿越火线）的客户端视觉**。
 *
 * ## 这套配色的规矩
 *
 * 底色是近黑（#0e1114 / #151a1f），强调色只有一种橙金（#f0a020），
 * 边框一律 1px 深灰（#343a42），**直角**，不要圆角 —— CF 的界面没有任何
 * 圆润的卡片，全是硬边矩形 + 亮色描边。
 *
 * 为什么这里写死深色：站点有明暗两套主题（`ink-*` 跟着 `<html data-theme>` 翻），
 * 但**游戏画面不是站点**。覆盖层压在自成一体的货场画面上，浅色面板会糊成一片。
 *
 * 只有一件事例外：面板之外那些**回站点的链接**（返回专栏）仍然用主题色，因为它们
 * 属于站点导航，不属于游戏。
 */

/** 面板：近黑底 + 1px 深灰边 + 顶部一道橙金装饰条。 */
export function GamePanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`border border-[#343a42] bg-[#0f1318]/97 text-white shadow-[0_24px_80px_rgba(0,0,0,.75)] backdrop-blur-sm ${className}`}
    >
      {/* 顶部橙条：CF 每个面板顶上都有这么一道，是整套 UI 的识别点 */}
      <div className="h-[2px] w-full bg-gradient-to-r from-[#f0a020] via-[#f0a020]/45 to-transparent" />
      <div className="p-5">{children}</div>
    </div>
  );
}

/** 面板标题：橙色竖条 + 粗体字。所有面板的小标题统一走这里。 */
export function PanelTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <span className="h-[15px] w-[3px] bg-[#f0a020]" />
        <h2 className="text-[17px] leading-none font-bold tracking-wide">{title}</h2>
      </div>
      {subtitle ? <p className="mt-1.5 pl-[11px] text-[11px] leading-4 text-white/40">{subtitle}</p> : null}
    </div>
  );
}

export function GameButton({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  className = '',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const styles =
    variant === 'primary'
      ? 'bg-[#f0a020] text-[#1a1206] hover:bg-[#ffb84d] active:bg-[#d98c12]'
      : variant === 'danger'
        ? 'border border-[#8a3030] text-[#ff8a8a] hover:bg-[#8a3030]/22'
        : 'border border-[#343a42] text-white/75 hover:border-[#f0a020]/60 hover:text-white';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 text-[13px] font-bold tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  /**
   * 角标数字（如「加入房间」页签上的房间数）。0 / 省略都不画 ——
   * 角标只在该「有东西可看」时出现，恒 0 的角标是噪声。
   */
  badge?: number;
}

/** 分段选择器：方格按钮，选中项橙金实底。 */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`inline-flex gap-[2px] border border-[#343a42] bg-black/45 p-[2px] ${className}`}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            className={`min-w-[30px] px-2.5 py-1 text-[12px] font-bold whitespace-nowrap transition-colors ${
              active ? 'bg-[#f0a020] text-[#1a1206]' : 'text-white/55 hover:bg-white/6 hover:text-white/85'
            }`}
          >
            <span className="flex items-center gap-1.5">
              {option.label}
              {/* 角标：选中态底已经是橙金，角标翻成暗底亮字；未选中态反过来。
                  两态都必须能读出来，不能只靠颜色 */}
              {option.badge ? (
                <span
                  className={`min-w-[16px] px-1 text-center font-mono text-[10px] leading-[16px] tabular-nums ${
                    active ? 'bg-black/30 text-white' : 'bg-[#f0a020] text-[#1a1206]'
                  }`}
                >
                  {option.badge}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export interface TabOption<T extends string> {
  value: T;
  label: string;
  /** 页签下方的小字（模式规模、人数上限之类）。可省略 */
  hint?: string;
}

/**
 * 页签条 —— 模式选择那张表的两个页签走这里。
 *
 * 和 `Segmented` 的分工：`Segmented` 是「同一个面板里换一档参数」（难度、画质），
 * 尺寸小、嵌在字段行里；这里的页签是**换一整块内容**，所以用 CF 的写法 ——
 * 直角、无底色、选中项底部一道橙金，未选中只有灰字。
 */
export function Tabs<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T;
  options: readonly TabOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex gap-1 border-b border-[#343a42] ${className}`} role="tablist">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={`relative -mb-px flex min-w-[112px] flex-col items-start gap-0.5 border-b-2 px-4 py-2.5 text-left transition-colors sm:min-w-[148px] ${
              active
                ? 'border-[#f0a020] bg-[#f0a020]/8'
                : 'border-transparent hover:border-white/25 hover:bg-white/4'
            }`}
          >
            <span
              className={`text-[14px] leading-none font-bold tracking-wide ${
                active ? 'text-[#f0a020]' : 'text-white/55'
              }`}
            >
              {option.label}
            </span>
            {option.hint ? (
              <span className={`font-mono text-[10px] leading-none ${active ? 'text-white/45' : 'text-white/25'}`}>
                {option.hint}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  display: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-[11px] tracking-wide text-white/55">
        <span>{label}</span>
        <span className="font-mono text-[11px] tabular-nums text-[#f0a020]/85">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1 w-full cursor-pointer appearance-none bg-white/12 accent-[#f0a020]"
      />
    </label>
  );
}

/** 一行「标签 —— 控件」。面板里的规则项都是这个形状。 */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/6 py-2 last:border-b-0">
      <span className="text-[12px] text-white/55">{label}</span>
      {children}
    </div>
  );
}

/** 细分隔线：面板内部偶尔要分组，用一条 1px 的线而不是留白。 */
export function Divider() {
  return <div className="my-3 h-px w-full bg-white/8" />;
}
