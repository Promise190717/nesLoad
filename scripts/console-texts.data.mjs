/*
 * 14 台机种的中英介绍文案 —— **唯一一份**（2026-10-23）。
 *
 *   `scripts/fill-console-intros.mjs`   把缺的补上（只写 summary / description 为空的行）
 *   `scripts/strip-console-core-notes.mjs`  一次性去掉「本站的 X 游戏通过 Y 核心运行」这类写法
 *
 * ## 为什么要单独一份
 *
 * 这两件事本来是同一个快照的两个副本：先是 2026-10-14 的一次性种子脚本，2026-10-20 切
 * Supabase 时又在 `fill-console-intros.mjs` 里抄了一遍。2026-10-23 从介绍里删掉核心名时，
 * 两边各删一次才想起来「文案不能有两份」—— 抄两份的代价是改一半、另一半过半年又写回库里。
 * 所以这里抽出来，谁要这份文案都从这里 import。
 *
 * ## 文案的口径
 *
 * 每台三段：全称（简称）→ 一两个特色 → 代表作。**不写本站怎么实现的**：
 * 核心名（fceumm / mGBA / Genesis Plus GX / pcsx_rearmed / melonDS …）对访客没有意义，
 * 也不该占掉介绍最后一句的位置。
 *
 * 只写 zh / en 两份。其余 16 种语言没有独立文案，读取时逐字段回退到英文、再中文
 * （`lib/entity-text.ts` 的 `localizeEntityTexts`）—— 不往那 16 种里抄中文，
 * 抄进去库里就再也看不出「这一份到底翻没翻」。
 */

