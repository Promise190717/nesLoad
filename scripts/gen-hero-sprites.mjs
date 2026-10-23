/*
 * 把 `data/pixel-heroes.json` 里的点阵画成静态 SVG（`public/sprites/hero/v1/*.svg`）。
 *
 * ## 为什么要生成文件而不是内联渲染
 *
 * 10 个精灵内联着画一共 310 个 `<rect>`，而首页整页只有 673 个 DOM 元素 —— 装饰层占了
 * 46%，而且每个元素都要被序列化两遍（HTML + RSC flight）。改成 `<img>` 之后每只小人
 * 只剩一个节点。推理与取舍写在 `components/PixelHeroes.tsx` 文件头。
 *
 * ## 用法
 *
 *   node scripts/gen-hero-sprites.mjs
 *
 * 改完点阵**必须重跑**，并把 `PixelHeroes.tsx` 里的 `SPRITE_DIR` 版本段升一位
 * （`v1` → `v2`），否则浏览器与 CDN 里那份一天内不更新。脚本自己会覆盖同名文件，
 * 所以「忘了升版本」是唯一会让线上对不上的情况。
 *
 * ⚠️ 合成规则必须和原内联版一致：**同一行里连续同色的像素合成一个横条**（一个 rect
 *    一个像素太浪费，310 个 rect 已经是合并后的结果）。
 * ⚠️ 不画背景色、不用 currentColor —— 颜色一律写死在每个 rect 的 `fill` 上，
 *    这样 `<img>` 里的 SVG 不依赖外部 CSS 变量（img 拿不到父级样式）。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const DATA = 'data/pixel-heroes.json';
const DIR = 'public/sprites/hero/v1';

/** 每行同色连续像素 → 一个横条 rect。 */
function rowRects(row, y, palette) {
  const rects = [];
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
    if (fill) rects.push({ x, y, width: end - x, fill });
    x = end;
  }
  return rects;
}

const sprites = JSON.parse(readFileSync(DATA, 'utf8'));
mkdirSync(DIR, { recursive: true });

let totalRects = 0;
for (const sprite of sprites) {
  const rects = sprite.rows.flatMap((row, y) => rowRects(row, y, sprite.palette));
  const body = rects
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="1" fill="${r.fill}"/>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${body}</svg>`;
  writeFileSync(`${DIR}/${sprite.id}.svg`, svg);
  totalRects += rects.length;
  console.log(`${sprite.id.padEnd(16)} rects=${String(rects.length).padStart(3)}  bytes=${svg.length}`);
}

console.log(`\n共 ${sprites.length} 个精灵 / ${totalRects} 个 rect → ${DIR}`);
