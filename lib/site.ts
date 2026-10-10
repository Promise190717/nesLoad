import { headers } from 'next/headers';

/*
 * 站点自身的「身份」信息 —— 只服务 SEO（标题、canonical、OG、sitemap、robots）。
 *
 * 为什么要单独一个文件：站点源（origin）被 **四处** 需要 ——
 *   app/layout.tsx（metadataBase / JSON-LD）、app/robots.ts、app/sitemap.ts、
 *   app/opengraph-image.tsx。
 * 每处各写一遍就会漂：robots 里的 sitemap 地址和 canonical 指向两个域名，
 * 是搜索引擎最容易判成「重复站点」的坑。所以取源这件事只留一个出口。
 *
 * 站点**名**（品牌）不在这里，在 lib/i18n.ts 的 SITE_NAME —— 它要按语言取值，
 * 和文案表住在一起才顺手；这里则完全是服务端的东西（依赖 next/headers）。
 */

/**
 * 兜底源。只有在**既没配环境变量、也读不到请求头**时才会用到
 * （即本地 `next dev` 且 headers() 不可用的边角情况）。
 */
const FALLBACK_ORIGIN = 'http://localhost:3000';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** 内网 / 本机地址 —— 只用来决定「没有 x-forwarded-proto 时默认 http 还是 https」。 */
function isLocalHost(host: string): boolean {
  return (
    host.startsWith('localhost') ||
    host.startsWith('127.') ||
    host.startsWith('[::1]') ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

/**
 * 从环境变量里取站点源，**越明确越优先**：
 *   1. `SITE_URL` —— 本项目自己的变量，配了就是权威（见 .env.example）。
 *   2. `NEXT_PUBLIC_SITE_URL` —— 兼容前端也能读到这个值的场景。
 *   3. `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL` —— 部署在 Vercel 时自动注入的
 *      生产域名 / 部署域名，省得每个项目再配一遍。
 * 都没有就返回 null，交给请求头去猜。
 *
 * 注意这里**故意不加** `NEXT_PUBLIC_`：站点名不是凭据，但它只被服务端用（metadata /
 * sitemap / robots 全在服务端跑），没有理由打进客户端产物 —— 和 .env.example 里
 * 那条「服务端变量一律不加 NEXT_PUBLIC_」的规矩保持一致。
 */
function originFromEnv(): string | null {
  const explicit = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return stripTrailingSlash(explicit);

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${stripTrailingSlash(vercel)}`;

  return null;
}

/**
 * 解析站点源，返回 `https://example.com` 这种形式（无尾斜杠）。
 *
 * 三级兜底：环境变量 → 请求头 → localhost。
 *
 * **为什么肯从请求头猜**：本项目没有固定的部署域名约束，也不做 `output: 'export'`
 * （layout 里读 cookie / Accept-Language 就已经是动态渲染了）。从请求头取，
 * 用户把站部到任何域名上都能立刻拿到正确的 canonical 与 sitemap 地址，零配置。
 *
 * **风险与顺序**：Host 头是客户端可控的，所以显式配置（SITE_URL）永远排在前面 ——
 * 生产环境建议配上，别让它落到请求头上。真被伪造 Host 也只影响那一份 HTML 的
 * canonical，不会串改数据库或凭据，属于可接受的残余风险。
 *
 * ⚠️ **中途那句 `await headers()` 故意不包 try/catch**，别好心给它加上。
 *
 * 它不只是「读一个请求头」—— 在 Next 里调用 headers() 会让调用它的路由**退出静态渲染**。
 * 机制是：构建期预渲染时 headers() 会抛一个内部错误（DynamicServerError），
 * Next 接住它，据此把该路由标记成动态（构建输出里的 ƒ）而不是静态页（○）。
 *
 * 一旦被 catch 掉，那个内部错误就到不了 Next 手里：
 * robots.txt / sitemap.xml 会被**当成静态页预渲染并缓存**，而预渲染时没有请求头，
 * 于是它们被永久烤上兜底值 —— 表现就是线上 sitemap 里写着 http://localhost:3000。
 * 这种错在本地永远复现不了（dev 每次都现算），是最难查的一类。
 */
export async function resolveSiteOrigin(): Promise<string> {
  const fromEnv = originFromEnv();
  if (fromEnv) return fromEnv;

  const headerList = await headers();

  const host = headerList.get('x-forwarded-host') ?? headerList.get('host');
  // 兜底值只在**真的取不到 Host** 时才用（理论上只有极端畸形的请求）
  if (!host) return FALLBACK_ORIGIN;

  // x-forwarded-proto 经过多层代理时可能是 "https, http" 这种列表，取第一段
  const protoHeader = (headerList.get('x-forwarded-proto') ?? '').split(',')[0].trim();
  const proto = protoHeader || (isLocalHost(host) ? 'http' : 'https');

  return `${proto}://${host}`;
}
