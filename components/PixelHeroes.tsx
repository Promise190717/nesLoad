import type { Locale } from '@/lib/i18n';

/**
 * 首页 Hero 搜索框上方那排像素小人（2026-10-13 用户加的）。
 *
 * 一排 16×16 手绘点阵——都是真机种上的**真实角色**：马里奥（FC）、林克（塞尔达）、
 * 萨姆斯（银河战士）、洛克人、隆（街霸，SFC/街机）、魂斗罗突击兵、吃豆人（街机）、
 * 幽灵（吃豆人）、炸弹人、卡比（SFC）。**纯装饰**（`aria-hidden`），整块不进读屏树、
 * 不参与 SEO——名字只活在鼠标悬停的原生 `title` 里。
 *
 * 实现上刻意的选择：
 * - **点阵数据就是字符串数组**，一个字符一个色号（`.` 透明）。加新角色照着抄一行就行，
 *   不需要任何绘图工具。
 * - 渲染成 **SVG rect**，并且**把同一行里连续同色的像素合成一个横条**——10 个角色
 *   全画下来只有几百个 rect，而不是 10×256 个。`shape-rendering: crispEdges` 保证
 *   放大后边缘是硬的，不会有抗锯齿灰边（和本站「像素」的气质一致）。
 * - **服务端组件**：没有 `'use client'`、没有任何 JS，动画全在 CSS（`globals.css`
 *   的 `.hero-bob`，逐个错峰靠内联 `animation-delay`）。`prefers-reduced-motion`
 *   下动画整体关掉（见 globals.css 那条媒体查询）。
 *
 * ⚠️ 角色形象是致敬式的点阵重绘，不是官方素材——仓库里不进任何图片文件。
 */

type PixelSprite = {
  /** 原生 `title` 用的名字（悬停可见；读屏拿不到，这排本来就是装饰） */
  name: Record<Locale, string>;
  /** 色号表：一个字符 → 一个颜色（`.` 透明，不用写进来） */
  palette: Record<string, string>;
  /** 16 行 × 16 列，一个字符一个像素 */
  rows: string[];
};

/** 本站常用的那几个点阵色，集中写一遍省得每个角色各抄一份 */
const SKIN = '#ffc98a';
const BLACK = '#1a1a1a';
const RED = '#d82800';
const BLUE = '#2a5cc8';
const YELLOW = '#f7d51d';
const WHITE = '#f0f0f0';
const ORANGE = '#f07a22';

