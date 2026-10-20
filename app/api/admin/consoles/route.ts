/*
 * 后台 · 机种库列表接口。
 *
 * GET：把**代码里固定的机种**（`CONSOLE_TYPES`）和 `consoles` 表里的资料行
 *      合成一份返回 —— 没填过资料的机种也在列表里（`filled: false`），后台才知道
 *      「还差谁没填」。这张表和开发商库的本质区别见 db/schema.sql 的 consoles 段：
 *      条目清单是代码的事，表只存资料，所以没有 POST（新建）。
 *
 * 鉴权由本文件的 assertAdmin 自查（后台接口不挂 middleware，原因见 admin-guard.ts）。
 */

import { NextResponse } from 'next/server';
import { CONSOLE_LABEL, CONSOLE_TYPES } from '@/components/CartridgeSprite';
import { assertAdmin } from '@/lib/server/admin-guard';
import { listConsoles } from '@/lib/server/consoles';
import { countGamesByConsole } from '@/lib/server/sb-games';
import { EMPTY_FLAT_ENTITY_TEXT, flatEntityTexts, type FlatEntityText } from '@/lib/entity-text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET 返回的条目：固定机种各一条，`filled` 说的是「资料行存不存在」。
 *
 * ⚠️ 那 12 个文案字段来自 `FlatEntityText`（`lib/entity-text.ts`）—— 后台表单是一栏
 *    一个输入框，所以接口把侧表那层字典摊平（同 `/api/admin/developers`）。
 *    **加语言改的是那个共享结构，别在这里补字段。**
 */
export interface AdminConsole extends FlatEntityText {
  type: string;
  /** 展示名。没填资料时是代码默认（NES / SFC / GBA / ARC 等，即 CONSOLE_LABEL）。 */
  name: string;
  imageUrl: string | null;
  releaseYear: number | null;
  /** 名下游戏数（games.console_type 直接数出来的，跟资料行在不在无关）。 */
  gameCount: number;
  /** `consoles` 表里有没有这一行。false = 前台在用内置默认信息。 */
  filled: boolean;
}

export async function GET() {
  const denied = await assertAdmin();
  if (denied) return denied;

  try {
    const [rows, counts] = await Promise.all([listConsoles(), countGamesByConsole()]);

    const consoles: AdminConsole[] = CONSOLE_TYPES.map((type) => {
      const row = rows.find((console) => console.type === type) ?? null;
      const flat = row ? flatEntityTexts(row.texts) : EMPTY_FLAT_ENTITY_TEXT;
      return {
        type,
        ...flat,
        name: flat.name || CONSOLE_LABEL[type],
        imageUrl: row?.imageUrl ?? null,
        releaseYear: row?.releaseYear ?? null,
        gameCount: row ? row.gameCount : counts[type],
        filled: row !== null,
      };
    });

    return NextResponse.json({ consoles, total: consoles.length });
  } catch (error) {
    console.error('[admin] 机种列表读取失败', error);
    return NextResponse.json(
      { error: 'list-failed', detail: (error as Error).message },
      { status: 500 }
    );
  }
}
