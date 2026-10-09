/*
 * 后台会话令牌的签名与校验。
 *
 * 令牌格式：base64url(JSON) + '.' + base64url(HMAC-SHA256(secret, base64url(JSON)))
 * 放在 HttpOnly Cookie 里。刻意不引第三方库（jose / next-auth）：需求只是「登录态」，
 * 自签自验足够，而且**必须**用 Web Crypto —— middleware 跑在 Edge runtime 拿不到 node:crypto。
 */

export const SESSION_COOKIE = 'nesload_admin';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

export interface SessionPayload {
  uid: string;
  username: string;
  exp: number; // 过期时间戳（ms）
}

function getSecret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error('未配置 SESSION_SECRET');
  return value;
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

export async function signSession(payload: SessionPayload): Promise<string> {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${body}.${await sign(body)}`;
}

/** 校验令牌：签名不对、格式不对、或已过期都返回 null。 */
export async function verifySession(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = await sign(body);

  // 长度不等直接判负，再逐字符异或比较，避免时序侧信道
  if (provided.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}