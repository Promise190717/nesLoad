/**
 * 「我是谁」的**客户端唯一出口**（2026-10-19 加）。
 *
 * 起点是一个真问题：未登录的人每切一次页面，顶栏（`components/TopBar.tsx`）就重新挂载
 * 一次，于是又往 `/api/user/login` 打一次 GET；详情页更狠 —— 顶栏问一遍 `/api/user/login`、
 * 收藏钮（`components/FavoriteButton.tsx`）又问一遍 `/api/user/profile`，同一件事问两次。
 * 那两条接口都不大，但每次导航都要走一遍 Worker，属于纯噪音。
 *
 * **这里的做法**：模块级缓存一次结果（含「未登录」这个结果），并发的调用合并成一个
 * 请求。切页面时模块不会重新求值，所以只要没过期就一次都不发。
 *
 * ⚠️ **只在浏览器里用**（`/api/user/login` 是相对地址，相对地址没有服务端含义）。
 *    调用点必须都在 `useEffect` / 事件回调里 —— 不能在渲染期调，否则服务端渲染那一遍
 *    会去 fetch，而且拿到的东西也没法进 HTML（登录态在 HttpOnly cookie 里，页面本来
 *    就是按 cookie 渲染的，另说）。
 *
 * ⚠️ **缓存的是「答案」不是「请求」**：登录 / 退出这类会改答案的动作必须调
 *    `rememberCurrentUser()` / `forgetCurrentUser()` 把它盖掉。现在有三个调用点
 *    （`AuthForm` 登录成功、`UserPanel` 退出、`AccountCenter` 退出），
 *    以后再加登录口子记得也接上。
 *
 * ⚠️ **请求失败不入缓存**：网络抖一下应该是「下一次导航再问一次」，而不是让这个人
 *    在接下来 5 分钟里都被当成未登录。
 */

/** `/api/user/login` 与 `/api/user/register` 回的那个用户。 */
export interface AuthUser {
  id: string;
  username: string;
}

/**
 * 缓存多久。
 *
 * 5 分钟是个折中：它只影响「在别的标签页登录 / 退出之后，这一页多久才知道」，
 * 而本站的登录口子在页面里也都能点到（房间浮层、顶栏、登录页），
 * 真正会撞上的场景很少。再短就回到每次都发请求，再长就更容易显示过期的用户名。
 */
const CACHE_TTL_MS = 5 * 60_000;

/** `null` 也是有效答案（未登录）；`undefined` 表示还没问过。 */
let cached: { user: AuthUser | null; at: number } | null = null;

/**
 * 正在路上的那一次。**并发的调用共用它** —— 详情页的顶栏和收藏钮是同时挂载的，
 * 没这一层就是两个请求同时发出去（缓存还没写进去）。
 */
let inflight: Promise<AuthUser | null> | null = null;

/**
 * 问一次「我是谁」。**未登录返回 `null`**（请求失败也返回 `null`，对调用方两者没有
 * 区别：都当未登录处理，真要登录点一下入口还能再来）。
 *
 * 命中缓存 / 有并发请求在飞时都不发新请求。
 */
export function fetchCurrentUser(): Promise<AuthUser | null> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return Promise.resolve(cached.user);
  if (inflight) return inflight;

  const request = fetch('/api/user/login', { cache: 'no-store' })
    .then(async (res) => {
      /* 非 2xx（Worker 抖了 / 网关 5xx）当作「这次不知道」，别把 null 写进缓存 */
      if (!res.ok) return null;
      const data = (await res.json()) as { user?: AuthUser | null };
      const user = data.user ?? null;
      cached = { user, at: Date.now() };
      return user;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });

  inflight = request;
  return request;
}

/** 登录成功后把答案直接盖掉 —— 免得接下来 5 分钟里顶栏还把这个人当未登录。 */
export function rememberCurrentUser(user: AuthUser | null): void {
  cached = { user, at: Date.now() };
}

/** 退出登录后清掉 —— 否则下一次切页面顶栏还会画着用户名。 */
export function forgetCurrentUser(): void {
  cached = { user: null, at: Date.now() };
}
