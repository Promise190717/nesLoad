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
import { CONTENT_LOCALES, isBlankGameText, type GameText, type GameTexts } from '@/lib/game-text';
import { assertAdmin } from '@/lib/server/admin-guard';
import { findGameDuplicate, insertGame, listAdminGamesPage, MAX_PAGE_SIZE } from '@/lib/server/games';
import { publicUrl, uploadObject } from '@/lib/server/r2';
import { sourceFileName, toStoredSource } from '@/lib/server/upstream';

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

/**
 * 解析表单里的 `texts` 字段（**一个 JSON 字符串**，2026-10-16 加）。
 *
 * 爬取那条路（lib/admin-import.ts）带的是**四个语言**的文案：
 * `{ "zh": { title, series, description }, "en": {…}, "ja": {…}, "ko": {…} }`。
 * 这里收敛成数据层要的 `GameTexts`：
 *   · 只认 `CONTENT_LOCALES` 里那几个 key，别的语言丢掉（上游可能加我们没登记的）；
 *   · **每份补 `developer: null`** —— 厂名不由调用方传，由 `insertGame` 按 `developerId`
 *     反查后写进每一份（见 lib/server/games.ts 的 withDeveloper）；
 *   · 一份里三个字段**全是空**就整份不要（写入时本来也不会建行，见 writeTexts）；
 *   · 空串 / 纯空白一律收敛成 `null`，别把 `" "` 当成「有内容」写进库。
 *
 * ⚠️ 返回 `null` 表示**「这个字段没法用」**，调用方据此退回表单上那几栏扁平字段
 *    （手动添加那条路，见下面的 `flatTexts`）。**别把「解析出一个空的 `GameTexts`」
 *    当成成功** —— 那会写出一款没有文案的游戏。
 */
function parseTextsField(raw: FormDataEntryValue | null): GameTexts | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const source = parsed as Record<string, unknown>;
  const texts: GameTexts = {};

  for (const locale of CONTENT_LOCALES) {
    const entry = source[locale];
    if (!entry || typeof entry !== 'object') continue;

    const row = entry as Record<string, unknown>;
    const pick = (key: string): string | null => {
      const value = row[key];
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    };

    const text: GameText = {
      title: pick('title'),
      series: pick('series'),
      developer: null,
      description: pick('description'),
    };
    if (isBlankGameText(text)) continue;
    texts[locale] = text;
  }

  return texts;
}

/**
 * 手动添加那条路的文案来源：把表单上那几栏**扁平字段**拼成 `GameTexts`。
 *
 * 字段名规则：无后缀 = 中文，`_en` / `_ja` / `_ko` = 英 / 日 / 韩
 * —— 三个字段（`title` / `series` / `description`）× 四个语言 = 12 栏。
 * （日韩那 6 栏是 2026-10-16 跟着界面语言一起开的；在那之前这里只有中英。）
 *
 * ⚠️ **三栏全空的那一份整份丢掉**（不建 key）：`writeTexts` 对「传进来的空的一份」
 *    是**删行**（见 lib/server/games.ts），传个空壳过去等于发一条没意义的 DELETE。
 *    中文那份不可能空 —— 调用方前面已经卡过 `title` 必填。
 *
 * ⚠️ `developer` 一律 `null`：厂名由数据层按 `developerId` 反查后写（见 `withDeveloper`）。
 */
