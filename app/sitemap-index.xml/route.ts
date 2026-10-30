import { LOCALES } from '@/lib/i18n';
import { resolveSiteOrigin } from '@/lib/site';

/*
 * `/sitemap.xml` —— **sitemap 索引**，指向 18 份按语言拆开的分片。
 *
 * 为什么需要它：
 *   `app/sitemap.ts` 用了 `generateSitemaps()`（见那边的长注释），Next 在这种形态下
 *   只产 `/sitemap/<locale>.xml`，**不产 `/sitemap.xml` 索引** —— 而 `/sitemap.xml`
 *   是全世界爬虫、站长工具、AI 抓取器默认会先试的地址（`/llms.txt` 里也写着它）。
 *   没有就是 404，等于把「站点地图在哪」这个问题的默认答案弄丢了。
 *
 * 为什么不直接删掉 `/llms.txt` 里那行地址：那只是把问题藏起来。
 * 索引本身没有任何查询（18 条字符串，来自 `LOCALES` 常量），渲染成本可忽略，
 * 而它给的是一个**稳定的单一入口** —— Google Search Console 提交一次就够，
 * 不用每次加语言都去改一处配置。
 *
 * ⚠️ **路径为什么叫 `sitemap-index.xml`**：`app/sitemap.xml/route.ts` 会和
 *    Next 内置的 sitemap 元数据路由抢同一个名字，行为取决于版本、不保证。
 *    所以这里换一个自己的路径，再由 `next.config.js` 的 `rewrites()` 把
 *    `/sitemap.xml` 重写过来（对外看到的仍然是 `/sitemap.xml`）。
 *    改路径时两处必须一起改。
 *
 * ⚠️ 这里**不读数据库**：分片是「哪种语言有哪些地址」由 `app/sitemap.ts` 负责，
 *    索引只负责「分片在哪」。所以它不会因为库连不上而挂掉 —— 这也是它敢被
 *    `robots.txt` / `llms.txt` 当作唯一入口引用的原因。
 *
 * `lastmod` 刻意不写：分片的真实更新时间没有一个可信来源（游戏入库时间 ≠
 * sitemap 更新时间），写 `new Date()` 等于每次抓取都声称刚改过，反而有害。
 * 理由和 `app/sitemap.ts` 里「静态条目不写 lastModified」是同一套。
 */
export const revalidate = 86400;

/** XML 文本转义。origin 理论上不含这些字符，但拼进 XML 就该按规矩转。 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const origin = await resolveSiteOrigin();

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${LOCALES.map(
  (locale) => `  <sitemap><loc>${escapeXml(`${origin}/sitemap/${locale}.xml`)}</loc></sitemap>`
).join('\n')}
</sitemapindex>
`;

  return new Response(body, {
    headers: {
      /*
       * `application/xml` 是 sitemap 的标准 MIME（`text/xml` 也认，但前者更准确）。
       * charset 显式写：分片里全是 URL，理论上不会有非 ASCII，但声明一次不吃亏。
       */
      'Content-Type': 'application/xml; charset=utf-8',
      /*
       * 和 robots.txt / llms.txt 同一条口径：内容一天变不了几次。
       * 浏览器 1 小时、CDN 1 天 —— 边缘那层（worker.ts）还会再按自己的 TTL 兜一遍。
       */
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
