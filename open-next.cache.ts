/*
 * gzip 压缩版 R2 增量缓存（2026-11-02）。
 *
 * ## 为什么
 *
 * 线上缓存桶 `nesload-next-cache` 到 11-02 是 109,372 个对象 / 7.08 GiB，平均 67.9 KB，
 * 体积几乎全在 50-200 KB 那 5.6 万条上。抽样下载后发现它们都是 `{"type":"app","html":…}`
 * 的**整页 ISR 缓存**（html 50 KB + rsc 25 KB + segmentData），JSON 里全是重复的标签、
 * 类名和中文 UTF-8。`r2IncrementalCache` 是 `r2.put(key, JSON.stringify(value))` 直存的，
 * 一点没压。实测这 10 万条平均能压到 **7.4 倍**（604 KB → 82 KB），7 GiB 能降到 1 GiB 以内。
 *
 * ## 做法
 *
 * 只换「存字节」的方式，**不动 key、不动结构、不动 revalidate**：
 *   · 写：`JSON.stringify` 之后 gzip；小于 1 KB 的直存（gzip 头尾 18 字节，小的压完反而大）；
 *   · 读：看头两字节是不是 gzip 魔数 `1f 8b`，是就解压，不是当明文 JSON 读。
 *
 * 第二条是这次能平滑上线的原因：桶里已有 10 万个明文对象，新版本照样读得动，
 * **不会因为换格式就全站冷启动**。被访问到的条目会以压缩形式原地覆盖，
 * 没再被访问的旧对象等下一次 `cf:deploy` 清旧 buildId 目录时一起消失。
 *
 * ## 代价
 *
 * 每次命中多一次解压，走 Workers 原生的 `DecompressionStream`，100 KB 量级约 0.2-0.4 ms，
 * 相比条目本身 `JSON.parse` 已经要付的钱是小头；而压缩只发生在**写入**（一条 7 天才写一次），
 * 不进读热路径 —— 2026-11-03 起写入整段（压缩 + R2 put）还挪进了 `ctx.waitUntil`，
 * 连那 100-400 ms 的 R2 往返都不再压 TTFB，见 `inBackground`。
 * 要回退：把 `COMPRESS` 改 `false` 重新发版，读侧认魔数，两种格式可共存。
 *
 * ## 否掉的方案
 *
 *   · 给 R2 对象设 `contentEncoding: gzip`：只有走 S3/公网域时才有意义，Workers binding
 *     读回来仍是压缩字节，还是得自己解压，白白多一层语义歧义。
 *   · 缓存键去掉 `locale` 让 18 种语言共用一条：展示结果没问题，但列表页每次要把
 *     18 倍文案（实测 245 KB）反序列化，免费版 10 ms CPU 直接爆，等于把 2026-10-23
 *     那次优化倒回去。压缩是纯存储层的事，不碰 CPU 大头，所以选它。
 *   · 压缩完直接删旧对象：桶里 10 万条里绝大多数还有效（7 天 revalidate），删了就是冷启动。
 *
 * ⚠️ key 仍然由 open-next 的 `computeCacheKey` 生成，必须和它内部完全一致，否则读写的
 *    不是同一批对象，症状是「缓存永远不命中」而且不报错。所以这里绝不自己写 sha256。
 * ⚠️ 文件放在仓库根、和 `open-next.config.ts` 并列：它只跑在 open-next 的打包链路里，
 *    不属于 Next 应用代码，别挪进 `lib/`（那边会被 Next 一起编进 server bundle）。
 */

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { computeCacheKey } from '@opennextjs/cloudflare/overrides/internal';
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';

/** 关掉就退回明文直存。已写入的压缩条目仍然能读（读侧按魔数判断）。 */
const COMPRESS = true;

/** 小于这个体积不压：gzip 头尾 18 字节 + CPU 不值。桶里 1 万条 <2 KB 的详情数据走这支。 */
const MIN_COMPRESS_BYTES = 1024;

const BINDING_NAME = 'NEXT_INC_CACHE_R2_BUCKET';
const PREFIX_ENV_NAME = 'NEXT_INC_CACHE_R2_PREFIX';

/**
 * open-next 的三种条目后缀（`Extension`）。三种都要原样拼进 key，漏一个就会和
 * 别的条目撞 key —— 现在只用到前两种，`composable` 是给 `use cache` 留的位置。
 */
type CacheType = 'cache' | 'fetch' | 'composable';

/** 只用到这三个方法，结构类型就够 —— `@opennextjs/aws` 是间接依赖，直接 import 它的类型会解析不到。 */
interface CacheBucket {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; uploaded: Date } | null>;
  put(key: string, value: Uint8Array): Promise<unknown>;
  delete(key: string): Promise<void>;
}

interface CacheEnv {
  NEXT_INC_CACHE_R2_BUCKET?: CacheBucket;
  NEXT_INC_CACHE_R2_PREFIX?: string;
}

