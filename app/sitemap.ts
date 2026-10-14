import type { MetadataRoute } from 'next';
import { LOCALES, localePath } from '@/lib/i18n';
import { listConsoleStubs } from '@/lib/server/consoles';
import { listDeveloperStubs } from '@/lib/server/developers';
import { listGameStubs } from '@/lib/server/games';
import { resolveSiteOrigin } from '@/lib/site';

/*
 * /sitemap.xml。
 *
 * 本站可收录的地址分六类：
 *   · 首页落地页（`/`，2026-10-13 起）—— Hero + 按机种 / 开发商浏览 + FAQ；
 *   · 房间那一页（`/room`，2026-10-13 从 `/` 挪过来的）—— 唯一的「应用」页；
 *   · `/privacy` / `/terms` 两页法务文档；
 *   · `/games` 游戏列表（含 `?console=<机种>` 那四份机种筛选，2026-10-13 加）；
 *   · 每款游戏的 `/games/<id>` 与 `/games/<id>/download`（**从库里现取**）；
 *   · `/developers` 开发商列表 + 每家的 `/developers/<id>`（2026-10-12 加，同样现取）；
 *   · `/consoles` 机种列表 + 每个机种的 `/consoles/<type>`（2026-10-14 加，同样现取）。
 * 游戏库 / 存档 / 联机 / 键位那些面板全是屏幕上的浮层，没有各自的 URL，
 * 所以不在这里 —— 别为了「看起来完整」往里塞不存在的路径，那是会被判成软 404 的。
 *
 * 法务两页是 2026-10-12 加进来的：它们是**真正的路由**（理由见 app/[locale]/privacy/page.tsx），
 * 而且**必须**能被收录 —— 隐私政策与条款要能直接被搜到、被第三方按固定地址检查，
 * 只挂在房间那颗钮的弹层里等于不存在。优先级给得比首页低：它们不是内容主体。
 *
 * 2026-10-13 语言分路径之后，**每条地址都出两份**（英文无前缀 / 中文 `/zh`），
 * 由下面的 `entries()` 统一生成 —— 它顺带把两条 `hreflang` 互相指好。
 * 别手写其中一份：漏了 alternates 的那份在 Google 眼里就是「重复内容」，
 * 这正是分语言路径最容易被忽略的代价。
 *
 * ⚠️ **游戏 / 开发商那几条是「动态部分」**：逐个从 D1 现读
 * （`listGameStubs` / `listDeveloperStubs`）。这正是用户要的「函数形式，这样增减都会更新」——
 * 后台加一款游戏、建一家开发商，下一次抓 sitemap 就多几条 URL，
 * 不需要改代码、也不需要重新部署。一次额外的 D1 查询换这个，很划算。
 *
 * /admin 那几页**必须排除**（它们不是公开内容）：sitemap 里的一次都不列，
 * robots.txt 也挡了一道，页面自己还有 noindex。三处都做，是因为它们防的是不同的东西 ——
 * sitemap 是「主动推荐」，robots 是「请求别来」，noindex 是「来了也别收」。
 * 同理 `/account`（noindex 的私有视图）也不列。
 *
 * 静态那几条刻意**不写 `lastModified`**：本站没有按页面的真实修改时间（正文全在代码里，
 * 没有 CMS 时间戳）。写成 `new Date()` 等于每次抓取都声称「刚刚更新过」，
 * 反而会让搜索引擎学会忽略这个字段，比不写更糟。
 * **游戏 / 开发商那几条是例外**：`created_at` 就是真实的入库时间，写上是有信息量的。
 * （注意它**不代表内容被改过** —— 后台改元数据不会动 created_at。宁可少报一次更新，
 * 也不要报一个假的「刚刚改过」。）
 *
 * `changeFrequency` / `priority` 是 Google 明确说**不看**的字段（Bing 会瞄一眼），
 * 留着只是给别的引擎一点排序提示。
 */
/*
 * 必须动态渲染 —— 理由和 app/robots.ts 里那段一样：<loc> 要是绝对地址，
 * 域名只能等请求进来才知道，构建期预渲染会把它烤成兜底值（localhost）。
 */
export const dynamic = 'force-dynamic';

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;

/**
 * 一条路径 → sitemap 里的**两条**（英文、中文），两条互指同一组 hreflang。
 *
 *   · `en` / `x-default` → 无前缀那份（英文是默认语言，没表态的访客看它）；
 *   · `zh-CN`            → `/zh` 那份。
 *
 * `x-default` 和 `en` 指向同一个地址是**对的**，不是笔误：`x-default` 说的是
 * 「不知道用户要哪种语言时给哪个」，而本站的答案就是英文那份。
 */
