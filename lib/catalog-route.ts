/*
 * **旧地址的兼容层**（2026-10-20 起只剩这一个用途，别再往这里加新维度）。
 *
 * ## 它当初解决什么
 *
 * 目录页（`/games`、`/consoles/<id>`、`/developers`、`/developers/<id>`）是**静态渲染 + ISR**：
 * 页面自己不读 `searchParams`，`?page=` / `?console=` / `?lang=` / `?q=` 这些维度由
 * `middleware.ts` 调本文件改写成 `/catalog/<kind>/<id>/<编码后的查询串>` ——
 * 这样每种组合都有一份独立的路由缓存条目（Cloudflare 上零渲染成本），公开地址不变。
 *
 * ## 为什么现在只用它兜旧链接
 *
 * 这个改写对「整页文档请求」成立，对 `<Link>` 的**软导航不成立**：客户端请求的是
 * `/zh/games?page=2`，拿回来的 flight 却是 `/catalog/...` 那棵树（segment 对不上），
 * 客户端无法把它对到当前路由树 ⇒ 2026-10-19 线上表现是「只改地址栏、内容一动不动」；
 * 而如果这时链接写成普通 `<a>`，代价就是**每点一次分页 / tab 整页刷新**。
 *
 * 2026-10-20 的解法是把这些维度**搬进路径**，让它们变成真路由：
 *
 *   `/games/page/2`、`/games/console/nes`、`/games/console/nes/page/2`
 *   `/consoles/nds/lang/zh`、`/consoles/nds/lang/zh/page/2`、`/consoles/nds/page/2`
 *   `/developers/page/2`、`/developers/<id>/page/2`
 *   `/games/search?q=…`、`/consoles/<id>/search?q=…`   ← 关键词留 query，但换成独立动态路由
 *
 * 真路由不需要改写 ⇒ 软导航恢复正常。路径的正则在下面 `catalogRewrite` 里天然不命中
 * （它只匹配 1~2 段），所以新地址不会误入这里；`/games/search` 也被那条
 * 「games 后面还有一段」的判断挡掉了。
 *
 * ⚠️ **保留本文件是为了旧的外链 / 收藏**：`/games?page=2`、`/consoles/nds?lang=zh` 这类地址
 * 仍然能打开并渲染出正确内容（只是 canonical 指向新地址，搜索引擎自己会收敛过去）。
 * 不要因为「已经没人用」就删掉 —— 删了这些地址会静默变成第 1 页 / 无筛选。
 * ⚠️ 更不要顺手把新的路径段也塞进这里 —— 那正是这次要消灭的东西。
 */

/** Query variants get distinct route-cache keys without changing public URLs.
 * Only legacy public catalog URLs enter this cache; account/admin/API never do.
 */
export function catalogRewrite(path: string, query: URLSearchParams): string | null {
  const match = /^\/(games|developers|consoles)(?:\/([^/]+))?$/.exec(path);
  if (!match || (match[1] === 'games' && match[2]) || (match[1] === 'consoles' && !match[2])) return null;
  const kind = match[1] === 'developers' && match[2] ? 'developer' : match[1] === 'consoles' ? 'console' : match[1];
  const keys = kind === 'games' ? ['q', 'console', 'page'] : kind === 'console' ? ['q', 'lang', 'page'] : ['page'];
  const selected = new URLSearchParams();
  for (const key of keys) for (const value of query.getAll(key)) selected.append(key, value);
  if (!selected.size) return null;
  // Do not store arbitrary tracking parameters or unbounded query strings.
  const value = selected.toString();
  if (value.length > 2048) throw new RangeError('Catalog query is too long');
  return `/catalog/${kind}/${match[2] ?? '_'}/${encodeURIComponent(value)}`;
}

export function decodeCatalogQuery(query: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = Object.create(null);
  // Next may pass the encoded path segment to the page, but the decoded
  // segment to metadata. A serialized query always has a literal '=';
  // only unwrap the path encoding when that separator is still encoded.
  // Decoding an already-unwrapped query would corrupt escaped '&' and '+'.
  const values = new URLSearchParams(query.includes('=') ? query : decodeURIComponent(query));
  for (const key of values.keys()) {
    const all = values.getAll(key);
    result[key] = all.length === 1 ? all[0] : all;
  }
  return result;
}
