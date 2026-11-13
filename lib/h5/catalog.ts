import type { Locale } from '../i18n';
import { h5Text } from './ui-text';

/**
 * H5 小游戏专栏的**登记表**。
 *
 * 有意做成「一个数组 + 几个字段」：以后加第二个 H5 游戏，只需要
 *   ① 在 `lib/h5/` 下写它的引擎；
 *   ② 这里 push 一条；
 *   ③ 让 `app/[locale]/h5/[id]/page.tsx` 按 id 选组件（现在只有一款，
 *      所以那里直接写死了 `ShipGameShell`；加到第二款时抽一个分发组件）。
 *
 * 标题和简介不写在表里，而是从 `ui-text.ts` 按语言取 —— 一张表只管「有哪些游戏」，
 * 文案统一在文案表里维护，不用为了加语言回来改这里。
 */

export type H5Badge = 'online' | 'bots' | 'touch';
export type H5GameId = 'transport-ship';

export interface H5GameEntry {
  id: H5GameId;
  /** 卡片主色（游戏自己的配色，和站点主题无关） */
  accent: string;
  /** 卡片上的能力标记 */
  badges: H5Badge[];
  /** 是否已上线。false 时列表里显示「敬请期待」且不可进入 */
  live: boolean;
}

export const H5_GAMES: readonly H5GameEntry[] = [
  // accent 是 CF 的橙金。卡片高亮、封面准星、按钮都用它，别改成原来的珊瑚橘。
  // 'online' = 支持局域网联机（Trystero P2P，1v1~6v6 + 局中加入，见 `lib/h5/net/`）。
  { id: 'transport-ship', accent: '#f0a020', badges: ['online', 'bots', 'touch'], live: true },
];

export function findGame(id: string): H5GameEntry | undefined {
  return H5_GAMES.find((game) => game.id === id);
}

/**
 * 卡片标题 / 简介。
 *
 * 现在只有一款游戏，所以所有条目共用同一套文案键；加第二款时在这里按 `game.id`
 * 分支（或者给 `H5GameEntry` 加一个 `copyKey` 字段），不要往 `ui-text.ts` 里
 * 按游戏各塞一套重复的键。
 */
export function gameCopy(locale: Locale, game: H5GameEntry): { title: string; tagline: string } {
  void game;
  return { title: h5Text(locale, 'title'), tagline: h5Text(locale, 'tagline') };
}
