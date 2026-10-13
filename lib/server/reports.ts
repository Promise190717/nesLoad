/*
 * 游戏问题反馈（game_reports 表）的读写。
 *
 * 结构上照 lib/server/feedback.ts 的套路（DB 行 snake_case / 对外 camelCase
 * 两套类型 + `toReport()` 映射，列表一律「新的在前」），但有三处**刻意不同**：
 *
 * ① **不带列表缓存**。留言本那份缓存是为「所有访客共读、点开就打一次 D1」准备的；
 *    这张表**只有后台会读**（一个管理员偶尔点进来一次），加缓存没有收益，
 *    反而多一份「刚标记完会不会看到旧值」的心智负担。
 *
 * ② **提交不需要登录**（同留言本）。详情页 `/games/<id>` 上根本没有登录入口，
 *    要求登录等于把这条路堵死。代价是查不出作者，只能靠长度上限 + 后台人工处理。
 *
 * ③ 每条都带一个 `game_title` **快照**。后台要一眼看出报的是哪一款；而且游戏下架
 *    （`game_id` 那行被删）之后这条记录仍然读得懂。所以**读取时不 JOIN games** ——
 *    和 user_saves 同一个理由（要看到「当时报的是什么」）。
 *
 * ⚠️ 翻页同样用**游标**而不是 offset，理由和留言本一样：列表是「新的在前」，
 *    offset 会让翻页期间的新数据把第二页顶出一份重复。游标要带上 id ——
 *    created_at 是毫秒时间戳，同一毫秒写入两条并不罕见（连点两次提交）。
 */

import { randomUUID } from 'node:crypto';
import { query } from './d1';

/** 一页多少条。 */
export const REPORT_PAGE_SIZE = 12;

/** 正文长度上限。纯文本、没有富文本，卡个上限就够挡刷屏了。 */
export const REPORT_MAX_LENGTH = 500;

/** DB 行（snake_case）。 */
export interface ReportRow {
  id: string;
  game_id: string;
  game_title: string;
  content: string;
  resolved: number;
  created_at: number;
}

/** 对外结构（camelCase，供 API）。 */
export interface GameReport {
  id: string;
  gameId: string;
  /** 提交那一刻的游戏名（快照，不是现查的） */
  gameTitle: string;
  content: string;
  resolved: boolean;
  createdAt: number;
}

/** 一页结果。`nextCursor` 为 null 表示到底了。 */
export interface ReportPage {
  items: GameReport[];
  nextCursor: string | null;
}

function toReport(row: ReportRow): GameReport {
  return {
    id: row.id,
    gameId: row.game_id,
    gameTitle: row.game_title,
    content: row.content,
    resolved: row.resolved !== 0,
    createdAt: row.created_at,
  };
}

/** 游标 = `created_at:id`。id 是 UUID，里面不会有冒号，按**第一个**冒号切就够。 */
function encodeCursor(report: GameReport): string {
  return `${report.createdAt}:${report.id}`;
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
  if (!Number.isInteger(value) || !value || value < 1) return REPORT_PAGE_SIZE;
  return Math.min(value, 50);
}

export async function listReports(
  options: { cursor?: string | null; limit?: number } = {}
): Promise<ReportPage> {
  const limit = clampLimit(options.limit);
  const cursor = decodeCursor(options.cursor);

  /*
   * 多取一条：拿得到第 limit+1 条就说明后面还有，用它反过来推 nextCursor。
   * 比再发一条 COUNT 查询便宜，也不用把总数透给前台。
   */
  const rows = cursor
    ? await query<ReportRow>(
        `SELECT * FROM game_reports
          WHERE (created_at < ?) OR (created_at = ? AND id < ?)
          ORDER BY created_at DESC, id DESC
          LIMIT ?`,
        [cursor.createdAt, cursor.createdAt, cursor.id, limit + 1]
      )
    : await query<ReportRow>(
        'SELECT * FROM game_reports ORDER BY created_at DESC, id DESC LIMIT ?',
        [limit + 1]
      );

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(toReport);
  const last = items[items.length - 1];

  return { items, nextCursor: hasMore && last ? encodeCursor(last) : null };
}

/**
 * 提交一条。`resolved` 一律从 0 起 —— 新报的当然还没处理。
 *
 * `gameTitle` 由调用方传（路由那边先 `getGame(id)` 确认这一款还在、顺手把名字带过来）
 * —— 数据层不再回查一次 games，那是两次查询。
 */
export async function insertReport(input: {
  gameId: string;
  gameTitle: string;
  content: string;
}): Promise<GameReport> {
  const id = randomUUID();
  const createdAt = Date.now();
  await query(
    'INSERT INTO game_reports (id, game_id, game_title, content, resolved, created_at) VALUES (?, ?, ?, ?, 0, ?)',
    [id, input.gameId, input.gameTitle, input.content, createdAt]
  );
  return {
    id,
    gameId: input.gameId,
    gameTitle: input.gameTitle,
    content: input.content,
    resolved: false,
    createdAt,
  };
}

/**
 * 改「已解决」标记。**返回这条在不在**，而不是静默成功。
 *
 * 之所以先查一次：D1 的 REST /query 只回结果行，不回影响行数，
 * UPDATE 打空了也看不出区别（同 feedback.setFeedbackResolved）。
 */
export async function setReportResolved(id: string, resolved: boolean): Promise<boolean> {
  const rows = await query<{ id: string }>('SELECT id FROM game_reports WHERE id = ?', [id]);
  if (!rows[0]) return false;
  await query('UPDATE game_reports SET resolved = ? WHERE id = ?', [resolved ? 1 : 0, id]);
  return true;
}
