'use client';

import { Nostalgist } from 'nostalgist';
import { resolveArcadeCore } from './arcade-core';
import { installAudioTap, trackEmulatorAudio } from './audio-tap';
import { releaseEmulatorRuntime, trackCanvasRuntime, trackRuntimeListeners, type EmulatorRuntime } from './emulator-runtime';
import { NEOGEO_BIOS_NAME } from './bios';
import { downloadFile } from './download';
import { captureEjsState, restoreEjsState } from './emulator-state';
import {
  ALL_BUTTONS,
  bindingsToRetroArch,
  DEFAULT_BINDINGS,
  type ButtonName,
  type KeyBindings,
  type PlayerBindings,
} from './keybindings';
import { unwrapRom } from './unwrap';

/*
 * 音频旁路要赶在核心启动之前装好 —— 核心一启动就会建 AudioContext 并把音频节点
 * 接到 destination 上，晚了就截不到那一次 connect。
 * 放在模块顶层就够了：这里是唯一会 launch 的地方，而且补丁本身是惰性的
 * （没有节点往 destination 连过就什么都不做）；服务端没有 AudioNode，会直接返回。
 */
installAudioTap();

/**
 * 站内机种枚举。**加了机种要同步的地方**列在 `lib/consoles.ts` 顶部那张清单里。
 *
 * 2026-10-14 从四个扩到十二个：GB / GBC / MD / GG / SMS / 32X / WonderSwan /
 * Neo Geo Pocket。挑的都是「核心在我们用的那个 WASM 构建里现成有」的机种 ——
 * 做法、以及为什么 N64 / 土星 / Jaguar 上不了（那个构建里根本没编），
 * 记在 `README.md` 的「机种」一节。
 *
 * ⚠️ 2026-10-15 又加了 NDS（melonds）。⚠️ **它和上面那批不是一回事**：
 *    那个 `arianrhodsandlot/retroarch-emscripten-build` 构建里**没有** melonds，
 *    `public/cores/` 下现在那对 `melonds_libretro.js` / `.wasm` 是从 EmulatorJS
 *    的 `melonds-wasm.data` 里解出来的（那是个 7z 壳）。胶水形态和本站其它核心不同，
 *    启动时那套 `globalThis.__NESL_*` 补丁是照着 32X 那份的做法打的。
 *    ⚠️ **换 / 重传这对文件时别再当成「从 jsdelivr 拿现成 zip」**，详见
 *    `.workbuddy-ai/memory/analysis-nds-retrogamesnexus.md`。
 */
export type ConsoleType =
  | 'nes'
  | 'snes'
  | 'gb'
  | 'gbc'
  | 'gba'
  | 'nds'
  | 'md'
  | 'gg'
  | 'sms'
  | '32x'
  | 'ws'
  | 'ngp'
  | 'arcade';

export interface LoadedRom {
  name: string;
  console: ConsoleType;
  size: number;
}

/**
 * 机种识别失败。
 * 这里只带错误码、不带成品文案 —— 文案由界面层按当前语言翻译，
 * 否则中文串会被写死在引擎层，切到英文时仍显示中文。
 */
export class UnsupportedRomError extends Error {
  constructor() {
    super('unsupported-rom');
    this.name = 'UnsupportedRomError';
  }
}

/**
 * 机种 → libretro 核心名。核心由 Nostalgist 从它自己的 CDN 拉
 * （`arianrhodsandlot/retroarch-emscripten-build@v1.22.2`），拉过一次之后进 CacheStorage。
 *
 * 街机实际用哪个核心**不在这里定** —— `loadRom` 会先跑 `resolveArcadeCore()`
 * （见 `lib/arcade-core.ts`），在 `fbneo` 和 `fbalpha2012_cps1` 之间按 romset 内容挑。
 * 这里的 `'fbneo'` 只是**兜底默认值**。
 *
 * 为什么是这两个：fbneo 一套 romset 覆盖 CPS1 / CPS2 / Neo Geo / 大量 8-16 位基板；
 * 但它的 CPS1 romset 比老 FBA 改过名，还砍掉了一批 hack 驱动 —— 那些只有
 * `fbalpha2012_cps1`（FBA 0.2.97.42）认。两个核心都放在 `public/cores/`。
 *
 * ⚠️ 两个核心的 romset 都是**版本锁死**的：zip 里的文件必须和核心期望的版本对得上，
 * 对不上就直接不加载（表现和「格式不支持」一样是静默的）。这不是这个项目能绕开的。
 *
 * GBA 用 `mgba`：和街机一样**走本站 `public/cores/`**（见 `coreSource`）。
 *
 * ⚠️ 更正（2026-10-13）：这里原先写的是「Nostalgist 自带的 CDN 清单里没有 mgba」——
 * **不成立**。Nostalgist 的核心解析根本没有清单，它只是把核心名拼进
 * `${coreRepo}@${coreVersion}/retroarch/<core>_libretro.zip`（见 nostalgist.js 的
 * `extractCore`），而 `mgba_libretro.zip` 在那个仓库里**是有的**（实测 200、1.15 MB，
 * 解出来就是 `mgba_libretro.js` + `.wasm`）；`coreInfoMap` 里也收录了 `mgba`
 * （corename `mGBA`、`savestate: true`，所以存档能用）。
 *
 * 真正走本地的理由和街机**是同一条**：jsdelivr 在国内经常连不上或被限速
 * （完整因果见下面 `LOCAL_CORE_DIR`）。核心文件同样取自
 * `arianrhodsandlot/retroarch-emscripten-build@v1.22.2` 构建
 * （`retroarch/mgba_libretro.zip`）。
 *
 * ⚠️ 这个文件当时**漏放了**（`public/cores/` 里只有 fbneo / fbalpha2012_cps1），
 * 表现是 GBA 一拖进去 `Nostalgist.launch` 就抛错 —— 因为 `/cores/mgba_libretro.js`
 * 是 404，Next 把 404 页面当核心 js 喂给了核心加载器。加新核心时记得两边一起放。
 */
const CORE_MAP: Record<ConsoleType, string> = {
  nes: 'fceumm',
  snes: 'snes9x',
  /*
   * GB / GBC 也用 `mgba`：mGBA 本来就是「GBA + GB + GBC 三合一」的核心，
   * Nostalgist 自己的 `systemCoreMap` 里 `gb` / `gbc` / `gba` 三个键**都指向 mgba**
   * （见 node_modules/nostalgist/dist/nostalgist.js 的 systemCoreMap）。
   * 所以扩这两台**不需要任何新核心文件** —— 它是这批机种里最便宜的一档。
   */
  gb: 'mgba',
  gbc: 'mgba',
  gba: 'mgba',
  /*
   * NDS 走 `melonds`（Nostalgist 的 systemCoreMap 里 `nds` 就指向它）。
   *
   * ⚠️ 和上面那批**来源不同**：那个 `retroarch-emscripten-build@v1.22.2` 里没有
   *    melonds，`public/cores/melonds_libretro.{js,wasm}` 是从 EmulatorJS 的
   *    `melonds-wasm.data`（7z 壳）里解出来的。见 `ConsoleType` 上面那段注释。
   *
   * ⚠️ NDS 是**双屏**（上屏 256×192、下屏 256×192，竖排 256×384），
   *    和这里 `SCREEN_WIDTH / SCREEN_HEIGHT` 那个 4:3 基准不是一回事。
   *    melonds 的核心会自己按 canvas 尺寸摆两屏，所以基准值先照旧用 720×540 ——
   *    显示比例是否合适得看实际效果再调（未验证）。
   */
  nds: 'melonds',
  /*
   * 世嘉三台共用一个核心：Genesis Plus GX 一套吃 MD / Master System / Game Gear
   * （还能吃 SG-1000）。**这是本批里性价比最高的一步**：一个核心换三台机种。
   *
   * ⚠️ 它认的 MD 卡带是「按文件头」而不是按扩展名 —— 所以下面 `EXTENSION_MAP`
   * 刻意**没收 `.bin`**（那个扩展名太泛，PS1 光盘镜像也叫 bin，猜成 MD 只会把
   * 「不认识」变成「静默失败」）。真·MD 的 `.bin` 靠 0x100 处的 `SEGA` 文件头认出来。
   */
  md: 'genesis_plus_gx',
  gg: 'genesis_plus_gx',
  sms: 'genesis_plus_gx',
  /*
   * 32X 单独一个核心：picodrive 是那个构建里唯一支持 32X 的
   * （Genesis Plus GX 不支持 —— 它管 MD / GG / SMS，不管 32X 那套附加硬件）。
   */
  '32x': 'picodrive',
  /*
   * 万代 WonderSwan / WS Color 与 SNK Neo Geo Pocket / NGPC 各一个核心，
   * 都是 Mednafen 系（Beetle）。两台都是「彩色机型共用同一档」——
   * 不另开 `wsc` / `ngpc` 两个机种：库里同一个系列的游戏没必要按机型再切一刀。
   */
  ws: 'mednafen_wswan',
  ngp: 'mednafen_ngp',
  arcade: 'fbneo',
};

/**
 * 屏幕尺寸的**基准**，720×540（NES 画面的 4:3）。
 *
 * 两处用同一组数字：Nostalgist 的 launch `size`（见 `loadRom`）、canvas 的
 * width/height 属性（RetroTv 用这两个常量）。
 *
 * ⚠️ **屏幕的显示尺寸已经不在这里了**（2026-10-12 加电视机尺寸档位之后）：
 * 那是 globals.css 里的 `--tv-screen-w / -h`，按窗口算出「屋子塞得下的最大屏幕」再乘
 * 档位占比（小 / 中 / 大 = 80% / 90% / 100%，2026-10-13 起）。所以这两个数
 * **不对应任何一档的显示尺寸**，只是「启动时给核心的一个基准」，换档、拉窗口都不用动它
 * —— 核心用 ResizeObserver 盯着 canvas 元素，CSS 尺寸一变就按
 * `contentRect × devicePixelRatio` 重设后备存储（见 public/cores/*.js），
 * 所以「基准 720×540、实际显示 1200×900」这种组合也是对的。
 *
 * 注意它只是**基准**：核心起来之后会按 `devicePixelRatio` 把后备存储改成
 * 720×dpr（125% 缩放 = 900×675）来保证清晰度，那是核心的事，屏幕的显示尺寸由
 * 那组 CSS 变量决定，两者不互相牵制。
 */
export const SCREEN_WIDTH = 720;
export const SCREEN_HEIGHT = 540;

