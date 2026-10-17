# ROM 下载兼容处理

完整 ROM 响应使用 `Cache-Control: public, max-age=3600, s-maxage=2592000`：浏览器缓存 1 小时，共享 CDN 缓存 30 天。Cloudflare 需为 `/api/games/*/rom` 配置 Eligible for cache，并尊重源站缓存头；若规则覆盖 Edge TTL，则将其设为 30 天（2592000 秒）。替换同一 URL 的 ROM 后需清除 CDN 缓存。范围响应继续使用 `private, no-store`。

`/api/games/[id]/rom` 继续优先读取数据库中的外部来源，来源不存在时读取本站 R2；此次修改不迁移文件或修改数据库记录。

外部来源首次请求沿用服务端 User-Agent。若上游返回普通 403，且没有 `Retry-After` 或 `cf-mitigated: challenge`，最多再尝试一次：使用项目现有的浏览器 User-Agent、上游站点 Referer，并在客户端未指定范围时请求 `Range: bytes=0-`。两次请求共享 25 秒的响应头等待预算。R2 自有来源不执行这个回退。

客户端单个字节范围请求会转发给上游，包括 `If-Range`。上游的 206、Content-Range、416 会正确传回；局部响应不会缓存成完整 ROM。内部 `bytes=0-` 请求只有覆盖整个文件时才转为普通 200 下载，防止把不完整的 ZIP 交给模拟器。

所有下载仍为流式传输，不把整个文件放入 Worker 内存。25 秒仅约束响应头到达时间，收到响应头后清除计时器；客户端取消请求时仍向上游传播取消信号。此前直接使用 `AbortSignal.timeout(25000)`，实际上还会在下载文件正文时触发超时。

HTML/JSON 等错误页面仍会拒绝；明确的浏览器挑战和限流响应不会触发兼容重试。日志记录上游状态、Ray ID 及 challenge 标记，保留 Retry-After。这个改动不保证绕过上游按 Worker 来源设置的防火墙规则，也不处理验证码或获取其他用户的验证 Cookie。

验证命令：`pnpm test:rom`、`pnpm typecheck`、`pnpm build`。测试包含模拟 403 回退、明确限流/挑战不重试、范围完整性、私有请求头不泄漏，以及响应头超时与慢速文件流的区别。真实源探测仅读取小段 ZIP 字节，不能代替部署后从 Cloudflare Worker 发起的完整下载验收。
