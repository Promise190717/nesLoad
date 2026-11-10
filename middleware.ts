/*
 * 两件事，一个文件：**语言前缀的搬运** 和 **后台守卫**。
 *
 * 1) 语言路由（2026-10-13 加；2026-10-16 从两种语言扩到四种）
 *
 * 地址规则：英文是默认语言、**不占前缀**；中文 `/zh`、日文 `/ja`、韩文 `/ko`。
 * 前台页面都在 `app/[locale]/` 下（`app/[locale]/games/page.tsx` 同时服务
 * `/zh/games`、`/ja/games`、`/ko/games` 和 `/games`），把「无前缀」接到那个动态段上的
 * 就是这里：
 *
 *   · `/zh/x` `/ja/x` `/ko/x` → 原样放行（`[locale]` 直接命中），只补一个语言请求头。
 *                带前缀的地址**不查 cookie**（2026-10-13 用户定）：它是显式选择，
 *                别人分享的 `/zh/games` 不该被弹走；
 *   · `/en/x`  → 301 回 `/x`。显式英文前缀和默认地址是同一页，
 *                两套地址并存就是重复内容，`hreflang` 也只能指一个；
 *   · 无前缀   → **一律英文**（2026-11-10 改）：**rewrite** 成 `/en/x`，地址栏不变，
 *                `[locale]` 接住。这里**不读 cookie、也不读 Accept-Language** ——
 *                为什么把「按 cookie 307」撤了，见下面「2026-11-10」那段。
 *
 * ⚠️ **加语言时这个文件基本不用动**（下面那个 `for` 循环会自动覆盖新前缀）——
 *    真正要改的是 `lib/i18n.ts` 的 `LOCALES` / `LOCALE_PREFIX` 和四张文案表。
 *    2026-10-16 加日韩时，这里就是把写死的 `/zh` 判断换成了循环。
 *
 * ⚠️ **2026-10-13 用户明确要求「没有主动设置过，访问哪个就是哪个，不要跳转」** ——
 * 所以这里**不再看 Accept-Language**。浏览器是中文、地址栏是 `/games`，就老老实实
 * 渲染英文页，然后由**客户端**弹一个小窗问「要不要切到中文」
 * （`components/LocalePrompt.tsx`）。
 * 把服务端 307 换成客户端询问，是因为 307 会改地址、破坏分享出去的链接。
 *
 * 🔴 **2026-11-10：无前缀的 cookie 307 也撤了。现在「地址即语言」。**
 *
 * 起因：线上「从 `/zh/games/x` 手动回到根域名，首页是英语，点页内链接又变 `/zh`」。
 * 那个链接 hover 时确实是无前缀的（首页那份英语 HTML 里写死的），是**点击后**被
 * 这里 307 走的 —— 于是同一个站里，首页英语、内页中文。
 *
 * 根因不在这个文件，而在一层它管不到的东西上：`wrangler.jsonc` 的
 * `cache.enabled`（第 0 层 Workers Caching）跑在 Worker **外面**，按 URL + `Vary: RSC`
 * 存，**不看 Cookie**；命中时 middleware 一次都不执行。无前缀地址因此有了两个
 * 互相矛盾的答案：没人带 cookie 时 200 英语（被缓存），带 `zh` cookie 时 307。
 * 谁先填的缓存，之后所有人吃那一份 —— 热门路径（`/`、`/games`）吃英语，长尾冷路径
 * 走 middleware 被弹回 `/zh`，表现就是你看到的那种时中时英。
 *
 * 只要无前缀的响应依赖 cookie，这个矛盾就无解，因为缓存键里没有 cookie：
 *   · 无前缀一律 `no-store` → 英语站（主力流量）每次进 Worker，免费版 10ms 必炸；
 *   · `Vary: Cookie` → CF 不拿它当缓存键；就算支持，也是每人一条，等于没缓存；
 *   · 客户端脚本跳转 → 多一次往返，还得再维护一份「哪些路径不跳」的清单。
 * 所以选最干净的那条：**无前缀永远是英语**，`/zh` `/ja` `/ko` 是显式选择，
 * 站内切语言走语言切换器（`I18nProvider.hrefIn` 直接给出带前缀的地址）。
 *
 * **代价是明确接受的**：选了中文的人手动输根域名、或打开别人分享的无前缀链接，
 * 看到的是英语站，不会再被自动拉回中文。这比「同一站一会儿英语一会儿中文」好。
 * `nesload_locale` cookie 还在写（`I18nProvider.rememberLocale`），但只剩一个用途：
 * 记住「用户主动选过语言」，让 `LocalePrompt` 别再问 —— 服务端不再读它。
 *
 * ⚠️ **那条 rewrite 会让 Next 内部再跑一遍这个 middleware**（rewrite 到同源路径的
 * 标准行为），那一遍看到的 pathname 已经是 `/en/x` —— 不拦的话会落进 `/en` 那条分支、
 * 301 回 `/x`、再 rewrite 回 `/en/x`，转成一个死循环。
 * 拦住它的是 Next 自己盖的 `x-middleware-rewrite`（内部 rewrite 必有，客户端伪造它
 * 最多让页面按 cookie 兜底的语言渲染，没有任何实际收益）。判据必须放在**最前面**。
 *
 * **为什么语言还要塞请求头**：根布局（app/layout.tsx）在 `[locale]` 段**外面**，
 * 拿不到 `params.locale`，但它要设 `<html lang>`、要出 canonical / hreflang。
 * 页面自己用 `params.locale`（更显式），根布局用这个头，两边由同一个 middleware 保证一致。
 *
 * 2) 后台守卫（原样保留）
 *
 * 只管 /admin/*：校验 Cookie 里的签名令牌（Edge runtime，用 Web Crypto），
 * 未登录就重定向到 /admin/login。登录页放行。
 *
 * 后台**不做语言前缀**：`/admin` 是一套内部工具，路径固定、不进 sitemap、
 * 页面级 noindex，给它开一份 `/zh/admin` 只有坏处（多一个入口要守）。
 * 所以守卫分支**排在语言分支前面**，直接 return —— 但它照样要把语言写进请求头，
 * 因为根布局要靠它出 `<html lang>`。⚠️ 2026-10-15 起后台整体不走 i18n
 * （文案全是写死的中文，见 AdminShell 顶上那条注释），所以这里**一律盖 `zh`**。
 *
 * 后台接口（/api/admin/*）**故意不挂在这里**：Next 会把命中 middleware 的请求体
 * 整个缓冲并默认截断到 10MB，上传大 ROM 会因此解析失败。接口鉴权改由各自的
 * route handler 调用 lib/server/admin-guard.ts 的 assertAdmin 自查。
 * 同理整个 `/api` 都不进 matcher —— 接口没有「语言页面」这回事。
 */