/*
 * 各机种的**初始画布尺寸**（传给 Nostalgist 的 `size`）。
 *
 * 为什么要按机种分，而不是全部 720×540：
 *
 * NDS 是**竖屏双屏**（上屏 256×192、下屏 256×192 竖排 = 256×384，比例 2:3）。
 * 传 4:3 的 720×540 给它，核心会按这个画幅去摆两屏 —— 结果是被 letterbox 成
 * 中间一条竖带（2026-10-15 实测：canvas 512×384 时只看到一条竖条）。
 * 传 256×384 时核心自己就把上下两屏铺满了，不需要前端另做双屏布局。
 *
 * 其余机种维持 4:3（720×540），行为和以前完全一致。
 *
 * ⚠️ 这只是**初始值**。核心启动后会按 `devicePixelRatio` 重设后备存储来保清晰度
 * （见上面 `SCREEN_WIDTH` 那段注释），显示尺寸另由 CSS 决定，两者不互相牵制。
 * 所以 NDS 这里写 256×384 不会让它变糊 —— 那只是「告诉核心按什么画幅摆两屏」。
 */
const INITIAL_SIZE: Partial<Record<ConsoleType, { width: number; height: number }>> = {
  nds: { width: 256, height: 384 },
};

/**
 * 核心的**本站路径**（`public/cores/`）。
 *
 * 2026-10-14 之后：**除了 NES / SFC，全部机种的核心都走本地**。
 * NES / SFC 一直是从 jsdelivr 拉的、从来没出过问题，所以不动它们；
 * 其余十一个（gba / gb / gbc / nds / md / gg / sms / 32x / ws / ngp / arcade）都在这里，
 * 因为核心包是整个项目里**唯一在运行时才去下载的东西**，而 jsdelivr 在国内经常
 * 连不上或被限速 —— 拉不动就是「拖进去毫无反应」，用户看不出是网络问题。
 * 放进 `public/` 之后这一段就再没有网络变量了（代价是仓库多了几十 MB，
 * 见 `README.md` 的「已知限制」）。
 *
 * 凭什么可以这么干：这些核心都取自 Nostalgist 用的**同一个构建**
 * （`arianrhodsandlot/retroarch-emscripten-build@v1.22.2` 的
 * `retroarch/<core>_libretro.zip`），所以核心本身没换，换掉的只是「运行时去哪儿拿」。
 *
 * 文件名必须和核心名严格对上：`<core>_libretro.js` / `<core>_libretro.wasm`。
 * 以后再加核心，同样从上面那个仓库的 `retroarch/<core>_libretro.zip` 里解出来放这儿
 * —— ⚠️ `.js` 和 `.wasm` **两个都要放**，少一个就是 404，表现是「拖进去毫无反应」
 * （Next 会把 404 页面当成核心 js 喂给核心加载器）。
 */
const LOCAL_CORE_DIR = '/cores';

/**
 * 哪些机种的核心走本地（见上面 `LOCAL_CORE_DIR`）。只有 NES / SFC 例外 ——
 * 理由同样是「它们一直正常，不动」。
 */
const LOCAL_CORE_CONSOLES = new Set<ConsoleType>([
  'gba',
  'gb',
  'gbc',
  // NDS 的 melonds **必须**走本站：上游那个构建里没有它，CDN 那条路是死的
  'nds',
  'md',
  'gg',
  'sms',
  '32x',
  'ws',
  'ngp',
  'arcade',
]);

/**
 * 扩展名 → 机种。**仅在文件头识别失败时作为回退。**
 *
 * ⚠️ 几个刻意的取舍：
 *   · **不收 `.bin`** —— 它太泛（PS1 光盘镜像、各种裸 dump 都叫 bin），猜成 MD 只会把
 *     「机种不认识」变成「核心静默失败」，反而更难查。真·MD 的 `.bin` 靠 0x100 处的
 *     `SEGA` 文件头认出来（那张固定字符串指纹表在 `detectConsole` 里）。
 *   · **不收 `.wsc` / `.ngc` 之类的彩色机型专属扩展名**：粉彩机型和原机型共用一个机种
 *     档位（见 `CORE_MAP` 的注释），所以它们和 `.ws` / `.ngp` 落到同一档就行 ——
 *     下面照样列出来，是因为下载站确实会这么命名。
 *   · `zip` → 街机是**兜底**（真 romset 就是 zip）：注意 `detectConsole` 里
 *     「拆一层」跑在这张表**之前**，所以「zip 里装一盘 NES」不会被这里误伤。
 */
const EXTENSION_MAP: Record<string, ConsoleType> = {
  nes: 'nes',
  fds: 'nes',
  unf: 'nes',
  unif: 'nes',
  sfc: 'snes',
  smc: 'snes',
  swc: 'snes',
  fig: 'snes',
  bs: 'snes',
  gb: 'gb',
  gbc: 'gbc',
  gba: 'gba',
  /*
   * NDS 和 WonderSwan 同档 —— **没有可用的固定指纹**，只能靠扩展名。
   * `.nds` 是裸卡带镜像；`.dsi` 是 DSi 增强版卡带（同一台机器、同一个核心，
   * 落同一档就行，`.wsc` → `ws` 那条是同样的处理）。
   */
  nds: 'nds',
  dsi: 'nds',
  md: 'md',
  gen: 'md',
  smd: 'md',
  gg: 'gg',
  sms: 'sms',
  '32x': '32x',
  ws: 'ws',
  wsc: 'ws',
  ngp: 'ngp',
  ngc: 'ngp',
  zip: 'arcade',
};

const SNES_MIN_SIZE = 0x8000; // 32 KiB
const SNES_MAX_SIZE = 8 * 1024 * 1024;

/*
 * 键盘映射不再写死在这里 —— 它现在是用户可改的，默认值和换算规则都在
 * `lib/keybindings.ts`，那里也写清了「为什么换算以 RetroArch 为准」。
 *
 * 为什么这一张表是唯一的着力点：RetroArch 自己读键走它，联机注入
 * （`pressDown` → 我们换掉的解码器，见 `overrideInjectionKeyMap`）也走它，
 * 改一处两条路一起变。
 */

/** 音量档位上限：0 档是静音，这个档位是最大音量。 */
export const VOLUME_MAX = 6;

/**
 * 最大档的增益，单位 dB（0 dB = 原音量）。
 *
 * 刻意**不设成 0**：0 dB 是 RetroArch 的默认满音量，在浏览器里放 NES 游戏明显偏吵
 * —— 用户实测「最大档和倒数第二大档声音都很大」。低 6 dB 差不多就是响度砍半。
 */
const VOLUME_TOP_DB = -6;

/**
 * 相邻两档之间差多少 dB。这是**设计选择**，不是 RetroArch 的步长（见下）。
 *
 * 原来是 4 dB，用户反馈「音量控制不明显」—— 4 dB 的差距确实容易被当成没反应。
 * 6 dB 才是「一耳朵能听出来」的量级，1 档到 6 档总共 30 dB。
 */
const LEVEL_STEP_DB = 6;

/**
 * RetroArch 的 VOLUME_UP / VOLUME_DOWN 每次只走 0.5 dB —— 这是它的实现细节，
 * 和上面的**档位间距**是两码事，别混用（一步 6 dB 要发 12 条命令）。
 *
 * 而且**没有** SET_VOLUME 这类能直接赋值的命令（查过核心构建的命令名表，
 * 音量只有 VOLUME_UP / VOLUME_DOWN / MUTE），所以运行时只能按差值补够步数，
 * 当前值必须由我们自己记着。
 */
const RA_VOLUME_STEP_DB = 0.5;

/**
 * 档位 → dB。0 档不走这里（它靠静音开关表达），调用方一律传 Math.max(1, level)。
 * 6 档 = -6 dB（最大），1 档 = -36 dB（最小可听档）。
 */
function levelToDb(level: number): number {
  return VOLUME_TOP_DB - (VOLUME_MAX - level) * LEVEL_STEP_DB;
}

