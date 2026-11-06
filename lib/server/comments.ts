/*
 * 游戏评论（game_comments 表）的读写。
 *
 * 结构上照 lib/server/feedback.ts 的套路（DB 行 snake_case / 对外 camelCase 两套类型
 * + `toComment()` 映射，列表一律「新的在前」，**游标翻页而不是 offset**）。和上面那几张表
 * 刻意不同的地方有三处，都是为了「评论要登录」这一条：
 *
 * ① **每条都有作者**（`user_id` + 用户名快照）。留言本 / 游戏反馈是匿名提交，只留内容；
 *    评论走的是另一条路 —— 用户明确要求「评论之前必须登录」。所以：
 *      · 读的时候 `LEFT JOIN app_users`，**头像现取**（用户换了头像，他所有旧评论跟着换）；
 *      · 用户名同理以库里的为准，`c.username` 那个快照只在**账号被删之后**兜底
 *        （没有 JOIN 到就退回快照 —— 不能因为作者销号就把他说过的话变成无名氏）。
 *
 * ② **`game_slug` 一律现传现用，不做 JOIN games**。评论不显示游戏名（就在这一页上），
 *    也不需要「当时是哪款」的快照 —— 游戏下架时这一页本身就 404 了，评论跟着一起不可见，
 *    这是对的行为（孤儿行留着，用户换不来任何东西）。
 *
 * ③ **没有缓存，也没有 resolved 之类的状态位**。列表每次都是最新的一眼
 *    （和 `countGameFavorites` 同一个口径：详情页每次渲染就查一遍，量小、值得）；
 *    管理只有一条路 —— **作者自己删**（`deleteComment` 带 `user_id` 一起判）。
 *
 * ④ **打分和评论是同一条记录**（`rating` 1..5，2026-10-13 加）。汇总（均分 / 评分数）
 *    由 `getGameRatingSummary` 现算，**刻意不混进列表查询** —— 列表是分页的，
 *    均分必须全量（理由见那个函数）。
 *
 * ⚠️ 翻页的游标是 `(created_at, id)` 两级、编码成 `created_at:id`：created_at 是毫秒
 *    时间戳，同一毫秒发两条并不罕见（连点两次「发表」），只用 created_at 会整段跳过。
 *
 * ⚠️ 2026-10-20 起数据源是 Supabase（`./pg`）。三处跟 D1 不一样：
 *    · 列名 `game_id` → **`game_slug`**（游戏主键换成上游 slug 了，见 db/schema.pg.sql）；
 *    · `created_at` 是 `timestamptz` ⇒ 读的时候换算成毫秒、比较的时候 `to_timestamp`；
 *    · `AVG(rating)` 在 Postgres 里回 **numeric（驱动给字符串）**，必须显式 `::float8`，
 *      否则均分会变成 `"4.3333…"` 这种字符串，前端 `toFixed` 直接炸。
 */

import { randomUUID } from 'node:crypto';
import { query } from './pg';
import { publicUrlOrNull } from './r2';

/** 一页多少条。评论比留言本密（一款热门的下面可能攒几十条），一次多给几条。 */
export const COMMENT_PAGE_SIZE = 10;

/** 正文长度上限。纯文本、没有富文本，卡个上限就够挡刷屏了。 */
export const COMMENT_MAX_LENGTH = 500;

/*
 * 星级的合法区间（2026-10-13 用户要求「评论有星星 1-5」）。
 *
 * 这里是**唯一定义**，接口拿它校验、前端那份是手抄的（客户端不能 import 这个模块，
 * 里面引了 node:crypto 和数据库客户端 —— 同 COMMENT_PAGE_SIZE / COMMENT_MAX_LENGTH）。
 * 组件里改区间时**两处一起改**。
 */
