import type { Locale } from '@/lib/i18n';
import type { WeaponId } from '@/lib/h5/types';
import { h5Text } from '@/lib/h5/ui-text';
import { WEAPONS } from '@/lib/h5/weapons';

/**
 * 武器显示名。
 *
 * 枪名（AK-47 / M4A1 / AWM / M870 / USP）**不翻译** —— 全世界都这么叫，
 * 翻译成「突击步枪一号」只会让人认不出来。只有刀和手雷有实义，走文案表。
 */
export function weaponLabel(locale: Locale, id: WeaponId): string {
  if (id === 'knife') return h5Text(locale, 'weapon.knife');
  if (id === 'grenade') return h5Text(locale, 'weapon.grenade');
  return WEAPONS[id].name;
}

/**
 * 阵营配色。潜伏者土黄（匪）、保卫者冷蓝（警）—— 和场上模型衣服同色，
 * 这样「谁打死了谁」不用读字也能一眼看出来。
 */
export const TEAM_COLOR: Record<0 | 1, string> = {
  0: '#c9a85c',
  1: '#5c9fd6',
};