function ascii(bytes: Uint8Array, from: number, len: number): string {
  let out = '';
  for (let i = from; i < from + len && i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

/**
 * SNES ROM 在 0x7FC0 处存有一对互为反码的校验和。
 * base 为 0 表示无 copier header，为 0x200 表示带 512 字节 header。
 */
function hasSnesChecksum(bytes: Uint8Array, base: number): boolean {
  const off = base + 0x7fc0;
  if (off + 0x20 > bytes.length) return false;
  const complement = bytes[off + 0x1c] | (bytes[off + 0x1d] << 8);
  const checksum = bytes[off + 0x1e] | (bytes[off + 0x1f] << 8);
  return ((checksum ^ complement) & 0xffff) === 0xffff;
}

function looksLikeSnes(bytes: Uint8Array, size: number): boolean {
  if (size < SNES_MIN_SIZE || size > SNES_MAX_SIZE) return false;
  if (size % 0x8000 === 0 && hasSnesChecksum(bytes, 0)) return true;
  if ((size - 0x200) % 0x8000 === 0 && hasSnesChecksum(bytes, 0x200)) return true;
  return false;
}

/**
 * GBA ROM 的固定长度（含镜像）都 ≥ 192 KiB，且**必须在 0xB2 处是 `0x96`**
 * —— 这是任天堂的「固定值」，写死在 ROM 头里，是 GBA 最可靠的指纹。
 *
 * 为什么还要卡一个**大小下限**：单凭 0xB2 一个字节太弱（256 分之一会误判）。
 * 真实 GBA 卡带最小 4 MB 位（512 KiB），但为了兼容精简的 dump 放宽到 192 KiB
 * —— 再小的「GBA ROM」几乎都是别的东西改了扩展名。
 *
 * ⚠️ 这个判断要**放在 SNES 之前**：GBA ROM 大小常是 2 的幂（8 MB 等），
 * 满足 `size % 0x8000 === 0`，虽然 SNES 还要额外过 checksum 才会命中，
 * 但先认 GBA 更稳妥 —— 免得将来有人放宽 SNES 判定时踩这条。
 */
function looksLikeGba(bytes: Uint8Array, size: number): boolean {
  if (size < 0x30000) return false;
  return bytes[0xb2] === 0x96;
}

/**
 * GB / GBC 的指纹：**0x104 起是任天堂的图形 logo**（`CE ED 66 66 CC 0D 00 0B …`，
 * 那 48 字节本身就是版权图，卡带校验也靠它）。取头 4 个字节就够 ——
 * 这串组合在游戏数据里撞上的概率可以忽略。
 *
 * 分 GB / GBC 靠 **0x143 的 CGB 标志**：`0x80` = 彩色增强但兼容黑白机，
 * `0xC0` = 只能用彩机跑。两者都算 GBC（装进哪个档位对玩家没差别，
 * 反正背后是同一个 mgba，认的是「这盘能不能开彩色」）。
 *
 * ⚠️ 它必须排在 `looksLikeGba` **之前**：GBC 卡带常有 1–2 MB，够得着 GBA 那条
 * `size >= 0x30000` 的门槛，而 GBA 的判据只是 0xB2 一个字节
 * —— 彩机 ROM 的 0xB2 是普通游戏数据，256 分之一会正好是 0x96。
 */
const GB_MIN_SIZE = 0x8000; // 32 KiB，最小的 GB 卡带
const GB_MAX_SIZE = 8 * 1024 * 1024;

function looksLikeGb(bytes: Uint8Array, size: number): 'gb' | 'gbc' | null {
  if (size < GB_MIN_SIZE || size > GB_MAX_SIZE) return null;
  if (
    bytes[0x104] !== 0xce ||
    bytes[0x105] !== 0xed ||
    bytes[0x106] !== 0x66 ||
    bytes[0x107] !== 0x66
  ) {
    return null;
  }
  const cgbFlag = bytes[0x143];
  return cgbFlag === 0x80 || cgbFlag === 0xc0 ? 'gbc' : 'gb';
}

/**
 * 世嘉 16 位（MD / 32X）：**0x100 起是主机名那行固定字符串**。
 *
 *   32X 的游戏写 `SEGA 32X`，MD 写 `SEGA GENESIS` / `SEGA MEGA DRIVE`（都是 `SEGA ` 开头）。
 * 所以**先认 32X 再认 MD** —— `SEGA 32X` 同样以 `SEGA` 开头，顺序反了 32X 会被吞成 MD。
 *
 * 拿 4 个 ASCII 字符当指纹够稳：ROM 数据里正好在那个偏移写出 `SEGA` 的概率极低，
 * 而且这条排在 SNES 那条启发式之前（理由见 `detectConsole`）。
 */
function segaGen16(bytes: Uint8Array): '32x' | 'md' | null {
  if (ascii(bytes, 0x100, 8) === 'SEGA 32X') return '32x';
  if (ascii(bytes, 0x100, 4) === 'SEGA') return 'md';
  return null;
}

/** 世嘉 8 位卡带那行签名（Master System / Game Gear 是同一套）。 */
const SEGA_8BIT_SIGNATURE = 'TMR SEGA';

/**
 * Master System / Game Gear：**0x7FF0 起是 `TMR SEGA`**。
 *
 * ⚠️ 两台**光看文件头分不出来**（同一个世嘉 8 位家族、同款卡带容器），所以这里只回答
 * 「这是世嘉 8 位卡带」，具体哪台交给**扩展名**（`.gg` / `.sms`）—— 扩展名也认不出时
 * 落到 Master System（它名下的游戏多得多，猜错的那一边损失更小）。
 */
function looksLikeSega8Bit(bytes: Uint8Array): boolean {
  return ascii(bytes, 0x7ff0, SEGA_8BIT_SIGNATURE.length) === SEGA_8BIT_SIGNATURE;
}

/**
 * Neo Geo Pocket / NGPC：**0x00 起是 SNK 的版权行** `COPYRIGHT BY SNK CORPORATION`
 * （28 字节，正好铺满 0x00–0x1B）。0x20 处还有一行 ` LICENSED BY SNK CORPORATION`，
 * 但那行带前导空格、长度也不是整数段，所以只认第一行就够。
 */
const NGP_SIGNATURE = 'COPYRIGHT BY SNK CORPORATION';

function looksLikeNgp(bytes: Uint8Array): boolean {
  return ascii(bytes, 0, NGP_SIGNATURE.length) === NGP_SIGNATURE;
}

/**
 * zip 的本地文件头 `PK\x03\x04`。
 *
 * 两处**必须共用同一份判断**：`detectConsole` 里「文件头是 zip → 街机」那条，
 * 和末尾「扩展名回退到 `.zip` 时也必须真是 zip」那条 —— 后者 2026-10-15 才补上，
 * 起因见 `detectConsole` 末尾那段注释。
 */
function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export function consoleFromExtension(fileName: string): ConsoleType | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return EXTENSION_MAP[ext] ?? null;
}

/**
 * 识别 ROM 机种：优先看文件头 magic number，认不出再回退到扩展名。
 * 这样即便 ROM 被改过名，也不会挂错核心。
 *
 * ## 判定顺序是**刻意排的**，不是随手写的
 *
 *   1. iNES / NES 2.0 / FDS / UNIF —— 固定 magic；
 *   2. `PK\x03\x04` → 街机 romset（真 romset 就是 zip）；
 *   3. GB / GBC —— 任天堂 logo，**必须在 GBA 之前**（理由见 `looksLikeGb`）；
 *   4. GBA —— 0xB2 那个固定值；
 *   5. 世嘉 16 位（MD / 32X）—— 0x100 的主机名；
 *   6. Neo Geo Pocket —— 0x00 的 SNK 版权行；
 *   7. 世嘉 8 位（SMS / GG）—— 0x7FF0 的 `TMR SEGA`；
 *   8. **SNES 放最后** —— 它是这一串里**唯一靠启发式**（校验和互为反码 + 大小取模）
 *      的一条，撞上别的东西的概率不为零，所以让所有固定字符串指纹先过一遍；
 *   9. 全都认不出 → 扩展名回退（`EXTENSION_MAP`）。
 *
 * WonderSwan **没有固定指纹**（ROM 头就是几条跳转指令加校验和，不像上面那些有
 * 版权串可认），所以它只能靠扩展名（`.ws` / `.wsc`）。
 *
 * NDS（2026-10-15 加）同样是**只能靠扩展名**（`.nds` / `.dsi`）：
 * 它的头在 0x00–0x200 之间确实有 `$$` / `AA55` 一类签名，但**位置和内容随加密状态变**
 * （加密卡带的头是密文），拿它当判据比扩展名更容易误判 —— 所以刻意不加指纹分支，
 * 多一层误判只是把「认不出」换成「核心静默失败」。这两台是本表里唯一
 * 「必须带对扩展名」的机种。
 */
export async function detectConsole(file: File): Promise<ConsoleType | null> {
  const head = new Uint8Array(await file.slice(0, 0x10000).arrayBuffer());

  // iNES / NES 2.0
  if (head[0] === 0x4e && head[1] === 0x45 && head[2] === 0x53 && head[3] === 0x1a) {
    return 'nes';
  }
  // Famicom Disk System
  if (ascii(head, 0, 3) === 'FDS' && head[3] === 0x1a) return 'nes';
  // UNIF
  if (ascii(head, 0, 4) === 'UNIF') return 'nes';

  /*
   * 街机 romset 本身就是一个 zip（本地文件头 `PK\x03\x04`）。
   *
   * 刻意读文件头而不是只看扩展名：romset 被人改过名字的情况太常见了。
   * 代价是「把一盘 NES ROM 压成 zip」也会被认成街机 —— 这种玩法在这个项目里
   * 不支持，会静默失败（FBNeo 读不出 .nes）。README 的「已知限制」里写明了。
   */
  if (looksLikeZip(head)) {
    return 'arcade';
  }

  // 任天堂掌机一系：GB / GBC 在 GBA 之前（见 looksLikeGb）
  const gb = looksLikeGb(head, file.size);
  if (gb) return gb;

  if (looksLikeGba(head, file.size)) return 'gba';

  const sega = segaGen16(head);
  if (sega) return sega;

  if (looksLikeNgp(head)) return 'ngp';

  if (looksLikeSega8Bit(head)) {
    /* 世嘉 8 位两台只能靠扩展名分 —— 见 looksLikeSega8Bit */
    const ext = file.name.toLowerCase().split('.').pop() ?? '';
    return ext === 'gg' ? 'gg' : 'sms';
  }

  if (looksLikeSnes(head, file.size)) return 'snes';

  /*
   * 扩展名回退。
   *
   * ⚠️ **`zip → arcade` 这条回退必须要求文件头真是 zip**（2026-10-15 补）。
   * `EXTENSION_MAP` 把 `zip` 映到街机，前提是「真 romset 就是 zip」；而网上
   * **把 7z 改名成 `.zip`** 的情况大量存在（NDS / PS1 的 ROM 站尤其多）。
   * 那种文件走到这里时文件头不是 `PK`，判成街机只会让 FBNeo 拿文件名去查驱动表，
   * 查不到就画一句 `THIS IS NOT A BUG !`（实测原文在
   * `public/cores/fbneo_libretro.wasm` 里）—— 用户和排查的人都看不出是格式问题。
   *
   * 返回 `null` 之后调用方报「机种认不出」，而 `unsupportedArchive()` 认得出它是 7z，
   * 界面据此给一句准话。**比「静默走错核心」好得多。**
   *
   * ⚠️ 真 7z 现在**在 `unwrapRom` 里就被拆开了**（见 `lib/unwrap.ts`），走不到这儿 ——
   *    这条兜的是「拆包失败」和「是 rar」那两种情况。
   */
  const byExtension = consoleFromExtension(file.name);
  if (byExtension === 'arcade' && !looksLikeZip(head)) return null;
  return byExtension;
}

/**
 * 认出「网上常见、但这个项目不吃」的压缩格式。
 *
 * 街机 romset 大量以 `.7z` / `.rar` 流通，而 FBNeo 只认 `.zip`。这两种在
 * `detectConsole` 里会落到「机种认不出」—— 如果就这么静默失败，用户根本想不到
 * 是压缩格式的问题（他会以为是 ROM 坏了或者模拟器不行）。这个函数存在的意义，
 * 就是给那种情况一句准话。
 */
export async function unsupportedArchive(file: File): Promise<'7z' | 'rar' | null> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());

  // 7z: 37 7A BC AF 27 1C
  if (
    head[0] === 0x37 &&
    head[1] === 0x7a &&
    head[2] === 0xbc &&
    head[3] === 0xaf &&
    head[4] === 0x27 &&
    head[5] === 0x1c
  ) {
    return '7z';
  }

  // RAR: "Rar!" + 1A 07（4.x 及更早）或 1A 07 01（5.x）
  if (ascii(head, 0, 4) === 'Rar!' && head[4] === 0x1a && head[5] === 0x07) {
    return 'rar';
  }

  return null;
}

/**
 * 偷看核心包的下载进度。
 *
 * 核心是 Nostalgist 从 CDN 拉的（第一次几 MB，之后进 CacheStorage 就快了），
 * 而它**不给任何进度回调** —— 拖进一盘卡带后界面会静默好几秒，这就是「没反应」的来源。
 *
 * 拿进度的办法是 `Response.clone()` 的分流能力：克隆出来的那一份专门读字节数，
 * **原始那一份原封不动还回去**，所以 Nostalgist 走的那条路一个字节都没变 ——
 * 最坏情况（读失败、拿不到长度）也只是没有进度，不会影响载入本身。
 *
 * 只认 URL 里带 `_libretro.zip`（Nostalgist 从 CDN 拉的核心包）或 `_libretro.wasm`
 * （街机改走本地之后拉的是这个）的请求，其余请求原样放行。核心已经在 CacheStorage 里、
 * 或者走的是本地小文件时，回调可能一次都不触发，界面据此退回「不确定」进度。
 */