export const CONSOLE_TEXTS = [
  {
    type: 'nes',
    summary: '任天堂 1983 年推出的 8 位家用游戏机，本站库里的主力机种。',
    summaryEn: "Nintendo's 8-bit home console from 1983 — the backbone of this library.",
    description:
      '红白机（Family Computer，欧美版名 Nintendo Entertainment System，简称 NES）是任天堂于 1983 年在日本推出的 8 位家用游戏机。' +
      '它用十字键加 A / B 两颗钮定义了此后几十年的手柄布局，《超级马里奥兄弟》《塞尔达传说》《魂斗罗》等一大批游戏都从这台机器上起步。',
    descriptionEn:
      'The Family Computer — released by Nintendo in Japan in 1983 and known in the West as the Nintendo Entertainment System (NES) — ' +
      'is the 8-bit home console that defined the D-pad + A/B controller layout for decades to come. Super Mario Bros., ' +
      'The Legend of Zelda and Contra all started here.',
  },
  {
    type: 'snes',
    summary: '1990 年推出的 16 位家用游戏机，日版名 SFC。',
    summaryEn: 'The 16-bit home console from 1990, known as the Super Famicom in Japan.',
    description:
      '超级任天堂（日本本土名 Super Famicom，简称 SFC）是任天堂 1990 年推出的 16 位家用游戏机，也是红白机的正统续作。' +
      '它的 Mode 7 旋转缩放特效与《超级马里奥世界》《塞尔达传说：众神的三角力量》《街头霸王 II》等作品，' +
      '让它成为许多人心目中「最好的 16 位主机」。',
    descriptionEn:
      "The Super Nintendo (sold in Japan as the Super Famicom, or SFC) is Nintendo's 16-bit home console from 1990 and the direct " +
      'successor to the NES. Its Mode 7 scaling effects, plus classics like Super Mario World, The Legend of Zelda: A Link to the ' +
      'Past and Street Fighter II, made it many people\u2019s favorite 16-bit machine.',
  },
  {
    type: 'gb',
    summary: '任天堂 1989 年推出的掌上游戏机，四阶灰阶屏幕，全球销量过亿。',
    summaryEn: "Nintendo's handheld from 1989 — a four-shade screen that sold over 100 million units.",
    description:
      'Game Boy 是任天堂 1989 年推出的掌上游戏机：一块四阶灰阶的绿色液晶屏、十字键加 A / B 两颗钮，' +
      '靠四节五号电池能跑十几个小时，全球销量超过一亿台。《俄罗斯方块》《口袋妖怪 红 / 绿》' +
      '《塞尔达传说：梦见岛》都从这台机器起步。',
    descriptionEn:
      'The Game Boy is the handheld Nintendo released in 1989 — a four-shade green LCD, a D-pad and two buttons, ' +
      'running a dozen hours on four AA batteries, and more than 100 million units sold. Tetris, Pokémon Red & Green ' +
      'and The Legend of Zelda: Link\u2019s Awakening all started here.',
  },
  {
    type: 'gbc',
    summary: 'Game Boy 的彩色版本，1998 年推出，向下兼容黑白卡带。',
    summaryEn: 'The colour Game Boy from 1998, backwards compatible with the black-and-white cartridges.',
    description:
      'Game Boy Color 是任天堂 1998 年推出的彩色掌机，机身比初代 Game Boy 更薄，屏幕能显示五十余种颜色，' +
      '同时向下兼容此前的黑白卡带。《口袋妖怪 金 / 银》《塞尔达传说：不可思议的果实》是它最出名的作品。',
    descriptionEn:
      'The Game Boy Color is Nintendo\u2019s colour handheld from 1998: a slimmer body than the original Game Boy, ' +
      'a screen able to show more than fifty colours, and full backwards compatibility with the older ' +
      'black-and-white cartridges. Pokémon Gold & Silver and The Legend of Zelda: Oracle of Seasons are among ' +
      'its best-known titles.',
  },
  {
    type: 'gba',
    summary: '任天堂 2001 年推出的 32 位掌上游戏机。',
    summaryEn: "Nintendo's 32-bit handheld from 2001.",
    description:
      'Game Boy Advance（GBA）是任天堂 2001 年推出的 32 位掌上游戏机：横向机身、彩色屏幕，向下兼容原版 Game Boy 卡带。' +
      '《黄金太阳》《火焰之纹章》《口袋妖怪 红宝石 / 蓝宝石》等一大批作品都在它上面诞生。',
    descriptionEn:
      "The Game Boy Advance (GBA) is Nintendo's 32-bit handheld from 2001 — a landscape body with a full-color screen, backward " +
      'compatible with original Game Boy cartridges. Golden Sun, Fire Emblem, Pokémon Ruby & Sapphire and a whole generation of ' +
      'classics were born on it.',
  },
  {
    type: 'nds',
    summary: '任天堂 2004 年推出的双屏掌上游戏机，上下两块屏幕、下屏带触控。',
    summaryEn: "Nintendo's dual-screen handheld from 2004 — two screens, the lower one touch-enabled.",
    description:
      '任天堂 DS（Nintendo DS，简称 NDS）是任天堂 2004 年推出的掌上游戏机，最大特征是上下两块屏幕：' +
      '上屏显示画面，下屏带触控笔操作，另外还内置麦克风与无线联机。《新超级马里奥兄弟》《口袋妖怪 钻石 / 珍珠》' +
      '《雷顿教授》系列都在它上面诞生，全球销量超过一亿五千万台，是史上最畅销的掌机之一。',
    descriptionEn:
      "The Nintendo DS (NDS) is Nintendo's dual-screen handheld from 2004: the upper screen shows the action while " +
      'the lower one is touch-enabled and comes with a stylus, plus a built-in microphone and wireless multiplayer. ' +
      'New Super Mario Bros., Pokémon Diamond & Pearl and the Professor Layton series all began here — with over ' +
      '150 million units sold, it remains one of the best-selling handhelds ever.',
  },
  {
    type: 'md',
    summary: '世嘉 1988 年推出的 16 位家用游戏机，北美版叫 Genesis。',
    summaryEn: "Sega's 16-bit console from 1988, sold as the Genesis in North America.",
    description:
      '世嘉 MD（Mega Drive，北美版名 Genesis）是世嘉 1988 年推出的 16 位家用游戏机，' +
      '靠更快的处理器和偏硬派的游戏阵容与超级任天堂分庭抗礼：《刺猬索尼克》《怒之铁拳》' +
      '《梦幻之星》都出自这台机器。',
    descriptionEn:
      'The Sega Mega Drive — sold as the Genesis in North America — is Sega\u2019s 16-bit home console from 1988. ' +
      'A faster processor and a harder-edged line-up let it trade blows with the Super Nintendo: Sonic the Hedgehog, ' +
      'Streets of Rage and Phantasy Star all came from this machine.',
  },
  {
    type: 'gg',
    summary: '世嘉 1990 年推出的彩色掌上游戏机，硬件接近 Master System。',
    summaryEn: "Sega's colour handheld from 1990, built on Master System hardware.",
    description:
      'Game Gear 是世嘉 1990 年推出的彩色掌上游戏机，硬件规格与 Master System 相近，' +
      '换来一块能发光的彩色屏幕，代价是六节五号电池只能撑几个小时。' +
      '《刺猬索尼克》《噗哟噗哟》《梦幻之星外传》都有它的版本。',
    descriptionEn:
      'The Game Gear is Sega\u2019s colour handheld from 1990. Its hardware sits close to the Master System, ' +
      'trading battery life for a backlit colour screen: six AA batteries bought only a few hours of play. ' +
      'Sonic the Hedgehog, Puyo Puyo and Phantasy Star Gaiden all appeared on it.',
  },
  {
    type: 'sms',
    summary: '世嘉 1987 年推出的 8 位家用游戏机。',
    summaryEn: "Sega's 8-bit home console from 1987.",
    description:
      'Master System 是世嘉 1987 年推出的 8 位家用游戏机，机身同时带一个卡带插槽和一个卡片插槽，' +
      '在欧洲与巴西市场卖得相当好，生命力比在日本本土长得多。《神奇小子》《梦幻之星》是它的代表作。',
    descriptionEn:
      'The Master System is Sega\u2019s 8-bit home console from 1987. It carries both a cartridge slot and a card slot, ' +
      'and it fared far better in Europe and Brazil than it ever did in Japan. Wonder Boy and Phantasy Star are its ' +
      'signature titles.',
  },
  {
    type: '32x',
    summary: 'MD 的 32 位附加硬件，1994 年发售。',
    summaryEn: 'The 32-bit add-on for the Mega Drive, released in 1994.',
    description:
      '32X 是世嘉 1994 年为 MD 推出的 32 位附加硬件：它插在主机原本的卡带口上，' +
      '游戏卡带再插进它自己的插槽，等于给 MD 加了一颗 32 位处理器和更强的图形能力，' +
      '可惜上市不到两年就退场了。《VR 战士》《毁灭战士 32X》是它不多的名作。',
    descriptionEn:
      'The 32X is the 32-bit add-on Sega released for the Mega Drive in 1994. It plugs into the console\u2019s own ' +
      'cartridge slot while the game cartridge goes into a second slot on top of it, in effect grafting a 32-bit ' +
      'processor and stronger graphics onto the Mega Drive. It was discontinued less than two years later. ' +
      'Virtua Fighter and Doom 32X are among its few notable titles.',
  },
  {
    type: 'ws',
    summary: '万代 1999 年推出的掌上游戏机，横竖两个方向都能玩。',
    summaryEn: "Bandai's handheld from 1999, playable in either portrait or landscape.",
    description:
      'WonderSwan 是万代 1999 年推出的掌上游戏机，由横井军平设计，机身轻薄、横竖两个方向都能玩，' +
      '靠一节五号电池就能驱动。《机战 Compact》系列与《妖精战士》是它的招牌作品。',
    descriptionEn:
      'The WonderSwan is Bandai\u2019s handheld from 1999, designed by Gunpei Yokoi. It is slim and light, ' +
      'plays in either portrait or landscape orientation, and runs on a single AA battery. The Super Robot Wars ' +
      'Compact series and Arc the Lad are its signature titles.',
  },
  {
    type: 'ngp',
    summary: 'SNK 1998 年推出的掌上游戏机，街机游戏的家用掌上版。',
    summaryEn: "SNK's handheld from 1998 — the pocket-sized version of the Neo Geo.",
    description:
      'Neo Geo Pocket 是 SNK 1998 年推出的掌上游戏机，把街机厅的 Neo Geo 搬进掌心：' +
      '靠一颗微动开关摇杆和两颗按钮还原街机手感，《拳皇 R-2》《侍魂》《合金弹头》都有它的版本。',
    descriptionEn:
      'The Neo Geo Pocket is SNK\u2019s handheld from 1998, bringing the arcade Neo Geo into the palm of your hand: ' +
      'a micro-switched thumbstick and two buttons reproduce the arcade feel, and The King of Fighters R-2, ' +
      'Samurai Shodown and Metal Slug all appeared on it.',
  },
  {
    type: 'ps1',
    summary:
      '索尼 1994 年推出的 32 位家用游戏机，第一台出货量破亿的家用机，也是 CD-ROM 成为主流的开端。',
    summaryEn:
      "Sony's 32-bit console from 1994 — the first home console to ship over 100 million units, and the one that made CD-ROM the standard.",
    description:
      'PlayStation（索尼 PlayStation，简称 PS1）是索尼 1994 年推出的 32 位家用游戏机，' +
      '也是第一台出货量突破一亿台的家用机。它把游戏从卡带带进 CD-ROM 时代：' +
      '《最终幻想 VII》《合金装备》《生化危机》《山脊赛车》都在它上面诞生。',
    descriptionEn:
      'The Sony PlayStation (PS1) is Sony\u2019s 32-bit home console from 1994 — the first home console to ship ' +
      'more than 100 million units, and the one that moved games from cartridges to CD-ROM. Final Fantasy VII, ' +
      'Metal Gear Solid, Resident Evil and Ridge Racer all started here.',
  },
  {
    type: 'arcade',
    /* 街机跨越几十年，没有单一发售年份 —— releaseYear 留空 */
    summary: '街机厅里的投币游戏，各机台的硬件规格都不一样。',
    summaryEn: 'Coin-op cabinet games, each running on its own hardware.',
    description:
      '街机（Arcade）泛指投币式商用游戏机：《拳皇》《街霸》《恐龙快打》《雷电》这些名字都来自街机厅的机台。' +
      '街机没有统一的硬件规格，不同厂商、不同年代的基板差别很大。',
    descriptionEn:
      '"Arcade" covers coin-operated cabinet games: The King of Fighters, Street Fighter, Cadillacs and Dinosaurs, Raiden — ' +
      'all of them lived in arcade halls. There is no single arcade hardware standard: boards differ wildly across makers ' +
      'and eras.',
  },
];
