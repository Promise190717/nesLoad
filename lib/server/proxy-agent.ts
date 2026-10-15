/*
 * 一个**极简的 HTTP CONNECT 代理 Agent**，只服务 R2 上传那条路。
 *
 * ## 为什么手写而不是装 `proxy-agent`
 *
 * `proxy-agent`（及其 `https-proxy-agent` / `socks-proxy-agent` / `pac-proxy-agent`
 * 一整串）能自动按 URL 选协议，是本项目唯一需要它的场合就是「R2 上传走本机 7897 端口」。
 * 而那个端口是 Clash / Mihomo 的**混合端口**，说的就是最标准的 `HTTP CONNECT`。
 * 为这一条路引五个包、还要动 lockfile，不划算 —— 这里 60 行就够，且**零依赖**。
 *
 * ## 它做什么
 *
 * Node 的 `http.Agent` / `https.Agent` 默认直连目标。要让它走代理，得覆写
 * `createConnection`（对 http）与 `createConnection` + `defaultPort`（对 https）——
 * 本质上就是：连到**代理**，发一个 `CONNECT host:port HTTP/1.1`，等 `200`，
 * 然后把这条 socket 原样交给上层当「已经连上目标的连接」。
 *
 * ⚠️ 只认 `http://` 的代理地址（Clash 的混合端口就是 http scheme，哪怕目标要 https ——
 *    区别只在 CONNECT 之后跑的是不是 TLS，那是上层 socket 自己加的）。
 *    `socks5://` / `https://` 一律**裸抛错**，别静默退化成直连
 *    —— 那样用户会以为配了代理、其实一点没走，是最难查的一种失败。
 *
 * ⚠️ 不做代理认证（`Proxy-Authorization`）：本机 Clash 端口不需要，
 *    需要的话这里要再补一段 base64 —— 到时候再说。
 */

import net from 'node:net';
import type { Agent as HttpAgent } from 'node:http';
import type { Agent as HttpsAgent } from 'node:https';

/** 解析出来一个代理地址；认不出返回 null（调用方据此走直连）。 */
export interface ProxyTarget {
  host: string;
  port: number;
}

/**
 * 把 `R2_PROXY` 那种值解析成 `{ host, port }`。
 *
 * 接受的形态：
 *   · `http://127.0.0.1:7897`（推荐，写全）
 *   · `127.0.0.1:7897`（没协议也认，默认按 http 处理）
 * 认不出 / 不是 http(s) → 返回 null，调用方**不要**配代理。
 */
export function parseProxyUrl(raw: string | undefined | null): ProxyTarget | null {
  const text = (raw ?? '').trim();
  if (!text) return null;

  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `http://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const port = url.port ? Number.parseInt(url.port, 10) : url.protocol === 'https:' ? 443 : 80;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;

  return { host: url.hostname, port };
}

/**
 * 把代理地址挂到**任意** Node Agent 实例上（http.Agent / https.Agent 共用这段逻辑）。
 *
 * 做法是**运行期打补丁**而不是子类化：调用方（`lib/server/r2.ts`）拿到的是
 * `new http.Agent(...)` 造好的实例，直接换成走隧道的 `createConnection` 最省事
 * —— 子类化要另开一个 class，还得为 http / https 各写一份。
 *
 * 返回同一个 agent（方便链式写法）。
 */
export function withProxy<T extends HttpAgent | HttpsAgent>(agent: T, target: ProxyTarget): T {
  /** 走隧道连出真正的 socket：先连代理，再 CONNECT，再把它交回去。 */
  const createConnection = (
    options: Record<string, unknown>,
    callback: (err: Error | null, socket: net.Socket | null) => void
  ): net.Socket | null => {
    const host = String(options.host ?? '');
    const port = Number(options.port ?? 0);
    if (!host || !port) {
      callback(new Error('代理连接缺 host / port'), null);
      return null;
    }

    const socket = net.connect({ host: target.host, port: target.port });
    socket.setKeepAlive(true, 30_000);
    /* 建隧道之前写出去的字节先攒着 —— CONNECT 握手期间的写必须延后 */
    socket.once('connect', () => {
      let head = '';
      const onData = (chunk: Buffer) => {
        head += chunk.toString('latin1');
        // 响应头以 \r\n\r\n 结尾；还没攒全就继续等
        if (!head.includes('\r\n\r\n')) return;
        socket.off('data', onData);

        const statusLine = head.split('\r\n', 1)[0];
        if (!/^HTTP\/1\.[01] 2\d\d/.test(statusLine)) {
          socket.destroy();
          callback(new Error(`代理拒绝隧道：${statusLine}`), null);
          return;
        }
        // 握手响应里任何「多余字节」都算协议错误（我们只发 CONNECT，不该有 body）
        const rest = head.slice(head.indexOf('\r\n\r\n') + 4);
        if (rest.length > 0) socket.unshift(Buffer.from(rest, 'latin1'));

        socket.off('error', onError);
        callback(null, socket);
      };
      const onError = (error: Error) => {
        socket.off('data', onData);
        callback(error, null);
      };

      socket.on('data', onData);
      socket.on('error', onError);
      socket.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`);
    });
    socket.once('error', (error) => callback(error, null));

    return socket;
  };

  // 两种 agent 的 createConnection 签名一致，逐个替换
  (agent as unknown as { createConnection: unknown }).createConnection = createConnection;
  return agent;
}