export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** DB 行（snake_case）。多出来的两列来自 LEFT JOIN app_users。 */
interface CommentRow {
  id: string;
  /** 游戏主键（= `games.slug`）。对外字段名仍是 `gameId`，形状不变。 */
  game_slug: string;
  user_id: string;
  username: string;
  content: string;
  rating: number;
  /** 毫秒时间戳（库里是 timestamptz，SELECT 里换算好了）。 */
  created_at: number;
  /** JOIN 到的现名；账号已删则为 null */
  live_username: string | null;
  /** JOIN 到的头像 key；账号已删 / 没设过头像则为 null */
  avatar_key: string | null;
}

/** 对外结构（camelCase）。**只在服务端流动**，路由层会把 `userId` 摘掉再出网。 */
export interface Comment {
  id: string;
  gameId: string;
  /**
   * 作者 id。
   *
   * ⚠️ **这一列不许出网**（不写进 API 响应）—— 前端判「这条是不是我写的」靠路由给的
   *    `mine` 标记，不需要知道 uuid。理由：user id 是账号体系里的内部标识，
   *    没有任何一个公开页面需要它，而给出去就等于把「同一个人的所有评论」串成了一张网。
   */
  userId: string;
  /**
   * 作者名。JOIN 得到的就是现名（用户名本来也不能改），账号没了才退回快照。
   *
   * ⚠️ 这里是**真名**，而站上的用户名就是注册邮箱 ⇒ 出网前必须过 `maskUserName`
   *    （`lib/mask.ts`，目前唯一出口是 `app/api/games/[id]/comments/route.ts` 的
   *    `publicItem`）。别为了省事在这一层遮 —— 后台要看真的。
   */
  username: string;
  /** 头像公网地址；没设过 / 账号没了就是 null（前端画默认头像）。 */
  avatarUrl: string | null;
  content: string;
  /**
   * 星级 1..5（必填）。和正文同一条记录 —— 评论就是「说一句 + 打个分」，
   * 不在这一版拆成两张表（均分现算，见 getGameRatingSummary）。
   */
  rating: number;
  createdAt: number;
}

/** 一页结果。`nextCursor` 为 null 表示到底了。 */
export interface CommentPage {
  items: Comment[];
  nextCursor: string | null;
}

function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    gameId: row.game_slug,
    userId: row.user_id,
    username: row.live_username ?? row.username,
    // 头像同样是**展示用**字段，用软版拼（缺 R2_PUBLIC_BASE 时回 null，不把整页评论带走）
    avatarUrl: publicUrlOrNull(row.avatar_key),
    content: row.content,
    rating: row.rating,
    createdAt: row.created_at,
  };
}

/** 游标 = `created_at:id`。id 是 UUID，里面不会有冒号，按**第一个**冒号切就够。 */
function encodeCursor(comment: Comment): string {
  return `${comment.createdAt}:${comment.id}`;
}

function decodeCursor(raw: string | null | undefined): { createdAt: number; id: string } | null {
  if (!raw) return null;
  const at = raw.indexOf(':');
  if (at <= 0) return null;
  const createdAt = Number(raw.slice(0, at));
  const id = raw.slice(at + 1);
  if (!Number.isFinite(createdAt) || !id) return null;
  return { createdAt, id };
}

/** 把外部传进来的 limit 收敛到 1..50，非法值退回默认页大小。 */
function clampLimit(value: number | undefined): number {
  if (!Number.isInteger(value) || !value || value < 1) return COMMENT_PAGE_SIZE;
  return Math.min(value, 50);
}

/*
 * 两条查询共用的 SELECT。
 *
 * `LEFT JOIN`（不是 JOIN）：账号被删了，那条评论**还要读得出来**（退回 `c.username` 快照）。
 * 用 INNER JOIN 的话删号等于把他的评论一次性全抹掉 —— 那不是删号该有的副作用。
 */
const SELECT = `
  SELECT
    c.id, c.game_slug, c.user_id, c.username, c.content, c.rating,
    (EXTRACT(EPOCH FROM c.created_at) * 1000)::float8 AS created_at,
    a.username   AS live_username,
    a.avatar_key AS avatar_key
  FROM game_comments c
  LEFT JOIN app_users a ON a.id = c.user_id`;