function flatTexts(form: FormData): GameTexts {
  const texts: GameTexts = {};
  for (const locale of CONTENT_LOCALES) {
    const suffix = locale === 'zh' ? '' : `_${locale}`;
    const text: GameText = {
      title: optionalText(form.get(`title${suffix}`)),
      series: optionalText(form.get(`series${suffix}`)),
      developer: null,
      description: optionalText(form.get(`description${suffix}`)),
    };
    if (isBlankGameText(text)) continue;
    texts[locale] = text;
  }
  return texts;
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
  /**
   * 源站 ROM 地址（2026-10-16 加）。调用方给的是**上游原样的地址**
   * （`https://files.retrogamesnexus.com/…` 或 `/games/roms/…`），这里收敛成站内形态
   * `site:/…` / `files:/…`（**不含域名**，见 lib/server/upstream.ts）——
   * **转换即校验**：认不出的域名返回 null，下面直接拒。
   * 有值时**不需要**上传 ROM，前台按它回源取（见 app/api/games/[id]/rom）。
   */
  const rawSource = optionalText(form.get('source_url'));
  const sourceUrl = toStoredSource(rawSource);
  const consoleType = optionalText(form.get('console_type')) as ConsoleType | null;
  // 语言要在判重（同名 + 同语言才算重复）与写库两处用，先取出来，别取两遍
  const language = optionalText(form.get('language'));

  if (!title) return fail('title-required', '请填写游戏名');
  if (!image) return fail('image-required', '请选择封面图片');
  // 两条来源二选一：给了地址就不必传文件，反过来也一样
  if (!rom && !sourceUrl) return fail('rom-required', '请选择游戏文件，或提供源站地址');
  if (rawSource && !sourceUrl) {
    return fail('bad-source-url', '源站地址不合法（只认上游域名的地址）');
  }
  if (!consoleType || !CONSOLE_TYPES.includes(consoleType)) {
    return fail('bad-console-type', '类型不合法');
  }

  const yearText = optionalText(form.get('year'));
  const year = yearText ? Number(yearText) : null;
  if (year !== null && !Number.isInteger(year)) {
    return fail('bad-year', '年份必须是整数');
  }

  /*
   * 文案（2026-10-16 起进 `game_texts` 侧表）。两条来源，优先级从高到低：
   *   ① 表单里的 `texts`（**JSON，四个语言**）—— 爬取那条路（lib/admin-import.ts）带的；
   *   ② 上面那几栏扁平字段（`title` / `title_en` / `title_ja` / `title_ko`，
   *      系列与说明同理）—— **手动添加**那条路带的，2026-10-16 起也是四个语言（见 flatTexts）。
   *
   * ⚠️ 走 ② 时**空的那几份整份不要**（`flatTexts` 里 `isBlankGameText` 那一步）：
   *    `insertGame` → `writeTexts` 只处理传进来的语言，所以「只填了中文」不会在库里
   *    留下三行空文案。这条路径只用于**新建**（id 是现场生成的），库里不可能已有文案，
   *    所以「跳过空的那份」与旧写法（带上空的一份 → writeTexts 顺手删掉那行）效果一致。
   *
   * ⚠️ `developer` 那一栏**不在这儿填**：厂名由数据层按 `developerId` 反查后写进每一份
   *    （见 lib/server/games.ts 的 withDeveloper）—— 让调用方自己传迟早会和各语言不一致。
   */
  const parsedTexts = parseTextsField(form.get('texts'));
  const texts: GameTexts = parsedTexts?.zh?.title ? parsedTexts : flatTexts(form);

  const id = randomUUID();
  const imageKey = `images/${id}-${safeName(image.name || 'cover')}`;
  /*
   * 不存 ROM 时 `rom_url` 写**空串** —— 那列是 NOT NULL，而这一行的 ROM 走 `source_url`。
   * 两条来源**互斥**：给了源站地址就不再往 R2 传 ROM（见下面 uploadObject 那一段）。
   */
  const romKey = sourceUrl ? '' : `roms/${id}-${safeName(rom?.name || 'rom')}`;
  /*
   * 原始文件名（FBNeo 认它当驱动名，改不得）：不下载 ROM 时表单里那份是上游地址的尾部，
   * 优先用表单给的 `rom_name`，没有就从地址尾部推。
   */
  const romName = sourceUrl
    ? optionalText(form.get('rom_name')) || sourceFileName(sourceUrl)
    : (rom?.name ?? 'rom');

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
    /*
     * 有源站地址就**一个字节都不往 R2 存**（2026-10-16）—— 这正是「不保存 ROM」的意义所在。
     * 没有时照旧上传；ROM 一律按二进制流上传，别让 R2 自作主张改 Content-Type。
     */
    if (!sourceUrl) {
      await uploadObject(romKey, new Uint8Array(await rom!.arrayBuffer()), 'application/octet-stream');
    }

    const { group, ...game } = await insertGame({
      id,
      // 上面那段算好的（`texts` 字段优先，退回中英扁平字段）—— 写入见 lib/server/games.ts
      texts,
      imageUrl: publicUrl(imageKey),
      romKey,
      // 源站地址（不存 ROM 时才有值）；null = 本站自持，前台读 R2
      sourceUrl,
      // 存**原始文件名**：FBNeo 是拿 zip 文件名认驱动的，改名会让街机起不来
      romName,
      consoleType,
      // 上面已经取好（判重也用它），别再解析一遍
      language,
      year,
      /*
       * 开发商：表单里是一个下拉框，传上来的是 **developers.id**（不是名字）。
       * 名字由 `insertGame` 反查后一起写进 `games.developer`（快照列）与 `game_texts`，
       * 免得让「id 与名字」两处由调用方各自维护（见 lib/server/games.ts 的 resolveDeveloper）。
       */
      developerId: optionalText(form.get('developer_id')),
    });

    /*
     * `group` 单独拿出去（不从 `game` 里读）：它是**这一次归组的结果**，不是游戏本身的
     * 字段 —— `insertGame` 的返回值把它多带了一层。后台拿它提示「已归入《XXX》」，
     * 归错款（比如中文名写错一个字，另开了一款）时当场就能看见。
     */
    return NextResponse.json({ ok: true, game, group });
  } catch (error) {
    console.error('[admin] 上传失败', error);
    // 把底层原因（如「R2 未配置：缺少 R2_ACCESS_KEY_ID」）透给后台，别吞掉
    return fail('upload-failed', (error as Error).message, 500);
  }
}