/*
 * 窗外那扇窗的季节。
 *
 * 四种：春 / 夏 / 秋 / 冬，点窗户循环到下一季（见 RoomBackdrop 的 RoomWindow）。
 *
 * **默认值按农历判断**，理由和主题、吊灯完全一样：它必须在首屏绘制之前就落到
 * `<html data-season>` 上，否则会先闪一帧冬天再跳到当前季节。所以真正写属性的
 * 是 `app/layout.tsx` 里那段内联脚本（BOOT_INIT）—— 内联脚本没法 import，
 * 那边**手抄了一份**这里的逻辑。
 * ⚠️ **改这里的映射必须同步 layout.tsx 的 BOOT_INIT。**
 *
 * **手动选的季节不落盘**（和主题 / 吊灯不同）：点窗户只在当次会话里生效，
 * 刷新就回到按农历算的那一季。所以这里**没有 localStorage 键**
 * —— 旧的 `nesload:season` 已废弃，没人再读写它。
 *
 * 状态刻意不进 React：属性是唯一真相，React 那份只为 aria 和按钮文案，
 * 挂载后再从属性同步（和 lampOn 一个套路）。
 */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** 点窗户时的循环顺序：春 → 夏 → 秋 → 冬 → 春 */
export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

export function isSeason(value: unknown): value is Season {
  return value === 'spring' || value === 'summer' || value === 'autumn' || value === 'winter';
}

/** 下一季（走到冬之后回到春） */
export function nextSeason(current: Season): Season {
  return SEASONS[(SEASONS.indexOf(current) + 1) % SEASONS.length];
}

/**
 * 农历月（1..12）。闰月也算它本来的那个月（闰四月 → 4）。
 *
 * 用 `Intl` 的 chinese 日历，不自己搬那张 1900–2100 的压缩表：
 * 浏览器和 Node 都自带 ICU 数据，几百行的表纯是维护负担。
 * 环境不支持时（极老的浏览器、精简 ICU）退回公历月 —— 季节最多差半个月，
 * 总比整个功能挂掉强。
 */
function lunarMonth(date: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-chinese', { month: 'numeric' }).formatToParts(
      date
    );
    const value = parts.find((part) => part.type === 'month')?.value;
    const month = Number.parseInt(value ?? '', 10);
    if (month >= 1 && month <= 12) return month;
  } catch {
    // 落到下面的公历兜底
  }
  return date.getMonth() + 1;
}

/**
 * 当前该显示哪一季。
 *
 * 按**农历月**分：正月–三月春、四月–六月夏、七月–九月秋、十月–十二月冬。
 *
 * 这和「按农历节日判断」是同一件事，只是不用去定「离哪个节日最近」的边界规则：
 * 春节、端午、中秋、冬至正好各落在一个季节的头一个月
 * （正月 / 五月 / 八月 / 十一月），所以按月份分 == 按这四个大节日分。
 */
export function seasonOf(date: Date = new Date()): Season {
  const month = lunarMonth(date);
  if (month <= 3) return 'spring';
  if (month <= 6) return 'summer';
  if (month <= 9) return 'autumn';
  return 'winter';
}
