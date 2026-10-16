/*
 * 给 `games` / `developers` 补**英文内容**（2026-10-13 用户要求：站点双语，内容原来只有中文）。
 *
 * 用法：
 *   node --env-file=.env.local scripts/fill-i18n-content.mjs [--dry-run]
 *
 * 和 add-i18n-fields.mjs 的分工：
 *   那个脚本负责**加列**（结构），这个负责**填内容**（数据）。
 *
 * ⚠️ 三条安全约定（和 fill-games-description.mjs 同一套）：
 *   ① **只补英文列**，一个中文字段都不碰；全程没有 DELETE / DROP。
 *   ② **幂等**：只写「对应 `_en` 列 NULL / 全空白」的行 —— 后台手填过的英文不会被覆盖，
 *      所以可以反复执行，将来加了新游戏再跑一次只补新的那几条。
 *   ③ 改前改后各打一次总条数，条数有任何变化立刻报警。
 *
 * 文案以 **id 为键**（标题有重名的：「塞尔达传说：众神的三角力量」中英两版就是两条记录）。
 *
 * ⚠️ 命名规则：无后缀 = 中文原文，`_en` = 英文。英文站取不到就回退中文
 *    （见 lib/server/games.ts 的 localizeGame），所以这里漏一条也不会显示空白。
 *
 * ⚠️ `games.developer_en` 是 `developers.name_en` 的**快照**（与 `developer` 列对称）：
 *    先在 developers 里把 name_en 写好，再由最后一段 SQL 按 developer_id 反查补齐。
 *
 * ⚠️ **2026-10-16：游戏文案搬进了 `game_texts` 侧表**。`games` 上那几列
 *    （`title_en` / `series_en` / `description_en`）现在是**只写不读的投影** ——
 *    只更新它们，前台一个字都看不到。所以下面 games 那段循环**同时写两处**：
 *    `games` 的投影列 + `game_texts` 的 en 行（判空看侧表自己的现状，不看投影列）。
 *
 *    这个脚本是迁移之前写的，那份硬编码英文数据仍然有参考价值（要重建库时能派上用场），
 *    但**新加游戏走后台**（/admin/games）就行，不必再回来跑它。
 *
 * ⚠️ **同日（2026-10-16）文案又改挂 `group_key`**：一行 games 是「一盘 ROM」，同一款游戏的
 *    中英日韩四个版本是四行，而文案只有一份 —— 侧表挂 `group_key`（同款共用一个值）。
 *    所以下面读写侧表用的都是 `group_key`（从 `games.group_key` 取，老行退回自己的 id）。
 */

const { CF_ACCOUNT_ID, CF_D1_API_TOKEN, D1_DATABASE_ID } = process.env;
const DRY_RUN = process.argv.includes('--dry-run');

if (!CF_ACCOUNT_ID || !CF_D1_API_TOKEN || !D1_DATABASE_ID) {
  console.error('缺少环境变量：需要 CF_ACCOUNT_ID / CF_D1_API_TOKEN / D1_DATABASE_ID');
  console.error('用法：node --env-file=.env.local scripts/fill-i18n-content.mjs [--dry-run]');
  process.exit(1);
}

const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

/** 跑一条 SQL（带绑定参数），返回 D1 那一整条 result（含 meta.changes）。 */
async function run(sql, params = []) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_D1_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  const data = await res.json();
  if (!res.ok || !data.success || !data.result?.[0]?.success) {
    const detail = (data.errors ?? []).map((e) => e.message).filter(Boolean).join('; ');
    throw new Error(`${detail || `HTTP ${res.status}`}（语句：${sql.replace(/\s+/g, ' ')}）`);
  }
  return data.result[0];
}

const countGames = async () => Number((await run('SELECT COUNT(*) AS n FROM games')).results[0]?.n ?? 0);
const countDevelopers = async () =>
  Number((await run('SELECT COUNT(*) AS n FROM developers')).results[0]?.n ?? 0);

/* ============================================================== 1) 厂商英文 */

/**
 * `name`（中文名 / 原名）→ 英文字段。以 name 为键（库里唯一）。
 * 原名本身就是英文的（SNK / Namco / Rare…），name_en 仍写一份 ——
 * 这样 `games.developer_en` 的快照才有值，英文站不必再回退。
 */
