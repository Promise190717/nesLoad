/*
 * 后台 · 单个机种资料的改 / 重置。
 *
 * PATCH ：改名字、机图、简介、介绍、发售年份。**用 multipart 而不是 JSON** ——
 *         换机图要带一个文件上来，和开发商那条同一条理由。没选新文件时保持原图不变。
 *         资料行不存在就**顺带创建**（数据层是 upsert），所以「第一次保存」不需要单独的新建入口。
 * DELETE：**重置** —— 删掉资料行，前台对该机种退回内置默认信息（NES / SFC / GBA / ARC）。
 *         ⚠️ 不是删除机种：games.console_type 存的是枚举值，名下的游戏一根毫毛都不少
 *         （见 db/schema.sql 的 consoles 段），所以不做「名下有游戏不许删」那套拦截。
 *
 * 鉴权由本文件的 assertAdmin 自查（后台接口不挂 middleware，原因见 admin-guard.ts）。
 */

import { NextResponse } from 'next/server';
import { isConsoleType } from '@/lib/consoles';
import { assertAdmin } from '@/lib/server/admin-guard';
import { deleteConsole, getConsole, upsertConsole } from '@/lib/server/consoles';
import { deleteObject, keyFromPublicUrl, publicUrl, uploadObject } from '@/lib/server/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fail(error: string, detail: string, status = 400) {
  return NextResponse.json({ error, detail }, { status });
}

function safeName(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, '_').replace(/^_+/, '');
  return cleaned.slice(-80) || 'file';
}

function optionalText(value: FormDataEntryValue | null): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

function asFile(value: FormDataEntryValue | null): File | null {
  return value instanceof File && value.size > 0 ? value : null;
}

/*
 * 「这段地址是不是一个真机种」的判据在 `lib/consoles.ts` 的 `isConsoleType`
 * （枚举之外的一律 404）。2026-10-14 之前这里有一份手抄的同款函数，
 * 和 `/consoles/[type]` 页面那份是两处 —— 加机种时漏一处就会「前台能开、后台不给存」。
 */

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await context.params;
  if (!isConsoleType(id)) return fail('not-found', '找不到这个机种', 404);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('bad-request', '无法解析请求数据');
  }

  const name = optionalText(form.get('name'));
  if (!name) return fail('name-required', '请填写机种名字');

  const releasedText = optionalText(form.get('release_year'));
  const releaseYear = releasedText ? Number(releasedText) : null;
  if (releaseYear !== null && !Number.isInteger(releaseYear)) {
    return fail('bad-release-year', '发售年份必须是整数');
  }

  let row;
  try {
    row = await getConsole(id);
  } catch (error) {
    console.error('[admin] 机种查询失败', error);
    return fail('update-failed', (error as Error).message, 500);
  }

  const image = asFile(form.get('image'));

  try {
    /*
     * 没选新图就走原地址 —— **不要**在这里把它置空：那会让「只想改个简介」
     * 顺手把机图清掉（和开发商那条同一条规矩）。
     */
    let imageUrl = row?.imageUrl ?? null;
    let uploadedKey: string | null = null;

    if (image) {
      uploadedKey = `images/consoles/${id}-${safeName(image.name || 'image')}`;
      await uploadObject(
        uploadedKey,
        new Uint8Array(await image.arrayBuffer()),
        image.type || 'application/octet-stream'
      );
      imageUrl = publicUrl(uploadedKey);
    }

    await upsertConsole(id, {
      name,
      nameEn: optionalText(form.get('name_en')),
      imageUrl,
      summary: optionalText(form.get('summary')),
      summaryEn: optionalText(form.get('summary_en')),
      description: optionalText(form.get('description')),
      descriptionEn: optionalText(form.get('description_en')),
      releaseYear,
    });

    // 换过图才清理旧对象。**放在写入之后**：反过来的话，DB 写失败就丢了一张还在用的图。
    const oldKey = row?.imageUrl ? keyFromPublicUrl(row.imageUrl) : null;
    if (uploadedKey && oldKey && oldKey !== uploadedKey) {
      await Promise.allSettled([deleteObject(oldKey)]);
    }

    return NextResponse.json({ ok: true, console: { type: id, name, imageUrl } });
  } catch (error) {
    console.error('[admin] 修改机种失败', error);
    return fail('update-failed', (error as Error).message, 500);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await context.params;
  if (!isConsoleType(id)) return fail('not-found', '找不到这个机种', 404);

  let row;
  try {
    row = await getConsole(id);
  } catch (error) {
    console.error('[admin] 重置前查询失败', error);
    return fail('delete-failed', (error as Error).message, 500);
  }
  if (!row) return fail('not-found', '这个机种还没有资料，无需重置', 404);

  try {
    await deleteConsole(id);
  } catch (error) {
    console.error('[admin] 重置机种失败', error);
    return fail('delete-failed', (error as Error).message, 500);
  }

  // 记录已经没了，机图属收尾工作，删不掉也不该让整个请求失败
  const key = row.imageUrl ? keyFromPublicUrl(row.imageUrl) : null;
  if (key) await Promise.allSettled([deleteObject(key)]);

  return NextResponse.json({ ok: true });
}
