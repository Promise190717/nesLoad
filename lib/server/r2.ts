/*
 * Cloudflare R2 的对象存储封装（S3 兼容接口）。
 *
 * 上传走 S3 SDK + SigV4 签名（手写签名太容易出错），只在服务端使用；
 * 读取有**两条**路：
 *   · 公网域名 `R2_PUBLIC_BASE` —— 图片直接给前台、`node scripts/*.mjs` 也用这条；
 *   · **R2 binding**（`gamesBucket()`，2026-11-05 加）—— ROM 代理专用，见下面那段注释。
 */

import http from 'node:http';
import https from 'node:https';
import { getCloudflareContext } from '@opennextjs/cloudflare';
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

/* ---------------------------------------------------------------------------
 * R2 binding —— ROM 代理读自己桶里那批对象时用（2026-11-05 加）
 *
 * ## 为什么不能只靠公网域名
 *
 * `publicUrl()` 拼出来的 `files.retrogamesbox.com/...` 前面还有一层 Cloudflare 缓存。
 * 对象在某台边缘节点上是**冷**的时候，那层缓存会**忽略 `Range`、回 200 + 整个文件**
 * （2026-11-05 实测：`sengoku-3` 53 MB / `art-of-fighting-3` 26 MB 第一次全是 200 无
 * `Content-Range`，第二次才 206）。于是客户端只要 1 个字节，Worker 也要把几十 MB
 * 原样流一遍 —— 免费版 10ms CPU 下这就是线上 503（1102）。
 *
 * binding 是 Worker 与桶之间的**内部调用**：没有公网、没有那层缓存，`range` 要多少
 * 给多少，永远 206。探针那一步还能只读 1 个字节就拿到总长。
 *
 * ## 两个必须记住的限制
 *
 * ⚠️ **只在 Worker 运行时里可用**。`next dev` / `node scripts/*.mjs` 没有 `env`，
 *    `gamesBucket()` 返回 null，调用方**必须**回落到 `publicUrl()`。
 *    所以这里不抛异常、不写日志 —— 「取不到」是本地开发的正常状态。
 * ⚠️ **它只覆盖本站自持的那批**（`source_url` 以 `r2:` 开头，约 4.2 GB 街机）。
 *    上游那批（PS1 / NDS 等 300+ GB）在别人的桶里，binding 读不到，也不该读。
 *
 * ⚠️ 绑定名 `GAMES_R2` 必须和 `wrangler.jsonc` 的 `r2_buckets` 逐字一致 ——
 *    对不上就是静默拿到 undefined（不报错），然后静默退回公网域名。
 */

/** R2 binding 的最小形状（不引 `@cloudflare/workers-types`：那套类型在 Node 侧用不上）。 */
export type R2ObjectLike = {
  body: ReadableStream<Uint8Array> | null;
  /** 对象的**总**大小，不是本次 range 的长度。 */
  size: number;
  /** 本次实际返回的那一段（没带 range 时没有这个字段）。 */
  range?: { offset: number; length: number };
};

export type R2BucketLike = {
  head(key: string): Promise<{ size: number } | null>;
  get(
    key: string,
    options?: { range?: { offset: number; length?: number } }
  ): Promise<R2ObjectLike | null>;
};

/** 装着 ROM 的那个桶的 binding 名（见 `wrangler.jsonc`）。 */
const GAMES_BUCKET_BINDING = 'GAMES_R2';

/**
 * 取 ROM 桶的 binding。**取不到就返回 null**（本地 dev / 忘了配 binding），
 * 由调用方回落到公网域名 —— 这条路径绝不因为「拿不到 binding」而失败。
 */
export function gamesBucket(): R2BucketLike | null {
  let env: unknown;
  try {
    // 必须在请求内调用：`getCloudflareContext()` 依赖 async local storage
    env = getCloudflareContext().env;
  } catch {
    // `next dev` / 构建期 / 静态生成时没有 Cloudflare context，这是正常情形
    return null;
  }
  const bucket = (env as Record<string, R2BucketLike | undefined>)?.[GAMES_BUCKET_BINDING];
  return bucket ?? null;
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
