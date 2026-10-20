/*
 * Supabase Postgres 直连客户端 —— `./d1.ts` 的 `query()` 平替。
 *
 * ---------------------------------------------------------------------------
 * 为什么是「直连」而不是官方包
 *
 * 官方 `@supabase/supabase-js` 走 PostgREST，**不能执行原始 SQL**，本项目那 60 多处
 * `query(sql, params)` 一行都搬不过去（详见 `./supabase.ts` 的头注释）。
 * 而这条 TCP 路能原样跑 SQL，所以**只要换掉 import**，调用点几乎不用改。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 连不上 Direct connection，必须走 pooler（2026-10-20 实测）
 *
 *   db.<ref>.supabase.co          只有 IPv6 → 本机 TCP 5432 直接 ENOENT
 *   aws-0-us-west-2.pooler...     XX000 tenant/user ... not found（分片不对）
 *   aws-1-us-west-2.pooler...     ✅ 通（user=postgres / PG 17.11）
 *
 * 用户名必须是 `postgres.<project-ref>`，不是 `postgres`。
 * 5432（session）和 6543（transaction）都验过能用；两者的区别只在连接复用粒度，
 * 代码侧统一 `prepare: false` 即可（transaction pooler 不支持预处理语句）。
 *
 * ⚠️ **部署形态的坑**：`postgres`（porsager）底层用 TCP。Cloudflare Workers 里没有
 *    裸 TCP，这条路上线要么挂 Hyperdrive、要么走 `cloudflare:sockets`。**未验证**。
 *    本地 `next dev` / Node 托管没有任何问题。
 */

import postgres, { type Sql } from 'postgres';

/** 未配置时给出明确报错，不要让它表现成「连不上」。 */
export class PgUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PgUnavailableError';
  }
}

let cached: Sql | null = null;

export function isPgConfigured(): boolean {
  return Boolean(process.env.SUPABASE_DB_URL?.trim());
}

/**
 * 懒加载单例。
 *
 * `max: 1`：pooler 的 session 模式里每条客户端连接都占一个服务端连接，免费额度很小；
 * 本项目是「低频写 + 小结果集」，一条够用。真需要并发再往上调。
 * `idle_timeout` 让空闲连接自己退掉，免得 dev 热重载把连接数堆起来。
 */
function client(): Sql {
  if (cached) return cached;

  const url = process.env.SUPABASE_DB_URL?.trim();
  if (!url) {
    throw new PgUnavailableError('Postgres 未配置：缺少 SUPABASE_DB_URL');
  }

  cached = postgres(url, {
    ssl: 'require',
    prepare: false, // transaction pooler（6543）不支持预处理语句
    max: 1,
    idle_timeout: 20,
    connect_timeout: 15,
  });

  return cached;
}

/**
 * 把 `?` 占位符换成 Postgres 的 `$1 / $2 …`。
 *
 * 为什么要这层：全站 SQL 都按 SQLite 习惯写 `?`，而 Postgres 只认 `$n`。
 * 有了它，`./d1.ts` → `./pg.ts` 就只是换一行 import。
 *
 * 扫描时**跳过**这些区域里的 `?`：单引号字符串（`''` 转义）、双引号标识符、
 * `$$ … $$` 美元引用、`--` 行注释、斜杠星号块注释。
 *
 * ⚠️ 已知边界：jsonb 的 `?` / `?|` / `?&` 存在运算符会被当成占位符。
 *    本项目没用，真用到就改写 SQL（比如 `jsonb_exists(col, 'k')`），别在这里打补丁。
 */
function toDollarPlaceholders(text: string): string {
  let out = '';
  let index = 0;
  let params = 0;

  const copyUntil = (stop: string, from: number): number => {
    // 从 from 开始找 stop，连同 stop 一起拷出去；找不到就拷到结尾
    const end = text.indexOf(stop, from);
    const cut = end === -1 ? text.length : end + stop.length;
    out += text.slice(from, cut);
    return cut;
  };

  while (index < text.length) {
    const ch = text[index];

    // 单引号字符串：'' 是转义的单引号，要跳过去继续找闭合
    if (ch === "'") {
      let cursor = index + 1;
      while (cursor < text.length) {
        if (text[cursor] === "'" && text[cursor + 1] === "'") cursor += 2;
        else if (text[cursor] === "'") break;
        else cursor += 1;
      }
      out += text.slice(index, cursor + 1);
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
    if (ch === '-' && text[index + 1] === '-') {
      const newline = text.indexOf('\n', index);
      const cut = newline === -1 ? text.length : newline;
      out += text.slice(index, cut);
      index = cut;
      continue;
    }

    // 块注释
    if (ch === '/' && text[index + 1] === '*') {
      out += '/*';
      index = copyUntil('*/', index + 2);
      continue;
    }

    // 美元引用：$$ … $$ 或 $tag$ … $tag$
    if (ch === '$') {
      const tag = /^\$[A-Za-z_0-9]*\$/.exec(text.slice(index));
      if (tag) {
        out += tag[0];
        index = copyUntil(tag[0], index + tag[0].length);
        continue;
      }
    }

    if (ch === '?') {
      params += 1;
      out += `$${params}`;
      index += 1;
      continue;
    }

    out += ch;
    index += 1;
  }

  return out;
}

/**
 * 执行一条 SQL，返回结果行。签名与 `./d1.ts` 的 `query()` 完全一致 —— 换 import 即可。
 *
 * ⚠️ 与 D1 的差别：这里**支持多语句和事务**（D1 的 REST 接口单次只跑一条）。
 * ⚠️ 参数没有类型上下文时（例如裸的 `select ?`），Postgres 按 text 处理，回来的是字符串
 *    `"1"` 而不是数字 `1`。跟真实列比较 / 插入时会按列类型自动转换，不用管；
 *    但**别在结果上直接做算术**，需要数字就在 SQL 里 `::int`。
 */
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const rows = await client().unsafe(toDollarPlaceholders(sql), params as never[]);
  // postgres.js 返回的是「类数组」，转成真数组，免得调用方用 map / 解构时踩到它的额外属性
  return Array.from(rows) as unknown as T[];
}

/**
 * 在一个事务里跑一段逻辑。D1 那边做不到（REST 一次一条），这是换库之后白拿的能力。
 *
 *     await transaction(async (tx) => {
 *       await tx.query('update a set n = n - 1 where id = ?', [from]);
 *       await tx.query('update a set n = n + 1 where id = ?', [to]);
 *     });
 */
export async function transaction<R>(
  run: (tx: { query: typeof query }) => Promise<R>
): Promise<R> {
  return client().begin(async (tx) => {
    const scoped = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
      const rows = await tx.unsafe(toDollarPlaceholders(sql), params as never[]);
      return Array.from(rows) as unknown as T[];
    };
    return run({ query: scoped as typeof query });
  }) as Promise<R>;
}

/** 只给脚本 / 探针用：主动关掉连接池。应用里别调。 */
export async function closePg(): Promise<void> {
  if (!cached) return;
  await cached.end({ timeout: 5 });
  cached = null;
}
