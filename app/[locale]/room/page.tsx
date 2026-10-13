import type { Metadata } from 'next';
import ConsoleScene from '@/components/ConsoleScene';
import {
  SITE_NAME,
  alternatesFor,
  localePath,
  ogLocale,
  otherLocale,
  translate,
} from '@/lib/i18n';
import { readLocaleParam } from '@/lib/server/locale';

/**
 * `/room` —— 那间像素小屋（2026-10-13 从 `/` 挪过来的；路由名先是 `/play`，同日改成 `/room`）。
 *
 * **为什么挪**：`/` 换成了落地页（`app/[locale]/page.tsx`：Hero + 按机种 / 开发商浏览 +
 * FAQ）。原来 `/` 既是「站点的门面」又是「玩游戏的屋子」，两个身份各自要的东西是冲突的 ——
 * 门面要一页能被搜索引擎整段读走的正文，屋子要满屏 CSS 场景 + canvas。
 * 拆开之后各归各位：`/` 负责「让人找到并看懂」，`/room` 负责「真的开玩」。
 *
 * ⚠️ **旧地址 `/` 上的 `?id=` / `?room=` 深链会落到首页**（详情页那颗「开始游戏」、
 * 联机分享出去的房间链接都是这个形态）。所以首页那边有一条**参数透传的重定向**：
 * 带这两个参数访问 `/` 会被 307 到 `/room?...` —— 分享出去的链接不该因为这次拆分失效。
 * 那条重定向在 `app/[locale]/page.tsx` 里，改这里时别把它忘了。
 *
 * **这一页只做一件事**：渲染 `ConsoleScene`（客户端组件，`?id=` / `?room=` 的解析、
 * 联机、存档、键位全在它自己里）。服务端这一侧只负责语言与 meta。
 *
 * ⚠️ **不写 `export const dynamic`**：它要读语言（cookie / 请求头），本来就是动态渲染。
 */
export async function generateMetadata({
  params: routeParams,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = await readLocaleParam(routeParams);
  /* 标题里没有站名 —— 根布局的 `title.template` 会补上「· 站名」，见 lib/i18n.ts 那条注释 */
  const title = translate(locale, 'seo.room.title');
  const description = translate(locale, 'seo.room.description');

  return {
    title,
    description,
    /*
     * 屋子有自己的 canonical（`/room` / `/zh/room`）—— 少了这一行，它会顶着根布局那份
     * `/` 的 canonical，在搜索引擎眼里就成了首页的重复内容（`alternates` 是整体覆盖，
     * 见 lib/i18n.ts 的 `alternatesFor`）。
     */
    alternates: alternatesFor(locale, '/room'),
    openGraph: {
      type: 'website',
      url: localePath(locale, '/room'),
      siteName: SITE_NAME[locale],
      title,
      description,
      locale: ogLocale(locale),
      alternateLocale: ogLocale(otherLocale(locale)),
    },
  };
}

export default function RoomPage() {
  return <ConsoleScene />;
}
