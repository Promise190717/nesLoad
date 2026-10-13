/*
 * 前台用户会话令牌的签名与校验。
 *
 * ⚠️ **和后台那套（lib/server/session.ts）是刻意分开的两份**，尽管算法一模一样。
 *    分开的理由是安全：「复用同一份」意味着前台用户拿到的令牌能被后台守卫验过 ——
 *    也就是任何注册用户都能进后台。所以：
 *      · cookie 名不同（`nesload_user` vs `nesload_admin`）
 *      · 令牌里多一个 `scope: 'user'` 字段，后台守卫靠它把前台令牌挡在外面
 *      · 密钥在 SESSION_SECRET 之外可以再叠加一层前缀（见 getSecret）
 *    这三条独立生效，任何一条漏了都还有另外两条兜着。
 *
 * 算法刻意和后台那份**逐字一致**（base64url(JSON) + '.' + base64url(HMAC-SHA256)）：
 * 一套自签自验的令牌格式，两处用。但**不要**为了「去重」把两份合成一份 ——
 * 那等于把 scope 这个隔离层删掉（见上面）。
 *
 * 为什么必须用 Web Crypto 而不是 node:crypto：本文件有可能被 middleware 引用
 * （当前没有，但 guard 那套随时可能搬到 middleware 里去），Edge runtime 拿不到 node:crypto。
 */

export const USER_SESSION_COOKIE = 'nesload_user';

/** 前台会话有效期。和后台一样 7 天 —— 前台用户比管理员更需要「一直登着」。 */
export const USER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 令牌作用域标记。
 *
 * **加这一个是关键**：后台守卫（assertAdmin）验完签名之后还会查 `scope`，
 * 没有它就是一张前台令牌、一律拒。反过来前台守卫也查它 —— 两边互相不认。
 * 少了这个字段，两套令牌的签名是同一个算法、同一个密钥，就等价于一份令牌。
 */
export type UserSessionScope = 'user';

export interface UserSessionPayload {
  /** 作用域。恒为 'user' —— 后台守卫靠它区分。 */
  scope: UserSessionScope;
  uid: string;
  username: string;
  exp: number; // 过期时间戳（ms）
}

function getSecret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error('未配置 SESSION_SECRET');
  /*
   * 在密钥上再叠一个用途前缀。
   *
   * 这样即使有人把 scope 字段从 payload 里拿掉，前台密钥签出来的令牌和后密钥签出来的
   * 也**不是**同一串 —— 两道锁是独立的。前缀本身就是常量，不是秘密。
   */
  return `user:${value}`;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '==='.slice((base64.length + 3) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function sign(data: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(),
    new TextEncoder().encode(data)
  );
  return toBase64Url(new Uint8Array(signature));
}

export async function signUserSession(
  payload: Omit<UserSessionPayload, 'scope'>
): Promise<string> {
  const body = toBase64Url(
    new TextEncoder().encode(JSON.stringify({ scope: 'user', ...payload }))
  );
  return `${body}.${await sign(body)}`;
}

/** 校验令牌：签名不对、格式不对、scope 不对、或已过期都返回 null。 */
export async function verifyUserSession(
  token: string | undefined | null
): Promise<UserSessionPayload | null> {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = await sign(body);

  // 长度不等直接判负，再逐字符异或比较，避免时序侧信道（同后台那份）
  if (provided.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return null;

  try {
    const payload = JSON.parse(decodeBody(body)) as UserSessionPayload;
    // scope 必须明写 'user' —— 后台那套令牌里没有这个字段，到这儿就被挡下
    if (payload.scope !== 'user') return null;
    if (typeof payload.uid !== 'string' || !payload.uid) return null;
    if (typeof payload.username !== 'string') return null;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function decodeBody(body: string): string {
  return new TextDecoder().decode(fromBase64Url(body));
}
