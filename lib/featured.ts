/*
 * 首页「精选」模块的**静态数据**（2026-11-05 加）。
 *
 * ## 为什么是静态的
 *
 * 这个模块是**编辑挑选**，不是「按某个字段能算出来」的东西 —— 哪个类型该放哪几款、
 * 谁算「当年最火」，是人的判断。做成查询要么加一张表、要么在 SQL 里写死一堆 slug，
 * 两种都比这份文件难维护，还要为它多担一次数据库往返。
 *
 * 所以：**不查库、不调接口**，页面渲染时直接读这份常量。改动只需要改这一个文件。
 *
 * ---------------------------------------------------------------------------
 * 几条别踩的坑
 *
 * ⚠️ **`slug` 必须是库里真实存在的那一条**（`games.slug`）。卡片链接是
 *    `/games/<slug>`，slug 错了卡片点进去就是 404，而且**不会报错**。
 *    加游戏时先在后台搜一下拼写。
 * ⚠️ **`cover` 是 R2 上的相对路径**（`/images/games/cover/<机种目录>/<文件>.webp`），
 *    不是完整的 URL —— 它的基址由页面那层决定（同 `GameCardGrid` 的 `game.imageUrl`）。
 *    机种目录不是 `console_type` 本身（ps1 → `playstation`、md → `genesis`、
 *    32x → `sega-32x`），所以这里**直接抄库里那串**，别自己按机种拼。
 * ⚠️ **标题只有 4 种语言**（zh / en / ja / ko），其余语言回退英文 —— 和
 *    `lib/site-doc.ts`、`lib/game-text.ts` 同一条规矩：游戏内容本身就只备了这四种，
 *    界面文案那 18 张表不该拿来装内容。
 * ⚠️ 卡片上的机种 / 年份是**展示用**的，和库里那份同步过一次（2026-11-05）。
 *    库里的年份改了这里不会自动跟 —— 但错了也就是卡片上少一个数字，不影响跳转。
 */

import type { ConsoleType } from './emulator';
import type { Locale } from './i18n';

/** 精选文案支持的语言。其余语言回退英文（见文件头那条 ⚠️）。 */
type FeaturedText = { zh: string; en: string; ja: string; ko: string };

export type FeaturedGame = {
  slug: string;
  console: ConsoleType;
  year: number;
  /** R2 上的相对路径（见文件头第二条 ⚠️） */
  cover: string;
  title: FeaturedText;
};

export type FeaturedTagId = 'fighting' | 'action' | 'shooter' | 'rpg' | 'racing' | 'puzzle';

export type FeaturedTag = {
  id: FeaturedTagId;
  label: FeaturedText;
  games: readonly FeaturedGame[];
};

/**
 * 六个类型。**顺序就是 tab 的显示顺序** —— 格斗排第一是因为它最符合「街机厅记忆」，
 * 也最容易让人一眼明白这个模块在做什么。
 *
 * 每个类型 **12 款**（2026-11-05 从 5~6 款扩上来，用户要求）：桌面（`lg`，6 列）正好
 * 两行摆满，平板 4 列三行、手机 3 列四行，切换 tab 时高度不会跳。
 * 再多就得往上翻三行了，那就不是「精选」而是第二个列表页。
 *
 * ⚠️ 同一栏里**别放重名的两款**：`tetris-gb` 和 NES 那款 `tetris` 中文名都叫「俄罗斯方块」，
 *    并排摆出来像重复了。同理 `life-force`（NES 版沙罗曼蛇）和 `salamander-arcade` 撞名，
 *    所以只留了后者。加游戏前先扫一眼同栏的中文标题。
 */