const SPRITES: PixelSprite[] = [
  {
    name: {
      en: 'Mario (Super Mario Bros.)',
      zh: '马里奥（超级马力欧兄弟）',
      ja: 'マリオ（スーパーマリオブラザーズ）',
      ko: '마리오(슈퍼 마리오 브라더스)',
    },
    palette: { R: RED, H: '#7c3f00', S: SKIN, K: BLACK, B: BLUE, Y: YELLOW, D: '#7a4b12' },
    rows: [
      '....RRRRR.......',
      '...RRRRRRRRR....',
      '...HHHSSKS......',
      '..HSHSSSKSSS....',
      '..HSHHSSSKSSS...',
      '..HHSSSSKKKK....',
      '....SSSSSSS.....',
      '...RRBRRB.......',
      '..RRRBRRBRRR....',
      '.RRRRBBBBRRRR...',
      '.SSRBYBBYBRSS...',
      '.SSSBBBBBBSSS...',
      '.SSBBBBBBBBSS...',
      '...BBB..BBB.....',
      '..DDD....DDD....',
      '.DDDD....DDDD...',
    ],
  },
  {
    name: {
      en: 'Link (The Legend of Zelda)',
      zh: '林克（塞尔达传说）',
      ja: 'リンク（ゼルダの伝説）',
      ko: '링크(젤다의 전설)',
    },
    palette: { G: '#3ea23e', S: SKIN, K: BLACK, D: '#8a5a2b', Y: YELLOW },
    rows: [
      '................',
      '................',
      '......GG........',
      '.....GGGG.......',
      '....GGGGGG......',
      '....DSSSSD......',
      '....SKSSKS......',
      '....SSSSSS......',
      '...GGGGGGGG.....',
      '..SSGGGGGGGGSS..',
      '....GGYYYYGG....',
      '....GGGGGGGG....',
      '....GGGGGGGG....',
      '....GGG..GGG....',
      '...DDD..DDD.....',
      '...DDD..DDD.....',
    ],
  },
  {
    name: {
      en: 'Samus (Metroid)',
      zh: '萨姆斯（银河战士）',
      ja: 'サムス（メトロイド）',
      ko: '사무스(메트로이드)',
    },
    palette: { O: ORANGE, G: '#8cf05f', R: RED, Y: YELLOW },
    rows: [
      '................',
      '................',
      '.....OOOOO......',
      '....OOOOOOO.....',
      '...OOOOOOOOO....',
      '...OOGGGGGOO....',
      '...OOGGGGGOO....',
      '...OOOOOOOOO....',
      '..RRROOOOORRR...',
      '..RRRROYOORRR...',
      '..OOORRRRROOO...',
      '....ORRRRRO.....',
      '....OOO.OOO.....',
      '....OOO.OOO.....',
      '...RRR...RRR....',
      '...RRR...RRR....',
    ],
  },
  {
    name: { en: 'Mega Man', zh: '洛克人', ja: 'ロックマン', ko: '록맨' },
    palette: { B: '#3096f0', D: '#1850c8', S: SKIN, K: BLACK },
    rows: [
      '................',
      '.....BBBB.......',
      '...BBBBBBBB.....',
      '..BBBBBBBBBB....',
      '..BBSSSSSSBB....',
      '..BBSKSSKSBB....',
      '..BBSSSSSSBB....',
      '..BBBSSSSBBB....',
      '...BBBBBBBB.....',
      '..BBDDBBDDBB....',
      '..BBDDBBDDBB....',
      '..SSDDDDDDSS....',
      '...DDDDDDDD.....',
      '...DDD..DDD.....',
      '..BBBB..BBBB....',
      '..BBBB..BBBB....',
    ],
  },
  {
    name: {
      en: 'Ryu (Street Fighter)',
      zh: '隆（街头霸王）',
      ja: 'リュウ（ストリートファイター）',
      ko: '류(스트리트 파이터)',
    },
    palette: { W: WHITE, S: SKIN, K: BLACK, R: RED },
    rows: [
      '................',
      '.....KKKKK......',
      '....KKKKKKK.....',
      '....RRRRRRR.....',
      '....SSSSSSS.....',
      '....SKSSSKS.....',
      '....SSSSSSS.....',
      '...WWWWWWWWW....',
      '..WWWWWWWWWWW...',
      '..SWWWWWWWWWS...',
      '..SWWWWWWWWWS...',
      '....WRRRRRW.....',
      '....WWWWWWW.....',
      '...WWW..WWW.....',
      '...SSS..SSS.....',
      '...SSS..SSS.....',
    ],
  },
  {
    name: { en: 'Contra commando', zh: '魂斗罗突击兵', ja: '魂斗羅の兵士', ko: '콘트라 병사' },
    palette: { S: '#e8a06a', R: RED, B: BLUE, K: BLACK },
    rows: [
      '................',
      '................',
      '.....SSSSS......',
      '....RRRRRRR.....',
      '....SSSSSSS.....',
      '....SKSSSKS.....',
      '....SSSSSSS.....',
      '...SSSSSSSSS....',
      '..SSSSSSSSSSS...',
      '..SSSSSSSSSSS...',
      '...SBBBBBBS.....',
      '....BBBBBB......',
      '....BB..BB......',
      '....BB..BB......',
      '...KKK..KKK.....',
      '...KKK..KKK.....',
    ],
  },
  {
    name: { en: 'Pac-Man', zh: '吃豆人', ja: 'パックマン', ko: '팩맨' },
    palette: { Y: YELLOW },
    rows: [
      '................',
      '.....YYYYYY.....',
      '...YYYYYYYYYY...',
      '..YYYYYYYYYYYY..',
      '..YYYYYYYYYYYY..',
      '.YYYYYYYYYYYYYY.',
      '.YYYYYYYYYYYYYY.',
      '.YYYYYYYYYYYYYY.',
      '.YYYYYYY........',
      '.YYYYY..........',
      '.YYYYYYY........',
      '.YYYYYYYYYYYYYY.',
      '.YYYYYYYYYYYYYY.',
      '..YYYYYYYYYYYY..',
      '...YYYYYYYYYY...',
      '................',
    ],
  },
  {
    name: { en: 'Ghost (Pac-Man)', zh: '幽灵（吃豆人）', ja: 'ゴースト（パックマン）', ko: '고스트(팩맨)' },
    palette: { R: '#e02020', W: '#ffffff', B: '#2121ff' },
    rows: [
      '................',
      '.....RRRRRR.....',
      '...RRRRRRRRRR...',
      '..RRRRRRRRRRRR..',
      '..RWWWRRRWWWRR..',
      '..RWBWRRRWBWRR..',
      '..RWWWRRRWWWRR..',
      '..RRRRRRRRRRRR..',
      '..RRRRRRRRRRRR..',
      '..RRRRRRRRRRRR..',
      '..RRRRRRRRRRRR..',
      '..RRRRRRRRRRRR..',
      '..RRRRRRRRRRRR..',
      '..RRRRRRRRRRRR..',
      '..RRR.RRRR.RRR..',
      '...RR..RR..RR...',
    ],
  },
  {
    name: { en: 'Bomberman', zh: '炸弹人', ja: 'ボンバーマン', ko: '봄버맨' },
    palette: { W: WHITE, P: '#f080c0', K: BLACK, B: '#2870e0' },
    rows: [
      '................',
      '......PPP.......',
      '.......P........',
      '......WWWW......',
      '.....WWWWWW.....',
      '....WWWWWWWW....',
      '....WWKWWKWW....',
      '....WWKWWKWW....',
      '....WWWWWWWW....',
      '...WWWWWWWWWW...',
      '..WWWWWWWWWWWW..',
      '..WWWWWWWWWWWW..',
      '..WWWWWWWWWWWW..',
      '..WWWWWWWWWWWW..',
      '...BBB....BBB...',
      '...BBB....BBB...',
    ],
  },
  {
    name: { en: 'Kirby', zh: '星之卡比', ja: 'カービィ', ko: '커비' },
    palette: { P: '#ffb0d8', K: BLACK, C: '#f87c9c', M: '#a02040', R: '#e03050' },
    rows: [
      '................',
      '................',
      '.....PPPPPP.....',
      '...PPPPPPPPPP...',
      '..PPPPPPPPPPPP..',
      '..PPPKKPPKKPPP..',
      '..PPPKKPPKKPPP..',
      '..PPPPPPPPPPPP..',
      '..PCPPPPPPPPCP..',
      '..PPPPPMMPPPPP..',
      '..PPPPPPPPPPPP..',
      '..PPPPPPPPPPPP..',
      '...PPPPPPPPPP...',
      '....PPPPPPPP....',
      '..RRRR....RRRR..',
      '..RRRR....RRRR..',
    ],
  },
];