function watchCoreDownload(onProgress: (loaded: number, total: number) => void): () => void {
  const original = window.fetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await original.call(window, input, init);

    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const isCorePayload =
      url.includes('_libretro.zip') || url.includes('_libretro.wasm');
    if (!isCorePayload || !response.body) return response;

    const total = Number(response.headers.get('content-length')) || 0;
    const mirror = response.clone();

    void (async () => {
      const reader = mirror.body?.getReader();
      if (!reader) return;
      let loaded = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          loaded += value.byteLength;
          onProgress(loaded, total);
        }
      } catch {
        // 读失败就当作没有进度 —— 别影响已经还回去的那一份
      }
    })();

    return response;
  };

  return () => {
    window.fetch = original;
  };
}

/**
 * 注入用的「配置键名 → DOM code」解码器。`Emulator.getKeyboardCode` 在 d.ts 里是
 * private，而我们只是**替换**它、不碰任何内部状态，所以用最小结构类型绕开可见性检查，
 * 而不是去改 Nostalgist 的类型定义。
 */
type KeyboardCodeHook = {
  getKeyboardCode: (button: string, player?: number) => string | undefined;
};

/**
 * 把 Nostalgist 的解码器换成我们自己的。**只影响联机注入这条路。**
 *
 * Nostalgist 自己那份（`getKeyboardCode`）把 `num*` / `keypad*` **解反了** —— 认为
 * `num4` 是小键盘、`keypad4` 是字母上方那排数字行，正好和 RetroArch
 * （`input/input_keymaps.c`）相反。而联机注入**全靠它**：房主把对方的钮名喂给
 * `pressDown`，它去查配置拿到键名、再解成一个 DOM code，最后合成键盘事件给核心。
 * 于是默认键位里 P2 那几个**小键盘**面键（`keypad1`…）被它解成 `Digit1`…，
 * 合成出来的事件和核心认的键对不上 —— 表现就是**联机时方向键能动、面键全死**
 * （方向键走具名表，解出来是 `ArrowUp` 这类，恰好没被解错）。
 *
 * 不跟它的解码表绕：注入要的 DOM code 本来就是**这次启动写进配置的那份键位**，
 * 而 `KeyBindings` 里存的值就是 `KeyboardEvent.code`，直接取，一步到位。
 * 这也顺带把「配置里写了什么、注入就合成什么」钉死在自己手里 —— 以后加机种 / 加钮，
 * 都不用再去管它的解码表。
 *
 * `launched` 必须是**启动那一刻**的快照：`setBindings` 会在运行中立刻改
 * `this.bindings`（键位面板就是直接调的），而核心读的是启动时那份配置，两者会短暂
 * 不一致。注入要是跟着新的走，就会合成一个核心根本不认的键 —— 那还不如原来。
 */
function overrideInjectionKeyMap(nostalgist: Nostalgist, launched: KeyBindings): void {
  const hook = nostalgist.getEmulator() as unknown as KeyboardCodeHook;
  hook.getKeyboardCode = (button, player = 1) =>
    (player === 1 ? launched.p1 : launched.p2)[button as ButtonName];
}

/**
 * EJS 核（现在只有 NDS 的 melonds）的 Module —— 只写我们真正用到的那几样。
 *
 * `[key: string]: unknown` 是为了按名字探导出面（`module['_toggleMainLoop']`）。
 */
interface EjsModule {
  cwrap(
    name: string,
    returnType: string,
    argTypes: string[]
  ): (...args: unknown[]) => unknown;
  /**
   * ⚠️ **每次用都要现读**：内存增长时核心会把 `Module.HEAPU8` 换成新的视图
   * （`updateMemoryViews()` 里那句 `Module["HEAPU8"]=HEAPU8=new Uint8Array(b)`），
   * 缓存住就会读到一个已经作废的堆。
   */
  HEAPU8: Uint8Array;
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    unlink(path: string): void;
  };
  [key: string]: unknown;
}

/**
 * RetroPad 钮号 —— libretro 的 `RETRO_DEVICE_ID_JOYPAD_*`，也就是 EJS 的
 * `simulate_input(player, id, value)` 要的那个 id。
 *
 * 照抄 EmulatorJS 那份输入驱动里的 `keymap[]`
 * （`EmulatorJS/RetroArch` 的 `input/drivers/emulatorjs_input.c`，源头是上游的
 * `rwebinput_input.c`）：
 *
 *   0 b · 1 y · 2 select · 3 start · 4 up · 5 down · 6 left · 7 right
 *   8 a · 9 x · 10 l · 11 r · 12 l2 · 13 r2 · 14 l3 · 15 r3
 *
 * ⚠️ **顺序和 `ALL_BUTTONS` 不一样**，别照那张表抄 —— `ALL_BUTTONS` 是「面板上怎么排」，
 *    这张是「核心认几号」，两者只有名字重合。
 */
const EJS_JOYPAD_ID: Record<ButtonName, number> = {
  b: 0,
  y: 1,
  select: 2,
  start: 3,
  up: 4,
  down: 5,
  left: 6,
  right: 7,
  a: 8,
  x: 9,
  l: 10,
  r: 11,
  l2: 12,
  r2: 13,
};

/**
 * 虚拟文件系统里那点我们需要的接口（Emscripten 的 `Module.FS`）。
 * 只列用到的四样，避免把整个 FS 类型拖进来。
 */
interface EmscriptenFs {
  readdir(path: string): string[];
  stat(path: string): { mode: number; size: number };
  isDir(mode: number): boolean;
  readFile(path: string): Uint8Array;
}

/**
 * RetroArch 系的电池存档扩展名：`.srm` 是默认叫法，其余是各核心自己的。
 * 只用来「在文件系统里认出存档文件」，不参与任何格式解析 —— 字节原样搬。
 */
const SRAM_EXTENSIONS = ['srm', 'sav', 'dsv', 'fla', 'eep'];

/**
 * 找不到 Nostalgist 算出来的那个路径时的兜底搜索根。
 * 正经 RetroArch 构建落第一个；EJS 构建（melonds）的目录约定不一样，所以多列几个
 * —— 虚拟文件系统很小，扫一遍很便宜。
 */
const SRAM_SEARCH_ROOTS = [
  '/home/web_user/retroarch/userdata/saves',
  '/home/web_user/retroarch/userdata',
  '/retroarch/userdata/saves',
  '/retroarch/userdata',
  '/data',
];

/** 兜底搜索的深度上限 —— 存档就落在 `saves/<核心名>/` 那一两层里。 */
const SRAM_SEARCH_DEPTH = 4;

/** 读一个已知路径；文件不在、或者是个空文件（等于没有存档），都返回 null。 */
function readIfExists(fs: EmscriptenFs, path: string): Uint8Array | null {
  try {
    if (fs.stat(path).size <= 0) return null;
    return fs.readFile(path);
  } catch {
    return null;
  }
}

/** 依次试每个根目录，第一个找到的就是它。 */
function findSaveFile(fs: EmscriptenFs, roots: string[]): Uint8Array | null {
  for (const root of roots) {
    const found = searchSaveFile(fs, root, SRAM_SEARCH_DEPTH);
    if (found) return found;
  }
  return null;
}

function searchSaveFile(
  fs: EmscriptenFs,
  dir: string,
  depth: number
): Uint8Array | null {
  let names: string[];
  try {
    names = fs.readdir(dir);
  } catch {
    return null; // 这个目录不存在，换下一个根
  }
  for (const name of names) {
    if (name === '.' || name === '..') continue;
    const path = `${dir}/${name}`;
    let stat: { mode: number };
    try {
      stat = fs.stat(path);
    } catch {
      continue;
    }
    if (fs.isDir(stat.mode)) {
      if (depth <= 0) continue;
      const nested = searchSaveFile(fs, path, depth - 1);
      if (nested) return nested;
      continue;
    }
    const dot = name.lastIndexOf('.');
    if (dot < 0) continue;
    if (!SRAM_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase())) continue;
    const bytes = readIfExists(fs, path);
    if (bytes) return bytes;
  }
  return null;
}

/** 见 `createEjsControl`。几个方法都是**同步**的 —— 核心那几个导出本来就是同步调用。 */
interface EjsControl {
  saveState(): Blob;
  loadState(bytes: Uint8Array): void;
  setPaused(paused: boolean): void;
  restart(): void;
  /**
   * 让核心重新读一遍虚拟文件系统里的存档文件（EJS 的 `_refresh_save_files`）。
   *
   * ⚠️ 只有 melonds 导出了它，其余 7 个本地核没有 ⇒ `null`。判空的那一头是
   * `loadRom` 里「开局带存档」那一步：没有它就只能靠 Nostalgist 在**启动前**
   * 把文件放好（`stageBatterySave` 那条路本来就是启动前放的，所以它只是保险）。
   */
  refreshSaveFiles: (() => void) | null;
  /**
   * 把某个钮按下 / 松开（EJS 的 `simulate_input`）。**`player` 是 0 基** ——
   * 它的那张表就是 `down_1`…`down_4` 四个槽，0 号对应本机的 1P。
   *
   * `null` = 这个 EJS 核没导出 `simulate_input`（现在的 melonds 有）。判空的那一头
   * 就是 `attachEjsKeyboard` —— 没有它，键盘桥挂上去也是白挂。
   */
  simulate: ((player: number, button: ButtonName, down: boolean) => void) | null;
}

/**
 * EJS 核的运行时控制面。
 *
 * **为什么要另开一条路**（2026-10-15）：`public/cores/melonds_libretro.{js,wasm}` 是从
 * EmulatorJS 的 `melonds-wasm.data` 里解出来的（wasm 里有 `Built for EmulatorJS`），
 * 它的导出面和另外 7 个本地核**不是一套** —— 它**没有** `_cmd_toggle_pause` /
 * `_cmd_load_state` / `_cmd_reset`，而 Nostalgist 的 `pause()` / `loadState()` /
 * `restart()` 恰恰只会发这三条命令（`sendCommand()` 里那张
 * `PAUSE_TOGGLE → _cmd_toggle_pause` 表）；这三条打不到核心，就只剩「字符串队列」
 * 那条退路 —— 而它在 NDS 上也是打不通的（2026-10-15 实测：暂停按了没动静、存档
 * 一直卡着、重置也没用）。当时存档还多一层：Nostalgist 的 `saveState()` 等的是虚拟
 * 文件系统里的 `<ROM 名>.state`，而 EJS 核的快照根本不落盘，那个文件永远不会出现。
 * 即时存档直接使用 EJS 的内存快照接口，不等待虚拟文件生成。
 *
 * 它自己有另一套，也就是 EJS 前端 `GameManager.js` 用的那套：
 *
 *   `toggleMainLoop(0 / 1)`    → 停 / 起主循环 —— **EJS 的「暂停」就是它**
 *   `system_restart()`         → 重置
 *   `_refresh_save_files()`    → 让核心重新读一遍存档文件（开局带存档时补一刀）
 *
 * （导出面对照表见 `.workbuddy-ai/memory/REFERENCE.md` 的「NDS 的 melonds 是 EJS 构建」。）
 *
 * ⚠️ 判据是**能力探测**而不是机种名：上面两样只有 melonds 有，其余 7 个本地核一处都没有。
 * 所以非 EJS 核一律返回 null，调用方原样退回 Nostalgist 那套，其余 12 个机种零影响。
 *
 * 快照通过 save_state_info() 抓取，load_state() 恢复。
 */
