/*
 * 后台上传 / 列表接口。
 *
 * POST：multipart/form-data 收「图片 + ROM + 元数据」，先把两个文件传到 R2，
 *       成功后再写 D1（顺序很重要：反过来会出现有记录却没文件的坏数据）。
 * GET ：给后台管理页拉已上传的游戏列表。
 *
 * 鉴权由本文件的 assertAdmin 自查（接口不挂 middleware，原因见 admin-guard.ts）。
 */

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { ConsoleType } from '@/lib/emulator';
import { assertAdmin } from '@/lib/server/admin-guard';
import { insertGame, listGames } from '@/lib/server/games';
import { publicUrl, uploadObject } from '@/lib/server/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONSOLE_TYPES: readonly ConsoleType[] = ['nes', 'snes', 'arcade'];

/**
 * 失败响应统一格式：`error` 是稳定的机器码，`detail` 是给人看的说明。
 * 后台界面直接显示 detail —— 光一句「上传失败」什么也说明不了（比如 R2 密钥
 * 没配时，用户根本不知道该去填环境变量）。
 */
function fail(error: string, detail: string, status = 400) {
  return NextResponse.json({ error, detail }, { status });
}

/** 把任意文件名收敛成安全的 key 片段，保留扩展名。 */
function safeName(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, '_').replace(/^_+/, '');
  return cleaned.slice(-80) || 'file';
}

function optionalText(value: FormDataEntryValue | null): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

/** 表单里真正的文件。空 input 会塞一个 size 为 0 的 File，那等同于没选。 */
function asFile(value: FormDataEntryValue | null): File | null {
  return value instanceof File && value.size > 0 ? value : null;
}

export async function GET() {
  const denied = await assertAdmin();
  if (denied) return denied;

  try {
    return NextResponse.json({ games: await listGames() });
  } catch (error) {
    console.error('[admin] 列表读取失败', error);
    return fail('list-failed', (error as Error).message, 500);
  }
}

export async function POST(request: Request) {
  // 鉴权必须在读取 body 之前：未登录的请求不该白白吃下整个上传体
  const denied = await assertAdmin();
  if (denied) return denied;

  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    console.error('[admin] 表单解析失败', error);
    return fail('bad-request', '无法解析上传的表单数据');
  }

  const title = optionalText(form.get('title'));
  const image = asFile(form.get('image'));
  const rom = asFile(form.get('rom'));
  const consoleType = optionalText(form.get('console_type')) as ConsoleType | null;

  if (!title) return fail('title-required', '请填写游戏名');
  if (!image) return fail('image-required', '请选择封面图片');
  if (!rom) return fail('rom-required', '请选择游戏文件');
  if (!consoleType || !CONSOLE_TYPES.includes(consoleType)) {
    return fail('bad-console-type', '类型不合法');
  }

  const yearText = optionalText(form.get('year'));
  const year = yearText ? Number(yearText) : null;
  if (year !== null && !Number.isInteger(year)) {
    return fail('bad-year', '年份必须是整数');
  }

  const id = randomUUID();
  const imageKey = `images/${id}-${safeName(image.name || 'cover')}`;
  const romKey = `roms/${id}-${safeName(rom.name || 'rom')}`;

  try {
    await uploadObject(imageKey, new Uint8Array(await image.arrayBuffer()), image.type || 'application/octet-stream');
    // ROM 一律按二进制流上传，别让 R2 自作主张改 Content-Type
    await uploadObject(romKey, new Uint8Array(await rom.arrayBuffer()), 'application/octet-stream');

    const game = await insertGame({
      id,
      title,
      imageUrl: publicUrl(imageKey),
      romKey,
      // 存**原始文件名**：FBNeo 是拿 zip 文件名认驱动的，改名会让街机起不来
      romName: rom.name,
      consoleType,
      language: optionalText(form.get('language')),
      series: optionalText(form.get('series')),
      year,
      developer: optionalText(form.get('developer')),
    });

    return NextResponse.json({ ok: true, game });
  } catch (error) {
    console.error('[admin] 上传失败', error);
    // 把底层原因（如「R2 未配置：缺少 R2_ACCESS_KEY_ID」）透给后台，别吞掉
    return fail('upload-failed', (error as Error).message, 500);
  }
}