const DEVELOPERS = [
  {
    name: '任天堂',
    nameEn: 'Nintendo',
    summaryEn: 'The Kyoto company that started with playing cards and went on to define the modern home console.',
    descriptionEn:
      'Founded in 1889 as a maker of hanafuda playing cards, Nintendo grew into the very definition of video games. It produced the Famicom (NES), Super Nintendo and Game Boy — consoles that rewrote the industry — and created household-name series such as Mario, The Legend of Zelda, Pokémon and Kirby. The Super Mario Bros., The Legend of Zelda and Kirby titles on this site are all its work.',
  },
  {
    name: '科乐美',
    nameEn: 'Konami',
    summaryEn: 'A Japanese giant spanning arcades and home consoles, with classics in action, shooting and music games.',
    descriptionEn:
      'Konami was founded in Osaka in 1969, made its name in arcades, and went on to release home-console classics such as Contra, Castlevania, Metal Gear and Pro Evolution Soccer. It excels at side-scrolling action and shooting in particular — the Contra series and the arcade Teenage Mutant Ninja Turtles on this site are both its work.',
  },
  {
    name: '卡普空（Capcom）',
    nameEn: 'Capcom',
    summaryEn: 'A Japanese publisher famed for fighting and action games — the home of Street Fighter and Mega Man.',
    descriptionEn:
      'Founded in Osaka in 1979, Capcom is one of Japan’s most influential game companies. It created era-defining series including Street Fighter, Mega Man, Devil May Cry, Resident Evil and Monster Hunter, and is especially known for arcade fighting games and side-scrolling action. Street Fighter II Turbo, Mega Man 2, Final Fight and Chip ’n Dale Rescue Rangers on this site are all its work.',
  },
  {
    name: '史克威尔',
    nameEn: 'Square',
    summaryEn: 'A Japanese studio known for JRPGs — the creator of Final Fantasy and Chrono Trigger.',
    descriptionEn:
      'Square was founded in 1986 and became famous for Japanese role-playing games. Its Final Fantasy series defined an era, while Chrono Trigger and Seiken Densetsu were just as influential. In 2003 it merged with Enix to form Square Enix. Chrono Trigger, featured on this site, is a highlight of its golden age.',
  },
  {
    name: 'Hudson Soft',
    nameEn: 'Hudson Soft',
    summaryEn: 'A prolific Famicom-era studio behind the Bomberman and Adventure Island series.',
    descriptionEn:
      'Founded in Sapporo in 1973, Hudson Soft began by making beekeeping equipment and grew into one of the most active third-party studios of the Famicom (NES) era as a close partner of Nintendo. Its Bomberman and Adventure Island games were staples of the time. The company was absorbed into Konami in 2012.',
  },
  {
    name: 'SNK',
    nameEn: 'SNK',
    summaryEn: 'A Japanese company famed for fighting games and Neo Geo hardware — the home of The King of Fighters and Metal Slug.',
    descriptionEn:
      'Founded in Osaka in 1978, SNK was a major player in the golden age of arcades. It introduced the Neo Geo platform and became famous for fighting games such as The King of Fighters, Fatal Fury and Samurai Shodown, later taking the Metal Slug series under its wing. The King of Fighters ’97 / ’98 / ’99 and Metal Slug 2 / 3 on this site are all its work.',
  },
  {
    name: 'Nazca',
    nameEn: 'Nazca',
    summaryEn: 'The developer of the original Metal Slug, later acquired by SNK.',
    descriptionEn:
      'Nazca was a Japanese game developer best known for the 1996 arcade run-and-gun shooter Metal Slug. It excelled at pixel art and satisfying shooting, and that first game remains a high point of the genre. The company was later absorbed by SNK, and its members continued to work on subsequent Metal Slug titles.',
  },
  {
    name: 'Namco',
    nameEn: 'Namco',
    summaryEn: 'The Japanese studio behind Pac-Man — a veteran arcade maker from before its merger with Bandai.',
    descriptionEn:
      'Founded in Tokyo in 1955, Namco was one of Japan’s oldest arcade and home-console makers. Its Pac-Man is one of the most successful arcade games ever, and Tekken, Ace Combat and the Tales series also bear its name. In 2005 it merged with Bandai to form Bandai Namco.',
  },
  {
    name: 'Technōs Japan',
    nameEn: 'Technōs Japan',
    summaryEn: 'The Japanese studio behind Kunio-kun and Double Dragon — a pioneer of side-scrolling beat-’em-ups.',
    descriptionEn:
      'Founded in 1981, Technōs Japan developed the Kunio-kun (Renegade) series and the Double Dragon series. Its hot-blooded world and punchy beat-’em-up action influenced a whole generation of side-scrolling action games. The company folded in 1996, and its IPs were later picked up by Arc System Works.',
  },
  {
    name: 'Winkysoft',
    nameEn: 'Winkysoft',
    summaryEn: 'A veteran Japanese contract developer behind several early Super Robot Wars titles.',
    descriptionEn:
      'Founded in Osaka in 1983, Winkysoft was a Japanese contract developer best known for its early work on the Super Robot Wars series. It also produced titles such as Magic Knight Rayearth. The company closed in 2015.',
  },
  {
    name: 'Heartbeat',
    nameEn: 'Heartbeat',
    summaryEn: 'A Japanese developer of several Super Nintendo-era titles for Nintendo.',
    descriptionEn:
      'Heartbeat was a Japanese game developer active during the Super Nintendo (SNES) era, producing several titles for Nintendo and others. It was less famous than the major publishers, but was one of the many contract studios that made up the Japanese game industry of the time.',
  },
  {
    name: '东亚企划',
    nameEn: 'Toaplan',
    summaryEn: 'A Japanese arcade studio known for its bullet-hell shoot-’em-ups.',
    descriptionEn:
      'Toaplan was one of the defining Japanese arcade shooter studios of the late 1980s, with titles such as Tiger-Heli, Twin Cobra and Batsugun, known for high difficulty and a hard-edged feel. The company went bankrupt in 1994, but its members went on to found famous bullet-hell studios such as Cave, extending its influence to this day.',
  },
  {
    name: 'Mega Enterprise',
    nameEn: 'Mega Enterprise',
    summaryEn: 'A Korean developer that worked on parts of the Metal Slug series.',
    descriptionEn:
      'Mega Enterprise is a Korean game developer that took part in developing parts of the Metal Slug series during the arcade era, and stands as one of the early examples of the Korean game industry reaching an international audience.',
  },
  {
    name: 'Rare',
    nameEn: 'Rare',
    summaryEn: 'A legendary British studio, creator of the Donkey Kong Country and Banjo-Kazooie series.',
    descriptionEn:
      'Rare is one of Britain’s most renowned game studios, formed in 1985 from the team behind Ultimate Play the Game. Working with Nintendo, it released classics such as Donkey Kong Country, GoldenEye 007 and Banjo-Kazooie during the SNES and N64 eras, and was later acquired by Microsoft. Donkey Kong Country 2 on this site is one of its signature works.',
  },
  {
    name: 'Iguana Entertainment',
    nameEn: 'Iguana Entertainment',
    summaryEn: 'An American developer known for the Turok series and sports games.',
    descriptionEn:
      'Iguana Entertainment was an American game developer founded in Austin, Texas in 1991 and later folded into Acclaim. It was known for the Turok series on the N64 and a range of sports titles, and also handled ports of several cross-platform games.',
  },
  {
    name: 'Midway',
    nameEn: 'Midway',
    summaryEn: 'An American arcade giant, the developer of the Mortal Kombat series.',
    descriptionEn:
      'Midway was a major American arcade and home-console company founded in 1958, with hits including the Mortal Kombat series and NBA Jam. It was known for high-intensity arcade action and fighting games; after its 2009 bankruptcy its assets were taken over by Warner Bros. Games. Ultimate Mortal Kombat 3 on this site is one of its titles.',
  },
  {
    name: '派克兄弟',
    nameEn: 'Parker Brothers',
    summaryEn: 'A veteran American toy and game company that published several NES titles.',
    descriptionEn:
      'Parker Brothers was a long-established American toy and board-game company founded in 1883, best known for publishing Monopoly. During the NES era it also entered video games, publishing titles such as Q*bert.',
  },
  {
    name: '鈊象电子',
    nameEn: 'IGS',
    summaryEn: 'A major arcade studio from China’s Taiwan, the developer of Oriental Legend and Knights of Valour.',
    descriptionEn:
      'IGS (International Games System) is a major arcade game company from China’s Taiwan, founded in 1989. It is widely known across the Chinese-speaking world for side-scrolling beat-’em-ups such as Oriental Legend and Knights of Valour, and is one of the flagships of Chinese arcade gaming.',
  },
];

/* ============================================================== 2) 游戏英文 */

/**
 * 游戏英文文案，以 id 为键。字段可缺省（缺省即不填那一列，留空让前台回退中文）。
 * `title` 只用来打日志，随手核对「这条对应哪款游戏」。
 * 顺序按库里的列表顺序（created_at DESC），方便对着看。
 */