function createEjsControl(nostalgist: Nostalgist): EjsControl | null {
  const emulator = nostalgist.getEmulator() as unknown as {
    getEmscripten?: () => { Module?: EjsModule };
  };
  const wasm = emulator.getEmscripten?.()?.Module;
  if (!wasm) return null;

  const exported = (name: string) => typeof wasm[`_${name}`] === 'function';
  if (!exported('toggleMainLoop') || !exported('save_state_info')) return null;

  /*
   * 按名字取函数（和 EJS 前端同一手法）：`cwrap('toggleMainLoop', …)` 找的就是
   * `_toggleMainLoop`。上面已经确认过这两样在，所以 cwrap 不会抛。
   *
   * save_state_info 是 EJS 构建的快照入口，其余核心走 Nostalgist。
   */
  const wrap = (name: string, returnType: string, argTypes: string[]) =>
    wasm.cwrap(name, returnType, argTypes);
  const toggleMainLoop = wrap('toggleMainLoop', 'null', ['number']);
  /** `system_restart` 是 EJS 核顺手带的；万一没有就不给重置（调用方会看到空操作） */
  const restart = exported('system_restart')
    ? wrap('system_restart', 'null', [])
    : null;
  /*
   * 存档刷新只有 melonds 有，所以它**不进上面那条判据**：少了它这个核照样是 EJS 核，
   * 暂停 / 重置该走 EJS 那套还得走，只是「开局带存档」少一道保险。
   */
  const refreshSaveFiles = exported('refresh_save_files')
    ? wrap('refresh_save_files', 'null', [])
    : null;
  /*
   * `simulate_input` 是 EJS 核的输入口（见 `attachEjsKeyboard`）。同样是「有就接、
   * 没有就不接」：**别把它并进上面那条判据** —— 少了它这个核照样是 EJS 核，
   * 暂停 / 存档该走 EJS 那套还得走，只是键盘桥挂不上而已。
   */
  const simulateInput = exported('simulate_input')
    ? wrap('simulate_input', 'null', ['number', 'number', 'number'])
    : null;

  return {
    saveState: () => captureEjsState(wasm),
    loadState: (bytes) => restoreEjsState(wasm, bytes),
    setPaused: (paused) => {
      toggleMainLoop(paused ? 0 : 1);
    },
    refreshSaveFiles: refreshSaveFiles ? () => refreshSaveFiles() : null,
    restart: () => {
      restart?.();
    },
    simulate: simulateInput
      ? (player, button, down) =>
          simulateInput(player, EJS_JOYPAD_ID[button], down ? 1 : 0)
      : null,
  };
}

/**
 * 键盘事件的目标是不是「用户在跟它打交道」的元素 —— 抄 Nostalgist 内部的
 * `isInteractable`（元素范围对齐：a / button / details / input / select / textarea）。
 *
 * 为什么要有这个东西：Nostalgist 给其余 12 个机种装的键盘回调带一道过滤，
 * 事件落在这些元素上时**不转发给核心**；`attachEjsKeyboard` 是另一条路，
 * 不自己抄一遍行为就会分叉。屋子的注释里还记着这条规矩的来历
 * （点完按钮焦点留在按钮上、按方向键没反应，所以他们在 `pointerup` 时 blur 按钮）。
 */
function isInteractableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  switch (target.tagName) {
    case 'A':
    case 'BUTTON':
    case 'DETAILS':
    case 'INPUT':
    case 'SELECT':
    case 'TEXTAREA':
      return true;
    default:
      return false;
  }
}

/**
 * EJS 核（现在只有 NDS）的键盘桥。返回**拆卸函数**：退出时摘监听、把欠着的那几个钮松开。
 *
 * ## 为什么 EJS 核不能像其余 12 个机种那样「让核心自己读键盘」
 *
 * melonds 的输入驱动是 EmulatorJS 打在 RetroArch 上的分支
 * （`EmulatorJS/RetroArch` 的 `input/drivers/emulatorjs_input.c`，上游就是
 * `rwebinput_input.c`），对着源码比一比，最大的差别是那句
 *
 *     static int16_t rwebinput_is_pressed(...) { return 0; }
 *
 * —— **整个函数被掏空成 `return 0;`**。于是「按住哪个键 = 按下哪个钮」这条查表路
 * 直接没了：我们写进 `retroarch.cfg` 的 `input_playerN_*` 在 NDS 上一个钮也点不动，
 * 键盘事件只剩「原样喂给核心的键盘设备」（`input_keyboard_event(..., RETRO_DEVICE_KEYBOARD)`）
 * 这一个用途 —— 而 NDS 机身上没有键盘。这就是 2026-10-15 用户报的「按键功能不行」。
 *
 * 它换上来的是另一套：`simulate_input(player, id, value)` 直接改一张
 * 「谁按着哪个钮」的表（`keymap[]` 里那四个 `down_1..down_4` 槽），核心的
 * `input_state` 再把那张表或进手柄状态里
 * （EJS 版就是 `ejs_is_pressed(port, i) || rwebinput_is_pressed(...)`，后者恒为 0）。
 * EJS 前端自己的键盘就是这么打的（`GameManager.simulateInput`）—— 它压根不用核心的键盘。
 *
 * ⚠️ 那条 `||` 有个前提：**`binds[port][id].valid` 必须为真**（单钮查询那一支是
 *    `if (binds[port][id].valid) { if (ejs_is_pressed(...)) return 1; }`），也就是
 *    `input_playerN_*` 得写上。这一条我们的 `bindingsToRetroArch` 本来就满足了
 *    （14 个钮全写），所以这里不用再补配置。
 *
 * ## 这一层只干一件事
 *
 * 把我们这套键位（`KeyboardEvent.code`）翻成 `simulate_input` 的 `(player, id)`，
 * 自己接键盘。**不碰核心的键盘** —— 那条路在 EJS 核上是死的，开着它只会多一份没人读的队列。
 *
 * ⚠️ 只有能力探测通过的 EJS 核会调到这里（见 `loadRom` 的调用点），其余 12 个机种
 *    一个字节都不走 —— 它们的键盘由核心自己读，**别把这个监听也挂上去**：
 *    那样同一套键位会被打两遍（值一样，白费），更糟的是会和核心的「热键 / 输入框例外」
 *    两套判定打架。
 */
function attachEjsKeyboard(
  simulate: (player: number, button: ButtonName, down: boolean) => void,
  getBindings: () => KeyBindings
): () => void {
  /** 现在按着哪几个（`"player:button"` → 那一位）。失焦时要按这本账松开。 */
  const held = new Map<string, { player: number; button: ButtonName }>();

  /*
   * 「哪个物理键 = 谁的哪个钮」**每次按键现算**，不吃快照：
   * 键位面板会直接改 `this.bindings`（见 `setBindings`），而我们这张表是路由用的、
   * 不需要像核心那样把配置烤进启动 —— 改完键位就该立刻按新键生效。
   *
   * 1P 优先：两个玩家绑到同一个键本来就被 `conflictInOtherPlayer` 拦着，
   * 真撞上了（联机下才可能）也只该让本机那一位动。
   */
  const lookup = (code: string): { player: number; button: ButtonName } | null => {
    const bindings = getBindings();
    const tables: [number, PlayerBindings][] = [
      [0, bindings.p1],
      [1, bindings.p2],
    ];
    for (const [player, table] of tables) {
      for (const button of ALL_BUTTONS) {
        if (table[button] === code) return { player, button };
      }
    }
    return null;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // 长按的连发没有意义：`simulate_input` 只是把同一个位置 1，重复置位不产生新信息
    if (event.repeat) return;
    /*
     * 和其余 12 个机种一条规矩：事件目标落在可交互元素上时**不转发**。
     *
     * 那条规矩本来归 Nostalgist（它内部的 `isInteractable`，只对它自己装的那份
     * 键盘回调生效），这条是我们自己接的，得自己抄一遍，否则 NDS 会和别处不一样：
     * 屋子那边专门为此在 `pointerup` 时把按钮 blur 掉（见 ConsoleScene 的注释），
     * 而房间码是个 `<input>` —— 不拦的话在里面打字会顺手把游戏按一通。
     *
     * 元素范围和它对齐（a / button / details / input / select / textarea）。
     */
    if (isInteractableTarget(event.target)) return;
    const hit = lookup(event.code);
    if (!hit) return;
    /*
     * 其余机种是**核心**替我们挡的滚动（emscripten 的键盘回调返回真值就会
     * `preventDefault`），这条路上没人挡：方向键 / 空格不拦就会滚页面。
     */
    event.preventDefault();
    held.set(`${hit.player}:${hit.button}`, hit);
    simulate(hit.player, hit.button, true);
  };

  const onKeyUp = (event: KeyboardEvent) => {
    const hit = lookup(event.code);
    if (!hit) return;
    /*
     * keyup **不看焦点**（和上面那道过滤不对称，故意的）：只松「真按下去过」的那几个。
     * 按住期间焦点可能跑进输入框（keydown 被上面拦掉、这里就不在账上），
     * 也可能反过来 —— 焦点在别处按下、松开时人已经点进输入框了。
     * 后者要是不松，那个钮就永远停在「按下」。
     */
    if (!held.delete(`${hit.player}:${hit.button}`)) return;
    event.preventDefault();
    simulate(hit.player, hit.button, false);
  };

  /**
   * 把手里的钮一次性松开。
   *
   * 浏览器**不补发** keyup：切标签页 / 点到别处时，按着的方向键会永远停在「按下」。
   * 核心那条路有同样的毛病，但它归核心管；这条是我们自己接的，得自己收尾。
   */
  const releaseAll = () => {
    for (const hit of held.values()) simulate(hit.player, hit.button, false);
    held.clear();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseAll);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', releaseAll);
    releaseAll();
  };
}

export class EmulatorController {
  private instance: Nostalgist | null = null;
  private currentRom: LoadedRom | null = null;
  private paused = false;

  /**
   * EJS 核（现在只有 NDS）的控制面，`createEjsControl` 探出来的。
   *
   * 非 null 时暂停 / 存档 / 读档 / 重置**全走它**，Nostalgist 那几条命令一律不发
   * （原因见 `createEjsControl` 的注释）。生命周期跟着 `instance`：启动时探一次、
   * `exit()` 里清掉。
   */
  private ejs: EjsControl | null = null;

