import type { Locale } from '@/lib/i18n';
import HEROES from '@/data/pixel-heroes.json';

/**
 * 首页 Hero 搜索框上方那排像素小人。
 *
 * ## 2026-10-23：从内联 SVG 改成静态 SVG 文件 + `<img>`
 *
 * 原来这里把 10 个精灵直接画成内联 `<svg>`，一共 **310 个 `<rect>`**。线上实测首页
 * 673 个 DOM 元素里它占 46%，并且每个元素都要被序列化两遍（一遍 HTML、一遍 RSC flight，
 * 后者占首页 HTML 的 56%）。改成文件后每只小人只剩一个 `<img>`：DOM 少 300 个，
 * 首页 HTML 少 20KB、flight 少 20KB。
 *
 * 为什么不是「改成客户端组件」：`'use client'` 组件在服务端**照样 SSR**（首屏 HTML 要有它），
 * RSC 与 HTML 序列化的活儿一点没少，只是整棵子树从 flight 挪进了 props —— 通常更贵。
 *
 * 代价：多了 10 个静态请求（每个 1.5~3KB，`Cache-Control` 一天，见 `next.config.js`
 * 的 `/sprites/` 那条）。换来的是每请求少序列化 300 个节点。
 *
 * ## 改点阵的正确姿势
 *
 * 1. 改 `data/pixel-heroes.json`（色号表 + 16 行点阵，`.` 是透明）
 * 2. 跑 `node scripts/gen-hero-sprites.mjs` 重新生成 `public/sprites/hero/v1/*.svg`
 * 3. **改了图就把路径里的 `v1` 升成 `v2`**（下面 `SPRITE_DIR` 一处改，SVG 目录一起挪），
 *    否则浏览器/CDN 里那一份一天内不会更新 —— 和 `public/cores/` 同一条规矩。
 *
 * ⚠️ `hero-bob` 的错峰动画在内联 `animation-delay` 上（和 `card-in` 同一套手法），
 *    `prefers-reduced-motion` 下由 `globals.css` 整体关掉。
 * ⚠️ 角色名只活在 `title`（原生悬停提示）里；整块 `aria-hidden`，不进读屏树、不参与 SEO。
 */

/** 精灵文件目录。改图要升版本号，理由见文件头第 3 步。 */
const SPRITE_DIR = '/sprites/hero/v1';

export default function PixelHeroes({ locale }: { locale: Locale }) {
  return (
    <div
      aria-hidden="true"
      className="mt-4 flex flex-wrap items-end justify-center gap-x-6 gap-y-3"
    >
      {HEROES.map((sprite, index) => (
        <span
          key={sprite.id}
          title={(sprite.name as Partial<Record<Locale, string>>)[locale] ?? sprite.name.en ?? ''}
          className="transition-transform duration-150 hover:-translate-y-1"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${SPRITE_DIR}/${sprite.id}.svg`}
            /* `alt=""`：这个 img 只在装饰层里，名字靠外层 span 的 title 给鼠标用户 */
            alt=""
            width={44}
            height={44}
            /* SVG 内部写了 shape-rendering="crispEdges"，放大到 44/48px 边缘仍是硬的 */
            className="hero-bob h-11 w-11 sm:h-12 sm:w-12"
            /* 错峰：第 n 个晚 0.15s × n，一行小人跳成一排波浪 */
            style={{ animationDelay: `${index * 0.15}s` }}
          />
        </span>
      ))}
    </div>
  );
}
