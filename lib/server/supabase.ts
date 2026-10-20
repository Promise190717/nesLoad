/*
 * Supabase 的官方 Node 客户端（`@supabase/supabase-js`）—— 服务端专用入口。
 *
 * ⚠️ **当前没有调用方，也别为了「用官方包」把数据层搬过来**（2026-10-20 之后的状态）。
 *    全站 60 多处 `query(sql, params)` 是手写 SQL（JOIN / 聚合 / RETURNING），
 *    一行都搬不进链式构建器。数据层的实际出入口是 `./pg.ts`：
 *
 *      HTTPS → PostgREST → `public.exec_sql`（函数定义见 `db/schema.pg.sql` 末尾）
 *
 *    也就是说 **HTTPS 这条路已经在走了**，只是走的是「一个通用执行器」而不是
 *    supabase-js 的链式 API。这个文件留着是因为它的错误类型 / 密钥读取口径
 *    （`SUPABASE_SECRET_KEY` → `SUPABASE_SERVICE_ROLE_KEY`）还被 `./pg.ts` 沿用；
 *    哪天真要按表切到官方包，从这里补完即可。
 *
 * 为什么不能直连 Postgres：2026-10-20 试过 —— 本地 `next dev` 通，线上 Worker 全站 500。
 * Cloudflare Workers 里裸 TCP + TLS 建不起可用通道，详见 `./pg.ts` 的文件头。
 *
 * 为什么当初选官方包：它底层就是 PostgREST 的 HTTPS 调用，和原来的 D1 REST 客户端
 * 是同一个形态 —— 不需要 TCP 驱动，本地 `next dev`、Cloudflare Workers 都能跑。
 * 这一点在本项目尤其重要：`db.<ref>.supabase.co` **只解析 IPv6**，直连在多数国内
 * 网络下根本连不上（2026-10-20 实测：本机无全局 IPv6，5432 探测失败）。
 * 最后靠 **pooler**（`aws-1-us-west-2.pooler.supabase.com`）解决了，见 `./pg.ts`。
 *
 * ---------------------------------------------------------------------------
 * ⚠️⚠️ 它**不能执行原始 SQL** —— 这是它没被选为主力的根本原因
 *
 * `./pg.ts` 的 `query(sql, params)` 在全站有 60 多处调用，参数一律 `?` 占位。
 * supabase-js 没有对应物：它的入口是链式查询构建器
 *
 *     supabase.from('games').select('id, title').eq('console_type', 'nes').limit(20)
 *
 * 所以**旧的 SQL 字符串一行都搬不过来**，只有两条路：
 *   ① 逐个改写成链式调用（简单查询很顺，多表 JOIN / 聚合会很难看）；
 *   ② 把 SQL 封成 Postgres function，用 `supabase.rpc('fn_name', args)` 调
 *      （复杂查询走这条，SQL 还留在库里，可读性最好）。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 密钥只能用 secret（`sb_secret_...`，老项目叫 `service_role`）
 *
 * 它**绕过 RLS**，等于数据库全权限 —— 只能在服务端读，绝不能加 `NEXT_PUBLIC_` 前缀
 * （加了会被打进客户端产物，等于把库的钥匙发给每个访客）。
 * `sb_publishable_...` / `anon` 受 RLS 约束，服务端批量读写会到处 401，别用。
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * 「Supabase 还没配好」—— 和「SQL 写错了」在报错上分开，日志里一眼能认出是哪一类。
 * （`./d1.ts` 里那套 60 秒熔断 + 上游回退**没有**搬过来：Supabase 不是目录数据源，
 *   没有可回退的上游，失败了就该如实报错。）
 */
export class SupabaseUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseUnavailableError';
  }
}

/**
 * 密钥变量名：新版 `SUPABASE_SECRET_KEY`（`sb_secret_...`）优先，
 * 回退到老项目的 `SUPABASE_SERVICE_ROLE_KEY`。两个都空 = 未配置。
 */
const KEY_ENV_NAMES = ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

function readSecretKey(): string | undefined {
  for (const name of KEY_ENV_NAMES) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

/** 给「有这个功能就显示入口」这类分支用，不要在业务逻辑里拿它替代报错。 */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && readSecretKey());
}

/**
 * 懒加载单例。
 *
 * 不写在模块顶层：① 构建期 `next build` 会执行模块，那时 env 可能还没注入，顶层建会直接抛；
 * ② 客户端实例带内部状态，每个请求 new 一个既浪费又拿不到连接复用。
 */
let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL?.trim();
  const key = readSecretKey();
  if (!url || !key) {
    throw new SupabaseUnavailableError(
      'Supabase 未配置：缺少 SUPABASE_URL / SUPABASE_SECRET_KEY'
    );
  }

  cached = createClient(url, key, {
    auth: {
      /*
       * 服务端没有 localStorage，而且本项目**不用 Supabase Auth** ——
       * 账号是自己签 cookie 的（见 ./session.ts / ./app-session.ts）。
       * 这三项全关，免得它偷偷去读/写浏览器存储或在 URL 里找 token。
       */
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      // 方便在 Supabase 日志里认出是本项目的服务端请求。
      headers: { 'X-Client-Info': 'nesload-server' },
    },
  });

  return cached;
}

/** PostgREST 的返回形状（`.select()` / `.insert()` 等都长这样，单条时 data 不是数组）。 */
interface PostgrestResult<T> {
  data: T | null;
  error: { message: string; code?: string; details?: string; hint?: string } | null;
}

/**
 * 把 `{ data, error }` 拆成 data 或抛错。
 *
 * supabase-js **不抛异常**，错误全在返回值里 —— 忘记判 `error` 就会把 null 当数据用，
 * 而且 `data` 为 null 时往往表现为「列表空了」而不是报错，特别难查。所有调用都过这一层。
 *
 * ⚠️ 它**只管 error，不管 data 是不是 null**。这三种情况 data 天然为 null，别用 unwrap：
 *    · `head: true`（只要 count / 状态码，压根不返回行）
 *    · `maybeSingle()` 查不到行（这是正常的「没有」，不是错误）
 *    · `.insert()` 没加 `.select()`（不返回插入结果）
 *    这些地方自己解构 `{ data, count, error }`。
 *
 * ⚠️ 2026-10-20 实测：`head: true` 打一张**不存在的表**返回的是 `error: null` + `count: null`
 *    （普通 select 才会给 PGRST205）—— 所以「没报错」不等于「表存在」。
 */
export function unwrap<T>(result: PostgrestResult<T>): T {
  if (result.error) {
    const { message, code, details, hint } = result.error;
    const suffix = [code && `code=${code}`, details, hint].filter(Boolean).join(' / ');
    throw new Error(`Supabase 查询失败：${message}${suffix ? `（${suffix}）` : ''}`);
  }
  return result.data as T;
}