/**
 * 把一行点阵合成「横条」：同色连续像素一个 rect。
 * 返回该行所有 `<rect>` 的 props，渲染侧直接铺开。
 */
function rowRects(row: string, y: number, palette: Record<string, string>) {
  const rects: { x: number; width: number; fill: string }[] = [];
  let x = 0;
  while (x < row.length) {
    const ch = row[x];
    if (ch === '.') {
      x += 1;
      continue;
    }
    let end = x + 1;
    while (end < row.length && row[end] === ch) end += 1;
    const fill = palette[ch];
    if (fill) rects.push({ x, width: end - x, fill });
    x = end;
  }
  return rects.map((r) => <rect key={`${y}-${r.x}`} x={r.x} y={y} width={r.width} height={1} fill={r.fill} />);
}

export default function PixelHeroes({ locale }: { locale: Locale }) {
  return (
    <div
      aria-hidden="true"
      className="mt-4 flex flex-wrap items-end justify-center gap-x-6 gap-y-3"
    >
      {SPRITES.map((sprite, index) => (
        <span
          key={sprite.name.en}
          title={sprite.name[locale]}
          className="transition-transform duration-150 hover:-translate-y-1"
        >
          <svg
            viewBox="0 0 16 16"
            shapeRendering="crispEdges"
            className="hero-bob h-11 w-11 sm:h-12 sm:w-12"
            /* 错峰：第 n 个晚 0.15s × n，一行小人跳成一排波浪（和 card-in 同一套手法） */
            style={{ animationDelay: `${index * 0.15}s` }}
          >
            {sprite.rows.map((row, y) => rowRects(row, y, sprite.palette))}
          </svg>
        </span>
      ))}
    </div>
  );
}