const GAMES = [
  {
    id: '47dff6f4-7176-4dda-abae-10ec36135f1a',
    title: '侍魂',
    titleEn: 'Samurai Shodown',
    seriesEn: 'Samurai Shodown',
    descriptionEn:
      'SNK’s weapon-based fighting game set in the Edo period. A single well-placed slash can take half a life bar, and the Rage Gauge unleashes a devastating special — giving it a rhythm of attack and defense unlike the punch-and-kick fighters of its day. Haohmaru, Ukyo Tachibana and Nakoruru went on to become series staples.',
  },
  {
    id: 'a82bf75d-c7f8-4853-94d2-ba8824d6b31f',
    title: '惩罚者',
    titleEn: 'The Punisher',
    descriptionEn:
      'Capcom’s side-scrolling beat-’em-up based on the Marvel comic. Players control the Punisher and Nick Fury as they tear through the mob, able to pick up guns for ranged fire or grab and throw enemies up close — one of the most satisfying two-player co-op games in the arcade.',
  },
  {
    id: 'c67c71d5-eae4-48bd-b606-4b5e670a3314',
    title: '西游释厄传',
    titleEn: 'Oriental Legend',
    seriesEn: 'Oriental Legend',
    descriptionEn:
      'A side-scrolling action game by China’s Taiwan studio IGS, based on Journey to the West. Sun Wukong, Zhu Bajie and the others each have their own treasures and signature moves, with up to four players on screen. The flamboyant treasure attacks and co-op finishers made it one of the most popular arcade cabinets in Chinese arcades of the day.',
  },
  {
    id: '184078ea-b923-40b4-ad8a-301f0bf6b7b6',
    title: '吞食天地II 赤壁之战（街机三国志）',
    titleEn: 'Warriors of Fate',
    seriesEn: 'Tenchi wo Kurau',
    descriptionEn:
      'Capcom’s Three Kingdoms beat-’em-up, known in China simply as “arcade Romance of the Three Kingdoms.” Each of the Five Tiger Generals has combos and a special, and the horseback stages, hidden elements and rock-arranged classical melodies left a lasting impression. Widely regarded as the benchmark of the side-scrolling beat-’em-up.',
  },
  {
    id: '40af50ff-91a2-454d-a9ab-58f4f745d8ca',
    title: '吞食天地（街机三国志）',
    titleEn: 'Tenchi wo Kurau',
    seriesEn: 'Tenchi wo Kurau',
    descriptionEn:
      'Capcom’s early Three Kingdoms action game, built mainly around mounted combat: you charge into battle on horseback, cutting down foes, and can also dismount to fight on foot. It was the predecessor to Warriors of Fate and set the tone for the whole product line.',
  },
  {
    id: '7e395f61-c719-4e7f-85d7-d40935ab40ec',
    title: '龙与地下城：暗黑秘影',
    titleEn: 'Dungeons & Dragons: Shadow over Mystara',
    seriesEn: 'Dungeons & Dragons',
    descriptionEn:
      'Capcom’s fantasy beat-’em-up that brought the levels, equipment and spell systems of the tabletop RPG into the arcade. Adding the Thief and Magic-User, an item inventory, branching routes and multiple endings, it packed a volume of content rare for its genre.',
  },
  {
    id: '922946c1-6c8e-4db7-994b-0f2777cdfef8',
    title: '龙与地下城：毁灭之塔',
    titleEn: 'Dungeons & Dragons: Tower of Doom',
    seriesEn: 'Dungeons & Dragons',
    descriptionEn:
      'Capcom’s fantasy beat-’em-up adapted from the tabletop RPG of the same name. Four classes — Fighter, Elf, Cleric and Dwarf — each have their own spells and gear, and you can buy items from merchants along the way with the gold you collect. A rare arcade title of its time with a full RPG system built in.',
  },
  {
    id: 'c7b82bb5-8f7c-4586-9a16-c0ca167fe5d9',
    title: '名将',
    titleEn: 'Captain Commando',
    seriesEn: 'Captain Commando',
    descriptionEn:
      'Capcom’s side-scrolling beat-’em-up. Captain Commando leads a four-strong squad — a mummy, a ninja and a baby in a mech — who can pilot mechs and vehicles and support up to four players. Both its sci-fi setting and its feel are rock solid.',
  },
  {
    id: 'cfa1ea7f-b34a-4a51-9c34-939587bb58e4',
    title: '恐龙快打',
    titleEn: 'Cadillacs and Dinosaurs',
    seriesEn: 'Cadillacs and Dinosaurs',
    descriptionEn:
      'Capcom’s side-scrolling beat-’em-up based on the comic Xenozoic Tales, blending dinosaurs with a post-apocalyptic city. Players can pick up guns and throwing items and even ride dinosaurs, clearing the streets with four-player co-op — a universally beloved arcade classic.',
  },
  {
    id: '93736544-279b-4257-9754-33d359fde9b7',
    title: '三国战纪2',
    titleEn: 'Knights of Valour 2',
    seriesEn: 'Knights of Valour',
    descriptionEn:
      'A Three Kingdoms side-scrolling action game from China’s Taiwan studio IGS. Building on its predecessor with new characters and a combo system, it lets you chain flashy strings out of items, specials and “power-up” bursts, with multiplayer support — a place where a generation of kids spent their pocket money.',
  },
  {
    id: '77ab32d7-be11-4c40-94bb-d3d7275d6f27',
    title: '三国战纪',
    titleEn: 'Knights of Valour',
    seriesEn: 'Knights of Valour',
    descriptionEn:
      'A Three Kingdoms side-scrolling action game from China’s Taiwan studio IGS. You can pick generals such as Guan Yu and Zhang Fei, collect items and treasures along the way, and land satisfying “one-combo clears,” making it one of the most enduring cabinets in Chinese arcades.',
  },
  {
    id: 'a136227d-4361-496f-b31b-2b64f3882ec1',
    title: '雪人兄弟',
    titleEn: 'Snow Bros',
    seriesEn: 'Snow Bros',
    descriptionEn:
      'A fixed-screen action game by Toaplan (the Famicom port). Spray enemies into snowballs and kick them away — the snowball knocks over the friends behind it, and in two-player co-op you can even roll your partner into a ball. Simple rules, hopelessly addictive.',
  },
  {
    id: 'b4ca5ede-3c45-409d-9d5f-7600e3ab1e4d',
    title: '双截龙3：圣石',
    titleEn: 'Double Dragon 3: The Rosetta Stone',
    seriesEn: 'Double Dragon',
    descriptionEn:
      'Technōs’s beat-’em-up. Billy and Jimmy travel the world in search of the Rosetta Stones, switching between allies such as a ninja and a swordsman along the way. Each character has distinct moves, and the interaction with terrain and traps is richer than in the first two games.',
  },
  {
    id: '115aa2a3-3441-4577-b419-46fcf08222cc',
    title: '双截龙',
    titleEn: 'Double Dragon',
    seriesEn: 'Double Dragon',
    descriptionEn:
      'Technōs’s beat-’em-up, in which Billy Lee takes on a street gang alone to rescue his girlfriend. Punches, elbows, knees and kicks each map to their own moves, with a dash of platforming thrown in. It was an early landmark of the genre and influenced a whole wave of fighting and beat-’em-up games.',
  },
  {
    id: '70831d1f-a211-458e-8509-b074c04b85cd',
    title: '坦克大战',
    titleEn: 'Battle City',
    seriesEn: 'Battle City',
    descriptionEn:
      'Namco’s classic shooter (the Famicom version). Protect your base and destroy every enemy tank to clear a stage; power-ups along the way boost your firepower and shields, and it even ships with a level editor. Two-player co-op doubles the fun.',
  },
  {
    id: '3dd9b353-73cc-4475-a619-0ee4be7b4096',
    title: '高桥名人之冒险岛 IV',
    titleEn: 'Adventure Island IV',
    seriesEn: 'Adventure Island',
    descriptionEn:
      'The final Famicom entry in Hudson’s Adventure Island series, and the first to let you play as a heroine. Skateboarding, surfing, fruit for stamina and egg-hunting for items are all here, and it is as unforgiving as ever — a capstone for the series.',
  },
  {
    id: 'b5dd0375-b2f2-4410-96f9-1cc8273342e7',
    title: '松鼠大作战2',
    titleEn: 'Chip ’n Dale Rescue Rangers 2',
    seriesEn: 'Chip ’n Dale Rescue Rangers',
    descriptionEn:
      'Capcom’s side-scrolling action game based on the Disney cartoon. Chip and Dale can hoist crates to smash enemies and pick up and throw their partner, so in two-player co-op you can use each other as weapons. Light and easy to pick up, it is one of the most fun co-op games on the NES.',
  },
  {
    id: 'd873caa9-f9ba-4cef-871b-de5d4e6b8012',
    title: '合金弹头6',
    titleEn: 'Metal Slug 6',
    seriesEn: 'Metal Slug',
    descriptionEn:
      'SNK’s side-scrolling shooter. It introduced new vehicles such as the “Mammoth” you can seize from enemy troops, and brought Clark and Ralf from the Ikari Warriors series into the fight, maxing out firepower and satisfaction — a late-series standout.',
  },
  {
    id: '83e598ff-37c3-4d41-bb25-e54374ed4680',
    title: '合金弹头5',
    titleEn: 'Metal Slug 5',
    seriesEn: 'Metal Slug',
    descriptionEn:
      'SNK’s side-scrolling shooter. It added a slide and rapid fire, making the pace faster than its predecessor, but with fewer stages and a slower PvP tempo — one of the more divisive entries in the series.',
  },
  {
    id: 'df02bdf6-c38a-44cc-be14-1ef1669358ec',
    title: '合金弹头4',
    titleEn: 'Metal Slug 4',
    seriesEn: 'Metal Slug',
    descriptionEn:
      'A side-scrolling shooter in the Metal Slug series. It introduced the “Metal Slug” mechanic: collecting parts along the way unlocks hidden vehicles and routes, and the chaos of two-player co-op is as lively as ever.',
  },
  {
    id: '7b175149-489d-453f-b747-7de4fcec7ae1',
    title: '合金弹头3',
    titleEn: 'Metal Slug 3',
    seriesEn: 'Metal Slug',
    descriptionEn:
      'Regarded by many as the peak of the series. Its branching routes are numerous — from snowfields and the deep sea all the way to an alien mothership — with zombie and mummy transformations and a wealth of vehicles. No other entry packs in as much content.',
  },
  {
    id: '2bb18db7-e73b-48b1-8852-4b06625de3ca',
    title: '合金弹头2',
    titleEn: 'Metal Slug 2',
    seriesEn: 'Metal Slug',
    descriptionEn:
      'SNK’s side-scrolling shooter. It established the “Slug” vehicle system, and packs grenades, multi-route stages and a wealth of hidden secrets. The screen-filling explosions in two-player co-op look superb — a classic endlessly revisited since the arcade era.',
  },
  {
    id: 'a9fca987-f824-4a63-ab1a-1df2e10d1307',
    title: '合金弹头',
    titleEn: 'Metal Slug',
    seriesEn: 'Metal Slug',
    descriptionEn:
      'The first game in the Metal Slug series, a side-scrolling shooter. Famous for its hand-drawn frame-by-frame animation and screenfuls of humorous detail: rescuing POWs earns you weapons, and any vehicle you seize can be driven on the spot. Its tight, satisfying shooting set the tone for the whole series.',
  },
  {
    id: '12a2a0c6-9fa9-4f38-aaf5-3d25901cfcf1',
    title: '三国志街机',
    titleEn: 'Sangokushi',
    descriptionEn:
      'A Three Kingdoms-themed arcade action game. Players control generals of Shu Han, cutting down foes stage by stage, chaining combos and unleashing specials in the melee while taking in sweeping battlefield set-pieces and satisfying hit feedback.',
  },
  {
    id: '1f4f35b6-feb9-4ee6-b2db-ee5e31e82038',
    title: 'JOJO的奇妙冒险',
    titleEn: 'JoJo’s Bizarre Adventure',
    seriesEn: 'JoJo’s Bizarre Adventure',
    descriptionEn:
      'Winkysoft’s fighting game adapted from Hirohiko Araki’s manga of the same name. Built around “Stands” and Ripple specials, its character entrances and super-move flourishes capture the feel of the source, making it a well-regarded manga-adaptation fighter.',
  },
  {
    id: '18792540-0f5a-4a5c-852a-8af436339ec5',
    title: '高桥名人之冒险岛III',
    titleEn: 'Adventure Island III',
    seriesEn: 'Adventure Island',
    descriptionEn:
      'Hudson’s side-scrolling action game, and the first in the series to add rideable dinosaur companions. Each dinosaur has its own abilities — charge, fly or breathe fire — and exploration and puzzle elements weigh heavier than before.',
  },
  {
    id: 'e2b68bcc-fe9c-430e-a416-bfdf47a1ac39',
    title: '高桥名人之冒险岛II',
    titleEn: 'Adventure Island II',
    seriesEn: 'Adventure Island',
    descriptionEn:
      'Hudson’s side-scrolling action game, with Takahashi Meijin’s girlfriend Tina as the lead. You can ride dinosaurs and pick up a variety of weapons, and the number of stages and secrets is greatly expanded — the most substantial entry in the series.',
  },
  {
    id: '2d4afc14-6fb3-4dcd-85ee-977f954fb487',
    title: '高桥名人之冒险岛',
    titleEn: 'Adventure Island',
    seriesEn: 'Adventure Island',
    descriptionEn:
      'Hudson’s side-scrolling action game. Skateboard and surf, eat fruit to refill your stamina gauge, and lose stamina on contact — one mistake sends you back to the start. A Famicom classic whose difficulty and fame rose together.',
  },
  {
    id: '7d832b1a-55d7-47a7-9583-1c2d70208b3a',
    title: '最终幻想V',
    titleEn: 'Final Fantasy V',
    seriesEn: 'Final Fantasy',
    descriptionEn:
      'Square’s role-playing game, famed for its flexible job system. Players can freely combine more than twenty jobs and skills for enormous variety; the story revolves around four crystals, and it is widely considered the series entry with the “most fun systems.”',
  },
  {
    id: 'd1637aed-3925-4c7b-a309-9b3a70da2799',
    title: '最终幻想VI',
    titleEn: 'Final Fantasy VI',
    seriesEn: 'Final Fantasy',
    descriptionEn:
      'Widely considered one of the peaks of the series, an RPG that tells the fate of fourteen characters through an ensemble narrative. The Magicite system lets the whole party learn magic freely, and the opera-house scene and the world’s collapse in the second half are still talked about today.',
  },
  {
    id: '3f2ea743-dfa9-443c-83d0-9ae7425a819f',
    title: '大富翁',
    titleEn: 'Monopoly',
    seriesEn: 'Monopoly',
    descriptionEn:
      'A party-style take on the classic board game of real estate. Roll the dice to buy land, build houses and collect rent until your rivals are bankrupt — the rules are instantly clear, perfect for passing time with friends.',
  },
  {
    id: '765c84e0-3592-40ae-859c-59e7caf7dd5f',
    title: '辛普森一家：巴特的噩梦',
    titleEn: 'The Simpsons: Bart’s Nightmare',
    seriesEn: 'The Simpsons',
    descriptionEn:
      'Konami’s side-scrolling action game based on the cartoon. After Bart falls asleep he tumbles into a series of nightmares, and must recover his homework — blown away by the wind — across wildly different dream stages. The bizarre set-pieces and level design are the main draw, and it is no pushover either.',
  },
  {
    id: '927e6a45-0bb9-41c8-b9f5-feb9d2066729',
    title: '花式台球',
    titleEn: 'Pool',
    seriesEn: 'Pool',
    descriptionEn:
      'A billiards game centred on American eight-ball and nine-ball. Aim, power and spin are all finely controllable, with two-player matches — perfect for two people taking turns to test their touch and positioning.',
  },
  {
    id: '7390a6e2-c76d-442f-80ed-40f3128948f7',
    title: '漫威超级英雄：宝石战争',
    titleEn: 'Marvel Super Heroes: War of the Gems',
    seriesEn: 'Marvel Super Heroes',
    descriptionEn:
      'Capcom’s side-scrolling action game based on the Marvel comics. Players control heroes such as Spider-Man, Captain America and Iron Man, collecting the Infinity Gems one by one. Each character plays and moves very differently — a rare gem among Marvel adaptations.',
  },
  {
    id: 'c307097b-b479-49b1-bbf1-22a08aafd241',
    title: '勇者斗恶龙VI 幻之大地',
    titleEn: 'Dragon Quest VI: Realms of Revelation',
    seriesEn: 'Dragon Quest',
    descriptionEn:
      'Enix’s national-treasure RPG. Built around a job system and a dual narrative across the “dream” and “real” worlds, the heroes must uncover the truth behind a world split in two. Both the story and the character-building content are substantial.',
  },
  {
    id: '815e33a9-a46b-4310-a383-20432f4579b1',
    title: '超级马里奥世界2：耀西岛',
    titleEn: 'Super Mario World 2: Yoshi’s Island',
    seriesEn: 'Super Mario',
    descriptionEn:
      'Nintendo’s platformer in a crayon-and-picture-book style. Mario and Yoshi team up to protect Baby Mario, and the egg-tossing, enemy-swallowing and mid-air hovering mechanics are endlessly inventive. It is regarded as a peak of 2D platforming.',
  },
  {
    id: 'fff9d458-f4fd-4bcd-ac92-0a919556a38e',
    title: '实况世界足球2：战斗十一人',
    titleEn: 'International Superstar Soccer',
    seriesEn: 'Pro Evolution Soccer',
    descriptionEn:
      'Konami’s soccer game, celebrated for its timing-based passing and shooting. Teams and formations are freely selectable, and it plays well solo against the computer or in two-player versus.',
  },
  {
    id: 'b5be3e94-1074-443a-a26c-d5f67e5a1247',
    title: '大金刚国度3：迪西·金刚的双重麻烦！',
    titleEn: 'Donkey Kong Country 3: Dixie Kong’s Double Trouble!',
    seriesEn: 'Donkey Kong Country',
    descriptionEn:
      'A side-scrolling platformer developed by Rare. Dixie and Baby Kong team up, able to ride animal companions as they travel through jungles, underwater and beehives. Its pre-rendered-3D-to-pixel visuals and soundtrack were a technical marvel of the day.',
  },
  {
    id: '2fee2bce-3ec8-4339-8873-24267d8f845e',
    title: '超级双截龙',
    titleEn: 'Super Double Dragon',
    seriesEn: 'Double Dragon',
    descriptionEn:
      'Technōs’s beat-’em-up, with Billy Lee and his crew taking on the gang once more. Its animation is smoother than the NES version, with blocking, grapples and specials worked into a more coherent system, supporting two-player co-op against the street thugs.',
  },
  {
    id: '22a8a8d8-a9bc-481b-9467-a93b650b4c8c',
    title: '实况足球',
    titleEn: 'Pro Evolution Soccer',
    seriesEn: 'Pro Evolution Soccer',
    descriptionEn:
      'Konami’s soccer game series. Emphasising how the game feels and its match tempo, players control a team to pull off passing moves and shots, with two-player versus — one of the most enduring soccer games of its era.',
  },
  {
    id: 'd1d4b55f-3ebd-49b0-928f-e24df5177215',
    title: '忍者神龟4：时空神龟',
    titleEn: 'Teenage Mutant Ninja Turtles IV: Turtles in Time',
    seriesEn: 'Teenage Mutant Ninja Turtles',
    descriptionEn:
      'Konami’s side-scrolling beat-’em-up, considered by many the best in the Turtles series. The four turtles travel through time, and the signature move of grabbing an enemy and hurling him at the screen is wonderfully cathartic, with four-player co-op.',
  },
  {
    id: '4dfcffd0-4706-459c-843e-6375cf2efd32',
    title: '超级炸弹人3',
    titleEn: 'Super Bomberman 3',
    seriesEn: 'Bomberman',
    descriptionEn:
      'Hudson’s classic place-a-bomb game. Clear grid mazes with bombs and blast open the exit; power-ups transform your firepower, speed and movement in countless ways. Playable solo through the stages or with friends for multiplayer fun.',
  },
  {
    id: '52f3e41c-8915-4df4-b775-3ab0caeee632',
    title: '超级炸弹人5',
    titleEn: 'Super Bomberman 5',
    seriesEn: 'Bomberman',
    descriptionEn:
      'A Bomberman series entry from Hudson. Alongside the classic stage-clear and versus modes, this title adds mechanical companions that the Bombermen can ride — the messier the multiplayer matches, the better.',
  },
  {
    id: 'b5313ab1-13e1-44d6-b346-181cc53fdc9d',
    title: '终极真人快打3',
    titleEn: 'Ultimate Mortal Kombat 3',
    seriesEn: 'Mortal Kombat',
    descriptionEn:
      'An enhanced version of the Mortal Kombat fighting series. Building on Mortal Kombat 3, it adds back classic characters and brutal Fatalities, with moves and combos that are easier to pick up — one of the best-selling fighting games of its day.',
  },
  {
    id: '3cb99d93-a0c3-4d7f-bce9-9ccf57c1670a',
    title: '超级炸弹人4',
    titleEn: 'Super Bomberman 4',
    seriesEn: 'Bomberman',
    descriptionEn:
      'A Bomberman series entry from Hudson. Focused on the stage-clear and versus modes, its power-up combinations and maze design give every match a new approach, with multiplayer especially replayable.',
  },
  {
    id: '2e224c0a-a12e-4c13-a8d5-21e190e1c9df',
    title: '超级炸弹人2',
    titleEn: 'Super Bomberman 2',
    seriesEn: 'Bomberman',
    descriptionEn:
      'A Bomberman series entry from Hudson. Place bombs to clear enemies and blast passages forward, collecting power-ups that strengthen your firepower and movement along the way; multiplayer is the most classic way to play the series.',
  },
  {
    id: '76a26779-ab7f-4d1f-8b4a-a787b9090884',
    title: '炸弹人2',
    titleEn: 'Bomberman II',
    seriesEn: 'Bomberman',
    descriptionEn:
      'The classic place-a-bomb puzzle-action game. Set bombs in grid mazes to clear enemies and blast open the exit — raise your firepower too high and you can trap yourself. Two-player versus is especially good fun.',
  },
  {
    id: 'a6f03a7a-334d-430a-b7b4-d8adeac9eed2',
    title: '吃豆人',
    titleEn: 'Pac-Man',
    seriesEn: 'Pac-Man',
    descriptionEn:
      'Namco’s arcade legend and one of the most famous games in video game history. Eat all the dots in the maze and dodge four ghosts, then turn the tables on them once you swallow a Power Pellet. The rules fit in a sentence, yet it never gets old.',
  },
  {
    id: '81ff0c30-e920-4b88-a389-f0ea6ea689d8',
    title: '松鼠大作战',
    titleEn: 'Chip ’n Dale Rescue Rangers',
    seriesEn: 'Chip ’n Dale Rescue Rangers',
    descriptionEn:
      'Capcom’s side-scrolling action game based on the Disney cartoon Chip ’n Dale. Hoist crates to smash enemies and lift and throw your partner — in two-player co-op you can step on and throw each other, doubling the fun.',
  },
  {
    id: 'ec4026ad-cfbc-4725-b733-3799e9fb1cf3',
    title: '拳皇 98',
    titleEn: 'The King of Fighters ’98',
    seriesEn: 'The King of Fighters',
    descriptionEn:
      'SNK’s fighting game, dubbed the series’ “Dream Match” by players. It gathers popular characters from across the series and drops the story to focus on balance and feel, with a three-on-three team system, assists and moves all tuned to a tee — still the benchmark of The King of Fighters.',
  },
  {
    id: 'bd898576-27d0-4410-8f4b-c1fcdd8fa2d3',
    title: '拳皇 99',
    titleEn: 'The King of Fighters ’99',
    seriesEn: 'The King of Fighters',
    descriptionEn:
      'SNK’s fighting game, the first in the series to introduce the “Striker” system, moving to four-versus-four team battles. Its art direction and setting shift toward science fiction, marking the turning point out of the Orochi Saga into a new chapter.',
  },
  {
    id: '632c7d88-13b4-40f5-86a7-2b7ba335079c',
    title: '拳皇 97',
    titleEn: 'The King of Fighters ’97',
    seriesEn: 'The King of Fighters',
    descriptionEn:
      'SNK’s fighting game, and the most blazingly popular entry in Chinese arcades. The finale of the Orochi Saga, its story of the Three Sacred Treasures and the Eight Hakkesshu, its wealth of secrets and its smooth combos keep people playing head-to-head more than twenty years on.',
  },
  {
    id: '787f0bf8-b5cf-40dc-ab11-a239ce499957',
    title: '塞尔达传说',
    titleEn: 'The Legend of Zelda',
    seriesEn: 'The Legend of Zelda',
    descriptionEn:
      'Nintendo’s pioneering action-adventure game. Roam the vast land of Hyrule freely, collect items, conquer dungeons and defeat Ganon; the “save + explore + puzzle” framework it established would prove enormously influential.',
  },
  {
    id: '29850446-770d-4741-ab30-d2d9ec19089b',
    title: '双截龙 II：复仇',
    titleEn: 'Double Dragon II: The Revenge',
    seriesEn: 'Double Dragon',
    descriptionEn:
      'Technōs’s beat-’em-up and the most popular entry in the series. Moves and terrain interaction are richer, and the action runs from the streets all the way onto a helicopter; two-player co-op against the gang makes it one of the most classic co-op games on the NES.',
  },
  {
    id: 'cfd79dd9-f0db-4430-8457-4307c9646f4d',
    title: '星之卡比 梦之泉物语',
    titleEn: 'Kirby’s Adventure',
    seriesEn: 'Kirby',
    descriptionEn:
      'A side-scrolling action game from HAL Laboratory, and the first in the series to add “Copy Abilities.” Swallow an enemy and Kirby takes on its power — dozens of transformations make for wildly varied play, all wrapped in a charming, easygoing adventure.',
  },
  {
    id: '1fa45160-f626-41b5-a24a-a93ef020447c',
    title: '洛克人2',
    titleEn: 'Mega Man 2',
    seriesEn: 'Mega Man',
    descriptionEn:
      'Capcom’s side-scrolling action game, considered by many the most classic entry in the series. Its eight bosses can be tackled in any order, each yielding its weapon when defeated; using weaknesses to break the game open, its level design and difficulty balance are just right.',
  },
  {
    id: '64117570-a9e4-4463-b353-b479bf3e1283',
    title: '俄罗斯方块',
    titleEn: 'Tetris',
    seriesEn: 'Tetris',
    descriptionEn:
      'The block-stacking puzzle game known the world over. Fit the pieces together to clear lines as the drop speed rises with each level, testing your planning more and more as you go. The rules fit in one sentence, yet it is impossible to put down.',
  },
  {
    id: '13161a37-f0bc-41a6-a190-a521f8c562a5',
    title: '超级马里奥兄弟3',
    titleEn: 'Super Mario Bros. 3',
    seriesEn: 'Super Mario',
    descriptionEn:
      'Nintendo’s side-scrolling platformer, widely considered the peak of the NES. Its rich transformations such as the Raccoon Suit and Frog Suit, world-map stage selection and wealth of hidden elements pushed the series to new heights.',
  },
  {
    id: '847e4ca3-28c7-4e28-8f26-43dcd58b9e14',
    title: '忍者神龟2：街机版',
    titleEn: 'Teenage Mutant Ninja Turtles II: The Arcade Game',
    seriesEn: 'Teenage Mutant Ninja Turtles',
    descriptionEn:
      'Konami’s port of its arcade beat-’em-up to the NES. Leonardo, Raphael, Michelangelo and Donatello each wield their own weapon, and two-player co-op cleans up the sewers and streets of New York — one of the most classic co-op games on the NES.',
  },
  {
    id: '337cbc18-631c-47f9-9d4a-2ee49b144902',
    title: '超级马里奥兄弟',
    titleEn: 'Super Mario Bros.',
    seriesEn: 'Super Mario',
    descriptionEn:
      'Nintendo’s side-scrolling platformer and the most important game in video game history. Stomp the Goombas, bump blocks for a mushroom to grow bigger, and adventure from 1-1 onward — it practically defined the platformer genre.',
  },
  {
    id: '5d6b78a8-bccc-4ae0-b05a-dee2644c2d46',
    title: '魂斗罗',
    titleEn: 'Contra',
    seriesEn: 'Contra',
    descriptionEn:
      'Konami’s side-scrolling shooter, known to Chinese players for its “up, up, down, down, left, right, left, right, B, A” thirty-lives code. Two-player co-op runs through jungles and bases with machine guns in hand — satisfying to play, and decidedly hardcore.',
  },
  {
    id: '15ae135b-3bfa-4cb4-bc50-37073f86fa7f',
    title: '星之卡比3',
    titleEn: 'Kirby’s Dream Land 3',
    seriesEn: 'Kirby',
    descriptionEn:
      'A side-scrolling action game from HAL Laboratory, and the first in the series to give Kirby dedicated animal companions. Fusing with a partner changes his abilities endlessly; the warm art style and gentle difficulty make it ideal for grabbing a friend for two-player co-op.',
  },
  {
    id: 'f54d6136-4b5e-4642-8bb3-4180bb520569',
    title: '快打旋风3',
    titleEn: 'Final Fight 3',
    seriesEn: 'Final Fight',
    descriptionEn:
      'Capcom’s beat-’em-up, with Guy, Cody and Haggar taking on Metro City once more. It adds charge specials and more moves for a more solid hit feel, with two-player co-op beating down the street gangs.',
  },
  {
    id: '0076fffc-13c3-4ab5-80de-2c195a3224a3',
    title: '快打旋风2',
    titleEn: 'Final Fight 2',
    seriesEn: 'Final Fight',
    descriptionEn:
      'Capcom’s beat-’em-up. It adds characters and moves, with stages running from the streets to exotic locales; two-player co-op sweeps away the gang, making it a bridging entry in the series.',
  },
  {
    id: 'a542bceb-8dec-4c81-96c5-971efb3ee03a',
    title: '快打旋风',
    titleEn: 'Final Fight',
    seriesEn: 'Final Fight',
    descriptionEn:
      'Capcom’s side-scrolling beat-’em-up. Guy, Cody and Mayor Haggar fight through the gang to rescue the kidnapped Jessica. One of the early cornerstones of the genre, it is also the origin point of the Street Fighter series.',
  },
  {
    id: 'b2664dd4-8c4b-4c35-8ed8-8ee8610fd90b',
    title: '大金刚国度2：迪迪的鬼屋冒险',
    titleEn: 'Donkey Kong Country 2: Diddy’s Kong Quest',
    seriesEn: 'Donkey Kong Country',
    descriptionEn:
      'Rare’s side-scrolling platformer. Diddy Kong and his girlfriend Dixie team up, able to ride animal companions and switch between the two; the level design and soundtrack were technically first-rate at the time.',
  },
  {
    id: 'b851a792-f104-4814-89a5-ee3e3d7c0f49',
    title: '魂斗罗III：异形战争',
    titleEn: 'Contra III: The Alien Wars',
    seriesEn: 'Contra',
    descriptionEn:
      'Konami’s side-scrolling shooter. It is the first in the series to add multiple branching routes and top-down stages, with weapons that can be dual-wielded and combined and endings that change with your route — substantial in both content and difficulty.',
  },
  {
    id: '317da6d6-94b0-40b6-a45a-4e4217b3b703',
    title: '超级银河战士',
    titleEn: 'Super Metroid',
    seriesEn: 'Metroid',
    descriptionEn:
      'Nintendo’s side-scrolling action-exploration game and the cornerstone of the “Metroidvania” genre. Freely explore the planet Zebes and unlock abilities layer by layer; its map design, atmosphere and control feel are still held up as a textbook.',
  },
  {
    id: 'e4a763f3-1e12-4245-9dd7-9cecd1c08bb9',
    title: '时空之轮',
    titleEn: 'Chrono Trigger',
    seriesEn: 'Chrono Trigger',
    descriptionEn:
      'An RPG from Square, brought together by Akira Toriyama, Yuji Horii and Hironobu Sakaguchi. Built around time travel, enemies are visible and there are no random encounters, and its multiple endings and sheer polish keep it permanently near the top of “best RPG ever” lists.',
  },
  {
    id: 'ab59df49-3f2d-446c-9f13-60e0c1c0f1e3',
    title: '街头霸王 II Turbo',
    titleEn: 'Street Fighter II Turbo',
    seriesEn: 'Street Fighter',
    descriptionEn:
      'The classic version of Capcom’s fighting game. Building on the “Four Kings,” it speeds up the pace, lets you switch between character special-move versions and even unlock hidden characters — the busiest head-to-head cabinet in the arcade.',
  },
  {
    id: '2a343946-0f0d-454c-ac16-10ce62f1524c',
    title: '塞尔达传说：众神的三角力量',
    titleEn: 'The Legend of Zelda: A Link to the Past',
    seriesEn: 'The Legend of Zelda',
    descriptionEn:
      'Nintendo’s top-down action-adventure game, regarded as one of the peaks of the series. Travel back and forth between the Light World and the Dark World, with dungeon puzzles and item interactions that are exquisitely crafted; the basic framework of the Zelda series to follow was laid down here. This version has a Chinese fan translation, so the story can be read directly.',
  },
  {
    id: '4b9b4e81-692b-4246-b546-25be3f7400f4',
    title: '塞尔达传说：众神的三角力量',
    titleEn: 'The Legend of Zelda: A Link to the Past',
    seriesEn: 'The Legend of Zelda',
    descriptionEn:
      'Nintendo’s top-down action-adventure game, regarded as one of the peaks of the series. Travel back and forth between the Light World and the Dark World, with dungeon puzzles and item interactions that are exquisitely crafted; the basic framework of the Zelda series to follow was laid down here. This is the original version, preserving its original text and presentation.',
  },
  {
    id: '7690944b-22e5-4a54-8ab3-a42472cfd63e',
    title: '超级马里奥世界',
    titleEn: 'Super Mario World',
    seriesEn: 'Super Mario',
    descriptionEn:
      'Nintendo’s side-scrolling platformer, and the game that introduced Yoshi. Don the Cape Feather to glide and hunt for hidden exits and branching routes — a strong sense of exploration makes it a culmination of 2D Mario.',
  },
];

