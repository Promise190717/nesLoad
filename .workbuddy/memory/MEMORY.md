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

### 屏幕尺寸必须写死在 `.screen` 的 class 上（2026-10-10 踩过大坑）

`components/RetroTv.tsx` 里那个屏幕 div 的 `h-[540px] w-[720px]` **不能删、不能改成让
canvas 撑出尺寸**。canvas 是 .screen 里唯一在流里的孩子，一旦屏幕尺寸变成「由 canvas 决定」，
模拟器核心就会把它越撑越大：核心启动时先 `canvas.width=64` 探尺寸（发现 CSS 没锁死就把
clientWidth 写死回内联样式）、随后按 devicePixelRatio 把后备存储设成 720×dpr、Nostalgist 每次
launch 又把 canvas 的 CSS 复位成 100% —— 结果**每换一盘游戏机身就乘一次 dpr**（720→900→1125…），
100% 缩放的机器上看不出来，125%/150% 上必现「点第二款游戏整个游戏区域变大」。

同理：`lib/emulator.ts` 的 launch `size` 用 `SCREEN_WIDTH/SCREEN_HEIGHT`（720×540）常量，
**不要读 `canvas.width/height`** —— 那对属性会被核心改成 720×dpr，读回来等于把脏值烤进下一次。

尺寸链的实际值：屏幕 720×540（4:3）→ 内圈左右外边距 10（`mx-2.5`）→ **机身 740**。
文档（globals.css / i18n 的 `notice.desktopOnly` / README）里的 766 是屏幕还带 15px 外边距时的
旧数，2026-10-10 起实际是 740；900px 断点仍有余量，不用动。

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

## 操作入口：只有机身按钮，没有键盘快捷键（2026-10-10 定）

用户要求取消 `P` 暂停 / `R` 重置 / `F5` 存档 / `F8` 读档 四个全局快捷键 ——
**现在全站唯一的键盘操作是 `Esc`（关面板）**，暂停 / 存档 / 读档 / 重载一律走机身前面板
那排按钮。**别再往 ConsoleScene 的 keydown effect 里加操作类快捷键**：它们是看不见的操作，
按错的代价大（P 冻画面像卡死、F5 覆盖存档）。

- i18n 的 `legend.shortcut` 已删，原位置留了「别再补回来」的注释。
- 暂停提示在屏幕里（`RetroTv` 的 `paused` 层）：`PAUSED` + `PRESS RESUME ON THE PANEL`，
  文案跟着按钮的 `panel.resume` 走 —— 撤快捷键后**不能**再写「按 P」。

### 房主掉帧 = 整局变慢（2026-10-10）

**RetroArch 的 emscripten 主循环是 rAF 驱动、不跳帧的**（核心里 `_emscripten_set_main_loop_timing(1,1)`）：
一帧超过 16.7 ms 它不丢帧，而是整体跑慢 —— 表现是**平滑的「慢动作」**，而且**两端都会慢**
（加入者放的本来就是房主那串慢帧）。所以房主端任何额外开销都直接换成掉帧。

由此定下「出画质量」三档，**唯一出口是 `lib/netplay.ts` 的 `StreamQuality` + `QUALITY_SPEC`**：
`captureFpsFor()` 给 `createCaptureStream`（帧率是建流参数，**换档 = 重建整条流**）；
编码侧参数（`scaleResolutionDownBy` / `maxBitrate` / `degradationPreference`）由私有
`tuneStream()` 在 **addStream 之后 / onPeerJoin / refreshStream** 三处压上去。

- **`room.getPeers()` 能拿到 `RTCPeerConnection`**（`Record<string, RTCPeerConnection>`），
  从 `getSenders()` 按 track 反查就能 `setParameters` —— 这是改编码参数的**唯一口子**。
  `room.addStream()` 在 0.26 里返回 `Promise<void>[]`，**不给 sender**，别去那儿找。
- 默认档 `balanced` 会按 720 这条线压编码高度：画布后备存储是 **720×dpr**（125% = 900×675），
  而客人那块 `.screen` 只有 720×540 —— 多出来的像素他显示不出来，编了白编。
  **不做这件事才是 bug**，不是画质妥协。
- 三个档里**只有帧率**能减轻主线程负担；分辨率 / 码率减的是编码器线程。改不动时先降帧率。

## 部署相关

- 线上**建议配 `SITE_URL`**（服务端变量，不加 NEXT_PUBLIC_）。不配会退回从 Host 头推断 ——
  能用，但 Host 是客户端可控的。
- 本项目**不做 `output: 'export'`**：layout 读 cookie / Accept-Language 已是动态渲染。
- 部署平台见 `.workbuddy-ai/memory/REFERENCE.md`（Next 16 上 CF 要 `@opennextjs/cloudflare`）。

## 目录习惯

- `.workbuddy-ai/memory/` 是更早的工作记录（REFERENCE.md 里攒了很多实测结论，值得查）。
- 新记录写在 `.workbuddy/memory/YYYY-MM-DD.md`（日志，只追加）。
- 代码注释一律写「为什么这么做」，包括**否掉的方案**——这是本仓库的既有风格，跟着写。
