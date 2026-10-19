/*
 * Cloudflare D1 的 REST API 客户端。
 *
 * 为什么要走 REST 而不是绑定（env.DB）：本项目是普通 Next.js 应用，不一定要部署到
 * Cloudflare 的 Workers/Pages，用 REST API 在本地和任意托管环境都能跑，代价只是每次查询
 * 多一次 HTTPS 往返——对后台录入这种低频写、前台列表这种小结果集完全够用。
 *
 * 凭据（CF_ACCOUNT_ID / CF_D1_API_TOKEN / D1_DATABASE_ID）只从服务端环境变量读，
 * 本文件只能在服务端（route handler / 脚本）导入，绝不能进客户端 bundle。
 *
 * ---------------------------------------------------------------------------
 * 2026-10-19：**这里不再是「切数据源」的开关**
 *
 * 先做过一版：把额度用尽 / 限流 / 5xx 收敛成 `D1UnavailableError`，数据层看到它
 * 就自动改吃上游。用户随后要求改成**由 `CATALOG_SOURCE` 环境变量决定**
 * （默认 `upstream`，见 `./catalog-source.ts`）—— 那边的文件头写了为什么不能自动切
 * （两套 id 会对不上、额度恢复时间猜不准、线上问题本地复现不出来）。
 *
 * 所以现在这里只剩两件事：
 *   1. 把「D1 暂时用不了」和「SQL 写错了」在**报错上**分开 —— 前者 `D1UnavailableError`，
 *      后者照旧普通 `Error`。日志里一眼能认出来是哪一类，排查时不用猜。
 *   2. 不可用时开 **60 秒熔断**：这段时间内查询立刻失败，不再真打 D1。
 *      D1 挂着的时候每一屏都白打一次网络往返没有意义，而且会把整页拖慢。
 *
 * ⚠️ 目前**没有调用方**拿 `isD1Unavailable()` 做分支（曾经有，随自动切换一起撤了）。
 *    保留这个判断函数是为了排查脚本 / 将来的单个调用点用得上，别把它当成「回退入口」。
 */

const API_BASE = 'https://api.cloudflare.com/client/v4';

interface D1Response {
  success: boolean;
  errors?: { message?: string }[];
  result?: { results?: unknown[]; success?: boolean }[];
}

/** 「D1 现在用不了」——额度用尽 / 限流 / 服务端 5xx / 连不上。调用方据此切上游。 */
export class D1UnavailableError extends Error {
  /** 是不是额度/限流这一类（true 时 UI 文案可以说「额度用尽」）。 */
  readonly quota: boolean;

  constructor(message: string, quota: boolean) {
    super(message);
    this.name = 'D1UnavailableError';
    this.quota = quota;
  }
}

/** 判断一个异常是不是「D1 暂时用不了」。页面 / 数据层只认这一种，别的照旧抛。 */
export function isD1Unavailable(error: unknown): error is D1UnavailableError {
  return error instanceof D1UnavailableError;
}

/**
 * 熔断窗口（毫秒）。
 *
 * 60 秒是个折中：额度是按天恢复的，本来可以更长；但「D1 抖动 / 临时 5xx」也会走到
 * 这里，窗口太长会让恢复后的第一分钟继续吃上游数据。一小时 60 次探测并不算多。
 */
const UNAVAILABLE_COOLDOWN_MS = 60_000;

let unavailableUntil = 0;

/** 熔断到期时间（毫秒时间戳）。0 / 过去 = 正常。给探针与日志用。 */
export function d1UnavailableUntil(): number {
  return unavailableUntil;
}

function markUnavailable(): void {
  unavailableUntil = Date.now() + UNAVAILABLE_COOLDOWN_MS;
}

/**
 * 报错文本里出现这些词 = 额度 / 限流。
 *
 * ⚠️ 不要把 `read` / `limit` 这种太短的词单独放进来：`limit` 会命中
 *    `SQLITE_ERROR: no such column: limit` 这类真 bug。这里只收明确指向配额的写法。
 */
const QUOTA_PATTERN =
  /quota|exceeded|too many|rate limit|rate-limit|daily limit|requests per day|1102|1017|overloaded/i;

/** 未配置时给出明确报错，避免出现「连不上」这类含糊提示。 */
function requireConfig() {
  const accountId = process.env.CF_ACCOUNT_ID;
  const databaseId = process.env.D1_DATABASE_ID;
  const token = process.env.CF_D1_API_TOKEN;
  if (!accountId || !databaseId || !token) {
    /*
     * 未配置**不是**额度问题，但对调用方来说同样「取不到数据」⇒ 也算不可用
     * （报错里能直接看出是缺变量，比一句含糊的「请求失败」有用）。不进熔断：
     * 配置错误改完 env 立刻生效，没必要等 60 秒。
     */
    throw new D1UnavailableError(
      'D1 未配置：缺少 CF_ACCOUNT_ID / D1_DATABASE_ID / CF_D1_API_TOKEN',
      false
    );
  }
  return { accountId, databaseId, token };
}

/**
 * 执行一条 SQL 并返回结果行。
 * D1 的 /query 接口单次只跑一条语句，参数用 `?` 占位（服务端自动绑定，防注入）。
 */
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (Date.now() < unavailableUntil) {
    throw new D1UnavailableError('D1 熔断中（上一次请求已判定为不可用）', true);
  }

  const { accountId, databaseId, token } = requireConfig();

  let res: Response;
  try {
    res = await fetch(
      `${API_BASE}/accounts/${accountId}/d1/database/${databaseId}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql, params }),
        cache: 'no-store',
      }
    );
  } catch (error) {
    /* 连不上 / DNS / 超时：也算不可用（前台切上游比整页 500 好） */
    markUnavailable();
    throw new D1UnavailableError(
      `D1 网络请求失败：${(error as Error)?.message ?? 'unknown'}`,
      false
    );
  }

  let data: D1Response;
  try {
    data = (await res.json()) as D1Response;
  } catch {
    /*
     * 502 / 522 这类网关错误回的是一张 HTML 页，`res.json()` 当场抛。
     * 以前这一下抛出的是 SyntaxError，调用方根本认不出是 D1 挂了。
     */
    const unavailable = res.status === 429 || res.status >= 500;
    if (unavailable) markUnavailable();
    throw new D1UnavailableError(
      `D1 返回了非 JSON 响应（HTTP ${res.status}）`,
      res.status === 429
    );
  }

  if (!res.ok || !data.success) {
    const message = data.errors?.map((e) => e.message).filter(Boolean).join('; ');
    const quota = res.status === 429 || QUOTA_PATTERN.test(message ?? '');
    if (quota || res.status >= 500) {
      markUnavailable();
      throw new D1UnavailableError(
        `D1 查询失败：${message || `HTTP ${res.status}`}`,
        quota
      );
    }
    throw new Error(`D1 查询失败：${message || `HTTP ${res.status}`}`);
  }

  const first = data.result?.[0];
  if (!first?.success) {
    throw new Error('D1 查询失败：语句未成功执行');
  }
  return (first.results ?? []) as T[];
}
