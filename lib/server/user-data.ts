/*
 * 前台用户的「云端三件套」：历史记录 / 存档 / 收藏。
 *
 * 三块都是**只针对在线游戏库的游戏**（`game_id` 指向 games.id）——
 * 用户 2026-10-13 明确要求。本机拖进来的文件没有 id、也没有可重新下载的地址，
 * 一律不进这三张表。
 *
 * 结构上照 lib/server/feedback.ts 的套路：DB 行（snake_case）/ 对外结构（camelCase）
 * 两套类型 + `toXxx()` 映射，列表一律「新的在前」。
 *
 * ⚠️ **历史 / 收藏读的时候一律 JOIN games**，把已经下架的游戏过滤掉。
 *    这两张表里的 `game_id` 没有外键约束（D1 底下 SQLite 默认不校验，见 schema.sql 的注释），
 *    后台删了游戏就会留下孤儿行 —— JOIN 是最省事的兜底（也顺带保证返回给前端的
 *    封面 / 名字永远是**最新**的，而不是收藏那一刻的快照）。
 *
 * ⚠️ 2026-10-16 起**文案走 `game_texts` 侧表**（原来是 JOIN games 上那几列中英文案）：
 *    这里统一用 `lib/server/games.ts` 导出的 `loadGameTexts()` 批量捞，
 *    拼成「按语言索引的字典」交给前端 —— 形状与 `/api/games` 那条完全一致
 *    （`Game.texts`），前端用同一个 `localizeTexts` 挑语言，不必为这几条接口再写一套。
 *
 * 存档则相反：**故意不 JOIN**。存档是「当时那份状态」，游戏下架了那份存档仍然属于用户，
 * 只是他短期内点不开；把行删掉才是真的毁数据。所以存档列表读快照字段，
 * 即使游戏没了也列得出来（前端据此把条目置灰）。这一条和「收藏用 JOIN」是**有意的分歧**。
 */

import { randomUUID } from 'node:crypto';
import type { GameTexts } from '@/lib/game-text';
import { query } from './d1';
import { loadGameTexts } from './games';
import { deleteObject, uploadObject, publicUrl } from './r2';

/**
 * 每款游戏在云端保留的份数。
 *
 * ⚠️ **1**：每个游戏只保留最新一份即时存档 ——
 * 再存就是覆盖。以前是 5（快照槽位制，见 `lib/saves.ts` 的文件头），2026-10-15 随
 * 存档换制式一起收紧。
 *
 * 淘汰逻辑本身**留着不是装饰**：它会顺手清掉换制式之前留下的老快照行，连 R2 对象一起删。
 */
const SAVES_PER_GAME = 1;

/* ================================================================== *
 * 历史
 * ================================================================== */

/** 一个用户最多留多少条云端历史。和本地 lib/library.ts 的 MAX_CARTRIDGES 对齐。 */
export const MAX_HISTORY = 10;

/** DB 行（文案不在这张表上，由 `game_texts` 现取，见 `listUserHistory`）。 */
interface HistoryRow {
  game_id: string;
  image_url: string;
  rom_name: string;
  console_type: string;
  played_at: number;
}

/**
 * 对外结构 —— 前端直接拿去画「历史」那一列。
 *
 * 字段刻意和 `lib/library.ts` 的 `Cartridge` **对得上**（id / texts / romUrl / imageUrl /
 * romName / console + 一个时间戳）：`ConsoleScene` 的 `loadRemote` 收的是 `RemoteRom`，
 * 有了这份形状，从云端历史点一盘就能直接复用那条路径，不必再写一套载入逻辑。
 *
 * ⚠️ 文案是**按语言索引的字典**（`GameTexts`），和 `/api/games` 那条一致 ——
 *    前端拿 `localizeTexts(texts, locale)` 现挑一份。原来是 `name` + `nameEn` 两个平铺字段，
 *    2026-10-16 换掉：那样加语言又要加字段（正是侧表要解决的问题）。
 */
export interface UserHistoryItem {
  /** = game_id。沿用 Cartridge.id 的含义（在线库那个 id）。 */
  id: string;
  /** 游戏文案（JOIN game_texts 现取，不是 `user_history.title` 那个快照）。 */
  texts: GameTexts;
  /** 重新下载地址。和本地那份一样在这儿拼出来，历史里不存整串地址。 */
  romUrl: string;
  imageUrl: string;
  romName: string;
  console: string;
  /** 最近一次玩的时间 —— 列表上显示的就是它 */
  playedAt: number;
}

