/*
 * 后台 · 单条开发商的改 / 删。
 *
 * PATCH ：改名字、厂标、简介、介绍、成立年份、官网。**用 multipart 而不是 JSON** ——
 *         换厂标要带一个文件上来，而 JSON 里塞不下二进制。没选新文件时保持原图不变。
 * DELETE：名下有游戏就**拒绝删除**（返回 409 + 具体条数），让用户先把游戏改到别的开发商。
 *         删得掉的话，记录先删、R2 上那张厂标尽力清掉。
 *
 * 鉴权由本文件的 assertAdmin 自查（后台接口不挂 middleware，原因见 admin-guard.ts）。
 */

import { NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/server/admin-guard';
import {
  countGamesForDeveloper,
  deleteDeveloper,
  getDeveloperRow,
  normalizeWebsite,
  updateDeveloper,
} from '@/lib/server/developers';
import { deleteObject, uploadObject } from '@/lib/server/r2';
import { mediaKey, mediaPath, mediaUrl } from '@/lib/server/media';

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

function friendly(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed/i.test(message) ? '已经有一个同名开发商了' : message;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await context.params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('bad-request', '无法解析请求数据');
  }

  const name = optionalText(form.get('name'));
  if (!name) return fail('name-required', '请填写开发商名字');

  const foundedText = optionalText(form.get('founded_year'));
  const foundedYear = foundedText ? Number(foundedText) : null;
  if (foundedYear !== null && !Number.isInteger(foundedYear)) {
    return fail('bad-founded-year', '成立年份必须是整数');
  }

  let row;
  try {
    row = await getDeveloperRow(id);
  } catch (error) {
    console.error('[admin] 开发商查询失败', error);
    return fail('update-failed', (error as Error).message, 500);
  }
  if (!row) return fail('not-found', '找不到这个开发商', 404);

  const image = asFile(form.get('image'));

  try {
    /*
     * 没选新图就走原地址 —— **不要**在这里把它置空：那会让「只想改个简介」
     * 顺手把厂标清掉。要清图得另做一个「移除图片」的入口，不该由沉默的空 input 触发。
     *
     * ⚠️ `row.image_url` 是库里原值：可能是路径，也可能还是旧版的绝对地址 ——
     *    回写前用 `mediaPath` 统一剥成路径（见 lib/server/media.ts）。
     */
    let imageUrl = mediaPath(row.image_url);
    let uploadedKey: string | null = null;

    if (image) {
      uploadedKey = `images/developers/${id}-${safeName(image.name || 'logo')}`;
      await uploadObject(
        uploadedKey,
        new Uint8Array(await image.arrayBuffer()),
        image.type || 'application/octet-stream'
      );
      imageUrl = mediaPath(uploadedKey);
    }

    await updateDeveloper(id, {
      texts: {
        zh: { name, summary: optionalText(form.get('summary')), description: optionalText(form.get('description')) },
        en: { name: optionalText(form.get('name_en')), summary: optionalText(form.get('summary_en')), description: optionalText(form.get('description_en')) },
        ja: { name: optionalText(form.get('name_ja')), summary: optionalText(form.get('summary_ja')), description: optionalText(form.get('description_ja')) },
        ko: { name: optionalText(form.get('name_ko')), summary: optionalText(form.get('summary_ko')), description: optionalText(form.get('description_ko')) },
      },
      imageUrl,
      foundedYear,
      website: normalizeWebsite(form.get('website')),
    });

    // 换过图才清理旧对象。**放在写入之后**：反过来的话，DB 写失败就丢了一张还在用的图。
    // 删不掉只占点存储，不该让「保存成功」变成失败（和删游戏那套一致）。
    const oldKey = row.image_url ? mediaKey(row.image_url) : null;
    if (uploadedKey && oldKey && oldKey !== uploadedKey) {
      await Promise.allSettled([deleteObject(oldKey)]);
    }

    // 回给后台的是展示地址（路径 + 域名）
    return NextResponse.json({
      ok: true,
      developer: { id, name, imageUrl: mediaUrl(imageUrl) },
    });
  } catch (error) {
    console.error('[admin] 修改开发商失败', error);
    return fail('update-failed', friendly(error), 500);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await context.params;

  let row;
  try {
    row = await getDeveloperRow(id);
  } catch (error) {
    console.error('[admin] 删除前查询失败', error);
    return fail('delete-failed', (error as Error).message, 500);
  }
  if (!row) return fail('not-found', '找不到这个开发商', 404);

  /*
   * 名下有游戏就**不许删**：删掉之后那些游戏的 developer_id 会指向一个不存在的开发商，
   * 开发商页上少了它们、游戏页上又点不开 —— 用户要的「关联」正是坏在这一步。
   * 与其静默把关联剪断，不如明确告诉他还剩几款、让他先改过去。
   * （用 409 而不是 400：这不是参数写错，是「当前状态冲突」。）
   */
  const used = await countGamesForDeveloper(id);
  if (used > 0) {
    return fail(
      'in-use',
      `还有 ${used} 款游戏挂在这个开发商名下，先把它们改到别的开发商再删。`,
      409
    );
  }

  try {
    await deleteDeveloper(id);
  } catch (error) {
    console.error('[admin] 删除开发商失败', error);
    return fail('delete-failed', (error as Error).message, 500);
  }

  // 记录已经没了，厂标属收尾工作，删不掉也不该让整个请求失败
  const key = row.image_url ? mediaKey(row.image_url) : null;
  if (key) await Promise.allSettled([deleteObject(key)]);

  return NextResponse.json({ ok: true });
}
