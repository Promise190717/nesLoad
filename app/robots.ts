import type { MetadataRoute } from 'next';
import { resolveSiteOrigin } from '@/lib/site';

/*
 * /robots.txt。
 *
 * 用 Next 的文件约定（app/robots.ts）而不是 public/robots.txt：sitemap 那一行要写
 * **绝对地址**，而绝对地址依赖站点源 —— 放在 public 里只能手写死，换个域名就得记得改，
 * 忘了就是「robots 指的 sitemap 在另一个域名上」这种最难查的错。走这里则和
 * canonical / sitemap 共用同一个取源函数（lib/site.ts）。
 *
 * 挡两处：
 *   /admin  —— 后台（登录页 + 游戏录入）。robots.txt 只能挡住守规矩的爬虫，
 *              所以后台自己还挂了一道页面级 noindex（见 app/admin/layout.tsx），
 *              两道一起才算稳。
 *   /api    —— 接口没有人类可读的内容，让爬虫扫一遍纯属浪费配额。
 *
 * 刻意**不写** `crawlDelay`：那是给抓得太狠的小站用的，本站是几个静态页 + 一个 canvas，
 * 加了只会拖慢正常收录。也**不写** `host`：那是 Yandex 的私有指令，Google 不认。
 */
/*
 * ⚠️ 这两行不是可有可无的保险，是**必需**的。
 *
 * robots.txt 的地址本身是静态的，唯一「动态」的地方只有 Sitemap 那一行里的域名 ——
 * 而域名要等请求进来才知道（见 lib/site.ts）。默认情况下 Next 会在构建期把这个文件
 * 预渲染成一张静态文本，那时没有请求头，域名只能落到兜底值，
 * 于是线上会吐出一份写着 `http://localhost:3000/sitemap.xml` 的 robots.txt。
 *
 * 显式声明动态渲染，等于把「每次请求现算」写死在路由配置里，
 * 不再依赖 headers() 抛内部错误那套隐式机制（两条路都通，但这条更明确）。
 * 代价是每个请求渲染一次 —— 一个字符串模板，可以忽略不计。
 *
 * 配了 SITE_URL 之后其实可以改回静态（域名成了编译期常量）；但没必要：
 * 留着它，换域名才不用重新构建。
 */
export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await resolveSiteOrigin();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api'],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