/**
 * 某人的云端历史，最近玩的在前。
 *
 * JOIN games 把下架的过滤掉（见文件头注释）；`romUrl` 由 game_id 现拼。
 * 上限 MAX_HISTORY 条 —— 和本地那份一样，是「最近玩过的 N 款」而不是全量流水。
 *
 * ⚠️ 标题**取 game_texts 现取**（不是 `user_history.title` 那个快照）——
 *    快照是写入时定的，英文站会看到中文名。
 * ⚠️ JOIN games 不能省：`game_texts` 的行会随游戏一起删（见 games.ts 的 deleteGame），
 *    没有这个 JOIN 的话，下架游戏的孤儿历史会变成一行**空标题**而不是被过滤掉。
 */
export async function listUserHistory(userId: string): Promise<UserHistoryItem[]> {
  const rows = await query<HistoryRow>(
    `SELECT h.game_id, h.image_url, h.rom_name, h.console_type, h.played_at
       FROM user_history h
       JOIN games g ON g.id = h.game_id
      WHERE h.user_id = ?
      ORDER BY h.played_at DESC
      LIMIT ?`,
    [userId, MAX_HISTORY]
  );

  const texts = await loadGameTexts(rows.map((row) => row.game_id));
  return rows.map((row) => ({
    id: row.game_id,
    texts: texts.get(row.game_id) ?? {},
    romUrl: `/api/games/${row.game_id}/rom`,
    imageUrl: row.image_url,
    romName: row.rom_name,
    console: row.console_type,
    playedAt: row.played_at,
  }));
}

export interface HistoryInput {
  gameId: string;
  title: string;
  imageUrl: string;
  romName: string;
  consoleType: string;
}

/**
 * 记一次游玩（**载入成功后调**，同本地 putCartridge 的时机）。
 *
 * 用的是 `INSERT ... ON CONFLICT(user_id, game_id) DO UPDATE`：
 * 同一款玩两次是更新 played_at（不是插两条），于是历史天然去重。
 * `created_at` 冲突时**不动**（保持第一次玩的时间）。
 *
 * ⚠️ 这里**不校验 game 是否存在**：调用方（`POST /api/user/history`）会先 `getGame(id)`
 * 确认这一款还在线 —— 那一步才是「只记在线库游戏」的闸，不该在这儿再查一遍
 * （那样每次写历史就是两次查询）。
 *
 * 写完顺手淘汰超出 MAX_HISTORY 的旧行 —— 不淘汰的话这张表会随游玩次数无限涨，
 * 而列表只读前 10 条，后面的永远看不到。
 */
export async function recordHistory(userId: string, input: HistoryInput): Promise<void> {
  const now = Date.now();
  await query(
    `INSERT INTO user_history
       (user_id, game_id, title, image_url, rom_name, console_type, played_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, game_id) DO UPDATE SET
       title        = excluded.title,
       image_url    = excluded.image_url,
       rom_name     = excluded.rom_name,
       console_type = excluded.console_type,
       played_at    = excluded.played_at`,
    [userId, input.gameId, input.title, input.imageUrl, input.romName, input.consoleType, now, now]
  );

  /*
   * 淘汰：留下最近 MAX_HISTORY 条，把更早的删掉。
   *
   * 一条语句搞定（不用先 SELECT 再 DELETE）—— SQLite 的子查询里能直接读同一张表，
   * 而且删除条件是「第 MAX_HISTORY+1 条起的所有行」，语义清楚。
   */
  await query(
    `DELETE FROM user_history
      WHERE user_id = ?
        AND game_id NOT IN (
          SELECT game_id FROM user_history
           WHERE user_id = ?
           ORDER BY played_at DESC
           LIMIT ?
        )`,
    [userId, userId, MAX_HISTORY]
  );
}

/** 清空某人的云端历史（前台的「清空」按钮）。 */
export async function clearUserHistory(userId: string): Promise<void> {
  await query('DELETE FROM user_history WHERE user_id = ?', [userId]);
}

