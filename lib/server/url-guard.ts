/*
 * 服务端代理「外链资源」时的通用防线。
 *
 * 后台有两处要把外链的字节取回服务端再转给浏览器（浏览器直接 fetch 会被 CORS 挡）：
 *   · /api/admin/fetch-image —— 从网页里拖过来的封面
 *   · /api/admin/fetch-rom   —— 「从链接自动填充」时抓下来的 ROM
 * 两者共用同一套地址校验：**只放行公网 http / https，挡掉内网与环回**（挡最朴素的那类
 * SSRF）—— 以及同一种错误响应格式。抽到这里是为了**只留一份黑名单**：
 * 抄成两份的话，改一处忘另一处就等于开了个洞。
 */

import { NextResponse } from 'next/server';

/** 明显指向本机 / 内网的名字，一律不放行。 */
const BLOCKED_HOST = /^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i;

/** 主机名是不是内网 / 环回地址（挡最朴素的那类 SSRF）。 */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, ''); // 去掉 IPv6 字面量的方括号
  if (BLOCKED_HOST.test(host)) return true;
  if (host === '::1' || host === '0.0.0.0') return true;

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 10 || a === 127) return true; // 10/8、127/8
  if (a === 169 && b === 254) return true; // 链路本地
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16-31/12
  return false;
}

/**
 * 解析并校验一个地址：只接受公网 http / https，其余（内网、环回、`file:`、`data:`…）
 * 一律返回 null。
 *
 * ⚠️ 调用方**跟着跳转走完之后要拿最终地址再核一次** —— 一次 302 就能绕开这道检查。
 */
export function parsePublicHttpUrl(value: unknown): URL | null {
  let url: URL;
  try {
    url = new URL(String(value ?? ''));
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (isPrivateHost(url.hostname)) return null;
  return url;
}

/**
 * 失败响应统一格式：`error` 是稳定的机器码，`detail` 是给人看的说明。
 * 后台界面直接显示 detail —— 光一句「请求失败」什么也说明不了。
 */
export function failJson(error: string, detail: string, status = 400) {
  return NextResponse.json({ error, detail }, { status });
}
