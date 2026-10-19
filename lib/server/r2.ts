/*
 * Cloudflare R2 的对象存储封装（S3 兼容接口）。
 *
 * 上传走 S3 SDK + SigV4 签名（手写签名太容易出错），只在服务端使用；
 * 读取不走 SDK，而是走 R2_PUBLIC_BASE 公网域名（图片直接给前台、ROM 由
 * /api/games/[id]/rom 回源代理），因为读是公开的，没必要带签名。
 */

import http from 'node:http';
import https from 'node:https';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { parseProxyUrl, withProxy } from './proxy-agent';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`R2 未配置：缺少 ${name}`);
  return value;
}

let client: S3Client | null = null;

/**
 * 上传 / 删除要不要走本机代理（**可选**）。
 *
 * 为什么需要：国内直连 R2 的上传经常慢到没法用（几百 KB/s 甚至断），
 * 而用户本机就有个 Clash / Mihomo 的混合端口（7897）。R2 的公网**读取**走的是
 * `R2_PUBLIC_BASE` 那个独立域名、和这里无关，所以配了代理不会让前台变慢。
 *
 * ⚠️ S3 SDK 在 Node 下**不会**自动读 `HTTPS_PROXY` / `HTTP_PROXY` 环境变量 ——
 *    必须显式把带隧道的 agent 塞进 `requestHandler`。
 *
 * ⚠️ **刻意用 `{ httpAgent, httpsAgent }` 这种「构造参数」形态，不 import
 *    `@smithy/node-http-handler` 的类** —— 那个包只是 `@aws-sdk/client-s3` 的
 *    传递依赖，根 `node_modules` 里没有它（pnpm 的隔离布局），直接 import 会
 *    「模块找不到」。而 `requestHandler` 接受**构造参数对象**（SDK 自己会拿它去
 *    造 NodeHttpHandler），所以根本不需要那个 import。
 *
 * ⚠️ 值形如 `http://127.0.0.1:7897`，用环境变量 `R2_PROXY`。
 *    留空 = 直连（原行为）。
 */
function agentOverrides(): {
  httpAgent?: http.Agent;
  httpsAgent?: https.Agent;
} {
  const target = parseProxyUrl(process.env.R2_PROXY);
  if (!target) return {};

  return {
    httpAgent: withProxy(new http.Agent({ keepAlive: true }), target),
    httpsAgent: withProxy(new https.Agent({ keepAlive: true }), target),
  };
}

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto', // R2 用 auto
      endpoint: requireEnv('R2_ENDPOINT'),
      credentials: {
        accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
      },
      /*
       * 只有配了代理才动 requestHandler —— 不配时保持 SDK 默认，
       * 别为了一个可选项把所有人的默认路径都换掉。
       */
      requestHandler: agentOverrides(),
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

/** key → 公网地址（`publicUrl` 与 `publicUrlOrNull` 共用的拼法）。 */
function joinPublicUrl(base: string, key: string): string {
  const path = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${base.replace(/\/+$/, '')}/${path}`;
}

/** 由对象 key 拼出公网读取地址。**缺配置就抛** —— 拿不到地址这一类请求就没法继续。 */
export function publicUrl(key: string): string {
  return joinPublicUrl(requireEnv('R2_PUBLIC_BASE'), key);
}

/**
 * 展示用字段的「软」版本：没配 `R2_PUBLIC_BASE` 就回 null，**不抛**。
 *
 * 为什么要有这一版（2026-10-19 线上事故）：线上 Worker 少了 `R2_PUBLIC_BASE` 这个变量，
 * 而头像地址挂在 `toAppUser` 上、`toAppUser` 又挂在 `assertUser` 上 —— 于是那一抛
 * 把**整个** `/api/user/*` 全带走了：个人中心的收藏 / 历史 / 存档 / 资料四个 tab 一起回
 * 空 500（响应体是空的，连 `{error}` 都没有，因为异常发生在 try 之前）。
 * 排查很久才落到「资源就是少了一个环境变量」。
 *
 * 判据：**拼不出头像地址 ≠ 这次请求该失败**。头像没有就画默认头像 —— 前端本来就支持 null
 * （`avatarUrl: null` 是正常态，没设过头像的人天天走这条）。
 *
 * 仍然用严格版 `publicUrl` 的地方：上传（`uploadObject` 后要回写地址）、ROM 代理、
 * 存档下载 —— 那些没有这配置根本没法工作，就该明确报错。
 */
export function publicUrlOrNull(key: string | null | undefined): string | null {
  if (!key) return null;
  const base = process.env.R2_PUBLIC_BASE?.replace(/\/+$/, '');
  if (!base) return null;
  return joinPublicUrl(base, key);
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