/**
 * 删掉某人历史里的**一款**（个人中心那个历史 tab 的单条删除）。
 *
 * 返回是否真删到了 —— 不存在 / 不是他的回 false，调用方据此回 404。
 * 判定用 **`DELETE … RETURNING`**：删中了才回行，一条查询顶过去「先 SELECT 再
 * DELETE」两条（省一次 D1 API 往返，行数额度也省一半）。
 *
 * `game_id` 是复合主键的另一半，所以 DELETE 必须把 `user_id` 一起带上 ——
 * 否则「删某一款的历史」会删到全体用户（和归档那份「漏 WHERE user_id」是同一类坑）。
 */
export async function removeUserHistory(userId: string, gameId: string): Promise<boolean> {
  const rows = await query<{ game_id: string }>(
    'DELETE FROM user_history WHERE user_id = ? AND game_id = ? RETURNING game_id',
    [userId, gameId]
  );
  return rows.length > 0;
}

/* ================================================================== *
 * 存档
 * ================================================================== */

/**
 * 存档体积上限。定义搬到 `lib/save-limit.ts` 了（客户端发送前也要预检，两边必须同一个数），
 * 这里原样转出去，免得 `app/api/user/saves/route.ts` 跟着改 import。
 */
export { MAX_SAVE_BYTES } from '../save-limit';

/** 对外结构（列表只读元信息，本体按需另取）。 */
export interface UserSaveSlot {
  id: string;
  gameId: string;
  romName: string;
  title: string;
  size: number;
  createdAt: number;
}

interface SaveRow {
  id: string;
  user_id: string;
  game_id: string;
  rom_name: string;
  title: string;
  state_key: string;
  size: number;
  created_at: number;
}

function toSaveSlot(row: Omit<SaveRow, 'user_id' | 'state_key'>): UserSaveSlot {
  return {
    id: row.id,
    gameId: row.game_id,
    romName: row.rom_name,
    title: row.title,
    size: row.size,
    createdAt: row.created_at,
  };
}

/**
 * 某个 ROM 名下的云端存档槽，新的在前。
 *
 * ⚠️ **按 `rom_name` 分组而不是 game_id**：这和本地 lib/saves.ts 一致（那边索引就是 romName）。
 * 一个游戏换了 rom 文件（重新上传），名字不变就还是同一批槽 —— 对用户来说「同一款游戏的存档」
 * 本来就该在一起。
 *
 * **故意不 JOIN games**（见文件头注释）：游戏下架了存档也该列得出来。
 */
export async function listUserSaves(userId: string, romName: string): Promise<UserSaveSlot[]> {
  const rows = await query<SaveRow>(
    `SELECT id, user_id, game_id, rom_name, title, state_key, size, created_at
       FROM user_saves
      WHERE user_id = ? AND rom_name = ?
      ORDER BY created_at DESC, rowid DESC`,
    [userId, romName]
  );
  return rows.map(toSaveSlot);
}

/** 某人所有游戏的存档槽（后台「这个号存了多少」用，也方便前端做总览）。 */
export async function listAllUserSaves(userId: string): Promise<UserSaveSlot[]> {
  const rows = await query<SaveRow>(
    `SELECT id, user_id, game_id, rom_name, title, state_key, size, created_at
       FROM user_saves
      WHERE user_id = ?
      ORDER BY created_at DESC`,
    [userId]
  );
  return rows.map(toSaveSlot);
}

export interface SaveInput {
  gameId: string;
  romName: string;
  title: string;
  state: Uint8Array;
}

/**
 * 写一份云端存档：**先传 R2，再写 D1，最后淘汰超额的旧槽**（连 R2 对象一起删）。
 *
 * 顺序很要紧：
 *   ① 先 uploadObject —— 传失败了直接抛，D1 里不会留下一条指向不存在对象的记录；
 *   ② 再 INSERT 行；
 *   ③ 最后淘汰。淘汰时**必须同时删 R2 对象**，否则对象存储里会攒一堆孤儿
 *      （行没了就再也没人知道那些 key，连人工清理都无从下手）。
 *
 * 淘汰规则和本机 `lib/saves.ts` 完全一致：写完之后按时间倒序只留前 `SAVES_PER_GAME` 条
 * —— 也就是**一款只有一份**。两边的口径必须一致，否则用户会发现「本机覆盖了、云端还留着
 * 旧的那份」，读回来的进度和看到的对不上。
 */
