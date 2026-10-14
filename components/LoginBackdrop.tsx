'use client';

import { useEffect, useRef } from 'react';

/**
 * `/login` 的背景装饰（2026-10-13 加）。
 *
 * **为什么有它**：用户反馈「登录页背景太单调」。这一页只有一张表单，`bg-ink-950`
 * 铺满整屏确实太空 —— 但它是个内容页，套不了屋里那间像素房间（那是 `/room` 的东西）。
 * 所以拿 canvas 画一层**会呼吸的像素装饰**：三种机种的小人（NES / SFC / 街机）
 * 在背景里慢慢飘 + 一点琥珀微光 + 一片闪烁的像素点。
 *
 * **几个取舍**（改之前先看这段）：
 *   · **不填底色**。整层透明，让 `main` 的 `bg-ink-950` 透上来 —— 这样深浅主题自动跟着走，
 *     不用在 canvas 里再维护一份页面底色。
 *   · **不画任何具体游戏角色**（版权那关过不去）。三个都是**通用像素小人**：
 *     戴帽子的主角 / 骑士 / 外星虫，只在**配色**上和三个机种呼应。
 *   · **30fps 封顶**，`prefers-reduced-motion: reduce` 时只画一帧、完全不跑 rAF。
 *     ⚠️ 这条别省：纯装饰的一层，为它常驻一个 rAF 不值当。
 *   · **颜色从 CSS 变量读**（`--color-accent` / `--color-ink-300`），`<html data-theme>` 一变
 *     就重读重画 —— 和站里「主题真身在 data-theme 上」那套一致（见 ConsoleScene 的注释）。
 *     读不到时退回深色主题的取值，所以不会画出「透明色」。
 *   · 坐标**吸附到设备像素栅格**（`snap`）：不吸附的话 1.5x / 2x 屏上像素画会被抗锯齿糊掉。
 *
 * ⚠️ 这一层是 `aria-hidden` + `pointer-events-none` 的**纯装饰**，别往里塞内容。
 * ⚠️ 正文列的可读性（小人飘过去别碍事）由**本文件自己的淡出**负责 ——
 *    见 `CENTER_FADE` 那段注释。原来那层 `.login-scrim` 遮罩 2026-10-14 撤了
 *    （页面背景换成 `.wall` 后平色补丁对不上），别再加回来。
 */

type Family = 'nes' | 'snes' | 'arcade';

/** 16×16 网格里的一块：[x, y, w, h]，单位是「格」 */
type Cell = readonly [number, number, number, number];

/** 一个像素小人：主体 + 暗部（暗部用来点眼睛 / 面罩 / 嘴） */
interface Character {
  body: readonly Cell[];
  shade: readonly Cell[];
}

/*
 * 三个**通用**像素小人。配色抄 `components/CartridgeSprite.tsx` 的 `CONSOLE_TINT`
 * （那边没导出，而且文件头上写着「要清掉的话连 CONSOLE_TINT 一起删」，所以这里硬编码）。
 * 改配色的话两处一起改。
 */
const CHARACTERS: Record<Family, Character> = {
  /* 戴帽子的主角：帽顶 + 帽檐 + 头 + 身子 + 两条胳膊 + 两条腿 + 两只脚 */
  nes: {
    body: [
      [4, 1, 8, 2],
      [3, 3, 10, 1],
      [5, 4, 6, 4],
      [5, 8, 6, 4],
      [3, 8, 2, 4],
      [11, 8, 2, 4],
      [5, 12, 2, 3],
      [9, 12, 2, 3],
      [4, 15, 3, 1],
      [9, 15, 3, 1],
    ],
    shade: [
      [6, 5, 1, 2],
      [9, 5, 1, 2],
    ],
  },
  /* 骑士：盔缨 + 头盔 + 两块肩甲 + 身子 + 两条腿 + 两只脚 */
  snes: {
    body: [
      [7, 0, 2, 2],
      [5, 2, 6, 3],
      [3, 5, 2, 3],
      [11, 5, 2, 3],
      [5, 5, 6, 6],
      [5, 11, 2, 4],
      [9, 11, 2, 4],
      [4, 15, 3, 1],
      [9, 15, 3, 1],
    ],
    shade: [[6, 3, 4, 1]],
  },
  /* 外星虫：两根触角 + 头身 + 两条手臂 + 下腹 + 三条触手 */
  arcade: {
    body: [
      [3, 0, 2, 1],
      [4, 1, 1, 2],
      [11, 0, 2, 1],
      [11, 1, 1, 2],
      [4, 3, 8, 6],
      [2, 5, 2, 3],
      [12, 5, 2, 3],
      [5, 9, 6, 3],
      [4, 12, 1, 3],
      [7, 12, 2, 3],
      [11, 12, 1, 3],
    ],
    shade: [
      [5, 5, 2, 2],
      [9, 5, 2, 2],
      [6, 8, 4, 1],
    ],
  },
};

