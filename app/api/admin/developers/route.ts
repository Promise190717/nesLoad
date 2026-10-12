/*
 * 后台 · 开发商列表 / 新建接口。
 *
 * GET ：分页 + 关键词拉一页开发商（每行带「名下几款游戏」）。
 * POST：multipart/form-data 收「名字 + 厂标 + 简介等」，先把图片传到 R2，成功后再写 D1
 *       （顺序和上传游戏时同一个理由：反过来会留下「有记录却没文件」的坏数据）。
 *
 * 鉴权由本文件的 assertAdmin 自查（后台接口不挂 middleware，原因见 admin-guard.ts）。
 *
 * 厂标**不是必填**：迁移进来的 20 个老名字全都没有图，要求必传的话后台连名字都建不了。
 */

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { assertAdmin } from '@/lib/server/admin-guard';
import {
  insertDeveloper,
  listDevelopers,
  MAX_PAGE_SIZE,
  normalizeWebsite,
} from '@/lib/server/developers';
import { publicUrl, uploadObject } from '@/lib/server/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fail(error: string, detail: string, status = 400) {
  return NextResponse.json({ error, detail }, { status });
}

/** 把任意文件名收敛成安全的 key 片段，和上传游戏那份同一套。 */
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

/** 从查询串里取一个非负整数（别让 -1 / NaN 传到 SQL 里）。 */
function intParam(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * 名字唯一索引撞车时 D1 抛的是 `UNIQUE constraint failed: developers.name`。
 * 转成一句人话 —— 后台只显示 detail，把 SQL 原文甩给用户等于没说。
 */
function friendly(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed/i.test(message) ? '已经有一个同名开发商了' : message;
}

export async function GET(request: Request) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const offset = intParam(params.get('offset'), 0);
  const limit = Math.min(intParam(params.get('limit'), 10) || 10, MAX_PAGE_SIZE);
  const keyword = params.get('q')?.trim() ?? '';

  try {
    return NextResponse.json(await listDevelopers(offset, limit, { keyword }));
  } catch (error) {
    console.error('[admin] 开发商列表读取失败', error);
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

  const name = optionalText(form.get('name'));
  if (!name) return fail('name-required', '请填写开发商名字');

  const foundedText = optionalText(form.get('founded_year'));
  const foundedYear = foundedText ? Number(foundedText) : null;
  if (foundedYear !== null && !Number.isInteger(foundedYear)) {
    return fail('bad-founded-year', '成立年份必须是整数');
  }

  const id = randomUUID();
  const image = asFile(form.get('image'));

  try {
    // 有图才传：没图时 image_url 就是 NULL，前台拿名字首字自己画一个占位
    let imageUrl: string | null = null;
    if (image) {
      const key = `images/developers/${id}-${safeName(image.name || 'logo')}`;
      await uploadObject(
        key,
        new Uint8Array(await image.arrayBuffer()),
        image.type || 'application/octet-stream'
      );
      imageUrl = publicUrl(key);
    }

    const developer = await insertDeveloper({
      id,
      name,
      imageUrl,
      summary: optionalText(form.get('summary')),
      description: optionalText(form.get('description')),
      foundedYear,
      website: normalizeWebsite(form.get('website')),
    });

    return NextResponse.json({ ok: true, developer });
  } catch (error) {
    console.error('[admin] 新建开发商失败', error);
    return fail('create-failed', friendly(error), 500);
  }
}