function entries(
  origin: string,
  path: string,
  extra: { lastModified?: Date; changeFrequency?: ChangeFrequency; priority?: number } = {}
): MetadataRoute.Sitemap {
  const english = `${origin}${localePath('en', path)}`;
  const languages = {
    en: english,
    'zh-CN': `${origin}${localePath('zh', path)}`,
    'x-default': english,
  };

  return LOCALES.map((locale) => ({
    url: `${origin}${localePath(locale, path)}`,
    ...extra,
    alternates: { languages },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await resolveSiteOrigin();

  /*
   * 游戏读不出来（D1 没配 / 临时打不通）时**不能让整个 sitemap 挂掉** ——
   * 那样爬虫连首页和法务页的地址都拿不到，代价比少列一批游戏大得多。
   * 所以这里吞掉异常、退回一份只剩静态地址的 sitemap，并在服务端日志里留一行。
   */
  let stubs: { id: string; createdAt: number }[] = [];
  try {
    stubs = await listGameStubs();
  } catch (error) {
    console.error('[sitemap] 读取游戏列表失败，本次只输出静态地址', error);
  }

  // 开发商同理：读不到就只少这几条，别让整个 sitemap 挂掉
  let developers: { id: string; createdAt: number }[] = [];
  try {
    developers = await listDeveloperStubs();
  } catch (error) {
    console.error('[sitemap] 读取开发商列表失败，本次略过开发商地址', error);
  }

  // 机种同理（2026-10-14 加）：迁移没跑过（表还没建）也只少这几条
  let consoles: { type: string; createdAt: number }[] = [];
  try {
    consoles = await listConsoleStubs();
  } catch (error) {
    console.error('[sitemap] 读取机种列表失败，本次略过机种地址', error);
  }

  return [
    ...entries(origin, '/', { changeFrequency: 'weekly', priority: 1 }),
    /*
     * 房间页（`/room`，2026-10-13 从 `/` 挪过来的）给 0.8 —— 比首页（1.0）和游戏列表
     * （0.9）低一档：它是**真的开玩**那个入口，但对搜索引擎来说几乎没有可索引的正文
     * （满屏 CSS 场景 + canvas），价值在于「用户点进来能用」，不在于「被搜到」。
     */
    ...entries(origin, '/room', { changeFrequency: 'weekly', priority: 0.8 }),
    ...entries(origin, '/games', { changeFrequency: 'daily', priority: 0.9 }),
    /*
     * 详情页给 0.8、下载页给 0.6：详情页是「内容」，下载页是「动作」。
     * 用户明确要求下载页也要能被收录，所以不能省 —— 但排序上让详情页在前。
     */
    ...stubs.flatMap((stub) => [
      ...entries(origin, `/games/${stub.id}`, {
        lastModified: new Date(stub.createdAt),
        changeFrequency: 'monthly',
        priority: 0.8,
      }),
      ...entries(origin, `/games/${stub.id}/download`, {
        lastModified: new Date(stub.createdAt),
        changeFrequency: 'monthly',
        priority: 0.6,
      }),
    ]),
    /*
     * 开发商列表给 0.7（介于游戏列表 0.9 和法务页 0.3 之间：它是内容入口，
     * 但不是这个站的主体），每家的详情页 0.6 —— 和「游戏下载页」同档，
     * 因为它的价值在同一类：指向一款款具体游戏。
     */
    ...(developers.length > 0
      ? entries(origin, '/developers', { changeFrequency: 'weekly', priority: 0.7 })
      : []),
    ...developers.flatMap((developer) =>
      entries(origin, `/developers/${developer.id}`, {
        lastModified: new Date(developer.createdAt),
        changeFrequency: 'monthly',
        priority: 0.6,
      })
    ),
    /*
     * 机种（2026-10-14 加）：列表 0.7、每个专题页 0.6 —— 和开发商那两条同一个档位
     * （内容入口，指向一款款具体游戏）。⚠️ 只列 `consoles` 表里有资料行的机种：
     * 静态那几条之外，sitemap 不猜「代码里有、库里还没有」的东西 —— 等后台把资料
     * 填上（或迁移脚本预填之后）它们自然出现。
     */
    ...(consoles.length > 0
      ? entries(origin, '/consoles', { changeFrequency: 'weekly', priority: 0.7 })
      : []),
    ...consoles.flatMap((console) =>
      entries(origin, `/consoles/${console.type}`, {
        lastModified: new Date(console.createdAt),
        changeFrequency: 'monthly',
        priority: 0.6,
      })
    ),
    ...entries(origin, '/privacy', { changeFrequency: 'yearly', priority: 0.3 }),
    ...entries(origin, '/terms', { changeFrequency: 'yearly', priority: 0.3 }),
  ];
}
