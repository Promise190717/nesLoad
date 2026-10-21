import type { MetadataRoute } from 'next';
import { SITE_NAME, translate } from '@/lib/i18n';

/**
 * /manifest.webmanifest —— PWA 的应用清单（可安装性的一半，另一半是 public/sw.js）。
 *
 * Next 的文件约定：放在这里就会生成 `/manifest.webmanifest`，**并且自动往 <head> 里
 * 插一条 `<link rel="manifest">`** —— 所以 app/layout.tsx 的 metadata 里不要再手写
 * `manifest` 字段，两处都写只会打架（和 og:image 那条规矩一样）。
 *
 * ---------------------------------------------------------------------------
 * 几个刻意的取舍
 *
 * **`name` / `short_name` 只有英文，不跟语言走。** 界面语言 2026-10-13 起分在路径上
 * （英文无前缀、中文 `/zh`），但 manifest 仍然是**一个静态文件**：
 * 浏览器在安装时抓一次、之后长期缓存，切语言也不会重抓。
 * 想让它跟语言走就得把 manifest 变成动态路由（读 cookie），而「浏览器抓 manifest 时
 * 到底带不带 cookie」在各家实现里并不一致 —— 换来的收益（主屏图标下面那几个字）
 * 完全撑不起这个不确定性。选英文是因为 PWA 的安装界面、系统应用列表本来就是英文语境，
 * 写中文只会让英文用户看不懂；`lang: 'en'` 把这个选择明说出来。
 * 站名仍然从 `SITE_NAME` 取，改名只动一处。
 *
 * **`display: 'standalone'` 而不是 `'fullscreen'`。** 这是一个游戏站，
 * 全屏听起来更沉浸，但全屏会把系统状态栏一起吃掉 —— 手机上想退出应用得靠手势，
 * 桌面端连窗口按钮都没有。standalone（独立窗口、没有浏览器地址栏）已经足够「像个应用」。
 *
 * **`orientation` 刻意不写**（= `any`）。手机端画的是**竖着的掌机**（屏幕在上、按键在下），
 * 桌面端是一间横着铺开的屋子 —— 两者对方向的需求正好相反，锁死任何一个都会让另一半难受。
 * 交给用户自己转。
 *
 * **`theme_color` / `background_color` 取深色主题的底色**（`--color-ink-950` 的深色值）。
 * 这两个值只影响安装后的窗口边框色和启动画面底色，都是静态的 —— 浅色主题的用户会看到
 * 深色启动底，可接受（启动画面一闪而过，而深色底和图标本身是一套的）。
 * `<meta name="theme-color">` 那两条**跟着系统主题走**，在 app/layout.tsx 的 viewport 里。
 *
 * **没有 `screenshots`。** 那个字段是给应用商店（Chrome Web Store / Play）的详情页用的，
 * 本站不上架，写了只是多几个文件要维护。
 *
 * **图标**：192 / 512 各一张（`purpose: 'any'`）+ 一张 512 的 maskable。
 * 生成方式见 `scripts/generate-icons.mjs`（从 app/icon.svg 的 16×16 像素画整数倍放大）。
 * iOS 的 180×180 主屏图标不走这里，走文件约定 `app/apple-icon.png`。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME.en,
    short_name: SITE_NAME.en,
    description: translate('en', 'meta.description', { site: SITE_NAME.en }),
    lang: 'en',
    /*
     * `start_url` 写**无前缀**的 `/` 而不是 `/zh`：装上之后从哪儿进来，由 middleware
     * 现判 —— **只有用户主动设置过语言（cookie）才会被送去 `/zh`**，没设置过就是英文
     * （然后客户端弹一句问，见 components/LocalePrompt.tsx）。
     * 写死任何一种语言都会把另一半用户锁在错的那份上。
     */
    start_url: '/',
    /* scope 是 `/` 而不是默认值：/zh、/privacy、/terms 都在应用里，不该跳出去用浏览器打开 */
    scope: '/',
    display: 'standalone',
    background_color: '#08080a',
    theme_color: '#08080a',
    /* 给系统的分类提示（应用列表 / 商店会用），不是给搜索引擎的 */
    categories: ['games', 'entertainment'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        /*
         * maskable 必须单独一张：系统会把它裁成任意形状（圆 / 方 / 水滴），
         * 内容要收在中心 80% 的安全区里 —— 按 any 那张的比例（占 75%）直接当 maskable 用，
         * 方形的四个角会顶到安全圆外面被切掉。所以这张的图案缩小到 60%。
         */
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
