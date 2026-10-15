/*
 * 后台上传 / 列表接口。
 *
 * POST：multipart/form-data 收「图片 + ROM + 元数据」，先把两个文件传到 R2，
 *       成功后再写 D1（顺序很重要：反过来会出现有记录却没文件的坏数据）。
 * GET ：给后台管理页拉**一页**游戏列表，见下面 GET 的注释。
 *
 * 鉴权由本文件的 assertAdmin 自查（接口不挂 middleware，原因见 admin-guard.ts）。
 */

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { ConsoleType } from '@/lib/emulator';
import { CONSOLE_LABEL, CONSOLE_TYPES } from '@/lib/consoles';
import { assertAdmin } from '@/lib/server/admin-guard';
import { findGameDuplicate, insertGame, listAdminGamesPage, MAX_PAGE_SIZE } from '@/lib/server/games';
import { publicUrl, uploadObject } from '@/lib/server/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

/** 从查询串里取一个非负整数，去掉小数与负号（别让 -1 / NaN 传到 SQL 里）。 */
function intParam(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * 分页返回列表（**游标翻页**，2026-10-14 从 offset 改过来）。
 *
 * 参数：`cursor`（上一页返回的 nextCursor；不传 = 第一页）、`limit`（默认 10）、`q`（可选关键词）。
 * 返回 `{ games, nextCursor, hasMore }` —— **没有 total**：后台的分页控件是「上一页 / 下一页」式、
 * 用不到总数，而省掉它等于每次少数一遍全表（这条路径刻意不缓存，是全站唯一每次付全价的）。
 *
 * 搜索做在服务端：一旦按页取数，本地 filter 就只能筛当页那几条 —— 翻页会换一批结果，
 * 等于没搜。所以关键词随查询一起下发。
 */
export async function GET(request: Request) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const cursor = params.get('cursor');
  const limit = Math.min(intParam(params.get('limit'), 10) || 10, MAX_PAGE_SIZE);
  const keyword = params.get('q')?.trim() ?? '';

  try {
    return NextResponse.json(await listAdminGamesPage(cursor, limit, { keyword }));
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
  // 语言要在判重（同名 + 同语言才算重复）与写库两处用，先取出来，别取两遍
  const language = optionalText(form.get('language'));

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
    /*
     * 判重必须在**上传之前**：重复就直接拒，别白白把封面和 ROM 传上 R2 ——
     * 传完再拒会留下一对没人认领的对象（D1 里没有任何一行指向它们）。
     *
     * 判据是**同名 + 同机种 + 同语言**（见 lib/server/games.ts 的 findGameDuplicate）：
     * 同一款游戏在 NES / SFC / GB 上各有一版是几条合法记录（那是几盘不同的 ROM），
     * 日版 / 美版 / 中文版同理，只按名字拦会全挡在门外。
     * 比较放在服务端做：列表是分页的，前端手里只有当前页，在浏览器里比名字一定会漏。
     */
    const duplicate = await findGameDuplicate(title, language, consoleType);
    if (duplicate) {
      // 顺带把命中那条的机种与语言说出来 —— 「同名但机种 / 语言不同」是放行的，
      // 用户得看得见差在哪
      const langText = duplicate.language ? `语言：${duplicate.language}` : '语言未标注';
      return fail(
        'duplicate-title',
        `已存在同名同机种同语言的游戏：「${duplicate.title}」（${CONSOLE_LABEL[consoleType]} · ${langText}）`
      );
    }

    await uploadObject(imageKey, new Uint8Array(await image.arrayBuffer()), image.type || 'application/octet-stream');
    // ROM 一律按二进制流上传，别让 R2 自作主张改 Content-Type
    await uploadObject(romKey, new Uint8Array(await rom.arrayBuffer()), 'application/octet-stream');

    const game = await insertGame({
      id,
      title,
      // 英文字段（可空）：英文站取它、空了回退中文（见 lib/server/games.ts）
      titleEn: optionalText(form.get('title_en')),
      imageUrl: publicUrl(imageKey),
      romKey,
      // 存**原始文件名**：FBNeo 是拿 zip 文件名认驱动的，改名会让街机起不来
      romName: rom.name,
      consoleType,
      // 上面已经取好（判重也用它），别再解析一遍
      language,
      series: optionalText(form.get('series')),
      seriesEn: optionalText(form.get('series_en')),
      year,
      /*
       * 开发商：表单里是一个下拉框，传上来的是 **developers.id**（不是名字）。
       * 名字由 `insertGame` 反查后一起写进 `games.developer`（快照列），
       * 免得让「id 与名字」两处由调用方各自维护（见 lib/server/games.ts 的 resolveDeveloper）。
       */
      developerId: optionalText(form.get('developer_id')),
      description: optionalText(form.get('description')),
      descriptionEn: optionalText(form.get('description_en')),
    });

    return NextResponse.json({ ok: true, game });
  } catch (error) {
    console.error('[admin] 上传失败', error);
    // 把底层原因（如「R2 未配置：缺少 R2_ACCESS_KEY_ID」）透给后台，别吞掉
    return fail('upload-failed', (error as Error).message, 500);
  }
}