/*
 * 上游站点（retrogamesnexus.com）的公共部分。
 *
 * 后台有两个接口要读它的页面：
 *   · /api/admin/scrape-game —— 单个游戏页 → 元数据 + 封面 / ROM 的地址
 *   · /api/admin/scrape-list —— 机种列表页 → 这一页有哪些游戏（slug）
 * 域名、语言前缀、UA、以及「上游字段 → 站内机种」的收敛都放这里 ——
 * 站点改了只改一处，别在两边各抄一份。
 *
 * ⚠️ 只读页面**文本**，不取任何文件字节（那是 fetch-image / fetch-rom 两个代理的事）。
 */

import type { ConsoleType } from '@/lib/emulator';

/**
 * 上游**域名根** —— 换域名只改这一处。
 *
 * ⚠️ 上游把 ROM 挂在**两个 host** 上，而且**不可互换**（2026-10-16 实测）：
 *   · 主站 `retrogamesnexus.com` —— 上游给**相对路径**的那批（NES 等）；
 *   · 文件子域 `files.retrogamesnexus.com` —— 上游给**绝对地址**的那批（NDS 等）。
 *   实测：`files.…/games/roms/kirby-squeak-squad.nds` → 206，主站同路径 → 404；
 *   反过来 `/games/roms/Contra.nes` 主站 → 206，files 同路径 → 404。
 *   所以库里存来源地址时必须**连 host 角色一起存**（见 toStoredSource）——
 *   只留 path 的话，换域名一拼就有一半文件 404。
 */
export const UPSTREAM_ROOT = 'retrogamesnexus.com';

/** 上游站点根（主站）。两个抓取接口都只认这个域名，别让它退化成「任意 URL 抓取器」。 */
export const UPSTREAM_SITE = `https://${UPSTREAM_ROOT}`;

/** ROM 文件子域 —— 上游给绝对地址时挂这里（见 UPSTREAM_ROOT 那段）。 */
export const UPSTREAM_FILES = `https://files.${UPSTREAM_ROOT}`;

/**
 * 上游认得的**页面语言前缀**；第一个是站内抓取时的缺省（见 scrape-game 的 parseTarget）。
 *
 * ⚠️ **2026-10-16 从 `['zh','en']` 扩到四个**：实测 `/ja/…` `/ko/…` 都是 200，
 *    而且页面里的**文案是真日韩文**，不是只把界面翻了：
 *      /zh/games/kirby-squeak-squad → 星之卡比 参上！多洛奇团
 *      /ja/games/kirby-squeak-squad → 星のカービィ 参上！ ドロッチェ団
 *      /ko/games/kirby-squeak-squad → 별의 커비 도트 투어
 *    （列表页 `/ja/nds-games` `/ko/nds-games` 同样 200。）
 *    所以爬取时**四个语言各抓一份**，把日韩也写进 `game_texts`（见 scrape-game）。
 *
 * ⚠️ **「第一个是缺省」说的是站内的选择，不是上游的规则**：上游真正无前缀的那个
 *    是**英文**（`/en/…` 会 307 到 `/…`，实测）。站内把 `zh` 排在首位是因为
 *    中文原文是必填的那一份（见 lib/server/games.ts 的 insertGame），
 *    只给一个 slug 时去抓中文页最省事。
 *
 * ⚠️ 这是**上游页面**的语言，与站内的 `ContentLocale`（lib/game-text.ts）是两回事 ——
 *    现在取值一样纯属巧合，别互相 import：上游哪天加个我们不认识的 `fr`，
 *    该动的是这里，不该把 `CONTENT_LOCALES` 也带上。
 */
export const UPSTREAM_LOCALES = ['zh', 'en', 'ja', 'ko'] as const;

/**
 * 抓页面时用的 UA。
 *
 * 默认的 node UA 有些站点会直接拒。实测上游对 `nesLoad-admin/1.0` 也放行，
 * 但页面本身是 Next SSR，保持一个像浏览器的 UA 更稳。
 */