export const FEATURED_TAGS: readonly FeaturedTag[] = [
  {
    id: 'fighting',
    label: { zh: '格斗', en: 'Fighting', ja: '格闘', ko: '대전격투' },
    games: [
      {
        slug: 'street-fighter-ii-the-world-warrior-arcade',
        console: 'arcade',
        year: 1991,
        cover: '/images/games/cover/arcade/street-fighter-ii-the-world-warrior.webp',
        title: {
          zh: '街头霸王 II: 世界勇士',
          en: 'Street Fighter II: The World Warrior',
          ja: 'ストリートファイターII: The World Warrior',
          ko: '스트리트 파이터 II: 더 월드 워리어',
        },
      },
      {
        slug: 'the-king-of-fighters-98',
        console: 'arcade',
        year: 1998,
        cover: '/images/games/cover/arcade/the-king-of-fighters-98.webp',
        title: {
          zh: '拳皇\'98',
          en: 'The King of Fighters \'98',
          ja: 'ザ・キング・オブ・ファイターズ\'98',
          ko: '더 킹 오브 파이터즈 \'98',
        },
      },
      {
        slug: 'samurai-shodown-ii',
        console: 'arcade',
        year: 1993,
        cover: '/images/games/cover/arcade/samurai-shodown-ii.webp',
        title: {
          zh: '真侍魂：霸王丸地狱变',
          en: 'Samurai Shodown II',
          ja: '真サムライスピリッツ',
          ko: '사무라이 스피리츠 2',
        },
      },
      {
        slug: 'mortal-kombat',
        console: 'snes',
        year: 1993,
        cover: '/images/games/cover/snes/mortal-kombat.webp',
        title: {
          zh: '真人快打',
          en: 'Mortal Kombat',
          ja: 'モータルコンバット',
          ko: '모탈 컴뱃',
        },
      },
      {
        slug: 'tekken-3-ps1-game',
        console: 'ps1',
        year: 1997,
        cover: '/images/games/cover/playstation/tekken-3.webp',
        title: {
          zh: '铁拳3',
          en: 'Tekken 3',
          ja: '鉄拳3',
          ko: '철권 3',
        },
      },
      {
        slug: 'virtua-fighter-sega-32x',
        console: '32x',
        year: 1994,
        cover: '/images/games/cover/sega-32x/virtua-fighter.webp',
        title: {
          zh: 'VR战士',
          en: 'Virtua Fighter',
          ja: 'バーチャファイター',
          ko: '버추어 파이터',
        },
      },
      {
        slug: 'street-fighter-alpha-zero-3',
        console: 'arcade',
        year: 1998,
        cover: '/images/games/cover/arcade/street-fighter-alpha-3.webp',
        title: {
          zh: '街头霸王：阿尔法3',
          en: 'Street Fighter Alpha 3',
          ja: 'ストリートファイターZERO3',
          ko: '스트리트 파이터 알파 3',
        },
      },
      {
        slug: 'fatal-fury-special',
        console: 'arcade',
        year: 1993,
        cover: '/images/games/cover/arcade/fatal-fury-special.webp',
        title: {
          zh: '饿狼传说特别版',
          en: 'Fatal Fury Special',
          ja: '餓狼伝説スペシャル',
          ko: '아랑전설 스페셜',
        },
      },
      {
        slug: 'garou-mark-of-the-wolves',
        console: 'arcade',
        year: 1999,
        cover: '/images/games/cover/arcade/garou-mark-of-the-wolves.webp',
        title: {
          zh: '饿狼传说：狼之印记',
          en: 'Garou: Mark of the Wolves',
          ja: '餓狼 MARK OF THE WOLVES',
          ko: '가로우: 마크 오브 더 울브스',
        },
      },
      {
        slug: 'the-last-blade-2',
        console: 'arcade',
        year: 1998,
        cover: '/images/games/cover/arcade/the-last-blade-2.webp',
        title: {
          zh: '月华剑士2',
          en: 'The Last Blade 2',
          ja: '幕末浪漫第二幕 月華の剣士',
          ko: '더 라스트 블레이드 2',
        },
      },
      {
        slug: 'killer-instinct',
        console: 'snes',
        year: 1995,
        cover: '/images/games/cover/snes/killer-instinct.webp',
        title: {
          zh: '杀手本能',
          en: 'Killer Instinct',
          ja: 'キラー インスティンクト',
          ko: '킬러 인스팅트',
        },
      },
      {
        slug: 'mortal-kombat-ii-genesis',
        console: 'md',
        year: 1993,
        cover: '/images/games/cover/genesis/mortal-kombat-ii.webp',
        title: {
          zh: '真人快打II',
          en: 'Mortal Kombat II',
          ja: 'モータルコンバットII',
          ko: '모탈 컴뱃 II',
        },
      },
    ],
  },
  {
    id: 'action',
    label: { zh: '动作', en: 'Action', ja: 'アクション', ko: '액션' },
    games: [
      {
        slug: 'super-mario-bros-nes',
        console: 'nes',
        year: 1985,
        cover: '/images/games/cover/nes/super-mario-bros.webp',
        title: {
          zh: '超级马里奥兄弟',
          en: 'Super Mario Bros.',
          ja: 'スーパーマリオブラザーズ',
          ko: '슈퍼 마리오 브라더스',
        },
      },
      {
        slug: 'contra',
        console: 'nes',
        year: 1988,
        cover: '/images/games/cover/nes/contra.webp',
        title: {
          zh: '魂斗罗',
          en: 'Contra',
          ja: '魂斗羅',
          ko: '콘트라',
        },
      },
      {
        slug: 'mega-man-2',
        console: 'nes',
        year: 1988,
        cover: '/images/games/cover/nes/mega-man-2.webp',
        title: {
          zh: '洛克人2',
          en: 'Mega Man 2',
          ja: 'ロックマン2 Dr.ワイリーの謎',
          ko: '록맨 2',
        },
      },
      {
        slug: 'castlevania-iii-draculas-curse',
        console: 'nes',
        year: 1989,
        cover: '/images/games/cover/nes/castlevania-iii-draculas-curse.webp',
        title: {
          zh: '恶魔城III：德古拉的诅咒',
          en: 'Castlevania III: Dracula\'s Curse',
          ja: '悪魔城伝説',
          ko: '악마성 3: 드라큘라의 저주',
        },
      },
      {
        slug: 'metal-slug-3',
        console: 'arcade',
        year: 2000,
        cover: '/images/games/cover/arcade/metal-slug-3.webp',
        title: {
          zh: '合金弹头3',
          en: 'Metal Slug 3',
          ja: 'メタルスラッグ3',
          ko: '메탈슬러그 3',
        },
      },
      {
        slug: 'double-dragon-arcade',
        console: 'arcade',
        year: 1987,
        cover: '/images/games/cover/arcade/double-dragon.webp',
        title: {
          zh: '双截龙',
          en: 'Double Dragon',
          ja: 'ダブルドラゴン',
          ko: '더블 드래곤',
        },
      },
      {
        slug: 'super-mario-bros-3',
        console: 'nes',
        year: 1988,
        cover: '/images/games/cover/nes/super-mario-bros-3.png',
        title: {
          zh: '超级马里奥兄弟3',
          en: 'Super Mario Bros. 3',
          ja: 'スーパーマリオブラザーズ3',
          ko: '슈퍼 마리오브라더스 3',
        },
      },
      {
        slug: 'super-mario-world',
        console: 'snes',
        year: 1990,
        cover: '/images/games/cover/snes/super-mario-world.webp',
        title: {
          zh: '超级马里奥世界',
          en: 'Super Mario World',
          ja: 'スーパーマリオワールド',
          ko: '슈퍼 마리오 월드',
        },
      },
      {
        slug: 'mega-man-x',
        console: 'snes',
        year: 1993,
        cover: '/images/games/cover/snes/mega-man-x.webp',
        title: {
          zh: '洛克人X',
          en: 'Mega Man X',
          ja: 'ロックマンX',
          ko: '록맨 X',
        },
      },
      {
        slug: 'sonic-the-hedgehog',
        console: 'md',
        year: 1991,
        cover: '/images/games/cover/genesis/sonic-the-hedgehog.webp',
        title: {
          zh: '刺猬索尼克',
          en: 'Sonic The Hedgehog',
          ja: 'ソニック・ザ・ヘッジホッグ',
          ko: '소닉 더 헤지혹',
        },
      },
      {
        slug: 'streets-of-rage-2',
        console: 'md',
        year: 1992,
        cover: '/images/games/cover/genesis/streets-of-rage-2.webp',
        title: {
          zh: '怒之铁拳2',
          en: 'Streets Of Rage 2',
          ja: 'ベア・ナックルII 死闘への鎮魂歌',
          ko: '베어 너클 II: 사투의 진혼가',
        },
      },
      {
        slug: 'castlevania-symphony-of-the-night-ps',
        console: 'ps1',
        year: 1997,
        cover: '/images/games/cover/playstation/castlevania-symphony-of-the-night.webp',
        title: {
          zh: '恶魔城：月下夜想曲',
          en: 'Castlevania: Symphony of the Night',
          ja: '悪魔城ドラキュラX 月下の夜想曲',
          ko: '악마성 드라큘라 X: 월하의 야상곡',
        },
      },
    ],
  },
  {
    id: 'shooter',
    label: { zh: '射击', en: 'Shooting', ja: 'シューティング', ko: '슈팅' },
    games: [
      {
        slug: 'space-invaders',
        console: 'arcade',
        year: 1978,
        cover: '/images/games/cover/arcade/space-invaders.webp',
        title: {
          zh: '太空侵略者',
          en: 'Space Invaders',
          ja: 'スペースインベーダー',
          ko: '스페이스 인베이더',
        },
      },
      {
        slug: 'gradius',
        console: 'nes',
        year: 1986,
        cover: '/images/games/cover/nes/gradius.webp',
        title: {
          zh: '宇宙巡航机',
          en: 'Gradius',
          ja: 'グラディウス',
          ko: '그라디우스',
        },
      },
      {
        slug: '1943-the-battle-of-midway',
        console: 'arcade',
        year: 1987,
        cover: '/images/games/cover/arcade/1943-the-battle-of-midway.webp',
        title: {
          zh: '1943：中途岛海战',
          en: '1943: The Battle of Midway',
          ja: '1943 ミッドウェイ海戦',
          ko: '1943: 미드웨이 해전',
        },
      },
      {
        slug: 'gradius-iii',
        console: 'snes',
        year: 1990,
        cover: '/images/games/cover/snes/gradius-iii.webp',
        title: {
          zh: '宇宙巡航机3',
          en: 'Gradius III',
          ja: 'グラディウスIII',
          ko: '그라디우스 III',
        },
      },
      {
        slug: 'dodonpachi',
        console: 'arcade',
        year: 1995,
        cover: '/images/games/cover/arcade/dodonpachi.webp',
        title: {
          zh: '怒首领蜂',
          en: 'DoDonPachi',
          ja: '怒首領蜂',
          ko: '도돈파치',
        },
      },
      {
        slug: 'galaga',
        console: 'arcade',
        year: 1981,
        cover: '/images/games/cover/arcade/galaga.webp',
        title: {
          zh: '大蜜蜂',
          en: 'Galaga',
          ja: 'ギャラガ (Galaga)',
          ko: '갤러그',
        },
      },
      {
        slug: 'salamander-arcade',
        console: 'arcade',
        year: 1986,
        cover: '/images/games/cover/arcade/salamander.webp',
        title: {
          zh: '沙罗曼蛇',
          en: 'Salamander',
          ja: 'サラマンダ',
          ko: '沙罗曼蛇',
        },
      },
      {
        slug: 'twinbee',
        console: 'nes',
        year: 1986,
        cover: '/images/games/cover/nes/twinbee.webp',
        title: {
          zh: '兵蜂',
          en: 'TwinBee',
          ja: 'ツインビー',
          ko: '트윈비',
        },
      },
      {
        slug: 'aero-fighters',
        console: 'snes',
        year: 1994,
        cover: '/images/games/cover/snes/aero-fighters.webp',
        title: {
          zh: '空中霸王',
          en: 'Aero Fighters',
          ja: 'アエロファイターズ',
          ko: '에어로 파이터즈',
        },
      },
      {
        slug: 'raiden',
        console: 'arcade',
        year: 1990,
        cover: '/images/games/cover/arcade/raiden.webp',
        title: {
          zh: '雷电',
          en: 'Raiden',
          ja: '雷電',
          ko: '라이덴',
        },
      },
      {
        slug: 'strikers-1945',
        console: 'arcade',
        year: 1995,
        cover: '/images/games/cover/arcade/strikers-1945.webp',
        title: {
          zh: '打击者1945',
          en: 'Strikers 1945',
          ja: 'ストライカーズ1945',
          ko: '스트라이커즈 1945',
        },
      },
      {
        slug: 'parodius',
        console: 'snes',
        year: 1994,
        cover: '/images/games/cover/snes/parodius.webp',
        title: {
          zh: '疯狂大射击 / Q版沙罗曼蛇',
          en: 'Parodius',
          ja: 'パロディウス',
          ko: '파로디우스',
        },
      },
    ],
  },
  {
    id: 'rpg',
    label: { zh: '角色扮演', en: 'RPG', ja: 'RPG', ko: 'RPG' },
    games: [
      {
        slug: 'dragon-quest-iii',
        console: 'nes',
        year: 1988,
        cover: '/images/games/cover/nes/dragon-quest-iii.webp',
        title: {
          zh: '勇者斗恶龙 III：传说的起点',
          en: 'Dragon Quest III: The Seeds of Salvation',
          ja: 'ドラゴンクエストIII そして伝説へ…',
          ko: '드래곤 퀘스트 III: 성스러운 빛과 어둠의 왕자',
        },
      },
      {
        slug: 'zelda-link-to-the-past',
        console: 'snes',
        year: 1991,
        cover: '/images/games/cover/snes/zelda-link-to-the-past.webp',
        title: {
          zh: '塞尔达传说：众神的三角力量',
          en: 'The Legend of Zelda: A Link to the Past',
          ja: 'ゼルダの伝説 神々のトライフォース',
          ko: '젤다의 전설: 신들의 트라이포스',
        },
      },
      {
        slug: 'final-fantasy-vi',
        console: 'snes',
        year: 1994,
        cover: '/images/games/cover/snes/final-fantasy-vi.webp',
        title: {
          zh: '最终幻想VI',
          en: 'Final Fantasy VI',
          ja: 'ファイナルファンタジーVI',
          ko: '파이널 판타지 VI',
        },
      },
      {
        slug: 'mother-2',
        console: 'snes',
        year: 1994,
        cover: '/images/games/cover/snes/mother-2.webp',
        title: {
          zh: '地球冒险2',
          en: 'Mother 2: Gyiyg no Gyakushuu / EarthBound',
          ja: 'Mother 2: ギーグの逆襲',
          ko: '마더 2: 기기스 격추',
        },
      },
      {
        slug: 'chrono-trigger',
        console: 'snes',
        year: 1995,
        cover: '/images/games/cover/snes/chrono-trigger.webp',
        title: {
          zh: '时空之轮',
          en: 'Chrono Trigger',
          ja: 'クロノ・トリガー',
          ko: '크로노 트리거',
        },
      },
      {
        slug: 'final-fantasy-vii',
        console: 'ps1',
        year: 1997,
        cover: '/images/games/cover/playstation/final-fantasy-vii.webp',
        title: {
          zh: '最终幻想7',
          en: 'FINAL FANTASY VII',
          ja: 'ファイナルファンタジーVII',
          ko: '파이널 판타지 VII',
        },
      },
      {
        slug: 'final-fantasy-iv-snes',
        console: 'snes',
        year: 1991,
        cover: '/images/games/cover/snes/final-fantasy-iv.webp',
        title: {
          zh: '最终幻想IV',
          en: 'Final Fantasy IV',
          ja: 'ファイナルファンタジーIV',
          ko: '파이널 판타지 4',
        },
      },
      {
        slug: 'dragon-quest-v',
        console: 'snes',
        year: 1992,
        cover: '/images/games/cover/snes/dragon-quest-v.webp',
        title: {
          zh: '勇者斗恶龙 V：天空的新娘',
          en: 'Dragon Quest V: Hand of the Heavenly Bride',
          ja: 'ドラゴンクエストV 天空の花嫁',
          ko: '드래곤 퀘스트 V: 천공의 신부',
        },
      },
      {
        slug: 'secret-of-mana',
        console: 'snes',
        year: 1993,
        cover: '/images/games/cover/snes/secret-of-mana.webp',
        title: {
          zh: '圣剑传说2',
          en: 'Secret of Mana',
          ja: '聖剣伝説２',
          ko: '성검전설 2',
        },
      },
      {
        slug: 'phantasy-star-iv',
        console: 'md',
        year: 1993,
        cover: '/images/games/cover/genesis/phantasy-star-iv.webp',
        title: {
          zh: '光明幻想IV：千年的终结',
          en: 'Phantasy Star IV: The End of the Millennium',
          ja: 'ファンタシースターIV ～時のはざま～',
          ko: '판타지 스타 4: 밀레니엄의 종언',
        },
      },
      {
        slug: 'golden-sun',
        console: 'gba',
        year: 2001,
        cover: '/images/games/cover/gba/golden-sun.webp',
        title: {
          zh: '黄金太阳：开启的封印',
          en: 'Golden Sun',
          ja: '黄金の太陽　開かれし封印',
          ko: '골든 선',
        },
      },
      {
        slug: 'the-legend-of-zelda-links-awakening',
        console: 'gb',
        year: 1993,
        cover: '/images/games/cover/gb/the-legend-of-zelda-links-awakening.webp',
        title: {
          zh: '塞尔达传说 织梦岛',
          en: 'The Legend of Zelda: Link\'s Awakening',
          ja: 'ゼルダの伝説 夢をみる島',
          ko: '젤다의 전설: 꿈을 꾸는 섬',
        },
      },
    ],
  },
  {
    id: 'racing',
    label: { zh: '竞速', en: 'Racing', ja: 'レース', ko: '레이싱' },
    games: [
      {
        slug: 'out-run',
        console: 'arcade',
        year: 1986,
        cover: '/images/games/cover/arcade/outrun.webp',
        title: {
          zh: 'Out Run',
          en: 'Out Run',
          ja: 'アウトラン',
          ko: '아웃런',
        },
      },
      {
        slug: 'f-zero',
        console: 'snes',
        year: 1990,
        cover: '/images/games/cover/snes/f-zero.webp',
        title: {
          zh: 'F-Zero',
          en: 'F-Zero',
          ja: 'F-ZERO',
          ko: 'F-Zero',
        },
      },
      {
        slug: 'super-mario-kart',
        console: 'snes',
        year: 1992,
        cover: '/images/games/cover/snes/super-mario-kart.webp',
        title: {
          zh: '超级马里奥卡丁车',
          en: 'Super Mario Kart',
          ja: 'スーパーマリオカート',
          ko: '슈퍼 마리오 카트',
        },
      },
      {
        slug: 'top-gear',
        console: 'snes',
        year: 1992,
        cover: '/images/games/cover/snes/top-gear.webp',
        title: {
          zh: '超越巔峰',
          en: 'Top Gear',
          ja: 'トップギア',
          ko: '탑 기어',
        },
      },
      {
        slug: 'ridge-racer-type-4',
        console: 'ps1',
        year: 1998,
        cover: '/images/games/cover/playstation/ridge-racer-type-4.webp',
        title: {
          zh: '山脊赛车 Type 4',
          en: 'Ridge Racer Type 4',
          ja: 'リッジレーサー タイプ4',
          ko: '릿지 레이서 타입 4',
        },
      },
      {
        slug: 'virtua-racing-deluxe',
        console: '32x',
        year: 1994,
        cover: '/images/games/cover/sega-32x/virtua-racing-deluxe.webp',
        title: {
          zh: 'VR赛车豪华版',
          en: 'Virtua Racing Deluxe',
          ja: 'バーチャレーシング',
          ko: '버추어 레이싱 디럭스',
        },
      },
      {
        slug: 'gran-turismo',
        console: 'ps1',
        year: 1997,
        cover: '/images/games/cover/playstation/gran-turismo.webp',
        title: {
          zh: '跑车浪漫旅 / GT 赛车',
          en: 'Gran Turismo',
          ja: 'グランツーリスモ',
          ko: '그란 투리스모',
        },
      },
      {
        slug: 'crash-team-racing',
        console: 'ps1',
        year: 1999,
        cover: '/images/games/cover/playstation/crash-team-racing.webp',
        title: {
          zh: '古惑狼赛车',
          en: 'Crash Team Racing',
          ja: 'クラッシュ・バンディクー レーシング',
          ko: '크래쉬 팀 레이싱',
        },
      },
      {
        slug: 'road-rash-ii',
        console: 'md',
        year: 1993,
        cover: '/images/games/cover/genesis/road-rash-ii.webp',
        title: {
          zh: '暴力摩托2',
          en: 'Road Rash II',
          ja: 'ロードラッシュII',
          ko: '로드 러쉬 II',
        },
      },
      {
        slug: 'rock-n-roll-racing',
        console: 'snes',
        year: 1993,
        cover: '/images/games/cover/snes/rock-n-roll-racing.webp',
        title: {
          zh: '摇滚赛车',
          en: 'Rock n\' Roll Racing',
          ja: 'ロックンロールレーシング',
          ko: '락앤롤 레이싱',
        },
      },
      {
        slug: 'mario-kart-super-circuit',
        console: 'gba',
        year: 2001,
        cover: '/images/games/cover/gba/mario-kart-super-circuit.webp',
        title: {
          zh: '马里奥赛车：超级巡回赛',
          en: 'Mario Kart: Super Circuit',
          ja: 'マリオカートアドバンス',
          ko: '마리오 카트: 슈퍼 서킷',
        },
      },
      {
        slug: 'top-gear-2',
        console: 'snes',
        year: 1993,
        cover: '/images/games/cover/snes/top-gear-2.webp',
        title: {
          zh: '超越巅峰 2',
          en: 'Top Gear 2',
          ja: 'トップギア2',
          ko: '탑 기어 2',
        },
      },
    ],
  },
  {
    id: 'puzzle',
    label: { zh: '益智', en: 'Puzzle', ja: 'パズル', ko: '퍼즐' },
    games: [
      {
        slug: 'tetris-gb',
        console: 'gb',
        year: 1989,
        cover: '/images/games/cover/gb/tetris.webp',
        title: {
          zh: '俄罗斯方块',
          en: 'Tetris',
          ja: 'テトリス',
          ko: '테트리스',
        },
      },
      {
        slug: 'dr-mario',
        console: 'nes',
        year: 1990,
        cover: '/images/games/cover/nes/dr-mario.webp',
        title: {
          zh: '马里奥医生',
          en: 'Dr. Mario',
          ja: 'ドクターマリオ',
          ko: '닥터 마리오',
        },
      },
      {
        slug: 'puyo-puyo-genesis',
        console: 'md',
        year: 1991,
        cover: '/images/games/cover/genesis/puyo-puyo.webp',
        title: {
          zh: '魔法气泡',
          en: 'Puyo Puyo',
          ja: 'ぷよぷよ',
          ko: '뿌요뿌요',
        },
      },
      {
        slug: 'puzzle-bobble',
        console: 'arcade',
        year: 1994,
        cover: '/images/games/cover/arcade/puzzle-bobble.webp',
        title: {
          zh: '泡泡龙 / 益智泡泡龙',
          en: 'Puzzle Bobble',
          ja: 'パズルボブル',
          ko: '퍼즐버블',
        },
      },
      {
        slug: 'bomberman',
        console: 'nes',
        year: 1989,
        cover: '/images/games/cover/nes/bomberman.webp',
        title: {
          zh: '炸弹人',
          en: 'Bomberman',
          ja: 'ボンバーマン',
          ko: '봄버맨',
        },
      },
      {
        slug: 'snow-bros-nick-and-tom',
        console: 'arcade',
        year: 1993,
        cover: '/images/games/cover/arcade/snow-bros.webp',
        title: {
          zh: '雪人兄弟',
          en: 'Snow Bros. - Nick & Tom',
          ja: 'スノーブラザーズ - ニック＆トム',
          ko: '스노우 브라더스 - 닉과톰',
        },
      },
      {
        slug: 'tetris-attack',
        console: 'snes',
        year: 1995,
        cover: '/images/games/cover/snes/tetris-attack.webp',
        title: {
          zh: '花仙子方块',
          en: 'Tetris Attack',
          ja: 'パネルでポン',
          ko: '테트리스 어택',
        },
      },
      {
        slug: 'super-puzzle-fighter-ii-turbo',
        console: 'arcade',
        year: 1996,
        cover: '/images/games/cover/arcade/super-puzzle-fighter-ii-turbo.webp',
        title: {
          zh: '超级怪杰彩球战士 II Turbo',
          en: 'Super Puzzle Fighter II Turbo',
          ja: 'スーパーパズルファイターIIX',
          ko: '슈퍼 퍼즐 파이터 II 터보',
        },
      },
      {
        slug: 'super-bomberman-2',
        console: 'snes',
        year: 1993,
        cover: '/images/games/cover/snes/super-bomberman-2.webp',
        title: {
          zh: '超级炸弹人2',
          en: 'Super Bomberman 2',
          ja: 'スーパーボンバーマン2',
          ko: '슈퍼 봄버맨 2',
        },
      },
      {
        slug: 'yoshis-cookie',
        console: 'snes',
        year: 1992,
        cover: '/images/games/cover/snes/yoshis-cookie.webp',
        title: {
          zh: '耀西的饼干',
          en: 'Yoshi\'s Cookie',
          ja: 'ヨッシーのクッキー',
          ko: '요시 쿠키',
        },
      },
      {
        slug: 'warios-woods',
        console: 'nes',
        year: 1994,
        cover: '/images/games/cover/nes/warios-woods.webp',
        title: {
          zh: '瓦力欧之森',
          en: 'Wario\'s Woods',
          ja: 'ワリオの森',
          ko: '와리오의 숲',
        },
      },
      {
        slug: 'adventures-of-lolo',
        console: 'nes',
        year: 1989,
        cover: '/images/games/cover/nes/adventures-of-lolo.webp',
        title: {
          zh: '洛洛大冒险',
          en: 'Adventures of Lolo',
          ja: 'アドベンチャーズ オブ ロロ',
          ko: '로로의 모험',
        },
      },
    ],
  },
];

/**
 * 按界面语言取一条精选文案。
 *
 * `zh-TW` 归到 `zh`：游戏的标题 / 介绍本身只有 zh / en / ja / ko 四份
 * （`lib/game-text.ts`），繁中用户在游戏详情页看到的也是简体标题 ——
 * 这里跟着同一套回退，别让首页成为全站唯一一处「繁中」的地方。
 */
export function featuredText(text: FeaturedText, locale: Locale): string {
  if (locale === 'zh' || locale === 'zh-TW') return text.zh;
  if (locale === 'ja') return text.ja;
  if (locale === 'ko') return text.ko;
  return text.en;
}
