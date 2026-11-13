import type { MetadataRoute } from 'next';
import { DEFAULT_LOCALE, LOCALES, isLocale, localePath, type Locale } from '@/lib/i18n';
import { listConsoleStubsCached } from '@/lib/server/consoles';
import { listDeveloperStubsCached } from '@/lib/server/developers';
import { listGameStubsCached } from '@/lib/server/sb-games';
import { resolveSiteOrigin } from '@/lib/site';

/*
 * /sitemap.xml。
 *
 * 本站可收录的地址分六类：
 *   · 首页落地页（`/`，2026-10-13 起）—— Hero + 按机种 / 开发商浏览 + FAQ；
 *   · 应用页（`/play`，2026-10-14 加）；
 *   · `/privacy` / `/terms` 两页法务文档；`/about` / `/contact` 两页站务说明（2026-11-03 加）；
 *   · `/games` 游戏列表（机种筛选 `/games/console/<机种>` 没列进来：它是同一份列表的子集，
 *     只差一个筛选维度，全列等于把一个库拆成十几份近似重复的地址；分页同理只列第 1 页）；
 *   · 每款游戏的 `/games/<id>`（**从库里现取**）；
 *   · `/developers` 开发商列表 + 每家的 `/developers/<id>`（2026-10-12 加，同样现取）；
 *   · `/consoles` 机种列表 + 每个机种的 `/consoles/<type>`（2026-10-14 加，同样现取）。
 * 游戏库 / 存档 / 联机 / 键位那些面板全是屏幕上的浮层，没有各自的 URL，
 * 所以不在这里 —— 别为了「看起来完整」往里塞不存在的路径，那是会被判成软 404 的。
 *
 * 法务两页是 2026-10-12 加进来的：它们是**真正的路由**（理由见 app/[locale]/privacy/page.tsx），
 * 而且**必须**能被收录 —— 隐私政策与条款要能直接被搜到、被第三方按固定地址检查，
 * 只挂在某个弹层里等于不存在。优先级给得比首页低：它们不是内容主体。
 *
 * 2026-10-13 语言分路径之后，**每条地址每种语言一份**（英文无前缀、中文 `/zh`、
 * 日文 `/ja`、韩文 `/ko`，2026-10-16 从两份扩到四份，**2026-10-20 扩到 18 份**），
 * 由下面的 `entry()` 统一生成 —— 它顺带把 18 条 `hreflang` 互相指好。
 * 别手写其中一份：漏了 alternates 的那份在 Google 眼里就是「重复内容」，
 * 这正是分语言路径最容易被忽略的代价。
 *
 * ⚠️ **18 种语言必须拆成 18 份 sitemap**（`generateSitemaps`）：2110 款游戏 ×
 *    18 语言 ≈ 3.8 万条（2026-10-24 起下载页不进 sitemap，此前是 × 2 个地址 ≈ 7.6 万条），
 *    单文件上限是 5 万，历史上就是为了这个上限拆的份。
 *
 * ⚠️ **每条 URL 都是一次会超免费版 CPU 的现场渲染**（全站 force-dynamic，
 *    见 docs/cloudflare-deployment.md），所以 sitemap 只列真正值得收录的地址：
 *    下载页、分页、机种筛选这类「能被链接发现」的地址不主动推荐，把抓取预算
 *    留给详情页。
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
 * 24 小时 ISR，**不是请求期渲染**。
 *
 * ⚠️ 这段以前写着「必须动态渲染，否则域名会被烤成构建值」—— 那是错的，代码从来没
 *    加过 `dynamic = 'force-dynamic'`，构建产物里一直躺着 18 个 `.xml.body` 预渲染文件。
 *    后果是真实存在过的：2026-10-30 换域名，包不重打，sitemap 里就一直是旧域
 *    （`.open-next/assets` 那批 `<loc>` 全是 retrogamesonline.fun）。
 *
 * 所以 `<loc>` 的域名有两层来源：**构建期**用 `SITE_URL`（没配就落到 `lib/site.ts`
 * 的兜底值），**运行期重渲染**（ISR 到期后）用 Worker 里的同名变量。换域名时
 * 重新 `pnpm cf:build` 是最干净的一条路 —— 光 `wrangler deploy` 复用旧产物，
 * 那 18 份旧域名的副本还会一直在，得等各自 24 小时到期、且第一条请求拿到的还是旧副本。
 *
 * 为什么不改成 force-dynamic：sitemap 是爬虫反复抓的地址，每次现场渲染都要全表扫一遍
 * 游戏 / 开发商 / 机种，正是免费版 10ms CPU 最扛不住的那类请求（见 docs/cloudflare-deployment.md）。
 */
