/*
 * 头像（`/api/user/avatar`）。
 *
 *   POST   上传 / 更换头像（multipart，字段 `avatar`）
 *   DELETE 清掉头像（回到默认图）
 *
 * 本体走 R2（`avatars/<user_id>/<uuid><ext>`），D1 那边只存 key
 * （`app_users.avatar_key`）—— 和存档同一套路（见 lib/server/user-data.ts）。
 *
 * ⚠️ **不挂 middleware**（见 middleware.ts 的 matcher）：它会缓冲整个请求体并默认
 *    截断到 10MB。头像有 `MAX_AVATAR_BYTES`（2MB）卡着，截断轮不到 —— 但**鉴权必须
 *    先于读 body**（同 /api/user/saves）：未登录的请求不该有机会让我们把一个
 *    几 MB 的表单解析一遍。
 *
 * 鉴权用 `assertUser`（**写接口，必须查库复核封禁**）。
 */

import { NextResponse } from 'next/server';
import { assertUser } from '@/lib/server/app-guard';
import { setAppUserAvatar } from '@/lib/server/app-users';
import { avatarKey, MAX_AVATAR_BYTES, removeAvatar, uploadAvatar } from '@/lib/server/user-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 允许的图片类型 → 扩展名。
 *
 * **白名单而不是黑名单**：头像是要当 `<img src>` 直接渲染的，让任意 MIME 落进
 * 公开桶里迟早出事（SVG 能带脚本，`image/svg+xml` 因此**故意不在**这份表里）。
 *
 * 扩展名从 MIME 推，而不是拿用户给的文件名 —— 文件名可以伪装，
 * 而且 `<img>` 渲染只看 Content-Type，扩名只是给人看的。
 */
const AVATAR_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/** 表单里真正的文件。空 input 会塞一个 size 为 0 的 File，那等同于没选。 */
function asFile(value: FormDataEntryValue | null): File | null {
  return value instanceof File && value.size > 0 ? value : null;
}

export async function POST(request: Request) {
  const guard = await assertUser();
  if (!guard.ok) return guard.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }

  const file = asFile(form.get('avatar'));
  if (!file) return NextResponse.json({ error: 'missing-avatar' }, { status: 400 });
  if (file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json(
      { error: 'avatar-too-large', detail: `${file.size} > ${MAX_AVATAR_BYTES}` },
      { status: 413 }
    );
  }

  /*
   * 类型白名单。`file.type` 是浏览器给的（可以伪造），但伪造它没有任何好处：
   * 我们照样会用它推扩展名、原样当 Content-Type 传给 R2 —— 一个伪造的
   * `image/png` 只会让浏览器按 png 去解一段不是 png 的字节，然后显示裂图。
   * 真正要防的是「上传可执行内容并让它以那个类型被服务」，白名单把这条路堵死了。
   */
  const ext = AVATAR_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'unsupported-type' }, { status: 415 });

  const key = avatarKey(guard.user.uid, ext);
  try {
    await uploadAvatar(key, new Uint8Array(await file.arrayBuffer()), file.type);

    const updated = await setAppUserAvatar(guard.user.uid, key);
    if (!updated) {
      // 号在守卫那步还在、走到这儿没了。兜个底，顺手把刚传上去的对象清掉
      await removeAvatar(key);
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    /*
     * 删旧对象（**换头像 / 清头像 / 删号时都要**，见 setAppUserAvatar 的注释）。
     *
     * ⚠️ 放在写库**之后**、且**尽力而为**：新头像已经生效了，旧对象删不掉
     *    只是浪费一点空间，不该让「头像已换」变成报错。`removeAvatar` 自己吞异常。
     */
    await removeAvatar(updated.previousKey);

    return NextResponse.json({ ok: true, user: updated.user });
  } catch (error) {
    console.error('[user] 换头像失败', error);
    // R2 传失败时刚建的那个 key 是孤儿（库里没引用它）。尽力清一下
    await removeAvatar(key);
    return NextResponse.json({ error: 'avatar-failed' }, { status: 500 });
  }
}

/** 清掉头像，回到默认图。清不掉（本来就没有）也算成功 —— 幂等。 */
export async function DELETE() {
  const guard = await assertUser();
  if (!guard.ok) return guard.response;

  try {
    const updated = await setAppUserAvatar(guard.user.uid, null);
    if (!updated) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    await removeAvatar(updated.previousKey);
    return NextResponse.json({ ok: true, user: updated.user });
  } catch (error) {
    console.error('[user] 清头像失败', error);
    return NextResponse.json({ error: 'avatar-failed' }, { status: 500 });
  }
}