/* ============================================================== 执行 */

console.log(DRY_RUN ? '== 空跑（不会写入任何东西）==' : '== 开始 ==');

const beforeGames = await countGames();
const beforeDevelopers = await countDevelopers();
console.log(`games 现有 ${beforeGames} 条（英文文案 ${GAMES.length} 条）；developers 现有 ${beforeDevelopers} 条（英文文案 ${DEVELOPERS.length} 条）。`);

/* ---------- 1) developers ---------- */

const devRows = (await run('SELECT id, name, name_en, summary_en, description_en FROM developers')).results;
const devByName = new Map(devRows.map((row) => [row.name, row]));
const devById = new Map(devRows.map((row) => [row.id, row]));

let devUpdated = 0;
let devSkipped = 0;

console.log('\n--- developers ---');
for (const entry of DEVELOPERS) {
  const row = devByName.get(entry.name);
  if (!row) {
    console.error(`⚠️ 库里没有厂商「${entry.name}」，跳过`);
    devSkipped += 1;
    continue;
  }

  // 三列分别判断：哪列空就补哪列（后台可能只手填了 name_en）
  const setClauses = [];
  const params = [];
  if (!row.name_en || String(row.name_en).trim() === '') {
    setClauses.push('name_en = ?');
    params.push(entry.nameEn);
  }
  if ((!row.summary_en || String(row.summary_en).trim() === '') && entry.summaryEn) {
    setClauses.push('summary_en = ?');
    params.push(entry.summaryEn);
  }
  if ((!row.description_en || String(row.description_en).trim() === '') && entry.descriptionEn) {
    setClauses.push('description_en = ?');
    params.push(entry.descriptionEn);
  }

  if (setClauses.length === 0) {
    devSkipped += 1;
    console.log(`· 跳过（英文已齐）：${entry.name}`);
    continue;
  }

  if (DRY_RUN) {
    devUpdated += 1;
    console.log(`· [dry-run] 会写入：${entry.name} -> ${entry.nameEn}（补 ${setClauses.length} 列）`);
    continue;
  }

  const sql = `UPDATE developers SET ${setClauses.join(', ')} WHERE id = ?`;
  const result = await run(sql, [...params, row.id]);
  if (result.meta?.changes) {
    devUpdated += 1;
    console.log(`✅ ${entry.name} -> ${entry.nameEn}`);
  } else {
    devSkipped += 1;
    console.log(`· 跳过（写入时条件已不成立）：${entry.name}`);
  }
}

