# nesLoad — 项目长期记忆

## 站名

对外的**站名**是 **复古游戏屋**（英文界面下用 `Retro Game House`，用户 2026-10-10 定）。
唯一来源：`lib/i18n.ts` 的 `SITE_NAME: Record<Locale, string>`。
文案里要用站名就写 `{site}` 占位（translate 会替换；客户端的 `t` 已统一注入）。
**别再手写站名**，也别把它塞回 lib/site.ts。

⚠️ 下面这些**不是**站名，是内部标识符，改了会让老用户数据 / 联机房间失联，**不要动**：
`package.json` 的 `name: nesload`、localStorage / IndexedDB 的 `nesload:*` 键、
`nesload_locale` / `nesload_admin` cookie、`lib/netplay.ts` 的 `APP_ID`。
（仓库名仍叫 nesLoad，README 标题也是它。）

## 站点定位（用户 2026-10-10 明确，写文案的基调）

**主要用途是玩复古游戏**：NES / SFC / 街机。
有**在线游戏库**（后台录入、Cloudflare R2 + D1），**自己的 ROM 文件也能拖进来跑**。
写任何对外文案（SEO、README、分享图）都按这个来 —— 不要写成「卡带加载器」这种偏工具味的说法。

## 界面

一间极简像素风房间 + 一台电视机。**没有正文**，所有说明走浮层面板，屏幕里只有英文像素字
（font-pixel 无汉字）。主题 / 灯 / 季节 / 简洁模式四个属性由 `<html>` 上的 data-* 控制，
首屏靠 app/layout.tsx 里的内联脚本 BOOT_INIT 落地。

## SEO 层（2026-10-10 建，别随手改回去）

| 位置 | 管什么 |
| --- | --- |
| `lib/site.ts` | `SITE_NAME` + `resolveSiteOrigin()`，**站点源的唯一出口**（四处共用） |
| `app/layout.tsx` | 全站 metadata、`viewport`、JSON-LD（`buildJsonLd`） |
| `app/robots.ts` / `app/sitemap.ts` | 爬虫文件，**必须 `force-dynamic`** |
| `app/opengraph-image.tsx` / `app/twitter-image.tsx` → `lib/og-image.tsx` | 1200×630 分享图，现场画 |
| `app/admin/layout.tsx` | 后台整棵子树 noindex |
| `components/ConsoleScene.tsx` 的 `sr-only` 段 | 页面唯一可索引的正文（h1 + 两句） |
| `lib/i18n.ts` 的 `meta.*` / `seo.*` | SEO 文案，中英各一份 |

几条踩过点、**别改回去**的约定：

1. **`lib/site.ts` 里的 `await headers()` 不包 try/catch** —— 包了会吞掉 Next 的
   DynamicServerError，robots/sitemap 会被预渲染并永久烤上 `http://localhost:3000`。
2. **没有 hreflang**。本站无分语言 URL（语言靠 cookie），同址多 hreflang 是无效标注。
3. **og:image 不写进 metadata**，交给 `opengraph-image.tsx` 文件约定，手写会打架。
4. **分享图不用像素字体、只有英文**（Satori 拿不到页面 CSS 字体；默认字体无汉字）。
5. **不做 manifest / apple-touch-icon**：房间是桌面端专用（notice.desktopOnly，900px 起）。
6. `sr-only` 那段**别改成可见、也别堆关键词**（前者毁设计，后者算作弊）。

## 联机与键位（2026-10-10 定）

- 联机 wire 上**只传钮名**（`ButtonMessage {b,d}`），不传物理键。加入者按哪几个键
  纯属本机私事，房主不知道也不需要知道 —— 所以「游戏里的号位」和「手上按哪几个键」是解耦的。
- **加入者按的是 1P 那组键**（`ConsoleScene` 转发 effect 里 `codeToButton(bindings.p1)`）。
  他在游戏里是 2P，但键位用 1P 那套（那才是他配惯的）。**别改回 p2。**
- 键位面板在房间里两种角色都锁 **1P 那组**，标签写「你的键位」（`keybind.mine`）——
  写「玩家 1」加入者会读成「那是房主的键」。2P 那组只服务单机双人共用一块键盘。
- 房主 P1/P2 不许撞键那条校验**必须留着**：注入合成的是真键盘事件，同一个 code 会同时驱动两个玩家。
- 文案里**不要列键位**（写死的默认值迟早说假话），键位一律由 `playerLegend()` 现算。

## 部署相关

- 线上**建议配 `SITE_URL`**（服务端变量，不加 NEXT_PUBLIC_）。不配会退回从 Host 头推断 ——
  能用，但 Host 是客户端可控的。
- 本项目**不做 `output: 'export'`**：layout 读 cookie / Accept-Language 已是动态渲染。
- 部署平台见 `.workbuddy-ai/memory/REFERENCE.md`（Next 16 上 CF 要 `@opennextjs/cloudflare`）。

## 目录习惯

- `.workbuddy-ai/memory/` 是更早的工作记录（REFERENCE.md 里攒了很多实测结论，值得查）。
- 新记录写在 `.workbuddy/memory/YYYY-MM-DD.md`（日志，只追加）。
- 代码注释一律写「为什么这么做」，包括**否掉的方案**——这是本仓库的既有风格，跟着写。
