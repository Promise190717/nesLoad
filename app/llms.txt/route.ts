import { buildLlmsTxt } from '@/lib/ai-policy';
import { resolveSiteOrigin } from '@/lib/site';

/*
 * /llms.txt —— 给 AI 读的站点政策（自然语言版）。
 *
 * 正文不在这里，在 lib/ai-policy.ts：同一份政策还要以 ai.txt 的格式再吐一份
 * （/ai.txt），两处各写一遍必然漂，所以正文只有一个出处。
 *
 * 为什么走 route handler 而不是 public/llms.txt：
 *   1. 正文里要写本站的**绝对地址**（页面清单那几行），绝对地址依赖请求头，
 *      静态文件只能手写死域名 —— 换域名就得记得改，忘了就是「政策文件指向另一个站」。
 *      取源规则和 canonical / sitemap / robots 共用 lib/site.ts，只留一个出口。
 *   2. 内容要跟着 lib/ai-policy.ts 的常量走，静态文件做不到。
 *
 * 为什么不挂 middleware 也不加任何门槛：这份文件**就是给爬虫读的**，
 * 挡住它等于政策没发布。后台的守卫（middleware.ts）matcher 只匹配 /admin/:path*，
 * 不会碰到这里。
 */
/*
 * ⚠️ 和 app/robots.ts 同一个理由，别删：默认情况下 Next 会在构建期把它预渲染成
 * 静态文本，那时没有请求头，域名只能落到兜底值，线上就会吐出一份写着
 * http://localhost:3000 的 llms.txt。显式声明动态渲染，等于把「每次请求现算」
 * 写死在路由配置里，不再依赖 headers() 抛内部错误那套隐式机制。
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const origin = await resolveSiteOrigin();

  return new Response(buildLlmsTxt(origin), {
    headers: {
      /*
       * 必须是 text/plain：llms.txt 的约定就是纯文本 Markdown，
       * 吐成 text/markdown 会让一部分按 MIME 判型的抓取器直接跳过。
       * charset 显式写 utf-8 —— 正文里有汉字，缺了它有些客户端会按 latin-1 解。
       */
      'Content-Type': 'text/plain; charset=utf-8',
      /* 正文一天变不了几次，给一小时缓存，省掉爬虫的重复请求 */
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