  /**
   * EJS 核的键盘桥的拆卸函数（见 `attachEjsKeyboard`），非 EJS 核为 null。
   *
   * 和 `ejs` 一样只在 EJS 核上非 null，生命周期也跟着它：`loadRom` 里挂、`exit()` 里拆。
   */
  private detachEjsKeyboard: (() => void) | null = null;

  /**
   * 当前这套键位。只在 `loadRom` 里被写进 retroarchConfig。
   *
   * 也就是说**改完要重新插一次卡带才生效** —— RetroArch 的按键映射是启动时一次性
   * 读进核心的，没有能在运行时重载配置的接口（`getKeyboardCode` 虽然每次都会去
   * 读配置文件的 mtime，但那只影响我们自己发起的注入，改不了核心自己读键盘用的内存副本）。
   */
  private bindings: KeyBindings = DEFAULT_BINDINGS;

  /** 音量档位（0 = 静音，VOLUME_MAX = 原音量）。没有实例时也留着，插卡带时生效。 */
  private volumeLevel = VOLUME_MAX;
  /** 我们自己记着的当前 dB —— RetroArch 没有能读回音量的命令 */
  private volumeDb = levelToDb(VOLUME_MAX);
  private muted = false;

  /**
   * 下一局开局要带的电池存档（`.srm` 的字节）。
   *
   * `stageBatterySave()` 写进来、`loadRom` 消费一次就清空 —— 因为核心只在**启动时**
   * 读一遍卡带记忆，运行中把文件换掉它不会回头再读。所以这套里「读档」就是
   * 「带着存档重新插一次卡带」（见 `stageBatterySave`）。
   */
  private pendingSram: Uint8Array | null = null;
  private releaseResources: (() => Promise<void>) | null = null;

  get rom() {
    return this.currentRom;
  }

  get isPaused() {
    return this.paused;
  }

  get isRunning() {
    return this.instance !== null;
  }

  /**
   * 换一套键位。**不会**作用于正在跑的实例（见 `bindings` 的注释），
   * 下次 `loadRom` 才会带上新键位。
   */
  setBindings(bindings: KeyBindings): void {
    this.bindings = bindings;
  }

  /**
   * 让**下一个** `loadRom` 带上这份电池存档（`.srm` 的字节）。传 `null` 清掉。
   *
   * 这就是「读档」的全部实现。核心只在启动时把卡带记忆读进内存，运行中改文件
   * 它不会回头再读 —— 所以读档必然是「重新插一次卡带」，**不是**在当前这一局上打补丁。
   *
   * 存哪儿、叫什么名字不归调用方管：字节会在启动前被写进虚拟文件系统，
   * 文件名的唯一来源是 Nostalgist 按内容名算出来的那个 `sramFilePath`。
   */
  stageBatterySave(bytes: Uint8Array | null): void {
    this.pendingSram = bytes;
  }

