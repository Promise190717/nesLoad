/*
 * Cloudflare R2 的对象存储封装（S3 兼容接口）。
 *
 * 上传走 S3 SDK + SigV4 签名（手写签名太容易出错），只在服务端使用；
 * 读取不走 SDK，而是走 R2_PUBLIC_BASE 公网域名（图片直接给前台、ROM 由
 * /api/games/[id]/rom 回源代理），因为读是公开的，没必要带签名。
 */

import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`R2 未配置：缺少 ${name}`);
  return value;
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto', // R2 用 auto
      endpoint: requireEnv('R2_ENDPOINT'),
      credentials: {
        accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
      },
    });
  }
  return client;
}

/** 上传一个对象。key 形如 `roms/<id>-<文件名>`。 */
export async function uploadObject(
  key: string,
  body: Uint8Array,
  contentType: string
): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: requireEnv('R2_BUCKET'),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

/** 由对象 key 拼出公网读取地址。 */
export function publicUrl(key: string): string {
  const base = requireEnv('R2_PUBLIC_BASE').replace(/\/+$/, '');
  const path = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${base}/${path}`;
}

/** 删除一个对象。删游戏时用来清理附件，属尽力而为，失败应被调用方忽略。 */
export async function deleteObject(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: requireEnv('R2_BUCKET'), Key: key })
  );
}

/**
 * 由公网 URL 反解回对象 key（`publicUrl` 的逆运算）。
 * 只认本站配置的域名；域名换过或不是本站的返回 null，调用方据此跳过删除。
 */
export function keyFromPublicUrl(url: string): string | null {
  const base = process.env.R2_PUBLIC_BASE?.replace(/\/+$/, '');
  if (!base || !url.startsWith(`${base}/`)) return null;
  return url
    .slice(base.length + 1)
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/');
}