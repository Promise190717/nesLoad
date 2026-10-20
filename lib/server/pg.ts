/*
 * 全站唯一的数据访问出口：`query(sql, params)`。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 2026-10-20 线上事故：Worker 里跑不了裸 TCP，改成 HTTPS
 *
 * 迁移 Supabase 时这里曾是 `postgres`（porsager）直连 pooler。本地 `next dev`
 * 一切正常，**上线后全站 500**：`/api/games`、`/api/games/[id]`、`/api/user/*`
 * 全挂，凡是没被 ISR 缓存的页面也一起挂。原因不在 SQL，在链路 ——
 * Cloudflare Workers 里没有可用的裸 TCP + TLS：
 *
 *   · `node:net` 的 `connect()` 能连上（SYN/ACK 都通），但 `tls.connect({ socket })`
 *     在这层之上建完通道后，**写第一条 PG 报文就断**（实测报 `Network connection lost.`）；
 *   · `postgres` 默认还会给 TLS 传 `rejectUnauthorized: false`，而 Workers 的
 *     `node:tls` 直接抛 `The options.rejectUnauthorized option is not implemented`；
 *   · 想绕开就走 `cloudflare:sockets` 的 `startTls()`，那等于自己重写 PG 协议栈。
 *
 * 结论：Worker 里**不要碰 TCP**。这里改成调 Supabase 的 HTTPS RPC
 * （`/rest/v1/rpc/exec_sql`，函数定义见 `db/schema.pg.sql` 末尾），
 * `fetch` 是 Workers 的原生能力，不会有链路问题。
 *
 * ---------------------------------------------------------------------------
 * 为什么是「一个通用 RPC」而不是 PostgREST 链式查询
 *
 * 全站 60 多处 `query(sql, params)` 都是手写 SQL（多表 JOIN、聚合、`RETURNING`），
 * 搬进 `supabase.from(...).select(...)` 得逐个重写、还会丢掉 JOIN 的可读性。
 * 所以远端只放**一个**执行器：收一句 SQL，返回 `jsonb` 数组。调用方一行都不用改。
 *
 * 代价（知道就好，别当成 bug）：
 *   · 每次查询 = 一次 HTTPS 往返。页面侧有 30 天 ISR 缓存，接口本来也不密集，够用；
 *   · 没有事务。`transaction()` 已经删掉（当时无调用方），需要事务的活写成一条语句。
 *
 * ---------------------------------------------------------------------------
 * 占位符仍然是 `?`，参数在这里就地变成字面量
 *
 * PostgREST 的 RPC 只能按名字传参，没法给「任意 SQL」绑定第 N 个参数，所以
 * `bindParams()` 把 `?` 逐个换成**已转义的字面量**：字符串按 `''` 转义、数字/
 * 布尔直接写、`null` 写 `null`，其余类型（数组、二进制…）一律抛错 —— 宁可炸在
 * 明显的地方，也不要静默拼错。扫描器跳过单引号字符串、双引号标识符、`$$`、注释，
 * 所以 `'%?%'` 这种字符串里的问号不会被误当成占位符。
 *
 * ⚠️ 已知边界（和上一版一样）：jsonb 的 `?` / `?|` / `?&` 存在运算符会被当成占位符。
 *    本项目没用，真用到就改写 SQL（比如 `jsonb_exists(col, 'k')`），别在这里打补丁。
 */

/** 未配置凭据时给出明确报错，不要让它表现成「连不上」。 */
export class PgUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PgUnavailableError';
  }
}

/**
 * 密钥变量名：新版 `SUPABASE_SECRET_KEY`（`sb_secret_...`）优先，
 * 回退到老项目的 `SUPABASE_SERVICE_ROLE_KEY`。和 `./supabase.ts` 同一套口径。
 *
 * ⚠️ 只用 secret key（绕过 RLS）。publishable / anon 键调不了这个函数 ——
 *    函数权限已经 `revoke` 掉 anon/authenticated，只留给 service_role。
 */
const KEY_ENV_NAMES = ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

/** 单次查询的等待上限。RPC 是同步执行，超过这个时间基本是库那边卡住了。 */
const QUERY_TIMEOUT_MS = 20_000;

interface RestEndpoint {
  url: string;
  key: string;
}

function restEndpoint(): RestEndpoint | null {
  const base = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
  const key = KEY_ENV_NAMES.map((name) => process.env[name]?.trim()).find(Boolean);
  if (!base || !key) return null;
  return { url: `${base}/rest/v1/rpc/exec_sql`, key };
}

/* ================================================================== *
 * 参数 → 字面量
 * ================================================================== */

