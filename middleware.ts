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
 *   · 无前缀   → **只看 cookie**（用户有没有主动设置过）：
 *                  · cookie = zh / ja / ko → 307 到 `/xx/x`；
 *                  · 没 cookie / cookie = en → **rewrite** 成 `/en/x`
 *                    （地址栏不变，`[locale]` 接住）。
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
  LOCALE_COOKIE,
  LOCALE_HEADER,
  LOCALE_PREFIX,
  LOCALES,
  isLocale,
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
 * 用户**主动设置过**的语言（cookie）。没设置过就是 `null`。
 *
 * ⚠️ 只读 cookie，**不碰 Accept-Language** —— 见文件头：没设置过就不该跳转。
 */
function savedLocale(request: NextRequest): Locale | null {
  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  return isLocale(saved) ? saved : null;
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
  // Keep old shared room links working before serving the static landing page.
  if (path === '/') {
    const old = new URLSearchParams();
    for (const key of ['id', 'room']) {
      const values = url.searchParams.getAll(key);
      if (values.length === 1 && values[0].trim()) old.set(key, values[0].trim());
    }
    if (old.size) {
      url.pathname = LOCALE_PREFIX[locale] + '/room';
      url.search = old.toString();
      return NextResponse.redirect(url, 307);
    }
  }
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
   * 无前缀 —— 只有**用户主动设置过非默认语言**才把人送去带前缀那份。
   *
   * 没设置过（或设置的就是英文）一律留在原地，rewrite 进 `[locale]` 段渲染英文。
   * 这里**不看 Accept-Language**：浏览器是中文也照样渲染英文，改由客户端
   * `LocalePrompt` 弹窗询问（见文件头）。
   *
   * 用 307 而不是 301：这个跳转**依赖 cookie**，同一地址对不同人指向不同结果，
   * 301 会被浏览器和 CDN 永久缓存下来，之后用户手动切成英文也回不去。
   */
  const saved = savedLocale(request);
  if (saved !== null && saved !== DEFAULT_LOCALE) {
    const url = request.nextUrl.clone();
    // 根路径不加尾巴：`/zh` 而不是 `/zh/`（后者要多吃一个 308）
    url.pathname = LOCALE_PREFIX[saved] + (pathname === '/' ? '' : pathname);
    return NextResponse.redirect(url, 307);
  }

  // 英文：rewrite 进 `[locale]` 段（地址栏不变），顺手把语言写进请求头
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
 *     `[locale]` 段（rewrite 成 `/en/opengraph-image`，cookie 为中文时则 307 到
 *     `/zh/opengraph-image`）而 404，分享卡片就瞎了
 *   · 任何**带点**的路径 —— 静态文件（`/favicon.ico`、`/sw.js`、`/cores/*.wasm`、
 *     `/llms.txt`、`/sitemap.xml`…）
 *
 * `/admin/*` 刻意**留在**里面：上面那个守卫要靠它。
 */
export const config = {
  matcher: ['/((?!api/|_next/|opengraph-image|twitter-image|.*\\..*).*)'],
};