/* ---------- 2) games ---------- */

const gameRows = (
  await run(
    'SELECT id, title, title_en, series_en, developer_en, description_en, COALESCE(group_key, id) AS group_key FROM games'
  )
).results;
const gameById = new Map(gameRows.map((row) => [row.id, row]));

/*
 * 侧表里现存的英文行（2026-10-16 加；同日改挂 `group_key`）。
 * ⚠️ 判「要不要写」用的是**侧表自己的现状**，不是 `games` 上那几列 ——
 *    那几列现在只是投影，拿它当「已经写过了」的依据会让侧表永远补不上。
 * ⚠️ 侧表一行 = **一款**（挂 `group_key`，同款的几个语言版本共用一份）——
 *    所以这里的键是 `group_key` 而不是 `game_id`。下面写完会顺手更新这张表，
 *    免得 GAMES 里同款的两条记录都以为「侧表还没有 en 行」而撞主键。
 */
const enTextRows = (
  await run('SELECT group_key, title, series, description FROM game_texts WHERE locale = ?', ['en'])
).results;
const enTextByGroup = new Map(enTextRows.map((row) => [row.group_key, row]));

let gameUpdated = 0;
let gameSkipped = 0;

console.log('\n--- games ---');
for (const entry of GAMES) {
  const row = gameById.get(entry.id);
  if (!row) {
    console.error(`⚠️ 库里没有这条游戏（${entry.id} ${entry.title}），跳过`);
    gameSkipped += 1;
    continue;
  }

  /* ---- ① games 上那几个投影列（只写不读，见文件头）---- */
  const setClauses = [];
  const params = [];
  /* 每一列单独判断 —— 后台可能已手填其中一列，只补空的那几列。 */
  if (entry.titleEn && (!row.title_en || String(row.title_en).trim() === '')) {
    setClauses.push('title_en = ?');
    params.push(entry.titleEn);
  }
  if (entry.seriesEn && (!row.series_en || String(row.series_en).trim() === '')) {
    setClauses.push('series_en = ?');
    params.push(entry.seriesEn);
  }
  if (entry.descriptionEn && (!row.description_en || String(row.description_en).trim() === '')) {
    setClauses.push('description_en = ?');
    params.push(entry.descriptionEn);
  }

  /* ---- ② game_texts 的 en 行（**前台读的就是它**，见文件头）---- */
  const enText = enTextByGroup.get(row.group_key) ?? { title: null, series: null, description: null };
  const textPatch = {};
  if (entry.titleEn && (!enText.title || String(enText.title).trim() === '')) {
    textPatch.title = entry.titleEn;
  }
  if (entry.seriesEn && (!enText.series || String(enText.series).trim() === '')) {
    textPatch.series = entry.seriesEn;
  }
  if (entry.descriptionEn && (!enText.description || String(enText.description).trim() === '')) {
    textPatch.description = entry.descriptionEn;
  }
  const textKeys = Object.keys(textPatch);

  if (setClauses.length === 0 && textKeys.length === 0) {
    gameSkipped += 1;
    console.log(`· 跳过（英文已齐）：${entry.title}`);
    continue;
  }

  if (DRY_RUN) {
    gameUpdated += 1;
    console.log(
      `· [dry-run] 会写入：${entry.title} -> ${entry.titleEn}` +
        `（games 补 ${setClauses.length} 列 / game_texts 补 ${textKeys.length} 列）`
    );
    continue;
  }

  if (setClauses.length > 0) {
    await run(`UPDATE games SET ${setClauses.join(', ')} WHERE id = ?`, [...params, row.id]);
  }

  if (textKeys.length > 0) {
    /*
     * upsert 侧表的 en 行。已存在就只覆盖这次要补的那几列（别的列原样留着）；
     * 不存在就整行插进去。
     *
     * ⚠️ 第一个参数是 **`row.group_key`**（不是游戏 id）：同款的几个语言版本共用一份文案
     *    （2026-10-16）。写完之后顺手把本地那张表也更新掉 —— 否则 GAMES 里同款的下一条
     *    记录还会以为「侧表没有 en 行」而走 INSERT，撞主键。
     *
     * ⚠️ `developer` **不在这个脚本的射程内** —— 厂名由 `developers` 反查后写进每一份文案
     *    （见 lib/server/games.ts 的 withDeveloper），所以插新行时留空，读取时回退中文厂名。
     *    真要补侧表里的英文厂名，跑下面第 3 段那条 SQL 的配套脚本或走后台。
     */
    if (enTextByGroup.has(row.group_key)) {
      const sets = textKeys.map((key) => `${key} = ?`);
      await run(
        `UPDATE game_texts SET ${sets.join(', ')}, updated_at = ? WHERE group_key = ? AND locale = ?`,
        [...textKeys.map((key) => textPatch[key]), Date.now(), row.group_key, 'en']
      );
      Object.assign(enTextByGroup.get(row.group_key), textPatch);
    } else {
      await run(
        `INSERT INTO game_texts (group_key, locale, title, series, developer, description, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.group_key,
          'en',
          textPatch.title ?? null,
          textPatch.series ?? null,
          null,
          textPatch.description ?? null,
          Date.now(),
        ]
      );
      enTextByGroup.set(row.group_key, {
        title: textPatch.title ?? null,
        series: textPatch.series ?? null,
        description: textPatch.description ?? null,
      });
    }
  }

  gameUpdated += 1;
  console.log(
    `✅ ${entry.title} -> ${entry.titleEn}` +
      `（games ${setClauses.length} 列 / game_texts ${textKeys.length} 列）`
  );
}

/* ---------- 3) games.developer_en 快照（按 developer_id 从 developers.name_en 反查）----------
 *
 * 与 `games.developer`（中文快照）对称：英文站要显示厂商英文名，直接读这一列即可。
 * 只在「developer_en 为空、且 developer_id 有值」时补，不覆盖后台手填的。
 */

if (!DRY_RUN) {
  const syncResult = await run(
    `UPDATE games
        SET developer_en = (SELECT name_en FROM developers WHERE developers.id = games.developer_id)
      WHERE (developer_en IS NULL OR TRIM(developer_en) = '')
        AND developer_id IS NOT NULL
        AND (SELECT name_en FROM developers WHERE developers.id = games.developer_id) IS NOT NULL`,
  );
  console.log(`\n--- developer_en 快照 ---`);
  console.log(`按 developer_id 反查补齐 ${syncResult.meta?.changes ?? 0} 条 games.developer_en。`);

  /*
   * 侧表那份厂名（2026-10-16 加）—— **读取来源**。规则与 lib/server/games.ts 的
   * `withDeveloper` 一致：英文行写 `developers.name_en`，只补空的、不覆盖已有的
   * （后台手填过的留着）。中文行不在这儿管：它的厂名是 `games.developer` 那一份，
   * 由 add-game-group-key.mjs 的迁移 / 后台写入负责。
   *
   * ⚠️ 关联条件走 **`COALESCE(g.group_key, g.id) = game_texts.group_key`**（同日改挂
   *    group_key）—— 同款可能有好几条 games 行（中英日韩各一盘 ROM），
   *    它们指向同一个 group；子查询命中多行时 SQLite 取第一行，不影响结果。
   */
  const textSync = await run(
    `UPDATE game_texts
        SET developer = (
              SELECT d.name_en
                FROM games g
                JOIN developers d ON d.id = g.developer_id
               WHERE COALESCE(g.group_key, g.id) = game_texts.group_key
            )
      WHERE locale = 'en'
        AND (developer IS NULL OR TRIM(developer) = '')
        AND (
              SELECT d.name_en
                FROM games g
                JOIN developers d ON d.id = g.developer_id
               WHERE COALESCE(g.group_key, g.id) = game_texts.group_key
            ) IS NOT NULL`,
  );
  console.log(`按 developer_id 反查补齐 ${textSync.meta?.changes ?? 0} 条 game_texts（en）的厂名。`);
}

/* ---------- 收尾核对 ---------- */

const afterGames = await countGames();
const afterDevelopers = await countDevelopers();

console.log('\n---');
if (DRY_RUN) {
  console.log(`[dry-run] 预计写入 developers ${devUpdated} 家 / games ${gameUpdated} 条，跳过 developers ${devSkipped} / games ${gameSkipped}。未写库。`);
} else {
  console.log(`developers 写入 ${devUpdated} 家（跳过 ${devSkipped}）；games 写入 ${gameUpdated} 条（跳过 ${gameSkipped}）。`);
}
console.log(
  `games 现在 ${afterGames} 条。${afterGames === beforeGames ? '✅ 一条没多、一条没少。' : '⚠️ 条数变了，请核对！'}`,
);
console.log(
  `developers 现在 ${afterDevelopers} 条。${afterDevelopers === beforeDevelopers ? '✅ 一条没多、一条没少。' : '⚠️ 条数变了，请核对！'}`,
);
