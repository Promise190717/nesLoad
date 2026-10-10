/*
 * 留言本（feedback 表）的读写。
 *
 * 对外结构把 SQLite 的 0/1 转成 boolean、列名转成 camelCase —— 和 games.ts 一个套路。
 *
 * **翻页用游标而不是 offset**：列表是「新的在前」，用 offset 的话，用户正翻着的时候
 * 别人插进来一条，第二页就会重复或漏掉一条。游标取「上一页最后一条」的
 * `(created_at, id)`，翻页期间新数据只会出现在最前面，不影响后面的页。
 *
 * 为什么游标要带上 id：created_at 是毫秒时间戳，同毫秒写入两条并不罕见
 * （比如连点两次提交）。只用 created_at 当游标，同毫秒的那几条会被整段跳过。
 *
 * **列表结果带一层进程内缓存**（见下面 CACHE 那一段）：D1 走 REST，每查一次就是一次
 * API 调用 + 配额消耗，而留言列表是「所有人共读、几乎不变」的数据。
 */

import { randomUUID } from 'node:crypto';
import { query } from './d1';

/** 一页多少条。前台翻页和后台列表共用。 */
export const FEEDBACK_PAGE_SIZE = 12;

/** 正文长度上限。前台提交和后台都没有富文本，纯文本卡个上限就够挡刷屏了。 */
export const FEEDBACK_MAX_LENGTH = 500;

/* ------------------------------------------------------------------ *
 * 列表缓存
 *
 * 为什么要有它：D1 的 REST 接口每查一次都是一次外部 API 调用（还带每日配额）。
 * 十个访客打开留言本、或者同一个人关掉再打开，没必要各打一次 D1。
 *
 * 边界（都要记住，别当成强一致）：
 *   - **只在单个服务实例内有效**。多实例部署时各自一份，命中率打折但不会出错。
 *   - **任何写入都会整份清空**（insertFeedback / setFeedbackResolved 末尾调
 *     invalidateFeedbackCache），所以「自己刚提交的立刻看得到」是成立的；
 *     但**别人**提交之后，你这边最多看到 TTL 之前的旧列表。
 *   - 进程重启 / dev 热更新即失效，不落盘、不跨实例。
 *
 * TTL 取 30 秒：够挡掉「一堆人同时打开」这种最费配额的情况，又不至于让
 * 「后台点了已解决、前台迟迟不变」变得明显。
 * ------------------------------------------------------------------ */
const LIST_CACHE_TTL = 30_000;

/** 缓存键 = `limit|cursor`，值是那一页的结果。 */
const listCache = new Map<string, { at: number; page: FeedbackPage }>();

/** 缓存条数上限。游标页的键各不相同，挡一下极端情况下的无界增长。 */
const LIST_CACHE_MAX = 64;

/** 清空列表缓存。**任何写入之后都要调**，否则前台会看到过期列表。 */
export function invalidateFeedbackCache(): void {
  listCache.clear();
}

/** DB 行（snake_case）。 */
export interface FeedbackRow {
  id: string;
  content: string;
  resolved: number;
  created_at: number;
}

/** 对外结构（camelCase，供 API / 前端）。 */
export interface Feedback {
  id: string;
  content: string;
  resolved: boolean;
  createdAt: number;
}

/** 一页结果。`nextCursor` 为 null 表示到底了。 */
export interface FeedbackPage {
  items: Feedback[];
  nextCursor: string | null;
}

function toFeedback(row: FeedbackRow): Feedback {
  return {
    id: row.id,
    content: row.content,
    resolved: row.resolved !== 0,
    createdAt: row.created_at,
  };
}

/** 游标 = `created_at:id`。id 是 UUID，里面不会有冒号，所以按**第一个**冒号切就够。 */
function encodeCursor(feedback: Feedback): string {
  return `${feedback.createdAt}:${feedback.id}`;
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
  if (!Number.isInteger(value) || !value || value < 1) return FEEDBACK_PAGE_SIZE;
  return Math.min(value, 50);
}

export async function listFeedback(
  options: { cursor?: string | null; limit?: number } = {}
): Promise<FeedbackPage> {
  const limit = clampLimit(options.limit);

  const cacheKey = `${limit}|${options.cursor ?? ''}`;
  const hit = listCache.get(cacheKey);
  if (hit && Date.now() - hit.at <= LIST_CACHE_TTL) return hit.page;

  const cursor = decodeCursor(options.cursor);

  /*
   * 多取一条：拿得到第 limit+1 条就说明后面还有，用它反过来推 nextCursor。
   * 比再发一条 COUNT 查询便宜，也不用把总数透给前台。
   */
  const rows = cursor
    ? await query<FeedbackRow>(
        `SELECT * FROM feedback
          WHERE (created_at < ?) OR (created_at = ? AND id < ?)
          ORDER BY created_at DESC, id DESC
          LIMIT ?`,
        [cursor.createdAt, cursor.createdAt, cursor.id, limit + 1]
      )
    : await query<FeedbackRow>(
        'SELECT * FROM feedback ORDER BY created_at DESC, id DESC LIMIT ?',
        [limit + 1]
      );

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(toFeedback);
  const last = items[items.length - 1];

  const page: FeedbackPage = { items, nextCursor: hasMore && last ? encodeCursor(last) : null };

  // 只缓存成功的结果 —— 失败的页不进缓存，前台点「重试」才会真的重发
  if (listCache.size >= LIST_CACHE_MAX) listCache.clear();
  listCache.set(cacheKey, { at: Date.now(), page });

  return page;
}

/** 提交一条。resolved 一律从 0 起 —— 新留言当然还没处理。 */
export async function insertFeedback(content: string): Promise<Feedback> {
  const id = randomUUID();
  const createdAt = Date.now();
  await query('INSERT INTO feedback (id, content, resolved, created_at) VALUES (?, ?, 0, ?)', [
    id,
    content,
    createdAt,
  ]);
  // 新留言会挤进第一页 —— 缓存里那份立刻就是错的
  invalidateFeedbackCache();
  return { id, content, resolved: false, createdAt };
}

/**
 * 改「已解决」标记。**返回这条在不在**，而不是静默成功。
 *
 * 之所以先查一次：D1 的 REST /query 只回结果行，不回影响行数，
 * UPDATE 打空了也看不出区别（和 games 的 updateGame 一样得先确认存在）。
 */
export async function setFeedbackResolved(id: string, resolved: boolean): Promise<boolean> {
  const rows = await query<{ id: string }>('SELECT id FROM feedback WHERE id = ?', [id]);
  if (!rows[0]) return false;
  await query('UPDATE feedback SET resolved = ? WHERE id = ?', [resolved ? 1 : 0, id]);
  // 列表里每条都带 resolved 标记，改一条就可能让任何一页变旧
  invalidateFeedbackCache();
  return true;
}