  /**
   * 插上卡带并启动。
   *
   * `onProgress` 是可选的：核心第一次要从 CDN 下几 MB，界面靠它画进度条
   * （实现见 `watchCoreDownload`）。不传就完全按老样子走。
   *
   * `bios` 也是可选的，目前只有街机用得上：FBNeo 跑 Neo Geo 游戏时要去 system 目录
   * 找 `neogeo.zip`，拿不到就直接不加载。这份 BIOS 由 `lib/bios.ts` 的 `ensureBios()`
   * 负责备齐（站点自带一份在 `public/bios/`，用户自己拖一份可以覆盖），
   * 引擎只负责把它交给 Nostalgist —— 存哪儿、从哪儿取，不归引擎管。
   */
  async loadRom(
    file: File,
    canvas: HTMLCanvasElement,
    onProgress?: (loaded: number, total: number) => void,
    bios?: File | null
  ) {
    // 先退出正在运行的实例，避免多个核心叠加占用内存
    await this.exit();

    /*
     * 有些 ROM 是**压缩包伪装成 ROM**（`jojos-....smc` 前四字节其实是 `PK\x03\x04`），
     * 也有些就是老老实实的压缩包里装一盘 ROM（`.zip`，2026-10-15 起还有 **7z** ——
     * 那是「宝可梦 珍珠打不开」的根因）。几种都得先拆开 —— 否则 `detectConsole`
     * 会把它们一律判成**街机**（任何 `PK\x03\x04` 都当 romset），然后交给 FBNeo
     * 拿文件名当驱动名查表，查不到就**完全静默地失败**（画面里只剩 FBNeo 自己画的
     * `THIS IS NOT A BUG !`）。
     *
     * 判定规则、以及为什么这不会误伤街机 romset（靠内层扩展名区分），都在 `lib/unwrap.ts`。
     *
     * 拆出来的 ROM **只喂给非街机那条路**（NES / SFC / NDS / GB / GBA… 都算）；
     * 街机仍然拿**原始文件**去 `resolveArcadeCore()` —— romset 本身就该是 zip，
     * 被拆开反而坏事。
     */
    /*
     * `onProgress` 顺手接给解包：7z 那条路要在 Worker 里解十几秒（EJS 那份是 asm.js，
     * 本机实测 64 MB 的包 14.6 秒），不报进度就是一块死屏。
     * 它的语义是 `(loaded, total)`，这里按 `(ratio, 1)` 喂 —— 调用方算的是
     * `loaded / total * 100`，正好落回 0–100。
     */
    const unwrapped = await unwrapRom(
      file,
      onProgress ? (ratio) => onProgress(ratio, 1) : undefined
    );
    const romFile = unwrapped?.file ?? file;
    if (unwrapped) {
      console.info(
        `[nesload] 「${file.name}」是个 ${unwrapped.container}，` +
          `已解出内层「${unwrapped.innerName}」（${romFile.size} 字节）`
      );
    }

    const consoleType = await detectConsole(romFile);
    if (!consoleType) {
      throw new UnsupportedRomError();
    }

    /*
     * 街机不带 BIOS 时不拦 —— CPS1 / CPS2 那类本来就不需要，拦了反而把它们也挡住。
     * 只在 console 里说一句，因为 Neo Geo 游戏缺 BIOS 的失败是**完全静默**的
     * （核心不报错、界面照常出雪花），没有这句话就彻底没有排查入口。
     *
     * 走到这里 `bios` 还是 null，说明**本地和站点自带那两份都没拿到** ——
     * `ConsoleScene` 在拖入那一刻已经用 `ensureBios()` 兜过一次了（见 `lib/bios.ts`）。
     *
     * 面向**用户**的那条提示不在这里：要判断「这盘是不是 Neo Geo」得读 romset 的中央目录，
     * 而这里已经拿不到拖入那个时机了（`loadRom` 只管启动）。它在 `ConsoleScene` 里做
     * （`biosHint`），判据在 `lib/bios.ts` 的 `looksLikeNeoGeoRomset`。
     */
    if (consoleType === 'arcade' && !bios) {
      console.warn(
        '[nesload] 街机 ROM 启动时没有 BIOS。如果这是 Neo Geo 游戏（合金弹头、拳皇、侍魂…），' +
          '它需要 neogeo.zip —— 把 neogeo.zip 拖进页面就能装上；CPS1 / CPS2 那类不需要。'
      );
    }

    /*
     * 街机要多做一步：**决定用哪个核心、romset 叫什么名字、喂哪份字节**。
     *
     * 三件事都可能变：
     *   - 核心：FBA 0.2.97.42（`fbalpha2012_cps1`）多出 9 个 FBNeo 没有的 hack 驱动；
     *   - 名字：核心拿 zip 的**文件名**当驱动名，网上流通的 romset 经常被改过名；
     *   - 内容：zip 里 rom 的名字和驱动期望的对不上（内容是对的）时，`resolveArcadeCore`
     *     会把 zip 重打包一遍补上名字。
     *     ⚠️ 这一步**只对老核心 `fbalpha2012_cps1` 有用**（它按名字取 rom）；
     *     `fbneo` 的 libretro 核心是按 **CRC** 在 zip 里找 rom 的，重写名字对它无害也无用
     *     —— 别再把「fbneo 跑不起来」归到名字上，来龙去脉见 `lib/arcade-core.ts` 顶部。
     *
     * 判定依据、两张表的来历、重打包的细节都在 `lib/arcade-core.ts` / `lib/zip.ts` 里。
     * NES / SFC 不掺和，照旧走 `CORE_MAP`。
     */
    let core = CORE_MAP[consoleType];
    /*
     * 非街机喂的是**拆包后的** `romFile`（`unwrapRom` 没命中时它恒等于原 `file`，
     * 没有额外开销）。街机分支下面会立刻覆盖这两个变量，用原始文件重新决定。
     */
    let romFileName = romFile.name;
    let romContent: Blob = romFile;
    if (consoleType === 'arcade') {
      const resolved = await resolveArcadeCore(file);
      core = resolved.core;
      romFileName = resolved.fileName;
      romContent = resolved.content;
      /*
       * 街机失败是**完全静默**的（屏幕照常出雪花、核心也不抛异常，FBNeo 只把错误画在画面里），
       * 所以这次到底选了哪个核心、romset 被叫成什么、有没有动过字节，必须留一行日志
       * —— 这是唯一的排查入口。
       */
      const why =
        resolved.reason === 'name'
          ? '文件名即驱动名，内容已核对'
          : resolved.reason === 'content'
            ? '文件名不是驱动名，按内容认出来的'
            : resolved.reason === 'rewritten'
              ? '按内容认出来的，并重写了 zip 里的 rom 名'
              : '没认出来，按原名交给核心';
      const from = resolved.container ? `，取自整合包内层「${resolved.container}」` : '';
      console.info(
        `[nesload] 街机核心：${core}（本站 ${LOCAL_CORE_DIR}/），` +
          `romset 名「${romFileName}」（${why}）${from}`
      );
      if (/[^\x20-\x7e]/.test(romFileName.replace(/\.[^.]+$/, ''))) {
        console.warn(
          `[nesload] romset 名「${romFileName}」里含非 ASCII 字符。FBNeo / FBA 都用文件名认驱动，` +
            '改名后大概率找不到 —— 把 zip 恢复成原始 romset 名（kof98.zip、dino.zip 这种）再试。'
        );
      }
    }

    /*
     * 核心从哪儿来：**除了 NES / SFC，全部走本站静态文件**（`public/cores/`）。
     *
     * 为什么不统一：NES / SFC 一直从 jsdelivr 拉、从来没出过问题，动它只有风险没有收益；
     * 而其余机种的核心一旦走 CDN，jsdelivr 在国内连不上或被限速时就表现成
     * 「拖进去毫无反应」—— 用户看不出是网络问题。完整的因果见上面 `LOCAL_CORE_DIR`。
     *
     * ⚠️ 这里用的是 `consoleType` 而不是 `core` 来判断：GBA / GB / GBC 三个机种共用
     * `mgba` 一个核心，街机那个 `core` 还是 `resolveArcadeCore()` 现挑出来的
     * （`fbneo` / `fbalpha2012_cps1`），按机种判断才不会漏。
     *
     * 参数类型写 `unknown` 是刻意的：Nostalgist 把这两个回调的参数声明成
     * `NostalgistCoreDict | string`（那个类型没导出，我们引不到），而它实际传进来的
     * **永远是核心名字符串** —— `updateCore()` 里是 `resolver(core, options)`。
     * 手写成 `string` 会踩逆变检查（`NostalgistCoreDict` 不能赋给 `string`）编译不过；
     * 改成让上下文推断，模板串里又会出现对象类型、同样报错。`unknown` 两头都绕开。
     */
    const coreSource = LOCAL_CORE_CONSOLES.has(consoleType)
      ? {
          resolveCoreJs: (name: unknown) => `${LOCAL_CORE_DIR}/${String(name)}_libretro.js`,
          resolveCoreWasm: (name: unknown) =>
            `${LOCAL_CORE_DIR}/${String(name)}_libretro.wasm`,
        }
      : {};

    /*
     * 只在下核心包那段时间挂上观测，launch 一结束就摘掉 ——
     * 别让一个全局的 fetch 补丁一直留在页面上。
     */
    const stopWatching = onProgress ? watchCoreDownload(onProgress) : null;

    /*
     * 消费一次就清空：存档只对**这一次启动**有效。留着的话下一局（比如换一盘游戏）
     * 会莫名其妙带着上一盘的存档开局。
     */
    const sram = this.pendingSram;
    this.pendingSram = null;

    // 用 `| null` 初值而不是裸声明：catch 分支必然 rethrow，赋值一定发生，
    // 但这样写省得跟 TS 的 try/catch 控制流分析较劲。
    let nostalgist: Nostalgist | null = null;
    let starting: Nostalgist | null = null;
    const audio = trackEmulatorAudio();
    const releaseCanvas = trackCanvasRuntime(canvas);
    let listeners: ReturnType<typeof trackRuntimeListeners> | null = null;
    const stopListening = () => listeners?.stop();
    const releaseResources = async () => {
      listeners?.dispose();
      // Read the runtime before exit: some builds destroy its accessors on exit.
      let runtime: EmulatorRuntime | null = null;
      try { runtime = (nostalgist ?? starting)?.getEmscripten() ?? null; } catch { /* Not initialized. */ }
      try { (nostalgist ?? starting)?.exit({ removeCanvas: false }); } catch { /* Continue cleanup. */ }
      try { if (runtime) await releaseEmulatorRuntime(runtime); }
      finally {
        releaseCanvas();
        await audio.dispose();
      }
      starting = null;
      nostalgist = null;
      listeners = null;
    };
    try {
      nostalgist = await Nostalgist.launch({
        beforeLaunch: (instance) => {
          starting = instance;
          listeners = trackRuntimeListeners([window, document, canvas]);
        },
        onLaunch: stopListening,
        element: canvas,
        core,
        /*
         * ROM 也必须以 `{ fileName, fileContent }` 的形式给，理由和下面的 BIOS 完全一样：
         * 直接传 File 会走 ResolvableFile 的 `isBlob` 分支，而那条路**不读 File.name**，
         * 最终落到 `generateValidFileName()` 生成一个随机名（`data<随机>.zip`）写进 content 目录。
         *
         * 对 NES / SFC 无所谓（核心按内容识别），但 **FBNeo / FBA 都是拿 zip 的文件名
         * （去扩展名）当 romset 名去查驱动表的** —— 名字变成 `data<随机>` 就查不到任何游戏，
         * 屏幕上是核心自己画的「Romset is unknown.」，跟 romset 版本、内容对不对全都无关。
         *
         * 名字用 `romFileName` 而不是 `file.name`：街机的那个名字可能是
         * `resolveArcadeCore()` 按内容认出来纠正过的（见 `lib/arcade-core.ts`）。
         *
         * 内容同理用 `romContent`：街机那盘可能是**重打包过**的（补了 zip 里的 rom 名），
         * 也可能取自整合包的内层 zip；NES / SFC 那条路则可能是 `unwrapRom()` 从压缩包里
         * 解出来的。只有「原样拖进来的普通 ROM」那一种情况它才等于 `file`。
         */
        rom: { fileName: romFileName, fileContent: romContent },
        ...coreSource,
        /*
         * BIOS 只能以 `{ fileName, fileContent }` 的形式给。
         *
         * 直接传 File 对象会走 ResolvableFile 的 `isBlob` 分支，而那条路**不读 File.name**
         * （`isBlob` 在 `loadFileSystemFileHandle` 之前），最后落到 `generateValidFileName()`
         * 生成一个随机名（`data<随机>.zip`）—— 文件被写进 system 目录时名字不对，
         * FBNeo 照样找不到。所以名字必须自己钉死。
         *
         * （nostalgist.d.ts 里那段注释写成 `filename` 是笔误，实现读的是 `fileName`。）
         */
        bios: bios ? { fileName: NEOGEO_BIOS_NAME, fileContent: bios } : undefined,
        /*
         * 电池存档在**启动前**写进虚拟文件系统，核心 boot 时读进内存 ——
         * 这就是「读档」落地的地方（见 `stageBatterySave`）。
         *
         * 只给字节不给文件名：落点和文件名由 Nostalgist 按内容名算
         *（`sramFilePath`，即 `…/retroarch/userdata/saves/<核心>/<ROM 名>.srm`）。
         */
        sram: sram ?? undefined,
        retroarchConfig: {
          ...bindingsToRetroArch(this.bindings),
          video_aspect_ratio_auto: true,
          video_windowed_fullscreen: false,
          // 单位是 dB，0 即原音量。此前设为 6.0（+6dB）会削波爆音。
          // 静音档刻意不用 -80 dB 表达，而是把音量停在最小可听档 + 打开静音开关 ——
          // 否则取消静音时要爬一百多步 VOLUME_UP 才回得来。
          audio_volume: levelToDb(Math.max(1, this.volumeLevel)),
          audio_mute_enable: this.volumeLevel === 0,
          input_overlay_enable: false,
          /*
           * 像素游戏不需要双线性过滤。
           *
           * 开着的话每一帧都要对整块画面多做一次重采样：像素边缘被抹开（画面发糊），
           * 而且这块 canvas 的后备存储是**按 devicePixelRatio 放大过的**
           * （720×540 在 2 倍屏上就是 1440×1080），全屏重采样的代价跟着翻四倍。
           * 核心构建的默认值不保证是关的，这里钉死。
           */
          video_smooth: false,
          /*
           * Nostalgist 的默认配置里写的是 `video_shader_enable: true`，但这个项目的
           * CRT 质感是**纯 CSS** 做的（扫描线 + 暗角，见 RetroTv / globals.css），
           * 核心侧从头到尾没有 shader 预设 —— 那条渲染管线整条都用不上，关掉省一层。
           */
          video_shader_enable: false,
          /*
           * ⚠️ 必须显式关掉 —— Nostalgist 的默认配置里它是 `true`
           * （`getDefaultRetroarchConfig()`），而 `retroarchConfig` 是**深合并**
           * 进那份默认里的（nostalgist.js 的 `merge`），不写这一行就等于开着。
           *
           * 开着时 Nostalgist 的 `saveSRAM()` / `saveState()` 会连缩略图一起等
           * （`Promise.all([waitForFile(...), waitForFile('...png')])`，**两个文件都到齐
           * 才返回**，最坏 120 次退避重试 ≈ 59 秒后才抛 `fs timeout`），而面板上那个
           * 进行中态是**刻意没有超时兜底**的（见 PlaySaveControls）—— 于是这将近一分钟
           * 界面就一直挂着，看起来像卡死。
           *
           * 缩略图全站一个地方都不用。
           *
           * ⚠️ **NDS 尤其需要这一行**：它的 melonds 是 EmulatorJS 构建，命令导出面
           * 和其余 7 个 `retroarch-emscripten-build` 核心不一样（见下面 `LOCAL_CORE_DIR`），
           * 那一版很可能根本不产 `.state.png`。
           */
          savestate_thumbnail_enable: false,
        },
        /*
         * 初始尺寸**写死屏幕尺寸，不要读 `canvas.width/height`**。
         *
         * 那两个属性会被改掉：核心启动后会按 devicePixelRatio 把后备存储设成
         * 720×dpr（125% 缩放就是 900×675），Nostalgist 退出时也不还原。读回来等于
         * 把上一次运行留下的脏值烤进这一次 —— 曾经的写法就是读回来的，于是设备缩放比
         * 一局一局乘上去（720 → 900 → 1125…），表现是「换第二盘游戏时整个机身变大」。
         * 屏幕那段的完整因果写在 RetroTv 的屏幕 div 上。
         *
         * 传固定的 720×540 也不影响清晰度：核心拿到 CSS 尺寸后会自己按 dpr 再设一次。
         *
         * ⚠️ NDS 例外：它是竖屏双屏，必须给 256×384，否则两屏会被 letterbox 成一条竖带。
         *    见 `INITIAL_SIZE` 那段注释。
         */
        size: INITIAL_SIZE[consoleType] ?? { width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
        style: {
          width: '100%',
          height: '100%',
        },
      });
    } catch (e) {
      await releaseResources();
      /*
       * 屏幕里没有任何地方能报错，日志是唯一的排查入口 —— 少了它，
       * 「拖进去没反应」就只剩雪花屏这一条线索。
       */
      console.error(
        `[nesload] 启动核心失败：${file.name}（${consoleType} / ${core}）`,
        e
      );
      throw e;
    } finally {
      stopListening();
      stopWatching?.();
    }

    this.instance = nostalgist;
    this.releaseResources = releaseResources;
    /*
     * 注入用的解码器在这里换掉（见 `overrideInjectionKeyMap`）。
     * 快照必须**在这里**取：`this.bindings` 之后随时会被键位面板改掉，
     * 而核心认的始终是这次启动写进去的那份。
     */
    overrideInjectionKeyMap(nostalgist, this.bindings);
    /*
     * 顺手探一次这是不是 EJS 核（NDS 的 melonds）—— 是的话暂停 / 存档 / 读档 / 重置
     * 走它自己那套（见 `createEjsControl`），不走 Nostalgist 那几条命令。
     */
    this.ejs = createEjsControl(nostalgist);
    /*
     * 带着存档开的那一局，再让 EJS 核自己读一遍文件：melonds 是 EJS 构建，目录约定
     * 和正经 RetroArch 构建不一样，它未必会去 Nostalgist 放文件的那个位置找。
     * 只有它有 `_refresh_save_files`（能力探测在 `createEjsControl` 里），其余 12 台是 null。
     */
    if (sram) this.ejs?.refreshSaveFiles?.();
    /*
     * EJS 核的键盘也得我们自己接：核心那条路在它身上是空的
     * （`rwebinput_is_pressed()` 被掏成 `return 0;`，见 `attachEjsKeyboard`），
     * 所以这里按能力探测决定挂不挂，挂上就跟着这次实例活。
     */
    this.detachEjsKeyboard = this.ejs?.simulate
      ? attachEjsKeyboard(this.ejs.simulate, () => this.bindings)
      : null;
    this.currentRom = {
      name: file.name,
      console: consoleType,
      size: file.size,
    };
    this.paused = false;

    // 记下这次启动实际用的音量 —— 运行时的 VOLUME_UP / VOLUME_DOWN 都是相对调整，
    // 基准必须和启动配置对上，否则档位和实际响度会越走越偏。
    this.volumeDb = levelToDb(Math.max(1, this.volumeLevel));
    this.muted = this.volumeLevel === 0;
  }

  /** 随时捕获当前整机状态，普通核心和 EJS 核分别走各自的快照接口。 */
  async saveState(): Promise<Blob> {
    if (!this.instance) throw new Error('No running game');
    if (this.ejs) return this.ejs.saveState();
    const { state } = await this.instance.saveState();
    if (!state.size) throw new Error('Empty emulator state');
    return state;
  }

  async loadState(bytes: Uint8Array): Promise<void> {
    if (!this.instance) throw new Error('No running game');
    if (this.ejs) this.ejs.loadState(bytes);
    else await this.instance.loadState(new Blob([new Uint8Array(bytes)]));
  }

  async downloadState(blob: Blob): Promise<void> {
    if (!this.currentRom) throw new Error('No running game');
    downloadFile(blob, `${this.currentRom.name.replace(/\.[^.]+$/, '')}.state`);
  }

  async saveBattery(): Promise<Blob | null> {
    if (!this.instance) return null;
    /*
     * 存档路径和刷盘命令属于 getEmulator() 返回的底层实例，
     * 不在外层 Nostalgist 对象上。路径在 d.ts 中是 private，运行时有 getter。
     */
    const emulator = this.instance.getEmulator() as unknown as {
      sramFilePath?: string;
      callCommand(command: string): void;
    };
    const fs = this.instance.getEmscriptenFS() as unknown as EmscriptenFs;
    if (!fs) throw new Error('Emulator filesystem unavailable');

    // 刷盘出错应报保存失败，不能回退到旧文件后声称本次进度已保存。
    emulator.callCommand('_cmd_savefiles');

    /*
     * 先看 Nostalgist 按 RetroArch 约定算出来的那个路径（非 EJS 核就落在那儿），
     * 拿不到再兜底扫一遍 —— melonds 是 EJS 构建，目录约定未必一样。
     */
    const direct = emulator.sramFilePath;
    const bytes =
      (direct ? readIfExists(fs, direct) : null) ?? findSaveFile(fs, SRAM_SEARCH_ROOTS);
    if (!bytes) return null;
    // 拷一份再包 Blob：`readFile` 给的是 FS 自己的缓冲，别让它跟着核心的写操作变
    return new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
  }

  /**
   * 把电池存档下载成 `.srm` 文件。传入已有的字节可避免重复抓取。
   *
   * 现在只有一个调用点：存档时 IndexedDB 不可用（隐私模式等）的**兜底** ——
   * 存不进去就退化成下载，否则那一下存档就白按了。
   *
   * 抓存档一律走本类的 `saveBattery()`，别再直接问 Nostalgist。
   */
  async downloadBattery(blob?: Blob): Promise<void> {
    if (!this.instance || !this.currentRom) return;
    const bytes = blob ?? (await this.saveBattery());
    if (!bytes) return;
    downloadFile(
      new Blob([bytes], { type: 'application/octet-stream' }),
      `${this.currentRom.name.replace(/\.[^.]+$/, '')}.srm`
    );
  }

  /**
   * 暂停 / 继续。
   *
   * EJS 核（NDS）**没有 PAUSE_TOGGLE 那条命令**，它的暂停是「停主循环」
   * （`toggleMainLoop(0)`，EJS 前端自己的暂停钮就是调它）—— 走 Nostalgist 的
   * `pause()` 在 NDS 上按了没反应，见 `createEjsControl`。
   */
  async togglePause(): Promise<void> {
    if (!this.instance) return;
    if (this.ejs) {
      this.paused = !this.paused;
      this.ejs.setPaused(this.paused);
      return;
    }
    // pause / resume 是同步的，返回 void
    if (this.paused) {
      this.instance.resume();
      this.paused = false;
    } else {
      this.instance.pause();
      this.paused = true;
    }
  }

  /**
   * 重置（回到刚插上卡带那一刻）。
   *
   * EJS 核同理没有 `_cmd_reset`，走它自己的 `system_restart()`。
   */
  async reset(): Promise<void> {
    if (!this.instance) return;
    if (this.ejs) {
      this.ejs.restart();
      return;
    }
    // Nostalgist 暴露的是 restart()，并没有 reset()
    this.instance.restart();
  }

  /**
   * 设定音量档位（0 = 静音，VOLUME_MAX = 原音量），返回夹紧后的档位。
   * 没有正在运行的实例时只记下来 —— 下次 loadRom 会把它作为 audio_volume 的初值。
   */
  setVolume(level: number): number {
    const next = Math.max(0, Math.min(VOLUME_MAX, Math.round(level)));
    this.volumeLevel = next;

    const instance = this.instance;
    if (!instance) return next;

    // 静音用 MUTE 开关表达，而不是把 dB 拉到 -80：
    // 后者要一百多步 VOLUME_DOWN 才爬得到，取消静音时还得再爬回来。
    if (next === 0) {
      if (!this.muted) {
        instance.sendCommand('MUTE');
        this.muted = true;
      }
      return next;
    }

    if (this.muted) {
      instance.sendCommand('MUTE');
      this.muted = false;
    }

    const target = levelToDb(next);
    const delta = target - this.volumeDb;
    // 按 RetroArch 的 0.5 dB/步补够条数：跨一档（6 dB）就是 12 条
    const steps = Math.round(Math.abs(delta) / RA_VOLUME_STEP_DB);
    if (steps > 0) {
      const command = delta > 0 ? 'VOLUME_UP' : 'VOLUME_DOWN';
      for (let i = 0; i < steps; i += 1) instance.sendCommand(command);
    }
    this.volumeDb = target;

    return next;
  }

  /**
   * 把某个手柄钮按下 / 松开。两处用得上：
   *
   *   · 联机时把**对方**的输入打进本机的另一个玩家位；
   *   · 掌机 / 触屏上那几颗虚拟钮（本机的 1P）。
   *
   * 其余 12 个机种走 Nostalgist：钮名 → 键名的换算由 `overrideInjectionKeyMap` 换过的
   * 那份解码器负责（启动时装的），所以喂进来的钮名只要在键位表里，就一定能合成出核心认的键。
   *
   * ⚠️ **EJS 核（NDS）不能走那条**：Nostalgist 的注入是把合成的键盘事件直接交给核心
   *    注册的键盘回调，而 EJS 核的键盘回调只用来喂它的键盘设备（查表那条被掏空了，
   *    见 `attachEjsKeyboard`）。它认的是 `simulate_input`，所以这里分一支直接打过去。
   *
   * 注意这是事件级注入（Nostalgist 没有帧级钩子），所以只能做到「对方一按这边就跟着按」，
   * 做不到逐帧锁步。局域网内 RTT 通常在个位数毫秒，实际手感够用；
   * 但两端一旦不同步（比如一边暂停了），错误不会自己纠正 —— 这是当前方案的天花板。
   */
  pressButton(button: string, player: number, down: boolean): void {
    const instance = this.instance;
    if (!instance) return;

    const simulate = this.ejs?.simulate;
    if (simulate) {
      /*
       * 喂进来的是 `string`（联机那头从网络上收的），得先确认它真是我们认识的钮名
       * —— 未知的钮名在下面那条路上会被解码器静默丢掉，这里也一样要丢掉。
       * 用 `hasOwnProperty` 而不是 `in`：`in` 认原型链，`'toString' in 那张表` 是 true。
       *
       * `player` 在本类里是 **1 基**（Nostalgist 的约定，`pressDown(button, player=1)`），
       * `simulate_input` 那边是 **0 基**，所以要减一。
       */
      if (!Object.prototype.hasOwnProperty.call(EJS_JOYPAD_ID, button)) return;
      simulate(player - 1, button as ButtonName, down);
      return;
    }

    // 必须传对象形式 `{ button, player }`。
    // 上层 Nostalgist.pressDown 只接受**一个**参数：
    //   pressDown(options) {
    //     if (typeof options === "string") return emulator.pressDown(options);
    //     return emulator.pressDown(options.button, options.player);
    //   }
    // 写成 pressDown(button, player) 会命中字符串分支，player 被静默丢掉、
    // 在底层退回默认值 1 —— 表现就是「对方怎么按都没用」。
    const options = { button, player };
    if (down) instance.pressDown(options);
    else instance.pressUp(options);
  }

  async exit(): Promise<void> {
    const instance = this.instance;
    const releaseResources = this.releaseResources;
    this.releaseResources = null;

    /*
     * 先把引用清干净再动手：下面任何一步抛异常，控制器也不会留着一个半死的实例，
     * isRunning 立刻变 false，界面不会卡在「还插着卡带」的状态。
     *
     * 键盘桥也要一起拆 —— 它挂在 `window` 上（不归 Nostalgist 管），
     * 留着的话下一盘游戏按同一个键会被两只手同时改状态。
     */
    this.detachEjsKeyboard?.();
    this.detachEjsKeyboard = null;
    this.instance = null;
    this.currentRom = null;
    this.paused = false;
    this.ejs = null;

    if (!instance) {
      await releaseResources?.();
      return;
    }

    try {
      // 先发一次 PAUSE_TOGGLE 再退出。
      // 这条命令和面板上的「暂停」走的是同一条路径，一定能停住画面和声音；
      // 万一核心构建的 exit() 没有真正终止 runtime（nostalgist 内部用
      // try/catch 把 exit 的异常吞掉了，出错时它照样会把状态标成 terminated），
      // 至少不会让用户看到游戏还在跑。
      instance.pause();
    } catch (e) {
      console.warn('退出前暂停失败', e);
    }

    try {
      // removeCanvas 必须为 false：canvas 由 React 渲染和管理，
      // 若让 Nostalgist 把它从 DOM 移除，React 后续会拿到脱离文档的节点。
      if (releaseResources) await releaseResources();
      else {
        const runtime = instance.getEmscripten();
        try { instance.exit({ removeCanvas: false }); }
        finally { await releaseEmulatorRuntime(runtime); }
      }
    } catch (e) {
      console.warn('退出模拟器时出错', e);
    }
  }
}