function bucket(): CacheBucket | undefined {
  // 只在请求内调用：`getCloudflareContext()` 依赖 async local storage，模块顶层拿不到。
  return (getCloudflareContext().env as unknown as CacheEnv)[BINDING_NAME];
}

function objectKey(key: string, cacheType: CacheType): string {
  return computeCacheKey(key, {
    prefix: (getCloudflareContext().env as unknown as CacheEnv)[PREFIX_ENV_NAME],
    buildId: process.env.OPEN_NEXT_BUILD_ID,
    cacheType,
  });
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/**
 * 把「压缩 + 写 R2」推到响应之后（`ctx.waitUntil`）。
 *
 * 为什么不 await：这两步只在**未命中**时发生，而每条未命中本来就要付一整趟渲染的钱，
 * R2 的往返延迟（国内到 R2 通常 100-400 ms）是纯等待，白白压在 TTFB 上。
 * 推后之后客户端先拿到 HTML，写缓存在后台完成 —— 语义上没问题，缓存写入本来就是
 * 尽力而为（open-next 原实现也是 `await`，但它没有「10 ms CPU」这个上限要顾）。
 *
 * ⚠️ **object key 必须在同步段算好再传进来**：`getCloudflareContext()` 靠
 *    async local storage，进了 `waitUntil` 的异步上下文之后可能已经取不到了，
 *    那样会算出一个 `buildId=undefined` 的 key，症状是「写得进、永远读不到」。
 *    同理 `bucket()` 也在同步段取。
 *
 * ⚠️ 失败只打日志：缓存没写进去顶多下次再渲染一遍，不能让一条写入把已经渲染好的
 *    页面打成 500。
 */
function inBackground(task: Promise<unknown>): void {
  try {
    getCloudflareContext().ctx.waitUntil(task.catch((error) => {
      console.error('[cache] 后台写入失败', error);
    }));
  } catch {
    // 拿不到 ctx（理论上只有非 Workers 环境）—— 退化成不等待，别因为写缓存抛错
    void task.catch((error) => console.error('[cache] 写入失败', error));
  }
}

async function pipeThrough(
  bytes: Uint8Array,
  transform: CompressionStream | DecompressionStream
): Promise<Uint8Array> {
  // `Uint8Array` 的泛型参数在新版 TS 里是 `ArrayBufferLike`，和 `BodyInit` 要求的
  // `ArrayBufferView<ArrayBuffer>` 对不上 —— 运行时就是普通二进制，直接断言。
  const body = new Response(bytes as unknown as BodyInit).body;
  if (!body) return bytes;
  const stream = body.pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function get(key: string, cacheType: CacheType = 'cache') {
  const r2 = bucket();
  if (!r2) return null;

  const object = await r2.get(objectKey(key, cacheType));
  if (!object) return null;

  try {
    const stored = new Uint8Array(await object.arrayBuffer());
    const bytes = isGzip(stored) ? await pipeThrough(stored, new DecompressionStream('gzip')) : stored;
    return {
      value: JSON.parse(new TextDecoder().decode(bytes)),
      lastModified: object.uploaded.getTime(),
    };
  } catch (error) {
    /*
     * 读坏了就当未命中，让上层重新渲染并覆盖这一条。
     * 不要往上抛：一条损坏的缓存不该把整页打成 500（旧版本明文条目、写了一半的对象都可能走到这）。
     */
    console.error('[cache] 读取失败，按未命中处理', key, error);
    return null;
  }
}

async function set(key: string, value: unknown, cacheType: CacheType = 'cache') {
  const r2 = bucket();
  if (!r2) return;

  const json = JSON.stringify(value);
  // `JSON.stringify(undefined)` 返回 undefined —— 那种情况 open-next 走的是 delete，不该到这儿。
  if (!json) return;

  // key 与 binding 都在同步段取（见 inBackground 的说明）
  const objectName = objectKey(key, cacheType);

  inBackground(
    (async () => {
      const bytes = new TextEncoder().encode(json);
      const payload =
        COMPRESS && bytes.byteLength >= MIN_COMPRESS_BYTES
          ? await pipeThrough(bytes, new CompressionStream('gzip'))
          : bytes;
      await r2.put(objectName, payload);
    })()
  );
}

/** 和 open-next 原实现一致：删除只针对 `cache` 类型，`fetch` 条目留给 revalidate 自然覆盖。 */
async function remove(key: string) {
  const r2 = bucket();
  if (!r2) return;
  await r2.delete(objectKey(key, 'cache'));
}

/**
 * 对外形状必须和 `r2IncrementalCache` 实例完全一致 —— 断言成 `typeof` 它，
 * 这样 `defineCloudflareConfig` 那头的类型检查照常生效，也不用去 import 间接依赖的类型。
 */
const compressedIncrementalCache = {
  name: 'cf-r2-incremental-cache+gzip',
  get,
  set,
  delete: remove,
} as unknown as typeof r2IncrementalCache;

export default compressedIncrementalCache;