export const revalidate = 86400;

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;

/**
 * 一条路径 + 一种语言 → sitemap 里的**一条**。
 *
 * ⚠️ **2026-11-03 起不再往 sitemap 里塞 18 条 `hreflang`**（原来每条地址都带一份
 *    `alternates`）。理由两条，一条是 SEO、一条是 CPU：
 *
 *    · **SEO 上它是纯冗余**：每个页面的 `<head>` 里已经有完整的一组
 *      `<link rel="alternate" hreflang>`（`alternatesFor()`，首页 / 列表 / 详情 /
 *      机种 / 开发商 / 四个文档页全都挂了），Google 认任意一种声明方式，
 *      两种同时存在还要求逐条一致 —— 少写一份反而少一处漂移的机会。
 *    · **CPU 上它是最大的一块**：一份 sitemap ≈ 2100 款游戏 + 开发商 + 机种 ≈ 4000 条，
 *      每条再摊 19 个 `xhtml:link` ⇒ 单份 XML 从约 500 KB 涨到约 6 MB。
 *      这份 XML 是要在 Worker 里拼出来的，免费版 10ms CPU 根本装不下，
 *      于是「24 小时 ISR 到期 → 后台重新生成」这条链每次都 1102，
 *      缓存永远停在旧那版。（分片本身也还是 18 份，那是 5 万条上限的硬约束，没动。）
 *
 *    要恢复的话，改这一处就够 —— 但先把上面两个代价想清楚。
 */
function entry(
  origin: string,
  locale: Locale,
  path: string,
  extra: { lastModified?: Date; changeFrequency?: ChangeFrequency; priority?: number } = {}
): MetadataRoute.Sitemap[number] {
  return {
    url: `${origin}${localePath(locale, path)}`,
    ...extra,
  };
}

/**
 * 每语言一份 sitemap —— Next 据此生成 `/sitemap/<locale>.xml`（18 份）。
 *
 * ⚠️ **这里没有 `/sitemap.xml` 索引**（见上面那段 2026-10-23 的实测），
 *    `app/robots.ts` 里列的就是这 18 条分片，不是索引地址。
 * ⚠️ 别改回「一个文件装下所有语言」：那就是上面那段说过的 5 万条上限。
 */
export async function generateSitemaps() {
  return LOCALES.map((locale) => ({ id: locale }));
}

/**
 * 一份 sitemap = 一种语言的全部地址（`generateSitemaps` 传进来的 `id` 就是 locale）。
 *
 * 🔴 **`id` 在 Next 16 起是 `Promise<string>`，必须 `await`**（官方文档版本表：
 *    `v16.0.0` — "The `id` values returned from `generateSitemaps` are now passed
 *    as a promise"）。2026-10-30 修的就是这个：以前签名写的是 `{ id: string }`、
 *    直接喂给 `isLocale()`，而 `isLocale` 是 `LOCALES.includes(value)` ——
 *    拿到 Promise 永远 false，于是**18 份分片全都回退成默认语言**，
 *    构建产物里 18 个 `.xml.body` 的 md5 完全相同、全是英文地址 && 全无语言前缀。
 *
 *    ⚠️ 类型系统不会替你挡这一刀：默认导出的 props 类型没被 Next 校验，
 *    写成 `{ id: string }` 照样编译通过，只在运行时静默走错分支。
 *    `await` 对字符串是幂等的，所以这一句在 Next 15/16 上都成立，别再改回去。
 *
 * `id` 认不出就退回默认语言 —— 别直接断言成 `Locale`，那样拼错一个地址
 * 就会在运行时拿到 `undefined` 前缀。
 */
