import type { MetadataRoute } from 'next';
import { resolveSiteOrigin } from '@/lib/site';

/*
 * /sitemap.xml。
 *
 * 本站可收录的地址只有**三条**：房间那一页（`/`），以及 `/privacy` 与 `/terms`
 * 两页法务文档。游戏库 / 存档 / 联机 / 键位全是屏幕上的浮层，没有各自的 URL，
 * 所以不在这里 —— 别为了「看起来完整」往里塞不存在的路径，那是会被判成软 404 的。
 *
 * 法务两页是 2026-10-12 加进来的：它们是**真正的路由**（理由见 app/privacy/page.tsx），
 * 而且**必须**能被收录 —— 隐私政策与条款要能直接被搜到、被第三方按固定地址检查，
 * 只挂在房间那颗钮的弹层里等于不存在。优先级给得比首页低：它们不是内容主体。
 *
 * /admin 那几页**必须排除**（它们不是公开内容）：sitemap 里的一次都不列，
 * robots.txt 也挡了一道，页面自己还有 noindex。三处都做，是因为它们防的是不同的东西 ——
 * sitemap 是「主动推荐」，robots 是「请求别来」，noindex 是「来了也别收」。
 *
 * 刻意**不写 `lastModified`**：这个站没有按页面的真实修改时间（正文全在代码里，
 * 没有 CMS 时间戳）。写成 `new Date()` 等于每次抓取都声称「刚刚更新过」，
 * 反而会让搜索引擎学会忽略这个字段，比不写更糟。
 *
 * `changeFrequency` / `priority` 是 Google 明确说**不看**的字段（Bing 会瞄一眼），
 * 留着只是给别的引擎一点排序提示。
 */
/*
 * 必须动态渲染 —— 理由和 app/robots.ts 里那段一样：<loc> 要是绝对地址，
 * 域名只能等请求进来才知道，构建期预渲染会把它烤成兜底值（localhost）。
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await resolveSiteOrigin();

  return [
    {
      url: origin,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${origin}/privacy`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${origin}/terms`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