import { NextResponse, type NextRequest } from 'next/server';
import { catalogRewrite } from '@/lib/catalog-route';
import { SESSION_COOKIE, verifySession } from '@/lib/server/session';
import {
  DEFAULT_LOCALE,
  EN_PREFIX,
  LOCALE_HEADER,
  LOCALE_PREFIX,
  LOCALES,
  type Locale,
} from '@/lib/i18n';

const PUBLIC_PATHS = new Set(['/admin/login', '/api/admin/login']);

/** 复制一份请求头并盖上语言戳 —— 下游的根布局（和第二遍 middleware）都看它。 */
function withLocale(headers: Headers, locale: Locale): Headers {
  const next = new Headers(headers);
  next.set(LOCALE_HEADER, locale);
  return next;
}

/**
 * 后台的语言 —— **固定中文**。
 *
 * 后台不走 i18n（2026-10-15 用户定），文案全是写死的中文；这里盖章的唯一用途是
 * 让根布局出 `<html lang="zh-CN">`。不读 cookie 也不读 Accept-Language ——
 * 以前那套「按管理员的浏览器语言变」的逻辑随双语后台一起废掉了。
 */
function adminLocale(): Locale {
  return 'zh';
}

/**
 * 语言路由。返回一个响应就表示「这条请求到此为止」，返回 null 表示
 * 「没有特殊处理，交给调用方放行」。
 */
