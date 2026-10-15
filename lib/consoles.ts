/*
 * 机种登记表（**全站唯一来源**）。
 *
 * 2026-10-14 从 `components/CartridgeSprite.tsx` 挪过来的。挪的理由是「谁来读它」变了：
 * 加了 GB / GBC / MD / GG / SMS / 32X / WonderSwan / Neo Geo Pocket 之后，读这张表的
 * 地方从「两处渲染」变成了三类：
 *   · 服务端：首页、`/consoles`、`/games` 的筛白名单、几个后台接口；
 *   · 客户端组件：房间的筛选条、掌机面键、后台表单；
 *   · 纯逻辑模块：`lib/netplay.ts`（要把会话消息里的机种字符串收回枚举）。
 * 最后一类决定了它不能放在组件里（`lib/*` 反过来依赖组件是这个项目一直不许的），
 * 也不能放进 `lib/emulator.ts`（那个文件顶层就跑 `installAudioTap()`，要 Audio API，
 * 服务端组件 import 它会直接炸）。所以单独开一个**没有副作用的纯数据模块**。
 *
 * ⚠️ `components/CartridgeSprite.tsx` 仍然原样再导出这三个名字，老 import 路径不用动。
 *
 * ⚠️ **加机种要动的地方**（`Record<ConsoleType, …>` 那几处会编译报错提醒，数组不会）：
 *   ① 这里（`CONSOLE_LABEL` / `CONSOLE_TYPES` / `CONSOLE_TINT`）；
 *   ② `lib/emulator.ts`（`ConsoleType` / `CORE_MAP` / `EXTENSION_MAP` / `detectConsole`）；
 *   ③ `lib/server/games.ts` 的 `countGamesByConsole` 初始化对象；
 *   ④ `lib/unwrap.ts` 的内层扩展名表（zip 里装着这种 ROM 时要能拆）；
 *   ⑤ `components/HandheldConsole.tsx` 的 `FACE_ROWS`（掌机面键按机种长）；
 *   ⑥ `lib/server/upstream.ts` 的 `toConsoleType`（上游页面文字 → 站内机种）；
 *   ⑦ `scripts/add-consoles.mjs` 的默认资料（数据库那边补行）。
 */
import type { ConsoleType } from './emulator';

/**
 * 机种短标签 —— **丝印词，不进文案表**（中英文站都是这几个词）。
 *
 * 它同时出现在四个地方（首页卡片 18px、`/consoles` 卡片占位 16px、游戏卡片的机型行、
 * 后台表格），所以**长度必须控制在 3 个字符以内** —— 那些位置都不宽，
 * 「NGP」「SMS」已经是极限，再加一个字就截断成省略号。
 */
export const CONSOLE_LABEL: Record<ConsoleType, string> = {
  nes: 'NES',
  snes: 'SFC',
  gb: 'GB',
  gbc: 'GBC',
  gba: 'GBA',
  nds: 'NDS',
  md: 'MD',
  gg: 'GG',
  sms: 'SMS',
  '32x': '32X',
  ws: 'WS',
  ngp: 'NGP',
  arcade: 'ARC',
};

/**
 * 全部机种，**按界面上的展示顺序**。
 *
 * 顺序刻意按「阵营 + 年代」排：任天堂家用机 → 任天堂掌机（GB 一系 + NDS）→ 世嘉 →
 * 其它掌机（万代 / SNK）→ 街机。首页那个「按机种浏览」区块和 `/games` 的机种筛选条
 * 共用这一份，两处各写一份迟早会漂。
 *
 * ⚠️ 2026-10-15 加到十三个（NDS）。原来十二个正好是首页四列网格的三整行，现在末尾
 *    会**只剩一张卡**在第四行 —— 这是刻意的取舍，不为此再补一个机种凑数。
 */
export const CONSOLE_TYPES: readonly ConsoleType[] = [
  'nes',
  'snes',
  'gb',
  'gbc',
  'gba',
  'nds',
  'md',
  'gg',
  'sms',
  '32x',
  'ws',
  'ngp',
  'arcade',
];

/**
 * 端头色块：一眼区分机种，同时不破坏整体灰阶。
 *
 * 只用在卡带 sprite 那条 5px 的竖条上（见 `CartridgeSprite`），所以取的都是
 * 低饱和的中间调 —— 饱和度高一点就会从那块灰阶界面里跳出来。
 * 十三个色相彼此拉开，但刻意不要求「认色识机种」，那件事由旁边的丝印词负责。
 */
export const CONSOLE_TINT: Record<ConsoleType, string> = {
  nes: '#d16c70',
  snes: '#6fa8c9',
  gb: '#7fa05f',
  gbc: '#b57fa8',
  gba: '#8f7bd6',
  // NDS：双屏时代那台银色翻盖机，取一个偏冷的浅灰蓝 —— 和上面 GBA 的紫刻意拉开
  nds: '#9aa3b8',
  md: '#3f74b0',
  gg: '#8a8f6f',
  sms: '#4fa39c',
  '32x': '#a8455f',
  ws: '#d08a5f',
  ngp: '#7a7f9c',
  arcade: '#c96f6f',
};

/**
 * 这段地址 / 这条消息里的机种字符串是不是真机种。
 *
 * 三处在用，语义都是「收敛脏值」而不是「校验表单」：
 *   · `lib/netplay.ts` 把会话消息里的 `c` 字段还原成机种；
 *   · `/consoles/[type]` 与后台机种接口判断地址里那段是不是机种（不是就 404 / 拒绝）。
 */
export function isConsoleType(value: string): value is ConsoleType {
  return (CONSOLE_TYPES as readonly string[]).includes(value);
}
