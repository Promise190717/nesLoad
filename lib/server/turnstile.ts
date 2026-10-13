/*
 * Cloudflare Turnstile 人机验证 —— **服务端校验**（2026-10-13 加）。
 *
 * 用在哪：前台**登录 / 注册**这两条接口（`POST /api/user/login`、`POST /api/user/register`）。
 * 目的只有一个 —— 挡住脚本批量注册和撞库，不是给正常用户添一道门槛。
 *
 * ⚠️ **和后台账号（`/api/admin/login`）无关**：那套**刻意没加**验证码，别顺手抄过去 ——
 *    后台只有一个入口、一个管理员，加验证码只会先把自己挡在门外。
 *
 * **两个密钥**（都要在 `.env.local` 里填，见 .env.example）：
 *   · `TURNSTILE_SECRET_KEY`           服务端密钥，**不加 NEXT_PUBLIC_**，本文件读它。
 *   · `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 站点密钥，前端挂件读它（components/TurnstileWidget.tsx）。
 * 两边**各判各的**：前端判站点密钥决定画不画挂件，服务端判密钥决定验不验 token。
 * 所以「只配一个」不是崩，是**单边生效**（前端画了挂件但服务端不验，或者反过来）——
 * 上线前务必两个都确认。
 *
 * **没配密钥时的行为（重要）**：直接放行（返回 `'skipped'`）。理由是本地开发本来就没有
 *   密钥，硬拦会把「不配密钥就跑不起来」变成默认体验。
 *   ⚠️ 代价是**忘配 = 验证码静默失效**：服务端一声不响地放行。所以别只看「页面能登」，
 *      要看 `.env.local` 里 `TURNSTILE_SECRET_KEY` 是不是真有值。
 *
 * 本文件用全局 fetch，只能在 Node runtime（或 edge）的 route handler 里 import。
 * 前台那两条接口都声明了 `runtime = 'nodejs'`，可以直接用。
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * 校验结果。
 *
 * `skipped` = **没配服务端密钥**，视为通过（见文件头）。调用方不必区分它和 `ok`
 * —— 两个都是「放行」，这里给两个值只是让日志和调试能看出「到底是验过了还是压根没开」。
 */
export type TurnstileResult = 'ok' | 'skipped' | 'missing' | 'failed';

/**
 * 校验一个 Turnstile token。
 *
 * `token` 是前端挂件回调里拿到的那个串，**一次性** —— 用掉、过期（默认 300 秒）、
 * 或者刷新页面都会作废。所以前端每次提交完（无论成败）都要 `reset()` 换一张新的，
 * 见 components/TurnstileWidget.tsx 的 `resetSignal`。
 *
 * `remoteIp` 可选：传访问者 IP 能让校验和来源绑得更紧（Cloudflare 说它是可选参数，
 * 不传也能过）。路由那边用 `clientIp(request)` 取。
 *
 * **网络错误（siteverify 打不通）算失败**，不放行 —— 加验证码本来就是为了挡人，
 * 在「验证服务挂了」这个窗口里放行等于给攻击者留了一个开关。代价是 Cloudflare 抖一下
 * 的期间新登录 / 注册会失败（**已登录的老会话不受影响**，cookie 还在），界面会提示重试。
 * 想反过来（宁可放过也别挡人）把下面 catch 里的 `'failed'` 改成 `'skipped'` 就行。
 *
 * 返回值刻意用字符串联合而不是布尔：调用方要按 `missing` / `failed` 回**不同的错误码**
 * （一个是「没带 token」，一个是「token 不对」，给用户看的话术不一样）。
 */
export async function verifyTurnstile(
  token: unknown,
  remoteIp?: string | null
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return 'skipped';

  // 空串 / 非字符串都算「没带」—— 前端在没解出验证码时就是这个状态
  if (typeof token !== 'string' || !token) return 'missing';

  try {
    // ⚠️ 用 `application/x-www-form-urlencoded`，不是 JSON —— siteverify 认表单编码
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);

    const res = await fetch(VERIFY_URL, { method: 'POST', body });
    if (!res.ok) {
      console.error('[turnstile] siteverify 返回非 2xx：', res.status);
      return 'failed';
    }

    const data = (await res.json()) as { success?: boolean };
    return data.success ? 'ok' : 'failed';
  } catch (error) {
    console.error('[turnstile] siteverify 请求失败', error);
    return 'failed';
  }
}

/**
 * 从请求头里取访问者 IP，喂给 siteverify 的 `remoteip`。
 *
 * `CF-Connecting-IP` 是 Cloudflare 在前面时它自己塞的，**最可信**（客户端改不了，
 * 边缘会覆盖掉客户端传的值）—— 本站部署在 Cloudflare 上，所以优先用它。
 * 退回 `x-forwarded-for` 的第一段（`a, b, c` 里最左边那个是原始客户端）。
 * 都取不到返回 null，`verifyTurnstile` 会跳过 remoteip 这一项。
 */
export function clientIp(request: Request): string | null {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();

  return null;
}