function publicRoute(request: NextRequest, locale: Locale, path: string): NextResponse {
  const url = request.nextUrl.clone();
  /*
   * 旧目录地址的兼容改写（`/games?page=2`、`/consoles/nds?lang=zh` 这类）。
   *
   * ⚠️ **2026-10-20 起这些维度已经是路径段**（`/games/page/2`、`/consoles/nds/lang/zh`），
   *    新地址只有 1~2 段以外的形态，`catalogRewrite` 的正则天然不命中 —— 也就是说
   *    这里现在只剩「老外链还能打开」这一个作用，别把它当成新维度的入口。
   *    为什么新维度不能用改写：查询参数被改写成影子路由后，客户端软导航拿回的 flight
   *    对不上当前路由树，点一下就是整页刷新。完整推理见 `lib/catalog-route.ts` 文件头。
   */
  let variant: string | null;
  try {
    variant = catalogRewrite(path, url.searchParams);
  } catch {
    return new NextResponse('Query is too long', { status: 414 });
  }
  if (variant) {
    url.pathname = '/' + locale + variant;
    return NextResponse.rewrite(url, { request: { headers: withLocale(request.headers, locale) } });
  }
  if (locale !== DEFAULT_LOCALE) return NextResponse.next({ request: { headers: withLocale(request.headers, locale) } });
  url.pathname = EN_PREFIX + (path === '/' ? '' : path);
  return NextResponse.rewrite(url, { request: { headers: withLocale(request.headers, locale) } });
}

function routeLocale(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;

  // 已经过一遍手了（无前缀 rewrite 之后的第二次执行）—— 见文件头那段死循环说明
  if (request.headers.has('x-middleware-rewrite')) {
    return null;
  }

  // 显式英文前缀：301 回默认地址。用永久重定向是对的 —— 这不是「这次别用 /en」，
  // 而是「本站不存在 /en 这个地址」，权重该并到无前缀那份上。
  if (pathname === EN_PREFIX || pathname.startsWith(`${EN_PREFIX}/`)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === EN_PREFIX ? '/' : pathname.slice(EN_PREFIX.length);
    return NextResponse.redirect(url, 301);
  }

  /*
   * 其余语言的显式前缀（`/zh` `/ja` `/ko`）：原样放行，`app/[locale]/` 直接接住，
   * 只把语言写进请求头。
   *
   * ⚠️ 遍历 `LOCALES` 而不是逐个 `if` —— 英文（前缀是空串）要跳过，
   *    否则 `startsWith('/')` 会把所有地址都吃掉。
   *    2026-10-16 加日韩时这里就是把写死的 `/zh` 判断换成这个循环，别的没动；
   *    以后再添语言，这里不用再改。
   */
  for (const locale of LOCALES) {
    const prefix = LOCALE_PREFIX[locale];
    if (!prefix) continue;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return publicRoute(request, locale, pathname.slice(prefix.length) || '/');
    }
  }

  /*
   * 无前缀 —— **永远是英文**，地址栏不变（2026-11-10 改：不再读 cookie 307）。
   *
   * 曾经这里会在 cookie = zh / ja / ko 时 307 到 `/zh/x`。撤掉的理由见文件头
   * 「2026-11-10」那段：无前缀响应一旦依赖 cookie，就和第 0 层 Workers Caching
   * （按 URL 存、不看 Cookie）打架，同一站里首页英语、内页中文。
   *
   * 这里不看 Accept-Language 是 2026-10-13 就定的：浏览器是中文也照样渲染英文，
   * 想切语言由客户端 `LocalePrompt` 问（见文件头）。
   */
  return publicRoute(request, DEFAULT_LOCALE, pathname);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ---- 后台守卫：排在最前，整个绕开语言前缀 ----
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    // 后台固定中文（不走 i18n），这个头只给根布局出 <html lang> 用
    const headers = withLocale(request.headers, adminLocale());

    if (PUBLIC_PATHS.has(pathname)) {
      return NextResponse.next({ request: { headers } });
    }

    const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
    if (session) {
      return NextResponse.next({ request: { headers } });
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/admin/login';
    loginUrl.search = '';
    return NextResponse.redirect(loginUrl);
  }

  // ---- 语言路由 ----
  return routeLocale(request) ?? NextResponse.next();
}

/*
 * matcher 排除四类：
 *   · `/api/*`  —— 接口（见文件头，10MB 请求体那条）
 *   · `/_next/*` —— 框架自己的产物
 *   · `/opengraph-image` `/twitter-image` —— 分享图，**没有扩展名**（不像
 *     `/icon.svg` 那样能被下面那条正则顺带排掉），放进来会被当成页面接进
 *     `[locale]` 段（rewrite 成 `/en/opengraph-image`）而 404，分享卡片就瞎了
 *   · 任何**带点**的路径 —— 静态文件（`/favicon.ico`、`/sw.js`、`/cores/*.wasm`、
 *     `/llms.txt`、`/sitemap.xml`…）
 *
 * `/admin/*` 刻意**留在**里面：上面那个守卫要靠它。
 */
export const config = {
  matcher: ['/((?!api/|_next/|opengraph-image|twitter-image|.*\\..*).*)'],
};
