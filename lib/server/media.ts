/*
 * 图片地址的「**库里只存路径、域名现拼**」规则（2026-10-20）。
 *
 * ---------------------------------------------------------------------------
 * 为什么要这么改
 *
 * 在这之前，`games.image_url` / `consoles.image_url` / `developers.image_url` 里存的是
 * **上游的绝对地址**（`https://retrogamesnexus.com/images/games/cover/nes/contra.webp`），
 * 前台于是全部回源站取图 —— 源站一挂 / 一限流 / 一换域名，整站就只剩破图；
 * 而且别人家域名写死在自家库里，换 CDN 得全表刷一遍。
 *
 * 现在的约定：
 *   · **库里只存路径**（`/images/games/cover/nes/contra.webp`），域名一个字节都不存；
 *   · **渲染时现拼** `R2_PUBLIC_BASE`（`https://games.retrogamesonline.fun`）；
 *   · 图片字节在 R2 上，键就是路径去掉开头的 `/`
 *     （`images/games/cover/nes/contra.webp`）—— 和上游的目录结构**逐字对齐**，
 *     所以把上游那张图搬过来时路径不用换算，搬完就能用。
 *
 * ---------------------------------------------------------------------------
 * 三个函数各管一件事，别混用
 *
 *   · `mediaPath(stored)` —— **写库前**用。绝对地址 → 路径；已经是路径就原样。
 *   · `mediaUrl(stored)`  —— **渲染前**用。路径 → 绝对地址；已是绝对地址就原样（兼容旧值）。
 *   · `mediaKey(stored)`  —— **删 R2 对象前**用。路径 → 对象键（无前导 `/`、已解码）。
 *
 * ⚠️ 旧值兼容是**刻意**的：迁移可以分两步做（先上代码、后刷数据），这期间库里
 *    两种形态并存，`mediaUrl` 两种都认，页面不会有一秒钟的破图。
 *
 * ⚠️ 认不出的**外部域名**一律原样返回，不剥 —— 剥了就等于把别人的图搬到我们域名下，
 *    那是个 404。只有「本站 R2 域名」和「上游两个 host」算认得（见 KNOWN_ORIGINS）。
 *
 * ⚠️ 缺 `R2_PUBLIC_BASE` 时 `mediaUrl` **不抛**，退化成相对路径（见下面那段）——
 *    2026-10-19 那次事故就是「展示用的字段缺配置 → 整个接口 500」，别重演。
 */

/** 上游主站与文件子域（见 `./upstream.ts` 的 `UPSTREAM_ROOT`；这里刻意不 import，避免循环）。 */
const UPSTREAM_HOSTS = ['retrogamesnexus.com', 'files.retrogamesnexus.com'];

/** 本站 R2 公网域名的 host（`R2_PUBLIC_BASE` 可能带路径前缀，取 host 比较）。 */
function publicBase(): string | null {
  const raw = process.env.R2_PUBLIC_BASE?.trim();
  return raw ? raw.replace(/\/+$/, '') : null;
}

function knownHosts(): string[] {
  const hosts = [...UPSTREAM_HOSTS];
  const base = publicBase();
  if (base) {
    try {
      hosts.push(new URL(base).hostname.toLowerCase());
    } catch {
      /* 配错成非 URL 就只认上游那两个 */
    }
  }
  return hosts;
}

/** `decodeURIComponent` 的安全版：畸形转义原样返回，别为一个 `%` 把整页搞挂。 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** 逐段解码再编码 —— 库里存的可能是 `Super%20Nintendo.png`，也可能是 `Super Nintendo.png`。 */
function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(safeDecode(segment)))
    .join('/');
}

function isAbsolute(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * 库里该存的那一版：**只有路径**。
 *
 * 已经是路径（以 `/` 开头）或裸键（`images/…`）时补齐前导 `/` 后原样返回；
 * 绝对地址只在 host 认得时剥成路径，认不出就原样留着（见文件头那段 ⚠️）。
 *
 * 重载：传非空 string 时必回 string（上传后回写库那类调用点不用再 `??` 兜底）。
 */
export function mediaPath(stored: string): string;
export function mediaPath(stored: string | null | undefined): string | null;
export function mediaPath(stored: string | null | undefined): string | null {
  const text = (stored ?? '').trim();
  if (!text) return null;

  if (isAbsolute(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return text;
    }
    if (!knownHosts().includes(url.hostname.toLowerCase())) return text;
    // query 一起留着：真挂过签名地址的话，丢了它图就取不到
    return `${url.pathname}${url.search}`;
  }

  // 协议相对（`//host/path`）按外部地址处理，别把 host 当路径
  if (text.startsWith('//')) {
    try {
      const url = new URL(`https:${text}`);
      return knownHosts().includes(url.hostname.toLowerCase())
        ? `${url.pathname}${url.search}`
        : text;
    } catch {
      return text;
    }
  }

  return text.startsWith('/') ? text : `/${text}`;
}

/**
 * 渲染用的绝对地址。
 *
 * ⚠️ 缺 `R2_PUBLIC_BASE` 时**返回相对路径**而不是抛 / 返回 null：
 *    页面照常渲染，图会 404，但不会像 2026-10-19 那样把整条接口带走。
 *    拼不出域名的原因只有一个（环境变量少了），看一眼就知道。
 */
export function mediaUrl(stored: string | null | undefined): string | null {
  const path = mediaPath(stored);
  if (!path) return null;
  if (isAbsolute(path)) return path;

  const base = publicBase();
  if (!base) return path;
  return `${base}${encodePath(path)}`;
}

/**
 * R2 对象键（`deleteObject` 用）：路径去掉前导 `/`，逐段解码。
 *
 * 认不出的外部地址返回 null —— 那不是我们的对象，调用方据此跳过删除。
 */
export function mediaKey(stored: string | null | undefined): string | null {
  const path = mediaPath(stored);
  if (!path || isAbsolute(path) || path.startsWith('//')) return null;
  return path
    .replace(/^\/+/, '')
    .split('/')
    .map(safeDecode)
    .join('/');
}