export default async function sitemap({
  id,
}: {
  id: string | Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const resolved = await id;
  const locale: Locale = isLocale(resolved) ? resolved : DEFAULT_LOCALE;
  const origin = await resolveSiteOrigin();

  /*
   * 游戏读不出来（D1 没配 / 临时打不通）时**不能让整个 sitemap 挂掉** ——
   * 那样爬虫连首页和法务页的地址都拿不到，代价比少列一批游戏大得多。
   * 所以这里吞掉异常、退回一份只剩静态地址的 sitemap，并在服务端日志里留一行。
   */
  let stubs: { id: string; createdAt: number }[] = [];
  try {
    /*
     * 三个 stub 读取都走 24 小时缓存（listXxxStubsCached）—— sitemap 每次被抓都要
     * 全表扫一遍，爬虫反复来的时候这是单次请求 rows_read 最大的一块。缓存之后
     * 一天最多算一轮；后台增删游戏会 revalidateTag('games') 立刻刷掉游戏那份。
     */
    stubs = await listGameStubsCached();
  } catch (error) {
    console.error('[sitemap] 读取游戏列表失败，本次只输出静态地址', error);
  }

  // 开发商同理：读不到就只少这几条，别让整个 sitemap 挂掉
  let developers: { id: string; createdAt: number }[] = [];
  try {
    developers = await listDeveloperStubsCached();
  } catch (error) {
    console.error('[sitemap] 读取开发商列表失败，本次略过开发商地址', error);
  }

  // 机种同理（2026-10-14 加）：迁移没跑过（表还没建）也只少这几条
  let consoles: { type: string; createdAt: number }[] = [];
  try {
    consoles = await listConsoleStubsCached();
  } catch (error) {
    console.error('[sitemap] 读取机种列表失败，本次略过机种地址', error);
  }

  return [
    entry(origin, locale, '/', { changeFrequency: 'weekly', priority: 1 }),
    /*
     * `/play`（2026-10-14 加）：正文只有一块 canvas，对搜索引擎几乎没有价值，
     * 但它的 canonical 指自己、分享链接又常常带 `?id=`，总得有个正式地址。
     */
    entry(origin, locale, '/play', { changeFrequency: 'weekly', priority: 0.6 }),
    /*
     * H5 小游戏专栏（2026-11-12 加）。
     *
     * `/h5/<id>` 也列进去：那一页正文只有一个 canvas，和 `/play` 是同一类
     * 「跑得起来但读不出字」的页面 —— 它的价值在于分享出去的地址有个正式落点，
     * 不在于被搜到。
     */
    entry(origin, locale, '/h5', { changeFrequency: 'weekly', priority: 0.7 }),
    /* ⚠️ id 必须和 `lib/h5/catalog.ts` 的 `H5GameId` 一致（旧值 toy-gunfight 已不存在） */
    entry(origin, locale, '/h5/transport-ship', { changeFrequency: 'monthly', priority: 0.6 }),
    entry(origin, locale, '/games', { changeFrequency: 'daily', priority: 0.9 }),
    /*
     * 详情页给 0.8。
     *
     * ⚠️ **下载页（`/games/<id>/download`）2026-10-24 起不再进 sitemap**，原因见
     *    docs/cloudflare-deployment.md：全站 force-dynamic 之下每个被抓的 URL 都是
     *    一次会超免费版 CPU 的渲染，下载页把爬虫邀请面直接翻倍。它们**照常可收录**
     *    —— 每个详情页都有指过去的链接，爬虫顺着链接照抓，只是不再主动推荐；
     *    「用户要求下载页能被收录」这个决定没有变，变的只是发现途径。
     */
    ...stubs.map((stub) =>
      entry(origin, locale, `/games/${stub.id}`, {
        /* `createdAt === 0` = 不知道收录时间（源站模式下上游 sitemap 不给日期）*/
        lastModified: stub.createdAt ? new Date(stub.createdAt) : undefined,
        changeFrequency: 'monthly',
        priority: 0.8,
      })
    ),
    /*
     * 开发商列表给 0.7（介于游戏列表 0.9 和法务页 0.3 之间：它是内容入口，
     * 但不是这个站的主体），每家的详情页 0.6 —— 和「游戏下载页」同档，
     * 因为它的价值在同一类：指向一款款具体游戏。
     */
    ...(developers.length > 0
      ? [entry(origin, locale, '/developers', { changeFrequency: 'weekly', priority: 0.7 })]
      : []),
    ...developers.map((developer) =>
      entry(origin, locale, `/developers/${developer.id}`, {
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
      ? [entry(origin, locale, '/consoles', { changeFrequency: 'weekly', priority: 0.7 })]
      : []),
    ...consoles.map((console) =>
      entry(origin, locale, `/consoles/${console.type}`, {
        /* 同上：0 = 不知道收录时间（源站模式下按机种枚举，不查库）*/
        lastModified: console.createdAt ? new Date(console.createdAt) : undefined,
        changeFrequency: 'monthly',
        priority: 0.6,
      })
    ),
    /*
     * 站务说明两页（2026-11-03 加）。它们是**真路由**，被页脚从每一页链到，
     * 所以按内容页给一份优先级；`monthly` 是因为站务信息改动频率低于游戏库，
     * 但比法务两页高（联系方式、处理时间会变）。
     */
    entry(origin, locale, '/about', { changeFrequency: 'monthly', priority: 0.4 }),
    entry(origin, locale, '/contact', { changeFrequency: 'monthly', priority: 0.4 }),
    entry(origin, locale, '/privacy', { changeFrequency: 'yearly', priority: 0.3 }),
    entry(origin, locale, '/terms', { changeFrequency: 'yearly', priority: 0.3 }),
  ];
}