export const UPSTREAM_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** 抓上游的一个页面（`path` 以 `/` 开头），返回 HTML。非 2xx 抛错。 */
export async function fetchUpstreamHtml(path: string): Promise<string> {
  const res = await fetch(`${UPSTREAM_SITE}${path}`, {
    headers: { 'user-agent': UPSTREAM_USER_AGENT, accept: 'text/html' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * 上游文字里出现某个**短标识**（`md` / `gg` / `ws` / `ngp`）时也算命中。
 *
 * 为什么不能直接用 `includes`：这几个只有两三个字母，子串匹配会误伤
 * （`md` 会命中 `cmd`、`ws` 会命中 `news`）。按整词边界匹配就没这个问题 ——
 * 上游的机种 slug 长这样：`/zh/sega-32x-games`，短横线（下面已被拍成空格）
 * 正好是边界。
 */
function hasToken(text: string, token: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`).test(text);
}

/**
 * 把上游的机种写法收敛成站内的 ConsoleType（2026-10-14 随机种扩到十二个）。
 *
 * 两处在用：JSON-LD 的 `gamePlatform`、以及列表页路径里的 `snes-games` 那一段。
 * 认不出返回 null —— 由调用方决定是留空还是兜底。
 *
 * ⚠️ **`scripts/fill-game-texts-ja-ko.mjs` 里有一份逐条一致的移植**（连同下面的
 *    `hasToken`）。那个脚本是 `.mjs`，import 不了这里的 TS + `@/` 别名，只能抄一份。
 *    **改这个函数就必须同步过去**，否则「后台爬取判定的机种」与「回填脚本判定的机种」
 *    会漂开。这件事**真发生过**：脚本那边一开始图省事写成
 *    `page.platform === games.console_type`（假定上游 `gamePlatform` 就是我们的短码），
 *    结果 `gameboy` / `sega-master-system` / `sega-game-gear` / `sega-32x` /
 *    `wonderswan` / `neogeo-pocket` 这六台**整段被误拒**（实测 250 款里 82 条）。
 *    短码恰好一致的只有 `nes` / `snes` / `gbc` / `gba` / `nds` / `arcade`。
 *
 * ⚠️ **这两处给的是同一套带连字符的 slug，不是可读名**（2026-10-14 实测）：
 *   `gameboy` / `sega` / `sega-game-gear` / `sega-master-system` / `sega-32x` /
 *   `neogeo-pocket` / `wonderswan` / `snes` / `nes` / `gbc` / `gba` / `arcade`。
 *   所以下面**先把 `-` / `_` 拍成空格**再匹配 —— 这样既认 slug，也照旧认
 *   "Super Nintendo" 那种可读名（同一套词表，不用维护两份）。
 *
 * ⚠️ **判断顺序是有讲究的，别按字母重排**：
 *   · `gba` / `gbc` 必须排在 `game boy` 之前（否则会被笼统的 `game boy` 吞掉）；
 *   · `snes`（super famicom）必须排在 `nes`（famicom）之前，同一个原因；
 *   · `32x` 必须排在 `genesis` / `mega drive` / `sega` 之前 —— 32X 的游戏页也写着世嘉；
 *   · `game gear` / `master system` 必须排在光秃秃的 `sega` 之前，同一个原因；
 *   · `neo geo pocket` 必须排在 `neo geo` 之前（口袋机是掌机，不是街机）。
 *
 * ℹ️ `sega` 单看认不出是哪台 —— 上游只拿它标**创世纪（MD）**：Game Gear /
 * Master System / 32X 各有自己的 slug（2026-10-14 各抽两款印证过）。所以它在
 * 世嘉那组里**垫底**兜成 `md`。
 *
 * ℹ️ 上游还有一批**我们跑不了**的机种（N64 / PlayStation / 土星 / Jaguar /
 * Sega CD / PC Engine CD / MSX2 —— 那个 WASM 构建里没编这些核心），一律返回 null。
 * `sega cd` / `sega saturn` 要**显式挡在 `sega` 那条之前**，否则会被兜成 MD。
 * 见 README「机种」一节。
 *
 * ⚠️ **NDS 2026-10-15 起能跑了**（本站自带 melonds 核心），所以它从上面那张
 *    「跑不了」的名单里挪出来了 —— 上游的 slug 是 `nds-games` / `nintendo-ds`。
 *    判断放在任天堂掌机那一组里（`ds` 是两字母，必须按整词匹配：`3ds` 里也藏着
 *    `ds`，用 `includes` 会把 3DS 也吃进来，而 3DS 我们跑不了）。
 *    ⚠️ 顺序：`nds` 要排在 `gb` / `gba` 那几条**之前或之后都行**（两者不重叠），
 *    但**必须在任何 `game boy` 兜底之前**不留隐患 —— 放在最上面那行最省心。
 */
export function toConsoleType(value: unknown): ConsoleType | null {
  const raw = String(value ?? '')
    .toLowerCase()
    .trim();
  if (!raw) return null;

  // slug → 可读名（`sega-game-gear` → `sega game gear`）；紧凑形用来兜 `gameboy` 这种连写
  const text = raw.replace(/[-_]+/g, ' ');
  const compact = text.replace(/\s+/g, '');

  // 我们跑不了的那几台：必须在 `sega` 兜底之前挡掉（见上面 ℹ️）
  if (text.includes('sega cd') || text.includes('sega saturn')) return null;
  // 3DS / 2DS 也跑不了 —— 必须在下面 `ds` 那条之前挡掉（`3ds` 里含 `ds`）
  if (text.includes('3ds') || text.includes('2ds')) return null;

  /*
   * NDS（2026-10-15 起支持）。上游写法：`nds` / `nintendo-ds` / `nintendo ds`。
   * ⚠️ `ds` 按整词匹配（见上面 ⚠️）；`nds` 三字母可以放心用 includes（`includes('nds')`
   *    不会误伤 —— 想不出哪个机种 slug 里顺带含 `nds`）。
   */
  if (compact.includes('nds') || text.includes('nintendo ds') || hasToken(text, 'ds')) {
    return 'nds';
  }

  // 任天堂掌机（长名在前，短代号在后 —— 见上面那条 ⚠️）
  if (compact.includes('gba') || compact.includes('gameboyadvance')) return 'gba';
  if (compact.includes('gbc') || compact.includes('gameboycolor')) return 'gbc';
  if (compact.includes('gameboy') || text.includes('game boy')) return 'gb';

  // 任天堂家用机
  if (text.includes('snes') || text.includes('super nintendo') || text.includes('super famicom'))
    return 'snes';
  /*
   * ⚠️ `nes` 必须**按整词**匹配，不能用 `includes`：`genesis` 里就藏着 `n-e-s`
   * （g-e-**n-e-s**-i-s），用子串匹配的话「sega-genesis-games」会被判成红白机。
   */
  if (hasToken(text, 'nes') || text.includes('famicom')) return 'nes';

  /*
   * 索尼（2026-10-16 起 PS1 能跑了）。
   *
   * ⚠️ **先把跑不了的那几台挡掉**，否则 `playstation 2` / `playstation portable` 会被
   *    下面那条 `includes('playstation')` 吞成 PS1 —— 和 `sega cd` 必须挡在 `sega` 之前
   *    是同一条规矩。上游目前只有 `/zh/playstation-games` 一个机种页（2026-10-16 核过
   *    sitemap），但这类站点随时会多开几页，而**猜错机种比认不出更难查**。
   */
  if (
    /playstation\s*(2|3|4|5|portable|vita)/.test(text) ||
    ['ps2', 'ps3', 'ps4', 'ps5', 'psp', 'vita'].some((token) => hasToken(text, token))
  ) {
    return null;
  }
  /*
   * PS1。上游写法：`playstation`（机种页 slug）/ `ps1` / `psx`。
   * ⚠️ 只能 `includes('playstation')` —— 它是一个整词，没有会撞车的子串；
   *    而 `ps1` / `psx` 短，必须按整词匹配（`hasToken`）。
   */
  if (text.includes('playstation') || hasToken(text, 'ps1') || hasToken(text, 'psx')) {
    return 'ps1';
  }

  // 世嘉：32X 在 MD 之前；光秃秃的 `sega` 排最后（Game Gear / Master System 也带 sega）
  if (hasToken(text, '32x')) return '32x';
  if (text.includes('genesis') || text.includes('mega drive') || hasToken(text, 'md')) return 'md';
  if (text.includes('game gear') || hasToken(text, 'gg')) return 'gg';
  if (text.includes('master system') || text.includes('mark iii') || hasToken(text, 'sms'))
    return 'sms';
  if (hasToken(text, 'sega')) return 'md';

  // 其它掌机：口袋机在「一般 neo geo」之前
  if (
    text.includes('neo geo pocket') ||
    text.includes('neogeo pocket') ||
    hasToken(text, 'ngpc') ||
    hasToken(text, 'ngp')
  ) {
    return 'ngp';
  }
  if (text.includes('wonderswan') || text.includes('wonder swan') || hasToken(text, 'ws'))
    return 'ws';

  // 街机垫底：`neo geo` 这类落在这一档（FBNeo 跑的就是 MVS / AES 那套 romset）
  if (
    text.includes('arcade') ||
    text.includes('mame') ||
    text.includes('fbneo') ||
    text.includes('neo geo') ||
    text.includes('neogeo') ||
    text.includes('cps')
  ) {
    return 'arcade';
  }

  return null;
}

/* ── 来源地址（2026-10-16）───────────────────────────────────────────────
 *
 * 后台爬取可以选「不保存 ROM」，这时库里只留一个**来源地址**，前台按它回源取。
 *
 * 存的是 `<host 角色>:<路径>`，**不含域名**：
 *   files:/games/roms/kirby-squeak-squad.nds
 *   site:/games/roms/Contra.nes
 * 域名整个抽到 UPSTREAM_ROOT（上面），换域名只改那一个常量 —— 但 host 角色必须留着，
 * 原因见 UPSTREAM_ROOT 那段（两个 host 不可互换）。
 */

/**
 * 把上游给的 ROM 地址收敛成站内存储形态。
 *
 * · 绝对地址 → 按 host 判角色（主站 = `site`，files 子域 = `files`）；
 * · 相对路径 → `site`（上游那批挂主站，见 scrape-game 里 romsFromHtml 的注释）。
 *
 * 认不出的域名 / 非法地址返回 null —— 调用方据此报错，别把任意 URL 塞进库。
 */
export function toStoredSource(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!text) return null;

  // 相对路径（上游 NES 那批的形态）
  if (text.startsWith('/')) return `site:${text}`;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase();
  // query 一起留着 —— 上游要是哪天挂签名地址，丢了它文件就取不到
  const path = `${url.pathname}${url.search}`;
  if (host === UPSTREAM_ROOT) return `site:${path}`;
  if (host === `files.${UPSTREAM_ROOT}`) return `files:${path}`;
  return null;
}

/**
 * `toStoredSource` 的逆运算：站内形态 → 可直取的绝对地址。认不出返回 null。
 * 前台 ROM 代理回源时用它（见 app/api/games/[id]/rom）。
 */
export function sourceFileUrl(stored: string | null | undefined): string | null {
  const text = (stored ?? '').trim();
  if (!text) return null;

  const at = text.indexOf(':');
  if (at === -1) return null;
  const host = text.slice(0, at);
  const path = text.slice(at + 1);
  if (!path.startsWith('/')) return null;

  if (host === 'site') return `${UPSTREAM_SITE}${path}`;
  if (host === 'files') return `${UPSTREAM_FILES}${path}`;
  return null;
}

/** 从站内形态的来源地址里取**原始文件名**（FBNeo 认它当驱动名）。取不到回退 `'rom'`。 */
export function sourceFileName(stored: string | null | undefined): string {
  const text = (stored ?? '').trim();
  if (!text) return 'rom';
  // query 不算文件名的一部分
  const path = text.slice(text.indexOf(':') + 1).split('?')[0];
  const tail = path.split('/').filter(Boolean).pop() ?? '';
  try {
    return decodeURIComponent(tail) || 'rom';
  } catch {
    return tail || 'rom';
  }
}
