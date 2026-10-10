import { redirect } from 'next/navigation';

/**
 * `/admin` 本身没有内容 —— 直接落到默认那个 tab（游戏列表）。
 *
 * 放在 `(panel)` 组里而不是 `app/admin/page.tsx`：这样敲 `/admin` 也走一遍组里的
 * 鉴权 layout（未登录会被送去登录页），和敲 `/admin/games` 的行为一致。
 */
export default function AdminIndexPage() {
  redirect('/admin/games');
}