/** 某一款游戏的评论，新的在前。 */
export async function listGameComments(
  gameId: string,
  options: { cursor?: string | null; limit?: number } = {}
): Promise<CommentPage> {
  const limit = clampLimit(options.limit);
  const cursor = decodeCursor(options.cursor);

  /*
   * 多取一条：拿得到第 limit+1 条就说明后面还有，用它反过来推 nextCursor。
   * 比再发一条 COUNT 查询便宜，也不用把总数透给前台。
   */
  const rows = cursor
    ? await query<CommentRow>(
        `${SELECT}
          WHERE c.game_slug = ?
            AND ((c.created_at < to_timestamp(?::float8 / 1000))
              OR (c.created_at = to_timestamp(?::float8 / 1000) AND c.id < ?))
          ORDER BY c.created_at DESC, c.id DESC
          LIMIT ?`,
        [gameId, cursor.createdAt, cursor.createdAt, cursor.id, limit + 1]
      )
    : await query<CommentRow>(
        `${SELECT}
          WHERE c.game_slug = ?
          ORDER BY c.created_at DESC, c.id DESC
          LIMIT ?`,
        [gameId, limit + 1]
      );

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(toComment);
  const last = items[items.length - 1];

  return { items, nextCursor: hasMore && last ? encodeCursor(last) : null };
}

/**
 * 发一条。`username` 由调用方传（**从会话里取**，见 app/api/games/[id]/comments/route.ts）——
 * 数据层不再回查一次 app_users：登录守卫刚刚已经查过了，那是同一个值。
 */
export async function insertComment(input: {
  gameId: string;
  userId: string;
  username: string;
  content: string;
  /** 星级 1..5。**合法性由调用方（路由）校验过**，这里不重复判 —— 同 content 的分工。 */
  rating: number;
}): Promise<Comment> {
  const id = randomUUID();
  const createdAt = Date.now();
  await query(
    `INSERT INTO game_comments (id, game_slug, user_id, username, content, rating, created_at)
     VALUES (?, ?, ?, ?, ?, ?, to_timestamp(?::float8 / 1000))`,
    [id, input.gameId, input.userId, input.username, input.content, input.rating, createdAt]
  );
  /*
   * 刚写完的这一条头像一定是 null —— 这条路上的调用方（路由）手里没有 avatar_key，
   * 而为了拿它再查一次库不值当：前端把自己发的那条插到列表最前面时用的就是这份数据，
   * 头像那一格画默认剪影。**刷新一下就有了**（列表是现查的）。
   */
  return {
    id,
    gameId: input.gameId,
    userId: input.userId,
    username: input.username,
    avatarUrl: null,
    content: input.content,
    rating: input.rating,
    createdAt,
  };
}

/** 一款游戏的评分汇总。`count` 为 0 时 `average` 也一定是 0（sqlite 的 AVG 会给 NULL）。 */
export interface RatingSummary {
  /** 均分，保留原始精度（前端自己 toFixed 一位）；没人评过就是 0 */
  average: number;
  /** 参与评分的人数 = 评论条数 */
  count: number;
}

/**
 * 某一款游戏的均分 / 评分数。
 *
 * ⚠️ **和列表分开查**（不塞进 listGameComments）：列表是**分页**的，拿当前这一页算均分
 *    会随「加载更多」一直变 —— 用户看到的 4.2 会莫名其妙往下掉。这条查的是**全量**，
 *    永远只发一次（详情页那一页要的就是「这一款几分」这一个数）。
 *    走 `idx_game_comments_game` 的前缀，不必再加索引。
 *
 * ⚠️ **不做缓存**（和 countGameFavorites 同一个口径）：详情页每次渲染现查，量小、值得。
 */
