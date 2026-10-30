/*
 * 单条游戏的改 / 删。
 *
 * PATCH ：只改元数据（游戏名、类型、语言、系列、年份、开发者、说明）。封面与 ROM
 *         不在可改范围内 —— 换文件等于换一份内容，删了重加更干净。
 * DELETE：先删库记录，再尽力清理 R2 上的封面与 ROM 对象。
 *         顺序不能反：万一 R2 删成功而 DB 失败，就会留下一条指向空文件的记录。
 *
 * ⚠️ 2026-10-20 起数据层换成 Supabase（`@/lib/server/games-admin`）。与 D1 那套的差别：
 *    · **主键是 slug**（`<id>` 就是 slug），删一款是**一条** `DELETE`（文案 / ROM 走
 *      `ON DELETE CASCADE`），不再需要「先读 group_key、删完再判断同款还剩不剩」；
 *    · **没有 `rom_url` 列**：本站自持的 ROM 存在 `source_url` 的 `r2:` 前缀下，
 *      清理时按前缀判断要不要删 R2 对象。
 *
 * 鉴权由本文件的 assertAdmin 自查（接口不挂 middleware，原因见 admin-guard.ts）。
 */

import { NextResponse } from 'next/server';
import type { ConsoleType } from '@/lib/emulator';
import { CONSOLE_LABEL, CONSOLE_TYPES } from '@/lib/consoles';
import { assertAdmin } from '@/lib/server/admin-guard';
import {
  deleteGame,
  findGameDuplicate,
  isPlayerCount,
  normalizeRomLanguage,
  updateGame,
  type GamePatch,
} from '@/lib/server/games-admin';
import { deleteObject } from '@/lib/server/r2';
import { mediaKey } from '@/lib/server/media';
import { getGameRow } from '@/lib/server/sb-games';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  // 语言要在判重（同名 + 同语言）与写库两处用，先取出来，别取两遍
  const language = optionalText(body.language);

  if (!title) return fail('title-required', '请填写游戏名');
  if (!consoleType || !CONSOLE_TYPES.includes(consoleType)) {
    return fail('bad-console-type', '类型不合法');
  }

  const year = typeof body.year === 'number' ? body.year : null;
  if (year !== null && !Number.isInteger(year)) {
    return fail('bad-year', '年份必须是整数');
  }

  /*
   * 人数（2026-10-30 加）：`null` / 缺省 = 未指定（详情页照画联机钮）。
   * 只收 1 / 2 / 4 —— 和后台下拉框、`PLAYER_OPTIONS` 三处保持一致。
   */
  const players = typeof body.players === 'number' ? body.players : null;
  if (players !== null && !isPlayerCount(players)) {
    return fail('bad-players', '人数只能是 1 / 2 / 4，或留空');
  }

  /*
   * 文案进 `game_texts` 侧表（2026-10-16 起）。
   *
   * ⚠️ **请求体仍然用扁平字段**（`title` / `titleEn` / `titleJa` / `titleKo`，
   *    系列与说明同理），没有改成一个嵌套的 `texts` 对象 —— 改之前这段注释写的是
   *    「将来界面开日韩时，这里应该改成直接收一个 `texts` 对象」；2026-10-16 真开日韩时
   *    **没照那样改**，理由是：POST 那条路里 `texts`（爬取）与扁平字段（手动添加）
   *    本来就并存，PATCH 的调用方只有 AdminGames 一个，把它的字段名从 `titleEn` 换成
   *    嵌套对象只会让「新增 / 编辑」两个表单的提交体形状不一致，换不来任何收益。
   *    真要收 `texts`，应该 POST / PATCH 一起改。
   *
   * ⚠️ 四个语言**全都带上**（哪怕日韩那几栏是空的）：`updateGame` 的语义是
   *    「只动传进来的语言」，漏掉 `ja` 就等于「日文那几行原样不动」——
   *    那样用户把日文清空之后旧文案还在。（英文那几栏是同一个道理，见下。）
   *
   * ⚠️ `developer` 那一栏不填：厂名由数据层按 `developerId` 反查（见 withDeveloper）。
   */
  const patch: GamePatch = {
    texts: {
      zh: {
        title,
        series: optionalText(body.series),
        developer: null,
        description: optionalText(body.description),
      },
      en: {
        title: optionalText(body.titleEn),
        series: optionalText(body.seriesEn),
        developer: null,
        description: optionalText(body.descriptionEn),
      },
      ja: {
        title: optionalText(body.titleJa),
        series: optionalText(body.seriesJa),
        developer: null,
        description: optionalText(body.descriptionJa),
      },
      ko: {
        title: optionalText(body.titleKo),
        series: optionalText(body.seriesKo),
        developer: null,
        description: optionalText(body.descriptionKo),
      },
    },
    consoleType,
    // 上面已经取好（判重也用它），别再解析一遍
    language,
    year,
    // 空 / 缺省 = 未指定。这是唯一影响详情页「联机游戏」钮画不画的字段
    players,
    // 开发商下拉框给的是 developers.id，名字由数据层反查（见 lib/server/games.ts）
    developerId: optionalText(body.developerId),
  };

  try {
    const row = await getGameRow(id);
    if (!row) return fail('not-found', '找不到这个游戏', 404);

    /*
     * 判重（同名 + 同机种 + 同语言）—— 和「添加」用同一把尺子。
     * 修改这边不判的话，「添加」那道闸门等于白设：加一条 A/中文，
     * 再把另一条改成 A/中文就绕过去了。
     *
     * 第四个参数把**自己**排除掉：不排的话，改个年份都会撞上自己的名字。
     * 第三个参数是机种（2026-10-15 加）—— **必须传这次要改成的那个机种**，
     * 不是旧的：改机种本身就该按新机种重新判一遍。
     */
    const duplicate = await findGameDuplicate(
      title,
      normalizeRomLanguage(language),
      consoleType,
      id
    );
    if (duplicate) {
      const langText = duplicate.language ? `语言：${duplicate.language}` : '语言未标注';
      return fail(
        'duplicate-title',
        `已存在同名同机种同语言的游戏：「${duplicate.title}」（${CONSOLE_LABEL[consoleType]} · ${langText}）`
      );
    }

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
  /*
   * 要清的对象：封面（从公网地址反推 key）+ 本站自持的那份 ROM（`r2:` 前缀）。
   * 上游来源的 ROM（`site:` / `files:`）本来就不在 R2 上，跳过。
   */
  const romKey = row.source_url?.startsWith('r2:') ? row.source_url.slice(3) : null;
  // 封面按路径反解 key（兼容库里还存着旧版绝对地址的行，见 lib/server/media.ts）
  const keys = [mediaKey(row.image_url), romKey].filter(
    (key): key is string => Boolean(key)
  );
  await Promise.allSettled(keys.map((key) => deleteObject(key)));

  return NextResponse.json({ ok: true });
}