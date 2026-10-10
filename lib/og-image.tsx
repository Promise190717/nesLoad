import { ImageResponse } from 'next/og';
import { SITE_NAME } from './i18n';

/*
 * 社交卡片图（og:image / twitter:image）的画法。
 *
 * 放在 lib/ 而不是直接写在 app/opengraph-image.tsx 里：og 和 twitter 两张图**必须是同一张**，
 * 而 Next 的文件约定要求两边各有一个文件（app/opengraph-image.* 与 app/twitter-image.*）。
 * 把画法抽到这里，两个约定文件各自只是「声明元信息 + 调一次 render」，改版式只用改一处。
 *
 * ── 几个刻意的决定 ─────────────────────────────────────────────
 *
 * **1. 不用那个像素字体（Press Start 2P）。** 全站的像素感靠它，这里却刻意放弃：
 *    字体只在运行时从 Google Fonts 的 <link> 拿到（见 layout.tsx 的注释），而 OG 图是
 *    服务端用 Satori 渲染的，拿不到页面上的 CSS 字体；要走就得当场 fetch 一个 .ttf 再喂给
 *    ImageResponse —— 那等于给「生成分享图」这件事绑上一个外部网络依赖，
 *    对方一慢一挂，分享卡片就变成 500。这里改用**系统默认无衬线体 + 全大写 + 拉开字距**
 *    来凑那种电子感，加上下面那些方块装饰，观感够用而永不失败。
 *
 * **2. 图上一律英文。** 和屏幕提示同一个原因：默认字体没有汉字，中文会渲染成豆腐块。
 *    alt 文本倒是跟着语言走（在 layout 的 metadata 里给的），读屏用户不吃这个亏。
 *    站名也因此取 `SITE_NAME.en`（「复古游戏屋」写成 Retro Game House）——
 *    中文名直接画上去就是一排方框。
 *
 * **3. 尺寸写死 1200×630。** 这是 Facebook / X / LinkedIn / Slack 的共同推荐尺寸（1.91:1），
 *    小于 600px 宽的图在部分平台会被降级成小卡片，宁大勿小。
 *
 * **4. 配色抄 globals.css 的深色主题令牌**（ink-950 / 800 / 700 + accent）。
 *    分享卡片几乎总在别人的信息流里以深色底呈现，所以固定用深色版，不跟随访问者的主题。
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

/**
 * 图片的替代文本（读屏与加载失败时显示）。
 *
 * ⚠️ **只能是一句写死的英文**，别想着把它接进 i18n：Next 的文件约定要求
 * `opengraph-image.tsx` 的 `alt` 是个静态导出，它不接收请求、也就拿不到当前语言。
 * （所以 lib/i18n.ts 里**故意没有** meta.ogAlt 这个键 —— 写了也没人会读。）
 * 真的需要按语言给 alt，就得放弃文件约定、改在 metadata 里手写 openGraph.images，
 * 那样又会和文件约定生成的 og:image 重复出两条，不划算。
 */
export const OG_ALT = `A pixel-art CRT television in a dim room, with the ${SITE_NAME.en} wordmark glowing on its screen.`;

/* 深色主题令牌，和 app/globals.css 的 @theme 段一一对应 */
const INK_950 = '#08080a';
const INK_900 = '#0d0d10';
const INK_800 = '#17171c';
const INK_700 = '#23232a';
const INK_300 = '#9b9ba8';
const ACCENT = '#e8b339';
const SCREEN_BLACK = '#050506';

/** 顶沿那条散热缝：六个小方块，和机身上画的是同一组。 */
const VENT_SLITS = [0, 1, 2, 3, 4, 5];
/** 屏幕里的机型标签 */
const TAGS = ['NES', 'SNES / SFC', 'ARCADE'];

export function renderOgImage(): ImageResponse {
  return new ImageResponse(
    (
      /* 最外层：整块房间底色，四周留白 —— 卡片被裁切时也不会切到机身 */
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: INK_950,
          padding: 56,
        }}
      >
        {/* 机身 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            backgroundColor: INK_800,
            border: `6px solid ${INK_700}`,
          }}
        >
          {/* 机身顶沿（散热缝 + 右上角的版本位） */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: 44,
              padding: '0 22px',
              backgroundColor: '#121216',
              borderBottom: `4px solid ${INK_700}`,
            }}
          >
            <div style={{ display: 'flex', gap: 7 }}>
              {VENT_SLITS.map((i) => (
                <div
                  key={i}
                  style={{ width: 10, height: 6, backgroundColor: '#000', opacity: 0.75 }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', color: '#4a4a55', fontSize: 14, letterSpacing: 3 }}>
              {SITE_NAME.en.toUpperCase()}
            </div>
          </div>

          {/* 屏幕 */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              justifyContent: 'center',
              backgroundColor: SCREEN_BLACK,
              border: `10px solid ${INK_900}`,
              padding: '44px 56px',
            }}
          >
            <div
              style={{
                display: 'flex',
                color: ACCENT,
                fontSize: 20,
                letterSpacing: 8,
                marginBottom: 18,
              }}
            >
              PLAY RETRO GAMES IN YOUR BROWSER
            </div>

            {/*
              站名。letterSpacing 拉得很开是「电子感」的主要来源。
              字号 76 是量出来的：屏幕内宽约 852px，而 "Retro Game House" 有 16 个字符，
              按默认字体的平均字宽（约 0.52em）加上 4px 字距，
              再大就会顶破机身边框 —— 站名一旦变长（或改成别家名字）记得回来核一下。
            */}
            <div
              style={{
                display: 'flex',
                color: '#ffffff',
                fontSize: 76,
                fontWeight: 700,
                letterSpacing: 4,
                lineHeight: 1,
                marginBottom: 22,
              }}
            >
              {SITE_NAME.en}
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 26 }}>
              {TAGS.map((tag) => (
                <div
                  key={tag}
                  style={{
                    display: 'flex',
                    color: '#ffffff',
                    fontSize: 18,
                    letterSpacing: 3,
                    padding: '8px 16px',
                    backgroundColor: '#23232a',
                    border: '3px solid #4a4a55',
                  }}
                >
                  {tag}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', color: INK_300, fontSize: 20, letterSpacing: 2 }}>
              Online game library · or drop your own ROM file
            </div>
          </div>

          {/* 前面板：一行假按钮，暗示这排按钮是真的可点 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              justifyContent: 'flex-end',
              padding: '16px 22px',
              backgroundColor: INK_700,
            }}
          >
            {['PAUSE', 'SAVE', 'LOAD', 'RESET', 'EJECT'].map((label) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  color: '#ececf1',
                  fontSize: 14,
                  letterSpacing: 1,
                  padding: '6px 0',
                  width: 88,
                  backgroundColor: '#33333c',
                  border: '3px solid #4a4a55',
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    OG_SIZE
  );
}