export async function getGameRatingSummary(gameId: string): Promise<RatingSummary> {
  /*
   * `AVG(...)::float8` 那个显式转换不能省：Postgres 的 AVG 回 numeric，
   * postgres.js 把它当**字符串**给出来（保精度），前端 `toFixed` 会当场炸。
   * `COUNT(*)::int` 同理 —— 不转的话是 int8，驱动给 BigInt。
   */
  const rows = await query<{ n: number; avg: number | null }>(
    `SELECT COUNT(*)::int AS n, AVG(rating)::float8 AS avg
       FROM game_comments WHERE game_slug = ?`,
    [gameId]
  );
  const count = Number(rows[0]?.n ?? 0);
  const avg = rows[0]?.avg;
  return { average: count > 0 && typeof avg === 'number' ? avg : 0, count };
}

/**
 * 删一条 —— **只认作者**：`WHERE id = ? AND user_id = ?` 两条件缺一不可。
 *
 * 返回是否真删到了（不存在 / 不是他写的都回 false，调用方据此回 404）。
 * 判定用 `DELETE … RETURNING`：删中了才回行，一条查询顶过去「先 SELECT 再 DELETE」两条。
 *
 * ⚠️ `user_id` 必须进 WHERE：漏了它就成了「任何人可以删任何一条」——
 *    和归档那份「漏 WHERE user_id」是同一类坑。
 */
export async function deleteComment(id: string, userId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'DELETE FROM game_comments WHERE id = ? AND user_id = ? RETURNING id',
    [id, userId]
  );
  return rows.length > 0;
}

/* ============================================================================
 * 带游戏名的列表（2026-11-06：后台「评论」tab + 个人中心「我的评论」）
 *
 * 和上面两个函数的三处区别，都是为了「不在某一款游戏的详情页上」：
 *
 * ① **不带 gameId 条件**。后台要看全站（发现「同一个人在几十款下面刷同样的话」）；
 *    个人中心只要自己的（`WHERE c.user_id = ?`）—— 两处共用下面那个
 *    `listWithGame()`，条件由调用方给，**只传静态 SQL 片段**，用户数据一律走占位符。
 *
 * ② **多带一个 `gameTitle`**。评论表本身没有游戏名快照（前台就在那一页上，
 *    不需要；见 `Comment.gameId` 上面那段 ②）—— 所以这里现查 `game_texts`。
 *    标题取「有哪个语言就用哪个」：中文优先、英文其次，其余按 locale 排，
 *    一款游戏连标题都没有时给 null（前端退回显示 slug，链接照样能点）。
 *    用相关子查询而不是 JOIN：那是个 (game_slug, locale) 主键上的点查，
 *    每行一次；JOIN 到三四种语言会先把行数乘起来再挑，反而要 DISTINCT。
 *
 * ③ **没有缓存**（同 reports.ts 的 ①）：两处都是「点进去看一眼」，加缓存只会多
 *    一份「刚删完是不是还看得到」的心智负担。
 * ========================================================================== */

/** 列表的一行：前台那份 + 游戏名（现查，不是快照）。 */
export interface CommentWithGame extends Comment {
  /** 游戏名；游戏已下架 / 一条文案都没有时为 null */
  gameTitle: string | null;
}

/** 一页结果。`nextCursor` 为 null 表示到底了。 */
export interface CommentWithGamePage {
  items: CommentWithGame[];
  nextCursor: string | null;
}

interface CommentWithGameRow extends CommentRow {
  game_title: string | null;
}

function toCommentWithGame(row: CommentWithGameRow): CommentWithGame {
  return { ...toComment(row), gameTitle: row.game_title };
}

/*
 * 这份 SELECT **刻意不并进上面那个 SELECT** —— 那个每行都被前台评论列表
 * 跑一遍，标题子查询对前台是纯浪费（它压根不显示游戏名）。
 */
