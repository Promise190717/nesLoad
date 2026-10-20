/*
 * 云端存档（`/api/user/saves`）。
 *
 * 存的是压缩后的模拟器即时快照，每个游戏只保留最新一份，
 * 本体走 R2（见 lib/server/user-data.ts 的注释），这张路由只做三件事：
 *   GET    列出某个 ROM 名下的云端存档（`?romName=`，前端打开存档列表时调）
 *   POST   传一份新存档（multipart：`state` 文件 + `gameId` / `romName` / `title`）
 *   DELETE 清空这一款的全部云端存档（`?romName=`）
 *
 * ⚠️ **不挂 middleware**（见 middleware.ts 的 matcher）：它会缓冲整个请求体并
 *    默认截断到 10MB。所以这里自己调 `assertUser`。
 *
 * 单个存档的大小由 `MAX_SAVE_BYTES` 卡（20MB，见 lib/save-limit.ts）——它同时也是
 * 客户端发送前的预检口径。⚠️ 真正的天花板在平台那边：Cloudflare 的**请求体硬限
 * 100MB**，超了在边缘就回 413、**根本进不到这里**，客户端在压缩后预检大小。
 */

import { NextResponse } from 'next/server';
import { assertUser } from '@/lib/server/app-guard';
import { getGameForWrite } from '@/lib/server/sb-games';
import {
  createUserSave,
  listUserSaves,
  MAX_SAVE_BYTES,
  removeUserSave,
} from '@/lib/server/user-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `?romName=` 必填 —— 存档是按 ROM 文件名认的（和本机 lib/saves.ts 同一把钥匙）。 */
function romNameOf(request: Request): string {
  return new URL(request.url).searchParams.get('romName')?.trim() ?? '';
}

/**
 * 列出某一款的云端存档。
 *
 * ⚠️ **一款只有一份**，所以这里回的数组实际长度恒为 0 或 1
 *    —— 数组形状留着不动（前端只取第一份），省得为语义变化改协议。
 *
 * 只认 `romName`，**不校验游戏还在不在库**：存档是「当时那份状态」，
 * 游戏下架了它也该列得出来（前端据此把条目置灰）。这一条和「收藏用 JOIN 过滤下架」
 * 是有意的分歧 —— 理由写在 lib/server/user-data.ts 文件头。
 */
export async function GET(request: Request) {
  const guard = await assertUser();
  if (!guard.ok) return guard.response;

  const romName = romNameOf(request);
  if (!romName) return NextResponse.json({ error: 'missing-rom' }, { status: 400 });

  try {
    return NextResponse.json({ items: await listUserSaves(guard.user.uid, romName) });
  } catch (error) {
    console.error('[user] 存档列表读取失败', error);
    return NextResponse.json({ error: 'list-failed' }, { status: 500 });
  }
}

/**
 * 传一份新存档。
 *
 * ⚠️ **用 multipart 而不是 JSON + base64**：存档是二进制块（NDS 的卡带存档能到 MB 级），
 *    base64 要白涨 33%，而且浏览器端还得先在内存里转一遍字符串。
 *    `FormData` 直达，前端直接 append 一个 `Blob`。
 *
 * 鉴权**先于读 body**（和 /api/admin/games 一样）：未登录的请求不该有机会
 * 让我们把几 MB 的表单整个解析一遍。
 */
export async function POST(request: Request) {
  const guard = await assertUser();
  if (!guard.ok) return guard.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }

  const gameId = textOf(form.get('gameId'));
  const romName = textOf(form.get('romName'));
  const title = textOf(form.get('title'));
  const state = form.get('state');

  if (!gameId || !romName || !title) {
    return NextResponse.json({ error: 'missing-fields' }, { status: 400 });
  }
  if (!(state instanceof File) || state.size === 0) {
    return NextResponse.json({ error: 'missing-state' }, { status: 400 });
  }
  if (state.size > MAX_SAVE_BYTES) {
    return NextResponse.json(
      { error: 'state-too-large', detail: `${state.size} > ${MAX_SAVE_BYTES}` },
      { status: 413 }
    );
  }

  try {
    /*
     * 云端存档只服务在线库的游戏 —— 和 /api/user/history 同一个闸。
     *
     * ⚠️ 这里**只校验存在性、不覆盖 title**：gameId 是我们信得过的（刚查过），
     *    但 title 是从表单来的（前端展示用的那一份），而它只是存档列表上的
     *    一行文字。真要严谨可以像历史那样一律从 games 取 —— 但存档的 title
     *    是**跟着存档一起存下去的**，即使用户改名了也不影响正确性。
     *    这里只用 games 表做「这一款还在不在」的判定。
     */
    const game = await getGameForWrite(gameId);
    if (!game) return NextResponse.json({ error: 'not-found' }, { status: 404 });

    const bytes = new Uint8Array(await state.arrayBuffer());
    const slot = await createUserSave(guard.user.uid, { gameId, romName, title, state: bytes });
    return NextResponse.json({
      ok: true,
      slot,
      items: await listUserSaves(guard.user.uid, romName),
    });
  } catch (error) {
    console.error('[user] 写存档失败', error);
    return NextResponse.json({ error: 'save-failed' }, { status: 500 });
  }
}

/**
 * 清空**某一款**的云端存档（不是全部）。
 *
 * 和本地那套一致：本地没有「一键清空所有游戏存档」，只有逐槽操作。
 * 逐槽删除走 `/api/user/saves/[id]`；这条是「这一款的都删掉」。
 */
export async function DELETE(request: Request) {
  const guard = await assertUser();
  if (!guard.ok) return guard.response;

  const romName = romNameOf(request);
  if (!romName) return NextResponse.json({ error: 'missing-rom' }, { status: 400 });

  try {
    // 逐条走 removeUserSave，为的是**每条都清 R2 对象**（不能只删行）
    const slots = await listUserSaves(guard.user.uid, romName);
    for (const slot of slots) await removeUserSave(guard.user.uid, slot.id);
    return NextResponse.json({ ok: true, removed: slots.length });
  } catch (error) {
    console.error('[user] 清空存档失败', error);
    return NextResponse.json({ error: 'clear-failed' }, { status: 500 });
  }
}

function textOf(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : '';
}
