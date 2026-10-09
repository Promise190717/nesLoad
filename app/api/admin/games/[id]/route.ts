/*
 * 单条游戏的改 / 删。
 *
 * PATCH ：只改元数据（游戏名、类型、语言、系列、年份、开发者）。封面与 ROM
 *         不在可改范围内 —— 换文件等于换一份内容，删了重加更干净。
 * DELETE：先删 D1 记录，再尽力清理 R2 上的封面与 ROM 对象。
 *         顺序不能反：万一 R2 删成功而 DB 失败，就会留下一条指向空文件的记录。
 *
 * 鉴权由本文件的 assertAdmin 自查（接口不挂 middleware，原因见 admin-guard.ts）。
 */

import { NextResponse } from 'next/server';
import type { ConsoleType } from '@/lib/emulator';
import { assertAdmin } from '@/lib/server/admin-guard';
import { deleteGame, getGameRow, updateGame, type GamePatch } from '@/lib/server/games';
import { deleteObject, keyFromPublicUrl } from '@/lib/server/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONSOLE_TYPES: readonly ConsoleType[] = ['nes', 'snes', 'arcade'];

function fail(error: string, detail: string, status = 400) {
  return NextResponse.json({ error, detail }, { status });
}

function optionalText(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail('bad-request', '无法解析请求数据');
  }

  const title = optionalText(body.title);
  const consoleType = optionalText(body.consoleType) as ConsoleType | null;

  if (!title) return fail('title-required', '请填写游戏名');
  if (!consoleType || !CONSOLE_TYPES.includes(consoleType)) {
    return fail('bad-console-type', '类型不合法');
  }

  const year = typeof body.year === 'number' ? body.year : null;
  if (year !== null && !Number.isInteger(year)) {
    return fail('bad-year', '年份必须是整数');
  }

  const patch: GamePatch = {
    title,
    consoleType,
    language: optionalText(body.language),
    series: optionalText(body.series),
    year,
    developer: optionalText(body.developer),
  };

  try {
    const row = await getGameRow(id);
    if (!row) return fail('not-found', '找不到这个游戏', 404);

    await updateGame(id, patch);
    return NextResponse.json({ ok: true, game: { ...patch, id } });
  } catch (error) {
    console.error('[admin] 修改失败', error);
    return fail('update-failed', (error as Error).message, 500);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await context.params;

  let row;
  try {
    row = await getGameRow(id);
  } catch (error) {
    console.error('[admin] 删除前查询失败', error);
    return fail('delete-failed', (error as Error).message, 500);
  }
  if (!row) return fail('not-found', '找不到这个游戏', 404);

  try {
    await deleteGame(id);
  } catch (error) {
    console.error('[admin] 删除记录失败', error);
    return fail('delete-failed', (error as Error).message, 500);
  }

  // 记录已经没了，附件清理属收尾工作，删不掉也不该让整个请求失败（残留对象
  // 只占点存储，不影响功能）。
  const keys = [row.rom_url, keyFromPublicUrl(row.image_url)].filter(
    (key): key is string => Boolean(key)
  );
  await Promise.allSettled(keys.map((key) => deleteObject(key)));

  return NextResponse.json({ ok: true });
}