export async function createUserSave(userId: string, input: SaveInput): Promise<UserSaveSlot> {
  const id = randomUUID();
  const createdAt = Date.now();
  const stateKey = `saves/${userId}/${id}`;

  await uploadObject(stateKey, input.state, 'application/octet-stream');
  await query(
    `INSERT INTO user_saves (id, user_id, game_id, rom_name, title, state_key, size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, input.gameId, input.romName, input.title, stateKey, input.state.byteLength, createdAt]
  );

  /*
   * 淘汰：留下最近 SAVES_PER_GAME 条，把更早的删掉（连 R2 对象一起清）。
   *
   * 一条 `DELETE … RETURNING` 搞定：删除条件是「同一 (user, romName) 下、
   * 不在最新 SAVES_PER_GAME 条里的那些行」，RETURNING 把 state_key 带回来，
   * 供下面删 R2 用。过去是「SELECT 淘汰名单 → 逐行 DELETE」＝ 1 + N 次查询，
   * 现在恒为 1 次。
   */
  const stale = await query<{ state_key: string }>(
    `DELETE FROM user_saves
      WHERE user_id = ? AND rom_name = ?
        AND id NOT IN (
          SELECT id FROM user_saves
           WHERE user_id = ? AND rom_name = ?
           ORDER BY created_at DESC, rowid DESC
           LIMIT ?
        )
      RETURNING state_key`,
    [userId, input.romName, userId, input.romName, SAVES_PER_GAME]
  );
  for (const row of stale) {
    // 尽力而为：R2 删失败不该让「存档已存下」这件事变成错误
    try {
      await deleteObject(row.state_key);
    } catch (error) {
      console.warn('[nesload] 淘汰旧存档时删 R2 对象失败：', row.state_key, error);
    }
  }

  return { id, gameId: input.gameId, romName: input.romName, title: input.title, size: input.state.byteLength, createdAt };
}

/**
 * 取出一份存档的**下载地址**（R2 公网 URL）。
 *
 * 走的不是「服务端回源代理」而是直接给 R2 地址：存档块只有几 MB，而且是**私有语义**
 * 的数据 —— 但 R2 那个 bucket 是公开读的（ROM 和图片都在同一个桶里，见 lib/server/r2.ts）。
 *
 * ⚠️ 这意味着**理论上知道 key 就能下载别人的存档**。key 是
 * `saves/<user_id>/<save_id>`，两段都是 UUID —— 猜不出来。但这是「靠不可猜」而不是
 * 「靠鉴权」，属于已知的取舍。真要收紧得走服务端代理 + 签名 URL（R2 支持预签名），
 * 那是另一件事；当前先按「无人可猜」处理，并在下面这个函数里**先确认这一份是这个人的**。
 *
 * 所以这个函数是「按 (userId, saveId) 查出这一份」——**不是**「给我 key 我就给地址」。
 * 调用方只能拿到属于自己那份，别人的 id 即使被猜到，也过不了 WHERE user_id = ? 这一关。
 */
export async function getUserSaveUrl(
  userId: string,
  saveId: string
): Promise<{ slot: UserSaveSlot; url: string } | null> {
  const rows = await query<SaveRow>(
    `SELECT id, user_id, game_id, rom_name, title, state_key, size, created_at
       FROM user_saves
      WHERE id = ? AND user_id = ?`,
    [saveId, userId]
  );
  const row = rows[0];
  if (!row) return null;
  return { slot: toSaveSlot(row), url: publicUrl(row.state_key) };
}

/**
 * 读一份存档的**字节**（服务端回源），给「不想让浏览器直连 R2」的路径用。
 *
 * 当前前台走的是上面那个直连 URL；留着这个是为了后台排查 ——
 * 也为了将来真把桶改成私有读时，前台只要换个接口就能接上。
 */
export async function readUserSaveBytes(userId: string, saveId: string): Promise<Uint8Array | null> {
  const found = await getUserSaveUrl(userId, saveId);
  if (!found) return null;
  const res = await fetch(found.url, { cache: 'no-store' });
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * 删一份存档（行 + R2 对象）。
 *
 * **返回删掉没有**：用 `DELETE … RETURNING` 判 —— 删中了才回行（D1 REST 不回
 * 影响行数，但 RETURNING 的行会进 results）。查不到就是「不是你的 / 不存在」，
 * 返回 false 让路由回 404。
 */
export async function removeUserSave(userId: string, saveId: string): Promise<boolean> {
  const rows = await query<{ state_key: string }>(
    'DELETE FROM user_saves WHERE id = ? AND user_id = ? RETURNING state_key',
    [saveId, userId]
  );
  const row = rows[0];
  if (!row) return false;

  try {
    await deleteObject(row.state_key);
  } catch (error) {
    // 行已经删了，用户那边就是「删成功了」。对象删不掉只是浪费空间，不该报错
    console.warn('[nesload] 删存档时清 R2 对象失败（行已删）：', row.state_key, error);
  }
  return true;
}

/** 清空某人的全部存档（连同 R2 对象）。封禁 / 删号时用。 */
export async function clearUserSaves(userId: string): Promise<number> {
  // DELETE … RETURNING：行删掉的同一瞬间把 state_key 带回来，一条查询顶过去两条
  const rows = await query<{ state_key: string }>(
    'DELETE FROM user_saves WHERE user_id = ? RETURNING state_key',
    [userId]
  );
  for (const row of rows) {
    try {
      await deleteObject(row.state_key);
    } catch (error) {
      console.warn('[nesload] 清理存档时删 R2 对象失败：', row.state_key, error);
    }
  }
  return rows.length;
}

/* ================================================================== *
 * 收藏
 * ================================================================== */

/**
 * 对外结构：收藏的就是**游戏本身**，所以字段和游戏列表那条一样。
 *
 * ⚠️ 文案是**按语言索引的字典**（`GameTexts`，和 `Game.texts` 同一个形状）：
 *    房间与个人中心里的语言是**运行时切的**，接口把库里有的语言全吐出来、
 *    由前端 `localizeTexts` 现挑（同 `/api/games`，见 lib/server/games.ts 文件头那段）。
 *    少带一份，英文站的收藏列表就会退成中文。
 */
export interface UserFavoriteItem {
  id: string;
  texts: GameTexts;
  imageUrl: string;
  romName: string;
  consoleType: string;
  language: string | null;
  year: number | null;
  /** 开发商外键 —— 卡片/详情要接上开发商页时用它（`texts` 里是厂名快照）。 */
  developerId: string | null;
  /** 收藏时间 —— 列表按它倒序 */
  favoritedAt: number;
}

/** DB 行（文案不在这张表上，由 `game_texts` 现取）。 */
interface FavoriteRow {
  id: string;
  image_url: string;
  rom_name: string;
  console_type: string;
  language: string | null;
  year: number | null;
  developer_id: string | null;
  created_at: number;
}

/**
 * 某人的收藏，最近收藏的在前。
 *
 * **JOIN games**：收藏列表要显示的就是游戏本身，快照没有意义（改了名字、换了封面
 * 都该跟着变）。顺带把下架的过滤掉 —— 收藏了一款、后来下架，列表里就不该再占一行。
 *
 * 文案与游戏列表走**同一条批量读取**（`loadGameTexts`）—— 收藏数是个位到几十的量级，
 * 一次 `WHERE game_id IN (…)` 就够，不必为它单独拼 JOIN。
 */
export async function listUserFavorites(userId: string): Promise<UserFavoriteItem[]> {
  const rows = await query<FavoriteRow>(
    `SELECT g.id, g.image_url, g.rom_name, g.console_type,
            g.language, g.year, g.developer_id,
            f.created_at
       FROM user_favorites f
       JOIN games g ON g.id = f.game_id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC`,
    [userId]
  );

  const texts = await loadGameTexts(rows.map((row) => row.id));
  return rows.map((row) => ({
    id: row.id,
    texts: texts.get(row.id) ?? {},
    imageUrl: row.image_url,
    romName: row.rom_name,
    consoleType: row.console_type,
    language: row.language,
    year: row.year,
    developerId: row.developer_id,
    favoritedAt: row.created_at,
  }));
}

/**
 * 某人收藏的 game_id 集合（含已下架的）。
 *
 * 单独给一份是因为**前台要拿它画星标**：`GameLibraryPanel` 里的卡片是不是收藏过，
 * 得有个 O(1) 的判据。列表接口还要带上全部字段，用来画「我的收藏」那个 tab ——
 * 两件事分开，各取所需。
 *
 * ⚠️ 这里**不 JOIN games**（和 listUserFavorites 刻意不同）：星标要看的是
 * 「我收过这款」，而不是「这款还在不在」。假如下架了就该不显示星标，那也用不着
 * 这份集合 —— 卡片本来就不会出现在列表里。留着这一行能让「下架又上架」恢复星标。
 */
export async function listUserFavoriteIds(userId: string): Promise<string[]> {
  const rows = await query<{ game_id: string }>(
    'SELECT game_id FROM user_favorites WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
  return rows.map((row) => row.game_id);
}

/**
 * 某款游戏**被多少人收藏了** —— 详情页那颗收藏钮上的数字（2026-10-13 用户要求）。
 *
 * ⚠️ **刻意不缓存**。这个数每次渲染详情页就要读一遍（D1 走 REST，一次就是一次 API
 *    调用），看着像该缓存；但：
 *    · 它只是 user_favorites 上一句 COUNT，表本身就小，且查询走 game_id 索引；
 *    · 缓存了就会「刚收藏完，自己那边数字没变」，比多一次查询更让人困惑
 *      （按钮上的数字是**乐观更新**的，见 FavoriteButton —— 它读的是这份初值）。
 *    真出现配额压力，正确的做法是在**页侧**套一层 `unstable_cache`（本项目一贯如此，
 *    见 MEMORY 里「缓存留在页-侧，不下沉数据层」那条），而不是在这儿藏一层。
 */
export async function countGameFavorites(gameId: string): Promise<number> {
  const rows = await query<{ n: number }>(
    'SELECT COUNT(*) AS n FROM user_favorites WHERE game_id = ?',
    [gameId]
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * 加收藏。已经在收藏里就是空操作（主键冲突被 DO NOTHING 吃掉）——
 * 重复点不该报错、也不该刷新收藏时间（那是「收藏时间」，不是「最后一次点星标的时间」）。
 *
 * 返回 true 表示这次真的加上了（先前没有）。要拿这个区分前端提示文案，
 * 但**别依赖它做正确性判断** —— 真正的状态一律以服务端这份表为准。
 *
 * ⚠️ 「真的加上了」怎么判断：`DO NOTHING RETURNING` —— **插入成功才回行**，
 * 冲突被吃掉时 results 是空的。一条查询顶过去「先 SELECT 再 INSERT」两条。
 */
export async function addUserFavorite(userId: string, gameId: string): Promise<boolean> {
  const rows = await query<{ game_id: string }>(
    `INSERT INTO user_favorites (user_id, game_id, created_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id, game_id) DO NOTHING
     RETURNING game_id`,
    [userId, gameId, Date.now()]
  );
  return rows.length > 0;
}

/**
 * 取消收藏。返回 true 表示真的删掉了一行
 * （`DELETE … RETURNING` 删中了才回行，一条查询顶过去两条）。
 */
export async function removeUserFavorite(userId: string, gameId: string): Promise<boolean> {
  const rows = await query<{ game_id: string }>(
    'DELETE FROM user_favorites WHERE user_id = ? AND game_id = ? RETURNING game_id',
    [userId, gameId]
  );
  return rows.length > 0;
}

/* ================================================================== *
 * 头像（2026-10-13 个人中心）
 * ================================================================== */

/**
 * 头像的大小上限（字节）。2 MB 足够一张 512×512 的图，也挡得住拿一张
 * 手机原图（十几 MB）来当头像的请求 —— 这玩意儿是**每次渲染都要拉**的，
 * 太大既费流量又拖慢个人中心。
 */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** 头像对象 key：`avatars/<user_id>/<random>`。 */
export function avatarKey(userId: string, ext: string): string {
  return `avatars/${userId}/${randomUUID()}${ext}`;
}

/** 上传头像本体。走的是和存档同一个 R2 封装。 */
export async function uploadAvatar(
  key: string,
  bytes: Uint8Array,
  contentType: string
): Promise<void> {
  await uploadObject(key, bytes, contentType);
}

/** 删一张头像（换头像 / 清头像 / 删号时用）。尽力而为，失败只记一条日志。 */
export async function removeAvatar(key: string | null): Promise<void> {
  if (!key) return;
  try {
    await deleteObject(key);
  } catch (error) {
    console.warn('[nesload] 删头像对象失败：', key, error);
  }
}

/* ================================================================== *
 * 汇总 / 清理
 * ================================================================== */

/** 某个用户三块数据各有多少条（后台列表那一行用）。 */
export async function countUserData(
  userId: string
): Promise<{ history: number; saves: number; favorites: number }> {
  /*
   * 三块合成一条查询：过去是三次独立的 COUNT = 三次 D1 API 往返；
   * 现在一条 SELECT 里三个标量子查询，读的行数一样，API 调用只剩一次。
   */
  const rows = await query<{ history: number; saves: number; favorites: number }>(
    `SELECT
       (SELECT COUNT(*) FROM user_history   WHERE user_id = ?) AS history,
       (SELECT COUNT(*) FROM user_saves     WHERE user_id = ?) AS saves,
       (SELECT COUNT(*) FROM user_favorites WHERE user_id = ?) AS favorites`,
    [userId, userId, userId]
  );
  const row = rows[0];
  return {
    history: Number(row?.history ?? 0),
    saves: Number(row?.saves ?? 0),
    favorites: Number(row?.favorites ?? 0),
  };
}

/**
 * 把某人的三块数据全清掉（**存档要连 R2 一起清**）。
 *
 * 给后台「删号」用。返回清掉了几条，方便后台给个准确的回执。
 * ⚠️ 最后一步删 app_users 那行由调用方做 —— 这个函数只管数据，不管账号，
 * 免得两件事耦合在一起（万一将来要「清数据但保留账号」，这里能直接用）。
 */
export async function purgeUserData(
  userId: string
): Promise<{ history: number; saves: number; favorites: number }> {
  const before = await countUserData(userId);
  // 存档要先删 R2（行删了就找不到 key 了）
  await clearUserSaves(userId);
  await query('DELETE FROM user_history WHERE user_id = ?', [userId]);
  await query('DELETE FROM user_favorites WHERE user_id = ?', [userId]);
  return before;
}

/**
 * 列某人**全部**游戏的云端存档（跨游戏总览，个人中心那个「存档」tab 用）。
 *
 * 和 `listAllUserSaves` 的区别：那个是按 user 查、字段是全的但**不带游戏信息**；
 * 这个是个人中心要画的东西 —— 加了 `JOIN games`（拿最新的封面 / 名字），
 * 且**只返回还在库里的**。
 *
 * ⚠️ 为什么这里**要 JOIN**、而 `listUserSaves`（游戏内那个存档列表）**故意不 JOIN**：
 *    两者的用途不同。游戏内读档时游戏一定在线（你正在玩它），JOIN 没有意义；
 *    而个人中心是**跨游戏总览**，列出来的每一款都要有封面和名字 ——
 *    下架的游戏在这儿点开也进不去，列着只会让用户困惑，所以过滤掉。
 *    这是有意的分歧，别为「统一」把两边改成一样。
 */
export interface UserSaveOverviewRow extends UserSaveSlot {
  /** 游戏封面（JOIN 现取，下架的不返回） */
  imageUrl: string;
  /**
   * 游戏文案（JOIN game_texts 现取，比槽位上那个 `title` 快照新）。
   * 个人中心按当前语言 `localizeTexts(texts, locale)` 挑一份。
   */
  texts: GameTexts;
  /** 机种，给封面角标用 */
  consoleType: string;
}

export async function listUserSaveOverview(userId: string): Promise<UserSaveOverviewRow[]> {
  const rows = await query<{
    id: string;
    game_id: string;
    rom_name: string;
    title: string;
    size: number;
    created_at: number;
    image_url: string;
    console_type: string;
  }>(
    `SELECT s.id, s.game_id, s.rom_name, s.title, s.size, s.created_at,
            g.image_url, g.console_type
       FROM user_saves s
       JOIN games g ON g.id = s.game_id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC`,
    [userId]
  );

  const texts = await loadGameTexts(rows.map((row) => row.game_id));
  return rows.map((row) => ({
    id: row.id,
    gameId: row.game_id,
    romName: row.rom_name,
    title: row.title,
    size: row.size,
    createdAt: row.created_at,
    imageUrl: row.image_url,
    texts: texts.get(row.game_id) ?? {},
    consoleType: row.console_type,
  }));
}

/** 清空某人**全部**云端存档（个人中心那个「清空存档」按钮）。返回删了几条。 */
export async function clearAllUserSaves(userId: string): Promise<number> {
  return clearUserSaves(userId);
}
