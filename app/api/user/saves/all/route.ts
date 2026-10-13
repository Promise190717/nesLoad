/*
 * 跨游戏存档总览（`/api/user/saves/all`）。
 *
 *   GET    列出这个人在**所有游戏**上的云端存档（个人中心「存档」tab 用）
 *   DELETE 清空全部云端存档（连同 R2 对象）
 *
 * ⚠️ **为什么不并进 `/api/user/saves`**（那条按 `?romName=` 分组）：
 *    用途完全不同。`/api/user/saves` 是「正在玩这一款时打开存档列表」——
 *    按 ROM 名分组、**故意不 JOIN games**（游戏下架了存档也该列得出来）。
 *    这条是跨游戏总览 —— **JOIN games 且只返回还在库的**（下架的在这儿点开
 *    也进不去，列着只会让人困惑）。两边的过滤策略相反，合在一条路由里
 *    只能靠一个开关参数来回切，读起来更容易搞混。理由详见
 *    lib/server/user-data.ts 里 `listUserSaveOverview` 上面那段注释。
 *
 * ⚠️ 路由是 `saves/all` 而不是 `saves`——`/api/user/saves/[id]` 那条动态路由
 *    会把 `all` 当成一个 save id 吃掉，所以这一段必须是 `saves` 下的**静态子路径**，
 *    而且 Next 会优先匹配静态段，不会被 `[id]` 抢走。
 *
 * 不做分页：**每款游戏最多 5 份**（MAX_SAVES），一个用户即使玩过 100 款也就 500 条，
 * 一次拉回来在个人中心那种滚动列表里完全够用，比再写一套游标翻页划算。
 */

import { NextResponse } from 'next/server';
import { assertUser } from '@/lib/server/app-guard';
import { clearAllUserSaves, listUserSaveOverview } from '@/lib/server/user-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const guard = await assertUser();
  if (!guard.ok) return guard.response;

  try {
    return NextResponse.json({ items: await listUserSaveOverview(guard.user.uid) });
  } catch (error) {
    console.error('[user] 存档总览读取失败', error);
    return NextResponse.json({ error: 'list-failed' }, { status: 500 });
  }
}

/**
 * 清空全部云端存档。
 *
 * ⚠️ **不可逆**，而且删的是 R2 上的对象 —— 前端必须走两次确认
 * （同存档面板里那个单份删除、以及后台删号的思路）。
 * 返回清掉了几条，让前端能给个准确的回执。
 */
export async function DELETE() {
  const guard = await assertUser();
  if (!guard.ok) return guard.response;

  try {
    return NextResponse.json({ ok: true, removed: await clearAllUserSaves(guard.user.uid) });
  } catch (error) {
    console.error('[user] 清空存档失败', error);
    return NextResponse.json({ error: 'clear-failed' }, { status: 500 });
  }
}
