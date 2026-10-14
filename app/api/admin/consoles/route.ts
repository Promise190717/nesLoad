/*
 * 后台 · 机种库列表接口。
 *
 * GET：把**代码里固定的四个机种**（`CONSOLE_TYPES`）和 `consoles` 表里的资料行
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
import { countGamesByConsole } from '@/lib/server/games';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET 返回的条目：固定四个机种各一条，`filled` 说的是「资料行存不存在」。 */
export interface AdminConsole {
  type: string;
  /** 展示名。没填资料时是代码默认（NES / SFC / GBA / ARC，即 CONSOLE_LABEL）。 */
  name: string;
  nameEn: string | null;
  imageUrl: string | null;
  summary: string | null;
  summaryEn: string | null;
  description: string | null;
  descriptionEn: string | null;
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
      return {
        type,
        name: row?.name ?? CONSOLE_LABEL[type],
        nameEn: row?.nameEn ?? null,
        imageUrl: row?.imageUrl ?? null,
        summary: row?.summary ?? null,
        summaryEn: row?.summaryEn ?? null,
        description: row?.description ?? null,
        descriptionEn: row?.descriptionEn ?? null,
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