const LISTED_SELECT = `
  SELECT
    c.id, c.game_slug, c.user_id, c.username, c.content, c.rating,
    (EXTRACT(EPOCH FROM c.created_at) * 1000)::float8 AS created_at,
    a.username   AS live_username,
    a.avatar_key AS avatar_key,
    (
      SELECT t.title
        FROM game_texts t
       WHERE t.game_slug = c.game_slug
         AND t.title IS NOT NULL AND t.title <> ''
       ORDER BY CASE t.locale WHEN 'zh' THEN 0 WHEN 'en' THEN 1 ELSE 2 END,
                t.locale
       LIMIT 1
    ) AS game_title
  FROM game_comments c
  LEFT JOIN app_users a ON a.id = c.user_id`;

/**
 * 两处列表共用的翻页查询。
 *
 * `filter.sql` 只放**静态条件**（`'1=1'` / `'c.user_id = ?'`），用户数据一律走
 * `filter.params` 占位符 —— 别把 id 拼进 SQL 字符串。
 *
 * 翻页口径和 `listGameComments` 完全一致（`created_at:id` 两级游标，
 * 同一毫秒两条也不会跳段）。
 */
async function listWithGame(
  filter: { sql: string; params: unknown[] },
  options: { cursor?: string | null; limit?: number }
): Promise<CommentWithGamePage> {
  const limit = clampLimit(options.limit);
  const cursor = decodeCursor(options.cursor);

  /*
   * 多取一条：拿得到第 limit+1 条就说明后面还有，用它反过来推 nextCursor。
   * 比再发一条 COUNT 查询便宜，也不用把总数透给前台。
   */
  const rows = cursor
    ? await query<CommentWithGameRow>(
        `${LISTED_SELECT}
          WHERE ${filter.sql}
            AND ((c.created_at < to_timestamp(?::float8 / 1000))
              OR (c.created_at = to_timestamp(?::float8 / 1000) AND c.id < ?))
          ORDER BY c.created_at DESC, c.id DESC
          LIMIT ?`,
        [...filter.params, cursor.createdAt, cursor.createdAt, cursor.id, limit + 1]
      )
    : await query<CommentWithGameRow>(
        `${LISTED_SELECT}
          WHERE ${filter.sql}
          ORDER BY c.created_at DESC, c.id DESC
          LIMIT ?`,
        [...filter.params, limit + 1]
      );

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(toCommentWithGame);
  const last = items[items.length - 1];

  return { items, nextCursor: hasMore && last ? encodeCursor(last) : null };
}

/** 全站评论，新的在前（后台「评论」tab）。 */
export async function listAllComments(
  options: { cursor?: string | null; limit?: number } = {}
): Promise<CommentWithGamePage> {
  return listWithGame({ sql: '1=1', params: [] }, options);
}

/**
 * 某个用户自己写的评论，新的在前（同一毫秒的两条按 id 兜底排序）。
 *
 * `WHERE c.user_id = ?` 是「只能看到自己的」的全部保证 —— 别改成先拉全站再在
 * 内存里过滤（那样将来一分页就会把别人的评论也读出来）。
 *
 * 删除**不在这个文件里**：作者删自己的走 `deleteComment`（带 user_id）与
 * `DELETE /api/comments/<id>`，个人中心直接复用那条路。
 */
export async function listUserComments(
  userId: string,
  options: { cursor?: string | null; limit?: number } = {}
): Promise<CommentWithGamePage> {
  return listWithGame({ sql: 'c.user_id = ?', params: [userId] }, options);
}

/**
 * 后台删一条 —— **不判作者**（这正是它和 `deleteComment` 的区别）。
 *
 * 把「谁都能删」收在这一个函数里，而不是给 `deleteComment` 的 `userId`
 * 加个可空口子：那个函数的全部价值就是「作者才能删」，一旦允许省略，
 * 前台那条路就随时可能被误用成管理员权限。两条路两个名字。
 *
 * 返回是否真删到了（不存在回 false，调用方据此回 404）。
 */
export async function adminDeleteComment(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'DELETE FROM game_comments WHERE id = ? RETURNING id',
    [id]
  );
  return rows.length > 0;
}