const TINT: Record<Family, string> = {
  nes: '#e8b339',
  snes: '#6fa8c9',
  arcade: '#c96f6f',
};

/** 把一个 `#rgb` / `#rrggbb` 压暗（暗部用）。认不出来就原样返回。 */
function darken(color: string, factor: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  let hex = m[1];
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const n = parseInt(hex, 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * 给颜色加透明度（微光的渐变用）。
 *
 * ⚠️ **认不出来就返回 `transparent`，绝不原样返回**：这是从 CSS 变量读来的颜色，
 * 万一哪天 `--color-accent` 变成 `oklch(...)` 这种不认识的写法，原样返回会让
 * 那三层渐变全部变成**不透明的琥珀**、把整屏糊住。退回透明最多是「微光没了」，
 * 不会把页面搞坏。
 */
function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return 'transparent';
  let hex = m[1];
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** 背景里飘着的一个小人 */
interface Drifter {
  family: Family;
  /** 位置 / 速度都用 CSS px（画的时候才吸附到设备像素） */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 一个「像素格」的边长 */
  unit: number;
  alpha: number;
  /** 上下摆动的相位与幅度 */
  phase: number;
  amp: number;
}

/** 闪烁的小方块 */
interface Spark {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
}

/** 一帧最多画多勤（30fps）。纯装饰，没必要跟着 60Hz 转 */
const FRAME_MS = 1000 / 30;

/*
 * 正文列中央的「留空带」（2026-10-14）。
 *
 * 原来正文可读性靠 `globals.css` 的 `.login-scrim` 遮罩兜（中间实、两侧透的一层平色）；
 * 页面背景换成 `.wall`（渐变 + 竖板缝）之后，那块平色补丁跟墙对不上 —— 表单顶上
 * 能看出一条色差边。遮罩撤了，改由 **canvas 自己**在正文列那一竖条里把
 * 小人 / 亮点淡出：
 *   · 距中线小于「正文列半宽」→ 完全不画；
 *   · 再往外 80px 线性恢复到全亮（对应原来 scrim 左右各 5rem 的渐隐区）。
 * 正文列半宽现场算：`max-w-md` 一半是 224px，但窄屏上列是 100% 宽再吃掉 `px-6`，
 * 所以取 `min(224, (视口宽 − 48) / 2)`。
 * ⚠️ 微光（`drawGlow`）**不参与**淡出 —— 它是半透明的琥珀，正文压得住，
 *    而且本来就是画给正文列背后垫气氛的。
 */
const CENTER_FADE = 80;

export default function LoginBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /* ---------------- 主题色：从 CSS 变量读，读不到就用深色那份兜底 ---------------- */
    let accent = '#e8b339';
    let sparkColor = '#9b9ba8';
    const readThemeColors = () => {
      const cs = getComputedStyle(document.documentElement);
      accent = cs.getPropertyValue('--color-accent').trim() || accent;
      sparkColor = cs.getPropertyValue('--color-ink-300').trim() || sparkColor;
    };

    /* ---------------- 尺寸 ---------------- */
    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    /**
     * 把 CSS 坐标吸附到设备像素栅格上。
     * 2x 屏上不吸附没事，1.5x 屏上 `1.5 * 整数` 会落在半个设备像素上 —— 像素画就糊了。
     */
    const snap = (v: number) => Math.round(v * dpr) / dpr;

    /* ---------------- 会动的那些 ---------------- */
    let drifters: Drifter[] = [];
    let sparks: Spark[] = [];

    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    /** 带方向的随机速度（保证不为 0，不然会有小人原地不动） */
    const signed = (min: number, max: number) =>
      Math.random() < 0.5 ? -rand(min, max) : rand(min, max);

    const seed = () => {
      const families: Family[] = ['nes', 'snes', 'arcade'];

      /*
       * 数量跟着面积走（手机 3 个、桌面 5–6 个）。
       * ⚠️ 上限 6：再多就成「满屏小人」，把表单压下去了。
       */
      const count = Math.max(3, Math.min(6, Math.round((cssW * cssH) / 260000)));

      /* x 按条带铺开（不然随机撒容易挤成一堆），每条带里再抖一下 */
      const band = (cssW + 200) / count;

      drifters = Array.from({ length: count }, (_, i) => {
        return {
          family: families[i % families.length],
          x: band * i - 100 + rand(0, band),
          y: rand(cssH * 0.06, cssH * 0.94),
          vx: signed(5, 16),
          vy: signed(2, 6),
          unit: rand(5, 9),
          alpha: rand(0.13, 0.21),
          phase: rand(0, Math.PI * 2),
          amp: rand(6, 16),
        };
      });

      /* 闪烁的小方块：密度也跟着面积，但封个顶（大屏上太多会像雪花屏） */
      const sparkCount = Math.min(90, Math.round((cssW * cssH) / 30000));
      sparks = Array.from({ length: sparkCount }, () => ({
        x: rand(0, cssW),
        y: rand(0, cssH),
        size: rand(2, 4),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.4, 1.4),
      }));
    };

    const resize = () => {
      cssW = window.innerWidth;
      cssH = window.innerHeight;
      /* DPR 封顶 2：3x 屏上再把画布放大三倍，白烧一遍像素 */
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      /* 改 canvas.width 会把上下文状态清掉，所以 transform 要重设 */
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      readThemeColors();
      seed();
    };

    /* ---------------- 画 ---------------- */

    /**
     * 横向离正文列中线多远（px）→ 这一笔画多淡。0 = 不画，1 = 正常亮度。
     * 小人传**精灵中心**（x + 8 格），亮点传方块中心。
     */
    const centerFactor = (xCenter: number): number => {
      const halfCol = Math.min(224, Math.max(cssW - 48, 0) / 2);
      const dist = Math.abs(xCenter - cssW / 2);
      return Math.min(1, Math.max(0, (dist - halfCol) / CENTER_FADE));
    };

    const paintCells = (
      cells: readonly Cell[],
      color: string,
      ox: number,
      oy: number,
      u: number,
    ) => {
      ctx.fillStyle = color;
      for (const [cx, cy, cw, ch] of cells) {
        ctx.fillRect(snap(ox + cx * u), snap(oy + cy * u), u * cw, u * ch);
      }
    };

    const drawCharacter = (d: Drifter, bob: number) => {
      const u = snap(d.unit);
      const ch = CHARACTERS[d.family];
      ctx.globalAlpha = d.alpha * centerFactor(d.x + d.unit * 8);
      paintCells(ch.body, TINT[d.family], d.x, bob, u);
      paintCells(ch.shade, darken(TINT[d.family], 0.4), d.x, bob, u);
      ctx.globalAlpha = 1;
    };

    /** 正文那一列背后的琥珀微光。位置跟着页面顶部走（表单就在上面） */
    const drawGlow = () => {
      const cx = cssW / 2;
      const cy = Math.min(cssH * 0.34, 420);
      const r = Math.max(cssW * 0.5, 380);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, withAlpha(accent, 0.09));
      g.addColorStop(0.55, withAlpha(accent, 0.03));
      g.addColorStop(1, withAlpha(accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cssW, cssH);
    };

    const drawSparks = (t: number) => {
      ctx.fillStyle = sparkColor;
      for (const s of sparks) {
        /* 0.06–0.22 之间呼吸：太亮会像噪点，太暗就等于没有。
         * 再乘正文列的淡出系数 —— 亮点别飘进表单背后捣乱 */
        ctx.globalAlpha =
          (0.06 + 0.16 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase))) *
          centerFactor(s.x + s.size / 2);
        ctx.fillRect(snap(s.x), snap(s.y), snap(s.size), snap(s.size));
      }
      ctx.globalAlpha = 1;
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, cssW, cssH);
      drawGlow();
      for (const d of drifters) {
        drawCharacter(d, d.y + Math.sin(t * 0.6 + d.phase) * d.amp);
      }
      drawSparks(t);
    };

    const step = (dt: number) => {
      for (const d of drifters) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        /* 飘出屏幕就绕到对面。留一个「整个小人」的余量，别让它半截消失 */
        const margin = d.unit * 20;
        if (d.x < -margin) d.x = cssW + margin;
        else if (d.x > cssW + margin) d.x = -margin;
        if (d.y < -margin) d.y = cssH + margin;
        else if (d.y > cssH + margin) d.y = -margin;
      }
    };

    /* ---------------- 循环 / 生命周期 ---------------- */
    let raf = 0;
    let last = 0;
    let t = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      const dt = last === 0 ? 0 : Math.min((now - last) / 1000, 0.12);
      last = now;
      t += dt;
      step(dt);
      draw(t);
    };

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    resize();
    if (reduceMotion.matches) {
      /* 只画一帧：静态版（小人停在各自位置，微光和闪烁也定格） */
      draw(0);
    } else {
      raf = requestAnimationFrame(tick);
    }

    /*
     * 主题一变就重读颜色。`data-theme` 是主题的唯一真相（首屏脚本写的，
     * 见 app/layout.tsx 的 BOOT_INIT）—— 这里只跟着它走，不自己判主题。
     */
    const themeObserver = new MutationObserver(() => {
      readThemeColors();
      if (reduceMotion.matches) draw(t);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    const onResize = () => {
      resize();
      if (reduceMotion.matches) draw(t);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      themeObserver.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
