/*
 * Cloudflare D1 的 REST API 客户端。
 *
 * 为什么要走 REST 而不是绑定（env.DB）：本项目是普通 Next.js 应用，不一定要部署到
 * Cloudflare 的 Workers/Pages，用 REST API 在本地和任意托管环境都能跑，代价只是每次查询
 * 多一次 HTTPS 往返——对后台录入这种低频写、前台列表这种小结果集完全够用。
 *
 * 凭据（CF_ACCOUNT_ID / CF_D1_API_TOKEN / D1_DATABASE_ID）只从服务端环境变量读，
 * 本文件只能在服务端（route handler / 脚本）导入，绝不能进客户端 bundle。
 */

const API_BASE = 'https://api.cloudflare.com/client/v4';

interface D1Response {
  success: boolean;
  errors?: { message?: string }[];
  result?: { results?: unknown[]; success?: boolean }[];
}

/** 未配置时给出明确报错，避免出现「连不上」这类含糊提示。 */
function requireConfig() {
  const accountId = process.env.CF_ACCOUNT_ID;
  const databaseId = process.env.D1_DATABASE_ID;
  const token = process.env.CF_D1_API_TOKEN;
  if (!accountId || !databaseId || !token) {
    throw new Error('D1 未配置：缺少 CF_ACCOUNT_ID / D1_DATABASE_ID / CF_D1_API_TOKEN');
  }
  return { accountId, databaseId, token };
}

/**
 * 执行一条 SQL 并返回结果行。
 * D1 的 /query 接口单次只跑一条语句，参数用 `?` 占位（服务端自动绑定，防注入）。
 */
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { accountId, databaseId, token } = requireConfig();
  const res = await fetch(
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

  const data = (await res.json()) as D1Response;
  if (!res.ok || !data.success) {
    const message = data.errors?.map((e) => e.message).filter(Boolean).join('; ');
    throw new Error(`D1 查询失败：${message || `HTTP ${res.status}`}`);
  }

  const first = data.result?.[0];
  if (!first?.success) {
    throw new Error('D1 查询失败：语句未成功执行');
  }
  return (first.results ?? []) as T[];
}