/** 单引号字符串字面量。标准 `standard_conforming_strings=on` 下反斜杠是普通字符。 */
function stringLiteral(value: string): string {
  // PG 的 text 不能含 NUL，早点炸比让驱动报一句看不懂的错好
  if (value.includes('\u0000')) {
    throw new Error('SQL 参数含 NUL 字符，Postgres 不接受');
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function literal(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return stringLiteral(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`SQL 参数不是有限数字：${String(value)}`);
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return stringLiteral(value.toISOString());
  /*
   * 数组 / 二进制 / 对象**故意不支持**：真需要时应该写成 `= any(array[...])`
   * 或先 `encode(...)`，而不是指望这里猜。抛错是为了在开发期立刻发现。
   */
  throw new Error(`不支持的 SQL 参数类型：${Object.prototype.toString.call(value)}`);
}

/**
 * 把 `?` 占位符按顺序换成字面量。
 *
 * 扫描时**跳过**这些区域里的 `?`：单引号字符串（`''` 转义）、双引号标识符、
 * `$$ … $$` 美元引用、`--` 行注释、块注释。字面量是边扫边写出去的，
 * 不会被二次扫描，所以参数内容里出现 `?` / `'` 都不会破坏结构。
 */
function bindParams(sql: string, params: readonly unknown[]): string {
  let out = '';
  let index = 0;
  let used = 0;

  const copyUntil = (stop: string, from: number): number => {
    // 从 from 开始找 stop，连同 stop 一起拷出去；找不到就拷到结尾
    const end = sql.indexOf(stop, from);
    const cut = end === -1 ? sql.length : end + stop.length;
    out += sql.slice(from, cut);
    return cut;
  };

  while (index < sql.length) {
    const ch = sql[index];

    // 单引号字符串：'' 是转义的单引号，要跳过去继续找闭合
    if (ch === "'") {
      let cursor = index + 1;
      while (cursor < sql.length) {
        if (sql[cursor] === "'" && sql[cursor + 1] === "'") cursor += 2;
        else if (sql[cursor] === "'") break;
        else cursor += 1;
      }
      out += sql.slice(index, cursor + 1);
      index = cursor + 1;
      continue;
    }

    // 双引号标识符（开引号要先补出去，copyUntil 是从它后面开始拷的）
    if (ch === '"') {
      out += '"';
      index = copyUntil('"', index + 1);
      continue;
    }

    // 行注释
    if (ch === '-' && sql[index + 1] === '-') {
      const newline = sql.indexOf('\n', index);
      const cut = newline === -1 ? sql.length : newline;
      out += sql.slice(index, cut);
      index = cut;
      continue;
    }

    // 块注释
    if (ch === '/' && sql[index + 1] === '*') {
      out += '/*';
      index = copyUntil('*/', index + 2);
      continue;
    }

    // 美元引用：$$ … $$ 或 $tag$ … $tag$
    if (ch === '$') {
      const tag = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(index));
      if (tag) {
        out += tag[0];
        index = copyUntil(tag[0], index + tag[0].length);
        continue;
      }
    }

    if (ch === '?') {
      if (used >= params.length) {
        throw new Error(`SQL 占位符比参数多：有 ${params.length} 个参数`);
      }
      out += literal(params[used]);
      used += 1;
      index += 1;
      continue;
    }

    out += ch;
    index += 1;
  }

  if (used !== params.length) {
    throw new Error(`SQL 占位符比参数少：给了 ${params.length} 个参数，只用上 ${used} 个`);
  }

  return out;
}

/* ================================================================== *
 * 执行
 * ================================================================== */

/** 从 PostgREST 的错误体里抠出人话（`{code,message,details,hint}`）。 */
function errorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { code?: string; message?: string; hint?: string };
    const parts = [parsed.code, parsed.message, parsed.hint].filter(Boolean);
    if (parts.length > 0) return `${parts.join(' · ')}（HTTP ${status}）`;
  } catch {
    /* 不是 JSON 就原样带出去 */
  }
  return `HTTP ${status} ${body.slice(0, 300)}`;
}

/**
 * 执行一条 SQL，返回结果行。签名与历史上的 D1 / pooler 版本完全一致 ——
 * 调用方只管写 `query('select …where x = ?', [x])`，不知道底下是 HTTPS。
 *
 * ⚠️ 与直连的差别：结果是 JSON 往返来的，所以
 *    · `timestamptz` 会变成 ISO 字符串（要毫秒时间戳就在 SQL 里
 *      `(extract(epoch from col) * 1000)::float8`，全站都是这么写的）；
 *    · `bigint` 会变成 number（直连时 postgres.js 给的是字符串）——
 *      需要精确大整数的地方自己 `::text`。
 */
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const endpoint = restEndpoint();
  if (!endpoint) {
    throw new PgUnavailableError('数据库未配置：缺少 SUPABASE_URL / SUPABASE_SECRET_KEY');
  }

  // 末尾分号会被包进 CTE 里，直接去掉（多处 SQL 是多行模板字符串，容易带上）
  const stmt = bindParams(sql, params).trim().replace(/;+\s*$/, '');

  let response: Response;
  try {
    response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: endpoint.key,
        authorization: `Bearer ${endpoint.key}`,
      },
      body: JSON.stringify({ stmt }),
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    });
  } catch (error) {
    // 网络层失败（DNS / TLS / 超时）—— 和「SQL 写错了」分开，日志里一眼能认出
    throw new Error(`数据库请求失败：${error instanceof Error ? error.message : String(error)}`);
  }

  const text = await response.text();
  if (!response.ok) {
    /*
     * 把出错的 SQL 也带上（截断）：PostgREST 只回错误码和消息，不带语句，
     * 而这条日志是线上唯一能看到「哪句 SQL 挂了」的地方。
     */
    throw new Error(`${errorMessage(response.status, text)}\nSQL: ${stmt.slice(0, 500)}`);
  }

  if (!text.trim()) return [];
  const rows: unknown = JSON.parse(text);
  return Array.isArray(rows) ? (rows as T[]) : [];
}
