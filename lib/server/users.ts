/*
 * 后台用户（users 表）读写 + 口令哈希。
 *
 * 口令用 node:crypto 的 scrypt 加随机盐，存成 `salt:hash`。
 * 本文件依赖 node:crypto，只能在 Node runtime 的路由里用，不要在 middleware 里导入。
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { query } from './d1';

export interface UserRecord {
  id: string;
  username: string;
  password_hash: string;
}

/** 生成 `salt:hash`（均为 hex）。 */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(stored: string, plain: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const candidate = scryptSync(plain, salt, expected.length);
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export async function findUser(username: string): Promise<UserRecord | null> {
  const rows = await query<UserRecord>(
    'SELECT id, username, password_hash FROM users WHERE username = ?',
    [username]
  );
  return rows[0] ?? null;
}